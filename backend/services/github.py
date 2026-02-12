"""
Check for manager self-updates via the GitHub Releases API.
"""

import threading
from typing import Callable, Optional

import requests
from packaging.version import Version

from config import MANAGER_VERSION, GITHUB_REPO


def check_manager_update(
    on_done: Optional[Callable[[bool, str], None]] = None,
) -> threading.Thread:
    def _worker():
        try:
            url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
            resp = requests.get(url, timeout=8)
            resp.raise_for_status()
            data = resp.json()
            tag = data.get("tag_name", "").lstrip("v")
            if tag and Version(tag) > Version(MANAGER_VERSION):
                if on_done:
                    on_done(True, tag)
            else:
                if on_done:
                    on_done(False, MANAGER_VERSION)
        except Exception:
            if on_done:
                on_done(False, MANAGER_VERSION)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return t


def check_manager_update_sync() -> dict:
    """Synchronous version for the API layer."""
    try:
        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        tag = data.get("tag_name", "").lstrip("v")
        download_url = data.get("html_url", "")
        if tag and Version(tag) > Version(MANAGER_VERSION):
            return {
                "update_available": True,
                "latest_version": tag,
                "download_url": download_url,
            }
        return {
            "update_available": False,
            "latest_version": MANAGER_VERSION,
            "download_url": "",
        }
    except Exception:
        return {
            "update_available": False,
            "latest_version": MANAGER_VERSION,
            "download_url": "",
        }
