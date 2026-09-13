import base64
import binascii
import json
from uuid import UUID

from sqlalchemy import delete, exists, func, or_, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from app.core.errors import DomainError
from app.core.security import utcnow
from app.modules.exercises.models import Exercise, ExerciseMuscle, MuscleGroup, UserExercise
from app.modules.exercises.schemas import (
    ExerciseInput,
    ExercisePage,
    ExerciseResponse,
    MuscleResponse,
)


def visible(user_id: UUID):
    return or_(Exercise.owner_id.is_(None), Exercise.owner_id == user_id)


def favorite(user_id: UUID):
    return exists().where(
        UserExercise.exercise_id == Exercise.id,
        UserExercise.user_id == user_id,
        UserExercise.is_favorite.is_(True),
    )


def encode_cursor(name: str, exercise_id: UUID) -> str:
    return base64.urlsafe_b64encode(
        json.dumps([name, str(exercise_id)], ensure_ascii=False).encode()
    ).decode()


def decode_cursor(cursor: str) -> tuple[str, UUID]:
    try:
        payload = json.loads(base64.b64decode(cursor, altchars=b"-_", validate=True))
        if (
            not isinstance(payload, list)
            or len(payload) != 2
            or not isinstance(payload[0], str)
            or len(payload[0]) > 120
        ):
            raise ValueError("Invalid cursor")
        return payload[0], UUID(payload[1])
    except (ValueError, TypeError, AttributeError, binascii.Error, UnicodeError):
        raise DomainError("invalid_cursor", "A página expirou. Atualiza a lista.", 422) from None


def response(row: Exercise, is_favorite: bool) -> ExerciseResponse:
    primary = next(link.muscle for link in row.muscles if link.role == "primary")
    secondary = sorted(
        (link.muscle for link in row.muscles if link.role == "secondary"),
        key=lambda muscle: muscle.name,
    )
    return ExerciseResponse(
        id=row.id,
        name=row.name,
        equipment=row.equipment,
        load_type=row.load_type,
        load_convention=row.load_convention,
        instructions=row.instructions,
        primary_muscle=MuscleResponse.model_validate(primary),
        secondary_muscles=[MuscleResponse.model_validate(muscle) for muscle in secondary],
        is_custom=row.owner_id is not None,
        is_favorite=is_favorite,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_exercises(
    db: Session,
    user_id: UUID,
    q: str,
    muscle_id: UUID | None,
    equipment: str | None,
    favorites_only: bool,
    custom_only: bool,
    cursor: str | None,
    limit: int,
) -> ExercisePage:
    name_key = func.lower(Exercise.name)
    query = (
        select(Exercise, favorite(user_id), name_key)
        .where(visible(user_id), Exercise.archived_at.is_(None))
        .options(selectinload(Exercise.muscles))
    )
    if q.strip():
        query = query.where(Exercise.name.icontains(q.strip(), autoescape=True))
    if muscle_id:
        query = query.where(
            exists().where(
                ExerciseMuscle.exercise_id == Exercise.id,
                ExerciseMuscle.muscle_group_id == muscle_id,
                ExerciseMuscle.role == "primary",
            )
        )
    if equipment:
        query = query.where(Exercise.equipment == equipment)
    if favorites_only:
        query = query.where(favorite(user_id))
    if custom_only:
        query = query.where(Exercise.owner_id == user_id)
    if cursor:
        query = query.where(tuple_(name_key, Exercise.id) > decode_cursor(cursor))
    rows = db.execute(query.order_by(name_key, Exercise.id).limit(limit + 1)).all()
    page = rows[:limit]
    next_cursor = encode_cursor(page[-1][2], page[-1][0].id) if len(rows) > limit else None
    return ExercisePage(
        items=[response(row, starred) for row, starred, _ in page], next_cursor=next_cursor
    )


def get_visible(
    db: Session,
    user_id: UUID,
    exercise_id: UUID,
    include_archived: bool = False,
    lock: bool = False,
) -> Exercise:
    query = (
        select(Exercise)
        .where(Exercise.id == exercise_id, visible(user_id))
        .options(selectinload(Exercise.muscles))
    )
    if not include_archived:
        query = query.where(Exercise.archived_at.is_(None))
    if lock:
        query = query.with_for_update()
    row = db.scalar(query)
    if row is None:
        raise DomainError("exercise_not_found", "Exercício indisponível.", 404)
    return row


def detail(db: Session, user_id: UUID, exercise_id: UUID) -> ExerciseResponse:
    row = get_visible(db, user_id, exercise_id)
    starred = db.scalar(
        select(UserExercise.is_favorite).where(
            UserExercise.user_id == user_id, UserExercise.exercise_id == row.id
        )
    )
    return response(row, bool(starred))


def require_owner(row: Exercise, user_id: UUID) -> None:
    if row.owner_id != user_id:
        raise DomainError(
            "catalog_read_only", "Os exercícios do catálogo não podem ser alterados.", 403
        )


def validate_muscles(db: Session, data: ExerciseInput) -> None:
    ids = {data.primary_muscle_id, *data.secondary_muscle_ids}
    found = set(db.scalars(select(MuscleGroup.id).where(MuscleGroup.id.in_(ids))))
    if ids != found:
        raise DomainError("invalid_muscle", "Seleciona grupos musculares válidos.", 422)


def apply_data(db: Session, row: Exercise, data: ExerciseInput) -> None:
    validate_muscles(db, data)
    for key in ("name", "equipment", "load_type", "load_convention", "instructions"):
        setattr(row, key, getattr(data, key))
    row.updated_at = utcnow()
    # Delete before inserting so swapping primary/secondary respects the partial unique index.
    row.muscles.clear()
    db.flush()
    row.muscles = [
        ExerciseMuscle(muscle_group_id=data.primary_muscle_id, role="primary"),
        *[
            ExerciseMuscle(muscle_group_id=muscle_id, role="secondary")
            for muscle_id in data.secondary_muscle_ids
        ],
    ]


def create(db: Session, user_id: UUID, data: ExerciseInput) -> ExerciseResponse:
    row = Exercise(owner_id=user_id)
    db.add(row)
    with db.no_autoflush:
        apply_data(db, row, data)
    db.commit()
    return detail(db, user_id, row.id)


def edit(db: Session, user_id: UUID, exercise_id: UUID, data: ExerciseInput) -> ExerciseResponse:
    row = get_visible(db, user_id, exercise_id, lock=True)
    require_owner(row, user_id)
    apply_data(db, row, data)
    db.commit()
    return detail(db, user_id, exercise_id)


def archive(db: Session, user_id: UUID, exercise_id: UUID) -> None:
    row = get_visible(db, user_id, exercise_id, include_archived=True, lock=True)
    require_owner(row, user_id)
    if row.archived_at is None:
        row.archived_at = utcnow()
    db.commit()


def set_favorite(db: Session, user_id: UUID, exercise_id: UUID, value: bool) -> ExerciseResponse:
    get_visible(db, user_id, exercise_id, lock=True)
    if value:
        db.execute(
            insert(UserExercise)
            .values(user_id=user_id, exercise_id=exercise_id, is_favorite=True)
            .on_conflict_do_update(
                index_elements=["user_id", "exercise_id"], set_={"is_favorite": True}
            )
        )
    else:
        db.execute(
            delete(UserExercise).where(
                UserExercise.user_id == user_id, UserExercise.exercise_id == exercise_id
            )
        )
    db.commit()
    return detail(db, user_id, exercise_id)
