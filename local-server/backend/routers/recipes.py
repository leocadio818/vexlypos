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
        "notes": input.notes, "created_at": now_iso()
    }
    existing = await db.recipes.find_one({"product_id": input.product_id})
    if existing:
        await db.recipes.update_one(
            {"product_id": input.product_id}, 
            {"$set": {"ingredients": ingredients, "yield_quantity": input.yield_quantity, "notes": input.notes}}
        )
        return await db.recipes.find_one({"product_id": input.product_id}, {"_id": 0})
    await db.recipes.insert_one(doc)
    return {k: v for k, v in doc.items() if k != "_id"}

@router.delete("/recipes/{rid}")
async def delete_recipe(rid: str):
    await db.recipes.delete_one({"id": rid})
    return {"ok": True}

@router.delete("/recipes/product/{product_id}")
async def delete_recipe_by_product(product_id: str):
    await db.recipes.delete_one({"product_id": product_id})
    return {"ok": True}
