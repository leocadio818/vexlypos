"""
Recipes Router
Contains endpoints for recipes and recipe management.
"""
from fastapi import APIRouter, HTTPException
import uuid
from datetime import datetime, timezone

from models.database import db
from models.schemas import RecipeInput

router = APIRouter(tags=["Recipes"])

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
    return await db.recipes.find({}, {"_id": 0}).to_list(200)

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
        # Get ingredient name if not provided
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
        existing = await db.recipes.find_one({"product_id": input.product_id}, {"_id": 0})
    if existing:
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
    await db.recipes.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.delete("/recipes/{rid}")
async def delete_recipe(rid: str):
    # Log which recipe is being deleted for debugging
    recipe = await db.recipes.find_one({"id": rid}, {"_id": 0})
    if recipe:
        print(f"[RECIPE DELETE] Deleting recipe: {recipe.get('product_name','')} (id={rid}, produces={recipe.get('produces_ingredient_id','')})")
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
    await db.recipes.delete_one({"product_id": product_id})
    return {"ok": True}
