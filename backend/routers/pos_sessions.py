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

router = APIRouter(prefix="/pos-sessions", tags=["POS Sessions"])

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
            "terminal_id": input.terminal_id if input.terminal_id else None,
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
            "cash_declared": input.cash_declared,
            "card_declared": input.card_declared,
            "transfer_declared": input.transfer_declared,
            "other_declared": input.other_declared,
            "cash_breakdown": input.cash_breakdown,
            "cash_difference": round(cash_difference, 2),
            "card_difference": round(card_difference, 2),
            "total_difference": round(total_difference, 2),
            "difference_notes": input.difference_notes,
            "closed_at": now,
            "closed_by": user["user_id"],
            "closed_by_name": user["name"],
            "status": final_status
        }
        
        result = sb.table("pos_sessions").update(update_data).eq("id", session_id).execute()
        
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
    """Obtiene historial de sesiones"""
    try:
        sb = get_supabase()
        
        query = sb.table("pos_sessions").select("*").order("opened_at", desc=True).limit(limit)
        
        if status:
            query = query.eq("status", status)
        
        result = query.execute()
        
        return result.data or []
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals")
async def get_terminals():
    """Obtiene lista de terminales POS configurados"""
    try:
        sb = get_supabase()
        
        result = sb.table("pos_terminals").select("*").eq("is_active", True).order("code").execute()
        
        return result.data or []
        
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
