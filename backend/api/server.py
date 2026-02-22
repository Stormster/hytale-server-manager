"""
Server API routes – start / stop / status / live console SSE.
"""

import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Body
from fastapi.responses import StreamingResponse, JSONResponse

from services import server as server_svc

router = APIRouter()


# ---------------------------------------------------------------------------
# Per-instance console state – bridges thread callbacks to async SSE subscribers
# ---------------------------------------------------------------------------

class _ConsoleManager:
    def __init__(self):
        self.buffer: list[str] = []
        self.subscribers: list[asyncio.Queue] = []
        self.server_active = False
        self.last_exit_code: int | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def reset(self, loop: asyncio.AbstractEventLoop):
        self.buffer.clear()
        self.subscribers.clear()
        self.server_active = True
        self.last_exit_code = None
        self._loop = loop

    def push_line(self, line: str):
        self.buffer.append(line)
        for q in list(self.subscribers):
            try:
                q.put_nowait(("output", line))
            except Exception:
                pass

    def push_done(self, code: int):
        self.server_active = False
        self.last_exit_code = code
        for q in list(self.subscribers):
            try:
                q.put_nowait(("done", code))
            except Exception:
                pass

    def on_output(self, line: str):
        if self._loop:
            self._loop.call_soon_threadsafe(self.push_line, line)

    def on_done(self, rc: int):
        if self._loop:
            self._loop.call_soon_threadsafe(self.push_done, rc)


_consoles: dict[str, _ConsoleManager] = {}


def _get_console(instance_name: str) -> _ConsoleManager:
    if instance_name not in _consoles:
        _consoles[instance_name] = _ConsoleManager()
    return _consoles[instance_name]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/status")
def status():
    running_instance = server_svc.get_running_instance()
    running_instances = []
    # Cache resource usage per instance so we don't call get_resource_usage
    # twice for the same process (the second call resets the CPU delta).
    usage_cache: dict[str, tuple] = {}
    for name in server_svc.get_running_instances():
        uptime = server_svc.get_uptime_seconds(name)
        usage = server_svc.get_resource_usage(name)
        usage_cache[name] = usage
        ram_mb, cpu_pct = usage
        game_port = server_svc.get_running_game_port(name)
        running_instances.append({
            "name": name,
            "game_port": game_port,
            "uptime_seconds": round(uptime, 1) if uptime is not None else None,
            "ram_mb": ram_mb,
            "cpu_percent": cpu_pct,
        })
    uptime = server_svc.get_uptime_seconds(running_instance) if running_instance else None
    if running_instance and running_instance in usage_cache:
        ram_mb, cpu_pct = usage_cache[running_instance]
    elif running_instance:
        ram_mb, cpu_pct = server_svc.get_resource_usage(running_instance)
    else:
        ram_mb, cpu_pct = server_svc.get_resource_usage()
    players = server_svc.get_players()
    last_exit_time, last_exit_code = server_svc.get_last_exit_info()
    per_instance_exit = server_svc.get_per_instance_exit_info()

    from services import updater as updater_svc
    update_in_progress = updater_svc.get_update_in_progress()

    last_exits = {
        name: {
            "exit_time": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(),
            "exit_code": code,
        }
        for name, (ts, code) in per_instance_exit.items()
    }

    return {
        "installed": server_svc.is_installed(),
        "running": server_svc.is_running(),
        "running_instance": running_instance,
        "running_instances": running_instances,
        "uptime_seconds": round(uptime, 1) if uptime is not None else None,
        "last_exit_time": (
            datetime.fromtimestamp(last_exit_time, tz=timezone.utc).isoformat()
            if last_exit_time is not None else None
        ),
        "last_exit_code": last_exit_code,
        "last_exits": last_exits,
        "ram_mb": ram_mb,
        "cpu_percent": cpu_pct,
        "players": players,
        "update_in_progress": update_in_progress,
    }


@router.post("/start")
async def start(body: dict = Body(default=None)):
    from services.settings import get_active_instance
    from services import updater as updater_svc

    inst = (body or {}).get("instance") or get_active_instance()
    if not inst:
        return JSONResponse(
            {"ok": False, "error": "No instance selected"}, status_code=400
        )
    if updater_svc.get_update_in_progress():
        return JSONResponse(
            {"ok": False, "error": "Cannot start server while an update is in progress."},
            status_code=409,
        )
    if server_svc.is_instance_running(inst):
        return JSONResponse(
            {"ok": False, "error": "That instance is already running"}, status_code=409
        )

    console = _get_console(inst)
    console.reset(asyncio.get_event_loop())
    result = server_svc.start(
        instance_name=inst,
        on_output=console.on_output,
        on_done=console.on_done,
    )

    if result is None:
        return JSONResponse(
            {"ok": False, "error": "Failed to start server"}, status_code=500
        )

    return {"ok": True}


@router.post("/stop")
def stop(body: dict = Body(default=None)):
    body = body or {}
    if body.get("all"):
        server_svc.stop_all()
    else:
        instance_name = body.get("instance")
        server_svc.stop(instance_name=instance_name)
    return {"ok": True}


@router.post("/command")
def command(body: dict = Body(...)):
    """Send a command to the server's stdin (when running)."""
    cmd = body.get("command", "")
    instance_name = body.get("instance")
    if not isinstance(cmd, str):
        return JSONResponse({"ok": False, "error": "command must be a string"}, status_code=400)
    if not server_svc.is_running():
        return JSONResponse({"ok": False, "error": "Server is not running"}, status_code=409)
    if server_svc.send_command(cmd, instance_name=instance_name):
        return {"ok": True}
    return JSONResponse({"ok": False, "error": "Failed to send command"}, status_code=500)


@router.get("/console")
async def console(instance: str | None = None):
    """SSE stream of live console output. ?instance=Name for specific instance."""
    from services.settings import get_active_instance
    inst = instance or get_active_instance()
    if not inst:
        return JSONResponse({"error": "No instance specified"}, status_code=400)
    console_mgr = _get_console(inst)
    queue: asyncio.Queue = asyncio.Queue()
    console_mgr.subscribers.append(queue)

    async def generate():
        try:
            for line in list(console_mgr.buffer):
                yield f"event: output\ndata: {json.dumps({'line': line})}\n\n"
            if not console_mgr.server_active and console_mgr.last_exit_code is not None:
                yield f"event: done\ndata: {json.dumps({'code': console_mgr.last_exit_code})}\n\n"
                return
            while True:
                try:
                    event_type, data = await asyncio.wait_for(queue.get(), timeout=30)
                    if event_type == "output":
                        yield f"event: output\ndata: {json.dumps({'line': data})}\n\n"
                    elif event_type == "done":
                        yield f"event: done\ndata: {json.dumps({'code': data})}\n\n"
                        break
                except asyncio.TimeoutError:
                    yield f"event: ping\ndata: {{}}\n\n"
        finally:
            if queue in console_mgr.subscribers:
                console_mgr.subscribers.remove(queue)

    return StreamingResponse(generate(), media_type="text/event-stream")
