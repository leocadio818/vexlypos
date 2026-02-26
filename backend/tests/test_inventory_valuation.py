"""
Inventory Valuation Endpoints Tests
Tests for:
- GET /api/reports/inventory-valuation - Returns inventory valuation data with correct field names
- GET /api/reports/valuation-trends - Returns valuation trends with category distribution
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestInventoryValuationEndpoint:
    """Tests for GET /api/reports/inventory-valuation endpoint"""
    
    def test_inventory_valuation_returns_200(self):
        """Endpoint returns 200 OK"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ Inventory valuation endpoint returns 200")
    
    def test_inventory_valuation_has_total_value(self):
        """Response contains total_value > 0"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        data = response.json()
        assert "total_value" in data, "Missing total_value field"
        # Based on issue context: should be 4000.00 (48 bottles * 83.33)
        assert data["total_value"] > 0, f"Expected total_value > 0, got {data['total_value']}"
        assert data["total_value"] == 4000.0, f"Expected total_value = 4000.0, got {data['total_value']}"
        print(f"✓ total_value = {data['total_value']}")
    
    def test_inventory_valuation_has_total_items(self):
        """Response contains total_items"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        data = response.json()
        assert "total_items" in data, "Missing total_items field"
        assert data["total_items"] >= 1, f"Expected at least 1 item, got {data['total_items']}"
        print(f"✓ total_items = {data['total_items']}")
    
    def test_inventory_valuation_has_total_ingredients(self):
        """Response contains total_ingredients"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        data = response.json()
        assert "total_ingredients" in data, "Missing total_ingredients field"
        assert data["total_ingredients"] >= 1, f"Expected at least 1 ingredient, got {data['total_ingredients']}"
        print(f"✓ total_ingredients = {data['total_ingredients']}")
    
    def test_inventory_valuation_has_by_category_as_object(self):
        """Response by_category is an object keyed by category"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        data = response.json()
        assert "by_category" in data, "Missing by_category field"
        assert isinstance(data["by_category"], dict), f"by_category should be dict, got {type(data['by_category'])}"
        # Should have 'bebidas' category based on issue context
        assert "bebidas" in data["by_category"], "Expected 'bebidas' category"
        bebidas = data["by_category"]["bebidas"]
        assert "value" in bebidas, "by_category item missing 'value'"
        assert "items" in bebidas, "by_category item missing 'items'"
        print(f"✓ by_category = {list(data['by_category'].keys())}")
    
    def test_inventory_valuation_has_by_warehouse_as_array(self):
        """Response by_warehouse is an array"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        data = response.json()
        assert "by_warehouse" in data, "Missing by_warehouse field"
        assert isinstance(data["by_warehouse"], list), f"by_warehouse should be list, got {type(data['by_warehouse'])}"
        assert len(data["by_warehouse"]) >= 1, "Expected at least 1 warehouse"
        # Check warehouse item structure
        wh = data["by_warehouse"][0]
        assert "name" in wh, "by_warehouse item missing 'name'"
        assert "value" in wh, "by_warehouse item missing 'value'"
        assert "items" in wh, "by_warehouse item missing 'items'"
        # Should have 'Almacen Principal'
        wh_names = [w["name"] for w in data["by_warehouse"]]
        assert "Almacen Principal" in wh_names, f"Expected 'Almacen Principal', got {wh_names}"
        print(f"✓ by_warehouse names = {wh_names}")
    
    def test_inventory_valuation_has_dead_stock(self):
        """Response contains dead_stock object"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        data = response.json()
        assert "dead_stock" in data, "Missing dead_stock field"
        dead = data["dead_stock"]
        assert "count" in dead, "dead_stock missing 'count'"
        assert "total_value" in dead, "dead_stock missing 'total_value'"
        assert "items" in dead, "dead_stock missing 'items'"
        print(f"✓ dead_stock count = {dead['count']}")
    
    def test_inventory_valuation_items_have_correct_field_names(self):
        """Items have all required fields with correct names"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-valuation")
        data = response.json()
        assert "items" in data and len(data["items"]) > 0, "No items in response"
        
        item = data["items"][0]
        required_fields = [
            "ingredient_id", "name", "category", "warehouse_id", "warehouse_name",
            "current_stock", "unit", "unit_cost", "stock_value", 
            "recent_movement", "is_dead_stock", "is_low_stock"
        ]
        for field in required_fields:
            assert field in item, f"Item missing field: {field}"
        
        # Verify specific expected values based on issue context
        assert item["name"] == "PRESIDNTE CAJA 24", f"Expected 'PRESIDNTE CAJA 24', got {item['name']}"
        assert item["category"] == "bebidas", f"Expected category 'bebidas', got {item['category']}"
        assert item["warehouse_name"] == "Almacen Principal", f"Expected 'Almacen Principal', got {item['warehouse_name']}"
        assert item["current_stock"] == 48.0, f"Expected current_stock 48.0, got {item['current_stock']}"
        assert item["unit"] == "botella", f"Expected unit 'botella', got {item['unit']}"
        assert item["unit_cost"] == 83.33, f"Expected unit_cost 83.33, got {item['unit_cost']}"
        assert item["stock_value"] == 4000.0, f"Expected stock_value 4000.0, got {item['stock_value']}"
        
        print("✓ Items have all required fields with correct values")
        print(f"  - ingredient_id: {item['ingredient_id']}")
        print(f"  - name: {item['name']}")
        print(f"  - current_stock: {item['current_stock']} {item['unit']}")
        print(f"  - unit_cost: RD${item['unit_cost']}")
        print(f"  - stock_value: RD${item['stock_value']}")


class TestValuationTrendsEndpoint:
    """Tests for GET /api/reports/valuation-trends endpoint"""
    
    def test_valuation_trends_7d_returns_200(self):
        """GET /api/reports/valuation-trends?period=7d returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/valuation-trends", params={"period": "7d"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ Valuation trends 7d returns 200")
    
    def test_valuation_trends_7d_has_current_value(self):
        """7d trends returns current_value > 0"""
        response = requests.get(f"{BASE_URL}/api/reports/valuation-trends", params={"period": "7d"})
        data = response.json()
        assert "current_value" in data, "Missing current_value field"
        assert data["current_value"] > 0, f"Expected current_value > 0, got {data['current_value']}"
        assert data["current_value"] == 4000.0, f"Expected 4000.0, got {data['current_value']}"
        print(f"✓ current_value = {data['current_value']}")
    
    def test_valuation_trends_7d_has_category_distribution(self):
        """7d trends returns category_distribution with correct values"""
        response = requests.get(f"{BASE_URL}/api/reports/valuation-trends", params={"period": "7d"})
        data = response.json()
        assert "category_distribution" in data, "Missing category_distribution"
        cats = data["category_distribution"]
        assert isinstance(cats, list), f"Expected list, got {type(cats)}"
        assert len(cats) >= 1, "Expected at least 1 category"
        
        # Find bebidas category
        bebidas = next((c for c in cats if c["category"] == "bebidas"), None)
        assert bebidas is not None, "Expected 'bebidas' in category_distribution"
        assert bebidas["value"] == 4000.0, f"Expected bebidas value 4000.0, got {bebidas['value']}"
        assert bebidas["percentage"] == 100.0, f"Expected 100%, got {bebidas['percentage']}"
        
        print(f"✓ category_distribution = {cats}")
    
    def test_valuation_trends_7d_has_daily_valuations(self):
        """7d trends returns daily_valuations array with total_value entries"""
        response = requests.get(f"{BASE_URL}/api/reports/valuation-trends", params={"period": "7d"})
        data = response.json()
        assert "daily_valuations" in data, "Missing daily_valuations"
        dv = data["daily_valuations"]
        assert isinstance(dv, list), f"Expected list, got {type(dv)}"
        assert len(dv) == 7, f"Expected 7 entries for 7d period, got {len(dv)}"
        
        # Each entry should have date and total_value
        for entry in dv:
            assert "date" in entry, "daily_valuations entry missing 'date'"
            assert "total_value" in entry, "daily_valuations entry missing 'total_value'"
        
        # Last entry should have current value
        last_entry = dv[-1]
        assert last_entry["total_value"] == 4000.0, f"Expected last total_value 4000.0, got {last_entry['total_value']}"
        
        print(f"✓ daily_valuations has {len(dv)} entries, last = {last_entry['total_value']}")
    
    def test_valuation_trends_30d_returns_200(self):
        """GET /api/reports/valuation-trends?period=30d returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/valuation-trends", params={"period": "30d"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ Valuation trends 30d returns 200")
    
    def test_valuation_trends_30d_has_current_value(self):
        """30d trends returns current_value > 0"""
        response = requests.get(f"{BASE_URL}/api/reports/valuation-trends", params={"period": "30d"})
        data = response.json()
        assert "current_value" in data, "Missing current_value field"
        assert data["current_value"] > 0, f"Expected current_value > 0, got {data['current_value']}"
        assert data["current_value"] == 4000.0, f"Expected 4000.0, got {data['current_value']}"
        print(f"✓ 30d current_value = {data['current_value']}")
    
    def test_valuation_trends_30d_has_30_entries(self):
        """30d trends returns 30 daily_valuations entries"""
        response = requests.get(f"{BASE_URL}/api/reports/valuation-trends", params={"period": "30d"})
        data = response.json()
        dv = data.get("daily_valuations", [])
        assert len(dv) == 30, f"Expected 30 entries for 30d, got {len(dv)}"
        print(f"✓ 30d has {len(dv)} entries")
    
    def test_valuation_trends_has_trend_object(self):
        """Trends returns trend object with direction, change, change_pct"""
        response = requests.get(f"{BASE_URL}/api/reports/valuation-trends", params={"period": "7d"})
        data = response.json()
        assert "trend" in data, "Missing trend object"
        trend = data["trend"]
        assert "direction" in trend, "trend missing 'direction'"
        assert "change" in trend, "trend missing 'change'"
        assert "change_pct" in trend, "trend missing 'change_pct'"
        assert trend["direction"] in ["up", "down", "stable"], f"Invalid direction: {trend['direction']}"
        print(f"✓ trend = {trend}")
    
    def test_valuation_trends_has_data_source(self):
        """Trends returns data_source field"""
        response = requests.get(f"{BASE_URL}/api/reports/valuation-trends", params={"period": "7d"})
        data = response.json()
        assert "data_source" in data, "Missing data_source field"
        assert data["data_source"] in ["real", "current_snapshot"], f"Invalid data_source: {data['data_source']}"
        print(f"✓ data_source = {data['data_source']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
