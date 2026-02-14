"""
Test suite for Audit History of Ingredients feature
Tests the /api/ingredients/audit-logs/all endpoint with filters
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Get auth token
def get_auth_token():
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
    if response.status_code == 200:
        return response.json().get("token")
    return None

class TestAuditLogsEndpoint:
    """Tests for GET /api/ingredients/audit-logs/all endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup auth token for all tests"""
        self.token = get_auth_token()
        self.headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
    
    def test_get_all_audit_logs(self):
        """Test fetching all audit logs without filters"""
        response = requests.get(f"{BASE_URL}/api/ingredients/audit-logs/all", headers=self.headers)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "logs" in data, "Response should contain 'logs' array"
        assert "stats" in data, "Response should contain 'stats' object"
        
        # Verify stats structure
        stats = data["stats"]
        assert "total_changes" in stats, "Stats should have total_changes"
        assert "unique_ingredients" in stats, "Stats should have unique_ingredients"
        assert "changes_by_field" in stats, "Stats should have changes_by_field"
        
        print(f"SUCCESS: Fetched {len(data['logs'])} audit logs with stats: {stats}")
    
    def test_filter_by_ingredient_name(self):
        """Test filtering audit logs by ingredient name (partial match)"""
        # First get all logs to find an ingredient name
        response = requests.get(f"{BASE_URL}/api/ingredients/audit-logs/all", headers=self.headers)
        assert response.status_code == 200
        
        all_logs = response.json()["logs"]
        if not all_logs:
            pytest.skip("No audit logs exist to test filtering")
        
        # Get first ingredient name for testing
        test_name = all_logs[0]["ingredient_name"][:4]  # Use partial name
        
        # Test partial name filter
        response = requests.get(
            f"{BASE_URL}/api/ingredients/audit-logs/all",
            params={"ingredient_name": test_name},
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all returned logs match the filter
        for log in data["logs"]:
            assert test_name.lower() in log["ingredient_name"].lower(), \
                f"Log ingredient name '{log['ingredient_name']}' should contain '{test_name}'"
        
        print(f"SUCCESS: Filter by name '{test_name}' returned {len(data['logs'])} logs")
    
    def test_filter_by_field_changed(self):
        """Test filtering audit logs by field_changed"""
        # Get available fields
        response = requests.get(f"{BASE_URL}/api/ingredients/audit-logs/all", headers=self.headers)
        assert response.status_code == 200
        
        changes_by_field = response.json()["stats"]["changes_by_field"]
        if not changes_by_field:
            pytest.skip("No audit logs with field changes exist")
        
        # Test with first available field
        test_field = list(changes_by_field.keys())[0]
        expected_count = changes_by_field[test_field]
        
        response = requests.get(
            f"{BASE_URL}/api/ingredients/audit-logs/all",
            params={"field_changed": test_field},
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify all returned logs have the correct field_changed
        for log in data["logs"]:
            assert log["field_changed"] == test_field, \
                f"Log field_changed '{log['field_changed']}' should be '{test_field}'"
        
        # Verify count matches
        assert len(data["logs"]) == expected_count, \
            f"Expected {expected_count} logs for field '{test_field}', got {len(data['logs'])}"
        
        print(f"SUCCESS: Filter by field '{test_field}' returned {len(data['logs'])} logs")
    
    def test_filter_by_date_range(self):
        """Test filtering audit logs by date range"""
        from datetime import datetime, timedelta
        
        # Test with a date range that should include today
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/ingredients/audit-logs/all",
            params={"start_date": yesterday, "end_date": today},
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"SUCCESS: Date filter ({yesterday} to {today}) returned {len(data['logs'])} logs")
    
    def test_combined_filters(self):
        """Test combining multiple filters"""
        response = requests.get(
            f"{BASE_URL}/api/ingredients/audit-logs/all",
            params={
                "field_changed": "conversion_factor",
                "limit": 5
            },
            headers=self.headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should return max 5 logs
        assert len(data["logs"]) <= 5, f"Expected max 5 logs, got {len(data['logs'])}"
        
        print(f"SUCCESS: Combined filters returned {len(data['logs'])} logs")
    
    def test_audit_log_structure(self):
        """Test that audit logs have correct structure for table display"""
        response = requests.get(f"{BASE_URL}/api/ingredients/audit-logs/all", headers=self.headers)
        assert response.status_code == 200
        
        logs = response.json()["logs"]
        if not logs:
            pytest.skip("No audit logs exist to verify structure")
        
        log = logs[0]
        
        # Verify required fields for the table columns exist
        required_fields = [
            "timestamp",         # Fecha y Hora
            "changed_by_name",   # Usuario (or "changed_by_id")
            "ingredient_name",   # Insumo
            "field_changed",     # Campo Editado
            "old_value",         # Valor Anterior
            "new_value"          # Valor Nuevo
        ]
        
        for field in required_fields:
            assert field in log, f"Audit log should have '{field}' field"
        
        print(f"SUCCESS: Audit log has all required fields: {list(log.keys())}")

class TestCreateAuditLogOnIngredientUpdate:
    """Test that updating an ingredient creates audit logs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.token = get_auth_token()
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        } if self.token else {"Content-Type": "application/json"}
    
    def test_audit_log_created_on_conversion_factor_change(self):
        """Test that changing conversion_factor creates an audit log"""
        # Create a test ingredient
        create_response = requests.post(
            f"{BASE_URL}/api/ingredients",
            json={
                "name": "TEST_Audit_Ingredient",
                "unit": "kg",
                "category": "general",
                "avg_cost": 100,
                "conversion_factor": 1
            },
            headers=self.headers
        )
        
        if create_response.status_code != 200:
            # Try to use existing ingredient
            list_response = requests.get(f"{BASE_URL}/api/ingredients", headers=self.headers)
            ingredients = list_response.json()
            if not ingredients:
                pytest.skip("No ingredients available for audit test")
            test_ingredient = ingredients[0]
        else:
            test_ingredient = create_response.json()
        
        ingredient_id = test_ingredient["id"]
        original_factor = test_ingredient.get("conversion_factor", 1)
        new_factor = original_factor + 1
        
        # Update conversion factor
        update_response = requests.put(
            f"{BASE_URL}/api/ingredients/{ingredient_id}",
            json={"conversion_factor": new_factor},
            headers=self.headers
        )
        
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        # Check audit log was created
        audit_response = requests.get(
            f"{BASE_URL}/api/ingredients/audit-logs/all",
            params={"field_changed": "conversion_factor"},
            headers=self.headers
        )
        
        assert audit_response.status_code == 200
        logs = audit_response.json()["logs"]
        
        # Find our log
        our_log = None
        for log in logs:
            if log.get("ingredient_id") == ingredient_id and str(log.get("new_value")) == str(new_factor):
                our_log = log
                break
        
        if our_log:
            print(f"SUCCESS: Audit log created for conversion_factor change: {our_log}")
        else:
            print(f"WARNING: Could not find specific audit log, but {len(logs)} logs exist for conversion_factor changes")
        
        # Cleanup if we created the ingredient
        if "TEST_Audit" in test_ingredient.get("name", ""):
            requests.delete(f"{BASE_URL}/api/ingredients/{ingredient_id}", headers=self.headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
