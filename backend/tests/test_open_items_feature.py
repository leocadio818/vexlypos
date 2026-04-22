"""Open Items (Artículos Libres) end-to-end backend tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    import subprocess
    BASE_URL = subprocess.check_output(
        ["bash", "-lc", "grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2"]
    ).decode().strip()

ADMIN_PIN = "11338585"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─── PERMISSIONS ───

class TestPermissions:
    def test_permission_in_all_list(self, H):
        # actual route is /api/permissions/all (auth router has no /auth prefix for this endpoint)
        r = requests.get(f"{BASE_URL}/api/permissions/all", headers=H)
        assert r.status_code == 200
        perms = r.json()
        assert "create_open_items" in perms
        assert "Artículos Libres" in perms["create_open_items"] or "Libres" in perms["create_open_items"]

    def test_verify_pin_valid_with_permission(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/verify-pin",
            json={"pin": ADMIN_PIN, "required_permission": "create_open_items"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert "user_id" in data
        assert "user_name" in data

    def test_verify_pin_invalid(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/verify-pin",
            json={"pin": "00000000", "required_permission": "create_open_items"},
        )
        assert r.status_code == 200
        assert r.json()["ok"] is False

    def test_verify_pin_without_permission_returns_false(self):
        # Mesero Carlos PIN=100 — shouldn't have create_open_items
        r = requests.post(
            f"{BASE_URL}/api/auth/verify-pin",
            json={"pin": "100", "required_permission": "create_open_items"},
        )
        assert r.status_code == 200
        # either ok:false (no permission) or ok:true if role granted — verify behavior
        # Expected: mesero does NOT have create_open_items by default
        assert r.json()["ok"] is False


# ─── CONFIG ───

class TestOpenItemsConfig:
    def test_get_config(self, H):
        r = requests.get(f"{BASE_URL}/api/open-items/config", headers=H)
        assert r.status_code == 200
        cfg = r.json()
        assert "enabled" in cfg
        assert "require_supervisor" in cfg
        assert "price_limit_rd" in cfg
        assert "channels_available" in cfg

    def test_put_config_persists(self, H):
        payload = {
            "enabled": True,
            "require_supervisor": False,
            "price_limit_rd": 1500,
            "channels_available": ["kitchen", "bar"],
        }
        r = requests.put(f"{BASE_URL}/api/open-items/config", headers=H, json=payload)
        assert r.status_code == 200
        cfg = requests.get(f"{BASE_URL}/api/open-items/config", headers=H).json()
        assert cfg["price_limit_rd"] == 1500
        assert cfg["require_supervisor"] is False
        assert cfg["enabled"] is True
        # reset
        requests.put(
            f"{BASE_URL}/api/open-items/config", headers=H,
            json={"enabled": True, "require_supervisor": False, "price_limit_rd": 1000, "channels_available": ["kitchen", "bar"]},
        )


# ─── ORDER + BILL + TAX + REPORT + INVENTORY ───

@pytest.fixture(scope="module")
def paid_bill_with_open_items(H):
    # find free table
    tables = requests.get(f"{BASE_URL}/api/tables", headers=H).json()
    if isinstance(tables, dict):
        tables = tables.get("items", tables.get("tables", []))
    free = next(t for t in tables if t.get("status") == "free")

    # create order
    o = requests.post(
        f"{BASE_URL}/api/orders", headers=H,
        json={"table_id": free["id"], "items": [], "sale_type": "dine_in"},
    ).json()
    order_id = o["id"]

    # kitchen open item (taxed)
    r = requests.post(
        f"{BASE_URL}/api/orders/{order_id}/items", headers=H,
        json={"items": [{
            "product_id": None,
            "product_name": "[LIBRE] TEST_Pasta especial",
            "quantity": 1,
            "unit_price": 350,
            "modifiers": [],
            "notes": "kitchen_unique",
            "is_open_item": True,
            "open_item_channel": "kitchen",
            "indicator_bien_servicio": 1,
            "tax_exempt": False,
            "kitchen_note": "Con limón",
            "created_by_name": "Admin",
        }]},
    )
    assert r.status_code == 200, r.text

    # bar open item (tax exempt) — use DIFFERENT notes to avoid incorrect merge (backend merges by product_id=None+notes+modifiers)
    r = requests.post(
        f"{BASE_URL}/api/orders/{order_id}/items", headers=H,
        json={"items": [{
            "product_id": None,
            "product_name": "[LIBRE] TEST_Cocktail chef",
            "quantity": 1,
            "unit_price": 200,
            "modifiers": [],
            "notes": "bar_unique",
            "is_open_item": True,
            "open_item_channel": "bar",
            "indicator_bien_servicio": 2,
            "tax_exempt": True,
            "kitchen_note": "",
            "created_by_name": "Admin",
        }]},
    )
    assert r.status_code == 200, r.text

    # create bill
    bill = requests.post(
        f"{BASE_URL}/api/bills", headers=H,
        json={"order_id": order_id, "table_id": free["id"], "item_ids": []},
    ).json()
    bill_id = bill["id"]

    # pay bill (cash) — need payment_method_id
    pms = requests.get(f"{BASE_URL}/api/payment-methods", headers=H).json()
    cash = next(p for p in pms if p.get("is_cash"))
    total = bill["total"]
    pay = requests.post(
        f"{BASE_URL}/api/bills/{bill_id}/pay", headers=H,
        json={"payments": [{"payment_method_id": cash["id"], "method": "cash", "amount": total}], "tip_amount": 0},
    )
    assert pay.status_code == 200, pay.text

    return {"order_id": order_id, "bill_id": bill_id, "bill": bill}


class TestOrderAndBill:
    def test_order_persists_open_item_fields(self, H, paid_bill_with_open_items):
        order_id = paid_bill_with_open_items["order_id"]
        o = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=H).json()
        open_items = [i for i in o["items"] if i.get("is_open_item")]
        assert len(open_items) == 2
        kitchen = next(i for i in open_items if i.get("open_item_channel") == "kitchen")
        bar = next(i for i in open_items if i.get("open_item_channel") == "bar")
        assert kitchen["product_id"] is None
        assert kitchen["tax_exempt"] is False
        assert kitchen["kitchen_note"] == "Con limón"
        assert kitchen["indicator_bien_servicio"] == 1
        assert kitchen["created_by_name"] == "Admin"
        assert bar["tax_exempt"] is True
        assert bar["indicator_bien_servicio"] == 2

    def test_bill_subtotal_and_itbis(self, paid_bill_with_open_items):
        bill = paid_bill_with_open_items["bill"]
        # 350 + 200
        assert bill["subtotal"] == 550.0
        # ITBIS 18% only of 350 (the taxed item)
        itbis_breakdown = [t for t in bill.get("tax_breakdown", []) if t.get("tax_id") == "itbis_default"]
        assert len(itbis_breakdown) == 1
        assert itbis_breakdown[0]["taxable_base"] == 350.0
        assert itbis_breakdown[0]["amount"] == 63.0


class TestOpenItemsReport:
    def test_report_includes_open_items(self, H, paid_bill_with_open_items):
        r = requests.get(f"{BASE_URL}/api/reports/open-items", headers=H)
        assert r.status_code == 200
        data = r.json()
        rows = data.get("rows", [])
        # at least our 2 TEST_ rows should appear
        test_rows = [r for r in rows if "TEST_" in r.get("description", "")]
        assert len(test_rows) >= 2
        sample = test_rows[0]
        # description must not contain [LIBRE]
        assert "[LIBRE]" not in sample["description"]
        assert "description" in sample
        assert "channel" in sample
        assert "tax_exempt" in sample
        assert "kitchen_note" in sample
        assert "created_by_name" in sample
        assert "total" in sample
        assert data["count"] >= 2
        assert data["total_sold"] >= 2
        assert data["total_revenue"] >= 550.0


class TestInventoryNotDeducted:
    def test_open_item_does_not_decrement_inventory(self, H):
        """Open items have product_id=None, so inventory decrement should be skipped (no crash)."""
        # find a free table
        tables = requests.get(f"{BASE_URL}/api/tables", headers=H).json()
        if isinstance(tables, dict):
            tables = tables.get("items", tables.get("tables", []))
        free = next(t for t in tables if t.get("status") == "free")
        o = requests.post(
            f"{BASE_URL}/api/orders", headers=H,
            json={"table_id": free["id"], "items": [], "sale_type": "dine_in"},
        ).json()
        r = requests.post(
            f"{BASE_URL}/api/orders/{o['id']}/items", headers=H,
            json={"items": [{
                "product_id": None,
                "product_name": "[LIBRE] TEST_inv_check",
                "quantity": 3,
                "unit_price": 100,
                "modifiers": [],
                "is_open_item": True,
                "open_item_channel": "kitchen",
                "indicator_bien_servicio": 1,
                "tax_exempt": False,
                "kitchen_note": "",
                "created_by_name": "Admin",
            }]},
        )
        # If inventory decrement crashed on None product_id, we'd see 500
        assert r.status_code == 200, r.text
        # cleanup: cancel order
        requests.post(f"{BASE_URL}/api/orders/{o['id']}/cancel", headers=H, json={"reason": "TEST cleanup"})


class TestSendKitchenRouting:
    def test_send_kitchen_accepts_open_items(self, H):
        tables = requests.get(f"{BASE_URL}/api/tables", headers=H).json()
        if isinstance(tables, dict):
            tables = tables.get("items", tables.get("tables", []))
        free = next(t for t in tables if t.get("status") == "free")
        o = requests.post(
            f"{BASE_URL}/api/orders", headers=H,
            json={"table_id": free["id"], "items": [], "sale_type": "dine_in"},
        ).json()
        requests.post(
            f"{BASE_URL}/api/orders/{o['id']}/items", headers=H,
            json={"items": [
                {"product_id": None, "product_name": "[LIBRE] TEST_k", "quantity": 1, "unit_price": 100,
                 "modifiers": [], "is_open_item": True, "open_item_channel": "kitchen",
                 "indicator_bien_servicio": 1, "tax_exempt": False, "kitchen_note": "★ urgente", "created_by_name": "Admin"},
                {"product_id": None, "product_name": "[LIBRE] TEST_b", "quantity": 1, "unit_price": 80,
                 "modifiers": [], "is_open_item": True, "open_item_channel": "bar",
                 "indicator_bien_servicio": 2, "tax_exempt": True, "kitchen_note": "", "created_by_name": "Admin"},
            ]},
        )
        r = requests.post(f"{BASE_URL}/api/orders/{o['id']}/send-kitchen", headers=H)
        assert r.status_code == 200, r.text
        # cleanup
        requests.post(f"{BASE_URL}/api/orders/{o['id']}/cancel", headers=H, json={"reason": "TEST cleanup"})
