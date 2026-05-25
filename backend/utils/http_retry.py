"""Small helper for retried HTTP GET requests."""

from __future__ import annotations

import time
from typing import Any

import requests


def get_json_with_retry(
    url: str,
    *,
    timeout: float = 8,
    retries: int = 3,
    backoff_s: float = 0.5,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            resp = requests.get(url, timeout=timeout, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(backoff_s * (attempt + 1))
    raise last_err or RuntimeError("request failed")
