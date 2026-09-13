"""Small, project-owned starter catalogue. Stable IDs, insert-only and repeatable."""

from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.modules.exercises.models import Exercise, ExerciseMuscle, MuscleGroup

MUSCLES = {
    "chest": "Peito",
    "back": "Costas",
    "shoulders": "Ombros",
    "biceps": "Bíceps",
    "triceps": "Tríceps",
    "quads": "Quadríceps",
    "hamstrings": "Posteriores da coxa",
    "glutes": "Glúteos",
    "calves": "Gémeos",
    "abs": "Abdominais",
}
# key, name, equipment, primary, secondary, load_type, convention
CATALOGUE = [
    (
        "bench-press",
        "Barbell Bench Press",
        "barbell",
        "chest",
        ["triceps", "shoulders"],
        "external",
        "total",
    ),
    (
        "incline-db-press",
        "Incline Dumbbell Press",
        "dumbbell",
        "chest",
        ["triceps", "shoulders"],
        "external",
        "per_hand",
    ),
    ("cable-fly", "Cable Chest Fly", "cable", "chest", [], "external", "per_hand"),
    ("push-up", "Push-up", "bodyweight", "chest", ["triceps", "shoulders"], "bodyweight", "none"),
    ("lat-pulldown", "Lat Pulldown", "cable", "back", ["biceps"], "external", "total"),
    ("seated-row", "Seated Cable Row", "cable", "back", ["biceps"], "external", "total"),
    ("db-row", "Single-arm Dumbbell Row", "dumbbell", "back", ["biceps"], "external", "per_hand"),
    ("pull-up", "Pull-up", "bodyweight", "back", ["biceps"], "bodyweight", "added"),
    (
        "assisted-pull-up",
        "Assisted Pull-up",
        "machine",
        "back",
        ["biceps"],
        "assisted",
        "assistance",
    ),
    (
        "overhead-press",
        "Barbell Overhead Press",
        "barbell",
        "shoulders",
        ["triceps"],
        "external",
        "total",
    ),
    (
        "lateral-raise",
        "Dumbbell Lateral Raise",
        "dumbbell",
        "shoulders",
        [],
        "external",
        "per_hand",
    ),
    ("reverse-fly", "Machine Reverse Fly", "machine", "shoulders", ["back"], "external", "total"),
    ("db-curl", "Dumbbell Curl", "dumbbell", "biceps", [], "external", "per_hand"),
    ("hammer-curl", "Hammer Curl", "dumbbell", "biceps", [], "external", "per_hand"),
    ("triceps-pushdown", "Triceps Pushdown", "cable", "triceps", [], "external", "total"),
    (
        "overhead-triceps",
        "Overhead Cable Triceps Extension",
        "cable",
        "triceps",
        [],
        "external",
        "total",
    ),
    ("squat", "Barbell Back Squat", "barbell", "quads", ["glutes"], "external", "total"),
    ("leg-press", "Leg Press", "machine", "quads", ["glutes"], "external", "total"),
    ("leg-extension", "Leg Extension", "machine", "quads", [], "external", "total"),
    (
        "romanian-deadlift",
        "Romanian Deadlift",
        "barbell",
        "hamstrings",
        ["glutes", "back"],
        "external",
        "total",
    ),
    ("leg-curl", "Seated Leg Curl", "machine", "hamstrings", [], "external", "total"),
    ("hip-thrust", "Barbell Hip Thrust", "barbell", "glutes", ["hamstrings"], "external", "total"),
    ("calf-raise", "Standing Calf Raise", "machine", "calves", [], "external", "total"),
    ("cable-crunch", "Cable Crunch", "cable", "abs", [], "external", "total"),
]


def stable_id(kind: str, key: str):
    return uuid5(NAMESPACE_URL, f"fitness-tracker:{kind}:{key}")


def seed_catalogue(db: Session) -> int:
    for slug, name in MUSCLES.items():
        db.execute(
            insert(MuscleGroup)
            .values(id=stable_id("muscle", slug), slug=slug, name=name)
            .on_conflict_do_nothing(index_elements=["slug"])
        )
    muscle_ids = dict(db.execute(select(MuscleGroup.slug, MuscleGroup.id)).all())
    added = 0
    for key, name, equipment, primary, secondary, load_type, convention in CATALOGUE:
        exercise_id = stable_id("exercise", key)
        inserted = db.scalar(
            insert(Exercise)
            .values(
                id=exercise_id,
                owner_id=None,
                name=name,
                equipment=equipment,
                load_type=load_type,
                load_convention=convention,
            )
            .on_conflict_do_nothing(index_elements=["id"])
            .returning(Exercise.id)
        )
        if inserted is None:
            continue
        links = [(primary, "primary"), *[(slug, "secondary") for slug in secondary]]
        for slug, role in links:
            db.execute(
                insert(ExerciseMuscle).values(
                    exercise_id=exercise_id, muscle_group_id=muscle_ids[slug], role=role
                )
            )
        added += 1
    return added
