"""
Info API routes – manager metadata, Java status, manager update check, downloader fetch.
"""

import asyncio
import json as _json
import os
import subprocess
import sys
import urllib.request

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse
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
        from plugin_loader import experimental_addon_loaded
    except ImportError:
        experimental_addon_loaded = False
    return {
        "manager_version": MANAGER_VERSION,
        "java_ok": java_ok,
        "java_version": java_version,
        "has_downloader": dl.has_downloader(),
        "github_repo": GITHUB_REPO,
        "report_url": REPORT_URL,
        "experimental_addon_loaded": experimental_addon_loaded,
    }


def _get_local_ip() -> str | None:
    """Get the machine's local IPv4 address (for port forwarding)."""
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


@router.get("/info/local-ip")
def local_ip():
    """Return the machine's local IPv4 address (for port forwarding)."""
    ip = _get_local_ip()
    return {"ip": ip, "ok": ip is not None}


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


@router.post("/info/fetch-downloader")
async def fetch_downloader():
    """Download the Hytale downloader executable. Returns SSE stream of status and result."""

    async def generate():
        queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def on_status(msg: str):
            loop.call_soon_threadsafe(queue.put_nowait, ("status", {"message": msg}))

        def on_done(ok: bool, msg: str):
            loop.call_soon_threadsafe(queue.put_nowait, ("done", {"ok": ok, "message": msg}))

        dl.fetch_downloader(on_status=on_status, on_done=on_done)

        while True:
            try:
                event_type, data = await asyncio.wait_for(queue.get(), timeout=90)
                yield f"event: {event_type}\ndata: {_json.dumps(data)}\n\n"
                if event_type == "done":
                    break
            except asyncio.TimeoutError:
                yield "event: ping\ndata: {}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


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
            # Use explorer.exe so the window opens in foreground (os.startfile often opens behind)
            subprocess.Popen(["explorer", path], shell=False)
        elif sys.platform == "darwin":
            subprocess.run(["open", path], check=True)
        else:
            subprocess.run(["xdg-open", path], check=True)
        return {"ok": True}
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
