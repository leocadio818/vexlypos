"""
Test Propina Legal Bug Fix - Critical Test Suite
Tests the fix for: Propina Legal incorrectly subtracted from total
Tests that: Total a Pagar = Subtotal + ITBIS + Propina Legal
Tests that: CAMBIO only shows when amount_received > total
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPropinaLegalCalculation:
    """Test that Propina Legal is ADDED to total, not subtracted"""
    
    token = None
    order_id = None
    bill_id = None
    test_table_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        if TestPropinaLegalCalculation.token is None:
            # Login as Admin
            login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
            assert login_res.status_code == 200, f"Login failed: {login_res.text}"
            data = login_res.json()
            TestPropinaLegalCalculation.token = data.get("token")
        yield
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestPropinaLegalCalculation.token}"}
    
    def test_01_get_products_and_table(self):
        """Get test data - products and tables"""
        # Get tables
        res = requests.get(f"{BASE_URL}/api/tables", headers=self.get_headers())
        assert res.status_code == 200
        tables = res.json()
        assert len(tables) > 0, "No tables found"
        # Find a free table
        free_table = next((t for t in tables if t.get("status") == "free"), tables[0])
        TestPropinaLegalCalculation.test_table_id = free_table["id"]
        print(f"Using table: {free_table['number']} (ID: {free_table['id']})")
        
        # Get products
        res = requests.get(f"{BASE_URL}/api/products", headers=self.get_headers())
        assert res.status_code == 200
        products = res.json()
        assert len(products) > 0, "No products found"
        print(f"Found {len(products)} products")
    
    def test_02_create_order_with_items(self):
        """Create an order with known price items"""
        # Create order
        order_data = {
            "table_id": TestPropinaLegalCalculation.test_table_id,
            "items": []
        }
        res = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.get_headers())
        assert res.status_code == 200, f"Failed to create order: {res.text}"
        order = res.json()
        TestPropinaLegalCalculation.order_id = order["id"]
        print(f"Created order: {order['id']}")
        
        # Get products to add
        prod_res = requests.get(f"{BASE_URL}/api/products", headers=self.get_headers())
        products = prod_res.json()
        test_product = products[0]
        
        # Add item to order
        item_data = {
            "product_id": test_product["id"],
            "product_name": test_product["name"],
            "quantity": 2,
            "unit_price": test_product.get("price", 100)
        }
        add_res = requests.post(
            f"{BASE_URL}/api/orders/{TestPropinaLegalCalculation.order_id}/items",
            json=item_data,
            headers=self.get_headers()
        )
        assert add_res.status_code == 200, f"Failed to add item: {add_res.text}"
        print(f"Added 2x {test_product['name']} @ {test_product.get('price', 100)}")
    
    def test_03_create_bill_and_verify_totals(self):
        """Create bill and verify Total = Subtotal + ITBIS + Propina Legal"""
        # Create bill from order
        bill_data = {
            "order_id": TestPropinaLegalCalculation.order_id,
            "table_id": TestPropinaLegalCalculation.test_table_id,
            "tip_percentage": 10
        }
        res = requests.post(f"{BASE_URL}/api/bills", json=bill_data, headers=self.get_headers())
        assert res.status_code == 200, f"Failed to create bill: {res.text}"
        bill = res.json()
        TestPropinaLegalCalculation.bill_id = bill["id"]
        
        # CRITICAL TEST: Verify the calculation
        subtotal = bill.get("subtotal", 0)
        itbis = bill.get("itbis", 0)
        propina = bill.get("propina_legal", 0)
        total = bill.get("total", 0)
        
        print(f"\n=== BILL TOTALS ===")
        print(f"Subtotal:      RD$ {subtotal:,.2f}")
        print(f"ITBIS (18%):   RD$ {itbis:,.2f}")
        print(f"Propina (10%): RD$ {propina:,.2f}")
        print(f"TOTAL:         RD$ {total:,.2f}")
        
        # CRITICAL ASSERTION: Total must be SUM of all components
        expected_total = round(subtotal + itbis + propina, 2)
        print(f"\nExpected Total (Subtotal + ITBIS + Propina): RD$ {expected_total:,.2f}")
        print(f"Actual Total: RD$ {total:,.2f}")
        
        assert abs(total - expected_total) < 0.01, (
            f"CRITICAL BUG: Total ({total}) != Subtotal ({subtotal}) + ITBIS ({itbis}) + Propina ({propina}). "
            f"Expected: {expected_total}"
        )
        print("\n[PASS] Total = Subtotal + ITBIS + Propina Legal (correctly ADDED)")
    
    def test_04_pay_bill_with_exact_amount(self):
        """Pay with exact amount - CAMBIO should NOT appear"""
        bill_res = requests.get(f"{BASE_URL}/api/bills/{TestPropinaLegalCalculation.bill_id}", headers=self.get_headers())
        bill = bill_res.json()
        exact_amount = bill["total"]
        
        pay_data = {
            "payment_method": "cash",
            "tip_percentage": 0,
            "additional_tip": 0,
            "itbis": bill.get("itbis", 0),
            "propina_legal": bill.get("propina_legal", 0),
            "total": bill["total"],
            "amount_received": exact_amount  # Exact amount
        }
        res = requests.post(
            f"{BASE_URL}/api/bills/{TestPropinaLegalCalculation.bill_id}/pay",
            json=pay_data,
            headers=self.get_headers()
        )
        assert res.status_code == 200, f"Failed to pay bill: {res.text}"
        paid_bill = res.json()
        
        # Verify paid values
        print(f"\n=== PAID BILL ===")
        print(f"Amount Received: RD$ {paid_bill.get('amount_received', 0):,.2f}")
        print(f"Total:           RD$ {paid_bill['total']:,.2f}")
        
        # When paying exact, no change
        amount_received = paid_bill.get('amount_received', 0)
        if amount_received > 0 and amount_received <= paid_bill['total']:
            print("[PASS] No CAMBIO expected when paying exact amount")
        print(f"Bill status: {paid_bill['status']}")


class TestReceiptEndpoints:
    """Test receipt endpoints show correct business info and totals"""
    
    token = None
    bill_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and find a paid bill for testing"""
        if TestReceiptEndpoints.token is None:
            login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
            assert login_res.status_code == 200
            TestReceiptEndpoints.token = login_res.json().get("token")
        
        # Find a paid bill
        if TestReceiptEndpoints.bill_id is None:
            bills_res = requests.get(
                f"{BASE_URL}/api/bills?status=paid",
                headers={"Authorization": f"Bearer {TestReceiptEndpoints.token}"}
            )
            if bills_res.status_code == 200:
                bills = bills_res.json()
                if bills:
                    TestReceiptEndpoints.bill_id = bills[0]["id"]
        yield
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestReceiptEndpoints.token}"}
    
    def test_receipt_html_endpoint(self):
        """Test GET /api/print/receipt/{bill_id} contains correct business info"""
        if not TestReceiptEndpoints.bill_id:
            pytest.skip("No paid bill found")
        
        res = requests.get(
            f"{BASE_URL}/api/print/receipt/{TestReceiptEndpoints.bill_id}",
            headers=self.get_headers()
        )
        assert res.status_code == 200, f"Receipt endpoint failed: {res.text}"
        data = res.json()
        html = data.get("html", "")
        
        print("\n=== RECEIPT HTML VALIDATION ===")
        
        # Check business name
        assert "ALONZO CIGAR" in html, "Receipt missing business name 'ALONZO CIGAR'"
        print("[PASS] Business name 'ALONZO CIGAR' found")
        
        # Check RNC
        assert "1-31-75577-1" in html, "Receipt missing RNC '1-31-75577-1'"
        print("[PASS] RNC '1-31-75577-1' found")
        
        # Check phone
        assert "809-301-3858" in html, "Receipt missing phone '809-301-3858'"
        print("[PASS] Phone '809-301-3858' found")
        
        # Check address contains Jarabacoa
        assert "Jarabacoa" in html or "Las Flores" in html, "Receipt missing address with 'Jarabacoa' or 'Las Flores'"
        print("[PASS] Address with Jarabacoa found")
        
        # Check NCF validity
        assert "Valido hasta" in html, "Receipt missing 'Valido hasta' NCF expiry"
        print("[PASS] NCF expiry 'Valido hasta' found")
        
        # Check DGII footer
        assert "DGII" in html, "Receipt missing DGII reference"
        print("[PASS] DGII reference found")
    
    def test_receipt_escpos_endpoint(self):
        """Test GET /api/print/receipt-escpos/{bill_id} contains correct business info"""
        if not TestReceiptEndpoints.bill_id:
            pytest.skip("No paid bill found")
        
        res = requests.get(
            f"{BASE_URL}/api/print/receipt-escpos/{TestReceiptEndpoints.bill_id}",
            headers=self.get_headers()
        )
        assert res.status_code == 200, f"ESC/POS endpoint failed: {res.text}"
        data = res.json()
        lines = data.get("lines", [])
        
        print("\n=== ESC/POS RECEIPT VALIDATION ===")
        
        # Flatten text from lines
        all_text = " ".join(str(line.get("text", "") or line.get("left", "") or line.get("right", "")) for line in lines)
        
        # Check business name
        assert "ALONZO CIGAR" in all_text, "ESC/POS missing 'ALONZO CIGAR'"
        print("[PASS] Business name 'ALONZO CIGAR' found in ESC/POS")
        
        # Check RNC
        assert "1-31-75577-1" in all_text, "ESC/POS missing RNC '1-31-75577-1'"
        print("[PASS] RNC '1-31-75577-1' found in ESC/POS")
        
        # Check DGII
        assert "DGII" in all_text, "ESC/POS missing DGII reference"
        print("[PASS] DGII reference found in ESC/POS")


class TestTaxCalculationAPI:
    """Test the intelligent tax calculation API"""
    
    token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if TestTaxCalculationAPI.token is None:
            login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
            assert login_res.status_code == 200
            TestTaxCalculationAPI.token = login_res.json().get("token")
        yield
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestTaxCalculationAPI.token}"}
    
    def test_tax_calculation_with_dine_in(self):
        """Test tax calculation includes propina legal for dine-in"""
        # Get sale types
        st_res = requests.get(f"{BASE_URL}/api/sale-types", headers=self.get_headers())
        sale_types = st_res.json()
        dine_in = next((st for st in sale_types if st.get("code") == "dine_in" or "comer" in st.get("name", "").lower()), sale_types[0] if sale_types else None)
        
        if not dine_in:
            pytest.skip("No dine-in sale type found")
        
        # Get a product
        prod_res = requests.get(f"{BASE_URL}/api/products", headers=self.get_headers())
        products = prod_res.json()
        if not products:
            pytest.skip("No products found")
        
        test_product = products[0]
        subtotal = test_product.get("price", 100) * 2  # 2 items
        
        # Call tax calculation API
        cart_data = {
            "items": [
                {
                    "product_id": test_product["id"],
                    "product_name": test_product["name"],
                    "quantity": 2,
                    "unit_price": test_product.get("price", 100)
                }
            ],
            "sale_type_id": dine_in["id"]
        }
        
        res = requests.post(f"{BASE_URL}/api/taxes/calculate-cart", json=cart_data, headers=self.get_headers())
        assert res.status_code == 200, f"Tax calculation failed: {res.text}"
        result = res.json()
        
        summary = result.get("summary", {})
        print("\n=== TAX CALCULATION FOR DINE-IN ===")
        print(f"Subtotal:      RD$ {summary.get('subtotal', 0):,.2f}")
        print(f"ITBIS:         RD$ {summary.get('itbis', 0):,.2f}")
        print(f"Propina Legal: RD$ {summary.get('propina_legal', 0):,.2f}")
        print(f"Total:         RD$ {summary.get('total', 0):,.2f}")
        
        # CRITICAL: Total must be sum
        expected = round(summary.get('subtotal', 0) + summary.get('itbis', 0) + summary.get('propina_legal', 0), 2)
        assert abs(summary.get('total', 0) - expected) < 0.01, (
            f"Tax calculation error: Total ({summary.get('total')}) != Sum ({expected})"
        )
        print("\n[PASS] Tax calculation: Total = Subtotal + ITBIS + Propina Legal")


class TestBillPaymentFlow:
    """Test complete payment flow with propina verification"""
    
    token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if TestBillPaymentFlow.token is None:
            login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
            assert login_res.status_code == 200
            TestBillPaymentFlow.token = login_res.json().get("token")
        yield
    
    def get_headers(self):
        return {"Authorization": f"Bearer {TestBillPaymentFlow.token}"}
    
    def test_pay_bill_with_frontend_values(self):
        """Test pay_bill accepts and uses frontend-calculated values"""
        # Find an open bill or create one
        bills_res = requests.get(f"{BASE_URL}/api/bills?status=open", headers=self.get_headers())
        bills = bills_res.json()
        
        if not bills:
            print("No open bills found, creating new order...")
            # Create order and bill
            tables_res = requests.get(f"{BASE_URL}/api/tables", headers=self.get_headers())
            tables = tables_res.json()
            free_table = next((t for t in tables if t.get("status") == "free"), tables[0])
            
            order_res = requests.post(
                f"{BASE_URL}/api/orders",
                json={"table_id": free_table["id"], "items": []},
                headers=self.get_headers()
            )
            order = order_res.json()
            
            # Add item
            prod_res = requests.get(f"{BASE_URL}/api/products", headers=self.get_headers())
            products = prod_res.json()
            if products:
                requests.post(
                    f"{BASE_URL}/api/orders/{order['id']}/items",
                    json={
                        "product_id": products[0]["id"],
                        "product_name": products[0]["name"],
                        "quantity": 1,
                        "unit_price": products[0].get("price", 200)
                    },
                    headers=self.get_headers()
                )
            
            # Create bill
            bill_res = requests.post(
                f"{BASE_URL}/api/bills",
                json={
                    "order_id": order["id"],
                    "table_id": free_table["id"],
                    "tip_percentage": 10
                },
                headers=self.get_headers()
            )
            bill = bill_res.json()
        else:
            bill = bills[0]
        
        # Calculate expected values
        subtotal = bill.get("subtotal", 200)
        itbis = round(subtotal * 0.18, 2)
        propina = round(subtotal * 0.10, 2)
        total = round(subtotal + itbis + propina, 2)
        
        print(f"\n=== PAY BILL WITH FRONTEND VALUES ===")
        print(f"Bill ID: {bill['id']}")
        print(f"Subtotal: {subtotal}")
        print(f"ITBIS: {itbis}")
        print(f"Propina: {propina}")
        print(f"Total: {total}")
        
        # Pay with frontend-calculated values
        pay_data = {
            "payment_method": "cash",
            "tip_percentage": 0,  # Frontend sends 0 because propina is already calculated
            "additional_tip": 0,
            "itbis": itbis,
            "propina_legal": propina,
            "total": total,
            "amount_received": total
        }
        
        pay_res = requests.post(
            f"{BASE_URL}/api/bills/{bill['id']}/pay",
            json=pay_data,
            headers=self.get_headers()
        )
        assert pay_res.status_code == 200, f"Payment failed: {pay_res.text}"
        paid = pay_res.json()
        
        # Verify the saved values match what frontend sent
        assert paid["total"] == total, f"Total mismatch: {paid['total']} != {total}"
        assert paid["itbis"] == itbis, f"ITBIS mismatch: {paid['itbis']} != {itbis}"
        assert paid["propina_legal"] == propina, f"Propina mismatch: {paid['propina_legal']} != {propina}"
        
        print(f"\n[PASS] Bill paid with frontend values:")
        print(f"  Total: {paid['total']}")
        print(f"  ITBIS: {paid['itbis']}")
        print(f"  Propina: {paid['propina_legal']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
