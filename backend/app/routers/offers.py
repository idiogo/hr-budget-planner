import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, Offer, Requisition
from app.schemas import (
    OfferCreate, OfferUpdate, OfferResponse,
    OfferImpactPreview, OfferImpactResult, MonthImpactResponse
)
from app.schemas.offer import OfferHold, OfferAccept, OfferChangeStartDate, WhatIfRequest
from app.middleware.auth import get_current_user, require_manager, require_admin
from app.middleware.audit import create_audit_log, get_client_ip
from app.services.budget_engine import preview_offer_impact, preview_new_positions, WhatIfPosition

router = APIRouter(prefix="/api/offers", tags=["offers"])


@router.get("", response_model=list[OfferResponse])
async def list_offers(
    status: Optional[str] = Query(None),
    org_unit_id: Optional[uuid.UUID] = Query(None),
    requisition_id: Optional[uuid.UUID] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List offers with filters."""
    query = (
        select(Offer)
        .options(selectinload(Offer.requisition))
        .join(Requisition)
    )
    
    if status:
        query = query.where(Offer.status == status)
    
    if org_unit_id:
        query = query.where(Requisition.org_unit_id == org_unit_id)
    
    if requisition_id:
        query = query.where(Offer.requisition_id == requisition_id)
    
    query = query.order_by(Offer.created_at.desc())
    
    result = await db.execute(query)
    return [OfferResponse.model_validate(o) for o in result.scalars()]


@router.get("/{offer_id}", response_model=OfferResponse)
async def get_offer(
    offer_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get offer by ID."""
    result = await db.execute(
        select(Offer)
        .options(selectinload(Offer.requisition))
        .where(Offer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    return OfferResponse.model_validate(offer)


@router.post("", response_model=OfferResponse)
async def create_offer(
    data: OfferCreate,
    request: Request,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db)
):
    """Create new offer."""
    # Verify requisition exists
    result = await db.execute(
        select(Requisition).where(Requisition.id == data.requisition_id)
    )
    req = result.scalar_one_or_none()
    
    if not req:
        raise HTTPException(status_code=400, detail="Invalid requisition ID")
    
    offer = Offer(**data.model_dump(), status="DRAFT")
    db.add(offer)
    await db.commit()
    await db.refresh(offer)
    
    # Mark requisition as having candidate ready
    req.has_candidate_ready = True
    await db.commit()
    
    # Reload with relations
    result = await db.execute(
        select(Offer)
        .options(selectinload(Offer.requisition))
        .where(Offer.id == offer.id)
    )
    offer = result.scalar_one()
    
    await create_audit_log(
        db, user.id, "CREATE", "offer", offer.id,
        changes=data.model_dump(),
        ip_address=get_client_ip(request)
    )
    
    return OfferResponse.model_validate(offer)


@router.patch("/{offer_id}", response_model=OfferResponse)
async def update_offer(
    offer_id: uuid.UUID,
    data: OfferUpdate,
    request: Request,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db)
):
    """Update offer."""
    result = await db.execute(
        select(Offer)
        .options(selectinload(Offer.requisition))
        .where(Offer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    if offer.status not in ["DRAFT", "PROPOSED", "HOLD"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot update offer in {offer.status} status"
        )
    
    old_data = {
        "candidate_name": offer.candidate_name,
        "proposed_monthly_cost": str(offer.proposed_monthly_cost),
        "start_date": str(offer.start_date) if offer.start_date else None
    }
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(offer, key, value)
    
    await db.commit()
    await db.refresh(offer)
    
    await create_audit_log(
        db, user.id, "UPDATE", "offer", offer.id,
        changes={"old": old_data, "new": update_data},
        ip_address=get_client_ip(request)
    )
    
    return OfferResponse.model_validate(offer)


@router.post("/preview-impact", response_model=OfferImpactResult)
async def preview_impact(
    data: OfferImpactPreview,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Preview impact of approving multiple offers."""
    # Get org_unit_id from first offer
    if not data.offer_ids:
        raise HTTPException(status_code=400, detail="No offer IDs provided")
    
    result = await db.execute(
        select(Offer)
        .options(selectinload(Offer.requisition))
        .where(Offer.id == data.offer_ids[0])
    )
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    org_unit_id = offer.requisition.org_unit_id
    
    impacts = await preview_offer_impact(
        db, org_unit_id, data.offer_ids, data.months_ahead
    )
    
    return OfferImpactResult(
        impacts={
            month: MonthImpactResponse(
                month=impact.month,
                remaining_before=impact.remaining_before,
                remaining_after=impact.remaining_after,
                delta=impact.delta,
                status_before=impact.status_before.value,
                status_after=impact.status_after.value,
                is_bottleneck=impact.is_bottleneck
            )
            for month, impact in impacts.items()
        }
    )


@router.post("/preview-new-positions", response_model=OfferImpactResult)
async def preview_new_positions_endpoint(
    data: WhatIfRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Preview impact of hypothetical new positions."""
    positions = [
        WhatIfPosition(
            job_catalog_id=p.job_catalog_id,
            monthly_cost=p.monthly_cost,
            start_date=p.start_date,
        )
        for p in data.positions
    ]
    
    impacts = await preview_new_positions(
        db, data.org_unit_id, positions, data.months_ahead
    )
    
    return OfferImpactResult(
        impacts={
            month: MonthImpactResponse(
                month=impact.month,
                remaining_before=impact.remaining_before,
                remaining_after=impact.remaining_after,
                delta=impact.delta,
                status_before=impact.status_before.value,
                status_after=impact.status_after.value,
                is_bottleneck=impact.is_bottleneck
            )
            for month, impact in impacts.items()
        }
    )


@router.post("/{offer_id}/approve", response_model=OfferResponse)
async def approve_offer(
    offer_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Approve an offer (admin only)."""
    result = await db.execute(
        select(Offer)
        .options(selectinload(Offer.requisition))
        .where(Offer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    if offer.status != "PROPOSED":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve offer in {offer.status} status"
        )
    
    offer.status = "APPROVED"
    await db.commit()
    await db.refresh(offer)
    
    await create_audit_log(
        db, user.id, "APPROVE", "offer", offer.id,
        ip_address=get_client_ip(request)
    )
    
    return OfferResponse.model_validate(offer)


@router.post("/{offer_id}/send", response_model=OfferResponse)
async def send_offer(
    offer_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db)
):
    """Mark offer as sent."""
    result = await db.execute(
        select(Offer)
        .options(selectinload(Offer.requisition))
        .where(Offer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    if offer.status != "APPROVED":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot send offer in {offer.status} status"
        )
    
    offer.status = "SENT"
    await db.commit()
    await db.refresh(offer)
    
    await create_audit_log(
        db, user.id, "SEND", "offer", offer.id,
        ip_address=get_client_ip(request)
    )
    
    return OfferResponse.model_validate(offer)


@router.post("/{offer_id}/hold", response_model=OfferResponse)
async def hold_offer(
    offer_id: uuid.UUID,
    data: OfferHold,
    request: Request,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db)
):
    """Put offer on hold."""
    result = await db.execute(
        select(Offer)
        .options(selectinload(Offer.requisition))
        .where(Offer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    if offer.status not in ["PROPOSED", "APPROVED"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot hold offer in {offer.status} status"
        )
    
    old_status = offer.status
    offer.status = "HOLD"
    offer.hold_reason = data.reason
    offer.hold_until = data.until_date
    
    await db.commit()
    await db.refresh(offer)
    
    await create_audit_log(
        db, user.id, "HOLD", "offer", offer.id,
        changes={"old_status": old_status, "reason": data.reason},
        ip_address=get_client_ip(request)
    )
    
    return OfferResponse.model_validate(offer)


@router.post("/{offer_id}/accept", response_model=OfferResponse)
async def accept_offer(
    offer_id: uuid.UUID,
    data: OfferAccept,
    request: Request,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db)
):
    """Mark offer as accepted."""
    result = await db.execute(
        select(Offer)
        .options(selectinload(Offer.requisition))
        .where(Offer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    if offer.status != "SENT":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot accept offer in {offer.status} status"
        )
    
    offer.status = "ACCEPTED"
    if data.final_monthly_cost:
        offer.final_monthly_cost = data.final_monthly_cost
    else:
        offer.final_monthly_cost = offer.proposed_monthly_cost
    
    if data.start_date:
        offer.start_date = data.start_date
    
    # Update requisition to FILLED
    result = await db.execute(
        select(Requisition).where(Requisition.id == offer.requisition_id)
    )
    req = result.scalar_one()
    req.status = "FILLED"
    
    await db.commit()
    await db.refresh(offer)
    
    await create_audit_log(
        db, user.id, "ACCEPT", "offer", offer.id,
        changes={
            "final_monthly_cost": str(offer.final_monthly_cost),
            "start_date": str(offer.start_date)
        },
        ip_address=get_client_ip(request)
    )
    
    return OfferResponse.model_validate(offer)


@router.post("/{offer_id}/change-start-date", response_model=OfferResponse)
async def change_start_date(
    offer_id: uuid.UUID,
    data: OfferChangeStartDate,
    request: Request,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db)
):
    """Change offer start date."""
    result = await db.execute(
        select(Offer)
        .options(selectinload(Offer.requisition))
        .where(Offer.id == offer_id)
    )
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    old_date = offer.start_date
    offer.start_date = data.new_start_date
    if data.notes:
        offer.notes = (offer.notes or "") + f"\n[Date change] {data.notes}"
    
    await db.commit()
    await db.refresh(offer)
    
    await create_audit_log(
        db, user.id, "CHANGE_START_DATE", "offer", offer.id,
        changes={
            "old_date": str(old_date),
            "new_date": str(data.new_start_date),
            "notes": data.notes
        },
        ip_address=get_client_ip(request)
    )
    
    return OfferResponse.model_validate(offer)


@router.delete("/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_offer(
    offer_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_manager),
    db: AsyncSession = Depends(get_db)
):
    """Delete offer."""
    result = await db.execute(select(Offer).where(Offer.id == offer_id))
    offer = result.scalar_one_or_none()
    
    if not offer:
        raise HTTPException(status_code=404, detail="Proposta não encontrada")
    
    await create_audit_log(
        db, user.id, "DELETE", "offer", offer.id,
        changes={"candidate_name": offer.candidate_name, "status": offer.status},
        ip_address=get_client_ip(request)
    )
    
    await db.delete(offer)
    await db.commit()
