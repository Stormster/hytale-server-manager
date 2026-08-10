"""
Atomic file writes – write to a temp file in the same directory, fsync, then
os.replace over the destination so readers never see a truncated file.
"""

import json
import os
import tempfile


def atomic_write_text(path: str, content: str, encoding: str = "utf-8") -> None:
    """Write text to *path* atomically. A crash mid-write leaves the old file intact."""
    dir_name = os.path.dirname(os.path.abspath(path))
    os.makedirs(dir_name, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=dir_name, prefix=os.path.basename(path) + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def atomic_write_json(path: str, data, indent: int = 2, ensure_ascii: bool = True) -> None:
    """Serialize *data* as JSON and write it atomically."""
    atomic_write_text(path, json.dumps(data, indent=indent, ensure_ascii=ensure_ascii))
