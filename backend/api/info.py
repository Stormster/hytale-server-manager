"""
Info API routes – manager metadata, Java status, manager update check.
"""

from fastapi import APIRouter

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
