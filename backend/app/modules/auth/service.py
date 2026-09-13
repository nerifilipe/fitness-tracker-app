import secrets
from datetime import datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import DomainError
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    hash_token,
    password_hash,
    utcnow,
)
from app.modules.auth.models import AuthSession
from app.modules.auth.schemas import LoginRequest, RegisterRequest, TokenResponse
from app.modules.users.models import User
from app.modules.users.schemas import UserResponse


def unauthorized() -> DomainError:
    return DomainError("unauthorized", "Sessão inválida ou expirada. Volta a entrar.", 401)


def issue_session(
    db: Session,
    user: User,
    config: Settings,
    family_id: UUID | None = None,
    expires_at: datetime | None = None,
) -> tuple[AuthSession, TokenResponse]:
    raw_token = secrets.token_urlsafe(48)
    row = AuthSession(
        id=uuid4(),
        user_id=user.id,
        family_id=family_id or uuid4(),
        refresh_token_hash=hash_token(raw_token),
        expires_at=expires_at or utcnow() + timedelta(days=config.refresh_token_days),
    )
    db.add(row)
    db.flush()
    return row, TokenResponse(
        access_token=create_access_token(user.id, row.id, config),
        refresh_token=raw_token,
        expires_in=config.access_token_seconds,
        user=UserResponse.model_validate(user),
    )


def register(db: Session, data: RegisterRequest, config: Settings) -> TokenResponse:
    user = User(
        email=str(data.email),
        password_hash=password_hash.hash(data.password),
        display_name=data.display_name,
    )
    db.add(user)
    try:
        db.flush()
        _, tokens = issue_session(db, user, config)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise DomainError("email_unavailable", "Não é possível registar este email.", 409) from None
    return tokens


def login(db: Session, data: LoginRequest, config: Settings) -> TokenResponse:
    user = db.scalar(select(User).where(func.lower(User.email) == str(data.email)))
    valid, updated_hash = password_hash.verify_and_update(
        data.password, user.password_hash if user else DUMMY_PASSWORD_HASH
    )
    if not valid or user is None:
        raise DomainError("invalid_credentials", "Email ou palavra-passe incorretos.", 401)
    if updated_hash:
        user.password_hash = updated_hash
    _, tokens = issue_session(db, user, config)
    db.commit()
    return tokens


def locked_session(db: Session, raw_token: str) -> AuthSession | None:
    row = db.scalar(
        select(AuthSession).where(AuthSession.refresh_token_hash == hash_token(raw_token))
    )
    if row is None:
        return None
    # Serialize rotations/revocations for a user, including concurrent reuse of old tokens.
    db.execute(select(User.id).where(User.id == row.user_id).with_for_update()).one()
    return db.scalar(
        select(AuthSession)
        .where(AuthSession.id == row.id)
        .execution_options(populate_existing=True)
    )


def revoke_family(db: Session, family_id: UUID) -> None:
    db.execute(
        update(AuthSession)
        .where(AuthSession.family_id == family_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def refresh(db: Session, raw_token: str, config: Settings) -> TokenResponse:
    row = locked_session(db, raw_token)
    if row is None:
        raise unauthorized()
    if row.revoked_at is not None:
        revoke_family(db, row.family_id)
        db.commit()  # Must persist reuse detection even though the request fails.
        raise unauthorized()
    if row.expires_at <= utcnow():
        raise unauthorized()
    replacement, tokens = issue_session(db, row.user, config, row.family_id, row.expires_at)
    row.revoked_at, row.replaced_by_id = utcnow(), replacement.id
    db.commit()
    return tokens


def logout(db: Session, raw_token: str) -> None:
    row = locked_session(db, raw_token)
    if row:
        revoke_family(db, row.family_id)
        db.commit()
