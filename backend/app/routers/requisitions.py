import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, Requisition, JobCatalog
from app.schemas import (
    RequisitionCreate, RequisitionUpdate, RequisitionResponse,
    RequisitionTransition
)
from app.middleware.auth import get_current_user, require_manager
from app.middleware.audit import create_audit_log, get_client_ip

router = APIRouter(prefix="/api/requisitions", tags=["requisitions"])


@router.get("", response_model=list[RequisitionResponse])
async def list_requisitions(
    org_unit_id: Optional[uuid.UUID] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    owner_id: Optional[uuid.UUID] = Query(None),
    has_candidate_ready: Optional[bool] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List requisitions with filters."""
    query = (
        select(Requisition)
        .options(
            selectinload(Requisition.org_unit),
            selectinload(Requisition.job_catalog),
            selectinload(Requisition.owner)
        )
    )
    
    if org_unit_id:
        query = query.where(Requisition.org_unit_id == org_unit_id)
    
    if status:
        query = query.where(Requisition.status == status)
    
    if priority:
        query = query.where(Requisition.priority == priority)
    
    if owner_id:
        query = query.where(Requisition.owner_id == owner_id)
    
    if has_candidate_ready is not None:
        query = query.where(Requisition.has_candidate_ready == has_candidate_ready)
    
    # Order by priority (P0 first) then by created_at
    query = query.order_by(Requisition.priority, Requisition.created_at.desc())
    
    result = await db.execute(query)
    return [RequisitionResponse.model_validate(r) for r in result.scalars()]


@router.get("/{requisition_id}", response_model=RequisitionResponse)
async def get_requisition(
    requisition_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get requisition by ID."""
    result = await db.execute(
        select(Requisition)
        .options(
            selectinload(Requisition.org_unit),
            selectinload(Requisition.job_catalog),
            selectinload(Requisition.owner)
        )
        .where(Requisition.id == requisition_id)
    )
    req = result.scalar_one_or_none()
    
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    
    return RequisitionResponse.model_validate(req)


@router.post("", response_model=RequisitionResponse)
async def create_requisition(
    data: RequisitionCreate,
    request: Request,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db)
):
    """Create new requisition."""
    # Get job catalog to set estimated cost
    result = await db.execute(
        select(JobCatalog).where(JobCatalog.id == data.job_catalog_id)
    )
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=400, detail="Invalid job catalog ID")
    
    req_data = data.model_dump()
    if not req_data.get("estimated_monthly_cost"):
        req_data["estimated_monthly_cost"] = job.monthly_cost
    
    req = Requisition(**req_data, owner_id=user.id, status="DRAFT")
    db.add(req)
    await db.commit()
    await db.refresh(req)
    
    # Reload with relations
    result = await db.execute(
        select(Requisition)
        .options(
            selectinload(Requisition.org_unit),
            selectinload(Requisition.job_catalog),
            selectinload(Requisition.owner)
        )
        .where(Requisition.id == req.id)
    )
    req = result.scalar_one()
    
    await create_audit_log(
        db, user.id, "CREATE", "requisition", req.id,
        changes=data.model_dump(),
        ip_address=get_client_ip(request)
    )
    
    return RequisitionResponse.model_validate(req)


@router.patch("/{requisition_id}", response_model=RequisitionResponse)
async def update_requisition(
    requisition_id: uuid.UUID,
    data: RequisitionUpdate,
    request: Request,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db)
):
    """Update requisition."""
    result = await db.execute(
        select(Requisition)
        .options(
            selectinload(Requisition.org_unit),
            selectinload(Requisition.job_catalog),
            selectinload(Requisition.owner)
        )
        .where(Requisition.id == requisition_id)
    )
    req = result.scalar_one_or_none()
    
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    
    # Check ownership for managers
    if user.role == "MANAGER" and req.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not your requisition")
    
    old_data = {
        "title": req.title,
        "priority": req.priority,
        "status": req.status,
        "target_start_month": req.target_start_month,
        "has_candidate_ready": req.has_candidate_ready
    }
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(req, key, value)
    
    await db.commit()
    await db.refresh(req)
    
    await create_audit_log(
        db, user.id, "UPDATE", "requisition", req.id,
        changes={"old": old_data, "new": update_data},
        ip_address=get_client_ip(request)
    )
    
    return RequisitionResponse.model_validate(req)


@router.post("/{requisition_id}/transition", response_model=RequisitionResponse)
async def transition_requisition(
    requisition_id: uuid.UUID,
    data: RequisitionTransition,
    request: Request,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db)
):
    """Transition requisition status."""
    result = await db.execute(
        select(Requisition)
        .options(
            selectinload(Requisition.org_unit),
            selectinload(Requisition.job_catalog),
            selectinload(Requisition.owner)
        )
        .where(Requisition.id == requisition_id)
    )
    req = result.scalar_one_or_none()
    
    if not req:
        raise HTTPException(status_code=404, detail="Requisition not found")
    
    # Valid status transitions
    valid_transitions = {
        "DRAFT": ["OPEN", "CANCELLED"],
        "OPEN": ["INTERVIEWING", "CANCELLED"],
        "INTERVIEWING": ["OFFER_PENDING", "OPEN", "CANCELLED"],
        "OFFER_PENDING": ["FILLED", "INTERVIEWING", "CANCELLED"],
        "FILLED": [],
        "CANCELLED": ["DRAFT"]
    }
    
    if data.status not in valid_transitions.get(req.status, []):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid transition from {req.status} to {data.status}"
        )
    
    old_status = req.status
    req.status = data.status
    
    await db.commit()
    await db.refresh(req)
    
    await create_audit_log(
        db, user.id, "TRANSITION", "requisition", req.id,
        changes={"old_status": old_status, "new_status": data.status},
        ip_address=get_client_ip(request)
    )
    
    return RequisitionResponse.model_validate(req)
