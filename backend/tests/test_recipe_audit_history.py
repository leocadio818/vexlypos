"""
Test Recipe Audit History (Version History/Audit Trail)
Tests the new audit trail feature for recipe CRUD operations.

Features tested:
1. GET /api/recipes/{id}/history - returns audit history for a specific recipe
2. GET /api/recipes/history/all - returns all recipe history with filters
3. POST /api/recipes creates audit log with action='created'
4. PUT /api/recipes/{id} creates audit log with action='updated' and detailed changes
5. DELETE /api/recipes/{id} creates audit log with action='deleted' with snapshot_before
6. Sub-recipe protection still works (DELETE without force returns 400)
"""

import pytest
import requests
import os
import time
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRecipeAuditHistory:
    """Test suite for Recipe Audit History feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token and create test data"""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        # Login with admin PIN
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({'Authorization': f'Bearer {token}'})
        
        # Get existing ingredients for test recipe
        ing_res = self.session.get(f"{BASE_URL}/api/ingredients")
        self.ingredients = ing_res.json() if ing_res.status_code == 200 else []
        
        yield
        
        # Cleanup: Delete any test recipes created
        recipes_res = self.session.get(f"{BASE_URL}/api/recipes")
        if recipes_res.status_code == 200:
            for r in recipes_res.json():
                if r.get('product_name', '').startswith('TEST_AUDIT_'):
                    self.session.delete(f"{BASE_URL}/api/recipes/{r['id']}", params={"force": "true"})

    def test_get_recipe_history_endpoint_exists(self):
        """Test that GET /api/recipes/{id}/history endpoint exists"""
        # Use a fake ID to test endpoint existence
        response = self.session.get(f"{BASE_URL}/api/recipes/fake-id/history")
        # Should return 200 with empty list, not 404
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: GET /api/recipes/{id}/history endpoint exists")

    def test_get_all_recipe_history_endpoint_exists(self):
        """Test that GET /api/recipes/history/all endpoint exists"""
        response = self.session.get(f"{BASE_URL}/api/recipes/history/all")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: GET /api/recipes/history/all endpoint exists")

    def test_create_recipe_generates_audit_log(self):
        """Test that POST /api/recipes creates an audit log entry with action='created'"""
        # Get a base ingredient
        base_ing = next((i for i in self.ingredients if not i.get('is_subrecipe')), None)
        if not base_ing:
            pytest.skip("No base ingredients available for test")
        
        # Create a test recipe
        recipe_data = {
            "product_id": "",
            "product_name": f"TEST_AUDIT_CREATE_{int(time.time())}",
            "ingredients": [
                {
                    "ingredient_id": base_ing['id'],
                    "ingredient_name": base_ing['name'],
                    "quantity": 2,
                    "unit": base_ing.get('unit', 'unidad'),
                    "waste_percentage": 0
                }
            ],
            "yield_quantity": 1,
            "notes": "Test recipe for audit",
            "is_subrecipe": False,
            "produces_ingredient_id": ""
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/recipes", json=recipe_data)
        assert create_res.status_code == 200
        created_recipe = create_res.json()
        recipe_id = created_recipe['id']
        
        # Wait a moment for audit log to be written
        time.sleep(0.5)
        
        # Fetch the audit history for this recipe
        history_res = self.session.get(f"{BASE_URL}/api/recipes/{recipe_id}/history")
        assert history_res.status_code == 200
        history = history_res.json()
        
        # Should have at least one entry with action='created'
        assert len(history) >= 1
        created_entry = next((h for h in history if h.get('action') == 'created'), None)
        assert created_entry is not None, "No 'created' action found in history"
        assert created_entry.get('recipe_id') == recipe_id
        assert 'timestamp' in created_entry
        assert 'user_name' in created_entry
        assert 'snapshot_after' in created_entry  # Should have snapshot of created recipe
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/recipes/{recipe_id}", params={"force": "true"})
        print("PASS: POST /api/recipes creates audit log with action='created'")

    def test_update_recipe_generates_audit_log_with_changes(self):
        """Test that PUT /api/recipes/{id} creates audit log with action='updated' and detailed changes"""
        # Get base ingredients
        base_ing = next((i for i in self.ingredients if not i.get('is_subrecipe')), None)
        if not base_ing:
            pytest.skip("No base ingredients available for test")
        
        # Create a test recipe first
        recipe_name = f"TEST_AUDIT_UPDATE_{int(time.time())}"
        recipe_data = {
            "product_id": "",
            "product_name": recipe_name,
            "ingredients": [
                {
                    "ingredient_id": base_ing['id'],
                    "ingredient_name": base_ing['name'],
                    "quantity": 1,
                    "unit": base_ing.get('unit', 'unidad'),
                    "waste_percentage": 0
                }
            ],
            "yield_quantity": 1,
            "notes": "Original notes",
            "is_subrecipe": False,
            "produces_ingredient_id": ""
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/recipes", json=recipe_data)
        assert create_res.status_code == 200
        created_recipe = create_res.json()
        recipe_id = created_recipe['id']
        
        time.sleep(0.5)
        
        # Update the recipe - change yield and notes
        updated_data = {
            **recipe_data,
            "yield_quantity": 2,  # Changed from 1 to 2
            "notes": "Updated notes",  # Changed notes
            "ingredients": [
                {
                    "ingredient_id": base_ing['id'],
                    "ingredient_name": base_ing['name'],
                    "quantity": 3,  # Changed quantity from 1 to 3
                    "unit": base_ing.get('unit', 'unidad'),
                    "waste_percentage": 5  # Added waste percentage
                }
            ]
        }
        
        update_res = self.session.put(f"{BASE_URL}/api/recipes/{recipe_id}", json=updated_data)
        assert update_res.status_code == 200
        
        time.sleep(0.5)
        
        # Fetch the audit history
        history_res = self.session.get(f"{BASE_URL}/api/recipes/{recipe_id}/history")
        assert history_res.status_code == 200
        history = history_res.json()
        
        # Should have an 'updated' entry
        updated_entry = next((h for h in history if h.get('action') == 'updated'), None)
        assert updated_entry is not None, "No 'updated' action found in history"
        
        # Verify the entry has expected fields
        assert updated_entry.get('recipe_id') == recipe_id
        assert 'changes' in updated_entry
        assert 'snapshot_before' in updated_entry
        assert 'snapshot_after' in updated_entry
        assert len(updated_entry.get('changes', [])) > 0, "Changes list should not be empty"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/recipes/{recipe_id}", params={"force": "true"})
        print("PASS: PUT /api/recipes/{id} creates audit log with action='updated' and detailed changes")

    def test_delete_recipe_generates_audit_log(self):
        """Test that DELETE /api/recipes/{id} creates audit log with action='deleted' and snapshot_before"""
        # Get base ingredients
        base_ing = next((i for i in self.ingredients if not i.get('is_subrecipe')), None)
        if not base_ing:
            pytest.skip("No base ingredients available for test")
        
        # Create a test recipe
        recipe_name = f"TEST_AUDIT_DELETE_{int(time.time())}"
        recipe_data = {
            "product_id": "",
            "product_name": recipe_name,
            "ingredients": [
                {
                    "ingredient_id": base_ing['id'],
                    "ingredient_name": base_ing['name'],
                    "quantity": 1,
                    "unit": base_ing.get('unit', 'unidad'),
                    "waste_percentage": 0
                }
            ],
            "yield_quantity": 1,
            "notes": "Recipe to be deleted",
            "is_subrecipe": False,
            "produces_ingredient_id": ""
        }
        
        create_res = self.session.post(f"{BASE_URL}/api/recipes", json=recipe_data)
        assert create_res.status_code == 200
        created_recipe = create_res.json()
        recipe_id = created_recipe['id']
        
        time.sleep(0.5)
        
        # Delete the recipe (not a subrecipe, so no force needed)
        delete_res = self.session.delete(f"{BASE_URL}/api/recipes/{recipe_id}")
        assert delete_res.status_code == 200
        
        time.sleep(0.5)
        
        # Fetch the audit history - should still exist even after recipe is deleted
        history_res = self.session.get(f"{BASE_URL}/api/recipes/{recipe_id}/history")
        assert history_res.status_code == 200
        history = history_res.json()
        
        # Should have a 'deleted' entry
        deleted_entry = next((h for h in history if h.get('action') == 'deleted'), None)
        assert deleted_entry is not None, "No 'deleted' action found in history"
        
        # Verify the entry has expected fields
        assert deleted_entry.get('recipe_id') == recipe_id
        assert deleted_entry.get('recipe_name') == recipe_name
        assert 'snapshot_before' in deleted_entry
        assert deleted_entry.get('snapshot_before') is not None, "snapshot_before should be preserved"
        
        print("PASS: DELETE /api/recipes/{id} creates audit log with action='deleted' and snapshot_before")

    def test_subrecipe_protection_still_works(self):
        """Test that sub-recipe protection still works: DELETE without force returns 400"""
        # Get existing sub-recipes (recipes that are sub-recipe definitions)
        recipes_res = self.session.get(f"{BASE_URL}/api/recipes")
        assert recipes_res.status_code == 200
        recipes = recipes_res.json()
        
        # Find a sub-recipe (is_subrecipe=true and has produces_ingredient_id)
        subrecipe = next(
            (r for r in recipes if r.get('is_subrecipe') and r.get('produces_ingredient_id')), 
            None
        )
        
        if not subrecipe:
            pytest.skip("No sub-recipe available to test protection")
        
        # Try to delete without force - should fail with 400
        delete_res = self.session.delete(f"{BASE_URL}/api/recipes/{subrecipe['id']}")
        assert delete_res.status_code == 400, f"Expected 400, got {delete_res.status_code}"
        
        # Verify the sub-recipe still exists
        check_res = self.session.get(f"{BASE_URL}/api/recipes")
        check_recipes = check_res.json()
        still_exists = any(r['id'] == subrecipe['id'] for r in check_recipes)
        assert still_exists, "Sub-recipe was deleted when it shouldn't have been"
        
        print("PASS: Sub-recipe protection still works (DELETE without force returns 400)")

    def test_get_all_history_with_filters(self):
        """Test GET /api/recipes/history/all with optional filters"""
        # Test without filters
        all_res = self.session.get(f"{BASE_URL}/api/recipes/history/all")
        assert all_res.status_code == 200
        all_history = all_res.json()
        assert isinstance(all_history, list)
        
        # Test with action filter
        created_res = self.session.get(f"{BASE_URL}/api/recipes/history/all", params={"action": "created"})
        assert created_res.status_code == 200
        created_history = created_res.json()
        for entry in created_history:
            assert entry.get('action') == 'created'
        
        # Test with limit
        limited_res = self.session.get(f"{BASE_URL}/api/recipes/history/all", params={"limit": 5})
        assert limited_res.status_code == 200
        limited_history = limited_res.json()
        assert len(limited_history) <= 5
        
        print("PASS: GET /api/recipes/history/all works with filters")

    def test_history_sorted_by_timestamp_desc(self):
        """Test that history is returned sorted by timestamp desc (newest first)"""
        # Create a recipe and make multiple updates to generate history
        base_ing = next((i for i in self.ingredients if not i.get('is_subrecipe')), None)
        if not base_ing:
            pytest.skip("No base ingredients available for test")
        
        recipe_name = f"TEST_AUDIT_SORT_{int(time.time())}"
        recipe_data = {
            "product_id": "",
            "product_name": recipe_name,
            "ingredients": [
                {
                    "ingredient_id": base_ing['id'],
                    "ingredient_name": base_ing['name'],
                    "quantity": 1,
                    "unit": base_ing.get('unit', 'unidad'),
                    "waste_percentage": 0
                }
            ],
            "yield_quantity": 1,
            "notes": "V1",
            "is_subrecipe": False,
            "produces_ingredient_id": ""
        }
        
        # Create
        create_res = self.session.post(f"{BASE_URL}/api/recipes", json=recipe_data)
        assert create_res.status_code == 200
        recipe_id = create_res.json()['id']
        time.sleep(0.5)
        
        # Update 1
        recipe_data["notes"] = "V2"
        self.session.put(f"{BASE_URL}/api/recipes/{recipe_id}", json=recipe_data)
        time.sleep(0.5)
        
        # Update 2
        recipe_data["notes"] = "V3"
        self.session.put(f"{BASE_URL}/api/recipes/{recipe_id}", json=recipe_data)
        time.sleep(0.5)
        
        # Get history
        history_res = self.session.get(f"{BASE_URL}/api/recipes/{recipe_id}/history")
        assert history_res.status_code == 200
        history = history_res.json()
        
        # Should have multiple entries
        assert len(history) >= 2
        
        # Verify sorted by timestamp desc
        timestamps = [h.get('timestamp', '') for h in history]
        assert timestamps == sorted(timestamps, reverse=True), "History should be sorted by timestamp desc"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/recipes/{recipe_id}", params={"force": "true"})
        print("PASS: History is sorted by timestamp desc (newest first)")

    def test_audit_log_contains_user_info(self):
        """Test that audit log entries contain user information"""
        # Get any history
        history_res = self.session.get(f"{BASE_URL}/api/recipes/history/all", params={"limit": 10})
        assert history_res.status_code == 200
        history = history_res.json()
        
        if len(history) == 0:
            pytest.skip("No history available to test")
        
        # Check that entries have user_name and user_id fields
        for entry in history:
            assert 'user_name' in entry, "Entry should have user_name"
            assert 'user_id' in entry, "Entry should have user_id"
            assert 'timestamp' in entry, "Entry should have timestamp"
        
        print("PASS: Audit log entries contain user information")

    def test_diff_ingredients_tracks_changes_correctly(self):
        """Test that ingredient changes are tracked with proper diff (added/removed/modified)"""
        # Get two different base ingredients
        base_ings = [i for i in self.ingredients if not i.get('is_subrecipe')]
        if len(base_ings) < 2:
            pytest.skip("Need at least 2 base ingredients for this test")
        
        ing1, ing2 = base_ings[0], base_ings[1]
        
        recipe_name = f"TEST_AUDIT_DIFF_{int(time.time())}"
        recipe_data = {
            "product_id": "",
            "product_name": recipe_name,
            "ingredients": [
                {
                    "ingredient_id": ing1['id'],
                    "ingredient_name": ing1['name'],
                    "quantity": 1,
                    "unit": ing1.get('unit', 'unidad'),
                    "waste_percentage": 0
                }
            ],
            "yield_quantity": 1,
            "notes": "",
            "is_subrecipe": False,
            "produces_ingredient_id": ""
        }
        
        # Create
        create_res = self.session.post(f"{BASE_URL}/api/recipes", json=recipe_data)
        assert create_res.status_code == 200
        recipe_id = create_res.json()['id']
        time.sleep(0.5)
        
        # Update - add second ingredient and modify first
        recipe_data["ingredients"] = [
            {
                "ingredient_id": ing1['id'],
                "ingredient_name": ing1['name'],
                "quantity": 5,  # Modified
                "unit": ing1.get('unit', 'unidad'),
                "waste_percentage": 10  # Modified
            },
            {
                "ingredient_id": ing2['id'],
                "ingredient_name": ing2['name'],
                "quantity": 2,  # Added
                "unit": ing2.get('unit', 'unidad'),
                "waste_percentage": 0
            }
        ]
        
        update_res = self.session.put(f"{BASE_URL}/api/recipes/{recipe_id}", json=recipe_data)
        assert update_res.status_code == 200
        time.sleep(0.5)
        
        # Get history
        history_res = self.session.get(f"{BASE_URL}/api/recipes/{recipe_id}/history")
        assert history_res.status_code == 200
        history = history_res.json()
        
        # Find the update entry
        update_entry = next((h for h in history if h.get('action') == 'updated'), None)
        assert update_entry is not None
        
        # Check that changes were recorded
        changes = update_entry.get('changes', [])
        assert len(changes) > 0, "Changes should be recorded"
        
        # Verify change types
        change_types = [c.get('type') for c in changes]
        # Should have added and modified changes
        assert 'added' in change_types or 'modified' in change_types, "Should have added or modified changes"
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/recipes/{recipe_id}", params={"force": "true"})
        print("PASS: Ingredient changes tracked correctly with proper diff")


class TestExistingAuditData:
    """Test that existing audit data from manual testing is accessible"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({'Authorization': f'Bearer {token}'})
        
        yield

    def test_audit_history_all_returns_existing_data(self):
        """Verify GET /api/recipes/history/all returns existing audit data"""
        response = self.session.get(f"{BASE_URL}/api/recipes/history/all")
        assert response.status_code == 200
        history = response.json()
        
        print(f"Found {len(history)} audit log entries")
        
        if len(history) > 0:
            # Print summary of existing audit data
            actions = {}
            for entry in history:
                action = entry.get('action', 'unknown')
                actions[action] = actions.get(action, 0) + 1
            
            print(f"Actions breakdown: {actions}")
            
            # Verify structure of entries
            for entry in history[:3]:  # Check first 3
                assert 'id' in entry
                assert 'recipe_id' in entry
                assert 'recipe_name' in entry
                assert 'action' in entry
                assert 'timestamp' in entry
        
        print("PASS: All recipe history returns existing audit data")

    def test_existing_recipes_have_history_endpoints(self):
        """Verify existing recipes can be queried for history"""
        # Get all recipes
        recipes_res = self.session.get(f"{BASE_URL}/api/recipes")
        assert recipes_res.status_code == 200
        recipes = recipes_res.json()
        
        print(f"Found {len(recipes)} recipes")
        
        # Check history endpoint for each existing recipe
        for recipe in recipes[:3]:  # Test first 3
            history_res = self.session.get(f"{BASE_URL}/api/recipes/{recipe['id']}/history")
            assert history_res.status_code == 200, f"History endpoint failed for recipe {recipe['id']}"
            print(f"Recipe '{recipe.get('product_name')}': {len(history_res.json())} history entries")
        
        print("PASS: Existing recipes have working history endpoints")
