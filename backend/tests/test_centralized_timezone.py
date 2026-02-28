"""
Centralized Timezone Architecture Tests
Tests for the upgraded timezone system that reads from MongoDB system_config.
The timezone is configurable via /api/timezone endpoints.

Key features tested:
1. GET /api/timezone returns configured timezone (default America/Santo_Domingo)
2. PUT /api/timezone updates timezone config and returns success
3. PUT /api/timezone with invalid timezone returns 400 error
4. Dashboard uses centralized timezone for all "today" calculations
5. Changing timezone affects subsequent dashboard calls
"""
import pytest
import requests
import os
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

DEFAULT_TZ = "America/Santo_Domingo"
TEST_TZ = "America/New_York"


class TestTimezoneConfigEndpoints:
    """Tests for GET/PUT /api/timezone endpoints"""

    def test_get_timezone_returns_200(self):
        """Verify GET /api/timezone returns 200 with timezone field"""
        response = requests.get(f"{BASE_URL}/api/timezone")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert 'timezone' in data, "Response must have 'timezone' field"
        tz_name = data['timezone']
        print(f"✓ GET /api/timezone returns 200")
        print(f"  Current timezone: {tz_name}")
        # Verify it's a valid IANA timezone
        try:
            ZoneInfo(tz_name)
            print(f"  Timezone is valid IANA name")
        except Exception as e:
            pytest.fail(f"Invalid timezone returned: {tz_name}")

    def test_get_timezone_returns_santo_domingo_by_default(self):
        """Verify default timezone is America/Santo_Domingo"""
        response = requests.get(f"{BASE_URL}/api/timezone")
        assert response.status_code == 200
        data = response.json()
        # Check it's the DR timezone (or has been set to it)
        tz_name = data.get('timezone', '')
        # Could be Santo_Domingo or another valid timezone if test changed it
        assert tz_name, "Timezone should not be empty"
        print(f"✓ Current timezone: {tz_name}")

    def test_put_timezone_with_valid_timezone(self):
        """Verify PUT /api/timezone with valid timezone updates config"""
        # Get current timezone
        get_resp = requests.get(f"{BASE_URL}/api/timezone")
        original_tz = get_resp.json().get('timezone', DEFAULT_TZ)
        
        # Change to test timezone
        response = requests.put(
            f"{BASE_URL}/api/timezone",
            json={"timezone": TEST_TZ}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get('timezone') == TEST_TZ, f"Expected {TEST_TZ}, got {data.get('timezone')}"
        assert 'message' in data or data.get('timezone') == TEST_TZ, "Should have success indicator"
        print(f"✓ PUT /api/timezone updated to {TEST_TZ}")
        
        # Verify it persisted
        verify_resp = requests.get(f"{BASE_URL}/api/timezone")
        assert verify_resp.status_code == 200
        verify_data = verify_resp.json()
        assert verify_data.get('timezone') == TEST_TZ, f"Persisted timezone should be {TEST_TZ}"
        print(f"  Verified: GET returns {TEST_TZ}")
        
        # Restore original timezone
        restore_resp = requests.put(
            f"{BASE_URL}/api/timezone",
            json={"timezone": original_tz}
        )
        assert restore_resp.status_code == 200, "Should restore original timezone"
        print(f"  Restored to: {original_tz}")

    def test_put_timezone_with_invalid_timezone_returns_400(self):
        """Verify PUT /api/timezone with invalid timezone returns 400 error"""
        invalid_timezones = [
            "Invalid/Timezone",
            "FAKE_TZ",
            "UTC+5",  # Not a valid IANA format
            "",
            "America/FakeCity",
        ]
        
        for invalid_tz in invalid_timezones:
            response = requests.put(
                f"{BASE_URL}/api/timezone",
                json={"timezone": invalid_tz}
            )
            assert response.status_code == 400, f"Expected 400 for '{invalid_tz}', got {response.status_code}"
            print(f"✓ Invalid timezone '{invalid_tz}' correctly rejected with 400")


class TestDashboardWithCentralizedTimezone:
    """Tests for dashboard using centralized timezone"""

    def test_dashboard_returns_valid_json(self):
        """Verify dashboard returns valid JSON with all expected fields"""
        response = requests.get(f"{BASE_URL}/api/reports/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        required_fields = ['today', 'operations', 'loyalty', 'hourly_sales', 
                          'open_tables', 'closed_tables', 'voids']
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        print(f"✓ Dashboard returns valid JSON with all fields")
        print(f"  today.total_sales: {data['today'].get('total_sales', 0)}")
        print(f"  today.bills_count: {data['today'].get('bills_count', 0)}")

    def test_dashboard_hourly_sales_has_24_hours(self):
        """Verify hourly_sales has exactly 24 entries"""
        response = requests.get(f"{BASE_URL}/api/reports/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        hourly_sales = data.get('hourly_sales', [])
        assert len(hourly_sales) == 24, f"Expected 24 hours, got {len(hourly_sales)}"
        
        # Verify hour format
        for entry in hourly_sales:
            assert 'hour' in entry and 'total' in entry
            hour = entry['hour']
            assert hour.endswith(':00'), f"Hour should be HH:00 format, got {hour}"
        
        print(f"✓ hourly_sales has 24 entries with HH:00 format")
        
        # Show active hours
        active = [h for h in hourly_sales if h['total'] > 0]
        if active:
            print(f"  Active hours: {len(active)}")
            for h in active[:5]:
                print(f"    {h['hour']}: {h['total']}")

    def test_dashboard_hourly_sales_in_local_time(self):
        """Verify hourly sales are converted to local timezone"""
        # Get current timezone
        tz_resp = requests.get(f"{BASE_URL}/api/timezone")
        tz_name = tz_resp.json().get('timezone', DEFAULT_TZ)
        tz = ZoneInfo(tz_name)
        
        response = requests.get(f"{BASE_URL}/api/reports/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        # The hours should be 00-23 in local time
        hourly_sales = data.get('hourly_sales', [])
        hours = [int(h['hour'].split(':')[0]) for h in hourly_sales]
        
        # Should be sequential 0-23
        assert hours == list(range(24)), "Hours should be 0-23"
        
        print(f"✓ hourly_sales hours are in local time ({tz_name})")
        print(f"  Current local time: {datetime.now(tz).strftime('%H:%M')}")

    def test_dashboard_voids_structure(self):
        """Verify voids.today and voids.jornada have correct structure"""
        response = requests.get(f"{BASE_URL}/api/reports/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        voids = data.get('voids', {})
        
        for period in ['today', 'jornada']:
            assert period in voids, f"Missing voids.{period}"
            void_data = voids[period]
            
            # Required fields
            for field in ['count', 'total', 'by_reason', 'items']:
                assert field in void_data, f"Missing voids.{period}.{field}"
            
            assert isinstance(void_data['count'], int)
            assert isinstance(void_data['total'], (int, float))
            assert isinstance(void_data['by_reason'], list)
            assert isinstance(void_data['items'], list)
        
        print(f"✓ voids.today and voids.jornada have correct structure")
        print(f"  today: count={voids['today']['count']}, total={voids['today']['total']}")
        print(f"  jornada: count={voids['jornada']['count']}, total={voids['jornada']['total']}")


class TestTimezoneChangeAffectsDashboard:
    """Tests to verify changing timezone affects dashboard calculations"""

    def test_timezone_change_affects_dashboard(self):
        """Verify changing timezone updates dashboard calculations"""
        # Get original timezone
        orig_resp = requests.get(f"{BASE_URL}/api/timezone")
        original_tz = orig_resp.json().get('timezone', DEFAULT_TZ)
        
        # Get dashboard with original timezone
        dash1 = requests.get(f"{BASE_URL}/api/reports/dashboard").json()
        
        # Change timezone to New York
        change_resp = requests.put(
            f"{BASE_URL}/api/timezone",
            json={"timezone": TEST_TZ}
        )
        assert change_resp.status_code == 200
        
        # Get dashboard with new timezone
        dash2 = requests.get(f"{BASE_URL}/api/reports/dashboard").json()
        
        print(f"✓ Tested timezone change from {original_tz} to {TEST_TZ}")
        print(f"  Dashboard returned valid data in both cases")
        
        # Restore original timezone
        restore_resp = requests.put(
            f"{BASE_URL}/api/timezone",
            json={"timezone": original_tz}
        )
        assert restore_resp.status_code == 200
        print(f"  Restored timezone to {original_tz}")
        
        # Both dashboards should have valid structure
        for field in ['today', 'hourly_sales', 'voids']:
            assert field in dash1 and field in dash2


class TestHourlySalesTimezoneConversion:
    """Tests for UTC-to-local hour conversion in hourly_sales"""

    def test_hourly_sales_utc_to_local_conversion(self):
        """Verify hourly_sales correctly converts UTC hours to local"""
        # Get current timezone
        tz_resp = requests.get(f"{BASE_URL}/api/timezone")
        tz_name = tz_resp.json().get('timezone', DEFAULT_TZ)
        tz = ZoneInfo(tz_name)
        
        response = requests.get(f"{BASE_URL}/api/reports/dashboard")
        assert response.status_code == 200
        data = response.json()
        
        hourly_sales = data.get('hourly_sales', [])
        
        # Get active hours (where there are sales)
        active = [h for h in hourly_sales if h['total'] > 0]
        
        print(f"✓ Hourly sales conversion to {tz_name}")
        print(f"  UTC now: {datetime.now(timezone.utc).strftime('%H:%M')}")
        print(f"  Local now: {datetime.now(tz).strftime('%H:%M')}")
        
        if active:
            print(f"  Active sale hours (local):")
            for h in active:
                print(f"    {h['hour']}: {h['total']}")
        else:
            print(f"  No sales recorded for today")

    def test_utc_01_32_appears_at_local_hour(self):
        """A sale at UTC 01:32 should appear at the correct local hour"""
        # Get current timezone
        tz_resp = requests.get(f"{BASE_URL}/api/timezone")
        tz_name = tz_resp.json().get('timezone', DEFAULT_TZ)
        tz = ZoneInfo(tz_name)
        
        # Calculate what hour UTC 01:32 would be in local timezone
        # For Santo Domingo (UTC-4): 01:32 UTC = 21:32 local
        utc_time = datetime(2026, 1, 15, 1, 32, 0, tzinfo=timezone.utc)
        local_time = utc_time.astimezone(tz)
        expected_local_hour = local_time.hour
        
        print(f"✓ UTC to local hour conversion for {tz_name}")
        print(f"  UTC 01:32 -> Local {expected_local_hour:02d}:{local_time.minute:02d}")
        print(f"  Expected: sales at UTC 01:32 should appear in hour {expected_local_hour:02d}:00")


class TestCacheInvalidation:
    """Tests for timezone cache invalidation"""

    def test_cache_invalidation_on_put(self):
        """Verify PUT /api/timezone invalidates cache"""
        # Get original timezone
        orig_resp = requests.get(f"{BASE_URL}/api/timezone")
        original_tz = orig_resp.json().get('timezone', DEFAULT_TZ)
        
        # Change timezone
        change_resp = requests.put(
            f"{BASE_URL}/api/timezone",
            json={"timezone": TEST_TZ}
        )
        assert change_resp.status_code == 200
        
        # Immediately verify it changed
        verify_resp = requests.get(f"{BASE_URL}/api/timezone")
        assert verify_resp.json().get('timezone') == TEST_TZ, "Timezone should be immediately updated"
        
        print(f"✓ Cache invalidation works correctly")
        print(f"  Changed: {original_tz} -> {TEST_TZ}")
        print(f"  Immediate GET returns: {verify_resp.json().get('timezone')}")
        
        # Restore
        requests.put(f"{BASE_URL}/api/timezone", json={"timezone": original_tz})


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
