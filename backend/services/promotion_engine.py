"""
Promotion Engine — computes effective prices based on active scheduled promotions.
Handles caching (60s), timezone (America/Santo_Domingo), multiple promotions
(selects best for customer), and discount types (percentage/fixed_amount/fixed_price/2x1).
"""
from datetime import datetime, timedelta
from typing import Optional, List, Dict
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

DR_TZ = ZoneInfo("America/Santo_Domingo")

# In-memory cache: {"data": [...], "expires_at": datetime_utc}
_cache = {"data": None, "expires_at": None}
CACHE_TTL_SECONDS = 30

# Module-level DB reference (set by router)
_db = None


def set_db(database):
    global _db
    _db = database


def _now_dr() -> datetime:
    return datetime.now(DR_TZ)


def _hhmm_to_minutes(hhmm: str) -> int:
    """Convert '16:00' → 960 minutes since midnight."""
    try:
        h, m = hhmm.split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return 0


def _is_promotion_currently_active(promo: dict, now_dr: Optional[datetime] = None) -> bool:
    """Check if a promotion is active RIGHT NOW (DR timezone)."""
    if not promo.get("is_active", False):
        return False
    if now_dr is None:
        now_dr = _now_dr()
    sched = promo.get("schedule") or {}

    # Date range check
    today_str = now_dr.strftime("%Y-%m-%d")
    date_start = sched.get("date_start")
    date_end = sched.get("date_end")
    if date_start and today_str < date_start:
        return False
    if date_end and today_str > date_end:
        return False

    # Day of week check (Python weekday: Mon=0...Sun=6; we use 0=Sun..6=Sat per spec)
    py_weekday = now_dr.weekday()  # Mon=0..Sun=6
    # Convert to our convention: 0=Sun, 1=Mon, ..., 6=Sat
    our_weekday = (py_weekday + 1) % 7
    days = sched.get("days", [])
    if days and our_weekday not in days:
        return False

    # Time range check
    start_time = sched.get("start_time", "00:00")
    end_time = sched.get("end_time", "23:59")
    current_minutes = now_dr.hour * 60 + now_dr.minute
    start_m = _hhmm_to_minutes(start_time)
    end_m = _hhmm_to_minutes(end_time)
    if start_m <= end_m:
        if not (start_m <= current_minutes <= end_m):
            return False
    else:
        # Overnight promotion (e.g. 22:00-02:00)
        if not (current_minutes >= start_m or current_minutes <= end_m):
            return False

    return True


async def get_active_promotions(force_refresh: bool = False) -> List[dict]:
    """Return all promotions currently active (cached 60s)."""
    global _cache
    now_utc = datetime.utcnow()
    if (
        not force_refresh
        and _cache["data"] is not None
        and _cache["expires_at"] is not None
        and now_utc < _cache["expires_at"]
    ):
        return _cache["data"]

    if _db is None:
        return []

    all_promos = await _db.promotions.find({"is_active": True}, {"_id": 0}).to_list(200)
    now_dr = _now_dr()
    active = [p for p in all_promos if _is_promotion_currently_active(p, now_dr)]

    _cache["data"] = active
    _cache["expires_at"] = now_utc + timedelta(seconds=CACHE_TTL_SECONDS)
    return active


def invalidate_cache():
    """Force refresh of active promotions on next read."""
    global _cache
    _cache = {"data": None, "expires_at": None}


def _promotion_applies_to_product(promo: dict, product_id: str, category_id: str, area_id: Optional[str]) -> bool:
    """Check if a promotion applies to a specific product."""
    # Area filter
    area_ids = promo.get("area_ids")
    if area_ids and area_id and area_id not in area_ids:
        return False

    apply_to = promo.get("apply_to", "all")
    if apply_to == "all":
        excluded = promo.get("excluded_product_ids", []) or []
        return product_id not in excluded
    if apply_to == "products":
        return product_id in (promo.get("product_ids", []) or [])
    if apply_to == "category":
        if category_id not in (promo.get("category_ids", []) or []):
            return False
        excluded = promo.get("excluded_product_ids", []) or []
        return product_id not in excluded
    if apply_to == "combos":
        return False  # Combo promos don't apply to individual products
    return False


def _promotion_applies_to_combo(promo: dict, combo_id: str, area_id: Optional[str]) -> bool:
    """Check if a promotion applies to a specific combo."""
    area_ids = promo.get("area_ids")
    if area_ids and area_id and area_id not in area_ids:
        return False
    apply_to = promo.get("apply_to", "all")
    if apply_to == "combos":
        return combo_id in (promo.get("combo_ids", []) or [])
    if apply_to == "all":
        # "all" applies to everything including combos unless combo is excluded
        excluded = promo.get("excluded_combo_ids", []) or []
        return combo_id not in excluded
    return False


def _compute_discount_amount(original_price: float, promo: dict) -> float:
    """Return discount amount (positive number to subtract from original_price)."""
    dtype = promo.get("discount_type")
    value = float(promo.get("discount_value", 0) or 0)
    if dtype == "percentage":
        return round(original_price * value / 100.0, 2)
    if dtype == "fixed_amount":
        return min(value, original_price)
    if dtype == "fixed_price":
        # discount = original - fixed_price (but never negative)
        return max(0.0, original_price - value)
    if dtype == "2x1":
        # Applied per-pair. For single-item pricing, effective price is 50% (avg)
        return round(original_price * 0.5, 2)
    return 0.0


async def get_effective_price(
    product_id: str,
    category_id: str,
    original_price: float,
    area_id: Optional[str] = None,
) -> Dict:
    """Return effective price considering active promotions. Picks best discount (customer-favorable)."""
    active = await get_active_promotions()
    best_promo = None
    best_discount = 0.0
    for promo in active:
        if not _promotion_applies_to_product(promo, product_id, category_id, area_id):
            continue
        d = _compute_discount_amount(original_price, promo)
        if d > best_discount:
            best_discount = d
            best_promo = promo

    if best_promo is None:
        return {
            "original_price": round(original_price, 2),
            "effective_price": round(original_price, 2),
            "has_promotion": False,
            "promotion_name": None,
            "promotion_id": None,
            "discount_type": None,
            "discount_value": None,
            "discount_amount": 0.0,
        }

    return {
        "original_price": round(original_price, 2),
        "effective_price": round(max(0.0, original_price - best_discount), 2),
        "has_promotion": True,
        "promotion_name": best_promo.get("name", ""),
        "promotion_id": best_promo.get("id", ""),
        "discount_type": best_promo.get("discount_type"),
        "discount_value": best_promo.get("discount_value"),
        "discount_amount": round(best_discount, 2),
    }



async def get_effective_combo_price(
    combo_id: str,
    original_price: float,
    area_id: Optional[str] = None,
) -> Dict:
    """Return effective price for a combo considering active promotions. Picks best discount."""
    active = await get_active_promotions()
    best_promo = None
    best_discount = 0.0
    for promo in active:
        if not _promotion_applies_to_combo(promo, combo_id, area_id):
            continue
        d = _compute_discount_amount(original_price, promo)
        if d > best_discount:
            best_discount = d
            best_promo = promo

    if best_promo is None:
        return {
            "original_price": round(original_price, 2),
            "effective_price": round(original_price, 2),
            "has_promotion": False,
            "promotion_name": None,
            "promotion_id": None,
            "discount_type": None,
            "discount_value": None,
            "discount_amount": 0.0,
        }
    return {
        "original_price": round(original_price, 2),
        "effective_price": round(max(0.0, original_price - best_discount), 2),
        "has_promotion": True,
        "promotion_name": best_promo.get("name", ""),
        "promotion_id": best_promo.get("id", ""),
        "discount_type": best_promo.get("discount_type"),
        "discount_value": best_promo.get("discount_value"),
        "discount_amount": round(best_discount, 2),
    }
