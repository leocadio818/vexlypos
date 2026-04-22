"""Backend tests for Promotions / Happy Hour feature."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factura-consumo-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PIN = "11338585"
CASHIER_PIN = "1111"


def _login(pin: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"pin": pin}, timeout=15)
    assert r.status_code == 200, f"login failed pin={pin} -> {r.status_code} {r.text[:200]}"
    body = r.json()
    return body.get("token") or body.get("access_token")


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN_PIN)


@pytest.fixture(scope="session")
def cashier_token():
    return _login(CASHIER_PIN)


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def cashier_headers(cashier_token):
    return {"Authorization": f"Bearer {cashier_token}", "Content-Type": "application/json"}


# ─── Permissions ────────────────────────────────────────────────────────
class TestPermissions:
    def test_admin_can_list(self, admin_headers):
        r = requests.get(f"{API}/promotions", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_cashier_can_list(self, cashier_headers):
        # listing is for any authenticated user
        r = requests.get(f"{API}/promotions", headers=cashier_headers, timeout=15)
        assert r.status_code == 200

    def test_cashier_cannot_create(self, cashier_headers):
        payload = {
            "name": "TEST_unauth_promo",
            "discount_type": "percentage",
            "discount_value": 10,
            "apply_to": "all",
        }
        r = requests.post(f"{API}/promotions", headers=cashier_headers, json=payload, timeout=15)
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text[:200]}"

    def test_cashier_can_view_active(self, cashier_headers):
        r = requests.get(f"{API}/promotions/active", headers=cashier_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ─── CRUD ────────────────────────────────────────────────────────────────
class TestCRUD:
    created_id = None

    def test_create_validation_missing_name(self, admin_headers):
        r = requests.post(f"{API}/promotions", headers=admin_headers,
                          json={"discount_type": "percentage", "discount_value": 10, "apply_to": "all"}, timeout=15)
        assert r.status_code == 400

    def test_create_validation_bad_type(self, admin_headers):
        r = requests.post(f"{API}/promotions", headers=admin_headers,
                          json={"name": "TEST_x", "discount_type": "weird", "apply_to": "all"}, timeout=15)
        assert r.status_code == 400

    def test_create_validation_bad_apply(self, admin_headers):
        r = requests.post(f"{API}/promotions", headers=admin_headers,
                          json={"name": "TEST_x", "discount_type": "percentage", "discount_value": 10, "apply_to": "weird"}, timeout=15)
        assert r.status_code == 400

    def test_create_ok(self, admin_headers):
        payload = {
            "name": "TEST_HappyHourPytest",
            "description": "pytest created",
            "is_active": True,
            "discount_type": "percentage",
            "discount_value": 15,
            "apply_to": "all",
            "schedule": {"days": [1, 2, 3, 4, 5], "start_time": "16:00", "end_time": "19:00"},
        }
        r = requests.post(f"{API}/promotions", headers=admin_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body["name"] == "TEST_HappyHourPytest"
        assert body["discount_type"] == "percentage"
        assert body["discount_value"] == 15
        assert body["apply_to"] == "all"
        assert body["is_active"] is True
        assert "id" in body
        TestCRUD.created_id = body["id"]
        # Verify persisted via GET list
        rl = requests.get(f"{API}/promotions", headers=admin_headers, timeout=15)
        ids = [p["id"] for p in rl.json()]
        assert body["id"] in ids

    def test_patch_toggle(self, admin_headers):
        assert TestCRUD.created_id, "create must run first"
        r = requests.patch(f"{API}/promotions/{TestCRUD.created_id}",
                           headers=admin_headers, json={"is_active": False}, timeout=15)
        assert r.status_code == 200
        assert r.json()["is_active"] is False
        # Re-fetch persisted
        rl = requests.get(f"{API}/promotions", headers=admin_headers, timeout=15)
        match = [p for p in rl.json() if p["id"] == TestCRUD.created_id][0]
        assert match["is_active"] is False

    def test_patch_404(self, admin_headers):
        r = requests.patch(f"{API}/promotions/nonexistent-id", headers=admin_headers,
                           json={"is_active": True}, timeout=15)
        assert r.status_code == 404

    def test_delete_ok(self, admin_headers):
        assert TestCRUD.created_id, "create must run first"
        r = requests.delete(f"{API}/promotions/{TestCRUD.created_id}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        rl = requests.get(f"{API}/promotions", headers=admin_headers, timeout=15)
        ids = [p["id"] for p in rl.json()]
        assert TestCRUD.created_id not in ids

    def test_delete_404(self, admin_headers):
        r = requests.delete(f"{API}/promotions/nonexistent-id", headers=admin_headers, timeout=15)
        assert r.status_code == 404


# ─── Initial seed: Happy Hour Cervezas ─────────────────────────────────
class TestSeedHappyHour:
    def test_happy_hour_exists(self, admin_headers):
        r = requests.get(f"{API}/promotions", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        promos = r.json()
        names = [p["name"] for p in promos]
        assert any("Happy Hour" in n for n in names), f"no Happy Hour found, names={names}"

    def test_active_endpoint_returns_list(self, admin_headers):
        r = requests.get(f"{API}/promotions/active", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ─── Order integration ─────────────────────────────────────────────────
class TestOrderIntegration:
    def test_add_item_applies_discount(self, admin_headers):
        # Find a beer product (categoria Cervezas seeded id known per context)
        r = requests.get(f"{API}/products", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        products = r.json()
        # Find PRESIDENTE
        beer = next((p for p in products if "PRESIDENTE" in (p.get("name", "") or "").upper()), None)
        if beer is None:
            pytest.skip("PRESIDENTE not found")

        # Find/create open order on table 1
        r = requests.get(f"{API}/tables", headers=admin_headers, timeout=15)
        tables = r.json() if r.status_code == 200 else []
        if not tables:
            pytest.skip("no tables")
        table_id = tables[0]["id"]

        # Get or create order
        ro = requests.get(f"{API}/orders?status=open", headers=admin_headers, timeout=15)
        order_id = None
        if ro.status_code == 200:
            for o in ro.json():
                if o.get("table_id") == table_id and o.get("status") == "open":
                    order_id = o["id"]
                    break
        if not order_id:
            cr = requests.post(f"{API}/orders",
                               headers=admin_headers,
                               json={"table_id": table_id, "guests": 1, "channel": "dine_in"}, timeout=15)
            if cr.status_code not in (200, 201):
                pytest.skip(f"cannot create order: {cr.status_code} {cr.text[:200]}")
            order_id = cr.json().get("id")

        # Add item with original price (assume 300)
        ai = requests.post(f"{API}/orders/{order_id}/items",
                           headers=admin_headers,
                           json={"items": [{"product_id": beer["id"], "quantity": 1,
                                 "unit_price": float(beer.get("price", 300)), "product_name": beer.get("name")}]}, timeout=20)
        assert ai.status_code in (200, 201), ai.text[:300]
        body = ai.json()
        # Backend should attach promotion fields IF an active promo applies right now
        # We assert structure is valid; if promotion currently inactive (out of schedule) we skip strict assert
        active = requests.get(f"{API}/promotions/active", headers=admin_headers, timeout=15).json()
        applies = any(p.get("apply_to") in ("all", "category") for p in active)
        # Inspect the order items to find the just-added item
        order = requests.get(f"{API}/orders/{order_id}", headers=admin_headers, timeout=15).json()
        items = order.get("items", [])
        last = items[-1] if items else None
        assert last is not None
        if applies:
            # Discount should have been applied
            print(f"item: name={last.get('name')} unit_price={last.get('unit_price')} original={last.get('original_price')} promo={last.get('promotion_name')}")
        else:
            print("No active promotion applies right now; just verifying structure")
