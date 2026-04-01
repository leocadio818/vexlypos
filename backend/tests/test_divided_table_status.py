"""
Test: Divided Table Status Bug Fix
Tests that when a divided table (mesa dividida) has 2+ accounts and ONE account is paid/closed,
the table stays 'occupied' or 'divided' instead of incorrectly turning 'free'.
The table should only become 'free' when ALL accounts are paid.

Bug Fix Applied In:
- billing.py (after payment): Lines 618-650
- orders.py (3 cancellation paths): Lines 530-550, 615-640, 750-775
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDividedTableStatusAfterPayment:
    """Test table status after paying bills on divided tables"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        # Login as Admin
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        
        # Ensure business day is open
        bd_resp = requests.get(f"{BASE_URL}/api/business-days/current", headers=self.headers)
        bd_data = bd_resp.json() if bd_resp.status_code == 200 else {}
        if not bd_data.get("has_open_day") and not bd_data.get("business_day"):
            # Try to open with authorizer_pin
            open_resp = requests.post(f"{BASE_URL}/api/business-days/open", headers=self.headers, json={
                "opening_cash": 1000, "notes": "Test business day", "authorizer_pin": "10000"
            })
            # Accept 200, 201, or 400 (already open)
            assert open_resp.status_code in [200, 201, 400, 422], f"Failed to open business day: {open_resp.text}"
        
        yield
    
    def get_or_create_test_table(self):
        """Get or create a test table for divided table testing"""
        tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        assert tables_resp.status_code == 200
        tables = tables_resp.json()
        
        # Find a free table or create one
        free_table = next((t for t in tables if t.get("status") == "free"), None)
        if free_table:
            return free_table
        
        # Create a new table if none free
        areas_resp = requests.get(f"{BASE_URL}/api/areas", headers=self.headers)
        areas = areas_resp.json() if areas_resp.status_code == 200 else []
        area_id = areas[0]["id"] if areas else None
        
        create_resp = requests.post(f"{BASE_URL}/api/tables", headers=self.headers, json={
            "number": 999, "capacity": 4, "area_id": area_id, "shape": "square"
        })
        if create_resp.status_code in [200, 201]:
            return create_resp.json()
        
        # If creation failed, use first available table
        return tables[0] if tables else None
    
    def get_product_for_order(self):
        """Get a product to add to orders"""
        products_resp = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        assert products_resp.status_code == 200
        products = products_resp.json()
        assert len(products) > 0, "No products available for testing"
        return products[0]
    
    def create_order_on_table(self, table_id):
        """Create an order on a table"""
        product = self.get_product_for_order()
        create_resp = requests.post(f"{BASE_URL}/api/orders", headers=self.headers, json={
            "table_id": table_id,
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "unit_price": product.get("price", 100)
            }]
        })
        assert create_resp.status_code in [200, 201], f"Failed to create order: {create_resp.text}"
        return create_resp.json()
    
    def create_new_account_on_table(self, table_id, label=""):
        """Create a new account (order) on a table for division"""
        resp = requests.post(f"{BASE_URL}/api/tables/{table_id}/new-account", 
                            headers=self.headers, json={"label": label})
        assert resp.status_code in [200, 201], f"Failed to create new account: {resp.text}"
        return resp.json()
    
    def add_items_to_order(self, order_id):
        """Add items to an existing order"""
        product = self.get_product_for_order()
        resp = requests.post(f"{BASE_URL}/api/orders/{order_id}/items", headers=self.headers, json={
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "unit_price": product.get("price", 100)
            }]
        })
        assert resp.status_code == 200, f"Failed to add items: {resp.text}"
        return resp.json()
    
    def send_order_to_kitchen(self, order_id):
        """Send order to kitchen"""
        resp = requests.post(f"{BASE_URL}/api/orders/{order_id}/send-kitchen", headers=self.headers)
        return resp.status_code == 200
    
    def create_bill_for_order(self, order_id, table_id):
        """Create a bill for an order"""
        resp = requests.post(f"{BASE_URL}/api/bills", headers=self.headers, json={
            "order_id": order_id,
            "table_id": table_id,
            "label": "Test Bill"
        })
        assert resp.status_code in [200, 201], f"Failed to create bill: {resp.text}"
        return resp.json()
    
    def pay_bill(self, bill_id):
        """Pay a bill"""
        resp = requests.post(f"{BASE_URL}/api/bills/{bill_id}/pay", headers=self.headers, json={
            "payment_method": "cash",
            "tip_percentage": 0
        })
        assert resp.status_code == 200, f"Failed to pay bill: {resp.text}"
        return resp.json()
    
    def get_table_status(self, table_id):
        """Get current table status"""
        resp = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        assert resp.status_code == 200
        tables = resp.json()
        table = next((t for t in tables if t["id"] == table_id), None)
        return table.get("status") if table else None
    
    def cleanup_table(self, table_id):
        """Clean up table by cancelling all orders"""
        orders_resp = requests.get(f"{BASE_URL}/api/orders?table_id={table_id}", headers=self.headers)
        if orders_resp.status_code == 200:
            orders = orders_resp.json()
            for order in orders:
                if order.get("status") not in ["cancelled", "closed"]:
                    # Cancel all items
                    for item in order.get("items", []):
                        if item.get("status") != "cancelled":
                            requests.post(
                                f"{BASE_URL}/api/orders/{order['id']}/cancel-items",
                                headers=self.headers,
                                json={"item_ids": [item["id"]], "express_void": True}
                            )
        # Reset table status
        requests.put(f"{BASE_URL}/api/tables/{table_id}", headers=self.headers, 
                    json={"status": "free", "active_order_id": None})
    
    def test_pay_one_bill_divided_table_stays_occupied(self):
        """
        CRITICAL TEST: Pay one bill from a divided table → table stays 'occupied' or 'divided'
        
        Steps:
        1. Create order on table (table becomes 'occupied')
        2. Create second account on same table (table becomes 'divided')
        3. Add items to both orders
        4. Create and pay bill for first order
        5. Verify table is NOT 'free' - should be 'occupied' or 'divided'
        """
        table = self.get_or_create_test_table()
        assert table, "No table available for testing"
        table_id = table["id"]
        
        try:
            # Step 1: Create first order
            order1 = self.create_order_on_table(table_id)
            order1_id = order1["id"]
            print(f"Created order 1: {order1_id}")
            
            # Verify table is occupied
            status = self.get_table_status(table_id)
            assert status == "occupied", f"Expected 'occupied' after first order, got '{status}'"
            
            # Step 2: Create second account (divide table)
            order2 = self.create_new_account_on_table(table_id, "Cuenta 2")
            order2_id = order2["id"]
            print(f"Created order 2 (divided): {order2_id}")
            
            # Verify table is divided
            status = self.get_table_status(table_id)
            assert status == "divided", f"Expected 'divided' after second account, got '{status}'"
            
            # Step 3: Add items to second order
            self.add_items_to_order(order2_id)
            
            # Step 4: Create and pay bill for first order
            bill1 = self.create_bill_for_order(order1_id, table_id)
            bill1_id = bill1["id"]
            print(f"Created bill for order 1: {bill1_id}")
            
            paid_bill = self.pay_bill(bill1_id)
            print(f"Paid bill 1, status: {paid_bill.get('status')}")
            
            # Step 5: CRITICAL CHECK - Table should NOT be free
            status = self.get_table_status(table_id)
            print(f"Table status after paying one bill: {status}")
            
            assert status != "free", f"BUG: Table became 'free' after paying only ONE bill on divided table! Expected 'occupied' or 'divided', got '{status}'"
            assert status in ["occupied", "divided", "billed"], f"Unexpected table status: {status}"
            
            print("✓ PASS: Table correctly stayed occupied/divided after partial payment")
            
        finally:
            self.cleanup_table(table_id)
    
    def test_pay_all_bills_divided_table_becomes_free(self):
        """
        Test: Pay ALL bills from a divided table → table becomes 'free'
        """
        table = self.get_or_create_test_table()
        assert table, "No table available for testing"
        table_id = table["id"]
        
        try:
            # Create first order
            order1 = self.create_order_on_table(table_id)
            order1_id = order1["id"]
            
            # Create second account
            order2 = self.create_new_account_on_table(table_id, "Cuenta 2")
            order2_id = order2["id"]
            
            # Add items to second order
            self.add_items_to_order(order2_id)
            
            # Create and pay bill for first order
            bill1 = self.create_bill_for_order(order1_id, table_id)
            self.pay_bill(bill1["id"])
            
            # Verify table is NOT free yet
            status = self.get_table_status(table_id)
            assert status != "free", f"Table became free too early! Status: {status}"
            
            # Create and pay bill for second order
            bill2 = self.create_bill_for_order(order2_id, table_id)
            self.pay_bill(bill2["id"])
            
            # Now table should be free
            status = self.get_table_status(table_id)
            print(f"Table status after paying ALL bills: {status}")
            
            assert status == "free", f"Table should be 'free' after paying ALL bills, got '{status}'"
            
            print("✓ PASS: Table correctly became free after all bills paid")
            
        finally:
            self.cleanup_table(table_id)


class TestDividedTableStatusAfterCancellation:
    """Test table status after cancelling orders on divided tables"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert login_resp.status_code == 200
        self.token = login_resp.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        yield
    
    def get_or_create_test_table(self):
        """Get or create a test table"""
        tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_resp.json() if tables_resp.status_code == 200 else []
        free_table = next((t for t in tables if t.get("status") == "free"), None)
        if free_table:
            return free_table
        return tables[0] if tables else None
    
    def get_product_for_order(self):
        """Get a product to add to orders"""
        products_resp = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_resp.json() if products_resp.status_code == 200 else []
        return products[0] if products else None
    
    def create_order_on_table(self, table_id):
        """Create an order on a table"""
        product = self.get_product_for_order()
        if not product:
            pytest.skip("No products available")
        resp = requests.post(f"{BASE_URL}/api/orders", headers=self.headers, json={
            "table_id": table_id,
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "unit_price": product.get("price", 100)
            }]
        })
        return resp.json() if resp.status_code in [200, 201] else None
    
    def create_new_account_on_table(self, table_id, label=""):
        """Create a new account on a table"""
        resp = requests.post(f"{BASE_URL}/api/tables/{table_id}/new-account", 
                            headers=self.headers, json={"label": label})
        return resp.json() if resp.status_code in [200, 201] else None
    
    def add_items_to_order(self, order_id):
        """Add items to an order"""
        product = self.get_product_for_order()
        if not product:
            return None
        resp = requests.post(f"{BASE_URL}/api/orders/{order_id}/items", headers=self.headers, json={
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "unit_price": product.get("price", 100)
            }]
        })
        return resp.json() if resp.status_code == 200 else None
    
    def get_table_status(self, table_id):
        """Get current table status"""
        resp = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = resp.json() if resp.status_code == 200 else []
        table = next((t for t in tables if t["id"] == table_id), None)
        return table.get("status") if table else None
    
    def cleanup_table(self, table_id):
        """Clean up table"""
        orders_resp = requests.get(f"{BASE_URL}/api/orders?table_id={table_id}", headers=self.headers)
        if orders_resp.status_code == 200:
            for order in orders_resp.json():
                if order.get("status") not in ["cancelled", "closed"]:
                    for item in order.get("items", []):
                        if item.get("status") != "cancelled":
                            requests.post(
                                f"{BASE_URL}/api/orders/{order['id']}/cancel-items",
                                headers=self.headers,
                                json={"item_ids": [item["id"]], "express_void": True}
                            )
        requests.put(f"{BASE_URL}/api/tables/{table_id}", headers=self.headers, 
                    json={"status": "free", "active_order_id": None})
    
    def test_cancel_one_order_divided_table_stays_occupied(self):
        """
        Test: Cancel one order from a divided table → table stays 'occupied' or 'divided'
        """
        table = self.get_or_create_test_table()
        if not table:
            pytest.skip("No table available")
        table_id = table["id"]
        
        try:
            # Create first order
            order1 = self.create_order_on_table(table_id)
            if not order1:
                pytest.skip("Could not create order")
            order1_id = order1["id"]
            
            # Create second account
            order2 = self.create_new_account_on_table(table_id, "Cuenta 2")
            if not order2:
                pytest.skip("Could not create second account")
            order2_id = order2["id"]
            
            # Add items to second order
            self.add_items_to_order(order2_id)
            
            # Verify table is divided
            status = self.get_table_status(table_id)
            assert status == "divided", f"Expected 'divided', got '{status}'"
            
            # Cancel all items in first order (express void)
            order1_items = order1.get("items", [])
            if order1_items:
                item_ids = [item["id"] for item in order1_items]
                cancel_resp = requests.post(
                    f"{BASE_URL}/api/orders/{order1_id}/cancel-items",
                    headers=self.headers,
                    json={"item_ids": item_ids, "express_void": True}
                )
                print(f"Cancel response: {cancel_resp.status_code}")
            
            # CRITICAL CHECK: Table should NOT be free
            status = self.get_table_status(table_id)
            print(f"Table status after cancelling one order: {status}")
            
            assert status != "free", f"BUG: Table became 'free' after cancelling only ONE order! Expected 'occupied', got '{status}'"
            assert status in ["occupied", "divided"], f"Unexpected status: {status}"
            
            print("✓ PASS: Table correctly stayed occupied after cancelling one order")
            
        finally:
            self.cleanup_table(table_id)
    
    def test_cancel_all_orders_divided_table_becomes_free(self):
        """
        Test: Cancel ALL orders from a divided table → table becomes 'free'
        """
        table = self.get_or_create_test_table()
        if not table:
            pytest.skip("No table available")
        table_id = table["id"]
        
        try:
            # Create first order
            order1 = self.create_order_on_table(table_id)
            if not order1:
                pytest.skip("Could not create order")
            order1_id = order1["id"]
            
            # Create second account
            order2 = self.create_new_account_on_table(table_id, "Cuenta 2")
            if not order2:
                pytest.skip("Could not create second account")
            order2_id = order2["id"]
            
            # Add items to second order
            updated_order2 = self.add_items_to_order(order2_id)
            
            # Cancel first order
            order1_items = order1.get("items", [])
            if order1_items:
                cancel_resp1 = requests.post(
                    f"{BASE_URL}/api/orders/{order1_id}/cancel-items",
                    headers=self.headers,
                    json={"item_ids": [item["id"] for item in order1_items], "express_void": True}
                )
                print(f"Cancel order1 response: {cancel_resp1.status_code}")
            
            # Verify table is NOT free yet
            status = self.get_table_status(table_id)
            print(f"Table status after cancelling first order: {status}")
            assert status != "free", f"Table became free too early! Status: {status}"
            
            # Cancel second order - need to get fresh order data
            order2_fresh = requests.get(f"{BASE_URL}/api/orders/{order2_id}", headers=self.headers)
            if order2_fresh.status_code == 200:
                order2_data = order2_fresh.json()
                order2_items = [i for i in order2_data.get("items", []) if i.get("status") != "cancelled"]
                if order2_items:
                    cancel_resp2 = requests.post(
                        f"{BASE_URL}/api/orders/{order2_id}/cancel-items",
                        headers=self.headers,
                        json={"item_ids": [item["id"] for item in order2_items], "express_void": True}
                    )
                    print(f"Cancel order2 response: {cancel_resp2.status_code}")
            
            # Now table should be free
            import time
            time.sleep(0.5)  # Small delay for DB update
            status = self.get_table_status(table_id)
            print(f"Table status after cancelling ALL orders: {status}")
            
            assert status == "free", f"Table should be 'free' after cancelling ALL orders, got '{status}'"
            
            print("✓ PASS: Table correctly became free after all orders cancelled")
            
        finally:
            self.cleanup_table(table_id)


class TestTableStatusEndpoints:
    """Test basic table status endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert login_resp.status_code == 200
        self.token = login_resp.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
        yield
    
    def test_tables_endpoint_returns_status(self):
        """Verify tables endpoint returns status field"""
        resp = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        assert resp.status_code == 200
        tables = resp.json()
        assert isinstance(tables, list)
        if tables:
            assert "status" in tables[0], "Table should have 'status' field"
            assert tables[0]["status"] in ["free", "occupied", "divided", "billed", "reserved"]
            print(f"✓ Tables endpoint working, found {len(tables)} tables")
    
    def test_table_orders_endpoint(self):
        """Verify table orders endpoint works"""
        tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_resp.json() if tables_resp.status_code == 200 else []
        if not tables:
            pytest.skip("No tables available")
        
        table_id = tables[0]["id"]
        resp = requests.get(f"{BASE_URL}/api/tables/{table_id}/orders", headers=self.headers)
        assert resp.status_code in [200, 403], f"Unexpected status: {resp.status_code}"
        print(f"✓ Table orders endpoint working")
    
    def test_new_account_endpoint(self):
        """Verify new account endpoint exists"""
        tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_resp.json() if tables_resp.status_code == 200 else []
        free_table = next((t for t in tables if t.get("status") == "free"), None)
        
        if not free_table:
            pytest.skip("No free table available")
        
        # Just verify endpoint exists (don't actually create)
        resp = requests.post(f"{BASE_URL}/api/tables/{free_table['id']}/new-account", 
                            headers=self.headers, json={"label": "Test"})
        # Should work or fail with validation, not 404
        assert resp.status_code != 404, "New account endpoint should exist"
        print(f"✓ New account endpoint exists")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
