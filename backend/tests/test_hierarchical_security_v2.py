"""
Tests for Updated Hierarchical Security Model (v2)
===================================================
Changes from previous version:
1. Level 100 (Admin Sistema) now sees/edits ALL users INCLUDING themselves
2. Cajero level changed from 20 to 30
3. Level 80 (Propietario) can CREATE level 80 but can't see them after; sees only < 80
4. Level 60 (Gerente) only sees < 60
5. Level 40 and below: NO access to Config
6. DELETE /api/users/{id} now has hierarchy protection

Users:
- Admin PIN 10000, level 100
- Carlos PIN 1234, Mesero, level 20
- Luis PIN 4321, Cajero, level 30 (CHANGED from 20)
- Maria PIN 5678, Mesera, level 20
- Chef Pedro PIN 9999, Kitchen, level 10
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user credentials
ADMIN_PIN = "10000"   # level 100
CARLOS_PIN = "1234"   # Mesero level 20
LUIS_PIN = "4321"     # Cajero level 30 (CHANGED)
MARIA_PIN = "5678"    # Mesera level 20
PEDRO_PIN = "9999"    # Kitchen level 10


def get_auth_token(pin: str) -> str:
    """Helper to login and get auth token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": pin})
    if resp.status_code != 200:
        return None
    return resp.json().get("token")


def get_login_data(pin: str) -> dict:
    """Helper to login and get full response"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": pin})
    if resp.status_code != 200:
        return None
    return resp.json()


def get_headers(token: str) -> dict:
    """Helper to get auth headers"""
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }


class TestAdminLoginRoleLevel:
    """Test Admin login returns correct role_level"""
    
    def test_admin_login_returns_level_100(self):
        """Admin login should return role_level: 100"""
        data = get_login_data(ADMIN_PIN)
        assert data is not None, "Admin login failed"
        
        user = data.get("user", {})
        assert user.get("role_level") == 100, f"Admin should have role_level=100, got {user.get('role_level')}"
        assert user.get("role") == "admin", f"Admin should have role=admin, got {user.get('role')}"
        
        print(f"PASS: Admin login returns role_level=100, role=admin")


class TestLuisLoginRoleLevel:
    """Test Luis (Cajero) login returns correct role_level (CHANGED to 30)"""
    
    def test_luis_login_returns_level_30(self):
        """Luis (Cajero) login should return role_level: 30 (CHANGED from 20)"""
        data = get_login_data(LUIS_PIN)
        assert data is not None, "Luis login failed"
        
        user = data.get("user", {})
        assert user.get("role_level") == 30, f"Luis (Cajero) should have role_level=30, got {user.get('role_level')}"
        assert user.get("role") == "cashier", f"Luis should have role=cashier, got {user.get('role')}"
        
        print(f"PASS: Luis login returns role_level=30 (Cajero updated from 20 to 30)")


class TestCarlosLoginRoleLevel:
    """Test Carlos (Mesero) login returns correct role_level (still 20)"""
    
    def test_carlos_login_returns_level_20(self):
        """Carlos (Mesero) login should return role_level: 20"""
        data = get_login_data(CARLOS_PIN)
        assert data is not None, "Carlos login failed"
        
        user = data.get("user", {})
        assert user.get("role_level") == 20, f"Carlos (Mesero) should have role_level=20, got {user.get('role_level')}"
        assert user.get("role") == "waiter", f"Carlos should have role=waiter, got {user.get('role')}"
        
        print(f"PASS: Carlos login returns role_level=20, role=waiter")


class TestRolesEndpointCashierLevel:
    """Test GET /api/roles returns correct levels for builtin roles"""
    
    def test_roles_cashier_level_30_mesero_level_20(self):
        """GET /api/roles should show Cajero=30, Mesero=20"""
        token = get_auth_token(ADMIN_PIN)
        assert token is not None, "Admin login failed"
        
        resp = requests.get(f"{BASE_URL}/api/roles", headers=get_headers(token))
        assert resp.status_code == 200
        
        roles = resp.json()
        
        # Find builtin cashier and waiter roles
        cashier_role = next((r for r in roles if r.get('code') == 'cashier' and r.get('builtin')), None)
        waiter_role = next((r for r in roles if r.get('code') == 'waiter' and r.get('builtin')), None)
        
        assert cashier_role is not None, "Cashier builtin role should exist"
        assert waiter_role is not None, "Waiter builtin role should exist"
        
        assert cashier_role.get('level') == 30, f"Cashier level should be 30, got {cashier_role.get('level')}"
        assert waiter_role.get('level') == 20, f"Waiter level should be 20, got {waiter_role.get('level')}"
        
        print(f"PASS: GET /api/roles returns Cajero=30, Mesero=20")


class TestAdminListUsers:
    """Test Admin (level 100) listing users - UPDATED to see ALL including self"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin token"""
        self.admin_token = get_auth_token(ADMIN_PIN)
        assert self.admin_token is not None, "Admin login failed"
    
    def test_admin_sees_all_6_users_including_self(self):
        """Admin (level 100) should see ALL users INCLUDING themselves"""
        resp = requests.get(f"{BASE_URL}/api/users", headers=get_headers(self.admin_token))
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        users = resp.json()
        user_names = [u['name'] for u in users]
        
        # Admin should see themselves (NEW BEHAVIOR)
        admin_in_list = any(u.get('role') == 'admin' for u in users)
        assert admin_in_list, "Admin (level 100) should see themselves in user list"
        
        # Should see Carlos, Luis, Maria, Chef Pedro
        assert "Carlos" in user_names, "Admin should see Carlos (Mesero, level 20)"
        assert "Luis" in user_names, "Admin should see Luis (Cajero, level 30)"
        assert "Chef Pedro" in user_names, "Admin should see Chef Pedro (Kitchen, level 10)"
        
        # Count total - should include admin + all lower level users
        print(f"PASS: Admin sees {len(users)} users including themselves")
        print(f"Users visible: {user_names}")
        
        # Verify at least 5 users (Admin, Carlos, Luis, Maria?, Chef Pedro)
        assert len(users) >= 5, f"Admin should see at least 5 users, got {len(users)}"


class TestCarlosListUsers:
    """Test Carlos (Mesero, level 20) listing users"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup Carlos token"""
        self.carlos_token = get_auth_token(CARLOS_PIN)
        assert self.carlos_token is not None, "Carlos login failed"
    
    def test_carlos_sees_only_chef_pedro(self):
        """Carlos (level 20) should ONLY see Chef Pedro (level 10)"""
        resp = requests.get(f"{BASE_URL}/api/users", headers=get_headers(self.carlos_token))
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        users = resp.json()
        user_names = [u['name'] for u in users]
        
        # Should see ONLY Chef Pedro (level 10)
        assert "Chef Pedro" in user_names, "Carlos should see Chef Pedro (Kitchen, level 10)"
        
        # Should NOT see higher level users
        assert "Admin" not in user_names, "Carlos should NOT see Admin (level 100)"
        assert "Luis" not in user_names, "Carlos should NOT see Luis (Cajero, level 30)"
        
        # Should NOT see same level users
        assert "Maria" not in user_names, "Carlos should NOT see Maria (same level 20)"
        assert "Carlos" not in user_names, "Carlos should NOT see themselves"
        
        # Verify all users have level < 20
        for u in users:
            level = u.get('role_level', 0)
            assert level < 20, f"Carlos should not see {u['name']} with level {level}"
        
        print(f"PASS: Carlos (level 20) sees only Chef Pedro. Total: {len(users)}")


class TestLuisListUsers:
    """Test Luis (Cajero, level 30) listing users - UPDATED for new level"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup Luis token"""
        self.luis_token = get_auth_token(LUIS_PIN)
        assert self.luis_token is not None, "Luis login failed"
    
    def test_luis_sees_meseros_and_kitchen(self):
        """Luis (level 30) should see Meseros (20) and Kitchen (10), NOT Admin or self"""
        resp = requests.get(f"{BASE_URL}/api/users", headers=get_headers(self.luis_token))
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        users = resp.json()
        user_names = [u['name'] for u in users]
        user_levels = {u['name']: u.get('role_level', 0) for u in users}
        
        # Should see users with level < 30 (Meseros at 20, Kitchen at 10)
        assert "Chef Pedro" in user_names, "Luis should see Chef Pedro (Kitchen, level 10)"
        assert "Carlos" in user_names, "Luis should see Carlos (Mesero, level 20)"
        
        # Should NOT see Admin (level 100)
        assert "Admin" not in user_names, "Luis should NOT see Admin (level 100)"
        
        # Should NOT see themselves
        assert "Luis" not in user_names, "Luis should NOT see themselves"
        
        # Verify all visible users have level < 30
        for name, level in user_levels.items():
            assert level < 30, f"Luis should not see {name} with level {level}"
        
        print(f"PASS: Luis (level 30) sees {len(users)} users with level < 30")
        print(f"Users visible: {user_names}")


class TestCarlosCannotCreateRoles:
    """Test Carlos (level 20) cannot create roles - should get 403"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup Carlos token"""
        self.carlos_token = get_auth_token(CARLOS_PIN)
        assert self.carlos_token is not None, "Carlos login failed"
    
    def test_carlos_cannot_post_roles(self):
        """Carlos (level 20) CANNOT POST /api/roles - 403"""
        resp = requests.post(
            f"{BASE_URL}/api/roles",
            headers=get_headers(self.carlos_token),
            json={"name": "TestRole", "code": "testrole", "level": 15, "permissions": {}}
        )
        assert resp.status_code == 403, f"Expected 403 Forbidden, got {resp.status_code}"
        
        print(f"PASS: Carlos got 403 when trying to create role")


class TestCarlosCannotDeleteUser:
    """Test Carlos cannot delete users with level >= 20"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup Carlos token"""
        self.carlos_token = get_auth_token(CARLOS_PIN)
        assert self.carlos_token is not None, "Carlos login failed"
        
        # Get Chef Pedro's ID (level 10 - only user Carlos can see)
        resp = requests.get(f"{BASE_URL}/api/users", headers=get_headers(self.carlos_token))
        self.users = resp.json()
        self.pedro = next((u for u in self.users if u['name'] == 'Chef Pedro'), None)
    
    def test_carlos_cannot_delete_user_same_level_or_higher(self):
        """Carlos (level 20) CANNOT delete users with level >= 20"""
        # Get admin's user ID
        admin_token = get_auth_token(ADMIN_PIN)
        admin_resp = requests.get(f"{BASE_URL}/api/users", headers=get_headers(admin_token))
        all_users = admin_resp.json()
        
        # Find Luis (level 30)
        luis = next((u for u in all_users if u['name'] == 'Luis'), None)
        
        if luis:
            resp = requests.delete(
                f"{BASE_URL}/api/users/{luis['id']}",
                headers=get_headers(self.carlos_token)
            )
            # Should be 403 (hierarchy protection) since Luis level 30 >= Carlos level 20
            assert resp.status_code == 403, f"Expected 403 for deleting Luis (30 >= 20), got {resp.status_code}"
            print(f"PASS: Carlos cannot delete Luis (level 30 >= Carlos level 20)")
        else:
            pytest.skip("Luis user not found")


class TestAdminCanDeleteLowerLevelUser:
    """Test Admin can delete users with lower level"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin token and create test user"""
        self.admin_token = get_auth_token(ADMIN_PIN)
        assert self.admin_token is not None, "Admin login failed"
        self.created_user_id = None
    
    def test_admin_can_delete_lower_level_user(self):
        """Admin (level 100) CAN delete a user with lower level"""
        # Create a test user first
        timestamp = int(time.time())
        test_pin = f"77{timestamp % 10000}"
        
        create_resp = requests.post(
            f"{BASE_URL}/api/users",
            headers=get_headers(self.admin_token),
            json={
                "name": f"TEST_ToDelete_{timestamp}",
                "last_name": "TestUser",
                "pin": test_pin,
                "role": "kitchen",  # level 10
                "active": True
            }
        )
        
        if create_resp.status_code != 200:
            pytest.skip(f"Could not create test user: {create_resp.text}")
        
        user_id = create_resp.json().get("id")
        self.created_user_id = user_id
        
        # Admin should be able to delete this user
        delete_resp = requests.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers=get_headers(self.admin_token)
        )
        
        assert delete_resp.status_code == 200, f"Expected 200, got {delete_resp.status_code}: {delete_resp.text}"
        
        print(f"PASS: Admin successfully deleted lower level user")
    
    def teardown_method(self, method):
        """Cleanup - delete test user if still exists"""
        if self.created_user_id:
            requests.delete(
                f"{BASE_URL}/api/users/{self.created_user_id}",
                headers=get_headers(self.admin_token)
            )


class TestAdminCannotDeleteSelf:
    """Test Admin cannot delete themselves"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin token"""
        self.admin_token = get_auth_token(ADMIN_PIN)
        assert self.admin_token is not None, "Admin login failed"
        
        # Get admin's user ID from /auth/me
        me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=get_headers(self.admin_token))
        assert me_resp.status_code == 200
        self.admin_id = me_resp.json().get("id")
    
    def test_admin_cannot_delete_themselves(self):
        """Admin CANNOT delete themselves - should get 403"""
        resp = requests.delete(
            f"{BASE_URL}/api/users/{self.admin_id}",
            headers=get_headers(self.admin_token)
        )
        
        assert resp.status_code == 403, f"Expected 403 (cannot delete self), got {resp.status_code}"
        
        error = resp.json()
        assert "ti mismo" in error.get("detail", "").lower() or "eliminarte" in error.get("detail", "").lower(), \
            f"Error should mention self-deletion: {error.get('detail')}"
        
        print(f"PASS: Admin cannot delete themselves - got 403")


class TestAuditLogsCreated:
    """Test that audit logs are created for user operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin token"""
        self.admin_token = get_auth_token(ADMIN_PIN)
        assert self.admin_token is not None, "Admin login failed"
    
    def test_audit_logs_exist(self):
        """Verify audit logs endpoint returns data"""
        resp = requests.get(f"{BASE_URL}/api/role-audit-logs", headers=get_headers(self.admin_token))
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        
        logs = resp.json()
        assert isinstance(logs, list), "Audit logs should be a list"
        
        print(f"PASS: Audit logs endpoint accessible. Found {len(logs)} entries")
        
        if logs:
            # Check log structure
            sample = logs[0]
            print(f"Sample log: action={sample.get('action')}, by={sample.get('performed_by_name')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
