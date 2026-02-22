import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, OrgUnit
from app.schemas import OrgUnitCreate, OrgUnitUpdate, OrgUnitResponse, OrgUnitSummaryResponse, MonthHealthResponse
from app.middleware.auth import get_current_user, require_admin
from app.middleware.audit import create_audit_log, get_client_ip
from app.services.budget_engine import get_org_unit_summary

router = APIRouter(prefix="/api/org-units", tags=["org-units"])


@router.get("", response_model=list[OrgUnitResponse])
async def list_org_units(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all active org units."""
    result = await db.execute(
        select(OrgUnit).where(OrgUnit.active == True).order_by(OrgUnit.name)
    )
    return [OrgUnitResponse.model_validate(ou) for ou in result.scalars()]


@router.get("/{org_unit_id}", response_model=OrgUnitResponse)
async def get_org_unit(
    org_unit_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get org unit by ID."""
    result = await db.execute(
        select(OrgUnit).where(OrgUnit.id == org_unit_id)
    )
    org_unit = result.scalar_one_or_none()
    
    if not org_unit:
        raise HTTPException(status_code=404, detail="Org unit not found")
    
    return OrgUnitResponse.model_validate(org_unit)


@router.get("/{org_unit_id}/summary", response_model=OrgUnitSummaryResponse)
async def get_org_unit_summary_endpoint(
    org_unit_id: uuid.UUID,
    months: int = 6,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get budget summary for org unit with health status per month."""
    result = await db.execute(
        select(OrgUnit).where(OrgUnit.id == org_unit_id)
    )
    org_unit = result.scalar_one_or_none()
    
    if not org_unit:
        raise HTTPException(status_code=404, detail="Org unit not found")
    
    health_data = await get_org_unit_summary(db, org_unit_id, months)
    
    return OrgUnitSummaryResponse(
        org_unit=OrgUnitResponse.model_validate(org_unit),
        months=[
            MonthHealthResponse(
                month=h.month,
                approved=h.approved,
                baseline=h.baseline,
                baseline_source=h.baseline_source,
                committed=h.committed,
                pipeline_potential=h.pipeline_potential,
                remaining=h.remaining,
                status=h.status.value
            )
            for h in health_data
        ]
    )


@router.post("", response_model=OrgUnitResponse)
async def create_org_unit(
    data: OrgUnitCreate,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create new org unit (admin only)."""
    org_unit = OrgUnit(**data.model_dump())
    db.add(org_unit)
    await db.commit()
    await db.refresh(org_unit)
    
    await create_audit_log(
        db, user.id, "CREATE", "org_unit", org_unit.id,
        changes=data.model_dump(),
        ip_address=get_client_ip(request)
    )
    
    return OrgUnitResponse.model_validate(org_unit)


@router.delete("/{org_unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_org_unit(
    org_unit_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Delete org unit (admin only)."""
    result = await db.execute(
        select(OrgUnit).where(OrgUnit.id == org_unit_id)
    )
    org_unit = result.scalar_one_or_none()
    
    if not org_unit:
        raise HTTPException(status_code=404, detail="Área não encontrada")
    
    await create_audit_log(
        db, user.id, "DELETE", "org_unit", org_unit.id,
        changes={"name": org_unit.name},
        ip_address=get_client_ip(request)
    )
    
    await db.delete(org_unit)
    await db.commit()


@router.patch("/{org_unit_id}", response_model=OrgUnitResponse)
async def update_org_unit(
    org_unit_id: uuid.UUID,
    data: OrgUnitUpdate,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update org unit (admin only)."""
    result = await db.execute(
        select(OrgUnit).where(OrgUnit.id == org_unit_id)
    )
    org_unit = result.scalar_one_or_none()
    
    if not org_unit:
        raise HTTPException(status_code=404, detail="Org unit not found")
    
    old_data = {
        "name": org_unit.name,
        "currency": org_unit.currency,
        "overhead_multiplier": str(org_unit.overhead_multiplier),
        "active": org_unit.active
    }
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(org_unit, key, value)
    
    await db.commit()
    await db.refresh(org_unit)
    
    await create_audit_log(
        db, user.id, "UPDATE", "org_unit", org_unit.id,
        changes={"old": old_data, "new": update_data},
        ip_address=get_client_ip(request)
    )
    
    return OrgUnitResponse.model_validate(org_unit)
