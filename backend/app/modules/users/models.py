from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("weekly_workout_target BETWEEN 1 AND 14", name="ck_users_weekly_target"),
        CheckConstraint("unit_system IN ('metric', 'imperial')", name="ck_users_units"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320))
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(80))
    timezone: Mapped[str] = mapped_column(String(80), default="Europe/Lisbon")
    unit_system: Mapped[str] = mapped_column(String(10), default="metric")
    weekly_workout_target: Mapped[int] = mapped_column(default=4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


Index("ix_users_email_lower", func.lower(User.email), unique=True)
