"""
VexlyPOS — e-CF Dispatcher (Unified Router)
============================================
Routes e-CF requests to the active provider (Alanube, The Factory HKA, or Multiprod AM SRL).
Reads `ecf_provider` from system_config to determine which module to use.

This replaces the direct Alanube router mount and provides a unified API
that the frontend consumes without caring which provider is active.
"""
import random
import logging
from datetime import datetime, timezone
from utils.supabase_helpers import sb_select, sb_insert, sb_update_filter
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
db = None

VALID_PROVIDERS = ("alanube", "thefactory", "multiprod")

def set_db(database):
    global db
    db = database
    # Propagate to sub-modules
    from routers.alanube import set_db as alanube_set_db
    from routers.thefactory import set_db as thefactory_set_db
    from routers.ecf_provider import set_db as ecf_provider_set_db
    alanube_set_db(database)
    thefactory_set_db(database)
    ecf_provider_set_db(database)


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
        fecha_venc = ncf_info.get("fecha_venc")
        
        # Log warning if fechaVencimientoSecuencia is missing or invalid for this document type
        if not fecha_venc:
            logging.warning(f"e-CF {ecf_prefix}: fechaVencimientoSecuencia is missing/invalid. The Factory may reject the document. Check series configuration.")
        
        result = await _send_via_thefactory(bill, config, encf, bill_id, fecha_venc)
    elif provider == "multiprod":
        result = await _send_via_multiprod(bill, config, bill_id)
        if result.get("ok"):
            encf = result.get("encf") or result.get("ecf_encf") or encf
    else:
        result = await _send_via_alanube(bill, config, encf, bill_id)

    if result["ok"]:
        # Update bill's ncf field with the real e-NCF so all displays show the correct sequence
        await db.bills.update_one({"id": bill_id}, {"$set": {"ncf": encf, "ecf_encf": encf}})

        # Update cash movement description in Supabase to reflect e-NCF instead of B-series
        try:
            from routers.pos_sessions import get_supabase
            sb = get_supabase()
            movements = sb_select(sb.table("cash_movements").select("id, description")).like("description", f"%[BILL:{bill_id}]%").execute()
            if movements.data:
                for mov in movements.data:
                    old_desc = mov.get("description", "")
                    # Replace B-series or PENDING NCF with the real e-NCF
                    import re
                    new_desc = re.sub(r'Venta\s+(B\d{10}|PENDING-E\d{2})', f'Venta {encf}', old_desc)
                    if new_desc != old_desc:
                        sb_update_filter(sb.table("cash_movements").update({"description": new_desc}).eq("id", mov["id"])).execute()
        except Exception:
            pass  # Non-critical: movement display update is best-effort

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
        # Log the e-CF error to system_logs for human-readable display
        try:
            from routers.system_logs import log_ecf_error
            error_msg = result.get('error', 'Error desconocido')
            dgii_reason = ""
            if result.get("errors"):
                dgii_reason = "; ".join([str(e) for e in result.get("errors", [])])
            
            # Determine error type for better messaging
            error_type = "ecf_send_failed"
            if "auth" in error_msg.lower() or result.get("codigo") in [-1, 401, 403]:
                error_type = "ecf_auth_failed"
            elif "secuencia" in error_msg.lower() or "145" in error_msg or result.get("codigo") == 145:
                error_type = "ecf_sequence_invalid"
            elif "rechaz" in error_msg.lower() or result.get("codigo") in [111, 110, 112]:
                error_type = "ecf_dgii_rejected"
            
            await log_ecf_error(
                technical_error=f"{error_msg} | Code: {result.get('codigo')} | Errors: {dgii_reason}",
                error_type=error_type,
                bill_id=bill_id,
                encf=encf,
                dgii_reason=dgii_reason or error_msg
            )
        except Exception as log_err:
            logging.error(f"Failed to log e-CF error: {log_err}")
        
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


async def _send_via_multiprod(bill, config, bill_id):
    """
    Send via Multiprod AM SRL.
    Delegates to ecf_provider.send_ecf_multiprod_internal() which handles:
    reservation, XML build, XSD validation, multipart/form-data send, retries.
    Returns dict compatible with dispatcher: {ok, encf, error/motivo, status, ...}
    """
    from routers.ecf_provider import get_multiprod_credentials, reserve_encf, consume_reservation, release_reservation, gen_id, now_iso, enqueue_retry, run_background_retries, RETRY_BACKOFFS
    from services.multiprod_service import multiprod_service
    from datetime import timedelta

    # Get Multiprod credentials
    endpoint, token = await get_multiprod_credentials()
    if not endpoint:
        return {"ok": False, "error": "Multiprod no configurado. Configure URL y token en Configuracion > Sistema"}

    # Determine e-CF type
    ecf_type = bill.get("ecf_type", "")
    if not ecf_type or not ecf_type.startswith("E"):
        ncf = bill.get("ncf", "")
        prefix = ncf[:3] if isinstance(ncf, str) and len(ncf) >= 3 else "B02"
        ecf_type = {"B01": "E31", "B02": "E32", "B14": "E34", "B15": "E31"}.get(prefix, "E32")

    # Reserve e-NCF from Supabase
    try:
        encf, reservation_id, seq_valid_until = await reserve_encf(ecf_type, bill_id)
    except Exception as e:
        return {"ok": False, "error": f"Error reservando e-NCF: {str(e)}"}

    # Get system config for XML building
    system_config = config or await db.system_config.find_one({}, {"_id": 0}) or {}

    # Build XML — pass seq_valid_until for FechaVencimientoSecuencia
    try:
        bill_for_xml = {**bill, "seq_valid_until": seq_valid_until}
        xml_content = multiprod_service.build_xml(bill_for_xml, system_config, ecf_type, encf)
    except Exception as e:
        await release_reservation(reservation_id)
        return {"ok": False, "error": f"Error construyendo XML: {str(e)}"}

    # Validate XML locally
    valid, validation_msg = multiprod_service.validate_xml_local(xml_content, ecf_type)
    if not valid:
        await release_reservation(reservation_id)
        return {"ok": False, "error": f"XML no valido: {validation_msg}"}

    # Mark as processing
    await db.bills.update_one({"id": bill_id}, {"$set": {
        "ecf_status": "PROCESSING",
        "ecf_provider": "multiprod",
        "ecf_encf": encf,
        "ecf_attempts": 1,
    }})

    # Build full endpoint (append token if not embedded)
    full_endpoint = endpoint
    if token and token not in endpoint:
        full_endpoint = f"{endpoint.rstrip('/')}/{token}"

    rnc_emisor = (system_config.get("ticket_rnc") or system_config.get("rnc") or system_config.get("ecf_alanube_rnc") or "").replace("-", "").strip()
    result = await multiprod_service.send_ecf(xml_content, full_endpoint, rnc=rnc_emisor, encf=encf)

    # Log attempt
    await db.ecf_logs.insert_one({
        "id": gen_id(),
        "bill_id": bill_id,
        "encf": encf,
        "action": "multiprod_send_1",
        "provider": "multiprod",
        "result": {k: v for k, v in result.items() if k != "raw"},
        "created_at": now_iso(),
    })

    estado = result.get("estado", "")

    if estado.startswith("aceptado"):
        await consume_reservation(reservation_id)
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "FINISHED",
            "ecf_encf": encf,
            "ecf_qr": result.get("qr"),
            "ecf_trackid": result.get("trackId"),
            "ecf_provider": "multiprod",
            "ecf_attempts": 1,
            "ecf_sent_at": now_iso(),
        }})
        return {"ok": True, "encf": encf, "ecf_encf": encf, "status": "aceptado", "qr": result.get("qr"), "trackId": result.get("trackId")}

    if estado == "rechazado":
        await consume_reservation(reservation_id)
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "REJECTED",
            "ecf_encf": encf,
            "ecf_provider": "multiprod",
            "ecf_reject_reason": result.get("motivo", "Rechazado por DGII"),
            "ecf_attempts": 1,
            "ecf_sent_at": now_iso(),
        }})
        return {"ok": False, "encf": encf, "error": result.get("motivo", "Rechazado por DGII"), "status": "rechazado"}

    # Transient error — enqueue retries
    await enqueue_retry(bill_id, encf, reservation_id, 2, full_endpoint, xml_content)
    next_retry = datetime.now(timezone.utc) + timedelta(seconds=RETRY_BACKOFFS[1])
    await db.bills.update_one({"id": bill_id}, {"$set": {"ecf_next_retry_at": next_retry.isoformat()}})

    # Background retries (best-effort, non-blocking)
    try:
        import asyncio
        asyncio.create_task(run_background_retries(bill_id))
    except Exception:
        pass

    return {"ok": True, "encf": encf, "ecf_encf": encf, "status": "processing", "motivo": "Procesando con DGII... reintentando automaticamente"}


# ═══════════════════════════════════════════════════════════════
# RETRY
# ═══════════════════════════════════════════════════════════════

@router.post("/retry/{bill_id}")
async def retry_ecf(bill_id: str):
    """Retry sending a CONTINGENCIA / REJECTED / ERROR bill"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    if bill.get("ecf_status") not in ["CONTINGENCIA", "ERROR", "REJECTED", None]:
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
    elif provider == "multiprod":
        result = await _send_via_multiprod(bill, config, bill_id)
        if result.get("ok"):
            encf = result.get("encf") or result.get("ecf_encf") or encf
    else:
        result = await _send_via_alanube(bill, config, encf, bill_id)

    retry_count = (bill.get("ecf_retry_count") or 0) + 1
    await db.bills.update_one({"id": bill_id}, {"$set": {"ecf_retry_count": retry_count}})

    if result["ok"]:
        return {"ok": True, "message": f"e-CF enviado exitosamente (reintento via {provider})", "encf": encf}
    else:
        return {"ok": False, "message": f"Reintento fallido: {result.get('error', result.get('motivo', ''))}", "retry_count": retry_count}


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
        elif provider == "multiprod":
            result = await _send_via_multiprod(bill, config, bill_doc["id"])
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
async def ecf_dashboard(
    date_from: Optional[str] = Query(None), 
    date_to: Optional[str] = Query(None),
    business_day_id: Optional[str] = Query(None)
):
    """Dashboard with all e-CF bills grouped by status"""
    query = {"$or": [
        {"ecf_type": {"$exists": True, "$ne": None}},
        {"ecf_encf": {"$exists": True, "$ne": None}},
        {"ecf_status": {"$exists": True}},
        {"ncf": {"$regex": "^PENDING-E"}},
        {"ncf": {"$regex": "^E3"}},
    ]}
    
    # If filtering by specific business day, use that instead of date range
    if business_day_id:
        query["business_day_id"] = business_day_id
    else:
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


@router.get("/rejections")
async def ecf_rejections(limit: int = Query(20, ge=1, le=100)):
    """
    Lightweight endpoint for real-time rejection alerts.
    Returns the N most recent REJECTED e-CF bills with motivo fully visible.
    Used by Layout.js polling (60s interval) for badge + toast alerts.
    """
    query = {
        "$or": [
            {"ecf_status": "REJECTED"},
            {"ecf_reject_reason": {"$exists": True, "$nin": [None, ""]}},
        ],
    }
    bills = await db.bills.find(query, {
        "_id": 0, "id": 1, "transaction_number": 1, "total": 1,
        "ecf_type": 1, "ecf_status": 1, "ecf_encf": 1, "ecf_reject_reason": 1,
        "ecf_provider": 1, "ecf_sent_at": 1, "paid_at": 1, "razon_social": 1,
        "fiscal_id": 1, "table_number": 1, "cashier_name": 1,
    }).sort("ecf_sent_at", -1).to_list(limit)

    # Filter to truly rejected only (exclude already re-accepted)
    rejections = [
        b for b in bills
        if (b.get("ecf_status") or "").upper() == "REJECTED"
        or (b.get("ecf_reject_reason") and (b.get("ecf_status") or "").upper() != "FINISHED")
    ]

    return {
        "count": len(rejections),
        "rejections": rejections,
        "latest_at": rejections[0].get("ecf_sent_at") if rejections else None,
    }




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


# ═══════════════════════════════════════════════════════════════
# DIAGNOSTICS
# ═══════════════════════════════════════════════════════════════

@router.get("/thefactory/series-diagnostics")
async def thefactory_series_diagnostics():
    """
    Get detailed series diagnostics for The Factory HKA.
    Useful for debugging Code 145 (fechaVencimientoSecuencia) errors.
    """
    provider = await get_provider()
    if provider != "thefactory":
        return {"warning": "The Factory no es el proveedor activo", "provider": provider}
    
    from routers.thefactory import get_series_info, get_series, _is_valid_fecha_venc
    
    series_info = await get_series_info()
    raw_series = await get_series()
    
    # Add validation details for each series
    diagnostics = []
    for s in raw_series:
        tipo = s.get("tipoDocumento")
        raw_fecha = s.get("fechaVencimientoSecuencia")
        is_valid = _is_valid_fecha_venc(raw_fecha)
        
        diagnostics.append({
            "tipo_documento": tipo,
            "descripcion": s.get("descripcionTipoDocumento", ""),
            "fechaVencimientoSecuencia_raw": raw_fecha,
            "fechaVencimientoSecuencia_valid": is_valid,
            "correlativo": s.get("correlativo"),
            "secuencia_inicial": s.get("secuenciaInicial"),
            "secuencia_final": s.get("secuenciaFinal"),
            "warning": None if is_valid else f"⚠️ Fecha inválida o expirada. Debe renovar la secuencia tipo {tipo} en The Factory/DGII."
        })
    
    return {
        "provider": "thefactory",
        "series_count": len(diagnostics),
        "diagnostics": diagnostics,
        "series_info": series_info.get("series", [])
    }
