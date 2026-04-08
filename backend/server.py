from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query, UploadFile, File
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import os
import logging
import uuid
import hashlib
import jwt
import asyncio
import socket
import resend
import shutil
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

# Import routers
from routers.auth import router as auth_router, get_current_user, get_permissions, hash_pin, DEFAULT_PERMISSIONS, ALL_PERMISSIONS
from routers.purchasing import router as purchasing_router
from routers.pos_sessions import router as pos_sessions_router
from routers.taxes import router as taxes_router, set_db as taxes_set_db, init_supabase as taxes_init_supabase
from routers.inventory import router as inventory_router
from routers.inventory import (
    explode_and_deduct_recipe, update_subrecipe_costs, calculate_recipe_cost,
    get_recipe_for_ingredient, check_recipe_availability, get_ingredient_stock
)
from routers.recipes import router as recipes_router
from routers.reports import router as reports_router
from routers.orders import router as orders_router, set_db as orders_set_db, set_kds_notifier
from routers.tables import router as tables_router, set_db as tables_set_db
from routers.attendance import router as attendance_router, set_db as attendance_set_db
from routers.billing import router as billing_router, set_db as billing_set_db, init_supabase as billing_init_supabase
from routers.kitchen import router as kitchen_router, set_db as kitchen_set_db, notify_kds
from routers.customers import router as customers_router, set_db as customers_set_db
from routers.config import router as config_router, set_db as config_set_db
from routers.ncf import router as ncf_router, init_supabase as ncf_init_supabase, set_db as ncf_set_db
from routers.credit_notes import router as credit_notes_router, set_db as credit_notes_set_db, init_supabase as credit_notes_init_supabase
from routers.business_days import router as business_days_router, set_db as business_days_set_db, init_supabase as business_days_init_supabase
from routers.dgii import router as dgii_router
from routers.discounts import router as discounts_router, set_db as discounts_set_db
from routers.email import router as email_router, set_db as email_set_db
from routers.alanube import router as alanube_router, set_db as alanube_set_db
from routers.ecf_dispatcher import router as ecf_dispatcher_router, set_db as ecf_dispatcher_set_db
from routers.manuales import router as manuales_router
from routers.system_logs import set_db as system_logs_set_db
from utils.timezone import get_system_timezone_name, get_system_now, invalidate_cache as tz_invalidate_cache

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback_secret')
resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

# Initialize routers with db
orders_set_db(db)
tables_set_db(db)
attendance_set_db(db)
billing_set_db(db)
billing_init_supabase()  # Initialize Supabase for pos_sessions integration
ncf_set_db(db)  # Set MongoDB for NCF additional config
ncf_init_supabase()  # Initialize Supabase for NCF management
credit_notes_set_db(db)
credit_notes_init_supabase()  # Initialize Supabase for Credit Notes
kitchen_set_db(db)
taxes_set_db(db)
taxes_init_supabase()  # Initialize Supabase for tax calculations
customers_set_db(db)
config_set_db(db)
business_days_set_db(db)
business_days_init_supabase()  # Initialize Supabase for business days
discounts_set_db(db)
email_set_db(db)
alanube_set_db(db)
ecf_dispatcher_set_db(db)
system_logs_set_db(db)

# Connect KDS notifier to orders
set_kds_notifier(notify_kds)

app = FastAPI()
api = APIRouter(prefix="/api")

# Include routers
api.include_router(auth_router)
api.include_router(purchasing_router)
api.include_router(pos_sessions_router)
api.include_router(taxes_router)
api.include_router(inventory_router)
api.include_router(recipes_router)
api.include_router(reports_router)
api.include_router(orders_router)
api.include_router(tables_router)
api.include_router(attendance_router)
api.include_router(billing_router)
api.include_router(kitchen_router)
api.include_router(customers_router)

@api.get("/health")
async def health_check():
    """Lightweight health check for real connectivity detection"""
    return {"ok": True}


# ─── MODIFIER GROUPS WITH OPTIONS (para ProductConfig dropdown) ───
# Retorna grupos combinados (old-style + new-style) con opciones enriquecidas
@api.get("/modifier-groups-with-options")
async def list_modifier_groups_with_options():
    """Return all modifier GROUPS with enriched options for ProductConfig dropdown."""
    # Fetch all modifiers once
    all_modifiers = await db.modifiers.find({}, {"_id": 0}).to_list(500)
    
    # Old-style: modifiers without group_id (they ARE groups)
    old_groups = [doc for doc in all_modifiers if not (doc.get("group_id", "") or "").strip()]
    
    # New-style: modifier_groups collection + enrich with their options
    new_groups = await db.modifier_groups.find({}, {"_id": 0}).to_list(100)
    all_options = [doc for doc in all_modifiers if (doc.get("group_id", "") or "").strip()]
    for g in new_groups:
        g["options"] = [o for o in all_options if o.get("group_id") == g["id"]]
    
    # Deduplicate: new-style groups take priority over old-style with same name
    new_names = {g["name"].lower().strip() for g in new_groups}
    filtered_old = [g for g in old_groups if g["name"].lower().strip() not in new_names]
    
    return filtered_old + new_groups

api.include_router(config_router)
api.include_router(ncf_router)
api.include_router(credit_notes_router)
api.include_router(business_days_router)
api.include_router(dgii_router)
api.include_router(discounts_router)
api.include_router(email_router, prefix="/email")
api.include_router(ecf_dispatcher_router, prefix="/ecf")
api.include_router(manuales_router)

# Scheduler for automated tasks
scheduler = AsyncIOScheduler()

# Utils
def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def utc_to_local_str(utc_iso_str: str, fmt: str = "%d/%m/%Y %I:%M:%S %p") -> str:
    """Convierte un string ISO UTC a hora local de Republica Dominicana para impresion."""
    try:
        from zoneinfo import ZoneInfo
        dt = datetime.fromisoformat(utc_iso_str.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        local_dt = dt.astimezone(ZoneInfo("America/Santo_Domingo"))
        return local_dt.strftime(fmt)
    except:
        return utc_iso_str[:19]

def now_local_str(fmt: str = "%I:%M %p") -> str:
    """Hora local actual de DR para impresion."""
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("America/Santo_Domingo")).strftime(fmt)

async def get_next_transaction_number() -> int:
    """
    Genera el siguiente número de transacción interno secuencial.
    Usa find_one_and_update con upsert para garantizar atomicidad.
    Este número es independiente del NCF fiscal y es solo para control interno.
    Formato: Número entero secuencial que se reinicia manualmente si es necesario.
    """
    result = await db.counters.find_one_and_update(
        {"_id": "internal_transaction"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER
    )
    return result["seq"]

def format_qty(q) -> str:
    """Formatea cantidad: 1.0 -> '1', 1.5 -> '1.5'"""
    if q == int(q):
        return str(int(q))
    return str(q)

# ─── TIMEZONE CONFIGURATION ───
@api.get("/timezone")
async def get_timezone_config():
    """Get the current system timezone configuration."""
    tz_name = await get_system_timezone_name()
    return {"timezone": tz_name}

@api.put("/timezone")
async def set_timezone_config(body: dict):
    """Update the system timezone. Requires a valid IANA timezone name."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    tz_name = body.get("timezone", "")
    if not tz_name or not tz_name.strip():
        raise HTTPException(status_code=400, detail="Timezone invalido: valor vacio")
    try:
        ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"Timezone invalido: {tz_name}")
    await db.system_config.update_one(
        {"id": "timezone"},
        {"$set": {"id": "timezone", "timezone": tz_name}},
        upsert=True
    )
    tz_invalidate_cache()
    return {"timezone": tz_name, "message": "Timezone actualizado"}

# ─── IMPRESIÓN DIRECTA A RED ───
NETWORK_PRINTER_PORT = 9100

# Comandos ESC/POS
ESC = b'\x1b'
GS = b'\x1d'

def build_escpos_commands(commands: list) -> bytes:
    """Construye datos ESC/POS desde lista de comandos"""
    data = bytearray()
    data.extend(ESC + b'@')  # Inicializar impresora
    
    for cmd in commands:
        cmd_type = cmd.get("type", "")
        
        if cmd_type == "text":
            text = cmd.get("text", "")
            align = cmd.get("align", "left")
            bold = cmd.get("bold", False)
            size = cmd.get("size", 1)
            
            # Alineación
            if align == "center":
                data.extend(ESC + b'a\x01')
            elif align == "right":
                data.extend(ESC + b'a\x02')
            else:
                data.extend(ESC + b'a\x00')
            
            # Negrita
            if bold:
                data.extend(ESC + b'E\x01')
            
            # Tamaño
            if size == 2:
                data.extend(GS + b'!\x11')
            elif size == 3:
                data.extend(GS + b'!\x22')
            else:
                data.extend(GS + b'!\x00')
            
            data.extend(text.encode('cp437', errors='replace'))
            data.extend(b'\n')
            
            # Reset
            data.extend(ESC + b'E\x00')
            data.extend(GS + b'!\x00')
            
        elif cmd_type == "columns":
            data.extend(ESC + b'a\x00')
            left = cmd.get("left", "")
            right = cmd.get("right", "")
            width = 42  # 72mm = ~42 caracteres
            spaces = max(1, width - len(left) - len(right))
            line = left + " " * spaces + right
            if cmd.get("bold"):
                data.extend(ESC + b'E\x01')
            data.extend(line.encode('cp437', errors='replace'))
            data.extend(b'\n')
            data.extend(ESC + b'E\x00')
            
        elif cmd_type == "divider":
            data.extend(b'-' * 42 + b'\n')
            
        elif cmd_type == "feed":
            lines = cmd.get("lines", 1)
            data.extend(b'\n' * lines)
            
        elif cmd_type == "cut":
            data.extend(GS + b'V\x00')
    
    return bytes(data)

async def send_to_network_printer(ip: str, data: bytes, port: int = 9100, timeout: int = 10) -> tuple:
    """Envía datos ESC/POS a impresora de red via socket TCP"""
    try:
        loop = asyncio.get_event_loop()
        
        def _send():
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            sock.connect((ip, port))
            sock.sendall(data)
            sock.close()
            return True, None
        
        success, error = await loop.run_in_executor(None, _send)
        return success, error
    except socket.timeout:
        return False, f"Timeout conectando a {ip}:{port}"
    except socket.error as e:
        return False, f"Error de red: {str(e)}"
    except Exception as e:
        return False, f"Error: {str(e)}"

# ─── INPUT MODELS ───
class EmailInput(BaseModel):
    to: str
    subject: str
    html: str

# ─── CATEGORIES ───
@api.get("/categories")
async def list_categories():
    return await db.categories.find({}, {"_id": 0}).sort("order", 1).to_list(50)

@api.post("/categories")
async def create_category(input: dict):
    count = await db.categories.count_documents({})
    doc = {"id": gen_id(), "name": input.get("name", ""), "color": input.get("color", "#FF6600"), "icon": input.get("icon", "utensils"), "order": count}
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
    products_count = await db.products.count_documents({"category_id": cat_id})
    if products_count > 0:
        raise HTTPException(400, f"No se puede eliminar: {products_count} productos usan esta categoria")
    await db.categories.delete_one({"id": cat_id})
    return {"status": "deleted"}

# ─── PRODUCTS ───
@api.get("/products")
async def list_products(category_id: Optional[str] = Query(None), skip: int = Query(0, ge=0), limit: int = Query(300, ge=1, le=500)):
    query = {"category_id": category_id, "active": True} if category_id else {"active": True}
    return await db.products.find(query, {"_id": 0}).skip(skip).to_list(limit)

@api.get("/products/{product_id}")
async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product

@api.post("/products")
async def create_product(input: dict):
    modifier_assignments = input.get("modifier_assignments", [])
    doc = {
        "id": gen_id(), 
        "name": input.get("name", ""), 
        "printed_name": input.get("printed_name", "") or input.get("name", ""),
        "category_id": input.get("category_id", ""),
        "report_category_id": input.get("report_category_id", ""),
        "price": input.get("price", 0), 
        "price_a": input.get("price_a", 0) or input.get("price", 0),
        "price_b": input.get("price_b", 0),
        "price_c": input.get("price_c", 0),
        "price_d": input.get("price_d", 0),
        "price_e": input.get("price_e", 0),
        "button_bg_color": input.get("button_bg_color", ""),
        "button_text_color": input.get("button_text_color", ""),
        "image_url": input.get("image_url", ""),  # URL de imagen del producto
        "icon": input.get("icon", ""),            # Icono de Lucide
        "modifier_group_ids": input.get("modifier_group_ids", []),
        "modifier_assignments": modifier_assignments,
        "track_inventory": input.get("track_inventory", False),
        "print_channels": input.get("print_channels", []),  # Array of channel codes for multi-channel printing
        "tax_exemptions": input.get("tax_exemptions", []),  # Array of tax IDs this product is exempt from
        "barcode": input.get("barcode", ""),  # Barcode for scanner
        "active": True
    }
    await db.products.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/products/{product_id}")
async def update_product(product_id: str, input: dict, user: dict = Depends(get_current_user)):
    if "_id" in input:
        del input["_id"]
    
    # Get old product to compare prices
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

@api.get("/products/by-barcode/{barcode}")
async def get_product_by_barcode(barcode: str):
    """Find a product by its barcode"""
    product = await db.products.find_one({"barcode": barcode, "active": True}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product

@api.get("/products/check-barcode/{barcode}")
async def check_barcode_duplicate(barcode: str, exclude_id: Optional[str] = Query(None)):
    """Check if a barcode is already in use by another product"""
    if not barcode or not barcode.strip():
        return {"exists": False}
    query = {"barcode": barcode, "active": True}
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    products = await db.products.find(query, {"_id": 0, "id": 1, "name": 1}).to_list(10)
    return {"exists": len(products) > 0, "products": products}

# ─── SYSTEM AUDIT LOG ───
@api.post("/system-audit-log")
async def create_audit_log(input: dict, user: dict = Depends(get_current_user)):
    """Create a system audit log entry"""
    from datetime import datetime, timezone
    log = {
        "id": gen_id(),
        "event_type": input.get("event_type", "unknown"),
        "entity_type": input.get("entity_type", ""),
        "entity_id": input.get("entity_id", ""),
        "entity_name": input.get("entity_name", ""),
        "details": input.get("details", ""),
        "user_id": user.get("user_id"),
        "user_name": user.get("name"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.system_audit_logs.insert_one(log)
    return {"ok": True}

# ─── UPLOAD DE IMÁGENES DE PRODUCTOS ───
ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB

@api.post("/products/upload-image")
async def upload_product_image(file: UploadFile = File(...)):
    """
    Sube una imagen de producto al servidor.
    Retorna la URL de la imagen para usar en el producto.
    """
    # Validar tipo de archivo
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400, 
            detail=f"Tipo de archivo no permitido. Usa: JPG, PNG, WebP o GIF"
        )
    
    # Leer contenido del archivo
    contents = await file.read()
    
    # Validar tamaño
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(
            status_code=400, 
            detail=f"Imagen muy grande. Máximo 5MB"
        )
    
    # Generar nombre único para el archivo
    file_ext = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
    if file_ext not in ["jpg", "jpeg", "png", "webp", "gif"]:
        file_ext = "jpg"
    
    unique_filename = f"{gen_id()}.{file_ext}"
    
    # Guardar archivo
    upload_path = Path(__file__).parent / "uploads" / "products" / unique_filename
    
    with open(upload_path, "wb") as f:
        f.write(contents)
    
    # Retornar URL relativa que será servida por el servidor estático
    # La URL completa será construida en el frontend usando REACT_APP_BACKEND_URL
    return {
        "success": True,
        "filename": unique_filename,
        "url": f"/api/uploads/products/{unique_filename}",
        "size": len(contents),
        "content_type": file.content_type
    }

@api.delete("/products/delete-image/{filename}")
async def delete_product_image(filename: str):
    """Elimina una imagen de producto del servidor"""
    # Validar que el filename no contenga path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")
    
    file_path = Path(__file__).parent / "uploads" / "products" / filename
    
    if file_path.exists():
        file_path.unlink()
        return {"success": True, "message": "Imagen eliminada"}
    else:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")

from fastapi.responses import FileResponse

@api.get("/uploads/products/{filename}")
async def get_product_image(filename: str):
    """Sirve imágenes de productos"""
    # Validar que el filename no contenga path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")
    
    file_path = Path(__file__).parent / "uploads" / "products" / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Imagen no encontrada")
    
    # Determinar content type
    ext = filename.split(".")[-1].lower()
    content_types = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif"
    }
    content_type = content_types.get(ext, "image/jpeg")
    
    return FileResponse(file_path, media_type=content_type)

# ─── LOGO UPLOAD ───
@api.post("/system/upload-logo")
async def upload_logo(file: UploadFile = File(...)):
    """Upload restaurant logo"""
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo debe ser menor a 5MB")
    file_ext = file.filename.split(".")[-1].lower() if "." in file.filename else "png"
    if file_ext not in ["jpg", "jpeg", "png", "webp", "gif", "svg"]:
        file_ext = "png"
    logo_dir = Path(__file__).parent / "uploads" / "logo"
    logo_dir.mkdir(parents=True, exist_ok=True)
    # Remove old logos
    for old in logo_dir.iterdir():
        old.unlink()
    unique_filename = f"logo.{file_ext}"
    with open(logo_dir / unique_filename, "wb") as f:
        f.write(contents)
    logo_url = f"/api/uploads/logo/{unique_filename}"
    await db.system_config.update_one({}, {"$set": {"logo_url": logo_url}}, upsert=True)
    return {"ok": True, "logo_url": logo_url}

@api.get("/uploads/logo/{filename}")
async def get_logo(filename: str):
    """Serve restaurant logo"""
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")
    file_path = Path(__file__).parent / "uploads" / "logo" / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Logo no encontrado")
    ext = filename.split(".")[-1].lower()
    ct = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "gif": "image/gif", "svg": "image/svg+xml"}
    return FileResponse(file_path, media_type=ct.get(ext, "image/png"))

# ─── REPORT CATEGORIES ───
@api.get("/report-categories")
async def list_report_categories():
    cats = await db.report_categories.find({}, {"_id": 0}).to_list(50)
    if not cats:
        defaults = [
            {"id": gen_id(), "name": "Alimentos", "code": "food"},
            {"id": gen_id(), "name": "Bebidas", "code": "beverages"},
            {"id": gen_id(), "name": "Postres", "code": "desserts"},
            {"id": gen_id(), "name": "Licores", "code": "liquor"},
            {"id": gen_id(), "name": "Otros", "code": "other"},
        ]
        await db.report_categories.insert_many(defaults)
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

# ─── CANCELLATION REASONS ───
@api.get("/cancellation-reasons")
async def list_cancellation_reasons():
    return await db.cancellation_reasons.find({}, {"_id": 0}).to_list(50)

@api.post("/cancellation-reasons")
async def create_cancellation_reason(input: dict):
    doc = {
        "id": gen_id(),
        "name": input.get("name", ""),
        "return_to_inventory": input.get("return_to_inventory", input.get("affects_inventory", True)),
        "affects_inventory": input.get("affects_inventory", input.get("return_to_inventory", True)),
        "allowed_roles": input.get("allowed_roles", ["admin", "supervisor", "cashier", "waiter", "kitchen"]),
        "active": input.get("active", True)
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
    return await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})

@api.post("/shifts/open")
async def open_shift(input: dict, user=Depends(get_current_user)):
    existing = await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})
    if existing:
        return existing
    doc = {
        "id": gen_id(), "user_id": user["user_id"], "user_name": user["name"],
        "station": input.get("station", "Caja 1"), "opening_amount": input.get("opening_amount", 0),
        "status": "open", "cash_sales": 0, "card_sales": 0, "total_sales": 0,
        "total_tips": 0, "cancelled_count": 0, "opened_at": now_iso()
    }
    await db.shifts.insert_one(doc)
    
    # Audit: Shift opened
    from utils.audit import log_audit_event, AuditEventType
    await log_audit_event(
        db=db,
        event_type=AuditEventType.SHIFT_OPENED,
        description=f"Turno abierto en {doc['station']} con RD${doc['opening_amount']:,.2f}",
        user_id=user["user_id"],
        user_name=user["name"],
        role=user.get("role", ""),
        entity_type="shift",
        entity_id=doc["id"],
        entity_name=doc["station"],
        value=doc["opening_amount"]
    )
    
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/shifts/{shift_id}/close")
async def close_shift(shift_id: str, input: dict, user=Depends(get_current_user)):
    # Get shift info before closing
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    
    await db.shifts.update_one({"id": shift_id}, {"$set": {
        "status": "closed", "closing_amount": input.get("closing_amount", 0),
        "cash_count": input.get("cash_count"), "closed_at": now_iso()
    }})
    
    # Audit: Shift closed
    if shift:
        from utils.audit import log_audit_event, AuditEventType
        await log_audit_event(
            db=db,
            event_type=AuditEventType.SHIFT_CLOSED,
            description=f"Turno cerrado en {shift.get('station', '?')} - Total ventas: RD${shift.get('total_sales', 0):,.2f}",
            user_id=user["user_id"],
            user_name=user["name"],
            role=user.get("role", ""),
            entity_type="shift",
            entity_id=shift_id,
            entity_name=shift.get("station", "?"),
            value=input.get("closing_amount", 0),
            details={
                "opening_amount": shift.get("opening_amount", 0),
                "closing_amount": input.get("closing_amount", 0),
                "total_sales": shift.get("total_sales", 0)
            }
        )
    
    return {"ok": True}

@api.get("/shifts/check")
async def check_shift_required(user=Depends(get_current_user)):
    shift = await db.shifts.find_one({"user_id": user["user_id"], "status": "open"}, {"_id": 0})
    return {"has_open_shift": shift is not None, "shift": shift}

# ─── DAY CLOSE ───
@api.get("/day-close/check")
async def check_day_close():
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
async def update_station_config(input: dict, user: dict = Depends(get_current_user)):
    if "_id" in input: del input["_id"]
    
    # Get old config for comparison
    old_config = await db.station_config.find_one({}, {"_id": 0}) or {}
    
    await db.station_config.update_one({}, {"$set": input}, upsert=True)
    
    # Log configuration change
    from utils.audit import log_config_change
    changed_keys = [k for k in input.keys() if old_config.get(k) != input.get(k)]
    if changed_keys:
        await log_config_change(
            db=db,
            user_id=user["user_id"],
            user_name=user.get("name", ""),
            role=user.get("role", ""),
            config_name="Configuración de Estación",
            old_value={k: old_config.get(k) for k in changed_keys},
            new_value={k: input.get(k) for k in changed_keys}
        )
    
    return {"ok": True}

# ─── PRINT CHANNELS ───
# ─── PRINT CHANNELS (Canales de Impresión) ───
@api.get("/print-channels")
async def list_print_channels():
    channels = await db.print_channels.find({}, {"_id": 0}).to_list(50)
    if not channels:
        defaults = [
            {"id": gen_id(), "name": "Cocina", "code": "kitchen", "printer_name": "", "active": True, "category_ids": []},
            {"id": gen_id(), "name": "Bar", "code": "bar", "printer_name": "", "active": True, "category_ids": []},
            {"id": gen_id(), "name": "Recibo", "code": "receipt", "printer_name": "", "active": True, "category_ids": []},
        ]
        await db.print_channels.insert_many(defaults)
        return defaults
    return channels

@api.post("/print-channels")
async def create_print_channel(input: dict):
    name = input.get("name", "Canal")
    # Auto-generate code from name if not provided
    code = input.get("code", "").strip()
    if not code:
        # Generate code: lowercase, replace spaces with underscores, remove special chars
        import re
        code = re.sub(r'[^a-z0-9_]', '', name.lower().replace(' ', '_').replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u').replace('ñ', 'n'))
        if not code:
            code = f"channel_{gen_id()[:8]}"
    
    doc = {
        "id": gen_id(), 
        "name": name, 
        "code": code,
        "printer_name": input.get("printer_name", ""),
        "ip_address": input.get("ip_address", input.get("ip", "")),
        "active": input.get("active", True),
        "category_ids": input.get("category_ids", [])
    }
    await db.print_channels.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/print-channels/{cid}")
async def update_print_channel(cid: str, input: dict):
    if "_id" in input: del input["_id"]
    # Map 'ip' field from frontend to 'ip_address'
    if "ip" in input:
        input["ip_address"] = input.pop("ip")
    await db.print_channels.update_one({"id": cid}, {"$set": input})
    return {"ok": True}

@api.delete("/print-channels/{cid}")
async def delete_print_channel(cid: str):
    await db.print_channels.delete_one({"id": cid})
    return {"ok": True}


# ─── PRINTER CONFIG (Configuración Global de Impresión) ───
@api.get("/printer-config")
async def get_printer_config():
    config = await db.system_config.find_one({"id": "printer_config"}, {"_id": 0})
    if not config:
        config = {
            "id": "printer_config",
            "enabled": True,
            "paper_width": 80,
            "auto_print_comanda": False,
            "auto_print_receipt": False,
            "business_name": "ALONZO CIGAR",
            "business_address": "C/ Las Flores #12, Jarabacoa",
            "rnc": "1-31-75577-1",
            "phone": "809-301-3858",
            "footer_text": "Gracias por su visita!"
        }
    return config

@api.put("/printer-config")
async def update_printer_config(input: dict):
    if "_id" in input: del input["_id"]
    input["id"] = "printer_config"
    await db.system_config.update_one(
        {"id": "printer_config"},
        {"$set": input},
        upsert=True
    )
    return {"ok": True}


# ─── CATEGORY CHANNEL MAPPING ───
@api.get("/category-channels")
async def get_category_channels():
    """Get mapping of categories to print channels"""
    mappings = await db.category_channels.find({}, {"_id": 0}).to_list(100)
    return mappings

@api.post("/category-channels")
async def create_category_channel(input: dict):
    """Create/update a single category-channel mapping"""
    category_id = input.get("category_id")
    channel_code = input.get("channel_code")
    if not category_id or not channel_code:
        raise HTTPException(status_code=400, detail="category_id and channel_code required")
    
    await db.category_channels.update_one(
        {"category_id": category_id},
        {"$set": {"category_id": category_id, "channel_code": channel_code}},
        upsert=True
    )
    return {"ok": True, "category_id": category_id, "channel_code": channel_code}

@api.delete("/category-channels/{category_id}")
async def delete_category_channel(category_id: str):
    """Remove a category-channel mapping"""
    await db.category_channels.delete_one({"category_id": category_id})
    return {"ok": True}

@api.put("/category-channels")
async def update_category_channels(input: dict):
    """Update category to channel mappings"""
    # Input format: { "category_id": "channel_code" }
    for cat_id, channel_code in input.items():
        await db.category_channels.update_one(
            {"category_id": cat_id},
            {"$set": {"category_id": cat_id, "channel_code": channel_code}},
            upsert=True
        )
    return {"ok": True}


# ─── AREA CHANNEL MAPPINGS (Area-based print routing) ───
@api.get("/area-channel-mappings")
async def get_area_channel_mappings():
    """Get all area-specific channel mappings"""
    mappings = await db.area_channel_mappings.find({}, {"_id": 0}).to_list(500)
    return mappings

@api.get("/area-channel-mappings/{area_id}")
async def get_area_channel_mapping(area_id: str):
    """Get channel mappings for a specific area"""
    mappings = await db.area_channel_mappings.find({"area_id": area_id}, {"_id": 0}).to_list(100)
    return mappings

@api.post("/area-channel-mappings")
async def create_area_channel_mapping(input: dict):
    """Create a single area-category-channel mapping"""
    area_id = input.get("area_id")
    category_id = input.get("category_id")
    channel_code = input.get("channel_code")
    
    if not area_id or not category_id or not channel_code:
        raise HTTPException(status_code=400, detail="area_id, category_id, and channel_code required")
    
    # Upsert: update if exists, create if not
    await db.area_channel_mappings.update_one(
        {"area_id": area_id, "category_id": category_id},
        {"$set": {
            "area_id": area_id,
            "category_id": category_id,
            "channel_code": channel_code,
            "updated_at": now_iso()
        }},
        upsert=True
    )
    return {"ok": True, "area_id": area_id, "category_id": category_id, "channel_code": channel_code}

@api.put("/area-channel-mappings/bulk")
async def update_area_channel_mappings_bulk(input: dict):
    """
    Bulk update area channel mappings.
    Input format: { "area_id": { "category_id": "channel_code", ... }, ... }
    """
    for area_id, mappings in input.items():
        for category_id, channel_code in mappings.items():
            if channel_code:
                await db.area_channel_mappings.update_one(
                    {"area_id": area_id, "category_id": category_id},
                    {"$set": {
                        "area_id": area_id,
                        "category_id": category_id,
                        "channel_code": channel_code,
                        "updated_at": now_iso()
                    }},
                    upsert=True
                )
            else:
                # Empty channel means remove the mapping (use global fallback)
                await db.area_channel_mappings.delete_one(
                    {"area_id": area_id, "category_id": category_id}
                )
    return {"ok": True}

@api.delete("/area-channel-mappings/{area_id}/{category_id}")
async def delete_area_channel_mapping(area_id: str, category_id: str):
    """Remove a specific area-category mapping (falls back to global)"""
    await db.area_channel_mappings.delete_one({"area_id": area_id, "category_id": category_id})
    return {"ok": True}

@api.delete("/area-channel-mappings/area/{area_id}")
async def delete_all_area_channel_mappings(area_id: str):
    """Remove all channel mappings for an area"""
    result = await db.area_channel_mappings.delete_many({"area_id": area_id})
    return {"ok": True, "deleted": result.deleted_count}


# ─── RESERVATIONS ───
@api.get("/reservations")
async def list_reservations(date: Optional[str] = Query(None)):
    query = {}
    if date:
        query = {"$or": [{"reservation_date": date}, {"date": date}]}
    return await db.reservations.find(query, {"_id": 0}).sort("reservation_time", 1).to_list(200)

@api.post("/reservations")
async def create_reservation(input: dict):
    table_ids = input.get("table_ids", [])
    if input.get("table_id") and input["table_id"] not in table_ids:
        table_ids.append(input["table_id"])
    tables_found = await db.tables.find({"id": {"$in": table_ids}}, {"_id": 0, "id": 1, "number": 1}).to_list(len(table_ids) or 1)
    table_numbers = [t["number"] for t in tables_found]
    
    activation_minutes = input.get("activation_minutes", 60)
    tolerance_minutes = input.get("tolerance_minutes", 15)
    
    doc = {
        "id": gen_id(), 
        "customer_name": input.get("customer_name",""),
        "phone": input.get("phone",""), 
        "reservation_date": input.get("reservation_date", input.get("date", "")),
        "reservation_time": input.get("reservation_time", input.get("time", "")), 
        "party_size": input.get("party_size",2),
        "table_ids": table_ids, 
        "table_numbers": table_numbers,
        "area_id": input.get("area_id", ""),
        "notes": input.get("notes",""), 
        "status": "confirmed",
        "activation_minutes": activation_minutes,
        "tolerance_minutes": tolerance_minutes,
        "created_by": input.get("created_by", ""),
        "created_at": now_iso()
    }
    await db.reservations.insert_one(doc)
    
    for tid in table_ids:
        await db.tables.update_one({"id": tid}, {"$set": {"pending_reservation_id": doc["id"]}})
    
    return {k: v for k, v in doc.items() if k != "_id"}

@api.get("/reservations/check-activations")
async def check_reservation_activations():
    from zoneinfo import ZoneInfo
    LOCAL_TZ = ZoneInfo("America/Santo_Domingo")
    
    now = datetime.now(LOCAL_TZ)
    today = now.strftime("%Y-%m-%d")
    tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    
    reservations = await db.reservations.find(
        {"$or": [
            {"reservation_date": {"$in": [today, tomorrow]}},
            {"date": {"$in": [today, tomorrow]}}
        ], "status": "confirmed"}, {"_id": 0}
    ).to_list(200)
    
    activated = []
    expired = []
    
    for res in reservations:
        try:
            res_date = res.get('reservation_date') or res.get('date', '')
            res_time = res.get('reservation_time') or res.get('time', '')
            res_time_str = f"{res_date} {res_time}"
            res_datetime = datetime.strptime(res_time_str, "%Y-%m-%d %H:%M").replace(tzinfo=LOCAL_TZ)
            
            activation_minutes = res.get("activation_minutes", 60)
            tolerance_minutes = res.get("tolerance_minutes", 15)
            
            activation_time = res_datetime - timedelta(minutes=activation_minutes)
            expiry_time = res_datetime + timedelta(minutes=tolerance_minutes)
            
            if activation_time <= now < expiry_time:
                for tid in res.get("table_ids", []):
                    await db.tables.update_one(
                        {"id": tid}, 
                        {"$set": {"status": "reserved", "reservation_id": res["id"]}}
                    )
                activated.append(res["id"])
            
            elif now >= expiry_time:
                for tid in res.get("table_ids", []):
                    current_table = await db.tables.find_one({"id": tid}, {"_id": 0})
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
    
    # Cleanup: Find tables stuck as "reserved" with no valid active reservation
    cleaned = []
    stuck_tables = await db.tables.find({"status": "reserved"}, {"_id": 0, "id": 1, "reservation_id": 1, "number": 1}).to_list(100)
    active_reservation_ids = set(r["id"] for r in reservations if r["id"] in activated)
    
    for table in stuck_tables:
        table_res_id = table.get("reservation_id")
        # If table has no reservation_id, or its reservation no longer exists/is not confirmed, free it
        if not table_res_id or table_res_id not in active_reservation_ids:
            # Double-check: does this reservation still exist and is confirmed?
            if table_res_id:
                res_exists = await db.reservations.find_one({"id": table_res_id, "status": "confirmed"}, {"_id": 0, "id": 1})
                if res_exists:
                    continue  # Reservation exists and is confirmed, keep reserved
            await db.tables.update_one(
                {"id": table["id"]}, 
                {"$set": {"status": "free", "reservation_id": None, "pending_reservation_id": None}}
            )
            cleaned.append(table.get("number", table["id"]))
    
    return {"activated": activated, "expired": expired, "checked": len(reservations), "cleaned_tables": cleaned}

@api.put("/reservations/{rid}")
async def update_reservation(rid: str, input: dict):
    if "_id" in input: del input["_id"]
    old = await db.reservations.find_one({"id": rid}, {"_id": 0})
    if input.get("status") in ["cancelled", "completed", "no_show"]:
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
    
    result = {
        "alert_count": len(low_stock_items),
        "items": low_stock_items,
        "checked_at": now_iso()
    }
    
    if send_email and low_stock_items:
        config = await db.system_config.find_one({"id": "stock_alerts"}, {"_id": 0})
        alert_emails = config.get("emails", []) if config else []
        
        if alert_emails and resend.api_key:
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
                    <h2 style='color:#FF6600;margin:0;'>Alerta de Stock Bajo</h2>
                    <p style='color:#888;margin:5px 0 0;font-size:14px;'>Mesa POS RD - Sistema de Inventario</p>
                </div>
                <p style='margin-bottom:15px;'>Se detectaron <strong style='color:#FF6600;'>{len(low_stock_items)}</strong> insumos por debajo del stock minimo:</p>
                <table style='width:100%;border-collapse:collapse;background:#252542;border-radius:8px;overflow:hidden;'>
                    <thead>
                        <tr style='background:#FF6600;color:white;'>
                            <th style='padding:10px;text-align:left;'>Insumo</th>
                            <th style='padding:10px;text-align:left;'>Categoria</th>
                            <th style='padding:10px;text-align:center;'>Stock Actual</th>
                            <th style='padding:10px;text-align:center;'>Stock Minimo</th>
                        </tr>
                    </thead>
                    <tbody>{items_html}</tbody>
                </table>
                <div style='margin-top:20px;padding:15px;background:#252542;border-radius:8px;border-left:4px solid #FF6600;'>
                    <p style='margin:0;font-size:14px;'><strong>Accion recomendada:</strong> Crear una orden de compra para reponer estos insumos.</p>
                </div>
                <p style='margin-top:20px;font-size:12px;color:#666;text-align:center;'>
                    Generado automaticamente el {now_iso()[:19].replace('T', ' ')}
                </p>
            </div>
            """
            
            try:
                for email in alert_emails:
                    params = {
                        "from": SENDER_EMAIL, 
                        "to": [email], 
                        "subject": f"Alerta de Stock Bajo - {len(low_stock_items)} items", 
                        "html": html
                    }
                    await asyncio.to_thread(resend.Emails.send, params)
                
                result["email_sent"] = True
                result["sent_to"] = alert_emails
                
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
    config = await db.system_config.find_one({"id": "stock_alerts"}, {"_id": 0})
    return config or {"id": "stock_alerts", "enabled": False, "emails": [], "frequency": "daily", "schedule_time": "08:00"}

@api.put("/inventory/alert-config")
async def update_alert_config(input: dict):
    if "_id" in input: del input["_id"]
    input["id"] = "stock_alerts"
    input["updated_at"] = now_iso()
    await db.system_config.update_one(
        {"id": "stock_alerts"}, 
        {"$set": input}, 
        upsert=True
    )
    await update_scheduler_from_config()
    return {"ok": True}

@api.get("/inventory/alert-logs")
async def get_alert_logs(limit: int = Query(20)):
    return await db.stock_alert_logs.find({}, {"_id": 0}).sort("sent_at", -1).to_list(limit)

# ─── PRINT TEMPLATES ───
@api.get("/print/pre-check/{order_id}")
async def print_pre_check(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404)
    items = [i for i in order.get("items", []) if i["status"] != "cancelled"]
    subtotal = sum((i["unit_price"] + sum(m.get("price",0) for m in i.get("modifiers",[]))) * i["quantity"] for i in items)
    
    # Get dynamic tax names
    taxes = await db.tax_config.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(10)
    tax_lines = []
    total_tax = 0
    for tax in taxes:
        rate = tax.get("rate", 0)
        if rate <= 0:
            continue
        amount = round(subtotal * (rate / 100), 2)
        tax_lines.append({"description": tax.get("description", ""), "rate": rate, "amount": amount})
        total_tax += amount
    if not tax_lines:
        tax_lines = [{"description": "ITBIS", "rate": 18, "amount": round(subtotal * 0.18, 2)}, {"description": "Propina", "rate": 10, "amount": round(subtotal * 0.10, 2)}]
        total_tax = sum(t["amount"] for t in tax_lines)
    total = round(subtotal + total_tax, 2)
    
    # Get table info for area name
    table_id = order.get("table_id")
    area_name = ""
    table_number = order.get("table_number", "?")
    if table_id:
        table = await db.tables.find_one({"id": table_id}, {"_id": 0})
        if table:
            table_number = table.get("number", table_number)
            area_id = table.get("area_id")
            if area_id:
                area = await db.areas.find_one({"id": area_id}, {"_id": 0})
                if area:
                    area_name = area.get("name", "")
    
    # Get account label (custom name)
    account_label = order.get("account_label", "")
    account_number = order.get("account_number", 1)
    account_display = f" — {account_label}" if account_label else ""
    
    items_html = ""
    for item in items:
        mods = ", ".join(m["name"] for m in item.get("modifiers", []))
        mod_str = f"<br><small style='color:#666'>  {mods}</small>" if mods else ""
        item_total = (item["unit_price"] + sum(m.get("price",0) for m in item.get("modifiers",[]))) * item["quantity"]
        items_html += f"<tr><td>{item['quantity']}x {item['product_name']}{mod_str}</td><td style='text-align:right'>RD$ {item_total:,.2f}</td></tr>"
    print_count = await db.pre_check_prints.count_documents({"order_id": order_id})
    await db.pre_check_prints.insert_one({"order_id": order_id, "print_number": print_count + 1, "printed_at": now_iso()})
    reprint_label = f"<div style='text-align:center;color:red;font-weight:bold;'>*** RE-IMPRESION #{print_count} ***</div>" if print_count > 0 else ""
    tax_html = "".join(f"<tr><td>{t['description']} {t['rate']}%</td><td style='text-align:right'>RD$ {t['amount']:,.2f}</td></tr>" for t in tax_lines)
    
    # Build area header line if area exists
    area_line = f"<div style='text-align:center;font-weight:bold;'>ÁREA: {area_name}</div>" if area_name else ""
    
    # Pre-cuenta HTML - 72mm área imprimible (papel 80mm), padding lateral 4mm
    return {"html": f"""<div style='font-family:monospace;max-width:72mm;width:72mm;padding:2mm 4mm;font-size:12px;margin:0 auto;box-sizing:border-box;'>
    {reprint_label}
    <div style='text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;'>
    <b style='font-size:16px;'>ALONZO CIGAR</b><br><b>PRE-CUENTA</b></div>
    {area_line}
    <div style='font-size:11px;'>Mesa: {table_number}{account_display}<br>Cuenta #{account_number}<br>Mesero: {order['waiter_name']}<br>Fecha: {utc_to_local_str(order['created_at'])}</div>
    <table style='width:100%;border-collapse:collapse;margin:8px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;font-size:11px;'>
    {items_html}</table>
    <table style='width:100%;font-size:11px;'>
    <tr><td>Subtotal</td><td style='text-align:right'>RD$ {subtotal:,.2f}</td></tr>
    {tax_html}
    <tr style='border:2px solid #000;'><td style='padding:4px;'><b style='font-size:13px;'>TOTAL ESTIMADO</b></td><td style='text-align:right;padding:4px;font-size:13px;'><b>RD$ {total:,.2f}</b></td></tr>
    </table>
    <div style='text-align:center;margin-top:8px;font-size:9px;border-top:1px dashed #000;padding-top:8px;'>
    La propina es voluntaria<br>Este NO es un comprobante fiscal</div></div>""",
    "print_number": print_count + 1, "is_reprint": print_count > 0}

@api.get("/print/pre-check-count/{order_id}")
async def get_pre_check_count(order_id: str):
    count = await db.pre_check_prints.count_documents({"order_id": order_id})
    return {"count": count}

@api.get("/print/receipt/{bill_id}")
async def print_receipt(bill_id: str, send_to_queue: bool = Query(default=False)):
    """Get receipt HTML. If send_to_queue=true, also adds to print queue."""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404)
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    printer_config = await db.system_config.find_one({"id": "printer_config"}, {"_id": 0}) or config
    
    biz_name = printer_config.get("business_name", "ALONZO CIGAR")
    biz_addr = printer_config.get("business_address", "C/ Las Flores #12, Jarabacoa")
    biz_rnc = printer_config.get("rnc", "1-31-75577-1")
    biz_phone = printer_config.get("phone", "809-301-3858")
    footer = printer_config.get("footer_text", "Gracias por su visita!")
    
    # If send_to_queue, add to print queue
    if send_to_queue:
        receipt_channel = await db.print_channels.find_one({"code": "receipt"}, {"_id": 0})
        printer_name = receipt_channel.get("printer_name", "") if receipt_channel else ""
        
        receipt_data = {
            "type": "receipt",
            "paper_width": 80,
            "business_name": biz_name,
            "business_address": biz_addr,
            "rnc": biz_rnc,
            "phone": biz_phone,
            "bill_number": bill.get("ncf") or bill.get("number") or bill.get("id", "")[:8],
            "table_number": bill.get("table_number", ""),
            "waiter_name": bill.get("waiter_name", ""),
            "cashier_name": bill.get("paid_by_name", ""),
            "date": utc_to_local_str(bill.get("paid_at", ""), "%Y-%m-%d %I:%M:%S %p") if bill.get("paid_at") else "",
            "items": [{"name": item.get("product_name", ""), "quantity": item.get("quantity", 1), "total": item.get("total", 0)} for item in bill.get("items", [])],
            "subtotal": bill.get("subtotal", 0),
            "itbis": bill.get("itbis", 0),
            "tip": bill.get("propina_legal", 0),
            "total": bill.get("total", 0),
            "amount_received": bill.get("amount_received", 0),
            "payment_method": bill.get("payment_method_name", "Efectivo"),
            "footer_text": footer,
            # Datos fiscales del cliente
            "ncf_type": bill.get("ncf_type", ""),
            "customer_fiscal_id": bill.get("fiscal_id", ""),
            "customer_fiscal_id_type": bill.get("fiscal_id_type", ""),
            "customer_razon_social": bill.get("razon_social", ""),
            "discount_applied": bill.get("discount_applied")
        }
        job = {"id": gen_id(), "type": "receipt", "channel": "receipt", "printer_name": printer_name, "data": receipt_data, "status": "pending", "created_at": now_iso()}
        await db.print_queue.insert_one(job)
    
    items_html = ""
    for item in bill.get("items", []):
        items_html += f"<tr><td>{item['quantity']}x {item['product_name']}</td><td style='text-align:right'>RD$ {item['total']:,.2f}</td></tr>"
    
    # Payment & change info
    payment_html = ""
    if bill.get("payment_method_name"):
        payment_html += f"<tr><td>Pagado con:</td><td style='text-align:right'>{bill.get('payment_method_name', 'Efectivo')}</td></tr>"
    amount_received = bill.get("amount_received", 0)
    if amount_received > bill["total"]:
        cambio = amount_received - bill["total"]
        payment_html += f"<tr><td>Recibido:</td><td style='text-align:right'>RD$ {amount_received:,.2f}</td></tr>"
        payment_html += f"<tr><td><b>CAMBIO:</b></td><td style='text-align:right'><b>RD$ {cambio:,.2f}</b></td></tr>"
    
    # Build address from expanded fields or fallback
    addr_parts = []
    street = config.get('ticket_address_street') or printer_config.get('business_address', '')
    building = config.get('ticket_address_building', '')
    sector = config.get('ticket_address_sector', '')
    city = config.get('ticket_address_city', '')
    if street:
        addr_parts.append(f"{street}{f', {building}' if building else ''}")
    if sector or city:
        addr_parts.append(f"{sector}{f', {city}' if city and sector else city}")
    biz_addr_line = ' | '.join(addr_parts) if addr_parts else printer_config.get('business_address', '')
    
    # Build footer messages
    footer_msgs = []
    for i in range(1, 5):
        msg = config.get(f'ticket_footer_msg{i}', '')
        if msg:
            footer_msgs.append(msg)
    if not footer_msgs:
        footer_msgs = [footer]
    
    # Build tax lines from tax_breakdown (dynamic names)
    tax_html = ""
    # Discount line in HTML receipt
    discount_info_html = bill.get("discount_applied")
    if discount_info_html and discount_info_html.get("amount", 0) > 0:
        tax_html += f"<tr style='color:#059669'><td>Desc: {discount_info_html['name']}</td><td style='text-align:right'>-RD$ {discount_info_html['amount']:,.2f}</td></tr>"
    tax_breakdown = bill.get("tax_breakdown", [])
    if tax_breakdown:
        for tax in tax_breakdown:
            tax_html += f"<tr><td>{tax['description']} {tax['rate']}%</td><td style='text-align:right'>RD$ {tax['amount']:,.2f}</td></tr>"
    else:
        tax_html += f"<tr><td>ITBIS 18%</td><td style='text-align:right'>RD$ {bill.get('itbis', 0):,.2f}</td></tr>"
        if bill.get('propina_legal', 0) > 0:
            tax_html += f"<tr><td>Propina {bill.get('propina_percentage', 10)}%</td><td style='text-align:right'>RD$ {bill.get('propina_legal', 0):,.2f}</td></tr>"
    
    footer_html = "<br>".join(f"<span>{m}</span>" for m in footer_msgs)
    
    # Build customer fiscal data - Show if fiscal_id or razon_social exists
    # Also infer NCF type from NCF string if ncf_type field is not set
    customer_fiscal_html = ""
    ncf_type = bill.get("ncf_type", "")
    ncf_str = bill.get("ncf", "")
    
    # Infer ncf_type from NCF string if not explicitly set
    if not ncf_type and ncf_str:
        if ncf_str.startswith("B01"):
            ncf_type = "B01"
        elif ncf_str.startswith("B14"):
            ncf_type = "B14"
        elif ncf_str.startswith("B15"):
            ncf_type = "B15"
        elif ncf_str.startswith("B02"):
            ncf_type = "B02"
    
    # Show fiscal data if we have fiscal_id or razon_social AND it's a fiscal invoice type
    if ncf_type in ["B01", "B14", "B15"] and (bill.get("fiscal_id") or bill.get("razon_social")):
        fiscal_id = bill.get("fiscal_id", "")
        fiscal_id_type = bill.get("fiscal_id_type", "RNC")
        razon_social = bill.get("razon_social", "")
        customer_fiscal_html = f"""<div style='background:#f5f5f5;border:1px solid #333;padding:4px;margin:4px 0;font-size:10px;'>
        <b>DATOS DEL CLIENTE</b><br>
        {fiscal_id_type}: {fiscal_id}<br>
        Razón Social: {razon_social}
        </div>"""
    
    # Factura HTML - 72mm área imprimible (papel 80mm), padding lateral 4mm
    return {"html": f"""<div style='font-family:monospace;max-width:72mm;width:72mm;padding:2mm 4mm;font-size:12px;margin:0 auto;box-sizing:border-box;'>
    <div style='text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;'>
    <b style='font-size:16px;'>{biz_name}</b><br>
    <span style='font-size:10px;font-weight:bold;'>RNC: {biz_rnc}</span><br>
    <span style='font-size:9px;'>{biz_addr_line}<br>Tel: {biz_phone}</span>
    </div>
    <div style='border-bottom:1px dashed #000;padding-bottom:4px;margin-bottom:4px;font-size:10px;'>
    <b>NCF: {bill.get('ncf', '')}</b><br>
    Valido hasta: {printer_config.get('ncf_expiry', config.get('ticket_ncf_expiry', '31/12/2026'))}</div>
    {customer_fiscal_html}
    <div style='font-size:10px;border-bottom:1px dashed #000;padding-bottom:4px;margin-bottom:4px;'>Mesa: {bill['table_number']} | Fecha: {utc_to_local_str(bill.get('paid_at', bill['created_at']))}</div>
    <table style='width:100%;border-collapse:collapse;margin:8px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;font-size:11px;'>
    {items_html}</table>
    <table style='width:100%;font-size:11px;'>
    <tr><td>Subtotal</td><td style='text-align:right'>RD$ {bill['subtotal']:,.2f}</td></tr>
    {tax_html}
    <tr><td colspan='2' style='padding:4px 0;'><div style='border:2px solid #000;text-align:center;padding:6px;'><b style='font-size:9px;'>TOTAL A PAGAR</b><br><b style='font-size:14px;'>RD$ {bill['total']:,.2f}</b></div></td></tr>
    {payment_html}
    </table>
    <div style='text-align:center;margin-top:8px;font-size:9px;border-top:1px dashed #000;padding-top:8px;'>
    {footer_html}</div></div>""", "queued": send_to_queue}

@api.get("/print/receipt-escpos/{bill_id}")
async def print_receipt_escpos(bill_id: str):
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404)
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    biz_name = config.get('business_name', 'ALONZO CIGAR')
    biz_rnc = config.get('rnc', '1-31-75577-1')
    biz_addr = config.get('business_address', 'C/ Las Flores #12, Jarabacoa')
    biz_phone = config.get('phone', '809-301-3858')
    
    lines = []
    lines.append({"type": "center", "bold": True, "size": "large", "text": biz_name})
    lines.append({"type": "center", "bold": True, "text": f"RNC: {biz_rnc}"})
    if biz_addr:
        lines.append({"type": "center", "text": biz_addr})
    lines.append({"type": "center", "text": f"Tel: {biz_phone}"})
    lines.append({"type": "divider"})
    lines.append({"type": "left", "bold": True, "text": f"NCF: {bill.get('ncf', '')}"})
    lines.append({"type": "left", "text": f"Valido hasta: {config.get('ticket_ncf_expiry', '31/12/2026')}"})
    
    # Datos fiscales del cliente - Inferir tipo de NCF si no está establecido
    ncf_type = bill.get("ncf_type", "")
    ncf_str = bill.get("ncf", "")
    
    # Infer ncf_type from NCF string if not explicitly set
    if not ncf_type and ncf_str:
        if ncf_str.startswith("B01"):
            ncf_type = "B01"
        elif ncf_str.startswith("B14"):
            ncf_type = "B14"
        elif ncf_str.startswith("B15"):
            ncf_type = "B15"
    
    if ncf_type in ["B01", "B14", "B15"] and (bill.get("fiscal_id") or bill.get("razon_social")):
        lines.append({"type": "divider"})
        lines.append({"type": "left", "bold": True, "text": "DATOS DEL CLIENTE"})
        fiscal_id_type = bill.get("fiscal_id_type", "RNC")
        lines.append({"type": "left", "text": f"{fiscal_id_type}: {bill.get('fiscal_id', '')}"})
        lines.append({"type": "left", "text": f"Razon Social: {bill.get('razon_social', '')}"})
        lines.append({"type": "divider"})
    
    lines.append({"type": "left", "text": f"Mesa: {bill['table_number']}"})
    lines.append({"type": "left", "text": f"Fecha: {utc_to_local_str(bill.get('paid_at', bill['created_at']))}"})
    if bill.get('cashier_name'):
        lines.append({"type": "left", "text": f"Cajero: {bill['cashier_name']}"})
    lines.append({"type": "divider"})
    for item in bill.get("items", []):
        lines.append({"type": "columns", "left": f"{item['quantity']}x {item['product_name']}", "right": f"RD$ {item['total']:,.2f}"})
    lines.append({"type": "divider"})
    lines.append({"type": "columns", "left": "Subtotal", "right": f"RD$ {bill['subtotal']:,.2f}"})
    # Discount line - texto plano sin acentos ni simbolos especiales
    discount_info = bill.get("discount_applied")
    if discount_info and discount_info.get("amount", 0) > 0:
        lines.append({"type": "columns", "left": f"Desc: {discount_info['name']}", "right": f"-RD$ {discount_info['amount']:,.2f}"})
    # Dynamic tax lines from tax_breakdown
    tax_breakdown = bill.get("tax_breakdown", [])
    if tax_breakdown:
        for tax in tax_breakdown:
            lines.append({"type": "columns", "left": f"{tax['description']} {tax['rate']}%", "right": f"RD$ {tax['amount']:,.2f}"})
    else:
        lines.append({"type": "columns", "left": "ITBIS 18%", "right": f"RD$ {bill.get('itbis', 0):,.2f}"})
        if bill.get('propina_legal', 0) > 0:
            lines.append({"type": "columns", "left": f"Propina {bill.get('propina_percentage', 10)}%", "right": f"RD$ {bill.get('propina_legal', 0):,.2f}"})
    lines.append({"type": "columns", "bold": True, "size": "large", "left": "TOTAL", "right": f"RD$ {bill['total']:,.2f}"})
    # Payment and change
    if bill.get('payment_method_name'):
        lines.append({"type": "left", "text": f"Pago: {bill['payment_method_name']}"})
    amount_received = bill.get("amount_received", 0)
    if amount_received > bill["total"]:
        lines.append({"type": "columns", "left": "Recibido", "right": f"RD$ {amount_received:,.2f}"})
        cambio = round(amount_received - bill["total"], 2)
        lines.append({"type": "columns", "bold": True, "left": "CAMBIO", "right": f"RD$ {cambio:,.2f}"})
    lines.append({"type": "divider"})
    # Footer messages
    for i in range(1, 5):
        msg = config.get(f'ticket_footer_msg{i}', '')
        if msg:
            lines.append({"type": "center", "text": msg})
    if not any(config.get(f'ticket_footer_msg{i}') for i in range(1, 5)):
        lines.append({"type": "center", "text": config.get('footer_text', 'Gracias por su visita!')})
    lines.append({"type": "cut"})
    return {"lines": lines}

@api.get("/print/comanda/{order_id}")
async def print_comanda(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404)
    items = [i for i in order.get("items", []) if i["status"] == "sent"]
    items_html = ""
    for item in items:
        mods = ", ".join(m["name"] for m in item.get("modifiers", []))
        mod_str = f"<br><small>  + {mods}</small>" if mods else ""
        notes_str = f"<br><small style='color:red'>  NOTA: {item['notes']}</small>" if item.get("notes") else ""
        items_html += f"<tr><td><b>{item['quantity']}x</b> {item['product_name']}{mod_str}{notes_str}</td></tr>"
    # Comanda HTML - 72mm área imprimible (papel 80mm), padding lateral 4mm
    return {"html": f"""<div style='font-family:monospace;max-width:72mm;width:72mm;padding:2mm 4mm;font-size:13px;margin:0 auto;box-sizing:border-box;'>
    <div style='text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:8px;'>
    <b style='font-size:18px;'>COMANDA</b></div>
    <div style='font-size:14px;'><b>Mesa: {order['table_number']}</b><br>Mesero: {order['waiter_name']}<br>Hora: {now_local_str()}</div>
    <table style='width:100%;margin-top:10px;border-top:1px dashed #000;'>
    {items_html}</table></div>"""}

@api.get("/print/comanda-escpos/{order_id}")
async def print_comanda_escpos(order_id: str):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404)
    items = [i for i in order.get("items", []) if i["status"] == "sent"]
    lines = []
    lines.append({"type": "center", "bold": True, "size": "large", "text": "COMANDA"})
    lines.append({"type": "divider"})
    lines.append({"type": "left", "bold": True, "size": "large", "text": f"Mesa: {order['table_number']}"})
    lines.append({"type": "left", "text": f"Mesero: {order['waiter_name']}"})
    lines.append({"type": "left", "text": f"Hora: {now_local_str()}"})
    lines.append({"type": "divider"})
    for item in items:
        lines.append({"type": "left", "bold": True, "text": f"{item['quantity']}x {item['product_name']}"})
        for mod in item.get("modifiers", []):
            lines.append({"type": "left", "text": f"  + {mod['name']}"})
        if item.get("notes"):
            lines.append({"type": "left", "text": f"  NOTA: {item['notes']}"})
    lines.append({"type": "divider"})
    lines.append({"type": "cut"})
    return {"lines": lines}

# ─── SEED ───
@api.post("/seed")
async def seed_data():
    count = await db.users.count_documents({})
    if count > 0:
        return {"message": "Datos ya sembrados", "seeded": False}

    users = [
        {"id": gen_id(), "name": "Admin", "pin_hash": hash_pin("10000"), "role": "admin", "active": True, "permissions": {}},
        {"id": gen_id(), "name": "Carlos", "pin_hash": hash_pin("1234"), "role": "waiter", "active": True, "permissions": {}},
        {"id": gen_id(), "name": "Maria", "pin_hash": hash_pin("5678"), "role": "waiter", "active": True, "permissions": {}},
        {"id": gen_id(), "name": "Luis", "pin_hash": hash_pin("4321"), "role": "cashier", "active": True, "permissions": {}},
        {"id": gen_id(), "name": "Chef Pedro", "pin_hash": hash_pin("9999"), "role": "kitchen", "active": True, "permissions": {}},
    ]
    await db.users.insert_many(users)

    areas = [
        {"id": gen_id(), "name": "Salon Principal", "color": "#FF6600", "order": 0},
        {"id": gen_id(), "name": "Terraza", "color": "#4CAF50", "order": 1},
    ]
    await db.areas.insert_many(areas)

    categories = [
        {"id": gen_id(), "name": "Entradas", "color": "#FF6600", "icon": "utensils", "order": 0},
        {"id": gen_id(), "name": "Platos Fuertes", "color": "#E53935", "icon": "beef", "order": 1},
        {"id": gen_id(), "name": "Bebidas", "color": "#1E88E5", "icon": "glass-water", "order": 2},
        {"id": gen_id(), "name": "Postres", "color": "#8E24AA", "icon": "cake-slice", "order": 3},
    ]
    await db.categories.insert_many(categories)

    products = [
        {"id": gen_id(), "name": "Tostones", "category_id": categories[0]["id"], "price": 150, "active": True},
        {"id": gen_id(), "name": "Empanadas (3)", "category_id": categories[0]["id"], "price": 200, "active": True},
        {"id": gen_id(), "name": "Churrasco", "category_id": categories[1]["id"], "price": 850, "active": True},
        {"id": gen_id(), "name": "Pollo al Carbon", "category_id": categories[1]["id"], "price": 550, "active": True},
        {"id": gen_id(), "name": "Mofongo", "category_id": categories[1]["id"], "price": 450, "active": True},
        {"id": gen_id(), "name": "Coca Cola", "category_id": categories[2]["id"], "price": 100, "active": True},
        {"id": gen_id(), "name": "Presidente", "category_id": categories[2]["id"], "price": 150, "active": True},
        {"id": gen_id(), "name": "Flan", "category_id": categories[3]["id"], "price": 180, "active": True},
    ]
    await db.products.insert_many(products)

    tables = []
    for i in range(1, 7):
        tables.append({
            "id": gen_id(), "number": i, "area_id": areas[0]["id"],
            "capacity": 4, "shape": "round",
            "x": 50 + ((i-1) % 3) * 120, "y": 50 + ((i-1) // 3) * 120,
            "width": 80, "height": 80, "status": "free", "active_order_id": None
        })
    await db.tables.insert_many(tables)

    return {"message": "Datos sembrados exitosamente", "seeded": True}

# ─── FACTORY RESET (Admin Only) ───
class FactoryResetRequest(BaseModel):
    reset_sales: bool = False
    reset_inventory: bool = False
    reset_users: bool = False
    admin_pin: str  # For confirmation

@api.post("/system/factory-reset")
async def factory_reset(request: FactoryResetRequest):
    """
    Reset system data to factory defaults. Admin only.
    - reset_sales: Clears orders, bills, shifts, audit logs
    - reset_inventory: Clears stock movements, purchase orders, inventory transactions
    - reset_users: Removes all users except Admin, sets Admin PIN to 11331744
    """
    # Verify admin PIN
    admin_user = await db.users.find_one({"role": "admin", "name": "Admin"}, {"_id": 0})
    if not admin_user:
        raise HTTPException(status_code=403, detail="Usuario Admin no encontrado")
    
    if admin_user.get("pin_hash") != hash_pin(request.admin_pin):
        raise HTTPException(status_code=403, detail="PIN de administrador incorrecto")
    
    reset_details = []
    collections_cleared = []
    
    try:
        # Reset Sales History
        if request.reset_sales:
            # Clear orders
            orders_count = await db.orders.count_documents({})
            await db.orders.delete_many({})
            collections_cleared.append(f"orders ({orders_count})")
            
            # Clear bills
            bills_count = await db.bills.count_documents({})
            await db.bills.delete_many({})
            collections_cleared.append(f"bills ({bills_count})")
            
            # Clear shifts
            shifts_count = await db.shifts.count_documents({})
            await db.shifts.delete_many({})
            collections_cleared.append(f"shifts ({shifts_count})")
            
            # Clear print queue
            print_count = await db.print_queue.count_documents({})
            await db.print_queue.delete_many({})
            collections_cleared.append(f"print_queue ({print_count})")
            
            # Update all tables to 'free' status
            await db.tables.update_many({}, {"$set": {"status": "free", "active_order_id": None}})
            
            reset_details.append("Historial de Ventas eliminado")
        
        # Reset Inventory Data
        if request.reset_inventory:
            # Clear stock movements
            movements_count = await db.stock_movements.count_documents({})
            await db.stock_movements.delete_many({})
            collections_cleared.append(f"stock_movements ({movements_count})")
            
            # Clear purchase orders
            po_count = await db.purchase_orders.count_documents({})
            await db.purchase_orders.delete_many({})
            collections_cleared.append(f"purchase_orders ({po_count})")
            
            # Clear inventory transactions
            inv_count = await db.inventory_transactions.count_documents({})
            await db.inventory_transactions.delete_many({})
            collections_cleared.append(f"inventory_transactions ({inv_count})")
            
            # Reset all ingredient stock to 0
            await db.ingredients.update_many({}, {"$set": {"current_stock": 0, "last_cost": 0}})
            
            reset_details.append("Datos de Inventario eliminados")
        
        # Reset Users
        if request.reset_users:
            # Get current user count
            users_count = await db.users.count_documents({})
            
            # Delete all users except Admin
            await db.users.delete_many({"name": {"$ne": "Admin"}})
            
            # Reset Admin PIN to factory default: 11331744
            await db.users.update_one(
                {"name": "Admin"},
                {"$set": {
                    "pin_hash": hash_pin("11331744"),
                    "role": "admin",
                    "active": True,
                    "permissions": {}
                }}
            )
            
            deleted_count = users_count - 1  # All except Admin
            collections_cleared.append(f"users ({deleted_count} eliminados, Admin conservado)")
            reset_details.append("Usuarios eliminados (Admin reiniciado con PIN: 11331744)")
        
        # Log to Audit Trail
        audit_log = {
            "id": gen_id(),
            "type": "factory_reset",
            "action": "RESET DE FÁBRICA",
            "details": {
                "reset_sales": request.reset_sales,
                "reset_inventory": request.reset_inventory,
                "reset_users": request.reset_users,
                "collections_cleared": collections_cleared,
                "reset_summary": reset_details
            },
            "performed_by": "Admin",
            "performed_at": now_iso(),
            "ip_address": "system"
        }
        await db.audit_logs.insert_one(audit_log)
        
        logging.warning(f"FACTORY RESET EXECUTED: {reset_details}")
        
        return {
            "success": True,
            "message": "Reset de fábrica completado exitosamente",
            "details": reset_details,
            "collections_cleared": collections_cleared,
            "timestamp": now_iso(),
            "admin_pin_reset": "11331744" if request.reset_users else None
        }
        
    except Exception as e:
        logging.error(f"Factory reset failed: {e}")
        raise HTTPException(status_code=500, detail=f"Error durante el reset: {str(e)}")


# ─── SELECTIVE CLEANUP ───
@api.post("/system/selective-cleanup")
async def selective_cleanup(input: dict, user: dict = Depends(get_current_user)):
    """Selective data cleanup — users, products, config are NEVER deleted"""
    collections = input.get("collections", [])
    if not collections:
        raise HTTPException(status_code=400, detail="No hay colecciones seleccionadas")
    
    total_deleted = 0
    
    COLLECTION_MAP = {
        "bills": ["bills"],
        "orders": ["orders"],
        "business_days": ["business_days"],
        "attendance": ["attendance", "time_logs"],
        "reservations": ["reservations"],
        "print_queue": ["print_queue"],
        "audit_logs": ["system_audit_logs", "ecf_logs", "audit_logs", "void_audit_logs"],
        "stock_movements": ["stock_movements"],
    }
    
    for key in collections:
        if key in COLLECTION_MAP:
            for col_name in COLLECTION_MAP[key]:
                try:
                    result = await db[col_name].delete_many({})
                    total_deleted += result.deleted_count
                except:
                    pass
        
        elif key == "pos_sessions":
            # Clear Supabase pos_sessions
            try:
                from supabase import create_client as sc
                sb = sc(os.environ.get("SUPABASE_URL",""), os.environ.get("SUPABASE_ANON_KEY",""))
                sb.table("pos_sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
                total_deleted += 1
            except:
                pass
        
        elif key == "ncf_reset":
            # Reset NCF sequences to 0
            try:
                from supabase import create_client as sc
                sb = sc(os.environ.get("SUPABASE_URL",""), os.environ.get("SUPABASE_ANON_KEY",""))
                seqs = sb.table("ncf_sequences").select("id").execute()
                for seq in seqs.data:
                    sb.table("ncf_sequences").update({"current_number": 0}).eq("id", seq["id"]).execute()
                # Also reset MongoDB ecf_sequences
                await db.ecf_sequences.delete_many({})
                total_deleted += len(seqs.data)
            except:
                pass
    
    # Reset tables to free if orders were deleted
    if "orders" in collections:
        await db.tables.update_many({}, {"$set": {"status": "free", "active_order_id": None}})
    
    return {"ok": True, "deleted": total_deleted, "collections": collections}


# ═══════════════════════════════════════════════════════════════
# SYSTEM ERROR LOGS
# ═══════════════════════════════════════════════════════════════

@api.get("/system-logs")
async def get_system_logs(
    limit: int = 50,
    module: str = None,
    level: str = None,
    resolved: bool = None,
    user: dict = Depends(get_current_user)
):
    """Get system error logs. Requires admin or supervisor role."""
    if user.get("role") not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    from routers.system_logs import get_recent_logs
    logs = await get_recent_logs(
        limit=min(limit, 200),
        module=module,
        level=level,
        resolved=resolved
    )
    return {"logs": logs, "count": len(logs)}


@api.get("/system-logs/stats")
async def get_system_logs_stats(user: dict = Depends(get_current_user)):
    """Get statistics about system logs"""
    if user.get("role") not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    from routers.system_logs import get_log_stats
    return await get_log_stats()


@api.put("/system-logs/{log_id}/resolve")
async def resolve_system_log(log_id: str, input: dict, user: dict = Depends(get_current_user)):
    """Mark a system log as resolved"""
    if user.get("role") not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    from routers.system_logs import resolve_log
    notes = input.get("notes", "")
    success = await resolve_log(log_id, user.get("name", "Unknown"), notes)
    if not success:
        raise HTTPException(status_code=404, detail="Log no encontrado")
    return {"ok": True}


@api.delete("/system-logs/cleanup")
async def cleanup_system_logs(days: int = 30, user: dict = Depends(get_current_user)):
    """Delete old resolved logs"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo admin puede limpiar logs")
    
    from routers.system_logs import delete_old_logs
    deleted = await delete_old_logs(days)
    return {"ok": True, "deleted": deleted}


# ─── SCHEDULER ───
async def scheduled_stock_alert_job():
    logging.info("Running scheduled stock alert check...")
    try:
        await check_low_stock_alerts(send_email=True)
        logging.info("Stock alert check completed")
    except Exception as e:
        logging.error(f"Stock alert check failed: {e}")

async def update_scheduler_from_config():
    config = await db.system_config.find_one({"id": "stock_alerts"}, {"_id": 0})
    if not config or not config.get("enabled"):
        if scheduler.get_job("stock_alert"):
            scheduler.remove_job("stock_alert")
            logging.info("Stock alert job removed (disabled)")
        return
    
    schedule_time = config.get("schedule_time", "08:00")
    try:
        hour, minute = map(int, schedule_time.split(":"))
    except:
        hour, minute = 8, 0
    
    if scheduler.get_job("stock_alert"):
        scheduler.remove_job("stock_alert")
    
    scheduler.add_job(
        scheduled_stock_alert_job,
        CronTrigger(hour=hour, minute=minute),
        id="stock_alert",
        replace_existing=True
    )
    logging.info(f"Stock alert scheduled for {hour:02d}:{minute:02d}")

@api.post("/inventory/alert-config/schedule")
async def update_alert_schedule():
    await update_scheduler_from_config()
    return {"ok": True, "message": "Scheduler actualizado"}

# ─── e-CF AUTO-RETRY SCHEDULER ───
async def ecf_auto_retry_job():
    """Automatically retry all CONTINGENCIA e-CF bills via the active provider"""
    config = await db.system_config.find_one({}, {"_id": 0})
    if not config or not config.get("ecf_auto_retry"):
        return
    
    bills = await db.bills.find({"ecf_status": "CONTINGENCIA"}, {"_id": 0, "id": 1}).to_list(100)
    if not bills:
        return
    
    provider = config.get("ecf_provider", "alanube")
    logging.info(f"e-CF auto-retry: {len(bills)} bills in CONTINGENCIA (provider: {provider})")
    import random
    
    success = 0
    for bill_doc in bills:
        bill = await db.bills.find_one({"id": bill_doc["id"]}, {"_id": 0})
        if not bill:
            continue
        ecf_type = bill.get("ecf_type", "E32")
        ecf_prefix = ecf_type if ecf_type.startswith("E") else "E32"
        encf = f"{ecf_prefix}{random.randint(1000000000, 9999999999)}"
        
        if provider == "thefactory":
            from routers.thefactory import (
                authenticate, build_thefactory_payload, send_to_thefactory,
                save_thefactory_response, log_ecf_attempt as tf_log
            )
            auth = await authenticate()
            if not auth["ok"]:
                continue
            payload = build_thefactory_payload(bill, config, encf, auth["token"])
            result = await send_to_thefactory(payload)
            await save_thefactory_response(bill_doc["id"], result, encf)
            await tf_log(bill_doc["id"], encf, "auto-retry", result)
        else:
            from routers.alanube import build_alanube_payload, send_to_alanube, save_alanube_response, log_ecf_attempt
            payload = build_alanube_payload(bill, config, encf)
            result = await send_to_alanube(payload)
            await save_alanube_response(bill_doc["id"], result)
            await log_ecf_attempt(bill_doc["id"], encf, "auto-retry", result)
        
        if result.get("ok"):
            success += 1
    
    logging.info(f"e-CF auto-retry complete: {success}/{len(bills)} successful")

# Start e-CF retry scheduler (every 5 minutes)
scheduler.add_job(
    ecf_auto_retry_job,
    'interval',
    minutes=5,
    id="ecf_auto_retry",
    replace_existing=True
)

@api.get("/inventory/scheduler-status")
async def get_scheduler_status():
    job = scheduler.get_job("stock_alert")
    if job:
        next_run = job.next_run_time.isoformat() if job.next_run_time else None
        return {
            "active": True,
            "job_id": job.id,
            "next_run": next_run
        }
    return {"active": False, "job_id": None, "next_run": None}

# ─── PRINT QUEUE (Cola de Impresión para Agente USB) ───
@api.get("/print-queue/pending")
async def get_pending_print_jobs():
    """Obtiene trabajos de impresión pendientes — atomically claims to prevent duplicates"""
    jobs = await db.print_queue.find(
        {"status": "pending"},
        {"_id": 0}
    ).sort("created_at", 1).to_list(10)
    
    claimed = []
    for job in jobs:
        result = await db.print_queue.find_one_and_update(
            {"id": job["id"], "status": "pending"},
            {"$set": {"status": "claimed", "claimed_at": now_iso()}},
        )
        if result:
            job["status"] = "claimed"
            claimed.append(job)
    
    return claimed

@api.post("/print-queue")
async def add_print_job(input: dict):
    """Agrega un trabajo a la cola de impresión"""
    job = {
        "id": gen_id(),
        "type": input.get("type", "receipt"),  # receipt, comanda, pre-check
        "reference_id": input.get("reference_id", ""),
        "channel_id": input.get("channel_id", ""),
        "commands": input.get("commands", []),
        "status": "pending",
        "created_at": now_iso(),
        "printed_at": None
    }
    await db.print_queue.insert_one(job)
    return {k: v for k, v in job.items() if k != "_id"}

@api.post("/print-queue/{job_id}/complete")
async def complete_print_job(job_id: str, input: dict):
    """Marca un trabajo como completado"""
    success = input.get("success", True)
    status = "completed" if success else "failed"
    await db.print_queue.update_one(
        {"id": job_id},
        {"$set": {"status": status, "printed_at": now_iso()}}
    )
    return {"ok": True}

@api.delete("/print-queue/clear")
async def clear_print_queue():
    """Limpia trabajos completados de la cola"""
    result = await db.print_queue.delete_many({"status": {"$in": ["completed", "failed"]}})
    return {"deleted": result.deleted_count}



@api.post("/print/report-shift")
async def print_shift_report(input: dict, user=Depends(get_current_user)):
    """Imprime el reporte X o Z directamente en la impresora térmica"""
    report = input.get("report")
    detailed = input.get("detailed", True)
    report_type = input.get("type", "X")  # X = turno, Z = dia
    
    if not report:
        raise HTTPException(status_code=400, detail="Faltan datos del reporte")
    
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    biz_name = config.get("business_name", "")
    
    # Construir comandos ESC/POS
    commands = []
    
    def add_text(text, align="left", bold=False, size=1):
        commands.append({"type": "text", "text": text, "align": align, "bold": bold, "size": size})
    
    def add_cols(left, right, bold=False):
        commands.append({"type": "columns", "left": left, "right": right, "bold": bold})
    
    def add_divider():
        commands.append({"type": "divider"})
    
    def add_feed(lines=1):
        commands.append({"type": "feed", "lines": lines})
    
    def fmt(val):
        try:
            return f"RD$ {float(val or 0):,.2f}"
        except:
            return "RD$ 0.00"
    
    session = report.get("session", {})
    sales = report.get("sales_summary", {})
    payments = report.get("payment_totals", {})
    breakdown = report.get("payment_breakdown", [])
    cash_rec = report.get("cash_reconciliation", {})
    voids = report.get("voids", {})
    categories = report.get("sales_by_category", [])
    
    # ═══ ENCABEZADO ═══
    if biz_name:
        add_text(biz_name, "center", True, 2)
    title = "CIERRE DE TURNO" if report_type == "X" else "CIERRE DE DIA"
    if not detailed:
        title = "CIERRE DE CAJA"
    add_text(title, "center", True, 2)
    add_text(session.get("ref", ""), "center")
    add_divider()
    add_cols("Cajero:", session.get("opened_by", "-"))
    add_cols("Terminal:", session.get("terminal", "-"))
    add_cols("Fecha:", report.get("business_date", "-"))
    
    from datetime import datetime as dt_parse
    def fmt_dt(d):
        if not d: return "-"
        try:
            return utc_to_local_str(d, "%d/%m/%Y %I:%M %p")
        except:
            return str(d)[:19]
    
    add_cols("Apertura:", fmt_dt(session.get("opened_at")))
    if session.get("closed_at"):
        add_cols("Cierre:", fmt_dt(session.get("closed_at")))
    add_divider()
    
    # ═══ PRODUCTOS (solo detallado) ═══
    if detailed and categories:
        add_text("PRODUCTOS", "left", True)
        for c in categories:
            cat_name = c.get("category") or c.get("category_name") or "Otros"
            add_cols(f"{cat_name} ({c.get('quantity', 0)})", fmt(c.get("subtotal", 0)))
        prod_total = sum(c.get("subtotal", 0) for c in categories)
        add_cols("Total Productos:", fmt(prod_total), True)
        add_divider()
    
    # ═══ DEVOLUCIONES ═══
    if voids.get("count", 0) > 0:
        add_text("DEVOLUCIONES", "left", True)
        if detailed and voids.get("list"):
            for v in voids["list"]:
                reason = v.get("reason") or "Sin razon"
                add_cols(f"{reason} ({v.get('count', 1)})", f"-{fmt(v.get('total', 0))}")
        else:
            add_cols(f"Total ({voids['count']})", f"-{fmt(voids.get('total', 0))}")
        add_divider()
    
    # ═══ DESCUENTOS ═══
    discounts = report.get("discounts", {})
    if discounts.get("count", 0) > 0:
        add_text("DESCUENTOS", "left", True)
        add_cols(f"Total ({discounts['count']})", f"-{fmt(discounts.get('total', 0))}")
        add_divider()
    
    # ═══ VENTAS ═══
    if detailed:
        add_text("VENTAS", "left", True)
        add_cols("Subtotal:", fmt(sales.get("subtotal")))
        add_cols("ITBIS:", fmt(sales.get("itbis")))
        add_cols("Propina Legal:", fmt(sales.get("propina")))
        add_cols("TOTAL:", fmt(sales.get("total")), True)
        add_cols("Facturas:", str(sales.get("invoices_count", 0)))
        if sales.get("avg_per_invoice", 0) > 0:
            add_cols("Promedio/Factura:", fmt(sales.get("avg_per_invoice")))
    else:
        add_cols("Facturas:", str(sales.get("invoices_count", 0)))
        add_cols("Total Ventas:", fmt(sales.get("total")), True)
    add_divider()
    
    # ═══ FORMAS DE PAGO ═══
    add_text("FORMAS DE PAGO", "left", True)
    if detailed and breakdown:
        for p in breakdown:
            add_cols(f"{p['method']} ({p.get('count', 0)}):", fmt(p.get("amount")))
    else:
        add_cols("Efectivo:", fmt(payments.get("efectivo")))
        add_cols("Tarjeta:", fmt(payments.get("tarjeta")))
        add_cols("Transferencia:", fmt(payments.get("transferencia")))
    add_divider()
    
    # ═══ FLUJO DE CAJA (solo detallado) ═══
    if detailed:
        add_text("FLUJO DE CAJA", "left", True)
        add_cols("Fondo Inicial:", fmt(cash_rec.get("initial_fund")))
        add_cols("+ Ventas Efectivo:", fmt(cash_rec.get("cash_sales")))
        add_cols("+ Depositos:", fmt(cash_rec.get("deposits")))
        add_cols("- Retiros:", f"-{fmt(cash_rec.get('withdrawals'))}")
        add_cols("TOTAL A ENTREGAR:", fmt(cash_rec.get("total_to_deliver")), True)
        add_divider()
    
    # ═══ DECLARACION ═══
    if (cash_rec.get("cash_declared") or 0) > 0 or (cash_rec.get("expected_cash") or 0) > 0:
        add_text("DECLARACION", "left", True)
        add_cols("Esperado:", fmt(cash_rec.get("expected_cash")))
        add_cols("Declarado:", fmt(cash_rec.get("cash_declared")))
        diff = cash_rec.get("difference", 0) or 0
        sign = "+" if diff > 0 else ""
        add_cols("Diferencia:", f"{sign}{fmt(diff)}", True)
        add_divider()
    
    # ═══ TOTAL GENERAL ═══
    add_cols("TOTAL GENERAL:", fmt(sales.get("total")), True)
    add_feed(1)
    add_text("--- Fin de Reporte ---", "center")
    add_feed(3)
    commands.append({"type": "cut"})
    
    # Enviar a cola de impresión
    receipt_channel = await db.print_channels.find_one({"code": "receipt"}, {"_id": 0})
    printer_name = receipt_channel.get("printer_name", "") if receipt_channel else ""
    
    job = {
        "id": gen_id(),
        "type": "report",
        "channel": "receipt",
        "printer_name": printer_name,
        "data": {
            "type": "report",
            "paper_width": 80,
            "commands": commands
        },
        "commands": commands,
        "status": "pending",
        "created_at": now_iso()
    }
    await db.print_queue.insert_one(job)
    
    return {"ok": True, "job_id": job["id"]}


# ─── PRINT QUEUE ENDPOINTS FOR AGENT ───
@api.get("/print/config")
async def get_print_config():
    """Get printer configuration for the print agent — maps channels to IPs"""
    channels = await db.print_channels.find({"active": True}, {"_id": 0}).to_list(50)
    return {
        "channels": [{
            "code": c.get("code", ""),
            "name": c.get("name", ""),
            "printer_name": c.get("printer_name", ""),
            "ip_address": c.get("ip_address", c.get("ip", "")),
        } for c in channels]
    }

@api.get("/print/queue")
async def get_print_queue():
    """Get pending print jobs — atomically claims them to prevent duplicates"""
    jobs = await db.print_queue.find(
        {"status": "pending"},
        {"_id": 0}
    ).sort("created_at", 1).to_list(20)
    
    # Atomically claim each job
    claimed = []
    for job in jobs:
        result = await db.print_queue.find_one_and_update(
            {"id": job["id"], "status": "pending"},
            {"$set": {"status": "claimed", "claimed_at": now_iso()}},
        )
        if result:
            job["status"] = "claimed"
            claimed.append(job)
    
    return claimed

@api.post("/print/queue")
async def add_to_print_queue(input: dict):
    """Add a job to the print queue"""
    job = {
        "id": gen_id(),
        "type": input.get("type", "receipt"),
        "channel": input.get("channel", "receipt"),
        "printer_name": input.get("printer_name", ""),
        "data": input.get("data", {}),
        "status": "pending",
        "created_at": now_iso()
    }
    await db.print_queue.insert_one(job)
    return {k: v for k, v in job.items() if k != "_id"}

@api.get("/print/jobs/{job_id}")
async def get_print_job(job_id: str):
    """Get a specific print job"""
    job = await db.print_queue.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@api.delete("/print/jobs/{job_id}")
async def delete_print_job(job_id: str):
    """Delete a print job (called by agent after printing)"""
    await db.print_queue.delete_one({"id": job_id})
    return {"ok": True}


@api.post("/print/jobs/{job_id}/error")
async def report_print_error(job_id: str, input: dict):
    """Report a print error from the agent"""
    error_message = input.get("error", "Error desconocido")
    
    # Update job with error
    await db.print_queue.update_one(
        {"id": job_id},
        {"$set": {
            "status": "failed",
            "error": error_message,
            "failed_at": now_iso()
        }}
    )
    
    # Store error in print_errors collection for notifications
    await db.print_errors.insert_one({
        "id": gen_id(),
        "job_id": job_id,
        "error": error_message,
        "created_at": now_iso(),
        "acknowledged": False
    })
    
    return {"ok": True}


@api.get("/print/errors")
async def get_print_errors():
    """Get recent unacknowledged print errors"""
    errors = await db.print_errors.find(
        {"acknowledged": False},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    return errors


@api.post("/print/errors/{error_id}/acknowledge")
async def acknowledge_print_error(error_id: str):
    """Mark a print error as acknowledged"""
    await db.print_errors.update_one(
        {"id": error_id},
        {"$set": {"acknowledged": True}}
    )
    return {"ok": True}


@api.get("/print/status")
async def get_print_status():
    """Get overall print system status"""
    pending = await db.print_queue.count_documents({"status": "pending"})
    failed = await db.print_queue.count_documents({"status": "failed"})
    errors = await db.print_errors.count_documents({"acknowledged": False})
    
    channels = await db.print_channels.find({"active": True}, {"_id": 0}).to_list(10)
    
    return {
        "pending_jobs": pending,
        "failed_jobs": failed,
        "unacknowledged_errors": errors,
        "channels": [
            {
                "code": ch.get("code"),
                "name": ch.get("name"),
                "printer_name": ch.get("printer_name", ""),
                "configured": bool(ch.get("printer_name"))
            }
            for ch in channels
        ]
    }


# ─── SEND RECEIPT TO PRINT QUEUE (80mm Format) ───
@api.post("/print/send-receipt/{bill_id}")
async def send_receipt_to_queue(bill_id: str):
    """Send a formatted receipt to the print queue using ESC/POS commands"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    biz_name = config.get('business_name', 'ALONZO CIGAR')
    biz_rnc = config.get('rnc', '1-31-75577-1')
    biz_addr = config.get('business_address', 'C/ Las Flores #12, Jarabacoa')
    biz_phone = config.get('phone', '809-301-3858')
    
    receipt_channel = await db.print_channels.find_one({"code": "receipt"}, {"_id": 0})
    printer_name = receipt_channel.get("printer_name", "") if receipt_channel else ""
    printer_target = receipt_channel.get("printer_target", "usb") if receipt_channel else "usb"
    printer_ip = receipt_channel.get("printer_ip", "") if receipt_channel else ""
    copies = receipt_channel.get("copies", 1) if receipt_channel else 1
    
    # Construir comandos ESC/POS (igual que print_receipt_escpos)
    commands = []
    commands.append({"type": "center", "bold": True, "size": "large", "text": biz_name})
    commands.append({"type": "center", "bold": True, "text": f"RNC: {biz_rnc}"})
    if biz_addr:
        commands.append({"type": "center", "text": biz_addr})
    commands.append({"type": "center", "text": f"Tel: {biz_phone}"})
    commands.append({"type": "divider"})
    commands.append({"type": "center", "bold": True, "text": "COMPROBANTE FISCAL"})
    commands.append({"type": "center", "bold": True, "text": bill.get('ncf', '')})
    commands.append({"type": "center", "text": f"Valido hasta: {config.get('ticket_ncf_expiry', '31/12/2026')}"})
    commands.append({"type": "divider"})
    
    # Datos fiscales del cliente - Inferir tipo de NCF si no está establecido
    ncf_type = bill.get("ncf_type", "")
    ncf_str = bill.get("ncf", "")
    if not ncf_type and ncf_str:
        if ncf_str.startswith("B01"):
            ncf_type = "B01"
        elif ncf_str.startswith("B14"):
            ncf_type = "B14"
        elif ncf_str.startswith("B15"):
            ncf_type = "B15"
    
    if ncf_type in ["B01", "B14", "B15"] and (bill.get("fiscal_id") or bill.get("razon_social")):
        commands.append({"type": "left", "bold": True, "text": "DATOS DEL CLIENTE"})
        fiscal_id_type = bill.get("fiscal_id_type", "RNC")
        commands.append({"type": "left", "text": f"{fiscal_id_type}: {bill.get('fiscal_id', '')}"})
        commands.append({"type": "left", "text": f"Razon Social: {bill.get('razon_social', '')}"})
        commands.append({"type": "divider"})
    
    commands.append({"type": "left", "text": f"Mesa: {bill['table_number']}"})
    commands.append({"type": "left", "text": f"Fecha: {utc_to_local_str(bill.get('paid_at', bill['created_at']))}"})
    if bill.get('waiter_name'):
        commands.append({"type": "left", "text": f"Mesero: {bill['waiter_name']}"})
    if bill.get('paid_by_name'):
        commands.append({"type": "left", "text": f"Cajero: {bill['paid_by_name']}"})
    if bill.get('transaction_number'):
        commands.append({"type": "left", "text": f"Transaccion: #{bill['transaction_number']}"})
    commands.append({"type": "divider"})
    
    # Items
    for item in bill.get("items", []):
        qty = item.get('quantity', 1)
        qty_str = str(int(qty)) if qty == int(qty) else str(qty)
        commands.append({"type": "columns", "left": f"{qty_str} X {item['product_name']}", "right": f"RD$ {item['total']:,.2f}"})
    
    commands.append({"type": "divider"})
    commands.append({"type": "columns", "left": "Subtotal", "right": f"RD$ {bill['subtotal']:,.2f}"})
    
    # Discount line (if applied)
    discount_info = bill.get("discount_applied")
    if discount_info and discount_info.get("amount", 0) > 0:
        commands.append({"type": "columns", "left": f"Desc: {discount_info['name']}", "right": f"-RD$ {discount_info['amount']:,.2f}"})
    
    # Dynamic tax lines from tax_breakdown
    tax_breakdown = bill.get("tax_breakdown", [])
    if tax_breakdown:
        for tax in tax_breakdown:
            commands.append({"type": "columns", "left": f"{tax['description']} {tax['rate']}%", "right": f"RD$ {tax['amount']:,.2f}"})
    else:
        commands.append({"type": "columns", "left": "ITBIS 18%", "right": f"RD$ {bill.get('itbis', 0):,.2f}"})
        if bill.get('propina_legal', 0) > 0:
            commands.append({"type": "columns", "left": f"Propina Legal {bill.get('propina_percentage', 10)}%", "right": f"RD$ {bill.get('propina_legal', 0):,.2f}"})
    
    commands.append({"type": "divider"})
    commands.append({"type": "center", "text": "================================"})
    commands.append({"type": "center", "bold": True, "text": "TOTAL A PAGAR"})
    commands.append({"type": "center", "bold": True, "size": "large", "text": f"RD$ {bill['total']:,.2f}"})
    commands.append({"type": "center", "text": "================================"})
    
    # Payment and change
    if bill.get('payment_method_name'):
        commands.append({"type": "columns", "left": f"Recibido {bill['payment_method_name']}:", "right": f"RD$ {bill.get('amount_received', bill['total']):,.2f}"})
    
    amount_received = bill.get("amount_received", 0)
    if amount_received > bill["total"]:
        cambio = round(amount_received - bill["total"], 2)
        commands.append({"type": "columns", "bold": True, "left": "CAMBIO:", "right": f"RD$ {cambio:,.2f}"})
    
    commands.append({"type": "divider"})
    
    # Footer messages
    for i in range(1, 5):
        msg = config.get(f'ticket_footer_msg{i}', '')
        if msg:
            commands.append({"type": "center", "text": msg})
    if not any(config.get(f'ticket_footer_msg{i}') for i in range(1, 5)):
        commands.append({"type": "center", "text": config.get('footer_text', 'Gracias por su visita!')})
    
    commands.append({"type": "feed", "lines": 2})
    commands.append({"type": "cut"})
    
    job = {
        "id": gen_id(),
        "type": "receipt",
        "channel": "receipt",
        "printer_name": printer_name,
        "printer_target": printer_target,
        "printer_ip": printer_ip,
        "copies": copies,
        "commands": commands,
        "status": "pending",
        "created_at": now_iso()
    }
    await db.print_queue.insert_one(job)
    return {k: v for k, v in job.items() if k != "_id"}


# ─── SEND COMANDA TO PRINT QUEUE ───
@api.post("/print/send-comanda/{order_id}")
async def send_comanda_to_queue(order_id: str):
    """
    Send kitchen order (comanda) to print queue, with CONTENT FILTERING by channel.
    
    Content Filtering Logic:
    - Each channel (Cocina, Bar, etc.) only receives items assigned to it
    - Products can be assigned to multiple channels (combos)
    - If no items for a channel, no ticket is generated (paper optimization)
    - Receipt channel is NOT used here - it shows full bill via /print/send-receipt
    
    Priority for channel assignment:
    1. Product's print_channels array (if defined)
    2. Category's channel mapping (fallback)
    3. Default 'kitchen' channel (last resort)
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    # Get channels and category mappings
    channels = await db.print_channels.find({"active": True}, {"_id": 0}).to_list(20)
    category_mappings = await db.category_channels.find({}, {"_id": 0}).to_list(100)
    cat_to_channel = {m["category_id"]: m["channel_code"] for m in category_mappings}
    
    # Get products to determine categories AND product-level print_channels
    products = await db.products.find({}, {"_id": 0, "id": 1, "name": 1, "category_id": 1, "print_channels": 1}).to_list(500)
    prod_map = {p["id"]: p for p in products}
    
    # ═══════════════════════════════════════════════════════════════════════════════
    # CONTENT FILTERING: Group items by their assigned channel(s)
    # Each item goes ONLY to its designated channel(s), not to all channels
    # ═══════════════════════════════════════════════════════════════════════════════
    items_by_channel = {}
    pending_items = [i for i in order.get("items", []) if i.get("status") == "pending" or i.get("sent_to_kitchen")]
    
    for item in pending_items:
        prod_id = item.get("product_id", "")
        product = prod_map.get(prod_id, {})
        
        # Determine target channels for THIS specific product
        product_channels = product.get("print_channels", [])
        
        if product_channels and len(product_channels) > 0:
            # Product has specific channels assigned (supports multi-channel for combos)
            target_channels = product_channels
        else:
            # Fall back to category's channel mapping
            cat_id = product.get("category_id", "")
            channel_code = cat_to_channel.get(cat_id, "kitchen")
            target_channels = [channel_code]
        
        # Add item ONLY to its target channel(s)
        # This ensures Cocina only gets Cocina items, Bar only gets Bar items
        for channel_code in target_channels:
            # Skip 'receipt' channel - receipts are handled separately with full bill
            if channel_code == "receipt":
                continue
            if channel_code not in items_by_channel:
                items_by_channel[channel_code] = []
            items_by_channel[channel_code].append({
                **item,
                "product_name": item.get("product_name") or product.get("name", "?")
            })
    
    # ═══════════════════════════════════════════════════════════════════════════════
    # PAPER OPTIMIZATION: Only create tickets for channels with items
    # If order only has drinks, no Cocina ticket is generated (and vice versa)
    # ═══════════════════════════════════════════════════════════════════════════════
    jobs_created = []
    network_results = []
    
    # Usar transaction_number de la orden (generado al crear la cuenta)
    # Si no existe (órdenes antiguas), generar uno y guardarlo
    transaction_number = order.get("transaction_number")
    if not transaction_number:
        transaction_number = await get_next_transaction_number()
        await db.orders.update_one({"id": order_id}, {"$set": {"transaction_number": transaction_number}})
    
    for channel_code, items in items_by_channel.items():
        # Skip empty channels - no blank tickets
        if not items:
            continue
            
        channel = next((c for c in channels if c.get("code") == channel_code), None)
        printer_name = channel.get("printer_name", "") if channel else ""
        printer_target = channel.get("target", "usb") if channel else "usb"
        printer_ip = channel.get("ip", "") if channel else ""
        channel_name = channel.get("name", channel_code.title()) if channel else channel_code.title()
        copies = channel.get("copies", 1) if channel else 1  # Numero de copias
        
        # Build comanda data with ONLY the filtered items for this channel
        comanda_data = {
            "type": "comanda",
            "paper_width": 80,
            "channel_name": channel_name,
            "table_number": order.get("table_number", "?"),
            "waiter_name": order.get("waiter_name", ""),
            "order_number": order.get("id", "")[:8],
            "transaction_number": transaction_number,
            "date": now_local_str("%Y-%m-%d %H:%M:%S"),
            "items_count": len(items),
            "items": [
                {
                    "name": item.get("product_name", ""),
                    "quantity": item.get("quantity", 1),
                    "modifiers": [m.get("name", "") for m in item.get("modifiers", [])],
                    "notes": item.get("notes", "")
                }
                for item in items
            ]
        }
        
        # ═══════════════════════════════════════════════════════════════════════════════
        # TODAS LAS IMPRESIONES VAN A LA COLA (red y USB)
        # El agente local es quien tiene acceso a las impresoras de red locales
        # El servidor en la nube NO puede alcanzar IPs de red local como 192.168.x.x
        # ═══════════════════════════════════════════════════════════════════════════════
        job = {
            "id": gen_id(),
            "type": "comanda",
            "channel": channel_code,
            "printer_name": printer_name,
            "printer_target": printer_target,
            "printer_ip": printer_ip,
            "copies": copies,  # Numero de copias a imprimir
            "data": comanda_data,
            "status": "pending",
            "created_at": now_iso()
        }
        await db.print_queue.insert_one(job)
        jobs_created.append({k: v for k, v in job.items() if k != "_id"})
    
    # Log for debugging
    channels_used = [j["channel"] for j in jobs_created]
    
    return {
        "jobs": jobs_created, 
        "count": len(jobs_created),
        "channels_used": channels_used,
        "message": f"{len(jobs_created)} trabajos agregados a la cola"
    }


# ─── TEST PRINT ───
@api.post("/print/test/{channel_code}")
async def send_test_print(channel_code: str):
    """Send a test print to a specific channel"""
    channel = await db.print_channels.find_one({"code": channel_code}, {"_id": 0})
    if not channel:
        raise HTTPException(status_code=404, detail="Canal no encontrado")
    
    config = await db.system_config.find_one({"id": "printer_config"}, {"_id": 0}) or {}
    
    test_data = {
        "type": "test",
        "paper_width": 80,
        "business_name": config.get("business_name", "ALONZO CIGAR"),
        "channel_name": channel.get("name", channel_code.title()),
        "date": now_local_str("%Y-%m-%d %H:%M:%S"),
        "message": "PRUEBA DE IMPRESION",
        "printer_name": channel.get("printer_name", "Sin configurar")
    }
    
    job = {
        "id": gen_id(),
        "type": "test",
        "channel": channel_code,
        "printer_name": channel.get("printer_name", ""),
        "data": test_data,
        "status": "pending",
        "created_at": now_iso()
    }
    await db.print_queue.insert_one(job)
    return {k: v for k, v in job.items() if k != "_id"}


# ─── PRINT TO QUEUE HELPERS ───
@api.post("/print/receipt/{bill_id}/send")
async def send_receipt_to_printer(bill_id: str, user: dict = Depends(get_current_user)):
    """Envia un recibo/factura directamente a la impresora (red) o a la cola (USB)"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    biz_name = config.get('business_name', 'ALONZO CIGAR')
    biz_rnc = config.get('rnc', '1-31-75577-1')
    biz_phone = config.get('phone', '809-301-3858')
    
    # Obtener dirección estructurada
    addr = config.get('business_address', {})
    if isinstance(addr, dict):
        addr_parts = [addr.get('street', ''), addr.get('building', ''), addr.get('sector', ''), addr.get('city', '')]
        biz_addr = ', '.join(p for p in addr_parts if p)
    else:
        biz_addr = str(addr) if addr else ''
    
    # Obtener impresora según turno activo del cajero
    receipt_channel_code = "receipt"
    try:
        from supabase import create_client as sc
        sb_url = os.environ.get("SUPABASE_URL", "")
        sb_key = os.environ.get("SUPABASE_ANON_KEY", "")
        if sb_url and sb_key:
            sb = sc(sb_url, sb_key)
            session = sb.table("pos_sessions").select("terminal_name").eq("opened_by", user.get("user_id")).eq("status", "open").limit(1).execute()
            if session.data and len(session.data) > 0:
                terminal_name = session.data[0].get("terminal_name", "")
                if terminal_name:
                    terminal = await db.pos_terminals.find_one({"name": terminal_name}, {"_id": 0, "print_channel": 1})
                    if terminal and terminal.get("print_channel"):
                        receipt_channel_code = terminal["print_channel"]
    except Exception as e:
        print(f"Warning: Could not resolve terminal printer for receipt: {e}")
    
    receipt_channel = await db.print_channels.find_one({"code": receipt_channel_code}, {"_id": 0})
    if not receipt_channel:
        receipt_channel = await db.print_channels.find_one({"code": "receipt"}, {"_id": 0})
    printer_target = receipt_channel.get("target", "usb") if receipt_channel else "usb"
    printer_ip = receipt_channel.get("ip", receipt_channel.get("ip_address", "")) if receipt_channel else ""
    
    commands = []
    
    # ─── MODO ENTRENAMIENTO ───
    if bill.get("training_mode"):
        commands.append({"type": "text", "text": "*** ENTRENAMIENTO ***", "align": "center", "bold": True, "size": 2})
        commands.append({"type": "text", "text": "NO ES VENTA REAL", "align": "center", "bold": True})
        commands.append({"type": "divider"})
    
    commands.append({"type": "text", "text": biz_name, "align": "center", "bold": True, "size": 2})
    commands.append({"type": "text", "text": f"RNC: {biz_rnc}", "align": "center", "bold": True})
    if biz_addr:
        commands.append({"type": "text", "text": biz_addr[:40], "align": "center"})
    commands.append({"type": "text", "text": f"Tel: {biz_phone}", "align": "center"})
    commands.append({"type": "divider"})
    
    # NCF Section — show e-NCF if available, contingencia, or local NCF
    ecf_encf = bill.get('ecf_encf', '')
    ecf_status = (bill.get('ecf_status') or '').upper()
    ECF_LABELS = {'E31': 'Credito Fiscal Electronico', 'E32': 'Factura de Consumo Electronico', 'E33': 'Nota de Debito Electronica', 'E34': 'Nota de Credito Electronica', 'E44': 'Regimen Especial Electronico', 'E45': 'Gubernamental Electronico'}
    if ecf_status == 'CONTINGENCIA':
        ecf_label = ECF_LABELS.get((bill.get('ecf_type') or '')[:3], 'Comprobante Fiscal Electronico')
        commands.append({"type": "text", "text": ecf_label, "align": "center", "bold": True})
        commands.append({"type": "text", "text": "** MODO CONTINGENCIA **", "align": "center", "bold": True, "size": 2})
        commands.append({"type": "text", "text": "Pendiente de validacion DGII", "align": "center"})
    elif ecf_encf:
        ecf_label = ECF_LABELS.get(ecf_encf[:3], 'Comprobante Fiscal Electronico')
        commands.append({"type": "text", "text": ecf_label, "align": "center", "bold": True})
        commands.append({"type": "text", "text": ecf_encf, "align": "center", "bold": True})
    else:
        commands.append({"type": "text", "text": "COMPROBANTE FISCAL", "align": "center", "bold": True})
        commands.append({"type": "text", "text": bill.get('ncf', ''), "align": "center", "bold": True})
        commands.append({"type": "text", "text": f"Valido hasta: {config.get('ticket_ncf_expiry', '31/12/2026')}", "align": "center"})
    commands.append({"type": "divider"})
    
    # ─── DATOS FISCALES DEL CLIENTE (B01, B14, B15) ───
    # Inferir ncf_type desde el NCF si no está establecido
    ncf_type = bill.get("ncf_type", "")
    ncf_str = bill.get("ncf", "")
    if not ncf_type and ncf_str:
        if ncf_str.startswith("B01"):
            ncf_type = "B01"
        elif ncf_str.startswith("B14"):
            ncf_type = "B14"
        elif ncf_str.startswith("B15"):
            ncf_type = "B15"
    
    # Mostrar datos fiscales si es factura fiscal y tiene datos del cliente
    if ncf_type in ["B01", "B14", "B15"] and (bill.get("fiscal_id") or bill.get("razon_social")):
        commands.append({"type": "text", "text": "DATOS DEL CLIENTE", "align": "left", "bold": True})
        fiscal_id_type = bill.get("fiscal_id_type", "RNC")
        fiscal_id = bill.get("fiscal_id", "")
        razon_social = bill.get("razon_social", "")
        commands.append({"type": "text", "text": f"{fiscal_id_type}: {fiscal_id}", "align": "left"})
        commands.append({"type": "text", "text": f"Razon Social: {razon_social}", "align": "left"})
        commands.append({"type": "divider"})
    
    # Build mesa description with account info if divided
    account_number = bill.get('account_number', 1)
    account_label = bill.get('account_label', '')
    
    mesa_desc = f"Mesa: {bill['table_number']}"
    if account_number > 1:
        mesa_desc = f"Mesa: {bill['table_number']} - Cuenta #{account_number}"
        if account_label:
            mesa_desc = f"Mesa: {bill['table_number']} - Cta #{account_number}"
    
    commands.append({"type": "columns", "left": mesa_desc, "right": ""})
    if account_label:
        commands.append({"type": "columns", "left": "Cliente:", "right": account_label[:20]})
    commands.append({"type": "columns", "left": "Fecha:", "right": utc_to_local_str(bill.get('paid_at', bill['created_at']))})
    if bill.get('waiter_name'):
        commands.append({"type": "columns", "left": "Mesero:", "right": bill['waiter_name'][:20]})
    if bill.get('cashier_name'):
        commands.append({"type": "columns", "left": "Cajero:", "right": bill['cashier_name'][:20]})
    
    # Numero de Transaccion (ID de Venta) - DEBAJO del cajero
    transaction_number = bill.get('transaction_number')
    if transaction_number:
        commands.append({"type": "columns", "left": "Transaccion:", "right": f"#{transaction_number}"})
    
    commands.append({"type": "divider"})
    
    # Items
    for item in bill.get("items", []):
        qty_str = format_qty(item['quantity'])
        commands.append({"type": "columns", "left": f"{qty_str} X {item['product_name'][:22]}", "right": f"RD$ {item['total']:,.2f}"})
    
    commands.append({"type": "divider"})
    commands.append({"type": "columns", "left": "Subtotal", "right": f"RD$ {bill['subtotal']:,.2f}"})
    
    # Discount line (if applied)
    discount_nc = bill.get("discount_applied")
    if discount_nc and discount_nc.get("amount", 0) > 0:
        commands.append({"type": "columns", "left": f"Desc: {discount_nc['name']}", "right": f"-RD$ {discount_nc['amount']:,.2f}"})
    
    # Tax breakdown
    tax_breakdown = bill.get("tax_breakdown", [])
    if tax_breakdown:
        for tax in tax_breakdown:
            commands.append({"type": "columns", "left": f"{tax['description']} {tax['rate']}%", "right": f"RD$ {tax['amount']:,.2f}"})
    else:
        commands.append({"type": "columns", "left": "ITBIS 18%", "right": f"RD$ {bill.get('itbis', 0):,.2f}"})
        if bill.get('propina_legal', 0) > 0:
            commands.append({"type": "columns", "left": f"Propina {bill.get('propina_percentage', 10)}%", "right": f"RD$ {bill.get('propina_legal', 0):,.2f}"})
    
    # Total con borde (lineas simples para compatibilidad)
    commands.append({"type": "feed", "lines": 1})
    commands.append({"type": "text", "text": "=" * 42})
    commands.append({"type": "text", "text": "TOTAL A PAGAR", "align": "center", "bold": True})
    commands.append({"type": "text", "text": f"RD$ {bill['total']:,.2f}", "align": "center", "bold": True, "size": 2})
    commands.append({"type": "text", "text": "=" * 42})
    
    # ─── DESGLOSE DE RECIBIDO (Factura Final - Estado Pagado) ───
    # Muestra exactamente qué se recibió del cliente
    payments = bill.get('payments', [])
    amount_received = bill.get("amount_received", 0)
    change_amount = bill.get("change_amount", 0)
    
    if payments and len(payments) > 0:
        # Listar cada pago recibido con formato "Recibido [Metodo]: [Monto]"
        for pmt in payments:
            pmt_currency = pmt.get('currency', 'DOP')
            pmt_amount = pmt.get('amount', 0)
            
            # Determinar etiqueta segun tipo de pago (sin acentos para compatibilidad)
            if pmt_currency == 'USD':
                label = "Recibido Dolar:"
                curr_symbol = "US$"
                display_amount = pmt_amount
            elif pmt_currency == 'EUR':
                label = "Recibido Euro:"
                curr_symbol = "EUR"  # Sin simbolo especial
                display_amount = pmt_amount
            elif pmt.get('is_cash', True) and pmt_currency in ['DOP', 'RD$']:
                label = "Recibido Efectivo:"
                curr_symbol = "RD$"
                display_amount = pmt_amount
            else:
                # Tarjeta u otro metodo
                pmt_name = pmt.get('payment_method_name', 'Pago')[:15]
                label = f"Recibido {pmt_name}:"
                curr_symbol = "RD$"
                display_amount = pmt.get('amount_dop', pmt_amount)
            
            commands.append({"type": "columns", "left": label, "right": f"{curr_symbol} {display_amount:,.2f}"})
    elif bill.get('payment_method_name'):
        # Pago unico (compatibilidad hacia atras)
        pmt_name = bill['payment_method_name'][:15]
        if amount_received > 0:
            commands.append({"type": "columns", "left": f"Recibido {pmt_name}:", "right": f"RD$ {amount_received:,.2f}"})
        else:
            commands.append({"type": "columns", "left": "Forma de pago:", "right": bill['payment_method_name'][:22]})
    
    # --- CALCULO DE DEVUELTA (siempre en RD$) ---
    # El cambio se calcula y muestra unicamente en Pesos Dominicanos
    if change_amount > 0:
        commands.append({"type": "columns", "bold": True, "left": "CAMBIO:", "right": f"RD$ {change_amount:,.2f}"})
    elif amount_received > bill["total"]:
        cambio = round(amount_received - bill["total"], 2)
        if cambio > 0:
            commands.append({"type": "columns", "bold": True, "left": "CAMBIO:", "right": f"RD$ {cambio:,.2f}"})
    
    commands.append({"type": "divider"})
    
    # e-CF info (if sent to Alanube)
    ecf_stamp = bill.get("ecf_stamp_url", "")
    ecf_encf = bill.get("ecf_encf", "")
    ecf_code = bill.get("ecf_security_code", "")
    if ecf_stamp or ecf_encf:
        commands.append({"type": "text", "text": "FACTURACION ELECTRONICA", "align": "center", "bold": True})
        if ecf_encf:
            commands.append({"type": "text", "text": f"e-NCF: {ecf_encf}", "align": "center"})
        if ecf_code:
            commands.append({"type": "text", "text": f"Codigo: {ecf_code}", "align": "center"})
        if ecf_stamp:
            commands.append({"type": "qr", "data": ecf_stamp})
            commands.append({"type": "text", "text": "Escanea para verificar en DGII", "align": "center"})
        commands.append({"type": "divider"})
    
    # Footer messages
    for i in range(1, 5):
        msg = config.get(f'ticket_footer_msg{i}', '')
        if msg:
            commands.append({"type": "text", "text": msg, "align": "center"})
    if not any(config.get(f'ticket_footer_msg{i}') for i in range(1, 5)):
        commands.append({"type": "text", "text": config.get('footer_text', 'Gracias por su visita!'), "align": "center"})
    
    commands.append({"type": "feed", "lines": 3})
    commands.append({"type": "cut"})
    
    # TODAS las impresiones van a la cola - el agente local las procesa
    # El servidor en la nube NO puede alcanzar IPs de red local
    # Obtener numero de copias configurado
    copies = receipt_channel.get("copies", 1) if receipt_channel else 1
    
    job = {
        "id": gen_id(),
        "type": "receipt",
        "channel": receipt_channel.get("code", "receipt") if receipt_channel else "receipt",
        "reference_id": bill_id,
        "commands": commands,
        "printer_name": receipt_channel.get("printer_name", "") if receipt_channel else "",
        "printer_target": printer_target,
        "printer_ip": printer_ip,
        "copies": copies,  # Numero de copias a imprimir
        "status": "pending",
        "created_at": now_iso()
    }
    await db.print_queue.insert_one(job)
    
    return {"ok": True, "job_id": job["id"], "copies": copies, "message": "Factura enviada a cola", "method": "queue"}

@api.post("/print/comanda/{order_id}/send")
async def send_comanda_to_printer(order_id: str):
    """Envía una comanda a la cola de impresión"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    # Solo items enviados a cocina
    items = [i for i in order.get("items", []) if i.get("status") == "sent"]
    if not items:
        return {"ok": False, "message": "No hay items para imprimir"}
    
    commands = []
    commands.append({"type": "center", "bold": True, "size": "large", "text": "COMANDA"})
    commands.append({"type": "divider"})
    commands.append({"type": "left", "bold": True, "size": "large", "text": f"Mesa: {order['table_number']}"})
    commands.append({"type": "left", "text": f"Mesero: {order['waiter_name']}"})
    commands.append({"type": "left", "text": f"Hora: {now_iso()[11:16]}"})
    commands.append({"type": "divider"})
    
    for item in items:
        commands.append({"type": "left", "bold": True, "text": f"{item['quantity']}x {item['product_name']}"})
        for mod in item.get("modifiers", []):
            commands.append({"type": "left", "text": f"  + {mod['name']}"})
        if item.get("notes"):
            commands.append({"type": "left", "text": f"  NOTA: {item['notes']}"})
    
    commands.append({"type": "divider"})
    commands.append({"type": "feed", "lines": 2})
    commands.append({"type": "cut"})
    
    # Obtener configuracion del canal de cocina para copias
    kitchen_channel = await db.print_channels.find_one({"code": "kitchen"}, {"_id": 0})
    copies = kitchen_channel.get("copies", 1) if kitchen_channel else 1
    
    job = {
        "id": gen_id(),
        "type": "comanda",
        "reference_id": order_id,
        "commands": commands,
        "copies": copies,  # Numero de copias a imprimir
        "status": "pending",
        "created_at": now_iso()
    }
    await db.print_queue.insert_one(job)
    
    return {"ok": True, "job_id": job["id"], "copies": copies, "message": "Comanda enviada a impresora"}

@api.post("/print/pre-check/{order_id}/send")
async def send_precheck_to_printer(order_id: str, user: dict = Depends(get_current_user), channel_override: Optional[str] = Query(None)):
    """Envia una pre-cuenta directamente a la impresora (red) o a la cola (USB)"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    items = [i for i in order.get("items", []) if i["status"] != "cancelled"]
    subtotal = sum((i["unit_price"] + sum(m.get("price",0) for m in i.get("modifiers",[]))) * i["quantity"] for i in items)
    
    # Get dynamic tax names from tax_config
    taxes = await db.tax_config.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(10)
    tax_lines = []
    total_tax = 0
    for tax in taxes:
        rate = tax.get("rate", 0)
        if rate <= 0:
            continue
        amount = round(subtotal * (rate / 100), 2)
        tax_lines.append({"description": tax.get("description", ""), "rate": rate, "amount": amount})
        total_tax += amount
    if not tax_lines:
        tax_lines = [{"description": "ITBIS", "rate": 18, "amount": round(subtotal * 0.18, 2)}, {"description": "Propina", "rate": 10, "amount": round(subtotal * 0.10, 2)}]
        total_tax = sum(t["amount"] for t in tax_lines)
    total = round(subtotal + total_tax, 2)
    
    # Usar transaction_number de la orden (generado al crear la cuenta)
    # Si no existe (órdenes antiguas), generar uno y guardarlo
    transaction_number = order.get("transaction_number")
    if not transaction_number:
        transaction_number = await get_next_transaction_number()
        await db.orders.update_one({"id": order_id}, {"$set": {"transaction_number": transaction_number}})
    
    # Registrar impresion
    print_count = await db.pre_check_prints.count_documents({"order_id": order_id})
    await db.pre_check_prints.insert_one({
        "order_id": order_id, 
        "print_number": print_count + 1, 
        "transaction_number": transaction_number,
        "printed_at": now_iso()
    })
    
    # Obtener impresora — override manual o por turno activo del cajero
    receipt_channel_code = "receipt"
    if channel_override:
        receipt_channel_code = channel_override
    else:
        try:
            from supabase import create_client as sc
            sb_url = os.environ.get("SUPABASE_URL", "")
            sb_key = os.environ.get("SUPABASE_ANON_KEY", "")
            if sb_url and sb_key:
                sb = sc(sb_url, sb_key)
                session = sb.table("pos_sessions").select("terminal_name").eq("opened_by", user.get("user_id")).eq("status", "open").limit(1).execute()
                if session.data and len(session.data) > 0:
                    terminal_name = session.data[0].get("terminal_name", "")
                    if terminal_name:
                        terminal = await db.pos_terminals.find_one({"name": terminal_name}, {"_id": 0, "print_channel": 1})
                        if terminal and terminal.get("print_channel"):
                            receipt_channel_code = terminal["print_channel"]
        except Exception as e:
            print(f"Warning: Could not resolve terminal printer for pre-check: {e}")
    
    receipt_channel = await db.print_channels.find_one({"code": receipt_channel_code}, {"_id": 0})
    if not receipt_channel:
        receipt_channel = await db.print_channels.find_one({"code": "receipt"}, {"_id": 0})
    printer_target = receipt_channel.get("target", "usb") if receipt_channel else "usb"
    printer_ip = receipt_channel.get("ip", receipt_channel.get("ip_address", "")) if receipt_channel else ""
    
    # Construir comandos ESC/POS
    commands = []
    
    if print_count > 0:
        commands.append({"type": "text", "text": f"*** RE-IMPRESION #{print_count} ***", "align": "center", "bold": True})
    
    commands.append({"type": "text", "text": "ALONZO CIGAR", "align": "center", "bold": True, "size": 2})
    commands.append({"type": "text", "text": "PRE-CUENTA", "align": "center", "bold": True})
    # Mostrar número de transacción (ID de Venta) como referencia
    commands.append({"type": "text", "text": f"ORDEN #{transaction_number}", "align": "center", "bold": True})
    commands.append({"type": "divider"})
    
    # Check if table has multiple accounts
    table_orders_count = await db.orders.count_documents({"table_id": order.get("table_id"), "status": {"$in": ["active", "sent"]}})
    account_number = order.get('account_number', 1)
    account_label = order.get('account_label', '')
    
    # Build mesa description
    mesa_desc = f"Mesa: {order['table_number']}"
    if table_orders_count > 1 or account_number > 1:
        mesa_desc = f"Mesa: {order['table_number']} - Cuenta #{account_number}"
        if account_label:
            mesa_desc = f"Mesa: {order['table_number']} - Cta #{account_number}"
    
    commands.append({"type": "columns", "left": mesa_desc, "right": ""})
    if account_label:
        commands.append({"type": "columns", "left": "Cliente:", "right": account_label[:20]})
    commands.append({"type": "columns", "left": "Mesero:", "right": order['waiter_name'][:20]})
    commands.append({"type": "columns", "left": "Fecha:", "right": utc_to_local_str(order['created_at'])})
    commands.append({"type": "divider"})
    
    for item in items:
        item_total = (item["unit_price"] + sum(m.get("price",0) for m in item.get("modifiers",[]))) * item["quantity"]
        qty_str = format_qty(item['quantity'])
        commands.append({"type": "columns", "left": f"{qty_str} X {item['product_name'][:22]}", "right": f"RD$ {item_total:,.2f}"})
        if item.get("modifiers"):
            mods = ", ".join(m["name"] for m in item["modifiers"])
            commands.append({"type": "text", "text": f"  ({mods})"})
    
    commands.append({"type": "divider"})
    commands.append({"type": "columns", "left": "Subtotal", "right": f"RD$ {subtotal:,.2f}"})
    for tl in tax_lines:
        commands.append({"type": "columns", "left": f"{tl['description']} {tl['rate']}%", "right": f"RD$ {tl['amount']:,.2f}"})
    commands.append({"type": "columns", "bold": True, "left": "TOTAL ESTIMADO", "right": f"RD$ {total:,.2f}"})
    
    # ─── EQUIVALENTES EN MONEDA EXTRANJERA (formato limpio) ───
    # Solo nombre de moneda y monto calculado, sin tasas
    payment_methods = await db.payment_methods.find({"active": True, "currency": {"$ne": "DOP"}}, {"_id": 0}).to_list(10)
    if payment_methods:
        commands.append({"type": "text", "text": "-" * 42})
        for pm in payment_methods:
            currency = pm.get("currency", "")
            exchange_rate = pm.get("exchange_rate", 1)
            pm_name = pm.get("name", "").replace("USD ", "").replace("EUR ", "")  # Limpiar nombre
            if currency and exchange_rate and exchange_rate > 0:
                equiv_amount = round(total / exchange_rate, 2)
                # Sin simbolos especiales para compatibilidad
                curr_symbol = "US$" if currency == "USD" else "EUR" if currency == "EUR" else currency
                # Formato limpio sin acentos: "Dolar                    US$ 82.65"
                currency_label = "Dolar" if currency == "USD" else "Euro" if currency == "EUR" else pm_name
                commands.append({"type": "columns", "left": currency_label, "right": f"{curr_symbol} {equiv_amount:,.2f}"})
    
    commands.append({"type": "divider"})
    commands.append({"type": "text", "text": "La propina es voluntaria", "align": "center"})
    commands.append({"type": "text", "text": "Este NO es un comprobante fiscal", "align": "center"})
    commands.append({"type": "feed", "lines": 3})
    commands.append({"type": "cut"})
    
    # TODAS las impresiones van a la cola - el agente local las procesa
    # El servidor en la nube NO puede alcanzar IPs de red local
    # Obtener numero de copias configurado
    copies = receipt_channel.get("copies", 1) if receipt_channel else 1
    
    job = {
        "id": gen_id(),
        "type": "pre-check",
        "channel": receipt_channel.get("code", "receipt") if receipt_channel else "receipt",
        "reference_id": order_id,
        "commands": commands,
        "printer_name": receipt_channel.get("printer_name", "") if receipt_channel else "",
        "printer_target": printer_target,
        "printer_ip": printer_ip,
        "copies": copies,  # Numero de copias a imprimir
        "status": "pending",
        "created_at": now_iso()
    }
    await db.print_queue.insert_one(job)
    
    return {"ok": True, "job_id": job["id"], "print_number": print_count + 1, "copies": copies, "message": "Pre-cuenta enviada a cola", "method": "queue"}

# ─── PRINTER CONFIG ───
@api.get("/printer-config")
async def get_printer_config():
    """Obtiene configuración de impresoras"""
    config = await db.system_config.find_one({"id": "printer_config"}, {"_id": 0})
    return config or {
        "id": "printer_config",
        "enabled": True,
        "mode": "queue",  # queue (para agente USB) o direct (para red)
        "auto_print_comanda": True,
        "auto_print_receipt": False,
        "receipt_printer": {"type": "usb", "ip": ""},
        "kitchen_printer": {"type": "usb", "ip": ""}
    }

@api.put("/printer-config")
async def update_printer_config(input: dict):
    """Actualiza configuración de impresoras"""
    if "_id" in input: del input["_id"]
    input["id"] = "printer_config"
    await db.system_config.update_one(
        {"id": "printer_config"},
        {"$set": input},
        upsert=True
    )
    return {"ok": True}

# ─── DOWNLOAD PRINT AGENT ───
@api.get("/download/print-agent", response_class=PlainTextResponse)
async def download_print_agent(printer_name: str = Query("RECIBO", description="Nombre de la impresora en Windows")):
    """
    Descarga el agente de impresión configurado para tu servidor y impresora.
    Guárdalo como 'MesaPOS_PrintAgent.py' y ejecútalo con Python.
    """
    server_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://factura-consumo-app.preview.emergentagent.com')
    
    agent_code = f'''#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MESA POS RD - AGENTE DE IMPRESION v2.1
======================================
Alonzo Cigar - Mesa POS RD

INSTALACION:
1. Ejecuta el instalador .bat como Administrador
2. O manualmente: pip install requests pywin32

CAMBIAR URL DEL SERVIDOR:
- Edita el archivo config.txt en la misma carpeta
- O vuelve a ejecutar el instalador desde la nueva URL
"""

import os
import sys
import time
import socket
import logging
import json
from datetime import datetime

# ════════════════════════════════════════════════════════════════
# CONFIGURACION - Lee de config.txt si existe
# ════════════════════════════════════════════════════════════════
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "config.txt")

# Valores por defecto (se sobreescriben con config.txt)
SERVER_URL = "{server_url}"
PRINTER_NAME = "{printer_name}"
POLL_INTERVAL = 3
NETWORK_PORT = 9100
RETRY_INTERVAL = 10
MAX_CONSECUTIVE_ERRORS = 5
LONG_RETRY_INTERVAL = 30

# Cargar configuracion desde archivo si existe
if os.path.exists(CONFIG_FILE):
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    key, value = line.split('=', 1)
                    key = key.strip().upper()
                    value = value.strip()
                    if key == 'SERVER_URL':
                        SERVER_URL = value
                    elif key == 'PRINTER_NAME':
                        PRINTER_NAME = value
                    elif key == 'POLL_INTERVAL':
                        POLL_INTERVAL = int(value)
                    elif key == 'NETWORK_PORT':
                        NETWORK_PORT = int(value)
    except Exception as e:
        print(f"Error leyendo config.txt: {{e}}")

# ════════════════════════════════════════════════════════════════
# CONFIGURAR LOGGING (archivo + consola)
# ════════════════════════════════════════════════════════════════
LOG_FILE = os.path.join(SCRIPT_DIR, "MesaPOS_PrintAgent.log")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger("PrintAgent")

def log_info(msg):
    log.info(msg)

def log_error(msg):
    log.error(msg)

def log_warning(msg):
    log.warning(msg)

# ════════════════════════════════════════════════════════════════
# INICIO
# ════════════════════════════════════════════════════════════════
log_info("=" * 60)
log_info("  MESA POS RD - AGENTE DE IMPRESION v2.1")
log_info("=" * 60)
log_info(f"  Servidor: {{SERVER_URL}}")
log_info(f"  Impresora USB: {{PRINTER_NAME}}")
log_info(f"  Puerto red: {{NETWORK_PORT}}")
log_info(f"  Log: {{LOG_FILE}}")
log_info("=" * 60)

# ════════════════════════════════════════════════════════════════
# VERIFICAR DEPENDENCIAS
# ════════════════════════════════════════════════════════════════
try:
    import win32print
    log_info("[OK] pywin32 instalado")
except ImportError:
    log_error("[ERROR] Falta pywin32. Ejecuta: pip install pywin32")
    sys.exit(1)

try:
    import requests
    log_info("[OK] requests instalado")
except ImportError:
    log_error("[ERROR] Falta requests. Ejecuta: pip install requests")
    sys.exit(1)

# ════════════════════════════════════════════════════════════════
# FUNCIONES DE IMPRESION
# ════════════════════════════════════════════════════════════════
def get_windows_printers():
    try:
        printers = [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
        return printers
    except Exception as e:
        log_error(f"Error obteniendo impresoras: {{e}}")
        return []

def printer_exists(name):
    return name in get_windows_printers()

def print_raw(printer_name, data):
    hPrinter = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(hPrinter, 1, ("POS Receipt", None, "RAW"))
        win32print.StartPagePrinter(hPrinter)
        win32print.WritePrinter(hPrinter, data)
        win32print.EndPagePrinter(hPrinter)
        win32print.EndDocPrinter(hPrinter)
    finally:
        win32print.ClosePrinter(hPrinter)

def send_to_network(ip, data, port=9100, timeout=10):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))
        sock.sendall(data)
        sock.close()
        return True, None
    except Exception as e:
        return False, str(e)

# ════════════════════════════════════════════════════════════════
# GENERADOR ESC/POS
# ════════════════════════════════════════════════════════════════
def build_escpos(commands):
    ESC, GS = b'\\x1b', b'\\x1d'
    data = bytearray(ESC + b'@')
    
    for cmd in commands:
        t = cmd.get("type", "")
        text = cmd.get("text", "")
        
        if t == "text":
            align = cmd.get("align", "left")
            if align == "center": data.extend(ESC + b'a\\x01')
            elif align == "right": data.extend(ESC + b'a\\x02')
            else: data.extend(ESC + b'a\\x00')
            if cmd.get("bold"): data.extend(ESC + b'E\\x01')
            size = cmd.get("size", 1)
            if size == 2: data.extend(GS + b'!\\x11')
            elif size == 3: data.extend(GS + b'!\\x22')
            data.extend(text.encode('cp437', errors='replace') + b'\\n')
            data.extend(ESC + b'E\\x00' + GS + b'!\\x00')
        elif t == "columns":
            data.extend(ESC + b'a\\x00')
            left, right = cmd.get("left", ""), cmd.get("right", "")
            spaces = max(1, 42 - len(left) - len(right))
            if cmd.get("bold"): data.extend(ESC + b'E\\x01')
            data.extend((left + " " * spaces + right).encode('cp437', errors='replace') + b'\\n')
            data.extend(ESC + b'E\\x00')
        elif t == "divider":
            data.extend(b'-' * 42 + b'\\n')
        elif t == "feed":
            data.extend(b'\\n' * cmd.get("lines", 1))
        elif t == "cut":
            data.extend(GS + b'V\\x00')
    
    return bytes(data)

def format_qty(q):
    """Formatea cantidad: 1.0 -> '1', 1.5 -> '1.5'"""
    if q == int(q):
        return str(int(q))
    return str(q)

def build_comanda(data):
    commands = []
    channel = data.get("channel_name", "COMANDA")
    trans_num = data.get("transaction_number") or data.get("internal_transaction_number")
    
    # ─── MODO ENTRENAMIENTO ───
    if data.get("training_mode"):
        commands.append({{"type": "text", "text": "*** ENTRENAMIENTO ***", "align": "center", "bold": True, "size": 2}})
        commands.append({{"type": "text", "text": "NO ES VENTA REAL", "align": "center", "bold": True}})
        commands.append({{"type": "divider"}})
    
    # Encabezado con ORDEN #XXXX arriba en negrita
    commands.append({{"type": "text", "text": channel.upper(), "align": "center", "bold": True}})
    if trans_num:
        commands.append({{"type": "text", "text": f"ORDEN #{{trans_num}}", "align": "center", "bold": True, "size": 2}})
    else:
        commands.append({{"type": "text", "text": "COMANDA", "align": "center", "bold": True}})
    commands.append({{"type": "divider"}})
    # Info de mesa
    commands.append({{"type": "columns", "left": "Mesa:", "right": str(data.get("table_number", "?"))}})
    commands.append({{"type": "columns", "left": "Mesero:", "right": data.get("waiter_name", "")[:20]}})
    fecha = data.get("date", "")
    commands.append({{"type": "columns", "left": "Hora:", "right": fecha[-8:] if len(fecha) > 8 else fecha}})
    commands.append({{"type": "divider"}})
    
    # Items
    for item in data.get("items", []):
        qty = item.get('quantity', 1)
        qty_str = format_qty(qty)
        txt = f"{{qty_str}} X {{item.get('name', '')}}"
        commands.append({{"type": "text", "text": txt, "bold": True}})
        for mod in item.get("modifiers", []):
            if mod: commands.append({{"type": "text", "text": f"  + {{mod}}"}})
        if item.get("notes"):
            commands.append({{"type": "text", "text": f"  NOTA: {{item['notes']}}"}})
    
    commands.append({{"type": "divider"}})
    commands.append({{"type": "feed", "lines": 3}})
    commands.append({{"type": "cut"}})
    return commands

def build_receipt(data):
    """Construye comandos ESC/POS para un recibo/factura"""
    commands = []
    
    # ─── MODO ENTRENAMIENTO ───
    if data.get("training_mode"):
        commands.append({{"type": "text", "text": "*** ENTRENAMIENTO ***", "align": "center", "bold": True, "size": 2}})
        commands.append({{"type": "text", "text": "NO ES VENTA REAL", "align": "center", "bold": True}})
        commands.append({{"type": "divider"}})
    
    # Encabezado con nombre del negocio
    commands.append({{"type": "text", "text": data.get("business_name", "MESA POS RD"), "align": "center", "bold": True, "size": 2}})
    commands.append({{"type": "text", "text": data.get("business_address", ""), "align": "center"}})
    commands.append({{"type": "text", "text": f"RNC: {{data.get('rnc', '')}}", "align": "center"}})
    commands.append({{"type": "text", "text": f"Tel: {{data.get('phone', '')}}", "align": "center"}})
    commands.append({{"type": "divider"}})
    
    # NCF
    bill_num = data.get("bill_number", "")
    if bill_num:
        commands.append({{"type": "text", "text": f"NCF: {{bill_num}}", "align": "center", "bold": True}})
    
    commands.append({{"type": "columns", "left": "Fecha:", "right": utc_to_local_str(data.get("date", ""))}})
    commands.append({{"type": "columns", "left": "Mesa:", "right": str(data.get("table_number", ""))}})
    commands.append({{"type": "columns", "left": "Mesero:", "right": data.get("waiter_name", "")[:20]}})
    commands.append({{"type": "columns", "left": "Cajero:", "right": data.get("cashier_name", "")[:20]}})
    # Numero de Transaccion (ID de Venta) - DEBAJO del cajero
    trans_num = data.get("transaction_number") or data.get("internal_transaction_number")
    if trans_num:
        commands.append({{"type": "columns", "left": "Transaccion:", "right": f"#{{trans_num}}"}})
    commands.append({{"type": "divider"}})
    
    # Productos
    for item in data.get("items", []):
        qty = item.get('quantity', 1)
        qty_str = format_qty(qty)
        name = item.get("name", "")[:28]
        total = item.get("total", 0)
        commands.append({{"type": "columns", "left": f"{{qty_str}} x {{name}}", "right": f"RD$ {{total:,.2f}}"}})
    
    commands.append({{"type": "divider"}})
    
    # Totales
    commands.append({{"type": "columns", "left": "Subtotal", "right": f"RD$ {{data.get('subtotal', 0):,.2f}}"}})
    commands.append({{"type": "columns", "left": "ITBIS 18%", "right": f"RD$ {{data.get('itbis', 0):,.2f}}"}})
    commands.append({{"type": "columns", "left": "Propina 10%", "right": f"RD$ {{data.get('tip', 0):,.2f}}"}})
    if data.get("discount", 0) > 0:
        commands.append({{"type": "columns", "left": "Descuento", "right": f"-RD$ {{data.get('discount', 0):,.2f}}"}})
    commands.append({{"type": "columns", "left": "TOTAL", "right": f"RD$ {{data.get('total', 0):,.2f}}", "bold": True}})
    
    # Pago y cambio
    commands.append({{"type": "divider"}})
    commands.append({{"type": "columns", "left": "Metodo:", "right": data.get("payment_method", "Efectivo")}})
    received = data.get("amount_received", 0)
    total = data.get("total", 0)
    if received > 0:
        commands.append({{"type": "columns", "left": "Recibido:", "right": f"RD$ {{received:,.2f}}"}})
    if received > total:
        cambio = received - total
        commands.append({{"type": "columns", "left": "CAMBIO:", "right": f"RD$ {{cambio:,.2f}}", "bold": True}})
    
    commands.append({{"type": "divider"}})
    commands.append({{"type": "text", "text": data.get("footer_text", "Gracias por su visita!"), "align": "center"}})
    commands.append({{"type": "feed", "lines": 3}})
    commands.append({{"type": "cut"}})
    
    return commands

def build_ticket_from_data(data, job_type):
    """Construye comandos segun el tipo de trabajo"""
    if job_type == "receipt":
        return build_receipt(data)
    elif job_type == "comanda":
        return build_comanda(data)
    elif job_type == "pre-check":
        # Pre-check usa comandos directos, no data
        return build_comanda(data)  # Fallback
    return build_comanda(data)

# ════════════════════════════════════════════════════════════════
# COMUNICACION CON SERVIDOR (con auto-reintento)
# ════════════════════════════════════════════════════════════════
def get_jobs():
    """Obtiene trabajos pendientes del servidor"""
    try:
        r = requests.get(f"{{SERVER_URL}}/api/print-queue/pending", timeout=15)
        if r.status_code == 200:
            return r.json(), None
        return [], f"HTTP {{r.status_code}}"
    except requests.exceptions.ConnectionError:
        return [], "Sin conexion a internet"
    except requests.exceptions.Timeout:
        return [], "Timeout - servidor no responde"
    except Exception as e:
        return [], str(e)

def mark_done(job_id, success):
    """Marca trabajo como completado"""
    try:
        requests.post(f"{{SERVER_URL}}/api/print-queue/{{job_id}}/complete", 
                     json={{"success": success}}, timeout=10)
    except Exception as e:
        log_warning(f"No se pudo marcar trabajo {{job_id[:8]}} como completado: {{e}}")

def test_connection():
    """Prueba conexion al servidor"""
    try:
        r = requests.get(f"{{SERVER_URL}}/api/print-channels", timeout=10)
        return r.status_code == 200
    except:
        return False

# ════════════════════════════════════════════════════════════════
# VERIFICAR IMPRESORA
# ════════════════════════════════════════════════════════════════
printers = get_windows_printers()
log_info(f"Impresoras disponibles: {{', '.join(printers) if printers else 'NINGUNA'}}")

if not printer_exists(PRINTER_NAME):
    log_warning(f"La impresora '{{PRINTER_NAME}}' no existe. Solo se procesaran impresoras de RED")
else:
    log_info(f"[OK] Impresora '{{PRINTER_NAME}}' encontrada")

# ════════════════════════════════════════════════════════════════
# BUCLE PRINCIPAL CON AUTO-REINTENTO
# ════════════════════════════════════════════════════════════════
log_info("=" * 60)
log_info("  AGENTE INICIADO - Esperando trabajos de impresion...")
log_info("  El agente se reconectara automaticamente si pierde conexion")
log_info("=" * 60)

processed = set()
jobs_printed = 0
consecutive_errors = 0
last_connection_ok = True

def main_loop():
    global processed, jobs_printed, consecutive_errors, last_connection_ok
    printers_list = get_windows_printers()
    
    while True:
        try:
            # Obtener trabajos pendientes
            jobs, error = get_jobs()
            
            # Manejar errores de conexion
            if error:
                consecutive_errors += 1
                if last_connection_ok:
                    log_error(f"Error de conexion: {{error}}")
                    last_connection_ok = False
                
                # Determinar tiempo de espera
                if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                    log_warning(f"{{consecutive_errors}} errores consecutivos. Esperando {{LONG_RETRY_INTERVAL}}s...")
                    time.sleep(LONG_RETRY_INTERVAL)
                else:
                    log_info(f"Reintentando en {{RETRY_INTERVAL}}s... (intento {{consecutive_errors}})")
                    time.sleep(RETRY_INTERVAL)
                continue
            
            # Conexion restaurada
            if not last_connection_ok:
                log_info("[OK] Conexion restaurada!")
                last_connection_ok = True
            consecutive_errors = 0
            
            # Procesar trabajos
            for job in jobs:
                job_id = job.get("id", "")
                if job_id in processed:
                    continue
                
                target = job.get("printer_target", "usb")
                ip = job.get("printer_ip", "")
                job_type = job.get("type", "?")
                job_printer = job.get("printer_name", PRINTER_NAME)
                copies = job.get("copies", 1)  # Numero de copias a imprimir
                
                log_info(f">>> Procesando: {{job_type.upper()}} | Target: {{target}} | Impresora: {{job_printer}} | Copias: {{copies}}")
                
                # Obtener comandos - usar build_ticket_from_data para diferenciar por tipo
                commands = job.get("commands", [])
                if not commands and job.get("data"):
                    log_info(f"    Construyendo comandos para {{job_type}} desde 'data'...")
                    commands = build_ticket_from_data(job["data"], job_type)
                
                if not commands:
                    log_warning(f"    [SKIP] Sin comandos para imprimir")
                    mark_done(job_id, False)
                    processed.add(job_id)
                    continue
                
                log_info(f"    Comandos ESC/POS: {{len(commands)}} instrucciones")
                raw_data = build_escpos(commands)
                
                # ═══════════════════════════════════════════════════════════
                # IMPRESORA DE RED (con soporte de copias)
                # ═══════════════════════════════════════════════════════════
                if target == "network" and ip:
                    all_ok = True
                    for copy_num in range(1, copies + 1):
                        log_info(f"[{{job_type.upper()}}] Enviando copia {{copy_num}}/{{copies}} a red {{ip}}:{{NETWORK_PORT}}...")
                        success, net_error = send_to_network(ip, raw_data)
                        if success:
                            log_info(f"    [OK] Copia {{copy_num}} enviada a {{ip}}")
                        else:
                            log_error(f"    [ERROR] Copia {{copy_num}} fallo: {{net_error}}")
                            all_ok = False
                        if copy_num < copies:
                            time.sleep(0.5)  # Breve pausa entre copias
                    if all_ok:
                        jobs_printed += copies
                        mark_done(job_id, True)
                    else:
                        mark_done(job_id, False)
                    processed.add(job_id)
                    continue
                
                # ═══════════════════════════════════════════════════════════
                # IMPRESORA USB (con soporte de copias)
                # ═══════════════════════════════════════════════════════════
                # Actualizar lista de impresoras por si se conecto una nueva
                current_printers = get_windows_printers()
                actual_printer = job_printer if job_printer in current_printers else PRINTER_NAME
                
                if actual_printer in current_printers:
                    all_ok = True
                    for copy_num in range(1, copies + 1):
                        log_info(f"[{{job_type.upper()}}] Imprimiendo copia {{copy_num}}/{{copies}} en USB: {{actual_printer}}...")
                        try:
                            print_raw(actual_printer, raw_data)
                            log_info(f"    [OK] Copia {{copy_num}} impresa correctamente")
                        except Exception as e:
                            log_error(f"    [ERROR] Copia {{copy_num}} fallo: {{e}}")
                            all_ok = False
                        if copy_num < copies:
                            time.sleep(0.5)  # Breve pausa entre copias
                    if all_ok:
                        jobs_printed += copies
                        mark_done(job_id, True)
                    else:
                        mark_done(job_id, False)
                else:
                    log_error(f"    [ERROR] Impresora '{{actual_printer}}' no disponible")
                    log_info(f"    Disponibles: {{', '.join(current_printers)}}")
                    mark_done(job_id, False)
                
                processed.add(job_id)
            
            # Limpiar cache periodicamente
            if len(processed) > 200:
                processed = set(list(processed)[-100:])
            
            time.sleep(POLL_INTERVAL)
            
        except Exception as e:
            log_error(f"Error inesperado en bucle principal: {{e}}")
            log_info(f"Reintentando en {{RETRY_INTERVAL}}s...")
            time.sleep(RETRY_INTERVAL)

# ════════════════════════════════════════════════════════════════
# INICIO DEL AGENTE
# ════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    try:
        # Probar conexion inicial
        log_info("Probando conexion al servidor...")
        if test_connection():
            log_info("[OK] Servidor accesible")
        else:
            log_warning("Servidor no accesible. El agente reintentara automaticamente.")
        
        # Iniciar bucle principal
        main_loop()
        
    except KeyboardInterrupt:
        log_info("")
        log_info("=" * 60)
        log_info("  AGENTE DETENIDO POR EL USUARIO")
        log_info(f"  Total impresiones: {{jobs_printed}}")
        log_info("=" * 60)
    except Exception as e:
        log_error(f"Error fatal: {{e}}")
        log_info("El agente se reiniciara automaticamente si esta como servicio")
'''
    
    return PlainTextResponse(
        content=agent_code,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="MesaPOS_PrintAgent.py"'}
    )

@api.get("/download/print-agent-info")
async def get_print_agent_info():
    """Información sobre el agente de impresión"""
    return {
        "download_url": "/api/download/print-agent",
        "service_installer_url": "/api/download/print-agent-installer",
        "instructions": [
            "1. Instala Python desde https://www.python.org/downloads/",
            "2. Abre CMD y ejecuta: pip install requests pywin32",
            "3. Descarga el agente desde /api/download/print-agent?printer_name=TuImpresora",
            "4. Guárdalo en C:\\MesaPOS\\MesaPOS_PrintAgent.py",
            "5. Descarga el instalador del servicio",
            "6. Ejecuta el instalador como Administrador"
        ],
        "requirements": ["Python 3.8+", "requests", "pywin32", "NSSM (incluido en instalador)"]
    }

@api.get("/download/print-agent-installer", response_class=PlainTextResponse)
async def download_print_agent_installer(printer_name: str = Query("RECIBO", description="Nombre de la impresora")):
    """
    Descarga el script .bat para instalar el agente con Programador de Tareas.
    Debe ejecutarse como Administrador.
    """
    server_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://factura-consumo-app.preview.emergentagent.com')
    
    installer_bat = f'''@echo off
chcp 65001 > nul
title Mesa POS RD - Instalador del Agente de Impresion
color 0A

echo.
echo ========================================================
echo     MESA POS RD - INSTALADOR DEL AGENTE DE IMPRESION
echo ========================================================
echo.

:: Verificar permisos de administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Este script necesita permisos de ADMINISTRADOR
    echo.
    echo Haz clic derecho en este archivo y selecciona
    echo "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

echo [OK] Ejecutando como Administrador
echo.

:: Configuracion
set INSTALL_DIR=C:\\MesaPOS
set PRINTER_NAME={printer_name}
set SERVER_URL={server_url}
set TASK_NAME=MesaPOS_PrintAgent

:: Crear directorio
echo [1/5] Creando directorio...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
echo       Directorio: %INSTALL_DIR%
echo.

:: Encontrar Python
echo [2/5] Buscando Python...
where python >nul 2>&1
if %errorLevel% neq 0 (
    echo       [ERROR] Python no encontrado en PATH!
    echo.
    echo       Instala Python desde: https://www.python.org/downloads/
    echo       IMPORTANTE: Marca "Add Python to PATH" durante instalacion
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%i in ('where python') do set PYTHON_PATH=%%i
echo       [OK] Python: %PYTHON_PATH%
echo.

:: Instalar dependencias
echo [3/6] Instalando dependencias...
python -m pip install requests pywin32 --quiet --disable-pip-version-check
if %errorLevel% neq 0 (
    echo       [ERROR] No se pudieron instalar las dependencias
    pause
    exit /b 1
)
echo       [OK] requests y pywin32 instalados
echo.

:: Descargar agente
echo [4/6] Descargando agente de impresion...
powershell -Command "try {{ [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SERVER_URL%/api/download/print-agent?printer_name=%PRINTER_NAME%' -OutFile '%INSTALL_DIR%\\MesaPOS_PrintAgent.py' -UseBasicParsing }} catch {{ Write-Host $_.Exception.Message; exit 1 }}"
if not exist "%INSTALL_DIR%\\MesaPOS_PrintAgent.py" (
    echo       [ERROR] No se pudo descargar el agente
    echo       Verifica tu conexion a internet
    pause
    exit /b 1
)
echo       [OK] Agente descargado
echo.

:: Crear archivo de configuracion
echo [5/6] Creando archivo de configuracion...
echo # Mesa POS RD - Configuracion del Agente de Impresion > "%INSTALL_DIR%\\config.txt"
echo # Puedes editar este archivo para cambiar la configuracion >> "%INSTALL_DIR%\\config.txt"
echo # El agente leera estos valores al iniciar >> "%INSTALL_DIR%\\config.txt"
echo. >> "%INSTALL_DIR%\\config.txt"
echo SERVER_URL=%SERVER_URL% >> "%INSTALL_DIR%\\config.txt"
echo PRINTER_NAME=%PRINTER_NAME% >> "%INSTALL_DIR%\\config.txt"
echo POLL_INTERVAL=3 >> "%INSTALL_DIR%\\config.txt"
echo NETWORK_PORT=9100 >> "%INSTALL_DIR%\\config.txt"
echo       [OK] config.txt creado
echo.

:: Crear script de inicio
echo [6/6] Configurando inicio automatico...

:: Matar proceso anterior si existe
taskkill /f /im pythonw.exe >nul 2>&1

:: Crear archivo VBS para ejecutar sin ventana
echo Set WshShell = CreateObject("WScript.Shell") > "%INSTALL_DIR%\\RunAgent.vbs"
echo WshShell.Run "pythonw ""%INSTALL_DIR%\\MesaPOS_PrintAgent.py""", 0, False >> "%INSTALL_DIR%\\RunAgent.vbs"

:: Eliminar tarea anterior si existe
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Crear tarea programada que inicie con Windows
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%INSTALL_DIR%\\RunAgent.vbs\"" /sc onlogon /rl highest /f >nul 2>&1
if %errorLevel% neq 0 (
    echo       [WARN] No se pudo crear tarea programada
    echo       Puedes agregar manualmente a Inicio
) else (
    echo       [OK] Tarea programada creada
)

:: Iniciar el agente ahora
echo.
echo Iniciando agente...
start "" wscript.exe "%INSTALL_DIR%\\RunAgent.vbs"

echo.
echo ========================================================
echo           INSTALACION COMPLETADA EXITOSAMENTE
echo ========================================================
echo.
echo El agente esta corriendo en segundo plano.
echo Se iniciara automaticamente cuando enciendas la PC.
echo.
echo Archivos instalados en: %INSTALL_DIR%
echo   - MesaPOS_PrintAgent.py (agente)
echo   - config.txt (EDITABLE - para cambiar URL)
echo   - MesaPOS_PrintAgent.log (logs)
echo   - RunAgent.vbs (iniciador)
echo.
echo ========================================================
echo   IMPORTANTE: Si cambias de servidor (produccion)
echo   solo edita C:\\MesaPOS\\config.txt y cambia SERVER_URL
echo   Luego reinicia el agente con:
echo   taskkill /f /im pythonw.exe
echo   wscript C:\\MesaPOS\\RunAgent.vbs
echo ========================================================
echo.
echo Para ver los logs:
echo   type %INSTALL_DIR%\\MesaPOS_PrintAgent.log
echo.
pause
'''
    
    return PlainTextResponse(
        content=installer_bat,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="Instalar_MesaPOS_PrintAgent.bat"'}
    )

# ─── APP CONFIG ───
app.include_router(api)

# Servir archivos estáticos (imágenes de productos)
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
(UPLOAD_DIR / "products").mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compress responses > 500 bytes (reduces data transfer ~70%)
app.add_middleware(GZipMiddleware, minimum_size=500)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_event():
    scheduler.start()
    await update_scheduler_from_config()
    logger.info("Scheduler started and configured")
    # Seed timezone config if not present
    existing_tz = await db.system_config.find_one({"id": "timezone"})
    if not existing_tz:
        await db.system_config.insert_one({"id": "timezone", "timezone": "America/Santo_Domingo"})
        logger.info("Timezone config seeded: America/Santo_Domingo")
    
    # Create MongoDB indexes for faster queries
    try:
        await db.bills.create_index([("status", 1), ("business_date", 1)])
        await db.bills.create_index("paid_at")
        await db.orders.create_index("status")
        await db.orders.create_index("table_id")
        await db.products.create_index([("category_id", 1), ("active", 1)])
        await db.products.create_index("barcode")
        await db.ingredients.create_index("category")
        await db.stock.create_index("ingredient_id")
        await db.stock.create_index("warehouse_id")
        await db.stock_movements.create_index("created_at")
        await db.void_audit_logs.create_index("created_at")
        await db.customers.create_index("phone")
        await db.tables.create_index("status")
        logger.info("MongoDB indexes created successfully")
    except Exception as e:
        logger.warning(f"Index creation warning (non-fatal): {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()
