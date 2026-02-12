"""
Server lifecycle – start / stop / status.

Uses the instance's start.bat (Windows) or start.sh (Unix) directly so we
follow Hytale's launch logic exactly; each release may change how the server
should be started.
"""

import os
import shutil
import subprocess
import sys
import threading
import time
from typing import Callable, Optional

from config import SERVER_DIR, SERVER_JAR
from utils.paths import resolve_instance


_server_process: Optional[subprocess.Popen] = None
_server_thread: Optional[threading.Thread] = None
_server_start_time: Optional[float] = None
_last_exit_time: Optional[float] = None
_last_exit_code: Optional[int] = None


def is_installed() -> bool:
    return os.path.isfile(resolve_instance(SERVER_JAR))


def is_running() -> bool:
    return _server_process is not None and _server_process.poll() is None


def get_uptime_seconds() -> Optional[float]:
    """Seconds since server process started, or None if not running."""
    if not is_running() or _server_start_time is None:
        return None
    return time.time() - _server_start_time


def get_last_exit_info() -> tuple[Optional[float], Optional[int]]:
    """(timestamp_float, exit_code) of the last server exit, or (None, None)."""
    return (_last_exit_time, _last_exit_code)


def get_resource_usage() -> tuple[Optional[float], Optional[float]]:
    """
    (ram_mb, cpu_percent) for the Java process child of the server.
    Returns (None, None) if not running or psutil unavailable.
    """
    if not is_running() or not _server_process or not _server_process.pid:
        return (None, None)
    try:
        import psutil
    except ImportError:
        return (None, None)
    try:
        parent = psutil.Process(_server_process.pid)
        for child in parent.children(recursive=True):
            try:
                name = (child.name() or "").lower()
                if "java" in name:
                    mem = child.memory_info()
                    ram_mb = (mem.rss or 0) / (1024 * 1024)
                    cpu_percent = child.cpu_percent(interval=None)
                    return (round(ram_mb, 1), round(cpu_percent, 1))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass
    return (None, None)


def get_players() -> Optional[int]:
    """
    Current player count. Hytale does not expose a vanilla query protocol;
    third-party plugins (e.g. Nitrado Query Plugin) are required.
    Returns None until such integration exists.
    """
    return None


def _get_start_script_cmd() -> Optional[list[str]]:
    """Return the command to run the instance's start script, or None if not found."""
    instance_dir = resolve_instance("")
    if not instance_dir:
        return None

    if sys.platform == "win32":
        bat = os.path.join(instance_dir, "start.bat")
        if os.path.isfile(bat):
            return ["cmd", "/c", os.path.basename(bat)]
    else:
        sh = os.path.join(instance_dir, "start.sh")
        if os.path.isfile(sh):
            return ["bash", os.path.basename(sh)]

    return None


def _apply_staged_update(on_output: Optional[Callable[[str], None]] = None) -> bool:
    staging_jar = resolve_instance("updater", "staging", "Server", "HytaleServer.jar")
    if not os.path.isfile(staging_jar):
        return False

    if on_output:
        on_output("[Launcher] Applying staged update...")

    staging_server = resolve_instance("updater", "staging", "Server")
    server_dir = resolve_instance(SERVER_DIR)

    shutil.copy2(staging_jar, server_dir)

    aot_src = os.path.join(staging_server, "HytaleServer.aot")
    if os.path.isfile(aot_src):
        shutil.copy2(aot_src, server_dir)

    licenses_src = os.path.join(staging_server, "Licenses")
    if os.path.isdir(licenses_src):
        licenses_dst = os.path.join(server_dir, "Licenses")
        if os.path.isdir(licenses_dst):
            shutil.rmtree(licenses_dst)
        shutil.copytree(licenses_src, licenses_dst)

    staging_root = resolve_instance("updater", "staging")
    for name in ("Assets.zip", "start.bat", "start.sh"):
        src = os.path.join(staging_root, name)
        if os.path.isfile(src):
            shutil.copy2(src, resolve_instance(name))

    shutil.rmtree(staging_root, ignore_errors=True)
    return True


def start(
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
) -> Optional[threading.Thread]:
    global _server_process, _server_thread

    if is_running():
        if on_output:
            on_output("[Manager] Server is already running.")
        return None

    instance_dir = resolve_instance("")
    server_dir = resolve_instance(SERVER_DIR)
    jar_path = resolve_instance(SERVER_JAR)

    if not os.path.isfile(jar_path):
        if on_output:
            on_output("[ERROR] HytaleServer.jar not found. Install or update the server first.")
        if on_done:
            on_done(-1)
        return None

    start_cmd = _get_start_script_cmd()
    if not start_cmd:
        if on_output:
            on_output("[ERROR] start.bat / start.sh not found. Reinstall the server.")
        if on_done:
            on_done(-1)
        return None

    def _worker():
        global _server_process, _server_start_time, _last_exit_time, _last_exit_code
        rc = 0

        while True:
            applied_update = _apply_staged_update(on_output)

            if on_output:
                on_output(f"[Launcher] Running: {' '.join(start_cmd)}")

            creation_flags = 0
            if sys.platform == "win32":
                creation_flags = getattr(
                    subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200
                ) | getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

            try:
                _server_process = subprocess.Popen(
                    start_cmd,
                    cwd=instance_dir,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    creationflags=creation_flags,
                )
                _server_start_time = time.time()
                if on_output and _server_process.stdout:
                    for line in _server_process.stdout:
                        on_output(line.rstrip("\n"))
                rc = _server_process.wait()
            except FileNotFoundError:
                if on_output:
                    on_output("[ERROR] Could not run start script. Install Java 25+ from https://adoptium.net")
                rc = -1
                break
            except Exception as exc:
                if on_output:
                    on_output(f"[ERROR] {exc}")
                rc = -1
                break

            if rc == 8:
                if on_output:
                    on_output("[Launcher] Server requested restart for update. Restarting...")
                continue

            if rc != 0 and applied_update:
                if on_output:
                    on_output("")
                    on_output(f"[Launcher] ERROR: Server exited with code {rc} after update.")
                    on_output("[Launcher] This may indicate the update failed to start correctly.")
                    on_output("[Launcher] Previous files may be in updater/backup/ for rollback.")
            break

        _last_exit_time = time.time()
        _last_exit_code = rc
        _server_process = None
        if on_done:
            on_done(rc)

    _server_thread = threading.Thread(target=_worker, daemon=True)
    _server_thread.start()
    return _server_thread


def send_command(text: str) -> bool:
    """Send text to the server's stdin. Returns False if not running or no stdin."""
    global _server_process
    if not _server_process or _server_process.poll() is not None:
        return False
    if not _server_process.stdin:
        return False
    try:
        _server_process.stdin.write(text)
        _server_process.stdin.flush()
        return True
    except (OSError, BrokenPipeError):
        return False


def stop() -> None:
    global _server_process
    if not _server_process or _server_process.poll() is not None:
        return

    # Try graceful shutdown first: send /stop to server console
    send_command("stop\n")
    try:
        _server_process.wait(timeout=10)
        return
    except subprocess.TimeoutExpired:
        pass

    # Force kill if still running after 10 seconds
    try:
        pid = _server_process.pid
        if sys.platform == "win32" and pid:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                capture_output=True,
                timeout=5,
            )
        else:
            _server_process.terminate()
            try:
                _server_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                _server_process.kill()
    except (OSError, subprocess.TimeoutExpired):
        try:
            _server_process.kill()
        except OSError:
            pass
