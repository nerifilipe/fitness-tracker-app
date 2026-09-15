from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Food(Base):
    __tablename__ = "nutrition_foods"
    __table_args__ = (
        UniqueConstraint("user_id", "source_code", name="uq_nutrition_food_source"),
        Index("ix_nutrition_foods_user_recent", "user_id", "last_used_at"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    source_code: Mapped[str | None] = mapped_column(String(14))
    snapshot: Mapped[dict] = mapped_column(JSONB)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    last_quantity: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MealEntry(Base):
    __tablename__ = "nutrition_entries"
    __table_args__ = (
        CheckConstraint("quantity > 0 AND quantity <= 10000", name="ck_nutrition_quantity"),
        CheckConstraint("meal IN ('breakfast','lunch','dinner','snack')", name="ck_nutrition_meal"),
        Index("ix_nutrition_entries_user_date", "user_id", "date"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    food_id: Mapped[UUID] = mapped_column(ForeignKey("nutrition_foods.id", ondelete="RESTRICT"))
    date: Mapped[date] = mapped_column(Date)
    meal: Mapped[str] = mapped_column(String(12))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    snapshot: Mapped[dict] = mapped_column(JSONB)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class NutritionGoal(Base):
    __tablename__ = "nutrition_goals"
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    targets: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class NutritionCopy(Base):
    __tablename__ = "nutrition_copies"
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    id: Mapped[UUID] = mapped_column(primary_key=True)
    request: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
