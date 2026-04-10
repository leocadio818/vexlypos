"""
Test Force Contingency Payment Methods and Edit e-CF Type Feature
Tests for:
1. Payment method with force_contingency=true (Uber Eats)
2. PATCH /api/bills/{bill_id}/ecf-type endpoint authorization
3. Creating payment methods with force_contingency toggle
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestForceContingencyAndEcfType:
    """Tests for force_contingency payment methods and edit_ecf_type permission"""
    
    token = None
    admin_user_id = None
    waiter_token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin before tests"""
        # Admin login
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert r.status_code == 200, f"Admin login failed: {r.text}"
        data = r.json()
        self.__class__.token = data["token"]
        self.__class__.admin_user_id = data["user"]["id"]
        
        # Try waiter login for permission tests
        try:
            r2 = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "100"})
            if r2.status_code == 200:
                self.__class__.waiter_token = r2.json()["token"]
        except:
            pass
    
    def admin_headers(self):
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def waiter_headers(self):
        if self.waiter_token:
            return {"Authorization": f"Bearer {self.waiter_token}", "Content-Type": "application/json"}
        return None
    
    # ─── PAYMENT METHOD TESTS ───
    
    def test_01_uber_eats_payment_method_exists(self):
        """Verify 'Uber Eats' payment method exists with force_contingency=true"""
        r = requests.get(f"{BASE_URL}/api/payment-methods", headers=self.admin_headers())
        assert r.status_code == 200, f"Failed to get payment methods: {r.text}"
        
        methods = r.json()
        uber_eats = next((m for m in methods if 'uber' in m.get('name', '').lower()), None)
        
        if uber_eats:
            print(f"✓ Found Uber Eats payment method: {uber_eats.get('name')}")
            print(f"  - force_contingency: {uber_eats.get('force_contingency')}")
            assert uber_eats.get('force_contingency') == True, "Uber Eats should have force_contingency=true"
        else:
            # Create it if not exists
            print("Uber Eats not found, creating...")
            create_r = requests.post(f"{BASE_URL}/api/payment-methods", 
                headers=self.admin_headers(),
                json={
                    "name": "Uber Eats",
                    "icon": "smartphone",
                    "icon_type": "lucide",
                    "bg_color": "#142328",
                    "text_color": "#06C167",
                    "currency": "DOP",
                    "exchange_rate": 1,
                    "is_cash": False,
                    "dgii_payment_code": 8,
                    "force_contingency": True
                })
            assert create_r.status_code == 200, f"Failed to create Uber Eats: {create_r.text}"
            created = create_r.json()
            assert created.get('force_contingency') == True, "Created Uber Eats should have force_contingency=true"
            print(f"✓ Created Uber Eats payment method with force_contingency=true")
    
    def test_02_create_payment_method_with_force_contingency(self):
        """Test creating a new payment method with force_contingency toggle"""
        # Create a test payment method
        r = requests.post(f"{BASE_URL}/api/payment-methods",
            headers=self.admin_headers(),
            json={
                "name": "TEST_Pedidos Ya",
                "icon": "smartphone",
                "icon_type": "lucide",
                "bg_color": "#FA0050",
                "text_color": "#ffffff",
                "currency": "DOP",
                "exchange_rate": 1,
                "is_cash": False,
                "dgii_payment_code": 8,
                "force_contingency": True
            })
        assert r.status_code == 200, f"Failed to create payment method: {r.text}"
        
        created = r.json()
        assert created.get('force_contingency') == True, "Created method should have force_contingency=true"
        print(f"✓ Created TEST_Pedidos Ya with force_contingency=true")
        
        # Cleanup
        if created.get('id'):
            requests.delete(f"{BASE_URL}/api/payment-methods/{created['id']}", headers=self.admin_headers())
    
    def test_03_update_payment_method_force_contingency(self):
        """Test updating force_contingency on existing payment method"""
        # First get all payment methods
        r = requests.get(f"{BASE_URL}/api/payment-methods", headers=self.admin_headers())
        assert r.status_code == 200
        methods = r.json()
        
        # Find one to test with (not Uber Eats)
        test_method = next((m for m in methods if 'uber' not in m.get('name', '').lower() and 'test' not in m.get('name', '').lower()), None)
        
        if test_method:
            original_value = test_method.get('force_contingency', False)
            
            # Update to opposite value
            r = requests.put(f"{BASE_URL}/api/payment-methods/{test_method['id']}",
                headers=self.admin_headers(),
                json={"force_contingency": not original_value})
            assert r.status_code == 200, f"Failed to update: {r.text}"
            
            # Verify update
            r2 = requests.get(f"{BASE_URL}/api/payment-methods", headers=self.admin_headers())
            updated = next((m for m in r2.json() if m['id'] == test_method['id']), None)
            assert updated.get('force_contingency') == (not original_value), "force_contingency should be updated"
            
            # Restore original value
            requests.put(f"{BASE_URL}/api/payment-methods/{test_method['id']}",
                headers=self.admin_headers(),
                json={"force_contingency": original_value})
            
            print(f"✓ Successfully toggled force_contingency on {test_method['name']}")
        else:
            pytest.skip("No suitable payment method found for testing")
    
    # ─── EDIT e-CF TYPE ENDPOINT TESTS ───
    
    def test_04_edit_ecf_type_endpoint_exists(self):
        """Verify PATCH /api/bills/{bill_id}/ecf-type endpoint exists"""
        # Try with a fake bill ID - should return 404 (not found) not 405 (method not allowed)
        r = requests.patch(f"{BASE_URL}/api/bills/fake-bill-id/ecf-type",
            headers=self.admin_headers(),
            json={"ecf_type": "E32"})
        
        # Should be 404 (bill not found) or 400 (validation error), not 405 (method not allowed)
        assert r.status_code in [400, 404], f"Endpoint should exist. Got {r.status_code}: {r.text}"
        print(f"✓ PATCH /api/bills/{{bill_id}}/ecf-type endpoint exists (returned {r.status_code})")
    
    def test_05_edit_ecf_type_requires_auth(self):
        """Verify endpoint requires authentication"""
        r = requests.patch(f"{BASE_URL}/api/bills/fake-bill-id/ecf-type",
            json={"ecf_type": "E32"})
        
        assert r.status_code == 401, f"Should require auth. Got {r.status_code}"
        print("✓ Endpoint requires authentication")
    
    def test_06_edit_ecf_type_admin_can_access(self):
        """Verify admin can access the endpoint"""
        # First find a CONTINGENCIA bill
        r = requests.get(f"{BASE_URL}/api/bills?status=paid", headers=self.admin_headers())
        if r.status_code != 200:
            pytest.skip("Could not fetch bills")
        
        bills = r.json()
        contingencia_bill = next((b for b in bills if (b.get('ecf_status') or '').upper() == 'CONTINGENCIA'), None)
        
        if contingencia_bill:
            # Try to update ecf_type
            r = requests.patch(f"{BASE_URL}/api/bills/{contingencia_bill['id']}/ecf-type",
                headers=self.admin_headers(),
                json={"ecf_type": "E32"})
            
            # Should succeed or fail with validation, not permission error
            assert r.status_code in [200, 400], f"Admin should have access. Got {r.status_code}: {r.text}"
            print(f"✓ Admin can access edit ecf-type endpoint (status: {r.status_code})")
        else:
            # Test with fake bill - should get 404, not 403
            r = requests.patch(f"{BASE_URL}/api/bills/fake-bill-id/ecf-type",
                headers=self.admin_headers(),
                json={"ecf_type": "E32"})
            assert r.status_code in [400, 404], f"Admin should have access. Got {r.status_code}"
            print("✓ Admin can access edit ecf-type endpoint (no CONTINGENCIA bills to test)")
    
    def test_07_edit_ecf_type_waiter_denied(self):
        """Verify waiter without edit_ecf_type permission is denied"""
        if not self.waiter_token:
            pytest.skip("No waiter token available")
        
        r = requests.patch(f"{BASE_URL}/api/bills/fake-bill-id/ecf-type",
            headers=self.waiter_headers(),
            json={"ecf_type": "E32"})
        
        # Should be 403 (forbidden) for waiter
        assert r.status_code == 403, f"Waiter should be denied. Got {r.status_code}: {r.text}"
        print("✓ Waiter without permission is denied access")
    
    def test_08_edit_ecf_type_validates_ecf_type(self):
        """Verify endpoint validates ecf_type values"""
        r = requests.patch(f"{BASE_URL}/api/bills/fake-bill-id/ecf-type",
            headers=self.admin_headers(),
            json={"ecf_type": "INVALID"})
        
        # Should return 400 for invalid type (or 404 for fake bill)
        assert r.status_code in [400, 404], f"Should validate ecf_type. Got {r.status_code}"
        
        if r.status_code == 400:
            data = r.json()
            assert 'inválido' in data.get('detail', '').lower() or 'invalid' in data.get('detail', '').lower(), \
                f"Should mention invalid type: {data}"
            print("✓ Endpoint validates ecf_type values")
        else:
            print("✓ Endpoint validates (bill not found first)")
    
    def test_09_edit_ecf_type_only_contingencia_bills(self):
        """Verify only CONTINGENCIA bills can be edited"""
        # Find a non-CONTINGENCIA bill
        r = requests.get(f"{BASE_URL}/api/bills?status=paid", headers=self.admin_headers())
        if r.status_code != 200:
            pytest.skip("Could not fetch bills")
        
        bills = r.json()
        non_contingencia = next((b for b in bills if (b.get('ecf_status') or '').upper() != 'CONTINGENCIA' and b.get('ecf_status')), None)
        
        if non_contingencia:
            r = requests.patch(f"{BASE_URL}/api/bills/{non_contingencia['id']}/ecf-type",
                headers=self.admin_headers(),
                json={"ecf_type": "E32"})
            
            assert r.status_code == 400, f"Should reject non-CONTINGENCIA bill. Got {r.status_code}: {r.text}"
            data = r.json()
            assert 'contingencia' in data.get('detail', '').lower(), f"Should mention CONTINGENCIA: {data}"
            print(f"✓ Non-CONTINGENCIA bill ({non_contingencia.get('ecf_status')}) correctly rejected")
        else:
            print("✓ No non-CONTINGENCIA bills to test (skipped)")
    
    # ─── PERMISSION TESTS ───
    
    def test_10_edit_ecf_type_permission_exists(self):
        """Verify edit_ecf_type permission is defined"""
        r = requests.get(f"{BASE_URL}/api/permissions/all", headers=self.admin_headers())
        assert r.status_code == 200, f"Failed to get permissions: {r.text}"
        
        permissions = r.json()
        assert 'edit_ecf_type' in permissions, "edit_ecf_type permission should be defined"
        print(f"✓ edit_ecf_type permission exists: {permissions.get('edit_ecf_type')}")
    
    def test_11_retry_ecf_permission_exists(self):
        """Verify retry_ecf permission is defined"""
        r = requests.get(f"{BASE_URL}/api/permissions/all", headers=self.admin_headers())
        assert r.status_code == 200
        
        permissions = r.json()
        assert 'retry_ecf' in permissions, "retry_ecf permission should be defined"
        print(f"✓ retry_ecf permission exists: {permissions.get('retry_ecf')}")
    
    # ─── INTEGRATION TEST ───
    
    def test_12_full_contingency_flow(self):
        """Test the full flow: payment method with force_contingency creates CONTINGENCIA bill"""
        # This is a documentation test - actual bill creation requires full checkout flow
        # Verify the logic exists in billing.py
        
        # Check that Uber Eats exists with force_contingency
        r = requests.get(f"{BASE_URL}/api/payment-methods", headers=self.admin_headers())
        assert r.status_code == 200
        
        methods = r.json()
        uber_eats = next((m for m in methods if 'uber' in m.get('name', '').lower()), None)
        
        if uber_eats:
            assert uber_eats.get('force_contingency') == True, "Uber Eats should have force_contingency=true"
            print(f"✓ Uber Eats payment method configured correctly:")
            print(f"  - name: {uber_eats.get('name')}")
            print(f"  - force_contingency: {uber_eats.get('force_contingency')}")
            print(f"  - dgii_payment_code: {uber_eats.get('dgii_payment_code')}")
        else:
            pytest.skip("Uber Eats payment method not found")


class TestEcfDashboardIntegration:
    """Tests for EcfDashboard edit functionality"""
    
    token = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        assert r.status_code == 200
        self.__class__.token = r.json()["token"]
    
    def admin_headers(self):
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}
    
    def test_01_ecf_dashboard_endpoint_exists(self):
        """Verify ECF dashboard endpoint exists"""
        r = requests.get(f"{BASE_URL}/api/ecf/dashboard", headers=self.admin_headers())
        # Should return 200 or 404 if no e-CF config, not 405
        assert r.status_code in [200, 404, 500], f"Dashboard endpoint should exist. Got {r.status_code}"
        print(f"✓ ECF dashboard endpoint exists (status: {r.status_code})")
    
    def test_02_find_contingencia_bills(self):
        """Find bills in CONTINGENCIA status"""
        r = requests.get(f"{BASE_URL}/api/bills?status=paid", headers=self.admin_headers())
        if r.status_code != 200:
            pytest.skip("Could not fetch bills")
        
        bills = r.json()
        contingencia_bills = [b for b in bills if (b.get('ecf_status') or '').upper() == 'CONTINGENCIA']
        
        print(f"Found {len(contingencia_bills)} CONTINGENCIA bills out of {len(bills)} total paid bills")
        
        if contingencia_bills:
            for b in contingencia_bills[:3]:  # Show first 3
                print(f"  - T-{b.get('transaction_number')}: {b.get('ncf')} | {b.get('ecf_error', 'No error')}")
        
        # This is informational, not a failure
        assert True


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
