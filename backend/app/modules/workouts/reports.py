import base64
import binascii
import json
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from sqlalchemy import and_, case, distinct, func, select, tuple_
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.core.security import utcnow
from app.modules.users.models import User
from app.modules.workouts.models import Workout, WorkoutExercise, WorkoutSet
from app.modules.workouts.schemas import WorkoutResponse
from app.modules.workouts.service import owned


class WorkoutSummary(BaseModel):
    id: UUID
    name: str
    started_at: datetime
    finished_at: datetime
    active_seconds: int
    exercise_count: int
    completed_sets: int
    skipped_sets: int
    volume_kg: Decimal


class PersonalRecord(BaseModel):
    exercise_id: UUID
    exercise_name: str
    load_convention: str
    kind: str
    value: Decimal
    previous_value: Decimal | None
    weight_kg: Decimal | None


class WorkoutReport(BaseModel):
    workout: WorkoutResponse
    summary: WorkoutSummary
    records: list[PersonalRecord]


class HistoryPage(BaseModel):
    items: list[WorkoutSummary]
    next_cursor: str | None
    timezone: str


class TrainingDay(BaseModel):
    date: date
    workouts: int


class Dashboard(BaseModel):
    timezone: str
    week_start: date
    week_end_exclusive: date
    weekly_target: int
    completed_workouts: int
    completed_sets: int
    active_seconds: int
    volume_kg: Decimal
    days: list[TrainingDay]
    recent: list[WorkoutSummary]


def duration(row: Workout) -> int:
    return max(0, int((row.finished_at - row.started_at).total_seconds()) - row.paused_seconds)


def volume_expression():
    return case(
        (
            and_(
                WorkoutSet.completed_at.is_not(None),
                WorkoutSet.set_type == "working",
                WorkoutExercise.load_type_snapshot == "external",
            ),
            WorkoutSet.weight_kg * WorkoutSet.reps,
        ),
        else_=0,
    )


def summaries(db: Session, rows: list[Workout]) -> list[WorkoutSummary]:
    if not rows:
        return []
    totals = {
        r.workout_id: r
        for r in db.execute(
            select(
                WorkoutExercise.workout_id,
                func.count(distinct(WorkoutExercise.id))
                .filter(WorkoutSet.completed_at.is_not(None))
                .label("exercises"),
                func.count(WorkoutSet.id)
                .filter(WorkoutSet.completed_at.is_not(None))
                .label("done"),
                func.count(WorkoutSet.id).label("total"),
                func.coalesce(func.sum(volume_expression()), 0).label("volume"),
            )
            .join(WorkoutSet, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
            .where(WorkoutExercise.workout_id.in_([r.id for r in rows]))
            .group_by(WorkoutExercise.workout_id)
        ).all()
    }
    return [
        WorkoutSummary(
            id=row.id,
            name=row.name_snapshot,
            started_at=row.started_at,
            finished_at=row.finished_at,
            active_seconds=duration(row),
            exercise_count=totals[row.id].exercises if row.id in totals else 0,
            completed_sets=totals[row.id].done if row.id in totals else 0,
            skipped_sets=(totals[row.id].total - totals[row.id].done) if row.id in totals else 0,
            volume_kg=totals[row.id].volume if row.id in totals else Decimal(0),
        )
        for row in rows
    ]


def encode_cursor(row: Workout) -> str:
    return base64.urlsafe_b64encode(
        json.dumps([row.started_at.isoformat(), str(row.id)]).encode()
    ).decode()


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    try:
        values = json.loads(base64.b64decode(cursor, altchars=b"-_", validate=True))
        if not isinstance(values, list) or len(values) != 2:
            raise ValueError()
        timestamp = datetime.fromisoformat(values[0])
        if timestamp.utcoffset() is None:
            raise ValueError()
        return timestamp, UUID(values[1])
    except (ValueError, TypeError, AttributeError, binascii.Error, UnicodeError):
        raise DomainError(
            "invalid_cursor", "Atualiza o histórico para carregar esta página.", 422
        ) from None


def date_bounds(zone: str, date_from: date | None, date_to: date | None):
    if (date_from and date_to and date_from > date_to) or any(
        value and not 1900 <= value.year <= 9998 for value in (date_from, date_to)
    ):
        raise DomainError("invalid_dates", "Verifica o intervalo de datas.", 422)
    tz = ZoneInfo(zone)
    return (
        datetime.combine(date_from, time.min, tz).astimezone(UTC) if date_from else None,
        datetime.combine(date_to + timedelta(days=1), time.min, tz).astimezone(UTC)
        if date_to
        else None,
    )


def history(
    db: Session,
    user: User,
    cursor: str | None,
    limit: int,
    date_from: date | None = None,
    date_to: date | None = None,
) -> HistoryPage:
    start, end = date_bounds(user.timezone, date_from, date_to)
    stmt = select(Workout).where(Workout.user_id == user.id, Workout.status == "completed")
    if start:
        stmt = stmt.where(Workout.started_at >= start)
    if end:
        stmt = stmt.where(Workout.started_at < end)
    if cursor:
        stmt = stmt.where(tuple_(Workout.started_at, Workout.id) < decode_cursor(cursor))
    rows = list(
        db.scalars(stmt.order_by(Workout.started_at.desc(), Workout.id.desc()).limit(limit + 1))
    )
    return HistoryPage(
        items=summaries(db, rows[:limit]),
        next_cursor=encode_cursor(rows[limit - 1]) if len(rows) > limit else None,
        timezone=user.timezone,
    )


def estimated_max(weight: Decimal, reps: int) -> Decimal | None:
    if not 1 <= reps <= 10:
        return None
    value = weight if reps == 1 else weight * (Decimal(1) + Decimal(reps) / 30)
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def estimated_expression():
    return func.round(
        case(
            (WorkoutSet.reps == 1, WorkoutSet.weight_kg),
            (
                WorkoutSet.reps.between(2, 10),
                WorkoutSet.weight_kg * (1 + WorkoutSet.reps / Decimal(30)),
            ),
            else_=None,
        ),
        2,
    )


def records(db: Session, row: Workout) -> list[PersonalRecord]:
    # Compare only earlier sessions, excluding this workout and later achievements.
    candidates = {}
    for exercise in row.exercises:
        if exercise.load_type_snapshot != "external":
            continue
        for s in exercise.sets:
            if not s.completed_at or s.set_type != "working" or not s.weight_kg or not s.reps:
                continue
            group = (exercise.exercise_id, exercise.load_convention_snapshot)
            for kind, key_weight, value in [
                ("reps", s.weight_kg, Decimal(s.reps)),
                ("estimated_1rm", None, estimated_max(s.weight_kg, s.reps)),
            ]:
                if value is None:
                    continue
                key = (*group, kind, key_weight)
                if key not in candidates or value > candidates[key][0]:
                    candidates[key] = (value, exercise.name_snapshot)
    if not candidates:
        return []
    estimated = estimated_expression()
    previous = db.execute(
        select(
            WorkoutExercise.exercise_id,
            WorkoutExercise.load_convention_snapshot,
            WorkoutSet.weight_kg,
            func.max(WorkoutSet.reps).label("reps"),
            func.max(estimated).label("estimated"),
        )
        .join(WorkoutSet, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(
            Workout.user_id == row.user_id,
            Workout.status == "completed",
            tuple_(Workout.started_at, Workout.id) < (row.started_at, row.id),
            WorkoutExercise.exercise_id.in_({k[0] for k in candidates}),
            WorkoutExercise.load_type_snapshot == "external",
            WorkoutSet.completed_at.is_not(None),
            WorkoutSet.set_type == "working",
            WorkoutSet.weight_kg > 0,
        )
        .group_by(
            WorkoutExercise.exercise_id,
            WorkoutExercise.load_convention_snapshot,
            WorkoutSet.weight_kg,
        )
    ).all()
    best = {}
    for item in previous:
        group = (item.exercise_id, item.load_convention_snapshot)
        best[(*group, "reps", item.weight_kg)] = Decimal(item.reps)
        if item.estimated is not None:
            key = (*group, "estimated_1rm", None)
            best[key] = max(best.get(key, Decimal(0)), item.estimated)
    result = []
    for key, (value, name) in candidates.items():
        old = best.get(key)
        if old is None or value > old:
            result.append(
                PersonalRecord(
                    exercise_id=key[0],
                    exercise_name=name,
                    load_convention=key[1],
                    kind=key[2],
                    weight_kg=key[3],
                    value=value,
                    previous_value=old,
                )
            )
    return sorted(
        result,
        key=lambda r: (
            r.exercise_name,
            str(r.exercise_id),
            r.load_convention,
            r.kind,
            r.weight_kg or 0,
        ),
    )


def report(db: Session, user_id: UUID, workout_id: UUID) -> WorkoutReport:
    row = owned(db, user_id, workout_id)
    if row.status != "completed":
        raise DomainError(
            "workout_not_completed",
            "O resumo fica disponível depois de finalizar e sincronizar o treino.",
            409,
        )
    return WorkoutReport(
        workout=WorkoutResponse.model_validate(row),
        summary=summaries(db, [row])[0],
        records=records(db, row),
    )


def dashboard(db: Session, user: User) -> Dashboard:
    today = utcnow().astimezone(ZoneInfo(user.timezone)).date()
    monday = today - timedelta(days=today.weekday())
    start, end = date_bounds(user.timezone, monday, monday + timedelta(days=6))
    scope = (
        Workout.user_id == user.id,
        Workout.status == "completed",
        Workout.started_at >= start,
        Workout.started_at < end,
    )
    count, seconds = db.execute(
        select(
            func.count(Workout.id),
            func.coalesce(
                func.sum(
                    func.greatest(
                        0,
                        func.floor(func.extract("epoch", Workout.finished_at - Workout.started_at))
                        - Workout.paused_seconds,
                    )
                ),
                0,
            ),
        ).where(*scope)
    ).one()
    sets, volume = db.execute(
        select(
            func.count(WorkoutSet.id).filter(WorkoutSet.completed_at.is_not(None)),
            func.coalesce(func.sum(volume_expression()), 0),
        )
        .select_from(Workout)
        .join(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .join(WorkoutSet, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        .where(*scope)
    ).one()
    day = func.date(func.timezone(user.timezone, Workout.started_at))
    days = dict(db.execute(select(day, func.count()).where(*scope).group_by(day)).all())
    return Dashboard(
        timezone=user.timezone,
        week_start=monday,
        week_end_exclusive=monday + timedelta(days=7),
        weekly_target=user.weekly_workout_target,
        completed_workouts=count,
        active_seconds=int(seconds),
        completed_sets=sets,
        volume_kg=volume,
        days=[
            TrainingDay(
                date=monday + timedelta(days=i), workouts=days.get(monday + timedelta(days=i), 0)
            )
            for i in range(7)
        ],
        recent=history(db, user, None, 3).items,
    )
