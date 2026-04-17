"""
ECF Provider Router — Multi-provider dispatcher for e-CF.
Supports: alanube, thefactory, multiprod.
This router handles provider config, dispatching, retries, and polling.
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import asyncio

from routers.auth import get_current_user, get_permissions
from services import encrypt_value, decrypt_value, mask_value

router = APIRouter(prefix="/ecf", tags=["ECF Provider"])
db = None
supabase_client = None


def set_db(database):
    global db
    db = database


def init_supabase():
    """Initialize Supabase client for NCF sequence management."""
    global supabase_client
    import os
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_KEY")
    if url and key:
        try:
            from supabase import create_client
            supabase_client = create_client(url, key)
        except Exception as e:
            print(f"ECF Provider: Supabase init failed: {e}")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def gen_id():
    import uuid
    return str(uuid.uuid4())


# ─── PROVIDERS LIST ───

PROVIDERS = [
    {"id": "alanube", "name": "Alanube"},
    {"id": "thefactory", "name": "TheFactory HKA"},
    {"id": "multiprod", "name": "Multiprod AM SRL"},
]


@router.get("/providers")
async def list_providers():
    return PROVIDERS


# ─── PROVIDER CONFIG ───

class EcfConfigInput(BaseModel):
    provider: str
    multiprod_endpoint: Optional[str] = None
    multiprod_token: Optional[str] = None


@router.get("/config")
async def get_ecf_config(user=Depends(get_current_user)):
    """Get current e-CF provider config. Token/URL masked for security."""
    config = await db.ecf_provider_config.find_one({}, {"_id": 0})
    if not config:
        # Return default (current provider from system_config)
        sys_cfg = await db.system_config.find_one({}, {"_id": 0}) or {}
        return {
            "provider": sys_cfg.get("ecf_provider", "alanube"),
            "multiprod_endpoint": None,
            "multiprod_token_masked": None,
            "has_multiprod_token": False,
        }
    result = {
        "provider": config.get("provider", "alanube"),
        "multiprod_endpoint": mask_value(config.get("multiprod_endpoint", "")) if config.get("multiprod_endpoint") else None,
        "multiprod_token_masked": mask_value("token_set") if config.get("multiprod_token_encrypted") else None,
        "has_multiprod_token": bool(config.get("multiprod_token_encrypted")),
        "has_multiprod_endpoint": bool(config.get("multiprod_endpoint")),
        "updated_at": config.get("updated_at"),
    }
    return result


@router.put("/config")
async def update_ecf_config(input: EcfConfigInput, user=Depends(get_current_user)):
    """Update e-CF provider config. Admin only."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo admin puede configurar el proveedor e-CF")

    if input.provider not in [p["id"] for p in PROVIDERS]:
        raise HTTPException(status_code=400, detail=f"Proveedor '{input.provider}' no valido")

    update = {
        "provider": input.provider,
        "updated_at": now_iso(),
        "updated_by": user.get("user_id"),
    }

    if input.provider == "multiprod":
        if input.multiprod_endpoint:
            update["multiprod_endpoint"] = input.multiprod_endpoint
        if input.multiprod_token:
            update["multiprod_token_encrypted"] = encrypt_value(input.multiprod_token)

    # Also sync to system_config.ecf_provider for backward compat
    await db.system_config.update_one({}, {"$set": {"ecf_provider": input.provider}}, upsert=True)

    await db.ecf_provider_config.update_one(
        {},
        {"$set": update},
        upsert=True
    )
    return {"ok": True, "provider": input.provider}


# ─── HELPERS ───

async def get_active_provider():
    """Get the active e-CF provider config."""
    config = await db.ecf_provider_config.find_one({}, {"_id": 0})
    if config and config.get("provider"):
        return config
    # Fallback to system_config
    sys_cfg = await db.system_config.find_one({}, {"_id": 0}) or {}
    return {"provider": sys_cfg.get("ecf_provider", "alanube")}


async def get_multiprod_credentials():
    """Get decrypted Multiprod credentials. Returns (endpoint, token) regardless of active provider flag."""
    config = await db.ecf_provider_config.find_one({}, {"_id": 0})
    if not config:
        return None, None
    endpoint = config.get("multiprod_endpoint")
    if not endpoint:
        return None, None
    token_enc = config.get("multiprod_token_encrypted")
    token = decrypt_value(token_enc) if token_enc else None
    return endpoint, token


# ─── NCF SEQUENCE RESERVATION ───

async def reserve_encf(ecf_type: str, invoice_id: str) -> tuple:
    """
    Reserve the next e-NCF from Supabase ncf_sequences.
    Returns (encf: str, sequence_id: str) or raises.
    Uses MongoDB as fallback reservation tracker since Supabase doesn't support transactions.
    """
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Supabase no configurado")

    # Get active sequence for this type — try ncf_type_id first (actual column name)
    seq_result = supabase_client.table("ncf_sequences").select("*").eq("ncf_type_id", ecf_type).eq("is_active", True).limit(1).execute()
    if not seq_result.data:
        seq_result = supabase_client.table("ncf_sequences").select("*").eq("sequence_prefix", ecf_type).eq("is_active", True).limit(1).execute()
    if not seq_result.data:
        raise HTTPException(status_code=400, detail=f"No hay secuencia activa para {ecf_type}")

    seq = seq_result.data[0]
    current_num = seq.get("current_number", 1)
    serie = seq.get("serie") or seq.get("sequence_prefix", "E")[:1]
    tipo_num = ecf_type[1:]  # "E32" -> "32"
    encf = f"{serie}{tipo_num}{str(current_num).zfill(10)}"

    # Increment in Supabase
    supabase_client.table("ncf_sequences").update({
        "current_number": current_num + 1
    }).eq("id", seq["id"]).execute()

    # Track reservation in MongoDB
    reservation = {
        "id": gen_id(),
        "encf": encf,
        "ecf_type": ecf_type,
        "sequence_id": seq["id"],
        "invoice_id": invoice_id,
        "original_number": current_num,
        "status": "reserved",  # reserved -> consumed | released
        "reserved_at": now_iso(),
        "reserved_until": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
    }
    await db.encf_reservations.insert_one(reservation)

    return encf, reservation["id"]


async def consume_reservation(reservation_id: str):
    """Mark a reservation as consumed (Aceptado or Rechazado by DGII)."""
    await db.encf_reservations.update_one(
        {"id": reservation_id},
        {"$set": {"status": "consumed", "consumed_at": now_iso()}}
    )


async def release_reservation(reservation_id: str):
    """
    Release a reservation (5 retries exhausted by transient error).
    The e-NCF number becomes available for the next invoice.
    NOTE: In Supabase, we decrement current_number to reclaim the sequence.
    """
    res = await db.encf_reservations.find_one({"id": reservation_id, "status": "reserved"})
    if not res:
        return

    if supabase_client:
        try:
            supabase_client.table("ncf_sequences").update({
                "current_number": res["original_number"]
            }).eq("id", res["sequence_id"]).execute()
        except Exception as e:
            print(f"Warning: Could not release e-NCF sequence: {e}")

    await db.encf_reservations.update_one(
        {"id": reservation_id},
        {"$set": {"status": "released", "released_at": now_iso()}}
    )


# ─── RETRY QUEUE ───

RETRY_BACKOFFS = [0, 2, 4, 8, 16]  # seconds before each attempt (attempt 1=0s, 2=2s, etc.)


async def enqueue_retry(bill_id: str, encf: str, reservation_id: str, attempt: int, endpoint: str, xml: str):
    """Enqueue a retry for background processing."""
    next_retry = datetime.now(timezone.utc) + timedelta(seconds=RETRY_BACKOFFS[min(attempt, len(RETRY_BACKOFFS) - 1)])
    await db.ecf_retry_queue.update_one(
        {"bill_id": bill_id},
        {"$set": {
            "bill_id": bill_id,
            "encf": encf,
            "reservation_id": reservation_id,
            "attempt": attempt,
            "max_attempts": 5,
            "endpoint": endpoint,
            "xml_content": xml,
            "next_retry_at": next_retry.isoformat(),
            "status": "pending",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }},
        upsert=True
    )


async def process_retry(bill_id: str):
    """Process a single retry from the queue."""
    from services.multiprod_service import multiprod_service

    entry = await db.ecf_retry_queue.find_one({"bill_id": bill_id, "status": "pending"}, {"_id": 0})
    if not entry:
        return

    attempt = entry.get("attempt", 1)
    endpoint = entry.get("endpoint")
    xml = entry.get("xml_content")
    encf = entry.get("encf")
    reservation_id = entry.get("reservation_id")

    # Wait for backoff
    wait_seconds = RETRY_BACKOFFS[min(attempt, len(RETRY_BACKOFFS) - 1)]
    if wait_seconds > 0:
        await asyncio.sleep(wait_seconds)

    # Send to Multiprod — fetch RNC for proper filename
    sys_cfg = await db.system_config.find_one({}, {"_id": 0}) or {}
    rnc_emisor = (sys_cfg.get("ticket_rnc") or sys_cfg.get("rnc") or sys_cfg.get("ecf_alanube_rnc") or "").replace("-", "").strip()
    result = await multiprod_service.send_ecf(xml, endpoint, rnc=rnc_emisor, encf=encf)

    # Log attempt
    await db.ecf_logs.insert_one({
        "id": gen_id(),
        "bill_id": bill_id,
        "encf": encf,
        "action": f"multiprod_retry_{attempt}",
        "result": {k: v for k, v in result.items() if k != "raw"},
        "created_at": now_iso(),
    })

    estado = result.get("estado", "")

    if estado.startswith("aceptado"):
        # Success
        await consume_reservation(reservation_id)
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "FINISHED",
            "ecf_encf": encf,
            "ecf_qr": result.get("qr"),
            "ecf_trackid": result.get("trackId"),
            "ecf_provider": "multiprod",
            "ecf_attempts": attempt,
            "ecf_sent_at": now_iso(),
        }})
        await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "completed", "updated_at": now_iso()}})
        return

    if estado == "rechazado":
        # DGII rejected — burn the e-NCF, don't retry
        await consume_reservation(reservation_id)
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "REJECTED",
            "ecf_encf": encf,
            "ecf_provider": "multiprod",
            "ecf_reject_reason": result.get("motivo", "Rechazado por DGII"),
            "ecf_attempts": attempt,
            "ecf_sent_at": now_iso(),
        }})
        await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "rejected", "updated_at": now_iso()}})
        return

    # Transient error — schedule next retry or give up
    next_attempt = attempt + 1
    if next_attempt > 5:
        # Exhausted retries — mark contingencia, release e-NCF
        await release_reservation(reservation_id)
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "CONTINGENCIA",
            "ecf_provider": "multiprod",
            "ecf_error": result.get("motivo", "Agoto reintentos"),
            "ecf_attempts": attempt,
            "ecf_next_retry_at": None,
        }})
        await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "exhausted", "updated_at": now_iso()}})
        return

    # Schedule next retry
    next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=RETRY_BACKOFFS[min(next_attempt - 1, len(RETRY_BACKOFFS) - 1)])
    await db.bills.update_one({"id": bill_id}, {"$set": {
        "ecf_attempts": attempt,
        "ecf_next_retry_at": next_retry_at.isoformat(),
    }})
    await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {
        "attempt": next_attempt,
        "next_retry_at": next_retry_at.isoformat(),
        "updated_at": now_iso(),
    }})
    # Recursively process next retry
    await process_retry(bill_id)


async def run_background_retries(bill_id: str):
    """Run retries 2-5 in background."""
    try:
        await process_retry(bill_id)
    except Exception as e:
        print(f"Background retry error for {bill_id}: {e}")


# ─── DISPATCHER — Main send endpoint ───

@router.post("/send-multiprod/{bill_id}")
async def send_ecf_multiprod(bill_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    """
    Send e-CF via Multiprod. Called by the main dispatcher or directly.
    Handles: skip_ecf, reservation, XML build, send, retries.
    """
    from services.multiprod_service import multiprod_service

    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    # Check if already processed
    if bill.get("ecf_status") in ("FINISHED", "REJECTED"):
        return {"ok": True, "status": bill["ecf_status"], "ecf_encf": bill.get("ecf_encf")}

    # Check skip_ecf (PedidosYa, Uber Eats)
    payments = bill.get("payments", [])
    has_skip = bill.get("force_contingency") or any(p.get("skip_ecf") or p.get("force_contingency") for p in payments)
    if has_skip:
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "CONTINGENCIA",
            "ecf_provider": "multiprod",
            "ecf_error": "contingencia_manual - plataforma externa genera e-CF",
            "ecf_sent_at": now_iso(),
        }})
        return {"ok": True, "status": "contingencia_manual", "ecf_encf": None, "motivo": "Factura en contingencia manual (plataforma externa)"}

    # Get Multiprod credentials
    endpoint, token = await get_multiprod_credentials()
    if not endpoint:
        raise HTTPException(status_code=400, detail="Multiprod no configurado. Configure URL y token en Configuracion > Sistema")

    # Determine e-CF type
    ecf_type = bill.get("ecf_type", "")
    if not ecf_type or not ecf_type.startswith("E"):
        ncf = bill.get("ncf", "")
        prefix = ncf[:3] if isinstance(ncf, str) and len(ncf) >= 3 else "B02"
        ecf_type = {"B01": "E31", "B02": "E32", "B14": "E34", "B15": "E31"}.get(prefix, "E32")

    # Reserve e-NCF
    try:
        encf, reservation_id = await reserve_encf(ecf_type, bill_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reservando e-NCF: {str(e)}")

    # Get system config for XML building
    system_config = await db.system_config.find_one({}, {"_id": 0}) or {}

    # Build XML
    try:
        xml_content = multiprod_service.build_xml(bill, system_config, ecf_type, encf)
    except NotImplementedError:
        # XML builder not yet implemented — release reservation
        await release_reservation(reservation_id)
        raise HTTPException(status_code=501, detail="Constructor XML pendiente de implementacion (XSD)")
    except Exception as e:
        await release_reservation(reservation_id)
        raise HTTPException(status_code=500, detail=f"Error construyendo XML: {str(e)}")

    # Validate XML locally
    valid, validation_msg = multiprod_service.validate_xml_local(xml_content, ecf_type)
    if not valid:
        await release_reservation(reservation_id)
        raise HTTPException(status_code=400, detail=f"XML no valido: {validation_msg}")

    # Mark as processing
    await db.bills.update_one({"id": bill_id}, {"$set": {
        "ecf_status": "PROCESSING",
        "ecf_provider": "multiprod",
        "ecf_encf": encf,
        "ecf_attempts": 1,
    }})

    # Attempt 1 — synchronous
    # If endpoint has token embedded, use as-is. Otherwise append token.
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
        return {"ok": True, "status": "aceptado", "ecf_encf": encf, "ecf_qr": result.get("qr"), "trackId": result.get("trackId")}

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
        return {"ok": False, "status": "rechazado", "ecf_encf": encf, "motivo": result.get("motivo")}

    # Transient error — enqueue retries 2-5
    await enqueue_retry(bill_id, encf, reservation_id, 2, full_endpoint, xml_content)
    next_retry = datetime.now(timezone.utc) + timedelta(seconds=RETRY_BACKOFFS[1])
    await db.bills.update_one({"id": bill_id}, {"$set": {
        "ecf_next_retry_at": next_retry.isoformat(),
    }})

    # Start background retries
    background_tasks.add_task(run_background_retries, bill_id)

    return {"ok": True, "status": "processing", "ecf_encf": encf, "motivo": "Procesando con DGII... reintentando automaticamente"}


# ─── POLLING ENDPOINT ───

@router.get("/status/{bill_id}")
async def get_ecf_status(bill_id: str, user=Depends(get_current_user)):
    """Get current e-CF status for polling."""
    bill = await db.bills.find_one(
        {"id": bill_id},
        {"_id": 0, "ecf_status": 1, "ecf_encf": 1, "ecf_qr": 1, "ecf_trackid": 1,
         "ecf_reject_reason": 1, "ecf_error": 1, "ecf_attempts": 1, "ecf_next_retry_at": 1,
         "ecf_provider": 1}
    )
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    status = bill.get("ecf_status", "")
    # Normalize for frontend
    normalized = status
    if status == "FINISHED":
        normalized = "aceptado"
    elif status == "REJECTED":
        normalized = "rechazado"
    elif status == "CONTINGENCIA":
        normalized = "contingencia"
    elif status == "PROCESSING":
        normalized = "processing"

    return {
        "ecf_status": normalized,
        "ecf_encf": bill.get("ecf_encf"),
        "ecf_qr": bill.get("ecf_qr"),
        "ecf_trackid": bill.get("ecf_trackid"),
        "motivo": bill.get("ecf_reject_reason") or bill.get("ecf_error"),
        "attempts": bill.get("ecf_attempts", 0),
        "next_retry_at": bill.get("ecf_next_retry_at"),
        "provider": bill.get("ecf_provider"),
    }


# ─── TEST CONNECTION ───

@router.post("/test-multiprod")
async def test_multiprod_connection(user=Depends(get_current_user)):
    """Test Multiprod connection by validating a sample XML against Megaplus validator."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo admin puede probar la conexion")

    from services.multiprod_service import multiprod_service

    endpoint, token = await get_multiprod_credentials()
    system_config = await db.system_config.find_one({}, {"_id": 0}) or {}
    rnc = system_config.get("ticket_rnc") or system_config.get("rnc") or system_config.get("ecf_alanube_rnc") or "000000000"

    # Step 1: Generate test XML using the real builder — unique e-NCF per test
    import random
    test_seq = random.randint(100000, 9999999999)
    test_encf = f"E32{str(test_seq).zfill(10)}"
    test_bill = {
        "items": [{"product_name": "Producto de prueba", "unit_price": 100, "quantity": 1}],
        "total": 118,
        "payments": [{"method": "efectivo"}],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    results = {"step0_local_validation": None, "step1_validator": None, "step2_multiprod": None}
    try:
        test_xml = multiprod_service.build_xml(test_bill, system_config, "E32", test_encf)
    except Exception as e:
        return {"ok": False, "message": f"Error construyendo XML de prueba: {str(e)}", "results": results}

    # Step 1.5: Local XSD validation
    valid, validation_msg = multiprod_service.validate_xml_local(test_xml, "32")
    results["step0_local_validation"] = {"ok": valid, "message": validation_msg}
    if not valid:
        return {"ok": False, "message": f"XML no pasa validacion XSD local: {validation_msg}", "results": results}

    # Step 2: Validate against Megaplus
    validator_result = await multiprod_service.validate_xml_remote(test_xml, rnc, test_encf)
    results["step1_validator"] = validator_result

    if not validator_result.get("ok"):
        return {
            "ok": False,
            "message": f"Validacion Megaplus fallo: {validator_result.get('message', 'Error desconocido')}",
            "results": results,
        }

    # Step 3: Send to Multiprod (only if endpoint configured)
    if endpoint:
        full_endpoint = endpoint
        if token and token not in endpoint:
            full_endpoint = f"{endpoint.rstrip('/')}/{token}"

        clean_rnc = rnc.replace("-", "").strip()
        send_result = await multiprod_service.send_ecf(test_xml, full_endpoint, rnc=clean_rnc, encf=test_encf)
        results["step2_multiprod"] = {k: v for k, v in send_result.items() if k != "raw"}

        if send_result.get("ok") or (send_result.get("estado") or "").startswith("aceptado"):
            return {"ok": True, "message": f"Conexion exitosa. TrackId: {send_result.get('trackId', 'N/A')}", "results": results}
        else:
            motivo = send_result.get("motivo") or send_result.get("raw_text", "Error desconocido")
            return {"ok": False, "message": f"Multiprod respondio: {motivo[:200]}", "results": results}
    else:
        return {"ok": True, "message": "Validacion Megaplus exitosa. Configure URL Multiprod para probar envio.", "results": results}


# ─── CLEANUP JOB (called from scheduler) ───

async def cleanup_expired_reservations():
    """Release expired reservations (by crashes/disconnections). Run every minute."""
    now = datetime.now(timezone.utc).isoformat()
    expired = await db.encf_reservations.find({
        "status": "reserved",
        "reserved_until": {"$lt": now}
    }).to_list(50)

    for res in expired:
        # Check if the bill is still in processing
        bill = await db.bills.find_one({"id": res["invoice_id"]}, {"_id": 0, "ecf_status": 1})
        if bill and bill.get("ecf_status") == "PROCESSING":
            # Extend reservation by 5 more minutes
            new_until = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
            await db.encf_reservations.update_one(
                {"id": res["id"]},
                {"$set": {"reserved_until": new_until}}
            )
        else:
            # Release
            await release_reservation(res["id"])
            print(f"Released expired e-NCF reservation: {res['encf']}")
