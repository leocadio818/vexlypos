"""
Dashboard Open Shifts Bug Fix Tests
Tests that the dashboard endpoint correctly returns open_shifts count from Supabase pos_sessions
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDashboardOpenShifts:
    """Tests for Dashboard open_shifts bug fix"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        login_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"pin": "10000"},
            headers={"Content-Type": "application/json"}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json().get("token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_dashboard_endpoint_returns_200(self):
        """Test that dashboard endpoint returns 200 OK"""
        response = requests.get(
            f"{BASE_URL}/api/reports/dashboard",
            headers=self.headers
        )
        assert response.status_code == 200, f"Dashboard returned {response.status_code}: {response.text}"
        print("Dashboard endpoint returns 200 OK - PASS")
    
    def test_dashboard_has_operations_section(self):
        """Test that dashboard response includes operations section"""
        response = requests.get(
            f"{BASE_URL}/api/reports/dashboard",
            headers=self.headers
        )
        data = response.json()
        
        assert "operations" in data, "Dashboard response missing 'operations' section"
        operations = data["operations"]
        
        # Verify all expected fields exist
        expected_fields = ["occupancy_pct", "occupied_tables", "total_tables", "active_orders", "open_shifts", "inventory_alerts"]
        for field in expected_fields:
            assert field in operations, f"Operations section missing '{field}' field"
        
        print(f"Operations section contains all expected fields - PASS")
        print(f"  - occupancy_pct: {operations['occupancy_pct']}")
        print(f"  - occupied_tables: {operations['occupied_tables']}")
        print(f"  - total_tables: {operations['total_tables']}")
        print(f"  - active_orders: {operations['active_orders']}")
        print(f"  - open_shifts: {operations['open_shifts']}")
        print(f"  - inventory_alerts: {operations['inventory_alerts']}")
    
    def test_open_shifts_is_non_negative_integer(self):
        """Test that open_shifts is a non-negative integer"""
        response = requests.get(
            f"{BASE_URL}/api/reports/dashboard",
            headers=self.headers
        )
        data = response.json()
        
        open_shifts = data["operations"]["open_shifts"]
        
        assert isinstance(open_shifts, int), f"open_shifts should be int, got {type(open_shifts)}"
        assert open_shifts >= 0, f"open_shifts should be >= 0, got {open_shifts}"
        
        print(f"open_shifts is valid non-negative integer: {open_shifts} - PASS")
    
    def test_dashboard_has_today_section(self):
        """Test that dashboard response includes today section with bills_count"""
        response = requests.get(
            f"{BASE_URL}/api/reports/dashboard",
            headers=self.headers
        )
        data = response.json()
        
        assert "today" in data, "Dashboard response missing 'today' section"
        today = data["today"]
        
        # Verify bills_count exists (used by Facturas card)
        assert "bills_count" in today, "Today section missing 'bills_count' field"
        assert isinstance(today["bills_count"], int), f"bills_count should be int, got {type(today['bills_count'])}"
        
        print(f"Today section has bills_count: {today['bills_count']} - PASS")
    
    def test_dashboard_has_jornada_section(self):
        """Test that dashboard response includes jornada (business day) section"""
        response = requests.get(
            f"{BASE_URL}/api/reports/dashboard",
            headers=self.headers
        )
        data = response.json()
        
        assert "jornada" in data, "Dashboard response missing 'jornada' section"
        jornada = data["jornada"]
        
        # Verify expected fields
        assert "date" in jornada, "Jornada section missing 'date' field"
        assert "status" in jornada, "Jornada section missing 'status' field"
        
        print(f"Jornada section: date={jornada['date']}, status={jornada['status']} - PASS")
    
    def test_dashboard_payment_breakdown_fields(self):
        """Test that dashboard has all payment breakdown fields (card, transfer, tips)"""
        response = requests.get(
            f"{BASE_URL}/api/reports/dashboard",
            headers=self.headers
        )
        data = response.json()
        
        today = data["today"]
        
        # Verify payment breakdown fields exist
        assert "card" in today, "Today section missing 'card' field"
        assert "transfer" in today, "Today section missing 'transfer' field"
        assert "tips" in today, "Today section missing 'tips' field"
        assert "cash" in today, "Today section missing 'cash' field"
        
        print(f"Payment breakdown fields present - PASS")
        print(f"  - card: {today['card']}")
        print(f"  - transfer: {today['transfer']}")
        print(f"  - tips: {today['tips']}")
        print(f"  - cash: {today['cash']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
