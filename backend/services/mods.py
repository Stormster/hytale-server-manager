"""
List and toggle mods/plugins. Disabled mods are moved to a 'disabled' subfolder.
"""

import json
import os
import zipfile
from typing import Optional

from config import SERVER_DIR
from utils.paths import resolve_instance

MODS_SUBFOLDERS = ("mods",)
DISABLED_SUBFOLDER = "disabled"
REQUIRED_PREFIXES = ("nitrado-webserver", "nitrado-query")


def _get_manifest_meta(jar_path: str, filename: str) -> tuple[str, Optional[str]]:
    """
    Extract display name and data folder from manifest.json in the JAR.
    Returns (display_name, data_folder).
    - display_name: "Name Version by Group" (Group = author) or filename without .jar
    - data_folder: "Group_Name" (Hytale convention for plugin data dirs) or None if no manifest
    """
    fallback = filename[:-4] if filename.lower().endswith(".jar") else filename
    data_folder: Optional[str] = None
    display_name = fallback
    try:
        with zipfile.ZipFile(jar_path, "r") as zf:
            for candidate in ("manifest.json", "hytale-plugin.json", "mod.json"):
                try:
                    data = zf.read(candidate)
                    manifest = json.loads(data.decode("utf-8"))
                    group = manifest.get("Group", "").strip()
                    name_val = manifest.get("Name", "").strip()
                    version = manifest.get("Version", "").strip()
                    if name_val:
                        lead = f"{name_val} {version}".strip()
                        display_name = f"{lead} by {group}" if group else lead
                    if group and name_val:
                        data_folder = f"{group}_{name_val}"
                    break
                except (KeyError, json.JSONDecodeError, UnicodeDecodeError):
                    continue
    except (zipfile.BadZipFile, OSError):
        pass
    return display_name, data_folder


def _is_required(filename: str) -> bool:
    lower = filename.lower()
    return any(lower.startswith(p) for p in REQUIRED_PREFIXES)


def list_mods(server_dir: Optional[str] = None) -> list[dict]:
    """
    List all mods from plugins/ and mods/ folders.
    Returns [{ name, filename, path, enabled, required }].
    """
    if server_dir is None:
        server_dir = resolve_instance(SERVER_DIR)
    if not os.path.isdir(server_dir):
        return []

    result = []
    for sub in MODS_SUBFOLDERS:
        base = os.path.join(server_dir, sub)
        if not os.path.isdir(base):
            continue
        disabled_dir = os.path.join(base, DISABLED_SUBFOLDER)

        for name in os.listdir(base):
            if name == DISABLED_SUBFOLDER:
                continue
            full = os.path.join(base, name)
            if not os.path.isfile(full) or not name.lower().endswith(".jar"):
                continue
            display_name, data_folder = _get_manifest_meta(full, name)
            entry: dict = {"name": name, "displayName": display_name, "path": os.path.join(sub, name), "enabled": True, "required": _is_required(name)}
            if data_folder is not None:
                entry["dataFolder"] = data_folder
                mods_dir = os.path.join(server_dir, "mods")
                entry["dataFolderExists"] = os.path.isdir(os.path.join(mods_dir, data_folder))
            result.append(entry)

        if os.path.isdir(disabled_dir):
            for name in os.listdir(disabled_dir):
                full = os.path.join(disabled_dir, name)
                if not os.path.isfile(full) or not name.lower().endswith(".jar"):
                    continue
                display_name, data_folder = _get_manifest_meta(full, name)
                entry = {"name": name, "displayName": display_name, "path": os.path.join(sub, DISABLED_SUBFOLDER, name), "enabled": False, "required": _is_required(name)}
                if data_folder is not None:
                    entry["dataFolder"] = data_folder
                    mods_dir = os.path.join(server_dir, "mods")
                    entry["dataFolderExists"] = os.path.isdir(os.path.join(mods_dir, data_folder))
                result.append(entry)

    result.sort(key=lambda m: (not m["enabled"], m["name"].lower()))
    return result


def toggle_mod(
    server_dir: Optional[str],
    rel_path: str,
    enable: bool,
) -> tuple[bool, str]:
    """
    Move mod to/from disabled folder. Returns (success, error_message).
    rel_path is like "plugins/nitrado-query-1.1.0.jar" (enabled) or "plugins/disabled/foo.jar" (disabled).
    """
    if server_dir is None:
        server_dir = resolve_instance(SERVER_DIR)
    full_base = os.path.normpath(server_dir)
    full_path = os.path.normpath(os.path.join(server_dir, rel_path))

    if not full_path.startswith(full_base + os.sep) and full_path != full_base:
        return False, "Invalid path"
    if not os.path.isfile(full_path):
        return False, "Mod not found"

    parts = rel_path.replace("\\", "/").split("/")
    if len(parts) < 2:
        return False, "Invalid path"
    sub = parts[0]
    filename = parts[-1]
    is_in_disabled = DISABLED_SUBFOLDER in parts

    if _is_required(filename) and not enable:
        return False, "Required mods cannot be disabled"

    if sub not in MODS_SUBFOLDERS:
        return False, "Unknown mod folder"
    if not filename.lower().endswith(".jar"):
        return False, "Not a JAR file"

    base_dir = os.path.join(server_dir, sub)
    disabled_dir = os.path.join(base_dir, DISABLED_SUBFOLDER)
    enabled_path = os.path.join(base_dir, filename)
    disabled_path = os.path.join(disabled_dir, filename)

    try:
        if enable:
            if not is_in_disabled:
                return False, "Mod is already enabled"
            os.makedirs(base_dir, exist_ok=True)
            os.rename(disabled_path, enabled_path)
        else:
            if is_in_disabled:
                return False, "Mod is already disabled"
            os.makedirs(disabled_dir, exist_ok=True)
            os.rename(enabled_path, disabled_path)
        return True, ""
    except OSError as e:
        return False, str(e)
