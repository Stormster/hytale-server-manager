"""
Authentication / credential management.
"""

import os
import threading
from typing import Callable, Optional

from services import downloader as dl
from utils.paths import resolve_root
from config import CREDENTIALS_FILE


def has_credentials() -> bool:
    return dl.has_credentials()


def refresh_auth(
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
) -> threading.Thread:
    """
    Delete existing credentials and run the downloader so the user can
    re-authenticate in their browser.
    """
    creds = resolve_root(CREDENTIALS_FILE)
    if os.path.isfile(creds):
        os.remove(creds)

    if on_output:
        on_output("Credentials deleted. Opening browser for login...")

    return dl.run_auth(on_output=on_output, on_done=on_done)
