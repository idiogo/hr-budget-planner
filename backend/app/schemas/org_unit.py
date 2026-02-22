import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel


class OrgUnitBase(BaseModel):
    name: str
    currency: str = "BRL"


class OrgUnitCreate(OrgUnitBase):
    pass


class OrgUnitUpdate(BaseModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    active: Optional[bool] = None


class OrgUnitResponse(BaseModel):
    id: uuid.UUID
    name: str
    currency: str
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True
