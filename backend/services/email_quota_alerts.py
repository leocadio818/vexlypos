"""
Email quota auto-alerts.

Sends a one-shot warning email to the configured `notification_emails`
recipients when the monthly email usage crosses:
  • the configured threshold (default 80%) → tone amber
  • 100% of the monthly limit → tone red

Idempotency is guaranteed via two markers stored in `system_config:main`:
  • `email_quota_warning_sent_period`  → ISO of the calendar-month start when
    the warning was already sent.
  • `email_quota_exceeded_sent_period` → same, for the exceeded alert.
If the marker matches the current period_start, we skip resending.
When the period rolls over the markers no longer match → next breach triggers
a fresh alert. Manual reset is possible via `PUT /email-logs/quota`.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import resend

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = "facturas@vexlyapp.com"


def _calendar_month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _next_calendar_month_start(now: datetime) -> datetime:
    if now.month == 12:
        return now.replace(year=now.year + 1, month=1, day=1,
                           hour=0, minute=0, second=0, microsecond=0)
    return now.replace(month=now.month + 1, day=1,
                       hour=0, minute=0, second=0, microsecond=0)


def _utc_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _build_alert_html(biz_name: str, used: int, limit: int, used_pct: float,
                      threshold_pct: float, exceeded: bool) -> str:
    accent = "#dc2626" if exceeded else "#f59e0b"
    title = "🔴 Cuota mensual EXCEDIDA" if exceeded else "⚠️ Cerca del límite mensual"
    body_intro = (
        f"El consumo de emails superó el 100% del cupo mensual de Resend ({limit} emails)."
        if exceeded else
        f"El consumo de emails superó el {threshold_pct:.0f}% del cupo mensual de Resend ({limit} emails)."
    )
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
<tr><td style="padding:24px;">
  <p style="margin:0 0 14px;color:#374151;">{body_intro}</p>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
    <tr><td style="padding:10px 12px;background:#f9fafb;color:#6b7280;width:160px;">Emails enviados</td>
        <td style="padding:10px 12px;font-family:monospace;font-weight:bold;font-size:16px;">{used} / {limit}</td></tr>
    <tr><td style="padding:10px 12px;background:#f9fafb;color:#6b7280;">Porcentaje usado</td>
        <td style="padding:10px 12px;font-family:monospace;font-weight:bold;color:{accent};font-size:16px;">{used_pct:.1f}%</td></tr>
    <tr><td style="padding:10px 12px;background:#f9fafb;color:#6b7280;">Umbral configurado</td>
        <td style="padding:10px 12px;font-family:monospace;">{threshold_pct:.0f}%</td></tr>
  </table>
  <div style="margin-top:18px;padding:14px;background:{accent}14;border-left:4px solid {accent};border-radius:6px;">
    <p style="margin:0;font-size:13px;color:#374151;">
      <strong>Acción recomendada:</strong>
      {"Sube el plan de Resend o aumenta la cuota mensual antes de fin de mes para evitar cortes de envío." if exceeded else "Considera aumentar la cuota o monitorear el consumo en Configuración → Sistema → Consumo de Emails."}
    </p>
  </div>
</td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:center;">
  Generado automáticamente por VexlyPOS · esta alerta solo se envía una vez por mes calendario por nivel.
</td></tr>
</table></td></tr></table></body></html>"""


async def maybe_send_quota_alert(db) -> None:
    """Run after every log_email insert. Best-effort and never raises.
    Sends an alert to `notification_emails` only when crossing thresholds for
    the FIRST time inside the current calendar month."""
    try:
        if db is None:
            return
        cfg = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}

        # Quota config
        try:
            limit = int(cfg.get("email_monthly_quota") or 1000)
        except (TypeError, ValueError):
            limit = 1000
        try:
            threshold = float(cfg.get("email_quota_alert_threshold") or 0.8)
        except (TypeError, ValueError):
            threshold = 0.8
        if limit <= 0:
            return
        threshold = max(0.1, min(1.0, threshold))

        # Recipients
        emails = cfg.get("notification_emails") or []
        if isinstance(emails, str):
            emails = [e.strip() for e in emails.split(",") if e.strip()]
        emails = [e for e in emails if "@" in e]
        if not emails:
            return
        if not resend.api_key:
            return

        # Period & usage
        now = datetime.now(timezone.utc)
        period_start = _calendar_month_start(now)
        period_end = _next_calendar_month_start(now)
        period_iso = _utc_iso(period_start)

        used = await db.email_logs.count_documents({
            "type": {"$ne": "quota_alert"},  # don't count alert emails themselves
            "created_at": {"$gte": period_iso, "$lt": _utc_iso(period_end)},
        })
        used_pct = used / limit  # ratio
        if used_pct < threshold:
            return  # nothing to do

        warning_marker = cfg.get("email_quota_warning_sent_period")
        exceeded_marker = cfg.get("email_quota_exceeded_sent_period")

        # Determine which alert to send (prefer exceeded over warning)
        send_exceeded = used_pct >= 1.0 and exceeded_marker != period_iso
        send_warning = (used_pct >= threshold) and (used_pct < 1.0) and warning_marker != period_iso
        if not (send_exceeded or send_warning):
            return

        biz = cfg.get("ticket_business_name") or cfg.get("restaurant_name") or "VexlyPOS"
        is_exceeded = send_exceeded
        subject_prefix = "Cuota EXCEDIDA" if is_exceeded else "Cuota cerca del límite"
        subject = f"{subject_prefix} — {biz} — {used}/{limit} emails ({used_pct*100:.0f}%)"
        html = _build_alert_html(
            biz_name=biz, used=used, limit=limit,
            used_pct=used_pct * 100, threshold_pct=threshold * 100,
            exceeded=is_exceeded,
        )

        # Send to each admin recipient and log via the logger
        from services.email_logger import log_email
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
                sent_ok = True
            except Exception as inner:
                err_msg = str(inner)
                logger.warning(f"[quota_alert] failed to send to {e}: {inner}")
            await log_email(
                db, type="quota_alert", recipient=e,
                subject=subject, status="sent" if sent_ok else "failed",
                error=err_msg,
            )

        # Persist marker so we don't resend within the same period
        update = {}
        if is_exceeded:
            update["email_quota_exceeded_sent_period"] = period_iso
            # If exceeded fires before the warning ever did, also mark the warning
            # so the user doesn't get two emails back-to-back the same day.
            update["email_quota_warning_sent_period"] = period_iso
        else:
            update["email_quota_warning_sent_period"] = period_iso
        await db.system_config.update_one({"id": "main"}, {"$set": update}, upsert=True)

    except Exception as e:
        logger.warning(f"[quota_alert] maybe_send_quota_alert failed: {e}")
