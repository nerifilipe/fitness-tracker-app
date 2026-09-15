from datetime import datetime
from io import BytesIO
from unittest.mock import patch
from urllib.error import URLError
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.orm import Session

from app.core.errors import DomainError
from app.modules.nutrition.models import Food
from app.modules.nutrition.provider import FoodProvider, normalize

BASE = "/api/v1/nutrition"


def login(client):
    result = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Nutrition tester",
            "email": f"{uuid4().hex}@example.com",
            "password": "test password long enough",
        },
    )
    assert result.status_code == 201
    return {"Authorization": f"Bearer {result.json()['access_token']}"}


def product(**changes):
    return {
        "code": "5601234567890",
        "product_name": "Iogurte natural",
        "brands": "Test",
        "serving_size": "1 embalagem (125 g)",
        "serving_quantity": 125,
        "nutriments": {
            "energy-kcal_100g": 63,
            "proteins_100g": 4.2,
            "carbohydrates_100g": 5,
            "fat_100g": 3,
        },
        **changes,
    }


def custom(client, headers, **changes):
    response = client.post(
        f"{BASE}/foods",
        headers=headers,
        json={
            "name": "Test food",
            "unit": "g",
            "calories": 123.45,
            "protein": 10,
            "carbs": 20,
            "fat": 2,
            **changes,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def save(client, headers, food, **changes):
    entry_id = changes.pop("id", str(uuid4()))
    body = {
        "food_id": food["id"],
        "date": "2026-09-15",
        "meal": "breakfast",
        "quantity": 125,
        **changes,
    }
    response = client.put(f"{BASE}/entries/{entry_id}", headers=headers, json=body)
    assert response.status_code == 200, response.text
    return response.json(), body


def test_search_import_portion_favorite_and_replay(client):
    headers = login(client)
    provider = client.app.state.food_provider
    with patch.object(
        provider, "fetch", return_value={"products": [product(), product()]}
    ) as fetch:
        page = client.get(f"{BASE}/search", headers=headers, params={"q": "iogurte"}).json()
        assert len(page["items"]) == 1
        assert page["items"][0]["serving_quantity"] == 125
        response = client.get(f"{BASE}/search", headers=headers, params={"q": "iogurte"})
        assert response.json() == page
        code = page["items"][0]["source_code"]
        food = client.post(f"{BASE}/foods/import", headers=headers, json={"code": code}).json()
        assert fetch.call_count == 1  # imports use the server's cached product, not client macros
        again = client.post(f"{BASE}/foods/import", headers=headers, json={"code": code}).json()
        assert again["id"] == food["id"]
    favorite = client.put(
        f"{BASE}/foods/{food['id']}/favorite", headers=headers, json={"is_favorite": True}
    )
    assert favorite.json()["is_favorite"]
    entry, body = save(client, headers, food)
    assert entry["totals"] == {"calories": 78.75, "protein": 5.25, "carbs": 6.25, "fat": 3.75}
    assert (
        client.put(f"{BASE}/entries/{entry['id']}", headers=headers, json=body).status_code == 200
    )
    diary = client.get(f"{BASE}/diary?day=2026-09-15", headers=headers)
    assert diary.headers["cache-control"] == "no-store"
    assert len(diary.json()["entries"]) == 1
    assert (
        client.get(f"{BASE}/foods?favorites=true", headers=headers).json()[0]["last_quantity"]
        == 125
    )


def test_totals_edit_snapshots_delete_and_copy_retry(client, database_url):
    headers = login(client)
    food = custom(client, headers)
    entry, body = save(client, headers, food)
    # Existing history is a snapshot, even if catalogue values later change.
    with Session(database_url) as db:
        from uuid import UUID

        row = db.get(Food, UUID(food["id"]))
        row.snapshot = {**row.snapshot, "calories": 999}
        db.commit()
    body["quantity"] = 50.125
    response = client.put(f"{BASE}/entries/{entry['id']}", headers=headers, json=body)
    assert response.json()["totals"]["calories"] == 61.88
    copy_id = str(uuid4())
    copy = {
        "source_date": "2026-09-15",
        "source_meal": "breakfast",
        "target_date": "2026-09-16",
        "target_meal": "lunch",
    }
    first = client.put(f"{BASE}/meal-copies/{copy_id}", headers=headers, json=copy)
    assert first.status_code == 200, first.text
    assert first.json()["totals"]["calories"] == 61.88
    assert client.delete(f"{BASE}/entries/{entry['id']}", headers=headers).status_code == 204
    # Replay works even after deleting the source meal.
    repeated = client.put(f"{BASE}/meal-copies/{copy_id}", headers=headers, json=copy)
    assert len(repeated.json()["entries"]) == 1
    assert (
        client.put(
            f"{BASE}/meal-copies/{copy_id}", headers=headers, json={**copy, "target_meal": "dinner"}
        ).status_code
        == 409
    )
    assert (
        client.put(f"{BASE}/entries/{entry['id']}", headers=headers, json=body).status_code == 409
    )
    assert client.delete(f"{BASE}/entries/{entry['id']}", headers=headers).status_code == 204
    assert (
        client.get(f"{BASE}/diary?day=2026-09-15", headers=headers).json()["totals"]["calories"]
        == 0
    )


def test_account_isolation_goals_and_timezone(client):
    a, b = login(client), login(client)
    food = custom(client, a)
    entry, body = save(client, a, food)
    assert client.get(f"{BASE}/foods", headers=b).json() == []
    assert (
        client.put(
            f"{BASE}/foods/{food['id']}/favorite", headers=b, json={"is_favorite": True}
        ).status_code
        == 404
    )
    assert client.put(f"{BASE}/entries/{entry['id']}", headers=b, json=body).status_code == 404
    assert client.put(f"{BASE}/entries/{uuid4()}", headers=b, json=body).status_code == 404
    assert client.delete(f"{BASE}/entries/{entry['id']}", headers=b).status_code == 404
    targets = {"calories": 2400, "protein": 140, "carbs": None, "fat": 70}
    assert client.put(f"{BASE}/goals", headers=a, json=targets).json() == targets
    assert client.get(f"{BASE}/diary", headers=b).json()["goals"]["calories"] is None
    today = client.get(f"{BASE}/diary", headers=a).json()
    assert today["date"] == datetime.now(ZoneInfo(today["timezone"])).date().isoformat()
    assert today["goals"] == targets
    assert client.get(f"{BASE}/diary").status_code == 401


@pytest.mark.parametrize("quantity", [0, -1, 10001, "NaN", "Infinity", 0.00001])
def test_reject_invalid_quantities(client, quantity):
    headers = login(client)
    food = custom(client, headers)
    response = client.put(
        f"{BASE}/entries/{uuid4()}",
        headers=headers,
        json={
            "food_id": food["id"],
            "date": "2026-09-15",
            "meal": "lunch",
            "quantity": quantity,
        },
    )
    assert response.status_code == 422


def test_provider_missing_zero_and_units():
    complete = product()
    assert normalize(complete).serving_quantity == 125
    del complete["nutriments"]["proteins_100g"]
    assert normalize(complete) is None
    complete["nutriments"]["proteins_100g"] = 0
    assert normalize(complete).protein == 0
    complete["nutriments"]["fat_100g"] = float("nan")
    assert normalize(complete) is None
    liquid = normalize(product(product_quantity_unit="ml", serving_size="1 copo (200 ml)"))
    assert liquid.unit == "ml" and liquid.serving_quantity == 200
    assert normalize(product(serving_size="1 cup", serving_quantity=1)).serving_quantity is None
    assert normalize(product(product_quantity_unit="l", serving_size="200 ml")).unit == "ml"
    energy_kj = product()
    energy_kj["nutriments"].pop("energy-kcal_100g")
    energy_kj["nutriments"].update({"energy_100g": 418.4, "energy_unit": "kJ"})
    assert normalize(energy_kj).calories == pytest.approx(100)


def test_provider_timeout_limits_and_no_private_headers():
    provider = FoodProvider("FitnessTracker/Test")
    with patch("app.modules.nutrition.provider.urlopen", side_effect=URLError("offline")) as call:
        with pytest.raises(DomainError) as error:
            provider.product("5601234567890")
        assert error.value.status == 503
        request = call.call_args.args[0]
        assert request.get_header("Authorization") is None
        assert request.get_header("User-agent") == "FitnessTracker/Test"
    with patch(
        "app.modules.nutrition.provider.urlopen",
        side_effect=lambda *a, **k: BytesIO(b'{"products": []}'),
    ):
        for i in range(10):
            provider.search(f"search {i}", 1)
        with pytest.raises(DomainError) as error:
            provider.search("one too many", 1)
        assert error.value.status == 429


def test_search_failure_keeps_recent_foods_available(client):
    headers = login(client)
    custom(client, headers)
    with patch.object(
        client.app.state.food_provider,
        "fetch",
        side_effect=DomainError("unavailable", "Tenta mais tarde.", 503),
    ):
        assert client.get(f"{BASE}/search?q=arroz", headers=headers).status_code == 503
    assert len(client.get(f"{BASE}/foods", headers=headers).json()) == 1
    assert client.get(f"{BASE}/search?q=x", headers=headers).status_code == 422
    assert client.get(f"{BASE}/search?q=%20%20", headers=headers).status_code == 422
