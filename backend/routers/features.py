"""
VexlyPOS — Feature Flags Module
Provides a centralized way to expose/gate premium features per tenant.

Flags are stored in `system_config` as fields with prefix `feature_`.
Example: `feature_email_marketing: true` in system_config enables email
marketing broadcast to customers.

Adding a new flag requires ONLY adding an entry in `FEATURE_FLAGS` below.
The frontend receives the full map from GET /api/features and decides
UI visibility. Backend endpoints that gate a feature should import
`is_feature_enabled(flag_name)` for enforcement.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from routers.auth import get_current_user

router = APIRouter(tags=["features"])

db = None


def set_db(database):
    global db
    db = database


# Registry of known feature flags. Each entry maps
# frontend_key (returned in /api/features) -> system_config field name.
# Default for missing fields is always False (features off unless enabled).
FEATURE_FLAGS = {
    "email_marketing": "feature_email_marketing",
    # Future flags (add here — frontend auto-reads):
    # "inventory": "feature_inventory",
    # "reservations": "feature_reservations",
    # "loyalty": "feature_loyalty",
    # "promotions": "feature_promotions",
}


async def _load_flags() -> dict:
    """Read the dedicated features doc in system_config and return the public flag map.

    Storage contract: a single document in `system_config` collection with
    `id: "features"` holds the feature_* fields. If the doc is missing, all
    flags default to False.
    """
    doc = await db.system_config.find_one({"id": "features"}, {"_id": 0}) or {}
    return {key: bool(doc.get(field, False)) for key, field in FEATURE_FLAGS.items()}


async def is_feature_enabled(flag_key: str) -> bool:
    """Helper for gated endpoints. Returns False if flag is unknown."""
    if flag_key not in FEATURE_FLAGS:
        return False
    flags = await _load_flags()
    return flags.get(flag_key, False)


async def require_feature(flag_key: str, detail: str = None) -> None:
    """Raise HTTP 403 if the feature is disabled. Use as a dependency or inline."""
    if not await is_feature_enabled(flag_key):
        raise HTTPException(
            status_code=403,
            detail=detail or "Esta función no está habilitada para su plan. Contacte a soporte para activarla.",
        )


@router.get("/features")
async def get_features(user: dict = Depends(get_current_user)):
    """Return the full map of feature flags for the current tenant.

    Any authenticated user can read this (the UI needs it to show/hide
    buttons). Mutations happen server-side in system_config by admins
    (or Emergent support).
    """
    return await _load_flags()


class UpdateFeaturesInput(BaseModel):
    """Partial update: only the keys included will be mutated."""
    email_marketing: bool | None = None


ADMIN_ROLES = {"admin", "owner", "propietario"}


async def _require_super_admin(user_payload: dict) -> None:
    """Require the caller to be a super_admin (Emergent/SaaS provider).
    
    Super admin is an explicit boolean flag on the user document,
    set manually by the SaaS provider (not the restaurant admin).
    Regular restaurant admins CANNOT toggle feature flags.
    """
    user_id = user_payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="No autenticado")
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "is_super_admin": 1})
    if not (u and u.get("is_super_admin") is True):
        raise HTTPException(status_code=403, detail="Solo super administradores pueden modificar feature flags")


@router.put("/features")
async def update_features(input: UpdateFeaturesInput, user: dict = Depends(get_current_user)):
    """SUPER-admin-only endpoint to toggle feature flags.

    Only users with `is_super_admin: true` in the users collection can mutate.
    This separates the SaaS provider (Emergent) from restaurant-level admins
    who cannot self-enable premium features.
    """
    await _require_super_admin(user)

    update_fields = {}
    data = input.model_dump(exclude_none=True)
    for frontend_key, field in FEATURE_FLAGS.items():
        if frontend_key in data:
            update_fields[field] = bool(data[frontend_key])

    if not update_fields:
        return await _load_flags()

    await db.system_config.update_one(
        {"id": "features"},
        {"$set": {"id": "features", **update_fields}},
        upsert=True,
    )
    return await _load_flags()
