"""
Motor de Reglas de Descuento (Discount Engine).
CRUD para descuentos + motor de aplicacion en carrito.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/discounts", tags=["discounts"])
db = None

def set_db(database):
    global db
    db = database


# ─── MODELS ───
class DiscountCreate(BaseModel):
    name: str
    description: str = ""
    type: str = Field(..., pattern="^(PERCENTAGE|FIXED_AMOUNT|NEW_PRICE)$")
    value: float = Field(..., gt=0)
    scope: str = Field(..., pattern="^(GLOBAL|CATEGORY|SPECIFIC_PRODUCTS)$")
    target_ids: list[str] = []
    authorization_level: str = Field(default="CASHIER", pattern="^(CASHIER|MANAGER_PIN_REQUIRED)$")
    active_from: Optional[str] = None
    active_to: Optional[str] = None
    schedule_start_time: Optional[str] = None  # HH:MM for Happy Hour
    schedule_end_time: Optional[str] = None    # HH:MM for Happy Hour
    active: bool = True


class DiscountApply(BaseModel):
    discount_id: str
    bill_id: str


# ─── CRUD ───
@router.get("")
async def list_discounts():
    docs = await db.discounts.find({}, {"_id": 0}).to_list(500)
    return docs


@router.get("/active")
async def list_active_discounts():
    """Get discounts valid right now (active, within date range and schedule)."""
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    docs = await db.discounts.find({"active": True}, {"_id": 0}).to_list(500)
    
    result = []
    for d in docs:
        # Check date range
        if d.get("active_from") and now_iso < d["active_from"]:
            continue
        if d.get("active_to") and now_iso > d["active_to"]:
            continue
        # Check schedule (Happy Hour)
        if d.get("schedule_start_time") and d.get("schedule_end_time"):
            current_time = now.strftime("%H:%M")
            if not (d["schedule_start_time"] <= current_time <= d["schedule_end_time"]):
                continue
        result.append(d)
    return result


@router.post("")
async def create_discount(data: DiscountCreate):
    doc = data.dict()
    doc["id"] = str(uuid.uuid4())[:8]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.discounts.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/{discount_id}")
async def update_discount(discount_id: str, data: DiscountCreate):
    existing = await db.discounts.find_one({"id": discount_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Descuento no encontrado")
    update = data.dict()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.discounts.update_one({"id": discount_id}, {"$set": update})
    return {**update, "id": discount_id}


@router.delete("/{discount_id}")
async def delete_discount(discount_id: str):
    result = await db.discounts.delete_one({"id": discount_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Descuento no encontrado")
    return {"deleted": True}


# ─── MOTOR DE CALCULO ───
@router.post("/calculate")
async def calculate_discount(body: dict):
    """
    Calculate discount for a bill.
    Input: { discount_id, bill_id }
    Returns: { discount_amount, affected_items, new_subtotal, new_itbis, new_propina, new_total }
    
    REGLA FISCAL: Descuento se aplica al subtotal ANTES de impuestos,
    reduciendo la base imponible para ITBIS y propina.
    """
    discount_id = body.get("discount_id")
    bill_id = body.get("bill_id")
    
    if not discount_id or not bill_id:
        raise HTTPException(status_code=400, detail="discount_id y bill_id requeridos")
    
    discount = await db.discounts.find_one({"id": discount_id}, {"_id": 0})
    if not discount:
        raise HTTPException(status_code=404, detail="Descuento no encontrado")
    
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    items = bill.get("items", [])
    original_subtotal = bill.get("subtotal", 0)
    tax_breakdown = bill.get("tax_breakdown", [])
    
    # Determine which items are affected
    affected_items = []
    affected_subtotal = 0
    
    if discount["scope"] == "GLOBAL":
        affected_items = [i["product_name"] for i in items]
        affected_subtotal = original_subtotal
    elif discount["scope"] == "CATEGORY":
        target_cats = set(discount.get("target_ids", []))
        for item in items:
            cat_id = item.get("category_id", "")
            if cat_id in target_cats:
                affected_items.append(item["product_name"])
                affected_subtotal += item.get("total", 0)
    elif discount["scope"] == "SPECIFIC_PRODUCTS":
        target_prods = set(discount.get("target_ids", []))
        for item in items:
            if item.get("product_id", "") in target_prods:
                affected_items.append(item["product_name"])
                affected_subtotal += item.get("total", 0)
    
    if affected_subtotal <= 0:
        return {
            "discount_amount": 0,
            "affected_items": [],
            "new_subtotal": original_subtotal,
            "new_total": bill.get("total", 0),
            "message": "Ningun item aplica para este descuento"
        }
    
    # Calculate discount amount
    if discount["type"] == "PERCENTAGE":
        discount_amount = round(affected_subtotal * (discount["value"] / 100), 2)
    elif discount["type"] == "FIXED_AMOUNT":
        discount_amount = min(discount["value"], affected_subtotal)
    elif discount["type"] == "NEW_PRICE":
        # NEW_PRICE only makes sense for single-product discounts
        if len(affected_items) == 1:
            discount_amount = round(affected_subtotal - discount["value"], 2)
            discount_amount = max(0, discount_amount)
        else:
            discount_amount = 0
    else:
        discount_amount = 0
    
    discount_amount = round(discount_amount, 2)
    
    # New subtotal after discount
    new_subtotal = round(original_subtotal - discount_amount, 2)
    
    # Recalculate taxes on reduced base
    # Ratio of reduction to apply proportionally to taxes
    if original_subtotal > 0:
        ratio = new_subtotal / original_subtotal
    else:
        ratio = 1
    
    new_tax_breakdown = []
    new_itbis = 0
    new_propina = 0
    total_taxes = 0
    
    for tax in tax_breakdown:
        new_amount = round(tax.get("amount", 0) * ratio, 2)
        new_tax_breakdown.append({
            **tax,
            "amount": new_amount,
            "original_amount": tax.get("amount", 0)
        })
        total_taxes += new_amount
        if tax.get("is_tip"):
            new_propina += new_amount
        else:
            new_itbis += new_amount
    
    new_total = round(new_subtotal + total_taxes, 2)
    
    return {
        "discount_id": discount_id,
        "discount_name": discount["name"],
        "discount_type": discount["type"],
        "discount_value": discount["value"],
        "discount_amount": discount_amount,
        "affected_items": affected_items,
        "original_subtotal": original_subtotal,
        "new_subtotal": new_subtotal,
        "new_itbis": round(new_itbis, 2),
        "new_propina": round(new_propina, 2),
        "new_tax_breakdown": new_tax_breakdown,
        "new_total": new_total
    }
