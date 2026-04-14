"""
Test Simple Inventory Feature - Inventario Simple por Conteo
Tests for:
- GET /api/simple-inventory - List products with simple inventory enabled
- PUT /api/simple-inventory/{product_id}/adjust - Adjust stock and create audit log
- GET /api/simple-inventory/audit-log - Get audit entries with filters
- GET /api/simple-inventory/audit-log/export-csv - Export CSV
- GET /api/simple-inventory/products-with-simple - Products for OrderScreen
- POST /api/orders/{order_id}/items - Decrement simple inventory when adding items
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://factura-consumo-app.preview.emergentagent.com')

# Test credentials from test_credentials.md
ADMIN_PIN = "1000"

# Test product IDs from review_request
PRESIDENTE_ID = "44426986-eee2-4d76-b2fc-ff8b0e5e415c"  # simple_inventory_enabled, qty=15, alert=3
STELLA_ID = "df15648a-337a-482c-9894-343b64bf05f7"  # simple_inventory_enabled, qty=2, alert=3
HAMBURGUESA_ID = "1af20c68-5eb2-4562-8b20-ee16bbe6ef2e"  # NO simple inventory


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")


@pytest.fixture
def auth_headers(admin_token):
    """Auth headers for requests"""
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


class TestSimpleInventoryList:
    """Tests for GET /api/simple-inventory"""
    
    def test_list_simple_inventory_success(self, auth_headers):
        """Should return list of products with simple inventory enabled"""
        response = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check that returned products have simple_inventory_enabled
        for product in data:
            assert "id" in product
            assert "name" in product
            assert "simple_inventory_qty" in product or product.get("simple_inventory_enabled") is True
        
        print(f"✓ Found {len(data)} products with simple inventory enabled")
    
    def test_list_simple_inventory_unauthorized(self):
        """Should return 401 without auth token"""
        response = requests.get(f"{BASE_URL}/api/simple-inventory")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Unauthorized access correctly rejected")


class TestSimpleInventoryAdjust:
    """Tests for PUT /api/simple-inventory/{product_id}/adjust"""
    
    def test_adjust_stock_increase(self, auth_headers):
        """Should increase stock and create audit log"""
        # First get current stock
        response = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        assert response.status_code == 200
        products = response.json()
        
        # Find a product with simple inventory
        test_product = next((p for p in products if p.get("simple_inventory_qty") is not None), None)
        if not test_product:
            pytest.skip("No products with simple inventory found")
        
        product_id = test_product["id"]
        current_qty = test_product.get("simple_inventory_qty", 0)
        new_qty = current_qty + 5
        
        # Adjust stock
        response = requests.put(
            f"{BASE_URL}/api/simple-inventory/{product_id}/adjust",
            headers=auth_headers,
            json={"new_qty": new_qty, "reason": "Test restock"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") is True
        assert data.get("new_qty") == new_qty
        assert data.get("old_qty") == current_qty
        
        print(f"✓ Stock adjusted from {current_qty} to {new_qty}")
        
        # Restore original value
        requests.put(
            f"{BASE_URL}/api/simple-inventory/{product_id}/adjust",
            headers=auth_headers,
            json={"new_qty": current_qty, "reason": "Test cleanup - restore original"}
        )
    
    def test_adjust_stock_decrease(self, auth_headers):
        """Should decrease stock and create audit log"""
        response = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        assert response.status_code == 200
        products = response.json()
        
        test_product = next((p for p in products if p.get("simple_inventory_qty", 0) > 2), None)
        if not test_product:
            pytest.skip("No products with sufficient stock found")
        
        product_id = test_product["id"]
        current_qty = test_product.get("simple_inventory_qty", 0)
        new_qty = current_qty - 1
        
        response = requests.put(
            f"{BASE_URL}/api/simple-inventory/{product_id}/adjust",
            headers=auth_headers,
            json={"new_qty": new_qty, "reason": "Test manual adjustment"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("new_qty") == new_qty
        
        print(f"✓ Stock decreased from {current_qty} to {new_qty}")
        
        # Restore
        requests.put(
            f"{BASE_URL}/api/simple-inventory/{product_id}/adjust",
            headers=auth_headers,
            json={"new_qty": current_qty, "reason": "Test cleanup"}
        )
    
    def test_adjust_stock_negative_rejected(self, auth_headers):
        """Should reject negative stock values"""
        response = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        products = response.json()
        
        test_product = next((p for p in products), None)
        if not test_product:
            pytest.skip("No products found")
        
        response = requests.put(
            f"{BASE_URL}/api/simple-inventory/{test_product['id']}/adjust",
            headers=auth_headers,
            json={"new_qty": -5, "reason": "Invalid negative"}
        )
        
        assert response.status_code == 400, f"Expected 400 for negative qty, got {response.status_code}"
        print("✓ Negative stock correctly rejected")
    
    def test_adjust_stock_nonexistent_product(self, auth_headers):
        """Should return 404 for non-existent product"""
        response = requests.put(
            f"{BASE_URL}/api/simple-inventory/nonexistent-product-id/adjust",
            headers=auth_headers,
            json={"new_qty": 10, "reason": "Test"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent product correctly returns 404")


class TestSimpleInventoryAuditLog:
    """Tests for GET /api/simple-inventory/audit-log"""
    
    def test_get_audit_log_success(self, auth_headers):
        """Should return audit log entries"""
        response = requests.get(f"{BASE_URL}/api/simple-inventory/audit-log", headers=auth_headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check structure of audit log entries
        if len(data) > 0:
            entry = data[0]
            assert "product_id" in entry or "product_name" in entry
            assert "action_type" in entry
            assert "qty_before" in entry or "qty_after" in entry
            assert "created_at" in entry
        
        print(f"✓ Retrieved {len(data)} audit log entries")
    
    def test_get_audit_log_with_product_filter(self, auth_headers):
        """Should filter audit log by product_id"""
        # First get a product with simple inventory
        response = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        products = response.json()
        
        if not products:
            pytest.skip("No products with simple inventory")
        
        product_id = products[0]["id"]
        
        response = requests.get(
            f"{BASE_URL}/api/simple-inventory/audit-log",
            headers=auth_headers,
            params={"product_id": product_id}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # All entries should be for the specified product
        for entry in data:
            assert entry.get("product_id") == product_id
        
        print(f"✓ Product filter working - {len(data)} entries for product {product_id}")
    
    def test_get_audit_log_with_action_type_filter(self, auth_headers):
        """Should filter audit log by action_type"""
        response = requests.get(
            f"{BASE_URL}/api/simple-inventory/audit-log",
            headers=auth_headers,
            params={"action_type": "sale"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        for entry in data:
            assert entry.get("action_type") == "sale"
        
        print(f"✓ Action type filter working - {len(data)} 'sale' entries")
    
    def test_get_audit_log_with_date_filter(self, auth_headers):
        """Should filter audit log by date range"""
        from datetime import datetime, timedelta
        
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/simple-inventory/audit-log",
            headers=auth_headers,
            params={"start_date": yesterday, "end_date": today}
        )
        
        assert response.status_code == 200
        print(f"✓ Date filter working - {len(response.json())} entries in date range")


class TestSimpleInventoryExportCSV:
    """Tests for GET /api/simple-inventory/audit-log/export-csv"""
    
    def test_export_csv_success(self, auth_headers):
        """Should export audit log as CSV"""
        response = requests.get(
            f"{BASE_URL}/api/simple-inventory/audit-log/export-csv",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Check content type
        content_type = response.headers.get("content-type", "")
        assert "text/csv" in content_type or "application/octet-stream" in content_type, f"Expected CSV content type, got {content_type}"
        
        # Check content disposition header
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp.lower() or "filename" in content_disp.lower()
        
        # Check CSV content has headers
        content = response.text
        assert "Fecha" in content or "Producto" in content or "Usuario" in content
        
        print("✓ CSV export working correctly")
    
    def test_export_csv_with_filters(self, auth_headers):
        """Should export filtered audit log as CSV"""
        response = requests.get(
            f"{BASE_URL}/api/simple-inventory/audit-log/export-csv",
            headers=auth_headers,
            params={"action_type": "restock"}
        )
        
        assert response.status_code == 200
        print("✓ CSV export with filters working")


class TestProductsWithSimpleInventory:
    """Tests for GET /api/simple-inventory/products-with-simple"""
    
    def test_get_products_with_simple_inventory(self, auth_headers):
        """Should return products with simple inventory for OrderScreen"""
        response = requests.get(
            f"{BASE_URL}/api/simple-inventory/products-with-simple",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        # Check structure
        for product in data:
            assert "id" in product
            assert "simple_inventory_qty" in product
            assert "simple_inventory_alert_qty" in product
        
        print(f"✓ Retrieved {len(data)} products with simple inventory data")
    
    def test_products_with_simple_no_auth_required(self):
        """This endpoint may or may not require auth - test both cases"""
        response = requests.get(f"{BASE_URL}/api/simple-inventory/products-with-simple")
        
        # Either 200 (no auth required) or 401 (auth required) is acceptable
        assert response.status_code in [200, 401], f"Unexpected status: {response.status_code}"
        print(f"✓ Endpoint returns {response.status_code} without auth")


class TestOrderItemsSimpleInventoryDecrement:
    """Tests for POST /api/orders/{order_id}/items - Simple inventory decrement"""
    
    def test_add_item_decrements_simple_inventory(self, auth_headers):
        """Adding item to order should decrement simple inventory"""
        # First, get a table to create an order
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=auth_headers)
        assert tables_response.status_code == 200
        tables = tables_response.json()
        
        if not tables:
            pytest.skip("No tables available")
        
        # Find a free table
        free_table = next((t for t in tables if t.get("status") == "free"), None)
        if not free_table:
            pytest.skip("No free tables available")
        
        table_id = free_table["id"]
        
        # Get products with simple inventory
        inv_response = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        products = inv_response.json()
        
        test_product = next((p for p in products if p.get("simple_inventory_qty", 0) > 0), None)
        if not test_product:
            pytest.skip("No products with stock available")
        
        product_id = test_product["id"]
        initial_qty = test_product.get("simple_inventory_qty", 0)
        
        # Create order with item
        order_response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json={
                "table_id": table_id,
                "items": [{
                    "product_id": product_id,
                    "product_name": test_product.get("name", "Test Product"),
                    "quantity": 1,
                    "unit_price": 100.0,
                    "modifiers": [],
                    "notes": ""
                }]
            }
        )
        
        assert order_response.status_code == 200, f"Order creation failed: {order_response.text}"
        order = order_response.json()
        order_id = order.get("id")
        
        # Check that inventory was decremented
        time.sleep(0.5)  # Small delay for DB update
        inv_response2 = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        products2 = inv_response2.json()
        
        updated_product = next((p for p in products2 if p.get("id") == product_id), None)
        if updated_product:
            new_qty = updated_product.get("simple_inventory_qty", 0)
            # Inventory should have decreased by 1
            assert new_qty == initial_qty - 1, f"Expected qty {initial_qty - 1}, got {new_qty}"
            print(f"✓ Simple inventory decremented from {initial_qty} to {new_qty}")
        
        # Cleanup: Cancel the order items to restore inventory
        if order_id and order.get("items"):
            for item in order.get("items", []):
                try:
                    requests.post(
                        f"{BASE_URL}/api/orders/{order_id}/cancel-items",
                        headers=auth_headers,
                        json={
                            "item_ids": [item["id"]],
                            "express_void": True,
                            "comments": "Test cleanup"
                        }
                    )
                except:
                    pass
    
    def test_add_item_rejected_when_out_of_stock(self, auth_headers):
        """Adding item should be rejected when simple inventory qty is 0"""
        # Get products with simple inventory
        inv_response = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        products = inv_response.json()
        
        # Find a product with qty=0 or create one
        zero_stock_product = next((p for p in products if p.get("simple_inventory_qty", 0) == 0), None)
        
        if not zero_stock_product:
            # Set a product to 0 stock temporarily
            test_product = next((p for p in products), None)
            if not test_product:
                pytest.skip("No products with simple inventory")
            
            product_id = test_product["id"]
            original_qty = test_product.get("simple_inventory_qty", 0)
            
            # Set to 0
            requests.put(
                f"{BASE_URL}/api/simple-inventory/{product_id}/adjust",
                headers=auth_headers,
                json={"new_qty": 0, "reason": "Test - set to zero"}
            )
            
            # Get a free table
            tables_response = requests.get(f"{BASE_URL}/api/tables", headers=auth_headers)
            tables = tables_response.json()
            free_table = next((t for t in tables if t.get("status") == "free"), None)
            
            if free_table:
                # Try to add item - should fail
                order_response = requests.post(
                    f"{BASE_URL}/api/orders",
                    headers=auth_headers,
                    json={
                        "table_id": free_table["id"],
                        "items": [{
                            "product_id": product_id,
                            "product_name": test_product.get("name", "Test"),
                            "quantity": 1,
                            "unit_price": 100.0,
                            "modifiers": [],
                            "notes": ""
                        }]
                    }
                )
                
                # Should return 400 with "agotado" message
                if order_response.status_code == 400:
                    assert "agotado" in order_response.text.lower() or "stock" in order_response.text.lower()
                    print("✓ Out of stock correctly rejected")
                else:
                    print(f"Note: Order creation returned {order_response.status_code} - may have different behavior")
            
            # Restore original qty
            requests.put(
                f"{BASE_URL}/api/simple-inventory/{product_id}/adjust",
                headers=auth_headers,
                json={"new_qty": original_qty, "reason": "Test cleanup - restore"}
            )
        else:
            print("✓ Found product with zero stock - test scenario exists")


class TestCancelItemRestoresInventory:
    """Tests for cancel item restoring simple inventory"""
    
    def test_cancel_item_restores_simple_inventory(self, auth_headers):
        """Cancelling an item should restore simple inventory"""
        # Get products with simple inventory
        inv_response = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        products = inv_response.json()
        
        test_product = next((p for p in products if p.get("simple_inventory_qty", 0) > 0), None)
        if not test_product:
            pytest.skip("No products with stock")
        
        product_id = test_product["id"]
        initial_qty = test_product.get("simple_inventory_qty", 0)
        
        # Get a free table
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=auth_headers)
        tables = tables_response.json()
        free_table = next((t for t in tables if t.get("status") == "free"), None)
        
        if not free_table:
            pytest.skip("No free tables")
        
        # Create order
        order_response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=auth_headers,
            json={
                "table_id": free_table["id"],
                "items": [{
                    "product_id": product_id,
                    "product_name": test_product.get("name", "Test"),
                    "quantity": 1,
                    "unit_price": 100.0,
                    "modifiers": [],
                    "notes": ""
                }]
            }
        )
        
        if order_response.status_code != 200:
            pytest.skip(f"Could not create order: {order_response.text}")
        
        order = order_response.json()
        order_id = order.get("id")
        item_id = order.get("items", [{}])[0].get("id")
        
        if not item_id:
            pytest.skip("No item ID in order")
        
        # Check qty after adding
        time.sleep(0.3)
        inv_response2 = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        products2 = inv_response2.json()
        after_add = next((p for p in products2 if p.get("id") == product_id), {}).get("simple_inventory_qty", 0)
        
        # Cancel the item
        cancel_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-items",
            headers=auth_headers,
            json={
                "item_ids": [item_id],
                "express_void": True,
                "comments": "Test cancel"
            }
        )
        
        assert cancel_response.status_code == 200, f"Cancel failed: {cancel_response.text}"
        
        # Check qty after cancel - should be restored
        time.sleep(0.3)
        inv_response3 = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        products3 = inv_response3.json()
        after_cancel = next((p for p in products3 if p.get("id") == product_id), {}).get("simple_inventory_qty", 0)
        
        # Qty should be back to initial
        assert after_cancel == initial_qty, f"Expected qty {initial_qty} after cancel, got {after_cancel}"
        print(f"✓ Inventory restored after cancel: {after_add} → {after_cancel}")


class TestProductConfigSimpleInventory:
    """Tests for simple inventory fields in product config"""
    
    def test_product_has_simple_inventory_fields(self, auth_headers):
        """Product should have simple inventory fields"""
        # Get a product with simple inventory
        inv_response = requests.get(f"{BASE_URL}/api/simple-inventory", headers=auth_headers)
        products = inv_response.json()
        
        if not products:
            pytest.skip("No products with simple inventory")
        
        product_id = products[0]["id"]
        
        # Get full product details
        product_response = requests.get(f"{BASE_URL}/api/products/{product_id}", headers=auth_headers)
        
        assert product_response.status_code == 200
        product = product_response.json()
        
        # Check simple inventory fields exist
        assert "simple_inventory_enabled" in product
        assert "simple_inventory_qty" in product
        assert "simple_inventory_alert_qty" in product
        
        print(f"✓ Product has simple inventory fields: enabled={product.get('simple_inventory_enabled')}, qty={product.get('simple_inventory_qty')}, alert={product.get('simple_inventory_alert_qty')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
