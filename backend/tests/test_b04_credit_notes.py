"""
B04 Credit Notes Module Tests - Post-Venta y Notas de Crédito
Tests for the B04 flow as per DGII requirements:
- GET /api/credit-notes/return-reasons - Return reasons list
- POST /api/credit-notes/search-by-transaction - Search by internal transaction number
- POST /api/credit-notes - Create credit note (full reversal)
- GET /api/credit-notes/report-607-data - 607 report data for DGII
- GET /api/credit-notes/reports/summary - Credit notes summary
- Role-based access (admin only for B04)
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://dominicanpos.preview.emergentagent.com')

# Test credentials
ADMIN_PIN = "10000"
WAITER_PIN = "5678"  # Maria - waiter
CARLOS_PIN = "1234"  # Carlos - waiter


class TestReturnReasons:
    """Tests for return reasons endpoint - no auth required"""
    
    def test_get_return_reasons_returns_six_reasons(self):
        """GET /api/credit-notes/return-reasons returns 6 default reasons"""
        response = requests.get(f"{BASE_URL}/api/credit-notes/return-reasons")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        reasons = response.json()
        assert isinstance(reasons, list), "Response should be a list"
        assert len(reasons) == 6, f"Expected 6 reasons, got {len(reasons)}"
        
        expected_codes = [
            "ERROR_FACTURACION", 
            "DEVOLUCION_PRODUCTO", 
            "ANULACION_VENTA",
            "DESCUENTO_POSTERIOR",
            "CAMBIO_NCF",
            "ERROR_PRECIO"
        ]
        
        actual_codes = [r.get("code") for r in reasons]
        for code in expected_codes:
            assert code in actual_codes, f"Missing reason code: {code}"
        
        print(f"✅ Found {len(reasons)} return reasons with all expected codes")


class TestSearchByTransactionEndpoint:
    """Tests for /search-by-transaction endpoint - admin only"""
    
    @pytest.fixture
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        if response.status_code != 200:
            pytest.skip("Could not authenticate admin")
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    @pytest.fixture
    def waiter_headers(self):
        """Get waiter auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": WAITER_PIN})
        if response.status_code != 200:
            pytest.skip("Could not authenticate waiter")
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_admin_can_search_transaction(self, admin_headers):
        """Admin can search by transaction number"""
        response = requests.post(
            f"{BASE_URL}/api/credit-notes/search-by-transaction",
            json={"transaction_number": 26},
            headers=admin_headers
        )
        
        # Should either find the bill or return 400 if already reversed
        assert response.status_code in [200, 400], f"Expected 200 or 400, got {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "bill" in data, "Response should have 'bill'"
            assert "can_create_credit_note" in data, "Response should have 'can_create_credit_note'"
            assert data["bill"]["transaction_number"] == 26, "Should return correct transaction"
            print(f"✅ Admin found transaction #26 - NCF: {data.get('original_ncf')}")
        else:
            error = response.json()
            print(f"✅ Transaction #26 already reversed: {error.get('detail')}")
    
    def test_waiter_cannot_search_transaction(self, waiter_headers):
        """Waiter (non-admin) cannot search by transaction number"""
        response = requests.post(
            f"{BASE_URL}/api/credit-notes/search-by-transaction",
            json={"transaction_number": 26},
            headers=waiter_headers
        )
        
        assert response.status_code == 403, f"Expected 403 Forbidden for waiter, got {response.status_code}"
        
        error = response.json()
        assert "Solo administradores" in error.get("detail", ""), "Should have admin-only message"
        print(f"✅ Waiter correctly denied: {error.get('detail')}")
    
    def test_search_reversed_transaction_returns_400(self, admin_headers):
        """Searching for already reversed transaction returns appropriate error"""
        # Transaction 27 was mentioned as already reversed
        response = requests.post(
            f"{BASE_URL}/api/credit-notes/search-by-transaction",
            json={"transaction_number": 27},
            headers=admin_headers
        )
        
        assert response.status_code == 400, f"Expected 400 for reversed transaction, got {response.status_code}"
        
        error = response.json()
        assert "anulada" in error.get("detail", "").lower() or "B04" in error.get("detail", ""), \
            "Should mention transaction was already reversed"
        print(f"✅ Reversed transaction correctly detected: {error.get('detail')}")
    
    def test_search_nonexistent_transaction_returns_404(self, admin_headers):
        """Searching for non-existent transaction returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/credit-notes/search-by-transaction",
            json={"transaction_number": 999999},
            headers=admin_headers
        )
        
        assert response.status_code == 404, f"Expected 404 for non-existent transaction, got {response.status_code}"
        print(f"✅ Non-existent transaction correctly returns 404")


class TestReport607DataEndpoint:
    """Tests for /report-607-data endpoint - DGII compliance"""
    
    @pytest.fixture
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        if response.status_code != 200:
            pytest.skip("Could not authenticate admin")
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_report_607_returns_valid_structure(self, admin_headers):
        """GET /api/credit-notes/report-607-data returns valid 607 format"""
        response = requests.get(
            f"{BASE_URL}/api/credit-notes/report-607-data?start_date=2024-01-01&end_date=2026-12-31",
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "period" in data, "Should have period"
        assert "total_credit_notes" in data, "Should have total_credit_notes"
        assert "total_amount" in data, "Should have total_amount"
        assert "data" in data, "Should have data array"
        
        print(f"✅ Report 607 returned {data['total_credit_notes']} credit notes for period {data['period']}")
        
        # If there are credit notes, verify DGII format
        if data["data"]:
            cn = data["data"][0]
            assert "ncf" in cn, "Credit note should have NCF"
            assert "ncf_modificado" in cn, "Should have NCF modificado (affected NCF)"
            assert "tipo_ingreso" in cn, "Should have tipo_ingreso"
            assert cn.get("tipo_ingreso") == "04", "tipo_ingreso should be '04' for credit note"
            print(f"✅ First credit note NCF: {cn['ncf']}, affects: {cn['ncf_modificado']}")


class TestReportsSummaryEndpoint:
    """Tests for /reports/summary endpoint"""
    
    @pytest.fixture
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        if response.status_code != 200:
            pytest.skip("Could not authenticate admin")
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_summary_returns_valid_data(self, admin_headers):
        """GET /api/credit-notes/reports/summary returns summary data"""
        response = requests.get(
            f"{BASE_URL}/api/credit-notes/reports/summary?period=month",
            headers=admin_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "period" in data, "Should have period"
        assert "total_notes" in data, "Should have total_notes"
        assert "total_reversed" in data, "Should have total_reversed"
        assert "by_reason" in data, "Should have by_reason breakdown"
        
        print(f"✅ Summary: {data['total_notes']} notes, RD$ {data['total_reversed']:.2f} reversed")
        
        if data["by_reason"]:
            print(f"   Breakdown by reason:")
            for r in data["by_reason"]:
                print(f"   - {r['reason']}: {r['count']} notes, RD$ {r['total']:.2f}")


class TestCreateCreditNote:
    """Tests for POST /api/credit-notes - create B04"""
    
    @pytest.fixture
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        if response.status_code != 200:
            pytest.skip("Could not authenticate admin")
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    @pytest.fixture
    def waiter_headers(self):
        """Get waiter auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": WAITER_PIN})
        if response.status_code != 200:
            pytest.skip("Could not authenticate waiter")
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    @pytest.fixture
    def return_reason(self):
        """Get a return reason for testing"""
        response = requests.get(f"{BASE_URL}/api/credit-notes/return-reasons")
        if response.status_code != 200:
            pytest.skip("Could not get return reasons")
        reasons = response.json()
        # Get ERROR_FACTURACION which doesn't require authorization
        for r in reasons:
            if r.get("code") == "ERROR_FACTURACION":
                return r
        return reasons[0] if reasons else None
    
    def test_list_credit_notes(self, admin_headers):
        """GET /api/credit-notes returns list of credit notes"""
        response = requests.get(f"{BASE_URL}/api/credit-notes", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Found {len(data)} credit notes in system")
        
        if data:
            cn = data[0]
            assert cn.get("ncf", "").startswith("B04"), "Credit note NCF should start with B04"
            print(f"   Most recent: {cn.get('ncf')} for bill {cn.get('original_ncf')}")
    
    def test_cannot_reverse_already_reversed_bill(self, admin_headers, return_reason):
        """Cannot create credit note for already reversed bill"""
        # Get a reversed bill
        response = requests.get(f"{BASE_URL}/api/bills?status=reversed&limit=1", headers=admin_headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No reversed bills to test")
        
        reversed_bill = response.json()[0]
        
        # Try to create credit note for it
        payload = {
            "original_bill_id": reversed_bill["id"],
            "reason_id": return_reason["id"],
            "reason_text": return_reason["name"],
            "is_full_reversal": True
        }
        
        response = requests.post(f"{BASE_URL}/api/credit-notes", json=payload, headers=admin_headers)
        assert response.status_code == 400, f"Should reject already reversed bill, got {response.status_code}"
        
        error = response.json()
        print(f"✅ Correctly rejected: {error.get('detail')}")


class TestBillStatusAfterCreditNote:
    """Tests verifying bill status changes after credit note creation"""
    
    @pytest.fixture
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        if response.status_code != 200:
            pytest.skip("Could not authenticate admin")
        token = response.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_reversed_bill_has_credit_note_reference(self, admin_headers):
        """Reversed bill should have credit_note_id and credit_note_ncf"""
        response = requests.get(f"{BASE_URL}/api/bills?status=reversed&limit=1", headers=admin_headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No reversed bills to verify")
        
        reversed_bill = response.json()[0]
        
        assert reversed_bill.get("status") == "reversed", "Bill status should be 'reversed'"
        assert reversed_bill.get("credit_note_id"), "Bill should have credit_note_id"
        assert reversed_bill.get("credit_note_ncf"), "Bill should have credit_note_ncf"
        assert reversed_bill.get("credit_note_ncf", "").startswith("B04"), "Credit note NCF should be B04"
        
        print(f"✅ Bill {reversed_bill.get('ncf')} correctly linked to credit note {reversed_bill.get('credit_note_ncf')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
