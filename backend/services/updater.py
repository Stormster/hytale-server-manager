"""
Version checking, downloading updates, and extracting them into the Server folder.
"""

import os
import re
import shutil
import zipfile
import threading
from typing import Callable, Optional

from config import (
    VERSION_FILE,
    PATCHLINE_FILE,
    SERVER_DIR,
)
from utils.paths import resolve_instance
from services import downloader as dl
from services import backup as bk


def read_installed_version() -> str:
    vf = resolve_instance(VERSION_FILE)
    if os.path.isfile(vf):
        with open(vf, "r") as f:
            return f.read().strip() or "unknown"
    return "unknown"


def read_installed_patchline() -> str:
    pf = resolve_instance(PATCHLINE_FILE)
    if os.path.isfile(pf):
        with open(pf, "r") as f:
            return f.read().strip() or "release"
    return "release"


def _save_version(version: str, patchline: str) -> None:
    with open(resolve_instance(VERSION_FILE), "w") as f:
        f.write(version)
    with open(resolve_instance(PATCHLINE_FILE), "w") as f:
        f.write(patchline)


def check_remote_versions() -> dict:
    result = {}
    for pl in ("release", "pre-release"):
        rc, out = dl.print_version(pl)
        result[pl] = out.strip() if rc == 0 and out and not out.startswith("[ERROR]") else None
    return result


def version_greater(a: str, b: str) -> bool:
    if not a:
        return False
    if not b or b == "unknown":
        return True
    return a > b


def get_update_status() -> dict:
    iv = read_installed_version()
    ip = read_installed_patchline()
    remote = check_remote_versions()
    rr = remote.get("release")
    rp = remote.get("pre-release")

    if ip == "release":
        update_available = version_greater(rr, iv) if rr else False
    else:
        update_available = version_greater(rp, iv) if rp else False

    can_switch_release = (ip == "pre-release" and rr is not None)
    can_switch_prerelease = (ip == "release" and rp is not None)

    return {
        "installed_version": iv,
        "installed_patchline": ip,
        "remote_release": rr,
        "remote_prerelease": rp,
        "update_available": update_available,
        "can_switch_release": can_switch_release,
        "can_switch_prerelease": can_switch_prerelease,
    }


# ---------------------------------------------------------------------------
# Progress parsing
# ---------------------------------------------------------------------------

_PROGRESS_RE = re.compile(r'(\d+\.?\d*)%\s*\(([^)]+)\)')


def parse_progress(line: str) -> tuple[float, str] | None:
    m = _PROGRESS_RE.search(line)
    if m:
        return float(m.group(1)), m.group(2).strip()
    return None


def _make_dl_output_handler(
    on_status: Optional[Callable[[str], None]],
    on_progress: Optional[Callable[[float, str], None]],
) -> Callable[[str], None]:
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
    def _worker():
        try:
            zip_path = resolve_instance("temp_update.zip")
            server_dir = resolve_instance(SERVER_DIR)

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

            rc, new_ver = dl.print_version(patchline)
            if rc != 0 or not new_ver:
                new_ver = "unknown"

            if os.path.isdir(server_dir):
                if on_status:
                    on_status("Creating backup before update...")
                old_ver = read_installed_version()
                old_pl = read_installed_patchline()
                bk.create_backup(
                    label=f"update from {old_ver} ({old_pl}) to {new_ver} ({patchline})"
                )

            if on_status:
                on_status("Extracting update...")
            _extract_server_zip(zip_path, server_dir)

            _save_version(new_ver, patchline)

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
    def _worker():
        try:
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

            zip_path = resolve_instance("first_time_setup.zip")
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

            rc, new_ver = dl.print_version(patchline)
            if rc != 0 or not new_ver:
                new_ver = "unknown"

            if on_status:
                on_status("Extracting server files...")
            server_dir = resolve_instance(SERVER_DIR)
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


def _extract_server_zip(zip_path: str, server_dir: str) -> None:
    temp_dir = resolve_instance("temp_extract")
    if os.path.isdir(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)

    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(temp_dir)

    extracted_server = os.path.join(temp_dir, "Server")
    if not os.path.isdir(extracted_server):
        shutil.rmtree(temp_dir)
        raise RuntimeError("Unexpected zip structure – no Server folder found.")

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

    for name in ("Assets.zip", "start.bat", "start.sh"):
        src = os.path.join(temp_dir, name)
        if os.path.isfile(src):
            shutil.copy2(src, resolve_instance(name))

    shutil.rmtree(temp_dir, ignore_errors=True)
