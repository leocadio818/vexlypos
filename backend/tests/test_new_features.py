"""
Test file for the 3 new features:
1. Movement search in Cash Register (CashRegister.js frontend feature)
2. Floating reprint button when movement selected (CashRegister.js frontend feature)
3. Copies field in printer settings (print-channels API + PrinterSettings.jsx)

Focus: Backend API tests for print channels with copies field
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPrintChannels:
    """Test print channels API with copies field support"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test - get auth token"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        if login_res.status_code == 200:
            self.token = login_res.json().get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        else:
            pytest.skip("Auth failed")
    
    def test_list_print_channels(self):
        """Test GET /api/print-channels - should return channels with copies field"""
        response = requests.get(f"{BASE_URL}/api/print-channels", headers=self.headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        channels = response.json()
        assert isinstance(channels, list), "Response should be a list"
        assert len(channels) > 0, "Should have at least one print channel"
        
        # Check that channels have expected fields
        for channel in channels:
            assert "id" in channel, "Channel should have id"
            assert "name" in channel, "Channel should have name"
            assert "code" in channel, "Channel should have code"
            # Copies field is optional but should be supported
            print(f"Channel: {channel.get('name')} - copies: {channel.get('copies', 'not set')}")
    
    def test_update_channel_with_copies(self):
        """Test PUT /api/print-channels/{id} - should update copies field"""
        # First get list of channels
        list_res = requests.get(f"{BASE_URL}/api/print-channels", headers=self.headers)
        assert list_res.status_code == 200
        channels = list_res.json()
        
        if len(channels) == 0:
            pytest.skip("No channels to test")
        
        # Get first channel
        test_channel = channels[0]
        channel_id = test_channel["id"]
        original_copies = test_channel.get("copies", 1)
        
        # Update copies to 3
        update_data = {
            "printer_name": test_channel.get("printer_name", "TestPrinter"),
            "copies": 3
        }
        
        update_res = requests.put(
            f"{BASE_URL}/api/print-channels/{channel_id}",
            headers=self.headers,
            json=update_data
        )
        assert update_res.status_code == 200, f"Update failed: {update_res.status_code} - {update_res.text}"
        
        # Verify update
        verify_res = requests.get(f"{BASE_URL}/api/print-channels", headers=self.headers)
        updated_channels = verify_res.json()
        updated_channel = next((c for c in updated_channels if c["id"] == channel_id), None)
        
        assert updated_channel is not None, "Channel not found after update"
        assert updated_channel.get("copies") == 3, f"Copies should be 3, got {updated_channel.get('copies')}"
        print(f"PASS: Channel copies updated to 3")
        
        # Restore original value
        requests.put(
            f"{BASE_URL}/api/print-channels/{channel_id}",
            headers=self.headers,
            json={"copies": original_copies}
        )


class TestPrintReceiptEndpoint:
    """Test print receipt endpoint that should include copies in response"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        if login_res.status_code == 200:
            self.token = login_res.json().get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        else:
            pytest.skip("Auth failed")
    
    def test_print_receipt_send_returns_copies(self):
        """Test POST /api/print/receipt/{bill_id}/send - should return copies in response"""
        # First get a bill ID from bills list
        bills_res = requests.get(f"{BASE_URL}/api/bills?status=paid&limit=1", headers=self.headers)
        
        if bills_res.status_code != 200 or len(bills_res.json()) == 0:
            pytest.skip("No paid bills available for testing")
        
        bills = bills_res.json()
        if len(bills) == 0:
            pytest.skip("No bills found")
            
        bill_id = bills[0]["id"]
        
        # Send print request
        print_res = requests.post(
            f"{BASE_URL}/api/print/receipt/{bill_id}/send",
            headers=self.headers
        )
        
        assert print_res.status_code == 200, f"Print request failed: {print_res.status_code}"
        
        response_data = print_res.json()
        assert "ok" in response_data, "Response should have 'ok' field"
        assert response_data["ok"] == True, "Response 'ok' should be True"
        
        # Check for copies in response
        assert "copies" in response_data, "Response should include 'copies' field"
        assert isinstance(response_data["copies"], int), "Copies should be an integer"
        print(f"PASS: Print receipt returns copies: {response_data['copies']}")
        
        # Check for job_id
        assert "job_id" in response_data, "Response should include 'job_id'"
        print(f"PASS: Job ID: {response_data['job_id']}")


class TestBillsSearchByNCF:
    """Test bills search by NCF (used by handleReprint function)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        if login_res.status_code == 200:
            self.token = login_res.json().get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        else:
            pytest.skip("Auth failed")
    
    def test_search_bills_by_ncf(self):
        """Test GET /api/bills?ncf={ncf} - used by reprint function"""
        # Try to find a bill with NCF starting with B01
        bills_res = requests.get(
            f"{BASE_URL}/api/bills?ncf=B01",
            headers=self.headers
        )
        
        # Should return 200 even if no matches
        assert bills_res.status_code == 200, f"Bills search failed: {bills_res.status_code}"
        
        bills = bills_res.json()
        print(f"INFO: Found {len(bills)} bills matching NCF pattern B01")
        
        if len(bills) > 0:
            # Verify bill has required fields for reprint
            bill = bills[0]
            assert "id" in bill, "Bill should have id"
            assert "ncf" in bill or "number" in bill, "Bill should have ncf or number"
            print(f"PASS: Bill search works. Sample bill ID: {bill['id']}")


class TestPrintQueue:
    """Test print queue operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for each test"""
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        if login_res.status_code == 200:
            self.token = login_res.json().get("access_token")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"
            }
        else:
            pytest.skip("Auth failed")
    
    def test_get_print_queue(self):
        """Test GET /api/print/queue"""
        response = requests.get(f"{BASE_URL}/api/print/queue", headers=self.headers)
        assert response.status_code == 200, f"Queue request failed: {response.status_code}"
        
        queue = response.json()
        assert isinstance(queue, list), "Queue should be a list"
        print(f"INFO: Print queue has {len(queue)} items")
        
        # Check queue item structure if any items exist
        if len(queue) > 0:
            item = queue[0]
            assert "id" in item, "Queue item should have id"
            assert "type" in item, "Queue item should have type"
            assert "status" in item, "Queue item should have status"
            
            # Check for copies field in queue items
            if "copies" in item:
                print(f"PASS: Queue item has copies field: {item['copies']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
