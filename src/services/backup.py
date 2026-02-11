"""
Backup creation, restoration, listing, and deletion.
"""

import json
import os
import re
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

_META_FILE = "backup_info.json"


# ---------------------------------------------------------------------------
# Data class for backup entries
# ---------------------------------------------------------------------------

class BackupEntry:
    """Represents a single backup folder."""

    def __init__(self, path: str):
        self.path = path
        self.folder_name = os.path.basename(path)

        # Defaults
        self.backup_type = "manual"  # "manual" | "pre-update"
        self.label = "Manual backup"
        self.from_version: str | None = None
        self.from_patchline: str | None = None
        self.to_version: str | None = None
        self.to_patchline: str | None = None

        try:
            self.created = datetime.fromtimestamp(os.path.getctime(path))
        except OSError:
            self.created = datetime.min

        self.has_server = os.path.isdir(os.path.join(path, "Server"))

        # Load metadata if available, otherwise parse legacy folder name
        meta_path = os.path.join(path, _META_FILE)
        if os.path.isfile(meta_path):
            self._load_meta(meta_path)
        else:
            self._parse_legacy_name()

    def _load_meta(self, meta_path: str):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.backup_type = data.get("type", self.backup_type)
            self.label = data.get("label", self.label)
            self.from_version = data.get("from_version")
            self.from_patchline = data.get("from_patchline")
            self.to_version = data.get("to_version")
            self.to_patchline = data.get("to_patchline")
            ts = data.get("created")
            if ts:
                self.created = datetime.fromisoformat(ts)
        except Exception:
            pass

    def _parse_legacy_name(self):
        """Try to extract info from old-style folder names for backward compat."""
        name = self.folder_name

        # Match: "update from VERSION (PATCHLINE) to VERSION (PATCHLINE) - DATE"
        m = re.match(
            r'update from\s+(\S+)\s+\(([^)]+)\)\s+to\s+(\S+)\s+\(([^)]+)\)',
            name, re.IGNORECASE,
        )
        if m:
            self.backup_type = "pre-update"
            self.label = "Pre-update backup"
            self.from_version = _short_version(m.group(1))
            self.from_patchline = m.group(2)
            self.to_version = _short_version(m.group(3))
            self.to_patchline = m.group(4)
            return

        if name.lower().startswith("user generated backup"):
            self.backup_type = "manual"
            self.label = "Manual backup"

    @property
    def display_title(self) -> str:
        if self.backup_type == "pre-update":
            return "Pre-update backup"
        return self.label

    @property
    def display_detail(self) -> str:
        parts = []
        if self.from_version:
            parts.append(f"{self.from_version} ({self.from_patchline or '?'})")
        if self.to_version:
            arrow = " \u2192 "  # →
            parts.append(f"{arrow}{self.to_version} ({self.to_patchline or '?'})")
        return "".join(parts) if parts else ""

    def __repr__(self):
        return f"BackupEntry({self.folder_name!r})"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _short_version(v: str) -> str:
    """Shorten a version like '2026.02.06-0baf7c5aa' to '2026.02.06'."""
    if not v:
        return v
    # Strip the hash suffix after the date
    m = re.match(r'(\d{4}\.\d{2}\.\d{2})', v)
    return m.group(1) if m else v


def _save_meta(dest: str, backup_type: str, label: str, **extra) -> None:
    """Write metadata JSON into a backup folder."""
    data = {
        "type": backup_type,
        "label": label,
        "created": datetime.now().isoformat(),
        **extra,
    }
    with open(os.path.join(dest, _META_FILE), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


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

    *label* can be a descriptive string like
    ``"update from X (release) to Y (pre-release)"``.
    If omitted, a manual backup is created.
    """
    backup_root = ensure_dir(resolve(BACKUP_DIR))
    now = datetime.now()
    folder_name = now.strftime("backup_%Y-%m-%d_%I%M%p")

    # Ensure unique
    dest = os.path.join(backup_root, folder_name)
    counter = 1
    while os.path.exists(dest):
        dest = os.path.join(backup_root, f"{folder_name}_{counter}")
        counter += 1

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

    # Write metadata
    if label and "update from" in label.lower():
        # Parse: "update from VER (PL) to VER (PL)"
        m = re.match(
            r'update from\s+(\S+)\s+\(([^)]+)\)\s+to\s+(\S+)\s+\(([^)]+)\)',
            label, re.IGNORECASE,
        )
        if m:
            _save_meta(
                dest,
                backup_type="pre-update",
                label="Pre-update backup",
                from_version=m.group(1),
                from_patchline=m.group(2),
                to_version=m.group(3),
                to_patchline=m.group(4),
            )
        else:
            _save_meta(dest, backup_type="pre-update", label=label)
    else:
        _save_meta(dest, backup_type="manual", label=label or "Manual backup")

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
