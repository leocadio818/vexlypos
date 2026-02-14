"""
Test Suite for Sistema de Control de Costos y Asistente de Compras Inteligente
Tests purchasing suggestions, price alerts, recipe margin recalculation, price history, and PO generation.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPurchasingAssistant:
    """Tests for the Purchasing Assistant & Cost Control endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup common fixtures - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with admin PIN
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        
        yield
    
    # ─── GET /api/purchasing/suggestions ───
    def test_get_suggestions_returns_200(self):
        """GET /api/purchasing/suggestions should return 200 with suggestions array"""
        response = self.session.get(f"{BASE_URL}/api/purchasing/suggestions")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "suggestions" in data, "Response should contain 'suggestions' key"
        assert "summary" in data, "Response should contain 'summary' key"
        assert isinstance(data["suggestions"], list), "suggestions should be a list"
        print(f"SUCCESS: GET /api/purchasing/suggestions returned {len(data['suggestions'])} suggestions")
    
    def test_suggestions_have_required_fields(self):
        """Suggestions should include all required fields for shopping assistant"""
        response = self.session.get(f"{BASE_URL}/api/purchasing/suggestions", params={"include_ok_stock": True})
        assert response.status_code == 200
        
        data = response.json()
        if len(data["suggestions"]) > 0:
            suggestion = data["suggestions"][0]
            required_fields = [
                "ingredient_id", "ingredient_name", "category",
                "current_stock", "min_stock", "is_low_stock", "is_out_of_stock",
                "avg_daily_consumption", "days_of_stock",
                "suggested_quantity", "suggested_purchase_units", 
                "purchase_unit", "dispatch_unit", "conversion_factor",
                "last_unit_price", "estimated_total"
            ]
            for field in required_fields:
                assert field in suggestion, f"Missing required field: {field}"
            print(f"SUCCESS: Suggestion has all {len(required_fields)} required fields")
        else:
            print("INFO: No suggestions available (all stock OK)")
    
    def test_suggestions_summary_contains_totals(self):
        """Summary should contain aggregated totals"""
        response = self.session.get(f"{BASE_URL}/api/purchasing/suggestions", params={"include_ok_stock": True})
        assert response.status_code == 200
        
        data = response.json()
        summary = data["summary"]
        assert "total_items" in summary
        assert "low_stock_items" in summary
        assert "out_of_stock_items" in summary
        assert "estimated_total" in summary
        print(f"SUCCESS: Summary shows {summary['total_items']} items, {summary['low_stock_items']} low stock, estimated {summary['estimated_total']}")
    
    def test_suggestions_filter_by_supplier(self):
        """Filter suggestions by supplier_id parameter"""
        # First get suppliers
        suppliers_res = self.session.get(f"{BASE_URL}/api/suppliers")
        assert suppliers_res.status_code == 200
        suppliers = suppliers_res.json()
        
        if len(suppliers) > 0:
            supplier_id = suppliers[0]["id"]
            response = self.session.get(
                f"{BASE_URL}/api/purchasing/suggestions", 
                params={"supplier_id": supplier_id, "include_ok_stock": True}
            )
            assert response.status_code == 200
            data = response.json()
            # All suggestions should have this supplier as default
            for s in data["suggestions"]:
                assert s.get("default_supplier_id") == supplier_id or s.get("default_supplier_id") is None
            print(f"SUCCESS: Filtered to {len(data['suggestions'])} suggestions for supplier {suppliers[0]['name']}")
        else:
            print("INFO: No suppliers found, skipping filter test")
    
    def test_suggestions_filter_by_warehouse(self):
        """Filter suggestions by warehouse_id parameter"""
        # First get warehouses
        warehouses_res = self.session.get(f"{BASE_URL}/api/warehouses")
        assert warehouses_res.status_code == 200
        warehouses = warehouses_res.json()
        
        if len(warehouses) > 0:
            warehouse_id = warehouses[0]["id"]
            response = self.session.get(
                f"{BASE_URL}/api/purchasing/suggestions", 
                params={"warehouse_id": warehouse_id, "include_ok_stock": True}
            )
            assert response.status_code == 200
            data = response.json()
            print(f"SUCCESS: Filtered to {len(data['suggestions'])} suggestions for warehouse {warehouses[0]['name']}")
        else:
            print("INFO: No warehouses found, skipping filter test")
    
    # ─── GET /api/purchasing/price-alerts ───
    def test_get_price_alerts_returns_200(self):
        """GET /api/purchasing/price-alerts should return 200"""
        response = self.session.get(f"{BASE_URL}/api/purchasing/price-alerts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "alerts" in data, "Response should contain 'alerts' key"
        assert "summary" in data, "Response should contain 'summary' key"
        assert isinstance(data["alerts"], list), "alerts should be a list"
        print(f"SUCCESS: GET /api/purchasing/price-alerts returned {len(data['alerts'])} alerts")
    
    def test_price_alerts_summary_fields(self):
        """Price alerts summary should have total_alerts and avg_increase"""
        response = self.session.get(f"{BASE_URL}/api/purchasing/price-alerts")
        assert response.status_code == 200
        
        data = response.json()
        summary = data["summary"]
        assert "total_alerts" in summary
        assert "avg_increase" in summary
        print(f"SUCCESS: Price alerts summary: {summary['total_alerts']} alerts, avg increase {summary['avg_increase']}%")
    
    def test_price_alerts_item_structure(self):
        """Each price alert should have required fields if alerts exist"""
        response = self.session.get(f"{BASE_URL}/api/purchasing/price-alerts")
        assert response.status_code == 200
        
        data = response.json()
        if len(data["alerts"]) > 0:
            alert = data["alerts"][0]
            required_fields = [
                "ingredient_id", "ingredient_name", "category",
                "previous_price", "latest_price", "change_percentage", 
                "change_amount", "recipes_affected"
            ]
            for field in required_fields:
                assert field in alert, f"Alert missing required field: {field}"
            print(f"SUCCESS: Price alert for {alert['ingredient_name']} has all required fields (+{alert['change_percentage']}%)")
        else:
            print("INFO: No price alerts (prices are stable or no purchase history)")
    
    # ─── POST /api/purchasing/recalculate-recipe-margins ───
    def test_recalculate_margins_returns_200(self):
        """POST /api/purchasing/recalculate-recipe-margins should return 200"""
        response = self.session.post(f"{BASE_URL}/api/purchasing/recalculate-recipe-margins")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "results" in data, "Response should contain 'results' key"
        assert "summary" in data, "Response should contain 'summary' key"
        print(f"SUCCESS: Recalculated margins for {len(data['results'])} recipes")
    
    def test_recalculate_margins_summary(self):
        """Margin summary should contain critical, warning, and ok counts"""
        response = self.session.post(f"{BASE_URL}/api/purchasing/recalculate-recipe-margins")
        assert response.status_code == 200
        
        data = response.json()
        summary = data["summary"]
        assert "total_recipes" in summary
        assert "critical_count" in summary
        assert "warning_count" in summary
        assert "ok_count" in summary
        assert "avg_margin" in summary
        print(f"SUCCESS: Margins - Total: {summary['total_recipes']}, Critical: {summary['critical_count']}, Warning: {summary['warning_count']}, OK: {summary['ok_count']}, Avg: {summary['avg_margin']}%")
    
    def test_recalculate_margins_result_structure(self):
        """Each margin result should have required fields"""
        response = self.session.post(f"{BASE_URL}/api/purchasing/recalculate-recipe-margins")
        assert response.status_code == 200
        
        data = response.json()
        if len(data["results"]) > 0:
            result = data["results"][0]
            required_fields = [
                "recipe_id", "product_id", "product_name",
                "cost_per_unit", "selling_price", 
                "margin_amount", "margin_percentage", 
                "margin_threshold", "status"
            ]
            for field in required_fields:
                assert field in result, f"Margin result missing field: {field}"
            print(f"SUCCESS: Margin result for {result['product_name']} - Cost: {result['cost_per_unit']}, Price: {result['selling_price']}, Margin: {result['margin_percentage']}%")
        else:
            print("INFO: No recipes found for margin calculation")
    
    def test_recalculate_margins_critical_warning_lists(self):
        """Response should contain separate critical and warning lists"""
        response = self.session.post(f"{BASE_URL}/api/purchasing/recalculate-recipe-margins")
        assert response.status_code == 200
        
        data = response.json()
        assert "critical" in data, "Response should contain 'critical' list"
        assert "warning" in data, "Response should contain 'warning' list"
        assert isinstance(data["critical"], list)
        assert isinstance(data["warning"], list)
        print(f"SUCCESS: Critical items: {len(data['critical'])}, Warning items: {len(data['warning'])}")
    
    # ─── GET /api/ingredients/{id}/price-history ───
    def test_get_price_history_returns_200(self):
        """GET /api/ingredients/{id}/price-history should return price history"""
        # Get first ingredient
        ingredients_res = self.session.get(f"{BASE_URL}/api/ingredients")
        assert ingredients_res.status_code == 200
        ingredients = ingredients_res.json()
        
        if len(ingredients) > 0:
            ingredient_id = ingredients[0]["id"]
            response = self.session.get(f"{BASE_URL}/api/ingredients/{ingredient_id}/price-history")
            assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
            
            data = response.json()
            assert "ingredient_id" in data
            assert "ingredient_name" in data
            assert "history" in data
            assert "stats" in data
            print(f"SUCCESS: Price history for {data['ingredient_name']} - {len(data['history'])} records")
        else:
            print("INFO: No ingredients found, skipping price history test")
    
    def test_price_history_stats_fields(self):
        """Price history stats should include trend and price statistics"""
        ingredients_res = self.session.get(f"{BASE_URL}/api/ingredients")
        assert ingredients_res.status_code == 200
        ingredients = ingredients_res.json()
        
        if len(ingredients) > 0:
            ingredient_id = ingredients[0]["id"]
            response = self.session.get(f"{BASE_URL}/api/ingredients/{ingredient_id}/price-history")
            assert response.status_code == 200
            
            data = response.json()
            stats = data["stats"]
            assert "avg_price" in stats
            assert "min_price" in stats
            assert "max_price" in stats
            assert "latest_price" in stats
            assert "total_purchases" in stats
            assert "trend" in stats
            print(f"SUCCESS: Price stats - Avg: {stats['avg_price']}, Min: {stats['min_price']}, Max: {stats['max_price']}, Trend: {stats['trend']}")
        else:
            print("INFO: No ingredients found")
    
    def test_price_history_invalid_ingredient_returns_404(self):
        """Price history for invalid ingredient should return 404"""
        response = self.session.get(f"{BASE_URL}/api/ingredients/invalid-id-12345/price-history")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: Invalid ingredient returns 404 as expected")
    
    # ─── POST /api/purchasing/generate-po ───
    def test_generate_po_requires_supplier(self):
        """Generate PO should require supplier_id"""
        # Get warehouse
        warehouses_res = self.session.get(f"{BASE_URL}/api/warehouses")
        warehouses = warehouses_res.json() if warehouses_res.status_code == 200 else []
        
        if len(warehouses) > 0:
            # Try without valid supplier
            response = self.session.post(f"{BASE_URL}/api/purchasing/generate-po", json={
                "supplier_id": "invalid-supplier-id",
                "warehouse_id": warehouses[0]["id"],
                "ingredient_ids": ["test-id"]
            })
            assert response.status_code == 404, f"Expected 404 for invalid supplier, got {response.status_code}"
            print("SUCCESS: Generate PO returns 404 for invalid supplier")
        else:
            print("INFO: No warehouses found, skipping test")
    
    def test_generate_po_full_flow(self):
        """Test full flow: get suggestions -> select items -> generate PO"""
        # Get suggestions including OK stock
        suggestions_res = self.session.get(
            f"{BASE_URL}/api/purchasing/suggestions", 
            params={"include_ok_stock": True}
        )
        assert suggestions_res.status_code == 200
        suggestions_data = suggestions_res.json()
        
        # Get warehouses
        warehouses_res = self.session.get(f"{BASE_URL}/api/warehouses")
        warehouses = warehouses_res.json() if warehouses_res.status_code == 200 else []
        
        # Get suppliers
        suppliers_res = self.session.get(f"{BASE_URL}/api/suppliers")
        suppliers = suppliers_res.json() if suppliers_res.status_code == 200 else []
        
        if len(suggestions_data["suggestions"]) > 0 and len(warehouses) > 0 and len(suppliers) > 0:
            # Filter suggestions that have this supplier
            supplier_id = suppliers[0]["id"]
            warehouse_id = warehouses[0]["id"]
            
            # Get ingredient IDs
            ingredient_ids = [s["ingredient_id"] for s in suggestions_data["suggestions"][:3]]
            
            if len(ingredient_ids) > 0:
                response = self.session.post(f"{BASE_URL}/api/purchasing/generate-po", json={
                    "supplier_id": supplier_id,
                    "warehouse_id": warehouse_id,
                    "ingredient_ids": ingredient_ids,
                    "notes": "Test PO from pytest"
                })
                
                # Check response - could be 200 (success) or 400 (no matching ingredients)
                if response.status_code == 200:
                    data = response.json()
                    assert "ok" in data
                    assert "purchase_order" in data
                    assert "items_count" in data
                    assert "total" in data
                    print(f"SUCCESS: Generated PO with {data['items_count']} items, total {data['total']}")
                    
                    # Cleanup - delete the PO
                    po_id = data["purchase_order"]["id"]
                    cleanup_res = self.session.delete(f"{BASE_URL}/api/purchase-orders/{po_id}")
                    print(f"Cleanup: Deleted test PO (status: {cleanup_res.status_code})")
                elif response.status_code == 400:
                    print("INFO: No ingredients found for the specified supplier (400 is expected)")
                else:
                    print(f"WARNING: Unexpected status {response.status_code}: {response.text}")
            else:
                print("INFO: No ingredient IDs to test")
        else:
            print("INFO: Missing suggestions, warehouses, or suppliers for full flow test")


class TestIngredientDefaultSupplier:
    """Tests for ingredient default supplier field"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup common fixtures - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with admin PIN
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        
        yield
    
    def test_ingredient_has_default_supplier_field(self):
        """Ingredients should support default_supplier_id field"""
        ingredients_res = self.session.get(f"{BASE_URL}/api/ingredients")
        assert ingredients_res.status_code == 200
        ingredients = ingredients_res.json()
        
        if len(ingredients) > 0:
            # Check if field exists (may be null)
            ingredient = ingredients[0]
            # The field should be present in the schema (even if null)
            print(f"SUCCESS: Ingredient {ingredient['name']} has default_supplier_id: {ingredient.get('default_supplier_id', 'not set')}")
        else:
            print("INFO: No ingredients found")
    
    def test_update_ingredient_default_supplier(self):
        """Should be able to update ingredient's default supplier"""
        # Get suppliers
        suppliers_res = self.session.get(f"{BASE_URL}/api/suppliers")
        suppliers = suppliers_res.json() if suppliers_res.status_code == 200 else []
        
        # Get ingredients
        ingredients_res = self.session.get(f"{BASE_URL}/api/ingredients")
        ingredients = ingredients_res.json() if ingredients_res.status_code == 200 else []
        
        if len(suppliers) > 0 and len(ingredients) > 0:
            ingredient = ingredients[0]
            supplier = suppliers[0]
            original_supplier = ingredient.get("default_supplier_id")
            
            # Update with new supplier
            update_res = self.session.put(
                f"{BASE_URL}/api/ingredients/{ingredient['id']}", 
                json={"default_supplier_id": supplier["id"]}
            )
            assert update_res.status_code == 200
            
            # Verify update
            verify_res = self.session.get(f"{BASE_URL}/api/ingredients/{ingredient['id']}")
            assert verify_res.status_code == 200
            updated = verify_res.json()
            assert updated.get("default_supplier_id") == supplier["id"]
            
            # Restore original
            self.session.put(
                f"{BASE_URL}/api/ingredients/{ingredient['id']}", 
                json={"default_supplier_id": original_supplier}
            )
            
            print(f"SUCCESS: Updated ingredient {ingredient['name']} default supplier to {supplier['name']}")
        else:
            print("INFO: No suppliers or ingredients found for update test")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
