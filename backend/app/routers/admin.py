import uuid
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, AuditLog
from app.schemas import UserCreate, UserUpdate, UserResponse, AuditLogResponse
from app.middleware.auth import get_current_user, require_admin
from app.middleware.audit import create_audit_log, get_client_ip
from app.utils.security import get_password_hash

router = APIRouter(prefix="/api/admin", tags=["admin"])


# === USERS ===

@router.get("/users", response_model=list[UserResponse])
async def list_users(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all users (admin only)."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.org_unit))
        .order_by(User.name)
    )
    return [UserResponse.model_validate(u) for u in result.scalars()]


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Get user by ID (admin only)."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.org_unit))
        .where(User.id == user_id)
    )
    target_user = result.scalar_one_or_none()
    
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse.model_validate(target_user)


@router.post("/users", response_model=UserResponse)
async def create_user(
    data: UserCreate,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create new user (admin only)."""
    # Check if email exists
    result = await db.execute(
        select(User).where(User.email == data.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = User(
        email=data.email,
        name=data.name,
        password_hash=get_password_hash(data.password),
        role=data.role,
        org_unit_id=data.org_unit_id
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    # Reload with relations
    result = await db.execute(
        select(User)
        .options(selectinload(User.org_unit))
        .where(User.id == new_user.id)
    )
    new_user = result.scalar_one()
    
    await create_audit_log(
        db, user.id, "CREATE", "user", new_user.id,
        changes={"email": data.email, "role": data.role},
        ip_address=get_client_ip(request)
    )
    
    return UserResponse.model_validate(new_user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update user (admin only)."""
    result = await db.execute(
        select(User)
        .options(selectinload(User.org_unit))
        .where(User.id == user_id)
    )
    target_user = result.scalar_one_or_none()
    
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    old_data = {
        "email": target_user.email,
        "name": target_user.name,
        "role": target_user.role,
        "active": target_user.active
    }
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Handle password separately
    if "password" in update_data:
        target_user.password_hash = get_password_hash(update_data.pop("password"))
    
    for key, value in update_data.items():
        setattr(target_user, key, value)
    
    await db.commit()
    await db.refresh(target_user)
    
    await create_audit_log(
        db, user.id, "UPDATE", "user", target_user.id,
        changes={"old": old_data, "new": update_data},
        ip_address=get_client_ip(request)
    )
    
    return UserResponse.model_validate(target_user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Delete user (admin only). Cannot delete yourself."""
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Não é possível deletar seu próprio usuário")
    
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    await create_audit_log(
        db, user.id, "DELETE", "user", target_user.id,
        changes={"email": target_user.email, "name": target_user.name},
        ip_address=get_client_ip(request)
    )
    
    await db.delete(target_user)
    await db.commit()


# === AUDIT LOGS ===

@router.get("/audit-logs", response_model=list[AuditLogResponse])
async def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[uuid.UUID] = Query(None),
    user_id: Optional[uuid.UUID] = Query(None),
    from_date: Optional[datetime] = Query(None, alias="from"),
    to_date: Optional[datetime] = Query(None, alias="to"),
    limit: int = Query(100, le=500),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """List audit logs with filters (admin only)."""
    query = select(AuditLog)
    
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    
    if entity_id:
        query = query.where(AuditLog.entity_id == entity_id)
    
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    
    if from_date:
        query = query.where(AuditLog.created_at >= from_date)
    
    if to_date:
        query = query.where(AuditLog.created_at <= to_date)
    
    query = query.order_by(AuditLog.created_at.desc()).limit(limit)
    
    result = await db.execute(query)
    return [AuditLogResponse.model_validate(log) for log in result.scalars()]
