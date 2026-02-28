"""
Recipes Router
Contains endpoints for recipes and recipe management.
"""
from fastapi import APIRouter, HTTPException, Query
import uuid
import logging
from datetime import datetime, timezone

from models.database import db
from models.schemas import RecipeInput

router = APIRouter(tags=["Recipes"])
logger = logging.getLogger("recipes")

# ─── UTILITY FUNCTIONS ───
def gen_id() -> str:
    return str(uuid.uuid4())

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
async def create_recipe(input: RecipeInput):
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
        # SAFETY: Only match product recipes, never sub-recipes
        existing = await db.recipes.find_one({
            "product_id": input.product_id,
            "$or": [{"is_subrecipe": {"$ne": True}}, {"is_subrecipe": {"$exists": False}}]
        }, {"_id": 0})

    if existing:
        logger.info(f"[RECIPE UPSERT] Updating existing recipe id={existing['id']} name={existing.get('product_name','')}")
        await db.recipes.update_one(
            {"id": existing["id"]}, 
            {"$set": {
                "product_id": input.product_id, "product_name": input.product_name,
                "ingredients": ingredients, "yield_quantity": input.yield_quantity, 
                "notes": input.notes, "is_subrecipe": input.is_subrecipe,
                "produces_ingredient_id": input.produces_ingredient_id
            }}
        )
        return await db.recipes.find_one({"id": existing["id"]}, {"_id": 0})
    
    logger.info(f"[RECIPE CREATE] New recipe: name={input.product_name}, is_sub={input.is_subrecipe}, produces={input.produces_ingredient_id}")
    await db.recipes.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.delete("/recipes/{rid}")
async def delete_recipe(rid: str, force: bool = Query(False)):
    recipe = await db.recipes.find_one({"id": rid}, {"_id": 0})
    if not recipe:
        return {"ok": True}
    
    # SAFETY: Protect sub-recipe definitions from accidental deletion
    if recipe.get("is_subrecipe") and recipe.get("produces_ingredient_id") and not force:
        logger.warning(f"[RECIPE DELETE BLOCKED] Attempted to delete sub-recipe definition: {recipe.get('product_name','')} (id={rid})")
        raise HTTPException(
            400,
            f"Esta receta define la producción de una sub-receta ({recipe.get('product_name','')}). "
            "Elimínala desde la pestaña Producción si realmente deseas borrarla."
        )
    
    logger.info(f"[RECIPE DELETE] Deleting: {recipe.get('product_name','')} (id={rid}, is_sub={recipe.get('is_subrecipe')}, produces={recipe.get('produces_ingredient_id','')})")
    await db.recipes.delete_one({"id": rid})
    return {"ok": True}

@router.put("/recipes/{rid}")
async def update_recipe(rid: str, input: RecipeInput):
    existing = await db.recipes.find_one({"id": rid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Receta no encontrada")
    ingredients = []
    for i in input.ingredients:
        ing_data = i.model_dump()
        ing_data["id"] = ing_data.get("id") or gen_id()
        if not ing_data.get("ingredient_name"):
            ing = await db.ingredients.find_one({"id": ing_data["ingredient_id"]}, {"_id": 0})
            ing_data["ingredient_name"] = ing["name"] if ing else "?"
        ingredients.append(ing_data)
    
    logger.info(f"[RECIPE UPDATE] id={rid}, name={input.product_name}, is_sub={input.is_subrecipe}")
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
    return await db.recipes.find_one({"id": rid}, {"_id": 0})

@router.delete("/recipes/product/{product_id}")
async def delete_recipe_by_product(product_id: str):
    # SAFETY: Never delete sub-recipe definitions through this endpoint
    if not product_id:
        raise HTTPException(400, "product_id es requerido")
    recipe = await db.recipes.find_one({"product_id": product_id}, {"_id": 0})
    if recipe and recipe.get("is_subrecipe"):
        logger.warning(f"[RECIPE DELETE BY PRODUCT BLOCKED] Attempted to delete sub-recipe via product endpoint: {recipe.get('product_name','')}")
        raise HTTPException(400, "No se puede eliminar una receta de sub-receta por este medio")
    logger.info(f"[RECIPE DELETE BY PRODUCT] product_id={product_id}")
    await db.recipes.delete_one({"product_id": product_id, "is_subrecipe": {"$ne": True}})
    return {"ok": True}
