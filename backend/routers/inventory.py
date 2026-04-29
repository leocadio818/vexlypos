"""
Inventory Router
Contains endpoints for ingredients, stock, warehouses, unit definitions, 
stock movements, and the inventory explosion system.
"""
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from typing import Optional
from datetime import datetime, timezone
import uuid
import jwt
import os
import logging

from models.database import db
from models.schemas import (
    IngredientInput, UnitDefinitionInput, StockInput, StockMovementInput,
    StockDifferenceInput, StockDeductInput, StockTransferInput,
    WarehouseInput, ProductionInput
)

router = APIRouter(tags=["Inventory"])
logger = logging.getLogger(__name__)

JWT_SECRET = os.environ['JWT_SECRET']  # BUG-21 fix: fail fast if missing

# ─── UTILITY FUNCTIONS ───
def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def formatMoney_server(amount):
    """Format money for server-side use"""
    return f"RD$ {amount:,.2f}"

async def get_current_user(request: Request):
    """Extract user from JWT token"""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No token provided")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_user_from_request(request: Request) -> tuple:
    """Extract user info from request headers (non-dependency version)"""
    user_id = ""
    user_name = "Sistema"
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        try:
            token = auth_header.split(" ")[1]
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get("user_id", "")
            user_name = payload.get("name", "Sistema")
        except Exception as e:
            logger.debug("inventory.get_user_from_request: JWT decode failed (anonymous request): %s", e)
    return user_id, user_name


# ═══════════════════════════════════════════════════════════════════════════════
# ─── INGREDIENTS ───
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/ingredients")
async def list_ingredients(category: Optional[str] = Query(None), skip: int = Query(0, ge=0), limit: int = Query(500, ge=1, le=1000)):
    query = {"category": category} if category else {}
    return await db.ingredients.find(query, {"_id": 0}).skip(skip).to_list(limit)

@router.get("/ingredients/{ingredient_id}")
async def get_ingredient(ingredient_id: str):
    ing = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
    if not ing:
        raise HTTPException(404, "Ingrediente no encontrado")
    return ing

@router.post("/ingredients")
async def create_ingredient(input: IngredientInput):
    # Calculate dispatch unit cost
    dispatch_unit_cost = input.avg_cost / input.conversion_factor if input.conversion_factor > 0 else input.avg_cost
    
    # Build suppliers array — migrate from default_supplier_id if suppliers list is empty
    suppliers_list = input.suppliers or []
    if not suppliers_list and input.default_supplier_id:
        suppliers_list = [{"supplier_id": input.default_supplier_id, "supplier_name": "", "unit_price": input.avg_cost, "is_default": True}]
    
    # Derive default_supplier_id from suppliers array
    default_sid = input.default_supplier_id
    if suppliers_list and not default_sid:
        default_entry = next((s for s in suppliers_list if s.get("is_default")), suppliers_list[0] if suppliers_list else None)
        if default_entry:
            default_sid = default_entry.get("supplier_id", "")
    
    doc = {
        "id": gen_id(), "name": input.name, "unit": input.unit,
        "category": input.category, "min_stock": input.min_stock,
        "avg_cost": input.avg_cost, "active": True, 
        "is_subrecipe": input.is_subrecipe, "recipe_id": input.recipe_id,
        # Conversion fields
        "purchase_unit": input.purchase_unit or input.unit,
        "purchase_quantity": input.purchase_quantity,
        "dispatch_quantity": input.dispatch_quantity,
        "conversion_factor": input.conversion_factor,
        "dispatch_unit_cost": round(dispatch_unit_cost, 4),
        "default_supplier_id": default_sid,
        "suppliers": suppliers_list,
        "margin_threshold": input.margin_threshold,
        "created_at": now_iso()
    }
    await db.ingredients.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/ingredients/{ingredient_id}")
async def update_ingredient(ingredient_id: str, input: dict, request: Request):
    if "_id" in input: del input["_id"]
    
    # Get old values for audit
    old_ingredient = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
    if not old_ingredient:
        raise HTTPException(404, "Ingrediente no encontrado")
    
    # Sync suppliers ↔ default_supplier_id
    if "suppliers" in input:
        sup_list = input["suppliers"] or []
        default_entry = next((s for s in sup_list if s.get("is_default")), sup_list[0] if sup_list else None)
        if default_entry:
            input["default_supplier_id"] = default_entry.get("supplier_id", "")
        elif not sup_list:
            input["default_supplier_id"] = ""
    elif "default_supplier_id" in input and "suppliers" not in input:
        # Legacy: update from single supplier — add to suppliers array if not present
        new_sid = input["default_supplier_id"]
        existing_suppliers = old_ingredient.get("suppliers", [])
        if new_sid and not any(s.get("supplier_id") == new_sid for s in existing_suppliers):
            existing_suppliers.append({"supplier_id": new_sid, "supplier_name": "", "unit_price": input.get("avg_cost", old_ingredient.get("avg_cost", 0)), "is_default": True})
            for s in existing_suppliers:
                s["is_default"] = s.get("supplier_id") == new_sid
            input["suppliers"] = existing_suppliers
    
    # Get user from token for audit
    user_id, user_name = get_user_from_request(request)
    
    # Track changes for audit
    audit_fields = ["unit", "purchase_unit", "conversion_factor", "purchase_quantity", "dispatch_quantity", "avg_cost"]
    audit_logs = []
    
    for field in audit_fields:
        if field in input and str(input.get(field)) != str(old_ingredient.get(field, "")):
            audit_logs.append({
                "id": gen_id(),
                "ingredient_id": ingredient_id,
                "ingredient_name": old_ingredient.get("name", ""),
                "field_changed": field,
                "old_value": str(old_ingredient.get(field, "")),
                "new_value": str(input.get(field, "")),
                "changed_by_id": user_id,
                "changed_by_name": user_name,
                "timestamp": now_iso()
            })
    
    # Recalculate dispatch_unit_cost if conversion factor or avg_cost changed
    if "conversion_factor" in input or "avg_cost" in input:
        avg_cost = input.get("avg_cost", old_ingredient.get("avg_cost", 0))
        conversion_factor = input.get("conversion_factor", old_ingredient.get("conversion_factor", 1))
        if conversion_factor > 0:
            input["dispatch_unit_cost"] = round(avg_cost / conversion_factor, 4)
    
    await db.ingredients.update_one({"id": ingredient_id}, {"$set": input})
    
    # Save audit logs
    if audit_logs:
        await db.ingredient_audit_logs.insert_many(audit_logs)
    
    # If cost or conversion changed, recalculate sub-recipe costs
    if "conversion_factor" in input or "avg_cost" in input:
        await update_subrecipe_costs()
    
    return {"ok": True, "audit_logs_created": len(audit_logs)}

@router.get("/ingredients/{ingredient_id}/affected-recipes")
async def get_affected_recipes(ingredient_id: str):
    """Get count of recipes that use this ingredient"""
    recipes = await db.recipes.find(
        {"ingredients.ingredient_id": ingredient_id}, 
        {"_id": 0, "id": 1, "product_name": 1}
    ).to_list(500)
    return {
        "count": len(recipes),
        "recipes": recipes
    }

@router.post("/ingredients/migrate-suppliers")
async def migrate_ingredient_suppliers():
    """
    Migrate existing ingredients from single default_supplier_id to multi-supplier array.
    Ingredients that already have a suppliers array are skipped.
    """
    # Find ingredients that have default_supplier_id but no suppliers array (or empty)
    cursor = db.ingredients.find(
        {"default_supplier_id": {"$ne": ""}, "$or": [{"suppliers": {"$exists": False}}, {"suppliers": []}, {"suppliers": None}]},
        {"_id": 0, "id": 1, "default_supplier_id": 1, "avg_cost": 1, "name": 1}
    )
    to_migrate = await cursor.to_list(1000)
    
    if not to_migrate:
        return {"ok": True, "migrated": 0, "message": "No hay insumos para migrar"}
    
    # Get all suppliers for name lookup
    all_suppliers = await db.suppliers.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    supplier_map = {s["id"]: s["name"] for s in all_suppliers}
    
    migrated = 0
    for ing in to_migrate:
        sid = ing["default_supplier_id"]
        sname = supplier_map.get(sid, "")
        suppliers_array = [{
            "supplier_id": sid,
            "supplier_name": sname,
            "unit_price": ing.get("avg_cost", 0),
            "is_default": True
        }]
        await db.ingredients.update_one(
            {"id": ing["id"]},
            {"$set": {"suppliers": suppliers_array}}
        )
        migrated += 1
    
    return {"ok": True, "migrated": migrated}



@router.get("/ingredients/{ingredient_id}/conversion-analysis")
async def get_ingredient_conversion_analysis(ingredient_id: str):
    """
    Get complete conversion analysis for an ingredient showing:
    - Conversion setup (purchase unit -> dispatch unit)
    - All linked recipes/products with their consumption and dynamic costs
    """
    # Get ingredient
    ingredient = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(404, "Ingrediente no encontrado")
    
    # Calculate dispatch unit cost
    avg_cost = ingredient.get("avg_cost", 0)
    conversion_factor = ingredient.get("conversion_factor", 1)
    dispatch_unit_cost = avg_cost / conversion_factor if conversion_factor > 0 else avg_cost
    
    # Get all recipes that use this ingredient
    recipes = await db.recipes.find(
        {"ingredients.ingredient_id": ingredient_id},
        {"_id": 0}
    ).to_list(500)
    
    # Get products for recipe names
    product_ids = [r.get("product_id") for r in recipes if r.get("product_id")]
    products = await db.products.find({"id": {"$in": product_ids}}, {"_id": 0}).to_list(500)
    product_map = {p["id"]: p for p in products}
    
    # Build linked recipes with cost calculations
    linked_recipes = []
    for recipe in recipes:
        product = product_map.get(recipe.get("product_id"), {})
        
        # Find this ingredient in the recipe
        for ing in recipe.get("ingredients", []):
            if ing.get("ingredient_id") == ingredient_id:
                quantity = ing.get("quantity", 0)
                waste_pct = ing.get("waste_percentage", 0)
                
                # Calculate dynamic cost: (dispatch_unit_cost * quantity) * (1 + waste/100)
                base_cost = dispatch_unit_cost * quantity
                cost_with_waste = base_cost * (1 + waste_pct / 100)
                
                linked_recipes.append({
                    "recipe_id": recipe.get("id"),
                    "product_id": recipe.get("product_id"),
                    "product_name": recipe.get("product_name", product.get("name", "?")),
                    "product_price": product.get("price", 0),
                    "quantity_used": quantity,
                    "unit": ing.get("unit", ingredient.get("unit", "unidad")),
                    "waste_percentage": waste_pct,
                    "cost_per_unit": round(dispatch_unit_cost, 4),
                    "base_ingredient_cost": round(base_cost, 4),
                    "cost_with_waste": round(cost_with_waste, 4),
                    "cost_formula": f"({formatMoney_server(avg_cost)} ÷ {conversion_factor}) × {quantity} = {formatMoney_server(base_cost)}"
                })
    
    # Sort by cost descending
    linked_recipes.sort(key=lambda x: x["cost_with_waste"], reverse=True)
    
    return {
        "ingredient": {
            "id": ingredient.get("id"),
            "name": ingredient.get("name"),
            "category": ingredient.get("category"),
            # Conversion setup
            "purchase_unit": ingredient.get("purchase_unit", ingredient.get("unit")),
            "purchase_quantity": ingredient.get("purchase_quantity", 1),
            "dispatch_unit": ingredient.get("unit"),
            "dispatch_quantity": ingredient.get("dispatch_quantity", 1),
            "conversion_factor": conversion_factor,
            # Costs
            "purchase_cost": avg_cost,
            "dispatch_unit_cost": round(dispatch_unit_cost, 4),
            # Conversion explanation
            "conversion_explanation": f"1 {ingredient.get('purchase_unit', ingredient.get('unit'))} = {conversion_factor} {ingredient.get('unit')}"
        },
        "linked_products_count": len(linked_recipes),
        "linked_recipes": linked_recipes,
        "total_cost_impact": round(sum(r["cost_with_waste"] for r in linked_recipes), 2)
    }

@router.get("/ingredients/{ingredient_id}/audit-logs")
async def get_ingredient_audit_logs(ingredient_id: str, limit: int = Query(50)):
    """Get audit history for an ingredient"""
    logs = await db.ingredient_audit_logs.find(
        {"ingredient_id": ingredient_id},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(limit)
    return logs

@router.get("/ingredients/audit-logs/all")
async def get_all_ingredient_audit_logs(
    ingredient_name: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    field_changed: Optional[str] = Query(None),
    limit: int = Query(500)
):
    """Get all ingredient audit logs with optional filters"""
    query = {}
    
    # Filter by ingredient name (partial match)
    if ingredient_name:
        query["ingredient_name"] = {"$regex": ingredient_name, "$options": "i"}
    
    # Filter by field changed
    if field_changed:
        query["field_changed"] = field_changed
    
    # Filter by date range
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            # Add time to end date to include the whole day
            date_query["$lte"] = end_date + "T23:59:59"
        if date_query:
            query["timestamp"] = date_query
    
    logs = await db.ingredient_audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    
    # Get summary stats
    total_count = await db.ingredient_audit_logs.count_documents(query)
    
    # Get unique ingredients affected
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$ingredient_name"}},
        {"$count": "count"}
    ]
    unique_result = await db.ingredient_audit_logs.aggregate(pipeline).to_list(1)
    unique_ingredients = unique_result[0]["count"] if unique_result else 0
    
    # Get changes by field
    field_pipeline = [
        {"$match": query},
        {"$group": {"_id": "$field_changed", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    field_stats = await db.ingredient_audit_logs.aggregate(field_pipeline).to_list(10)
    
    return {
        "logs": logs,
        "stats": {
            "total_changes": total_count,
            "unique_ingredients": unique_ingredients,
            "changes_by_field": {item["_id"]: item["count"] for item in field_stats}
        }
    }

@router.delete("/ingredients/{ingredient_id}")
async def delete_ingredient(ingredient_id: str):
    # Check if used in recipes
    recipe_count = await db.recipes.count_documents({"ingredients.ingredient_id": ingredient_id})
    if recipe_count > 0:
        raise HTTPException(400, f"No se puede eliminar: {recipe_count} recetas usan este ingrediente")
    await db.ingredients.delete_one({"id": ingredient_id})
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# ─── UNIT DEFINITIONS (Custom Units) ───
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/unit-definitions")
async def list_unit_definitions():
    """List all custom unit definitions"""
    return await db.unit_definitions.find({}, {"_id": 0}).to_list(500)

@router.post("/unit-definitions")
async def create_unit_definition(input: UnitDefinitionInput, request: Request):
    """Create a new custom unit"""
    # BUG-27 fix: escape user input before using in $regex to avoid pattern injection / errors.
    import re
    name_pat = re.escape(input.name)
    abbr_pat = re.escape(input.abbreviation)
    existing = await db.unit_definitions.find_one({
        "$or": [
            {"name": {"$regex": f"^{name_pat}$", "$options": "i"}},
            {"abbreviation": {"$regex": f"^{abbr_pat}$", "$options": "i"}}
        ]
    })
    if existing:
        raise HTTPException(400, "Ya existe una unidad con ese nombre o abreviatura")
    
    doc = {
        "id": gen_id(),
        "name": input.name,
        "abbreviation": input.abbreviation.lower(),
        "category": input.category,
        "is_system": False,  # Custom units are not system units
        "created_at": now_iso()
    }
    await db.unit_definitions.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/unit-definitions/{unit_id}")
async def update_unit_definition(unit_id: str, input: dict, request: Request):
    """Update a custom unit - propagates name changes to ingredients"""
    if "_id" in input: del input["_id"]
    
    unit = await db.unit_definitions.find_one({"id": unit_id}, {"_id": 0})
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")
    
    if unit.get("is_system"):
        raise HTTPException(400, "No se pueden modificar unidades del sistema")
    
    old_abbreviation = unit.get("abbreviation", "")
    new_abbreviation = input.get("abbreviation", old_abbreviation)
    
    # Get user info for audit
    user_id, user_name = get_user_from_request(request)
    
    # Update unit definition
    await db.unit_definitions.update_one({"id": unit_id}, {"$set": input})
    
    # If abbreviation changed, update all ingredients using this unit
    affected_count = 0
    if old_abbreviation != new_abbreviation:
        # Update ingredients where unit matches old abbreviation
        result = await db.ingredients.update_many(
            {"unit": old_abbreviation},
            {"$set": {"unit": new_abbreviation}}
        )
        affected_count += result.modified_count
        
        # Also update purchase_unit
        result2 = await db.ingredients.update_many(
            {"purchase_unit": old_abbreviation},
            {"$set": {"purchase_unit": new_abbreviation}}
        )
        affected_count += result2.modified_count
        
        # Log the unit change
        await db.unit_audit_logs.insert_one({
            "id": gen_id(),
            "unit_id": unit_id,
            "old_abbreviation": old_abbreviation,
            "new_abbreviation": new_abbreviation,
            "ingredients_affected": affected_count,
            "changed_by_id": user_id,
            "changed_by_name": user_name,
            "timestamp": now_iso()
        })
    
    return {"ok": True, "ingredients_updated": affected_count}

@router.delete("/unit-definitions/{unit_id}")
async def delete_unit_definition(unit_id: str):
    """Delete a custom unit (only if not in use)"""
    unit = await db.unit_definitions.find_one({"id": unit_id}, {"_id": 0})
    if not unit:
        raise HTTPException(404, "Unidad no encontrada")
    
    if unit.get("is_system"):
        raise HTTPException(400, "No se pueden eliminar unidades del sistema")
    
    # Check if in use
    abbrev = unit.get("abbreviation", "")
    in_use = await db.ingredients.count_documents({
        "$or": [{"unit": abbrev}, {"purchase_unit": abbrev}]
    })
    if in_use > 0:
        raise HTTPException(400, f"No se puede eliminar: {in_use} ingredientes usan esta unidad")
    
    await db.unit_definitions.delete_one({"id": unit_id})
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# ─── STOCK ───
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/stock")
async def list_stock(warehouse_id: Optional[str] = Query(None), ingredient_id: Optional[str] = Query(None)):
    query = {}
    if warehouse_id: query["warehouse_id"] = warehouse_id
    if ingredient_id: query["ingredient_id"] = ingredient_id
    return await db.stock.find(query, {"_id": 0}).to_list(500)

@router.get("/stock/multilevel")
async def list_stock_multilevel(warehouse_id: Optional[str] = Query(None)):
    """
    Get stock with multi-level breakdown based on conversion factors.
    Shows stock in all levels: Purchase Unit > Dispatch Unit (and intermediate levels if defined)
    """
    query = {}
    if warehouse_id:
        query["warehouse_id"] = warehouse_id
    
    stock_records = await db.stock.find(query, {"_id": 0}).to_list(500)
    ingredients = await db.ingredients.find({}, {"_id": 0}).to_list(500)
    ing_map = {i["id"]: i for i in ingredients}
    
    warehouses = await db.warehouses.find({}, {"_id": 0}).to_list(50)
    wh_map = {w["id"]: w["name"] for w in warehouses}
    
    result = []
    for stock in stock_records:
        ing_id = stock.get("ingredient_id")
        if ing_id not in ing_map:
            continue
        
        ingredient = ing_map[ing_id]
        current_stock = stock.get("current_stock", 0)
        
        # Get conversion info
        purchase_unit = ingredient.get("purchase_unit", ingredient.get("unit", "unidad"))
        dispatch_unit = ingredient.get("unit", "unidad")
        conversion_factor = ingredient.get("conversion_factor", 1)
        avg_cost = ingredient.get("avg_cost", 0)
        dispatch_unit_cost = ingredient.get("dispatch_unit_cost", avg_cost / conversion_factor if conversion_factor > 0 else avg_cost)
        
        # Calculate multi-level breakdown
        # Current stock is in dispatch units
        # Calculate how many full purchase units and remainder
        purchase_units = int(current_stock // conversion_factor) if conversion_factor > 0 else 0
        dispatch_remainder = round(current_stock % conversion_factor, 4) if conversion_factor > 0 else current_stock
        
        # Build breakdown string
        breakdown_parts = []
        if purchase_units > 0:
            breakdown_parts.append(f"{purchase_units} {purchase_unit}")
        if dispatch_remainder > 0 or len(breakdown_parts) == 0:
            breakdown_parts.append(f"{dispatch_remainder:.2f} {dispatch_unit}".rstrip('0').rstrip('.'))
        
        stock_detailed = " + ".join(breakdown_parts)
        
        # Calculate total value
        stock_value = current_stock * dispatch_unit_cost
        
        result.append({
            "id": stock.get("id"),
            "ingredient_id": ing_id,
            "ingredient_name": ingredient.get("name", "?"),
            "category": ingredient.get("category", "general"),
            "warehouse_id": stock.get("warehouse_id"),
            "warehouse_name": wh_map.get(stock.get("warehouse_id"), "?"),
            "current_stock": current_stock,
            "min_stock": stock.get("min_stock", ingredient.get("min_stock", 0)),
            "dispatch_unit": dispatch_unit,
            "purchase_unit": purchase_unit,
            "conversion_factor": conversion_factor,
            "stock_detailed": stock_detailed,
            "stock_in_purchase_units": purchase_units,
            "stock_remainder_dispatch": dispatch_remainder,
            "dispatch_unit_cost": round(dispatch_unit_cost, 4),
            "stock_value": round(stock_value, 2),
            "is_low_stock": current_stock < stock.get("min_stock", ingredient.get("min_stock", 0)),
            "last_updated": stock.get("last_updated")
        })
    
    # Sort by name
    result.sort(key=lambda x: x["ingredient_name"])
    return result

@router.get("/stock/by-ingredient/{ingredient_id}")
async def get_stock_by_ingredient(ingredient_id: str):
    return await db.stock.find({"ingredient_id": ingredient_id}, {"_id": 0}).to_list(50)

@router.post("/stock")
async def upsert_stock(input: StockInput):
    existing = await db.stock.find_one({
        "ingredient_id": input.ingredient_id, 
        "warehouse_id": input.warehouse_id
    })
    if existing:
        await db.stock.update_one(
            {"ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id},
            {"$set": {"current_stock": input.current_stock, "min_stock": input.min_stock, "last_updated": now_iso()}}
        )
    else:
        doc = {
            "id": gen_id(), "ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id,
            "current_stock": input.current_stock, "min_stock": input.min_stock, 
            "last_updated": now_iso()
        }
        await db.stock.insert_one(doc)
    return {"ok": True}

@router.post("/stock/transfer")
async def transfer_stock(input: StockTransferInput, user=Depends(get_current_user)):
    # Check source has enough stock
    source = await db.stock.find_one({
        "ingredient_id": input.ingredient_id, 
        "warehouse_id": input.from_warehouse_id
    })
    if not source or source.get("current_stock", 0) < input.quantity:
        raise HTTPException(400, "Stock insuficiente en almacén origen")
    
    # Decrease from source
    await db.stock.update_one(
        {"ingredient_id": input.ingredient_id, "warehouse_id": input.from_warehouse_id},
        {"$inc": {"current_stock": -input.quantity}, "$set": {"last_updated": now_iso()}}
    )
    # Increase in destination
    await db.stock.update_one(
        {"ingredient_id": input.ingredient_id, "warehouse_id": input.to_warehouse_id},
        {"$inc": {"current_stock": input.quantity}, "$set": {"last_updated": now_iso()}},
        upsert=True
    )
    # Log movements
    transfer_id = gen_id()
    await db.stock_movements.insert_one({
        "id": gen_id(), "ingredient_id": input.ingredient_id, "warehouse_id": input.from_warehouse_id,
        "quantity": -input.quantity, "movement_type": "transfer_out", "reference_id": transfer_id,
        "notes": input.notes, "user_id": user["user_id"], "user_name": user["name"], "created_at": now_iso()
    })
    await db.stock_movements.insert_one({
        "id": gen_id(), "ingredient_id": input.ingredient_id, "warehouse_id": input.to_warehouse_id,
        "quantity": input.quantity, "movement_type": "transfer_in", "reference_id": transfer_id,
        "notes": input.notes, "user_id": user["user_id"], "user_name": user["name"], "created_at": now_iso()
    })
    return {"ok": True, "transfer_id": transfer_id}

@router.post("/stock/waste")
async def register_waste(input: StockMovementInput, user=Depends(get_current_user)):
    # Decrease stock
    await db.stock.update_one(
        {"ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id},
        {"$inc": {"current_stock": -abs(input.quantity)}, "$set": {"last_updated": now_iso()}}
    )
    # Log movement
    await db.stock_movements.insert_one({
        "id": gen_id(), "ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id,
        "quantity": -abs(input.quantity), "movement_type": "waste", "reference_id": input.reference_id,
        "notes": input.notes, "user_id": user["user_id"], "user_name": user["name"], "created_at": now_iso()
    })
    return {"ok": True}

@router.post("/stock/difference")
async def register_difference(input: StockDifferenceInput, request: Request):
    """
    Register a stock difference (faltante or sobrante) found during physical count.
    Converts the input quantity to dispatch units based on the input_unit.
    """
    # Get user from token
    user_id, user_name = get_user_from_request(request)
    
    # Get ingredient for conversion
    ingredient = await db.ingredients.find_one({"id": input.ingredient_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(404, "Ingrediente no encontrado")
    
    # Get conversion info
    purchase_unit = ingredient.get("purchase_unit", ingredient.get("unit", "unidad"))
    dispatch_unit = ingredient.get("unit", "unidad")
    conversion_factor = ingredient.get("conversion_factor", 1)
    dispatch_unit_cost = ingredient.get("dispatch_unit_cost", ingredient.get("avg_cost", 0) / conversion_factor if conversion_factor > 0 else ingredient.get("avg_cost", 0))
    
    # Convert input quantity to dispatch units
    if input.input_unit == purchase_unit or input.input_unit == "purchase":
        # User entered in purchase units, convert to dispatch
        quantity_dispatch = input.quantity * conversion_factor
    else:
        # User entered in dispatch units already
        quantity_dispatch = input.quantity
    
    # Calculate monetary value
    monetary_value = abs(quantity_dispatch) * dispatch_unit_cost
    
    # Determine stock change direction
    if input.difference_type == "faltante":
        stock_change = -abs(quantity_dispatch)
    else:  # sobrante
        stock_change = abs(quantity_dispatch)
    
    # Update stock
    await db.stock.update_one(
        {"ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id},
        {"$inc": {"current_stock": stock_change}, "$set": {"last_updated": now_iso()}}
    )
    
    # Create difference log for audit
    difference_id = gen_id()
    difference_log = {
        "id": difference_id,
        "ingredient_id": input.ingredient_id,
        "ingredient_name": ingredient.get("name", "?"),
        "warehouse_id": input.warehouse_id,
        "difference_type": input.difference_type,
        "input_quantity": input.quantity,
        "input_unit": input.input_unit,
        "quantity_dispatch_units": round(abs(quantity_dispatch), 4),
        "dispatch_unit": dispatch_unit,
        "monetary_value": round(monetary_value, 2),
        "reason": input.reason,
        "observations": input.observations,
        "authorized_by_id": user_id,
        "authorized_by_name": user_name,
        "timestamp": now_iso()
    }
    await db.stock_difference_logs.insert_one(difference_log)
    
    # Also log as stock movement
    await db.stock_movements.insert_one({
        "id": gen_id(),
        "ingredient_id": input.ingredient_id,
        "ingredient_name": ingredient.get("name", "?"),
        "warehouse_id": input.warehouse_id,
        "quantity": stock_change,
        "movement_type": "difference",
        "reference_id": difference_id,
        "notes": f"{input.difference_type.capitalize()}: {input.reason}. {input.observations}",
        "user_id": user_id,
        "user_name": user_name,
        "created_at": now_iso()
    })
    
    return {
        "ok": True,
        "difference_id": difference_id,
        "quantity_adjusted": round(stock_change, 4),
        "monetary_value": round(monetary_value, 2),
        "conversion_applied": input.input_unit == purchase_unit or input.input_unit == "purchase"
    }

@router.get("/stock/differences")
async def list_stock_differences(
    ingredient_id: Optional[str] = Query(None),
    warehouse_id: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(500)
):
    """Get stock difference logs with optional filters"""
    query = {}
    if ingredient_id:
        query["ingredient_id"] = ingredient_id
    if warehouse_id:
        query["warehouse_id"] = warehouse_id
    if start_date or end_date:
        date_query = {}
        if start_date:
            date_query["$gte"] = start_date
        if end_date:
            date_query["$lte"] = end_date + "T23:59:59"
        if date_query:
            query["timestamp"] = date_query
    
    logs = await db.stock_difference_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    
    # Calculate totals
    total_faltante = sum(l.get("monetary_value", 0) for l in logs if l.get("difference_type") == "faltante")
    total_sobrante = sum(l.get("monetary_value", 0) for l in logs if l.get("difference_type") == "sobrante")
    
    return {
        "logs": logs,
        "stats": {
            "total_records": len(logs),
            "total_faltante_value": round(total_faltante, 2),
            "total_sobrante_value": round(total_sobrante, 2),
            "net_difference": round(total_sobrante - total_faltante, 2)
        }
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ─── STOCK ADJUSTMENT ───
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/inventory/adjust")
async def adjust_stock(input: dict, request: Request):
    """
    Manual stock adjustment. Modifies stock, logs to stock_movements,
    and creates an entry in stock_adjustment_logs for the dedicated report.
    """
    ingredient_id = input.get("ingredient_id")
    warehouse_id = input.get("warehouse_id")
    quantity = input.get("quantity")
    reason = input.get("reason", "Ajuste manual")

    if not ingredient_id or not warehouse_id or quantity is None:
        raise HTTPException(400, "ingredient_id, warehouse_id y quantity son requeridos")

    try:
        quantity = float(quantity)
    except (ValueError, TypeError):
        raise HTTPException(400, "Cantidad debe ser un número")

    if quantity == 0:
        raise HTTPException(400, "La cantidad no puede ser cero")

    # Get ingredient info
    ingredient = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(404, "Ingrediente no encontrado")

    # Get warehouse info
    warehouse = await db.warehouses.find_one({"id": warehouse_id}, {"_id": 0})
    wh_name = warehouse.get("name", "?") if warehouse else "?"

    # Get user from token
    user_id, user_name = get_user_from_request(request)

    # Get current stock before adjustment
    stock_doc = await db.stock.find_one(
        {"ingredient_id": ingredient_id, "warehouse_id": warehouse_id},
        {"_id": 0}
    )
    stock_before = stock_doc.get("current_stock", 0) if stock_doc else 0
    stock_after = stock_before + quantity

    # Update stock
    await db.stock.update_one(
        {"ingredient_id": ingredient_id, "warehouse_id": warehouse_id},
        {"$inc": {"current_stock": quantity}, "$set": {"last_updated": now_iso()}},
        upsert=True
    )

    # Calculate monetary value
    conversion = ingredient.get("conversion_factor", 1) or 1
    dispatch_cost = ingredient.get("dispatch_unit_cost", ingredient.get("avg_cost", 0) / conversion)
    monetary_value = round(abs(quantity) * dispatch_cost, 2)

    # Log to stock_movements
    movement_id = gen_id()
    movement = {
        "id": movement_id,
        "ingredient_id": ingredient_id,
        "ingredient_name": ingredient.get("name", "?"),
        "warehouse_id": warehouse_id,
        "quantity": quantity,
        "movement_type": "adjustment",
        "reference_id": "",
        "notes": reason,
        "user_id": user_id,
        "user_name": user_name,
        "created_at": now_iso()
    }
    await db.stock_movements.insert_one(movement)

    # Log to dedicated stock_adjustment_logs collection for the separate report
    adjustment_log = {
        "id": gen_id(),
        "movement_id": movement_id,
        "ingredient_id": ingredient_id,
        "ingredient_name": ingredient.get("name", "?"),
        "category": ingredient.get("category", "general"),
        "warehouse_id": warehouse_id,
        "warehouse_name": wh_name,
        "quantity": quantity,
        "unit": ingredient.get("unit", ""),
        "stock_before": round(stock_before, 4),
        "stock_after": round(stock_after, 4),
        "dispatch_unit_cost": round(dispatch_cost, 4),
        "monetary_value": monetary_value,
        "reason": reason,
        "adjusted_by_id": user_id,
        "adjusted_by_name": user_name,
        "timestamp": now_iso()
    }
    await db.stock_adjustment_logs.insert_one(adjustment_log)

    return {
        "ok": True,
        "adjustment_id": adjustment_log["id"],
        "ingredient_name": ingredient.get("name", "?"),
        "quantity": quantity,
        "stock_before": round(stock_before, 4),
        "stock_after": round(stock_after, 4),
        "monetary_value": monetary_value
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ─── STOCK MOVEMENTS ───
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/stock-movements")
async def list_stock_movements(
    warehouse_id: Optional[str] = Query(None),
    ingredient_id: Optional[str] = Query(None),
    movement_type: Optional[str] = Query(None),
    limit: int = Query(100)
):
    query = {}
    if warehouse_id: query["warehouse_id"] = warehouse_id
    if ingredient_id: query["ingredient_id"] = ingredient_id
    if movement_type: query["movement_type"] = movement_type
    return await db.stock_movements.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)


# ═══════════════════════════════════════════════════════════════════════════════
# ─── INVENTORY EXPLOSION SYSTEM ───
# ═══════════════════════════════════════════════════════════════════════════════

async def get_ingredient_stock(ingredient_id: str, warehouse_id: str) -> float:
    """Get current stock of an ingredient in a warehouse"""
    stock_doc = await db.stock.find_one(
        {"ingredient_id": ingredient_id, "warehouse_id": warehouse_id}, 
        {"_id": 0}
    )
    return stock_doc.get("current_stock", 0) if stock_doc else 0

async def get_recipe_for_ingredient(ingredient_id: str) -> dict:
    """Get the recipe that produces a sub-recipe ingredient"""
    ingredient = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
    if not ingredient or not ingredient.get("is_subrecipe"):
        return None
    recipe_id = ingredient.get("recipe_id")
    if recipe_id:
        return await db.recipes.find_one({"id": recipe_id}, {"_id": 0})
    # Also check by produces_ingredient_id
    return await db.recipes.find_one({"produces_ingredient_id": ingredient_id}, {"_id": 0})

async def calculate_recipe_cost(recipe: dict, depth: int = 0) -> float:
    """Recursively calculate the cost of a recipe including sub-recipes"""
    if depth > 10:  # Prevent infinite recursion
        return 0
    
    total_cost = 0
    for ing in recipe.get("ingredients", []):
        ingredient = await db.ingredients.find_one({"id": ing["ingredient_id"]}, {"_id": 0})
        if not ingredient:
            continue
        
        quantity = ing.get("quantity", 0)
        waste = quantity * (ing.get("waste_percentage", 0) / 100)
        effective_quantity = quantity + waste
        
        if ingredient.get("is_subrecipe"):
            # Get sub-recipe and calculate its cost
            sub_recipe = await get_recipe_for_ingredient(ingredient["id"])
            if sub_recipe:
                sub_cost = await calculate_recipe_cost(sub_recipe, depth + 1)
                total_cost += sub_cost * effective_quantity
        else:
            # Base ingredient - use dispatch_unit_cost (converts purchase unit → dispatch unit)
            conversion_factor = ingredient.get("conversion_factor", 1) or 1
            dispatch_unit_cost = ingredient.get("avg_cost", 0) / conversion_factor
            total_cost += dispatch_unit_cost * effective_quantity
    
    yield_qty = recipe.get("yield_quantity", 1) or 1
    return total_cost / yield_qty

async def update_subrecipe_costs():
    """Update costs for all sub-recipe ingredients based on their component costs"""
    subrecipe_ingredients = await db.ingredients.find({"is_subrecipe": True}, {"_id": 0}).to_list(500)
    
    for ing in subrecipe_ingredients:
        recipe = await get_recipe_for_ingredient(ing["id"])
        if recipe:
            new_cost = await calculate_recipe_cost(recipe)
            conversion_factor = ing.get("conversion_factor", 1) or 1
            dispatch_unit_cost = new_cost  # cost per dispatch unit (already divided by yield in calculate_recipe_cost)
            if abs(new_cost - ing.get("avg_cost", 0)) > 0.001:
                await db.ingredients.update_one(
                    {"id": ing["id"]},
                    {"$set": {
                        "avg_cost": round(new_cost, 4),
                        "dispatch_unit_cost": round(dispatch_unit_cost, 4),
                        "cost_updated_at": now_iso()
                    }}
                )

async def explode_and_deduct_recipe(
    recipe: dict,
    warehouse_id: str,
    quantity: float,
    user_id: str,
    user_name: str,
    parent_product_id: str,
    order_id: str,
    depth: int = 0
) -> dict:
    """
    Recursively explode a recipe and deduct ingredients from stock.
    If a sub-recipe doesn't have enough stock, explode its components.
    Returns: {"success": bool, "movements": [...], "errors": [...]}
    """
    if depth > 10:
        return {"success": False, "movements": [], "errors": ["Recursión máxima alcanzada"]}
    
    movements = []
    errors = []
    yield_qty = recipe.get("yield_quantity", 1) or 1
    
    for ing in recipe.get("ingredients", []):
        # Handle both ingredient_id and ingredient_name (legacy)
        ingredient_id = ing.get("ingredient_id")
        ingredient_name = ing.get("ingredient_name", "")
        
        ingredient = None
        if ingredient_id:
            ingredient = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
        
        # If no ingredient found by id, this is a legacy recipe with just names
        if not ingredient:
            # Legacy recipe - skip ingredient tracking but log
            if ingredient_name:
                errors.append(f"Ingrediente '{ingredient_name}' no vinculado al sistema de inventario")
            continue
        
        # Calculate required quantity with waste
        base_quantity = ing.get("quantity", 0)
        waste = base_quantity * (ing.get("waste_percentage", 0) / 100)
        required_per_unit = (base_quantity + waste) / yield_qty
        total_required = required_per_unit * quantity
        
        # Check current stock
        current_stock = await get_ingredient_stock(ingredient["id"], warehouse_id)
        
        if ingredient.get("is_subrecipe"):
            # This is a sub-recipe ingredient
            if current_stock >= total_required:
                # We have enough prepared sub-recipe, just deduct it
                await db.stock.update_one(
                    {"ingredient_id": ingredient["id"], "warehouse_id": warehouse_id},
                    {"$inc": {"current_stock": -total_required}, "$set": {"last_updated": now_iso()}}
                )
                movement = {
                    "id": gen_id(),
                    "ingredient_id": ingredient["id"],
                    "ingredient_name": ingredient["name"],
                    "warehouse_id": warehouse_id,
                    "quantity": -total_required,
                    "movement_type": "sale",
                    "reference_id": order_id,
                    "parent_product_id": parent_product_id,
                    "parent_recipe_id": recipe.get("id", ""),
                    "notes": "Venta - Sub-receta consumida",
                    "user_id": user_id,
                    "user_name": user_name,
                    "created_at": now_iso()
                }
                await db.stock_movements.insert_one(movement)
                movements.append(movement)
            else:
                # Not enough prepared sub-recipe - EXPLODE IT
                # First use whatever stock we have
                if current_stock > 0:
                    await db.stock.update_one(
                        {"ingredient_id": ingredient["id"], "warehouse_id": warehouse_id},
                        {"$set": {"current_stock": 0, "last_updated": now_iso()}}
                    )
                    movement = {
                        "id": gen_id(),
                        "ingredient_id": ingredient["id"],
                        "ingredient_name": ingredient["name"],
                        "warehouse_id": warehouse_id,
                        "quantity": -current_stock,
                        "movement_type": "sale",
                        "reference_id": order_id,
                        "parent_product_id": parent_product_id,
                        "parent_recipe_id": recipe.get("id", ""),
                        "notes": "Venta - Sub-receta parcial consumida",
                        "user_id": user_id,
                        "user_name": user_name,
                        "created_at": now_iso()
                    }
                    await db.stock_movements.insert_one(movement)
                    movements.append(movement)
                
                # Now explode the remaining requirement
                remaining = total_required - current_stock
                sub_recipe = await get_recipe_for_ingredient(ingredient["id"])
                
                if sub_recipe:
                    explosion_result = await explode_and_deduct_recipe(
                        sub_recipe, warehouse_id, remaining,
                        user_id, user_name, parent_product_id, order_id, depth + 1
                    )
                    movements.extend(explosion_result["movements"])
                    errors.extend(explosion_result["errors"])
                    
                    # Log the explosion event
                    explosion_movement = {
                        "id": gen_id(),
                        "ingredient_id": ingredient["id"],
                        "ingredient_name": ingredient["name"],
                        "warehouse_id": warehouse_id,
                        "quantity": 0,  # Virtual - represents explosion
                        "movement_type": "explosion",
                        "reference_id": order_id,
                        "parent_product_id": parent_product_id,
                        "parent_recipe_id": recipe.get("id", ""),
                        "notes": f"Explosión de sub-receta: {remaining:.4f} {ingredient.get('unit', 'unidad')}",
                        "user_id": user_id,
                        "user_name": user_name,
                        "created_at": now_iso()
                    }
                    await db.stock_movements.insert_one(explosion_movement)
                    movements.append(explosion_movement)
                else:
                    errors.append(f"Sub-receta sin receta definida: {ingredient['name']}")
        else:
            # Base ingredient - just deduct
            if current_stock < total_required:
                # Not enough stock - log warning but continue
                errors.append(f"Stock insuficiente: {ingredient['name']} (tiene {current_stock:.2f}, necesita {total_required:.2f})")
            
            # Deduct whatever we can (allow negative for tracking)
            await db.stock.update_one(
                {"ingredient_id": ingredient["id"], "warehouse_id": warehouse_id},
                {"$inc": {"current_stock": -total_required}, "$set": {"last_updated": now_iso()}},
                upsert=True
            )
            movement = {
                "id": gen_id(),
                "ingredient_id": ingredient["id"],
                "ingredient_name": ingredient["name"],
                "warehouse_id": warehouse_id,
                "quantity": -total_required,
                "movement_type": "sale",
                "reference_id": order_id,
                "parent_product_id": parent_product_id,
                "parent_recipe_id": recipe.get("id", ""),
                "notes": "Venta - Ingrediente base",
                "user_id": user_id,
                "user_name": user_name,
                "created_at": now_iso()
            }
            await db.stock_movements.insert_one(movement)
            movements.append(movement)
    
    return {"success": len(errors) == 0, "movements": movements, "errors": errors}

async def check_recipe_availability(recipe: dict, warehouse_id: str, quantity: float, depth: int = 0) -> dict:
    """
    Check if a recipe can be produced with available stock.
    Returns availability status and missing items.
    """
    if depth > 10:
        return {"available": False, "missing": [], "requires_explosion": False}
    
    missing = []
    requires_explosion = False
    yield_qty = recipe.get("yield_quantity", 1) or 1
    
    for ing in recipe.get("ingredients", []):
        # Handle both ingredient_id and ingredient_name (legacy)
        ingredient_id = ing.get("ingredient_id")
        ingredient_name = ing.get("ingredient_name", "")
        
        ingredient = None
        if ingredient_id:
            ingredient = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
        
        # If no ingredient found by id, this is a legacy recipe with just names
        if not ingredient and ingredient_name:
            # Legacy recipe - skip ingredient tracking
            continue
        
        if not ingredient:
            missing.append({"name": ingredient_name or "?", "required": 0, "available": 0, "reason": "no_existe"})
            continue
        
        base_quantity = ing.get("quantity", 0)
        waste = base_quantity * (ing.get("waste_percentage", 0) / 100)
        required_per_unit = (base_quantity + waste) / yield_qty
        total_required = required_per_unit * quantity
        
        current_stock = await get_ingredient_stock(ingredient["id"], warehouse_id)
        
        if ingredient.get("is_subrecipe"):
            if current_stock < total_required:
                # Check if we can explode
                sub_recipe = await get_recipe_for_ingredient(ingredient["id"])
                if sub_recipe:
                    remaining = total_required - current_stock
                    sub_check = await check_recipe_availability(sub_recipe, warehouse_id, remaining, depth + 1)
                    if not sub_check["available"]:
                        missing.extend(sub_check["missing"])
                    requires_explosion = True
                else:
                    missing.append({
                        "name": ingredient["name"],
                        "required": total_required,
                        "available": current_stock,
                        "reason": "subreceta_sin_receta"
                    })
        else:
            if current_stock < total_required:
                missing.append({
                    "name": ingredient["name"],
                    "required": total_required,
                    "available": current_stock,
                    "deficit": total_required - current_stock,
                    "reason": "stock_insuficiente"
                })
    
    return {
        "available": len(missing) == 0,
        "missing": missing,
        "requires_explosion": requires_explosion
    }

@router.post("/inventory/deduct-for-product")
async def deduct_inventory_for_product(input: StockDeductInput, user=Depends(get_current_user)):
    """
    Deduct inventory for a product sale with full explosion logic.
    This is the main entry point for inventory deduction.
    """
    # Get product
    product = await db.products.find_one({"id": input.product_id}, {"_id": 0})
    if not product:
        raise HTTPException(404, "Producto no encontrado")
    
    # Get recipe for product
    recipe = await db.recipes.find_one({"product_id": input.product_id}, {"_id": 0})
    if not recipe:
        return {"ok": True, "message": "Producto sin receta - no se descuenta inventario", "movements": []}
    
    # Check availability first
    availability = await check_recipe_availability(recipe, input.warehouse_id, input.quantity)
    
    # Execute deduction with explosion
    result = await explode_and_deduct_recipe(
        recipe=recipe,
        warehouse_id=input.warehouse_id,
        quantity=input.quantity,
        user_id=user["user_id"],
        user_name=user["name"],
        parent_product_id=input.product_id,
        order_id=input.order_id
    )
    
    # Update sub-recipe costs after deduction
    await update_subrecipe_costs()
    
    return {
        "ok": result["success"],
        "product_name": product.get("name", "?"),
        "quantity_deducted": input.quantity,
        "movements_count": len(result["movements"]),
        "movements": [{k: v for k, v in m.items() if k != "_id"} for m in result["movements"]],
        "errors": result["errors"],
        "availability_check": availability
    }

@router.post("/inventory/check-availability")
async def check_inventory_availability(input: StockDeductInput):
    """Check if a product can be produced with available inventory"""
    recipe = await db.recipes.find_one({"product_id": input.product_id}, {"_id": 0})
    if not recipe:
        return {"available": True, "message": "Producto sin receta", "missing": []}
    
    result = await check_recipe_availability(recipe, input.warehouse_id, input.quantity)
    return result

@router.post("/inventory/recalculate-costs")
async def recalculate_all_costs():
    """Recalculate costs for all sub-recipe ingredients"""
    await update_subrecipe_costs()
    
    # Also recalculate recipe costs
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(500)
    updated = []
    for recipe in recipes:
        cost = await calculate_recipe_cost(recipe)
        await db.recipes.update_one(
            {"id": recipe["id"]},
            {"$set": {"calculated_cost": round(cost, 2), "cost_updated_at": now_iso()}}
        )
        updated.append({"recipe_id": recipe["id"], "product_name": recipe.get("product_name", "?"), "cost": round(cost, 2)})
    
    return {"ok": True, "recipes_updated": len(updated), "details": updated}

@router.get("/inventory/recipe-cost/{product_id}")
async def get_recipe_cost(product_id: str):
    """Get the calculated cost of a product's recipe including sub-recipes"""
    recipe = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    if not recipe:
        return {"cost": 0, "message": "Producto sin receta"}
    
    cost = await calculate_recipe_cost(recipe)
    
    # Get detailed breakdown
    breakdown = []
    for ing in recipe.get("ingredients", []):
        ingredient = await db.ingredients.find_one({"id": ing["ingredient_id"]}, {"_id": 0})
        if not ingredient:
            continue
        
        quantity = ing.get("quantity", 0)
        waste = quantity * (ing.get("waste_percentage", 0) / 100)
        effective_quantity = quantity + waste
        
        item = {
            "ingredient_id": ingredient["id"],
            "name": ingredient["name"],
            "quantity": quantity,
            "waste_percentage": ing.get("waste_percentage", 0),
            "effective_quantity": effective_quantity,
            "unit_cost": ingredient.get("avg_cost", 0),
            "total_cost": ingredient.get("avg_cost", 0) * effective_quantity,
            "is_subrecipe": ingredient.get("is_subrecipe", False)
        }
        
        if ingredient.get("is_subrecipe"):
            sub_recipe = await get_recipe_for_ingredient(ingredient["id"])
            if sub_recipe:
                item["sub_cost"] = await calculate_recipe_cost(sub_recipe)
                item["total_cost"] = item["sub_cost"] * effective_quantity
        
        breakdown.append(item)
    
    yield_qty = recipe.get("yield_quantity", 1) or 1
    return {
        "product_id": product_id,
        "product_name": recipe.get("product_name", "?"),
        "total_cost": round(cost, 2),
        "yield_quantity": yield_qty,
        "cost_per_unit": round(cost, 2),
        "breakdown": breakdown
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ─── SUB-RECIPE PRODUCTION ───
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/inventory/subrecipes")
async def list_subrecipes():
    """List all sub-recipe ingredients that can be produced"""
    subrecipes = await db.ingredients.find({"is_subrecipe": True}, {"_id": 0}).to_list(100)
    result = []
    for sr in subrecipes:
        recipe = await get_recipe_for_ingredient(sr["id"])
        if recipe:
            cost = await calculate_recipe_cost(recipe)
            result.append({
                "ingredient_id": sr["id"],
                "name": sr["name"],
                "unit": sr.get("unit", "unidad"),
                "category": sr.get("category", "general"),
                "avg_cost": sr.get("avg_cost", 0),
                "calculated_cost": round(cost, 2),
                "recipe_id": recipe.get("id"),
                "recipe_yield": recipe.get("yield_quantity", 1),
                "ingredients_count": len(recipe.get("ingredients", []))
            })
    return result

@router.post("/inventory/check-production")
async def check_production_availability(input: ProductionInput):
    """Check if we can produce a sub-recipe with available ingredients"""
    ingredient = await db.ingredients.find_one({"id": input.ingredient_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(404, "Ingrediente no encontrado")
    if not ingredient.get("is_subrecipe"):
        raise HTTPException(400, "Este ingrediente no es una sub-receta")
    
    recipe = await get_recipe_for_ingredient(input.ingredient_id)
    if not recipe:
        raise HTTPException(400, "No hay receta definida para producir este ingrediente")
    
    result = await check_recipe_availability(recipe, input.warehouse_id, input.quantity)
    
    # Calculate production details
    yield_qty = recipe.get("yield_quantity", 1) or 1
    cost = await calculate_recipe_cost(recipe)
    
    return {
        "ingredient_name": ingredient["name"],
        "can_produce": result["available"],
        "quantity_to_produce": input.quantity,
        "unit": ingredient.get("unit", "unidad"),
        "production_cost": round(cost * input.quantity, 2),
        "cost_per_unit": round(cost, 2),
        "missing_ingredients": result["missing"],
        "requires_explosion": result.get("requires_explosion", False)
    }

@router.post("/inventory/produce")
async def produce_subrecipe(input: ProductionInput, user=Depends(get_current_user)):
    """
    Produce a batch of sub-recipe by consuming its ingredients.
    This is the reverse of explosion - we consume base ingredients to create the sub-recipe stock.
    """
    ingredient = await db.ingredients.find_one({"id": input.ingredient_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(404, "Ingrediente no encontrado")
    if not ingredient.get("is_subrecipe"):
        raise HTTPException(400, "Este ingrediente no es una sub-receta")
    
    recipe = await get_recipe_for_ingredient(input.ingredient_id)
    if not recipe:
        raise HTTPException(400, "No hay receta definida para producir este ingrediente")
    
    # Check availability first
    availability = await check_recipe_availability(recipe, input.warehouse_id, input.quantity)
    if not availability["available"] and availability["missing"]:
        return {
            "ok": False,
            "error": "Ingredientes insuficientes",
            "missing": availability["missing"]
        }
    
    movements = []
    yield_qty = recipe.get("yield_quantity", 1) or 1
    production_id = gen_id()
    
    # Deduct ingredients used in production
    for ing in recipe.get("ingredients", []):
        ing_id = ing.get("ingredient_id")
        if not ing_id:
            continue
        
        ing_doc = await db.ingredients.find_one({"id": ing_id}, {"_id": 0})
        if not ing_doc:
            continue
        
        base_quantity = ing.get("quantity", 0)
        waste = base_quantity * (ing.get("waste_percentage", 0) / 100)
        required_per_unit = (base_quantity + waste) / yield_qty
        total_required = required_per_unit * input.quantity
        
        # Deduct from stock
        await db.stock.update_one(
            {"ingredient_id": ing_id, "warehouse_id": input.warehouse_id},
            {"$inc": {"current_stock": -total_required}, "$set": {"last_updated": now_iso()}},
            upsert=True
        )
        
        # Log movement
        movement = {
            "id": gen_id(),
            "ingredient_id": ing_id,
            "ingredient_name": ing_doc["name"],
            "warehouse_id": input.warehouse_id,
            "quantity": -total_required,
            "movement_type": "production_consume",
            "reference_id": production_id,
            "parent_product_id": input.ingredient_id,
            "parent_recipe_id": recipe.get("id", ""),
            "notes": f"Consumido para producir {input.quantity} {ingredient.get('unit', 'unidad')} de {ingredient['name']}",
            "user_id": user["user_id"],
            "user_name": user["name"],
            "created_at": now_iso()
        }
        await db.stock_movements.insert_one(movement)
        movements.append({k: v for k, v in movement.items() if k != "_id"})
    
    # Add the produced sub-recipe to stock
    await db.stock.update_one(
        {"ingredient_id": input.ingredient_id, "warehouse_id": input.warehouse_id},
        {"$inc": {"current_stock": input.quantity}, "$set": {"last_updated": now_iso()}},
        upsert=True
    )
    
    # Log production output
    production_movement = {
        "id": gen_id(),
        "ingredient_id": input.ingredient_id,
        "ingredient_name": ingredient["name"],
        "warehouse_id": input.warehouse_id,
        "quantity": input.quantity,
        "movement_type": "production_output",
        "reference_id": production_id,
        "parent_product_id": "",
        "parent_recipe_id": recipe.get("id", ""),
        "notes": input.notes or f"Producción de {input.quantity} {ingredient.get('unit', 'unidad')}",
        "user_id": user["user_id"],
        "user_name": user["name"],
        "created_at": now_iso()
    }
    await db.stock_movements.insert_one(production_movement)
    movements.append({k: v for k, v in production_movement.items() if k != "_id"})
    
    # Log production record
    cost = await calculate_recipe_cost(recipe)
    production_record = {
        "id": production_id,
        "ingredient_id": input.ingredient_id,
        "ingredient_name": ingredient["name"],
        "recipe_id": recipe.get("id"),
        "warehouse_id": input.warehouse_id,
        "quantity_produced": input.quantity,
        "unit": ingredient.get("unit", "unidad"),
        "total_cost": round(cost * input.quantity, 2),
        "cost_per_unit": round(cost, 2),
        "ingredients_consumed": len(movements) - 1,
        "notes": input.notes,
        "produced_by": user["name"],
        "produced_at": now_iso()
    }
    await db.production_records.insert_one(production_record)
    
    # Update sub-recipe cost
    await db.ingredients.update_one(
        {"id": input.ingredient_id},
        {"$set": {"avg_cost": round(cost, 2), "cost_updated_at": now_iso()}}
    )
    
    return {
        "ok": True,
        "production_id": production_id,
        "ingredient_name": ingredient["name"],
        "quantity_produced": input.quantity,
        "unit": ingredient.get("unit", "unidad"),
        "total_cost": round(cost * input.quantity, 2),
        "movements_count": len(movements),
        "movements": movements
    }

@router.get("/inventory/production-history")
async def get_production_history(
    ingredient_id: Optional[str] = Query(None),
    warehouse_id: Optional[str] = Query(None),
    limit: int = Query(50)
):
    """Get history of sub-recipe productions"""
    query = {}
    if ingredient_id: query["ingredient_id"] = ingredient_id
    if warehouse_id: query["warehouse_id"] = warehouse_id
    return await db.production_records.find(query, {"_id": 0}).sort("produced_at", -1).to_list(limit)


# ═══════════════════════════════════════════════════════════════════════════════
# ─── WAREHOUSES ───
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/warehouses")
async def list_warehouses():
    return await db.warehouses.find({}, {"_id": 0}).to_list(50)

@router.post("/warehouses")
async def create_warehouse(input: WarehouseInput):
    doc = {"id": gen_id(), "name": input.name, "location": input.location, "active": True}
    await db.warehouses.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.put("/warehouses/{wid}")
async def update_warehouse(wid: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.warehouses.update_one({"id": wid}, {"$set": input})
    return {"ok": True}

@router.delete("/warehouses/{wid}")
async def delete_warehouse(wid: str):
    # Check if has stock
    stock_count = await db.stock.count_documents({"warehouse_id": wid, "current_stock": {"$gt": 0}})
    if stock_count > 0:
        raise HTTPException(400, "No se puede eliminar: el almacén tiene stock")
    await db.warehouses.delete_one({"id": wid})
    return {"ok": True}
