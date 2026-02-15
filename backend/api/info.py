"""
Info API routes – manager metadata, Java status, manager update check.
"""

import json as _json
import os
import subprocess
import sys
import urllib.request

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import MANAGER_VERSION, GITHUB_REPO, REPORT_URL
from utils.java import check_java
from services import downloader as dl
from services import github as gh

router = APIRouter()


@router.get("/info")
def info():
    java_ok, java_version = check_java()
    try:
        from plugin_loader import pro_loaded
    except ImportError:
        pro_loaded = False
    return {
        "manager_version": MANAGER_VERSION,
        "java_ok": java_ok,
        "java_version": java_version,
        "has_downloader": dl.has_downloader(),
        "github_repo": GITHUB_REPO,
        "report_url": REPORT_URL,
        "pro_loaded": pro_loaded,
    }


@router.get("/info/public-ip")
def public_ip():
    """Fetch the machine's public IPv4 address (for server connection strings)."""
    try:
        with urllib.request.urlopen("https://api.ipify.org?format=json", timeout=5) as r:
            data = _json.loads(r.read().decode())
            return {"ip": data.get("ip", ""), "ok": True}
    except Exception as e:
        return {"ip": None, "ok": False, "error": str(e)}


@router.get("/info/manager-update")
def manager_update():
    """Check GitHub for a newer manager release (synchronous)."""
    return gh.check_manager_update_sync()


class OpenPathRequest(BaseModel):
    path: str


@router.post("/info/open-path")
def open_path(body: OpenPathRequest):
    """Open a folder in the system file manager."""
    path = os.path.abspath(body.path.strip())
    if not os.path.exists(path):
        return JSONResponse({"ok": False, "error": "Path does not exist"}, status_code=400)
    try:
        if sys.platform == "win32":
            os.startfile(path)
        elif sys.platform == "darwin":
            subprocess.run(["open", path], check=True)
        else:
            subprocess.run(["xdg-open", path], check=True)
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
