"""
Test Report Z (Cierre de Día) Endpoints
Tests the Z Report functionality including:
- GET /api/business-days/current/report-z - Current jornada Z report
- GET /api/business-days/{dayId}/report-z - Z report by day ID
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

class TestReportZ:
    """Report Z API Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with admin PIN
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        
        token = login_res.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get current business day
        current_res = self.session.get(f"{BASE_URL}/api/business-days/current")
        self.has_open_day = current_res.json().get("has_open_day", False)
        if self.has_open_day:
            self.day_id = current_res.json().get("business_day", {}).get("id")
        else:
            self.day_id = None
    
    def test_report_z_current_returns_200(self):
        """GET /api/business-days/current/report-z - Returns 200 when business day is open"""
        if not self.has_open_day:
            pytest.skip("No open business day - skipping test")
        
        response = self.session.get(f"{BASE_URL}/api/business-days/current/report-z")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_report_z_current_has_correct_structure(self):
        """GET /api/business-days/current/report-z - Returns correct report structure"""
        if not self.has_open_day:
            pytest.skip("No open business day - skipping test")
        
        response = self.session.get(f"{BASE_URL}/api/business-days/current/report-z")
        assert response.status_code == 200
        
        data = response.json()
        
        # Verify report type
        assert data.get("report_type") == "Z", "Report type should be 'Z'"
        assert "REPORTE Z" in data.get("report_name", ""), "Report name should contain 'REPORTE Z'"
        
        # Verify business_day section
        assert "business_day" in data, "Missing business_day section"
        bd = data["business_day"]
        assert "ref" in bd, "Missing business_day.ref"
        assert "business_date" in bd, "Missing business_day.business_date"
        assert "opened_at" in bd, "Missing business_day.opened_at"
        assert "status" in bd, "Missing business_day.status"
        
        # Verify sales_summary section
        assert "sales_summary" in data, "Missing sales_summary section"
        ss = data["sales_summary"]
        assert "subtotal" in ss, "Missing sales_summary.subtotal"
        assert "itbis" in ss, "Missing sales_summary.itbis"
        assert "propina" in ss, "Missing sales_summary.propina"
        assert "total" in ss, "Missing sales_summary.total"
        assert "invoices_count" in ss, "Missing sales_summary.invoices_count"
        
        # Verify payment_totals section
        assert "payment_totals" in data, "Missing payment_totals section"
        pt = data["payment_totals"]
        assert "efectivo" in pt, "Missing payment_totals.efectivo"
        assert "tarjeta" in pt, "Missing payment_totals.tarjeta"
        assert "transferencia" in pt, "Missing payment_totals.transferencia"
        assert "dolar" in pt, "Missing payment_totals.dolar"
        assert "euro" in pt, "Missing payment_totals.euro"
        
        # Verify sales_by_category exists (can be empty)
        assert "sales_by_category" in data, "Missing sales_by_category section"
        assert isinstance(data["sales_by_category"], list), "sales_by_category should be a list"
        
        # Verify credit_notes (B04) section
        assert "credit_notes" in data, "Missing credit_notes section"
        cn = data["credit_notes"]
        assert "list" in cn, "Missing credit_notes.list"
        assert "count" in cn, "Missing credit_notes.count"
        assert "total" in cn, "Missing credit_notes.total"
        
        # Verify voids section
        assert "voids" in data, "Missing voids section"
        voids = data["voids"]
        assert "list" in voids, "Missing voids.list"
        assert "count" in voids, "Missing voids.count"
        assert "total" in voids, "Missing voids.total"
        
        # Verify cash_reconciliation section
        assert "cash_reconciliation" in data, "Missing cash_reconciliation section"
        cr = data["cash_reconciliation"]
        assert "initial_fund" in cr, "Missing cash_reconciliation.initial_fund"
        assert "cash_sales" in cr, "Missing cash_reconciliation.cash_sales"
        assert "deposits" in cr, "Missing cash_reconciliation.deposits"
        assert "withdrawals" in cr, "Missing cash_reconciliation.withdrawals"
        assert "total_to_deliver" in cr, "Missing cash_reconciliation.total_to_deliver"
        assert "formula" in cr, "Missing cash_reconciliation.formula"
    
    def test_report_z_cash_reconciliation_formula(self):
        """Verify cash reconciliation formula is correct: Fondo Inicial + Ventas Efectivo + Depósitos - Retiros = Total a Entregar"""
        if not self.has_open_day:
            pytest.skip("No open business day - skipping test")
        
        response = self.session.get(f"{BASE_URL}/api/business-days/current/report-z")
        assert response.status_code == 200
        
        data = response.json()
        cr = data.get("cash_reconciliation", {})
        
        initial_fund = cr.get("initial_fund", 0)
        cash_sales = cr.get("cash_sales", 0)
        deposits = cr.get("deposits", 0)
        withdrawals = cr.get("withdrawals", 0)
        total_to_deliver = cr.get("total_to_deliver", 0)
        
        # Verify formula: Fondo Inicial + Ventas Efectivo + Depósitos - Retiros = Total a Entregar
        expected_total = initial_fund + cash_sales + deposits - withdrawals
        assert abs(total_to_deliver - expected_total) < 0.01, \
            f"Formula mismatch: {initial_fund} + {cash_sales} + {deposits} - {withdrawals} = {expected_total}, got {total_to_deliver}"
    
    def test_report_z_by_day_id_returns_200(self):
        """GET /api/business-days/{dayId}/report-z - Returns 200 for valid day ID"""
        if not self.has_open_day or not self.day_id:
            pytest.skip("No open business day - skipping test")
        
        response = self.session.get(f"{BASE_URL}/api/business-days/{self.day_id}/report-z")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    
    def test_report_z_by_day_id_has_correct_structure(self):
        """GET /api/business-days/{dayId}/report-z - Returns same structure as current"""
        if not self.has_open_day or not self.day_id:
            pytest.skip("No open business day - skipping test")
        
        response = self.session.get(f"{BASE_URL}/api/business-days/{self.day_id}/report-z")
        assert response.status_code == 200
        
        data = response.json()
        
        # Same structure checks as current
        assert data.get("report_type") == "Z"
        assert "business_day" in data
        assert "sales_summary" in data
        assert "payment_totals" in data
        assert "sales_by_category" in data
        assert "credit_notes" in data
        assert "voids" in data
        assert "cash_reconciliation" in data
    
    def test_report_z_invalid_day_id_returns_404(self):
        """GET /api/business-days/{dayId}/report-z - Returns 404 for invalid day ID"""
        response = self.session.get(f"{BASE_URL}/api/business-days/invalid-id-123/report-z")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
    
    def test_report_z_without_auth_returns_401(self):
        """GET /api/business-days/current/report-z - Returns 401 without authentication"""
        # Create new session without auth
        no_auth_session = requests.Session()
        no_auth_session.headers.update({"Content-Type": "application/json"})
        
        response = no_auth_session.get(f"{BASE_URL}/api/business-days/current/report-z")
        # Should return 401 or 422 for missing auth
        assert response.status_code in [401, 403, 422], f"Expected 401/403/422, got {response.status_code}"
    
    def test_report_z_payment_totals_match_payment_breakdown(self):
        """Verify payment_totals matches sum of payment_breakdown by type"""
        if not self.has_open_day:
            pytest.skip("No open business day - skipping test")
        
        response = self.session.get(f"{BASE_URL}/api/business-days/current/report-z")
        assert response.status_code == 200
        
        data = response.json()
        payment_breakdown = data.get("payment_breakdown", [])
        payment_totals = data.get("payment_totals", {})
        
        # Calculate totals from breakdown
        efectivo_sum = sum(p.get("amount", 0) for p in payment_breakdown 
                         if "efectivo" in (p.get("method", "").lower() or "") or 
                            "cash" in (p.get("method", "").lower() or ""))
        
        # Check efectivo matches (allow small float difference)
        assert abs(payment_totals.get("efectivo", 0) - efectivo_sum) < 0.01, \
            f"Efectivo mismatch: totals has {payment_totals.get('efectivo', 0)}, breakdown sums to {efectivo_sum}"
    
    def test_report_z_generated_at_is_valid_timestamp(self):
        """Verify generated_at is a valid ISO timestamp"""
        if not self.has_open_day:
            pytest.skip("No open business day - skipping test")
        
        response = self.session.get(f"{BASE_URL}/api/business-days/current/report-z")
        assert response.status_code == 200
        
        data = response.json()
        generated_at = data.get("generated_at")
        
        assert generated_at is not None, "Missing generated_at field"
        
        # Try to parse as ISO date
        from datetime import datetime
        try:
            # Handle ISO format with timezone
            if "+" in generated_at:
                dt = datetime.fromisoformat(generated_at.replace("+00:00", "+00:00"))
            else:
                dt = datetime.fromisoformat(generated_at)
            assert dt is not None
        except ValueError:
            pytest.fail(f"Invalid timestamp format: {generated_at}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
