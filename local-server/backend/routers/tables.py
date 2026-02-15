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
    return {"ok": True}

# ─── TABLES CRUD ───
@router.get("/tables")
async def list_tables(area_id: Optional[str] = Query(None)):
    query = {"area_id": area_id} if area_id else {}
    tables = await db.tables.find(query, {"_id": 0}).to_list(200)
    
    for table in tables:
        if table["status"] in ["occupied", "divided"]:
            order = await db.orders.find_one(
                {"table_id": table["id"], "status": {"$in": ["active", "sent"]}},
                {"_id": 0, "waiter_id": 1, "waiter_name": 1}
            )
            if order:
                table["owner_id"] = order.get("waiter_id")
                table["owner_name"] = order.get("waiter_name")
    
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
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user)
):
    """Get table movement history for audit"""
    query = {}
    if date:
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
