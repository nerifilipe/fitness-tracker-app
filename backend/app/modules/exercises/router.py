from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response
from sqlalchemy import select

from app.core.errors import ErrorResponse
from app.db.session import DatabaseSession
from app.modules.auth.dependencies import CurrentUser
from app.modules.exercises import service
from app.modules.exercises.models import MuscleGroup
from app.modules.exercises.schemas import (
    Equipment,
    ExerciseInput,
    ExercisePage,
    ExerciseResponse,
    FavoriteInput,
    MuscleResponse,
)

router = APIRouter(
    prefix="/exercises",
    tags=["exercises"],
    responses={code: {"model": ErrorResponse} for code in (401, 403, 404, 422)},
)


@router.get("/muscle-groups", response_model=list[MuscleResponse])
def muscle_groups(user: CurrentUser, db: DatabaseSession):
    return db.scalars(select(MuscleGroup).order_by(MuscleGroup.name)).all()


@router.get("", response_model=ExercisePage)
def list_exercises(
    user: CurrentUser,
    db: DatabaseSession,
    q: Annotated[str, Query(max_length=120)] = "",
    muscle_id: UUID | None = None,
    equipment: Equipment | None = None,
    favorites_only: bool = False,
    custom_only: bool = False,
    cursor: Annotated[str | None, Query(max_length=1024)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> ExercisePage:
    return service.list_exercises(
        db, user.id, q, muscle_id, equipment, favorites_only, custom_only, cursor, limit
    )


@router.post("", response_model=ExerciseResponse, status_code=201)
def create(data: ExerciseInput, user: CurrentUser, db: DatabaseSession) -> ExerciseResponse:
    return service.create(db, user.id, data)


@router.get("/{exercise_id}", response_model=ExerciseResponse)
def detail(exercise_id: UUID, user: CurrentUser, db: DatabaseSession) -> ExerciseResponse:
    return service.detail(db, user.id, exercise_id)


@router.put("/{exercise_id}", response_model=ExerciseResponse)
def edit(
    exercise_id: UUID, data: ExerciseInput, user: CurrentUser, db: DatabaseSession
) -> ExerciseResponse:
    return service.edit(db, user.id, exercise_id, data)


@router.delete("/{exercise_id}", status_code=204)
def archive(exercise_id: UUID, user: CurrentUser, db: DatabaseSession) -> Response:
    service.archive(db, user.id, exercise_id)
    return Response(status_code=204)


@router.put("/{exercise_id}/favorite", response_model=ExerciseResponse)
def favorite(
    exercise_id: UUID, data: FavoriteInput, user: CurrentUser, db: DatabaseSession
) -> ExerciseResponse:
    return service.set_favorite(db, user.id, exercise_id, data.is_favorite)
