# Orders Router - Handles all order-related endpoints
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from pymongo import ReturnDocument
import uuid

router = APIRouter(tags=["orders"])

# Database reference - will be set from main app
db = None

# KDS notification function (will be imported)
_notify_kds = None

def set_db(database):
    global db
    db = database

def set_kds_notifier(notifier_func):
    """Set the KDS notification function"""
    global _notify_kds
    _notify_kds = notifier_func

def notify_kds_update():
    """Notify KDS clients of order updates"""
    if _notify_kds:
        _notify_kds()

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

async def get_next_transaction_number() -> int:
    """
    Genera el siguiente número de transacción interno secuencial.
    Usa find_one_and_update con upsert para garantizar atomicidad.
    """
    result = await db.counters.find_one_and_update(
        {"_id": "internal_transaction"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER
    )
    return result["seq"]

# ─── PYDANTIC MODELS ───
class OrderItemInput(BaseModel):
    product_id: str
    product_name: str
    quantity: float = 1
    unit_price: float
    modifiers: List[dict] = []
    notes: str = ""

class CreateOrderInput(BaseModel):
    table_id: str
    items: List[OrderItemInput] = []

class AddItemsInput(BaseModel):
    items: List[OrderItemInput]

class CancelItemInput(BaseModel):
    reason_id: str
    return_to_inventory: bool = False
    comments: str = ""
    authorized_by_id: Optional[str] = None
    authorized_by_name: Optional[str] = None

class BulkCancelInput(BaseModel):
    item_ids: List[str]
    reason_id: Optional[str] = None  # Optional for express void
    return_to_inventory: bool = False
    comments: str = ""
    authorized_by_id: Optional[str] = None
    authorized_by_name: Optional[str] = None
    express_void: bool = False  # Flag for express void (pending items only)

# Import auth dependency
from routers.auth import get_current_user, can_access_table_orders, get_table_owner_name

# Import inventory functions
from routers.inventory import explode_and_deduct_recipe

# ─── HELPER: Restore inventory from recipe ───
async def restore_inventory_for_item(item: dict, warehouse_id: str, user_id: str, user_name: str, order_id: str):
    """Restore inventory for a cancelled item using recipe explosion logic"""
    recipe = await db.recipes.find_one({"product_id": item["product_id"]}, {"_id": 0})
    if not recipe:
        return
    
    quantity = item.get("quantity", 1)
    
    for recipe_ing in recipe.get("ingredients", []):
        ing_id = recipe_ing.get("ingredient_id")
        required_qty = recipe_ing.get("quantity", 0)
        waste_pct = recipe_ing.get("waste_percentage", 0)
        
        if not ing_id or required_qty <= 0:
            continue
        
        ingredient = await db.ingredients.find_one({"id": ing_id}, {"_id": 0})
        if not ingredient:
            continue
        
        restore_amount = required_qty * quantity * (1 + waste_pct / 100)
        
        await db.stock.update_one(
            {"ingredient_id": ing_id, "warehouse_id": warehouse_id},
            {"$inc": {"current_stock": restore_amount}},
            upsert=True
        )
        
        movement = {
            "id": gen_id(),
            "ingredient_id": ing_id,
            "ingredient_name": ingredient.get("name", "?"),
            "warehouse_id": warehouse_id,
            "quantity": restore_amount,
            "type": "void_restoration",
            "reason": "Item cancelled - inventory restored",
            "parent_product_id": item["product_id"],
            "order_id": order_id,
            "user_id": user_id,
            "user_name": user_name,
            "created_at": now_iso()
        }
        await db.stock_movements.insert_one(movement)

# ─── ORDERS CRUD ───
@router.get("/orders")
async def list_orders(status: Optional[str] = Query(None), table_id: Optional[str] = Query(None)):
    query = {}
    if status:
        query["status"] = status
    if table_id:
        query["table_id"] = table_id
    return await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)

@router.get("/orders/{order_id}")
async def get_order(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return order

@router.post("/orders")
async def create_order(input: CreateOrderInput, user=Depends(get_current_user)):
    existing = await db.orders.find_one(
        {"table_id": input.table_id, "status": {"$in": ["active", "sent"]}}, {"_id": 0}
    )
    if existing:
        return existing

    table = await db.tables.find_one({"id": input.table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")

    items = []
    for item in input.items:
        items.append({
            "id": gen_id(), "product_id": item.product_id, "product_name": item.product_name,
            "quantity": item.quantity, "unit_price": item.unit_price,
            "modifiers": item.modifiers, "notes": item.notes,
            "status": "pending", "sent_to_kitchen": False,
            "cancelled_reason_id": None, "return_to_inventory": False
        })

    # Generar número de transacción único al abrir la mesa/cuenta
    transaction_number = await get_next_transaction_number()
    
    order_id = gen_id()
    order = {
        "id": order_id, "table_id": input.table_id, "table_number": table["number"],
        "waiter_id": user["user_id"], "waiter_name": user["name"],
        "transaction_number": transaction_number,
        "status": "active", "items": items,
        "created_at": now_iso(), "updated_at": now_iso()
    }
    await db.orders.insert_one(order)
    await db.tables.update_one(
        {"id": input.table_id},
        {"$set": {"status": "occupied", "active_order_id": order_id}}
    )
    return {k: v for k, v in order.items() if k != "_id"}

@router.post("/orders/{order_id}/items")
async def add_items_to_order(order_id: str, input: AddItemsInput):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    existing_items = order.get("items", [])
    items_to_add = []
    items_to_update = []
    
    for item in input.items:
        existing_item = None
        for existing in existing_items:
            if (existing.get("product_id") == item.product_id and 
                existing.get("status") == "pending" and
                existing.get("notes", "") == (item.notes or "") and
                existing.get("modifiers", []) == (item.modifiers or [])):
                existing_item = existing
                break
        
        if existing_item:
            items_to_update.append({
                "item_id": existing_item["id"],
                "new_quantity": existing_item["quantity"] + item.quantity
            })
        else:
            items_to_add.append({
                "id": gen_id(), "product_id": item.product_id, "product_name": item.product_name,
                "quantity": item.quantity, "unit_price": item.unit_price,
                "modifiers": item.modifiers or [], "notes": item.notes or "",
                "status": "pending", "sent_to_kitchen": False,
                "cancelled_reason_id": None, "return_to_inventory": False
            })
    
    for update in items_to_update:
        await db.orders.update_one(
            {"id": order_id, "items.id": update["item_id"]},
            {"$set": {"items.$.quantity": update["new_quantity"], "updated_at": now_iso()}}
        )
    
    if items_to_add:
        await db.orders.update_one(
            {"id": order_id},
            {"$push": {"items": {"$each": items_to_add}}, "$set": {"updated_at": now_iso()}}
        )
    elif items_to_update:
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"updated_at": now_iso()}}
        )
    
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

@router.put("/orders/{order_id}/items/{item_id}")
async def update_order_item(order_id: str, item_id: str, input: dict):
    update_fields = {f"items.$.{k}": v for k, v in input.items()}
    update_fields["updated_at"] = now_iso()
    await db.orders.update_one(
        {"id": order_id, "items.id": item_id},
        {"$set": update_fields}
    )
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

# ─── CANCEL ITEMS ───
@router.post("/orders/{order_id}/cancel-item/{item_id}")
async def cancel_order_item(order_id: str, item_id: str, input: CancelItemInput, user: dict = Depends(get_current_user)):
    """Cancel a single order item with optional inventory restoration and audit logging"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    item = next((i for i in order["items"] if i["id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    
    reason = await db.cancellation_reasons.find_one({"id": input.reason_id}, {"_id": 0})
    reason_name = reason.get("name", "Sin razón") if reason else "Sin razón"
    requires_manager = reason.get("requires_manager_auth", False) if reason else False
    
    if requires_manager and not input.authorized_by_id:
        raise HTTPException(status_code=403, detail="Esta anulación requiere autorización de gerente")
    
    await db.orders.update_one(
        {"id": order_id, "items.id": item_id},
        {"$set": {
            "items.$.status": "cancelled",
            "items.$.cancelled_reason_id": input.reason_id,
            "items.$.return_to_inventory": input.return_to_inventory,
            "items.$.cancelled_comments": input.comments,
            "items.$.cancelled_at": now_iso(),
            "items.$.cancelled_by_id": user["user_id"],
            "items.$.cancelled_by_name": user["name"],
            "items.$.authorized_by_id": input.authorized_by_id,
            "items.$.authorized_by_name": input.authorized_by_name,
            "updated_at": now_iso()
        }}
    )
    
    item_was_sent = item.get("status") == "sent" or item.get("sent_to_kitchen", False)
    inventory_was_deducted = item.get("inventory_deducted", False) or item_was_sent
    
    if input.return_to_inventory and inventory_was_deducted:
        inventory_config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
        default_warehouse = inventory_config.get("default_warehouse_id", "") if inventory_config else ""
        if not default_warehouse:
            wh = await db.warehouses.find_one({}, {"_id": 0})
            default_warehouse = wh["id"] if wh else ""
        
        if default_warehouse:
            await restore_inventory_for_item(
                item=item,
                warehouse_id=default_warehouse,
                user_id=user["user_id"],
                user_name=user["name"],
                order_id=order_id
            )
    
    audit_log = {
        "id": gen_id(),
        "order_id": order_id,
        "item_id": item_id,
        "item_ids": [item_id],
        "product_id": item.get("product_id"),
        "product_name": item.get("product_name", "?"),
        "quantity": item.get("quantity", 1),
        "unit_price": item.get("unit_price", 0),
        "total_value": item.get("unit_price", 0) * item.get("quantity", 1),
        "requested_by_id": user["user_id"],
        "requested_by_name": user["name"],
        "authorized_by_id": input.authorized_by_id,
        "authorized_by_name": input.authorized_by_name,
        "required_manager_auth": requires_manager,
        "reason_id": input.reason_id,
        "reason": reason_name,
        "restored_to_inventory": input.return_to_inventory and inventory_was_deducted,
        "was_inventory_deducted": inventory_was_deducted,
        "comments": input.comments,
        "void_type": "single_item",
        "created_at": now_iso()
    }
    await db.void_audit_logs.insert_one(audit_log)
    
    if not input.return_to_inventory and inventory_was_deducted:
        recipe = await db.recipes.find_one({"product_id": item["product_id"]}, {"_id": 0})
        if recipe:
            inventory_config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
            default_warehouse = inventory_config.get("default_warehouse_id", "") if inventory_config else ""
            if not default_warehouse:
                wh = await db.warehouses.find_one({}, {"_id": 0})
                default_warehouse = wh["id"] if wh else ""
            
            if default_warehouse:
                for recipe_ing in recipe.get("ingredients", []):
                    ing_id = recipe_ing.get("ingredient_id")
                    required_qty = recipe_ing.get("quantity", 0)
                    if not ing_id or required_qty <= 0:
                        continue
                    ingredient = await db.ingredients.find_one({"id": ing_id}, {"_id": 0})
                    if not ingredient:
                        continue
                    waste_amount = required_qty * item.get("quantity", 1)
                    movement = {
                        "id": gen_id(),
                        "ingredient_id": ing_id,
                        "ingredient_name": ingredient.get("name", "?"),
                        "warehouse_id": default_warehouse,
                        "quantity": -waste_amount,
                        "type": "waste",
                        "reason": f"Anulación: {reason_name}",
                        "parent_product_id": item["product_id"],
                        "order_id": order_id,
                        "user_id": user["user_id"],
                        "user_name": user["name"],
                        "created_at": now_iso()
                    }
                    await db.stock_movements.insert_one(movement)
    
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

@router.post("/orders/{order_id}/cancel-items")
async def cancel_multiple_items(order_id: str, input: BulkCancelInput, user: dict = Depends(get_current_user)):
    """Cancel multiple order items at once.
    
    EXPRESS VOID: For pending items (not sent to kitchen) - no reason, no auth, no inventory impact.
    AUDIT PROTOCOL: For sent items - requires reason, may require manager auth, affects inventory.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    # Check if this is an express void (pending items only)
    if input.express_void:
        # Verify ALL items are pending (not sent to kitchen)
        for item_id in input.item_ids:
            item = next((i for i in order["items"] if i["id"] == item_id), None)
            if item and (item.get("status") == "sent" or item.get("sent_to_kitchen", False)):
                raise HTTPException(
                    status_code=400, 
                    detail="Anulación Express solo permitida para items pendientes. Use protocolo de auditoría."
                )
        
        # Express void: Direct deletion without audit log or inventory impact
        for item_id in input.item_ids:
            await db.orders.update_one(
                {"id": order_id, "items.id": item_id},
                {"$set": {
                    "items.$.status": "cancelled",
                    "items.$.cancelled_reason_id": None,
                    "items.$.return_to_inventory": False,
                    "items.$.cancelled_comments": input.comments or "Anulación Express",
                    "items.$.cancelled_at": now_iso(),
                    "items.$.cancelled_by_id": user["user_id"],
                    "items.$.cancelled_by_name": user["name"],
                    "items.$.express_void": True
                }}
            )
        
        # Return updated order (no audit log for express void)
        return await db.orders.find_one({"id": order_id}, {"_id": 0})
    
    # AUDIT PROTOCOL: Standard cancellation with reason and possible auth
    reason = await db.cancellation_reasons.find_one({"id": input.reason_id}, {"_id": 0}) if input.reason_id else None
    reason_name = reason.get("name", "Sin razón") if reason else "Sin razón"
    requires_manager = reason.get("requires_manager_auth", False) if reason else False
    
    if requires_manager and not input.authorized_by_id:
        raise HTTPException(status_code=403, detail="Esta anulación requiere autorización de gerente")
    
    items_cancelled = []
    total_value = 0
    
    for item_id in input.item_ids:
        item = next((i for i in order["items"] if i["id"] == item_id), None)
        if not item:
            continue
        
        await db.orders.update_one(
            {"id": order_id, "items.id": item_id},
            {"$set": {
                "items.$.status": "cancelled",
                "items.$.cancelled_reason_id": input.reason_id,
                "items.$.return_to_inventory": input.return_to_inventory,
                "items.$.cancelled_comments": input.comments,
                "items.$.cancelled_at": now_iso(),
                "items.$.cancelled_by_id": user["user_id"],
                "items.$.cancelled_by_name": user["name"],
                "items.$.authorized_by_id": input.authorized_by_id,
                "items.$.authorized_by_name": input.authorized_by_name
            }}
        )
        
        items_cancelled.append({
            "id": item_id,
            "product_name": item.get("product_name", "?"),
            "quantity": item.get("quantity", 1),
            "unit_price": item.get("unit_price", 0)
        })
        total_value += item.get("unit_price", 0) * item.get("quantity", 1)
        
        item_was_sent = item.get("status") == "sent" or item.get("sent_to_kitchen", False)
        inventory_was_deducted = item.get("inventory_deducted", False) or item_was_sent
        
        if inventory_was_deducted:
            inventory_config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
            default_warehouse = inventory_config.get("default_warehouse_id", "") if inventory_config else ""
            if not default_warehouse:
                wh = await db.warehouses.find_one({}, {"_id": 0})
                default_warehouse = wh["id"] if wh else ""
            
            if default_warehouse:
                if input.return_to_inventory:
                    await restore_inventory_for_item(
                        item=item,
                        warehouse_id=default_warehouse,
                        user_id=user["user_id"],
                        user_name=user["name"],
                        order_id=order_id
                    )
                else:
                    recipe = await db.recipes.find_one({"product_id": item["product_id"]}, {"_id": 0})
                    if recipe:
                        for recipe_ing in recipe.get("ingredients", []):
                            ing_id = recipe_ing.get("ingredient_id")
                            required_qty = recipe_ing.get("quantity", 0)
                            if not ing_id or required_qty <= 0:
                                continue
                            ingredient = await db.ingredients.find_one({"id": ing_id}, {"_id": 0})
                            if not ingredient:
                                continue
                            waste_amount = required_qty * item.get("quantity", 1)
                            movement = {
                                "id": gen_id(),
                                "ingredient_id": ing_id,
                                "ingredient_name": ingredient.get("name", "?"),
                                "warehouse_id": default_warehouse,
                                "quantity": -waste_amount,
                                "type": "waste",
                                "reason": f"Anulación múltiple: {reason_name}",
                                "parent_product_id": item["product_id"],
                                "order_id": order_id,
                                "user_id": user["user_id"],
                                "user_name": user["name"],
                                "created_at": now_iso()
                            }
                            await db.stock_movements.insert_one(movement)
    
    await db.orders.update_one({"id": order_id}, {"$set": {"updated_at": now_iso()}})
    
    audit_log = {
        "id": gen_id(),
        "order_id": order_id,
        "item_id": None,
        "item_ids": input.item_ids,
        "items_cancelled": items_cancelled,
        "total_value": total_value,
        "requested_by_id": user["user_id"],
        "requested_by_name": user["name"],
        "authorized_by_id": input.authorized_by_id,
        "authorized_by_name": input.authorized_by_name,
        "required_manager_auth": requires_manager,
        "reason_id": input.reason_id,
        "reason": reason_name,
        "restored_to_inventory": input.return_to_inventory,
        "comments": input.comments,
        "void_type": "multiple_items",
        "created_at": now_iso()
    }
    await db.void_audit_logs.insert_one(audit_log)
    
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

# ─── VOID AUDIT LOGS ───
@router.get("/void-audit-logs")
async def list_void_audit_logs(
    order_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(100)
):
    query = {}
    if order_id:
        query["order_id"] = order_id
    if user_id:
        query["user_id"] = user_id
    if from_date:
        query["created_at"] = {"$gte": from_date}
    if to_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = to_date
        else:
            query["created_at"] = {"$lte": to_date}
    
    logs = await db.void_audit_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs

@router.get("/void-audit-logs/report")
async def get_void_report(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    period: Optional[str] = Query(None)
):
    now = datetime.utcnow()
    if period == 'day':
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat() + "Z"
    elif period == 'week':
        start_date = (now - timedelta(days=7)).isoformat() + "Z"
    elif period == 'month':
        start_date = (now - timedelta(days=30)).isoformat() + "Z"
    else:
        start_date = from_date
    
    query = {}
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if to_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = to_date
        else:
            query["created_at"] = {"$lte": to_date}
    
    logs = await db.void_audit_logs.find(query, {"_id": 0}).to_list(1000)
    
    total_voided = 0
    recovered_value = 0
    loss_value = 0
    reason_counts = {}
    user_counts = {}
    
    for log in logs:
        value = log.get("total_value", 0)
        if not value and log.get("unit_price"):
            value = log.get("unit_price", 0) * log.get("quantity", 1)
        
        total_voided += value
        
        if log.get("restored_to_inventory"):
            recovered_value += value
        else:
            loss_value += value
        
        reason = log.get("reason", "Sin razón")
        reason_counts[reason] = reason_counts.get(reason, 0) + 1
        
        user_id = log.get("requested_by_id") or log.get("user_id")
        user_name = log.get("requested_by_name") or log.get("user_name", "Desconocido")
        if user_id:
            if user_id not in user_counts:
                user_counts[user_id] = {
                    "user_id": user_id,
                    "user_name": user_name,
                    "count": 0,
                    "total_value": 0,
                    "recovered": 0,
                    "loss": 0
                }
            user_counts[user_id]["count"] += 1
            user_counts[user_id]["total_value"] += value
            if log.get("restored_to_inventory"):
                user_counts[user_id]["recovered"] += value
            else:
                user_counts[user_id]["loss"] += value
    
    reason_ranking = [{"reason": r, "count": c} for r, c in reason_counts.items()]
    reason_ranking.sort(key=lambda x: x["count"], reverse=True)
    
    user_audit = list(user_counts.values())
    user_audit.sort(key=lambda x: x["count"], reverse=True)
    
    return {
        "summary": {
            "total_voided": round(total_voided, 2),
            "recovered_value": round(recovered_value, 2),
            "loss_value": round(loss_value, 2),
            "total_count": len(logs),
            "period": period or "custom"
        },
        "reason_ranking": reason_ranking,
        "user_audit": user_audit,
        "logs": logs[:100]
    }

# ─── SEND TO KITCHEN ───
@router.post("/orders/{order_id}/send-kitchen")
async def send_to_kitchen(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    pending_items = [i for i in order["items"] if i["status"] == "pending"]
    pending_ids = [i["id"] for i in pending_items]
    
    for pid in pending_ids:
        await db.orders.update_one(
            {"id": order_id, "items.id": pid},
            {"$set": {
                "items.$.status": "sent", 
                "items.$.sent_to_kitchen": True,
                "items.$.sent_at": now_iso(),
                "items.$.inventory_deducted": False
            }}
        )
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "sent", "updated_at": now_iso()}})
    
    inventory_config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
    auto_deduct = inventory_config.get("auto_deduct_on_payment", True) if inventory_config else True
    
    if auto_deduct and pending_items:
        default_warehouse = inventory_config.get("default_warehouse_id", "") if inventory_config else ""
        if not default_warehouse:
            wh = await db.warehouses.find_one({}, {"_id": 0})
            default_warehouse = wh["id"] if wh else ""
        
        if default_warehouse:
            deduction_errors = []
            for item in pending_items:
                try:
                    recipe = await db.recipes.find_one({"product_id": item["product_id"]}, {"_id": 0})
                    if recipe:
                        await explode_and_deduct_recipe(
                            recipe=recipe,
                            warehouse_id=default_warehouse,
                            quantity=item.get("quantity", 1),
                            user_id=user["user_id"],
                            user_name=user["name"],
                            parent_product_id=item["product_id"],
                            order_id=order_id
                        )
                        await db.orders.update_one(
                            {"id": order_id, "items.id": item["id"]},
                            {"$set": {"items.$.inventory_deducted": True}}
                        )
                except Exception as e:
                    deduction_errors.append(f"{item.get('product_name', '?')}: {str(e)}")
            
            if deduction_errors:
                await db.orders.update_one({"id": order_id}, {"$set": {
                    "inventory_deduction_errors": deduction_errors,
                    "inventory_deducted_at": now_iso()
                }})
    
    # Notify KDS clients of new order
    notify_kds_update()
    
    # ═══════════════════════════════════════════════════════════════════════════════
    # AUTO-PRINT COMANDA: Send to print queue automatically
    # ═══════════════════════════════════════════════════════════════════════════════
    if pending_items:
        try:
            await send_comanda_to_print_queue(order_id, pending_items)
        except Exception as e:
            # Don't fail the whole operation if printing fails
            print(f"Error enviando comanda a impresora: {e}")
    
    return await db.orders.find_one({"id": order_id}, {"_id": 0})


async def send_comanda_to_print_queue(order_id: str, items_to_print: list):
    """Helper function to send comanda to print queue"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        return
    
    # Usar el transaction_number de la orden (generado al crear la cuenta)
    # Si no existe (órdenes antiguas), generar uno y guardarlo
    transaction_number = order.get("transaction_number")
    if not transaction_number:
        transaction_number = await get_next_transaction_number()
        await db.orders.update_one({"id": order_id}, {"$set": {"transaction_number": transaction_number}})
    
    # Get channels and category mappings
    channels = await db.print_channels.find({"active": True}, {"_id": 0}).to_list(20)
    category_mappings = await db.category_channels.find({}, {"_id": 0}).to_list(100)
    cat_to_channel = {m["category_id"]: m["channel_code"] for m in category_mappings}
    
    # Get products for print_channels
    products = await db.products.find({}, {"_id": 0, "id": 1, "name": 1, "category_id": 1, "print_channels": 1}).to_list(500)
    prod_map = {p["id"]: p for p in products}
    
    # Group items by channel
    items_by_channel = {}
    for item in items_to_print:
        prod_id = item.get("product_id", "")
        product = prod_map.get(prod_id, {})
        
        product_channels = product.get("print_channels", [])
        if product_channels and len(product_channels) > 0:
            target_channels = product_channels
        else:
            cat_id = product.get("category_id", "")
            channel_code = cat_to_channel.get(cat_id, "kitchen")
            target_channels = [channel_code]
        
        for channel_code in target_channels:
            if channel_code == "receipt":
                continue
            if channel_code not in items_by_channel:
                items_by_channel[channel_code] = []
            items_by_channel[channel_code].append({
                **item,
                "product_name": item.get("product_name") or product.get("name", "?")
            })
    
    # Create print jobs for each channel
    for channel_code, items in items_by_channel.items():
        if not items:
            continue
        
        channel = next((c for c in channels if c.get("code") == channel_code), None)
        printer_name = channel.get("printer_name", "") if channel else ""
        printer_target = channel.get("target", "usb") if channel else "usb"
        printer_ip = channel.get("ip", "") if channel else ""
        channel_name = channel.get("name", channel_code.title()) if channel else channel_code.title()
        
        comanda_data = {
            "type": "comanda",
            "paper_width": 80,
            "channel_name": channel_name,
            "table_number": order.get("table_number", "?"),
            "waiter_name": order.get("waiter_name", ""),
            "order_number": order.get("id", "")[:8],
            "transaction_number": transaction_number,
            "date": now_iso()[:19].replace("T", " "),
            "items_count": len(items),
            "items": [
                {
                    "name": item.get("product_name", ""),
                    "quantity": item.get("quantity", 1),
                    "modifiers": [m.get("name", "") for m in item.get("modifiers", [])],
                    "notes": item.get("notes", "")
                }
                for item in items
            ]
        }
        
        job = {
            "id": str(uuid.uuid4()),
            "type": "comanda",
            "channel": channel_code,
            "printer_name": printer_name,
            "printer_target": printer_target,
            "printer_ip": printer_ip,
            "data": comanda_data,
            "status": "pending",
            "created_at": now_iso()
        }
        await db.print_queue.insert_one(job)

# ─── TABLE ORDERS (Multiple accounts per table) ───
@router.get("/tables/{table_id}/orders")
async def get_table_orders(table_id: str, user: dict = Depends(get_current_user)):
    """Get all active orders for a table (multiple accounts support)"""
    orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0}
    ).sort("account_number", 1).to_list(50)
    
    if orders and not can_access_table_orders(user, orders):
        owner_name = get_table_owner_name(orders)
        raise HTTPException(
            status_code=403, 
            detail=f"Esta mesa está siendo atendida por {owner_name}"
        )
    
    return orders

@router.post("/tables/{table_id}/new-account")
async def create_new_account_on_table(table_id: str, input: dict = None, user: dict = Depends(get_current_user)):
    """Create a new empty account (order) on a table"""
    if input is None:
        input = {}
    
    account_label = input.get("label", "")
    
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    
    existing_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0, "account_number": 1}
    ).to_list(50)
    
    max_account = 0
    for o in existing_orders:
        acc = o.get("account_number", 1)
        if acc > max_account:
            max_account = acc
    
    new_account_number = max_account + 1
    order_id = gen_id()
    
    # Generar número de transacción único para la nueva cuenta
    transaction_number = await get_next_transaction_number()
    
    order = {
        "id": order_id,
        "table_id": table_id,
        "table_number": table["number"],
        "account_number": new_account_number,
        "account_label": account_label,
        "transaction_number": transaction_number,
        "waiter_id": user["user_id"],
        "waiter_name": user["name"],
        "status": "active",
        "items": [],
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    await db.orders.insert_one(order)
    
    if len(existing_orders) >= 1:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"status": "divided"}}
        )
    else:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"status": "occupied", "active_order_id": order_id}}
        )
    
    return {k: v for k, v in order.items() if k != "_id"}

@router.delete("/orders/{order_id}/empty")
async def delete_empty_order(order_id: str, user: dict = Depends(get_current_user)):
    """Delete an empty order (account)"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    active_items = [i for i in order.get("items", []) if i.get("status") != "cancelled"]
    if len(active_items) > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar una cuenta con items activos")
    
    table_id = order.get("table_id")
    
    await db.orders.delete_one({"id": order_id})
    
    remaining_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0}
    ).to_list(50)
    
    if len(remaining_orders) == 0:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"status": "free", "active_order_id": None}}
        )
    elif len(remaining_orders) == 1:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"status": "occupied", "active_order_id": remaining_orders[0]["id"]}}
        )
    
    return {"ok": True, "deleted": order_id}

# ─── SPLIT / MOVE ORDERS ───
@router.post("/orders/{order_id}/split")
async def split_to_new_order(order_id: str, input: dict, user: dict = Depends(get_current_user)):
    """Split selected items into a new order (account)"""
    item_ids = input.get("item_ids", [])
    account_label = input.get("label", "")
    
    if not item_ids:
        raise HTTPException(status_code=400, detail="No items selected")
    
    source_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not source_order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    table_id = source_order["table_id"]
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    
    items_to_move = []
    remaining_items = []
    for item in source_order.get("items", []):
        if item["id"] in item_ids and item.get("status") != "cancelled":
            items_to_move.append(item)
        else:
            remaining_items.append(item)
    
    if not items_to_move:
        raise HTTPException(status_code=400, detail="No se encontraron items válidos para mover")
    
    existing_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0, "account_number": 1}
    ).to_list(50)
    
    max_account = 0
    for o in existing_orders:
        acc = o.get("account_number", 1)
        if acc > max_account:
            max_account = acc
    
    new_account_number = max_account + 1
    new_order_id = gen_id()
    
    # Generar número de transacción correlativo para la cuenta dividida
    transaction_number = await get_next_transaction_number()
    
    new_order = {
        "id": new_order_id,
        "table_id": table_id,
        "table_number": table["number"] if table else "?",
        "account_number": new_account_number,
        "account_label": account_label,
        "transaction_number": transaction_number,
        "waiter_id": user["user_id"],
        "waiter_name": user["name"],
        "status": "active",
        "items": items_to_move,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "split_from": order_id
    }
    await db.orders.insert_one(new_order)
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"items": remaining_items, "updated_at": now_iso()}}
    )
    
    await db.tables.update_one(
        {"id": table_id},
        {"$set": {"status": "divided"}}
    )
    
    return {
        "ok": True,
        "new_order": {k: v for k, v in new_order.items() if k != "_id"},
        "source_order": await db.orders.find_one({"id": order_id}, {"_id": 0})
    }

@router.post("/orders/{order_id}/merge/{target_order_id}")
async def merge_orders(order_id: str, target_order_id: str, user: dict = Depends(get_current_user)):
    """Merge source order into target order"""
    source_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    target_order = await db.orders.find_one({"id": target_order_id}, {"_id": 0})
    
    if not source_order:
        raise HTTPException(status_code=404, detail="Orden origen no encontrada")
    if not target_order:
        raise HTTPException(status_code=404, detail="Orden destino no encontrada")
    
    if source_order["table_id"] != target_order["table_id"]:
        raise HTTPException(status_code=400, detail="Las órdenes deben estar en la misma mesa")
    
    source_items = source_order.get("items", [])
    active_items = [i for i in source_items if i.get("status") != "cancelled"]
    
    if active_items:
        await db.orders.update_one(
            {"id": target_order_id},
            {"$push": {"items": {"$each": active_items}}, "$set": {"updated_at": now_iso()}}
        )
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"status": "merged", "merged_into": target_order_id, "items": [], "updated_at": now_iso()}}
    )
    
    table_id = source_order["table_id"]
    remaining_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0}
    ).to_list(50)
    
    if len(remaining_orders) == 1:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"status": "occupied", "active_order_id": remaining_orders[0]["id"]}}
        )
    
    return {
        "ok": True,
        "merged_order": await db.orders.find_one({"id": target_order_id}, {"_id": 0})
    }

@router.post("/orders/{order_id}/move-items")
async def move_items_to_order(order_id: str, input: dict, user: dict = Depends(get_current_user)):
    """Move items from one order to another (same table)"""
    target_order_id = input.get("target_order_id")
    item_ids = input.get("item_ids", [])
    
    if not target_order_id or not item_ids:
        raise HTTPException(status_code=400, detail="Faltan datos")
    
    source_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    target_order = await db.orders.find_one({"id": target_order_id}, {"_id": 0})
    
    if not source_order:
        raise HTTPException(status_code=404, detail="Orden origen no encontrada")
    if not target_order:
        raise HTTPException(status_code=404, detail="Orden destino no encontrada")
    
    items_to_move = []
    remaining_items = []
    
    for item in source_order.get("items", []):
        if item["id"] in item_ids and item.get("status") != "cancelled":
            items_to_move.append(item)
        else:
            remaining_items.append(item)
    
    if not items_to_move:
        raise HTTPException(status_code=400, detail="No se encontraron items para mover")
    
    await db.orders.update_one(
        {"id": target_order_id},
        {"$push": {"items": {"$each": items_to_move}}, "$set": {"updated_at": now_iso()}}
    )
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"items": remaining_items, "updated_at": now_iso()}}
    )
    
    return {
        "ok": True,
        "items_moved": len(items_to_move),
        "source_order": await db.orders.find_one({"id": order_id}, {"_id": 0}),
        "target_order": await db.orders.find_one({"id": target_order_id}, {"_id": 0})
    }

@router.post("/orders/{order_id}/move")
async def move_order_to_table(order_id: str, input: dict, user: dict = Depends(get_current_user)):
    """Move an order to a different table"""
    target_table_id = input.get("target_table_id")
    merge = input.get("merge", False)
    
    source_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not source_order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    source_table_id = source_order["table_id"]
    source_table = await db.tables.find_one({"id": source_table_id}, {"_id": 0})
    target_table = await db.tables.find_one({"id": target_table_id}, {"_id": 0})
    
    if not target_table:
        raise HTTPException(status_code=404, detail="Mesa destino no encontrada")
    
    target_order = await db.orders.find_one(
        {"table_id": target_table_id, "status": {"$in": ["active", "sent"]}}, {"_id": 0}
    )
    
    if target_order and not merge:
        return {"needs_merge": True, "target_order_id": target_order["id"], "target_table_number": target_table["number"]}
    
    if target_order and merge:
        source_items = source_order.get("items", [])
        await db.orders.update_one(
            {"id": target_order["id"]},
            {"$push": {"items": {"$each": source_items}}, "$set": {"updated_at": now_iso()}}
        )
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"status": "merged", "merged_into": target_order["id"], "items": [], "updated_at": now_iso()}}
        )
    else:
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"table_id": target_table_id, "table_number": target_table["number"], "updated_at": now_iso()}}
        )
        await db.tables.update_one(
            {"id": target_table_id},
            {"$set": {"status": "occupied", "active_order_id": order_id}}
        )
    
    # Update source table status
    remaining_orders = await db.orders.find(
        {"table_id": source_table_id, "status": {"$in": ["active", "sent"]}, "id": {"$ne": order_id}},
        {"_id": 0}
    ).to_list(50)
    
    if len(remaining_orders) == 0:
        await db.tables.update_one(
            {"id": source_table_id},
            {"$set": {"status": "free", "active_order_id": None}}
        )
    elif len(remaining_orders) == 1:
        await db.tables.update_one(
            {"id": source_table_id},
            {"$set": {"status": "occupied", "active_order_id": remaining_orders[0]["id"]}}
        )
    else:
        await db.tables.update_one(
            {"id": source_table_id},
            {"$set": {"status": "divided", "active_order_id": remaining_orders[0]["id"]}}
        )
    
    if target_order and merge:
        return {"ok": True, "merged": True, "target_order_id": target_order["id"]}
    return {"ok": True, "moved": True}
