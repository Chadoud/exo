"""Simple in-memory sliding window rate limiter (per process)."""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque

_lock = threading.Lock()
_windows: dict[str, Deque[float]] = {}


def reset() -> None:
    """Drop all windows (tests only)."""
    with _lock:
        _windows.clear()


def allow(key: str, max_events: int, window_seconds: float) -> bool:
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        dq = _windows.setdefault(key, deque())
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= max_events:
            return False
        dq.append(now)
        return True
