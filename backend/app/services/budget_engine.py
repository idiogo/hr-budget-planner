"""
Budget Engine - Core business logic for HR Budget Planning

This is the heart of the system. All budget calculations happen here.
"""

import uuid
from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Budget, Forecast, Actual, Offer, Requisition, OrgUnit


class HealthStatus(str, Enum):
    GREEN = "green"    # Remaining >= 20% of Approved
    YELLOW = "yellow"  # 0 < Remaining < 20% of Approved
    RED = "red"        # Remaining <= 0


@dataclass
class MonthHealth:
    month: str
    approved: Decimal
    baseline: Decimal
    baseline_source: str  # 'actual', 'forecast', or 'none'
    committed: Decimal
    pipeline_potential: Decimal
    remaining: Decimal
    status: HealthStatus


@dataclass
class MonthImpact:
    month: str
    remaining_before: Decimal
    remaining_after: Decimal
    delta: Decimal
    status_before: HealthStatus
    status_after: HealthStatus
    is_bottleneck: bool


@dataclass
class WhatIfPosition:
    job_catalog_id: uuid.UUID
    monthly_cost: Decimal
    start_date: date
    overhead_multiplier: Optional[Decimal] = None


def calculate_pro_rata(start_date: date, month: str) -> Decimal:
    """
    Calculate the fraction of the month worked.
    
    Example: start on Jan 15 (31-day month) → (31 - 15 + 1) / 31 = 0.548
    Returns 0.0 to 1.0
    """
    year, month_num = int(month[:4]), int(month[5:7])
    days_in_month = monthrange(year, month_num)[1]
    
    # If start date is not in this month, return 0 or 1
    if start_date.year != year or start_date.month != month_num:
        # If start date is before this month, full month
        if (start_date.year < year or 
            (start_date.year == year and start_date.month < month_num)):
            return Decimal("1.0")
        # If start date is after this month, no cost yet
        return Decimal("0.0")
    
    # Calculate pro-rata for partial month
    days_worked = days_in_month - start_date.day + 1
    pro_rata = Decimal(days_worked) / Decimal(days_in_month)
    return pro_rata.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def calculate_monthly_cost(
    base_cost: Decimal,
    overhead_multiplier: Decimal,
    start_date: date,
    month: str
) -> Decimal:
    """
    Calculate the final monthly cost with overhead and pro-rata.
    
    Final = base_cost * overhead_multiplier * pro_rata
    """
    pro_rata = calculate_pro_rata(start_date, month)
    cost = base_cost * overhead_multiplier * pro_rata
    return cost.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_health_status(approved: Decimal, remaining: Decimal) -> HealthStatus:
    """
    Determine health status based on remaining budget.
    
    GREEN: Remaining >= 20% of Approved
    YELLOW: 0 < Remaining < 20% of Approved
    RED: Remaining <= 0
    """
    if approved <= 0:
        return HealthStatus.RED if remaining <= 0 else HealthStatus.GREEN
    
    threshold = approved * Decimal("0.20")
    
    if remaining <= 0:
        return HealthStatus.RED
    elif remaining < threshold:
        return HealthStatus.YELLOW
    else:
        return HealthStatus.GREEN


async def get_baseline(
    db: AsyncSession,
    org_unit_id: uuid.UUID,
    month: str
) -> tuple[Decimal, str]:
    """
    Get the baseline amount for a month.
    Priority: Actual > Forecast > 0
    
    Returns: (amount, source)
    """
    # Check for actual first
    result = await db.execute(
        select(Actual).where(
            Actual.org_unit_id == org_unit_id,
            Actual.month == month
        )
    )
    actual = result.scalar_one_or_none()
    if actual:
        return actual.amount, "actual"
    
    # Fall back to forecast
    result = await db.execute(
        select(Forecast).where(
            Forecast.org_unit_id == org_unit_id,
            Forecast.month == month
        )
    )
    forecast = result.scalar_one_or_none()
    if forecast:
        return forecast.amount, "forecast"
    
    return Decimal("0"), "none"


async def get_committed_for_month(
    db: AsyncSession,
    org_unit_id: uuid.UUID,
    month: str,
    overhead_multiplier: Decimal
) -> Decimal:
    """
    Calculate total committed amount for a month.
    
    Only ACCEPTED offers with start_date in/before the month are included.
    Pro-rata is applied for the first month.
    """
    # Get all accepted offers for requisitions in this org unit
    result = await db.execute(
        select(Offer, Requisition)
        .join(Requisition, Offer.requisition_id == Requisition.id)
        .where(
            Requisition.org_unit_id == org_unit_id,
            Offer.status == "ACCEPTED",
            Offer.start_date.isnot(None)
        )
    )
    
    year, month_num = int(month[:4]), int(month[5:7])
    total = Decimal("0")
    
    for offer, req in result:
        if not offer.start_date:
            continue
        
        # Check if offer impacts this month
        offer_year, offer_month = offer.start_date.year, offer.start_date.month
        
        # Offer starts after this month - no impact
        if offer_year > year or (offer_year == year and offer_month > month_num):
            continue
        
        # Calculate cost with pro-rata for first month
        cost = offer.final_monthly_cost or offer.proposed_monthly_cost
        monthly_cost = calculate_monthly_cost(
            cost, overhead_multiplier, offer.start_date, month
        )
        total += monthly_cost
    
    return total


async def get_pipeline_potential(
    db: AsyncSession,
    org_unit_id: uuid.UUID,
    month: str,
    overhead_multiplier: Decimal
) -> Decimal:
    """
    Calculate pipeline potential for a month.
    
    Sum of estimated costs for OPEN/INTERVIEWING requisitions
    with target_start_month = month.
    This is informational - does NOT affect remaining budget.
    """
    result = await db.execute(
        select(Requisition).where(
            Requisition.org_unit_id == org_unit_id,
            Requisition.target_start_month == month,
            Requisition.status.in_(["OPEN", "INTERVIEWING"])
        )
    )
    
    total = Decimal("0")
    for req in result.scalars():
        if req.estimated_monthly_cost:
            total += req.estimated_monthly_cost * overhead_multiplier
    
    return total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


async def calculate_month_health(
    db: AsyncSession,
    org_unit_id: uuid.UUID,
    month: str
) -> MonthHealth:
    """
    Calculate complete health status for a month.
    
    Remaining = Approved - Baseline - Committed_Incremental
    """
    # Get org unit for overhead multiplier
    result = await db.execute(
        select(OrgUnit).where(OrgUnit.id == org_unit_id)
    )
    org_unit = result.scalar_one_or_none()
    overhead = org_unit.overhead_multiplier if org_unit else Decimal("1.0")
    
    # Get approved budget
    result = await db.execute(
        select(Budget).where(
            Budget.org_unit_id == org_unit_id,
            Budget.month == month
        )
    )
    budget = result.scalar_one_or_none()
    approved = budget.approved_amount if budget else Decimal("0")
    
    # Get baseline
    baseline, baseline_source = await get_baseline(db, org_unit_id, month)
    
    # Get committed
    committed = await get_committed_for_month(db, org_unit_id, month, overhead)
    
    # Get pipeline potential
    pipeline = await get_pipeline_potential(db, org_unit_id, month, overhead)
    
    # Calculate remaining
    remaining = approved - baseline - committed
    
    # Get status
    status = get_health_status(approved, remaining)
    
    return MonthHealth(
        month=month,
        approved=approved,
        baseline=baseline,
        baseline_source=baseline_source,
        committed=committed,
        pipeline_potential=pipeline,
        remaining=remaining,
        status=status
    )


async def preview_offer_impact(
    db: AsyncSession,
    org_unit_id: uuid.UUID,
    offer_ids: list[uuid.UUID],
    months_ahead: int = 6
) -> dict[str, MonthImpact]:
    """
    Preview the impact of approving multiple offers.
    
    Returns impact per month showing before/after remaining and status.
    Identifies the bottleneck month (first to go RED).
    """
    from datetime import datetime
    from dateutil.relativedelta import relativedelta
    
    # Get org unit overhead
    result = await db.execute(
        select(OrgUnit).where(OrgUnit.id == org_unit_id)
    )
    org_unit = result.scalar_one_or_none()
    overhead = org_unit.overhead_multiplier if org_unit else Decimal("1.0")
    
    # Get the offers
    result = await db.execute(
        select(Offer).where(Offer.id.in_(offer_ids))
    )
    offers = list(result.scalars())
    
    # Generate months to analyze
    today = datetime.now()
    months = []
    for i in range(months_ahead):
        month_date = today + relativedelta(months=i)
        months.append(month_date.strftime("%Y-%m"))
    
    impacts = {}
    first_red_month = None
    
    for month in months:
        # Get current health
        current = await calculate_month_health(db, org_unit_id, month)
        
        # Calculate additional committed from these offers
        additional = Decimal("0")
        for offer in offers:
            if not offer.start_date:
                continue
            
            year, month_num = int(month[:4]), int(month[5:7])
            offer_year, offer_month = offer.start_date.year, offer.start_date.month
            
            # Skip if offer starts after this month
            if offer_year > year or (offer_year == year and offer_month > month_num):
                continue
            
            cost = offer.proposed_monthly_cost
            monthly_cost = calculate_monthly_cost(cost, overhead, offer.start_date, month)
            additional += monthly_cost
        
        # Calculate new remaining
        remaining_after = current.remaining - additional
        status_after = get_health_status(current.approved, remaining_after)
        
        # Check if this is the bottleneck
        is_bottleneck = False
        if status_after == HealthStatus.RED and first_red_month is None:
            first_red_month = month
            is_bottleneck = True
        
        impacts[month] = MonthImpact(
            month=month,
            remaining_before=current.remaining,
            remaining_after=remaining_after,
            delta=-additional,
            status_before=current.status,
            status_after=status_after,
            is_bottleneck=is_bottleneck
        )
    
    return impacts


async def preview_new_positions(
    db: AsyncSession,
    org_unit_id: uuid.UUID,
    positions: list[WhatIfPosition],
    months_ahead: int = 6
) -> dict[str, MonthImpact]:
    """
    Preview the impact of adding hypothetical new positions.
    
    Same format as offer impact preview.
    """
    from datetime import datetime
    from dateutil.relativedelta import relativedelta
    
    # Get org unit overhead
    result = await db.execute(
        select(OrgUnit).where(OrgUnit.id == org_unit_id)
    )
    org_unit = result.scalar_one_or_none()
    default_overhead = org_unit.overhead_multiplier if org_unit else Decimal("1.0")
    
    # Generate months to analyze
    today = datetime.now()
    months = []
    for i in range(months_ahead):
        month_date = today + relativedelta(months=i)
        months.append(month_date.strftime("%Y-%m"))
    
    impacts = {}
    first_red_month = None
    
    for month in months:
        # Get current health
        current = await calculate_month_health(db, org_unit_id, month)
        
        # Calculate additional cost from positions
        additional = Decimal("0")
        for pos in positions:
            year, month_num = int(month[:4]), int(month[5:7])
            pos_year, pos_month = pos.start_date.year, pos.start_date.month
            
            # Skip if position starts after this month
            if pos_year > year or (pos_year == year and pos_month > month_num):
                continue
            
            overhead = pos.overhead_multiplier or default_overhead
            monthly_cost = calculate_monthly_cost(
                pos.monthly_cost, overhead, pos.start_date, month
            )
            additional += monthly_cost
        
        # Calculate new remaining
        remaining_after = current.remaining - additional
        status_after = get_health_status(current.approved, remaining_after)
        
        # Check if this is the bottleneck
        is_bottleneck = False
        if status_after == HealthStatus.RED and first_red_month is None:
            first_red_month = month
            is_bottleneck = True
        
        impacts[month] = MonthImpact(
            month=month,
            remaining_before=current.remaining,
            remaining_after=remaining_after,
            delta=-additional,
            status_before=current.status,
            status_after=status_after,
            is_bottleneck=is_bottleneck
        )
    
    return impacts


async def get_org_unit_summary(
    db: AsyncSession,
    org_unit_id: uuid.UUID,
    months_count: int = 6
) -> list[MonthHealth]:
    """
    Get summary for multiple months.
    
    Returns 1 past + current + N future months.
    """
    from datetime import datetime
    from dateutil.relativedelta import relativedelta
    
    today = datetime.now()
    months = []
    
    # 1 month ago
    past = today - relativedelta(months=1)
    months.append(past.strftime("%Y-%m"))
    
    # Current and future
    for i in range(months_count):
        month_date = today + relativedelta(months=i)
        months.append(month_date.strftime("%Y-%m"))
    
    summaries = []
    for month in months:
        health = await calculate_month_health(db, org_unit_id, month)
        summaries.append(health)
    
    return summaries
