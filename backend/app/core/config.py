from pathlib import Path

from pydantic import Field, PostgresDsn, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
        hide_input_in_errors=True,
    )

    database_url: PostgresDsn = "postgresql+psycopg://fitness:fitness_local@localhost:5432/fitness"
    database_connect_timeout: int = Field(default=3, ge=1, le=30)
    cors_origins: list[str] = ["http://localhost:8081"]
    jwt_secret: SecretStr = Field(min_length=32)
    access_token_seconds: int = Field(default=600, ge=60, le=3600)
    refresh_token_days: int = Field(default=30, ge=1, le=90)
    auth_rate_limit: int = Field(default=30, ge=1, le=1000)
    food_user_agent: str = "FitnessTracker/0.1 (https://github.com/nerifilipe/fitness-tracker-app)"

    @field_validator("database_url", mode="before")
    @classmethod
    def use_psycopg(cls, value):
        # Hosted providers supply standard PostgreSQL URLs; use the installed v3 driver.
        if isinstance(value, str):
            for prefix in ("postgres://", "postgresql://"):
                if value.startswith(prefix):
                    return "postgresql+psycopg://" + value[len(prefix) :]
        return value
