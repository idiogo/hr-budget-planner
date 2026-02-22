#!/usr/bin/env python3
"""
Seed script for HR Budget Planner.
Run with: python -m scripts.seed
"""

import asyncio
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.config import settings
from app.models import User, OrgUnit, Budget, Forecast, Actual, JobCatalog, Requisition, Offer
from app.utils.security import get_password_hash


async def seed_database():
    import re
    db_url = settings.database_url
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif db_url.startswith("postgresql://") and "+asyncpg" not in db_url:
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if "sslmode=" in db_url:
        db_url = re.sub(r'[?&]sslmode=[^&]*', '', db_url)
    engine = create_async_engine(db_url)
    AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with AsyncSessionLocal() as db:
        # Check if already seeded
        result = await db.execute(select(User).limit(1))
        if result.scalar_one_or_none():
            print("Database already seeded. Skipping.")
            return
        
        print("Seeding database...")
        
        # 1. Create Org Unit
        org_unit = OrgUnit(
            name="Tech Core",
            currency="BRL",
            overhead_multiplier=Decimal("1.80")
        )
        db.add(org_unit)
        await db.flush()
        print(f"Created org unit: {org_unit.name}")
        
        # 2. Create Users (password: password123)
        password_hash = get_password_hash("password123")
        
        admin = User(
            email="admin@example.com",
            name="Admin",
            password_hash=password_hash,
            role="ADMIN",
            org_unit_id=org_unit.id
        )
        
        manager = User(
            email="manager@example.com",
            name="João Silva",
            password_hash=password_hash,
            role="MANAGER",
            org_unit_id=org_unit.id
        )
        
        db.add_all([admin, manager])
        await db.flush()
        print(f"Created users: {admin.email}, {manager.email}")
        
        # 3. Create Job Catalog
        jobs_data = [
            ("Engineering", "Junior",  "Software Engineer Jr",       8000),
            ("Engineering", "Pleno",   "Software Engineer",         12000),
            ("Engineering", "Senior",  "Senior Software Engineer",  18000),
            ("Engineering", "Lead",    "Tech Lead",                 25000),
            ("Product",     "Junior",  "Product Analyst",            7000),
            ("Product",     "Pleno",   "Product Manager",           15000),
            ("Product",     "Senior",  "Senior Product Manager",    22000),
            ("Product",     "Lead",    "Head of Product",           30000),
        ]
        
        jobs = []
        for job_family, level, title, monthly_cost in jobs_data:
            job = JobCatalog(
                job_family=job_family,
                level=level,
                title=title,
                monthly_cost=Decimal(str(monthly_cost))
            )
            db.add(job)
            jobs.append(job)
        
        await db.flush()
        print(f"Created {len(jobs)} job catalog entries")
        
        # 4. Create Budgets Jan-Dec 2026 (valores reais)
        budget_amounts = {
            "2026-01": 10457000, "2026-02": 9925000,  "2026-03": 10017000,
            "2026-04": 10295000, "2026-05": 10257000, "2026-06": 10254000,
            "2026-07": 10683000, "2026-08": 11499000, "2026-09": 11094000,
            "2026-10": 11937000, "2026-11": 11433000, "2026-12": 11513000,
        }
        for month, amount in budget_amounts.items():
            budget = Budget(
                org_unit_id=org_unit.id,
                month=month,
                approved_amount=Decimal(str(amount))
            )
            db.add(budget)
        
        await db.flush()
        print(f"Created {len(budget_amounts)} budgets")
        
        # 5. Create Actuals Jan-Dec 2026 (valores reais)
        actual_amounts = {
            "2026-01": 10251000, "2026-02": 9818000,  "2026-03": 9931000,
            "2026-04": 10295000, "2026-05": 10257000, "2026-06": 10254000,
            "2026-07": 10683000, "2026-08": 11499000, "2026-09": 11094000,
            "2026-10": 11937000, "2026-11": 11433000, "2026-12": 11513000,
        }
        for month, amount in actual_amounts.items():
            actual = Actual(
                org_unit_id=org_unit.id,
                month=month,
                amount=Decimal(str(amount)),
                finalized=month <= "2026-03"  # first 3 months finalized
            )
            db.add(actual)
        
        await db.flush()
        print(f"Created {len(actual_amounts)} actuals")
        
        # 6. Create Forecasts Jan-Mar 2026
        forecast_amounts = {
            "2026-01": 10251000, "2026-02": 9818000, "2026-03": 9931000,
        }
        for month, amount in forecast_amounts.items():
            forecast = Forecast(
                org_unit_id=org_unit.id,
                month=month,
                amount=Decimal(str(amount)),
                source="manual"
            )
            db.add(forecast)
        
        await db.flush()
        print(f"Created {len(forecast_amounts)} forecasts")
        
        # 7. Create Requisitions
        job_senior = next(j for j in jobs if j.level == "Senior" and j.job_family == "Engineering")
        job_pleno_eng = next(j for j in jobs if j.level == "Pleno" and j.job_family == "Engineering")
        job_pleno_pm = next(j for j in jobs if j.level == "Pleno" and j.job_family == "Product")
        job_junior_eng = next(j for j in jobs if j.level == "Junior" and j.job_family == "Engineering")
        job_lead = next(j for j in jobs if j.level == "Lead" and j.job_family == "Engineering")
        job_junior_prod = next(j for j in jobs if j.level == "Junior" and j.job_family == "Product")
        
        reqs_data = [
            ("Senior Backend Engineer",  job_senior, "P0", "INTERVIEWING",  "2026-02", True),
            ("Frontend Developer",       job_pleno_eng,  "P1", "OPEN",          "2026-02", False),
            ("Product Manager",          job_pleno_pm,  "P1", "OFFER_PENDING", "2026-03", True),
            ("Junior Developer",         job_junior_eng, "P2", "DRAFT",         "2026-04", False),
            ("Tech Lead",                job_lead,   "P0", "INTERVIEWING",  "2026-03", False),
            ("Product Analyst",          job_junior_prod, "P3", "OPEN",          "2026-05", False),
        ]
        
        reqs = []
        for title, job, priority, status, target_month, has_candidate in reqs_data:
            req = Requisition(
                org_unit_id=org_unit.id,
                job_catalog_id=job.id,
                title=title,
                priority=priority,
                status=status,
                target_start_month=target_month,
                estimated_monthly_cost=job.monthly_cost,
                has_candidate_ready=has_candidate,
                owner_id=manager.id
            )
            db.add(req)
            reqs.append(req)
        
        await db.flush()
        print(f"Created {len(reqs)} requisitions")
        
        # 8. Create Offers
        req_senior = reqs[0]  # Senior Backend Engineer
        req_pm = reqs[2]      # Product Manager
        
        offers_data = [
            (req_senior, "Maria Santos",  "PROPOSED", 19000, date(2026, 2, 15)),
            (req_pm,     "Ana Oliveira",  "PROPOSED", 16000, date(2026, 3, 1)),
            (req_senior, "Pedro Costa",   "DRAFT",    18500, None),
        ]
        
        for req, candidate_name, status, cost, start_date in offers_data:
            offer = Offer(
                requisition_id=req.id,
                candidate_name=candidate_name,
                status=status,
                proposed_monthly_cost=Decimal(str(cost)),
                start_date=start_date
            )
            db.add(offer)
        
        await db.commit()
        print(f"Created {len(offers_data)} offers")
        
        print("\n✅ Database seeded successfully!")
        print("\nCredentials:")
        print("  Admin: admin@example.com / password123")
        print("  Manager: manager@example.com / password123")


if __name__ == "__main__":
    asyncio.run(seed_database())
