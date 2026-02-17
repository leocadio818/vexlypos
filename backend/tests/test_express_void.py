"""
Express Void & Audit Protocol Tests
Tests the conditional void system:
1. EXPRESS VOID: For pending items (no reason, no PIN, no inventory)
2. AUDIT PROTOCOL: For sent items (requires reason, may require PIN, affects inventory)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
TABLE_2_ID = "e4690097-74dd-4246-aa14-f0adcd4a9e8b"

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token using Admin PIN"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "100"})
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("access_token") or response.json().get("token")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestExpressVoidBackend:
    """Test Express Void functionality - pending items only"""
    
    def test_express_void_pending_item_success(self, auth_headers):
        """Express void should succeed for pending items"""
        # Get orders for Table 2
        orders_res = requests.get(f"{BASE_URL}/api/tables/{TABLE_2_ID}/orders", headers=auth_headers)
        assert orders_res.status_code == 200, f"Failed to get orders: {orders_res.text}"
        
        orders = orders_res.json()
        if not orders:
            pytest.skip("No active orders on Table 2")
        
        order = orders[0]
        order_id = order["id"]
        
        # First add a pending item to test
        add_res = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/items",
            headers=auth_headers,
            json={
                "items": [{
                    "product_id": "test-express-void-product",
                    "product_name": "Express Void Test Item",
                    "quantity": 1,
                    "unit_price": 100,
                    "modifiers": [],
                    "notes": "Test item for express void"
                }]
            }
        )
        assert add_res.status_code == 200, f"Failed to add test item: {add_res.text}"
        
        updated_order = add_res.json()
        pending_items = [i for i in updated_order.get("items", []) if i.get("status") == "pending"]
        assert len(pending_items) > 0, "No pending items after adding test item"
        
        pending_item = pending_items[-1]  # Get the last added pending item
        
        # Test express void
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-items",
            headers=auth_headers,
            json={
                "item_ids": [pending_item["id"]],
                "express_void": True,
                "reason_id": None,
                "return_to_inventory": False,
                "comments": "Test Express Void"
            }
        )
        
        assert response.status_code == 200, f"Express void failed: {response.text}"
        result = response.json()
        
        # Verify item was cancelled with express_void flag
        cancelled_item = next((i for i in result.get("items", []) if i["id"] == pending_item["id"]), None)
        assert cancelled_item is not None, "Item not found after express void"
        assert cancelled_item["status"] == "cancelled", "Item not cancelled"
        assert cancelled_item.get("express_void") == True, "express_void flag not set"
        print(f"✅ PASS: Express void succeeded for pending item '{pending_item['product_name']}'")
    
    def test_express_void_fails_for_sent_item(self, auth_headers):
        """Express void should fail with 400 for items already sent to kitchen"""
        # Get orders for Table 2
        orders_res = requests.get(f"{BASE_URL}/api/tables/{TABLE_2_ID}/orders", headers=auth_headers)
        if orders_res.status_code != 200:
            pytest.skip("Could not get orders")
        
        orders = orders_res.json()
        if not orders:
            pytest.skip("No active orders")
        
        order = orders[0]
        order_id = order["id"]
        items = order.get("items", [])
        
        # Find a sent item (not cancelled)
        sent_items = [i for i in items if (i.get("status") == "sent" or i.get("sent_to_kitchen")) and i.get("status") != "cancelled"]
        
        if not sent_items:
            pytest.skip("No sent items available - need sent item to test")
        
        sent_item = sent_items[0]
        
        # Try express void on sent item - should fail
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-items",
            headers=auth_headers,
            json={
                "item_ids": [sent_item["id"]],
                "express_void": True,
                "reason_id": None,
                "return_to_inventory": False,
                "comments": "Trying Express Void on sent item"
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for sent item, got {response.status_code}: {response.text}"
        error = response.json()
        assert "detail" in error, "Error should have detail field"
        print(f"✅ PASS: Express void correctly rejected for sent item with 400: {error.get('detail')}")


class TestAuditProtocolBackend:
    """Test Audit Protocol - for sent items requiring reason and possibly PIN"""
    
    def test_audit_cancel_sent_item_with_reason(self, auth_headers):
        """Audit protocol should succeed for sent items with valid reason"""
        # Get orders for Table 2
        orders_res = requests.get(f"{BASE_URL}/api/tables/{TABLE_2_ID}/orders", headers=auth_headers)
        if orders_res.status_code != 200:
            pytest.skip("Could not get orders")
        
        orders = orders_res.json()
        if not orders:
            pytest.skip("No active orders")
        
        order = orders[0]
        order_id = order["id"]
        items = order.get("items", [])
        
        # Find a sent item (not cancelled)
        sent_items = [i for i in items if (i.get("status") == "sent" or i.get("sent_to_kitchen")) and i.get("status") != "cancelled"]
        
        if not sent_items:
            pytest.skip("No sent items available for audit test")
        
        # Get cancellation reasons
        reasons_res = requests.get(f"{BASE_URL}/api/cancellation-reasons", headers=auth_headers)
        assert reasons_res.status_code == 200, f"Failed to get reasons: {reasons_res.text}"
        reasons = reasons_res.json()
        
        if not reasons:
            pytest.skip("No cancellation reasons configured")
        
        # Use a reason that doesn't require manager auth
        reason = next((r for r in reasons if not r.get("requires_manager_auth", False)), None)
        if not reason:
            pytest.skip("No cancellation reason without manager auth requirement")
        sent_item = sent_items[0]
        
        # Cancel with audit protocol (express_void=false)
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-items",
            headers=auth_headers,
            json={
                "item_ids": [sent_item["id"]],
                "express_void": False,
                "reason_id": reason["id"],
                "return_to_inventory": True,
                "comments": "Audit Protocol Test"
            }
        )
        
        assert response.status_code == 200, f"Audit cancel failed: {response.text}"
        result = response.json()
        
        cancelled_item = next((i for i in result.get("items", []) if i["id"] == sent_item["id"]), None)
        assert cancelled_item is not None, "Item not found after audit cancel"
        assert cancelled_item["status"] == "cancelled", "Item not cancelled"
        assert cancelled_item.get("cancelled_reason_id") == reason["id"], "Reason not recorded"
        print(f"✅ PASS: Audit protocol cancel succeeded for sent item '{sent_item['product_name']}'")


class TestCancellationReasons:
    """Verify cancellation reasons endpoint"""
    
    def test_get_cancellation_reasons(self, auth_headers):
        """Should return list of cancellation reasons"""
        response = requests.get(f"{BASE_URL}/api/cancellation-reasons", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to get reasons: {response.text}"
        reasons = response.json()
        assert isinstance(reasons, list), "Response should be a list"
        print(f"✅ PASS: Got {len(reasons)} cancellation reasons")
        
        if reasons:
            for reason in reasons[:3]:
                print(f"  - {reason.get('name')} (requires_manager: {reason.get('requires_manager_auth', False)})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
