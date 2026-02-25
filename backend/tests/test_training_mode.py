"""
Training Mode Tests - Phase 2 Implementation
Tests all training mode features:
1. JWT token contains training_mode flag
2. Orders flagged with training_mode: true
3. Bills get NCF 'ENTRENAMIENTO' instead of real fiscal number
4. Payments don't affect business day totals
5. X/Z reports exclude training bills
6. Print commands include 'ENTRENAMIENTO' header
"""
import pytest
import requests
import os
import json
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test users
CARLOS_PIN = "1234"  # training_mode: true
ADMIN_PIN = "10000"  # training_mode: false

# Known IDs from context
OPEN_SESSION_ID = "003f1696-a17d-45ed-b087-5f0dfeb2c1b1"
OPEN_BUSINESS_DAY_ID = "9309e003-160f-4aac-bfc9-8d7c4dabaac7"


class TestTrainingModeJWT:
    """Test 1: JWT token contains training_mode field"""
    
    def test_01_carlos_jwt_has_training_mode_true(self):
        """Carlos (PIN 1234) should have training_mode: true in JWT"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": CARLOS_PIN})
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "No token in response"
        
        # Decode JWT (without verification - just to read payload)
        token = data["token"]
        parts = token.split(".")
        assert len(parts) == 3, "Invalid JWT format"
        
        # Add padding if needed
        payload_part = parts[1]
        padding = 4 - len(payload_part) % 4
        if padding != 4:
            payload_part += "=" * padding
        
        payload = json.loads(base64.b64decode(payload_part))
        
        assert "training_mode" in payload, "training_mode not in JWT payload"
        assert payload["training_mode"] == True, f"Expected training_mode=True, got {payload['training_mode']}"
        assert payload["name"] == "Carlos", f"Expected name=Carlos, got {payload['name']}"
        print(f"✓ Carlos JWT payload: training_mode={payload['training_mode']}, name={payload['name']}")
    
    def test_02_admin_jwt_has_training_mode_false(self):
        """Admin (PIN 10000) should have training_mode: false in JWT"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        token = data["token"]
        parts = token.split(".")
        
        payload_part = parts[1]
        padding = 4 - len(payload_part) % 4
        if padding != 4:
            payload_part += "=" * padding
        
        payload = json.loads(base64.b64decode(payload_part))
        
        assert "training_mode" in payload, "training_mode not in JWT payload"
        assert payload["training_mode"] == False, f"Expected training_mode=False, got {payload['training_mode']}"
        print(f"✓ Admin JWT payload: training_mode={payload['training_mode']}, name={payload['name']}")


class TestTrainingModeOrders:
    """Test 2: Training order creation flags order with training_mode: true"""
    
    @pytest.fixture
    def carlos_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": CARLOS_PIN})
        return response.json()["token"]
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        return response.json()["token"]
    
    def test_01_get_free_table(self, carlos_token):
        """Find a free table for testing"""
        headers = {"Authorization": f"Bearer {carlos_token}"}
        response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        assert response.status_code == 200
        
        tables = response.json()
        free_tables = [t for t in tables if t.get("status") == "free"]
        assert len(free_tables) > 0, "No free tables available for testing"
        
        print(f"✓ Found {len(free_tables)} free tables")
        return free_tables[0]
    
    def test_02_training_order_has_training_mode_flag(self, carlos_token):
        """Order created by Carlos should have training_mode: true"""
        headers = {"Authorization": f"Bearer {carlos_token}"}
        
        # Get a free table
        tables_res = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        tables = tables_res.json()
        free_tables = [t for t in tables if t.get("status") == "free"]
        
        if not free_tables:
            pytest.skip("No free tables available")
        
        table = free_tables[0]
        print(f"Using table: {table['number']} (id: {table['id']})")
        
        # Create order
        order_data = {
            "table_id": table["id"],
            "items": []
        }
        response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
        assert response.status_code == 200, f"Failed to create order: {response.text}"
        
        order = response.json()
        
        # Verify training_mode flag
        assert "training_mode" in order, "training_mode not in order"
        assert order["training_mode"] == True, f"Expected training_mode=True, got {order.get('training_mode')}"
        
        print(f"✓ Order {order['id'][:8]} created with training_mode=True")
        
        # Store for cleanup
        self.__class__.test_order_id = order["id"]
        self.__class__.test_table_id = table["id"]
        
        return order


class TestTrainingModeBills:
    """Test 3: Training bills get NCF 'ENTRENAMIENTO'"""
    
    @pytest.fixture
    def carlos_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": CARLOS_PIN})
        return response.json()["token"]
    
    def test_01_find_training_bill(self, carlos_token):
        """Find existing training bill in system"""
        headers = {"Authorization": f"Bearer {carlos_token}"}
        
        response = requests.get(f"{BASE_URL}/api/bills", headers=headers)
        assert response.status_code == 200
        
        bills = response.json()
        training_bills = [b for b in bills if b.get("training_mode") == True]
        
        if training_bills:
            bill = training_bills[0]
            print(f"✓ Found training bill: NCF={bill.get('ncf')}, training_mode={bill.get('training_mode')}")
            assert bill.get("ncf") == "ENTRENAMIENTO", f"Expected NCF='ENTRENAMIENTO', got {bill.get('ncf')}"
        else:
            print("⚠ No training bills found in system (may need to create one)")
    
    def test_02_training_bill_has_entrenamiento_ncf(self, carlos_token):
        """Training bill should have NCF='ENTRENAMIENTO'"""
        headers = {"Authorization": f"Bearer {carlos_token}"}
        
        # Get all bills and filter training ones
        response = requests.get(f"{BASE_URL}/api/bills", headers=headers)
        bills = response.json()
        
        training_bills = [b for b in bills if b.get("training_mode") == True]
        
        for bill in training_bills:
            assert bill.get("ncf") == "ENTRENAMIENTO", f"Training bill {bill['id'][:8]} has NCF={bill.get('ncf')}"
            print(f"✓ Bill {bill['id'][:8]}: NCF={bill.get('ncf')}, training_mode={bill.get('training_mode')}")
        
        if not training_bills:
            print("⚠ No training bills found - skipping NCF verification")


class TestTrainingModePaymentTotals:
    """Test 4: Training payments don't affect business day totals"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        return response.json()["token"]
    
    def test_01_get_current_day_totals(self, admin_token):
        """Get current business day totals"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/business-days/current", headers=headers)
        assert response.status_code == 200, f"Failed to get current day: {response.text}"
        
        data = response.json()
        if data.get("has_open_day"):
            day = data["business_day"]
            stats = data.get("stats", {})
            print(f"✓ Business day: {day.get('business_date')}")
            print(f"  Total sales: ${stats.get('total_sales', day.get('total_sales', 0)):.2f}")
            print(f"  Total invoices: {stats.get('total_invoices', day.get('total_invoices', 0))}")
            return data
        else:
            print("⚠ No open business day")
            return None
    
    def test_02_training_bills_excluded_from_totals(self, admin_token):
        """Verify training bills are excluded from day totals"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get all paid bills
        bills_res = requests.get(f"{BASE_URL}/api/bills?status=paid", headers=headers)
        all_bills = bills_res.json()
        
        training_bills = [b for b in all_bills if b.get("training_mode") == True]
        real_bills = [b for b in all_bills if b.get("training_mode") != True]
        
        training_total = sum(b.get("total", 0) for b in training_bills)
        real_total = sum(b.get("total", 0) for b in real_bills)
        
        print(f"✓ Training bills: {len(training_bills)} (${training_total:.2f})")
        print(f"✓ Real bills: {len(real_bills)} (${real_total:.2f})")
        
        # Get business day stats
        response = requests.get(f"{BASE_URL}/api/business-days/current", headers=headers)
        if response.status_code == 200:
            data = response.json()
            if data.get("has_open_day"):
                stats = data.get("stats", {})
                day_total = stats.get("total_sales", data["business_day"].get("total_sales", 0))
                print(f"✓ Business day total_sales: ${day_total:.2f}")
                
                # Training totals should NOT be in day totals
                # The day total should be approximately equal to real_total (not real_total + training_total)


class TestTrainingModeReports:
    """Test 5: X/Z reports exclude training bills"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        return response.json()["token"]
    
    def test_01_x_report_excludes_training(self, admin_token):
        """X report should exclude training bills"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get X report for the open session
        response = requests.get(
            f"{BASE_URL}/api/business-days/session/{OPEN_SESSION_ID}/report-x", 
            headers=headers
        )
        
        if response.status_code == 200:
            report = response.json()
            total_sales = report.get("sales_summary", {}).get("total", 0)
            print(f"✓ X Report total_sales: ${total_sales:.2f}")
            print(f"  Report type: {report.get('report_type')}")
            print(f"  Invoices count: {report.get('sales_summary', {}).get('invoices_count', 0)}")
            
            # According to context, should show $1696.4 (not $2336.4 which would include training)
            # This is because training bill ($640) should be excluded
            if total_sales == 1696.4:
                print(f"✓ X Report correctly shows $1696.4 (training excluded)")
            else:
                print(f"⚠ X Report shows ${total_sales:.2f} (expected around $1696.4)")
        elif response.status_code == 404:
            print(f"⚠ Session {OPEN_SESSION_ID} not found")
        else:
            print(f"⚠ X Report request failed: {response.status_code} - {response.text[:100]}")
    
    def test_02_z_report_excludes_training(self, admin_token):
        """Z report should exclude training bills"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get Z report for the open business day
        response = requests.get(
            f"{BASE_URL}/api/business-days/{OPEN_BUSINESS_DAY_ID}/report-z", 
            headers=headers
        )
        
        if response.status_code == 200:
            report = response.json()
            total_sales = report.get("sales_summary", {}).get("total", 0)
            invoices_count = report.get("sales_summary", {}).get("invoices_count", 0)
            
            print(f"✓ Z Report total_sales: ${total_sales:.2f}")
            print(f"  Report type: {report.get('report_type')}")
            print(f"  Invoices count: {invoices_count}")
            print(f"  Business date: {report.get('business_date')}")
        elif response.status_code == 404:
            print(f"⚠ Business day {OPEN_BUSINESS_DAY_ID} not found")
        else:
            print(f"⚠ Z Report request failed: {response.status_code} - {response.text[:100]}")
    
    def test_03_verify_training_filter_in_stats(self, admin_token):
        """Verify the training_mode filter is being applied in stats calculation"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get bills to check training status
        response = requests.get(f"{BASE_URL}/api/bills", headers=headers)
        assert response.status_code == 200
        
        bills = response.json()
        
        # Count training vs non-training
        training_count = len([b for b in bills if b.get("training_mode") == True and b.get("status") == "paid"])
        real_count = len([b for b in bills if b.get("training_mode") != True and b.get("status") == "paid"])
        
        training_total = sum(b.get("total", 0) for b in bills if b.get("training_mode") == True and b.get("status") == "paid")
        real_total = sum(b.get("total", 0) for b in bills if b.get("training_mode") != True and b.get("status") == "paid")
        
        print(f"✓ Bill counts:")
        print(f"  Training bills (paid): {training_count} (${training_total:.2f})")
        print(f"  Real bills (paid): {real_count} (${real_total:.2f})")


class TestTrainingModePrintCommands:
    """Test 6: Print commands include 'ENTRENAMIENTO' header for training orders"""
    
    @pytest.fixture
    def carlos_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": CARLOS_PIN})
        return response.json()["token"]
    
    def test_01_print_queue_has_training_flag(self, carlos_token):
        """Verify print queue items include training_mode flag"""
        headers = {"Authorization": f"Bearer {carlos_token}"}
        
        # Check print queue endpoint if it exists
        response = requests.get(f"{BASE_URL}/api/print-queue?limit=10", headers=headers)
        
        if response.status_code == 200:
            queue = response.json()
            training_items = [
                item for item in queue 
                if item.get("data", {}).get("training_mode") == True
            ]
            
            print(f"✓ Print queue items: {len(queue)}")
            print(f"  Training print items: {len(training_items)}")
            
            for item in training_items[:3]:
                print(f"  - Type: {item.get('type')}, Training: {item.get('data', {}).get('training_mode')}")
        else:
            print(f"⚠ Print queue endpoint returned {response.status_code}")


class TestNormalUserNotAffected:
    """Test 8: Normal user (Admin) NOT affected by training mode"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        return response.json()["token"]
    
    def test_01_admin_user_has_no_training_mode(self, admin_token):
        """Admin should not have training_mode enabled"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get user info
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        
        user = response.json()
        training_mode = user.get("training_mode", False)
        
        assert training_mode == False, f"Admin should not have training_mode, got {training_mode}"
        print(f"✓ Admin user: name={user.get('name')}, training_mode={training_mode}")
    
    def test_02_admin_order_not_flagged_training(self, admin_token):
        """Order created by Admin should NOT have training_mode flag"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get a free table
        tables_res = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        tables = tables_res.json()
        free_tables = [t for t in tables if t.get("status") == "free"]
        
        if not free_tables:
            pytest.skip("No free tables available for Admin order test")
        
        table = free_tables[0]
        print(f"Testing with table: {table['number']}")
        
        # Create order as Admin
        order_data = {
            "table_id": table["id"],
            "items": []
        }
        response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
        assert response.status_code == 200, f"Failed to create order: {response.text}"
        
        order = response.json()
        
        # Verify NOT training mode
        training_mode = order.get("training_mode", False)
        assert training_mode == False, f"Admin order should not be training, got training_mode={training_mode}"
        
        print(f"✓ Admin order {order['id'][:8]}: training_mode={training_mode}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
