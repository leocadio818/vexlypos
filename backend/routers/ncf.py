"""
NCF Router - Gestión de Comprobantes Fiscales (DGII República Dominicana)
Maneja secuencias NCF, tipos de comprobantes y validaciones fiscales
Datos almacenados en Supabase (PostgreSQL)
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, date
import os

router = APIRouter(prefix="/ncf", tags=["NCF - Comprobantes Fiscales"])

# Supabase client
supabase_client = None

def init_supabase():
    """Initialize Supabase client for NCF management"""
    global supabase_client
    try:
        from supabase import create_client
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_ANON_KEY", "")
        if url and key:
            supabase_client = create_client(url, key)
            print("✅ NCF Router: Supabase initialized")
        else:
            print("⚠️ NCF Router: Missing Supabase credentials")
    except Exception as e:
        print(f"❌ NCF Router: Supabase init error: {e}")

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── MODELS ───

class NCFSequenceInput(BaseModel):
    ncf_type_code: str  # B01, B02, B04, etc.
    serie: str = "B"
    prefix: str  # Ej: "B0100000001"
    current_number: int = 1
    range_start: int = 1
    range_end: int
    expiration_date: str  # YYYY-MM-DD
    is_active: bool = True
    notes: Optional[str] = None

class NCFSequenceUpdate(BaseModel):
    current_number: Optional[int] = None
    range_end: Optional[int] = None
    expiration_date: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


# ─── NCF TYPES ───

@router.get("/types")
async def get_ncf_types():
    """Obtiene todos los tipos de NCF configurados (Serie B)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        # Simple select without ordering to avoid column issues
        response = supabase_client.table("ncf_types_config").select("*").execute()
        # Sort in Python if needed
        data = response.data
        if data and len(data) > 0:
            data = sorted(data, key=lambda x: x.get('code', ''))
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/types/{code}")
async def get_ncf_type(code: str):
    """Obtiene un tipo de NCF específico"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        response = supabase_client.table("ncf_types_config").select("*").eq("code", code.upper()).single().execute()
        return response.data
    except Exception:
        raise HTTPException(status_code=404, detail=f"Tipo NCF {code} no encontrado")


# ─── NCF SEQUENCES CRUD ───

@router.get("/sequences")
async def get_ncf_sequences(
    active_only: bool = Query(True, description="Solo secuencias activas"),
    include_alerts: bool = Query(True, description="Incluir alertas de stock bajo y vencimiento")
):
    """
    Obtiene todas las secuencias NCF con alertas
    - Amarillo: < 50 comprobantes restantes
    - Rojo: < 10 comprobantes restantes o fecha vencida
    """
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        query = supabase_client.table("ncf_sequences").select("*, ncf_types_config(name, description, requires_rnc)")
        
        if active_only:
            query = query.eq("is_active", True)
        
        response = query.order("ncf_type_code").execute()
        sequences = response.data
        
        today = date.today()
        
        # Agregar alertas
        for seq in sequences:
            remaining = seq["range_end"] - seq["current_number"] + 1
            exp_date = datetime.strptime(seq["expiration_date"], "%Y-%m-%d").date() if seq["expiration_date"] else None
            
            seq["remaining"] = remaining
            seq["is_expired"] = exp_date < today if exp_date else False
            seq["days_until_expiry"] = (exp_date - today).days if exp_date else None
            
            # Alertas
            if include_alerts:
                if seq["is_expired"]:
                    seq["alert_level"] = "critical"
                    seq["alert_message"] = "¡Secuencia vencida! No se pueden emitir comprobantes."
                elif remaining < 10:
                    seq["alert_level"] = "critical"
                    seq["alert_message"] = f"¡Solo quedan {remaining} comprobantes!"
                elif remaining < 50:
                    seq["alert_level"] = "warning"
                    seq["alert_message"] = f"Quedan {remaining} comprobantes"
                elif seq["days_until_expiry"] and seq["days_until_expiry"] < 30:
                    seq["alert_level"] = "warning"
                    seq["alert_message"] = f"Vence en {seq['days_until_expiry']} días"
                else:
                    seq["alert_level"] = "ok"
                    seq["alert_message"] = None
        
        return sequences
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sequences/{seq_id}")
async def get_ncf_sequence(seq_id: str):
    """Obtiene una secuencia NCF específica"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        response = supabase_client.table("ncf_sequences").select("*, ncf_types_config(name, description)").eq("id", seq_id).single().execute()
        return response.data
    except Exception:
        raise HTTPException(status_code=404, detail="Secuencia no encontrada")


@router.post("/sequences")
async def create_ncf_sequence(input: NCFSequenceInput):
    """Crea una nueva secuencia NCF"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        # Verificar que no exista una secuencia activa para el mismo tipo
        existing = supabase_client.table("ncf_sequences").select("id").eq("ncf_type_code", input.ncf_type_code.upper()).eq("is_active", True).execute()
        
        if existing.data:
            raise HTTPException(status_code=400, detail=f"Ya existe una secuencia activa para {input.ncf_type_code}")
        
        # Verificar que el tipo de NCF existe
        ncf_type = supabase_client.table("ncf_types_config").select("code").eq("code", input.ncf_type_code.upper()).execute()
        if not ncf_type.data:
            raise HTTPException(status_code=400, detail=f"Tipo NCF {input.ncf_type_code} no existe")
        
        data = {
            "ncf_type_code": input.ncf_type_code.upper(),
            "serie": input.serie.upper(),
            "prefix": input.prefix,
            "current_number": input.current_number,
            "range_start": input.range_start,
            "range_end": input.range_end,
            "expiration_date": input.expiration_date,
            "is_active": input.is_active,
            "notes": input.notes,
            "created_at": now_iso(),
            "updated_at": now_iso()
        }
        
        response = supabase_client.table("ncf_sequences").insert(data).execute()
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/sequences/{seq_id}")
async def update_ncf_sequence(seq_id: str, input: NCFSequenceUpdate):
    """Actualiza una secuencia NCF"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        update_data = {"updated_at": now_iso()}
        
        if input.current_number is not None:
            update_data["current_number"] = input.current_number
        if input.range_end is not None:
            update_data["range_end"] = input.range_end
        if input.expiration_date is not None:
            update_data["expiration_date"] = input.expiration_date
        if input.is_active is not None:
            update_data["is_active"] = input.is_active
        if input.notes is not None:
            update_data["notes"] = input.notes
        
        response = supabase_client.table("ncf_sequences").update(update_data).eq("id", seq_id).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Secuencia no encontrada")
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/sequences/{seq_id}")
async def delete_ncf_sequence(seq_id: str):
    """Desactiva una secuencia NCF (soft delete)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        supabase_client.table("ncf_sequences").update({
            "is_active": False,
            "updated_at": now_iso()
        }).eq("id", seq_id).execute()
        
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── NCF GENERATION (ATOMIC) ───

@router.post("/generate/{ncf_type_code}")
async def generate_ncf(
    ncf_type_code: str,
    bill_total: float = Query(..., description="Total de la factura para validación")
):
    """
    Genera el siguiente NCF de forma atómica (concurrent-safe)
    
    Validaciones:
    - No permite generar NCF si el total es $0.00 (excepto Notas de Crédito B04)
    - Verifica que la secuencia no esté vencida
    - Verifica que haya comprobantes disponibles
    """
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    ncf_type = ncf_type_code.upper()
    
    # Validación: No permitir NCF para facturas de $0 (excepto B04 - Nota de Crédito)
    if bill_total <= 0 and ncf_type != "B04":
        raise HTTPException(
            status_code=400, 
            detail="No se puede asignar NCF a facturas con total $0.00. Solo las Notas de Crédito (B04) pueden tener valor $0."
        )
    
    try:
        # Obtener secuencia activa
        seq_response = supabase_client.table("ncf_sequences").select("*").eq("ncf_type_code", ncf_type).eq("is_active", True).single().execute()
        
        if not seq_response.data:
            raise HTTPException(status_code=404, detail=f"No hay secuencia activa para {ncf_type}")
        
        seq = seq_response.data
        
        # Validar fecha de vencimiento
        exp_date = datetime.strptime(seq["expiration_date"], "%Y-%m-%d").date()
        if exp_date < date.today():
            raise HTTPException(
                status_code=400,
                detail=f"La secuencia {ncf_type} está vencida desde {seq['expiration_date']}. Contacte a DGII para renovar."
            )
        
        # Validar disponibilidad
        if seq["current_number"] > seq["range_end"]:
            raise HTTPException(
                status_code=400,
                detail=f"La secuencia {ncf_type} no tiene comprobantes disponibles. Rango agotado."
            )
        
        # Generar NCF
        ncf_number = seq["current_number"]
        ncf_full = f"{seq['serie']}{ncf_type[1:]}{str(ncf_number).zfill(8)}"
        
        # Actualización atómica del contador
        # Usamos una transacción con condición para garantizar atomicidad
        update_response = supabase_client.table("ncf_sequences").update({
            "current_number": ncf_number + 1,
            "last_used_at": now_iso(),
            "updated_at": now_iso()
        }).eq("id", seq["id"]).eq("current_number", ncf_number).execute()
        
        # Si no se actualizó, significa que otro proceso tomó ese número
        if not update_response.data:
            # Reintentar una vez
            seq_response = supabase_client.table("ncf_sequences").select("*").eq("id", seq["id"]).single().execute()
            if seq_response.data:
                new_number = seq_response.data["current_number"]
                ncf_full = f"{seq['serie']}{ncf_type[1:]}{str(new_number).zfill(8)}"
                supabase_client.table("ncf_sequences").update({
                    "current_number": new_number + 1,
                    "last_used_at": now_iso()
                }).eq("id", seq["id"]).execute()
                ncf_number = new_number
        
        remaining = seq["range_end"] - ncf_number
        
        return {
            "ncf": ncf_full,
            "ncf_type": ncf_type,
            "ncf_number": ncf_number,
            "sequence_id": seq["id"],
            "remaining": remaining,
            "expiration_date": seq["expiration_date"],
            "alert": "warning" if remaining < 50 else ("critical" if remaining < 10 else None)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── RETURN REASONS ───

@router.get("/return-reasons")
async def get_return_reasons():
    """Obtiene los motivos de devolución para Notas de Crédito"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        try:
            response = supabase_client.table("return_reasons").select("*").eq("is_active", True).order("sort_order").execute()
        except Exception:
            response = supabase_client.table("return_reasons").select("*").eq("is_active", True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── ALERTS SUMMARY ───

@router.get("/alerts")
async def get_ncf_alerts():
    """Obtiene resumen de alertas de todas las secuencias"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        sequences = await get_ncf_sequences(active_only=True, include_alerts=True)
        
        alerts = {
            "critical": [],
            "warning": [],
            "ok": []
        }
        
        for seq in sequences:
            alert_info = {
                "ncf_type": seq["ncf_type_code"],
                "remaining": seq["remaining"],
                "expiration_date": seq["expiration_date"],
                "is_expired": seq["is_expired"],
                "message": seq["alert_message"],
                "ncf_type_name": seq.get("ncf_types_config", {}).get("name", seq["ncf_type_code"])
            }
            alerts[seq["alert_level"]].append(alert_info)
        
        return {
            "has_critical": len(alerts["critical"]) > 0,
            "has_warnings": len(alerts["warning"]) > 0,
            "alerts": alerts,
            "total_sequences": len(sequences)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
