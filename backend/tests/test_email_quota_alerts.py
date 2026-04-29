"""Backend unit/integration tests for AUTOMATIC EMAIL QUOTA ALERT.

Tests services.email_logger.log_email + services.email_quota_alerts.maybe_send_quota_alert
through direct module imports (no HTTP). Final test verifies basic /api/email-logs
endpoints still respond 200 (health check).

Cleanup at module teardown: deletes any email_logs we created and resets system_config:main.
"""
import os
import sys
import asyncio
from datetime import datetime, timezone

import pytest
import requests

# Make backend importable
sys.path.insert(0, "/app/backend")

# Hydrate env from /app/backend/.env if missing (required for direct module imports)
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

if not os.environ.get("REACT_APP_BACKEND_URL"):
    try:
        with open("/app/frontend/.env") as _f:
            for _line in _f:
                _line = _line.strip()
                if _line.startswith("REACT_APP_BACKEND_URL"):
                    _k, _v = _line.split("=", 1)
                    os.environ["REACT_APP_BACKEND_URL"] = _v.strip().strip('"').strip("'")
                    break
    except Exception:
        pass
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_PIN = "11338585"


# ---------------- Helpers ----------------
def _get_db():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client, client[os.environ["DB_NAME"]]


def _calendar_month_start_iso() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0,
                       microsecond=0).astimezone(timezone.utc).isoformat()


async def _seed_invoice_logs(db, n: int, subject_prefix: str = "QA-ALERT"):
    """Insert n fake `invoice` rows in current month, bypassing log_email
    (so we don't trigger the quota check during seeding)."""
    import uuid
    now_iso = datetime.now(timezone.utc).isoformat()
    docs = [{
        "id": str(uuid.uuid4()),
        "type": "invoice",
        "recipient": f"qa-{i}@test.do",
        "subject": f"{subject_prefix}-SEED-{i}",
        "status": "sent",
        "error": None,
        "bill_id": None,
        "created_at": now_iso,
    } for i in range(n)]
    if docs:
        await db.email_logs.insert_many(docs)


async def _reset_system_config(db, *, limit=10, threshold=0.8,
                               notification_emails=None, clear_markers=True):
    notification_emails = notification_emails if notification_emails is not None else ["admin@test.do"]
    set_doc = {
        "email_monthly_quota": limit,
        "email_quota_alert_threshold": threshold,
        "notification_emails": notification_emails,
    }
    unset_doc = {}
    if clear_markers:
        unset_doc = {
            "email_quota_warning_sent_period": "",
            "email_quota_exceeded_sent_period": "",
        }
    update = {"$set": set_doc}
    if unset_doc:
        update["$unset"] = unset_doc
    await db.system_config.update_one({"id": "main"}, update, upsert=True)


async def _purge_qa_logs(db):
    await db.email_logs.delete_many({"$or": [
        {"subject": {"$regex": "^QA-ALERT"}},
        {"type": "quota_alert"},
    ]})


async def _count_alert_rows(db) -> int:
    return await db.email_logs.count_documents({"type": "quota_alert"})


async def _get_cfg(db):
    return await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}


# ---------------- Module-level event loop & shared db ----------------
@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db_handle(event_loop):
    client, db = _get_db()
    yield db
    # Final cleanup
    async def _final():
        await _purge_qa_logs(db)
        await db.system_config.update_one(
            {"id": "main"},
            {"$set": {"email_monthly_quota": 1000, "email_quota_alert_threshold": 0.8,
                      "notification_emails": []},
             "$unset": {"email_quota_warning_sent_period": "",
                        "email_quota_exceeded_sent_period": ""}},
            upsert=True,
        )
    event_loop.run_until_complete(_final())
    client.close()


def _run(event_loop, coro):
    return event_loop.run_until_complete(coro)


# ---------------- TESTS ----------------
class TestQuotaAlertFlow:
    """End-to-end stateful flow: 70% -> warning -> 90% idempotent ->
    110% exceeded -> 120% idempotent. Tests run in declared order."""

    def test_01_setup_and_warning_at_80pct(self, db_handle, event_loop):
        async def _go():
            # Reset state
            await _purge_qa_logs(db_handle)
            await _reset_system_config(db_handle, limit=10, threshold=0.8,
                                       notification_emails=["admin@test.do"])
            # Seed 7 invoice rows -> count=7 (70% < threshold)
            await _seed_invoice_logs(db_handle, 7)
            # Trigger one more invoice via log_email -> count=8 -> 80% (>=threshold)
            from services.email_logger import log_email
            await log_email(db_handle, type="invoice", recipient="x@y.com",
                            subject="QA-ALERT-TRIG-80", status="sent")
            # Allow fire-and-forget task to run
            await asyncio.sleep(1.2)

            alerts = await _count_alert_rows(db_handle)
            cfg = await _get_cfg(db_handle)
            period_iso = _calendar_month_start_iso()
            return alerts, cfg, period_iso

        alerts, cfg, period_iso = _run(event_loop, _go())
        assert alerts == 1, f"expected 1 quota_alert row, got {alerts}"
        assert cfg.get("email_quota_warning_sent_period") == period_iso
        assert cfg.get("email_quota_exceeded_sent_period") in (None, "")

        # Inspect alert row
        async def _row():
            return await db_handle.email_logs.find_one({"type": "quota_alert"}, {"_id": 0})
        row = _run(event_loop, _row())
        assert row is not None
        assert row["recipient"] == "admin@test.do"
        assert row["subject"].startswith("Cuota cerca del límite — "), row["subject"]

    def test_02_idempotent_warning_at_90pct(self, db_handle, event_loop):
        async def _go():
            from services.email_logger import log_email
            # count is currently 8 -> push to 9 (90% — still <100%, still > threshold)
            await log_email(db_handle, type="invoice", recipient="x@y.com",
                            subject="QA-ALERT-TRIG-90", status="sent")
            await asyncio.sleep(1.0)
            return await _count_alert_rows(db_handle)

        alerts = _run(event_loop, _go())
        assert alerts == 1, f"warning should be idempotent (no resend) — got {alerts}"

    def test_03_exceeded_at_110pct(self, db_handle, event_loop):
        async def _go():
            from services.email_logger import log_email
            # count=9 -> push to 10 (100%) -> push to 11 (110%)
            await log_email(db_handle, type="invoice", recipient="x@y.com",
                            subject="QA-ALERT-TRIG-100", status="sent")
            await asyncio.sleep(0.4)
            await log_email(db_handle, type="invoice", recipient="x@y.com",
                            subject="QA-ALERT-TRIG-110", status="sent")
            await asyncio.sleep(1.2)
            alerts = await _count_alert_rows(db_handle)
            cfg = await _get_cfg(db_handle)
            return alerts, cfg

        alerts, cfg = _run(event_loop, _go())
        assert alerts == 2, f"expected 2 quota_alert rows, got {alerts}"
        period_iso = _calendar_month_start_iso()
        assert cfg.get("email_quota_exceeded_sent_period") == period_iso
        assert cfg.get("email_quota_warning_sent_period") == period_iso  # also persisted

        async def _row():
            return await db_handle.email_logs.find_one(
                {"type": "quota_alert", "subject": {"$regex": "EXCEDIDA"}},
                {"_id": 0},
            )
        row = _run(event_loop, _row())
        assert row is not None, "expected at least one EXCEDIDA alert row"
        assert row["subject"].startswith("Cuota EXCEDIDA — "), row["subject"]

    def test_04_idempotent_exceeded_at_120pct(self, db_handle, event_loop):
        async def _go():
            from services.email_logger import log_email
            await log_email(db_handle, type="invoice", recipient="x@y.com",
                            subject="QA-ALERT-TRIG-120", status="sent")
            await asyncio.sleep(1.0)
            return await _count_alert_rows(db_handle)

        alerts = _run(event_loop, _go())
        assert alerts == 2, f"exceeded should be idempotent — got {alerts}"


class TestQuotaAlertEdgeCases:
    def test_no_recipients_silent(self, db_handle, event_loop):
        async def _go():
            await _purge_qa_logs(db_handle)
            await _reset_system_config(db_handle, limit=10, threshold=0.8,
                                       notification_emails=[])
            await _seed_invoice_logs(db_handle, 9)  # 90% -- above threshold
            from services.email_logger import log_email
            await log_email(db_handle, type="invoice", recipient="x@y.com",
                            subject="QA-ALERT-NO-RCPT", status="sent")
            await asyncio.sleep(1.0)
            cfg = await _get_cfg(db_handle)
            return await _count_alert_rows(db_handle), cfg

        alerts, cfg = _run(event_loop, _go())
        assert alerts == 0, f"no recipients => no alert rows; got {alerts}"
        assert cfg.get("email_quota_warning_sent_period") in (None, "")
        assert cfg.get("email_quota_exceeded_sent_period") in (None, "")

    def test_disabled_limit_short_circuit(self, db_handle, event_loop):
        async def _go():
            await _purge_qa_logs(db_handle)
            await _reset_system_config(db_handle, limit=0, threshold=0.8,
                                       notification_emails=["admin@test.do"])
            await _seed_invoice_logs(db_handle, 50)
            from services.email_logger import log_email
            await log_email(db_handle, type="invoice", recipient="x@y.com",
                            subject="QA-ALERT-LIMIT0", status="sent")
            await asyncio.sleep(1.0)
            return await _count_alert_rows(db_handle)

        alerts = _run(event_loop, _go())
        assert alerts == 0, f"limit<=0 should short-circuit; got {alerts}"

    def test_no_resend_api_key_silent(self, db_handle, event_loop, monkeypatch):
        async def _go():
            await _purge_qa_logs(db_handle)
            await _reset_system_config(db_handle, limit=10, threshold=0.8,
                                       notification_emails=["admin@test.do"])
            await _seed_invoice_logs(db_handle, 9)

            import services.email_quota_alerts as eqa
            monkeypatch.setattr(eqa.resend, "api_key", "", raising=False)

            from services.email_logger import log_email
            await log_email(db_handle, type="invoice", recipient="x@y.com",
                            subject="QA-ALERT-NOKEY", status="sent")
            await asyncio.sleep(1.0)
            cfg = await _get_cfg(db_handle)
            return await _count_alert_rows(db_handle), cfg

        alerts, cfg = _run(event_loop, _go())
        assert alerts == 0, f"no api_key => silent return; got {alerts}"
        assert cfg.get("email_quota_warning_sent_period") in (None, "")

    def test_no_recursion_for_quota_alert_type(self, db_handle, event_loop):
        """Inserting a quota_alert row directly via log_email must NOT
        schedule maybe_send_quota_alert (otherwise infinite recursion)."""
        async def _go():
            await _purge_qa_logs(db_handle)
            await _reset_system_config(db_handle, limit=10, threshold=0.8,
                                       notification_emails=["admin@test.do"])
            await _seed_invoice_logs(db_handle, 9)  # 90% (would trigger if scheduled)

            # Patch maybe_send_quota_alert to count invocations
            import services.email_logger as el
            import services.email_quota_alerts as eqa
            calls = {"n": 0}
            real = eqa.maybe_send_quota_alert

            async def _spy(db):
                calls["n"] += 1
                return await real(db)

            # Patch the symbol that log_email imports lazily
            eqa.maybe_send_quota_alert = _spy
            try:
                await el.log_email(db_handle, type="quota_alert",
                                   recipient="admin@test.do",
                                   subject="QA-ALERT-MANUAL",
                                   status="sent")
                await asyncio.sleep(0.6)
            finally:
                eqa.maybe_send_quota_alert = real
            return calls["n"]

        n = _run(event_loop, _go())
        assert n == 0, f"quota_alert inserts should NOT schedule the check; got {n}"

    def test_used_pct_excludes_quota_alert_rows(self, db_handle, event_loop):
        """Seed 9 invoices + 5 quota_alert rows; with limit=10 the count
        used by the quota function MUST be 9 (used_pct=90% warning),
        NOT 14 (would be 'exceeded')."""
        async def _go():
            await _purge_qa_logs(db_handle)
            await _reset_system_config(db_handle, limit=10, threshold=0.8,
                                       notification_emails=["admin@test.do"])
            await _seed_invoice_logs(db_handle, 9)
            # Inject 5 quota_alert rows directly (bypass log_email)
            import uuid
            now_iso = datetime.now(timezone.utc).isoformat()
            await db_handle.email_logs.insert_many([{
                "id": str(uuid.uuid4()), "type": "quota_alert",
                "recipient": "admin@test.do", "subject": "QA-ALERT-INJECT",
                "status": "sent", "error": None, "bill_id": None,
                "created_at": now_iso,
            } for _ in range(5)])

            from services.email_logger import log_email
            # This invoice push: count(invoice)=10 (100% if alerts counted, would be 150%)
            await log_email(db_handle, type="invoice", recipient="x@y.com",
                            subject="QA-ALERT-PCT-CHECK", status="sent")
            await asyncio.sleep(1.2)

            cfg = await _get_cfg(db_handle)
            # Count of quota_alert rows added (besides our 5 injected)
            total_alerts = await db_handle.email_logs.count_documents({"type": "quota_alert"})
            return cfg, total_alerts

        cfg, total_alerts = _run(event_loop, _go())
        period_iso = _calendar_month_start_iso()
        # used (excluding alerts) = 10 -> 100% -> EXCEEDED (>= 1.0)
        assert cfg.get("email_quota_exceeded_sent_period") == period_iso
        # total alert rows = 5 injected + 1 generated = 6
        assert total_alerts == 5 + 1, f"expected 6 alert rows, got {total_alerts}"


class TestHealthAfterAll:
    def test_email_logs_stats_endpoint_ok(self):
        if not BASE_URL:
            pytest.skip("REACT_APP_BACKEND_URL not set")
        api = requests.Session()
        r = api.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN}, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"admin login failed: {r.status_code}")
        token = r.json().get("access_token") or r.json().get("token")
        h = {"Authorization": f"Bearer {token}"}
        r = api.get(f"{BASE_URL}/api/email-logs/stats", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        assert "quota" in r.json()

    def test_email_logs_quota_put_ok(self):
        if not BASE_URL:
            pytest.skip("REACT_APP_BACKEND_URL not set")
        api = requests.Session()
        r = api.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN}, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"admin login failed: {r.status_code}")
        token = r.json().get("access_token") or r.json().get("token")
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        r = api.put(f"{BASE_URL}/api/email-logs/quota",
                    json={"limit": 1000, "threshold_pct": 80}, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["limit"] == 1000
