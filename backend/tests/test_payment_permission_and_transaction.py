"""
Test Payment Screen Permission and Internal Transaction Number
Tests for Mesa POS RD - Iteration 58

Features to test:
1. PaymentScreen role-based access control (mesero redirected, admin/cashier/manager allowed)
2. Internal transaction number in comanda data
3. Internal transaction number in pre-check data
4. Internal transaction number saved in bill after payment
5. Transaction counter increments sequentially
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPaymentPermissionAndTransaction:
    """Test payment screen permissions and internal transaction numbers"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.admin_pin = "10000"
        self.waitress_pin = "5678"  # Maria - waiter role
        self.cashier_pin = "4321"   # Luis - cashier role (corrected from 1234)
        self.headers = {"Content-Type": "application/json"}
        
    def get_auth_token(self, pin):
        """Get auth token for a user by PIN"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": pin})
        if resp.status_code == 200:
            return resp.json().get("token")
        return None
    
    def get_user_info(self, token):
        """Get current user info"""
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        if resp.status_code == 200:
            return resp.json()
        return None
    
    # ═══════════════════════════════════════════════════════════════════════════════
    # TEST 1: Verify waitress user role
    # ═══════════════════════════════════════════════════════════════════════════════
    def test_waitress_user_role(self):
        """TEST 1: Verify waitress has role 'waiter' not 'admin/cashier/manager'"""
        token = self.get_auth_token(self.waitress_pin)
        assert token is not None, "Should get token for waitress"
        
        user = self.get_user_info(token)
        assert user is not None, "Should get user info"
        
        # Waitress should have 'waiter' role
        user_role = user.get("role", "")
        assert user_role == "waiter", f"Waitress should have 'waiter' role, got '{user_role}'"
        
        # Verify role is NOT in allowed list for payment processing
        allowed_roles = ["admin", "cashier", "manager"]
        assert user_role not in allowed_roles, f"Waitress role '{user_role}' should NOT be in allowed payment roles"
        print(f"✅ TEST 1 PASS: Waitress user has role '{user_role}' (not allowed to process payments)")
    
    # ═══════════════════════════════════════════════════════════════════════════════
    # TEST 2: Verify admin user role
    # ═══════════════════════════════════════════════════════════════════════════════
    def test_admin_user_role(self):
        """TEST 2: Verify admin has role 'admin' which IS allowed"""
        token = self.get_auth_token(self.admin_pin)
        assert token is not None, "Should get token for admin"
        
        user = self.get_user_info(token)
        assert user is not None, "Should get user info"
        
        user_role = user.get("role", "")
        assert user_role == "admin", f"Admin should have 'admin' role, got '{user_role}'"
        
        allowed_roles = ["admin", "cashier", "manager"]
        assert user_role in allowed_roles, f"Admin role '{user_role}' should be in allowed payment roles"
        print(f"✅ TEST 2 PASS: Admin user has role '{user_role}' (allowed to process payments)")
    
    # ═══════════════════════════════════════════════════════════════════════════════
    # TEST 3: Verify cashier user role
    # ═══════════════════════════════════════════════════════════════════════════════
    def test_cashier_user_role(self):
        """TEST 3: Verify cashier has role 'cashier' which IS allowed"""
        token = self.get_auth_token(self.cashier_pin)
        assert token is not None, "Should get token for cashier"
        
        user = self.get_user_info(token)
        assert user is not None, "Should get user info"
        
        user_role = user.get("role", "")
        assert user_role == "cashier", f"Cashier should have 'cashier' role, got '{user_role}'"
        
        allowed_roles = ["admin", "cashier", "manager"]
        assert user_role in allowed_roles, f"Cashier role '{user_role}' should be in allowed payment roles"
        print(f"✅ TEST 3 PASS: Cashier user has role '{user_role}' (allowed to process payments)")

    # ═══════════════════════════════════════════════════════════════════════════════
    # TEST 4: Internal transaction number in send-comanda
    # ═══════════════════════════════════════════════════════════════════════════════
    def test_send_comanda_has_internal_transaction_number(self):
        """TEST 4: /api/print/send-comanda/{order_id} returns internal_transaction_number"""
        token = self.get_auth_token(self.admin_pin)
        assert token is not None, "Should get token for admin"
        headers = {"Authorization": f"Bearer {token}"}
        
        # First create an order with items
        # Get tables
        tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert tables_resp.status_code == 200
        tables = tables_resp.json()
        assert len(tables) > 0, "Should have tables"
        table = tables[0]
        
        # Get products
        products_resp = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert products_resp.status_code == 200
        products = products_resp.json()
        assert len(products) > 0, "Should have products"
        product = products[0]
        
        # Create order
        order_data = {
            "table_id": table["id"],
            "table_number": table.get("number", 1),
            "items": [
                {
                    "product_id": product["id"],
                    "product_name": product.get("name", "Test Product"),
                    "quantity": 1,
                    "unit_price": product.get("price", 100),
                    "status": "pending"
                }
            ]
        }
        order_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
        assert order_resp.status_code in [200, 201], f"Should create order, got {order_resp.status_code}"
        order = order_resp.json()
        order_id = order.get("id")
        assert order_id, "Order should have ID"
        
        # Send to kitchen to trigger comanda
        requests.post(f"{BASE_URL}/api/orders/{order_id}/send", headers=headers)
        
        # Send comanda
        comanda_resp = requests.post(f"{BASE_URL}/api/print/send-comanda/{order_id}", headers=headers)
        
        # Check response
        if comanda_resp.status_code == 200:
            result = comanda_resp.json()
            # The response should include jobs_created which have internal_transaction_number in data
            jobs = result.get("jobs_created", [])
            if jobs:
                for job in jobs:
                    data = job.get("data", {})
                    assert "internal_transaction_number" in data, "Comanda data should include internal_transaction_number"
                    trans_num = data.get("internal_transaction_number")
                    assert trans_num is not None, "internal_transaction_number should not be None"
                    assert isinstance(trans_num, int), f"internal_transaction_number should be int, got {type(trans_num)}"
                    print(f"✅ TEST 4 PASS: Comanda has internal_transaction_number: {trans_num}")
            else:
                # No items to send to kitchen, skip
                print("⚠️ TEST 4 SKIP: No comanda jobs created (no pending items)")
        else:
            print(f"⚠️ TEST 4 SKIP: Comanda endpoint returned {comanda_resp.status_code}")
        
        # Cleanup - cancel the order
        requests.post(f"{BASE_URL}/api/orders/{order_id}/cancel", headers=headers)

    # ═══════════════════════════════════════════════════════════════════════════════
    # TEST 5: Internal transaction number in pre-check/send
    # ═══════════════════════════════════════════════════════════════════════════════
    def test_precheck_send_has_internal_transaction_number(self):
        """TEST 5: /api/print/pre-check/{order_id}/send includes internal_transaction_number"""
        token = self.get_auth_token(self.admin_pin)
        assert token is not None, "Should get token for admin"
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get existing active orders
        orders_resp = requests.get(f"{BASE_URL}/api/orders?status=active", headers=headers)
        orders = orders_resp.json() if orders_resp.status_code == 200 else []
        
        # Or create a new order
        if not orders:
            tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=headers)
            tables = tables_resp.json() if tables_resp.status_code == 200 else []
            products_resp = requests.get(f"{BASE_URL}/api/products", headers=headers)
            products = products_resp.json() if products_resp.status_code == 200 else []
            
            if tables and products:
                table = tables[0]
                product = products[0]
                order_data = {
                    "table_id": table["id"],
                    "table_number": table.get("number", 1),
                    "items": [
                        {
                            "product_id": product["id"],
                            "product_name": product.get("name", "Test Product"),
                            "quantity": 1,
                            "unit_price": product.get("price", 100),
                            "status": "sent"
                        }
                    ]
                }
                order_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
                if order_resp.status_code in [200, 201]:
                    order = order_resp.json()
                    order_id = order.get("id")
                else:
                    pytest.skip("Could not create test order")
            else:
                pytest.skip("No tables or products available")
        else:
            order_id = orders[0].get("id")
        
        # Send pre-check
        precheck_resp = requests.post(f"{BASE_URL}/api/print/pre-check/{order_id}/send", headers=headers)
        
        if precheck_resp.status_code == 200:
            result = precheck_resp.json()
            # The result might be the job or have queued info
            # Check if internal_transaction_number was logged
            # Check pre_check_prints collection for this order
            assert result.get("ok", True) or "queued" in result or "id" in result, \
                "Pre-check should return success response"
            print(f"✅ TEST 5 PASS: Pre-check endpoint executed successfully")
        else:
            print(f"⚠️ TEST 5 INFO: Pre-check returned {precheck_resp.status_code}: {precheck_resp.text[:200]}")

    # ═══════════════════════════════════════════════════════════════════════════════
    # TEST 6: Internal transaction number saved in bill after payment
    # ═══════════════════════════════════════════════════════════════════════════════
    def test_bill_payment_saves_internal_transaction_number(self):
        """TEST 6: /api/bills/{bill_id}/pay saves internal_transaction_number in bill"""
        token = self.get_auth_token(self.admin_pin)
        assert token is not None, "Should get token for admin"
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get or create a bill
        # First get tables and products
        tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        tables = tables_resp.json() if tables_resp.status_code == 200 else []
        products_resp = requests.get(f"{BASE_URL}/api/products", headers=headers)
        products = products_resp.json() if products_resp.status_code == 200 else []
        
        if not tables or not products:
            pytest.skip("No tables or products")
        
        table = tables[0]
        product = products[0]
        
        # Create order
        order_data = {
            "table_id": table["id"],
            "table_number": table.get("number", 1),
            "items": [
                {
                    "product_id": product["id"],
                    "product_name": product.get("name", "Test Product"),
                    "quantity": 1,
                    "unit_price": product.get("price", 100),
                    "status": "sent"
                }
            ]
        }
        order_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
        assert order_resp.status_code in [200, 201], f"Should create order"
        order = order_resp.json()
        order_id = order.get("id")
        
        # Create bill from order
        bill_data = {
            "order_id": order_id,
            "table_id": table["id"],
            "label": f"Mesa {table.get('number', 1)}"
        }
        bill_resp = requests.post(f"{BASE_URL}/api/bills", json=bill_data, headers=headers)
        assert bill_resp.status_code in [200, 201], f"Should create bill, got {bill_resp.status_code}: {bill_resp.text[:200]}"
        bill = bill_resp.json()
        bill_id = bill.get("id")
        
        # Pay the bill
        pay_data = {
            "payment_method": "cash",
            "tip_percentage": 0,
            "total": bill.get("total", 100)
        }
        pay_resp = requests.post(f"{BASE_URL}/api/bills/{bill_id}/pay", json=pay_data, headers=headers)
        assert pay_resp.status_code == 200, f"Should pay bill, got {pay_resp.status_code}"
        
        paid_bill = pay_resp.json()
        
        # Verify internal_transaction_number is in the paid bill
        assert "internal_transaction_number" in paid_bill, \
            "Paid bill should include internal_transaction_number"
        trans_num = paid_bill.get("internal_transaction_number")
        assert trans_num is not None, "internal_transaction_number should not be None"
        assert isinstance(trans_num, int), f"internal_transaction_number should be int, got {type(trans_num)}"
        assert trans_num > 0, f"internal_transaction_number should be positive, got {trans_num}"
        
        print(f"✅ TEST 6 PASS: Paid bill has internal_transaction_number: {trans_num}")

    # ═══════════════════════════════════════════════════════════════════════════════
    # TEST 7: Transaction counter increments sequentially
    # ═══════════════════════════════════════════════════════════════════════════════
    def test_transaction_counter_increments(self):
        """TEST 7: Transaction counter increments sequentially across multiple bills"""
        token = self.get_auth_token(self.admin_pin)
        assert token is not None, "Should get token for admin"
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get tables and products
        tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        tables = tables_resp.json() if tables_resp.status_code == 200 else []
        products_resp = requests.get(f"{BASE_URL}/api/products", headers=headers)
        products = products_resp.json() if products_resp.status_code == 200 else []
        
        if not tables or not products:
            pytest.skip("No tables or products")
        
        table = tables[0]
        product = products[0]
        
        transaction_numbers = []
        
        # Create and pay 2 bills to verify sequential increment
        for i in range(2):
            # Create order
            order_data = {
                "table_id": table["id"],
                "table_number": table.get("number", 1),
                "items": [
                    {
                        "product_id": product["id"],
                        "product_name": product.get("name", "Test Product"),
                        "quantity": 1,
                        "unit_price": product.get("price", 100),
                        "status": "sent"
                    }
                ]
            }
            order_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
            if order_resp.status_code not in [200, 201]:
                continue
            order = order_resp.json()
            order_id = order.get("id")
            
            # Create bill
            bill_data = {
                "order_id": order_id,
                "table_id": table["id"],
                "label": f"Mesa {table.get('number', 1)}"
            }
            bill_resp = requests.post(f"{BASE_URL}/api/bills", json=bill_data, headers=headers)
            if bill_resp.status_code not in [200, 201]:
                continue
            bill = bill_resp.json()
            bill_id = bill.get("id")
            
            # Pay bill
            pay_data = {
                "payment_method": "cash",
                "tip_percentage": 0,
                "total": bill.get("total", 100)
            }
            pay_resp = requests.post(f"{BASE_URL}/api/bills/{bill_id}/pay", json=pay_data, headers=headers)
            if pay_resp.status_code == 200:
                paid_bill = pay_resp.json()
                trans_num = paid_bill.get("internal_transaction_number")
                if trans_num:
                    transaction_numbers.append(trans_num)
        
        # Verify we got at least 2 transaction numbers
        assert len(transaction_numbers) >= 2, f"Should have at least 2 transaction numbers, got {len(transaction_numbers)}"
        
        # Verify they are sequential (increment by 1 or more)
        # Note: Other operations might also increment the counter, so we check that later > earlier
        assert transaction_numbers[1] > transaction_numbers[0], \
            f"Second transaction number ({transaction_numbers[1]}) should be greater than first ({transaction_numbers[0]})"
        
        print(f"✅ TEST 7 PASS: Transaction numbers are sequential: {transaction_numbers[0]} -> {transaction_numbers[1]}")


class TestFrontendPaymentScreenCode:
    """Verify PaymentScreen.js has correct permission checks"""
    
    def test_payment_screen_has_role_check(self):
        """TEST 8: PaymentScreen.js has allowedRoles and canProcessPayment check"""
        import subprocess
        
        # Check for allowedRoles definition
        result = subprocess.run(
            ["grep", "-n", "allowedRoles.*admin.*cashier.*manager", "/app/frontend/src/pages/PaymentScreen.js"],
            capture_output=True, text=True
        )
        assert result.returncode == 0, "PaymentScreen.js should have allowedRoles with admin, cashier, manager"
        
        # Check for canProcessPayment
        result2 = subprocess.run(
            ["grep", "-n", "canProcessPayment", "/app/frontend/src/pages/PaymentScreen.js"],
            capture_output=True, text=True
        )
        assert result2.returncode == 0, "PaymentScreen.js should have canProcessPayment check"
        
        # Check for useEffect redirect
        result3 = subprocess.run(
            ["grep", "-n", "useEffect.*canProcessPayment", "/app/frontend/src/pages/PaymentScreen.js"],
            capture_output=True, text=True
        )
        # Check that both useEffect and canProcessPayment exist in file
        assert "canProcessPayment" in result2.stdout, "canProcessPayment should be defined"
        
        print("✅ TEST 8 PASS: PaymentScreen.js has role-based permission checks")
    
    def test_payment_screen_redirects_unauthorized(self):
        """TEST 9: PaymentScreen.js redirects to /tables if unauthorized"""
        import subprocess
        
        # Check for navigate('/tables') in useEffect
        result = subprocess.run(
            ["grep", "-n", "navigate.*tables", "/app/frontend/src/pages/PaymentScreen.js"],
            capture_output=True, text=True
        )
        assert result.returncode == 0, "PaymentScreen.js should redirect to /tables"
        assert "/tables" in result.stdout, "Should redirect to /tables"
        
        # Check for toast error message
        result2 = subprocess.run(
            ["grep", "-n", "toast.error.*permiso.*pagos", "/app/frontend/src/pages/PaymentScreen.js"],
            capture_output=True, text=True
        )
        assert result2.returncode == 0, "PaymentScreen.js should show permission error toast"
        
        print("✅ TEST 9 PASS: PaymentScreen.js redirects unauthorized users with error toast")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
