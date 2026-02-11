"""
Check for manager self-updates via the GitHub Releases API.
"""

import threading
from typing import Callable, Optional

import requests
from packaging.version import Version

from src.config import MANAGER_VERSION, GITHUB_REPO


def check_manager_update(
    on_done: Optional[Callable[[bool, str], None]] = None,
) -> threading.Thread:
    """
    Check GitHub for a newer manager release.

    Calls ``on_done(update_available, latest_version_or_message)``.
    """

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
            # Silently ignore – no update info is not critical
            if on_done:
                on_done(False, MANAGER_VERSION)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return t
