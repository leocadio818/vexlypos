"""
Test Print Channel Multi-Selection Feature
Tests:
1. Login with 5-digit PIN (10000)
2. Product print_channels configuration
3. Multi-channel print job creation when sending order to kitchen
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    BASE_URL = "https://billing-grid-desktop.preview.emergentagent.com"


class TestLogin:
    """Test 5-digit PIN login"""
    
    def test_login_with_5_digit_pin(self):
        """Test login with Admin PIN 10000 (5 digits)"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["name"] == "Admin"
        print(f"SUCCESS: Login with 5-digit PIN 10000 works - user: {data['user']['name']}")


class TestPrintChannels:
    """Test print channel configuration"""
    
    def test_list_print_channels(self):
        """Test that print channels are available"""
        response = requests.get(f"{BASE_URL}/api/print-channels")
        assert response.status_code == 200
        channels = response.json()
        assert len(channels) >= 3, "Should have at least 3 channels (kitchen, bar, receipt)"
        
        channel_codes = [ch["code"] for ch in channels]
        assert "kitchen" in channel_codes, "Missing kitchen channel"
        assert "bar" in channel_codes, "Missing bar channel"
        assert "receipt" in channel_codes, "Missing receipt channel"
        print(f"SUCCESS: Print channels available: {channel_codes}")


class TestProductPrintChannels:
    """Test product-level print channel configuration"""
    
    def test_get_product_with_print_channels(self):
        """Test that product has print_channels array"""
        product_id = "2298613b-acb3-41f7-85fe-7d31a3cff3cb"  # Tostones con Queso
        response = requests.get(f"{BASE_URL}/api/products/{product_id}")
        assert response.status_code == 200, f"Failed to get product: {response.text}"
        
        product = response.json()
        assert "print_channels" in product, "Product missing print_channels field"
        assert isinstance(product["print_channels"], list), "print_channels should be an array"
        
        print(f"SUCCESS: Product '{product['name']}' has print_channels: {product['print_channels']}")
        return product
    
    def test_product_has_multichannel(self):
        """Test that test product has multiple channels configured"""
        product_id = "2298613b-acb3-41f7-85fe-7d31a3cff3cb"
        response = requests.get(f"{BASE_URL}/api/products/{product_id}")
        product = response.json()
        
        # This product should have kitchen and bar channels
        assert len(product["print_channels"]) >= 2, f"Product should have multi-channel, has: {product['print_channels']}"
        assert "kitchen" in product["print_channels"], "Product should have kitchen channel"
        assert "bar" in product["print_channels"], "Product should have bar channel"
        print(f"SUCCESS: Product has multi-channel: {product['print_channels']}")
    
    def test_update_product_print_channels(self):
        """Test updating product print_channels via API"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        token = login_response.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        product_id = "2298613b-acb3-41f7-85fe-7d31a3cff3cb"
        
        # Update to multi-channel
        update_response = requests.put(
            f"{BASE_URL}/api/products/{product_id}",
            json={"print_channels": ["kitchen", "bar"]},
            headers=headers
        )
        assert update_response.status_code == 200, f"Failed to update: {update_response.text}"
        
        # Verify update
        get_response = requests.get(f"{BASE_URL}/api/products/{product_id}")
        product = get_response.json()
        assert product["print_channels"] == ["kitchen", "bar"], f"Update not persisted: {product['print_channels']}"
        print("SUCCESS: Product print_channels update and persistence works")


class TestMultiChannelPrintJob:
    """Test multi-channel print job creation"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": "10000"})
        return response.json()["token"]
    
    @pytest.fixture
    def headers(self, auth_token):
        """Get headers with auth"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_send_comanda_multichannel(self, headers):
        """Test that sending comanda creates multiple print jobs for multi-channel product"""
        # 1. Get a table
        tables_response = requests.get(f"{BASE_URL}/api/tables", headers=headers)
        tables = tables_response.json()
        free_table = next((t for t in tables if t["status"] == "free"), tables[0])
        table_id = free_table["id"]
        
        # 2. Create an order on the table
        order_data = {
            "table_id": table_id,
            "table_number": free_table["number"],
            "waiter_id": "test",
            "waiter_name": "Test Waiter"
        }
        order_response = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
        assert order_response.status_code in [200, 201], f"Failed to create order: {order_response.text}"
        order = order_response.json()
        order_id = order["id"]
        print(f"Created order: {order_id}")
        
        # 3. Add the multi-channel product (Tostones con Queso)
        item_data = {
            "items": [{
                "product_id": "2298613b-acb3-41f7-85fe-7d31a3cff3cb",
                "product_name": "Tostones con Queso",
                "quantity": 1,
                "unit_price": 250,
                "modifiers": []
            }]
        }
        add_item_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/items",
            json=item_data,
            headers=headers
        )
        assert add_item_response.status_code == 200, f"Failed to add item: {add_item_response.text}"
        print("Added multi-channel product to order")
        
        # 4. Clear existing print queue
        requests.delete(f"{BASE_URL}/api/print-queue/clear", headers=headers)
        
        # 5. Send order to kitchen (should trigger print job creation)
        send_response = requests.post(
            f"{BASE_URL}/api/orders/{order_id}/send-kitchen",
            headers=headers
        )
        assert send_response.status_code == 200, f"Failed to send order: {send_response.text}"
        print("Sent order to kitchen")
        
        # 6. Send comanda to print queue
        comanda_response = requests.post(
            f"{BASE_URL}/api/print/send-comanda/{order_id}",
            headers=headers
        )
        assert comanda_response.status_code == 200, f"Failed to send comanda: {comanda_response.text}"
        comanda_data = comanda_response.json()
        
        # 7. Verify multiple print jobs created
        jobs = comanda_data.get("jobs", [])
        job_count = comanda_data.get("count", 0)
        
        print(f"Print jobs created: {job_count}")
        for job in jobs:
            print(f"  - Channel: {job['channel']}, Type: {job['type']}")
        
        # Should have at least 2 jobs (kitchen and bar) for multi-channel product
        assert job_count >= 2, f"Expected multiple print jobs for multi-channel product, got: {job_count}"
        
        channels_in_jobs = [job["channel"] for job in jobs]
        assert "kitchen" in channels_in_jobs, "Missing kitchen print job"
        assert "bar" in channels_in_jobs, "Missing bar print job"
        
        print("SUCCESS: Multi-channel print jobs created correctly")
        
        # Cleanup - void the order
        try:
            requests.put(f"{BASE_URL}/api/orders/{order_id}/void", headers=headers)
        except:
            pass


class TestPrintChannelSection:
    """Test print channel section UI elements"""
    
    def test_print_channels_have_required_fields(self):
        """Test that print channels have all required fields"""
        response = requests.get(f"{BASE_URL}/api/print-channels")
        channels = response.json()
        
        for channel in channels:
            assert "id" in channel, "Channel missing id"
            assert "name" in channel, "Channel missing name"
            assert "code" in channel, "Channel missing code"
            assert "active" in channel, "Channel missing active flag"
            print(f"Channel '{channel['name']}' ({channel['code']}): active={channel['active']}")
        
        print("SUCCESS: All print channels have required fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
