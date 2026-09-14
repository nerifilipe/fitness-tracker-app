from collections import Counter
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import DomainError
from app.core.security import utcnow
from app.modules.exercises.models import Exercise
from app.modules.exercises.service import visible
from app.modules.templates.models import TemplateExercise, TemplateSet, WorkoutTemplate
from app.modules.templates.schemas import (
    PlannedSet,
    TemplateExerciseResponse,
    TemplateInput,
    TemplatePage,
    TemplateResponse,
    TemplateSummary,
    TemplateUpdate,
)


def get_owned(db: Session, user_id: UUID, template_id: UUID, lock=False) -> WorkoutTemplate:
    query = (
        select(WorkoutTemplate)
        .where(
            WorkoutTemplate.id == template_id,
            WorkoutTemplate.user_id == user_id,
            WorkoutTemplate.archived_at.is_(None),
        )
        .options(selectinload(WorkoutTemplate.exercises).selectinload(TemplateExercise.sets))
    )
    if lock:
        query = query.with_for_update(of=WorkoutTemplate)
    row = db.scalar(query)
    if row is None:
        raise DomainError("template_not_found", "Plano não encontrado.", 404)
    return row


def response(row: WorkoutTemplate) -> TemplateResponse:
    return TemplateResponse(
        id=row.id,
        name=row.name,
        version=row.version,
        exercise_count=len(row.exercises),
        set_count=sum(len(e.sets) for e in row.exercises),
        created_at=row.created_at,
        updated_at=row.updated_at,
        exercises=[
            TemplateExerciseResponse(
                id=e.id,
                position=e.position,
                exercise_id=e.exercise_id,
                name=e.exercise.name,
                load_type=e.exercise.load_type,
                load_convention=e.exercise.load_convention,
                is_archived=e.exercise.archived_at is not None,
                rest_seconds=e.rest_seconds,
                notes=e.notes,
                sets=[PlannedSet.model_validate(s) for s in e.sets],
            )
            for e in row.exercises
        ],
    )


def list_templates(db: Session, user_id: UUID, offset: int, limit: int) -> TemplatePage:
    exercises = (
        select(func.count())
        .where(TemplateExercise.template_id == WorkoutTemplate.id)
        .scalar_subquery()
    )
    sets = (
        select(func.count())
        .select_from(TemplateSet)
        .join(TemplateExercise)
        .where(TemplateExercise.template_id == WorkoutTemplate.id)
        .scalar_subquery()
    )
    rows = db.execute(
        select(WorkoutTemplate, exercises, sets)
        .where(WorkoutTemplate.user_id == user_id, WorkoutTemplate.archived_at.is_(None))
        .order_by(WorkoutTemplate.created_at.desc(), WorkoutTemplate.id.desc())
        .offset(offset)
        .limit(limit + 1)
    ).all()
    return TemplatePage(
        items=[
            TemplateSummary(
                id=r.id,
                name=r.name,
                version=r.version,
                created_at=r.created_at,
                updated_at=r.updated_at,
                exercise_count=ec,
                set_count=sc,
            )
            for r, ec, sc in rows[:limit]
        ],
        next_offset=offset + limit if len(rows) > limit else None,
    )


def validate_exercises(db: Session, user_id: UUID, data: TemplateInput, existing=()) -> None:
    ids = {e.exercise_id for e in data.exercises}
    # Lock in stable order so archive/edit cannot race validation and saving.
    rows = db.scalars(
        select(Exercise)
        .where(Exercise.id.in_(ids), visible(user_id))
        .order_by(Exercise.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()
    by_id = {r.id: r for r in rows}
    if set(by_id) != ids:
        raise DomainError("exercise_unavailable", "Um dos exercícios não está disponível.", 422)
    retained = Counter(e.exercise_id for e in existing)
    for entry in data.exercises:
        exercise = by_id[entry.exercise_id]
        if exercise.archived_at:
            retained[exercise.id] -= 1
            if retained[exercise.id] < 0:
                raise DomainError(
                    "exercise_archived",
                    "Substitui o exercício arquivado antes de o adicionar.",
                    422,
                )
        if exercise.load_convention == "none" and any(
            s.target_weight_kg not in (None, 0) for s in entry.sets
        ):
            raise DomainError(
                "invalid_load", f"{exercise.name}: este exercício não usa carga adicional.", 422
            )


def children(data: TemplateInput) -> list[TemplateExercise]:
    return [
        TemplateExercise(
            exercise_id=e.exercise_id,
            position=i,
            rest_seconds=e.rest_seconds,
            notes=e.notes,
            sets=[TemplateSet(position=j, **s.model_dump()) for j, s in enumerate(e.sets)],
        )
        for i, e in enumerate(data.exercises)
    ]


def committed(db: Session, row: WorkoutTemplate) -> TemplateResponse:
    db.flush()
    result = response(get_owned(db, row.user_id, row.id))
    db.commit()
    return result


def create(db: Session, user_id: UUID, data: TemplateInput) -> TemplateResponse:
    validate_exercises(db, user_id, data)
    row = WorkoutTemplate(user_id=user_id, name=data.name, exercises=children(data))
    db.add(row)
    # Reload relationships after insert to obtain exercise labels.
    db.flush()
    db.expire(row, ["exercises"])
    return committed(db, row)


def check_version(row: WorkoutTemplate, version: int) -> None:
    if row.version != version:
        raise DomainError(
            "template_conflict",
            "Este plano foi alterado noutro ecrã. Reabre-o antes de guardar.",
            409,
        )


def update(db: Session, user_id: UUID, template_id: UUID, data: TemplateUpdate) -> TemplateResponse:
    row = get_owned(db, user_id, template_id, lock=True)
    check_version(row, data.version)
    validate_exercises(db, user_id, data, row.exercises)
    row.exercises.clear()
    db.flush()
    row.name, row.version, row.updated_at = data.name, row.version + 1, utcnow()
    row.exercises = children(data)
    db.flush()
    db.expire(row, ["exercises"])
    return committed(db, row)


def duplicate(db: Session, user_id: UUID, template_id: UUID) -> TemplateResponse:
    source = get_owned(db, user_id, template_id, lock=True)
    snapshot = response(source)
    data = TemplateInput(
        name=source.name[:112] + " (cópia)",
        exercises=[
            {
                "exercise_id": e.exercise_id,
                "rest_seconds": e.rest_seconds,
                "notes": e.notes,
                "sets": e.sets,
            }
            for e in snapshot.exercises
        ],
    )
    validate_exercises(db, user_id, data, source.exercises)
    row = WorkoutTemplate(user_id=user_id, name=data.name, exercises=children(data))
    db.add(row)
    db.flush()
    db.expire(row, ["exercises"])
    return committed(db, row)


def archive(db: Session, user_id: UUID, template_id: UUID, version: int) -> None:
    row = get_owned(db, user_id, template_id, lock=True)
    check_version(row, version)
    row.archived_at, row.updated_at, row.version = utcnow(), utcnow(), row.version + 1
    db.commit()
