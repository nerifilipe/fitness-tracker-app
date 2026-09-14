from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import timedelta
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from sqlalchemy.orm import Session
from test_exercises import create as custom_exercise
from test_exercises import login

from app.core.errors import DomainError
from app.core.security import utcnow
from app.modules.exercises.models import Exercise
from app.modules.exercises.seed import seed_catalogue
from app.modules.workouts import service
from app.modules.workouts.schemas import WorkoutStart

ROOT = "/api/v1/workouts"


@pytest.fixture
def context(client, database_url):
    with Session(database_url) as db, db.begin():
        seed_catalogue(db)
    headers = login(client)
    exercise = custom_exercise(client, headers)
    template = client.post(
        "/api/v1/workout-templates",
        headers=headers,
        json={
            "name": "Push snapshot",
            "exercises": [
                {
                    "exercise_id": exercise["id"],
                    "rest_seconds": 90,
                    "sets": [
                        {
                            "set_type": "working",
                            "target_reps_min": 8,
                            "target_reps_max": 12,
                            "target_weight_kg": "20.125",
                            "target_rir": 2,
                        }
                    ],
                }
            ],
        },
    )
    assert template.status_code == 201, template.text
    start = {"id": str(uuid4()), "template_id": template.json()["id"], "template_version": 1}
    return headers, start


def begin(client, headers, body):
    result = client.post(ROOT, headers=headers, json=body)
    assert result.status_code == 201, result.text
    return result.json()


def payload(workout, **changes):
    return {
        "version": workout["version"],
        "mutation_id": str(uuid4()),
        "status": workout["status"],
        "paused_at": workout["paused_at"],
        "paused_seconds": workout["paused_seconds"],
        "finished_at": workout["finished_at"],
        "rest_deadline": workout["rest_deadline"],
        "notes": workout["notes"],
        "exercises": [
            {
                "id": e["id"],
                "exercise_id": e["exercise_id"],
                "rest_seconds": e["rest_seconds"],
                "notes": e["notes"],
                "sets": deepcopy(e["sets"]),
            }
            for e in workout["exercises"]
        ],
        **changes,
    }


def put(client, headers, workout, data):
    result = client.put(f"{ROOT}/{workout['id']}", headers=headers, json=data)
    assert result.status_code == 200, result.text
    return result.json()


def test_start_is_idempotent_snapshot_and_one_active(client, context, database_url):
    headers, data = context
    workout = begin(client, headers, data)
    assert workout["status"] == "active" and workout["version"] == 1
    assert workout["exercises"][0]["sets"][0]["completed_at"] is None
    assert begin(client, headers, data)["id"] == workout["id"]
    assert client.post(ROOT, headers=headers, json={**data, "id": str(uuid4())}).status_code == 409
    with Session(database_url) as db, db.begin():
        exercise = db.get(Exercise, UUID(workout["exercises"][0]["exercise_id"]))
        exercise.name = "Changed after start"
        exercise.load_type, exercise.load_convention = "bodyweight", "none"
        exercise.archived_at = utcnow()
    detail = client.get(f"{ROOT}/{workout['id']}", headers=headers).json()
    assert detail["exercises"][0]["name_snapshot"] == workout["exercises"][0]["name_snapshot"]
    assert detail["exercises"][0]["load_convention_snapshot"] == "per_hand"
    assert client.get(ROOT + "/active", headers=headers).json()["id"] == workout["id"]
    assert client.get(ROOT + "/active", headers=headers).headers["cache-control"] == "no-store"


def test_set_pause_resume_cancel_and_retry_after_later_mutation(client, context):
    headers, data = context
    workout = begin(client, headers, data)
    change = payload(workout)
    change["exercises"][0]["sets"][0]["completed_at"] = utcnow().isoformat()
    change["rest_deadline"] = (utcnow() + timedelta(seconds=90)).isoformat()
    first = put(client, headers, workout, change)
    assert first["applied_version"] == 2
    assert put(client, headers, workout, change)["applied_version"] == 2
    changed_request = {**change, "notes": "different body same key"}
    assert (
        client.put(f"{ROOT}/{workout['id']}", headers=headers, json=changed_request).status_code
        == 409
    )
    paused = put(
        client,
        headers,
        workout,
        payload(first["workout"], status="paused", paused_at=utcnow().isoformat()),
    )["workout"]
    assert paused["status"] == "paused"
    retry = put(client, headers, workout, change)
    assert retry["applied_version"] == 2 and retry["workout"]["version"] == 3
    resumed = put(client, headers, workout, payload(paused, status="active", paused_at=None))[
        "workout"
    ]
    cancelled = payload(
        resumed, status="cancelled", finished_at=utcnow().isoformat(), rest_deadline=None
    )
    closed = put(client, headers, workout, cancelled)["workout"]
    assert closed["status"] == "cancelled"
    assert client.get(ROOT + "/active", headers=headers).json() is None
    assert put(client, headers, workout, cancelled)["workout"]["status"] == "cancelled"
    assert (
        client.put(
            f"{ROOT}/{workout['id']}",
            headers=headers,
            json=payload(closed, status="active", finished_at=None),
        ).status_code
        == 409
    )
    assert begin(client, headers, data)["status"] == "cancelled"
    assert begin(client, headers, {**data, "id": str(uuid4())})["status"] == "active"


def test_ownership_and_stale_versions(client, context):
    headers, data = context
    workout = begin(client, headers, data)
    other = login(client)
    assert client.post(ROOT, headers=other, json={**data, "id": str(uuid4())}).status_code == 404
    assert client.get(ROOT + "/active", headers=other).json() is None
    for user in (other, {}):
        expected = 404 if user else 401
        assert client.get(f"{ROOT}/{workout['id']}", headers=user).status_code == expected
        assert (
            client.put(f"{ROOT}/{workout['id']}", headers=user, json=payload(workout)).status_code
            == expected
        )
    change = payload(workout)
    put(client, headers, workout, change)
    assert (
        client.put(f"{ROOT}/{workout['id']}", headers=headers, json=payload(workout)).status_code
        == 409
    )


def test_add_replace_remove_and_invalid_references_are_atomic(client, context):
    headers, data = context
    workout = begin(client, headers, data)
    extra = custom_exercise(client, headers, name="New squat")
    change = payload(workout)
    added = deepcopy(change["exercises"][0])
    added.update(id=str(uuid4()), exercise_id=extra["id"])
    added["sets"][0]["id"] = str(uuid4())
    change["exercises"].insert(0, added)
    changed = put(client, headers, workout, change)["workout"]
    assert changed["exercises"][0]["name_snapshot"] == "New squat"
    invalid = payload(changed)
    invalid["exercises"][0]["exercise_id"] = str(uuid4())
    assert client.put(f"{ROOT}/{workout['id']}", headers=headers, json=invalid).status_code == 422
    assert client.get(f"{ROOT}/{workout['id']}", headers=headers).json()["version"] == 2
    other = login(client)
    private = custom_exercise(client, other)
    invalid["exercises"][0]["exercise_id"] = private["id"]
    assert client.put(f"{ROOT}/{workout['id']}", headers=headers, json=invalid).status_code == 422
    replacement = payload(changed)
    replacement["exercises"] = replacement["exercises"][:1]
    replacement["exercises"][0]["exercise_id"] = workout["exercises"][0]["exercise_id"]
    replaced = put(client, headers, workout, replacement)["workout"]
    assert len(replaced["exercises"]) == 1
    assert replaced["exercises"][0]["name_snapshot"] == workout["exercises"][0]["name_snapshot"]


@pytest.mark.parametrize(
    "change",
    [
        {"reps": 0},
        {"rir": 11},
        {"weight_kg": "-1"},
        {"weight_kg": "1.1234"},
        {"weight_kg": None, "completed_at": "2026-01-01T00:00:00Z"},
        {"completed_at": "2020-01-01T00:00:00Z"},
        {"completed_at": "2099-01-01T00:00:00Z"},
    ],
)
def test_invalid_sets_do_not_change_workout(client, context, change):
    headers, data = context
    workout = begin(client, headers, data)
    body = payload(workout)
    body["exercises"][0]["sets"][0].update(change)
    assert client.put(f"{ROOT}/{workout['id']}", headers=headers, json=body).status_code == 422
    assert client.get(f"{ROOT}/{workout['id']}", headers=headers).json()["version"] == 1


def test_invalid_state_and_duplicate_ids(client, context):
    headers, data = context
    workout = begin(client, headers, data)
    for fields in [
        {"status": "paused"},
        {"status": "cancelled"},
        {"paused_seconds": 10000},
        {"status": "completed"},
        {"rest_deadline": "2099-01-01T00:00:00Z"},
    ]:
        assert (
            client.put(
                f"{ROOT}/{workout['id']}", headers=headers, json=payload(workout, **fields)
            ).status_code
            == 422
        )
    body = payload(workout)
    body["exercises"] *= 2
    assert client.put(f"{ROOT}/{workout['id']}", headers=headers, json=body).status_code == 422


def test_concurrent_starts_create_one_active(client, context, database_url):
    headers, data = context
    user_id = UUID(client.get("/api/v1/users/me", headers=headers).json()["id"])
    barrier = Barrier(2)

    def create(_):
        with Session(database_url) as db:
            barrier.wait(timeout=10)
            try:
                return service.start(
                    db, user_id, WorkoutStart(**{**data, "id": str(uuid4())})
                ).version
            except DomainError as exc:
                return exc.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(create, range(2))) == [1, 409]
