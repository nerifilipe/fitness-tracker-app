from fastapi import APIRouter

from app.core.errors import ErrorResponse
from app.db.session import DatabaseSession
from app.modules.auth.dependencies import CurrentUser
from app.modules.users import service
from app.modules.users.schemas import ProfileUpdate, UserResponse

router = APIRouter(
    prefix="/users",
    tags=["users"],
    responses={code: {"model": ErrorResponse} for code in (401, 422)},
)


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)


@router.put("/me", response_model=UserResponse)
def update_me(data: ProfileUpdate, user: CurrentUser, db: DatabaseSession) -> UserResponse:
    return UserResponse.model_validate(service.update_profile(db, user, data))
