"""
Utility functions used across the application.
"""
import uuid
from datetime import datetime, timezone


def gen_id() -> str:
    """Generate a unique ID."""
    return str(uuid.uuid4())


def now_iso() -> str:
    """Return current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


def format_money(amount: float) -> str:
    """Format amount as Dominican Pesos."""
    return f"RD$ {amount:,.2f}"
