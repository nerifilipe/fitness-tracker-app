from uuid import UUID

from fastapi import APIRouter

from app.core.errors import ErrorResponse
from app.db.session import DatabaseSession
from app.modules.auth.dependencies import CurrentUser
from app.modules.workouts import service
from app.modules.workouts.schemas import (
    WorkoutResponse,
    WorkoutStart,
    WorkoutSync,
    WorkoutSyncResponse,
)

router = APIRouter(
    prefix="/workouts",
    tags=["workouts"],
    responses={c: {"model": ErrorResponse} for c in (401, 404, 409, 422)},
)


@router.post("", response_model=WorkoutResponse, status_code=201)
def start(data: WorkoutStart, user: CurrentUser, db: DatabaseSession) -> WorkoutResponse:
    return service.start(db, user.id, data)


@router.get("/active", response_model=WorkoutResponse | None)
def active(user: CurrentUser, db: DatabaseSession) -> WorkoutResponse | None:
    return service.active(db, user.id)


@router.get("/{workout_id}", response_model=WorkoutResponse)
def detail(workout_id: UUID, user: CurrentUser, db: DatabaseSession) -> WorkoutResponse:
    return WorkoutResponse.model_validate(service.owned(db, user.id, workout_id))


@router.put("/{workout_id}", response_model=WorkoutSyncResponse)
def sync(
    workout_id: UUID, data: WorkoutSync, user: CurrentUser, db: DatabaseSession
) -> WorkoutSyncResponse:
    return service.sync(db, user.id, workout_id, data)
