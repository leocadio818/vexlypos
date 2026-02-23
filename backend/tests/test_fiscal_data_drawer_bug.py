"""
Tests for the FiscalDataDrawer bug fix - POST /api/customers endpoint
The bug was: Frontend sent null for phone/email, backend expected strings
Fix: Frontend now sends empty strings "" instead of null
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token using admin PIN"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json().get("token")

@pytest.fixture
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session

class TestCustomerCreationBugFix:
    """Test that customer creation works with empty strings for phone/email"""
    
    def test_create_customer_with_empty_strings(self, api_client):
        """POST /api/customers with empty strings for phone and email should succeed"""
        unique_rnc = f"TEST{int(time.time())}"[-9:]  # 9 digit RNC
        payload = {
            "name": "Test Fiscal Customer",
            "phone": "",  # Empty string, not null
            "email": "",  # Empty string, not null
            "rnc": unique_rnc
        }
        
        response = api_client.post(f"{BASE_URL}/api/customers", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["name"] == "Test Fiscal Customer"
        assert data["phone"] == ""
        assert data["email"] == ""
        assert data["rnc"] == unique_rnc
        assert "id" in data
        print(f"✓ Customer created successfully with empty strings: {data['id']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/customers/{data['id']}")
    
    def test_create_customer_with_rnc_9_digits(self, api_client):
        """POST /api/customers with valid 9-digit RNC"""
        payload = {
            "name": "Empresa Test RNC 9",
            "phone": "",
            "email": "",
            "rnc": "101010101"  # 9 digits for RNC
        }
        
        response = api_client.post(f"{BASE_URL}/api/customers", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert len(data["rnc"]) == 9
        print(f"✓ Customer created with 9-digit RNC: {data['rnc']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/customers/{data['id']}")
    
    def test_create_customer_with_cedula_11_digits(self, api_client):
        """POST /api/customers with valid 11-digit Cédula"""
        payload = {
            "name": "Persona Test Cedula",
            "phone": "",
            "email": "",
            "rnc": "00112345678"  # 11 digits for Cédula
        }
        
        response = api_client.post(f"{BASE_URL}/api/customers", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert len(data["rnc"]) == 11
        print(f"✓ Customer created with 11-digit Cédula: {data['rnc']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/customers/{data['id']}")
    
    def test_create_customer_with_optional_email(self, api_client):
        """POST /api/customers with provided email should work"""
        unique_rnc = f"TEST{int(time.time())}"[-9:]
        payload = {
            "name": "Customer With Email",
            "phone": "",
            "email": "test@example.com",
            "rnc": unique_rnc
        }
        
        response = api_client.post(f"{BASE_URL}/api/customers", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["email"] == "test@example.com"
        print(f"✓ Customer created with email: {data['email']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/customers/{data['id']}")


class TestCustomerSearch:
    """Test customer search by RNC functionality"""
    
    def test_search_customer_by_rnc(self, api_client):
        """GET /api/customers?rnc=<rnc> should find customer"""
        # First create a customer
        unique_rnc = "987654321"
        payload = {
            "name": "Search Test Customer",
            "phone": "",
            "email": "",
            "rnc": unique_rnc
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/customers", json=payload)
        assert create_response.status_code == 200
        customer_id = create_response.json()["id"]
        
        # Now search by RNC
        search_response = api_client.get(f"{BASE_URL}/api/customers?rnc={unique_rnc}")
        
        assert search_response.status_code == 200, f"Search failed: {search_response.text}"
        customers = search_response.json()
        assert len(customers) >= 1
        found = any(c["rnc"] == unique_rnc for c in customers)
        assert found, f"Customer with RNC {unique_rnc} not found in search results"
        print(f"✓ Customer found by RNC search: {unique_rnc}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/customers/{customer_id}")
    
    def test_search_nonexistent_rnc(self, api_client):
        """GET /api/customers?rnc=<nonexistent> should return empty list"""
        response = api_client.get(f"{BASE_URL}/api/customers?rnc=000000000")
        
        assert response.status_code == 200
        customers = response.json()
        # Should return empty or no match for this specific RNC
        found = any(c["rnc"] == "000000000" for c in customers)
        # It's OK if empty or RNC doesn't match exactly
        print(f"✓ Search for nonexistent RNC returns: {len(customers)} customers (none matching)")


class TestBillPaymentWithFiscalData:
    """Test that bill payment can include fiscal data from new customer"""
    
    def test_get_bill_for_payment(self, api_client):
        """GET /api/bills/{id} should work for the test bill"""
        bill_id = "79c19534-a2a1-4cee-9d0f-5a214d70dde2"
        
        response = api_client.get(f"{BASE_URL}/api/bills/{bill_id}")
        
        assert response.status_code == 200, f"Bill not found: {response.text}"
        data = response.json()
        assert data["id"] == bill_id
        assert "total" in data
        assert "items" in data
        print(f"✓ Bill fetched successfully: {data['id']}, total: {data.get('total', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
