import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, Budget, Forecast, Actual
from app.schemas import (
    BudgetCreate, BudgetResponse,
    ForecastCreate, ForecastResponse,
    ActualCreate, ActualResponse
)
from app.middleware.auth import get_current_user, require_admin
from app.middleware.audit import create_audit_log, get_client_ip

router = APIRouter(prefix="/api/org-units/{org_unit_id}", tags=["budgets"])


# === BUDGETS ===

@router.get("/budgets", response_model=list[BudgetResponse])
async def list_budgets(
    org_unit_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all budgets for org unit."""
    result = await db.execute(
        select(Budget)
        .where(Budget.org_unit_id == org_unit_id)
        .order_by(Budget.month)
    )
    return [BudgetResponse.model_validate(b) for b in result.scalars()]


@router.post("/budgets", response_model=BudgetResponse)
async def create_budget(
    org_unit_id: uuid.UUID,
    data: BudgetCreate,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create or update budget for a month."""
    # Check if budget exists for this month
    result = await db.execute(
        select(Budget).where(
            Budget.org_unit_id == org_unit_id,
            Budget.month == data.month
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        if existing.locked:
            raise HTTPException(
                status_code=400,
                detail="Cannot update locked budget"
            )
        
        old_amount = existing.approved_amount
        existing.approved_amount = data.approved_amount
        existing.currency = data.currency
        await db.commit()
        await db.refresh(existing)
        
        await create_audit_log(
            db, user.id, "UPDATE", "budget", existing.id,
            changes={"old_amount": str(old_amount), "new_amount": str(data.approved_amount)},
            ip_address=get_client_ip(request)
        )
        
        return BudgetResponse.model_validate(existing)
    
    budget = Budget(
        org_unit_id=org_unit_id,
        **data.model_dump()
    )
    db.add(budget)
    await db.commit()
    await db.refresh(budget)
    
    await create_audit_log(
        db, user.id, "CREATE", "budget", budget.id,
        changes=data.model_dump(),
        ip_address=get_client_ip(request)
    )
    
    return BudgetResponse.model_validate(budget)


@router.post("/lock-month")
async def lock_month(
    org_unit_id: uuid.UUID,
    data: dict,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Lock a budget month (admin only)."""
    month = data.get("month")
    if not month:
        raise HTTPException(status_code=400, detail="Month is required")
    
    result = await db.execute(
        select(Budget).where(
            Budget.org_unit_id == org_unit_id,
            Budget.month == month
        )
    )
    budget = result.scalar_one_or_none()
    
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found for this month")
    
    budget.locked = True
    budget.locked_by = user.id
    budget.locked_at = datetime.utcnow()
    
    await db.commit()
    
    await create_audit_log(
        db, user.id, "LOCK", "budget", budget.id,
        changes={"month": month},
        ip_address=get_client_ip(request)
    )
    
    return {"message": f"Budget for {month} locked successfully"}


# === FORECASTS ===

@router.get("/forecasts", response_model=list[ForecastResponse])
async def list_forecasts(
    org_unit_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all forecasts for org unit."""
    result = await db.execute(
        select(Forecast)
        .where(Forecast.org_unit_id == org_unit_id)
        .order_by(Forecast.month)
    )
    return [ForecastResponse.model_validate(f) for f in result.scalars()]


@router.post("/forecasts", response_model=ForecastResponse)
async def create_forecast(
    org_unit_id: uuid.UUID,
    data: ForecastCreate,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create or update forecast for a month."""
    result = await db.execute(
        select(Forecast).where(
            Forecast.org_unit_id == org_unit_id,
            Forecast.month == data.month
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        old_amount = existing.amount
        existing.amount = data.amount
        existing.source = data.source
        await db.commit()
        await db.refresh(existing)
        
        await create_audit_log(
            db, user.id, "UPDATE", "forecast", existing.id,
            changes={"old_amount": str(old_amount), "new_amount": str(data.amount)},
            ip_address=get_client_ip(request)
        )
        
        return ForecastResponse.model_validate(existing)
    
    forecast = Forecast(
        org_unit_id=org_unit_id,
        created_by=user.id,
        **data.model_dump()
    )
    db.add(forecast)
    await db.commit()
    await db.refresh(forecast)
    
    await create_audit_log(
        db, user.id, "CREATE", "forecast", forecast.id,
        changes=data.model_dump(),
        ip_address=get_client_ip(request)
    )
    
    return ForecastResponse.model_validate(forecast)


# === ACTUALS ===

@router.get("/actuals", response_model=list[ActualResponse])
async def list_actuals(
    org_unit_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all actuals for org unit."""
    result = await db.execute(
        select(Actual)
        .where(Actual.org_unit_id == org_unit_id)
        .order_by(Actual.month)
    )
    return [ActualResponse.model_validate(a) for a in result.scalars()]


@router.post("/actuals", response_model=ActualResponse)
async def create_actual(
    org_unit_id: uuid.UUID,
    data: ActualCreate,
    request: Request,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create or update actual for a month (admin only)."""
    result = await db.execute(
        select(Actual).where(
            Actual.org_unit_id == org_unit_id,
            Actual.month == data.month
        )
    )
    existing = result.scalar_one_or_none()
    
    if existing:
        old_amount = existing.amount
        existing.amount = data.amount
        existing.finalized = data.finalized
        await db.commit()
        await db.refresh(existing)
        
        await create_audit_log(
            db, user.id, "UPDATE", "actual", existing.id,
            changes={"old_amount": str(old_amount), "new_amount": str(data.amount)},
            ip_address=get_client_ip(request)
        )
        
        return ActualResponse.model_validate(existing)
    
    actual = Actual(
        org_unit_id=org_unit_id,
        created_by=user.id,
        **data.model_dump()
    )
    db.add(actual)
    await db.commit()
    await db.refresh(actual)
    
    await create_audit_log(
        db, user.id, "CREATE", "actual", actual.id,
        changes=data.model_dump(),
        ip_address=get_client_ip(request)
    )
    
    return ActualResponse.model_validate(actual)
