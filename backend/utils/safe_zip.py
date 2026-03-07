"""
Safe ZIP extraction – reject path traversal (Zip Slip) and absolute paths.
"""

import os
import zipfile


def safe_extractall(zip_path: str, dest_dir: str) -> None:
    """
    Extract zip into dest_dir. Rejects any entry that would resolve outside dest_dir.
    Raises ValueError on unsafe entries.
    """
    dest_abs = os.path.abspath(dest_dir)
    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            # Normalize: backslash to slash, strip leading slashes, no empty
            parts = name.replace("\\", "/").strip("/").split("/")
            parts = [p for p in parts if p and p != "."]
            if ".." in parts:
                raise ValueError(f"Unsafe zip entry: {name}")
            if not parts:
                continue
            safe_rel = os.path.join(*parts)
            if os.path.isabs(safe_rel):
                raise ValueError(f"Unsafe zip entry: {name}")
            target = os.path.abspath(os.path.join(dest_abs, safe_rel))
            if not (target == dest_abs or target.startswith(dest_abs + os.sep)):
                raise ValueError(f"Unsafe zip entry: {name}")
            info = zf.getinfo(name)
            if info.is_dir():
                os.makedirs(target, exist_ok=True)
            else:
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with zf.open(name) as src, open(target, "wb") as dst:
                    dst.write(src.read())
