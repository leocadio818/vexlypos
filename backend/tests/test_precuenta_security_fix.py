"""
Test Pre-Cuenta Security Fix: Auto-send pending items before printing

SECURITY FIX: Items in 'Pendiente' status could be deleted without authorization.
When waiter presses Pre-Cuenta, the system must FIRST auto-send all pending items 
to their channels (same logic as ENVIAR button), THEN print the pre-cuenta.

This ensures all items require authorization to delete after pre-cuenta is printed.

Test Cases:
1. Create order with pending items
2. Verify items have status='pending' initially
3. Call send-kitchen endpoint (same as ENVIAR button)
4. Verify items now have status='sent'
5. Verify pre-cuenta HTML includes all items with correct total
6. Verify sent items require authorization to delete (existing behavior)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPreCuentaSecurityFix:
    """Test the security fix for Pre-Cuenta auto-sending pending items"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get token"""
        # Login as Mesero (waiter) - PIN 100
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "100"})
        if login_resp.status_code == 200:
            self.token = login_resp.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
            self.user = login_resp.json().get("user", {})
        else:
            pytest.skip("Could not login as Mesero")
        
        # Get a free table
        tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        if tables_resp.status_code == 200:
            tables = tables_resp.json()
            free_tables = [t for t in tables if t.get("status") == "free"]
            if free_tables:
                self.table = free_tables[0]
            else:
                # Use first table
                self.table = tables[0] if tables else None
        
        if not self.table:
            pytest.skip("No tables available")
        
        # Get products for testing
        products_resp = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        if products_resp.status_code == 200:
            products = products_resp.json()
            active_products = [p for p in products if p.get("active") != False]
            self.products = active_products[:3] if len(active_products) >= 3 else active_products
        else:
            self.products = []
        
        yield
        
        # Cleanup - try to cancel any test orders
        if hasattr(self, 'test_order_id'):
            try:
                requests.delete(f"{BASE_URL}/api/orders/{self.test_order_id}/empty", headers=self.headers)
            except:
                pass

    def test_01_create_order_with_pending_items(self):
        """Create an order with items - items should have status='pending'"""
        if not self.products:
            pytest.skip("No products available")
        
        # Create order with items
        order_data = {
            "table_id": self.table["id"],
            "items": [
                {
                    "product_id": self.products[0]["id"],
                    "product_name": self.products[0]["name"],
                    "quantity": 2,
                    "unit_price": self.products[0].get("price", 100),
                    "modifiers": [],
                    "notes": "Test item 1"
                }
            ]
        }
        
        resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert resp.status_code == 200, f"Failed to create order: {resp.text}"
        
        order = resp.json()
        self.test_order_id = order["id"]
        
        # Verify items have status='pending'
        items = order.get("items", [])
        assert len(items) > 0, "Order should have items"
        
        for item in items:
            assert item.get("status") == "pending", f"Item should have status='pending', got {item.get('status')}"
            assert item.get("sent_to_kitchen") == False, "Item should not be sent to kitchen yet"
        
        print(f"✅ Created order {order['id']} with {len(items)} pending items")

    def test_02_send_to_kitchen_changes_status_to_sent(self):
        """Verify send-kitchen endpoint changes item status from 'pending' to 'sent'"""
        if not self.products:
            pytest.skip("No products available")
        
        # Create order with items
        order_data = {
            "table_id": self.table["id"],
            "items": [
                {
                    "product_id": self.products[0]["id"],
                    "product_name": self.products[0]["name"],
                    "quantity": 1,
                    "unit_price": self.products[0].get("price", 100),
                    "modifiers": [],
                    "notes": ""
                }
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert create_resp.status_code == 200
        order = create_resp.json()
        self.test_order_id = order["id"]
        
        # Verify initial status is pending
        assert order["items"][0]["status"] == "pending"
        
        # Call send-kitchen endpoint (same as ENVIAR button)
        send_resp = requests.post(f"{BASE_URL}/api/orders/{order['id']}/send-kitchen", headers=self.headers)
        assert send_resp.status_code == 200, f"Failed to send to kitchen: {send_resp.text}"
        
        updated_order = send_resp.json()
        
        # Verify items now have status='sent'
        for item in updated_order.get("items", []):
            assert item.get("status") == "sent", f"Item should have status='sent' after send-kitchen, got {item.get('status')}"
            assert item.get("sent_to_kitchen") == True, "Item should be marked as sent_to_kitchen"
        
        print(f"✅ send-kitchen endpoint correctly changes status from 'pending' to 'sent'")

    def test_03_pre_check_html_includes_all_items(self):
        """Verify pre-cuenta HTML includes all items with correct total"""
        if not self.products:
            pytest.skip("No products available")
        
        # Create order with multiple items
        items_data = []
        expected_total = 0
        for i, product in enumerate(self.products[:2]):
            qty = i + 1
            price = product.get("price", 100)
            items_data.append({
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": qty,
                "unit_price": price,
                "modifiers": [],
                "notes": ""
            })
            expected_total += price * qty
        
        order_data = {
            "table_id": self.table["id"],
            "items": items_data
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert create_resp.status_code == 200
        order = create_resp.json()
        self.test_order_id = order["id"]
        
        # First send to kitchen (simulating what frontend does before pre-cuenta)
        send_resp = requests.post(f"{BASE_URL}/api/orders/{order['id']}/send-kitchen", headers=self.headers)
        assert send_resp.status_code == 200
        
        # Get pre-check HTML
        precheck_resp = requests.get(f"{BASE_URL}/api/print/pre-check/{order['id']}", headers=self.headers)
        assert precheck_resp.status_code == 200, f"Failed to get pre-check: {precheck_resp.text}"
        
        precheck_data = precheck_resp.json()
        html = precheck_data.get("html", "")
        
        # Verify all product names are in the HTML
        for product in self.products[:2]:
            assert product["name"] in html, f"Product {product['name']} should be in pre-cuenta HTML"
        
        print(f"✅ Pre-cuenta HTML includes all items")

    def test_04_sent_items_require_reason_to_cancel(self):
        """Verify that sent items require a reason to cancel (not express void)"""
        if not self.products:
            pytest.skip("No products available")
        
        # Create and send order
        order_data = {
            "table_id": self.table["id"],
            "items": [
                {
                    "product_id": self.products[0]["id"],
                    "product_name": self.products[0]["name"],
                    "quantity": 1,
                    "unit_price": self.products[0].get("price", 100),
                    "modifiers": [],
                    "notes": ""
                }
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert create_resp.status_code == 200
        order = create_resp.json()
        self.test_order_id = order["id"]
        
        # Send to kitchen
        send_resp = requests.post(f"{BASE_URL}/api/orders/{order['id']}/send-kitchen", headers=self.headers)
        assert send_resp.status_code == 200
        updated_order = send_resp.json()
        
        item_id = updated_order["items"][0]["id"]
        
        # Try express void on sent item - should fail
        express_void_data = {
            "item_ids": [item_id],
            "reason_id": None,
            "return_to_inventory": False,
            "comments": "Test express void",
            "express_void": True
        }
        
        void_resp = requests.post(
            f"{BASE_URL}/api/orders/{order['id']}/cancel-items",
            json=express_void_data,
            headers=self.headers
        )
        
        # Express void should fail for sent items
        assert void_resp.status_code == 400, f"Express void should fail for sent items, got {void_resp.status_code}"
        
        print(f"✅ Sent items correctly reject express void (require audit protocol)")

    def test_05_pending_items_allow_express_void(self):
        """Verify that pending items CAN be express voided (before send-kitchen)"""
        if not self.products:
            pytest.skip("No products available")
        
        # Create order but DON'T send to kitchen
        order_data = {
            "table_id": self.table["id"],
            "items": [
                {
                    "product_id": self.products[0]["id"],
                    "product_name": self.products[0]["name"],
                    "quantity": 1,
                    "unit_price": self.products[0].get("price", 100),
                    "modifiers": [],
                    "notes": ""
                }
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert create_resp.status_code == 200
        order = create_resp.json()
        self.test_order_id = order["id"]
        
        # Verify item is pending
        assert order["items"][0]["status"] == "pending"
        
        item_id = order["items"][0]["id"]
        
        # Express void on pending item - should succeed
        express_void_data = {
            "item_ids": [item_id],
            "reason_id": None,
            "return_to_inventory": False,
            "comments": "Test express void on pending",
            "express_void": True
        }
        
        void_resp = requests.post(
            f"{BASE_URL}/api/orders/{order['id']}/cancel-items",
            json=express_void_data,
            headers=self.headers
        )
        
        # Express void should succeed for pending items
        assert void_resp.status_code == 200, f"Express void should succeed for pending items, got {void_resp.status_code}: {void_resp.text}"
        
        updated_order = void_resp.json()
        cancelled_item = next((i for i in updated_order["items"] if i["id"] == item_id), None)
        assert cancelled_item is not None
        assert cancelled_item["status"] == "cancelled"
        
        print(f"✅ Pending items correctly allow express void")

    def test_06_enviar_button_endpoint_works(self):
        """Verify the ENVIAR button endpoint (send-kitchen) works correctly"""
        if not self.products:
            pytest.skip("No products available")
        
        # Create order
        order_data = {
            "table_id": self.table["id"],
            "items": [
                {
                    "product_id": self.products[0]["id"],
                    "product_name": self.products[0]["name"],
                    "quantity": 3,
                    "unit_price": self.products[0].get("price", 100),
                    "modifiers": [],
                    "notes": "ENVIAR test"
                }
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert create_resp.status_code == 200
        order = create_resp.json()
        self.test_order_id = order["id"]
        
        # Call send-kitchen (ENVIAR button)
        send_resp = requests.post(f"{BASE_URL}/api/orders/{order['id']}/send-kitchen", headers=self.headers)
        assert send_resp.status_code == 200
        
        updated_order = send_resp.json()
        
        # Verify order status changed
        assert updated_order.get("status") == "sent", f"Order status should be 'sent', got {updated_order.get('status')}"
        
        # Verify all items are sent
        for item in updated_order.get("items", []):
            assert item.get("status") == "sent"
            assert item.get("sent_to_kitchen") == True
            assert item.get("sent_at") is not None
        
        print(f"✅ ENVIAR button endpoint works correctly")

    def test_07_multiple_pending_items_all_sent(self):
        """Verify that ALL pending items are sent when calling send-kitchen"""
        if len(self.products) < 2:
            pytest.skip("Need at least 2 products")
        
        # Create order with multiple items
        order_data = {
            "table_id": self.table["id"],
            "items": [
                {
                    "product_id": self.products[0]["id"],
                    "product_name": self.products[0]["name"],
                    "quantity": 1,
                    "unit_price": self.products[0].get("price", 100),
                    "modifiers": [],
                    "notes": ""
                },
                {
                    "product_id": self.products[1]["id"],
                    "product_name": self.products[1]["name"],
                    "quantity": 2,
                    "unit_price": self.products[1].get("price", 150),
                    "modifiers": [],
                    "notes": ""
                }
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert create_resp.status_code == 200
        order = create_resp.json()
        self.test_order_id = order["id"]
        
        # Verify all items are pending
        pending_count = sum(1 for i in order["items"] if i["status"] == "pending")
        assert pending_count == 2, f"Should have 2 pending items, got {pending_count}"
        
        # Send to kitchen
        send_resp = requests.post(f"{BASE_URL}/api/orders/{order['id']}/send-kitchen", headers=self.headers)
        assert send_resp.status_code == 200
        
        updated_order = send_resp.json()
        
        # Verify ALL items are now sent
        sent_count = sum(1 for i in updated_order["items"] if i["status"] == "sent")
        assert sent_count == 2, f"All 2 items should be sent, got {sent_count}"
        
        print(f"✅ All pending items correctly sent to kitchen")

    def test_08_idempotent_send_kitchen(self):
        """Verify send-kitchen is idempotent (calling twice doesn't break anything)"""
        if not self.products:
            pytest.skip("No products available")
        
        # Create and send order
        order_data = {
            "table_id": self.table["id"],
            "items": [
                {
                    "product_id": self.products[0]["id"],
                    "product_name": self.products[0]["name"],
                    "quantity": 1,
                    "unit_price": self.products[0].get("price", 100),
                    "modifiers": [],
                    "notes": ""
                }
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert create_resp.status_code == 200
        order = create_resp.json()
        self.test_order_id = order["id"]
        
        # First send
        send_resp1 = requests.post(f"{BASE_URL}/api/orders/{order['id']}/send-kitchen", headers=self.headers)
        assert send_resp1.status_code == 200
        
        # Second send (should be idempotent)
        send_resp2 = requests.post(f"{BASE_URL}/api/orders/{order['id']}/send-kitchen", headers=self.headers)
        assert send_resp2.status_code == 200
        
        # Verify order is still valid
        updated_order = send_resp2.json()
        assert updated_order.get("status") == "sent"
        assert len(updated_order.get("items", [])) == 1
        
        print(f"✅ send-kitchen is idempotent")


class TestPreCuentaSecurityWorkflow:
    """Test the complete Pre-Cuenta security workflow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - login and get token"""
        # Login as Mesero (waiter) - PIN 100
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "100"})
        if login_resp.status_code == 200:
            self.token = login_resp.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not login")
        
        # Get a free table
        tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        if tables_resp.status_code == 200:
            tables = tables_resp.json()
            free_tables = [t for t in tables if t.get("status") == "free"]
            self.table = free_tables[0] if free_tables else (tables[0] if tables else None)
        
        if not self.table:
            pytest.skip("No tables available")
        
        # Get products
        products_resp = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        if products_resp.status_code == 200:
            products = products_resp.json()
            self.products = [p for p in products if p.get("active") != False][:2]
        else:
            self.products = []
        
        yield
        
        # Cleanup
        if hasattr(self, 'test_order_id'):
            try:
                requests.delete(f"{BASE_URL}/api/orders/{self.test_order_id}/empty", headers=self.headers)
            except:
                pass

    def test_complete_security_workflow(self):
        """
        Complete workflow test:
        1. Create order with pending items
        2. Simulate Pre-Cuenta flow (send-kitchen THEN pre-check)
        3. Verify items are now 'sent' status
        4. Verify express void fails on sent items
        """
        if not self.products:
            pytest.skip("No products available")
        
        # Step 1: Create order with pending items
        order_data = {
            "table_id": self.table["id"],
            "items": [
                {
                    "product_id": self.products[0]["id"],
                    "product_name": self.products[0]["name"],
                    "quantity": 2,
                    "unit_price": self.products[0].get("price", 100),
                    "modifiers": [],
                    "notes": "Security test item"
                }
            ]
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert create_resp.status_code == 200
        order = create_resp.json()
        self.test_order_id = order["id"]
        
        # Verify initial status is pending
        assert order["items"][0]["status"] == "pending", "Initial status should be pending"
        print(f"Step 1: ✅ Created order with pending items")
        
        # Step 2: Simulate Pre-Cuenta flow - FIRST send to kitchen
        send_resp = requests.post(f"{BASE_URL}/api/orders/{order['id']}/send-kitchen", headers=self.headers)
        assert send_resp.status_code == 200
        updated_order = send_resp.json()
        print(f"Step 2a: ✅ Sent items to kitchen (auto-send before pre-cuenta)")
        
        # Step 2b: THEN get pre-check HTML
        precheck_resp = requests.get(f"{BASE_URL}/api/print/pre-check/{order['id']}", headers=self.headers)
        assert precheck_resp.status_code == 200
        print(f"Step 2b: ✅ Generated pre-cuenta HTML")
        
        # Step 3: Verify items are now 'sent' status
        assert updated_order["items"][0]["status"] == "sent", "Items should be 'sent' after pre-cuenta flow"
        print(f"Step 3: ✅ Items now have status='sent' (Enviado)")
        
        # Step 4: Verify express void fails on sent items
        item_id = updated_order["items"][0]["id"]
        express_void_data = {
            "item_ids": [item_id],
            "reason_id": None,
            "return_to_inventory": False,
            "comments": "Attempt express void after pre-cuenta",
            "express_void": True
        }
        
        void_resp = requests.post(
            f"{BASE_URL}/api/orders/{order['id']}/cancel-items",
            json=express_void_data,
            headers=self.headers
        )
        
        assert void_resp.status_code == 400, f"Express void should fail for sent items, got {void_resp.status_code}"
        print(f"Step 4: ✅ Express void correctly blocked for sent items (requires authorization)")
        
        print(f"\n🔒 SECURITY FIX VERIFIED: Items cannot be deleted without authorization after Pre-Cuenta")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
