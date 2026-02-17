"""
Express Void & Audit Protocol Tests
Tests the conditional void system:
1. EXPRESS VOID: For pending items (no reason, no PIN, no inventory)
2. AUDIT PROTOCOL: For sent items (requires reason, may require PIN, affects inventory)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token using Admin PIN"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "100"})
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("access_token")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }

@pytest.fixture
def table_2_order(auth_headers):
    """Get order from Table 2 which should have pending and sent items"""
    # First get table 2
    tables_res = requests.get(f"{BASE_URL}/api/tables", headers=auth_headers)
    assert tables_res.status_code == 200
    tables = tables_res.json()
    table_2 = next((t for t in tables if t.get("number") == 2), None)
    
    if not table_2:
        pytest.skip("Table 2 not found")
    
    # Get orders for table 2
    orders_res = requests.get(f"{BASE_URL}/api/tables/{table_2['id']}/orders", headers=auth_headers)
    if orders_res.status_code == 200:
        orders = orders_res.json()
        if orders and len(orders) > 0:
            return orders[0]
    
    pytest.skip("No active order on Table 2")

class TestExpressVoidBackend:
    """Test Express Void functionality - pending items only"""
    
    def test_express_void_pending_item_success(self, auth_headers, table_2_order):
        """Express void should succeed for pending items"""
        order_id = table_2_order["id"]
        items = table_2_order.get("items", [])
        
        # Find a pending item
        pending_items = [i for i in items if i.get("status") == "pending" and not i.get("sent_to_kitchen")]
        
        if not pending_items:
            # Create a new pending item for testing
            add_item_res = requests.post(
                f"{BASE_URL}/api/orders/{order_id}/items",
                headers=auth_headers,
                json={
                    "items": [{
                        "product_id": "test-product-express",
                        "product_name": "Test Express Void Item",
                        "quantity": 1,
                        "unit_price": 100,
                        "modifiers": [],
                        "notes": ""
                    }]
                }
            )
            assert add_item_res.status_code == 200, f"Failed to add test item: {add_item_res.text}"
            order_data = add_item_res.json()
            pending_items = [i for i in order_data.get("items", []) if i.get("status") == "pending"]
        
        if not pending_items:
            pytest.skip("No pending items available")
        
        pending_item = pending_items[0]
        
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
        updated_order = response.json()
        
        # Verify item was cancelled
        cancelled_item = next((i for i in updated_order.get("items", []) if i["id"] == pending_item["id"]), None)
        assert cancelled_item is not None
        assert cancelled_item["status"] == "cancelled"
        assert cancelled_item.get("express_void") == True
        print(f"PASS: Express void succeeded for pending item {pending_item['product_name']}")
    
    def test_express_void_fails_for_sent_item(self, auth_headers, table_2_order):
        """Express void should fail with 400 for items already sent to kitchen"""
        order_id = table_2_order["id"]
        items = table_2_order.get("items", [])
        
        # Find a sent item
        sent_items = [i for i in items if i.get("status") == "sent" or i.get("sent_to_kitchen")]
        
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
        
        assert response.status_code == 400, f"Expected 400 for sent item, got {response.status_code}"
        error = response.json()
        assert "pendientes" in error.get("detail", "").lower() or "audit" in error.get("detail", "").lower(), \
            f"Error message should mention pending items or audit protocol: {error}"
        print(f"PASS: Express void correctly rejected for sent item with 400: {error.get('detail')}")


class TestAuditProtocolBackend:
    """Test Audit Protocol - for sent items requiring reason and possibly PIN"""
    
    def test_audit_cancel_sent_item_with_reason(self, auth_headers, table_2_order):
        """Audit protocol should succeed for sent items with valid reason"""
        order_id = table_2_order["id"]
        items = table_2_order.get("items", [])
        
        # Find a sent item
        sent_items = [i for i in items if (i.get("status") == "sent" or i.get("sent_to_kitchen")) and i.get("status") != "cancelled"]
        
        if not sent_items:
            pytest.skip("No sent items available for audit test")
        
        # Get cancellation reasons
        reasons_res = requests.get(f"{BASE_URL}/api/cancellation-reasons", headers=auth_headers)
        assert reasons_res.status_code == 200
        reasons = reasons_res.json()
        
        if not reasons:
            pytest.skip("No cancellation reasons configured")
        
        reason = reasons[0]  # Use first reason
        sent_item = sent_items[0]
        
        # Cancel with audit protocol (non-express)
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
        updated_order = response.json()
        
        cancelled_item = next((i for i in updated_order.get("items", []) if i["id"] == sent_item["id"]), None)
        assert cancelled_item is not None
        assert cancelled_item["status"] == "cancelled"
        assert cancelled_item.get("cancelled_reason_id") == reason["id"]
        print(f"PASS: Audit protocol cancel succeeded for sent item {sent_item['product_name']}")


class TestMixedItemsVoid:
    """Test behavior when trying to void mix of pending and sent items"""
    
    def test_express_void_mixed_items_fails(self, auth_headers, table_2_order):
        """Express void should fail if any item is sent"""
        order_id = table_2_order["id"]
        items = table_2_order.get("items", [])
        
        pending_items = [i for i in items if i.get("status") == "pending" and i.get("status") != "cancelled"]
        sent_items = [i for i in items if i.get("status") == "sent" and i.get("status") != "cancelled"]
        
        if not pending_items or not sent_items:
            pytest.skip("Need both pending and sent items for this test")
        
        # Mix both pending and sent items
        mixed_ids = [pending_items[0]["id"], sent_items[0]["id"]]
        
        response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-items",
            headers=auth_headers,
            json={
                "item_ids": mixed_ids,
                "express_void": True,
                "reason_id": None,
                "return_to_inventory": False,
                "comments": "Testing mixed items"
            }
        )
        
        # Should fail because one item is sent
        assert response.status_code == 400, f"Expected 400 for mixed items, got {response.status_code}"
        print("PASS: Express void correctly rejected for mixed pending+sent items")


class TestCancellationReasons:
    """Verify cancellation reasons endpoint"""
    
    def test_get_cancellation_reasons(self, auth_headers):
        """Should return list of cancellation reasons"""
        response = requests.get(f"{BASE_URL}/api/cancellation-reasons", headers=auth_headers)
        
        assert response.status_code == 200, f"Failed to get reasons: {response.text}"
        reasons = response.json()
        assert isinstance(reasons, list)
        print(f"PASS: Got {len(reasons)} cancellation reasons")
        
        if reasons:
            for reason in reasons[:3]:
                print(f"  - {reason.get('name')} (requires_manager: {reason.get('requires_manager_auth', False)})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
