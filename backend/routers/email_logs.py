"""
Email Logs router — admin-only consumption dashboard for Resend emails.

Reads from MongoDB collection `email_logs` (populated by services.email_logger).
All endpoints require role_level >= 100 (Administrador del Sistema).
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from routers.auth import get_current_user, get_role_level_async

router = APIRouter()
db = None


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


@router.get("/email-logs/stats")
async def email_logs_stats(user: dict = Depends(get_current_user)):
    """Return per-day / per-week / per-month counters, breakdown by type
    and the 20 most recent emails. Admin level 100 only."""
    await _require_level_100(user)

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)

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

    # Breakdown by type — last 30 days
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

    return {
        "today": today,
        "this_week": this_week,
        "this_month": this_month,
        "by_type": by_type,
        "recent": recent,
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
            rng["$lte"] = date_to if "T" in date_to else f"{date_to}T23:59:59+00:00"
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
