"""Read-only Open Food Facts adapter. No account data is sent to the provider."""

import json
import re
from collections import OrderedDict, deque
from math import isfinite
from threading import Lock
from time import monotonic
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from pydantic import ValidationError

from app.core.errors import DomainError
from app.modules.nutrition.schemas import FoodSearch, FoodSnapshot

FIELDS = (
    "code,product_name,product_name_pt,brands,nutriments,serving_size,serving_quantity,"
    "serving_quantity_unit,product_quantity_unit,nutrition_data_per"
)


def normalize(product: dict) -> FoodSnapshot | None:
    """Skip incomplete products instead of treating missing macros as zero."""
    try:
        nutrients = product["nutriments"]
        code = str(product["code"])
        if not re.fullmatch(r"\d{8,14}", code):
            return None
        energy = nutrients.get("energy-kcal_100g")
        if energy is None and nutrients.get("energy-kj_100g") is not None:
            energy = float(nutrients["energy-kj_100g"]) / 4.184
        if energy is None and str(nutrients.get("energy_unit", "")).lower() == "kj":
            energy = float(nutrients["energy_100g"]) / 4.184
        values = dict(
            calories=float(energy),
            protein=float(nutrients["proteins_100g"]),
            carbs=float(nutrients["carbohydrates_100g"]),
            fat=float(nutrients["fat_100g"]),
        )
        if not all(isfinite(value) for value in values.values()):
            return None
        serving_label = str(product.get("serving_size") or "")[:120] or None
        basis = str(product.get("nutrition_data_per", "")).lower()
        quantity_unit = str(product.get("product_quantity_unit", "")).lower()
        serving_unit = str(product.get("serving_quantity_unit", "")).lower()
        # OFF's *_100g keys also represent per 100 ml for liquids.
        unit = (
            "ml"
            if basis.replace(" ", "") == "100ml" or quantity_unit in {"ml", "l", "cl", "dl"}
            else "g"
        )
        if not quantity_unit and serving_unit == "ml":
            unit = "ml"
        if not quantity_unit and serving_label and re.search(r"\bml\b", serving_label, re.I):
            unit = "ml"
        serving = None
        match = re.search(r"(\d+(?:[.,]\d+)?)\s*(g|ml)\b", serving_label or "", re.I)
        if match and match.group(2).lower() == unit:
            serving = float(match.group(1).replace(",", "."))
        elif serving_unit == unit and product.get("serving_quantity"):
            serving = float(product["serving_quantity"])
        if serving is not None and (not isfinite(serving) or not 0 < serving <= 10000):
            serving = None
        return FoodSnapshot(
            name=product.get("product_name_pt") or product.get("product_name") or "",
            brand=str(product.get("brands") or "")[:120],
            unit=unit,
            source="openfoodfacts",
            source_code=code,
            serving_quantity=serving,
            serving_label=serving_label if serving else None,
            **values,
        )
    except (KeyError, TypeError, ValueError, ValidationError):
        return None


class FoodProvider:
    def __init__(self, user_agent: str):
        self.user_agent = user_agent
        self.lock = Lock()
        self.cache: OrderedDict[str, tuple[float, object]] = OrderedDict()
        self.calls: dict[str, deque[float]] = {"search": deque(), "product": deque()}

    def cached(self, key: str):
        with self.lock:
            item = self.cache.get(key)
            if item and monotonic() - item[0] < 900:
                return item[1]
            self.cache.pop(key, None)
        return None

    def remember(self, key: str, value: object):
        with self.lock:
            self.cache[key] = (monotonic(), value)
            self.cache.move_to_end(key)
            while len(self.cache) > 256:
                self.cache.popitem(last=False)

    def fetch(self, path: str, params: dict, kind: str) -> dict:
        with self.lock:
            now, calls = monotonic(), self.calls[kind]
            while calls and now - calls[0] >= 60:
                calls.popleft()
            if len(calls) >= (10 if kind == "search" else 15):
                raise DomainError(
                    "food_rate_limit", "Aguarda um minuto ou escolhe um alimento recente.", 429
                )
            calls.append(now)
        request = Request(
            f"https://world.openfoodfacts.org{path}?{urlencode(params)}",
            headers={"User-Agent": self.user_agent, "Accept": "application/json"},
        )
        try:
            with urlopen(request, timeout=7) as response:
                raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise ValueError("Response too large")
            result = json.loads(raw)
            if not isinstance(result, dict):
                raise ValueError("Unexpected response")
            return result
        except HTTPError as error:
            if error.code == 404 and kind == "product":
                return {}
            raise DomainError(
                "food_provider_unavailable",
                "A pesquisa está indisponível. Usa os recentes ou tenta mais tarde.",
                503,
            ) from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise DomainError(
                "food_provider_unavailable",
                "A pesquisa está indisponível. Usa os recentes ou tenta mais tarde.",
                503,
            ) from None

    def search(self, query: str, page: int) -> FoodSearch:
        key = f"search:{query.casefold()}:{page}"
        if (cached := self.cached(key)) is not None:
            return cached
        # /api/v2/search does not support full-text queries; use the documented CGI search.
        data = self.fetch(
            "/cgi/search.pl",
            {
                "search_terms": query,
                "search_simple": 1,
                "action": "process",
                "json": 1,
                "page_size": 20,
                "page": page,
                "lc": "pt",
                "cc": "pt",
                "fields": FIELDS,
            },
            "search",
        )
        raw = data.get("products")
        if not isinstance(raw, list):
            raise DomainError(
                "food_provider_unavailable", "Não foi possível pesquisar alimentos.", 503
            )
        items = {}
        for product in raw:
            food = normalize(product) if isinstance(product, dict) else None
            if food:
                items[food.source_code] = food
                self.remember(f"product:{food.source_code}", food)
        result = FoodSearch(items=list(items.values()), page=page, has_more=len(raw) == 20)
        self.remember(key, result)
        return result

    def product(self, code: str) -> FoodSnapshot:
        if (cached := self.cached(f"product:{code}")) is not None:
            return cached
        data = self.fetch(f"/api/v3/product/{code}", {"fields": FIELDS}, "product")
        product = data.get("product")
        food = normalize({**product, "code": code}) if isinstance(product, dict) else None
        if food is None:
            raise DomainError(
                "food_not_found", "Produto sem dados completos. Experimenta outro resultado.", 404
            )
        self.remember(f"product:{code}", food)
        return food
