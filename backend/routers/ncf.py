"""
NCF Router - Gestión de Comprobantes Fiscales (DGII República Dominicana)
Maneja secuencias NCF, tipos de comprobantes y validaciones fiscales
Datos principales en Supabase (PostgreSQL), configuraciones adicionales en MongoDB
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, date
import os
from utils.supabase_helpers import get_client_id, sb_select, sb_insert, sb_update_filter

router = APIRouter(prefix="/ncf", tags=["NCF - Comprobantes Fiscales"])

# Supabase client
supabase_client = None

# MongoDB database reference
db = None

def set_db(database):
    global db
    db = database

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
    prefix: str = ""  # sequence_prefix - Ej: "B02"
    current_number: int = 1
    range_start: int = 1
    range_end: int
    expiration_date: str  # YYYY-MM-DD (stored as valid_until)
    is_active: bool = True
    notes: Optional[str] = None
    authorized_sale_types: Optional[List[str]] = None  # IDs of sale types that can use this sequence
    alert_threshold: Optional[int] = None  # Start alerting when remaining <= this value
    alert_interval: Optional[int] = None   # Show alert every N sales after threshold

class NCFSequenceUpdate(BaseModel):
    current_number: Optional[int] = None
    range_end: Optional[int] = None
    expiration_date: Optional[str] = None  # stored as valid_until
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    authorized_sale_types: Optional[List[str]] = None  # IDs of sale types that can use this sequence
    alert_threshold: Optional[int] = None  # Start alerting when remaining <= this value
    alert_interval: Optional[int] = None   # Show alert every N sales after threshold


# ─── NCF TYPES ───

@router.get("/types")
async def get_ncf_types():
    """Obtiene todos los tipos de NCF configurados (Serie B)"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        # Simple select without ordering to avoid column issues
        response = sb_select(supabase_client.table("ncf_types_config").select("*")).execute()
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
        # The table uses 'id' instead of 'code'
        response = sb_select(supabase_client.table("ncf_types_config").select("*").eq("code", code.upper())).single().execute()
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
        # Simple query
        query = sb_select(supabase_client.table("ncf_sequences").select("*"))
        
        if active_only:
            query = query.eq("is_active", True)
        
        response = query.execute()
        sequences = response.data or []
        
        # Get types to add info
        types_response = sb_select(supabase_client.table("ncf_types_config").select("*")).execute()
        types_map = {t.get('id', t.get('code')): t for t in (types_response.data or [])}
        
        today = date.today()
        
        # Add alerts and type info, map field names
        for seq in sequences:
            # Map DB column names to API field names
            seq["ncf_type_code"] = seq.get("ncf_type_id")
            seq["prefix"] = seq.get("sequence_prefix")
            seq["range_start"] = 1  # Not stored in DB
            seq["range_end"] = seq.get("end_number")
            seq["expiration_date"] = seq.get("valid_until")
            
            # Add type info
            type_code = seq.get("ncf_type_code") or seq.get("ncf_type_id")
            type_info = types_map.get(type_code, {})
            seq["ncf_types_config"] = {
                "name": type_info.get("description", type_code or "N/A"),
                "description": type_info.get("description", ""),
                "requires_rnc": type_info.get("requires_rnc", False)
            }
            
            remaining = (seq.get("end_number") or 0) - (seq.get("current_number") or 0) + 1
            exp_date = None
            exp_date_str = seq.get("valid_until") or seq.get("expiration_date")
            if exp_date_str:
                try:
                    exp_date = datetime.strptime(str(exp_date_str)[:10], "%Y-%m-%d").date()
                except ValueError:
                    pass
            
            seq["remaining"] = remaining
            seq["is_expired"] = exp_date < today if exp_date else False
            seq["days_until_expiry"] = (exp_date - today).days if exp_date else None
            
            # Alerts
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
        
        # Cargar authorized_sale_types y alert config desde MongoDB
        seq_ids = [s["id"] for s in sequences]
        mongo_configs = await db.ncf_sequence_config.find({"sequence_id": {"$in": seq_ids}}, {"_id": 0}).to_list(100)
        config_map = {c["sequence_id"]: c for c in mongo_configs}
        
        for seq in sequences:
            config = config_map.get(seq["id"], {})
            seq["authorized_sale_types"] = config.get("authorized_sale_types", [])
            seq["alert_threshold"] = config.get("alert_threshold")
            seq["alert_interval"] = config.get("alert_interval")
        
        return sequences
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sequences/{seq_id}")
async def get_ncf_sequence(seq_id: str):
    """Obtiene una secuencia NCF específica"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        response = sb_select(supabase_client.table("ncf_sequences").select("*")).eq("id", seq_id).single().execute()
        return response.data
    except Exception:
        raise HTTPException(status_code=404, detail="Secuencia no encontrada")


@router.post("/sequences")
async def create_ncf_sequence(input: NCFSequenceInput):
    """Crea una nueva secuencia NCF"""
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    try:
        # Verificar que el tipo de NCF existe (table uses 'id' as the code column)
        ncf_type = sb_select(supabase_client.table("ncf_types_config").select("id")).eq("code", input.ncf_type_code.upper()).execute()
        if not ncf_type.data:
            raise HTTPException(status_code=400, detail=f"Tipo NCF {input.ncf_type_code} no existe")
        
        # Check for existing active sequence (simplified - get all and filter)
        all_sequences = sb_select(supabase_client.table("ncf_sequences").select("*")).execute()
        existing = [s for s in (all_sequences.data or []) 
                   if s.get("ncf_type_id") == input.ncf_type_code.upper() and s.get("is_active")]
        
        if existing:
            raise HTTPException(status_code=400, detail=f"Ya existe una secuencia activa para {input.ncf_type_code}")
        
        # Map our API fields to the actual DB column names (sin authorized_sale_types que no existe en Supabase)
        prefix = input.prefix if input.prefix else f"{input.serie}{input.ncf_type_code[1:]}"
        data = {
            "ncf_type_id": input.ncf_type_code.upper(),
            "ncf_type": input.ncf_type_code.upper(),
            "sequence_prefix": prefix,
            "serie": input.serie or prefix[:1],
            "current_number": input.current_number,
            "start_number": input.current_number,
            "end_number": input.range_end,
            "valid_until": input.expiration_date,
            "is_active": input.is_active if input.is_active is not None else True
        }
        
        response = supabase_client.table("ncf_sequences").insert(sb_insert(data)).execute()
        if response.data:
            # Map back to our API format
            result = response.data[0]
            result["ncf_type_code"] = result.get("ncf_type_id")
            result["prefix"] = result.get("sequence_prefix")
            result["range_end"] = result.get("end_number")
            result["expiration_date"] = result.get("valid_until")
            
            # Guardar authorized_sale_types y alert config en MongoDB
            mongo_data = {
                "sequence_id": result["id"],
                "updated_at": now_iso()
            }
            if input.authorized_sale_types is not None:
                mongo_data["authorized_sale_types"] = input.authorized_sale_types
            if input.alert_threshold is not None:
                mongo_data["alert_threshold"] = input.alert_threshold
            if input.alert_interval is not None:
                mongo_data["alert_interval"] = input.alert_interval
            
            if any([input.authorized_sale_types, input.alert_threshold is not None, input.alert_interval is not None]):
                await db.ncf_sequence_config.update_one(
                    {"sequence_id": result["id"]},
                    {"$set": mongo_data},
                    upsert=True
                )
            
            result["authorized_sale_types"] = input.authorized_sale_types or []
            result["alert_threshold"] = input.alert_threshold
            result["alert_interval"] = input.alert_interval
            
            return result
        else:
            raise HTTPException(status_code=500, detail="Error al insertar secuencia")
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
        # Datos para Supabase (campos que existen en la tabla)
        supabase_data = {}
        
        if input.current_number is not None:
            supabase_data["current_number"] = input.current_number
        if input.range_end is not None:
            supabase_data["end_number"] = input.range_end  # Map to DB column name
        if input.expiration_date is not None:
            supabase_data["valid_until"] = input.expiration_date  # Map to DB column name
        if input.is_active is not None:
            supabase_data["is_active"] = input.is_active
        
        # Guardar campos adicionales en MongoDB (authorized_sale_types, alert_threshold, alert_interval)
        mongo_update = {"sequence_id": seq_id, "updated_at": now_iso()}
        has_mongo_update = False
        
        if input.authorized_sale_types is not None:
            mongo_update["authorized_sale_types"] = input.authorized_sale_types
            has_mongo_update = True
        if input.alert_threshold is not None:
            mongo_update["alert_threshold"] = input.alert_threshold
            has_mongo_update = True
        if input.alert_interval is not None:
            mongo_update["alert_interval"] = input.alert_interval
            has_mongo_update = True
        
        if has_mongo_update:
            await db.ncf_sequence_config.update_one(
                {"sequence_id": seq_id},
                {"$set": mongo_update},
                upsert=True
            )
        
        if not supabase_data:
            # Si solo se actualizaron campos de MongoDB, retornar éxito
            if has_mongo_update:
                # Obtener la secuencia actual y agregar campos de MongoDB
                seq_response = sb_select(supabase_client.table("ncf_sequences").select("*")).eq("id", seq_id).single().execute()
                if seq_response.data:
                    result = seq_response.data
                    # Agregar campos desde MongoDB
                    mongo_config = await db.ncf_sequence_config.find_one({"sequence_id": seq_id}, {"_id": 0})
                    if mongo_config:
                        result["authorized_sale_types"] = mongo_config.get("authorized_sale_types", [])
                        result["alert_threshold"] = mongo_config.get("alert_threshold")
                        result["alert_interval"] = mongo_config.get("alert_interval")
                    return result
            raise HTTPException(status_code=400, detail="No hay campos para actualizar")
        
        response = sb_update_filter(supabase_client.table("ncf_sequences").update(supabase_data).eq("id", seq_id)).execute()        
        if not response.data:
            raise HTTPException(status_code=404, detail="Secuencia no encontrada")
        
        result = response.data[0]
        
        # Agregar campos de MongoDB al resultado
        mongo_config = await db.ncf_sequence_config.find_one({"sequence_id": seq_id}, {"_id": 0})
        if mongo_config:
            result["authorized_sale_types"] = mongo_config.get("authorized_sale_types", [])
            result["alert_threshold"] = mongo_config.get("alert_threshold")
            result["alert_interval"] = mongo_config.get("alert_interval")
        
        return result
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
        sb_update_filter(supabase_client.table("ncf_sequences").update({
            "is_active": False
        }).eq("id", seq_id)).execute()
        
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
        seq_response = sb_select(supabase_client.table("ncf_sequences").select("*")).eq("ncf_type_code", ncf_type).eq("is_active", True).single().execute()
        
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
        update_response = sb_update_filter(supabase_client.table("ncf_sequences").update({
            "current_number": ncf_number + 1,
            "last_used_at": now_iso(),
            "updated_at": now_iso()
        }).eq("id", seq["id"]).eq("current_number", ncf_number)).execute()
        
        # Si no se actualizó, significa que otro proceso tomó ese número
        if not update_response.data:
            # Reintentar una vez
            seq_response = sb_select(supabase_client.table("ncf_sequences").select("*")).eq("id", seq["id"]).single().execute()
            if seq_response.data:
                new_number = seq_response.data["current_number"]
                ncf_full = f"{seq['serie']}{ncf_type[1:]}{str(new_number).zfill(8)}"
                sb_update_filter(supabase_client.table("ncf_sequences").update({
                    "current_number": new_number + 1,
                    "last_used_at": now_iso()
                }).eq("id", seq["id"])).execute()
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


@router.post("/generate-for-sale")
async def generate_ncf_for_sale(
    sale_type_id: str = Query(..., description="ID del tipo de venta"),
    bill_total: float = Query(..., description="Total de la factura para validación")
):
    """
    Genera el siguiente NCF basado en el tipo de venta
    
    1. Busca la secuencia NCF que tenga este sale_type_id en authorized_sale_types
    2. Valida disponibilidad y vigencia
    3. Incrementa el contador atómicamente
    4. Retorna el NCF generado
    """
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Supabase no disponible")
    
    # Validación: No permitir NCF para facturas de $0
    if bill_total <= 0:
        raise HTTPException(
            status_code=400, 
            detail="No se puede asignar NCF a facturas con total $0.00"
        )
    
    try:
        # Obtener todas las secuencias activas
        seq_response = sb_select(supabase_client.table("ncf_sequences").select("*")).eq("is_active", True).execute()
        
        if not seq_response.data:
            raise HTTPException(status_code=404, detail="No hay secuencias NCF activas")
        
        sequences = seq_response.data
        
        # Cargar authorized_sale_types desde MongoDB
        seq_ids = [s["id"] for s in sequences]
        mongo_configs = await db.ncf_sequence_config.find({"sequence_id": {"$in": seq_ids}}, {"_id": 0}).to_list(100)
        config_map = {c["sequence_id"]: c.get("authorized_sale_types", []) for c in mongo_configs}
        
        # Buscar secuencia que tenga este sale_type_id autorizado
        matching_seq = None
        for seq in sequences:
            authorized = config_map.get(seq["id"], [])
            if sale_type_id in authorized:
                matching_seq = seq
                break
        
        if not matching_seq:
            # Fallback: buscar el default_ncf_type del sale_type desde MongoDB
            sale_type = await db.sale_types.find_one({"id": sale_type_id}, {"_id": 0})
            if sale_type and sale_type.get("default_ncf_type_id"):
                default_ncf = sale_type["default_ncf_type_id"]
                for seq in sequences:
                    if seq.get("ncf_type_id") == default_ncf:
                        matching_seq = seq
                        break
        
        if not matching_seq:
            # Último fallback: usar B02 (Consumidor Final)
            for seq in sequences:
                if seq.get("ncf_type_id") == "B02":
                    matching_seq = seq
                    break
        
        if not matching_seq:
            raise HTTPException(status_code=404, detail=f"No se encontró secuencia NCF para el tipo de venta {sale_type_id}")
        
        seq = matching_seq
        ncf_type = seq.get("ncf_type_id", "B02")
        
        # Validar fecha de vencimiento
        exp_date_str = seq.get("valid_until") or seq.get("expiration_date")
        if exp_date_str:
            exp_date = datetime.strptime(str(exp_date_str)[:10], "%Y-%m-%d").date()
            if exp_date < date.today():
                raise HTTPException(
                    status_code=400,
                    detail=f"Secuencia NCF agotada: La secuencia {ncf_type} está vencida desde {exp_date_str}. Contacte a DGII para renovar."
                )
        
        # Validar disponibilidad
        current_num = seq.get("current_number", 1)
        end_num = seq.get("end_number", 0)
        if current_num > end_num:
            raise HTTPException(
                status_code=400,
                detail=f"Secuencia NCF agotada: No hay comprobantes {ncf_type} disponibles. Rango agotado."
            )
        
        # Generar NCF
        prefix = seq.get("sequence_prefix", f"B{ncf_type[1:]}")
        ncf_full = f"{prefix}{str(current_num).zfill(8)}"
        
        # Actualización atómica del contador (solo campos que existen en la tabla)
        update_response = sb_update_filter(supabase_client.table("ncf_sequences").update({
            "current_number": current_num + 1
        }).eq("id", seq["id"]).eq("current_number", current_num)).execute()
        
        # Si no se actualizó, significa que otro proceso tomó ese número
        if not update_response.data:
            # Reintentar una vez
            retry_response = sb_select(supabase_client.table("ncf_sequences").select("*")).eq("id", seq["id"]).single().execute()
            if retry_response.data:
                new_number = retry_response.data["current_number"]
                ncf_full = f"{prefix}{str(new_number).zfill(8)}"
                sb_update_filter(supabase_client.table("ncf_sequences").update({
                    "current_number": new_number + 1
                }).eq("id", seq["id"])).execute()
                current_num = new_number
        
        remaining = end_num - current_num
        
        # Obtener configuración de alertas desde MongoDB
        mongo_config = await db.ncf_sequence_config.find_one({"sequence_id": seq["id"]}, {"_id": 0})
        alert_threshold = mongo_config.get("alert_threshold") if mongo_config else None
        alert_interval = mongo_config.get("alert_interval", 1) if mongo_config else 1
        
        # Determinar si mostrar alerta basado en configuración dinámica
        should_show_alert = False
        alert_level = None
        alert_message = None
        
        if alert_threshold is not None and remaining <= alert_threshold:
            # Calcular cuántos NCF se han usado desde que cruzó el umbral
            used_since_threshold = alert_threshold - remaining
            # Mostrar alerta cada N ventas (alert_interval)
            if alert_interval and alert_interval > 0:
                should_show_alert = (used_since_threshold % alert_interval == 0) or remaining <= 10
            else:
                should_show_alert = True
            
            if should_show_alert:
                alert_level = "critical" if remaining <= 10 else "warning"
                alert_message = f"Quedan {remaining} comprobantes {ncf_type} disponibles"
        elif remaining < 10:
            # Alerta crítica siempre si quedan menos de 10
            should_show_alert = True
            alert_level = "critical"
            alert_message = f"¡URGENTE! Solo quedan {remaining} comprobantes {ncf_type}"
        
        return {
            "ncf": ncf_full,
            "ncf_type": ncf_type,
            "ncf_number": current_num,
            "sequence_id": seq["id"],
            "remaining": remaining,
            "expiration_date": exp_date_str,
            "sale_type_id": sale_type_id,
            "alert": alert_level,
            "alert_message": alert_message,
            "should_show_alert": should_show_alert,
            "alert_threshold": alert_threshold,
            "alert_interval": alert_interval
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
        response = sb_select(supabase_client.table("return_reasons").select("*")).eq("is_active", True).execute()
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
