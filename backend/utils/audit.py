"""
Central Audit Logger for System-Wide Event Tracking
Creates human-readable audit entries in the 'system_audit_logs' collection.

Usage:
    from utils.audit import log_audit_event
    await log_audit_event(
        db=db,
        event_type="LOGIN",
        description="Usuario inició sesión",
        user_id="...",
        user_name="Admin",
        role="admin",
        details={"ip": "192.168.1.1"}
    )
"""

from datetime import datetime, timezone
import uuid


# Event type constants for consistency
class AuditEventType:
    # Authentication
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    LOGIN_FAILED = "LOGIN_FAILED"
    
    # Users & Roles
    USER_CREATED = "USER_CREATED"
    USER_UPDATED = "USER_UPDATED"
    USER_DELETED = "USER_DELETED"
    ROLE_CREATED = "ROLE_CREATED"
    ROLE_UPDATED = "ROLE_UPDATED"
    ROLE_DELETED = "ROLE_DELETED"
    PERMISSION_CHANGED = "PERMISSION_CHANGED"
    
    # Billing & Payments
    BILL_CREATED = "BILL_CREATED"
    BILL_PAID = "BILL_PAID"
    BILL_VOIDED = "BILL_VOIDED"
    BILL_SPLIT = "BILL_SPLIT"
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED"
    DISCOUNT_APPLIED = "DISCOUNT_APPLIED"
    TAX_OVERRIDE = "TAX_OVERRIDE"
    
    # Orders & Tables
    ORDER_CREATED = "ORDER_CREATED"
    ORDER_SENT_KITCHEN = "ORDER_SENT_KITCHEN"
    ITEM_VOIDED = "ITEM_VOIDED"
    TABLE_TRANSFERRED = "TABLE_TRANSFERRED"
    ITEMS_MOVED = "ITEMS_MOVED"
    
    # Inventory
    STOCK_ADJUSTED = "STOCK_ADJUSTED"
    STOCK_TRANSFERRED = "STOCK_TRANSFERRED"
    PURCHASE_ORDER_CREATED = "PURCHASE_ORDER_CREATED"
    PURCHASE_ORDER_RECEIVED = "PURCHASE_ORDER_RECEIVED"
    PRICE_CHANGED = "PRICE_CHANGED"
    PRODUCT_CREATED = "PRODUCT_CREATED"
    PRODUCT_UPDATED = "PRODUCT_UPDATED"
    
    # Shifts & Business Days
    SHIFT_OPENED = "SHIFT_OPENED"
    SHIFT_CLOSED = "SHIFT_CLOSED"
    BUSINESS_DAY_OPENED = "BUSINESS_DAY_OPENED"
    BUSINESS_DAY_CLOSED = "BUSINESS_DAY_CLOSED"
    CASH_MOVEMENT = "CASH_MOVEMENT"
    
    # System
    CONFIG_CHANGED = "CONFIG_CHANGED"
    SYSTEM_RESET = "SYSTEM_RESET"
    ECF_SUBMITTED = "ECF_SUBMITTED"
    ECF_FAILED = "ECF_FAILED"
    CREDIT_NOTE_CREATED = "CREDIT_NOTE_CREATED"


# Human-readable labels for event types
EVENT_TYPE_LABELS = {
    AuditEventType.LOGIN: "Inicio de Sesión",
    AuditEventType.LOGOUT: "Cierre de Sesión",
    AuditEventType.LOGIN_FAILED: "Intento de Login Fallido",
    AuditEventType.USER_CREATED: "Usuario Creado",
    AuditEventType.USER_UPDATED: "Usuario Editado",
    AuditEventType.USER_DELETED: "Usuario Eliminado",
    AuditEventType.ROLE_CREATED: "Puesto Creado",
    AuditEventType.ROLE_UPDATED: "Puesto Editado",
    AuditEventType.ROLE_DELETED: "Puesto Eliminado",
    AuditEventType.PERMISSION_CHANGED: "Permiso Modificado",
    AuditEventType.BILL_CREATED: "Factura Creada",
    AuditEventType.BILL_PAID: "Factura Pagada",
    AuditEventType.BILL_VOIDED: "Factura Anulada",
    AuditEventType.BILL_SPLIT: "Cuenta Dividida",
    AuditEventType.PAYMENT_RECEIVED: "Pago Recibido",
    AuditEventType.DISCOUNT_APPLIED: "Descuento Aplicado",
    AuditEventType.TAX_OVERRIDE: "Exención de Impuesto",
    AuditEventType.ORDER_CREATED: "Orden Creada",
    AuditEventType.ORDER_SENT_KITCHEN: "Orden Enviada a Cocina",
    AuditEventType.ITEM_VOIDED: "Ítem Anulado",
    AuditEventType.TABLE_TRANSFERRED: "Mesa Transferida",
    AuditEventType.ITEMS_MOVED: "Ítems Movidos",
    AuditEventType.STOCK_ADJUSTED: "Stock Ajustado",
    AuditEventType.STOCK_TRANSFERRED: "Stock Transferido",
    AuditEventType.PURCHASE_ORDER_CREATED: "Orden de Compra Creada",
    AuditEventType.PURCHASE_ORDER_RECEIVED: "Orden de Compra Recibida",
    AuditEventType.PRICE_CHANGED: "Precio Modificado",
    AuditEventType.PRODUCT_CREATED: "Producto Creado",
    AuditEventType.PRODUCT_UPDATED: "Producto Editado",
    AuditEventType.SHIFT_OPENED: "Turno Abierto",
    AuditEventType.SHIFT_CLOSED: "Turno Cerrado",
    AuditEventType.BUSINESS_DAY_OPENED: "Jornada Abierta",
    AuditEventType.BUSINESS_DAY_CLOSED: "Jornada Cerrada",
    AuditEventType.CASH_MOVEMENT: "Movimiento de Caja",
    AuditEventType.CONFIG_CHANGED: "Configuración Modificada",
    AuditEventType.SYSTEM_RESET: "Sistema Reseteado",
    AuditEventType.ECF_SUBMITTED: "e-CF Enviado",
    AuditEventType.ECF_FAILED: "e-CF Fallido",
    AuditEventType.CREDIT_NOTE_CREATED: "Nota de Crédito Creada",
}


def gen_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def log_audit_event(
    db,
    event_type: str,
    description: str,
    user_id: str = None,
    user_name: str = None,
    role: str = None,
    details: dict = None,
    entity_type: str = None,
    entity_id: str = None,
    entity_name: str = None,
    value: float = 0,
    authorized_by_id: str = None,
    authorized_by_name: str = None,
):
    """
    Central audit logging function.
    Writes to 'system_audit_logs' collection for unified audit trail.
    
    IMPORTANT: Uses jornada_date (fiscal date) for grouping, NOT calendar date.
    The jornada_date is the business_day this event belongs to.
    created_at is the real clock timestamp for audit trail purposes.
    
    Args:
        db: MongoDB database instance
        event_type: One of AuditEventType constants
        description: Human-readable description of the event
        user_id: ID of the user who performed the action
        user_name: Name of the user who performed the action
        role: Role of the user
        details: Additional details as dict (optional)
        entity_type: Type of entity affected (e.g., "bill", "order", "product")
        entity_id: ID of the entity affected
        entity_name: Name/reference of the entity (e.g., NCF, table number)
        value: Monetary value involved (if applicable)
        authorized_by_id: ID of authorizer (for actions requiring authorization)
        authorized_by_name: Name of authorizer
    
    Returns:
        The inserted document ID
    """
    # Get human-readable label for event type
    type_label = EVENT_TYPE_LABELS.get(event_type, event_type.replace("_", " ").title())
    
    # Get jornada date (fiscal date for grouping) - NOT calendar date
    from utils.timezone import get_jornada_date_with_fallback
    jornada_date = await get_jornada_date_with_fallback(db)
    
    log_entry = {
        "id": gen_id(),
        "event_type": event_type,
        "event_type_label": type_label,
        "description": description,
        "user_id": user_id or "system",
        "user_name": user_name or "Sistema",
        "role": role or "",
        "entity_type": entity_type or "",
        "entity_id": entity_id or "",
        "entity_name": entity_name or "",
        "value": value,
        "details": details or {},
        "authorized_by_id": authorized_by_id or "",
        "authorized_by_name": authorized_by_name or "",
        "jornada_date": jornada_date,  # Fiscal date for grouping/filtering
        "created_at": now_iso(),  # Real clock timestamp for audit trail
    }
    
    try:
        await db.system_audit_logs.insert_one(log_entry)
        return log_entry["id"]
    except Exception as e:
        # Don't let audit logging break the main operation
        print(f"[AUDIT] Failed to log event: {e}")
        return None


async def log_login(db, user_id: str, user_name: str, role: str, success: bool = True, details: dict = None):
    """Log a login attempt."""
    if success:
        await log_audit_event(
            db=db,
            event_type=AuditEventType.LOGIN,
            description=f"{user_name} inició sesión",
            user_id=user_id,
            user_name=user_name,
            role=role,
            details=details
        )
    else:
        await log_audit_event(
            db=db,
            event_type=AuditEventType.LOGIN_FAILED,
            description="Intento de login fallido",
            user_id=user_id,
            user_name=user_name,
            role=role,
            details=details
        )


async def log_logout(db, user_id: str, user_name: str, role: str):
    """Log a logout event."""
    await log_audit_event(
        db=db,
        event_type=AuditEventType.LOGOUT,
        description=f"{user_name} cerró sesión",
        user_id=user_id,
        user_name=user_name,
        role=role
    )


async def log_price_change(db, user_id: str, user_name: str, role: str, product_name: str, old_price: float, new_price: float, product_id: str = None):
    """Log a product price change."""
    await log_audit_event(
        db=db,
        event_type=AuditEventType.PRICE_CHANGED,
        description=f"Precio de '{product_name}' cambió de RD${old_price:,.2f} a RD${new_price:,.2f}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="product",
        entity_id=product_id,
        entity_name=product_name,
        value=new_price - old_price,
        details={"old_price": old_price, "new_price": new_price}
    )


async def log_table_transfer(db, user_id: str, user_name: str, role: str, table_number, from_waiter: str, to_waiter: str, order_ids: list = None):
    """Log a table transfer between users."""
    await log_audit_event(
        db=db,
        event_type=AuditEventType.TABLE_TRANSFERRED,
        description=f"Mesa {table_number} transferida de {from_waiter} a {to_waiter}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="table",
        entity_name=str(table_number),
        details={"from_waiter": from_waiter, "to_waiter": to_waiter, "order_ids": order_ids or []}
    )


async def log_config_change(db, user_id: str, user_name: str, role: str, config_name: str, old_value=None, new_value=None):
    """Log a configuration change."""
    await log_audit_event(
        db=db,
        event_type=AuditEventType.CONFIG_CHANGED,
        description=f"Configuración '{config_name}' modificada",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="config",
        entity_name=config_name,
        details={"old_value": str(old_value), "new_value": str(new_value)}
    )


async def log_bill_paid(db, user_id: str, user_name: str, role: str, bill_id: str, ncf: str, total: float, payment_method: str, table_number=None):
    """Log a bill payment."""
    await log_audit_event(
        db=db,
        event_type=AuditEventType.BILL_PAID,
        description=f"Factura {ncf or bill_id[:8]} pagada - Mesa {table_number or '?'} - {payment_method}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="bill",
        entity_id=bill_id,
        entity_name=ncf or bill_id[:8],
        value=total,
        details={"payment_method": payment_method, "table_number": table_number}
    )


async def log_discount_applied(db, user_id: str, user_name: str, role: str, bill_id: str, discount_name: str, discount_amount: float, authorized_by_name: str = None):
    """Log a discount application."""
    auth_text = f" (autorizado por {authorized_by_name})" if authorized_by_name else ""
    await log_audit_event(
        db=db,
        event_type=AuditEventType.DISCOUNT_APPLIED,
        description=f"Descuento '{discount_name}' de RD${discount_amount:,.2f} aplicado{auth_text}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="bill",
        entity_id=bill_id,
        value=discount_amount,
        authorized_by_name=authorized_by_name,
        details={"discount_name": discount_name}
    )
