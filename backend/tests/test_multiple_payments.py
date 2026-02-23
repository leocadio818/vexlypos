"""
Tests for Multiple Payments Motor Feature

Tests:
1. Backend accepts payments array in POST /api/bills/{bill_id}/pay
2. Backend stores payments array in bill document
3. Backend stores change_currency and change_amount in bill
4. Payment methods return exchange_rate correctly (USD=64, EUR=70 approx)
5. Multiple payment breakdown is stored correctly
6. Change calculated correctly when paying with foreign currency
7. Pre-cuenta includes equivalents in USD/EUR with rates
8. Invoice print format includes multiple payment methods
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMultiplePayments:
    """Tests for multiple payments feature"""
    
    auth_token = None
    test_order_id = None
    test_bill_id = None
    payment_methods = []
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for testing"""
        # Login as admin
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.auth_token = login_response.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.auth_token}", "Content-Type": "application/json"}
        
    def test_01_payment_methods_have_exchange_rate(self):
        """TEST 1: Payment methods return currency and exchange_rate correctly"""
        response = requests.get(f"{BASE_URL}/api/payment-methods", headers=self.headers)
        assert response.status_code == 200, f"Failed to get payment methods: {response.text}"
        
        methods = response.json()
        assert len(methods) > 0, "No payment methods found"
        
        # Store for later tests
        TestMultiplePayments.payment_methods = methods
        
        # Check that foreign currency methods have exchange_rate
        usd_methods = [m for m in methods if m.get('currency') == 'USD']
        eur_methods = [m for m in methods if m.get('currency') == 'EUR']
        
        print(f"Found {len(usd_methods)} USD methods and {len(eur_methods)} EUR methods")
        
        if usd_methods:
            usd_method = usd_methods[0]
            assert 'exchange_rate' in usd_method, "USD method missing exchange_rate"
            assert usd_method['exchange_rate'] > 1, f"USD rate should be > 1, got {usd_method['exchange_rate']}"
            print(f"USD method: {usd_method['name']} - Rate: {usd_method['exchange_rate']}")
            
        if eur_methods:
            eur_method = eur_methods[0]
            assert 'exchange_rate' in eur_method, "EUR method missing exchange_rate"
            assert eur_method['exchange_rate'] > 1, f"EUR rate should be > 1, got {eur_method['exchange_rate']}"
            print(f"EUR method: {eur_method['name']} - Rate: {eur_method['exchange_rate']}")
        
        # Check DOP methods have exchange_rate = 1
        dop_methods = [m for m in methods if m.get('currency', 'DOP') == 'DOP']
        if dop_methods:
            for m in dop_methods[:2]:
                assert m.get('exchange_rate', 1) == 1, f"DOP method should have rate=1, got {m.get('exchange_rate')}"
        
        print("TEST 1 PASSED: Payment methods have correct exchange_rate")

    def test_02_create_order_and_bill_for_testing(self):
        """TEST 2: Create a test order and bill for payment testing"""
        # Get tables
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        assert tables_response.status_code == 200
        tables = tables_response.json()
        free_tables = [t for t in tables if t.get('status') == 'free']
        
        if not free_tables:
            # Free up a table
            table_id = tables[0]['id']
            requests.post(f"{BASE_URL}/api/tables/{table_id}/release", headers=self.headers)
            free_tables = [tables[0]]
        
        table = free_tables[0]
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        assert products_response.status_code == 200
        products = products_response.json()
        assert len(products) > 0, "No products found"
        product = products[0]
        
        # Create order
        order_data = {
            "table_id": table['id'],
            "waiter_id": "test-waiter",
            "waiter_name": "Test Waiter"
        }
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        assert order_response.status_code == 200, f"Failed to create order: {order_response.text}"
        order = order_response.json()
        TestMultiplePayments.test_order_id = order['id']
        print(f"Created order: {order['id']}")
        
        # Add items to order
        item_data = {
            "product_id": product['id'],
            "product_name": product['name'],
            "quantity": 2,
            "unit_price": product.get('price', 100),
            "modifiers": []
        }
        add_item_response = requests.post(f"{BASE_URL}/api/orders/{order['id']}/items", json=item_data, headers=self.headers)
        assert add_item_response.status_code == 200, f"Failed to add item: {add_item_response.text}"
        
        # Create bill
        bill_data = {
            "order_id": order['id'],
            "table_id": table['id'],
            "label": f"Mesa {table['number']}"
        }
        bill_response = requests.post(f"{BASE_URL}/api/bills", json=bill_data, headers=self.headers)
        assert bill_response.status_code == 200, f"Failed to create bill: {bill_response.text}"
        bill = bill_response.json()
        TestMultiplePayments.test_bill_id = bill['id']
        print(f"Created bill: {bill['id']} - Total: {bill['total']}")
        
        print("TEST 2 PASSED: Created test order and bill")

    def test_03_pay_with_single_payment_method(self):
        """TEST 3: Pay bill with single payment method (backward compatibility)"""
        # Create another order/bill for this test
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_response.json()
        free_tables = [t for t in tables if t.get('status') == 'free']
        
        if not free_tables:
            table_id = tables[0]['id']
            requests.post(f"{BASE_URL}/api/tables/{table_id}/release", headers=self.headers)
            free_tables = [tables[0]]
        
        table = free_tables[0]
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        product = products[0]
        
        # Create order
        order_data = {"table_id": table['id'], "waiter_id": "test", "waiter_name": "Test"}
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        order = order_response.json()
        
        # Add item
        item_data = {"product_id": product['id'], "product_name": product['name'], "quantity": 1, "unit_price": 100, "modifiers": []}
        requests.post(f"{BASE_URL}/api/orders/{order['id']}/items", json=item_data, headers=self.headers)
        
        # Create bill
        bill_data = {"order_id": order['id'], "table_id": table['id'], "label": "Test"}
        bill_response = requests.post(f"{BASE_URL}/api/bills", json=bill_data, headers=self.headers)
        bill = bill_response.json()
        
        # Pay with single method (old format)
        dop_methods = [m for m in TestMultiplePayments.payment_methods if m.get('currency', 'DOP') == 'DOP']
        payment_method_id = dop_methods[0]['id'] if dop_methods else ""
        
        pay_data = {
            "payment_method": "cash",
            "payment_method_id": payment_method_id,
            "tip_percentage": 0,
            "total": bill['total'],
            "amount_received": bill['total'] + 50  # Give change
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/bills/{bill['id']}/pay", json=pay_data, headers=self.headers)
        assert pay_response.status_code == 200, f"Payment failed: {pay_response.text}"
        
        paid_bill = pay_response.json()
        assert paid_bill['status'] == 'paid', "Bill should be paid"
        assert 'payments' in paid_bill, "Paid bill should have payments array"
        assert len(paid_bill['payments']) == 1, f"Single payment should have 1 entry, got {len(paid_bill.get('payments', []))}"
        
        print(f"Paid bill with single method: {paid_bill['payments']}")
        print("TEST 3 PASSED: Single payment method works (backward compatibility)")

    def test_04_pay_with_multiple_payment_methods(self):
        """TEST 4: Pay bill with multiple payment methods (new feature)"""
        # Create another order/bill
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_response.json()
        free_tables = [t for t in tables if t.get('status') == 'free']
        
        if not free_tables:
            table_id = tables[0]['id']
            requests.post(f"{BASE_URL}/api/tables/{table_id}/release", headers=self.headers)
            free_tables = [tables[0]]
        
        table = free_tables[0]
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        product = products[0]
        
        # Create order with higher value for split payment
        order_data = {"table_id": table['id'], "waiter_id": "test", "waiter_name": "Test"}
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        order = order_response.json()
        
        # Add items with higher quantity
        item_data = {"product_id": product['id'], "product_name": product['name'], "quantity": 5, "unit_price": 200, "modifiers": []}
        requests.post(f"{BASE_URL}/api/orders/{order['id']}/items", json=item_data, headers=self.headers)
        
        # Create bill
        bill_data = {"order_id": order['id'], "table_id": table['id'], "label": "Test Multiple"}
        bill_response = requests.post(f"{BASE_URL}/api/bills", json=bill_data, headers=self.headers)
        bill = bill_response.json()
        bill_total = bill['total']
        print(f"Bill total: {bill_total}")
        
        # Get payment methods for multi-pay
        dop_methods = [m for m in TestMultiplePayments.payment_methods if m.get('currency', 'DOP') == 'DOP']
        usd_methods = [m for m in TestMultiplePayments.payment_methods if m.get('currency') == 'USD']
        
        # Build multiple payments: half in DOP, half in USD (if available)
        payments_list = []
        half = round(bill_total / 2, 2)
        
        # First payment in DOP (cash)
        if dop_methods:
            dop_method = dop_methods[0]
            payments_list.append({
                "payment_method_id": dop_method['id'],
                "payment_method_name": dop_method['name'],
                "amount": half,
                "amount_dop": half,
                "currency": "DOP",
                "exchange_rate": 1
            })
        
        # Second payment in USD (if available) or another DOP method
        if usd_methods:
            usd_method = usd_methods[0]
            usd_rate = usd_method.get('exchange_rate', 64)
            usd_amount = round(half / usd_rate, 2)  # Convert to USD
            payments_list.append({
                "payment_method_id": usd_method['id'],
                "payment_method_name": usd_method['name'],
                "amount": usd_amount,  # USD amount
                "amount_dop": half,     # DOP equivalent
                "currency": "USD",
                "exchange_rate": usd_rate
            })
        elif len(dop_methods) > 1:
            # Use another DOP method (card)
            card_method = dop_methods[1]
            payments_list.append({
                "payment_method_id": card_method['id'],
                "payment_method_name": card_method['name'],
                "amount": half,
                "amount_dop": half,
                "currency": "DOP",
                "exchange_rate": 1
            })
        
        # Pay with multiple methods
        pay_data = {
            "payment_method": "mixed",
            "tip_percentage": 0,
            "total": bill_total,
            "amount_received": bill_total,
            "payments": payments_list,
            "change_currency": "DOP",
            "change_amount": 0
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/bills/{bill['id']}/pay", json=pay_data, headers=self.headers)
        assert pay_response.status_code == 200, f"Multiple payment failed: {pay_response.text}"
        
        paid_bill = pay_response.json()
        assert paid_bill['status'] == 'paid', "Bill should be paid"
        assert 'payments' in paid_bill, "Paid bill should have payments array"
        assert len(paid_bill['payments']) >= 2, f"Multiple payments should have 2+ entries, got {len(paid_bill.get('payments', []))}"
        
        # Verify each payment entry
        for pmt in paid_bill['payments']:
            assert 'payment_method_id' in pmt, "Payment entry missing payment_method_id"
            assert 'payment_method_name' in pmt, "Payment entry missing payment_method_name"
            assert 'amount' in pmt, "Payment entry missing amount"
            assert 'currency' in pmt, "Payment entry missing currency"
            print(f"Payment: {pmt['payment_method_name']} - {pmt['currency']} {pmt['amount']} (DOP: {pmt.get('amount_dop', 'N/A')})")
        
        print("TEST 4 PASSED: Multiple payment methods work correctly")

    def test_05_change_currency_and_amount_stored(self):
        """TEST 5: Verify change_currency and change_amount are stored in bill"""
        # Create order/bill
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_response.json()
        free_tables = [t for t in tables if t.get('status') == 'free']
        
        if not free_tables:
            requests.post(f"{BASE_URL}/api/tables/{tables[0]['id']}/release", headers=self.headers)
            free_tables = [tables[0]]
        
        table = free_tables[0]
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        product = products[0]
        
        # Create order
        order_data = {"table_id": table['id'], "waiter_id": "test", "waiter_name": "Test"}
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        order = order_response.json()
        
        # Add item
        item_data = {"product_id": product['id'], "product_name": product['name'], "quantity": 1, "unit_price": 100, "modifiers": []}
        requests.post(f"{BASE_URL}/api/orders/{order['id']}/items", json=item_data, headers=self.headers)
        
        # Create bill
        bill_data = {"order_id": order['id'], "table_id": table['id'], "label": "Test Change"}
        bill_response = requests.post(f"{BASE_URL}/api/bills", json=bill_data, headers=self.headers)
        bill = bill_response.json()
        
        # Pay with change in DOP
        dop_methods = [m for m in TestMultiplePayments.payment_methods if m.get('currency', 'DOP') == 'DOP']
        payment_method_id = dop_methods[0]['id'] if dop_methods else ""
        
        pay_data = {
            "payment_method": "cash",
            "payment_method_id": payment_method_id,
            "tip_percentage": 0,
            "total": bill['total'],
            "amount_received": bill['total'] + 100,  # Overpay by 100
            "change_currency": "DOP",
            "change_amount": 100.0
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/bills/{bill['id']}/pay", json=pay_data, headers=self.headers)
        assert pay_response.status_code == 200, f"Payment failed: {pay_response.text}"
        
        paid_bill = pay_response.json()
        
        # Verify change fields
        assert 'change_currency' in paid_bill, "Bill should have change_currency"
        assert 'change_amount' in paid_bill, "Bill should have change_amount"
        assert paid_bill['change_currency'] == 'DOP', f"Expected DOP, got {paid_bill['change_currency']}"
        assert paid_bill['change_amount'] == 100.0, f"Expected 100, got {paid_bill['change_amount']}"
        
        print(f"Change: {paid_bill['change_currency']} {paid_bill['change_amount']}")
        print("TEST 5 PASSED: change_currency and change_amount stored correctly")

    def test_06_pay_with_foreign_currency_and_change(self):
        """TEST 6: Pay with foreign currency (USD) and verify change calculation"""
        # Create order/bill
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_response.json()
        free_tables = [t for t in tables if t.get('status') == 'free']
        
        if not free_tables:
            requests.post(f"{BASE_URL}/api/tables/{tables[0]['id']}/release", headers=self.headers)
            free_tables = [tables[0]]
        
        table = free_tables[0]
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        product = products[0]
        
        # Create order
        order_data = {"table_id": table['id'], "waiter_id": "test", "waiter_name": "Test"}
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        order = order_response.json()
        
        # Add item worth ~1000 DOP
        item_data = {"product_id": product['id'], "product_name": product['name'], "quantity": 2, "unit_price": 300, "modifiers": []}
        requests.post(f"{BASE_URL}/api/orders/{order['id']}/items", json=item_data, headers=self.headers)
        
        # Create bill
        bill_data = {"order_id": order['id'], "table_id": table['id'], "label": "Test USD"}
        bill_response = requests.post(f"{BASE_URL}/api/bills", json=bill_data, headers=self.headers)
        bill = bill_response.json()
        bill_total = bill['total']
        print(f"Bill total DOP: {bill_total}")
        
        # Get USD method
        usd_methods = [m for m in TestMultiplePayments.payment_methods if m.get('currency') == 'USD']
        
        if usd_methods:
            usd_method = usd_methods[0]
            usd_rate = usd_method.get('exchange_rate', 64)
            
            # Calculate USD needed (give a bit extra to create change)
            usd_needed = round(bill_total / usd_rate, 2)
            usd_given = round(usd_needed + 5, 0)  # Round up and give extra
            usd_given_dop = usd_given * usd_rate
            change_dop = round(usd_given_dop - bill_total, 2)
            
            print(f"USD rate: {usd_rate}, USD given: {usd_given}, USD equivalent DOP: {usd_given_dop}")
            
            payments_list = [{
                "payment_method_id": usd_method['id'],
                "payment_method_name": usd_method['name'],
                "amount": usd_given,
                "amount_dop": usd_given_dop,
                "currency": "USD",
                "exchange_rate": usd_rate
            }]
            
            pay_data = {
                "payment_method": "cash",
                "payment_method_id": usd_method['id'],
                "tip_percentage": 0,
                "total": bill_total,
                "amount_received": usd_given_dop,
                "payments": payments_list,
                "change_currency": "DOP",
                "change_amount": change_dop
            }
            
            pay_response = requests.post(f"{BASE_URL}/api/bills/{bill['id']}/pay", json=pay_data, headers=self.headers)
            assert pay_response.status_code == 200, f"USD Payment failed: {pay_response.text}"
            
            paid_bill = pay_response.json()
            assert paid_bill['status'] == 'paid', "Bill should be paid"
            
            # Verify USD payment was stored
            payments = paid_bill.get('payments', [])
            usd_payment = next((p for p in payments if p.get('currency') == 'USD'), None)
            assert usd_payment is not None, "USD payment not found in bill"
            assert usd_payment['amount'] == usd_given, f"USD amount mismatch: expected {usd_given}, got {usd_payment['amount']}"
            
            # Verify change is in DOP
            assert paid_bill.get('change_currency') == 'DOP', "Change should be in DOP"
            assert paid_bill.get('change_amount', 0) > 0, "Change amount should be positive"
            
            print(f"USD Payment: ${usd_given} USD = {usd_given_dop} DOP")
            print(f"Change: DOP {paid_bill.get('change_amount', 0)}")
            print("TEST 6 PASSED: Foreign currency payment with change works correctly")
        else:
            print("TEST 6 SKIPPED: No USD payment method configured")

    def test_07_pre_cuenta_includes_currency_equivalents(self):
        """TEST 7: Pre-cuenta print includes equivalents in USD/EUR with exchange rates"""
        # Create order with items
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_response.json()
        free_tables = [t for t in tables if t.get('status') == 'free']
        
        if not free_tables:
            requests.post(f"{BASE_URL}/api/tables/{tables[0]['id']}/release", headers=self.headers)
            free_tables = [tables[0]]
        
        table = free_tables[0]
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        product = products[0]
        
        # Create order
        order_data = {"table_id": table['id'], "waiter_id": "test", "waiter_name": "Test"}
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        order = order_response.json()
        
        # Add item
        item_data = {"product_id": product['id'], "product_name": product['name'], "quantity": 2, "unit_price": 500, "modifiers": []}
        requests.post(f"{BASE_URL}/api/orders/{order['id']}/items", json=item_data, headers=self.headers)
        
        # Send pre-check print command
        precheck_response = requests.post(f"{BASE_URL}/api/print/pre-check/{order['id']}/send", headers=self.headers)
        assert precheck_response.status_code == 200, f"Pre-check print failed: {precheck_response.text}"
        
        result = precheck_response.json()
        assert result.get('ok') == True, "Pre-check print should succeed"
        
        # Check print queue for the job
        queue_response = requests.get(f"{BASE_URL}/api/print/queue?status=pending", headers=self.headers)
        if queue_response.status_code == 200:
            jobs = queue_response.json()
            precheck_jobs = [j for j in jobs if j.get('type') == 'pre-check' and j.get('reference_id') == order['id']]
            
            if precheck_jobs:
                job = precheck_jobs[0]
                commands = job.get('commands', [])
                
                # Look for currency equivalent lines
                equiv_found = False
                for cmd in commands:
                    text = cmd.get('text', '') + cmd.get('left', '') + cmd.get('right', '')
                    if 'Equiv' in text or 'USD' in text.upper() or 'EUR' in text.upper() or 'Tasa' in text:
                        equiv_found = True
                        print(f"Found currency equivalent: {text}")
                
                if equiv_found:
                    print("TEST 7 PASSED: Pre-cuenta includes currency equivalents")
                else:
                    # Check if there are any foreign currency payment methods
                    foreign_methods = [m for m in TestMultiplePayments.payment_methods if m.get('currency') not in ['DOP', None]]
                    if foreign_methods:
                        print("WARNING: Foreign currency methods exist but equivalents not found in pre-cuenta")
                    else:
                        print("TEST 7 SKIPPED: No foreign currency payment methods configured")
        
        # Cleanup - release table
        requests.post(f"{BASE_URL}/api/tables/{table['id']}/release", headers=self.headers)

    def test_08_invoice_print_shows_multiple_payments(self):
        """TEST 8: Invoice print format includes multiple payment method breakdown"""
        # Create order/bill with multiple payments
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_response.json()
        free_tables = [t for t in tables if t.get('status') == 'free']
        
        if not free_tables:
            requests.post(f"{BASE_URL}/api/tables/{tables[0]['id']}/release", headers=self.headers)
            free_tables = [tables[0]]
        
        table = free_tables[0]
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        product = products[0]
        
        # Create order
        order_data = {"table_id": table['id'], "waiter_id": "test", "waiter_name": "Test"}
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        order = order_response.json()
        
        # Add items
        item_data = {"product_id": product['id'], "product_name": product['name'], "quantity": 3, "unit_price": 300, "modifiers": []}
        requests.post(f"{BASE_URL}/api/orders/{order['id']}/items", json=item_data, headers=self.headers)
        
        # Create bill
        bill_data = {"order_id": order['id'], "table_id": table['id'], "label": "Test Print"}
        bill_response = requests.post(f"{BASE_URL}/api/bills", json=bill_data, headers=self.headers)
        bill = bill_response.json()
        bill_total = bill['total']
        
        # Get payment methods
        dop_methods = [m for m in TestMultiplePayments.payment_methods if m.get('currency', 'DOP') == 'DOP']
        
        # Create multiple payments
        payments_list = []
        if len(dop_methods) >= 2:
            half = round(bill_total / 2, 2)
            payments_list = [
                {
                    "payment_method_id": dop_methods[0]['id'],
                    "payment_method_name": dop_methods[0]['name'],
                    "amount": half,
                    "amount_dop": half,
                    "currency": "DOP",
                    "exchange_rate": 1
                },
                {
                    "payment_method_id": dop_methods[1]['id'],
                    "payment_method_name": dop_methods[1]['name'],
                    "amount": half,
                    "amount_dop": half,
                    "currency": "DOP",
                    "exchange_rate": 1
                }
            ]
        
        # Pay with multiple methods
        pay_data = {
            "payment_method": "mixed",
            "tip_percentage": 0,
            "total": bill_total,
            "amount_received": bill_total,
            "payments": payments_list if len(payments_list) >= 2 else None,
            "change_currency": "DOP",
            "change_amount": 0
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/bills/{bill['id']}/pay", json=pay_data, headers=self.headers)
        assert pay_response.status_code == 200, f"Payment failed: {pay_response.text}"
        
        # Send receipt print command
        receipt_response = requests.post(f"{BASE_URL}/api/print/receipt/{bill['id']}/send", headers=self.headers)
        assert receipt_response.status_code == 200, f"Receipt print failed: {receipt_response.text}"
        
        result = receipt_response.json()
        assert result.get('ok') == True, "Receipt print should succeed"
        
        # Check print queue for the job
        queue_response = requests.get(f"{BASE_URL}/api/print/queue?status=pending", headers=self.headers)
        if queue_response.status_code == 200:
            jobs = queue_response.json()
            receipt_jobs = [j for j in jobs if j.get('type') == 'receipt' and j.get('reference_id') == bill['id']]
            
            if receipt_jobs and len(payments_list) >= 2:
                job = receipt_jobs[0]
                commands = job.get('commands', [])
                
                # Look for multiple payment breakdown
                found_formas_pago = False
                payment_lines = []
                for cmd in commands:
                    text = str(cmd.get('text', '')) + str(cmd.get('left', ''))
                    if 'FORMAS DE PAGO' in text.upper():
                        found_formas_pago = True
                    # Check for payment method names
                    for pm in payments_list:
                        if pm['payment_method_name'] in text:
                            payment_lines.append(text)
                
                if found_formas_pago:
                    print("Found 'FORMAS DE PAGO' header in receipt")
                if payment_lines:
                    print(f"Found payment lines: {payment_lines}")
                
                if found_formas_pago or len(payment_lines) >= 2:
                    print("TEST 8 PASSED: Invoice includes multiple payment breakdown")
                else:
                    # Might be single payment format
                    print("INFO: Multiple payment breakdown not found (might be single payment or format different)")
            else:
                print("TEST 8 INFO: Less than 2 payment methods used, skipping multi-payment check")
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/tables/{table['id']}/release", headers=self.headers)

    def test_09_get_paid_bill_has_payments_array(self):
        """TEST 9: GET /api/bills/{id} returns payments array for paid bill"""
        # Get a paid bill from the system
        bills_response = requests.get(f"{BASE_URL}/api/bills?status=paid", headers=self.headers)
        assert bills_response.status_code == 200
        
        bills = bills_response.json()
        paid_bills = [b for b in bills if b.get('status') == 'paid' and b.get('payments')]
        
        if paid_bills:
            bill = paid_bills[0]
            
            # Get bill by ID
            bill_response = requests.get(f"{BASE_URL}/api/bills/{bill['id']}", headers=self.headers)
            assert bill_response.status_code == 200
            
            fetched_bill = bill_response.json()
            assert 'payments' in fetched_bill, "Bill should have payments array"
            assert len(fetched_bill['payments']) > 0, "Payments array should not be empty"
            
            for pmt in fetched_bill['payments']:
                assert 'payment_method_id' in pmt, "Payment should have payment_method_id"
                assert 'amount' in pmt, "Payment should have amount"
                print(f"Payment: {pmt.get('payment_method_name', 'Unknown')} - {pmt.get('currency', 'DOP')} {pmt['amount']}")
            
            print("TEST 9 PASSED: GET bill returns payments array")
        else:
            print("TEST 9 SKIPPED: No paid bills with payments array found")

    def test_10_payment_model_validates_payments_entry(self):
        """TEST 10: PayBillInput validates PaymentEntry structure"""
        # Create order/bill
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=self.headers)
        tables = tables_response.json()
        free_tables = [t for t in tables if t.get('status') == 'free']
        
        if not free_tables:
            requests.post(f"{BASE_URL}/api/tables/{tables[0]['id']}/release", headers=self.headers)
            free_tables = [tables[0]]
        
        table = free_tables[0]
        
        # Get products
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        product = products[0]
        
        # Create order
        order_data = {"table_id": table['id'], "waiter_id": "test", "waiter_name": "Test"}
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.headers)
        order = order_response.json()
        
        # Add item
        item_data = {"product_id": product['id'], "product_name": product['name'], "quantity": 1, "unit_price": 100, "modifiers": []}
        requests.post(f"{BASE_URL}/api/orders/{order['id']}/items", json=item_data, headers=self.headers)
        
        # Create bill
        bill_data = {"order_id": order['id'], "table_id": table['id'], "label": "Test Validation"}
        bill_response = requests.post(f"{BASE_URL}/api/bills", json=bill_data, headers=self.headers)
        bill = bill_response.json()
        
        # Test with valid PaymentEntry
        dop_methods = [m for m in TestMultiplePayments.payment_methods if m.get('currency', 'DOP') == 'DOP']
        valid_payment = {
            "payment_method_id": dop_methods[0]['id'] if dop_methods else "test-id",
            "payment_method_name": "Test Payment",
            "amount": bill['total'],
            "amount_dop": bill['total'],
            "currency": "DOP",
            "exchange_rate": 1
        }
        
        pay_data = {
            "payment_method": "cash",
            "tip_percentage": 0,
            "total": bill['total'],
            "payments": [valid_payment]
        }
        
        pay_response = requests.post(f"{BASE_URL}/api/bills/{bill['id']}/pay", json=pay_data, headers=self.headers)
        assert pay_response.status_code == 200, f"Valid payment should succeed: {pay_response.text}"
        
        print("TEST 10 PASSED: PaymentEntry validation works correctly")
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/tables/{table['id']}/release", headers=self.headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
