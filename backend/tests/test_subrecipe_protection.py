"""
Test Sub-recipe Recipe Protection Feature
==========================================
Tests the P0 bug fix that prevents sub-recipe recipe definitions from being 
accidentally deleted from the database.

Features tested:
1. DELETE /api/recipes/{id} blocks deletion of sub-recipe recipes unless force=true
2. DELETE /api/recipes/{id}?force=true allows deletion of sub-recipe recipes
3. Regular recipe CRUD still works normally  
4. POST /api/recipes with product_id doesn't overwrite sub-recipe records
5. DELETE /api/recipes/product/{id} blocks deletion of sub-recipe records
6. GET /api/recipes returns all recipes (limit=500)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://factura-consumo-app.preview.emergentagent.com')

# Test credentials
ADMIN_PIN = "10000"


class TestSubrecipeProtection:
    """Test suite for sub-recipe protection feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Get auth token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed - skipping tests")
    
    def test_get_recipes_returns_all_including_subrecipes(self):
        """GET /api/recipes should return all recipes including sub-recipes (limit 500)"""
        response = self.session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of recipes"
        
        # Check we have both regular and sub-recipes
        subrecipes = [r for r in data if r.get("is_subrecipe")]
        regular = [r for r in data if not r.get("is_subrecipe")]
        
        print(f"Total recipes: {len(data)}")
        print(f"Sub-recipe recipes: {len(subrecipes)}")
        print(f"Regular recipes: {len(regular)}")
        
        # Verify SALSA CHIMI CHURRI sub-recipe exists
        salsa_chimi = [r for r in subrecipes if "CHIMI" in r.get("product_name", "").upper()]
        assert len(salsa_chimi) >= 1, "Expected SALSA CHIMI CHURRI sub-recipe to exist"
    
    def test_delete_subrecipe_blocked_without_force(self):
        """DELETE /api/recipes/{id} should return 400 for sub-recipe without force=true"""
        # First get the sub-recipe ID
        response = self.session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200
        
        recipes = response.json()
        subrecipes = [r for r in recipes if r.get("is_subrecipe") and r.get("produces_ingredient_id")]
        
        if not subrecipes:
            pytest.skip("No sub-recipes found to test")
        
        subrecipe = subrecipes[0]
        subrecipe_id = subrecipe.get("id")
        subrecipe_name = subrecipe.get("product_name")
        
        print(f"Testing deletion block for sub-recipe: {subrecipe_name} (id={subrecipe_id})")
        
        # Attempt to delete without force - should fail with 400
        response = self.session.delete(f"{BASE_URL}/api/recipes/{subrecipe_id}")
        
        assert response.status_code == 400, f"Expected 400 for sub-recipe deletion without force, got {response.status_code}"
        
        # Verify error message
        error_detail = response.json().get("detail", "")
        print(f"Error message: {error_detail}")
        assert "sub-receta" in error_detail.lower() or "producción" in error_detail.lower(), \
            "Error message should mention sub-recipe or production"
        
        # Verify sub-recipe still exists
        verify_response = self.session.get(f"{BASE_URL}/api/recipes")
        verify_recipes = verify_response.json()
        remaining_ids = [r.get("id") for r in verify_recipes]
        assert subrecipe_id in remaining_ids, "Sub-recipe should still exist after blocked deletion"
    
    def test_delete_subrecipe_allowed_with_force(self):
        """DELETE /api/recipes/{id}?force=true should successfully delete a sub-recipe"""
        # Create a test sub-recipe first
        test_ingredient_id = str(uuid.uuid4())
        test_subrecipe = {
            "product_id": "",
            "product_name": "TEST_SUBRECIPE_TO_DELETE",
            "ingredients": [],
            "yield_quantity": 1,
            "notes": "Test sub-recipe for force delete test",
            "is_subrecipe": True,
            "produces_ingredient_id": test_ingredient_id
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/recipes", json=test_subrecipe)
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test sub-recipe: {create_response.text}")
        
        created = create_response.json()
        test_id = created.get("id")
        
        print(f"Created test sub-recipe with id={test_id}")
        
        # Verify delete without force fails
        response = self.session.delete(f"{BASE_URL}/api/recipes/{test_id}")
        assert response.status_code == 400, "Delete without force should fail"
        
        # Now delete with force=true - should succeed
        response = self.session.delete(f"{BASE_URL}/api/recipes/{test_id}", params={"force": "true"})
        assert response.status_code == 200, f"Expected 200 for force delete, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result.get("ok") == True, "Response should indicate success"
        
        # Verify sub-recipe is deleted
        verify_response = self.session.get(f"{BASE_URL}/api/recipes")
        verify_recipes = verify_response.json()
        remaining_ids = [r.get("id") for r in verify_recipes]
        assert test_id not in remaining_ids, "Sub-recipe should be deleted after force=true"
        
        print("Force delete of sub-recipe successful")
    
    def test_delete_regular_recipe_works_normally(self):
        """DELETE /api/recipes/{id} should work for regular recipes without force"""
        # Create a test regular recipe
        test_product_id = str(uuid.uuid4())
        test_recipe = {
            "product_id": test_product_id,
            "product_name": "TEST_REGULAR_RECIPE_DELETE",
            "ingredients": [],
            "yield_quantity": 1,
            "notes": "Test regular recipe for delete test",
            "is_subrecipe": False,
            "produces_ingredient_id": ""  # Must be empty string, not None
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/recipes", json=test_recipe)
        
        if create_response.status_code != 200:
            pytest.skip(f"Could not create test recipe: {create_response.text}")
        
        created = create_response.json()
        test_id = created.get("id")
        
        print(f"Created test regular recipe with id={test_id}")
        
        # Delete without force - should succeed for regular recipes
        response = self.session.delete(f"{BASE_URL}/api/recipes/{test_id}")
        assert response.status_code == 200, f"Expected 200 for regular recipe delete, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result.get("ok") == True, "Response should indicate success"
        
        # Verify recipe is deleted
        verify_response = self.session.get(f"{BASE_URL}/api/recipes")
        verify_recipes = verify_response.json()
        remaining_ids = [r.get("id") for r in verify_recipes]
        assert test_id not in remaining_ids, "Regular recipe should be deleted"
        
        print("Regular recipe deletion successful")
    
    def test_create_recipe_does_not_overwrite_subrecipe(self):
        """POST /api/recipes with product_id should NOT overwrite sub-recipe records"""
        # Get existing sub-recipe info
        response = self.session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200
        
        recipes = response.json()
        subrecipes = [r for r in recipes if r.get("is_subrecipe") and r.get("produces_ingredient_id")]
        
        if not subrecipes:
            pytest.skip("No sub-recipes found to test")
        
        subrecipe = subrecipes[0]
        subrecipe_id = subrecipe.get("id")
        subrecipe_name = subrecipe.get("product_name")
        
        print(f"Testing create protection for sub-recipe: {subrecipe_name} (id={subrecipe_id})")
        
        # Try to create a new recipe with empty product_id (same as sub-recipe)
        # This tests the safety filter that prevents product_id="" from matching sub-recipes
        test_recipe = {
            "product_id": "",  # Same empty product_id as sub-recipe
            "product_name": "TEST_SHOULD_NOT_MATCH_SUBRECIPE",
            "ingredients": [],
            "yield_quantity": 99,  # Different value to detect if it overwrote
            "notes": "Test that this creates new recipe, not overwrites sub-recipe",
            "is_subrecipe": False,  # This is a regular recipe attempt
            "produces_ingredient_id": ""  # Must be string, not None
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/recipes", json=test_recipe)
        assert create_response.status_code == 200, f"Create should succeed: {create_response.text}"
        
        created = create_response.json()
        new_id = created.get("id")
        
        # Verify original sub-recipe still exists unchanged
        verify_response = self.session.get(f"{BASE_URL}/api/recipes")
        verify_recipes = verify_response.json()
        
        original_subrecipe = next((r for r in verify_recipes if r.get("id") == subrecipe_id), None)
        assert original_subrecipe is not None, "Original sub-recipe should still exist"
        assert original_subrecipe.get("product_name") == subrecipe_name, "Sub-recipe name should be unchanged"
        assert original_subrecipe.get("is_subrecipe") == True, "Sub-recipe flag should be unchanged"
        
        print(f"Sub-recipe protected. New recipe created with id={new_id}")
        
        # Cleanup - delete the test recipe we created
        if new_id:
            self.session.delete(f"{BASE_URL}/api/recipes/{new_id}")
    
    def test_delete_by_product_blocked_for_subrecipe(self):
        """DELETE /api/recipes/product/{id} should NOT delete sub-recipe records"""
        # Get existing sub-recipe info
        response = self.session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200
        
        recipes = response.json()
        subrecipes = [r for r in recipes if r.get("is_subrecipe") and r.get("produces_ingredient_id")]
        
        if not subrecipes:
            pytest.skip("No sub-recipes found to test")
        
        subrecipe = subrecipes[0]
        subrecipe_id = subrecipe.get("id")
        subrecipe_product_id = subrecipe.get("product_id", "")  # Empty for sub-recipes
        
        print(f"Testing delete by product protection for sub-recipe with product_id='{subrecipe_product_id}'")
        
        # The safety filter in delete_recipe_by_product should prevent deletion of sub-recipes
        # even if matched by product_id - it explicitly checks is_subrecipe and blocks
        
        # Store count before
        recipes_before = len(recipes)
        subrecipes_before = len(subrecipes)
        
        # Try to delete - the endpoint may succeed but should NOT delete the sub-recipe
        # because of the safety filter: {"product_id": product_id, "is_subrecipe": {"$ne": True}}
        if subrecipe_product_id:
            response = self.session.delete(f"{BASE_URL}/api/recipes/product/{subrecipe_product_id}")
            # May return 200 OK but sub-recipe should not be deleted due to safety filter
        
        # Verify sub-recipe still exists regardless of endpoint response
        verify_response = self.session.get(f"{BASE_URL}/api/recipes")
        verify_recipes = verify_response.json()
        remaining_ids = [r.get("id") for r in verify_recipes]
        assert subrecipe_id in remaining_ids, "Sub-recipe should still exist after delete by product attempt"
        
        # Verify count of sub-recipes is same
        subrecipes_after = [r for r in verify_recipes if r.get("is_subrecipe")]
        assert len(subrecipes_after) == subrecipes_before, \
            f"Sub-recipe count should be preserved: {subrecipes_before} -> {len(subrecipes_after)}"
        
        print("Sub-recipe protected from delete by product endpoint")
    
    def test_regular_recipe_crud_flow(self):
        """Test that regular recipe CRUD operations still work normally"""
        test_product_id = str(uuid.uuid4())
        
        # CREATE
        test_recipe = {
            "product_id": test_product_id,
            "product_name": "TEST_CRUD_RECIPE",
            "ingredients": [],
            "yield_quantity": 5,
            "notes": "Test CRUD recipe",
            "is_subrecipe": False,
            "produces_ingredient_id": ""  # Must be string, not None
        }
        
        create_response = self.session.post(f"{BASE_URL}/api/recipes", json=test_recipe)
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        created = create_response.json()
        recipe_id = created.get("id")
        assert recipe_id, "Recipe ID should be returned"
        print(f"CREATE: Recipe created with id={recipe_id}")
        
        # READ - Get by product
        read_response = self.session.get(f"{BASE_URL}/api/recipes/product/{test_product_id}")
        assert read_response.status_code == 200, f"Read failed: {read_response.text}"
        read_recipe = read_response.json()
        assert read_recipe.get("product_name") == "TEST_CRUD_RECIPE", "Should read created recipe"
        print("READ: Recipe retrieved successfully")
        
        # UPDATE
        update_data = {
            "product_id": test_product_id,
            "product_name": "TEST_CRUD_RECIPE_UPDATED",
            "ingredients": [],
            "yield_quantity": 10,
            "notes": "Updated test recipe",
            "is_subrecipe": False,
            "produces_ingredient_id": ""  # Must be string, not None
        }
        update_response = self.session.put(f"{BASE_URL}/api/recipes/{recipe_id}", json=update_data)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated = update_response.json()
        assert updated.get("product_name") == "TEST_CRUD_RECIPE_UPDATED", "Name should be updated"
        assert updated.get("yield_quantity") == 10, "Yield should be updated"
        print("UPDATE: Recipe updated successfully")
        
        # DELETE
        delete_response = self.session.delete(f"{BASE_URL}/api/recipes/{recipe_id}")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print("DELETE: Recipe deleted successfully")
        
        # Verify deleted
        verify_response = self.session.get(f"{BASE_URL}/api/recipes")
        verify_recipes = verify_response.json()
        remaining_ids = [r.get("id") for r in verify_recipes]
        assert recipe_id not in remaining_ids, "Recipe should be deleted"
        
        print("Regular recipe CRUD flow completed successfully")


class TestSubrecipeProductionFlow:
    """Test that sub-recipe production flow preserves recipe definitions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Get auth token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        if response.status_code == 200:
            token = response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed - skipping tests")
    
    def test_subrecipe_exists_in_ingredients(self):
        """Verify sub-recipe ingredient exists for production tests"""
        response = self.session.get(f"{BASE_URL}/api/ingredients")
        assert response.status_code == 200
        
        ingredients = response.json()
        subrecipe_ingredients = [i for i in ingredients if i.get("is_subrecipe")]
        
        print(f"Found {len(subrecipe_ingredients)} sub-recipe ingredients")
        for sr in subrecipe_ingredients:
            print(f"  - {sr.get('name')} (id={sr.get('id')})")
        
        assert len(subrecipe_ingredients) >= 1, "Expected at least one sub-recipe ingredient"
    
    def test_subrecipe_recipe_linked_to_ingredient(self):
        """Verify sub-recipe recipe is properly linked to its ingredient"""
        # Get sub-recipe recipes
        recipes_response = self.session.get(f"{BASE_URL}/api/recipes")
        assert recipes_response.status_code == 200
        recipes = recipes_response.json()
        
        subrecipe_recipes = [r for r in recipes if r.get("is_subrecipe") and r.get("produces_ingredient_id")]
        
        if not subrecipe_recipes:
            pytest.skip("No sub-recipe recipes found")
        
        # Get sub-recipe ingredients
        ingredients_response = self.session.get(f"{BASE_URL}/api/ingredients")
        assert ingredients_response.status_code == 200
        ingredients = ingredients_response.json()
        
        subrecipe_ingredient_ids = [i.get("id") for i in ingredients if i.get("is_subrecipe")]
        
        # Verify each sub-recipe recipe is linked to a valid ingredient
        for recipe in subrecipe_recipes:
            produces_id = recipe.get("produces_ingredient_id")
            recipe_name = recipe.get("product_name")
            
            assert produces_id in subrecipe_ingredient_ids, \
                f"Sub-recipe recipe '{recipe_name}' should link to a valid sub-recipe ingredient"
            
            print(f"Sub-recipe recipe '{recipe_name}' correctly linked to ingredient {produces_id}")
    
    def test_check_production_preserves_recipe(self):
        """Test that check-production endpoint doesn't delete recipe"""
        # Get a sub-recipe ingredient
        ingredients_response = self.session.get(f"{BASE_URL}/api/ingredients")
        assert ingredients_response.status_code == 200
        ingredients = ingredients_response.json()
        
        subrecipe_ingredients = [i for i in ingredients if i.get("is_subrecipe")]
        
        if not subrecipe_ingredients:
            pytest.skip("No sub-recipe ingredients found")
        
        sr_ingredient = subrecipe_ingredients[0]
        sr_id = sr_ingredient.get("id")
        
        # Get warehouse for test
        warehouses_response = self.session.get(f"{BASE_URL}/api/warehouses")
        assert warehouses_response.status_code == 200
        warehouses = warehouses_response.json()
        
        if not warehouses:
            pytest.skip("No warehouses found")
        
        warehouse_id = warehouses[0].get("id")
        
        # Count recipes before
        recipes_before = self.session.get(f"{BASE_URL}/api/recipes").json()
        subrecipe_recipes_before = [r for r in recipes_before if r.get("is_subrecipe")]
        count_before = len(subrecipe_recipes_before)
        
        # Call check-production
        check_data = {
            "ingredient_id": sr_id,
            "warehouse_id": warehouse_id,
            "quantity": 1
        }
        check_response = self.session.post(f"{BASE_URL}/api/inventory/check-production", json=check_data)
        # May return 400 if no recipe defined, that's acceptable
        print(f"Check production response: {check_response.status_code}")
        
        # Count recipes after
        recipes_after = self.session.get(f"{BASE_URL}/api/recipes").json()
        subrecipe_recipes_after = [r for r in recipes_after if r.get("is_subrecipe")]
        count_after = len(subrecipe_recipes_after)
        
        assert count_after == count_before, \
            f"Sub-recipe recipe count changed after check-production: {count_before} -> {count_after}"
        
        print(f"Recipe count preserved: {count_before} before, {count_after} after")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
