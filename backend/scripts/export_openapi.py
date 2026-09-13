"""Export the API contract without connecting to the database or requiring local secrets."""

import json
import os
from pathlib import Path

os.environ.setdefault("JWT_SECRET", "openapi-generation-only-not-for-server-use")

from app.main import create_app  # noqa: E402

destination = Path(__file__).resolve().parents[2] / "docs" / "openapi.json"
destination.write_text(json.dumps(create_app().openapi(), indent=2) + "\n", encoding="utf-8")
print("Exported docs/openapi.json")
