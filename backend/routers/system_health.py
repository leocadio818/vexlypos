"""
VexlyPOS — System Health Check Module (Super Admin only)

Provides a real-time snapshot of the platform's critical subsystems:
 - MongoDB connectivity + latency
 - Print Agent heartbeat (via print_queue last activity)
 - e-CF provider (last successful emission + current provider)
 - Active orders count
 - Recent errors (audit_logs / system_logs)
 - Build / version info

Only accessible to users with `is_super_admin: true`.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
import time
import os
import subprocess

from routers.auth import get_current_user

router = APIRouter(tags=["system-health"])

db = None


def set_db(database):
    global db
    db = database


async def _require_super_admin(user_payload: dict) -> None:
    user_id = user_payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="No autenticado")
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "is_super_admin": 1})
    if not (u and u.get("is_super_admin") is True):
        raise HTTPException(status_code=403, detail="Solo super administradores pueden ver el estado del sistema")


def _classify(status_bool: bool, warning: bool = False) -> str:
    if warning:
        return "warning"
    return "ok" if status_bool else "error"


async def _check_mongo() -> dict:
    start = time.perf_counter()
    try:
        await db.command("ping")
        latency_ms = round((time.perf_counter() - start) * 1000, 1)
        return {
            "status": "warning" if latency_ms > 500 else "ok",
            "latency_ms": latency_ms,
            "message": f"Ping OK ({latency_ms}ms)" if latency_ms <= 500 else f"Latencia alta ({latency_ms}ms)",
        }
    except Exception as e:
        return {"status": "error", "latency_ms": None, "message": f"Error: {str(e)[:100]}"}


async def _check_print_agent() -> dict:
    """Infer Print Agent liveness from the print_queue collection.

    Heuristic: if there are completed jobs in the last 15 minutes the agent
    is alive. If the queue is empty we cannot prove it — return unknown.
    """
    try:
        last = await db.print_queue.find_one(
            {"status": {"$in": ["completed", "failed"]}},
            sort=[("completed_at", -1)],
            projection={"_id": 0, "completed_at": 1, "status": 1},
        )
        pending = await db.print_queue.count_documents({"status": {"$in": ["pending", "processing"]}})
        if not last:
            return {
                "status": "unknown",
                "message": "Sin actividad registrada (cola vacía)",
                "pending": pending,
                "last_activity": None,
            }
        completed_at = last.get("completed_at")
        if isinstance(completed_at, str):
            try:
                completed_at_dt = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
            except Exception:
                completed_at_dt = None
        elif isinstance(completed_at, datetime):
            completed_at_dt = completed_at
        else:
            completed_at_dt = None

        if completed_at_dt is None:
            return {"status": "unknown", "message": "Fecha inválida", "pending": pending, "last_activity": None}

        if completed_at_dt.tzinfo is None:
            completed_at_dt = completed_at_dt.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - completed_at_dt
        age_min = round(age.total_seconds() / 60, 1)
        iso = completed_at_dt.isoformat()

        if age < timedelta(minutes=5):
            return {"status": "ok", "message": f"Activo hace {age_min} min", "pending": pending, "last_activity": iso}
        if age < timedelta(minutes=30):
            return {"status": "warning", "message": f"Sin actividad hace {age_min} min", "pending": pending, "last_activity": iso}
        return {"status": "error", "message": f"Inactivo hace {age_min} min", "pending": pending, "last_activity": iso}
    except Exception as e:
        return {"status": "error", "message": f"Error: {str(e)[:100]}", "pending": 0, "last_activity": None}


async def _check_ecf() -> dict:
    try:
        cfg = await db.system_config.find_one({}, {"_id": 0, "ecf_enabled": 1, "ecf_provider": 1}) or {}
        enabled = bool(cfg.get("ecf_enabled"))
        provider = cfg.get("ecf_provider") or "alanube"
        if not enabled:
            return {"status": "disabled", "provider": provider, "message": "e-CF deshabilitado", "last_ncf": None, "last_ncf_at": None}

        # Look up latest successful e-CF emission in bills
        last = await db.bills.find_one(
            {"ecf_status": "accepted"},
            sort=[("ecf_sent_at", -1)],
            projection={"_id": 0, "ncf": 1, "ecf_sent_at": 1},
        )
        if not last:
            last = await db.bills.find_one(
                {"ncf": {"$exists": True, "$ne": None}},
                sort=[("created_at", -1)],
                projection={"_id": 0, "ncf": 1, "created_at": 1, "ecf_sent_at": 1},
            )
        if not last:
            return {"status": "warning", "provider": provider, "message": "No se ha emitido ningún NCF aún", "last_ncf": None, "last_ncf_at": None}
        return {
            "status": "ok",
            "provider": provider,
            "message": f"Último NCF: {last.get('ncf', 'N/A')}",
            "last_ncf": last.get("ncf"),
            "last_ncf_at": str(last.get("ecf_sent_at") or last.get("created_at") or ""),
        }
    except Exception as e:
        return {"status": "error", "provider": "unknown", "message": f"Error: {str(e)[:100]}", "last_ncf": None, "last_ncf_at": None}


async def _check_active_orders() -> dict:
    try:
        active = await db.orders.count_documents({"status": {"$in": ["open", "pending", "preparing"]}})
        unbilled = await db.orders.count_documents({"status": "completed", "bill_id": {"$exists": False}})
        return {"status": "ok", "active": active, "unbilled": unbilled, "message": f"{active} activas / {unbilled} sin facturar"}
    except Exception as e:
        return {"status": "error", "active": 0, "unbilled": 0, "message": f"Error: {str(e)[:100]}"}


async def _check_recent_errors() -> dict:
    try:
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        errors = await db.audit_logs.find(
            {"level": "error", "created_at": {"$gte": since}},
            sort=[("created_at", -1)],
            limit=5,
            projection={"_id": 0, "message": 1, "created_at": 1, "source": 1},
        ).to_list(length=5)

        total = await db.audit_logs.count_documents({"level": "error", "created_at": {"$gte": since}})

        items = []
        for e in errors:
            items.append({
                "message": str(e.get("message", ""))[:200],
                "source": e.get("source", ""),
                "created_at": str(e.get("created_at", "")),
            })

        status = "ok"
        if total > 0:
            status = "warning"
        if total >= 20:
            status = "error"
        return {"status": status, "total_24h": total, "recent": items, "message": f"{total} errores en 24h"}
    except Exception:
        return {"status": "unknown", "total_24h": 0, "recent": [], "message": "Sin logs disponibles"}


def _get_build_info() -> dict:
    # Prefer env-provided build info (set in deployment). Fallback: read git if available.
    commit = os.environ.get("BUILD_COMMIT") or ""
    build_date = os.environ.get("BUILD_DATE") or ""
    if not commit:
        try:
            commit = subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd="/app",
                stderr=subprocess.DEVNULL,
                timeout=2,
            ).decode().strip()
        except Exception:
            commit = "unknown"
    if not build_date:
        try:
            build_date = subprocess.check_output(
                ["git", "log", "-1", "--format=%cd", "--date=iso"],
                cwd="/app",
                stderr=subprocess.DEVNULL,
                timeout=2,
            ).decode().strip()
        except Exception:
            build_date = ""
    return {"commit": commit, "build_date": build_date, "version": "1.0.0"}


@router.get("/system/health-check")
async def system_health_check(user: dict = Depends(get_current_user)):
    """Comprehensive health check for Super Admin dashboard.

    Aggregates all critical subsystem statuses in a single call. Frontend
    polls this endpoint every ~30 seconds from the Salud tab.
    """
    await _require_super_admin(user)

    mongo = await _check_mongo()
    print_agent = await _check_print_agent()
    ecf = await _check_ecf()
    orders = await _check_active_orders()
    errors = await _check_recent_errors()
    build = _get_build_info()

    # Derive global status (worst of all)
    def worst(a: str, b: str) -> str:
        order = {"ok": 0, "disabled": 0, "unknown": 1, "warning": 2, "error": 3}
        return a if order.get(a, 0) >= order.get(b, 0) else b

    global_status = "ok"
    for s in [mongo["status"], print_agent["status"], ecf["status"], orders["status"], errors["status"]]:
        global_status = worst(global_status, s)

    return {
        "global_status": global_status,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "mongo": mongo,
        "print_agent": print_agent,
        "ecf": ecf,
        "orders": orders,
        "errors": errors,
        "build": build,
    }
