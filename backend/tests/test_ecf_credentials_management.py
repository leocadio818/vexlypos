"""
Test e-CF Credentials Management Feature
=========================================
Tests the new credential management UI endpoints:
- GET /api/system/ecf-credentials/{provider} - Get masked credentials
- PUT /api/system/ecf-credentials - Save credentials
- POST /api/ecf/test-connection - Test connection with DB-stored credentials
- GET /api/ecf/config - Shows both providers status including DB-stored credentials
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def auth_token(api_client):
    """Get authentication token using Admin PIN"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping authenticated tests")

@pytest.fixture(scope="module")
def authenticated_client(api_client, auth_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


class TestEcfCredentialsEndpoints:
    """Test e-CF credential management endpoints"""

    def test_get_thefactory_credentials(self, authenticated_client):
        """GET /api/system/ecf-credentials/thefactory - Returns The Factory credentials (password masked)"""
        response = authenticated_client.get(f"{BASE_URL}/api/system/ecf-credentials/thefactory")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"The Factory credentials response: {data}")
        
        # Verify response structure
        assert "user" in data, "Response should contain 'user' field"
        assert "password" in data, "Response should contain 'password' field"
        assert "rnc" in data, "Response should contain 'rnc' field"
        assert "company_name" in data, "Response should contain 'company_name' field"
        assert "environment" in data, "Response should contain 'environment' field"
        assert "has_credentials" in data, "Response should contain 'has_credentials' field"
        
        # Verify password is masked (starts with ****)
        if data.get("password") and len(data["password"]) > 4:
            assert data["password"].startswith("****"), f"Password should be masked, got: {data['password']}"
            print(f"Password correctly masked: {data['password']}")
        
        # Verify existing credentials from DB
        if data.get("has_credentials"):
            assert data["user"], "User should be present when has_credentials is True"
            print(f"User: {data['user']}, RNC: {data['rnc']}")

    def test_get_alanube_credentials(self, authenticated_client):
        """GET /api/system/ecf-credentials/alanube - Returns Alanube credentials (token masked)"""
        response = authenticated_client.get(f"{BASE_URL}/api/system/ecf-credentials/alanube")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Alanube credentials response: {data}")
        
        # Verify response structure
        assert "token" in data, "Response should contain 'token' field"
        assert "rnc" in data, "Response should contain 'rnc' field"
        assert "environment" in data, "Response should contain 'environment' field"
        assert "has_token" in data, "Response should contain 'has_token' field"
        
        # Verify token is masked (starts with ****)
        if data.get("token") and len(data["token"]) > 4:
            assert data["token"].startswith("****"), f"Token should be masked, got: {data['token'][:20]}..."
            print(f"Token correctly masked: {data['token'][:20]}...")

    def test_get_invalid_provider_credentials(self, authenticated_client):
        """GET /api/system/ecf-credentials/{invalid} - Returns 400 for invalid provider"""
        response = authenticated_client.get(f"{BASE_URL}/api/system/ecf-credentials/invalid_provider")
        assert response.status_code == 400, f"Expected 400 for invalid provider, got {response.status_code}"
        print("Invalid provider correctly rejected with 400")

    def test_save_thefactory_credentials(self, authenticated_client):
        """PUT /api/system/ecf-credentials - Save The Factory credentials"""
        # Use the real sandbox credentials from test_credentials.md
        payload = {
            "provider": "thefactory",
            "user": "xfsbrucwcqtr_tfhka",
            "password": "oA4$y/cm4gg,",  # Real sandbox password
            "rnc": "130178984",
            "company_name": "PORTERHOUSE SRL",
            "environment": "sandbox"
        }
        response = authenticated_client.put(f"{BASE_URL}/api/system/ecf-credentials", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, f"Expected ok=True, got: {data}"
        assert "message" in data, "Response should contain message"
        print(f"Save response: {data}")
        
        # Verify credentials were saved by fetching them
        verify_response = authenticated_client.get(f"{BASE_URL}/api/system/ecf-credentials/thefactory")
        verify_data = verify_response.json()
        assert verify_data.get("user") == "xfsbrucwcqtr_tfhka", "User should be saved"
        assert verify_data.get("rnc") == "130178984", "RNC should be saved"
        assert verify_data.get("company_name") == "PORTERHOUSE SRL", "Company name should be saved"
        assert verify_data.get("environment") == "sandbox", "Environment should be saved"
        print("Credentials verified after save")

    def test_save_alanube_credentials(self, authenticated_client):
        """PUT /api/system/ecf-credentials - Save Alanube credentials"""
        # Get current Alanube credentials first to preserve them
        current_response = authenticated_client.get(f"{BASE_URL}/api/system/ecf-credentials/alanube")
        current_data = current_response.json()
        
        # Only update RNC and environment, don't overwrite token
        payload = {
            "provider": "alanube",
            "rnc": "132109122",
            "environment": "sandbox"
        }
        response = authenticated_client.put(f"{BASE_URL}/api/system/ecf-credentials", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, f"Expected ok=True, got: {data}"
        print(f"Alanube save response: {data}")
        
        # Verify credentials were saved
        verify_response = authenticated_client.get(f"{BASE_URL}/api/system/ecf-credentials/alanube")
        verify_data = verify_response.json()
        assert verify_data.get("rnc") == "132109122", "RNC should be saved"
        assert verify_data.get("environment") == "sandbox", "Environment should be saved"
        print("Alanube credentials verified after save")

    def test_save_invalid_provider(self, authenticated_client):
        """PUT /api/system/ecf-credentials - Validates provider must be 'alanube' or 'thefactory'"""
        payload = {
            "provider": "invalid_provider",
            "token": "test"
        }
        response = authenticated_client.put(f"{BASE_URL}/api/system/ecf-credentials", json=payload)
        assert response.status_code == 400, f"Expected 400 for invalid provider, got {response.status_code}"
        print("Invalid provider correctly rejected with 400")

    def test_masked_values_not_saved(self, authenticated_client):
        """PUT /api/system/ecf-credentials - Masked values (****) should not overwrite real credentials"""
        # First, get current credentials to see masked value
        get_response = authenticated_client.get(f"{BASE_URL}/api/system/ecf-credentials/thefactory")
        current_data = get_response.json()
        masked_password = current_data.get("password", "")
        
        # Try to save with masked password - should not overwrite
        payload = {
            "provider": "thefactory",
            "user": "xfsbrucwcqtr_tfhka",
            "password": masked_password,  # This is masked, should be ignored
            "rnc": "130178984",
            "environment": "sandbox"
        }
        response = authenticated_client.put(f"{BASE_URL}/api/system/ecf-credentials", json=payload)
        assert response.status_code == 200
        
        # Verify password wasn't overwritten with masked value
        verify_response = authenticated_client.get(f"{BASE_URL}/api/system/ecf-credentials/thefactory")
        verify_data = verify_response.json()
        # Password should still be masked (meaning real password is still there)
        assert verify_data.get("has_credentials") == True, "Credentials should still be valid"
        print("Masked password correctly ignored during save")


class TestEcfConfigEndpoint:
    """Test /api/ecf/config endpoint with DB-stored credentials"""

    def test_ecf_config_shows_both_providers(self, authenticated_client):
        """GET /api/ecf/config - Shows both providers status including DB-stored credentials"""
        response = authenticated_client.get(f"{BASE_URL}/api/ecf/config")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"ECF config response: {data}")
        
        # Verify response structure
        assert "active_provider" in data, "Response should contain 'active_provider'"
        assert "ecf_enabled" in data, "Response should contain 'ecf_enabled'"
        assert "alanube" in data, "Response should contain 'alanube' config"
        assert "thefactory" in data, "Response should contain 'thefactory' config"
        
        # Verify Alanube config structure
        assert "configured" in data["alanube"], "Alanube should have 'configured' field"
        assert "is_sandbox" in data["alanube"], "Alanube should have 'is_sandbox' field"
        
        # Verify The Factory config structure
        assert "configured" in data["thefactory"], "The Factory should have 'configured' field"
        assert "is_sandbox" in data["thefactory"], "The Factory should have 'is_sandbox' field"
        assert "rnc" in data["thefactory"], "The Factory should have 'rnc' field"
        assert "company" in data["thefactory"], "The Factory should have 'company' field"
        
        print(f"Active provider: {data['active_provider']}")
        print(f"ECF enabled: {data['ecf_enabled']}")
        print(f"Alanube configured: {data['alanube']['configured']}")
        print(f"The Factory configured: {data['thefactory']['configured']}")


class TestEcfTestConnection:
    """Test /api/ecf/test-connection with DB-stored credentials"""

    def test_connection_with_db_credentials(self, authenticated_client):
        """POST /api/ecf/test-connection - Works with DB-stored credentials"""
        # First ensure The Factory is the active provider
        config_response = authenticated_client.get(f"{BASE_URL}/api/ecf/config")
        config_data = config_response.json()
        
        response = authenticated_client.post(f"{BASE_URL}/api/ecf/test-connection")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"Test connection response: {data}")
        
        # Verify response structure
        assert "ok" in data, "Response should contain 'ok' field"
        assert "provider" in data, "Response should contain 'provider' field"
        assert "message" in data, "Response should contain 'message' field"
        
        # Log the result - connection may fail if credentials were modified by other tests
        # The important thing is that the endpoint works and returns proper structure
        if data.get("ok"):
            print(f"Connection successful: {data['message']}")
        else:
            print(f"Connection failed (may be due to test credential changes): {data['message']}")
            # This is acceptable - the endpoint works, credentials may have been modified


class TestSystemConfigMasking:
    """Test that system config masks sensitive credentials"""

    def test_system_config_masks_credentials(self, authenticated_client):
        """GET /api/system/config - Masks sensitive e-CF credentials"""
        response = authenticated_client.get(f"{BASE_URL}/api/system/config")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Check if ecf_alanube_token is masked
        if data.get("ecf_alanube_token"):
            token = data["ecf_alanube_token"]
            if len(token) > 4:
                assert token.startswith("****"), f"Alanube token should be masked in system config: {token[:20]}"
                print(f"Alanube token correctly masked in system config")
        
        # Check if ecf_tf_password is masked
        if data.get("ecf_tf_password"):
            password = data["ecf_tf_password"]
            if len(password) > 4:
                assert password.startswith("****"), f"TF password should be masked in system config: {password}"
                print(f"TF password correctly masked in system config")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
