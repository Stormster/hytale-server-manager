"""Download progress parsing for Hytale server updates."""

from __future__ import annotations

import re
from typing import Callable, Optional

_PROGRESS_RE = re.compile(r"(\d+\.?\d*)%\s*\(([^)]+)\)")


def parse_progress(line: str) -> tuple[float, str] | None:
    m = _PROGRESS_RE.search(line)
    if m:
        return float(m.group(1)), m.group(2).strip()
    return None


def make_dl_output_handler(
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
