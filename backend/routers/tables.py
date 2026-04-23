# Tables & Areas Router
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

router = APIRouter(tags=["tables"])

# Database reference
db = None

def set_db(database):
    global db
    db = database

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# Import auth dependency
from routers.auth import get_current_user

# ─── PYDANTIC MODELS ───
class AreaInput(BaseModel):
    name: str
    color: str = "#4A5568"

class TableInput(BaseModel):
    number: int
    area_id: str
    capacity: int = 4
    shape: str = "rectangle"
    x: float = 0
    y: float = 0
    width: float = 80
    height: float = 80

# ─── AREAS CRUD ───
@router.get("/areas")
async def list_areas():
    return await db.areas.find({}, {"_id": 0}).sort("order", 1).to_list(50)

@router.post("/areas")
async def create_area(input: AreaInput):
    count = await db.areas.count_documents({})
    doc = {"id": gen_id(), "name": input.name, "color": input.color, "order": count}
    await db.areas.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"], "color": doc["color"], "order": doc["order"]}

@router.put("/areas/{area_id}")
async def update_area(area_id: str, input: dict):
    await db.areas.update_one({"id": area_id}, {"$set": input})
    return {"ok": True}

@router.delete("/areas/{area_id}")
async def delete_area(area_id: str):
    await db.areas.delete_one({"id": area_id})
    # Also delete decorators for this area
    await db.map_decorators.delete_many({"area_id": area_id})
    return {"ok": True}

# ─── MAP DECORATORS CRUD ───
class DecoratorInput(BaseModel):
    area_id: str
    type: str  # 'hline', 'vline', 'rect', 'circle', 'text'
    x: float = 50  # percentage
    y: float = 50  # percentage
    width: float = 10  # percentage
    height: float = 2  # percentage
    color: str = "#6B7280"  # gray default
    text: str = ""  # for text type
    rotation: float = 0

@router.get("/decorators")
async def list_decorators(area_id: Optional[str] = Query(None)):
    query = {"area_id": area_id} if area_id else {}
    return await db.map_decorators.find(query, {"_id": 0}).to_list(200)

@router.post("/decorators")
async def create_decorator(input: DecoratorInput):
    doc = {
        "id": gen_id(),
        "area_id": input.area_id,
        "type": input.type,
        "x": input.x,
        "y": input.y,
        "width": input.width,
        "height": input.height,
        "color": input.color,
        "text": input.text,
        "rotation": input.rotation,
        "created_at": now_iso()
    }
    await db.map_decorators.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/decorators/{decorator_id}")
async def update_decorator(decorator_id: str, input: dict):
    if "_id" in input:
        del input["_id"]
    await db.map_decorators.update_one({"id": decorator_id}, {"$set": input})
    return {"ok": True}

@router.delete("/decorators/{decorator_id}")
async def delete_decorator(decorator_id: str):
    await db.map_decorators.delete_one({"id": decorator_id})
    return {"ok": True}

# ─── DEVICE-SPECIFIC LAYOUTS (Desktop vs Mobile) ───
# Stores separate table positions and decorators for each device type per area

class LayoutInput(BaseModel):
    area_id: str
    device_type: str  # 'desktop' or 'mobile'
    tables: list  # [{table_id, x, y, width, height}, ...]
    decorators: list  # [{id, type, x, y, width, height, color, text}, ...]

@router.get("/layouts/{area_id}/{device_type}")
async def get_layout(area_id: str, device_type: str):
    """Get layout for specific device type (desktop/mobile)"""
    if device_type not in ['desktop', 'mobile']:
        raise HTTPException(status_code=400, detail="device_type must be 'desktop' or 'mobile'")
    
    layout = await db.map_layouts.find_one(
        {"area_id": area_id, "device_type": device_type},
        {"_id": 0}
    )
    
    if not layout:
        # Return null to indicate no custom layout exists
        return {"exists": False, "area_id": area_id, "device_type": device_type}
    
    return {"exists": True, **layout}

@router.put("/layouts/{area_id}/{device_type}")
async def save_layout(area_id: str, device_type: str, input: dict):
    """Save layout for specific device type"""
    if device_type not in ['desktop', 'mobile']:
        raise HTTPException(status_code=400, detail="device_type must be 'desktop' or 'mobile'")
    
    if "_id" in input:
        del input["_id"]
    
    layout_doc = {
        "area_id": area_id,
        "device_type": device_type,
        "tables": input.get("tables", []),
        "decorators": input.get("decorators", []),
        "updated_at": now_iso()
    }
    
    await db.map_layouts.update_one(
        {"area_id": area_id, "device_type": device_type},
        {"$set": layout_doc},
        upsert=True
    )
    
    return {"ok": True, "area_id": area_id, "device_type": device_type}

@router.delete("/layouts/{area_id}/{device_type}")
async def delete_layout(area_id: str, device_type: str):
    """Delete custom layout for device type (reverts to default)"""
    await db.map_layouts.delete_one({"area_id": area_id, "device_type": device_type})
    return {"ok": True}

# ─── TABLES CRUD ───
@router.get("/tables")
async def list_tables(area_id: Optional[str] = Query(None)):
    query = {"area_id": area_id} if area_id else {}
    tables = await db.tables.find(query, {"_id": 0}).to_list(200)
    
    # Get ALL active/open orders to calculate table status dynamically
    # This ensures status is always accurate regardless of cached table.status
    # Include: active, sent, merged (divided accounts) - these are all "open"
    # Exclude: closed, paid, cancelled - these are finished
    active_orders = await db.orders.find(
        {"status": {"$nin": ["closed", "paid", "cancelled"]}},
        {"_id": 0, "table_id": 1, "waiter_id": 1, "waiter_name": 1, "id": 1, "status": 1}
    ).to_list(500)
    
    # Group orders by table_id
    orders_by_table = {}
    for order in active_orders:
        tid = order.get("table_id")
        if tid:
            if tid not in orders_by_table:
                orders_by_table[tid] = []
            orders_by_table[tid].append(order)
    
    # Calculate status for each table based on active orders
    for table in tables:
        table_orders = orders_by_table.get(table["id"], [])
        
        if not table_orders:
            # No active orders = free (override any stale status)
            table["status"] = "free"
            table["active_order_id"] = None
            table["owner_id"] = None
            table["owner_name"] = None
        else:
            # Has active orders
            if len(table_orders) > 1:
                table["status"] = "divided"
            else:
                table["status"] = "occupied"
            
            # Set owner from first order
            first_order = table_orders[0]
            table["owner_id"] = first_order.get("waiter_id")
            table["owner_name"] = first_order.get("waiter_name")
            table["active_order_id"] = first_order.get("id")
        
        # Preserve reserved status if no orders (reservation takes precedence)
        if table.get("reserved_until") and not table_orders:
            # Check if reservation is still valid
            try:
                from datetime import datetime, timezone
                reserved_until = datetime.fromisoformat(table["reserved_until"].replace("Z", "+00:00"))
                if reserved_until > datetime.now(timezone.utc):
                    table["status"] = "reserved"
            except:
                pass
    
    return tables

@router.post("/tables")
async def create_table(input: TableInput):
    doc = {
        "id": gen_id(), "number": input.number, "area_id": input.area_id,
        "capacity": input.capacity, "shape": input.shape,
        "x": input.x, "y": input.y, "width": input.width, "height": input.height,
        "status": "free", "active_order_id": None
    }
    await db.tables.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/tables/{table_id}")
async def update_table(table_id: str, input: dict):
    if "_id" in input:
        del input["_id"]
    await db.tables.update_one({"id": table_id}, {"$set": input})
    return {"ok": True}

@router.delete("/tables/{table_id}")
async def delete_table(table_id: str):
    await db.tables.delete_one({"id": table_id})
    return {"ok": True}

# ─── BULK TABLE CREATION ───
class BulkTableInput(BaseModel):
    area_id: str
    count: int
    shape: str = "round"
    capacity: int = 4

@router.post("/tables/bulk")
async def create_tables_bulk(input: BulkTableInput, user: dict = Depends(get_current_user)):
    """Create multiple tables in an area at once with auto-assigned sequential numbers.

    Numbering strategy: finds the max table number in the ENTIRE restaurant and
    continues from there, so numbers remain globally unique.
    Positions: auto-arranged in a 4-column grid at 15% spacing.
    """
    if input.count <= 0 or input.count > 100:
        raise HTTPException(status_code=400, detail="Cantidad debe ser entre 1 y 100")
    if input.shape not in ("round", "square", "rectangle"):
        raise HTTPException(status_code=400, detail="Forma inválida")
    area = await db.areas.find_one({"id": input.area_id}, {"_id": 0})
    if not area:
        raise HTTPException(status_code=404, detail="Área no encontrada")

    # Find highest global table number to continue sequence (avoids collisions across areas)
    existing = await db.tables.find({}, {"_id": 0, "number": 1}).to_list(1000)
    max_number = max((t.get("number") or 0 for t in existing), default=0)

    # Grid layout: 4 columns, starting at x=15% y=15%, step 20%
    cols = 4
    step_x = 20
    step_y = 20
    start_x = 15
    start_y = 15

    # Count existing in this area to offset grid start
    in_area = await db.tables.count_documents({"area_id": input.area_id})

    docs = []
    created_numbers = []
    for i in range(input.count):
        seq = in_area + i
        row = seq // cols
        col = seq % cols
        x = start_x + col * step_x
        y = start_y + row * step_y
        number = max_number + 1 + i
        doc = {
            "id": gen_id(),
            "number": number,
            "area_id": input.area_id,
            "capacity": input.capacity,
            "shape": input.shape,
            "x": x,
            "y": y,
            "width": 80,
            "height": 80,
            "status": "free",
            "active_order_id": None,
        }
        docs.append(doc)
        created_numbers.append(number)

    if docs:
        await db.tables.insert_many(docs)

    return {
        "ok": True,
        "created": len(docs),
        "area_id": input.area_id,
        "area_name": area.get("name"),
        "numbers": created_numbers,
    }

# ─── TABLE MOVEMENTS AUDIT ───
async def log_table_movement(
    user_id: str, user_name: str, user_role: str,
    source_table_id: str, source_table_number: int,
    target_table_id: str, target_table_number: int,
    movement_type: str, orders_moved: int = 1, merged: bool = False
):
    """Log a table movement for audit purposes"""
    movement = {
        "id": gen_id(),
        "user_id": user_id,
        "user_name": user_name,
        "user_role": user_role,
        "source_table_id": source_table_id,
        "source_table_number": source_table_number,
        "target_table_id": target_table_id,
        "target_table_number": target_table_number,
        "movement_type": movement_type,
        "orders_moved": orders_moved,
        "merged": merged,
        "created_at": now_iso()
    }
    await db.table_movements.insert_one(movement)
    return movement

@router.get("/reports/table-movements")
async def get_table_movements(
    date: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    user: dict = Depends(get_current_user)
):
    """Get table movement history for audit"""
    query = {}
    if date_from and date_to:
        query["created_at"] = {"$gte": date_from, "$lte": date_to + "T23:59:59"}
    elif date:
        query["created_at"] = {"$regex": f"^{date}"}
    
    movements = await db.table_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return movements

@router.get("/reports/table-movements/stats")
async def get_table_movement_stats(
    date: Optional[str] = Query(None),
    user: dict = Depends(get_current_user)
):
    """Get statistics about table movements"""
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    movements = await db.table_movements.find(
        {"created_at": {"$regex": f"^{date}"}}, {"_id": 0}
    ).to_list(500)
    
    by_user = {}
    for m in movements:
        name = m.get("user_name", "?")
        if name not in by_user:
            by_user[name] = {"name": name, "moves": 0, "merges": 0}
        by_user[name]["moves"] += 1
        if m.get("merged"):
            by_user[name]["merges"] += 1
    
    single_moves = len([m for m in movements if m.get("movement_type") == "single"])
    bulk_moves = len([m for m in movements if m.get("movement_type") == "bulk"])
    merges = len([m for m in movements if m.get("merged")])
    
    return {
        "date": date,
        "total_movements": len(movements),
        "single_moves": single_moves,
        "bulk_moves": bulk_moves,
        "merges": merges,
        "by_user": list(by_user.values())
    }

# ─── MOVE ALL ORDERS FROM TABLE ───
@router.post("/tables/{table_id}/move-all")
async def move_all_orders_to_table(table_id: str, input: dict, user: dict = Depends(get_current_user)):
    """Move ALL orders from a table to another table"""
    target_table_id = input.get("target_table_id")
    
    if table_id == target_table_id:
        raise HTTPException(status_code=400, detail="No puedes mover a la misma mesa")
    
    source_table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not source_table:
        raise HTTPException(status_code=404, detail="Mesa origen no encontrada")
    
    target_table = await db.tables.find_one({"id": target_table_id}, {"_id": 0})
    if not target_table:
        raise HTTPException(status_code=404, detail="Mesa destino no encontrada")
    
    source_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0}
    ).to_list(50)
    
    if not source_orders:
        raise HTTPException(status_code=400, detail="No hay órdenes activas en esta mesa")
    
    target_orders = await db.orders.find(
        {"table_id": target_table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0}
    ).to_list(50)
    
    if target_orders:
        return {
            "needs_merge": True, 
            "source_order_count": len(source_orders),
            "target_order_count": len(target_orders),
            "target_table_number": target_table["number"]
        }
    
    for order in source_orders:
        await db.orders.update_one(
            {"id": order["id"]},
            {"$set": {
                "table_id": target_table_id, 
                "table_number": target_table["number"], 
                "updated_at": now_iso()
            }}
        )
    
    await db.tables.update_one(
        {"id": table_id},
        {"$set": {"status": "free", "active_order_id": None}}
    )
    
    new_status = "divided" if len(source_orders) > 1 else "occupied"
    await db.tables.update_one(
        {"id": target_table_id},
        {"$set": {"status": new_status, "active_order_id": source_orders[0]["id"]}}
    )
    
    await log_table_movement(
        user_id=user["user_id"], user_name=user["name"], user_role=user["role"],
        source_table_id=table_id, source_table_number=source_table["number"],
        target_table_id=target_table_id, target_table_number=target_table["number"],
        movement_type="bulk", orders_moved=len(source_orders), merged=False
    )
    
    return {
        "ok": True,
        "orders_moved": len(source_orders),
        "target_table_number": target_table["number"]
    }


# ─── TRANSFER TABLES BETWEEN USERS ───

class TransferInput(BaseModel):
    target_user_id: str
    table_ids: list = []  # empty = transfer current table only
    transfer_all: bool = False
    authorized_by_pin: str = ""  # PIN of admin if authorization was needed

@router.post("/tables/transfer")
async def transfer_tables(input: TransferInput, user=Depends(get_current_user)):
    """Transfer table ownership from current user to another user"""
    from routers.auth import get_permissions, hash_pin
    
    # Validate target user exists and is active
    target_user = await db.users.find_one({"id": input.target_user_id, "active": True}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario destino no encontrado o inactivo")
    
    # Validate target user has clocked in today
    from zoneinfo import ZoneInfo
    today = datetime.now(ZoneInfo("America/Santo_Domingo")).strftime("%Y-%m-%d")
    clock_in = await db.attendance.find_one(
        {"user_id": input.target_user_id, "date": today, "status": "ACTIVE"},
        {"_id": 0}
    )
    if not clock_in:
        raise HTTPException(status_code=400, detail=f"{target_user['name']} no tiene entrada registrada hoy. Debe marcar entrada primero.")
    
    # Check permission
    perms = get_permissions(user.get("role", "waiter"), user.get("permissions"))
    authorized_by = None
    
    if not perms.get("transfer_tables"):
        # Need admin PIN authorization
        if not input.authorized_by_pin:
            raise HTTPException(status_code=403, detail="Se requiere autorizacion de administrador")
        
        pin_hash = hash_pin(input.authorized_by_pin)
        admin = await db.users.find_one({"pin_hash": pin_hash, "active": True}, {"_id": 0})
        if not admin:
            raise HTTPException(status_code=403, detail="PIN incorrecto")
        
        admin_perms = get_permissions(admin.get("role", "waiter"), admin.get("permissions"))
        if not admin_perms.get("transfer_tables"):
            raise HTTPException(status_code=403, detail="El usuario no tiene permiso de transferencia")
        
        authorized_by = {"id": admin["id"], "name": admin["name"]}
    
    # Determine which tables to transfer
    if input.transfer_all:
        # All tables owned by current user
        orders = await db.orders.find(
            {"waiter_id": user["user_id"], "status": {"$nin": ["closed", "cancelled", "paid"]}},
            {"_id": 0}
        ).to_list(100)
        table_ids = list(set(o.get("table_id") for o in orders if o.get("table_id")))
    elif input.table_ids:
        table_ids = input.table_ids
    else:
        raise HTTPException(status_code=400, detail="Debe especificar mesas o usar transfer_all")
    
    if not table_ids:
        raise HTTPException(status_code=400, detail="No hay mesas activas para transferir")
    
    # Transfer each table's orders
    transferred = []
    for tid in table_ids:
        # Update all active orders for this table
        result = await db.orders.update_many(
            {"table_id": tid, "waiter_id": user["user_id"], "status": {"$nin": ["closed", "cancelled", "paid"]}},
            {"$set": {
                "waiter_id": input.target_user_id,
                "waiter_name": target_user["name"],
            }, "$push": {
                "audit_trail": {
                    "action": "table_transfer",
                    "timestamp": now_iso(),
                    "from_user_id": user["user_id"],
                    "from_user_name": user["name"],
                    "to_user_id": input.target_user_id,
                    "to_user_name": target_user["name"],
                    "authorized_by": authorized_by["name"] if authorized_by else user["name"],
                    "authorized_by_id": authorized_by["id"] if authorized_by else user["user_id"],
                }
            }}
        )
        
        if result.modified_count > 0:
            # Update table ownership AND ensure status is occupied
            await db.tables.update_one(
                {"id": tid},
                {"$set": {"owner_id": input.target_user_id, "owner_name": target_user["name"], "status": "occupied"}}
            )
            table = await db.tables.find_one({"id": tid}, {"_id": 0, "number": 1})
            transferred.append({"table_id": tid, "table_number": table.get("number", "?"), "orders_moved": result.modified_count})
    
    # Create notification for the receiving user
    if transferred:
        table_names = ", ".join([f"Mesa {t['table_number']}" for t in transferred])
        await db.notifications.insert_one({
            "id": gen_id(),
            "user_id": input.target_user_id,
            "type": "table_transfer",
            "title": "Mesa Transferida",
            "message": f"{user['name']} te ha transferido {table_names}",
            "data": {"transferred": transferred, "from_user": user["name"]},
            "read": False,
            "created_at": now_iso(),
        })
    
    return {
        "ok": True,
        "transferred": transferred,
        "from_user": user["name"],
        "to_user": target_user["name"],
        "authorized_by": authorized_by["name"] if authorized_by else None,
    }


# ─── NOTIFICATIONS POLLING ───

@router.get("/notifications/pending")
async def get_pending_notifications(user=Depends(get_current_user)):
    """Get unread notifications for the current user"""
    notifications = await db.notifications.find(
        {"user_id": user["user_id"], "read": False},
        {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    return notifications

@router.put("/notifications/{nid}/read")
async def mark_notification_read(nid: str, user=Depends(get_current_user)):
    """Mark a notification as read"""
    await db.notifications.update_one(
        {"id": nid, "user_id": user["user_id"]},
        {"$set": {"read": True}}
    )
    return {"ok": True}
