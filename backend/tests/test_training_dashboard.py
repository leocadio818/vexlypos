"""
Training Dashboard Stats API Tests
Tests for GET /api/users/{user_id}/training-stats endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test user IDs from seed data
ADMIN_ID = "6e81e037-e495-45b2-af64-e0ff8ba39396"
ADMIN_PIN = "10000"
CARLOS_ID = "79f86d60-4e61-4890-b467-4f14097c57a4"
CARLOS_PIN = "1234"


class TestTrainingDashboardStats:
    """Training stats endpoint tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert response.status_code == 200, "Admin login failed"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def carlos_token(self):
        """Get Carlos auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": CARLOS_PIN})
        assert response.status_code == 200, "Carlos login failed"
        return response.json()["token"]
    
    def test_01_training_stats_endpoint_exists(self, admin_token):
        """Test that training stats endpoint exists and returns valid response"""
        response = requests.get(
            f"{BASE_URL}/api/users/{CARLOS_ID}/training-stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "user_id" in data
        assert "orders_count" in data
        assert "bills_paid" in data
        assert "total_amount_practiced" in data
        print(f"PASS: Training stats endpoint returns valid structure")
    
    def test_02_carlos_has_training_data(self, admin_token):
        """Carlos (training_mode=true) should have training history with orders > 0"""
        response = requests.get(
            f"{BASE_URL}/api/users/{CARLOS_ID}/training-stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Carlos should have training activity
        assert data["user_id"] == CARLOS_ID
        assert data["user_name"] == "Carlos"
        assert data["training_active"] == True, "Carlos should have training_mode active"
        assert data["orders_count"] > 0, f"Carlos should have training orders, got {data['orders_count']}"
        assert data["bills_paid"] >= 0, "bills_paid should be >= 0"
        assert isinstance(data["total_amount_practiced"], (int, float))
        print(f"PASS: Carlos has {data['orders_count']} training orders, {data['bills_paid']} bills paid, ${data['total_amount_practiced']} total")
    
    def test_03_carlos_training_stats_fields(self, admin_token):
        """Verify all expected fields in Carlos training stats"""
        response = requests.get(
            f"{BASE_URL}/api/users/{CARLOS_ID}/training-stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Required fields
        required_fields = [
            "user_id", "user_name", "training_active",
            "orders_count", "items_practiced", "bills_count",
            "bills_paid", "total_amount_practiced",
            "first_activity", "last_activity", "recent_activity"
        ]
        
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        # recent_activity should be a list
        assert isinstance(data["recent_activity"], list)
        print(f"PASS: All required fields present")
    
    def test_04_admin_has_no_training_data(self, admin_token):
        """Admin (training_mode=false) should have zero training stats"""
        response = requests.get(
            f"{BASE_URL}/api/users/{ADMIN_ID}/training-stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["user_id"] == ADMIN_ID
        assert data["user_name"] == "Admin"
        assert data["training_active"] == False, "Admin should NOT have training_mode"
        assert data["orders_count"] == 0, "Admin should have 0 training orders"
        assert data["bills_paid"] == 0, "Admin should have 0 bills paid"
        assert data["total_amount_practiced"] == 0, "Admin should have 0 amount"
        assert data["recent_activity"] == [], "Admin should have empty recent_activity"
        print(f"PASS: Admin has no training data (all zeros)")
    
    def test_05_training_stats_requires_auth(self):
        """Training stats endpoint should require authentication"""
        response = requests.get(f"{BASE_URL}/api/users/{CARLOS_ID}/training-stats")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print(f"PASS: Endpoint requires authentication")
    
    def test_06_nonexistent_user_returns_404(self, admin_token):
        """Non-existent user ID should return 404"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = requests.get(
            f"{BASE_URL}/api/users/{fake_id}/training-stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404, f"Expected 404 for non-existent user, got {response.status_code}"
        print(f"PASS: Returns 404 for non-existent user")
    
    def test_07_carlos_recent_activity_structure(self, admin_token):
        """Verify recent_activity items have correct structure"""
        response = requests.get(
            f"{BASE_URL}/api/users/{CARLOS_ID}/training-stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        if data["recent_activity"]:
            activity = data["recent_activity"][0]
            assert "id" in activity, "recent_activity item missing 'id'"
            assert "total" in activity, "recent_activity item missing 'total'"
            assert "status" in activity, "recent_activity item missing 'status'"
            assert "date" in activity, "recent_activity item missing 'date'"
            assert "items_count" in activity, "recent_activity item missing 'items_count'"
            print(f"PASS: Recent activity structure verified with {len(data['recent_activity'])} items")
        else:
            print(f"INFO: No recent activity to verify structure")


class TestUserTrainingModeFlag:
    """Test user training_mode flag in login response"""
    
    def test_01_carlos_login_has_training_mode_true(self):
        """Carlos login response should have training_mode: true"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": CARLOS_PIN})
        assert response.status_code == 200
        data = response.json()
        
        assert data["user"]["training_mode"] == True
        print(f"PASS: Carlos has training_mode=true in login response")
    
    def test_02_admin_login_has_training_mode_false(self):
        """Admin login response should have training_mode: false"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert response.status_code == 200
        data = response.json()
        
        assert data["user"]["training_mode"] == False
        print(f"PASS: Admin has training_mode=false in login response")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
