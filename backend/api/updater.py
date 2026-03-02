"""
Updater API routes – version checking, updates, first-time setup.
"""

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Body
from fastapi.responses import StreamingResponse

from services import updater
from services import downloader as dl

router = APIRouter()


@router.get("/setup-ready")
def setup_ready():
    """Pre-check before running setup. Returns specific errors for common issues.
    Use a simple GET (no streaming) so we get immediate feedback even when SSE fails."""
    from services.settings import get_root_dir, get_active_instance

    ok, err = dl.check_downloader_runnable()
    if not ok and err:
        return {"ok": False, "error": err}
    if not dl.has_credentials():
        return {"ok": False, "error": "You need to sign in with your Hytale account first. Go to Settings."}
    root = get_root_dir()
    if not root:
        return {"ok": False, "error": "No servers folder configured. Complete the setup first."}
    instance = get_active_instance()
    if not instance:
        return {"ok": False, "error": "No server instance selected."}
    return {"ok": True}


@router.get("/status")
def status():
    """Return local version info (fast, no network calls)."""
    return {
        "installed_version": updater.read_installed_version(),
        "installed_patchline": updater.read_installed_patchline(),
    }


@router.post("/check")
def check():
    """Check remote versions and return full update status (slow, network calls)."""
    return updater.get_update_status()


@router.get("/check-all")
def check_all():
    """Check update availability for all installed instances. Runs on startup, cached until invalidated."""
    return updater.get_all_instances_update_status()


def _sse_stream_for_operation(operation_fn, patchline: str, graceful: bool = False):
    """Create an SSE StreamingResponse for a long-running updater operation."""

    async def generate():
        from utils.log_buffer import append
        append(f"[SSE] setup/update stream started, patchline={patchline}")
        queue: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def on_status(msg: str):
            loop.call_soon_threadsafe(
                queue.put_nowait, ("status", {"message": msg})
            )

        def on_progress(percent: float, detail: str):
            loop.call_soon_threadsafe(
                queue.put_nowait, ("progress", {"percent": percent, "detail": detail})
            )

        def on_done(ok: bool, msg: str):
            loop.call_soon_threadsafe(
                queue.put_nowait, ("done", {"ok": ok, "message": msg})
            )

        # Send immediate status so the client knows the connection works
        on_status("Starting backend...")
        append("[SSE] first event (Starting backend...) queued")

        operation_fn(
            patchline,
            on_status=on_status,
            on_progress=on_progress,
            on_done=on_done,
            graceful=graceful,
        )

        event_count = 0
        while True:
            try:
                event_type, data = await asyncio.wait_for(queue.get(), timeout=60)
                event_count += 1
                if event_count <= 3 or event_type == "done":
                    append(f"[SSE] yielding event #{event_count}: {event_type}")
                yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
                if event_type == "done":
                    break
            except asyncio.TimeoutError:
                yield f"event: ping\ndata: {{}}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/update")
async def update(
    patchline: str = "release",
    body: Optional[dict] = Body(default=None),
):
    """Download and apply an update. Returns SSE stream of progress.
    Body: { graceful?: bool } - if true, 1 min warning before stop when server running."""
    graceful = bool((body or {}).get("graceful", False))
    return _sse_stream_for_operation(updater.perform_update, patchline, graceful=graceful)


def _sse_stream_for_update_all(graceful: bool = False):
    """Create an SSE StreamingResponse for update-all operation."""
    async def generate():
        queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def on_status(msg: str):
            loop.call_soon_threadsafe(queue.put_nowait, ("status", {"message": msg}))

        def on_progress(percent: float, detail: str):
            loop.call_soon_threadsafe(queue.put_nowait, ("progress", {"percent": percent, "detail": detail}))

        def on_done(ok: bool, msg: str):
            loop.call_soon_threadsafe(queue.put_nowait, ("done", {"ok": ok, "message": msg}))

        updater.perform_update_all(
            on_status=on_status,
            on_progress=on_progress,
            on_done=on_done,
            graceful=graceful,
            graceful_minutes=1,
        )

        while True:
            try:
                event_type, data = await asyncio.wait_for(queue.get(), timeout=60)
                yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
                if event_type == "done":
                    break
            except asyncio.TimeoutError:
                yield f"event: ping\ndata: {{}}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/update-all")
async def update_all(body: Optional[dict] = Body(default=None)):
    """Update all instances that have updates available. Uses cache. Returns SSE stream of progress.
    Body: { graceful?: bool } - if true, 1 min warning before stop when servers running."""
    graceful = bool((body or {}).get("graceful", False))
    return _sse_stream_for_update_all(graceful=graceful)


@router.post("/setup")
async def setup(patchline: str = "release"):
    """First-time server setup. Returns SSE stream of progress."""
    return _sse_stream_for_operation(updater.perform_first_time_setup, patchline)
