import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum
from sqlalchemy import String, Boolean, DateTime, Numeric, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class RequisitionPriority(str, Enum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class RequisitionStatus(str, Enum):
    DRAFT = "DRAFT"
    OPEN = "OPEN"
    INTERVIEWING = "INTERVIEWING"
    OFFER_PENDING = "OFFER_PENDING"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"


class Requisition(Base):
    __tablename__ = "requisitions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    org_unit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("org_units.id"), nullable=False
    )
    job_catalog_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job_catalog.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    priority: Mapped[str] = mapped_column(String(10), default="P2")
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")
    target_start_month: Mapped[str | None] = mapped_column(String(7), nullable=True)
    estimated_monthly_cost: Mapped[Decimal | None] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    has_candidate_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    org_unit: Mapped["OrgUnit"] = relationship("OrgUnit", back_populates="requisitions")
    job_catalog: Mapped["JobCatalog"] = relationship(
        "JobCatalog", back_populates="requisitions"
    )
    owner: Mapped["User"] = relationship("User", back_populates="requisitions")
    offers: Mapped[list["Offer"]] = relationship("Offer", back_populates="requisition")
