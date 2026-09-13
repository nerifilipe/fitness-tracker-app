from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import DatabaseSession

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness: the API can respond, independently of database availability."""
    return HealthResponse()


@router.get("/ready", response_model=HealthResponse, responses={503: {"description": "Not ready"}})
def ready(session: DatabaseSession) -> HealthResponse:
    """Readiness: verifies a real database round trip without exposing credentials."""
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    return HealthResponse()
