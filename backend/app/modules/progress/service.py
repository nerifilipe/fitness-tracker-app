from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.modules.progress.models import METRICS, BodyMeasurement
from app.modules.progress.schemas import (
    MeasurementInput,
    MeasurementPage,
    MeasurementResponse,
    MetricTrend,
    MetricValue,
    ProgressSummary,
)
from app.modules.users.models import User


def today(user: User) -> date:
    return datetime.now(ZoneInfo(user.timezone)).date()


def validate_day(user: User, day: date):
    if day < date(1900, 1, 1) or day > today(user):
        raise DomainError("invalid_measurement_date", "Escolhe uma data entre 1900 e hoje.", 422)


def detail(db: Session, user: User, day: date) -> MeasurementResponse | None:
    validate_day(user, day)
    row = db.get(BodyMeasurement, (user.id, day))
    return MeasurementResponse.model_validate(row) if row else None


def save(db: Session, user: User, day: date, data: MeasurementInput) -> MeasurementResponse:
    validate_day(user, day)
    # One row per local day; serialize concurrent first inserts and retries.
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    row = db.get(BodyMeasurement, (user.id, day))
    if row is None:
        row = BodyMeasurement(user_id=user.id, date=day)
        db.add(row)
    for field in METRICS:
        value = getattr(data, field)
        setattr(
            row,
            field,
            None
            if value is None
            else Decimal(str(value)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP),
        )
    row.notes = data.notes or None
    db.commit()
    return MeasurementResponse.model_validate(row)


def remove(db: Session, user: User, day: date):
    validate_day(user, day)
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    row = db.get(BodyMeasurement, (user.id, day))
    if row:
        db.delete(row)
    db.commit()


def history(db: Session, user_id: UUID, before: date | None, limit: int) -> MeasurementPage:
    query = select(BodyMeasurement).where(BodyMeasurement.user_id == user_id)
    if before:
        query = query.where(BodyMeasurement.date < before)
    rows = list(db.scalars(query.order_by(BodyMeasurement.date.desc()).limit(limit + 1)))
    return MeasurementPage(
        items=[MeasurementResponse.model_validate(row) for row in rows[:limit]],
        next_before=rows[limit - 1].date if len(rows) > limit else None,
    )


def summary(db: Session, user: User, days: int) -> ProgressSummary:
    end = today(user)
    start = end - timedelta(days=days - 1)
    base = select(BodyMeasurement).where(BodyMeasurement.user_id == user.id)
    points = list(
        db.scalars(
            base.where(BodyMeasurement.date >= start, BodyMeasurement.date <= end).order_by(
                BodyMeasurement.date
            )
        )
    )
    metrics = {}
    for key in METRICS:
        # Each metric has its own latest date: a weigh-in does not hide older measurements.
        latest = db.scalar(
            base.where(getattr(BodyMeasurement, key).is_not(None), BodyMeasurement.date <= end)
            .order_by(BodyMeasurement.date.desc())
            .limit(1)
        )
        values = [getattr(point, key) for point in points if getattr(point, key) is not None]
        metrics[key] = MetricTrend(
            latest=MetricValue(date=latest.date, value=getattr(latest, key)) if latest else None,
            change=float((values[-1] - values[0]).quantize(Decimal("0.001")))
            if len(values) > 1
            else None,
            count=len(values),
        )
    return ProgressSummary(
        today=end,
        timezone=user.timezone,
        start_date=start,
        days=days,
        metrics=metrics,
        points=[MeasurementResponse.model_validate(row) for row in points],
    )
