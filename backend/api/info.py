"""
Info API routes – manager metadata, Java status, manager update check.
"""

import os
import subprocess
import sys

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
    return {
        "manager_version": MANAGER_VERSION,
        "java_ok": java_ok,
        "java_version": java_version,
        "has_downloader": dl.has_downloader(),
        "github_repo": GITHUB_REPO,
        "report_url": REPORT_URL,
    }


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
