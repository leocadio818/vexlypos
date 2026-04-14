"""
Simple Inventory Router - Inventario Simple por Conteo
Control de inventario basado en conteo directo (sin recetas).
Mutuamente excluyente con el sistema de recetas.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import csv
import io

router = APIRouter(prefix="/simple-inventory", tags=["Simple Inventory"])

db = None

def set_db(database):
    global db
    db = database

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

from routers.auth import get_current_user, get_permissions


# ─── MODELS ───

class AdjustStockInput(BaseModel):
    new_qty: int
    reason: Optional[str] = None


# ─── HELPERS ───

async def log_inventory_change(product_id: str, product_name: str, user_id: str, user_name: str,
                                action_type: str, qty_before: int, qty_after: int, reason: str = None):
    """Register an entry in inventory_audit_log"""
    await db.inventory_audit_log.insert_one({
        "id": gen_id(),
        "product_id": product_id,
        "product_name": product_name,
        "user_id": user_id,
        "user_name": user_name,
        "action_type": action_type,
        "qty_before": qty_before,
        "qty_after": qty_after,
        "qty_change": qty_after - qty_before,
        "reason": reason,
        "created_at": now_iso(),
    })


async def decrement_simple_inventory(product_id: str, qty: int, user_id: str, user_name: str):
    """
    Atomically decrement simple inventory for a product.
    Returns (success: bool, product_name: str, new_qty: int).
    Uses find_one_and_update for race-condition safety.
    """
    result = await db.products.find_one_and_update(
        {
            "id": product_id,
            "simple_inventory_enabled": True,
            "simple_inventory_qty": {"$gte": qty}
        },
        {"$inc": {"simple_inventory_qty": -qty}},
        projection={"_id": 0, "name": 1, "simple_inventory_qty": 1},
        return_document=True
    )
    if result is None:
        # Check why it failed
        product = await db.products.find_one({"id": product_id}, {"_id": 0, "name": 1, "simple_inventory_enabled": 1, "simple_inventory_qty": 1})
        if not product:
            return False, "Producto no encontrado", 0
        if not product.get("simple_inventory_enabled"):
            return True, product.get("name", ""), 0  # Not tracked, allow
        return False, product.get("name", ""), product.get("simple_inventory_qty", 0)

    new_qty = result.get("simple_inventory_qty", 0)
    old_qty = new_qty + qty
    await log_inventory_change(
        product_id=product_id,
        product_name=result.get("name", ""),
        user_id=user_id,
        user_name=user_name,
        action_type="sale",
        qty_before=old_qty,
        qty_after=new_qty,
    )
    return True, result.get("name", ""), new_qty


async def increment_simple_inventory(product_id: str, qty: int, user_id: str, user_name: str, action_type: str = "cancel"):
    """Atomically increment simple inventory for a product (cancel/restock)."""
    product = await db.products.find_one(
        {"id": product_id, "simple_inventory_enabled": True},
        {"_id": 0, "name": 1, "simple_inventory_qty": 1}
    )
    if not product:
        return

    old_qty = product.get("simple_inventory_qty", 0)
    result = await db.products.find_one_and_update(
        {"id": product_id, "simple_inventory_enabled": True},
        {"$inc": {"simple_inventory_qty": qty}},
        projection={"_id": 0, "simple_inventory_qty": 1},
        return_document=True
    )
    if result:
        await log_inventory_change(
            product_id=product_id,
            product_name=product.get("name", ""),
            user_id=user_id,
            user_name=user_name,
            action_type=action_type,
            qty_before=old_qty,
            qty_after=result.get("simple_inventory_qty", 0),
        )


# ─── ENDPOINTS ───

@router.get("")
async def list_simple_inventory(user=Depends(get_current_user)):
    """List all products with simple inventory enabled"""
    user_perms = get_permissions(user.get("role", "waiter"), user.get("permissions", {}))
    if user.get("role") not in ("admin", "manager") and not user_perms.get("manage_inventory"):
        raise HTTPException(status_code=403, detail="No tienes permiso para ver inventario")

    products = await db.products.find(
        {"simple_inventory_enabled": True, "active": True},
        {"_id": 0, "id": 1, "name": 1, "category_id": 1,
         "simple_inventory_qty": 1, "simple_inventory_alert_qty": 1,
         "simple_inventory_enabled": 1}
    ).to_list(500)

    # Get last modification for each product
    for p in products:
        last_log = await db.inventory_audit_log.find_one(
            {"product_id": p["id"]},
            {"_id": 0, "created_at": 1, "user_name": 1, "action_type": 1}
        )
        if last_log:
            p["last_modified_at"] = last_log.get("created_at")
            p["last_modified_by"] = last_log.get("user_name")
            p["last_action_type"] = last_log.get("action_type")

    return products


@router.put("/{product_id}/adjust")
async def adjust_stock(product_id: str, input: AdjustStockInput, user=Depends(get_current_user)):
    """Manually adjust stock for a product (restock or correction)"""
    user_perms = get_permissions(user.get("role", "waiter"), user.get("permissions", {}))
    if user.get("role") not in ("admin", "manager") and not user_perms.get("manage_inventory"):
        raise HTTPException(status_code=403, detail="No tienes permiso para ajustar inventario")

    if input.new_qty < 0:
        raise HTTPException(status_code=400, detail="La cantidad no puede ser negativa")

    product = await db.products.find_one({"id": product_id}, {"_id": 0, "name": 1, "simple_inventory_qty": 1, "simple_inventory_enabled": 1})
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    old_qty = product.get("simple_inventory_qty", 0)
    action_type = "restock" if input.new_qty > old_qty else "manual_adjustment"

    await db.products.update_one(
        {"id": product_id},
        {"$set": {"simple_inventory_qty": input.new_qty}}
    )

    await log_inventory_change(
        product_id=product_id,
        product_name=product.get("name", ""),
        user_id=user["user_id"],
        user_name=user["name"],
        action_type=action_type,
        qty_before=old_qty,
        qty_after=input.new_qty,
        reason=input.reason,
    )

    return {"ok": True, "product_id": product_id, "old_qty": old_qty, "new_qty": input.new_qty}


@router.get("/audit-log")
async def get_audit_log(
    product_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    user=Depends(get_current_user)
):
    """Get inventory audit log with filters"""
    user_perms = get_permissions(user.get("role", "waiter"), user.get("permissions", {}))
    if user.get("role") not in ("admin", "manager") and not user_perms.get("manage_inventory"):
        raise HTTPException(status_code=403, detail="No tienes permiso para ver el reporte de inventario")

    query = {}
    if product_id:
        query["product_id"] = product_id
    if user_id:
        query["user_id"] = user_id
    if action_type:
        query["action_type"] = action_type
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = f"{end_date}T23:59:59.999999"
        query["created_at"] = date_filter

    logs = await db.inventory_audit_log.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs


@router.get("/audit-log/export-csv")
async def export_audit_log_csv(
    product_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    user=Depends(get_current_user)
):
    """Export audit log as CSV"""
    user_perms = get_permissions(user.get("role", "waiter"), user.get("permissions", {}))
    if user.get("role") not in ("admin", "manager") and not user_perms.get("manage_inventory"):
        raise HTTPException(status_code=403, detail="No tienes permiso para exportar")

    query = {}
    if product_id:
        query["product_id"] = product_id
    if user_id:
        query["user_id"] = user_id
    if action_type:
        query["action_type"] = action_type
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = f"{end_date}T23:59:59.999999"
        query["created_at"] = date_filter

    logs = await db.inventory_audit_log.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Fecha", "Producto", "Usuario", "Tipo", "Cant. Anterior", "Cant. Nueva", "Cambio", "Motivo"])
    for log in logs:
        writer.writerow([
            log.get("created_at", "")[:19].replace("T", " "),
            log.get("product_name", ""),
            log.get("user_name", ""),
            log.get("action_type", ""),
            log.get("qty_before", ""),
            log.get("qty_after", ""),
            log.get("qty_change", ""),
            log.get("reason", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventario_auditoria.csv"}
    )


@router.get("/products-with-simple")
async def get_products_with_simple_inventory():
    """
    Returns simple inventory data for all active products that have it enabled.
    Used by OrderScreen to show badges and control stock.
    """
    products = await db.products.find(
        {"simple_inventory_enabled": True, "active": True},
        {"_id": 0, "id": 1, "simple_inventory_qty": 1, "simple_inventory_alert_qty": 1}
    ).to_list(500)
    return products
