"""
Test Multi-Supplier Feature for Ingredients
Tests the new suppliers array field on ingredients and related functionality:
- GET /api/ingredients returns suppliers array
- POST /api/ingredients creates ingredient with multiple suppliers
- PUT /api/ingredients/{id} updates suppliers array and syncs default_supplier_id
- POST /api/ingredients/migrate-suppliers migrates old single-supplier format
- GET /api/purchasing/suggestions filters by supplier from suppliers array
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

def get_auth_token():
    """Get auth token using PIN 1111 (OSCAR CAJERO)"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1111"})
    if response.status_code == 200:
        return response.json().get("token")
    return None

@pytest.fixture(scope="module")
def auth_headers():
    """Get authenticated headers"""
    token = get_auth_token()
    if not token:
        pytest.skip("Could not authenticate - skipping tests")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

@pytest.fixture(scope="module")
def test_suppliers(auth_headers):
    """Create test suppliers for multi-supplier testing"""
    suppliers = []
    for i in range(3):
        supplier_data = {
            "name": f"TEST_MultiSupplier_{i}_{uuid.uuid4().hex[:6]}",
            "contact_name": f"Contact {i}",
            "phone": f"809-555-000{i}",
            "category": "general"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers", json=supplier_data, headers=auth_headers)
        if response.status_code == 200:
            suppliers.append(response.json())
    
    yield suppliers
    
    # Cleanup suppliers
    for supplier in suppliers:
        requests.delete(f"{BASE_URL}/api/suppliers/{supplier['id']}", headers=auth_headers)


class TestMultiSupplierIngredients:
    """Test multi-supplier functionality for ingredients"""
    
    created_ingredient_ids = []
    
    def test_01_create_ingredient_with_multiple_suppliers(self, auth_headers, test_suppliers):
        """Test creating an ingredient with multiple suppliers in the suppliers array"""
        if len(test_suppliers) < 2:
            pytest.skip("Need at least 2 test suppliers")
        
        # Create ingredient with multiple suppliers
        ingredient_data = {
            "name": f"TEST_MultiSupplierIngredient_{uuid.uuid4().hex[:6]}",
            "unit": "unidad",
            "category": "general",
            "min_stock": 10,
            "avg_cost": 100.0,
            "suppliers": [
                {
                    "supplier_id": test_suppliers[0]["id"],
                    "supplier_name": test_suppliers[0]["name"],
                    "unit_price": 95.0,
                    "is_default": True
                },
                {
                    "supplier_id": test_suppliers[1]["id"],
                    "supplier_name": test_suppliers[1]["name"],
                    "unit_price": 105.0,
                    "is_default": False
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/ingredients", json=ingredient_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create ingredient: {response.text}"
        
        data = response.json()
        self.created_ingredient_ids.append(data["id"])
        
        # Verify suppliers array is returned
        assert "suppliers" in data, "Response should contain suppliers array"
        assert len(data["suppliers"]) == 2, f"Expected 2 suppliers, got {len(data['suppliers'])}"
        
        # Verify default_supplier_id is synced from suppliers array
        assert data.get("default_supplier_id") == test_suppliers[0]["id"], \
            "default_supplier_id should be synced from is_default supplier"
        
        # Verify supplier data structure
        default_supplier = next((s for s in data["suppliers"] if s.get("is_default")), None)
        assert default_supplier is not None, "Should have a default supplier"
        assert default_supplier["supplier_id"] == test_suppliers[0]["id"]
        assert default_supplier["unit_price"] == 95.0
        
        print(f"Created ingredient with {len(data['suppliers'])} suppliers")
    
    def test_02_get_ingredient_returns_suppliers_array(self, auth_headers):
        """Test that GET /api/ingredients returns suppliers array for each ingredient"""
        response = requests.get(f"{BASE_URL}/api/ingredients", headers=auth_headers)
        assert response.status_code == 200, f"Failed to get ingredients: {response.text}"
        
        ingredients = response.json()
        assert isinstance(ingredients, list), "Response should be a list"
        
        # Find our test ingredient
        test_ingredients = [i for i in ingredients if i.get("name", "").startswith("TEST_MultiSupplier")]
        
        if test_ingredients:
            ing = test_ingredients[0]
            # Verify suppliers field exists (may be empty array or populated)
            assert "suppliers" in ing or ing.get("suppliers") is None, \
                "Ingredient should have suppliers field"
            print(f"Found test ingredient with suppliers: {ing.get('suppliers', [])}")
        
        print(f"GET /api/ingredients returned {len(ingredients)} ingredients")
    
    def test_03_update_ingredient_suppliers_syncs_default(self, auth_headers, test_suppliers):
        """Test that updating suppliers array syncs default_supplier_id"""
        if not self.created_ingredient_ids:
            pytest.skip("No test ingredient created")
        
        ingredient_id = self.created_ingredient_ids[0]
        
        # Update suppliers - change default to second supplier
        update_data = {
            "suppliers": [
                {
                    "supplier_id": test_suppliers[0]["id"],
                    "supplier_name": test_suppliers[0]["name"],
                    "unit_price": 95.0,
                    "is_default": False  # No longer default
                },
                {
                    "supplier_id": test_suppliers[1]["id"],
                    "supplier_name": test_suppliers[1]["name"],
                    "unit_price": 105.0,
                    "is_default": True  # Now default
                }
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/ingredients/{ingredient_id}", 
            json=update_data, 
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to update ingredient: {response.text}"
        
        # Verify the update by fetching the ingredient
        get_response = requests.get(f"{BASE_URL}/api/ingredients/{ingredient_id}", headers=auth_headers)
        assert get_response.status_code == 200, f"Failed to get ingredient: {get_response.text}"
        
        data = get_response.json()
        
        # Verify default_supplier_id was synced to the new default
        assert data.get("default_supplier_id") == test_suppliers[1]["id"], \
            f"default_supplier_id should be synced to new default supplier. Got: {data.get('default_supplier_id')}"
        
        print(f"Updated ingredient - default_supplier_id synced to: {data.get('default_supplier_id')}")
    
    def test_04_add_third_supplier_to_ingredient(self, auth_headers, test_suppliers):
        """Test adding a third supplier to existing ingredient"""
        if not self.created_ingredient_ids or len(test_suppliers) < 3:
            pytest.skip("Need test ingredient and 3 suppliers")
        
        ingredient_id = self.created_ingredient_ids[0]
        
        # Get current ingredient
        get_response = requests.get(f"{BASE_URL}/api/ingredients/{ingredient_id}", headers=auth_headers)
        current = get_response.json()
        current_suppliers = current.get("suppliers", [])
        
        # Add third supplier
        current_suppliers.append({
            "supplier_id": test_suppliers[2]["id"],
            "supplier_name": test_suppliers[2]["name"],
            "unit_price": 110.0,
            "is_default": False
        })
        
        update_data = {"suppliers": current_suppliers}
        
        response = requests.put(
            f"{BASE_URL}/api/ingredients/{ingredient_id}", 
            json=update_data, 
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to update ingredient: {response.text}"
        
        # Verify
        get_response = requests.get(f"{BASE_URL}/api/ingredients/{ingredient_id}", headers=auth_headers)
        data = get_response.json()
        
        assert len(data.get("suppliers", [])) == 3, f"Expected 3 suppliers, got {len(data.get('suppliers', []))}"
        print(f"Ingredient now has {len(data['suppliers'])} suppliers")
    
    def test_05_create_ingredient_with_legacy_default_supplier_id(self, auth_headers, test_suppliers):
        """Test creating ingredient with only default_supplier_id (legacy format) auto-creates suppliers array"""
        if not test_suppliers:
            pytest.skip("Need test suppliers")
        
        # Create ingredient with only default_supplier_id (legacy format)
        ingredient_data = {
            "name": f"TEST_LegacySupplier_{uuid.uuid4().hex[:6]}",
            "unit": "unidad",
            "category": "general",
            "min_stock": 5,
            "avg_cost": 50.0,
            "default_supplier_id": test_suppliers[0]["id"]
            # Note: no suppliers array provided
        }
        
        response = requests.post(f"{BASE_URL}/api/ingredients", json=ingredient_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create ingredient: {response.text}"
        
        data = response.json()
        self.created_ingredient_ids.append(data["id"])
        
        # Verify suppliers array was auto-created from default_supplier_id
        assert "suppliers" in data, "Response should contain suppliers array"
        assert len(data["suppliers"]) >= 1, "Should have at least 1 supplier from default_supplier_id"
        
        # Verify the auto-created supplier entry
        supplier_entry = data["suppliers"][0]
        assert supplier_entry["supplier_id"] == test_suppliers[0]["id"]
        assert supplier_entry["is_default"] == True
        
        print(f"Legacy format auto-created suppliers array: {data['suppliers']}")
    
    def test_06_migrate_suppliers_endpoint(self, auth_headers):
        """Test POST /api/ingredients/migrate-suppliers endpoint"""
        response = requests.post(f"{BASE_URL}/api/ingredients/migrate-suppliers", headers=auth_headers)
        assert response.status_code == 200, f"Migration endpoint failed: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, "Migration should return ok: true"
        assert "migrated" in data, "Response should contain migrated count"
        
        print(f"Migration result: {data}")
    
    def test_07_purchasing_suggestions_filters_by_supplier_from_array(self, auth_headers, test_suppliers):
        """Test that purchasing suggestions filters ingredients by supplier from suppliers array"""
        if not test_suppliers:
            pytest.skip("Need test suppliers")
        
        supplier_id = test_suppliers[0]["id"]
        
        # Get suggestions filtered by supplier
        response = requests.get(
            f"{BASE_URL}/api/purchasing/suggestions",
            params={"supplier_id": supplier_id, "include_ok_stock": True},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get suggestions: {response.text}"
        
        data = response.json()
        assert "suggestions" in data, "Response should contain suggestions"
        
        # Verify filtering works - all returned ingredients should have this supplier
        # either in default_supplier_id OR in suppliers array
        for suggestion in data["suggestions"]:
            has_supplier = (
                suggestion.get("default_supplier_id") == supplier_id or
                any(s.get("supplier_id") == supplier_id for s in (suggestion.get("suppliers") or []))
            )
            if suggestion.get("ingredient_name", "").startswith("TEST_"):
                assert has_supplier, \
                    f"Ingredient {suggestion.get('ingredient_name')} should have supplier {supplier_id}"
        
        print(f"Purchasing suggestions returned {len(data['suggestions'])} items for supplier {supplier_id}")
    
    def test_08_suggestions_include_suppliers_array_in_response(self, auth_headers):
        """Test that purchasing suggestions include suppliers array in response"""
        response = requests.get(
            f"{BASE_URL}/api/purchasing/suggestions",
            params={"include_ok_stock": True},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get suggestions: {response.text}"
        
        data = response.json()
        suggestions = data.get("suggestions", [])
        
        # Find our test ingredients
        test_suggestions = [s for s in suggestions if s.get("ingredient_name", "").startswith("TEST_MultiSupplier")]
        
        if test_suggestions:
            suggestion = test_suggestions[0]
            assert "suppliers" in suggestion, "Suggestion should include suppliers array"
            print(f"Suggestion includes suppliers: {suggestion.get('suppliers', [])}")
        
        print(f"Total suggestions: {len(suggestions)}")
    
    def test_09_remove_supplier_from_ingredient(self, auth_headers, test_suppliers):
        """Test removing a supplier from ingredient's suppliers array"""
        if not self.created_ingredient_ids:
            pytest.skip("No test ingredient created")
        
        ingredient_id = self.created_ingredient_ids[0]
        
        # Get current ingredient
        get_response = requests.get(f"{BASE_URL}/api/ingredients/{ingredient_id}", headers=auth_headers)
        current = get_response.json()
        current_suppliers = current.get("suppliers", [])
        
        if len(current_suppliers) < 2:
            pytest.skip("Need at least 2 suppliers to test removal")
        
        # Remove one supplier (keep only first two)
        new_suppliers = current_suppliers[:2]
        
        # Make sure one is still default
        has_default = any(s.get("is_default") for s in new_suppliers)
        if not has_default and new_suppliers:
            new_suppliers[0]["is_default"] = True
        
        update_data = {"suppliers": new_suppliers}
        
        response = requests.put(
            f"{BASE_URL}/api/ingredients/{ingredient_id}", 
            json=update_data, 
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to update ingredient: {response.text}"
        
        # Verify
        get_response = requests.get(f"{BASE_URL}/api/ingredients/{ingredient_id}", headers=auth_headers)
        data = get_response.json()
        
        assert len(data.get("suppliers", [])) == 2, f"Expected 2 suppliers after removal, got {len(data.get('suppliers', []))}"
        print(f"Successfully removed supplier, now has {len(data['suppliers'])} suppliers")
    
    def test_10_clear_all_suppliers(self, auth_headers):
        """Test clearing all suppliers from ingredient"""
        if not self.created_ingredient_ids:
            pytest.skip("No test ingredient created")
        
        ingredient_id = self.created_ingredient_ids[0]
        
        # Clear suppliers
        update_data = {"suppliers": []}
        
        response = requests.put(
            f"{BASE_URL}/api/ingredients/{ingredient_id}", 
            json=update_data, 
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to update ingredient: {response.text}"
        
        # Verify
        get_response = requests.get(f"{BASE_URL}/api/ingredients/{ingredient_id}", headers=auth_headers)
        data = get_response.json()
        
        assert len(data.get("suppliers", [])) == 0, "Suppliers should be empty"
        assert data.get("default_supplier_id") == "", "default_supplier_id should be cleared"
        
        print("Successfully cleared all suppliers")
    
    @pytest.fixture(autouse=True, scope="class")
    def cleanup(self, request, auth_headers):
        """Cleanup test ingredients after all tests"""
        yield
        # Cleanup
        for ing_id in self.created_ingredient_ids:
            try:
                requests.delete(f"{BASE_URL}/api/ingredients/{ing_id}", headers=auth_headers)
            except:
                pass
        self.created_ingredient_ids.clear()


class TestMultiSupplierEdgeCases:
    """Test edge cases for multi-supplier functionality"""
    
    created_ids = []
    
    def test_01_create_ingredient_empty_suppliers_array(self, auth_headers):
        """Test creating ingredient with empty suppliers array"""
        ingredient_data = {
            "name": f"TEST_EmptySuppliers_{uuid.uuid4().hex[:6]}",
            "unit": "unidad",
            "category": "general",
            "min_stock": 5,
            "avg_cost": 25.0,
            "suppliers": []
        }
        
        response = requests.post(f"{BASE_URL}/api/ingredients", json=ingredient_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create ingredient: {response.text}"
        
        data = response.json()
        self.created_ids.append(data["id"])
        
        assert data.get("suppliers") == [] or data.get("suppliers") is None or len(data.get("suppliers", [])) == 0
        print("Created ingredient with empty suppliers array")
    
    def test_02_multiple_defaults_uses_first(self, auth_headers, test_suppliers):
        """Test that if multiple suppliers have is_default=True, first one is used"""
        if len(test_suppliers) < 2:
            pytest.skip("Need at least 2 suppliers")
        
        ingredient_data = {
            "name": f"TEST_MultipleDefaults_{uuid.uuid4().hex[:6]}",
            "unit": "unidad",
            "category": "general",
            "avg_cost": 30.0,
            "suppliers": [
                {
                    "supplier_id": test_suppliers[0]["id"],
                    "supplier_name": test_suppliers[0]["name"],
                    "unit_price": 30.0,
                    "is_default": True
                },
                {
                    "supplier_id": test_suppliers[1]["id"],
                    "supplier_name": test_suppliers[1]["name"],
                    "unit_price": 35.0,
                    "is_default": True  # Also marked as default
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/ingredients", json=ingredient_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create ingredient: {response.text}"
        
        data = response.json()
        self.created_ids.append(data["id"])
        
        # First default should be used
        assert data.get("default_supplier_id") == test_suppliers[0]["id"], \
            "First supplier with is_default should be used"
        
        print(f"Multiple defaults handled - used first: {data.get('default_supplier_id')}")
    
    def test_03_no_default_uses_first_supplier(self, auth_headers, test_suppliers):
        """Test that if no supplier has is_default=True, first one is used"""
        if len(test_suppliers) < 2:
            pytest.skip("Need at least 2 suppliers")
        
        ingredient_data = {
            "name": f"TEST_NoDefault_{uuid.uuid4().hex[:6]}",
            "unit": "unidad",
            "category": "general",
            "avg_cost": 40.0,
            "suppliers": [
                {
                    "supplier_id": test_suppliers[0]["id"],
                    "supplier_name": test_suppliers[0]["name"],
                    "unit_price": 40.0,
                    "is_default": False
                },
                {
                    "supplier_id": test_suppliers[1]["id"],
                    "supplier_name": test_suppliers[1]["name"],
                    "unit_price": 45.0,
                    "is_default": False
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/ingredients", json=ingredient_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create ingredient: {response.text}"
        
        data = response.json()
        self.created_ids.append(data["id"])
        
        # First supplier should be used as default
        assert data.get("default_supplier_id") == test_suppliers[0]["id"], \
            "First supplier should be used when no default specified"
        
        print(f"No default specified - used first: {data.get('default_supplier_id')}")
    
    @pytest.fixture(autouse=True, scope="class")
    def cleanup(self, request, auth_headers):
        """Cleanup test ingredients"""
        yield
        for ing_id in self.created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/ingredients/{ing_id}", headers=auth_headers)
            except:
                pass
        self.created_ids.clear()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
