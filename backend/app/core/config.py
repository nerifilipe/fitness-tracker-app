from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: PostgresDsn = (
        "postgresql+psycopg://fitness:fitness_local@localhost:5432/fitness"
    )
    cors_origins: list[str] = ["http://localhost:8081"]
