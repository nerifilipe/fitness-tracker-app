from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
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
from app.modules.templates import service
from app.modules.templates.models import WorkoutTemplate
from app.modules.templates.schemas import TemplateInput, TemplateUpdate

ROOT = "/api/v1/workout-templates"


@pytest.fixture
def context(client, database_url):
    with Session(database_url) as db, db.begin():
        seed_catalogue(db)
    headers = login(client)
    exercise = custom_exercise(client, headers)
    data = {
        "name": "Push A",
        "exercises": [
            {
                "exercise_id": exercise["id"],
                "rest_seconds": 120,
                "notes": "Controlar descida",
                "sets": [
                    {
                        "set_type": "warmup",
                        "target_reps_min": 10,
                        "target_reps_max": 12,
                        "target_weight_kg": "12.125",
                        "target_rir": 3,
                    },
                    {
                        "set_type": "working",
                        "target_reps_min": 6,
                        "target_reps_max": 8,
                        "target_weight_kg": "20.5",
                        "target_rir": 1,
                    },
                ],
            }
        ],
    }
    return headers, data


def save(client, headers, data):
    result = client.post(ROOT, headers=headers, json=data)
    assert result.status_code == 201, result.text
    return result.json()


def test_plan_roundtrip_reorder_duplicate_and_archive(client, context, database_url):
    headers, data = context
    second = deepcopy(data["exercises"][0])
    second["notes"] = "Mesmo exercício, outro bloco"
    second["sets"] = second["sets"][:1]
    data["exercises"].append(second)
    plan = save(client, headers, data)
    assert (plan["exercise_count"], plan["set_count"], plan["version"]) == (2, 3, 1)
    assert plan["exercises"][0]["sets"][0]["target_weight_kg"] == "12.125"
    fetched = client.get(f"{ROOT}/{plan['id']}", headers=headers)
    assert fetched.json() == plan
    assert fetched.headers["cache-control"] == "no-store"
    data["name"] = "Push B"
    data["exercises"].reverse()
    result = client.put(f"{ROOT}/{plan['id']}", headers=headers, json={**data, "version": 1})
    assert result.status_code == 200, result.text
    edited = result.json()
    assert edited["version"] == 2 and edited["name"] == "Push B"
    assert [e["position"] for e in edited["exercises"]] == [0, 1]
    assert edited["exercises"][0]["notes"] == second["notes"]
    copy = client.post(f"{ROOT}/{plan['id']}/duplicate", headers=headers)
    assert copy.status_code == 201, copy.text
    copy = copy.json()
    assert copy["id"] != plan["id"] and copy["version"] == 1
    assert copy["name"] == "Push B (cópia)" and copy["set_count"] == 3
    assert copy["exercises"][0]["id"] != edited["exercises"][0]["id"]
    assert client.delete(f"{ROOT}/{plan['id']}?version=2", headers=headers).status_code == 204
    assert client.get(f"{ROOT}/{plan['id']}", headers=headers).status_code == 404
    assert client.get(f"{ROOT}/{copy['id']}", headers=headers).status_code == 200
    with Session(database_url) as db:
        assert db.get(WorkoutTemplate, UUID(plan["id"])).archived_at is not None


def test_ownership_all_routes_and_references(client, context):
    headers, data = context
    plan = save(client, headers, data)
    other = login(client)
    for method, path, body in [
        ("GET", f"/{plan['id']}", None),
        ("PUT", f"/{plan['id']}", {**data, "version": 1}),
        ("POST", f"/{plan['id']}/duplicate", None),
        ("DELETE", f"/{plan['id']}?version=1", None),
    ]:
        assert client.request(method, ROOT + path, headers=other, json=body).status_code == 404
        assert client.request(method, ROOT + path, json=body).status_code == 401
    assert client.get(ROOT, headers=other).json()["items"] == []
    assert client.post(ROOT, headers=other, json=data).status_code == 422
    data["exercises"][0]["exercise_id"] = str(uuid4())
    assert client.post(ROOT, headers=headers, json=data).status_code == 422


def test_stale_update_delete_and_invalid_replacement_are_atomic(client, context):
    headers, data = context
    plan = save(client, headers, data)
    path = f"{ROOT}/{plan['id']}"
    changed = {**data, "name": "Renamed", "version": 1}
    assert client.put(path, headers=headers, json=changed).status_code == 200
    assert client.put(path, headers=headers, json=changed).status_code == 409
    assert client.delete(path + "?version=1", headers=headers).status_code == 409
    changed["version"] = 2
    changed["exercises"][0]["exercise_id"] = str(uuid4())
    assert client.put(path, headers=headers, json=changed).status_code == 422
    unchanged = client.get(path, headers=headers).json()
    assert unchanged["name"] == "Renamed" and unchanged["version"] == 2
    assert unchanged["exercises"][0]["exercise_id"] == plan["exercises"][0]["exercise_id"]


def test_archived_exercise_retained_but_cannot_be_added(client, context):
    headers, data = context
    plan = save(client, headers, data)
    exercise_id = data["exercises"][0]["exercise_id"]
    assert client.delete(f"/api/v1/exercises/{exercise_id}", headers=headers).status_code == 204
    assert client.get(f"{ROOT}/{plan['id']}", headers=headers).json()["exercises"][0]["is_archived"]
    assert client.post(ROOT, headers=headers, json=data).status_code == 422
    assert (
        client.put(f"{ROOT}/{plan['id']}", headers=headers, json={**data, "version": 1}).status_code
        == 200
    )
    assert client.post(f"{ROOT}/{plan['id']}/duplicate", headers=headers).status_code == 201
    data["exercises"].append(deepcopy(data["exercises"][0]))
    assert (
        client.put(f"{ROOT}/{plan['id']}", headers=headers, json={**data, "version": 2}).status_code
        == 422
    )
    assert (
        client.put(
            f"{ROOT}/{plan['id']}",
            headers=headers,
            json={"name": "Empty", "exercises": [], "version": 2},
        ).status_code
        == 200
    )


@pytest.mark.parametrize(
    "field,value",
    [
        ("target_reps_min", 0),
        ("target_reps_max", 9),
        ("target_reps_max", 1000),
        ("target_weight_kg", "-1"),
        ("target_weight_kg", "1.1234"),
        ("target_weight_kg", "NaN"),
        ("target_rir", 11),
        ("set_type", "invalid"),
    ],
)
def test_invalid_sets(client, context, field, value):
    headers, data = context
    data["exercises"][0]["sets"][0][field] = value
    assert client.post(ROOT, headers=headers, json=data).status_code == 422
    assert client.get(ROOT, headers=headers).json()["items"] == []


def test_limits_empty_plan_and_pagination(client, context):
    headers, data = context
    for invalid in [
        {**data, "name": " "},
        {**data, "user_id": str(uuid4())},
        {**data, "exercises": data["exercises"] * 41},
        {**data, "exercises": [{**data["exercises"][0], "sets": []}]},
        {
            **data,
            "exercises": [{**data["exercises"][0], "sets": data["exercises"][0]["sets"] * 11}],
        },
        {**data, "exercises": [{**data["exercises"][0], "rest_seconds": -1}]},
    ]:
        assert client.post(ROOT, headers=headers, json=invalid).status_code == 422
    ids = {save(client, headers, {"name": str(i)})["id"] for i in range(3)}
    first = client.get(ROOT + "?limit=2", headers=headers).json()
    second = client.get(ROOT + f"?limit=2&offset={first['next_offset']}", headers=headers).json()
    assert {p["id"] for p in first["items"] + second["items"]} == ids
    assert second["next_offset"] is None
    assert all(p["set_count"] == 0 for p in first["items"])


def test_bodyweight_without_load_rejects_weight(client, context):
    headers, data = context
    exercise = custom_exercise(client, headers, load_type="bodyweight", load_convention="none")
    data["exercises"][0]["exercise_id"] = exercise["id"]
    assert client.post(ROOT, headers=headers, json=data).status_code == 422
    for s in data["exercises"][0]["sets"]:
        s["target_weight_kg"] = None
    assert save(client, headers, data)["set_count"] == 2


def test_concurrent_edits_have_one_winner(client, context, database_url):
    headers, data = context
    plan = save(client, headers, data)
    user_id = UUID(client.get("/api/v1/users/me", headers=headers).json()["id"])
    barrier = Barrier(2)

    def edit(name):
        with Session(database_url) as db:
            barrier.wait(timeout=10)
            try:
                result = service.update(
                    db,
                    user_id,
                    UUID(plan["id"]),
                    TemplateUpdate(**{**data, "name": name, "version": 1}),
                )
                return result.version
            except DomainError as exc:
                return exc.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(edit, ["First edit", "Second edit"]))
    assert sorted(results) == [2, 409]
    result = client.get(f"{ROOT}/{plan['id']}", headers=headers).json()
    assert result["version"] == 2 and result["set_count"] == 2


def test_validation_refreshes_preloaded_exercise_after_archive(client, context, database_url):
    headers, data = context
    plan = save(client, headers, data)
    user_id = UUID(client.get("/api/v1/users/me", headers=headers).json()["id"])
    with Session(database_url) as db:
        loaded = service.get_owned(db, user_id, UUID(plan["id"]))
        assert loaded.exercises[0].exercise.archived_at is None
        with Session(database_url) as other, other.begin():
            other.get(Exercise, UUID(data["exercises"][0]["exercise_id"])).archived_at = utcnow()
        with pytest.raises(DomainError) as error:
            service.validate_exercises(db, user_id, TemplateInput(**data))
        assert error.value.code == "exercise_archived"
