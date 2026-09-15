from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response

from app.core.errors import ErrorResponse
from app.db.session import DatabaseSession
from app.modules.auth.dependencies import CurrentUser
from app.modules.progress import service
from app.modules.progress.schemas import (
    MeasurementInput,
    MeasurementPage,
    MeasurementResponse,
    ProgressSummary,
)

router = APIRouter(
    prefix="/progress",
    tags=["progress"],
    responses={code: {"model": ErrorResponse} for code in (401, 422)},
)


@router.get("/summary", response_model=ProgressSummary)
def summary(
    user: CurrentUser,
    db: DatabaseSession,
    days: Annotated[int, Query(ge=1, le=365)] = 90,
):
    return service.summary(db, user, days)


@router.get("/measurements", response_model=MeasurementPage)
def history(
    user: CurrentUser,
    db: DatabaseSession,
    before: date | None = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
):
    return service.history(db, user.id, before, limit)


@router.get("/measurements/{day}", response_model=MeasurementResponse | None)
def detail(day: date, user: CurrentUser, db: DatabaseSession):
    return service.detail(db, user, day)


@router.put("/measurements/{day}", response_model=MeasurementResponse)
def save(day: date, data: MeasurementInput, user: CurrentUser, db: DatabaseSession):
    return service.save(db, user, day, data)


@router.delete("/measurements/{day}", status_code=204)
def remove(day: date, user: CurrentUser, db: DatabaseSession):
    service.remove(db, user, day)
    return Response(status_code=204)
