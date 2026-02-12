"""
Server lifecycle – start / stop / status.

Supports multiple concurrent servers; each uses a unique game port (--bind).
Nitrado WebServer runs on game_port + 100.
"""

import os
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional

from config import SERVER_DIR, SERVER_JAR
from services.settings import get_active_instance
from utils.paths import resolve_instance, resolve_instance_by_name


@dataclass
class _ProcessEntry:
    process: subprocess.Popen
    thread: threading.Thread
    start_time: float
    game_port: int
    console_callback: Callable[[str], None]
    done_callback: Callable[[int], None]


_server_processes: dict[str, _ProcessEntry] = {}
_server_lock = threading.Lock()
_last_exit_time: Optional[float] = None
_last_exit_code: Optional[int] = None


def is_installed() -> bool:
    return os.path.isfile(resolve_instance(SERVER_JAR))


def is_installed_for(instance_name: str) -> bool:
    jar = resolve_instance_by_name(instance_name, SERVER_DIR, "HytaleServer.jar")
    return bool(jar) and os.path.isfile(jar)


def is_running() -> bool:
    with _server_lock:
        return any(p.process.poll() is None for p in _server_processes.values())


def is_instance_running(instance_name: str) -> bool:
    with _server_lock:
        entry = _server_processes.get(instance_name)
        return entry is not None and entry.process.poll() is None


def get_uptime_seconds(instance_name: Optional[str] = None) -> Optional[float]:
    """Seconds since server process started. If instance_name given, that instance only."""
    with _server_lock:
        if instance_name:
            entry = _server_processes.get(instance_name)
            if entry and entry.process.poll() is None:
                return time.time() - entry.start_time
            return None
        # First running
        for entry in _server_processes.values():
            if entry.process.poll() is None:
                return time.time() - entry.start_time
    return None


def get_last_exit_info() -> tuple[Optional[float], Optional[int]]:
    """(timestamp_float, exit_code) of the last server exit, or (None, None)."""
    return (_last_exit_time, _last_exit_code)


def get_running_instance() -> Optional[str]:
    """First running instance name (for backward compat), or None."""
    with _server_lock:
        for name, entry in _server_processes.items():
            if entry.process.poll() is None:
                return name
    return None


def get_running_instances() -> list[str]:
    """All currently running instance names."""
    with _server_lock:
        return [n for n, e in _server_processes.items() if e.process.poll() is None]


def get_running_game_port(instance_name: Optional[str] = None) -> Optional[int]:
    """Game port of running server. If instance_name given, that instance; else first."""
    with _server_lock:
        if instance_name:
            entry = _server_processes.get(instance_name)
            if entry and entry.process.poll() is None:
                return entry.game_port
            return None
        for entry in _server_processes.values():
            if entry.process.poll() is None:
                return entry.game_port
    return None


def get_all_running_ports() -> dict[str, int]:
    """{instance_name: game_port} for all running servers."""
    with _server_lock:
        return {
            name: entry.game_port
            for name, entry in _server_processes.items()
            if entry.process.poll() is None
        }


def get_resource_usage(instance_name: Optional[str] = None) -> tuple[Optional[float], Optional[float]]:
    """
    (ram_mb, cpu_percent) for the Java process child. If instance_name given, that instance.
    """
    proc = None
    with _server_lock:
        if instance_name:
            entry = _server_processes.get(instance_name)
            if entry and entry.process.poll() is None:
                proc = entry.process
        else:
            for entry in _server_processes.values():
                if entry.process.poll() is None:
                    proc = entry.process
                    break
    if not proc or not proc.pid:
        return (None, None)
    try:
        import psutil
    except ImportError:
        return (None, None)
    try:
        parent = psutil.Process(proc.pid)
        for child in parent.children(recursive=True):
            try:
                name = (child.name() or "").lower()
                if "java" in name:
                    mem = child.memory_info()
                    ram_mb = (mem.rss or 0) / (1024 * 1024)
                    cpu_percent = child.cpu_percent(interval=0.1)
                    return (round(ram_mb, 1), round(cpu_percent, 1))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass
    return (None, None)


def get_players() -> Optional[int]:
    """
    Current player count from Nitrado Query plugin.
    Returns None if server not running, plugins not installed, or query fails.
    """
    try:
        from services import nitrado_query
        return nitrado_query.query_players()
    except Exception:
        return None


def _build_java_cmd(instance_name: str, game_port: int) -> Optional[list[str]]:
    """
    Build java command with --bind for the given instance and port.
    Returns None if jar/assets not found.
    """
    from services.settings import get_root_dir
    root = get_root_dir()
    if not root or not instance_name:
        return None
    instance_dir = os.path.join(root, instance_name)
    server_dir = os.path.join(instance_dir, "Server")
    jar_path = os.path.join(server_dir, "HytaleServer.jar")
    assets_path = os.path.join(instance_dir, "Assets.zip")
    if not os.path.isfile(jar_path) or not os.path.isfile(assets_path):
        return None
    aot = os.path.join(server_dir, "HytaleServer.aot")
    args = ["java"]
    if os.path.isfile(aot):
        args.extend(["-XX:AOTCache=HytaleServer.aot"])
    args.extend([
        "-jar", "HytaleServer.jar",
        "--assets", "../Assets.zip",
        "--bind", f"0.0.0.0:{game_port}",
    ])
    return args


def _apply_staged_update(instance_name: str, on_output: Optional[Callable[[str], None]] = None) -> bool:
    staging_jar = resolve_instance_by_name(instance_name, "updater", "staging", "Server", "HytaleServer.jar")
    if not os.path.isfile(staging_jar):
        return False

    if on_output:
        on_output("[Launcher] Applying staged update...")

    staging_server = resolve_instance_by_name(instance_name, "updater", "staging", "Server")
    server_dir = resolve_instance_by_name(instance_name, SERVER_DIR)

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

    staging_root = resolve_instance_by_name(instance_name, "updater", "staging")
    inst_dir = resolve_instance_by_name(instance_name, "")
    for fname in ("Assets.zip", "start.bat", "start.sh"):
        src = os.path.join(staging_root, fname)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(inst_dir, fname))

    shutil.rmtree(staging_root, ignore_errors=True)
    return True


def start(
    instance_name: Optional[str] = None,
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
) -> Optional[threading.Thread]:
    """Start server for instance. Uses active instance if instance_name not given."""
    inst = instance_name or get_active_instance()
    if not inst:
        if on_output:
            on_output("[Manager] No instance selected.")
        if on_done:
            on_done(-1)
        return None

    with _server_lock:
        if inst in _server_processes and _server_processes[inst].process.poll() is None:
            if on_output:
                on_output("[Manager] That instance is already running.")
            if on_done:
                on_done(-1)
            return None

    from services.ports import assign_port_for_instance
    from services.nitrado_plugins import set_webserver_port_from_game
    from services.settings import get_root_dir

    game_port, webserver_port = assign_port_for_instance(inst)
    root = get_root_dir()
    server_dir = os.path.join(root, inst, "Server") if root else resolve_instance(SERVER_DIR)
    set_webserver_port_from_game(server_dir, game_port)

    start_cmd = _build_java_cmd(inst, game_port)
    if not start_cmd:
        if on_output:
            on_output("[ERROR] HytaleServer.jar or Assets.zip not found. Install or update first.")
        if on_done:
            on_done(-1)
        return None

    instance_dir = os.path.join(root, inst) if root else resolve_instance("")
    cwd = os.path.join(instance_dir, "Server")

    def _worker():
        global _last_exit_time, _last_exit_code
        rc = 0

        while True:
            applied_update = _apply_staged_update(inst, on_output)

            if on_output:
                on_output(f"[Launcher] Starting {inst} on port {game_port}...")
                on_output(f"[Launcher] Running: {' '.join(start_cmd)}")

            creation_flags = 0
            if sys.platform == "win32":
                creation_flags = getattr(
                    subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200
                ) | getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

            try:
                process = subprocess.Popen(
                    start_cmd,
                    cwd=cwd,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    creationflags=creation_flags,
                )
                entry = _ProcessEntry(
                    process=process,
                    thread=threading.current_thread(),
                    start_time=time.time(),
                    game_port=game_port,
                    console_callback=on_output or (lambda _: None),
                    done_callback=on_done or (lambda _: None),
                )
                with _server_lock:
                    _server_processes[inst] = entry

                if on_output and process.stdout:
                    for line in process.stdout:
                        on_output(line.rstrip("\n"))
                rc = process.wait()
            except FileNotFoundError:
                if on_output:
                    on_output("[ERROR] Could not run Java. Install Java 25+ from https://adoptium.net")
                rc = -1
                break
            except Exception as exc:
                if on_output:
                    on_output(f"[ERROR] {exc}")
                rc = -1
                break
            finally:
                with _server_lock:
                    _server_processes.pop(inst, None)

            if rc == 8:
                if on_output:
                    on_output("[Launcher] Server requested restart for update. Restarting...")
                continue

            if rc != 0 and applied_update:
                if on_output:
                    on_output("")
                    on_output(f"[Launcher] ERROR: Server exited with code {rc} after update.")
            break

        _last_exit_time = time.time()
        _last_exit_code = rc
        if on_done:
            on_done(rc)

    th = threading.Thread(target=_worker, daemon=True)
    th.start()
    return th


def send_command(text: str, instance_name: Optional[str] = None) -> bool:
    """Send text to server stdin. If instance_name None, use active instance."""
    inst = instance_name or get_active_instance()
    with _server_lock:
        entry = _server_processes.get(inst) if inst else None
        if not entry or entry.process.poll() is not None or not entry.process.stdin:
            return False
        proc = entry.process
    try:
        proc.stdin.write(text)
        proc.stdin.flush()
        return True
    except (OSError, BrokenPipeError):
        return False


def stop_all() -> None:
    """Stop all running server instances."""
    for name in list(get_running_instances()):
        stop(instance_name=name)


def stop(instance_name: Optional[str] = None) -> None:
    """Stop server. If instance_name None, stop active instance's server."""
    inst = instance_name or get_active_instance()
    with _server_lock:
        entry = _server_processes.get(inst) if inst else None
        if not entry or entry.process.poll() is not None:
            return
        proc = entry.process

    send_command("stop\n", inst)
    try:
        proc.wait(timeout=10)
        with _server_lock:
            _server_processes.pop(inst, None)
        return
    except subprocess.TimeoutExpired:
        pass

    try:
        pid = proc.pid
        if sys.platform == "win32" and pid:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                capture_output=True,
                timeout=5,
            )
        else:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    except (OSError, subprocess.TimeoutExpired):
        try:
            proc.kill()
        except OSError:
            pass
    with _server_lock:
        _server_processes.pop(inst, None)
