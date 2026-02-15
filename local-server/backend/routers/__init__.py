from .auth import router as auth_router
from .purchasing import router as purchasing_router
from .inventory import router as inventory_router
from .recipes import router as recipes_router
from .reports import router as reports_router

__all__ = [
    "auth_router",
    "purchasing_router", 
    "inventory_router",
    "recipes_router",
    "reports_router"
]
