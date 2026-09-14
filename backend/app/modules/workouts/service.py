import hashlib
from datetime import timedelta
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import DomainError
from app.core.security import utcnow
from app.modules.exercises.models import Exercise
from app.modules.exercises.service import visible
from app.modules.templates.service import check_version, get_owned
from app.modules.users.models import User
from app.modules.workouts.models import Workout, WorkoutExercise, WorkoutMutation, WorkoutSet
from app.modules.workouts.schemas import (
    WorkoutResponse,
    WorkoutStart,
    WorkoutSync,
    WorkoutSyncResponse,
)


def digest(data) -> str:
    return hashlib.sha256(data.model_dump_json().encode()).hexdigest()


def query():
    return select(Workout).options(
        selectinload(Workout.exercises).selectinload(WorkoutExercise.sets)
    )


def owned(db: Session, user_id: UUID, workout_id: UUID, lock=False) -> Workout:
    stmt = query().where(Workout.id == workout_id, Workout.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update(of=Workout)
    row = db.scalar(stmt)
    if not row:
        raise DomainError("workout_not_found", "Treino não encontrado.", 404)
    return row


def active(db: Session, user_id: UUID) -> WorkoutResponse | None:
    row = db.scalar(
        query().where(Workout.user_id == user_id, Workout.status.in_(["active", "paused"]))
    )
    return WorkoutResponse.model_validate(row) if row else None


def start(db: Session, user_id: UUID, data: WorkoutStart) -> WorkoutResponse:
    # The user lock serializes starts across devices before the partial unique index.
    db.scalar(select(User).where(User.id == user_id).with_for_update())
    existing = db.scalar(query().where(Workout.id == data.id))
    if existing:
        if existing.user_id != user_id or existing.create_hash != digest(data):
            raise DomainError("workout_id_conflict", "Este identificador já foi utilizado.", 409)
        return WorkoutResponse.model_validate(existing)
    if active(db, user_id):
        raise DomainError(
            "active_workout_exists",
            "Já tens um treino em curso. Retoma-o antes de iniciar outro.",
            409,
        )
    template = get_owned(db, user_id, data.template_id, lock=True)
    check_version(template, data.template_version)
    if not template.exercises:
        raise DomainError("empty_template", "Adiciona exercícios ao plano antes de iniciar.", 422)
    row = Workout(
        id=data.id,
        user_id=user_id,
        template_id=template.id,
        create_hash=digest(data),
        name_snapshot=template.name,
        started_at=utcnow(),
        exercises=[
            WorkoutExercise(
                id=uuid4(),
                exercise_id=e.exercise_id,
                position=i,
                name_snapshot=e.exercise.name,
                load_type_snapshot=e.exercise.load_type,
                load_convention_snapshot=e.exercise.load_convention,
                rest_seconds=e.rest_seconds,
                notes=e.notes,
                sets=[
                    WorkoutSet(
                        id=uuid4(),
                        position=j,
                        set_type=s.set_type,
                        weight_kg=0 if e.exercise.load_convention == "none" else s.target_weight_kg,
                        reps=s.target_reps_min,
                        rir=s.target_rir,
                    )
                    for j, s in enumerate(e.sets)
                ],
            )
            for i, e in enumerate(template.exercises)
        ],
    )
    db.add(row)
    db.flush()
    result = WorkoutResponse.model_validate(row)
    db.commit()
    return result


def sync(db: Session, user_id: UUID, workout_id: UUID, data: WorkoutSync) -> WorkoutSyncResponse:
    row = owned(db, user_id, workout_id, lock=True)
    previous = db.get(WorkoutMutation, (workout_id, data.mutation_id))
    if previous:
        if previous.payload_hash != digest(data):
            raise DomainError(
                "mutation_id_conflict", "Este pedido já foi usado com outros dados.", 409
            )
        return WorkoutSyncResponse(
            workout=WorkoutResponse.model_validate(row), applied_version=previous.applied_version
        )
    if data.version != row.version:
        raise DomainError(
            "workout_conflict",
            "O treino foi alterado noutro dispositivo. Resolve o conflito antes de sincronizar.",
            409,
        )
    if row.status not in ("active", "paused"):
        raise DomainError("workout_closed", "Este treino já está encerrado.", 409)
    now = utcnow()
    end = data.finished_at or data.paused_at or now
    if end < row.started_at or end > now + timedelta(minutes=5):
        raise DomainError("invalid_time", "Verifica a data e hora do dispositivo.", 422)
    if (
        data.paused_seconds < row.paused_seconds
        or data.paused_seconds > (end - row.started_at).total_seconds() + 1
    ):
        raise DomainError("invalid_pause", "A duração da pausa não é válida.", 422)
    if data.rest_deadline and data.rest_deadline > now + timedelta(seconds=3900):
        raise DomainError("invalid_rest", "O descanso deve ter até uma hora.", 422)
    old = {e.id: e for e in row.exercises}
    old_set_ids = {s.id for e in row.exercises for s in e.sets}
    # Reject IDs belonging to another workout without disclosing their contents.
    new_eids = {e.id for e in data.exercises} - old.keys()
    new_sids = {s.id for e in data.exercises for s in e.sets} - old_set_ids
    if db.scalar(
        select(WorkoutExercise.id).where(WorkoutExercise.id.in_(new_eids)).limit(1)
    ) or db.scalar(select(WorkoutSet.id).where(WorkoutSet.id.in_(new_sids)).limit(1)):
        raise DomainError(
            "invalid_identifiers", "Não foi possível usar os identificadores enviados.", 422
        )
    added_ids = {
        e.exercise_id
        for e in data.exercises
        if e.id not in old or old[e.id].exercise_id != e.exercise_id
    }
    available = {
        e.id: e
        for e in db.scalars(
            select(Exercise)
            .where(Exercise.id.in_(added_ids), visible(user_id), Exercise.archived_at.is_(None))
            .order_by(Exercise.id)
            .with_for_update()
        ).all()
    }
    if set(available) != added_ids:
        raise DomainError("exercise_unavailable", "Um dos exercícios não está disponível.", 422)
    rebuilt = []
    for i, e in enumerate(data.exercises):
        retained = old.get(e.id)
        if retained and retained.exercise_id == e.exercise_id:
            name, load, convention = (
                retained.name_snapshot,
                retained.load_type_snapshot,
                retained.load_convention_snapshot,
            )
        else:
            source = available[e.exercise_id]
            name, load, convention = source.name, source.load_type, source.load_convention
        for s in e.sets:
            if convention == "none" and s.weight_kg not in (None, 0):
                raise DomainError("invalid_load", "Este exercício não usa carga adicional.", 422)
            completion_limit = end if data.status != "active" else now + timedelta(minutes=5)
            if s.completed_at and (
                s.completed_at < row.started_at or s.completed_at > completion_limit
            ):
                raise DomainError("invalid_time", "A data da série não é válida.", 422)
        rebuilt.append(
            WorkoutExercise(
                id=e.id,
                exercise_id=e.exercise_id,
                position=i,
                name_snapshot=name,
                load_type_snapshot=load,
                load_convention_snapshot=convention,
                rest_seconds=e.rest_seconds,
                notes=e.notes,
                sets=[WorkoutSet(position=j, **s.model_dump()) for j, s in enumerate(e.sets)],
            )
        )
    row.exercises.clear()
    db.flush()
    row.exercises = rebuilt
    for field in ("status", "paused_at", "paused_seconds", "finished_at", "rest_deadline", "notes"):
        setattr(row, field, getattr(data, field))
    row.version += 1
    row.updated_at = now
    db.add(
        WorkoutMutation(
            workout_id=row.id,
            mutation_id=data.mutation_id,
            payload_hash=digest(data),
            applied_version=row.version,
        )
    )
    db.flush()
    result = WorkoutSyncResponse(
        workout=WorkoutResponse.model_validate(row), applied_version=row.version
    )
    db.commit()
    return result
