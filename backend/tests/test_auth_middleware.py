import pytest
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from auth_middleware import BackendAuthMiddleware, set_expected_token


async def ok(_request):
    return JSONResponse({"ok": True})


@pytest.fixture
def client():
    set_expected_token("test-token")
    app = Starlette(
        routes=[Route("/api/health", ok), Route("/api/settings", ok)],
    )
    app.add_middleware(BackendAuthMiddleware)
    yield TestClient(app)
    set_expected_token(None)


def test_health_without_token(client):
    r = client.get("/api/health")
    assert r.status_code == 200


def test_protected_without_token_returns_401(client):
    r = client.get("/api/settings")
    assert r.status_code == 401


def test_protected_with_valid_header(client):
    r = client.get("/api/settings", headers={"X-Backend-Token": "test-token"})
    assert r.status_code == 200
