import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, JobCatalog
from app.schemas import JobCatalogCreate, JobCatalogUpdate, JobCatalogResponse
from app.middleware.auth import get_current_user, require_admin
from app.middleware.audit import create_audit_log, get_client_ip

router = APIRouter(prefix="/api/job-catalog", tags=["job-catalog"])


@router.get("", response_model=list[JobCatalogResponse])
async def list_job_catalog(
    active: Optional[bool] = Query(None),
    job_family: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List job catalog entries with optional filters."""
    query = select(JobCatalog)
    
    if active is not None:
        query = query.where(JobCatalog.active == active)
    
    if job_family:
        query = query.where(JobCatalog.job_family == job_family)
    
    query = query.order_by(JobCatalog.job_family, JobCatalog.level)
    
    result = await db.execute(query)
    return [JobCatalogResponse.model_validate(j) for j in result.scalars()]


@router.get("/{job_id}", response_model=JobCatalogResponse)
async def get_job_catalog(
    job_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get job catalog entry by ID."""
    result = await db.execute(
        select(JobCatalog).where(JobCatalog.id == job_id)
    )
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return JobCatalogResponse.model_validate(job)


@router.post("", response_model=JobCatalogResponse)
async def create_job_catalog(
    data: JobCatalogCreate,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create new job catalog entry (admin only)."""
    job = JobCatalog(**data.model_dump())
    db.add(job)
    await db.commit()
    await db.refresh(job)
    
    await create_audit_log(
        db, user.id, "CREATE", "job_catalog", job.id,
        changes=data.model_dump(),
        ip_address=get_client_ip(request)
    )
    
    return JobCatalogResponse.model_validate(job)


@router.patch("/{job_id}", response_model=JobCatalogResponse)
async def update_job_catalog(
    job_id: uuid.UUID,
    data: JobCatalogUpdate,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update job catalog entry (admin only)."""
    result = await db.execute(
        select(JobCatalog).where(JobCatalog.id == job_id)
    )
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    old_data = {
        "job_family": job.job_family,
        "level": job.level,
        "title": job.title,
        "monthly_cost": str(job.monthly_cost),
        "active": job.active
    }
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(job, key, value)
    
    await db.commit()
    await db.refresh(job)
    
    await create_audit_log(
        db, user.id, "UPDATE", "job_catalog", job.id,
        changes={"old": old_data, "new": update_data},
        ip_address=get_client_ip(request)
    )
    
    return JobCatalogResponse.model_validate(job)


@router.delete("/{job_id}")
async def delete_job_catalog(
    job_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Soft delete job catalog entry (admin only)."""
    result = await db.execute(
        select(JobCatalog).where(JobCatalog.id == job_id)
    )
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job.active = False
    await db.commit()
    
    await create_audit_log(
        db, user.id, "DELETE", "job_catalog", job.id,
        ip_address=get_client_ip(request)
    )
    
    return {"message": "Job catalog entry deleted"}
