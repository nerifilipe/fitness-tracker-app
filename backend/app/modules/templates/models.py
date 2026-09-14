from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.modules.exercises.models import Exercise


class WorkoutTemplate(Base):
    __tablename__ = "workout_templates"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0", name="ck_templates_name"),
        CheckConstraint("version > 0", name="ck_templates_version"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    version: Mapped[int] = mapped_column(default=1)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    exercises: Mapped[list["TemplateExercise"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="TemplateExercise.position"
    )


class TemplateExercise(Base):
    __tablename__ = "workout_template_exercises"
    __table_args__ = (
        UniqueConstraint(
            "template_id",
            "position",
            name="uq_template_exercise_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("position >= 0", name="ck_template_exercise_position"),
        CheckConstraint("rest_seconds BETWEEN 0 AND 3600", name="ck_template_exercise_rest"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    template_id: Mapped[UUID] = mapped_column(
        ForeignKey("workout_templates.id", ondelete="CASCADE")
    )
    exercise_id: Mapped[UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="RESTRICT"), index=True
    )
    position: Mapped[int]
    rest_seconds: Mapped[int]
    notes: Mapped[str | None] = mapped_column(Text)
    exercise: Mapped[Exercise] = relationship(lazy="joined", innerjoin=True)
    sets: Mapped[list["TemplateSet"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="TemplateSet.position"
    )


class TemplateSet(Base):
    __tablename__ = "workout_template_sets"
    __table_args__ = (
        UniqueConstraint(
            "template_exercise_id",
            "position",
            name="uq_template_set_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("position >= 0", name="ck_template_set_position"),
        CheckConstraint("set_type IN ('warmup','working')", name="ck_template_set_type"),
        CheckConstraint(
            "target_reps_min BETWEEN 1 AND 999 AND target_reps_max BETWEEN target_reps_min AND 999",
            name="ck_template_set_reps",
        ),
        CheckConstraint("target_weight_kg BETWEEN 0 AND 99999.999", name="ck_template_set_weight"),
        CheckConstraint("target_rir BETWEEN 0 AND 10", name="ck_template_set_rir"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    template_exercise_id: Mapped[UUID] = mapped_column(
        ForeignKey("workout_template_exercises.id", ondelete="CASCADE")
    )
    position: Mapped[int]
    set_type: Mapped[str] = mapped_column(String(12))
    target_reps_min: Mapped[int]
    target_reps_max: Mapped[int]
    target_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    target_rir: Mapped[int | None]
