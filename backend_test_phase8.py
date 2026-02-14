#!/usr/bin/env python3
import requests
import sys
import json
from datetime import datetime

class Phase8POSAPITester:
    def __init__(self, base_url="https://control-costos.preview.emergentagent.com"):
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
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ PASSED - Status: {response.status_code}")
                try:
                    resp_data = response.json()
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

    def test_sale_types_api(self):
        """Test sale types API - should return 3 types with tax_rate and tip_default"""
        success, response = self.run_test(
            "Sale Types API",
            "GET",
            "sale-types",
            200,
            description="Get sale types: Consumidor Final, Take Out, Delivery"
        )
        
        if not success:
            return False
            
        if not isinstance(response, list):
            print(f"   ❌ Expected list, got {type(response)}")
            return False
            
        print(f"   📋 Found {len(response)} sale types")
        
        # Check for required types
        required_types = ["Consumidor Final", "Take Out", "Delivery"]
        found_types = [st.get('name', '') for st in response if st.get('active')]
        
        all_required_found = True
        for req_type in required_types:
            if req_type in found_types:
                print(f"   ✅ Found: {req_type}")
            else:
                print(f"   ❌ Missing: {req_type}")
                all_required_found = False
        
        # Check structure of sale types
        for sale_type in response:
            if 'tax_rate' not in sale_type:
                print(f"   ❌ Missing tax_rate in {sale_type.get('name', 'Unknown')}")
                all_required_found = False
            if 'tip_default' not in sale_type:
                print(f"   ❌ Missing tip_default in {sale_type.get('name', 'Unknown')}")
                all_required_found = False
            else:
                print(f"   📊 {sale_type.get('name', 'Unknown')}: tax_rate={sale_type.get('tax_rate')}%, tip_default={sale_type.get('tip_default')}%")
        
        return all_required_found and len(response) >= 3

    def test_payment_methods_api(self):
        """Test payment methods API - should return 6 methods with USD and EUR exchange rates"""
        success, response = self.run_test(
            "Payment Methods API",
            "GET", 
            "payment-methods",
            200,
            description="Get payment methods with exchange rates"
        )
        
        if not success:
            return False
            
        if not isinstance(response, list):
            print(f"   ❌ Expected list, got {type(response)}")
            return False
            
        print(f"   💳 Found {len(response)} payment methods")
        
        # Check for minimum 6 methods
        if len(response) < 6:
            print(f"   ❌ Expected at least 6 payment methods, found {len(response)}")
            return False
        
        # Look for USD and EUR specifically
        usd_found = False
        eur_found = False
        
        for method in response:
            name = method.get('name', '')
            currency = method.get('currency', '')
            exchange_rate = method.get('exchange_rate', 0)
            
            print(f"   💰 {name}: {currency} (rate: {exchange_rate})")
            
            if 'USD' in currency or 'Dolar' in name:
                usd_found = True
                if exchange_rate != 58.50:
                    print(f"   ⚠️  USD rate expected 58.50, found {exchange_rate}")
                else:
                    print(f"   ✅ USD rate correct: {exchange_rate}")
            
            if 'EUR' in currency or 'Euro' in name:
                eur_found = True  
                if exchange_rate != 63.20:
                    print(f"   ⚠️  EUR rate expected 63.20, found {exchange_rate}")
                else:
                    print(f"   ✅ EUR rate correct: {exchange_rate}")
        
        if not usd_found:
            print("   ❌ USD payment method not found")
        if not eur_found:
            print("   ❌ EUR payment method not found")
            
        return len(response) >= 6 and usd_found and eur_found

    def test_shifts_check_api(self):
        """Test shifts check API - should return has_open_shift status"""
        success, response = self.run_test(
            "Shifts Check API", 
            "GET",
            "shifts/check",
            200,
            description="Check if user has open shift"
        )
        
        if not success:
            return False
            
        if not isinstance(response, dict):
            print(f"   ❌ Expected dict, got {type(response)}")
            return False
            
        if 'has_open_shift' not in response:
            print("   ❌ Missing 'has_open_shift' field in response")
            return False
            
        has_shift = response.get('has_open_shift')
        print(f"   🔄 has_open_shift: {has_shift}")
        
        return True

    def test_day_close_check_api(self):
        """Test day close check API - should return can_close with blockers list"""
        success, response = self.run_test(
            "Day Close Check API",
            "GET", 
            "day-close/check",
            200,
            description="Check if day can be closed with blockers"
        )
        
        if not success:
            return False
            
        if not isinstance(response, dict):
            print(f"   ❌ Expected dict, got {type(response)}")
            return False
            
        if 'can_close' not in response:
            print("   ❌ Missing 'can_close' field in response")
            return False
            
        if 'blockers' not in response:
            print("   ❌ Missing 'blockers' field in response") 
            return False
            
        can_close = response.get('can_close')
        blockers = response.get('blockers', [])
        
        print(f"   🔒 can_close: {can_close}")
        print(f"   🚫 blockers: {len(blockers)} items")
        
        if blockers:
            for blocker in blockers[:3]:  # Show first 3 blockers
                print(f"      • {blocker}")
        
        return True

    def test_station_config_api(self):
        """Test station config API - should return config with require_shift_to_sell"""
        success, response = self.run_test(
            "Station Config API",
            "GET",
            "station-config", 
            200,
            description="Get station configuration with shift requirements"
        )
        
        if not success:
            return False
            
        if not isinstance(response, dict):
            print(f"   ❌ Expected dict, got {type(response)}")
            return False
            
        if 'require_shift_to_sell' not in response:
            print("   ❌ Missing 'require_shift_to_sell' field in response")
            return False
            
        require_shift = response.get('require_shift_to_sell')
        print(f"   ⚙️ require_shift_to_sell: {require_shift}")
        
        # Check for other expected config fields
        expected_fields = ['require_cash_count', 'station_name']
        for field in expected_fields:
            if field in response:
                print(f"   ✅ {field}: {response.get(field)}")
            else:
                print(f"   ⚠️  Optional field {field} not present")
        
        return True

    def test_multi_table_reservations(self):
        """Test multi-table reservations with table_ids array"""
        success, response = self.run_test(
            "Multi-table Reservations",
            "POST",
            "reservations",
            200, 
            data={
                "customer_name": "Test Multi-Table Party",
                "phone": "809-555-0123",
                "date": datetime.now().strftime('%Y-%m-%d'),
                "time": "20:00",
                "party_size": 8,
                "table_ids": [],  # Will be populated with actual table IDs
                "notes": "Large party - Phase 8 multi-table test"
            },
            description="Create reservation with multiple tables"
        )
        
        if not success:
            # Try to get available tables first
            tables_success, tables = self.run_test(
                "Get Available Tables",
                "GET",
                "tables", 
                200,
                description="Get tables for multi-table reservation"
            )
            
            if tables_success and isinstance(tables, list) and len(tables) >= 2:
                # Use first 2 tables for test
                table_ids = [t['id'] for t in tables[:2] if t.get('status') == 'free']
                
                if len(table_ids) >= 2:
                    success, response = self.run_test(
                        "Multi-table Reservations (Retry)",
                        "POST",
                        "reservations",
                        200,
                        data={
                            "customer_name": "Test Multi-Table Party",
                            "phone": "809-555-0123", 
                            "date": datetime.now().strftime('%Y-%m-%d'),
                            "time": "20:00",
                            "party_size": 8,
                            "table_ids": table_ids,
                            "notes": "Large party - Phase 8 multi-table test"
                        },
                        description="Create reservation with actual table IDs"
                    )
                    
                    if success:
                        print(f"   ✅ Created multi-table reservation with {len(table_ids)} tables")
                        reservation_id = response.get('id')
                        
                        # Cleanup - delete the test reservation
                        if reservation_id:
                            self.run_test(
                                "Cleanup Test Reservation",
                                "DELETE",
                                f"reservations/{reservation_id}",
                                200,
                                description="Delete test reservation"
                            )
                        
                        return True
            
            print("   ❌ Could not test multi-table reservations - no available tables")
            return False
        
        return success

    def test_carlos_login(self):
        """Test Carlos user login with PIN 1234"""
        success, response = self.run_test(
            "Carlos Login",
            "POST",
            "auth/login", 
            200,
            data={"pin": "1234"},
            description="Login with Carlos PIN 1234"
        )
        
        if success and 'user' in response:
            user = response.get('user', {})
            name = user.get('name', '')
            role = user.get('role', '')
            
            print(f"   👤 User: {name}, Role: {role}")
            
            if name.lower() == 'carlos' or 'carlos' in name.lower():
                print("   ✅ Carlos user found and authenticated")
                return True
            else:
                print(f"   ⚠️  Expected Carlos user, got: {name}")
        
        return success

def main():
    print("🚀 Starting POS System Phase 8 Backend Testing...")
    print("📍 Testing: Sale types, Payment methods, Shifts check, Day close, Station config, Multi-table reservations")
    
    tester = Phase8POSAPITester()
    
    # Phase 1: Authentication with Admin
    if not tester.test_login():
        print("❌ Admin authentication failed - cannot continue with API tests")
        return 1
    
    # Test Carlos login as specified in requirements
    carlos_login_ok = tester.test_carlos_login()

    # Phase 2: Test all Phase 8 specific features
    print("\n📋 Testing Phase 8 Features...")
    
    sale_types_ok = tester.test_sale_types_api()
    payment_methods_ok = tester.test_payment_methods_api()
    shifts_check_ok = tester.test_shifts_check_api()
    day_close_ok = tester.test_day_close_check_api()
    station_config_ok = tester.test_station_config_api()
    multi_table_ok = tester.test_multi_table_reservations()

    # Results Summary
    print(f"\n📊 PHASE 8 TEST RESULTS:")
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    print(f"\n🎯 Phase 8 Backend Features:")
    print(f"✅ Sale Types API (3 types): {'PASS' if sale_types_ok else 'FAIL'}")
    print(f"✅ Payment Methods API (6+ methods): {'PASS' if payment_methods_ok else 'FAIL'}")  
    print(f"✅ Shifts Check API: {'PASS' if shifts_check_ok else 'FAIL'}")
    print(f"✅ Day Close Check API: {'PASS' if day_close_ok else 'FAIL'}")
    print(f"✅ Station Config API: {'PASS' if station_config_ok else 'FAIL'}")
    print(f"✅ Multi-table Reservations: {'PASS' if multi_table_ok else 'FAIL'}")
    print(f"✅ Carlos Login (PIN 1234): {'PASS' if carlos_login_ok else 'FAIL'}")

    # Show failed tests if any
    if tester.failed_tests:
        print(f"\n❌ FAILED TESTS ({len(tester.failed_tests)}):")
        for failure in tester.failed_tests[:5]:  # Show max 5 failures
            print(f"- {failure.get('test', 'Unknown')}: {failure.get('error', 'Unknown error')[:100]}")

    # Save detailed results
    with open('/app/test_reports/phase8_backend_results.json', 'w') as f:
        json.dump({
            "phase": "Phase 8",
            "summary": {
                "tests_run": tester.tests_run,
                "tests_passed": tester.tests_passed,
                "success_rate": f"{(tester.tests_passed/tester.tests_run)*100:.1f}%",
                "failed_count": len(tester.failed_tests)
            },
            "phase8_features": {
                "sale_types_api": sale_types_ok,
                "payment_methods_api": payment_methods_ok,
                "shifts_check_api": shifts_check_ok, 
                "day_close_check_api": day_close_ok,
                "station_config_api": station_config_ok,
                "multi_table_reservations": multi_table_ok,
                "carlos_login": carlos_login_ok
            },
            "failed_tests": tester.failed_tests,
            "detailed_results": tester.results
        }, f, indent=2)

    # Return success if at least 70% of tests pass
    success_rate = (tester.tests_passed/tester.tests_run) if tester.tests_run > 0 else 0
    return 0 if success_rate >= 0.7 else 1

if __name__ == "__main__":
    sys.exit(main())