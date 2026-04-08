"""
VexlyPOS — System Error Logging Module
=======================================
Captures errors in human-readable Spanish for non-technical users.
Stores in MongoDB collection 'system_logs'.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Literal

db = None

def set_db(database):
    global db
    db = database


# ═══════════════════════════════════════════════════════════════
# CENTRAL AUDIT LOGGING FUNCTION
# ═══════════════════════════════════════════════════════════════

async def log_audit_event(
    event_type: str,
    description_human: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    role: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    entity_name: Optional[str] = None,
    details: Optional[dict] = None,
    value: float = 0
) -> dict:
    """
    Central audit logging function for all system events.
    
    Args:
        event_type: Type of event (login, logout, price_change, table_move, etc.)
        description_human: Human-readable description in Spanish
        user_id: ID of user who performed the action
        user_name: Name of user for display
        role: User's role
        entity_type: Type of entity affected (product, customer, table, etc.)
        entity_id: ID of entity affected
        entity_name: Name of entity for display
        details: Additional context dict
        value: Monetary value if applicable
    
    Returns:
        The created audit entry
    """
    audit_entry = {
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "description": description_human,
        "user_id": user_id,
        "user_name": user_name or "Sistema",
        "role": role,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "details": details or {},
        "value": value
    }
    
    try:
        await db.central_audit_logs.insert_one(audit_entry)
        logging.info(f"[Audit] {event_type}: {description_human}")
    except Exception as e:
        logging.error(f"Failed to save audit log: {e}")
    
    return audit_entry


# Convenience functions for common audit events
async def log_login(user_id: str, user_name: str, role: str, device: str = None):
    """Log user login"""
    details = {"device": device} if device else {}
    return await log_audit_event(
        event_type="login",
        description_human=f"Usuario {user_name} inició sesión",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="user",
        entity_id=user_id,
        entity_name=user_name,
        details=details
    )


async def log_logout(user_id: str, user_name: str, role: str):
    """Log user logout"""
    return await log_audit_event(
        event_type="logout",
        description_human=f"Usuario {user_name} cerró sesión",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="user",
        entity_id=user_id,
        entity_name=user_name
    )


async def log_price_change(product_id: str, product_name: str, old_price: float, new_price: float, user_id: str, user_name: str, role: str):
    """Log product price change"""
    return await log_audit_event(
        event_type="price_change",
        description_human=f"Producto {product_name} cambió precio de RD${old_price:,.2f} a RD${new_price:,.2f}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="product",
        entity_id=product_id,
        entity_name=product_name,
        details={"old_price": old_price, "new_price": new_price},
        value=new_price - old_price
    )


async def log_table_move(table_id: str, table_name: str, area_name: str, user_id: str, user_name: str, role: str):
    """Log table movement"""
    return await log_audit_event(
        event_type="table_move",
        description_human=f"Mesa {table_name} movida en área {area_name}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="table",
        entity_id=table_id,
        entity_name=table_name,
        details={"area": area_name}
    )


async def log_bill_split(table_name: str, bill_id: str, user_id: str, user_name: str, role: str):
    """Log bill splitting"""
    return await log_audit_event(
        event_type="bill_split",
        description_human=f"Cuenta dividida en Mesa {table_name}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="bill",
        entity_id=bill_id,
        entity_name=table_name,
        details={"table": table_name}
    )


async def log_table_transfer(from_table: str, to_table: str, user_id: str, user_name: str, role: str):
    """Log table transfer"""
    return await log_audit_event(
        event_type="table_transfer",
        description_human=f"Mesa {from_table} transferida a {to_table}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="table",
        entity_id=from_table,
        entity_name=from_table,
        details={"from": from_table, "to": to_table}
    )


async def log_customer_edit(customer_id: str, customer_name: str, changes: list, user_id: str, user_name: str, role: str):
    """Log customer edit"""
    return await log_audit_event(
        event_type="customer_edit",
        description_human=f"Cliente {customer_name} fue editado",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="customer",
        entity_id=customer_id,
        entity_name=customer_name,
        details={"changes": changes}
    )


async def log_config_change(config_key: str, old_value: str, new_value: str, user_id: str, user_name: str, role: str):
    """Log system config change"""
    return await log_audit_event(
        event_type="config_change",
        description_human=f"Configuración '{config_key}' fue modificada",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="config",
        entity_id=config_key,
        entity_name=config_key,
        details={"old_value": str(old_value)[:100], "new_value": str(new_value)[:100]}
    )


async def log_category_change(category_id: str, category_name: str, action: str, user_id: str, user_name: str, role: str):
    """Log category create/edit/delete"""
    action_text = {"created": "creada", "edited": "editada", "deleted": "eliminada"}.get(action, action)
    return await log_audit_event(
        event_type=f"category_{action}",
        description_human=f"Categoría {category_name} fue {action_text}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="category",
        entity_id=category_id,
        entity_name=category_name,
        details={"action": action}
    )


async def log_product_edit(product_id: str, product_name: str, changes: list, user_id: str, user_name: str, role: str):
    """Log product edit"""
    return await log_audit_event(
        event_type="product_edit",
        description_human=f"Producto {product_name} fue editado",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="product",
        entity_id=product_id,
        entity_name=product_name,
        details={"changes": changes}
    )


async def log_discount_applied(table_name: str, discount_name: str, discount_amount: float, bill_id: str, user_id: str, user_name: str, role: str):
    """Log discount applied"""
    return await log_audit_event(
        event_type="discount_applied",
        description_human=f"Descuento '{discount_name}' aplicado en Mesa {table_name}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="bill",
        entity_id=bill_id,
        entity_name=table_name,
        details={"discount": discount_name, "amount": discount_amount},
        value=discount_amount
    )


async def log_area_change(area_id: str, area_name: str, action: str, user_id: str, user_name: str, role: str):
    """Log area create/edit/delete"""
    action_text = {"created": "creada", "edited": "editada", "deleted": "eliminada"}.get(action, action)
    return await log_audit_event(
        event_type=f"area_{action}",
        description_human=f"Área {area_name} fue {action_text}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="area",
        entity_id=area_id,
        entity_name=area_name,
        details={"action": action}
    )


async def log_print_channel_change(channel_id: str, channel_name: str, action: str, user_id: str, user_name: str, role: str):
    """Log print channel change"""
    action_text = {"created": "creado", "edited": "modificado", "deleted": "eliminado"}.get(action, action)
    return await log_audit_event(
        event_type=f"print_channel_{action}",
        description_human=f"Canal de impresión {channel_name} fue {action_text}",
        user_id=user_id,
        user_name=user_name,
        role=role,
        entity_type="print_channel",
        entity_id=channel_id,
        entity_name=channel_name,
        details={"action": action}
    )


# ═══════════════════════════════════════════════════════════════
# HUMAN-READABLE ERROR MESSAGES (Spanish)
# ═══════════════════════════════════════════════════════════════

ERROR_MESSAGES = {
    # Payments
    "payment_failed": "No se pudo procesar el pago",
    "payment_failed_table": "No se pudo procesar el pago de Mesa {table}",
    "payment_card_declined": "La tarjeta fue rechazada",
    "payment_insufficient_funds": "Fondos insuficientes",
    
    # Printing
    "print_failed": "No se pudo imprimir el documento",
    "print_comanda_failed": "No se pudo enviar la comanda a la impresora {printer}",
    "print_receipt_failed": "No se pudo imprimir el recibo",
    "print_connection_failed": "No se pudo conectar con la impresora {printer}",
    "print_timeout": "La impresora {printer} no respondió a tiempo",
    
    # e-CF / DGII
    "ecf_send_failed": "No se pudo generar la factura fiscal",
    "ecf_auth_failed": "Error de autenticación con el proveedor de facturación",
    "ecf_sequence_invalid": "Secuencia de facturación inválida o expirada",
    "ecf_dgii_rejected": "DGII rechazó la factura: {reason}",
    "ecf_network_error": "Error de conexión con el servicio de facturación",
    
    # Email
    "email_send_failed": "No se pudo enviar el correo a {email}",
    "email_invoice_failed": "No se pudo enviar la factura por correo",
    "email_config_missing": "El servicio de correo no está configurado",
    
    # Inventory
    "inventory_update_failed": "No se pudo actualizar el inventario",
    "inventory_insufficient": "Stock insuficiente de {product}",
    "inventory_sync_failed": "Error al sincronizar inventario",
    
    # Orders
    "order_create_failed": "No se pudo crear la orden",
    "order_update_failed": "No se pudo actualizar la orden",
    "order_kitchen_failed": "No se pudo enviar la orden a cocina",
    
    # Auth
    "auth_login_failed": "Intento de inicio de sesión fallido",
    "auth_session_expired": "La sesión ha expirado",
    
    # General
    "database_error": "Error de conexión con la base de datos",
    "network_error": "Error de conexión de red",
    "unknown_error": "Ocurrió un error inesperado",
}


# ═══════════════════════════════════════════════════════════════
# LOGGING FUNCTIONS
# ═══════════════════════════════════════════════════════════════

async def log_error(
    module: str,
    error_key: str,
    technical_error: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    role: Optional[str] = None,
    device: Optional[str] = None,
    context: Optional[dict] = None,
    level: Literal["error", "warning", "info"] = "error"
) -> dict:
    """
    Log an error with human-readable message.
    
    Args:
        module: Module where error occurred (payments, printing, ecf, inventory, etc.)
        error_key: Key from ERROR_MESSAGES dict
        technical_error: Original technical error message
        user_id: ID of user who encountered the error
        user_name: Name of user for display
        role: User's role
        device: Device type (mobile, tablet, desktop)
        context: Additional context dict for message formatting (e.g., {"table": "5", "printer": "Cocina"})
        level: Log level (error, warning, info)
    
    Returns:
        The created log entry
    """
    # Get human-readable message
    human_template = ERROR_MESSAGES.get(error_key, ERROR_MESSAGES["unknown_error"])
    
    # Format message with context
    try:
        human_message = human_template.format(**(context or {}))
    except KeyError:
        human_message = human_template
    
    log_entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "user_id": user_id,
        "user_name": user_name or "Sistema",
        "role": role,
        "device": device,
        "module": module,
        "error_key": error_key,
        "technical_error": str(technical_error)[:2000],  # Limit size
        "human_message": human_message,
        "context": context,
        "resolved": False,
        "resolved_at": None,
        "resolved_by": None,
        "notes": None
    }
    
    try:
        await db.system_logs.insert_one(log_entry)
        logging.info(f"[SystemLog] {level.upper()} - {module}: {human_message}")
    except Exception as e:
        logging.error(f"Failed to save system log: {e}")
    
    return log_entry


async def log_payment_error(
    technical_error: str,
    table_name: str = None,
    bill_id: str = None,
    user_id: str = None,
    user_name: str = None,
    role: str = None,
    device: str = None
) -> dict:
    """Convenience function for payment errors"""
    error_key = "payment_failed_table" if table_name else "payment_failed"
    context = {"table": table_name} if table_name else {}
    if bill_id:
        context["bill_id"] = bill_id
    
    return await log_error(
        module="payments",
        error_key=error_key,
        technical_error=technical_error,
        user_id=user_id,
        user_name=user_name,
        role=role,
        device=device,
        context=context
    )


async def log_print_error(
    technical_error: str,
    printer_name: str = None,
    error_type: str = "print_comanda_failed",
    order_id: str = None,
    user_id: str = None,
    user_name: str = None,
    role: str = None,
    device: str = None
) -> dict:
    """Convenience function for printing errors"""
    context = {"printer": printer_name or "desconocida"}
    if order_id:
        context["order_id"] = order_id
    
    return await log_error(
        module="printing",
        error_key=error_type,
        technical_error=technical_error,
        user_id=user_id,
        user_name=user_name,
        role=role,
        device=device,
        context=context
    )


async def log_ecf_error(
    technical_error: str,
    error_type: str = "ecf_send_failed",
    bill_id: str = None,
    encf: str = None,
    dgii_reason: str = None,
    user_id: str = None,
    user_name: str = None,
    role: str = None,
    device: str = None
) -> dict:
    """Convenience function for e-CF/DGII errors"""
    context = {}
    if bill_id:
        context["bill_id"] = bill_id
    if encf:
        context["encf"] = encf
    if dgii_reason:
        context["reason"] = dgii_reason
    
    return await log_error(
        module="ecf",
        error_key=error_type,
        technical_error=technical_error,
        user_id=user_id,
        user_name=user_name,
        role=role,
        device=device,
        context=context
    )


async def log_email_error(
    technical_error: str,
    email: str = None,
    error_type: str = "email_send_failed",
    user_id: str = None,
    user_name: str = None,
    role: str = None,
    device: str = None
) -> dict:
    """Convenience function for email errors"""
    context = {"email": email or "desconocido"}
    
    return await log_error(
        module="email",
        error_key=error_type,
        technical_error=technical_error,
        user_id=user_id,
        user_name=user_name,
        role=role,
        device=device,
        context=context
    )


async def log_inventory_error(
    technical_error: str,
    product_name: str = None,
    error_type: str = "inventory_update_failed",
    user_id: str = None,
    user_name: str = None,
    role: str = None,
    device: str = None
) -> dict:
    """Convenience function for inventory errors"""
    context = {"product": product_name} if product_name else {}
    
    return await log_error(
        module="inventory",
        error_key=error_type,
        technical_error=technical_error,
        user_id=user_id,
        user_name=user_name,
        role=role,
        device=device,
        context=context
    )


# ═══════════════════════════════════════════════════════════════
# QUERY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

async def get_recent_logs(
    limit: int = 50,
    module: str = None,
    level: str = None,
    resolved: bool = None,
    user_id: str = None
) -> list:
    """Get recent system logs with optional filters"""
    query = {}
    if module:
        query["module"] = module
    if level:
        query["level"] = level
    if resolved is not None:
        query["resolved"] = resolved
    if user_id:
        query["user_id"] = user_id
    
    cursor = db.system_logs.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit)
    return await cursor.to_list(limit)


async def get_log_stats() -> dict:
    """Get statistics about system logs"""
    pipeline = [
        {
            "$facet": {
                "by_level": [
                    {"$group": {"_id": "$level", "count": {"$sum": 1}}}
                ],
                "by_module": [
                    {"$group": {"_id": "$module", "count": {"$sum": 1}}}
                ],
                "unresolved": [
                    {"$match": {"resolved": False, "level": "error"}},
                    {"$count": "count"}
                ],
                "today": [
                    {"$match": {
                        "timestamp": {"$gte": datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()}
                    }},
                    {"$count": "count"}
                ]
            }
        }
    ]
    
    result = await db.system_logs.aggregate(pipeline).to_list(1)
    if not result:
        return {"by_level": {}, "by_module": {}, "unresolved": 0, "today": 0}
    
    data = result[0]
    return {
        "by_level": {item["_id"]: item["count"] for item in data.get("by_level", [])},
        "by_module": {item["_id"]: item["count"] for item in data.get("by_module", [])},
        "unresolved": data.get("unresolved", [{}])[0].get("count", 0) if data.get("unresolved") else 0,
        "today": data.get("today", [{}])[0].get("count", 0) if data.get("today") else 0
    }


async def resolve_log(log_id: str, resolved_by: str, notes: str = None) -> bool:
    """Mark a log entry as resolved"""
    result = await db.system_logs.update_one(
        {"id": log_id},
        {"$set": {
            "resolved": True,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "resolved_by": resolved_by,
            "notes": notes
        }}
    )
    return result.modified_count > 0


async def delete_old_logs(days: int = 30) -> int:
    """Delete resolved logs older than specified days"""
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    result = await db.system_logs.delete_many({
        "resolved": True,
        "timestamp": {"$lt": cutoff}
    })
    return result.deleted_count
