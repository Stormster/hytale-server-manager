"""
Backup creation, restoration, listing, and deletion.
"""

import json
import os
import re
import shutil
import zipfile
from datetime import datetime
from typing import Optional

from config import (
    BACKUP_DIR,
    SERVER_DIR,
    VERSION_FILE,
    PATCHLINE_FILE,
)
from utils.atomic_io import atomic_write_json
from utils.paths import resolve_instance, resolve_instance_by_name, ensure_dir

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
        self.server_was_running = False

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
            self.server_was_running = bool(data.get("server_was_running"))
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
            "server_was_running": self.server_was_running,
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
    atomic_write_json(os.path.join(dest, _META_FILE), data)


def _copy_server_for_backup(
    server_dir: str,
    dest_server_dir: str,
    *,
    exclude_server_cache: bool = False,
) -> None:
    """Copy the Server folder for a backup with optional excludes."""
    ignore = None
    if exclude_server_cache:
        server_dir_norm = os.path.normcase(os.path.normpath(server_dir))

        def _ignore(path: str, names: list[str]) -> list[str]:
            # Only skip Server/.cache at the root of the Server directory.
            if os.path.normcase(os.path.normpath(path)) == server_dir_norm:
                return [".cache"] if ".cache" in names else []
            return []

        ignore = _ignore

    try:
        shutil.copytree(server_dir, dest_server_dir, dirs_exist_ok=True, ignore=ignore)
    except shutil.Error as exc:
        details = ""
        errors = exc.args[0] if exc.args else []
        if isinstance(errors, list) and errors:
            sample = "; ".join(str(err[2]) for err in errors[:3] if isinstance(err, tuple) and len(err) >= 3)
            details = sample.lower()
        else:
            details = str(exc).lower()

        looks_like_windows_path_limit = (
            "winerror 206" in details
            or "file name too long" in details
            or "path not found" in details
            or "cannot find the path" in details
        )
        if looks_like_windows_path_limit:
            raise RuntimeError(
                "Backup failed while copying files. This is likely a Windows long-path issue. "
                "Try enabling Windows long paths and/or using a shorter server root path."
            ) from exc
        raise


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


def create_backup_for_instance(
    instance_name: str,
    label: Optional[str] = None,
    *,
    exclude_server_cache: bool = False,
) -> BackupEntry:
    """Create a backup for a specific instance."""
    from services.server import is_instance_running

    backup_root = ensure_dir(resolve_instance_by_name(instance_name, BACKUP_DIR))
    now = datetime.now()
    folder_name = now.strftime("backup_%Y-%m-%d_%I%M%p")

    dest = os.path.join(backup_root, folder_name)
    counter = 1
    while os.path.exists(dest):
        dest = os.path.join(backup_root, f"{folder_name}_{counter}")
        counter += 1

    server_dir = resolve_instance_by_name(instance_name, SERVER_DIR)
    if not os.path.isdir(server_dir):
        raise FileNotFoundError("No Server folder to backup.")

    # A backup taken while the server is running may capture world files
    # mid-write; record it so the UI can flag the backup as possibly torn.
    server_was_running = is_instance_running(instance_name)

    os.makedirs(dest, exist_ok=True)
    _copy_server_for_backup(
        server_dir,
        os.path.join(dest, "Server"),
        exclude_server_cache=exclude_server_cache,
    )

    for name in ("Assets.zip", "start.bat", "start.sh", VERSION_FILE, PATCHLINE_FILE):
        src = resolve_instance_by_name(instance_name, name)
        if os.path.isfile(src):
            shutil.copy2(src, dest)

    extra = {"server_was_running": True} if server_was_running else {}
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
                **extra,
            )
        else:
            _save_meta(dest, backup_type="pre-update", label=label, **extra)
    else:
        _save_meta(dest, backup_type="manual", label=label or "Manual backup", **extra)

    return BackupEntry(dest)


def create_backup(label: Optional[str] = None, *, exclude_server_cache: bool = False) -> BackupEntry:
    """Create a backup of the active instance."""
    from services.settings import get_active_instance

    instance_name = get_active_instance()
    if not instance_name:
        raise FileNotFoundError("No active instance selected.")
    return create_backup_for_instance(
        instance_name, label, exclude_server_cache=exclude_server_cache
    )


def restore_backup(entry: BackupEntry) -> None:
    from services.server import is_instance_running
    from services.settings import get_active_instance

    if not entry.has_server:
        raise ValueError("Selected backup does not contain a Server folder.")

    backup_server = os.path.join(entry.path, "Server")
    if not os.path.isfile(os.path.join(backup_server, "HytaleServer.jar")):
        raise ValueError(
            "This backup looks incomplete (no Server/HytaleServer.jar inside). "
            "Restoring it would leave a broken install, so nothing was changed."
        )

    active = get_active_instance()
    if active and is_instance_running(active):
        raise ValueError("Stop the server before restoring a backup.")

    server_dir = resolve_instance(SERVER_DIR)

    # Stage the restored copy next to the live folder first, so a failed copy
    # (corrupt backup, disk full) never touches the current install.
    staging = server_dir + ".restoring"
    old = server_dir + ".pre-restore"
    for leftover in (staging, old):
        if os.path.isdir(leftover):
            shutil.rmtree(leftover)
    shutil.copytree(backup_server, staging)

    had_server = os.path.isdir(server_dir)
    if had_server:
        create_backup(label="Pre-restore backup")
        os.rename(server_dir, old)
    try:
        os.rename(staging, server_dir)
    except OSError:
        if had_server:
            os.rename(old, server_dir)
        raise
    if had_server:
        shutil.rmtree(old, ignore_errors=True)

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
        except (OSError, json.JSONDecodeError) as exc:
            # Rewriting from scratch would wipe version provenance – refuse.
            raise ValueError(f"Cannot rename: backup metadata is unreadable ({exc}).")
    data["label"] = new_label.strip() or "Manual backup"
    if "type" not in data:
        data["type"] = entry.backup_type
    if "created" not in data and entry.created:
        data["created"] = entry.created.isoformat()
    atomic_write_json(meta_path, data)


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

    # 1) Extract the selected backup into a staging folder first – if the zip
    # is corrupt or the disk fills, the live universe is left untouched.
    from utils.safe_zip import safe_extractall

    staging = universe_dir + ".restoring"
    old = universe_dir + ".pre-restore"
    for leftover in (staging, old):
        if os.path.isdir(leftover):
            shutil.rmtree(leftover)
    os.makedirs(staging)
    try:
        safe_extractall(source_zip, staging)
    except zipfile.BadZipFile as exc:
        shutil.rmtree(staging, ignore_errors=True)
        raise ValueError(
            f"This world backup is corrupt or incomplete ({exc}). Nothing was changed."
        )
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise

    # Zip may contain "universe/" at root or contents at root
    extracted_universe = os.path.join(staging, "universe")
    new_universe_src = extracted_universe if os.path.isdir(extracted_universe) else staging

    # 2) Create pre-restore zip of the current universe
    if os.path.isdir(universe_dir):
        pre_restore_name = datetime.now().strftime("pre-restore_%Y-%m-%d_%H-%M.zip")
        pre_restore_path = os.path.join(backups_root, pre_restore_name)
        with zipfile.ZipFile(pre_restore_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(universe_dir):
                for f in files:
                    path = os.path.join(root, f)
                    arcname = os.path.relpath(path, os.path.dirname(universe_dir))
                    zf.write(path, arcname)

    # 3) Swap the staged universe into place (renames, so failure is recoverable)
    had_universe = os.path.isdir(universe_dir)
    if had_universe:
        os.rename(universe_dir, old)
    try:
        os.rename(new_universe_src, universe_dir)
    except OSError:
        if had_universe:
            os.rename(old, universe_dir)
        raise
    shutil.rmtree(staging, ignore_errors=True)
    if had_universe:
        shutil.rmtree(old, ignore_errors=True)
