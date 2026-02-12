"""
Server instance management – list, create, import, delete.
"""

import os
import re
import shutil
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
    """Scan root_dir for instance subfolders."""
    root = settings.get_root_dir()
    if not root or not os.path.isdir(root):
        return []

    instances = []
    for name in sorted(os.listdir(root)):
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

        instances.append({
            "name": name,
            "installed": installed,
            "version": version,
            "patchline": patchline,
        })

    return instances


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
    return {"name": name}


def import_instance(name: str, source_path: str) -> dict:
    """Copy an existing server directory into the root as a new instance."""
    root = settings.get_root_dir()
    if not root:
        raise ValueError("Root directory not configured")

    name = _sanitize_folder_name(name)
    dest = os.path.join(root, name)
    if os.path.exists(dest):
        raise ValueError(f"Instance '{name}' already exists")

    source_path = os.path.abspath(source_path)
    if not os.path.isdir(source_path):
        raise ValueError("Source path is not a directory")

    shutil.copytree(source_path, dest)
    return {"name": name}


def delete_instance(name: str) -> None:
    """Permanently delete an instance subfolder."""
    root = settings.get_root_dir()
    if not root:
        raise ValueError("Root directory not configured")

    dest = os.path.join(root, name)
    if not os.path.isdir(dest):
        raise ValueError(f"Instance '{name}' not found")

    # Safety: don't delete the active instance if server is running
    if settings.get_active_instance() == name:
        settings.set_active_instance("")

    shutil.rmtree(dest)


def rename_instance(old_name: str, new_name: str) -> dict:
    """Rename an instance subfolder."""
    root = settings.get_root_dir()
    if not root:
        raise ValueError("Root directory not configured")

    old = os.path.join(root, old_name)
    new = os.path.join(root, new_name)

    if not os.path.isdir(old):
        raise ValueError(f"Instance '{old_name}' not found")
    if os.path.exists(new):
        raise ValueError(f"Instance '{new_name}' already exists")

    os.rename(old, new)

    # Update active if it was the renamed one
    if settings.get_active_instance() == old_name:
        settings.set_active_instance(new_name)

    return {"name": new_name}
