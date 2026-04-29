"""
VexlyPOS — Alanube e-CF Integration Module
===========================================
Maps VexlyPOS bills to Alanube JSON format and sends electronic invoices.
Supports: E31 (Crédito Fiscal), E32 (Consumo), E33 (Nota de Débito), E34 (Nota de Crédito)

Modules:
  1. Mapeo: Converts MongoDB bill → Alanube JSON
  2. Timbrado: Receives response (e-NCF, QR, trackId) → saves to bill
  3. Logs: Records every attempt for support/audit
"""
import os
import httpx
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter()
db = None

def set_db(database):
    global db
    db = database

# Config
SANDBOX_URL = "https://sandbox.alanube.co/dom/v1"
PRODUCTION_URL = "https://api.alanube.co/dom/v1"

async def get_config_from_db():
    """Try to get Alanube config from system_config DB"""
    if db is None:
        return None
    config = await db.system_config.find_one({"id": "main"}, {"_id": 0, "ecf_alanube_token": 1, "ecf_alanube_rnc": 1, "ecf_alanube_env": 1})
    if config and config.get("ecf_alanube_token"):
        is_sandbox = config.get("ecf_alanube_env", "sandbox") == "sandbox"
        return {
            "token": config["ecf_alanube_token"],
            "base_url": SANDBOX_URL if is_sandbox else PRODUCTION_URL,
            "is_sandbox": is_sandbox,
        }
    return None

def get_config():
    """Get Alanube config from environment (sync fallback — used when DB not available)"""
    token = os.environ.get("ALANUBE_SANDBOX_TOKEN", os.environ.get("ALANUBE_TOKEN", ""))
    is_sandbox = bool(os.environ.get("ALANUBE_SANDBOX_TOKEN"))
    base_url = SANDBOX_URL if is_sandbox else PRODUCTION_URL
    return {"token": token, "base_url": base_url, "is_sandbox": is_sandbox}


# ═══════════════════════════════════════════════════════════════
# MODULE 1: MAPEO — Convert VexlyPOS bill to Alanube JSON
# ═══════════════════════════════════════════════════════════════

# DGII Payment Type mapping - Códigos Oficiales DGII
# 1=Efectivo, 2=Cheque/Transferencia/Depósito, 3=Tarjeta Crédito/Débito, 
# 4=Venta a Crédito, 5=Bonos/Certificados, 6=Permuta, 7=Nota de Crédito, 8=Otras
PAYMENT_TYPE_MAP = {
    "efectivo": 1, "cash": 1,
    "tarjeta": 3, "card": 3, "tarjeta de credito": 3, "tarjeta de debito": 3, "credito": 3, "debito": 3,
    "cheque": 2, "transferencia": 2, "transfer": 2, "deposito": 2,
    "credito fiscal": 4, "venta a credito": 4, "fiado": 4,
    "bonos": 5, "gift card": 5, "certificado": 5,
    "permuta": 6,
    "nota de credito": 7, "nc": 7,
    "otro": 8, "other": 8, "otros": 8,
}

# Invoice type mapping (NCF prefix → Alanube type)
INVOICE_TYPE_MAP = {
    "B01": 31,  # Crédito Fiscal
    "B02": 32,  # Consumo
    "B14": 34,  # Nota de Crédito
    "B15": 31,  # Gubernamental (same structure as fiscal)
    "E31": 31,
    "E32": 32,
    "E33": 33,
    "E34": 34,
    "E44": 44,  # Régimen Especial
    "E45": 45,  # Gubernamental
}


def map_payment_type(method_name: str, dgii_code: int = None) -> int:
    """
    Map payment method to DGII code.
    Priority: 1) Explicit dgii_payment_code, 2) Name-based lookup, 3) Default (Efectivo)
    """
    # If explicit DGII code is provided, use it
    if dgii_code is not None and 1 <= dgii_code <= 8:
        return dgii_code
    
    # Fallback to name-based lookup
    name = (method_name or "").lower().strip()
    for key, code in PAYMENT_TYPE_MAP.items():
        if key in name:
            return code
    return 1  # Default: Efectivo


def build_alanube_payload(bill: dict, system_config: dict, encf: str) -> dict:
    """Convert a VexlyPOS bill to Alanube e-CF JSON"""
    
    # Determine invoice type — from ecf_type field or NCF prefix
    ecf_type = bill.get("ecf_type", "")
    if ecf_type:
        invoice_type = INVOICE_TYPE_MAP.get(ecf_type, 32)
    else:
        ncf = bill.get("ncf", "")
        prefix = ncf[:3] if isinstance(ncf, str) and len(ncf) >= 3 else "B02"
        invoice_type = INVOICE_TYPE_MAP.get(prefix, 32)
    
    # Stamp date
    now = datetime.now(timezone.utc)
    stamp_date = now.strftime("%Y-%m-%d")
    
    # ── Items & Tax calculation ──
    items_detail = []
    total_taxed_1 = 0  # ITBIS 18%
    total_taxed_2 = 0  # ITBIS 16%
    total_taxed_3 = 0  # ITBIS 0%
    total_exempt = 0
    itbis_1 = 0
    itbis_2 = 0
    itbis_3 = 0
    
    line = 0
    for item in bill.get("items", []):
        if item.get("status") == "cancelled":
            continue
        line += 1
        qty = item.get("quantity", 1)
        unit_price = item.get("unit_price", 0)
        item_amount = round(qty * unit_price, 2)
        
        # Determine billing indicator (tax rate)
        # Default: 1 (ITBIS 18%)
        billing_indicator = 1
        tax_exemptions = item.get("tax_exemptions", [])
        if tax_exemptions:
            billing_indicator = 4  # Exempt
            total_exempt += item_amount
        else:
            # Calculate ITBIS for this item
            item_itbis = round(item_amount * 0.18, 2)
            total_taxed_1 += item_amount
            itbis_1 += item_itbis
        
        detail = {
            "lineNumber": line,
            "billingIndicator": billing_indicator,
            "itemName": (item.get("product_name", "") or "Producto")[:80],
            "goodServiceIndicator": 1,  # 1=Bien, 2=Servicio
            "quantityItem": qty,
            "unitPriceItem": unit_price,
            "itemAmount": item_amount,
        }
        
        # Add modifiers as description
        mods = item.get("modifiers", [])
        if mods:
            mod_names = [m.get("name", "") if isinstance(m, dict) else str(m) for m in mods]
            detail["itemDescription"] = ", ".join(mod_names)[:1000]
        
        items_detail.append(detail)
    
    # ── Discount ──
    discount = bill.get("discount_applied")
    discount_amount = 0
    if discount and isinstance(discount, dict):
        discount_amount = discount.get("amount", 0)
    
    # ── Propina Legal (tip) ──
    tip = bill.get("propina_legal", 0)
    
    # ── Totals ──
    total_itbis = round(itbis_1 + itbis_2 + itbis_3, 2)
    total_taxed = round(total_taxed_1 + total_taxed_2 + total_taxed_3, 2)
    total_amount = round(bill.get("total", 0), 2)
    
    # ── Payment forms ──
    payment_forms = []
    payments = bill.get("payments", [])
    if payments:
        for p in payments:
            pm_name = p.get("payment_method_name", p.get("method", "efectivo"))
            # Prioritize dgii_payment_code if available
            dgii_code = p.get("dgii_payment_code")
            payment_forms.append({
                "paymentType": map_payment_type(pm_name, dgii_code),
                "paymentAmount": round(p.get("amount", 0), 2)
            })
    else:
        pm_name = bill.get("payment_method_name", "efectivo")
        dgii_code = bill.get("dgii_payment_code")
        payment_forms.append({
            "paymentType": map_payment_type(pm_name, dgii_code),
            "paymentAmount": total_amount
        })
    
    # ── Payment type (1=cash, 2=credit/terms) ──
    main_dgii_code = bill.get("dgii_payment_code")
    main_payment = map_payment_type(bill.get("payment_method_name", "efectivo"), main_dgii_code)
    payment_type = 2 if main_payment in [4, 5, 6] else 1  # Credit if venta a crédito, bonos, permuta
    
    # ── Sender (Emisor) — DB fields first, then fallback ──
    rnc_raw = system_config.get("ecf_alanube_rnc") or system_config.get("ticket_rnc") or system_config.get("rnc") or os.environ.get("ALANUBE_SANDBOX_RNC", "")
    sender = {
        "rnc": (rnc_raw or "").replace("-", ""),
        "companyName": system_config.get("ticket_business_name") or system_config.get("business_name") or system_config.get("restaurant_name") or "VexlyPOS",
        "tradeName": system_config.get("ticket_business_name") or system_config.get("business_name") or system_config.get("restaurant_name") or "VexlyPOS",
        "stampDate": stamp_date,
        "address": system_config.get("fiscal_address") or system_config.get("ticket_address") or system_config.get("address") or "Calle Principal #1",
        "phoneNumber": [system_config.get("phone", "000-000-0000") or "000-000-0000"],
    }
    
    # ── Buyer (Receptor) ──
    buyer_rnc = (bill.get("fiscal_id", "") or "").replace("-", "")
    buyer_name = bill.get("razon_social", "") or "CONSUMIDOR FINAL"
    buyer = {
        "rnc": buyer_rnc or "000000000",
        "companyName": buyer_name,
    }
    
    # ── Totals ──
    totals = {
        "totalTaxedAmount": total_taxed,
        "taxedAmount1Total": total_taxed_1 if total_taxed_1 > 0 else None,
        "taxedAmount2Total": total_taxed_2 if total_taxed_2 > 0 else None,
        "taxedAmount3Total": total_taxed_3 if total_taxed_3 > 0 else None,
        "exemptAmountTotal": total_exempt if total_exempt > 0 else None,
        "itbis1Total": itbis_1 if itbis_1 > 0 else None,
        "itbis2Total": itbis_2 if itbis_2 > 0 else None,
        "itbis3Total": itbis_3 if itbis_3 > 0 else None,
        "totalITBIS": total_itbis,
        "totalAmount": total_amount,
        "totalPaid": total_amount,
        "paymentForms": payment_forms,
    }
    
    # Add tip as surcharge if exists
    if tip > 0:
        totals["nonBillableAmount"] = round(tip, 2)
    
    # Add discount
    if discount_amount > 0:
        totals["totalDiscount"] = round(discount_amount, 2)
    
    # Remove None values
    totals = {k: v for k, v in totals.items() if v is not None}
    
    # ── Build payload ──
    payload = {
        "idDoc": {
            "encf": encf,
            "invoiceType": invoice_type,
            "paymentType": payment_type,
            "incomeType": 1,  # 1=Ingresos operacionales
            "voucherNumber": encf,
            "sequenceDueDate": "2027-12-31",  # Fecha vencimiento de la secuencia
        },
        "sender": sender,
        "buyer": buyer,
        "totals": totals,
        "itemDetails": items_detail,
    }
    
    return payload


# ═══════════════════════════════════════════════════════════════
# MODULE 2: TIMBRADO — Send to Alanube & save response
# ═══════════════════════════════════════════════════════════════

async def send_to_alanube(payload: dict) -> dict:
    """Send e-CF to Alanube API (async, non-blocking)"""
    config = await get_config_from_db() or get_config()
    if not config["token"]:
        return {"ok": False, "error": "Token de Alanube no configurado"}
    
    # Endpoint depends on invoice type
    ENDPOINT_MAP = {
        31: "fiscal-invoices",   # E31 Crédito Fiscal
        32: "invoices",          # E32 Consumo
        33: "debit-notes",       # E33 Nota de Débito
        34: "credit-notes",      # E34 Nota de Crédito
        44: "special-regime",    # E44 Régimen Especial
        45: "government",        # E45 Gubernamental
    }
    invoice_type = payload.get("idDoc", {}).get("invoiceType", 32)
    endpoint = ENDPOINT_MAP.get(invoice_type, "invoices")
    
    url = f"{config['base_url']}/{endpoint}"
    headers = {
        "Authorization": f"Bearer {config['token']}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            data = response.json()
            
            if response.status_code in [200, 201]:
                return {
                    "ok": True,
                    "alanube_id": data.get("id"),
                    "status": data.get("status"),
                    "legal_status": data.get("legalStatus"),
                    "encf": data.get("encf", data.get("documentNumber")),
                    "signature_date": data.get("signatureDate"),
                    "security_code": data.get("securityCode"),
                    "stamp_url": data.get("documentStampUrl"),
                    "pdf_url": data.get("pdf"),
                    "xml_url": data.get("xml"),
                    "government_response": data.get("governmentResponse"),
                }
            else:
                errors = data.get("errors", [])
                return {
                    "ok": False,
                    "status_code": response.status_code,
                    "errors": errors,
                    "error": errors[0].get("message", "Error desconocido") if errors else "Error desconocido",
                }
    except httpx.TimeoutException:
        return {"ok": False, "error": "Timeout — Alanube no respondió en 30 segundos"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def save_alanube_response(bill_id: str, result: dict):
    """Save Alanube response to the bill document"""
    if result.get("ok"):
        update = {
            "ecf_status": result.get("status", "REGISTERED"),
            "ecf_legal_status": result.get("legal_status"),
            "ecf_alanube_id": result.get("alanube_id"),
            "ecf_encf": result.get("encf"),
            "ecf_security_code": result.get("security_code"),
            "ecf_stamp_url": result.get("stamp_url"),
            "ecf_pdf_url": result.get("pdf_url"),
            "ecf_signature_date": result.get("signature_date"),
            "ecf_sent_at": datetime.now(timezone.utc).isoformat(),
        }
        if result.get("government_response"):
            update["ecf_government_response"] = result["government_response"]
    else:
        # Failed — mark as CONTINGENCIA
        update = {
            "ecf_status": "CONTINGENCIA",
            "ecf_error": result.get("error", ""),
            "ecf_errors": result.get("errors", []),
            "ecf_sent_at": datetime.now(timezone.utc).isoformat(),
            "ecf_retry_count": 0,
        }
    
    await db.bills.update_one({"id": bill_id}, {"$set": update})


# ═══════════════════════════════════════════════════════════════
# MODULE 3: LOGS — Audit trail for every attempt
# ═══════════════════════════════════════════════════════════════

async def log_ecf_attempt(bill_id: str, encf: str, action: str, result: dict):
    """Log every e-CF attempt for audit/support"""
    log = {
        "bill_id": bill_id,
        "encf": encf,
        "action": action,  # send, retry, cancel
        "success": result.get("ok", False),
        "alanube_id": result.get("alanube_id"),
        "status": result.get("status"),
        "legal_status": result.get("legal_status"),
        "error": result.get("error"),
        "errors": result.get("errors", []),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ecf_logs.insert_one(log)


# ═══════════════════════════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@router.post("/send/{bill_id}")
async def send_ecf(bill_id: str, request: Request):
    """
    Send a bill as e-CF — DISPATCHER.
    Detects active provider and routes to the correct service.
    """
    from routers.ecf_provider import get_active_provider, send_ecf_multiprod
    from fastapi import BackgroundTasks

    # Check active provider
    provider_config = await get_active_provider()
    active_provider = provider_config.get("provider", "alanube")

    if active_provider == "multiprod":
        # Dispatch to Multiprod — create BackgroundTasks manually
        bg = BackgroundTasks()
        # Get current user from request
        from routers.auth import get_current_user
        user = await get_current_user(request)
        result = await send_ecf_multiprod(bill_id, bg, user)
        # Execute background tasks
        for task in bg.tasks:
            await task()
        return result

    # Default: Alanube/TheFactory — existing flow (untouched)
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    # Check if already sent
    if bill.get("ecf_alanube_id"):
        raise HTTPException(status_code=400, detail=f"Esta factura ya fue enviada a Alanube (ID: {bill['ecf_alanube_id']})")
    
    # Get system config
    config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    
    # Generate e-NCF number
    # Generate e-NCF prefix from ecf_type or NCF
    ecf_type = bill.get("ecf_type", "")
    if ecf_type and ecf_type.startswith("E"):
        ecf_prefix = ecf_type
    else:
        ncf = bill.get("ncf", "")
        prefix = ncf[:3] if isinstance(ncf, str) and len(ncf) >= 3 else "B02"
        ecf_prefix = {"B01": "E31", "B02": "E32", "B14": "E34", "B15": "E31"}.get(prefix, "E32")
    
    # Generate unique e-NCF number using random to avoid sandbox collisions.
    # BUG-23 fix: previous code only retried once on collision and could still
    # send a duplicate eNCF. Now we retry up to 10 times and fail explicitly
    # if every attempt collides with an existing local log.
    import random
    encf = None
    for _ in range(10):
        candidate = f"{ecf_prefix}{random.randint(1000000000, 9999999999)}"
        if not await db.ecf_logs.find_one({"encf": candidate}, {"_id": 0, "encf": 1}):
            encf = candidate
            break
    if encf is None:
        raise HTTPException(
            status_code=500,
            detail="No se pudo generar un eNCF único tras 10 intentos. Reintente la operación.",
        )
    
    # Build payload
    payload = build_alanube_payload(bill, config, encf)
    
    # Send to Alanube (async, non-blocking)
    result = await send_to_alanube(payload)
    
    # Save response to bill
    await save_alanube_response(bill_id, result)
    
    # Log the attempt
    await log_ecf_attempt(bill_id, encf, "send", result)
    
    if result["ok"]:
        return {
            "ok": True,
            "message": f"e-CF enviado exitosamente",
            "encf": encf,
            "alanube_id": result.get("alanube_id"),
            "status": result.get("status"),
            "legal_status": result.get("legal_status"),
            "stamp_url": result.get("stamp_url"),
            "pdf_url": result.get("pdf_url"),
            "security_code": result.get("security_code"),
        }
    else:
        return {
            "ok": False,
            "message": f"Error al enviar e-CF: {result.get('error', '')}",
            "encf": encf,
            "errors": result.get("errors", []),
        }


@router.get("/status/{bill_id}")
async def get_ecf_status(bill_id: str):
    """Check e-CF status for a bill"""
    bill = await db.bills.find_one({"id": bill_id}, {
        "_id": 0, "id": 1, "ecf_status": 1, "ecf_legal_status": 1,
        "ecf_alanube_id": 1, "ecf_encf": 1, "ecf_stamp_url": 1,
        "ecf_pdf_url": 1, "ecf_security_code": 1, "ecf_error": 1,
    })
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return bill


@router.get("/logs/{bill_id}")
async def get_ecf_logs(bill_id: str):
    """Get all e-CF attempt logs for a bill"""
    logs = await db.ecf_logs.find({"bill_id": bill_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return logs


@router.get("/logs")
async def get_all_ecf_logs(limit: int = Query(50)):
    """Get recent e-CF logs for audit"""
    logs = await db.ecf_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs


@router.get("/config")
async def get_ecf_config():
    """Check if Alanube is configured"""
    config = await get_config_from_db() or get_config()
    return {
        "configured": bool(config["token"]),
        "is_sandbox": config["is_sandbox"],
        "base_url": config["base_url"],
    }



# ═══════════════════════════════════════════════════════════════
# MODULE 4: CONTINGENCIA — Retry + Dashboard + Status Refresh
# ═══════════════════════════════════════════════════════════════

@router.post("/retry/{bill_id}")
async def retry_ecf(bill_id: str):
    """Retry sending a CONTINGENCIA bill to Alanube"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    if bill.get("ecf_status") not in ["CONTINGENCIA", "ERROR", None]:
        return {"ok": False, "message": f"Esta factura tiene status '{bill.get('ecf_status')}' — no requiere reintento"}
    
    config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    
    ecf_type = bill.get("ecf_type", "E32")
    ecf_prefix = ecf_type if ecf_type.startswith("E") else "E32"
    
    import random
    unique_suffix = random.randint(1000000000, 9999999999)
    encf = f"{ecf_prefix}{unique_suffix}"
    
    payload = build_alanube_payload(bill, config, encf)
    result = await send_to_alanube(payload)
    await save_alanube_response(bill_id, result)
    
    retry_count = (bill.get("ecf_retry_count") or 0) + 1
    await db.bills.update_one({"id": bill_id}, {"$set": {"ecf_retry_count": retry_count}})
    
    await log_ecf_attempt(bill_id, encf, "retry", result)
    
    if result["ok"]:
        return {
            "ok": True,
            "message": "e-CF enviado exitosamente (reintento)",
            "encf": result.get("encf"),
            "status": result.get("status"),
        }
    else:
        return {
            "ok": False,
            "message": f"Reintento fallido: {result.get('error', '')}",
            "retry_count": retry_count,
        }


@router.post("/retry-all")
async def retry_all_contingencia():
    """Retry ALL bills in CONTINGENCIA status"""
    bills = await db.bills.find({"ecf_status": "CONTINGENCIA"}, {"_id": 0, "id": 1}).to_list(100)
    
    results = {"total": len(bills), "success": 0, "failed": 0}
    config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    
    for bill_doc in bills:
        bill = await db.bills.find_one({"id": bill_doc["id"]}, {"_id": 0})
        if not bill:
            continue
        
        ecf_type = bill.get("ecf_type", "E32")
        ecf_prefix = ecf_type if ecf_type.startswith("E") else "E32"
        
        import random
        unique_suffix = random.randint(1000000000, 9999999999)
        encf = f"{ecf_prefix}{unique_suffix}"
        
        payload = build_alanube_payload(bill, config, encf)
        result = await send_to_alanube(payload)
        await save_alanube_response(bill_doc["id"], result)
        await log_ecf_attempt(bill_doc["id"], encf, "retry-all", result)
        
        if result["ok"]:
            results["success"] += 1
        else:
            results["failed"] += 1
    
    return {"ok": True, **results}


@router.get("/refresh-status/{bill_id}")
async def refresh_ecf_status(bill_id: str):
    """Refresh e-CF status from Alanube (check if approved/rejected)"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    alanube_id = bill.get("ecf_alanube_id")
    if not alanube_id:
        return {"ok": False, "message": "No tiene ID de Alanube"}
    
    cfg = await get_config_from_db() or get_config()
    if not cfg["token"]:
        return {"ok": False, "message": "Token no configurado"}
    
    # Determine endpoint from invoice type
    ecf_type = bill.get("ecf_type", "E32")
    ENDPOINT_MAP = {
        "E31": "fiscal-invoices", "E32": "invoices", "E33": "debit-notes",
        "E34": "credit-notes", "E44": "special-regime", "E45": "government",
    }
    endpoint = ENDPOINT_MAP.get(ecf_type, "invoices")
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{cfg['base_url']}/{endpoint}/{alanube_id}",
                headers={"Authorization": f"Bearer {cfg['token']}", "Accept": "application/json"}
            )
            if response.status_code == 200:
                data = response.json()
                update = {
                    "ecf_status": data.get("status", bill.get("ecf_status")),
                    "ecf_legal_status": data.get("legalStatus"),
                    "ecf_encf": data.get("encf", data.get("documentNumber", bill.get("ecf_encf"))),
                    "ecf_security_code": data.get("securityCode", bill.get("ecf_security_code")),
                    "ecf_stamp_url": data.get("documentStampUrl", bill.get("ecf_stamp_url")),
                }
                gov = data.get("governmentResponse")
                if gov:
                    update["ecf_government_response"] = gov
                    if gov.get("status") == "REJECTED":
                        messages = [m.get("value", "") for m in gov.get("messages", [])]
                        update["ecf_reject_reason"] = "; ".join(messages) if messages else "Rechazado por DGII"
                
                await db.bills.update_one({"id": bill_id}, {"$set": update})
                return {"ok": True, "status": update.get("ecf_status"), "legal_status": update.get("ecf_legal_status"), "reject_reason": update.get("ecf_reject_reason", "")}
            else:
                return {"ok": False, "message": f"Alanube respondió {response.status_code}"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


@router.get("/dashboard")
async def ecf_dashboard(date_from: Optional[str] = Query(None), date_to: Optional[str] = Query(None)):
    """Dashboard with all e-CF bills grouped by status"""
    query = {"$or": [
        {"ecf_type": {"$exists": True, "$ne": None}},
        {"ecf_encf": {"$exists": True, "$ne": None}},
        {"ecf_status": {"$exists": True}},
        {"ncf": {"$regex": "^PENDING-E"}},
        {"ncf": {"$regex": "^E3"}},
    ]}
    if date_from:
        query["paid_at"] = {"$gte": date_from}
    if date_to:
        if "paid_at" in query:
            query["paid_at"]["$lte"] = date_to + "T23:59:59"
        else:
            query["paid_at"] = {"$lte": date_to + "T23:59:59"}
    
    bills = await db.bills.find(query, {
        "_id": 0, "id": 1, "transaction_number": 1, "total": 1, "ncf": 1,
        "ecf_type": 1, "ecf_status": 1, "ecf_encf": 1, "ecf_alanube_id": 1,
        "ecf_stamp_url": 1, "ecf_security_code": 1, "ecf_error": 1,
        "ecf_reject_reason": 1, "ecf_retry_count": 1, "ecf_sent_at": 1,
        "ecf_legal_status": 1, "paid_at": 1, "table_number": 1,
        "waiter_name": 1, "cashier_name": 1, "razon_social": 1,
    }).sort("paid_at", -1).to_list(500)
    
    # Group by status
    summary = {"total": len(bills), "approved": 0, "contingencia": 0, "rejected": 0, "pending": 0, "registered": 0}
    for b in bills:
        status = (b.get("ecf_status") or "").upper()
        if status == "FINISHED":
            summary["approved"] += 1
        elif status == "CONTINGENCIA":
            summary["contingencia"] += 1
        elif status == "REJECTED" or b.get("ecf_reject_reason"):
            summary["rejected"] += 1
        elif status == "REGISTERED":
            summary["registered"] += 1
        else:
            summary["pending"] += 1
    
    return {"summary": summary, "bills": bills}
