# Config Router - System Configuration, Shifts, Categories, Products, Modifiers
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
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
    prefix: Optional[str] = ""
    selection_type: Optional[str] = "optional"  # "required" | "optional" | "unlimited"
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True
    applies_to_product_ids: Optional[List[str]] = None
    applies_to_category_ids: Optional[List[str]] = None

class ModifierInput(BaseModel):
    name: str
    price: float = 0
    group_id: Optional[str] = ""
    mode: Optional[str] = "text"  # "text" | "product"
    product_id: Optional[str] = None
    price_source: Optional[str] = "custom"  # "price_a" | "price_b" | "price_c" | "included" | "custom"
    custom_price: Optional[float] = None
    is_default: Optional[bool] = False
    is_active: Optional[bool] = True
    sort_order: Optional[int] = 0
    max_qty: Optional[int] = 1

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
        
        # Check simple inventory first (mutually exclusive with recipes)
        if product.get("simple_inventory_enabled"):
            qty = product.get("simple_inventory_qty", 0)
            alert_qty = product.get("simple_inventory_alert_qty", 3)
            result.append({
                "product_id": product_id,
                "product_name": product.get("name", ""),
                "in_stock": qty > 0,
                "available_quantity": qty,
                "is_low_stock": 0 < qty <= alert_qty,
                "has_recipe": False,
                "simple_inventory": True,
                "simple_inventory_alert_qty": alert_qty,
            })
            continue
        
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

# ─── PRODUCT BULK IMPORT (must be before /products/{product_id}) ───

@router.get("/products/import-template")
async def download_import_template():
    """Download a CSV template for bulk product import"""
    import csv, io
    from fastapi.responses import StreamingResponse
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["nombre", "precio", "categoria", "descripcion", "codigo_barras", "disponible"])
    writer.writerow(["Hamburguesa Clasica", "350", "Comida", "Con lechuga y tomate", "7501234567890", "TRUE"])
    writer.writerow(["Coca Cola 12oz", "100", "Bebidas", "", "", "TRUE"])
    writer.writerow(["Papas Fritas", "150", "Acompanantes", "Porcion grande", "", "TRUE"])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=plantilla_productos.csv"}
    )

@router.post("/products/import-bulk")
async def import_products_bulk(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Bulk import products from CSV or XLSX file."""
    from routers.auth import get_permissions
    import pandas as pd
    import io as sio

    user_perms = get_permissions(user.get("role", "waiter"), user.get("permissions", {}))
    if user.get("role") != "admin" and not user_perms.get("config_productos"):
        raise HTTPException(status_code=403, detail="No tienes permiso para importar productos")

    filename = (file.filename or "").lower()
    if not filename.endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Formato no soportado. Use CSV o XLSX.")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Archivo demasiado grande (max 5MB)")

    try:
        if filename.endswith(".csv"):
            for enc in ["utf-8", "latin-1", "cp1252"]:
                try:
                    df = pd.read_csv(sio.BytesIO(content), encoding=enc, dtype=str)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                raise HTTPException(status_code=400, detail="No se pudo leer el CSV. Verifique la codificacion.")
        else:
            df = pd.read_excel(sio.BytesIO(content), dtype=str)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {str(e)}")

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    required = {"nombre", "precio", "categoria"}
    missing = required - set(df.columns)
    if missing:
        raise HTTPException(status_code=400, detail=f"Columnas faltantes: {', '.join(missing)}")
    if len(df) > 2000:
        raise HTTPException(status_code=400, detail=f"Maximo 2000 productos por importacion. El archivo tiene {len(df)} filas.")
    if len(df) == 0:
        raise HTTPException(status_code=400, detail="El archivo esta vacio")

    categories = await db.categories.find({}, {"_id": 0}).to_list(200)
    cat_map = {cat["name"].strip().lower(): cat["id"] for cat in categories}

    existing_products = await db.products.find({"active": True}, {"_id": 0, "name": 1, "category_id": 1}).to_list(5000)
    existing_set = {(p.get("name", "").strip().lower(), p.get("category_id", "")) for p in existing_products}

    created = 0
    skipped = 0
    errors = []
    preview = []

    for idx, row in df.iterrows():
        row_num = idx + 2
        nombre = str(row.get("nombre", "")).strip()
        precio_str = str(row.get("precio", "")).strip().replace(",", ".").replace("$", "").replace("RD", "").strip()
        categoria = str(row.get("categoria", "")).strip()
        descripcion = str(row.get("descripcion", "")).strip() if pd.notna(row.get("descripcion")) else ""
        codigo_barras = str(row.get("codigo_barras", "")).strip() if pd.notna(row.get("codigo_barras")) else ""
        disponible = str(row.get("disponible", "TRUE")).strip().upper()

        if len(preview) < 5:
            preview.append({"row": row_num, "nombre": nombre, "precio": precio_str, "categoria": categoria})

        if not nombre or nombre.lower() == "nan":
            errors.append({"row": row_num, "nombre": nombre or "(vacio)", "error": "Nombre vacio"})
            continue
        try:
            precio = float(precio_str)
            if precio < 0:
                raise ValueError
        except (ValueError, TypeError):
            errors.append({"row": row_num, "nombre": nombre, "error": f"Precio invalido: '{precio_str}'"})
            continue

        cat_id = cat_map.get(categoria.lower())
        if not cat_id:
            errors.append({"row": row_num, "nombre": nombre, "error": f"Categoria '{categoria}' no encontrada"})
            continue

        if (nombre.lower(), cat_id) in existing_set:
            skipped += 1
            continue

        doc = {
            "id": gen_id(), "name": nombre, "category_id": cat_id,
            "price": round(precio, 2), "price_a": round(precio, 2),
            "active": disponible != "FALSE",
            "description": descripcion if descripcion.lower() != "nan" else "",
            "barcode": codigo_barras if codigo_barras.lower() != "nan" else "",
            "created_at": now_iso(), "imported": True, "imported_by": user.get("user_id"),
        }
        await db.products.insert_one(doc)
        existing_set.add((nombre.lower(), cat_id))
        created += 1

    return {"total": len(df), "created": created, "skipped": skipped, "errors": len(errors), "error_details": errors, "preview": preview}

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
async def update_product(product_id: str, input: dict, user: dict = Depends(get_current_user)):
    if "_id" in input: del input["_id"]
    
    # Get old product to compare prices for audit
    old_product = await db.products.find_one({"id": product_id}, {"_id": 0, "name": 1, "price": 1, "price_a": 1})
    
    await db.products.update_one({"id": product_id}, {"$set": input})
    
    # Log price changes if detected
    if old_product:
        from utils.audit import log_price_change
        old_price = old_product.get("price", old_product.get("price_a", 0))
        new_price = input.get("price", input.get("price_a"))
        
        if new_price is not None and old_price != new_price:
            await log_price_change(
                db=db,
                user_id=user["user_id"],
                user_name=user.get("name", ""),
                role=user.get("role", ""),
                product_name=old_product.get("name", "Producto"),
                old_price=old_price,
                new_price=new_price,
                product_id=product_id
            )
    
    return {"ok": True}

@router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    await db.products.delete_one({"id": product_id})
    return {"ok": True}


# ─── MODIFIER GROUPS ───
@router.get("/modifier-groups")
async def list_modifier_groups():
    return await db.modifier_groups.find({}, {"_id": 0}).to_list(200)

@router.post("/modifier-groups")
async def create_modifier_group(input: ModifierGroupInput, user=Depends(get_current_user)):
    doc = {
        "id": gen_id(),
        "name": input.name,
        "min_selection": input.min_selection,
        "max_selection": input.max_selection,
        "prefix": input.prefix or "",
        "selection_type": input.selection_type or "optional",
        "sort_order": input.sort_order or 0,
        "is_active": True if input.is_active is None else input.is_active,
        "applies_to_product_ids": input.applies_to_product_ids,
        "applies_to_category_ids": input.applies_to_category_ids,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.modifier_groups.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/modifier-groups/{gid}")
async def update_modifier_group(gid: str, input: dict, user=Depends(get_current_user)):
    if "_id" in input:
        del input["_id"]
    input["updated_at"] = now_iso()
    await db.modifier_groups.update_one({"id": gid}, {"$set": input})
    return {"ok": True}

@router.delete("/modifier-groups/{gid}")
async def delete_modifier_group(gid: str, user=Depends(get_current_user)):
    await db.modifier_groups.delete_one({"id": gid})
    await db.modifiers.delete_many({"group_id": gid})
    return {"ok": True}

@router.get("/modifier-groups/for-product/{product_id}")
async def modifier_groups_for_product(product_id: str):
    """Returns active modifier groups that apply to this product (via explicit assignment,
    applies_to_product_ids, or applies_to_category_ids), enriched with resolved option prices + stock."""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # 1) Explicit assignments on product (legacy: modifier_group_ids / modifier_assignments)
    explicit_ids = set(product.get("modifier_group_ids", []) or [])
    for a in (product.get("modifier_assignments", []) or []):
        if a.get("group_id"):
            explicit_ids.add(a["group_id"])

    cat_id = product.get("category_id", "")
    all_groups = await db.modifier_groups.find({}, {"_id": 0}).to_list(200)
    matching = []
    for g in all_groups:
        if not g.get("is_active", True):
            continue
        if g["id"] in explicit_ids:
            matching.append(g)
            continue
        applies_p = g.get("applies_to_product_ids")
        applies_c = g.get("applies_to_category_ids")
        if applies_p and product_id in applies_p:
            matching.append(g)
            continue
        if applies_c and cat_id and cat_id in applies_c:
            matching.append(g)
            continue

    # 2) Enrich each group with its options + resolved metadata
    all_modifiers = await db.modifiers.find({"group_id": {"$in": [g["id"] for g in matching]}}, {"_id": 0}).to_list(500)
    # Collect referenced product_ids to enrich once
    ref_pids = {m.get("product_id") for m in all_modifiers if m.get("mode") == "product" and m.get("product_id")}
    ref_products = {}
    if ref_pids:
        docs = await db.products.find({"id": {"$in": list(ref_pids)}}, {"_id": 0}).to_list(len(ref_pids))
        ref_products = {d["id"]: d for d in docs}

    def _resolve(mod: dict) -> dict:
        mode = mod.get("mode") or "text"
        base = dict(mod)
        if mode == "product" and mod.get("product_id"):
            p = ref_products.get(mod["product_id"])
            if p:
                ps = mod.get("price_source") or "custom"
                if ps == "price_a":
                    resolved = float(p.get("price", 0) or 0)
                elif ps == "price_b":
                    resolved = float(p.get("price_b", 0) or 0)
                elif ps == "price_c":
                    resolved = float(p.get("price_c", 0) or 0)
                elif ps == "included":
                    resolved = 0.0
                else:  # custom
                    resolved = float(mod.get("custom_price", mod.get("price", 0)) or 0)
                base["resolved_price"] = round(resolved, 2)
                base["linked_product"] = {
                    "id": p["id"],
                    "name": p.get("name", ""),
                    "simple_inventory_enabled": p.get("simple_inventory_enabled", False),
                    "stock_qty": int(p.get("simple_inventory_qty", 0) or 0) if p.get("simple_inventory_enabled") else None,
                }
                base["available"] = (not p.get("simple_inventory_enabled")) or (int(p.get("simple_inventory_qty", 0) or 0) > 0)
            else:
                base["resolved_price"] = float(mod.get("price", 0) or 0)
                base["linked_product"] = None
                base["available"] = False
        else:
            base["mode"] = "text"
            base["resolved_price"] = float(mod.get("price", 0) or 0)
            base["linked_product"] = None
            base["available"] = True
        return base

    out = []
    for g in sorted(matching, key=lambda x: (x.get("sort_order", 0), x.get("name", ""))):
        options = [m for m in all_modifiers if m.get("group_id") == g["id"] and m.get("is_active", True) is not False]
        options = sorted(options, key=lambda x: (x.get("sort_order", 0), x.get("name", "")))
        g["options"] = [_resolve(o) for o in options]
        out.append(g)
    return out

# ─── MODIFIERS ───
@router.get("/modifiers")
async def list_modifiers(group_id: Optional[str] = Query(None)):
    query = {"group_id": group_id} if group_id else {}
    return await db.modifiers.find(query, {"_id": 0}).to_list(500)

@router.post("/modifiers")
async def create_modifier(input: dict, user=Depends(get_current_user)):
    doc = {
        "id": gen_id(),
        "group_id": input.get("group_id", ""),
        "name": input.get("name", ""),
        "price": float(input.get("price", 0) or 0),
        "mode": input.get("mode", "text"),
        "product_id": input.get("product_id") or None,
        "price_source": input.get("price_source", "custom"),
        "custom_price": input.get("custom_price"),
        "is_default": bool(input.get("is_default", False)),
        "is_active": input.get("is_active", True) is not False,
        "sort_order": int(input.get("sort_order", 0) or 0),
        "max_qty": int(input.get("max_qty", 1) or 1),
    }
    await db.modifiers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/modifiers/{mid}")
async def update_modifier(mid: str, input: dict, user=Depends(get_current_user)):
    if "_id" in input:
        del input["_id"]
    await db.modifiers.update_one({"id": mid}, {"$set": input})
    return {"ok": True}

@router.delete("/modifiers/{mid}")
async def delete_modifier(mid: str, user=Depends(get_current_user)):
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
