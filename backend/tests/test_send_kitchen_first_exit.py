"""
Test: Kitchen/Bar Print Commands (Comandas) on First Exit
Bug: Comandas not firing on FIRST exit from table screen
Fix: tableOrdersRef sync with order state + fallback to orderRef
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSendKitchenFirstExit:
    """Test the /api/orders/{id}/send-kitchen endpoint for first exit scenario"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to get auth token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        # Cleanup will be done in individual tests
    
    def test_send_kitchen_endpoint_exists(self):
        """Test that the send-kitchen endpoint exists"""
        # First create a test order
        order_id = f"test_order_{uuid.uuid4().hex[:8]}"
        
        # Try to call the endpoint with a non-existent order
        response = self.session.post(f"{BASE_URL}/api/orders/{order_id}/send-kitchen")
        
        # Should return 404 for non-existent order, not 405 (method not allowed)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        assert "no encontrada" in response.text.lower() or "not found" in response.text.lower()
    
    def test_create_order_with_pending_items_and_send_to_kitchen(self):
        """
        Test the full flow:
        1. Create a new order with pending items
        2. Call send-kitchen endpoint
        3. Verify items status changed from 'pending' to 'sent'
        """
        # Get a table to use
        tables_response = self.session.get(f"{BASE_URL}/api/tables")
        assert tables_response.status_code == 200
        tables = tables_response.json()
        assert len(tables) > 0, "No tables found"
        
        # Find an available table
        test_table = None
        for table in tables:
            if table.get("status") == "available":
                test_table = table
                break
        
        if not test_table:
            # Use first table
            test_table = tables[0]
        
        table_id = test_table["id"]
        
        # Get products to add
        products_response = self.session.get(f"{BASE_URL}/api/products")
        assert products_response.status_code == 200
        products = products_response.json()
        assert len(products) > 0, "No products found"
        
        # Find an active product
        test_product = None
        for product in products:
            if product.get("active", True):
                test_product = product
                break
        
        if not test_product:
            test_product = products[0]
        
        # Create a new order
        order_data = {
            "table_id": table_id,
            "items": [
                {
                    "product_id": test_product["id"],
                    "product_name": test_product.get("name", "Test Product"),
                    "quantity": 1,
                    "unit_price": test_product.get("price", 100),
                    "status": "pending"  # CRITICAL: Items start as pending
                }
            ],
            "status": "open"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_response.status_code in [200, 201], f"Failed to create order: {create_response.text}"
        
        created_order = create_response.json()
        order_id = created_order["id"]
        
        # Verify items are pending
        assert len(created_order.get("items", [])) > 0, "Order has no items"
        for item in created_order["items"]:
            assert item.get("status") == "pending", f"Item should be pending, got: {item.get('status')}"
        
        print(f"Created order {order_id} with pending items")
        
        # Now call send-kitchen endpoint (simulating first exit)
        send_response = self.session.post(f"{BASE_URL}/api/orders/{order_id}/send-kitchen")
        assert send_response.status_code == 200, f"Send to kitchen failed: {send_response.text}"
        
        updated_order = send_response.json()
        
        # Verify items are now 'sent'
        for item in updated_order.get("items", []):
            assert item.get("status") == "sent", f"Item should be sent, got: {item.get('status')}"
            assert item.get("sent_to_kitchen") == True, "sent_to_kitchen should be True"
            assert item.get("sent_at") is not None, "sent_at should be set"
        
        print(f"Order {order_id} items successfully sent to kitchen")
        
        # Cleanup - delete the test order
        try:
            self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
        except:
            pass
    
    def test_send_kitchen_with_no_pending_items(self):
        """Test that send-kitchen handles orders with no pending items gracefully"""
        # Get a table
        tables_response = self.session.get(f"{BASE_URL}/api/tables")
        tables = tables_response.json()
        table_id = tables[0]["id"]
        
        # Get a product
        products_response = self.session.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        test_product = products[0]
        
        # Create order with items already sent
        order_data = {
            "table_id": table_id,
            "items": [
                {
                    "product_id": test_product["id"],
                    "product_name": test_product.get("name", "Test Product"),
                    "quantity": 1,
                    "unit_price": test_product.get("price", 100),
                    "status": "sent"  # Already sent
                }
            ],
            "status": "sent"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_response.status_code in [200, 201]
        
        created_order = create_response.json()
        order_id = created_order["id"]
        
        # Call send-kitchen - should succeed but not change anything
        send_response = self.session.post(f"{BASE_URL}/api/orders/{order_id}/send-kitchen")
        assert send_response.status_code == 200, f"Send to kitchen failed: {send_response.text}"
        
        # Cleanup
        try:
            self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
        except:
            pass
    
    def test_add_items_to_existing_order_and_send(self):
        """
        Test adding items to an existing order and sending to kitchen
        This simulates the scenario where user adds items and exits
        """
        # Get a table
        tables_response = self.session.get(f"{BASE_URL}/api/tables")
        tables = tables_response.json()
        table_id = tables[0]["id"]
        
        # Get products
        products_response = self.session.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        
        # Create initial order with sent items
        order_data = {
            "table_id": table_id,
            "items": [
                {
                    "product_id": products[0]["id"],
                    "product_name": products[0].get("name", "Product 1"),
                    "quantity": 1,
                    "unit_price": products[0].get("price", 100),
                    "status": "sent"
                }
            ],
            "status": "sent"
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_response.status_code in [200, 201]
        
        created_order = create_response.json()
        order_id = created_order["id"]
        
        # Add new pending item
        if len(products) > 1:
            new_item = {
                "product_id": products[1]["id"],
                "product_name": products[1].get("name", "Product 2"),
                "quantity": 2,
                "unit_price": products[1].get("price", 150),
                "status": "pending"
            }
        else:
            new_item = {
                "product_id": products[0]["id"],
                "product_name": products[0].get("name", "Product 1"),
                "quantity": 2,
                "unit_price": products[0].get("price", 100),
                "status": "pending"
            }
        
        # Update order with new item
        update_data = {
            "items": created_order["items"] + [new_item]
        }
        
        update_response = self.session.put(f"{BASE_URL}/api/orders/{order_id}", json=update_data)
        assert update_response.status_code == 200, f"Failed to update order: {update_response.text}"
        
        updated_order = update_response.json()
        
        # Verify we have both sent and pending items
        sent_items = [i for i in updated_order["items"] if i.get("status") == "sent"]
        pending_items = [i for i in updated_order["items"] if i.get("status") == "pending"]
        
        assert len(sent_items) >= 1, "Should have at least one sent item"
        assert len(pending_items) >= 1, "Should have at least one pending item"
        
        # Now send to kitchen
        send_response = self.session.post(f"{BASE_URL}/api/orders/{order_id}/send-kitchen")
        assert send_response.status_code == 200
        
        final_order = send_response.json()
        
        # All items should now be sent
        for item in final_order["items"]:
            assert item.get("status") == "sent", f"Item should be sent, got: {item.get('status')}"
        
        print(f"Successfully sent new items to kitchen for order {order_id}")
        
        # Cleanup
        try:
            self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
        except:
            pass


class TestOrderCreationFlow:
    """Test order creation and item status management"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_new_order_items_default_to_pending(self):
        """Verify that new order items default to 'pending' status"""
        # Get table and product
        tables_response = self.session.get(f"{BASE_URL}/api/tables")
        tables = tables_response.json()
        table_id = tables[0]["id"]
        
        products_response = self.session.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        test_product = products[0]
        
        # Create order without specifying status
        order_data = {
            "table_id": table_id,
            "items": [
                {
                    "product_id": test_product["id"],
                    "product_name": test_product.get("name", "Test Product"),
                    "quantity": 1,
                    "unit_price": test_product.get("price", 100)
                    # Note: Not specifying status
                }
            ]
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_response.status_code in [200, 201]
        
        created_order = create_response.json()
        order_id = created_order["id"]
        
        # Check item status
        for item in created_order.get("items", []):
            # Items should default to pending
            status = item.get("status", "pending")
            assert status == "pending", f"New item should be pending, got: {status}"
        
        # Cleanup
        try:
            self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
        except:
            pass
    
    def test_get_table_orders_returns_all_orders(self):
        """Test that getTableOrders returns all orders for a table"""
        # Get a table
        tables_response = self.session.get(f"{BASE_URL}/api/tables")
        tables = tables_response.json()
        table_id = tables[0]["id"]
        
        # Get table orders
        orders_response = self.session.get(f"{BASE_URL}/api/orders/table/{table_id}")
        assert orders_response.status_code == 200
        
        orders = orders_response.json()
        # Should return a list (even if empty)
        assert isinstance(orders, list), f"Expected list, got: {type(orders)}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
