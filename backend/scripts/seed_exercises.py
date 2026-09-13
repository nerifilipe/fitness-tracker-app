from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import build_engine
from app.modules.exercises.seed import seed_catalogue
from app.modules.users.models import User  # noqa: F401

engine = build_engine(Settings())
try:
    with Session(engine) as db, db.begin():
        added = seed_catalogue(db)
    print(f"Exercise catalogue ready: {added} exercises added. Existing data preserved.")
finally:
    engine.dispose()
