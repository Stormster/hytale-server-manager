"""
Debug API – log collection for troubleshooting when SSE/frontend fails.
"""

from fastapi import APIRouter

from config import MANAGER_VERSION, GITHUB_REPO

router = APIRouter()


@router.get("/recent-logs")
def recent_logs():
    """Return recent backend logs for debugging. Call when install is stuck with no output."""
    from utils.log_buffer import get_recent
    return {"logs": get_recent()}


@router.get("/diagnostics")
def export_diagnostics():
    """Export support bundle: version, instances summary, recent logs."""
    from utils.log_buffer import get_recent
    from services import settings
    from services import instances as instances_svc

    try:
        instance_list = instances_svc.list_instances()
    except Exception:
        instance_list = []

    return {
        "manager_version": MANAGER_VERSION,
        "github_repo": GITHUB_REPO,
        "root_dir": settings.get_root_dir(),
        "active_connection": settings.get_active_connection(),
        "remote_connections": [
            {"id": c.get("id"), "name": c.get("name"), "base_url": c.get("base_url")}
            for c in settings.get_remote_connections()
        ],
        "instances": instance_list,
        "logs": get_recent(),
    }
