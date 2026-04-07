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
