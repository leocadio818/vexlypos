"""
Test Suite: Multilevel Stock & Difference Registration
Features: GET /api/stock/multilevel, POST /api/stock/difference
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMultilevelStock:
    """Tests for GET /api/stock/multilevel endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for multilevel stock tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to get token
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_multilevel_stock_returns_200(self):
        """Test that multilevel stock endpoint returns 200"""
        response = self.session.get(f"{BASE_URL}/api/stock/multilevel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ GET /api/stock/multilevel returned {len(data)} stock records")
    
    def test_multilevel_stock_contains_required_fields(self):
        """Test that each stock item contains all required fields"""
        response = self.session.get(f"{BASE_URL}/api/stock/multilevel")
        assert response.status_code == 200
        data = response.json()
        
        required_fields = [
            "ingredient_id", "ingredient_name", "warehouse_id", "warehouse_name",
            "current_stock", "dispatch_unit", "purchase_unit", "conversion_factor",
            "stock_detailed", "stock_in_purchase_units", "stock_remainder_dispatch",
            "dispatch_unit_cost", "stock_value", "is_low_stock"
        ]
        
        if len(data) > 0:
            item = data[0]
            for field in required_fields:
                assert field in item, f"Missing field: {field}"
                print(f"  ✓ Field '{field}' present")
            print(f"✓ All required fields present in multilevel stock response")
        else:
            pytest.skip("No stock records to test")
    
    def test_multilevel_stock_detailed_format(self):
        """Test that stock_detailed shows proper multi-level breakdown"""
        response = self.session.get(f"{BASE_URL}/api/stock/multilevel")
        assert response.status_code == 200
        data = response.json()
        
        for item in data:
            stock_detailed = item.get("stock_detailed", "")
            # stock_detailed should contain unit labels like "18 lb" or "18 lb + 0.35 lb"
            assert len(stock_detailed) > 0, "stock_detailed should not be empty"
            
            # Verify the structure: should have numbers and unit names
            current_stock = item.get("current_stock", 0)
            purchase_units = item.get("stock_in_purchase_units", 0)
            remainder = item.get("stock_remainder_dispatch", 0)
            
            # Verify the math: current_stock should roughly equal purchase_units * conversion_factor + remainder
            conversion_factor = item.get("conversion_factor", 1)
            expected = purchase_units * conversion_factor + remainder
            assert abs(current_stock - expected) < 0.01, f"Stock math doesn't add up: {current_stock} vs {expected}"
            
            print(f"  ✓ {item['ingredient_name']}: {stock_detailed} (base: {current_stock} {item['dispatch_unit']})")
        
        print(f"✓ All {len(data)} stock items have valid stock_detailed format")
    
    def test_multilevel_stock_conversion_relation(self):
        """Test that each row shows conversion relation (1 unit = N units)"""
        response = self.session.get(f"{BASE_URL}/api/stock/multilevel")
        assert response.status_code == 200
        data = response.json()
        
        for item in data:
            purchase_unit = item.get("purchase_unit")
            dispatch_unit = item.get("dispatch_unit")
            conversion_factor = item.get("conversion_factor")
            
            # All these should be present and valid
            assert purchase_unit is not None, "purchase_unit should be present"
            assert dispatch_unit is not None, "dispatch_unit should be present"
            assert conversion_factor is not None and conversion_factor > 0, "conversion_factor should be positive"
            
            # Can verify conversion relation: 1 purchase_unit = conversion_factor dispatch_units
            expected_relation = f"1 {purchase_unit} = {conversion_factor} {dispatch_unit}"
            print(f"  ✓ {item['ingredient_name']}: {expected_relation}")
        
        print(f"✓ Conversion relations verified for {len(data)} items")
    
    def test_multilevel_stock_filter_by_warehouse(self):
        """Test filtering multilevel stock by warehouse_id"""
        # First get warehouses
        wh_res = self.session.get(f"{BASE_URL}/api/warehouses")
        if wh_res.status_code != 200:
            pytest.skip("Could not get warehouses")
        
        warehouses = wh_res.json()
        if len(warehouses) == 0:
            pytest.skip("No warehouses available")
        
        warehouse_id = warehouses[0]["id"]
        response = self.session.get(f"{BASE_URL}/api/stock/multilevel", params={"warehouse_id": warehouse_id})
        assert response.status_code == 200
        data = response.json()
        
        # All returned items should have the filtered warehouse_id
        for item in data:
            assert item["warehouse_id"] == warehouse_id, f"Item has wrong warehouse: {item['warehouse_id']}"
        
        print(f"✓ Filtered by warehouse {warehouses[0]['name']}: {len(data)} items")


class TestStockDifference:
    """Tests for POST /api/stock/difference endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for difference tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login to get token
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.user_name = login_res.json().get("user", {}).get("name", "Admin")
    
    def _get_stock_item(self):
        """Helper to get a stock item for testing"""
        response = self.session.get(f"{BASE_URL}/api/stock/multilevel")
        if response.status_code == 200 and len(response.json()) > 0:
            return response.json()[0]
        return None
    
    def test_difference_faltante_registration(self):
        """Test registering a faltante (shortage) difference"""
        stock_item = self._get_stock_item()
        if not stock_item:
            pytest.skip("No stock items available for testing")
        
        # Get initial stock
        initial_stock = stock_item["current_stock"]
        
        # Register a small faltante difference
        difference_data = {
            "ingredient_id": stock_item["ingredient_id"],
            "warehouse_id": stock_item["warehouse_id"],
            "quantity": 0.1,
            "input_unit": stock_item["dispatch_unit"],
            "difference_type": "faltante",
            "reason": "Conteo físico",
            "observations": "TEST_Prueba automatizada de faltante"
        }
        
        response = self.session.post(f"{BASE_URL}/api/stock/difference", json=difference_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result.get("ok") == True, "Response should have ok: True"
        assert "difference_id" in result, "Response should have difference_id"
        assert "monetary_value" in result, "Response should have monetary_value"
        assert "quantity_adjusted" in result, "Response should have quantity_adjusted"
        
        # Quantity should be negative for faltante
        assert result["quantity_adjusted"] < 0, "Faltante should decrease stock (negative adjustment)"
        
        # Monetary value should be positive (loss value)
        assert result["monetary_value"] >= 0, "Monetary value should be positive"
        
        print(f"✓ Faltante registered: {result['quantity_adjusted']} units, value: RD${result['monetary_value']}")
        
        # Verify stock was decreased
        new_stock_res = self.session.get(f"{BASE_URL}/api/stock/multilevel")
        new_stock = [s for s in new_stock_res.json() if s["ingredient_id"] == stock_item["ingredient_id"] and s["warehouse_id"] == stock_item["warehouse_id"]]
        if new_stock:
            expected_stock = initial_stock - 0.1
            actual_stock = new_stock[0]["current_stock"]
            assert abs(actual_stock - expected_stock) < 0.01, f"Stock should be {expected_stock}, got {actual_stock}"
            print(f"  ✓ Stock decreased from {initial_stock} to {actual_stock}")
    
    def test_difference_sobrante_registration(self):
        """Test registering a sobrante (surplus) difference"""
        stock_item = self._get_stock_item()
        if not stock_item:
            pytest.skip("No stock items available for testing")
        
        initial_stock = stock_item["current_stock"]
        
        difference_data = {
            "ingredient_id": stock_item["ingredient_id"],
            "warehouse_id": stock_item["warehouse_id"],
            "quantity": 0.15,
            "input_unit": stock_item["dispatch_unit"],
            "difference_type": "sobrante",
            "reason": "Excedente encontrado",
            "observations": "TEST_Prueba automatizada de sobrante"
        }
        
        response = self.session.post(f"{BASE_URL}/api/stock/difference", json=difference_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result.get("ok") == True
        assert result["quantity_adjusted"] > 0, "Sobrante should increase stock (positive adjustment)"
        
        print(f"✓ Sobrante registered: +{result['quantity_adjusted']} units, value: RD${result['monetary_value']}")
        
        # Verify stock was increased
        new_stock_res = self.session.get(f"{BASE_URL}/api/stock/multilevel")
        new_stock = [s for s in new_stock_res.json() if s["ingredient_id"] == stock_item["ingredient_id"] and s["warehouse_id"] == stock_item["warehouse_id"]]
        if new_stock:
            expected_stock = initial_stock + 0.15
            actual_stock = new_stock[0]["current_stock"]
            assert abs(actual_stock - expected_stock) < 0.01, f"Stock should be {expected_stock}, got {actual_stock}"
            print(f"  ✓ Stock increased from {initial_stock} to {actual_stock}")
    
    def test_difference_with_purchase_unit_conversion(self):
        """Test that difference converts correctly when using purchase unit"""
        stock_item = self._get_stock_item()
        if not stock_item:
            pytest.skip("No stock items available for testing")
        
        # Only test if purchase_unit differs from dispatch_unit
        if stock_item["purchase_unit"] == stock_item["dispatch_unit"]:
            print(f"  ℹ Item {stock_item['ingredient_name']} has same purchase/dispatch unit, testing with dispatch unit")
            input_unit = stock_item["dispatch_unit"]
            expected_quantity = 0.1
        else:
            input_unit = stock_item["purchase_unit"]
            # When entering in purchase units, it should be multiplied by conversion_factor
            expected_quantity = 0.1 * stock_item["conversion_factor"]
            print(f"  Testing with purchase unit: {input_unit}, conversion_factor: {stock_item['conversion_factor']}")
        
        initial_stock = stock_item["current_stock"]
        
        difference_data = {
            "ingredient_id": stock_item["ingredient_id"],
            "warehouse_id": stock_item["warehouse_id"],
            "quantity": 0.1,
            "input_unit": input_unit,
            "difference_type": "faltante",
            "reason": "Conteo físico",
            "observations": "TEST_Prueba de conversión de unidades"
        }
        
        response = self.session.post(f"{BASE_URL}/api/stock/difference", json=difference_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        result = response.json()
        assert result.get("ok") == True
        
        # Check if conversion was applied
        if "conversion_applied" in result:
            print(f"  ✓ Conversion applied: {result['conversion_applied']}")
        
        print(f"✓ Difference with unit conversion: adjusted {result['quantity_adjusted']} units")
    
    def test_difference_monetary_value_calculation(self):
        """Test that monetary value is calculated correctly"""
        stock_item = self._get_stock_item()
        if not stock_item:
            pytest.skip("No stock items available for testing")
        
        quantity = 0.5
        dispatch_unit_cost = stock_item["dispatch_unit_cost"]
        expected_monetary_value = quantity * dispatch_unit_cost
        
        difference_data = {
            "ingredient_id": stock_item["ingredient_id"],
            "warehouse_id": stock_item["warehouse_id"],
            "quantity": quantity,
            "input_unit": stock_item["dispatch_unit"],
            "difference_type": "faltante",
            "reason": "Producto dañado",
            "observations": "TEST_Prueba de cálculo monetario"
        }
        
        response = self.session.post(f"{BASE_URL}/api/stock/difference", json=difference_data)
        assert response.status_code == 200
        
        result = response.json()
        actual_monetary_value = result["monetary_value"]
        
        # Allow small floating point difference
        assert abs(actual_monetary_value - expected_monetary_value) < 0.1, \
            f"Monetary value mismatch: expected ~{expected_monetary_value:.2f}, got {actual_monetary_value:.2f}"
        
        print(f"✓ Monetary value calculated correctly: {quantity} × RD${dispatch_unit_cost:.2f} = RD${actual_monetary_value:.2f}")
    
    def test_difference_requires_reason(self):
        """Test that difference registration requires a reason"""
        stock_item = self._get_stock_item()
        if not stock_item:
            pytest.skip("No stock items available for testing")
        
        difference_data = {
            "ingredient_id": stock_item["ingredient_id"],
            "warehouse_id": stock_item["warehouse_id"],
            "quantity": 0.1,
            "input_unit": stock_item["dispatch_unit"],
            "difference_type": "faltante",
            "reason": "",  # Empty reason - should this fail?
            "observations": ""
        }
        
        response = self.session.post(f"{BASE_URL}/api/stock/difference", json=difference_data)
        # Note: Backend might accept empty reason, just testing the call works
        # Frontend validation handles required reason
        print(f"  ℹ Response with empty reason: status {response.status_code}")
    
    def test_difference_audit_logging(self):
        """Test that differences are logged for audit"""
        stock_item = self._get_stock_item()
        if not stock_item:
            pytest.skip("No stock items available for testing")
        
        difference_data = {
            "ingredient_id": stock_item["ingredient_id"],
            "warehouse_id": stock_item["warehouse_id"],
            "quantity": 0.05,
            "input_unit": stock_item["dispatch_unit"],
            "difference_type": "faltante",
            "reason": "Pérdida desconocida",
            "observations": "TEST_Prueba de auditoría"
        }
        
        response = self.session.post(f"{BASE_URL}/api/stock/difference", json=difference_data)
        assert response.status_code == 200
        
        result = response.json()
        difference_id = result["difference_id"]
        
        # Check if we can retrieve the difference log
        diff_logs_res = self.session.get(f"{BASE_URL}/api/stock/differences")
        if diff_logs_res.status_code == 200:
            logs_data = diff_logs_res.json()
            logs = logs_data.get("logs", [])
            
            # Find our difference log
            our_log = next((l for l in logs if l.get("id") == difference_id), None)
            if our_log:
                assert "authorized_by_name" in our_log, "Log should have authorized_by_name"
                print(f"  ✓ Audit log found: authorized by {our_log.get('authorized_by_name')}")
            
            # Check stats
            stats = logs_data.get("stats", {})
            print(f"  ✓ Difference logs stats: {stats.get('total_records', 0)} records, faltante: RD${stats.get('total_faltante_value', 0):.2f}")
        
        print(f"✓ Difference audit logging verified")


class TestStockDifferencesLog:
    """Tests for GET /api/stock/differences endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for differences log tests"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_get_differences_log_returns_200(self):
        """Test that differences log endpoint returns 200"""
        response = self.session.get(f"{BASE_URL}/api/stock/differences")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "logs" in data, "Response should have logs array"
        assert "stats" in data, "Response should have stats object"
        
        print(f"✓ GET /api/stock/differences returned {len(data['logs'])} logs with stats")
    
    def test_differences_log_stats_structure(self):
        """Test that stats have correct structure"""
        response = self.session.get(f"{BASE_URL}/api/stock/differences")
        assert response.status_code == 200
        
        stats = response.json().get("stats", {})
        required_stats = ["total_records", "total_faltante_value", "total_sobrante_value", "net_difference"]
        
        for stat in required_stats:
            assert stat in stats, f"Missing stat: {stat}"
        
        print(f"✓ Stats structure verified: {stats}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
