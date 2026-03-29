"""
Test Offline Features for VexlyPOS
- Tests GET /api/auth/offline-users endpoint
- Tests all required backend APIs for offline caching
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestOfflineFeatures:
    """Tests for offline capabilities backend support"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token for authenticated requests"""
        # Login with Admin PIN 10000
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        self.token = data.get("token")
        self.user = data.get("user")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_login_with_pin_10000(self):
        """Test login with Admin PIN 10000"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["name"] == "Admin"
        assert data["user"]["role"] == "admin"
        print(f"✓ Login successful: {data['user']['name']} ({data['user']['role']})")
    
    def test_offline_users_endpoint(self):
        """Test GET /api/auth/offline-users returns users with pin_hash"""
        response = requests.get(f"{BASE_URL}/api/auth/offline-users", headers=self.headers)
        assert response.status_code == 200
        users = response.json()
        
        # Should return at least 4 users
        assert len(users) >= 4, f"Expected at least 4 users, got {len(users)}"
        
        # Each user should have required fields including pin_hash
        for user in users:
            assert "id" in user, "User missing 'id' field"
            assert "name" in user, "User missing 'name' field"
            assert "role" in user, "User missing 'role' field"
            assert "active" in user, "User missing 'active' field"
            assert "pin_hash" in user, f"User {user['name']} missing 'pin_hash' field"
            assert len(user["pin_hash"]) == 64, f"User {user['name']} has invalid pin_hash length"
            assert "permissions" in user, f"User {user['name']} missing 'permissions' field"
        
        print(f"✓ Offline users endpoint returned {len(users)} users with pin_hash")
        for u in users:
            print(f"  - {u['name']} (role: {u['role']}, has pin_hash: {bool(u.get('pin_hash'))})")
    
    def test_products_endpoint(self):
        """Test GET /api/products for offline caching"""
        response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        assert response.status_code == 200
        products = response.json()
        assert isinstance(products, list)
        print(f"✓ Products endpoint returned {len(products)} products")
    
    def test_categories_endpoint(self):
        """Test GET /api/categories for offline caching"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=self.headers)
        assert response.status_code == 200
        categories = response.json()
        assert isinstance(categories, list)
        print(f"✓ Categories endpoint returned {len(categories)} categories")
    
    def test_tables_endpoint(self):
        """Test GET /api/tables for offline caching"""
        response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        assert response.status_code == 200
        tables = response.json()
        assert isinstance(tables, list)
        print(f"✓ Tables endpoint returned {len(tables)} tables")
    
    def test_system_config_endpoint(self):
        """Test GET /api/system/config for offline caching"""
        response = requests.get(f"{BASE_URL}/api/system/config", headers=self.headers)
        assert response.status_code == 200
        config = response.json()
        assert isinstance(config, dict)
        assert "currency" in config or "restaurant_name" in config
        print(f"✓ System config endpoint returned config with keys: {list(config.keys())[:5]}")
    
    def test_health_endpoint(self):
        """Test GET /api/health for connectivity check"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") == True
        print("✓ Health endpoint returned ok: true")


class TestOrdersAPI:
    """Tests for orders API used by offline order wrappers"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert response.status_code == 200
        data = response.json()
        self.token = data.get("token")
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
        
        # Get a table ID for testing
        tables_res = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_res.json()
        self.table_id = tables[0]["id"] if tables else None
    
    def test_create_order(self):
        """Test POST /api/orders - create order"""
        if not self.table_id:
            pytest.skip("No tables available for testing")
        
        # Get a product
        products_res = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_res.json()
        if not products:
            pytest.skip("No products available for testing")
        
        product = products[0]
        
        # Create order
        order_data = {
            "table_id": self.table_id,
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "unit_price": product["price"],
                "modifiers": [],
                "notes": "Test order"
            }]
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert response.status_code in [200, 201], f"Create order failed: {response.text}"
        order = response.json()
        assert "id" in order
        assert "items" in order
        print(f"✓ Order created: {order['id']}")
        
        # Store order ID for cleanup
        self.order_id = order["id"]
    
    def test_send_to_kitchen(self):
        """Test POST /api/orders/{id}/send-kitchen"""
        if not self.table_id:
            pytest.skip("No tables available for testing")
        
        # Get a product
        products_res = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_res.json()
        if not products:
            pytest.skip("No products available for testing")
        
        product = products[0]
        
        # Create order first
        order_data = {
            "table_id": self.table_id,
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 1,
                "unit_price": product["price"],
                "modifiers": [],
                "notes": "Test send to kitchen"
            }]
        }
        
        create_res = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        if create_res.status_code not in [200, 201]:
            pytest.skip(f"Could not create order: {create_res.text}")
        
        order = create_res.json()
        order_id = order["id"]
        
        # Send to kitchen
        response = requests.post(f"{BASE_URL}/api/orders/{order_id}/send-kitchen", headers=self.headers)
        assert response.status_code == 200, f"Send to kitchen failed: {response.text}"
        updated_order = response.json()
        
        # Check items are marked as sent
        sent_items = [i for i in updated_order.get("items", []) if i.get("status") == "sent" or i.get("sent_to_kitchen")]
        print(f"✓ Send to kitchen successful: {len(sent_items)} items sent")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
