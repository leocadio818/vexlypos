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
    token = jwt.encode({"user_id": user["id"], "name": user["name"], "role": user["role"]}, JWT_SECRET, algorithm="HS256")
    user_data = {k: v for k, v in user.items() if k != "pin_hash"}
    user_data["permissions"] = perms
    return {"token": token, "user": user_data}


@router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["user_id"]}, {"_id": 0, "pin_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u["permissions"] = get_permissions(u["role"], u.get("permissions"))
    return u


@router.get("/users")
async def list_users():
    users = await db.users.find({}, {"_id": 0, "pin_hash": 0}).to_list(100)
    for u in users:
        u["permissions"] = get_permissions(u["role"], u.get("permissions"))
    return users


@router.get("/users/{user_id}")
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user["permissions"] = get_permissions(user.get("role", "waiter"), user.get("permissions"))
    return user


@router.post("/users")
async def create_user(input: dict):
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
    
    hashed = hash_pin(pin)
    existing = await db.users.find_one({"pin_hash": hashed, "active": True}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un usuario con ese PIN")
    
    doc = {
        "id": gen_id(),
        "name": input.get("name", ""),
        "last_name": input.get("last_name", ""),
        "pos_name": input.get("pos_name", input.get("name", "")),
        "pin_hash": hashed,
        "role": input.get("role", "waiter"),
        "active": True,
        "permissions": input.get("permissions", {}),
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
    perms = get_permissions(doc["role"], doc["permissions"])
    result = {k: v for k, v in doc.items() if k not in ["_id", "pin_hash"]}
    result["permissions"] = perms
    return result


@router.put("/users/{user_id}")
async def update_user(user_id: str, input: dict):
    if "_id" in input: del input["_id"]
    
    # Validate and update PIN if provided
    if "pin" in input and input["pin"]:
        pin = input["pin"]
        
        # Validate PIN format
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
    
    if "pin" in input:
        del input["pin"]
    
    await db.users.update_one({"id": user_id}, {"$set": input})
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
    auth_permissions = ROLE_PERMISSIONS.get(auth_role, {})
    
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
    permissions = ROLE_PERMISSIONS.get(role, {})
    
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


# ─── CUSTOM ROLES ───

@router.get("/roles")
async def list_roles():
    roles = await db.custom_roles.find({}, {"_id": 0}).to_list(100)
    builtin = [
        {"id": "admin", "name": "Administrador", "builtin": True, "permissions": DEFAULT_PERMISSIONS.get("admin", {})},
        {"id": "waiter", "name": "Mesero", "builtin": True, "permissions": DEFAULT_PERMISSIONS.get("waiter", {})},
        {"id": "cashier", "name": "Cajero", "builtin": True, "permissions": DEFAULT_PERMISSIONS.get("cashier", {})},
        {"id": "supervisor", "name": "Supervisor", "builtin": True, "permissions": DEFAULT_PERMISSIONS.get("supervisor", {})},
        {"id": "kitchen", "name": "Cocina", "builtin": True, "permissions": DEFAULT_PERMISSIONS.get("kitchen", {})},
    ]
    return builtin + roles


@router.post("/roles")
async def create_role(input: dict):
    doc = {"id": gen_id(), **input, "builtin": False}
    await db.custom_roles.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/roles/{rid}")
async def update_role(rid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.custom_roles.update_one({"id": rid}, {"$set": input})
    return {"ok": True}


@router.delete("/roles/{rid}")
async def delete_role(rid: str):
    await db.custom_roles.delete_one({"id": rid})
    return {"ok": True}


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
