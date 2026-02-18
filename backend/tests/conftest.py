import pytest
import asyncio
from typing import AsyncGenerator
from decimal import Decimal
from datetime import date
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.database import Base
from app.models import User, OrgUnit, Budget, Forecast, Actual, JobCatalog, Requisition, Offer
# Use a simple hash for tests to avoid bcrypt issues
def get_test_password_hash(password: str) -> str:
    from hashlib import sha256
    return sha256(password.encode()).hexdigest()


# Use SQLite for tests (sync compatible with async)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    AsyncSessionLocal = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with AsyncSessionLocal() as session:
        yield session
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()


@pytest.fixture
async def org_unit(db_session: AsyncSession) -> OrgUnit:
    """Create a test org unit."""
    org = OrgUnit(
        name="Test Org",
        currency="BRL",
        overhead_multiplier=Decimal("1.80")
    )
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)
    return org


@pytest.fixture
async def user(db_session: AsyncSession, org_unit: OrgUnit) -> User:
    """Create a test user."""
    user = User(
        email="test@example.com",
        name="Test User",
        password_hash=get_test_password_hash("password123"),
        role="MANAGER",
        org_unit_id=org_unit.id
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def job_catalog(db_session: AsyncSession) -> JobCatalog:
    """Create a test job catalog entry."""
    job = JobCatalog(
        job_family="Engineering",
        level="Senior",
        title="Senior Software Engineer",
        monthly_cost=Decimal("18000")
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    return job


@pytest.fixture
async def budget_jan(db_session: AsyncSession, org_unit: OrgUnit) -> Budget:
    """Create a test budget for January."""
    budget = Budget(
        org_unit_id=org_unit.id,
        month="2026-01",
        approved_amount=Decimal("850000")
    )
    db_session.add(budget)
    await db_session.commit()
    await db_session.refresh(budget)
    return budget


@pytest.fixture
async def forecast_jan(db_session: AsyncSession, org_unit: OrgUnit) -> Forecast:
    """Create a test forecast for January."""
    forecast = Forecast(
        org_unit_id=org_unit.id,
        month="2026-01",
        amount=Decimal("780000"),
        source="manual"
    )
    db_session.add(forecast)
    await db_session.commit()
    await db_session.refresh(forecast)
    return forecast


@pytest.fixture
async def actual_jan(db_session: AsyncSession, org_unit: OrgUnit) -> Actual:
    """Create a test actual for January."""
    actual = Actual(
        org_unit_id=org_unit.id,
        month="2026-01",
        amount=Decimal("775000"),
        finalized=True
    )
    db_session.add(actual)
    await db_session.commit()
    await db_session.refresh(actual)
    return actual


@pytest.fixture
async def requisition(
    db_session: AsyncSession,
    org_unit: OrgUnit,
    job_catalog: JobCatalog,
    user: User
) -> Requisition:
    """Create a test requisition."""
    req = Requisition(
        org_unit_id=org_unit.id,
        job_catalog_id=job_catalog.id,
        title="Test Requisition",
        priority="P1",
        status="OPEN",
        target_start_month="2026-02",
        estimated_monthly_cost=job_catalog.monthly_cost,
        owner_id=user.id
    )
    db_session.add(req)
    await db_session.commit()
    await db_session.refresh(req)
    return req


@pytest.fixture
async def accepted_offer(
    db_session: AsyncSession,
    requisition: Requisition
) -> Offer:
    """Create an accepted offer."""
    offer = Offer(
        requisition_id=requisition.id,
        candidate_name="Test Candidate",
        status="ACCEPTED",
        proposed_monthly_cost=Decimal("19000"),
        final_monthly_cost=Decimal("19000"),
        start_date=date(2026, 2, 1)
    )
    db_session.add(offer)
    await db_session.commit()
    await db_session.refresh(offer)
    return offer
