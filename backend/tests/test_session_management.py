"""
Test Session Management Feature
- Auto-logout configuration
- Active sessions listing (admin only)
- Session revocation (admin only)
- Heartbeat endpoint
- Revoked session returns 401
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_PIN = "1000"
OSCAR_PIN = "1111"  # Cajero
CARLOS_PIN = "100"  # Mesero


class TestSessionManagement:
    """Session management endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.admin_token = None
        self.oscar_token = None
        self.oscar_user_id = None
        self.admin_user_id = None
    
    def login(self, pin):
        """Helper to login and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": pin})
        if response.status_code == 200:
            data = response.json()
            return data.get("token"), data.get("user", {}).get("id")
        return None, None
    
    def test_01_login_includes_session_id_in_jwt(self):
        """Test that login response includes session_id in JWT"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Token not in response"
        
        # Decode JWT to check session_id (without verification)
        import base64
        import json
        token = data["token"]
        payload_b64 = token.split(".")[1]
        # Add padding if needed
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        
        assert "session_id" in payload, "session_id not in JWT payload"
        assert payload["session_id"], "session_id is empty"
        print(f"SUCCESS: JWT contains session_id: {payload['session_id'][:8]}...")
    
    def test_02_get_auto_logout_config_returns_default(self):
        """Test GET /api/auth/auto-logout-config returns default config"""
        response = requests.get(f"{BASE_URL}/api/auth/auto-logout-config")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "enabled" in data, "enabled field missing"
        assert "timeout_minutes" in data, "timeout_minutes field missing"
        assert isinstance(data["enabled"], bool), "enabled should be boolean"
        assert isinstance(data["timeout_minutes"], int), "timeout_minutes should be int"
        print(f"SUCCESS: Auto-logout config: enabled={data['enabled']}, timeout={data['timeout_minutes']}min")
    
    def test_03_update_auto_logout_config_admin_only(self):
        """Test PUT /api/auth/auto-logout-config requires admin"""
        # Login as admin
        admin_token, _ = self.login(ADMIN_PIN)
        assert admin_token, "Admin login failed"
        
        # Update config as admin
        response = requests.put(
            f"{BASE_URL}/api/auth/auto-logout-config",
            json={"enabled": True, "timeout_minutes": 15},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Admin update failed: {response.text}"
        print("SUCCESS: Admin can update auto-logout config")
        
        # Verify config was saved
        response = requests.get(f"{BASE_URL}/api/auth/auto-logout-config")
        data = response.json()
        assert data["enabled"] == True, "enabled not saved"
        assert data["timeout_minutes"] == 15, "timeout_minutes not saved"
        print("SUCCESS: Config persisted correctly")
        
        # Reset to disabled
        requests.put(
            f"{BASE_URL}/api/auth/auto-logout-config",
            json={"enabled": False, "timeout_minutes": 30},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_04_update_auto_logout_config_non_admin_forbidden(self):
        """Test non-admin cannot update auto-logout config"""
        # Login as Oscar (cashier)
        oscar_token, _ = self.login(OSCAR_PIN)
        assert oscar_token, "Oscar login failed"
        
        response = requests.put(
            f"{BASE_URL}/api/auth/auto-logout-config",
            json={"enabled": True, "timeout_minutes": 10},
            headers={"Authorization": f"Bearer {oscar_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("SUCCESS: Non-admin cannot update auto-logout config (403)")
    
    def test_05_active_sessions_admin_only(self):
        """Test GET /api/auth/active-sessions requires admin"""
        # Login as admin
        admin_token, _ = self.login(ADMIN_PIN)
        assert admin_token, "Admin login failed"
        
        response = requests.get(
            f"{BASE_URL}/api/auth/active-sessions",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        sessions = response.json()
        assert isinstance(sessions, list), "Response should be a list"
        print(f"SUCCESS: Admin can list active sessions ({len(sessions)} sessions)")
        
        # Verify session structure
        if sessions:
            session = sessions[0]
            assert "user_id" in session, "user_id missing"
            assert "user_name" in session, "user_name missing"
            assert "role" in session, "role missing"
            assert "last_activity" in session, "last_activity missing"
            print(f"SUCCESS: Session structure valid - user: {session['user_name']}, role: {session['role']}")
    
    def test_06_active_sessions_non_admin_forbidden(self):
        """Test non-admin cannot list active sessions"""
        # Login as Oscar (cashier)
        oscar_token, _ = self.login(OSCAR_PIN)
        assert oscar_token, "Oscar login failed"
        
        response = requests.get(
            f"{BASE_URL}/api/auth/active-sessions",
            headers={"Authorization": f"Bearer {oscar_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("SUCCESS: Non-admin cannot list active sessions (403)")
    
    def test_07_heartbeat_updates_last_activity(self):
        """Test POST /api/auth/heartbeat updates last_activity"""
        # Login as admin
        admin_token, admin_id = self.login(ADMIN_PIN)
        assert admin_token, "Admin login failed"
        
        # Call heartbeat
        response = requests.post(
            f"{BASE_URL}/api/auth/heartbeat",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Heartbeat failed: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, "Heartbeat should return ok: true"
        print("SUCCESS: Heartbeat endpoint works")
    
    def test_08_revoke_session_admin_only(self):
        """Test POST /api/auth/revoke-session/{user_id} requires admin"""
        # Login as Oscar first to create a session
        oscar_token, oscar_id = self.login(OSCAR_PIN)
        assert oscar_token, "Oscar login failed"
        assert oscar_id, "Oscar user_id not returned"
        
        # Login as admin
        admin_token, admin_id = self.login(ADMIN_PIN)
        assert admin_token, "Admin login failed"
        
        # Verify Oscar's session exists
        response = requests.get(
            f"{BASE_URL}/api/auth/active-sessions",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        sessions = response.json()
        oscar_session = next((s for s in sessions if s["user_id"] == oscar_id), None)
        assert oscar_session, "Oscar's session not found in active sessions"
        print(f"SUCCESS: Oscar's session found - user_name: {oscar_session['user_name']}")
        
        # Revoke Oscar's session
        response = requests.post(
            f"{BASE_URL}/api/auth/revoke-session/{oscar_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Revoke failed: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, "Revoke should return ok: true"
        print(f"SUCCESS: Admin revoked Oscar's session - {data.get('message')}")
        
        # Verify Oscar's session is removed from active sessions
        response = requests.get(
            f"{BASE_URL}/api/auth/active-sessions",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        sessions = response.json()
        oscar_session = next((s for s in sessions if s["user_id"] == oscar_id), None)
        assert oscar_session is None, "Oscar's session should be removed"
        print("SUCCESS: Oscar's session removed from active sessions")
    
    def test_09_revoked_session_returns_401(self):
        """Test that revoked session returns 401 on next request"""
        # Login as Oscar to create a new session
        oscar_token, oscar_id = self.login(OSCAR_PIN)
        assert oscar_token, "Oscar login failed"
        
        # Login as admin
        admin_token, _ = self.login(ADMIN_PIN)
        assert admin_token, "Admin login failed"
        
        # Revoke Oscar's session
        response = requests.post(
            f"{BASE_URL}/api/auth/revoke-session/{oscar_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Revoke failed: {response.text}"
        
        # Oscar tries to use his token - should get 401
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {oscar_token}"}
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        
        data = response.json()
        assert "Sesion cerrada por administrador" in data.get("detail", ""), \
            f"Expected 'Sesion cerrada por administrador' message, got: {data}"
        print("SUCCESS: Revoked session returns 401 with correct message")
    
    def test_10_admin_cannot_revoke_own_session(self):
        """Test admin cannot revoke their own session"""
        # Login as admin
        admin_token, admin_id = self.login(ADMIN_PIN)
        assert admin_token, "Admin login failed"
        assert admin_id, "Admin user_id not returned"
        
        # Try to revoke own session
        response = requests.post(
            f"{BASE_URL}/api/auth/revoke-session/{admin_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        data = response.json()
        assert "propia sesion" in data.get("detail", "").lower() or "tu propia" in data.get("detail", "").lower(), \
            f"Expected message about own session, got: {data}"
        print("SUCCESS: Admin cannot revoke own session (400)")
    
    def test_11_non_admin_cannot_revoke_sessions(self):
        """Test non-admin cannot revoke sessions"""
        # Login as Oscar
        oscar_token, oscar_id = self.login(OSCAR_PIN)
        assert oscar_token, "Oscar login failed"
        
        # Login as Carlos to get his user_id
        carlos_token, carlos_id = self.login(CARLOS_PIN)
        assert carlos_token, "Carlos login failed"
        
        # Oscar tries to revoke Carlos's session
        response = requests.post(
            f"{BASE_URL}/api/auth/revoke-session/{carlos_id}",
            headers={"Authorization": f"Bearer {oscar_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("SUCCESS: Non-admin cannot revoke sessions (403)")
    
    def test_12_auto_logout_config_validation(self):
        """Test auto-logout config validation"""
        admin_token, _ = self.login(ADMIN_PIN)
        assert admin_token, "Admin login failed"
        
        # Test invalid timeout (too low)
        response = requests.put(
            f"{BASE_URL}/api/auth/auto-logout-config",
            json={"enabled": True, "timeout_minutes": 0},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 400, f"Expected 400 for timeout=0, got {response.status_code}"
        print("SUCCESS: Rejects timeout_minutes=0")
        
        # Test invalid timeout (too high)
        response = requests.put(
            f"{BASE_URL}/api/auth/auto-logout-config",
            json={"enabled": True, "timeout_minutes": 1000},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 400, f"Expected 400 for timeout=1000, got {response.status_code}"
        print("SUCCESS: Rejects timeout_minutes=1000 (max is 480)")
    
    def test_13_revoke_nonexistent_session_returns_404(self):
        """Test revoking non-existent session returns 404"""
        admin_token, _ = self.login(ADMIN_PIN)
        assert admin_token, "Admin login failed"
        
        response = requests.post(
            f"{BASE_URL}/api/auth/revoke-session/nonexistent-user-id",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: Revoking non-existent session returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
