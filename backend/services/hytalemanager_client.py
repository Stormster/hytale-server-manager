"""HTTP client for hytalemanager.com API."""

from __future__ import annotations

import os

import requests
from fastapi import HTTPException

SITE_BASE_URL = os.environ.get("HYTALE_MANAGER_SITE_BASE_URL", "https://hytalemanager.com").rstrip("/")
REQUEST_TIMEOUT = 20


def site_error_to_http(res: requests.Response) -> HTTPException:
    try:
        data = res.json()
    except Exception:
        data = {}
    msg = data.get("error") or data.get("detail") or f"Site request failed (HTTP {res.status_code})"
    code = res.status_code if res.status_code in (400, 401, 429) else 502
    return HTTPException(code, msg)


def request_site_json(
    path: str,
    *,
    params: dict | None = None,
    headers: dict | None = None,
    timeout: int = REQUEST_TIMEOUT,
) -> dict:
    url = f"{SITE_BASE_URL}{path}"
    try:
        res = requests.get(url, params=params, headers=headers or {}, timeout=timeout)
    except Exception as e:
        raise HTTPException(502, f"Failed to contact update service: {e}") from e
    if not res.ok:
        raise site_error_to_http(res)
    try:
        return res.json()
    except Exception as e:
        raise HTTPException(502, f"Update service returned invalid JSON: {e}") from e
