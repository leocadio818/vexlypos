"""Combos backend test suite — CRUD + integration with orders + permissions."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factura-consumo-app.preview.emergentagent.com").rstrip("/")
ADMIN_PIN = "11338585"
CASHIER_PIN = "1111"


# ─── Fixtures ────────────────────────────────────────────────
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, pin):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"pin": pin}, timeout=15)
    assert r.status_code == 200, f"login failed for {pin}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(session):
    return _login(session, ADMIN_PIN)


@pytest.fixture(scope="module")
def cashier_token(session):
    return _login(session, CASHIER_PIN)


@pytest.fixture(scope="module")
def headers_admin(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def headers_cashier(cashier_token):
    return {"Authorization": f"Bearer {cashier_token}"}


@pytest.fixture(scope="module")
def sample_products(session, headers_admin):
    r = session.get(f"{BASE_URL}/api/products", headers=headers_admin, timeout=15)
    assert r.status_code == 200, r.text
    prods = r.json()
    assert len(prods) >= 3, "need at least 3 products in DB"
    return prods[:5]


# Track created combos for cleanup
_created_combo_ids = []


@pytest.fixture(scope="module", autouse=True)
def cleanup_combos(session, headers_admin):
    yield
    for cid in _created_combo_ids:
        try:
            session.delete(f"{BASE_URL}/api/combos/{cid}", headers=headers_admin, timeout=10)
        except Exception:
            pass


# ─── CRUD tests ──────────────────────────────────────────────
class TestCombosCRUD:
    def test_list_combos_admin(self, session, headers_admin):
        r = session.get(f"{BASE_URL}/api/combos", headers=headers_admin, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_combo_validation_missing_name(self, session, headers_admin):
        r = session.post(f"{BASE_URL}/api/combos", headers=headers_admin, json={
            "combo_type": "fixed", "pricing_type": "fixed_price", "groups": []
        }, timeout=15)
        assert r.status_code == 400

    def test_create_combo_validation_invalid_combo_type(self, session, headers_admin, sample_products):
        r = session.post(f"{BASE_URL}/api/combos", headers=headers_admin, json={
            "name": "TEST_invalid", "combo_type": "weird", "pricing_type": "fixed_price",
            "groups": [{"name": "g", "items": [{"product_id": sample_products[0]["id"]}]}]
        }, timeout=15)
        assert r.status_code == 400

    def test_create_combo_validation_invalid_pricing(self, session, headers_admin, sample_products):
        r = session.post(f"{BASE_URL}/api/combos", headers=headers_admin, json={
            "name": "TEST_invalid", "combo_type": "fixed", "pricing_type": "free",
            "groups": [{"name": "g", "items": [{"product_id": sample_products[0]["id"]}]}]
        }, timeout=15)
        assert r.status_code == 400

    def test_create_combo_validation_no_groups(self, session, headers_admin):
        r = session.post(f"{BASE_URL}/api/combos", headers=headers_admin, json={
            "name": "TEST_nogroups", "combo_type": "fixed", "pricing_type": "fixed_price", "groups": []
        }, timeout=15)
        assert r.status_code == 400

    def test_create_combo_validation_empty_group(self, session, headers_admin):
        r = session.post(f"{BASE_URL}/api/combos", headers=headers_admin, json={
            "name": "TEST_emptygroup", "combo_type": "fixed", "pricing_type": "fixed_price",
            "groups": [{"name": "g1", "items": []}]
        }, timeout=15)
        assert r.status_code == 400

    def test_create_fixed_combo_success(self, session, headers_admin, sample_products):
        payload = {
            "name": "TEST_combo_fixed",
            "description": "Test fixed combo",
            "combo_type": "fixed",
            "pricing_type": "fixed_price",
            "price": 300,
            "is_active": True,
            "groups": [{
                "name": "Items Incluidos",
                "min_selections": 2,
                "max_selections": 2,
                "items": [
                    {"product_id": sample_products[0]["id"], "product_name": sample_products[0].get("name", "")},
                    {"product_id": sample_products[1]["id"], "product_name": sample_products[1].get("name", "")},
                ]
            }]
        }
        r = session.post(f"{BASE_URL}/api/combos", headers=headers_admin, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_combo_fixed"
        assert data["combo_type"] == "fixed"
        assert data["pricing_type"] == "fixed_price"
        assert float(data["price"]) == 300
        assert "id" in data and len(data["groups"]) == 1
        assert len(data["groups"][0]["items"]) == 2
        assert "_id" not in data
        _created_combo_ids.append(data["id"])
        pytest.fixed_combo_id = data["id"]

    def test_create_configurable_combo_success(self, session, headers_admin, sample_products):
        payload = {
            "name": "TEST_combo_config",
            "combo_type": "configurable",
            "pricing_type": "fixed_price",
            "price": 500,
            "is_active": True,
            "groups": [
                {
                    "name": "Plato principal", "min_selections": 1, "max_selections": 1,
                    "items": [
                        {"product_id": sample_products[0]["id"], "product_name": sample_products[0].get("name", ""), "is_default": True},
                        {"product_id": sample_products[1]["id"], "product_name": sample_products[1].get("name", "")},
                        {"product_id": sample_products[2]["id"], "product_name": sample_products[2].get("name", "")},
                    ]
                },
                {
                    "name": "Bebida", "min_selections": 1, "max_selections": 2,
                    "items": [
                        {"product_id": sample_products[0]["id"], "product_name": sample_products[0].get("name", "")},
                        {"product_id": sample_products[1]["id"], "product_name": sample_products[1].get("name", "")},
                    ]
                },
            ]
        }
        r = session.post(f"{BASE_URL}/api/combos", headers=headers_admin, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["combo_type"] == "configurable"
        assert len(data["groups"]) == 2
        _created_combo_ids.append(data["id"])
        pytest.config_combo_id = data["id"]

    def test_get_active_combos_only(self, session, headers_admin):
        r = session.get(f"{BASE_URL}/api/combos/active", headers=headers_admin, timeout=15)
        assert r.status_code == 200
        for c in r.json():
            assert c["is_active"] is True

    def test_patch_combo_toggle_active_and_name(self, session, headers_admin):
        cid = pytest.fixed_combo_id
        r = session.patch(f"{BASE_URL}/api/combos/{cid}", headers=headers_admin, json={
            "is_active": False, "name": "TEST_combo_fixed_renamed", "price": 350
        }, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["is_active"] is False
        assert d["name"] == "TEST_combo_fixed_renamed"
        assert float(d["price"]) == 350
        # GET to verify persistence
        r2 = session.get(f"{BASE_URL}/api/combos", headers=headers_admin, timeout=15)
        match = next((c for c in r2.json() if c["id"] == cid), None)
        assert match and match["is_active"] is False and match["name"] == "TEST_combo_fixed_renamed"
        # active list should NOT contain cid now
        r3 = session.get(f"{BASE_URL}/api/combos/active", headers=headers_admin, timeout=15)
        assert all(c["id"] != cid for c in r3.json())
        # re-activate for further tests
        session.patch(f"{BASE_URL}/api/combos/{cid}", headers=headers_admin, json={"is_active": True}, timeout=15)


# ─── Permission tests ────────────────────────────────────────
class TestCombosPermissions:
    def test_cashier_cannot_create(self, session, headers_cashier, sample_products):
        r = session.post(f"{BASE_URL}/api/combos", headers=headers_cashier, json={
            "name": "TEST_unauthorized", "combo_type": "fixed", "pricing_type": "fixed_price", "price": 100,
            "groups": [{"name": "g", "items": [{"product_id": sample_products[0]["id"]}]}]
        }, timeout=15)
        assert r.status_code == 403

    def test_cashier_cannot_patch(self, session, headers_cashier):
        cid = getattr(pytest, "fixed_combo_id", None)
        if not cid:
            pytest.skip("no combo created")
        r = session.patch(f"{BASE_URL}/api/combos/{cid}", headers=headers_cashier, json={"name": "x"}, timeout=15)
        assert r.status_code == 403

    def test_cashier_cannot_delete(self, session, headers_cashier):
        cid = getattr(pytest, "fixed_combo_id", None)
        if not cid:
            pytest.skip("no combo created")
        r = session.delete(f"{BASE_URL}/api/combos/{cid}", headers=headers_cashier, timeout=15)
        assert r.status_code == 403

    def test_cashier_can_list_combos(self, session, headers_cashier):
        r = session.get(f"{BASE_URL}/api/combos/active", headers=headers_cashier, timeout=15)
        assert r.status_code == 200


# ─── Order integration ───────────────────────────────────────
@pytest.fixture(scope="module")
def test_order(session, headers_admin):
    """Create a fresh test order on an existing table to add combos to."""
    # Find an available table
    r = session.get(f"{BASE_URL}/api/tables", headers=headers_admin, timeout=15)
    assert r.status_code == 200, r.text
    tables = r.json()
    table = tables[0]
    payload = {"table_id": table["id"], "items": []}
    r = session.post(f"{BASE_URL}/api/orders", headers=headers_admin, json=payload, timeout=15)
    assert r.status_code in (200, 201), f"failed to create test order: {r.status_code} {r.text}"
    return r.json()


class TestComboInOrder:
    def test_add_fixed_combo_to_order(self, session, headers_admin, test_order):
        order_id = test_order["id"]
        cid = pytest.fixed_combo_id
        r = session.post(f"{BASE_URL}/api/orders/{order_id}/combos", headers=headers_admin,
                         json={"combo_id": cid}, timeout=15)
        assert r.status_code == 200, r.text
        order = r.json()
        items = order.get("items", [])
        # parent + 2 children = at least 3 items added
        parents = [i for i in items if i.get("is_combo")]
        children = [i for i in items if i.get("is_combo_item")]
        assert len(parents) >= 1
        assert len(children) >= 2
        # all share combo_group_id
        gid = parents[-1]["combo_group_id"]
        gid_children = [c for c in children if c.get("combo_group_id") == gid]
        assert len(gid_children) == 2
        # parent has price, children price=0
        parent = next(p for p in parents if p["combo_group_id"] == gid)
        assert float(parent["unit_price"]) > 0
        for c in gid_children:
            assert float(c["unit_price"]) == 0
            assert c.get("product_id")
        pytest.test_order_id = order_id
        pytest.combo_group_id = gid

    def test_add_configurable_combo_with_selections(self, session, headers_admin, test_order, sample_products):
        order_id = test_order["id"]
        cid = pytest.config_combo_id
        # Get group ids
        r0 = session.get(f"{BASE_URL}/api/combos", headers=headers_admin, timeout=15).json()
        combo = next(c for c in r0 if c["id"] == cid)
        sel = {}
        for g in combo["groups"]:
            sel[g["id"]] = [g["items"][0]["product_id"]]
        r = session.post(f"{BASE_URL}/api/orders/{order_id}/combos", headers=headers_admin,
                         json={"combo_id": cid, "selections": sel}, timeout=15)
        assert r.status_code == 200, r.text

    def test_configurable_combo_validation_missing_min(self, session, headers_admin, test_order):
        order_id = test_order["id"]
        cid = pytest.config_combo_id
        r = session.post(f"{BASE_URL}/api/orders/{order_id}/combos", headers=headers_admin,
                         json={"combo_id": cid, "selections": {}}, timeout=15)
        # Should fail because no defaults in second group
        assert r.status_code == 400

    def test_remove_combo_from_order(self, session, headers_admin):
        order_id = pytest.test_order_id
        gid = pytest.combo_group_id
        r = session.delete(f"{BASE_URL}/api/orders/{order_id}/combos/{gid}", headers=headers_admin, timeout=15)
        assert r.status_code == 200, r.text
        order = r.json()
        # No item with this combo_group_id should remain
        for it in order.get("items", []):
            assert it.get("combo_group_id") != gid

    def test_remove_nonexistent_combo(self, session, headers_admin):
        order_id = pytest.test_order_id
        r = session.delete(f"{BASE_URL}/api/orders/{order_id}/combos/nonexistent-id", headers=headers_admin, timeout=15)
        assert r.status_code == 404


# ─── Cleanup ─────────────────────────────────────────────────
class TestComboDelete:
    def test_delete_combo(self, session, headers_admin):
        cid = pytest.config_combo_id
        r = session.delete(f"{BASE_URL}/api/combos/{cid}", headers=headers_admin, timeout=15)
        assert r.status_code == 200
        if cid in _created_combo_ids:
            _created_combo_ids.remove(cid)
        # Verify
        r2 = session.delete(f"{BASE_URL}/api/combos/{cid}", headers=headers_admin, timeout=15)
        assert r2.status_code == 404
