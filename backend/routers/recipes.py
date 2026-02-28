"""
Recipes Router
Contains endpoints for recipes and recipe management with full audit trail.
"""
from fastapi import APIRouter, HTTPException, Query, Request
import uuid
import logging
import os
import jwt
from datetime import datetime, timezone

from models.database import db
from models.schemas import RecipeInput

router = APIRouter(tags=["Recipes"])
logger = logging.getLogger("recipes")
JWT_SECRET = os.environ.get('JWT_SECRET', 'fallback_secret')

# ─── UTILITY FUNCTIONS ───
def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def get_user_from_request(request: Request) -> tuple:
    user_id, user_name = "", "Sistema"
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
            user_id = payload.get("user_id", "")
            user_name = payload.get("name", "Sistema")
        except:
            pass
    return user_id, user_name

def diff_ingredients(old_ings, new_ings):
    """Compare two ingredient lists and return human-readable changes."""
    changes = []
    old_map = {i.get("ingredient_id", ""): i for i in (old_ings or [])}
    new_map = {i.get("ingredient_id", ""): i for i in (new_ings or [])}

    for ing_id, new_ing in new_map.items():
        name = new_ing.get("ingredient_name", "?")
        if ing_id not in old_map:
            changes.append({"type": "added", "detail": f"Agregado: {name} ({new_ing.get('quantity',0)} {new_ing.get('unit','')})"})
        else:
            old_ing = old_map[ing_id]
            if old_ing.get("quantity") != new_ing.get("quantity"):
                changes.append({"type": "modified", "detail": f"{name}: cantidad {old_ing.get('quantity',0)} → {new_ing.get('quantity',0)}"})
            if old_ing.get("waste_percentage") != new_ing.get("waste_percentage"):
                changes.append({"type": "modified", "detail": f"{name}: merma {old_ing.get('waste_percentage',0)}% → {new_ing.get('waste_percentage',0)}%"})
            if old_ing.get("unit") != new_ing.get("unit"):
                changes.append({"type": "modified", "detail": f"{name}: unidad {old_ing.get('unit','')} → {new_ing.get('unit','')}"})

    for ing_id, old_ing in old_map.items():
        if ing_id not in new_map:
            changes.append({"type": "removed", "detail": f"Removido: {old_ing.get('ingredient_name', '?')}"})

    return changes

async def log_recipe_audit(recipe_id, recipe_name, action, user_id, user_name, changes=None, old_data=None, new_data=None):
    """Log a recipe change to the audit trail."""
    doc = {
        "id": gen_id(),
        "recipe_id": recipe_id,
        "recipe_name": recipe_name,
        "action": action,
        "changes": changes or [],
        "user_id": user_id,
        "user_name": user_name,
        "timestamp": now_iso(),
    }
    if old_data:
        doc["snapshot_before"] = {
            "ingredients": old_data.get("ingredients", []),
            "yield_quantity": old_data.get("yield_quantity", 1),
            "notes": old_data.get("notes", ""),
        }
    if new_data:
        doc["snapshot_after"] = {
            "ingredients": new_data.get("ingredients", []),
            "yield_quantity": new_data.get("yield_quantity", 1),
            "notes": new_data.get("notes", ""),
        }
    await db.recipe_audit_logs.insert_one(doc)


# ═══════════════════════════════════════════════════════════════════════════════
# ─── RECIPES ───
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/recipes")
async def list_recipes():
    return await db.recipes.find({}, {"_id": 0}).to_list(500)

@router.get("/recipes/product/{product_id}")
async def get_recipe(product_id: str):
    recipe = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    return recipe or {}

@router.post("/recipes")
async def create_recipe(input: RecipeInput, request: Request):
    user_id, user_name = get_user_from_request(request)

    ingredients = []
    for i in input.ingredients:
        ing_data = i.model_dump()
        ing_data["id"] = gen_id()
        if not ing_data.get("ingredient_name"):
            ing = await db.ingredients.find_one({"id": ing_data["ingredient_id"]}, {"_id": 0})
            ing_data["ingredient_name"] = ing["name"] if ing else "?"
        ingredients.append(ing_data)

    doc = {
        "id": gen_id(), "product_id": input.product_id, "product_name": input.product_name,
        "ingredients": ingredients, "yield_quantity": input.yield_quantity,
        "notes": input.notes, "is_subrecipe": input.is_subrecipe,
        "produces_ingredient_id": input.produces_ingredient_id,
        "created_at": now_iso()
    }

    # For sub-recipes, check by produces_ingredient_id; for products, by product_id
    existing = None
    if input.produces_ingredient_id:
        existing = await db.recipes.find_one({"produces_ingredient_id": input.produces_ingredient_id}, {"_id": 0})
    elif input.product_id:
        existing = await db.recipes.find_one({
            "product_id": input.product_id,
            "$or": [{"is_subrecipe": {"$ne": True}}, {"is_subrecipe": {"$exists": False}}]
        }, {"_id": 0})

    if existing:
        logger.info(f"[RECIPE UPSERT] Updating existing recipe id={existing['id']} name={existing.get('product_name','')}")
        # Build change list
        changes = diff_ingredients(existing.get("ingredients", []), ingredients)
        if existing.get("yield_quantity") != input.yield_quantity:
            changes.append({"type": "modified", "detail": f"Rendimiento: {existing.get('yield_quantity',1)} → {input.yield_quantity}"})
        if existing.get("notes", "") != (input.notes or ""):
            changes.append({"type": "modified", "detail": "Notas actualizadas"})

        await db.recipes.update_one(
            {"id": existing["id"]},
            {"$set": {
                "product_id": input.product_id, "product_name": input.product_name,
                "ingredients": ingredients, "yield_quantity": input.yield_quantity,
                "notes": input.notes, "is_subrecipe": input.is_subrecipe,
                "produces_ingredient_id": input.produces_ingredient_id
            }}
        )
        updated = await db.recipes.find_one({"id": existing["id"]}, {"_id": 0})
        await log_recipe_audit(existing["id"], input.product_name, "updated", user_id, user_name, changes, existing, updated)
        return updated

    logger.info(f"[RECIPE CREATE] New recipe: name={input.product_name}, is_sub={input.is_subrecipe}")
    await db.recipes.insert_one(doc)
    result = {k: v for k, v in doc.items() if k != "_id"}
    await log_recipe_audit(doc["id"], input.product_name, "created", user_id, user_name,
        [{"type": "created", "detail": f"Receta creada con {len(ingredients)} ingrediente(s)"}],
        None, result)
    return result

@router.delete("/recipes/{rid}")
async def delete_recipe(rid: str, request: Request, force: bool = Query(False)):
    recipe = await db.recipes.find_one({"id": rid}, {"_id": 0})
    if not recipe:
        return {"ok": True}

    # SAFETY: Protect sub-recipe definitions from accidental deletion
    if recipe.get("is_subrecipe") and recipe.get("produces_ingredient_id") and not force:
        raise HTTPException(
            400,
            f"Esta receta define la producción de una sub-receta ({recipe.get('product_name','')}). "
            "Elimínala desde la pestaña Producción si realmente deseas borrarla."
        )

    user_id, user_name = get_user_from_request(request)
    logger.info(f"[RECIPE DELETE] Deleting: {recipe.get('product_name','')} (id={rid})")
    await db.recipes.delete_one({"id": rid})

    await log_recipe_audit(rid, recipe.get("product_name", "?"), "deleted", user_id, user_name,
        [{"type": "deleted", "detail": f"Receta eliminada ({len(recipe.get('ingredients',[]))} ingredientes)"}],
        recipe, None)
    return {"ok": True}

@router.put("/recipes/{rid}")
async def update_recipe(rid: str, input: RecipeInput, request: Request):
    existing = await db.recipes.find_one({"id": rid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Receta no encontrada")

    user_id, user_name = get_user_from_request(request)

    ingredients = []
    for i in input.ingredients:
        ing_data = i.model_dump()
        ing_data["id"] = ing_data.get("id") or gen_id()
        if not ing_data.get("ingredient_name"):
            ing = await db.ingredients.find_one({"id": ing_data["ingredient_id"]}, {"_id": 0})
            ing_data["ingredient_name"] = ing["name"] if ing else "?"
        ingredients.append(ing_data)

    # Build change list
    changes = diff_ingredients(existing.get("ingredients", []), ingredients)
    if existing.get("yield_quantity") != input.yield_quantity:
        changes.append({"type": "modified", "detail": f"Rendimiento: {existing.get('yield_quantity',1)} → {input.yield_quantity}"})
    if existing.get("product_name", "") != input.product_name:
        changes.append({"type": "modified", "detail": f"Nombre: {existing.get('product_name','')} → {input.product_name}"})
    if existing.get("notes", "") != (input.notes or ""):
        changes.append({"type": "modified", "detail": "Notas actualizadas"})

    logger.info(f"[RECIPE UPDATE] id={rid}, name={input.product_name}")
    await db.recipes.update_one(
        {"id": rid},
        {"$set": {
            "product_id": input.product_id,
            "product_name": input.product_name,
            "ingredients": ingredients,
            "yield_quantity": input.yield_quantity,
            "notes": input.notes,
            "is_subrecipe": input.is_subrecipe,
            "produces_ingredient_id": input.produces_ingredient_id
        }}
    )
    updated = await db.recipes.find_one({"id": rid}, {"_id": 0})
    await log_recipe_audit(rid, input.product_name, "updated", user_id, user_name, changes, existing, updated)
    return updated

@router.delete("/recipes/product/{product_id}")
async def delete_recipe_by_product(product_id: str, request: Request):
    if not product_id:
        raise HTTPException(400, "product_id es requerido")
    recipe = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    if recipe and recipe.get("is_subrecipe"):
        raise HTTPException(400, "No se puede eliminar una receta de sub-receta por este medio")

    user_id, user_name = get_user_from_request(request)
    logger.info(f"[RECIPE DELETE BY PRODUCT] product_id={product_id}")
    await db.recipes.delete_one({"product_id": product_id, "is_subrecipe": {"$ne": True}})

    if recipe:
        await log_recipe_audit(recipe.get("id",""), recipe.get("product_name","?"), "deleted", user_id, user_name,
            [{"type": "deleted", "detail": "Eliminada por eliminación de producto"}], recipe, None)
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# ─── RECIPE AUDIT HISTORY ───
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/recipes/{rid}/history")
async def get_recipe_history(rid: str, limit: int = Query(50)):
    """Get full audit history for a recipe."""
    logs = await db.recipe_audit_logs.find(
        {"recipe_id": rid}, {"_id": 0}
    ).sort("timestamp", -1).to_list(limit)
    return logs

@router.get("/recipes/history/all")
async def get_all_recipe_history(
    recipe_name: str = Query(None),
    action: str = Query(None),
    user_name: str = Query(None),
    limit: int = Query(100)
):
    """Get audit history across all recipes with optional filters."""
    query = {}
    if recipe_name:
        query["recipe_name"] = {"$regex": recipe_name, "$options": "i"}
    if action:
        query["action"] = action
    if user_name:
        query["user_name"] = {"$regex": user_name, "$options": "i"}
    logs = await db.recipe_audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return logs
