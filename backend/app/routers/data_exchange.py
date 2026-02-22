"""CSV export/import for all entities."""
import csv
import io
import uuid
from decimal import Decimal
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, JobCatalog, OrgUnit, Budget, Actual
from app.middleware.auth import require_admin
from app.middleware.audit import create_audit_log, get_client_ip
from app.utils.security import get_password_hash

router = APIRouter(prefix="/api/export", tags=["data-exchange"])


def _csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    if not rows:
        output = io.StringIO()
        output.write("")
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys())
    writer.writeheader()
    for row in rows:
        writer.writerow({k: str(v) if v is not None else "" for k, v in row.items()})
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ==================== EXPORTS ====================

@router.get("/job-catalog")
async def export_job_catalog(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(JobCatalog).order_by(JobCatalog.hierarchy_level, JobCatalog.job_family))
    jobs = result.scalars().all()
    rows = [
        {
            "job_family": j.job_family,
            "level": j.level,
            "title": j.title,
            "monthly_cost": j.monthly_cost,
            "hierarchy_level": j.hierarchy_level,
            "currency": j.currency,
            "active": j.active,
        }
        for j in jobs
    ]
    return _csv_response(rows, "job_catalog.csv")


@router.get("/org-units")
async def export_org_units(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(OrgUnit).order_by(OrgUnit.name))
    orgs = result.scalars().all()
    rows = [
        {
            "name": o.name,
            "currency": o.currency,
            "active": o.active,
        }
        for o in orgs
    ]
    return _csv_response(rows, "org_units.csv")


@router.get("/users")
async def export_users(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(User)
        .options(selectinload(User.org_unit), selectinload(User.job_catalog))
        .order_by(User.name)
    )
    users = result.scalars().all()
    rows = [
        {
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "org_unit": u.org_unit.name if u.org_unit else "",
            "job_catalog": u.job_catalog.title if u.job_catalog else "",
            "active": u.active,
        }
        for u in users
    ]
    return _csv_response(rows, "users.csv")


@router.get("/budgets/{org_unit_id}")
async def export_budgets(
    org_unit_id: uuid.UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Budget).where(Budget.org_unit_id == org_unit_id).order_by(Budget.month)
    )
    budgets = result.scalars().all()
    
    # Get org unit name
    org = await db.get(OrgUnit, org_unit_id)
    org_name = org.name if org else "unknown"
    
    rows = [
        {
            "month": b.month,
            "approved_amount": b.approved_amount,
            "currency": b.currency,
            "locked": b.locked,
        }
        for b in budgets
    ]
    return _csv_response(rows, f"budgets_{org_name}.csv")


@router.get("/actuals/{org_unit_id}")
async def export_actuals(
    org_unit_id: uuid.UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Actual).where(Actual.org_unit_id == org_unit_id).order_by(Actual.month)
    )
    actuals = result.scalars().all()
    
    org = await db.get(OrgUnit, org_unit_id)
    org_name = org.name if org else "unknown"
    
    rows = [
        {
            "month": a.month,
            "amount": a.amount,
            "currency": a.currency,
            "finalized": a.finalized,
        }
        for a in actuals
    ]
    return _csv_response(rows, f"actuals_{org_name}.csv")


# ==================== IMPORTS ====================

import_router = APIRouter(prefix="/api/import", tags=["data-exchange"])


def _parse_csv(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig")  # Handle BOM
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def _parse_bool(val: str) -> bool:
    return val.strip().lower() in ("true", "1", "yes", "sim")


def _parse_decimal(val: str) -> Decimal:
    return Decimal(val.strip().replace(",", "."))


@import_router.post("/job-catalog")
async def import_job_catalog(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Import job catalog from CSV. Matches by job_family+level+title, creates or updates."""
    content = await file.read()
    rows = _parse_csv(content)
    
    created, updated = 0, 0
    for row in rows:
        result = await db.execute(
            select(JobCatalog).where(
                JobCatalog.job_family == row["job_family"],
                JobCatalog.level == row["level"],
                JobCatalog.title == row["title"],
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.monthly_cost = _parse_decimal(row["monthly_cost"])
            existing.hierarchy_level = int(row.get("hierarchy_level", 100))
            existing.currency = row.get("currency", "BRL")
            existing.active = _parse_bool(row.get("active", "true"))
            updated += 1
        else:
            job = JobCatalog(
                job_family=row["job_family"],
                level=row["level"],
                title=row["title"],
                monthly_cost=_parse_decimal(row["monthly_cost"]),
                hierarchy_level=int(row.get("hierarchy_level", 100)),
                currency=row.get("currency", "BRL"),
                active=_parse_bool(row.get("active", "true")),
            )
            db.add(job)
            created += 1
    
    await db.commit()
    await create_audit_log(
        db, user.id, "IMPORT", "job_catalog", uuid.uuid4(),
        changes={"created": created, "updated": updated, "file": file.filename},
        ip_address=get_client_ip(request),
    )
    return {"created": created, "updated": updated}


@import_router.post("/org-units")
async def import_org_units(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Import org units from CSV. Matches by name, creates or updates."""
    content = await file.read()
    rows = _parse_csv(content)
    
    created, updated = 0, 0
    for row in rows:
        result = await db.execute(select(OrgUnit).where(OrgUnit.name == row["name"]))
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.currency = row.get("currency", "BRL")
            existing.active = _parse_bool(row.get("active", "true"))
            updated += 1
        else:
            org = OrgUnit(
                name=row["name"],
                currency=row.get("currency", "BRL"),
                active=_parse_bool(row.get("active", "true")),
            )
            db.add(org)
            created += 1
    
    await db.commit()
    await create_audit_log(
        db, user.id, "IMPORT", "org_unit", uuid.uuid4(),
        changes={"created": created, "updated": updated, "file": file.filename},
        ip_address=get_client_ip(request),
    )
    return {"created": created, "updated": updated}


@import_router.post("/users")
async def import_users(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Import users from CSV. Matches by email, creates or updates. New users get default password 'changeme123'."""
    content = await file.read()
    rows = _parse_csv(content)
    
    created, updated = 0, 0
    for row in rows:
        result = await db.execute(select(User).where(User.email == row["email"]))
        existing = result.scalar_one_or_none()
        
        # Resolve org_unit by name
        org_unit_id = None
        if row.get("org_unit"):
            org_result = await db.execute(select(OrgUnit).where(OrgUnit.name == row["org_unit"]))
            org = org_result.scalar_one_or_none()
            if org:
                org_unit_id = org.id
        
        # Resolve job_catalog by title
        job_catalog_id = None
        if row.get("job_catalog"):
            job_result = await db.execute(select(JobCatalog).where(JobCatalog.title == row["job_catalog"]))
            job = job_result.scalar_one_or_none()
            if job:
                job_catalog_id = job.id
        
        if existing:
            existing.name = row["name"]
            existing.role = row.get("role", "MANAGER")
            existing.org_unit_id = org_unit_id
            existing.job_catalog_id = job_catalog_id
            existing.active = _parse_bool(row.get("active", "true"))
            updated += 1
        else:
            new_user = User(
                email=row["email"],
                name=row["name"],
                password_hash=get_password_hash("changeme123"),
                role=row.get("role", "MANAGER"),
                org_unit_id=org_unit_id,
                job_catalog_id=job_catalog_id,
                active=_parse_bool(row.get("active", "true")),
            )
            db.add(new_user)
            created += 1
    
    await db.commit()
    await create_audit_log(
        db, user.id, "IMPORT", "user", uuid.uuid4(),
        changes={"created": created, "updated": updated, "file": file.filename},
        ip_address=get_client_ip(request),
    )
    return {"created": created, "updated": updated, "note": "New users have default password: changeme123"}


@import_router.post("/budgets/{org_unit_id}")
async def import_budgets(
    org_unit_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Import budgets from CSV. Matches by month, creates or updates."""
    content = await file.read()
    rows = _parse_csv(content)
    
    created, updated = 0, 0
    for row in rows:
        result = await db.execute(
            select(Budget).where(Budget.org_unit_id == org_unit_id, Budget.month == row["month"])
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.approved_amount = _parse_decimal(row["approved_amount"])
            existing.currency = row.get("currency", "BRL")
            existing.locked = _parse_bool(row.get("locked", "false"))
            updated += 1
        else:
            budget = Budget(
                org_unit_id=org_unit_id,
                month=row["month"],
                approved_amount=_parse_decimal(row["approved_amount"]),
                currency=row.get("currency", "BRL"),
                locked=_parse_bool(row.get("locked", "false")),
            )
            db.add(budget)
            created += 1
    
    await db.commit()
    await create_audit_log(
        db, user.id, "IMPORT", "budget", uuid.uuid4(),
        changes={"created": created, "updated": updated, "file": file.filename},
        ip_address=get_client_ip(request),
    )
    return {"created": created, "updated": updated}


@import_router.post("/actuals/{org_unit_id}")
async def import_actuals(
    org_unit_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Import actuals from CSV. Matches by month, creates or updates."""
    content = await file.read()
    rows = _parse_csv(content)
    
    created, updated = 0, 0
    for row in rows:
        result = await db.execute(
            select(Actual).where(Actual.org_unit_id == org_unit_id, Actual.month == row["month"])
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.amount = _parse_decimal(row["amount"])
            existing.currency = row.get("currency", "BRL")
            existing.finalized = _parse_bool(row.get("finalized", "false"))
            updated += 1
        else:
            actual = Actual(
                org_unit_id=org_unit_id,
                month=row["month"],
                amount=_parse_decimal(row["amount"]),
                currency=row.get("currency", "BRL"),
                finalized=_parse_bool(row.get("finalized", "false")),
                created_by=user.id,
            )
            db.add(actual)
            created += 1
    
    await db.commit()
    await create_audit_log(
        db, user.id, "IMPORT", "actual", uuid.uuid4(),
        changes={"created": created, "updated": updated, "file": file.filename},
        ip_address=get_client_ip(request),
    )
    return {"created": created, "updated": updated}
