"""
Credit Notes Router - Notas de Crédito (B04) para DGII República Dominicana
Maneja reversiones de facturas y generación de notas de crédito fiscales
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import os

router = APIRouter(prefix="/credit-notes", tags=["Credit Notes - Notas de Crédito"])

# Database reference
db = None

# Supabase client
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
            print("✅ Credit Notes Router: Supabase initialized")
    except Exception as e:
        print(f"❌ Credit Notes Router: Supabase init error: {e}")

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# Import auth dependency
from routers.auth import get_current_user


# ─── MODELS ───

class CreditNoteInput(BaseModel):
    original_bill_id: str
    reason_id: str
    reason_text: str
    items_to_reverse: Optional[List[dict]] = None  # If partial reversal
    is_full_reversal: bool = True
    notes: Optional[str] = None

class ReturnReasonInput(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    affects_inventory: bool = True
    requires_authorization: bool = False


# ─── RETURN REASONS ───

@router.get("/return-reasons")
async def get_return_reasons():
    """Obtiene los motivos de devolución/anulación disponibles"""
    reasons = await db.return_reasons.find({"is_active": True}, {"_id": 0}).to_list(50)
    if not reasons:
        defaults = [
            {"id": gen_id(), "code": "ERROR_FACTURACION", "name": "Error de Facturación", "description": "Error en datos del cliente o monto incorrecto", "affects_inventory": False, "requires_authorization": False, "is_active": True, "order": 0},
            {"id": gen_id(), "code": "DEVOLUCION_PRODUCTO", "name": "Devolución de Producto", "description": "Cliente devuelve producto por defecto o insatisfacción", "affects_inventory": True, "requires_authorization": True, "is_active": True, "order": 1},
            {"id": gen_id(), "code": "ANULACION_VENTA", "name": "Anulación de Venta", "description": "Cancelación total de la transacción", "affects_inventory": True, "requires_authorization": True, "is_active": True, "order": 2},
            {"id": gen_id(), "code": "DESCUENTO_POSTERIOR", "name": "Descuento Posterior", "description": "Aplicación de descuento después de facturar", "affects_inventory": False, "requires_authorization": True, "is_active": True, "order": 3},
            {"id": gen_id(), "code": "CAMBIO_NCF", "name": "Cambio de Tipo NCF", "description": "Cambio de comprobante fiscal (ej: B02 a B01)", "affects_inventory": False, "requires_authorization": False, "is_active": True, "order": 4},
            {"id": gen_id(), "code": "ERROR_PRECIO", "name": "Error de Precio", "description": "Precio incorrecto en factura original", "affects_inventory": False, "requires_authorization": False, "is_active": True, "order": 5},
        ]
        await db.return_reasons.insert_many(defaults)
        return defaults
    return reasons


@router.post("/return-reasons")
async def create_return_reason(input: ReturnReasonInput, user=Depends(get_current_user)):
    """Crea un nuevo motivo de devolución"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores pueden crear motivos")
    
    count = await db.return_reasons.count_documents({})
    doc = {
        "id": gen_id(),
        "code": input.code.upper(),
        "name": input.name,
        "description": input.description,
        "affects_inventory": input.affects_inventory,
        "requires_authorization": input.requires_authorization,
        "is_active": True,
        "order": count,
        "created_at": now_iso(),
        "created_by": user["user_id"]
    }
    await db.return_reasons.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


# ─── CREDIT NOTES (B04) ───

@router.get("")
async def list_credit_notes(
    status: Optional[str] = Query(None),
    original_bill_id: Optional[str] = Query(None),
    limit: int = Query(50)
):
    """Lista todas las notas de crédito"""
    query = {}
    if status:
        query["status"] = status
    if original_bill_id:
        query["original_bill_id"] = original_bill_id
    
    notes = await db.credit_notes.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return notes


# ─── REPORTS (BEFORE DYNAMIC ROUTES) ───

@router.get("/reports/summary")
async def get_credit_notes_summary(
    period: str = Query("month", description="day, week, month"),
    user=Depends(get_current_user)
):
    """Resumen de notas de crédito por período"""
    from datetime import timedelta
    
    now = datetime.now(timezone.utc)
    if period == "day":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start_date = now - timedelta(days=7)
    else:  # month
        start_date = now - timedelta(days=30)
    
    notes = await db.credit_notes.find({
        "created_at": {"$gte": start_date.isoformat()},
        "status": "completed"
    }, {"_id": 0}).to_list(500)
    
    total_reversed = sum(n.get("total_reversed", 0) for n in notes)
    total_itbis = sum(n.get("itbis_reversed", 0) for n in notes)
    
    # Group by reason
    by_reason = {}
    for n in notes:
        reason = n.get("reason_name", "Sin razón")
        if reason not in by_reason:
            by_reason[reason] = {"count": 0, "total": 0}
        by_reason[reason]["count"] += 1
        by_reason[reason]["total"] += n.get("total_reversed", 0)
    
    return {
        "period": period,
        "total_notes": len(notes),
        "total_reversed": round(total_reversed, 2),
        "total_itbis_reversed": round(total_itbis, 2),
        "by_reason": [{"reason": k, **v} for k, v in by_reason.items()],
        "recent_notes": notes[:10]
    }


@router.get("/report-607-data")
async def get_607_credit_notes_data(
    start_date: str = Query(..., description="Fecha inicio YYYY-MM-DD"),
    end_date: str = Query(..., description="Fecha fin YYYY-MM-DD"),
    user=Depends(get_current_user)
):
    """
    Obtiene datos de notas de crédito formateados para el Reporte 607.
    
    En el 607, las notas de crédito (B04) aparecen con:
    - Tipo de NCF: 04
    - Montos negativos
    - Referencia al NCF afectado
    """
    # Buscar notas de crédito completadas en el período
    notes = await db.credit_notes.find({
        "status": "completed",
        "created_at": {
            "$gte": f"{start_date}",
            "$lte": f"{end_date}T23:59:59.999999"
        }
    }, {"_id": 0}).to_list(1000)
    
    # Formatear para 607
    report_data = []
    for cn in notes:
        report_data.append({
            "rnc_cedula": cn.get("customer_rnc", ""),
            "tipo_identificacion": "1" if cn.get("customer_rnc") else "3",
            "ncf": cn.get("ncf", ""),
            "ncf_modificado": cn.get("original_ncf", ""),  # NCF que se está afectando
            "tipo_ingreso": "04",  # Nota de Crédito
            "fecha_comprobante": cn.get("created_at", "")[:10],
            "fecha_pago": cn.get("created_at", "")[:10],
            "monto_facturado_itbis": round(abs(cn.get("itbis_reversed", 0)), 2),
            "monto_facturado": round(abs(cn.get("subtotal_reversed", 0)), 2),
            "itbis_retenido": 0,
            "itbis_proporcionalidad": 0,
            "itbis_costo": 0,
            "retencion_renta": 0,
            "isr_percibido": 0,
            "impuesto_selectivo": 0,
            "otros_impuestos": 0,
            "monto_propina": round(abs(cn.get("propina_reversed", 0)), 2),
            "forma_pago": "03",  # Nota de Crédito
            # Indicador de que es anulación
            "is_credit_note": True,
            "affects_ncf": cn.get("original_ncf"),
            "reason": cn.get("reason_name")
        })
    
    return {
        "period": f"{start_date} - {end_date}",
        "total_credit_notes": len(report_data),
        "total_amount": sum(abs(cn.get("total_reversed", 0)) for cn in notes),
        "data": report_data
    }


# ─── STANDALONE E34 GENERATOR (No shift required) ───
# IMPORTANT: These routes must be defined BEFORE /{note_id} to avoid route conflicts

@router.get("/find-bill")
async def find_bill_for_credit_note(search: str, user=Depends(get_current_user)):
    """
    Busca una factura por número de transacción o e-NCF para generar nota de crédito
    """
    from routers.auth import get_permissions
    
    # Check permission
    user_perms = get_permissions(user.get("role", "waiter"), user.get("permissions", {}))
    if not user_perms.get("manage_credit_notes") and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="No tienes permiso para generar notas de crédito")
    
    search = search.strip()
    if not search:
        raise HTTPException(status_code=400, detail="Debes proporcionar un número de transacción o e-NCF")
    
    # Build query - try both string and int for transaction_number
    search_conditions = [
        {"ecf_encf": search.upper()},
        {"ecf_encf": search},
    ]
    # Try parsing as int for transaction_number
    try:
        search_int = int(search)
        search_conditions.append({"transaction_number": search_int})
    except ValueError:
        search_conditions.append({"transaction_number": search})
    
    # First, search for ANY bill matching the criteria (regardless of status)
    bill = await db.bills.find_one({
        "$or": search_conditions
    }, {"_id": 0})
    
    # Case 1: Bill doesn't exist at all
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada. Verifica el número de transacción o e-NCF.")
    
    # Case 2: Check if bill is in contingency (PENDING- prefix in ecf_encf)
    ecf_encf = bill.get("ecf_encf", "")
    if ecf_encf and ecf_encf.startswith("PENDING-"):
        raise HTTPException(status_code=400, detail="Esta factura está en contingencia. Resuélvela primero desde el Dashboard e-CF antes de generar una nota de crédito.")
    
    # Case 3: Check if bill is pending DGII approval (ecf_status not accepted)
    ecf_status = bill.get("ecf_status", "")
    bill_status = bill.get("status", "")
    
    if bill_status != "paid":
        if bill_status == "pending" or bill_status == "active":
            raise HTTPException(status_code=400, detail="Esta factura aún no ha sido cobrada. Solo se pueden generar notas de crédito sobre facturas pagadas.")
        elif bill_status == "cancelled":
            raise HTTPException(status_code=400, detail="Esta factura fue anulada. No se puede generar nota de crédito sobre facturas anuladas.")
    
    if ecf_status == "pending" or ecf_status == "processing":
        raise HTTPException(status_code=400, detail="Esta factura está pendiente de aprobación por la DGII. Solo se pueden generar notas de crédito sobre facturas aprobadas.")
    
    if ecf_status == "error" or ecf_status == "rejected":
        raise HTTPException(status_code=400, detail="Esta factura tiene un error de validación con la DGII. Resuélvela primero desde el Dashboard e-CF antes de generar una nota de crédito.")
    
    # Case 4: Check if already has credit note
    existing_cn = await db.credit_notes.find_one({
        "original_bill_id": bill["id"],
        "status": {"$in": ["pending", "completed"]}
    }, {"_id": 0, "id": 1, "ncf": 1, "ecf_encf": 1})
    
    has_credit_note = existing_cn is not None
    credit_note_encf = existing_cn.get("ecf_encf") or existing_cn.get("ncf") if existing_cn else None
    
    # If has credit note, return 400 with specific message
    if has_credit_note:
        raise HTTPException(status_code=400, detail=f"Esta factura ya tiene una Nota de Crédito generada (e-NCF: {credit_note_encf}).")
    
    return {
        "id": bill.get("id"),
        "transaction_number": bill.get("transaction_number"),
        "ecf_encf": bill.get("ecf_encf"),
        "ncf": bill.get("ncf"),
        "ecf_type": bill.get("ecf_type"),
        "ecf_status": bill.get("ecf_status"),
        "total": bill.get("total", 0),
        "subtotal": bill.get("subtotal", 0),
        "itbis": bill.get("itbis", 0),
        "propina_legal": bill.get("propina_legal", 0),
        "table_number": bill.get("table_name") or bill.get("table_number"),
        "waiter_name": bill.get("waiter_name"),
        "cashier_name": bill.get("cashier_name"),
        "paid_at": bill.get("paid_at"),
        "items": bill.get("items", []),
        "customer_name": bill.get("customer_name") or bill.get("razon_social"),
        "customer_rnc": bill.get("customer_rnc") or bill.get("fiscal_id"),
        "has_credit_note": False,
        "credit_note_encf": None,
    }


@router.post("/generate-e34")
async def generate_standalone_e34_endpoint(input: dict, user=Depends(get_current_user)):
    """
    Genera una Nota de Crédito E34 independiente de turno de cajero
    Solo para admin/propietario con permiso manage_credit_notes
    """
    from routers.auth import get_permissions
    from routers.alanube import build_alanube_payload, send_to_alanube, save_alanube_response
    
    # Check permission
    user_perms = get_permissions(user.get("role", "waiter"), user.get("permissions", {}))
    if not user_perms.get("manage_credit_notes") and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="No tienes permiso para generar notas de crédito")
    
    search = input.get("search", "").strip()
    reason = input.get("reason", "").strip()
    
    if not search:
        raise HTTPException(status_code=400, detail="Debes proporcionar un número de transacción o e-NCF")
    if not reason:
        raise HTTPException(status_code=400, detail="Debes proporcionar un motivo para la nota de crédito")
    
    # Build query - try both string and int for transaction_number
    search_conditions = [
        {"ecf_encf": search.upper()},
        {"ecf_encf": search},
    ]
    try:
        search_int = int(search)
        search_conditions.append({"transaction_number": search_int})
    except ValueError:
        search_conditions.append({"transaction_number": search})
    
    # 1. Find the original bill
    bill = await db.bills.find_one({
        "$or": search_conditions,
        "status": "paid"
    }, {"_id": 0})
    
    if not bill:
        raise HTTPException(status_code=404, detail="Factura no encontrada o no está pagada")
    
    # 2. Validate bill has valid e-NCF (not contingency)
    original_encf = bill.get("ecf_encf", "")
    if not original_encf or original_encf.startswith("PENDING-"):
        raise HTTPException(status_code=400, detail="Esta factura está en contingencia y no tiene e-NCF válido para generar nota de crédito")
    
    # 3. Check if already has credit note
    existing_cn = await db.credit_notes.find_one({
        "original_bill_id": bill["id"],
        "status": {"$in": ["pending", "completed"]}
    }, {"_id": 0, "id": 1, "ncf": 1, "ecf_encf": 1})
    
    if existing_cn:
        cn_encf = existing_cn.get("ecf_encf") or existing_cn.get("ncf")
        raise HTTPException(status_code=400, detail=f"Esta factura ya tiene una nota de crédito: {cn_encf}")
    
    # 4. Generate E34 sequence from Supabase
    e34_encf = None
    if supabase_client:
        try:
            seq_result = supabase_client.table("ncf_sequences").select("*").eq("ncf_type_id", "E34").eq("is_active", True).limit(1).execute()
            if not seq_result.data:
                # Fallback to ncf_type_code
                seq_result = supabase_client.table("ncf_sequences").select("*").eq("ncf_type_code", "E34").eq("is_active", True).limit(1).execute()
            
            if seq_result.data and len(seq_result.data) > 0:
                seq = seq_result.data[0]
                current_num = seq.get("current_number", 1)
                serie = seq.get("serie", "E")
                e34_encf = f"{serie}34{current_num:08d}"
                
                # Update sequence
                supabase_client.table("ncf_sequences").update({
                    "current_number": current_num + 1
                }).eq("id", seq["id"]).execute()
            else:
                raise HTTPException(status_code=400, detail="No hay secuencia E34 activa en Supabase")
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error getting E34 sequence: {e}")
            raise HTTPException(status_code=500, detail=f"Error obteniendo secuencia E34: {str(e)}")
    else:
        raise HTTPException(status_code=500, detail="Supabase no configurado")
    
    # 5. Calculate amounts (100% reversal)
    subtotal = bill.get("subtotal", 0)
    itbis = bill.get("itbis", 0)
    propina = bill.get("propina_legal", 0)
    total = bill.get("total", 0)
    
    # 6. Create credit note document
    credit_note = {
        "id": gen_id(),
        "ncf": e34_encf,
        "ecf_encf": e34_encf,
        "ncf_type": "E34",
        "ecf_type": "E34",
        "original_bill_id": bill["id"],
        "original_ncf": original_encf,
        "original_encf": original_encf,
        "original_date": bill.get("paid_at") or bill.get("created_at"),
        
        # Customer info
        "customer_id": bill.get("customer_id"),
        "customer_name": bill.get("customer_name") or bill.get("razon_social"),
        "customer_rnc": bill.get("customer_rnc") or bill.get("fiscal_id"),
        
        # Reason
        "reason_code": "ANULACION_ADMIN",
        "reason_name": reason,
        "notes": f"Generada por {user['name']} - {reason}",
        "is_full_reversal": True,
        
        # Items
        "items": bill.get("items", []),
        
        # Amounts (negative for accounting)
        "subtotal": round(-subtotal, 2),
        "itbis": round(-itbis, 2),
        "propina_legal": round(-propina, 2),
        "total": round(-total, 2),
        
        # Positive for display
        "subtotal_reversed": round(subtotal, 2),
        "itbis_reversed": round(itbis, 2),
        "propina_reversed": round(propina, 2),
        "total_reversed": round(total, 2),
        
        # Status
        "status": "pending",
        "ecf_status": "pending",
        "created_at": now_iso(),
        "created_by": user["user_id"],
        "created_by_name": user["name"],
    }
    
    # 7. Send to Alanube
    try:
        system_config = await db.system_config.find_one({}, {"_id": 0}) or {}
        
        # Build E34 payload with credit note indicator
        payload = build_credit_note_payload(bill, credit_note, system_config, e34_encf)
        
        # Send to Alanube
        result = await send_to_alanube(payload)
        
        if result.get("ok"):
            credit_note["status"] = "completed"
            credit_note["ecf_status"] = "accepted"
            credit_note["alanube_id"] = result.get("alanube_id")
            credit_note["alanube_track_id"] = result.get("trackId")
        else:
            credit_note["status"] = "completed"  # Still save locally
            credit_note["ecf_status"] = "error"
            credit_note["ecf_error"] = result.get("error", "Error desconocido")
    except Exception as e:
        print(f"Alanube E34 error: {e}")
        credit_note["status"] = "completed"
        credit_note["ecf_status"] = "error"
        credit_note["ecf_error"] = str(e)
    
    # 8. Save credit note
    await db.credit_notes.insert_one(credit_note)
    
    # 9. Update original bill
    await db.bills.update_one(
        {"id": bill["id"]},
        {"$set": {
            "has_credit_note": True,
            "credit_note_id": credit_note["id"],
            "credit_note_encf": e34_encf,
        }}
    )
    
    # 10. Audit log
    await db.role_audit_logs.insert_one({
        "id": gen_id(),
        "action": "credit_note_e34_generated",
        "original_bill_id": bill["id"],
        "original_encf": original_encf,
        "credit_note_id": credit_note["id"],
        "credit_note_encf": e34_encf,
        "reason": reason,
        "total_reversed": total,
        "performed_by_id": user["user_id"],
        "performed_by_name": user["name"],
        "created_at": now_iso(),
    })
    
    return {
        "ok": True,
        "credit_note_id": credit_note["id"],
        "ecf_encf": e34_encf,
        "ecf_status": credit_note.get("ecf_status"),
        "ecf_error": credit_note.get("ecf_error"),
        "total_reversed": total,
        "message": f"Nota de Crédito E34 generada: {e34_encf}"
    }


# ─── DYNAMIC ROUTES ───

@router.get("/{note_id}")
async def get_credit_note(note_id: str):
    """Obtiene una nota de crédito específica"""
    note = await db.credit_notes.find_one({"id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    return note


@router.post("")
async def create_credit_note(input: CreditNoteInput, user=Depends(get_current_user)):
    """
    Genera una Nota de Crédito (B04) para revertir una factura
    
    Proceso DGII:
    1. Obtener factura original
    2. Validar que no tenga ya una nota de crédito activa
    3. Generar NCF B04
    4. Crear nota de crédito vinculada
    5. Actualizar estado de factura original
    6. Si aplica, revertir inventario
    """
    # 1. Obtener factura original
    original_bill = await db.bills.find_one({"id": input.original_bill_id}, {"_id": 0})
    if not original_bill:
        raise HTTPException(status_code=404, detail="Factura original no encontrada")
    
    if original_bill.get("status") != "paid":
        raise HTTPException(status_code=400, detail="Solo se pueden revertir facturas pagadas")
    
    # 2. Verificar que no tenga nota de crédito activa
    existing_cn = await db.credit_notes.find_one({
        "original_bill_id": input.original_bill_id,
        "status": {"$in": ["pending", "completed"]}
    })
    if existing_cn:
        raise HTTPException(
            status_code=400, 
            detail=f"Esta factura ya tiene una nota de crédito asociada: {existing_cn.get('ncf', existing_cn['id'][:8])}"
        )
    
    # 3. Obtener motivo de devolución
    reason = await db.return_reasons.find_one({"id": input.reason_id}, {"_id": 0})
    if not reason:
        raise HTTPException(status_code=400, detail="Motivo de devolución no válido")
    
    # 4. Verificar autorización si es necesaria
    # Roles con nivel >= 40 (supervisor+) pueden autorizar, o roles "admin"/"manager" explícitos
    user_role = user.get("role", "")
    user_role_level = user.get("role_level", 0)
    can_authorize = user_role in ["admin", "manager", "supervisor"] or user_role_level >= 40
    
    if reason.get("requires_authorization") and not can_authorize:
        raise HTTPException(
            status_code=403, 
            detail="Este tipo de reversión requiere autorización de un administrador"
        )
    
    # 5. Calcular montos a revertir
    if input.is_full_reversal:
        items_to_reverse = original_bill.get("items", [])
        subtotal_reversed = original_bill.get("subtotal", 0)
        itbis_reversed = original_bill.get("itbis", 0)
        propina_reversed = original_bill.get("propina_legal", 0)
        total_reversed = original_bill.get("total", 0)
    else:
        # Reversión parcial - solo items seleccionados
        if not input.items_to_reverse:
            raise HTTPException(status_code=400, detail="Para reversión parcial, debe especificar los items")
        
        items_to_reverse = []
        subtotal_reversed = 0
        for item_req in input.items_to_reverse:
            original_item = next((i for i in original_bill.get("items", []) if i["item_id"] == item_req.get("item_id")), None)
            if original_item:
                qty_to_reverse = item_req.get("quantity", original_item["quantity"])
                item_total = (original_item["unit_price"] + original_item.get("modifiers_total", 0)) * qty_to_reverse
                items_to_reverse.append({
                    **original_item,
                    "quantity_reversed": qty_to_reverse,
                    "total_reversed": round(item_total, 2)
                })
                subtotal_reversed += item_total
        
        # Calcular impuestos proporcionales
        original_subtotal = original_bill.get("subtotal", 1)
        proportion = subtotal_reversed / original_subtotal if original_subtotal > 0 else 0
        itbis_reversed = round(original_bill.get("itbis", 0) * proportion, 2)
        propina_reversed = round(original_bill.get("propina_legal", 0) * proportion, 2)
        total_reversed = round(subtotal_reversed + itbis_reversed + propina_reversed, 2)
    
    # 6. Generar NCF E34 (Nota de Crédito Electrónica)
    ncf_e34 = None
    if supabase_client:
        try:
            # Get active E34 sequence (fallback to B04 for migration)
            seq_result = supabase_client.table("ncf_sequences").select("*").eq("ncf_type_id", "E34").eq("is_active", True).limit(1).execute()
            if not seq_result.data:
                seq_result = supabase_client.table("ncf_sequences").select("*").eq("ncf_type_id", "B04").eq("is_active", True).limit(1).execute()
            
            if seq_result.data and len(seq_result.data) > 0:
                seq = seq_result.data[0]
                current_num = seq.get("current_number", 1)
                prefix = seq.get("sequence_prefix", "E34")
                if prefix == "B04":
                    prefix = "E34"
                ncf_e34 = f"{prefix}{current_num:08d}"
                
                # Update sequence
                supabase_client.table("ncf_sequences").update({
                    "current_number": current_num + 1
                }).eq("id", seq["id"]).execute()
            else:
                # Fallback: generate from MongoDB
                ncf_doc = await db.ncf_sequences.find_one_and_update(
                    {"prefix": "E34"},
                    {"$inc": {"current_number": 1}},
                    upsert=True,
                    return_document=True
                )
                ncf_num = ncf_doc.get("current_number", 1) if ncf_doc else 1
                ncf_e34 = f"E34{ncf_num:08d}"
        except Exception as e:
            print(f"Warning: NCF E34 generation error: {e}")
            ncf_doc = await db.ncf_sequences.find_one_and_update(
                {"prefix": "E34"},
                {"$inc": {"current_number": 1}},
                upsert=True,
                return_document=True
            )
            ncf_num = ncf_doc.get("current_number", 1) if ncf_doc else 1
            ncf_e34 = f"E34{ncf_num:08d}"
    else:
        ncf_doc = await db.ncf_sequences.find_one_and_update(
            {"prefix": "E34"},
            {"$inc": {"current_number": 1}},
            upsert=True,
            return_document=True
        )
        ncf_num = ncf_doc.get("current_number", 1) if ncf_doc else 1
        ncf_e34 = f"E34{ncf_num:08d}"
    
    # 7. Crear nota de crédito
    credit_note = {
        "id": gen_id(),
        "ncf": ncf_e34,
        "ncf_type": "E34",
        "ecf_type": "E34",
        "original_bill_id": input.original_bill_id,
        "original_ncf": original_bill.get("ncf"),
        "original_date": original_bill.get("paid_at") or original_bill.get("created_at"),
        
        # Customer info from original bill
        "customer_id": original_bill.get("customer_id"),
        "customer_name": original_bill.get("customer_name"),
        "customer_rnc": original_bill.get("customer_rnc"),
        
        # Reversal details
        "reason_id": input.reason_id,
        "reason_code": reason.get("code"),
        "reason_name": reason.get("name"),
        "notes": input.notes,
        "is_full_reversal": input.is_full_reversal,
        
        # Items reversed
        "items": items_to_reverse,
        
        # Amounts (negative values for accounting)
        "subtotal": round(-subtotal_reversed, 2),
        "itbis": round(-itbis_reversed, 2),
        "propina_legal": round(-propina_reversed, 2),
        "total": round(-total_reversed, 2),
        
        # Positive values for display
        "subtotal_reversed": round(subtotal_reversed, 2),
        "itbis_reversed": round(itbis_reversed, 2),
        "propina_reversed": round(propina_reversed, 2),
        "total_reversed": round(total_reversed, 2),
        
        # Audit
        "status": "completed",
        "created_at": now_iso(),
        "created_by": user["user_id"],
        "created_by_name": user["name"],
        "authorized_by": user["user_id"] if reason.get("requires_authorization") else None,
        "authorized_by_name": user["name"] if reason.get("requires_authorization") else None
    }
    
    await db.credit_notes.insert_one(credit_note)
    
    # 8. Update original bill status
    await db.bills.update_one(
        {"id": input.original_bill_id},
        {"$set": {
            "status": "reversed" if input.is_full_reversal else "partially_reversed",
            "credit_note_id": credit_note["id"],
            "credit_note_ncf": ncf_e34,
            "reversed_at": now_iso(),
            "reversed_by": user["user_id"],
            "reversed_by_name": user["name"]
        }}
    )
    
    # 9. Revert inventory if applicable
    if reason.get("affects_inventory"):
        for item in items_to_reverse:
            product_id = item.get("product_id")
            qty = item.get("quantity_reversed", item.get("quantity", 0))
            if product_id and qty > 0:
                await db.products.update_one(
                    {"id": product_id},
                    {"$inc": {"stock": qty}}
                )
    
    # 10. Update POS session if exists (Supabase)
    if supabase_client:
        try:
            # Find the current user's open session (the cashier who is executing the B04)
            session_result = supabase_client.table("pos_sessions").select("*").eq("opened_by", user["user_id"]).eq("status", "open").limit(1).execute()
            if not session_result.data or len(session_result.data) == 0:
                # Fallback: find any open session (in case cashier opened with different user_id)
                session_result = supabase_client.table("pos_sessions").select("*").eq("status", "open").limit(1).execute()
            
            if session_result.data and len(session_result.data) > 0:
                session = session_result.data[0]
                
                # Create negative cash movement for the reversal
                movement_data = {
                    "id": gen_id(),
                    "ref": f"CN-{ncf_e34}",
                    "session_id": session["id"],
                    "movement_type": "credit_note",
                    "direction": -1,
                    "amount": total_reversed,
                    "payment_method": original_bill.get("payment_method", "cash"),
                    "description": f"Nota de Crédito {ncf_e34} - {reason.get('name')}",
                    "created_by": user["user_id"],
                    "created_by_name": user["name"]
                }
                supabase_client.table("cash_movements").insert(movement_data).execute()
        except Exception as e:
            import traceback
            print(f"WARNING: Could not create credit note movement in Supabase: {e}")
            traceback.print_exc()
    
    # 11. Create audit log
    audit_log = {
        "id": gen_id(),
        "action": "credit_note_created",
        "credit_note_id": credit_note["id"],
        "credit_note_ncf": ncf_e34,
        "original_bill_id": input.original_bill_id,
        "original_ncf": original_bill.get("ncf"),
        "reason": reason.get("name"),
        "total_reversed": total_reversed,
        "is_full_reversal": input.is_full_reversal,
        "user_id": user["user_id"],
        "user_name": user["name"],
        "created_at": now_iso()
    }
    await db.audit_logs.insert_one(audit_log)
    
    return {k: v for k, v in credit_note.items() if k != "_id"}


@router.post("/{note_id}/cancel")
async def cancel_credit_note(note_id: str, user=Depends(get_current_user)):
    """Cancela una nota de crédito (solo si está pendiente)"""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores pueden cancelar notas de crédito")
    
    note = await db.credit_notes.find_one({"id": note_id}, {"_id": 0})
    if not note:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    
    if note.get("status") == "completed":
        raise HTTPException(status_code=400, detail="No se puede cancelar una nota de crédito completada. Use una nueva factura.")
    
    await db.credit_notes.update_one(
        {"id": note_id},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": now_iso(),
            "cancelled_by": user["user_id"],
            "cancelled_by_name": user["name"]
        }}
    )
    
    # Restore original bill status
    await db.bills.update_one(
        {"id": note["original_bill_id"]},
        {"$set": {
            "status": "paid",
            "credit_note_id": None,
            "credit_note_ncf": None
        }}
    )
    
    return {"ok": True, "message": "Nota de crédito cancelada"}


# ─── SEARCH BY TRANSACTION NUMBER ───

class SearchTransactionInput(BaseModel):
    transaction_number: int

@router.post("/search-by-transaction")
async def search_by_transaction_number(input: SearchTransactionInput, user=Depends(get_current_user)):
    """
    Busca una factura pagada por su número de transacción interno.
    Solo retorna facturas que están cerradas (paid) y son elegibles para nota de crédito.
    
    SEGURIDAD: Solo administradores pueden usar esta función.
    """
    # Verificar permisos de admin
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Solo administradores pueden re-abrir transacciones"
        )
    
    # Buscar factura por número de transacción
    bill = await db.bills.find_one(
        {"transaction_number": input.transaction_number, "status": "paid"},
        {"_id": 0}
    )
    
    if not bill:
        # Intentar buscar en facturas revertidas
        bill_reversed = await db.bills.find_one(
            {"transaction_number": input.transaction_number, "status": {"$in": ["reversed", "partially_reversed"]}},
            {"_id": 0}
        )
        if bill_reversed:
            raise HTTPException(
                status_code=400,
                detail=f"Esta transacción ya fue anulada. NCF B04: {bill_reversed.get('credit_note_ncf', 'N/A')}"
            )
        
        raise HTTPException(
            status_code=404,
            detail=f"No se encontró factura pagada con transacción #{input.transaction_number}"
        )
    
    # Verificar si ya tiene nota de crédito
    if bill.get("credit_note_id"):
        raise HTTPException(
            status_code=400,
            detail=f"Esta factura ya tiene una nota de crédito: {bill.get('credit_note_ncf', 'N/A')}"
        )
    
    # Obtener detalles adicionales
    order = await db.orders.find_one({"id": bill.get("order_id")}, {"_id": 0})
    
    return {
        "bill": bill,
        "order": order,
        "can_create_credit_note": True,
        "original_ncf": bill.get("ncf"),
        "original_total": bill.get("total"),
        "paid_at": bill.get("paid_at"),
        "table_number": bill.get("table_number")
    }


# ─── PRINT CREDIT NOTE ───

@router.post("/{note_id}/print")
async def print_credit_note(note_id: str, user=Depends(get_current_user)):
    """
    Genera trabajo de impresión para nota de crédito.
    Formato sigue requerimientos DGII para B04.
    """
    cn = await db.credit_notes.find_one({"id": note_id}, {"_id": 0})
    if not cn:
        raise HTTPException(status_code=404, detail="Nota de crédito no encontrada")
    
    # Obtener configuración
    config = await db.system_config.find_one({"id": "printer_config"}, {"_id": 0}) or {}
    receipt_channel = await db.print_channels.find_one({"code": "receipt"}, {"_id": 0})
    printer_name = receipt_channel.get("printer_name", "") if receipt_channel else ""
    
    # Construir comandos ESC/POS
    commands = []
    
    # Encabezado del negocio
    commands.append({"type": "text", "text": config.get("business_name", "ALONZO CIGAR"), "align": "center", "bold": True, "size": 2})
    biz_addr = config.get("business_address", "")
    if biz_addr:
        commands.append({"type": "text", "text": biz_addr[:40], "align": "center"})
    commands.append({"type": "text", "text": f"RNC: {config.get('rnc', '1-31-75577-1')}", "align": "center"})
    commands.append({"type": "text", "text": f"Tel: {config.get('phone', '809-301-3858')}", "align": "center"})
    commands.append({"type": "divider"})
    
    # NOTA DE CRÉDITO Header (prominente)
    commands.append({"type": "text", "text": "*** NOTA DE CREDITO ***", "align": "center", "bold": True, "size": 2})
    commands.append({"type": "text", "text": cn.get("ncf", ""), "align": "center", "bold": True, "size": 2})
    commands.append({"type": "divider"})
    
    # NCF AFECTADO (crítico para DGII)
    commands.append({"type": "text", "text": "NCF AFECTADO:", "align": "center", "bold": True})
    commands.append({"type": "text", "text": cn.get("original_ncf", "N/A"), "align": "center", "bold": True})
    commands.append({"type": "text", "text": f"Fecha Original: {cn.get('original_date', '')[:10]}", "align": "center"})
    commands.append({"type": "divider"})
    
    # Información de la transacción
    # Obtener número de transacción del bill original
    original_bill = await db.bills.find_one({"id": cn.get("original_bill_id")}, {"_id": 0, "transaction_number": 1, "table_number": 1})
    trans_num = original_bill.get("transaction_number") if original_bill else cn.get("transaction_number")
    
    commands.append({"type": "columns", "left": "Transaccion:", "right": f"#{trans_num or 'N/A'}"})
    table_num = original_bill.get("table_number") if original_bill else cn.get("table_number")
    commands.append({"type": "columns", "left": "Mesa:", "right": str(table_num or "")})
    commands.append({"type": "columns", "left": "Fecha:", "right": cn.get("created_at", "")[:19].replace("T", " ")})
    commands.append({"type": "columns", "left": "Autorizado:", "right": (cn.get("authorized_by_name") or cn.get("created_by_name", ""))[:20]})
    commands.append({"type": "divider"})
    
    # Razón de anulación
    commands.append({"type": "text", "text": f"RAZON: {cn.get('reason_name', '')}", "align": "center", "bold": True})
    if cn.get("notes"):
        # Dividir notas largas en líneas
        notes = cn["notes"][:80]
        commands.append({"type": "text", "text": notes, "align": "center"})
    commands.append({"type": "divider"})
    
    # Items (mostrando como crédito/negativo)
    for item in cn.get("items", []):
        qty = item.get("quantity_reversed", item.get("quantity", 1))
        name = item.get("product_name", "")[:25]
        total = abs(item.get("total_reversed", item.get("total", 0)))
        commands.append({"type": "columns", "left": f"{qty}x {name}", "right": f"-RD$ {total:,.2f}"})
    
    commands.append({"type": "divider"})
    
    # Totales (negativos - crédito)
    subtotal = abs(cn.get("subtotal_reversed", abs(cn.get("subtotal", 0))))
    itbis = abs(cn.get("itbis_reversed", abs(cn.get("itbis", 0))))
    propina = abs(cn.get("propina_reversed", abs(cn.get("propina_legal", 0))))
    total = abs(cn.get("total_reversed", abs(cn.get("total", 0))))
    
    commands.append({"type": "columns", "left": "Subtotal", "right": f"-RD$ {subtotal:,.2f}"})
    commands.append({"type": "columns", "left": "ITBIS 18%", "right": f"-RD$ {itbis:,.2f}"})
    if propina > 0:
        commands.append({"type": "columns", "left": "Propina", "right": f"-RD$ {propina:,.2f}"})
    commands.append({"type": "double_divider"})
    commands.append({"type": "columns", "left": "TOTAL CREDITO", "right": f"-RD$ {total:,.2f}", "bold": True})
    
    commands.append({"type": "divider"})
    
    # Aviso legal
    commands.append({"type": "text", "text": "DOCUMENTO FISCAL", "align": "center", "bold": True})
    commands.append({"type": "text", "text": "ANULA FACTURA INDICADA", "align": "center", "bold": True})
    commands.append({"type": "text", "text": "Conserve para fines de DGII", "align": "center"})
    
    commands.append({"type": "feed", "lines": 3})
    commands.append({"type": "cut"})
    
    # Crear trabajo de impresión
    job = {
        "id": gen_id(),
        "type": "credit_note",
        "channel": "receipt",
        "printer_name": printer_name,
        "commands": commands,
        "status": "pending",
        "created_at": now_iso()
    }
    await db.print_queue.insert_one(job)
    
    return {"ok": True, "job_id": job["id"], "message": "Nota de crédito enviada a impresora"}


def build_credit_note_payload(original_bill: dict, credit_note: dict, system_config: dict, encf: str) -> dict:
    """Build Alanube payload for E34 credit note"""
    import os
    from datetime import datetime, timezone
    
    now = datetime.now(timezone.utc)
    stamp_date = now.strftime("%Y-%m-%d")
    
    # Items
    items_detail = []
    total_taxed = 0
    total_itbis = 0
    line = 0
    
    for item in original_bill.get("items", []):
        if item.get("status") == "cancelled":
            continue
        line += 1
        qty = item.get("quantity", 1)
        unit_price = item.get("unit_price", 0)
        item_amount = round(qty * unit_price, 2)
        
        tax_exemptions = item.get("tax_exemptions", [])
        if not tax_exemptions:
            total_taxed += item_amount
            total_itbis += round(item_amount * 0.18, 2)
        
        items_detail.append({
            "lineNumber": line,
            "billingIndicator": 4 if tax_exemptions else 1,
            "itemName": (item.get("product_name", "") or "Producto")[:80],
            "goodServiceIndicator": 1,
            "quantityItem": qty,
            "unitPriceItem": unit_price,
            "itemAmount": item_amount,
        })
    
    total_amount = round(credit_note.get("total_reversed", 0), 2)
    
    # Sender
    sender = {
        "rnc": os.environ.get("ALANUBE_SANDBOX_RNC", (system_config.get("rnc", "") or "").replace("-", "")),
        "companyName": system_config.get("restaurant_name", "VexlyPOS"),
        "tradeName": system_config.get("restaurant_name", "VexlyPOS"),
        "stampDate": stamp_date,
        "address": system_config.get("address", "Calle Principal #1") or "Calle Principal #1",
        "phoneNumber": [system_config.get("phone", "000-000-0000") or "000-000-0000"],
    }
    
    # Buyer
    buyer_rnc = (original_bill.get("fiscal_id", "") or original_bill.get("customer_rnc", "") or "").replace("-", "")
    buyer_name = original_bill.get("razon_social", "") or original_bill.get("customer_name", "") or "CONSUMIDOR FINAL"
    buyer = {
        "rnc": buyer_rnc or "000000000",
        "companyName": buyer_name,
    }
    
    # Totals
    totals = {
        "totalTaxedAmount": total_taxed,
        "taxedAmount1Total": total_taxed if total_taxed > 0 else None,
        "itbis1Total": total_itbis if total_itbis > 0 else None,
        "totalITBIS": total_itbis,
        "totalAmount": total_amount,
        "totalPaid": total_amount,
        "paymentForms": [{"paymentType": 4, "paymentAmount": total_amount}],  # Nota de Crédito
    }
    totals = {k: v for k, v in totals.items() if v is not None}
    
    # Information reference (required for credit notes)
    original_encf = credit_note.get("original_encf") or credit_note.get("original_ncf", "")
    original_date = credit_note.get("original_date", "")[:10] if credit_note.get("original_date") else stamp_date
    
    payload = {
        "idDoc": {
            "encf": encf,
            "invoiceType": 34,  # E34 = Nota de Crédito Electrónica
            "paymentType": 1,
            "incomeType": 1,
            "voucherNumber": encf,
            "sequenceDueDate": "2027-12-31",
        },
        "sender": sender,
        "buyer": buyer,
        "totals": totals,
        "itemDetails": items_detail,
        # Credit note indicator and reference
        "creditNoteIndicator": 1,
        "informationReference": [{
            "ncfModified": original_encf,
            "ncfModifiedDate": original_date,
        }],
    }
    
    return payload
