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
from routers.auth import get_current_user, verify_pin


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
    for user in users:
        if verify_pin(pin, user.get("pin_hash", "")):
            # Verificar que tenga permiso de close_day (admin o gerente)
            permissions = user.get("permissions", {})
            role = user.get("role", "")
            
            # Admin y gerentes tienen permiso por defecto
            if role in ["admin", "manager"]:
                return user
            
            # Verificar permiso específico
            if permissions.get("close_day", False):
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
    
    # Retornar sin _id
    del business_day["_id"] if "_id" in business_day else None
    
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
