from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import jwt
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_token, utcnow
from app.modules.auth.models import AuthSession
from app.modules.users.models import User

PASSWORD = "correct horse battery staple"


def register(client, email=None):
    email = email or f"{uuid4().hex}@example.com"
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": PASSWORD,
            "display_name": "Filipe",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def headers(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_registration_hashes_secrets_and_normalizes_email(client, database_url):
    email = f"Test{uuid4().hex}@EXAMPLE.COM"
    tokens = register(client, email)
    assert tokens["user"]["email"] == email.lower()
    assert "password_hash" not in tokens["user"]
    with Session(database_url) as db:
        user = db.get(User, tokens["user"]["id"])
        row = db.scalar(select(AuthSession).where(AuthSession.user_id == user.id))
        assert user.password_hash.startswith("$argon2id$")
        assert row.refresh_token_hash == hash_token(tokens["refresh_token"])
    duplicate = client.post(
        "/api/v1/auth/register",
        json={
            "email": email.lower(),
            "password": PASSWORD,
            "display_name": "Other",
        },
    )
    assert duplicate.status_code == 409


def test_login_and_generic_credential_errors(client):
    tokens = register(client)
    good = client.post(
        "/api/v1/auth/login",
        json={
            "email": tokens["user"]["email"],
            "password": PASSWORD,
        },
    )
    assert good.status_code == 200
    wrong = client.post(
        "/api/v1/auth/login",
        json={
            "email": tokens["user"]["email"],
            "password": "incorrect",
        },
    )
    absent = client.post(
        "/api/v1/auth/login",
        json={
            "email": "absent@example.com",
            "password": "incorrect",
        },
    )
    assert wrong.status_code == absent.status_code == 401
    assert wrong.json()["error"] == absent.json()["error"]
    assert good.headers["cache-control"] == "no-store"


def test_refresh_rotation_and_reuse_revoke_entire_family(client):
    old = register(client)
    fresh = client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})
    assert fresh.status_code == 200
    new = fresh.json()
    assert new["refresh_token"] != old["refresh_token"]
    assert client.get("/api/v1/users/me", headers=headers(new)).status_code == 200
    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": old["refresh_token"]})
    assert reused.status_code == 401
    assert client.get("/api/v1/users/me", headers=headers(new)).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": new["refresh_token"]}
        ).status_code
        == 401
    )


def test_logout_revokes_access_refresh_and_is_idempotent(client):
    tokens = register(client)
    for _ in range(2):
        assert (
            client.post(
                "/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]}
            ).status_code
            == 204
        )
    assert client.get("/api/v1/users/me", headers=headers(tokens)).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        ).status_code
        == 401
    )


def test_account_isolation_and_profile_validation(client):
    a, b = register(client), register(client)
    data = {
        "display_name": "Updated",
        "timezone": "Europe/Lisbon",
        "unit_system": "metric",
        "weekly_workout_target": 3,
    }
    assert client.put("/api/v1/users/me", headers=headers(a), json=data).status_code == 200
    assert client.get("/api/v1/users/me", headers=headers(b)).json()["display_name"] == "Filipe"
    assert (
        client.put(
            "/api/v1/users/me", headers=headers(a), json={**data, "user_id": b["user"]["id"]}
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/v1/users/me", headers=headers(a), json={**data, "timezone": "Mars/Olympus"}
        ).status_code
        == 422
    )
    assert client.get("/api/v1/users/me").status_code == 401


def test_expired_tampered_wrong_type_tokens_rejected(client, database_url):
    tokens = register(client)
    secret = Settings().jwt_secret.get_secret_value()
    claims = jwt.decode(tokens["access_token"], options={"verify_signature": False})
    for changes in (
        {"exp": utcnow() - timedelta(seconds=1)},
        {"type": "refresh"},
        {"aud": "other"},
    ):
        token = jwt.encode({**claims, **changes}, secret, algorithm="HS256")
        assert (
            client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}).status_code
            == 401
        )
    token = jwt.encode(claims, "wrong-signing-secret-that-is-long-enough", algorithm="HS256")
    assert (
        client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}).status_code
        == 401
    )
    with Session(database_url) as db:
        db.execute(
            update(AuthSession)
            .where(AuthSession.refresh_token_hash == hash_token(tokens["refresh_token"]))
            .values(expires_at=utcnow() - timedelta(days=1))
        )
        db.commit()
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        ).status_code
        == 401
    )


def test_concurrent_refresh_does_not_leave_two_valid_sessions(client):
    tokens = register(client)

    def refresh():
        return client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: refresh(), range(2)))
    assert sorted(r.status_code for r in results) == [200, 401]
    winner = next(r.json() for r in results if r.status_code == 200)
    assert client.get("/api/v1/users/me", headers=headers(winner)).status_code == 401


def test_validation_does_not_echo_secrets_and_rate_limit(client):
    secret = "short-secret"
    response = client.post("/api/v1/auth/register", json={"email": "invalid", "password": secret})
    assert response.status_code == 422
    assert secret not in response.text
    client.app.state.auth_limiter.limit = 1
    response = client.post(
        "/api/v1/auth/login", json={"email": "x@example.com", "password": PASSWORD}
    )
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "60"
