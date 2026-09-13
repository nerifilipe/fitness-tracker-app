from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base

EQUIPMENT_CHECK = (
    "equipment IN ('barbell','dumbbell','machine','cable','bodyweight','band','kettlebell','other')"
)
LOAD_CHECK = (
    "(load_type = 'external' AND load_convention IN ('total','per_hand')) OR "
    "(load_type = 'bodyweight' AND load_convention IN ('none','added')) OR "
    "(load_type = 'assisted' AND load_convention = 'assistance')"
)


class MuscleGroup(Base):
    __tablename__ = "muscle_groups"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Exercise(Base):
    __tablename__ = "exercises"
    __table_args__ = (
        CheckConstraint(EQUIPMENT_CHECK, name="ck_exercises_equipment"),
        CheckConstraint(LOAD_CHECK, name="ck_exercises_load"),
        CheckConstraint("length(trim(name)) > 0", name="ck_exercises_name"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    name: Mapped[str] = mapped_column(String(120))
    equipment: Mapped[str] = mapped_column(String(20))
    load_type: Mapped[str] = mapped_column(String(20))
    load_convention: Mapped[str] = mapped_column(String(20))
    instructions: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    muscles: Mapped[list["ExerciseMuscle"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )


Index("ix_exercises_owner_name", Exercise.owner_id, func.lower(Exercise.name), Exercise.id)


class ExerciseMuscle(Base):
    __tablename__ = "exercise_muscles"
    __table_args__ = (
        CheckConstraint("role IN ('primary','secondary')", name="ck_exercise_muscles_role"),
        Index(
            "ix_exercise_muscles_primary",
            "exercise_id",
            unique=True,
            postgresql_where=text("role = 'primary'"),
        ),
        Index("ix_exercise_muscles_group", "muscle_group_id", "exercise_id"),
    )
    exercise_id: Mapped[UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True
    )
    muscle_group_id: Mapped[UUID] = mapped_column(
        ForeignKey("muscle_groups.id", ondelete="RESTRICT"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(12))
    muscle: Mapped[MuscleGroup] = relationship(lazy="joined")


class UserExercise(Base):
    __tablename__ = "user_exercises"
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    exercise_id: Mapped[UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=True)
