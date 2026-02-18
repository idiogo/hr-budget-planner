import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class BudgetBase(BaseModel):
    month: str
    approved_amount: Decimal
    currency: str = "BRL"


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    approved_amount: Optional[Decimal] = None
    currency: Optional[str] = None


class BudgetResponse(BaseModel):
    id: uuid.UUID
    org_unit_id: uuid.UUID
    month: str
    approved_amount: Decimal
    currency: str
    locked: bool
    locked_by: Optional[uuid.UUID] = None
    locked_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ForecastBase(BaseModel):
    month: str
    amount: Decimal
    currency: str = "BRL"
    source: Optional[str] = "manual"


class ForecastCreate(ForecastBase):
    pass


class ForecastResponse(BaseModel):
    id: uuid.UUID
    org_unit_id: uuid.UUID
    month: str
    amount: Decimal
    currency: str
    source: Optional[str]
    created_by: Optional[uuid.UUID]
    created_at: datetime

    class Config:
        from_attributes = True


class ActualBase(BaseModel):
    month: str
    amount: Decimal
    currency: str = "BRL"
    finalized: bool = False


class ActualCreate(ActualBase):
    pass


class ActualResponse(BaseModel):
    id: uuid.UUID
    org_unit_id: uuid.UUID
    month: str
    amount: Decimal
    currency: str
    finalized: bool
    created_by: Optional[uuid.UUID]
    created_at: datetime

    class Config:
        from_attributes = True


class MonthHealthResponse(BaseModel):
    month: str
    approved: Decimal
    baseline: Decimal
    baseline_source: str
    committed: Decimal
    pipeline_potential: Decimal
    remaining: Decimal
    status: str


class OrgUnitSummaryResponse(BaseModel):
    org_unit: "OrgUnitResponse"
    months: list[MonthHealthResponse]


# Resolve forward reference
from app.schemas.org_unit import OrgUnitResponse
OrgUnitSummaryResponse.model_rebuild()
