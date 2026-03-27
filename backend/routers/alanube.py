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
from fastapi import APIRouter, HTTPException, Depends, Query
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter()
db = None

def set_db(database):
    global db
    db = database

# Config
SANDBOX_URL = "https://sandbox.alanube.co/dom/v1"
PRODUCTION_URL = "https://api.alanube.co/dom/v1"

def get_config():
    """Get Alanube config from environment"""
    token = os.environ.get("ALANUBE_SANDBOX_TOKEN", os.environ.get("ALANUBE_TOKEN", ""))
    is_sandbox = bool(os.environ.get("ALANUBE_SANDBOX_TOKEN"))
    base_url = SANDBOX_URL if is_sandbox else PRODUCTION_URL
    return {"token": token, "base_url": base_url, "is_sandbox": is_sandbox}


# ═══════════════════════════════════════════════════════════════
# MODULE 1: MAPEO — Convert VexlyPOS bill to Alanube JSON
# ═══════════════════════════════════════════════════════════════

# DGII Payment Type mapping
PAYMENT_TYPE_MAP = {
    "efectivo": 1, "cash": 1,
    "tarjeta": 2, "card": 2, "tarjeta de credito": 2, "tarjeta de debito": 2,
    "cheque": 3,
    "transferencia": 4, "transfer": 4,
    "bonos": 5, "gift card": 5,
    "permuta": 6,
    "otro": 7, "other": 7,
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
}


def map_payment_type(method_name: str) -> int:
    """Map payment method name to DGII code"""
    name = (method_name or "").lower().strip()
    for key, code in PAYMENT_TYPE_MAP.items():
        if key in name:
            return code
    return 1  # Default: Efectivo


def build_alanube_payload(bill: dict, system_config: dict, encf: str) -> dict:
    """Convert a VexlyPOS bill to Alanube e-CF JSON"""
    
    # Determine invoice type from NCF prefix
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
            payment_forms.append({
                "paymentType": map_payment_type(pm_name),
                "paymentAmount": round(p.get("amount", 0), 2)
            })
    else:
        payment_forms.append({
            "paymentType": map_payment_type(bill.get("payment_method_name", "efectivo")),
            "paymentAmount": total_amount
        })
    
    # ── Payment type (1=cash, 2=credit/terms) ──
    main_payment = map_payment_type(bill.get("payment_method_name", "efectivo"))
    payment_type = 2 if main_payment in [3, 4, 5, 6] else 1  # Credit if not cash/card
    
    # ── Sender (Emisor) ──
    sender = {
        "rnc": os.environ.get("ALANUBE_SANDBOX_RNC", (system_config.get("rnc", "") or "").replace("-", "")),
        "companyName": system_config.get("restaurant_name", "VexlyPOS"),
        "tradeName": system_config.get("restaurant_name", "VexlyPOS"),
        "stampDate": stamp_date,
        "address": system_config.get("address", "Calle Principal #1") or "Calle Principal #1",
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
    config = get_config()
    if not config["token"]:
        return {"ok": False, "error": "Token de Alanube no configurado"}
    
    # Endpoint depends on invoice type
    ENDPOINT_MAP = {
        31: "fiscal-invoices",   # E31 Crédito Fiscal
        32: "invoices",          # E32 Consumo
        33: "debit-notes",       # E33 Nota de Débito
        34: "credit-notes",      # E34 Nota de Crédito
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
    update = {
        "ecf_status": result.get("status", "ERROR"),
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
    if not result.get("ok"):
        update["ecf_error"] = result.get("error", "")
        update["ecf_errors"] = result.get("errors", [])
    
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
async def send_ecf(bill_id: str):
    """Send a bill as e-CF to Alanube"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    # Check if already sent
    if bill.get("ecf_alanube_id"):
        raise HTTPException(status_code=400, detail=f"Esta factura ya fue enviada a Alanube (ID: {bill['ecf_alanube_id']})")
    
    # Get system config
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    
    # Generate e-NCF number
    ncf = bill.get("ncf", "")
    prefix = ncf[:3] if isinstance(ncf, str) and len(ncf) >= 3 else "B02"
    ecf_prefix = {"B01": "E31", "B02": "E32", "B14": "E34", "B15": "E31"}.get(prefix, "E32")
    
    # Generate unique e-NCF number using random to avoid sandbox collisions
    import random
    unique_suffix = random.randint(1000000000, 9999999999)
    encf = f"{ecf_prefix}{unique_suffix}"
    
    # Verify it wasn't used before in our DB
    existing = await db.ecf_logs.find_one({"encf": encf})
    if existing:
        unique_suffix = random.randint(1000000000, 9999999999)
        encf = f"{ecf_prefix}{unique_suffix}"
    
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
    config = get_config()
    return {
        "configured": bool(config["token"]),
        "is_sandbox": config["is_sandbox"],
        "base_url": config["base_url"],
    }
