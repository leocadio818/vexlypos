"""
Test suite for Product Configuration Module
Tests: Products CRUD, Report Categories, Modifiers, and new product fields
(printed_name, report_category_id, price_a-e, button colors, modifier_assignments)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://factura-consumo-app.preview.emergentagent.com')

class TestProductConfigBackend:
    """Test Product Configuration Backend APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("token")
        self.headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    # ─── PRODUCTS API TESTS ───
    def test_list_products(self):
        """Test GET /api/products - List all products"""
        response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        assert response.status_code == 200, f"Failed to list products: {response.text}"
        products = response.json()
        assert isinstance(products, list), "Products should be a list"
        assert len(products) > 0, "Should have at least one product"
        print(f"✓ Listed {len(products)} products")
    
    def test_get_product_by_id(self):
        """Test GET /api/products/{id} - Get single product"""
        # First get a product ID
        list_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = list_response.json()
        product_id = products[0]["id"]
        
        # Get product by ID
        response = requests.get(f"{BASE_URL}/api/products/{product_id}", headers=self.headers)
        assert response.status_code == 200, f"Failed to get product: {response.text}"
        product = response.json()
        assert product["id"] == product_id, "Product ID should match"
        assert "name" in product, "Product should have name"
        assert "price" in product, "Product should have price"
        print(f"✓ Got product: {product['name']}")
    
    def test_create_product_with_new_fields(self):
        """Test POST /api/products - Create product with all new fields"""
        # Get category and report category IDs
        cat_response = requests.get(f"{BASE_URL}/api/categories", headers=self.headers)
        categories = cat_response.json()
        category_id = categories[0]["id"]
        
        report_cat_response = requests.get(f"{BASE_URL}/api/report-categories", headers=self.headers)
        report_categories = report_cat_response.json()
        report_category_id = report_categories[0]["id"] if report_categories else ""
        
        # Get modifier groups
        mod_response = requests.get(f"{BASE_URL}/api/modifiers", headers=self.headers)
        modifiers = mod_response.json()
        modifier_group_id = modifiers[0]["id"] if modifiers else ""
        
        # Create product with all new fields
        product_data = {
            "name": "TEST_Producto de Prueba",
            "printed_name": "TEST_PROD",
            "category_id": category_id,
            "report_category_id": report_category_id,
            "price": 299.99,
            "price_a": 299.99,
            "price_b": 279.99,
            "price_c": 259.99,
            "price_d": 239.99,
            "price_e": 219.99,
            "button_bg_color": "#FF6600",
            "button_text_color": "#FFFFFF",
            "track_inventory": True,
            "modifier_group_ids": [modifier_group_id] if modifier_group_id else [],
            "modifier_assignments": [
                {
                    "group_id": modifier_group_id,
                    "min_selections": 0,
                    "max_selections": 2,
                    "allow_multiple": True
                }
            ] if modifier_group_id else []
        }
        
        response = requests.post(f"{BASE_URL}/api/products", json=product_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to create product: {response.text}"
        
        created_product = response.json()
        assert created_product["name"] == product_data["name"], "Name should match"
        assert created_product["printed_name"] == product_data["printed_name"], "Printed name should match"
        assert created_product["price"] == product_data["price"], "Price should match"
        assert created_product["price_a"] == product_data["price_a"], "Price A should match"
        assert created_product["price_b"] == product_data["price_b"], "Price B should match"
        assert created_product["button_bg_color"] == product_data["button_bg_color"], "Button BG color should match"
        assert created_product["button_text_color"] == product_data["button_text_color"], "Button text color should match"
        
        self.test_product_id = created_product["id"]
        print(f"✓ Created product with ID: {self.test_product_id}")
        
        # Verify by GET
        get_response = requests.get(f"{BASE_URL}/api/products/{self.test_product_id}", headers=self.headers)
        assert get_response.status_code == 200, "Should be able to get created product"
        fetched = get_response.json()
        assert fetched["printed_name"] == product_data["printed_name"], "Printed name should persist"
        print(f"✓ Verified product persistence")
        
        return self.test_product_id
    
    def test_update_product_with_new_fields(self):
        """Test PUT /api/products/{id} - Update product with new fields"""
        # First create a product
        cat_response = requests.get(f"{BASE_URL}/api/categories", headers=self.headers)
        categories = cat_response.json()
        category_id = categories[0]["id"]
        
        create_data = {
            "name": "TEST_Update Product",
            "category_id": category_id,
            "price": 100
        }
        create_response = requests.post(f"{BASE_URL}/api/products", json=create_data, headers=self.headers)
        product_id = create_response.json()["id"]
        
        # Update with new fields
        update_data = {
            "name": "TEST_Updated Product Name",
            "printed_name": "UPD_PROD",
            "price_a": 150.00,
            "price_b": 140.00,
            "price_c": 130.00,
            "button_bg_color": "#4CAF50",
            "button_text_color": "#000000"
        }
        
        response = requests.put(f"{BASE_URL}/api/products/{product_id}", json=update_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to update product: {response.text}"
        
        # Verify update
        get_response = requests.get(f"{BASE_URL}/api/products/{product_id}", headers=self.headers)
        updated = get_response.json()
        assert updated["name"] == update_data["name"], "Name should be updated"
        assert updated["printed_name"] == update_data["printed_name"], "Printed name should be updated"
        assert updated["price_a"] == update_data["price_a"], "Price A should be updated"
        assert updated["button_bg_color"] == update_data["button_bg_color"], "Button BG color should be updated"
        print(f"✓ Updated product successfully")
    
    # ─── REPORT CATEGORIES API TESTS ───
    def test_list_report_categories(self):
        """Test GET /api/report-categories - List report categories"""
        response = requests.get(f"{BASE_URL}/api/report-categories", headers=self.headers)
        assert response.status_code == 200, f"Failed to list report categories: {response.text}"
        categories = response.json()
        assert isinstance(categories, list), "Should return a list"
        print(f"✓ Listed {len(categories)} report categories")
        
        # Verify structure
        if categories:
            cat = categories[0]
            assert "id" in cat, "Should have id"
            assert "name" in cat, "Should have name"
            assert "code" in cat, "Should have code"
    
    def test_create_report_category(self):
        """Test POST /api/report-categories - Create report category"""
        category_data = {
            "name": "TEST_Report Category",
            "code": "test_cat"
        }
        
        response = requests.post(f"{BASE_URL}/api/report-categories", json=category_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to create report category: {response.text}"
        
        created = response.json()
        assert created["name"] == category_data["name"], "Name should match"
        assert created["code"] == category_data["code"], "Code should match"
        print(f"✓ Created report category: {created['name']}")
    
    # ─── MODIFIERS API TESTS ───
    def test_list_modifiers(self):
        """Test GET /api/modifiers - List modifier groups"""
        response = requests.get(f"{BASE_URL}/api/modifiers", headers=self.headers)
        assert response.status_code == 200, f"Failed to list modifiers: {response.text}"
        modifiers = response.json()
        assert isinstance(modifiers, list), "Should return a list"
        print(f"✓ Listed {len(modifiers)} modifier groups")
        
        # Verify structure
        if modifiers:
            mod = modifiers[0]
            assert "id" in mod, "Should have id"
            assert "name" in mod, "Should have name"
            assert "options" in mod, "Should have options"
    
    def test_get_modifier_by_id(self):
        """Test GET /api/modifiers/{id} - Get single modifier"""
        list_response = requests.get(f"{BASE_URL}/api/modifiers", headers=self.headers)
        modifiers = list_response.json()
        
        if modifiers:
            modifier_id = modifiers[0]["id"]
            response = requests.get(f"{BASE_URL}/api/modifiers/{modifier_id}", headers=self.headers)
            assert response.status_code == 200, f"Failed to get modifier: {response.text}"
            modifier = response.json()
            assert modifier["id"] == modifier_id, "ID should match"
            print(f"✓ Got modifier: {modifier['name']}")
    
    def test_create_modifier_group(self):
        """Test POST /api/modifiers - Create modifier group"""
        modifier_data = {
            "name": "TEST_Modifier Group",
            "required": False,
            "max_selections": 3,
            "options": [
                {"name": "Option 1", "price": 0},
                {"name": "Option 2", "price": 25},
                {"name": "Option 3", "price": 50}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/modifiers", json=modifier_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to create modifier: {response.text}"
        
        created = response.json()
        assert created["name"] == modifier_data["name"], "Name should match"
        assert len(created["options"]) == 3, "Should have 3 options"
        print(f"✓ Created modifier group: {created['name']}")
    
    def test_update_modifier_group(self):
        """Test PUT /api/modifiers/{id} - Update modifier group"""
        # First create a modifier
        create_data = {
            "name": "TEST_Update Modifier",
            "required": False,
            "max_selections": 1,
            "options": [{"name": "Test Option", "price": 0}]
        }
        create_response = requests.post(f"{BASE_URL}/api/modifiers", json=create_data, headers=self.headers)
        modifier_id = create_response.json()["id"]
        
        # Update
        update_data = {
            "name": "TEST_Updated Modifier Name",
            "max_selections": 5
        }
        response = requests.put(f"{BASE_URL}/api/modifiers/{modifier_id}", json=update_data, headers=self.headers)
        assert response.status_code == 200, f"Failed to update modifier: {response.text}"
        
        # Verify
        get_response = requests.get(f"{BASE_URL}/api/modifiers/{modifier_id}", headers=self.headers)
        updated = get_response.json()
        assert updated["name"] == update_data["name"], "Name should be updated"
        assert updated["max_selections"] == update_data["max_selections"], "Max selections should be updated"
        print(f"✓ Updated modifier group successfully")
    
    # ─── CATEGORIES API TESTS ───
    def test_list_categories(self):
        """Test GET /api/categories - List menu categories"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=self.headers)
        assert response.status_code == 200, f"Failed to list categories: {response.text}"
        categories = response.json()
        assert isinstance(categories, list), "Should return a list"
        assert len(categories) > 0, "Should have at least one category"
        print(f"✓ Listed {len(categories)} menu categories")
    
    # ─── CLEANUP ───
    def test_cleanup_test_data(self):
        """Cleanup TEST_ prefixed data"""
        # Get all products and delete test ones
        products_response = requests.get(f"{BASE_URL}/api/products", headers=self.headers)
        products = products_response.json()
        
        for product in products:
            if product["name"].startswith("TEST_"):
                requests.put(f"{BASE_URL}/api/products/{product['id']}", 
                           json={"active": False}, headers=self.headers)
                print(f"  Deactivated test product: {product['name']}")
        
        # Get all modifiers and delete test ones
        modifiers_response = requests.get(f"{BASE_URL}/api/modifiers", headers=self.headers)
        modifiers = modifiers_response.json()
        
        for modifier in modifiers:
            if modifier["name"].startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/modifiers/{modifier['id']}", headers=self.headers)
                print(f"  Deleted test modifier: {modifier['name']}")
        
        # Get all report categories and delete test ones
        report_cats_response = requests.get(f"{BASE_URL}/api/report-categories", headers=self.headers)
        report_cats = report_cats_response.json()
        
        for cat in report_cats:
            if cat["name"].startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/report-categories/{cat['id']}", headers=self.headers)
                print(f"  Deleted test report category: {cat['name']}")
        
        print("✓ Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
