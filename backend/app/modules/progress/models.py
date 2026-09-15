from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base

METRICS = ("weight_kg", "waist_cm", "chest_cm", "arms_cm", "legs_cm")
LIMITS = {"weight_kg": 500, "waist_cm": 400, "chest_cm": 400, "arms_cm": 200, "legs_cm": 300}


class BodyMeasurement(Base):
    __tablename__ = "body_measurements"
    __table_args__ = (
        CheckConstraint(
            " OR ".join(f"{field} IS NOT NULL" for field in METRICS),
            name="ck_body_measurements_nonempty",
        ),
        *(
            CheckConstraint(
                f"{field} IS NULL OR ({field} >= 1 AND {field} <= {limit})",
                name=f"ck_body_measurements_{field}",
            )
            for field, limit in LIMITS.items()
        ),
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))
    waist_cm: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))
    chest_cm: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))
    arms_cm: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))
    legs_cm: Mapped[Decimal | None] = mapped_column(Numeric(7, 3))
    notes: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
