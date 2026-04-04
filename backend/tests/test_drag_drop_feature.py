"""
Test suite for Drag-and-Drop Card Reorganization Feature
Tests Dashboard API and role-based access
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://factura-consumo-app.preview.emergentagent.com')

class TestDashboardAPI:
    """Dashboard endpoint tests for drag-and-drop feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login as admin"""
        self.session = requests.Session()
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        self.session.close()
    
    def test_dashboard_endpoint_returns_200(self):
        """Dashboard endpoint should return 200"""
        response = self.session.get(f"{BASE_URL}/api/reports/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ Dashboard endpoint returns 200")
    
    def test_dashboard_has_operations_section(self):
        """Dashboard should have operations section with open_shifts"""
        response = self.session.get(f"{BASE_URL}/api/reports/dashboard")
        data = response.json()
        
        assert "operations" in data, "Missing 'operations' section"
        ops = data["operations"]
        
        required_fields = ["occupancy_pct", "occupied_tables", "total_tables", "active_orders", "open_shifts", "inventory_alerts"]
        for field in required_fields:
            assert field in ops, f"Missing field: {field}"
        
        print(f"✓ Operations section has all fields: {list(ops.keys())}")
    
    def test_open_shifts_is_valid(self):
        """open_shifts should be a non-negative integer"""
        response = self.session.get(f"{BASE_URL}/api/reports/dashboard")
        data = response.json()
        
        open_shifts = data["operations"]["open_shifts"]
        assert isinstance(open_shifts, int), f"open_shifts should be int, got {type(open_shifts)}"
        assert open_shifts >= 0, f"open_shifts should be >= 0, got {open_shifts}"
        
        print(f"✓ open_shifts = {open_shifts} (valid)")
    
    def test_dashboard_has_today_section(self):
        """Dashboard should have today section with bills_count"""
        response = self.session.get(f"{BASE_URL}/api/reports/dashboard")
        data = response.json()
        
        assert "today" in data, "Missing 'today' section"
        today = data["today"]
        
        assert "bills_count" in today, "Missing 'bills_count' in today section"
        assert isinstance(today["bills_count"], int), "bills_count should be int"
        
        print(f"✓ Today section has bills_count = {today['bills_count']}")
    
    def test_dashboard_has_payment_fields(self):
        """Dashboard should have payment breakdown fields"""
        response = self.session.get(f"{BASE_URL}/api/reports/dashboard")
        data = response.json()
        
        today = data.get("today", {})
        payment_fields = ["cash", "card", "transfer", "tips"]
        
        for field in payment_fields:
            assert field in today, f"Missing payment field: {field}"
        
        print(f"✓ Payment fields present: cash={today['cash']}, card={today['card']}, transfer={today['transfer']}, tips={today['tips']}")
    
    def test_dashboard_has_jornada_section(self):
        """Dashboard should have jornada section"""
        response = self.session.get(f"{BASE_URL}/api/reports/dashboard")
        data = response.json()
        
        assert "jornada" in data, "Missing 'jornada' section"
        jornada = data["jornada"]
        
        assert "date" in jornada, "Missing 'date' in jornada"
        assert "status" in jornada, "Missing 'status' in jornada"
        
        print(f"✓ Jornada: date={jornada['date']}, status={jornada['status']}")


class TestAuthRoles:
    """Test role-based access for edit mode"""
    
    def test_admin_role_has_edit_access(self):
        """Admin should have role=admin or role_level >= 90"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert login_res.status_code == 200
        
        data = login_res.json()
        user = data.get("user", {})
        role = user.get("role", "")
        
        # Admin should be able to enter edit mode (role=admin OR role=owner)
        is_admin = role in ["admin", "owner"]
        assert is_admin, f"Admin should have edit access: role={role}"
        
        print(f"✓ Admin user: role={role}, can_edit={is_admin}")
        session.close()
    
    def test_cajero_role_no_edit_access(self):
        """Cajero should NOT have edit access (role != admin/owner)"""
        session = requests.Session()
        login_res = session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1111"})
        assert login_res.status_code == 200
        
        data = login_res.json()
        user = data.get("user", {})
        role = user.get("role", "")
        
        # Cajero should NOT be able to enter edit mode
        is_admin = role in ["admin", "owner"]
        assert not is_admin, f"Cajero should NOT have edit access: role={role}"
        
        print(f"✓ Cajero user: role={role}, can_edit={is_admin}")
        session.close()


class TestHealthEndpoint:
    """Basic health check"""
    
    def test_health_endpoint(self):
        """Health endpoint should return ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") == True
        print("✓ Health endpoint returns ok=true")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
