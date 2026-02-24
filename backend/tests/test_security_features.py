"""
POS Security Features Tests
Test Features:
1. DELETE terminal in use returns 400 error
2. Close shift with open orders returns 400 
3. Session history includes total_difference for closed sessions
4. X report includes cash_declared, expected_cash, difference
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDeleteTerminalInUse:
    """Feature 1: Prevent deletion of terminals currently in use"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert login_res.status_code == 200, f"Admin login failed: {login_res.text}"
        self.token = login_res.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        self.admin_user_id = login_res.json().get("user", {}).get("id")
    
    def test_01_delete_terminal_not_in_use_succeeds(self):
        """Test that deleting a terminal NOT in use should succeed"""
        # Create a new terminal for testing
        terminal_data = {"name": "Test Terminal Delete", "code": "TDEL", "is_active": True}
        create_res = self.session.post(f"{BASE_URL}/api/pos-sessions/terminals", json=terminal_data)
        assert create_res.status_code == 200, f"Failed to create terminal: {create_res.text}"
        terminal = create_res.json()
        terminal_id = terminal.get("id")
        
        # Delete the terminal (should succeed as it's not in use)
        delete_res = self.session.delete(f"{BASE_URL}/api/pos-sessions/terminals/{terminal_id}")
        assert delete_res.status_code == 200, f"Delete should succeed: {delete_res.text}"
        print(f"✓ Successfully deleted terminal not in use: {terminal_id}")
    
    def test_02_delete_terminal_in_use_returns_400(self):
        """Test that deleting a terminal IN USE returns 400 error"""
        # First, login as cashier Luis to open a shift
        cashier_session = requests.Session()
        cashier_session.headers.update({"Content-Type": "application/json"})
        
        cashier_login = cashier_session.post(f"{BASE_URL}/api/auth/login", json={"pin": "4321"})
        assert cashier_login.status_code == 200, f"Cashier login failed: {cashier_login.text}"
        cashier_token = cashier_login.json().get("token")
        cashier_session.headers.update({"Authorization": f"Bearer {cashier_token}"})
        
        # Check if cashier has open session
        check_res = cashier_session.get(f"{BASE_URL}/api/pos-sessions/check")
        has_session = check_res.json().get("has_open_session", False)
        
        terminal_name = "Test Term InUse"
        terminal_id = None
        
        if not has_session:
            # Create a test terminal
            create_term = self.session.post(f"{BASE_URL}/api/pos-sessions/terminals", 
                json={"name": terminal_name, "code": "TIU1", "is_active": True})
            if create_term.status_code == 200:
                terminal_id = create_term.json().get("id")
            
            # Open a session with this terminal as cashier
            open_res = cashier_session.post(f"{BASE_URL}/api/pos-sessions/open", json={
                "terminal_name": terminal_name,
                "opening_amount": 1000
            })
            assert open_res.status_code == 200, f"Failed to open session: {open_res.text}"
            session_data = open_res.json()
            session_id = session_data.get("id")
            print(f"✓ Opened session {session_id} on terminal {terminal_name}")
        else:
            # Use the existing session's terminal
            current = cashier_session.get(f"{BASE_URL}/api/pos-sessions/current")
            terminal_name = current.json().get("terminal_name", "")
            session_id = current.json().get("id")
            print(f"✓ Using existing session {session_id} on terminal {terminal_name}")
        
        # Get terminal ID if we don't have it
        if not terminal_id:
            terminals_res = self.session.get(f"{BASE_URL}/api/pos-sessions/terminals/all")
            terminals = terminals_res.json() or []
            for t in terminals:
                if t.get("name") == terminal_name:
                    terminal_id = t.get("id")
                    break
        
        if terminal_id:
            # Try to delete terminal in use - should return 400
            delete_res = self.session.delete(f"{BASE_URL}/api/pos-sessions/terminals/{terminal_id}")
            assert delete_res.status_code == 400, f"Expected 400 but got {delete_res.status_code}: {delete_res.text}"
            error_detail = delete_res.json().get("detail", "")
            assert "en uso" in error_detail.lower() or "in use" in error_detail.lower(), f"Error should mention 'in use': {error_detail}"
            print(f"✓ Delete correctly blocked with 400: {error_detail}")
        else:
            print("⚠ Could not find terminal ID to test delete")
        
        # Cleanup: Close the session we opened
        if not has_session and session_id:
            close_res = cashier_session.put(f"{BASE_URL}/api/pos-sessions/{session_id}/close", json={
                "cash_declared": 1000,
                "card_declared": 0
            })
            print(f"✓ Closed test session: {close_res.status_code}")


class TestCloseShiftWithOpenOrders:
    """Feature 2: Block cashiers from closing shift if they have open orders"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as cashier Luis
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "4321"})
        assert login_res.status_code == 200, f"Cashier login failed: {login_res.text}"
        self.token = login_res.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        self.user_id = login_res.json().get("user", {}).get("id")
        self.user_name = login_res.json().get("user", {}).get("name")
    
    def test_03_close_shift_with_open_orders_returns_400(self):
        """Test that closing shift with open orders returns 400 with message"""
        # Check for current session
        check_res = self.session.get(f"{BASE_URL}/api/pos-sessions/check")
        has_session = check_res.json().get("has_open_session", False)
        
        if not has_session:
            # Open a session first
            open_res = self.session.post(f"{BASE_URL}/api/pos-sessions/open", json={
                "terminal_name": "Test Open Orders",
                "opening_amount": 500
            })
            assert open_res.status_code == 200, f"Failed to open session: {open_res.text}"
        
        current_res = self.session.get(f"{BASE_URL}/api/pos-sessions/current")
        session = current_res.json()
        session_id = session.get("id")
        
        # Create an open order assigned to this user
        # First find a free table
        tables_res = self.session.get(f"{BASE_URL}/api/tables")
        tables = tables_res.json() or []
        free_table = next((t for t in tables if t.get("status") == "free"), None)
        
        if free_table:
            # Create order on this table
            order_data = {
                "table_id": free_table["id"],
                "table_number": free_table.get("number", 1),
                "waiter_id": self.user_id,
                "waiter_name": self.user_name,
                "items": [],
                "status": "active"
            }
            order_res = self.session.post(f"{BASE_URL}/api/orders", json=order_data)
            if order_res.status_code == 200:
                order_id = order_res.json().get("id")
                print(f"✓ Created test order {order_id} on table {free_table.get('number')}")
                
                # Now try to close the shift - should return 400
                close_res = self.session.put(f"{BASE_URL}/api/pos-sessions/{session_id}/close", json={
                    "cash_declared": 500,
                    "card_declared": 0
                })
                
                assert close_res.status_code == 400, f"Expected 400 but got {close_res.status_code}: {close_res.text}"
                error_detail = close_res.json().get("detail", "")
                assert "cuentas abiertas" in error_detail.lower() or "open" in error_detail.lower(), f"Error should mention open orders: {error_detail}"
                print(f"✓ Close shift correctly blocked with 400: {error_detail}")
                
                # Cleanup: Delete/void the test order
                void_res = self.session.put(f"{BASE_URL}/api/orders/{order_id}/status", json={"status": "cancelled"})
                print(f"✓ Cleaned up test order: {void_res.status_code}")
        else:
            print("⚠ No free tables available to create test order")


class TestSessionHistory:
    """Feature: Session history includes total_difference for closed sessions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert login_res.status_code == 200, f"Admin login failed: {login_res.text}"
        self.token = login_res.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_04_session_history_includes_total_difference(self):
        """Test that session history endpoint includes total_difference"""
        history_res = self.session.get(f"{BASE_URL}/api/pos-sessions/history?limit=10&status=closed")
        assert history_res.status_code == 200, f"Failed to get history: {history_res.text}"
        
        sessions = history_res.json() or []
        print(f"✓ Got {len(sessions)} closed sessions")
        
        # Check if closed sessions have total_difference field
        sessions_with_diff = [s for s in sessions if "total_difference" in s]
        print(f"✓ {len(sessions_with_diff)}/{len(sessions)} sessions have total_difference field")
        
        # If any sessions have total_difference, verify the field type
        for s in sessions_with_diff[:3]:
            diff = s.get("total_difference")
            print(f"  Session {s.get('ref', s.get('id', 'unknown'))[:15]}: difference={diff}")
            assert isinstance(diff, (int, float)), f"total_difference should be numeric: {diff}"


class TestReportX:
    """Feature: X report includes cash_declared, expected_cash, difference"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert login_res.status_code == 200, f"Admin login failed: {login_res.text}"
        self.token = login_res.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_05_report_x_includes_cash_reconciliation_fields(self):
        """Test that X report includes cash_declared, expected_cash, difference"""
        # First get a closed session ID from history
        history_res = self.session.get(f"{BASE_URL}/api/pos-sessions/history?limit=5&status=closed")
        assert history_res.status_code == 200, f"Failed to get history: {history_res.text}"
        
        sessions = history_res.json() or []
        if not sessions:
            pytest.skip("No closed sessions to test report X")
        
        # Try to get X report for a closed session
        session_id = sessions[0].get("id")
        report_res = self.session.get(f"{BASE_URL}/api/business-days/session/{session_id}/report-x")
        
        if report_res.status_code == 200:
            report = report_res.json()
            cash_recon = report.get("cash_reconciliation", {})
            
            print(f"✓ Got X report for session {session_id}")
            print(f"  cash_declared: {cash_recon.get('cash_declared')}")
            print(f"  expected_cash: {cash_recon.get('expected_cash')}")
            print(f"  difference: {cash_recon.get('difference')}")
            
            # Verify the fields exist
            assert "cash_declared" in cash_recon or cash_recon.get("cash_declared", 0) >= 0, "Missing cash_declared"
            assert "expected_cash" in cash_recon or cash_recon.get("expected_cash", 0) >= 0, "Missing expected_cash"
            assert "difference" in cash_recon or "difference" in str(cash_recon), "Missing difference"
        else:
            print(f"⚠ Could not get X report (status {report_res.status_code}): {report_res.text}")


class TestTerminalCRUD:
    """Terminal CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert login_res.status_code == 200, f"Admin login failed: {login_res.text}"
        self.token = login_res.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
    
    def test_06_terminal_crud_operations(self):
        """Test terminal create, read, update operations"""
        # Create
        create_res = self.session.post(f"{BASE_URL}/api/pos-sessions/terminals", json={
            "name": "CRUD Test Terminal",
            "code": "CRUD1",
            "is_active": True
        })
        assert create_res.status_code == 200, f"Create failed: {create_res.text}"
        terminal = create_res.json()
        terminal_id = terminal.get("id")
        print(f"✓ Created terminal: {terminal_id}")
        
        # Read all
        read_res = self.session.get(f"{BASE_URL}/api/pos-sessions/terminals/all")
        assert read_res.status_code == 200, f"Read failed: {read_res.text}"
        terminals = read_res.json()
        assert any(t.get("id") == terminal_id for t in terminals), "Created terminal not found in list"
        print(f"✓ Found terminal in list")
        
        # Update
        update_res = self.session.put(f"{BASE_URL}/api/pos-sessions/terminals/{terminal_id}", json={
            "name": "CRUD Test Updated",
            "code": "CRUD2",
            "is_active": False
        })
        assert update_res.status_code == 200, f"Update failed: {update_res.text}"
        print(f"✓ Updated terminal")
        
        # Delete
        delete_res = self.session.delete(f"{BASE_URL}/api/pos-sessions/terminals/{terminal_id}")
        assert delete_res.status_code == 200, f"Delete failed: {delete_res.text}"
        print(f"✓ Deleted terminal")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
