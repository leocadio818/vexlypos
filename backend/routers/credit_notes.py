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
    if reason.get("requires_authorization") and user.get("role") not in ["admin", "manager"]:
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
    
    # 6. Generar NCF B04
    ncf_b04 = None
    if supabase_client:
        try:
            # Get active B04 sequence
            seq_result = supabase_client.table("ncf_sequences").select("*").eq("ncf_type_id", "B04").eq("is_active", True).limit(1).execute()
            
            if seq_result.data and len(seq_result.data) > 0:
                seq = seq_result.data[0]
                current_num = seq.get("current_number", 1)
                prefix = seq.get("sequence_prefix", "B04")
                ncf_b04 = f"{prefix}{current_num:08d}"
                
                # Update sequence
                supabase_client.table("ncf_sequences").update({
                    "current_number": current_num + 1
                }).eq("id", seq["id"]).execute()
            else:
                # Fallback: generate from MongoDB
                ncf_doc = await db.ncf_sequences.find_one_and_update(
                    {"prefix": "B04"},
                    {"$inc": {"current_number": 1}},
                    upsert=True,
                    return_document=True
                )
                ncf_num = ncf_doc.get("current_number", 1) if ncf_doc else 1
                ncf_b04 = f"B04{ncf_num:08d}"
        except Exception as e:
            print(f"Warning: NCF B04 generation error: {e}")
            # Fallback to MongoDB
            ncf_doc = await db.ncf_sequences.find_one_and_update(
                {"prefix": "B04"},
                {"$inc": {"current_number": 1}},
                upsert=True,
                return_document=True
            )
            ncf_num = ncf_doc.get("current_number", 1) if ncf_doc else 1
            ncf_b04 = f"B04{ncf_num:08d}"
    else:
        # MongoDB fallback
        ncf_doc = await db.ncf_sequences.find_one_and_update(
            {"prefix": "B04"},
            {"$inc": {"current_number": 1}},
            upsert=True,
            return_document=True
        )
        ncf_num = ncf_doc.get("current_number", 1) if ncf_doc else 1
        ncf_b04 = f"B04{ncf_num:08d}"
    
    # 7. Crear nota de crédito
    credit_note = {
        "id": gen_id(),
        "ncf": ncf_b04,
        "ncf_type": "B04",
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
            "credit_note_ncf": ncf_b04,
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
            session_result = supabase_client.table("pos_sessions").select("*").eq("opened_by", user["user_id"]).eq("status", "open").limit(1).execute()
            
            if session_result.data and len(session_result.data) > 0:
                session = session_result.data[0]
                
                # Create negative cash movement for the reversal
                movement_data = {
                    "id": gen_id(),
                    "ref": f"CN-{ncf_b04}",
                    "session_id": session["id"],
                    "movement_type": "credit_note",
                    "direction": -1,
                    "amount": total_reversed,
                    "payment_method": original_bill.get("payment_method", "cash"),
                    "description": f"Nota de Crédito {ncf_b04} - {reason.get('name')}",
                    "created_by": user["user_id"],
                    "created_by_name": user["name"]
                }
                supabase_client.table("cash_movements").insert(movement_data).execute()
        except Exception as e:
            print(f"Warning: Could not update POS session for credit note: {e}")
    
    # 11. Create audit log
    audit_log = {
        "id": gen_id(),
        "action": "credit_note_created",
        "credit_note_id": credit_note["id"],
        "credit_note_ncf": ncf_b04,
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


# ─── REPORTS ───

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
