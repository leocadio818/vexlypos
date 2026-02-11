"""
Test Theme API Endpoints for Glassmorphism Design
Tests: GET /api/theme-config, PUT /api/theme-config
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestThemeAPI:
    """Theme configuration API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as admin to get token"""
        self.admin_token = None
        self.waiter_token = None
        
        # Login as admin (PIN: 0000)
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if response.status_code == 200:
            self.admin_token = response.json().get("token")
        
        # Login as waiter (PIN: 1234)
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1234"})
        if response.status_code == 200:
            self.waiter_token = response.json().get("token")
    
    def test_get_theme_config_returns_default_theme(self):
        """GET /api/theme-config should return theme configuration"""
        response = requests.get(f"{BASE_URL}/api/theme-config")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify default theme keys exist
        assert "gradientStart" in data, "Missing gradientStart"
        assert "gradientMid1" in data, "Missing gradientMid1"
        assert "gradientMid2" in data, "Missing gradientMid2"
        assert "gradientEnd" in data, "Missing gradientEnd"
        assert "accentColor" in data, "Missing accentColor"
        assert "glassOpacity" in data, "Missing glassOpacity"
        assert "glassBlur" in data, "Missing glassBlur"
        assert "orbColor1" in data, "Missing orbColor1"
        assert "orbColor2" in data, "Missing orbColor2"
        assert "orbColor3" in data, "Missing orbColor3"
        
        print(f"Theme config retrieved successfully: {data}")
    
    def test_update_theme_config_as_admin(self):
        """PUT /api/theme-config should update theme for admin users"""
        if not self.admin_token:
            pytest.skip("Admin login failed - skipping authenticated test")
        
        # Update theme with custom colors
        new_theme = {
            "gradientStart": "#1a0a2e",
            "gradientMid1": "#2d1b4e",
            "gradientMid2": "#3d2b5e",
            "gradientEnd": "#2e4a6f",
            "accentColor": "#ff8800",
            "glassOpacity": 0.15,
            "glassBlur": 16
        }
        
        response = requests.put(
            f"{BASE_URL}/api/theme-config",
            json=new_theme,
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        # Verify the update was persisted
        get_response = requests.get(f"{BASE_URL}/api/theme-config")
        assert get_response.status_code == 200
        
        updated_data = get_response.json()
        assert updated_data["gradientStart"] == "#1a0a2e", "gradientStart not updated"
        assert updated_data["accentColor"] == "#ff8800", "accentColor not updated"
        assert updated_data["glassOpacity"] == 0.15, "glassOpacity not updated"
        
        print(f"Theme updated successfully: {updated_data}")
    
    def test_update_theme_config_forbidden_for_waiter(self):
        """PUT /api/theme-config should be forbidden for non-admin users"""
        if not self.waiter_token:
            pytest.skip("Waiter login failed - skipping test")
        
        new_theme = {
            "accentColor": "#00ff00"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/theme-config",
            json=new_theme,
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        
        assert response.status_code == 403, f"Expected 403 Forbidden, got {response.status_code}"
        print("Waiter correctly denied access to update theme")
    
    def test_update_theme_config_unauthorized_without_token(self):
        """PUT /api/theme-config should require authentication"""
        new_theme = {
            "accentColor": "#00ff00"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/theme-config",
            json=new_theme
        )
        
        assert response.status_code == 401, f"Expected 401 Unauthorized, got {response.status_code}"
        print("Unauthenticated request correctly rejected")
    
    def test_reset_theme_to_defaults(self):
        """POST /api/theme-config/reset should reset theme to defaults"""
        if not self.admin_token:
            pytest.skip("Admin login failed - skipping authenticated test")
        
        response = requests.post(
            f"{BASE_URL}/api/theme-config/reset",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, "Reset should return ok: true"
        
        # Verify defaults are restored
        default_theme = data.get("theme", {})
        assert default_theme.get("gradientStart") == "#0f0f23", "Default gradientStart not restored"
        assert default_theme.get("accentColor") == "#ff6600", "Default accentColor not restored"
        
        print(f"Theme reset to defaults: {default_theme}")


class TestAuthAPI:
    """Authentication API tests for different user roles"""
    
    def test_admin_login(self):
        """Admin should be able to login with PIN 0000"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        
        assert response.status_code == 200, f"Admin login failed: {response.status_code}"
        
        data = response.json()
        assert "token" in data, "Missing token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["role"] == "admin", f"Expected admin role, got {data['user']['role']}"
        
        print(f"Admin login successful: {data['user']['name']}")
    
    def test_waiter_login(self):
        """Waiter should be able to login with PIN 1234"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1234"})
        
        assert response.status_code == 200, f"Waiter login failed: {response.status_code}"
        
        data = response.json()
        assert "token" in data, "Missing token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["role"] == "waiter", f"Expected waiter role, got {data['user']['role']}"
        
        print(f"Waiter login successful: {data['user']['name']}")
    
    def test_cashier_login(self):
        """Cashier should be able to login with PIN 4321"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "4321"})
        
        assert response.status_code == 200, f"Cashier login failed: {response.status_code}"
        
        data = response.json()
        assert "token" in data, "Missing token in response"
        assert "user" in data, "Missing user in response"
        assert data["user"]["role"] == "cashier", f"Expected cashier role, got {data['user']['role']}"
        
        print(f"Cashier login successful: {data['user']['name']}")
    
    def test_invalid_pin_rejected(self):
        """Invalid PIN should be rejected"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "9999"})
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("Invalid PIN correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
