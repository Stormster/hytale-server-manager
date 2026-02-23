"""
Backup creation, restoration, listing, and deletion.
"""

import json
import os
import re
import shutil
import tempfile
import zipfile
from datetime import datetime
from typing import Optional

from config import (
    BACKUP_DIR,
    SERVER_DIR,
    VERSION_FILE,
    PATCHLINE_FILE,
)
from utils.paths import resolve_instance, ensure_dir

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
            arrow = " \u2192 "
            parts.append(f"{arrow}{self.to_version} ({self.to_patchline or '?'})")
        return "".join(parts) if parts else ""

    def to_dict(self) -> dict:
        """Serialize for JSON API responses."""
        return {
            "folder_name": self.folder_name,
            "backup_type": self.backup_type,
            "label": self.label,
            "display_title": self.display_title,
            "display_detail": self.display_detail,
            "from_version": self.from_version,
            "from_patchline": self.from_patchline,
            "to_version": self.to_version,
            "to_patchline": self.to_patchline,
            "created": self.created.isoformat() if self.created else None,
            "has_server": self.has_server,
        }

    def __repr__(self):
        return f"BackupEntry({self.folder_name!r})"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _short_version(v: str) -> str:
    if not v:
        return v
    m = re.match(r'(\d{4}\.\d{2}\.\d{2})', v)
    return m.group(1) if m else v


def _save_meta(dest: str, backup_type: str, label: str, **extra) -> None:
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
    backup_root = resolve_instance(BACKUP_DIR)
    if not os.path.isdir(backup_root):
        return []
    entries = []
    for name in os.listdir(backup_root):
        full = os.path.join(backup_root, name)
        if os.path.isdir(full):
            entries.append(BackupEntry(full))
    entries.sort(key=lambda e: e.created, reverse=True)
    return entries


def find_backup(folder_name: str) -> BackupEntry | None:
    """Find a backup by its folder name."""
    for entry in list_backups():
        if entry.folder_name == folder_name:
            return entry
    return None


def create_backup(label: Optional[str] = None) -> BackupEntry:
    backup_root = ensure_dir(resolve_instance(BACKUP_DIR))
    now = datetime.now()
    folder_name = now.strftime("backup_%Y-%m-%d_%I%M%p")

    dest = os.path.join(backup_root, folder_name)
    counter = 1
    while os.path.exists(dest):
        dest = os.path.join(backup_root, f"{folder_name}_{counter}")
        counter += 1

    server_dir = resolve_instance(SERVER_DIR)
    if not os.path.isdir(server_dir):
        raise FileNotFoundError("No Server folder to backup.")

    os.makedirs(dest, exist_ok=True)
    shutil.copytree(server_dir, os.path.join(dest, "Server"), dirs_exist_ok=True)

    for name in ("Assets.zip", "start.bat", "start.sh", VERSION_FILE, PATCHLINE_FILE):
        src = resolve_instance(name)
        if os.path.isfile(src):
            shutil.copy2(src, dest)

    if label and "update from" in label.lower():
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
    if not entry.has_server:
        raise ValueError("Selected backup does not contain a Server folder.")

    server_dir = resolve_instance(SERVER_DIR)
    if os.path.isdir(server_dir):
        create_backup(label="Pre-restore backup")
        shutil.rmtree(server_dir)
    shutil.copytree(os.path.join(entry.path, "Server"), server_dir)

    for name in ("Assets.zip", "start.bat", "start.sh", VERSION_FILE, PATCHLINE_FILE):
        src = os.path.join(entry.path, name)
        if os.path.isfile(src):
            shutil.copy2(src, resolve_instance(name))


def rename_backup(entry: BackupEntry, new_label: str) -> None:
    """Update the backup's label in backup_info.json."""
    meta_path = os.path.join(entry.path, _META_FILE)
    data = {}
    if os.path.isfile(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
    data["label"] = new_label.strip() or "Manual backup"
    if "type" not in data:
        data["type"] = entry.backup_type
    if "created" not in data and entry.created:
        data["created"] = entry.created.isoformat()
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def delete_backup(entry: BackupEntry) -> None:
    if os.path.isdir(entry.path):
        shutil.rmtree(entry.path)


# ---------------------------------------------------------------------------
# Hytale world backups (universe snapshots from --backup / /backup)
# ---------------------------------------------------------------------------

def list_hytale_world_backups() -> list[dict]:
    """List .zip backups created by Hytale (--backup, /backup). Path: Server/backups/."""
    from config import SERVER_DIR
    backups_root = resolve_instance(SERVER_DIR, "backups")
    if not os.path.isdir(backups_root):
        return []
    entries = []
    for name in os.listdir(backups_root):
        if name == "archive":
            archive_dir = os.path.join(backups_root, name)
            if os.path.isdir(archive_dir):
                for sub in os.listdir(archive_dir):
                    if sub.lower().endswith(".zip"):
                        full = os.path.join(archive_dir, sub)
                        if os.path.isfile(full):
                            try:
                                mtime = os.path.getmtime(full)
                                size = os.path.getsize(full)
                            except OSError:
                                mtime = 0
                                size = 0
                            entries.append({
                                "filename": sub,
                                "path": f"backups/archive/{sub}",
                                "created": datetime.fromtimestamp(mtime).isoformat() if mtime else None,
                                "size_bytes": size,
                                "archived": True,
                            })
        elif name.lower().endswith(".zip"):
            full = os.path.join(backups_root, name)
            if os.path.isfile(full):
                try:
                    mtime = os.path.getmtime(full)
                    size = os.path.getsize(full)
                except OSError:
                    mtime = 0
                    size = 0
                entries.append({
                    "filename": name,
                    "path": f"backups/{name}",
                    "created": datetime.fromtimestamp(mtime).isoformat() if mtime else None,
                    "size_bytes": size,
                    "archived": False,
                })
    entries.sort(key=lambda e: (e["created"] or ""), reverse=True)
    return entries


def get_hytale_world_backups_folder() -> str:
    """Absolute path to Server/backups (Hytale world snapshots)."""
    from config import SERVER_DIR
    return resolve_instance(SERVER_DIR, "backups")


def restore_hytale_world_backup(filename: str) -> None:
    """
    Restore a Hytale world backup (.zip from Server/backups/).
    Creates a pre-restore backup of current universe first.
    Server must be stopped.
    """
    from config import SERVER_DIR
    from services.server import is_instance_running
    from services.settings import get_active_instance

    active = get_active_instance()
    if active and is_instance_running(active):
        raise ValueError("Stop the server before restoring a world backup.")

    server_dir = resolve_instance(SERVER_DIR)
    backups_root = os.path.join(server_dir, "backups")
    universe_dir = os.path.join(server_dir, "universe")

    # Resolve source zip path (main backups/ or backups/archive/)
    if "/" in filename or "\\" in filename:
        raise ValueError("Invalid filename")
    if filename.lower().endswith(".zip"):
        base_name = filename
    else:
        base_name = filename + ".zip"

    # Resolve source zip (main backups/ or backups/archive/)
    source_zip = None
    for sub in ["", "archive"]:
        candidate = os.path.join(backups_root, sub, base_name) if sub else os.path.join(backups_root, base_name)
        if os.path.isfile(candidate):
            source_zip = candidate
            break
    if not source_zip:
        raise FileNotFoundError(f"World backup not found: {base_name}")

    ensure_dir(backups_root)

    # 1) Create pre-restore backup of current universe
    if os.path.isdir(universe_dir):
        pre_restore_name = datetime.now().strftime("pre-restore_%Y-%m-%d_%H-%M.zip")
        pre_restore_path = os.path.join(backups_root, pre_restore_name)
        with zipfile.ZipFile(pre_restore_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(universe_dir):
                for f in files:
                    path = os.path.join(root, f)
                    arcname = os.path.relpath(path, os.path.dirname(universe_dir))
                    zf.write(path, arcname)

    # 2) Remove current universe
    if os.path.isdir(universe_dir):
        shutil.rmtree(universe_dir)

    # 3) Extract the selected backup
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(source_zip, "r") as zf:
            zf.extractall(tmp)
        # Zip may contain "universe/" at root or contents at root
        extracted_universe = os.path.join(tmp, "universe")
        if os.path.isdir(extracted_universe):
            shutil.copytree(extracted_universe, universe_dir)
        else:
            # Contents at root are the universe
            os.makedirs(universe_dir, exist_ok=True)
            for name in os.listdir(tmp):
                src = os.path.join(tmp, name)
                dst = os.path.join(universe_dir, name)
                if os.path.isdir(src):
                    shutil.copytree(src, dst)
                else:
                    shutil.copy2(src, dst)
