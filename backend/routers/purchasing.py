"""
Purchasing & Cost Control Router
Handles purchase orders, shopping assistant, price alerts, and margin analysis.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timezone, timedelta

from models.database import db
from models.schemas import (
    PurchaseOrderInput, ReceivePOInput, GeneratePOFromSuggestionsInput,
    SupplierInput, WarehouseInput
)
from utils.helpers import gen_id, now_iso
from routers.auth import get_current_user

router = APIRouter(tags=["Purchasing"])


# ─── SUPPLIERS ───

@router.get("/suppliers")
async def list_suppliers():
    return await db.suppliers.find({}, {"_id": 0}).to_list(100)


@router.get("/suppliers/with-active-orders")
async def list_suppliers_with_active_orders():
    """Get all suppliers with count of active purchase orders."""
    suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(100)
    
    # Get active PO counts (draft, sent, partial statuses)
    pipeline = [
        {"$match": {"status": {"$in": ["draft", "sent", "partial"]}}},
        {"$group": {"_id": "$supplier_id", "active_orders": {"$sum": 1}}}
    ]
    active_counts = await db.purchase_orders.aggregate(pipeline).to_list(100)
    active_map = {item["_id"]: item["active_orders"] for item in active_counts}
    
    # Add active_orders count to each supplier
    for supplier in suppliers:
        supplier["active_orders"] = active_map.get(supplier.get("id"), 0)
    
    return suppliers


@router.post("/suppliers")
async def create_supplier(input: SupplierInput):
    doc = {"id": gen_id(), **input.model_dump()}
    await db.suppliers.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, input: dict):
    if "_id" in input: del input["_id"]
    await db.suppliers.update_one({"id": supplier_id}, {"$set": input})
    return {"ok": True}


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str):
    await db.suppliers.delete_one({"id": supplier_id})
    return {"ok": True}


# ─── PURCHASE ORDERS ───

@router.get("/purchase-orders")
async def list_purchase_orders(status: Optional[str] = Query(None)):
    query = {}
    if status:
        query["status"] = status
    return await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/purchase-orders")
async def create_purchase_order(input: PurchaseOrderInput, user=Depends(get_current_user)):
    supplier = await db.suppliers.find_one({"id": input.supplier_id}, {"_id": 0})
    items = []
    for item in input.items:
        items.append({
            "id": gen_id(),
            "ingredient_id": item.ingredient_id,
            "ingredient_name": item.ingredient_name,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "received_quantity": 0,
            "actual_unit_price": item.unit_price
        })
    
    total = sum(i["quantity"] * i["unit_price"] for i in items)
    doc = {
        "id": gen_id(),
        "supplier_id": input.supplier_id,
        "supplier_name": supplier["name"] if supplier else "?",
        "warehouse_id": input.warehouse_id,
        "items": items,
        "total": round(total, 2),
        "notes": input.notes,
        "expected_date": input.expected_date,
        "status": "draft",
        "created_by": user["name"],
        "created_at": now_iso(),
        "received_at": None
    }
    await db.purchase_orders.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/purchase-orders/{po_id}")
async def update_purchase_order(po_id: str, input: dict):
    if "_id" in input: del input["_id"]
    if "items" in input:
        total = sum(i["quantity"] * i["unit_price"] for i in input["items"])
        input["total"] = round(total, 2)
    await db.purchase_orders.update_one({"id": po_id}, {"$set": input})
    return await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})


@router.put("/purchase-orders/{po_id}/status")
async def update_po_status(po_id: str, status: str = Query(...)):
    await db.purchase_orders.update_one({"id": po_id}, {"$set": {"status": status}})
    return {"ok": True}


@router.post("/purchase-orders/{po_id}/receive")
async def receive_purchase_order(po_id: str, input: ReceivePOInput, user=Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    warehouse_id = input.warehouse_id or po.get("warehouse_id", "")
    price_alerts = []
    
    for recv_item in input.items:
        for po_item in po["items"]:
            if po_item["ingredient_id"] == recv_item.ingredient_id:
                po_item["received_quantity"] = po_item.get("received_quantity", 0) + recv_item.received_quantity
                
                if recv_item.actual_unit_price > 0:
                    po_item["actual_unit_price"] = recv_item.actual_unit_price
                
                # Get ingredient to apply conversion factor
                ing = await db.ingredients.find_one({"id": recv_item.ingredient_id}, {"_id": 0})
                conversion_factor = ing.get("conversion_factor", 1) if ing else 1
                
                # Calculate stock to add in dispatch units (using conversion factor)
                # If user receives 10 Bottles and conversion_factor is 23.6, add 236 oz to stock
                stock_to_add = recv_item.received_quantity * conversion_factor
                
                # Update stock (in dispatch units)
                await db.stock.update_one(
                    {"ingredient_id": recv_item.ingredient_id, "warehouse_id": warehouse_id},
                    {"$inc": {"current_stock": stock_to_add}, "$set": {"last_updated": now_iso()}},
                    upsert=True
                )
                
                # Log movement (in dispatch units for accurate tracking)
                await db.stock_movements.insert_one({
                    "id": gen_id(), "ingredient_id": recv_item.ingredient_id, "warehouse_id": warehouse_id,
                    "quantity": stock_to_add, "movement_type": "purchase",
                    "reference_id": po_id, 
                    "notes": f"OC recibida: {recv_item.received_quantity} {ing.get('purchase_unit', 'unidad') if ing else 'unidad'} = {stock_to_add} {ing.get('unit', 'unidad') if ing else 'unidad'}",
                    "user_id": user["user_id"], "user_name": user["name"], "created_at": now_iso()
                })
                
                # Update ingredient avg_cost using weighted average
                if recv_item.actual_unit_price > 0 and ing:
                    old_cost = ing.get("avg_cost", 0)
                    total_stock_docs = await db.stock.find({"ingredient_id": recv_item.ingredient_id}, {"_id": 0}).to_list(50)
                    total_stock = sum(s.get("current_stock", 0) for s in total_stock_docs)
                    old_stock = total_stock - stock_to_add
                    
                    # Check for price increase
                    if old_cost > 0:
                        price_change_pct = ((recv_item.actual_unit_price - old_cost) / old_cost) * 100
                        if price_change_pct > 5:
                            recipes_count = await db.recipes.count_documents({"ingredients.ingredient_id": recv_item.ingredient_id})
                            price_alerts.append({
                                "ingredient_id": recv_item.ingredient_id,
                                "ingredient_name": ing.get("name", "?"),
                                "old_price": round(old_cost, 2),
                                "new_price": round(recv_item.actual_unit_price, 2),
                                "change_percentage": round(price_change_pct, 2),
                                "recipes_affected": recipes_count
                            })
                            
                            await db.ingredient_audit_logs.insert_one({
                                "id": gen_id(),
                                "ingredient_id": recv_item.ingredient_id,
                                "ingredient_name": ing.get("name", ""),
                                "field_changed": "avg_cost",
                                "old_value": str(old_cost),
                                "new_value": str(recv_item.actual_unit_price),
                                "changed_by_id": user["user_id"],
                                "changed_by_name": user["name"],
                                "timestamp": now_iso(),
                                "source": "purchase_order",
                                "po_id": po_id
                            })
                    
                    if total_stock > 0:
                        # avg_cost is stored in purchase units, calculate using received quantity
                        new_avg = ((old_cost * (old_stock / conversion_factor)) + (recv_item.actual_unit_price * recv_item.received_quantity)) / (total_stock / conversion_factor) if conversion_factor > 0 else ((old_cost * old_stock) + (recv_item.actual_unit_price * recv_item.received_quantity)) / total_stock
                        dispatch_unit_cost = new_avg / conversion_factor if conversion_factor > 0 else new_avg
                        
                        await db.ingredients.update_one(
                            {"id": recv_item.ingredient_id},
                            {"$set": {
                                "avg_cost": round(new_avg, 2),
                                "dispatch_unit_cost": round(dispatch_unit_cost, 4),
                                "last_purchase_price": round(recv_item.actual_unit_price, 2),
                                "last_purchase_date": now_iso()
                            }}
                        )
                break
    
    all_received = all(i["received_quantity"] >= i["quantity"] for i in po["items"])
    partial = any(i["received_quantity"] > 0 for i in po["items"])
    new_status = "received" if all_received else "partial" if partial else po["status"]
    
    actual_total = sum(i.get("received_quantity", 0) * i.get("actual_unit_price", i.get("unit_price", 0)) for i in po["items"])
    
    await db.purchase_orders.update_one({"id": po_id}, {"$set": {
        "items": po["items"], 
        "status": new_status, 
        "actual_total": round(actual_total, 2),
        "received_at": now_iso() if all_received else None,
        "received_by": user["name"] if all_received else None
    }})
    
    result = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    
    if price_alerts:
        result["price_alerts"] = price_alerts
    
    return result


@router.delete("/purchase-orders/{po_id}")
async def delete_purchase_order(po_id: str):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if po and po.get("status") not in ["draft", "pending"]:
        raise HTTPException(400, "Solo se pueden eliminar órdenes en borrador o pendientes")
    await db.purchase_orders.delete_one({"id": po_id})
    return {"ok": True}


# ─── COST CONTROL & SHOPPING ASSISTANT ───

@router.get("/ingredients/{ingredient_id}/price-history")
async def get_ingredient_price_history(ingredient_id: str, limit: int = Query(50)):
    """Get the price history for an ingredient from received purchase orders."""
    ingredient = await db.ingredients.find_one({"id": ingredient_id}, {"_id": 0})
    if not ingredient:
        raise HTTPException(404, "Ingrediente no encontrado")
    
    pipeline = [
        {"$match": {"status": {"$in": ["received", "partial"]}, "items.ingredient_id": ingredient_id}},
        {"$unwind": "$items"},
        {"$match": {"items.ingredient_id": ingredient_id, "items.received_quantity": {"$gt": 0}}},
        {"$project": {
            "_id": 0,
            "po_id": "$id",
            "supplier_id": "$supplier_id",
            "supplier_name": "$supplier_name",
            "received_at": {"$ifNull": ["$received_at", "$created_at"]},
            "quantity": "$items.received_quantity",
            "unit_price": {"$ifNull": ["$items.actual_unit_price", "$items.unit_price"]},
            "total": {"$multiply": [
                {"$ifNull": ["$items.received_quantity", 0]},
                {"$ifNull": ["$items.actual_unit_price", "$items.unit_price"]}
            ]}
        }},
        {"$sort": {"received_at": -1}},
        {"$limit": limit}
    ]
    
    history = await db.purchase_orders.aggregate(pipeline).to_list(limit)
    
    if history:
        prices = [h["unit_price"] for h in history if h.get("unit_price", 0) > 0]
        avg_price = sum(prices) / len(prices) if prices else 0
        min_price = min(prices) if prices else 0
        max_price = max(prices) if prices else 0
        latest_price = prices[0] if prices else 0
        
        if len(prices) >= 6:
            recent_avg = sum(prices[:3]) / 3
            older_avg = sum(prices[3:6]) / 3
            trend = "up" if recent_avg > older_avg * 1.05 else "down" if recent_avg < older_avg * 0.95 else "stable"
            trend_percentage = ((recent_avg - older_avg) / older_avg * 100) if older_avg > 0 else 0
        else:
            trend = "insufficient_data"
            trend_percentage = 0
    else:
        avg_price = min_price = max_price = latest_price = 0
        trend = "no_data"
        trend_percentage = 0
    
    return {
        "ingredient_id": ingredient_id,
        "ingredient_name": ingredient.get("name", "?"),
        "current_avg_cost": ingredient.get("avg_cost", 0),
        "history": history,
        "stats": {
            "avg_price": round(avg_price, 2),
            "min_price": round(min_price, 2),
            "max_price": round(max_price, 2),
            "latest_price": round(latest_price, 2),
            "total_purchases": len(history),
            "trend": trend,
            "trend_percentage": round(trend_percentage, 2)
        }
    }


async def _get_purchase_suggestions_internal(
    supplier_id: Optional[str] = None,
    warehouse_id: Optional[str] = None,
    include_ok_stock: bool = False
):
    """Internal function for getting purchase suggestions."""
    ingredients = await db.ingredients.find({}, {"_id": 0}).to_list(500)
    
    if supplier_id:
        ingredients = [i for i in ingredients if i.get("default_supplier_id") == supplier_id]
    
    suggestions = []
    
    for ing in ingredients:
        stock_query = {"ingredient_id": ing["id"]}
        if warehouse_id:
            stock_query["warehouse_id"] = warehouse_id
        stock_docs = await db.stock.find(stock_query, {"_id": 0}).to_list(50)
        current_stock = sum(s.get("current_stock", 0) for s in stock_docs)
        
        min_stock = ing.get("min_stock", 0)
        is_low = current_stock <= min_stock
        
        if not include_ok_stock and not is_low:
            continue
        
        thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        consumption_docs = await db.stock_movements.find({
            "ingredient_id": ing["id"],
            "movement_type": {"$in": ["sale", "explosion", "production_consume"]},
            "created_at": {"$gte": thirty_days_ago}
        }, {"_id": 0}).to_list(500)
        
        total_consumption = sum(abs(m.get("quantity", 0)) for m in consumption_docs)
        avg_daily_consumption = total_consumption / 30
        
        target_stock = max(min_stock * 2, avg_daily_consumption * 14)
        suggested_qty = max(0, target_stock - current_stock)
        
        conversion_factor = ing.get("conversion_factor", 1)
        purchase_unit = ing.get("purchase_unit", ing.get("unit", "unidad"))
        
        if conversion_factor > 0:
            suggested_purchase_units = suggested_qty / conversion_factor
            suggested_purchase_units = max(1, round(suggested_purchase_units + 0.49))
            suggested_qty_dispatch = suggested_purchase_units * conversion_factor
        else:
            suggested_purchase_units = suggested_qty
            suggested_qty_dispatch = suggested_qty
        
        last_po = await db.purchase_orders.find_one(
            {"items.ingredient_id": ing["id"], "status": "received"},
            {"_id": 0},
            sort=[("received_at", -1)]
        )
        
        last_price = ing.get("avg_cost", 0)
        if last_po:
            for item in last_po.get("items", []):
                if item["ingredient_id"] == ing["id"]:
                    last_price = item.get("actual_unit_price", item.get("unit_price", 0))
                    break
        
        days_of_stock = 999 if avg_daily_consumption == 0 else current_stock / avg_daily_consumption
        
        supplier_name = None
        if ing.get("default_supplier_id"):
            supplier_doc = await db.suppliers.find_one({"id": ing["default_supplier_id"]}, {"_id": 0, "name": 1})
            supplier_name = supplier_doc.get("name") if supplier_doc else None
        
        suggestions.append({
            "ingredient_id": ing["id"],
            "ingredient_name": ing["name"],
            "category": ing.get("category", ""),
            "current_stock": round(current_stock, 2),
            "min_stock": min_stock,
            "dispatch_unit": ing.get("dispatch_unit", ing.get("unit", "unidad")),
            "purchase_unit": purchase_unit,
            "avg_daily_consumption": round(avg_daily_consumption, 2),
            "days_of_stock": round(days_of_stock, 1),
            "suggested_purchase_units": suggested_purchase_units,
            "suggested_qty_dispatch": round(suggested_qty_dispatch, 2),
            "last_unit_price": round(last_price, 2),
            "estimated_total": round(suggested_purchase_units * last_price, 2),
            "is_low_stock": is_low,
            "is_out_of_stock": current_stock <= 0,
            "default_supplier_id": ing.get("default_supplier_id"),
            "default_supplier_name": supplier_name
        })
    
    suggestions.sort(key=lambda x: (not x["is_out_of_stock"], not x["is_low_stock"], x["days_of_stock"]))
    
    supplier_totals = {}
    for s in suggestions:
        sid = s.get("default_supplier_id") or "sin_proveedor"
        sname = s.get("default_supplier_name") or "Sin proveedor"
        if sid not in supplier_totals:
            supplier_totals[sid] = {"name": sname, "total": 0, "items": 0}
        supplier_totals[sid]["total"] += s["estimated_total"]
        supplier_totals[sid]["items"] += 1
    
    return {
        "suggestions": suggestions,
        "summary": {
            "total_items": len(suggestions),
            "low_stock_items": len([s for s in suggestions if s["is_low_stock"]]),
            "out_of_stock_items": len([s for s in suggestions if s["is_out_of_stock"]]),
            "estimated_total": round(sum(s.get("estimated_total", 0) for s in suggestions), 2),
            "by_supplier": supplier_totals
        }
    }


@router.get("/purchasing/suggestions")
async def get_purchase_suggestions(
    supplier_id: Optional[str] = Query(None),
    warehouse_id: Optional[str] = Query(None),
    include_ok_stock: bool = Query(False)
):
    """Intelligent shopping assistant - suggests items to reorder based on consumption patterns."""
    return await _get_purchase_suggestions_internal(supplier_id, warehouse_id, include_ok_stock)


@router.post("/purchasing/generate-po")
async def generate_po_from_suggestions(input: GeneratePOFromSuggestionsInput, user=Depends(get_current_user)):
    """Generate a purchase order from shopping assistant suggestions."""
    supplier = await db.suppliers.find_one({"id": input.supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(404, "Proveedor no encontrado")
    
    suggestions_res = await _get_purchase_suggestions_internal(supplier_id=input.supplier_id, include_ok_stock=True)
    suggestions = suggestions_res["suggestions"]
    
    selected = [s for s in suggestions if s["ingredient_id"] in input.ingredient_ids]
    
    if not selected:
        raise HTTPException(400, "No se encontraron ingredientes para la orden")
    
    items = []
    for s in selected:
        items.append({
            "id": gen_id(),
            "ingredient_id": s["ingredient_id"],
            "ingredient_name": s["ingredient_name"],
            "quantity": s["suggested_purchase_units"],
            "unit_price": s["last_unit_price"],
            "received_quantity": 0,
            "actual_unit_price": s["last_unit_price"]
        })
    
    total = sum(i["quantity"] * i["unit_price"] for i in items)
    
    doc = {
        "id": gen_id(),
        "supplier_id": input.supplier_id,
        "supplier_name": supplier["name"],
        "warehouse_id": input.warehouse_id,
        "items": items,
        "total": round(total, 2),
        "notes": input.notes or "Generada desde Asistente de Compras",
        "expected_date": "",
        "status": "draft",
        "created_by": user["name"],
        "created_at": now_iso(),
        "received_at": None,
        "generated_from_assistant": True
    }
    
    await db.purchase_orders.insert_one(doc)
    
    return {
        "ok": True,
        "purchase_order": {k: v for k, v in doc.items() if k != "_id"},
        "items_count": len(items),
        "total": round(total, 2)
    }


@router.get("/purchasing/price-alerts")
async def check_price_alerts():
    """Check for price increases across all ingredients."""
    ingredients = await db.ingredients.find({}, {"_id": 0}).to_list(500)
    
    alerts = []
    
    for ing in ingredients:
        pipeline = [
            {"$match": {"status": {"$in": ["received", "partial"]}, "items.ingredient_id": ing["id"]}},
            {"$unwind": "$items"},
            {"$match": {"items.ingredient_id": ing["id"], "items.received_quantity": {"$gt": 0}}},
            {"$project": {
                "_id": 0,
                "received_at": {"$ifNull": ["$received_at", "$created_at"]},
                "unit_price": {"$ifNull": ["$items.actual_unit_price", "$items.unit_price"]}
            }},
            {"$sort": {"received_at": -1}},
            {"$limit": 5}
        ]
        
        history = await db.purchase_orders.aggregate(pipeline).to_list(5)
        
        if len(history) >= 2:
            latest_price = history[0]["unit_price"]
            previous_price = history[1]["unit_price"]
            
            if previous_price > 0:
                change_pct = ((latest_price - previous_price) / previous_price) * 100
                
                if change_pct > 5:
                    recipes_count = await db.recipes.count_documents({"ingredients.ingredient_id": ing["id"]})
                    
                    alerts.append({
                        "ingredient_id": ing["id"],
                        "ingredient_name": ing["name"],
                        "category": ing.get("category", "general"),
                        "previous_price": round(previous_price, 2),
                        "latest_price": round(latest_price, 2),
                        "change_percentage": round(change_pct, 2),
                        "change_amount": round(latest_price - previous_price, 2),
                        "current_avg_cost": ing.get("avg_cost", 0),
                        "recipes_affected": recipes_count,
                        "purchase_unit": ing.get("purchase_unit", ing.get("unit", "unidad")),
                        "margin_threshold": ing.get("margin_threshold", 30)
                    })
    
    alerts.sort(key=lambda x: x["change_percentage"], reverse=True)
    
    return {
        "alerts": alerts,
        "summary": {
            "total_alerts": len(alerts),
            "avg_increase": round(sum(a["change_percentage"] for a in alerts) / len(alerts), 2) if alerts else 0,
            "total_recipes_affected": len(set(a["ingredient_id"] for a in alerts))
        }
    }


@router.post("/purchasing/recalculate-recipe-margins")
async def recalculate_recipe_margins():
    """Recalculate costs and margins for all recipes based on current ingredient costs."""
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(500)
    products_map = {p["id"]: p for p in await db.products.find({}, {"_id": 0}).to_list(500)}
    
    results = []
    
    for recipe in recipes:
        product = products_map.get(recipe.get("product_id"))
        if not product:
            continue
        
        total_cost = 0
        for ing in recipe.get("ingredients", []):
            ingredient = await db.ingredients.find_one({"id": ing.get("ingredient_id")}, {"_id": 0})
            if not ingredient:
                continue
            
            quantity = ing.get("quantity", 0)
            waste_pct = ing.get("waste_percentage", 0)
            effective_qty = quantity * (1 + waste_pct / 100)
            
            unit_cost = ingredient.get("dispatch_unit_cost", ingredient.get("avg_cost", 0))
            total_cost += unit_cost * effective_qty
        
        yield_qty = recipe.get("yield_quantity", 1) or 1
        cost_per_unit = total_cost / yield_qty
        
        selling_price = product.get("price", 0)
        
        if selling_price > 0:
            margin_amount = selling_price - cost_per_unit
            margin_pct = (margin_amount / selling_price) * 100
        else:
            margin_amount = 0
            margin_pct = 0
        
        margin_threshold = 30
        for ing in recipe.get("ingredients", []):
            ingredient = await db.ingredients.find_one({"id": ing.get("ingredient_id")}, {"_id": 0})
            if ingredient and ingredient.get("margin_threshold"):
                margin_threshold = ingredient.get("margin_threshold")
                break
        
        if margin_pct < margin_threshold:
            status = "critical" if margin_pct < margin_threshold / 2 else "warning"
            suggested_price = cost_per_unit / (1 - margin_threshold / 100) if margin_threshold < 100 else cost_per_unit * 2
        else:
            status = "ok"
            suggested_price = selling_price
        
        await db.recipes.update_one(
            {"id": recipe["id"]},
            {"$set": {
                "calculated_cost": round(cost_per_unit, 2),
                "margin_percentage": round(margin_pct, 2),
                "cost_updated_at": now_iso()
            }}
        )
        
        results.append({
            "recipe_id": recipe["id"],
            "product_id": product["id"],
            "product_name": product.get("name", "?"),
            "cost_per_unit": round(cost_per_unit, 2),
            "selling_price": round(selling_price, 2),
            "margin_amount": round(margin_amount, 2),
            "margin_percentage": round(margin_pct, 2),
            "margin_threshold": margin_threshold,
            "status": status,
            "suggested_price": round(suggested_price, 2) if status != "ok" else None
        })
    
    results.sort(key=lambda x: x["margin_percentage"])
    
    critical = [r for r in results if r["status"] == "critical"]
    warning = [r for r in results if r["status"] == "warning"]
    ok = [r for r in results if r["status"] == "ok"]
    
    return {
        "results": results,
        "summary": {
            "total_recipes": len(results),
            "critical_count": len(critical),
            "warning_count": len(warning),
            "ok_count": len(ok),
            "avg_margin": round(sum(r["margin_percentage"] for r in results) / len(results), 2) if results else 0
        },
        "critical": critical,
        "warning": warning
    }
