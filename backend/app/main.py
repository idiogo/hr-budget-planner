from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    allow_origins=settings.backend_cors_origins,
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


@app.get("/")
async def root():
    return {"message": "HR Budget Planner API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
