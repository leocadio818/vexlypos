"""
VexlyPOS — e-CF Dispatcher (Unified Router)
============================================
Routes e-CF requests to the active provider (Alanube or The Factory HKA).
Reads `ecf_provider` from system_config to determine which module to use.

This replaces the direct Alanube router mount and provides a unified API
that the frontend consumes without caring which provider is active.
"""
import random
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
db = None

def set_db(database):
    global db
    db = database
    # Propagate to sub-modules
    from routers.alanube import set_db as alanube_set_db
    from routers.thefactory import set_db as thefactory_set_db
    alanube_set_db(database)
    thefactory_set_db(database)


async def get_provider() -> str:
    """Get active e-CF provider from system_config"""
    config = await db.system_config.find_one({}, {"_id": 0, "ecf_provider": 1})
    return (config or {}).get("ecf_provider", "alanube")


def gen_encf(ecf_type: str) -> str:
    """Generate a unique e-NCF number"""
    if ecf_type and ecf_type.startswith("E"):
        ecf_prefix = ecf_type
    else:
        ecf_prefix = "E32"
    unique_suffix = random.randint(1000000000, 9999999999)
    return f"{ecf_prefix}{unique_suffix}"


# ═══════════════════════════════════════════════════════════════
# SEND e-CF
# ═══════════════════════════════════════════════════════════════

@router.post("/send/{bill_id}")
async def send_ecf(bill_id: str):
    """Send a bill as e-CF — dispatches to the active provider"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if bill.get("ecf_alanube_id") or (bill.get("ecf_status") == "REGISTERED" and bill.get("ecf_encf")):
        existing = bill.get("ecf_alanube_id") or bill.get("ecf_encf")
        raise HTTPException(status_code=400, detail=f"Esta factura ya fue enviada (Ref: {existing})")

    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    provider = config.get("ecf_provider", "alanube")

    # Generate e-NCF
    ecf_type = bill.get("ecf_type", "")
    if ecf_type and ecf_type.startswith("E"):
        ecf_prefix = ecf_type
    else:
        ncf = bill.get("ncf", "")
        prefix = ncf[:3] if isinstance(ncf, str) and len(ncf) >= 3 else "B02"
        ecf_prefix = {"B01": "E31", "B02": "E32", "B14": "E34", "B15": "E31"}.get(prefix, "E32")
    encf = gen_encf(ecf_prefix)

    # Verify uniqueness
    existing = await db.ecf_logs.find_one({"encf": encf})
    if existing:
        encf = gen_encf(ecf_prefix)

    if provider == "thefactory":
        from routers.thefactory import get_next_ncf
        tipo_doc = {"E31": "31", "E32": "32", "E33": "33", "E34": "34", "E44": "44", "E45": "45"}.get(ecf_prefix, "32")
        ncf_info = await get_next_ncf(tipo_doc)
        encf = ncf_info["ncf"]
        result = await _send_via_thefactory(bill, config, encf, bill_id, ncf_info.get("fecha_venc"))
    else:
        result = await _send_via_alanube(bill, config, encf, bill_id)

    if result["ok"]:
        return {
            "ok": True,
            "message": f"e-CF enviado exitosamente via {provider.upper()}",
            "provider": provider,
            "encf": encf,
            "security_code": result.get("security_code"),
            "stamp_url": result.get("stamp_url"),
            "pdf_url": result.get("pdf_url"),
            "status": result.get("status"),
            "alanube_id": result.get("alanube_id"),
        }
    else:
        return {
            "ok": False,
            "message": f"Error al enviar e-CF via {provider.upper()}: {result.get('error', '')}",
            "provider": provider,
            "encf": encf,
            "errors": result.get("errors", []),
        }


async def _send_via_alanube(bill, config, encf, bill_id):
    """Send via Alanube"""
    from routers.alanube import build_alanube_payload, send_to_alanube, save_alanube_response
    from routers.alanube import log_ecf_attempt as alanube_log

    payload = build_alanube_payload(bill, config, encf)
    result = await send_to_alanube(payload)
    await save_alanube_response(bill_id, result)
    await alanube_log(bill_id, encf, "send", result)
    return result


async def _send_via_thefactory(bill, config, encf, bill_id, fecha_venc=None):
    """Send via The Factory HKA"""
    from routers.thefactory import (
        authenticate, build_thefactory_payload, send_to_thefactory,
        save_thefactory_response, log_ecf_attempt as tf_log, invalidate_token,
        get_config_from_db, get_config as tf_env_config
    )

    # Resolve e-CF provider config (DB first, then .env)
    ecf_config = await get_config_from_db() or tf_env_config()

    # Step 1: Authenticate
    auth = await authenticate()
    if not auth["ok"]:
        fail_result = {"ok": False, "error": f"Auth failed: {auth.get('error', '')}"}
        await save_thefactory_response(bill_id, fail_result, encf)
        await tf_log(bill_id, encf, "send", fail_result)
        return fail_result

    # Step 2: Build payload (pass resolved ecf_config)
    payload = build_thefactory_payload(bill, config, encf, auth["token"], fecha_venc, ecf_config)

    # Step 3: Send
    result = await send_to_thefactory(payload, ecf_config)

    # If auth error, invalidate token and retry once
    if not result["ok"] and result.get("codigo") in [-1, 401, 403]:
        invalidate_token()
        auth = await authenticate()
        if auth["ok"]:
            payload["Token"] = auth["token"]
            result = await send_to_thefactory(payload)

    # Step 4: Save & log
    await save_thefactory_response(bill_id, result, encf)
    await tf_log(bill_id, encf, "send", result)
    return result


# ═══════════════════════════════════════════════════════════════
# RETRY
# ═══════════════════════════════════════════════════════════════

@router.post("/retry/{bill_id}")
async def retry_ecf(bill_id: str):
    """Retry sending a CONTINGENCIA bill"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if bill.get("ecf_status") not in ["CONTINGENCIA", "ERROR", None]:
        return {"ok": False, "message": f"Status '{bill.get('ecf_status')}' no requiere reintento"}

    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    provider = config.get("ecf_provider", "alanube")

    ecf_type = bill.get("ecf_type", "E32")
    ecf_prefix = ecf_type if ecf_type.startswith("E") else "E32"
    encf = gen_encf(ecf_prefix)

    if provider == "thefactory":
        from routers.thefactory import get_next_ncf
        tipo_doc = {"E31": "31", "E32": "32", "E33": "33", "E34": "34"}.get(ecf_prefix, "32")
        ncf_info = await get_next_ncf(tipo_doc)
        encf = ncf_info["ncf"]
        result = await _send_via_thefactory(bill, config, encf, bill_id, ncf_info.get("fecha_venc"))
    else:
        result = await _send_via_alanube(bill, config, encf, bill_id)

    retry_count = (bill.get("ecf_retry_count") or 0) + 1
    await db.bills.update_one({"id": bill_id}, {"$set": {"ecf_retry_count": retry_count}})

    if result["ok"]:
        return {"ok": True, "message": f"e-CF enviado exitosamente (reintento via {provider})", "encf": encf}
    else:
        return {"ok": False, "message": f"Reintento fallido: {result.get('error', '')}", "retry_count": retry_count}


@router.post("/retry-all")
async def retry_all_contingencia():
    """Retry ALL bills in CONTINGENCIA status"""
    bills = await db.bills.find({"ecf_status": "CONTINGENCIA"}, {"_id": 0, "id": 1}).to_list(100)
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    provider = config.get("ecf_provider", "alanube")

    results = {"total": len(bills), "success": 0, "failed": 0, "provider": provider}

    for bill_doc in bills:
        bill = await db.bills.find_one({"id": bill_doc["id"]}, {"_id": 0})
        if not bill:
            continue

        ecf_type = bill.get("ecf_type", "E32")
        ecf_prefix = ecf_type if ecf_type.startswith("E") else "E32"
        encf = gen_encf(ecf_prefix)

        if provider == "thefactory":
            from routers.thefactory import get_next_ncf
            tipo_doc = {"E31": "31", "E32": "32", "E33": "33", "E34": "34"}.get(ecf_prefix, "32")
            ncf_info = await get_next_ncf(tipo_doc)
            encf = ncf_info["ncf"]
            result = await _send_via_thefactory(bill, config, encf, bill_doc["id"], ncf_info.get("fecha_venc"))
        else:
            result = await _send_via_alanube(bill, config, encf, bill_doc["id"])

        if result.get("ok"):
            results["success"] += 1
        else:
            results["failed"] += 1

    return {"ok": True, **results}


# ═══════════════════════════════════════════════════════════════
# STATUS / REFRESH
# ═══════════════════════════════════════════════════════════════

@router.get("/status/{bill_id}")
async def get_ecf_status(bill_id: str):
    """Check e-CF status for a bill"""
    bill = await db.bills.find_one({"id": bill_id}, {
        "_id": 0, "id": 1, "ecf_status": 1, "ecf_legal_status": 1,
        "ecf_alanube_id": 1, "ecf_encf": 1, "ecf_stamp_url": 1,
        "ecf_pdf_url": 1, "ecf_security_code": 1, "ecf_error": 1,
        "ecf_provider": 1,
    })
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return bill


@router.get("/refresh-status/{bill_id}")
async def refresh_ecf_status(bill_id: str):
    """Refresh e-CF status from the provider"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    bill_provider = bill.get("ecf_provider", "alanube")

    if bill_provider == "thefactory":
        encf = bill.get("ecf_encf")
        if not encf:
            return {"ok": False, "message": "No tiene e-NCF registrado"}

        from routers.thefactory import check_status_thefactory
        result = await check_status_thefactory(encf)

        if result.get("ok"):
            update = {
                "ecf_status": result.get("status", bill.get("ecf_status")),
                "ecf_security_code": result.get("security_code", bill.get("ecf_security_code")),
            }
            observations = result.get("observations", [])
            if result.get("status") == "REJECTED" and observations:
                messages = [o.get("mensaje", "") for o in observations if o.get("mensaje")]
                update["ecf_reject_reason"] = "; ".join(messages) if messages else "Rechazado por DGII"

            await db.bills.update_one({"id": bill_id}, {"$set": update})
            return {"ok": True, "status": update.get("ecf_status"), "observations": observations}
        else:
            return {"ok": False, "message": result.get("error", "Error consultando status")}

    else:
        # Alanube refresh
        from routers.alanube import router as _unused
        alanube_id = bill.get("ecf_alanube_id")
        if not alanube_id:
            return {"ok": False, "message": "No tiene ID de Alanube"}

        # Delegate to existing alanube refresh logic
        import os
        import httpx
        from routers.alanube import get_config as alanube_config
        cfg = alanube_config()
        if not cfg["token"]:
            return {"ok": False, "message": "Token de Alanube no configurado"}

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
                    return {"ok": True, "status": update.get("ecf_status"), "legal_status": update.get("ecf_legal_status")}
                else:
                    return {"ok": False, "message": f"Alanube respondió {response.status_code}"}
        except Exception as e:
            return {"ok": False, "message": str(e)}


# ═══════════════════════════════════════════════════════════════
# LOGS & DASHBOARD
# ═══════════════════════════════════════════════════════════════

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
    """Check which provider is configured and active"""
    from routers.alanube import get_config_from_db as al_db_config, get_config as alanube_env_config
    from routers.thefactory import get_config_from_db as tf_db_config, get_config as tf_env_config

    al_cfg = (await al_db_config()) or alanube_env_config()
    tf_cfg = (await tf_db_config()) or tf_env_config()

    sys_config = await db.system_config.find_one({}, {"_id": 0, "ecf_provider": 1, "ecf_enabled": 1})
    active_provider = (sys_config or {}).get("ecf_provider", "alanube")

    return {
        "active_provider": active_provider,
        "ecf_enabled": (sys_config or {}).get("ecf_enabled", False),
        "alanube": {
            "configured": bool(al_cfg.get("token")),
            "is_sandbox": al_cfg.get("is_sandbox", True),
        },
        "thefactory": {
            "configured": bool(tf_cfg.get("user") and tf_cfg.get("password")),
            "is_sandbox": tf_cfg.get("is_sandbox", True),
            "rnc": tf_cfg.get("rnc", ""),
            "company": tf_cfg.get("company_name", ""),
        },
    }


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
        "ecf_legal_status": 1, "ecf_provider": 1, "paid_at": 1, "table_number": 1,
        "waiter_name": 1, "cashier_name": 1, "razon_social": 1,
    }).sort("paid_at", -1).to_list(500)

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


# ═══════════════════════════════════════════════════════════════
# TEST AUTH (for settings page verification)
# ═══════════════════════════════════════════════════════════════

@router.post("/test-connection")
async def test_ecf_connection():
    """Test connection to the active e-CF provider"""
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    provider = config.get("ecf_provider", "alanube")

    if provider == "thefactory":
        from routers.thefactory import authenticate, invalidate_token
        invalidate_token()
        result = await authenticate()
        if result["ok"]:
            return {
                "ok": True,
                "provider": "thefactory",
                "message": "Conexión exitosa con The Factory HKA",
            }
        else:
            return {
                "ok": False,
                "provider": "thefactory",
                "message": f"Error: {result.get('error', '')}",
            }
    else:
        from routers.alanube import get_config_from_db as al_db, get_config as alanube_env
        cfg = (await al_db()) or alanube_env()
        if cfg.get("token"):
            return {"ok": True, "provider": "alanube", "message": "Token de Alanube configurado"}
        else:
            return {"ok": False, "provider": "alanube", "message": "Token de Alanube no configurado"}
