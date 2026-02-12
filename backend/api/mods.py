"""
Mods API – list and toggle mods. Toggling disabled while server is running.
"""

import os

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services import mods as mods_svc
from services import server as server_svc
from utils.paths import resolve_instance
from config import SERVER_DIR

router = APIRouter()


@router.get("")
def list_mods():
    server_dir = resolve_instance(SERVER_DIR)
    return {"mods": mods_svc.list_mods(server_dir)}


@router.post("/install-required")
def install_required_mods():
    """Download and install Nitrado WebServer + Query plugins. Requires server stopped."""
    if server_svc.is_running():
        return JSONResponse(
            {"ok": False, "error": "Stop the server before installing required mods."},
            status_code=409,
        )
    server_dir = resolve_instance(SERVER_DIR)
    if not os.path.isdir(server_dir):
        return JSONResponse(
            {"ok": False, "error": "Server not installed. Install the server first."},
            status_code=400,
        )
    from services import nitrado_plugins as nitrado
    ok = nitrado.install_nitrado_plugins(server_dir)
    return {"ok": ok}


class ToggleRequest(BaseModel):
    path: str
    enabled: bool


@router.put("/toggle")
def toggle_mod(body: ToggleRequest):
    if server_svc.is_running():
        return JSONResponse(
            {"ok": False, "error": "Stop the server before enabling or disabling mods."},
            status_code=409,
        )
    server_dir = resolve_instance(SERVER_DIR)
    ok, err = mods_svc.toggle_mod(server_dir, body.path, body.enabled)
    if not ok:
        return JSONResponse({"ok": False, "error": err}, status_code=400)
    return {"ok": True}
