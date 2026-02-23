# Customers & Loyalty Router
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

router = APIRouter(tags=["customers"])

# Database reference
db = None

def set_db(database):
    global db
    db = database

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# ─── PYDANTIC MODELS ───
class CustomerInput(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    rnc: str = ""

# ─── CUSTOMERS ───
@router.get("/customers")
async def list_customers(
    search: Optional[str] = Query(None),
    rnc: Optional[str] = Query(None)
):
    """
    Lista clientes con filtros opcionales.
    - search: Busca por nombre, teléfono o email
    - rnc: Busca por RNC/Cédula exacto (para datos fiscales)
    """
    query = {}
    
    # Búsqueda por RNC específico (para validación fiscal)
    if rnc:
        # Limpiar el RNC de caracteres no numéricos
        cleaned_rnc = ''.join(c for c in rnc if c.isdigit())
        # Buscar tanto el RNC limpio como formateado
        query = {"$or": [
            {"rnc": cleaned_rnc},
            {"rnc": {"$regex": f"^{cleaned_rnc}$"}},
            # También buscar con formato (guiones)
            {"rnc": {"$regex": cleaned_rnc.replace("-", "")}}
        ]}
    elif search:
        query = {"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"rnc": {"$regex": search, "$options": "i"}}
        ]}
    
    return await db.customers.find(query, {"_id": 0}).sort("name", 1).to_list(500)

@router.get("/customers/{cid}")
async def get_customer(cid: str):
    customer = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return customer

@router.post("/customers")
async def create_customer(input: CustomerInput):
    doc = {
        "id": gen_id(), 
        "name": input.name, 
        "phone": input.phone, 
        "email": input.email,
        "rnc": input.rnc,
        "points": 0, 
        "total_spent": 0, 
        "visits": 0, 
        "created_at": now_iso(), 
        "last_visit": None
    }
    await db.customers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/customers/{cid}")
async def update_customer(cid: str, input: dict):
    if "_id" in input:
        del input["_id"]
    await db.customers.update_one({"id": cid}, {"$set": input})
    return {"ok": True}

@router.delete("/customers/{cid}")
async def delete_customer(cid: str):
    await db.customers.delete_one({"id": cid})
    return {"ok": True}

# ─── LOYALTY POINTS ───
@router.post("/customers/{cid}/add-points")
async def add_customer_points(cid: str, input: dict):
    amount = input.get("amount", 0)
    config = await db.loyalty_config.find_one({}, {"_id": 0}) or {"points_per_hundred": 10, "point_value_rd": 1}
    points = int((amount / 100) * config.get("points_per_hundred", 10))
    await db.customers.update_one({"id": cid}, {
        "$inc": {"points": points, "total_spent": amount, "visits": 1},
        "$set": {"last_visit": now_iso()}
    })
    customer = await db.customers.find_one({"id": cid}, {"_id": 0})
    return {"points_earned": points, "total_points": customer["points"] if customer else 0}

@router.post("/customers/{cid}/redeem-points")
async def redeem_customer_points(cid: str, input: dict):
    points_to_redeem = input.get("points", 0)
    customer = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not customer or customer["points"] < points_to_redeem:
        raise HTTPException(status_code=400, detail="Puntos insuficientes")
    config = await db.loyalty_config.find_one({}, {"_id": 0}) or {"point_value_rd": 1}
    discount = points_to_redeem * config.get("point_value_rd", 1)
    await db.customers.update_one({"id": cid}, {"$inc": {"points": -points_to_redeem}})
    return {"points_redeemed": points_to_redeem, "discount_rd": discount}

# ─── LOYALTY CONFIG ───
@router.get("/loyalty/config")
async def get_loyalty_config():
    config = await db.loyalty_config.find_one({}, {"_id": 0})
    return config or {"points_per_hundred": 10, "point_value_rd": 1, "min_redemption": 50}

@router.put("/loyalty/config")
async def update_loyalty_config(input: dict):
    if "_id" in input:
        del input["_id"]
    await db.loyalty_config.update_one({}, {"$set": input}, upsert=True)
    return {"ok": True}
