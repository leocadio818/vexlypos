"""Backend tests for the EMAIL MONTHLY QUOTA ALERT enhancement.

Tests:
  - GET /api/email-logs/stats now returns a `quota` block with full shape.
  - PUT /api/email-logs/quota: 1000/80 -> warning=false, exceeded=false.
  - PUT /api/email-logs/quota: 60/80   -> warning=true, exceeded=false.
  - PUT /api/email-logs/quota: 30/80   -> exceeded=true.
  - Validation: limit<0 -> 400; threshold_pct<10 -> 400; empty body -> 400; unauth -> 401/403.
  - RBAC: cashier (level<100) -> 403 with the expected Spanish message.
  - Idempotency: GET reflects PUT; system_config:main holds the new fields.
  - Date filter inclusive of last instant of date_to (insert at 23:59:59.987 -> included).
"""
import os
import sys
import asyncio
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factura-consumo-app.preview.emergentagent.com").rstrip("/")
# Load MONGO_URL/DB_NAME from backend/.env when running pytest from /app
if not os.environ.get("MONGO_URL"):
    try:
        with open("/app/backend/.env") as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and "=" in _line and not _line.startswith("#"):
                    _k, _v = _line.split("=", 1)
                    os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))
    except Exception:
        pass
ADMIN_PIN = "11338585"

sys.path.insert(0, "/app/backend")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_headers(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    body = r.json()
    token = body.get("access_token") or body.get("token")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(autouse=False)
def reset_quota_after(api, admin_headers):
    """Resets quota to {1000, 80} after each test that uses this fixture."""
    yield
    api.put(
        f"{BASE_URL}/api/email-logs/quota",
        json={"limit": 1000, "threshold_pct": 80},
        headers=admin_headers,
    )


def _get_stats(api, admin_headers) -> dict:
    r = api.get(f"{BASE_URL}/api/email-logs/stats", headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- Quota shape ----------------
class TestQuotaShape:
    def test_quota_block_present_and_shape(self, api, admin_headers):
        data = _get_stats(api, admin_headers)
        assert "quota" in data, "stats must contain a 'quota' block"
        q = data["quota"]
        for k in ("limit", "used", "remaining", "used_pct", "threshold_pct",
                  "warning", "exceeded", "period_start", "period_end"):
            assert k in q, f"missing quota.{k}"
        assert isinstance(q["limit"], int)
        assert isinstance(q["used"], int)
        assert isinstance(q["remaining"], int)
        assert isinstance(q["used_pct"], (int, float))
        assert isinstance(q["threshold_pct"], (int, float))
        assert isinstance(q["warning"], bool)
        assert isinstance(q["exceeded"], bool)
        # period_start = first instant of current calendar month UTC
        now = datetime.now(timezone.utc)
        ps = datetime.fromisoformat(q["period_start"])
        pe = datetime.fromisoformat(q["period_end"])
        assert ps.year == now.year and ps.month == now.month and ps.day == 1
        assert ps.hour == 0 and ps.minute == 0 and ps.second == 0
        # period_end = first day of next calendar month
        if now.month == 12:
            assert pe.year == now.year + 1 and pe.month == 1
        else:
            assert pe.year == now.year and pe.month == now.month + 1
        assert pe.day == 1


# ---------------- PUT scenarios ----------------
class TestQuotaPutScenarios:
    def test_quota_1000_80_green(self, api, admin_headers, reset_quota_after):
        r = api.put(
            f"{BASE_URL}/api/email-logs/quota",
            json={"limit": 1000, "threshold_pct": 80},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["limit"] == 1000
        assert int(round(body["threshold_pct"])) == 80

        q = _get_stats(api, admin_headers)["quota"]
        assert q["limit"] == 1000
        assert q["threshold_pct"] == 80.0
        assert q["warning"] is False
        assert q["exceeded"] is False
        # used should be small (~50 from QA-SEED) and used_pct < 80
        assert q["used"] >= 0
        assert q["used_pct"] < 80.0

    def test_quota_60_80_warning(self, api, admin_headers, reset_quota_after):
        r = api.put(
            f"{BASE_URL}/api/email-logs/quota",
            json={"limit": 60, "threshold_pct": 80},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        q = _get_stats(api, admin_headers)["quota"]
        assert q["limit"] == 60
        # If used >= 60 we'd hit exceeded — assume seeded ~50, expect warning
        if q["used"] < q["limit"]:
            assert q["warning"] is True, q
            assert q["exceeded"] is False, q
            assert q["used_pct"] >= 80.0
            assert q["used_pct"] < 100.0
        else:
            # Edge: more rows present than 60 → exceeded path
            assert q["exceeded"] is True

    def test_quota_30_80_exceeded(self, api, admin_headers, reset_quota_after):
        r = api.put(
            f"{BASE_URL}/api/email-logs/quota",
            json={"limit": 30, "threshold_pct": 80},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        q = _get_stats(api, admin_headers)["quota"]
        assert q["limit"] == 30
        assert q["exceeded"] is True, q
        assert q["warning"] is False, q
        assert q["used_pct"] >= 100.0
        assert q["remaining"] == 0


# ---------------- Validation ----------------
class TestQuotaValidation:
    def test_limit_negative_400(self, api, admin_headers, reset_quota_after):
        r = api.put(
            f"{BASE_URL}/api/email-logs/quota",
            json={"limit": -5, "threshold_pct": 80},
            headers=admin_headers,
        )
        assert r.status_code == 400, r.text
        assert "negativo" in r.json().get("detail", "").lower()

    def test_threshold_too_low_400(self, api, admin_headers, reset_quota_after):
        r = api.put(
            f"{BASE_URL}/api/email-logs/quota",
            json={"limit": 1000, "threshold_pct": 5},
            headers=admin_headers,
        )
        assert r.status_code == 400, r.text
        assert "10" in r.json().get("detail", "")

    def test_empty_body_400(self, api, admin_headers, reset_quota_after):
        r = api.put(
            f"{BASE_URL}/api/email-logs/quota",
            json={},
            headers=admin_headers,
        )
        assert r.status_code == 400, r.text
        assert "actualizar" in r.json().get("detail", "").lower()

    def test_unauth_401_or_403(self, api):
        r = api.put(
            f"{BASE_URL}/api/email-logs/quota",
            json={"limit": 1000, "threshold_pct": 80},
        )
        assert r.status_code in (401, 403), r.status_code


# ---------------- RBAC ----------------
class TestQuotaRBAC:
    @pytest.fixture(scope="class")
    def temp_cashier(self, api, admin_headers):
        unique_pin = "9921"
        payload = {"name": "QA_QUOTA_CASHIER", "role": "cashier", "pin": unique_pin}
        r = api.post(f"{BASE_URL}/api/users", json=payload, headers=admin_headers)
        if r.status_code == 409:
            unique_pin = "9922"
            payload["pin"] = unique_pin
            r = api.post(f"{BASE_URL}/api/users", json=payload, headers=admin_headers)
        if r.status_code != 200:
            pytest.skip(f"Could not create cashier: {r.status_code} {r.text[:200]}")
        body = r.json()
        user_id = body.get("id") or body.get("user_id") or body.get("user", {}).get("id")
        login = api.post(f"{BASE_URL}/api/auth/login", json={"pin": unique_pin})
        if login.status_code != 200:
            if user_id:
                api.delete(f"{BASE_URL}/api/users/{user_id}", headers=admin_headers)
            pytest.skip(f"Cashier login failed: {login.status_code}")
        token = login.json().get("access_token") or login.json().get("token")
        yield {"id": user_id, "token": token}
        if user_id:
            api.delete(f"{BASE_URL}/api/users/{user_id}", headers=admin_headers)

    def test_put_quota_forbidden_for_cashier(self, api, temp_cashier):
        h = {"Authorization": f"Bearer {temp_cashier['token']}",
             "Content-Type": "application/json"}
        r = api.put(
            f"{BASE_URL}/api/email-logs/quota",
            json={"limit": 1000, "threshold_pct": 80},
            headers=h,
        )
        assert r.status_code == 403, r.text
        assert "Administrador" in r.json().get("detail", "")


# ---------------- Idempotency / persistence ----------------
class TestQuotaPersistence:
    def test_put_persists_in_system_config(self, api, admin_headers, reset_quota_after):
        # Set a recognisable pair
        api.put(
            f"{BASE_URL}/api/email-logs/quota",
            json={"limit": 777, "threshold_pct": 55},
            headers=admin_headers,
        )

        async def _check():
            from motor.motor_asyncio import AsyncIOMotorClient
            client = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
            db = client[os.environ.get("DB_NAME")]
            cfg = await db.system_config.find_one({"id": "main"}, {"_id": 0})
            client.close()
            return cfg or {}

        cfg = asyncio.run(_check())
        assert cfg.get("email_monthly_quota") == 777
        # Stored as float fraction 0.55
        thr = cfg.get("email_quota_alert_threshold")
        assert thr is not None and abs(float(thr) - 0.55) < 1e-3

        # GET reflects new values immediately
        q = _get_stats(api, admin_headers)["quota"]
        assert q["limit"] == 777
        assert abs(q["threshold_pct"] - 55.0) < 1e-3


# ---------------- date_to inclusive boundary ----------------
class TestDateToBoundary:
    def test_date_to_includes_2359_subseconds(self, api, admin_headers):
        from motor.motor_asyncio import AsyncIOMotorClient
        today_iso = datetime.now(timezone.utc).date().isoformat()
        tag = f"qa-boundary-{uuid.uuid4().hex[:8]}@example.com"
        row_id = str(uuid.uuid4())
        iso = f"{today_iso}T23:59:59.987000+00:00"

        async def _insert():
            client = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
            db = client[os.environ.get("DB_NAME")]
            await db.email_logs.insert_one({
                "id": row_id,
                "type": "invoice",
                "recipient": tag,
                "subject": "QA boundary",
                "status": "sent",
                "created_at": iso,
            })
            client.close()

        async def _cleanup():
            client = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
            db = client[os.environ.get("DB_NAME")]
            await db.email_logs.delete_many({"recipient": tag})
            client.close()

        asyncio.run(_insert())
        try:
            r = api.get(
                f"{BASE_URL}/api/email-logs?date_from={today_iso}&date_to={today_iso}&limit=200",
                headers=admin_headers,
            )
            assert r.status_code == 200, r.text
            ids = [it["id"] for it in r.json()["items"]]
            assert row_id in ids, (
                f"row at 23:59:59.987 of date_to should be included; ids={ids[:5]}..."
            )
        finally:
            asyncio.run(_cleanup())
