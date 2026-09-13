"""Create local configuration once, without printing secrets or overwriting settings."""

import secrets
from pathlib import Path

env = Path(__file__).resolve().parents[1] / ".env"
existing = env.read_text(encoding="utf-8") if env.exists() else ""
if not any(line.startswith("JWT_SECRET=") for line in existing.splitlines()):
    with env.open("a", encoding="utf-8") as output:
        output.write(f"\nJWT_SECRET={secrets.token_urlsafe(48)}\n")
    print("Local JWT secret configured. Existing settings preserved.")
else:
    print("Local JWT secret already configured; no changes.")
