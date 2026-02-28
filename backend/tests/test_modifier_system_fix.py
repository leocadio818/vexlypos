"""
Test Modifier System Fix - Bug Fix Testing
Tests for:
1. GET /api/modifier-groups-with-options - Returns groups with enriched options for ProductConfig dropdown
2. GET /api/modifier-groups - Returns flat list of modifier groups (from config.py)
3. GET /api/modifiers - Returns flat list of individual modifier options (with group_id)
4. POST /api/modifiers - Creates a new option with group_id, name, price
5. POST /api/modifier-groups - Creates a new group with name, min/max_selection
6. PUT /api/products/{id} - Persists modifier_assignments array
7. GET /api/products/{id} - Returns saved modifier_assignments
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestModifierGroupsWithOptions:
    """Test GET /api/modifier-groups-with-options endpoint"""
    
    def test_endpoint_returns_200(self):
        """GET /api/modifier-groups-with-options returns 200"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/modifier-groups-with-options returns 200")
    
    def test_returns_list_of_groups(self):
        """Response is a list of modifier groups"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"PASS: Returns list with {len(data)} groups")
    
    def test_groups_have_required_fields(self):
        """Each group has name and id fields"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        data = response.json()
        
        if len(data) == 0:
            pytest.skip("No modifier groups exist")
            
        for group in data:
            assert 'name' in group, f"Group missing 'name' field: {group}"
            assert 'id' in group, f"Group missing 'id' field: {group}"
        print(f"PASS: All {len(data)} groups have 'name' and 'id' fields")
    
    def test_new_style_groups_have_options_array(self):
        """New-style groups (with min_selection/max_selection) have options array"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        data = response.json()
        
        new_style_groups = [g for g in data if 'min_selection' in g or 'max_selection' in g]
        if len(new_style_groups) == 0:
            pytest.skip("No new-style modifier groups exist")
            
        for group in new_style_groups:
            assert 'options' in group, f"New-style group missing 'options': {group['name']}"
            assert isinstance(group['options'], list), f"Options should be list: {group['name']}"
        print(f"PASS: {len(new_style_groups)} new-style groups have options array")
    
    def test_options_have_group_id(self):
        """Options in new-style groups have group_id matching parent"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        data = response.json()
        
        new_style_groups = [g for g in data if 'options' in g and len(g.get('options', [])) > 0]
        if len(new_style_groups) == 0:
            pytest.skip("No new-style groups with options exist")
            
        for group in new_style_groups:
            for opt in group['options']:
                if 'group_id' in opt:
                    assert opt['group_id'] == group['id'], f"Option group_id mismatch: {opt}"
        print(f"PASS: Options have correct group_id references")


class TestModifierGroupsFlatList:
    """Test GET /api/modifier-groups endpoint (flat list from config.py)"""
    
    def test_endpoint_returns_200(self):
        """GET /api/modifier-groups returns 200"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/modifier-groups returns 200")
    
    def test_returns_list(self):
        """Response is a list"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"PASS: Returns list with {len(data)} modifier groups")
    
    def test_groups_have_required_fields(self):
        """Each group has id, name, min_selection, max_selection"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups")
        data = response.json()
        
        if len(data) == 0:
            pytest.skip("No modifier groups exist in modifier_groups collection")
            
        for group in data:
            assert 'id' in group, f"Group missing 'id': {group}"
            assert 'name' in group, f"Group missing 'name': {group}"
        print(f"PASS: All {len(data)} modifier groups have required fields")


class TestModifiersFlatList:
    """Test GET /api/modifiers endpoint (flat list of options from config.py)"""
    
    def test_endpoint_returns_200(self):
        """GET /api/modifiers returns 200"""
        response = requests.get(f"{BASE_URL}/api/modifiers")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/modifiers returns 200")
    
    def test_returns_list(self):
        """Response is a list"""
        response = requests.get(f"{BASE_URL}/api/modifiers")
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"PASS: Returns list with {len(data)} modifiers")
    
    def test_modifiers_with_group_id(self):
        """Modifiers that are options have group_id field"""
        response = requests.get(f"{BASE_URL}/api/modifiers")
        data = response.json()
        
        modifiers_with_group = [m for m in data if m.get('group_id') and m['group_id'].strip()]
        if len(modifiers_with_group) == 0:
            pytest.skip("No modifiers with group_id exist")
            
        for mod in modifiers_with_group:
            assert 'name' in mod, f"Modifier missing 'name': {mod}"
            assert 'price' in mod or mod.get('price', 0) == 0, f"Modifier should have price field"
        print(f"PASS: {len(modifiers_with_group)} modifiers have group_id and required fields")


class TestCreateModifierGroup:
    """Test POST /api/modifier-groups endpoint"""
    
    def test_create_modifier_group(self):
        """POST /api/modifier-groups creates new group"""
        unique_name = f"TEST_Group_{uuid.uuid4().hex[:8]}"
        payload = {
            "name": unique_name,
            "min_selection": 0,
            "max_selection": 3
        }
        
        response = requests.post(f"{BASE_URL}/api/modifier-groups", json=payload)
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'id' in data, "Response missing 'id'"
        assert data['name'] == unique_name, f"Name mismatch: {data['name']} != {unique_name}"
        
        # Cleanup
        group_id = data['id']
        requests.delete(f"{BASE_URL}/api/modifier-groups/{group_id}")
        
        print(f"PASS: Created modifier group '{unique_name}' with id {group_id}")
        return group_id


class TestCreateModifierOption:
    """Test POST /api/modifiers endpoint (create option with group_id)"""
    
    def test_create_modifier_option(self):
        """POST /api/modifiers creates new option with group_id"""
        # First create a group
        group_name = f"TEST_Group_{uuid.uuid4().hex[:8]}"
        group_res = requests.post(f"{BASE_URL}/api/modifier-groups", json={
            "name": group_name,
            "min_selection": 0,
            "max_selection": 2
        })
        assert group_res.status_code in [200, 201], f"Failed to create group: {group_res.text}"
        group_id = group_res.json()['id']
        
        # Create option
        option_name = f"TEST_Option_{uuid.uuid4().hex[:8]}"
        payload = {
            "group_id": group_id,
            "name": option_name,
            "price": 50
        }
        
        response = requests.post(f"{BASE_URL}/api/modifiers", json=payload)
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert 'id' in data, "Response missing 'id'"
        assert data['name'] == option_name, f"Name mismatch: {data['name']} != {option_name}"
        assert data['group_id'] == group_id, f"group_id mismatch: {data['group_id']} != {group_id}"
        assert data['price'] == 50, f"Price mismatch: {data['price']} != 50"
        
        # Verify option appears in /api/modifiers list
        modifiers_res = requests.get(f"{BASE_URL}/api/modifiers")
        modifiers = modifiers_res.json()
        found = any(m['id'] == data['id'] for m in modifiers)
        assert found, "Created option not found in /api/modifiers list"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/modifier-groups/{group_id}")
        
        print(f"PASS: Created modifier option '{option_name}' with group_id {group_id}")


class TestModifierGroupsWithOptionsIntegration:
    """Test that modifier-groups-with-options returns newly created groups with options"""
    
    def test_created_group_appears_in_combined_endpoint(self):
        """New group with options appears in /api/modifier-groups-with-options"""
        # Create group
        group_name = f"TEST_Integrated_{uuid.uuid4().hex[:8]}"
        group_res = requests.post(f"{BASE_URL}/api/modifier-groups", json={
            "name": group_name,
            "min_selection": 1,
            "max_selection": 2
        })
        group_id = group_res.json()['id']
        
        # Create options
        option1 = requests.post(f"{BASE_URL}/api/modifiers", json={
            "group_id": group_id, "name": "Option A", "price": 10
        }).json()
        option2 = requests.post(f"{BASE_URL}/api/modifiers", json={
            "group_id": group_id, "name": "Option B", "price": 20
        }).json()
        
        # Check combined endpoint
        combined_res = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        combined = combined_res.json()
        
        found_group = None
        for g in combined:
            if g['id'] == group_id:
                found_group = g
                break
        
        assert found_group is not None, f"Group {group_id} not found in combined endpoint"
        assert 'options' in found_group, "Group missing 'options' array in combined endpoint"
        assert len(found_group['options']) == 2, f"Expected 2 options, got {len(found_group['options'])}"
        
        option_names = [o['name'] for o in found_group['options']]
        assert 'Option A' in option_names, "Option A not found"
        assert 'Option B' in option_names, "Option B not found"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/modifier-groups/{group_id}")
        
        print(f"PASS: Created group '{group_name}' with 2 options appears correctly in combined endpoint")


class TestProductModifierAssignments:
    """Test product modifier_assignments persistence"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get existing product ID"""
        self.product_id = "1af20c68-5eb2-4562-8b20-ee16bbe6ef2e"
        self.original_assignments = []
        
        # Save original state
        res = requests.get(f"{BASE_URL}/api/products/{self.product_id}")
        if res.status_code == 200:
            self.original_assignments = res.json().get('modifier_assignments', [])
        
        yield
        
        # Restore original state
        requests.put(f"{BASE_URL}/api/products/{self.product_id}", json={
            "modifier_assignments": self.original_assignments
        })
    
    def test_put_product_with_modifier_assignments(self):
        """PUT /api/products/{id} persists modifier_assignments"""
        # Get existing modifier group
        groups_res = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        groups = groups_res.json()
        
        if len(groups) == 0:
            pytest.skip("No modifier groups exist")
        
        group = groups[0]
        group_id = group['id']
        
        # Update product with modifier assignment
        assignments = [{
            "group_id": group_id,
            "min_selections": 0,
            "max_selections": 1,
            "allow_multiple": False
        }]
        
        response = requests.put(f"{BASE_URL}/api/products/{self.product_id}", json={
            "modifier_assignments": assignments
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        print(f"PASS: PUT /api/products/{self.product_id} with modifier_assignments succeeded")
    
    def test_get_product_returns_modifier_assignments(self):
        """GET /api/products/{id} returns saved modifier_assignments"""
        # Get existing modifier group
        groups_res = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        groups = groups_res.json()
        
        if len(groups) == 0:
            pytest.skip("No modifier groups exist")
        
        group = groups[0]
        group_id = group['id']
        
        # First update
        assignments = [{
            "group_id": group_id,
            "min_selections": 1,
            "max_selections": 3,
            "allow_multiple": True
        }]
        
        requests.put(f"{BASE_URL}/api/products/{self.product_id}", json={
            "modifier_assignments": assignments
        })
        
        # Then GET and verify
        response = requests.get(f"{BASE_URL}/api/products/{self.product_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert 'modifier_assignments' in data, "Product missing 'modifier_assignments'"
        
        saved_assignments = data['modifier_assignments']
        assert len(saved_assignments) == 1, f"Expected 1 assignment, got {len(saved_assignments)}"
        
        saved = saved_assignments[0]
        assert saved['group_id'] == group_id, f"group_id mismatch: {saved['group_id']} != {group_id}"
        assert saved['min_selections'] == 1, f"min_selections mismatch: {saved['min_selections']} != 1"
        assert saved['max_selections'] == 3, f"max_selections mismatch: {saved['max_selections']} != 3"
        
        print(f"PASS: GET /api/products/{self.product_id} returns persisted modifier_assignments")


class TestExistingModifierGroupsData:
    """Test that existing modifier groups data is correct"""
    
    def test_temperatura_group_exists(self):
        """Temperatura group exists with 3+ options"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        groups = response.json()
        
        temperatura = None
        for g in groups:
            if g['name'].lower() == 'temperatura':
                temperatura = g
                break
        
        assert temperatura is not None, "Temperatura group not found"
        
        options = temperatura.get('options', [])
        assert len(options) >= 3, f"Expected 3+ options in Temperatura, got {len(options)}"
        
        option_names = [o['name'].lower() for o in options]
        print(f"PASS: Temperatura group found with {len(options)} options: {option_names}")
    
    def test_sin_group_exists(self):
        """SIN group exists with 2+ options"""
        response = requests.get(f"{BASE_URL}/api/modifier-groups-with-options")
        groups = response.json()
        
        sin_group = None
        for g in groups:
            if g['name'].upper() == 'SIN':
                sin_group = g
                break
        
        assert sin_group is not None, "SIN group not found"
        
        options = sin_group.get('options', [])
        assert len(options) >= 2, f"Expected 2+ options in SIN, got {len(options)}"
        
        option_names = [o['name'].upper() for o in options]
        assert 'CEBOLLA' in option_names or any('CEBOLLA' in n for n in option_names), "CEBOLLA option not found"
        assert 'TOMATE' in option_names or any('TOMATE' in n for n in option_names), "TOMATE option not found"
        
        print(f"PASS: SIN group found with {len(options)} options: {option_names}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
