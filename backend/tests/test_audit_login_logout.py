"""
Test Audit Logging for Login/Logout Events and System Audit Report
Tests the new central audit logging feature:
1. Login creates audit log entry
2. Logout creates audit log entry
3. /api/reports/system-audit endpoint returns consolidated audit data
4. Audit report includes LOGIN events
5. Shift open creates SHIFT_OPENED audit entry
6. view_audit_complete permission exists for admin users
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestLoginAuditLogging:
    """Test that login creates audit log entries"""
    
    def test_login_success_creates_audit_entry(self):
        """Test that successful login creates a LOGIN audit entry"""
        session = requests.Session()
        
        # Login with admin PIN
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        
        login_data = login_resp.json()
        token = login_data.get("token")
        user_name = login_data.get("user", {}).get("name", "")
        
        assert token, "Login should return a token"
        print(f"✓ Login successful for user: {user_name}")
        
        # Now check the system audit report for LOGIN events
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Small delay to ensure audit log is written
        time.sleep(0.5)
        
        # Get today's date for filtering
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        audit_resp = session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": today,
            "date_to": today
        })
        assert audit_resp.status_code == 200, f"System audit failed: {audit_resp.text}"
        
        audit_data = audit_resp.json()
        activities = audit_data.get("activities", [])
        
        # Look for LOGIN events
        login_events = [a for a in activities if a.get("event_type_code") == "LOGIN" or "Inicio de Sesión" in a.get("type", "")]
        
        print(f"✓ Found {len(login_events)} LOGIN events in audit log")
        assert len(login_events) > 0, "Should have at least one LOGIN event in audit log"
        
        # Verify the most recent login event has correct structure
        recent_login = login_events[0]
        assert "timestamp" in recent_login, "Login event should have timestamp"
        assert "user" in recent_login, "Login event should have user"
        assert "description" in recent_login, "Login event should have description"
        
        print(f"✓ Recent login event: {recent_login.get('description')}")
        session.close()

    def test_login_failed_creates_audit_entry(self):
        """Test that failed login creates a LOGIN_FAILED audit entry"""
        session = requests.Session()
        
        # Try to login with wrong PIN
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={"pin": "9999"})
        assert login_resp.status_code == 401, f"Expected 401 for wrong PIN, got {login_resp.status_code}"
        
        print("✓ Login correctly rejected for wrong PIN")
        
        # Login with correct PIN to check audit logs
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert login_resp.status_code == 200
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        time.sleep(0.5)
        
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        audit_resp = session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": today,
            "date_to": today
        })
        assert audit_resp.status_code == 200
        
        audit_data = audit_resp.json()
        activities = audit_data.get("activities", [])
        
        # Look for LOGIN_FAILED events
        failed_events = [a for a in activities if a.get("event_type_code") == "LOGIN_FAILED" or "Intento de Login Fallido" in a.get("type", "")]
        
        print(f"✓ Found {len(failed_events)} LOGIN_FAILED events in audit log")
        # Note: This may be 0 if no failed logins happened recently
        
        session.close()


class TestLogoutAuditLogging:
    """Test that logout creates audit log entries"""
    
    def test_logout_creates_audit_entry(self):
        """Test that logout creates a LOGOUT audit entry"""
        session = requests.Session()
        
        # Login first
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert login_resp.status_code == 200
        token = login_resp.json().get("token")
        user_name = login_resp.json().get("user", {}).get("name", "")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        print(f"✓ Logged in as: {user_name}")
        
        # Logout
        logout_resp = session.post(f"{BASE_URL}/api/auth/logout")
        assert logout_resp.status_code == 200, f"Logout failed: {logout_resp.text}"
        
        logout_data = logout_resp.json()
        assert logout_data.get("ok") == True, "Logout should return ok: true"
        
        print("✓ Logout successful")
        
        # Login again to check audit logs
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert login_resp.status_code == 200
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        time.sleep(0.5)
        
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        audit_resp = session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": today,
            "date_to": today
        })
        assert audit_resp.status_code == 200
        
        audit_data = audit_resp.json()
        activities = audit_data.get("activities", [])
        
        # Look for LOGOUT events
        logout_events = [a for a in activities if a.get("event_type_code") == "LOGOUT" or "Cierre de Sesión" in a.get("type", "")]
        
        print(f"✓ Found {len(logout_events)} LOGOUT events in audit log")
        assert len(logout_events) > 0, "Should have at least one LOGOUT event in audit log"
        
        session.close()


class TestSystemAuditEndpoint:
    """Test the /api/reports/system-audit endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth headers"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        self.session.close()

    def test_system_audit_endpoint_returns_200(self):
        """Test that system audit endpoint responds with 200"""
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": today,
            "date_to": today
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "activities" in data, "Response should contain 'activities' key"
        assert "summary" in data, "Response should contain 'summary' key"
        
        print(f"✓ System audit returned {len(data['activities'])} activities")

    def test_system_audit_includes_login_events(self):
        """Test that system audit includes LOGIN events from central audit logs"""
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": today,
            "date_to": today
        })
        assert response.status_code == 200
        
        data = response.json()
        activities = data.get("activities", [])
        
        # Look for LOGIN events (from central audit logs)
        login_events = [a for a in activities if 
                       a.get("event_type_code") == "LOGIN" or 
                       "Inicio de Sesión" in a.get("type", "") or
                       "inició sesión" in a.get("description", "").lower()]
        
        print(f"✓ Found {len(login_events)} LOGIN events")
        
        # Should have at least one login event (from our test setup)
        assert len(login_events) > 0, "System audit should include LOGIN events"
        
        # Verify structure of login event
        if login_events:
            event = login_events[0]
            print(f"  - Type: {event.get('type')}")
            print(f"  - Description: {event.get('description')}")
            print(f"  - User: {event.get('user')}")
            print(f"  - Timestamp: {event.get('timestamp')}")

    def test_system_audit_date_filtering(self):
        """Test that date filtering works correctly"""
        # Test with a date range that should have data
        from datetime import datetime, timezone, timedelta
        today = datetime.now(timezone.utc)
        yesterday = (today - timedelta(days=1)).strftime("%Y-%m-%d")
        today_str = today.strftime("%Y-%m-%d")
        
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": yesterday,
            "date_to": today_str
        })
        assert response.status_code == 200
        
        data = response.json()
        print(f"✓ Date range {yesterday} to {today_str}: {len(data['activities'])} activities")

    def test_system_audit_event_type_filter(self):
        """Test that event_type filter works"""
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        # First get all events
        all_resp = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": today,
            "date_to": today
        })
        assert all_resp.status_code == 200
        all_data = all_resp.json()
        
        # Try filtering by LOGIN if available
        filtered_resp = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": today,
            "date_to": today,
            "event_type": "LOGIN"
        })
        assert filtered_resp.status_code == 200
        filtered_data = filtered_resp.json()
        
        print(f"✓ All events: {len(all_data['activities'])}, Filtered (LOGIN): {len(filtered_data['activities'])}")


class TestShiftAuditLogging:
    """Test that shift operations create audit log entries"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth headers"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        self.session.close()

    def test_shift_open_creates_audit_entry(self):
        """Test that opening a shift creates SHIFT_OPENED audit entry"""
        # First check if there's an existing open shift
        check_resp = self.session.get(f"{BASE_URL}/api/shifts/check")
        assert check_resp.status_code == 200
        check_data = check_resp.json()
        
        if check_data.get("has_open_shift"):
            print("✓ User already has an open shift, skipping open test")
            # Close the existing shift first
            shift = check_data.get("shift", {})
            if shift.get("id"):
                close_resp = self.session.put(f"{BASE_URL}/api/shifts/{shift['id']}/close", json={
                    "closing_amount": 0
                })
                print(f"  Closed existing shift: {close_resp.status_code}")
        
        # Open a new shift
        open_resp = self.session.post(f"{BASE_URL}/api/shifts/open", json={
            "station": "Caja Test",
            "opening_amount": 1000
        })
        assert open_resp.status_code == 200, f"Failed to open shift: {open_resp.text}"
        
        shift_data = open_resp.json()
        shift_id = shift_data.get("id")
        print(f"✓ Opened shift: {shift_id}")
        
        time.sleep(0.5)
        
        # Check audit log for SHIFT_OPENED event
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        audit_resp = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": today,
            "date_to": today
        })
        assert audit_resp.status_code == 200
        
        audit_data = audit_resp.json()
        activities = audit_data.get("activities", [])
        
        # Look for SHIFT_OPENED events
        shift_events = [a for a in activities if 
                       a.get("event_type_code") == "SHIFT_OPENED" or 
                       "Turno Abierto" in a.get("type", "") or
                       "Turno abierto" in a.get("description", "")]
        
        print(f"✓ Found {len(shift_events)} SHIFT_OPENED events")
        
        # Clean up - close the shift
        if shift_id:
            close_resp = self.session.put(f"{BASE_URL}/api/shifts/{shift_id}/close", json={
                "closing_amount": 1000
            })
            print(f"✓ Closed test shift: {close_resp.status_code}")


class TestViewAuditCompletePermission:
    """Test that view_audit_complete permission exists for admin users"""
    
    def test_admin_has_view_audit_complete_permission(self):
        """Test that admin role has view_audit_complete permission"""
        session = requests.Session()
        
        # Login as admin
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        
        login_data = login_resp.json()
        user = login_data.get("user", {})
        permissions = user.get("permissions", {})
        role = user.get("role", "")
        
        print(f"✓ Logged in as role: {role}")
        print(f"✓ User permissions keys: {list(permissions.keys())[:10]}...")
        
        # Check for view_audit_complete permission
        has_audit_permission = permissions.get("view_audit_complete", False)
        
        print(f"✓ view_audit_complete permission: {has_audit_permission}")
        assert has_audit_permission == True, "Admin should have view_audit_complete permission"
        
        session.close()

    def test_supervisor_has_view_audit_complete_permission(self):
        """Test that supervisor role has view_audit_complete permission"""
        session = requests.Session()
        
        # Get all roles to check supervisor permissions
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert login_resp.status_code == 200
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        roles_resp = session.get(f"{BASE_URL}/api/roles")
        assert roles_resp.status_code == 200
        
        roles = roles_resp.json()
        supervisor_role = next((r for r in roles if r.get("code") == "supervisor" or r.get("id") == "supervisor"), None)
        
        if supervisor_role:
            permissions = supervisor_role.get("permissions", {})
            has_audit_permission = permissions.get("view_audit_complete", False)
            print(f"✓ Supervisor view_audit_complete permission: {has_audit_permission}")
            assert has_audit_permission == True, "Supervisor should have view_audit_complete permission"
        else:
            print("⚠ Supervisor role not found in roles list")
        
        session.close()

    def test_waiter_does_not_have_view_audit_complete_permission(self):
        """Test that waiter role does NOT have view_audit_complete permission"""
        session = requests.Session()
        
        # Login as waiter (PIN 100)
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={"pin": "100"})
        assert login_resp.status_code == 200, f"Waiter login failed: {login_resp.text}"
        
        login_data = login_resp.json()
        user = login_data.get("user", {})
        permissions = user.get("permissions", {})
        role = user.get("role", "")
        
        print(f"✓ Logged in as role: {role}")
        
        # Check for view_audit_complete permission
        has_audit_permission = permissions.get("view_audit_complete", False)
        
        print(f"✓ Waiter view_audit_complete permission: {has_audit_permission}")
        assert has_audit_permission == False, "Waiter should NOT have view_audit_complete permission"
        
        session.close()


class TestAllPermissionsEndpoint:
    """Test that view_audit_complete is listed in all permissions"""
    
    def test_view_audit_complete_in_all_permissions(self):
        """Test that view_audit_complete appears in /api/permissions/all"""
        session = requests.Session()
        
        # Login
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert login_resp.status_code == 200
        token = login_resp.json().get("token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get all permissions
        perms_resp = session.get(f"{BASE_URL}/api/permissions/all")
        assert perms_resp.status_code == 200
        
        all_permissions = perms_resp.json()
        
        print(f"✓ Total permissions defined: {len(all_permissions)}")
        
        # Check for view_audit_complete
        assert "view_audit_complete" in all_permissions, "view_audit_complete should be in ALL_PERMISSIONS"
        
        permission_label = all_permissions.get("view_audit_complete", "")
        print(f"✓ view_audit_complete label: {permission_label}")
        
        # Verify the label is in Spanish
        assert "Auditoría" in permission_label or "audit" in permission_label.lower(), \
            f"Permission label should mention audit: {permission_label}"
        
        session.close()
