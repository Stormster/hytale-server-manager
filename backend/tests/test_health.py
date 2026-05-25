from fastapi import FastAPI
from fastapi.testclient import TestClient

from auth_middleware import BackendAuthMiddleware, set_expected_token


def test_health_endpoint_allows_unauthenticated_access():
    app = FastAPI()

    @app.get("/api/health")
    def health():
        return {"ok": True}

    app.add_middleware(BackendAuthMiddleware)
    set_expected_token("secret-token")
    client = TestClient(app)
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    set_expected_token(None)
