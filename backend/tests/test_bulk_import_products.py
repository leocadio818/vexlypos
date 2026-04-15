"""
Test Bulk Import Products Feature
- GET /api/products/import-template: Download CSV template
- POST /api/products/import-bulk: Import products from CSV/XLSX
- Validation: missing columns, invalid prices, empty names, non-existent categories
- Duplicate handling: skip products with same name+category
- Max rows limit: 2000 rows
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get auth token by logging in with admin PIN"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping tests")

@pytest.fixture(scope="module")
def api_client(auth_token):
    """Session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session

@pytest.fixture(scope="module")
def existing_categories(api_client):
    """Get existing categories for testing"""
    response = api_client.get(f"{BASE_URL}/api/categories")
    assert response.status_code == 200
    return response.json()


class TestImportTemplate:
    """Tests for GET /api/products/import-template"""
    
    def test_download_template_returns_csv(self, api_client):
        """Template endpoint returns a CSV file"""
        response = api_client.get(f"{BASE_URL}/api/products/import-template")
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        
    def test_template_has_correct_columns(self, api_client):
        """Template CSV has required columns: nombre, precio, categoria, descripcion, codigo_barras, disponible"""
        response = api_client.get(f"{BASE_URL}/api/products/import-template")
        assert response.status_code == 200
        
        content = response.text
        lines = content.strip().split('\n')
        assert len(lines) >= 1, "Template should have at least header row"
        
        header = lines[0].lower()
        required_columns = ["nombre", "precio", "categoria", "descripcion", "codigo_barras", "disponible"]
        for col in required_columns:
            assert col in header, f"Missing column: {col}"
    
    def test_template_has_example_rows(self, api_client):
        """Template includes example data rows"""
        response = api_client.get(f"{BASE_URL}/api/products/import-template")
        assert response.status_code == 200
        
        content = response.text
        lines = content.strip().split('\n')
        assert len(lines) >= 2, "Template should have header + at least 1 example row"
        
    def test_template_content_disposition(self, api_client):
        """Template has correct filename in Content-Disposition header"""
        response = api_client.get(f"{BASE_URL}/api/products/import-template")
        assert response.status_code == 200
        
        content_disp = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp
        assert "plantilla_productos.csv" in content_disp


class TestImportBulkValidation:
    """Tests for POST /api/products/import-bulk validation"""
    
    def test_import_rejects_unsupported_format(self, auth_token):
        """Import rejects non-CSV/XLSX files"""
        files = {'file': ('test.txt', b'some text content', 'text/plain')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        assert response.status_code == 400
        assert "Formato no soportado" in response.json().get("detail", "")
    
    def test_import_rejects_missing_required_columns(self, auth_token):
        """Import rejects CSV missing required columns (nombre, precio, categoria)"""
        csv_content = "columna1,columna2\nvalue1,value2"
        files = {'file': ('test.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        assert response.status_code == 400
        detail = response.json().get("detail", "")
        assert "Columnas faltantes" in detail or "faltantes" in detail.lower()
    
    def test_import_rejects_empty_file(self, auth_token):
        """Import rejects empty CSV file"""
        csv_content = "nombre,precio,categoria"  # Header only, no data
        files = {'file': ('test.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        assert response.status_code == 400
        detail = response.json().get("detail", "")
        assert "vacio" in detail.lower() or "empty" in detail.lower()
    
    def test_import_rejects_file_too_large(self, auth_token):
        """Import rejects files larger than 5MB"""
        # Create a CSV with header and lots of data to exceed 5MB
        header = "nombre,precio,categoria,descripcion,codigo_barras,disponible\n"
        row = "Producto Test,100,Categoria,Descripcion muy larga " + "x" * 1000 + ",123456,TRUE\n"
        # 5MB = 5 * 1024 * 1024 bytes, each row is ~1KB, need ~5200 rows
        csv_content = header + row * 5500
        
        files = {'file': ('test.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        assert response.status_code == 400
        detail = response.json().get("detail", "")
        assert "grande" in detail.lower() or "5MB" in detail


class TestImportBulkProcessing:
    """Tests for POST /api/products/import-bulk processing"""
    
    def test_import_valid_csv_creates_products(self, auth_token, existing_categories):
        """Import valid CSV creates products and returns summary"""
        # Find an existing category
        if not existing_categories:
            pytest.skip("No categories exist for testing")
        
        cat_name = existing_categories[0].get("name", "")
        if not cat_name:
            pytest.skip("Category has no name")
        
        # Create unique product names to avoid duplicates
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        
        csv_content = f"""nombre,precio,categoria,descripcion,codigo_barras,disponible
TEST_Import_{unique_id}_1,150,{cat_name},Producto de prueba 1,TEST001{unique_id},TRUE
TEST_Import_{unique_id}_2,250,{cat_name},Producto de prueba 2,TEST002{unique_id},TRUE
"""
        files = {'file': ('test.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response structure
        assert "total" in data
        assert "created" in data
        assert "skipped" in data
        assert "errors" in data
        assert "error_details" in data
        
        # Should have created 2 products
        assert data["total"] == 2
        assert data["created"] == 2
        assert data["skipped"] == 0
        assert data["errors"] == 0
        
        # Cleanup: Delete test products
        products_response = requests.get(
            f"{BASE_URL}/api/products?include_inactive=true",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        if products_response.status_code == 200:
            for prod in products_response.json():
                if f"TEST_Import_{unique_id}" in prod.get("name", ""):
                    requests.delete(
                        f"{BASE_URL}/api/products/{prod['id']}",
                        headers={"Authorization": f"Bearer {auth_token}"}
                    )
    
    def test_import_handles_invalid_prices(self, auth_token, existing_categories):
        """Import reports errors for invalid prices"""
        if not existing_categories:
            pytest.skip("No categories exist for testing")
        
        cat_name = existing_categories[0].get("name", "")
        
        csv_content = f"""nombre,precio,categoria,descripcion,codigo_barras,disponible
TEST_InvalidPrice1,abc,{cat_name},Precio invalido,,TRUE
TEST_InvalidPrice2,-50,{cat_name},Precio negativo,,TRUE
"""
        files = {'file': ('test.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Both rows should have errors
        assert data["errors"] == 2
        assert data["created"] == 0
        assert len(data["error_details"]) == 2
        
        # Check error messages mention price
        for error in data["error_details"]:
            assert "precio" in error.get("error", "").lower() or "invalido" in error.get("error", "").lower()
    
    def test_import_handles_empty_names(self, auth_token, existing_categories):
        """Import reports errors for empty product names"""
        if not existing_categories:
            pytest.skip("No categories exist for testing")
        
        cat_name = existing_categories[0].get("name", "")
        
        csv_content = f"""nombre,precio,categoria,descripcion,codigo_barras,disponible
,100,{cat_name},Sin nombre,,TRUE
"""
        files = {'file': ('test.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["errors"] == 1
        assert data["created"] == 0
        assert "vacio" in data["error_details"][0].get("error", "").lower() or "nombre" in data["error_details"][0].get("error", "").lower()
    
    def test_import_handles_nonexistent_category(self, auth_token):
        """Import reports errors for non-existent categories"""
        csv_content = """nombre,precio,categoria,descripcion,codigo_barras,disponible
TEST_NoCategory,100,CATEGORIA_QUE_NO_EXISTE_XYZ,Categoria invalida,,TRUE
"""
        files = {'file': ('test.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["errors"] == 1
        assert data["created"] == 0
        assert "no encontrada" in data["error_details"][0].get("error", "").lower() or "categoria" in data["error_details"][0].get("error", "").lower()
    
    def test_import_skips_duplicates(self, auth_token, existing_categories):
        """Import skips products that already exist (same name + category)"""
        if not existing_categories:
            pytest.skip("No categories exist for testing")
        
        cat_name = existing_categories[0].get("name", "")
        cat_id = existing_categories[0].get("id", "")
        
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        product_name = f"TEST_Duplicate_{unique_id}"
        
        # First, create a product directly
        create_response = requests.post(
            f"{BASE_URL}/api/products",
            headers={"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"},
            json={"name": product_name, "price": 100, "category_id": cat_id}
        )
        assert create_response.status_code == 200
        created_product = create_response.json()
        
        # Now try to import the same product
        csv_content = f"""nombre,precio,categoria,descripcion,codigo_barras,disponible
{product_name},200,{cat_name},Duplicado,,TRUE
"""
        files = {'file': ('test.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should be skipped, not created
        assert data["skipped"] == 1
        assert data["created"] == 0
        assert data["errors"] == 0
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/products/{created_product['id']}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
    
    def test_import_returns_preview(self, auth_token, existing_categories):
        """Import returns preview of first 5 rows"""
        if not existing_categories:
            pytest.skip("No categories exist for testing")
        
        cat_name = existing_categories[0].get("name", "")
        
        import uuid
        unique_id = str(uuid.uuid4())[:8]
        
        csv_content = f"""nombre,precio,categoria,descripcion,codigo_barras,disponible
TEST_Preview_{unique_id}_1,100,{cat_name},Desc1,,TRUE
TEST_Preview_{unique_id}_2,200,{cat_name},Desc2,,TRUE
TEST_Preview_{unique_id}_3,300,{cat_name},Desc3,,TRUE
TEST_Preview_{unique_id}_4,400,{cat_name},Desc4,,TRUE
TEST_Preview_{unique_id}_5,500,{cat_name},Desc5,,TRUE
TEST_Preview_{unique_id}_6,600,{cat_name},Desc6,,TRUE
"""
        files = {'file': ('test.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should have preview with max 5 rows
        assert "preview" in data
        assert len(data["preview"]) <= 5
        
        # Cleanup
        products_response = requests.get(
            f"{BASE_URL}/api/products?include_inactive=true",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        if products_response.status_code == 200:
            for prod in products_response.json():
                if f"TEST_Preview_{unique_id}" in prod.get("name", ""):
                    requests.delete(
                        f"{BASE_URL}/api/products/{prod['id']}",
                        headers={"Authorization": f"Bearer {auth_token}"}
                    )


class TestImportMaxRows:
    """Tests for max 2000 rows limit"""
    
    def test_import_rejects_over_2000_rows(self, auth_token, existing_categories):
        """Import rejects files with more than 2000 rows"""
        if not existing_categories:
            pytest.skip("No categories exist for testing")
        
        cat_name = existing_categories[0].get("name", "")
        
        # Create CSV with 2001 rows (header + 2001 data rows)
        header = "nombre,precio,categoria,descripcion,codigo_barras,disponible\n"
        rows = "\n".join([f"Product{i},100,{cat_name},Desc{i},,TRUE" for i in range(2001)])
        csv_content = header + rows
        
        files = {'file': ('test.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files
        )
        
        assert response.status_code == 400
        detail = response.json().get("detail", "")
        assert "2000" in detail or "maximo" in detail.lower()


class TestImportPermissions:
    """Tests for import permissions"""
    
    def test_import_requires_authentication(self):
        """Import endpoint requires authentication"""
        csv_content = "nombre,precio,categoria\nTest,100,Cat"
        files = {'file': ('test.csv', csv_content.encode(), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/products/import-bulk",
            files=files
        )
        # Should return 401 or 403
        assert response.status_code in [401, 403, 422]
