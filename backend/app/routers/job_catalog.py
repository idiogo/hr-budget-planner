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
    
    # Non-admin users can only see jobs at or below their hierarchy level
    if user.role != "ADMIN":
        if user.job_catalog and user.job_catalog.hierarchy_level:
            query = query.where(JobCatalog.hierarchy_level <= user.job_catalog.hierarchy_level)
        else:
            # User without a job assigned sees nothing (or only level 0)
            query = query.where(JobCatalog.hierarchy_level <= 0)
    
    query = query.order_by(JobCatalog.hierarchy_level, JobCatalog.job_family, JobCatalog.level)
    
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
    
    # Non-admin cannot view jobs above their hierarchy level
    if user.role != "ADMIN":
        user_level = user.job_catalog.hierarchy_level if user.job_catalog else 0
        if job.hierarchy_level > user_level:
            raise HTTPException(status_code=403, detail="Acesso negado a este cargo")
    
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
    hard: bool = Query(False),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Delete or deactivate job catalog entry (admin only).
    Use ?hard=true to permanently delete, otherwise soft-deletes (deactivate).
    """
    result = await db.execute(
        select(JobCatalog).where(JobCatalog.id == job_id)
    )
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if hard:
        await create_audit_log(
            db, user.id, "HARD_DELETE", "job_catalog", job.id,
            changes={"title": job.title, "level": job.level},
            ip_address=get_client_ip(request)
        )
        await db.delete(job)
        await db.commit()
        return {"message": "Job catalog entry permanently deleted"}
    else:
        job.active = False
        await db.commit()
        await create_audit_log(
            db, user.id, "DEACTIVATE", "job_catalog", job.id,
            ip_address=get_client_ip(request)
        )
        return {"message": "Job catalog entry deactivated"}
