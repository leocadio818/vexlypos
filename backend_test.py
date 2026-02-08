#!/usr/bin/env python3
import requests
import sys
import json
from datetime import datetime

class POSAPITester:
    def __init__(self, base_url="https://mesa-comanda-rd.preview.emergentagent.com"):
        self.base_url = f"{base_url}/api"
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.results = []
        self.failed_tests = []

    def log_result(self, test_name, passed, details=""):
        self.results.append({
            "test": test_name,
            "passed": passed,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, description=""):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
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
                print(f"✅ PASSED - Status: {response.status_code}")
                try:
                    resp_data = response.json()
                    if isinstance(resp_data, list) and len(resp_data) > 0:
                        print(f"   📊 Returned {len(resp_data)} items")
                    elif isinstance(resp_data, dict) and 'orders' in resp_data:
                        print(f"   📊 Kitchen TV: {len(resp_data.get('orders', []))} orders")
                    self.log_result(name, True, f"Status {response.status_code}, Data received: {type(resp_data).__name__}")
                    return success, resp_data
                except:
                    self.log_result(name, True, f"Status {response.status_code}, Non-JSON response")
                    return success, {}
            else:
                print(f"❌ FAILED - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                self.failed_tests.append({
                    "test": name,
                    "expected": expected_status,
                    "actual": response.status_code,
                    "error": response.text[:200]
                })
                self.log_result(name, False, f"Status {response.status_code}: {response.text[:100]}")
                return False, {}

        except requests.exceptions.Timeout:
            print(f"❌ FAILED - Request timeout")
            self.failed_tests.append({"test": name, "error": "Request timeout"})
            self.log_result(name, False, "Request timeout")
            return False, {}
        except Exception as e:
            print(f"❌ FAILED - Error: {str(e)}")
            self.failed_tests.append({"test": name, "error": str(e)})
            self.log_result(name, False, str(e))
            return False, {}

    def test_login(self):
        """Test login with admin credentials"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"pin": "0000"},
            description="Login with admin PIN 0000"
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   🔑 Token obtained: {self.token[:20]}...")
            return True
        return False

    def test_recipes_api(self):
        """Test recipes endpoint - should show Dominican recipes with costs"""
        success, response = self.run_test(
            "Recipes API",
            "GET", 
            "recipes",
            200,
            description="Get recipes with ingredient costs (Phase 5 feature)"
        )
        if success and isinstance(response, list):
            print(f"   📋 Found {len(response)} recipes")
            dominican_recipes = 0
            for recipe in response:
                if any(food in recipe.get('product_name', '').lower() 
                      for food in ['bandera', 'churrasco', 'langosta', 'pollo', 'pescado']):
                    dominican_recipes += 1
                    ingredients = recipe.get('ingredients', [])
                    print(f"   🇩🇴 {recipe.get('product_name', 'Unknown')} - {len(ingredients)} ingredients")
                    for ing in ingredients[:2]:  # Show first 2 ingredients
                        cost = ing.get('cost', 0)
                        print(f"      • {ing.get('ingredient_name', 'N/A')} - RD${cost}")
            print(f"   🎯 Found {dominican_recipes} Dominican recipes")
            return dominican_recipes >= 5  # Expecting at least 5 Dominican recipes
        return success

    def test_inventory_report(self):
        """Test inventory report with costs and margins"""
        success, response = self.run_test(
            "Inventory Report",
            "GET",
            "reports/inventory", 
            200,
            description="Get inventory with recipe costs and margin percentages"
        )
        if success and isinstance(response, list):
            items_with_costs = [item for item in response if item.get('recipe_cost', 0) > 0]
            print(f"   💰 {len(items_with_costs)} items have recipe costs")
            if len(items_with_costs) > 0:
                for item in items_with_costs[:3]:  # Show first 3 items
                    print(f"   📊 {item.get('product_name', 'Unknown')}: Sale RD${item.get('sale_price', 0)}, Cost RD${item.get('recipe_cost', 0)}, Margin {item.get('margin_pct', 0)}%")
            return len(items_with_costs) > 0
        return success

    def test_profit_report(self):
        """Test profit analysis report"""
        success, response = self.run_test(
            "Profit Report",
            "GET",
            "reports/profit",
            200,
            description="Get revenue vs cost analysis"
        )
        if success and isinstance(response, dict):
            revenue = response.get('total_revenue', 0)
            cost = response.get('total_cost', 0) 
            profit = response.get('gross_profit', 0)
            margin = response.get('margin_pct', 0)
            products = len(response.get('products', []))
            print(f"   💹 Revenue: RD${revenue}, Cost: RD${cost}, Profit: RD${profit} ({margin}%)")
            print(f"   📈 {products} products analyzed")
            return True
        return success

    def test_escpos_endpoints(self):
        """Test ESC/POS thermal printer endpoints"""
        # These endpoints need actual bill/order IDs, so test for proper error handling
        success1, _ = self.run_test(
            "ESC/POS Receipt",
            "GET",
            "print/receipt-escpos/non-existent-id",
            404,
            description="Test ESC/POS receipt endpoint (expecting 404 for non-existent ID)"
        )
        
        success2, _ = self.run_test(
            "ESC/POS Comanda", 
            "GET",
            "print/comanda-escpos/non-existent-id",
            404,
            description="Test ESC/POS comanda endpoint (expecting 404 for non-existent ID)"
        )
        
        return success1 and success2

    def test_kitchen_tv_api(self):
        """Test Kitchen TV optimized endpoint"""
        success, response = self.run_test(
            "Kitchen TV API",
            "GET",
            "kitchen/tv",
            200,
            description="Get optimized kitchen display data with urgency indicators"
        )
        if success and isinstance(response, dict):
            orders = response.get('orders', [])
            timestamp = response.get('timestamp', '')
            total = response.get('total', 0)
            print(f"   📺 Kitchen TV: {total} orders, timestamp: {timestamp[:19]}")
            
            urgent_count = sum(1 for order in orders if order.get('is_urgent'))
            critical_count = sum(1 for order in orders if order.get('is_critical'))
            print(f"   ⚠️  Urgent: {urgent_count}, Critical: {critical_count}")
            
            # Check for required fields in orders
            if orders:
                order = orders[0]
                has_elapsed = 'elapsed_minutes' in order
                has_urgency = 'is_urgent' in order and 'is_critical' in order
                print(f"   ✅ Has elapsed_minutes: {has_elapsed}, Has urgency flags: {has_urgency}")
                return has_elapsed and has_urgency
            return True
        return success

    def test_core_pos_flow(self):
        """Test core POS functionality still works"""
        print("\n🏪 Testing Core POS Flow...")
        
        # Test areas, tables, products, categories
        areas_success, _ = self.run_test("Areas", "GET", "areas", 200)
        tables_success, _ = self.run_test("Tables", "GET", "tables", 200) 
        categories_success, _ = self.run_test("Categories", "GET", "categories", 200)
        products_success, _ = self.run_test("Products", "GET", "products", 200)
        
        return all([areas_success, tables_success, categories_success, products_success])

    def test_reservations_crud(self):
        """Test reservations CRUD operations (new feature)"""
        print("\n📅 Testing Reservations CRUD...")
        
        # Get reservations list
        today = datetime.now().strftime('%Y-%m-%d')
        success, reservations = self.run_test(
            "Get Reservations", 
            "GET", 
            "reservations", 
            200,
            description="Fetch reservations for today"
        )
        
        if not success:
            return False
        
        # Create new reservation
        reservation_data = {
            "customer_name": "Test Customer",
            "phone": "809-123-4567", 
            "date": today,
            "time": "19:00",
            "party_size": 4,
            "table_id": "",
            "table_number": 5,
            "notes": "Test reservation"
        }
        
        success, new_reservation = self.run_test(
            "Create Reservation",
            "POST",
            "reservations", 
            200,
            data=reservation_data,
            description="Create new test reservation"
        )
        
        if not success or 'id' not in new_reservation:
            return False
            
        reservation_id = new_reservation['id']
        print(f"   ✅ Created reservation with ID: {reservation_id}")
        
        # Update reservation status
        success, _ = self.run_test(
            "Update Reservation Status",
            "PUT",
            f"reservations/{reservation_id}",
            200,
            data={"status": "seated"},
            description="Update reservation status to seated"
        )
        
        if not success:
            return False
            
        # Delete reservation (cleanup)
        success, _ = self.run_test(
            "Delete Reservation",
            "DELETE", 
            f"reservations/{reservation_id}",
            200,
            description="Delete test reservation"
        )
        
        return success

    def test_print_channels_crud(self):
        """Test print channels CRUD operations (new feature)"""
        print("\n🖨️  Testing Print Channels CRUD...")
        
        # Get print channels list
        success, channels = self.run_test(
            "Get Print Channels",
            "GET",
            "print-channels", 
            200,
            description="Fetch print channels configuration"
        )
        
        if not success:
            return False
            
        # Create new print channel
        channel_data = {
            "name": "Test Kitchen Printer",
            "type": "kitchen",
            "target": "network", 
            "ip": "192.168.1.100",
            "active": True
        }
        
        success, new_channel = self.run_test(
            "Create Print Channel",
            "POST",
            "print-channels",
            200,
            data=channel_data,
            description="Create new test print channel"
        )
        
        if not success or 'id' not in new_channel:
            return False
            
        channel_id = new_channel['id']
        print(f"   ✅ Created print channel with ID: {channel_id}")
        
        # Update print channel
        success, _ = self.run_test(
            "Update Print Channel",
            "PUT",
            f"print-channels/{channel_id}",
            200,
            data={"active": False},
            description="Update print channel status"
        )
        
        if not success:
            return False
            
        # Delete print channel (cleanup)
        success, _ = self.run_test(
            "Delete Print Channel",
            "DELETE",
            f"print-channels/{channel_id}",
            200,
            description="Delete test print channel"  
        )
        
        return success

    def test_auto_send_orders(self):
        """Test auto-send orders functionality"""
        print("\n🔄 Testing Auto-send Orders...")
        
        # Get active orders (this endpoint is used for auto-send on logout)
        success, orders = self.run_test(
            "Get Active Orders",
            "GET",
            "orders",
            200,
            description="Fetch active orders for auto-send functionality"
        )
        
        if not success:
            return False
            
        print(f"   📋 Found {len(orders) if isinstance(orders, list) else 0} active orders")
        
        # If there are active orders, they would be auto-sent via the send-kitchen endpoint
        # This is tested in the AuthContext logout function
        if isinstance(orders, list) and len(orders) > 0:
            first_order = orders[0]
            if 'id' in first_order:
                success, _ = self.run_test(
                    "Test Send to Kitchen Endpoint",
                    "POST", 
                    f"orders/{first_order['id']}/send-kitchen",
                    200,
                    description="Test send order to kitchen (used in auto-send)"
                )
                return success
        
        return True

def main():
    print("🚀 Starting POS System Backend Testing...")
    print("📍 Testing: Reservations, Print Channels, Auto-send Orders, Core POS APIs")
    
    tester = POSAPITester()
    
    # Phase 1: Authentication
    if not tester.test_login():
        print("❌ Authentication failed - cannot continue with API tests")
        return 1

    # Phase 2: Core functionality check
    core_ok = tester.test_core_pos_flow()
    if not core_ok:
        print("⚠️  Core POS flow has issues")

    # Phase 3: New features testing
    print("\n🆕 Testing New Features...")
    
    reservations_ok = tester.test_reservations_crud()
    print_channels_ok = tester.test_print_channels_crud()  
    auto_send_ok = tester.test_auto_send_orders()
    recipes_ok = tester.test_recipes_api()
    inventory_ok = tester.test_inventory_report() 
    profit_ok = tester.test_profit_report()
    escpos_ok = tester.test_escpos_endpoints()
    kitchen_tv_ok = tester.test_kitchen_tv_api()

    # Results Summary
    print(f"\n📊 FINAL RESULTS:")
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    print(f"\n🎯 New Features:")
    print(f"✅ Reservations CRUD: {'PASS' if reservations_ok else 'FAIL'}")
    print(f"✅ Print Channels CRUD: {'PASS' if print_channels_ok else 'FAIL'}")
    print(f"✅ Auto-send Orders: {'PASS' if auto_send_ok else 'FAIL'}")
    print(f"✅ Recipes with costs: {'PASS' if recipes_ok else 'FAIL'}")
    print(f"✅ Inventory reports: {'PASS' if inventory_ok else 'FAIL'}")
    print(f"✅ Profit analysis: {'PASS' if profit_ok else 'FAIL'}")
    print(f"✅ ESC/POS endpoints: {'PASS' if escpos_ok else 'FAIL'}")
    print(f"✅ Kitchen TV API: {'PASS' if kitchen_tv_ok else 'FAIL'}")

    # Show failed tests if any
    if tester.failed_tests:
        print(f"\n❌ FAILED TESTS ({len(tester.failed_tests)}):")
        for failure in tester.failed_tests[:5]:  # Show max 5 failures
            print(f"- {failure.get('test', 'Unknown')}: {failure.get('error', 'Unknown error')[:100]}")

    # Save detailed results
    with open('/app/test_reports/backend_test_results.json', 'w') as f:
        json.dump({
            "summary": {
                "tests_run": tester.tests_run,
                "tests_passed": tester.tests_passed,
                "success_rate": f"{(tester.tests_passed/tester.tests_run)*100:.1f}%",
                "failed_count": len(tester.failed_tests)
            },
            "new_features": {
                "reservations_crud": reservations_ok,
                "print_channels_crud": print_channels_ok,
                "auto_send_orders": auto_send_ok,
                "recipes_with_costs": recipes_ok,
                "inventory_reports": inventory_ok, 
                "profit_analysis": profit_ok,
                "escpos_endpoints": escpos_ok,
                "kitchen_tv_api": kitchen_tv_ok
            },
            "failed_tests": tester.failed_tests,
            "detailed_results": tester.results
        }, f, indent=2)

    return 0 if tester.tests_passed >= tester.tests_run * 0.7 else 1

if __name__ == "__main__":
    sys.exit(main())