"""
Full System Audit Test Suite - MESA POS RD
Tests ALL core API endpoints for status codes and JSON validity.
Does NOT test _id leak (MongoDB ObjectID should be excluded).
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://inventory-fix-51.preview.emergentagent.com')

class TestSystemAuditCore:
    """Core API endpoint tests for full system audit"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with auth token"""
        self.session = requests.Session()
        # Login with admin PIN 10000
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
        self.session.close()

    # ─── KNOWN BUGS TO TEST ───
    def test_known_bug_theme_config_404(self):
        """KNOWN BUG: GET /api/theme-config returns 404 - Frontend calls this but backend has /api/theme"""
        response = self.session.get(f"{BASE_URL}/api/theme-config")
        # This SHOULD be 200 but is 404 - documenting the bug
        assert response.status_code == 404, "Bug may be fixed - /api/theme-config returning something other than 404"
        print(f"✓ BUG CONFIRMED: GET /api/theme-config returns 404 (expected behavior currently)")
    
    def test_known_bug_inventory_products_stock_404(self):
        """KNOWN BUG: GET /api/inventory/products-stock returns 404 - OrderScreen.js calls this"""
        response = self.session.get(f"{BASE_URL}/api/inventory/products-stock")
        # This SHOULD be 200 but is 404 - documenting the bug
        assert response.status_code == 404, "Bug may be fixed - /api/inventory/products-stock returning something other than 404"
        print(f"✓ BUG CONFIRMED: GET /api/inventory/products-stock returns 404 (expected behavior currently)")
    
    # ─── WORKING THEME ENDPOINT ───
    def test_theme_endpoint_works(self):
        """GET /api/theme returns valid JSON (the WORKING endpoint)"""
        response = self.session.get(f"{BASE_URL}/api/theme")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ GET /api/theme - PASSED")
    
    # ─── ORDERS ───
    def test_orders_list(self):
        """GET /api/orders returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/orders")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/orders - PASSED ({len(data)} orders)")
    
    # ─── TABLES ───
    def test_tables_list(self):
        """GET /api/tables returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/tables")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/tables - PASSED ({len(data)} tables)")
    
    # ─── PRODUCTS ───
    def test_products_list(self):
        """GET /api/products returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/products - PASSED ({len(data)} products)")
    
    # ─── BILLS ───
    def test_bills_list(self):
        """GET /api/bills returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/bills")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/bills - PASSED ({len(data)} bills)")
    
    # ─── CUSTOMERS ───
    def test_customers_list(self):
        """GET /api/customers returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/customers")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/customers - PASSED ({len(data)} customers)")
    
    # ─── INGREDIENTS ───
    def test_ingredients_list(self):
        """GET /api/ingredients returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/ingredients")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/ingredients - PASSED ({len(data)} ingredients)")
    
    # ─── RECIPES ───
    def test_recipes_list(self):
        """GET /api/recipes returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/recipes - PASSED ({len(data)} recipes)")
    
    # ─── USERS ───
    def test_users_list(self):
        """GET /api/users returns valid JSON array (with auth)"""
        response = self.session.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/users - PASSED ({len(data)} users)")
    
    # ─── ROLES ───
    def test_roles_list(self):
        """GET /api/roles returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/roles")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/roles - PASSED ({len(data)} roles)")
    
    # ─── CATEGORIES ───
    def test_categories_list(self):
        """GET /api/categories returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/categories - PASSED ({len(data)} categories)")
    
    # ─── AREAS ───
    def test_areas_list(self):
        """GET /api/areas returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/areas")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/areas - PASSED ({len(data)} areas)")
    
    # ─── WAREHOUSES ───
    def test_warehouses_list(self):
        """GET /api/warehouses returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/warehouses")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/warehouses - PASSED ({len(data)} warehouses)")
    
    # ─── SUPPLIERS ───
    def test_suppliers_list(self):
        """GET /api/suppliers returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/suppliers - PASSED ({len(data)} suppliers)")
    
    # ─── MODIFIERS ───
    def test_modifiers_list(self):
        """GET /api/modifiers returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/modifiers")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/modifiers - PASSED ({len(data)} modifiers)")
    
    # ─── CANCELLATION REASONS ───
    def test_cancellation_reasons_list(self):
        """GET /api/cancellation-reasons returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/cancellation-reasons")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/cancellation-reasons - PASSED ({len(data)} reasons)")
    
    # ─── TAX CONFIG ───
    def test_tax_config_list(self):
        """GET /api/tax-config returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/tax-config")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/tax-config - PASSED ({len(data)} taxes)")
    
    # ─── SALE TYPES ───
    def test_sale_types_list(self):
        """GET /api/sale-types returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/sale-types")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/sale-types - PASSED ({len(data)} sale types)")
    
    # ─── PAYMENT METHODS ───
    def test_payment_methods_list(self):
        """GET /api/payment-methods returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/payment-methods")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/payment-methods - PASSED ({len(data)} payment methods)")
    
    # ─── RESERVATIONS ───
    def test_reservations_list(self):
        """GET /api/reservations returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/reservations")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/reservations - PASSED ({len(data)} reservations)")
    
    # ─── SHIFTS ───
    def test_shifts_list(self):
        """GET /api/shifts returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/shifts")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/shifts - PASSED ({len(data)} shifts)")
    
    # ─── KITCHEN ORDERS ───
    def test_kitchen_orders(self):
        """GET /api/kitchen/orders returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/kitchen/orders")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/kitchen/orders - PASSED ({len(data)} kitchen orders)")
    
    # ─── INVENTORY SETTINGS ───
    def test_inventory_settings(self):
        """GET /api/inventory/settings returns valid JSON"""
        response = self.session.get(f"{BASE_URL}/api/inventory/settings")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ GET /api/inventory/settings - PASSED")
    
    # ─── STOCK ───
    def test_stock_list(self):
        """GET /api/stock returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/stock")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/stock - PASSED ({len(data)} stock entries)")
    
    # ─── STOCK MOVEMENTS ───
    def test_stock_movements_list(self):
        """GET /api/stock-movements returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/stock-movements")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/stock-movements - PASSED ({len(data)} movements)")
    
    # ─── PRINT CHANNELS ───
    def test_print_channels_list(self):
        """GET /api/print-channels returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/print-channels")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/print-channels - PASSED ({len(data)} channels)")
    
    # ─── NCF TYPES ───
    def test_ncf_types_list(self):
        """GET /api/ncf/types returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/ncf/types")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/ncf/types - PASSED ({len(data)} NCF types)")
    
    # ─── VOID AUDIT LOGS ───
    def test_void_audit_logs(self):
        """GET /api/void-audit-logs returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/void-audit-logs")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/void-audit-logs - PASSED ({len(data)} void logs)")
    
    # ─── PURCHASE ORDERS ───
    def test_purchase_orders_list(self):
        """GET /api/purchase-orders returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/purchase-orders")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/purchase-orders - PASSED ({len(data)} POs)")
    
    # ─── REPORT CATEGORIES ───
    def test_report_categories_list(self):
        """GET /api/report-categories returns valid JSON array"""
        response = self.session.get(f"{BASE_URL}/api/report-categories")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/report-categories - PASSED ({len(data)} report categories)")
    
    # ─── SYSTEM CONFIG ───
    def test_system_config(self):
        """GET /api/system/config returns valid JSON"""
        response = self.session.get(f"{BASE_URL}/api/system/config")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ GET /api/system/config - PASSED")
    
    # ─── PRINTER CONFIG ───
    def test_printer_config(self):
        """GET /api/printer-config returns valid JSON"""
        response = self.session.get(f"{BASE_URL}/api/printer-config")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ GET /api/printer-config - PASSED")
    
    # ─── STATION CONFIG ───
    def test_station_config(self):
        """GET /api/station-config returns valid JSON"""
        response = self.session.get(f"{BASE_URL}/api/station-config")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ GET /api/station-config - PASSED")
    
    # ─── INVENTORY REPORTS ───
    def test_inventory_valuation_report(self):
        """GET /api/reports/inventory-valuation returns valid JSON"""
        response = self.session.get(f"{BASE_URL}/api/reports/inventory-valuation")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ GET /api/reports/inventory-valuation - PASSED")
    
    # ─── BUSINESS DAYS CHECK ───
    def test_business_days_check(self):
        """GET /api/business-days/check returns valid JSON"""
        response = self.session.get(f"{BASE_URL}/api/business-days/check")
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, dict)
        print(f"✓ GET /api/business-days/check - PASSED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
