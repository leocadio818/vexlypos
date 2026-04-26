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
from utils.supabase_helpers import sb_select, sb_insert, sb_update_filter

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
        sys_cfg = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
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
    await db.system_config.update_one({"id": "main"}, {"$set": {"ecf_provider": input.provider}}, upsert=True)

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
    sys_cfg = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
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
    seq_result = sb_select(supabase_client.table("ncf_sequences").select("*")).eq("ncf_type_id", ecf_type).eq("is_active", True).limit(1).execute()
    if not seq_result.data:
        seq_result = sb_select(supabase_client.table("ncf_sequences").select("*")).eq("sequence_prefix", ecf_type).eq("is_active", True).limit(1).execute()
    if not seq_result.data:
        raise HTTPException(status_code=400, detail=f"No hay secuencia activa para {ecf_type}")

    seq = seq_result.data[0]
    current_num = seq.get("current_number", 1)
    serie = seq.get("serie") or seq.get("sequence_prefix", "E")[:1]
    tipo_num = ecf_type[1:]  # "E32" -> "32"
    encf = f"{serie}{tipo_num}{str(current_num).zfill(10)}"

    # Increment in Supabase
    sb_update_filter(supabase_client.table("ncf_sequences").update({
        "current_number": current_num + 1
    }).eq("id", seq["id"])).execute()

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

    return encf, reservation["id"], seq.get("valid_until")


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
            sb_update_filter(supabase_client.table("ncf_sequences").update({
                "current_number": res["original_number"]
            }).eq("id", res["sequence_id"])).execute()
        except Exception as e:
            print(f"Warning: Could not release e-NCF sequence: {e}")

    await db.encf_reservations.update_one(
        {"id": reservation_id},
        {"$set": {"status": "released", "released_at": now_iso()}}
    )


# ─── RETRY QUEUE ───
# Backoff intervals for auto-retry (seconds): 0s (immediate), 30s, 2min, 10min, 1h
# Total max wait: ~1h13min across 5 attempts
RETRY_BACKOFFS = [0, 30, 120, 600, 3600]


def _is_ncf_burned_error(result: dict) -> bool:
    """
    Detect the specific case where the e-NCF was already used previously (DGII code 75).
    When this happens, we should NOT mark the bill as REJECTED permanently —
    instead we should rotate to the next available e-NCF and try again.

    Detection:
      - codigo == 2  (Rechazado) AND
      - one of mensajes[].codigo == "75"  OR  motivo contains "ya han sido utilizados"
    """
    if not isinstance(result, dict):
        return False
    if result.get("codigo") != 2:
        return False
    motivo = (result.get("motivo") or "").lower()
    if "ya han sido utilizados" in motivo or "ya utilizado" in motivo:
        return True
    # Inspect raw body for the specific message code "75"
    diagnostics = result.get("diagnostics") or {}
    body_raw = (diagnostics.get("body_raw") or "") if isinstance(diagnostics, dict) else ""
    if '"codigo":"75"' in body_raw or '"codigo": "75"' in body_raw:
        return True
    return False


def _is_permanent_error(result: dict) -> bool:
    """
    Classifier: is this error permanent (requires manual action) or transient (safe to auto-retry)?
    Permanent:
      - estado == "rechazado" → DGII refused the document structurally (eNCF consumed)
      - 4xx HTTP errors (except 408 timeout, 429 rate limit)
    Transient (auto-retry):
      - estado == "error_formato" / "error_http" / "error_conexion" → Multiprod server issues
      - HTTP 500, 502, 503, 504, 408, 429
      - Timeouts, network failures
    NOTE: NCF-burned errors (code 75) are handled SEPARATELY via _is_ncf_burned_error
    so the dispatcher can rotate to a new e-NCF instead of marking REJECTED.
    """
    if not isinstance(result, dict):
        return False
    # NCF burned is NOT permanent — it's recoverable via rotation
    if _is_ncf_burned_error(result):
        return False
    estado = (result.get("estado") or "").lower()
    if estado == "rechazado":
        return True
    http_status = result.get("diagnostics", {}).get("http_status") if isinstance(result.get("diagnostics"), dict) else None
    if isinstance(http_status, int):
        # 4xx except timeout/rate-limit → permanent (auth, validation, not found)
        if 400 <= http_status < 500 and http_status not in (408, 429):
            return True
    return False


# Maximum NCF rotations per bill before giving up (prevents infinite NCF burning)
MAX_NCF_ROTATIONS = 3


async def _rotate_and_resend(bill_id: str, old_reservation_id: str, ecf_type: str,
                              endpoint: str, full_endpoint: str, attempt_label: str) -> dict:
    """
    Release the current NCF reservation, reserve a NEW e-NCF, rebuild XML, and re-send.
    Returns the result dict from multiprod_service.send_ecf().

    Increments bill.ecf_ncf_rotations counter and tracks rotated NCFs in bill.ecf_rotated_encfs.
    Caller is responsible for handling the result (success/failure/further rotation).
    """
    from services.multiprod_service import multiprod_service

    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        return {"ok": False, "estado": "error_interno", "motivo": "Factura no encontrada para rotación"}

    # Track the burned NCF before releasing
    old_res = await db.encf_reservations.find_one({"id": old_reservation_id}, {"_id": 0}) or {}
    old_encf = old_res.get("encf") or bill.get("ecf_encf")

    # Release old reservation back to the pool — NOTE: in 'ya usado' case the NCF is already
    # consumed in DGII, so we mark it as 'consumed' (not released) to avoid reusing it.
    await db.encf_reservations.update_one(
        {"id": old_reservation_id},
        {"$set": {"status": "consumed", "consumed_at": now_iso(),
                  "consumed_reason": "ncf_burned_rotated"}}
    )

    # Reserve new e-NCF
    try:
        new_encf, new_reservation_id, seq_valid_until = await reserve_encf(ecf_type, bill_id)
    except Exception as e:
        return {"ok": False, "estado": "error_interno",
                "motivo": f"Error reservando nuevo e-NCF: {str(e)}"}

    # Get system config & build new XML with the new e-NCF
    system_config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    try:
        bill_for_xml = {**bill, "seq_valid_until": seq_valid_until}
        xml_content = multiprod_service.build_xml(bill_for_xml, system_config, ecf_type, new_encf)
    except Exception as e:
        await release_reservation(new_reservation_id)
        return {"ok": False, "estado": "error_interno",
                "motivo": f"Error construyendo XML para rotación: {str(e)}"}

    # Validate new XML locally
    valid, validation_msg = multiprod_service.validate_xml_local(xml_content, ecf_type)
    if not valid:
        await release_reservation(new_reservation_id)
        return {"ok": False, "estado": "error_interno",
                "motivo": f"XML rotado no válido: {validation_msg}"}

    # Send to Multiprod with new NCF
    rnc_emisor = (system_config.get("ticket_rnc") or system_config.get("rnc")
                  or system_config.get("ecf_alanube_rnc") or "").replace("-", "").strip()
    result = await multiprod_service.send_ecf(xml_content, full_endpoint or endpoint,
                                               rnc=rnc_emisor, encf=new_encf)

    # Persist rotation metadata BEFORE returning
    rotations = (bill.get("ecf_ncf_rotations") or 0) + 1
    rotated_list = list(bill.get("ecf_rotated_encfs") or [])
    if old_encf and old_encf not in rotated_list:
        rotated_list.append(old_encf)
    await db.bills.update_one({"id": bill_id}, {"$set": {
        "ecf_encf": new_encf,
        "ecf_ncf_rotations": rotations,
        "ecf_rotated_encfs": rotated_list,
        "ecf_last_reservation_id": new_reservation_id,
    }})

    # Log the rotation attempt
    await db.ecf_logs.insert_one({
        "id": gen_id(),
        "bill_id": bill_id,
        "encf": new_encf,
        "previous_encf": old_encf,
        "action": f"multiprod_rotate_ncf_{attempt_label}",
        "rotation_number": rotations,
        "result": {k: v for k, v in result.items() if k != "raw"},
        "created_at": now_iso(),
    })

    # Attach rotation context for caller
    result["_rotation_meta"] = {
        "new_encf": new_encf,
        "new_reservation_id": new_reservation_id,
        "rotations_done": rotations,
        "old_encf": old_encf,
    }
    return result


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
    # Mirror to bill for UI visibility
    await db.bills.update_one({"id": bill_id}, {"$set": {
        "ecf_auto_retry_attempt": attempt,
        "ecf_auto_retry_next_at": next_retry.isoformat(),
        "ecf_auto_retry_status": "pending",
        "ecf_auto_retry_max": 5,
    }})


async def process_retry(bill_id: str):
    """
    Process ONE retry attempt from the queue (no recursion, no sleep).
    Called by:
      - Direct fire-and-forget after initial send failure (waits brief initial backoff if any).
      - Scheduled worker `auto_retry_worker` that polls the queue every 60s.
    """
    from services.multiprod_service import multiprod_service

    entry = await db.ecf_retry_queue.find_one({"bill_id": bill_id, "status": "pending"}, {"_id": 0})
    if not entry:
        return

    attempt = entry.get("attempt", 1)
    endpoint = entry.get("endpoint")
    xml = entry.get("xml_content")
    encf = entry.get("encf")
    reservation_id = entry.get("reservation_id")

    # Brief initial sleep only for first attempt's small backoff (≤30s acceptable inline)
    # Longer backoffs (≥2min) are handled by the scheduled worker, never inline.
    wait_seconds = RETRY_BACKOFFS[min(attempt - 1, len(RETRY_BACKOFFS) - 1)]
    if 0 < wait_seconds <= 30:
        await asyncio.sleep(wait_seconds)
    elif wait_seconds > 30:
        # Long backoff — let the worker handle it; don't block here
        return

    # Send to Multiprod — fetch RNC for proper filename
    sys_cfg = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    rnc_emisor = (sys_cfg.get("ticket_rnc") or sys_cfg.get("rnc") or sys_cfg.get("ecf_alanube_rnc") or "").replace("-", "").strip()
    result = await multiprod_service.send_ecf(xml, endpoint, rnc=rnc_emisor, encf=encf)

    # Log attempt
    await db.ecf_logs.insert_one({
        "id": gen_id(),
        "bill_id": bill_id,
        "encf": encf,
        "action": f"multiprod_auto_retry_{attempt}",
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
            "ecf_auto_retry_status": "completed",
            "ecf_auto_retry_next_at": None,
        }})
        await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "completed", "updated_at": now_iso()}})
        return

    # Classify the error
    # Special case: e-NCF was already used (code 75) → rotate to next NCF and re-send
    if _is_ncf_burned_error(result):
        rotations_done = ((await db.bills.find_one({"id": bill_id}, {"_id": 0, "ecf_ncf_rotations": 1})) or {}).get("ecf_ncf_rotations", 0)
        # Derive ecf_type from current encf prefix (e.g. "E32...")
        ecf_type_for_rotation = (encf or "")[:3] if isinstance(encf, str) else "E32"
        if rotations_done < MAX_NCF_ROTATIONS:
            rot_result = await _rotate_and_resend(
                bill_id, reservation_id, ecf_type_for_rotation,
                endpoint, endpoint, attempt_label=f"auto_{attempt}"
            )
            new_meta = rot_result.get("_rotation_meta") or {}
            new_encf = new_meta.get("new_encf")
            new_reservation_id = new_meta.get("new_reservation_id")
            new_estado = (rot_result.get("estado") or "").lower()
            if new_estado.startswith("aceptado"):
                if new_reservation_id:
                    await consume_reservation(new_reservation_id)
                await db.bills.update_one({"id": bill_id}, {"$set": {
                    "ecf_status": "FINISHED",
                    "ecf_encf": new_encf,
                    "ecf_qr": rot_result.get("qr"),
                    "ecf_trackid": rot_result.get("trackId"),
                    "ecf_provider": "multiprod",
                    "ecf_attempts": attempt,
                    "ecf_sent_at": now_iso(),
                    "ecf_auto_retry_status": "completed",
                    "ecf_auto_retry_next_at": None,
                }})
                await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "completed", "updated_at": now_iso()}})
                return
            # Rotation didn't succeed — re-enqueue with NEW encf+reservation for next retry
            if new_encf and new_reservation_id:
                await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {
                    "encf": new_encf,
                    "reservation_id": new_reservation_id,
                    "updated_at": now_iso(),
                }})
            # Fall through to transient handling with the rotation result
            result = rot_result
        else:
            # Exceeded rotation budget — mark contingencia for manual review
            await db.bills.update_one({"id": bill_id}, {"$set": {
                "ecf_status": "CONTINGENCIA",
                "ecf_provider": "multiprod",
                "ecf_error": f"NCF quemado tras {MAX_NCF_ROTATIONS} rotaciones automáticas. Revisión manual.",
                "ecf_reject_reason": result.get("motivo", "NCF ya utilizada"),
                "ecf_attempts": attempt,
                "ecf_auto_retry_status": "exhausted",
                "ecf_auto_retry_next_at": None,
            }})
            await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "exhausted", "updated_at": now_iso()}})
            return

    if _is_permanent_error(result):
        # Permanent — stop auto-retry, require manual intervention
        await consume_reservation(reservation_id)
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "REJECTED",
            "ecf_encf": encf,
            "ecf_provider": "multiprod",
            "ecf_reject_reason": result.get("motivo", "Rechazado por DGII"),
            "ecf_attempts": attempt,
            "ecf_sent_at": now_iso(),
            "ecf_auto_retry_status": "permanent_error",
            "ecf_auto_retry_next_at": None,
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
            "ecf_error": result.get("motivo", "Agoto reintentos automáticos"),
            "ecf_attempts": attempt,
            "ecf_auto_retry_status": "exhausted",
            "ecf_auto_retry_next_at": None,
        }})
        await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "exhausted", "updated_at": now_iso()}})
        return

    # Schedule next retry — worker will pick it up
    next_wait = RETRY_BACKOFFS[min(next_attempt - 1, len(RETRY_BACKOFFS) - 1)]
    next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=next_wait)
    await db.bills.update_one({"id": bill_id}, {"$set": {
        "ecf_attempts": attempt,
        "ecf_auto_retry_attempt": next_attempt,
        "ecf_auto_retry_next_at": next_retry_at.isoformat(),
        "ecf_auto_retry_status": "pending",
    }})
    await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {
        "attempt": next_attempt,
        "next_retry_at": next_retry_at.isoformat(),
        "updated_at": now_iso(),
    }})


async def run_background_retries(bill_id: str):
    """Run the immediate retry (attempts 1-2 if short backoff)."""
    try:
        await process_retry(bill_id)
    except Exception as e:
        print(f"Background retry error for {bill_id}: {e}")


async def auto_retry_worker():
    """
    Scheduled worker: runs every 60 seconds.
    Picks entries from ecf_retry_queue where status=pending AND next_retry_at <= now,
    and processes them. This enables long backoffs (2min, 10min, 1h) without holding coroutines.
    """
    try:
        now_dt = datetime.now(timezone.utc).isoformat()
        # Pick all ready entries (cap at 50 to avoid flooding)
        ready = await db.ecf_retry_queue.find(
            {"status": "pending", "next_retry_at": {"$lte": now_dt}},
            {"_id": 0, "bill_id": 1}
        ).limit(50).to_list(50)
        for entry in ready:
            try:
                await process_retry(entry["bill_id"])
            except Exception as e:
                print(f"auto_retry_worker: error processing {entry.get('bill_id')}: {e}")
    except Exception as e:
        print(f"auto_retry_worker: unexpected error: {e}")


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
        encf, reservation_id, seq_valid_until = await reserve_encf(ecf_type, bill_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reservando e-NCF: {str(e)}")

    # Get system config for XML building
    system_config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}

    # Build XML — pass seq_valid_until for FechaVencimientoSecuencia
    try:
        bill_for_xml = {**bill, "seq_valid_until": seq_valid_until}
        xml_content = multiprod_service.build_xml(bill_for_xml, system_config, ecf_type, encf)
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
        # Special case: e-NCF was already used (code 75) → rotate to a fresh NCF
        if _is_ncf_burned_error(result):
            rotated_result = result
            for rot_idx in range(1, MAX_NCF_ROTATIONS + 1):
                rotated_result = await _rotate_and_resend(
                    bill_id,
                    rotated_result.get("_rotation_meta", {}).get("new_reservation_id", reservation_id),
                    ecf_type, full_endpoint, full_endpoint,
                    attempt_label=f"sync_{rot_idx}"
                )
                meta = rotated_result.get("_rotation_meta") or {}
                new_encf = meta.get("new_encf")
                new_res_id = meta.get("new_reservation_id")
                new_estado = (rotated_result.get("estado") or "").lower()
                if new_estado.startswith("aceptado"):
                    if new_res_id:
                        await consume_reservation(new_res_id)
                    await db.bills.update_one({"id": bill_id}, {"$set": {
                        "ecf_status": "FINISHED",
                        "ecf_encf": new_encf,
                        "ecf_qr": rotated_result.get("qr"),
                        "ecf_trackid": rotated_result.get("trackId"),
                        "ecf_provider": "multiprod",
                        "ecf_attempts": 1 + rot_idx,
                        "ecf_sent_at": now_iso(),
                    }})
                    return {"ok": True, "status": "aceptado",
                            "ecf_encf": new_encf, "ecf_qr": rotated_result.get("qr"),
                            "trackId": rotated_result.get("trackId"),
                            "rotated_from": meta.get("old_encf")}
                if not _is_ncf_burned_error(rotated_result):
                    # New encf got a different error — break and let normal handling continue
                    break
            # All rotations exhausted (or different error) — mark contingencia
            await db.bills.update_one({"id": bill_id}, {"$set": {
                "ecf_status": "CONTINGENCIA",
                "ecf_provider": "multiprod",
                "ecf_error": f"NCF quemado tras {MAX_NCF_ROTATIONS} rotaciones automáticas",
                "ecf_reject_reason": rotated_result.get("motivo", "NCF ya utilizada"),
                "ecf_attempts": 1 + MAX_NCF_ROTATIONS,
                "ecf_sent_at": now_iso(),
            }})
            return {"ok": False, "status": "contingencia",
                    "ecf_encf": (rotated_result.get("_rotation_meta") or {}).get("new_encf", encf),
                    "motivo": rotated_result.get("motivo", "NCF ya utilizada — agotadas rotaciones automáticas")}

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
    system_config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
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



# ─── MANUAL RESEND WITH ROTATION (rotate to new e-NCF) ───

@router.post("/resend-rotate/{bill_id}")
async def resend_with_new_ncf(bill_id: str, user=Depends(get_current_user)):
    """
    Manually resend an e-CF for a bill, rotating to the next available e-NCF.
    Valid for any bill not in FINISHED state (REJECTED, CONTINGENCIA, PROCESSING, ERROR, etc.).
    The previous e-NCF is marked as consumed (already burned at DGII), and a fresh one is reserved.
    """
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    if bill.get("ecf_status") == "FINISHED":
        raise HTTPException(status_code=400, detail="Esta factura ya está finalizada (FINISHED). No se puede reenviar.")

    # Get Multiprod creds
    endpoint, token = await get_multiprod_credentials()
    if not endpoint:
        raise HTTPException(status_code=400, detail="Multiprod no configurado")
    full_endpoint = endpoint
    if token and token not in endpoint:
        full_endpoint = f"{endpoint.rstrip('/')}/{token}"

    # Find the most recent reservation tied to this bill (might be already consumed)
    last_res = await db.encf_reservations.find_one(
        {"invoice_id": bill_id},
        {"_id": 0},
        sort=[("reserved_at", -1)]
    )
    last_reservation_id = (last_res or {}).get("id") or bill.get("ecf_last_reservation_id") or "manual_no_prior_reservation"

    # Determine ecf_type
    current_encf = bill.get("ecf_encf") or ""
    ecf_type = current_encf[:3] if isinstance(current_encf, str) and current_encf.startswith("E") else (bill.get("ecf_type") or "E32")

    # Mark bill as processing
    await db.bills.update_one({"id": bill_id}, {"$set": {
        "ecf_status": "PROCESSING",
        "ecf_provider": "multiprod",
        "ecf_error": None,
        "ecf_reject_reason": None,
    }})

    # Rotate + send
    rot_result = await _rotate_and_resend(
        bill_id, last_reservation_id, ecf_type,
        endpoint, full_endpoint, attempt_label="manual"
    )
    meta = rot_result.get("_rotation_meta") or {}
    new_encf = meta.get("new_encf")
    new_res_id = meta.get("new_reservation_id")
    new_estado = (rot_result.get("estado") or "").lower()

    if new_estado.startswith("aceptado"):
        if new_res_id:
            await consume_reservation(new_res_id)
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "FINISHED",
            "ecf_encf": new_encf,
            "ecf_qr": rot_result.get("qr"),
            "ecf_trackid": rot_result.get("trackId"),
            "ecf_provider": "multiprod",
            "ecf_sent_at": now_iso(),
            "ecf_auto_retry_status": "completed",
            "ecf_auto_retry_next_at": None,
        }})
        # Cancel any pending retry queue entry
        await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "completed", "updated_at": now_iso()}})
        return {"ok": True, "status": "aceptado", "ecf_encf": new_encf, "rotated_from": meta.get("old_encf"),
                "ecf_qr": rot_result.get("qr"), "trackId": rot_result.get("trackId")}

    # If burned again, recurse internally up to MAX_NCF_ROTATIONS - 1 more times
    if _is_ncf_burned_error(rot_result):
        for i in range(2, MAX_NCF_ROTATIONS + 1):
            rot_result = await _rotate_and_resend(
                bill_id, new_res_id or last_reservation_id, ecf_type,
                endpoint, full_endpoint, attempt_label=f"manual_{i}"
            )
            meta = rot_result.get("_rotation_meta") or {}
            new_encf = meta.get("new_encf")
            new_res_id = meta.get("new_reservation_id")
            if (rot_result.get("estado") or "").lower().startswith("aceptado"):
                if new_res_id:
                    await consume_reservation(new_res_id)
                await db.bills.update_one({"id": bill_id}, {"$set": {
                    "ecf_status": "FINISHED",
                    "ecf_encf": new_encf,
                    "ecf_qr": rot_result.get("qr"),
                    "ecf_trackid": rot_result.get("trackId"),
                    "ecf_provider": "multiprod",
                    "ecf_sent_at": now_iso(),
                    "ecf_auto_retry_status": "completed",
                    "ecf_auto_retry_next_at": None,
                }})
                await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "completed", "updated_at": now_iso()}})
                return {"ok": True, "status": "aceptado", "ecf_encf": new_encf,
                        "rotated_from": meta.get("old_encf"),
                        "ecf_qr": rot_result.get("qr"), "trackId": rot_result.get("trackId")}
            if not _is_ncf_burned_error(rot_result):
                break

    # Final state: not finished
    if (rot_result.get("estado") or "").lower() == "rechazado":
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "REJECTED",
            "ecf_encf": new_encf,
            "ecf_provider": "multiprod",
            "ecf_reject_reason": rot_result.get("motivo", "Rechazado por DGII"),
            "ecf_sent_at": now_iso(),
        }})
        return {"ok": False, "status": "rechazado", "ecf_encf": new_encf, "motivo": rot_result.get("motivo")}

    # Transient/error after rotation — leave in CONTINGENCIA so user can try again later
    await db.bills.update_one({"id": bill_id}, {"$set": {
        "ecf_status": "CONTINGENCIA",
        "ecf_provider": "multiprod",
        "ecf_error": rot_result.get("motivo", "Error transitorio en reenvío manual"),
        "ecf_sent_at": now_iso(),
    }})
    return {"ok": False, "status": "contingencia", "ecf_encf": new_encf,
            "motivo": rot_result.get("motivo", "Reintentar más tarde")}
