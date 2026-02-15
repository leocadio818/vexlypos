"""
Reports Router - Comprehensive reporting system
Contains endpoints for all business reports: sales, inventory, purchasing, audit
"""
from fastapi import APIRouter, Query, Depends, HTTPException
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

router = APIRouter(prefix="/reports", tags=["Reports"])

# Database connection
mongo_url = os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'pos_db')]

def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# ─── SHIFT CLOSE REPORT ───
@router.get("/shift-close")
async def shift_close_report(
    shift_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None)
):
    """Get detailed shift close report"""
    query = {}
    if shift_id:
        query["id"] = shift_id
    elif date:
        query["$or"] = [
            {"opened_at": {"$regex": f"^{date}"}},
            {"closed_at": {"$regex": f"^{date}"}}
        ]
    else:
        # Get today's shifts
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        query["$or"] = [
            {"opened_at": {"$regex": f"^{today}"}},
            {"closed_at": {"$regex": f"^{today}"}}
        ]
    
    shifts = await db.shifts.find(query, {"_id": 0}).sort("opened_at", -1).to_list(50)
    
    result = []
    for shift in shifts:
        shift_data = {
            **shift,
            "duration_hours": 0,
            "transactions_count": shift.get("transactions_count", 0),
            "avg_ticket": 0
        }
        
        # Calculate duration
        if shift.get("opened_at") and shift.get("closed_at"):
            try:
                opened = datetime.fromisoformat(shift["opened_at"].replace("Z", "+00:00"))
                closed = datetime.fromisoformat(shift["closed_at"].replace("Z", "+00:00"))
                duration = (closed - opened).total_seconds() / 3600
                shift_data["duration_hours"] = round(duration, 2)
            except (ValueError, TypeError):
                pass
        
        # Calculate average ticket
        total_sales = shift.get("total_sales", 0)
        bills = shift.get("bills_count", 0) or shift.get("transactions_count", 0)
        if bills > 0:
            shift_data["avg_ticket"] = round(total_sales / bills, 2)
        
        result.append(shift_data)
    
    return result


# ─── CASH CLOSE REPORT ───
@router.get("/cash-close")
async def cash_close_report(date: Optional[str] = Query(None)):
    """Detailed cash register close report with payment method breakdown"""
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Get all paid bills for the date
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(10000)
    day_bills = [b for b in bills if b.get("paid_at", "").startswith(date)]
    
    # Get payment methods
    payment_methods = await db.payment_methods.find({}, {"_id": 0}).to_list(50)
    pm_map = {pm["id"]: pm for pm in payment_methods}
    
    # Aggregate by payment method
    by_payment_method = {}
    for bill in day_bills:
        pm_id = bill.get("payment_method_id", bill.get("payment_method", "cash"))
        pm_name = pm_map.get(pm_id, {}).get("name", pm_id.title())
        is_cash = pm_map.get(pm_id, {}).get("is_cash", pm_id == "cash")
        
        if pm_name not in by_payment_method:
            by_payment_method[pm_name] = {
                "name": pm_name,
                "is_cash": is_cash,
                "count": 0,
                "total": 0,
                "tips": 0
            }
        by_payment_method[pm_name]["count"] += 1
        by_payment_method[pm_name]["total"] += bill.get("total", 0)
        by_payment_method[pm_name]["tips"] += bill.get("propina_legal", 0)
    
    # Get shifts for the day
    shifts = await db.shifts.find({
        "$or": [
            {"opened_at": {"$regex": f"^{date}"}},
            {"closed_at": {"$regex": f"^{date}"}}
        ]
    }, {"_id": 0}).to_list(50)
    
    total_sales = sum(b.get("total", 0) for b in day_bills)
    total_tips = sum(b.get("propina_legal", 0) for b in day_bills)
    total_itbis = sum(b.get("itbis", 0) for b in day_bills)
    cash_total = sum(v["total"] for v in by_payment_method.values() if v["is_cash"])
    card_total = sum(v["total"] for v in by_payment_method.values() if not v["is_cash"])
    
    return {
        "date": date,
        "summary": {
            "total_bills": len(day_bills),
            "total_sales": round(total_sales, 2),
            "total_tips": round(total_tips, 2),
            "total_itbis": round(total_itbis, 2),
            "cash_total": round(cash_total, 2),
            "card_total": round(card_total, 2),
            "subtotal": round(total_sales - total_itbis - total_tips, 2)
        },
        "by_payment_method": list(by_payment_method.values()),
        "shifts": shifts
    }


# ─── TOP PRODUCTS WITH SELECTOR ───
@router.get("/top-products-extended")
async def top_products_extended(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(10, ge=5, le=50)
):
    """Top N products with customizable limit and date range"""
    if not date_from:
        date_from = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not date_to:
        date_to = date_from
    
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(10000)
    filtered_bills = [
        b for b in bills 
        if b.get("paid_at", "")[:10] >= date_from and b.get("paid_at", "")[:10] <= date_to
    ]
    
    product_sales = {}
    for bill in filtered_bills:
        for item in bill.get("items", []):
            name = item.get("product_name", "?")
            if name not in product_sales:
                product_sales[name] = {"name": name, "quantity": 0, "total": 0, "orders": 0}
            product_sales[name]["quantity"] += item.get("quantity", 1)
            product_sales[name]["total"] += item.get("total", 0)
            product_sales[name]["orders"] += 1
    
    sorted_products = sorted(product_sales.values(), key=lambda x: -x["total"])[:limit]
    
    # Calculate sparkline data (daily totals for last 7 days)
    sparkline_data = {}
    for i in range(7):
        day = (datetime.now(timezone.utc) - timedelta(days=6-i)).strftime("%Y-%m-%d")
        day_bills = [b for b in bills if b.get("paid_at", "").startswith(day)]
        for prod in sorted_products:
            if prod["name"] not in sparkline_data:
                sparkline_data[prod["name"]] = []
            day_total = sum(
                item.get("total", 0) 
                for bill in day_bills 
                for item in bill.get("items", []) 
                if item.get("product_name") == prod["name"]
            )
            sparkline_data[prod["name"]].append(round(day_total, 2))
    
    for prod in sorted_products:
        prod["sparkline"] = sparkline_data.get(prod["name"], [])
        prod["total"] = round(prod["total"], 2)
    
    return {
        "date_from": date_from,
        "date_to": date_to,
        "limit": limit,
        "products": sorted_products
    }


# ─── SALES BY TYPE ───
@router.get("/sales-by-type")
async def sales_by_type_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None)
):
    """Sales breakdown by sale type (dine-in, delivery, takeout, etc.)"""
    if not date_from:
        date_from = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not date_to:
        date_to = date_from
    
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(10000)
    filtered_bills = [
        b for b in bills 
        if b.get("paid_at", "")[:10] >= date_from and b.get("paid_at", "")[:10] <= date_to
    ]
    
    # Get sale types
    sale_types = await db.sale_types.find({}, {"_id": 0}).to_list(20)
    st_map = {st["id"]: st["name"] for st in sale_types}
    
    by_type = {}
    for bill in filtered_bills:
        st_id = bill.get("sale_type", "dine_in")
        st_name = st_map.get(st_id, st_id.replace("_", " ").title())
        
        if st_name not in by_type:
            by_type[st_name] = {"name": st_name, "count": 0, "total": 0, "avg_ticket": 0}
        by_type[st_name]["count"] += 1
        by_type[st_name]["total"] += bill.get("total", 0)
    
    for st in by_type.values():
        if st["count"] > 0:
            st["avg_ticket"] = round(st["total"] / st["count"], 2)
        st["total"] = round(st["total"], 2)
    
    return {
        "date_from": date_from,
        "date_to": date_to,
        "types": sorted(by_type.values(), key=lambda x: -x["total"])
    }


# ─── PAYMENT METHODS REPORT ───
@router.get("/payment-methods-breakdown")
async def payment_methods_breakdown(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None)
):
    """Detailed payment methods breakdown with trends"""
    if not date_from:
        date_from = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not date_to:
        date_to = date_from
    
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(10000)
    filtered_bills = [
        b for b in bills 
        if b.get("paid_at", "")[:10] >= date_from and b.get("paid_at", "")[:10] <= date_to
    ]
    
    payment_methods = await db.payment_methods.find({}, {"_id": 0}).to_list(50)
    pm_map = {pm["id"]: pm for pm in payment_methods}
    
    by_method = {}
    for bill in filtered_bills:
        pm_id = bill.get("payment_method_id", bill.get("payment_method", "cash"))
        pm_info = pm_map.get(pm_id, {"name": pm_id.title(), "is_cash": pm_id == "cash"})
        pm_name = pm_info.get("name", pm_id.title())
        
        if pm_name not in by_method:
            by_method[pm_name] = {
                "name": pm_name,
                "is_cash": pm_info.get("is_cash", False),
                "count": 0,
                "total": 0,
                "tips": 0
            }
        by_method[pm_name]["count"] += 1
        by_method[pm_name]["total"] += bill.get("total", 0)
        by_method[pm_name]["tips"] += bill.get("propina_legal", 0)
    
    # Calculate sparklines (last 7 days)
    sparklines = {}
    for i in range(7):
        day = (datetime.now(timezone.utc) - timedelta(days=6-i)).strftime("%Y-%m-%d")
        day_bills = [b for b in bills if b.get("paid_at", "").startswith(day)]
        for method in by_method.keys():
            if method not in sparklines:
                sparklines[method] = []
            method_total = sum(
                b.get("total", 0) for b in day_bills
                if pm_map.get(b.get("payment_method_id", b.get("payment_method")), {}).get("name", "") == method
            )
            sparklines[method].append(round(method_total, 2))
    
    result = []
    total_all = sum(m["total"] for m in by_method.values())
    for method in by_method.values():
        method["sparkline"] = sparklines.get(method["name"], [])
        method["total"] = round(method["total"], 2)
        method["tips"] = round(method["tips"], 2)
        method["percentage"] = round((method["total"] / total_all * 100) if total_all > 0 else 0, 1)
        result.append(method)
    
    return {
        "date_from": date_from,
        "date_to": date_to,
        "methods": sorted(result, key=lambda x: -x["total"]),
        "total": round(total_all, 2)
    }


# ─── VOID/CANCELLATION AUDIT ───
@router.get("/void-audit")
async def void_audit_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None)
):
    """Complete void/cancellation audit with authorizer information"""
    if not date_from:
        date_from = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not date_to:
        date_to = date_from
    
    logs = await db.void_audit_logs.find({}, {"_id": 0}).to_list(5000)
    filtered_logs = [
        log for log in logs
        if log.get("created_at", "")[:10] >= date_from and log.get("created_at", "")[:10] <= date_to
    ]
    
    # Aggregate by reason
    by_reason = {}
    by_user = {}
    by_authorizer = {}
    total_voided = 0
    total_recovered = 0
    
    for log in filtered_logs:
        reason = log.get("reason", "Sin razón")
        value = log.get("total_value", 0)
        if not value:
            value = log.get("unit_price", 0) * log.get("quantity", 1)
        
        total_voided += value
        if log.get("restored_to_inventory"):
            total_recovered += value
        
        # By reason
        if reason not in by_reason:
            by_reason[reason] = {"reason": reason, "count": 0, "total": 0}
        by_reason[reason]["count"] += 1
        by_reason[reason]["total"] += value
        
        # By user who requested
        user_name = log.get("requested_by_name", log.get("user_name", "Desconocido"))
        if user_name not in by_user:
            by_user[user_name] = {"name": user_name, "count": 0, "total": 0}
        by_user[user_name]["count"] += 1
        by_user[user_name]["total"] += value
        
        # By authorizer
        auth_name = log.get("authorized_by_name")
        if auth_name:
            if auth_name not in by_authorizer:
                by_authorizer[auth_name] = {"name": auth_name, "count": 0, "total": 0}
            by_authorizer[auth_name]["count"] += 1
            by_authorizer[auth_name]["total"] += value
    
    return {
        "date_from": date_from,
        "date_to": date_to,
        "summary": {
            "total_count": len(filtered_logs),
            "total_voided": round(total_voided, 2),
            "total_recovered": round(total_recovered, 2),
            "total_loss": round(total_voided - total_recovered, 2)
        },
        "by_reason": sorted(by_reason.values(), key=lambda x: -x["count"]),
        "by_user": sorted(by_user.values(), key=lambda x: -x["count"]),
        "by_authorizer": sorted(by_authorizer.values(), key=lambda x: -x["count"]),
        "logs": filtered_logs[:100]
    }


# ─── INVENTORY LEVELS BY WAREHOUSE ───
@router.get("/inventory-by-warehouse")
async def inventory_by_warehouse_report(warehouse_id: Optional[str] = Query(None)):
    """Inventory levels grouped by warehouse"""
    query = {}
    if warehouse_id:
        query["warehouse_id"] = warehouse_id
    
    stock_docs = await db.stock.find(query, {"_id": 0}).to_list(5000)
    ingredients = await db.ingredients.find({}, {"_id": 0}).to_list(500)
    warehouses = await db.warehouses.find({}, {"_id": 0}).to_list(50)
    
    ing_map = {i["id"]: i for i in ingredients}
    wh_map = {w["id"]: w["name"] for w in warehouses}
    
    by_warehouse = {}
    for stock in stock_docs:
        wh_id = stock.get("warehouse_id")
        wh_name = wh_map.get(wh_id, "Sin almacén")
        ing = ing_map.get(stock.get("ingredient_id"), {})
        
        if wh_name not in by_warehouse:
            by_warehouse[wh_name] = {
                "warehouse_id": wh_id,
                "warehouse_name": wh_name,
                "items": [],
                "total_value": 0,
                "low_stock_count": 0
            }
        
        current = stock.get("current_stock", 0)
        min_stock = ing.get("min_stock", 0)
        avg_cost = ing.get("avg_cost", 0)
        conversion = ing.get("conversion_factor", 1)
        unit_cost = avg_cost / conversion if conversion else 0
        value = current * unit_cost
        
        item = {
            "ingredient_id": ing.get("id"),
            "name": ing.get("name", "?"),
            "unit": ing.get("unit", "unidad"),
            "current_stock": round(current, 2),
            "min_stock": min_stock,
            "avg_cost": round(avg_cost, 2),
            "value": round(value, 2),
            "is_low": current <= min_stock
        }
        by_warehouse[wh_name]["items"].append(item)
        by_warehouse[wh_name]["total_value"] += value
        if current <= min_stock:
            by_warehouse[wh_name]["low_stock_count"] += 1
    
    result = []
    for wh in by_warehouse.values():
        wh["total_value"] = round(wh["total_value"], 2)
        wh["items"] = sorted(wh["items"], key=lambda x: x["name"])
        result.append(wh)
    
    return sorted(result, key=lambda x: x["warehouse_name"])


# ─── TRANSFERS REPORT ───
@router.get("/transfers")
async def transfers_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None)
):
    """Stock transfer history between warehouses"""
    if not date_from:
        date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    transfers = await db.stock_movements.find({
        "type": {"$in": ["transfer_in", "transfer_out"]}
    }, {"_id": 0}).to_list(5000)
    
    filtered = [
        t for t in transfers
        if t.get("created_at", "")[:10] >= date_from and t.get("created_at", "")[:10] <= date_to
    ]
    
    warehouses = await db.warehouses.find({}, {"_id": 0}).to_list(50)
    wh_map = {w["id"]: w["name"] for w in warehouses}
    
    # Group by transfer reference
    by_reference = {}
    for t in filtered:
        ref = t.get("reference_id", t.get("id"))
        if ref not in by_reference:
            by_reference[ref] = {
                "reference_id": ref,
                "created_at": t.get("created_at"),
                "user_name": t.get("user_name", "?"),
                "items": [],
                "from_warehouse": "",
                "to_warehouse": ""
            }
        
        if t["type"] == "transfer_out":
            by_reference[ref]["from_warehouse"] = wh_map.get(t.get("warehouse_id"), "?")
        else:
            by_reference[ref]["to_warehouse"] = wh_map.get(t.get("warehouse_id"), "?")
        
        by_reference[ref]["items"].append({
            "ingredient_name": t.get("ingredient_name", "?"),
            "quantity": abs(t.get("quantity", 0)),
            "type": t["type"]
        })
    
    return {
        "date_from": date_from,
        "date_to": date_to,
        "transfers": sorted(by_reference.values(), key=lambda x: x.get("created_at", ""), reverse=True)
    }


# ─── INVENTORY DIFFERENCES (SHRINKAGE) ───
@router.get("/inventory-differences")
async def inventory_differences_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None)
):
    """Inventory shrinkage and differences report"""
    if not date_from:
        date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    differences = await db.stock_difference_logs.find({}, {"_id": 0}).to_list(5000)
    filtered = [
        d for d in differences
        if d.get("created_at", "")[:10] >= date_from and d.get("created_at", "")[:10] <= date_to
    ]
    
    # Aggregate by reason
    by_reason = {}
    total_shortage = 0
    total_surplus = 0
    total_value = 0
    
    for diff in filtered:
        reason = diff.get("reason", "Sin razón")
        diff_type = diff.get("difference_type", "faltante")
        value = diff.get("value", 0)
        
        if reason not in by_reason:
            by_reason[reason] = {"reason": reason, "count": 0, "value": 0}
        by_reason[reason]["count"] += 1
        by_reason[reason]["value"] += value
        
        if diff_type == "faltante":
            total_shortage += value
        else:
            total_surplus += value
        total_value += value
    
    return {
        "date_from": date_from,
        "date_to": date_to,
        "summary": {
            "total_count": len(filtered),
            "total_shortage": round(total_shortage, 2),
            "total_surplus": round(total_surplus, 2),
            "net_value": round(total_shortage - total_surplus, 2)
        },
        "by_reason": sorted(by_reason.values(), key=lambda x: -x["value"]),
        "details": filtered[:100]
    }


# ─── RECIPES/WASTE REPORT ───
@router.get("/waste-report")
async def waste_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None)
):
    """Waste and spoilage report from stock movements"""
    if not date_from:
        date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    movements = await db.stock_movements.find({
        "type": {"$in": ["waste", "adjustment", "void_restoration"]}
    }, {"_id": 0}).to_list(5000)
    
    filtered = [
        m for m in movements
        if m.get("created_at", "")[:10] >= date_from and m.get("created_at", "")[:10] <= date_to
    ]
    
    # Aggregate
    by_ingredient = {}
    by_reason = {}
    total_waste_value = 0
    
    ingredients = await db.ingredients.find({}, {"_id": 0}).to_list(500)
    ing_map = {i["id"]: i for i in ingredients}
    
    for mov in filtered:
        ing_id = mov.get("ingredient_id")
        ing = ing_map.get(ing_id, {})
        ing_name = ing.get("name", mov.get("ingredient_name", "?"))
        avg_cost = ing.get("avg_cost", 0)
        conversion = ing.get("conversion_factor", 1)
        unit_cost = avg_cost / conversion if conversion else 0
        value = abs(mov.get("quantity", 0)) * unit_cost
        
        # By ingredient
        if ing_name not in by_ingredient:
            by_ingredient[ing_name] = {"name": ing_name, "quantity": 0, "value": 0}
        by_ingredient[ing_name]["quantity"] += abs(mov.get("quantity", 0))
        by_ingredient[ing_name]["value"] += value
        
        # By reason
        reason = mov.get("reason", mov.get("type", "Otro"))
        if reason not in by_reason:
            by_reason[reason] = {"reason": reason, "count": 0, "value": 0}
        by_reason[reason]["count"] += 1
        by_reason[reason]["value"] += value
        
        total_waste_value += value
    
    return {
        "date_from": date_from,
        "date_to": date_to,
        "summary": {
            "total_movements": len(filtered),
            "total_waste_value": round(total_waste_value, 2)
        },
        "by_ingredient": sorted(by_ingredient.values(), key=lambda x: -x["value"])[:20],
        "by_reason": sorted(by_reason.values(), key=lambda x: -x["value"])
    }


# ─── PURCHASE ORDERS REPORT ───
@router.get("/purchase-orders")
async def purchase_orders_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None)
):
    """Purchase orders summary with supplier breakdown"""
    if not date_from:
        date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    query = {}
    if supplier_id:
        query["supplier_id"] = supplier_id
    
    pos = await db.purchase_orders.find(query, {"_id": 0}).to_list(5000)
    filtered = [
        po for po in pos
        if po.get("created_at", "")[:10] >= date_from and po.get("created_at", "")[:10] <= date_to
    ]
    
    # Aggregate
    by_supplier = {}
    by_status = {}
    total_value = 0
    
    for po in filtered:
        supplier = po.get("supplier_name", "Sin proveedor")
        status = po.get("status", "draft")
        value = po.get("total", 0)
        
        # By supplier
        if supplier not in by_supplier:
            by_supplier[supplier] = {"name": supplier, "count": 0, "total": 0}
        by_supplier[supplier]["count"] += 1
        by_supplier[supplier]["total"] += value
        
        # By status
        if status not in by_status:
            by_status[status] = {"status": status, "count": 0, "total": 0}
        by_status[status]["count"] += 1
        by_status[status]["total"] += value
        
        total_value += value
    
    return {
        "date_from": date_from,
        "date_to": date_to,
        "summary": {
            "total_orders": len(filtered),
            "total_value": round(total_value, 2)
        },
        "by_supplier": sorted(by_supplier.values(), key=lambda x: -x["total"]),
        "by_status": list(by_status.values())
    }


# ─── SUPPLIER REPORT ───
@router.get("/by-supplier")
async def supplier_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None)
):
    """Detailed spending by supplier"""
    if not date_from:
        date_from = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    pos = await db.purchase_orders.find({"status": {"$in": ["received", "partial"]}}, {"_id": 0}).to_list(5000)
    filtered = [
        po for po in pos
        if po.get("created_at", "")[:10] >= date_from and po.get("created_at", "")[:10] <= date_to
    ]
    
    suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(100)
    sup_map = {s["id"]: s for s in suppliers}
    
    by_supplier = {}
    for po in filtered:
        sup_id = po.get("supplier_id")
        sup = sup_map.get(sup_id, {})
        sup_name = sup.get("name", po.get("supplier_name", "Sin proveedor"))
        
        if sup_name not in by_supplier:
            by_supplier[sup_name] = {
                "supplier_id": sup_id,
                "name": sup_name,
                "rnc": sup.get("rnc", ""),
                "contact": sup.get("contact_name", ""),
                "orders": 0,
                "total": 0,
                "items_count": 0
            }
        by_supplier[sup_name]["orders"] += 1
        by_supplier[sup_name]["total"] += po.get("total", 0)
        by_supplier[sup_name]["items_count"] += len(po.get("items", []))
    
    total = sum(s["total"] for s in by_supplier.values())
    for sup in by_supplier.values():
        sup["total"] = round(sup["total"], 2)
        sup["percentage"] = round((sup["total"] / total * 100) if total > 0 else 0, 1)
    
    return {
        "date_from": date_from,
        "date_to": date_to,
        "total": round(total, 2),
        "suppliers": sorted(by_supplier.values(), key=lambda x: -x["total"])
    }


# ─── TAX REPORT (ITBIS + PROPINA) ───
@router.get("/taxes")
async def taxes_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None)
):
    """Tax collection report (ITBIS and Legal Tip)"""
    if not date_from:
        date_from = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not date_to:
        date_to = date_from
    
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(10000)
    filtered = [
        b for b in bills
        if b.get("paid_at", "")[:10] >= date_from and b.get("paid_at", "")[:10] <= date_to
    ]
    
    total_subtotal = 0
    total_itbis = 0
    total_tips = 0
    total_sales = 0
    
    # Daily breakdown
    daily = {}
    for bill in filtered:
        date = bill.get("paid_at", "")[:10]
        if date not in daily:
            daily[date] = {"date": date, "subtotal": 0, "itbis": 0, "tips": 0, "total": 0}
        
        subtotal = bill.get("subtotal", bill.get("total", 0) - bill.get("itbis", 0) - bill.get("propina_legal", 0))
        itbis = bill.get("itbis", 0)
        tips = bill.get("propina_legal", 0)
        total = bill.get("total", 0)
        
        daily[date]["subtotal"] += subtotal
        daily[date]["itbis"] += itbis
        daily[date]["tips"] += tips
        daily[date]["total"] += total
        
        total_subtotal += subtotal
        total_itbis += itbis
        total_tips += tips
        total_sales += total
    
    return {
        "date_from": date_from,
        "date_to": date_to,
        "summary": {
            "total_subtotal": round(total_subtotal, 2),
            "total_itbis": round(total_itbis, 2),
            "total_tips": round(total_tips, 2),
            "total_sales": round(total_sales, 2),
            "itbis_rate": 18.0,
            "tip_rate": 10.0
        },
        "daily": sorted(daily.values(), key=lambda x: x["date"], reverse=True)
    }


# ─── PROFIT & LOSS EXTENDED ───
@router.get("/profit-loss")
async def profit_loss_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None)
):
    """Extended profit and loss report"""
    if not date_from:
        date_from = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not date_to:
        date_to = date_from
    
    # Revenue from bills
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(10000)
    filtered_bills = [
        b for b in bills
        if b.get("paid_at", "")[:10] >= date_from and b.get("paid_at", "")[:10] <= date_to
    ]
    
    total_revenue = sum(b.get("total", 0) for b in filtered_bills)
    total_tips = sum(b.get("propina_legal", 0) for b in filtered_bills)
    total_itbis = sum(b.get("itbis", 0) for b in filtered_bills)
    net_revenue = total_revenue - total_tips - total_itbis
    
    # Cost from recipes
    recipes = await db.recipes.find({}, {"_id": 0}).to_list(500)
    recipe_cost_map = {}
    for r in recipes:
        cost = sum(ing.get("cost", 0) * ing.get("quantity", 0) for ing in r.get("ingredients", []))
        recipe_cost_map[r.get("product_name", "")] = cost
    
    total_cogs = 0  # Cost of Goods Sold
    for bill in filtered_bills:
        for item in bill.get("items", []):
            name = item.get("product_name", "")
            qty = item.get("quantity", 1)
            total_cogs += recipe_cost_map.get(name, 0) * qty
    
    # Purchases for period
    pos = await db.purchase_orders.find({"status": {"$in": ["received", "partial"]}}, {"_id": 0}).to_list(5000)
    filtered_pos = [
        po for po in pos
        if po.get("created_at", "")[:10] >= date_from and po.get("created_at", "")[:10] <= date_to
    ]
    total_purchases = sum(po.get("total", 0) for po in filtered_pos)
    
    # Waste
    waste_movements = await db.stock_movements.find({"type": "waste"}, {"_id": 0}).to_list(5000)
    filtered_waste = [
        w for w in waste_movements
        if w.get("created_at", "")[:10] >= date_from and w.get("created_at", "")[:10] <= date_to
    ]
    
    ingredients = await db.ingredients.find({}, {"_id": 0}).to_list(500)
    ing_map = {i["id"]: i for i in ingredients}
    total_waste = 0
    for w in filtered_waste:
        ing = ing_map.get(w.get("ingredient_id"), {})
        unit_cost = ing.get("avg_cost", 0) / (ing.get("conversion_factor", 1) or 1)
        total_waste += abs(w.get("quantity", 0)) * unit_cost
    
    gross_profit = net_revenue - total_cogs
    gross_margin = (gross_profit / net_revenue * 100) if net_revenue > 0 else 0
    
    return {
        "date_from": date_from,
        "date_to": date_to,
        "revenue": {
            "gross_sales": round(total_revenue, 2),
            "tips_collected": round(total_tips, 2),
            "tax_collected": round(total_itbis, 2),
            "net_revenue": round(net_revenue, 2)
        },
        "costs": {
            "cost_of_goods_sold": round(total_cogs, 2),
            "purchases": round(total_purchases, 2),
            "waste_loss": round(total_waste, 2)
        },
        "profit": {
            "gross_profit": round(gross_profit, 2),
            "gross_margin_pct": round(gross_margin, 1)
        },
        "bills_count": len(filtered_bills)
    }


# ─── DAILY SALES SPARKLINES ───
@router.get("/daily-sparklines")
async def daily_sparklines(days: int = Query(7, ge=1, le=30)):
    """Get daily sales sparkline data for last N days"""
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(10000)
    
    result = []
    for i in range(days):
        day = (datetime.now(timezone.utc) - timedelta(days=days-1-i)).strftime("%Y-%m-%d")
        day_bills = [b for b in bills if b.get("paid_at", "").startswith(day)]
        total = sum(b.get("total", 0) for b in day_bills)
        result.append({
            "date": day,
            "day_name": ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"][datetime.strptime(day, "%Y-%m-%d").weekday()],
            "total": round(total, 2),
            "bills": len(day_bills)
        })
    
    return result


# ─── HOURLY SALES FOR RANGE ───
@router.get("/hourly-sales")
async def hourly_sales_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None)
):
    """Hourly sales distribution"""
    if not date_from:
        date_from = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not date_to:
        date_to = date_from
    
    bills = await db.bills.find({"status": "paid"}, {"_id": 0}).to_list(10000)
    filtered = [
        b for b in bills
        if b.get("paid_at", "")[:10] >= date_from and b.get("paid_at", "")[:10] <= date_to
    ]
    
    hourly = {}
    for h in range(24):
        hourly[f"{h:02d}"] = {"hour": f"{h:02d}:00", "total": 0, "bills": 0}
    
    for bill in filtered:
        paid_at = bill.get("paid_at", "")
        if "T" in paid_at:
            hour = paid_at.split("T")[1][:2]
            if hour in hourly:
                hourly[hour]["total"] += bill.get("total", 0)
                hourly[hour]["bills"] += 1
    
    return list(hourly.values())
