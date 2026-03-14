"""
Test Modifier Groups CRUD Operations
Tests: PUT /api/modifier-groups/{gid}, DELETE /api/modifier-groups/{gid}
       GET /api/modifier-groups, GET /api/modifier-groups-with-options
       POST /api/modifier-groups
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://minimalist-pos.preview.emergentagent.com')

class TestModifierGroupsCRUD:
    """Test modifier group CRUD operations"""
    
    # ============== GET Endpoints ==============
    
    def test_get_modifier_groups(self):
        """Test GET /api/modifier-groups returns list of new-style groups"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected a list response"
        print(f"Found {len(data)} modifier groups")
        
        # Verify structure of groups
        for group in data:
            assert 'id' in group, f"Group missing 'id' field: {group}"
            assert 'name' in group, f"Group missing 'name' field: {group}"
            print(f"  - {group['name']} (id: {group['id']})")
    
    def test_get_modifier_groups_with_options(self):
        """Test GET /api/modifier-groups-with-options returns groups with enriched options"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected a list response"
        print(f"Found {len(data)} modifier groups with options")
        
        # Verify structure
        for group in data:
            assert 'id' in group, f"Group missing 'id' field"
            assert 'name' in group, f"Group missing 'name' field"
            # Options may be nested or in options array
            options = group.get('options', [])
            print(f"  - {group['name']}: {len(options)} options")
    
    # ============== POST - Create Modifier Group ==============
    
    def test_create_modifier_group(self):
        """Test POST /api/modifier-groups creates a new group"""
        unique_name = f"TEST_Group_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "min_selection": 0,
            "max_selection": 3
        }
        
        response = requests.post(
            f"{BASE_URL}/api/modifier-groups",
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'id' in data, "Response missing 'id'"
        assert data['name'] == unique_name, f"Name mismatch: expected {unique_name}, got {data.get('name')}"
        
        print(f"Created group: {unique_name} with id: {data['id']}")
        
        # Store for cleanup
        self.__class__.created_group_id = data['id']
        self.__class__.created_group_name = unique_name
        
        return data['id']
    
    # ============== PUT - Rename Modifier Group ==============
    
    def test_rename_modifier_group(self):
        """Test PUT /api/modifier-groups/{gid} renames a group"""
        # First create a group to rename
        unique_name = f"TEST_Rename_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/modifier-groups",
            json={"name": unique_name, "min_selection": 0, "max_selection": 1}
        )
        assert create_response.status_code == 200
        group_id = create_response.json()['id']
        
        # Now rename it
        new_name = f"RENAMED_{uuid.uuid4().hex[:8]}"
        rename_response = requests.put(
            f"{BASE_URL}/api/modifier-groups/{group_id}",
            json={"name": new_name}
        )
        assert rename_response.status_code == 200, f"Rename failed: {rename_response.status_code}: {rename_response.text}"
        
        rename_data = rename_response.json()
        assert rename_data.get('ok') == True, f"Expected ok:true, got {rename_data}"
        
        print(f"Renamed group from '{unique_name}' to '{new_name}'")
        
        # Verify the rename persisted by fetching groups again
        get_response = requests.get(f"{BASE_URL}/api/modifier-groups")
        groups = get_response.json()
        renamed_group = next((g for g in groups if g['id'] == group_id), None)
        assert renamed_group is not None, f"Group {group_id} not found after rename"
        assert renamed_group['name'] == new_name, f"Name not updated: expected '{new_name}', got '{renamed_group['name']}'"
        
        print(f"Verified: Group name is now '{renamed_group['name']}'")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/modifier-groups/{group_id}")
        return group_id
    
    def test_update_modifier_group_selection_limits(self):
        """Test PUT /api/modifier-groups/{gid} updates min/max selection"""
        # Create a group
        unique_name = f"TEST_Limits_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/modifier-groups",
            json={"name": unique_name, "min_selection": 0, "max_selection": 1}
        )
        assert create_response.status_code == 200
        group_id = create_response.json()['id']
        
        # Update limits
        update_response = requests.put(
            f"{BASE_URL}/api/modifier-groups/{group_id}",
            json={"min_selection": 1, "max_selection": 5}
        )
        assert update_response.status_code == 200
        
        # Verify update
        get_response = requests.get(f"{BASE_URL}/api/modifier-groups")
        groups = get_response.json()
        updated_group = next((g for g in groups if g['id'] == group_id), None)
        assert updated_group is not None
        assert updated_group.get('min_selection') == 1, f"min_selection not updated"
        assert updated_group.get('max_selection') == 5, f"max_selection not updated"
        
        print(f"Updated group limits: min={updated_group.get('min_selection')}, max={updated_group.get('max_selection')}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/modifier-groups/{group_id}")
    
    # ============== DELETE - Delete Modifier Group ==============
    
    def test_delete_modifier_group(self):
        """Test DELETE /api/modifier-groups/{gid} deletes a group"""
        # Create a group to delete
        unique_name = f"TEST_Delete_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/modifier-groups",
            json={"name": unique_name, "min_selection": 0, "max_selection": 1}
        )
        assert create_response.status_code == 200
        group_id = create_response.json()['id']
        
        print(f"Created group to delete: {unique_name} (id: {group_id})")
        
        # Verify it exists
        get_response = requests.get(f"{BASE_URL}/api/modifier-groups")
        groups = get_response.json()
        assert any(g['id'] == group_id for g in groups), "Group not found after creation"
        
        # Delete it
        delete_response = requests.delete(f"{BASE_URL}/api/modifier-groups/{group_id}")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.status_code}: {delete_response.text}"
        
        delete_data = delete_response.json()
        assert delete_data.get('ok') == True, f"Expected ok:true, got {delete_data}"
        
        print(f"Deleted group: {unique_name}")
        
        # Verify it's gone
        get_response2 = requests.get(f"{BASE_URL}/api/modifier-groups")
        groups2 = get_response2.json()
        assert not any(g['id'] == group_id for g in groups2), "Group still exists after deletion"
        
        print(f"Verified: Group no longer exists")
    
    def test_delete_modifier_group_cascades_to_modifiers(self):
        """Test DELETE /api/modifier-groups/{gid} also deletes associated modifiers"""
        # Create a group
        unique_name = f"TEST_Cascade_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/modifier-groups",
            json={"name": unique_name, "min_selection": 0, "max_selection": 1}
        )
        assert create_response.status_code == 200
        group_id = create_response.json()['id']
        
        # Add modifiers to the group
        modifier_ids = []
        for i in range(2):
            mod_response = requests.post(
                f"{BASE_URL}/api/modifiers",
                json={"group_id": group_id, "name": f"Option {i}", "price": i * 10}
            )
            assert mod_response.status_code == 200
            modifier_ids.append(mod_response.json()['id'])
        
        print(f"Created group '{unique_name}' with {len(modifier_ids)} modifiers")
        
        # Verify modifiers exist
        mods_response = requests.get(f"{BASE_URL}/api/modifiers", params={"group_id": group_id})
        mods = mods_response.json()
        assert len(mods) == 2, f"Expected 2 modifiers, found {len(mods)}"
        
        # Delete the group
        delete_response = requests.delete(f"{BASE_URL}/api/modifier-groups/{group_id}")
        assert delete_response.status_code == 200
        
        print(f"Deleted group: {unique_name}")
        
        # Verify modifiers are also deleted
        mods_response2 = requests.get(f"{BASE_URL}/api/modifiers", params={"group_id": group_id})
        mods2 = mods_response2.json()
        assert len(mods2) == 0, f"Expected 0 modifiers after cascade delete, found {len(mods2)}"
        
        print(f"Verified: Associated modifiers were cascade deleted")
    
    # ============== Edge Cases ==============
    
    def test_rename_nonexistent_group(self):
        """Test PUT /api/modifier-groups/{gid} with non-existent ID"""
        fake_id = str(uuid.uuid4())
        response = requests.put(
            f"{BASE_URL}/api/modifier-groups/{fake_id}",
            json={"name": "NonExistent"}
        )
        # MongoDB update_one returns success even if no doc matched
        # The endpoint returns ok:true regardless (common pattern)
        assert response.status_code == 200
        print(f"PUT on non-existent ID returns status {response.status_code}")
    
    def test_delete_nonexistent_group(self):
        """Test DELETE /api/modifier-groups/{gid} with non-existent ID"""
        fake_id = str(uuid.uuid4())
        response = requests.delete(f"{BASE_URL}/api/modifier-groups/{fake_id}")
        # MongoDB delete_one returns success even if no doc matched
        assert response.status_code == 200
        print(f"DELETE on non-existent ID returns status {response.status_code}")


class TestExistingModifierGroups:
    """Test operations on existing modifier groups: Temperatura, SIN, SALSAS"""
    
    def test_existing_groups_present(self):
        """Verify existing groups Temperatura, SIN, SALSAS are present"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups")
        assert response.status_code == 200
        
        groups = response.json()
        group_names = [g['name'] for g in groups]
        
        expected_groups = ['Temperatura', 'SIN', 'SALSAS']
        for expected in expected_groups:
            assert expected in group_names, f"Expected group '{expected}' not found. Found: {group_names}"
        
        print(f"Verified existing groups: {expected_groups}")
    
    def test_rename_existing_group_and_revert(self):
        """Test renaming an existing group (Temperatura) and reverting"""
        # Find Temperatura group
        response = requests.get(f"{BASE_URL}/api/modifier-groups")
        groups = response.json()
        temperatura = next((g for g in groups if g['name'] == 'Temperatura'), None)
        
        if not temperatura:
            pytest.skip("Temperatura group not found")
        
        original_name = temperatura['name']
        group_id = temperatura['id']
        
        # Rename it
        temp_name = f"Temp_Renamed_{uuid.uuid4().hex[:6]}"
        rename_response = requests.put(
            f"{BASE_URL}/api/modifier-groups/{group_id}",
            json={"name": temp_name}
        )
        assert rename_response.status_code == 200
        
        print(f"Renamed Temperatura to {temp_name}")
        
        # Verify rename
        response2 = requests.get(f"{BASE_URL}/api/modifier-groups")
        groups2 = response2.json()
        renamed = next((g for g in groups2 if g['id'] == group_id), None)
        assert renamed['name'] == temp_name
        
        # Revert name
        revert_response = requests.put(
            f"{BASE_URL}/api/modifier-groups/{group_id}",
            json={"name": original_name}
        )
        assert revert_response.status_code == 200
        
        print(f"Reverted back to {original_name}")
        
        # Verify revert
        response3 = requests.get(f"{BASE_URL}/api/modifier-groups")
        groups3 = response3.json()
        reverted = next((g for g in groups3 if g['id'] == group_id), None)
        assert reverted['name'] == original_name


class TestModifierGroupsWithOptions:
    """Test the enriched endpoint that returns groups with their options"""
    
    def test_groups_have_options_array(self):
        """Test that modifier-groups-with-options includes options"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        assert response.status_code == 200
        
        groups = response.json()
        groups_with_options = [g for g in groups if g.get('options') and len(g.get('options', [])) > 0]
        
        print(f"Found {len(groups_with_options)} groups with options")
        
        for group in groups_with_options[:3]:  # Show first 3
            print(f"  - {group['name']}: {len(group.get('options', []))} options")
            for opt in group.get('options', [])[:2]:  # Show first 2 options
                print(f"      * {opt.get('name')} (${opt.get('price', 0)})")
    
    def test_new_style_groups_show_linked_options(self):
        """Test that new-style groups show their linked options"""
        # Create a new group with options
        unique_name = f"TEST_WithOpts_{uuid.uuid4().hex[:8]}"
        create_response = requests.post(
            f"{BASE_URL}/api/modifier-groups",
            json={"name": unique_name, "min_selection": 0, "max_selection": 2}
        )
        assert create_response.status_code == 200
        group_id = create_response.json()['id']
        
        # Add options
        for i, opt_name in enumerate(['Hot', 'Medium', 'Mild']):
            requests.post(
                f"{BASE_URL}/api/modifiers",
                json={"group_id": group_id, "name": opt_name, "price": i * 5}
            )
        
        # Fetch with options
        response = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        groups = response.json()
        
        test_group = next((g for g in groups if g['id'] == group_id), None)
        assert test_group is not None, f"Created group not found in response"
        
        options = test_group.get('options', [])
        assert len(options) == 3, f"Expected 3 options, got {len(options)}"
        
        print(f"Verified: Group '{unique_name}' has {len(options)} options")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/modifier-groups/{group_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
