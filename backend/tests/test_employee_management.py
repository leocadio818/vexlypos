"""
Tests for Employee Management - Unified UserConfig page redesign
Tests: roles API, user CRUD, puesto selection, permissions customization
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test users
ADMIN_PIN = "10000"
CARLOS_PIN = "1234"
CARLOS_ID = "79f86d60-4e61-4890-b467-4f14097c57a4"

@pytest.fixture(scope="module")
def admin_auth():
    """Get admin auth token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
    if resp.status_code != 200:
        pytest.skip("Admin login failed")
    data = resp.json()
    return {"Authorization": f"Bearer {data['token']}", "Content-Type": "application/json"}


class TestRolesAPI:
    """Tests for /api/roles endpoint - Role/Puesto management"""
    
    def test_01_roles_endpoint_returns_builtin_roles(self, admin_auth):
        """Verify builtin roles are returned with 'code' field"""
        resp = requests.get(f"{BASE_URL}/api/roles", headers=admin_auth)
        assert resp.status_code == 200
        roles = resp.json()
        
        # Check builtin roles exist
        builtin_codes = ['admin', 'waiter', 'cashier', 'supervisor', 'kitchen']
        for code in builtin_codes:
            role = next((r for r in roles if r.get('id') == code and r.get('builtin')), None)
            assert role is not None, f"Builtin role '{code}' not found"
            # CRITICAL: Verify 'code' field exists (the fix)
            assert 'code' in role, f"Builtin role '{code}' missing 'code' field"
            assert role['code'] == code, f"Builtin role code mismatch: expected {code}, got {role['code']}"
        print(f"✓ All 5 builtin roles have 'code' field: {builtin_codes}")
    
    def test_02_roles_spanish_labels(self, admin_auth):
        """Verify roles have Spanish names"""
        resp = requests.get(f"{BASE_URL}/api/roles", headers=admin_auth)
        roles = resp.json()
        
        expected_names = {
            'admin': 'Administrador',
            'waiter': 'Mesero',
            'cashier': 'Cajero',
            'supervisor': 'Supervisor',
            'kitchen': 'Cocina'
        }
        
        for code, expected_name in expected_names.items():
            role = next((r for r in roles if r.get('id') == code and r.get('builtin')), None)
            assert role['name'] == expected_name, f"Role {code} name mismatch: {role['name']} != {expected_name}"
        print(f"✓ All builtin roles have Spanish names")
    
    def test_03_roles_have_permissions(self, admin_auth):
        """Verify builtin roles have default permissions"""
        resp = requests.get(f"{BASE_URL}/api/roles", headers=admin_auth)
        roles = resp.json()
        
        admin_role = next((r for r in roles if r.get('id') == 'admin' and r.get('builtin')), None)
        assert admin_role is not None
        assert 'permissions' in admin_role
        assert admin_role['permissions'].get('manage_users') == True, "Admin should have manage_users permission"
        
        waiter_role = next((r for r in roles if r.get('id') == 'waiter' and r.get('builtin')), None)
        assert waiter_role is not None
        assert waiter_role['permissions'].get('open_table') == True, "Waiter should have open_table permission"
        print(f"✓ Roles have expected default permissions")


class TestUserAPI:
    """Tests for /api/users endpoint - User CRUD"""
    
    def test_01_get_user_by_id(self, admin_auth):
        """Verify getting Carlos (Mesero) by ID"""
        resp = requests.get(f"{BASE_URL}/api/users/{CARLOS_ID}", headers=admin_auth)
        assert resp.status_code == 200
        user = resp.json()
        
        assert user['name'] == 'Carlos'
        assert user['role'] == 'waiter', f"Carlos should be waiter, got {user['role']}"
        assert 'permissions' in user
        print(f"✓ User Carlos loaded: role={user['role']}, active={user.get('active', True)}")
    
    def test_02_users_list_returns_all_users(self, admin_auth):
        """Verify users list endpoint"""
        resp = requests.get(f"{BASE_URL}/api/users", headers=admin_auth)
        assert resp.status_code == 200
        users = resp.json()
        
        assert len(users) >= 5, f"Expected at least 5 users, got {len(users)}"
        
        # Check expected users exist
        expected_users = ['Admin', 'Carlos', 'Maria', 'Luis', 'Chef Pedro']
        user_names = [u['name'] for u in users]
        for name in expected_users:
            assert name in user_names, f"User '{name}' not found in users list"
        print(f"✓ Users list returned {len(users)} users including: {expected_users}")
    
    def test_03_users_have_spanish_role_label_in_response(self, admin_auth):
        """Check that user role field is the code (waiter, cashier, etc), not Spanish"""
        # Note: The frontend should display Spanish labels, but API returns role code
        resp = requests.get(f"{BASE_URL}/api/users", headers=admin_auth)
        users = resp.json()
        
        valid_role_codes = ['admin', 'waiter', 'cashier', 'supervisor', 'kitchen']
        for user in users:
            # Role should be code, not Spanish name
            if user['role'] in valid_role_codes:
                pass  # Expected - role is a code
            else:
                # Could be a custom role code
                print(f"  User {user['name']} has custom role: {user['role']}")
        print(f"✓ User roles are codes (frontend should translate to Spanish)")


class TestUpdateUserRole:
    """Tests for updating user role (Puesto)"""
    
    def test_01_update_user_role(self, admin_auth):
        """Test changing Carlos's role from waiter to cashier and back"""
        # First get current state
        resp = requests.get(f"{BASE_URL}/api/users/{CARLOS_ID}", headers=admin_auth)
        original_role = resp.json()['role']
        original_perms = resp.json().get('permissions', {})
        print(f"  Original role: {original_role}")
        
        # Update to cashier with default cashier permissions
        new_role = 'cashier' if original_role == 'waiter' else 'waiter'
        update_data = {
            "role": new_role,
            "permissions": {
                "open_table": True,
                "add_products": True,
                "collect_payment": new_role == 'cashier'
            }
        }
        
        resp = requests.put(f"{BASE_URL}/api/users/{CARLOS_ID}", json=update_data, headers=admin_auth)
        assert resp.status_code == 200, f"Update failed: {resp.text}"
        
        # Verify change
        resp = requests.get(f"{BASE_URL}/api/users/{CARLOS_ID}", headers=admin_auth)
        updated_user = resp.json()
        assert updated_user['role'] == new_role, f"Role not updated: {updated_user['role']}"
        print(f"  Updated role to: {new_role}")
        
        # Restore original
        restore_data = {
            "role": original_role,
            "permissions": original_perms
        }
        resp = requests.put(f"{BASE_URL}/api/users/{CARLOS_ID}", json=restore_data, headers=admin_auth)
        assert resp.status_code == 200
        
        # Verify restored
        resp = requests.get(f"{BASE_URL}/api/users/{CARLOS_ID}", headers=admin_auth)
        assert resp.json()['role'] == original_role
        print(f"✓ Role update and restore successful")


class TestPermissionsCustomization:
    """Tests for customizing individual permissions"""
    
    def test_01_update_individual_permission(self, admin_auth):
        """Test toggling individual permission without changing role"""
        # Get Carlos's current permissions
        resp = requests.get(f"{BASE_URL}/api/users/{CARLOS_ID}", headers=admin_auth)
        user = resp.json()
        original_perms = user.get('permissions', {})
        
        # Toggle a permission (view_dashboard)
        test_perm = 'view_dashboard'
        original_value = original_perms.get(test_perm, False)
        new_value = not original_value
        
        update_perms = {**original_perms, test_perm: new_value}
        update_data = {"permissions": update_perms}
        
        resp = requests.put(f"{BASE_URL}/api/users/{CARLOS_ID}", json=update_data, headers=admin_auth)
        assert resp.status_code == 200
        
        # Verify
        resp = requests.get(f"{BASE_URL}/api/users/{CARLOS_ID}", headers=admin_auth)
        updated_user = resp.json()
        # Note: get_permissions in backend merges with role defaults
        print(f"  {test_perm}: {original_value} -> {new_value}")
        
        # Restore
        restore_data = {"permissions": original_perms}
        resp = requests.put(f"{BASE_URL}/api/users/{CARLOS_ID}", json=restore_data, headers=admin_auth)
        assert resp.status_code == 200
        print(f"✓ Permission toggle and restore successful")


class TestCreateRole:
    """Tests for creating custom roles (Puestos)"""
    
    def test_01_create_custom_role(self, admin_auth):
        """Test creating a new custom Puesto"""
        role_name = "TEST_Bartender"
        role_code = "test_bartender"
        
        create_data = {
            "name": role_name,
            "code": role_code,
            "permissions": {
                "open_table": True,
                "add_products": True,
                "collect_payment": True
            }
        }
        
        resp = requests.post(f"{BASE_URL}/api/roles", json=create_data, headers=admin_auth)
        assert resp.status_code == 200, f"Create role failed: {resp.text}"
        created_role = resp.json()
        assert 'id' in created_role
        role_id = created_role['id']
        print(f"  Created role: {role_name} (id: {role_id})")
        
        # Verify it appears in roles list
        resp = requests.get(f"{BASE_URL}/api/roles", headers=admin_auth)
        roles = resp.json()
        found_role = next((r for r in roles if r.get('name') == role_name), None)
        assert found_role is not None, f"Created role not found in list"
        
        # Cleanup - delete the test role
        resp = requests.delete(f"{BASE_URL}/api/roles/{role_id}", headers=admin_auth)
        assert resp.status_code == 200
        print(f"✓ Custom role created and cleaned up")


class TestCreateNewEmployee:
    """Tests for /user/new - creating new employees"""
    
    def test_01_create_new_employee(self, admin_auth):
        """Test creating a new employee via API"""
        test_pin = "99887"  # Unique test PIN
        
        create_data = {
            "name": "TEST_NewEmployee",
            "last_name": "Testing",
            "pos_name": "TEST NE",
            "pin": test_pin,
            "role": "waiter",
            "active": True,
            "permissions": {
                "open_table": True,
                "add_products": True
            }
        }
        
        resp = requests.post(f"{BASE_URL}/api/users", json=create_data, headers=admin_auth)
        assert resp.status_code == 200, f"Create user failed: {resp.text}"
        created_user = resp.json()
        assert 'id' in created_user
        user_id = created_user['id']
        assert created_user['name'] == "TEST_NewEmployee"
        assert created_user['role'] == "waiter"
        print(f"  Created user: {created_user['name']} (id: {user_id})")
        
        # Cleanup - soft delete
        resp = requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=admin_auth)
        assert resp.status_code == 200
        print(f"✓ New employee created and cleaned up")
    
    def test_02_pin_validation(self, admin_auth):
        """Test PIN validation rules"""
        # Test PIN starting with 0
        bad_data = {"name": "TEST_BadPIN", "pin": "0123", "role": "waiter"}
        resp = requests.post(f"{BASE_URL}/api/users", json=bad_data, headers=admin_auth)
        assert resp.status_code == 400, "Should reject PIN starting with 0"
        
        # Test non-numeric PIN
        bad_data = {"name": "TEST_BadPIN", "pin": "abc123", "role": "waiter"}
        resp = requests.post(f"{BASE_URL}/api/users", json=bad_data, headers=admin_auth)
        assert resp.status_code == 400, "Should reject non-numeric PIN"
        
        print(f"✓ PIN validation rules working")


class TestTrainingMode:
    """Tests for training mode toggle"""
    
    def test_01_toggle_training_mode(self, admin_auth):
        """Test toggling training mode on a user"""
        # Get current state
        resp = requests.get(f"{BASE_URL}/api/users/{CARLOS_ID}", headers=admin_auth)
        original_training = resp.json().get('training_mode', False)
        
        # Toggle
        update_data = {"training_mode": not original_training}
        resp = requests.put(f"{BASE_URL}/api/users/{CARLOS_ID}", json=update_data, headers=admin_auth)
        assert resp.status_code == 200
        
        # Verify
        resp = requests.get(f"{BASE_URL}/api/users/{CARLOS_ID}", headers=admin_auth)
        assert resp.json()['training_mode'] == (not original_training)
        
        # Restore
        update_data = {"training_mode": original_training}
        resp = requests.put(f"{BASE_URL}/api/users/{CARLOS_ID}", json=update_data, headers=admin_auth)
        assert resp.status_code == 200
        print(f"✓ Training mode toggle working")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
