"""
Backend tests for Inventory Valuation feature
Tests for: GET /api/reports/inventory-valuation endpoint
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestInventoryValuationEndpoint:
    """Tests for /api/reports/inventory-valuation endpoint"""

    def test_get_inventory_valuation_basic(self):
        """Test basic inventory valuation without filters"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "total_value" in data
        assert "total_items" in data
        assert "total_ingredients" in data
        assert "by_category" in data
        assert "by_warehouse" in data
        assert "dead_stock" in data
        assert "items" in data
        
        # Verify data types
        assert isinstance(data["total_value"], (int, float))
        assert isinstance(data["total_items"], int)
        assert isinstance(data["total_ingredients"], int)
        assert isinstance(data["by_category"], dict)
        assert isinstance(data["by_warehouse"], list)
        assert isinstance(data["dead_stock"], dict)
        assert isinstance(data["items"], list)
        
        print(f"Total value: RD$ {data['total_value']}")
        print(f"Total items: {data['total_items']}")
        print(f"Total ingredients: {data['total_ingredients']}")

    def test_inventory_valuation_dead_stock_structure(self):
        """Test dead stock detection has correct structure"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        
        assert response.status_code == 200
        data = response.json()
        
        dead_stock = data["dead_stock"]
        assert "total_value" in dead_stock
        assert "count" in dead_stock
        assert "items" in dead_stock
        
        # Check dead stock item structure
        if dead_stock["count"] > 0:
            item = dead_stock["items"][0]
            assert "ingredient_id" in item
            assert "name" in item
            assert "value" in item
            assert "stock" in item
            assert "movement_30d" in item
            
            print(f"Dead stock count: {dead_stock['count']}")
            print(f"Dead stock value: RD$ {dead_stock['total_value']}")

    def test_inventory_valuation_items_structure(self):
        """Test valuation items have correct structure"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        
        assert response.status_code == 200
        data = response.json()
        
        if len(data["items"]) > 0:
            item = data["items"][0]
            # Verify all required fields
            assert "ingredient_id" in item
            assert "name" in item
            assert "category" in item
            assert "unit" in item
            assert "warehouse_id" in item
            assert "warehouse_name" in item
            assert "current_stock" in item
            assert "unit_cost" in item
            assert "stock_value" in item
            assert "recent_movement" in item
            assert "is_dead_stock" in item
            assert "min_stock" in item
            assert "is_low_stock" in item
            
            print(f"First item: {item['name']} - Stock Value: RD$ {item['stock_value']}")

    def test_inventory_valuation_filter_by_category(self):
        """Test filtering by category"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation?category=licores")
        
        assert response.status_code == 200
        data = response.json()
        
        # All items should be from licores category
        for item in data["items"]:
            assert item["category"] == "licores"
        
        # by_category should only have licores
        assert "licores" in data["by_category"] or len(data["by_category"]) == 0
        
        print(f"Filtered by licores: {len(data['items'])} items, RD$ {data['total_value']}")

    def test_inventory_valuation_filter_by_warehouse(self):
        """Test filtering by warehouse"""
        # First get warehouses
        wh_response = requests.get(f"{BASE_URL}/api/warehouses")
        assert wh_response.status_code == 200
        warehouses = wh_response.json()
        
        if len(warehouses) > 0:
            warehouse_id = warehouses[0]["id"]
            
            response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation?warehouse_id={warehouse_id}")
            
            assert response.status_code == 200
            data = response.json()
            
            # All items should be from this warehouse
            for item in data["items"]:
                assert item["warehouse_id"] == warehouse_id
            
            print(f"Filtered by warehouse: {warehouses[0]['name']} - {len(data['items'])} items, RD$ {data['total_value']}")

    def test_inventory_valuation_combined_filters(self):
        """Test combining category and warehouse filters"""
        # Get warehouses first
        wh_response = requests.get(f"{BASE_URL}/api/warehouses")
        assert wh_response.status_code == 200
        warehouses = wh_response.json()
        
        if len(warehouses) > 0:
            warehouse_id = warehouses[0]["id"]
            
            response = requests.get(
                f"{BASE_URL}/api/reports/inventory-valuation?warehouse_id={warehouse_id}&category=licores"
            )
            
            assert response.status_code == 200
            data = response.json()
            
            # All items should match both filters
            for item in data["items"]:
                assert item["warehouse_id"] == warehouse_id
                assert item["category"] == "licores"
            
            print(f"Combined filter: {len(data['items'])} items, RD$ {data['total_value']}")

    def test_inventory_valuation_by_category_structure(self):
        """Test by_category breakdown has correct structure"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        
        assert response.status_code == 200
        data = response.json()
        
        for cat, cat_data in data["by_category"].items():
            assert "value" in cat_data
            assert "items" in cat_data
            assert "stock_units" in cat_data
            assert isinstance(cat_data["value"], (int, float))
            assert isinstance(cat_data["items"], int)
            
            print(f"Category {cat}: RD$ {cat_data['value']} ({cat_data['items']} items)")

    def test_inventory_valuation_by_warehouse_structure(self):
        """Test by_warehouse breakdown has correct structure"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        
        assert response.status_code == 200
        data = response.json()
        
        for wh_data in data["by_warehouse"]:
            assert "name" in wh_data
            assert "value" in wh_data
            assert "items" in wh_data
            assert isinstance(wh_data["value"], (int, float))
            assert isinstance(wh_data["items"], int)
            
            print(f"Warehouse {wh_data['name']}: RD$ {wh_data['value']} ({wh_data['items']} items)")

    def test_inventory_valuation_calculation_verification(self):
        """Test that stock_value = current_stock * unit_cost"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        
        assert response.status_code == 200
        data = response.json()
        
        for item in data["items"]:
            expected_value = item["current_stock"] * item["unit_cost"]
            # Allow small floating point differences
            assert abs(item["stock_value"] - expected_value) < 0.01, \
                f"Stock value calculation mismatch for {item['name']}: " \
                f"expected {expected_value}, got {item['stock_value']}"
        
        print("All stock value calculations verified correctly")

    def test_inventory_valuation_total_matches_sum(self):
        """Test that total_value matches sum of all items"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        
        assert response.status_code == 200
        data = response.json()
        
        items_sum = sum(item["stock_value"] for item in data["items"])
        # Allow small floating point differences
        assert abs(data["total_value"] - items_sum) < 0.01, \
            f"Total value mismatch: expected {items_sum}, got {data['total_value']}"
        
        print(f"Total value verified: RD$ {data['total_value']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
