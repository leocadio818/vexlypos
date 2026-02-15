"""
POS System Regression Tests - Post-Refactoring Validation
Tests all critical endpoints after modularization from monolithic server.py (4356 lines) to routers
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test session state
class TestState:
    token = None
    user = None
    table_id = None
    order_id = None
    bill_id = None
    area_id = None
    product_id = None
    category_id = None
    customer_id = None

@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def auth_headers(api_client):
    """Authenticate with admin PIN and get headers"""
    # Login with admin PIN 0000
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in login response"
    TestState.token = data["token"]
    TestState.user = data.get("user", {})
    return {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"}


# ==================== AUTH MODULE TESTS ====================

class TestAuth:
    """Authentication endpoints from routers/auth.py"""
    
    def test_login_admin_pin(self, api_client):
        """Test login with admin PIN 0000"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful - User: {data['user']['name']}")
    
    def test_login_waiter_pin(self, api_client):
        """Test login with waiter PIN 1234"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={"pin": "1234"})
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "waiter"
        print(f"✓ Waiter login successful - User: {data['user']['name']}")
    
    def test_login_cashier_pin(self, api_client):
        """Test login with cashier PIN 4321"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={"pin": "4321"})
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "cashier"
        print(f"✓ Cashier login successful - User: {data['user']['name']}")
    
    def test_login_invalid_pin(self, api_client):
        """Test login with invalid PIN"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={"pin": "9999"})
        assert response.status_code == 401
        print("✓ Invalid PIN rejected correctly")
    
    def test_get_me(self, api_client, auth_headers):
        """Test /auth/me endpoint"""
        response = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "permissions" in data
        print(f"✓ /auth/me returned user: {data['name']}")
    
    def test_list_users(self, api_client, auth_headers):
        """Test /users endpoint"""
        response = api_client.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"✓ Listed {len(data)} users")


# ==================== TABLES MODULE TESTS ====================

class TestTables:
    """Tables & Areas endpoints from routers/tables.py"""
    
    def test_list_areas(self, api_client, auth_headers):
        """Test listing areas"""
        response = api_client.get(f"{BASE_URL}/api/areas", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if data:
            TestState.area_id = data[0]["id"]
        print(f"✓ Listed {len(data)} areas")
    
    def test_list_tables(self, api_client, auth_headers):
        """Test listing tables"""
        response = api_client.get(f"{BASE_URL}/api/tables", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Find a free table
        for table in data:
            if table.get("status") == "free":
                TestState.table_id = table["id"]
                print(f"✓ Found free table {table['number']} (id: {table['id']})")
                break
        if not TestState.table_id and data:
            TestState.table_id = data[0]["id"]
        print(f"✓ Listed {len(data)} tables")
    
    def test_list_tables_by_area(self, api_client, auth_headers):
        """Test filtering tables by area"""
        if not TestState.area_id:
            pytest.skip("No area available")
        response = api_client.get(f"{BASE_URL}/api/tables?area_id={TestState.area_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} tables in area")


# ==================== ORDERS MODULE TESTS ====================

class TestOrders:
    """Orders endpoints from routers/orders.py"""
    
    def test_create_order(self, api_client, auth_headers):
        """Test creating an order on a table"""
        if not TestState.table_id:
            pytest.skip("No table available")
        
        payload = {
            "table_id": TestState.table_id,
            "items": []
        }
        response = api_client.post(f"{BASE_URL}/api/orders", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create order failed: {response.text}"
        data = response.json()
        assert "id" in data
        TestState.order_id = data["id"]
        print(f"✓ Created order {data['id']} on table {data.get('table_number', '?')}")
    
    def test_list_orders(self, api_client, auth_headers):
        """Test listing orders"""
        response = api_client.get(f"{BASE_URL}/api/orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} orders")
    
    def test_get_order(self, api_client, auth_headers):
        """Test getting a specific order"""
        if not TestState.order_id:
            pytest.skip("No order created")
        
        response = api_client.get(f"{BASE_URL}/api/orders/{TestState.order_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == TestState.order_id
        print(f"✓ Retrieved order {TestState.order_id}")
    
    def test_add_items_to_order(self, api_client, auth_headers):
        """Test adding items to an order"""
        if not TestState.order_id:
            pytest.skip("No order created")
        
        # Get a product first
        products = api_client.get(f"{BASE_URL}/api/products", headers=auth_headers).json()
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        TestState.product_id = product["id"]
        
        payload = {
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 2,
                "unit_price": product.get("price", 100),
                "modifiers": [],
                "notes": "TEST item"
            }]
        }
        response = api_client.post(f"{BASE_URL}/api/orders/{TestState.order_id}/items", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data.get("items", [])) > 0
        print(f"✓ Added item '{product['name']}' to order")
    
    def test_send_order_to_kitchen(self, api_client, auth_headers):
        """Test sending order to kitchen"""
        if not TestState.order_id:
            pytest.skip("No order created")
        
        response = api_client.post(f"{BASE_URL}/api/orders/{TestState.order_id}/send-kitchen", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") in ["sent", "active"]
        print(f"✓ Order sent to kitchen, status: {data.get('status')}")


# ==================== KITCHEN MODULE TESTS ====================

class TestKitchen:
    """Kitchen endpoints from routers/kitchen.py"""
    
    def test_list_kitchen_orders(self, api_client, auth_headers):
        """Test kitchen orders endpoint"""
        response = api_client.get(f"{BASE_URL}/api/kitchen/orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Kitchen has {len(data)} active orders")


# ==================== BILLING MODULE TESTS ====================

class TestBilling:
    """Billing endpoints from routers/billing.py"""
    
    def test_list_payment_methods(self, api_client, auth_headers):
        """Test listing payment methods"""
        response = api_client.get(f"{BASE_URL}/api/payment-methods", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"✓ Listed {len(data)} payment methods")
        # Verify default methods exist
        method_names = [m["name"] for m in data]
        print(f"  Methods: {', '.join(method_names[:5])}...")
    
    def test_list_sale_types(self, api_client, auth_headers):
        """Test listing sale types"""
        response = api_client.get(f"{BASE_URL}/api/sale-types", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} sale types")
    
    def test_get_tax_config(self, api_client, auth_headers):
        """Test tax configuration"""
        response = api_client.get(f"{BASE_URL}/api/tax-config", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} tax configurations")
    
    def test_calculate_taxes(self, api_client, auth_headers):
        """Test tax calculation"""
        response = api_client.get(f"{BASE_URL}/api/tax-config/calculate?subtotal=100", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert data["total"] > 100  # Should include taxes
        print(f"✓ Tax calculation: subtotal 100 -> total {data['total']}")
    
    def test_create_bill(self, api_client, auth_headers):
        """Test creating a bill from order"""
        if not TestState.order_id or not TestState.table_id:
            pytest.skip("No order/table available")
        
        payload = {
            "order_id": TestState.order_id,
            "table_id": TestState.table_id,
            "label": "TEST Bill",
            "item_ids": [],
            "tip_percentage": 10,
            "payment_method": "cash",
            "customer_id": ""
        }
        response = api_client.post(f"{BASE_URL}/api/bills", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create bill failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert "ncf" in data  # NCF fiscal number
        TestState.bill_id = data["id"]
        print(f"✓ Created bill {data['id']} with NCF: {data['ncf']}")
    
    def test_pay_bill(self, api_client, auth_headers):
        """Test paying a bill"""
        if not TestState.bill_id:
            pytest.skip("No bill created")
        
        payload = {
            "payment_method": "cash",
            "payment_method_id": "",
            "tip_percentage": 10,
            "additional_tip": 0,
            "customer_id": "",
            "sale_type": "dine_in"
        }
        response = api_client.post(f"{BASE_URL}/api/bills/{TestState.bill_id}/pay", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Pay bill failed: {response.text}"
        data = response.json()
        assert data.get("status") == "paid"
        print(f"✓ Bill paid, total: RD$ {data.get('total', 0)}")
    
    def test_list_bills(self, api_client, auth_headers):
        """Test listing bills"""
        response = api_client.get(f"{BASE_URL}/api/bills", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} bills")


# ==================== PRODUCTS & CATEGORIES TESTS ====================

class TestProducts:
    """Products and Categories from main server.py and routers/config.py"""
    
    def test_list_categories(self, api_client, auth_headers):
        """Test listing categories"""
        response = api_client.get(f"{BASE_URL}/api/categories", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if data:
            TestState.category_id = data[0]["id"]
        print(f"✓ Listed {len(data)} categories")
    
    def test_list_products(self, api_client, auth_headers):
        """Test listing products"""
        response = api_client.get(f"{BASE_URL}/api/products", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} products")
    
    def test_get_product(self, api_client, auth_headers):
        """Test getting a specific product"""
        if not TestState.product_id:
            pytest.skip("No product available")
        
        response = api_client.get(f"{BASE_URL}/api/products/{TestState.product_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == TestState.product_id
        print(f"✓ Retrieved product: {data['name']}")
    
    def test_list_modifiers(self, api_client, auth_headers):
        """Test listing modifiers"""
        response = api_client.get(f"{BASE_URL}/api/modifiers", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} modifiers")


# ==================== CUSTOMERS MODULE TESTS ====================

class TestCustomers:
    """Customers endpoints from routers/customers.py"""
    
    def test_list_customers(self, api_client, auth_headers):
        """Test listing customers"""
        response = api_client.get(f"{BASE_URL}/api/customers", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if data:
            TestState.customer_id = data[0]["id"]
        print(f"✓ Listed {len(data)} customers")
    
    def test_create_customer(self, api_client, auth_headers):
        """Test creating a customer"""
        payload = {
            "name": "TEST Customer",
            "phone": "809-555-1234",
            "email": "test@example.com",
            "rnc": ""
        }
        response = api_client.post(f"{BASE_URL}/api/customers", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create customer failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["name"] == "TEST Customer"
        TestState.customer_id = data["id"]
        print(f"✓ Created customer: {data['name']}")
    
    def test_get_loyalty_config(self, api_client, auth_headers):
        """Test loyalty config"""
        response = api_client.get(f"{BASE_URL}/api/loyalty/config", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "points_per_hundred" in data
        print(f"✓ Loyalty config: {data['points_per_hundred']} points per RD$ 100")


# ==================== CONFIG MODULE TESTS ====================

class TestConfig:
    """System configuration from routers/config.py"""
    
    def test_list_shifts(self, api_client, auth_headers):
        """Test listing shifts"""
        response = api_client.get(f"{BASE_URL}/api/shifts", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} shifts")
    
    def test_get_current_shift(self, api_client, auth_headers):
        """Test getting current shift"""
        response = api_client.get(f"{BASE_URL}/api/shifts/current", headers=auth_headers)
        assert response.status_code == 200
        # May return {} if no open shift
        print(f"✓ Current shift endpoint working")
    
    def test_list_reservations(self, api_client, auth_headers):
        """Test listing reservations"""
        response = api_client.get(f"{BASE_URL}/api/reservations", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} reservations")
    
    def test_system_config(self, api_client, auth_headers):
        """Test system config endpoint"""
        response = api_client.get(f"{BASE_URL}/api/system/config", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "timezone_offset" in data
        print(f"✓ System config: timezone {data['timezone_offset']}, currency: {data.get('currency', 'RD$')}")
    
    def test_cancellation_reasons(self, api_client, auth_headers):
        """Test cancellation reasons from config router"""
        response = api_client.get(f"{BASE_URL}/api/cancellation-reasons", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} cancellation reasons")


# ==================== VOID AUDIT LOGS TESTS ====================

class TestVoidAuditLogs:
    """Void audit log endpoints from routers/orders.py"""
    
    def test_list_void_audit_logs(self, api_client, auth_headers):
        """Test listing void audit logs"""
        response = api_client.get(f"{BASE_URL}/api/void-audit-logs", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} void audit logs")
    
    def test_void_report(self, api_client, auth_headers):
        """Test void report endpoint"""
        response = api_client.get(f"{BASE_URL}/api/void-audit-logs/report?period=day", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data
        print(f"✓ Void report: {data['summary'].get('total_count', 0)} voids today")


# ==================== MISC ENDPOINTS TESTS ====================

class TestMisc:
    """Other endpoints from server.py"""
    
    def test_report_categories(self, api_client, auth_headers):
        """Test report categories endpoint"""
        response = api_client.get(f"{BASE_URL}/api/report-categories", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} report categories")
    
    def test_print_channels(self, api_client, auth_headers):
        """Test print channels endpoint"""
        response = api_client.get(f"{BASE_URL}/api/print-channels", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} print channels")
    
    def test_day_close_check(self, api_client, auth_headers):
        """Test day close check endpoint"""
        response = api_client.get(f"{BASE_URL}/api/day-close/check", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "can_close" in data
        print(f"✓ Day close check: can_close={data['can_close']}")
    
    def test_station_config(self, api_client, auth_headers):
        """Test station config endpoint"""
        response = api_client.get(f"{BASE_URL}/api/station-config", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "require_shift_to_sell" in data
        print(f"✓ Station config retrieved")


# ==================== CLEANUP ====================

class TestCleanup:
    """Clean up test data"""
    
    def test_cleanup_test_customer(self, api_client, auth_headers):
        """Delete test customer if created"""
        if TestState.customer_id:
            response = api_client.delete(f"{BASE_URL}/api/customers/{TestState.customer_id}", headers=auth_headers)
            assert response.status_code == 200
            print(f"✓ Cleaned up test customer")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
