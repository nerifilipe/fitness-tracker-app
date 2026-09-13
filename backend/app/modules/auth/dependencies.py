from typing import Annotated

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.security import decode_access_token, utcnow
from app.db.session import DatabaseSession
from app.modules.auth.models import AuthSession
from app.modules.auth.service import unauthorized
from app.modules.users.models import User

bearer = HTTPBearer(auto_error=False)


def current_user(
    request: Request,
    db: DatabaseSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> User:
    if credentials is None:
        raise unauthorized()
    try:
        user_id, session_id = decode_access_token(
            credentials.credentials, request.app.state.settings
        )
    except (jwt.InvalidTokenError, ValueError, TypeError, KeyError):
        raise unauthorized() from None
    row = db.get(AuthSession, session_id)
    if (
        row is None
        or row.user_id != user_id
        or row.revoked_at is not None
        or row.expires_at <= utcnow()
    ):
        raise unauthorized()
    return row.user


CurrentUser = Annotated[User, Depends(current_user)]
