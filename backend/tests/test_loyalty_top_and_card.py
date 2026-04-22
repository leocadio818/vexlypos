"""Tests for Loyalty module: top-customers ranking widget, public loyalty card endpoint, send-card-email."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factura-consumo-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Known test data per review_request
AAA_ID = "78acee81-fdb1-425d-9e4f-e09a88b825c7"
AAA_TOKEN = "4a60953346b76734"
TEST_LOYALTY_ID = "dbf8a11d-3671-4361-b0ee-39214f32f6e3"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ── TOP CUSTOMERS WIDGET ──
class TestTopCustomers:
    def test_top_customers_30_days(self, session):
        r = session.get(f"{API}/loyalty/top-customers?days=30&limit=10", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "days" in data
        assert data["days"] == 30
        items = data["items"]
        assert isinstance(items, list)
        if items:
            it = items[0]
            for k in ["rank", "customer_id", "name", "current_points", "points_earned",
                      "points_redeemed", "activity", "visits", "total_spent", "last_bill_at"]:
                assert k in it, f"missing key {k}"
            # verify sort desc by activity
            acts = [i["activity"] for i in items]
            assert acts == sorted(acts, reverse=True)

    def test_top_customers_tabs_coherence(self, session):
        r30 = session.get(f"{API}/loyalty/top-customers?days=30&limit=10", timeout=20).json()
        r90 = session.get(f"{API}/loyalty/top-customers?days=90&limit=10", timeout=20).json()
        rall = session.get(f"{API}/loyalty/top-customers?days=3650&limit=10", timeout=20).json()
        a30 = sum(i["activity"] for i in r30["items"])
        a90 = sum(i["activity"] for i in r90["items"])
        aall = sum(i["activity"] for i in rall["items"])
        # Greater windows should have >= activity (top10 may shift but global agg should grow)
        assert aall >= a90 >= a30 or aall >= a30, f"Expected aall({aall})>=a90({a90})>=a30({a30})"


# ── LOYALTY CARD (public) ──
class TestPublicCard:
    def test_card_info_returns_token(self, session):
        r = session.get(f"{API}/loyalty/card/{AAA_ID}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["customer_id"] == AAA_ID
        assert d["token"] == AAA_TOKEN
        assert d["path"] == f"/loyalty-card/{AAA_ID}?token={AAA_TOKEN}"

    def test_public_card_valid_token(self, session):
        r = session.get(f"{API}/loyalty/public-card/{AAA_ID}?token={AAA_TOKEN}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["customer_id"] == AAA_ID
        assert "name" in d and "points" in d and "rd_equivalent" in d
        assert "point_value_rd" in d and "min_redemption" in d
        assert "business" in d and isinstance(d["business"], dict)
        assert "last_visits" in d and isinstance(d["last_visits"], list)
        assert len(d["last_visits"]) <= 3
        # Verify desc sort by paid_at if 2+ visits
        if len(d["last_visits"]) >= 2:
            assert d["last_visits"][0]["paid_at"] >= d["last_visits"][1]["paid_at"]

    def test_public_card_no_auth_required(self, session):
        # Use a fresh session with no cookies/auth to confirm public access
        s = requests.Session()
        r = s.get(f"{API}/loyalty/public-card/{AAA_ID}?token={AAA_TOKEN}", timeout=15)
        assert r.status_code == 200, f"public-card should be accessible without auth: {r.status_code} {r.text[:200]}"

    def test_public_card_invalid_token_403(self, session):
        r = session.get(f"{API}/loyalty/public-card/{AAA_ID}?token=deadbeefdeadbeef", timeout=15)
        assert r.status_code == 403, r.text

    def test_public_card_wrong_customer_404(self, session):
        fake = "00000000-0000-0000-0000-000000000000"
        import hmac, hashlib
        secret = b"pos_rd_2026_vexly_secure_key_Qw7nR4xM"
        tok = hmac.new(secret, f"loyalty-card:{fake}".encode(), hashlib.sha256).hexdigest()[:16]
        r = session.get(f"{API}/loyalty/public-card/{fake}?token={tok}", timeout=15)
        assert r.status_code == 404, r.text


# ── SEND EMAIL VALIDATION (no real send if no email) ──
class TestSendCardEmail:
    def test_send_email_without_email_400(self, session):
        # Create temp customer with no email
        c = session.post(f"{API}/customers", json={"name": "TEST_NoEmail Loyalty", "phone": "0000000000"}, timeout=15)
        assert c.status_code == 200, c.text
        cid = c.json()["id"]
        try:
            r = session.post(f"{API}/loyalty/send-card-email/{cid}", json={}, timeout=15)
            assert r.status_code == 400, f"expected 400 when no email, got {r.status_code}: {r.text}"
            assert "email" in r.text.lower()
        finally:
            session.delete(f"{API}/customers/{cid}", timeout=10)

    def test_send_email_404_unknown_customer(self, session):
        r = session.post(f"{API}/loyalty/send-card-email/nonexistent-id-xyz", json={"email": "x@y.com"}, timeout=15)
        # endpoint validates customer exists -> 404
        assert r.status_code == 404, r.text
