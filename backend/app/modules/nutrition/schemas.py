from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Meal = Literal["breakfast", "lunch", "dinner", "snack"]
Quantity = Annotated[float, Field(gt=0, le=10000, allow_inf_nan=False)]
Nutrient = Annotated[float, Field(ge=0, le=1000, allow_inf_nan=False)]


class NutritionValues(BaseModel):
    model_config = ConfigDict(extra="forbid")
    calories: float
    protein: float
    carbs: float
    fat: float


class FoodInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    brand: str = Field(default="", max_length=120)
    unit: Literal["g", "ml"] = "g"
    calories: Annotated[float, Field(ge=0, le=1000, allow_inf_nan=False)]
    protein: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
    carbs: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
    fat: Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]
    serving_quantity: Quantity | None = None
    serving_label: str | None = Field(default=None, max_length=120)


class FoodSnapshot(FoodInput):
    source: Literal["openfoodfacts", "custom"]
    source_code: str | None = None


class FoodResponse(FoodSnapshot):
    id: UUID
    is_favorite: bool
    last_quantity: float | None


class FoodSearch(BaseModel):
    items: list[FoodSnapshot]
    page: int
    has_more: bool


class FoodImport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(pattern=r"^\d{8,14}$")


class EntryInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    food_id: UUID
    date: date
    meal: Meal
    quantity: Quantity


class EntryResponse(EntryInput):
    id: UUID
    food: FoodSnapshot
    totals: NutritionValues
    created_at: datetime


class NutritionGoals(BaseModel):
    model_config = ConfigDict(extra="forbid")
    calories: Annotated[float, Field(gt=0, le=20000, allow_inf_nan=False)] | None = None
    protein: Nutrient | None = None
    carbs: Nutrient | None = None
    fat: Nutrient | None = None


class NutritionDay(BaseModel):
    date: date
    timezone: str
    entries: list[EntryResponse]
    totals: NutritionValues
    goals: NutritionGoals


class MealCopy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_date: date
    source_meal: Meal
    target_date: date
    target_meal: Meal
