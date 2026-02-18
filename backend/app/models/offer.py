import uuid
from datetime import datetime, date
from decimal import Decimal
from enum import Enum
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Text, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class OfferStatus(str, Enum):
    DRAFT = "DRAFT"
    PROPOSED = "PROPOSED"
    APPROVED = "APPROVED"
    SENT = "SENT"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    HOLD = "HOLD"
    CANCELLED = "CANCELLED"


class Offer(Base):
    __tablename__ = "offers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    requisition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("requisitions.id"), nullable=False
    )
    candidate_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT")
    proposed_monthly_cost: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False
    )
    final_monthly_cost: Mapped[Decimal | None] = mapped_column(
        Numeric(15, 2), nullable=True
    )
    currency: Mapped[str] = mapped_column(String(3), default="BRL")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    hold_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    hold_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    requisition: Mapped["Requisition"] = relationship(
        "Requisition", back_populates="offers"
    )
