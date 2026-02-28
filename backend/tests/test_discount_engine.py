"""
Test Discount Engine (Motor de Reglas de Descuento) - New Feature
Tests CRUD operations for discounts and the calculate endpoint.
Discount types: PERCENTAGE, FIXED_AMOUNT, NEW_PRICE
Scopes: GLOBAL, CATEGORY, SPECIFIC_PRODUCTS
Authorization levels: CASHIER, MANAGER_PIN_REQUIRED
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Session with auth headers"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    # Authenticate with admin PIN
    login_res = session.post(f"{BASE_URL}/api/auth/verify-pin", json={"pin": "10000"})
    if login_res.status_code == 200:
        data = login_res.json()
        token = data.get('token')
        if token:
            session.headers.update({"Authorization": f"Bearer {token}"})
    return session

# ═══════════════════════════════════════════════════════════════════════════════
# TEST: GET /api/discounts - List all discounts
# ═══════════════════════════════════════════════════════════════════════════════
class TestDiscountsCRUD:
    """CRUD operations for discounts"""
    
    created_discount_id = None
    
    def test_list_discounts_returns_200(self, api_client):
        """GET /api/discounts should return list of discounts"""
        response = api_client.get(f"{BASE_URL}/api/discounts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/discounts returns {len(data)} discounts")
        # Store count for later
        self.__class__.initial_count = len(data)
    
    def test_create_discount_percentage_global(self, api_client):
        """POST /api/discounts - Create PERCENTAGE discount with GLOBAL scope"""
        payload = {
            "name": "TEST_Happy Hour 25%",
            "description": "Test discount for 25% off",
            "type": "PERCENTAGE",
            "value": 25.0,
            "scope": "GLOBAL",
            "target_ids": [],
            "authorization_level": "CASHIER",
            "active_from": None,
            "active_to": None,
            "schedule_start_time": None,
            "schedule_end_time": None,
            "active": True
        }
        response = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response fields
        assert "id" in data, "Response should contain 'id'"
        assert data["name"] == payload["name"], f"Name mismatch: {data['name']}"
        assert data["type"] == "PERCENTAGE", f"Type mismatch: {data['type']}"
        assert data["value"] == 25.0, f"Value mismatch: {data['value']}"
        assert data["scope"] == "GLOBAL", f"Scope mismatch: {data['scope']}"
        assert data["authorization_level"] == "CASHIER"
        assert data["active"] == True
        
        # Store ID for update and delete tests
        self.__class__.created_discount_id = data["id"]
        print(f"PASS: Created discount with ID {data['id']}")
    
    def test_create_discount_fixed_amount(self, api_client):
        """POST /api/discounts - Create FIXED_AMOUNT discount"""
        payload = {
            "name": "TEST_Descuento RD$200",
            "description": "Fixed amount discount",
            "type": "FIXED_AMOUNT",
            "value": 200.0,
            "scope": "GLOBAL",
            "target_ids": [],
            "authorization_level": "MANAGER_PIN_REQUIRED",
            "active": True
        }
        response = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["type"] == "FIXED_AMOUNT"
        assert data["authorization_level"] == "MANAGER_PIN_REQUIRED"
        self.__class__.fixed_discount_id = data["id"]
        print(f"PASS: Created FIXED_AMOUNT discount with ID {data['id']}")
    
    def test_create_discount_new_price(self, api_client):
        """POST /api/discounts - Create NEW_PRICE discount"""
        payload = {
            "name": "TEST_Precio Especial",
            "description": "New price discount",
            "type": "NEW_PRICE",
            "value": 150.0,
            "scope": "GLOBAL",
            "target_ids": [],
            "authorization_level": "CASHIER",
            "active": True
        }
        response = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["type"] == "NEW_PRICE"
        self.__class__.new_price_discount_id = data["id"]
        print(f"PASS: Created NEW_PRICE discount with ID {data['id']}")
    
    def test_update_discount(self, api_client):
        """PUT /api/discounts/{id} - Update existing discount"""
        if not self.__class__.created_discount_id:
            pytest.skip("No discount created to update")
        
        payload = {
            "name": "TEST_Happy Hour 30% UPDATED",
            "description": "Updated discount",
            "type": "PERCENTAGE",
            "value": 30.0,
            "scope": "GLOBAL",
            "target_ids": [],
            "authorization_level": "MANAGER_PIN_REQUIRED",
            "active": True
        }
        response = api_client.put(f"{BASE_URL}/api/discounts/{self.__class__.created_discount_id}", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify updated fields
        assert data["value"] == 30.0, f"Value not updated: {data['value']}"
        assert "UPDATED" in data["name"], "Name not updated"
        print(f"PASS: Updated discount - value now {data['value']}%")
    
    def test_list_discounts_after_create(self, api_client):
        """GET /api/discounts should show newly created discounts"""
        response = api_client.get(f"{BASE_URL}/api/discounts")
        assert response.status_code == 200
        data = response.json()
        # Should have at least the ones we created
        assert len(data) >= self.__class__.initial_count + 3, f"Expected at least {self.__class__.initial_count + 3} discounts, got {len(data)}"
        print(f"PASS: List now shows {len(data)} discounts")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST: GET /api/discounts/active - Get only active discounts
# ═══════════════════════════════════════════════════════════════════════════════
class TestActiveDiscounts:
    """Test active discounts endpoint with date/schedule filtering"""
    
    def test_get_active_discounts(self, api_client):
        """GET /api/discounts/active returns only active discounts"""
        response = api_client.get(f"{BASE_URL}/api/discounts/active")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        # All returned discounts should have active=True
        for d in data:
            assert d["active"] == True, f"Inactive discount returned: {d['name']}"
        
        print(f"PASS: GET /api/discounts/active returns {len(data)} active discounts")
    
    def test_create_inactive_discount_not_in_active_list(self, api_client):
        """Inactive discount should NOT appear in /active endpoint"""
        # Create an inactive discount
        payload = {
            "name": "TEST_Inactive Discount",
            "description": "Should not appear in active list",
            "type": "PERCENTAGE",
            "value": 5.0,
            "scope": "GLOBAL",
            "target_ids": [],
            "authorization_level": "CASHIER",
            "active": False
        }
        create_res = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert create_res.status_code == 200
        inactive_id = create_res.json()["id"]
        
        # Check it's NOT in active list
        active_res = api_client.get(f"{BASE_URL}/api/discounts/active")
        active_ids = [d["id"] for d in active_res.json()]
        assert inactive_id not in active_ids, "Inactive discount should not be in active list"
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/discounts/{inactive_id}")
        print("PASS: Inactive discount correctly filtered from /active endpoint")
    
    def test_create_happy_hour_with_schedule(self, api_client):
        """Create discount with Happy Hour schedule (time range)"""
        payload = {
            "name": "TEST_Happy Hour 6-8pm",
            "description": "Happy hour schedule test",
            "type": "PERCENTAGE",
            "value": 15.0,
            "scope": "GLOBAL",
            "target_ids": [],
            "authorization_level": "CASHIER",
            "schedule_start_time": "18:00",
            "schedule_end_time": "20:00",
            "active": True
        }
        response = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["schedule_start_time"] == "18:00"
        assert data["schedule_end_time"] == "20:00"
        self.__class__.schedule_discount_id = data["id"]
        print(f"PASS: Created Happy Hour discount with schedule 18:00-20:00")
    
    def test_create_discount_with_date_range(self, api_client):
        """Create discount with date range (active_from, active_to)"""
        payload = {
            "name": "TEST_Promo Enero",
            "description": "Date range test",
            "type": "FIXED_AMOUNT",
            "value": 100.0,
            "scope": "GLOBAL",
            "target_ids": [],
            "authorization_level": "CASHIER",
            "active_from": "2026-01-01T00:00:00",
            "active_to": "2026-01-31T23:59:59",
            "active": True
        }
        response = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["active_from"] == "2026-01-01T00:00:00"
        assert data["active_to"] == "2026-01-31T23:59:59"
        self.__class__.date_range_discount_id = data["id"]
        print("PASS: Created discount with date range")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST: POST /api/discounts/calculate - Calculate discount for a bill
# ═══════════════════════════════════════════════════════════════════════════════
class TestDiscountCalculation:
    """Test discount calculation engine"""
    
    def test_calculate_requires_discount_id_and_bill_id(self, api_client):
        """POST /api/discounts/calculate requires both discount_id and bill_id"""
        # Missing both
        response = api_client.post(f"{BASE_URL}/api/discounts/calculate", json={})
        assert response.status_code == 400, f"Expected 400 for empty body, got {response.status_code}"
        
        # Missing bill_id
        response = api_client.post(f"{BASE_URL}/api/discounts/calculate", json={"discount_id": "test"})
        assert response.status_code == 400, f"Expected 400 for missing bill_id"
        
        # Missing discount_id
        response = api_client.post(f"{BASE_URL}/api/discounts/calculate", json={"bill_id": "test"})
        assert response.status_code == 400, f"Expected 400 for missing discount_id"
        
        print("PASS: Calculate endpoint validates required fields")
    
    def test_calculate_returns_404_for_invalid_discount(self, api_client):
        """Calculate returns 404 for non-existent discount"""
        response = api_client.post(f"{BASE_URL}/api/discounts/calculate", json={
            "discount_id": "invalid_id_12345",
            "bill_id": "any_bill_id"
        })
        assert response.status_code == 404, f"Expected 404 for invalid discount_id, got {response.status_code}"
        print("PASS: Returns 404 for invalid discount_id")
    
    def test_calculate_returns_404_for_invalid_bill(self, api_client):
        """Calculate returns 404 for non-existent bill"""
        # First get a valid discount
        discounts_res = api_client.get(f"{BASE_URL}/api/discounts")
        discounts = discounts_res.json()
        if not discounts:
            pytest.skip("No discounts available")
        
        valid_discount_id = discounts[0]["id"]
        response = api_client.post(f"{BASE_URL}/api/discounts/calculate", json={
            "discount_id": valid_discount_id,
            "bill_id": "invalid_bill_id_12345"
        })
        assert response.status_code == 404, f"Expected 404 for invalid bill_id, got {response.status_code}"
        print("PASS: Returns 404 for invalid bill_id")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST: Validation - Invalid discount creation
# ═══════════════════════════════════════════════════════════════════════════════
class TestDiscountValidation:
    """Test validation rules for discount creation"""
    
    def test_invalid_type_returns_422(self, api_client):
        """POST /api/discounts with invalid type should return 422"""
        payload = {
            "name": "TEST_Invalid Type",
            "type": "INVALID_TYPE",  # Invalid
            "value": 10.0,
            "scope": "GLOBAL",
            "target_ids": [],
            "active": True
        }
        response = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert response.status_code == 422, f"Expected 422 for invalid type, got {response.status_code}"
        print("PASS: Invalid type returns 422 validation error")
    
    def test_invalid_scope_returns_422(self, api_client):
        """POST /api/discounts with invalid scope should return 422"""
        payload = {
            "name": "TEST_Invalid Scope",
            "type": "PERCENTAGE",
            "value": 10.0,
            "scope": "INVALID_SCOPE",  # Invalid
            "target_ids": [],
            "active": True
        }
        response = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert response.status_code == 422, f"Expected 422 for invalid scope, got {response.status_code}"
        print("PASS: Invalid scope returns 422 validation error")
    
    def test_invalid_authorization_level_returns_422(self, api_client):
        """POST /api/discounts with invalid authorization_level should return 422"""
        payload = {
            "name": "TEST_Invalid Auth",
            "type": "PERCENTAGE",
            "value": 10.0,
            "scope": "GLOBAL",
            "target_ids": [],
            "authorization_level": "INVALID_LEVEL",  # Invalid
            "active": True
        }
        response = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert response.status_code == 422, f"Expected 422 for invalid auth level, got {response.status_code}"
        print("PASS: Invalid authorization_level returns 422 validation error")
    
    def test_value_less_than_zero_returns_422(self, api_client):
        """POST /api/discounts with value <= 0 should return 422"""
        payload = {
            "name": "TEST_Zero Value",
            "type": "PERCENTAGE",
            "value": 0,  # Invalid - must be > 0
            "scope": "GLOBAL",
            "target_ids": [],
            "active": True
        }
        response = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert response.status_code == 422, f"Expected 422 for value=0, got {response.status_code}"
        
        payload["value"] = -10
        response = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert response.status_code == 422, f"Expected 422 for negative value, got {response.status_code}"
        print("PASS: value <= 0 returns 422 validation error")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST: Delete discount
# ═══════════════════════════════════════════════════════════════════════════════
class TestDeleteDiscount:
    """Test discount deletion"""
    
    def test_delete_discount(self, api_client):
        """DELETE /api/discounts/{id} should remove discount"""
        # Create a discount to delete
        payload = {
            "name": "TEST_To Be Deleted",
            "type": "PERCENTAGE",
            "value": 5.0,
            "scope": "GLOBAL",
            "target_ids": [],
            "active": True
        }
        create_res = api_client.post(f"{BASE_URL}/api/discounts", json=payload)
        assert create_res.status_code == 200
        discount_id = create_res.json()["id"]
        
        # Delete it
        delete_res = api_client.delete(f"{BASE_URL}/api/discounts/{discount_id}")
        assert delete_res.status_code == 200, f"Expected 200, got {delete_res.status_code}"
        data = delete_res.json()
        assert data.get("deleted") == True
        
        # Verify it's gone - should return 404 on update
        verify_res = api_client.put(f"{BASE_URL}/api/discounts/{discount_id}", json=payload)
        assert verify_res.status_code == 404, "Deleted discount should return 404"
        
        print("PASS: Discount deleted and verified not found")
    
    def test_delete_nonexistent_discount_returns_404(self, api_client):
        """DELETE /api/discounts/{id} with invalid ID returns 404"""
        response = api_client.delete(f"{BASE_URL}/api/discounts/invalid_id_xyz")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("PASS: Delete non-existent discount returns 404")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST: Cleanup test data
# ═══════════════════════════════════════════════════════════════════════════════
class TestCleanup:
    """Clean up TEST_ prefixed discounts"""
    
    def test_cleanup_test_discounts(self, api_client):
        """Remove all TEST_ prefixed discounts"""
        response = api_client.get(f"{BASE_URL}/api/discounts")
        discounts = response.json()
        
        deleted_count = 0
        for d in discounts:
            if d["name"].startswith("TEST_"):
                del_res = api_client.delete(f"{BASE_URL}/api/discounts/{d['id']}")
                if del_res.status_code == 200:
                    deleted_count += 1
        
        print(f"PASS: Cleaned up {deleted_count} test discounts")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
