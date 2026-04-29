"""
Email notifications for shift close, day close, and stock alerts.

All sends are best-effort and non-blocking — failures are logged but never
propagate up to the request handler. Reads recipient list and toggles from
`system_config:main` so it's per-tenant and respects multi-tenant isolation.
"""

import logging
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import resend

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = "facturas@vexlyapp.com"


def _now_dr_str(fmt: str = "%Y-%m-%d %I:%M %p") -> str:
    return datetime.now(ZoneInfo("America/Santo_Domingo")).strftime(fmt)


def _money(v) -> str:
    try:
        return f"RD$ {float(v or 0):,.2f}"
    except Exception:
        return "RD$ 0.00"


async def _get_settings(db):
    cfg = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    biz = cfg.get("ticket_business_name") or cfg.get("business_name") or cfg.get("restaurant_name") or "VexlyPOS"
    emails = cfg.get("notification_emails") or []
    if isinstance(emails, str):
        emails = [e.strip() for e in emails.split(",") if e.strip()]
    return {
        "biz_name": biz,
        "emails": [e for e in emails if "@" in e],
        "notify_shift_close": bool(cfg.get("notify_shift_close", True)),
        "notify_day_close": bool(cfg.get("notify_day_close", True)),
        "notify_stock_alerts": bool(cfg.get("notify_stock_alerts", True)),
        "stock_alert_cooldown_h": int(cfg.get("stock_alert_cooldown_h", 6)),
    }


def _base_html(title: str, biz_name: str, body_html: str, accent: str = "#f97316") -> str:
    """Responsive HTML email shell with VexlyPOS orange accent."""
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<tr><td style="background:{accent};padding:20px 24px;color:#fff;">
  <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">{biz_name}</div>
  <div style="font-size:22px;font-weight:bold;margin-top:4px;">{title}</div>
</td></tr>
<tr><td style="padding:24px;">{body_html}</td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:center;">
  Enviado automáticamente por VexlyPOS — {_now_dr_str()}
</td></tr>
</table></td></tr></table></body></html>"""


async def _send(emails: list, subject: str, html: str, *, db=None, log_type: str = "other"):
    """Fire-and-forget Resend send. Logs and swallows exceptions.
    If `db` is provided, every recipient is also logged in `email_logs` with
    its individual sent/failed status via services.email_logger.log_email.
    """
    if not resend.api_key:
        logger.warning("RESEND_API_KEY missing — skipping email send")
        return False
    if not emails:
        return False
    # Lazy import to avoid circular imports if email_logger ever depends on us
    from services.email_logger import log_email
    try:
        for e in emails:
            sent_ok = False
            err_msg = None
            try:
                resend.Emails.send({
                    "from": SENDER_EMAIL,
                    "to": e,
                    "subject": subject,
                    "html": html,
                })
                logger.info(f"[email] sent '{subject}' → {e}")
                sent_ok = True
            except Exception as inner:
                err_msg = str(inner)
                logger.warning(f"[email] failed to send to {e}: {inner}")
            if db is not None:
                await log_email(
                    db,
                    type=log_type,
                    recipient=e,
                    subject=subject,
                    status="sent" if sent_ok else "failed",
                    error=err_msg,
                )
        return True
    except Exception as e:
        logger.error(f"[email] send pipeline failed: {e}")
        return False


# ────────────────────────────────────────────────────────────────────────
# 1) SHIFT CLOSE
# ────────────────────────────────────────────────────────────────────────
async def send_shift_close_email(db, session: dict, reconciliation: dict, terminal_name: str = ""):
    settings = await _get_settings(db)
    if not settings["notify_shift_close"] or not settings["emails"]:
        return False

    biz = settings["biz_name"]
    cashier = session.get("opened_by_name", "Cajero")
    opened_at = session.get("opened_at", "")[:19].replace("T", " ")
    closed_at = session.get("closed_at", "")[:19].replace("T", " ")

    cash_sales = session.get("cash_sales", 0)
    card_sales = session.get("card_sales", 0)
    transfer_sales = session.get("transfer_sales", 0)
    other_sales = session.get("other_sales", 0)
    total_sales = cash_sales + card_sales + transfer_sales + other_sales

    bills_count = session.get("bills_count", 0)
    voids_count = session.get("voids_count", 0)
    voids_total = session.get("voids_total", 0)
    cash_in = session.get("cash_in", 0)
    cash_out = session.get("cash_out", 0)

    expected = reconciliation.get("expected_cash", 0)
    declared = reconciliation.get("cash_declared", 0)
    diff = reconciliation.get("total_difference", 0)
    diff_color = "#16a34a" if diff >= 0 else "#dc2626"
    diff_sign = "+" if diff > 0 else ""

    rows = [
        ("Efectivo", _money(cash_sales)),
        ("Tarjeta de Crédito", _money(session.get("credit_sales", 0))),
        ("Tarjeta de Débito", _money(session.get("debit_sales", 0))),
        ("Tarjeta (general)", _money(card_sales)),
        ("Transferencia", _money(transfer_sales)),
        ("Otros", _money(other_sales)),
    ]
    rows_html = "".join(
        f"<tr><td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;'>{k}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;'>{v}</td></tr>"
        for k, v in rows
    )

    body = f"""
    <p style="margin:0 0 16px;color:#374151;">Cierre de caja registrado:</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Cajero:</td><td><b>{cashier}</b></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Terminal:</td><td>{terminal_name or session.get('terminal_name','-')}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Apertura:</td><td>{opened_at}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Cierre:</td><td>{closed_at}</td></tr>
    </table>

    <h3 style="margin:18px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Ventas por método</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      {rows_html}
      <tr style="background:#fff7ed;">
        <td style="padding:10px 12px;font-weight:bold;">TOTAL VENTAS</td>
        <td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:bold;color:#f97316;">{_money(total_sales)}</td>
      </tr>
    </table>

    <h3 style="margin:18px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Resumen operativo</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Facturas emitidas</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">{bills_count}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Anulaciones</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">{voids_count} ({_money(voids_total)})</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Ingresos a caja</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;">{_money(cash_in)}</td></tr>
      <tr><td style="padding:8px 12px;">Retiros de caja</td><td style="padding:8px 12px;text-align:right;font-family:monospace;">{_money(cash_out)}</td></tr>
    </table>

    <h3 style="margin:18px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Cuadre</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Efectivo esperado</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;">{_money(expected)}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Efectivo declarado</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;">{_money(declared)}</td></tr>
      <tr style="background:#f9fafb;">
        <td style="padding:10px 12px;font-weight:bold;">Diferencia</td>
        <td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:bold;color:{diff_color};">{diff_sign}{_money(diff)}</td>
      </tr>
    </table>
    """

    if reconciliation.get("difference_notes"):
        body += f'<p style="margin-top:14px;color:#6b7280;font-size:13px;"><b>Notas:</b> {reconciliation["difference_notes"]}</p>'

    subject = f"Cierre de Caja — {biz} — {_now_dr_str('%Y-%m-%d %H:%M')}"
    return await _send(settings["emails"], subject, _base_html("Cierre de Caja", biz, body), db=db, log_type="shift_close")


# ────────────────────────────────────────────────────────────────────────
# 2) DAY CLOSE
# ────────────────────────────────────────────────────────────────────────
async def send_day_close_email(db, business_date: str, summary: dict):
    settings = await _get_settings(db)
    if not settings["notify_day_close"] or not settings["emails"]:
        return False

    biz = settings["biz_name"]

    payments = summary.get("payments", {})
    payment_rows = "".join(
        f"<tr><td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;'>{k}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;'>{_money(v)}</td></tr>"
        for k, v in payments.items()
    ) or "<tr><td style='padding:8px 12px;color:#9ca3af;'>Sin ventas</td><td></td></tr>"

    sessions = summary.get("sessions", [])
    sessions_rows = "".join(
        f"<tr>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;'>{s.get('terminal_name','-')}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;'>{s.get('opened_by_name','-')}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;'>{_money(s.get('total_sales',0))}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;color:{'#16a34a' if s.get('total_difference',0)>=0 else '#dc2626'};'>{_money(s.get('total_difference',0))}</td>"
        f"</tr>"
        for s in sessions
    ) or "<tr><td colspan='4' style='padding:8px 12px;color:#9ca3af;'>Sin turnos</td></tr>"

    top_products = summary.get("top_products", [])
    top_rows = "".join(
        f"<tr><td style='padding:6px 12px;border-bottom:1px solid #e5e7eb;'>{i+1}. {p.get('name','?')}</td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;'>{p.get('qty',0)}</td>"
        f"<td style='padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;'>{_money(p.get('total',0))}</td></tr>"
        for i, p in enumerate(top_products[:10])
    ) or "<tr><td colspan='3' style='padding:8px 12px;color:#9ca3af;'>Sin ventas</td></tr>"

    ecf = summary.get("ecf", {})

    body = f"""
    <p style="margin:0 0 16px;color:#374151;">Resumen consolidado del día <b>{business_date}</b>:</p>

    <h3 style="margin:18px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Ventas por método de pago</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
      {payment_rows}
      <tr style="background:#fff7ed;"><td style="padding:10px 12px;font-weight:bold;">TOTAL DEL DÍA</td>
      <td style="padding:10px 12px;text-align:right;font-family:monospace;font-weight:bold;color:#f97316;">{_money(summary.get('total_day',0))}</td></tr>
    </table>

    <h3 style="margin:18px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Por turno</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
      <tr style="background:#f9fafb;"><th style="text-align:left;padding:8px 12px;font-size:12px;color:#6b7280;">Terminal</th>
      <th style="text-align:left;padding:8px 12px;font-size:12px;color:#6b7280;">Cajero</th>
      <th style="text-align:right;padding:8px 12px;font-size:12px;color:#6b7280;">Ventas</th>
      <th style="text-align:right;padding:8px 12px;font-size:12px;color:#6b7280;">Dif.</th></tr>
      {sessions_rows}
    </table>

    <h3 style="margin:18px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Top 10 productos vendidos</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
      {top_rows}
    </table>

    <h3 style="margin:18px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Operativo</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Total facturas</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">{summary.get('total_bills',0)}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Anulaciones</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">{summary.get('total_voids',0)} ({_money(summary.get('voids_amount',0))})</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Clientes atendidos</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">{summary.get('customers',0)}</td></tr>
      <tr><td style="padding:8px 12px;">Promedio por mesa</td><td style="padding:8px 12px;text-align:right;font-family:monospace;">{_money(summary.get('avg_per_table',0))}</td></tr>
    </table>

    <h3 style="margin:18px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">e-CF DGII</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Aprobadas</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#16a34a;">{ecf.get('approved',0)}</td></tr>
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Rechazadas</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:#dc2626;">{ecf.get('rejected',0)}</td></tr>
      <tr><td style="padding:8px 12px;">Contingencia</td><td style="padding:8px 12px;text-align:right;color:#f59e0b;">{ecf.get('contingency',0)}</td></tr>
    </table>
    """

    subject = f"Cierre de Jornada — {biz} — {business_date}"
    return await _send(settings["emails"], subject, _base_html("Cierre de Jornada", biz, body), db=db, log_type="day_close")


# ────────────────────────────────────────────────────────────────────────
# 3) STOCK ALERT
# ────────────────────────────────────────────────────────────────────────
async def send_stock_alert_email(db):
    """Run periodically. Sends one email if there are products under min stock,
    respecting per-product cooldown to avoid spam."""
    settings = await _get_settings(db)
    if not settings["notify_stock_alerts"] or not settings["emails"]:
        return False

    cooldown_h = settings["stock_alert_cooldown_h"]
    cutoff = datetime.now(timezone.utc).timestamp() - (cooldown_h * 3600)

    cursor = db.products.find(
        {"track_inventory": True},
        {"_id": 0, "id": 1, "name": 1, "stock_actual": 1, "stock_minimo": 1, "unit": 1}
    )
    low = []
    async for p in cursor:
        actual = float(p.get("stock_actual") or 0)
        minimo = float(p.get("stock_minimo") or 0)
        if minimo > 0 and actual <= minimo:
            last_alert = await db.stock_alert_log.find_one({"product_id": p["id"]}, {"_id": 0, "ts": 1})
            if last_alert and last_alert.get("ts", 0) > cutoff:
                continue
            low.append(p)

    if not low:
        return False

    biz = settings["biz_name"]
    rows = "".join(
        f"<tr>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;'>{p.get('name','?')}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;color:#dc2626;font-weight:bold;'>{p.get('stock_actual',0)}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;'>{p.get('stock_minimo',0)}</td>"
        f"<td style='padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;'>{p.get('unit','-')}</td>"
        f"</tr>"
        for p in low
    )

    body = f"""
    <p style="margin:0 0 16px;color:#374151;">Los siguientes productos están en o por debajo del stock mínimo:</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;">
      <tr style="background:#fef2f2;">
        <th style="text-align:left;padding:10px 12px;font-size:12px;color:#7f1d1d;">Producto</th>
        <th style="text-align:right;padding:10px 12px;font-size:12px;color:#7f1d1d;">Stock Actual</th>
        <th style="text-align:right;padding:10px 12px;font-size:12px;color:#7f1d1d;">Stock Mínimo</th>
        <th style="text-align:left;padding:10px 12px;font-size:12px;color:#7f1d1d;">Unidad</th>
      </tr>
      {rows}
    </table>
    <p style="margin-top:14px;color:#6b7280;font-size:13px;">Programa una compra para reabastecer estos artículos.</p>
    """

    subject = f"⚠️ Alerta Stock Bajo — {biz} — {_now_dr_str('%Y-%m-%d')}"
    sent = await _send(settings["emails"], subject, _base_html("Alerta de Stock Bajo", biz, body, accent="#dc2626"), db=db, log_type="stock_alert")

    if sent:
        now_ts = datetime.now(timezone.utc).timestamp()
        for p in low:
            await db.stock_alert_log.update_one(
                {"product_id": p["id"]},
                {"$set": {"ts": now_ts, "name": p.get("name", "")}},
                upsert=True,
            )
    return sent
