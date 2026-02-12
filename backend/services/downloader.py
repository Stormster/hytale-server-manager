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

from config import (
    DOWNLOADER_EXE,
    DOWNLOADER_ZIP_URL,
    CREDENTIALS_FILE,
)
from utils.paths import resolve_root
from utils.process import run_capture, run_in_thread


def downloader_path() -> str:
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
