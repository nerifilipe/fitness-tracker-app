import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

os.environ["JWT_SECRET"] = "test-only-secret-isolated-from-real-credentials"


@pytest.fixture(scope="session")
def database_url():
    """Migrate an isolated schema; never delete or truncate the developer's data."""
    from app.core.config import Settings

    url = os.environ.get("TEST_DATABASE_URL", str(Settings().database_url))
    engine = create_engine(url, isolation_level="AUTOCOMMIT", connect_args={"connect_timeout": 3})
    schema = "test_auth_" + uuid4().hex
    with engine.connect() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    scoped = create_engine(
        url, connect_args={"options": f"-csearch_path={schema}", "connect_timeout": 3}
    )
    try:
        with scoped.begin() as connection:
            config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        yield scoped
    finally:
        scoped.dispose()
        with engine.connect() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()


@pytest.fixture
def client(database_url):
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

    from app.core.config import Settings
    from app.db.session import get_session
    from app.main import create_app

    app = create_app(Settings(auth_rate_limit=1000))

    def session():
        with Session(database_url) as db:
            yield db

    app.dependency_overrides[get_session] = session
    with TestClient(app) as test_client:
        yield test_client
