"""
Server lifecycle – start / stop / status.

Hybrid approach: we implement the full launch logic natively (staged updates,
AOT cache, default args, restart-on-exit-8) but also parse ``start.bat`` if
present to pick up any new JVM flags or server arguments that future Hytale
updates might introduce.
"""

import os
import re
import shutil
import subprocess
import threading
from typing import Callable, Optional

from src.config import BASE_DIR, SERVER_DIR, SERVER_JAR
from src.utils.paths import resolve


_server_process: Optional[subprocess.Popen] = None
_server_thread: Optional[threading.Thread] = None


# ---------------------------------------------------------------------------
# Status helpers
# ---------------------------------------------------------------------------

def is_installed() -> bool:
    """True if the server jar exists."""
    return os.path.isfile(resolve(SERVER_JAR))


def is_running() -> bool:
    """True if we have a tracked server process that is still alive."""
    return _server_process is not None and _server_process.poll() is None


# ---------------------------------------------------------------------------
# Parse start.bat for forward-compatibility
# ---------------------------------------------------------------------------

def _parse_start_bat() -> dict:
    """
    Read ``start.bat`` and extract JVM args / server args so we stay in sync
    with whatever Hytale ships.  Returns a dict with:

    - ``jvm_args``: list of extra JVM flags (excluding AOT, which we detect ourselves)
    - ``server_args``: list of server arguments (e.g. --assets, --backup, ...)
    """
    result = {"jvm_args": [], "server_args": []}
    bat = resolve("start.bat")
    if not os.path.isfile(bat):
        return result

    try:
        with open(bat, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        # Extract DEFAULT_ARGS line:  set DEFAULT_ARGS=--assets ../Assets.zip ...
        m = re.search(r'set\s+DEFAULT_ARGS\s*=\s*(.+)', content, re.IGNORECASE)
        if m:
            raw = m.group(1).strip()
            # Remove trailing %* or batch variable references
            raw = re.sub(r'%\*', '', raw).strip()
            if raw:
                result["server_args"] = raw.split()

        # Extract any additional JVM_ARGS beyond AOT (future-proofing)
        # We look for all `set JVM_ARGS=...` or `set "JVM_ARGS=..."` lines
        for m in re.finditer(r'set\s+"?JVM_ARGS\s*=\s*(.+?)"?\s*$', content, re.IGNORECASE | re.MULTILINE):
            val = m.group(1).strip()
            if val and "AOTCache" not in val:
                result["jvm_args"].extend(val.split())

    except Exception:
        pass  # If parsing fails, we fall back to our defaults

    return result


# ---------------------------------------------------------------------------
# Staged update application
# ---------------------------------------------------------------------------

def _apply_staged_update(on_output: Optional[Callable[[str], None]] = None) -> bool:
    """
    Check for and apply staged updates from ``updater/staging/``.
    Returns True if an update was applied.
    """
    staging_jar = resolve("updater", "staging", "Server", "HytaleServer.jar")
    if not os.path.isfile(staging_jar):
        return False

    if on_output:
        on_output("[Launcher] Applying staged update...")

    staging_server = resolve("updater", "staging", "Server")
    server_dir = resolve(SERVER_DIR)

    # Copy server binaries (preserve config/saves/mods)
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

    # Copy root-level files
    staging_root = resolve("updater", "staging")
    for name in ("Assets.zip", "start.bat", "start.sh"):
        src = os.path.join(staging_root, name)
        if os.path.isfile(src):
            shutil.copy2(src, resolve(name))

    # Cleanup staging
    shutil.rmtree(staging_root, ignore_errors=True)
    return True


# ---------------------------------------------------------------------------
# Server launch
# ---------------------------------------------------------------------------

_DEFAULT_SERVER_ARGS = [
    "--assets", "../Assets.zip",
    "--backup",
    "--backup-dir", "backups",
    "--backup-frequency", "30",
]


def start(
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
) -> Optional[threading.Thread]:
    """
    Start the Hytale server natively.

    Replicates the full ``start.bat`` logic:
    1. Apply staged updates if present
    2. Detect AOT cache
    3. Launch ``java -jar HytaleServer.jar`` with correct args
    4. Auto-restart on exit code 8 (update restart)

    Output is streamed line-by-line through *on_output*.
    *on_done* fires with the final exit code when the server stops.
    Returns the thread, or None if the server is already running.
    """
    global _server_process, _server_thread

    if is_running():
        if on_output:
            on_output("[Manager] Server is already running.")
        return None

    server_dir = resolve(SERVER_DIR)
    jar_path = resolve(SERVER_JAR)

    if not os.path.isfile(jar_path):
        if on_output:
            on_output("[ERROR] HytaleServer.jar not found. Install or update the server first.")
        if on_done:
            on_done(-1)
        return None

    def _worker():
        global _server_process
        rc = 0

        while True:
            # --- Step 1: Apply staged updates ---
            applied_update = _apply_staged_update(on_output)

            # --- Step 2: Build JVM args ---
            jvm_args = []

            # AOT cache detection
            aot_path = os.path.join(server_dir, "HytaleServer.aot")
            if os.path.isfile(aot_path):
                if on_output:
                    on_output("[Launcher] Using AOT cache for faster startup")
                jvm_args.append(f"-XX:AOTCache=HytaleServer.aot")

            # --- Step 3: Determine server args ---
            # Parse start.bat for any args Hytale may have changed
            parsed = _parse_start_bat()
            server_args = parsed["server_args"] if parsed["server_args"] else list(_DEFAULT_SERVER_ARGS)
            extra_jvm = parsed["jvm_args"]
            jvm_args.extend(extra_jvm)

            # --- Step 4: Launch ---
            cmd = ["java"] + jvm_args + ["-jar", "HytaleServer.jar"] + server_args

            if on_output:
                on_output(f"[Launcher] Starting: {' '.join(cmd)}")

            try:
                _server_process = subprocess.Popen(
                    cmd,
                    cwd=server_dir,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
                )
                if on_output and _server_process.stdout:
                    for line in _server_process.stdout:
                        on_output(line.rstrip("\n"))
                rc = _server_process.wait()
            except FileNotFoundError:
                if on_output:
                    on_output("[ERROR] Java not found. Install Java 25+ from https://adoptium.net")
                rc = -1
                break
            except Exception as exc:
                if on_output:
                    on_output(f"[ERROR] {exc}")
                rc = -1
                break

            # --- Step 5: Handle exit code 8 (restart for update) ---
            if rc == 8:
                if on_output:
                    on_output("[Launcher] Server requested restart for update. Restarting...")
                continue

            # --- Step 6: Post-update crash warning ---
            if rc != 0 and applied_update:
                if on_output:
                    on_output("")
                    on_output(f"[Launcher] ERROR: Server exited with code {rc} after update.")
                    on_output("[Launcher] This may indicate the update failed to start correctly.")
                    on_output("[Launcher] Previous files may be in updater/backup/ for rollback.")
            break

        _server_process = None
        if on_done:
            on_done(rc)

    _server_thread = threading.Thread(target=_worker, daemon=True)
    _server_thread.start()
    return _server_thread


# ---------------------------------------------------------------------------
# Stop
# ---------------------------------------------------------------------------

def stop() -> None:
    """Attempt to stop the running server gracefully."""
    global _server_process
    if _server_process and _server_process.poll() is None:
        try:
            _server_process.terminate()
        except OSError:
            pass
