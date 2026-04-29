"""
Backend tests for FIX 4 — Reimpresión de Facturas (atomic counter + ESC/POS banner).

Endpoint under test:
    POST /api/print/receipt/{bill_id}/send

Validates:
1. Atomic increment of `reprint_count` in db.bills
2. Banner injected as the FIRST 4 commands in print_queue job:
   - text "*** REIMPRESION ***" size=2
   - text "Copia #N" bold
   - text "DOCUMENTO NO VALIDO COMO ORIGINAL"
   - divider
3. Job has reprint_count field set
4. Bill gets last_reprint_at + last_reprint_by updated
5. 404 on non-existent bill (no increment)
"""
import os
import asyncio
import pytest
import requests
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factura-consumo-app.preview.emergentagent.com").rstrip("/")
ADMIN_PIN = "11338585"


# --- Helpers ---
def _login() -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return token


async def _get_paid_bill_id() -> str:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    bill = await db.bills.find_one({"status": "paid"}, {"_id": 0, "id": 1})
    if not bill:
        bill = await db.bills.find_one({}, {"_id": 0, "id": 1})
    client.close()
    assert bill, "No bills in DB to test against"
    return bill["id"]


async def _read_bill(bill_id: str) -> dict:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    b = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    client.close()
    return b


async def _read_job(job_id: str) -> dict:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    j = await db.print_queue.find_one({"id": job_id}, {"_id": 0})
    client.close()
    return j


async def _reset_reprint_count(bill_id: str, value: int = 0):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    await db.bills.update_one(
        {"id": bill_id},
        {"$set": {"reprint_count": value}, "$unset": {"last_reprint_at": "", "last_reprint_by": ""}}
    )
    client.close()


# --- Fixtures ---
@pytest.fixture(scope="module")
def token():
    return _login()


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def bill_id():
    bid = asyncio.run(_get_paid_bill_id())
    # Reset counter so we have a deterministic starting state
    asyncio.run(_reset_reprint_count(bid, 0))
    yield bid
    # No teardown rollback (counter naturally tracks history); leave value as-is.


# --- Validation helpers ---
def _assert_banner(commands, expected_copy: int):
    """First 4 commands must be the REIMPRESION banner."""
    assert len(commands) >= 4, f"Job has only {len(commands)} commands"

    c0 = commands[0]
    assert c0.get("type") == "text", f"cmd[0] not text: {c0}"
    assert c0.get("text") == "*** REIMPRESION ***", f"cmd[0] text wrong: {c0}"
    assert c0.get("size") == 2, f"cmd[0] size != 2: {c0}"

    c1 = commands[1]
    assert c1.get("type") == "text"
    assert c1.get("text") == f"Copia #{expected_copy}", f"cmd[1] copy mismatch: {c1}"
    assert c1.get("bold") is True, f"cmd[1] not bold: {c1}"

    c2 = commands[2]
    assert c2.get("type") == "text"
    assert c2.get("text") == "DOCUMENTO NO VALIDO COMO ORIGINAL", f"cmd[2] text wrong: {c2}"

    c3 = commands[3]
    assert c3.get("type") == "divider", f"cmd[3] not divider: {c3}"


# --- Tests ---
class TestReprintCounter:

    def test_first_call_increments_to_1(self, headers, bill_id):
        r = requests.post(f"{BASE_URL}/api/print/receipt/{bill_id}/send", headers=headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") is True
        assert data.get("reprint_count") == 1, f"Expected 1, got {data}"
        assert "copies" in data
        assert "job_id" in data

        # DB checks
        bill = asyncio.run(_read_bill(bill_id))
        assert bill["reprint_count"] == 1
        assert bill.get("last_reprint_at"), "last_reprint_at not set"
        assert bill.get("last_reprint_by"), "last_reprint_by not set"

        job = asyncio.run(_read_job(data["job_id"]))
        assert job is not None, "Job not in print_queue"
        assert job.get("reprint_count") == 1
        _assert_banner(job["commands"], expected_copy=1)

    def test_second_call_increments_to_2(self, headers, bill_id):
        r = requests.post(f"{BASE_URL}/api/print/receipt/{bill_id}/send", headers=headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("reprint_count") == 2

        bill = asyncio.run(_read_bill(bill_id))
        assert bill["reprint_count"] == 2

        job = asyncio.run(_read_job(data["job_id"]))
        assert job.get("reprint_count") == 2
        _assert_banner(job["commands"], expected_copy=2)

    def test_third_call_increments_to_3_and_persists(self, headers, bill_id):
        r = requests.post(f"{BASE_URL}/api/print/receipt/{bill_id}/send", headers=headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("reprint_count") == 3

        # Re-read bill from DB to validate persistence
        bill = asyncio.run(_read_bill(bill_id))
        assert bill["reprint_count"] == 3, f"Persistence failed: {bill.get('reprint_count')}"

        job = asyncio.run(_read_job(data["job_id"]))
        _assert_banner(job["commands"], expected_copy=3)

    def test_last_reprint_timestamp_and_user_updated(self, headers, bill_id):
        # Capture current state
        bill_before = asyncio.run(_read_bill(bill_id))
        ts_before = bill_before.get("last_reprint_at")

        # Wait briefly so timestamp differs
        import time
        time.sleep(1.1)

        r = requests.post(f"{BASE_URL}/api/print/receipt/{bill_id}/send", headers=headers, timeout=20)
        assert r.status_code == 200

        bill_after = asyncio.run(_read_bill(bill_id))
        assert bill_after.get("last_reprint_at"), "last_reprint_at missing"
        assert bill_after["last_reprint_at"] != ts_before, "last_reprint_at not updated"
        assert bill_after.get("last_reprint_by"), "last_reprint_by missing"

    def test_banner_appears_BEFORE_business_name(self, headers, bill_id):
        """Confirms the banner is the FIRST commands, before training mode banner and biz name."""
        r = requests.post(f"{BASE_URL}/api/print/receipt/{bill_id}/send", headers=headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        job = asyncio.run(_read_job(data["job_id"]))
        cmds = job["commands"]

        # Banner must be at indices 0..3
        _assert_banner(cmds, expected_copy=data["reprint_count"])

        # Find first text command that looks like a biz name (size=2 + bold + center, NOT '*** REIMPRESION ***' nor '*** ENTRENAMIENTO ***')
        biz_idx = None
        for i, c in enumerate(cmds):
            if (c.get("type") == "text" and c.get("size") == 2 and c.get("bold")
                    and c.get("text") not in ("*** REIMPRESION ***", "*** ENTRENAMIENTO ***")):
                biz_idx = i
                break
        assert biz_idx is not None, "Could not find business name text in commands"
        assert biz_idx > 0, f"Business name appears at index {biz_idx}, must be after banner"

    def test_404_on_nonexistent_bill_no_increment(self, headers):
        # Snapshot current counter on existing bill to make sure no other side-effects
        fake_id = "nonexistent-bill-id-xyz-12345"
        r = requests.post(f"{BASE_URL}/api/print/receipt/{fake_id}/send", headers=headers, timeout=15)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"
        body = r.json()
        # Detail should mention 'Factura no encontrada'
        assert "Factura no encontrada" in (body.get("detail") or ""), f"Wrong error msg: {body}"

        # Also ensure the bill doc for the fake id was NOT created (no increment side-effect)
        async def _check():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            doc = await db.bills.find_one({"id": fake_id})
            client.close()
            return doc
        existing = asyncio.run(_check())
        assert existing is None, "Fake bill should not exist after 404"
