"""
Tax Configuration Router - Sistema de Impuestos Dinámico
Permite configurar impuestos por producto y calcularlos dinámicamente
Motor de Inteligencia Fiscal con Jerarquía: Tipo de Venta + Producto/Categoría
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime, timezone
import uuid
import os

router = APIRouter(prefix="/taxes", tags=["Taxes"])

# Database reference
db = None

# Supabase client for sale_types
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
            print("✅ Taxes Router: Supabase initialized")
    except Exception as e:
        print(f"❌ Taxes Router: Supabase init error: {e}")

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── MODELS ───

class TaxConfigInput(BaseModel):
    code: str  # ITBIS, PROPINA, ISC, etc.
    name: str
    rate: float  # Porcentaje (18.0, 10.0, etc.)
    tax_type: str = "percentage"  # percentage, fixed
    applies_to: str = "subtotal"  # subtotal, total
    is_dine_in_only: bool = False  # True = solo aplica para consumo en local (ej: Propina Legal)
    is_active: bool = True
    sort_order: int = 0
    dgii_code: Optional[str] = None  # Código DGII para reportes
    description: Optional[str] = None

class ProductTaxInput(BaseModel):
    product_id: str
    tax_code: str
    is_exempt: bool = False
    exempt_reason: Optional[str] = None


# ─── TAX CONFIG ENDPOINTS ───

@router.get("/config")
async def get_tax_configs():
    """Obtiene todas las configuraciones de impuestos"""
    configs = await db.tax_config.find({"is_active": True}, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return configs


@router.post("/config")
async def create_tax_config(input: TaxConfigInput):
    """Crea una nueva configuración de impuesto"""
    existing = await db.tax_config.find_one({"code": input.code}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un impuesto con código {input.code}")
    
    config = {
        "id": gen_id(),
        "code": input.code.upper(),
        "name": input.name,
        "rate": input.rate,
        "tax_type": input.tax_type,
        "applies_to": input.applies_to,
        "is_dine_in_only": input.is_dine_in_only,
        "is_active": input.is_active,
        "sort_order": input.sort_order,
        "dgii_code": input.dgii_code,
        "description": input.description,
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    await db.tax_config.insert_one(config)
    return {k: v for k, v in config.items() if k != "_id"}


@router.put("/config/{code}")
async def update_tax_config(code: str, input: TaxConfigInput):
    """Actualiza una configuración de impuesto"""
    result = await db.tax_config.find_one_and_update(
        {"code": code.upper()},
        {"$set": {
            "name": input.name,
            "rate": input.rate,
            "tax_type": input.tax_type,
            "applies_to": input.applies_to,
            "is_dine_in_only": input.is_dine_in_only,
            "is_active": input.is_active,
            "sort_order": input.sort_order,
            "dgii_code": input.dgii_code,
            "description": input.description,
            "updated_at": now_iso()
        }},
        return_document=True
    )
    if not result:
        raise HTTPException(status_code=404, detail="Impuesto no encontrado")
    return {k: v for k, v in result.items() if k != "_id"}


@router.delete("/config/{code}")
async def delete_tax_config(code: str):
    """Desactiva un impuesto (soft delete)"""
    result = await db.tax_config.update_one(
        {"code": code.upper()},
        {"$set": {"is_active": False, "updated_at": now_iso()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Impuesto no encontrado")
    return {"ok": True}


# ─── PRODUCT TAX ENDPOINTS ───

@router.get("/products/{product_id}")
async def get_product_taxes(product_id: str):
    """Obtiene los impuestos asignados a un producto"""
    taxes = await db.product_taxes.find({"product_id": product_id}, {"_id": 0}).to_list(20)
    
    # Enriquecer con detalles del impuesto
    result = []
    for pt in taxes:
        config = await db.tax_config.find_one({"code": pt["tax_code"]}, {"_id": 0})
        if config:
            result.append({
                **pt,
                "tax_name": config.get("name"),
                "rate": config.get("rate"),
                "tax_type": config.get("tax_type"),
                "is_dine_in_only": config.get("is_dine_in_only", False)
            })
    return result


@router.post("/products/assign")
async def assign_tax_to_product(input: ProductTaxInput):
    """Asigna un impuesto a un producto"""
    # Verificar que el impuesto existe
    tax_config = await db.tax_config.find_one({"code": input.tax_code.upper()}, {"_id": 0})
    if not tax_config:
        raise HTTPException(status_code=404, detail=f"Impuesto {input.tax_code} no encontrado")
    
    # Verificar si ya está asignado
    existing = await db.product_taxes.find_one({
        "product_id": input.product_id,
        "tax_code": input.tax_code.upper()
    }, {"_id": 0})
    
    if existing:
        # Actualizar
        await db.product_taxes.update_one(
            {"product_id": input.product_id, "tax_code": input.tax_code.upper()},
            {"$set": {
                "is_exempt": input.is_exempt,
                "exempt_reason": input.exempt_reason,
                "updated_at": now_iso()
            }}
        )
        return {"ok": True, "action": "updated"}
    
    # Crear nuevo
    assignment = {
        "id": gen_id(),
        "product_id": input.product_id,
        "tax_code": input.tax_code.upper(),
        "is_exempt": input.is_exempt,
        "exempt_reason": input.exempt_reason,
        "created_at": now_iso(),
        "updated_at": now_iso()
    }
    await db.product_taxes.insert_one(assignment)
    return {"ok": True, "action": "created"}


@router.delete("/products/{product_id}/{tax_code}")
async def remove_tax_from_product(product_id: str, tax_code: str):
    """Remueve un impuesto de un producto"""
    result = await db.product_taxes.delete_one({
        "product_id": product_id,
        "tax_code": tax_code.upper()
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    return {"ok": True}


# ─── BULK OPERATIONS ───

@router.post("/products/bulk-assign")
async def bulk_assign_tax(product_ids: List[str], tax_code: str):
    """Asigna un impuesto a múltiples productos"""
    tax_config = await db.tax_config.find_one({"code": tax_code.upper()}, {"_id": 0})
    if not tax_config:
        raise HTTPException(status_code=404, detail=f"Impuesto {tax_code} no encontrado")
    
    assigned = 0
    for pid in product_ids:
        existing = await db.product_taxes.find_one({
            "product_id": pid,
            "tax_code": tax_code.upper()
        }, {"_id": 0})
        
        if not existing:
            await db.product_taxes.insert_one({
                "id": gen_id(),
                "product_id": pid,
                "tax_code": tax_code.upper(),
                "is_exempt": False,
                "created_at": now_iso(),
                "updated_at": now_iso()
            })
            assigned += 1
    
    return {"ok": True, "assigned": assigned}


@router.post("/category/assign")
async def assign_tax_to_category(category_id: str, tax_code: str):
    """Asigna un impuesto a todos los productos de una categoría"""
    tax_config = await db.tax_config.find_one({"code": tax_code.upper()}, {"_id": 0})
    if not tax_config:
        raise HTTPException(status_code=404, detail=f"Impuesto {tax_code} no encontrado")
    
    # Obtener productos de la categoría
    products = await db.products.find({"category_id": category_id}, {"id": 1, "_id": 0}).to_list(1000)
    
    assigned = 0
    for p in products:
        existing = await db.product_taxes.find_one({
            "product_id": p["id"],
            "tax_code": tax_code.upper()
        }, {"_id": 0})
        
        if not existing:
            await db.product_taxes.insert_one({
                "id": gen_id(),
                "product_id": p["id"],
                "tax_code": tax_code.upper(),
                "is_exempt": False,
                "created_at": now_iso(),
                "updated_at": now_iso()
            })
            assigned += 1
    
    return {"ok": True, "assigned": assigned, "category_products": len(products)}


# ─── TAX CALCULATION ENGINE ───

@router.post("/calculate")
async def calculate_taxes(
    product_id: str,
    quantity: float,
    unit_price: float,
    is_delivery: bool = False  # True = Para Llevar (omite propina legal)
):
    """
    Calcula los impuestos dinámicos para un producto
    Retorna el desglose de impuestos aplicables
    """
    subtotal = round(quantity * unit_price, 2)
    
    # Obtener impuestos asignados al producto
    product_taxes = await db.product_taxes.find({"product_id": product_id}, {"_id": 0}).to_list(20)
    
    # Si no tiene impuestos asignados, buscar impuestos por defecto
    if not product_taxes:
        # Buscar en el producto si tiene categoría con impuestos
        product = await db.products.find_one({"id": product_id}, {"_id": 0})
        if product and product.get("category_id"):
            # Buscar impuestos de la categoría
            category_taxes = await db.category_taxes.find({"category_id": product["category_id"]}, {"_id": 0}).to_list(10)
            if category_taxes:
                product_taxes = [{"tax_code": ct["tax_code"], "is_exempt": False} for ct in category_taxes]
    
    # Calcular cada impuesto
    taxes_breakdown = []
    total_tax = 0
    
    for pt in product_taxes:
        if pt.get("is_exempt"):
            taxes_breakdown.append({
                "tax_code": pt["tax_code"],
                "tax_name": "Exento",
                "rate": 0,
                "amount": 0,
                "is_exempt": True,
                "exempt_reason": pt.get("exempt_reason")
            })
            continue
        
        tax_config = await db.tax_config.find_one({"code": pt["tax_code"], "is_active": True}, {"_id": 0})
        if not tax_config:
            continue
        
        # Omitir propina legal si es delivery
        if is_delivery and tax_config.get("is_dine_in_only", False):
            continue
        
        # Calcular monto del impuesto
        if tax_config["tax_type"] == "percentage":
            base = subtotal if tax_config.get("applies_to") == "subtotal" else subtotal + total_tax
            tax_amount = round(base * (tax_config["rate"] / 100), 2)
        else:  # fixed
            tax_amount = tax_config["rate"] * quantity
        
        total_tax += tax_amount
        
        taxes_breakdown.append({
            "tax_code": tax_config["code"],
            "tax_name": tax_config["name"],
            "rate": tax_config["rate"],
            "tax_type": tax_config["tax_type"],
            "amount": tax_amount,
            "is_exempt": False,
            "dgii_code": tax_config.get("dgii_code")
        })
    
    return {
        "subtotal": subtotal,
        "taxes": taxes_breakdown,
        "total_tax": round(total_tax, 2),
        "total": round(subtotal + total_tax, 2),
        "is_delivery": is_delivery
    }


# ─── Z REPORT / TAX SUMMARY ───

@router.get("/report/summary")
async def get_tax_summary(session_id: Optional[str] = None, date: Optional[str] = None):
    """
    Genera resumen de impuestos recaudados (para Reporte Z)
    Agrupa por tipo de impuesto configurado en tax_config
    """
    # Obtener todas las configuraciones de impuestos activas
    tax_configs = await db.tax_config.find({"is_active": True}, {"_id": 0}).to_list(50)
    
    # Construir query para bills
    query = {"status": "paid"}
    if session_id:
        query["shift_id"] = session_id
    if date:
        query["paid_at"] = {"$regex": f"^{date}"}
    
    bills = await db.bills.find(query, {"_id": 0}).to_list(10000)
    
    # Inicializar resumen
    summary = {
        "total_ventas": 0,
        "total_subtotal": 0,
        "total_impuestos": 0,
        "impuestos_desglose": {},
        "facturas_count": len(bills)
    }
    
    for tc in tax_configs:
        summary["impuestos_desglose"][tc["code"]] = {
            "name": tc["name"],
            "rate": tc["rate"],
            "total_base": 0,
            "total_recaudado": 0,
            "facturas_aplicadas": 0
        }
    
    # Procesar cada factura
    for bill in bills:
        summary["total_ventas"] += bill.get("total", 0)
        summary["total_subtotal"] += bill.get("subtotal", 0)
        
        # ITBIS
        itbis = bill.get("itbis", 0)
        if itbis > 0 and "ITBIS" in summary["impuestos_desglose"]:
            summary["impuestos_desglose"]["ITBIS"]["total_recaudado"] += itbis
            summary["impuestos_desglose"]["ITBIS"]["total_base"] += bill.get("subtotal", 0)
            summary["impuestos_desglose"]["ITBIS"]["facturas_aplicadas"] += 1
            summary["total_impuestos"] += itbis
        
        # Propina Legal
        propina = bill.get("propina_legal", 0)
        if propina > 0 and "PROPINA" in summary["impuestos_desglose"]:
            summary["impuestos_desglose"]["PROPINA"]["total_recaudado"] += propina
            summary["impuestos_desglose"]["PROPINA"]["total_base"] += bill.get("subtotal", 0)
            summary["impuestos_desglose"]["PROPINA"]["facturas_aplicadas"] += 1
            summary["total_impuestos"] += propina
        
        # Otros impuestos (si están en tax_breakdown del bill)
        tax_breakdown = bill.get("tax_breakdown", [])
        for tax in tax_breakdown:
            code = tax.get("tax_code")
            if code and code in summary["impuestos_desglose"]:
                summary["impuestos_desglose"][code]["total_recaudado"] += tax.get("amount", 0)
                summary["impuestos_desglose"][code]["total_base"] += bill.get("subtotal", 0)
                summary["impuestos_desglose"][code]["facturas_aplicadas"] += 1
                summary["total_impuestos"] += tax.get("amount", 0)
    
    # Limpiar impuestos sin recaudación
    summary["impuestos_desglose"] = {
        k: v for k, v in summary["impuestos_desglose"].items() 
        if v["total_recaudado"] > 0
    }
    
    return summary


# ─── SEED DEFAULT TAXES ───

@router.post("/seed-defaults")
async def seed_default_taxes():
    """Crea los impuestos por defecto para RD"""
    defaults = [
        {
            "code": "ITBIS",
            "name": "ITBIS 18%",
            "rate": 18.0,
            "tax_type": "percentage",
            "applies_to": "subtotal",
            "is_dine_in_only": False,
            "dgii_code": "01",
            "description": "Impuesto a la Transferencia de Bienes Industrializados y Servicios",
            "sort_order": 1
        },
        {
            "code": "ITBIS_REDUCIDO",
            "name": "ITBIS 16%",
            "rate": 16.0,
            "tax_type": "percentage",
            "applies_to": "subtotal",
            "is_dine_in_only": False,
            "dgii_code": "02",
            "description": "ITBIS reducido para productos de la canasta básica",
            "sort_order": 2
        },
        {
            "code": "PROPINA",
            "name": "Propina Legal 10%",
            "rate": 10.0,
            "tax_type": "percentage",
            "applies_to": "subtotal",
            "is_dine_in_only": True,  # Solo consumo en local
            "dgii_code": None,
            "description": "Propina legal - Solo aplica para consumo en establecimiento",
            "sort_order": 3
        },
        {
            "code": "ISC",
            "name": "Impuesto Selectivo",
            "rate": 0,  # Variable según producto
            "tax_type": "percentage",
            "applies_to": "subtotal",
            "is_dine_in_only": False,
            "dgii_code": "03",
            "description": "Impuesto Selectivo al Consumo (alcohol, tabaco, etc.)",
            "sort_order": 4
        },
        {
            "code": "EXENTO",
            "name": "Exento de ITBIS",
            "rate": 0,
            "tax_type": "percentage",
            "applies_to": "subtotal",
            "is_dine_in_only": False,
            "dgii_code": "00",
            "description": "Productos exentos de ITBIS",
            "sort_order": 5
        }
    ]
    
    created = 0
    for tax in defaults:
        existing = await db.tax_config.find_one({"code": tax["code"]}, {"_id": 0})
        if not existing:
            tax["id"] = gen_id()
            tax["is_active"] = True
            tax["created_at"] = now_iso()
            tax["updated_at"] = now_iso()
            await db.tax_config.insert_one(tax)
            created += 1
    
    return {"ok": True, "created": created, "total": len(defaults)}
