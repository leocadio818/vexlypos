"""
Reportes XLSX detallados — formato XLSX con 2 hojas (RESUMEN + DETALLE).
Tipos soportados:
  - 607 (ventas DGII)
  - 606 (compras DGII)
  - 608 (anulaciones/NC)
  - ventas-generales (todas las ventas del período con detalles completos)

Todas las hojas incluyen columna ESTADO con 6 posibles valores:
Aprobada, Rechazada, Contingencia, Cont. Manual, Procesando, Pendiente.
"""
from datetime import datetime, timezone, timedelta
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

import os
from motor.motor_asyncio import AsyncIOMotorClient
from routers.auth import get_current_user

_client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = _client[os.environ.get('DB_NAME', 'pos_db')]

router = APIRouter(prefix="/reports/xlsx", tags=["reports-xlsx"])


# ═══════════════════════════════════════════════════════════════
# Shared constants
# ═══════════════════════════════════════════════════════════════

HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
TITLE_FONT = Font(bold=True, size=16, color="1F4E78")
SUBTITLE_FONT = Font(bold=True, size=11, color="666666")
TOTAL_FILL = PatternFill("solid", fgColor="FFE699")
TOTAL_FONT = Font(bold=True, size=11)
CENTER = Alignment(horizontal="center", vertical="center")
LEFT = Alignment(horizontal="left", vertical="center")
RIGHT = Alignment(horizontal="right", vertical="center")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

# Tier colors for ESTADO column
ESTADO_COLORS = {
    "Aprobada": "C6EFCE",        # light green
    "Rechazada": "FFC7CE",       # light red
    "Contingencia": "FFEB9C",    # light amber
    "Cont. Manual": "D9D9D9",    # gray
    "Procesando": "BDD7EE",      # light blue
    "Pendiente": "E7E6E6",       # very light gray
}
ESTADO_TEXT_COLORS = {
    "Aprobada": "006100",
    "Rechazada": "9C0006",
    "Contingencia": "9C5700",
    "Cont. Manual": "404040",
    "Procesando": "1F4E78",
    "Pendiente": "595959",
}


def _classify_estado(bill: dict) -> str:
    """Map bill ecf_status → Spanish human-readable estado."""
    status = (bill.get("ecf_status") or "").upper()
    # Manual contingency flags
    ecf_err = (bill.get("ecf_error") or "").lower()
    is_manual = (
        "contingencia_manual" in ecf_err
        or bill.get("force_contingency") is True
        or any(
            (p or {}).get("skip_ecf") is True or (p or {}).get("force_contingency") is True
            for p in (bill.get("payments") or [])
        )
    )
    if status == "FINISHED":
        return "Aprobada"
    if status == "REJECTED" or bill.get("ecf_reject_reason"):
        return "Rechazada"
    if status == "CONTINGENCIA":
        return "Cont. Manual" if is_manual else "Contingencia"
    if status == "PROCESSING":
        return "Procesando"
    if status == "REGISTERED":
        return "Procesando"
    return "Pendiente"


def _payment_amount(bill: dict, method_keywords: list) -> float:
    """Sum payment amounts that match any of the method keywords (case-insensitive)."""
    total = 0.0
    for p in (bill.get("payments") or []):
        m = str((p or {}).get("method") or "").lower()
        if any(k in m for k in method_keywords):
            total += float((p or {}).get("amount") or 0)
    return round(total, 2)


def _build_range_query(date_from: str, date_to: str) -> dict:
    """Build paid_at range query using America/Santo_Domingo timezone."""
    from zoneinfo import ZoneInfo
    from utils.timezone import get_system_timezone_name
    # This must be awaited by caller if async; here we use static fallback for simplicity.
    tz = ZoneInfo("America/Santo_Domingo")
    try:
        start = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=tz)
        end = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=tz)
        return {"$gte": start.astimezone(timezone.utc).isoformat(),
                "$lte": end.astimezone(timezone.utc).isoformat()}
    except Exception:
        return {"$gte": date_from, "$lte": f"{date_to}T23:59:59"}


def _apply_header(ws, row: int, headers: list):
    for col_idx, title in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=col_idx, value=title)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = CENTER
        cell.border = BORDER


def _autosize(ws, min_width: int = 10, max_width: int = 35):
    for col_cells in ws.columns:
        col_letter = get_column_letter(col_cells[0].column)
        max_len = min_width
        for c in col_cells:
            v = c.value
            if v is None:
                continue
            try:
                ln = len(str(v))
            except Exception:
                ln = 10
            if ln > max_len:
                max_len = ln
        ws.column_dimensions[col_letter].width = min(max_len + 2, max_width)


def _write_title_block(ws, title: str, subtitle: str, period_label: str, business_name: str):
    """Write a 4-row header: title, business, period, blank."""
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=10)
    ws.cell(row=1, column=1, value=title).font = TITLE_FONT
    ws.cell(row=1, column=1).alignment = CENTER
    ws.row_dimensions[1].height = 28

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=10)
    ws.cell(row=2, column=1, value=business_name).font = SUBTITLE_FONT
    ws.cell(row=2, column=1).alignment = CENTER

    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=10)
    ws.cell(row=3, column=1, value=f"{subtitle} · {period_label}").font = SUBTITLE_FONT
    ws.cell(row=3, column=1).alignment = CENTER


def _paint_estado_cell(cell, estado: str):
    cell.fill = PatternFill("solid", fgColor=ESTADO_COLORS.get(estado, "FFFFFF"))
    cell.font = Font(bold=True, color=ESTADO_TEXT_COLORS.get(estado, "000000"), size=10)
    cell.alignment = CENTER


# ═══════════════════════════════════════════════════════════════
# Report builders
# ═══════════════════════════════════════════════════════════════

async def _fetch_sales_bills(date_from: str, date_to: str) -> list:
    """Fetch all paid bills in range."""
    paid_range = _build_range_query(date_from, date_to)
    bills = await db.bills.find(
        {"paid_at": paid_range},
        {"_id": 0}
    ).sort("paid_at", 1).to_list(5000)
    return bills


async def _fetch_credit_notes(date_from: str, date_to: str) -> list:
    paid_range = _build_range_query(date_from, date_to)
    notes = await db.credit_notes.find(
        {"created_at": paid_range},
        {"_id": 0}
    ).sort("created_at", 1).to_list(2000)
    return notes


async def _fetch_expenses(date_from: str, date_to: str) -> list:
    paid_range = _build_range_query(date_from, date_to)
    cursor = db.expenses.find(
        {"expense_date": paid_range},
        {"_id": 0}
    )
    try:
        return await cursor.sort("expense_date", 1).to_list(5000)
    except Exception:
        return []


async def _get_business_info() -> dict:
    cfg = await db.system_config.find_one({}, {"_id": 0}) or {}
    return {
        "name": cfg.get("ticket_business_name") or cfg.get("restaurant_name") or "VexlyPOS",
        "rnc": cfg.get("ticket_rnc") or cfg.get("rnc") or "",
    }


def _build_ventas_workbook(title: str, subtitle: str, bills: list,
                            period_label: str, business: dict,
                            include_operational: bool = True) -> BytesIO:
    """
    Build XLSX with RESUMEN + DETALLE sheets for sales bills.
    Columns: # Factura, e-NCF, Tipo Venta, Nombre Comercial, RNC, Neto, ITBIS,
             LEY 10%, Total, Efectivo, Tarjeta Visa, Tarjeta MC, AMEX,
             Transferencia, Fecha, ESTADO [+ Cajero, Mesero, Mesa, Hora]
    """
    wb = Workbook()
    # ── Sheet 1: RESUMEN
    ws = wb.active
    ws.title = "RESUMEN"

    _write_title_block(ws, title, subtitle, period_label, business["name"])
    ws.cell(row=4, column=1, value=f"RNC: {business['rnc']}").font = SUBTITLE_FONT

    # Totals computation
    total_count = len(bills)
    by_estado = {e: 0 for e in ["Aprobada", "Rechazada", "Contingencia", "Cont. Manual", "Procesando", "Pendiente"]}
    total_neto = total_itbis = total_ley = total_total = 0.0
    total_efectivo = total_visa = total_mc = total_amex = total_transfer = 0.0
    by_tipo = {}
    for b in bills:
        e = _classify_estado(b)
        by_estado[e] = by_estado.get(e, 0) + 1
        total_neto += float(b.get("subtotal") or 0)
        total_itbis += float(b.get("itbis") or 0)
        total_ley += float(b.get("tip") or b.get("service_charge") or 0)
        total_total += float(b.get("total") or 0)
        total_efectivo += _payment_amount(b, ["efectivo", "cash"])
        total_visa += _payment_amount(b, ["visa"])
        total_mc += _payment_amount(b, ["master", "mc "])
        total_amex += _payment_amount(b, ["amex", "american"])
        total_transfer += _payment_amount(b, ["transfer", "transferencia"])
        tv = b.get("ecf_type") or "OTRO"
        by_tipo[tv] = by_tipo.get(tv, 0) + 1

    row = 6
    # Summary block 1: counts
    ws.cell(row=row, column=1, value="📊 RESUMEN DE FACTURAS").font = Font(bold=True, size=12, color="1F4E78")
    row += 1
    rows_data = [
        ("Total facturas emitidas", total_count, None),
        ("✓ Aprobadas por DGII", by_estado["Aprobada"], "Aprobada"),
        ("✗ Rechazadas por DGII", by_estado["Rechazada"], "Rechazada"),
        ("⚠ En Contingencia", by_estado["Contingencia"], "Contingencia"),
        ("📱 Cont. Manual (Plataforma externa)", by_estado["Cont. Manual"], "Cont. Manual"),
        ("⏳ Procesando", by_estado["Procesando"], "Procesando"),
        ("· Pendientes", by_estado["Pendiente"], "Pendiente"),
    ]
    for label, value, estado_key in rows_data:
        c1 = ws.cell(row=row, column=1, value=label)
        c2 = ws.cell(row=row, column=2, value=value)
        c1.alignment = LEFT
        c2.alignment = RIGHT
        c2.font = Font(bold=True, size=11)
        if estado_key:
            c1.fill = PatternFill("solid", fgColor=ESTADO_COLORS[estado_key])
            c1.font = Font(color=ESTADO_TEXT_COLORS[estado_key], size=10, bold=True)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="💰 TOTALES FISCALES (RD$)").font = Font(bold=True, size=12, color="1F4E78")
    row += 1
    for label, val in [
        ("Total NETO", total_neto),
        ("Total ITBIS (18%)", total_itbis),
        ("Total Propina/LEY (10%)", total_ley),
        ("TOTAL VENTAS", total_total),
    ]:
        ws.cell(row=row, column=1, value=label).alignment = LEFT
        c = ws.cell(row=row, column=2, value=round(val, 2))
        c.number_format = '#,##0.00'
        c.alignment = RIGHT
        c.font = Font(bold=True)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="💳 FORMAS DE PAGO (RD$)").font = Font(bold=True, size=12, color="1F4E78")
    row += 1
    for label, val in [
        ("Efectivo", total_efectivo),
        ("Tarjeta Visa", total_visa),
        ("Tarjeta MasterCard", total_mc),
        ("American Express (AMEX)", total_amex),
        ("Transferencia", total_transfer),
    ]:
        ws.cell(row=row, column=1, value=label).alignment = LEFT
        c = ws.cell(row=row, column=2, value=round(val, 2))
        c.number_format = '#,##0.00'
        c.alignment = RIGHT
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="📋 POR TIPO DE VENTA").font = Font(bold=True, size=12, color="1F4E78")
    row += 1
    for tipo, count in sorted(by_tipo.items()):
        ws.cell(row=row, column=1, value=tipo).alignment = LEFT
        ws.cell(row=row, column=2, value=count).alignment = RIGHT
        row += 1

    ws.column_dimensions["A"].width = 45
    ws.column_dimensions["B"].width = 20

    # ── Sheet 2: DETALLE
    ws2 = wb.create_sheet("DETALLE")
    _write_title_block(ws2, title, subtitle, period_label, business["name"])

    headers = ["# Factura", "e-NCF", "Tipo Venta", "Nombre Comercial", "RNC",
               "Neto", "ITBIS", "LEY 10%", "Total",
               "Efectivo", "Tarjeta Visa", "Tarjeta MC", "AMEX", "Transferencia",
               "Fecha", "ESTADO"]
    if include_operational:
        headers += ["Cajero", "Mesero", "Mesa", "Hora"]

    _apply_header(ws2, 5, headers)

    row = 6
    for b in bills:
        estado = _classify_estado(b)
        paid_at = b.get("paid_at") or b.get("created_at") or ""
        fecha_str = ""
        hora_str = ""
        if paid_at:
            try:
                # paid_at is UTC ISO; convert to RD tz for display
                from zoneinfo import ZoneInfo
                dt = datetime.fromisoformat(str(paid_at).replace("Z", "+00:00"))
                local = dt.astimezone(ZoneInfo("America/Santo_Domingo"))
                fecha_str = local.strftime("%d/%m/%Y")
                hora_str = local.strftime("%H:%M:%S")
            except Exception:
                fecha_str = str(paid_at)[:10]

        cust = b.get("customer") or {}
        rnc = cust.get("rnc") or b.get("fiscal_id") or b.get("rnc") or ""
        razon = cust.get("razon_social") or b.get("razon_social") or cust.get("name") or ""

        values = [
            b.get("transaction_number") or b.get("fiscal_id") or "",
            b.get("ecf_encf") or b.get("ncf") or "",
            b.get("ecf_type") or "E32",
            razon,
            rnc,
            round(float(b.get("subtotal") or 0), 2),
            round(float(b.get("itbis") or 0), 2),
            round(float(b.get("tip") or b.get("service_charge") or 0), 2),
            round(float(b.get("total") or 0), 2),
            _payment_amount(b, ["efectivo", "cash"]),
            _payment_amount(b, ["visa"]),
            _payment_amount(b, ["master", "mc "]),
            _payment_amount(b, ["amex", "american"]),
            _payment_amount(b, ["transfer", "transferencia"]),
            fecha_str,
            estado,
        ]
        if include_operational:
            values += [
                b.get("cashier_name") or "",
                b.get("waiter_name") or "",
                b.get("table_number") or "",
                hora_str,
            ]

        for col_idx, val in enumerate(values, start=1):
            c = ws2.cell(row=row, column=col_idx, value=val)
            c.border = BORDER
            if col_idx in (1,):
                c.alignment = CENTER
            elif col_idx in (6, 7, 8, 9, 10, 11, 12, 13, 14):
                c.alignment = RIGHT
                c.number_format = '#,##0.00'
            elif col_idx == 16:
                _paint_estado_cell(c, estado)
            else:
                c.alignment = LEFT
        row += 1

    # Totals row
    if bills:
        tot_cell = ws2.cell(row=row, column=1, value="TOTAL")
        tot_cell.fill = TOTAL_FILL
        tot_cell.font = TOTAL_FONT
        tot_cell.alignment = CENTER
        for col_idx in range(2, len(headers) + 1):
            cell = ws2.cell(row=row, column=col_idx)
            cell.fill = TOTAL_FILL
            cell.font = TOTAL_FONT
            if col_idx in (6, 7, 8, 9, 10, 11, 12, 13, 14):
                col_letter = get_column_letter(col_idx)
                cell.value = f"=SUM({col_letter}6:{col_letter}{row - 1})"
                cell.number_format = '#,##0.00'
                cell.alignment = RIGHT

    ws2.freeze_panes = "A6"
    _autosize(ws2)

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _build_compras_workbook(expenses: list, period_label: str, business: dict) -> BytesIO:
    wb = Workbook()
    ws = wb.active
    ws.title = "RESUMEN"
    _write_title_block(ws, "REPORTE 606 — COMPRAS", "Gastos y compras a proveedores", period_label, business["name"])

    total_count = len(expenses)
    total_neto = total_itbis = total_total = 0.0
    by_supplier = {}
    for e in expenses:
        total_neto += float(e.get("subtotal") or 0)
        total_itbis += float(e.get("itbis") or 0)
        total_total += float(e.get("total") or 0)
        s = e.get("supplier_name") or "Sin proveedor"
        by_supplier[s] = by_supplier.get(s, 0) + float(e.get("total") or 0)

    row = 6
    ws.cell(row=row, column=1, value="📊 RESUMEN").font = Font(bold=True, size=12, color="1F4E78")
    row += 1
    for label, val, fmt in [
        ("Total compras registradas", total_count, "#,##0"),
        ("Total NETO (RD$)", round(total_neto, 2), "#,##0.00"),
        ("Total ITBIS pagado (RD$)", round(total_itbis, 2), "#,##0.00"),
        ("TOTAL GENERAL (RD$)", round(total_total, 2), "#,##0.00"),
    ]:
        ws.cell(row=row, column=1, value=label).alignment = LEFT
        c = ws.cell(row=row, column=2, value=val)
        c.alignment = RIGHT
        c.number_format = fmt
        c.font = Font(bold=True)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="🏢 POR PROVEEDOR").font = Font(bold=True, size=12, color="1F4E78")
    row += 1
    for name, amt in sorted(by_supplier.items(), key=lambda x: -x[1]):
        ws.cell(row=row, column=1, value=name).alignment = LEFT
        c = ws.cell(row=row, column=2, value=round(amt, 2))
        c.alignment = RIGHT
        c.number_format = '#,##0.00'
        row += 1

    ws.column_dimensions["A"].width = 40
    ws.column_dimensions["B"].width = 20

    # DETALLE
    ws2 = wb.create_sheet("DETALLE")
    _write_title_block(ws2, "REPORTE 606 — DETALLE", "Compras y gastos", period_label, business["name"])
    headers = ["# Gasto", "NCF Proveedor", "Tipo NCF", "Proveedor", "RNC Proveedor",
               "Neto", "ITBIS", "Total", "Forma Pago", "Categoría", "Fecha", "Referencia"]
    _apply_header(ws2, 5, headers)
    row = 6
    for e in expenses:
        fecha = e.get("expense_date") or ""
        fecha_str = str(fecha)[:10]
        values = [
            e.get("expense_number") or e.get("id", "")[:8],
            e.get("ncf") or "",
            e.get("ncf_type") or "",
            e.get("supplier_name") or "",
            e.get("supplier_rnc") or "",
            round(float(e.get("subtotal") or 0), 2),
            round(float(e.get("itbis") or 0), 2),
            round(float(e.get("total") or 0), 2),
            e.get("payment_method") or "",
            e.get("category") or "",
            fecha_str,
            e.get("reference") or "",
        ]
        for col_idx, val in enumerate(values, start=1):
            c = ws2.cell(row=row, column=col_idx, value=val)
            c.border = BORDER
            if col_idx in (6, 7, 8):
                c.alignment = RIGHT
                c.number_format = '#,##0.00'
            else:
                c.alignment = LEFT
        row += 1
    if expenses:
        tot_cell = ws2.cell(row=row, column=1, value="TOTAL")
        tot_cell.fill = TOTAL_FILL
        tot_cell.font = TOTAL_FONT
        tot_cell.alignment = CENTER
        for col_idx in range(2, len(headers) + 1):
            cell = ws2.cell(row=row, column=col_idx)
            cell.fill = TOTAL_FILL
            cell.font = TOTAL_FONT
            if col_idx in (6, 7, 8):
                col_letter = get_column_letter(col_idx)
                cell.value = f"=SUM({col_letter}6:{col_letter}{row - 1})"
                cell.number_format = '#,##0.00'
                cell.alignment = RIGHT
    ws2.freeze_panes = "A6"
    _autosize(ws2)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ═══════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════

def _period_label(date_from: str, date_to: str) -> str:
    return f"Del {date_from} al {date_to}"


def _xlsx_response(buf: BytesIO, filename: str) -> StreamingResponse:
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/607")
async def report_607(
    date_from: str = Query(..., description="YYYY-MM-DD"),
    date_to: str = Query(..., description="YYYY-MM-DD"),
    user=Depends(get_current_user),
):
    """Reporte 607 — Ventas a DGII (formato detallado)."""
    bills = await _fetch_sales_bills(date_from, date_to)
    # 607 covers ALL sales (consumidor final + crédito fiscal + gubernamental)
    bills_607 = [b for b in bills if b.get("paid_at")]
    business = await _get_business_info()
    buf = _build_ventas_workbook(
        title="REPORTE 607 — VENTAS DGII",
        subtitle="Detalle de ventas fiscales",
        bills=bills_607,
        period_label=_period_label(date_from, date_to),
        business=business,
    )
    fname = f"607_{date_from}_al_{date_to}.xlsx"
    return _xlsx_response(buf, fname)


@router.get("/606")
async def report_606(
    date_from: str = Query(...),
    date_to: str = Query(...),
    user=Depends(get_current_user),
):
    """Reporte 606 — Compras DGII (formato detallado)."""
    expenses = await _fetch_expenses(date_from, date_to)
    business = await _get_business_info()
    buf = _build_compras_workbook(expenses, _period_label(date_from, date_to), business)
    fname = f"606_{date_from}_al_{date_to}.xlsx"
    return _xlsx_response(buf, fname)


@router.get("/608")
async def report_608(
    date_from: str = Query(...),
    date_to: str = Query(...),
    user=Depends(get_current_user),
):
    """Reporte 608 — Anulaciones / Notas de Crédito (formato detallado)."""
    bills = await _fetch_sales_bills(date_from, date_to)
    notes = await _fetch_credit_notes(date_from, date_to)
    business = await _get_business_info()

    # Build "virtual bills" from credit_notes + REJECTED bills
    virtual = []
    for n in notes:
        virtual.append({
            "transaction_number": n.get("transaction_number") or n.get("id", "")[:8],
            "ecf_encf": n.get("encf") or n.get("ncf") or "",
            "ecf_type": "E34",
            "customer": {"rnc": n.get("customer_rnc") or "", "razon_social": n.get("customer_name") or ""},
            "subtotal": n.get("subtotal") or 0,
            "itbis": n.get("itbis") or 0,
            "tip": 0,
            "total": n.get("total") or 0,
            "payments": [],
            "paid_at": n.get("created_at"),
            "ecf_status": n.get("ecf_status") or "FINISHED",
            "cashier_name": n.get("created_by_name") or "",
            "ecf_reject_reason": n.get("ecf_reject_reason"),
        })
    rejected = [b for b in bills if (b.get("ecf_status") or "").upper() == "REJECTED"]
    combined = virtual + rejected

    buf = _build_ventas_workbook(
        title="REPORTE 608 — ANULACIONES",
        subtitle="Notas de Crédito (E34) + Facturas Rechazadas",
        bills=combined,
        period_label=_period_label(date_from, date_to),
        business=business,
    )
    fname = f"608_{date_from}_al_{date_to}.xlsx"
    return _xlsx_response(buf, fname)


@router.get("/ventas-generales")
async def report_ventas_generales(
    date_from: str = Query(...),
    date_to: str = Query(...),
    user=Depends(get_current_user),
):
    """Reporte General de Ventas — Todas las facturas del período con detalles operacionales."""
    bills = await _fetch_sales_bills(date_from, date_to)
    business = await _get_business_info()
    buf = _build_ventas_workbook(
        title="REPORTE GENERAL DE VENTAS",
        subtitle="Todas las facturas del período",
        bills=bills,
        period_label=_period_label(date_from, date_to),
        business=business,
        include_operational=True,
    )
    fname = f"ventas_generales_{date_from}_al_{date_to}.xlsx"
    return _xlsx_response(buf, fname)


# ═══════════════════════════════════════════════════════════════
# Ventas por Categoría — Hierarchical report (HTML/PDF/Excel)
# ═══════════════════════════════════════════════════════════════

async def _fetch_category_breakdown(date_from: str, date_to: str) -> list:
    """Fetch category → products breakdown directly (avoids FastAPI endpoint invocation issues)."""
    bills = await db.bills.find(
        {"status": "paid", "training_mode": {"$ne": True}}, {"_id": 0}
    ).to_list(10000)
    filtered = [b for b in bills if date_from <= b.get("business_date", (b.get("paid_at") or "")[:10]) <= date_to]

    products = await db.products.find({}, {"_id": 0}).to_list(5000)
    prod_map = {p["id"]: p for p in products}
    prod_name_map = {p.get("name", "").lower(): p for p in products}
    cats_db = await db.categories.find({}, {"_id": 0}).to_list(200)
    cat_name_map = {c["id"]: c.get("name", c["id"]) for c in cats_db}

    categories = {}
    for bill in filtered:
        for item in bill.get("items", []):
            prod = prod_map.get(item.get("product_id"), prod_map.get(item.get("item_id"), {}))
            if not prod:
                prod = prod_name_map.get((item.get("product_name") or "").lower(), {})
            cat = prod.get("category_id", "sin_categoria")
            prod_name = item.get("product_name") or prod.get("name") or "Sin Nombre"
            if cat not in categories:
                categories[cat] = {"category": cat, "total": 0, "quantity": 0, "products": {}}
            item_total = item.get("total", item.get("subtotal", item.get("unit_price", 0) * item.get("quantity", 1)))
            item_qty = item.get("quantity", 1)
            categories[cat]["total"] += item_total
            categories[cat]["quantity"] += item_qty
            p_bucket = categories[cat]["products"].setdefault(prod_name, {"name": prod_name, "total": 0, "quantity": 0})
            p_bucket["total"] += item_total
            p_bucket["quantity"] += item_qty

    result = []
    for cat_id, data in categories.items():
        data["category"] = cat_name_map.get(cat_id, cat_id if len(str(cat_id)) < 30 else "Sin Categoría")
        data["total"] = round(data["total"], 2)
        plist = [{"name": p["name"], "total": round(p["total"], 2), "quantity": p["quantity"]}
                 for p in data["products"].values()]
        plist.sort(key=lambda x: x["name"].upper())
        data["products"] = plist
        result.append(data)
    result.sort(key=lambda x: -x["total"])
    return result


def _build_category_xlsx(data: list, period_label: str, business: dict) -> BytesIO:
    """
    Build hierarchical Ventas por Categoría XLSX.
    Columns: Descripción | Total | Cantidad
    Layout: Category (bold) → Products (indent) → Subtotal (bold, SUM formula) → blank row
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Ventas por Categoría"

    # Header block (sober B/W)
    title_font = Font(bold=True, size=14, color="000000")
    subtitle_font = Font(size=10, color="555555")

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=3)
    c = ws.cell(row=1, column=1, value=business["name"])
    c.font = title_font; c.alignment = CENTER
    ws.row_dimensions[1].height = 22

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=3)
    c = ws.cell(row=2, column=1, value=f"RNC: {business['rnc']}")
    c.font = subtitle_font; c.alignment = CENTER

    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=3)
    c = ws.cell(row=3, column=1, value=f"Ventas por Categoría · {period_label}")
    c.font = Font(bold=True, size=11); c.alignment = CENTER

    ws.merge_cells(start_row=4, start_column=1, end_row=4, end_column=3)
    c = ws.cell(row=4, column=1, value=f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    c.font = subtitle_font; c.alignment = CENTER

    # Column headers (B/W: black fill, white text)
    headers = ["Descripción", "Total", "Cantidad"]
    bw_header_fill = PatternFill("solid", fgColor="111111")
    bw_header_font = Font(bold=True, color="FFFFFF", size=11)
    for idx, h in enumerate(headers, start=1):
        cc = ws.cell(row=6, column=idx, value=h)
        cc.fill = bw_header_fill; cc.font = bw_header_font
        cc.alignment = CENTER; cc.border = BORDER

    row = 7
    grand_total_cells = []  # rows containing category subtotals (for grand-total SUM)
    for cat in data:
        # Category name (bold)
        c_name = ws.cell(row=row, column=1, value=cat["category"])
        c_name.font = Font(bold=True, size=11)
        c_name.alignment = LEFT
        row += 1

        # Products
        product_first_row = row
        for p in cat.get("products", []):
            # Indent via cell alignment
            pc1 = ws.cell(row=row, column=1, value=p["name"])
            pc1.alignment = Alignment(horizontal="left", vertical="center", indent=2)
            pc2 = ws.cell(row=row, column=2, value=round(p["total"], 2))
            pc2.number_format = '#,##0.00'; pc2.alignment = RIGHT
            pc3 = ws.cell(row=row, column=3, value=p["quantity"])
            pc3.alignment = RIGHT
            row += 1
        product_last_row = row - 1

        # Subtotal row (same category name repeated, bold, with SUM formula)
        sub1 = ws.cell(row=row, column=1, value=cat["category"])
        sub1.font = Font(bold=True, size=11); sub1.alignment = LEFT
        sub1.border = Border(top=Side(style="thin", color="000000"))
        if product_last_row >= product_first_row:
            sub2 = ws.cell(row=row, column=2, value=f"=SUM(B{product_first_row}:B{product_last_row})")
            sub3 = ws.cell(row=row, column=3, value=f"=SUM(C{product_first_row}:C{product_last_row})")
        else:
            sub2 = ws.cell(row=row, column=2, value=0)
            sub3 = ws.cell(row=row, column=3, value=0)
        sub2.font = Font(bold=True); sub2.number_format = '#,##0.00'; sub2.alignment = RIGHT
        sub2.border = Border(top=Side(style="thin", color="000000"))
        sub3.font = Font(bold=True); sub3.alignment = RIGHT
        sub3.border = Border(top=Side(style="thin", color="000000"))
        grand_total_cells.append(row)
        row += 1

        # Blank spacer
        row += 1

    # Grand total row
    gt1 = ws.cell(row=row, column=1, value="TOTAL GENERAL")
    gt1.font = Font(bold=True, size=12)
    gt1.border = Border(top=Side(style="medium", color="000000"))
    gt1.alignment = LEFT
    if grand_total_cells:
        cells_total = ",".join([f"B{r}" for r in grand_total_cells])
        cells_qty = ",".join([f"C{r}" for r in grand_total_cells])
        gt2 = ws.cell(row=row, column=2, value=f"=SUM({cells_total})")
        gt3 = ws.cell(row=row, column=3, value=f"=SUM({cells_qty})")
    else:
        gt2 = ws.cell(row=row, column=2, value=0)
        gt3 = ws.cell(row=row, column=3, value=0)
    gt2.font = Font(bold=True, size=12); gt2.number_format = '#,##0.00'; gt2.alignment = RIGHT
    gt2.border = Border(top=Side(style="medium", color="000000"))
    gt3.font = Font(bold=True, size=12); gt3.alignment = RIGHT
    gt3.border = Border(top=Side(style="medium", color="000000"))

    # Footer row
    row += 2
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=3)
    footer = ws.cell(row=row, column=1,
                     value=f"Documento generado automáticamente por {business['name']} | {datetime.now().strftime('%d/%m/%Y %H:%M')} | Válido para auditoría interna")
    footer.font = Font(italic=True, size=9, color="555555")
    footer.alignment = CENTER

    ws.column_dimensions["A"].width = 45
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = 12
    ws.freeze_panes = "A7"

    buf = BytesIO()
    wb.save(buf); buf.seek(0)
    return buf


def _build_category_html(data: list, period_label: str, business: dict, for_pdf: bool = False) -> str:
    """Build sober B/W HTML for PDF generation. for_pdf=True applies print-optimized styles."""
    rows = []
    grand_total = 0.0
    grand_qty = 0

    for cat in data:
        cat_total = sum(p["total"] for p in cat.get("products", []))
        cat_qty = sum(p["quantity"] for p in cat.get("products", []))
        grand_total += cat_total
        grand_qty += cat_qty
        rows.append(f'<tr class="cat-header"><td colspan="3"><strong>{cat["category"]}</strong></td></tr>')
        for p in cat.get("products", []):
            rows.append(
                f'<tr class="prod-row">'
                f'<td class="indent">{p["name"]}</td>'
                f'<td class="money">{p["total"]:,.2f}</td>'
                f'<td class="qty">{p["quantity"]}</td></tr>'
            )
        rows.append(
            f'<tr class="cat-subtotal">'
            f'<td><strong>{cat["category"]}</strong></td>'
            f'<td class="money"><strong>{cat_total:,.2f}</strong></td>'
            f'<td class="qty"><strong>{cat_qty}</strong></td></tr>'
        )
        rows.append('<tr class="spacer"><td colspan="3">&nbsp;</td></tr>')

    rows.append(
        f'<tr class="grand-total">'
        f'<td><strong>TOTAL GENERAL</strong></td>'
        f'<td class="money"><strong>{grand_total:,.2f}</strong></td>'
        f'<td class="qty"><strong>{grand_qty}</strong></td></tr>'
    )

    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Ventas por Categoría</title>
      <style>
        @page {{ size: Letter; margin: 18mm 14mm; }}
        * {{ box-sizing: border-box; }}
        body {{ font-family: 'Helvetica', 'Arial', sans-serif; color: #000; font-size: 11pt; margin: 0; padding: 0; }}
        .header {{ text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }}
        .header h1 {{ margin: 0; font-size: 16pt; color: #000; }}
        .header .rnc {{ color: #444; font-size: 10pt; margin-top: 4px; }}
        .header .title {{ font-size: 12pt; font-weight: bold; margin-top: 6px; }}
        .header .date {{ color: #666; font-size: 9pt; margin-top: 2px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
        thead th {{ background: #111; color: #fff; padding: 6px 8px; text-align: left; font-size: 10pt; }}
        thead th.money, thead th.qty {{ text-align: right; }}
        td {{ padding: 4px 8px; font-size: 10pt; vertical-align: middle; }}
        td.money {{ text-align: right; font-variant-numeric: tabular-nums; }}
        td.qty {{ text-align: right; font-variant-numeric: tabular-nums; width: 80px; }}
        td.indent {{ padding-left: 24px; }}
        tr.cat-header td {{ background: transparent; border-top: 1px solid #000; padding-top: 6px; }}
        tr.cat-subtotal td {{ border-top: 1px solid #000; padding-top: 4px; }}
        tr.spacer td {{ padding: 2px; }}
        tr.grand-total td {{ border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 8px; background: #f5f5f5; font-size: 11pt; }}
        .footer {{ margin-top: 24px; text-align: center; color: #666; font-size: 8pt; font-style: italic; }}
        @media print {{ body {{ background: white; }} tr.grand-total td {{ background: #fff; }} }}
      </style>
    </head>
    <body>
      <div class="header">
        <h1>{business['name']}</h1>
        <div class="rnc">RNC: {business['rnc']}</div>
        <div class="title">Ventas por Categoría</div>
        <div class="date">{period_label} · Generado: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Descripción</th>
            <th class="money">Total</th>
            <th class="qty">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {''.join(rows)}
        </tbody>
      </table>
      <div class="footer">
        Documento generado automáticamente por {business['name']} | {datetime.now().strftime('%d/%m/%Y %H:%M')} | Válido para auditoría interna
      </div>
    </body>
    </html>
    """


@router.get("/ventas-por-categoria/xlsx")
async def ventas_por_categoria_xlsx(
    date_from: str = Query(...),
    date_to: str = Query(...),
    user=Depends(get_current_user),
):
    data = await _fetch_category_breakdown(date_from, date_to)
    business = await _get_business_info()
    buf = _build_category_xlsx(data, _period_label(date_from, date_to), business)
    fname = f"VentasPorCategoria_{date_from}_al_{date_to}.xlsx"
    return _xlsx_response(buf, fname)


@router.get("/ventas-por-categoria/pdf")
async def ventas_por_categoria_pdf(
    date_from: str = Query(...),
    date_to: str = Query(...),
    user=Depends(get_current_user),
):
    """Server-side PDF generation via WeasyPrint (stable, pure-Python, no Chromium needed)."""
    try:
        from weasyprint import HTML
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"WeasyPrint no disponible: {e}")

    data = await _fetch_category_breakdown(date_from, date_to)
    business = await _get_business_info()
    html = _build_category_html(data, _period_label(date_from, date_to), business, for_pdf=True)
    pdf_bytes = HTML(string=html).write_pdf()
    fname = f"VentasPorCategoria_{date_from}_al_{date_to}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )



# ═══════════════════════════════════════════════════════════════
# CIERRE DE CAJA — Hierarchical (Empleado → Turno → Método → Trans)
# ═══════════════════════════════════════════════════════════════

async def _fetch_cash_close_tree(date_from: str, date_to: str) -> dict:
    """Reuse the pure hierarchical helper from reports router."""
    from routers.reports import _cash_close_hierarchical_impl  # local import to avoid circular at module load
    return await _cash_close_hierarchical_impl(date_from=date_from, date_to=date_to)


def _fmt_dt(s: str) -> str:
    """Format ISO datetime to 'DD/MM/YYYY HH:MM' (fallbacks to raw value)."""
    if not s:
        return "-"
    try:
        if "T" in s:
            base = s.split(".")[0].replace("Z", "")
            return datetime.fromisoformat(base).strftime("%d/%m/%Y %I:%M %p")
        return s
    except Exception:
        return s


def _build_cash_close_xlsx(tree: dict, period_label: str, business: dict, detailed: bool) -> BytesIO:
    """Build XLSX with Employee → Shift → Payment Method (→ Transactions if detailed).
    Uses openpyxl row outline grouping and real SUM() formulas for subtotals/totals.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Cierre de Caja"

    BLACK_FILL = PatternFill("solid", fgColor="111111")
    WHITE_FONT = Font(bold=True, color="FFFFFF", size=11)
    BOLD = Font(bold=True)
    THIN_BLACK = Side(style="thin", color="000000")

    # Title block
    ws.cell(row=1, column=1, value=business.get("name", "VexlyPOS")).font = Font(bold=True, size=14)
    ws.cell(row=2, column=1, value=f"RNC: {business.get('rnc','')}").font = Font(size=10, color="555555")
    ws.cell(row=3, column=1, value=f"Cierre de Caja — {'Detallado' if detailed else 'Resumido'}").font = Font(bold=True, size=12)
    ws.cell(row=4, column=1, value=period_label).font = Font(size=10, color="555555")

    # Header row (row 6)
    headers = ["Descripción", "Shift Start", "Shift End", "Trans #", "Total", "Propinas", "Total + Propinas"]
    for i, h in enumerate(headers, start=1):
        c = ws.cell(row=6, column=i, value=h)
        c.font = WHITE_FONT
        c.fill = BLACK_FILL
        c.alignment = CENTER if i >= 4 else LEFT
        c.border = Border(top=THIN_BLACK, bottom=THIN_BLACK, left=THIN_BLACK, right=THIN_BLACK)

    row = 7
    employee_total_rows = []

    for emp in tree.get("employees", []):
        # Employee header (outlineLevel 0)
        ws.cell(row=row, column=1, value=emp["name"]).font = Font(bold=True, size=11)
        row += 1

        shift_total_rows_for_emp = []

        for sh in emp.get("shifts", []):
            # Shift header (outlineLevel 1)
            c = ws.cell(row=row, column=1, value="   Turno")
            c.font = BOLD
            ws.cell(row=row, column=2, value=_fmt_dt(sh.get("shift_start"))).font = Font(size=10)
            ws.cell(row=row, column=3, value=_fmt_dt(sh.get("shift_end"))).font = Font(size=10)
            ws.row_dimensions[row].outlineLevel = 1
            row += 1

            pm_subtotal_rows_for_shift = []

            for pm in sh.get("payment_methods", []):
                # Payment method header (outlineLevel 2)
                ws.cell(row=row, column=1, value=f"      {pm['name']}").font = BOLD
                ws.row_dimensions[row].outlineLevel = 2
                row += 1

                tx_rows = []
                if detailed:
                    for tx in pm.get("transactions", []):
                        ws.cell(row=row, column=1, value="         " + (tx.get("paid_at") or ""))
                        ws.cell(row=row, column=4, value=tx.get("trans_number")).alignment = CENTER
                        t_cell = ws.cell(row=row, column=5, value=float(tx.get("total") or 0))
                        p_cell = ws.cell(row=row, column=6, value=float(tx.get("tips") or 0))
                        tp_cell = ws.cell(row=row, column=7, value=float(tx.get("total_with_tips") or 0))
                        for cc in (t_cell, p_cell, tp_cell):
                            cc.number_format = '#,##0.00'
                            cc.alignment = RIGHT
                        ws.row_dimensions[row].outlineLevel = 3
                        tx_rows.append(row)
                        row += 1

                # Payment method subtotal
                sub = pm.get("subtotal", {})
                c1 = ws.cell(row=row, column=1, value=f"      {pm['name']} [{sub.get('count', 0)}]")
                c1.font = BOLD
                if detailed and tx_rows:
                    ws.cell(row=row, column=5, value=f"=SUM(E{tx_rows[0]}:E{tx_rows[-1]})").number_format = '#,##0.00'
                    ws.cell(row=row, column=6, value=f"=SUM(F{tx_rows[0]}:F{tx_rows[-1]})").number_format = '#,##0.00'
                    ws.cell(row=row, column=7, value=f"=SUM(G{tx_rows[0]}:G{tx_rows[-1]})").number_format = '#,##0.00'
                else:
                    ws.cell(row=row, column=5, value=float(sub.get("total", 0) or 0)).number_format = '#,##0.00'
                    ws.cell(row=row, column=6, value=float(sub.get("tips", 0) or 0)).number_format = '#,##0.00'
                    ws.cell(row=row, column=7, value=float(sub.get("total_with_tips", 0) or 0)).number_format = '#,##0.00'
                for col in (5, 6, 7):
                    cc = ws.cell(row=row, column=col)
                    cc.font = BOLD
                    cc.alignment = RIGHT
                    cc.border = Border(top=THIN_BLACK)
                ws.row_dimensions[row].outlineLevel = 2
                pm_subtotal_rows_for_shift.append(row)
                row += 1

            # Shift totals
            sht = sh.get("shift_totals", {})
            c1 = ws.cell(row=row, column=1, value=f"   Shift Totals [{sht.get('count', 0)}]")
            c1.font = Font(bold=True, size=11)
            if pm_subtotal_rows_for_shift:
                cells_e = ",".join([f"E{r}" for r in pm_subtotal_rows_for_shift])
                cells_f = ",".join([f"F{r}" for r in pm_subtotal_rows_for_shift])
                cells_g = ",".join([f"G{r}" for r in pm_subtotal_rows_for_shift])
                ws.cell(row=row, column=5, value=f"=SUM({cells_e})").number_format = '#,##0.00'
                ws.cell(row=row, column=6, value=f"=SUM({cells_f})").number_format = '#,##0.00'
                ws.cell(row=row, column=7, value=f"=SUM({cells_g})").number_format = '#,##0.00'
            else:
                ws.cell(row=row, column=5, value=0).number_format = '#,##0.00'
                ws.cell(row=row, column=6, value=0).number_format = '#,##0.00'
                ws.cell(row=row, column=7, value=0).number_format = '#,##0.00'
            for col in (5, 6, 7):
                cc = ws.cell(row=row, column=col)
                cc.font = Font(bold=True)
                cc.alignment = RIGHT
                cc.border = Border(top=THIN_BLACK, bottom=THIN_BLACK)
            ws.row_dimensions[row].outlineLevel = 1
            shift_total_rows_for_emp.append(row)
            row += 1

        # Employee total
        et = emp.get("employee_totals", {})
        c1 = ws.cell(row=row, column=1, value=f"TOTAL EMPLEADO [{et.get('count', 0)}]")
        c1.font = Font(bold=True, size=11)
        if shift_total_rows_for_emp:
            cells_e = ",".join([f"E{r}" for r in shift_total_rows_for_emp])
            cells_f = ",".join([f"F{r}" for r in shift_total_rows_for_emp])
            cells_g = ",".join([f"G{r}" for r in shift_total_rows_for_emp])
            ws.cell(row=row, column=5, value=f"=SUM({cells_e})").number_format = '#,##0.00'
            ws.cell(row=row, column=6, value=f"=SUM({cells_f})").number_format = '#,##0.00'
            ws.cell(row=row, column=7, value=f"=SUM({cells_g})").number_format = '#,##0.00'
        else:
            ws.cell(row=row, column=5, value=0).number_format = '#,##0.00'
            ws.cell(row=row, column=6, value=0).number_format = '#,##0.00'
            ws.cell(row=row, column=7, value=0).number_format = '#,##0.00'
        for col in (5, 6, 7):
            cc = ws.cell(row=row, column=col)
            cc.font = Font(bold=True)
            cc.alignment = RIGHT
            cc.border = Border(top=Side(style="medium", color="000000"), bottom=THIN_BLACK)
        employee_total_rows.append(row)
        row += 2  # spacer

    # Grand total
    gt = tree.get("grand_totals", {})
    c1 = ws.cell(row=row, column=1, value=f"TOTAL GENERAL [{gt.get('count', 0)}]")
    c1.font = Font(bold=True, size=12)
    if employee_total_rows:
        cells_e = ",".join([f"E{r}" for r in employee_total_rows])
        cells_f = ",".join([f"F{r}" for r in employee_total_rows])
        cells_g = ",".join([f"G{r}" for r in employee_total_rows])
        ws.cell(row=row, column=5, value=f"=SUM({cells_e})").number_format = '#,##0.00'
        ws.cell(row=row, column=6, value=f"=SUM({cells_f})").number_format = '#,##0.00'
        ws.cell(row=row, column=7, value=f"=SUM({cells_g})").number_format = '#,##0.00'
    else:
        for col, v in ((5, 0), (6, 0), (7, 0)):
            ws.cell(row=row, column=col, value=v).number_format = '#,##0.00'
    for col in (5, 6, 7):
        cc = ws.cell(row=row, column=col)
        cc.font = Font(bold=True, size=12)
        cc.alignment = RIGHT
        cc.border = Border(top=Side(style="medium", color="000000"), bottom=Side(style="medium", color="000000"))

    # Footer
    row += 2
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=7)
    footer = ws.cell(
        row=row, column=1,
        value=f"Documento generado por {business.get('name','')} | {datetime.now().strftime('%d/%m/%Y %H:%M')} | Uso interno"
    )
    footer.font = Font(italic=True, size=9, color="555555")
    footer.alignment = CENTER

    ws.column_dimensions["A"].width = 42
    ws.column_dimensions["B"].width = 20
    ws.column_dimensions["C"].width = 20
    ws.column_dimensions["D"].width = 10
    ws.column_dimensions["E"].width = 14
    ws.column_dimensions["F"].width = 12
    ws.column_dimensions["G"].width = 16
    ws.freeze_panes = "A7"
    ws.sheet_properties.outlinePr.summaryBelow = True

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _build_cash_close_html(tree: dict, period_label: str, business: dict, detailed: bool) -> str:
    """Print-friendly B/W HTML for PDF generation."""
    rows = []
    for emp in tree.get("employees", []):
        rows.append(
            f'<tr class="emp-header"><td colspan="7"><strong>{emp["name"]}</strong></td></tr>'
        )
        for sh in emp.get("shifts", []):
            rows.append(
                f'<tr class="shift-header">'
                f'<td class="ind1"><em>Turno</em></td>'
                f'<td>{_fmt_dt(sh.get("shift_start"))}</td>'
                f'<td>{_fmt_dt(sh.get("shift_end"))}</td>'
                f'<td colspan="4"></td></tr>'
            )
            for pm in sh.get("payment_methods", []):
                rows.append(
                    f'<tr class="pm-header"><td class="ind2"><strong>{pm["name"]}</strong></td>'
                    f'<td colspan="6"></td></tr>'
                )
                if detailed:
                    for tx in pm.get("transactions", []):
                        rows.append(
                            f'<tr class="tx">'
                            f'<td class="ind3">{_fmt_dt(tx.get("paid_at"))}</td>'
                            f'<td></td><td></td>'
                            f'<td class="center">{tx.get("trans_number", "")}</td>'
                            f'<td class="money">{float(tx.get("total") or 0):,.2f}</td>'
                            f'<td class="money">{float(tx.get("tips") or 0):,.2f}</td>'
                            f'<td class="money">{float(tx.get("total_with_tips") or 0):,.2f}</td></tr>'
                        )
                sub = pm.get("subtotal", {})
                rows.append(
                    f'<tr class="pm-sub">'
                    f'<td class="ind2"><strong>{pm["name"]} [{sub.get("count", 0)}]</strong></td>'
                    f'<td colspan="3"></td>'
                    f'<td class="money"><strong>{float(sub.get("total") or 0):,.2f}</strong></td>'
                    f'<td class="money"><strong>{float(sub.get("tips") or 0):,.2f}</strong></td>'
                    f'<td class="money"><strong>{float(sub.get("total_with_tips") or 0):,.2f}</strong></td></tr>'
                )
            sht = sh.get("shift_totals", {})
            rows.append(
                f'<tr class="shift-sub">'
                f'<td class="ind1"><strong>Shift Totals [{sht.get("count", 0)}]</strong></td>'
                f'<td colspan="3"></td>'
                f'<td class="money"><strong>{float(sht.get("total") or 0):,.2f}</strong></td>'
                f'<td class="money"><strong>{float(sht.get("tips") or 0):,.2f}</strong></td>'
                f'<td class="money"><strong>{float(sht.get("total_with_tips") or 0):,.2f}</strong></td></tr>'
            )
        et = emp.get("employee_totals", {})
        rows.append(
            f'<tr class="emp-total">'
            f'<td><strong>TOTAL EMPLEADO [{et.get("count", 0)}]</strong></td>'
            f'<td colspan="3"></td>'
            f'<td class="money"><strong>{float(et.get("total") or 0):,.2f}</strong></td>'
            f'<td class="money"><strong>{float(et.get("tips") or 0):,.2f}</strong></td>'
            f'<td class="money"><strong>{float(et.get("total_with_tips") or 0):,.2f}</strong></td></tr>'
        )
        rows.append('<tr class="spacer"><td colspan="7">&nbsp;</td></tr>')

    gt = tree.get("grand_totals", {})
    rows.append(
        f'<tr class="grand-total">'
        f'<td><strong>TOTAL GENERAL [{gt.get("count", 0)}]</strong></td>'
        f'<td colspan="3"></td>'
        f'<td class="money"><strong>{float(gt.get("total") or 0):,.2f}</strong></td>'
        f'<td class="money"><strong>{float(gt.get("tips") or 0):,.2f}</strong></td>'
        f'<td class="money"><strong>{float(gt.get("total_with_tips") or 0):,.2f}</strong></td></tr>'
    )

    view_label = "Detallado" if detailed else "Resumido"
    return f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Cierre de Caja — {view_label}</title>
      <style>
        @page {{ size: Letter; margin: 16mm 12mm; }}
        * {{ box-sizing: border-box; }}
        body {{ font-family: 'Helvetica', 'Arial', sans-serif; color: #000; font-size: 10pt; margin: 0; padding: 0; }}
        .header {{ text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }}
        .header h1 {{ margin: 0; font-size: 15pt; color: #000; }}
        .header .rnc {{ color: #444; font-size: 9pt; margin-top: 2px; }}
        .header .title {{ font-size: 11pt; font-weight: bold; margin-top: 4px; }}
        .header .date {{ color: #666; font-size: 9pt; margin-top: 2px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 6px; }}
        thead th {{ background: #111; color: #fff; padding: 5px 6px; font-size: 9pt; }}
        thead th.money {{ text-align: right; }}
        td {{ padding: 3px 6px; font-size: 9pt; vertical-align: middle; }}
        td.money {{ text-align: right; font-variant-numeric: tabular-nums; }}
        td.center {{ text-align: center; }}
        td.ind1 {{ padding-left: 14px; }}
        td.ind2 {{ padding-left: 28px; }}
        td.ind3 {{ padding-left: 42px; color: #333; }}
        tr.emp-header td {{ border-top: 1.5px solid #000; padding-top: 6px; font-size: 10pt; }}
        tr.shift-header td {{ border-top: 1px solid #888; }}
        tr.pm-sub td {{ border-top: 1px solid #000; }}
        tr.shift-sub td {{ border-top: 1px solid #000; border-bottom: 1px solid #000; }}
        tr.emp-total td {{ border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 5px 6px; }}
        tr.spacer td {{ padding: 3px; }}
        tr.grand-total td {{ border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 7px 6px; font-size: 11pt; }}
        .footer {{ margin-top: 16px; text-align: center; color: #555; font-size: 8pt; font-style: italic; }}
        @media print {{ body {{ background: white; }} thead {{ display: table-header-group; }} tr {{ page-break-inside: avoid; }} }}
      </style>
    </head>
    <body>
      <div class="header">
        <h1>{business['name']}</h1>
        <div class="rnc">RNC: {business['rnc']}</div>
        <div class="title">Cierre de Caja — {view_label}</div>
        <div class="date">{period_label} · Generado: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Descripción</th>
            <th>Shift Start</th>
            <th>Shift End</th>
            <th>Trans #</th>
            <th class="money">Total</th>
            <th class="money">Propinas</th>
            <th class="money">Total + Prop.</th>
          </tr>
        </thead>
        <tbody>
          {''.join(rows)}
        </tbody>
      </table>
      <div class="footer">
        Documento generado automáticamente por {business['name']} | {datetime.now().strftime('%d/%m/%Y %H:%M')} | Uso interno
      </div>
    </body>
    </html>
    """


@router.get("/cierre-caja/xlsx")
async def cierre_caja_xlsx(
    date_from: str = Query(...),
    date_to: str = Query(...),
    view: str = Query("resumida", regex="^(resumida|detallada)$"),
    user=Depends(get_current_user),
):
    detailed = (view == "detallada")
    tree = await _fetch_cash_close_tree(date_from, date_to)
    business = await _get_business_info()
    buf = _build_cash_close_xlsx(tree, _period_label(date_from, date_to), business, detailed)
    label = "Detallada" if detailed else "Resumida"
    fname = f"CierreCaja_{label}_{date_from}_al_{date_to}.xlsx"
    return _xlsx_response(buf, fname)


@router.get("/cierre-caja/pdf")
async def cierre_caja_pdf(
    date_from: str = Query(...),
    date_to: str = Query(...),
    view: str = Query("resumida", regex="^(resumida|detallada)$"),
    user=Depends(get_current_user),
):
    try:
        from weasyprint import HTML
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"WeasyPrint no disponible: {e}")
    detailed = (view == "detallada")
    tree = await _fetch_cash_close_tree(date_from, date_to)
    business = await _get_business_info()
    html = _build_cash_close_html(tree, _period_label(date_from, date_to), business, detailed)
    pdf_bytes = HTML(string=html).write_pdf()
    label = "Detallada" if detailed else "Resumida"
    fname = f"CierreCaja_{label}_{date_from}_al_{date_to}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
