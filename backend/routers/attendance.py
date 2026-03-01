# Attendance / Time Clock Router
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
import uuid

router = APIRouter(tags=["attendance"])

db = None

def set_db(database):
    global db
    db = database

def gen_id() -> str:
    return str(uuid.uuid4())

def now_local():
    """Get current local time (DR timezone UTC-4)"""
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("America/Santo_Domingo"))

class PinInput(BaseModel):
    pin: str


@router.post("/attendance/clock-in")
async def clock_in(input: PinInput):
    """Register employee clock-in. Does NOT start a POS session."""
    from routers.auth import hash_pin
    
    pin_hash = hash_pin(input.pin)
    user = await db.users.find_one({"pin_hash": pin_hash, "active": True}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="PIN incorrecto o usuario inactivo")
    
    user_id = user["id"]
    today = now_local().strftime("%Y-%m-%d")
    
    # Check if already clocked in (has ACTIVE record today)
    existing = await db.attendance.find_one(
        {"user_id": user_id, "date": today, "status": "ACTIVE"},
        {"_id": 0}
    )
    if existing:
        clock_in_time = existing.get("clock_in_display", existing.get("clock_in", ""))
        raise HTTPException(status_code=400, detail=f"Ya tienes una entrada registrada hoy a las {clock_in_time}. Debes marcar salida primero.")
    
    local_now = now_local()
    
    # Get time format preference
    config = await db.system_config.find_one({}, {"_id": 0, "time_format": 1}) or {}
    is_12h = config.get("time_format", "12h") == "12h"
    display_time = local_now.strftime("%I:%M %p" if is_12h else "%H:%M")
    
    record = {
        "id": gen_id(),
        "user_id": user_id,
        "user_name": user["name"],
        "role": user.get("role", ""),
        "date": today,
        "clock_in": local_now.isoformat(),
        "clock_in_display": display_time,
        "clock_out": None,
        "clock_out_display": None,
        "hours_worked": None,
        "status": "ACTIVE",
    }
    await db.attendance.insert_one(record)
    
    return {
        "ok": True,
        "action": "clock_in",
        "user_name": user["name"],
        "time": display_time,
        "message": f"Entrada registrada! Bienvenido, {user['name']}. Hora: {display_time}"
    }


@router.post("/attendance/clock-out")
async def clock_out(input: PinInput):
    """Register employee clock-out."""
    from routers.auth import hash_pin
    
    pin_hash = hash_pin(input.pin)
    user = await db.users.find_one({"pin_hash": pin_hash, "active": True}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="PIN incorrecto o usuario inactivo")
    
    user_id = user["id"]
    today = now_local().strftime("%Y-%m-%d")
    
    # Find active clock-in record
    existing = await db.attendance.find_one(
        {"user_id": user_id, "status": "ACTIVE"},
        {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=400, detail="No tienes una entrada registrada. Debes marcar entrada primero.")
    
    local_now = now_local()
    config = await db.system_config.find_one({}, {"_id": 0, "time_format": 1}) or {}
    is_12h = config.get("time_format", "12h") == "12h"
    display_time = local_now.strftime("%I:%M %p" if is_12h else "%H:%M")
    
    # Calculate hours worked
    try:
        clock_in_dt = datetime.fromisoformat(existing["clock_in"])
        diff = local_now - clock_in_dt.replace(tzinfo=local_now.tzinfo) if clock_in_dt.tzinfo is None else local_now - clock_in_dt
        hours = round(diff.total_seconds() / 3600, 2)
    except:
        hours = 0
    
    hours_display = f"{int(hours)}h {int((hours % 1) * 60)}m"
    
    await db.attendance.update_one(
        {"id": existing["id"]},
        {"$set": {
            "clock_out": local_now.isoformat(),
            "clock_out_display": display_time,
            "hours_worked": hours,
            "hours_display": hours_display,
            "status": "COMPLETED",
        }}
    )
    
    return {
        "ok": True,
        "action": "clock_out",
        "user_name": user["name"],
        "time": display_time,
        "hours_worked": hours,
        "hours_display": hours_display,
        "clock_in_time": existing.get("clock_in_display", ""),
        "message": f"Salida registrada! Hasta luego, {user['name']}. Hora: {display_time}. Trabajaste: {hours_display}"
    }


@router.get("/attendance/today")
async def get_today_attendance():
    """Get all attendance records for today"""
    today = now_local().strftime("%Y-%m-%d")
    records = await db.attendance.find({"date": today}, {"_id": 0}).sort("clock_in", -1).to_list(100)
    return records


@router.get("/attendance/report")
async def attendance_report(start: str = None, end: str = None, user_id: str = None):
    """Get attendance records for date range"""
    local_now = now_local()
    if not start:
        start = (local_now - timedelta(days=7)).strftime("%Y-%m-%d")
    if not end:
        end = local_now.strftime("%Y-%m-%d")
    
    query = {"date": {"$gte": start, "$lte": end}}
    if user_id:
        query["user_id"] = user_id
    
    records = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    
    # Summary by user
    user_summary = {}
    for r in records:
        uid = r["user_id"]
        if uid not in user_summary:
            user_summary[uid] = {"user_name": r["user_name"], "role": r.get("role", ""), "total_hours": 0, "days_worked": 0}
        if r.get("hours_worked"):
            user_summary[uid]["total_hours"] += r["hours_worked"]
        if r["status"] == "COMPLETED":
            user_summary[uid]["days_worked"] += 1
    
    summary = sorted(user_summary.values(), key=lambda x: x["total_hours"], reverse=True)
    for s in summary:
        h = s["total_hours"]
        s["total_hours_display"] = f"{int(h)}h {int((h % 1) * 60)}m"
    
    return {"records": records, "summary": summary, "start": start, "end": end}
