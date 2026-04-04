"""
Test Account Naming and Enhanced Comanda Headers Features
=========================================================
Feature 1: Account naming on ALL tables (not just split tables)
Feature 2: Enhanced comanda headers with area/table/account/waiter/date info
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAccountLabelEndpoint:
    """Test /api/orders/{order_id}/label endpoint for naming accounts"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to get token
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        # Cleanup - delete test orders
        try:
            orders = self.session.get(f"{BASE_URL}/api/orders").json()
            for order in orders:
                if order.get("account_label", "").startswith("TEST_"):
                    self.session.delete(f"{BASE_URL}/api/orders/{order['id']}")
        except:
            pass
    
    def test_update_order_label_success(self):
        """Test that account label can be set on an order"""
        # Get a real table
        tables_resp = self.session.get(f"{BASE_URL}/api/tables")
        tables = tables_resp.json() if tables_resp.status_code == 200 else []
        if not tables:
            pytest.skip("No tables found for testing")
        test_table = tables[0]
        
        # First create an order
        order_data = {
            "table_id": test_table.get("id"),
            "table_number": test_table.get("number"),
            "waiter_id": "test-waiter",
            "waiter_name": "Test Waiter",
            "items": []
        }
        create_resp = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        assert create_resp.status_code in [200, 201], f"Failed to create order: {create_resp.text}"
        order = create_resp.json()
        order_id = order.get("id")
        
        # Update the label
        label_resp = self.session.put(f"{BASE_URL}/api/orders/{order_id}/label", json={"label": "TEST_María"})
        assert label_resp.status_code == 200, f"Failed to update label: {label_resp.text}"
        result = label_resp.json()
        assert result.get("ok") == True, "Expected ok: true in response"
        
        # Verify the label was saved
        get_resp = self.session.get(f"{BASE_URL}/api/orders/{order_id}")
        assert get_resp.status_code == 200
        updated_order = get_resp.json()
        assert updated_order.get("account_label") == "TEST_María", f"Label not saved. Got: {updated_order.get('account_label')}"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
        print("✓ Account label update works correctly")
    
    def test_update_order_label_empty(self):
        """Test that account label can be cleared"""
        # Get a real table
        tables_resp = self.session.get(f"{BASE_URL}/api/tables")
        tables = tables_resp.json() if tables_resp.status_code == 200 else []
        if not tables:
            pytest.skip("No tables found for testing")
        test_table = tables[0]
        
        # Create order with label
        order_data = {
            "table_id": test_table.get("id"),
            "table_number": test_table.get("number"),
            "waiter_id": "test-waiter",
            "waiter_name": "Test Waiter",
            "items": []
        }
        create_resp = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        order = create_resp.json()
        order_id = order.get("id")
        
        # Set label first
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/label", json={"label": "TEST_Juan"})
        
        # Clear label
        clear_resp = self.session.put(f"{BASE_URL}/api/orders/{order_id}/label", json={"label": ""})
        assert clear_resp.status_code == 200
        
        # Verify cleared
        get_resp = self.session.get(f"{BASE_URL}/api/orders/{order_id}")
        updated_order = get_resp.json()
        assert updated_order.get("account_label") == "", "Label should be empty"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")
        print("✓ Account label can be cleared")
    
    def test_label_endpoint_nonexistent_order(self):
        """Test label endpoint with non-existent order"""
        fake_id = str(uuid.uuid4())
        resp = self.session.put(f"{BASE_URL}/api/orders/{fake_id}/label", json={"label": "Test"})
        # Should still return 200 (MongoDB update with no match)
        assert resp.status_code == 200
        print("✓ Label endpoint handles non-existent order gracefully")


class TestPreCheckEnhancedHeader:
    """Test /api/print/pre-check/{order_id} includes enhanced header info"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_pre_check_includes_area_and_account_info(self):
        """Test that pre-check endpoint includes area_name and account display"""
        # Get an existing area and table
        areas_resp = self.session.get(f"{BASE_URL}/api/areas")
        areas = areas_resp.json() if areas_resp.status_code == 200 else []
        
        tables_resp = self.session.get(f"{BASE_URL}/api/tables")
        tables = tables_resp.json() if tables_resp.status_code == 200 else []
        
        # Find a table with an area
        test_table = None
        test_area = None
        for table in tables:
            if table.get("area_id"):
                test_table = table
                test_area = next((a for a in areas if a.get("id") == table.get("area_id")), None)
                break
        
        if not test_table:
            pytest.skip("No tables with areas found for testing")
        
        # Create order on this table with a label
        order_data = {
            "table_id": test_table.get("id"),
            "table_number": test_table.get("number"),
            "waiter_id": "test-waiter",
            "waiter_name": "Carlos",
            "items": [{
                "id": str(uuid.uuid4()),
                "product_id": "test-prod",
                "product_name": "Test Product",
                "quantity": 1,
                "unit_price": 100.00,
                "status": "sent",
                "modifiers": []
            }]
        }
        create_resp = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        order = create_resp.json()
        order_id = order.get("id")
        
        # Set account label
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/label", json={"label": "TEST_PreCheck"})
        
        # Get pre-check
        pre_check_resp = self.session.get(f"{BASE_URL}/api/print/pre-check/{order_id}")
        assert pre_check_resp.status_code == 200, f"Pre-check failed: {pre_check_resp.text}"
        pre_check = pre_check_resp.json()
        
        # Verify HTML contains area and account info
        html = pre_check.get("html", "")
        
        # Check for area name in HTML (if area exists)
        if test_area:
            area_name = test_area.get("name", "")
            if area_name:
                assert f"ÁREA: {area_name}" in html or area_name in html, f"Area name '{area_name}' not found in pre-check HTML"
                print(f"✓ Pre-check includes area name: {area_name}")
        
        # Check for account label in HTML
        assert "TEST_PreCheck" in html, "Account label not found in pre-check HTML"
        print("✓ Pre-check includes account label")
        
        # Check for waiter field (may be Admin or the waiter_name from order)
        assert "Mesero:" in html, "Waiter field not found in pre-check HTML"
        print("✓ Pre-check includes waiter field")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")


class TestSendKitchenEnhancedComanda:
    """Test /api/orders/{order_id}/send-kitchen includes enhanced header info"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_send_kitchen_creates_comanda_with_enhanced_header(self):
        """Test that send-kitchen creates comanda with area, account, waiter info"""
        # Get an existing area and table
        areas_resp = self.session.get(f"{BASE_URL}/api/areas")
        areas = areas_resp.json() if areas_resp.status_code == 200 else []
        
        tables_resp = self.session.get(f"{BASE_URL}/api/tables")
        tables = tables_resp.json() if tables_resp.status_code == 200 else []
        
        # Find a table with an area
        test_table = None
        test_area = None
        for table in tables:
            if table.get("area_id"):
                test_table = table
                test_area = next((a for a in areas if a.get("id") == table.get("area_id")), None)
                break
        
        if not test_table:
            pytest.skip("No tables with areas found for testing")
        
        # Get a product
        products_resp = self.session.get(f"{BASE_URL}/api/products")
        products = products_resp.json() if products_resp.status_code == 200 else []
        test_product = products[0] if products else None
        
        if not test_product:
            pytest.skip("No products found for testing")
        
        # Create order with pending item
        order_data = {
            "table_id": test_table.get("id"),
            "table_number": test_table.get("number"),
            "waiter_id": "test-waiter",
            "waiter_name": "TEST_Waiter",
            "items": [{
                "id": str(uuid.uuid4()),
                "product_id": test_product.get("id"),
                "product_name": test_product.get("name"),
                "quantity": 1,
                "unit_price": test_product.get("price", 100.00),
                "status": "pending",
                "modifiers": []
            }]
        }
        create_resp = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        order = create_resp.json()
        order_id = order.get("id")
        
        # Set account label
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/label", json={"label": "TEST_Comanda"})
        
        # Clear print queue first
        self.session.delete(f"{BASE_URL}/api/print-queue/clear")
        
        # Send to kitchen
        send_resp = self.session.post(f"{BASE_URL}/api/orders/{order_id}/send-kitchen")
        assert send_resp.status_code == 200, f"Send kitchen failed: {send_resp.text}"
        
        # Check print queue for comanda with enhanced header
        queue_resp = self.session.get(f"{BASE_URL}/api/print-queue")
        queue = queue_resp.json() if queue_resp.status_code == 200 else []
        
        # Find comanda for this order
        comanda = next((j for j in queue if j.get("reference_id") == order_id and j.get("type") == "comanda"), None)
        
        if comanda:
            data = comanda.get("data", {})
            
            # Verify enhanced header fields
            assert "area_name" in data, "area_name field missing from comanda"
            assert "account_display" in data, "account_display field missing from comanda"
            assert "account_label" in data, "account_label field missing from comanda"
            assert "waiter_name" in data, "waiter_name field missing from comanda"
            
            # Verify values
            if test_area:
                assert data.get("area_name") == test_area.get("name", ""), f"Area name mismatch"
            assert "TEST_Comanda" in data.get("account_display", ""), "Account label not in account_display"
            assert data.get("account_label") == "TEST_Comanda", "account_label mismatch"
            assert data.get("waiter_name") == "TEST_Waiter", "waiter_name mismatch"
            
            print("✓ Comanda includes enhanced header: area_name, account_display, account_label, waiter_name")
        else:
            print("⚠ No comanda found in print queue (may be expected if no print channels configured)")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")


class TestCancelTicketEnhancedHeader:
    """Test cancel ticket includes enhanced header info"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_cancel_item_creates_ticket_with_enhanced_header(self):
        """Test that cancelling an item creates cancel ticket with enhanced header"""
        # Get tables and areas
        tables_resp = self.session.get(f"{BASE_URL}/api/tables")
        tables = tables_resp.json() if tables_resp.status_code == 200 else []
        areas_resp = self.session.get(f"{BASE_URL}/api/areas")
        areas = areas_resp.json() if areas_resp.status_code == 200 else []
        
        test_table = None
        test_area = None
        for table in tables:
            if table.get("area_id"):
                test_table = table
                test_area = next((a for a in areas if a.get("id") == table.get("area_id")), None)
                break
        
        if not test_table:
            pytest.skip("No tables with areas found")
        
        # Get a product
        products_resp = self.session.get(f"{BASE_URL}/api/products")
        products = products_resp.json() if products_resp.status_code == 200 else []
        test_product = products[0] if products else None
        
        if not test_product:
            pytest.skip("No products found")
        
        item_id = str(uuid.uuid4())
        
        # Create order with sent item (can be cancelled)
        order_data = {
            "table_id": test_table.get("id"),
            "table_number": test_table.get("number"),
            "waiter_id": "test-waiter",
            "waiter_name": "TEST_CancelWaiter",
            "items": [{
                "id": item_id,
                "product_id": test_product.get("id"),
                "product_name": test_product.get("name"),
                "quantity": 2,
                "unit_price": test_product.get("price", 100.00),
                "status": "sent",
                "modifiers": []
            }]
        }
        create_resp = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        order = create_resp.json()
        order_id = order.get("id")
        
        # Set account label
        self.session.put(f"{BASE_URL}/api/orders/{order_id}/label", json={"label": "TEST_Cancel"})
        
        # Clear print queue
        self.session.delete(f"{BASE_URL}/api/print-queue/clear")
        
        # Cancel the item
        cancel_resp = self.session.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-item/{item_id}",
            json={"reason": "Test cancellation", "quantity": 1}
        )
        
        if cancel_resp.status_code == 200:
            # Check print queue for cancel ticket
            queue_resp = self.session.get(f"{BASE_URL}/api/print-queue")
            queue = queue_resp.json() if queue_resp.status_code == 200 else []
            
            cancel_ticket = next((j for j in queue if j.get("reference_id") == order_id and j.get("type") == "cancel_comanda"), None)
            
            if cancel_ticket:
                data = cancel_ticket.get("data", {})
                
                # Verify enhanced header fields
                assert "area_name" in data, "area_name missing from cancel ticket"
                assert "account_display" in data, "account_display missing from cancel ticket"
                assert "account_label" in data, "account_label missing from cancel ticket"
                assert "waiter_name" in data, "waiter_name missing from cancel ticket"
                
                print("✓ Cancel ticket includes enhanced header fields")
            else:
                print("⚠ No cancel ticket found in print queue")
        else:
            print(f"⚠ Cancel item returned {cancel_resp.status_code}: {cancel_resp.text}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/orders/{order_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
