from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session
from test_exercises import login
from test_workout_reports import historical
from test_workout_reports import report_context as report_context
from test_workouts import context as context

from app.modules.exercises.models import Exercise
from app.modules.progress import strength
from app.modules.workouts.models import Workout, WorkoutExercise, WorkoutSet
from app.modules.workouts.reports import estimated_max

ROOT = "/api/v1/progress/strength"
NOW = datetime(2026, 9, 15, 12, tzinfo=UTC)


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr(strength, "utcnow", lambda: NOW)


def overview(client, headers, exercise_id, **params):
    result = client.get(f"{ROOT}/{exercise_id}", headers=headers, params=params)
    assert result.status_code == 200, result.text
    return result.json()


def test_strength_records_comparison_and_separate_conventions(client, report_context, database_url):
    headers, _, user_id, exercise_id = report_context
    with Session(database_url) as db, db.begin():
        previous = historical(
            db, user_id, exercise_id, NOW - timedelta(days=2), weight="20.125", reps=10
        )
        latest = historical(
            db,
            user_id,
            exercise_id,
            NOW - timedelta(days=1),
            sets=[
                {"weight": "22", "reps": 8},
                {"weight": "20.125", "reps": 10},
                {"weight": "999", "type": "warmup"},
                {"weight": "998", "done": False},
            ],
        )
        historical(db, user_id, exercise_id, NOW, weight="500", status="cancelled")
        historical(db, user_id, exercise_id, NOW, weight="100", convention="per_hand")
    data = overview(client, headers, exercise_id, load_type="external", load_convention="total")
    assert len(data["groups"]) == 2
    assert data["latest"]["workout_id"] == str(latest)
    assert data["previous"]["workout_id"] == str(previous)
    assert data["latest"]["completed_sets"] == 2
    assert data["latest"]["total_reps"] == 18
    assert data["latest"]["volume_kg"] == 377.25
    assert len(data["latest"]["sets"]) == 2
    assert data["latest"]["estimated_1rm"] == float(estimated_max(Decimal("22"), 8))
    assert data["records"]["heaviest"]["value"] == 22
    assert data["records"]["estimated_1rm"]["value"] == 27.87
    assert data["records"]["reps_at_latest_weight"]["reps"] == 8
    assert len(data["points"]) == 2
    by_hand = overview(client, headers, exercise_id)
    assert by_hand["selected"]["load_convention"] == "per_hand"
    assert by_hand["latest"]["volume_kg"] == 800  # never double per-hand weights


@pytest.mark.parametrize(
    "load,convention", [("bodyweight", "none"), ("bodyweight", "added"), ("assisted", "assistance")]
)
def test_nonexternal_has_reps_history_without_false_1rm(
    client, report_context, database_url, load, convention
):
    headers, _, user_id, exercise_id = report_context
    with Session(database_url) as db, db.begin():
        historical(
            db, user_id, exercise_id, NOW, weight="30", reps=8, load=load, convention=convention
        )
    data = overview(client, headers, exercise_id)
    assert data["chart_metric"] == "reps"
    assert data["points"][0]["value"] == 8
    assert data["latest"]["estimated_1rm"] is None
    assert data["latest"]["volume_kg"] is None
    assert all(value is None for value in data["records"].values())


def test_chart_daily_best_timezone_and_1rm_limits(client, report_context, database_url):
    headers, _, user_id, exercise_id = report_context
    with Session(database_url) as db, db.begin():
        historical(
            db, user_id, exercise_id, datetime(2026, 9, 13, 23, 30, tzinfo=UTC), weight="30", reps=1
        )
        historical(
            db, user_id, exercise_id, datetime(2026, 9, 14, 12, tzinfo=UTC), weight="25", reps=10
        )
        historical(db, user_id, exercise_id, NOW, weight="100", reps=11)
        historical(db, user_id, exercise_id, NOW - timedelta(days=100), weight="200", reps=1)
    data = overview(client, headers, exercise_id, days=30)
    assert data["points"] == [{"date": "2026-09-14", "value": 33.33}]
    assert data["latest"]["estimated_1rm"] is None  # 11 reps are excluded, not zero
    assert data["records"]["estimated_1rm"]["value"] == 200  # records are all-time
    assert data["records"]["estimated_1rm"]["reps"] == 1


def test_pagination_timestamp_ties_and_archived_exercise(client, report_context, database_url):
    headers, _, user_id, exercise_id = report_context
    with Session(database_url) as db, db.begin():
        ids = [historical(db, user_id, exercise_id, NOW, weight="20") for _ in range(3)]
        definition = db.get(Exercise, exercise_id)
        definition.archived_at = NOW
        definition.name = "Renamed press"
    listed = client.get(f"{ROOT}/exercises?q=Renamed", headers=headers)
    assert listed.headers["cache-control"] == "no-store"
    assert listed.json()["items"][0]["sessions"] == 3
    seen, cursor = [], None
    while True:
        params = {"load_type": "external", "load_convention": "total", "limit": 2}
        if cursor:
            params["cursor"] = cursor
        response = client.get(f"{ROOT}/{exercise_id}/sessions", headers=headers, params=params)
        assert response.status_code == 200, response.text
        page = response.json()
        seen.extend(item["workout_id"] for item in page["items"])
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert seen == sorted(map(str, ids), reverse=True)
    assert overview(client, headers, exercise_id)["exercise_name"] == "Renamed press"


def test_privacy_empty_state_and_invalid_filters(client, report_context):
    headers, _, _, exercise_id = report_context
    data = overview(client, headers, exercise_id)
    assert data["latest"] is None and data["points"] == []
    other = login(client)
    assert client.get(f"{ROOT}/exercises", headers=other).json()["items"] == []
    assert client.get(f"{ROOT}/{exercise_id}", headers=other).status_code == 404
    assert client.get(f"{ROOT}/{exercise_id}").status_code == 401
    assert client.get(f"{ROOT}/{exercise_id}?days=366", headers=headers).status_code == 422
    assert (
        client.get(f"{ROOT}/{exercise_id}?load_type=external", headers=headers).status_code == 422
    )
    assert client.get(f"{ROOT}/exercises?cursor=invalid", headers=headers).status_code == 422
    assert (
        client.get(
            f"{ROOT}/{exercise_id}/sessions?load_type=external&load_convention=total&cursor=bad",
            headers=headers,
        ).status_code
        == 422
    )


def test_multiple_blocks_count_one_session_and_equal_records_keep_first(
    client, report_context, database_url
):
    from uuid import uuid4

    headers, _, user_id, exercise_id = report_context
    with Session(database_url) as db, db.begin():
        first = historical(
            db, user_id, exercise_id, NOW - timedelta(days=1), weight="20.125", reps=8
        )
        row_id = historical(db, user_id, exercise_id, NOW, weight="20.125", reps=8)
        row = db.get(Workout, row_id)
        row.exercises.append(
            WorkoutExercise(
                id=uuid4(),
                exercise_id=exercise_id,
                position=1,
                name_snapshot="Press again",
                load_type_snapshot="external",
                load_convention_snapshot="total",
                rest_seconds=90,
                sets=[
                    WorkoutSet(
                        id=uuid4(),
                        position=0,
                        set_type="working",
                        weight_kg=Decimal("10"),
                        reps=5,
                        completed_at=NOW,
                    )
                ],
            )
        )
    data = overview(client, headers, exercise_id)
    assert data["latest"]["completed_sets"] == 2
    assert data["latest"]["total_reps"] == 13
    assert data["records"]["heaviest"]["workout_id"] == str(first)
    assert data["records"]["reps_at_latest_weight"]["weight_kg"] == 20.125
    assert client.get(f"{ROOT}/exercises", headers=headers).json()["items"][0]["sessions"] == 2
