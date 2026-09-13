from unittest.mock import Mock

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.core.config import Settings
from app.db.session import get_session
from app.main import create_app


def test_liveness_does_not_require_database():
    app = create_app(Settings())
    with TestClient(app) as client:
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_readiness_executes_database_query():
    app = create_app(Settings())
    session = Mock()
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as client:
        assert client.get("/api/v1/ready").status_code == 200
    assert str(session.execute.call_args.args[0]) == "SELECT 1"


def test_readiness_failure_hides_connection_details():
    app = create_app(Settings())
    session = Mock()
    session.execute.side_effect = OperationalError("secret connection", {}, Exception("password"))
    app.dependency_overrides[get_session] = lambda: session
    with TestClient(app) as client:
        response = client.get("/api/v1/ready")
        assert response.status_code == 503
        assert response.json() == {"detail": "Database unavailable"}


def test_cors_does_not_allow_unknown_web_origin():
    with TestClient(create_app(Settings(cors_origins=["http://localhost:8081"]))) as client:
        response = client.get("/api/v1/health", headers={"Origin": "https://untrusted.example"})
        assert "access-control-allow-origin" not in response.headers
