from fastapi import APIRouter, Depends, Request, Response

from app.core.errors import ErrorResponse
from app.core.rate_limit import limit_auth
from app.db.session import DatabaseSession
from app.modules.auth import service
from app.modules.auth.schemas import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(limit_auth)],
    responses={code: {"model": ErrorResponse} for code in (401, 409, 422, 429)},
)


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(data: RegisterRequest, db: DatabaseSession, request: Request) -> TokenResponse:
    return service.register(db, data, request.app.state.settings)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: DatabaseSession, request: Request) -> TokenResponse:
    return service.login(db, data, request.app.state.settings)


@router.post("/refresh", response_model=TokenResponse)
def refresh(data: RefreshRequest, db: DatabaseSession, request: Request) -> TokenResponse:
    return service.refresh(db, data.refresh_token, request.app.state.settings)


@router.post("/logout", status_code=204)
def logout(data: RefreshRequest, db: DatabaseSession) -> Response:
    service.logout(db, data.refresh_token)
    return Response(status_code=204)
