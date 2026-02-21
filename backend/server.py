from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import os
import logging
import uuid
import hashlib
import jwt
import asyncio
import resend
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
from routers.billing import router as billing_router, set_db as billing_set_db, init_supabase as billing_init_supabase
from routers.kitchen import router as kitchen_router, set_db as kitchen_set_db, notify_kds
from routers.customers import router as customers_router, set_db as customers_set_db
from routers.config import router as config_router, set_db as config_set_db
from routers.ncf import router as ncf_router, init_supabase as ncf_init_supabase, set_db as ncf_set_db
from routers.credit_notes import router as credit_notes_router, set_db as credit_notes_set_db, init_supabase as credit_notes_init_supabase

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
billing_set_db(db)
billing_init_supabase()  # Initialize Supabase for pos_sessions integration
ncf_init_supabase()  # Initialize Supabase for NCF management
credit_notes_set_db(db)
credit_notes_init_supabase()  # Initialize Supabase for Credit Notes
kitchen_set_db(db)
taxes_set_db(db)
taxes_init_supabase()  # Initialize Supabase for tax calculations
customers_set_db(db)
config_set_db(db)

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
api.include_router(billing_router)
api.include_router(kitchen_router)
api.include_router(customers_router)
api.include_router(config_router)
api.include_router(ncf_router)
api.include_router(credit_notes_router)

# Scheduler for automated tasks
scheduler = AsyncIOScheduler()

# Utils
def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

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
        "modifier_group_ids": input.get("modifier_group_ids", []),
        "modifier_assignments": modifier_assignments,
        "track_inventory": input.get("track_inventory", False),
        "print_channels": input.get("print_channels", []),  # Array of channel codes for multi-channel printing
        "tax_exemptions": input.get("tax_exemptions", []),  # Array of tax IDs this product is exempt from
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
async def create_modifier(input: dict):
    options = [{"id": gen_id(), "name": o.get("name", ""), "price": o.get("price", 0)} for o in input.get("options", [])]
    doc = {"id": gen_id(), "name": input.get("name", ""), "required": input.get("required", False), "max_selections": input.get("max_selections", 0), "options": options, "active": True}
    await db.modifiers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/modifiers/{modifier_id}")
async def update_modifier(modifier_id: str, input: dict):
    if "_id" in input:
        del input["_id"]
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
        "return_to_inventory": input.get("return_to_inventory", True),
        "requires_manager_auth": input.get("requires_manager_auth", False),
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
    return {k: v for k, v in doc.items() if k != "_id"}

@api.put("/shifts/{shift_id}/close")
async def close_shift(shift_id: str, input: dict, user=Depends(get_current_user)):
    await db.shifts.update_one({"id": shift_id}, {"$set": {
        "status": "closed", "closing_amount": input.get("closing_amount", 0),
        "cash_count": input.get("cash_count"), "closed_at": now_iso()
    }})
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
async def update_station_config(input: dict):
    if "_id" in input: del input["_id"]
    await db.station_config.update_one({}, {"$set": input}, upsert=True)
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
        "active": input.get("active", True),
        "category_ids": input.get("category_ids", [])
    }
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
            "business_name": "MESA POS RD",
            "business_address": "",
            "rnc": "",
            "phone": "",
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
    
    activation_minutes = input.get("activation_minutes", 60)
    tolerance_minutes = input.get("tolerance_minutes", 15)
    
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
    
    for tid in table_ids:
        await db.tables.update_one({"id": tid}, {"$set": {"pending_reservation_id": doc["id"]}})
    
    return {k: v for k, v in doc.items() if k != "_id"}

@api.get("/reservations/check-activations")
async def check_reservation_activations():
    config = await db.system_config.find_one({}, {"_id": 0})
    tz_offset_hours = config.get("timezone_offset", -4) if config else -4
    
    TZ_OFFSET = timedelta(hours=tz_offset_hours)
    LOCAL_TZ = timezone(TZ_OFFSET)
    
    now = datetime.now(LOCAL_TZ)
    today = now.strftime("%Y-%m-%d")
    tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    
    reservations = await db.reservations.find(
        {"date": {"$in": [today, tomorrow]}, "status": "confirmed"}, {"_id": 0}
    ).to_list(200)
    
    activated = []
    expired = []
    
    for res in reservations:
        try:
            res_time_str = f"{res['date']} {res['time']}"
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
    
    return {"activated": activated, "expired": expired, "checked": len(reservations)}

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
    itbis = round(subtotal * 0.18, 2)
    propina = round(subtotal * 0.10, 2)
    total = round(subtotal + itbis + propina, 2)
    items_html = ""
    for item in items:
        mods = ", ".join(m["name"] for m in item.get("modifiers", []))
        mod_str = f"<br><small style='color:#666'>  {mods}</small>" if mods else ""
        item_total = (item["unit_price"] + sum(m.get("price",0) for m in item.get("modifiers",[]))) * item["quantity"]
        items_html += f"<tr><td>{item['quantity']}x {item['product_name']}{mod_str}</td><td style='text-align:right'>RD$ {item_total:,.2f}</td></tr>"
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

@api.get("/print/receipt/{bill_id}")
async def print_receipt(bill_id: str, send_to_queue: bool = Query(default=False)):
    """Get receipt HTML. If send_to_queue=true, also adds to print queue."""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404)
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    printer_config = await db.system_config.find_one({"id": "printer_config"}, {"_id": 0}) or config
    
    # If send_to_queue, add to print queue
    if send_to_queue:
        receipt_channel = await db.print_channels.find_one({"code": "receipt"}, {"_id": 0})
        printer_name = receipt_channel.get("printer_name", "") if receipt_channel else ""
        
        receipt_data = {
            "type": "receipt",
            "paper_width": 80,
            "business_name": printer_config.get("business_name", "MESA POS RD"),
            "business_address": printer_config.get("business_address", ""),
            "rnc": printer_config.get("rnc", ""),
            "phone": printer_config.get("phone", ""),
            "bill_number": bill.get("ncf") or bill.get("number") or bill.get("id", "")[:8],
            "table_number": bill.get("table_number", ""),
            "waiter_name": bill.get("waiter_name", ""),
            "cashier_name": bill.get("paid_by_name", ""),
            "date": bill.get("paid_at", "")[:19].replace("T", " ") if bill.get("paid_at") else "",
            "items": [{"name": item.get("product_name", ""), "quantity": item.get("quantity", 1), "total": item.get("total", 0)} for item in bill.get("items", [])],
            "subtotal": bill.get("subtotal", 0),
            "itbis": bill.get("itbis", 0),
            "tip": bill.get("propina_legal", 0),
            "total": bill.get("total", 0),
            "payment_method": bill.get("payment_method_name", "Efectivo"),
            "footer_text": printer_config.get("footer_text", "Gracias por su visita!")
        }
        job = {"id": gen_id(), "type": "receipt", "channel": "receipt", "printer_name": printer_name, "data": receipt_data, "status": "pending", "created_at": now_iso()}
        await db.print_queue.insert_one(job)
    
    items_html = ""
    for item in bill.get("items", []):
        items_html += f"<tr><td>{item['quantity']}x {item['product_name']}</td><td style='text-align:right'>RD$ {item['total']:,.2f}</td></tr>"
    return {"html": f"""<div style='font-family:monospace;width:280px;padding:10px;font-size:12px;'>
    <div style='text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;'>
    <b style='font-size:16px;'>{printer_config.get('business_name', 'MESA POS RD')}</b><br>
    <span style='font-size:10px;'>{printer_config.get('business_address', '')}<br>
    RNC: {printer_config.get('rnc', '')} Tel: {printer_config.get('phone', '')}</span>
    </div>
    <div>NCF: {bill.get('ncf', '')}<br>Mesa: {bill['table_number']}<br>Fecha: {bill.get('paid_at', bill['created_at'])[:19]}</div>
    <table style='width:100%;border-collapse:collapse;margin:8px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;'>
    {items_html}</table>
    <table style='width:100%;font-size:12px;'>
    <tr><td>Subtotal</td><td style='text-align:right'>RD$ {bill['subtotal']:,.2f}</td></tr>
    <tr><td>ITBIS 18%</td><td style='text-align:right'>RD$ {bill['itbis']:,.2f}</td></tr>
    <tr><td>Propina {bill.get('propina_percentage', 10)}%</td><td style='text-align:right'>RD$ {bill.get('propina_legal', 0):,.2f}</td></tr>
    <tr><td><b style='font-size:14px;'>TOTAL</b></td><td style='text-align:right;font-size:14px;'><b>RD$ {bill['total']:,.2f}</b></td></tr>
    </table>
    <div style='text-align:center;margin-top:8px;font-size:10px;border-top:1px dashed #000;padding-top:8px;'>
    {printer_config.get('footer_text', 'Gracias por su visita')}</div></div>""", "queued": send_to_queue}

@api.get("/print/receipt-escpos/{bill_id}")
async def print_receipt_escpos(bill_id: str):
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404)
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    lines = []
    lines.append({"type": "center", "bold": True, "size": "large", "text": config.get('business_name', 'MESA POS RD')})
    if config.get('business_address'):
        lines.append({"type": "center", "text": config.get('business_address', '')})
    lines.append({"type": "divider"})
    lines.append({"type": "left", "text": f"NCF: {bill.get('ncf', '')}"})
    lines.append({"type": "left", "text": f"Mesa: {bill['table_number']}"})
    lines.append({"type": "left", "text": f"Fecha: {bill.get('paid_at', bill['created_at'])[:19]}"})
    lines.append({"type": "divider"})
    for item in bill.get("items", []):
        lines.append({"type": "columns", "left": f"{item['quantity']}x {item['product_name']}", "right": f"RD$ {item['total']:,.2f}"})
    lines.append({"type": "divider"})
    lines.append({"type": "columns", "left": "Subtotal", "right": f"RD$ {bill['subtotal']:,.2f}"})
    lines.append({"type": "columns", "left": "ITBIS 18%", "right": f"RD$ {bill['itbis']:,.2f}"})
    lines.append({"type": "columns", "left": f"Propina {bill.get('propina_percentage', 10)}%", "right": f"RD$ {bill.get('propina_legal', 0):,.2f}"})
    lines.append({"type": "columns", "bold": True, "size": "large", "left": "TOTAL", "right": f"RD$ {bill['total']:,.2f}"})
    lines.append({"type": "divider"})
    lines.append({"type": "center", "text": "Gracias por su visita"})
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
    return {"html": f"""<div style='font-family:monospace;width:280px;padding:10px;font-size:14px;'>
    <div style='text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:8px;'>
    <b style='font-size:20px;'>COMANDA</b></div>
    <div style='font-size:16px;'><b>Mesa: {order['table_number']}</b><br>Mesero: {order['waiter_name']}<br>Hora: {now_iso()[11:16]}</div>
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
    lines.append({"type": "left", "text": f"Hora: {now_iso()[11:16]}"})
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
    """Obtiene trabajos de impresión pendientes para el agente USB"""
    jobs = await db.print_queue.find(
        {"status": "pending"},
        {"_id": 0}
    ).sort("created_at", 1).to_list(10)
    return jobs

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


# ─── PRINT QUEUE ENDPOINTS FOR AGENT ───
@api.get("/print/queue")
async def get_print_queue():
    """Get pending print jobs for the local agent"""
    jobs = await db.print_queue.find(
        {"status": "pending"},
        {"_id": 0}
    ).sort("created_at", 1).to_list(20)
    return jobs

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
    """Send a formatted receipt to the print queue"""
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    # Get printer config
    config = await db.system_config.find_one({"id": "printer_config"}, {"_id": 0}) or {}
    
    # Get receipt channel printer
    receipt_channel = await db.print_channels.find_one({"code": "receipt"}, {"_id": 0})
    printer_name = receipt_channel.get("printer_name", "") if receipt_channel else ""
    
    # Build receipt data for 80mm thermal printer
    receipt_data = {
        "type": "receipt",
        "paper_width": 80,
        "business_name": config.get("business_name", "MESA POS RD"),
        "business_address": config.get("business_address", ""),
        "rnc": config.get("rnc", ""),
        "phone": config.get("phone", ""),
        "bill_number": bill.get("ncf") or bill.get("number") or bill.get("id", "")[:8],
        "table_number": bill.get("table_number", ""),
        "waiter_name": bill.get("waiter_name", ""),
        "cashier_name": bill.get("paid_by_name", ""),
        "date": bill.get("paid_at", "")[:19].replace("T", " ") if bill.get("paid_at") else "",
        "items": [
            {
                "name": item.get("product_name", ""),
                "quantity": item.get("quantity", 1),
                "unit_price": item.get("unit_price", 0),
                "total": item.get("total", 0)
            }
            for item in bill.get("items", [])
        ],
        "subtotal": bill.get("subtotal", 0),
        "itbis": bill.get("itbis", 0),
        "tip": bill.get("propina_legal", 0),
        "discount": bill.get("discount_amount", 0),
        "total": bill.get("total", 0),
        "payment_method": bill.get("payment_method_name", "Efectivo"),
        "footer_text": config.get("footer_text", "Gracias por su visita!")
    }
    
    job = {
        "id": gen_id(),
        "type": "receipt",
        "channel": "receipt",
        "printer_name": printer_name,
        "data": receipt_data,
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
    for channel_code, items in items_by_channel.items():
        # Skip empty channels - no blank tickets
        if not items:
            continue
            
        channel = next((c for c in channels if c.get("code") == channel_code), None)
        printer_name = channel.get("printer_name", "") if channel else ""
        
        # Build comanda data with ONLY the filtered items for this channel
        comanda_data = {
            "type": "comanda",
            "paper_width": 80,
            "channel_name": channel.get("name", channel_code.title()) if channel else channel_code.title(),
            "table_number": order.get("table_number", "?"),
            "waiter_name": order.get("waiter_name", ""),
            "order_number": order.get("id", "")[:8],
            "date": now_iso()[:19].replace("T", " "),
            "items_count": len(items),  # For reference
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
        
        job = {
            "id": gen_id(),
            "type": "comanda",
            "channel": channel_code,
            "printer_name": printer_name,
            "data": comanda_data,
            "status": "pending",
            "created_at": now_iso()
        }
        await db.print_queue.insert_one(job)
        jobs_created.append({k: v for k, v in job.items() if k != "_id"})
    
    # Log for debugging
    channels_used = [j["channel"] for j in jobs_created]
    items_per_channel = {j["channel"]: j["data"]["items_count"] for j in jobs_created}
    logging.info(f"Comanda {order_id[:8]}: {len(jobs_created)} tickets created for channels {channels_used}, items: {items_per_channel}")
    
    return {
        "jobs": jobs_created, 
        "count": len(jobs_created),
        "channels_used": channels_used,
        "items_per_channel": items_per_channel
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
        "business_name": config.get("business_name", "MESA POS RD"),
        "channel_name": channel.get("name", channel_code.title()),
        "date": now_iso()[:19].replace("T", " "),
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
async def send_receipt_to_printer(bill_id: str):
    """Envía un recibo a la cola de impresión"""
    # Obtener comandos ESC/POS
    bill = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    
    # Construir comandos ESC/POS
    commands = []
    commands.append({"type": "center", "bold": True, "size": "large", "text": config.get('business_name', 'MESA POS RD')})
    if config.get('business_address'):
        commands.append({"type": "center", "text": config.get('business_address', '')})
    if config.get('rnc'):
        commands.append({"type": "center", "text": f"RNC: {config.get('rnc', '')}"})
    commands.append({"type": "divider"})
    commands.append({"type": "left", "text": f"NCF: {bill.get('ncf', '')}"})
    commands.append({"type": "left", "text": f"Mesa: {bill['table_number']}"})
    commands.append({"type": "left", "text": f"Fecha: {bill.get('paid_at', bill['created_at'])[:19]}"})
    commands.append({"type": "divider"})
    
    for item in bill.get("items", []):
        commands.append({"type": "columns", "left": f"{item['quantity']}x {item['product_name']}", "right": f"RD$ {item['total']:,.2f}"})
    
    commands.append({"type": "divider"})
    commands.append({"type": "columns", "left": "Subtotal", "right": f"RD$ {bill['subtotal']:,.2f}"})
    commands.append({"type": "columns", "left": "ITBIS 18%", "right": f"RD$ {bill['itbis']:,.2f}"})
    commands.append({"type": "columns", "left": f"Propina {bill.get('propina_percentage', 10)}%", "right": f"RD$ {bill.get('propina_legal', 0):,.2f}"})
    commands.append({"type": "columns", "bold": True, "size": "large", "left": "TOTAL", "right": f"RD$ {bill['total']:,.2f}"})
    commands.append({"type": "divider"})
    commands.append({"type": "center", "text": "Gracias por su visita"})
    commands.append({"type": "feed", "lines": 2})
    commands.append({"type": "cut"})
    
    # Agregar a cola
    job = {
        "id": gen_id(),
        "type": "receipt",
        "reference_id": bill_id,
        "commands": commands,
        "status": "pending",
        "created_at": now_iso()
    }
    await db.print_queue.insert_one(job)
    
    return {"ok": True, "job_id": job["id"], "message": "Recibo enviado a impresora"}

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
    
    job = {
        "id": gen_id(),
        "type": "comanda",
        "reference_id": order_id,
        "commands": commands,
        "status": "pending",
        "created_at": now_iso()
    }
    await db.print_queue.insert_one(job)
    
    return {"ok": True, "job_id": job["id"], "message": "Comanda enviada a impresora"}

@api.post("/print/pre-check/{order_id}/send")
async def send_precheck_to_printer(order_id: str):
    """Envía una pre-cuenta a la cola de impresión"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    items = [i for i in order.get("items", []) if i["status"] != "cancelled"]
    subtotal = sum((i["unit_price"] + sum(m.get("price",0) for m in i.get("modifiers",[]))) * i["quantity"] for i in items)
    itbis = round(subtotal * 0.18, 2)
    propina = round(subtotal * 0.10, 2)
    total = round(subtotal + itbis + propina, 2)
    
    # Registrar impresión
    print_count = await db.pre_check_prints.count_documents({"order_id": order_id})
    await db.pre_check_prints.insert_one({"order_id": order_id, "print_number": print_count + 1, "printed_at": now_iso()})
    
    commands = []
    
    if print_count > 0:
        commands.append({"type": "center", "bold": True, "text": f"*** RE-IMPRESION #{print_count} ***"})
    
    commands.append({"type": "center", "bold": True, "size": "large", "text": "MESA POS RD"})
    commands.append({"type": "center", "bold": True, "text": "PRE-CUENTA"})
    commands.append({"type": "divider"})
    commands.append({"type": "left", "text": f"Mesa: {order['table_number']}"})
    commands.append({"type": "left", "text": f"Mesero: {order['waiter_name']}"})
    commands.append({"type": "left", "text": f"Fecha: {order['created_at'][:19]}"})
    commands.append({"type": "divider"})
    
    for item in items:
        item_total = (item["unit_price"] + sum(m.get("price",0) for m in item.get("modifiers",[]))) * item["quantity"]
        commands.append({"type": "columns", "left": f"{item['quantity']}x {item['product_name']}", "right": f"RD$ {item_total:,.2f}"})
        if item.get("modifiers"):
            mods = ", ".join(m["name"] for m in item["modifiers"])
            commands.append({"type": "left", "text": f"  ({mods})"})
    
    commands.append({"type": "divider"})
    commands.append({"type": "columns", "left": "Subtotal", "right": f"RD$ {subtotal:,.2f}"})
    commands.append({"type": "columns", "left": "ITBIS 18%", "right": f"RD$ {itbis:,.2f}"})
    commands.append({"type": "columns", "left": "Propina Sugerida 10%", "right": f"RD$ {propina:,.2f}"})
    commands.append({"type": "columns", "bold": True, "left": "TOTAL ESTIMADO", "right": f"RD$ {total:,.2f}"})
    commands.append({"type": "divider"})
    commands.append({"type": "center", "text": "La propina es voluntaria"})
    commands.append({"type": "center", "text": "Este NO es un comprobante fiscal"})
    commands.append({"type": "feed", "lines": 2})
    commands.append({"type": "cut"})
    
    job = {
        "id": gen_id(),
        "type": "pre-check",
        "reference_id": order_id,
        "commands": commands,
        "status": "pending",
        "created_at": now_iso()
    }
    await db.print_queue.insert_one(job)
    
    return {"ok": True, "job_id": job["id"], "print_number": print_count + 1, "message": "Pre-cuenta enviada a impresora"}

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
async def download_print_agent(printer_name: str = Query("Caja", description="Nombre de la impresora en Windows")):
    """
    Descarga el agente de impresión configurado para tu servidor y impresora.
    Guárdalo como 'MesaPOS_PrintAgent.py' y ejecútalo con Python.
    """
    # Obtener la URL del servidor desde la configuración
    server_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://pos-fiscal-dr.preview.emergentagent.com')
    
    agent_code = f'''#!/usr/bin/env python3
"""
MESA POS RD - Agente de Impresion
==================================
Agente con icono en bandeja del sistema para Windows.

INSTALACION RAPIDA:
1. Instala Python desde https://www.python.org/downloads/
2. Abre CMD como Administrador y ejecuta:
   pip install requests pystray Pillow plyer pywin32

3. Guarda este archivo como: MesaPOS_PrintAgent.py
4. Doble click para ejecutar

Para que inicie con Windows:
- Presiona Win+R, escribe: shell:startup
- Crea un acceso directo a este archivo ahi

"""

import os
import sys
import time
import threading
import requests
from datetime import datetime

# ============ CONFIGURACION ============
SERVER_URL = "{server_url}"
PRINTER_NAME = "{printer_name}"
POLL_INTERVAL = 3

# Windows printer support
try:
    import win32print
    from PIL import Image, ImageDraw
    import pystray
    from pystray import MenuItem as item
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False
    print("ERROR: Faltan dependencias. Ejecuta:")
    print("  pip install requests pystray Pillow plyer pywin32")
    input("Presiona Enter para salir...")
    sys.exit(1)

try:
    from plyer import notification
    PLYER_AVAILABLE = True
except ImportError:
    PLYER_AVAILABLE = False

class AgentState:
    def __init__(self):
        self.running = True
        self.status = "starting"
        self.printer_name = PRINTER_NAME
        self.server_url = SERVER_URL
        self.last_error = ""
        self.jobs_printed = 0
        self.icon = None
        
state = AgentState()

def create_icon_image(color):
    size = 64
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse([4, 4, size-4, size-4], fill=color, outline='white')
    draw.rectangle([16, 24, 48, 44], fill='white', outline='black')
    draw.rectangle([20, 12, 44, 26], fill='white', outline='black')
    draw.rectangle([18, 42, 46, 52], fill='white', outline='black')
    return image

ICON_GREEN = None
ICON_YELLOW = None  
ICON_RED = None

def init_icons():
    global ICON_GREEN, ICON_YELLOW, ICON_RED
    ICON_GREEN = create_icon_image('#22C55E')
    ICON_YELLOW = create_icon_image('#EAB308')
    ICON_RED = create_icon_image('#EF4444')

def show_notification(title, message, timeout=5):
    if PLYER_AVAILABLE:
        try:
            notification.notify(title=title, message=message, app_name="Mesa POS", timeout=timeout)
        except:
            pass

def get_windows_printers():
    try:
        return [p[2] for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
    except:
        return []

def check_printer_exists(printer_name):
    return printer_name in get_windows_printers()

def print_raw_to_windows(printer_name, data):
    hprinter = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(hprinter, 1, ("Mesa POS Job", None, "RAW"))
        try:
            win32print.StartPagePrinter(hprinter)
            if isinstance(data, str):
                data = data.encode('cp437', errors='replace')
            win32print.WritePrinter(hprinter, data)
            win32print.EndPagePrinter(hprinter)
        finally:
            win32print.EndDocPrinter(hprinter)
    finally:
        win32print.ClosePrinter(hprinter)

def build_escpos_data(commands):
    ESC, GS = b'\\x1b', b'\\x1d'
    data = bytearray(ESC + b'@')
    
    for cmd in commands:
        cmd_type = cmd.get("type", "")
        text = cmd.get("text", "")
        
        if cmd_type == "center":
            data.extend(ESC + b'a\\x01')
            if cmd.get("bold"): data.extend(ESC + b'E\\x01')
            if cmd.get("size") == "large": data.extend(GS + b'!\\x11')
            data.extend(text.encode('cp437', errors='replace') + b'\\n')
            data.extend(ESC + b'E\\x00' + GS + b'!\\x00')
        elif cmd_type == "left":
            data.extend(ESC + b'a\\x00')
            if cmd.get("bold"): data.extend(ESC + b'E\\x01')
            if cmd.get("size") == "large": data.extend(GS + b'!\\x11')
            data.extend(text.encode('cp437', errors='replace') + b'\\n')
            data.extend(ESC + b'E\\x00' + GS + b'!\\x00')
        elif cmd_type == "right":
            data.extend(ESC + b'a\\x02')
            data.extend(text.encode('cp437', errors='replace') + b'\\n')
        elif cmd_type == "columns":
            data.extend(ESC + b'a\\x00')
            left, right = cmd.get("left", ""), cmd.get("right", "")
            spaces = max(1, 48 - len(left) - len(right))
            if cmd.get("bold"): data.extend(ESC + b'E\\x01')
            data.extend((left + " " * spaces + right).encode('cp437', errors='replace') + b'\\n')
            data.extend(ESC + b'E\\x00')
        elif cmd_type == "divider":
            data.extend(b'-' * 48 + b'\\n')
        elif cmd_type == "feed":
            data.extend(b'\\n' * cmd.get("lines", 1))
        elif cmd_type == "cut":
            data.extend(GS + b'V\\x00')
    
    return bytes(data)

def check_server():
    try:
        r = requests.get(f"{{state.server_url}}/api", timeout=5)
        return r.status_code == 200
    except:
        return False

def get_pending_jobs():
    try:
        r = requests.get(f"{{state.server_url}}/api/print-queue/pending", params={{"printer": state.printer_name}}, timeout=10)
        return r.json() if r.status_code == 200 else []
    except Exception as e:
        state.last_error = str(e)
        return []

def mark_job_complete(job_id, success=True):
    try:
        requests.post(f"{{state.server_url}}/api/print-queue/{{job_id}}/complete", json={{"success": success}}, timeout=5)
    except:
        pass

def update_icon_status():
    if state.icon:
        state.icon.icon = ICON_RED if state.status == "error" else (ICON_YELLOW if state.status == "printing" else ICON_GREEN)

def print_worker():
    processed = set()
    
    if not check_printer_exists(state.printer_name):
        state.status = "error"
        state.last_error = f"Impresora '{{state.printer_name}}' no encontrada"
        show_notification("Error", f"No se encontro '{{state.printer_name}}'\\nDisponibles: {{', '.join(get_windows_printers())}}")
        update_icon_status()
    else:
        state.status = "connected"
        show_notification("Mesa POS Activo", f"Conectado a: {{state.printer_name}}")
        update_icon_status()
    
    while state.running:
        try:
            if not check_server():
                if state.status != "error":
                    state.status = "error"
                    state.last_error = "Sin conexion al servidor"
                    update_icon_status()
                time.sleep(POLL_INTERVAL)
                continue
            
            jobs = get_pending_jobs()
            
            if state.status == "error" and state.last_error == "Sin conexion al servidor":
                state.status = "connected"
                update_icon_status()
            
            for job in jobs:
                job_id = job.get("id", "")
                if job_id in processed:
                    continue
                
                job_printer = job.get("printer_name", PRINTER_NAME)
                if job_printer != state.printer_name:
                    continue
                
                state.status = "printing"
                update_icon_status()
                
                try:
                    commands = job.get("commands", [])
                    if commands:
                        raw_data = build_escpos_data(commands)
                        print_raw_to_windows(state.printer_name, raw_data)
                        state.jobs_printed += 1
                        mark_job_complete(job_id, True)
                    processed.add(job_id)
                except Exception as e:
                    state.last_error = str(e)
                    state.status = "error"
                    update_icon_status()
                    show_notification("Error de Impresion", str(e)[:100])
                    mark_job_complete(job_id, False)
                    processed.add(job_id)
                finally:
                    if state.status == "printing":
                        state.status = "connected"
                        update_icon_status()
            
            if len(processed) > 100:
                processed = set(list(processed)[-50:])
            
            time.sleep(POLL_INTERVAL)
        except Exception as e:
            time.sleep(POLL_INTERVAL)

def on_quit(icon, item):
    state.running = False
    icon.stop()

def on_test_print(icon, item):
    try:
        cmds = [
            {{"type": "center", "text": "=" * 32}},
            {{"type": "center", "text": "MESA POS RD", "bold": True, "size": "large"}},
            {{"type": "center", "text": "=" * 32}},
            {{"type": "feed", "lines": 1}},
            {{"type": "center", "text": "PRUEBA DE IMPRESION", "bold": True}},
            {{"type": "left", "text": f"Fecha: {{datetime.now().strftime('%Y-%m-%d %H:%M')}}"}},
            {{"type": "left", "text": f"Impresora: {{state.printer_name}}"}},
            {{"type": "feed", "lines": 1}},
            {{"type": "center", "text": "Todo funciona correctamente!"}},
            {{"type": "feed", "lines": 2}},
            {{"type": "cut"}}
        ]
        print_raw_to_windows(state.printer_name, build_escpos_data(cmds))
        show_notification("Exito", "Prueba impresa correctamente")
    except Exception as e:
        show_notification("Error", str(e)[:100])

def on_show_status(icon, item):
    msg = f"Estado: {{state.status}}\\nImpresora: {{state.printer_name}}\\nTrabajos: {{state.jobs_printed}}"
    if state.last_error:
        msg += f"\\nError: {{state.last_error[:50]}}"
    show_notification("Estado", msg, timeout=10)

def on_show_printers(icon, item):
    printers = get_windows_printers()
    msg = "Impresoras:\\n" + "\\n".join(f"- {{p}}" for p in printers[:5]) if printers else "No hay impresoras"
    show_notification("Impresoras", msg, timeout=10)

def create_menu():
    return pystray.Menu(
        item('Estado', on_show_status),
        item('Imprimir Prueba', on_test_print),
        item('Ver Impresoras', on_show_printers),
        pystray.Menu.SEPARATOR,
        item('Salir', on_quit)
    )

def main():
    print("Mesa POS RD - Agente de Impresion")
    print("=" * 40)
    print(f"Servidor: {{state.server_url}}")
    print(f"Impresora: {{state.printer_name}}")
    print(f"Disponibles: {{get_windows_printers()}}")
    print("=" * 40)
    
    init_icons()
    threading.Thread(target=print_worker, daemon=True).start()
    
    state.icon = pystray.Icon("mesa_pos", ICON_GREEN, "Mesa POS - Impresion", menu=create_menu())
    state.icon.run()

if __name__ == "__main__":
    main()
'''
    
    return agent_code

@api.get("/download/print-agent-info")
async def get_print_agent_info():
    """Información sobre el agente de impresión"""
    return {
        "download_url": "/api/download/print-agent",
        "instructions": [
            "1. Instala Python desde https://www.python.org/downloads/",
            "2. Abre CMD como Administrador y ejecuta: pip install requests pystray Pillow plyer pywin32",
            "3. Descarga el agente desde /api/download/print-agent?printer_name=TuImpresora",
            "4. Guárdalo como MesaPOS_PrintAgent.py",
            "5. Doble click para ejecutar",
            "6. Para inicio automático: Win+R → shell:startup → crear acceso directo"
        ],
        "requirements": ["Python 3.8+", "requests", "pystray", "Pillow", "plyer", "pywin32"]
    }

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
    scheduler.start()
    await update_scheduler_from_config()
    logger.info("Scheduler started and configured")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()
