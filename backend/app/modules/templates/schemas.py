from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.exercises.schemas import LoadConvention, LoadType


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, from_attributes=True)


class PlannedSet(InputModel):
    set_type: Literal["warmup", "working"] = "working"
    target_reps_min: Annotated[int, Field(ge=1, le=999)]
    target_reps_max: Annotated[int, Field(ge=1, le=999)]
    target_weight_kg: Annotated[
        Decimal | None, Field(ge=0, le=Decimal("99999.999"), max_digits=8, decimal_places=3)
    ] = None
    target_rir: Annotated[int | None, Field(ge=0, le=10)] = None

    @model_validator(mode="after")
    def ordered_reps(self):
        if self.target_reps_max < self.target_reps_min:
            raise ValueError("Maximum reps must be at least minimum reps")
        return self


class TemplateExerciseInput(InputModel):
    exercise_id: UUID
    rest_seconds: Annotated[int, Field(ge=0, le=3600)] = 90
    notes: Annotated[str | None, Field(max_length=2000)] = None
    sets: Annotated[list[PlannedSet], Field(min_length=1, max_length=20)]


class TemplateInput(InputModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    exercises: Annotated[list[TemplateExerciseInput], Field(max_length=40)] = []


class TemplateUpdate(TemplateInput):
    version: Annotated[int, Field(ge=1)]


class TemplateExerciseResponse(TemplateExerciseInput):
    id: UUID
    position: int
    name: str
    load_type: LoadType
    load_convention: LoadConvention
    is_archived: bool


class TemplateSummary(BaseModel):
    id: UUID
    name: str
    version: int
    exercise_count: int
    set_count: int
    created_at: datetime
    updated_at: datetime


class TemplateResponse(TemplateSummary):
    exercises: list[TemplateExerciseResponse]


class TemplatePage(BaseModel):
    items: list[TemplateSummary]
    next_offset: int | None
