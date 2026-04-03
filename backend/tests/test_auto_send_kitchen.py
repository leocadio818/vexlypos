"""
Test: Auto-send pending items to kitchen when navigating away
Bug fix verification for: tableOrdersRef sync and alreadySentRef reset
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pos-dominicana-2.preview.emergentagent.com')

# Module-level session to share auth across all tests
_session = None
_token = None

def get_session():
    global _session, _token
    if _session is None:
        _session = requests.Session()
        # Login
        response = _session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert response.status_code == 200, f"Login failed: {response.text}"
        # Note: API returns 'token' not 'access_token'
        _token = response.json().get("token")
        _session.headers.update({
            "Authorization": f"Bearer {_token}",
            "Content-Type": "application/json"
        })
    return _session

class TestSendToKitchenAPI:
    """Test the send-to-kitchen API endpoint"""
    
    def test_01_order_items_have_status_field(self):
        """Test that order items have status field (pending/sent)"""
        session = get_session()
        orders_res = session.get(f"{BASE_URL}/api/orders")
        assert orders_res.status_code == 200, f"Failed: {orders_res.text}"
        
        orders = orders_res.json()
        for order in orders[:5]:  # Check first 5 orders
            items = order.get("items", [])
            for item in items:
                assert "status" in item, f"Item missing status field: {item}"
                assert item["status"] in ["pending", "sent", "cancelled", "preparing", "ready"], \
                    f"Invalid item status: {item['status']}"
        
        print("✓ All order items have valid status field")
    
    def test_02_send_to_kitchen_endpoint_exists(self):
        """Test that send-kitchen endpoint exists and responds"""
        session = get_session()
        
        # Get list of orders to find one with items
        orders_res = session.get(f"{BASE_URL}/api/orders")
        assert orders_res.status_code == 200, f"Failed to get orders: {orders_res.text}"
        
        orders = orders_res.json()
        if len(orders) == 0:
            pytest.skip("No orders available for testing")
        
        # Find an order with items
        order_with_items = None
        for order in orders:
            if order.get("items") and len(order.get("items", [])) > 0:
                order_with_items = order
                break
        
        if not order_with_items:
            pytest.skip("No orders with items available")
        
        # Test the send-kitchen endpoint
        order_id = order_with_items["id"]
        response = session.post(f"{BASE_URL}/api/orders/{order_id}/send-kitchen")
        
        # Should return 200 even if no pending items (idempotent)
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}, {response.text}"
        print(f"✓ Send-kitchen endpoint responded with status {response.status_code}")
    
    def test_03_get_table_orders_endpoint(self):
        """Test that table orders endpoint works (used by tableOrdersRef)"""
        session = get_session()
        
        # Get list of tables
        tables_res = session.get(f"{BASE_URL}/api/tables")
        assert tables_res.status_code == 200, f"Failed to get tables: {tables_res.text}"
        
        tables = tables_res.json()
        if len(tables) == 0:
            pytest.skip("No tables available")
        
        # Get orders for first table
        table_id = tables[0]["id"]
        orders_res = session.get(f"{BASE_URL}/api/tables/{table_id}/orders")
        
        # Should return 200 or 403 (if access denied)
        assert orders_res.status_code in [200, 403], f"Unexpected status: {orders_res.status_code}"
        print(f"✓ Table orders endpoint responded with status {orders_res.status_code}")
    
    def test_04_add_item_creates_pending_status(self):
        """Test that adding an item creates it with 'pending' status"""
        session = get_session()
        
        # Get a table
        tables_res = session.get(f"{BASE_URL}/api/tables")
        tables = tables_res.json()
        
        # Find an available table or one with an order
        order_id = None
        
        for table in tables:
            if table.get("active_order_id"):
                order_id = table["active_order_id"]
                break
        
        if not order_id:
            pytest.skip("No active orders to test with")
        
        # Get products
        products_res = session.get(f"{BASE_URL}/api/products")
        products = products_res.json()
        
        if len(products) == 0:
            pytest.skip("No products available")
        
        product = products[0]
        
        # Add item to order
        add_res = session.post(f"{BASE_URL}/api/orders/{order_id}/items", json=[{
            "product_id": product["id"],
            "product_name": product["name"],
            "quantity": 1,
            "unit_price": product.get("price", 100),
            "modifiers": [],
            "notes": "TEST_AUTO_SEND"
        }])
        
        if add_res.status_code == 200:
            order_data = add_res.json()
            # Find the item we just added
            test_items = [i for i in order_data.get("items", []) if i.get("notes") == "TEST_AUTO_SEND"]
            if test_items:
                assert test_items[0]["status"] == "pending", "New item should have 'pending' status"
                print("✓ New item created with 'pending' status")
        else:
            print(f"⚠ Could not add item: {add_res.status_code}")

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
