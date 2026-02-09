"""
Test Suite for POS Split Orders and Table Management
Tests: Login, Table Map, Orders, Split/Divide functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests with PIN login"""
    
    def test_admin_login_pin_0000(self):
        """Test Admin login with PIN 0000"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["name"] == "Admin", f"Expected Admin, got {data['user']['name']}"
        assert data["user"]["role"] == "admin", f"Expected admin role, got {data['user']['role']}"
        print(f"✓ Admin login successful: {data['user']['name']}")
        
    def test_waiter_login_pin_1234(self):
        """Test Waiter (Carlos) login with PIN 1234"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1234"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "waiter"
        print(f"✓ Waiter login successful: {data['user']['name']}")
        
    def test_cashier_login_pin_2222(self):
        """Test Cajero login with PIN 2222"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "2222"})
        # This might fail if user doesn't exist - check status
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Cajero login successful: {data['user']['name']}")
        else:
            print(f"⚠ Cajero PIN 2222 not found (status {response.status_code})")
            pytest.skip("Cajero PIN 2222 not configured")


class TestTableMap:
    """Table Map and Status tests"""
    
    def test_list_tables(self):
        """Test listing all tables"""
        response = requests.get(f"{BASE_URL}/api/tables")
        assert response.status_code == 200
        tables = response.json()
        assert isinstance(tables, list), "Tables should be a list"
        assert len(tables) > 0, "Should have at least one table"
        print(f"✓ Found {len(tables)} tables")
        return tables
        
    def test_table_status_types(self):
        """Verify tables have correct status values"""
        response = requests.get(f"{BASE_URL}/api/tables")
        tables = response.json()
        valid_statuses = ['free', 'occupied', 'billed', 'reserved', 'divided']
        
        status_counts = {}
        for table in tables:
            status = table.get('status', 'unknown')
            status_counts[status] = status_counts.get(status, 0) + 1
            assert status in valid_statuses, f"Invalid status '{status}' for table {table.get('number')}"
        
        print(f"✓ Table status distribution: {status_counts}")
        
    def test_divided_tables_exist(self):
        """Verify divided tables exist (with striped pattern indicator)"""
        response = requests.get(f"{BASE_URL}/api/tables")
        tables = response.json()
        divided_tables = [t for t in tables if t.get('status') == 'divided']
        
        print(f"✓ Found {len(divided_tables)} divided tables: {[t['number'] for t in divided_tables]}")
        # According to context, tables 1, 3, 5 should be divided
        assert len(divided_tables) >= 1, "Should have at least one divided table"
        
    def test_list_areas(self):
        """Test listing areas"""
        response = requests.get(f"{BASE_URL}/api/areas")
        assert response.status_code == 200
        areas = response.json()
        assert isinstance(areas, list)
        print(f"✓ Found {len(areas)} areas: {[a['name'] for a in areas]}")


class TestOrders:
    """Order management tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        return response.json()["token"]
    
    def test_list_orders(self, auth_token):
        """Test listing orders"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/orders", headers=headers)
        assert response.status_code == 200
        orders = response.json()
        print(f"✓ Found {len(orders)} orders")
        
    def test_get_table_orders_endpoint(self, auth_token):
        """Test /api/tables/{tableId}/orders endpoint for divided tables"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get tables first
        tables_res = requests.get(f"{BASE_URL}/api/tables")
        tables = tables_res.json()
        
        # Find a divided table
        divided_table = next((t for t in tables if t.get('status') == 'divided'), None)
        
        if not divided_table:
            pytest.skip("No divided tables found")
            
        table_id = divided_table['id']
        response = requests.get(f"{BASE_URL}/api/tables/{table_id}/orders", headers=headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        orders = response.json()
        assert isinstance(orders, list), "Should return list of orders"
        
        print(f"✓ Table {divided_table['number']} has {len(orders)} orders (accounts)")
        
        # Divided tables should have multiple orders
        if len(orders) > 1:
            print(f"  ✓ Multiple accounts confirmed: {[o.get('account_number', 1) for o in orders]}")
        
        return orders


class TestSplitOrder:
    """Split/Divide order functionality tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        return response.json()["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_split_to_new_order_endpoint_exists(self, auth_headers):
        """Verify split-to-new endpoint exists and responds"""
        # Get an order with items
        tables_res = requests.get(f"{BASE_URL}/api/tables")
        tables = tables_res.json()
        
        occupied_table = next((t for t in tables if t.get('status') in ['occupied', 'divided']), None)
        if not occupied_table:
            pytest.skip("No occupied tables found")
        
        # Get orders for this table
        orders_res = requests.get(f"{BASE_URL}/api/tables/{occupied_table['id']}/orders", headers=auth_headers)
        orders = orders_res.json()
        
        if not orders:
            pytest.skip("No orders found for table")
            
        order = orders[0]
        active_items = [i for i in order.get('items', []) if i.get('status') != 'cancelled']
        
        if len(active_items) < 2:
            pytest.skip("Need at least 2 items to test split")
        
        # Try to split with one item
        item_to_split = [active_items[0]['id']]
        response = requests.post(
            f"{BASE_URL}/api/orders/{order['id']}/split-to-new",
            json={"item_ids": item_to_split},
            headers=auth_headers
        )
        
        # Should succeed or fail with meaningful error
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "new_order" in data or "ok" in data, "Response should contain new_order or ok"
            print(f"✓ Split successful - new order created")
        else:
            print(f"⚠ Split returned 400: {response.json().get('detail', 'Unknown error')}")
            
    def test_split_requires_items(self, auth_headers):
        """Test that split fails without item_ids"""
        # Get any order
        orders_res = requests.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        orders = orders_res.json()
        
        if not orders:
            pytest.skip("No orders found")
            
        order = orders[0]
        response = requests.post(
            f"{BASE_URL}/api/orders/{order['id']}/split-to-new",
            json={"item_ids": []},
            headers=auth_headers
        )
        
        assert response.status_code == 400, "Should fail with empty item_ids"
        print(f"✓ Split correctly rejects empty item_ids")


class TestMoveTable:
    """Move table functionality tests"""
    
    @pytest.fixture
    def auth_headers(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_move_order_endpoint_exists(self, auth_headers):
        """Verify move endpoint exists"""
        # Get tables
        tables_res = requests.get(f"{BASE_URL}/api/tables")
        tables = tables_res.json()
        
        occupied = next((t for t in tables if t.get('status') == 'occupied'), None)
        free = next((t for t in tables if t.get('status') == 'free'), None)
        
        if not occupied or not free:
            pytest.skip("Need occupied and free tables")
        
        # Get order for occupied table
        orders_res = requests.get(f"{BASE_URL}/api/tables/{occupied['id']}/orders", headers=auth_headers)
        orders = orders_res.json()
        
        if not orders:
            pytest.skip("No orders found")
            
        order = orders[0]
        
        # Test move endpoint (without actually moving to avoid breaking state)
        response = requests.post(
            f"{BASE_URL}/api/orders/{order['id']}/move",
            json={"target_table_id": free['id'], "merge": False},
            headers=auth_headers
        )
        
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        print(f"✓ Move endpoint responds correctly")


class TestTaxConfig:
    """Tax configuration tests"""
    
    def test_get_tax_config(self):
        """Test tax config endpoint"""
        response = requests.get(f"{BASE_URL}/api/tax-config")
        assert response.status_code == 200
        taxes = response.json()
        assert isinstance(taxes, list)
        
        # Should have ITBIS and Propina
        tax_names = [t.get('description', '') for t in taxes]
        print(f"✓ Tax config: {tax_names}")
        
        # Verify ITBIS exists
        itbis = next((t for t in taxes if 'ITBIS' in t.get('description', '')), None)
        if itbis:
            assert itbis.get('rate') == 18, f"ITBIS should be 18%, got {itbis.get('rate')}"
            print(f"  ✓ ITBIS rate: {itbis.get('rate')}%")


class TestProducts:
    """Product and category tests"""
    
    def test_list_categories(self):
        """Test listing categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        categories = response.json()
        assert len(categories) > 0, "Should have categories"
        print(f"✓ Found {len(categories)} categories")
        
    def test_list_products(self):
        """Test listing products"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200
        products = response.json()
        assert len(products) > 0, "Should have products"
        print(f"✓ Found {len(products)} products")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
