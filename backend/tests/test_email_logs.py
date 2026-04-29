"""Backend tests for the EMAIL USAGE COUNTER feature.

Tests:
  - GET /api/email-logs/stats (admin-only level 100)
  - GET /api/email-logs (paginated + filters)
  - 401 when no auth
  - 403 when role_level < 100
  - services.email_logger.log_email helper writes a sanitized row
"""
import os
import sys
import asyncio
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factura-consumo-app.preview.emergentagent.com").rstrip("/")
ADMIN_PIN = "11338585"

# Allow `from services.email_logger import log_email` from the backend root
sys.path.insert(0, "/app/backend")


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    return r.json()["access_token"] if "access_token" in r.json() else r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------------- /api/email-logs/stats ----------------
class TestEmailLogsStats:
    def test_stats_admin_ok_shape(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/email-logs/stats", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("today", "this_week", "this_month", "by_type", "recent"):
            assert k in data, f"missing key {k}"
        for k in ("today", "this_week", "this_month"):
            for sub in ("sent", "failed", "total"):
                assert sub in data[k]
                assert isinstance(data[k][sub], int)
        assert isinstance(data["by_type"], dict)
        assert isinstance(data["recent"], list)
        assert len(data["recent"]) <= 20

    def test_stats_seeded_counters(self, api, admin_headers):
        """Per spec: today=1 (sent), week=7, month=10 (8 sent + 2 failed)."""
        r = api.get(f"{BASE_URL}/api/email-logs/stats", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        # We assert >= seeded counts (other tests may have appended)
        assert data["today"]["total"] >= 1, f"today: {data['today']}"
        assert data["this_week"]["total"] >= 7, f"this_week: {data['this_week']}"
        assert data["this_month"]["total"] >= 10, f"this_month: {data['this_month']}"
        assert data["this_month"]["sent"] >= 8
        assert data["this_month"]["failed"] >= 2
        # by_type contains the seeded categories (best-effort presence)
        for t in ("invoice", "shift_close", "marketing"):
            assert t in data["by_type"], f"missing type {t} in {data['by_type']}"

    def test_stats_unauthenticated_401(self, api):
        r = api.get(f"{BASE_URL}/api/email-logs/stats")
        assert r.status_code in (401, 403), r.status_code


# ---------------- /api/email-logs (paginated list) ----------------
class TestEmailLogsList:
    def test_pagination_defaults(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/email-logs?limit=5&page=1", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["page"] == 1
        assert data["limit"] == 5
        assert "total" in data and "pages" in data and "items" in data
        assert isinstance(data["items"], list)
        assert len(data["items"]) <= 5

    def test_filter_by_type_invoice(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/email-logs?type=invoice&limit=200", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 3, f"expected at least 3 invoice rows, got {len(items)}"
        for it in items:
            assert it["type"] == "invoice"

    def test_filter_by_status_failed(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/email-logs?status=failed&limit=200", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 2, f"expected at least 2 failed rows, got {len(items)}"
        for it in items:
            assert it["status"] == "failed"

    def test_filter_by_date_range(self, api, admin_headers):
        from datetime import datetime, timezone, timedelta
        today = datetime.now(timezone.utc).date()
        df = (today - timedelta(days=2)).isoformat()
        dt_ = today.isoformat()
        r = api.get(
            f"{BASE_URL}/api/email-logs?date_from={df}&date_to={dt_}&limit=200",
            headers=admin_headers,
        )
        assert r.status_code == 200
        # All items must be within range
        for it in r.json()["items"]:
            assert it["created_at"] >= f"{df}T00:00:00+00:00"
            assert it["created_at"] <= f"{dt_}T23:59:59+00:00"

    def test_unauthenticated_returns_401(self, api):
        r = api.get(f"{BASE_URL}/api/email-logs")
        assert r.status_code in (401, 403), r.status_code


# ---------------- 403 for role_level < 100 ----------------
class TestEmailLogsRBAC:
    @pytest.fixture(scope="class")
    def temp_cashier(self, admin_headers):
        api = requests.Session()
        api.headers.update({"Content-Type": "application/json"})
        unique_pin = "9919"  # not starting with 0
        # Create cashier
        payload = {
            "name": "QA_TEMP_CASHIER",
            "role": "cashier",
            "pin": unique_pin,
        }
        r = api.post(f"{BASE_URL}/api/users", json=payload, headers=admin_headers)
        if r.status_code == 409:
            # Pin in use, try alternative
            unique_pin = "9920"
            payload["pin"] = unique_pin
            r = api.post(f"{BASE_URL}/api/users", json=payload, headers=admin_headers)
        if r.status_code != 200:
            pytest.skip(f"Could not create temp cashier: {r.status_code} {r.text[:200]}")
        user_id = r.json().get("id") or r.json().get("user_id") or r.json().get("user", {}).get("id")
        # Login as cashier
        login = api.post(f"{BASE_URL}/api/auth/login", json={"pin": unique_pin})
        if login.status_code != 200:
            # cleanup
            if user_id:
                api.delete(f"{BASE_URL}/api/users/{user_id}", headers=admin_headers)
            pytest.skip(f"Cashier login failed: {login.status_code}")
        token = login.json().get("access_token") or login.json().get("token")
        yield {"id": user_id, "token": token}
        # cleanup
        if user_id:
            api.delete(f"{BASE_URL}/api/users/{user_id}", headers=admin_headers)

    def test_stats_forbidden_for_cashier(self, api, temp_cashier):
        h = {"Authorization": f"Bearer {temp_cashier['token']}"}
        r = api.get(f"{BASE_URL}/api/email-logs/stats", headers=h)
        assert r.status_code == 403, f"got {r.status_code}: {r.text[:200]}"
        assert "Administrador" in r.json().get("detail", "")

    def test_list_forbidden_for_cashier(self, api, temp_cashier):
        h = {"Authorization": f"Bearer {temp_cashier['token']}"}
        r = api.get(f"{BASE_URL}/api/email-logs", headers=h)
        assert r.status_code == 403, f"got {r.status_code}: {r.text[:200]}"


# ---------------- log_email helper ----------------
class TestLogEmailHelper:
    def test_helper_writes_sanitized_row(self, api, admin_headers):
        from services.email_logger import log_email  # type: ignore
        from motor.motor_asyncio import AsyncIOMotorClient

        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        assert mongo_url and db_name

        async def _run():
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            tag = f"qa-test-{uuid.uuid4().hex[:8]}@example.com"
            await log_email(
                db,
                type="invoice",
                recipient=f"  {tag.upper()}  ",  # whitespace + uppercase
                subject="x" * 400,                 # > 300 chars
                status="sent",
                bill_id="BILL-TEST-1",
            )
            row = await db.email_logs.find_one({"recipient": tag}, {"_id": 0})
            await db.email_logs.delete_many({"recipient": tag})
            client.close()
            return row

        row = asyncio.run(_run())
        assert row is not None, "log_email did not insert a row"
        assert row["type"] == "invoice"
        assert row["recipient"].islower()
        assert row["recipient"].strip() == row["recipient"]
        assert len(row["subject"]) == 300
        assert row["status"] == "sent"
        assert row["bill_id"] == "BILL-TEST-1"
        assert row["created_at"].endswith("+00:00") or row["created_at"].endswith("Z")
        assert "id" in row and isinstance(row["id"], str)

    def test_helper_unknown_type_falls_back_to_other(self):
        from services.email_logger import log_email  # type: ignore
        from motor.motor_asyncio import AsyncIOMotorClient

        async def _run():
            client = AsyncIOMotorClient(os.environ.get("MONGO_URL"))
            db = client[os.environ.get("DB_NAME")]
            tag = f"qa-other-{uuid.uuid4().hex[:8]}@example.com"
            await log_email(db, type="not_a_real_type", recipient=tag, subject="s", status="failed", error="boom")
            row = await db.email_logs.find_one({"recipient": tag}, {"_id": 0})
            await db.email_logs.delete_many({"recipient": tag})
            client.close()
            return row

        row = asyncio.run(_run())
        assert row is not None
        assert row["type"] == "other"
        assert row["status"] == "failed"
        assert row["error"] == "boom"


# ---------------- email_notifications._send is async ----------------
class TestSendIsAsync:
    def test_send_is_async_and_callers_await(self):
        path = "/app/backend/services/email_notifications.py"
        with open(path) as f:
            txt = f.read()
        assert "async def _send(" in txt, "_send should be async"
        # The 3 senders must await _send(...)
        for fn in ("send_shift_close_email", "send_day_close_email", "send_stock_alert_email"):
            assert f"async def {fn}" in txt
        # Must contain await _send( ...
        assert txt.count("await _send(") >= 3, "expected 3+ awaited _send calls"
        # log_type kwarg present
        for lt in ("shift_close", "day_close", "stock_alert"):
            assert f'log_type="{lt}"' in txt or f"log_type='{lt}'" in txt
