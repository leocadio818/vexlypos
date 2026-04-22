"""
Promotions Router — CRUD for scheduled promotions (Happy Hour, etc.)
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, timezone

from utils.helpers import gen_id
from routers.auth import get_current_user, get_permissions
from services import promotion_engine

router = APIRouter(tags=["Promotions"])
db = None


def set_db(database):
    global db
    db = database
    promotion_engine.set_db(database)


def _check_manage(user: dict):
    """Ensure user has manage_promotions permission."""
    # Fetch fresh perms from DB (JWT does not carry permissions)
    return user  # Actual check done inside endpoints via async fetch


async def _require_manage_promotions(user):
    db_user = await db.users.find_one({"id": user.get("user_id")}, {"_id": 0, "role": 1, "permissions": 1})
    role = (db_user or {}).get("role", user.get("role", "waiter"))
    perms = get_permissions(role, (db_user or {}).get("permissions", {}))
    if not perms.get("manage_promotions", False):
        raise HTTPException(status_code=403, detail="No tienes permiso para gestionar promociones")


# ─── CRUD ─────────────────────────────────────────────────────────────────
@router.get("/promotions")
async def list_promotions(user=Depends(get_current_user)):
    promos = await db.promotions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return promos


@router.get("/promotions/active")
async def active_promotions(user=Depends(get_current_user)):
    """Public (for any authenticated user) — returns only currently-active promos."""
    return await promotion_engine.get_active_promotions(force_refresh=False)


@router.post("/promotions")
async def create_promotion(input: dict, user=Depends(get_current_user)):
    await _require_manage_promotions(user)
    if not input.get("name", "").strip():
        raise HTTPException(status_code=400, detail="Nombre requerido")
    if input.get("discount_type") not in ("percentage", "fixed_amount", "fixed_price", "2x1"):
        raise HTTPException(status_code=400, detail="Tipo de descuento inválido")
    if input.get("apply_to") not in ("products", "category", "all"):
        raise HTTPException(status_code=400, detail="apply_to inválido")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": gen_id(),
        "name": input.get("name", "").strip(),
        "description": input.get("description", ""),
        "is_active": bool(input.get("is_active", True)),
        "schedule": {
            "days": input.get("schedule", {}).get("days", [0, 1, 2, 3, 4, 5, 6]),
            "start_time": input.get("schedule", {}).get("start_time", "00:00"),
            "end_time": input.get("schedule", {}).get("end_time", "23:59"),
            "date_start": input.get("schedule", {}).get("date_start") or None,
            "date_end": input.get("schedule", {}).get("date_end") or None,
        },
        "discount_type": input.get("discount_type"),
        "discount_value": float(input.get("discount_value", 0) or 0),
        "apply_to": input.get("apply_to", "all"),
        "product_ids": input.get("product_ids", []) or [],
        "category_ids": input.get("category_ids", []) or [],
        "excluded_product_ids": input.get("excluded_product_ids", []) or [],
        "area_ids": input.get("area_ids") or None,
        "created_by": user.get("user_id"),
        "created_at": now,
        "updated_at": now,
    }
    await db.promotions.insert_one(doc)
    promotion_engine.invalidate_cache()
    return {k: v for k, v in doc.items() if k != "_id"}


@router.patch("/promotions/{promotion_id}")
async def update_promotion(promotion_id: str, input: dict, user=Depends(get_current_user)):
    await _require_manage_promotions(user)
    existing = await db.promotions.find_one({"id": promotion_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Promoción no encontrada")
    input.pop("id", None)
    input.pop("_id", None)
    input.pop("created_at", None)
    input.pop("created_by", None)
    input["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.promotions.update_one({"id": promotion_id}, {"$set": input})
    promotion_engine.invalidate_cache()
    updated = await db.promotions.find_one({"id": promotion_id}, {"_id": 0})
    return updated


@router.delete("/promotions/{promotion_id}")
async def delete_promotion(promotion_id: str, user=Depends(get_current_user)):
    await _require_manage_promotions(user)
    res = await db.promotions.delete_one({"id": promotion_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Promoción no encontrada")
    promotion_engine.invalidate_cache()
    return {"ok": True}
