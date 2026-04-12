"""
PIN Uniqueness Validation Tests
Tests for security fix: PIN uniqueness validation
- Create user with NEW PIN should succeed (HTTP 200)
- Create user with EXISTING PIN should fail (HTTP 409)
- Edit user changing to another user's PIN should fail (HTTP 409)
- Edit user keeping their OWN PIN should succeed
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_PIN = "1000"
OSCAR_PIN = "1111"  # Cajero
CARLOS_PIN = "100"  # Mesero


class TestPinUniqueness:
    """PIN uniqueness validation tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login as admin to get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        self.token = data.get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Track created users for cleanup
        self.created_user_ids = []
        yield
        
        # Cleanup: Delete test users
        for user_id in self.created_user_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/users/{user_id}")
            except:
                pass
    
    def test_create_user_with_new_pin_succeeds(self):
        """Test: Create user with NEW PIN (e.g., 5555) - should succeed with HTTP 200/201"""
        unique_pin = str(5555 + int(uuid.uuid4().hex[:4], 16) % 1000)  # Random PIN like 5555-6554
        
        response = self.session.post(f"{BASE_URL}/api/users", json={
            "name": "TEST_NewPinUser",
            "last_name": "Prueba",
            "pin": unique_pin,
            "role": "waiter"
        })
        
        # Should succeed
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain user id"
        assert data["name"] == "TEST_NewPinUser"
        
        # Track for cleanup
        self.created_user_ids.append(data["id"])
        print(f"PASS: Created user with new PIN {unique_pin}")
    
    def test_create_user_with_existing_admin_pin_fails_409(self):
        """Test: Create user with EXISTING PIN (1000 - Admin PIN) - should fail with HTTP 409"""
        response = self.session.post(f"{BASE_URL}/api/users", json={
            "name": "TEST_DuplicatePinUser",
            "last_name": "Duplicado",
            "pin": ADMIN_PIN,  # 1000 - Admin's PIN
            "role": "waiter"
        })
        
        # Should fail with 409 Conflict
        assert response.status_code == 409, f"Expected 409, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should contain error detail"
        assert "Este PIN ya está en uso" in data["detail"], f"Expected Spanish error message, got: {data['detail']}"
        print(f"PASS: Create with existing Admin PIN correctly returns 409")
    
    def test_create_user_with_existing_oscar_pin_fails_409(self):
        """Test: Create user with EXISTING PIN (1111 - OSCAR's PIN) - should fail with HTTP 409"""
        response = self.session.post(f"{BASE_URL}/api/users", json={
            "name": "TEST_DuplicateOscarPin",
            "last_name": "Duplicado",
            "pin": OSCAR_PIN,  # 1111 - OSCAR's PIN
            "role": "waiter"
        })
        
        # Should fail with 409 Conflict
        assert response.status_code == 409, f"Expected 409, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "Este PIN ya está en uso" in data["detail"], f"Expected Spanish error message, got: {data['detail']}"
        print(f"PASS: Create with existing OSCAR PIN correctly returns 409")
    
    def test_edit_user_changing_to_another_users_pin_fails_409(self):
        """Test: Edit user changing to another user's PIN (1111 - OSCAR) - should fail with HTTP 409"""
        # First create a test user with unique PIN
        unique_pin = str(7777 + int(uuid.uuid4().hex[:4], 16) % 1000)
        
        create_response = self.session.post(f"{BASE_URL}/api/users", json={
            "name": "TEST_EditPinUser",
            "last_name": "Editar",
            "pin": unique_pin,
            "role": "waiter"
        })
        assert create_response.status_code in [200, 201], f"Failed to create test user: {create_response.text}"
        
        user_id = create_response.json()["id"]
        self.created_user_ids.append(user_id)
        
        # Now try to edit and change PIN to OSCAR's PIN (1111)
        edit_response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
            "pin": OSCAR_PIN  # 1111 - OSCAR's PIN
        })
        
        # Should fail with 409 Conflict
        assert edit_response.status_code == 409, f"Expected 409, got {edit_response.status_code}: {edit_response.text}"
        
        data = edit_response.json()
        assert "Este PIN ya está en uso" in data["detail"], f"Expected Spanish error message, got: {data['detail']}"
        print(f"PASS: Edit to existing OSCAR PIN correctly returns 409")
    
    def test_edit_user_keeping_own_pin_succeeds(self):
        """Test: Edit user keeping their OWN PIN - should succeed without error"""
        # First create a test user with unique PIN
        unique_pin = str(8888 + int(uuid.uuid4().hex[:4], 16) % 1000)
        
        create_response = self.session.post(f"{BASE_URL}/api/users", json={
            "name": "TEST_KeepPinUser",
            "last_name": "Mantener",
            "pin": unique_pin,
            "role": "waiter"
        })
        assert create_response.status_code in [200, 201], f"Failed to create test user: {create_response.text}"
        
        user_id = create_response.json()["id"]
        self.created_user_ids.append(user_id)
        
        # Now edit the user keeping the same PIN
        edit_response = self.session.put(f"{BASE_URL}/api/users/{user_id}", json={
            "name": "TEST_KeepPinUser_Updated",
            "pin": unique_pin  # Same PIN as before
        })
        
        # Should succeed
        assert edit_response.status_code == 200, f"Expected 200, got {edit_response.status_code}: {edit_response.text}"
        
        data = edit_response.json()
        assert data.get("ok") == True, f"Expected ok: true, got: {data}"
        print(f"PASS: Edit keeping own PIN succeeds")
    
    def test_check_pin_endpoint_detects_duplicate(self):
        """Test: /users/check-pin endpoint correctly detects duplicate PINs"""
        # Check if Admin PIN exists
        response = self.session.post(f"{BASE_URL}/api/users/check-pin", json={
            "pin": ADMIN_PIN
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("exists") == True, f"Expected exists: true for Admin PIN, got: {data}"
        print(f"PASS: check-pin correctly detects Admin PIN as existing")
    
    def test_check_pin_endpoint_allows_own_pin(self):
        """Test: /users/check-pin with exclude_user_id allows own PIN"""
        # First get admin user ID
        users_response = self.session.get(f"{BASE_URL}/api/users")
        assert users_response.status_code == 200
        
        users = users_response.json()
        admin_user = next((u for u in users if u.get("role") == "admin"), None)
        assert admin_user is not None, "Admin user not found"
        
        # Check Admin PIN excluding admin user
        response = self.session.post(f"{BASE_URL}/api/users/check-pin", json={
            "pin": ADMIN_PIN,
            "exclude_user_id": admin_user["id"]
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("exists") == False, f"Expected exists: false when excluding own user, got: {data}"
        print(f"PASS: check-pin correctly allows own PIN when excluded")
    
    def test_pin_validation_rejects_non_numeric(self):
        """Test: PIN validation rejects non-numeric PINs"""
        response = self.session.post(f"{BASE_URL}/api/users", json={
            "name": "TEST_InvalidPin",
            "pin": "abc123",
            "role": "waiter"
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "numérico" in data.get("detail", "").lower() or "numerico" in data.get("detail", "").lower(), \
            f"Expected numeric validation error, got: {data}"
        print(f"PASS: Non-numeric PIN correctly rejected")
    
    def test_pin_validation_rejects_leading_zero(self):
        """Test: PIN validation rejects PINs starting with 0"""
        response = self.session.post(f"{BASE_URL}/api/users", json={
            "name": "TEST_LeadingZeroPin",
            "pin": "0123",
            "role": "waiter"
        })
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "0" in data.get("detail", ""), f"Expected leading zero error, got: {data}"
        print(f"PASS: Leading zero PIN correctly rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
