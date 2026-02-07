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

class ProductInput(BaseModel):
    name: str
    category_id: str
    price: float
    modifier_group_ids: List[str] = []
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

class PayBillInput(BaseModel):
    payment_method: str = "cash"
    tip_percentage: float = 10
    additional_tip: float = 0

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

# ─── AUTH ───
@api.post("/auth/login")
async def login(input: LoginInput):
    hashed = hash_pin(input.pin)
    user = await db.users.find_one({"pin_hash": hashed, "active": True}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="PIN incorrecto")
    token = jwt.encode({"user_id": user["id"], "name": user["name"], "role": user["role"]}, JWT_SECRET, algorithm="HS256")
    return {"token": token, "user": user}

@api.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["user_id"]}, {"_id": 0, "pin_hash": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u

# ─── USERS ───
@api.get("/users")
async def list_users():
    return await db.users.find({}, {"_id": 0, "pin_hash": 0}).to_list(100)

@api.post("/users")
async def create_user(input: UserInput):
    doc = {"id": gen_id(), "name": input.name, "pin_hash": hash_pin(input.pin), "role": input.role, "active": True}
    await db.users.insert_one(doc)
    return {"id": doc["id"], "name": doc["name"], "role": doc["role"], "active": True}

@api.put("/users/{user_id}")
async def update_user(user_id: str, input: dict):
    if "pin" in input:
        input["pin_hash"] = hash_pin(input.pop("pin"))
    await db.users.update_one({"id": user_id}, {"$set": input})
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
    return await db.tables.find(query, {"_id": 0}).to_list(200)

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

@api.post("/products")
async def create_product(input: ProductInput):
    doc = {
        "id": gen_id(), "name": input.name, "category_id": input.category_id,
        "price": input.price, "modifier_group_ids": input.modifier_group_ids,
        "track_inventory": input.track_inventory, "active": True
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

@api.post("/modifiers")
async def create_modifier(input: ModifierGroupInput):
    options = [{"id": gen_id(), "name": o.name, "price": o.price} for o in input.options]
    doc = {"id": gen_id(), "name": input.name, "required": input.required, "max_selections": input.max_selections, "options": options}
    await db.modifiers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

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

    itbis = round(subtotal * 0.18, 2)
    propina = round(subtotal * (input.tip_percentage / 100), 2)
    total = round(subtotal + itbis + propina, 2)

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
        "itbis": itbis, "itbis_rate": 18,
        "propina_legal": propina, "propina_percentage": input.tip_percentage,
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
    total = round(bill["subtotal"] + bill["itbis"] + propina, 2)

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

    return await db.bills.find_one({"id": bill_id}, {"_id": 0})

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

# ─── INVENTORY ───
@api.get("/inventory")
async def list_inventory():
    return await db.inventory.find({}, {"_id": 0}).to_list(500)

@api.put("/inventory/{product_id}")
async def update_inventory(product_id: str, input: dict):
    if "_id" in input:
        del input["_id"]
    await db.inventory.update_one({"product_id": product_id}, {"$set": input}, upsert=True)
    return {"ok": True}

# ─── SEED ───
@api.post("/seed")
async def seed_data():
    count = await db.users.count_documents({})
    if count > 0:
        return {"message": "Datos ya sembrados", "seeded": False}

    # Users
    users = [
        {"id": gen_id(), "name": "Admin", "pin_hash": hash_pin("0000"), "role": "admin", "active": True},
        {"id": gen_id(), "name": "Carlos", "pin_hash": hash_pin("1234"), "role": "waiter", "active": True},
        {"id": gen_id(), "name": "Maria", "pin_hash": hash_pin("5678"), "role": "waiter", "active": True},
        {"id": gen_id(), "name": "Luis", "pin_hash": hash_pin("4321"), "role": "cashier", "active": True},
        {"id": gen_id(), "name": "Chef Pedro", "pin_hash": hash_pin("9999"), "role": "kitchen", "active": True},
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
