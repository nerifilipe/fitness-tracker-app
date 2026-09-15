from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response

from app.core.errors import DomainError, ErrorResponse
from app.db.session import DatabaseSession
from app.modules.auth.dependencies import CurrentUser
from app.modules.exercises.schemas import FavoriteInput
from app.modules.nutrition import service
from app.modules.nutrition.schemas import (
    EntryInput,
    EntryResponse,
    FoodImport,
    FoodInput,
    FoodResponse,
    FoodSearch,
    MealCopy,
    NutritionDay,
    NutritionGoals,
)

router = APIRouter(
    prefix="/nutrition",
    tags=["nutrition"],
    responses={code: {"model": ErrorResponse} for code in (401, 404, 409, 422, 429, 503)},
)


@router.get("/search", response_model=FoodSearch)
def search(
    user: CurrentUser,
    request: Request,
    q: Annotated[str, Query(min_length=2, max_length=100)],
    page: Annotated[int, Query(ge=1, le=50)] = 1,
) -> FoodSearch:
    if len(q.strip()) < 2:
        raise DomainError("search_too_short", "Escreve pelo menos duas letras.", 422)
    return request.app.state.food_provider.search(q.strip(), page)


@router.get("/foods", response_model=list[FoodResponse])
def foods(
    user: CurrentUser,
    db: DatabaseSession,
    favorites: bool = False,
    q: Annotated[str, Query(max_length=100)] = "",
):
    return service.foods(db, user.id, favorites, q)


@router.post("/foods/import", response_model=FoodResponse)
def import_food(data: FoodImport, user: CurrentUser, db: DatabaseSession, request: Request):
    snapshot = request.app.state.food_provider.product(data.code)
    return service.save_food(db, user.id, snapshot)


@router.post("/foods", response_model=FoodResponse, status_code=201)
def custom(data: FoodInput, user: CurrentUser, db: DatabaseSession):
    return service.custom_food(db, user.id, data)


@router.put("/foods/{food_id}/favorite", response_model=FoodResponse)
def favorite(food_id: UUID, data: FavoriteInput, user: CurrentUser, db: DatabaseSession):
    return service.favorite(db, user.id, food_id, data.is_favorite)


@router.get("/diary", response_model=NutritionDay)
def diary(user: CurrentUser, db: DatabaseSession, day: date | None = None):
    return service.diary(db, user, day)


@router.put("/goals", response_model=NutritionGoals)
def goals(data: NutritionGoals, user: CurrentUser, db: DatabaseSession):
    return service.save_goals(db, user.id, data)


@router.put("/entries/{entry_id}", response_model=EntryResponse)
def save(entry_id: UUID, data: EntryInput, user: CurrentUser, db: DatabaseSession):
    return service.save_entry(db, user.id, entry_id, data)


@router.delete("/entries/{entry_id}", status_code=204)
def remove(entry_id: UUID, user: CurrentUser, db: DatabaseSession):
    service.remove_entry(db, user.id, entry_id)
    return Response(status_code=204)


@router.put("/meal-copies/{copy_id}", response_model=NutritionDay)
def copy(copy_id: UUID, data: MealCopy, user: CurrentUser, db: DatabaseSession):
    return service.copy_meal(db, user, copy_id, data)
