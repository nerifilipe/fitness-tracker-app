from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel

from app.modules.exercises.schemas import LoadConvention, LoadType


class StrengthExercise(BaseModel):
    id: UUID
    name: str
    sessions: int
    last_trained: datetime


class StrengthExercisePage(BaseModel):
    items: list[StrengthExercise]
    next_cursor: str | None


class StrengthGroup(BaseModel):
    load_type: LoadType
    load_convention: LoadConvention


class StrengthSet(BaseModel):
    weight_kg: float
    reps: int
    rir: int | None


class StrengthSession(BaseModel):
    workout_id: UUID
    workout_name: str
    started_at: datetime
    completed_sets: int
    total_reps: int
    max_weight_kg: float
    volume_kg: float | None
    estimated_1rm: float | None
    sets: list[StrengthSet]


class StrengthBest(BaseModel):
    value: float
    weight_kg: float
    reps: int
    workout_id: UUID
    started_at: datetime


class StrengthRecords(BaseModel):
    heaviest: StrengthBest | None
    estimated_1rm: StrengthBest | None
    reps_at_latest_weight: StrengthBest | None


class StrengthPoint(BaseModel):
    date: date
    value: float


class StrengthOverview(BaseModel):
    exercise_id: UUID
    exercise_name: str
    timezone: str
    groups: list[StrengthGroup]
    selected: StrengthGroup
    days: int
    chart_metric: str
    points: list[StrengthPoint]
    records: StrengthRecords
    latest: StrengthSession | None
    previous: StrengthSession | None


class StrengthSessionPage(BaseModel):
    items: list[StrengthSession]
    next_cursor: str | None
