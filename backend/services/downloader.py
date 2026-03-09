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
    DOWNLOADER_WINDOWS,
    DOWNLOADER_LINUX,
    DOWNLOADER_ZIP_URL,
    CREDENTIALS_FILE,
)
from utils.paths import resolve_root
from utils.process import run_capture, run_in_thread


def get_downloader_exe() -> str:
    """Return the downloader binary name for the current platform."""
    if sys.platform == "linux":
        return DOWNLOADER_LINUX
    return DOWNLOADER_WINDOWS


def _program_dir() -> str:
    """Directory containing the backend exe (program installation dir). When frozen (PyInstaller), use exe dir; else dev mode uses backend folder."""
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _downloader_app_data_dir() -> str:
    """Writable app-data dir for the downloader (used on Linux when program dir is read-only)."""
    if sys.platform == "linux":
        base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    else:
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(base, "HytaleServerManager", "downloader")


def downloader_path() -> str:
    """Path to the downloader binary. Order: program dir (existing installs), then app-data (Linux writable), then root_dir (legacy)."""
    exe_name = get_downloader_exe()
    # Windows: program dir then root (backward compatible)
    # Linux: app-data then program dir then root (app-data is writable when program dir is not)
    if sys.platform == "linux":
        app_data = os.path.join(_downloader_app_data_dir(), exe_name)
        if os.path.isfile(app_data):
            return app_data
    prog = os.path.join(_program_dir(), exe_name)
    if os.path.isfile(prog):
        return prog
    return resolve_root(exe_name)


def credentials_path() -> str:
    return resolve_root(CREDENTIALS_FILE)


def has_downloader() -> bool:
    return os.path.isfile(downloader_path())


def has_credentials() -> bool:
    return os.path.isfile(credentials_path())


def check_downloader_runnable() -> tuple[bool, str | None]:
    """Verify the downloader exists and can run. Returns (ok, error_message)."""
    if not has_downloader():
        return False, "Hytale downloader is missing. Go to Settings and download it first."
    from services.settings import get_root_dir
    root = (get_root_dir() or "").strip() or os.getcwd()
    root = os.path.abspath(root)
    os.makedirs(root, exist_ok=True)
    rc, out = run_capture(
        [downloader_path(), "-print-version", "-skip-update-check"],
        cwd=root,
        timeout=10,
    )
    if rc == 0:
        return True, None
    err = (out or "").strip()
    if "Permission denied" in err or "PermissionError" in str(out):
        return False, "The Hytale downloader cannot be run. Open Settings and try downloading it again, or check file permissions."
    if "not found" in err.lower() or "no such file" in err.lower():
        return False, "Hytale downloader is missing or incomplete. Go to Settings and download it again."
    if "timed out" in err.lower() or rc == -1:
        return False, "The Hytale downloader did not respond. It may be missing required libraries (on Linux, try installing dependencies)."
    if "[ERROR]" in err:
        return False, err.replace("[ERROR]", "").strip() or "The Hytale downloader failed to run."
    return False, "The Hytale downloader could not be started. Go to Settings to download or re-download it."


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
                target_name = get_downloader_exe()
                exe_name = None
                for name in zf.namelist():
                    if name.endswith(target_name) or (
                        os.path.basename(name.rstrip("/")) == target_name
                    ):
                        exe_name = name
                        break
                if not exe_name and sys.platform == "win32":
                    for name in zf.namelist():
                        if "windows" in name.lower() and name.endswith(".exe"):
                            exe_name = name
                            break
                if not exe_name and sys.platform == "linux":
                    for name in zf.namelist():
                        if "linux" in name.lower() and "amd64" in name:
                            exe_name = name
                            break

                if not exe_name:
                    if on_done:
                        on_done(False, "Could not find downloader binary in zip.")
                    return

                # On Linux use app-data (writable); on Windows use program dir (backward compatible)
                if sys.platform == "linux":
                    dest_dir = _downloader_app_data_dir()
                else:
                    dest_dir = _program_dir()
                os.makedirs(dest_dir, exist_ok=True)
                dest_path = os.path.join(dest_dir, target_name)
                with zf.open(exe_name) as src, open(dest_path, "wb") as dst:
                    dst.write(src.read())

                if sys.platform == "linux":
                    os.chmod(dest_path, 0o755)

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


def classify_version_error(output: str) -> tuple[str, str]:
    """
    Classify downloader -print-version failure output.
    Returns (error_kind, user_friendly_message).
    """
    raw = (output or "").strip()
    low = raw.lower()

    if "invalid_grant" in low or "refresh token is" in low:
        return (
            "auth_expired",
            "Hytale auth expired. Click Re-auth to sign in again.",
        )
    if "no server tokens configured" in low:
        return (
            "auth_missing",
            "No Hytale credentials found. Click Re-auth to sign in.",
        )
    if "command timed out" in low or "timed out" in low:
        return (
            "timeout",
            "Version check timed out. Check your internet connection and try again.",
        )
    if "command not found" in low or "no such file" in low:
        return (
            "downloader_missing",
            "Hytale downloader not found. Install it in Settings.",
        )
    if "permission denied" in low:
        return (
            "permission",
            "Downloader cannot run due to file permissions. Reinstall downloader in Settings.",
        )
    if "[error]" in low:
        # Keep original downloader message visible for troubleshooting.
        return ("upstream_error", raw.replace("[ERROR]", "").strip() or raw)
    return ("unknown", raw or "Could not fetch remote server version.")


def download_server(
    dest_zip: str,
    patchline: str = "release",
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
) -> threading.Thread:
    import sys
    from services.settings import get_root_dir
    path = downloader_path()
    print(f"[downloader] Running: {path} (cwd={get_root_dir()})", file=sys.stderr, flush=True)
    cmd = [path, "-download-path", dest_zip, "-patchline", patchline, "-skip-update-check"]
    return run_in_thread(cmd, cwd=get_root_dir(), on_output=on_output, on_done=on_done)


def run_auth(
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
) -> threading.Thread:
    from services.settings import get_root_dir
    root = (get_root_dir() or "").strip()
    if not root:
        def _fail():
            if on_output:
                on_output("[ERROR] Servers folder is not set.")
            if on_done:
                on_done(1)
        t = threading.Thread(target=_fail, daemon=True)
        t.start()
        return t
    root = os.path.abspath(root)
    os.makedirs(root, exist_ok=True)
    cmd = [downloader_path(), "-print-version", "-skip-update-check"]
    return run_in_thread(cmd, cwd=root, on_output=on_output, on_done=on_done)
