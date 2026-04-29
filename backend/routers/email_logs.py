"""
Email Logs router — admin-only consumption dashboard for Resend emails.

Reads from MongoDB collection `email_logs` (populated by services.email_logger).
All endpoints require role_level >= 100 (Administrador del Sistema).
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from routers.auth import get_current_user, get_role_level_async

router = APIRouter()
db = None

# Defaults applied if not explicitly configured in system_config:main.
DEFAULT_MONTHLY_QUOTA = 1000
DEFAULT_ALERT_THRESHOLD = 0.8  # 80%


def set_db(database):
    global db
    db = database


async def _require_level_100(user: dict):
    """Raise 403 if the caller is not a system administrator (level >= 100)."""
    role = user.get("role", "waiter")
    level = await get_role_level_async(role)
    if level < 100:
        raise HTTPException(status_code=403, detail="Solo el Administrador del Sistema puede consultar el consumo de emails")


def _utc_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _calendar_month_start(now: datetime) -> datetime:
    """First instant of the current calendar month in UTC."""
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _next_calendar_month_start(now: datetime) -> datetime:
    """First instant of the following calendar month in UTC."""
    if now.month == 12:
        return now.replace(year=now.year + 1, month=1, day=1,
                           hour=0, minute=0, second=0, microsecond=0)
    return now.replace(month=now.month + 1, day=1,
                       hour=0, minute=0, second=0, microsecond=0)


async def _quota_settings() -> dict:
    cfg = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    try:
        limit = int(cfg.get("email_monthly_quota") or DEFAULT_MONTHLY_QUOTA)
    except (TypeError, ValueError):
        limit = DEFAULT_MONTHLY_QUOTA
    try:
        threshold = float(cfg.get("email_quota_alert_threshold") or DEFAULT_ALERT_THRESHOLD)
    except (TypeError, ValueError):
        threshold = DEFAULT_ALERT_THRESHOLD
    # Sanitize ranges
    if limit < 0:
        limit = 0
    if threshold < 0.1:
        threshold = 0.1
    if threshold > 1.0:
        threshold = 1.0
    return {"limit": limit, "threshold": threshold}


async def _calendar_month_count(start: datetime, end: datetime) -> int:
    return await db.email_logs.count_documents({
        "created_at": {"$gte": _utc_iso(start), "$lt": _utc_iso(end)},
    })


@router.get("/email-logs/stats")
async def email_logs_stats(user: dict = Depends(get_current_user)):
    """Return per-day / per-week / rolling-30d counters, breakdown by type,
    20 most recent emails and a quota block (calendar-month based).
    Admin level 100 only."""
    await _require_level_100(user)

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)  # rolling 30d for "this_month" KPI

    async def _bucket(since: datetime) -> dict:
        since_iso = _utc_iso(since)
        pipeline = [
            {"$match": {"created_at": {"$gte": since_iso}}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        sent = 0
        failed = 0
        async for row in db.email_logs.aggregate(pipeline):
            if row["_id"] == "sent":
                sent = row["count"]
            elif row["_id"] == "failed":
                failed = row["count"]
        return {"sent": sent, "failed": failed, "total": sent + failed}

    today = await _bucket(today_start)
    this_week = await _bucket(week_start)
    this_month = await _bucket(month_start)

    # Breakdown by type — rolling 30 days
    by_type: dict = {}
    pipeline = [
        {"$match": {"created_at": {"$gte": _utc_iso(month_start)}}},
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
    ]
    async for row in db.email_logs.aggregate(pipeline):
        by_type[row["_id"] or "other"] = row["count"]

    # Recent — top 20 by created_at desc
    recent_cursor = db.email_logs.find(
        {},
        {"_id": 0, "id": 1, "type": 1, "recipient": 1, "subject": 1,
         "status": 1, "error": 1, "bill_id": 1, "created_at": 1},
    ).sort("created_at", -1).limit(20)
    recent = await recent_cursor.to_list(20)

    # ─── Calendar-month quota block ───
    qcfg = await _quota_settings()
    cal_start = _calendar_month_start(now)
    cal_end = _next_calendar_month_start(now)
    used = await _calendar_month_count(cal_start, cal_end)
    limit = qcfg["limit"]
    threshold = qcfg["threshold"]
    used_pct = (used / limit) if limit > 0 else 0.0
    quota = {
        "limit": limit,
        "used": used,
        "remaining": max(0, limit - used),
        "used_pct": round(used_pct * 100, 1),
        "threshold_pct": round(threshold * 100, 1),
        "warning": limit > 0 and used_pct >= threshold and used_pct < 1.0,
        "exceeded": limit > 0 and used_pct >= 1.0,
        "period_start": _utc_iso(cal_start),
        "period_end": _utc_iso(cal_end),
    }

    return {
        "today": today,
        "this_week": this_week,
        "this_month": this_month,
        "by_type": by_type,
        "recent": recent,
        "quota": quota,
    }


@router.put("/email-logs/quota")
async def update_email_quota(
    payload: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """Update the monthly email quota and alert threshold.
    Body: { "limit": int >= 0, "threshold_pct": int 10..100 }.
    Admin level 100 only."""
    await _require_level_100(user)

    update: dict = {}
    if "limit" in payload:
        try:
            limit = int(payload["limit"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="limit debe ser un entero")
        if limit < 0:
            raise HTTPException(status_code=400, detail="limit no puede ser negativo")
        update["email_monthly_quota"] = limit
    if "threshold_pct" in payload:
        try:
            tp = int(payload["threshold_pct"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="threshold_pct debe ser un entero")
        if tp < 10 or tp > 100:
            raise HTTPException(status_code=400, detail="threshold_pct debe estar entre 10 y 100")
        update["email_quota_alert_threshold"] = round(tp / 100.0, 4)

    if not update:
        raise HTTPException(status_code=400, detail="Nada que actualizar")

    await db.system_config.update_one({"id": "main"}, {"$set": update}, upsert=True)
    qcfg = await _quota_settings()
    return {
        "ok": True,
        "limit": qcfg["limit"],
        "threshold_pct": round(qcfg["threshold"] * 100, 1),
    }


@router.get("/email-logs")
async def list_email_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    type: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Paginated list of email logs with optional filters. Admin level 100 only."""
    await _require_level_100(user)

    q: dict = {}
    if type:
        q["type"] = type
    if status:
        q["status"] = status
    if date_from or date_to:
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from if "T" in date_from else f"{date_from}T00:00:00+00:00"
        if date_to:
            # Use exclusive upper bound on the next day to include sub-second
            # precision (e.g. 23:59:59.987654 should still match 'date_to=YYYY-MM-DD').
            if "T" in date_to:
                rng["$lte"] = date_to
            else:
                try:
                    end_day = datetime.fromisoformat(f"{date_to}T00:00:00+00:00") + timedelta(days=1)
                    rng["$lt"] = _utc_iso(end_day)
                except ValueError:
                    rng["$lte"] = f"{date_to}T23:59:59+00:00"
        q["created_at"] = rng

    skip = (page - 1) * limit
    total = await db.email_logs.count_documents(q)

    cursor = db.email_logs.find(
        q,
        {"_id": 0, "id": 1, "type": 1, "recipient": 1, "subject": 1,
         "status": 1, "error": 1, "bill_id": 1, "created_at": 1},
    ).sort("created_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(limit)

    return {
        "page": page,
        "limit": limit,
        "total": total,
        "pages": (total + limit - 1) // limit if limit else 0,
        "items": items,
    }
