from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from app.modules.exercises.schemas import LoadConvention, LoadType


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, str_strip_whitespace=True)


class WorkoutStart(Input):
    id: UUID
    template_id: UUID
    template_version: Annotated[int, Field(ge=1)]


class WorkoutSetInput(Input):
    id: UUID
    set_type: Literal["warmup", "working"]
    weight_kg: Annotated[
        Decimal | None, Field(ge=0, le=Decimal("99999.999"), max_digits=8, decimal_places=3)
    ] = None
    reps: Annotated[int | None, Field(ge=1, le=999)] = None
    rir: Annotated[int | None, Field(ge=0, le=10)] = None
    completed_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def completion(self):
        if self.completed_at and (self.weight_kg is None or self.reps is None):
            raise ValueError("Completed sets require weight and reps")
        return self


class WorkoutExerciseInput(Input):
    id: UUID
    exercise_id: UUID
    rest_seconds: Annotated[int, Field(ge=0, le=3600)]
    notes: Annotated[str | None, Field(max_length=2000)] = None
    sets: Annotated[list[WorkoutSetInput], Field(min_length=1, max_length=30)]


class WorkoutSync(Input):
    version: Annotated[int, Field(ge=1)]
    mutation_id: UUID
    status: Literal["active", "paused", "cancelled"]
    paused_at: AwareDatetime | None = None
    paused_seconds: Annotated[int, Field(ge=0, le=31536000)]
    finished_at: AwareDatetime | None = None
    rest_deadline: AwareDatetime | None = None
    notes: Annotated[str | None, Field(max_length=3000)] = None
    exercises: Annotated[list[WorkoutExerciseInput], Field(max_length=50)]

    @model_validator(mode="after")
    def invariants(self):
        if (self.status == "paused") != (self.paused_at is not None):
            raise ValueError("Invalid pause state")
        if (self.status == "cancelled") != (self.finished_at is not None):
            raise ValueError("Invalid finish state")
        ids = [e.id for e in self.exercises]
        sets = [s.id for e in self.exercises for s in e.sets]
        if len(set(ids)) != len(ids) or len(set(sets)) != len(sets):
            raise ValueError("Duplicate identifiers")
        return self


class WorkoutExerciseResponse(WorkoutExerciseInput):
    name_snapshot: str
    load_type_snapshot: LoadType
    load_convention_snapshot: LoadConvention


class WorkoutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    template_id: UUID | None
    name_snapshot: str
    status: Literal["active", "paused", "cancelled", "completed"]
    version: int
    started_at: datetime
    paused_at: datetime | None
    paused_seconds: int
    finished_at: datetime | None
    rest_deadline: datetime | None
    notes: str | None
    exercises: list[WorkoutExerciseResponse]


class WorkoutSyncResponse(BaseModel):
    workout: WorkoutResponse
    applied_version: int
