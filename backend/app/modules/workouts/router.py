from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.core.errors import ErrorResponse
from app.db.session import DatabaseSession
from app.modules.auth.dependencies import CurrentUser
from app.modules.workouts import reports, service
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


@router.get("/history", response_model=reports.HistoryPage)
def history(
    user: CurrentUser,
    db: DatabaseSession,
    cursor: Annotated[str | None, Query(max_length=512)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    date_from: date | None = None,
    date_to: date | None = None,
) -> reports.HistoryPage:
    return reports.history(db, user, cursor, limit, date_from, date_to)


@router.get("/dashboard", response_model=reports.Dashboard)
def dashboard(user: CurrentUser, db: DatabaseSession) -> reports.Dashboard:
    return reports.dashboard(db, user)


@router.get("/{workout_id}/summary", response_model=reports.WorkoutReport)
def summary(workout_id: UUID, user: CurrentUser, db: DatabaseSession) -> reports.WorkoutReport:
    return reports.report(db, user.id, workout_id)


@router.get("/{workout_id}", response_model=WorkoutResponse)
def detail(workout_id: UUID, user: CurrentUser, db: DatabaseSession) -> WorkoutResponse:
    return WorkoutResponse.model_validate(service.owned(db, user.id, workout_id))


@router.put("/{workout_id}", response_model=WorkoutSyncResponse)
def sync(
    workout_id: UUID, data: WorkoutSync, user: CurrentUser, db: DatabaseSession
) -> WorkoutSyncResponse:
    return service.sync(db, user.id, workout_id, data)
