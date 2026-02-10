from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import os, logging, uuid, hashlib, jwt, asyncio, resend
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback_secret')
resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

app = FastAPI()
api = APIRouter(prefix="/api")

# Utils
def hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode()).hexdigest()

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

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
        "access_all_tables": True,  # Can access any table regardless of owner
    },
    "waiter": {
        "open_table": True, "add_products": True, "void_items": True, "send_kitchen": True,
        "split_bill": True, "manage_reservations": True, "manage_customers": True,
        "access_all_tables": False,  # Can only access own tables
    },
    "cashier": {
        "open_table": True, "add_products": True, "void_items": True, "send_kitchen": True,
        "create_bill": True, "collect_payment": True, "split_bill": True,
        "open_shift": True, "close_shift": True, "manage_customers": True,
        "access_all_tables": True,  # Cashiers can access any table to collect payment
    },
    "supervisor": {
        "view_dashboard": True, "move_tables": True,
        "open_table": True, "add_products": True, "void_items": True, "send_kitchen": True,
        "create_bill": True, "collect_payment": True, "split_bill": True,
        "manage_reservations": True, "manage_customers": True,
        "view_reports": True,
        "open_shift": True, "close_shift": True,
        "access_all_tables": True,  # Supervisors can access any table
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
    # Apply default permissions with their actual values (True or False)
    base.update(defaults)
    if custom:
        base.update(custom)
    return base

def can_access_table_orders(user: dict, orders: list) -> bool:
    """Check if user can access orders on a table based on ownership and permissions"""
    perms = get_permissions(user.get("role", "waiter"), user.get("permissions"))
    
    # Users with access_all_tables permission can access any table
    if perms.get("access_all_tables", False):
        return True
    
    # If no orders, anyone can access (to create new order)
    if not orders:
        return True
    
    # Check if user owns any of the orders on this table
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

@api.get("/permissions/all")
async def list_all_permissions():
    return ALL_PERMISSIONS

# ─── CUSTOM ROLES ───
@api.get("/roles")
async def list_roles():
    roles = await db.custom_roles.find({}, {"_id": 0}).to_list(50)
    if not roles:
        defaults = [
            {"id": gen_id(), "name": "Administrador", "code": "admin", "is_system": True},
            {"id": gen_id(), "name": "Mesero", "code": "waiter", "is_system": True},
            {"id": gen_id(), "name": "Cajero", "code": "cashier", "is_system": True},
            {"id": gen_id(), "name": "Supervisor", "code": "supervisor", "is_system": True},
            {"id": gen_id(), "name": "Cocina", "code": "kitchen", "is_system": True},
        ]
        await db.custom_roles.insert_many(defaults)
        return defaults
    return roles

@api.post("/roles")
async def create_role(input: dict):
    doc = {"id": gen_id(), "name": input.get("name",""), "code": input.get("code","custom"), "is_system": False}
    await db.custom_roles.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/roles/{rid}")
async def update_role(rid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.custom_roles.update_one({"id": rid}, {"$set": input})
    return {"ok": True}

@api.delete("/roles/{rid}")
async def delete_role(rid: str):
    await db.custom_roles.delete_one({"id": rid})
    return {"ok": True}

async def get_current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No token provided")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ─── INPUT MODELS ───
class LoginInput(BaseModel):
    pin: str

class UserInput(BaseModel):
    name: str
    pin: str
    role: str = "waiter"

class AreaInput(BaseModel):
    name: str
    color: str = "#FF6600"

class TableInput(BaseModel):
    number: int
    area_id: str
    capacity: int = 4
    shape: str = "round"
    x: float = 50
    y: float = 50
    width: float = 80
    height: float = 80

class CategoryInput(BaseModel):
    name: str
    color: str = "#FF6600"
    icon: str = "utensils"

class ProductModifierAssignment(BaseModel):
    group_id: str
    min_selections: int = 0
    max_selections: int = 0
    allow_multiple: bool = False

class ProductInput(BaseModel):
    name: str
    printed_name: str = ""
    category_id: str
    report_category_id: str = ""
    price: float
    price_a: float = 0
    price_b: float = 0
    price_c: float = 0
    price_d: float = 0
    price_e: float = 0
    button_bg_color: str = ""
    button_text_color: str = ""
    modifier_group_ids: List[str] = []
    modifier_assignments: List[ProductModifierAssignment] = []
    track_inventory: bool = False

class ModifierOptionInput(BaseModel):
    name: str
    price: float = 0

class ModifierGroupInput(BaseModel):
    name: str
    required: bool = False
    max_selections: int = 0
    options: List[ModifierOptionInput] = []

class OrderItemInput(BaseModel):
    product_id: str
    product_name: str
    quantity: float = 1
    unit_price: float
    modifiers: List[dict] = []
    notes: str = ""

class CreateOrderInput(BaseModel):
    table_id: str
    items: List[OrderItemInput] = []

class AddItemsInput(BaseModel):
    items: List[OrderItemInput]

class CreateBillInput(BaseModel):
    order_id: str
    table_id: str
    label: str = ""
    item_ids: List[str] = []
    tip_percentage: float = 10
    payment_method: str = "cash"
    customer_id: str = ""

class PayBillInput(BaseModel):
    payment_method: str = "cash"
    payment_method_id: str = ""
    tip_percentage: float = 0
    additional_tip: float = 0
    customer_id: str = ""
    sale_type: str = "dine_in"

class CancelItemInput(BaseModel):
    reason_id: str
    return_to_inventory: bool = False

class CancellationReasonInput(BaseModel):
    name: str
    return_to_inventory: bool = True

class ShiftOpenInput(BaseModel):
    station: str = "Caja 1"
    opening_amount: float = 0

class ShiftCloseInput(BaseModel):
    closing_amount: float = 0
    cash_count: Optional[dict] = None

class WarehouseInput(BaseModel):
    name: str
    location: str = ""

class SupplierInput(BaseModel):
    name: str
    contact_name: str = ""
    phone: str = ""
    email: str = ""
    address: str = ""
    rnc: str = ""

class RecipeIngredientInput(BaseModel):
    ingredient_name: str
    quantity: float
    unit: str = "unidad"
    cost: float = 0

class RecipeInput(BaseModel):
    product_id: str
    product_name: str
    ingredients: List[RecipeIngredientInput]
    yield_quantity: float = 1

class POItemInput(BaseModel):
    product_id: str
    product_name: str
    quantity: float
    unit_price: float

class PurchaseOrderInput(BaseModel):
    supplier_id: str
    warehouse_id: str = ""
    items: List[POItemInput]
    notes: str = ""

class ReceivePOItemInput(BaseModel):
    product_id: str
    received_quantity: float

class ReceivePOInput(BaseModel):
    warehouse_id: str
    items: List[ReceivePOItemInput]

class CustomerInput(BaseModel):
    name: str
    phone: str = ""
    email: str = ""

class InventoryAdjustInput(BaseModel):
    product_id: str
    warehouse_id: str
    quantity: float
    reason: str = "Ajuste manual"

class EmailInput(BaseModel):
    to: str
    subject: str
    html: str

# ─── AUTH ───
@api.post("/auth/login")
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

@api.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["user_id"]}, {"_id": 0, "pin_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u["permissions"] = get_permissions(u["role"], u.get("permissions"))
    return u

# ─── USERS ───
@api.get("/users")
async def list_users():
    users = await db.users.find({}, {"_id": 0, "pin_hash": 0}).to_list(100)
    for u in users:
        u["permissions"] = get_permissions(u["role"], u.get("permissions"))
    return users

@api.get("/users/{user_id}")
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user["permissions"] = get_permissions(user.get("role", "waiter"), user.get("permissions"))
    return user

@api.post("/users")
async def create_user(input: dict):
    # Check duplicate PIN
    if "pin" not in input or len(input.get("pin", "")) < 4:
        raise HTTPException(status_code=400, detail="PIN debe tener mínimo 4 dígitos")
    hashed = hash_pin(input["pin"])
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
        # Contact info
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
        # Employment
        "start_date": input.get("start_date", ""),
        "end_date": input.get("end_date", ""),
        "revenue_center_id": input.get("revenue_center_id", ""),
        "card_number": input.get("card_number", ""),
        "training_mode": input.get("training_mode", False),
        # Advanced
        "system_interface": input.get("system_interface", "restaurant"),
        "web_access": input.get("web_access", False),
        "web_password": input.get("web_password", ""),
        "reference_number": input.get("reference_number", ""),
        "shift_rules": input.get("shift_rules", ""),
        "ignore_hours": input.get("ignore_hours", False),
        "manager_on_duty": input.get("manager_on_duty", False),
        "till_employee": input.get("till_employee", False),
        # Positions
        "positions": input.get("positions", []),
        "annual_salary": input.get("annual_salary", 0),
        # Schedule
        "schedule": input.get("schedule", []),
        "preferred_hours": input.get("preferred_hours", 0),
        "skill_level": input.get("skill_level", 1),
        # Photo
        "photo_url": input.get("photo_url", ""),
    }
    await db.users.insert_one(doc)
    perms = get_permissions(doc["role"], doc["permissions"])
    result = {k: v for k, v in doc.items() if k not in ["_id", "pin_hash"]}
    result["permissions"] = perms
    return result

@api.put("/users/{user_id}")
async def update_user(user_id: str, input: dict):
    if "_id" in input: del input["_id"]
    if "pin" in input and input["pin"]:
        hashed = hash_pin(input["pin"])
        existing = await db.users.find_one({"pin_hash": hashed, "active": True, "id": {"$ne": user_id}}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un usuario con ese PIN")
        input["pin_hash"] = hashed
    if "pin" in input:
        del input["pin"]
    await db.users.update_one({"id": user_id}, {"$set": input})
    return {"ok": True}

@api.delete("/users/{user_id}")
async def delete_user(user_id: str):
    await db.users.update_one({"id": user_id}, {"$set": {"active": False}})
    return {"ok": True}

# ─── PAYMENT METHODS ───
@api.get("/payment-methods")
async def list_payment_methods():
    methods = await db.payment_methods.find({}, {"_id": 0}).to_list(50)
    if not methods:
        defaults = [
            {"id": gen_id(), "name": "Efectivo", "icon": "banknote", "currency": "DOP", "exchange_rate": 1, "active": True},
            {"id": gen_id(), "name": "Tarjeta de Credito", "icon": "credit-card", "currency": "DOP", "exchange_rate": 1, "active": True},
            {"id": gen_id(), "name": "Tarjeta de Debito", "icon": "credit-card", "currency": "DOP", "exchange_rate": 1, "active": True},
            {"id": gen_id(), "name": "Transferencia", "icon": "smartphone", "currency": "DOP", "exchange_rate": 1, "active": True},
            {"id": gen_id(), "name": "Dolar (USD)", "icon": "dollar-sign", "currency": "USD", "exchange_rate": 58.50, "active": True},
            {"id": gen_id(), "name": "Euro (EUR)", "icon": "euro", "currency": "EUR", "exchange_rate": 63.20, "active": True},
        ]
        await db.payment_methods.insert_many(defaults)
        return defaults
    return methods

@api.post("/payment-methods")
async def create_payment_method(input: dict):
    doc = {"id": gen_id(), "name": input.get("name", ""), "icon": input.get("icon", "circle"), "active": True}
    await db.payment_methods.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/payment-methods/{mid}")
async def update_payment_method(mid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.payment_methods.update_one({"id": mid}, {"$set": input})
    return {"ok": True}

@api.delete("/payment-methods/{mid}")
async def delete_payment_method(mid: str):
    await db.payment_methods.delete_one({"id": mid})
    return {"ok": True}

# ─── AREAS ───
@api.get("/areas")
async def list_areas():
    return await db.areas.find({}, {"_id": 0}).sort("order", 1).to_list(50)

@api.post("/areas")
async def create_area(input: AreaInput):
    count = await db.areas.count_documents({})
    doc = {"id": gen_id(), "name": input.name, "color": input.color, "order": count}
    await db.areas.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"], "color": doc["color"], "order": doc["order"]}

@api.put("/areas/{area_id}")
async def update_area(area_id: str, input: dict):
    await db.areas.update_one({"id": area_id}, {"$set": input})
    return {"ok": True}

@api.delete("/areas/{area_id}")
async def delete_area(area_id: str):
    await db.areas.delete_one({"id": area_id})
    return {"ok": True}

# ─── TABLES ───
@api.get("/tables")
async def list_tables(area_id: Optional[str] = Query(None)):
    query = {"area_id": area_id} if area_id else {}
    tables = await db.tables.find(query, {"_id": 0}).to_list(200)
    
    # For occupied/divided tables, get the owner (waiter) info from active orders
    for table in tables:
        if table["status"] in ["occupied", "divided"]:
            # Get the first active order to find the owner
            order = await db.orders.find_one(
                {"table_id": table["id"], "status": {"$in": ["active", "sent"]}},
                {"_id": 0, "waiter_id": 1, "waiter_name": 1}
            )
            if order:
                table["owner_id"] = order.get("waiter_id")
                table["owner_name"] = order.get("waiter_name")
    
    return tables

@api.post("/tables")
async def create_table(input: TableInput):
    doc = {
        "id": gen_id(), "number": input.number, "area_id": input.area_id,
        "capacity": input.capacity, "shape": input.shape,
        "x": input.x, "y": input.y, "width": input.width, "height": input.height,
        "status": "free", "active_order_id": None
    }
    await db.tables.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/tables/{table_id}")
async def update_table(table_id: str, input: dict):
    if "_id" in input:
        del input["_id"]
    await db.tables.update_one({"id": table_id}, {"$set": input})
    return {"ok": True}

@api.delete("/tables/{table_id}")
async def delete_table(table_id: str):
    await db.tables.delete_one({"id": table_id})
    return {"ok": True}

# ─── CATEGORIES ───
@api.get("/categories")
async def list_categories():
    return await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(50)

@api.post("/categories")
async def create_category(input: CategoryInput):
    count = await db.categories.count_documents({})
    doc = {"id": gen_id(), "name": input.name, "color": input.color, "icon": input.icon, "order": count}
    await db.categories.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

# ─── PRODUCTS ───
@api.get("/products")
async def list_products(category_id: Optional[str] = Query(None)):
    query = {"category_id": category_id, "active": True} if category_id else {"active": True}
    return await db.products.find(query, {"_id": 0}).to_list(500)

@api.get("/products/{product_id}")
async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product

@api.post("/products")
async def create_product(input: ProductInput):
    modifier_assignments = [ma.model_dump() for ma in input.modifier_assignments] if input.modifier_assignments else []
    doc = {
        "id": gen_id(), 
        "name": input.name, 
        "printed_name": input.printed_name or input.name,
        "category_id": input.category_id,
        "report_category_id": input.report_category_id,
        "price": input.price, 
        "price_a": input.price_a or input.price,
        "price_b": input.price_b,
        "price_c": input.price_c,
        "price_d": input.price_d,
        "price_e": input.price_e,
        "button_bg_color": input.button_bg_color,
        "button_text_color": input.button_text_color,
        "modifier_group_ids": input.modifier_group_ids,
        "modifier_assignments": modifier_assignments,
        "track_inventory": input.track_inventory, 
        "active": True
    }
    await db.products.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/products/{product_id}")
async def update_product(product_id: str, input: dict):
    if "_id" in input:
        del input["_id"]
    await db.products.update_one({"id": product_id}, {"$set": input})
    return {"ok": True}

# ─── MODIFIERS ───
@api.get("/modifiers")
async def list_modifiers():
    return await db.modifiers.find({}, {"_id": 0}).to_list(100)

@api.get("/modifiers/{modifier_id}")
async def get_modifier(modifier_id: str):
    modifier = await db.modifiers.find_one({"id": modifier_id}, {"_id": 0})
    if not modifier:
        raise HTTPException(status_code=404, detail="Grupo de modificador no encontrado")
    return modifier

@api.post("/modifiers")
async def create_modifier(input: ModifierGroupInput):
    options = [{"id": gen_id(), "name": o.name, "price": o.price} for o in input.options]
    doc = {"id": gen_id(), "name": input.name, "required": input.required, "max_selections": input.max_selections, "options": options, "active": True}
    await db.modifiers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/modifiers/{modifier_id}")
async def update_modifier(modifier_id: str, input: dict):
    if "_id" in input:
        del input["_id"]
    # Handle options update - add IDs to new options
    if "options" in input:
        for opt in input["options"]:
            if "id" not in opt:
                opt["id"] = gen_id()
    await db.modifiers.update_one({"id": modifier_id}, {"$set": input})
    return {"ok": True}

@api.delete("/modifiers/{modifier_id}")
async def delete_modifier(modifier_id: str):
    await db.modifiers.delete_one({"id": modifier_id})
    return {"ok": True}

# ─── REPORT CATEGORIES ───
@api.get("/report-categories")
async def list_report_categories():
    cats = await db.report_categories.find({}, {"_id": 0}).to_list(50)
    if not cats:
        # Default report categories
        defaults = [
            {"id": gen_id(), "name": "Alimentos", "code": "food"},
            {"id": gen_id(), "name": "Bebidas", "code": "beverages"},
            {"id": gen_id(), "name": "Postres", "code": "desserts"},
            {"id": gen_id(), "name": "Licores", "code": "liquor"},
            {"id": gen_id(), "name": "Otros", "code": "other"},
        ]
        await db.report_categories.insert_many(defaults)
        # Return without _id
        return [{k: v for k, v in d.items() if k != "_id"} for d in defaults]
    return cats

@api.post("/report-categories")
async def create_report_category(input: dict):
    doc = {"id": gen_id(), "name": input.get("name", ""), "code": input.get("code", "")}
    await db.report_categories.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/report-categories/{cat_id}")
async def update_report_category(cat_id: str, input: dict):
    if "_id" in input:
        del input["_id"]
    await db.report_categories.update_one({"id": cat_id}, {"$set": input})
    return {"ok": True}

@api.delete("/report-categories/{cat_id}")
async def delete_report_category(cat_id: str):
    await db.report_categories.delete_one({"id": cat_id})
    return {"ok": True}

# ─── ORDERS ───
@api.get("/orders")
async def list_orders(status: Optional[str] = Query(None), table_id: Optional[str] = Query(None)):
    query = {}
    if status:
        query["status"] = status
    if table_id:
        query["table_id"] = table_id
    return await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)

@api.get("/orders/{order_id}")
async def get_order(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return order

@api.post("/orders")
async def create_order(input: CreateOrderInput, user=Depends(get_current_user)):
    existing = await db.orders.find_one(
        {"table_id": input.table_id, "status": {"$in": ["active", "sent"]}}, {"_id": 0}
    )
    if existing:
        return existing

    table = await db.tables.find_one({"id": input.table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")

    items = []
    for item in input.items:
        items.append({
            "id": gen_id(), "product_id": item.product_id, "product_name": item.product_name,
            "quantity": item.quantity, "unit_price": item.unit_price,
            "modifiers": item.modifiers, "notes": item.notes,
            "status": "pending", "sent_to_kitchen": False,
            "cancelled_reason_id": None, "return_to_inventory": False
        })

    order_id = gen_id()
    order = {
        "id": order_id, "table_id": input.table_id, "table_number": table["number"],
        "waiter_id": user["user_id"], "waiter_name": user["name"],
        "status": "active", "items": items,
        "created_at": now_iso(), "updated_at": now_iso()
    }
    await db.orders.insert_one(order)
    await db.tables.update_one(
        {"id": input.table_id},
        {"$set": {"status": "occupied", "active_order_id": order_id}}
    )
    return {k: v for k, v in order.items() if k != "_id"}

@api.post("/orders/{order_id}/items")
async def add_items_to_order(order_id: str, input: AddItemsInput):
    new_items = []
    for item in input.items:
        new_items.append({
            "id": gen_id(), "product_id": item.product_id, "product_name": item.product_name,
            "quantity": item.quantity, "unit_price": item.unit_price,
            "modifiers": item.modifiers, "notes": item.notes,
            "status": "pending", "sent_to_kitchen": False,
            "cancelled_reason_id": None, "return_to_inventory": False
        })
    await db.orders.update_one(
        {"id": order_id},
        {"$push": {"items": {"$each": new_items}}, "$set": {"updated_at": now_iso()}}
    )
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

@api.put("/orders/{order_id}/items/{item_id}")
async def update_order_item(order_id: str, item_id: str, input: dict):
    update_fields = {f"items.$.{k}": v for k, v in input.items()}
    update_fields["updated_at"] = now_iso()
    await db.orders.update_one(
        {"id": order_id, "items.id": item_id},
        {"$set": update_fields}
    )
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

@api.post("/orders/{order_id}/cancel-item/{item_id}")
async def cancel_order_item(order_id: str, item_id: str, input: CancelItemInput):
    await db.orders.update_one(
        {"id": order_id, "items.id": item_id},
        {"$set": {
            "items.$.status": "cancelled",
            "items.$.cancelled_reason_id": input.reason_id,
            "items.$.return_to_inventory": input.return_to_inventory,
            "updated_at": now_iso()
        }}
    )
    if input.return_to_inventory:
        order = await db.orders.find_one({"id": order_id}, {"_id": 0})
        if order:
            item = next((i for i in order["items"] if i["id"] == item_id), None)
            if item:
                await db.inventory.update_one(
                    {"product_id": item["product_id"]},
                    {"$inc": {"stock": item["quantity"]}},
                    upsert=True
                )
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

@api.post("/orders/{order_id}/send-kitchen")
async def send_to_kitchen(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    pending_ids = [i["id"] for i in order["items"] if i["status"] == "pending"]
    for pid in pending_ids:
        await db.orders.update_one(
            {"id": order_id, "items.id": pid},
            {"$set": {"items.$.status": "sent", "items.$.sent_to_kitchen": True}}
        )
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "sent", "updated_at": now_iso()}})
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

# ─── MOVE ORDER / MERGE ORDERS ───
@api.post("/orders/{order_id}/move")
async def move_order_to_table(order_id: str, input: dict, user: dict = Depends(get_current_user)):
    """Move an order to a different table. If destination has order, merge them."""
    target_table_id = input.get("target_table_id")
    merge = input.get("merge", False)
    
    # Get source order
    source_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not source_order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    source_table_id = source_order["table_id"]
    
    # Get source table for logging
    source_table = await db.tables.find_one({"id": source_table_id}, {"_id": 0})
    
    # Get target table
    target_table = await db.tables.find_one({"id": target_table_id}, {"_id": 0})
    if not target_table:
        raise HTTPException(status_code=404, detail="Mesa destino no encontrada")
    
    # Check if target table has an active order
    target_order = await db.orders.find_one(
        {"table_id": target_table_id, "status": {"$in": ["active", "sent"]}}, {"_id": 0}
    )
    
    if target_order and not merge:
        # Return info that merge is needed
        return {"needs_merge": True, "target_order_id": target_order["id"], "target_table_number": target_table["number"]}
    
    if target_order and merge:
        # Merge: move all items from source to target order
        source_items = source_order.get("items", [])
        await db.orders.update_one(
            {"id": target_order["id"]},
            {"$push": {"items": {"$each": source_items}}, "$set": {"updated_at": now_iso()}}
        )
        # Cancel/close source order
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"status": "merged", "merged_into": target_order["id"], "items": [], "updated_at": now_iso()}}
        )
        # Check if source table has remaining orders
        remaining_orders = await db.orders.find(
            {"table_id": source_table_id, "status": {"$in": ["active", "sent"]}, "id": {"$ne": order_id}},
            {"_id": 0}
        ).to_list(50)
        
        if len(remaining_orders) == 0:
            # No more orders - free the table
            await db.tables.update_one(
                {"id": source_table_id},
                {"$set": {"status": "free", "active_order_id": None}}
            )
        elif len(remaining_orders) == 1:
            # One order left - set to occupied
            await db.tables.update_one(
                {"id": source_table_id},
                {"$set": {"status": "occupied", "active_order_id": remaining_orders[0]["id"]}}
            )
        else:
            # Multiple orders - keep as divided
            await db.tables.update_one(
                {"id": source_table_id},
                {"$set": {"status": "divided", "active_order_id": remaining_orders[0]["id"]}}
            )
        # Log movement for audit
        await log_table_movement(
            user_id=user["user_id"], user_name=user["name"], user_role=user["role"],
            source_table_id=source_table_id, source_table_number=source_table["number"],
            target_table_id=target_table_id, target_table_number=target_table["number"],
            movement_type="single", orders_moved=1, merged=True
        )
        return {"ok": True, "merged": True, "target_order_id": target_order["id"]}
    else:
        # Simple move: change order's table reference
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"table_id": target_table_id, "table_number": target_table["number"], "updated_at": now_iso()}}
        )
        # Check if source table has remaining orders
        remaining_orders = await db.orders.find(
            {"table_id": source_table_id, "status": {"$in": ["active", "sent"]}, "id": {"$ne": order_id}},
            {"_id": 0}
        ).to_list(50)
        
        if len(remaining_orders) == 0:
            # No more orders - free the table
            await db.tables.update_one(
                {"id": source_table_id},
                {"$set": {"status": "free", "active_order_id": None}}
            )
        elif len(remaining_orders) == 1:
            # One order left - set to occupied
            await db.tables.update_one(
                {"id": source_table_id},
                {"$set": {"status": "occupied", "active_order_id": remaining_orders[0]["id"]}}
            )
        else:
            # Multiple orders - keep as divided
            await db.tables.update_one(
                {"id": source_table_id},
                {"$set": {"status": "divided", "active_order_id": remaining_orders[0]["id"]}}
            )
        # Update target table: occupy it
        await db.tables.update_one(
            {"id": target_table_id},
            {"$set": {"status": "occupied", "active_order_id": order_id}}
        )
        # Log movement for audit
        await log_table_movement(
            user_id=user["user_id"], user_name=user["name"], user_role=user["role"],
            source_table_id=source_table_id, source_table_number=source_table["number"],
            target_table_id=target_table_id, target_table_number=target_table["number"],
            movement_type="single", orders_moved=1, merged=False
        )
        return {"ok": True, "moved": True}

@api.post("/tables/{table_id}/move-all")
async def move_all_orders_to_table(table_id: str, input: dict, user: dict = Depends(get_current_user)):
    """Move ALL orders from a table to another table. Preserves divided state."""
    target_table_id = input.get("target_table_id")
    
    if table_id == target_table_id:
        raise HTTPException(status_code=400, detail="No puedes mover a la misma mesa")
    
    # Get source table
    source_table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not source_table:
        raise HTTPException(status_code=404, detail="Mesa origen no encontrada")
    
    # Get target table
    target_table = await db.tables.find_one({"id": target_table_id}, {"_id": 0})
    if not target_table:
        raise HTTPException(status_code=404, detail="Mesa destino no encontrada")
    
    # Get ALL orders from source table
    source_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0}
    ).to_list(50)
    
    if not source_orders:
        raise HTTPException(status_code=400, detail="No hay órdenes activas en esta mesa")
    
    # Check if target table has orders
    target_orders = await db.orders.find(
        {"table_id": target_table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0}
    ).to_list(50)
    
    if target_orders:
        # Target has orders - return needs_merge info
        return {
            "needs_merge": True, 
            "source_order_count": len(source_orders),
            "target_order_count": len(target_orders),
            "target_table_number": target_table["number"]
        }
    
    # Move all orders to target table
    for order in source_orders:
        await db.orders.update_one(
            {"id": order["id"]},
            {"$set": {
                "table_id": target_table_id, 
                "table_number": target_table["number"], 
                "updated_at": now_iso()
            }}
        )
    
    # Update source table: free it
    await db.tables.update_one(
        {"id": table_id},
        {"$set": {"status": "free", "active_order_id": None}}
    )
    
    # Update target table status based on number of orders moved
    if len(source_orders) > 1:
        # Multiple orders = divided
        await db.tables.update_one(
            {"id": target_table_id},
            {"$set": {"status": "divided", "active_order_id": source_orders[0]["id"]}}
        )
    else:
        # Single order = occupied
        await db.tables.update_one(
            {"id": target_table_id},
            {"$set": {"status": "occupied", "active_order_id": source_orders[0]["id"]}}
        )
    
    # Log movement for audit
    await log_table_movement(
        user_id=user["user_id"], user_name=user["name"], user_role=user["role"],
        source_table_id=table_id, source_table_number=source_table["number"],
        target_table_id=target_table_id, target_table_number=target_table["number"],
        movement_type="bulk", orders_moved=len(source_orders), merged=False
    )
    
    return {
        "ok": True, 
        "moved": True, 
        "orders_moved": len(source_orders),
        "target_table_number": target_table["number"]
    }

# ─── SPLIT ORDER - CREATE NEW ORDER FROM ITEMS ───
@api.post("/orders/{order_id}/split-to-new")
async def split_to_new_order(order_id: str, input: dict, user: dict = Depends(get_current_user)):
    """Split selected items from an order to create a new order on the same table"""
    item_ids = input.get("item_ids", [])
    
    if not item_ids:
        raise HTTPException(status_code=400, detail="Debe seleccionar al menos un item")
    
    # Get source order
    source_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not source_order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    # Separate items: items to move vs items to keep
    items_to_move = [i for i in source_order["items"] if i["id"] in item_ids]
    items_to_keep = [i for i in source_order["items"] if i["id"] not in item_ids]
    
    if not items_to_move:
        raise HTTPException(status_code=400, detail="Items no encontrados en la orden")
    
    if not items_to_keep:
        raise HTTPException(status_code=400, detail="No puede mover todos los items. Use 'Mover Mesa' para eso.")
    
    # Count existing orders for this table to get the next account number
    table_id = source_order["table_id"]
    existing_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}}, 
        {"_id": 0, "account_number": 1}
    ).to_list(100)
    
    # Get max account number
    max_account = max([o.get("account_number", 1) for o in existing_orders], default=1)
    new_account_number = max_account + 1
    
    # Update source order: remove moved items
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"items": items_to_keep, "updated_at": now_iso()}}
    )
    
    # Create new order with moved items
    new_order = {
        "id": gen_id(),
        "table_id": table_id,
        "table_number": source_order["table_number"],
        "account_number": new_account_number,
        "status": source_order["status"],
        "items": items_to_move,
        "waiter_id": user["user_id"],
        "waiter_name": user["name"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "parent_order_id": order_id,  # Reference to original order
    }
    await db.orders.insert_one(new_order)
    
    # Update table status to "divided"
    await db.tables.update_one(
        {"id": table_id},
        {"$set": {"status": "divided"}}
    )
    
    return {
        "ok": True,
        "source_order": await db.orders.find_one({"id": order_id}, {"_id": 0}),
        "new_order": {k: v for k, v in new_order.items() if k != "_id"}
    }

@api.post("/tables/{table_id}/orders/new")
async def create_new_account_on_table(table_id: str, user: dict = Depends(get_current_user)):
    """Create a new empty order/account on a table that already has orders"""
    # Get table
    table = await db.tables.find_one({"id": table_id}, {"_id": 0})
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    
    # Get existing orders for this table
    existing_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}}, 
        {"_id": 0, "account_number": 1}
    ).to_list(100)
    
    # Get max account number
    max_account = max([o.get("account_number", 1) for o in existing_orders], default=0)
    new_account_number = max_account + 1
    
    # Create new empty order
    new_order = {
        "id": gen_id(),
        "table_id": table_id,
        "table_number": table["number"],
        "account_number": new_account_number,
        "status": "active",
        "items": [],
        "waiter_id": user["user_id"],
        "waiter_name": user["name"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.orders.insert_one(new_order)
    
    # Update table status to "divided" if this creates multiple orders
    if len(existing_orders) >= 1:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"status": "divided"}}
        )
    else:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"status": "occupied", "active_order_id": new_order["id"]}}
        )
    
    return {k: v for k, v in new_order.items() if k != "_id"}

@api.get("/tables/{table_id}/orders")
async def get_table_orders(table_id: str, user: dict = Depends(get_current_user)):
    """Get all active orders for a table (for divided tables)"""
    orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0}
    ).sort("account_number", 1).to_list(20)
    
    # Check if user can access this table
    if not can_access_table_orders(user, orders):
        owner_name = get_table_owner_name(orders)
        raise HTTPException(
            status_code=403, 
            detail=f"Esta mesa está siendo atendida por {owner_name}. No tienes permiso para acceder."
        )
    
    return orders

@api.delete("/orders/{order_id}/empty")
async def delete_empty_order(order_id: str, user: dict = Depends(get_current_user)):
    """Delete an empty order/account - only works if order has no items"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    # Check if order is empty
    active_items = [i for i in order.get("items", []) if i.get("status") != "cancelled"]
    if len(active_items) > 0:
        raise HTTPException(status_code=400, detail="No se puede eliminar una cuenta con items. Mueve los items primero.")
    
    table_id = order["table_id"]
    
    # Delete the order
    await db.orders.delete_one({"id": order_id})
    
    # Check remaining orders on this table
    remaining_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0, "id": 1}
    ).to_list(20)
    
    # Update table status based on remaining orders
    if len(remaining_orders) == 0:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"status": "free", "active_order_id": None}}
        )
    elif len(remaining_orders) == 1:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"status": "occupied", "active_order_id": remaining_orders[0]["id"]}}
        )
    # If more than 1, keep as "divided"
    
    return {"message": "Cuenta eliminada", "remaining_orders": len(remaining_orders)}

@api.post("/orders/{order_id}/merge/{target_order_id}")
async def merge_orders(order_id: str, target_order_id: str, user: dict = Depends(get_current_user)):
    """Merge two orders - move all items from order_id to target_order_id"""
    if order_id == target_order_id:
        raise HTTPException(status_code=400, detail="No puedes fusionar una cuenta consigo misma")
    
    # Get source order
    source_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not source_order:
        raise HTTPException(status_code=404, detail="Cuenta origen no encontrada")
    
    # Get target order
    target_order = await db.orders.find_one({"id": target_order_id}, {"_id": 0})
    if not target_order:
        raise HTTPException(status_code=404, detail="Cuenta destino no encontrada")
    
    # Verify both orders are on the same table
    if source_order["table_id"] != target_order["table_id"]:
        raise HTTPException(status_code=400, detail="Solo puedes fusionar cuentas de la misma mesa")
    
    table_id = source_order["table_id"]
    
    # Get items to move (non-cancelled)
    items_to_move = [i for i in source_order.get("items", []) if i.get("status") != "cancelled"]
    
    if len(items_to_move) == 0:
        # Source is empty, just delete it
        await db.orders.delete_one({"id": order_id})
    else:
        # Move items to target order
        await db.orders.update_one(
            {"id": target_order_id},
            {
                "$push": {"items": {"$each": items_to_move}},
                "$set": {"updated_at": now_iso()}
            }
        )
        # Delete source order
        await db.orders.delete_one({"id": order_id})
    
    # Check remaining orders on this table
    remaining_orders = await db.orders.find(
        {"table_id": table_id, "status": {"$in": ["active", "sent"]}},
        {"_id": 0, "id": 1}
    ).to_list(20)
    
    # Update table status
    if len(remaining_orders) == 1:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"status": "occupied", "active_order_id": remaining_orders[0]["id"]}}
        )
    # If more than 1, keep as "divided"
    
    # Get updated target order
    updated_target = await db.orders.find_one({"id": target_order_id}, {"_id": 0})
    
    return {
        "message": f"Cuentas fusionadas exitosamente",
        "merged_order": updated_target,
        "remaining_orders": len(remaining_orders)
    }

# ─── KITCHEN ───
@api.get("/kitchen/orders")
async def kitchen_orders():
    orders = await db.orders.find(
        {"status": {"$in": ["sent", "active"]},
         "items": {"$elemMatch": {"sent_to_kitchen": True, "status": {"$nin": ["served", "cancelled"]}}}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    return orders

@api.put("/kitchen/items/{order_id}/{item_id}")
async def update_kitchen_item(order_id: str, item_id: str, input: dict):
    new_status = input.get("status", "preparing")
    await db.orders.update_one(
        {"id": order_id, "items.id": item_id},
        {"$set": {"items.$.status": new_status, "updated_at": now_iso()}}
    )
    # Check if all sent items are served
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if order:
        active_items = [i for i in order["items"] if i["status"] not in ["served", "cancelled"]]
        if not active_items:
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "completed"}})
    return {"ok": True}

# ─── BILLS ───
@api.get("/bills")
async def list_bills(status: Optional[str] = Query(None), table_id: Optional[str] = Query(None), order_id: Optional[str] = Query(None)):
    query = {}
    if status:
        query["status"] = status
    if table_id:
        query["table_id"] = table_id
    if order_id:
        query["order_id"] = order_id
    return await db.bills.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.post("/bills")
async def create_bill(input: CreateBillInput, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": input.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    table = await db.tables.find_one({"id": input.table_id}, {"_id": 0})

    if input.item_ids:
        bill_items = [i for i in order["items"] if i["id"] in input.item_ids and i["status"] != "cancelled"]
    else:
        bill_items = [i for i in order["items"] if i["status"] != "cancelled"]

    subtotal = 0
    items_data = []
    for item in bill_items:
        mod_total = sum(m.get("price", 0) for m in item.get("modifiers", []))
        item_total = (item["unit_price"] + mod_total) * item["quantity"]
        subtotal += item_total
        items_data.append({
            "item_id": item["id"], "product_name": item["product_name"],
            "quantity": item["quantity"], "unit_price": item["unit_price"],
            "modifiers": item.get("modifiers", []), "modifiers_total": mod_total,
            "total": round(item_total, 2)
        })

    # Dynamic tax calculation from config
    taxes = await db.tax_config.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(10)
    if not taxes:
        taxes = [{"description": "ITBIS", "rate": 18, "is_tip": False}, {"description": "Propina Legal", "rate": 10, "is_tip": True}]
    
    tax_breakdown = []
    total_taxes = 0
    itbis_amount = 0
    propina_amount = 0
    for tax in taxes:
        rate = tax.get("rate", 0)
        if rate <= 0:
            continue
        is_tip = tax.get("is_tip", False)
        base = subtotal if not tax.get("apply_to_tip") else (subtotal + total_taxes)
        amount = round(base * (rate / 100), 2)
        tax_breakdown.append({"description": tax["description"], "rate": rate, "amount": amount, "is_tip": is_tip})
        total_taxes += amount
        if is_tip:
            propina_amount += amount
        else:
            itbis_amount += amount
    
    total = round(subtotal + total_taxes, 2)

    ncf_doc = await db.ncf_sequences.find_one_and_update(
        {"prefix": "B01"},
        {"$inc": {"current_number": 1}},
        return_document=ReturnDocument.AFTER,
        upsert=True
    )
    ncf_num = ncf_doc.get("current_number", 1)
    ncf = f"B01{ncf_num:08d}"

    bill = {
        "id": gen_id(), "order_id": input.order_id, "table_id": input.table_id,
        "table_number": table["number"] if table else 0,
        "label": input.label or f"Mesa {table['number'] if table else '?'}",
        "items": items_data, "subtotal": round(subtotal, 2),
        "itbis": itbis_amount, "itbis_rate": 18,
        "propina_legal": propina_amount, "propina_percentage": 10,
        "tax_breakdown": tax_breakdown,
        "total": total, "ncf": ncf,
        "payment_method": input.payment_method,
        "cashier_id": user["user_id"], "cashier_name": user["name"],
        "status": "open", "created_at": now_iso(), "paid_at": None
    }
    await db.bills.insert_one(bill)
    return {k: v for k, v in bill.items() if k != "_id"}

@api.post("/bills/{bill_id}/pay")
async def pay_bill(bill_id: str, input: PayBillInput, user=Depends(get_current_user)):
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    propina = round(bill["subtotal"] * (input.tip_percentage / 100), 2) + input.additional_tip
    # Recalculate: use stored itbis + new tip
    itbis = bill.get("itbis", 0)
    total = round(bill["subtotal"] + itbis + propina, 2)

    await db.bills.update_one({"id": bill_id}, {"$set": {
        "status": "paid", "payment_method": input.payment_method,
        "propina_legal": propina, "propina_percentage": input.tip_percentage,
        "total": total, "paid_at": now_iso()
    }})

    shift = await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})
    if shift:
        field = "cash_sales" if input.payment_method == "cash" else "card_sales"
        await db.shifts.update_one({"id": shift["id"]}, {
            "$inc": {field: total, "total_sales": total, "total_tips": propina}
        })

    order_id = bill["order_id"]
    open_bills = await db.bills.count_documents({"order_id": order_id, "status": "open"})
    if open_bills == 0:
        all_paid = await db.bills.count_documents({"order_id": order_id, "status": "paid"})
        if all_paid > 0:
            await db.orders.update_one({"id": order_id}, {"$set": {"status": "completed"}})
            await db.tables.update_one(
                {"id": bill["table_id"]},
                {"$set": {"status": "free", "active_order_id": None}}
            )
    else:
        await db.tables.update_one({"id": bill["table_id"]}, {"$set": {"status": "billed"}})

    # Loyalty points accumulation
    cust_id = input.customer_id or bill.get("customer_id", "")
    points_earned = 0
    if cust_id:
        config = await db.loyalty_config.find_one({}, {"_id": 0}) or {"points_per_hundred": 10}
        points_earned = int((total / 100) * config.get("points_per_hundred", 10))
        await db.customers.update_one({"id": cust_id}, {
            "$inc": {"points": points_earned, "total_spent": total, "visits": 1},
            "$set": {"last_visit": now_iso()}
        })
        await db.bills.update_one({"id": bill_id}, {"$set": {"customer_id": cust_id, "points_earned": points_earned}})

    result = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if result:
        result["points_earned"] = points_earned
    return result

@api.post("/bills/{bill_id}/cancel")
async def cancel_bill(bill_id: str, user=Depends(get_current_user)):
    await db.bills.update_one({"id": bill_id}, {"$set": {"status": "cancelled"}})
    shift = await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})
    if shift:
        await db.shifts.update_one({"id": shift["id"]}, {"$inc": {"cancelled_count": 1}})
    return {"ok": True}

# ─── CANCELLATION REASONS ───
@api.get("/cancellation-reasons")
async def list_cancellation_reasons():
    return await db.cancellation_reasons.find({"active": True}, {"_id": 0}).to_list(50)

@api.post("/cancellation-reasons")
async def create_cancellation_reason(input: CancellationReasonInput):
    doc = {"id": gen_id(), "name": input.name, "return_to_inventory": input.return_to_inventory, "active": True}
    await db.cancellation_reasons.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/cancellation-reasons/{reason_id}")
async def update_cancellation_reason(reason_id: str, input: dict):
    if "_id" in input:
        del input["_id"]
    await db.cancellation_reasons.update_one({"id": reason_id}, {"$set": input})
    return {"ok": True}

# ─── SHIFTS ───
@api.get("/shifts")
async def list_shifts():
    return await db.shifts.find({}, {"_id": 0}).sort("opened_at", -1).to_list(100)

@api.get("/shifts/current")
async def get_current_shift(user=Depends(get_current_user)):
    shift = await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})
    return shift or {}

@api.post("/shifts/open")
async def open_shift(input: ShiftOpenInput, user=Depends(get_current_user)):
    existing = await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})
    if existing:
        return existing
    doc = {
        "id": gen_id(), "user_id": user["user_id"], "user_name": user["name"],
        "station": input.station, "opening_amount": input.opening_amount,
        "closing_amount": None, "cash_sales": 0, "card_sales": 0,
        "total_sales": 0, "total_tips": 0, "cancelled_count": 0,
        "opened_at": now_iso(), "closed_at": None, "status": "open"
    }
    await db.shifts.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/shifts/{shift_id}/close")
async def close_shift(shift_id: str, input: ShiftCloseInput):
    await db.shifts.update_one({"id": shift_id}, {"$set": {
        "closing_amount": input.closing_amount, "closed_at": now_iso(), "status": "closed"
    }})
    return await db.shifts.find_one({"id": shift_id}, {"_id": 0})

# ─── INVENTORY (enhanced) ───
@api.get("/inventory")
async def list_inventory(warehouse_id: Optional[str] = Query(None)):
    query = {"warehouse_id": warehouse_id} if warehouse_id else {}
    return await db.inventory.find(query, {"_id": 0}).to_list(500)

@api.get("/inventory/alerts")
async def inventory_alerts():
    items = await db.inventory.find({"$expr": {"$lte": ["$stock", "$min_stock"]}}, {"_id": 0}).to_list(100)
    return items

@api.put("/inventory/{product_id}")
async def update_inventory(product_id: str, input: dict):
    if "_id" in input:
        del input["_id"]
    await db.inventory.update_one({"product_id": product_id}, {"$set": input}, upsert=True)
    return {"ok": True}

@api.post("/inventory/adjust")
async def adjust_inventory(input: InventoryAdjustInput, user=Depends(get_current_user)):
    await db.inventory.update_one(
        {"product_id": input.product_id, "warehouse_id": input.warehouse_id},
        {"$inc": {"stock": input.quantity}, "$set": {"last_updated": now_iso()}},
        upsert=True
    )
    await db.inventory_logs.insert_one({
        "id": gen_id(), "product_id": input.product_id, "warehouse_id": input.warehouse_id,
        "quantity": input.quantity, "reason": input.reason,
        "user_id": user["user_id"], "user_name": user["name"], "created_at": now_iso()
    })
    return {"ok": True}

# ─── WAREHOUSES ───
@api.get("/warehouses")
async def list_warehouses():
    return await db.warehouses.find({}, {"_id": 0}).to_list(50)

@api.post("/warehouses")
async def create_warehouse(input: WarehouseInput):
    doc = {"id": gen_id(), "name": input.name, "location": input.location, "active": True}
    await db.warehouses.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/warehouses/{wid}")
async def update_warehouse(wid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.warehouses.update_one({"id": wid}, {"$set": input})
    return {"ok": True}

@api.delete("/warehouses/{wid}")
async def delete_warehouse(wid: str):
    await db.warehouses.delete_one({"id": wid})
    return {"ok": True}

# ─── SUPPLIERS ───
@api.get("/suppliers")
async def list_suppliers():
    return await db.suppliers.find({}, {"_id": 0}).to_list(100)

@api.post("/suppliers")
async def create_supplier(input: SupplierInput):
    doc = {"id": gen_id(), "name": input.name, "contact_name": input.contact_name,
           "phone": input.phone, "email": input.email, "address": input.address,
           "rnc": input.rnc, "active": True, "created_at": now_iso()}
    await db.suppliers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/suppliers/{sid}")
async def update_supplier(sid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.suppliers.update_one({"id": sid}, {"$set": input})
    return {"ok": True}

@api.delete("/suppliers/{sid}")
async def delete_supplier(sid: str):
    await db.suppliers.delete_one({"id": sid})
    return {"ok": True}

# ─── RECIPES ───
@api.get("/recipes")
async def list_recipes():
    return await db.recipes.find({}, {"_id": 0}).to_list(200)

@api.get("/recipes/product/{product_id}")
async def get_recipe(product_id: str):
    recipe = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    return recipe or {}

@api.post("/recipes")
async def create_recipe(input: RecipeInput):
    ingredients = [{"id": gen_id(), **i.model_dump()} for i in input.ingredients]
    doc = {"id": gen_id(), "product_id": input.product_id, "product_name": input.product_name,
           "ingredients": ingredients, "yield_quantity": input.yield_quantity, "created_at": now_iso()}
    existing = await db.recipes.find_one({"product_id": input.product_id})
    if existing:
        await db.recipes.update_one({"product_id": input.product_id}, {"$set": {"ingredients": ingredients, "yield_quantity": input.yield_quantity}})
        return await db.recipes.find_one({"product_id": input.product_id}, {"_id": 0})
    await db.recipes.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.delete("/recipes/{rid}")
async def delete_recipe(rid: str):
    await db.recipes.delete_one({"id": rid})
    return {"ok": True}

# ─── PURCHASE ORDERS ───
@api.get("/purchase-orders")
async def list_purchase_orders(status: Optional[str] = Query(None)):
    query = {"status": status} if status else {}
    return await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.post("/purchase-orders")
async def create_purchase_order(input: PurchaseOrderInput, user=Depends(get_current_user)):
    supplier = await db.suppliers.find_one({"id": input.supplier_id}, {"_id": 0})
    items = [{"id": gen_id(), "product_id": i.product_id, "product_name": i.product_name,
              "quantity": i.quantity, "unit_price": i.unit_price, "received_quantity": 0} for i in input.items]
    total = sum(i.quantity * i.unit_price for i in input.items)
    doc = {"id": gen_id(), "supplier_id": input.supplier_id,
           "supplier_name": supplier["name"] if supplier else "?",
           "warehouse_id": input.warehouse_id, "items": items, "total": round(total, 2),
           "notes": input.notes, "status": "draft",
           "created_by": user["name"], "created_at": now_iso(), "received_at": None}
    await db.purchase_orders.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.purchase_orders.update_one({"id": po_id}, {"$set": input})
    return {"ok": True}

@api.post("/purchase-orders/{po_id}/receive")
async def receive_purchase_order(po_id: str, input: ReceivePOInput, user=Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    for recv_item in input.items:
        for po_item in po["items"]:
            if po_item["product_id"] == recv_item.product_id:
                po_item["received_quantity"] = po_item.get("received_quantity", 0) + recv_item.received_quantity
                await db.inventory.update_one(
                    {"product_id": recv_item.product_id, "warehouse_id": input.warehouse_id},
                    {"$inc": {"stock": recv_item.received_quantity}, "$set": {"last_updated": now_iso()}},
                    upsert=True
                )
    all_received = all(i["received_quantity"] >= i["quantity"] for i in po["items"])
    partial = any(i["received_quantity"] > 0 for i in po["items"])
    new_status = "received" if all_received else "partial" if partial else po["status"]
    await db.purchase_orders.update_one({"id": po_id}, {"$set": {
        "items": po["items"], "status": new_status, "received_at": now_iso() if all_received else None
    }})
    return await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})

@api.delete("/purchase-orders/{po_id}")
async def delete_purchase_order(po_id: str):
    await db.purchase_orders.delete_one({"id": po_id})
    return {"ok": True}

# ─── CUSTOMERS / LOYALTY ───
@api.get("/customers")
async def list_customers(search: Optional[str] = Query(None)):
    query = {}
    if search:
        query = {"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]}
    return await db.customers.find(query, {"_id": 0}).sort("name", 1).to_list(500)

@api.post("/customers")
async def create_customer(input: CustomerInput):
    doc = {"id": gen_id(), "name": input.name, "phone": input.phone, "email": input.email,
           "points": 0, "total_spent": 0, "visits": 0, "created_at": now_iso(), "last_visit": None}
    await db.customers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/customers/{cid}")
async def update_customer(cid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.customers.update_one({"id": cid}, {"$set": input})
    return {"ok": True}

@api.post("/customers/{cid}/add-points")
async def add_customer_points(cid: str, input: dict):
    amount = input.get("amount", 0)
    config = await db.loyalty_config.find_one({}, {"_id": 0}) or {"points_per_hundred": 10, "point_value_rd": 1}
    points = int((amount / 100) * config.get("points_per_hundred", 10))
    await db.customers.update_one({"id": cid}, {
        "$inc": {"points": points, "total_spent": amount, "visits": 1},
        "$set": {"last_visit": now_iso()}
    })
    customer = await db.customers.find_one({"id": cid}, {"_id": 0})
    return {"points_earned": points, "total_points": customer["points"] if customer else 0}

@api.post("/customers/{cid}/redeem-points")
async def redeem_customer_points(cid: str, input: dict):
    points_to_redeem = input.get("points", 0)
    customer = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not customer or customer["points"] < points_to_redeem:
        raise HTTPException(status_code=400, detail="Puntos insuficientes")
    config = await db.loyalty_config.find_one({}, {"_id": 0}) or {"point_value_rd": 1}
    discount = points_to_redeem * config.get("point_value_rd", 1)
    await db.customers.update_one({"id": cid}, {"$inc": {"points": -points_to_redeem}})
    return {"points_redeemed": points_to_redeem, "discount_rd": discount}

@api.get("/loyalty/config")
async def get_loyalty_config():
    config = await db.loyalty_config.find_one({}, {"_id": 0})
    return config or {"points_per_hundred": 10, "point_value_rd": 1, "min_redemption": 50}

@api.put("/loyalty/config")
async def update_loyalty_config(input: dict):
    if "_id" in input: del input["_id"]
    await db.loyalty_config.update_one({}, {"$set": input}, upsert=True)
    return {"ok": True}

# ─── SYSTEM CONFIG (Timezone, etc) ───
TIMEZONE_OPTIONS = [
    {"value": -5, "label": "UTC-5 (Colombia, Perú, Ecuador, Panamá, México Centro)"},
    {"value": -4, "label": "UTC-4 (República Dominicana, Puerto Rico, Venezuela, Bolivia)"},
    {"value": -3, "label": "UTC-3 (Argentina, Chile, Uruguay, Brasil)"},
    {"value": -6, "label": "UTC-6 (México CDMX, Costa Rica, Guatemala, El Salvador)"},
    {"value": -7, "label": "UTC-7 (México Pacífico, Arizona)"},
    {"value": -8, "label": "UTC-8 (USA Pacífico, Tijuana)"},
    {"value": 0, "label": "UTC+0 (Reino Unido, Portugal)"},
    {"value": 1, "label": "UTC+1 (España, Francia, Alemania, Italia)"},
    {"value": 2, "label": "UTC+2 (Grecia, Israel, Sudáfrica)"},
]

@api.get("/system/config")
async def get_system_config():
    config = await db.system_config.find_one({}, {"_id": 0})
    return config or {"timezone_offset": -4, "restaurant_name": "Mi Restaurante", "currency": "RD$"}

@api.put("/system/config")
async def update_system_config(input: dict):
    if "_id" in input: del input["_id"]
    await db.system_config.update_one({}, {"$set": input}, upsert=True)
    return {"ok": True}

@api.get("/system/timezones")
async def get_timezone_options():
    return TIMEZONE_OPTIONS

# ─── REPORTS ───
@api.get("/reports/dashboard")
async def dashboard_kpis():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(5000)
    today_bills = [b for b in bills if b.get("paid_at", "").startswith(today)]
    all_orders = await db.orders.find({"status": {"$in": ["active", "sent"]}}, {"_id": 0}).to_list(100)
    tables = await db.tables.find({}, {"_id": 0}).to_list(200)
    occupied = len([t for t in tables if t["status"] != "free"])
    total_tables = len(tables)
    alerts = await db.inventory.find({"$expr": {"$lte": ["$stock", "$min_stock"]}}, {"_id": 0}).to_list(100)
    shifts = await db.shifts.find({"status": "open"}, {"_id": 0}).to_list(20)
    customers_total = await db.customers.count_documents({})

    today_total = sum(b["total"] for b in today_bills)
    today_itbis = sum(b["itbis"] for b in today_bills)
    today_tips = sum(b.get("propina_legal", 0) for b in today_bills)
    avg_ticket = today_total / len(today_bills) if today_bills else 0

    # Hourly sales for today
    hourly = {}
    for b in today_bills:
        hr = b.get("paid_at", "")[:13]
        if hr:
            h = hr.split("T")[1][:2] if "T" in hr else "00"
            hourly[h] = hourly.get(h, 0) + b["total"]
    hourly_data = [{"hour": f"{h}:00", "total": round(v, 2)} for h, v in sorted(hourly.items())]

    return {
        "today": {"total_sales": round(today_total, 2), "bills_count": len(today_bills),
                  "itbis": round(today_itbis, 2), "tips": round(today_tips, 2),
                  "avg_ticket": round(avg_ticket, 2), "cash": round(sum(b["total"] for b in today_bills if b["payment_method"]=="cash"), 2),
                  "card": round(sum(b["total"] for b in today_bills if b["payment_method"]=="card"), 2)},
        "operations": {"active_orders": len(all_orders), "occupied_tables": occupied,
                       "total_tables": total_tables, "occupancy_pct": round((occupied/total_tables)*100, 1) if total_tables else 0,
                       "open_shifts": len(shifts), "inventory_alerts": len(alerts)},
        "loyalty": {"total_customers": customers_total},
        "hourly_sales": hourly_data
    }

@api.get("/reports/daily-sales")
async def daily_sales_report(date: Optional[str] = Query(None)):
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(5000)
    day_bills = [b for b in bills if b.get("paid_at", "").startswith(date)]
    total_sales = sum(b["total"] for b in day_bills)
    total_itbis = sum(b["itbis"] for b in day_bills)
    total_tips = sum(b.get("propina_legal", 0) for b in day_bills)
    cash_sales = sum(b["total"] for b in day_bills if b["payment_method"] == "cash")
    card_sales = sum(b["total"] for b in day_bills if b["payment_method"] == "card")
    return {
        "date": date, "total_bills": len(day_bills),
        "total_sales": round(total_sales, 2), "total_itbis": round(total_itbis, 2),
        "total_tips": round(total_tips, 2), "cash_sales": round(cash_sales, 2),
        "card_sales": round(card_sales, 2),
        "subtotal": round(total_sales - total_itbis - total_tips, 2)
    }

@api.get("/reports/sales-by-category")
async def sales_by_category(date: Optional[str] = Query(None)):
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(5000)
    day_bills = [b for b in bills if b.get("paid_at", "").startswith(date)]
    products = await db.products.find({}, {"_id": 0}).to_list(500)
    cats = await db.categories.find({}, {"_id": 0}).to_list(50)
    prod_cat = {p["name"]: p["category_id"] for p in products}
    cat_names = {c["id"]: c["name"] for c in cats}
    cat_sales = {}
    for bill in day_bills:
        for item in bill.get("items", []):
            cat_id = prod_cat.get(item["product_name"], "other")
            cat_name = cat_names.get(cat_id, "Otros")
            cat_sales[cat_name] = cat_sales.get(cat_name, 0) + item.get("total", 0)
    return [{"category": k, "total": round(v, 2)} for k, v in sorted(cat_sales.items(), key=lambda x: -x[1])]

@api.get("/reports/top-products")
async def top_products_report(date: Optional[str] = Query(None)):
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(5000)
    day_bills = [b for b in bills if b.get("paid_at", "").startswith(date)]
    product_sales = {}
    for bill in day_bills:
        for item in bill.get("items", []):
            name = item["product_name"]
            if name not in product_sales:
                product_sales[name] = {"name": name, "quantity": 0, "total": 0}
            product_sales[name]["quantity"] += item.get("quantity", 0)
            product_sales[name]["total"] += item.get("total", 0)
    result = sorted(product_sales.values(), key=lambda x: -x["total"])
    return [{"name": r["name"], "quantity": r["quantity"], "total": round(r["total"], 2)} for r in result[:20]]

@api.get("/reports/sales-by-waiter")
async def sales_by_waiter(date: Optional[str] = Query(None)):
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(5000)
    day_bills = [b for b in bills if b.get("paid_at", "").startswith(date)]
    waiter_sales = {}
    for bill in day_bills:
        name = bill.get("cashier_name", "?")
        if name not in waiter_sales:
            waiter_sales[name] = {"name": name, "bills": 0, "total": 0, "tips": 0}
        waiter_sales[name]["bills"] += 1
        waiter_sales[name]["total"] += bill["total"]
        waiter_sales[name]["tips"] += bill.get("propina_legal", 0)
    return [{"name": v["name"], "bills": v["bills"], "total": round(v["total"], 2), "tips": round(v["tips"], 2)}
            for v in sorted(waiter_sales.values(), key=lambda x: -x["total"])]

# ─── TABLE MOVEMENTS AUDIT ───
async def log_table_movement(
    user_id: str, user_name: str, user_role: str,
    source_table_id: str, source_table_number: int,
    target_table_id: str, target_table_number: int,
    movement_type: str, orders_moved: int = 1, merged: bool = False
):
    """Log a table movement for audit purposes"""
    movement = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_name": user_name,
        "user_role": user_role,
        "source_table_id": source_table_id,
        "source_table_number": source_table_number,
        "target_table_id": target_table_id,
        "target_table_number": target_table_number,
        "movement_type": movement_type,  # "single", "bulk", "merge"
        "orders_moved": orders_moved,
        "merged": merged,
        "created_at": now_iso()
    }
    await db.table_movements.insert_one(movement)
    return movement

@api.get("/reports/table-movements")
async def get_table_movements(
    date: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user)
):
    """Get table movement history for audit"""
    query = {}
    if date:
        query["created_at"] = {"$regex": f"^{date}"}
    
    movements = await db.table_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return movements

@api.get("/reports/table-movements/stats")
async def get_table_movement_stats(
    date: Optional[str] = Query(None),
    user: dict = Depends(get_current_user)
):
    """Get statistics about table movements"""
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    movements = await db.table_movements.find(
        {"created_at": {"$regex": f"^{date}"}}, {"_id": 0}
    ).to_list(500)
    
    # Stats by user
    by_user = {}
    for m in movements:
        name = m.get("user_name", "?")
        if name not in by_user:
            by_user[name] = {"name": name, "moves": 0, "merges": 0}
        by_user[name]["moves"] += 1
        if m.get("merged"):
            by_user[name]["merges"] += 1
    
    # Stats by type
    single_moves = len([m for m in movements if m.get("movement_type") == "single"])
    bulk_moves = len([m for m in movements if m.get("movement_type") == "bulk"])
    merges = len([m for m in movements if m.get("merged")])
    
    return {
        "date": date,
        "total_movements": len(movements),
        "single_moves": single_moves,
        "bulk_moves": bulk_moves,
        "merges": merges,
        "by_user": list(by_user.values())
    }

# ─── EMAIL ───
@api.post("/email/send")
async def send_email(input: EmailInput):
    if not resend.api_key:
        raise HTTPException(status_code=400, detail="RESEND_API_KEY no configurada")
    try:
        params = {"from": SENDER_EMAIL, "to": [input.to], "subject": input.subject, "html": input.html}
        email = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "success", "email_id": email.get("id")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api.post("/email/shift-report/{shift_id}")
async def email_shift_report(shift_id: str, input: dict):
    to_email = input.get("to", "")
    if not to_email:
        raise HTTPException(status_code=400, detail="Email requerido")
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404)
    html = f"""<div style='font-family:Arial;max-width:600px;margin:0 auto;'>
    <h2 style='color:#FF6600;border-bottom:2px solid #FF6600;padding-bottom:8px;'>Reporte de Turno - Mesa POS RD</h2>
    <table style='width:100%;border-collapse:collapse;'>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Cajero</b></td><td style='padding:8px;border-bottom:1px solid #ddd;'>{shift['user_name']}</td></tr>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Estacion</b></td><td>{shift['station']}</td></tr>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Apertura</b></td><td>RD$ {shift['opening_amount']:,.2f}</td></tr>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Ventas Efectivo</b></td><td>RD$ {shift['cash_sales']:,.2f}</td></tr>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Ventas Tarjeta</b></td><td>RD$ {shift['card_sales']:,.2f}</td></tr>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Total Ventas</b></td><td style='font-size:18px;color:#FF6600;'><b>RD$ {shift['total_sales']:,.2f}</b></td></tr>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Propinas</b></td><td>RD$ {shift['total_tips']:,.2f}</td></tr>
    <tr><td style='padding:8px;'><b>Anulaciones</b></td><td>{shift['cancelled_count']}</td></tr>
    </table></div>"""
    if not resend.api_key:
        return {"status": "preview", "html": html}
    try:
        params = {"from": SENDER_EMAIL, "to": [to_email], "subject": f"Reporte de Turno - {shift['user_name']} - {shift['station']}", "html": html}
        email = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": email.get("id")}
    except Exception as e:
        return {"status": "error", "detail": str(e), "html": html}

@api.post("/email/daily-close")
async def email_daily_close(input: dict):
    to_email = input.get("to", "")
    date = input.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(5000)
    day_bills = [b for b in bills if b.get("paid_at", "").startswith(date)]
    total = sum(b["total"] for b in day_bills)
    itbis = sum(b["itbis"] for b in day_bills)
    tips = sum(b.get("propina_legal", 0) for b in day_bills)
    cash = sum(b["total"] for b in day_bills if b["payment_method"] == "cash")
    card = sum(b["total"] for b in day_bills if b["payment_method"] == "card")
    html = f"""<div style='font-family:Arial;max-width:600px;margin:0 auto;'>
    <h2 style='color:#FF6600;border-bottom:2px solid #FF6600;padding-bottom:8px;'>Cierre del Dia - {date}</h2>
    <table style='width:100%;border-collapse:collapse;'>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Total Facturas</b></td><td>{len(day_bills)}</td></tr>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Subtotal</b></td><td>RD$ {total - itbis - tips:,.2f}</td></tr>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>ITBIS 18%</b></td><td>RD$ {itbis:,.2f}</td></tr>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Propinas</b></td><td>RD$ {tips:,.2f}</td></tr>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Efectivo</b></td><td>RD$ {cash:,.2f}</td></tr>
    <tr><td style='padding:8px;border-bottom:1px solid #ddd;'><b>Tarjeta</b></td><td>RD$ {card:,.2f}</td></tr>
    <tr><td style='padding:8px;'><b>TOTAL</b></td><td style='font-size:20px;color:#FF6600;'><b>RD$ {total:,.2f}</b></td></tr>
    </table></div>"""
    if not to_email or not resend.api_key:
        return {"status": "preview", "html": html, "data": {"date": date, "total_bills": len(day_bills), "total": round(total, 2)}}
    try:
        params = {"from": SENDER_EMAIL, "to": [to_email], "subject": f"Cierre del Dia - {date} - Mesa POS RD", "html": html}
        email = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "sent", "email_id": email.get("id"), "html": html}
    except Exception as e:
        return {"status": "error", "detail": str(e), "html": html}

# ─── PRINT TEMPLATES ───
@api.get("/print/pre-check/{order_id}")
async def print_pre_check(order_id: str):
    """Pre-cuenta / Pre-check for customer review before payment"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404)
    items = [i for i in order.get("items", []) if i["status"] != "cancelled"]
    subtotal = sum((i["unit_price"] + sum(m.get("price",0) for m in i.get("modifiers",[]))) * i["quantity"] for i in items)
    itbis = round(subtotal * 0.18, 2)
    propina = round(subtotal * 0.10, 2)
    total = round(subtotal + itbis + propina, 2)
    items_html = ""
    for item in items:
        mods = ", ".join(m["name"] for m in item.get("modifiers", []))
        mod_str = f"<br><small style='color:#666'>  {mods}</small>" if mods else ""
        item_total = (item["unit_price"] + sum(m.get("price",0) for m in item.get("modifiers",[]))) * item["quantity"]
        items_html += f"<tr><td>{item['quantity']}x {item['product_name']}{mod_str}</td><td style='text-align:right'>RD$ {item_total:,.2f}</td></tr>"
    # Track print count
    print_count = await db.pre_check_prints.count_documents({"order_id": order_id})
    await db.pre_check_prints.insert_one({"order_id": order_id, "print_number": print_count + 1, "printed_at": now_iso()})
    reprint_label = f"<div style='text-align:center;color:red;font-weight:bold;'>*** RE-IMPRESION #{print_count} ***</div>" if print_count > 0 else ""
    return {"html": f"""<div style='font-family:monospace;width:280px;padding:10px;font-size:12px;'>
    {reprint_label}
    <div style='text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;'>
    <b style='font-size:16px;'>MESA POS RD</b><br><b>PRE-CUENTA</b></div>
    <div>Mesa: {order['table_number']}<br>Mesero: {order['waiter_name']}<br>Fecha: {order['created_at'][:19]}</div>
    <table style='width:100%;border-collapse:collapse;margin:8px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;'>
    {items_html}</table>
    <table style='width:100%;font-size:12px;'>
    <tr><td>Subtotal</td><td style='text-align:right'>RD$ {subtotal:,.2f}</td></tr>
    <tr><td>ITBIS 18%</td><td style='text-align:right'>RD$ {itbis:,.2f}</td></tr>
    <tr><td>Propina Sugerida 10%</td><td style='text-align:right'>RD$ {propina:,.2f}</td></tr>
    <tr><td><b style='font-size:14px;'>TOTAL ESTIMADO</b></td><td style='text-align:right;font-size:14px;'><b>RD$ {total:,.2f}</b></td></tr>
    </table>
    <div style='text-align:center;margin-top:8px;font-size:10px;border-top:1px dashed #000;padding-top:8px;'>
    La propina es voluntaria<br>Este NO es un comprobante fiscal</div></div>""",
    "print_number": print_count + 1, "is_reprint": print_count > 0}

@api.get("/print/pre-check-count/{order_id}")
async def get_pre_check_count(order_id: str):
    count = await db.pre_check_prints.count_documents({"order_id": order_id})
    return {"count": count}

@api.post("/auth/verify-manager")
async def verify_manager_pin(input: dict):
    """Verify a manager/admin PIN for security operations"""
    pin = input.get("pin", "")
    if not pin:
        raise HTTPException(status_code=400, detail="PIN requerido")
    hashed = hash_pin(pin)
    user = await db.users.find_one({"pin_hash": hashed, "active": True}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="PIN incorrecto")
    perms = get_permissions(user["role"], user.get("permissions"))
    if not perms.get("release_reserved_table") and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Este usuario no tiene permisos de gerente")
    return {"authorized": True, "user_name": user["name"]}

@api.get("/print/receipt/{bill_id}")
async def print_receipt(bill_id: str):
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404)
    items_html = ""
    for item in bill.get("items", []):
        mods = ", ".join(m["name"] for m in item.get("modifiers", []))
        mod_str = f"<br><small style='color:#666'>  {mods}</small>" if mods else ""
        items_html += f"<tr><td>{item['quantity']}x {item['product_name']}{mod_str}</td><td style='text-align:right'>RD$ {item['total']:,.2f}</td></tr>"
    return {"html": f"""<div style='font-family:monospace;width:280px;padding:10px;font-size:12px;'>
    <div style='text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;'>
    <b style='font-size:16px;'>MESA POS RD</b><br>RNC: 000-000000-0<br>NCF: {bill['ncf']}</div>
    <div>Mesa: {bill['table_number']} | {bill['label']}<br>Fecha: {bill.get('paid_at', bill['created_at'])[:19]}</div>
    <table style='width:100%;border-collapse:collapse;margin:8px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:4px 0;'>
    {items_html}</table>
    <table style='width:100%;font-size:12px;'>
    <tr><td>Subtotal</td><td style='text-align:right'>RD$ {bill['subtotal']:,.2f}</td></tr>
    <tr><td>ITBIS {bill.get('itbis_rate',18)}%</td><td style='text-align:right'>RD$ {bill['itbis']:,.2f}</td></tr>
    <tr><td>Propina {bill.get('propina_percentage',10)}%</td><td style='text-align:right'>RD$ {bill.get('propina_legal',0):,.2f}</td></tr>
    <tr><td><b style='font-size:14px;'>TOTAL</b></td><td style='text-align:right;font-size:14px;'><b>RD$ {bill['total']:,.2f}</b></td></tr>
    </table>
    <div style='text-align:center;margin-top:8px;font-size:10px;border-top:1px dashed #000;padding-top:8px;'>
    Pago: {'Efectivo' if bill['payment_method']=='cash' else 'Tarjeta'}<br>Gracias por su visita!</div></div>"""}

@api.get("/print/receipt-escpos/{bill_id}")
async def print_receipt_escpos(bill_id: str):
    """Returns ESC/POS raw command data for thermal printers"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404)
    lines = []
    lines.append({"cmd": "center"})
    lines.append({"cmd": "bold", "text": "MESA POS RD"})
    lines.append({"text": "RNC: 000-000000-0"})
    lines.append({"text": f"NCF: {bill['ncf']}"})
    lines.append({"cmd": "line"})
    lines.append({"cmd": "left"})
    lines.append({"text": f"Mesa: {bill['table_number']} | {bill['label']}"})
    lines.append({"text": f"Fecha: {bill.get('paid_at', bill['created_at'])[:19]}"})
    lines.append({"cmd": "line"})
    for item in bill.get("items", []):
        mods = " (".join(m["name"] for m in item.get("modifiers", []))
        mod_str = f" ({mods})" if mods else ""
        lines.append({"text": f"{item['quantity']}x {item['product_name']}{mod_str}", "right": f"RD${item['total']:,.2f}"})
    lines.append({"cmd": "line"})
    lines.append({"text": "Subtotal", "right": f"RD${bill['subtotal']:,.2f}"})
    lines.append({"text": f"ITBIS {bill.get('itbis_rate',18)}%", "right": f"RD${bill['itbis']:,.2f}"})
    lines.append({"text": f"Propina {bill.get('propina_percentage',10)}%", "right": f"RD${bill.get('propina_legal',0):,.2f}"})
    lines.append({"cmd": "bold", "text": "TOTAL", "right": f"RD${bill['total']:,.2f}"})
    lines.append({"cmd": "line"})
    lines.append({"cmd": "center"})
    lines.append({"text": f"Pago: {'Efectivo' if bill['payment_method']=='cash' else 'Tarjeta'}"})
    lines.append({"text": "Gracias por su visita!"})
    lines.append({"cmd": "cut"})
    return {"printer_type": "escpos", "lines": lines, "bill_id": bill_id}

@api.get("/print/comanda-escpos/{order_id}")
async def print_comanda_escpos(order_id: str):
    """Returns ESC/POS raw command data for kitchen printer"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404)
    lines = []
    lines.append({"cmd": "center"})
    lines.append({"cmd": "double", "text": f"MESA {order['table_number']}"})
    lines.append({"cmd": "left"})
    lines.append({"text": f"Mesero: {order['waiter_name']}"})
    lines.append({"text": f"Hora: {order['created_at'][:19]}"})
    lines.append({"cmd": "line"})
    for item in order.get("items", []):
        if item["status"] == "cancelled":
            continue
        lines.append({"cmd": "bold", "text": f"{item['quantity']}x {item['product_name']}"})
        for m in item.get("modifiers", []):
            lines.append({"text": f"  > {m['name']}"})
        if item.get("notes"):
            lines.append({"text": f"  * {item['notes']}"})
    lines.append({"cmd": "line"})
    lines.append({"cmd": "cut"})
    return {"printer_type": "escpos", "lines": lines, "order_id": order_id}

# ─── KITCHEN TV DISPLAY ───
@api.get("/kitchen/config")
async def get_kitchen_config():
    config = await db.kitchen_config.find_one({}, {"_id": 0})
    return config or {"warning_minutes": 15, "urgent_minutes": 25, "critical_minutes": 35, "sound_enabled": True, "auto_advance_ready": False}

@api.put("/kitchen/config")
async def update_kitchen_config(input: dict):
    if "_id" in input: del input["_id"]
    await db.kitchen_config.update_one({}, {"$set": input}, upsert=True)
    return {"ok": True}

@api.post("/auth/auto-login")
async def auto_login(input: dict):
    """Auto-login for kiosk mode - accepts PIN via query or body"""
    pin = input.get("pin", "")
    if not pin:
        raise HTTPException(status_code=400, detail="PIN requerido")
    hashed = hash_pin(pin)
    user = await db.users.find_one({"pin_hash": hashed, "active": True}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="PIN incorrecto")
    perms = get_permissions(user["role"], user.get("permissions"))
    token = jwt.encode({"user_id": user["id"], "name": user["name"], "role": user["role"]}, JWT_SECRET, algorithm="HS256")
    user_data = {k: v for k, v in user.items() if k != "pin_hash"}
    user_data["permissions"] = perms
    return {"token": token, "user": user_data}

@api.get("/kitchen/tv")
async def kitchen_tv_data():
    """Optimized endpoint for kitchen TV display - large format, auto-refresh"""
    config = await db.kitchen_config.find_one({}, {"_id": 0}) or {"warning_minutes": 15, "urgent_minutes": 25, "critical_minutes": 35}
    orders = await db.orders.find(
        {"status": {"$in": ["sent", "active"]},
         "items": {"$elemMatch": {"sent_to_kitchen": True, "status": {"$nin": ["served", "cancelled"]}}}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(50)

    result = []
    for order in orders:
        kitchen_items = [i for i in order["items"] if i.get("sent_to_kitchen") and i["status"] not in ["served", "cancelled"]]
        if not kitchen_items:
            continue
        try:
            elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(order["created_at"].replace("Z", "+00:00"))).total_seconds() / 60
        except:
            elapsed = 0
        result.append({
            "order_id": order["id"], "table_number": order["table_number"],
            "waiter_name": order["waiter_name"], "created_at": order["created_at"],
            "elapsed_minutes": round(elapsed, 1),
            "is_warning": elapsed > config.get("warning_minutes", 15),
            "is_urgent": elapsed > config.get("urgent_minutes", 25),
            "is_critical": elapsed > config.get("critical_minutes", 35),
            "items": [{"id": i["id"], "product_name": i["product_name"], "quantity": i["quantity"],
                       "modifiers": [m["name"] for m in i.get("modifiers", [])],
                       "notes": i.get("notes", ""), "status": i["status"]} for i in kitchen_items]
        })
    return {"orders": result, "total": len(result), "timestamp": now_iso(), "config": config}

@api.get("/print/comanda/{order_id}")
async def print_comanda(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404)
    items_html = ""
    for item in order.get("items", []):
        if item["status"] in ["cancelled"]:
            continue
        mods = ", ".join(m["name"] for m in item.get("modifiers", []))
        notes = f"<br><i>{item['notes']}</i>" if item.get("notes") else ""
        items_html += f"<tr style='border-bottom:1px solid #ddd;'><td style='padding:6px 0;font-size:16px;'><b>{item['quantity']}x</b> {item['product_name']}"
        if mods:
            items_html += f"<br><small>{mods}</small>"
        items_html += f"{notes}</td></tr>"
    return {"html": f"""<div style='font-family:monospace;width:280px;padding:10px;font-size:12px;'>
    <div style='background:#000;color:#fff;padding:8px;text-align:center;font-size:18px;font-weight:bold;'>
    COCINA - MESA {order['table_number']}</div>
    <div style='padding:4px 0;font-size:11px;'>Mesero: {order['waiter_name']}<br>Hora: {order['created_at'][:19]}</div>
    <table style='width:100%;'>{items_html}</table></div>"""}

# ─── INVENTORY REPORTS ───
@api.get("/inventory/movements")
async def inventory_movements(product_id: Optional[str] = Query(None)):
    query = {"product_id": product_id} if product_id else {}
    return await db.inventory_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

@api.get("/reports/inventory")
async def inventory_report():
    inv = await db.inventory.find({}, {"_id": 0}).to_list(500)
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(200)
    products = await db.products.find({}, {"_id": 0}).to_list(500)
    prod_map = {p["id"]: p for p in products}
    recipe_map = {r["product_id"]: r for r in recipes}

    report = []
    for item in inv:
        pid = item.get("product_id", "")
        prod = prod_map.get(pid, {})
        recipe = recipe_map.get(pid, {})
        recipe_cost = sum(ing.get("cost", 0) * ing.get("quantity", 0) for ing in recipe.get("ingredients", []))
        sale_price = prod.get("price", 0)
        margin = ((sale_price - recipe_cost) / sale_price * 100) if sale_price > 0 and recipe_cost > 0 else 0
        report.append({
            "product_id": pid, "product_name": item.get("product_name", prod.get("name", "?")),
            "stock": item.get("stock", 0), "min_stock": item.get("min_stock", 10),
            "warehouse_id": item.get("warehouse_id", ""),
            "sale_price": sale_price, "recipe_cost": round(recipe_cost, 2),
            "margin_pct": round(margin, 1), "stock_value": round(item.get("stock", 0) * recipe_cost, 2)
        })
    return report

@api.get("/reports/profit")
async def profit_report(date: Optional[str] = Query(None)):
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(5000)
    day_bills = [b for b in bills if b.get("paid_at", "").startswith(date)]
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(200)
    products = await db.products.find({}, {"_id": 0}).to_list(500)
    recipe_cost_map = {}
    for r in recipes:
        recipe_cost_map[r["product_name"]] = sum(ing.get("cost", 0) * ing.get("quantity", 0) for ing in r.get("ingredients", []))
    prod_price_map = {p["name"]: p["price"] for p in products}

    total_revenue = 0
    total_cost = 0
    product_profit = {}
    for bill in day_bills:
        for item in bill.get("items", []):
            name = item["product_name"]
            qty = item.get("quantity", 1)
            revenue = item.get("total", 0)
            cost = recipe_cost_map.get(name, 0) * qty
            total_revenue += revenue
            total_cost += cost
            if name not in product_profit:
                product_profit[name] = {"name": name, "revenue": 0, "cost": 0, "quantity": 0}
            product_profit[name]["revenue"] += revenue
            product_profit[name]["cost"] += cost
            product_profit[name]["quantity"] += qty

    products_data = sorted(product_profit.values(), key=lambda x: -(x["revenue"] - x["cost"]))
    for p in products_data:
        p["profit"] = round(p["revenue"] - p["cost"], 2)
        p["margin_pct"] = round((p["profit"] / p["revenue"] * 100) if p["revenue"] > 0 else 0, 1)
        p["revenue"] = round(p["revenue"], 2)
        p["cost"] = round(p["cost"], 2)

    return {
        "date": date, "total_revenue": round(total_revenue, 2), "total_cost": round(total_cost, 2),
        "gross_profit": round(total_revenue - total_cost, 2),
        "margin_pct": round(((total_revenue - total_cost) / total_revenue * 100) if total_revenue > 0 else 0, 1),
        "products": products_data
    }

# ─── DGII EXPORT ───
@api.get("/export/dgii-607")
async def export_dgii_607(month: Optional[str] = Query(None)):
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(10000)
    month_bills = [b for b in bills if b.get("paid_at", "").startswith(month)]
    rows = []
    for b in month_bills:
        rows.append({
            "ncf": b.get("ncf", ""), "rnc_cedula": "", "tipo_id": "99",
            "fecha": b.get("paid_at", "")[:10], "subtotal": b.get("subtotal", 0),
            "itbis": b.get("itbis", 0), "total": b.get("total", 0),
            "forma_pago": "01" if b.get("payment_method") == "cash" else "02"
        })
    return {"month": month, "total_records": len(rows), "total_amount": round(sum(r["total"] for r in rows), 2),
            "total_itbis": round(sum(r["itbis"] for r in rows), 2), "rows": rows}

@api.get("/export/dgii-608")
async def export_dgii_608(month: Optional[str] = Query(None)):
    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")
    pos = await db.purchase_orders.find({"status": {"$in": ["received", "partial"]}}, {"_id": 0}).to_list(5000)
    month_pos = [p for p in pos if p.get("created_at", "").startswith(month)]
    suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(100)
    sup_map = {s["id"]: s for s in suppliers}
    rows = []
    for po in month_pos:
        sup = sup_map.get(po.get("supplier_id", ""), {})
        rows.append({
            "rnc": sup.get("rnc", ""), "supplier_name": po.get("supplier_name", ""),
            "ncf": "", "fecha": po.get("created_at", "")[:10],
            "subtotal": po.get("total", 0), "itbis": round(po.get("total", 0) * 0.18, 2),
            "total": round(po.get("total", 0) * 1.18, 2)
        })
    return {"month": month, "total_records": len(rows), "total_amount": round(sum(r["total"] for r in rows), 2), "rows": rows}

# ─── TAX CONFIG ───
@api.get("/tax-config")
async def get_tax_config():
    taxes = await db.tax_config.find({}, {"_id": 0}).sort("order", 1).to_list(10)
    if not taxes:
        defaults = [
            {"id": gen_id(), "description": "ITBIS", "rate": 18.00, "apply_to_tip": False, "active": True, "order": 0},
            {"id": gen_id(), "description": "Propina Legal (Ley 10%)", "rate": 10.00, "apply_to_tip": False, "active": True, "order": 1, "is_tip": True},
            {"id": gen_id(), "description": "Impuesto Municipal", "rate": 0, "apply_to_tip": False, "active": False, "order": 2},
            {"id": gen_id(), "description": "Tax 4", "rate": 0, "apply_to_tip": False, "active": False, "order": 3},
            {"id": gen_id(), "description": "Tax 5", "rate": 0, "apply_to_tip": False, "active": False, "order": 4},
        ]
        await db.tax_config.insert_many(defaults)
        return defaults
    return taxes

@api.put("/tax-config")
async def update_tax_config(input: dict):
    """Update all tax rows at once"""
    taxes = input.get("taxes", [])
    for tax in taxes:
        tid = tax.get("id")
        if tid:
            safe = {k: v for k, v in tax.items() if k != "_id"}
            await db.tax_config.update_one({"id": tid}, {"$set": safe}, upsert=True)
    return {"ok": True}

@api.get("/tax-config/calculate")
async def calculate_taxes(subtotal: float = Query(0)):
    """Calculate all taxes for a given subtotal"""
    taxes = await db.tax_config.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(10)
    result = {"subtotal": round(subtotal, 2), "taxes": [], "total": subtotal}
    tip_base = subtotal
    for tax in taxes:
        rate = tax.get("rate", 0)
        is_tip = tax.get("is_tip", False)
        base = tip_base if not tax.get("apply_to_tip") else result["total"]
        amount = round(base * (rate / 100), 2)
        result["taxes"].append({"description": tax["description"], "rate": rate, "amount": amount, "is_tip": is_tip})
        result["total"] = round(result["total"] + amount, 2)
    return result

# ─── SALE TYPES ───
@api.get("/sale-types")
async def list_sale_types():
    types = await db.sale_types.find({}, {"_id": 0}).to_list(50)
    if not types:
        defaults = [
            {"id": gen_id(), "name": "Consumidor Final", "code": "dine_in", "tax_rate": 18, "tip_default": 10, "active": True},
            {"id": gen_id(), "name": "Take Out", "code": "take_out", "tax_rate": 18, "tip_default": 0, "active": True},
            {"id": gen_id(), "name": "Delivery", "code": "delivery", "tax_rate": 18, "tip_default": 0, "active": True},
        ]
        await db.sale_types.insert_many(defaults)
        return defaults
    return types

@api.post("/sale-types")
async def create_sale_type(input: dict):
    doc = {"id": gen_id(), "name": input.get("name",""), "code": input.get("code",""),
           "tax_rate": input.get("tax_rate", 18), "tip_default": input.get("tip_default", 0), "active": True}
    await db.sale_types.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/sale-types/{sid}")
async def update_sale_type(sid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.sale_types.update_one({"id": sid}, {"$set": input})
    return {"ok": True}

@api.delete("/sale-types/{sid}")
async def delete_sale_type(sid: str):
    await db.sale_types.delete_one({"id": sid})
    return {"ok": True}

# ─── SHIFT VALIDATION ───
@api.get("/shifts/check")
async def check_shift_required(user=Depends(get_current_user)):
    """Check if user needs to open a shift before selling"""
    shift = await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})
    return {"has_open_shift": shift is not None, "shift": shift}

# ─── DAY CLOSE ───
@api.get("/day-close/check")
async def check_day_close():
    """Check if day can be closed"""
    occupied = await db.tables.count_documents({"status": {"$ne": "free"}})
    open_shifts = await db.shifts.find({"status": "open"}, {"_id": 0}).to_list(50)
    open_orders = await db.orders.count_documents({"status": {"$in": ["active", "sent"]}})
    can_close = occupied == 0 and len(open_shifts) == 0 and open_orders == 0
    blockers = []
    if occupied > 0: blockers.append(f"{occupied} mesa(s) ocupada(s)")
    if len(open_shifts) > 0: blockers.append(f"{len(open_shifts)} turno(s) abierto(s): " + ", ".join(s["user_name"] for s in open_shifts))
    if open_orders > 0: blockers.append(f"{open_orders} orden(es) activa(s)")
    return {"can_close": can_close, "blockers": blockers}

@api.post("/day-close/execute")
async def execute_day_close(input: dict, user=Depends(get_current_user)):
    check = await check_day_close()
    if not check["can_close"]:
        raise HTTPException(status_code=400, detail="No se puede cerrar: " + ", ".join(check["blockers"]))
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(5000)
    day_bills = [b for b in bills if b.get("paid_at", "").startswith(date)]
    total = sum(b["total"] for b in day_bills)
    doc = {"id": gen_id(), "date": date, "total_bills": len(day_bills), "total_sales": round(total, 2),
           "closed_by": user["name"], "closed_at": now_iso()}
    await db.day_closes.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

# ─── STATION CONFIG ───
@api.get("/station-config")
async def get_station_config():
    config = await db.station_config.find_one({}, {"_id": 0})
    return config or {"require_shift_to_sell": True, "require_cash_count": False, "auto_send_on_logout": True}

@api.put("/station-config")
async def update_station_config(input: dict):
    if "_id" in input: del input["_id"]
    await db.station_config.update_one({}, {"$set": input}, upsert=True)
    return {"ok": True}

# ─── PRINT CHANNELS ───
@api.get("/print-channels")
async def list_print_channels():
    channels = await db.print_channels.find({}, {"_id": 0}).to_list(50)
    if not channels:
        defaults = [
            {"id": gen_id(), "name": "Cocina Principal", "type": "kitchen", "target": "screen", "ip": "", "active": True},
            {"id": gen_id(), "name": "Barra", "type": "bar", "target": "screen", "ip": "", "active": True},
            {"id": gen_id(), "name": "Caja", "type": "receipt", "target": "screen", "ip": "", "active": True},
        ]
        await db.print_channels.insert_many(defaults)
        return defaults
    return channels

@api.post("/print-channels")
async def create_print_channel(input: dict):
    doc = {"id": gen_id(), "name": input.get("name",""), "type": input.get("type","kitchen"),
           "target": input.get("target","screen"), "ip": input.get("ip",""), "active": True}
    await db.print_channels.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/print-channels/{cid}")
async def update_print_channel(cid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.print_channels.update_one({"id": cid}, {"$set": input})
    return {"ok": True}

@api.delete("/print-channels/{cid}")
async def delete_print_channel(cid: str):
    await db.print_channels.delete_one({"id": cid})
    return {"ok": True}

# ─── RESERVATIONS ───
@api.get("/reservations")
async def list_reservations(date: Optional[str] = Query(None)):
    query = {}
    if date:
        query = {"date": date}
    return await db.reservations.find(query, {"_id": 0}).sort("time", 1).to_list(200)

@api.post("/reservations")
async def create_reservation(input: dict):
    table_ids = input.get("table_ids", [])
    if input.get("table_id") and input["table_id"] not in table_ids:
        table_ids.append(input["table_id"])
    table_numbers = []
    for tid in table_ids:
        t = await db.tables.find_one({"id": tid}, {"_id": 0})
        if t:
            table_numbers.append(t["number"])
    
    # New fields for activation timing
    activation_minutes = input.get("activation_minutes", 60)  # Default 1 hour before
    tolerance_minutes = input.get("tolerance_minutes", 15)    # Default 15 min after
    
    doc = {
        "id": gen_id(), 
        "customer_name": input.get("customer_name",""),
        "phone": input.get("phone",""), 
        "date": input.get("date",""),
        "time": input.get("time",""), 
        "party_size": input.get("party_size",2),
        "table_ids": table_ids, 
        "table_numbers": table_numbers,
        "area_id": input.get("area_id", ""),
        "notes": input.get("notes",""), 
        "status": "confirmed",
        "activation_minutes": activation_minutes,
        "tolerance_minutes": tolerance_minutes,
        "created_at": now_iso()
    }
    await db.reservations.insert_one(doc)
    
    # DON'T set tables to reserved yet - that happens when activation time arrives
    # Just store the reservation_id for reference
    for tid in table_ids:
        await db.tables.update_one({"id": tid}, {"$set": {"pending_reservation_id": doc["id"]}})
    
    return {k: v for k, v in doc.items() if k != "_id"}

@api.get("/reservations/check-activations")
async def check_reservation_activations():
    """Check and activate reservations that should be visible now"""
    from datetime import datetime, timedelta, timezone
    
    # Get configured timezone from system config
    config = await db.system_config.find_one({}, {"_id": 0})
    tz_offset_hours = config.get("timezone_offset", -4) if config else -4
    
    TZ_OFFSET = timedelta(hours=tz_offset_hours)
    LOCAL_TZ = timezone(TZ_OFFSET)
    
    now = datetime.now(LOCAL_TZ)
    today = now.strftime("%Y-%m-%d")
    tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Get all confirmed reservations for today AND tomorrow (to handle edge cases)
    reservations = await db.reservations.find(
        {"date": {"$in": [today, tomorrow]}, "status": "confirmed"}, {"_id": 0}
    ).to_list(200)
    
    activated = []
    expired = []
    
    for res in reservations:
        try:
            # Parse reservation time (already in local time)
            res_time_str = f"{res['date']} {res['time']}"
            res_datetime = datetime.strptime(res_time_str, "%Y-%m-%d %H:%M").replace(tzinfo=LOCAL_TZ)
            
            activation_minutes = res.get("activation_minutes", 60)
            tolerance_minutes = res.get("tolerance_minutes", 15)
            
            activation_time = res_datetime - timedelta(minutes=activation_minutes)
            expiry_time = res_datetime + timedelta(minutes=tolerance_minutes)
            
            # Check if should activate (within activation window)
            if activation_time <= now < expiry_time:
                # Activate - set tables to reserved
                for tid in res.get("table_ids", []):
                    await db.tables.update_one(
                        {"id": tid}, 
                        {"$set": {"status": "reserved", "reservation_id": res["id"]}}
                    )
                activated.append(res["id"])
            
            # Check if expired (past tolerance time and still confirmed)
            elif now >= expiry_time:
                # Expire - free the tables and mark as no_show
                for tid in res.get("table_ids", []):
                    current_table = await db.tables.find_one({"id": tid}, {"_id": 0})
                    # Only free if still reserved for this reservation
                    if current_table and current_table.get("reservation_id") == res["id"]:
                        await db.tables.update_one(
                            {"id": tid}, 
                            {"$set": {"status": "free", "reservation_id": None, "pending_reservation_id": None}}
                        )
                await db.reservations.update_one(
                    {"id": res["id"]}, 
                    {"$set": {"status": "no_show", "auto_expired": True}}
                )
                expired.append(res["id"])
                
        except Exception as e:
            print(f"Error processing reservation {res.get('id')}: {e}")
    
    return {"activated": activated, "expired": expired, "checked": len(reservations)}

@api.put("/reservations/{rid}")
async def update_reservation(rid: str, input: dict):
    if "_id" in input: del input["_id"]
    old = await db.reservations.find_one({"id": rid}, {"_id": 0})
    if input.get("status") in ["cancelled", "completed", "no_show"]:
        # Free the tables
        if old:
            for tid in old.get("table_ids", []):
                await db.tables.update_one({"id": tid}, {"$set": {"status": "free", "reservation_id": None}})
    if input.get("status") == "seated" and old:
        for tid in old.get("table_ids", []):
            await db.tables.update_one({"id": tid}, {"$set": {"status": "occupied", "reservation_id": None}})
    await db.reservations.update_one({"id": rid}, {"$set": input})
    return {"ok": True}

@api.post("/reservations/{rid}/release")
async def release_reservation(rid: str, user=Depends(get_current_user)):
    """Release reserved tables - requires authorized role"""
    perms = get_permissions(user.get("role", "waiter"))
    res = await db.reservations.find_one({"id": rid}, {"_id": 0})
    if not res:
        raise HTTPException(status_code=404)
    for tid in res.get("table_ids", []):
        await db.tables.update_one({"id": tid}, {"$set": {"status": "free", "reservation_id": None}})
    await db.reservations.update_one({"id": rid}, {"$set": {"status": "no_show"}})
    return {"ok": True}

@api.delete("/reservations/{rid}")
async def delete_reservation(rid: str):
    await db.reservations.delete_one({"id": rid})
    return {"ok": True}

# ─── SEED ───
@api.post("/seed")
async def seed_data():
    count = await db.users.count_documents({})
    if count > 0:
        return {"message": "Datos ya sembrados", "seeded": False}

    # Users
    users = [
        {"id": gen_id(), "name": "Admin", "pin_hash": hash_pin("0000"), "role": "admin", "active": True, "permissions": {}},
        {"id": gen_id(), "name": "Carlos", "pin_hash": hash_pin("1234"), "role": "waiter", "active": True, "permissions": {}},
        {"id": gen_id(), "name": "Maria", "pin_hash": hash_pin("5678"), "role": "waiter", "active": True, "permissions": {}},
        {"id": gen_id(), "name": "Luis", "pin_hash": hash_pin("4321"), "role": "cashier", "active": True, "permissions": {}},
        {"id": gen_id(), "name": "Chef Pedro", "pin_hash": hash_pin("9999"), "role": "kitchen", "active": True, "permissions": {}},
    ]
    await db.users.insert_many(users)

    # Areas
    areas = [
        {"id": gen_id(), "name": "Salon Principal", "color": "#FF6600", "order": 0},
        {"id": gen_id(), "name": "Terraza", "color": "#4CAF50", "order": 1},
        {"id": gen_id(), "name": "Bar", "color": "#2196F3", "order": 2},
        {"id": gen_id(), "name": "VIP", "color": "#9C27B0", "order": 3},
    ]
    await db.areas.insert_many(areas)

    # Tables
    tables = []
    salon_positions = [(10,15,"round",4),(30,15,"round",4),(50,15,"square",2),(70,15,"round",6),
                       (10,55,"rectangle",8),(35,55,"round",4),(55,55,"round",4),(75,55,"square",2)]
    for i,(x,y,shape,cap) in enumerate(salon_positions,1):
        tables.append({"id":gen_id(),"number":i,"area_id":areas[0]["id"],"capacity":cap,"shape":shape,
                       "x":x,"y":y,"width":80,"height":80 if shape!="rectangle" else 50,"status":"free","active_order_id":None})

    for i,(x,y) in enumerate([(15,20),(40,20),(65,20),(15,60),(40,60),(65,60)],9):
        tables.append({"id":gen_id(),"number":i,"area_id":areas[1]["id"],"capacity":4,"shape":"round",
                       "x":x,"y":y,"width":80,"height":80,"status":"free","active_order_id":None})

    for i,x in enumerate([20,40,60,80],15):
        tables.append({"id":gen_id(),"number":i,"area_id":areas[2]["id"],"capacity":2,"shape":"square",
                       "x":x,"y":40,"width":60,"height":60,"status":"free","active_order_id":None})

    for i,(x,y) in enumerate([(20,30),(50,30),(35,70)],19):
        tables.append({"id":gen_id(),"number":i,"area_id":areas[3]["id"],"capacity":6,"shape":"rectangle",
                       "x":x,"y":y,"width":100,"height":60,"status":"free","active_order_id":None})
    await db.tables.insert_many(tables)

    # Modifiers
    mod_coccion = {"id":gen_id(),"name":"Punto de Coccion","required":True,"max_selections":1,
        "options":[{"id":gen_id(),"name":"Poco cocido","price":0},{"id":gen_id(),"name":"Termino medio","price":0},
                   {"id":gen_id(),"name":"Tres cuartos","price":0},{"id":gen_id(),"name":"Bien cocido","price":0}]}
    mod_extras = {"id":gen_id(),"name":"Extras","required":False,"max_selections":5,
        "options":[{"id":gen_id(),"name":"Extra queso","price":50},{"id":gen_id(),"name":"Extra aguacate","price":60},
                   {"id":gen_id(),"name":"Extra tostones","price":80},{"id":gen_id(),"name":"Extra ensalada","price":70}]}
    mod_sides = {"id":gen_id(),"name":"Acompanantes","required":False,"max_selections":2,
        "options":[{"id":gen_id(),"name":"Arroz blanco","price":0},{"id":gen_id(),"name":"Arroz con habichuelas","price":0},
                   {"id":gen_id(),"name":"Ensalada","price":0},{"id":gen_id(),"name":"Tostones","price":0},
                   {"id":gen_id(),"name":"Papas fritas","price":50}]}
    mod_sin = {"id":gen_id(),"name":"Sin...","required":False,"max_selections":5,
        "options":[{"id":gen_id(),"name":"Sin cebolla","price":0},{"id":gen_id(),"name":"Sin ajo","price":0},
                   {"id":gen_id(),"name":"Sin picante","price":0},{"id":gen_id(),"name":"Sin sal","price":0}]}
    await db.modifiers.insert_many([mod_coccion, mod_extras, mod_sides, mod_sin])

    # Categories
    cats = [
        {"id":gen_id(),"name":"Entradas","color":"#FF6600","icon":"soup","order":0},
        {"id":gen_id(),"name":"Platos Principales","color":"#E53935","icon":"beef","order":1},
        {"id":gen_id(),"name":"Mariscos","color":"#1E88E5","icon":"fish","order":2},
        {"id":gen_id(),"name":"Bebidas","color":"#43A047","icon":"cup-soda","order":3},
        {"id":gen_id(),"name":"Cervezas","color":"#FFB300","icon":"beer","order":4},
        {"id":gen_id(),"name":"Postres","color":"#E91E63","icon":"cake","order":5},
        {"id":gen_id(),"name":"Tragos","color":"#8E24AA","icon":"wine","order":6},
    ]
    await db.categories.insert_many(cats)

    # Products
    products = [
        {"id":gen_id(),"name":"Tostones con Queso","category_id":cats[0]["id"],"price":250,"modifier_group_ids":[mod_extras["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Empanadas de Pollo","category_id":cats[0]["id"],"price":180,"modifier_group_ids":[],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Yuca Frita","category_id":cats[0]["id"],"price":200,"modifier_group_ids":[mod_extras["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Chicharron de Cerdo","category_id":cats[0]["id"],"price":350,"modifier_group_ids":[mod_extras["id"],mod_sin["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Bandera Dominicana","category_id":cats[1]["id"],"price":450,"modifier_group_ids":[mod_sides["id"],mod_sin["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Mangu con Los Tres Golpes","category_id":cats[1]["id"],"price":380,"modifier_group_ids":[mod_sin["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Chivo Guisado","category_id":cats[1]["id"],"price":550,"modifier_group_ids":[mod_sides["id"],mod_sin["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Pollo al Horno","category_id":cats[1]["id"],"price":420,"modifier_group_ids":[mod_sides["id"],mod_sin["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Churrasco","category_id":cats[1]["id"],"price":650,"modifier_group_ids":[mod_coccion["id"],mod_sides["id"],mod_extras["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Mofongo Relleno","category_id":cats[1]["id"],"price":480,"modifier_group_ids":[mod_extras["id"],mod_sin["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Sancocho","category_id":cats[1]["id"],"price":400,"modifier_group_ids":[mod_sin["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Camarones al Ajillo","category_id":cats[2]["id"],"price":680,"modifier_group_ids":[mod_sides["id"],mod_extras["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Pescado Frito","category_id":cats[2]["id"],"price":520,"modifier_group_ids":[mod_sides["id"],mod_sin["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Langosta a la Plancha","category_id":cats[2]["id"],"price":1200,"modifier_group_ids":[mod_coccion["id"],mod_sides["id"]],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Morir Sonando","category_id":cats[3]["id"],"price":150,"modifier_group_ids":[],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Jugo de Chinola","category_id":cats[3]["id"],"price":120,"modifier_group_ids":[],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Agua","category_id":cats[3]["id"],"price":80,"modifier_group_ids":[],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Refresco","category_id":cats[3]["id"],"price":100,"modifier_group_ids":[],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Presidente","category_id":cats[4]["id"],"price":200,"modifier_group_ids":[],"track_inventory":True,"active":True},
        {"id":gen_id(),"name":"Bohemia","category_id":cats[4]["id"],"price":250,"modifier_group_ids":[],"track_inventory":True,"active":True},
        {"id":gen_id(),"name":"Brahma","category_id":cats[4]["id"],"price":180,"modifier_group_ids":[],"track_inventory":True,"active":True},
        {"id":gen_id(),"name":"Flan de Coco","category_id":cats[5]["id"],"price":180,"modifier_group_ids":[],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Dulce de Leche","category_id":cats[5]["id"],"price":150,"modifier_group_ids":[],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Habichuelas con Dulce","category_id":cats[5]["id"],"price":160,"modifier_group_ids":[],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Bizcocho Dominicano","category_id":cats[5]["id"],"price":200,"modifier_group_ids":[],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Mamajuana","category_id":cats[6]["id"],"price":300,"modifier_group_ids":[],"track_inventory":True,"active":True},
        {"id":gen_id(),"name":"Mojito","category_id":cats[6]["id"],"price":350,"modifier_group_ids":[],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Pina Colada","category_id":cats[6]["id"],"price":320,"modifier_group_ids":[],"track_inventory":False,"active":True},
        {"id":gen_id(),"name":"Cuba Libre","category_id":cats[6]["id"],"price":280,"modifier_group_ids":[],"track_inventory":False,"active":True},
    ]
    await db.products.insert_many(products)

    # Cancellation reasons
    reasons = [
        {"id":gen_id(),"name":"Botella no abierta","return_to_inventory":True,"active":True},
        {"id":gen_id(),"name":"Error de digitacion","return_to_inventory":True,"active":True},
        {"id":gen_id(),"name":"Plato no preparado","return_to_inventory":True,"active":True},
        {"id":gen_id(),"name":"Plato mal preparado","return_to_inventory":False,"active":True},
        {"id":gen_id(),"name":"Cliente se fue","return_to_inventory":False,"active":True},
        {"id":gen_id(),"name":"Botella/bebida abierta","return_to_inventory":False,"active":True},
        {"id":gen_id(),"name":"Comida rechazada","return_to_inventory":False,"active":True},
    ]
    await db.cancellation_reasons.insert_many(reasons)

    await db.ncf_sequences.insert_one({"prefix": "B01", "current_number": 0})

    # Warehouses
    warehouses = [
        {"id": gen_id(), "name": "Almacen Principal", "location": "Cocina", "active": True},
        {"id": gen_id(), "name": "Barra", "location": "Area de Bar", "active": True},
    ]
    await db.warehouses.insert_many(warehouses)

    # Suppliers
    suppliers = [
        {"id": gen_id(), "name": "Distribuidora Nacional", "contact_name": "Jose Martinez",
         "phone": "809-555-0001", "email": "jose@distnacional.com", "address": "Santo Domingo",
         "rnc": "101-00001-1", "active": True, "created_at": now_iso()},
        {"id": gen_id(), "name": "Mariscos del Caribe", "contact_name": "Ana Lopez",
         "phone": "809-555-0002", "email": "ana@mariscoscaribe.com", "address": "Puerto Plata",
         "rnc": "101-00002-2", "active": True, "created_at": now_iso()},
        {"id": gen_id(), "name": "Bebidas Nacionales SRL", "contact_name": "Pedro Gomez",
         "phone": "809-555-0003", "email": "pedro@bebidasnac.com", "address": "Santiago",
         "rnc": "101-00003-3", "active": True, "created_at": now_iso()},
    ]
    await db.suppliers.insert_many(suppliers)

    # Inventory (initial stock for tracked items)
    inv_items = []
    for p in products:
        if p.get("track_inventory"):
            inv_items.append({
                "product_id": p["id"], "product_name": p["name"],
                "warehouse_id": warehouses[1]["id"] if "cerveza" in p["name"].lower() or "mamajuana" in p["name"].lower() else warehouses[0]["id"],
                "stock": 50, "min_stock": 10, "max_stock": 100, "unit": "unidad", "last_updated": now_iso()
            })
    if inv_items:
        await db.inventory.insert_many(inv_items)

    # Loyalty config
    await db.loyalty_config.insert_one({
        "points_per_hundred": 10, "point_value_rd": 1, "min_redemption": 50
    })

    # Sample customers
    customers = [
        {"id": gen_id(), "name": "Juan Perez", "phone": "809-555-1001", "email": "juan@email.com",
         "points": 150, "total_spent": 4500, "visits": 8, "created_at": now_iso(), "last_visit": now_iso()},
        {"id": gen_id(), "name": "Maria Garcia", "phone": "809-555-1002", "email": "maria@email.com",
         "points": 80, "total_spent": 2800, "visits": 5, "created_at": now_iso(), "last_visit": now_iso()},
        {"id": gen_id(), "name": "Carlos Rodriguez", "phone": "809-555-1003", "email": "",
         "points": 220, "total_spent": 7200, "visits": 15, "created_at": now_iso(), "last_visit": now_iso()},
    ]
    await db.customers.insert_many(customers)

    # Payment methods
    pay_methods = [
        {"id": gen_id(), "name": "Efectivo RD$", "icon": "banknote", "currency": "DOP", "exchange_rate": 1, "active": True},
        {"id": gen_id(), "name": "Tarjeta de Credito", "icon": "credit-card", "currency": "DOP", "exchange_rate": 1, "active": True},
        {"id": gen_id(), "name": "Tarjeta de Debito", "icon": "credit-card", "currency": "DOP", "exchange_rate": 1, "active": True},
        {"id": gen_id(), "name": "Transferencia", "icon": "smartphone", "currency": "DOP", "exchange_rate": 1, "active": True},
        {"id": gen_id(), "name": "Efectivo USD", "icon": "dollar-sign", "currency": "USD", "exchange_rate": 58.50, "active": True},
        {"id": gen_id(), "name": "Efectivo EUR", "icon": "euro", "currency": "EUR", "exchange_rate": 63.20, "active": True},
    ]
    await db.payment_methods.insert_many(pay_methods)

    # Sale types
    sale_types = [
        {"id": gen_id(), "name": "Consumidor Final", "code": "dine_in", "tax_rate": 18, "tip_default": 10, "active": True},
        {"id": gen_id(), "name": "Take Out", "code": "take_out", "tax_rate": 18, "tip_default": 0, "active": True},
        {"id": gen_id(), "name": "Delivery", "code": "delivery", "tax_rate": 18, "tip_default": 0, "active": True},
    ]
    await db.sale_types.insert_many(sale_types)

    # Station config
    await db.station_config.insert_one({"require_shift_to_sell": True, "require_cash_count": False, "auto_send_on_logout": True})

    # Recipes with costs (cost per ingredient for main dishes)
    recipe_data = [
        {"product_name": "Bandera Dominicana", "ingredients": [
            {"ingredient_name": "Arroz", "quantity": 0.25, "unit": "libra", "cost": 15},
            {"ingredient_name": "Habichuelas", "quantity": 0.2, "unit": "libra", "cost": 20},
            {"ingredient_name": "Carne guisada", "quantity": 0.3, "unit": "libra", "cost": 65},
            {"ingredient_name": "Ensalada", "quantity": 1, "unit": "porcion", "cost": 15},
            {"ingredient_name": "Maduro frito", "quantity": 1, "unit": "unidad", "cost": 8},
        ]},
        {"product_name": "Churrasco", "ingredients": [
            {"ingredient_name": "Churrasco de res", "quantity": 0.5, "unit": "libra", "cost": 120},
            {"ingredient_name": "Chimichurri", "quantity": 1, "unit": "porcion", "cost": 10},
            {"ingredient_name": "Acompanante", "quantity": 1, "unit": "porcion", "cost": 20},
        ]},
        {"product_name": "Mofongo Relleno", "ingredients": [
            {"ingredient_name": "Platano verde", "quantity": 3, "unit": "unidad", "cost": 8},
            {"ingredient_name": "Chicharron", "quantity": 0.15, "unit": "libra", "cost": 25},
            {"ingredient_name": "Relleno (carne/pollo)", "quantity": 0.2, "unit": "libra", "cost": 45},
            {"ingredient_name": "Aceite", "quantity": 0.1, "unit": "litro", "cost": 5},
        ]},
        {"product_name": "Chivo Guisado", "ingredients": [
            {"ingredient_name": "Chivo", "quantity": 0.4, "unit": "libra", "cost": 85},
            {"ingredient_name": "Oregano/especias", "quantity": 1, "unit": "porcion", "cost": 8},
            {"ingredient_name": "Acompanante", "quantity": 1, "unit": "porcion", "cost": 20},
        ]},
        {"product_name": "Camarones al Ajillo", "ingredients": [
            {"ingredient_name": "Camarones", "quantity": 0.35, "unit": "libra", "cost": 140},
            {"ingredient_name": "Ajo/mantequilla", "quantity": 1, "unit": "porcion", "cost": 15},
            {"ingredient_name": "Acompanante", "quantity": 1, "unit": "porcion", "cost": 20},
        ]},
        {"product_name": "Langosta a la Plancha", "ingredients": [
            {"ingredient_name": "Langosta", "quantity": 1, "unit": "unidad", "cost": 350},
            {"ingredient_name": "Mantequilla/limon", "quantity": 1, "unit": "porcion", "cost": 15},
            {"ingredient_name": "Acompanante", "quantity": 1, "unit": "porcion", "cost": 25},
        ]},
        {"product_name": "Sancocho", "ingredients": [
            {"ingredient_name": "Carnes variadas", "quantity": 0.3, "unit": "libra", "cost": 50},
            {"ingredient_name": "Viveres", "quantity": 0.5, "unit": "libra", "cost": 20},
            {"ingredient_name": "Vegetales/especias", "quantity": 1, "unit": "porcion", "cost": 15},
        ]},
        {"product_name": "Presidente", "ingredients": [
            {"ingredient_name": "Cerveza Presidente", "quantity": 1, "unit": "unidad", "cost": 80},
        ]},
        {"product_name": "Mamajuana", "ingredients": [
            {"ingredient_name": "Mamajuana preparada", "quantity": 1, "unit": "trago", "cost": 60},
        ]},
    ]
    prod_map = {p["name"]: p["id"] for p in products}
    for rd in recipe_data:
        pid = prod_map.get(rd["product_name"])
        if pid:
            ings = [{"id": gen_id(), **ing} for ing in rd["ingredients"]]
            await db.recipes.insert_one({
                "id": gen_id(), "product_id": pid, "product_name": rd["product_name"],
                "ingredients": ings, "yield_quantity": 1, "created_at": now_iso()
            })

    return {"message": "Datos sembrados exitosamente", "seeded": True,
            "users": [{"name": u["name"], "role": u["role"]} for u in users]}

# ─── APP CONFIG ───
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
