"""
Combos Router — CRUD for product bundles (fixed/configurable combos and packages).
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone

from utils.helpers import gen_id
from routers.auth import get_current_user, get_permissions

router = APIRouter(tags=["Combos"])
db = None


def set_db(database):
    global db
    db = database


async def _require_manage(user):
    """manage_promotions governs combos too (per spec)."""
    db_user = await db.users.find_one({"id": user.get("user_id")}, {"_id": 0, "role": 1, "permissions": 1})
    role = (db_user or {}).get("role", user.get("role", "waiter"))
    perms = get_permissions(role, (db_user or {}).get("permissions", {}))
    if not perms.get("manage_promotions", False):
        raise HTTPException(status_code=403, detail="No tienes permiso para gestionar combos")


def _validate_combo_input(input: dict):
    if not (input.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="Nombre requerido")
    if input.get("combo_type") not in ("fixed", "configurable"):
        raise HTTPException(status_code=400, detail="combo_type inválido")
    if input.get("pricing_type") not in ("fixed_price", "discount_percentage", "discount_amount"):
        raise HTTPException(status_code=400, detail="pricing_type inválido")
    groups = input.get("groups") or []
    if not isinstance(groups, list) or len(groups) == 0:
        raise HTTPException(status_code=400, detail="Debe tener al menos 1 grupo de items")
    for g in groups:
        if not (g.get("name") or "").strip():
            raise HTTPException(status_code=400, detail="Cada grupo requiere un nombre")
        items = g.get("items") or []
        if len(items) == 0:
            raise HTTPException(status_code=400, detail=f"El grupo '{g.get('name')}' no tiene productos")


def _normalize_combo_doc(input: dict, user_id: str, existing_id: str = None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    groups_out = []
    for gi, g in enumerate(input.get("groups") or []):
        items_out = []
        for ii, it in enumerate(g.get("items") or []):
            items_out.append({
                "product_id": it.get("product_id", ""),
                "product_name": it.get("product_name", ""),
                "is_default": bool(it.get("is_default", False)),
                "price_override": (float(it["price_override"]) if it.get("price_override") not in (None, "", False) else None),
                "sort_order": int(it.get("sort_order", ii)),
            })
        groups_out.append({
            "id": g.get("id") or gen_id(),
            "name": (g.get("name") or "").strip(),
            "min_selections": int(g.get("min_selections", 1)),
            "max_selections": int(g.get("max_selections", 1)),
            "sort_order": int(g.get("sort_order", gi)),
            "items": items_out,
        })

    doc = {
        "id": existing_id or gen_id(),
        "name": input.get("name", "").strip(),
        "description": input.get("description", ""),
        "image_url": input.get("image_url", ""),
        "combo_type": input.get("combo_type"),
        "is_active": bool(input.get("is_active", True)),
        "pricing_type": input.get("pricing_type"),
        "price": float(input.get("price", 0) or 0),
        "discount_value": float(input.get("discount_value", 0) or 0),
        "groups": groups_out,
        "category_id": input.get("category_id") or None,
        "available_days": input.get("available_days") or None,
        "available_start_time": input.get("available_start_time") or None,
        "available_end_time": input.get("available_end_time") or None,
        "min_people": input.get("min_people") or None,
        "max_people": input.get("max_people") or None,
        "created_by": user_id,
        "created_at": now,
        "updated_at": now,
    }
    return doc


@router.get("/combos")
async def list_combos(user=Depends(get_current_user)):
    """List all combos (for management)."""
    return await db.combos.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.get("/combos/active")
async def list_active_combos(user=Depends(get_current_user)):
    """List currently active combos (for OrderScreen)."""
    return await db.combos.find({"is_active": True}, {"_id": 0}).sort("name", 1).to_list(500)


@router.post("/combos")
async def create_combo(input: dict, user=Depends(get_current_user)):
    await _require_manage(user)
    _validate_combo_input(input)
    doc = _normalize_combo_doc(input, user.get("user_id"))
    await db.combos.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.patch("/combos/{combo_id}")
async def update_combo(combo_id: str, input: dict, user=Depends(get_current_user)):
    await _require_manage(user)
    existing = await db.combos.find_one({"id": combo_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Combo no encontrado")
    # Merge only provided fields
    merged = {**existing, **{k: v for k, v in input.items() if k not in ("id", "_id", "created_at", "created_by")}}
    if any(k in input for k in ("name", "combo_type", "pricing_type", "groups")):
        _validate_combo_input(merged)
    doc = _normalize_combo_doc(merged, existing.get("created_by", user.get("user_id")), combo_id)
    doc["created_at"] = existing.get("created_at", doc["created_at"])  # preserve
    doc["created_by"] = existing.get("created_by", doc["created_by"])
    await db.combos.replace_one({"id": combo_id}, doc)
    return {k: v for k, v in doc.items() if k != "_id"}


@router.delete("/combos/{combo_id}")
async def delete_combo(combo_id: str, user=Depends(get_current_user)):
    await _require_manage(user)
    res = await db.combos.delete_one({"id": combo_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Combo no encontrado")
    return {"ok": True}


# ─── Helper for orders: expand combo into items ───
async def expand_combo_to_items(combo_id: str, selections: dict = None) -> dict:
    """
    Returns { parent_item, child_items, total_price } to insert into an order.
    selections: {group_id: [product_id, ...]} for configurable combos.
    For fixed combos, selections is auto-derived from defaults or first item of each group.
    """
    combo = await db.combos.find_one({"id": combo_id}, {"_id": 0})
    if not combo or not combo.get("is_active"):
        raise HTTPException(status_code=404, detail="Combo no disponible")

    selections = selections or {}
    chosen_items = []  # [(product_id, product_name, price_override, group_name)]
    extras_total = 0.0

    for g in combo.get("groups", []):
        gid = g.get("id")
        group_name = g.get("name", "")
        sel_ids = selections.get(gid) or []

        if combo["combo_type"] == "fixed":
            # All items in group are included
            for it in g.get("items", []):
                po = it.get("price_override")
                if po:
                    extras_total += float(po)
                chosen_items.append((it["product_id"], it["product_name"], po, group_name))
        else:  # configurable
            if not sel_ids:
                # Use defaults if not specified
                defaults = [it for it in g.get("items", []) if it.get("is_default")]
                if len(defaults) >= g.get("min_selections", 1):
                    sel_ids = [it["product_id"] for it in defaults]
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Selecciona al menos {g.get('min_selections', 1)} opción en '{group_name}'"
                    )
            # Validate min/max
            mn = g.get("min_selections", 1)
            mx = g.get("max_selections", 1)
            if len(sel_ids) < mn or len(sel_ids) > mx:
                raise HTTPException(
                    status_code=400,
                    detail=f"Grupo '{group_name}': elige entre {mn} y {mx} opciones"
                )
            for pid in sel_ids:
                match = next((it for it in g.get("items", []) if it["product_id"] == pid), None)
                if not match:
                    raise HTTPException(status_code=400, detail=f"Producto {pid} no pertenece al grupo")
                po = match.get("price_override")
                if po:
                    extras_total += float(po)
                chosen_items.append((match["product_id"], match["product_name"], po, group_name))

    # Compute parent price
    if combo.get("pricing_type") == "fixed_price":
        total = float(combo.get("price", 0)) + extras_total
    else:
        # discount_percentage or discount_amount — need sum of original prices
        product_ids = [ci[0] for ci in chosen_items]
        prods = await db.products.find({"id": {"$in": product_ids}}, {"_id": 0, "id": 1, "price": 1}).to_list(500)
        prod_price_map = {p["id"]: float(p.get("price", 0) or 0) for p in prods}
        sum_items = sum(prod_price_map.get(pid, 0) for pid in product_ids) + extras_total
        if combo.get("pricing_type") == "discount_percentage":
            total = sum_items * (1 - float(combo.get("discount_value", 0)) / 100.0)
        else:  # discount_amount
            total = max(0.0, sum_items - float(combo.get("discount_value", 0)))

    return {
        "combo_id": combo_id,
        "combo_name": combo["name"],
        "total_price": round(total, 2),
        "child_items": chosen_items,  # list of (product_id, name, extra_price, group_name)
    }
