# Customers & Loyalty Router
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import hmac
import hashlib
import os
import uuid

router = APIRouter(tags=["customers"])

# Database reference
db = None

def set_db(database):
    global db
    db = database

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _loyalty_token(customer_id: str) -> str:
    """Short HMAC-SHA256 (8 bytes hex = 16 chars) derived from JWT_SECRET to prevent enumeration."""
    secret = os.environ.get("JWT_SECRET", "fallback_secret").encode()
    mac = hmac.new(secret, f"loyalty-card:{customer_id}".encode(), hashlib.sha256).hexdigest()
    return mac[:16]

# ─── PYDANTIC MODELS ───
class CustomerInput(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    rnc: str = ""

# ─── CUSTOMERS ───
@router.get("/customers")
async def list_customers(
    search: Optional[str] = Query(None),
    rnc: Optional[str] = Query(None)
):
    """
    Lista clientes con filtros opcionales.
    - search: Busca por nombre, teléfono o email
    - rnc: Busca por RNC/Cédula exacto (para datos fiscales)
    """
    query = {}
    
    # Búsqueda por RNC específico (para validación fiscal)
    if rnc:
        # Limpiar el RNC de caracteres no numéricos
        cleaned_rnc = ''.join(c for c in rnc if c.isdigit())
        # Buscar tanto el RNC limpio como formateado
        query = {"$or": [
            {"rnc": cleaned_rnc},
            {"rnc": {"$regex": f"^{cleaned_rnc}$"}},
            # También buscar con formato (guiones)
            {"rnc": {"$regex": cleaned_rnc.replace("-", "")}}
        ]}
    elif search:
        query = {"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"rnc": {"$regex": search, "$options": "i"}}
        ]}
    
    return await db.customers.find(query, {"_id": 0}).sort("name", 1).to_list(500)

@router.get("/customers/{cid}")
async def get_customer(cid: str):
    customer = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return customer

@router.post("/customers")
async def create_customer(input: CustomerInput):
    doc = {
        "id": gen_id(), 
        "name": input.name, 
        "phone": input.phone, 
        "email": input.email,
        "rnc": input.rnc,
        "points": 0, 
        "total_spent": 0, 
        "visits": 0, 
        "created_at": now_iso(), 
        "last_visit": None
    }
    await db.customers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/customers/{cid}")
async def update_customer(cid: str, input: dict):
    if "_id" in input:
        del input["_id"]
    await db.customers.update_one({"id": cid}, {"$set": input})
    return {"ok": True}

@router.delete("/customers/{cid}")
async def delete_customer(cid: str):
    await db.customers.delete_one({"id": cid})
    return {"ok": True}

# ─── LOYALTY POINTS ───
@router.post("/customers/{cid}/add-points")
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

@router.post("/customers/{cid}/redeem-points")
async def redeem_customer_points(cid: str, input: dict):
    points_to_redeem = input.get("points", 0)
    customer = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not customer or customer["points"] < points_to_redeem:
        raise HTTPException(status_code=400, detail="Puntos insuficientes")
    config = await db.loyalty_config.find_one({}, {"_id": 0}) or {"point_value_rd": 1}
    discount = points_to_redeem * config.get("point_value_rd", 1)
    await db.customers.update_one({"id": cid}, {"$inc": {"points": -points_to_redeem}})
    return {"points_redeemed": points_to_redeem, "discount_rd": discount}

# ─── LOYALTY CONFIG ───
@router.get("/loyalty/config")
async def get_loyalty_config():
    config = await db.loyalty_config.find_one({}, {"_id": 0})
    return config or {"points_per_hundred": 10, "point_value_rd": 1, "min_redemption": 50}

@router.put("/loyalty/config")
async def update_loyalty_config(input: dict):
    if "_id" in input:
        del input["_id"]
    await db.loyalty_config.update_one({}, {"$set": input}, upsert=True)
    return {"ok": True}


# ─── LOYALTY — TOP CUSTOMERS (Dashboard widget) ───
@router.get("/loyalty/top-customers")
async def loyalty_top_customers(
    days: int = Query(30, ge=1, le=3650),
    limit: int = Query(10, ge=1, le=50),
):
    """Top clientes por actividad (pts ganados + canjeados) en los últimos N días.
    Si days>=3650 se considera 'siempre' (histórico completo)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff_iso = cutoff.isoformat()

    pipeline = [
        {"$match": {
            "status": "paid",
            "customer_id": {"$ne": ""},
            "paid_at": {"$gte": cutoff_iso},
        }},
        {"$group": {
            "_id": "$customer_id",
            "points_earned": {"$sum": {"$ifNull": ["$points_earned", 0]}},
            "points_redeemed": {"$sum": {"$ifNull": ["$loyalty_points_redeemed", 0]}},
            "total_spent": {"$sum": {"$ifNull": ["$total", 0]}},
            "visits": {"$sum": 1},
            "last_bill_at": {"$max": "$paid_at"},
        }},
        {"$addFields": {
            "activity": {"$add": ["$points_earned", "$points_redeemed"]},
        }},
        {"$sort": {"activity": -1, "total_spent": -1}},
        {"$limit": limit},
    ]

    agg = await db.bills.aggregate(pipeline).to_list(limit)
    if not agg:
        return {"days": days, "items": []}

    # Join with customers to get name + current points balance
    cust_ids = [row["_id"] for row in agg]
    custs = await db.customers.find({"id": {"$in": cust_ids}}, {"_id": 0, "id": 1, "name": 1, "points": 1, "phone": 1}).to_list(len(cust_ids))
    cust_map = {c["id"]: c for c in custs}

    items = []
    for i, row in enumerate(agg, start=1):
        c = cust_map.get(row["_id"], {})
        items.append({
            "rank": i,
            "customer_id": row["_id"],
            "name": c.get("name", "Cliente eliminado"),
            "phone": c.get("phone", ""),
            "current_points": c.get("points", 0),
            "points_earned": int(row.get("points_earned", 0)),
            "points_redeemed": int(row.get("points_redeemed", 0)),
            "activity": int(row.get("activity", 0)),
            "visits": int(row.get("visits", 0)),
            "total_spent": round(float(row.get("total_spent", 0)), 2),
            "last_bill_at": row.get("last_bill_at", ""),
        })
    return {"days": days, "items": items}


# ─── LOYALTY CARD (Digital + QR) ───
@router.get("/loyalty/card/{cid}")
async def get_loyalty_card_info(cid: str, request: Request):
    """Datos para generar la tarjeta digital (auth'd). Devuelve el token; el frontend arma la URL pública con su origin."""
    customer = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    token = _loyalty_token(cid)
    path = f"/loyalty-card/{cid}?token={token}"
    return {
        "customer_id": cid,
        "name": customer.get("name", ""),
        "points": customer.get("points", 0),
        "token": token,
        "path": path,
    }


@router.get("/loyalty/public-card/{cid}")
async def public_loyalty_card(cid: str, token: str = Query(...)):
    """Endpoint PÚBLICO (sin auth). Valida token HMAC y devuelve datos mostrables de la tarjeta."""
    expected = _loyalty_token(cid)
    if not hmac.compare_digest(expected, token):
        raise HTTPException(status_code=403, detail="Token inválido")

    customer = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    config = await db.loyalty_config.find_one({}, {"_id": 0}) or {"points_per_hundred": 10, "point_value_rd": 1, "min_redemption": 50}
    biz_config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}

    # Last 3 visits
    last_bills = await db.bills.find(
        {"customer_id": cid, "status": "paid"},
        {"_id": 0, "id": 1, "transaction_number": 1, "total": 1, "paid_at": 1, "points_earned": 1, "loyalty_points_redeemed": 1, "table_label": 1}
    ).sort("paid_at", -1).to_list(3)

    points = int(customer.get("points", 0) or 0)
    point_value = float(config.get("point_value_rd", 1) or 1)
    return {
        "customer_id": cid,
        "name": customer.get("name", ""),
        "points": points,
        "rd_equivalent": round(points * point_value, 2),
        "point_value_rd": point_value,
        "min_redemption": int(config.get("min_redemption", 50)),
        "business": {
            "name": biz_config.get("restaurant_name", "VexlyPOS"),
            "phone": biz_config.get("phone", ""),
            "address": biz_config.get("address", ""),
            "logo_url": biz_config.get("logo_url", ""),
        },
        "last_visits": [{
            "transaction_number": b.get("transaction_number", ""),
            "total": b.get("total", 0),
            "paid_at": b.get("paid_at", ""),
            "points_earned": b.get("points_earned", 0),
            "points_redeemed": b.get("loyalty_points_redeemed", 0),
            "label": b.get("table_label", ""),
        } for b in last_bills],
    }


@router.post("/loyalty/send-card-email/{cid}")
async def send_loyalty_card_email(cid: str, request: Request, body: dict = None):
    """Envía la tarjeta digital por email al cliente vía Resend.
    Body opcional: { email?: str, public_url?: str }  (public_url desde el frontend)"""
    import resend
    resend_key = os.environ.get("RESEND_API_KEY", "")
    if not resend_key:
        raise HTTPException(status_code=500, detail="Resend no está configurado")
    resend.api_key = resend_key

    customer = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    email = (body or {}).get("email") or customer.get("email", "")
    if not email:
        raise HTTPException(status_code=400, detail="El cliente no tiene email registrado")

    token = _loyalty_token(cid)
    # Use public_url from frontend if provided, else fallback to request origin
    public_url = (body or {}).get("public_url") or f"{str(request.base_url).rstrip('/')}/loyalty-card/{cid}?token={token}"

    config = await db.loyalty_config.find_one({}, {"_id": 0}) or {"point_value_rd": 1, "min_redemption": 50}
    biz_config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
    biz_name = biz_config.get("restaurant_name", "VexlyPOS")

    points = int(customer.get("points", 0) or 0)
    rd_eq = round(points * float(config.get("point_value_rd", 1) or 1), 2)
    qr_src = f"https://api.qrserver.com/v1/create-qr-code/?size=220x220&data={public_url}"

    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:20px auto;background:#0f172a;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.15);">
      <div style="background:linear-gradient(135deg,#7c3aed 0%,#ec4899 100%);padding:28px 24px;text-align:center;color:#fff;">
        <p style="margin:0;font-size:12px;letter-spacing:3px;opacity:.85;">TARJETA DE FIDELIDAD</p>
        <h1 style="margin:8px 0 0;font-size:26px;">{biz_name}</h1>
      </div>
      <div style="padding:28px 24px;text-align:center;color:#e2e8f0;">
        <p style="margin:0;font-size:13px;opacity:.7;">Titular</p>
        <p style="margin:4px 0 20px;font-size:22px;font-weight:700;color:#fff;">{customer.get('name','')}</p>
        <div style="background:#1e293b;border-radius:16px;padding:20px;margin-bottom:20px;">
          <p style="margin:0;font-size:11px;letter-spacing:2px;color:#a78bfa;">SALDO DE PUNTOS</p>
          <p style="margin:6px 0 0;font-size:44px;font-weight:800;color:#fff;">{points}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">≈ RD$ {rd_eq:,.2f}</p>
        </div>
        <img src="{qr_src}" alt="QR" width="220" height="220" style="display:block;margin:0 auto;border-radius:12px;background:#fff;padding:10px;" />
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Presenta este QR en caja para acumular o canjear tus puntos</p>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Mínimo de canje: {int(config.get('min_redemption',50))} pts</p>
        <a href="{public_url}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:14px;">Ver tarjeta en línea</a>
      </div>
      <div style="padding:16px;text-align:center;background:#020617;color:#64748b;font-size:11px;">
        {biz_config.get('address','')} · {biz_config.get('phone','')}
      </div>
    </div>
    """

    try:
        sender = f"{biz_name} <facturas@vexlyapp.com>"
        resend.Emails.send({
            "from": sender,
            "to": [email],
            "subject": f"Tu tarjeta de fidelidad {biz_name} — {points} pts",
            "html": html,
        })
        return {"ok": True, "sent_to": email, "public_url": public_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error enviando email: {str(e)}")



# ─── LOYALTY AUTO-EMAIL HELPERS (invoked from billing.pay_bill) ───
def _build_loyalty_card_html(biz_name: str, customer_name: str, points: int,
                             rd_eq: float, min_redemption: int, public_url: str,
                             title: str, subtitle: str,
                             biz_phone: str = "", biz_address: str = "") -> str:
    qr_src = f"https://api.qrserver.com/v1/create-qr-code/?size=220x220&data={public_url}"
    return f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:20px auto;background:#0f172a;border-radius:24px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.15);">
      <div style="background:linear-gradient(135deg,#7c3aed 0%,#ec4899 100%);padding:28px 24px;text-align:center;color:#fff;">
        <p style="margin:0;font-size:12px;letter-spacing:3px;opacity:.85;">{title}</p>
        <h1 style="margin:8px 0 0;font-size:26px;">{biz_name}</h1>
      </div>
      <div style="padding:28px 24px;text-align:center;color:#e2e8f0;">
        <p style="margin:0;font-size:14px;color:#cbd5e1;">{subtitle}</p>
        <p style="margin:18px 0 0;font-size:13px;opacity:.7;">Titular</p>
        <p style="margin:4px 0 20px;font-size:22px;font-weight:700;color:#fff;">{customer_name}</p>
        <div style="background:#1e293b;border-radius:16px;padding:20px;margin-bottom:20px;">
          <p style="margin:0;font-size:11px;letter-spacing:2px;color:#a78bfa;">SALDO DE PUNTOS</p>
          <p style="margin:6px 0 0;font-size:44px;font-weight:800;color:#fff;">{points}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">≈ RD$ {rd_eq:,.2f}</p>
        </div>
        <img src="{qr_src}" alt="QR" width="220" height="220" style="display:block;margin:0 auto;border-radius:12px;background:#fff;padding:10px;" />
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">Presenta este QR en caja para acumular o canjear tus puntos</p>
        <p style="margin:6px 0 0;font-size:12px;color:#94a3b8;">Mínimo de canje: {min_redemption} pts</p>
        <a href="{public_url}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:14px;">Ver tarjeta en línea</a>
      </div>
      <div style="padding:16px;text-align:center;background:#020617;color:#64748b;font-size:11px;">
        {biz_address} · {biz_phone}
      </div>
    </div>
    """


async def _auto_send_loyalty_email(cid: str, subject_prefix: str, title: str, subtitle: str, public_base_url: str) -> bool:
    """Envía email de tarjeta automática. Devuelve True si se envió. Silent failures."""
    try:
        import resend
        resend_key = os.environ.get("RESEND_API_KEY", "")
        if not resend_key:
            return False
        resend.api_key = resend_key

        customer = await db.customers.find_one({"id": cid}, {"_id": 0})
        if not customer or not customer.get("email"):
            return False

        config = await db.loyalty_config.find_one({}, {"_id": 0}) or {"point_value_rd": 1, "min_redemption": 50}
        biz_config = await db.system_config.find_one({"id": "main"}, {"_id": 0}) or {}
        biz_name = biz_config.get("restaurant_name", "VexlyPOS")

        token = _loyalty_token(cid)
        public_url = f"{public_base_url.rstrip('/')}/loyalty-card/{cid}?token={token}"

        points = int(customer.get("points", 0) or 0)
        rd_eq = round(points * float(config.get("point_value_rd", 1) or 1), 2)
        min_r = int(config.get("min_redemption", 50))

        html = _build_loyalty_card_html(
            biz_name=biz_name,
            customer_name=customer.get("name", ""),
            points=points,
            rd_eq=rd_eq,
            min_redemption=min_r,
            public_url=public_url,
            title=title,
            subtitle=subtitle,
            biz_phone=biz_config.get("phone", ""),
            biz_address=biz_config.get("address", ""),
        )

        resend.Emails.send({
            "from": f"{biz_name} <facturas@vexlyapp.com>",
            "to": [customer["email"]],
            "subject": f"{subject_prefix} — {biz_name}",
            "html": html,
        })
        return True
    except Exception:
        return False


async def trigger_loyalty_auto_emails(cid: str, prev_visits: int, prev_points: int,
                                     new_points: int, public_base_url: str) -> dict:
    """Trigger welcome (first visit) and threshold emails. Idempotent via flags on customer doc."""
    config = await db.loyalty_config.find_one({}, {"_id": 0}) or {"min_redemption": 50}
    min_r = int(config.get("min_redemption", 50))
    results = {"welcome_sent": False, "threshold_sent": False}

    customer = await db.customers.find_one({"id": cid}, {"_id": 0, "welcome_card_sent": 1, "last_threshold_notif_at": 1, "email": 1})
    if not customer or not customer.get("email"):
        return results

    # Trigger 1: Welcome email (first visit ever, not sent before)
    if prev_visits == 0 and not customer.get("welcome_card_sent"):
        ok = await _auto_send_loyalty_email(
            cid=cid,
            subject_prefix="¡Bienvenido a nuestro programa de fidelidad!",
            title="PROGRAMA DE FIDELIDAD",
            subtitle="¡Gracias por tu primera visita! Te damos la bienvenida a nuestro programa. Acumula puntos en cada visita y canjéalos por descuentos.",
            public_base_url=public_base_url,
        )
        if ok:
            await db.customers.update_one({"id": cid}, {"$set": {"welcome_card_sent": True, "welcome_card_sent_at": now_iso()}})
            results["welcome_sent"] = True

    # Trigger 2: Threshold reached (crossed from below to at/above min_redemption).
    # Skip if welcome was just sent OR threshold already notified in last 30 days.
    if not results["welcome_sent"] and prev_points < min_r <= new_points:
        last_notif = customer.get("last_threshold_notif_at")
        should_send = True
        if last_notif:
            try:
                last_dt = datetime.fromisoformat(last_notif.replace("Z", "+00:00"))
                if (datetime.now(timezone.utc) - last_dt) < timedelta(days=30):
                    should_send = False
            except Exception:
                pass
        if should_send:
            ok = await _auto_send_loyalty_email(
                cid=cid,
                subject_prefix=f"¡Ya puedes canjear tus {new_points} puntos!",
                title="PUNTOS LISTOS PARA CANJEAR",
                subtitle=f"Has alcanzado el mínimo de {min_r} puntos. En tu próxima visita puedes canjearlos por descuentos.",
                public_base_url=public_base_url,
            )
            if ok:
                await db.customers.update_one({"id": cid}, {"$set": {"last_threshold_notif_at": now_iso()}})
                results["threshold_sent"] = True

    return results
