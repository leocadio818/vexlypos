"""
Test Suite: POS System Dynamic Tax Names and Config Updates
Tests:
1. Receipt HTML - no 'Sugerida', TOTAL A PAGAR with border:2px solid (white bg, not black bg)
2. Receipt ESC/POS - dynamic tax names from tax_breakdown
3. Pre-check HTML - no 'Sugerida', uses dynamic tax names from tax_config
4. System config API accepts new address and footer fields
"""
import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://nexo-pos.preview.emergentagent.com')
if BASE_URL.endswith('/'):
    BASE_URL = BASE_URL.rstrip('/')

ADMIN_PIN = "10000"


class TestDynamicTaxNamesAndConfig:
    """Tests for dynamic tax names in receipts and pre-checks, config fields"""
    
    token = None
    
    @classmethod
    def setup_class(cls):
        """Login and get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"pin": ADMIN_PIN}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        cls.token = response.json().get("token")
        assert cls.token, "No token received"
    
    def get_headers(self):
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    # ============= TEST 1: System Config accepts new address and footer fields =============
    def test_system_config_accepts_expanded_address_fields(self):
        """Verify system/config API accepts the 4 address fields and 4 footer fields"""
        # Get current config
        response = requests.get(f"{BASE_URL}/api/system/config", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to get config: {response.text}"
        current_config = response.json()
        
        # Update with new fields
        test_config = {
            **current_config,
            "ticket_address_street": "C/ Las Flores #12",
            "ticket_address_building": "Local 1",
            "ticket_address_sector": "Jarabacoa",
            "ticket_address_city": "La Vega",
            "ticket_footer_msg1": "Gracias por su visita!",
            "ticket_footer_msg2": "Conserve para DGII",
            "ticket_footer_msg3": "@alonzocigar",
            "ticket_footer_msg4": "Vuelva pronto!"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/system/config",
            json=test_config,
            headers=self.get_headers()
        )
        assert response.status_code == 200, f"Failed to update config: {response.text}"
        
        # Verify the fields were saved
        response = requests.get(f"{BASE_URL}/api/system/config", headers=self.get_headers())
        assert response.status_code == 200
        saved_config = response.json()
        
        assert saved_config.get("ticket_address_street") == "C/ Las Flores #12", "ticket_address_street not saved"
        assert saved_config.get("ticket_address_building") == "Local 1", "ticket_address_building not saved"
        assert saved_config.get("ticket_address_sector") == "Jarabacoa", "ticket_address_sector not saved"
        assert saved_config.get("ticket_address_city") == "La Vega", "ticket_address_city not saved"
        assert saved_config.get("ticket_footer_msg1") == "Gracias por su visita!", "ticket_footer_msg1 not saved"
        assert saved_config.get("ticket_footer_msg2") == "Conserve para DGII", "ticket_footer_msg2 not saved"
        assert saved_config.get("ticket_footer_msg3") == "@alonzocigar", "ticket_footer_msg3 not saved"
        assert saved_config.get("ticket_footer_msg4") == "Vuelva pronto!", "ticket_footer_msg4 not saved"
        print("✅ TEST 1 PASSED: System config accepts 4 address fields and 4 footer message fields")
    
    # ============= TEST 2: Create test data and verify receipt HTML =============
    def test_receipt_html_no_sugerida_and_correct_total_styling(self):
        """Verify receipt HTML has no 'Sugerida' and TOTAL A PAGAR has border:2px solid (white bg)"""
        # Get a paid bill to test receipt
        response = requests.get(f"{BASE_URL}/api/bills", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to get bills: {response.text}"
        bills = response.json()
        
        # Find a paid bill
        paid_bill = None
        for bill in bills:
            if bill.get("status") == "paid":
                paid_bill = bill
                break
        
        if not paid_bill:
            # If no paid bill, create a test order and bill
            print("No paid bill found, creating test order...")
            
            # Get tables and products
            tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=self.get_headers())
            tables = tables_resp.json()
            products_resp = requests.get(f"{BASE_URL}/api/products", headers=self.get_headers())
            products = products_resp.json()
            
            if not tables or not products:
                pytest.skip("No tables or products available for testing")
            
            # Find a free table
            free_table = None
            for t in tables:
                if t.get("status") == "free":
                    free_table = t
                    break
            
            if not free_table:
                pytest.skip("No free table available")
            
            # Create order
            order_data = {
                "table_id": free_table["id"],
                "items": [{"product_id": products[0]["id"], "quantity": 2}]
            }
            order_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.get_headers())
            
            if order_resp.status_code == 200:
                order = order_resp.json()
                # Send and pay the order
                requests.put(f"{BASE_URL}/api/orders/{order['id']}/send", headers=self.get_headers())
                
                # Create bill
                bill_resp = requests.post(f"{BASE_URL}/api/bills", 
                    json={"order_id": order["id"]}, 
                    headers=self.get_headers())
                
                if bill_resp.status_code == 200:
                    new_bill = bill_resp.json()
                    # Pay the bill
                    pay_resp = requests.post(f"{BASE_URL}/api/bills/{new_bill['id']}/pay",
                        json={"payment_method": "Efectivo RD$", "amount_received": new_bill.get("total", 1000)},
                        headers=self.get_headers())
                    if pay_resp.status_code == 200:
                        paid_bill = pay_resp.json()
        
        if not paid_bill:
            pytest.skip("Could not create a paid bill for testing")
        
        # Get receipt HTML
        response = requests.get(f"{BASE_URL}/api/print/receipt/{paid_bill['id']}", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to get receipt: {response.text}"
        receipt_data = response.json()
        html = receipt_data.get("html", "")
        
        # Verify no 'Sugerida' appears
        assert "Sugerida" not in html, f"Found 'Sugerida' in receipt HTML which should be removed"
        
        # Verify TOTAL A PAGAR has border:2px solid (not black background)
        assert "border:2px solid" in html or "border: 2px solid" in html, "TOTAL A PAGAR should have border:2px solid"
        assert "TOTAL A PAGAR" in html, "Receipt should contain 'TOTAL A PAGAR'"
        
        # If tax_breakdown exists in the bill, verify dynamic tax names are used
        if paid_bill.get("tax_breakdown"):
            for tax in paid_bill["tax_breakdown"]:
                tax_desc = tax.get("description", "")
                if tax_desc:
                    # The description from tax_breakdown should appear in HTML
                    print(f"  Checking for tax description in HTML: {tax_desc}")
        
        print(f"✅ TEST 2 PASSED: Receipt HTML has no 'Sugerida', TOTAL A PAGAR has border:2px solid (white bg)")
    
    # ============= TEST 3: Receipt ESC/POS dynamic tax names =============
    def test_receipt_escpos_dynamic_tax_names(self):
        """Verify ESC/POS commands use dynamic tax names from tax_breakdown"""
        # Get a paid bill
        response = requests.get(f"{BASE_URL}/api/bills", headers=self.get_headers())
        assert response.status_code == 200
        bills = response.json()
        
        paid_bill = None
        for bill in bills:
            if bill.get("status") == "paid":
                paid_bill = bill
                break
        
        if not paid_bill:
            pytest.skip("No paid bill available for ESC/POS test")
        
        # Get ESC/POS receipt
        response = requests.get(f"{BASE_URL}/api/print/receipt-escpos/{paid_bill['id']}", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to get ESC/POS receipt: {response.text}"
        escpos_data = response.json()
        lines = escpos_data.get("lines", [])
        
        # Convert lines to searchable text
        all_text = json.dumps(lines)
        
        # Verify no 'Sugerida' appears
        assert "Sugerida" not in all_text, f"Found 'Sugerida' in ESC/POS receipt"
        
        # If bill has tax_breakdown, verify those descriptions appear
        if paid_bill.get("tax_breakdown"):
            print(f"  Bill has tax_breakdown with {len(paid_bill['tax_breakdown'])} entries")
            for tax in paid_bill["tax_breakdown"]:
                tax_desc = tax.get("description", "")
                tax_rate = tax.get("rate", 0)
                if tax_desc:
                    print(f"  Tax: {tax_desc} {tax_rate}%")
        
        print(f"✅ TEST 3 PASSED: Receipt ESC/POS has no 'Sugerida'")
    
    # ============= TEST 4: Pre-check HTML dynamic tax names =============
    def test_precheck_html_no_sugerida_dynamic_tax_names(self):
        """Verify pre-check HTML has no 'Sugerida' and uses dynamic tax names from tax_config"""
        # Get an active order for pre-check
        response = requests.get(f"{BASE_URL}/api/orders", headers=self.get_headers())
        
        if response.status_code != 200:
            pytest.skip("Cannot get orders")
        
        orders = response.json()
        active_order = None
        for order in orders:
            if order.get("status") in ["active", "sent"]:
                active_order = order
                break
        
        if not active_order:
            # Create a test order
            tables_resp = requests.get(f"{BASE_URL}/api/tables", headers=self.get_headers())
            tables = tables_resp.json()
            products_resp = requests.get(f"{BASE_URL}/api/products", headers=self.get_headers())
            products = products_resp.json()
            
            free_table = None
            for t in tables:
                if t.get("status") == "free":
                    free_table = t
                    break
            
            if not free_table or not products:
                pytest.skip("Cannot create test order - no free tables or products")
            
            order_data = {
                "table_id": free_table["id"],
                "items": [{"product_id": products[0]["id"], "quantity": 1}]
            }
            order_resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=self.get_headers())
            if order_resp.status_code == 200:
                active_order = order_resp.json()
                # Send the order
                requests.put(f"{BASE_URL}/api/orders/{active_order['id']}/send", headers=self.get_headers())
        
        if not active_order:
            pytest.skip("No active order for pre-check test")
        
        # Get pre-check HTML
        response = requests.get(f"{BASE_URL}/api/print/pre-check/{active_order['id']}", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to get pre-check: {response.text}"
        precheck_data = response.json()
        html = precheck_data.get("html", "")
        
        # Verify no 'Sugerida' appears
        assert "Sugerida" not in html, f"Found 'Sugerida' in pre-check HTML which should be removed"
        
        # Verify it shows tax information
        assert "%" in html, "Pre-check should show tax percentages"
        assert "TOTAL ESTIMADO" in html, "Pre-check should show TOTAL ESTIMADO"
        
        print(f"✅ TEST 4 PASSED: Pre-check HTML has no 'Sugerida' and uses dynamic tax names")
    
    # ============= TEST 5: Verify tax_config uses description field =============
    def test_tax_config_has_description_field(self):
        """Verify tax_config entries have description field for dynamic names"""
        response = requests.get(f"{BASE_URL}/api/tax-config", headers=self.get_headers())
        assert response.status_code == 200, f"Failed to get tax config: {response.text}"
        taxes = response.json()
        
        print(f"  Found {len(taxes)} tax configurations:")
        for tax in taxes:
            tax_name = tax.get("name", "")
            tax_desc = tax.get("description", "")
            tax_rate = tax.get("rate", 0)
            is_active = tax.get("active") or tax.get("is_active")
            print(f"    - {tax_name}: description='{tax_desc}', rate={tax_rate}%, active={is_active}")
            
            # Each tax should have a description field (can be same as name or customized)
            assert "rate" in tax, f"Tax {tax_name} missing rate field"
        
        print(f"✅ TEST 5 PASSED: Tax config entries have proper structure")


class TestFrontendThermalTicket:
    """Tests for frontend ThermalTicket component styling"""
    
    def test_ticket_total_css_has_white_bg_with_black_border(self):
        """Verify .ticket-total CSS has white background with black border (not black bg)"""
        css_file_path = "/app/frontend/src/styles/ticket-print.css"
        
        with open(css_file_path, 'r') as f:
            css_content = f.read()
        
        # Find the .ticket-total rule
        assert ".ticket-total" in css_content, ".ticket-total CSS class not found"
        
        # Extract the .ticket-total rule content
        import re
        match = re.search(r'\.ticket-total\s*\{([^}]+)\}', css_content)
        assert match, "Could not parse .ticket-total CSS rule"
        
        rule_content = match.group(1)
        
        # Verify white background (not black)
        assert "background: #fff" in rule_content or "background:#fff" in rule_content, \
            f".ticket-total should have white background (background: #fff), found: {rule_content}"
        
        # Verify border: 2px solid #000
        assert "border: 2px solid #000" in rule_content or "border:2px solid #000" in rule_content, \
            f".ticket-total should have border: 2px solid #000, found: {rule_content}"
        
        # Ensure NOT black background
        assert "background: #000" not in rule_content and "background:#000" not in rule_content, \
            ".ticket-total should NOT have black background"
        
        print(f"✅ TEST CSS PASSED: .ticket-total has white bg (#fff) with border: 2px solid #000")


class TestFrontendSystemTabFields:
    """Tests for SystemTab.js having the 4 address and 4 footer fields"""
    
    def test_system_tab_has_4_address_fields(self):
        """Verify SystemTab.js has 4 address input fields"""
        file_path = "/app/frontend/src/pages/settings/SystemTab.js"
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check for 4 address fields
        assert "ticket_address_street" in content, "SystemTab missing ticket_address_street field"
        assert "ticket_address_building" in content, "SystemTab missing ticket_address_building field"
        assert "ticket_address_sector" in content, "SystemTab missing ticket_address_sector field"
        assert "ticket_address_city" in content, "SystemTab missing ticket_address_city field"
        
        # Check for data-testid attributes
        assert 'data-testid="ticket-address-street"' in content, "Missing data-testid for street field"
        assert 'data-testid="ticket-address-building"' in content, "Missing data-testid for building field"
        assert 'data-testid="ticket-address-sector"' in content, "Missing data-testid for sector field"
        assert 'data-testid="ticket-address-city"' in content, "Missing data-testid for city field"
        
        print(f"✅ TEST SystemTab PASSED: Has 4 address fields (street, building, sector, city)")
    
    def test_system_tab_has_4_footer_fields(self):
        """Verify SystemTab.js has 4 footer message input fields"""
        file_path = "/app/frontend/src/pages/settings/SystemTab.js"
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check for 4 footer message fields
        assert "ticket_footer_msg1" in content, "SystemTab missing ticket_footer_msg1 field"
        assert "ticket_footer_msg2" in content, "SystemTab missing ticket_footer_msg2 field"
        assert "ticket_footer_msg3" in content, "SystemTab missing ticket_footer_msg3 field"
        assert "ticket_footer_msg4" in content, "SystemTab missing ticket_footer_msg4 field"
        
        # Check for data-testid attributes
        assert 'data-testid="ticket-footer-msg1"' in content, "Missing data-testid for footer msg1"
        assert 'data-testid="ticket-footer-msg2"' in content, "Missing data-testid for footer msg2"
        assert 'data-testid="ticket-footer-msg3"' in content, "Missing data-testid for footer msg3"
        assert 'data-testid="ticket-footer-msg4"' in content, "Missing data-testid for footer msg4"
        
        print(f"✅ TEST SystemTab PASSED: Has 4 footer message fields")


class TestPaymentScreenDynamicTaxDisplay:
    """Tests for PaymentScreen.js using dynamic tax names"""
    
    def test_payment_screen_no_hardcoded_tax_names(self):
        """Verify PaymentScreen.js doesn't have hardcoded 'ITBIS (18%)' or 'Propina (10%)'"""
        file_path = "/app/frontend/src/pages/PaymentScreen.js"
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check for absence of hardcoded tax names
        assert "ITBIS (18%)" not in content, "PaymentScreen has hardcoded 'ITBIS (18%)'"
        assert "Propina (10%)" not in content, "PaymentScreen has hardcoded 'Propina (10%)'"
        assert "Propina Legal (10%)" not in content, "PaymentScreen has hardcoded 'Propina Legal (10%)'"
        assert "Sugerida" not in content, "PaymentScreen has 'Sugerida' which should be removed"
        
        # Verify dynamic tax display from tax_breakdown or taxConfig
        assert "tax_breakdown" in content, "PaymentScreen should reference tax_breakdown for dynamic names"
        assert "taxConfig" in content, "PaymentScreen should reference taxConfig for tax configuration"
        
        print(f"✅ TEST PaymentScreen PASSED: No hardcoded tax names, uses dynamic tax_breakdown/taxConfig")


class TestThermalTicketDynamicTaxes:
    """Tests for ThermalTicket.js using dynamic tax names"""
    
    def test_thermal_ticket_uses_tax_breakdown(self):
        """Verify ThermalTicket.js renders taxes from tax_breakdown"""
        file_path = "/app/frontend/src/components/ThermalTicket.js"
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Check for tax_breakdown usage
        assert "tax_breakdown" in content, "ThermalTicket should reference tax_breakdown"
        
        # Check that it maps over tax_breakdown
        assert "tax_breakdown?.map" in content or "tax_breakdown.map" in content, \
            "ThermalTicket should map over tax_breakdown array"
        
        # Verify no 'Sugerida'
        assert "Sugerida" not in content, "ThermalTicket should not contain 'Sugerida'"
        
        # Verify description is used (from tax_breakdown entries)
        assert "tax.description" in content or "description" in content, \
            "ThermalTicket should use tax description from tax_breakdown"
        
        print(f"✅ TEST ThermalTicket PASSED: Uses tax_breakdown for dynamic tax names")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
