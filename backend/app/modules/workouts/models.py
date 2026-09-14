from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Workout(Base):
    __tablename__ = "workouts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active','paused','cancelled','completed')", name="ck_workout_status"
        ),
        CheckConstraint("version > 0 AND paused_seconds >= 0", name="ck_workout_numbers"),
        CheckConstraint("(status = 'paused') = (paused_at IS NOT NULL)", name="ck_workout_pause"),
        CheckConstraint(
            "(status IN ('cancelled','completed')) = (finished_at IS NOT NULL)",
            name="ck_workout_finish",
        ),
        CheckConstraint(
            "finished_at IS NULL OR finished_at >= started_at", name="ck_workout_dates"
        ),
        Index(
            "uq_workout_live_user",
            "user_id",
            unique=True,
            postgresql_where=text("status IN ('active','paused')"),
        ),
        Index("ix_workout_user_started", "user_id", "started_at", "id"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    template_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("workout_templates.id", ondelete="SET NULL"), index=True
    )
    create_hash: Mapped[str] = mapped_column(String(64))
    name_snapshot: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(12), default="active")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_seconds: Mapped[int] = mapped_column(default=0)
    rest_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    exercises: Mapped[list["WorkoutExercise"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="WorkoutExercise.position"
    )


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"
    __table_args__ = (
        UniqueConstraint(
            "workout_id",
            "position",
            name="uq_workout_exercise_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint(
            "position >= 0 AND rest_seconds BETWEEN 0 AND 3600", name="ck_workout_exercise_numbers"
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True)
    workout_id: Mapped[UUID] = mapped_column(ForeignKey("workouts.id", ondelete="CASCADE"))
    exercise_id: Mapped[UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="RESTRICT"), index=True
    )
    position: Mapped[int]
    name_snapshot: Mapped[str] = mapped_column(String(120))
    load_type_snapshot: Mapped[str] = mapped_column(String(20))
    load_convention_snapshot: Mapped[str] = mapped_column(String(20))
    rest_seconds: Mapped[int]
    notes: Mapped[str | None] = mapped_column(Text)
    sets: Mapped[list["WorkoutSet"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True, order_by="WorkoutSet.position"
    )


class WorkoutSet(Base):
    __tablename__ = "workout_sets"
    __table_args__ = (
        UniqueConstraint(
            "workout_exercise_id",
            "position",
            name="uq_workout_set_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("position >= 0", name="ck_workout_set_position"),
        CheckConstraint("set_type IN ('warmup','working')", name="ck_workout_set_type"),
        CheckConstraint("weight_kg BETWEEN 0 AND 99999.999", name="ck_workout_set_weight"),
        CheckConstraint("reps BETWEEN 1 AND 999", name="ck_workout_set_reps"),
        CheckConstraint("rir BETWEEN 0 AND 10", name="ck_workout_set_rir"),
        CheckConstraint(
            "completed_at IS NULL OR (reps IS NOT NULL AND weight_kg IS NOT NULL)",
            name="ck_workout_set_complete",
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True)
    workout_exercise_id: Mapped[UUID] = mapped_column(
        ForeignKey("workout_exercises.id", ondelete="CASCADE")
    )
    position: Mapped[int]
    set_type: Mapped[str] = mapped_column(String(12))
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    reps: Mapped[int | None]
    rir: Mapped[int | None]
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WorkoutMutation(Base):
    __tablename__ = "workout_mutations"
    workout_id: Mapped[UUID] = mapped_column(
        ForeignKey("workouts.id", ondelete="CASCADE"), primary_key=True
    )
    mutation_id: Mapped[UUID] = mapped_column(primary_key=True)
    payload_hash: Mapped[str] = mapped_column(String(64))
    applied_version: Mapped[int]
