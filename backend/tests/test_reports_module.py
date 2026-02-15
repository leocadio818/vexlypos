"""
Test Suite for Reports Module
Tests all report endpoints for the POS restaurant system
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://print-agent-verify.preview.emergentagent.com').rstrip('/')


class TestReportsSparklines:
    """Tests for daily sparklines endpoint"""
    
    def test_daily_sparklines_default(self):
        """GET /api/reports/daily-sparklines returns 7 days by default"""
        response = requests.get(f"{BASE_URL}/api/reports/daily-sparklines")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 7
        for item in data:
            assert "date" in item
            assert "day_name" in item
            assert "total" in item
            assert "bills" in item
            assert isinstance(item["total"], (int, float))
    
    def test_daily_sparklines_custom_days(self):
        """GET /api/reports/daily-sparklines?days=14 returns 14 days"""
        response = requests.get(f"{BASE_URL}/api/reports/daily-sparklines?days=14")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 14


class TestDailySalesReport:
    """Tests for daily sales (Cierre del Día) report"""
    
    def test_daily_sales_report(self):
        """GET /api/reports/daily-sales returns daily sales summary"""
        response = requests.get(f"{BASE_URL}/api/reports/daily-sales?date=2026-02-13")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "date" in data
        assert "total_bills" in data
        assert "total_sales" in data
        assert "total_itbis" in data
        assert "total_tips" in data
        assert "cash_sales" in data
        assert isinstance(data["total_sales"], (int, float))
        assert isinstance(data["total_bills"], int)
    
    def test_daily_sales_today(self):
        """GET /api/reports/daily-sales without date uses today"""
        response = requests.get(f"{BASE_URL}/api/reports/daily-sales")
        assert response.status_code == 200
        data = response.json()
        assert "total_sales" in data


class TestTopProductsReport:
    """Tests for Top Products report with selector"""
    
    def test_top_products_default(self):
        """GET /api/reports/top-products-extended returns top 10 by default"""
        response = requests.get(f"{BASE_URL}/api/reports/top-products-extended?date_from=2026-02-01&date_to=2026-02-15")
        assert response.status_code == 200
        data = response.json()
        
        assert "date_from" in data
        assert "date_to" in data
        assert "limit" in data
        assert "products" in data
        assert data["limit"] == 10
        
        # Verify product structure with sparklines
        if data["products"]:
            product = data["products"][0]
            assert "name" in product
            assert "quantity" in product
            assert "total" in product
            assert "sparkline" in product
            assert isinstance(product["sparkline"], list)
    
    def test_top_products_limit_20(self):
        """GET /api/reports/top-products-extended?limit=20 returns 20 products"""
        response = requests.get(f"{BASE_URL}/api/reports/top-products-extended?date_from=2026-02-01&date_to=2026-02-15&limit=20")
        assert response.status_code == 200
        data = response.json()
        assert data["limit"] == 20
        assert len(data["products"]) <= 20
    
    def test_top_products_limit_30(self):
        """GET /api/reports/top-products-extended?limit=30 returns 30 products"""
        response = requests.get(f"{BASE_URL}/api/reports/top-products-extended?date_from=2026-02-01&date_to=2026-02-15&limit=30")
        assert response.status_code == 200
        data = response.json()
        assert data["limit"] == 30


class TestVoidAuditReport:
    """Tests for Void/Cancellation Audit report"""
    
    def test_void_audit_report(self):
        """GET /api/reports/void-audit returns void audit data"""
        response = requests.get(f"{BASE_URL}/api/reports/void-audit?date_from=2026-02-01&date_to=2026-02-15")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "date_from" in data
        assert "date_to" in data
        assert "summary" in data
        assert "by_reason" in data
        assert "by_authorizer" in data
        
        # Verify summary fields
        summary = data["summary"]
        assert "total_count" in summary
        assert "total_voided" in summary
        assert "total_recovered" in summary
        assert "total_loss" in summary
        
        # Verify authorizer breakdown structure
        assert isinstance(data["by_authorizer"], list)
        assert isinstance(data["by_reason"], list)


class TestProfitLossReport:
    """Tests for Profit & Loss report"""
    
    def test_profit_loss_report(self):
        """GET /api/reports/profit-loss returns P&L data"""
        response = requests.get(f"{BASE_URL}/api/reports/profit-loss?date_from=2026-02-01&date_to=2026-02-15")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure - income panel
        assert "revenue" in data
        revenue = data["revenue"]
        assert "gross_sales" in revenue
        assert "tips_collected" in revenue
        assert "tax_collected" in revenue
        assert "net_revenue" in revenue
        
        # Verify structure - costs panel
        assert "costs" in data
        costs = data["costs"]
        assert "cost_of_goods_sold" in costs
        assert "purchases" in costs
        assert "waste_loss" in costs
        
        # Verify profit section
        assert "profit" in data
        profit = data["profit"]
        assert "gross_profit" in profit
        assert "gross_margin_pct" in profit
        
        assert "bills_count" in data


class TestTaxesReport:
    """Tests for Taxes (ITBIS + Propina) report"""
    
    def test_taxes_report(self):
        """GET /api/reports/taxes returns tax collection data"""
        response = requests.get(f"{BASE_URL}/api/reports/taxes?date_from=2026-02-01&date_to=2026-02-15")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "date_from" in data
        assert "date_to" in data
        assert "summary" in data
        assert "daily" in data
        
        # Verify summary
        summary = data["summary"]
        assert "total_subtotal" in summary
        assert "total_itbis" in summary
        assert "total_tips" in summary
        assert "total_sales" in summary
        assert summary["itbis_rate"] == 18.0
        assert summary["tip_rate"] == 10.0
        
        # Verify daily breakdown structure
        assert isinstance(data["daily"], list)
        if data["daily"]:
            day = data["daily"][0]
            assert "date" in day
            assert "subtotal" in day
            assert "itbis" in day
            assert "tips" in day
            assert "total" in day


class TestCashCloseReport:
    """Tests for Cash Close report"""
    
    def test_cash_close_report(self):
        """GET /api/reports/cash-close returns cash close data"""
        response = requests.get(f"{BASE_URL}/api/reports/cash-close?date=2026-02-13")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "date" in data
        assert "summary" in data
        assert "by_payment_method" in data
        
        # Verify summary
        summary = data["summary"]
        assert "total_bills" in summary
        assert "total_sales" in summary
        assert "cash_total" in summary
        assert "card_total" in summary


class TestSalesByTypeReport:
    """Tests for Sales by Type report"""
    
    def test_sales_by_type(self):
        """GET /api/reports/sales-by-type returns sales by type"""
        response = requests.get(f"{BASE_URL}/api/reports/sales-by-type?date_from=2026-02-01&date_to=2026-02-15")
        assert response.status_code == 200
        data = response.json()
        
        assert "date_from" in data
        assert "date_to" in data
        assert "types" in data
        assert isinstance(data["types"], list)
        
        if data["types"]:
            sale_type = data["types"][0]
            assert "name" in sale_type
            assert "count" in sale_type
            assert "total" in sale_type


class TestPaymentMethodsReport:
    """Tests for Payment Methods breakdown report"""
    
    def test_payment_methods_breakdown(self):
        """GET /api/reports/payment-methods-breakdown returns payment methods data"""
        response = requests.get(f"{BASE_URL}/api/reports/payment-methods-breakdown?date_from=2026-02-01&date_to=2026-02-15")
        assert response.status_code == 200
        data = response.json()
        
        assert "date_from" in data
        assert "date_to" in data
        assert "methods" in data
        assert "total" in data
        
        if data["methods"]:
            method = data["methods"][0]
            assert "name" in method
            assert "count" in method
            assert "total" in method
            assert "sparkline" in method
            assert "percentage" in method


class TestInventoryReports:
    """Tests for Inventory-related reports"""
    
    def test_inventory_by_warehouse(self):
        """GET /api/reports/inventory-by-warehouse returns warehouse inventory"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory-by-warehouse")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        if data:
            warehouse = data[0]
            assert "warehouse_name" in warehouse
            assert "items" in warehouse
            assert "total_value" in warehouse
            assert "low_stock_count" in warehouse
    
    def test_transfers_report(self):
        """GET /api/reports/transfers returns transfer history"""
        response = requests.get(f"{BASE_URL}/api/reports/transfers")
        assert response.status_code == 200
        data = response.json()
        
        assert "date_from" in data
        assert "date_to" in data
        assert "transfers" in data
    
    def test_waste_report(self):
        """GET /api/reports/waste-report returns waste data"""
        response = requests.get(f"{BASE_URL}/api/reports/waste-report")
        assert response.status_code == 200
        data = response.json()
        
        assert "summary" in data
        assert "by_ingredient" in data
        assert "by_reason" in data


class TestPurchasingReports:
    """Tests for Purchasing-related reports"""
    
    def test_purchase_orders_report(self):
        """GET /api/reports/purchase-orders returns PO summary"""
        response = requests.get(f"{BASE_URL}/api/reports/purchase-orders")
        assert response.status_code == 200
        data = response.json()
        
        assert "summary" in data
        assert "by_supplier" in data
        assert "by_status" in data
    
    def test_by_supplier_report(self):
        """GET /api/reports/by-supplier returns spending by supplier"""
        response = requests.get(f"{BASE_URL}/api/reports/by-supplier")
        assert response.status_code == 200
        data = response.json()
        
        assert "total" in data
        assert "suppliers" in data


class TestHourlySalesReport:
    """Tests for Hourly Sales report"""
    
    def test_hourly_sales(self):
        """GET /api/reports/hourly-sales returns hourly breakdown"""
        response = requests.get(f"{BASE_URL}/api/reports/hourly-sales?date_from=2026-02-13&date_to=2026-02-13")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) == 24  # 24 hours
        
        if data:
            hour = data[0]
            assert "hour" in hour
            assert "total" in hour
            assert "bills" in hour


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
