import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class RequisitionMinimal(BaseModel):
    id: uuid.UUID
    title: str
    priority: str

    class Config:
        from_attributes = True


class OfferBase(BaseModel):
    requisition_id: uuid.UUID
    candidate_name: str
    proposed_monthly_cost: Decimal
    currency: str = "BRL"
    start_date: Optional[date] = None
    notes: Optional[str] = None


class OfferCreate(OfferBase):
    pass


class OfferUpdate(BaseModel):
    candidate_name: Optional[str] = None
    proposed_monthly_cost: Optional[Decimal] = None
    final_monthly_cost: Optional[Decimal] = None
    start_date: Optional[date] = None
    notes: Optional[str] = None


class OfferApprove(BaseModel):
    pass


class OfferSend(BaseModel):
    pass


class OfferHold(BaseModel):
    reason: str
    until_date: Optional[date] = None


class OfferAccept(BaseModel):
    final_monthly_cost: Optional[Decimal] = None
    start_date: Optional[date] = None


class OfferChangeStartDate(BaseModel):
    new_start_date: date
    notes: Optional[str] = None


class OfferResponse(BaseModel):
    id: uuid.UUID
    requisition_id: uuid.UUID
    requisition: Optional[RequisitionMinimal] = None
    candidate_name: str
    status: str
    proposed_monthly_cost: Decimal
    final_monthly_cost: Optional[Decimal]
    currency: str
    start_date: Optional[date]
    hold_reason: Optional[str]
    hold_until: Optional[date]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OfferImpactPreview(BaseModel):
    offer_ids: list[uuid.UUID]
    months_ahead: int = 6


class MonthImpactResponse(BaseModel):
    month: str
    remaining_before: Decimal
    remaining_after: Decimal
    delta: Decimal
    status_before: str
    status_after: str
    is_bottleneck: bool


class OfferImpactResult(BaseModel):
    impacts: dict[str, MonthImpactResponse]


class WhatIfPositionInput(BaseModel):
    job_catalog_id: uuid.UUID
    monthly_cost: Decimal
    start_date: date
    overhead_multiplier: Optional[Decimal] = None


class WhatIfRequest(BaseModel):
    org_unit_id: uuid.UUID
    positions: list[WhatIfPositionInput]
    months_ahead: int = 6
