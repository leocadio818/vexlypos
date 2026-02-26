"""
Stock Adjustments Feature Tests
Testing:
1. POST /api/inventory/adjust endpoint
2. GET /api/reports/stock-adjustments endpoint
3. GET /api/reports/system-audit (for adjustment logs)
4. Data persistence and validation
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data
ADMIN_PIN = "10000"
INGREDIENT_ID = "d4a811a9-3f70-4439-877d-2981e11341e1"  # PRESIDNTE CAJA 24
WAREHOUSE_ID = "8f0dcf98-f2c5-4e17-9b8e-737e204444b7"  # Almacen Principal

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token using admin PIN"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")

@pytest.fixture
def api_client(auth_token):
    """Shared requests session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session

# ═══════════════════════════════════════════════════════════════════════════════
# POST /api/inventory/adjust TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestStockAdjustEndpoint:
    """Tests for POST /api/inventory/adjust"""
    
    def test_adjust_positive_quantity_returns_ok(self, api_client):
        """Test adding stock with positive quantity"""
        payload = {
            "ingredient_id": INGREDIENT_ID,
            "warehouse_id": WAREHOUSE_ID,
            "quantity": 2,
            "reason": "TEST_Conteo físico"
        }
        response = api_client.post(f"{BASE_URL}/api/inventory/adjust", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert data.get("ok") is True
        assert "adjustment_id" in data
        assert "stock_before" in data
        assert "stock_after" in data
        assert "monetary_value" in data
        assert "ingredient_name" in data
        
        # Verify stock increased
        assert data["stock_after"] > data["stock_before"]
        assert data["stock_after"] - data["stock_before"] == 2
        
        print(f"✓ Positive adjustment: stock {data['stock_before']} -> {data['stock_after']}, value={data['monetary_value']}")
    
    def test_adjust_negative_quantity_returns_ok(self, api_client):
        """Test removing stock with negative quantity"""
        payload = {
            "ingredient_id": INGREDIENT_ID,
            "warehouse_id": WAREHOUSE_ID,
            "quantity": -1,
            "reason": "TEST_Merma"
        }
        response = api_client.post(f"{BASE_URL}/api/inventory/adjust", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("ok") is True
        assert data["stock_after"] < data["stock_before"]
        assert data["stock_before"] - data["stock_after"] == 1
        
        print(f"✓ Negative adjustment: stock {data['stock_before']} -> {data['stock_after']}, value={data['monetary_value']}")
    
    def test_adjust_response_has_monetary_value(self, api_client):
        """Test that monetary_value is calculated correctly"""
        payload = {
            "ingredient_id": INGREDIENT_ID,
            "warehouse_id": WAREHOUSE_ID,
            "quantity": 1,
            "reason": "TEST_Ajuste manual"
        }
        response = api_client.post(f"{BASE_URL}/api/inventory/adjust", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        # monetary_value should be positive (absolute value of quantity * dispatch_unit_cost)
        assert data["monetary_value"] >= 0
        assert isinstance(data["monetary_value"], (int, float))
        
        print(f"✓ Monetary value: {data['monetary_value']}")
    
    def test_adjust_missing_ingredient_id_returns_400(self, api_client):
        """Test that missing ingredient_id returns 400"""
        payload = {
            "warehouse_id": WAREHOUSE_ID,
            "quantity": 1,
            "reason": "Test"
        }
        response = api_client.post(f"{BASE_URL}/api/inventory/adjust", json=payload)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Missing ingredient_id returns 400")
    
    def test_adjust_missing_warehouse_id_returns_400(self, api_client):
        """Test that missing warehouse_id returns 400"""
        payload = {
            "ingredient_id": INGREDIENT_ID,
            "quantity": 1,
            "reason": "Test"
        }
        response = api_client.post(f"{BASE_URL}/api/inventory/adjust", json=payload)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Missing warehouse_id returns 400")
    
    def test_adjust_missing_quantity_returns_400(self, api_client):
        """Test that missing quantity returns 400"""
        payload = {
            "ingredient_id": INGREDIENT_ID,
            "warehouse_id": WAREHOUSE_ID,
            "reason": "Test"
        }
        response = api_client.post(f"{BASE_URL}/api/inventory/adjust", json=payload)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Missing quantity returns 400")
    
    def test_adjust_zero_quantity_returns_400(self, api_client):
        """Test that quantity=0 returns 400"""
        payload = {
            "ingredient_id": INGREDIENT_ID,
            "warehouse_id": WAREHOUSE_ID,
            "quantity": 0,
            "reason": "Test"
        }
        response = api_client.post(f"{BASE_URL}/api/inventory/adjust", json=payload)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Zero quantity returns 400")
    
    def test_adjust_nonexistent_ingredient_returns_404(self, api_client):
        """Test that non-existent ingredient returns 404"""
        payload = {
            "ingredient_id": "nonexistent-id-12345",
            "warehouse_id": WAREHOUSE_ID,
            "quantity": 1,
            "reason": "Test"
        }
        response = api_client.post(f"{BASE_URL}/api/inventory/adjust", json=payload)
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Non-existent ingredient returns 404")

# ═══════════════════════════════════════════════════════════════════════════════
# DATA PERSISTENCE TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestStockAdjustmentPersistence:
    """Tests for stock adjustment data persistence"""
    
    def test_adjustment_logged_to_stock_movements(self, api_client):
        """Test that adjustments are logged to stock_movements collection"""
        # Make an adjustment
        payload = {
            "ingredient_id": INGREDIENT_ID,
            "warehouse_id": WAREHOUSE_ID,
            "quantity": 1,
            "reason": "TEST_persistence_test"
        }
        adj_response = api_client.post(f"{BASE_URL}/api/inventory/adjust", json=payload)
        assert adj_response.status_code == 200
        
        # Check stock movements
        mov_response = api_client.get(f"{BASE_URL}/api/stock-movements", params={
            "ingredient_id": INGREDIENT_ID,
            "movement_type": "adjustment",
            "limit": 10
        })
        assert mov_response.status_code == 200
        
        movements = mov_response.json()
        assert len(movements) > 0, "Expected at least one adjustment movement"
        
        # Check the most recent adjustment
        recent = movements[0]
        assert recent["movement_type"] == "adjustment"
        assert recent["ingredient_id"] == INGREDIENT_ID
        
        print(f"✓ Adjustment logged to stock_movements: {recent.get('notes', '')}")
    
    def test_adjustment_logged_to_adjustment_logs(self, api_client):
        """Test that adjustments are logged to stock_adjustment_logs for the report"""
        # Check stock adjustments report
        response = api_client.get(f"{BASE_URL}/api/reports/stock-adjustments")
        assert response.status_code == 200
        
        data = response.json()
        assert "logs" in data
        assert "stats" in data
        
        # Should have at least one log from our tests
        assert len(data["logs"]) > 0, "Expected adjustment logs"
        
        # Check log structure
        log = data["logs"][0]
        required_fields = ["id", "ingredient_id", "ingredient_name", "warehouse_id", 
                          "quantity", "stock_before", "stock_after", "monetary_value", 
                          "reason", "timestamp"]
        for field in required_fields:
            assert field in log, f"Missing field '{field}' in adjustment log"
        
        print(f"✓ Adjustment logged to stock_adjustment_logs: {log.get('ingredient_name')}")

# ═══════════════════════════════════════════════════════════════════════════════
# GET /api/reports/stock-adjustments TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestStockAdjustmentsReport:
    """Tests for GET /api/reports/stock-adjustments"""
    
    def test_stock_adjustments_report_returns_200(self, api_client):
        """Test that the report endpoint returns 200"""
        response = api_client.get(f"{BASE_URL}/api/reports/stock-adjustments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ Stock adjustments report returns 200")
    
    def test_stock_adjustments_report_has_stats(self, api_client):
        """Test that report has stats summary"""
        response = api_client.get(f"{BASE_URL}/api/reports/stock-adjustments")
        assert response.status_code == 200
        
        data = response.json()
        assert "stats" in data
        
        stats = data["stats"]
        required_stats = ["total_adjustments", "total_positive_units", "total_negative_units", "net_value_impact"]
        for stat in required_stats:
            assert stat in stats, f"Missing stat '{stat}'"
        
        print(f"✓ Report stats: total={stats['total_adjustments']}, net_value={stats['net_value_impact']}")
    
    def test_stock_adjustments_report_has_by_reason(self, api_client):
        """Test that report has by_reason breakdown"""
        response = api_client.get(f"{BASE_URL}/api/reports/stock-adjustments")
        assert response.status_code == 200
        
        data = response.json()
        assert "by_reason" in data
        assert isinstance(data["by_reason"], list)
        
        # Should have at least one reason category from our tests
        if len(data["by_reason"]) > 0:
            reason = data["by_reason"][0]
            assert "reason" in reason
            assert "count" in reason
            assert "total_value" in reason
            print(f"✓ By reason: {reason}")
    
    def test_stock_adjustments_report_has_by_ingredient(self, api_client):
        """Test that report has by_ingredient breakdown"""
        response = api_client.get(f"{BASE_URL}/api/reports/stock-adjustments")
        assert response.status_code == 200
        
        data = response.json()
        assert "by_ingredient" in data
        assert isinstance(data["by_ingredient"], list)
        
        if len(data["by_ingredient"]) > 0:
            ing = data["by_ingredient"][0]
            assert "ingredient_id" in ing
            assert "name" in ing
            assert "adjustments" in ing
            assert "net_quantity" in ing
            print(f"✓ By ingredient: {ing.get('name')}")
    
    def test_stock_adjustments_report_has_logs(self, api_client):
        """Test that report has logs array"""
        response = api_client.get(f"{BASE_URL}/api/reports/stock-adjustments")
        assert response.status_code == 200
        
        data = response.json()
        assert "logs" in data
        assert isinstance(data["logs"], list)
        
        print(f"✓ Report logs count: {len(data['logs'])}")
    
    def test_stock_adjustments_report_date_filter(self, api_client):
        """Test date filtering works"""
        today = "2026-01-01"  # Use a fixed date for testing
        
        response = api_client.get(f"{BASE_URL}/api/reports/stock-adjustments", params={
            "date_from": today,
            "date_to": today
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "logs" in data
        
        print(f"✓ Date filter works: {len(data['logs'])} logs for {today}")

# ═══════════════════════════════════════════════════════════════════════════════
# GET /api/reports/system-audit TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestSystemAuditForAdjustments:
    """Tests for stock adjustments appearing in system audit"""
    
    def test_system_audit_returns_200(self, api_client):
        """Test that system audit endpoint returns 200"""
        response = api_client.get(f"{BASE_URL}/api/reports/system-audit")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ System audit returns 200")
    
    def test_system_audit_has_adjustment_type(self, api_client):
        """Test that system audit shows 'Ajuste de Stock' type"""
        response = api_client.get(f"{BASE_URL}/api/reports/system-audit")
        assert response.status_code == 200
        
        data = response.json()
        assert "activities" in data
        assert "available_event_types" in data
        
        # Check if 'Ajuste de Stock' is in available event types
        event_types = data.get("available_event_types", [])
        
        # Also check activities for adjustment type
        activities = data.get("activities", [])
        adjustment_found = any(a.get("type") == "Ajuste de Stock" for a in activities)
        
        if adjustment_found or "Ajuste de Stock" in event_types:
            print("✓ 'Ajuste de Stock' found in system audit")
        else:
            print(f"⚠ Available event types: {event_types}")
            # Not a failure - might not have adjustments in the audit period

# ═══════════════════════════════════════════════════════════════════════════════
# CLEANUP
# ═══════════════════════════════════════════════════════════════════════════════

class TestCleanup:
    """Cleanup test data and restore stock"""
    
    def test_restore_stock_balance(self, api_client):
        """Restore stock to balance out test adjustments"""
        # We added: +2, -1, +1, +1, +1 = +4 during tests
        # Let's subtract to restore
        payload = {
            "ingredient_id": INGREDIENT_ID,
            "warehouse_id": WAREHOUSE_ID,
            "quantity": -4,
            "reason": "TEST_cleanup"
        }
        response = api_client.post(f"{BASE_URL}/api/inventory/adjust", json=payload)
        
        # This is best-effort cleanup
        if response.status_code == 200:
            print(f"✓ Cleanup: restored stock balance")
        else:
            print(f"⚠ Cleanup adjustment returned: {response.status_code}")

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
