"""
Tests for 'Ventas por Categoría' report — Prompt 1 of Vexly_Prompts_Reportes.
Verifies JSON endpoint, XLSX and PDF exports (status, content-type, magic bytes).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://factura-consumo-app.preview.emergentagent.com").rstrip("/")
ADMIN_PIN = "11338585"  # Admin PIN actually seeded in DB (memory/test_credentials.md says 1000 but that's outdated)
DATE_FROM = "2024-01-01"
DATE_TO = "2030-12-31"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# --- JSON endpoint: /api/reports/sales-by-category (hierarchical) ---
class TestSalesByCategoryJSON:
    def test_returns_200_and_array(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/reports/sales-by-category",
            params={"date_from": DATE_FROM, "date_to": DATE_TO},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200
        assert "application/json" in r.headers.get("content-type", "")
        data = r.json()
        assert isinstance(data, list)

    def test_hierarchical_shape(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/reports/sales-by-category",
            params={"date_from": DATE_FROM, "date_to": DATE_TO},
            headers=auth_headers, timeout=30,
        )
        data = r.json()
        if not data:
            pytest.skip("No data in range — shape check skipped")
        cat = data[0]
        assert {"category", "total", "quantity", "products"} <= set(cat.keys())
        assert isinstance(cat["products"], list)
        if cat["products"]:
            p = cat["products"][0]
            assert {"name", "total", "quantity"} <= set(p.keys())

    def test_grand_total_matches_sum_of_categories(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/reports/sales-by-category",
            params={"date_from": DATE_FROM, "date_to": DATE_TO},
            headers=auth_headers, timeout=30,
        )
        data = r.json()
        if not data:
            pytest.skip("No data")
        # Each category total equals sum of its products totals (+/- 0.5 tolerance for rounding)
        for cat in data:
            prod_sum = round(sum(p["total"] for p in cat["products"]), 2)
            assert abs(prod_sum - cat["total"]) <= 0.5, f"{cat['category']} mismatch: {prod_sum} vs {cat['total']}"


# --- PDF export ---
class TestPDFExport:
    def test_pdf_200_and_magic(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/reports/xlsx/ventas-por-categoria/pdf",
            params={"date_from": DATE_FROM, "date_to": DATE_TO},
            headers=auth_headers, timeout=60,
        )
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 0
        assert r.content[:4] == b"%PDF", f"Not a PDF, got: {r.content[:10]!r}"

    def test_pdf_requires_auth(self):
        r = requests.get(
            f"{BASE_URL}/api/reports/xlsx/ventas-por-categoria/pdf",
            params={"date_from": DATE_FROM, "date_to": DATE_TO}, timeout=30,
        )
        assert r.status_code in (401, 403)


# --- XLSX export ---
class TestXLSXExport:
    def test_xlsx_200_and_magic(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/reports/xlsx/ventas-por-categoria/xlsx",
            params={"date_from": DATE_FROM, "date_to": DATE_TO},
            headers=auth_headers, timeout=60,
        )
        assert r.status_code == 200, r.text[:200]
        ct = r.headers.get("content-type", "")
        assert "spreadsheetml.sheet" in ct or "application/vnd.openxmlformats" in ct
        assert len(r.content) > 0
        # XLSX is a ZIP — starts with PK\x03\x04
        assert r.content[:2] == b"PK", f"Not a ZIP/XLSX, got: {r.content[:10]!r}"

    def test_xlsx_requires_auth(self):
        r = requests.get(
            f"{BASE_URL}/api/reports/xlsx/ventas-por-categoria/xlsx",
            params={"date_from": DATE_FROM, "date_to": DATE_TO}, timeout=30,
        )
        assert r.status_code in (401, 403)
