#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class POS_Phase10_Tester:
    def __init__(self, base_url="https://sistema-ventas-rd.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, passed, message="", response_data=None):
        """Log test results"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ {name}: {message}")
        else:
            print(f"❌ {name}: {message}")
        
        self.test_results.append({
            "test_name": name,
            "passed": passed,
            "message": message,
            "response_data": response_data if response_data else None
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}" if not endpoint.startswith('http') else endpoint
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            response_data = None
            
            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}

            message = f"Status: {response.status_code}"
            if not success:
                message += f" (expected {expected_status}). Response: {response.text[:200]}"

            self.log_test(name, success, message, response_data)
            return success, response_data

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_login(self, pin, expected_name=None):
        """Test login and get token"""
        success, response = self.run_test(
            f"Login with PIN {pin}",
            "POST",
            "auth/login", 
            200,
            data={"pin": pin}
        )
        
        if success and 'token' in response:
            self.token = response['token']
            actual_name = response.get('user', {}).get('name', 'Unknown')
            if expected_name and actual_name != expected_name:
                self.log_test(f"Login name verification for {pin}", False, f"Expected '{expected_name}', got '{actual_name}'")
            else:
                self.log_test(f"Login name verification for {pin}", True, f"Got correct name: {actual_name}")
            return True, response
        return False, response

    def test_duplicate_pin_prevention(self):
        """Test Phase 10: Duplicate PIN prevention"""
        print("\n🔍 Testing Duplicate PIN Prevention...")
        
        # First, create a user with PIN 9999
        test_user_data = {
            "name": "Test User Duplicate PIN",
            "pin": "9999",
            "role": "waiter"
        }
        
        # Try to create first user
        success1, response1 = self.run_test(
            "Create user with PIN 9999 (first time)",
            "POST",
            "users",
            201,
            data=test_user_data
        )
        
        if success1:
            user1_id = response1.get('id')
        
        # Try to create second user with same PIN - should fail with 400
        test_user_data2 = {
            "name": "Test User Duplicate PIN 2", 
            "pin": "9999",
            "role": "cashier"
        }
        
        success2, response2 = self.run_test(
            "Create user with duplicate PIN 9999 (should fail)",
            "POST", 
            "users",
            400,  # Should return 400 error
            data=test_user_data2
        )
        
        if success2:
            expected_message = "Ya existe un usuario con ese PIN"
            actual_message = response2.get('detail', '')
            if expected_message in actual_message:
                self.log_test("Duplicate PIN error message", True, f"Got expected message: {actual_message}")
            else:
                self.log_test("Duplicate PIN error message", False, f"Expected '{expected_message}', got '{actual_message}'")
        
        # Cleanup - delete the test user if created
        if 'user1_id' in locals() and user1_id:
            self.run_test("Cleanup test user", "DELETE", f"users/{user1_id}", 200)

    def test_default_roles(self):
        """Test Phase 10: 4 default roles"""
        print("\n🔍 Testing Default Roles...")
        
        success, response = self.run_test(
            "Get roles list",
            "GET",
            "roles",
            200
        )
        
        if success:
            roles = response if isinstance(response, list) else []
            role_names = [r.get('name', '') for r in roles]
            expected_roles = ['Administrador', 'Mesero', 'Cajero', 'Cocina']
            
            found_count = 0
            for expected_role in expected_roles:
                if expected_role in role_names:
                    found_count += 1
                    self.log_test(f"Found default role: {expected_role}", True, f"Role exists in system")
                else:
                    self.log_test(f"Missing default role: {expected_role}", False, f"Role not found")
            
            self.log_test("Default roles count", found_count == 4, f"Found {found_count}/4 default roles")
            return len(roles)
        
        return 0

    def test_29_permissions(self):
        """Test Phase 10: 29 granular permissions"""
        print("\n🔍 Testing 29 Granular Permissions...")
        
        success, response = self.run_test(
            "Get all permissions",
            "GET", 
            "permissions/all",
            200
        )
        
        if success:
            permissions = response if isinstance(response, dict) else {}
            perm_count = len(permissions)
            
            self.log_test("29 permissions check", perm_count == 29, f"Found {perm_count} permissions (expected 29)")
            
            # Check for some key permissions
            key_permissions = [
                'view_dashboard', 'move_tables', 'open_table', 'manage_users',
                'manage_areas', 'manage_tables', 'manage_payment_methods',
                'manage_products', 'view_reports', 'manage_inventory'
            ]
            
            for perm in key_permissions:
                if perm in permissions:
                    self.log_test(f"Key permission: {perm}", True, f"Found: {permissions[perm]}")
                else:
                    self.log_test(f"Missing key permission: {perm}", False, "Permission not found")
            
            return perm_count
        
        return 0

    def test_custom_roles_crud(self):
        """Test Phase 10: Custom roles CRUD"""
        print("\n🔍 Testing Custom Roles CRUD...")
        
        # Create custom role
        custom_role_data = {
            "name": "Supervisor Test",
            "code": "supervisor_test"
        }
        
        success, response = self.run_test(
            "Create custom role",
            "POST",
            "roles", 
            201,
            data=custom_role_data
        )
        
        if success:
            role_id = response.get('id')
            role_name = response.get('name')
            
            self.log_test("Custom role creation data", role_name == "Supervisor Test", f"Created role: {role_name}")
            
            # Update the custom role
            update_data = {"name": "Senior Supervisor Test"}
            update_success, update_response = self.run_test(
                "Update custom role",
                "PUT",
                f"roles/{role_id}",
                200,
                data=update_data
            )
            
            # Delete the custom role
            delete_success, delete_response = self.run_test(
                "Delete custom role", 
                "DELETE",
                f"roles/{role_id}",
                200
            )
            
            return True
        
        return False

    def test_admin_login_and_permissions(self):
        """Test admin login with PIN 0000"""
        print("\n🔍 Testing Admin Login (PIN: 0000)...")
        
        login_success, login_response = self.test_login("0000", "Admin")
        
        if login_success:
            user_data = login_response.get('user', {})
            permissions = user_data.get('permissions', {})
            
            # Check admin has key permissions
            admin_perms = ['manage_users', 'manage_areas', 'manage_tables', 'view_dashboard', 'view_reports']
            admin_perm_count = 0
            
            for perm in admin_perms:
                if permissions.get(perm, False):
                    admin_perm_count += 1
                    
            self.log_test("Admin permissions check", admin_perm_count == len(admin_perms), 
                         f"Admin has {admin_perm_count}/{len(admin_perms)} key permissions")
            
            return True
        
        return False

    def test_waiter_carlos_permissions(self):
        """Test Carlos (waiter) login and limited permissions"""
        print("\n🔍 Testing Carlos (Waiter) Login (PIN: 1234)...")
        
        login_success, login_response = self.test_login("1234", "Carlos")
        
        if login_success:
            user_data = login_response.get('user', {})
            permissions = user_data.get('permissions', {})
            role = user_data.get('role', '')
            
            self.log_test("Carlos role check", role == "waiter", f"Carlos has role: {role}")
            
            # Check waiter permissions (should be limited)
            waiter_should_have = ['open_table', 'add_products', 'manage_customers', 'manage_reservations']
            waiter_should_not_have = ['manage_users', 'manage_areas', 'view_reports', 'manage_products']
            
            has_count = 0
            for perm in waiter_should_have:
                if permissions.get(perm, False):
                    has_count += 1
            
            lacks_count = 0  
            for perm in waiter_should_not_have:
                if not permissions.get(perm, False):
                    lacks_count += 1
                    
            self.log_test("Carlos waiter permissions", has_count == len(waiter_should_have), 
                         f"Carlos has {has_count}/{len(waiter_should_have)} expected permissions")
            self.log_test("Carlos restricted permissions", lacks_count == len(waiter_should_not_have),
                         f"Carlos correctly lacks {lacks_count}/{len(waiter_should_not_have)} admin permissions")
            
            return True
            
        return False

    def run_all_backend_tests(self):
        """Run all backend API tests for Phase 10"""
        print("=" * 60)
        print("🚀 STARTING POS PHASE 10 BACKEND API TESTING")
        print("=" * 60)
        
        # Test basic connectivity
        success, response = self.run_test(
            "Backend API connectivity",
            "GET",
            "permissions/all", 
            200
        )
        
        if not success:
            print("❌ Backend API is not accessible. Stopping tests.")
            return False
        
        # Phase 10 Feature Tests
        self.test_duplicate_pin_prevention()
        self.test_default_roles() 
        self.test_29_permissions()
        self.test_custom_roles_crud()
        
        # Login and permission tests
        self.test_admin_login_and_permissions()
        self.test_waiter_carlos_permissions()
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 BACKEND TEST SUMMARY")
        print("=" * 60)
        print(f"Tests passed: {self.tests_passed}/{self.tests_run}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"Success rate: {success_rate:.1f}%")
        
        if success_rate >= 80:
            print("✅ Backend tests mostly successful!")
        else:
            print("⚠️  Backend has significant issues that need fixing")
            
        return success_rate >= 80

def main():
    tester = POS_Phase10_Tester()
    
    try:
        success = tester.run_all_backend_tests()
        
        # Save detailed results
        results = {
            "timestamp": datetime.now().isoformat(),
            "total_tests": tester.tests_run,
            "passed_tests": tester.tests_passed,
            "success_rate": (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0,
            "test_details": tester.test_results
        }
        
        with open("/app/test_reports/phase10_backend_results.json", "w") as f:
            json.dump(results, f, indent=2)
            
        return 0 if success else 1
        
    except Exception as e:
        print(f"❌ Critical error during testing: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())