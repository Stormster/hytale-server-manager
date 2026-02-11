"""
Server lifecycle – start / stop / status.
"""

import os
import subprocess
import threading
from typing import Callable, Optional

from src.config import BASE_DIR, SERVER_JAR, START_BAT
from src.utils.paths import resolve


_server_process: Optional[subprocess.Popen] = None
_server_thread: Optional[threading.Thread] = None


def is_installed() -> bool:
    """True if the server jar exists."""
    return os.path.isfile(resolve(SERVER_JAR))


def is_running() -> bool:
    """True if we have a tracked server process that is still alive."""
    return _server_process is not None and _server_process.poll() is None


def start(
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
) -> Optional[threading.Thread]:
    """
    Start the Hytale server via ``start.bat``.  Output is streamed line-by-line
    through *on_output*.  *on_done* fires with the exit code when the server stops.
    Returns the thread, or None if the server is already running.
    """
    global _server_process, _server_thread

    if is_running():
        if on_output:
            on_output("[Manager] Server is already running.")
        return None

    bat = resolve(START_BAT)
    if not os.path.isfile(bat):
        if on_output:
            on_output("[ERROR] start.bat not found. Update the server first.")
        if on_done:
            on_done(-1)
        return None

    def _worker():
        global _server_process
        try:
            _server_process = subprocess.Popen(
                ["cmd", "/c", bat],
                cwd=BASE_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
            )
            if on_output and _server_process.stdout:
                for line in _server_process.stdout:
                    on_output(line.rstrip("\n"))
            rc = _server_process.wait()
        except Exception as exc:
            if on_output:
                on_output(f"[ERROR] {exc}")
            rc = -1
        _server_process = None
        if on_done:
            on_done(rc)

    _server_thread = threading.Thread(target=_worker, daemon=True)
    _server_thread.start()
    return _server_thread


def stop() -> None:
    """Attempt to stop the running server gracefully."""
    global _server_process
    if _server_process and _server_process.poll() is None:
        try:
            _server_process.terminate()
        except OSError:
            pass
