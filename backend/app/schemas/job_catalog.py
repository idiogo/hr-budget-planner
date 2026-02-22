import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class JobCatalogBase(BaseModel):
    job_family: str
    level: str
    title: str
    monthly_cost: Decimal
    hierarchy_level: int = 100
    currency: str = "BRL"


class JobCatalogCreate(JobCatalogBase):
    pass


class JobCatalogUpdate(BaseModel):
    job_family: Optional[str] = None
    level: Optional[str] = None
    title: Optional[str] = None
    monthly_cost: Optional[Decimal] = None
    hierarchy_level: Optional[int] = None
    currency: Optional[str] = None
    active: Optional[bool] = None


class JobCatalogResponse(BaseModel):
    id: uuid.UUID
    job_family: str
    level: str
    title: str
    monthly_cost: Decimal
    hierarchy_level: int
    currency: str
    active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
