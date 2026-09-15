from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.errors import ErrorResponse
from app.db.session import DatabaseSession
from app.modules.auth.dependencies import CurrentUser
from app.modules.exercises.schemas import LoadConvention, LoadType
from app.modules.progress import strength
from app.modules.progress.strength_schemas import (
    StrengthExercisePage,
    StrengthGroup,
    StrengthOverview,
    StrengthSessionPage,
)

router = APIRouter(
    prefix="/progress/strength",
    tags=["strength"],
    responses={code: {"model": ErrorResponse} for code in (401, 404, 422)},
)


@router.get("/exercises", response_model=StrengthExercisePage)
def exercises(
    user: CurrentUser,
    db: DatabaseSession,
    q: Annotated[str, Query(max_length=120)] = "",
    cursor: Annotated[str | None, Query(max_length=1024)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
):
    return strength.exercises(db, user, q, cursor, limit)


@router.get("/{exercise_id}", response_model=StrengthOverview)
def overview(
    exercise_id: UUID,
    user: CurrentUser,
    db: DatabaseSession,
    days: Annotated[int, Query(ge=1, le=365)] = 90,
    load_type: LoadType | None = None,
    load_convention: LoadConvention | None = None,
):
    return strength.overview(db, user, exercise_id, days, load_type, load_convention)


@router.get("/{exercise_id}/sessions", response_model=StrengthSessionPage)
def history(
    exercise_id: UUID,
    user: CurrentUser,
    db: DatabaseSession,
    load_type: LoadType,
    load_convention: LoadConvention,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
):
    return strength.history(
        db,
        user,
        exercise_id,
        StrengthGroup(load_type=load_type, load_convention=load_convention),
        cursor,
        limit,
    )
