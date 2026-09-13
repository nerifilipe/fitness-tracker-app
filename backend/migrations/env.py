from alembic import context
from sqlalchemy import Connection

from app.core.config import Settings
from app.db.session import Base, build_engine
from app.modules.auth.models import AuthSession  # noqa: F401
from app.modules.exercises.models import (  # noqa: F401
    Exercise,
    ExerciseMuscle,
    MuscleGroup,
    UserExercise,
)
from app.modules.users.models import User  # noqa: F401


def migrate(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=Base.metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    context.configure(
        url=str(Settings().database_url),
        target_metadata=Base.metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
elif connection := context.config.attributes.get("connection"):
    migrate(connection)
else:
    engine = build_engine(Settings())
    try:
        with engine.connect() as connection:
            migrate(connection)
    finally:
        engine.dispose()
