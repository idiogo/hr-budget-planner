import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Boolean, DateTime, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class OrgUnit(Base):
    __tablename__ = "org_units"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="BRL")
    overhead_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), default=Decimal("1.00")
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    users: Mapped[list["User"]] = relationship("User", back_populates="org_unit")
    budgets: Mapped[list["Budget"]] = relationship("Budget", back_populates="org_unit")
    forecasts: Mapped[list["Forecast"]] = relationship(
        "Forecast", back_populates="org_unit"
    )
    actuals: Mapped[list["Actual"]] = relationship("Actual", back_populates="org_unit")
    requisitions: Mapped[list["Requisition"]] = relationship(
        "Requisition", back_populates="org_unit"
    )
