"""
Version checking, downloading updates, and extracting them into the Server folder.
"""

import os
import re
import shutil
import threading
import time
import zipfile
from typing import Callable, Optional

_update_in_progress: Optional[str] = None
_update_lock = threading.Lock()


def get_update_in_progress() -> Optional[str]:
    """Instance name being updated, or None if no update in progress."""
    with _update_lock:
        return _update_in_progress


def _set_update_in_progress(instance_name: Optional[str]) -> None:
    with _update_lock:
        global _update_in_progress
        _update_in_progress = instance_name


from config import (
    VERSION_FILE,
    PATCHLINE_FILE,
    SERVER_DIR,
)
from utils.paths import resolve_instance, resolve_instance_by_name, resolve_cache, ensure_dir
from services import downloader as dl
from services import backup as bk
from services import nitrado_plugins as nitrado


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


def version_less(a: str, b: str) -> bool:
    """True if a is older than b (a < b)."""
    if not a or a == "unknown":
        return True
    if not b or b == "unknown":
        return False
    return a < b


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
    switch_to_release_is_downgrade = can_switch_release and version_less(rr, iv)
    switch_to_prerelease_is_downgrade = can_switch_prerelease and version_less(rp, iv)

    return {
        "installed_version": iv,
        "installed_patchline": ip,
        "remote_release": rr,
        "remote_prerelease": rp,
        "update_available": update_available,
        "can_switch_release": can_switch_release,
        "can_switch_prerelease": can_switch_prerelease,
        "switch_to_release_is_downgrade": switch_to_release_is_downgrade,
        "switch_to_prerelease_is_downgrade": switch_to_prerelease_is_downgrade,
    }


def get_all_instances_update_status() -> dict:
    """Check update availability for all installed instances. Fetches remote versions once."""
    from services import instances as inst_svc

    remote = check_remote_versions()
    rr = remote.get("release")
    rp = remote.get("pre-release")

    result = {}
    for inst in inst_svc.list_instances():
        if not inst.get("installed"):
            continue
        iv = inst.get("version") or "unknown"
        ip = inst.get("patchline") or "release"
        if ip == "release":
            update_available = version_greater(rr, iv) if rr else False
        else:
            update_available = version_greater(rp, iv) if rp else False
        can_switch_release = ip == "pre-release" and rr is not None
        can_switch_prerelease = ip == "release" and rp is not None
        switch_to_release_is_downgrade = can_switch_release and version_less(rr, iv)
        switch_to_prerelease_is_downgrade = can_switch_prerelease and version_less(rp, iv)
        result[inst["name"]] = {
            "update_available": update_available,
            "installed_version": iv,
            "installed_patchline": ip,
            "can_switch_release": can_switch_release,
            "can_switch_prerelease": can_switch_prerelease,
            "switch_to_release_is_downgrade": switch_to_release_is_downgrade,
            "switch_to_prerelease_is_downgrade": switch_to_prerelease_is_downgrade,
        }

    return {
        "instances": result,
        "remote_release": rr,
        "remote_prerelease": rp,
    }


# ---------------------------------------------------------------------------
# Download cache – avoid re-downloading the same release for multiple instances
# ---------------------------------------------------------------------------

CACHE_ZIP = "server.zip"
CACHE_VERSION_FILE = "version.txt"


def _get_cached_zip(patchline: str) -> str | None:
    """Return path to cached zip if it exists and matches remote latest, else None."""
    cache_dir = resolve_cache(patchline)
    zip_path = os.path.join(cache_dir, CACHE_ZIP)
    version_path = os.path.join(cache_dir, CACHE_VERSION_FILE)
    if not os.path.isfile(zip_path) or not os.path.isfile(version_path):
        return None
    rc, remote = dl.print_version(patchline)
    if rc != 0 or not remote:
        return None
    remote = remote.strip()
    with open(version_path, "r") as f:
        cached_ver = f.read().strip()
    return zip_path if cached_ver == remote else None


def _ensure_cached_server(
    patchline: str,
    on_status: Optional[Callable[[str], None]] = None,
    on_progress: Optional[Callable[[float, str], None]] = None,
) -> str:
    """Download to cache if needed. Returns path to cached zip. Raises on failure."""
    cached = _get_cached_zip(patchline)
    if cached:
        if on_status:
            on_status("Using cached download...")
        return cached

    cache_dir = resolve_cache(patchline)
    ensure_dir(cache_dir)
    zip_path = os.path.join(cache_dir, CACHE_ZIP)

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
        raise RuntimeError("Download failed. Auth may have expired – try refreshing auth.")

    rc, new_ver = dl.print_version(patchline)
    if rc != 0 or not new_ver:
        new_ver = "unknown"

    version_path = os.path.join(cache_dir, CACHE_VERSION_FILE)
    with open(version_path, "w") as f:
        f.write(new_ver)

    return zip_path


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

def _extract_server_zip_to_instance(zip_path: str, instance_dir: str) -> None:
    """Extract server zip into the given instance directory."""
    temp_dir = os.path.join(instance_dir, "temp_extract")
    if os.path.isdir(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir)

    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(temp_dir)

    extracted_server = os.path.join(temp_dir, "Server")
    if not os.path.isdir(extracted_server):
        shutil.rmtree(temp_dir)
        raise RuntimeError("Unexpected zip structure – no Server folder found.")

    server_dir = os.path.join(instance_dir, SERVER_DIR)
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
            shutil.copy2(src, os.path.join(instance_dir, name))

    shutil.rmtree(temp_dir, ignore_errors=True)


def _read_version_for_instance(instance_name: str) -> str:
    vf = resolve_instance_by_name(instance_name, VERSION_FILE)
    if os.path.isfile(vf):
        with open(vf, "r") as f:
            return f.read().strip() or "unknown"
    return "unknown"


def _read_patchline_for_instance(instance_name: str) -> str:
    pf = resolve_instance_by_name(instance_name, PATCHLINE_FILE)
    if os.path.isfile(pf):
        with open(pf, "r") as f:
            return f.read().strip() or "release"
    return "release"


def _save_version_for_instance(instance_name: str, version: str, patchline: str) -> None:
    vf = resolve_instance_by_name(instance_name, VERSION_FILE)
    pf = resolve_instance_by_name(instance_name, PATCHLINE_FILE)
    os.makedirs(os.path.dirname(vf), exist_ok=True)
    with open(vf, "w") as f:
        f.write(version)
    with open(pf, "w") as f:
        f.write(patchline)


def perform_update(
    patchline: str = "release",
    on_status: Optional[Callable[[str], None]] = None,
    on_progress: Optional[Callable[[float, str], None]] = None,
    on_done: Optional[Callable[[bool, str], None]] = None,
    graceful: bool = False,
) -> threading.Thread:
    def _worker():
        from services.settings import get_active_instance, get_root_dir
        from services import server as server_svc

        instance_name = get_active_instance()
        root = get_root_dir()
        was_running = False
        try:
            _set_update_in_progress(instance_name or "")

            if server_svc.is_running():
                was_running = True
                if on_status:
                    on_status("Stopping server for update...")
                if graceful:
                    if not _graceful_shutdown_with_warning(instance_name, minutes=1, on_status=on_status):
                        _set_update_in_progress(None)
                        if on_done:
                            on_done(False, "Failed to stop server.")
                        return
                else:
                    server_svc.stop(instance_name=instance_name)
                    for _ in range(30):
                        if not server_svc.is_instance_running(instance_name):
                            break
                        time.sleep(1)
                    if server_svc.is_instance_running(instance_name):
                        _set_update_in_progress(None)
                        if on_done:
                            on_done(False, "Server did not stop in time.")
                        return

            zip_path = _ensure_cached_server(patchline, on_status=on_status, on_progress=on_progress)

            rc, new_ver = dl.print_version(patchline)
            if rc != 0 or not new_ver:
                new_ver = "unknown"

            instance_dir = os.path.join(root, instance_name) if root and instance_name else ""
            server_dir = os.path.join(instance_dir, SERVER_DIR)

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
            _extract_server_zip_to_instance(zip_path, instance_dir)

            _save_version_for_instance(instance_name, new_ver, patchline)

            if was_running and instance_name:
                if on_status:
                    on_status("Restarting server...")
                server_svc.start(instance_name=instance_name)

            if on_done:
                on_done(True, f"Update complete! Version: {new_ver}")
        except Exception as exc:
            if on_done:
                on_done(False, str(exc))
        finally:
            _set_update_in_progress(None)

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
        from services.settings import get_active_instance
        from services import server as server_svc

        instance_name = get_active_instance()
        try:
            _set_update_in_progress(instance_name or "")

            if server_svc.is_running():
                _set_update_in_progress(None)
                if on_done:
                    on_done(False, "Stop the server before updating.")
                return

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

            zip_path = _ensure_cached_server(patchline, on_status=on_status, on_progress=on_progress)

            rc, new_ver = dl.print_version(patchline)
            if rc != 0 or not new_ver:
                new_ver = "unknown"

            if on_status:
                on_status("Extracting server files...")
            from services.settings import get_root_dir
            instance_dir = os.path.join(get_root_dir(), instance_name)
            os.makedirs(os.path.join(instance_dir, SERVER_DIR), exist_ok=True)
            _extract_server_zip_to_instance(zip_path, instance_dir)

            # Install Nitrado plugins on first-time setup (new server has no mods yet)
            nitrado.install_nitrado_plugins(os.path.join(instance_dir, SERVER_DIR), on_status=on_status)

            _save_version_for_instance(instance_name, new_ver, patchline)

            if on_done:
                on_done(True, f"Setup complete! Version: {new_ver}")
        except Exception as exc:
            if on_done:
                on_done(False, str(exc))
        finally:
            _set_update_in_progress(None)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return t


def _graceful_shutdown_with_warning(
    instance_name: str,
    minutes: int = 1,
    on_status: Optional[Callable[[str], None]] = None,
) -> bool:
    """Announce shutdown via /say, wait, then stop. Returns True if server stopped.
    minutes=1: single 1-min warning. minutes=10: 10, 5, 2, 1 min, 30s, 10s."""
    from services import server as server_svc

    if not server_svc.is_instance_running(instance_name):
        return True

    msg = "Server will shut down in {remaining} to update. Please update your client to rejoin."

    if minutes <= 1:
        server_svc.send_command(
            f'/say {msg.format(remaining="1 minute")}\n',
            instance_name=instance_name,
        )
        deadline = time.time() + 60
    else:
        schedule = [
            (600, "10 minutes"),
            (300, "5 minutes"),
            (120, "2 minutes"),
            (60, "1 minute"),
            (30, "30 seconds"),
            (10, "10 seconds"),
        ]
        def _say(remaining: str) -> None:
            server_svc.send_command(
                f'/say {msg.format(remaining=remaining)}\n',
                instance_name=instance_name,
            )
        _say("10 minutes")
        next_idx = 1
        deadline = time.time() + 600
        while next_idx < len(schedule) and time.time() < deadline:
            if not server_svc.is_instance_running(instance_name):
                return True
            remaining_sec = int(deadline - time.time())
            target_sec, label = schedule[next_idx]
            if remaining_sec <= target_sec:
                _say(label)
                next_idx += 1
            time.sleep(1)
        while time.time() < deadline:
            if not server_svc.is_instance_running(instance_name):
                return True
            time.sleep(1)

    if server_svc.is_instance_running(instance_name):
        server_svc.stop(instance_name=instance_name)
        for _ in range(30):
            if not server_svc.is_instance_running(instance_name):
                return True
            time.sleep(1)
        return False
    return True


def perform_update_all(
    on_status: Optional[Callable[[str], None]] = None,
    on_progress: Optional[Callable[[float, str], None]] = None,
    on_done: Optional[Callable[[bool, str], None]] = None,
    instance_filter: Optional[list[str]] = None,
    graceful: bool = False,
    graceful_minutes: int = 1,
) -> threading.Thread:
    """Update installed instances that have updates available. Uses cache – downloads each version once.
    If instance_filter is provided, only update those instances. Otherwise update all with updates."""
    def _worker():
        from services.settings import get_root_dir
        from services import server as server_svc

        try:
            _set_update_in_progress("__update_all__")
            root = get_root_dir()
            if not root:
                if on_done:
                    on_done(False, "No servers folder configured.")
                return

            status = get_all_instances_update_status()
            instances_data = status.get("instances", {})
            to_update = [
                (name, info)
                for name, info in instances_data.items()
                if info.get("update_available")
                and (instance_filter is None or name in instance_filter)
            ]
            if not to_update:
                if on_done:
                    on_done(True, "All instances are already up to date.")
                return

            # Group by patchline to minimize downloads
            by_patchline: dict[str, list[tuple[str, dict]]] = {}
            for name, info in to_update:
                pl = info.get("installed_patchline") or "release"
                by_patchline.setdefault(pl, []).append((name, info))

            success_count = 0
            errors: list[str] = []
            updated_instances: list[str] = []
            was_running_before: set[str] = set()

            for patchline, items in by_patchline.items():
                try:
                    zip_path = _ensure_cached_server(patchline, on_status=on_status, on_progress=on_progress)
                except Exception as exc:
                    errors.append(f"Download failed ({patchline}): {exc}")
                    continue

                rc, new_ver = dl.print_version(patchline)
                if rc != 0 or not new_ver:
                    new_ver = "unknown"

                for instance_name, info in items:
                    if server_svc.is_instance_running(instance_name):
                        was_running_before.add(instance_name)
                        if on_status:
                            on_status(f"{instance_name}: stopping for update...")
                        if graceful:
                            if not _graceful_shutdown_with_warning(
                                instance_name, minutes=graceful_minutes, on_status=on_status
                            ):
                                errors.append(f"{instance_name}: failed to stop server")
                                continue
                        else:
                            server_svc.stop(instance_name=instance_name)
                            for _ in range(30):
                                if not server_svc.is_instance_running(instance_name):
                                    break
                                time.sleep(1)
                            if server_svc.is_instance_running(instance_name):
                                errors.append(f"{instance_name}: did not stop in time")
                                continue

                    instance_dir = os.path.join(root, instance_name)
                    server_dir = os.path.join(instance_dir, SERVER_DIR)

                    try:
                        if on_status:
                            on_status(f"Updating {instance_name}...")
                        if os.path.isdir(server_dir):
                            old_ver = _read_version_for_instance(instance_name)
                            old_pl = _read_patchline_for_instance(instance_name)
                            bk.create_backup_for_instance(
                                instance_name,
                                label=f"update from {old_ver} ({old_pl}) to {new_ver} ({patchline})",
                            )
                        _extract_server_zip_to_instance(zip_path, instance_dir)
                        _save_version_for_instance(instance_name, new_ver, patchline)
                        success_count += 1
                        updated_instances.append(instance_name)
                    except Exception as exc:
                        errors.append(f"{instance_name}: {exc}")

            for inst in updated_instances:
                if inst in was_running_before:
                    if on_status:
                        on_status(f"Restarting {inst}...")
                    server_svc.start(instance_name=inst)

            msg = f"Updated {success_count} instance(s)."
            if errors:
                msg += " " + "; ".join(errors)
            if on_done:
                on_done(success_count > 0, msg)
        except Exception as exc:
            if on_done:
                on_done(False, str(exc))
        finally:
            _set_update_in_progress(None)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return t
