from app.routers.auth import router as auth_router
from app.routers.org_units import router as org_units_router
from app.routers.budgets import router as budgets_router
from app.routers.job_catalog import router as job_catalog_router
from app.routers.requisitions import router as requisitions_router
from app.routers.offers import router as offers_router
from app.routers.admin import router as admin_router

__all__ = [
    "auth_router",
    "org_units_router",
    "budgets_router",
    "job_catalog_router",
    "requisitions_router",
    "offers_router",
    "admin_router",
]
