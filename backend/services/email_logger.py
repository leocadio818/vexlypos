"""
Email logger — centralized helper to record every email sent by the system.

Writes to MongoDB collection `email_logs`. All calls are best-effort and
never propagate exceptions to the caller (so a logging failure can't block
an email being sent or break the request handler).

Usage:
    from services.email_logger import log_email
    await log_email(db, type="invoice", recipient="x@y.com",
                    subject="...", status="sent", bill_id=bill["id"])
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# Allowed types — keep loose; new types can be added without code changes.
ALLOWED_TYPES = {
    "invoice",          # /email/send-invoice — fiscal invoice to customer
    "shift_close",      # cierre de caja
    "day_close",        # cierre de jornada
    "stock_alert",      # alerta de stock bajo
    "marketing",        # email_marketing masivo
    "loyalty_card",     # tarjeta de fidelidad
    "shift_report",     # /email/shift-report (manual)
    "daily_close",      # /email/daily-close (manual)
    "generic",          # /email/send (genérico)
    "other",
}


async def log_email(
    db,
    type: str,
    recipient: str,
    subject: str,
    status: str,
    error: Optional[str] = None,
    bill_id: Optional[str] = None,
):
    """Insert one row into email_logs. Never raises."""
    try:
        if db is None:
            return
        doc = {
            "id": str(uuid.uuid4()),
            "type": type if type in ALLOWED_TYPES else "other",
            "recipient": (recipient or "").strip().lower(),
            "subject": (subject or "")[:300],
            "status": "sent" if status == "sent" else "failed",
            "error": (error or None) and str(error)[:500],
            "bill_id": bill_id or None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.email_logs.insert_one(doc)
    except Exception as e:
        # Never block the caller for a logging failure
        logger.warning(f"[email_logger] Failed to write email log: {e}")
