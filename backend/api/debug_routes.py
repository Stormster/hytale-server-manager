"""
Debug API – log collection for troubleshooting when SSE/frontend fails.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/recent-logs")
def recent_logs():
    """Return recent backend logs for debugging. Call when install is stuck with no output."""
    from utils.log_buffer import get_recent
    return {"logs": get_recent()}
