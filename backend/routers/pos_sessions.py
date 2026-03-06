"""
POS Sessions Router - Supabase Integration
Maneja sesiones de caja (turnos) y movimientos de efectivo
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from supabase import create_client, Client
import os
import uuid

# Import MongoDB db from server
from motor.motor_asyncio import AsyncIOMotorClient

router = APIRouter(prefix="/pos-sessions", tags=["POS Sessions"])

# MongoDB connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "pos_db")
mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]

# Supabase client
supabase_url = os.environ.get("SUPABASE_URL", "")
supabase_key = os.environ.get("SUPABASE_ANON_KEY", "")
supabase: Client = None

def get_supabase() -> Client:
    global supabase
    if supabase is None:
        if not supabase_url or not supabase_key:
            raise HTTPException(status_code=500, detail="Supabase no configurado")
        supabase = create_client(supabase_url, supabase_key)
    return supabase

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def generate_session_ref() -> str:
    """Genera referencia unica para sesion: TURNO-2025-00001"""
    year = datetime.now().year
    # Get count for this year
    try:
        sb = get_supabase()
        result = sb.table("pos_sessions").select("ref", count="exact").like("ref", f"TURNO-{year}-%").execute()
        count = result.count or 0
        return f"TURNO-{year}-{str(count + 1).zfill(5)}"
    except:
        return f"TURNO-{year}-{gen_id()[:5].upper()}"

def generate_movement_ref() -> str:
    """Genera referencia unica para movimiento: MOV-2025-00001"""
    year = datetime.now().year
    try:
        sb = get_supabase()
        result = sb.table("cash_movements").select("ref", count="exact").like("ref", f"MOV-{year}-%").execute()
        count = result.count or 0
        return f"MOV-{year}-{str(count + 1).zfill(5)}"
    except:
        return f"MOV-{year}-{gen_id()[:5].upper()}"


# ─── INPUT MODELS ───

class OpenSessionInput(BaseModel):
    terminal_id: Optional[str] = None
    terminal_name: str = "Caja 1"
    opening_amount: float = 0.0
    notes: Optional[str] = None

class CloseSessionInput(BaseModel):
    cash_declared: float
    card_declared: Optional[float] = 0.0
    transfer_declared: Optional[float] = 0.0
    other_declared: Optional[float] = 0.0
    cash_breakdown: Optional[dict] = None
    difference_notes: Optional[str] = None

class CashMovementInput(BaseModel):
    movement_type: str  # cash_in, cash_out, deposit, petty_cash, tip_out, adjustment
    amount: float
    description: str
    payment_method: str = "cash"  # cash, card, transfer, check, other
    reason_code: Optional[str] = None
    third_party_id: Optional[str] = None
    third_party_name: Optional[str] = None
    notes: Optional[str] = None
    requires_approval: bool = False


# ─── HELPER: Get current user from MongoDB auth ───
# Import from auth router
from routers.auth import get_current_user


# ─── ENDPOINTS ───

@router.get("/health")
async def health_check():
    """Verifica conexion a Supabase"""
    try:
        sb = get_supabase()
        # Try to access pos_sessions table
        result = sb.table("pos_sessions").select("id").limit(1).execute()
        return {"status": "ok", "supabase": "connected", "sessions_found": len(result.data) if result.data else 0}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@router.get("/current")
async def get_current_session(user=Depends(get_current_user)):
    """Obtiene la sesion activa del usuario actual"""
    try:
        sb = get_supabase()
        result = sb.table("pos_sessions").select("*").eq("opened_by", user["user_id"]).eq("status", "open").limit(1).execute()
        
        if result.data and len(result.data) > 0:
            return result.data[0]
        return None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando sesion: {str(e)}")


@router.get("/check")
async def check_session_status(user=Depends(get_current_user)):
    """Verifica si el usuario tiene sesion abierta"""
    try:
        sb = get_supabase()
        result = sb.table("pos_sessions").select("id, ref, terminal_name, opened_at, opening_amount").eq("opened_by", user["user_id"]).eq("status", "open").limit(1).execute()
        
        has_session = len(result.data) > 0 if result.data else False
        return {
            "has_open_session": has_session,
            "session": result.data[0] if has_session else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/open")
async def open_session(input: OpenSessionInput, user=Depends(get_current_user)):
    """Abre una nueva sesion de caja"""
    try:
        sb = get_supabase()
        
        # Verificar si ya tiene sesion abierta
        existing = sb.table("pos_sessions").select("*").eq("opened_by", user["user_id"]).eq("status", "open").limit(1).execute()
        
        if existing.data and len(existing.data) > 0:
            return existing.data[0]  # Retornar sesion existente
        
        # Crear nueva sesion
        session_id = gen_id()
        session_ref = generate_session_ref()
        now = now_iso()
        
        session_data = {
            "id": session_id,
            "ref": session_ref,
            "terminal_id": None,
            "terminal_name": input.terminal_name,
            "opening_amount": input.opening_amount,
            "opened_at": now,
            "opened_by": user["user_id"],
            "opened_by_name": user["name"],
            "cash_sales": 0,
            "card_sales": 0,
            "transfer_sales": 0,
            "other_sales": 0,
            "total_invoices": 0,
            "total_voids": 0,
            "void_amount": 0,
            "cash_in": 0,
            "cash_out": 0,
            "cash_movements_count": 0,
            "status": "open",
            "notes": input.notes
        }
        
        result = sb.table("pos_sessions").insert(session_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Error creando sesion")
        
        session = result.data[0]
        
        # Crear movimiento de apertura
        if input.opening_amount > 0:
            movement_data = {
                "id": gen_id(),
                "ref": generate_movement_ref(),
                "session_id": session_id,
                "movement_type": "opening",
                "direction": 1,
                "amount": input.opening_amount,
                "payment_method": "cash",
                "description": f"Fondo de apertura - {session_ref}",
                "created_by": user["user_id"],
                "created_by_name": user["name"]
            }
            
            sb.table("cash_movements").insert(movement_data).execute()
        
        return session
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error abriendo sesion: {str(e)}")


@router.put("/{session_id}/close")
async def close_session(session_id: str, input: CloseSessionInput, user=Depends(get_current_user)):
    """Cierra una sesion de caja"""
    try:
        sb = get_supabase()
        
        # Obtener sesion actual
        session_result = sb.table("pos_sessions").select("*").eq("id", session_id).single().execute()
        
        if not session_result.data:
            raise HTTPException(status_code=404, detail="Sesion no encontrada")
        
        session = session_result.data
        
        if session["status"] != "open":
            raise HTTPException(status_code=400, detail="La sesion no esta abierta")
        
        # ═══════════════════════════════════════════════════════════════════════════════
        # VALIDACIÓN: El cajero solo puede cerrar si NO tiene cuentas abiertas propias
        # (Las cuentas de otros cajeros NO le afectan)
        # ═══════════════════════════════════════════════════════════════════════════════
        user_id = session.get("opened_by") or user["user_id"]
        
        open_orders_cursor = db.orders.find({
            "status": {"$nin": ["closed", "paid", "cancelled"]},
            "$or": [
                {"waiter_id": user_id},
                {"created_by": user_id}
            ]
        }, {"_id": 0, "table_number": 1, "id": 1})
        open_orders = await open_orders_cursor.to_list(100)
        
        if open_orders:
            table_numbers = list(set([str(o.get("table_number", "?")) for o in open_orders]))
            tables_str = ", ".join([f"Mesa {t}" for t in table_numbers[:5]])
            if len(table_numbers) > 5:
                tables_str += f" y {len(table_numbers) - 5} mas"
            raise HTTPException(
                status_code=400,
                detail=f"No puedes cerrar turno. Tienes {len(open_orders)} cuenta(s) abierta(s): {tables_str}. Cierra o transfiere estas cuentas primero."
            )
        
        # Calcular efectivo esperado
        expected_cash = (
            session.get("opening_amount", 0) + 
            session.get("cash_sales", 0) + 
            session.get("cash_in", 0) - 
            session.get("cash_out", 0)
        )
        
        # Calcular diferencias
        cash_difference = input.cash_declared - expected_cash
        card_difference = input.card_declared - session.get("card_sales", 0) if input.card_declared else 0
        total_difference = cash_difference + card_difference
        
        now = now_iso()
        
        # Determinar estado final
        # Si hay diferencia significativa (> 50 RD$), requiere aprobacion
        final_status = "closed"
        if abs(total_difference) > 50:
            final_status = "pending_approval"
        
        # Actualizar sesion
        update_data = {
            "closed_at": now,
            "closed_by": user["user_id"],
            "closed_by_name": user["name"],
            "status": final_status,
            "notes": input.difference_notes or ""
        }
        
        result = sb.table("pos_sessions").update(update_data).eq("id", session_id).execute()
        
        # Guardar datos de cuadre en MongoDB (Supabase no tiene estas columnas)
        reconciliation_doc = {
            "session_id": session_id,
            "cash_declared": round(input.cash_declared, 2),
            "expected_cash": round(expected_cash, 2),
            "cash_difference": round(cash_difference, 2),
            "card_declared": round(input.card_declared, 2) if input.card_declared else 0,
            "transfer_declared": round(input.transfer_declared, 2) if input.transfer_declared else 0,
            "total_difference": round(total_difference, 2),
            "cash_breakdown": input.cash_breakdown,
            "difference_notes": input.difference_notes or "",
            "closed_by": user["user_id"],
            "closed_by_name": user["name"],
            "closed_at": now
        }
        await db.session_reconciliations.update_one(
            {"session_id": session_id},
            {"$set": reconciliation_doc},
            upsert=True
        )
        
        # Si hay diferencia, registrar movimiento de ajuste
        if abs(cash_difference) > 0.01:
            adjustment_data = {
                "id": gen_id(),
                "ref": generate_movement_ref(),
                "session_id": session_id,
                "movement_type": "adjustment",
                "direction": 1 if cash_difference > 0 else -1,
                "amount": abs(cash_difference),
                "payment_method": "cash",
                "description": f"Ajuste de cierre: {'Sobrante' if cash_difference > 0 else 'Faltante'}",
                "created_by": user["user_id"],
                "created_by_name": user["name"]
            }
            
            sb.table("cash_movements").insert(adjustment_data).execute()
        
        # ── AUTO CLOCK-OUT: Register attendance exit for the cashier ──
        try:
            from zoneinfo import ZoneInfo
            local_now = datetime.now(ZoneInfo("America/Santo_Domingo"))
            config = await db.system_config.find_one({}, {"_id": 0, "time_format": 1}) or {}
            is_12h = config.get("time_format", "12h") == "12h"
            display_time = local_now.strftime("%I:%M %p" if is_12h else "%H:%M")
            
            active_attendance = await db.attendance.find_one(
                {"user_id": user_id, "status": "ACTIVE"}, {"_id": 0}
            )
            if active_attendance:
                try:
                    clock_in_dt = datetime.fromisoformat(active_attendance["clock_in"])
                    diff = local_now - clock_in_dt.replace(tzinfo=local_now.tzinfo) if clock_in_dt.tzinfo is None else local_now - clock_in_dt
                    hours = round(diff.total_seconds() / 3600, 2)
                except:
                    hours = 0
                hours_display = f"{int(hours)}h {int((hours % 1) * 60)}m"
                
                await db.attendance.update_one(
                    {"id": active_attendance["id"]},
                    {"$set": {
                        "clock_out": local_now.isoformat(),
                        "clock_out_display": display_time,
                        "hours_worked": hours,
                        "hours_display": hours_display,
                        "status": "COMPLETED",
                        "auto_clock_out": True,
                        "auto_clock_out_reason": "Cierre de turno de caja",
                    }}
                )
        except Exception as e:
            print(f"Auto clock-out warning: {e}")
        
        return {
            "ok": True,
            "session_id": session_id,
            "status": final_status,
            "expected_cash": round(expected_cash, 2),
            "cash_declared": input.cash_declared,
            "difference": round(cash_difference, 2),
            "requires_approval": final_status == "pending_approval"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error cerrando sesion: {str(e)}")


@router.post("/{session_id}/movements")
async def add_cash_movement(session_id: str, input: CashMovementInput, user=Depends(get_current_user)):
    """Registra un movimiento de caja (ingreso, retiro, deposito, etc.)"""
    try:
        sb = get_supabase()
        
        # Verificar sesion existe y esta abierta
        session_result = sb.table("pos_sessions").select("*").eq("id", session_id).single().execute()
        
        if not session_result.data:
            raise HTTPException(status_code=404, detail="Sesion no encontrada")
        
        session = session_result.data
        
        if session["status"] != "open":
            raise HTTPException(status_code=400, detail="La sesion no esta abierta")
        
        # Determinar direccion del movimiento
        direction = 1 if input.movement_type in ["cash_in", "sale", "transfer_in", "opening"] else -1
        
        # Calcular balance actual
        current_balance = (
            session.get("opening_amount", 0) + 
            session.get("cash_sales", 0) + 
            session.get("cash_in", 0) - 
            session.get("cash_out", 0)
        )
        
        new_balance = current_balance + (input.amount * direction)
        
        now = now_iso()
        
        # Crear movimiento
        movement_data = {
            "id": gen_id(),
            "ref": generate_movement_ref(),
            "session_id": session_id,
            "movement_type": input.movement_type,
            "direction": direction,
            "amount": input.amount,
            "payment_method": input.payment_method,
            "description": input.description,
            "created_by": user["user_id"],
            "created_by_name": user["name"]
        }
        
        result = sb.table("cash_movements").insert(movement_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Error creando movimiento")
        
        # Actualizar totales en sesion
        update_session = {
            "cash_movements_count": session.get("cash_movements_count", 0) + 1,
            "updated_at": now
        }
        
        if input.movement_type == "cash_in":
            update_session["cash_in"] = session.get("cash_in", 0) + input.amount
        elif input.movement_type in ["cash_out", "deposit", "petty_cash", "tip_out"]:
            update_session["cash_out"] = session.get("cash_out", 0) + input.amount
        
        sb.table("pos_sessions").update(update_session).eq("id", session_id).execute()
        
        return result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error registrando movimiento: {str(e)}")


@router.get("/{session_id}/movements")
async def get_session_movements(session_id: str, user=Depends(get_current_user)):
    """Obtiene todos los movimientos de una sesion"""
    try:
        sb = get_supabase()
        
        result = sb.table("cash_movements").select("*").eq("session_id", session_id).order("created_at", desc=True).execute()
        
        return result.data or []
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_sessions_history(
    limit: int = 50,
    status: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Historial de sesiones: cajeros ven solo las suyas, admin ve todas. Solo jornada actual."""
    try:
        sb = get_supabase()
        
        # Obtener jornada actual para filtrar por fecha
        business_day = await db.business_days.find_one({"status": "open"}, {"_id": 0, "opened_at": 1})
        
        query = sb.table("pos_sessions").select("*").order("opened_at", desc=True).limit(limit)
        
        if status:
            query = query.eq("status", status)
        
        # Filtrar por jornada actual (solo turnos abiertos desde el inicio de la jornada)
        if business_day and business_day.get("opened_at"):
            query = query.gte("opened_at", business_day["opened_at"])
        
        # Cajeros solo ven sus propios turnos
        if user.get("role") != "admin":
            query = query.eq("opened_by", user["user_id"])
        
        result = query.execute()
        sessions = result.data or []
        
        # Enriquecer sesiones cerradas con datos de cuadre desde MongoDB
        closed_ids = [s["id"] for s in sessions if s.get("status") in ("closed", "pending_approval")]
        if closed_ids:
            reconciliations = await db.session_reconciliations.find(
                {"session_id": {"$in": closed_ids}}, {"_id": 0}
            ).to_list(100)
            recon_map = {r["session_id"]: r for r in reconciliations}
            
            for s in sessions:
                recon = recon_map.get(s["id"])
                if recon:
                    s["total_difference"] = recon.get("cash_difference", 0)
                    s["cash_declared"] = recon.get("cash_declared", 0)
                    s["expected_cash"] = recon.get("expected_cash", 0)
        
        return sessions
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals")
async def get_terminals():
    """Obtiene lista de terminales POS configurados con estado de ocupación"""
    try:
        sb = get_supabase()
        
        # Obtener terminales de MongoDB (o usar por defecto)
        terminals_cursor = db.pos_terminals.find({"is_active": True}, {"_id": 0}).sort("code", 1)
        terminals = await terminals_cursor.to_list(100)
        
        # Si no hay terminales configurados, crear los por defecto
        if not terminals:
            default_terminals = [
                {"id": "term-1", "code": "POS1", "name": "Caja 1", "is_active": True},
                {"id": "term-2", "code": "POS2", "name": "Caja 2", "is_active": True},
                {"id": "term-3", "code": "BAR1", "name": "Barra", "is_active": True},
                {"id": "term-4", "code": "TERR", "name": "Terraza", "is_active": True},
                {"id": "term-5", "code": "VIP", "name": "VIP", "is_active": True},
            ]
            # Guardar terminales por defecto en MongoDB
            await db.pos_terminals.insert_many(default_terminals)
            terminals = default_terminals
        
        # Obtener turnos abiertos de Supabase para marcar terminales en uso
        open_sessions = sb.table("pos_sessions").select("terminal_name, opened_by_name").eq("status", "open").execute()
        open_terminal_names = {s["terminal_name"]: s.get("opened_by_name", "En uso") for s in (open_sessions.data or [])}
        
        # Marcar terminales en uso
        for terminal in terminals:
            if terminal["name"] in open_terminal_names:
                terminal["in_use"] = True
                terminal["in_use_by"] = open_terminal_names[terminal["name"]]
            else:
                terminal["in_use"] = False
                terminal["in_use_by"] = None
        
        return terminals
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals/all")
async def get_all_terminals():
    """Obtiene TODOS los terminales (activos e inactivos) para gestión"""
    try:
        terminals_cursor = db.pos_terminals.find({}, {"_id": 0}).sort("code", 1)
        terminals = await terminals_cursor.to_list(100)
        
        # Si no hay terminales, crear los por defecto
        if not terminals:
            default_terminals = [
                {"id": "term-1", "code": "POS1", "name": "Caja 1", "is_active": True},
                {"id": "term-2", "code": "POS2", "name": "Caja 2", "is_active": True},
                {"id": "term-3", "code": "BAR1", "name": "Barra", "is_active": True},
                {"id": "term-4", "code": "TERR", "name": "Terraza", "is_active": True},
                {"id": "term-5", "code": "VIP", "name": "VIP", "is_active": True},
            ]
            await db.pos_terminals.insert_many(default_terminals)
            terminals = default_terminals
        
        return terminals
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TerminalInput(BaseModel):
    name: str
    code: Optional[str] = None
    is_active: bool = True


@router.post("/terminals")
async def create_terminal(input: TerminalInput):
    """Crea un nuevo terminal"""
    try:
        # Verificar que no exista uno con el mismo nombre
        existing = await db.pos_terminals.find_one({"name": input.name}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe un terminal con ese nombre")
        
        terminal = {
            "id": str(uuid.uuid4()),
            "name": input.name,
            "code": input.code or input.name.upper().replace(" ", "")[:6],
            "is_active": input.is_active,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.pos_terminals.insert_one(terminal)
        # Return without _id
        terminal.pop("_id", None)
        return terminal
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/terminals/{terminal_id}")
async def update_terminal(terminal_id: str, input: TerminalInput):
    """Actualiza un terminal existente"""
    try:
        # Verificar que el nombre no esté en uso por otro terminal
        existing = await db.pos_terminals.find_one({"name": input.name, "id": {"$ne": terminal_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Ya existe otro terminal con ese nombre")
        
        result = await db.pos_terminals.update_one(
            {"id": terminal_id},
            {"$set": {
                "name": input.name,
                "code": input.code or input.name.upper().replace(" ", "")[:6],
                "is_active": input.is_active,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Terminal no encontrado")
        
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/terminals/{terminal_id}")
async def delete_terminal(terminal_id: str):
    """Elimina un terminal (solo si no está en uso)"""
    try:
        # Primero obtener el terminal para saber su nombre
        terminal = await db.pos_terminals.find_one({"id": terminal_id}, {"_id": 0})
        if not terminal:
            raise HTTPException(status_code=404, detail="Terminal no encontrado")
        
        # Verificar si el terminal tiene un turno activo (en uso)
        sb = get_supabase()
        open_sessions = sb.table("pos_sessions").select("id, opened_by_name").eq("terminal_name", terminal["name"]).eq("status", "open").execute()
        
        if open_sessions.data and len(open_sessions.data) > 0:
            session = open_sessions.data[0]
            raise HTTPException(
                status_code=400, 
                detail=f"No se puede eliminar. Terminal en uso por {session.get('opened_by_name', 'un cajero')}"
            )
        
        # Si no está en uso, eliminar
        result = await db.pos_terminals.delete_one({"id": terminal_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Terminal no encontrado")
        
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals/in-use")
async def get_terminals_in_use():
    """Obtiene lista de nombres de terminales que tienen turno abierto"""
    try:
        sb = get_supabase()
        
        # Obtener turnos abiertos de Supabase
        result = sb.table("pos_sessions").select("terminal_name, opened_by_name").eq("status", "open").execute()
        
        return {s["terminal_name"]: s.get("opened_by_name", "En uso") for s in (result.data or [])}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/movement-reasons")
async def get_movement_reasons():
    """Obtiene catalogo de razones de movimiento de caja"""
    try:
        sb = get_supabase()
        
        result = sb.table("movement_reasons").select("*").eq("is_active", True).eq("affects_cash_balance", True).order("sort_order").execute()
        
        return result.data or []
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{session_id}/register-sale")
async def register_sale_to_session(
    session_id: str,
    amount: float,
    payment_method: str,  # cash, card, transfer, other
    user=Depends(get_current_user)
):
    """Registra una venta en la sesion (llamado internamente al pagar factura)"""
    try:
        sb = get_supabase()
        
        session_result = sb.table("pos_sessions").select("*").eq("id", session_id).single().execute()
        
        if not session_result.data:
            raise HTTPException(status_code=404, detail="Sesion no encontrada")
        
        session = session_result.data
        
        update_data = {
            "total_invoices": session.get("total_invoices", 0) + 1,
            "updated_at": now_iso()
        }
        
        if payment_method == "cash":
            update_data["cash_sales"] = session.get("cash_sales", 0) + amount
        elif payment_method == "card":
            update_data["card_sales"] = session.get("card_sales", 0) + amount
        elif payment_method == "transfer":
            update_data["transfer_sales"] = session.get("transfer_sales", 0) + amount
        else:
            update_data["other_sales"] = session.get("other_sales", 0) + amount
        
        sb.table("pos_sessions").update(update_data).eq("id", session_id).execute()
        
        return {"ok": True}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.put("/{session_id}/sync-sales")
async def sync_session_sales(session_id: str, user=Depends(get_current_user)):
    """Resincroniza totales de ventas de la sesion basandose en las facturas reales de MongoDB"""
    try:
        sb = get_supabase()
        session_result = sb.table("pos_sessions").select("*").eq("id", session_id).single().execute()
        if not session_result.data:
            raise HTTPException(status_code=404, detail="Sesion no encontrada")
        
        session = session_result.data
        opened_at = session.get("opened_at", "")
        closed_at = session.get("closed_at")
        opened_by = session.get("opened_by", "")
        
        # Get all paid bills within this session's time range
        query = {"status": "paid", "paid_at": {"$gte": opened_at}}
        if closed_at:
            query["paid_at"]["$lte"] = closed_at
        
        bills = await db.bills.find(query, {"_id": 0}).to_list(1000)
        
        cash_sales = 0.0
        card_sales = 0.0
        transfer_sales = 0.0
        other_sales = 0.0
        total_invoices = 0
        
        for bill in bills:
            total_invoices += 1
            bill_total = bill.get("total", 0) or 0
            bill_change = bill.get("change_amount", 0) or 0
            bill_payments = bill.get("payments", [])
            
            # Si hay pagos individuales, distribuir por cada uno (pagos mixtos)
            if bill_payments and len(bill_payments) > 0:
                for pay in bill_payments:
                    amt = pay.get("amount_dop", pay.get("amount", 0)) or 0
                    name_lower = (pay.get("payment_method_name", "") or "").lower()
                    if pay.get("is_cash", False) or "efectivo" in name_lower or "cash" in name_lower or "dolar" in name_lower or "euro" in name_lower:
                        # Cash: subtract change (only the bill amount stays in register)
                        cash_sales += amt - bill_change
                        bill_change = 0  # Change only applies once per bill
                    elif "tarjeta" in name_lower or "card" in name_lower:
                        card_sales += amt
                    elif "transfer" in name_lower:
                        transfer_sales += amt
                    else:
                        other_sales += amt
            else:
                # Fallback: usar payment_method principal
                main_method = (bill.get("payment_method", "") or "").lower()
                if "tarjeta" in main_method or "card" in main_method:
                    card_sales += bill_total
                elif "transferencia" in main_method or "transfer" in main_method:
                    transfer_sales += bill_total
                elif "efectivo" in main_method or "rd$" in main_method or "dolar" in main_method or "euro" in main_method or "cash" in main_method:
                    cash_sales += bill_total
                else:
                    other_sales += bill_total
        
        update_data = {
            "cash_sales": cash_sales,
            "card_sales": card_sales,
            "transfer_sales": transfer_sales,
            "other_sales": other_sales,
            "total_invoices": total_invoices,
            "updated_at": now_iso()
        }
        
        sb.table("pos_sessions").update(update_data).eq("id", session_id).execute()
        
        return {
            "ok": True,
            "synced": {
                "cash_sales": cash_sales,
                "card_sales": card_sales,
                "transfer_sales": transfer_sales,
                "other_sales": other_sales,
                "total_invoices": total_invoices
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}/sales-breakdown")
async def get_sales_breakdown(session_id: str, user=Depends(get_current_user)):
    """Devuelve desglose detallado de ventas por forma de pago para una sesion"""
    try:
        sb = get_supabase()
        session_result = sb.table("pos_sessions").select("opened_at, closed_at, opened_by").eq("id", session_id).single().execute()
        if not session_result.data:
            raise HTTPException(status_code=404, detail="Sesion no encontrada")
        
        session = session_result.data
        opened_at = session.get("opened_at", "")
        closed_at = session.get("closed_at")
        
        query = {"status": "paid", "paid_at": {"$gte": opened_at}}
        if closed_at:
            query["paid_at"]["$lte"] = closed_at
        
        bills = await db.bills.find(query, {"_id": 0, "payments": 1, "total": 1, "payment_method": 1, "discount_applied": 1}).to_list(1000)
        
        cash_rd = 0.0
        card = 0.0
        transfer = 0.0
        usd = 0.0
        eur = 0.0
        other = 0.0
        discounts_total = 0.0
        discounts_count = 0
        
        for bill in bills:
            bill_payments = bill.get("payments", [])
            
            # Descuentos
            disc_amt = ((bill.get("discount_applied") or {}).get("amount", 0) or 0)
            if disc_amt > 0:
                discounts_total += disc_amt
                discounts_count += 1
            
            if bill_payments and len(bill_payments) > 0:
                for pay in bill_payments:
                    amt = pay.get("amount_dop", pay.get("amount", 0)) or 0
                    name_lower = (pay.get("payment_method_name", "") or "").lower()
                    
                    if "dolar" in name_lower or "usd" in name_lower:
                        usd += amt
                    elif "euro" in name_lower or "eur" in name_lower:
                        eur += amt
                    elif "tarjeta" in name_lower or "card" in name_lower:
                        card += amt
                    elif "transfer" in name_lower:
                        transfer += amt
                    elif pay.get("is_cash", False) or "efectivo" in name_lower or "cash" in name_lower:
                        cash_rd += amt
                    else:
                        other += amt
            else:
                bill_total = bill.get("total", 0) or 0
                main_method = (bill.get("payment_method", "") or "").lower()
                if "tarjeta" in main_method or "card" in main_method:
                    card += bill_total
                elif "transfer" in main_method:
                    transfer += bill_total
                elif "dolar" in main_method or "usd" in main_method:
                    usd += bill_total
                elif "euro" in main_method or "eur" in main_method:
                    eur += bill_total
                else:
                    cash_rd += bill_total
        
        return {
            "cash_rd": round(cash_rd, 2),
            "card": round(card, 2),
            "transfer": round(transfer, 2),
            "usd": round(usd, 2),
            "eur": round(eur, 2),
            "other": round(other, 2),
            "discounts": round(discounts_total, 2),
            "discounts_count": discounts_count,
            "total": round(cash_rd + card + transfer + usd + eur + other, 2)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
