"""
Test Map Decorators Bug Fixes
- BUG 1: Toolbar position (frontend only - not testable via API)
- BUG 2: Delete button functionality
- BUG 3: Color picker functionality
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://factura-consumo-app.preview.emergentagent.com').rstrip('/')

class TestDecoratorsCRUD:
    """Test decorator CRUD operations to verify bug fixes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        self.test_area_id = "test-bugfix-area"
        self.created_ids = []
        yield
        # Cleanup
        for dec_id in self.created_ids:
            try:
                requests.delete(f"{BASE_URL}/api/decorators/{dec_id}")
            except:
                pass
    
    def test_create_decorator(self):
        """Test creating a decorator"""
        payload = {
            "area_id": self.test_area_id,
            "type": "rect",
            "x": 50.0,
            "y": 50.0,
            "width": 12.0,
            "height": 8.0,
            "color": "#6B7280",
            "text": ""
        }
        response = requests.post(f"{BASE_URL}/api/decorators", json=payload)
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert data["type"] == "rect"
        assert data["color"] == "#6B7280"
        self.created_ids.append(data["id"])
        print(f"✓ Created decorator: {data['id']}")
    
    def test_update_color_bug3(self):
        """BUG 3: Test color update functionality"""
        # Create a decorator
        payload = {
            "area_id": self.test_area_id,
            "type": "rect",
            "x": 30.0,
            "y": 30.0,
            "width": 10.0,
            "height": 6.0,
            "color": "#6B7280",
            "text": ""
        }
        create_resp = requests.post(f"{BASE_URL}/api/decorators", json=payload)
        assert create_resp.status_code == 200
        dec_id = create_resp.json()["id"]
        self.created_ids.append(dec_id)
        
        # Update color to green (BUG 3 fix verification)
        update_payload = {"color": "#166534"}  # Green color
        update_resp = requests.put(f"{BASE_URL}/api/decorators/{dec_id}", json=update_payload)
        assert update_resp.status_code == 200, f"Color update failed: {update_resp.text}"
        
        # Verify color was updated
        get_resp = requests.get(f"{BASE_URL}/api/decorators")
        assert get_resp.status_code == 200
        decorators = get_resp.json()
        updated_dec = next((d for d in decorators if d["id"] == dec_id), None)
        assert updated_dec is not None
        assert updated_dec["color"] == "#166534", f"Color not updated: {updated_dec['color']}"
        print(f"✓ BUG 3: Color update works - changed to green")
    
    def test_delete_decorator_bug2(self):
        """BUG 2: Test delete functionality"""
        # Create a decorator
        payload = {
            "area_id": self.test_area_id,
            "type": "circle",
            "x": 60.0,
            "y": 60.0,
            "width": 5.0,
            "height": 5.0,
            "color": "#991B1B",
            "text": ""
        }
        create_resp = requests.post(f"{BASE_URL}/api/decorators", json=payload)
        assert create_resp.status_code == 200
        dec_id = create_resp.json()["id"]
        
        # Delete the decorator (BUG 2 fix verification)
        delete_resp = requests.delete(f"{BASE_URL}/api/decorators/{dec_id}")
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.text}"
        
        # Verify decorator was deleted
        get_resp = requests.get(f"{BASE_URL}/api/decorators")
        assert get_resp.status_code == 200
        decorators = get_resp.json()
        deleted_dec = next((d for d in decorators if d["id"] == dec_id), None)
        assert deleted_dec is None, "Decorator was not deleted!"
        print(f"✓ BUG 2: Delete works - decorator removed")
    
    def test_all_decorator_types(self):
        """Test all 5 decorator types can be created"""
        types = [
            {"type": "hline", "width": 15.0, "height": 0.5},
            {"type": "vline", "width": 0.5, "height": 15.0},
            {"type": "rect", "width": 12.0, "height": 8.0},
            {"type": "circle", "width": 5.0, "height": 5.0},
            {"type": "text", "width": 10.0, "height": 3.0, "text": "Test Label"},
        ]
        
        for t in types:
            payload = {
                "area_id": self.test_area_id,
                "type": t["type"],
                "x": 40.0,
                "y": 40.0,
                "width": t["width"],
                "height": t["height"],
                "color": "#6B7280",
                "text": t.get("text", "")
            }
            response = requests.post(f"{BASE_URL}/api/decorators", json=payload)
            assert response.status_code == 200, f"Failed to create {t['type']}: {response.text}"
            self.created_ids.append(response.json()["id"])
            print(f"✓ Created {t['type']} decorator")
    
    def test_list_decorators_by_area(self):
        """Test filtering decorators by area_id"""
        # Create decorator in specific area
        payload = {
            "area_id": "filter-test-area",
            "type": "rect",
            "x": 50.0,
            "y": 50.0,
            "width": 10.0,
            "height": 6.0,
            "color": "#1E40AF",
            "text": ""
        }
        create_resp = requests.post(f"{BASE_URL}/api/decorators", json=payload)
        assert create_resp.status_code == 200
        dec_id = create_resp.json()["id"]
        self.created_ids.append(dec_id)
        
        # Filter by area
        filter_resp = requests.get(f"{BASE_URL}/api/decorators?area_id=filter-test-area")
        assert filter_resp.status_code == 200
        decorators = filter_resp.json()
        assert any(d["id"] == dec_id for d in decorators), "Decorator not found in filtered list"
        print(f"✓ Area filtering works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
