"""
Test E34 Credit Note Generator - Standalone feature for Admin/Owner
Tests the new endpoints:
- GET /api/credit-notes/find-bill?search=<transaction_number or e-NCF>
- POST /api/credit-notes/generate-e34
- Permission: manage_credit_notes
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_PIN = "1000"  # Admin with manage_credit_notes: true
CASHIER_PIN = "1111"  # OSCAR (Cajero) without manage_credit_notes

# Test bill data
TEST_TRANSACTION_NUMBER = "1147"
TEST_ENCF = "E321008776028"


class TestE34CreditNoteGenerator:
    """Tests for the standalone E34 Credit Note Generator feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.admin_token = None
        self.cashier_token = None
    
    def login(self, pin):
        """Login and return token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": pin})
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_01_admin_login(self):
        """Test admin can login with PIN 1000"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "admin"
        print(f"Admin login successful: {data['user']['name']}")
    
    def test_02_cashier_login(self):
        """Test cashier can login with PIN 1111"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": CASHIER_PIN})
        assert response.status_code == 200, f"Cashier login failed: {response.text}"
        data = response.json()
        assert "token" in data
        print(f"Cashier login successful: {data['user']['name']}")
    
    def test_03_admin_has_manage_credit_notes_permission(self):
        """Verify admin has manage_credit_notes permission"""
        token = self.login(ADMIN_PIN)
        assert token, "Admin login failed"
        
        response = self.session.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        permissions = data.get("permissions", {})
        assert permissions.get("manage_credit_notes") == True, "Admin should have manage_credit_notes permission"
        print("Admin has manage_credit_notes permission: True")
    
    def test_04_find_bill_by_transaction_number_admin(self):
        """Test GET /api/credit-notes/find-bill?search=1147 as admin"""
        token = self.login(ADMIN_PIN)
        assert token, "Admin login failed"
        
        response = self.session.get(
            f"{BASE_URL}/api/credit-notes/find-bill?search={TEST_TRANSACTION_NUMBER}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Could be 200 (found) or 404 (not found - test data may not exist)
        if response.status_code == 200:
            data = response.json()
            print(f"Bill found by transaction number: {data.get('transaction_number')}")
            print(f"  e-NCF: {data.get('ecf_encf')}")
            print(f"  Total: {data.get('total')}")
            assert "id" in data
            assert "transaction_number" in data
            assert "total" in data
        elif response.status_code == 404:
            print(f"Bill not found (expected if test data doesn't exist): {response.json().get('detail')}")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code} - {response.text}")
    
    def test_05_find_bill_by_encf_admin(self):
        """Test GET /api/credit-notes/find-bill?search=E321008776028 as admin"""
        token = self.login(ADMIN_PIN)
        assert token, "Admin login failed"
        
        response = self.session.get(
            f"{BASE_URL}/api/credit-notes/find-bill?search={TEST_ENCF}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"Bill found by e-NCF: {data.get('ecf_encf')}")
            print(f"  Transaction: {data.get('transaction_number')}")
            print(f"  Total: {data.get('total')}")
            assert "id" in data
            assert "ecf_encf" in data or "ncf" in data
        elif response.status_code == 404:
            print(f"Bill not found by e-NCF (expected if test data doesn't exist): {response.json().get('detail')}")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code} - {response.text}")
    
    def test_06_find_bill_permission_denied_cashier(self):
        """Test cashier without manage_credit_notes permission gets 403"""
        token = self.login(CASHIER_PIN)
        assert token, "Cashier login failed"
        
        response = self.session.get(
            f"{BASE_URL}/api/credit-notes/find-bill?search={TEST_TRANSACTION_NUMBER}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        # Should be 403 Forbidden for cashier without permission
        assert response.status_code == 403, f"Expected 403 for cashier, got {response.status_code}: {response.text}"
        print(f"Cashier correctly denied access: {response.json().get('detail')}")
    
    def test_07_generate_e34_validation_no_search(self):
        """Test POST /api/credit-notes/generate-e34 validates search parameter"""
        token = self.login(ADMIN_PIN)
        assert token, "Admin login failed"
        
        response = self.session.post(
            f"{BASE_URL}/api/credit-notes/generate-e34",
            headers={"Authorization": f"Bearer {token}"},
            json={"search": "", "reason": "Test reason"}
        )
        
        assert response.status_code == 400, f"Expected 400 for empty search, got {response.status_code}"
        print(f"Validation works for empty search: {response.json().get('detail')}")
    
    def test_08_generate_e34_validation_no_reason(self):
        """Test POST /api/credit-notes/generate-e34 validates reason parameter"""
        token = self.login(ADMIN_PIN)
        assert token, "Admin login failed"
        
        response = self.session.post(
            f"{BASE_URL}/api/credit-notes/generate-e34",
            headers={"Authorization": f"Bearer {token}"},
            json={"search": TEST_TRANSACTION_NUMBER, "reason": ""}
        )
        
        # Should be 400 for empty reason OR 404 if bill not found
        assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}"
        print(f"Validation response: {response.json().get('detail')}")
    
    def test_09_generate_e34_permission_denied_cashier(self):
        """Test cashier without manage_credit_notes permission gets 403 on generate"""
        token = self.login(CASHIER_PIN)
        assert token, "Cashier login failed"
        
        response = self.session.post(
            f"{BASE_URL}/api/credit-notes/generate-e34",
            headers={"Authorization": f"Bearer {token}"},
            json={"search": TEST_TRANSACTION_NUMBER, "reason": "Test reason"}
        )
        
        # Should be 403 Forbidden for cashier without permission
        assert response.status_code == 403, f"Expected 403 for cashier, got {response.status_code}: {response.text}"
        print(f"Cashier correctly denied E34 generation: {response.json().get('detail')}")
    
    def test_10_permissions_endpoint_includes_manage_credit_notes(self):
        """Verify manage_credit_notes appears in all permissions list"""
        token = self.login(ADMIN_PIN)
        assert token, "Admin login failed"
        
        response = self.session.get(
            f"{BASE_URL}/api/permissions/all",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        permissions = response.json()
        assert "manage_credit_notes" in permissions, "manage_credit_notes should be in ALL_PERMISSIONS"
        print(f"manage_credit_notes permission label: {permissions.get('manage_credit_notes')}")


class TestE34CreditNoteEndpointStructure:
    """Tests for endpoint structure and response format"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def login_admin(self):
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_find_bill_returns_expected_fields(self):
        """Test find-bill endpoint returns all expected fields"""
        token = self.login_admin()
        assert token, "Admin login failed"
        
        response = self.session.get(
            f"{BASE_URL}/api/credit-notes/find-bill?search={TEST_TRANSACTION_NUMBER}",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            expected_fields = [
                "id", "transaction_number", "ecf_encf", "total", "subtotal",
                "itbis", "items", "has_credit_note"
            ]
            for field in expected_fields:
                assert field in data, f"Missing field: {field}"
            print(f"All expected fields present in find-bill response")
            print(f"  has_credit_note: {data.get('has_credit_note')}")
            print(f"  items count: {len(data.get('items', []))}")
        elif response.status_code == 404:
            print("Bill not found - skipping field validation")
        else:
            pytest.fail(f"Unexpected status: {response.status_code}")
    
    def test_unauthenticated_request_rejected(self):
        """Test endpoints reject unauthenticated requests"""
        response = self.session.get(f"{BASE_URL}/api/credit-notes/find-bill?search=1147")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Unauthenticated request correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
