"""
Centralised path helpers.

Two resolvers exist:
  - resolve_root()     → paths relative to the shared root folder (downloader, credentials)
  - resolve_instance() → paths relative to the active instance folder (Server, backups, configs)
"""

import os

from services.settings import get_root_dir, get_active_instance_dir


def resolve_root(*parts: str) -> str:
    """Join *parts* onto the root folder (shared downloader / credentials)."""
    return os.path.join(get_root_dir(), *parts)


def resolve_instance(*parts: str) -> str:
    """Join *parts* onto the active instance folder (Server, backups, version files)."""
    return os.path.join(get_active_instance_dir(), *parts)


def ensure_dir(path: str) -> str:
    """Create *path* (and parents) if it doesn't exist.  Returns the path."""
    os.makedirs(path, exist_ok=True)
    return path
