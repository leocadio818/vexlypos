"""
Test module for Universal Conversion Analysis endpoint
Tests: GET /api/ingredients/{id}/conversion-analysis
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestConversionAnalysisEndpoint:
    """Tests for conversion analysis endpoint - verifies conversion logic and linked recipes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with headers"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_conversion_analysis_with_linked_recipes(self):
        """Test conversion analysis for Pollo Entero which has 3 linked recipes"""
        # Pollo Entero ID from the seed data
        pollo_id = "c96c4a20-b3a2-4476-9052-988ad5ed0e2f"
        
        response = self.session.get(f"{BASE_URL}/api/ingredients/{pollo_id}/conversion-analysis")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Verify ingredient info structure
        assert "ingredient" in data, "Response should contain 'ingredient' key"
        ingredient = data["ingredient"]
        assert ingredient["id"] == pollo_id
        assert ingredient["name"] == "Pollo Entero"
        assert ingredient["category"] == "carnes"
        
        # Verify conversion fields
        assert "purchase_unit" in ingredient, "Should have purchase_unit"
        assert "purchase_quantity" in ingredient, "Should have purchase_quantity"
        assert "dispatch_unit" in ingredient, "Should have dispatch_unit"
        assert "dispatch_quantity" in ingredient, "Should have dispatch_quantity"
        assert "conversion_factor" in ingredient, "Should have conversion_factor"
        
        # Verify cost fields
        assert "purchase_cost" in ingredient, "Should have purchase_cost"
        assert "dispatch_unit_cost" in ingredient, "Should have dispatch_unit_cost"
        assert ingredient["purchase_cost"] == 85.0, "Pollo Entero should have avg_cost 85.0"
        
        # Verify conversion explanation
        assert "conversion_explanation" in ingredient, "Should have conversion_explanation"
        
        print(f"✓ Ingredient info verified: {ingredient['name']}")
        print(f"  - Purchase: {ingredient['purchase_quantity']} {ingredient['purchase_unit']} @ RD$ {ingredient['purchase_cost']}")
        print(f"  - Dispatch: {ingredient['dispatch_quantity']} {ingredient['dispatch_unit']} @ RD$ {ingredient['dispatch_unit_cost']} c/u")
        print(f"  - Factor: {ingredient['conversion_factor']}")
        print(f"  - Explanation: {ingredient['conversion_explanation']}")
    
    def test_conversion_analysis_linked_products_count(self):
        """Test that Pollo Entero has correct number of linked products"""
        pollo_id = "c96c4a20-b3a2-4476-9052-988ad5ed0e2f"
        
        response = self.session.get(f"{BASE_URL}/api/ingredients/{pollo_id}/conversion-analysis")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify linked products count
        assert "linked_products_count" in data, "Response should contain 'linked_products_count'"
        assert data["linked_products_count"] == 3, f"Expected 3 linked products, got {data['linked_products_count']}"
        
        # Verify linked_recipes array
        assert "linked_recipes" in data, "Response should contain 'linked_recipes'"
        assert len(data["linked_recipes"]) == 3, f"Expected 3 recipes, got {len(data['linked_recipes'])}"
        
        print(f"✓ Linked products count: {data['linked_products_count']}")
    
    def test_conversion_analysis_linked_recipe_structure(self):
        """Test that each linked recipe has all required fields"""
        pollo_id = "c96c4a20-b3a2-4476-9052-988ad5ed0e2f"
        
        response = self.session.get(f"{BASE_URL}/api/ingredients/{pollo_id}/conversion-analysis")
        assert response.status_code == 200
        
        data = response.json()
        linked_recipes = data["linked_recipes"]
        
        required_fields = [
            "recipe_id", "product_id", "product_name", "product_price",
            "quantity_used", "unit", "waste_percentage",
            "cost_per_unit", "base_ingredient_cost", "cost_with_waste", "cost_formula"
        ]
        
        for recipe in linked_recipes:
            for field in required_fields:
                assert field in recipe, f"Recipe should have '{field}' field"
            
            # Verify cost calculation is positive or zero
            assert recipe["cost_with_waste"] >= 0, "Cost with waste should be >= 0"
            
            print(f"✓ Recipe '{recipe['product_name']}': {recipe['quantity_used']} {recipe['unit']}, "
                  f"+{recipe['waste_percentage']}% merma = RD$ {recipe['cost_with_waste']:.2f}")
    
    def test_conversion_analysis_cost_calculation(self):
        """Test that cost calculation is correct: (costo_compra ÷ factor) × cantidad × (1 + merma%)"""
        pollo_id = "c96c4a20-b3a2-4476-9052-988ad5ed0e2f"
        
        response = self.session.get(f"{BASE_URL}/api/ingredients/{pollo_id}/conversion-analysis")
        assert response.status_code == 200
        
        data = response.json()
        ingredient = data["ingredient"]
        linked_recipes = data["linked_recipes"]
        
        purchase_cost = ingredient["purchase_cost"]
        conversion_factor = ingredient["conversion_factor"]
        dispatch_unit_cost = purchase_cost / conversion_factor if conversion_factor > 0 else purchase_cost
        
        # Verify dispatch unit cost calculation
        assert abs(ingredient["dispatch_unit_cost"] - dispatch_unit_cost) < 0.01, \
            f"Dispatch unit cost mismatch: {ingredient['dispatch_unit_cost']} != {dispatch_unit_cost}"
        
        # Verify each recipe's cost calculation
        for recipe in linked_recipes:
            quantity = recipe["quantity_used"]
            waste_pct = recipe["waste_percentage"]
            
            expected_base_cost = dispatch_unit_cost * quantity
            expected_cost_with_waste = expected_base_cost * (1 + waste_pct / 100)
            
            # Allow small floating point difference
            assert abs(recipe["base_ingredient_cost"] - expected_base_cost) < 0.01, \
                f"Base cost mismatch for {recipe['product_name']}"
            assert abs(recipe["cost_with_waste"] - expected_cost_with_waste) < 0.01, \
                f"Cost with waste mismatch for {recipe['product_name']}"
        
        print("✓ Cost calculation formula verified: (costo_compra ÷ factor) × cantidad × (1 + merma%)")
    
    def test_conversion_analysis_total_impact(self):
        """Test that total_cost_impact is the sum of all recipe costs"""
        pollo_id = "c96c4a20-b3a2-4476-9052-988ad5ed0e2f"
        
        response = self.session.get(f"{BASE_URL}/api/ingredients/{pollo_id}/conversion-analysis")
        assert response.status_code == 200
        
        data = response.json()
        
        # Calculate expected total
        expected_total = sum(r["cost_with_waste"] for r in data["linked_recipes"])
        
        assert "total_cost_impact" in data, "Response should have 'total_cost_impact'"
        assert abs(data["total_cost_impact"] - expected_total) < 0.01, \
            f"Total impact mismatch: {data['total_cost_impact']} != {expected_total}"
        
        print(f"✓ Total cost impact: RD$ {data['total_cost_impact']:.2f}")
    
    def test_conversion_analysis_no_linked_recipes(self):
        """Test conversion analysis for Ron Brugal which has 0 linked recipes"""
        # Ron Brugal ID from the seed data
        ron_id = "95cd2cc3-8a2f-432c-984d-79ac871e3d37"
        
        response = self.session.get(f"{BASE_URL}/api/ingredients/{ron_id}/conversion-analysis")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify ingredient info
        assert data["ingredient"]["name"] == "Ron Brugal"
        assert data["ingredient"]["category"] == "licores"
        
        # Verify no linked products
        assert data["linked_products_count"] == 0, "Ron Brugal should have 0 linked products"
        assert len(data["linked_recipes"]) == 0, "Ron Brugal should have empty linked_recipes"
        assert data["total_cost_impact"] == 0, "Total impact should be 0 for no linked products"
        
        print(f"✓ Verified 0 linked products for Ron Brugal")
    
    def test_conversion_analysis_invalid_ingredient(self):
        """Test conversion analysis with invalid ingredient ID returns 404"""
        invalid_id = "non-existent-id-12345"
        
        response = self.session.get(f"{BASE_URL}/api/ingredients/{invalid_id}/conversion-analysis")
        assert response.status_code == 404, f"Expected 404 for invalid ID, got {response.status_code}"
        
        print("✓ Returns 404 for invalid ingredient ID")
    
    def test_conversion_analysis_with_different_conversion_factor(self):
        """Test conversion analysis for Queso Mozzarella which has conversion factor of 16"""
        # Queso Mozzarella ID from the seed data
        queso_id = "71d4608b-b359-4a95-93af-0ab8c6101902"
        
        response = self.session.get(f"{BASE_URL}/api/ingredients/{queso_id}/conversion-analysis")
        assert response.status_code == 200
        
        data = response.json()
        ingredient = data["ingredient"]
        
        # Verify conversion factor is 16
        assert ingredient["conversion_factor"] == 16, f"Expected factor 16, got {ingredient['conversion_factor']}"
        
        # Verify dispatch unit cost is purchase_cost / 16
        expected_dispatch_cost = ingredient["purchase_cost"] / 16
        assert abs(ingredient["dispatch_unit_cost"] - expected_dispatch_cost) < 0.01, \
            f"Dispatch unit cost should be purchase_cost/16"
        
        print(f"✓ Verified conversion factor of 16 for Queso Mozzarella")
        print(f"  - Purchase: {ingredient['purchase_cost']} -> Dispatch: {ingredient['dispatch_unit_cost']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
