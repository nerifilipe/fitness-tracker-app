from sqlalchemy.orm import Session

from app.modules.users.models import User
from app.modules.users.schemas import ProfileUpdate


def update_profile(db: Session, user: User, data: ProfileUpdate) -> User:
    for field, value in data.model_dump().items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user
