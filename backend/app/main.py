from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.routers import (
    auth_router,
    org_units_router,
    budgets_router,
    job_catalog_router,
    requisitions_router,
    offers_router,
    admin_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title="HR Budget Planner API",
    description="API for HR Budget Planning and Offer Gate Management",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(org_units_router)
app.include_router(budgets_router)
app.include_router(job_catalog_router)
app.include_router(requisitions_router)
app.include_router(offers_router)
app.include_router(admin_router)


@app.get("/health")
async def health():
    return {"status": "healthy"}


# Serve frontend static files in production
STATIC_DIR = Path("/app/static")
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = STATIC_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(STATIC_DIR / "index.html"))
else:
    @app.get("/")
    async def root():
        return {"message": "HR Budget Planner API", "version": "1.0.0"}
