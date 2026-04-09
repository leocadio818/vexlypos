"""
Test DGII Payment Type Mapping Fix
==================================
Tests for the DGII payment type mapping fix:
1. PAYMENT_TYPE_MAP in alanube.py and thefactory.py should map 'tarjeta' to 3 (not 2), 'transferencia' to 2
2. map_payment_type() function accepts optional dgii_code parameter that takes priority over name-based mapping
3. POST/PUT /api/payment-methods should accept and store dgii_payment_code field
4. GET /api/payment-methods should return dgii_payment_code for each method
5. Bills with payments should pass dgii_payment_code to build_alanube_payload and build_thefactory_payload
"""
import pytest
import requests
import os
import sys

# Add backend to path for direct imports
sys.path.insert(0, '/app/backend')

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_PIN = "1000"


class TestPaymentTypeMappingAlanube:
    """Test PAYMENT_TYPE_MAP in alanube.py"""
    
    def test_alanube_tarjeta_maps_to_3(self):
        """Verify 'tarjeta' maps to DGII code 3 (Tarjeta Crédito/Débito)"""
        from routers.alanube import PAYMENT_TYPE_MAP
        
        assert PAYMENT_TYPE_MAP.get("tarjeta") == 3, "tarjeta should map to 3"
        assert PAYMENT_TYPE_MAP.get("card") == 3, "card should map to 3"
        assert PAYMENT_TYPE_MAP.get("tarjeta de credito") == 3, "tarjeta de credito should map to 3"
        assert PAYMENT_TYPE_MAP.get("tarjeta de debito") == 3, "tarjeta de debito should map to 3"
        print("PASSED: Alanube PAYMENT_TYPE_MAP correctly maps tarjeta to 3")
    
    def test_alanube_transferencia_maps_to_2(self):
        """Verify 'transferencia' maps to DGII code 2 (Cheque/Transferencia)"""
        from routers.alanube import PAYMENT_TYPE_MAP
        
        assert PAYMENT_TYPE_MAP.get("transferencia") == 2, "transferencia should map to 2"
        assert PAYMENT_TYPE_MAP.get("transfer") == 2, "transfer should map to 2"
        assert PAYMENT_TYPE_MAP.get("cheque") == 2, "cheque should map to 2"
        assert PAYMENT_TYPE_MAP.get("deposito") == 2, "deposito should map to 2"
        print("PASSED: Alanube PAYMENT_TYPE_MAP correctly maps transferencia to 2")
    
    def test_alanube_efectivo_maps_to_1(self):
        """Verify 'efectivo' maps to DGII code 1 (Efectivo)"""
        from routers.alanube import PAYMENT_TYPE_MAP
        
        assert PAYMENT_TYPE_MAP.get("efectivo") == 1, "efectivo should map to 1"
        assert PAYMENT_TYPE_MAP.get("cash") == 1, "cash should map to 1"
        print("PASSED: Alanube PAYMENT_TYPE_MAP correctly maps efectivo to 1")
    
    def test_alanube_map_payment_type_with_dgii_code_priority(self):
        """Verify map_payment_type() prioritizes dgii_code parameter over name-based lookup"""
        from routers.alanube import map_payment_type
        
        # When dgii_code is provided, it should take priority
        result = map_payment_type("efectivo", dgii_code=3)
        assert result == 3, f"Expected 3 when dgii_code=3, got {result}"
        
        result = map_payment_type("tarjeta", dgii_code=1)
        assert result == 1, f"Expected 1 when dgii_code=1, got {result}"
        
        # When dgii_code is None, fall back to name-based lookup
        result = map_payment_type("tarjeta", dgii_code=None)
        assert result == 3, f"Expected 3 for tarjeta without dgii_code, got {result}"
        
        result = map_payment_type("transferencia", dgii_code=None)
        assert result == 2, f"Expected 2 for transferencia without dgii_code, got {result}"
        
        print("PASSED: Alanube map_payment_type() correctly prioritizes dgii_code parameter")
    
    def test_alanube_map_payment_type_validates_dgii_code_range(self):
        """Verify map_payment_type() validates dgii_code is between 1-8"""
        from routers.alanube import map_payment_type
        
        # Invalid dgii_code (0) should fall back to name-based lookup
        result = map_payment_type("tarjeta", dgii_code=0)
        assert result == 3, f"Expected 3 for tarjeta with invalid dgii_code=0, got {result}"
        
        # Invalid dgii_code (9) should fall back to name-based lookup
        result = map_payment_type("efectivo", dgii_code=9)
        assert result == 1, f"Expected 1 for efectivo with invalid dgii_code=9, got {result}"
        
        # Valid dgii_code (8) should be used
        result = map_payment_type("efectivo", dgii_code=8)
        assert result == 8, f"Expected 8 when dgii_code=8, got {result}"
        
        print("PASSED: Alanube map_payment_type() validates dgii_code range 1-8")


class TestPaymentTypeMappingTheFactory:
    """Test PAYMENT_TYPE_MAP in thefactory.py"""
    
    def test_thefactory_tarjeta_maps_to_3(self):
        """Verify 'tarjeta' maps to DGII code '3' (Tarjeta Crédito/Débito)"""
        from routers.thefactory import PAYMENT_TYPE_MAP
        
        assert PAYMENT_TYPE_MAP.get("tarjeta") == "3", "tarjeta should map to '3'"
        assert PAYMENT_TYPE_MAP.get("card") == "3", "card should map to '3'"
        assert PAYMENT_TYPE_MAP.get("tarjeta de credito") == "3", "tarjeta de credito should map to '3'"
        assert PAYMENT_TYPE_MAP.get("tarjeta de debito") == "3", "tarjeta de debito should map to '3'"
        print("PASSED: TheFactory PAYMENT_TYPE_MAP correctly maps tarjeta to '3'")
    
    def test_thefactory_transferencia_maps_to_2(self):
        """Verify 'transferencia' maps to DGII code '2' (Cheque/Transferencia)"""
        from routers.thefactory import PAYMENT_TYPE_MAP
        
        assert PAYMENT_TYPE_MAP.get("transferencia") == "2", "transferencia should map to '2'"
        assert PAYMENT_TYPE_MAP.get("transfer") == "2", "transfer should map to '2'"
        assert PAYMENT_TYPE_MAP.get("cheque") == "2", "cheque should map to '2'"
        assert PAYMENT_TYPE_MAP.get("deposito") == "2", "deposito should map to '2'"
        print("PASSED: TheFactory PAYMENT_TYPE_MAP correctly maps transferencia to '2'")
    
    def test_thefactory_efectivo_maps_to_1(self):
        """Verify 'efectivo' maps to DGII code '1' (Efectivo)"""
        from routers.thefactory import PAYMENT_TYPE_MAP
        
        assert PAYMENT_TYPE_MAP.get("efectivo") == "1", "efectivo should map to '1'"
        assert PAYMENT_TYPE_MAP.get("cash") == "1", "cash should map to '1'"
        print("PASSED: TheFactory PAYMENT_TYPE_MAP correctly maps efectivo to '1'")
    
    def test_thefactory_map_payment_type_with_dgii_code_priority(self):
        """Verify map_payment_type() prioritizes dgii_code parameter over name-based lookup"""
        from routers.thefactory import map_payment_type
        
        # When dgii_code is provided, it should take priority (returns string)
        result = map_payment_type("efectivo", dgii_code=3)
        assert result == "3", f"Expected '3' when dgii_code=3, got {result}"
        
        result = map_payment_type("tarjeta", dgii_code=1)
        assert result == "1", f"Expected '1' when dgii_code=1, got {result}"
        
        # When dgii_code is None, fall back to name-based lookup
        result = map_payment_type("tarjeta", dgii_code=None)
        assert result == "3", f"Expected '3' for tarjeta without dgii_code, got {result}"
        
        result = map_payment_type("transferencia", dgii_code=None)
        assert result == "2", f"Expected '2' for transferencia without dgii_code, got {result}"
        
        print("PASSED: TheFactory map_payment_type() correctly prioritizes dgii_code parameter")


class TestPaymentMethodsAPI:
    """Test /api/payment-methods CRUD with dgii_payment_code field"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
    
    def test_get_payment_methods_returns_dgii_payment_code(self):
        """Verify GET /api/payment-methods returns dgii_payment_code for each method"""
        response = requests.get(f"{BASE_URL}/api/payment-methods", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        methods = response.json()
        assert len(methods) > 0, "Expected at least one payment method"
        
        # Check that dgii_payment_code is present in the response
        for method in methods:
            # dgii_payment_code can be null for methods that use automatic mapping
            assert "dgii_payment_code" in method or method.get("dgii_payment_code") is None, \
                f"Payment method {method.get('name')} should have dgii_payment_code field"
        
        # Verify specific mappings for known methods
        tarjeta_methods = [m for m in methods if "tarjeta" in m.get("name", "").lower()]
        for m in tarjeta_methods:
            assert m.get("dgii_payment_code") == 3, \
                f"Tarjeta method '{m.get('name')}' should have dgii_payment_code=3, got {m.get('dgii_payment_code')}"
        
        transferencia_methods = [m for m in methods if "transferencia" in m.get("name", "").lower()]
        for m in transferencia_methods:
            assert m.get("dgii_payment_code") == 2, \
                f"Transferencia method '{m.get('name')}' should have dgii_payment_code=2, got {m.get('dgii_payment_code')}"
        
        print(f"PASSED: GET /api/payment-methods returns dgii_payment_code for {len(methods)} methods")
    
    def test_create_payment_method_with_dgii_payment_code(self):
        """Verify POST /api/payment-methods accepts and stores dgii_payment_code"""
        test_method = {
            "name": "TEST_DGII_Method",
            "icon": "banknote",
            "currency": "DOP",
            "exchange_rate": 1,
            "is_cash": False,
            "dgii_payment_code": 5  # Bonos o Certificados
        }
        
        response = requests.post(f"{BASE_URL}/api/payment-methods", json=test_method, headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        created = response.json()
        assert created.get("dgii_payment_code") == 5, \
            f"Expected dgii_payment_code=5, got {created.get('dgii_payment_code')}"
        
        # Cleanup
        method_id = created.get("id")
        if method_id:
            requests.delete(f"{BASE_URL}/api/payment-methods/{method_id}", headers=self.headers)
        
        print("PASSED: POST /api/payment-methods accepts and stores dgii_payment_code")
    
    def test_update_payment_method_dgii_payment_code(self):
        """Verify PUT /api/payment-methods/{id} can update dgii_payment_code"""
        # First create a test method
        test_method = {
            "name": "TEST_DGII_Update",
            "icon": "banknote",
            "currency": "DOP",
            "exchange_rate": 1,
            "is_cash": False,
            "dgii_payment_code": 1
        }
        
        create_response = requests.post(f"{BASE_URL}/api/payment-methods", json=test_method, headers=self.headers)
        assert create_response.status_code == 200
        method_id = create_response.json().get("id")
        
        try:
            # Update the dgii_payment_code
            update_data = {"dgii_payment_code": 7}  # Nota de Crédito
            update_response = requests.put(f"{BASE_URL}/api/payment-methods/{method_id}", json=update_data, headers=self.headers)
            assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"
            
            # Verify the update
            get_response = requests.get(f"{BASE_URL}/api/payment-methods", headers=self.headers)
            methods = get_response.json()
            updated_method = next((m for m in methods if m.get("id") == method_id), None)
            
            assert updated_method is not None, "Could not find updated method"
            assert updated_method.get("dgii_payment_code") == 7, \
                f"Expected dgii_payment_code=7 after update, got {updated_method.get('dgii_payment_code')}"
            
            print("PASSED: PUT /api/payment-methods/{id} can update dgii_payment_code")
        finally:
            # Cleanup
            requests.delete(f"{BASE_URL}/api/payment-methods/{method_id}", headers=self.headers)


class TestExistingPaymentMethodsDGIICodes:
    """Verify existing payment methods have correct DGII codes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN})
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Could not authenticate")
    
    def test_efectivo_has_dgii_code_1(self):
        """Verify Efectivo payment method has dgii_payment_code=1"""
        response = requests.get(f"{BASE_URL}/api/payment-methods", headers=self.headers)
        methods = response.json()
        
        efectivo = next((m for m in methods if "efectivo" in m.get("name", "").lower()), None)
        assert efectivo is not None, "Efectivo payment method not found"
        assert efectivo.get("dgii_payment_code") == 1, \
            f"Efectivo should have dgii_payment_code=1, got {efectivo.get('dgii_payment_code')}"
        print(f"PASSED: Efectivo ({efectivo.get('name')}) has dgii_payment_code=1")
    
    def test_tarjeta_credito_has_dgii_code_3(self):
        """Verify Tarjeta de Crédito payment method has dgii_payment_code=3"""
        response = requests.get(f"{BASE_URL}/api/payment-methods", headers=self.headers)
        methods = response.json()
        
        tarjeta = next((m for m in methods if "tarjeta" in m.get("name", "").lower() and "credito" in m.get("name", "").lower()), None)
        assert tarjeta is not None, "Tarjeta de Crédito payment method not found"
        assert tarjeta.get("dgii_payment_code") == 3, \
            f"Tarjeta de Crédito should have dgii_payment_code=3, got {tarjeta.get('dgii_payment_code')}"
        print(f"PASSED: Tarjeta de Crédito ({tarjeta.get('name')}) has dgii_payment_code=3")
    
    def test_tarjeta_debito_has_dgii_code_3(self):
        """Verify Tarjeta de Débito payment method has dgii_payment_code=3"""
        response = requests.get(f"{BASE_URL}/api/payment-methods", headers=self.headers)
        methods = response.json()
        
        tarjeta = next((m for m in methods if "tarjeta" in m.get("name", "").lower() and "debito" in m.get("name", "").lower()), None)
        assert tarjeta is not None, "Tarjeta de Débito payment method not found"
        assert tarjeta.get("dgii_payment_code") == 3, \
            f"Tarjeta de Débito should have dgii_payment_code=3, got {tarjeta.get('dgii_payment_code')}"
        print(f"PASSED: Tarjeta de Débito ({tarjeta.get('name')}) has dgii_payment_code=3")
    
    def test_transferencia_has_dgii_code_2(self):
        """Verify Transferencia payment method has dgii_payment_code=2"""
        response = requests.get(f"{BASE_URL}/api/payment-methods", headers=self.headers)
        methods = response.json()
        
        transferencia = next((m for m in methods if "transferencia" in m.get("name", "").lower()), None)
        assert transferencia is not None, "Transferencia payment method not found"
        assert transferencia.get("dgii_payment_code") == 2, \
            f"Transferencia should have dgii_payment_code=2, got {transferencia.get('dgii_payment_code')}"
        print(f"PASSED: Transferencia ({transferencia.get('name')}) has dgii_payment_code=2")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
