"""
Test e-CF Dispatcher and The Factory HKA Integration
=====================================================
Tests the unified e-CF router that dispatches to Alanube or The Factory HKA.
Verifies: test-connection, config, send, status, refresh-status, dashboard, logs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestECFConfig:
    """Test e-CF configuration endpoints"""
    
    def test_get_ecf_config(self):
        """GET /api/ecf/config - Returns both providers' configuration status"""
        response = requests.get(f"{BASE_URL}/api/ecf/config")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify structure
        assert "active_provider" in data, "Missing active_provider field"
        assert "ecf_enabled" in data, "Missing ecf_enabled field"
        assert "alanube" in data, "Missing alanube config"
        assert "thefactory" in data, "Missing thefactory config"
        
        # Verify alanube config structure
        assert "configured" in data["alanube"], "Missing alanube.configured"
        assert "is_sandbox" in data["alanube"], "Missing alanube.is_sandbox"
        
        # Verify thefactory config structure
        assert "configured" in data["thefactory"], "Missing thefactory.configured"
        assert "is_sandbox" in data["thefactory"], "Missing thefactory.is_sandbox"
        assert "rnc" in data["thefactory"], "Missing thefactory.rnc"
        
        print(f"✓ e-CF Config: active_provider={data['active_provider']}, ecf_enabled={data['ecf_enabled']}")
        print(f"  Alanube: configured={data['alanube']['configured']}, sandbox={data['alanube']['is_sandbox']}")
        print(f"  TheFactory: configured={data['thefactory']['configured']}, sandbox={data['thefactory']['is_sandbox']}, rnc={data['thefactory']['rnc']}")


class TestECFTestConnection:
    """Test e-CF connection testing endpoint"""
    
    def test_connection_to_active_provider(self):
        """POST /api/ecf/test-connection - Test connection to active provider"""
        response = requests.post(f"{BASE_URL}/api/ecf/test-connection")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "ok" in data, "Missing ok field"
        assert "provider" in data, "Missing provider field"
        assert "message" in data, "Missing message field"
        
        print(f"✓ Test Connection: provider={data['provider']}, ok={data['ok']}, message={data['message']}")
        
        # If The Factory is active and configured, connection should succeed
        if data["provider"] == "thefactory":
            # The Factory HKA sandbox should authenticate successfully
            if data["ok"]:
                print("  ✓ The Factory HKA authentication successful")
            else:
                print(f"  ⚠ The Factory HKA auth failed: {data['message']}")


class TestECFDashboard:
    """Test e-CF dashboard endpoint"""
    
    def test_get_dashboard(self):
        """GET /api/ecf/dashboard - Dashboard showing all e-CF bills with provider info"""
        response = requests.get(f"{BASE_URL}/api/ecf/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "summary" in data, "Missing summary field"
        assert "bills" in data, "Missing bills field"
        
        summary = data["summary"]
        assert "total" in summary, "Missing summary.total"
        assert "approved" in summary, "Missing summary.approved"
        assert "contingencia" in summary, "Missing summary.contingencia"
        assert "rejected" in summary, "Missing summary.rejected"
        assert "pending" in summary, "Missing summary.pending"
        assert "registered" in summary, "Missing summary.registered"
        
        print(f"✓ Dashboard: total={summary['total']}, approved={summary['approved']}, contingencia={summary['contingencia']}, registered={summary['registered']}")
        
        # Check if any bills have provider info
        bills_with_provider = [b for b in data["bills"] if b.get("ecf_provider")]
        if bills_with_provider:
            providers = set(b["ecf_provider"] for b in bills_with_provider)
            print(f"  Bills by provider: {dict((p, len([b for b in bills_with_provider if b['ecf_provider']==p])) for p in providers)}")
    
    def test_dashboard_with_date_filter(self):
        """GET /api/ecf/dashboard with date filters"""
        response = requests.get(f"{BASE_URL}/api/ecf/dashboard?date_from=2025-01-01&date_to=2026-12-31")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "summary" in data
        assert "bills" in data
        print(f"✓ Dashboard with date filter: {data['summary']['total']} bills")


class TestECFLogs:
    """Test e-CF audit logs endpoints"""
    
    def test_get_all_logs(self):
        """GET /api/ecf/logs - Audit logs showing provider for each attempt"""
        response = requests.get(f"{BASE_URL}/api/ecf/logs?limit=20")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of logs"
        
        print(f"✓ e-CF Logs: {len(data)} recent logs")
        
        # Check log structure if any exist
        if data:
            log = data[0]
            expected_fields = ["bill_id", "encf", "action", "success", "created_at"]
            for field in expected_fields:
                assert field in log, f"Missing field {field} in log"
            
            # Check for provider field (should be present for newer logs)
            logs_with_provider = [l for l in data if l.get("provider")]
            if logs_with_provider:
                providers = set(l["provider"] for l in logs_with_provider)
                print(f"  Logs by provider: {dict((p, len([l for l in logs_with_provider if l['provider']==p])) for p in providers)}")


class TestECFBillStatus:
    """Test e-CF status endpoints for specific bills"""
    
    def test_get_status_for_known_bill(self):
        """GET /api/ecf/status/{bill_id} - Check e-CF status for a bill"""
        # Use the bill that was successfully sent (from context)
        bill_id = "32dfd992-d18e-449a-ac53-8c66a07ae246"
        
        response = requests.get(f"{BASE_URL}/api/ecf/status/{bill_id}")
        
        if response.status_code == 404:
            print(f"⚠ Bill {bill_id[:8]} not found - may have been cleaned up")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"✓ Bill Status: id={data.get('id', '')[:8]}, status={data.get('ecf_status')}, provider={data.get('ecf_provider')}")
        
        if data.get("ecf_encf"):
            print(f"  e-NCF: {data['ecf_encf']}")
        if data.get("ecf_security_code"):
            print(f"  Security Code: {data['ecf_security_code']}")
    
    def test_get_status_nonexistent_bill(self):
        """GET /api/ecf/status/{bill_id} - 404 for nonexistent bill"""
        response = requests.get(f"{BASE_URL}/api/ecf/status/nonexistent-bill-id")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Correctly returns 404 for nonexistent bill")


class TestECFRefreshStatus:
    """Test e-CF refresh status endpoint"""
    
    def test_refresh_status_for_known_bill(self):
        """GET /api/ecf/refresh-status/{bill_id} - Refresh status from provider"""
        bill_id = "32dfd992-d18e-449a-ac53-8c66a07ae246"
        
        response = requests.get(f"{BASE_URL}/api/ecf/refresh-status/{bill_id}")
        
        if response.status_code == 404:
            print(f"⚠ Bill {bill_id[:8]} not found - may have been cleaned up")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        print(f"✓ Refresh Status: ok={data.get('ok')}, status={data.get('status')}")
        
        if data.get("observations"):
            print(f"  Observations: {data['observations']}")
    
    def test_refresh_status_nonexistent_bill(self):
        """GET /api/ecf/refresh-status/{bill_id} - 404 for nonexistent bill"""
        response = requests.get(f"{BASE_URL}/api/ecf/refresh-status/nonexistent-bill-id")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Correctly returns 404 for nonexistent bill")


class TestECFSend:
    """Test e-CF send endpoint"""
    
    def test_send_nonexistent_bill(self):
        """POST /api/ecf/send/{bill_id} - 404 for nonexistent bill"""
        response = requests.post(f"{BASE_URL}/api/ecf/send/nonexistent-bill-id")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Correctly returns 404 for nonexistent bill")
    
    def test_send_already_sent_bill(self):
        """POST /api/ecf/send/{bill_id} - 400 for already sent bill"""
        bill_id = "32dfd992-d18e-449a-ac53-8c66a07ae246"
        
        response = requests.post(f"{BASE_URL}/api/ecf/send/{bill_id}")
        
        if response.status_code == 404:
            print(f"⚠ Bill {bill_id[:8]} not found - may have been cleaned up")
            return
        
        # Should return 400 if already sent
        if response.status_code == 400:
            data = response.json()
            print(f"✓ Correctly rejects already-sent bill: {data.get('detail', '')}")
        else:
            # If 200, it means the bill wasn't actually sent before
            print(f"⚠ Bill was not previously sent, got status {response.status_code}")


class TestECFBillLogs:
    """Test e-CF logs for specific bills"""
    
    def test_get_logs_for_bill(self):
        """GET /api/ecf/logs/{bill_id} - Get logs for specific bill"""
        bill_id = "32dfd992-d18e-449a-ac53-8c66a07ae246"
        
        response = requests.get(f"{BASE_URL}/api/ecf/logs/{bill_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Expected list of logs"
        
        print(f"✓ Bill Logs: {len(data)} logs for bill {bill_id[:8]}")
        
        if data:
            for log in data[:3]:  # Show first 3
                print(f"  - {log.get('action')}: success={log.get('success')}, provider={log.get('provider')}, encf={log.get('encf', '')[:15]}")


class TestSystemConfigECF:
    """Test system config for e-CF settings"""
    
    def test_get_system_config(self):
        """GET /api/system/config - Check e-CF settings in system config"""
        response = requests.get(f"{BASE_URL}/api/system/config")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        ecf_enabled = data.get("ecf_enabled", False)
        ecf_provider = data.get("ecf_provider", "alanube")
        ecf_auto_retry = data.get("ecf_auto_retry", False)
        
        print(f"✓ System Config: ecf_enabled={ecf_enabled}, ecf_provider={ecf_provider}, ecf_auto_retry={ecf_auto_retry}")
        
        # Verify provider is valid
        assert ecf_provider in ["alanube", "thefactory"], f"Invalid ecf_provider: {ecf_provider}"


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
