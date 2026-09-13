import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from app.core.config import Settings

password_hash = PasswordHash.recommended()
DUMMY_PASSWORD_HASH = password_hash.hash(secrets.token_urlsafe(32))
ISSUER = "fitness-tracker-api"
AUDIENCE = "fitness-tracker-mobile"


def utcnow() -> datetime:
    return datetime.now(UTC)


def hash_token(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def create_access_token(user_id: UUID, session_id: UUID, config: Settings) -> str:
    now = utcnow()
    return jwt.encode(
        {
            "sub": str(user_id),
            "sid": str(session_id),
            "type": "access",
            "iat": now,
            "exp": now + timedelta(seconds=config.access_token_seconds),
            "iss": ISSUER,
            "aud": AUDIENCE,
        },
        config.jwt_secret.get_secret_value(),
        algorithm="HS256",
    )


def decode_access_token(token: str, config: Settings) -> tuple[UUID, UUID]:
    claims = jwt.decode(
        token,
        config.jwt_secret.get_secret_value(),
        algorithms=["HS256"],
        issuer=ISSUER,
        audience=AUDIENCE,
        options={"require": ["sub", "sid", "type", "iat", "exp", "iss", "aud"]},
    )
    if claims["type"] != "access":
        raise ValueError("Invalid token type")
    return UUID(claims["sub"]), UUID(claims["sid"])
