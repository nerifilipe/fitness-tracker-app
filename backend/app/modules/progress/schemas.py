from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Metric = Literal["weight_kg", "waist_cm", "chest_cm", "arms_cm", "legs_cm"]


class MeasurementInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    weight_kg: Annotated[float, Field(ge=1, le=500, allow_inf_nan=False)] | None = None
    waist_cm: Annotated[float, Field(ge=1, le=400, allow_inf_nan=False)] | None = None
    chest_cm: Annotated[float, Field(ge=1, le=400, allow_inf_nan=False)] | None = None
    arms_cm: Annotated[float, Field(ge=1, le=200, allow_inf_nan=False)] | None = None
    legs_cm: Annotated[float, Field(ge=1, le=300, allow_inf_nan=False)] | None = None
    notes: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def has_measurement(self) -> Self:
        if all(
            getattr(self, key) is None
            for key in ("weight_kg", "waist_cm", "chest_cm", "arms_cm", "legs_cm")
        ):
            raise ValueError("At least one measurement is required")
        return self


class MeasurementResponse(MeasurementInput):
    model_config = ConfigDict(from_attributes=True)
    date: date
    created_at: datetime
    updated_at: datetime


class MetricValue(BaseModel):
    date: date
    value: float


class MetricTrend(BaseModel):
    latest: MetricValue | None
    change: float | None
    count: int


class ProgressSummary(BaseModel):
    today: date
    timezone: str
    start_date: date
    days: int
    metrics: dict[Metric, MetricTrend]
    points: list[MeasurementResponse]


class MeasurementPage(BaseModel):
    items: list[MeasurementResponse]
    next_before: date | None
