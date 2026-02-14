"""
Test Suite for Phase 2 Backend Refactoring
Tests that migrated endpoints in inventory.py, recipes.py, and purchasing.py work correctly.
Focus: Ingredients, Stock, Warehouses, Unit Definitions, Recipes, Suppliers, Purchase Orders, Shopping Suggestions
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPhase2RefactoringIngredients:
    """Test Ingredients endpoints migrated to inventory.py router"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_list_ingredients(self):
        """GET /api/ingredients - List all ingredients"""
        response = self.session.get(f"{BASE_URL}/api/ingredients")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"SUCCESS: GET /api/ingredients returned {len(data)} ingredients")
    
    def test_create_ingredient(self):
        """POST /api/ingredients - Create ingredient"""
        payload = {
            "name": "TEST_Phase2_Ingredient",
            "unit": "lb",
            "category": "carnes",
            "min_stock": 10,
            "avg_cost": 150.0,
            "purchase_unit": "lb",
            "purchase_quantity": 1,
            "dispatch_quantity": 16,
            "conversion_factor": 16
        }
        response = self.session.post(f"{BASE_URL}/api/ingredients", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data, "Response should contain id"
        assert data["name"] == "TEST_Phase2_Ingredient"
        assert data["conversion_factor"] == 16
        print(f"SUCCESS: POST /api/ingredients created ingredient with id={data['id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/ingredients/{data['id']}")
    
    def test_get_ingredient_by_id(self):
        """GET /api/ingredients/{id} - Get single ingredient"""
        # Create first
        create_res = self.session.post(f"{BASE_URL}/api/ingredients", json={
            "name": "TEST_Phase2_GetById",
            "unit": "unidad",
            "category": "general",
            "min_stock": 5,
            "avg_cost": 25.0
        })
        assert create_res.status_code == 200
        ing_id = create_res.json()["id"]
        
        # Get by id
        response = self.session.get(f"{BASE_URL}/api/ingredients/{ing_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["id"] == ing_id
        assert data["name"] == "TEST_Phase2_GetById"
        print(f"SUCCESS: GET /api/ingredients/{ing_id} returned correct ingredient")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/ingredients/{ing_id}")
    
    def test_get_ingredient_not_found(self):
        """GET /api/ingredients/{id} - Returns 404 for invalid id"""
        response = self.session.get(f"{BASE_URL}/api/ingredients/invalid-id-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: GET /api/ingredients/{invalid_id} returns 404")


class TestPhase2RefactoringWarehouses:
    """Test Warehouses endpoints migrated to inventory.py router"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_list_warehouses(self):
        """GET /api/warehouses - List warehouses"""
        response = self.session.get(f"{BASE_URL}/api/warehouses")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/warehouses returned {len(data)} warehouses")
    
    def test_create_warehouse(self):
        """POST /api/warehouses - Create warehouse"""
        payload = {
            "name": "TEST_Phase2_Warehouse",
            "location": "Test Location"
        }
        response = self.session.post(f"{BASE_URL}/api/warehouses", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["name"] == "TEST_Phase2_Warehouse"
        print(f"SUCCESS: POST /api/warehouses created warehouse id={data['id']}")
        
        # Cleanup
        self.session.delete(f"{BASE_URL}/api/warehouses/{data['id']}")


class TestPhase2RefactoringStock:
    """Test Stock endpoints migrated to inventory.py router"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_get_multilevel_stock(self):
        """GET /api/stock/multilevel - Multi-level stock view"""
        response = self.session.get(f"{BASE_URL}/api/stock/multilevel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        # Check stock items have required multi-level fields
        if len(data) > 0:
            item = data[0]
            required_fields = [
                "ingredient_id", "ingredient_name", "warehouse_id", "warehouse_name",
                "current_stock", "dispatch_unit", "purchase_unit", "conversion_factor",
                "stock_detailed", "stock_in_purchase_units", "stock_remainder_dispatch"
            ]
            for field in required_fields:
                assert field in item, f"Missing field: {field}"
            print(f"SUCCESS: GET /api/stock/multilevel returned {len(data)} stock items with all required fields")
        else:
            print("INFO: No stock data available")
    
    def test_stock_transfer(self):
        """POST /api/stock/transfer - Stock transfer between warehouses"""
        # Get warehouses
        wh_res = self.session.get(f"{BASE_URL}/api/warehouses")
        warehouses = wh_res.json() if wh_res.status_code == 200 else []
        
        if len(warehouses) < 2:
            pytest.skip("Need at least 2 warehouses for transfer test")
        
        # Get ingredients
        ing_res = self.session.get(f"{BASE_URL}/api/ingredients")
        ingredients = ing_res.json() if ing_res.status_code == 200 else []
        
        if len(ingredients) == 0:
            pytest.skip("Need ingredients for transfer test")
        
        ingredient = ingredients[0]
        from_wh = warehouses[0]
        to_wh = warehouses[1]
        
        # First ensure source has stock
        self.session.post(f"{BASE_URL}/api/stock", json={
            "ingredient_id": ingredient["id"],
            "warehouse_id": from_wh["id"],
            "current_stock": 100,
            "min_stock": 5
        })
        
        # Transfer stock
        transfer_payload = {
            "ingredient_id": ingredient["id"],
            "from_warehouse_id": from_wh["id"],
            "to_warehouse_id": to_wh["id"],
            "quantity": 10,
            "notes": "TEST_Phase2 transfer"
        }
        response = self.session.post(f"{BASE_URL}/api/stock/transfer", json=transfer_payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True
        assert "transfer_id" in data
        print(f"SUCCESS: POST /api/stock/transfer completed with transfer_id={data['transfer_id']}")


class TestPhase2RefactoringStockMovements:
    """Test Stock Movements endpoints migrated to inventory.py router"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_list_stock_movements(self):
        """GET /api/stock-movements - List movements"""
        response = self.session.get(f"{BASE_URL}/api/stock-movements")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/stock-movements returned {len(data)} movements")


class TestPhase2RefactoringRecipes:
    """Test Recipes endpoints migrated to recipes.py router"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_list_recipes(self):
        """GET /api/recipes - List recipes"""
        response = self.session.get(f"{BASE_URL}/api/recipes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/recipes returned {len(data)} recipes")
    
    def test_create_recipe(self):
        """POST /api/recipes - Create recipe"""
        # Get a product
        products_res = self.session.get(f"{BASE_URL}/api/products")
        products = products_res.json() if products_res.status_code == 200 else []
        
        # Get ingredients
        ing_res = self.session.get(f"{BASE_URL}/api/ingredients")
        ingredients = ing_res.json() if ing_res.status_code == 200 else []
        
        if len(products) == 0 or len(ingredients) == 0:
            pytest.skip("Need products and ingredients for recipe test")
        
        product = products[0]
        ingredient = ingredients[0]
        
        payload = {
            "product_id": product["id"],
            "product_name": f"TEST_Phase2_{product['name']}",
            "ingredients": [
                {
                    "ingredient_id": ingredient["id"],
                    "ingredient_name": ingredient["name"],
                    "quantity": 0.5,
                    "unit": ingredient.get("unit", "unidad"),
                    "waste_percentage": 5
                }
            ],
            "yield_quantity": 1,
            "notes": "TEST_Phase2 recipe"
        }
        response = self.session.post(f"{BASE_URL}/api/recipes", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "id" in data or "product_id" in data
        print(f"SUCCESS: POST /api/recipes created recipe for product {product['name']}")
        
        # Cleanup
        if "id" in data:
            self.session.delete(f"{BASE_URL}/api/recipes/{data['id']}")
    
    def test_get_recipe_by_product(self):
        """GET /api/recipes/product/{product_id} - Get recipe by product"""
        # Get products
        products_res = self.session.get(f"{BASE_URL}/api/products")
        products = products_res.json() if products_res.status_code == 200 else []
        
        if len(products) == 0:
            pytest.skip("Need products for recipe test")
        
        product = products[0]
        response = self.session.get(f"{BASE_URL}/api/recipes/product/{product['id']}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        # May return empty object if no recipe exists
        print(f"SUCCESS: GET /api/recipes/product/{product['id']} works correctly")


class TestPhase2RefactoringSuppliers:
    """Test Suppliers endpoints in purchasing.py router"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_list_suppliers(self):
        """GET /api/suppliers - List suppliers"""
        response = self.session.get(f"{BASE_URL}/api/suppliers")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/suppliers returned {len(data)} suppliers")


class TestPhase2RefactoringPurchaseOrders:
    """Test Purchase Orders endpoints in purchasing.py router"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_list_purchase_orders(self):
        """GET /api/purchase-orders - List POs"""
        response = self.session.get(f"{BASE_URL}/api/purchase-orders")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/purchase-orders returned {len(data)} POs")


class TestPhase2RefactoringPurchasingSuggestions:
    """Test Shopping Suggestions endpoint in purchasing.py router"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_get_purchasing_suggestions(self):
        """GET /api/purchasing/suggestions - Shopping suggestions"""
        response = self.session.get(f"{BASE_URL}/api/purchasing/suggestions")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "suggestions" in data
        assert "summary" in data
        
        summary = data["summary"]
        assert "total_items" in summary
        assert "low_stock_items" in summary
        assert "out_of_stock_items" in summary
        assert "estimated_total" in summary
        
        print(f"SUCCESS: GET /api/purchasing/suggestions - {summary['total_items']} items, {summary['low_stock_items']} low stock")


class TestPhase2RefactoringUnitDefinitions:
    """Test Unit Definitions endpoints in inventory.py router"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_list_unit_definitions(self):
        """GET /api/unit-definitions - Unit definitions list"""
        response = self.session.get(f"{BASE_URL}/api/unit-definitions")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/unit-definitions returned {len(data)} units")


class TestPhase2RefactoringSubrecipes:
    """Test Subrecipes endpoint in inventory.py router"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_list_subrecipes(self):
        """GET /api/inventory/subrecipes - List subrecipes"""
        response = self.session.get(f"{BASE_URL}/api/inventory/subrecipes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/inventory/subrecipes returned {len(data)} subrecipes")


class TestPhase2CoreEndpointsStillWorking:
    """Test that core endpoints in server.py still work after refactoring"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_list_customers(self):
        """GET /api/customers - List customers (core endpoint still working)"""
        response = self.session.get(f"{BASE_URL}/api/customers")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/customers returned {len(data)} customers")
    
    def test_list_products(self):
        """GET /api/products - List products (core endpoint still working)"""
        response = self.session.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/products returned {len(data)} products")
    
    def test_list_areas(self):
        """GET /api/areas - List areas (core endpoint still working)"""
        response = self.session.get(f"{BASE_URL}/api/areas")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/areas returned {len(data)} areas")
    
    def test_list_tables(self):
        """GET /api/tables - List tables (core endpoint still working)"""
        response = self.session.get(f"{BASE_URL}/api/tables")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/tables returned {len(data)} tables")
    
    def test_list_categories(self):
        """GET /api/categories - List categories (core endpoint still working)"""
        response = self.session.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/categories returned {len(data)} categories")
    
    def test_list_users(self):
        """GET /api/users - List users (core endpoint still working)"""
        response = self.session.get(f"{BASE_URL}/api/users")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: GET /api/users returned {len(data)} users")


class TestPhase2Cleanup:
    """Cleanup test data created during testing"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Could not authenticate")
        yield
    
    def test_cleanup_test_data(self):
        """Clean up TEST_Phase2 prefixed data"""
        cleaned = {"ingredients": 0, "warehouses": 0, "recipes": 0}
        
        # Clean ingredients
        ing_res = self.session.get(f"{BASE_URL}/api/ingredients")
        if ing_res.status_code == 200:
            for ing in ing_res.json():
                if "TEST_Phase2" in ing.get("name", ""):
                    self.session.delete(f"{BASE_URL}/api/ingredients/{ing['id']}")
                    cleaned["ingredients"] += 1
        
        # Clean warehouses
        wh_res = self.session.get(f"{BASE_URL}/api/warehouses")
        if wh_res.status_code == 200:
            for wh in wh_res.json():
                if "TEST_Phase2" in wh.get("name", ""):
                    self.session.delete(f"{BASE_URL}/api/warehouses/{wh['id']}")
                    cleaned["warehouses"] += 1
        
        # Clean recipes
        rec_res = self.session.get(f"{BASE_URL}/api/recipes")
        if rec_res.status_code == 200:
            for rec in rec_res.json():
                if "TEST_Phase2" in (rec.get("product_name", "") or rec.get("notes", "")):
                    self.session.delete(f"{BASE_URL}/api/recipes/{rec['id']}")
                    cleaned["recipes"] += 1
        
        print(f"Cleaned up: {cleaned}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
