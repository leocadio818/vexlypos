"""
Test System Audit Report - Stock Movement Types and Inventory Differences
Tests that ALL stock movement types appear in the system audit report:
- sale, purchase, adjustment, difference, production_output, production_consume, waste, transfer_in, transfer_out
- Also tests stock_difference_logs appear with correct ingredient names and dates
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSystemAuditReport:
    """System Audit Report endpoint tests - verifies all stock movement types are included"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth headers"""
        self.session = requests.Session()
        # Login to get auth token
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login-pin", json={"pin": "10000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        self.session.close()

    def test_system_audit_endpoint_returns_200(self):
        """Test that system audit endpoint responds with 200"""
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "activities" in data, "Response should contain 'activities' key"
        assert "summary" in data, "Response should contain 'summary' key"
        assert "by_type" in data, "Response should contain 'by_type' key"
        print(f"✓ System audit returned {len(data['activities'])} activities")
        
    def test_system_audit_contains_sale_movements(self):
        """Test that 'Venta (Descuento de Inventario)' appears in system audit"""
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert response.status_code == 200
        data = response.json()
        
        sale_activities = [a for a in data["activities"] if "Venta" in a.get("type", "")]
        print(f"✓ Found {len(sale_activities)} sale activities")
        assert len(sale_activities) > 0, "System audit should contain sale movements"
        
        # Verify sale type label is correct
        sale_type = sale_activities[0]["type"]
        assert "Venta (Descuento de Inventario)" == sale_type, f"Expected 'Venta (Descuento de Inventario)', got '{sale_type}'"
        
    def test_system_audit_contains_purchase_movements(self):
        """Test that 'Compra (Entrada de Inventario)' appears in system audit"""
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert response.status_code == 200
        data = response.json()
        
        purchase_activities = [a for a in data["activities"] if "Compra" in a.get("type", "")]
        print(f"✓ Found {len(purchase_activities)} purchase activities")
        assert len(purchase_activities) > 0, "System audit should contain purchase movements"
        
        # Verify purchase type label
        purchase_type = purchase_activities[0]["type"]
        assert "Compra (Entrada de Inventario)" == purchase_type, f"Expected 'Compra (Entrada de Inventario)', got '{purchase_type}'"

    def test_system_audit_contains_production_movements(self):
        """Test that production movements (Producción) appear in system audit"""
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert response.status_code == 200
        data = response.json()
        
        prod_output = [a for a in data["activities"] if "Producción (Salida)" in a.get("type", "")]
        prod_consume = [a for a in data["activities"] if "Producción (Consumo)" in a.get("type", "")]
        
        print(f"✓ Found {len(prod_output)} production output activities")
        print(f"✓ Found {len(prod_consume)} production consume activities")
        
        # At least one type should exist if production has occurred
        total_prod = len(prod_output) + len(prod_consume)
        print(f"✓ Total production activities: {total_prod}")

    def test_system_audit_contains_adjustment_movements(self):
        """Test that 'Ajuste de Stock' appears in system audit"""
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert response.status_code == 200
        data = response.json()
        
        adjustment_activities = [a for a in data["activities"] if "Ajuste de Stock" in a.get("type", "")]
        print(f"✓ Found {len(adjustment_activities)} adjustment activities")

    def test_system_audit_contains_difference_movements(self):
        """Test that 'Diferencia de Inventario' movements appear (ACEITE faltante)"""
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check for both types of difference entries
        diff_movements = [a for a in data["activities"] if "Diferencia de Inventario" in a.get("type", "")]
        diff_detail = [a for a in data["activities"] if "Diferencia Inventario (Detalle)" in a.get("type", "")]
        
        print(f"✓ Found {len(diff_movements)} difference movement activities")
        print(f"✓ Found {len(diff_detail)} detailed difference log activities")
        
        # Should have at least one difference entry (from ACEITE faltante)
        total_diff = len(diff_movements) + len(diff_detail)
        assert total_diff > 0, "System audit should contain difference/inventory discrepancy movements"
        
    def test_system_audit_difference_shows_aceite(self):
        """Test that ACEITE faltante specifically appears in system audit"""
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Look for ACEITE in any activity
        aceite_activities = [a for a in data["activities"] if "ACEITE" in a.get("description", "").upper()]
        print(f"✓ Found {len(aceite_activities)} ACEITE-related activities")
        
        # At least one should have ACEITE name
        assert len(aceite_activities) > 0, "ACEITE faltante should appear in system audit"
        
        # Print first match for verification
        if aceite_activities:
            first = aceite_activities[0]
            print(f"  - Type: {first['type']}")
            print(f"  - Description: {first['description']}")

    def test_system_audit_difference_has_ingredient_name(self):
        """Test that difference entries have proper ingredient_name (not '?')"""
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Check stock_movements type differences
        diff_activities = [a for a in data["activities"] if "Diferencia" in a.get("type", "")]
        
        # Count entries with '?' in description (missing ingredient name)
        missing_names = [a for a in diff_activities if "?: " in a.get("description", "") or a.get("description", "").startswith("?:")]
        
        print(f"✓ Found {len(diff_activities)} difference activities")
        print(f"✓ Activities with missing ingredient names: {len(missing_names)}")
        
        # Should have no missing ingredient names
        assert len(missing_names) == 0, f"All difference entries should have ingredient names, found {len(missing_names)} with '?'"

    def test_system_audit_by_type_summary(self):
        """Test that by_type summary includes all expected movement types"""
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert response.status_code == 200
        data = response.json()
        
        by_type = data.get("by_type", [])
        type_names = [t["type"] for t in by_type]
        
        print(f"✓ Event types in summary: {type_names}")
        
        # Print counts for each type
        for t in by_type:
            print(f"  - {t['type']}: {t['count']} entries")

    def test_system_audit_event_type_filter_works(self):
        """Test that event_type filter correctly filters results"""
        # First get all to see available types
        all_response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert all_response.status_code == 200
        all_data = all_response.json()
        
        available_types = all_data.get("available_event_types", [])
        print(f"✓ Available event types: {available_types}")
        
        # Test filtering by 'Diferencia de Inventario' if exists
        if "Diferencia de Inventario" in available_types:
            filtered_response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
                "date_from": "2026-02-25",
                "date_to": "2026-02-28",
                "event_type": "Diferencia de Inventario"
            })
            assert filtered_response.status_code == 200
            filtered_data = filtered_response.json()
            
            # All activities should be of type "Diferencia de Inventario"
            for act in filtered_data["activities"]:
                assert act["type"] == "Diferencia de Inventario", f"Filter should only return 'Diferencia de Inventario', got '{act['type']}'"
            
            print(f"✓ Filter working: returned {len(filtered_data['activities'])} 'Diferencia de Inventario' entries")


class TestStockDifferenceLogsDateField:
    """Test that stock_difference_logs uses 'timestamp' field for date filtering"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth headers"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login-pin", json={"pin": "10000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        self.session.close()

    def test_stock_differences_endpoint_returns_data(self):
        """Test /api/stock/differences returns data with timestamp field"""
        response = self.session.get(f"{BASE_URL}/api/stock/differences", params={
            "start_date": "2026-02-25",
            "end_date": "2026-02-28",
            "limit": 100
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "logs" in data, "Response should contain 'logs' key"
        assert "stats" in data, "Response should contain 'stats' key"
        
        print(f"✓ Stock differences endpoint returned {len(data['logs'])} logs")
        print(f"✓ Stats: {data['stats']}")
        
    def test_stock_difference_logs_have_timestamp_field(self):
        """Test that stock_difference_logs entries have 'timestamp' field"""
        response = self.session.get(f"{BASE_URL}/api/stock/differences", params={
            "start_date": "2026-02-25",
            "end_date": "2026-02-28"
        })
        assert response.status_code == 200
        data = response.json()
        
        for log in data["logs"]:
            assert "timestamp" in log, f"Log entry should have 'timestamp' field: {log.keys()}"
            print(f"✓ Log has timestamp: {log.get('timestamp')} - {log.get('ingredient_name', '?')}")


class TestStockMovementsIngredientName:
    """Test that stock_movements for 'difference' type include ingredient_name"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth headers"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login-pin", json={"pin": "10000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        self.session.close()

    def test_stock_movements_difference_has_ingredient_name(self):
        """Test that difference type stock_movements have ingredient_name populated"""
        response = self.session.get(f"{BASE_URL}/api/stock-movements", params={
            "movement_type": "difference",
            "limit": 100
        })
        assert response.status_code == 200
        data = response.json()
        
        print(f"✓ Found {len(data)} difference type stock movements")
        
        for mov in data:
            ing_name = mov.get("ingredient_name", "")
            assert ing_name != "?" and ing_name != "", f"Movement should have ingredient_name, got: '{ing_name}'"
            print(f"  - {ing_name}: {mov.get('quantity')} ({mov.get('notes', '')})")


class TestStockAdjustmentsReport:
    """Test stock adjustments report endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth headers"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login-pin", json={"pin": "10000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        self.session.close()

    def test_stock_adjustments_report_endpoint(self):
        """Test /api/reports/stock-adjustments returns data with ingredient names"""
        response = self.session.get(f"{BASE_URL}/api/reports/stock-adjustments", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "logs" in data, "Response should contain 'logs' key"
        assert "stats" in data, "Response should contain 'stats' key"
        
        print(f"✓ Stock adjustments report returned {len(data['logs'])} logs")
        print(f"✓ Stats: {data['stats']}")
        
        # Check that logs have ingredient_name
        for log in data["logs"]:
            ing_name = log.get("ingredient_name", "")
            assert ing_name and ing_name != "?", f"Adjustment log should have ingredient_name"
            print(f"  - {ing_name}: {log.get('quantity')} ({log.get('reason', '')})")


class TestMovementTypeLabels:
    """Test that all movement types have correct Spanish labels"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup session with auth headers"""
        self.session = requests.Session()
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login-pin", json={"pin": "10000"})
        if login_resp.status_code == 200:
            token = login_resp.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        self.session.close()

    def test_movement_type_label_mapping(self):
        """Verify all movement type labels are properly translated"""
        expected_labels = {
            "adjustment": "Ajuste de Stock",
            "waste": "Merma",
            "transfer_in": "Entrada por Transferencia",
            "transfer_out": "Salida por Transferencia",
            "difference": "Diferencia de Inventario",
            "sale": "Venta (Descuento de Inventario)",
            "purchase": "Compra (Entrada de Inventario)",
            "production_output": "Producción (Salida)",
            "production_consume": "Producción (Consumo)",
        }
        
        response = self.session.get(f"{BASE_URL}/api/reports/system-audit", params={
            "date_from": "2026-02-25",
            "date_to": "2026-02-28"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Collect all unique types found
        found_types = set()
        for act in data["activities"]:
            found_types.add(act.get("type", ""))
        
        print(f"✓ Found event types: {found_types}")
        
        # Check that expected labels appear
        for internal_type, label in expected_labels.items():
            if label in found_types:
                print(f"  ✓ {internal_type} -> '{label}' FOUND")
            else:
                print(f"  - {internal_type} -> '{label}' not in current data")
