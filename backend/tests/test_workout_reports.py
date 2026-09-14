from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from sqlalchemy.orm import Session
from test_exercises import login
from test_workouts import ROOT, begin, payload, put
from test_workouts import context as context

from app.core.errors import DomainError
from app.core.security import utcnow
from app.modules.users.models import User
from app.modules.workouts import reports, service
from app.modules.workouts.models import Workout, WorkoutExercise, WorkoutSet
from app.modules.workouts.schemas import WorkoutSync


def finish_body(workout):
    now = utcnow().isoformat()
    body = payload(workout, status="completed", finished_at=now, rest_deadline=None)
    body["exercises"][0]["sets"][0]["completed_at"] = now
    return body


def historical(
    db,
    user_id,
    exercise_id,
    start,
    *,
    weight="20",
    reps=8,
    convention="total",
    load="external",
    status="completed",
    sets=None,
):
    row = Workout(
        id=uuid4(),
        user_id=user_id,
        create_hash="a" * 64,
        name_snapshot="Historical press",
        status=status,
        started_at=start,
        finished_at=start + timedelta(minutes=10) if status in ("completed", "cancelled") else None,
        paused_seconds=60,
        version=2,
    )
    block = WorkoutExercise(
        id=uuid4(),
        exercise_id=exercise_id,
        position=0,
        name_snapshot="Press snapshot",
        load_type_snapshot=load,
        load_convention_snapshot=convention,
        rest_seconds=90,
    )
    block.sets = [
        WorkoutSet(
            id=uuid4(),
            position=i,
            set_type=item.get("type", "working"),
            weight_kg=Decimal(item.get("weight", weight)),
            reps=item.get("reps", reps),
            completed_at=start + timedelta(minutes=1) if item.get("done", True) else None,
        )
        for i, item in enumerate(sets or [{}])
    ]
    row.exercises = [block]
    db.add(row)
    db.flush()
    return row.id


@pytest.fixture
def report_context(client, context):
    headers, data = context
    workout = begin(client, headers, data)
    user_id = UUID(client.get("/api/v1/users/me", headers=headers).json()["id"])
    return headers, workout, user_id, UUID(workout["exercises"][0]["exercise_id"])


def test_finish_replay_summary_and_privacy(client, report_context):
    headers, workout, _, _ = report_context
    assert client.get(f"{ROOT}/{workout['id']}/summary", headers=headers).status_code == 409
    body = finish_body(workout)
    finished = put(client, headers, workout, body)
    assert finished["workout"]["status"] == "completed"
    assert put(client, headers, workout, body) == finished
    assert client.get(f"{ROOT}/active", headers=headers).json() is None
    assert (
        client.put(
            f"{ROOT}/{workout['id']}", headers=headers, json=payload(finished["workout"])
        ).status_code
        == 409
    )
    result = client.get(f"{ROOT}/{workout['id']}/summary", headers=headers)
    assert result.status_code == 200, result.text
    assert result.headers["cache-control"] == "no-store"
    summary = result.json()["summary"]
    assert summary["completed_sets"] == 1
    assert summary["exercise_count"] == 1
    assert Decimal(summary["volume_kg"]) == Decimal("161")
    assert len(result.json()["records"]) == 2
    assert all(r["previous_value"] is None for r in result.json()["records"])
    other = login(client)
    assert client.get(f"{ROOT}/{workout['id']}/summary", headers=other).status_code == 404
    assert client.get(f"{ROOT}/history", headers=other).json()["items"] == []
    assert client.get(f"{ROOT}/dashboard", headers=other).json()["completed_workouts"] == 0
    for url in ("history", "dashboard", f"{workout['id']}/summary"):
        assert client.get(f"{ROOT}/{url}").status_code == 401


def test_finish_requires_completed_sets_and_valid_times(client, report_context):
    headers, workout, _, _ = report_context
    empty = payload(workout, status="completed", finished_at=utcnow().isoformat())
    assert client.put(f"{ROOT}/{workout['id']}", headers=headers, json=empty).status_code == 422
    body = finish_body(workout)
    body["exercises"][0]["sets"][0]["completed_at"] = (utcnow() + timedelta(seconds=30)).isoformat()
    assert client.put(f"{ROOT}/{workout['id']}", headers=headers, json=body).status_code == 422
    body = finish_body(workout)
    body["rest_deadline"] = utcnow().isoformat()
    assert client.put(f"{ROOT}/{workout['id']}", headers=headers, json=body).status_code == 422
    assert client.get(f"{ROOT}/{workout['id']}", headers=headers).json()["version"] == 1


@pytest.mark.parametrize("same_key", [True, False])
def test_concurrent_finish_is_counted_once(client, report_context, database_url, same_key):
    headers, workout, user_id, _ = report_context
    body = finish_body(workout)
    barrier = Barrier(2)

    def finish(index):
        value = dict(body)
        if index and not same_key:
            value["mutation_id"] = str(uuid4())
        with Session(database_url) as db:
            barrier.wait(timeout=10)
            try:
                return service.sync(
                    db, user_id, UUID(workout["id"]), WorkoutSync(**value)
                ).applied_version
            except DomainError as exc:
                return exc.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(finish, range(2))) == ([2, 2] if same_key else [2, 409])
    assert len(client.get(f"{ROOT}/history", headers=headers).json()["items"]) == 1
    dashboard = client.get(f"{ROOT}/dashboard", headers=headers)
    assert dashboard.status_code == 200, dashboard.text
    assert dashboard.json()["completed_workouts"] == 1


def test_summary_volume_sets_and_snapshots(client, report_context, database_url):
    headers, _, user_id, exercise_id = report_context
    start = datetime(2026, 3, 25, 12, tzinfo=UTC)
    with Session(database_url) as db, db.begin():
        row_id = historical(
            db,
            user_id,
            exercise_id,
            start,
            convention="per_hand",
            sets=[
                {"weight": "20.125", "reps": 8},
                {"type": "warmup", "weight": "10"},
                {"done": False},
            ],
        )
    result = client.get(f"{ROOT}/{row_id}/summary", headers=headers).json()
    assert result["summary"]["active_seconds"] == 540
    assert result["summary"]["completed_sets"] == 2
    assert result["summary"]["skipped_sets"] == 1
    assert Decimal(result["summary"]["volume_kg"]) == Decimal("161")
    assert result["workout"]["exercises"][0]["name_snapshot"] == "Press snapshot"
    assert all(r["load_convention"] == "per_hand" for r in result["records"])
    for load, convention in (("bodyweight", "added"), ("assisted", "assistance")):
        with Session(database_url) as db, db.begin():
            row_id = historical(db, user_id, exercise_id, start, load=load, convention=convention)
        result = client.get(f"{ROOT}/{row_id}/summary", headers=headers).json()
        assert Decimal(result["summary"]["volume_kg"]) == 0
        assert result["records"] == []


def test_records_compare_only_earlier_eligible_sets(client, report_context, database_url):
    headers, _, user_id, exercise_id = report_context
    start = datetime(2026, 3, 20, 12, tzinfo=UTC)
    other_id = UUID(client.get("/api/v1/users/me", headers=login(client)).json()["id"])
    with Session(database_url) as db, db.begin():
        historical(db, user_id, exercise_id, start, reps=8)
        historical(db, other_id, exercise_id, start, weight="200")
        historical(db, user_id, exercise_id, start, weight="200", status="cancelled")
        historical(db, user_id, exercise_id, start, weight="200", convention="per_hand")
        historical(
            db,
            user_id,
            exercise_id,
            start,
            sets=[{"weight": "200", "type": "warmup"}, {"weight": "200", "done": False}],
        )
        improved = historical(db, user_id, exercise_id, start + timedelta(days=1), reps=9)
        tied = historical(db, user_id, exercise_id, start + timedelta(days=2), reps=9)
        historical(db, user_id, exercise_id, start + timedelta(days=3), weight="200")
    records = client.get(f"{ROOT}/{improved}/summary", headers=headers).json()["records"]
    assert len(records) == 2
    reps = next(r for r in records if r["kind"] == "reps")
    assert Decimal(reps["previous_value"]) == 8 and Decimal(reps["value"]) == 9
    estimate = next(r for r in records if r["kind"] == "estimated_1rm")
    assert Decimal(estimate["previous_value"]) == Decimal("25.33")
    assert Decimal(estimate["value"]) == 26
    assert client.get(f"{ROOT}/{tied}/summary", headers=headers).json()["records"] == []


def test_history_pagination_dates_and_week_in_profile_timezone(
    client, report_context, database_url, monkeypatch
):
    headers, _, user_id, exercise_id = report_context
    monkeypatch.setattr(reports, "utcnow", lambda: datetime(2026, 3, 29, 22, tzinfo=UTC))
    with Session(database_url) as db, db.begin():
        user = db.get(User, user_id)
        user.timezone = "Europe/Lisbon"
        user.weekly_workout_target = 2
        historical(db, user_id, exercise_id, datetime(2026, 3, 22, 23, 59, tzinfo=UTC))
        a = historical(db, user_id, exercise_id, datetime(2026, 3, 23, 0, tzinfo=UTC))
        b = historical(db, user_id, exercise_id, datetime(2026, 3, 29, 22, 59, tzinfo=UTC))
        c = historical(db, user_id, exercise_id, datetime(2026, 3, 29, 22, 59, tzinfo=UTC))
        historical(db, user_id, exercise_id, datetime(2026, 3, 29, 23, tzinfo=UTC))
    dashboard = client.get(f"{ROOT}/dashboard", headers=headers)
    assert dashboard.status_code == 200, dashboard.text
    data = dashboard.json()
    assert data["week_start"] == "2026-03-23"
    assert data["completed_workouts"] == 3 and data["weekly_target"] == 2
    assert data["active_seconds"] == 1620 and data["completed_sets"] == 3
    assert Decimal(data["volume_kg"]) == 480
    assert [d["workouts"] for d in data["days"]] == [1, 0, 0, 0, 0, 0, 2]
    params = {"date_from": "2026-03-23", "date_to": "2026-03-29", "limit": 1}
    found = []
    while True:
        page = client.get(f"{ROOT}/history", headers=headers, params=params).json()
        found += [item["id"] for item in page["items"]]
        if not page["next_cursor"]:
            break
        params["cursor"] = page["next_cursor"]
    assert len(found) == 3 and set(found) == {str(a), str(b), str(c)}


@pytest.mark.parametrize(
    "params",
    [
        {"cursor": "bad"},
        {"limit": 0},
        {"limit": 51},
        {"date_from": "2026-02-30"},
        {"date_from": "2026-04-01", "date_to": "2026-03-01"},
        {"date_from": "0001-01-01"},
        {"date_to": "9999-12-31"},
    ],
)
def test_invalid_history_filters(client, context, params):
    assert client.get(f"{ROOT}/history", headers=context[0], params=params).status_code == 422


def test_estimated_max_range_and_rounding():
    assert reports.estimated_max(Decimal("20.125"), 1) == Decimal("20.13")
    assert reports.estimated_max(Decimal("20.125"), 10) == Decimal("26.83")
    assert reports.estimated_max(Decimal("20"), 11) is None
