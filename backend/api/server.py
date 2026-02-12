"""
Server API routes – start / stop / status / live console SSE.
"""

import asyncio
import json
from fastapi import APIRouter, Body
from fastapi.responses import StreamingResponse, JSONResponse

from services import server as server_svc

router = APIRouter()


# ---------------------------------------------------------------------------
# Shared console state – bridges thread callbacks to async SSE subscribers
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
        """Thread-safe callback for server output."""
        if self._loop:
            self._loop.call_soon_threadsafe(self.push_line, line)

    def on_done(self, rc: int):
        """Thread-safe callback for server exit."""
        if self._loop:
            self._loop.call_soon_threadsafe(self.push_done, rc)


_console = _ConsoleManager()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/status")
def status():
    return {
        "installed": server_svc.is_installed(),
        "running": server_svc.is_running(),
    }


@router.post("/start")
async def start():
    if server_svc.is_running():
        return JSONResponse(
            {"ok": False, "error": "Server is already running"}, status_code=409
        )

    _console.reset(asyncio.get_event_loop())
    result = server_svc.start(on_output=_console.on_output, on_done=_console.on_done)

    if result is None:
        return JSONResponse(
            {"ok": False, "error": "Failed to start server"}, status_code=500
        )

    return {"ok": True}


@router.post("/stop")
def stop():
    server_svc.stop()
    return {"ok": True}


@router.post("/command")
def command(body: dict = Body(...)):
    """Send a command to the server's stdin (when running)."""
    cmd = body.get("command", "")
    if not isinstance(cmd, str):
        return JSONResponse({"ok": False, "error": "command must be a string"}, status_code=400)
    if not server_svc.is_running():
        return JSONResponse({"ok": False, "error": "Server is not running"}, status_code=409)
    if server_svc.send_command(cmd):
        return {"ok": True}
    return JSONResponse({"ok": False, "error": "Failed to send command"}, status_code=500)


@router.get("/console")
async def console():
    """SSE stream of live console output."""
    queue: asyncio.Queue = asyncio.Queue()
    _console.subscribers.append(queue)

    async def generate():
        try:
            # Send buffered lines first
            for line in list(_console.buffer):
                yield f"event: output\ndata: {json.dumps({'line': line})}\n\n"

            # If server already stopped, send done and exit
            if not _console.server_active and _console.last_exit_code is not None:
                yield f"event: done\ndata: {json.dumps({'code': _console.last_exit_code})}\n\n"
                return

            # Stream new events
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
            if queue in _console.subscribers:
                _console.subscribers.remove(queue)

    return StreamingResponse(generate(), media_type="text/event-stream")
