"""
Trending Products Router

Provides a virtual "Most Ordered" category for the POS that automatically
surfaces top-selling products based on real sales aggregated from `bills`.

Configuration is stored in `system_config` under {id: "main"}.trending_config.
Results are cached in-memory for 5 minutes per (period, exclusions) key.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends

from routers.auth import get_current_user

router = APIRouter(tags=["trending"])

db = None


def set_db(database):
    global db
    db = database


# ─── DEFAULTS ───

DEFAULT_TRENDING_CONFIG = {
    "enabled": False,
    "name": "Lo más pedido hoy",
    "icon": "⭐",
    "period": "today",  # today | 24h | week | month
    "max_items": 10,
    "excluded_categories": [],
}

VALID_PERIODS = ("today", "24h", "week", "month")
ALLOWED_ICONS = ("⭐", "🔥", "📈", "💫", "🏆")


# ─── IN-MEMORY CACHE ───
# {cache_key: (expires_at_utc, payload)}
_cache: dict = {}
_CACHE_TTL_SECONDS = 5 * 60


def _cache_get(key: str):
    entry = _cache.get(key)
    if not entry:
        return None
    expires_at, payload = entry
    if datetime.now(timezone.utc) >= expires_at:
        _cache.pop(key, None)
        return None
    return payload


def _cache_set(key: str, payload):
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=_CACHE_TTL_SECONDS)
    _cache[key] = (expires_at, payload)


def invalidate_trending_cache():
    """Public hook used when a business day closes / opens."""
    _cache.clear()


# ─── HELPERS ───

async def _get_trending_config() -> dict:
    """Read trending_config merged with safe defaults."""
    cfg_doc = await db.system_config.find_one({"id": "main"}, {"_id": 0, "trending_config": 1}) or {}
    user_cfg = cfg_doc.get("trending_config") or {}
    merged = {**DEFAULT_TRENDING_CONFIG, **user_cfg}
    # Sanitize
    if merged["period"] not in VALID_PERIODS:
        merged["period"] = "today"
    try:
        merged["max_items"] = max(3, min(20, int(merged["max_items"])))
    except (ValueError, TypeError):
        merged["max_items"] = 10
    if not isinstance(merged["excluded_categories"], list):
        merged["excluded_categories"] = []
    return merged


async def _get_period_filter(period: str) -> dict:
    """
    Build a MongoDB filter that matches bills in the requested period.

    - today  → bills with business_date == current open business day
               (or system local date if no day open)
    - 24h    → paid_at >= now - 24h
    - week   → paid_at >= now - 7d
    - month  → paid_at >= now - 30d
    """
    now = datetime.now(timezone.utc)
    if period == "today":
        # Prefer the open business day to align with the POS fiscal day.
        bd = await db.business_days.find_one({"status": "open"}, {"_id": 0, "business_date": 1})
        if bd and bd.get("business_date"):
            return {"business_date": bd["business_date"]}
        # Fallback: compare against today's UTC date (paid_at is iso UTC).
        today_iso = now.strftime("%Y-%m-%d")
        return {"business_date": today_iso}

    delta_map = {"24h": 1, "week": 7, "month": 30}
    days = delta_map.get(period, 1)
    cutoff_iso = (now - timedelta(days=days)).isoformat()
    return {"paid_at": {"$gte": cutoff_iso}}


async def _aggregate_top_products(match_filter: dict, max_items: int, excluded_categories: list[str]) -> list[dict]:
    """Aggregate sold quantities per product_id within the given match filter."""
    pipeline: list[dict] = [
        {"$match": {**match_filter, "status": {"$in": ["paid", "final", "closed"]}}},
        {"$unwind": "$items"},
        {"$match": {"items.is_open_item": {"$ne": True}, "items.product_id": {"$ne": None}}},
        {
            "$group": {
                "_id": "$items.product_id",
                "times_sold": {"$sum": "$items.quantity"},
            }
        },
        {"$sort": {"times_sold": -1}},
        # Pull a generous slice; we'll trim after filtering excluded categories.
        {"$limit": max(max_items * 3, max_items + 10)},
    ]
    rows = await db.bills.aggregate(pipeline).to_list(200)
    if not rows:
        return []

    pids = [r["_id"] for r in rows]
    products_cursor = db.products.find(
        {"id": {"$in": pids}, "active": True},
        {"_id": 0},
    )
    products_by_id = {p["id"]: p async for p in products_cursor}

    excluded = set(excluded_categories or [])
    results: list[dict] = []
    for r in rows:
        pid = r["_id"]
        prod = products_by_id.get(pid)
        if not prod:
            continue
        if prod.get("category_id") in excluded:
            continue
        prod_out = {**prod, "times_sold": int(r["times_sold"])}
        results.append(prod_out)
        if len(results) >= max_items:
            break
    return results


# ─── ENDPOINTS ───

@router.get("/products/trending")
async def get_trending_products(user=Depends(get_current_user)):
    """Return the dynamic 'most ordered' virtual category.

    Response:
        {
          enabled: bool,
          name: str,
          icon: str,
          period: str,
          max_items: int,
          products: [ {...product, times_sold: int} ]
        }

    When enabled is False or no products match, `products` is an empty list.
    """
    cfg = await _get_trending_config()

    if not cfg["enabled"]:
        return {
            "enabled": False,
            "name": cfg["name"],
            "icon": cfg["icon"],
            "period": cfg["period"],
            "max_items": cfg["max_items"],
            "products": [],
        }

    cache_key = f"{cfg['period']}|{cfg['max_items']}|{','.join(sorted(cfg['excluded_categories']))}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return {**cached, "name": cfg["name"], "icon": cfg["icon"]}

    match_filter = await _get_period_filter(cfg["period"])
    products = await _aggregate_top_products(match_filter, cfg["max_items"], cfg["excluded_categories"])

    payload = {
        "enabled": True,
        "name": cfg["name"],
        "icon": cfg["icon"],
        "period": cfg["period"],
        "max_items": cfg["max_items"],
        "products": products,
    }
    _cache_set(cache_key, payload)
    return payload


@router.post("/products/trending/invalidate")
async def invalidate_trending(user=Depends(get_current_user)):
    """Force-clear the trending cache. Used after manual config changes or day close."""
    invalidate_trending_cache()
    return {"ok": True}
