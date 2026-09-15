"""Single-instance deployment: migrate and seed transactionally before serving."""

import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import build_engine
from app.modules.exercises.seed import seed_catalogue


def prepare_database(settings: Settings) -> None:
    engine = build_engine(settings)
    try:
        with engine.begin() as connection:
            # A redeploy may overlap an older container; serialize schema/catalogue changes.
            connection.execute(text("SELECT pg_advisory_xact_lock(714209120)"))
            config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            with Session(bind=connection) as db:
                seed_catalogue(db)
                db.commit()
    finally:
        engine.dispose()


def main() -> None:
    if not os.environ.get("DATABASE_URL") or not os.environ.get("JWT_SECRET"):
        raise SystemExit("Define DATABASE_URL e JWT_SECRET no ambiente do serviço.")
    port = os.environ.get("PORT", "10000")
    if not port.isdigit() or not 1 <= int(port) <= 65535:
        raise SystemExit("PORT deve ser um inteiro entre 1 e 65535.")
    try:
        settings = Settings(_env_file=None)
        prepare_database(settings)
    except Exception:
        # Driver/validation tracebacks can contain a database URL or credentials.
        raise SystemExit(
            "Falha ao preparar a API. Verifica a ligação, credenciais e migrações."
        ) from None
    os.execv(
        sys.executable,
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            port,
            "--workers",
            "1",
            "--proxy-headers",
        ],
    )


if __name__ == "__main__":
    main()
