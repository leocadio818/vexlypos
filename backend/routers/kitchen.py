# Kitchen Router - KDS (Kitchen Display System) endpoints
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

router = APIRouter(tags=["kitchen"])

# Database reference
db = None

def set_db(database):
    global db
    db = database

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# Import auth dependency
from routers.auth import get_current_user

# ─── KITCHEN ORDERS (KDS) ───
@router.get("/kitchen/orders")
async def kitchen_orders():
    """Get orders with items sent to kitchen that are not yet served"""
    orders = await db.orders.find(
        {"status": {"$in": ["sent", "active"]},
         "items": {"$elemMatch": {"sent_to_kitchen": True, "status": {"$nin": ["served", "cancelled"]}}}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    return orders

@router.put("/kitchen/items/{order_id}/{item_id}")
async def update_kitchen_item(order_id: str, item_id: str, input: dict):
    """Update status of a kitchen item (preparing, ready, served)"""
    new_status = input.get("status", "preparing")
    await db.orders.update_one(
        {"id": order_id, "items.id": item_id},
        {"$set": {"items.$.status": new_status, "updated_at": now_iso()}}
    )
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if order:
        active_items = [i for i in order["items"] if i["status"] not in ["served", "cancelled"]]
        if not active_items:
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "completed"}})
    return {"ok": True}

@router.post("/kitchen/items/{order_id}/{item_id}/bump")
async def bump_kitchen_item(order_id: str, item_id: str, user: dict = Depends(get_current_user)):
    """Mark a kitchen item as ready/bumped"""
    await db.orders.update_one(
        {"id": order_id, "items.id": item_id},
        {"$set": {
            "items.$.status": "ready",
            "items.$.bumped_at": now_iso(),
            "items.$.bumped_by": user["name"],
            "updated_at": now_iso()
        }}
    )
    return {"ok": True}

@router.post("/kitchen/items/{order_id}/{item_id}/serve")
async def serve_kitchen_item(order_id: str, item_id: str, user: dict = Depends(get_current_user)):
    """Mark a kitchen item as served"""
    await db.orders.update_one(
        {"id": order_id, "items.id": item_id},
        {"$set": {
            "items.$.status": "served",
            "items.$.served_at": now_iso(),
            "items.$.served_by": user["name"],
            "updated_at": now_iso()
        }}
    )
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if order:
        active_items = [i for i in order["items"] if i["status"] not in ["served", "cancelled"]]
        if not active_items:
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "completed"}})
    return {"ok": True}

@router.post("/kitchen/orders/{order_id}/bump-all")
async def bump_all_items(order_id: str, user: dict = Depends(get_current_user)):
    """Bump all items in an order at once"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    for item in order.get("items", []):
        if item.get("sent_to_kitchen") and item.get("status") not in ["served", "cancelled", "ready"]:
            await db.orders.update_one(
                {"id": order_id, "items.id": item["id"]},
                {"$set": {
                    "items.$.status": "ready",
                    "items.$.bumped_at": now_iso(),
                    "items.$.bumped_by": user["name"]
                }}
            )
    
    await db.orders.update_one({"id": order_id}, {"$set": {"updated_at": now_iso()}})
    return {"ok": True}

# ─── PRINT CHANNELS ───
@router.get("/print-channels")
async def list_print_channels():
    """Get configured print channels (kitchen, bar, etc.)"""
    channels = await db.print_channels.find({}, {"_id": 0}).to_list(20)
    if not channels:
        defaults = [
            {"id": str(uuid.uuid4()), "name": "Cocina", "code": "kitchen", "active": True},
            {"id": str(uuid.uuid4()), "name": "Bar", "code": "bar", "active": True},
            {"id": str(uuid.uuid4()), "name": "Caja", "code": "cashier", "active": True}
        ]
        await db.print_channels.insert_many(defaults)
        return defaults
    return channels

@router.post("/print-channels")
async def create_print_channel(input: dict):
    doc = {
        "id": str(uuid.uuid4()),
        "name": input.get("name", ""),
        "code": input.get("code", ""),
        "active": input.get("active", True)
    }
    await db.print_channels.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/print-channels/{cid}")
async def update_print_channel(cid: str, input: dict):
    await db.print_channels.update_one({"id": cid}, {"$set": input})
    return {"ok": True}

@router.delete("/print-channels/{cid}")
async def delete_print_channel(cid: str):
    await db.print_channels.delete_one({"id": cid})
    return {"ok": True}
