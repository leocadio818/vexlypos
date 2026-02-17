"""
Test Suite for Superuser (Admin) Void Permission System
Tests the verify-manager endpoint with the Superuser rule where Admin has all permissions
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVerifyManagerEndpoint:
    """Tests for POST /api/auth/verify-manager with Superuser rule"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for tests"""
        # Login as admin to get token
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"pin": "100"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}"
        }
    
    def test_admin_pin_returns_authorized_with_superuser_flag(self):
        """Admin (PIN 100) should return authorized=true and is_superuser=true"""
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-manager",
            headers=self.headers,
            json={"pin": "100", "permission": "void_items"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure and values
        assert data["authorized"] == True, "Admin should be authorized"
        assert data["is_superuser"] == True, "Admin should have is_superuser=true"
        assert data["role"] == "admin", "Role should be admin"
        assert data["permission_granted"] == "void_items", "Permission granted should match request"
        assert "user_id" in data, "Response should include user_id"
        assert "user_name" in data, "Response should include user_name"
        print(f"✓ Admin (PIN 100) authorized as Superuser: {data['user_name']}")
    
    def test_waiter_pin_returns_permission_error(self):
        """Waiter (PIN 1234) should return 403 with specific permission error"""
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-manager",
            headers=self.headers,
            json={"pin": "1234", "permission": "void_items"}
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify specific error message
        assert "detail" in data, "Response should have detail field"
        assert "Este usuario no tiene permisos de gerente" in data["detail"], \
            f"Expected 'no tiene permisos de gerente' error, got: {data['detail']}"
        print(f"✓ Waiter (PIN 1234) rejected with correct message: {data['detail']}")
    
    def test_invalid_pin_returns_incorrect_error(self):
        """Non-existent PIN should return 401 with 'PIN incorrecto'"""
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-manager",
            headers=self.headers,
            json={"pin": "77777", "permission": "void_items"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify specific error message
        assert "detail" in data, "Response should have detail field"
        assert "PIN incorrecto" in data["detail"], \
            f"Expected 'PIN incorrecto' error, got: {data['detail']}"
        print(f"✓ Invalid PIN (77777) rejected with: {data['detail']}")
    
    def test_cashier_pin_returns_permission_error(self):
        """Cashier (PIN 4321) should also return 403 - not a manager role"""
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-manager",
            headers=self.headers,
            json={"pin": "4321", "permission": "void_items"}
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Este usuario no tiene permisos de gerente" in data["detail"]
        print(f"✓ Cashier (PIN 4321) rejected as non-manager: {data['detail']}")
    
    def test_kitchen_pin_returns_permission_error(self):
        """Kitchen role (PIN 9999 - Chef Pedro) should return 403 - not a manager"""
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-manager",
            headers=self.headers,
            json={"pin": "9999", "permission": "void_items"}
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        data = response.json()
        assert "Este usuario no tiene permisos de gerente" in data["detail"]
        print(f"✓ Kitchen (PIN 9999) rejected as non-manager: {data['detail']}")
    
    def test_admin_can_authorize_any_permission(self):
        """Admin should be able to authorize ANY permission as Superuser"""
        permissions_to_test = [
            "void_items",
            "reprint_receipt", 
            "manage_users",
            "close_day",
            "export_dgii"
        ]
        
        for permission in permissions_to_test:
            response = requests.post(
                f"{BASE_URL}/api/auth/verify-manager",
                headers=self.headers,
                json={"pin": "100", "permission": permission}
            )
            
            assert response.status_code == 200, f"Admin should authorize {permission}: {response.text}"
            data = response.json()
            assert data["authorized"] == True
            assert data["is_superuser"] == True
            assert data["permission_granted"] == permission
            print(f"✓ Admin authorized for permission: {permission}")
    
    def test_empty_pin_returns_validation_error(self):
        """Empty PIN should return 400 with 'PIN es requerido'"""
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-manager",
            headers=self.headers,
            json={"pin": "", "permission": "void_items"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "PIN es requerido" in data["detail"]
        print(f"✓ Empty PIN rejected: {data['detail']}")
    
    def test_pin_with_leading_zero_returns_validation_error(self):
        """PIN starting with 0 should return 400 with validation error"""
        response = requests.post(
            f"{BASE_URL}/api/auth/verify-manager",
            headers=self.headers,
            json={"pin": "0123", "permission": "void_items"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "no puede iniciar con 0" in data["detail"]
        print(f"✓ Leading zero PIN rejected: {data['detail']}")


class TestLoginEndpoint:
    """Verify login works for test credentials"""
    
    def test_admin_login(self):
        """Admin PIN 100 should login successfully"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"pin": "100"}
        )
        
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "admin"
        assert data["user"]["name"] == "Admin"
        print(f"✓ Admin login successful: {data['user']['name']}")
    
    def test_waiter_login(self):
        """Waiter PIN 1234 should login successfully"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"pin": "1234"}
        )
        
        assert response.status_code == 200, f"Waiter login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "waiter"
        print(f"✓ Waiter login successful: {data['user']['name']}")
    
    def test_cashier_login(self):
        """Cashier PIN 4321 should login successfully"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"pin": "4321"}
        )
        
        assert response.status_code == 200, f"Cashier login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "cashier"
        print(f"✓ Cashier login successful: {data['user']['name']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
