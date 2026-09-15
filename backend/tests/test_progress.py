from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.modules.progress import service
from app.modules.progress.service import today as local_today
from app.modules.users.models import User

BASE = "/api/v1/progress"
TODAY = date(2026, 9, 15)


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(service, "today", lambda user: TODAY)


def login(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Progress tester",
            "email": f"{uuid4().hex}@example.com",
            "password": "test password long enough",
        },
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def save(client, headers, day=TODAY, **body):
    response = client.put(f"{BASE}/measurements/{day}", headers=headers, json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_upsert_precision_edit_and_repeated_delete(client):
    headers = login(client)
    assert client.get(f"{BASE}/measurements/{TODAY}", headers=headers).json() is None
    body = dict(weight_kg=72.3456, waist_cm=81.25, notes="  morning  ")
    first = save(client, headers, **body)
    assert first["weight_kg"] == 72.346 and first["notes"] == "morning"
    save(client, headers, **body)
    page = client.get(f"{BASE}/measurements", headers=headers).json()
    assert len(page["items"]) == 1
    updated = save(client, headers, weight_kg=73, waist_cm=81.25)
    assert updated["created_at"] == first["created_at"]
    assert updated["weight_kg"] == 73 and updated["waist_cm"] == 81.25
    for _ in range(2):
        assert client.delete(f"{BASE}/measurements/{TODAY}", headers=headers).status_code == 204
    assert client.get(f"{BASE}/summary", headers=headers).json()["points"] == []


def test_summary_independent_metrics_period_edges_and_deletion(client):
    headers = login(client)
    save(client, headers, TODAY - timedelta(days=100), waist_cm=82, weight_kg=75)
    save(client, headers, TODAY - timedelta(days=30), weight_kg=74)
    save(client, headers, TODAY - timedelta(days=29), weight_kg=73)
    save(client, headers, TODAY - timedelta(days=1), chest_cm=100)  # no weight is not zero
    save(client, headers, weight_kg=72.25)
    response = client.get(f"{BASE}/summary?days=30", headers=headers)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    summary = response.json()
    assert len(summary["points"]) == 3
    assert summary["metrics"]["weight_kg"] == {
        "latest": {"date": str(TODAY), "value": 72.25},
        "change": -0.75,
        "count": 2,
    }
    assert summary["metrics"]["waist_cm"]["latest"]["value"] == 82
    assert summary["metrics"]["waist_cm"]["count"] == 0
    assert summary["metrics"]["waist_cm"]["change"] is None
    assert summary["metrics"]["chest_cm"]["change"] is None
    assert summary["metrics"]["arms_cm"]["latest"] is None
    assert (
        client.get(f"{BASE}/summary?days=365", headers=headers).json()["metrics"]["weight_kg"][
            "change"
        ]
        == -2.75
    )
    client.delete(f"{BASE}/measurements/{TODAY}", headers=headers)
    assert (
        client.get(f"{BASE}/summary?days=30", headers=headers).json()["metrics"]["weight_kg"][
            "latest"
        ]["value"]
        == 73
    )


def test_history_pagination_and_private_accounts(client):
    a, b = login(client), login(client)
    for i in range(5):
        save(client, a, TODAY - timedelta(days=i), weight_kg=70 + i)
    seen, before = [], None
    while True:
        page = client.get(
            f"{BASE}/measurements",
            headers=a,
            params={"limit": 2, **({"before": before} if before else {})},
        ).json()
        seen.extend(row["date"] for row in page["items"])
        before = page["next_before"]
        if not before:
            break
    assert len(seen) == len(set(seen)) == 5 and seen == sorted(seen, reverse=True)
    assert client.get(f"{BASE}/measurements", headers=b).json()["items"] == []
    assert client.get(f"{BASE}/measurements/{TODAY}", headers=b).json() is None
    save(client, b, weight_kg=90)
    client.delete(f"{BASE}/measurements/{TODAY}", headers=b)
    assert client.get(f"{BASE}/measurements/{TODAY}", headers=a).json()["weight_kg"] == 70
    assert client.get(f"{BASE}/summary").status_code == 401


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"notes": "notes only"},
        {"weight_kg": 0},
        {"weight_kg": 501},
        {"weight_kg": "NaN"},
        {"waist_cm": -1},
        {"arms_cm": 201},
        {"weight_kg": 72, "user_id": str(uuid4())},
    ],
)
def test_invalid_measurements(client, body):
    headers = login(client)
    assert client.put(f"{BASE}/measurements/{TODAY}", headers=headers, json=body).status_code == 422


def test_date_validation_and_metric_only_entry(client):
    headers = login(client)
    for day in [TODAY + timedelta(days=1), "1899-12-31", "2026-02-30"]:
        assert (
            client.put(
                f"{BASE}/measurements/{day}", headers=headers, json={"weight_kg": 70}
            ).status_code
            == 422
        )
    assert client.get(f"{BASE}/summary?days=366", headers=headers).status_code == 422
    record = save(client, headers, arms_cm=35)
    assert record["weight_kg"] is None


def test_local_day_uses_profile_timezone():
    fixed = datetime(2026, 9, 15, 0, 30, tzinfo=UTC)
    with patch.object(service, "datetime") as clock:
        clock.now.side_effect = lambda tz: fixed.astimezone(tz)
        assert local_today(User(timezone="Pacific/Honolulu")) == date(2026, 9, 14)
        assert local_today(User(timezone="Europe/Lisbon")) == date(2026, 9, 15)
