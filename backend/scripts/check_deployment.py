"""Read-only smoke check. Does not create accounts or write application data."""

import argparse
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import urlopen


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", required=True, help="API base ending in /api/v1")
    args = parser.parse_args()
    base = args.api_url.rstrip("/")
    parts = urlsplit(base)
    if parts.scheme not in {"https", "http"} or parts.username or parts.password or parts.query:
        parser.error("Use an HTTP(S) URL without credentials or query parameters.")
    if parts.path != "/api/v1":
        parser.error("The API URL must end in /api/v1.")
    for path in ("/health", "/ready", "/workouts/active"):
        try:
            with urlopen(base + path, timeout=90) as response:
                status, data = response.status, json.load(response)
        except HTTPError as error:
            status, data = error.code, None
        except (URLError, TimeoutError, ValueError):
            raise SystemExit(f"FAIL {path}: no valid API response.") from None
        expected = 401 if path == "/workouts/active" else 200
        if status != expected or (expected == 200 and data != {"status": "ok"}):
            raise SystemExit(f"FAIL {path}: HTTP {status}, expected {expected}.")
        print(f"PASS {path}: HTTP {status}")


if __name__ == "__main__":
    main()
