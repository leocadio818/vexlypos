#!/usr/bin/env python3
import requests
import sys
import json
from datetime import datetime

class DOPOSAPITester:
    def __init__(self, base_url="https://mesa-comanda-rd.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.user_data = None

    def run_test(self, name, method, endpoint, expected_status, data=None, description=""):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        if description:
            print(f"   {description}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                if response.text:
                    try:
                        resp_data = response.json()
                        if isinstance(resp_data, dict) and len(resp_data) < 10:
                            print(f"   Response: {resp_data}")
                        elif isinstance(resp_data, list):
                            print(f"   Response: {len(resp_data)} items returned")
                    except:
                        print(f"   Response: {response.text[:100]}...")
                return success, response.json() if response.text else {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                if response.text:
                    print(f"   Error: {response.text[:200]}")
                return False, {}

        except requests.exceptions.RequestException as e:
            print(f"❌ Failed - Network Error: {str(e)}")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_seed_data(self):
        """Initialize seed data"""
        success, response = self.run_test(
            "Seed Data",
            "POST",
            "seed",
            200,
            description="Initialize demo data for POS system"
        )
        return success

    def test_login(self, pin="1234"):
        """Test login with PIN (Carlos waiter by default)"""
        success, response = self.run_test(
            "PIN Login (Carlos - 1234)",
            "POST",
            "auth/login",
            200,
            data={"pin": pin},
            description="Login with Carlos waiter PIN"
        )
        if success and 'token' in response:
            self.token = response['token']
            self.user_data = response.get('user', {})
            print(f"   Logged in as: {self.user_data.get('name', 'Unknown')} ({self.user_data.get('role', 'unknown')})")
            return True
        return False

    def test_get_areas(self):
        """Test getting restaurant areas"""
        success, response = self.run_test(
            "Get Areas",
            "GET",
            "areas",
            200,
            description="Get restaurant areas (Salon Principal, Terraza, Bar, VIP)"
        )
        if success and isinstance(response, list):
            areas = [area['name'] for area in response]
            print(f"   Areas found: {areas}")
            return len(response) >= 4  # Should have at least 4 areas
        return False

    def test_get_tables(self):
        """Test getting tables"""
        success, response = self.run_test(
            "Get Tables",
            "GET",
            "tables",
            200,
            description="Get all tables across all areas"
        )
        if success and isinstance(response, list):
            tables_by_area = {}
            for table in response:
                area_id = table.get('area_id')
                if area_id not in tables_by_area:
                    tables_by_area[area_id] = 0
                tables_by_area[area_id] += 1
            print(f"   Tables found: {len(response)} total across {len(tables_by_area)} areas")
            return len(response) > 0
        return False

    def test_get_categories(self):
        """Test getting product categories"""
        success, response = self.run_test(
            "Get Categories",
            "GET",
            "categories",
            200,
            description="Get product categories (Entradas, Platos, Mariscos, etc.)"
        )
        if success and isinstance(response, list):
            categories = [cat['name'] for cat in response]
            print(f"   Categories: {categories}")
            return len(response) >= 5
        return False

    def test_get_products(self):
        """Test getting products"""
        success, response = self.run_test(
            "Get Products",
            "GET",
            "products",
            200,
            description="Get all products with prices"
        )
        if success and isinstance(response, list):
            print(f"   Products found: {len(response)}")
            # Check for Churrasco (should have modifiers)
            churrasco = next((p for p in response if 'Churrasco' in p['name']), None)
            if churrasco:
                print(f"   Churrasco found with {len(churrasco.get('modifier_group_ids', []))} modifier groups")
            return len(response) >= 20
        return False

    def test_get_modifiers(self):
        """Test getting modifier groups"""
        success, response = self.run_test(
            "Get Modifiers",
            "GET",
            "modifiers",
            200,
            description="Get modifier groups (cooking point, extras, sides, etc.)"
        )
        if success and isinstance(response, list):
            modifier_names = [mod['name'] for mod in response]
            print(f"   Modifier groups: {modifier_names}")
            return len(response) >= 3
        return False

    def test_create_order(self):
        """Test creating an order"""
        # First get a table
        success, tables = self.run_test("Get Tables for Order", "GET", "tables", 200)
        if not success or not tables:
            print("❌ Cannot test order creation - no tables available")
            return False
        
        table = tables[0]
        table_id = table['id']
        
        # Get products
        success, products = self.run_test("Get Products for Order", "GET", "products", 200)
        if not success or not products:
            print("❌ Cannot test order creation - no products available")
            return False
            
        # Find a simple product without modifiers
        simple_product = None
        for prod in products:
            if not prod.get('modifier_group_ids') or len(prod['modifier_group_ids']) == 0:
                simple_product = prod
                break
        
        if not simple_product:
            simple_product = products[0]  # Use any product
        
        order_data = {
            "table_id": table_id,
            "items": [
                {
                    "product_id": simple_product['id'],
                    "product_name": simple_product['name'],
                    "quantity": 2,
                    "unit_price": simple_product['price'],
                    "modifiers": [],
                    "notes": "Test order"
                }
            ]
        }
        
        success, response = self.run_test(
            "Create Order",
            "POST",
            "orders",
            200,
            data=order_data,
            description=f"Create order for table {table['number']} with {simple_product['name']}"
        )
        
        if success:
            print(f"   Order created: {response.get('id', 'unknown')} with {len(response.get('items', []))} items")
            return response.get('id')
        return False

    def test_send_to_kitchen(self, order_id):
        """Test sending order to kitchen"""
        if not order_id:
            print("❌ Cannot test kitchen - no order ID")
            return False
            
        success, response = self.run_test(
            "Send to Kitchen",
            "POST",
            f"orders/{order_id}/send-kitchen",
            200,
            description="Send order items to kitchen"
        )
        
        if success:
            print(f"   Order status: {response.get('status', 'unknown')}")
            return True
        return False

    def test_kitchen_orders(self):
        """Test getting kitchen orders"""
        success, response = self.run_test(
            "Get Kitchen Orders",
            "GET",
            "kitchen/orders",
            200,
            description="Get orders in kitchen queue"
        )
        
        if success and isinstance(response, list):
            print(f"   Kitchen orders: {len(response)}")
            for order in response:
                kitchen_items = [item for item in order.get('items', []) if item.get('sent_to_kitchen')]
                print(f"     Order {order.get('id', 'unknown')[:8]} - Table {order.get('table_number')} - {len(kitchen_items)} kitchen items")
            return True
        return False

    def test_create_bill(self, order_id):
        """Test creating a bill"""
        if not order_id:
            print("❌ Cannot test billing - no order ID")
            return False
            
        # Get the order first
        success, order = self.run_test("Get Order for Bill", "GET", f"orders/{order_id}", 200)
        if not success:
            print("❌ Cannot get order for billing")
            return False
            
        bill_data = {
            "order_id": order_id,
            "table_id": order['table_id'],
            "label": f"Mesa {order['table_number']}",
            "item_ids": [],  # Empty means all items
            "tip_percentage": 10,
            "payment_method": "cash"
        }
        
        success, response = self.run_test(
            "Create Bill",
            "POST",
            "bills",
            200,
            data=bill_data,
            description=f"Create bill with ITBIS 18% and tip for order {order_id[:8]}"
        )
        
        if success:
            print(f"   Bill ID: {response.get('id', 'unknown')[:8]}")
            print(f"   NCF: {response.get('ncf', 'N/A')}")
            print(f"   Subtotal: RD$ {response.get('subtotal', 0):.2f}")
            print(f"   ITBIS (18%): RD$ {response.get('itbis', 0):.2f}")
            print(f"   Total: RD$ {response.get('total', 0):.2f}")
            return response.get('id')
        return False

    def test_pay_bill(self, bill_id):
        """Test paying a bill"""
        if not bill_id:
            print("❌ Cannot test payment - no bill ID")
            return False
            
        payment_data = {
            "payment_method": "cash",
            "tip_percentage": 10,
            "additional_tip": 0
        }
        
        success, response = self.run_test(
            "Pay Bill",
            "POST",
            f"bills/{bill_id}/pay",
            200,
            data=payment_data,
            description="Process cash payment for bill"
        )
        
        if success:
            print(f"   Payment status: {response.get('status', 'unknown')}")
            print(f"   Payment method: {response.get('payment_method', 'unknown')}")
            print(f"   Final total: RD$ {response.get('total', 0):.2f}")
            return True
        return False

    def test_cancellation_reasons(self):
        """Test getting cancellation reasons"""
        success, response = self.run_test(
            "Get Cancellation Reasons",
            "GET",
            "cancellation-reasons",
            200,
            description="Get available cancellation reasons"
        )
        
        if success and isinstance(response, list):
            for reason in response:
                inventory_action = "returns to inventory" if reason.get('return_to_inventory') else "no return"
                print(f"   Reason: {reason['name']} ({inventory_action})")
            return len(response) > 0
        return False

    def test_shifts_and_cash_register(self):
        """Test shift management"""
        # Test opening a shift
        shift_data = {
            "station": "Caja 1",
            "opening_amount": 1000.00
        }
        
        success, response = self.run_test(
            "Open Cash Shift",
            "POST",
            "shifts/open",
            200,
            data=shift_data,
            description="Open a cash register shift"
        )
        
        if success:
            shift_id = response.get('id')
            print(f"   Shift opened: {shift_id[:8]} at {response.get('station', 'unknown')}")
            print(f"   Opening amount: RD$ {response.get('opening_amount', 0):.2f}")
            return shift_id
        return False

def main():
    """Run comprehensive POS API tests"""
    print("🏪 Dominican Republic POS System - API Testing")
    print("=" * 60)
    
    tester = DOPOSAPITester()
    
    # Track test results
    failed_tests = []
    
    # Step 1: Initialize data
    print("\n📦 INITIALIZING SYSTEM")
    if not tester.test_seed_data():
        failed_tests.append("Seed Data")
    
    # Step 2: Authentication
    print("\n🔐 AUTHENTICATION TESTING")
    if not tester.test_login("1234"):  # Carlos waiter PIN
        failed_tests.append("PIN Login")
        print("❌ Cannot continue without login")
        return 1
    
    # Step 3: Basic data retrieval
    print("\n📋 CORE DATA TESTING")
    if not tester.test_get_areas():
        failed_tests.append("Get Areas")
    if not tester.test_get_tables():
        failed_tests.append("Get Tables")
    if not tester.test_get_categories():
        failed_tests.append("Get Categories")
    if not tester.test_get_products():
        failed_tests.append("Get Products")
    if not tester.test_get_modifiers():
        failed_tests.append("Get Modifiers")
    
    # Step 4: Order workflow
    print("\n🍽️  ORDER WORKFLOW TESTING")
    order_id = tester.test_create_order()
    if not order_id:
        failed_tests.append("Create Order")
    else:
        if not tester.test_send_to_kitchen(order_id):
            failed_tests.append("Send to Kitchen")
        if not tester.test_kitchen_orders():
            failed_tests.append("Kitchen Orders")
        
        # Step 5: Billing workflow
        print("\n💳 BILLING WORKFLOW TESTING")
        bill_id = tester.test_create_bill(order_id)
        if not bill_id:
            failed_tests.append("Create Bill")
        else:
            if not tester.test_pay_bill(bill_id):
                failed_tests.append("Pay Bill")
    
    # Step 6: Additional features
    print("\n⚙️  ADDITIONAL FEATURES TESTING")
    if not tester.test_cancellation_reasons():
        failed_tests.append("Cancellation Reasons")
    if not tester.test_shifts_and_cash_register():
        failed_tests.append("Cash Register")
    
    # Final results
    print("\n" + "=" * 60)
    print(f"📊 FINAL RESULTS: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    if failed_tests:
        print(f"❌ Failed tests ({len(failed_tests)}):")
        for test in failed_tests:
            print(f"   - {test}")
        return 1
    else:
        print("✅ All tests passed! POS API is working correctly.")
        return 0

if __name__ == "__main__":
    sys.exit(main())