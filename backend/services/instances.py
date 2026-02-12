"""
Server instance management – list, create, import, delete.
"""

import json
import os
import re
import shutil
from datetime import datetime

from services import settings


def _sanitize_folder_name(name: str) -> str:
    """Convert user-friendly name to filesystem-safe folder name.
    Keeps spaces for display; removes only invalid filesystem chars.
    """
    # Replace invalid filesystem chars with dash
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "-", name)
    # Collapse multiple dashes
    safe = re.sub(r"-+", "-", safe)
    # Strip leading/trailing dashes and whitespace
    safe = safe.strip("-").strip()
    return safe or name.strip() or "instance"


def list_instances() -> list[dict]:
    """Scan root_dir for instance subfolders (excluding ignored). Ordered by instance_order."""
    root = settings.get_root_dir()
    if not root or not os.path.isdir(root):
        return []

    ignored = set(settings.get_ignored_instances())
    order = settings.get_instance_order()

    def sort_key(name: str) -> tuple[int, str]:
        try:
            idx = order.index(name)
            return (idx, name)
        except ValueError:
            return (len(order), name)

    instances = []
    all_names = [
        n for n in os.listdir(root)
        if n not in ignored and not n.startswith(".") and os.path.isdir(os.path.join(root, n))
    ]
    for name in sorted(all_names, key=sort_key):
        full = os.path.join(root, name)
        if not os.path.isdir(full) or name.startswith("."):
            continue

        jar = os.path.join(full, "Server", "HytaleServer.jar")
        installed = os.path.isfile(jar)

        version = "unknown"
        vf = os.path.join(full, "server_version.txt")
        if os.path.isfile(vf):
            try:
                with open(vf, "r") as f:
                    version = f.read().strip() or "unknown"
            except Exception:
                pass

        patchline = "release"
        pf = os.path.join(full, "server_patchline.txt")
        if os.path.isfile(pf):
            try:
                with open(pf, "r") as f:
                    patchline = f.read().strip() or "release"
            except Exception:
                pass

        # Ports: assign on first list if missing, then read for display
        game_port = None
        webserver_port = None
        try:
            from services.ports import assign_port_for_instance, get_instance_ports_display
            from services.settings import get_root_dir
            root = get_root_dir()
            if root and installed:
                # Ensure port assigned (idempotent) so we display correct values
                assign_port_for_instance(name)
                ports_map = get_instance_ports_display([name], root)
                if name in ports_map:
                    game_port = ports_map[name].get("game")
                    webserver_port = ports_map[name].get("webserver")
        except Exception:
            pass

        # Last backup: most recent from manager (instance/backups) or Hytale native (Server/backups/*.zip)
        last_backup_created = None
        best_created = None

        # 1) Manager backups: instance/backups/ folders with backup_info.json or folder ctime
        manager_backup_dir = os.path.join(full, "backups")
        if os.path.isdir(manager_backup_dir):
            meta_file = "backup_info.json"
            for sub in os.listdir(manager_backup_dir):
                sub_path = os.path.join(manager_backup_dir, sub)
                if not os.path.isdir(sub_path):
                    continue
                meta = os.path.join(sub_path, meta_file)
                try:
                    if os.path.isfile(meta):
                        with open(meta, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        ts = data.get("created")
                        if ts is not None:
                            try:
                                if isinstance(ts, (int, float)):
                                    dt = datetime.fromtimestamp(ts)
                                else:
                                    s = str(ts).strip()
                                    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
                                if best_created is None or dt > best_created:
                                    best_created = dt
                            except (ValueError, OSError):
                                pass
                    else:
                        ctime = os.path.getctime(sub_path)
                        dt = datetime.fromtimestamp(ctime)
                        if best_created is None or dt > best_created:
                            best_created = dt
                except Exception:
                    pass

        # 2) Hytale native backups: Server/backups/*.zip and Server/backups/archive/*.zip
        def scan_zip_backups(dir_path: str) -> None:
            nonlocal best_created
            if not os.path.isdir(dir_path):
                return
            for name in os.listdir(dir_path):
                if not name.endswith(".zip"):
                    continue
                zip_path = os.path.join(dir_path, name)
                if not os.path.isfile(zip_path):
                    continue
                try:
                    mtime = os.path.getmtime(zip_path)
                    dt = datetime.fromtimestamp(mtime)
                    if best_created is None or dt > best_created:
                        best_created = dt
                except Exception:
                    pass

        server_backup_dir = os.path.join(full, "Server", "backups")
        scan_zip_backups(server_backup_dir)
        scan_zip_backups(os.path.join(server_backup_dir, "archive"))

        if best_created:
            last_backup_created = best_created.isoformat()

        instances.append({
            "name": name,
            "installed": installed,
            "version": version,
            "patchline": patchline,
            "game_port": game_port,
            "webserver_port": webserver_port,
            "last_backup_created": last_backup_created,
        })

    return instances


def reorder_instances(names: list[str]) -> None:
    """Update the display order of instances."""
    root = settings.get_root_dir()
    if not root or not os.path.isdir(root):
        raise ValueError("Root directory not configured")
    valid = set(
        n for n in os.listdir(root)
        if os.path.isdir(os.path.join(root, n)) and not n.startswith(".")
    )
    valid -= set(settings.get_ignored_instances())
    for n in names:
        if n not in valid:
            raise ValueError(f"Instance '{n}' not found")
    settings.set_instance_order(names)


def create_instance(name: str) -> dict:
    """Create a new empty instance subfolder."""
    root = settings.get_root_dir()
    if not root:
        raise ValueError("Root directory not configured")

    name = _sanitize_folder_name(name)
    dest = os.path.join(root, name)
    if os.path.exists(dest):
        raise ValueError(f"Instance '{name}' already exists")

    os.makedirs(dest, exist_ok=True)
    order = settings.get_instance_order()
    if name not in order:
        order = order + [name]
        settings.set_instance_order(order)
    return {"name": name}


def import_instance(name: str, source_path: str) -> dict:
    """Add an existing server to the manager. Copies only if source is outside root."""
    root = settings.get_root_dir()
    if not root:
        raise ValueError("Root directory not configured")

    name = _sanitize_folder_name(name)
    root_abs = os.path.abspath(root)
    source_abs = os.path.abspath(source_path)

    if not os.path.isdir(source_abs):
        raise ValueError("Source path is not a directory")

    # Validate that the folder is a Hytale server instance (the folder containing Assets.zip)
    assets_zip = os.path.join(source_abs, "Assets.zip")
    server_dir = os.path.join(source_abs, "Server")
    jar_path = os.path.join(server_dir, "HytaleServer.jar")

    if not os.path.isfile(assets_zip):
        raise ValueError(
            "Selected folder is not a valid Hytale server. It must be the folder containing Assets.zip."
        )
    if not os.path.isdir(server_dir):
        raise ValueError(
            "Selected folder is not a valid Hytale server. It must contain a Server/ subfolder."
        )
    if not os.path.isfile(jar_path):
        raise ValueError(
            "Selected folder is not a valid Hytale server. Server/ must contain HytaleServer.jar."
        )

    dest = os.path.join(root_abs, name)

    # Already in the right place (inside root)? Just register / restore, no copy
    try:
        source_rel = os.path.relpath(source_abs, root_abs)
    except ValueError:
        source_rel = None  # different drives on Windows
    if (
        source_rel
        and not source_rel.startswith("..")
        and os.path.sep not in source_rel
    ):
        path_name = source_rel
        if path_name and path_name.lower() == name.lower():
            settings.remove_ignored_instance(path_name)
            if path_name not in settings.get_instance_order():
                order = settings.get_instance_order() + [path_name]
                settings.set_instance_order(order)
            return {"name": path_name, "copied": False}
    elif os.path.normpath(source_abs) == os.path.normpath(dest):
        settings.remove_ignored_instance(name)
        if name not in settings.get_instance_order():
            order = settings.get_instance_order() + [name]
            settings.set_instance_order(order)
        return {"name": name, "copied": False}

    # Different location – copy to root
    if os.path.exists(dest):
        raise ValueError(f"Instance '{name}' already exists")

    shutil.copytree(source_abs, dest)
    if name not in settings.get_instance_order():
        order = settings.get_instance_order() + [name]
        settings.set_instance_order(order)
    return {"name": name, "copied": True}


def delete_instance(name: str, delete_files: bool = True) -> None:
    """Remove instance from manager. If delete_files=True, also delete folder from disk."""
    root = settings.get_root_dir()
    if not root:
        raise ValueError("Root directory not configured")

    dest = os.path.join(root, name)
    if not os.path.isdir(dest):
        raise ValueError(f"Instance '{name}' not found")

    if settings.get_active_instance() == name:
        settings.set_active_instance("")

    if delete_files:
        shutil.rmtree(dest)
        order = [n for n in settings.get_instance_order() if n != name]
        settings.set_instance_order(order)
    else:
        settings.add_ignored_instance(name)


def rename_instance(old_name: str, new_name: str) -> dict:
    """Rename an instance subfolder."""
    root = settings.get_root_dir()
    if not root:
        raise ValueError("Root directory not configured")

    new_name = _sanitize_folder_name(new_name)
    old = os.path.join(root, old_name)
    new_path = os.path.join(root, new_name)

    if not os.path.isdir(old):
        raise ValueError(f"Instance '{old_name}' not found")
    if os.path.exists(new_path):
        raise ValueError(f"Instance '{new_name}' already exists")

    os.rename(old, new_path)

    # Update active if it was the renamed one
    if settings.get_active_instance() == old_name:
        settings.set_active_instance(new_name)

    # Remove old name from ignored list if present (renamed folder is now visible)
    settings.remove_ignored_instance(old_name)

    # Update instance order
    order = settings.get_instance_order()
    if old_name in order:
        settings.set_instance_order(
            [new_name if n == old_name else n for n in order]
        )

    return {"name": new_name}
