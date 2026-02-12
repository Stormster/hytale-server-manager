"""
Subprocess helpers that run commands in background threads and stream
output back through callbacks.
"""

import subprocess
import threading
from typing import Callable, Optional


def run_in_thread(
    cmd: list[str],
    cwd: str,
    on_output: Optional[Callable[[str], None]] = None,
    on_done: Optional[Callable[[int], None]] = None,
    *,
    shell: bool = False,
    creationflags: int = 0,
) -> threading.Thread:
    def _worker():
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                shell=shell,
                creationflags=creationflags,
            )
            if on_output and proc.stdout:
                for line in proc.stdout:
                    on_output(line.rstrip("\n"))
            returncode = proc.wait()
        except FileNotFoundError:
            if on_output:
                on_output(f"[ERROR] Command not found: {cmd[0]}")
            returncode = -1
        except Exception as exc:
            if on_output:
                on_output(f"[ERROR] {exc}")
            returncode = -1
        if on_done:
            on_done(returncode)

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return t


def run_capture(
    cmd: list[str],
    cwd: str,
    *,
    timeout: int = 30,
    shell: bool = False,
) -> tuple[int, str]:
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            shell=shell,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return -1, "[ERROR] Command timed out."
    except FileNotFoundError:
        return -1, f"[ERROR] Command not found: {cmd[0]}"
    except Exception as exc:
        return -1, f"[ERROR] {exc}"
