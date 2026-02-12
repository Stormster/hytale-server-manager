"""
Mods API – list and toggle mods. Toggling disabled while server is running.
"""

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
