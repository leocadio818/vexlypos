# Kitchen Router - KDS (Kitchen Display System) endpoints
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
import uuid
import asyncio
import json

router = APIRouter(tags=["kitchen"])

# Database reference
db = None

# SSE: Track connected KDS clients for real-time updates
kds_event = asyncio.Event()

def set_db(database):
    global db
    db = database

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def notify_kds():
    """Trigger all connected KDS clients to refresh"""
    kds_event.set()

# Import auth dependency
from routers.auth import get_current_user

async def get_kitchen_category_ids():
    """Get category IDs that should appear in kitchen KDS (not bar)"""
    # Get all category-channel mappings
    mappings = await db.category_channels.find({}, {"_id": 0}).to_list(100)
    mapping_dict = {m["category_id"]: m["channel_code"] for m in mappings}
    
    # Get all categories
    categories = await db.categories.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    
    # Categories that go to kitchen KDS:
    # - Those without mapping (default)
    # - Those mapped to "kitchen" 
    # - Those mapped to "receipt" (receipt is for printing invoices, not a preparation station)
    # Exclude from KDS: bar, terraza (these are bar/drink preparation areas)
    bar_channels = {"bar", "terraza"}
    kitchen_cat_ids = []
    
    for cat in categories:
        cat_id = cat["id"]
        channel = mapping_dict.get(cat_id, "kitchen")  # Default to kitchen
        if channel not in bar_channels:
            kitchen_cat_ids.append(cat_id)
    
    return kitchen_cat_ids

# ─── KITCHEN ORDERS (KDS) ───
@router.get("/kitchen/orders")
async def kitchen_orders():
    """Get orders with items sent to kitchen that are not yet served - FILTERED BY CHANNEL"""
    # Get category IDs that belong to kitchen
    kitchen_cat_ids = await get_kitchen_category_ids()
    
    orders = await db.orders.find(
        {"status": {"$in": ["sent", "active", "pending"]},
         "items": {"$elemMatch": {"sent_to_kitchen": True, "status": {"$nin": ["served", "cancelled"]}}}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    # Filter items by kitchen categories
    filtered_orders = []
    for order in orders:
        kitchen_items = [
            item for item in order.get("items", [])
            if item.get("sent_to_kitchen") 
            and item.get("status") not in ["served", "cancelled"]
            and item.get("category_id") in kitchen_cat_ids
        ]
        if kitchen_items:
            order_copy = dict(order)
            order_copy["items"] = kitchen_items
            filtered_orders.append(order_copy)
    
    return filtered_orders


# ─── SSE STREAM FOR KDS REAL-TIME ───
@router.get("/kitchen/stream")
async def kitchen_stream(request: Request):
    """Server-Sent Events stream for real-time KDS updates - FILTERED BY CHANNEL"""
    async def event_generator():
        global kds_event
        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break
            
            # Get category IDs that belong to kitchen
            kitchen_cat_ids = await get_kitchen_category_ids()
            
            # Get current orders
            orders = await db.orders.find(
                {"status": {"$in": ["sent", "active", "pending"]},
                 "items": {"$elemMatch": {"sent_to_kitchen": True, "status": {"$nin": ["served", "cancelled"]}}}},
                {"_id": 0}
            ).sort("created_at", 1).to_list(100)
            
            # Filter items by kitchen categories
            filtered_orders = []
            for order in orders:
                kitchen_items = [
                    item for item in order.get("items", [])
                    if item.get("sent_to_kitchen") 
                    and item.get("status") not in ["served", "cancelled"]
                    and item.get("category_id") in kitchen_cat_ids
                ]
                if kitchen_items:
                    order_copy = dict(order)
                    order_copy["items"] = kitchen_items
                    filtered_orders.append(order_copy)
            
            # Send orders as SSE event
            data = json.dumps(filtered_orders, default=str)
            yield f"data: {data}\n\n"
            
            # Wait for notification or timeout (poll every 3 seconds as fallback)
            try:
                await asyncio.wait_for(kds_event.wait(), timeout=3.0)
                kds_event.clear()
            except asyncio.TimeoutError:
                pass
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ─── DEBUG/STATUS ENDPOINT ───
@router.get("/kitchen/status")
async def kitchen_status():
    """Debug endpoint to check KDS connectivity and order status - FILTERED BY CHANNEL"""
    # Get category IDs that belong to kitchen
    kitchen_cat_ids = await get_kitchen_category_ids()
    
    orders = await db.orders.find(
        {"status": {"$in": ["sent", "active", "pending"]},
         "items": {"$elemMatch": {"sent_to_kitchen": True}}},
        {"_id": 0}
    ).to_list(100)
    
    # Filter items by kitchen categories
    filtered_orders = []
    for order in orders:
        kitchen_items = [
            item for item in order.get("items", [])
            if item.get("sent_to_kitchen") 
            and item.get("category_id") in kitchen_cat_ids
        ]
        if kitchen_items:
            order_copy = dict(order)
            order_copy["items"] = kitchen_items
            filtered_orders.append(order_copy)
    
    pending = [o for o in filtered_orders if any(i.get("status") in ["sent", "pending"] for i in o.get("items", []))]
    preparing = [o for o in filtered_orders if any(i.get("status") == "preparing" for i in o.get("items", []))]
    ready = [o for o in filtered_orders if any(i.get("status") == "ready" for i in o.get("items", []))]
    
    return {
        "status": "connected",
        "timestamp": now_iso(),
        "total_orders": len(filtered_orders),
        "pending_count": len(pending),
        "preparing_count": len(preparing),
        "ready_count": len(ready),
        "kitchen_categories": len(kitchen_cat_ids),
        "orders_summary": [
            {
                "id": o["id"],
                "table": o.get("table_number"),
                "waiter": o.get("waiter_name"),
                "items_count": len(o.get("items", [])),
                "created_at": o.get("created_at")
            }
            for o in filtered_orders[:10]
        ]
    }


# ─── KITCHEN TV ENDPOINT ───
@router.get("/kitchen/tv")
async def kitchen_tv():
    """Get orders formatted for Kitchen TV display - FILTERED BY CHANNEL"""
    # Get config
    config = await db.system_config.find_one({"id": "kitchen_config"}, {"_id": 0})
    if not config:
        config = {"warning_minutes": 15, "urgent_minutes": 25, "critical_minutes": 35}
    
    # Get category IDs that belong to kitchen
    kitchen_cat_ids = await get_kitchen_category_ids()
    
    orders = await db.orders.find(
        {"status": {"$in": ["sent", "active", "pending"]},
         "items": {"$elemMatch": {"sent_to_kitchen": True, "status": {"$nin": ["served", "cancelled"]}}}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    result = []
    for order in orders:
        # Filter items by kitchen categories only
        kitchen_items = [
            i for i in order.get("items", []) 
            if i.get("sent_to_kitchen") 
            and i.get("status") not in ["served", "cancelled"]
            and i.get("category_id") in kitchen_cat_ids
        ]
        if not kitchen_items:
            continue
        
        # Calculate elapsed time
        created_at = order.get("created_at", "")
        elapsed_minutes = 0
        if created_at:
            try:
                created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                elapsed_minutes = (datetime.now(timezone.utc) - created).total_seconds() / 60
            except:
                pass
        
        result.append({
            "order_id": order["id"],
            "table_number": f"Mesa {order.get('table_number', '?')}",
            "waiter_name": order.get("waiter_name", "?"),
            "elapsed_minutes": round(elapsed_minutes, 1),
            "is_warning": elapsed_minutes >= config.get("warning_minutes", 15),
            "is_urgent": elapsed_minutes >= config.get("urgent_minutes", 25),
            "is_critical": elapsed_minutes >= config.get("critical_minutes", 35),
            "items": [
                {
                    "id": item["id"],
                    "product_name": item.get("product_name", "?"),
                    "quantity": item.get("quantity", 1),
                    "status": item.get("status", "sent"),
                    "modifiers": [m.get("name", "") for m in item.get("modifiers", [])],
                    "notes": item.get("notes", "")
                }
                for item in kitchen_items
            ]
        })
    
    return {"orders": result, "config": config}


# ─── KITCHEN CONFIG ───
@router.get("/kitchen/config")
async def get_kitchen_config():
    """Get kitchen timing configuration"""
    config = await db.system_config.find_one({"id": "kitchen_config"}, {"_id": 0})
    if not config:
        config = {"id": "kitchen_config", "warning_minutes": 15, "urgent_minutes": 25, "critical_minutes": 35}
    return config

@router.put("/kitchen/config")
async def update_kitchen_config(input: dict):
    """Update kitchen timing configuration"""
    await db.system_config.update_one(
        {"id": "kitchen_config"},
        {"$set": {
            "warning_minutes": input.get("warning_minutes", 15),
            "urgent_minutes": input.get("urgent_minutes", 25),
            "critical_minutes": input.get("critical_minutes", 35)
        }},
        upsert=True
    )
    return {"ok": True}

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
    # Notify all KDS clients
    notify_kds()
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
    notify_kds()
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
    notify_kds()
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
    notify_kds()
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
