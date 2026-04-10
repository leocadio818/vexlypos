# Billing Router - Bills, Payments, Payment Methods
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
from pymongo import ReturnDocument
import uuid
import os

router = APIRouter(tags=["billing"])

# Database reference
db = None

# Supabase client for pos_sessions
supabase_client = None

def set_db(database):
    global db
    db = database

def init_supabase():
    """Initialize Supabase client for pos_sessions integration"""
    global supabase_client
    try:
        from supabase import create_client
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_ANON_KEY", "")
        if url and key:
            supabase_client = create_client(url, key)
    except Exception as e:
        print(f"Warning: Could not initialize Supabase for billing: {e}")

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

async def get_next_transaction_number() -> int:
    """
    Genera el siguiente número de transacción interno secuencial.
    Usa find_one_and_update con upsert para garantizar atomicidad.
    Este número es independiente del NCF fiscal y es solo para control interno.
    """
    result = await db.counters.find_one_and_update(
        {"_id": "internal_transaction"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER
    )
    return result["seq"]

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
    ecf_type: Optional[str] = None

class PaymentEntry(BaseModel):
    """Entrada individual de pago para pagos múltiples"""
    payment_method_id: str
    payment_method_name: str = ""
    amount: float  # Monto en la moneda del método
    amount_dop: float = 0  # Monto convertido a DOP
    currency: str = "DOP"
    exchange_rate: float = 1
    brand_icon: Optional[str] = None

class PayBillInput(BaseModel):
    payment_method: str = "cash"
    payment_method_id: str = ""
    tip_percentage: float = 0
    additional_tip: float = 0
    customer_id: str = ""
    sale_type: str = "dine_in"
    itbis: Optional[float] = None
    propina_legal: Optional[float] = None
    total: Optional[float] = None
    amount_received: Optional[float] = None
    # Nuevo: Lista de pagos múltiples
    payments: Optional[List[PaymentEntry]] = None
    # Nuevo: Información de cambio en moneda extranjera
    change_currency: str = "DOP"  # Moneda en que se da el cambio
    change_amount: float = 0  # Monto del cambio
    # Datos Fiscales (B01, B14, B15)
    fiscal_id: Optional[str] = None  # RNC o Cédula
    fiscal_id_type: Optional[str] = None  # "RNC" o "Cédula"
    razon_social: Optional[str] = None  # Nombre del cliente fiscal
    customer_email: Optional[str] = None  # Email para envío de factura
    send_email: bool = False  # Si enviar factura por email
    ecf_type: Optional[str] = None  # E32, E31, E34, E33 (when e-CF enabled)
    # Descuento aplicado
    discount_applied: Optional[dict] = None

# ─── PAYMENT METHODS ───
@router.get("/payment-methods")
async def list_payment_methods():
    methods = await db.payment_methods.find({}, {"_id": 0}).to_list(50)
    if not methods:
        # Defaults con códigos DGII correctos:
        # 1=Efectivo, 2=Cheque/Transferencia, 3=Tarjeta, 4=Venta a Crédito, 5=Bonos, 6=Permuta, 7=NC, 8=Otras
        defaults = [
            {"id": gen_id(), "name": "Efectivo RD$", "icon": "banknote", "icon_type": "lucide", "brand_icon": None, "bg_color": "#16a34a", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 0, "is_cash": True, "dgii_payment_code": 1},
            {"id": gen_id(), "name": "Tarjeta de Crédito", "icon": "credit-card", "icon_type": "brand", "brand_icon": "visa", "bg_color": "#1e40af", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 1, "is_cash": False, "dgii_payment_code": 3},
            {"id": gen_id(), "name": "Tarjeta de Débito", "icon": "credit-card", "icon_type": "brand", "brand_icon": "mastercard", "bg_color": "#7c3aed", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 2, "is_cash": False, "dgii_payment_code": 3},
            {"id": gen_id(), "name": "Transferencia", "icon": "smartphone", "icon_type": "lucide", "brand_icon": None, "bg_color": "#0891b2", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 3, "is_cash": False, "dgii_payment_code": 2},
            {"id": gen_id(), "name": "USD Dólar", "icon": "dollar-sign", "icon_type": "lucide", "brand_icon": None, "bg_color": "#059669", "text_color": "#ffffff", "currency": "USD", "exchange_rate": 58.50, "active": True, "order": 4, "is_cash": True, "dgii_payment_code": 1},
            {"id": gen_id(), "name": "EUR Euro", "icon": "euro", "icon_type": "lucide", "brand_icon": None, "bg_color": "#d97706", "text_color": "#ffffff", "currency": "EUR", "exchange_rate": 63.20, "active": True, "order": 5, "is_cash": True, "dgii_payment_code": 1},
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
        "is_cash": input.get("is_cash", True),
        "dgii_payment_code": input.get("dgii_payment_code"),  # Código DGII (1-8)
        "force_contingency": input.get("force_contingency", False)  # Para Uber Eats, Pedidos Ya, etc.
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

# ─── EDIT e-CF TYPE (for contingency bills only) ───
@router.patch("/bills/{bill_id}/ecf-type")
async def update_bill_ecf_type(bill_id: str, input: dict, user=Depends(get_current_user)):
    """
    Change the e-CF type of a bill in CONTINGENCIA status.
    Only allowed for authorized users (admin, manager, or users with edit_ecf_type permission).
    """
    # Check permission
    from routers.auth import get_permissions
    permissions = get_permissions(user.get("role", ""), user.get("permissions"))
    user_role = user.get("role", "")
    
    if user_role not in ["admin", "manager", "gerente"] and not permissions.get("edit_ecf_type"):
        raise HTTPException(status_code=403, detail="No tienes permiso para editar el tipo de e-CF")
    
    # Get the bill
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    # Only allow editing CONTINGENCIA bills
    ecf_status = (bill.get("ecf_status") or "").upper()
    if ecf_status != "CONTINGENCIA":
        raise HTTPException(status_code=400, detail="Solo se puede editar el tipo de e-CF en facturas en CONTINGENCIA")
    
    # Validate new ecf_type
    new_ecf_type = input.get("ecf_type", "").upper()
    valid_types = ["E31", "E32", "E34", "E44", "E45"]
    if new_ecf_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Tipo de e-CF inválido. Válidos: {', '.join(valid_types)}")
    
    # Update the bill
    old_ncf = bill.get("ncf", "")
    new_ncf = f"PENDING-{new_ecf_type}"
    
    await db.bills.update_one(
        {"id": bill_id},
        {"$set": {
            "ncf": new_ncf,
            "ncf_type": new_ecf_type,
            "ecf_type_modified": True,
            "ecf_type_modified_by": user.get("user_id"),
            "ecf_type_modified_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Log the change
    from utils.audit import log_action
    await log_action(
        user_id=user.get("user_id"),
        user_name=user.get("name", ""),
        action="ecf_type_changed",
        details=f"Tipo e-CF cambiado de {old_ncf} a {new_ncf} para factura {bill.get('transaction_number')}",
        entity_type="bill",
        entity_id=bill_id
    )
    
    return {"ok": True, "old_ncf": old_ncf, "new_ncf": new_ncf, "message": f"Tipo cambiado a {new_ecf_type}. Presiona 'Reenviar' para enviar a DGII."}

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

    # ─── MODO ENTRENAMIENTO: No consumir NCF real ───
    # Check both JWT and fresh DB value
    user_doc = await db.users.find_one({"id": user["user_id"]}, {"_id": 0, "training_mode": 1})
    is_training = user.get("training_mode", False) or (user_doc.get("training_mode", False) if user_doc else False) or order.get("training_mode", False)
    
    if is_training:
        ncf = "ENTRENAMIENTO"
    elif input.ecf_type:
        # e-CF mode — don't consume local NCF, Alanube handles it
        ncf = f"PENDING-{input.ecf_type}"
    else:
        ncf_doc = await db.ncf_sequences.find_one_and_update(
            {"prefix": "B01"},
            {"$inc": {"current_number": 1}},
            return_document=ReturnDocument.AFTER,
            upsert=True
        )
        ncf_num = ncf_doc.get("current_number", 1)
        ncf = f"B01{ncf_num:08d}"

    # Copiar transaction_number de la orden (ID de Venta persistente)
    transaction_number = order.get("transaction_number")
    if not transaction_number:
        # Órdenes antiguas: generar uno y guardarlo
        transaction_number = await get_next_transaction_number()
        await db.orders.update_one({"id": input.order_id}, {"$set": {"transaction_number": transaction_number}})

    bill = {
        "id": gen_id(), "order_id": input.order_id, "table_id": input.table_id,
        "table_number": table["number"] if table else 0,
        "account_number": order.get("account_number", 1),
        "account_label": order.get("account_label", ""),
        "transaction_number": transaction_number,
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
        "waiter_id": order.get("waiter_id", ""),
        "waiter_name": order.get("waiter_name", ""),
        "training_mode": is_training,
        "ecf_type": input.ecf_type,
        "status": "open", "created_at": now_iso(), "paid_at": None
    }
    await db.bills.insert_one(bill)
    return {k: v for k, v in bill.items() if k != "_id"}

@router.post("/bills/{bill_id}/pay")
async def pay_bill(bill_id: str, input: PayBillInput, user=Depends(get_current_user)):
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    # ─── VERIFICAR JORNADA DE TRABAJO ABIERTA ───
    business_day = await db.business_days.find_one({"status": "open"}, {"_id": 0})
    if not business_day:
        raise HTTPException(
            status_code=403,
            detail="No hay jornada de trabajo abierta. Debe abrir el día antes de procesar pagos."
        )
    
    # 🔒 DO NOT MODIFY - Business date rule
    # Obtener la fecha de negocio (contable) - ALWAYS from business_day document
    # NEVER use datetime.now() for this - it's the fiscal date for grouping
    business_date = business_day["business_date"]
    
    # Use frontend-provided values (already calculated by Intelligent Tax Engine)
    # Fallback to bill's existing values if not provided
    if input.propina_legal is not None:
        propina = round(input.propina_legal + input.additional_tip, 2)
    else:
        propina = round(bill.get("propina_legal", bill["subtotal"] * (input.tip_percentage / 100)), 2) + input.additional_tip
    
    if input.itbis is not None:
        itbis = round(input.itbis, 2)
    else:
        itbis = bill.get("itbis", 0)
    
    if input.total is not None:
        total = round(input.total + input.additional_tip, 2)
    else:
        total = round(bill["subtotal"] + itbis + propina, 2)
    
    # DGII Fiscal Security: Block zero-value invoices
    if total <= 0:
        raise HTTPException(
            status_code=400, 
            detail="No se puede procesar un pago con valor $0.00. La DGII no permite asignar NCF a facturas sin valor."
        )

    # El transaction_number ya viene del bill (copiado de la orden)
    # No se genera nuevo número aquí

    # ─── PROCESAR PAGOS MÚLTIPLES ───
    payments_list = []
    primary_payment_method_name = "Efectivo"
    is_cash_payment = True
    
    if input.payments and len(input.payments) > 0:
        # Pagos múltiples
        for pmt in input.payments:
            pmt_doc = await db.payment_methods.find_one({"id": pmt.payment_method_id}, {"_id": 0})
            if pmt_doc:
                payments_list.append({
                    "payment_method_id": pmt.payment_method_id,
                    "payment_method_name": pmt_doc.get("name", pmt.payment_method_name),
                    "amount": pmt.amount,  # Monto en moneda original
                    "amount_dop": pmt.amount_dop if pmt.amount_dop else round(pmt.amount * pmt_doc.get("exchange_rate", 1), 2),
                    "currency": pmt_doc.get("currency", "DOP"),
                    "exchange_rate": pmt_doc.get("exchange_rate", 1),
                    "brand_icon": pmt_doc.get("brand_icon"),
                    "is_cash": pmt_doc.get("is_cash", False),
                    "dgii_payment_code": pmt_doc.get("dgii_payment_code"),  # Código DGII para e-CF
                    "force_contingency": pmt_doc.get("force_contingency", False)  # Uber Eats, Pedidos Ya, etc.
                })
        
        # El método principal es el primero de la lista
        if payments_list:
            primary_payment_method_name = payments_list[0]["payment_method_name"]
            is_cash_payment = payments_list[0].get("is_cash", True)
            # Check if any payment method forces contingency
            force_contingency = any(p.get("force_contingency", False) for p in payments_list)
    else:
        # Pago único (compatibilidad hacia atrás)
        payment_method_doc = await db.payment_methods.find_one({"id": input.payment_method_id}, {"_id": 0})
        if payment_method_doc:
            is_cash_payment = payment_method_doc.get("is_cash", input.payment_method == "cash")
            primary_payment_method_name = payment_method_doc.get("name", input.payment_method)
            payments_list.append({
                "payment_method_id": input.payment_method_id,
                "payment_method_name": primary_payment_method_name,
                "amount": input.amount_received or total,
                "amount_dop": total,
                "currency": payment_method_doc.get("currency", "DOP"),
                "exchange_rate": payment_method_doc.get("exchange_rate", 1),
                "brand_icon": payment_method_doc.get("brand_icon"),
                "is_cash": is_cash_payment,
                "dgii_payment_code": payment_method_doc.get("dgii_payment_code"),  # Código DGII para e-CF
                "force_contingency": payment_method_doc.get("force_contingency", False)  # Uber Eats, Pedidos Ya, etc.
            })
            force_contingency = payment_method_doc.get("force_contingency", False)
        elif input.payment_method == "card":
            is_cash_payment = False
            primary_payment_method_name = "Tarjeta"
            force_contingency = False
    else:
        force_contingency = False

    update_fields = {
        "status": "paid", "payment_method": input.payment_method,
        "payment_method_name": primary_payment_method_name,
        "payments": payments_list,  # Lista de pagos múltiples
        "propina_legal": propina, "propina_percentage": input.tip_percentage if input.propina_legal is None else bill.get("propina_percentage", 10),
        "itbis": itbis,
        "total": total, "paid_at": now_iso(),
        "paid_by_id": user["user_id"],
        "paid_by_name": user["name"],
        "change_currency": input.change_currency,
        "change_amount": input.change_amount,
        # Datos Fiscales (B01, B14, B15)
        "fiscal_id": input.fiscal_id,
        "fiscal_id_type": input.fiscal_id_type,
        "razon_social": input.razon_social,
        "customer_email": input.customer_email,
        "send_email": input.send_email,
        "ecf_type": input.ecf_type,
        "force_contingency": force_contingency,  # Mark bill for manual contingency (Uber Eats, etc.)
        # Update NCF to reflect e-CF when applicable
        **({"ncf": f"PENDING-{input.ecf_type}"} if input.ecf_type and bill.get("ncf", "").startswith("B") else {}),
        # Doble marcación de tiempo (Jornada de Trabajo)
        "business_date": business_date,  # Fecha contable (jornada)
        "business_day_id": business_day["id"],  # Referencia a la jornada
        # Descuento aplicado
        "discount_applied": input.discount_applied
    }
    # Rebuild tax_breakdown with adjusted values (reflects tax overrides)
    existing_breakdown = bill.get("tax_breakdown", [])
    adjusted_breakdown = []
    for tax in existing_breakdown:
        adj = {**tax}
        if tax.get("is_tip"):
            adj["amount"] = round(propina, 2)
        else:
            adj["amount"] = round(itbis, 2)
        adjusted_breakdown.append(adj)
    update_fields["tax_breakdown"] = adjusted_breakdown
    if input.amount_received is not None:
        update_fields["amount_received"] = input.amount_received
    await db.bills.update_one({"id": bill_id}, {"$set": update_fields})

    # ─── FORCE CONTINGENCY: Mark bill as CONTINGENCIA immediately ───
    # For payment methods like Uber Eats, Pedidos Ya that generate their own e-CF
    if force_contingency and input.ecf_type:
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "CONTINGENCIA",
            "ecf_error": "Contingencia manual - plataforma externa genera e-CF",
            "ecf_manual_contingency": True
        }})

    # ─── MODO ENTRENAMIENTO: No afectar totales reales ───
    user_doc_pay = await db.users.find_one({"id": user["user_id"]}, {"_id": 0, "training_mode": 1})
    is_training_bill = bill.get("training_mode", False) or user.get("training_mode", False) or (user_doc_pay.get("training_mode", False) if user_doc_pay else False)
    
    if is_training_bill:
        # Marcar el bill como entrenamiento si no lo estaba
        await db.bills.update_one({"id": bill_id}, {"$set": {"training_mode": True}})
    
    if not is_training_bill:
        # ─── ACTUALIZAR TOTALES DE LA JORNADA (solo ventas reales) ───
        # Distribuir por método de pago individual (pagos mixtos)
        day_cash = 0
        day_card = 0
        day_transfer = 0
        for pmt in payments_list:
            amt = pmt.get("amount_dop", 0) or 0
            name_lower = (pmt.get("payment_method_name", "") or "").lower()
            if pmt.get("is_cash", False):
                day_cash += amt
            elif "tarjeta" in name_lower or "card" in name_lower:
                day_card += amt
            elif "transfer" in name_lower:
                day_transfer += amt
            else:
                day_card += amt  # Default: treat as card
        
        await db.business_days.update_one(
            {"id": business_day["id"]},
            {"$inc": {
                "total_sales": total,
                "total_invoices": 1,
                "total_cash": round(day_cash, 2),
                "total_card": round(day_card, 2),
                "total_transfer": round(day_transfer, 2)
            }}
        )

        # Update MongoDB shifts (legacy) - distribuir por método de pago
        shift = await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})
        if shift:
            shift_cash = 0
            shift_card = 0
            for pmt in payments_list:
                amt = pmt.get("amount_dop", 0) or 0
                if pmt.get("is_cash", False):
                    shift_cash += amt
                else:
                    shift_card += amt
            await db.shifts.update_one({"id": shift["id"]}, {
                "$inc": {"cash_sales": round(shift_cash, 2), "card_sales": round(shift_card, 2), "total_sales": total, "total_tips": propina}
            })

        # ─── SUPABASE: Update pos_sessions ───
        if supabase_client:
            try:
                # Find active session for this user
                session_result = supabase_client.table("pos_sessions").select("*").eq("opened_by", user["user_id"]).eq("status", "open").limit(1).execute()
                
                if session_result.data and len(session_result.data) > 0:
                    session = session_result.data[0]
                    session_id = session["id"]
                    
                    # Distribute by individual payment method (mixed payments)
                    sess_cash = 0
                    sess_card = 0
                    sess_transfer = 0
                    sess_other = 0
                    for pmt in payments_list:
                        amt = pmt.get("amount_dop", 0) or 0
                        name_lower = (pmt.get("payment_method_name", "") or "").lower()
                        if pmt.get("is_cash", False):
                            sess_cash += amt
                        elif "tarjeta" in name_lower or "card" in name_lower:
                            sess_card += amt
                        elif "transfer" in name_lower:
                            sess_transfer += amt
                        else:
                            sess_other += amt
                    
                    update_data = {"total_invoices": (session.get("total_invoices") or 0) + 1}
                    if sess_cash > 0:
                        update_data["cash_sales"] = (session.get("cash_sales") or 0) + round(sess_cash, 2)
                    if sess_card > 0:
                        update_data["card_sales"] = (session.get("card_sales") or 0) + round(sess_card, 2)
                    if sess_transfer > 0:
                        update_data["transfer_sales"] = (session.get("transfer_sales") or 0) + round(sess_transfer, 2)
                    if sess_other > 0:
                        update_data["other_sales"] = (session.get("other_sales") or 0) + round(sess_other, 2)
                    
                    movement_payment_method = "mixed" if len(payments_list) > 1 else ("cash" if is_cash_payment else "other")
                    
                    # Update session totals
                    supabase_client.table("pos_sessions").update(update_data).eq("id", session_id).execute()
                    
                    # Create cash_movement record for this sale
                    txn_num = ""
                    try:
                        order_doc = await db.orders.find_one({"id": bill.get("order_id")}, {"_id": 0, "transaction_number": 1})
                        if order_doc and order_doc.get("transaction_number"):
                            txn_num = f" | T-{order_doc['transaction_number']}"
                    except:
                        pass
                    
                    # Prefer ecf_type prefix over B-series for movement description
                    display_ncf = bill.get('ncf', bill_id[:8])
                    if input.ecf_type and display_ncf.startswith('B'):
                        display_ncf = f"PENDING-{input.ecf_type}"
                    
                    if len(payments_list) > 1:
                        pmt_names = ", ".join([p["payment_method_name"] for p in payments_list])
                        pmt_description = f"[BILL:{bill_id}] Venta {display_ncf}{txn_num} - Pago mixto: {pmt_names}"
                    else:
                        pmt_description = f"[BILL:{bill_id}] Venta {display_ncf}{txn_num} - {primary_payment_method_name}"
                    
                    supabase_movement_id = gen_id()
                    movement_ref = f"MOV-{datetime.now().year}-{gen_id()[:5].upper()}"
                    movement_data = {
                        "id": supabase_movement_id,
                        "ref": movement_ref,
                        "session_id": session_id,
                        "movement_type": "sale",
                        "direction": 1,
                        "amount": total,
                        "payment_method": movement_payment_method,
                        "description": pmt_description,
                        "created_by": user["user_id"],
                        "created_by_name": user["name"]
                    }
                    supabase_client.table("cash_movements").insert(movement_data).execute()
                    
                    # ── TRACEABILITY BRIDGE: Save Supabase reference in MongoDB bill ──
                    await db.bills.update_one({"id": bill_id}, {"$set": {
                        "supabase_transaction_id": supabase_movement_id,
                        "supabase_movement_ref": movement_ref,
                    }})
                    
            except Exception as e:
                print(f"Warning: Could not update Supabase pos_session: {e}")

    order_id = bill["order_id"]
    
    open_bills = await db.bills.count_documents({"order_id": order_id, "status": "open"})
    if open_bills == 0:
        all_paid = await db.bills.count_documents({"order_id": order_id, "status": "paid"})
        if all_paid > 0:
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "closed"}})
            
            # For divided tables: check if OTHER orders still exist for this table
            table_id = bill.get("table_id")
            if table_id:
                other_active_orders = await db.orders.count_documents({
                    "table_id": table_id,
                    "status": {"$in": ["active", "sent"]},
                    "id": {"$ne": order_id}
                })
                if other_active_orders > 0:
                    # Still has active orders — keep table as divided/occupied
                    remaining = await db.orders.find(
                        {"table_id": table_id, "status": {"$in": ["active", "sent"]}},
                        {"_id": 0, "id": 1}
                    ).to_list(10)
                    new_status = "divided" if len(remaining) > 1 else "occupied"
                    await db.tables.update_one(
                        {"id": table_id},
                        {"$set": {"status": new_status, "active_order_id": remaining[0]["id"]}}
                    )
                else:
                    # No more active orders — free the table
                    await db.tables.update_one(
                        {"id": table_id},
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

    # ─── AUDIT: LOG BILL PAYMENT ───
    from utils.audit import log_bill_paid, log_discount_applied
    table_num = bill.get("table_label", bill.get("table_id", "?"))
    # 🔒 DO NOT MODIFY - e-NCF display rule (Protected 2026-04-09)
    # Always use ecf_encf (E31/E32/E34) for display
    # Never use ncf (B01) in any visible output
    # See PRD.md "PERMANENT ARCHITECTURAL RULES" section
    audit_ncf = bill.get("ecf_encf") or bill.get("ncf", "")
    await log_bill_paid(
        db=db,
        user_id=user["user_id"],
        user_name=user.get("name", ""),
        role=user.get("role", ""),
        bill_id=bill_id,
        ncf=audit_ncf,
        total=total,
        payment_method=primary_payment_method_name,
        table_number=table_num
    )
    
    # Log discount if applied
    if input.discount_applied and input.discount_applied.get("amount", 0) > 0:
        await log_discount_applied(
            db=db,
            user_id=user["user_id"],
            user_name=user.get("name", ""),
            role=user.get("role", ""),
            bill_id=bill_id,
            discount_name=input.discount_applied.get("name", "Descuento"),
            discount_amount=input.discount_applied.get("amount", 0),
            authorized_by_name=input.discount_applied.get("authorized_by", "")
        )

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
            {"id": gen_id(), "code": "dine_in", "name": "Para comer aquí", "active": True, "tax_exemptions": [], "default_ncf_type_id": "B02"},
            {"id": gen_id(), "code": "takeout", "name": "Para llevar", "active": True, "tax_exemptions": [], "default_ncf_type_id": "B02"},
            {"id": gen_id(), "code": "delivery", "name": "Delivery", "active": True, "tax_exemptions": [], "default_ncf_type_id": "B02"}
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
        "tax_exemptions": input.get("tax_exemptions", []),  # Array of tax IDs this sale type is exempt from
        "default_ncf_type_id": input.get("default_ncf_type_id", "B02")  # Default NCF type (B01, B02, B14, B15)
    }
    await db.sale_types.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/sale-types/{sid}")
async def update_sale_type(sid: str, input: dict):
    # Ensure we can update the default_ncf_type_id field
    update_data = {}
    allowed_fields = ["name", "code", "active", "tax_exemptions", "default_ncf_type_id"]
    for field in allowed_fields:
        if field in input:
            update_data[field] = input[field]
    await db.sale_types.update_one({"id": sid}, {"$set": update_data})
    return {"ok": True}

@router.delete("/sale-types/{sid}")
async def delete_sale_type(sid: str):
    await db.sale_types.delete_one({"id": sid})
    return {"ok": True}
