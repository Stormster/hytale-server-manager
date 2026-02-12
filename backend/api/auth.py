"""
Auth API routes – credential status and SSE refresh stream.
"""

import asyncio
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from services import auth as auth_svc

router = APIRouter()


@router.get("/status")
def auth_status():
    return {"has_credentials": auth_svc.has_credentials()}


@router.post("/refresh")
async def refresh_auth():
    """Delete credentials and re-authenticate. Returns SSE stream of output."""

    async def generate():
        queue: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def on_output(line: str):
            loop.call_soon_threadsafe(
                queue.put_nowait, ("output", {"line": line})
            )

        def on_done(rc: int):
            loop.call_soon_threadsafe(
                queue.put_nowait, ("done", {"code": rc})
            )

        auth_svc.refresh_auth(on_output=on_output, on_done=on_done)

        while True:
            try:
                event_type, data = await asyncio.wait_for(queue.get(), timeout=120)
                yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
                if event_type == "done":
                    break
            except asyncio.TimeoutError:
                yield f"event: ping\ndata: {{}}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
