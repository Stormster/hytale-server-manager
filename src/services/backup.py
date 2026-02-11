"""
Backup creation, restoration, listing, and deletion.
"""

import os
import shutil
from datetime import datetime
from typing import Optional

from src.config import (
    BASE_DIR,
    BACKUP_DIR,
    SERVER_DIR,
    VERSION_FILE,
    PATCHLINE_FILE,
)
from src.utils.paths import resolve, ensure_dir


# ---------------------------------------------------------------------------
# Data class for backup entries
# ---------------------------------------------------------------------------

class BackupEntry:
    """Represents a single backup folder."""

    def __init__(self, path: str):
        self.path = path
        self.name = os.path.basename(path)
        try:
            self.created = datetime.fromtimestamp(os.path.getctime(path))
        except OSError:
            self.created = datetime.min
        self.has_server = os.path.isdir(os.path.join(path, "Server"))

    def __repr__(self):
        return f"BackupEntry({self.name!r})"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def list_backups() -> list[BackupEntry]:
    """Return all backup entries sorted newest-first."""
    backup_root = resolve(BACKUP_DIR)
    if not os.path.isdir(backup_root):
        return []
    entries = []
    for name in os.listdir(backup_root):
        full = os.path.join(backup_root, name)
        if os.path.isdir(full):
            entries.append(BackupEntry(full))
    entries.sort(key=lambda e: e.created, reverse=True)
    return entries


def create_backup(label: Optional[str] = None) -> BackupEntry:
    """
    Create a backup of the current Server folder.

    *label* is an optional descriptive name.  If omitted, a user-generated
    label with a timestamp is used.
    """
    backup_root = ensure_dir(resolve(BACKUP_DIR))
    timestamp = datetime.now().strftime("%m-%d-%Y at %I.%M%p")

    if label:
        folder_name = f"{label} - {timestamp}"
    else:
        folder_name = f"User generated backup - {timestamp}"

    dest = os.path.join(backup_root, folder_name)
    server_dir = resolve(SERVER_DIR)

    if not os.path.isdir(server_dir):
        raise FileNotFoundError("No Server folder to backup.")

    os.makedirs(dest, exist_ok=True)
    shutil.copytree(server_dir, os.path.join(dest, "Server"), dirs_exist_ok=True)

    # Copy auxiliary files if they exist
    for name in ("Assets.zip", "start.bat", "start.sh", VERSION_FILE, PATCHLINE_FILE):
        src = resolve(name)
        if os.path.isfile(src):
            shutil.copy2(src, dest)

    return BackupEntry(dest)


def restore_backup(entry: BackupEntry) -> None:
    """Restore a backup, replacing the current Server folder."""
    if not entry.has_server:
        raise ValueError("Selected backup does not contain a Server folder.")

    server_dir = resolve(SERVER_DIR)
    if os.path.isdir(server_dir):
        shutil.rmtree(server_dir)
    shutil.copytree(os.path.join(entry.path, "Server"), server_dir)

    for name in ("Assets.zip", "start.bat", "start.sh", VERSION_FILE, PATCHLINE_FILE):
        src = os.path.join(entry.path, name)
        if os.path.isfile(src):
            shutil.copy2(src, resolve(name))


def delete_backup(entry: BackupEntry) -> None:
    """Permanently delete a backup."""
    if os.path.isdir(entry.path):
        shutil.rmtree(entry.path)
