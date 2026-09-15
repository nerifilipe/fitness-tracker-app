import pytest
from pydantic import ValidationError
from sqlalchemy.engine import make_url

from app.core.config import Settings
from app.db.session import build_engine


@pytest.mark.parametrize("scheme", ["postgres", "postgresql", "postgresql+psycopg"])
def test_hosted_database_url_preserves_credentials_and_tls(scheme):
    settings = Settings(
        _env_file=None,
        database_url=f"{scheme}://owner:p%40ss%25@db.example.com/app?sslmode=require",
        database_connect_timeout=15,
    )
    url = make_url(str(settings.database_url))
    assert url.drivername == "postgresql+psycopg"
    assert url.password == "p@ss%"
    assert url.query["sslmode"] == "require"
    engine = build_engine(settings)
    try:
        assert engine.dialect.driver == "psycopg"
    finally:
        engine.dispose()


def test_invalid_settings_do_not_print_secret_inputs():
    with pytest.raises(ValidationError) as error:
        Settings(_env_file=None, jwt_secret="private-value-too-short")
    assert "private-value-too-short" not in str(error.value)


@pytest.mark.parametrize("timeout", [0, 31])
def test_database_timeout_is_bounded(timeout):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_connect_timeout=timeout)
