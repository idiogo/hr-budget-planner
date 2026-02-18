import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel

from app.schemas.job_catalog import JobCatalogResponse


class RequisitionBase(BaseModel):
    org_unit_id: uuid.UUID
    job_catalog_id: uuid.UUID
    title: str
    priority: str = "P2"
    target_start_month: Optional[str] = None
    estimated_monthly_cost: Optional[Decimal] = None
    notes: Optional[str] = None


class RequisitionCreate(RequisitionBase):
    pass


class RequisitionUpdate(BaseModel):
    title: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    target_start_month: Optional[str] = None
    estimated_monthly_cost: Optional[Decimal] = None
    has_candidate_ready: Optional[bool] = None
    notes: Optional[str] = None


class RequisitionTransition(BaseModel):
    status: str


class OwnerMinimal(BaseModel):
    id: uuid.UUID
    name: str
    email: str

    class Config:
        from_attributes = True


class OrgUnitMinimal(BaseModel):
    id: uuid.UUID
    name: str

    class Config:
        from_attributes = True


class RequisitionResponse(BaseModel):
    id: uuid.UUID
    org_unit_id: uuid.UUID
    org_unit: Optional[OrgUnitMinimal] = None
    job_catalog_id: uuid.UUID
    job_catalog: Optional[JobCatalogResponse] = None
    title: str
    priority: str
    status: str
    target_start_month: Optional[str]
    estimated_monthly_cost: Optional[Decimal]
    has_candidate_ready: bool
    owner_id: uuid.UUID
    owner: Optional[OwnerMinimal] = None
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
