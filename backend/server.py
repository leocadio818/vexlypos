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
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

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

# Scheduler for automated tasks
scheduler = AsyncIOScheduler()

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
    comments: str = ""
    authorized_by_id: Optional[str] = None  # Manager who authorized (if required)
    authorized_by_name: Optional[str] = None
    
class BulkCancelInput(BaseModel):
    item_ids: List[str]
    reason_id: str
    return_to_inventory: bool = False
    comments: str = ""
    authorized_by_id: Optional[str] = None
    authorized_by_name: Optional[str] = None

class CancellationReasonInput(BaseModel):
    name: str
    return_to_inventory: bool = True
    requires_manager_auth: bool = False

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

# ─── INGREDIENT SYSTEM ───
class IngredientInput(BaseModel):
    name: str
    unit: str = "unidad"  # unidad de despacho (dispatch unit)
    category: str = "general"  # general, carnes, lacteos, vegetales, bebidas, etc
    min_stock: float = 0
    avg_cost: float = 0  # Costo por unidad de compra
    is_subrecipe: bool = False  # True if this ingredient is produced from a recipe
    recipe_id: str = ""  # If is_subrecipe, links to the recipe that produces it
    # Conversion factor fields
    purchase_unit: str = ""  # Unit used for purchasing (e.g., "Libra")
    purchase_quantity: float = 1  # Quantity in purchase unit (e.g., 1)
    dispatch_quantity: float = 1  # Equivalent quantity in dispatch unit (e.g., 16 for 16 oz per lb)
    conversion_factor: float = 1  # dispatch_quantity / purchase_quantity

class UnitDefinitionInput(BaseModel):
    name: str  # Display name (e.g., "Libra", "Kilogramo")
    abbreviation: str  # Short form (e.g., "lb", "kg")
    category: str = "custom"  # weight, volume, count, custom

class IngredientAuditInput(BaseModel):
    ingredient_id: str
    field_changed: str
    old_value: str
    new_value: str
    changed_by_id: str
    changed_by_name: str

class RecipeIngredientInput(BaseModel):
    ingredient_id: str
    ingredient_name: str = ""
    quantity: float
    unit: str = "unidad"
    waste_percentage: float = 0  # % de merma
    is_subrecipe: bool = False  # True if this component is a sub-recipe

class RecipeInput(BaseModel):
    product_id: str
    product_name: str
    ingredients: List[RecipeIngredientInput]
    yield_quantity: float = 1
    notes: str = ""
    is_subrecipe: bool = False  # True if this recipe produces an intermediate ingredient
    produces_ingredient_id: str = ""  # If is_subrecipe, the ingredient this recipe produces

class StockInput(BaseModel):
    ingredient_id: str
    warehouse_id: str
    current_stock: float
    min_stock: float = 0

class StockMovementInput(BaseModel):
    ingredient_id: str
    warehouse_id: str
    quantity: float  # positive for in, negative for out
    movement_type: str  # purchase, sale, transfer_in, transfer_out, waste, adjustment, explosion
    reference_id: str = ""  # PO id, order id, etc
    parent_product_id: str = ""  # For traceability - the top-level product that triggered this
    parent_recipe_id: str = ""  # The recipe that caused this explosion
    notes: str = ""

class StockDeductInput(BaseModel):
    product_id: str
    warehouse_id: str
    quantity: float = 1  # Number of portions/units to deduct
    order_id: str = ""  # Reference to the order

class StockTransferInput(BaseModel):
    ingredient_id: str
    from_warehouse_id: str
    to_warehouse_id: str
    quantity: float
    notes: str = ""

class POItemInput(BaseModel):
    ingredient_id: str
    ingredient_name: str = ""
    quantity: float
    unit_price: float
    received_quantity: float = 0

class PurchaseOrderInput(BaseModel):
    supplier_id: str
    warehouse_id: str
    items: List[POItemInput]
    notes: str = ""
    expected_date: str = ""

class ReceivePOItemInput(BaseModel):
    ingredient_id: str
    received_quantity: float
    actual_unit_price: float = 0  # For cost reconciliation

class ReceivePOInput(BaseModel):
    warehouse_id: str
    items: List[ReceivePOItemInput]
    notes: str = ""

class CustomerInput(BaseModel):
    name: str
    phone: str = ""
    email: str = ""

class InventoryAdjustInput(BaseModel):
    ingredient_id: str
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
            {"id": gen_id(), "name": "Efectivo RD$", "icon": "banknote", "icon_type": "lucide", "brand_icon": None, "bg_color": "#16a34a", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 0, "is_cash": True},
            {"id": gen_id(), "name": "Tarjeta de Crédito", "icon": "credit-card", "icon_type": "brand", "brand_icon": "visa", "bg_color": "#1e40af", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 1, "is_cash": False},
            {"id": gen_id(), "name": "Tarjeta de Débito", "icon": "credit-card", "icon_type": "brand", "brand_icon": "mastercard", "bg_color": "#7c3aed", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 2, "is_cash": False},
            {"id": gen_id(), "name": "Transferencia", "icon": "smartphone", "icon_type": "lucide", "brand_icon": None, "bg_color": "#0891b2", "text_color": "#ffffff", "currency": "DOP", "exchange_rate": 1, "active": True, "order": 3, "is_cash": False},
            {"id": gen_id(), "name": "USD Dólar", "icon": "dollar-sign", "icon_type": "lucide", "brand_icon": None, "bg_color": "#059669", "text_color": "#ffffff", "currency": "USD", "exchange_rate": 58.50, "active": True, "order": 4, "is_cash": True},
            {"id": gen_id(), "name": "EUR Euro", "icon": "euro", "icon_type": "lucide", "brand_icon": None, "bg_color": "#d97706", "text_color": "#ffffff", "currency": "EUR", "exchange_rate": 63.20, "active": True, "order": 5, "is_cash": True},
        ]
        await db.payment_methods.insert_many(defaults)
        return defaults
    # Add default values for missing fields (migration support)
    default_colors = {
        "Efectivo": "#16a34a", "Efectivo RD$": "#16a34a",
        "Tarjeta de Credito": "#1e40af", "Tarjeta de Crédito": "#1e40af", "Tarjeta Crédito": "#1e40af",
        "Tarjeta de Debito": "#7c3aed", "Tarjeta de Débito": "#7c3aed", "Tarjeta Débito": "#7c3aed",
        "Transferencia": "#0891b2",
        "USD": "#059669", "USD DOLAR": "#059669", "USD Dólar": "#059669", "Dolar (USD)": "#059669",
        "EUR": "#d97706", "EUR Euro": "#d97706", "Euro (EUR)": "#d97706",
    }
    # Detect cash methods by name for migration
    cash_keywords = ["efectivo", "cash", "usd", "eur", "dolar", "euro", "dollar"]
    for m in methods:
        if "bg_color" not in m or not m["bg_color"]:
            m["bg_color"] = default_colors.get(m.get("name", ""), "#6b7280")
        if "text_color" not in m or not m["text_color"]:
            m["text_color"] = "#ffffff"
        if "icon_type" not in m:
            m["icon_type"] = "lucide"
        if "brand_icon" not in m:
            m["brand_icon"] = None
        if "order" not in m:
            m["order"] = 0
        # Auto-detect is_cash based on name if not set
        if "is_cash" not in m:
            name_lower = m.get("name", "").lower()
            m["is_cash"] = any(kw in name_lower for kw in cash_keywords)
    return methods

@api.post("/payment-methods")
async def create_payment_method(input: dict):
    count = await db.payment_methods.count_documents({})
    doc = {
        "id": gen_id(), 
        "name": input.get("name", ""), 
        "icon": input.get("icon", "circle"),
        "icon_type": input.get("icon_type", "lucide"),
        "brand_icon": input.get("brand_icon"),
        "bg_color": input.get("bg_color", "#6b7280"),
        "text_color": input.get("text_color", "#ffffff"),
        "currency": input.get("currency", "DOP"),
        "exchange_rate": input.get("exchange_rate", 1),
        "active": True,
        "order": count,
        "is_cash": input.get("is_cash", True)
    }
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

@api.put("/categories/{cat_id}")
async def update_category(cat_id: str, input: dict):
    existing = await db.categories.find_one({"id": cat_id})
    if not existing:
        raise HTTPException(404, "Category not found")
    update_data = {k: v for k, v in input.items() if k not in ["id", "_id"]}
    await db.categories.update_one({"id": cat_id}, {"$set": update_data})
    updated = await db.categories.find_one({"id": cat_id}, {"_id": 0})
    return updated

@api.delete("/categories/{cat_id}")
async def delete_category(cat_id: str):
    existing = await db.categories.find_one({"id": cat_id})
    if not existing:
        raise HTTPException(404, "Category not found")
    # Check if any products use this category
    products_count = await db.products.count_documents({"category_id": cat_id})
    if products_count > 0:
        raise HTTPException(400, f"No se puede eliminar: {products_count} productos usan esta categoría")
    await db.categories.delete_one({"id": cat_id})
    return {"status": "deleted"}

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
    # Get current order to check for existing items
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    existing_items = order.get("items", [])
    items_to_add = []
    items_to_update = []
    
    for item in input.items:
        # Check if there's an existing pending item with same product, modifiers, and notes
        existing_item = None
        for existing in existing_items:
            if (existing.get("product_id") == item.product_id and 
                existing.get("status") == "pending" and
                existing.get("notes", "") == (item.notes or "") and
                existing.get("modifiers", []) == (item.modifiers or [])):
                existing_item = existing
                break
        
        if existing_item:
            # Add quantity to existing item
            items_to_update.append({
                "item_id": existing_item["id"],
                "new_quantity": existing_item["quantity"] + item.quantity
            })
        else:
            # Create new item
            items_to_add.append({
                "id": gen_id(), "product_id": item.product_id, "product_name": item.product_name,
                "quantity": item.quantity, "unit_price": item.unit_price,
                "modifiers": item.modifiers or [], "notes": item.notes or "",
                "status": "pending", "sent_to_kitchen": False,
                "cancelled_reason_id": None, "return_to_inventory": False
            })
    
    # Update existing items quantities
    for update in items_to_update:
        await db.orders.update_one(
            {"id": order_id, "items.id": update["item_id"]},
            {"$set": {"items.$.quantity": update["new_quantity"], "updated_at": now_iso()}}
        )
    
    # Add new items
    if items_to_add:
        await db.orders.update_one(
            {"id": order_id},
            {"$push": {"items": {"$each": items_to_add}}, "$set": {"updated_at": now_iso()}}
        )
    elif items_to_update:
        # If only updates, still update the timestamp
        await db.orders.update_one(
            {"id": order_id},
            {"$set": {"updated_at": now_iso()}}
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

# ─── HELPER: Restore inventory from recipe ───
async def restore_inventory_for_item(item: dict, warehouse_id: str, user_id: str, user_name: str, order_id: str):
    """Restore inventory for a cancelled item using recipe explosion logic"""
    recipe = await db.recipes.find_one({"product_id": item["product_id"]}, {"_id": 0})
    if not recipe:
        return  # No recipe, nothing to restore
    
    quantity = item.get("quantity", 1)
    
    for recipe_ing in recipe.get("ingredients", []):
        ing_id = recipe_ing.get("ingredient_id")
        required_qty = recipe_ing.get("quantity", 0)
        waste_pct = recipe_ing.get("waste_percentage", 0)
        
        if not ing_id or required_qty <= 0:
            continue
        
        ingredient = await db.ingredients.find_one({"id": ing_id}, {"_id": 0})
        if not ingredient:
            continue
        
        # Calculate restore amount including waste
        restore_amount = required_qty * quantity * (1 + waste_pct / 100)
        
        # Check if this is a sub-recipe
        if ingredient.get("is_subrecipe") and ingredient.get("recipe_id"):
            # Restore sub-recipe stock
            await db.stock.update_one(
                {"ingredient_id": ing_id, "warehouse_id": warehouse_id},
                {"$inc": {"current_stock": restore_amount}},
                upsert=True
            )
        else:
            # Restore regular ingredient
            await db.stock.update_one(
                {"ingredient_id": ing_id, "warehouse_id": warehouse_id},
                {"$inc": {"current_stock": restore_amount}},
                upsert=True
            )
        
        # Log the stock movement as restoration
        movement = {
            "id": gen_id(),
            "ingredient_id": ing_id,
            "ingredient_name": ingredient.get("name", "?"),
            "warehouse_id": warehouse_id,
            "quantity": restore_amount,
            "type": "void_restoration",
            "reason": "Item cancelled - inventory restored",
            "parent_product_id": item["product_id"],
            "order_id": order_id,
            "user_id": user_id,
            "user_name": user_name,
            "created_at": now_iso()
        }
        await db.stock_movements.insert_one(movement)

@api.post("/orders/{order_id}/cancel-item/{item_id}")
async def cancel_order_item(order_id: str, item_id: str, input: CancelItemInput, user: dict = Depends(get_current_user)):
    """Cancel a single order item with optional inventory restoration and audit logging"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    item = next((i for i in order["items"] if i["id"] == item_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    
    # Get cancellation reason for audit
    reason = await db.cancellation_reasons.find_one({"id": input.reason_id}, {"_id": 0})
    reason_name = reason.get("name", "Sin razón") if reason else "Sin razón"
    requires_manager = reason.get("requires_manager_auth", False) if reason else False
    
    # Check if manager authorization is required but not provided
    if requires_manager and not input.authorized_by_id:
        raise HTTPException(status_code=403, detail="Esta anulación requiere autorización de gerente")
    
    # Update item status
    await db.orders.update_one(
        {"id": order_id, "items.id": item_id},
        {"$set": {
            "items.$.status": "cancelled",
            "items.$.cancelled_reason_id": input.reason_id,
            "items.$.return_to_inventory": input.return_to_inventory,
            "items.$.cancelled_comments": input.comments,
            "items.$.cancelled_at": now_iso(),
            "items.$.cancelled_by_id": user["user_id"],
            "items.$.cancelled_by_name": user["name"],
            "items.$.authorized_by_id": input.authorized_by_id,
            "items.$.authorized_by_name": input.authorized_by_name,
            "updated_at": now_iso()
        }}
    )
    
    # Check if item was already sent to kitchen (inventory was deducted)
    item_was_sent = item.get("status") == "sent" or item.get("sent_to_kitchen", False)
    inventory_was_deducted = item.get("inventory_deducted", False) or item_was_sent
    
    # Only restore inventory if it was previously deducted AND user selected return_to_inventory
    if input.return_to_inventory and inventory_was_deducted:
        inventory_config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
        default_warehouse = inventory_config.get("default_warehouse_id", "") if inventory_config else ""
        if not default_warehouse:
            wh = await db.warehouses.find_one({}, {"_id": 0})
            default_warehouse = wh["id"] if wh else ""
        
        if default_warehouse:
            await restore_inventory_for_item(
                item=item,
                warehouse_id=default_warehouse,
                user_id=user["user_id"],
                user_name=user["name"],
                order_id=order_id
            )
    
    # ─── CREATE AUDIT LOG ───
    audit_log = {
        "id": gen_id(),
        "order_id": order_id,
        "item_id": item_id,
        "item_ids": [item_id],
        "product_id": item.get("product_id"),
        "product_name": item.get("product_name", "?"),
        "quantity": item.get("quantity", 1),
        "unit_price": item.get("unit_price", 0),
        "total_value": item.get("unit_price", 0) * item.get("quantity", 1),
        "requested_by_id": user["user_id"],
        "requested_by_name": user["name"],
        "authorized_by_id": input.authorized_by_id,
        "authorized_by_name": input.authorized_by_name,
        "required_manager_auth": requires_manager,
        "reason_id": input.reason_id,
        "reason": reason_name,
        "restored_to_inventory": input.return_to_inventory and inventory_was_deducted,
        "was_inventory_deducted": inventory_was_deducted,
        "comments": input.comments,
        "void_type": "single_item",
        "created_at": now_iso()
    }
    await db.void_audit_logs.insert_one(audit_log)
    
    # If not restoring inventory but it was deducted, log as waste
    if not input.return_to_inventory and inventory_was_deducted:
        recipe = await db.recipes.find_one({"product_id": item["product_id"]}, {"_id": 0})
        if recipe:
            inventory_config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
            default_warehouse = inventory_config.get("default_warehouse_id", "") if inventory_config else ""
            if not default_warehouse:
                wh = await db.warehouses.find_one({}, {"_id": 0})
                default_warehouse = wh["id"] if wh else ""
            
            if default_warehouse:
                for recipe_ing in recipe.get("ingredients", []):
                    ing_id = recipe_ing.get("ingredient_id")
                    required_qty = recipe_ing.get("quantity", 0)
                    if not ing_id or required_qty <= 0:
                        continue
                    ingredient = await db.ingredients.find_one({"id": ing_id}, {"_id": 0})
                    if not ingredient:
                        continue
                    waste_amount = required_qty * item.get("quantity", 1)
                    # Log as waste movement (no stock change, just record)
                    movement = {
                        "id": gen_id(),
                        "ingredient_id": ing_id,
                        "ingredient_name": ingredient.get("name", "?"),
                        "warehouse_id": default_warehouse,
                        "quantity": -waste_amount,
                        "type": "waste",
                        "reason": f"Anulación: {reason_name}",
                        "parent_product_id": item["product_id"],
                        "order_id": order_id,
                        "user_id": user["user_id"],
                        "user_name": user["name"],
                        "created_at": now_iso()
                    }
                    await db.stock_movements.insert_one(movement)
    
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

@api.post("/orders/{order_id}/cancel-items")
async def cancel_multiple_items(order_id: str, input: BulkCancelInput, user: dict = Depends(get_current_user)):
    """Cancel multiple order items at once with optional inventory restoration and audit logging"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    # Get cancellation reason for audit
    reason = await db.cancellation_reasons.find_one({"id": input.reason_id}, {"_id": 0})
    reason_name = reason.get("name", "Sin razón") if reason else "Sin razón"
    requires_manager = reason.get("requires_manager_auth", False) if reason else False
    
    # Check if manager authorization is required but not provided
    if requires_manager and not input.authorized_by_id:
        raise HTTPException(status_code=403, detail="Esta anulación requiere autorización de gerente")
    
    items_cancelled = []
    total_value = 0
    
    for item_id in input.item_ids:
        item = next((i for i in order["items"] if i["id"] == item_id), None)
        if not item:
            continue
        
        # Update item status
        await db.orders.update_one(
            {"id": order_id, "items.id": item_id},
            {"$set": {
                "items.$.status": "cancelled",
                "items.$.cancelled_reason_id": input.reason_id,
                "items.$.return_to_inventory": input.return_to_inventory,
                "items.$.cancelled_comments": input.comments,
                "items.$.cancelled_at": now_iso(),
                "items.$.cancelled_by_id": user["user_id"],
                "items.$.cancelled_by_name": user["name"],
                "items.$.authorized_by_id": input.authorized_by_id,
                "items.$.authorized_by_name": input.authorized_by_name
            }}
        )
        
        items_cancelled.append({
            "id": item_id,
            "product_name": item.get("product_name", "?"),
            "quantity": item.get("quantity", 1),
            "unit_price": item.get("unit_price", 0)
        })
        total_value += item.get("unit_price", 0) * item.get("quantity", 1)
        
        # Check if item was sent (inventory was deducted)
        item_was_sent = item.get("status") == "sent" or item.get("sent_to_kitchen", False)
        inventory_was_deducted = item.get("inventory_deducted", False) or item_was_sent
        
        # Handle inventory restoration or waste logging
        if inventory_was_deducted:
            inventory_config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
            default_warehouse = inventory_config.get("default_warehouse_id", "") if inventory_config else ""
            if not default_warehouse:
                wh = await db.warehouses.find_one({}, {"_id": 0})
                default_warehouse = wh["id"] if wh else ""
            
            if default_warehouse:
                if input.return_to_inventory:
                    await restore_inventory_for_item(
                        item=item,
                        warehouse_id=default_warehouse,
                        user_id=user["user_id"],
                        user_name=user["name"],
                        order_id=order_id
                    )
                else:
                    # Log as waste
                    recipe = await db.recipes.find_one({"product_id": item["product_id"]}, {"_id": 0})
                    if recipe:
                        for recipe_ing in recipe.get("ingredients", []):
                            ing_id = recipe_ing.get("ingredient_id")
                            required_qty = recipe_ing.get("quantity", 0)
                            if not ing_id or required_qty <= 0:
                                continue
                            ingredient = await db.ingredients.find_one({"id": ing_id}, {"_id": 0})
                            if not ingredient:
                                continue
                            waste_amount = required_qty * item.get("quantity", 1)
                            movement = {
                                "id": gen_id(),
                                "ingredient_id": ing_id,
                                "ingredient_name": ingredient.get("name", "?"),
                                "warehouse_id": default_warehouse,
                                "quantity": -waste_amount,
                                "type": "waste",
                                "reason": f"Anulación múltiple: {reason_name}",
                                "parent_product_id": item["product_id"],
                                "order_id": order_id,
                                "user_id": user["user_id"],
                                "user_name": user["name"],
                                "created_at": now_iso()
                            }
                            await db.stock_movements.insert_one(movement)
    
    await db.orders.update_one({"id": order_id}, {"$set": {"updated_at": now_iso()}})
    
    # ─── CREATE BULK AUDIT LOG ───
    audit_log = {
        "id": gen_id(),
        "order_id": order_id,
        "item_id": None,
        "item_ids": input.item_ids,
        "items_cancelled": items_cancelled,
        "total_value": total_value,
        "requested_by_id": user["user_id"],
        "requested_by_name": user["name"],
        "authorized_by_id": input.authorized_by_id,
        "authorized_by_name": input.authorized_by_name,
        "required_manager_auth": requires_manager,
        "reason_id": input.reason_id,
        "reason": reason_name,
        "restored_to_inventory": input.return_to_inventory,
        "comments": input.comments,
        "void_type": "multiple_items",
        "created_at": now_iso()
    }
    await db.void_audit_logs.insert_one(audit_log)
    
    return await db.orders.find_one({"id": order_id}, {"_id": 0})

# ─── GET VOID AUDIT LOGS ───
@api.get("/void-audit-logs")
async def list_void_audit_logs(
    order_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    limit: int = Query(100)
):
    """Get void audit logs with optional filters"""
    query = {}
    if order_id:
        query["order_id"] = order_id
    if user_id:
        query["user_id"] = user_id
    if from_date:
        query["created_at"] = {"$gte": from_date}
    if to_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = to_date
        else:
            query["created_at"] = {"$lte": to_date}
    
    logs = await db.void_audit_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return logs

# ─── VOID REPORT ENDPOINT ───
@api.get("/void-audit-logs/report")
async def get_void_report(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    period: Optional[str] = Query(None)  # 'day', 'week', 'month'
):
    """Get aggregated void report for AnulacionesReport page"""
    from datetime import datetime, timedelta
    
    # Build date filter
    now = datetime.utcnow()
    if period == 'day':
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat() + "Z"
    elif period == 'week':
        start_date = (now - timedelta(days=7)).isoformat() + "Z"
    elif period == 'month':
        start_date = (now - timedelta(days=30)).isoformat() + "Z"
    else:
        start_date = from_date
    
    query = {}
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if to_date:
        if "created_at" in query:
            query["created_at"]["$lte"] = to_date
        else:
            query["created_at"] = {"$lte": to_date}
    
    logs = await db.void_audit_logs.find(query, {"_id": 0}).to_list(1000)
    
    # Calculate totals
    total_voided = 0
    recovered_value = 0
    loss_value = 0
    reason_counts = {}
    user_counts = {}
    
    for log in logs:
        value = log.get("total_value", 0)
        if not value and log.get("unit_price"):
            value = log.get("unit_price", 0) * log.get("quantity", 1)
        
        total_voided += value
        
        if log.get("restored_to_inventory"):
            recovered_value += value
        else:
            loss_value += value
        
        # Reason ranking
        reason = log.get("reason", "Sin razón")
        reason_counts[reason] = reason_counts.get(reason, 0) + 1
        
        # User audit - use requested_by for newer logs, fallback to user_id for older
        user_id = log.get("requested_by_id") or log.get("user_id")
        user_name = log.get("requested_by_name") or log.get("user_name", "Desconocido")
        if user_id:
            if user_id not in user_counts:
                user_counts[user_id] = {
                    "user_id": user_id,
                    "user_name": user_name,
                    "count": 0,
                    "total_value": 0,
                    "recovered": 0,
                    "loss": 0
                }
            user_counts[user_id]["count"] += 1
            user_counts[user_id]["total_value"] += value
            if log.get("restored_to_inventory"):
                user_counts[user_id]["recovered"] += value
            else:
                user_counts[user_id]["loss"] += value
    
    # Convert to sorted lists
    reason_ranking = [{"reason": r, "count": c} for r, c in reason_counts.items()]
    reason_ranking.sort(key=lambda x: x["count"], reverse=True)
    
    user_audit = list(user_counts.values())
    user_audit.sort(key=lambda x: x["count"], reverse=True)
    
    return {
        "summary": {
            "total_voided": round(total_voided, 2),
            "recovered_value": round(recovered_value, 2),
            "loss_value": round(loss_value, 2),
            "total_count": len(logs),
            "period": period or "custom"
        },
        "reason_ranking": reason_ranking,
        "user_audit": user_audit,
        "logs": logs[:100]  # Return last 100 logs for detail view
    }

# ─── VERIFY MANAGER PIN ───
@api.post("/auth/verify-manager")
async def verify_manager_pin(pin_data: dict):
    """Verify if a PIN belongs to a manager/admin user"""
    pin = pin_data.get("pin", "")
    hashed = hash_pin(pin)
    user = await db.users.find_one({"pin_hash": hashed, "active": True}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="PIN inválido")
    
    # Check if user has manager/admin permissions
    user_role = user.get("role", "").lower()
    role_id = user.get("role_id")
    
    # Check role from roles collection if role_id exists
    role_doc = None
    if role_id:
        role_doc = await db.roles.find_one({"id": role_id}, {"_id": 0})
    
    # Determine if user is a manager
    is_manager = False
    role_name = user_role
    
    if role_doc:
        permissions = role_doc.get("permissions", {})
        is_manager = (
            permissions.get("is_admin", False) or
            permissions.get("manage_users", False) or
            permissions.get("manage_cancellation_reasons", False)
        )
        role_name = role_doc.get("name", user_role)
    else:
        # Fallback to checking the role field directly
        is_manager = user_role in ["admin", "administrador", "gerente", "manager"]
    
    if not is_manager:
        raise HTTPException(status_code=403, detail="Este usuario no tiene permisos de gerente")
    
    return {
        "authorized": True,
        "user_id": user["id"],
        "user_name": user["name"],
        "role": role_name
    }

@api.post("/orders/{order_id}/send-kitchen")
async def send_to_kitchen(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    # Get pending items before sending
    pending_items = [i for i in order["items"] if i["status"] == "pending"]
    pending_ids = [i["id"] for i in pending_items]
    
    # Mark items as sent
    for pid in pending_ids:
        await db.orders.update_one(
            {"id": order_id, "items.id": pid},
            {"$set": {
                "items.$.status": "sent", 
                "items.$.sent_to_kitchen": True,
                "items.$.sent_at": now_iso(),
                "items.$.inventory_deducted": False  # Will be set to True after deduction
            }}
        )
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "sent", "updated_at": now_iso()}})
    
    # ─── AUTO DEDUCT INVENTORY ON SEND TO KITCHEN ───
    inventory_config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
    auto_deduct = inventory_config.get("auto_deduct_on_payment", True) if inventory_config else True
    
    if auto_deduct and pending_items:
        default_warehouse = inventory_config.get("default_warehouse_id", "") if inventory_config else ""
        if not default_warehouse:
            wh = await db.warehouses.find_one({}, {"_id": 0})
            default_warehouse = wh["id"] if wh else ""
        
        if default_warehouse:
            deduction_errors = []
            for item in pending_items:
                try:
                    recipe = await db.recipes.find_one({"product_id": item["product_id"]}, {"_id": 0})
                    if recipe:
                        await explode_and_deduct_recipe(
                            recipe=recipe,
                            warehouse_id=default_warehouse,
                            quantity=item.get("quantity", 1),
                            user_id=user["user_id"],
                            user_name=user["name"],
                            parent_product_id=item["product_id"],
                            order_id=order_id
                        )
                        # Mark item as inventory deducted
                        await db.orders.update_one(
                            {"id": order_id, "items.id": item["id"]},
                            {"$set": {"items.$.inventory_deducted": True}}
                        )
                except Exception as e:
                    deduction_errors.append(f"{item.get('product_name', '?')}: {str(e)}")
            
            if deduction_errors:
                await db.orders.update_one({"id": order_id}, {"$set": {
                    "inventory_deduction_errors": deduction_errors,
                    "inventory_deducted_at": now_iso()
                }})
    
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

# ─── MOVE ITEMS BETWEEN ORDERS ───
@api.post("/orders/{order_id}/move-items")
async def move_items_to_order(order_id: str, input: dict, user: dict = Depends(get_current_user)):
    """Move selected items from one order to another order"""
    target_order_id = input.get("target_order_id")
    item_ids = input.get("item_ids", [])
    
    if not target_order_id:
        raise HTTPException(status_code=400, detail="Debe especificar la cuenta destino")
    if not item_ids:
        raise HTTPException(status_code=400, detail="Debe seleccionar al menos un artículo")
    
    # Get source order
    source_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not source_order:
        raise HTTPException(status_code=404, detail="Orden origen no encontrada")
    
    # Get target order
    target_order = await db.orders.find_one({"id": target_order_id}, {"_id": 0})
    if not target_order:
        raise HTTPException(status_code=404, detail="Orden destino no encontrada")
    
    # Find items to move
    items_to_move = []
    remaining_items = []
    
    for item in source_order.get("items", []):
        if item.get("id") in item_ids:
            items_to_move.append(item)
        else:
            remaining_items.append(item)
    
    if len(items_to_move) == 0:
        raise HTTPException(status_code=400, detail="No se encontraron los artículos seleccionados")
    
    # Update source order (remove items)
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"items": remaining_items, "updated_at": now_iso()}}
    )
    
    # Update target order (add items)
    target_items = target_order.get("items", [])
    target_items.extend(items_to_move)
    await db.orders.update_one(
        {"id": target_order_id},
        {"$set": {"items": target_items, "updated_at": now_iso()}}
    )
    
    return {
        "ok": True,
        "items_moved": len(items_to_move),
        "source_order_id": order_id,
        "target_order_id": target_order_id
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

@api.get("/bills/{bill_id}")
async def get_bill(bill_id: str):
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return bill

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
    
    # NOTE: Inventory deduction now happens at send_to_kitchen, not at payment
    # This section was removed as requested by user
    
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
    doc = {
        "id": gen_id(), 
        "name": input.name, 
        "return_to_inventory": input.return_to_inventory, 
        "requires_manager_auth": input.requires_manager_auth,
        "active": True
    }
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
    return await db.stock.find(query, {"_id": 0}).to_list(500)

@api.get("/inventory/alerts")
async def inventory_alerts():
    items = await db.stock.find({"$expr": {"$lte": ["$current_stock", "$min_stock"]}}, {"_id": 0}).to_list(100)
    return items

@api.post("/inventory/adjust")
async def adjust_inventory(input: InventoryAdjustInput, user=Depends(get_current_user)):
    # Update stock
    await db.stock.update_one(
        {"ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id},
        {"$inc": {"current_stock": input.quantity}, "$set": {"last_updated": now_iso()}},
        upsert=True
    )
    # Log movement
    await db.stock_movements.insert_one({
        "id": gen_id(), "ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id,
        "quantity": input.quantity, "movement_type": "adjustment", "reference_id": "",
        "notes": input.reason, "user_id": user["user_id"], "user_name": user["name"], 
        "created_at": now_iso()
    })
    return {"ok": True}

# ─── INGREDIENTS ───
@api.get("/ingredients")
async def list_ingredients(category: Optional[str] = Query(None)):
    query = {"category": category} if category else {}
    return await db.ingredients.find(query, {"_id": 0}).to_list(500)

@api.get("/ingredients/{ingredient_id}")
async def get_ingredient(ingredient_id: str):
    ing = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
    if not ing:
        raise HTTPException(404, "Ingrediente no encontrado")
    return ing

@api.post("/ingredients")
async def create_ingredient(input: IngredientInput):
    doc = {
        "id": gen_id(), "name": input.name, "unit": input.unit,
        "category": input.category, "min_stock": input.min_stock,
        "avg_cost": input.avg_cost, "active": True, 
        "is_subrecipe": input.is_subrecipe, "recipe_id": input.recipe_id,
        "created_at": now_iso()
    }
    await db.ingredients.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/ingredients/{ingredient_id}")
async def update_ingredient(ingredient_id: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.ingredients.update_one({"id": ingredient_id}, {"$set": input})
    return {"ok": True}

@api.delete("/ingredients/{ingredient_id}")
async def delete_ingredient(ingredient_id: str):
    # Check if used in recipes
    recipe_count = await db.recipes.count_documents({"ingredients.ingredient_id": ingredient_id})
    if recipe_count > 0:
        raise HTTPException(400, f"No se puede eliminar: {recipe_count} recetas usan este ingrediente")
    await db.ingredients.delete_one({"id": ingredient_id})
    return {"ok": True}

# ─── STOCK ───
@api.get("/stock")
async def list_stock(warehouse_id: Optional[str] = Query(None), ingredient_id: Optional[str] = Query(None)):
    query = {}
    if warehouse_id: query["warehouse_id"] = warehouse_id
    if ingredient_id: query["ingredient_id"] = ingredient_id
    return await db.stock.find(query, {"_id": 0}).to_list(500)

@api.get("/stock/by-ingredient/{ingredient_id}")
async def get_stock_by_ingredient(ingredient_id: str):
    return await db.stock.find({"ingredient_id": ingredient_id}, {"_id": 0}).to_list(50)

@api.post("/stock")
async def upsert_stock(input: StockInput):
    existing = await db.stock.find_one({
        "ingredient_id": input.ingredient_id, 
        "warehouse_id": input.warehouse_id
    })
    if existing:
        await db.stock.update_one(
            {"ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id},
            {"$set": {"current_stock": input.current_stock, "min_stock": input.min_stock, "last_updated": now_iso()}}
        )
    else:
        doc = {
            "id": gen_id(), "ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id,
            "current_stock": input.current_stock, "min_stock": input.min_stock, 
            "last_updated": now_iso()
        }
        await db.stock.insert_one(doc)
    return {"ok": True}

@api.post("/stock/transfer")
async def transfer_stock(input: StockTransferInput, user=Depends(get_current_user)):
    # Check source has enough stock
    source = await db.stock.find_one({
        "ingredient_id": input.ingredient_id, 
        "warehouse_id": input.from_warehouse_id
    })
    if not source or source.get("current_stock", 0) < input.quantity:
        raise HTTPException(400, "Stock insuficiente en almacén origen")
    
    # Decrease from source
    await db.stock.update_one(
        {"ingredient_id": input.ingredient_id, "warehouse_id": input.from_warehouse_id},
        {"$inc": {"current_stock": -input.quantity}, "$set": {"last_updated": now_iso()}}
    )
    # Increase in destination
    await db.stock.update_one(
        {"ingredient_id": input.ingredient_id, "warehouse_id": input.to_warehouse_id},
        {"$inc": {"current_stock": input.quantity}, "$set": {"last_updated": now_iso()}},
        upsert=True
    )
    # Log movements
    transfer_id = gen_id()
    await db.stock_movements.insert_one({
        "id": gen_id(), "ingredient_id": input.ingredient_id, "warehouse_id": input.from_warehouse_id,
        "quantity": -input.quantity, "movement_type": "transfer_out", "reference_id": transfer_id,
        "notes": input.notes, "user_id": user["user_id"], "user_name": user["name"], "created_at": now_iso()
    })
    await db.stock_movements.insert_one({
        "id": gen_id(), "ingredient_id": input.ingredient_id, "warehouse_id": input.to_warehouse_id,
        "quantity": input.quantity, "movement_type": "transfer_in", "reference_id": transfer_id,
        "notes": input.notes, "user_id": user["user_id"], "user_name": user["name"], "created_at": now_iso()
    })
    return {"ok": True, "transfer_id": transfer_id}

@api.post("/stock/waste")
async def register_waste(input: StockMovementInput, user=Depends(get_current_user)):
    # Decrease stock
    await db.stock.update_one(
        {"ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id},
        {"$inc": {"current_stock": -abs(input.quantity)}, "$set": {"last_updated": now_iso()}}
    )
    # Log movement
    await db.stock_movements.insert_one({
        "id": gen_id(), "ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id,
        "quantity": -abs(input.quantity), "movement_type": "waste", "reference_id": input.reference_id,
        "notes": input.notes, "user_id": user["user_id"], "user_name": user["name"], "created_at": now_iso()
    })
    return {"ok": True}

# ─── STOCK MOVEMENTS ───
@api.get("/stock-movements")
async def list_stock_movements(
    warehouse_id: Optional[str] = Query(None),
    ingredient_id: Optional[str] = Query(None),
    movement_type: Optional[str] = Query(None),
    limit: int = Query(100)
):
    query = {}
    if warehouse_id: query["warehouse_id"] = warehouse_id
    if ingredient_id: query["ingredient_id"] = ingredient_id
    if movement_type: query["movement_type"] = movement_type
    return await db.stock_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)

# ─── INVENTORY EXPLOSION SYSTEM ───

async def get_ingredient_stock(ingredient_id: str, warehouse_id: str) -> float:
    """Get current stock of an ingredient in a warehouse"""
    stock_doc = await db.stock.find_one(
        {"ingredient_id": ingredient_id, "warehouse_id": warehouse_id}, 
        {"_id": 0}
    )
    return stock_doc.get("current_stock", 0) if stock_doc else 0

async def get_recipe_for_ingredient(ingredient_id: str) -> dict:
    """Get the recipe that produces a sub-recipe ingredient"""
    ingredient = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
    if not ingredient or not ingredient.get("is_subrecipe"):
        return None
    recipe_id = ingredient.get("recipe_id")
    if recipe_id:
        return await db.recipes.find_one({"id": recipe_id}, {"_id": 0})
    # Also check by produces_ingredient_id
    return await db.recipes.find_one({"produces_ingredient_id": ingredient_id}, {"_id": 0})

async def calculate_recipe_cost(recipe: dict, depth: int = 0) -> float:
    """Recursively calculate the cost of a recipe including sub-recipes"""
    if depth > 10:  # Prevent infinite recursion
        return 0
    
    total_cost = 0
    for ing in recipe.get("ingredients", []):
        ingredient = await db.ingredients.find_one({"id": ing["ingredient_id"]}, {"_id": 0})
        if not ingredient:
            continue
        
        quantity = ing.get("quantity", 0)
        waste = quantity * (ing.get("waste_percentage", 0) / 100)
        effective_quantity = quantity + waste
        
        if ingredient.get("is_subrecipe"):
            # Get sub-recipe and calculate its cost
            sub_recipe = await get_recipe_for_ingredient(ingredient["id"])
            if sub_recipe:
                sub_cost = await calculate_recipe_cost(sub_recipe, depth + 1)
                total_cost += sub_cost * effective_quantity
        else:
            # Base ingredient - use avg_cost
            total_cost += ingredient.get("avg_cost", 0) * effective_quantity
    
    yield_qty = recipe.get("yield_quantity", 1) or 1
    return total_cost / yield_qty

async def update_subrecipe_costs():
    """Update costs for all sub-recipe ingredients based on their component costs"""
    subrecipe_ingredients = await db.ingredients.find({"is_subrecipe": True}, {"_id": 0}).to_list(500)
    
    for ing in subrecipe_ingredients:
        recipe = await get_recipe_for_ingredient(ing["id"])
        if recipe:
            new_cost = await calculate_recipe_cost(recipe)
            if new_cost != ing.get("avg_cost", 0):
                await db.ingredients.update_one(
                    {"id": ing["id"]},
                    {"$set": {"avg_cost": round(new_cost, 2), "cost_updated_at": now_iso()}}
                )

async def explode_and_deduct_recipe(
    recipe: dict,
    warehouse_id: str,
    quantity: float,
    user_id: str,
    user_name: str,
    parent_product_id: str,
    order_id: str,
    depth: int = 0
) -> dict:
    """
    Recursively explode a recipe and deduct ingredients from stock.
    If a sub-recipe doesn't have enough stock, explode its components.
    Returns: {"success": bool, "movements": [...], "errors": [...]}
    """
    if depth > 10:
        return {"success": False, "movements": [], "errors": ["Recursión máxima alcanzada"]}
    
    movements = []
    errors = []
    yield_qty = recipe.get("yield_quantity", 1) or 1
    
    for ing in recipe.get("ingredients", []):
        # Handle both ingredient_id and ingredient_name (legacy)
        ingredient_id = ing.get("ingredient_id")
        ingredient_name = ing.get("ingredient_name", "")
        
        ingredient = None
        if ingredient_id:
            ingredient = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
        
        # If no ingredient found by id, this is a legacy recipe with just names
        if not ingredient:
            # Legacy recipe - skip ingredient tracking but log
            if ingredient_name:
                errors.append(f"Ingrediente '{ingredient_name}' no vinculado al sistema de inventario")
            continue
        
        # Calculate required quantity with waste
        base_quantity = ing.get("quantity", 0)
        waste = base_quantity * (ing.get("waste_percentage", 0) / 100)
        required_per_unit = (base_quantity + waste) / yield_qty
        total_required = required_per_unit * quantity
        
        # Check current stock
        current_stock = await get_ingredient_stock(ingredient["id"], warehouse_id)
        
        if ingredient.get("is_subrecipe"):
            # This is a sub-recipe ingredient
            if current_stock >= total_required:
                # We have enough prepared sub-recipe, just deduct it
                await db.stock.update_one(
                    {"ingredient_id": ingredient["id"], "warehouse_id": warehouse_id},
                    {"$inc": {"current_stock": -total_required}, "$set": {"last_updated": now_iso()}}
                )
                movement = {
                    "id": gen_id(),
                    "ingredient_id": ingredient["id"],
                    "ingredient_name": ingredient["name"],
                    "warehouse_id": warehouse_id,
                    "quantity": -total_required,
                    "movement_type": "sale",
                    "reference_id": order_id,
                    "parent_product_id": parent_product_id,
                    "parent_recipe_id": recipe.get("id", ""),
                    "notes": f"Venta - Sub-receta consumida",
                    "user_id": user_id,
                    "user_name": user_name,
                    "created_at": now_iso()
                }
                await db.stock_movements.insert_one(movement)
                movements.append(movement)
            else:
                # Not enough prepared sub-recipe - EXPLODE IT
                # First use whatever stock we have
                if current_stock > 0:
                    await db.stock.update_one(
                        {"ingredient_id": ingredient["id"], "warehouse_id": warehouse_id},
                        {"$set": {"current_stock": 0, "last_updated": now_iso()}}
                    )
                    movement = {
                        "id": gen_id(),
                        "ingredient_id": ingredient["id"],
                        "ingredient_name": ingredient["name"],
                        "warehouse_id": warehouse_id,
                        "quantity": -current_stock,
                        "movement_type": "sale",
                        "reference_id": order_id,
                        "parent_product_id": parent_product_id,
                        "parent_recipe_id": recipe.get("id", ""),
                        "notes": f"Venta - Sub-receta parcial consumida",
                        "user_id": user_id,
                        "user_name": user_name,
                        "created_at": now_iso()
                    }
                    await db.stock_movements.insert_one(movement)
                    movements.append(movement)
                
                # Now explode the remaining requirement
                remaining = total_required - current_stock
                sub_recipe = await get_recipe_for_ingredient(ingredient["id"])
                
                if sub_recipe:
                    explosion_result = await explode_and_deduct_recipe(
                        sub_recipe, warehouse_id, remaining,
                        user_id, user_name, parent_product_id, order_id, depth + 1
                    )
                    movements.extend(explosion_result["movements"])
                    errors.extend(explosion_result["errors"])
                    
                    # Log the explosion event
                    explosion_movement = {
                        "id": gen_id(),
                        "ingredient_id": ingredient["id"],
                        "ingredient_name": ingredient["name"],
                        "warehouse_id": warehouse_id,
                        "quantity": 0,  # Virtual - represents explosion
                        "movement_type": "explosion",
                        "reference_id": order_id,
                        "parent_product_id": parent_product_id,
                        "parent_recipe_id": recipe.get("id", ""),
                        "notes": f"Explosión de sub-receta: {remaining:.4f} {ingredient.get('unit', 'unidad')}",
                        "user_id": user_id,
                        "user_name": user_name,
                        "created_at": now_iso()
                    }
                    await db.stock_movements.insert_one(explosion_movement)
                    movements.append(explosion_movement)
                else:
                    errors.append(f"Sub-receta sin receta definida: {ingredient['name']}")
        else:
            # Base ingredient - just deduct
            if current_stock < total_required:
                # Not enough stock - log warning but continue
                errors.append(f"Stock insuficiente: {ingredient['name']} (tiene {current_stock:.2f}, necesita {total_required:.2f})")
            
            # Deduct whatever we can (allow negative for tracking)
            await db.stock.update_one(
                {"ingredient_id": ingredient["id"], "warehouse_id": warehouse_id},
                {"$inc": {"current_stock": -total_required}, "$set": {"last_updated": now_iso()}},
                upsert=True
            )
            movement = {
                "id": gen_id(),
                "ingredient_id": ingredient["id"],
                "ingredient_name": ingredient["name"],
                "warehouse_id": warehouse_id,
                "quantity": -total_required,
                "movement_type": "sale",
                "reference_id": order_id,
                "parent_product_id": parent_product_id,
                "parent_recipe_id": recipe.get("id", ""),
                "notes": f"Venta - Ingrediente base",
                "user_id": user_id,
                "user_name": user_name,
                "created_at": now_iso()
            }
            await db.stock_movements.insert_one(movement)
            movements.append(movement)
    
    return {"success": len(errors) == 0, "movements": movements, "errors": errors}

async def check_recipe_availability(recipe: dict, warehouse_id: str, quantity: float, depth: int = 0) -> dict:
    """
    Check if a recipe can be produced with available stock.
    Returns availability status and missing items.
    """
    if depth > 10:
        return {"available": False, "missing": [], "requires_explosion": False}
    
    missing = []
    requires_explosion = False
    yield_qty = recipe.get("yield_quantity", 1) or 1
    
    for ing in recipe.get("ingredients", []):
        # Handle both ingredient_id and ingredient_name (legacy)
        ingredient_id = ing.get("ingredient_id")
        ingredient_name = ing.get("ingredient_name", "")
        
        ingredient = None
        if ingredient_id:
            ingredient = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
        
        # If no ingredient found by id, this is a legacy recipe with just names
        if not ingredient and ingredient_name:
            # Legacy recipe - skip ingredient tracking
            continue
        
        if not ingredient:
            missing.append({"name": ingredient_name or "?", "required": 0, "available": 0, "reason": "no_existe"})
            continue
        
        base_quantity = ing.get("quantity", 0)
        waste = base_quantity * (ing.get("waste_percentage", 0) / 100)
        required_per_unit = (base_quantity + waste) / yield_qty
        total_required = required_per_unit * quantity
        
        current_stock = await get_ingredient_stock(ingredient["id"], warehouse_id)
        
        if ingredient.get("is_subrecipe"):
            if current_stock < total_required:
                # Check if we can explode
                sub_recipe = await get_recipe_for_ingredient(ingredient["id"])
                if sub_recipe:
                    remaining = total_required - current_stock
                    sub_check = await check_recipe_availability(sub_recipe, warehouse_id, remaining, depth + 1)
                    if not sub_check["available"]:
                        missing.extend(sub_check["missing"])
                    requires_explosion = True
                else:
                    missing.append({
                        "name": ingredient["name"],
                        "required": total_required,
                        "available": current_stock,
                        "reason": "subreceta_sin_receta"
                    })
        else:
            if current_stock < total_required:
                missing.append({
                    "name": ingredient["name"],
                    "required": total_required,
                    "available": current_stock,
                    "deficit": total_required - current_stock,
                    "reason": "stock_insuficiente"
                })
    
    return {
        "available": len(missing) == 0,
        "missing": missing,
        "requires_explosion": requires_explosion
    }

@api.post("/inventory/deduct-for-product")
async def deduct_inventory_for_product(input: StockDeductInput, user=Depends(get_current_user)):
    """
    Deduct inventory for a product sale with full explosion logic.
    This is the main entry point for inventory deduction.
    """
    # Get product
    product = await db.products.find_one({"id": input.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Producto no encontrado")
    
    # Get recipe for product
    recipe = await db.recipes.find_one({"product_id": input.product_id}, {"_id": 0})
    if not recipe:
        return {"ok": True, "message": "Producto sin receta - no se descuenta inventario", "movements": []}
    
    # Check availability first
    availability = await check_recipe_availability(recipe, input.warehouse_id, input.quantity)
    
    # Execute deduction with explosion
    result = await explode_and_deduct_recipe(
        recipe=recipe,
        warehouse_id=input.warehouse_id,
        quantity=input.quantity,
        user_id=user["user_id"],
        user_name=user["name"],
        parent_product_id=input.product_id,
        order_id=input.order_id
    )
    
    # Update sub-recipe costs after deduction
    await update_subrecipe_costs()
    
    return {
        "ok": result["success"],
        "product_name": product.get("name", "?"),
        "quantity_deducted": input.quantity,
        "movements_count": len(result["movements"]),
        "movements": [{k: v for k, v in m.items() if k != "_id"} for m in result["movements"]],
        "errors": result["errors"],
        "availability_check": availability
    }

@api.post("/inventory/check-availability")
async def check_inventory_availability(input: StockDeductInput):
    """Check if a product can be produced with available inventory"""
    recipe = await db.recipes.find_one({"product_id": input.product_id}, {"_id": 0})
    if not recipe:
        return {"available": True, "message": "Producto sin receta", "missing": []}
    
    result = await check_recipe_availability(recipe, input.warehouse_id, input.quantity)
    return result

@api.post("/inventory/recalculate-costs")
async def recalculate_all_costs():
    """Recalculate costs for all sub-recipe ingredients"""
    await update_subrecipe_costs()
    
    # Also recalculate recipe costs
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(500)
    updated = []
    for recipe in recipes:
        cost = await calculate_recipe_cost(recipe)
        await db.recipes.update_one(
            {"id": recipe["id"]},
            {"$set": {"calculated_cost": round(cost, 2), "cost_updated_at": now_iso()}}
        )
        updated.append({"recipe_id": recipe["id"], "product_name": recipe.get("product_name", "?"), "cost": round(cost, 2)})
    
    return {"ok": True, "recipes_updated": len(updated), "details": updated}

@api.get("/inventory/recipe-cost/{product_id}")
async def get_recipe_cost(product_id: str):
    """Get the calculated cost of a product's recipe including sub-recipes"""
    recipe = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    if not recipe:
        return {"cost": 0, "message": "Producto sin receta"}
    
    cost = await calculate_recipe_cost(recipe)
    
    # Get detailed breakdown
    breakdown = []
    for ing in recipe.get("ingredients", []):
        ingredient = await db.ingredients.find_one({"id": ing["ingredient_id"]}, {"_id": 0})
        if not ingredient:
            continue
        
        quantity = ing.get("quantity", 0)
        waste = quantity * (ing.get("waste_percentage", 0) / 100)
        effective_quantity = quantity + waste
        
        item = {
            "ingredient_id": ingredient["id"],
            "name": ingredient["name"],
            "quantity": quantity,
            "waste_percentage": ing.get("waste_percentage", 0),
            "effective_quantity": effective_quantity,
            "unit_cost": ingredient.get("avg_cost", 0),
            "total_cost": ingredient.get("avg_cost", 0) * effective_quantity,
            "is_subrecipe": ingredient.get("is_subrecipe", False)
        }
        
        if ingredient.get("is_subrecipe"):
            sub_recipe = await get_recipe_for_ingredient(ingredient["id"])
            if sub_recipe:
                item["sub_cost"] = await calculate_recipe_cost(sub_recipe)
                item["total_cost"] = item["sub_cost"] * effective_quantity
        
        breakdown.append(item)
    
    yield_qty = recipe.get("yield_quantity", 1) or 1
    return {
        "product_id": product_id,
        "product_name": recipe.get("product_name", "?"),
        "total_cost": round(cost, 2),
        "yield_quantity": yield_qty,
        "cost_per_unit": round(cost, 2),
        "breakdown": breakdown
    }

# ─── SUB-RECIPE PRODUCTION ───

class ProductionInput(BaseModel):
    ingredient_id: str  # The sub-recipe ingredient to produce
    warehouse_id: str
    quantity: float  # How many units to produce
    notes: str = ""

@api.get("/inventory/subrecipes")
async def list_subrecipes():
    """List all sub-recipe ingredients that can be produced"""
    subrecipes = await db.ingredients.find({"is_subrecipe": True}, {"_id": 0}).to_list(100)
    result = []
    for sr in subrecipes:
        recipe = await get_recipe_for_ingredient(sr["id"])
        if recipe:
            cost = await calculate_recipe_cost(recipe)
            result.append({
                "ingredient_id": sr["id"],
                "name": sr["name"],
                "unit": sr.get("unit", "unidad"),
                "category": sr.get("category", "general"),
                "avg_cost": sr.get("avg_cost", 0),
                "calculated_cost": round(cost, 2),
                "recipe_id": recipe.get("id"),
                "recipe_yield": recipe.get("yield_quantity", 1),
                "ingredients_count": len(recipe.get("ingredients", []))
            })
    return result

@api.post("/inventory/check-production")
async def check_production_availability(input: ProductionInput):
    """Check if we can produce a sub-recipe with available ingredients"""
    ingredient = await db.ingredients.find_one({"id": input.ingredient_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(404, "Ingrediente no encontrado")
    if not ingredient.get("is_subrecipe"):
        raise HTTPException(400, "Este ingrediente no es una sub-receta")
    
    recipe = await get_recipe_for_ingredient(input.ingredient_id)
    if not recipe:
        raise HTTPException(400, "No hay receta definida para producir este ingrediente")
    
    result = await check_recipe_availability(recipe, input.warehouse_id, input.quantity)
    
    # Calculate production details
    yield_qty = recipe.get("yield_quantity", 1) or 1
    cost = await calculate_recipe_cost(recipe)
    
    return {
        "ingredient_name": ingredient["name"],
        "can_produce": result["available"],
        "quantity_to_produce": input.quantity,
        "unit": ingredient.get("unit", "unidad"),
        "production_cost": round(cost * input.quantity, 2),
        "cost_per_unit": round(cost, 2),
        "missing_ingredients": result["missing"],
        "requires_explosion": result.get("requires_explosion", False)
    }

@api.post("/inventory/produce")
async def produce_subrecipe(input: ProductionInput, user=Depends(get_current_user)):
    """
    Produce a batch of sub-recipe by consuming its ingredients.
    This is the reverse of explosion - we consume base ingredients to create the sub-recipe stock.
    """
    ingredient = await db.ingredients.find_one({"id": input.ingredient_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(404, "Ingrediente no encontrado")
    if not ingredient.get("is_subrecipe"):
        raise HTTPException(400, "Este ingrediente no es una sub-receta")
    
    recipe = await get_recipe_for_ingredient(input.ingredient_id)
    if not recipe:
        raise HTTPException(400, "No hay receta definida para producir este ingrediente")
    
    # Check availability first
    availability = await check_recipe_availability(recipe, input.warehouse_id, input.quantity)
    if not availability["available"] and availability["missing"]:
        return {
            "ok": False,
            "error": "Ingredientes insuficientes",
            "missing": availability["missing"]
        }
    
    movements = []
    errors = []
    yield_qty = recipe.get("yield_quantity", 1) or 1
    production_id = gen_id()
    
    # Deduct ingredients used in production
    for ing in recipe.get("ingredients", []):
        ing_id = ing.get("ingredient_id")
        if not ing_id:
            continue
        
        ing_doc = await db.ingredients.find_one({"id": ing_id}, {"_id": 0})
        if not ing_doc:
            continue
        
        base_quantity = ing.get("quantity", 0)
        waste = base_quantity * (ing.get("waste_percentage", 0) / 100)
        required_per_unit = (base_quantity + waste) / yield_qty
        total_required = required_per_unit * input.quantity
        
        # Deduct from stock
        await db.stock.update_one(
            {"ingredient_id": ing_id, "warehouse_id": input.warehouse_id},
            {"$inc": {"current_stock": -total_required}, "$set": {"last_updated": now_iso()}},
            upsert=True
        )
        
        # Log movement
        movement = {
            "id": gen_id(),
            "ingredient_id": ing_id,
            "ingredient_name": ing_doc["name"],
            "warehouse_id": input.warehouse_id,
            "quantity": -total_required,
            "movement_type": "production_consume",
            "reference_id": production_id,
            "parent_product_id": input.ingredient_id,
            "parent_recipe_id": recipe.get("id", ""),
            "notes": f"Consumido para producir {input.quantity} {ingredient.get('unit', 'unidad')} de {ingredient['name']}",
            "user_id": user["user_id"],
            "user_name": user["name"],
            "created_at": now_iso()
        }
        await db.stock_movements.insert_one(movement)
        movements.append({k: v for k, v in movement.items() if k != "_id"})
    
    # Add the produced sub-recipe to stock
    await db.stock.update_one(
        {"ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id},
        {"$inc": {"current_stock": input.quantity}, "$set": {"last_updated": now_iso()}},
        upsert=True
    )
    
    # Log production output
    production_movement = {
        "id": gen_id(),
        "ingredient_id": input.ingredient_id,
        "ingredient_name": ingredient["name"],
        "warehouse_id": input.warehouse_id,
        "quantity": input.quantity,
        "movement_type": "production_output",
        "reference_id": production_id,
        "parent_product_id": "",
        "parent_recipe_id": recipe.get("id", ""),
        "notes": input.notes or f"Producción de {input.quantity} {ingredient.get('unit', 'unidad')}",
        "user_id": user["user_id"],
        "user_name": user["name"],
        "created_at": now_iso()
    }
    await db.stock_movements.insert_one(production_movement)
    movements.append({k: v for k, v in production_movement.items() if k != "_id"})
    
    # Log production record
    cost = await calculate_recipe_cost(recipe)
    production_record = {
        "id": production_id,
        "ingredient_id": input.ingredient_id,
        "ingredient_name": ingredient["name"],
        "recipe_id": recipe.get("id"),
        "warehouse_id": input.warehouse_id,
        "quantity_produced": input.quantity,
        "unit": ingredient.get("unit", "unidad"),
        "total_cost": round(cost * input.quantity, 2),
        "cost_per_unit": round(cost, 2),
        "ingredients_consumed": len(movements) - 1,
        "notes": input.notes,
        "produced_by": user["name"],
        "produced_at": now_iso()
    }
    await db.production_records.insert_one(production_record)
    
    # Update sub-recipe cost
    await db.ingredients.update_one(
        {"id": input.ingredient_id},
        {"$set": {"avg_cost": round(cost, 2), "cost_updated_at": now_iso()}}
    )
    
    return {
        "ok": True,
        "production_id": production_id,
        "ingredient_name": ingredient["name"],
        "quantity_produced": input.quantity,
        "unit": ingredient.get("unit", "unidad"),
        "total_cost": round(cost * input.quantity, 2),
        "movements_count": len(movements),
        "movements": movements
    }

@api.get("/inventory/production-history")
async def get_production_history(
    ingredient_id: Optional[str] = Query(None),
    warehouse_id: Optional[str] = Query(None),
    limit: int = Query(50)
):
    """Get history of sub-recipe productions"""
    query = {}
    if ingredient_id: query["ingredient_id"] = ingredient_id
    if warehouse_id: query["warehouse_id"] = warehouse_id
    return await db.production_records.find(query, {"_id": 0}).sort("produced_at", -1).to_list(limit)

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
    # Check if has stock
    stock_count = await db.stock.count_documents({"warehouse_id": wid, "current_stock": {"$gt": 0}})
    if stock_count > 0:
        raise HTTPException(400, "No se puede eliminar: el almacén tiene stock")
    await db.warehouses.delete_one({"id": wid})
    return {"ok": True}

# ─── SUPPLIERS ───
@api.get("/suppliers")
async def list_suppliers():
    return await db.suppliers.find({}, {"_id": 0}).to_list(100)

@api.get("/suppliers/{sid}")
async def get_supplier(sid: str):
    sup = await db.suppliers.find_one({"id": sid}, {"_id": 0})
    if not sup:
        raise HTTPException(404, "Proveedor no encontrado")
    return sup

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
    # Check if has purchase orders
    po_count = await db.purchase_orders.count_documents({"supplier_id": sid})
    if po_count > 0:
        # Soft delete
        await db.suppliers.update_one({"id": sid}, {"$set": {"active": False}})
    else:
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
    ingredients = []
    for i in input.ingredients:
        ing_data = i.model_dump()
        ing_data["id"] = gen_id()
        # Get ingredient name if not provided
        if not ing_data.get("ingredient_name"):
            ing = await db.ingredients.find_one({"id": ing_data["ingredient_id"]}, {"_id": 0})
            ing_data["ingredient_name"] = ing["name"] if ing else "?"
        ingredients.append(ing_data)
    
    doc = {
        "id": gen_id(), "product_id": input.product_id, "product_name": input.product_name,
        "ingredients": ingredients, "yield_quantity": input.yield_quantity,
        "notes": input.notes, "created_at": now_iso()
    }
    existing = await db.recipes.find_one({"product_id": input.product_id})
    if existing:
        await db.recipes.update_one(
            {"product_id": input.product_id}, 
            {"$set": {"ingredients": ingredients, "yield_quantity": input.yield_quantity, "notes": input.notes}}
        )
        return await db.recipes.find_one({"product_id": input.product_id}, {"_id": 0})
    await db.recipes.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.delete("/recipes/{rid}")
async def delete_recipe(rid: str):
    await db.recipes.delete_one({"id": rid})
    return {"ok": True}

@api.delete("/recipes/product/{product_id}")
async def delete_recipe_by_product(product_id: str):
    await db.recipes.delete_one({"product_id": product_id})
    return {"ok": True}

# ─── PURCHASE ORDERS ───
@api.get("/purchase-orders")
async def list_purchase_orders(status: Optional[str] = Query(None), supplier_id: Optional[str] = Query(None)):
    query = {}
    if status: query["status"] = status
    if supplier_id: query["supplier_id"] = supplier_id
    return await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

@api.get("/purchase-orders/{po_id}")
async def get_purchase_order(po_id: str):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(404, "Orden no encontrada")
    return po

@api.post("/purchase-orders")
async def create_purchase_order(input: PurchaseOrderInput, user=Depends(get_current_user)):
    supplier = await db.suppliers.find_one({"id": input.supplier_id}, {"_id": 0})
    items = []
    for i in input.items:
        item_data = {
            "id": gen_id(), 
            "ingredient_id": i.ingredient_id, 
            "ingredient_name": i.ingredient_name,
            "quantity": i.quantity, 
            "unit_price": i.unit_price, 
            "received_quantity": 0,
            "actual_unit_price": i.unit_price  # Will be updated on receive
        }
        # Get ingredient name if not provided
        if not item_data["ingredient_name"]:
            ing = await db.ingredients.find_one({"id": i.ingredient_id}, {"_id": 0})
            item_data["ingredient_name"] = ing["name"] if ing else "?"
        items.append(item_data)
    
    total = sum(i.quantity * i.unit_price for i in input.items)
    doc = {
        "id": gen_id(), "supplier_id": input.supplier_id,
        "supplier_name": supplier["name"] if supplier else "?",
        "warehouse_id": input.warehouse_id, "items": items, "total": round(total, 2),
        "notes": input.notes, "expected_date": input.expected_date,
        "status": "draft",  # draft -> pending -> partial -> received
        "created_by": user["name"], "created_at": now_iso(), "received_at": None
    }
    await db.purchase_orders.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, input: dict):
    if "_id" in input: del input["_id"]
    # Recalculate total if items changed
    if "items" in input:
        input["total"] = round(sum(i.get("quantity", 0) * i.get("unit_price", 0) for i in input["items"]), 2)
    await db.purchase_orders.update_one({"id": po_id}, {"$set": input})
    return {"ok": True}

@api.put("/purchase-orders/{po_id}/status")
async def update_po_status(po_id: str, status: str = Query(...)):
    if status not in ["draft", "pending", "partial", "received", "cancelled"]:
        raise HTTPException(400, "Estado inválido")
    await db.purchase_orders.update_one({"id": po_id}, {"$set": {"status": status}})
    return {"ok": True}

@api.post("/purchase-orders/{po_id}/receive")
async def receive_purchase_order(po_id: str, input: ReceivePOInput, user=Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    warehouse_id = input.warehouse_id or po.get("warehouse_id", "")
    
    for recv_item in input.items:
        for po_item in po["items"]:
            if po_item["ingredient_id"] == recv_item.ingredient_id:
                # Update received quantity
                po_item["received_quantity"] = po_item.get("received_quantity", 0) + recv_item.received_quantity
                
                # Update actual unit price if provided (for cost reconciliation)
                if recv_item.actual_unit_price > 0:
                    po_item["actual_unit_price"] = recv_item.actual_unit_price
                
                # Update stock
                await db.stock.update_one(
                    {"ingredient_id": recv_item.ingredient_id, "warehouse_id": warehouse_id},
                    {"$inc": {"current_stock": recv_item.received_quantity}, "$set": {"last_updated": now_iso()}},
                    upsert=True
                )
                
                # Log movement
                await db.stock_movements.insert_one({
                    "id": gen_id(), "ingredient_id": recv_item.ingredient_id, "warehouse_id": warehouse_id,
                    "quantity": recv_item.received_quantity, "movement_type": "purchase",
                    "reference_id": po_id, "notes": f"OC recibida",
                    "user_id": user["user_id"], "user_name": user["name"], "created_at": now_iso()
                })
                
                # Update ingredient avg_cost using weighted average
                if recv_item.actual_unit_price > 0:
                    ing = await db.ingredients.find_one({"id": recv_item.ingredient_id}, {"_id": 0})
                    if ing:
                        old_cost = ing.get("avg_cost", 0)
                        # Get total stock across all warehouses
                        total_stock_docs = await db.stock.find({"ingredient_id": recv_item.ingredient_id}, {"_id": 0}).to_list(50)
                        total_stock = sum(s.get("current_stock", 0) for s in total_stock_docs)
                        old_stock = total_stock - recv_item.received_quantity
                        
                        # Weighted average cost
                        if total_stock > 0:
                            new_avg = ((old_cost * old_stock) + (recv_item.actual_unit_price * recv_item.received_quantity)) / total_stock
                            await db.ingredients.update_one(
                                {"id": recv_item.ingredient_id},
                                {"$set": {"avg_cost": round(new_avg, 2)}}
                            )
                break
    
    # Determine new status
    all_received = all(i["received_quantity"] >= i["quantity"] for i in po["items"])
    partial = any(i["received_quantity"] > 0 for i in po["items"])
    new_status = "received" if all_received else "partial" if partial else po["status"]
    
    # Recalculate total based on actual prices
    actual_total = sum(i.get("received_quantity", 0) * i.get("actual_unit_price", i.get("unit_price", 0)) for i in po["items"])
    
    await db.purchase_orders.update_one({"id": po_id}, {"$set": {
        "items": po["items"], 
        "status": new_status, 
        "actual_total": round(actual_total, 2),
        "received_at": now_iso() if all_received else None,
        "received_by": user["name"] if all_received else None
    }})
    
    # Update sub-recipe costs when ingredient costs change
    await update_subrecipe_costs()
    
    return await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})

@api.delete("/purchase-orders/{po_id}")
async def delete_purchase_order(po_id: str):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if po and po.get("status") not in ["draft", "pending"]:
        raise HTTPException(400, "Solo se pueden eliminar órdenes en borrador o pendientes")
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
    {"value": -5, "label": "UTC-5 (USA Este, Colombia, Perú, Ecuador, Panamá)"},
    {"value": -4, "label": "UTC-4 (República Dominicana, Puerto Rico, Venezuela, Bolivia)"},
    {"value": -3, "label": "UTC-3 (Argentina, Chile, Uruguay, Brasil)"},
    {"value": -6, "label": "UTC-6 (USA Central, México CDMX, Costa Rica, Guatemala)"},
    {"value": -7, "label": "UTC-7 (USA Mountain, Arizona)"},
    {"value": -8, "label": "UTC-8 (USA Pacífico, Los Angeles, Tijuana)"},
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

# ─── INVENTORY SETTINGS ───
@api.get("/inventory/settings")
async def get_inventory_settings():
    """Get inventory configuration"""
    config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
    return config or {
        "id": "inventory_settings",
        "allow_sale_without_stock": False,
        "auto_deduct_on_payment": True,
        "default_warehouse_id": "",
        "show_stock_alerts": True
    }

@api.put("/inventory/settings")
async def update_inventory_settings(input: dict):
    """Update inventory configuration"""
    if "_id" in input: del input["_id"]
    input["id"] = "inventory_settings"
    input["updated_at"] = now_iso()
    await db.system_config.update_one(
        {"id": "inventory_settings"}, 
        {"$set": input}, 
        upsert=True
    )
    return {"ok": True}

@api.get("/inventory/products-stock")
async def get_products_stock_status(warehouse_id: Optional[str] = Query(None)):
    """Get stock status for all products (for POS display)"""
    config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
    allow_negative = config.get("allow_sale_without_stock", False) if config else False
    
    # Get default warehouse if not specified
    if not warehouse_id:
        warehouse_id = config.get("default_warehouse_id", "") if config else ""
        if not warehouse_id:
            wh = await db.warehouses.find_one({}, {"_id": 0})
            warehouse_id = wh["id"] if wh else ""
    
    products = await db.products.find({"active": True}, {"_id": 0}).to_list(500)
    result = []
    
    for product in products:
        recipe = await db.recipes.find_one({"product_id": product["id"]}, {"_id": 0})
        
        stock_status = {
            "product_id": product["id"],
            "name": product.get("name", "?"),
            "has_recipe": recipe is not None,
            "in_stock": True,
            "available_quantity": -1,  # -1 means unlimited (no recipe)
            "is_low_stock": False,
            "needs_reorder": False
        }
        
        if recipe and warehouse_id:
            # Check availability through recipe
            availability = await check_recipe_availability(recipe, warehouse_id, 1)
            stock_status["in_stock"] = availability["available"] or allow_negative
            stock_status["missing_ingredients"] = availability.get("missing", [])
            
            # Calculate how many can be made
            if availability["available"]:
                # Simple heuristic: check each ingredient
                min_available = None
                for ing in recipe.get("ingredients", []):
                    ing_id = ing.get("ingredient_id")
                    if not ing_id:
                        continue
                    ingredient = await db.ingredients.find_one({"id": ing_id}, {"_id": 0})
                    if not ingredient:
                        continue
                    
                    stock_doc = await db.stock.find_one(
                        {"ingredient_id": ing_id, "warehouse_id": warehouse_id},
                        {"_id": 0}
                    )
                    current = stock_doc.get("current_stock", 0) if stock_doc else 0
                    required = ing.get("quantity", 0)
                    if required > 0:
                        can_make = current / required
                        if min_available is None or can_make < min_available:
                            min_available = can_make
                        
                        # Check if needs reorder
                        min_stock = ingredient.get("min_stock", 0)
                        if current <= min_stock:
                            stock_status["needs_reorder"] = True
                            stock_status["is_low_stock"] = True
                
                stock_status["available_quantity"] = int(min_available) if min_available is not None else 0
            else:
                stock_status["available_quantity"] = 0
        
        result.append(stock_status)
    
    return result

@api.get("/inventory/product-stock/{product_id}")
async def get_product_stock_status(product_id: str, warehouse_id: Optional[str] = Query(None)):
    """Get stock status for a specific product"""
    config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
    allow_negative = config.get("allow_sale_without_stock", False) if config else False
    
    if not warehouse_id:
        warehouse_id = config.get("default_warehouse_id", "") if config else ""
        if not warehouse_id:
            wh = await db.warehouses.find_one({}, {"_id": 0})
            warehouse_id = wh["id"] if wh else ""
    
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Producto no encontrado")
    
    recipe = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    
    if not recipe:
        return {
            "product_id": product_id,
            "in_stock": True,
            "can_sell": True,
            "message": "Sin receta - siempre disponible"
        }
    
    if not warehouse_id:
        return {
            "product_id": product_id,
            "in_stock": True,
            "can_sell": allow_negative,
            "message": "Sin almacén configurado"
        }
    
    availability = await check_recipe_availability(recipe, warehouse_id, 1)
    
    return {
        "product_id": product_id,
        "in_stock": availability["available"],
        "can_sell": availability["available"] or allow_negative,
        "missing": availability.get("missing", []),
        "requires_explosion": availability.get("requires_explosion", False)
    }

# ─── REORDER ALERTS ───
@api.get("/inventory/reorder-alerts")
async def get_reorder_alerts():
    """Get products that need to be reordered (stock at or below minimum)"""
    ingredients = await db.ingredients.find({}, {"_id": 0}).to_list(500)
    alerts = []
    
    for ing in ingredients:
        # Get total stock
        stock_docs = await db.stock.find({"ingredient_id": ing["id"]}, {"_id": 0}).to_list(50)
        total_stock = sum(s.get("current_stock", 0) for s in stock_docs)
        min_stock = ing.get("min_stock", 0)
        
        if total_stock <= min_stock:
            alerts.append({
                "ingredient_id": ing["id"],
                "name": ing["name"],
                "unit": ing.get("unit", "unidad"),
                "category": ing.get("category", "general"),
                "current_stock": total_stock,
                "min_stock": min_stock,
                "deficit": min_stock - total_stock,
                "suggested_order": max(min_stock * 2 - total_stock, min_stock),  # Order to reach 2x minimum
                "is_subrecipe": ing.get("is_subrecipe", False),
                "avg_cost": ing.get("avg_cost", 0)
            })
    
    return sorted(alerts, key=lambda x: x["deficit"], reverse=True)

# ─── THEME CONFIG (Glassmorphism) ───
DEFAULT_THEME = {
    "gradientStart": "#0f0f23",
    "gradientMid1": "#1a1a3e",
    "gradientMid2": "#2d1b4e",
    "gradientEnd": "#1e3a5f",
    "accentColor": "#ff6600",
    "glassOpacity": 0.1,
    "glassBlur": 12,
    "orbColor1": "rgba(168, 85, 247, 0.3)",
    "orbColor2": "rgba(59, 130, 246, 0.2)",
    "orbColor3": "rgba(6, 182, 212, 0.2)",
}

@api.get("/theme-config")
async def get_theme_config():
    config = await db.theme_config.find_one({}, {"_id": 0})
    return config or DEFAULT_THEME

@api.put("/theme-config")
async def update_theme_config(input: dict, user=Depends(get_current_user)):
    # Only admin, manager, owner can update theme
    perms = get_permissions(user.get("role", "waiter"), user.get("permissions"))
    is_admin = user.get("role") in ["admin", "manager", "owner", "propietario", "gerente"]
    if not is_admin:
        raise HTTPException(status_code=403, detail="No tienes permiso para cambiar el tema")
    
    if "_id" in input: del input["_id"]
    # Merge with defaults to ensure all keys exist
    theme_data = {**DEFAULT_THEME, **input}
    await db.theme_config.update_one({}, {"$set": theme_data}, upsert=True)
    return {"ok": True}

@api.post("/theme-config/reset")
async def reset_theme_config(user=Depends(get_current_user)):
    # Only admin, manager, owner can reset theme
    is_admin = user.get("role") in ["admin", "manager", "owner", "propietario", "gerente"]
    if not is_admin:
        raise HTTPException(status_code=403, detail="No tienes permiso para restablecer el tema")
    
    await db.theme_config.update_one({}, {"$set": DEFAULT_THEME}, upsert=True)
    return {"ok": True, "theme": DEFAULT_THEME}

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

# ─── LOW STOCK ALERTS ───
@api.get("/inventory/check-alerts")
async def check_low_stock_alerts(send_email: bool = Query(False)):
    """Check for ingredients below minimum stock and optionally send email alert"""
    # Get all ingredients
    ingredients = await db.ingredients.find({}, {"_id": 0}).to_list(500)
    
    low_stock_items = []
    for ing in ingredients:
        # Get total stock across all warehouses
        stock_docs = await db.stock.find({"ingredient_id": ing["id"]}, {"_id": 0}).to_list(50)
        total_stock = sum(s.get("current_stock", 0) for s in stock_docs)
        min_stock = ing.get("min_stock", 0)
        
        if total_stock <= min_stock:
            low_stock_items.append({
                "ingredient_id": ing["id"],
                "name": ing["name"],
                "unit": ing.get("unit", "unidad"),
                "category": ing.get("category", "general"),
                "current_stock": total_stock,
                "min_stock": min_stock,
                "deficit": min_stock - total_stock
            })
    
    result = {
        "alert_count": len(low_stock_items),
        "items": low_stock_items,
        "checked_at": now_iso()
    }
    
    if send_email and low_stock_items:
        # Get system config for alert emails
        config = await db.system_config.find_one({"id": "stock_alerts"}, {"_id": 0})
        alert_emails = config.get("emails", []) if config else []
        
        if alert_emails and resend.api_key:
            # Build HTML email
            items_html = ""
            for item in low_stock_items:
                color = "#dc2626" if item["current_stock"] == 0 else "#f59e0b"
                items_html += f"""<tr>
                    <td style='padding:8px;border-bottom:1px solid #333;'>{item['name']}</td>
                    <td style='padding:8px;border-bottom:1px solid #333;'>{item['category']}</td>
                    <td style='padding:8px;border-bottom:1px solid #333;text-align:center;color:{color};font-weight:bold;'>{item['current_stock']:.2f} {item['unit']}</td>
                    <td style='padding:8px;border-bottom:1px solid #333;text-align:center;'>{item['min_stock']:.2f} {item['unit']}</td>
                </tr>"""
            
            html = f"""
            <div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#1a1a2e;color:#eee;padding:20px;border-radius:10px;'>
                <div style='border-bottom:2px solid #FF6600;padding-bottom:15px;margin-bottom:20px;'>
                    <h2 style='color:#FF6600;margin:0;'>⚠️ Alerta de Stock Bajo</h2>
                    <p style='color:#888;margin:5px 0 0;font-size:14px;'>Mesa POS RD - Sistema de Inventario</p>
                </div>
                <p style='margin-bottom:15px;'>Se detectaron <strong style='color:#FF6600;'>{len(low_stock_items)}</strong> insumos por debajo del stock mínimo:</p>
                <table style='width:100%;border-collapse:collapse;background:#252542;border-radius:8px;overflow:hidden;'>
                    <thead>
                        <tr style='background:#FF6600;color:white;'>
                            <th style='padding:10px;text-align:left;'>Insumo</th>
                            <th style='padding:10px;text-align:left;'>Categoría</th>
                            <th style='padding:10px;text-align:center;'>Stock Actual</th>
                            <th style='padding:10px;text-align:center;'>Stock Mínimo</th>
                        </tr>
                    </thead>
                    <tbody>{items_html}</tbody>
                </table>
                <div style='margin-top:20px;padding:15px;background:#252542;border-radius:8px;border-left:4px solid #FF6600;'>
                    <p style='margin:0;font-size:14px;'><strong>Acción recomendada:</strong> Crear una orden de compra para reponer estos insumos.</p>
                </div>
                <p style='margin-top:20px;font-size:12px;color:#666;text-align:center;'>
                    Generado automáticamente el {now_iso()[:19].replace('T', ' ')}
                </p>
            </div>
            """
            
            try:
                for email in alert_emails:
                    params = {
                        "from": SENDER_EMAIL, 
                        "to": [email], 
                        "subject": f"⚠️ Alerta de Stock Bajo - {len(low_stock_items)} items", 
                        "html": html
                    }
                    await asyncio.to_thread(resend.Emails.send, params)
                
                result["email_sent"] = True
                result["sent_to"] = alert_emails
                
                # Log the alert
                await db.stock_alert_logs.insert_one({
                    "id": gen_id(),
                    "item_count": len(low_stock_items),
                    "emails_sent": alert_emails,
                    "sent_at": now_iso()
                })
            except Exception as e:
                result["email_error"] = str(e)
        else:
            result["email_sent"] = False
            result["reason"] = "No hay emails configurados o API key no disponible"
    
    return result

@api.get("/inventory/alert-config")
async def get_alert_config():
    """Get stock alert configuration"""
    config = await db.system_config.find_one({"id": "stock_alerts"}, {"_id": 0})
    return config or {"id": "stock_alerts", "enabled": False, "emails": [], "frequency": "daily", "schedule_time": "08:00"}

@api.put("/inventory/alert-config")
async def update_alert_config(input: dict):
    """Update stock alert configuration"""
    if "_id" in input: del input["_id"]
    input["id"] = "stock_alerts"
    input["updated_at"] = now_iso()
    await db.system_config.update_one(
        {"id": "stock_alerts"}, 
        {"$set": input}, 
        upsert=True
    )
    # Update scheduler
    await update_scheduler_from_config()
    return {"ok": True}

@api.get("/inventory/alert-logs")
async def get_alert_logs(limit: int = Query(20)):
    """Get history of sent alerts"""
    return await db.stock_alert_logs.find({}, {"_id": 0}).sort("sent_at", -1).to_list(limit)

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
        {"id":gen_id(),"name":"Error de digitacion","return_to_inventory":True,"requires_manager_auth":False,"active":True},
        {"id":gen_id(),"name":"Plato no preparado","return_to_inventory":True,"requires_manager_auth":False,"active":True},
        {"id":gen_id(),"name":"Plato mal preparado","return_to_inventory":False,"requires_manager_auth":True,"active":True},
        {"id":gen_id(),"name":"Cliente se fue","return_to_inventory":False,"requires_manager_auth":True,"active":True},
        {"id":gen_id(),"name":"Botella/bebida abierta","return_to_inventory":False,"requires_manager_auth":True,"active":True},
        {"id":gen_id(),"name":"Comida rechazada","return_to_inventory":False,"requires_manager_auth":True,"active":True},
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

# ─── SCHEDULED STOCK ALERT JOB ───
async def scheduled_stock_alert_job():
    """Background job to check and send stock alerts"""
    try:
        # Get config
        config = await db.system_config.find_one({"id": "stock_alerts"}, {"_id": 0})
        if not config or not config.get("enabled"):
            return
        
        alert_emails = config.get("emails", [])
        if not alert_emails or not resend.api_key:
            return
        
        # Get all ingredients and check stock
        ingredients = await db.ingredients.find({}, {"_id": 0}).to_list(500)
        
        low_stock_items = []
        for ing in ingredients:
            stock_docs = await db.stock.find({"ingredient_id": ing["id"]}, {"_id": 0}).to_list(50)
            total_stock = sum(s.get("current_stock", 0) for s in stock_docs)
            min_stock = ing.get("min_stock", 0)
            
            if total_stock <= min_stock:
                low_stock_items.append({
                    "ingredient_id": ing["id"],
                    "name": ing["name"],
                    "unit": ing.get("unit", "unidad"),
                    "category": ing.get("category", "general"),
                    "current_stock": total_stock,
                    "min_stock": min_stock,
                    "deficit": min_stock - total_stock
                })
        
        if not low_stock_items:
            return  # Nothing to alert
        
        # Build HTML email
        items_html = ""
        for item in low_stock_items:
            color = "#dc2626" if item["current_stock"] == 0 else "#f59e0b"
            items_html += f"""<tr>
                <td style='padding:8px;border-bottom:1px solid #333;'>{item['name']}</td>
                <td style='padding:8px;border-bottom:1px solid #333;'>{item['category']}</td>
                <td style='padding:8px;border-bottom:1px solid #333;text-align:center;color:{color};font-weight:bold;'>{item['current_stock']:.2f} {item['unit']}</td>
                <td style='padding:8px;border-bottom:1px solid #333;text-align:center;'>{item['min_stock']:.2f} {item['unit']}</td>
            </tr>"""
        
        html = f"""
        <div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#1a1a2e;color:#eee;padding:20px;border-radius:10px;'>
            <div style='border-bottom:2px solid #FF6600;padding-bottom:15px;margin-bottom:20px;'>
                <h2 style='color:#FF6600;margin:0;'>⚠️ Alerta Programada de Stock Bajo</h2>
                <p style='color:#888;margin:5px 0 0;font-size:14px;'>Mesa POS RD - Reporte Automático</p>
            </div>
            <p style='margin-bottom:15px;'>Se detectaron <strong style='color:#FF6600;'>{len(low_stock_items)}</strong> insumos por debajo del stock mínimo:</p>
            <table style='width:100%;border-collapse:collapse;background:#252542;border-radius:8px;overflow:hidden;'>
                <thead>
                    <tr style='background:#FF6600;color:white;'>
                        <th style='padding:10px;text-align:left;'>Insumo</th>
                        <th style='padding:10px;text-align:left;'>Categoría</th>
                        <th style='padding:10px;text-align:center;'>Stock Actual</th>
                        <th style='padding:10px;text-align:center;'>Stock Mínimo</th>
                    </tr>
                </thead>
                <tbody>{items_html}</tbody>
            </table>
            <div style='margin-top:20px;padding:15px;background:#252542;border-radius:8px;border-left:4px solid #FF6600;'>
                <p style='margin:0;font-size:14px;'><strong>Acción recomendada:</strong> Crear una orden de compra para reponer estos insumos.</p>
            </div>
            <p style='margin-top:20px;font-size:12px;color:#666;text-align:center;'>
                Reporte automático generado el {now_iso()[:19].replace('T', ' ')}
            </p>
        </div>
        """
        
        for email in alert_emails:
            params = {
                "from": SENDER_EMAIL, 
                "to": [email], 
                "subject": f"⚠️ Alerta Programada: {len(low_stock_items)} items con stock bajo", 
                "html": html
            }
            await asyncio.to_thread(resend.Emails.send, params)
        
        # Log
        await db.stock_alert_logs.insert_one({
            "id": gen_id(),
            "type": "scheduled",
            "item_count": len(low_stock_items),
            "emails_sent": alert_emails,
            "sent_at": now_iso()
        })
        
        logger.info(f"Scheduled stock alert sent: {len(low_stock_items)} items to {len(alert_emails)} recipients")
        
    except Exception as e:
        logger.error(f"Scheduled stock alert error: {e}")

def setup_stock_alert_schedule():
    """Setup or update the scheduled job based on config"""
    # Remove existing job if any
    if scheduler.get_job("stock_alert"):
        scheduler.remove_job("stock_alert")

async def update_scheduler_from_config():
    """Read config from DB and update scheduler"""
    config = await db.system_config.find_one({"id": "stock_alerts"}, {"_id": 0})
    if not config or not config.get("enabled"):
        if scheduler.get_job("stock_alert"):
            scheduler.remove_job("stock_alert")
        return
    
    schedule_time = config.get("schedule_time", "08:00")
    try:
        hour, minute = map(int, schedule_time.split(":"))
    except:
        hour, minute = 8, 0
    
    # Remove old job
    if scheduler.get_job("stock_alert"):
        scheduler.remove_job("stock_alert")
    
    # Add new job
    scheduler.add_job(
        scheduled_stock_alert_job,
        CronTrigger(hour=hour, minute=minute),
        id="stock_alert",
        replace_existing=True
    )
    logger.info(f"Stock alert scheduled for {hour:02d}:{minute:02d}")

@api.post("/inventory/alert-config/schedule")
async def update_alert_schedule():
    """Update scheduler after config change"""
    await update_scheduler_from_config()
    return {"ok": True, "message": "Scheduler actualizado"}

@api.get("/inventory/scheduler-status")
async def get_scheduler_status():
    """Get current scheduler status"""
    job = scheduler.get_job("stock_alert")
    if job:
        next_run = job.next_run_time.isoformat() if job.next_run_time else None
        return {
            "active": True,
            "job_id": job.id,
            "next_run": next_run
        }
    return {"active": False, "job_id": None, "next_run": None}

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

@app.on_event("startup")
async def startup_event():
    """Initialize scheduler on app startup"""
    scheduler.start()
    await update_scheduler_from_config()
    logger.info("Scheduler started and configured")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()
