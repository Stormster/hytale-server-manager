"""
Manages the Hytale downloader executable – downloading it, extracting it,
and invoking it for auth / version checks / server downloads.

The downloader lives next to the backend exe (program dir), not in the user's
servers folder, so it survives across root_dir changes and is shared by the app.
Credentials stay in root_dir (user's servers folder) as the downloader uses cwd.
"""

import os
import io
import sys
import zipfile
import threading
from typing import Callable, Optional

import requests

from config import (
    DOWNLOADER_EXE,
    DOWNLOADER_ZIP_URL,
    CREDENTIALS_FILE,
)
from utils.paths import resolve_root
from utils.process import run_capture, run_in_thread


def _program_dir() -> str:
    """Directory containing the backend exe (program installation dir). When frozen (PyInstaller), use exe dir; else dev mode uses backend folder."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def downloader_path() -> str:
    """Path to the downloader exe. Prefer program dir (bundled/fetched), else root_dir (legacy)."""
    prog = os.path.join(_program_dir(), DOWNLOADER_EXE)
    if os.path.isfile(prog):
        return prog
    return resolve_root(DOWNLOADER_EXE)


def credentials_path() -> str:
    return resolve_root(CREDENTIALS_FILE)


def has_downloader() -> bool:
    return os.path.isfile(downloader_path())


def has_credentials() -> bool:
    return os.path.isfile(credentials_path())


def fetch_downloader(
    on_status: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[bool, str], None]] = None,
) -> threading.Thread:
    def _worker():
        try:
            if on_status:
                on_status("Downloading Hytale downloader...")
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "application/zip,*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Referer": "https://hytale.com/",
            }
            resp = requests.get(DOWNLOADER_ZIP_URL, timeout=60, stream=True, headers=headers)
            resp.raise_for_status()

            data = io.BytesIO(resp.content)
            if on_status:
                on_status("Extracting downloader...")

            with zipfile.ZipFile(data) as zf:
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

                dest_dir = _program_dir()
                os.makedirs(dest_dir, exist_ok=True)
                dest_path = os.path.join(dest_dir, DOWNLOADER_EXE)
                with zf.open(exe_name) as src, open(dest_path, "wb") as dst:
                    dst.write(src.read())

            if on_done:
                on_done(True, "Downloader ready.")
        except Exception as exc:
            if on_done:
                on_done(False, str(exc))

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return t


def print_version(patchline: str = "release") -> tuple[int, str]:
    from services.settings import get_root_dir
    cmd = [downloader_path(), "-print-version", "-patchline", patchline, "-skip-update-check"]
    return run_capture(cmd, cwd=get_root_dir(), timeout=30)


def download_server(
    dest_zip: str,
    patchline: str = "release",
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
) -> threading.Thread:
    from services.settings import get_root_dir
    cmd = [
        downloader_path(),
        "-download-path", dest_zip,
        "-patchline", patchline,
        "-skip-update-check",
    ]
    return run_in_thread(cmd, cwd=get_root_dir(), on_output=on_output, on_done=on_done)


def run_auth(
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
) -> threading.Thread:
    from services.settings import get_root_dir
    cmd = [downloader_path(), "-print-version", "-skip-update-check"]
    return run_in_thread(cmd, cwd=get_root_dir(), on_output=on_output, on_done=on_done)
