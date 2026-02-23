"""
Test Business Days (Jornadas de Trabajo) Feature

Tests:
1. GET /api/business-days/check - Check if there's an open business day
2. POST /api/business-days/open - Open a new business day with admin PIN
3. POST /api/business-days/close - Close the current business day
4. POST /api/business-days/authorize - Verify PIN authorization
5. GET /api/business-days/history - Get business days history
6. POST /api/bills/{id}/pay - Should fail with 403 if no business day is open
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from request
ADMIN_PIN = "10000"
CASHIER_PIN = "4321"


class TestBusinessDaysAuth:
    """Test authentication/authorization for business days"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        # Login as admin
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        self.token = resp.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_authorize_admin_pin(self):
        """Test POST /api/business-days/authorize with admin PIN"""
        resp = requests.post(
            f"{BASE_URL}/api/business-days/authorize",
            json={"pin": ADMIN_PIN, "action": "open"},
            headers=self.headers
        )
        assert resp.status_code == 200, f"Authorization failed: {resp.text}"
        data = resp.json()
        assert data["authorized"] == True
        assert "authorizer_name" in data
        assert data["authorizer_role"] in ["admin", "manager"]
        print(f"✓ Admin PIN authorized: {data['authorizer_name']} ({data['authorizer_role']})")
    
    def test_authorize_invalid_pin(self):
        """Test authorization with invalid PIN"""
        resp = requests.post(
            f"{BASE_URL}/api/business-days/authorize",
            json={"pin": "9999", "action": "open"},
            headers=self.headers
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"
        print("✓ Invalid PIN correctly rejected with 401")


class TestBusinessDaysOperations:
    """Test business day open/close operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert resp.status_code == 200
        self.token = resp.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_check_business_day_status(self):
        """Test GET /api/business-days/check endpoint"""
        resp = requests.get(f"{BASE_URL}/api/business-days/check", headers=self.headers)
        assert resp.status_code == 200, f"Check failed: {resp.text}"
        data = resp.json()
        assert "has_open_day" in data
        assert isinstance(data["has_open_day"], bool)
        if data["has_open_day"]:
            assert "business_date" in data
            assert "day_id" in data
        print(f"✓ Business day check: has_open_day={data['has_open_day']}")
        return data["has_open_day"]
    
    def test_get_current_business_day(self):
        """Test GET /api/business-days/current endpoint"""
        resp = requests.get(f"{BASE_URL}/api/business-days/current", headers=self.headers)
        assert resp.status_code == 200, f"Current failed: {resp.text}"
        data = resp.json()
        assert "has_open_day" in data
        if data["has_open_day"]:
            assert "business_day" in data
            assert "stats" in data
            bd = data["business_day"]
            assert "id" in bd
            assert "business_date" in bd
            assert "status" in bd
            assert bd["status"] == "open"
            print(f"✓ Current business day: {bd['business_date']} (ref: {bd.get('ref', 'N/A')})")
        else:
            assert data["business_day"] is None
            print("✓ No open business day")
    
    def test_get_business_days_history(self):
        """Test GET /api/business-days/history endpoint"""
        resp = requests.get(
            f"{BASE_URL}/api/business-days/history",
            params={"limit": 10},
            headers=self.headers
        )
        assert resp.status_code == 200, f"History failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ Business days history: {len(data)} records")
        return data


class TestBusinessDayOpenClose:
    """Test opening and closing business days"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert resp.status_code == 200
        self.token = resp.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_close_existing_then_open_new(self):
        """Test closing existing day (if open) then opening a new one"""
        # First check current status
        check_resp = requests.get(f"{BASE_URL}/api/business-days/check", headers=self.headers)
        assert check_resp.status_code == 200
        current_status = check_resp.json()
        
        # If there's an open day, close it first
        if current_status["has_open_day"]:
            print(f"  → Closing existing business day: {current_status['business_date']}")
            close_resp = requests.post(
                f"{BASE_URL}/api/business-days/close",
                json={
                    "authorizer_pin": ADMIN_PIN,
                    "closing_notes": "Test close - automated testing",
                    "force_close": True
                },
                headers=self.headers
            )
            assert close_resp.status_code == 200, f"Close failed: {close_resp.text}"
            close_data = close_resp.json()
            assert close_data["ok"] == True
            print(f"  ✓ Closed business day successfully")
            
            # Verify it's closed
            time.sleep(0.5)
            verify_resp = requests.get(f"{BASE_URL}/api/business-days/check", headers=self.headers)
            assert verify_resp.status_code == 200
            assert verify_resp.json()["has_open_day"] == False
            print(f"  ✓ Verified business day is closed")
        
        # Now open a new business day
        today = time.strftime("%Y-%m-%d")
        open_resp = requests.post(
            f"{BASE_URL}/api/business-days/open",
            json={
                "business_date": today,
                "authorizer_pin": ADMIN_PIN,
                "opening_notes": "Test open - automated testing"
            },
            headers=self.headers
        )
        assert open_resp.status_code == 200, f"Open failed: {open_resp.text}"
        open_data = open_resp.json()
        assert open_data["ok"] == True
        assert "business_day" in open_data
        bd = open_data["business_day"]
        assert bd["business_date"] == today
        assert bd["status"] == "open"
        print(f"✓ Opened new business day: {bd['business_date']} (ref: {bd.get('ref', 'N/A')})")
        
        return bd["id"]


class TestPaymentWithBusinessDay:
    """Test that payment is blocked when no business day is open"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert resp.status_code == 200
        self.token = resp.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_payment_blocked_when_no_business_day(self):
        """Test that POST /api/bills/{id}/pay returns 403 when no business day is open"""
        # First, close any existing business day
        check_resp = requests.get(f"{BASE_URL}/api/business-days/check", headers=self.headers)
        if check_resp.json().get("has_open_day"):
            requests.post(
                f"{BASE_URL}/api/business-days/close",
                json={"authorizer_pin": ADMIN_PIN, "force_close": True},
                headers=self.headers
            )
            time.sleep(0.5)
        
        # Verify no business day is open
        verify_resp = requests.get(f"{BASE_URL}/api/business-days/check", headers=self.headers)
        assert verify_resp.json()["has_open_day"] == False, "Business day should be closed"
        
        # Try to pay a bill (use a dummy bill ID)
        pay_resp = requests.post(
            f"{BASE_URL}/api/bills/dummy-bill-id/pay",
            json={"payment_method": "cash"},
            headers=self.headers
        )
        # Could be 404 (bill not found) or 403 (no business day)
        # The business day check should happen before bill lookup if implemented correctly
        # But if it checks bill first, we get 404
        # Based on the code, it checks bill first then business day
        # So we need an existing bill to test this properly
        
        # Let's get an existing bill
        bills_resp = requests.get(f"{BASE_URL}/api/bills", headers=self.headers)
        assert bills_resp.status_code == 200
        bills = bills_resp.json()
        
        open_bills = [b for b in bills if b.get("status") == "open"]
        if open_bills:
            bill_id = open_bills[0]["id"]
            print(f"  → Testing with existing open bill: {bill_id}")
            pay_resp = requests.post(
                f"{BASE_URL}/api/bills/{bill_id}/pay",
                json={
                    "payment_method": "cash",
                    "payment_method_id": "",
                    "tip_percentage": 0
                },
                headers=self.headers
            )
            assert pay_resp.status_code == 403, f"Expected 403, got {pay_resp.status_code}: {pay_resp.text}"
            error_detail = pay_resp.json().get("detail", "")
            assert "jornada" in error_detail.lower() or "day" in error_detail.lower(), f"Error message should mention business day: {error_detail}"
            print(f"✓ Payment correctly blocked: {error_detail}")
        else:
            print("⚠ No open bills to test payment blocking, skipping...")
            pytest.skip("No open bills available to test payment blocking")
        
        # Re-open business day for subsequent tests
        today = time.strftime("%Y-%m-%d")
        requests.post(
            f"{BASE_URL}/api/business-days/open",
            json={"business_date": today, "authorizer_pin": ADMIN_PIN},
            headers=self.headers
        )
        print("  → Re-opened business day for subsequent tests")


class TestBusinessDayIndicatorAPI:
    """Test APIs used by the UI indicator in sidebar"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert resp.status_code == 200
        self.token = resp.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_check_endpoint_for_sidebar(self):
        """Test /api/business-days/check returns data needed for sidebar indicator"""
        resp = requests.get(f"{BASE_URL}/api/business-days/check", headers=self.headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # Required fields for sidebar
        assert "has_open_day" in data
        assert "business_date" in data
        assert "day_id" in data
        assert "opened_at" in data
        
        print(f"✓ Check endpoint returns all required fields for sidebar")
        print(f"  has_open_day: {data['has_open_day']}")
        print(f"  business_date: {data['business_date']}")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
