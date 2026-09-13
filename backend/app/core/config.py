from pathlib import Path

from pydantic import Field, PostgresDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore"
    )

    database_url: PostgresDsn = "postgresql+psycopg://fitness:fitness_local@localhost:5432/fitness"
    cors_origins: list[str] = ["http://localhost:8081"]
    jwt_secret: SecretStr = Field(min_length=32)
    access_token_seconds: int = Field(default=600, ge=60, le=3600)
    refresh_token_days: int = Field(default=30, ge=1, le=90)
    auth_rate_limit: int = Field(default=30, ge=1, le=1000)
