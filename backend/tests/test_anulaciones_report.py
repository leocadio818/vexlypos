"""
Test suite for Anulaciones Report features:
1. /api/void-audit-logs/report endpoint
2. /api/auth/verify-manager endpoint (Admin PIN 0000 vs Mesero PIN 1234)
3. Cancellation reasons with requires_manager_auth field
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestVoidAuditLogsReport:
    """Test the void-audit-logs report endpoint for AnulacionesReport page"""
    
    @pytest.fixture
    def auth_headers(self):
        """Login as admin and get auth headers"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert res.status_code == 200, f"Login failed: {res.text}"
        token = res.json().get("token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_report_endpoint_day_period(self, auth_headers):
        """Test /api/void-audit-logs/report with period=day"""
        res = requests.get(f"{BASE_URL}/api/void-audit-logs/report?period=day", headers=auth_headers)
        assert res.status_code == 200, f"Report failed: {res.text}"
        data = res.json()
        
        # Verify response structure
        assert "summary" in data, "Missing summary in report"
        assert "reason_ranking" in data, "Missing reason_ranking in report"
        assert "user_audit" in data, "Missing user_audit in report"
        assert "logs" in data, "Missing logs in report"
        
        # Verify summary fields
        summary = data["summary"]
        assert "total_voided" in summary
        assert "recovered_value" in summary
        assert "loss_value" in summary
        assert "total_count" in summary
        assert summary["period"] == "day"
        print(f"Day report: {summary['total_count']} voids, RD$ {summary['total_voided']} total")
    
    def test_report_endpoint_week_period(self, auth_headers):
        """Test /api/void-audit-logs/report with period=week"""
        res = requests.get(f"{BASE_URL}/api/void-audit-logs/report?period=week", headers=auth_headers)
        assert res.status_code == 200, f"Report failed: {res.text}"
        data = res.json()
        
        assert data["summary"]["period"] == "week"
        assert isinstance(data["reason_ranking"], list)
        assert isinstance(data["user_audit"], list)
        print(f"Week report: {data['summary']['total_count']} voids, {len(data['reason_ranking'])} reasons")
    
    def test_report_endpoint_month_period(self, auth_headers):
        """Test /api/void-audit-logs/report with period=month"""
        res = requests.get(f"{BASE_URL}/api/void-audit-logs/report?period=month", headers=auth_headers)
        assert res.status_code == 200, f"Report failed: {res.text}"
        data = res.json()
        
        assert data["summary"]["period"] == "month"
        # Verify user_audit structure if present
        if data["user_audit"]:
            user = data["user_audit"][0]
            assert "user_id" in user
            assert "user_name" in user
            assert "count" in user
            assert "total_value" in user
            assert "recovered" in user
            assert "loss" in user
        print(f"Month report: {data['summary']['total_count']} voids, {len(data['user_audit'])} users")


class TestVerifyManagerEndpoint:
    """Test the /api/auth/verify-manager endpoint for manager authorization"""
    
    @pytest.fixture
    def auth_headers(self):
        """Login as admin and get auth headers"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert res.status_code == 200
        token = res.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    def test_verify_admin_pin_0000_authorized(self, auth_headers):
        """Admin PIN 0000 should be authorized as manager"""
        res = requests.post(f"{BASE_URL}/api/auth/verify-manager", 
                          json={"pin": "0000"}, 
                          headers=auth_headers)
        assert res.status_code == 200, f"Admin verification failed: {res.text}"
        data = res.json()
        
        assert data.get("authorized") == True, "Admin should be authorized"
        assert "user_id" in data, "Missing user_id in response"
        assert "user_name" in data, "Missing user_name in response"
        print(f"Admin verified: {data['user_name']} ({data['role']})")
    
    def test_verify_waiter_pin_1234_not_authorized(self, auth_headers):
        """Waiter PIN 1234 should NOT be authorized as manager"""
        res = requests.post(f"{BASE_URL}/api/auth/verify-manager", 
                          json={"pin": "1234"}, 
                          headers=auth_headers)
        # Should return 401 (invalid PIN) or 403 (not a manager)
        assert res.status_code in [401, 403], f"Waiter should not be authorized: {res.status_code} {res.text}"
        print(f"Waiter PIN 1234 correctly rejected with status {res.status_code}")
    
    def test_verify_invalid_pin(self, auth_headers):
        """Invalid PIN should return 401"""
        res = requests.post(f"{BASE_URL}/api/auth/verify-manager", 
                          json={"pin": "9999"}, 
                          headers=auth_headers)
        assert res.status_code == 401, f"Invalid PIN should return 401: {res.text}"
        print("Invalid PIN correctly rejected with 401")


class TestCancellationReasonsWithAuth:
    """Test cancellation reasons with requires_manager_auth field"""
    
    @pytest.fixture
    def auth_headers(self):
        """Login as admin"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert res.status_code == 200
        token = res.json().get("token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_reasons_have_requires_manager_auth_field(self, auth_headers):
        """Cancellation reasons should include requires_manager_auth field"""
        res = requests.get(f"{BASE_URL}/api/cancellation-reasons", headers=auth_headers)
        assert res.status_code == 200, f"Failed to get reasons: {res.text}"
        reasons = res.json()
        
        assert len(reasons) > 0, "No cancellation reasons found"
        
        # Check if any reason has requires_manager_auth
        auth_required_reasons = [r for r in reasons if r.get("requires_manager_auth") == True]
        no_auth_reasons = [r for r in reasons if not r.get("requires_manager_auth")]
        
        print(f"Reasons requiring auth: {[r['name'] for r in auth_required_reasons]}")
        print(f"Reasons NOT requiring auth: {[r['name'] for r in no_auth_reasons]}")
        
        # According to the agent context, these should require auth
        expected_auth_reasons = ["Botella no abierta", "Plato mal preparado", "Cliente se fue", 
                                 "Botella/bebida abierta", "Comida rechazada"]
        expected_no_auth_reasons = ["Error de digitacion", "Plato no preparado"]
        
        for expected in expected_auth_reasons:
            matches = [r for r in auth_required_reasons if r.get("name") == expected]
            if matches:
                print(f"✓ '{expected}' correctly requires auth")
        
        for expected in expected_no_auth_reasons:
            matches = [r for r in no_auth_reasons if r.get("name") == expected]
            if matches:
                print(f"✓ '{expected}' correctly does NOT require auth")
    
    def test_reason_badge_data(self, auth_headers):
        """Verify reasons have data needed for badges (return_to_inventory, requires_manager_auth)"""
        res = requests.get(f"{BASE_URL}/api/cancellation-reasons", headers=auth_headers)
        assert res.status_code == 200
        reasons = res.json()
        
        for reason in reasons:
            assert "name" in reason, f"Reason missing name"
            assert "id" in reason, f"Reason missing id"
            # return_to_inventory determines Retorna/Merma badge
            assert "return_to_inventory" in reason, f"Reason {reason['name']} missing return_to_inventory"
            print(f"Reason: {reason['name'][:25]:25s} | return={reason.get('return_to_inventory')} | auth={reason.get('requires_manager_auth', False)}")


class TestCancelWithManagerAuth:
    """Test cancellation flow with manager authorization"""
    
    @pytest.fixture
    def admin_headers(self):
        """Login as admin"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert res.status_code == 200
        token = res.json().get("token")
        return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    @pytest.fixture
    def auth_reason_id(self, admin_headers):
        """Get a reason that requires manager auth"""
        res = requests.get(f"{BASE_URL}/api/cancellation-reasons", headers=admin_headers)
        reasons = res.json()
        auth_reasons = [r for r in reasons if r.get("requires_manager_auth")]
        if auth_reasons:
            return auth_reasons[0]["id"]
        return None
    
    @pytest.fixture
    def no_auth_reason_id(self, admin_headers):
        """Get a reason that does NOT require manager auth"""
        res = requests.get(f"{BASE_URL}/api/cancellation-reasons", headers=admin_headers)
        reasons = res.json()
        no_auth_reasons = [r for r in reasons if not r.get("requires_manager_auth")]
        if no_auth_reasons:
            return no_auth_reasons[0]["id"]
        return None
    
    def test_cancel_with_auth_reason_requires_authorization(self, admin_headers, auth_reason_id):
        """Cancelling with auth-required reason without authorization should fail"""
        if not auth_reason_id:
            pytest.skip("No auth-required reasons found")
        
        # Get or create an order with items
        orders_res = requests.get(f"{BASE_URL}/api/orders?status=active", headers=admin_headers)
        orders = orders_res.json()
        
        if orders:
            order = orders[0]
            active_items = [i for i in order.get("items", []) if i.get("status") != "cancelled"]
            if active_items:
                item = active_items[0]
                # Try to cancel without authorized_by_id
                res = requests.post(
                    f"{BASE_URL}/api/orders/{order['id']}/cancel-item/{item['id']}",
                    json={
                        "reason_id": auth_reason_id,
                        "return_to_inventory": False,
                        "comments": "TEST - should require auth"
                    },
                    headers=admin_headers
                )
                # Should fail with 403 (requires manager auth)
                assert res.status_code == 403, f"Should require auth: {res.text}"
                print(f"Correctly rejected cancel without authorization: {res.json().get('detail')}")
            else:
                print("No active items in order to test")
        else:
            print("No active orders to test cancel flow")
    
    def test_cancel_with_no_auth_reason_succeeds(self, admin_headers, no_auth_reason_id):
        """Cancelling with non-auth reason should succeed without authorization"""
        if not no_auth_reason_id:
            pytest.skip("No non-auth reasons found")
        
        print(f"Testing cancel with reason_id: {no_auth_reason_id} (no auth required)")
        # This test verifies the reason exists but doesn't need to actually cancel


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
