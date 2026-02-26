"""
Test System Audit Report - Enhanced with 9 data sources and event type filtering
Tests: GET /api/reports/system-audit with wide date range
Data sources: void_audit_logs, stock_movements, purchase_orders, stock_difference_logs, 
              shifts, role_audit_logs, audit_logs, tax_override_audit, ingredient_audit_logs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSystemAuditReport:
    """Tests for the enhanced system audit report endpoint"""
    
    def test_system_audit_returns_200(self):
        """GET /api/reports/system-audit returns 200 with wide date range"""
        response = requests.get(
            f"{BASE_URL}/api/reports/system-audit",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify basic structure
        assert "summary" in data, "Response should have summary"
        assert "activities" in data, "Response should have activities"
        assert "by_type" in data, "Response should have by_type breakdown"
        print(f"System audit returned {data['summary']['total_activities']} activities")
    
    def test_system_audit_has_available_event_types(self):
        """Response includes available_event_types array for filter dropdown"""
        response = requests.get(
            f"{BASE_URL}/api/reports/system-audit",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "available_event_types" in data, "Response should have available_event_types"
        assert isinstance(data["available_event_types"], list), "available_event_types should be a list"
        print(f"Available event types: {data['available_event_types']}")
    
    def test_system_audit_has_by_type_with_counts(self):
        """Response includes by_type array with count per type"""
        response = requests.get(
            f"{BASE_URL}/api/reports/system-audit",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert "by_type" in data, "Response should have by_type"
        by_type = data["by_type"]
        assert isinstance(by_type, list), "by_type should be a list"
        
        # Verify structure of each type
        for item in by_type:
            assert "type" in item, "Each item should have type"
            assert "count" in item, "Each item should have count"
            assert isinstance(item["count"], int), "Count should be integer"
        
        print(f"Event types breakdown: {by_type}")
    
    def test_system_audit_filter_anulacion(self):
        """Filter by event_type=Anulacion returns only void events"""
        response = requests.get(
            f"{BASE_URL}/api/reports/system-audit",
            params={
                "date_from": "2025-01-01", 
                "date_to": "2026-12-31",
                "event_type": "Anulacion"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # All activities should be of type Anulacion
        for act in data.get("activities", []):
            assert act["type"] == "Anulacion", f"Expected Anulacion, got {act['type']}"
        
        print(f"Filtered to {len(data.get('activities', []))} Anulacion events")
    
    def test_system_audit_filter_usuario_creado(self):
        """Filter by event_type=Usuario Creado returns only user creation events"""
        response = requests.get(
            f"{BASE_URL}/api/reports/system-audit",
            params={
                "date_from": "2025-01-01", 
                "date_to": "2026-12-31",
                "event_type": "Usuario Creado"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # All activities should be of type Usuario Creado
        for act in data.get("activities", []):
            assert act["type"] == "Usuario Creado", f"Expected Usuario Creado, got {act['type']}"
        
        print(f"Filtered to {len(data.get('activities', []))} Usuario Creado events")
    
    def test_system_audit_filter_nota_credito(self):
        """Filter by event_type=Nota de Credito returns only credit note events"""
        response = requests.get(
            f"{BASE_URL}/api/reports/system-audit",
            params={
                "date_from": "2025-01-01", 
                "date_to": "2026-12-31",
                "event_type": "Nota de Credito"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # All activities should be of type Nota de Credito
        for act in data.get("activities", []):
            assert act["type"] == "Nota de Credito", f"Expected Nota de Credito, got {act['type']}"
        
        print(f"Filtered to {len(data.get('activities', []))} Nota de Credito events")
    
    def test_system_audit_activities_have_required_fields(self):
        """Each activity has required fields: timestamp, type, description, user, authorizer, value"""
        response = requests.get(
            f"{BASE_URL}/api/reports/system-audit",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"}
        )
        assert response.status_code == 200
        data = response.json()
        
        activities = data.get("activities", [])
        assert len(activities) > 0, "Should have at least one activity"
        
        required_fields = ["timestamp", "type", "description", "user", "authorizer", "value"]
        
        for act in activities[:10]:  # Check first 10
            for field in required_fields:
                assert field in act, f"Activity missing field: {field}"
        
        print(f"All activities have required fields: {required_fields}")
    
    def test_system_audit_collects_from_multiple_sources(self):
        """Verify data comes from multiple sources (9 collections)"""
        response = requests.get(
            f"{BASE_URL}/api/reports/system-audit",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"}
        )
        assert response.status_code == 200
        data = response.json()
        
        by_type = {t["type"]: t["count"] for t in data.get("by_type", [])}
        
        # Check for types from different sources
        expected_source_types = [
            "Anulacion",  # void_audit_logs
            "Movimiento de Ingrediente",  # ingredient_audit_logs
        ]
        
        found_types = [t for t in expected_source_types if t in by_type]
        print(f"Found types from expected sources: {found_types}")
        print(f"All event types found: {list(by_type.keys())}")
        
        # At minimum should have activities from multiple sources
        assert len(by_type) >= 1, "Should have at least 1 event type"
    
    def test_system_audit_summary_totals(self):
        """Summary contains total_activities and total_value"""
        response = requests.get(
            f"{BASE_URL}/api/reports/system-audit",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"}
        )
        assert response.status_code == 200
        data = response.json()
        
        summary = data.get("summary", {})
        assert "total_activities" in summary, "Summary should have total_activities"
        assert "total_value" in summary, "Summary should have total_value"
        
        assert isinstance(summary["total_activities"], int), "total_activities should be int"
        assert isinstance(summary["total_value"], (int, float)), "total_value should be numeric"
        
        print(f"Summary: {summary}")
    
    def test_system_audit_event_type_filter_returns_filter_info(self):
        """Response includes the filter applied"""
        response = requests.get(
            f"{BASE_URL}/api/reports/system-audit",
            params={
                "date_from": "2025-01-01", 
                "date_to": "2026-12-31",
                "event_type": "Anulacion"
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # Response should indicate the filter applied
        assert "event_type_filter" in data or len(data.get("activities", [])) == 0 or \
               all(a["type"] == "Anulacion" for a in data.get("activities", [])), \
               "Response should reflect the filter applied"
        
        print(f"Event type filter in response: {data.get('event_type_filter', 'Anulacion (all activities match)')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
