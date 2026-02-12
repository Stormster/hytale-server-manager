"""
Updater API routes – version checking, updates, first-time setup.
"""

import asyncio
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from services import updater

router = APIRouter()


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


def _sse_stream_for_operation(operation_fn, patchline: str):
    """Create an SSE StreamingResponse for a long-running updater operation."""

    async def generate():
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

        operation_fn(
            patchline,
            on_status=on_status,
            on_progress=on_progress,
            on_done=on_done,
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


@router.post("/update")
async def update(patchline: str = "release"):
    """Download and apply an update. Returns SSE stream of progress."""
    return _sse_stream_for_operation(updater.perform_update, patchline)


@router.post("/setup")
async def setup(patchline: str = "release"):
    """First-time server setup. Returns SSE stream of progress."""
    return _sse_stream_for_operation(updater.perform_first_time_setup, patchline)
