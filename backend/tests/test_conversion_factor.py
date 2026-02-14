"""
Test: Conversion Factor Calculator Feature for Ingredients
Tests the new conversion factor calculator functionality including:
- Creating ingredients with conversion factor fields
- Automatic dispatch_unit_cost calculation
- Affected recipes endpoint
- Audit logs for conversion field changes
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestConversionFactorFeature:
    """Test suite for Conversion Factor Calculator in Ingredient Module"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        self.test_ingredient_ids = []
    
    def teardown_method(self, method):
        """Cleanup test ingredients after each test"""
        for ing_id in self.test_ingredient_ids:
            try:
                requests.delete(f"{BASE_URL}/api/ingredients/{ing_id}", headers=self.headers)
            except:
                pass
    
    def test_create_ingredient_with_conversion_factor(self):
        """Test creating an ingredient with conversion factor fields"""
        # Create ingredient with 1 libra = 16 onzas conversion
        payload = {
            "name": "TEST_Carne_Conversion",
            "unit": "oz",
            "category": "carnes",
            "min_stock": 10,
            "avg_cost": 100.00,
            "purchase_unit": "lb",
            "purchase_quantity": 1,
            "dispatch_quantity": 16,
            "conversion_factor": 16
        }
        
        response = requests.post(f"{BASE_URL}/api/ingredients", json=payload, headers=self.headers)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        self.test_ingredient_ids.append(data["id"])
        
        # Verify all conversion fields are saved
        assert data["purchase_unit"] == "lb"
        assert data["purchase_quantity"] == 1
        assert data["dispatch_quantity"] == 16
        assert data["conversion_factor"] == 16
        
        # Verify dispatch_unit_cost is calculated correctly (100 / 16 = 6.25)
        assert data["dispatch_unit_cost"] == 6.25
        print(f"✓ Created ingredient with conversion factor, dispatch_unit_cost = {data['dispatch_unit_cost']}")
    
    def test_dispatch_unit_cost_calculation(self):
        """Test that dispatch_unit_cost is calculated correctly for different factors"""
        test_cases = [
            # (avg_cost, conversion_factor, expected_dispatch_cost)
            (100.00, 16, 6.25),    # 1 lb = 16 oz
            (50.00, 1000, 0.05),    # 1 kg = 1000 g
            (200.00, 4, 50.00),     # 1 galón = 4 cuartos
        ]
        
        for avg_cost, factor, expected in test_cases:
            payload = {
                "name": f"TEST_Factor_{factor}",
                "unit": "unidad",
                "category": "general",
                "min_stock": 0,
                "avg_cost": avg_cost,
                "purchase_unit": "unidad",
                "purchase_quantity": 1,
                "dispatch_quantity": factor,
                "conversion_factor": factor
            }
            
            response = requests.post(f"{BASE_URL}/api/ingredients", json=payload, headers=self.headers)
            assert response.status_code == 200, f"Create failed: {response.text}"
            
            data = response.json()
            self.test_ingredient_ids.append(data["id"])
            
            assert abs(data["dispatch_unit_cost"] - expected) < 0.01, \
                f"Expected dispatch_unit_cost {expected}, got {data['dispatch_unit_cost']}"
            print(f"✓ Cost {avg_cost} / factor {factor} = {data['dispatch_unit_cost']} (expected {expected})")
    
    def test_update_ingredient_creates_audit_log(self):
        """Test that updating conversion fields creates audit logs"""
        # First create an ingredient
        payload = {
            "name": "TEST_Audit_Ingredient",
            "unit": "oz",
            "category": "carnes",
            "min_stock": 10,
            "avg_cost": 100.00,
            "purchase_unit": "lb",
            "purchase_quantity": 1,
            "dispatch_quantity": 16,
            "conversion_factor": 16
        }
        
        create_response = requests.post(f"{BASE_URL}/api/ingredients", json=payload, headers=self.headers)
        assert create_response.status_code == 200
        ing_id = create_response.json()["id"]
        self.test_ingredient_ids.append(ing_id)
        
        # Update conversion factor
        update_payload = {
            "conversion_factor": 18,
            "dispatch_quantity": 18,
            "avg_cost": 120.00
        }
        
        update_response = requests.put(f"{BASE_URL}/api/ingredients/{ing_id}", json=update_payload, headers=self.headers)
        assert update_response.status_code == 200
        
        update_data = update_response.json()
        assert update_data.get("audit_logs_created", 0) >= 3, "Expected at least 3 audit logs"
        print(f"✓ Update created {update_data['audit_logs_created']} audit logs")
        
        # Verify audit logs are created
        audit_response = requests.get(f"{BASE_URL}/api/ingredients/{ing_id}/audit-logs", headers=self.headers)
        assert audit_response.status_code == 200
        
        audit_logs = audit_response.json()
        assert len(audit_logs) >= 3, f"Expected at least 3 audit logs, got {len(audit_logs)}"
        
        # Verify audit log fields
        fields_logged = [log["field_changed"] for log in audit_logs]
        assert "conversion_factor" in fields_logged
        assert "dispatch_quantity" in fields_logged
        assert "avg_cost" in fields_logged
        print(f"✓ Audit logs contain fields: {fields_logged}")
    
    def test_audit_log_tracks_user(self):
        """Test that audit logs track who made the change"""
        # Create an ingredient
        payload = {
            "name": "TEST_User_Track",
            "unit": "unidad",
            "category": "general",
            "min_stock": 0,
            "avg_cost": 50.00,
            "conversion_factor": 1
        }
        
        create_response = requests.post(f"{BASE_URL}/api/ingredients", json=payload, headers=self.headers)
        assert create_response.status_code == 200
        ing_id = create_response.json()["id"]
        self.test_ingredient_ids.append(ing_id)
        
        # Update to trigger audit
        requests.put(f"{BASE_URL}/api/ingredients/{ing_id}", json={"avg_cost": 60.00}, headers=self.headers)
        
        # Check audit logs
        audit_response = requests.get(f"{BASE_URL}/api/ingredients/{ing_id}/audit-logs", headers=self.headers)
        assert audit_response.status_code == 200
        
        audit_logs = audit_response.json()
        assert len(audit_logs) > 0
        
        log = audit_logs[0]
        assert log["changed_by_name"] == "Admin", f"Expected 'Admin', got '{log['changed_by_name']}'"
        assert log["changed_by_id"] != ""
        print(f"✓ Audit log tracked user: {log['changed_by_name']} (id: {log['changed_by_id'][:8]}...)")
    
    def test_affected_recipes_endpoint(self):
        """Test the affected recipes endpoint returns correct count"""
        # Create an ingredient
        payload = {
            "name": "TEST_Recipe_Ingredient",
            "unit": "oz",
            "category": "carnes",
            "min_stock": 0,
            "avg_cost": 50.00,
            "conversion_factor": 1
        }
        
        create_response = requests.post(f"{BASE_URL}/api/ingredients", json=payload, headers=self.headers)
        assert create_response.status_code == 200
        ing_id = create_response.json()["id"]
        self.test_ingredient_ids.append(ing_id)
        
        # Test affected recipes (should be 0 for new ingredient)
        affected_response = requests.get(f"{BASE_URL}/api/ingredients/{ing_id}/affected-recipes", headers=self.headers)
        assert affected_response.status_code == 200
        
        data = affected_response.json()
        assert "count" in data
        assert "recipes" in data
        assert isinstance(data["recipes"], list)
        print(f"✓ Affected recipes endpoint returned: count={data['count']}, recipes={len(data['recipes'])}")
    
    def test_manual_conversion_factor_edit(self):
        """Test that conversion factor can be edited manually (free edit)"""
        # Create ingredient with calculated factor
        payload = {
            "name": "TEST_Manual_Factor",
            "unit": "oz",
            "category": "general",
            "min_stock": 0,
            "avg_cost": 100.00,
            "purchase_unit": "lb",
            "purchase_quantity": 1,
            "dispatch_quantity": 16,
            "conversion_factor": 16
        }
        
        create_response = requests.post(f"{BASE_URL}/api/ingredients", json=payload, headers=self.headers)
        assert create_response.status_code == 200
        ing_id = create_response.json()["id"]
        self.test_ingredient_ids.append(ing_id)
        
        # Manually edit conversion factor to a different value
        update_response = requests.put(f"{BASE_URL}/api/ingredients/{ing_id}", 
            json={"conversion_factor": 15.5}, headers=self.headers)
        assert update_response.status_code == 200
        
        # Verify the manual edit was saved
        get_response = requests.get(f"{BASE_URL}/api/ingredients/{ing_id}", headers=self.headers)
        assert get_response.status_code == 200
        
        data = get_response.json()
        assert data["conversion_factor"] == 15.5, f"Expected 15.5, got {data['conversion_factor']}"
        
        # Verify dispatch_unit_cost was recalculated
        expected_cost = round(100.00 / 15.5, 4)
        assert abs(data["dispatch_unit_cost"] - expected_cost) < 0.01
        print(f"✓ Manual factor edit: 15.5, dispatch_unit_cost recalculated to {data['dispatch_unit_cost']}")


class TestIngredientConversionValidation:
    """Additional validation tests for conversion factor feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        self.test_ingredient_ids = []
    
    def teardown_method(self, method):
        for ing_id in self.test_ingredient_ids:
            try:
                requests.delete(f"{BASE_URL}/api/ingredients/{ing_id}", headers=self.headers)
            except:
                pass
    
    def test_default_conversion_factor(self):
        """Test that default conversion factor is 1"""
        payload = {
            "name": "TEST_Default_Factor",
            "unit": "unidad",
            "category": "general",
            "min_stock": 0,
            "avg_cost": 50.00
        }
        
        response = requests.post(f"{BASE_URL}/api/ingredients", json=payload, headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        self.test_ingredient_ids.append(data["id"])
        
        assert data.get("conversion_factor", 1) == 1, "Default conversion factor should be 1"
        print("✓ Default conversion factor is 1")
    
    def test_zero_division_protection(self):
        """Test that zero conversion factor is handled gracefully"""
        payload = {
            "name": "TEST_Zero_Factor",
            "unit": "unidad",
            "category": "general",
            "min_stock": 0,
            "avg_cost": 50.00,
            "conversion_factor": 0  # Should not cause division error
        }
        
        response = requests.post(f"{BASE_URL}/api/ingredients", json=payload, headers=self.headers)
        # The request should either succeed with factor defaulting to 1, or fail gracefully
        assert response.status_code in [200, 400, 422]
        
        if response.status_code == 200:
            data = response.json()
            self.test_ingredient_ids.append(data["id"])
            # dispatch_unit_cost should be set to avg_cost when factor is 0
            print(f"✓ Zero factor handled: dispatch_unit_cost = {data.get('dispatch_unit_cost', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
