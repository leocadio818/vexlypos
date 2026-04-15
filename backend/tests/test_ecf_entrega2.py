"""
Backend tests for Entrega 2 - e-CF Provider Management
Tests for Tareas 5, 6, 7: Multiprod provider, test connection, EcfDashboard
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEcfProviders:
    """Test e-CF provider endpoints (Tarea 5)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get('token')
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_providers_returns_three_providers(self):
        """GET /api/ecf/providers should return 3 providers: alanube, thefactory, multiprod"""
        response = requests.get(f"{BASE_URL}/api/ecf/providers", headers=self.headers)
        assert response.status_code == 200
        
        providers = response.json()
        assert len(providers) == 3, f"Expected 3 providers, got {len(providers)}"
        
        provider_ids = [p['id'] for p in providers]
        assert 'alanube' in provider_ids, "Missing alanube provider"
        assert 'thefactory' in provider_ids, "Missing thefactory provider"
        assert 'multiprod' in provider_ids, "Missing multiprod provider"
        
        # Verify provider names
        provider_names = {p['id']: p['name'] for p in providers}
        assert provider_names['alanube'] == 'Alanube'
        assert provider_names['thefactory'] == 'TheFactory HKA'
        assert provider_names['multiprod'] == 'Multiprod AM SRL'
    
    def test_get_ecf_config(self):
        """GET /api/ecf/config should return current provider configuration"""
        response = requests.get(f"{BASE_URL}/api/ecf/config", headers=self.headers)
        assert response.status_code == 200
        
        config = response.json()
        assert 'provider' in config, "Config should have 'provider' field"
        assert config['provider'] in ['alanube', 'thefactory', 'multiprod'], f"Invalid provider: {config['provider']}"
    
    def test_switch_provider_to_multiprod_and_back(self):
        """PUT /api/ecf/config should allow switching providers"""
        # Get current config
        response = requests.get(f"{BASE_URL}/api/ecf/config", headers=self.headers)
        original_provider = response.json().get('provider')
        
        # Switch to multiprod
        response = requests.put(
            f"{BASE_URL}/api/ecf/config",
            headers={**self.headers, "Content-Type": "application/json"},
            json={"provider": "multiprod"}
        )
        assert response.status_code == 200
        assert response.json().get('ok') == True
        assert response.json().get('provider') == 'multiprod'
        
        # Verify switch
        response = requests.get(f"{BASE_URL}/api/ecf/config", headers=self.headers)
        assert response.json().get('provider') == 'multiprod'
        
        # Switch back to original
        response = requests.put(
            f"{BASE_URL}/api/ecf/config",
            headers={**self.headers, "Content-Type": "application/json"},
            json={"provider": original_provider}
        )
        assert response.status_code == 200
        assert response.json().get('provider') == original_provider
    
    def test_switch_provider_to_thefactory(self):
        """PUT /api/ecf/config should allow switching to thefactory"""
        # Get current config
        response = requests.get(f"{BASE_URL}/api/ecf/config", headers=self.headers)
        original_provider = response.json().get('provider')
        
        # Switch to thefactory
        response = requests.put(
            f"{BASE_URL}/api/ecf/config",
            headers={**self.headers, "Content-Type": "application/json"},
            json={"provider": "thefactory"}
        )
        assert response.status_code == 200
        assert response.json().get('ok') == True
        
        # Switch back to original
        response = requests.put(
            f"{BASE_URL}/api/ecf/config",
            headers={**self.headers, "Content-Type": "application/json"},
            json={"provider": original_provider}
        )
        assert response.status_code == 200


class TestMultiprodConnection:
    """Test Multiprod connection endpoint (Tarea 5)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert response.status_code == 200
        self.token = response.json().get('token')
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_multiprod_test_connection(self):
        """POST /api/ecf/test-multiprod should return XSD local + Megaplus validation results"""
        response = requests.post(f"{BASE_URL}/api/ecf/test-multiprod", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data.get('ok') == True, f"Test connection failed: {data}"
        assert 'message' in data, "Response should have 'message' field"
        assert 'results' in data, "Response should have 'results' field"
        
        # Check for XSD local validation
        results = data.get('results', {})
        assert 'step0_local_validation' in results, "Should have step0_local_validation (XSD validation)"
        assert 'step1_validator' in results, "Should have step1_validator (Megaplus validation)"
        
        step0 = results.get('step0_local_validation', {})
        assert step0.get('ok') == True, "Local validation should pass"
        
        step1 = results.get('step1_validator', {})
        assert step1.get('ok') == True, "Megaplus validation should pass"


class TestEcfDashboard:
    """Test e-CF Dashboard endpoint (Tarea 7)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert response.status_code == 200
        self.token = response.json().get('token')
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_ecf_dashboard_endpoint(self):
        """GET /api/ecf/dashboard should return bills and summary"""
        response = requests.get(f"{BASE_URL}/api/ecf/dashboard", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert 'bills' in data, "Response should have 'bills' field"
        assert 'summary' in data, "Response should have 'summary' field"
        
        # Check summary structure
        summary = data.get('summary', {})
        assert 'total' in summary, "Summary should have 'total' field"


class TestEcfRetry:
    """Test e-CF retry endpoints (Tarea 7)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert response.status_code == 200
        self.token = response.json().get('token')
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_retry_all_endpoint_exists(self):
        """POST /api/ecf/retry-all should exist and return proper response"""
        response = requests.post(f"{BASE_URL}/api/ecf/retry-all", headers=self.headers)
        # Should return 200 even if no bills to retry
        assert response.status_code == 200
        
        data = response.json()
        assert 'total' in data, "Response should have 'total' field"
        assert 'success' in data, "Response should have 'success' field"
        assert 'failed' in data, "Response should have 'failed' field"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
