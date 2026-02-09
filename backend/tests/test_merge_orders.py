"""
Test suite for Merge/Unir Orders functionality
Tests the POST /api/orders/{id}/merge/{target_id} endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMergeOrders:
    """Tests for merging/unir accounts functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with Admin PIN 0000
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
    def test_login_with_admin_pin(self):
        """Test: Admin login with PIN 0000 works"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "admin"
        print("✓ Admin login with PIN 0000 successful")
        
    def test_get_tables_status(self):
        """Test: Get tables and verify status values"""
        response = self.session.get(f"{BASE_URL}/api/tables")
        assert response.status_code == 200
        tables = response.json()
        
        # Find tables by status
        divided_tables = [t for t in tables if t["status"] == "divided"]
        occupied_tables = [t for t in tables if t["status"] == "occupied"]
        
        print(f"✓ Found {len(divided_tables)} divided tables, {len(occupied_tables)} occupied tables")
        assert len(tables) > 0, "No tables found"
        
    def test_mesa_3_has_single_account_after_merge(self):
        """Test: Mesa 3 should have only 1 account after previous merge"""
        # Get Mesa 3 ID
        response = self.session.get(f"{BASE_URL}/api/tables")
        tables = response.json()
        mesa_3 = next((t for t in tables if t["number"] == 3), None)
        
        assert mesa_3 is not None, "Mesa 3 not found"
        
        # Get orders for Mesa 3
        response = self.session.get(f"{BASE_URL}/api/tables/{mesa_3['id']}/orders")
        assert response.status_code == 200
        orders = response.json()
        
        print(f"✓ Mesa 3 has {len(orders)} order(s)")
        assert len(orders) == 1, f"Expected 1 order after merge, got {len(orders)}"
        
        # Verify items exist
        order = orders[0]
        active_items = [i for i in order.get("items", []) if i.get("status") != "cancelled"]
        print(f"✓ Mesa 3 order has {len(active_items)} items: {[i['product_name'] for i in active_items]}")
        assert len(active_items) >= 1, "Order should have items after merge"
        
    def test_mesa_2_has_multiple_accounts(self):
        """Test: Mesa 2 should have 2 accounts (divided)"""
        response = self.session.get(f"{BASE_URL}/api/tables")
        tables = response.json()
        mesa_2 = next((t for t in tables if t["number"] == 2), None)
        
        assert mesa_2 is not None, "Mesa 2 not found"
        assert mesa_2["status"] == "divided", f"Expected divided status, got {mesa_2['status']}"
        
        # Get orders for Mesa 2
        response = self.session.get(f"{BASE_URL}/api/tables/{mesa_2['id']}/orders")
        assert response.status_code == 200
        orders = response.json()
        
        print(f"✓ Mesa 2 has {len(orders)} accounts (divided)")
        assert len(orders) >= 2, f"Expected 2+ orders for divided table, got {len(orders)}"
        
        return mesa_2, orders
        
    def test_merge_endpoint_exists(self):
        """Test: POST /api/orders/{id}/merge/{target_id} endpoint exists"""
        # Use fake IDs to test endpoint existence
        response = self.session.post(f"{BASE_URL}/api/orders/fake-id/merge/fake-target")
        # Should return 404 (not found) not 405 (method not allowed)
        assert response.status_code in [404, 400], f"Unexpected status: {response.status_code}"
        print("✓ Merge endpoint exists and responds correctly")
        
    def test_merge_same_order_fails(self):
        """Test: Cannot merge an order with itself"""
        # Get any order
        response = self.session.get(f"{BASE_URL}/api/orders?status=active")
        orders = response.json()
        
        if not orders:
            response = self.session.get(f"{BASE_URL}/api/orders?status=sent")
            orders = response.json()
            
        if not orders:
            pytest.skip("No active orders to test")
            
        order_id = orders[0]["id"]
        
        # Try to merge with itself
        response = self.session.post(f"{BASE_URL}/api/orders/{order_id}/merge/{order_id}")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        assert "misma" in response.json().get("detail", "").lower() or "itself" in response.json().get("detail", "").lower()
        print("✓ Merge with self correctly rejected")
        
    def test_merge_different_tables_fails(self):
        """Test: Cannot merge orders from different tables"""
        # Get orders from different tables
        response = self.session.get(f"{BASE_URL}/api/tables")
        tables = response.json()
        
        # Find two tables with orders
        tables_with_orders = []
        for table in tables:
            if table["status"] in ["occupied", "divided", "billed"]:
                resp = self.session.get(f"{BASE_URL}/api/tables/{table['id']}/orders")
                if resp.status_code == 200:
                    orders = resp.json()
                    if orders:
                        tables_with_orders.append({"table": table, "orders": orders})
                        if len(tables_with_orders) >= 2:
                            break
        
        if len(tables_with_orders) < 2:
            pytest.skip("Need 2 tables with orders to test cross-table merge")
            
        order1 = tables_with_orders[0]["orders"][0]["id"]
        order2 = tables_with_orders[1]["orders"][0]["id"]
        
        # Try to merge orders from different tables
        response = self.session.post(f"{BASE_URL}/api/orders/{order1}/merge/{order2}")
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Cross-table merge correctly rejected")
        
    def test_create_and_merge_accounts(self):
        """Test: Create 2 accounts on a table, add items, then merge them"""
        # Find a free table
        response = self.session.get(f"{BASE_URL}/api/tables")
        tables = response.json()
        free_table = next((t for t in tables if t["status"] == "free"), None)
        
        if not free_table:
            pytest.skip("No free table available for test")
            
        table_id = free_table["id"]
        table_number = free_table["number"]
        print(f"Using Mesa {table_number} for merge test")
        
        # Get products for adding items
        response = self.session.get(f"{BASE_URL}/api/products")
        products = response.json()
        assert len(products) >= 2, "Need at least 2 products"
        
        product1 = products[0]
        product2 = products[1]
        
        # Create first order with item
        response = self.session.post(f"{BASE_URL}/api/orders", json={
            "table_id": table_id,
            "items": [{
                "product_id": product1["id"],
                "product_name": product1["name"],
                "quantity": 1,
                "unit_price": product1["price"]
            }]
        })
        assert response.status_code == 200, f"Failed to create order: {response.text}"
        order1 = response.json()
        order1_id = order1["id"]
        print(f"✓ Created order 1 with {product1['name']}")
        
        # Create second account on same table
        response = self.session.post(f"{BASE_URL}/api/tables/{table_id}/orders/new")
        assert response.status_code == 200, f"Failed to create second account: {response.text}"
        order2 = response.json()
        order2_id = order2["id"]
        print(f"✓ Created order 2 (empty)")
        
        # Add item to second order
        response = self.session.post(f"{BASE_URL}/api/orders/{order2_id}/items", json={
            "items": [{
                "product_id": product2["id"],
                "product_name": product2["name"],
                "quantity": 1,
                "unit_price": product2["price"]
            }]
        })
        assert response.status_code == 200, f"Failed to add item: {response.text}"
        print(f"✓ Added {product2['name']} to order 2")
        
        # Verify table is now divided
        response = self.session.get(f"{BASE_URL}/api/tables/{table_id}/orders")
        orders = response.json()
        assert len(orders) == 2, f"Expected 2 orders, got {len(orders)}"
        print(f"✓ Table has 2 accounts")
        
        # Verify table status is divided
        response = self.session.get(f"{BASE_URL}/api/tables")
        tables = response.json()
        test_table = next((t for t in tables if t["id"] == table_id), None)
        assert test_table["status"] == "divided", f"Expected divided, got {test_table['status']}"
        print(f"✓ Table status is 'divided'")
        
        # MERGE: Merge order2 into order1
        response = self.session.post(f"{BASE_URL}/api/orders/{order2_id}/merge/{order1_id}")
        assert response.status_code == 200, f"Merge failed: {response.text}"
        merge_result = response.json()
        print(f"✓ Merge successful: {merge_result.get('message', 'OK')}")
        
        # Verify only 1 order remains
        response = self.session.get(f"{BASE_URL}/api/tables/{table_id}/orders")
        orders = response.json()
        assert len(orders) == 1, f"Expected 1 order after merge, got {len(orders)}"
        print(f"✓ After merge: 1 order remains")
        
        # Verify merged order has both items
        merged_order = orders[0]
        active_items = [i for i in merged_order.get("items", []) if i.get("status") != "cancelled"]
        item_names = [i["product_name"] for i in active_items]
        print(f"✓ Merged order has items: {item_names}")
        assert len(active_items) == 2, f"Expected 2 items, got {len(active_items)}"
        assert product1["name"] in item_names, f"Missing {product1['name']}"
        assert product2["name"] in item_names, f"Missing {product2['name']}"
        
        # Verify table status changed to occupied
        response = self.session.get(f"{BASE_URL}/api/tables")
        tables = response.json()
        test_table = next((t for t in tables if t["id"] == table_id), None)
        assert test_table["status"] == "occupied", f"Expected occupied after merge, got {test_table['status']}"
        print(f"✓ Table status changed to 'occupied' after merge")
        
        # Cleanup: Delete the test order (optional - leave for visual verification)
        # We'll leave the order for UI testing
        
        return table_id, merged_order["id"]


class TestMergeUIElements:
    """Tests for UI-related merge functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
    def test_unir_button_visibility_logic(self):
        """Test: Unir button should only appear when 2+ accounts exist"""
        response = self.session.get(f"{BASE_URL}/api/tables")
        tables = response.json()
        
        # Find divided table (should show Unir button)
        divided_table = next((t for t in tables if t["status"] == "divided"), None)
        if divided_table:
            response = self.session.get(f"{BASE_URL}/api/tables/{divided_table['id']}/orders")
            orders = response.json()
            assert len(orders) >= 2, "Divided table should have 2+ orders"
            print(f"✓ Divided table (Mesa {divided_table['number']}) has {len(orders)} accounts - Unir button should be visible")
            
        # Find occupied table (should NOT show Unir button)
        occupied_table = next((t for t in tables if t["status"] == "occupied"), None)
        if occupied_table:
            response = self.session.get(f"{BASE_URL}/api/tables/{occupied_table['id']}/orders")
            orders = response.json()
            if len(orders) == 1:
                print(f"✓ Occupied table (Mesa {occupied_table['number']}) has 1 account - Unir button should be hidden")
            else:
                print(f"⚠ Occupied table has {len(orders)} orders - status may need update")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
