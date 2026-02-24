"""
Business Days Router - Jornadas de Trabajo
Sistema de fecha contable independiente del calendario civil.

Reglas:
- La fecha de negocio se establece al abrir el día
- Se mantiene fija hasta que un gerente cierre el día manualmente
- Todas las transacciones se registran con la fecha de jornada activa
- No se puede vender sin jornada abierta
- No se puede abrir nueva jornada si la anterior sigue abierta
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, date
from pymongo import ReturnDocument
import uuid
import os

router = APIRouter(prefix="/business-days", tags=["Business Days"])

# Database reference (MongoDB)
db = None

# Supabase client for pos_sessions integration
supabase_client = None


def set_db(database):
    global db
    db = database


def init_supabase():
    """Initialize Supabase client"""
    global supabase_client
    try:
        from supabase import create_client
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_ANON_KEY", "")
        if url and key:
            supabase_client = create_client(url, key)
    except Exception as e:
        print(f"Warning: Could not initialize Supabase for business_days: {e}")


def gen_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_str() -> str:
    """Returns today's date as YYYY-MM-DD string"""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# Import auth dependency
from routers.auth import get_current_user, hash_pin


# ─── INPUT MODELS ───

class OpenBusinessDayInput(BaseModel):
    business_date: Optional[str] = None  # YYYY-MM-DD format, defaults to today
    authorizer_pin: str  # PIN del gerente/admin que autoriza
    opening_notes: Optional[str] = None


class CloseBusinessDayInput(BaseModel):
    authorizer_pin: str  # PIN del gerente/admin que autoriza
    closing_notes: Optional[str] = None
    force_close: bool = False  # Forzar cierre aunque haya turnos abiertos


class AuthorizeDayActionInput(BaseModel):
    pin: str
    action: str  # "open" or "close"


# ─── HELPER FUNCTIONS ───

async def get_authorizer_by_pin(pin: str):
    """Verifica PIN y retorna usuario si tiene permiso de close_day"""
    users = await db.users.find({"active": True}, {"_id": 0}).to_list(100)
    pin_hash = hash_pin(pin)
    
    for user in users:
        if pin_hash == user.get("pin_hash", ""):
            # Verificar que tenga permiso de close_day (admin o gerente)
            permissions = user.get("permissions", {})
            role = user.get("role", "")
            
            # Admin y gerentes tienen permiso por defecto
            if role in ["admin", "manager"]:
                # Normalizar campos para compatibilidad
                user["user_id"] = user.get("id", user.get("user_id"))
                return user
            
            # Verificar permiso específico
            if permissions.get("close_day", False):
                user["user_id"] = user.get("id", user.get("user_id"))
                return user
            
            raise HTTPException(
                status_code=403,
                detail="El usuario no tiene permiso para autorizar apertura/cierre de día"
            )
    
    raise HTTPException(status_code=401, detail="PIN inválido")


async def get_current_business_day():
    """Obtiene la jornada de trabajo activa"""
    return await db.business_days.find_one(
        {"status": "open"},
        {"_id": 0}
    )


async def generate_day_ref() -> str:
    """Genera referencia única para jornada: JORNADA-2026-00001"""
    year = datetime.now().year
    count = await db.business_days.count_documents({"ref": {"$regex": f"^JORNADA-{year}-"}})
    return f"JORNADA-{year}-{str(count + 1).zfill(5)}"


# ─── ENDPOINTS ───

@router.get("/current")
async def get_current_day(user=Depends(get_current_user)):
    """Obtiene la jornada de trabajo activa"""
    business_day = await get_current_business_day()
    
    if not business_day:
        return {
            "has_open_day": False,
            "business_day": None,
            "message": "No hay jornada de trabajo abierta"
        }
    
    # Calcular estadísticas del día
    stats = await calculate_day_stats(business_day["id"])
    
    return {
        "has_open_day": True,
        "business_day": business_day,
        "stats": stats
    }


@router.get("/check")
async def check_business_day_status(user=Depends(get_current_user)):
    """
    Verifica rápidamente si hay jornada abierta.
    Este endpoint se usa para bloquear ventas si no hay jornada.
    """
    business_day = await get_current_business_day()
    
    return {
        "has_open_day": business_day is not None,
        "business_date": business_day.get("business_date") if business_day else None,
        "day_id": business_day.get("id") if business_day else None,
        "opened_at": business_day.get("opened_at") if business_day else None
    }


@router.post("/authorize")
async def authorize_day_action(input: AuthorizeDayActionInput):
    """
    Verifica si un PIN tiene autorización para abrir/cerrar día.
    Usado por el frontend antes de mostrar el formulario completo.
    """
    try:
        authorizer = await get_authorizer_by_pin(input.pin)
        return {
            "authorized": True,
            "authorizer_id": authorizer["user_id"],
            "authorizer_name": authorizer["name"],
            "authorizer_role": authorizer["role"],
            "action": input.action
        }
    except HTTPException as e:
        raise e


@router.post("/open")
async def open_business_day(input: OpenBusinessDayInput, user=Depends(get_current_user)):
    """
    Abre una nueva jornada de trabajo.
    
    Reglas:
    - No puede haber otra jornada abierta
    - Requiere autorización de gerente/admin (PIN)
    - La fecha de negocio se fija hasta el cierre
    """
    # Verificar autorización
    authorizer = await get_authorizer_by_pin(input.authorizer_pin)
    
    # Verificar que no haya jornada abierta
    existing = await get_current_business_day()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Ya existe una jornada abierta (Fecha: {existing['business_date']}). Debe cerrarla primero."
        )
    
    # Determinar fecha de negocio
    business_date = input.business_date or today_str()
    
    # Validar formato de fecha
    try:
        datetime.strptime(business_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Formato de fecha inválido. Use YYYY-MM-DD"
        )
    
    now = now_iso()
    day_ref = await generate_day_ref()
    
    business_day = {
        "id": gen_id(),
        "ref": day_ref,
        "business_date": business_date,
        "status": "open",
        # Timestamps
        "opened_at": now,
        "opened_by_id": user["user_id"],
        "opened_by_name": user["name"],
        "authorized_by_id": authorizer["user_id"],
        "authorized_by_name": authorizer["name"],
        # Totales (se actualizan durante el día)
        "total_sales": 0,
        "total_cash": 0,
        "total_card": 0,
        "total_transfer": 0,
        "total_other": 0,
        "total_invoices": 0,
        "total_voids": 0,
        "void_amount": 0,
        "total_b04": 0,
        "b04_amount": 0,
        # Sesiones/Turnos del día
        "sessions": [],
        # Notas
        "opening_notes": input.opening_notes,
        "closing_notes": None,
        "closed_at": None,
        "closed_by_id": None,
        "closed_by_name": None
    }
    
    await db.business_days.insert_one(business_day)
    
    # Retornar sin _id (ya está excluido en el return)
    
    return {
        "ok": True,
        "message": f"Jornada de trabajo abierta para {business_date}",
        "business_day": {k: v for k, v in business_day.items() if k != "_id"}
    }


@router.post("/close")
async def close_business_day(input: CloseBusinessDayInput, user=Depends(get_current_user)):
    """
    Cierra la jornada de trabajo activa.
    
    Reglas:
    - Debe haber una jornada abierta
    - Requiere autorización de gerente/admin (PIN)
    - Se recomienda cerrar todos los turnos primero (o usar force_close)
    """
    # Verificar autorización
    authorizer = await get_authorizer_by_pin(input.authorizer_pin)
    
    # Obtener jornada activa
    business_day = await get_current_business_day()
    if not business_day:
        raise HTTPException(
            status_code=400,
            detail="No hay jornada de trabajo abierta para cerrar"
        )
    
    # Verificar turnos abiertos
    if supabase_client:
        try:
            open_sessions = supabase_client.table("pos_sessions").select("id, ref, opened_by_name").eq("status", "open").execute()
            if open_sessions.data and len(open_sessions.data) > 0 and not input.force_close:
                session_names = [s["opened_by_name"] for s in open_sessions.data]
                raise HTTPException(
                    status_code=400,
                    detail=f"Hay {len(open_sessions.data)} turno(s) abierto(s): {', '.join(session_names)}. Ciérrelos primero o use force_close."
                )
        except HTTPException:
            raise
        except Exception as e:
            print(f"Warning: Could not check open sessions: {e}")
    
    # Calcular estadísticas finales
    stats = await calculate_day_stats(business_day["id"])
    
    now = now_iso()
    
    # Actualizar jornada
    update_data = {
        "status": "closed",
        "closed_at": now,
        "closed_by_id": user["user_id"],
        "closed_by_name": user["name"],
        "close_authorized_by_id": authorizer["user_id"],
        "close_authorized_by_name": authorizer["name"],
        "closing_notes": input.closing_notes,
        # Totales finales
        "total_sales": stats.get("total_sales", 0),
        "total_cash": stats.get("total_cash", 0),
        "total_card": stats.get("total_card", 0),
        "total_transfer": stats.get("total_transfer", 0),
        "total_other": stats.get("total_other", 0),
        "total_invoices": stats.get("total_invoices", 0),
        "total_voids": stats.get("total_voids", 0),
        "void_amount": stats.get("void_amount", 0),
        "total_b04": stats.get("total_b04", 0),
        "b04_amount": stats.get("b04_amount", 0)
    }
    
    await db.business_days.update_one(
        {"id": business_day["id"]},
        {"$set": update_data}
    )
    
    # Forzar cierre de turnos abiertos si force_close
    if input.force_close and supabase_client:
        try:
            supabase_client.table("pos_sessions").update({
                "status": "force_closed",
                "closed_at": now,
                "notes": f"Cierre forzado por cierre de jornada {business_day['ref']}"
            }).eq("status", "open").execute()
        except Exception as e:
            print(f"Warning: Could not force close sessions: {e}")
    
    return {
        "ok": True,
        "message": f"Jornada {business_day['ref']} cerrada exitosamente",
        "business_date": business_day["business_date"],
        "stats": stats
    }


@router.get("/history")
async def get_business_days_history(
    limit: int = Query(30, ge=1, le=100),
    status: Optional[str] = Query(None),
    user=Depends(get_current_user)
):
    """Obtiene historial de jornadas de trabajo"""
    query = {}
    if status:
        query["status"] = status
    
    days = await db.business_days.find(query, {"_id": 0}).sort("opened_at", -1).limit(limit).to_list(limit)
    return days


@router.get("/{day_id}")
async def get_business_day(day_id: str, user=Depends(get_current_user)):
    """Obtiene una jornada específica con sus estadísticas"""
    business_day = await db.business_days.find_one({"id": day_id}, {"_id": 0})
    
    if not business_day:
        raise HTTPException(status_code=404, detail="Jornada no encontrada")
    
    # Calcular estadísticas
    stats = await calculate_day_stats(day_id)
    
    return {
        "business_day": business_day,
        "stats": stats
    }


@router.get("/{day_id}/transactions")
async def get_day_transactions(
    day_id: str,
    user=Depends(get_current_user)
):
    """Obtiene todas las transacciones de una jornada"""
    business_day = await db.business_days.find_one({"id": day_id}, {"_id": 0})
    
    if not business_day:
        raise HTTPException(status_code=404, detail="Jornada no encontrada")
    
    business_date = business_day["business_date"]
    
    # Obtener facturas de esta jornada
    bills = await db.bills.find(
        {"business_date": business_date, "status": {"$in": ["paid", "reversed"]}},
        {"_id": 0}
    ).sort("paid_at", 1).to_list(500)
    
    # Obtener notas de crédito (B04)
    credit_notes = await db.credit_notes.find(
        {"business_date": business_date},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    
    return {
        "business_date": business_date,
        "bills": bills,
        "credit_notes": credit_notes,
        "totals": {
            "bills_count": len(bills),
            "credit_notes_count": len(credit_notes)
        }
    }


# ─── HELPER: Calculate Day Statistics ───

async def calculate_day_stats(day_id: str) -> dict:
    """Calcula estadísticas de una jornada de trabajo"""
    business_day = await db.business_days.find_one({"id": day_id}, {"_id": 0})
    
    if not business_day:
        return {}
    
    business_date = business_day["business_date"]
    
    # Ventas por forma de pago
    pipeline = [
        {"$match": {"business_date": business_date, "status": "paid"}},
        {"$group": {
            "_id": None,
            "total_sales": {"$sum": "$total"},
            "total_invoices": {"$sum": 1},
            "total_itbis": {"$sum": "$itbis"},
            "total_propina": {"$sum": "$propina_legal"}
        }}
    ]
    
    sales_result = await db.bills.aggregate(pipeline).to_list(1)
    sales = sales_result[0] if sales_result else {
        "total_sales": 0, "total_invoices": 0, "total_itbis": 0, "total_propina": 0
    }
    
    # Desglose por forma de pago
    payment_pipeline = [
        {"$match": {"business_date": business_date, "status": "paid"}},
        {"$unwind": {"path": "$payments", "preserveNullAndEmptyArrays": True}},
        {"$group": {
            "_id": "$payments.payment_method_name",
            "total": {"$sum": "$payments.amount_dop"},
            "count": {"$sum": 1}
        }}
    ]
    
    payment_result = await db.bills.aggregate(payment_pipeline).to_list(20)
    
    # Organizar por tipo
    total_cash = 0
    total_card = 0
    total_transfer = 0
    total_other = 0
    
    payment_breakdown = []
    for p in payment_result:
        name = p["_id"] or "Otro"
        amount = p["total"] or 0
        payment_breakdown.append({"method": name, "amount": amount, "count": p["count"]})
        
        name_lower = name.lower()
        if "efectivo" in name_lower or "cash" in name_lower:
            total_cash += amount
        elif "tarjeta" in name_lower or "card" in name_lower or "visa" in name_lower or "mastercard" in name_lower:
            total_card += amount
        elif "transfer" in name_lower:
            total_transfer += amount
        else:
            total_other += amount
    
    # Anulaciones
    voids = await db.bills.count_documents({
        "business_date": business_date,
        "status": "cancelled"
    })
    
    void_amount_pipeline = [
        {"$match": {"business_date": business_date, "status": "cancelled"}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ]
    void_result = await db.bills.aggregate(void_amount_pipeline).to_list(1)
    void_amount = void_result[0]["total"] if void_result else 0
    
    # Notas de crédito B04
    b04_pipeline = [
        {"$match": {"business_date": business_date}},
        {"$group": {
            "_id": None,
            "count": {"$sum": 1},
            "total": {"$sum": "$amount"}
        }}
    ]
    b04_result = await db.credit_notes.aggregate(b04_pipeline).to_list(1)
    b04_stats = b04_result[0] if b04_result else {"count": 0, "total": 0}
    
    return {
        "business_date": business_date,
        "total_sales": sales.get("total_sales", 0),
        "total_invoices": sales.get("total_invoices", 0),
        "total_itbis": sales.get("total_itbis", 0),
        "total_propina": sales.get("total_propina", 0),
        "total_cash": total_cash,
        "total_card": total_card,
        "total_transfer": total_transfer,
        "total_other": total_other,
        "payment_breakdown": payment_breakdown,
        "total_voids": voids,
        "void_amount": void_amount,
        "total_b04": b04_stats.get("count", 0),
        "b04_amount": b04_stats.get("total", 0)
    }


# ─── UTILITY: Get business date for new transactions ───

async def get_current_business_date() -> Optional[str]:
    """
    Retorna la fecha de negocio actual si hay jornada abierta.
    Usado por otros módulos para asignar business_date a transacciones.
    """
    business_day = await get_current_business_day()
    if business_day:
        return business_day["business_date"]
    return None


async def require_business_day():
    """
    Dependency que bloquea operaciones si no hay jornada abierta.
    Usar en endpoints que requieren jornada activa.
    """
    business_day = await get_current_business_day()
    if not business_day:
        raise HTTPException(
            status_code=403,
            detail="No hay jornada de trabajo abierta. Debe abrir el día antes de realizar ventas."
        )
    return business_day



# ═══════════════════════════════════════════════════════════════════════════════
# REPORTES X y Z - Cierres de Turno y Día
# ═══════════════════════════════════════════════════════════════════════════════

class ReportInput(BaseModel):
    session_id: Optional[str] = None  # Para reporte X (turno específico)
    include_details: bool = True  # Incluir desglose detallado


@router.get("/current/report-z")
async def generate_current_z_report(user=Depends(get_current_user)):
    """
    Genera el Reporte Z para la jornada actual (si existe).
    Útil para ver un preview antes de cerrar el día.
    """
    business_day = await get_current_business_day()
    
    if not business_day:
        raise HTTPException(
            status_code=404,
            detail="No hay jornada de trabajo abierta"
        )
    
    return await generate_z_report_internal(business_day["id"], user)


@router.get("/{day_id}/report-z")
async def generate_z_report(
    day_id: str,
    user=Depends(get_current_user)
):
    """
    Genera el Reporte Z (Cierre de Día) completo por ID.
    """
    return await generate_z_report_internal(day_id, user)


async def generate_z_report_internal(
    day_id: str,
    user
):
    """
    Genera el Reporte Z (Cierre de Día) completo.
    
    Incluye:
    - Desglose por forma de pago (Efectivo, Tarjeta, Dólar, Euro)
    - Notas de crédito B04
    - Ventas por categoría de producto
    - Descuentos y anulaciones con razones
    - Resumen final: Fondo Inicial + Ventas - Retiros = Total a Entregar
    """
    business_day = await db.business_days.find_one({"id": day_id}, {"_id": 0})
    
    if not business_day:
        raise HTTPException(status_code=404, detail="Jornada no encontrada")
    
    business_date = business_day["business_date"]
    
    # ═══ 1. VENTAS TOTALES ═══
    sales_pipeline = [
        {"$match": {"business_date": business_date, "status": "paid"}},
        {"$group": {
            "_id": None,
            "subtotal": {"$sum": "$subtotal"},
            "itbis": {"$sum": "$itbis"},
            "propina": {"$sum": "$propina_legal"},
            "total": {"$sum": "$total"},
            "count": {"$sum": 1}
        }}
    ]
    sales_result = await db.bills.aggregate(sales_pipeline).to_list(1)
    sales_totals = sales_result[0] if sales_result else {
        "subtotal": 0, "itbis": 0, "propina": 0, "total": 0, "count": 0
    }
    
    # ═══ 2. DESGLOSE POR FORMA DE PAGO ═══
    payment_pipeline = [
        {"$match": {"business_date": business_date, "status": "paid"}},
        {"$unwind": {"path": "$payments", "preserveNullAndEmptyArrays": True}},
        {"$group": {
            "_id": {
                "method_name": {"$ifNull": ["$payments.payment_method_name", "$payment_method_name"]},
                "currency": {"$ifNull": ["$payments.currency", "DOP"]}
            },
            "amount_dop": {"$sum": {"$ifNull": ["$payments.amount_dop", "$total"]}},
            "amount_original": {"$sum": {"$ifNull": ["$payments.amount", "$total"]}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"amount_dop": -1}}
    ]
    payment_result = await db.payments.aggregate(payment_pipeline).to_list(20) if hasattr(db, 'payments') else []
    
    # Fallback: agrupar desde bills si no hay colección payments
    if not payment_result:
        payment_pipeline = [
            {"$match": {"business_date": business_date, "status": "paid"}},
            {"$unwind": {"path": "$payments", "preserveNullAndEmptyArrays": True}},
            {"$group": {
                "_id": {"$ifNull": ["$payments.payment_method_name", "$payment_method_name"]},
                "amount": {"$sum": {"$ifNull": ["$payments.amount_dop", "$total"]}},
                "count": {"$sum": 1}
            }},
            {"$sort": {"amount": -1}}
        ]
        payment_result = await db.bills.aggregate(payment_pipeline).to_list(20)
    
    # Organizar por tipo de pago
    payment_breakdown = []
    totals_by_type = {"efectivo": 0, "tarjeta": 0, "transferencia": 0, "dolar": 0, "euro": 0, "otro": 0}
    
    for p in payment_result:
        method_name = p.get("_id") or "Otro"
        if isinstance(method_name, dict):
            method_name = method_name.get("method_name", "Otro")
        
        amount = p.get("amount") or p.get("amount_dop", 0)
        count = p.get("count", 0)
        
        payment_breakdown.append({
            "method": method_name,
            "amount": round(amount, 2),
            "count": count
        })
        
        # Clasificar por tipo
        name_lower = (method_name or "").lower()
        if "efectivo" in name_lower or "cash" in name_lower:
            totals_by_type["efectivo"] += amount
        elif "tarjeta" in name_lower or "card" in name_lower or "visa" in name_lower or "mastercard" in name_lower:
            totals_by_type["tarjeta"] += amount
        elif "transfer" in name_lower:
            totals_by_type["transferencia"] += amount
        elif "dolar" in name_lower or "usd" in name_lower or "$" in name_lower:
            totals_by_type["dolar"] += amount
        elif "euro" in name_lower or "eur" in name_lower or "€" in name_lower:
            totals_by_type["euro"] += amount
        else:
            totals_by_type["otro"] += amount
    
    # ═══ 3. VENTAS POR CATEGORÍA ═══
    category_pipeline = [
        {"$match": {"business_date": business_date, "status": "paid"}},
        {"$unwind": "$items"},
        {"$lookup": {
            "from": "products",
            "localField": "items.product_id",
            "foreignField": "id",
            "as": "product_info"
        }},
        {"$unwind": {"path": "$product_info", "preserveNullAndEmptyArrays": True}},
        {"$lookup": {
            "from": "categories",
            "localField": "product_info.category_id",
            "foreignField": "id",
            "as": "category_info"
        }},
        {"$unwind": {"path": "$category_info", "preserveNullAndEmptyArrays": True}},
        {"$group": {
            "_id": {
                "category_id": "$product_info.category_id",
                "category_name": {"$ifNull": ["$category_info.name", "Sin Categoría"]}
            },
            "quantity": {"$sum": "$items.quantity"},
            "subtotal": {"$sum": "$items.total"},
            "items_count": {"$sum": 1}
        }},
        {"$sort": {"subtotal": -1}}
    ]
    category_result = await db.bills.aggregate(category_pipeline).to_list(50)
    
    sales_by_category = []
    for cat in category_result:
        sales_by_category.append({
            "category_id": cat["_id"].get("category_id"),
            "category_name": cat["_id"].get("category_name", "Sin Categoría"),
            "quantity": round(cat.get("quantity", 0), 2),
            "subtotal": round(cat.get("subtotal", 0), 2),
            "items_count": cat.get("items_count", 0)
        })
    
    # ═══ 4. NOTAS DE CRÉDITO (B04) ═══
    b04_pipeline = [
        {"$match": {"business_date": business_date}},
        {"$project": {
            "_id": 0,
            "ncf": 1,
            "original_ncf": 1,
            "amount": 1,
            "reason": 1,
            "created_at": 1,
            "created_by_name": 1
        }}
    ]
    credit_notes = await db.credit_notes.aggregate(b04_pipeline).to_list(100)
    
    b04_total = sum(cn.get("amount", 0) for cn in credit_notes)
    
    # ═══ 5. ANULACIONES Y DESCUENTOS ═══
    voids_pipeline = [
        {"$match": {"business_date": business_date, "status": "cancelled"}},
        {"$project": {
            "_id": 0,
            "id": 1,
            "transaction_number": 1,
            "label": 1,
            "total": 1,
            "cancellation_reason": 1,
            "cancelled_at": 1,
            "cancelled_by_name": 1
        }}
    ]
    voids = await db.bills.aggregate(voids_pipeline).to_list(100)
    voids_total = sum(v.get("total", 0) for v in voids)
    
    # Descuentos aplicados (si existe campo discount en bills)
    discounts_pipeline = [
        {"$match": {"business_date": business_date, "status": "paid", "discount": {"$gt": 0}}},
        {"$group": {
            "_id": None,
            "total_discount": {"$sum": "$discount"},
            "count": {"$sum": 1}
        }}
    ]
    discounts_result = await db.bills.aggregate(discounts_pipeline).to_list(1)
    discounts_total = discounts_result[0].get("total_discount", 0) if discounts_result else 0
    discounts_count = discounts_result[0].get("count", 0) if discounts_result else 0
    
    # ═══ 6. MOVIMIENTOS DE CAJA (Fondo, Retiros) ═══
    # Buscar sesiones POS de este día
    initial_fund = 0
    withdrawals = 0
    deposits = 0
    
    if supabase_client:
        try:
            # Obtener sesiones del día
            sessions_response = supabase_client.table("pos_sessions").select("*").gte(
                "opened_at", f"{business_date}T00:00:00"
            ).lte(
                "opened_at", f"{business_date}T23:59:59"
            ).execute()
            
            if sessions_response.data:
                for session in sessions_response.data:
                    initial_fund += session.get("initial_cash", 0) or 0
                    
                    # Obtener movimientos de cada sesión
                    movements = supabase_client.table("pos_movements").select("*").eq(
                        "session_id", session["id"]
                    ).execute()
                    
                    if movements.data:
                        for mov in movements.data:
                            if mov.get("type") == "withdrawal":
                                withdrawals += mov.get("amount", 0)
                            elif mov.get("type") == "deposit":
                                deposits += mov.get("amount", 0)
        except Exception as e:
            print(f"Warning: Could not fetch POS sessions: {e}")
    
    # ═══ 7. CÁLCULO FINAL DE CAJA ═══
    # Fórmula: Fondo Inicial + Ventas Efectivo + Depósitos - Retiros = Total a Entregar
    cash_sales = totals_by_type["efectivo"]
    total_to_deliver = initial_fund + cash_sales + deposits - withdrawals
    
    # ═══ 8. INFORMACIÓN DE JORNADA ═══
    report = {
        "report_type": "Z",
        "report_name": "REPORTE Z - CIERRE DE DÍA",
        "business_day": {
            "ref": business_day.get("ref"),
            "business_date": business_date,
            "opened_at": business_day.get("opened_at"),
            "opened_by": business_day.get("opened_by_name"),
            "closed_at": business_day.get("closed_at"),
            "closed_by": business_day.get("closed_by_name"),
            "status": business_day.get("status")
        },
        "generated_at": now_iso(),
        "generated_by": user.get("name"),
        
        # Resumen de Ventas
        "sales_summary": {
            "subtotal": round(sales_totals.get("subtotal", 0), 2),
            "itbis": round(sales_totals.get("itbis", 0), 2),
            "propina": round(sales_totals.get("propina", 0), 2),
            "total": round(sales_totals.get("total", 0), 2),
            "invoices_count": sales_totals.get("count", 0)
        },
        
        # Desglose por Forma de Pago
        "payment_breakdown": payment_breakdown,
        "payment_totals": {
            "efectivo": round(totals_by_type["efectivo"], 2),
            "tarjeta": round(totals_by_type["tarjeta"], 2),
            "transferencia": round(totals_by_type["transferencia"], 2),
            "dolar": round(totals_by_type["dolar"], 2),
            "euro": round(totals_by_type["euro"], 2),
            "otro": round(totals_by_type["otro"], 2)
        },
        
        # Ventas por Categoría
        "sales_by_category": sales_by_category,
        
        # Notas de Crédito B04
        "credit_notes": {
            "list": credit_notes,
            "count": len(credit_notes),
            "total": round(b04_total, 2)
        },
        
        # Anulaciones
        "voids": {
            "list": voids,
            "count": len(voids),
            "total": round(voids_total, 2)
        },
        
        # Descuentos
        "discounts": {
            "count": discounts_count,
            "total": round(discounts_total, 2)
        },
        
        # Cuadre de Caja
        "cash_reconciliation": {
            "initial_fund": round(initial_fund, 2),
            "cash_sales": round(cash_sales, 2),
            "deposits": round(deposits, 2),
            "withdrawals": round(withdrawals, 2),
            "total_to_deliver": round(total_to_deliver, 2),
            "formula": "Fondo Inicial + Ventas Efectivo + Depósitos - Retiros = Total a Entregar"
        }
    }
    
    return report


@router.get("/session/{session_id}/report-x")
async def generate_x_report(
    session_id: str,
    user=Depends(get_current_user)
):
    """
    Genera el Reporte X (Cierre de Turno) para una sesión específica.
    
    Similar al Reporte Z pero solo incluye transacciones de la sesión.
    """
    # Obtener sesión de Supabase
    if not supabase_client:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    try:
        session_response = supabase_client.table("pos_sessions").select("*").eq("id", session_id).single().execute()
        session = session_response.data
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Sesión no encontrada: {e}")
    
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    
    # Obtener jornada activa para contexto
    business_day = await get_current_business_day()
    business_date = business_day.get("business_date") if business_day else session.get("business_date")
    
    opened_at = session.get("opened_at")
    closed_at = session.get("closed_at")
    
    # Filtrar por rango de tiempo de la sesión
    time_filter = {"paid_at": {"$gte": opened_at}}
    if closed_at:
        time_filter["paid_at"]["$lte"] = closed_at
    
    # ═══ 1. VENTAS DE LA SESIÓN ═══
    sales_pipeline = [
        {"$match": {
            **time_filter,
            "status": "paid",
            "paid_by_id": session.get("opened_by_id")
        }},
        {"$group": {
            "_id": None,
            "subtotal": {"$sum": "$subtotal"},
            "itbis": {"$sum": "$itbis"},
            "propina": {"$sum": "$propina_legal"},
            "total": {"$sum": "$total"},
            "count": {"$sum": 1}
        }}
    ]
    sales_result = await db.bills.aggregate(sales_pipeline).to_list(1)
    sales_totals = sales_result[0] if sales_result else {
        "subtotal": 0, "itbis": 0, "propina": 0, "total": 0, "count": 0
    }
    
    # ═══ 2. DESGLOSE POR FORMA DE PAGO ═══
    payment_pipeline = [
        {"$match": {
            **time_filter,
            "status": "paid",
            "paid_by_id": session.get("opened_by_id")
        }},
        {"$unwind": {"path": "$payments", "preserveNullAndEmptyArrays": True}},
        {"$group": {
            "_id": {"$ifNull": ["$payments.payment_method_name", "$payment_method_name"]},
            "amount": {"$sum": {"$ifNull": ["$payments.amount_dop", "$total"]}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"amount": -1}}
    ]
    payment_result = await db.bills.aggregate(payment_pipeline).to_list(20)
    
    payment_breakdown = []
    cash_total = 0
    card_total = 0
    
    for p in payment_result:
        method_name = p.get("_id") or "Otro"
        amount = p.get("amount", 0)
        payment_breakdown.append({
            "method": method_name,
            "amount": round(amount, 2),
            "count": p.get("count", 0)
        })
        
        name_lower = (method_name or "").lower()
        if "efectivo" in name_lower or "cash" in name_lower:
            cash_total += amount
        elif "tarjeta" in name_lower or "card" in name_lower:
            card_total += amount
    
    # ═══ 3. MOVIMIENTOS DE LA SESIÓN ═══
    initial_fund = session.get("initial_cash", 0) or 0
    withdrawals = 0
    deposits = 0
    
    try:
        movements = supabase_client.table("pos_movements").select("*").eq(
            "session_id", session_id
        ).execute()
        
        if movements.data:
            for mov in movements.data:
                if mov.get("type") == "withdrawal":
                    withdrawals += mov.get("amount", 0)
                elif mov.get("type") == "deposit":
                    deposits += mov.get("amount", 0)
    except Exception as e:
        print(f"Warning: Could not fetch movements: {e}")
    
    # ═══ 4. CÁLCULO DE CAJA ═══
    total_to_deliver = initial_fund + cash_total + deposits - withdrawals
    
    report = {
        "report_type": "X",
        "report_name": "REPORTE X - CIERRE DE TURNO",
        "session": {
            "id": session.get("id"),
            "ref": session.get("ref"),
            "terminal": session.get("terminal_code"),
            "opened_at": session.get("opened_at"),
            "opened_by": session.get("opened_by_name"),
            "closed_at": session.get("closed_at"),
            "status": session.get("status")
        },
        "business_date": business_date,
        "generated_at": now_iso(),
        "generated_by": user.get("name"),
        
        # Resumen de Ventas
        "sales_summary": {
            "subtotal": round(sales_totals.get("subtotal", 0), 2),
            "itbis": round(sales_totals.get("itbis", 0), 2),
            "propina": round(sales_totals.get("propina", 0), 2),
            "total": round(sales_totals.get("total", 0), 2),
            "invoices_count": sales_totals.get("count", 0)
        },
        
        # Desglose por Forma de Pago
        "payment_breakdown": payment_breakdown,
        "payment_totals": {
            "efectivo": round(cash_total, 2),
            "tarjeta": round(card_total, 2)
        },
        
        # Cuadre de Caja
        "cash_reconciliation": {
            "initial_fund": round(initial_fund, 2),
            "cash_sales": round(cash_total, 2),
            "deposits": round(deposits, 2),
            "withdrawals": round(withdrawals, 2),
            "total_to_deliver": round(total_to_deliver, 2),
            "cash_declared": round(session.get("cash_declared", 0) or 0, 2),
            "expected_cash": round(session.get("expected_cash", 0) or 0, 2),
            "difference": round(session.get("total_difference", 0) or 0, 2),
            "formula": "Fondo Inicial + Ventas Efectivo + Depósitos - Retiros = Total a Entregar"
        }
    }
    
    return report



