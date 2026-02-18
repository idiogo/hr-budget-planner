import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str
    org_unit_id: Optional[uuid.UUID] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    role: Optional[str] = None
    org_unit_id: Optional[uuid.UUID] = None
    active: Optional[bool] = None
    password: Optional[str] = None


class OrgUnitMinimal(BaseModel):
    id: uuid.UUID
    name: str

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    role: str
    org_unit_id: Optional[uuid.UUID] = None
    org_unit: Optional[OrgUnitMinimal] = None
    active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenRefresh(BaseModel):
    refresh_token: str
