"""
Authentication and Users Router
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List
from datetime import datetime, timezone
import hashlib
import jwt
import os
import uuid

from models.database import db
from models.schemas import LoginInput
from utils.helpers import gen_id

router = APIRouter(tags=["Auth & Users"])

JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback_secret')


def hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode()).hexdigest()


# ─── PERMISSIONS ───
DEFAULT_PERMISSIONS = {
    "admin": {
        "view_dashboard": True, "move_tables": True, "resize_tables": True,
        "open_table": True, "add_products": True, "void_items": True, "send_kitchen": True,
        "create_bill": True, "collect_payment": True, "split_bill": True,
        "manage_users": True, "manage_areas": True, "manage_tables": True,
        "manage_payment_methods": True, "manage_cancellation_reasons": True,
        "manage_products": True, "manage_sale_types": True,
        "manage_print_channels": True, "manage_station_config": True,
        "manage_inventory": True, "manage_suppliers": True,
        "manage_customers": True, "manage_reservations": True,
        "view_reports": True, "export_dgii": True,
        "open_shift": True, "close_shift": True, "close_day": True,
        "release_reserved_table": True,
        "access_all_tables": True,
        "reprint_receipt": True,  # Admin can always reprint
        "can_manage_tax_override": True,  # Admin can override taxes with documentation
    },
    "waiter": {
        "open_table": True, "add_products": True, "void_items": True, "send_kitchen": True,
        "split_bill": True, "manage_reservations": True, "manage_customers": True,
        "access_all_tables": False,
        "reprint_receipt": False,
        "can_manage_tax_override": False,
    },
    "cashier": {
        "open_table": True, "add_products": True, "void_items": True, "send_kitchen": True,
        "create_bill": True, "collect_payment": True, "split_bill": True,
        "open_shift": True, "close_shift": True, "manage_customers": True,
        "access_all_tables": True,
        "reprint_receipt": True,
    },
    "supervisor": {
        "view_dashboard": True, "move_tables": True,
        "open_table": True, "add_products": True, "void_items": True, "send_kitchen": True,
        "create_bill": True, "collect_payment": True, "split_bill": True,
        "manage_reservations": True, "manage_customers": True,
        "view_reports": True,
        "open_shift": True, "close_shift": True,
        "access_all_tables": True,
        "reprint_receipt": True,
    },
    "kitchen": {},
}

ALL_PERMISSIONS = {
    "view_dashboard": "Ver Dashboard",
    "move_tables": "Mover Mesas", "resize_tables": "Redimensionar Mesas",
    "open_table": "Abrir Mesa / Crear Orden", "add_products": "Agregar Productos",
    "void_items": "Anular Items", "send_kitchen": "Enviar a Cocina",
    "create_bill": "Crear Factura", "collect_payment": "Cobrar",
    "split_bill": "Dividir Cuenta",
    "access_all_tables": "Acceder a Todas las Mesas",
    "reprint_receipt": "Reimprimir Pre-cuenta/Recibos",
    "manage_users": "Config: Usuarios", "manage_areas": "Config: Areas",
    "manage_tables": "Config: Mesas", "manage_payment_methods": "Config: Formas de Pago",
    "manage_cancellation_reasons": "Config: Anulaciones", "manage_products": "Config: Productos",
    "manage_sale_types": "Config: Tipos de Venta", "manage_print_channels": "Config: Impresion",
    "manage_station_config": "Config: Estacion",
    "manage_inventory": "Inventario", "manage_suppliers": "Proveedores/Compras",
    "manage_customers": "Clientes/Fidelidad", "manage_reservations": "Reservaciones",
    "view_reports": "Ver Reportes", "export_dgii": "Exportar DGII",
    "open_shift": "Abrir Turno", "close_shift": "Cerrar Turno", "close_day": "Cierre de Dia",
    "release_reserved_table": "Desbloquear Mesa Reservada",
}

# ─── ROLE LEVELS (Hierarchical Security) ───
BUILTIN_ROLE_LEVELS = {
    "admin": 100,       # Administrador del Sistema
    "supervisor": 40,   # Supervisor
    "cashier": 30,      # Cajero
    "waiter": 20,       # Mesero
    "kitchen": 10,      # Cocina
}

def get_role_level(role_code: str, custom_roles_cache=None) -> int:
    """Get the numeric level for a role code"""
    if role_code in BUILTIN_ROLE_LEVELS:
        return BUILTIN_ROLE_LEVELS[role_code]
    return 0  # Unknown roles get lowest level

async def get_role_level_async(role_code: str) -> int:
    """Get level for a role, checking custom roles in DB"""
    if role_code in BUILTIN_ROLE_LEVELS:
        return BUILTIN_ROLE_LEVELS[role_code]
    custom = await db.custom_roles.find_one({"code": role_code}, {"_id": 0, "level": 1})
    if custom and "level" in custom:
        return custom["level"]
    custom_by_id = await db.custom_roles.find_one({"id": role_code}, {"_id": 0, "level": 1})
    if custom_by_id and "level" in custom_by_id:
        return custom_by_id["level"]
    return 0


def get_permissions(role, custom=None):
    base = {}
    for k in ALL_PERMISSIONS:
        base[k] = False
    defaults = DEFAULT_PERMISSIONS.get(role, {})
    base.update(defaults)
    if custom:
        base.update(custom)
    return base


def can_access_table_orders(user: dict, orders: list) -> bool:
    """Check if user can access orders on a table based on ownership and permissions"""
    perms = get_permissions(user.get("role", "waiter"), user.get("permissions"))
    
    if perms.get("access_all_tables", False):
        return True
    
    if not orders:
        return True
    
    user_id = user.get("user_id")
    for order in orders:
        if order.get("waiter_id") == user_id:
            return True
    
    return False


def get_table_owner_name(orders: list) -> str:
    """Get the name of the waiter who owns the table"""
    if orders:
        return orders[0].get("waiter_name", "Otro usuario")
    return None


async def get_current_user(request: Request):
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No autenticado")
    token = auth.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido")


# ─── ROUTES ───

@router.get("/permissions/all")
async def list_all_permissions():
    return ALL_PERMISSIONS


@router.post("/users/check-pin")
async def check_pin_duplicate(input: dict):
    """Check if a PIN already exists for another active user"""
    pin = input.get("pin", "")
    exclude_user_id = input.get("exclude_user_id")
    
    if not pin:
        return {"exists": False}
    
    # Validate PIN format
    if not pin.isdigit():
        raise HTTPException(status_code=400, detail="El PIN debe ser numérico")
    
    if len(pin) < 1 or len(pin) > 8:
        raise HTTPException(status_code=400, detail="El PIN debe tener entre 1 y 8 dígitos")
    
    if pin.startswith("0"):
        raise HTTPException(status_code=400, detail="El PIN no puede iniciar con 0")
    
    hashed = hash_pin(pin)
    query = {"pin_hash": hashed, "active": True}
    
    # Exclude current user if editing
    if exclude_user_id:
        query["id"] = {"$ne": exclude_user_id}
    
    existing = await db.users.find_one(query, {"_id": 0, "id": 1})
    return {"exists": existing is not None}


@router.post("/auth/login")
async def login(input: LoginInput):
    hashed = hash_pin(input.pin)
    user = await db.users.find_one({"pin_hash": hashed, "active": True}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="PIN incorrecto")
    perms = get_permissions(user["role"], user.get("permissions"))
    role_level = await get_role_level_async(user["role"])
    token = jwt.encode({"user_id": user["id"], "name": user["name"], "role": user["role"], "role_level": role_level, "training_mode": user.get("training_mode", False)}, JWT_SECRET, algorithm="HS256")
    user_data = {k: v for k, v in user.items() if k != "pin_hash"}
    user_data["permissions"] = perms
    user_data["role_level"] = role_level
    return {"token": token, "user": user_data}


@router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["user_id"]}, {"_id": 0, "pin_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u["permissions"] = get_permissions(u["role"], u.get("permissions"))
    u["role_level"] = await get_role_level_async(u["role"])
    return u


@router.get("/users")
async def list_users(user=Depends(get_current_user)):
    caller_level = await get_role_level_async(user.get("role", "waiter"))
    
    # Build role level lookup: custom roles first, then builtins OVERRIDE
    custom_roles = await db.custom_roles.find({}, {"_id": 0}).to_list(100)
    role_level_map = {}
    for cr in custom_roles:
        code = cr.get("code") or cr.get("id")
        role_level_map[code] = cr.get("level", 0)
    role_level_map.update(BUILTIN_ROLE_LEVELS)  # Builtins always take precedence
    
    all_users = await db.users.find({}, {"_id": 0, "pin_hash": 0}).to_list(500)
    filtered = []
    for u in all_users:
        u_role = u.get("role", "waiter")
        u_level = role_level_map.get(u_role, 0)
        u["role_level"] = u_level
        # Only show users with LOWER level than caller
        if u_level < caller_level:
            u["permissions"] = get_permissions(u["role"], u.get("permissions"))
            filtered.append(u)
    return filtered


@router.get("/users/{user_id}")
async def get_user(user_id: str, caller=Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    caller_level = await get_role_level_async(caller.get("role", "waiter"))
    target_level = await get_role_level_async(user.get("role", "waiter"))
    
    # Allow viewing own profile, or users with lower level
    if caller["user_id"] != user_id and target_level >= caller_level:
        raise HTTPException(status_code=403, detail="No tienes permiso para ver este usuario")
    
    user["permissions"] = get_permissions(user.get("role", "waiter"), user.get("permissions"))
    user["role_level"] = target_level
    return user


@router.post("/users")
async def create_user(input: dict, caller=Depends(get_current_user)):
    pin = input.get("pin", "")
    
    # Validate PIN
    if not pin:
        raise HTTPException(status_code=400, detail="PIN es requerido")
    if not pin.isdigit():
        raise HTTPException(status_code=400, detail="El PIN debe ser numérico")
    if len(pin) < 1 or len(pin) > 8:
        raise HTTPException(status_code=400, detail="El PIN debe tener entre 1 y 8 dígitos")
    if pin.startswith("0"):
        raise HTTPException(status_code=400, detail="El PIN no puede iniciar con 0")
    
    # Hierarchy check: caller can only assign roles with level < their own
    caller_level = await get_role_level_async(caller.get("role", "waiter"))
    target_role = input.get("role", "waiter")
    target_level = await get_role_level_async(target_role)
    if target_level >= caller_level:
        raise HTTPException(status_code=403, detail="No puedes asignar un puesto igual o superior al tuyo")
    
    # Only system admin (level 100) can customize permissions
    permissions_input = input.get("permissions", {})
    if caller_level < 100:
        # Non-system-admin: use default role permissions, no customization
        permissions_input = {}
    
    hashed = hash_pin(pin)
    existing = await db.users.find_one({"pin_hash": hashed, "active": True}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese PIN")
    
    new_id = gen_id()
    doc = {
        "id": new_id,
        "name": input.get("name", ""),
        "last_name": input.get("last_name", ""),
        "pos_name": input.get("pos_name", input.get("name", "")),
        "pin_hash": hashed,
        "role": target_role,
        "active": True,
        "permissions": permissions_input,
        "role_level": target_level,
        "address_line1": input.get("address_line1", ""),
        "address_line2": input.get("address_line2", ""),
        "city": input.get("city", ""),
        "state": input.get("state", ""),
        "postal_code": input.get("postal_code", ""),
        "phone_home": input.get("phone_home", ""),
        "phone_work": input.get("phone_work", ""),
        "phone_mobile": input.get("phone_mobile", ""),
        "email": input.get("email", ""),
        "birth_date": input.get("birth_date", ""),
        "social_security": input.get("social_security", ""),
        "start_date": input.get("start_date", ""),
        "end_date": input.get("end_date", ""),
        "revenue_center_id": input.get("revenue_center_id", ""),
        "card_number": input.get("card_number", ""),
        "training_mode": input.get("training_mode", False),
        "system_interface": input.get("system_interface", "restaurant"),
        "web_access": input.get("web_access", False),
        "web_password": input.get("web_password", ""),
        "reference_number": input.get("reference_number", ""),
        "shift_rules": input.get("shift_rules", ""),
        "ignore_hours": input.get("ignore_hours", False),
        "manager_on_duty": input.get("manager_on_duty", False),
        "till_employee": input.get("till_employee", False),
        "positions": input.get("positions", []),
        "annual_salary": input.get("annual_salary", 0),
        "schedule": input.get("schedule", []),
        "preferred_hours": input.get("preferred_hours", 0),
        "skill_level": input.get("skill_level", 1),
        "photo_url": input.get("photo_url", ""),
    }
    await db.users.insert_one(doc)
    
    # Audit: user created
    await db.role_audit_logs.insert_one({
        "id": gen_id(),
        "action": "user_created",
        "target_user_id": new_id,
        "target_user_name": f"{doc['name']} {doc.get('last_name', '')}".strip(),
        "role_assigned": target_role,
        "role_level": target_level,
        "performed_by_id": caller["user_id"],
        "performed_by_name": caller.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    
    perms = get_permissions(doc["role"], doc["permissions"])
    result = {k: v for k, v in doc.items() if k not in ["_id", "pin_hash"]}
    result["permissions"] = perms
    return result


@router.put("/users/{user_id}")
async def update_user(user_id: str, input: dict, caller=Depends(get_current_user)):
    if "_id" in input:
        del input["_id"]
    
    # Get target user to check hierarchy
    target_user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    caller_level = await get_role_level_async(caller.get("role", "waiter"))
    target_current_level = await get_role_level_async(target_user.get("role", "waiter"))
    
    # Allow editing own profile for basic fields, but not for users at same or higher level
    is_self = caller["user_id"] == user_id
    if not is_self and target_current_level >= caller_level:
        raise HTTPException(status_code=403, detail="No puedes editar un usuario con puesto igual o superior al tuyo")
    
    # If changing role, validate the new role level
    changes_log = []
    if "role" in input and input["role"] != target_user.get("role"):
        new_role_level = await get_role_level_async(input["role"])
        if new_role_level >= caller_level:
            raise HTTPException(status_code=403, detail="No puedes asignar un puesto igual o superior al tuyo")
        input["role_level"] = new_role_level
        changes_log.append(f"Puesto: {target_user.get('role')} -> {input['role']}")
    
    # Only system admin (level 100) can customize permissions
    if "permissions" in input and caller_level < 100:
        del input["permissions"]  # Strip permission changes from non-system-admin
    elif "permissions" in input:
        old_perms = target_user.get("permissions", {})
        new_perms = input["permissions"]
        perm_changes = []
        all_keys = set(list(old_perms.keys()) + list(new_perms.keys()))
        for k in all_keys:
            old_v = old_perms.get(k)
            new_v = new_perms.get(k)
            if old_v != new_v:
                perm_changes.append(f"{k}: {old_v} -> {new_v}")
        if perm_changes:
            changes_log.append(f"Permisos: {', '.join(perm_changes)}")
    
    # Validate and update PIN if provided
    if "pin" in input and input["pin"]:
        pin = input["pin"]
        
        if not pin.isdigit():
            raise HTTPException(status_code=400, detail="El PIN debe ser numérico")
        if len(pin) < 1 or len(pin) > 8:
            raise HTTPException(status_code=400, detail="El PIN debe tener entre 1 y 8 dígitos")
        if pin.startswith("0"):
            raise HTTPException(status_code=400, detail="El PIN no puede iniciar con 0")
        
        hashed = hash_pin(pin)
        existing = await db.users.find_one({"pin_hash": hashed, "active": True, "id": {"$ne": user_id}}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un usuario con ese PIN")
        input["pin_hash"] = hashed
        changes_log.append("PIN actualizado")
    
    if "pin" in input:
        del input["pin"]
    
    await db.users.update_one({"id": user_id}, {"$set": input})
    
    # Audit: user updated (only if meaningful changes)
    if changes_log:
        await db.role_audit_logs.insert_one({
            "id": gen_id(),
            "action": "user_updated",
            "target_user_id": user_id,
            "target_user_name": f"{target_user.get('name', '')} {target_user.get('last_name', '')}".strip(),
            "changes": changes_log,
            "performed_by_id": caller["user_id"],
            "performed_by_name": caller.get("name", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str):
    await db.users.update_one({"id": user_id}, {"$set": {"active": False}})
    return {"ok": True}


# ─── TAX OVERRIDE AUTHORIZATION ───

class TaxOverrideAuthRequest(BaseModel):
    pin: str
    bill_id: str
    taxes_removed: List[str]  # List of tax codes removed (e.g., ["ITBIS", "PROPINA"])
    reference_document: str  # Required document reference

@router.post("/tax-override/authorize")
async def authorize_tax_override(input: TaxOverrideAuthRequest, user=Depends(get_current_user)):
    """
    Validates admin PIN for tax override and logs the action.
    Returns authorization token if successful.
    """
    # Hash the PIN and find the authorizing user
    hashed_pin = hash_pin(input.pin)
    auth_user = await db.users.find_one({"pin_hash": hashed_pin, "active": True}, {"_id": 0})
    
    if not auth_user:
        raise HTTPException(status_code=401, detail="PIN inválido")
    
    # Check if authorizing user has tax override permission
    auth_role = auth_user.get("role", "waiter")
    auth_permissions = DEFAULT_PERMISSIONS.get(auth_role, {})
    
    # Check custom role permissions
    if auth_user.get("custom_role_id"):
        custom_role = await db.custom_roles.find_one({"id": auth_user["custom_role_id"]}, {"_id": 0})
        if custom_role:
            auth_permissions = {**auth_permissions, **custom_role.get("permissions", {})}
    
    if not auth_permissions.get("can_manage_tax_override"):
        raise HTTPException(status_code=403, detail="El usuario no tiene permiso para ajustar impuestos")
    
    # Validate reference document
    if not input.reference_document or len(input.reference_document.strip()) < 3:
        raise HTTPException(status_code=400, detail="Referencia/Documento es obligatorio (mínimo 3 caracteres)")
    
    # Create audit log entry
    audit_entry = {
        "id": str(uuid.uuid4()),
        "action": "tax_override",
        "bill_id": input.bill_id,
        "taxes_removed": input.taxes_removed,
        "reference_document": input.reference_document.strip(),
        "authorized_by_id": auth_user["id"],
        "authorized_by_name": auth_user["name"],
        "authorized_by_role": auth_role,
        "requested_by_id": user["user_id"],
        "requested_by_name": user["name"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.tax_override_audit.insert_one(audit_entry)
    
    return {
        "authorized": True,
        "authorized_by": auth_user["name"],
        "authorized_by_id": auth_user["id"],
        "audit_id": audit_entry["id"],
        "reference_document": input.reference_document.strip()
    }

@router.get("/tax-override/check-permission")
async def check_tax_override_permission(user=Depends(get_current_user)):
    """Check if current user has tax override permission"""
    role = user.get("role", "waiter")
    permissions = DEFAULT_PERMISSIONS.get(role, {})
    
    # Check custom role
    user_doc = await db.users.find_one({"id": user["user_id"]}, {"_id": 0})
    if user_doc and user_doc.get("custom_role_id"):
        custom_role = await db.custom_roles.find_one({"id": user_doc["custom_role_id"]}, {"_id": 0})
        if custom_role:
            permissions = {**permissions, **custom_role.get("permissions", {})}
    
    return {
        "has_permission": permissions.get("can_manage_tax_override", False),
        "user_id": user["user_id"],
        "role": role
    }


# ─── TRAINING STATS ───

@router.get("/users/{user_id}/training-stats")
async def get_training_stats(user_id: str, user=Depends(get_current_user)):
    """Estadísticas de entrenamiento de un empleado"""
    target_user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "training_mode": 1})
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Orders
    orders_pipeline = [
        {"$match": {"training_mode": True, "$or": [{"waiter_id": user_id}, {"cashier_id": user_id}]}},
        {"$group": {
            "_id": None,
            "total_orders": {"$sum": 1},
            "total_items": {"$sum": {"$size": {"$ifNull": ["$items", []]}}},
            "first_activity": {"$min": "$created_at"},
            "last_activity": {"$max": "$created_at"},
        }}
    ]
    orders_result = await db.orders.aggregate(orders_pipeline).to_list(1)
    orders_stats = orders_result[0] if orders_result else {}

    # Bills
    bills_pipeline = [
        {"$match": {"training_mode": True, "$or": [{"cashier_id": user_id}, {"paid_by_id": user_id}]}},
        {"$group": {
            "_id": None,
            "total_bills": {"$sum": 1},
            "total_amount": {"$sum": "$total"},
            "paid_count": {"$sum": {"$cond": [{"$eq": ["$status", "paid"]}, 1, 0]}},
            "last_bill": {"$max": "$paid_at"},
        }}
    ]
    bills_result = await db.bills.aggregate(bills_pipeline).to_list(1)
    bills_stats = bills_result[0] if bills_result else {}

    # Recent training activity (last 10 bills)
    recent_bills = await db.bills.find(
        {"training_mode": True, "$or": [{"cashier_id": user_id}, {"paid_by_id": user_id}]},
        {"_id": 0, "id": 1, "total": 1, "status": 1, "created_at": 1, "paid_at": 1, "items": 1}
    ).sort("created_at", -1).limit(10).to_list(10)

    recent = []
    for b in recent_bills:
        recent.append({
            "id": b["id"],
            "total": b.get("total", 0),
            "status": b.get("status", "?"),
            "date": b.get("paid_at") or b.get("created_at", ""),
            "items_count": len(b.get("items", [])),
        })

    last_activity = orders_stats.get("last_activity") or bills_stats.get("last_bill")
    first_activity = orders_stats.get("first_activity")

    return {
        "user_id": user_id,
        "user_name": target_user.get("name", ""),
        "training_active": target_user.get("training_mode", False),
        "orders_count": orders_stats.get("total_orders", 0),
        "items_practiced": orders_stats.get("total_items", 0),
        "bills_count": bills_stats.get("total_bills", 0),
        "bills_paid": bills_stats.get("paid_count", 0),
        "total_amount_practiced": round(bills_stats.get("total_amount", 0), 2),
        "first_activity": first_activity,
        "last_activity": last_activity,
        "recent_activity": recent,
    }


# ─── CUSTOM ROLES ───

@router.get("/roles")
async def list_roles(caller=Depends(get_current_user)):
    roles = await db.custom_roles.find({}, {"_id": 0}).to_list(100)
    caller_level = await get_role_level_async(caller.get("role", "waiter"))
    builtin = [
        {"id": "admin", "code": "admin", "name": "Administrador", "builtin": True, "level": 100, "permissions": DEFAULT_PERMISSIONS.get("admin", {})},
        {"id": "waiter", "code": "waiter", "name": "Mesero", "builtin": True, "level": 20, "permissions": DEFAULT_PERMISSIONS.get("waiter", {})},
        {"id": "cashier", "code": "cashier", "name": "Cajero", "builtin": True, "level": 20, "permissions": DEFAULT_PERMISSIONS.get("cashier", {})},
        {"id": "supervisor", "code": "supervisor", "name": "Supervisor", "builtin": True, "level": 40, "permissions": DEFAULT_PERMISSIONS.get("supervisor", {})},
        {"id": "kitchen", "code": "kitchen", "name": "Cocina", "builtin": True, "level": 10, "permissions": DEFAULT_PERMISSIONS.get("kitchen", {})},
    ]
    all_roles = builtin + roles
    # Filter: only show roles with level < caller's level (so they can only assign inferior roles)
    # System admin (100) sees all except their own level if they want
    # But admin should see all roles to manage them
    if caller_level >= 100:
        return all_roles
    return [r for r in all_roles if r.get("level", 0) < caller_level]


@router.post("/roles")
async def create_role(input: dict, caller=Depends(get_current_user)):
    caller_level = await get_role_level_async(caller.get("role", "waiter"))
    if caller_level < 100:
        raise HTTPException(status_code=403, detail="Solo el Administrador del Sistema puede crear puestos")
    
    level = input.get("level", 0)
    if level >= 100:
        raise HTTPException(status_code=400, detail="No puedes crear un puesto con nivel igual o superior al administrador del sistema")
    
    doc = {"id": gen_id(), **input, "builtin": False, "level": level}
    await db.custom_roles.insert_one(doc)
    
    # Audit
    await db.role_audit_logs.insert_one({
        "id": gen_id(),
        "action": "role_created",
        "role_name": input.get("name", ""),
        "role_code": input.get("code", ""),
        "role_level": level,
        "performed_by_id": caller["user_id"],
        "performed_by_name": caller.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/roles/{rid}")
async def update_role(rid: str, input: dict, caller=Depends(get_current_user)):
    caller_level = await get_role_level_async(caller.get("role", "waiter"))
    if caller_level < 100:
        raise HTTPException(status_code=403, detail="Solo el Administrador del Sistema puede editar puestos")
    if "_id" in input:
        del input["_id"]
    
    if "level" in input and input["level"] >= 100:
        raise HTTPException(status_code=400, detail="No puedes asignar nivel igual o superior al administrador del sistema")
    
    old_role = await db.custom_roles.find_one({"id": rid}, {"_id": 0})
    await db.custom_roles.update_one({"id": rid}, {"$set": input})
    
    # Audit
    await db.role_audit_logs.insert_one({
        "id": gen_id(),
        "action": "role_updated",
        "role_id": rid,
        "role_name": input.get("name", old_role.get("name", "") if old_role else ""),
        "changes": str(input),
        "performed_by_id": caller["user_id"],
        "performed_by_name": caller.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    
    return {"ok": True}


@router.delete("/roles/{rid}")
async def delete_role(rid: str, caller=Depends(get_current_user)):
    caller_level = await get_role_level_async(caller.get("role", "waiter"))
    if caller_level < 100:
        raise HTTPException(status_code=403, detail="Solo el Administrador del Sistema puede eliminar puestos")
    
    old_role = await db.custom_roles.find_one({"id": rid}, {"_id": 0})
    await db.custom_roles.delete_one({"id": rid})
    
    # Audit
    await db.role_audit_logs.insert_one({
        "id": gen_id(),
        "action": "role_deleted",
        "role_id": rid,
        "role_name": old_role.get("name", "") if old_role else "",
        "performed_by_id": caller["user_id"],
        "performed_by_name": caller.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    
    return {"ok": True}


# ─── ROLE AUDIT LOG ───

@router.get("/role-audit-logs")
async def list_role_audit_logs(limit: int = 50, caller=Depends(get_current_user)):
    """List audit logs for role/permission changes - only system admin"""
    caller_level = await get_role_level_async(caller.get("role", "waiter"))
    if caller_level < 100:
        raise HTTPException(status_code=403, detail="Solo el Administrador del Sistema puede ver los logs de auditoría de roles")
    logs = await db.role_audit_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs


# ─── MANAGER VERIFICATION ───

@router.post("/auth/verify-manager")
async def verify_manager(input: dict, user=Depends(get_current_user)):
    """
    Verify a manager PIN for authorization.
    Admin role has SUPERUSER override - all permissions enabled by default.
    Supervisor and manager_on_duty can also authorize.
    """
    pin = input.get("pin", "")
    required_permission = input.get("permission", "void_items")  # Default permission to check
    
    if not pin:
        raise HTTPException(status_code=400, detail="PIN es requerido")
    
    # Validate PIN format
    if not pin.isdigit():
        raise HTTPException(status_code=400, detail="El PIN debe ser numérico")
    
    if len(pin) < 1 or len(pin) > 8:
        raise HTTPException(status_code=400, detail="El PIN debe tener entre 1 y 8 dígitos")
    
    if pin.startswith("0"):
        raise HTTPException(status_code=400, detail="El PIN no puede iniciar con 0")
    
    # Find user by PIN
    hashed = hash_pin(pin)
    manager = await db.users.find_one({"pin_hash": hashed, "active": True}, {"_id": 0})
    
    if not manager:
        raise HTTPException(status_code=401, detail="PIN incorrecto")
    
    # Get user role and permissions
    role = manager.get("role", "")
    custom_permissions = manager.get("permissions", {})
    
    # SUPERUSER RULE: Admin role has ALL permissions by default (override)
    if role == "admin":
        # Admin is superuser - always authorized for any action
        return {
            "authorized": True,
            "user_id": manager["id"],
            "user_name": manager.get("name", ""),
            "role": role,
            "is_superuser": True,
            "permission_granted": required_permission
        }
    
    # For non-admin roles, check if they can authorize
    is_manager = role == "supervisor" or manager.get("manager_on_duty", False)
    
    if not is_manager:
        raise HTTPException(status_code=403, detail="Este usuario no tiene permisos de gerente")
    
    # Get full permissions for this user (role defaults + custom overrides)
    full_permissions = get_permissions(role, custom_permissions)
    
    # Check if user has the required permission
    has_permission = full_permissions.get(required_permission, False)
    
    if not has_permission:
        raise HTTPException(
            status_code=403, 
            detail=f"Usuario sin permiso: {ALL_PERMISSIONS.get(required_permission, required_permission)}"
        )
    
    return {
        "authorized": True,
        "user_id": manager["id"],
        "user_name": manager.get("name", ""),
        "role": role,
        "is_superuser": False,
        "permission_granted": required_permission
    }
