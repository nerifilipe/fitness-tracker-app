from datetime import timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import case, func, select, tuple_
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.core.security import utcnow
from app.modules.exercises.models import Exercise
from app.modules.exercises.service import decode_cursor as decode_exercise_cursor
from app.modules.exercises.service import encode_cursor as encode_exercise_cursor
from app.modules.exercises.service import visible
from app.modules.progress.strength_schemas import (
    StrengthBest,
    StrengthExercise,
    StrengthExercisePage,
    StrengthGroup,
    StrengthOverview,
    StrengthPoint,
    StrengthRecords,
    StrengthSession,
    StrengthSessionPage,
    StrengthSet,
)
from app.modules.users.models import User
from app.modules.workouts.models import Workout, WorkoutExercise, WorkoutSet
from app.modules.workouts.reports import (
    date_bounds,
    decode_cursor,
    encode_cursor,
    estimated_expression,
)


def scope(user_id: UUID, exercise_id: UUID | None = None):
    filters = [
        Workout.user_id == user_id,
        Workout.status == "completed",
        WorkoutSet.completed_at.is_not(None),
        WorkoutSet.set_type == "working",
    ]
    if exercise_id:
        filters.append(WorkoutExercise.exercise_id == exercise_id)
    return filters


def joined(*columns):
    return (
        select(*columns)
        .select_from(Workout)
        .join(WorkoutExercise, WorkoutExercise.workout_id == Workout.id)
        .join(WorkoutSet, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
    )


def exercise(db: Session, user_id: UUID, exercise_id: UUID) -> Exercise:
    row = db.scalar(select(Exercise).where(Exercise.id == exercise_id, visible(user_id)))
    if row is None:
        raise DomainError("exercise_not_found", "Exercício não encontrado.", 404)
    return row


def exercises(db: Session, user: User, q: str, cursor: str | None, limit: int):
    query = (
        joined(
            Exercise.id,
            Exercise.name,
            func.count(func.distinct(Workout.id)).label("sessions"),
            func.max(Workout.started_at).label("last_trained"),
        )
        .join(Exercise, Exercise.id == WorkoutExercise.exercise_id)
        .where(*scope(user.id), visible(user.id))
    )
    if q.strip():
        query = query.where(Exercise.name.icontains(q.strip(), autoescape=True))
    if cursor:
        name, row_id = decode_exercise_cursor(cursor)
        query = query.where(tuple_(func.lower(Exercise.name), Exercise.id) > (name.lower(), row_id))
    rows = db.execute(
        query.group_by(Exercise.id, Exercise.name)
        .order_by(func.lower(Exercise.name), Exercise.id)
        .limit(limit + 1)
    ).all()
    return StrengthExercisePage(
        items=[StrengthExercise(**row._mapping) for row in rows[:limit]],
        next_cursor=encode_exercise_cursor(rows[limit - 1].name, rows[limit - 1].id)
        if len(rows) > limit
        else None,
    )


def group_scope(group: StrengthGroup):
    return [
        WorkoutExercise.load_type_snapshot == group.load_type,
        WorkoutExercise.load_convention_snapshot == group.load_convention,
    ]


def estimate():
    return case(
        (
            (WorkoutExercise.load_type_snapshot == "external") & (WorkoutSet.weight_kg > 0),
            estimated_expression(),
        ),
        else_=None,
    )


def session_rows(db: Session, filters: list, cursor: str | None, limit: int):
    query = joined(
        Workout.id.label("workout_id"),
        Workout.name_snapshot.label("workout_name"),
        Workout.started_at,
        func.count(WorkoutSet.id).label("completed_sets"),
        func.sum(WorkoutSet.reps).label("total_reps"),
        func.max(WorkoutSet.weight_kg).label("max_weight_kg"),
        func.sum(
            case(
                (
                    WorkoutExercise.load_type_snapshot == "external",
                    WorkoutSet.weight_kg * WorkoutSet.reps,
                ),
                else_=None,
            )
        ).label("volume_kg"),
        func.max(estimate()).label("estimated_1rm"),
    ).where(*filters)
    if cursor:
        query = query.where(tuple_(Workout.started_at, Workout.id) < decode_cursor(cursor))
    return db.execute(
        query.group_by(Workout.id)
        .order_by(Workout.started_at.desc(), Workout.id.desc())
        .limit(limit)
    ).all()


def sessions(db: Session, filters: list, rows: list) -> list[StrengthSession]:
    if not rows:
        return []
    details = {row.workout_id: [] for row in rows}
    for row in db.execute(
        joined(Workout.id, WorkoutSet.weight_kg, WorkoutSet.reps, WorkoutSet.rir)
        .where(*filters, Workout.id.in_(details))
        .order_by(WorkoutExercise.position, WorkoutSet.position)
    ):
        details[row.id].append(StrengthSet(weight_kg=row.weight_kg, reps=row.reps, rir=row.rir))
    return [StrengthSession(**row._mapping, sets=details[row.workout_id]) for row in rows]


def best(db: Session, filters: list, value) -> StrengthBest | None:
    row = db.execute(
        joined(
            value.label("value"),
            WorkoutSet.weight_kg,
            WorkoutSet.reps,
            Workout.id.label("workout_id"),
            Workout.started_at,
        )
        .where(*filters, value.is_not(None))
        .order_by(
            value.desc(),
            Workout.started_at,
            Workout.id,
            WorkoutExercise.position,
            WorkoutSet.position,
        )
        .limit(1)
    ).first()
    return StrengthBest(**row._mapping) if row else None


def overview(
    db: Session,
    user: User,
    exercise_id: UUID,
    days: int,
    load_type: str | None,
    convention: str | None,
) -> StrengthOverview:
    definition = exercise(db, user.id, exercise_id)
    filters = scope(user.id, exercise_id)
    groups = [
        StrengthGroup(load_type=row[0], load_convention=row[1])
        for row in db.execute(
            joined(
                WorkoutExercise.load_type_snapshot,
                WorkoutExercise.load_convention_snapshot,
                func.max(Workout.started_at),
            )
            .where(*filters)
            .group_by(
                WorkoutExercise.load_type_snapshot,
                WorkoutExercise.load_convention_snapshot,
            )
            .order_by(
                func.max(Workout.started_at).desc(),
                WorkoutExercise.load_type_snapshot,
                WorkoutExercise.load_convention_snapshot,
            )
        )
    ]
    if not groups:
        groups = [
            StrengthGroup(
                load_type=definition.load_type, load_convention=definition.load_convention
            )
        ]
    selected = next(
        (g for g in groups if g.load_type == load_type and g.load_convention == convention), None
    )
    if load_type is not None or convention is not None:
        if selected is None:
            raise DomainError(
                "invalid_load_group", "Escolhe uma convenção disponível neste exercício.", 422
            )
    else:
        selected = groups[0]
    filters += group_scope(selected)
    recent = sessions(db, filters, session_rows(db, filters, None, 2))
    record_filters = [
        *filters,
        WorkoutExercise.load_type_snapshot == "external",
        WorkoutSet.weight_kg > 0,
    ]
    last_weight = recent[0].max_weight_kg if recent else None
    records = StrengthRecords(
        heaviest=best(db, record_filters, WorkoutSet.weight_kg),
        estimated_1rm=best(db, record_filters, estimate()),
        reps_at_latest_weight=best(
            db,
            [*record_filters, WorkoutSet.weight_kg == Decimal(str(last_weight))],
            WorkoutSet.reps,
        )
        if last_weight is not None
        else None,
    )
    today = utcnow().astimezone(ZoneInfo(user.timezone)).date()
    start, end = date_bounds(user.timezone, today - timedelta(days=days - 1), today)
    local_date = func.date(func.timezone(user.timezone, Workout.started_at))
    value = estimate() if selected.load_type == "external" else WorkoutSet.reps
    points = [
        StrengthPoint(date=row[0], value=row[1])
        for row in db.execute(
            joined(
                local_date,
                func.max(value),
            )
            .where(
                *filters, Workout.started_at >= start, Workout.started_at < end, value.is_not(None)
            )
            .group_by(local_date)
            .order_by(local_date)
        )
    ]
    return StrengthOverview(
        exercise_id=exercise_id,
        exercise_name=definition.name,
        timezone=user.timezone,
        groups=groups,
        selected=selected,
        days=days,
        chart_metric="estimated_1rm" if selected.load_type == "external" else "reps",
        points=points,
        records=records,
        latest=recent[0] if recent else None,
        previous=recent[1] if len(recent) > 1 else None,
    )


def history(
    db: Session, user: User, exercise_id: UUID, group: StrengthGroup, cursor: str | None, limit: int
) -> StrengthSessionPage:
    exercise(db, user.id, exercise_id)
    filters = scope(user.id, exercise_id) + group_scope(group)
    rows = session_rows(db, filters, cursor, limit + 1)
    last = rows[limit - 1] if len(rows) > limit else None
    # Reuse the workout history cursor format and deterministic timestamp/UUID order.
    cursor_row = Workout(id=last.workout_id, started_at=last.started_at) if last else None
    return StrengthSessionPage(
        items=sessions(db, filters, rows[:limit]),
        next_cursor=encode_cursor(cursor_row) if cursor_row else None,
    )
