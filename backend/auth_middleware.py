"""
Optional request authentication for the backend API.
When HYTALE_BACKEND_TOKEN is set (by Tauri), require X-Backend-Token header or ?token= for GET.
When not set (dev / standalone), allow all requests.
"""

import os
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_EXPECTED_TOKEN: str | None = None


def get_expected_token() -> str | None:
    """Token that must be sent by the frontend. None = auth disabled (dev)."""
    global _EXPECTED_TOKEN
    if _EXPECTED_TOKEN is None:
        _EXPECTED_TOKEN = (os.environ.get("HYTALE_BACKEND_TOKEN") or "").strip() or None
    return _EXPECTED_TOKEN


def set_expected_token(token: str | None) -> None:
    """Set token (e.g. from CLI --auth-token). Used by main()."""
    global _EXPECTED_TOKEN
    _EXPECTED_TOKEN = token


class BackendAuthMiddleware(BaseHTTPMiddleware):
    """Require X-Backend-Token header (or ?token= for GET) when token is configured."""

    async def dispatch(self, request: Request, call_next):
        expected = get_expected_token()
        if not expected:
            return await call_next(request)

        # Allow health check without auth
        if request.url.path == "/api/health":
            return await call_next(request)

        token = request.headers.get("X-Backend-Token")
        if not token and request.method == "GET":
            token = request.query_params.get("token")
        if token != expected:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid backend token"},
            )
        return await call_next(request)
