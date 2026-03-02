"""
In-memory ring buffer for backend logs. Used to collect debug output when the
frontend receives no SSE events (e.g. streaming broken on some platforms).
"""

import sys
import threading
import time
from collections import deque
from typing import TextIO

_MAX_LINES = 500
_buffer: deque[tuple[float, str]] = deque(maxlen=_MAX_LINES)
_lock = threading.Lock()
_original_stderr: TextIO | None = None


def append(msg: str) -> None:
    """Add a log line to the buffer."""
    with _lock:
        _buffer.append((time.time(), msg))


def get_recent() -> str:
    """Return recent logs as a single string."""
    with _lock:
        lines = [f"[{t:.1f}] {m}" for t, m in _buffer]
    return "\n".join(lines) if lines else "(no logs)"


def install_stderr_tee() -> None:
    """Tee stderr to our buffer so we capture all backend prints."""
    global _original_stderr
    if _original_stderr is not None:
        return
    _original_stderr = sys.stderr

    class TeeStderr:
        def write(self, data: str) -> int:
            n = _original_stderr.write(data)
            _original_stderr.flush()
            if data and data.strip():
                for line in data.strip().splitlines():
                    append(line)
            return n

        def flush(self) -> None:
            _original_stderr.flush()

        def __getattr__(self, name: str):
            return getattr(_original_stderr, name)

    sys.stderr = TeeStderr()
