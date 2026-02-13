"""
Test Suite for Inventory Stock Control Features
Tests:
1. GET /api/inventory/settings - Get inventory configuration
2. PUT /api/inventory/settings - Update inventory configuration
3. GET /api/inventory/products-stock - Get product stock status
4. POST /api/bills/{bill_id}/pay - Auto-deduct inventory on payment
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestInventoryStockControl:
    """Tests for inventory stock control settings and product stock status"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def test_01_get_inventory_settings(self):
        """Test GET /api/inventory/settings returns inventory configuration"""
        response = requests.get(f"{BASE_URL}/api/inventory/settings", headers=self.headers)
        assert response.status_code == 200, f"Failed to get inventory settings: {response.text}"
        
        data = response.json()
        print(f"Inventory Settings: {data}")
        
        # Verify expected fields exist
        assert "allow_sale_without_stock" in data, "Missing allow_sale_without_stock field"
        assert "auto_deduct_on_payment" in data, "Missing auto_deduct_on_payment field"
        assert "default_warehouse_id" in data, "Missing default_warehouse_id field"
        assert isinstance(data["allow_sale_without_stock"], bool), "allow_sale_without_stock should be boolean"
        assert isinstance(data["auto_deduct_on_payment"], bool), "auto_deduct_on_payment should be boolean"
        
        print("✓ GET /api/inventory/settings - PASSED")
    
    def test_02_update_inventory_settings_allow_sale_without_stock(self):
        """Test PUT /api/inventory/settings to toggle allow_sale_without_stock"""
        # First get current settings
        get_response = requests.get(f"{BASE_URL}/api/inventory/settings", headers=self.headers)
        current_settings = get_response.json()
        original_value = current_settings.get("allow_sale_without_stock", False)
        
        # Toggle the value
        new_value = not original_value
        update_data = {**current_settings, "allow_sale_without_stock": new_value}
        
        update_response = requests.put(f"{BASE_URL}/api/inventory/settings", json=update_data, headers=self.headers)
        assert update_response.status_code == 200, f"Failed to update settings: {update_response.text}"
        
        # Verify the change was saved
        verify_response = requests.get(f"{BASE_URL}/api/inventory/settings", headers=self.headers)
        updated_settings = verify_response.json()
        assert updated_settings["allow_sale_without_stock"] == new_value, "allow_sale_without_stock not updated"
        
        # Restore original value
        restore_data = {**updated_settings, "allow_sale_without_stock": original_value}
        requests.put(f"{BASE_URL}/api/inventory/settings", json=restore_data, headers=self.headers)
        
        print(f"✓ PUT /api/inventory/settings (allow_sale_without_stock toggle) - PASSED")
    
    def test_03_update_inventory_settings_auto_deduct(self):
        """Test PUT /api/inventory/settings to toggle auto_deduct_on_payment"""
        # Get current settings
        get_response = requests.get(f"{BASE_URL}/api/inventory/settings", headers=self.headers)
        current_settings = get_response.json()
        original_value = current_settings.get("auto_deduct_on_payment", True)
        
        # Toggle the value
        new_value = not original_value
        update_data = {**current_settings, "auto_deduct_on_payment": new_value}
        
        update_response = requests.put(f"{BASE_URL}/api/inventory/settings", json=update_data, headers=self.headers)
        assert update_response.status_code == 200, f"Failed to update settings: {update_response.text}"
        
        # Verify the change was saved
        verify_response = requests.get(f"{BASE_URL}/api/inventory/settings", headers=self.headers)
        updated_settings = verify_response.json()
        assert updated_settings["auto_deduct_on_payment"] == new_value, "auto_deduct_on_payment not updated"
        
        # Restore original value
        restore_data = {**updated_settings, "auto_deduct_on_payment": original_value}
        requests.put(f"{BASE_URL}/api/inventory/settings", json=restore_data, headers=self.headers)
        
        print(f"✓ PUT /api/inventory/settings (auto_deduct_on_payment toggle) - PASSED")
    
    def test_04_update_inventory_settings_default_warehouse(self):
        """Test PUT /api/inventory/settings to set default_warehouse_id"""
        # Get warehouses
        wh_response = requests.get(f"{BASE_URL}/api/warehouses", headers=self.headers)
        warehouses = wh_response.json()
        
        if len(warehouses) == 0:
            pytest.skip("No warehouses available for testing")
        
        warehouse_id = warehouses[0]["id"]
        
        # Get current settings
        get_response = requests.get(f"{BASE_URL}/api/inventory/settings", headers=self.headers)
        current_settings = get_response.json()
        
        # Set default warehouse
        update_data = {**current_settings, "default_warehouse_id": warehouse_id}
        update_response = requests.put(f"{BASE_URL}/api/inventory/settings", json=update_data, headers=self.headers)
        assert update_response.status_code == 200, f"Failed to update settings: {update_response.text}"
        
        # Verify the change
        verify_response = requests.get(f"{BASE_URL}/api/inventory/settings", headers=self.headers)
        updated_settings = verify_response.json()
        assert updated_settings["default_warehouse_id"] == warehouse_id, "default_warehouse_id not updated"
        
        print(f"✓ PUT /api/inventory/settings (default_warehouse_id) - PASSED")
    
    def test_05_get_products_stock_status(self):
        """Test GET /api/inventory/products-stock returns stock status for all products"""
        response = requests.get(f"{BASE_URL}/api/inventory/products-stock", headers=self.headers)
        assert response.status_code == 200, f"Failed to get products stock: {response.text}"
        
        data = response.json()
        print(f"Products Stock: {len(data)} products returned")
        
        # Verify it's a list
        assert isinstance(data, list), "Response should be a list"
        
        # If products exist, verify structure
        if len(data) > 0:
            product_stock = data[0]
            assert "product_id" in product_stock, "Missing product_id field"
            assert "in_stock" in product_stock, "Missing in_stock field"
            assert "has_recipe" in product_stock, "Missing has_recipe field"
            assert isinstance(product_stock["in_stock"], bool), "in_stock should be boolean"
            print(f"Sample product stock: {product_stock}")
        
        print(f"✓ GET /api/inventory/products-stock - PASSED ({len(data)} products)")
    
    def test_06_products_stock_with_warehouse_param(self):
        """Test GET /api/inventory/products-stock with warehouse_id parameter"""
        # Get warehouses
        wh_response = requests.get(f"{BASE_URL}/api/warehouses", headers=self.headers)
        warehouses = wh_response.json()
        
        if len(warehouses) == 0:
            pytest.skip("No warehouses available for testing")
        
        warehouse_id = warehouses[0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/inventory/products-stock", 
                               params={"warehouse_id": warehouse_id},
                               headers=self.headers)
        assert response.status_code == 200, f"Failed to get products stock: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"✓ GET /api/inventory/products-stock?warehouse_id={warehouse_id[:8]}... - PASSED")


class TestBillPaymentInventoryDeduction:
    """Tests for auto inventory deduction when paying bills"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get auth token"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def test_01_verify_auto_deduct_setting_exists(self):
        """Verify auto_deduct_on_payment setting is available"""
        response = requests.get(f"{BASE_URL}/api/inventory/settings", headers=self.headers)
        assert response.status_code == 200
        
        settings = response.json()
        assert "auto_deduct_on_payment" in settings, "auto_deduct_on_payment setting missing"
        print(f"auto_deduct_on_payment = {settings['auto_deduct_on_payment']}")
        print("✓ auto_deduct_on_payment setting exists - PASSED")
    
    def test_02_create_order_create_bill_pay(self):
        """Test full flow: create order, create bill, pay - checking if inventory deduction is attempted"""
        # Get a table
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_response.json()
        if len(tables) == 0:
            pytest.skip("No tables available")
        
        # Find a free table
        free_table = None
        for t in tables:
            if t.get("status") == "free":
                free_table = t
                break
        
        if not free_table:
            pytest.skip("No free tables available")
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        if len(products) == 0:
            pytest.skip("No products available")
        
        product = products[0]
        table_id = free_table["id"]
        
        # Create order
        order_data = {
            "table_id": table_id,
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "unit_price": product.get("price", 100)
            }]
        }
        
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert order_response.status_code == 200, f"Failed to create order: {order_response.text}"
        order = order_response.json()
        order_id = order["id"]
        print(f"Created order: {order_id}")
        
        # Send to kitchen first
        send_response = requests.post(f"{BASE_URL}/api/orders/{order_id}/send-kitchen", headers=self.headers)
        assert send_response.status_code == 200, "Failed to send to kitchen"
        
        # Get item IDs from order
        item_ids = [item["id"] for item in order["items"]]
        
        # Create bill
        bill_data = {
            "order_id": order_id,
            "table_id": table_id,
            "label": "Test Bill",
            "item_ids": item_ids,
            "tip_percentage": 10,
            "payment_method": "cash"
        }
        
        bill_response = requests.post(f"{BASE_URL}/api/bills", json=bill_data, headers=self.headers)
        assert bill_response.status_code == 200, f"Failed to create bill: {bill_response.text}"
        bill = bill_response.json()
        bill_id = bill["id"]
        print(f"Created bill: {bill_id}")
        
        # Pay bill - this should trigger inventory deduction if auto_deduct_on_payment is true
        pay_data = {
            "payment_method": "cash",
            "tip_percentage": 10
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/bills/{bill_id}/pay", json=pay_data, headers=self.headers)
        assert pay_response.status_code == 200, f"Failed to pay bill: {pay_response.text}"
        
        # Verify bill is paid
        get_bill_response = requests.get(f"{BASE_URL}/api/bills/{bill_id}", headers=self.headers)
        paid_bill = get_bill_response.json()
        assert paid_bill["status"] == "paid", "Bill should be marked as paid"
        
        # Check order for inventory_deducted flag
        get_order_response = requests.get(f"{BASE_URL}/api/orders/{order_id}", headers=self.headers)
        updated_order = get_order_response.json()
        
        # Note: inventory_deducted flag is only set if auto_deduct is enabled and product has recipe
        if "inventory_deducted" in updated_order:
            print(f"inventory_deducted = {updated_order['inventory_deducted']}")
            if "inventory_errors" in updated_order:
                print(f"inventory_errors = {updated_order['inventory_errors']}")
        
        # Clean up - free the table
        requests.put(f"{BASE_URL}/api/tables/{table_id}", json={"status": "free", "active_order_id": None}, headers=self.headers)
        
        print("✓ Order->Bill->Pay flow with inventory deduction check - PASSED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
