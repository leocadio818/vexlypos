"""
Test suite for new reports endpoints (daily-sales, sales-by-category, sales-by-waiter) 
and system-reset endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def admin_token():
    """Get admin token (PIN: 10000, level 100)"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Admin authentication failed - skipping tests")

@pytest.fixture(scope="module")
def waiter_token():
    """Get waiter token (PIN: 1234, level 20)"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1234"})
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Waiter authentication failed - skipping tests")


class TestDailySalesReport:
    """Tests for GET /api/reports/daily-sales endpoint"""
    
    def test_daily_sales_returns_200(self, admin_token):
        """GET /api/reports/daily-sales returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily-sales",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Daily sales endpoint returns 200")
    
    def test_daily_sales_has_required_fields(self, admin_token):
        """Response has total_sales, total_bills, cash_sales, card_sales"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily-sales",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        data = response.json()
        required_fields = ["total_sales", "total_bills", "cash_sales", "card_sales"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        print(f"PASS: Daily sales has all required fields: {required_fields}")
    
    def test_daily_sales_values_are_numeric(self, admin_token):
        """total_sales, cash_sales, card_sales are numeric"""
        response = requests.get(
            f"{BASE_URL}/api/reports/daily-sales",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        data = response.json()
        assert isinstance(data["total_sales"], (int, float)), "total_sales should be numeric"
        assert isinstance(data["cash_sales"], (int, float)), "cash_sales should be numeric"
        assert isinstance(data["card_sales"], (int, float)), "card_sales should be numeric"
        print(f"PASS: Daily sales values are numeric - total: {data['total_sales']}, cash: {data['cash_sales']}, card: {data['card_sales']}")


class TestSalesByCategoryReport:
    """Tests for GET /api/reports/sales-by-category endpoint"""
    
    def test_sales_by_category_returns_200(self, admin_token):
        """GET /api/reports/sales-by-category returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales-by-category",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Sales by category endpoint returns 200")
    
    def test_sales_by_category_returns_array(self, admin_token):
        """Response is an array of categories"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales-by-category",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        print(f"PASS: Sales by category returns array with {len(data)} categories")
    
    def test_sales_by_category_has_required_fields(self, admin_token):
        """Each category has total and quantity fields"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales-by-category",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        data = response.json()
        if len(data) > 0:
            first_cat = data[0]
            assert "category" in first_cat, "Missing 'category' field"
            assert "total" in first_cat, "Missing 'total' field"
            assert "quantity" in first_cat, "Missing 'quantity' field"
            print(f"PASS: First category has required fields - category: {first_cat['category']}, total: {first_cat['total']}, qty: {first_cat['quantity']}")
        else:
            print("SKIP: No category data to verify fields")


class TestSalesByWaiterReport:
    """Tests for GET /api/reports/sales-by-waiter endpoint"""
    
    def test_sales_by_waiter_returns_200(self, admin_token):
        """GET /api/reports/sales-by-waiter returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales-by-waiter",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Sales by waiter endpoint returns 200")
    
    def test_sales_by_waiter_returns_array(self, admin_token):
        """Response is an array of waiters"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales-by-waiter",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        data = response.json()
        assert isinstance(data, list), "Response should be an array"
        print(f"PASS: Sales by waiter returns array with {len(data)} waiters")
    
    def test_sales_by_waiter_has_required_fields(self, admin_token):
        """Each waiter has name, total, bills, tips fields"""
        response = requests.get(
            f"{BASE_URL}/api/reports/sales-by-waiter",
            params={"date_from": "2025-01-01", "date_to": "2026-12-31"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        data = response.json()
        if len(data) > 0:
            first_waiter = data[0]
            assert "name" in first_waiter, "Missing 'name' field"
            assert "total" in first_waiter, "Missing 'total' field"
            assert "bills" in first_waiter, "Missing 'bills' field"
            assert "tips" in first_waiter, "Missing 'tips' field"
            print(f"PASS: First waiter has required fields - name: {first_waiter['name']}, total: {first_waiter['total']}, bills: {first_waiter['bills']}, tips: {first_waiter['tips']}")
        else:
            print("SKIP: No waiter data to verify fields")


class TestSystemReset:
    """Tests for POST /api/system-reset endpoint"""
    
    def test_system_reset_requires_correct_confirm(self, admin_token):
        """system-reset requires confirm='RESETEAR_SISTEMA'"""
        response = requests.post(
            f"{BASE_URL}/api/system-reset",
            json={"confirm": "WRONG_TEXT", "keep_user_ids": ["some-id"]},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "RESETEAR_SISTEMA" in data.get("detail", ""), "Error should mention required text"
        print("PASS: System reset correctly rejects wrong confirmation text")
    
    def test_system_reset_blocked_for_non_admin(self, waiter_token):
        """system-reset blocked for non-admin (level < 100)"""
        response = requests.post(
            f"{BASE_URL}/api/system-reset",
            json={"confirm": "RESETEAR_SISTEMA", "keep_user_ids": ["some-id"]},
            headers={"Authorization": f"Bearer {waiter_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        data = response.json()
        assert "Administrador" in data.get("detail", "") or "Sistema" in data.get("detail", ""), "Error should mention admin requirement"
        print("PASS: System reset correctly blocks non-admin users")
    
    def test_system_reset_requires_keep_user_ids(self, admin_token):
        """system-reset requires keep_user_ids array"""
        response = requests.post(
            f"{BASE_URL}/api/system-reset",
            json={"confirm": "RESETEAR_SISTEMA", "keep_user_ids": []},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: System reset correctly requires at least one user to keep")


class TestInventoryValuationReport:
    """Tests for GET /api/reports/inventory-valuation (Recetas report)"""
    
    def test_inventory_valuation_returns_200(self, admin_token):
        """GET /api/reports/inventory-valuation returns 200"""
        response = requests.get(
            f"{BASE_URL}/api/reports/inventory-valuation",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Inventory valuation (Recetas) endpoint returns 200")
    
    def test_inventory_valuation_has_structure(self, admin_token):
        """Response has total_value, by_category, items"""
        response = requests.get(
            f"{BASE_URL}/api/reports/inventory-valuation",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        data = response.json()
        assert "total_value" in data, "Missing 'total_value' field"
        assert "by_category" in data, "Missing 'by_category' field"
        assert "items" in data, "Missing 'items' field"
        print(f"PASS: Inventory valuation has required structure - total_value: {data['total_value']}")
