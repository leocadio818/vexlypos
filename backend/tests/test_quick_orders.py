"""End-to-end backend tests for Quick Orders (Orden Rápida) feature."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
ADMIN_PIN = "11338585"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def product(client):
    r = client.get(f"{BASE_URL}/api/products", timeout=15)
    assert r.status_code == 200
    prods = [p for p in r.json() if p.get("active") and p.get("price", 0) > 0]
    assert prods, "No active products"
    return prods[0]


# ── 1. Create with name
def test_create_quick_order_with_name(client):
    r = client.post(f"{BASE_URL}/api/orders/quick", json={"customer_name": "Carlos"}, timeout=15)
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["is_quick_order"] is True
    assert o["quick_order_name"] == "Carlos"
    assert o["quick_order_status"] == "preparing"
    assert o["sale_type"] == "takeout"
    assert o.get("table_id") is None
    assert isinstance(o["quick_order_number"], int) and o["quick_order_number"] >= 1


# ── 2. Create without name
def test_create_quick_order_without_name(client):
    r1 = client.post(f"{BASE_URL}/api/orders/quick", json={"customer_name": "RefName"}, timeout=15)
    n1 = r1.json()["quick_order_number"]
    r2 = client.post(f"{BASE_URL}/api/orders/quick", json={}, timeout=15)
    assert r2.status_code == 200
    o = r2.json()
    assert o["quick_order_name"] is None
    assert o["quick_order_number"] == n1 + 1


# ── 3. List active sorted by quick_order_number asc
def test_list_active_quick_orders(client):
    r = client.get(f"{BASE_URL}/api/orders/quick/active", timeout=15)
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list)
    nums = [o["quick_order_number"] for o in lst]
    assert nums == sorted(nums)
    for o in lst:
        assert o["quick_order_status"] in ("preparing", "paid")
        assert o["is_quick_order"] is True


# ── 4. Invalid status -> 400
def test_invalid_status_returns_400(client):
    r = client.post(f"{BASE_URL}/api/orders/quick", json={}, timeout=15)
    oid = r.json()["id"]
    r2 = client.patch(f"{BASE_URL}/api/orders/quick/{oid}/status", json={"status": "foo"}, timeout=15)
    assert r2.status_code == 400


# ── 5. Non-existent id -> 404
def test_status_nonexistent_returns_404(client):
    r = client.patch(f"{BASE_URL}/api/orders/quick/nonexistent-id/status", json={"status": "delivered"}, timeout=15)
    assert r.status_code == 404


# ── 6. Patch to delivered removes from active list
def test_patch_delivered_removes_from_active(client):
    r = client.post(f"{BASE_URL}/api/orders/quick", json={"customer_name": "ToDeliver"}, timeout=15)
    oid = r.json()["id"]
    p = client.patch(f"{BASE_URL}/api/orders/quick/{oid}/status", json={"status": "delivered"}, timeout=15)
    assert p.status_code == 200
    lst = client.get(f"{BASE_URL}/api/orders/quick/active", timeout=15).json()
    assert all(o["id"] != oid for o in lst)


# ── 7. Full payment flow: items -> bill -> pay -> auto status=paid -> delivered
def test_payment_flips_quick_status_to_paid(client, product):
    # Create QO with name
    r = client.post(f"{BASE_URL}/api/orders/quick", json={"customer_name": "PayFlow"}, timeout=15)
    assert r.status_code == 200
    qo = r.json()
    oid = qo["id"]
    qnum = qo["quick_order_number"]

    # Add items
    item = {
        "product_id": product["id"],
        "product_name": product["name"],
        "quantity": 1,
        "unit_price": float(product["price"]),
        "modifiers": [], "notes": ""
    }
    ar = client.post(f"{BASE_URL}/api/orders/{oid}/items", json={"items": [item]}, timeout=15)
    assert ar.status_code == 200, ar.text

    # Create bill (table_id=null allowed)
    br = client.post(f"{BASE_URL}/api/bills", json={"order_id": oid, "table_id": None}, timeout=15)
    assert br.status_code == 200, br.text
    bill = br.json()
    bill_id = bill["id"]

    # Quick order metadata in bill
    assert bill.get("is_quick_order") is True
    assert bill.get("quick_order_number") == qnum
    assert bill.get("quick_order_name") == "PayFlow"
    expected_label = f"Orden Rápida #{str(qnum).zfill(2)} — PayFlow"
    assert bill["label"] == expected_label, f"Got label: {bill['label']}"

    # Pay
    pmts = client.get(f"{BASE_URL}/api/payment-methods", timeout=15).json()
    cash = next((p for p in pmts if p.get("is_cash")), pmts[0])
    pay = client.post(
        f"{BASE_URL}/api/bills/{bill_id}/pay",
        json={"payment_method": "cash", "payment_method_id": cash["id"], "amount_received": bill["total"]},
        timeout=20
    )
    assert pay.status_code == 200, pay.text

    # Order should be closed and quick_order_status='paid'
    od = client.get(f"{BASE_URL}/api/orders/{oid}", timeout=15).json()
    assert od["status"] == "closed"
    assert od["quick_order_status"] == "paid"

    # Still in active list (paid is included)
    active = client.get(f"{BASE_URL}/api/orders/quick/active", timeout=15).json()
    assert any(o["id"] == oid and o["quick_order_status"] == "paid" for o in active)

    # Mark delivered
    d = client.patch(f"{BASE_URL}/api/orders/quick/{oid}/status", json={"status": "delivered"}, timeout=15)
    assert d.status_code == 200
    active2 = client.get(f"{BASE_URL}/api/orders/quick/active", timeout=15).json()
    assert all(o["id"] != oid for o in active2)


# ── 8. Bill label without name => "#NN"
def test_bill_label_without_name(client, product):
    r = client.post(f"{BASE_URL}/api/orders/quick", json={}, timeout=15)
    qo = r.json()
    oid = qo["id"]
    qnum = qo["quick_order_number"]
    item = {"product_id": product["id"], "product_name": product["name"],
            "quantity": 1, "unit_price": float(product["price"]),
            "modifiers": [], "notes": ""}
    client.post(f"{BASE_URL}/api/orders/{oid}/items", json={"items": [item]}, timeout=15)
    br = client.post(f"{BASE_URL}/api/bills", json={"order_id": oid, "table_id": None}, timeout=15)
    assert br.status_code == 200
    bill = br.json()
    assert bill["label"] == f"Orden Rápida #{str(qnum).zfill(2)}"
    assert bill.get("quick_order_name") is None
