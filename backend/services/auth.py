"""
Authentication / credential management.
"""

import os
import threading
from typing import Callable, Optional

from services import downloader as dl
from services.settings import get_root_dir
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
    re-authenticate in their browser. Fetches the downloader first if missing.
    """

    def _worker():
        # Ensure downloader exists before auth (it lives next to the app)
        if not dl.has_downloader():
            if on_output:
                on_output("Downloading Hytale downloader (first-time setup)...")
            evt = threading.Event()
            fetch_ok = [False]
            fetch_msg = [""]

            def _fetch_done(ok: bool, msg: str):
                fetch_ok[0] = ok
                fetch_msg[0] = msg
                evt.set()

            dl.fetch_downloader(on_status=on_output, on_done=_fetch_done)
            evt.wait()

            if not fetch_ok[0]:
                if on_output:
                    on_output(f"[ERROR] {fetch_msg[0]}")
                if on_done:
                    on_done(1)
                return
            if on_output:
                on_output("Downloader ready.")

        root = (get_root_dir() or "").strip()
        if not root:
            # root_dir must be set - subprocess cwd="" causes WinError 267 on Windows
            if on_output:
                on_output("[ERROR] Servers folder is not set. Complete setup first.")
            if on_done:
                on_done(1)
            return

        root = os.path.abspath(root)
        os.makedirs(root, exist_ok=True)
        creds = resolve_root(CREDENTIALS_FILE)
        if os.path.isfile(creds):
            os.remove(creds)

        if on_output:
            on_output("Credentials deleted. Opening browser for login...")

        dl.run_auth(on_output=on_output, on_done=on_done)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return t
