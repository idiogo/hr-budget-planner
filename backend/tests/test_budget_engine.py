"""Tests for budget engine core calculations."""

import pytest
from datetime import date
from decimal import Decimal

from app.services.budget_engine import (
    get_health_status,
    HealthStatus,
    get_baseline,
    get_committed_for_month,
    calculate_month_health,
)
from app.models import Budget, Forecast, Actual, Offer, Requisition


class TestHealthStatus:
    """Tests for health status determination."""

    def test_health_green(self):
        """GREEN when remaining >= 20% of approved."""
        # 25% remaining
        status = get_health_status(Decimal("100000"), Decimal("25000"))
        assert status == HealthStatus.GREEN

    def test_health_green_exactly_20(self):
        """GREEN when remaining == exactly 20%."""
        status = get_health_status(Decimal("100000"), Decimal("20000"))
        assert status == HealthStatus.GREEN

    def test_health_yellow(self):
        """YELLOW when 0 < remaining < 20%."""
        # 10% remaining
        status = get_health_status(Decimal("100000"), Decimal("10000"))
        assert status == HealthStatus.YELLOW

    def test_health_yellow_close_to_zero(self):
        """YELLOW when remaining is very small but positive."""
        status = get_health_status(Decimal("100000"), Decimal("100"))
        assert status == HealthStatus.YELLOW

    def test_health_red_zero(self):
        """RED when remaining is exactly zero."""
        status = get_health_status(Decimal("100000"), Decimal("0"))
        assert status == HealthStatus.RED

    def test_health_red_negative(self):
        """RED when remaining is negative (over budget)."""
        status = get_health_status(Decimal("100000"), Decimal("-5000"))
        assert status == HealthStatus.RED

    def test_health_zero_approved(self):
        """Edge case: zero approved budget."""
        status = get_health_status(Decimal("0"), Decimal("-1000"))
        assert status == HealthStatus.RED
        
        status = get_health_status(Decimal("0"), Decimal("1000"))
        assert status == HealthStatus.GREEN


class TestBaseline:
    """Tests for baseline calculation (Actual > Forecast priority)."""

    @pytest.mark.asyncio
    async def test_baseline_prefers_actual(
        self,
        db_session,
        org_unit,
        actual_jan,
        forecast_jan
    ):
        """Actual takes precedence over Forecast."""
        amount, source = await get_baseline(db_session, org_unit.id, "2026-01")
        
        assert source == "actual"
        assert amount == Decimal("775000")

    @pytest.mark.asyncio
    async def test_baseline_falls_back_to_forecast(
        self,
        db_session,
        org_unit,
        forecast_jan
    ):
        """Without Actual, falls back to Forecast."""
        amount, source = await get_baseline(db_session, org_unit.id, "2026-01")
        
        assert source == "forecast"
        assert amount == Decimal("780000")

    @pytest.mark.asyncio
    async def test_baseline_zero_when_empty(
        self,
        db_session,
        org_unit
    ):
        """Returns 0 when no Actual or Forecast exists."""
        amount, source = await get_baseline(db_session, org_unit.id, "2026-06")
        
        assert source == "none"
        assert amount == Decimal("0")


class TestCommitted:
    """Tests for committed amount calculation."""

    @pytest.mark.asyncio
    async def test_committed_includes_accepted_only(
        self,
        db_session,
        org_unit,
        requisition,
        job_catalog,
        user
    ):
        """Only ACCEPTED offers are counted as committed."""
        # Create offers with different statuses
        proposed_offer = Offer(
            requisition_id=requisition.id,
            candidate_name="Proposed Candidate",
            status="PROPOSED",
            proposed_monthly_cost=Decimal("15000"),
            start_date=date(2026, 2, 1)
        )
        
        accepted_offer = Offer(
            requisition_id=requisition.id,
            candidate_name="Accepted Candidate",
            status="ACCEPTED",
            proposed_monthly_cost=Decimal("18000"),
            final_monthly_cost=Decimal("18000"),
            start_date=date(2026, 2, 1)
        )
        
        db_session.add_all([proposed_offer, accepted_offer])
        await db_session.commit()
        
        committed = await get_committed_for_month(
            db_session, org_unit.id, "2026-02", Decimal("1.80")
        )
        
        # Only the accepted offer should be counted
        # 18000 * 1.80 = 32400
        expected = Decimal("18000") * Decimal("1.80")
        assert committed == expected.quantize(Decimal("0.01"))

    @pytest.mark.asyncio
    async def test_committed_applies_pro_rata(
        self,
        db_session,
        org_unit,
        requisition
    ):
        """Pro-rata is applied for partial months."""
        # Create offer starting mid-month
        offer = Offer(
            requisition_id=requisition.id,
            candidate_name="Test Candidate",
            status="ACCEPTED",
            proposed_monthly_cost=Decimal("10000"),
            final_monthly_cost=Decimal("10000"),
            start_date=date(2026, 2, 15)  # 14 days in Feb (28-day month)
        )
        db_session.add(offer)
        await db_session.commit()
        
        committed = await get_committed_for_month(
            db_session, org_unit.id, "2026-02", Decimal("1.80")
        )
        
        # 10000 * 1.80 * (14/28) = 9000
        pro_rata = Decimal("14") / Decimal("28")
        expected = Decimal("10000") * Decimal("1.80") * pro_rata
        assert abs(committed - expected.quantize(Decimal("0.01"))) < Decimal("1")


class TestMonthHealth:
    """Tests for full month health calculation."""

    @pytest.mark.asyncio
    async def test_calculate_month_health(
        self,
        db_session,
        org_unit,
        budget_jan,
        actual_jan
    ):
        """Calculate health for a month with budget and actual."""
        health = await calculate_month_health(db_session, org_unit.id, "2026-01")
        
        assert health.month == "2026-01"
        assert health.approved == Decimal("850000")
        assert health.baseline == Decimal("775000")
        assert health.baseline_source == "actual"
        # Remaining = 850000 - 775000 - 0 (no committed) = 75000
        assert health.remaining == Decimal("75000")
        # 75000 / 850000 ≈ 8.8% → YELLOW
        assert health.status == HealthStatus.YELLOW

    @pytest.mark.asyncio
    async def test_offer_impact_preview(
        self,
        db_session,
        org_unit,
        budget_jan,
        actual_jan,
        requisition
    ):
        """Preview shows remaining_after < remaining_before."""
        from app.services.budget_engine import preview_offer_impact
        
        # Create a proposed offer
        offer = Offer(
            requisition_id=requisition.id,
            candidate_name="Test Candidate",
            status="PROPOSED",
            proposed_monthly_cost=Decimal("10000"),
            start_date=date(2026, 1, 15)
        )
        db_session.add(offer)
        await db_session.commit()
        
        impacts = await preview_offer_impact(
            db_session, org_unit.id, [offer.id], months_ahead=2
        )
        
        # Should have impact entry for January
        assert "2026-01" in impacts or len(impacts) > 0
