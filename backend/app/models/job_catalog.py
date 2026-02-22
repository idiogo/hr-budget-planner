import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, DateTime, Numeric, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class JobCatalog(Base):
    __tablename__ = "job_catalog"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    job_family: Mapped[str] = mapped_column(String(100), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    monthly_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    hierarchy_level: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="BRL")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    requisitions: Mapped[list["Requisition"]] = relationship(
        "Requisition", back_populates="job_catalog"
    )
