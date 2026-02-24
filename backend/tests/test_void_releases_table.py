"""
Test: Void Items Release Table Feature
========================================
When ALL items of an order are voided (cancelled), the table should:
1. Order status changes to 'cancelled'
2. Table status changes to 'free'
3. Table active_order_id becomes null

This tests 3 scenarios:
- Express void (pending items only)
- Bulk cancel with audit protocol
- Single item cancel (when it's the last active item)
"""

import pytest
import requests
import os
import uuid

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL not set", allow_module_level=True)


class TestVoidReleasesTable:
    """Test that voiding all items releases the table"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token and find a free table"""
        # Login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"pin": "10000"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        # Get free tables
        tables_response = requests.get(f"{BASE_URL}/api/tables")
        assert tables_response.status_code == 200
        free_tables = [t for t in tables_response.json() if t["status"] == "free"]
        assert len(free_tables) >= 3, "Need at least 3 free tables for tests"
        self.free_tables = free_tables[:3]
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products")
        assert products_response.status_code == 200
        products = products_response.json()
        assert len(products) >= 1, "Need at least 1 product for tests"
        self.test_product = products[0]
    
    def test_01_express_void_all_items_releases_table(self):
        """
        TEST: Express void all pending items should:
        - Set order status to 'cancelled'
        - Set table status to 'free'
        - Set table active_order_id to null
        """
        table = self.free_tables[0]
        table_id = table["id"]
        
        # 1. Verify table is initially free (fetch all tables and filter)
        all_tables = requests.get(f"{BASE_URL}/api/tables").json()
        table_before = next((t for t in all_tables if t["id"] == table_id), None)
        assert table_before is not None, f"Table {table_id} not found"
        assert table_before["status"] == "free", f"Expected table to be free, got {table_before['status']}"
        
        # 2. Create order with 2 items (pending, not sent to kitchen)
        # Use different notes to prevent item merging
        create_response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=self.headers,
            json={
                "table_id": table_id,
                "items": [
                    {
                        "product_id": self.test_product["id"],
                        "product_name": self.test_product["name"],
                        "quantity": 1,
                        "unit_price": self.test_product.get("price", 100),
                        "notes": "Item 1 for void test"
                    },
                    {
                        "product_id": self.test_product["id"],
                        "product_name": self.test_product["name"],
                        "quantity": 2,
                        "unit_price": self.test_product.get("price", 100),
                        "notes": "Item 2 for void test"
                    }
                ]
            }
        )
        assert create_response.status_code == 200, f"Create order failed: {create_response.text}"
        order = create_response.json()
        order_id = order["id"]
        item_ids = [item["id"] for item in order["items"]]
        
        # 3. Verify table is now occupied (fetch all tables and filter)
        all_tables = requests.get(f"{BASE_URL}/api/tables").json()
        table_after_create = next((t for t in all_tables if t["id"] == table_id), None)
        assert table_after_create["status"] == "occupied", f"Expected occupied, got {table_after_create['status']}"
        assert table_after_create["active_order_id"] == order_id
        
        # 4. Express void ALL items
        void_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-items",
            headers=self.headers,
            json={
                "item_ids": item_ids,
                "express_void": True,
                "comments": "TEST: Express void all items"
            }
        )
        assert void_response.status_code == 200, f"Express void failed: {void_response.text}"
        void_result = void_response.json()
        
        # 5. VERIFY: Order status should be 'cancelled'
        assert void_result["status"] == "cancelled", f"Expected order status 'cancelled', got {void_result['status']}"
        
        # 6. VERIFY: Table should be 'free' and active_order_id should be null
        all_tables = requests.get(f"{BASE_URL}/api/tables").json()
        table_after_void = next((t for t in all_tables if t["id"] == table_id), None)
        assert table_after_void["status"] == "free", f"Expected table status 'free', got {table_after_void['status']}"
        assert table_after_void.get("active_order_id") is None, f"Expected active_order_id=None, got {table_after_void.get('active_order_id')}"
        
        print(f"✓ Express void: Order {order_id} cancelled, Table {table['number']} released to 'free'")
    
    def test_02_partial_void_does_NOT_release_table(self):
        """
        TEST: Voiding SOME items (not all) should NOT release the table
        - Order should remain 'active' or 'sent'
        - Table should remain 'occupied'
        """
        table = self.free_tables[1]
        table_id = table["id"]
        
        # 1. Create order with 2 items (using different notes to prevent merge)
        create_response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=self.headers,
            json={
                "table_id": table_id,
                "items": [
                    {
                        "product_id": self.test_product["id"],
                        "product_name": self.test_product["name"],
                        "quantity": 1,
                        "unit_price": self.test_product.get("price", 100),
                        "notes": "Item to void"
                    },
                    {
                        "product_id": self.test_product["id"],
                        "product_name": "Item to keep",
                        "quantity": 1,
                        "unit_price": 50,
                        "notes": "Keep this item"
                    }
                ]
            }
        )
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order["id"]
        
        # 2. Void ONLY the first item (keep the second)
        first_item_id = order["items"][0]["id"]
        void_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-items",
            headers=self.headers,
            json={
                "item_ids": [first_item_id],  # Only void 1 item
                "express_void": True,
                "comments": "TEST: Partial void"
            }
        )
        assert void_response.status_code == 200
        void_result = void_response.json()
        
        # 3. VERIFY: Order should NOT be cancelled (still has active items)
        assert void_result["status"] != "cancelled", f"Order should NOT be cancelled when items remain active"
        
        # 4. VERIFY: Table should still be occupied
        all_tables = requests.get(f"{BASE_URL}/api/tables").json()
        table_after = next((t for t in all_tables if t["id"] == table_id), None)
        assert table_after["status"] == "occupied", f"Table should remain occupied, got {table_after['status']}"
        assert table_after["active_order_id"] == order_id
        
        # Cleanup: void the remaining item to release the table
        second_item_id = order["items"][1]["id"]
        cleanup_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-items",
            headers=self.headers,
            json={"item_ids": [second_item_id], "express_void": True}
        )
        assert cleanup_response.status_code == 200
        
        # Now table should be free
        all_tables = requests.get(f"{BASE_URL}/api/tables").json()
        table_final = next((t for t in all_tables if t["id"] == table_id), None)
        assert table_final["status"] == "free"
        
        print(f"✓ Partial void: Table {table['number']} stayed occupied until all items voided")
    
    def test_03_single_item_cancel_releases_table_when_last_item(self):
        """
        TEST: Using single item cancel endpoint when it's the only/last item
        - Should set order to 'cancelled'
        - Should release table to 'free'
        """
        table = self.free_tables[2]
        table_id = table["id"]
        
        # 1. Create order with only 1 item
        create_response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=self.headers,
            json={
                "table_id": table_id,
                "items": [
                    {
                        "product_id": self.test_product["id"],
                        "product_name": self.test_product["name"],
                        "quantity": 1,
                        "unit_price": self.test_product.get("price", 100)
                    }
                ]
            }
        )
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order["id"]
        item_id = order["items"][0]["id"]
        
        # 2. Verify table is occupied
        all_tables = requests.get(f"{BASE_URL}/api/tables").json()
        table_after_create = next((t for t in all_tables if t["id"] == table_id), None)
        assert table_after_create["status"] == "occupied"
        
        # 3. Get a cancellation reason for single item cancel (no manager auth required)
        reasons_response = requests.get(f"{BASE_URL}/api/cancellation-reasons")
        reasons = reasons_response.json() if reasons_response.status_code == 200 else []
        # Find a reason that doesn't require manager auth
        no_auth_reason = next((r for r in reasons if not r.get("requires_manager_auth", False)), None)
        reason_id = no_auth_reason["id"] if no_auth_reason else None
        
        # If no reasons exist, create one
        if not reason_id:
            create_reason = requests.post(
                f"{BASE_URL}/api/cancellation-reasons",
                headers=self.headers,
                json={"name": "TEST_VOID_REASON", "requires_manager_auth": False}
            )
            if create_reason.status_code == 200:
                reason_id = create_reason.json()["id"]
            else:
                # Try without reason using bulk endpoint
                void_response = requests.post(
                    f"{BASE_URL}/api/orders/{order_id}/cancel-items",
                    headers=self.headers,
                    json={"item_ids": [item_id], "express_void": True}
                )
                assert void_response.status_code == 200
                void_result = void_response.json()
                
                assert void_result["status"] == "cancelled"
                all_tables = requests.get(f"{BASE_URL}/api/tables").json()
                table_after = next((t for t in all_tables if t["id"] == table_id), None)
                assert table_after["status"] == "free"
                print(f"✓ Single item void (via express): Order cancelled, Table {table['number']} released")
                return
        
        # 4. Cancel single item using single item endpoint
        cancel_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-item/{item_id}",
            headers=self.headers,
            json={
                "reason_id": reason_id,
                "return_to_inventory": False,
                "comments": "TEST: Single item cancel - last item"
            }
        )
        assert cancel_response.status_code == 200, f"Single item cancel failed: {cancel_response.text}"
        cancel_result = cancel_response.json()
        
        # 5. VERIFY: Order should be 'cancelled'
        assert cancel_result["status"] == "cancelled", f"Expected order 'cancelled', got {cancel_result['status']}"
        
        # 6. VERIFY: Table should be 'free'
        all_tables = requests.get(f"{BASE_URL}/api/tables").json()
        table_after = next((t for t in all_tables if t["id"] == table_id), None)
        assert table_after["status"] == "free", f"Expected table 'free', got {table_after['status']}"
        assert table_after.get("active_order_id") is None
        
        print(f"✓ Single item cancel: Order {order_id} cancelled, Table {table['number']} released")


class TestBulkCancelWithAuditReleasesTable:
    """Test bulk cancel with audit protocol also releases table when all items voided"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token and find a free table"""
        # Login
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"pin": "10000"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        # Get free tables
        tables_response = requests.get(f"{BASE_URL}/api/tables")
        free_tables = [t for t in tables_response.json() if t["status"] == "free"]
        if len(free_tables) < 1:
            pytest.skip("No free tables available for audit cancel test")
        self.free_table = free_tables[0]
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        if not products:
            pytest.skip("No products available")
        self.test_product = products[0]
        
        # Get or create cancellation reason that doesn't require manager auth
        reasons_response = requests.get(f"{BASE_URL}/api/cancellation-reasons")
        reasons = reasons_response.json() if reasons_response.status_code == 200 else []
        # Find a reason that doesn't require manager auth
        no_auth_reason = next((r for r in reasons if not r.get("requires_manager_auth", False)), None)
        if no_auth_reason:
            self.reason_id = no_auth_reason["id"]
        else:
            # Create a test reason without manager auth
            create_reason = requests.post(
                f"{BASE_URL}/api/cancellation-reasons",
                headers=self.headers,
                json={"name": "TEST_AUDIT_REASON_NO_AUTH", "requires_manager_auth": False}
            )
            if create_reason.status_code == 200:
                self.reason_id = create_reason.json()["id"]
            else:
                self.reason_id = None
    
    def test_bulk_cancel_audit_protocol_releases_table(self):
        """
        TEST: Bulk cancel with audit protocol (express_void=False) should also release table
        """
        if not self.reason_id:
            pytest.skip("No cancellation reason available")
        
        table = self.free_table
        table_id = table["id"]
        
        # 1. Create order
        create_response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=self.headers,
            json={
                "table_id": table_id,
                "items": [
                    {
                        "product_id": self.test_product["id"],
                        "product_name": self.test_product["name"],
                        "quantity": 2,
                        "unit_price": self.test_product.get("price", 100)
                    }
                ]
            }
        )
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order["id"]
        item_ids = [item["id"] for item in order["items"]]
        
        # 2. Verify table occupied
        all_tables = requests.get(f"{BASE_URL}/api/tables").json()
        table_check = next((t for t in all_tables if t["id"] == table_id), None)
        assert table_check["status"] == "occupied"
        
        # 3. Bulk cancel with audit protocol (express_void=False)
        cancel_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-items",
            headers=self.headers,
            json={
                "item_ids": item_ids,
                "reason_id": self.reason_id,
                "return_to_inventory": False,
                "comments": "TEST: Bulk cancel with audit",
                "express_void": False  # Use audit protocol
            }
        )
        assert cancel_response.status_code == 200, f"Bulk cancel failed: {cancel_response.text}"
        cancel_result = cancel_response.json()
        
        # 4. VERIFY: Order status cancelled
        assert cancel_result["status"] == "cancelled", f"Expected 'cancelled', got {cancel_result['status']}"
        
        # 5. VERIFY: Table released
        all_tables = requests.get(f"{BASE_URL}/api/tables").json()
        table_after = next((t for t in all_tables if t["id"] == table_id), None)
        assert table_after["status"] == "free", f"Expected 'free', got {table_after['status']}"
        assert table_after.get("active_order_id") is None
        
        print(f"✓ Bulk cancel (audit): Order cancelled, Table {table['number']} released")


class TestEdgeCases:
    """Test edge cases for void table release"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"pin": "10000"}
        )
        assert login_response.status_code == 200
        self.token = login_response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        tables_response = requests.get(f"{BASE_URL}/api/tables")
        free_tables = [t for t in tables_response.json() if t["status"] == "free"]
        if len(free_tables) < 1:
            pytest.skip("No free tables for edge case tests")
        self.free_table = free_tables[0]
        
        products_response = requests.get(f"{BASE_URL}/api/products")
        products = products_response.json()
        if not products:
            pytest.skip("No products")
        self.test_product = products[0]
    
    def test_order_with_items_added_later_then_all_voided(self):
        """
        TEST: Create order, add items later, then void ALL items
        - Table should be released
        """
        table = self.free_table
        table_id = table["id"]
        
        # 1. Create order with 1 item
        create_response = requests.post(
            f"{BASE_URL}/api/orders",
            headers=self.headers,
            json={
                "table_id": table_id,
                "items": [
                    {
                        "product_id": self.test_product["id"],
                        "product_name": "Initial Item",
                        "quantity": 1,
                        "unit_price": 50
                    }
                ]
            }
        )
        assert create_response.status_code == 200
        order = create_response.json()
        order_id = order["id"]
        
        # 2. Add more items (with notes to prevent merge)
        add_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/items",
            headers=self.headers,
            json={
                "items": [
                    {
                        "product_id": self.test_product["id"],
                        "product_name": "Added Item",
                        "quantity": 1,
                        "unit_price": 75,
                        "notes": "Added item for void test"
                    }
                ]
            }
        )
        assert add_response.status_code == 200
        updated_order = add_response.json()
        
        # 3. Get all item IDs
        all_item_ids = [item["id"] for item in updated_order["items"]]
        assert len(all_item_ids) >= 2, "Should have at least 2 items"
        
        # 4. Void ALL items
        void_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/cancel-items",
            headers=self.headers,
            json={
                "item_ids": all_item_ids,
                "express_void": True,
                "comments": "TEST: Void all after adding items"
            }
        )
        assert void_response.status_code == 200
        void_result = void_response.json()
        
        # 5. VERIFY
        assert void_result["status"] == "cancelled"
        
        all_tables = requests.get(f"{BASE_URL}/api/tables").json()
        table_after = next((t for t in all_tables if t["id"] == table_id), None)
        assert table_after["status"] == "free"
        assert table_after.get("active_order_id") is None
        
        print(f"✓ Items added then all voided: Table {table['number']} released")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
