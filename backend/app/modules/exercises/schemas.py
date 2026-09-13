from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Equipment = Literal[
    "barbell", "dumbbell", "machine", "cable", "bodyweight", "band", "kettlebell", "other"
]
LoadType = Literal["external", "bodyweight", "assisted"]
LoadConvention = Literal["total", "per_hand", "none", "added", "assistance"]


class MuscleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    slug: str
    name: str


class ExerciseInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=120)
    equipment: Equipment
    load_type: LoadType
    load_convention: LoadConvention
    primary_muscle_id: UUID
    secondary_muscle_ids: list[UUID] = Field(default_factory=list, max_length=8)
    instructions: str | None = Field(default=None, max_length=3000)

    @model_validator(mode="after")
    def valid_combinations(self) -> Self:
        if len(set(self.secondary_muscle_ids)) != len(self.secondary_muscle_ids):
            raise ValueError("Duplicate muscles")
        if self.primary_muscle_id in self.secondary_muscle_ids:
            raise ValueError("Primary muscle cannot be secondary")
        allowed = {
            "external": {"total", "per_hand"},
            "bodyweight": {"none", "added"},
            "assisted": {"assistance"},
        }
        if self.load_convention not in allowed[self.load_type]:
            raise ValueError("Invalid load convention")
        return self


class ExerciseResponse(BaseModel):
    id: UUID
    name: str
    equipment: Equipment
    load_type: LoadType
    load_convention: LoadConvention
    instructions: str | None
    primary_muscle: MuscleResponse
    secondary_muscles: list[MuscleResponse]
    is_custom: bool
    is_favorite: bool
    created_at: datetime
    updated_at: datetime


class ExercisePage(BaseModel):
    items: list[ExerciseResponse]
    next_cursor: str | None


class FavoriteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_favorite: bool = Field(strict=True)
