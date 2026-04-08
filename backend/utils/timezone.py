"""
Centralized timezone management for the POS system.
Reads the configured timezone from system_config in MongoDB.
All "now" evaluations MUST use these utilities instead of raw datetime.now().
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from motor.motor_asyncio import AsyncIOMotorClient
import os

# Default timezone for Dominican Republic
DEFAULT_TIMEZONE = "America/Santo_Domingo"

# In-memory cache to avoid hitting DB on every call
_cached_tz_name: str | None = None

# Database connection (shared with the rest of the app)
_mongo_url = os.environ.get('MONGO_URL')
_client = AsyncIOMotorClient(_mongo_url)
_db = _client[os.environ.get('DB_NAME', 'pos_db')]


async def get_system_timezone_name() -> str:
    """Get the configured timezone name from system_config, with in-memory cache."""
    global _cached_tz_name
    if _cached_tz_name is not None:
        return _cached_tz_name

    doc = await _db.system_config.find_one({"id": "timezone"}, {"_id": 0})
    tz_name = doc.get("timezone", DEFAULT_TIMEZONE) if doc else DEFAULT_TIMEZONE
    _cached_tz_name = tz_name
    return tz_name


def invalidate_cache():
    """Call this when timezone config is updated via API."""
    global _cached_tz_name
    _cached_tz_name = None


async def get_system_tz() -> ZoneInfo:
    """Get the configured ZoneInfo object."""
    tz_name = await get_system_timezone_name()
    return ZoneInfo(tz_name)


async def get_system_now() -> datetime:
    """Get the current datetime in the configured system timezone.
    Returns a timezone-aware datetime."""
    tz = await get_system_tz()
    return datetime.now(tz)


async def get_local_today_utc_range() -> tuple[str, str]:
    """Get UTC start/end ISO boundaries for the current local day
    in the configured system timezone.
    Returns (start_str, end_str) for range-based filtering of UTC timestamps."""
    tz = await get_system_tz()
    local_now = datetime.now(tz)
    local_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = local_midnight.astimezone(timezone.utc)
    end = (local_midnight + timedelta(days=1)).astimezone(timezone.utc)
    return start.strftime("%Y-%m-%dT%H:%M:%S"), end.strftime("%Y-%m-%dT%H:%M:%S")


async def utc_hour_to_local(utc_hour: int) -> int:
    """Convert a UTC hour (0-23) to the local hour in the configured timezone.
    Uses today's date for DST accuracy."""
    tz = await get_system_tz()
    # Build a UTC datetime for today at the given hour
    utc_now = datetime.now(timezone.utc)
    utc_dt = utc_now.replace(hour=utc_hour, minute=0, second=0, microsecond=0)
    local_dt = utc_dt.astimezone(tz)
    return local_dt.hour


# ═══════════════════════════════════════════════════════════════════════════════
# 🔒 DO NOT MODIFY - PERMANENT BUSINESS DATE RULE
# ═══════════════════════════════════════════════════════════════════════════════
# 
# JORNADA DATE (fiscal/business date):
# - ALWAYS taken from active business_day document in MongoDB
# - NEVER from system clock or datetime.now()
# - Used for: ALL reports, ALL filters, ALL groupings, ALL audit logs,
#   ALL dashboard numbers, ALL shift reports, inventory movements
#
# PRINT TIMESTAMP (clock time):
# - ALWAYS the real system clock time
# - Used ONLY for: printed documents (facturas, comandas, receipts)
#
# These are TWO SEPARATE concepts that must NEVER be mixed or confused.
# If a future fix seems to require changing this logic — STOP and ask 
# the user first before touching anything.
#
# This rule applies to every file, module, and future feature FOREVER.
# ═══════════════════════════════════════════════════════════════════════════════

async def get_jornada_date() -> str:
    """
    🔒 DO NOT MODIFY - Business date rule
    
    Get the active jornada's business_date for grouping and filtering.
    
    This is the FISCAL date that all transactions, reports, and events
    should be associated with - NOT the calendar date.
    
    Returns:
        str: The business_date in YYYY-MM-DD format
             - If jornada is open: returns that jornada's business_date
             - If no jornada: returns today's date in local timezone (fallback)
    """
    # DO NOT MODIFY - Business date rule: ALWAYS get from business_day document
    active_day = await _db.business_days.find_one(
        {"status": "open"}, 
        {"_id": 0, "business_date": 1}
    )
    
    if active_day and active_day.get("business_date"):
        return active_day["business_date"]
    
    # Fallback: use local timezone date (no jornada open)
    tz = await get_system_tz()
    return datetime.now(tz).strftime("%Y-%m-%d")


async def get_jornada_date_with_fallback(db=None) -> str:
    """
    🔒 DO NOT MODIFY - Business date rule
    
    Same as get_jornada_date but accepts an optional db parameter
    for use in routers that have their own db connection.
    
    Args:
        db: Optional database connection. If None, uses the module's connection.
    
    Returns:
        str: The business_date in YYYY-MM-DD format
    """
    # DO NOT MODIFY - Business date rule: ALWAYS get from business_day document
    database = db if db is not None else _db
    
    active_day = await database.business_days.find_one(
        {"status": "open"}, 
        {"_id": 0, "business_date": 1}
    )
    
    if active_day and active_day.get("business_date"):
        return active_day["business_date"]
    
    tz = await get_system_tz()
    return datetime.now(tz).strftime("%Y-%m-%d")
