"""
Tests for Hierarchical Security Model
=====================================
Test cases for the security model where:
1. System Admin (level 100) can see/edit all users below them
2. Lower level users can only see users with LOWER level than theirs
3. Only System Admin can customize permissions and create/edit puestos (roles)
4. All role/permission changes are audited

Users:
- Admin PIN 10000, level 100
- Carlos PIN 1234, Mesero, level 20
- Luis PIN 4321, Cajero, level 20
- Maria PIN 5678, Mesera, level 20 (may exist)
- Chef Pedro PIN 9999, Kitchen, level 10
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user credentials
ADMIN_PIN = "10000"
CARLOS_PIN = "1234"   # Mesero level 20
LUIS_PIN = "4321"     # Cajero level 20
PEDRO_PIN = "9999"    # Kitchen level 10


def get_auth_token(pin: str) -> str:
    """Helper to login and get auth token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": pin})
    if resp.status_code != 200:
        return None
    return resp.json().get("token")


def get_headers(token: str) -> dict:
    """Helper to get auth headers"""
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }


class TestAdminListUsers:
    """Test Admin (level 100) listing users"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin token"""
        self.admin_token = get_auth_token(ADMIN_PIN)
        assert self.admin_token is not None, "Admin login failed"
    
    def test_01_admin_can_list_users(self):
        """Admin can call GET /api/users successfully"""
        resp = requests.get(f"{BASE_URL}/api/users", headers=get_headers(self.admin_token))
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        users = resp.json()
        assert isinstance(users, list), "Response should be a list"
        print(f"Admin sees {len(users)} users")
    
    def test_02_admin_does_not_see_themselves(self):
        """Admin should NOT see themselves in the list (level 100 >= 100)"""
        resp = requests.get(f"{BASE_URL}/api/users", headers=get_headers(self.admin_token))
        assert resp.status_code == 200
        users = resp.json()
        
        admin_ids = [u['id'] for u in users if u.get('role') == 'admin']
        admin_names = [u['name'] for u in users if u.get('role') == 'admin']
        
        # Admin should not be in the list
        assert len(admin_ids) == 0, f"Admin should NOT see themselves, but found admin users: {admin_names}"
        print("PASS: Admin does not see themselves in user list")
    
    def test_03_admin_sees_all_lower_level_users(self):
        """Admin should see all users with level < 100"""
        resp = requests.get(f"{BASE_URL}/api/users", headers=get_headers(self.admin_token))
        assert resp.status_code == 200
        users = resp.json()
        
        # Should see Carlos (waiter, 20), Luis (cashier, 20), Chef Pedro (kitchen, 10)
        user_names = [u['name'] for u in users]
        
        assert "Carlos" in user_names, "Admin should see Carlos (Mesero, level 20)"
        assert "Luis" in user_names, "Admin should see Luis (Cajero, level 20)"
        assert "Chef Pedro" in user_names, "Admin should see Chef Pedro (Kitchen, level 10)"
        
        print(f"PASS: Admin sees Carlos, Luis, Chef Pedro. Total: {len(users)} users")


class TestCarlosListUsers:
    """Test Carlos (Mesero, level 20) listing users"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup Carlos token"""
        self.carlos_token = get_auth_token(CARLOS_PIN)
        assert self.carlos_token is not None, "Carlos login failed"
    
    def test_01_carlos_can_list_users(self):
        """Carlos can call GET /api/users"""
        resp = requests.get(f"{BASE_URL}/api/users", headers=get_headers(self.carlos_token))
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    
    def test_02_carlos_sees_only_lower_level_users(self):
        """Carlos (level 20) should ONLY see users with level < 20 (Chef Pedro, level 10)"""
        resp = requests.get(f"{BASE_URL}/api/users", headers=get_headers(self.carlos_token))
        assert resp.status_code == 200
        users = resp.json()
        
        user_names = [u['name'] for u in users]
        user_levels = {u['name']: u.get('role_level', 0) for u in users}
        
        # Should see Chef Pedro (level 10)
        assert "Chef Pedro" in user_names, "Carlos should see Chef Pedro (Kitchen, level 10)"
        
        # Should NOT see other level 20 users (Luis, Maria) or Admin
        assert "Admin" not in user_names, "Carlos should NOT see Admin (level 100)"
        assert "Luis" not in user_names, "Carlos should NOT see Luis (level 20 - same level)"
        assert "Carlos" not in user_names, "Carlos should NOT see themselves"
        
        # Verify all users in list have level < 20
        for name, level in user_levels.items():
            assert level < 20, f"Carlos should NOT see {name} with level {level}"
        
        print(f"PASS: Carlos sees only Chef Pedro. Total users visible: {len(users)}")


class TestLuisListUsers:
    """Test Luis (Cajero, level 20) listing users"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup Luis token"""
        self.luis_token = get_auth_token(LUIS_PIN)
        assert self.luis_token is not None, "Luis login failed"
    
    def test_01_luis_sees_only_lower_level_users(self):
        """Luis (level 20) should ONLY see users with level < 20 (Chef Pedro, level 10)"""
        resp = requests.get(f"{BASE_URL}/api/users", headers=get_headers(self.luis_token))
        assert resp.status_code == 200
        users = resp.json()
        
        user_names = [u['name'] for u in users]
        
        # Should see Chef Pedro (level 10)
        assert "Chef Pedro" in user_names, "Luis should see Chef Pedro (Kitchen, level 10)"
        
        # Should NOT see other level 20 users or Admin
        assert "Admin" not in user_names, "Luis should NOT see Admin"
        assert "Carlos" not in user_names, "Luis should NOT see Carlos (same level 20)"
        assert "Luis" not in user_names, "Luis should NOT see themselves"
        
        print(f"PASS: Luis sees only Chef Pedro. Total: {len(users)}")


class TestCarlosRolePermissions:
    """Test that Carlos (level 20) CANNOT create/delete roles"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup Carlos token"""
        self.carlos_token = get_auth_token(CARLOS_PIN)
        assert self.carlos_token is not None, "Carlos login failed"
    
    def test_01_carlos_cannot_create_roles(self):
        """Carlos (level 20) CANNOT POST /api/roles - should get 403"""
        resp = requests.post(
            f"{BASE_URL}/api/roles",
            headers=get_headers(self.carlos_token),
            json={"name": "TestRole", "code": "testrole", "level": 15, "permissions": {}}
        )
        assert resp.status_code == 403, f"Expected 403 Forbidden, got {resp.status_code}"
        
        error = resp.json()
        assert "Administrador" in error.get("detail", "") or "Sistema" in error.get("detail", ""), \
            f"Error message should mention System Admin requirement: {error}"
        
        print(f"PASS: Carlos got 403 when trying to create role. Error: {error.get('detail')}")
    
    def test_02_carlos_cannot_delete_roles(self):
        """Carlos (level 20) CANNOT DELETE /api/roles/{id} - should get 403"""
        # Try to delete a non-existent role (doesn't matter, should fail auth first)
        resp = requests.delete(
            f"{BASE_URL}/api/roles/fake-role-id",
            headers=get_headers(self.carlos_token)
        )
        assert resp.status_code == 403, f"Expected 403 Forbidden, got {resp.status_code}"
        
        print(f"PASS: Carlos got 403 when trying to delete role")


class TestAdminRoleManagement:
    """Test that Admin (level 100) CAN create and manage roles"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin token"""
        self.admin_token = get_auth_token(ADMIN_PIN)
        assert self.admin_token is not None, "Admin login failed"
        self.created_role_id = None
    
    def test_01_admin_can_create_role_with_level(self):
        """Admin (level 100) CAN POST /api/roles with level field"""
        import time
        timestamp = int(time.time())
        
        resp = requests.post(
            f"{BASE_URL}/api/roles",
            headers=get_headers(self.admin_token),
            json={
                "name": f"Test Role {timestamp}",
                "code": f"test_role_{timestamp}",
                "level": 30,
                "permissions": {"view_dashboard": True, "open_table": True}
            }
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        role = resp.json()
        assert "id" in role, "Role should have an ID"
        assert role.get("level") == 30, f"Role level should be 30, got {role.get('level')}"
        assert role.get("builtin") == False, "Custom role should have builtin=False"
        
        self.created_role_id = role["id"]
        print(f"PASS: Admin created role with level 30. Role ID: {self.created_role_id}")
        
        # Cleanup: delete the test role
        if self.created_role_id:
            requests.delete(f"{BASE_URL}/api/roles/{self.created_role_id}", headers=get_headers(self.admin_token))
    
    def test_02_admin_can_list_all_roles(self):
        """Admin can see all roles including builtin ones"""
        resp = requests.get(f"{BASE_URL}/api/roles", headers=get_headers(self.admin_token))
        assert resp.status_code == 200
        
        roles = resp.json()
        role_codes = [r.get('code') or r.get('id') for r in roles]
        
        # Should see all builtin roles
        assert "admin" in role_codes, "Should see admin role"
        assert "waiter" in role_codes, "Should see waiter role"
        assert "cashier" in role_codes, "Should see cashier role"
        assert "supervisor" in role_codes, "Should see supervisor role"
        assert "kitchen" in role_codes, "Should see kitchen role"
        
        # Check that roles have level field
        for role in roles:
            assert "level" in role, f"Role {role.get('name')} should have level field"
        
        print(f"PASS: Admin sees {len(roles)} roles with level indicators")


class TestAuditLogs:
    """Test audit log access"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens"""
        self.admin_token = get_auth_token(ADMIN_PIN)
        self.carlos_token = get_auth_token(CARLOS_PIN)
        assert self.admin_token is not None, "Admin login failed"
        assert self.carlos_token is not None, "Carlos login failed"
    
    def test_01_admin_can_view_audit_logs(self):
        """Admin CAN GET /api/role-audit-logs"""
        resp = requests.get(f"{BASE_URL}/api/role-audit-logs", headers=get_headers(self.admin_token))
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        logs = resp.json()
        assert isinstance(logs, list), "Audit logs should be a list"
        
        print(f"PASS: Admin can view audit logs. Found {len(logs)} entries")
        
        if logs:
            # Verify log structure
            sample = logs[0]
            print(f"Sample audit log: action={sample.get('action')}, performed_by={sample.get('performed_by_name')}")
    
    def test_02_carlos_cannot_view_audit_logs(self):
        """Carlos CANNOT GET /api/role-audit-logs - should get 403"""
        resp = requests.get(f"{BASE_URL}/api/role-audit-logs", headers=get_headers(self.carlos_token))
        assert resp.status_code == 403, f"Expected 403 Forbidden, got {resp.status_code}"
        
        error = resp.json()
        print(f"PASS: Carlos got 403 trying to view audit logs. Error: {error.get('detail')}")


class TestRoleLevelInResponse:
    """Test that role_level is included in login and user responses"""
    
    def test_01_login_response_includes_role_level(self):
        """Login response should include role_level in user object"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert resp.status_code == 200
        
        data = resp.json()
        user = data.get("user", {})
        
        assert "role_level" in user, "User object should include role_level"
        assert user["role_level"] == 100, f"Admin role_level should be 100, got {user['role_level']}"
        
        print(f"PASS: Login response includes role_level={user['role_level']}")
    
    def test_02_carlos_has_role_level_20(self):
        """Carlos (waiter) should have role_level 20"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": CARLOS_PIN})
        assert resp.status_code == 200
        
        user = resp.json().get("user", {})
        assert user.get("role_level") == 20, f"Carlos role_level should be 20, got {user.get('role_level')}"
        
        print(f"PASS: Carlos has role_level=20")
    
    def test_03_chef_pedro_has_role_level_10(self):
        """Chef Pedro (kitchen) should have role_level 10"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": PEDRO_PIN})
        assert resp.status_code == 200
        
        user = resp.json().get("user", {})
        assert user.get("role_level") == 10, f"Chef Pedro role_level should be 10, got {user.get('role_level')}"
        
        print(f"PASS: Chef Pedro has role_level=10")


class TestRolesEndpointFiltering:
    """Test that GET /api/roles filters by caller's level"""
    
    def test_01_admin_sees_all_roles(self):
        """Admin should see ALL roles including admin role"""
        token = get_auth_token(ADMIN_PIN)
        resp = requests.get(f"{BASE_URL}/api/roles", headers=get_headers(token))
        assert resp.status_code == 200
        
        roles = resp.json()
        role_codes = [r.get('code') or r.get('id') for r in roles]
        
        assert "admin" in role_codes, "Admin should see admin role"
        print(f"PASS: Admin sees {len(roles)} roles including admin")
    
    def test_02_carlos_sees_filtered_roles(self):
        """Carlos (level 20) should see only roles with level < 20"""
        token = get_auth_token(CARLOS_PIN)
        resp = requests.get(f"{BASE_URL}/api/roles", headers=get_headers(token))
        assert resp.status_code == 200
        
        roles = resp.json()
        
        # Should only see kitchen (level 10)
        for role in roles:
            level = role.get('level', 0)
            assert level < 20, f"Carlos should not see role {role.get('name')} with level {level}"
        
        role_codes = [r.get('code') or r.get('id') for r in roles]
        assert "admin" not in role_codes, "Carlos should NOT see admin role (level 100)"
        assert "supervisor" not in role_codes, "Carlos should NOT see supervisor role (level 40)"
        
        print(f"PASS: Carlos sees {len(roles)} filtered roles (all level < 20)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
