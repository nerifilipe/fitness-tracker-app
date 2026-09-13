from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.exercises.models import Exercise, ExerciseMuscle, UserExercise
from app.modules.exercises.seed import CATALOGUE, seed_catalogue, stable_id


@pytest.fixture(scope="module", autouse=True)
def catalogue(database_url):
    with Session(database_url) as db, db.begin():
        seed_catalogue(db)


def login(client):
    result = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Library tester",
            "email": f"{uuid4().hex}@example.com",
            "password": "test password long enough",
        },
    )
    assert result.status_code == 201
    return {"Authorization": f"Bearer {result.json()['access_token']}"}


def body(**changes):
    return {
        "name": "My Custom Press",
        "equipment": "dumbbell",
        "load_type": "external",
        "load_convention": "per_hand",
        "primary_muscle_id": str(stable_id("muscle", "chest")),
        "secondary_muscle_ids": [str(stable_id("muscle", "triceps"))],
        "instructions": "Personal notes",
        **changes,
    }


def create(client, headers, **changes):
    result = client.post("/api/v1/exercises", headers=headers, json=body(**changes))
    assert result.status_code == 201, result.text
    return result.json()


def test_catalogue_seed_is_repeatable_and_preserves_custom_data(client, database_url):
    headers = login(client)
    custom = create(client, headers)
    with Session(database_url) as db, db.begin():
        assert seed_catalogue(db) == 0
        assert seed_catalogue(db) == 0
        assert db.scalar(
            select(func.count()).select_from(Exercise).where(Exercise.owner_id.is_(None))
        ) == len(CATALOGUE)
    assert client.get(f"/api/v1/exercises/{custom['id']}", headers=headers).status_code == 200


def test_list_filters_pagination_and_no_duplicates(client):
    headers = login(client)
    cursor, seen = None, []
    while True:
        params = {"limit": 5}
        if cursor:
            params["cursor"] = cursor
        result = client.get("/api/v1/exercises", headers=headers, params=params)
        assert result.status_code == 200, result.text
        page = result.json()
        seen.extend(item["id"] for item in page["items"])
        cursor = page["next_cursor"]
        if not cursor:
            break
        assert len(seen) <= len(CATALOGUE)
    assert len(seen) == len(set(seen)) == len(CATALOGUE)
    filtered = client.get(
        "/api/v1/exercises",
        headers=headers,
        params={
            "q": "  DUMBBELL  ",
            "equipment": "dumbbell",
            "muscle_id": str(stable_id("muscle", "chest")),
        },
    ).json()["items"]
    assert [item["name"] for item in filtered] == ["Incline Dumbbell Press"]
    assert (
        client.get(
            "/api/v1/exercises", headers=headers, params={"cursor": "not-a-cursor"}
        ).status_code
        == 422
    )
    assert (
        client.get("/api/v1/exercises", headers=headers, params={"limit": 500}).status_code == 422
    )
    assert client.get("/api/v1/exercises").status_code == 401


def test_custom_exercises_are_private_across_all_routes(client):
    a, b = login(client), login(client)
    custom = create(client, a, name=f"Secret {uuid4().hex}")
    path = f"/api/v1/exercises/{custom['id']}"
    assert (
        client.get("/api/v1/exercises", headers=b, params={"q": custom["name"]}).json()["items"]
        == []
    )
    assert client.get(path, headers=b).status_code == 404
    assert client.put(path, headers=b, json=body()).status_code == 404
    assert client.delete(path, headers=b).status_code == 404
    assert client.put(path + "/favorite", headers=b, json={"is_favorite": True}).status_code == 404
    assert (
        client.post("/api/v1/exercises", headers=b, json=body(owner_id=str(uuid4()))).status_code
        == 422
    )
    assert client.get(path, headers=a).json()["is_custom"] is True
    assert client.get(path, headers=a).headers["cache-control"] == "no-store"


def test_global_catalogue_is_read_only(client):
    headers = login(client)
    path = f"/api/v1/exercises/{stable_id('exercise', 'bench-press')}"
    assert client.get(path, headers=headers).status_code == 200
    assert client.put(path, headers=headers, json=body()).status_code == 403
    assert client.delete(path, headers=headers).status_code == 403


def test_favorites_are_idempotent_and_per_user(client, database_url):
    a, b = login(client), login(client)
    exercise_id = stable_id("exercise", "bench-press")
    path = f"/api/v1/exercises/{exercise_id}/favorite"
    for _ in range(2):
        response = client.put(path, headers=a, json={"is_favorite": True})
        assert response.status_code == 200
        assert response.json()["is_favorite"] is True
    params = {"favorites_only": True}
    assert len(client.get("/api/v1/exercises", headers=a, params=params).json()["items"]) == 1
    assert client.get("/api/v1/exercises", headers=b, params=params).json()["items"] == []
    for _ in range(2):
        assert (
            client.put(path, headers=a, json={"is_favorite": False}).json()["is_favorite"] is False
        )
    with Session(database_url) as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(UserExercise)
                .where(UserExercise.exercise_id == exercise_id)
            )
            == 0
        )


def test_edit_swaps_primary_and_archive_preserves_row(client, database_url):
    headers = login(client)
    custom = create(client, headers)
    path = f"/api/v1/exercises/{custom['id']}"
    updated = client.put(
        path,
        headers=headers,
        json=body(
            primary_muscle_id=str(stable_id("muscle", "triceps")),
            secondary_muscle_ids=[str(stable_id("muscle", "chest"))],
        ),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["primary_muscle"]["slug"] == "triceps"
    client.put(path + "/favorite", headers=headers, json={"is_favorite": True})
    assert client.delete(path, headers=headers).status_code == 204
    assert client.delete(path, headers=headers).status_code == 204
    assert client.get(path, headers=headers).status_code == 404
    assert (
        client.get("/api/v1/exercises", headers=headers, params={"favorites_only": True}).json()[
            "items"
        ]
        == []
    )
    with Session(database_url) as db:
        assert db.get(Exercise, custom["id"]).archived_at is not None
        assert (
            db.scalar(
                select(func.count())
                .select_from(ExerciseMuscle)
                .where(ExerciseMuscle.exercise_id == custom["id"], ExerciseMuscle.role == "primary")
            )
            == 1
        )


@pytest.mark.parametrize(
    "changes",
    [
        {"name": "   "},
        {"primary_muscle_id": str(uuid4())},
        {"secondary_muscle_ids": [str(stable_id("muscle", "chest"))]},
        {"secondary_muscle_ids": [str(stable_id("muscle", "back"))] * 2},
        {"load_type": "assisted", "load_convention": "total"},
        {"equipment": "invalid"},
    ],
)
def test_invalid_custom_data_is_rejected(client, changes):
    headers = login(client)
    result = client.post("/api/v1/exercises", headers=headers, json=body(**changes))
    assert result.status_code == 422
    assert (
        client.get("/api/v1/exercises", headers=headers, params={"custom_only": True}).json()[
            "items"
        ]
        == []
    )


def test_search_treats_wildcards_literally(client):
    headers = login(client)
    custom = create(client, headers, name="100% custom_press")
    result = client.get("/api/v1/exercises", headers=headers, params={"q": "%"}).json()
    assert [row["id"] for row in result["items"]] == [custom["id"]]


def test_unicode_cursor_stays_within_request_limit(client):
    headers = login(client)
    first = create(client, headers, name="🏋" * 119 + "A")
    second = create(client, headers, name="🏋" * 119 + "B")
    result = client.get(
        "/api/v1/exercises", headers=headers, params={"custom_only": True, "limit": 1}
    ).json()
    assert len(result["next_cursor"]) <= 1024
    following = client.get(
        "/api/v1/exercises",
        headers=headers,
        params={"custom_only": True, "limit": 1, "cursor": result["next_cursor"]},
    )
    assert following.status_code == 200
    ids = [result["items"][0]["id"], following.json()["items"][0]["id"]]
    assert set(ids) == {first["id"], second["id"]}
