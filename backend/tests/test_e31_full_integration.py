"""
Test E31 Customer Fiscal Data - Full Integration Test

Creates orders, bills, and verifies receipt output for E31, E32, E44, E45 invoice types.
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

def gen_id():
    return str(uuid.uuid4())

def now_iso():
    return datetime.now(timezone.utc).isoformat()


class TestE31FullIntegration:
    """Full integration test for E31 customer fiscal data on receipts"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data and authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get auth token
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        token = login_resp.json().get("token")
        if token:
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Test customer data
        self.test_fiscal_id = "131-06282-2"
        self.test_razon_social = "SSTECH SRL"
        self.test_fiscal_id_type = "RNC"
        
        # Get or create a test table
        tables_resp = self.session.get(f"{BASE_URL}/api/tables")
        if tables_resp.status_code == 200:
            tables = tables_resp.json()
            if tables:
                self.test_table = tables[0]
            else:
                # Create a test table
                table_resp = self.session.post(f"{BASE_URL}/api/tables", json={
                    "number": "TEST1",
                    "capacity": 4,
                    "area_id": ""
                })
                self.test_table = table_resp.json() if table_resp.status_code in [200, 201] else {"id": "test-table", "number": "T1"}
        else:
            self.test_table = {"id": "test-table", "number": "T1"}
        
        # Get or create a test product
        products_resp = self.session.get(f"{BASE_URL}/api/products?limit=1")
        if products_resp.status_code == 200:
            products = products_resp.json()
            if products:
                self.test_product = products[0]
            else:
                self.test_product = {"id": "test-product", "name": "Test Product", "price": 100}
        else:
            self.test_product = {"id": "test-product", "name": "Test Product", "price": 100}
        
        yield
    
    def create_order_and_bill(self, ecf_encf: str, ncf_type: str, include_customer_data: bool = True):
        """Helper to create an order and bill with specific NCF type"""
        # Create order
        order_id = f"TEST_ORDER_{gen_id()[:8]}"
        order_data = {
            "id": order_id,
            "table_id": self.test_table.get("id"),
            "table_number": self.test_table.get("number", "T1"),
            "items": [
                {
                    "id": f"item_{gen_id()[:8]}",
                    "product_id": self.test_product.get("id"),
                    "product_name": self.test_product.get("name", "Test Product"),
                    "quantity": 1,
                    "unit_price": self.test_product.get("price", 100),
                    "status": "sent"
                }
            ],
            "status": "active"
        }
        
        order_resp = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
        
        if order_resp.status_code not in [200, 201]:
            print(f"Order creation failed: {order_resp.status_code} - {order_resp.text}")
            return None, None
        
        order = order_resp.json()
        actual_order_id = order.get("id", order_id)
        
        # Create bill from order
        bill_data = {
            "order_id": actual_order_id,
            "table_id": self.test_table.get("id"),
            "ncf_type": ncf_type
        }
        
        if include_customer_data:
            bill_data["fiscal_id"] = self.test_fiscal_id
            bill_data["fiscal_id_type"] = self.test_fiscal_id_type
            bill_data["razon_social"] = self.test_razon_social
        
        bill_resp = self.session.post(f"{BASE_URL}/api/bills", json=bill_data)
        
        if bill_resp.status_code not in [200, 201]:
            print(f"Bill creation failed: {bill_resp.status_code} - {bill_resp.text}")
            return actual_order_id, None
        
        bill = bill_resp.json()
        bill_id = bill.get("id")
        
        # Update bill with ecf_encf (simulate e-NCF assignment)
        # This would normally be done by the ECF dispatcher
        update_resp = self.session.put(f"{BASE_URL}/api/bills/{bill_id}", json={
            "ecf_encf": ecf_encf,
            "ncf": ecf_encf,
            "ncf_type": ncf_type,
            "fiscal_id": self.test_fiscal_id if include_customer_data else "",
            "fiscal_id_type": self.test_fiscal_id_type if include_customer_data else "",
            "razon_social": self.test_razon_social if include_customer_data else ""
        })
        
        return actual_order_id, bill_id
    
    def test_01_create_e31_bill_and_verify_receipt(self):
        """Create E31 bill and verify receipt includes customer data"""
        order_id, bill_id = self.create_order_and_bill(
            ecf_encf="E310000000001",
            ncf_type="E31",
            include_customer_data=True
        )
        
        if not bill_id:
            pytest.skip("Could not create test bill")
        
        # Get receipt
        receipt_resp = self.session.get(f"{BASE_URL}/api/print/receipt/{bill_id}")
        
        assert receipt_resp.status_code == 200, f"Receipt request failed: {receipt_resp.status_code}"
        
        data = receipt_resp.json()
        html = data.get("html", "")
        
        # Verify customer data is present
        assert "DATOS DEL CLIENTE" in html, "E31 receipt should include 'DATOS DEL CLIENTE' section"
        assert self.test_fiscal_id in html, f"E31 receipt should include fiscal_id: {self.test_fiscal_id}"
        assert self.test_razon_social in html, f"E31 receipt should include razon_social: {self.test_razon_social}"
        
        print(f"PASS: E31 receipt includes customer data")
        print(f"  - Bill ID: {bill_id}")
        print(f"  - RNC: {self.test_fiscal_id}")
        print(f"  - Razón Social: {self.test_razon_social}")
    
    def test_02_create_e32_bill_and_verify_no_customer_data(self):
        """Create E32 bill and verify receipt does NOT include customer data"""
        order_id, bill_id = self.create_order_and_bill(
            ecf_encf="E320000000001",
            ncf_type="E32",
            include_customer_data=True  # Even with customer data, E32 should not show it
        )
        
        if not bill_id:
            pytest.skip("Could not create test bill")
        
        # Get receipt
        receipt_resp = self.session.get(f"{BASE_URL}/api/print/receipt/{bill_id}")
        
        assert receipt_resp.status_code == 200, f"Receipt request failed: {receipt_resp.status_code}"
        
        data = receipt_resp.json()
        html = data.get("html", "")
        
        # Verify customer data is NOT present
        assert "DATOS DEL CLIENTE" not in html, "E32 receipt should NOT include 'DATOS DEL CLIENTE' section"
        
        print(f"PASS: E32 receipt correctly excludes customer data")
        print(f"  - Bill ID: {bill_id}")


class TestReceiptHTMLStructure:
    """Test the HTML structure of receipts"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_03_find_existing_e31_bill_verify_structure(self):
        """Find existing E31 bill and verify HTML structure"""
        # Get recent bills
        bills_resp = self.session.get(f"{BASE_URL}/api/bills?limit=100")
        
        if bills_resp.status_code != 200:
            pytest.skip("Could not fetch bills")
        
        bills = bills_resp.json()
        
        # Find E31 bills with customer data
        e31_bills = [
            b for b in bills 
            if (b.get("ecf_encf", "").startswith("E31") or b.get("ncf_type") == "E31") and 
            (b.get("fiscal_id") or b.get("razon_social"))
        ]
        
        if not e31_bills:
            # Try to find any bill with fiscal data
            fiscal_bills = [b for b in bills if b.get("fiscal_id") or b.get("razon_social")]
            if fiscal_bills:
                print(f"Found {len(fiscal_bills)} bills with fiscal data, but none are E31")
                for b in fiscal_bills[:3]:
                    print(f"  - Bill {b.get('id')}: ecf_encf={b.get('ecf_encf')}, ncf_type={b.get('ncf_type')}")
            pytest.skip("No E31 bills with customer data found")
        
        # Test the first E31 bill
        bill = e31_bills[0]
        bill_id = bill.get("id")
        
        print(f"Testing E31 bill: {bill_id}")
        print(f"  - ecf_encf: {bill.get('ecf_encf')}")
        print(f"  - ncf_type: {bill.get('ncf_type')}")
        print(f"  - fiscal_id: {bill.get('fiscal_id')}")
        print(f"  - razon_social: {bill.get('razon_social')}")
        
        receipt_resp = self.session.get(f"{BASE_URL}/api/print/receipt/{bill_id}")
        
        assert receipt_resp.status_code == 200, f"Receipt request failed: {receipt_resp.status_code}"
        
        data = receipt_resp.json()
        html = data.get("html", "")
        
        # Verify structure
        assert "DATOS DEL CLIENTE" in html, "E31 receipt should include 'DATOS DEL CLIENTE'"
        
        # Verify customer data appears after NCF and before items
        ncf_pos = html.find("NCF:")
        datos_pos = html.find("DATOS DEL CLIENTE")
        
        if ncf_pos != -1 and datos_pos != -1:
            assert datos_pos > ncf_pos, "Customer data should appear after NCF line"
            print("PASS: Customer data appears after NCF line")
        
        print(f"PASS: E31 bill {bill_id} receipt structure is correct")
    
    def test_04_verify_e32_bills_exclude_customer_data(self):
        """Verify E32 bills do not show customer data"""
        bills_resp = self.session.get(f"{BASE_URL}/api/bills?limit=100")
        
        if bills_resp.status_code != 200:
            pytest.skip("Could not fetch bills")
        
        bills = bills_resp.json()
        
        # Find E32 bills
        e32_bills = [
            b for b in bills 
            if b.get("ecf_encf", "").startswith("E32") or b.get("ncf_type") == "E32"
        ]
        
        if not e32_bills:
            pytest.skip("No E32 bills found")
        
        # Test the first E32 bill
        bill = e32_bills[0]
        bill_id = bill.get("id")
        
        print(f"Testing E32 bill: {bill_id}")
        
        receipt_resp = self.session.get(f"{BASE_URL}/api/print/receipt/{bill_id}")
        
        if receipt_resp.status_code == 200:
            html = receipt_resp.json().get("html", "")
            
            # E32 should NOT have customer data section
            assert "DATOS DEL CLIENTE" not in html, "E32 receipt should NOT include 'DATOS DEL CLIENTE'"
            
            print(f"PASS: E32 bill {bill_id} correctly excludes customer data")


class TestCodeLogicVerification:
    """Verify the code logic is correct by checking the implementation"""
    
    def test_05_verify_fiscal_types_in_code(self):
        """Verify the fiscal types list in the code is correct"""
        # The expected list according to DGII requirements
        expected_types = ["B01", "B14", "B15", "E31", "E44", "E45"]
        
        # Read the server.py file and check the list
        import subprocess
        result = subprocess.run(
            ["grep", "-o", 'fiscal_types_require_customer_data = \\[.*\\]', "/app/backend/server.py"],
            capture_output=True, text=True
        )
        
        if result.returncode == 0:
            output = result.stdout.strip()
            print(f"Found in code: {output}")
            
            # Verify all expected types are present
            for t in expected_types:
                assert f'"{t}"' in output, f"Type {t} should be in fiscal_types_require_customer_data"
            
            # Verify E32 is NOT in the list
            # The list should not contain E32
            assert '"E32"' not in output or 'E32' not in output.split('[')[1].split(']')[0], "E32 should NOT be in fiscal_types_require_customer_data"
            
            print("PASS: Fiscal types list in code is correct")
        else:
            pytest.skip("Could not read server.py")
    
    def test_06_verify_ecf_encf_check_comes_first(self):
        """Verify that ecf_encf is checked before legacy NCF"""
        import subprocess
        
        # Check that the code checks ecf_encf first
        result = subprocess.run(
            ["grep", "-n", "if ecf_encf:", "/app/backend/server.py"],
            capture_output=True, text=True
        )
        
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            print(f"Found {len(lines)} occurrences of 'if ecf_encf:' check")
            
            # Should have multiple occurrences (HTML, ESC/POS, send_formatted_receipt, print queue)
            assert len(lines) >= 3, "Should have at least 3 occurrences of ecf_encf check"
            
            print("PASS: ecf_encf check is present in multiple places")
        else:
            pytest.skip("Could not search server.py")
    
    def test_07_verify_e31_in_ncf_type_inference(self):
        """Verify E31 is properly handled in NCF type inference"""
        import subprocess
        
        result = subprocess.run(
            ["grep", "-c", 'ecf_encf.startswith("E31")', "/app/backend/server.py"],
            capture_output=True, text=True
        )
        
        if result.returncode == 0:
            count = int(result.stdout.strip())
            print(f"Found {count} occurrences of E31 check in ecf_encf")
            
            # Should have multiple occurrences
            assert count >= 3, "Should have at least 3 occurrences of E31 check"
            
            print("PASS: E31 check is present in multiple places")
        else:
            pytest.skip("Could not search server.py")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
