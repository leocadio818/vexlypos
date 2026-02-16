# Billing Router - Bills, Payments, Payment Methods
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from pymongo import ReturnDocument
import uuid

router = APIRouter(tags=["billing"])

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
class CreateBillInput(BaseModel):
    order_id: str
    table_id: str
    label: str = ""
    item_ids: List[str] = []
    tip_percentage: float = 10
    payment_method: str = "cash"
    customer_id: str = ""

class PayBillInput(BaseModel):
    payment_method: str = "cash"
    payment_method_id: str = ""
    tip_percentage: float = 0
    additional_tip: float = 0
    customer_id: str = ""
    sale_type: str = "dine_in"

# ─── PAYMENT METHODS ───
@router.get("/payment-methods")
async def list_payment_methods():
    methods = await db.payment_methods.find({}, {"_id": 0}).to_list(50)
    if not methods:
        defaults = [
            {"id": gen_id(), "name": "Efectivo RD$", "icon": "banknote", "icon_type": "lucide", "brand_icon": None, "bg_color": "#16a34a", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 0, "is_cash": True},
            {"id": gen_id(), "name": "Tarjeta de Crédito", "icon": "credit-card", "icon_type": "brand", "brand_icon": "visa", "bg_color": "#1e40af", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 1, "is_cash": False},
            {"id": gen_id(), "name": "Tarjeta de Débito", "icon": "credit-card", "icon_type": "brand", "brand_icon": "mastercard", "bg_color": "#7c3aed", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 2, "is_cash": False},
            {"id": gen_id(), "name": "Transferencia", "icon": "smartphone", "icon_type": "lucide", "brand_icon": None, "bg_color": "#0891b2", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 3, "is_cash": False},
            {"id": gen_id(), "name": "USD Dólar", "icon": "dollar-sign", "icon_type": "lucide", "brand_icon": None, "bg_color": "#059669", "text_color": "#ffffff", "currency": "USD", "exchange_rate": 58.50, "active": True, "order": 4, "is_cash": True},
            {"id": gen_id(), "name": "EUR Euro", "icon": "euro", "icon_type": "lucide", "brand_icon": None, "bg_color": "#d97706", "text_color": "#ffffff", "currency": "EUR", "exchange_rate": 63.20, "active": True, "order": 5, "is_cash": True},
        ]
        await db.payment_methods.insert_many(defaults)
        return defaults
    
    default_colors = {
        "Efectivo": "#16a34a", "Efectivo RD$": "#16a34a",
        "Tarjeta de Credito": "#1e40af", "Tarjeta de Crédito": "#1e40af",
        "Tarjeta de Debito": "#7c3aed", "Tarjeta de Débito": "#7c3aed",
        "Transferencia": "#0891b2",
        "USD": "#059669", "USD DOLAR": "#059669", "USD Dólar": "#059669",
        "EUR": "#d97706", "EUR Euro": "#d97706",
    }
    cash_keywords = ["efectivo", "cash", "usd", "eur", "dolar", "euro", "dollar"]
    
    for m in methods:
        if "bg_color" not in m or not m["bg_color"]:
            m["bg_color"] = default_colors.get(m.get("name", ""), "#6b7280")
        if "text_color" not in m or not m["text_color"]:
            m["text_color"] = "#ffffff"
        if "icon_type" not in m:
            m["icon_type"] = "lucide"
        if "brand_icon" not in m:
            m["brand_icon"] = None
        if "order" not in m:
            m["order"] = 0
        if "is_cash" not in m:
            name_lower = m.get("name", "").lower()
            m["is_cash"] = any(kw in name_lower for kw in cash_keywords)
    return methods

@router.post("/payment-methods")
async def create_payment_method(input: dict):
    count = await db.payment_methods.count_documents({})
    doc = {
        "id": gen_id(), 
        "name": input.get("name", ""), 
        "icon": input.get("icon", "circle"),
        "icon_type": input.get("icon_type", "lucide"),
        "brand_icon": input.get("brand_icon"),
        "bg_color": input.get("bg_color", "#6b7280"),
        "text_color": input.get("text_color", "#ffffff"),
        "currency": input.get("currency", "DOP"),
        "exchange_rate": input.get("exchange_rate", 1),
        "active": True,
        "order": count,
        "is_cash": input.get("is_cash", True)
    }
    await db.payment_methods.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/payment-methods/{mid}")
async def update_payment_method(mid: str, input: dict):
    if "_id" in input:
        del input["_id"]
    await db.payment_methods.update_one({"id": mid}, {"$set": input})
    return {"ok": True}

@router.delete("/payment-methods/{mid}")
async def delete_payment_method(mid: str):
    await db.payment_methods.delete_one({"id": mid})
    return {"ok": True}

# ─── BILLS ───
@router.get("/bills")
async def list_bills(status: Optional[str] = Query(None), table_id: Optional[str] = Query(None), order_id: Optional[str] = Query(None)):
    query = {}
    if status:
        query["status"] = status
    if table_id:
        query["table_id"] = table_id
    if order_id:
        query["order_id"] = order_id
    return await db.bills.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

@router.get("/bills/{bill_id}")
async def get_bill(bill_id: str):
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return bill

@router.post("/bills")
async def create_bill(input: CreateBillInput, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": input.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    table = await db.tables.find_one({"id": input.table_id}, {"_id": 0})

    if input.item_ids:
        bill_items = [i for i in order["items"] if i["id"] in input.item_ids and i["status"] != "cancelled"]
    else:
        bill_items = [i for i in order["items"] if i["status"] != "cancelled"]

    # Get all product IDs to fetch their tax exemptions
    product_ids = list(set(item.get("product_id") for item in bill_items if item.get("product_id")))
    products = await db.products.find({"id": {"$in": product_ids}}, {"_id": 0}).to_list(100)
    product_exemptions_map = {p["id"]: p.get("tax_exemptions", []) for p in products}

    # Get sale type exemptions
    sale_type_exemptions = []
    sale_type_code = order.get("sale_type", "dine_in")
    sale_type = await db.sale_types.find_one({"code": sale_type_code}, {"_id": 0})
    if sale_type:
        sale_type_exemptions = sale_type.get("tax_exemptions", [])

    subtotal = 0
    items_data = []
    # Track per-item subtotals and their exemptions for granular tax calculation
    item_tax_data = []
    
    for item in bill_items:
        mod_total = sum(m.get("price", 0) for m in item.get("modifiers", []))
        item_total = (item["unit_price"] + mod_total) * item["quantity"]
        subtotal += item_total
        
        # Get product-level exemptions
        product_id = item.get("product_id", "")
        product_exemptions = product_exemptions_map.get(product_id, [])
        
        items_data.append({
            "item_id": item["id"], "product_name": item["product_name"],
            "product_id": product_id,
            "quantity": item["quantity"], "unit_price": item["unit_price"],
            "modifiers": item.get("modifiers", []), "modifiers_total": mod_total,
            "total": round(item_total, 2)
        })
        
        item_tax_data.append({
            "subtotal": item_total,
            "product_exemptions": product_exemptions
        })

    # Get all active taxes
    taxes = await db.tax_config.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(10)
    if not taxes:
        taxes = [
            {"id": "itbis_default", "description": "ITBIS", "rate": 18, "is_tip": False}, 
            {"id": "propina_default", "description": "Propina Legal", "rate": 10, "is_tip": True}
        ]
    
    tax_breakdown = []
    total_taxes = 0
    itbis_amount = 0
    propina_amount = 0
    
    for tax in taxes:
        tax_id = tax.get("id", "")
        rate = tax.get("rate", 0)
        if rate <= 0:
            continue
        
        # Check if this tax is exempt at the sale type level
        if tax_id in sale_type_exemptions:
            continue
        
        is_tip = tax.get("is_tip", False)
        
        # Calculate taxable base (excluding items that are exempt from this tax)
        taxable_base = 0
        for item_data in item_tax_data:
            # If product is exempt from this tax, skip it
            if tax_id in item_data["product_exemptions"]:
                continue
            taxable_base += item_data["subtotal"]
        
        if taxable_base <= 0:
            continue
        
        base = taxable_base if not tax.get("apply_to_tip") else (taxable_base + total_taxes)
        amount = round(base * (rate / 100), 2)
        
        tax_breakdown.append({
            "tax_id": tax_id,
            "description": tax["description"], 
            "rate": rate, 
            "amount": amount, 
            "is_tip": is_tip,
            "taxable_base": round(taxable_base, 2)
        })
        total_taxes += amount
        if is_tip:
            propina_amount += amount
        else:
            itbis_amount += amount
    
    total = round(subtotal + total_taxes, 2)

    ncf_doc = await db.ncf_sequences.find_one_and_update(
        {"prefix": "B01"},
        {"$inc": {"current_number": 1}},
        return_document=ReturnDocument.AFTER,
        upsert=True
    )
    ncf_num = ncf_doc.get("current_number", 1)
    ncf = f"B01{ncf_num:08d}"

    bill = {
        "id": gen_id(), "order_id": input.order_id, "table_id": input.table_id,
        "table_number": table["number"] if table else 0,
        "label": input.label or f"Mesa {table['number'] if table else '?'}",
        "items": items_data, "subtotal": round(subtotal, 2),
        "itbis": itbis_amount, "itbis_rate": 18,
        "propina_legal": propina_amount, "propina_percentage": 10,
        "tax_breakdown": tax_breakdown,
        "sale_type": sale_type_code,
        "sale_type_name": sale_type.get("name", "") if sale_type else "",
        "total": total, "ncf": ncf,
        "payment_method": input.payment_method,
        "cashier_id": user["user_id"], "cashier_name": user["name"],
        "status": "open", "created_at": now_iso(), "paid_at": None
    }
    await db.bills.insert_one(bill)
    return {k: v for k, v in bill.items() if k != "_id"}

@router.post("/bills/{bill_id}/pay")
async def pay_bill(bill_id: str, input: PayBillInput, user=Depends(get_current_user)):
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    propina = round(bill["subtotal"] * (input.tip_percentage / 100), 2) + input.additional_tip
    itbis = bill.get("itbis", 0)
    total = round(bill["subtotal"] + itbis + propina, 2)

    await db.bills.update_one({"id": bill_id}, {"$set": {
        "status": "paid", "payment_method": input.payment_method,
        "propina_legal": propina, "propina_percentage": input.tip_percentage,
        "total": total, "paid_at": now_iso()
    }})

    shift = await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})
    if shift:
        field = "cash_sales" if input.payment_method == "cash" else "card_sales"
        await db.shifts.update_one({"id": shift["id"]}, {
            "$inc": {field: total, "total_sales": total, "total_tips": propina}
        })

    order_id = bill["order_id"]
    
    open_bills = await db.bills.count_documents({"order_id": order_id, "status": "open"})
    if open_bills == 0:
        all_paid = await db.bills.count_documents({"order_id": order_id, "status": "paid"})
        if all_paid > 0:
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "completed"}})
            await db.tables.update_one(
                {"id": bill["table_id"]},
                {"$set": {"status": "free", "active_order_id": None}}
            )
    else:
        await db.tables.update_one({"id": bill["table_id"]}, {"$set": {"status": "billed"}})

    cust_id = input.customer_id or bill.get("customer_id", "")
    points_earned = 0
    if cust_id:
        config = await db.loyalty_config.find_one({}, {"_id": 0}) or {"points_per_hundred": 10}
        points_earned = int((total / 100) * config.get("points_per_hundred", 10))
        await db.customers.update_one({"id": cust_id}, {
            "$inc": {"points": points_earned, "total_spent": total, "visits": 1},
            "$set": {"last_visit": now_iso()}
        })
        await db.bills.update_one({"id": bill_id}, {"$set": {"customer_id": cust_id, "points_earned": points_earned}})

    result = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if result:
        result["points_earned"] = points_earned
    return result

@router.post("/bills/{bill_id}/cancel")
async def cancel_bill(bill_id: str, user=Depends(get_current_user)):
    await db.bills.update_one({"id": bill_id}, {"$set": {"status": "cancelled"}})
    shift = await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})
    if shift:
        await db.shifts.update_one({"id": shift["id"]}, {"$inc": {"cancelled_count": 1}})
    return {"ok": True}

# ─── TAX CONFIG ───
@router.get("/tax-config")
async def get_tax_config():
    taxes = await db.tax_config.find({}, {"_id": 0}).sort("order", 1).to_list(20)
    if not taxes:
        defaults = [
            {"id": gen_id(), "description": "ITBIS (18%)", "rate": 18, "active": True, "is_tip": False, "apply_to_tip": False, "order": 0},
            {"id": gen_id(), "description": "LEY (10%)", "rate": 10, "active": True, "is_tip": True, "apply_to_tip": False, "order": 1}
        ]
        await db.tax_config.insert_many(defaults)
        return defaults
    return taxes

@router.put("/tax-config")
async def update_tax_config(input: dict):
    taxes = input.get("taxes", [])
    await db.tax_config.delete_many({})
    if taxes:
        for i, tax in enumerate(taxes):
            tax["order"] = i
            if "id" not in tax:
                tax["id"] = gen_id()
        await db.tax_config.insert_many(taxes)
    return {"ok": True, "count": len(taxes)}

@router.get("/tax-config/calculate")
async def calculate_taxes(subtotal: float = Query(0)):
    taxes = await db.tax_config.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(10)
    if not taxes:
        taxes = [{"description": "ITBIS", "rate": 18, "is_tip": False}, {"description": "Propina Legal", "rate": 10, "is_tip": True}]
    
    breakdown = []
    running_total = subtotal
    for tax in taxes:
        rate = tax.get("rate", 0)
        if rate <= 0:
            continue
        base = running_total if tax.get("apply_to_tip") else subtotal
        amount = round(base * (rate / 100), 2)
        breakdown.append({"description": tax["description"], "rate": rate, "amount": amount, "is_tip": tax.get("is_tip", False)})
        running_total += amount
    
    return {"subtotal": subtotal, "taxes": breakdown, "total": round(running_total, 2)}

# ─── SALE TYPES ───
@router.get("/sale-types")
async def list_sale_types():
    types = await db.sale_types.find({}, {"_id": 0}).to_list(20)
    if not types:
        defaults = [
            {"id": gen_id(), "code": "dine_in", "name": "Para comer aquí", "active": True, "tax_exemptions": []},
            {"id": gen_id(), "code": "takeout", "name": "Para llevar", "active": True, "tax_exemptions": []},
            {"id": gen_id(), "code": "delivery", "name": "Delivery", "active": True, "tax_exemptions": []}
        ]
        await db.sale_types.insert_many(defaults)
        return defaults
    return types

@router.post("/sale-types")
async def create_sale_type(input: dict):
    doc = {
        "id": gen_id(), 
        "code": input.get("code", ""), 
        "name": input.get("name", ""), 
        "active": True,
        "tax_exemptions": input.get("tax_exemptions", [])  # Array of tax IDs this sale type is exempt from
    }
    await db.sale_types.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/sale-types/{sid}")
async def update_sale_type(sid: str, input: dict):
    await db.sale_types.update_one({"id": sid}, {"$set": input})
    return {"ok": True}

@router.delete("/sale-types/{sid}")
async def delete_sale_type(sid: str):
    await db.sale_types.delete_one({"id": sid})
    return {"ok": True}
