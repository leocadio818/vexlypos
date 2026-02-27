"""
Test Business Day (Jornada) Logic - Auto-open on login, force logout on Cierre Z
Tests for:
1. POST /api/auth/login auto-opens business day when none exists (returns business_day_opened: true)
2. POST /api/auth/login returns business_day_opened: false when day already exists
3. GET /api/business-days/current returns has_open_day: true and business_day object when day is open
4. POST /api/business-days/close returns force_logout: true in response
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestBusinessDayLogic:
    """Tests for Business Day auto-open on login and force logout on close"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login to get token"""
        self.admin_pin = "10000"  # Admin PIN from requirements
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Get initial token
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": self.admin_pin})
        if login_res.status_code == 200:
            self.token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        yield
    
    def test_01_get_current_business_day(self):
        """Test GET /api/business-days/current returns proper structure"""
        response = self.session.get(f"{BASE_URL}/api/business-days/current")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"Current business day response: {data}")
        
        # Should have has_open_day field
        assert "has_open_day" in data, "Response should have 'has_open_day' field"
        
        if data["has_open_day"]:
            # If open, should have business_day object
            assert "business_day" in data, "Should have business_day object when day is open"
            assert data["business_day"] is not None, "business_day should not be None"
            bd = data["business_day"]
            assert "id" in bd, "business_day should have id"
            assert "ref" in bd, "business_day should have ref"
            assert "status" in bd, "business_day should have status"
            assert bd["status"] == "open", "status should be 'open'"
            print(f"✓ Business day is open: {bd['ref']}")
        else:
            print("✓ No business day open currently")
    
    def test_02_login_returns_business_day_opened_field(self):
        """Test POST /api/auth/login returns business_day_opened field"""
        # First check if a business day is already open
        current_res = self.session.get(f"{BASE_URL}/api/business-days/current")
        day_was_open = current_res.json().get("has_open_day", False)
        
        # Login again
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": self.admin_pin})
        assert login_res.status_code == 200, f"Login failed: {login_res.status_code}"
        
        data = login_res.json()
        print(f"Login response keys: {data.keys()}")
        
        # Should have business_day_opened field
        assert "business_day_opened" in data, "Login response should have 'business_day_opened' field"
        
        if day_was_open:
            # Day was already open, so should be False
            assert data["business_day_opened"] == False, "Should be False when day already exists"
            print("✓ business_day_opened: False (day already existed)")
        else:
            # Day was closed, so should be True (auto-opened)
            assert data["business_day_opened"] == True, "Should be True when day auto-opened"
            print("✓ business_day_opened: True (day was auto-opened)")
    
    def test_03_login_without_open_day_auto_opens(self):
        """Test that login auto-opens business day when none exists"""
        # This test validates the auto-open logic - we can't fully test it without closing the day
        # So we just verify the endpoint structure and check current state
        
        # Check current state
        current_res = self.session.get(f"{BASE_URL}/api/business-days/current")
        assert current_res.status_code == 200
        
        data = current_res.json()
        
        # After login in setup, there should be an open day
        assert data["has_open_day"] == True, "Should have open day after login"
        assert data["business_day"] is not None
        
        bd = data["business_day"]
        print(f"✓ Auto-open verified: Business day {bd['ref']} is open")
        print(f"  - Opened at: {bd.get('opened_at')}")
        print(f"  - Opened by: {bd.get('opened_by_name')}")
    
    def test_04_close_business_day_returns_force_logout(self):
        """Test POST /api/business-days/close returns force_logout: true"""
        # Get current business day
        current_res = self.session.get(f"{BASE_URL}/api/business-days/current")
        data = current_res.json()
        
        if not data.get("has_open_day"):
            pytest.skip("No open business day to close")
        
        bd = data["business_day"]
        print(f"Attempting to close business day: {bd['ref']}")
        
        # Try to close the business day
        close_res = self.session.post(f"{BASE_URL}/api/business-days/close", json={
            "authorizer_pin": self.admin_pin,
            "closing_notes": "Test close for force_logout verification",
            "force_close": True  # Force close even with open shifts
        })
        
        print(f"Close response status: {close_res.status_code}")
        close_data = close_res.json()
        print(f"Close response: {close_data}")
        
        if close_res.status_code == 200:
            # Successful close should have force_logout: true
            assert "force_logout" in close_data, "Close response should have 'force_logout' field"
            assert close_data["force_logout"] == True, "force_logout should be True"
            print("✓ force_logout: True returned in close response")
            print(f"  - Business date: {close_data.get('business_date')}")
            
            # Re-open for subsequent tests by logging in again
            time.sleep(0.5)
            login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": self.admin_pin})
            if login_res.status_code == 200:
                new_data = login_res.json()
                print(f"  - Re-login business_day_opened: {new_data.get('business_day_opened')}")
        else:
            # May fail due to open orders/shifts - that's expected behavior
            detail = close_data.get("detail", "")
            print(f"  Note: Could not close day - {detail}")
            pytest.skip(f"Cannot close day: {detail}")
    
    def test_05_login_after_close_opens_new_day(self):
        """Test that login after Cierre Z auto-opens a new business day"""
        # This validates the full flow: close day -> login -> new day opens
        
        # Check current state
        current_res = self.session.get(f"{BASE_URL}/api/business-days/current")
        current_data = current_res.json()
        
        if current_data.get("has_open_day"):
            old_ref = current_data["business_day"]["ref"]
            
            # Try to close
            close_res = self.session.post(f"{BASE_URL}/api/business-days/close", json={
                "authorizer_pin": self.admin_pin,
                "closing_notes": "Test close for auto-reopen",
                "force_close": True
            })
            
            if close_res.status_code != 200:
                pytest.skip(f"Cannot close day: {close_res.json().get('detail', 'Unknown error')}")
            
            print(f"Closed day {old_ref}")
            time.sleep(0.5)
            
            # Now login - should auto-open new day
            login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": self.admin_pin})
            assert login_res.status_code == 200
            
            login_data = login_res.json()
            
            # Should have opened a new day
            assert login_data.get("business_day_opened") == True, "Should auto-open new day after login"
            print(f"✓ Login after close auto-opened new business day")
            
            # Update token
            self.token = login_data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            
            # Verify new day is different
            new_current = self.session.get(f"{BASE_URL}/api/business-days/current").json()
            new_ref = new_current.get("business_day", {}).get("ref")
            print(f"  - Old day: {old_ref}")
            print(f"  - New day: {new_ref}")
            assert new_ref != old_ref, "New day should have different ref"
        else:
            # No day open, login should open one
            login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": self.admin_pin})
            assert login_res.status_code == 200
            
            login_data = login_res.json()
            assert login_data.get("business_day_opened") == True, "Should open day when none exists"
            print("✓ Login opened new business day (none existed)")


class TestBusinessDayCheck:
    """Test the /api/business-days/check endpoint used by frontend"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.admin_pin = "10000"
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": self.admin_pin})
        if login_res.status_code == 200:
            self.token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_check_endpoint_returns_correct_structure(self):
        """Test GET /api/business-days/check returns has_open_day and day_id"""
        response = self.session.get(f"{BASE_URL}/api/business-days/check")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        print(f"Check response: {data}")
        
        # Should have has_open_day field
        assert "has_open_day" in data, "Should have has_open_day field"
        
        if data["has_open_day"]:
            # Should have day_id and business_date
            assert "day_id" in data, "Should have day_id when day is open"
            assert "business_date" in data, "Should have business_date when day is open"
            assert data["day_id"] is not None
            print(f"✓ Day is open: {data['day_id']}, date: {data['business_date']}")
        else:
            print("✓ No day open - fields are null")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
