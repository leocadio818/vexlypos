"""D1/D4 — Hours Worked by Employee tests."""
import os
import io
import pytest
import requests
import openpyxl

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_PIN = "11338585"
DATE_FROM = "2026-04-15"
DATE_TO = "2026-04-20"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": ADMIN_PIN}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


# ─── JSON endpoint ───
def test_hours_worked_json(headers):
    r = requests.get(
        f"{BASE_URL}/api/reports/hours-worked",
        params={"date_from": DATE_FROM, "date_to": DATE_TO},
        headers=headers, timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    summary = data["summary"]
    assert summary["employee_count"] == 2, f"expected 2 employees, got {summary}"
    assert summary["shift_count"] == 4, f"expected 4 shifts, got {summary}"
    assert summary["total_hours"] == 27.5, f"expected 27.5 hrs, got {summary['total_hours']}"
    assert summary["avg_shift_minutes"] == 412.5
    assert summary["top_employee"] == "OSCAR"
    assert summary["longest_shift"]["duration_minutes"] == 495
    assert summary["longest_shift"]["employee"] == "OSCAR"

    employees = data["employees"]
    assert len(employees) == 2
    # Ensure OSCAR has 2 shifts and ~15.75h
    oscar = next((e for e in employees if e["name"] == "OSCAR"), None)
    carlos = next((e for e in employees if e["name"] == "CARLOS"), None)
    assert oscar is not None and carlos is not None
    assert oscar["shift_count"] == 2
    assert oscar["total_hours"] == 15.75
    assert carlos["shift_count"] == 2
    assert carlos["total_hours"] == 11.75
    # Stations present
    stations = {s["station"] for s in oscar["shifts"]}
    assert "Caja 1" in stations
    stations_c = {s["station"] for s in carlos["shifts"]}
    assert "Barra" in stations_c
    # Individual durations (sorted by opened_at)
    dur_minutes = sorted([s["duration_minutes"] for e in employees for s in e["shifts"]], reverse=True)
    assert dur_minutes == [495, 450, 405, 300], dur_minutes


def test_hours_worked_empty_range(headers):
    r = requests.get(
        f"{BASE_URL}/api/reports/hours-worked",
        params={"date_from": "2099-01-01", "date_to": "2099-01-02"},
        headers=headers, timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["employees"] == []
    assert data["summary"]["shift_count"] == 0


# ─── PDF ───
def test_hours_worked_pdf(headers):
    r = requests.get(
        f"{BASE_URL}/api/reports/xlsx/hours-worked/pdf",
        params={"date_from": DATE_FROM, "date_to": DATE_TO},
        headers=headers, timeout=60,
    )
    assert r.status_code == 200, r.text[:500]
    assert r.content[:4] == b"%PDF", "not a valid PDF"
    assert len(r.content) > 1000


# ─── XLSX with outlineLevel + SUM formulas ───
def test_hours_worked_xlsx(headers):
    r = requests.get(
        f"{BASE_URL}/api/reports/xlsx/hours-worked/xlsx",
        params={"date_from": DATE_FROM, "date_to": DATE_TO},
        headers=headers, timeout=60,
    )
    assert r.status_code == 200, r.text[:500]
    assert r.content[:2] == b"PK"
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    ws = wb.active

    # Collect all rows
    rows = list(ws.iter_rows(values_only=False))
    text_rows = [[str(c.value) if c.value is not None else "" for c in row] for row in rows]

    # Check TOTAL EMPLEADO rows exist (one per employee = 2) with SUM formulas
    total_emp_rows = [r for r in rows if any("TOTAL EMPLEADO" in (str(c.value) or "") for c in r)]
    assert len(total_emp_rows) >= 2, f"expected 2+ TOTAL EMPLEADO, got {len(total_emp_rows)}"
    # At least one cell in these rows must have =SUM formula
    found_sum = False
    for row in total_emp_rows:
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("=SUM("):
                found_sum = True
                break
    assert found_sum, "No =SUM formula found in TOTAL EMPLEADO rows"

    # TOTAL GENERAL row
    grand_rows = [r for r in rows if any("TOTAL GENERAL" in (str(c.value) or "") for c in r)]
    assert len(grand_rows) >= 1, "TOTAL GENERAL row missing"
    grand_formula_found = False
    for c in grand_rows[0]:
        if isinstance(c.value, str) and c.value.startswith("=SUM(") and "," in c.value:
            grand_formula_found = True
            break
    assert grand_formula_found, "TOTAL GENERAL should have =SUM(...,...) with comma-concat cells"

    # outlineLevel=1 for shift rows (Excel grouping)
    outline_1_count = 0
    for idx, row in enumerate(rows, start=1):
        rd = ws.row_dimensions.get(idx)
        if rd and rd.outlineLevel == 1:
            outline_1_count += 1
    assert outline_1_count >= 4, f"expected >=4 rows with outlineLevel=1, got {outline_1_count}"


# ─── Auth enforcement on xlsx endpoints ───
def test_hours_worked_pdf_requires_auth():
    r = requests.get(
        f"{BASE_URL}/api/reports/xlsx/hours-worked/pdf",
        params={"date_from": DATE_FROM, "date_to": DATE_TO},
        timeout=15,
    )
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


def test_hours_worked_xlsx_requires_auth():
    r = requests.get(
        f"{BASE_URL}/api/reports/xlsx/hours-worked/xlsx",
        params={"date_from": DATE_FROM, "date_to": DATE_TO},
        timeout=15,
    )
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"
