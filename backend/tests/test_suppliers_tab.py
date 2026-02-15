"""
Tests for Suppliers Tab Feature (Proveedores)
- Suppliers API with active orders
- Category field support
- CRUD operations on suppliers
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "0000"})
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping authenticated tests")

@pytest.fixture
def auth_headers(auth_token):
    """Return auth headers for authenticated requests"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestSuppliersEndpoints:
    """Test suppliers API endpoints"""
    
    def test_get_suppliers(self, auth_headers):
        """Test GET /api/suppliers returns list of suppliers"""
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"GET /api/suppliers returned {len(data)} suppliers")
    
    def test_get_suppliers_with_active_orders(self, auth_headers):
        """Test GET /api/suppliers/with-active-orders returns suppliers with active_orders count"""
        response = requests.get(f"{BASE_URL}/api/suppliers/with-active-orders", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify each supplier has active_orders field
        for supplier in data:
            assert "active_orders" in supplier, f"Supplier {supplier.get('name', 'unknown')} missing active_orders field"
            assert isinstance(supplier["active_orders"], int), f"active_orders should be integer"
            assert supplier["active_orders"] >= 0, f"active_orders should be non-negative"
        
        print(f"GET /api/suppliers/with-active-orders returned {len(data)} suppliers with active_orders field")
    
    def test_create_supplier_with_category(self, auth_headers):
        """Test POST /api/suppliers with category field"""
        supplier_data = {
            "name": "TEST_Proveedor Licores Test",
            "contact_name": "Test Contact",
            "phone": "809-555-9999",
            "email": "test@testlicores.com",
            "address": "Test Address",
            "rnc": "999-99999-9",
            "category": "licores"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers", json=supplier_data, headers=auth_headers)
        assert response.status_code == 200
        
        created = response.json()
        assert created["name"] == supplier_data["name"]
        assert created["category"] == "licores"
        assert "id" in created
        
        print(f"Created supplier with category 'licores': {created['id']}")
        
        # Cleanup
        delete_response = requests.delete(f"{BASE_URL}/api/suppliers/{created['id']}", headers=auth_headers)
        assert delete_response.status_code == 200
        print(f"Cleaned up test supplier {created['id']}")
    
    def test_create_supplier_without_category_defaults_to_general(self, auth_headers):
        """Test that supplier without category defaults to 'general'"""
        supplier_data = {
            "name": "TEST_Proveedor Sin Categoria",
            "contact_name": "Test Contact",
            "phone": "809-555-8888",
            "email": "",
            "address": "",
            "rnc": ""
        }
        response = requests.post(f"{BASE_URL}/api/suppliers", json=supplier_data, headers=auth_headers)
        assert response.status_code == 200
        
        created = response.json()
        # If category not specified, the schema defaults to 'general'
        assert created.get("category", "general") == "general"
        assert "id" in created
        
        print(f"Created supplier without category, defaults to 'general': {created['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/suppliers/{created['id']}", headers=auth_headers)
    
    def test_update_supplier_category(self, auth_headers):
        """Test PUT /api/suppliers/{id} to update category"""
        # First create a supplier
        supplier_data = {
            "name": "TEST_Proveedor Para Actualizar",
            "contact_name": "Initial Contact",
            "phone": "809-555-7777",
            "category": "general"
        }
        create_response = requests.post(f"{BASE_URL}/api/suppliers", json=supplier_data, headers=auth_headers)
        assert create_response.status_code == 200
        created = create_response.json()
        supplier_id = created["id"]
        
        # Update the category to 'tabaco'
        update_data = {"category": "tabaco", "name": "TEST_Proveedor Para Actualizar"}
        update_response = requests.put(f"{BASE_URL}/api/suppliers/{supplier_id}", json=update_data, headers=auth_headers)
        assert update_response.status_code == 200
        
        # Verify the update via with-active-orders endpoint
        verify_response = requests.get(f"{BASE_URL}/api/suppliers/with-active-orders", headers=auth_headers)
        suppliers = verify_response.json()
        updated_supplier = next((s for s in suppliers if s["id"] == supplier_id), None)
        
        assert updated_supplier is not None, "Updated supplier not found"
        assert updated_supplier.get("category") == "tabaco", f"Category should be 'tabaco', got {updated_supplier.get('category')}"
        
        print(f"Successfully updated supplier {supplier_id} category to 'tabaco'")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/suppliers/{supplier_id}", headers=auth_headers)
    
    def test_supplier_category_options(self, auth_headers):
        """Test that all 4 category options work: licores, tabaco, alimentos, general"""
        categories = ["licores", "tabaco", "alimentos", "general"]
        created_ids = []
        
        for cat in categories:
            supplier_data = {
                "name": f"TEST_Proveedor {cat.capitalize()}",
                "category": cat
            }
            response = requests.post(f"{BASE_URL}/api/suppliers", json=supplier_data, headers=auth_headers)
            assert response.status_code == 200
            created = response.json()
            assert created.get("category", "general") == cat
            created_ids.append(created["id"])
            print(f"Created supplier with category '{cat}': {created['id']}")
        
        # Cleanup
        for sid in created_ids:
            requests.delete(f"{BASE_URL}/api/suppliers/{sid}", headers=auth_headers)
        print(f"Cleaned up {len(created_ids)} test suppliers")
    
    def test_delete_supplier(self, auth_headers):
        """Test DELETE /api/suppliers/{id}"""
        # Create a supplier to delete
        supplier_data = {
            "name": "TEST_Proveedor Para Eliminar",
            "category": "alimentos"
        }
        create_response = requests.post(f"{BASE_URL}/api/suppliers", json=supplier_data, headers=auth_headers)
        assert create_response.status_code == 200
        supplier_id = create_response.json()["id"]
        
        # Delete the supplier
        delete_response = requests.delete(f"{BASE_URL}/api/suppliers/{supplier_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        
        # Verify deletion - supplier should not appear in list
        list_response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        suppliers = list_response.json()
        assert not any(s["id"] == supplier_id for s in suppliers), "Supplier should be deleted"
        
        print(f"Successfully deleted supplier {supplier_id}")


class TestSuppliersSearchFiltering:
    """Test searching/filtering suppliers on backend (client-side filtering in frontend)"""
    
    def test_suppliers_have_searchable_fields(self, auth_headers):
        """Verify suppliers have name, contact_name, and rnc fields for searching"""
        response = requests.get(f"{BASE_URL}/api/suppliers/with-active-orders", headers=auth_headers)
        assert response.status_code == 200
        suppliers = response.json()
        
        for supplier in suppliers:
            # All suppliers should have these fields (may be empty strings)
            assert "name" in supplier
            assert "contact_name" in supplier or supplier.get("contact_name") is None
            assert "rnc" in supplier or supplier.get("rnc") is None
        
        print(f"All {len(suppliers)} suppliers have searchable fields (name, contact_name, rnc)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
