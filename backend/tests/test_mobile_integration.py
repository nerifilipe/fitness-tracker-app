"""Run the shipped mobile controllers against HTTP/Postgres and a reopened SQLite file."""

import os
import shutil
import socket
import subprocess
import threading
import time
from pathlib import Path

import uvicorn
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.session import get_session
from app.main import create_app
from app.modules.exercises.seed import seed_catalogue


def test_mobile_journey_over_http(database_url):
    mobile = Path(__file__).resolve().parents[2] / "mobile"
    vitest = mobile / "node_modules/vitest/vitest.mjs"
    node = shutil.which("node")
    assert node and vitest.is_file(), "Run npm ci in mobile before the integration test."
    with Session(database_url) as db, db.begin():
        seed_catalogue(db)
    app = create_app(Settings(auth_rate_limit=1000))

    def session():
        with Session(database_url) as db:
            yield db

    app.dependency_overrides[get_session] = session
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level="error", access_log=False))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 10
        while not server.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert server.started, "Isolated HTTP server did not start."
        result = subprocess.run(
            [node, str(vitest), "run", "tests/integration/journey.test.ts"],
            cwd=mobile,
            env={
                **os.environ,
                "FITNESS_INTEGRATION": "1",
                "EXPO_PUBLIC_API_URL": f"http://127.0.0.1:{port}/api/v1",
            },
            capture_output=True,
            text=True,
            timeout=90,
            encoding="utf-8",
            errors="replace",
        )
        assert result.returncode == 0, result.stdout + result.stderr
    finally:
        server.should_exit = True
        thread.join(timeout=10)
        listener.close()
        assert not thread.is_alive(), "Isolated HTTP server did not stop."
