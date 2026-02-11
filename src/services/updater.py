"""
Version checking, downloading updates, and extracting them into the Server folder.
"""

import os
import re
import shutil
import zipfile
import threading
from typing import Callable, Optional

from src.config import (
    BASE_DIR,
    VERSION_FILE,
    PATCHLINE_FILE,
    SERVER_DIR,
)
from src.utils.paths import resolve
from src.services import downloader as dl
from src.services import backup as bk


# ---------------------------------------------------------------------------
# Version info helpers
# ---------------------------------------------------------------------------

def read_installed_version() -> str:
    """Return the installed server version string, or 'unknown'."""
    vf = resolve(VERSION_FILE)
    if os.path.isfile(vf):
        with open(vf, "r") as f:
            return f.read().strip() or "unknown"
    return "unknown"


def read_installed_patchline() -> str:
    """Return the installed patchline ('release' or 'pre-release')."""
    pf = resolve(PATCHLINE_FILE)
    if os.path.isfile(pf):
        with open(pf, "r") as f:
            return f.read().strip() or "release"
    return "release"


def _save_version(version: str, patchline: str) -> None:
    with open(resolve(VERSION_FILE), "w") as f:
        f.write(version)
    with open(resolve(PATCHLINE_FILE), "w") as f:
        f.write(patchline)


def check_remote_versions() -> dict:
    """
    Query the downloader for the latest release and pre-release versions.

    Returns ``{"release": str|None, "pre-release": str|None}``.
    """
    result = {}
    for pl in ("release", "pre-release"):
        rc, out = dl.print_version(pl)
        result[pl] = out.strip() if rc == 0 and out and not out.startswith("[ERROR]") else None
    return result


def version_greater(a: str, b: str) -> bool:
    """Lexicographic compare – works for YYYY.MM.DD-hash format."""
    if not a:
        return False
    if not b or b == "unknown":
        return True
    return a > b


def get_update_status() -> dict:
    """
    Return a dict describing current state and available updates::

        {
            "installed_version": str,
            "installed_patchline": str,
            "remote_release": str | None,
            "remote_prerelease": str | None,
            "update_available_release": bool,
            "update_available_prerelease": bool,
        }
    """
    iv = read_installed_version()
    ip = read_installed_patchline()
    remote = check_remote_versions()
    rr = remote.get("release")
    rp = remote.get("pre-release")

    return {
        "installed_version": iv,
        "installed_patchline": ip,
        "remote_release": rr,
        "remote_prerelease": rp,
        "update_available_release": version_greater(rr, iv) if ip == "release" else (rr is not None and rr != iv),
        "update_available_prerelease": version_greater(rp, iv) if ip == "pre-release" else (rp is not None and rp != iv),
    }


# ---------------------------------------------------------------------------
# Progress parsing
# ---------------------------------------------------------------------------

# Matches lines like: [====...] 91.0% (1.3 GB / 1.4 GB)
_PROGRESS_RE = re.compile(r'(\d+\.?\d*)%\s*\(([^)]+)\)')


def parse_progress(line: str) -> tuple[float, str] | None:
    """
    Try to parse a downloader progress line.

    Returns ``(percent, detail_str)`` or ``None`` if the line isn't progress.
    """
    m = _PROGRESS_RE.search(line)
    if m:
        return float(m.group(1)), m.group(2).strip()
    return None


def _make_dl_output_handler(
    on_status: Optional[Callable[[str], None]],
    on_progress: Optional[Callable[[float, str], None]],
) -> Callable[[str], None]:
    """
    Return a callback that routes downloader output:
    - progress lines -> on_progress(percent, detail)
    - everything else -> on_status(line)
    """
    def _handler(line: str):
        prog = parse_progress(line)
        if prog and on_progress:
            on_progress(prog[0], prog[1])
        elif on_status:
            on_status(line)
    return _handler


# ---------------------------------------------------------------------------
# Perform update
# ---------------------------------------------------------------------------

def perform_update(
    patchline: str = "release",
    on_status: Optional[Callable[[str], None]] = None,
    on_progress: Optional[Callable[[float, str], None]] = None,
    on_done: Optional[Callable[[bool, str], None]] = None,
) -> threading.Thread:
    """
    Download the server zip for *patchline*, back up the current server,
    extract the update, and save version info.  Runs in a thread.

    *on_progress(percent, detail)* is called with download progress (0-100).
    *on_status(msg)* is called for non-progress status messages.
    """

    def _worker():
        try:
            zip_path = resolve("temp_update.zip")
            server_dir = resolve(SERVER_DIR)

            # --- download ---
            if on_status:
                on_status(f"Downloading {patchline}...")

            done_event = threading.Event()
            dl_result: dict = {"rc": -1}

            output_handler = _make_dl_output_handler(on_status, on_progress)

            def _dl_done(rc):
                dl_result["rc"] = rc
                done_event.set()

            dl.download_server(zip_path, patchline, on_output=output_handler, on_done=_dl_done)
            done_event.wait()

            if dl_result["rc"] != 0:
                if on_done:
                    on_done(False, "Download failed. Auth may have expired – try refreshing auth.")
                return

            # --- get new version string ---
            rc, new_ver = dl.print_version(patchline)
            if rc != 0 or not new_ver:
                new_ver = "unknown"

            # --- backup current server (if it exists) ---
            if os.path.isdir(server_dir):
                if on_status:
                    on_status("Creating backup before update...")
                old_ver = read_installed_version()
                old_pl = read_installed_patchline()
                bk.create_backup(
                    label=f"update from {old_ver} ({old_pl}) to {new_ver} ({patchline})"
                )

            # --- extract ---
            if on_status:
                on_status("Extracting update...")
            _extract_server_zip(zip_path, server_dir)

            # --- save version ---
            _save_version(new_ver, patchline)

            # --- cleanup ---
            if os.path.isfile(zip_path):
                os.remove(zip_path)

            if on_done:
                on_done(True, f"Update complete! Version: {new_ver}")
        except Exception as exc:
            if on_done:
                on_done(False, str(exc))

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return t


def perform_first_time_setup(
    patchline: str = "release",
    on_status: Optional[Callable[[str], None]] = None,
    on_progress: Optional[Callable[[float, str], None]] = None,
    on_done: Optional[Callable[[bool, str], None]] = None,
) -> threading.Thread:
    """First-time install: fetch downloader if needed, then download + extract server."""

    def _worker():
        try:
            # Ensure downloader exists
            if not dl.has_downloader():
                if on_status:
                    on_status("Downloading Hytale downloader...")
                evt = threading.Event()
                fetch_result: dict = {"ok": False, "msg": ""}

                def _fetch_done(ok, msg):
                    fetch_result["ok"] = ok
                    fetch_result["msg"] = msg
                    evt.set()

                dl.fetch_downloader(on_status=on_status, on_done=_fetch_done)
                evt.wait()

                if not fetch_result["ok"]:
                    if on_done:
                        on_done(False, fetch_result["msg"])
                    return

            # Download server
            zip_path = resolve("first_time_setup.zip")
            if on_status:
                on_status(f"Downloading server ({patchline})...")

            done_event = threading.Event()
            dl_result: dict = {"rc": -1}

            output_handler = _make_dl_output_handler(on_status, on_progress)

            def _dl_done(rc):
                dl_result["rc"] = rc
                done_event.set()

            dl.download_server(zip_path, patchline, on_output=output_handler, on_done=_dl_done)
            done_event.wait()

            if dl_result["rc"] != 0:
                if on_done:
                    on_done(False, "Download failed. Check your credentials.")
                return

            # Get version
            rc, new_ver = dl.print_version(patchline)
            if rc != 0 or not new_ver:
                new_ver = "unknown"

            # Extract
            if on_status:
                on_status("Extracting server files...")
            server_dir = resolve(SERVER_DIR)
            os.makedirs(server_dir, exist_ok=True)
            _extract_server_zip(zip_path, server_dir)

            _save_version(new_ver, patchline)

            if os.path.isfile(zip_path):
                os.remove(zip_path)

            if on_done:
                on_done(True, f"Setup complete! Version: {new_ver}")
        except Exception as exc:
            if on_done:
                on_done(False, str(exc))

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return t


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_server_zip(zip_path: str, server_dir: str) -> None:
    """Extract a server zip into the working directory, preserving user data."""
    temp_dir = resolve("temp_extract")
    if os.path.isdir(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)

    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(temp_dir)

    extracted_server = os.path.join(temp_dir, "Server")
    if not os.path.isdir(extracted_server):
        shutil.rmtree(temp_dir)
        raise RuntimeError("Unexpected zip structure – no Server folder found.")

    # Copy server binaries (preserve config / mods / universe)
    for name in ("HytaleServer.jar", "HytaleServer.aot"):
        src = os.path.join(extracted_server, name)
        if os.path.isfile(src):
            shutil.copy2(src, server_dir)

    licenses_src = os.path.join(extracted_server, "Licenses")
    if os.path.isdir(licenses_src):
        licenses_dst = os.path.join(server_dir, "Licenses")
        if os.path.isdir(licenses_dst):
            shutil.rmtree(licenses_dst)
        shutil.copytree(licenses_src, licenses_dst)

    # Copy root-level files
    for name in ("Assets.zip", "start.bat", "start.sh"):
        src = os.path.join(temp_dir, name)
        if os.path.isfile(src):
            shutil.copy2(src, resolve(name))

    shutil.rmtree(temp_dir, ignore_errors=True)
