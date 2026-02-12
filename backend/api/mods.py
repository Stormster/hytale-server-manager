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


@router.post("/ensure-query-permissions")
def ensure_query_permissions():
    """
    Add nitrado.query.web.read.basic to ANONYMOUS so the manager can fetch player count.
    Safe to call repeatedly – merges with existing permissions.
    """
    server_dir = resolve_instance(SERVER_DIR)
    if not os.path.isdir(server_dir):
        return JSONResponse({"ok": False, "error": "Server not installed."}, status_code=400)
    from services.nitrado_plugins import _ensure_query_permissions
    _ensure_query_permissions(server_dir)
    return {"ok": True}


@router.post("/ensure-webserver-port")
def ensure_webserver_port():
    """
    Set Nitrado WebServer port to game_port+100 for this instance.
    Use when switching instances to avoid "Address already in use" conflicts.
    """
    server_dir = resolve_instance(SERVER_DIR)
    if not os.path.isdir(server_dir):
        return JSONResponse({"ok": False, "error": "Server not installed."}, status_code=400)
    from services.settings import get_active_instance, get_instance_port
    from services.nitrado_plugins import _ensure_webserver_config
    inst = get_active_instance()
    game_port, _ = get_instance_port(inst) if inst else (None, None)
    _ensure_webserver_config(server_dir, force_unique=True, game_port=game_port)
    return {"ok": True}


@router.post("/install-required")
def install_required_mods():
    """Download and install Nitrado WebServer + Query plugins. Requires active instance stopped."""
    from services.settings import get_active_instance
    inst = get_active_instance()
    if inst and server_svc.is_instance_running(inst):
        return JSONResponse(
            {"ok": False, "error": "Stop this instance's server before installing required mods."},
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
    from services.settings import get_active_instance
    inst = get_active_instance()
    if inst and server_svc.is_instance_running(inst):
        return JSONResponse(
            {"ok": False, "error": "Stop this instance's server before enabling or disabling mods."},
            status_code=409,
        )
    server_dir = resolve_instance(SERVER_DIR)
    ok, err = mods_svc.toggle_mod(server_dir, body.path, body.enabled)
    if not ok:
        return JSONResponse({"ok": False, "error": err}, status_code=400)
    return {"ok": True}
