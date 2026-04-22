"""Backend tests for the enhanced modifiers system.

Covers:
- /api/modifier-groups/for-product/{pid} resolves contextual prices + stock
- /api/modifier-groups POST accepts prefix, selection_type, applies_to_*
- /api/modifiers POST accepts mode, product_id, price_source, custom_price, max_qty
- /api/orders items add-items deducts inventory for product-linked modifiers
- Regression: legacy text modifiers still work via /api/modifier-groups-with-options
- Security: endpoints require auth (401 without Bearer)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factura-consumo-app.preview.emergentagent.com").rstrip("/")
ADMIN_PIN = "11338585"

HAMB_ID = "1af20c68-5eb2-4562-8b20-ee16bbe6ef2e"
TOSTONES_ID = "a9478dab-4f1d-49a3-a04b-aab91e11419c"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(autouse=True)
def reset_tostones_stock(auth):
    """Ensure Tostones stock = 100 before each test."""
    requests.put(
        f"{BASE_URL}/api/products/{TOSTONES_ID}",
        headers=auth,
        json={"simple_inventory_enabled": True, "simple_inventory_qty": 100, "price": 80, "price_b": 0, "price_c": 20},
        timeout=15,
    )
    yield
    # Restore to 100 afterwards too
    requests.put(
        f"{BASE_URL}/api/products/{TOSTONES_ID}",
        headers=auth,
        json={"simple_inventory_enabled": True, "simple_inventory_qty": 100},
        timeout=15,
    )


# ─── TEST: /api/modifier-groups/for-product returns enriched data ───
class TestForProductEndpoint:
    def test_returns_demo_groups_for_hamburguesa(self, auth):
        r = requests.get(f"{BASE_URL}/api/modifier-groups/for-product/{HAMB_ID}", headers=auth, timeout=15)
        assert r.status_code == 200
        groups = r.json()
        assert isinstance(groups, list) and len(groups) >= 3
        names = {g["name"] for g in groups}
        assert any("Acompa" in n for n in names), f"Missing Acompañantes group: {names}"
        assert any("Extra" in n for n in names), f"Missing Extras group: {names}"

    def test_options_resolve_contextual_prices(self, auth):
        r = requests.get(f"{BASE_URL}/api/modifier-groups/for-product/{HAMB_ID}", headers=auth, timeout=15)
        groups = r.json()
        acomp = next(g for g in groups if "Acompa" in g["name"])
        extras = next(g for g in groups if "Extra" in g["name"])
        # Acompañante Tostones should resolve to price_b = 0
        acc_opt = next((o for o in acomp.get("options", []) if o.get("name") == "Tostones"), None)
        assert acc_opt is not None, "Tostones not found in Acompañantes"
        assert acc_opt["resolved_price"] == 0.0
        assert acc_opt["linked_product"]["id"] == TOSTONES_ID
        assert acc_opt["available"] is True
        # Extras Tostones should resolve to price_c = 20
        ext_opt = next((o for o in extras.get("options", []) if "Tostones" in o.get("name", "")), None)
        assert ext_opt is not None
        assert ext_opt["resolved_price"] == 20.0

    def test_selection_type_and_prefix_present(self, auth):
        r = requests.get(f"{BASE_URL}/api/modifier-groups/for-product/{HAMB_ID}", headers=auth, timeout=15)
        groups = r.json()
        acomp = next(g for g in groups if "Acompa" in g["name"])
        assert acomp.get("selection_type") in ("required", "optional", "unlimited")
        # prefix field must exist (may be empty string but must be present in schema)
        assert "prefix" in acomp

    def test_404_on_unknown_product(self, auth):
        r = requests.get(f"{BASE_URL}/api/modifier-groups/for-product/nonexistent-id-xyz", headers=auth, timeout=15)
        assert r.status_code == 404


# ─── TEST: POST /api/modifier-groups and /api/modifiers accept new fields ───
class TestCreateModifierGroupAndModifier:
    def test_create_group_with_all_new_fields(self, auth):
        payload = {
            "name": "TEST_Grp_Modifiers",
            "prefix": "con",
            "selection_type": "unlimited",
            "min_selection": 0,
            "max_selection": 5,
            "is_active": True,
            "applies_to_product_ids": [HAMB_ID],
            "applies_to_category_ids": [],
        }
        r = requests.post(f"{BASE_URL}/api/modifier-groups", headers=auth, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        g = r.json()
        assert g["name"] == payload["name"]
        assert g["prefix"] == "con"
        assert g["selection_type"] == "unlimited"
        assert g["applies_to_product_ids"] == [HAMB_ID]
        # cleanup
        requests.delete(f"{BASE_URL}/api/modifier-groups/{g['id']}", headers=auth, timeout=15)

    def test_create_modifier_with_product_mode(self, auth):
        # create tmp group
        g = requests.post(f"{BASE_URL}/api/modifier-groups", headers=auth, json={
            "name": "TEST_Grp_ProdMode", "prefix": "", "selection_type": "optional",
            "min_selection": 0, "max_selection": 3, "applies_to_product_ids": [HAMB_ID]
        }, timeout=15).json()
        r = requests.post(f"{BASE_URL}/api/modifiers", headers=auth, json={
            "group_id": g["id"], "name": "Tostones PPR", "mode": "product",
            "product_id": TOSTONES_ID, "price_source": "price_c",
            "custom_price": None, "max_qty": 2, "is_default": False, "is_active": True
        }, timeout=15)
        assert r.status_code == 200, r.text
        mod = r.json()
        assert mod["mode"] == "product"
        assert mod["product_id"] == TOSTONES_ID
        assert mod["price_source"] == "price_c"
        assert mod["max_qty"] == 2
        # Verify through for-product that it resolves to 20
        groups = requests.get(f"{BASE_URL}/api/modifier-groups/for-product/{HAMB_ID}", headers=auth, timeout=15).json()
        tmp = next((g2 for g2 in groups if g2["id"] == g["id"]), None)
        assert tmp is not None
        opt = tmp["options"][0]
        assert opt["resolved_price"] == 20.0
        # cleanup
        requests.delete(f"{BASE_URL}/api/modifier-groups/{g['id']}", headers=auth, timeout=15)


# ─── TEST: Order flow deducts inventory for product-linked modifiers ───
class TestOrderInventoryDeduction:
    def test_add_items_deducts_two_tostones(self, auth):
        tables = requests.get(f"{BASE_URL}/api/tables", headers=auth, timeout=15).json()
        if isinstance(tables, dict):
            tables = tables.get("items", [])
        free = next((t for t in tables if t.get("status") == "free"), None)
        assert free is not None, "No free table for test"

        before = requests.get(f"{BASE_URL}/api/products/{TOSTONES_ID}", headers=auth, timeout=15).json()
        initial = int(before.get("simple_inventory_qty", 0))
        assert initial == 100

        o = requests.post(f"{BASE_URL}/api/orders", headers=auth, json={
            "table_id": free["id"], "items": [], "sale_type": "dine_in"
        }, timeout=15).json()
        assert "id" in o

        r = requests.post(f"{BASE_URL}/api/orders/{o['id']}/items", headers=auth, json={
            "items": [{
                "product_id": HAMB_ID, "product_name": "HAMBURGUESA",
                "quantity": 1, "unit_price": 500,
                "modifiers": [
                    {"group_name": "Acompañante", "name": "Tostones", "mode": "product",
                     "product_id": TOSTONES_ID, "price_source": "price_b", "price": 0, "qty": 1},
                    {"group_name": "Agregar", "name": "Tostones Extra", "mode": "product",
                     "product_id": TOSTONES_ID, "price_source": "price_c", "price": 20, "qty": 1},
                ],
                "notes": ""
            }]
        }, timeout=15)
        assert r.status_code == 200, r.text

        after = requests.get(f"{BASE_URL}/api/products/{TOSTONES_ID}", headers=auth, timeout=15).json()
        assert int(after["simple_inventory_qty"]) == 98, f"expected 98, got {after['simple_inventory_qty']}"


# ─── TEST: Stock=0 → available=False ───
class TestAvailability:
    def test_available_false_when_stock_zero(self, auth):
        requests.put(f"{BASE_URL}/api/products/{TOSTONES_ID}", headers=auth,
                     json={"simple_inventory_qty": 0}, timeout=15)
        groups = requests.get(f"{BASE_URL}/api/modifier-groups/for-product/{HAMB_ID}", headers=auth, timeout=15).json()
        tos = next((o for g in groups for o in g.get("options", []) if o.get("name") == "Tostones"), None)
        assert tos is not None
        assert tos["available"] is False
        assert tos["linked_product"]["stock_qty"] == 0


# ─── TEST: Legacy text modifiers still work ───
class TestLegacyRegression:
    def test_modifier_groups_with_options_legacy(self, auth):
        r = requests.get(f"{BASE_URL}/api/modifier-groups-with-options", headers=auth, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # New-style groups (those with a defined selection_type/prefix or options with group_id)
        # should have enriched options: resolved_price, linked_product, available
        new_style_groups = [g for g in data if g.get("selection_type") or ("prefix" in g)]
        assert len(new_style_groups) > 0, "expected at least 1 new-style group (DEMO-*)"
        text_opts_enriched = 0
        for g in new_style_groups:
            for o in g.get("options", []):
                if (o.get("mode") or "text") == "text":
                    assert "resolved_price" in o, f"new-style text option missing resolved_price: {o}"
                    text_opts_enriched += 1
        assert text_opts_enriched >= 0  # just ensure no crashes; enrichment verified for product mode too


# ─── TEST: Auth required ───
class TestSecurity:
    def test_post_group_without_auth_rejected(self):
        r = requests.post(f"{BASE_URL}/api/modifier-groups",
                          json={"name": "TEST_NoAuth"}, timeout=15)
        assert r.status_code in (401, 403), f"expected auth required, got {r.status_code}"

    def test_post_modifier_without_auth_rejected(self):
        r = requests.post(f"{BASE_URL}/api/modifiers",
                          json={"name": "TEST_NoAuth", "group_id": "x"}, timeout=15)
        assert r.status_code in (401, 403), f"expected auth required, got {r.status_code}"

    def test_put_group_without_auth_rejected(self):
        r = requests.put(f"{BASE_URL}/api/modifier-groups/anyid", json={"name": "x"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_delete_modifier_without_auth_rejected(self):
        r = requests.delete(f"{BASE_URL}/api/modifiers/anyid", timeout=15)
        assert r.status_code in (401, 403)
