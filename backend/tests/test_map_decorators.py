"""
Test Map Decorators CRUD API
Tests for decorator endpoints: GET/POST /api/decorators, PUT/DELETE /api/decorators/{id}
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMapDecoratorsAPI:
    """Map Decorators CRUD endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login with admin PIN
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={"pin": "1000"})
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed - skipping tests")
        
        # Get first area for testing
        areas_response = self.session.get(f"{BASE_URL}/api/areas")
        if areas_response.status_code == 200 and areas_response.json():
            self.test_area_id = areas_response.json()[0]["id"]
        else:
            pytest.skip("No areas found - skipping tests")
        
        yield
        
        # Cleanup: Delete test decorators
        decorators = self.session.get(f"{BASE_URL}/api/decorators", params={"area_id": self.test_area_id})
        if decorators.status_code == 200:
            for d in decorators.json():
                if d.get("text", "").startswith("TEST_"):
                    self.session.delete(f"{BASE_URL}/api/decorators/{d['id']}")
    
    def test_list_decorators_empty(self):
        """Test GET /api/decorators returns list"""
        response = self.session.get(f"{BASE_URL}/api/decorators")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ GET /api/decorators returns list with {len(response.json())} items")
    
    def test_list_decorators_by_area(self):
        """Test GET /api/decorators with area_id filter"""
        response = self.session.get(f"{BASE_URL}/api/decorators", params={"area_id": self.test_area_id})
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print(f"✓ GET /api/decorators?area_id={self.test_area_id} returns filtered list")
    
    def test_create_horizontal_line_decorator(self):
        """Test POST /api/decorators - create horizontal line"""
        payload = {
            "area_id": self.test_area_id,
            "type": "hline",
            "x": 50,
            "y": 50,
            "width": 15,
            "height": 0.5,
            "color": "#6B7280",
            "text": "TEST_hline"
        }
        response = self.session.post(f"{BASE_URL}/api/decorators", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "id" in data
        assert data["type"] == "hline"
        assert data["area_id"] == self.test_area_id
        assert data["x"] == 50
        assert data["y"] == 50
        assert data["width"] == 15
        assert data["color"] == "#6B7280"
        print(f"✓ Created horizontal line decorator with id: {data['id']}")
        
        # Verify persistence with GET
        get_response = self.session.get(f"{BASE_URL}/api/decorators", params={"area_id": self.test_area_id})
        assert get_response.status_code == 200
        decorators = get_response.json()
        created = next((d for d in decorators if d["id"] == data["id"]), None)
        assert created is not None
        assert created["type"] == "hline"
        print(f"✓ Verified decorator persisted in database")
    
    def test_create_vertical_line_decorator(self):
        """Test POST /api/decorators - create vertical line"""
        payload = {
            "area_id": self.test_area_id,
            "type": "vline",
            "x": 30,
            "y": 20,
            "width": 0.5,
            "height": 15,
            "color": "#1F2937",
            "text": "TEST_vline"
        }
        response = self.session.post(f"{BASE_URL}/api/decorators", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["type"] == "vline"
        assert data["height"] == 15
        print(f"✓ Created vertical line decorator with id: {data['id']}")
    
    def test_create_rectangle_decorator(self):
        """Test POST /api/decorators - create rectangle"""
        payload = {
            "area_id": self.test_area_id,
            "type": "rect",
            "x": 60,
            "y": 40,
            "width": 12,
            "height": 8,
            "color": "#166534",
            "text": "TEST_rect"
        }
        response = self.session.post(f"{BASE_URL}/api/decorators", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["type"] == "rect"
        assert data["width"] == 12
        assert data["height"] == 8
        print(f"✓ Created rectangle decorator with id: {data['id']}")
    
    def test_create_circle_decorator(self):
        """Test POST /api/decorators - create circle"""
        payload = {
            "area_id": self.test_area_id,
            "type": "circle",
            "x": 70,
            "y": 60,
            "width": 5,
            "height": 5,
            "color": "#1E40AF",
            "text": "TEST_circle"
        }
        response = self.session.post(f"{BASE_URL}/api/decorators", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["type"] == "circle"
        print(f"✓ Created circle decorator with id: {data['id']}")
    
    def test_create_text_decorator(self):
        """Test POST /api/decorators - create text label"""
        payload = {
            "area_id": self.test_area_id,
            "type": "text",
            "x": 45,
            "y": 80,
            "width": 10,
            "height": 3,
            "color": "#991B1B",
            "text": "TEST_Entrada"
        }
        response = self.session.post(f"{BASE_URL}/api/decorators", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["type"] == "text"
        assert data["text"] == "TEST_Entrada"
        print(f"✓ Created text decorator with id: {data['id']}")
    
    def test_update_decorator_position(self):
        """Test PUT /api/decorators/{id} - update position"""
        # First create a decorator
        create_payload = {
            "area_id": self.test_area_id,
            "type": "hline",
            "x": 10,
            "y": 10,
            "width": 15,
            "height": 0.5,
            "color": "#6B7280",
            "text": "TEST_update_pos"
        }
        create_response = self.session.post(f"{BASE_URL}/api/decorators", json=create_payload)
        assert create_response.status_code == 200
        decorator_id = create_response.json()["id"]
        
        # Update position
        update_payload = {"x": 25, "y": 35}
        update_response = self.session.put(f"{BASE_URL}/api/decorators/{decorator_id}", json=update_payload)
        assert update_response.status_code == 200
        assert update_response.json().get("ok") == True
        print(f"✓ Updated decorator position")
        
        # Verify update persisted
        get_response = self.session.get(f"{BASE_URL}/api/decorators", params={"area_id": self.test_area_id})
        decorators = get_response.json()
        updated = next((d for d in decorators if d["id"] == decorator_id), None)
        assert updated is not None
        assert updated["x"] == 25
        assert updated["y"] == 35
        print(f"✓ Verified position update persisted: x={updated['x']}, y={updated['y']}")
    
    def test_update_decorator_color(self):
        """Test PUT /api/decorators/{id} - update color"""
        # First create a decorator
        create_payload = {
            "area_id": self.test_area_id,
            "type": "rect",
            "x": 50,
            "y": 50,
            "width": 10,
            "height": 10,
            "color": "#6B7280",
            "text": "TEST_update_color"
        }
        create_response = self.session.post(f"{BASE_URL}/api/decorators", json=create_payload)
        assert create_response.status_code == 200
        decorator_id = create_response.json()["id"]
        
        # Update color
        update_payload = {"color": "#991B1B"}
        update_response = self.session.put(f"{BASE_URL}/api/decorators/{decorator_id}", json=update_payload)
        assert update_response.status_code == 200
        print(f"✓ Updated decorator color")
        
        # Verify update persisted
        get_response = self.session.get(f"{BASE_URL}/api/decorators", params={"area_id": self.test_area_id})
        decorators = get_response.json()
        updated = next((d for d in decorators if d["id"] == decorator_id), None)
        assert updated is not None
        assert updated["color"] == "#991B1B"
        print(f"✓ Verified color update persisted: {updated['color']}")
    
    def test_update_decorator_size(self):
        """Test PUT /api/decorators/{id} - update size (resize)"""
        # First create a decorator
        create_payload = {
            "area_id": self.test_area_id,
            "type": "rect",
            "x": 40,
            "y": 40,
            "width": 10,
            "height": 8,
            "color": "#6B7280",
            "text": "TEST_update_size"
        }
        create_response = self.session.post(f"{BASE_URL}/api/decorators", json=create_payload)
        assert create_response.status_code == 200
        decorator_id = create_response.json()["id"]
        
        # Update size
        update_payload = {"width": 20, "height": 15}
        update_response = self.session.put(f"{BASE_URL}/api/decorators/{decorator_id}", json=update_payload)
        assert update_response.status_code == 200
        print(f"✓ Updated decorator size")
        
        # Verify update persisted
        get_response = self.session.get(f"{BASE_URL}/api/decorators", params={"area_id": self.test_area_id})
        decorators = get_response.json()
        updated = next((d for d in decorators if d["id"] == decorator_id), None)
        assert updated is not None
        assert updated["width"] == 20
        assert updated["height"] == 15
        print(f"✓ Verified size update persisted: width={updated['width']}, height={updated['height']}")
    
    def test_update_text_decorator_text(self):
        """Test PUT /api/decorators/{id} - update text content"""
        # First create a text decorator
        create_payload = {
            "area_id": self.test_area_id,
            "type": "text",
            "x": 50,
            "y": 50,
            "width": 10,
            "height": 3,
            "color": "#6B7280",
            "text": "TEST_Texto"
        }
        create_response = self.session.post(f"{BASE_URL}/api/decorators", json=create_payload)
        assert create_response.status_code == 200
        decorator_id = create_response.json()["id"]
        
        # Update text
        update_payload = {"text": "TEST_Entrada"}
        update_response = self.session.put(f"{BASE_URL}/api/decorators/{decorator_id}", json=update_payload)
        assert update_response.status_code == 200
        print(f"✓ Updated text decorator content")
        
        # Verify update persisted
        get_response = self.session.get(f"{BASE_URL}/api/decorators", params={"area_id": self.test_area_id})
        decorators = get_response.json()
        updated = next((d for d in decorators if d["id"] == decorator_id), None)
        assert updated is not None
        assert updated["text"] == "TEST_Entrada"
        print(f"✓ Verified text update persisted: '{updated['text']}'")
    
    def test_delete_decorator(self):
        """Test DELETE /api/decorators/{id}"""
        # First create a decorator
        create_payload = {
            "area_id": self.test_area_id,
            "type": "hline",
            "x": 50,
            "y": 50,
            "width": 15,
            "height": 0.5,
            "color": "#6B7280",
            "text": "TEST_delete"
        }
        create_response = self.session.post(f"{BASE_URL}/api/decorators", json=create_payload)
        assert create_response.status_code == 200
        decorator_id = create_response.json()["id"]
        print(f"✓ Created decorator for deletion: {decorator_id}")
        
        # Delete decorator
        delete_response = self.session.delete(f"{BASE_URL}/api/decorators/{decorator_id}")
        assert delete_response.status_code == 200
        assert delete_response.json().get("ok") == True
        print(f"✓ Deleted decorator")
        
        # Verify deletion
        get_response = self.session.get(f"{BASE_URL}/api/decorators", params={"area_id": self.test_area_id})
        decorators = get_response.json()
        deleted = next((d for d in decorators if d["id"] == decorator_id), None)
        assert deleted is None
        print(f"✓ Verified decorator no longer exists in database")
    
    def test_decorator_types_validation(self):
        """Test all 5 decorator types can be created"""
        types_to_test = [
            {"type": "hline", "width": 15, "height": 0.5},
            {"type": "vline", "width": 0.5, "height": 15},
            {"type": "rect", "width": 12, "height": 8},
            {"type": "circle", "width": 5, "height": 5},
            {"type": "text", "width": 10, "height": 3, "text": "TEST_Label"},
        ]
        
        created_ids = []
        for i, type_config in enumerate(types_to_test):
            payload = {
                "area_id": self.test_area_id,
                "x": 10 + i * 15,
                "y": 10,
                "color": "#6B7280",
                **type_config
            }
            if "text" not in payload:
                payload["text"] = f"TEST_{type_config['type']}"
            
            response = self.session.post(f"{BASE_URL}/api/decorators", json=payload)
            assert response.status_code == 200, f"Failed to create {type_config['type']}"
            created_ids.append(response.json()["id"])
            print(f"✓ Created {type_config['type']} decorator")
        
        print(f"✓ All 5 decorator types created successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
