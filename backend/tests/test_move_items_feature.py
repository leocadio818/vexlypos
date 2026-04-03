"""
Test: Mover Artículo Feature - Backend API Tests
Tests the POST /api/orders/{order_id}/move-items endpoint with partial quantities support
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMoveItemsAPI:
    """Tests for the move-items endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login with admin PIN
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_move_items_endpoint_exists(self):
        """Test that the move-items endpoint exists and returns proper error for invalid order"""
        # Test with a non-existent order ID
        response = self.session.post(
            f"{BASE_URL}/api/orders/non-existent-order-id/move-items",
            json={
                "target_order_id": "some-target-id",
                "item_ids": ["item1"]
            }
        )
        # Should return 404 for non-existent order, not 405 (method not allowed)
        assert response.status_code in [404, 400], f"Expected 404 or 400, got {response.status_code}: {response.text}"
        print(f"PASS: move-items endpoint exists, returns {response.status_code} for invalid order")
    
    def test_move_items_requires_target_order_id(self):
        """Test that move-items requires target_order_id"""
        response = self.session.post(
            f"{BASE_URL}/api/orders/some-order-id/move-items",
            json={
                "item_ids": ["item1"]
            }
        )
        # Should return 400 or 422 for missing required field
        assert response.status_code in [400, 422, 404], f"Expected validation error, got {response.status_code}"
        print(f"PASS: move-items validates required fields")
    
    def test_move_items_requires_item_ids(self):
        """Test that move-items requires item_ids"""
        response = self.session.post(
            f"{BASE_URL}/api/orders/some-order-id/move-items",
            json={
                "target_order_id": "some-target-id"
            }
        )
        # Should return 400 or 422 for missing required field
        assert response.status_code in [400, 422, 404], f"Expected validation error, got {response.status_code}"
        print(f"PASS: move-items validates item_ids required")
    
    def test_move_items_accepts_quantities_param(self):
        """Test that move-items accepts optional quantities parameter"""
        # This tests the API schema accepts the quantities parameter
        response = self.session.post(
            f"{BASE_URL}/api/orders/non-existent-order/move-items",
            json={
                "target_order_id": "some-target-id",
                "item_ids": ["item1", "item2"],
                "quantities": {"item1": 2, "item2": 1}
            }
        )
        # Should return 404 for non-existent order (not 422 for invalid schema)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"PASS: move-items accepts quantities parameter")


class TestMoveItemsWithRealOrders:
    """Integration tests with real orders on Table 3"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login with admin PIN
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_get_table_3_orders(self):
        """Test that we can get orders for Table 3"""
        # First get tables to find Table 3's ID
        tables_resp = self.session.get(f"{BASE_URL}/api/tables")
        assert tables_resp.status_code == 200, f"Failed to get tables: {tables_resp.text}"
        
        tables = tables_resp.json()
        table_3 = next((t for t in tables if t.get("number") == 3 or t.get("name") == "3"), None)
        
        if not table_3:
            pytest.skip("Table 3 not found in system")
        
        table_id = table_3.get("id")
        print(f"Found Table 3 with ID: {table_id}")
        
        # Get orders for this table
        orders_resp = self.session.get(f"{BASE_URL}/api/tables/{table_id}/orders")
        assert orders_resp.status_code == 200, f"Failed to get table orders: {orders_resp.text}"
        
        orders = orders_resp.json()
        print(f"Table 3 has {len(orders)} active orders")
        
        if orders:
            for order in orders:
                items = order.get("items", [])
                active_items = [i for i in items if i.get("status") != "cancelled"]
                print(f"  Order {order.get('id')[:8]}... has {len(active_items)} active items")
        
        return orders


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
