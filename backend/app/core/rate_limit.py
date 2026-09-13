from collections import OrderedDict, deque
from threading import Lock
from time import monotonic

from fastapi import Request

from app.core.errors import DomainError


class AuthLimiter:
    """Single-process local limiter. Use a shared gateway limiter before scaling workers."""

    def __init__(self, limit: int):
        self.limit = limit
        self.buckets: OrderedDict[str, deque[float]] = OrderedDict()
        self.lock = Lock()

    def check(self, key: str) -> None:
        now = monotonic()
        with self.lock:
            bucket = self.buckets.setdefault(key, deque())
            self.buckets.move_to_end(key)
            while bucket and bucket[0] <= now - 60:
                bucket.popleft()
            if len(bucket) >= self.limit:
                raise DomainError("rate_limited", "Demasiadas tentativas. Aguarda um minuto.", 429)
            bucket.append(now)
            if len(self.buckets) > 10000:
                self.buckets.popitem(last=False)


def limit_auth(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    request.app.state.auth_limiter.check(key)
