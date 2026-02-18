"""Tests for pro-rata calculations."""

import pytest
from datetime import date
from decimal import Decimal

from app.services.budget_engine import calculate_pro_rata, calculate_monthly_cost


class TestProRata:
    """Tests for pro-rata calculation."""

    def test_pro_rata_start_of_month(self):
        """Start on day 1 = full month."""
        result = calculate_pro_rata(date(2026, 1, 1), "2026-01")
        assert result == Decimal("1.0")

    def test_pro_rata_mid_month(self):
        """Start on Jan 15 in 31-day month = 17/31."""
        result = calculate_pro_rata(date(2026, 1, 15), "2026-01")
        expected = Decimal("17") / Decimal("31")
        assert abs(result - expected) < Decimal("0.001")

    def test_pro_rata_last_day(self):
        """Start on last day = 1/days_in_month."""
        result = calculate_pro_rata(date(2026, 1, 31), "2026-01")
        expected = Decimal("1") / Decimal("31")
        assert abs(result - expected) < Decimal("0.001")

    def test_pro_rata_february(self):
        """February has 28 days in 2026."""
        # Start Feb 15 = 14/28 = 0.5
        result = calculate_pro_rata(date(2026, 2, 15), "2026-02")
        expected = Decimal("14") / Decimal("28")
        assert abs(result - expected) < Decimal("0.001")

    def test_pro_rata_full_month_if_started_before(self):
        """If start date is before the month, return 1.0."""
        result = calculate_pro_rata(date(2025, 12, 1), "2026-01")
        assert result == Decimal("1.0")

    def test_pro_rata_zero_if_starts_after(self):
        """If start date is after the month, return 0.0."""
        result = calculate_pro_rata(date(2026, 3, 1), "2026-01")
        assert result == Decimal("0.0")


class TestMonthlyCost:
    """Tests for monthly cost calculation."""

    def test_monthly_cost_full_month(self):
        """Full month with overhead."""
        cost = calculate_monthly_cost(
            base_cost=Decimal("10000"),
            overhead_multiplier=Decimal("1.80"),
            start_date=date(2026, 1, 1),
            month="2026-01"
        )
        assert cost == Decimal("18000.00")

    def test_monthly_cost_with_overhead(self):
        """Base cost with overhead multiplier."""
        cost = calculate_monthly_cost(
            base_cost=Decimal("10000"),
            overhead_multiplier=Decimal("1.80"),
            start_date=date(2026, 1, 1),
            month="2026-01"
        )
        assert cost == Decimal("18000")

    def test_monthly_cost_partial_month(self):
        """Partial month with pro-rata."""
        # Start Jan 16 in 31-day month = 16/31 ≈ 0.516
        # 10000 * 1.80 * (16/31) ≈ 9290.32
        cost = calculate_monthly_cost(
            base_cost=Decimal("10000"),
            overhead_multiplier=Decimal("1.80"),
            start_date=date(2026, 1, 16),
            month="2026-01"
        )
        expected = Decimal("10000") * Decimal("1.80") * (Decimal("16") / Decimal("31"))
        # Allow tolerance for rounding differences
        assert abs(cost - expected.quantize(Decimal("0.01"))) < Decimal("1.00")

    def test_monthly_cost_no_overhead(self):
        """Cost without overhead (multiplier = 1)."""
        cost = calculate_monthly_cost(
            base_cost=Decimal("10000"),
            overhead_multiplier=Decimal("1.00"),
            start_date=date(2026, 1, 1),
            month="2026-01"
        )
        assert cost == Decimal("10000.00")

    def test_monthly_cost_zero_if_not_started(self):
        """Zero cost if not yet started."""
        cost = calculate_monthly_cost(
            base_cost=Decimal("10000"),
            overhead_multiplier=Decimal("1.80"),
            start_date=date(2026, 2, 1),
            month="2026-01"
        )
        assert cost == Decimal("0.00")
