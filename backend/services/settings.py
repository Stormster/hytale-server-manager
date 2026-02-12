"""
Persistent application settings stored in %APPDATA%/HytaleServerManager/settings.json.

This module intentionally has ZERO project imports to avoid circular dependencies
(paths.py imports from here).
"""

import json
import os

_SETTINGS_DIR = os.path.join(
    os.environ.get("APPDATA", os.path.expanduser("~")),
    "HytaleServerManager",
)
_SETTINGS_FILE = os.path.join(_SETTINGS_DIR, "settings.json")

_cache: dict | None = None


def _load() -> dict:
    global _cache
    if os.path.isfile(_SETTINGS_FILE):
        with open(_SETTINGS_FILE, "r", encoding="utf-8") as f:
            _cache = json.load(f)
    else:
        _cache = {}
    return _cache


def _save(data: dict) -> None:
    global _cache
    os.makedirs(_SETTINGS_DIR, exist_ok=True)
    with open(_SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    _cache = data


def load() -> dict:
    if _cache is None:
        return _load()
    return _cache


def get_all() -> dict:
    """Return a copy of all settings."""
    return dict(load())


# -- Root directory -----------------------------------------------------------

def get_root_dir() -> str:
    """Return the root servers folder, or empty string if not configured."""
    return load().get("root_dir", "")


def set_root_dir(path: str) -> None:
    s = load()
    s["root_dir"] = os.path.abspath(path)
    _save(s)


# -- Active instance ----------------------------------------------------------

def get_active_instance() -> str:
    """Return the name of the active server instance, or empty string."""
    return load().get("active_instance", "")


def set_active_instance(name: str) -> None:
    s = load()
    s["active_instance"] = name
    _save(s)


def get_active_instance_dir() -> str:
    """Return the absolute path to the active instance folder, or empty string."""
    root = get_root_dir()
    inst = get_active_instance()
    if root and inst:
        return os.path.join(root, inst)
    return ""
