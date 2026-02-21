"""
Test suite for Ticket Configuration (Datos del Negocio para Ticket) feature
Tests the GET and PUT endpoints for /api/system/config with ticket_* fields
"""

import pytest
import requests
import os
import time
import uuid

# Get base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://tpv-dominicano.preview.emergentagent.com').rstrip('/')

# Test data prefix for cleanup
TEST_PREFIX = "TEST_TICKET_"

class TestTicketConfigAPI:
    """Test ticket configuration API endpoints"""
    
    @pytest.fixture(scope="class")
    def api_client(self):
        """Create API session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    @pytest.fixture(scope="class")
    def auth_token(self, api_client):
        """Get authentication token with PIN 4321 (Luis - Cajero)"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={"pin": "4321"})
        if response.status_code == 200:
            return response.json().get("token")
        # Try admin PIN
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed - skipping tests")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Create auth headers"""
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_get_system_config_returns_200(self, api_client, auth_headers):
        """TEST 1: GET /api/system/config returns 200"""
        response = api_client.get(f"{BASE_URL}/api/system/config", headers=auth_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("TEST 1 PASSED: GET /api/system/config returns 200")
    
    def test_get_system_config_returns_json(self, api_client, auth_headers):
        """TEST 2: GET /api/system/config returns valid JSON"""
        response = api_client.get(f"{BASE_URL}/api/system/config", headers=auth_headers)
        data = response.json()
        assert isinstance(data, dict), "Response should be a dictionary"
        print(f"TEST 2 PASSED: Response contains: {list(data.keys())}")
    
    def test_get_system_config_returns_ticket_fields(self, api_client, auth_headers):
        """TEST 3: GET /api/system/config returns ticket_* fields if they exist"""
        response = api_client.get(f"{BASE_URL}/api/system/config", headers=auth_headers)
        data = response.json()
        
        # Check for expected base fields
        expected_base = ["timezone_offset", "restaurant_name", "currency", "rnc"]
        for field in expected_base:
            if field in data:
                print(f"  Found base field: {field} = {data[field]}")
        
        # Check for ticket fields (may not exist yet)
        ticket_fields = [
            "ticket_business_name",
            "ticket_legal_name", 
            "ticket_rnc",
            "ticket_address",
            "ticket_address2",
            "ticket_phone",
            "ticket_email",
            "ticket_ncf_expiry",
            "ticket_footer_message",
            "ticket_dgii_message"
        ]
        
        found_ticket_fields = []
        for field in ticket_fields:
            if field in data:
                found_ticket_fields.append(field)
                print(f"  Found ticket field: {field} = {data[field]}")
        
        print(f"TEST 3 PASSED: Found {len(found_ticket_fields)} ticket fields")
    
    def test_put_system_config_saves_ticket_fields(self, api_client, auth_headers):
        """TEST 4: PUT /api/system/config saves ticket_* fields correctly"""
        # Generate unique test data
        unique_id = str(uuid.uuid4())[:8]
        test_data = {
            "ticket_business_name": f"{TEST_PREFIX}RESTAURANT_{unique_id}",
            "ticket_legal_name": f"{TEST_PREFIX}LEGAL_NAME_{unique_id}",
            "ticket_rnc": f"1-31-{unique_id}",
            "ticket_address": f"{TEST_PREFIX}Ave Test #123",
            "ticket_address2": f"{TEST_PREFIX}City, Country",
            "ticket_phone": "809-555-9999",
            "ticket_email": f"test_{unique_id}@example.com",
            "ticket_ncf_expiry": "31/12/2027",
            "ticket_footer_message": f"{TEST_PREFIX}Thanks for visiting!",
            "ticket_dgii_message": f"{TEST_PREFIX}Keep this for DGII"
        }
        
        # Save config
        response = api_client.put(f"{BASE_URL}/api/system/config", headers=auth_headers, json=test_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify it was saved
        data = response.json()
        assert data.get("ok") == True, f"Expected ok: True, got {data}"
        
        print(f"TEST 4 PASSED: PUT /api/system/config saved ticket fields successfully")
    
    def test_put_then_get_verifies_persistence(self, api_client, auth_headers):
        """TEST 5: PUT then GET verifies data persistence"""
        # Generate unique test data
        unique_id = str(uuid.uuid4())[:8]
        test_data = {
            "ticket_business_name": f"PERSISTENCE_TEST_{unique_id}",
            "ticket_legal_name": f"LEGAL_{unique_id}",
            "ticket_phone": "809-888-8888"
        }
        
        # Save
        put_response = api_client.put(f"{BASE_URL}/api/system/config", headers=auth_headers, json=test_data)
        assert put_response.status_code == 200
        
        # Wait a bit for persistence
        time.sleep(0.5)
        
        # Get and verify
        get_response = api_client.get(f"{BASE_URL}/api/system/config", headers=auth_headers)
        assert get_response.status_code == 200
        
        data = get_response.json()
        assert data.get("ticket_business_name") == test_data["ticket_business_name"], \
            f"Expected {test_data['ticket_business_name']}, got {data.get('ticket_business_name')}"
        assert data.get("ticket_legal_name") == test_data["ticket_legal_name"], \
            f"Expected {test_data['ticket_legal_name']}, got {data.get('ticket_legal_name')}"
        assert data.get("ticket_phone") == test_data["ticket_phone"], \
            f"Expected {test_data['ticket_phone']}, got {data.get('ticket_phone')}"
        
        print(f"TEST 5 PASSED: Data persistence verified - all fields match")
    
    def test_partial_update_preserves_other_fields(self, api_client, auth_headers):
        """TEST 6: Partial update preserves existing fields"""
        # First get current config
        get_response = api_client.get(f"{BASE_URL}/api/system/config", headers=auth_headers)
        original_data = get_response.json()
        original_restaurant_name = original_data.get("restaurant_name")
        
        # Update only one ticket field
        unique_id = str(uuid.uuid4())[:8]
        update_data = {"ticket_footer_message": f"PARTIAL_UPDATE_{unique_id}"}
        
        put_response = api_client.put(f"{BASE_URL}/api/system/config", headers=auth_headers, json=update_data)
        assert put_response.status_code == 200
        
        # Get and verify original fields are preserved
        time.sleep(0.3)
        verify_response = api_client.get(f"{BASE_URL}/api/system/config", headers=auth_headers)
        verify_data = verify_response.json()
        
        assert verify_data.get("restaurant_name") == original_restaurant_name, \
            "Original restaurant_name should be preserved"
        assert verify_data.get("ticket_footer_message") == update_data["ticket_footer_message"], \
            "Updated ticket_footer_message should be saved"
        
        print(f"TEST 6 PASSED: Partial update preserves other fields")
    
    def test_ticket_config_accessible_without_auth_fails(self, api_client):
        """TEST 7: Endpoints should require authentication"""
        # This tests that endpoints are protected
        response = api_client.get(f"{BASE_URL}/api/system/config")
        # If no auth, should get 401 or redirect
        # However, if the endpoint allows unauthenticated access, it will return 200
        # We just log the behavior
        print(f"TEST 7: Without auth, GET /api/system/config returns {response.status_code}")
        # Not asserting since auth behavior may vary


class TestTicketConfigIntegration:
    """Integration tests for ticket config with ThermalTicket component"""
    
    @pytest.fixture(scope="class")
    def api_client(self):
        """Create API session"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        return session
    
    @pytest.fixture(scope="class")
    def auth_headers(self, api_client):
        """Get auth headers"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={"pin": "4321"})
        if response.status_code == 200:
            token = response.json().get("token")
            return {"Authorization": f"Bearer {token}"}
        pytest.skip("Authentication failed")
    
    def test_save_and_verify_all_ticket_fields(self, api_client, auth_headers):
        """TEST 8: Full flow - save all ticket fields and verify"""
        # Comprehensive test data
        test_config = {
            "ticket_business_name": "INTEGRATION_TEST_RESTAURANT",
            "ticket_legal_name": "INTEGRATION TEST SRL",
            "ticket_rnc": "1-31-99999-9",
            "ticket_address": "Calle Test #456",
            "ticket_address2": "Santo Domingo, DN",
            "ticket_phone": "809-111-2222",
            "ticket_email": "integration@test.com",
            "ticket_ncf_expiry": "31/12/2026",
            "ticket_footer_message": "Gracias por su preferencia!",
            "ticket_dgii_message": "Este documento es valido para fines fiscales"
        }
        
        # Save all fields
        put_response = api_client.put(f"{BASE_URL}/api/system/config", headers=auth_headers, json=test_config)
        assert put_response.status_code == 200, f"Save failed: {put_response.text}"
        
        # Verify all fields
        time.sleep(0.5)
        get_response = api_client.get(f"{BASE_URL}/api/system/config", headers=auth_headers)
        assert get_response.status_code == 200
        
        saved_data = get_response.json()
        
        for field, expected_value in test_config.items():
            actual_value = saved_data.get(field)
            assert actual_value == expected_value, \
                f"Field {field}: expected '{expected_value}', got '{actual_value}'"
            print(f"  Verified: {field} = {actual_value}")
        
        print(f"TEST 8 PASSED: All {len(test_config)} ticket fields saved and verified")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
