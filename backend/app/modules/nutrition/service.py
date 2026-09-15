from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.core.security import utcnow
from app.modules.nutrition.models import Food, MealEntry, NutritionCopy, NutritionGoal
from app.modules.nutrition.schemas import (
    EntryInput,
    EntryResponse,
    FoodInput,
    FoodResponse,
    FoodSnapshot,
    MealCopy,
    NutritionDay,
    NutritionGoals,
    NutritionValues,
)
from app.modules.users.models import User

NUTRIENTS = ("calories", "protein", "carbs", "fat")


def lock_user(db: Session, user_id: UUID):
    # Serialize this user's small mutations, including imports and copy retries.
    db.execute(select(User.id).where(User.id == user_id).with_for_update())


def food_response(row: Food) -> FoodResponse:
    return FoodResponse(
        **row.snapshot, id=row.id, is_favorite=row.is_favorite, last_quantity=row.last_quantity
    )


def owned_food(db: Session, user_id: UUID, food_id: UUID) -> Food:
    row = db.scalar(select(Food).where(Food.id == food_id, Food.user_id == user_id))
    if row is None:
        raise DomainError("food_not_found", "Alimento não encontrado.", 404)
    return row


def foods(db: Session, user_id: UUID, favorites: bool, q: str) -> list[FoodResponse]:
    query = select(Food).where(Food.user_id == user_id)
    if favorites:
        query = query.where(Food.is_favorite.is_(True))
    if q.strip():
        query = query.where(Food.snapshot["name"].astext.icontains(q.strip(), autoescape=True))
    return [
        food_response(row)
        for row in db.scalars(query.order_by(Food.last_used_at.desc(), Food.id).limit(50))
    ]


def save_food(db: Session, user_id: UUID, snapshot: FoodSnapshot) -> FoodResponse:
    lock_user(db, user_id)
    row = None
    if snapshot.source_code:
        row = db.scalar(
            select(Food).where(Food.user_id == user_id, Food.source_code == snapshot.source_code)
        )
    if row is None:
        row = Food(
            user_id=user_id,
            source_code=snapshot.source_code,
            snapshot=snapshot.model_dump(mode="json"),
        )
        db.add(row)
    db.commit()
    return food_response(row)


def custom_food(db: Session, user_id: UUID, data: FoodInput) -> FoodResponse:
    return save_food(db, user_id, FoodSnapshot(**data.model_dump(), source="custom"))


def favorite(db: Session, user_id: UUID, food_id: UUID, value: bool) -> FoodResponse:
    lock_user(db, user_id)
    row = owned_food(db, user_id, food_id)
    row.is_favorite = value
    db.commit()
    return food_response(row)


def values(row: MealEntry) -> dict[str, Decimal]:
    return {key: Decimal(str(row.snapshot[key])) * row.quantity / 100 for key in NUTRIENTS}


def rounded(values: dict[str, Decimal]) -> NutritionValues:
    return NutritionValues(
        **{
            key: float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
            for key, value in values.items()
        }
    )


def entry_response(row: MealEntry) -> EntryResponse:
    return EntryResponse(
        id=row.id,
        food_id=row.food_id,
        date=row.date,
        meal=row.meal,
        quantity=row.quantity,
        food=FoodSnapshot(**row.snapshot),
        totals=rounded(values(row)),
        created_at=row.created_at,
    )


def entries(db: Session, user_id: UUID, day: date) -> list[MealEntry]:
    return list(
        db.scalars(
            select(MealEntry)
            .where(
                MealEntry.user_id == user_id, MealEntry.date == day, MealEntry.deleted.is_(False)
            )
            .order_by(MealEntry.created_at, MealEntry.id)
        )
    )


def diary(db: Session, user: User, day: date | None) -> NutritionDay:
    day = day or datetime.now(ZoneInfo(user.timezone)).date()
    rows = entries(db, user.id, day)
    totals = dict.fromkeys(NUTRIENTS, Decimal(0))
    for row in rows:
        for key, value in values(row).items():
            totals[key] += value
    goal = db.get(NutritionGoal, user.id)
    return NutritionDay(
        date=day,
        timezone=user.timezone,
        entries=[entry_response(row) for row in rows],
        totals=rounded(totals),
        goals=NutritionGoals(**goal.targets) if goal else NutritionGoals(),
    )


def save_entry(db: Session, user_id: UUID, entry_id: UUID, data: EntryInput) -> EntryResponse:
    lock_user(db, user_id)
    row = db.get(MealEntry, entry_id)
    if row and row.user_id != user_id:
        raise DomainError("entry_not_found", "Registo não encontrado.", 404)
    if row and row.deleted:
        raise DomainError("entry_deleted", "Este registo já foi removido.", 409)
    food = owned_food(db, user_id, data.food_id)
    if row and row.food_id != data.food_id:
        raise DomainError(
            "entry_food_changed", "Adiciona um novo registo para outro alimento.", 409
        )
    if (row is None or row.date != data.date) and len(entries(db, user_id, data.date)) >= 200:
        raise DomainError("day_full", "Este dia já tem 200 alimentos registados.", 422)
    if row is None:
        row = MealEntry(id=entry_id, user_id=user_id, food_id=food.id, snapshot=food.snapshot)
        db.add(row)
    row.date, row.meal = data.date, data.meal
    row.quantity = Decimal(str(data.quantity)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    if row.quantity <= 0:
        raise DomainError("quantity_too_small", "Usa uma quantidade de pelo menos 0,001.", 422)
    food.last_quantity, food.last_used_at = row.quantity, utcnow()
    db.commit()
    return entry_response(row)


def remove_entry(db: Session, user_id: UUID, entry_id: UUID):
    lock_user(db, user_id)
    row = db.scalar(select(MealEntry).where(MealEntry.id == entry_id, MealEntry.user_id == user_id))
    if row is None:
        raise DomainError("entry_not_found", "Registo não encontrado.", 404)
    row.deleted = True
    db.commit()


def save_goals(db: Session, user_id: UUID, data: NutritionGoals) -> NutritionGoals:
    lock_user(db, user_id)
    row = db.get(NutritionGoal, user_id)
    if row is None:
        row = NutritionGoal(user_id=user_id)
        db.add(row)
    row.targets = data.model_dump(mode="json")
    db.commit()
    return data


def copy_meal(db: Session, user: User, copy_id: UUID, data: MealCopy) -> NutritionDay:
    lock_user(db, user.id)
    payload = data.model_dump(mode="json")
    receipt = db.get(NutritionCopy, (user.id, copy_id))
    if receipt:
        if receipt.request != payload:
            raise DomainError("copy_conflict", "Esta cópia já foi usada para outra refeição.", 409)
        return diary(db, user, data.target_date)
    source = [row for row in entries(db, user.id, data.source_date) if row.meal == data.source_meal]
    if not source:
        raise DomainError("meal_empty", "Essa refeição não tem alimentos para repetir.", 422)
    if len(entries(db, user.id, data.target_date)) + len(source) > 200:
        raise DomainError("day_full", "A cópia ultrapassa o limite de 200 alimentos por dia.", 422)
    for row in source:
        db.add(
            MealEntry(
                id=uuid4(),
                user_id=user.id,
                food_id=row.food_id,
                snapshot=row.snapshot,
                quantity=row.quantity,
                date=data.target_date,
                meal=data.target_meal,
            )
        )
    db.add(NutritionCopy(user_id=user.id, id=copy_id, request=payload))
    db.commit()
    return diary(db, user, data.target_date)
