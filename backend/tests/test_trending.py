"""Backend tests for the Trending (Lo Más Pedido) feature.

Covers:
- GET /api/products/trending defaults (enabled=False, products=[])
- PUT /api/system/config persists trending_config under {id:'main'}
- POST /api/products/trending/invalidate clears cache
- GET trending with period=month returns sorted products with times_sold
- excluded_categories filters out specified categories
- max_items sanitization (3..20)
- Cache works (two reads identical) and invalidation refreshes
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback to backend public URL configured in frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1]
                break
BASE_URL = BASE_URL.rstrip("/")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

# Try to read backend env for accurate DB
try:
    with open("/app/backend/.env") as f:
        for line in f:
            if line.startswith("MONGO_URL="):
                MONGO_URL = line.strip().split("=", 1)[1].strip('"').strip("'")
            elif line.startswith("DB_NAME="):
                DB_NAME = line.strip().split("=", 1)[1].strip('"').strip("'")
except FileNotFoundError:
    pass


@pytest.fixture(scope="session")
def mongo_db():
    cli = MongoClient(MONGO_URL)
    return cli[DB_NAME]


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "11338585"}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ──────────────────────── Health ────────────────────────

def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200, r.text


# ─────────────── Defaults (enabled=False, no products) ───────────────

def test_trending_disabled_returns_empty(mongo_db, auth_headers):
    # Ensure trending is disabled in config
    mongo_db.system_config.update_one(
        {"id": "main"},
        {"$set": {"trending_config": {
            "enabled": False, "name": "Lo más pedido hoy", "icon": "⭐",
            "period": "today", "max_items": 10, "excluded_categories": []
        }}},
        upsert=True,
    )
    r = requests.get(f"{BASE_URL}/api/products/trending", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["enabled"] is False
    assert data["products"] == []
    assert "name" in data and "icon" in data and "period" in data and "max_items" in data


# ─────── PUT /api/system/config persists trending_config under id:main ───────

def test_put_system_config_persists_trending_config(mongo_db, auth_headers):
    payload = {
        "trending_config": {
            "enabled": True,
            "name": "TEST_Top vendidos",
            "icon": "🔥",
            "period": "month",
            "max_items": 8,
            "excluded_categories": [],
        }
    }
    r = requests.put(f"{BASE_URL}/api/system/config", json=payload, headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text

    # Verify persisted under {id: "main"}
    main_docs = list(mongo_db.system_config.find({"id": "main"}))
    assert len(main_docs) == 1, f"Expected exactly 1 doc with id=main, got {len(main_docs)}"
    doc = main_docs[0]
    assert "trending_config" in doc
    assert doc["trending_config"]["name"] == "TEST_Top vendidos"
    assert doc["trending_config"]["icon"] == "🔥"
    assert doc["trending_config"]["period"] == "month"
    assert doc["trending_config"]["max_items"] == 8

    # Verify no mixing with other id docs (no extra docs created with these keys)
    bad_docs = list(mongo_db.system_config.find({
        "id": {"$ne": "main"},
        "trending_config": {"$exists": True},
    }))
    assert bad_docs == [], f"trending_config leaked into non-main docs: {bad_docs}"


# ─────── POST /invalidate ───────

def test_invalidate_endpoint(auth_headers):
    r = requests.post(f"{BASE_URL}/api/products/trending/invalidate", headers=auth_headers, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}


# ─────── Period=month with seeded data ───────

@pytest.fixture
def seeded_bills(mongo_db):
    """Seed 2 products + 1 bill to guarantee aggregation results."""
    cat_a = f"TEST_cat_a_{uuid.uuid4().hex[:6]}"
    cat_b = f"TEST_cat_b_{uuid.uuid4().hex[:6]}"
    pid_top = f"TEST_p_top_{uuid.uuid4().hex[:6]}"
    pid_low = f"TEST_p_low_{uuid.uuid4().hex[:6]}"

    mongo_db.products.insert_many([
        {"id": pid_top, "name": "TEST_TopProd", "active": True, "category_id": cat_a, "price": 100},
        {"id": pid_low, "name": "TEST_LowProd", "active": True, "category_id": cat_b, "price": 50},
    ])

    from datetime import datetime, timezone, timedelta
    paid_at = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    bill_id = f"TEST_bill_{uuid.uuid4().hex[:6]}"
    mongo_db.bills.insert_one({
        "id": bill_id,
        "status": "paid",
        "paid_at": paid_at,
        "items": [
            {"product_id": pid_top, "quantity": 7, "product_name": "TEST_TopProd", "is_open_item": False},
            {"product_id": pid_low, "quantity": 2, "product_name": "TEST_LowProd", "is_open_item": False},
            {"product_id": None, "quantity": 1, "product_name": "Open item", "is_open_item": True},
        ],
    })

    yield {"pid_top": pid_top, "pid_low": pid_low, "cat_a": cat_a, "cat_b": cat_b, "bill_id": bill_id}

    # Cleanup
    mongo_db.products.delete_many({"id": {"$in": [pid_top, pid_low]}})
    mongo_db.bills.delete_many({"id": bill_id})


def _set_trending_config(mongo_db, **overrides):
    cfg = {
        "enabled": True, "name": "TEST", "icon": "⭐",
        "period": "month", "max_items": 10, "excluded_categories": [],
    }
    cfg.update(overrides)
    mongo_db.system_config.update_one(
        {"id": "main"}, {"$set": {"trending_config": cfg}}, upsert=True
    )


def _invalidate(headers):
    requests.post(f"{BASE_URL}/api/products/trending/invalidate", headers=headers, timeout=15)


def test_trending_month_returns_sorted_products(mongo_db, auth_headers, seeded_bills):
    _set_trending_config(mongo_db, period="month", max_items=10, excluded_categories=[])
    _invalidate(auth_headers)

    r = requests.get(f"{BASE_URL}/api/products/trending", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["enabled"] is True

    ids = [p["id"] for p in data["products"]]
    assert seeded_bills["pid_top"] in ids, f"Top product missing: {ids}"
    assert seeded_bills["pid_low"] in ids, f"Low product missing: {ids}"
    # Top product comes before low (sorted DESC by times_sold)
    assert ids.index(seeded_bills["pid_top"]) < ids.index(seeded_bills["pid_low"])

    top = next(p for p in data["products"] if p["id"] == seeded_bills["pid_top"])
    low = next(p for p in data["products"] if p["id"] == seeded_bills["pid_low"])
    assert top["times_sold"] == 7
    assert low["times_sold"] == 2


def test_excluded_categories_filter(mongo_db, auth_headers, seeded_bills):
    _set_trending_config(
        mongo_db, period="month", max_items=10,
        excluded_categories=[seeded_bills["cat_a"]],
    )
    _invalidate(auth_headers)

    r = requests.get(f"{BASE_URL}/api/products/trending", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text
    ids = [p["id"] for p in r.json()["products"]]
    assert seeded_bills["pid_top"] not in ids, "Excluded category product leaked through"
    assert seeded_bills["pid_low"] in ids


def test_max_items_sanitization(mongo_db, auth_headers):
    # max_items=999 should be clamped to 20
    _set_trending_config(mongo_db, max_items=999)
    _invalidate(auth_headers)
    r = requests.get(f"{BASE_URL}/api/products/trending", headers=auth_headers, timeout=20)
    assert r.status_code == 200
    assert r.json()["max_items"] == 20

    # max_items=1 should be clamped to 3
    _set_trending_config(mongo_db, max_items=1)
    _invalidate(auth_headers)
    r = requests.get(f"{BASE_URL}/api/products/trending", headers=auth_headers, timeout=20)
    assert r.status_code == 200
    assert r.json()["max_items"] == 3


def test_cache_consistency_and_invalidation(mongo_db, auth_headers, seeded_bills):
    _set_trending_config(mongo_db, period="month", max_items=10, excluded_categories=[])
    _invalidate(auth_headers)

    r1 = requests.get(f"{BASE_URL}/api/products/trending", headers=auth_headers, timeout=20).json()
    r2 = requests.get(f"{BASE_URL}/api/products/trending", headers=auth_headers, timeout=20).json()
    # Same products order
    assert [p["id"] for p in r1["products"]] == [p["id"] for p in r2["products"]]

    # Modify db (delete the top bill) without invalidating cache → should still match cached
    mongo_db.bills.delete_many({"id": seeded_bills["bill_id"]})
    r3 = requests.get(f"{BASE_URL}/api/products/trending", headers=auth_headers, timeout=20).json()
    assert [p["id"] for p in r3["products"]] == [p["id"] for p in r1["products"]], \
        "Cache was bypassed before invalidation"

    # Invalidate → fresh data (now empty since bill deleted)
    _invalidate(auth_headers)
    r4 = requests.get(f"{BASE_URL}/api/products/trending", headers=auth_headers, timeout=20).json()
    assert seeded_bills["pid_top"] not in [p["id"] for p in r4["products"]]


# ─── Cleanup test config to avoid polluting environment ───
def test_zz_cleanup_restore_disabled(mongo_db, auth_headers):
    mongo_db.system_config.update_one(
        {"id": "main"},
        {"$set": {"trending_config": {
            "enabled": False, "name": "Lo más pedido hoy", "icon": "⭐",
            "period": "today", "max_items": 10, "excluded_categories": []
        }}},
        upsert=True,
    )
    _invalidate(auth_headers)
