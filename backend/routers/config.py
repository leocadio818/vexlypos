# Config Router - System Configuration, Shifts, Categories, Products, Modifiers
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid

router = APIRouter(tags=["config"])

# Database reference
db = None

def set_db(database):
    global db
    db = database

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# Import auth dependency
from routers.auth import get_current_user

# ─── PYDANTIC MODELS ───
class CategoryInput(BaseModel):
    name: str
    color: str = "#f97316"
    icon: str = ""

class ProductInput(BaseModel):
    name: str
    category_id: str
    price: float
    active: bool = True
    icon: str = ""
    description: str = ""

class ModifierGroupInput(BaseModel):
    name: str
    min_selection: int = 0
    max_selection: int = 1

class ModifierInput(BaseModel):
    name: str
    price: float = 0

class CancellationReasonInput(BaseModel):
    name: str
    requires_manager_auth: bool = False
    description: str = ""

class ShiftOpenInput(BaseModel):
    station: str = "main"
    opening_amount: float = 0

class ShiftCloseInput(BaseModel):
    closing_amount: float = 0

class ReservationInput(BaseModel):
    customer_name: str
    phone: str = ""
    party_size: int = 2
    reservation_date: str
    reservation_time: str
    table_id: str = ""
    table_ids: list = []
    area_id: str = ""
    notes: str = ""
    activation_minutes: int = 60
    tolerance_minutes: int = 15

# ─── TIMEZONE OPTIONS ───
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

# ─── SYSTEM CONFIG ───
@router.get("/system/config")
async def get_system_config():
    config = await db.system_config.find_one({}, {"_id": 0})
    if not config:
        config = {"timezone_offset": -4, "restaurant_name": "Mi Restaurante", "currency": "RD$", "rnc": "000-000000-0"}
    # Mask sensitive e-CF credentials before returning
    for key in ["ecf_alanube_token", "ecf_tf_password"]:
        val = config.get(key)
        if val and len(val) > 4:
            config[key] = "*" * (len(val) - 4) + val[-4:]
    return config

@router.get("/system/branding")
async def get_system_branding():
    """Public endpoint for login screen - returns only name and logo"""
    config = await db.system_config.find_one({}, {"_id": 0, "restaurant_name": 1, "logo_url": 1})
    return config or {"restaurant_name": "Mi Restaurante"}

@router.put("/system/config")
async def update_system_config(input: dict):
    if "_id" in input:
        del input["_id"]
    # Don't save masked credential values (starts with ****)
    for key in ["ecf_alanube_token", "ecf_tf_password"]:
        val = input.get(key, "")
        if isinstance(val, str) and val.startswith("****"):
            del input[key]
    await db.system_config.update_one({}, {"$set": input}, upsert=True)
    return {"ok": True}

@router.put("/system/ecf-credentials")
async def update_ecf_credentials(input: dict):
    """Save e-CF provider credentials — only Admin/IT can access"""
    provider = input.get("provider")
    if provider not in ("alanube", "thefactory"):
        raise HTTPException(400, "Proveedor inválido")

    update = {}
    if provider == "alanube":
        if input.get("token"):
            update["ecf_alanube_token"] = input["token"]
        if input.get("rnc"):
            update["ecf_alanube_rnc"] = input["rnc"]
        if "environment" in input:
            update["ecf_alanube_env"] = input["environment"]
    else:
        if input.get("user"):
            update["ecf_tf_user"] = input["user"]
        if input.get("password"):
            update["ecf_tf_password"] = input["password"]
        if input.get("rnc"):
            update["ecf_tf_rnc"] = input["rnc"]
        if input.get("company_name"):
            update["ecf_tf_company"] = input["company_name"]
        if "environment" in input:
            update["ecf_tf_env"] = input["environment"]

    if update:
        await db.system_config.update_one({}, {"$set": update}, upsert=True)
        # Invalidate The Factory token cache on credential change
        if provider == "thefactory":
            from routers.thefactory import invalidate_token
            invalidate_token()

    return {"ok": True, "message": f"Credenciales de {provider} guardadas"}

@router.get("/system/ecf-credentials/{provider}")
async def get_ecf_credentials(provider: str):
    """Get e-CF credentials (masked) for display in settings"""
    if provider not in ("alanube", "thefactory"):
        raise HTTPException(400, "Proveedor inválido")

    config = await db.system_config.find_one({}, {"_id": 0})
    if not config:
        config = {}

    def mask(val):
        if not val or len(val) <= 4:
            return val or ""
        return "*" * (len(val) - 4) + val[-4:]

    if provider == "alanube":
        return {
            "token": mask(config.get("ecf_alanube_token", "")),
            "rnc": config.get("ecf_alanube_rnc", ""),
            "environment": config.get("ecf_alanube_env", "sandbox"),
            "has_token": bool(config.get("ecf_alanube_token")),
        }
    else:
        return {
            "user": config.get("ecf_tf_user", ""),
            "password": mask(config.get("ecf_tf_password", "")),
            "rnc": config.get("ecf_tf_rnc", ""),
            "company_name": config.get("ecf_tf_company", ""),
            "environment": config.get("ecf_tf_env", "sandbox"),
            "has_credentials": bool(config.get("ecf_tf_user") and config.get("ecf_tf_password")),
        }


# ─── THE FACTORY NCF SYNC ───
@router.post("/system/ecf/sync-ncf-counters")
async def sync_ncf_counters_endpoint():
    """
    Synchronize NCF counters with The Factory series.
    Use this when you get error codes 111 (NCF out of range) or 145 (invalid expiration date).
    """
    from routers.thefactory import sync_ncf_counters
    result = await sync_ncf_counters()
    return {"ok": len(result["errors"]) == 0, **result}

@router.get("/system/ecf/series-info")
async def get_series_info_endpoint():
    """
    Get detailed NCF series information for diagnostics.
    Shows local vs The Factory counter positions.
    """
    from routers.thefactory import get_series_info
    return await get_series_info()


@router.get("/system/timezones")
async def get_timezone_options():
    return TIMEZONE_OPTIONS

# ─── INVENTORY SETTINGS ───
@router.get("/inventory/settings")
async def get_inventory_settings():
    config = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
    return config or {
        "id": "inventory_settings",
        "allow_sale_without_stock": False,
        "auto_deduct_on_payment": True,
        "default_warehouse_id": "",
        "show_stock_alerts": True
    }

@router.put("/inventory/settings")
async def update_inventory_settings(input: dict):
    if "_id" in input: del input["_id"]
    input["id"] = "inventory_settings"
    input["updated_at"] = now_iso()
    await db.system_config.update_one(
        {"id": "inventory_settings"}, 
        {"$set": input}, 
        upsert=True
    )
    return {"ok": True}

@router.get("/inventory/products-stock")
async def get_products_stock_status(warehouse_id: Optional[str] = Query(None)):
    """
    Get stock status for all products (for OrderScreen stock validation).
    Returns list of products with their stock availability based on recipes.
    """
    products = await db.products.find({"active": True}, {"_id": 0}).to_list(500)
    settings = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
    allow_sale_without_stock = settings.get("allow_sale_without_stock", True) if settings else True
    
    result = []
    for product in products:
        product_id = product.get("id")
        recipe = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
        
        # If no recipe, assume always in stock
        if not recipe:
            result.append({
                "product_id": product_id,
                "product_name": product.get("name", ""),
                "in_stock": True,
                "available_quantity": 999,
                "is_low_stock": False,
                "has_recipe": False
            })
            continue
        
        # Check if all ingredients are in stock
        min_available = 999
        is_available = True
        
        for ing in recipe.get("ingredients", []):
            ing_id = ing.get("ingredient_id")
            required_qty = ing.get("quantity", 0)
            
            # Get stock for this ingredient
            stock_query = {"ingredient_id": ing_id}
            if warehouse_id:
                stock_query["warehouse_id"] = warehouse_id
            
            stock_docs = await db.stock.find(stock_query, {"_id": 0}).to_list(50)
            total_stock = sum(s.get("current_stock", 0) for s in stock_docs)
            
            if required_qty > 0:
                available_servings = int(total_stock / required_qty)
                min_available = min(min_available, available_servings)
                if total_stock < required_qty:
                    is_available = False
        
        result.append({
            "product_id": product_id,
            "product_name": product.get("name", ""),
            "in_stock": is_available or allow_sale_without_stock,
            "available_quantity": min_available if min_available < 999 else 0,
            "is_low_stock": min_available < 5 and min_available > 0,
            "has_recipe": True
        })
    
    return result

@router.get("/inventory/product-stock/{product_id}")
async def get_single_product_stock_status(product_id: str, warehouse_id: Optional[str] = Query(None)):
    """Get stock status for a single product"""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Producto no encontrado")
    
    recipe = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    settings = await db.system_config.find_one({"id": "inventory_settings"}, {"_id": 0})
    allow_sale_without_stock = settings.get("allow_sale_without_stock", True) if settings else True
    
    if not recipe:
        return {
            "product_id": product_id,
            "product_name": product.get("name", ""),
            "in_stock": True,
            "available_quantity": 999,
            "is_low_stock": False,
            "has_recipe": False
        }
    
    # Check if all ingredients are in stock
    min_available = 999
    is_available = True
    
    for ing in recipe.get("ingredients", []):
        ing_id = ing.get("ingredient_id")
        required_qty = ing.get("quantity", 0)
        
        stock_query = {"ingredient_id": ing_id}
        if warehouse_id:
            stock_query["warehouse_id"] = warehouse_id
        
        stock_docs = await db.stock.find(stock_query, {"_id": 0}).to_list(50)
        total_stock = sum(s.get("current_stock", 0) for s in stock_docs)
        
        if required_qty > 0:
            available_servings = int(total_stock / required_qty)
            min_available = min(min_available, available_servings)
            if total_stock < required_qty:
                is_available = False
    
    return {
        "product_id": product_id,
        "product_name": product.get("name", ""),
        "in_stock": is_available or allow_sale_without_stock,
        "available_quantity": min_available if min_available < 999 else 0,
        "is_low_stock": min_available < 5 and min_available > 0,
        "has_recipe": True
    }

# ─── CATEGORIES ───
@router.get("/categories")
async def list_categories():
    return await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(50)

@router.post("/categories")
async def create_category(input: CategoryInput):
    count = await db.categories.count_documents({})
    doc = {"id": gen_id(), "name": input.name, "color": input.color, "icon": input.icon, "order": count}
    await db.categories.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/categories/{cat_id}")
async def update_category(cat_id: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.categories.update_one({"id": cat_id}, {"$set": input})
    return {"ok": True}

@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str):
    await db.categories.delete_one({"id": cat_id})
    return {"ok": True}

# ─── PRODUCTS ───
@router.get("/products")
async def list_products(category_id: Optional[str] = Query(None), include_inactive: bool = Query(False)):
    query = {}
    if category_id:
        query["category_id"] = category_id
    if not include_inactive:
        query["active"] = True
    return await db.products.find(query, {"_id": 0}).to_list(500)

@router.get("/products/{product_id}")
async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product

@router.post("/products")
async def create_product(input: ProductInput):
    doc = {
        "id": gen_id(), "name": input.name, "category_id": input.category_id,
        "price": input.price, "active": input.active, "icon": input.icon,
        "description": input.description, "created_at": now_iso()
    }
    await db.products.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/products/{product_id}")
async def update_product(product_id: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.products.update_one({"id": product_id}, {"$set": input})
    return {"ok": True}

@router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    await db.products.delete_one({"id": product_id})
    return {"ok": True}

# ─── MODIFIER GROUPS ───
@router.get("/modifier-groups")
async def list_modifier_groups():
    return await db.modifier_groups.find({}, {"_id": 0}).to_list(100)

@router.post("/modifier-groups")
async def create_modifier_group(input: ModifierGroupInput):
    doc = {"id": gen_id(), "name": input.name, "min_selection": input.min_selection, "max_selection": input.max_selection}
    await db.modifier_groups.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/modifier-groups/{gid}")
async def update_modifier_group(gid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.modifier_groups.update_one({"id": gid}, {"$set": input})
    return {"ok": True}

@router.delete("/modifier-groups/{gid}")
async def delete_modifier_group(gid: str):
    await db.modifier_groups.delete_one({"id": gid})
    await db.modifiers.delete_many({"group_id": gid})
    return {"ok": True}

# ─── MODIFIERS ───
@router.get("/modifiers")
async def list_modifiers(group_id: Optional[str] = Query(None)):
    query = {"group_id": group_id} if group_id else {}
    return await db.modifiers.find(query, {"_id": 0}).to_list(200)

@router.post("/modifiers")
async def create_modifier(input: dict):
    doc = {"id": gen_id(), "group_id": input.get("group_id", ""), "name": input.get("name", ""), "price": input.get("price", 0)}
    await db.modifiers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/modifiers/{mid}")
async def update_modifier(mid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.modifiers.update_one({"id": mid}, {"$set": input})
    return {"ok": True}

@router.delete("/modifiers/{mid}")
async def delete_modifier(mid: str):
    await db.modifiers.delete_one({"id": mid})
    return {"ok": True}

# ─── CANCELLATION REASONS ───
@router.get("/cancellation-reasons")
async def list_cancellation_reasons():
    return await db.cancellation_reasons.find({}, {"_id": 0}).to_list(50)

@router.post("/cancellation-reasons")
async def create_cancellation_reason(input: CancellationReasonInput):
    doc = {
        "id": gen_id(), 
        "name": input.name, 
        "requires_manager_auth": input.requires_manager_auth,
        "description": input.description,
        "active": True
    }
    await db.cancellation_reasons.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/cancellation-reasons/{rid}")
async def update_cancellation_reason(rid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.cancellation_reasons.update_one({"id": rid}, {"$set": input})
    return {"ok": True}

@router.delete("/cancellation-reasons/{rid}")
async def delete_cancellation_reason(rid: str):
    await db.cancellation_reasons.update_one({"id": rid}, {"$set": {"active": False}})
    return {"ok": True}

# ─── SHIFTS ───
@router.get("/shifts")
async def list_shifts(status: Optional[str] = Query(None), user_id: Optional[str] = Query(None)):
    query = {}
    if status:
        query["status"] = status
    if user_id:
        query["user_id"] = user_id
    return await db.shifts.find(query, {"_id": 0}).sort("opened_at", -1).to_list(100)

@router.get("/shifts/current")
async def get_current_shift(user=Depends(get_current_user)):
    shift = await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})
    return shift or {}

@router.post("/shifts/open")
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

@router.put("/shifts/{shift_id}/close")
async def close_shift(shift_id: str, input: ShiftCloseInput):
    await db.shifts.update_one({"id": shift_id}, {"$set": {
        "closing_amount": input.closing_amount, "closed_at": now_iso(), "status": "closed"
    }})
    return await db.shifts.find_one({"id": shift_id}, {"_id": 0})

# ─── RESERVATIONS ───
@router.get("/reservations")
async def list_reservations(date: Optional[str] = Query(None), status: Optional[str] = Query(None)):
    query = {}
    if date:
        query["reservation_date"] = date
    if status:
        query["status"] = status
    return await db.reservations.find(query, {"_id": 0}).sort("reservation_date", 1).to_list(200)

@router.post("/reservations")
async def create_reservation(input: ReservationInput):
    table_ids = input.table_ids if hasattr(input, 'table_ids') and input.table_ids else []
    if input.table_id and input.table_id not in table_ids:
        table_ids.append(input.table_id)
    
    # Resolve table numbers
    table_numbers = []
    for tid in table_ids:
        t = await db.tables.find_one({"id": tid}, {"_id": 0, "number": 1})
        if t:
            table_numbers.append(t["number"])
    
    doc = {
        "id": gen_id(),
        "customer_name": input.customer_name,
        "phone": input.phone,
        "party_size": input.party_size,
        "reservation_date": input.reservation_date,
        "reservation_time": input.reservation_time,
        "table_ids": table_ids,
        "table_numbers": table_numbers,
        "area_id": input.area_id if hasattr(input, 'area_id') else "",
        "notes": input.notes,
        "status": "confirmed",
        "activation_minutes": input.activation_minutes if hasattr(input, 'activation_minutes') else 60,
        "tolerance_minutes": input.tolerance_minutes if hasattr(input, 'tolerance_minutes') else 15,
        "created_at": now_iso()
    }
    await db.reservations.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.delete("/reservations/{rid}")
async def delete_reservation(rid: str):
    await db.reservations.delete_one({"id": rid})
    return {"ok": True}

# ─── THEME CONFIG ───
@router.get("/theme")
async def get_theme():
    theme = await db.theme_config.find_one({}, {"_id": 0})
    return theme or {
        "primary_color": "#f97316",
        "background_color": "#0f172a",
        "card_color": "#1e293b",
        "text_color": "#f8fafc"
    }

@router.put("/theme")
async def update_theme(input: dict):
    if "_id" in input: del input["_id"]
    await db.theme_config.update_one({}, {"$set": input}, upsert=True)
    return {"ok": True}

# ─── THEME CONFIG (Frontend compatible alias) ───
# Frontend ThemeContext.js calls /api/theme-config but backend had /api/theme
@router.get("/theme-config")
async def get_theme_config():
    """Alias for /theme - Frontend compatible endpoint"""
    theme = await db.theme_config.find_one({}, {"_id": 0})
    return theme or {
        "gradientStart": "#0f0f23",
        "gradientMid1": "#1a1a3e",
        "gradientMid2": "#2d1b4e",
        "gradientEnd": "#1e3a5f",
        "accentColor": "#ff6600",
        "glassOpacity": 0.1,
        "glassBlur": 12,
        "orbColor1": "rgba(168, 85, 247, 0.3)",
        "orbColor2": "rgba(59, 130, 246, 0.2)",
        "orbColor3": "rgba(6, 182, 212, 0.2)"
    }

@router.put("/theme-config")
async def update_theme_config(input: dict):
    """Alias for /theme - Frontend compatible endpoint"""
    if "_id" in input: del input["_id"]
    await db.theme_config.update_one({}, {"$set": input}, upsert=True)
    return {"ok": True}
