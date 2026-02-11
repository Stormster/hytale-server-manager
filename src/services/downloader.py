"""
Manages the Hytale downloader executable – downloading it, extracting it,
and invoking it for auth / version checks / server downloads.
"""

import os
import io
import zipfile
import threading
from typing import Callable, Optional

import requests

from src.config import (
    BASE_DIR,
    DOWNLOADER_EXE,
    DOWNLOADER_ZIP_URL,
    CREDENTIALS_FILE,
)
from src.utils.paths import resolve
from src.utils.process import run_capture, run_in_thread


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def downloader_path() -> str:
    return resolve(DOWNLOADER_EXE)


def credentials_path() -> str:
    return resolve(CREDENTIALS_FILE)


def has_downloader() -> bool:
    return os.path.isfile(downloader_path())


def has_credentials() -> bool:
    return os.path.isfile(credentials_path())


# ---------------------------------------------------------------------------
# Download + extract the downloader itself
# ---------------------------------------------------------------------------

def fetch_downloader(
    on_status: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[bool, str], None]] = None,
) -> threading.Thread:
    """Download the Hytale downloader zip and extract the exe.  Runs in a thread."""

    def _worker():
        try:
            if on_status:
                on_status("Downloading Hytale downloader...")
            resp = requests.get(DOWNLOADER_ZIP_URL, timeout=60, stream=True)
            resp.raise_for_status()

            data = io.BytesIO(resp.content)
            if on_status:
                on_status("Extracting downloader...")

            with zipfile.ZipFile(data) as zf:
                # Find the windows exe inside the zip
                exe_name = None
                for name in zf.namelist():
                    if name.endswith(DOWNLOADER_EXE):
                        exe_name = name
                        break
                    if "windows" in name.lower() and name.endswith(".exe"):
                        exe_name = name

                if not exe_name:
                    if on_done:
                        on_done(False, "Could not find downloader exe in zip.")
                    return

                # Extract just the exe to BASE_DIR
                with zf.open(exe_name) as src, open(downloader_path(), "wb") as dst:
                    dst.write(src.read())

            if on_done:
                on_done(True, "Downloader ready.")
        except Exception as exc:
            if on_done:
                on_done(False, str(exc))

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return t


# ---------------------------------------------------------------------------
# Invoke the downloader
# ---------------------------------------------------------------------------

def print_version(patchline: str = "release") -> tuple[int, str]:
    """Call the downloader to get the latest version string for *patchline*."""
    cmd = [downloader_path(), "-print-version", "-patchline", patchline, "-skip-update-check"]
    return run_capture(cmd, cwd=BASE_DIR, timeout=30)


def download_server(
    dest_zip: str,
    patchline: str = "release",
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
) -> threading.Thread:
    """Download server files to *dest_zip*.  Runs in a thread."""
    cmd = [
        downloader_path(),
        "-download-path", dest_zip,
        "-patchline", patchline,
        "-skip-update-check",
    ]
    return run_in_thread(cmd, cwd=BASE_DIR, on_output=on_output, on_done=on_done)


def run_auth(
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
) -> threading.Thread:
    """Run the downloader for auth-only (print-version triggers login flow)."""
    cmd = [downloader_path(), "-print-version", "-skip-update-check"]
    return run_in_thread(cmd, cwd=BASE_DIR, on_output=on_output, on_done=on_done)
