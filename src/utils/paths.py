"""
Centralised path helpers.  Every path in the app flows through here so that
both dev-mode and PyInstaller-bundled mode resolve correctly.
"""

import os
from src.config import BASE_DIR


def resolve(*parts: str) -> str:
    """Join *parts* onto the application base directory and return an absolute path."""
    return os.path.join(BASE_DIR, *parts)


def ensure_dir(path: str) -> str:
    """Create *path* (and parents) if it doesn't exist.  Returns the path."""
    os.makedirs(path, exist_ok=True)
    return path
