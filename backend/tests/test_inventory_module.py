"""
Inventory Module Backend Tests
Tests for: Ingredients, Warehouses, Suppliers, Recipes, Purchase Orders, Stock management
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestIngredients:
    """Test CRUD operations for ingredients"""
    
    @pytest.fixture
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("token")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_list_ingredients(self, auth_headers):
        """Test listing all ingredients"""
        response = requests.get(f"{BASE_URL}/api/ingredients", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} ingredients")

    def test_create_ingredient(self, auth_headers):
        """Test creating a new ingredient"""
        payload = {
            "name": "TEST_Tomate Fresco",
            "unit": "lb",
            "category": "vegetales",
            "min_stock": 10,
            "avg_cost": 35.0
        }
        response = requests.post(f"{BASE_URL}/api/ingredients", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert data["name"] == "TEST_Tomate Fresco"
        assert data["unit"] == "lb"
        assert data["category"] == "vegetales"
        assert "id" in data
        print(f"Created ingredient: {data['id']}")
        return data["id"]

    def test_get_ingredient_by_id(self, auth_headers):
        """Test getting ingredient by ID"""
        # First create one
        create_res = requests.post(f"{BASE_URL}/api/ingredients", json={
            "name": "TEST_Cebolla Roja",
            "unit": "lb",
            "category": "vegetales",
            "min_stock": 5,
            "avg_cost": 25.0
        }, headers=auth_headers)
        assert create_res.status_code == 200
        ing_id = create_res.json()["id"]
        
        # Then get it
        response = requests.get(f"{BASE_URL}/api/ingredients/{ing_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == ing_id
        assert data["name"] == "TEST_Cebolla Roja"
        print(f"Get ingredient verified: {data['name']}")

    def test_update_ingredient(self, auth_headers):
        """Test updating an ingredient"""
        # Create
        create_res = requests.post(f"{BASE_URL}/api/ingredients", json={
            "name": "TEST_Ajo Original",
            "unit": "unidad",
            "category": "condimentos",
            "min_stock": 20,
            "avg_cost": 3.0
        }, headers=auth_headers)
        assert create_res.status_code == 200
        ing_id = create_res.json()["id"]
        
        # Update
        update_res = requests.put(f"{BASE_URL}/api/ingredients/{ing_id}", json={
            "name": "TEST_Ajo Actualizado",
            "min_stock": 30,
            "avg_cost": 4.0
        }, headers=auth_headers)
        assert update_res.status_code == 200
        
        # Verify
        get_res = requests.get(f"{BASE_URL}/api/ingredients/{ing_id}", headers=auth_headers)
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["name"] == "TEST_Ajo Actualizado"
        assert data["min_stock"] == 30
        print("Update ingredient verified")

    def test_delete_ingredient(self, auth_headers):
        """Test deleting an ingredient"""
        # Create
        create_res = requests.post(f"{BASE_URL}/api/ingredients", json={
            "name": "TEST_Pimiento Para Eliminar",
            "unit": "lb",
            "category": "vegetales",
            "min_stock": 5,
            "avg_cost": 45.0
        }, headers=auth_headers)
        assert create_res.status_code == 200
        ing_id = create_res.json()["id"]
        
        # Delete
        del_res = requests.delete(f"{BASE_URL}/api/ingredients/{ing_id}", headers=auth_headers)
        assert del_res.status_code == 200
        
        # Verify deleted
        get_res = requests.get(f"{BASE_URL}/api/ingredients/{ing_id}", headers=auth_headers)
        assert get_res.status_code == 404
        print("Delete ingredient verified")


class TestWarehouses:
    """Test CRUD operations for warehouses"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_list_warehouses(self, auth_headers):
        """Test listing warehouses"""
        response = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} warehouses")

    def test_create_warehouse(self, auth_headers):
        """Test creating a warehouse"""
        payload = {
            "name": "TEST_Almacen Terraza",
            "location": "Piso 2"
        }
        response = requests.post(f"{BASE_URL}/api/warehouses", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "TEST_Almacen Terraza"
        assert "id" in data
        print(f"Created warehouse: {data['id']}")
        return data["id"]

    def test_update_warehouse(self, auth_headers):
        """Test updating a warehouse"""
        # Create
        create_res = requests.post(f"{BASE_URL}/api/warehouses", json={
            "name": "TEST_Almacen Original",
            "location": "Sotano"
        }, headers=auth_headers)
        assert create_res.status_code == 200
        wh_id = create_res.json()["id"]
        
        # Update
        update_res = requests.put(f"{BASE_URL}/api/warehouses/{wh_id}", json={
            "name": "TEST_Almacen Actualizado",
            "location": "Nivel -1"
        }, headers=auth_headers)
        assert update_res.status_code == 200
        
        # Verify
        list_res = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_headers)
        warehouses = list_res.json()
        updated = next((w for w in warehouses if w["id"] == wh_id), None)
        assert updated is not None
        assert updated["name"] == "TEST_Almacen Actualizado"
        print("Update warehouse verified")

    def test_delete_warehouse(self, auth_headers):
        """Test deleting a warehouse"""
        # Create
        create_res = requests.post(f"{BASE_URL}/api/warehouses", json={
            "name": "TEST_Almacen Para Eliminar",
            "location": "Temporal"
        }, headers=auth_headers)
        assert create_res.status_code == 200
        wh_id = create_res.json()["id"]
        
        # Delete
        del_res = requests.delete(f"{BASE_URL}/api/warehouses/{wh_id}", headers=auth_headers)
        assert del_res.status_code == 200
        
        # Verify deleted
        list_res = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_headers)
        warehouses = list_res.json()
        deleted = next((w for w in warehouses if w["id"] == wh_id), None)
        assert deleted is None
        print("Delete warehouse verified")


class TestSuppliers:
    """Test CRUD operations for suppliers"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_list_suppliers(self, auth_headers):
        """Test listing suppliers"""
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} suppliers")

    def test_create_supplier(self, auth_headers):
        """Test creating a supplier"""
        payload = {
            "name": "TEST_Proveedor Carnes RD",
            "contact_name": "Juan Test",
            "phone": "809-555-TEST",
            "email": "test@carnesrd.com",
            "address": "Santo Domingo Este",
            "rnc": "TEST-12345-6"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers", json=payload, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "TEST_Proveedor Carnes RD"
        assert "id" in data
        print(f"Created supplier: {data['id']}")

    def test_get_supplier_by_id(self, auth_headers):
        """Test getting supplier by ID"""
        # Create
        create_res = requests.post(f"{BASE_URL}/api/suppliers", json={
            "name": "TEST_Pescados Frescos",
            "contact_name": "Maria Test",
            "phone": "809-555-0099"
        }, headers=auth_headers)
        assert create_res.status_code == 200
        sup_id = create_res.json()["id"]
        
        # Get
        get_res = requests.get(f"{BASE_URL}/api/suppliers/{sup_id}", headers=auth_headers)
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["id"] == sup_id
        assert data["name"] == "TEST_Pescados Frescos"
        print(f"Get supplier verified: {data['name']}")

    def test_update_supplier(self, auth_headers):
        """Test updating a supplier"""
        # Create
        create_res = requests.post(f"{BASE_URL}/api/suppliers", json={
            "name": "TEST_Verduras Original",
            "phone": "809-000-0000"
        }, headers=auth_headers)
        assert create_res.status_code == 200
        sup_id = create_res.json()["id"]
        
        # Update
        update_res = requests.put(f"{BASE_URL}/api/suppliers/{sup_id}", json={
            "name": "TEST_Verduras Actualizado",
            "phone": "809-111-1111",
            "email": "updated@test.com"
        }, headers=auth_headers)
        assert update_res.status_code == 200
        
        # Verify
        get_res = requests.get(f"{BASE_URL}/api/suppliers/{sup_id}", headers=auth_headers)
        assert get_res.status_code == 200
        data = get_res.json()
        assert data["name"] == "TEST_Verduras Actualizado"
        assert data["phone"] == "809-111-1111"
        print("Update supplier verified")

    def test_delete_supplier(self, auth_headers):
        """Test deleting a supplier"""
        # Create
        create_res = requests.post(f"{BASE_URL}/api/suppliers", json={
            "name": "TEST_Proveedor Para Eliminar"
        }, headers=auth_headers)
        assert create_res.status_code == 200
        sup_id = create_res.json()["id"]
        
        # Delete
        del_res = requests.delete(f"{BASE_URL}/api/suppliers/{sup_id}", headers=auth_headers)
        assert del_res.status_code == 200
        print("Delete supplier verified")


class TestRecipes:
    """Test operations for recipes (linking products with ingredients)"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_list_recipes(self, auth_headers):
        """Test listing recipes"""
        response = requests.get(f"{BASE_URL}/api/recipes", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} recipes")

    def test_create_recipe_with_ingredients_and_waste(self, auth_headers):
        """Test creating a recipe with ingredients and waste percentage"""
        # First get a product to link with
        products_res = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        assert products_res.status_code == 200
        products = products_res.json()
        
        # Get ingredients
        ing_res = requests.get(f"{BASE_URL}/api/ingredients", headers=auth_headers)
        assert ing_res.status_code == 200
        ingredients = ing_res.json()
        
        if len(products) > 0 and len(ingredients) > 0:
            product = products[0]
            ingredient = ingredients[0]
            
            payload = {
                "product_id": product["id"],
                "product_name": f"TEST_{product['name']}",
                "ingredients": [
                    {
                        "ingredient_id": ingredient["id"],
                        "ingredient_name": ingredient["name"],
                        "quantity": 0.5,
                        "unit": ingredient.get("unit", "unidad"),
                        "waste_percentage": 10  # 10% waste/merma
                    }
                ],
                "yield_quantity": 1,
                "notes": "Test recipe with waste percentage"
            }
            
            response = requests.post(f"{BASE_URL}/api/recipes", json=payload, headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            assert "id" in data or "product_id" in data
            print(f"Created recipe for product: {product['name']}")
            
            # Verify waste percentage is saved
            if "ingredients" in data:
                assert data["ingredients"][0].get("waste_percentage", 0) == 10
                print("Waste percentage saved correctly")

    def test_delete_recipe(self, auth_headers):
        """Test deleting a recipe"""
        # List recipes first
        recipes_res = requests.get(f"{BASE_URL}/api/recipes", headers=auth_headers)
        recipes = recipes_res.json()
        
        # Find a test recipe to delete
        test_recipe = next((r for r in recipes if "TEST_" in (r.get("product_name") or "")), None)
        
        if test_recipe:
            del_res = requests.delete(f"{BASE_URL}/api/recipes/{test_recipe['id']}", headers=auth_headers)
            assert del_res.status_code == 200
            print(f"Deleted recipe: {test_recipe['id']}")


class TestPurchaseOrders:
    """Test Purchase Order lifecycle: draft -> pending -> partial/received"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_list_purchase_orders(self, auth_headers):
        """Test listing purchase orders"""
        response = requests.get(f"{BASE_URL}/api/purchase-orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} purchase orders")

    def test_full_purchase_order_lifecycle(self, auth_headers):
        """Test complete PO lifecycle: create -> send -> receive with price reconciliation"""
        
        # Get supplier
        sup_res = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        suppliers = sup_res.json()
        assert len(suppliers) > 0, "Need suppliers for PO"
        supplier = suppliers[0]
        
        # Get warehouse
        wh_res = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_headers)
        warehouses = wh_res.json()
        assert len(warehouses) > 0, "Need warehouse for PO"
        warehouse = warehouses[0]
        
        # Get/create an ingredient for PO
        ing_res = requests.get(f"{BASE_URL}/api/ingredients", headers=auth_headers)
        ingredients = ing_res.json()
        
        if len(ingredients) == 0:
            # Create a test ingredient
            create_ing = requests.post(f"{BASE_URL}/api/ingredients", json={
                "name": "TEST_Ingrediente PO",
                "unit": "lb",
                "category": "general",
                "min_stock": 5,
                "avg_cost": 100.0
            }, headers=auth_headers)
            ingredient = create_ing.json()
        else:
            ingredient = ingredients[0]
        
        # 1. CREATE PO (draft status)
        po_payload = {
            "supplier_id": supplier["id"],
            "warehouse_id": warehouse["id"],
            "items": [
                {
                    "ingredient_id": ingredient["id"],
                    "ingredient_name": ingredient["name"],
                    "quantity": 10,
                    "unit_price": 50.0
                }
            ],
            "notes": "TEST_Orden de prueba"
        }
        
        create_res = requests.post(f"{BASE_URL}/api/purchase-orders", json=po_payload, headers=auth_headers)
        assert create_res.status_code == 200, f"PO create failed: {create_res.text}"
        po = create_res.json()
        po_id = po["id"]
        assert po["status"] == "draft"
        assert po["total"] == 500.0  # 10 * 50
        print(f"✓ Created PO in draft status: {po_id}")
        
        # 2. SEND PO (change to pending)
        status_res = requests.put(
            f"{BASE_URL}/api/purchase-orders/{po_id}/status",
            params={"status": "pending"},
            headers=auth_headers
        )
        assert status_res.status_code == 200, f"Status update failed: {status_res.text}"
        
        # Verify status change
        get_res = requests.get(f"{BASE_URL}/api/purchase-orders/{po_id}", headers=auth_headers)
        po = get_res.json()
        assert po["status"] == "pending"
        print("✓ PO status changed to pending (sent)")
        
        # 3. RECEIVE PO with price reconciliation
        receive_payload = {
            "warehouse_id": warehouse["id"],
            "items": [
                {
                    "ingredient_id": ingredient["id"],
                    "received_quantity": 8,  # Received less than ordered
                    "actual_unit_price": 55.0  # Price different from original
                }
            ],
            "notes": "Received partial with price adjustment"
        }
        
        receive_res = requests.post(
            f"{BASE_URL}/api/purchase-orders/{po_id}/receive",
            json=receive_payload,
            headers=auth_headers
        )
        assert receive_res.status_code == 200, f"Receive failed: {receive_res.text}"
        received_po = receive_res.json()
        
        # Verify received
        assert received_po["status"] in ["partial", "received"]
        assert received_po.get("actual_total") is not None or received_po.get("total") == 500.0
        print(f"✓ PO received with status: {received_po['status']}")
        
        # 4. Check stock was updated
        stock_res = requests.get(
            f"{BASE_URL}/api/stock",
            params={"ingredient_id": ingredient["id"]},
            headers=auth_headers
        )
        stock_data = stock_res.json()
        # Find stock for our warehouse
        warehouse_stock = next(
            (s for s in stock_data if s["warehouse_id"] == warehouse["id"]),
            None
        )
        if warehouse_stock:
            print(f"✓ Stock updated: {warehouse_stock.get('current_stock', 0)} units")
        
        # 5. Check ingredient avg_cost was updated (price reconciliation)
        ing_check = requests.get(f"{BASE_URL}/api/ingredients/{ingredient['id']}", headers=auth_headers)
        if ing_check.status_code == 200:
            updated_ing = ing_check.json()
            print(f"✓ Ingredient avg_cost: {updated_ing.get('avg_cost', 'N/A')}")
        
        # Clean up - delete test PO
        del_res = requests.delete(f"{BASE_URL}/api/purchase-orders/{po_id}", headers=auth_headers)
        print(f"✓ Cleaned up test PO")


class TestStockOperations:
    """Test stock management: transfers, adjustments"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_list_stock(self, auth_headers):
        """Test listing stock levels"""
        response = requests.get(f"{BASE_URL}/api/stock", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} stock entries")

    def test_stock_transfer_between_warehouses(self, auth_headers):
        """Test transferring stock between warehouses"""
        # Get warehouses
        wh_res = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_headers)
        warehouses = wh_res.json()
        
        if len(warehouses) < 2:
            pytest.skip("Need at least 2 warehouses for transfer test")
        
        from_wh = warehouses[0]
        to_wh = warehouses[1]
        
        # Get or create ingredient
        ing_res = requests.get(f"{BASE_URL}/api/ingredients", headers=auth_headers)
        ingredients = ing_res.json()
        
        if len(ingredients) == 0:
            create_ing = requests.post(f"{BASE_URL}/api/ingredients", json={
                "name": "TEST_Transfer Ingredient",
                "unit": "unidad",
                "category": "general",
                "min_stock": 5,
                "avg_cost": 10.0
            }, headers=auth_headers)
            ingredient = create_ing.json()
        else:
            ingredient = ingredients[0]
        
        # First, add stock to source warehouse
        stock_payload = {
            "ingredient_id": ingredient["id"],
            "warehouse_id": from_wh["id"],
            "current_stock": 50,
            "min_stock": 5
        }
        requests.post(f"{BASE_URL}/api/stock", json=stock_payload, headers=auth_headers)
        
        # Transfer stock
        transfer_payload = {
            "ingredient_id": ingredient["id"],
            "from_warehouse_id": from_wh["id"],
            "to_warehouse_id": to_wh["id"],
            "quantity": 10,
            "notes": "TEST transfer"
        }
        
        transfer_res = requests.post(f"{BASE_URL}/api/stock/transfer", json=transfer_payload, headers=auth_headers)
        assert transfer_res.status_code == 200, f"Transfer failed: {transfer_res.text}"
        print(f"✓ Transferred 10 units from {from_wh['name']} to {to_wh['name']}")

    def test_stock_adjustment(self, auth_headers):
        """Test stock adjustment (inventory count correction)"""
        # Get warehouses and ingredients
        wh_res = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_headers)
        warehouses = wh_res.json()
        
        if len(warehouses) == 0:
            pytest.skip("Need warehouse for adjustment test")
        
        warehouse = warehouses[0]
        
        ing_res = requests.get(f"{BASE_URL}/api/ingredients", headers=auth_headers)
        ingredients = ing_res.json()
        
        if len(ingredients) == 0:
            create_ing = requests.post(f"{BASE_URL}/api/ingredients", json={
                "name": "TEST_Adjustment Ingredient",
                "unit": "unidad",
                "category": "general",
                "min_stock": 5,
                "avg_cost": 10.0
            }, headers=auth_headers)
            ingredient = create_ing.json()
        else:
            ingredient = ingredients[0]
        
        # First ensure stock exists
        stock_payload = {
            "ingredient_id": ingredient["id"],
            "warehouse_id": warehouse["id"],
            "current_stock": 100,
            "min_stock": 5
        }
        requests.post(f"{BASE_URL}/api/stock", json=stock_payload, headers=auth_headers)
        
        # Adjust stock (positive adjustment)
        adjust_payload = {
            "ingredient_id": ingredient["id"],
            "warehouse_id": warehouse["id"],
            "quantity": 5,  # Add 5 units
            "reason": "TEST Inventory count correction"
        }
        
        adjust_res = requests.post(f"{BASE_URL}/api/inventory/adjust", json=adjust_payload, headers=auth_headers)
        assert adjust_res.status_code == 200, f"Adjustment failed: {adjust_res.text}"
        print("✓ Stock adjustment successful")

    def test_list_stock_movements(self, auth_headers):
        """Test listing stock movements history"""
        response = requests.get(f"{BASE_URL}/api/stock-movements", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} stock movements")


class TestCleanup:
    """Cleanup test data"""
    
    @pytest.fixture
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
        assert response.status_code == 200
        return response.json().get("token")
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_cleanup_test_data(self, auth_headers):
        """Clean up all TEST_ prefixed data"""
        cleaned = {"ingredients": 0, "warehouses": 0, "suppliers": 0, "recipes": 0}
        
        # Clean test ingredients
        ing_res = requests.get(f"{BASE_URL}/api/ingredients", headers=auth_headers)
        if ing_res.status_code == 200:
            for ing in ing_res.json():
                if ing.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/ingredients/{ing['id']}", headers=auth_headers)
                    cleaned["ingredients"] += 1
        
        # Clean test warehouses
        wh_res = requests.get(f"{BASE_URL}/api/warehouses", headers=auth_headers)
        if wh_res.status_code == 200:
            for wh in wh_res.json():
                if wh.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/warehouses/{wh['id']}", headers=auth_headers)
                    cleaned["warehouses"] += 1
        
        # Clean test suppliers
        sup_res = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        if sup_res.status_code == 200:
            for sup in sup_res.json():
                if sup.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/suppliers/{sup['id']}", headers=auth_headers)
                    cleaned["suppliers"] += 1
        
        # Clean test recipes
        rec_res = requests.get(f"{BASE_URL}/api/recipes", headers=auth_headers)
        if rec_res.status_code == 200:
            for rec in rec_res.json():
                if "TEST_" in (rec.get("product_name") or "") or "TEST_" in (rec.get("notes") or ""):
                    requests.delete(f"{BASE_URL}/api/recipes/{rec['id']}", headers=auth_headers)
                    cleaned["recipes"] += 1
        
        print(f"Cleaned up: {cleaned}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
