"""
Persistent application settings stored in %APPDATA%/HytaleServerManager/settings.json.

This module intentionally has ZERO project imports to avoid circular dependencies
(paths.py imports from here).
"""

import json
import os
from typing import Optional

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


# -- Onboarding ---------------------------------------------------------------

def has_completed_onboarding() -> bool:
    """True if user has completed the first-time setup (chosen servers folder)."""
    return bool(load().get("onboarding_completed"))


def set_onboarding_completed() -> None:
    s = load()
    s["onboarding_completed"] = True
    _save(s)


# -- Root directory -----------------------------------------------------------

def get_root_dir() -> str:
    """Return the root servers folder, or empty string if not configured."""
    return load().get("root_dir", "")


def set_root_dir(path: str) -> None:
    s = load()
    s["root_dir"] = os.path.abspath(path)
    s["onboarding_completed"] = True
    _save(s)


# -- Ignored instances ---------------------------------------------------------
# Instance names to hide from the manager (removed without deleting files)


def get_ignored_instances() -> list[str]:
    """Return list of instance names hidden from the manager."""
    return list(load().get("ignored_instances", []))


def add_ignored_instance(name: str) -> None:
    """Hide an instance from the manager (files stay on disk)."""
    s = load()
    ignored = list(s.get("ignored_instances", []))
    if name not in ignored:
        ignored.append(name)
        s["ignored_instances"] = ignored
        _save(s)


def remove_ignored_instance(name: str) -> None:
    """Show an instance in the manager again."""
    s = load()
    ignored = [x for x in s.get("ignored_instances", []) if x != name]
    s["ignored_instances"] = ignored
    _save(s)


# -- Instance order -----------------------------------------------------------

def get_instance_order() -> list[str]:
    """Return ordered list of instance names for display order."""
    return list(load().get("instance_order", []))


def set_instance_order(names: list[str]) -> None:
    """Set the display order of instances."""
    s = load()
    s["instance_order"] = names
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


# -- Instance ports (game + Nitrado webserver, Nitrado = game + 100) ----------

def get_instance_ports() -> dict:
    """Return {instance_name: {"game": int, "webserver": int}}."""
    return dict(load().get("instance_ports", {}))


def get_instance_port(instance_name: str) -> tuple[int | None, int | None]:
    """Return (game_port, webserver_port) for instance, or (None, None)."""
    ports = get_instance_ports()
    p = ports.get(instance_name)
    if p and isinstance(p, dict):
        g = p.get("game")
        w = p.get("webserver")
        if isinstance(g, int) and isinstance(w, int):
            return (g, w)
    return (None, None)


def set_instance_port(instance_name: str, game_port: int, webserver_port: int) -> None:
    """Store ports for an instance."""
    s = load()
    ports = dict(s.get("instance_ports", {}))
    ports[instance_name] = {"game": game_port, "webserver": webserver_port}
    s["instance_ports"] = ports
    _save(s)


# -- Experimental addon / Patreon license ------------------------------------

def get_experimental_addon_license_key() -> str:
    """Return the Experimental addon license key (from Patreon), or empty string."""
    s = load()
    return s.get("experimental_addon_license_key") or s.get("pro_license_key", "")


def set_experimental_addon_license_key(key: str) -> None:
    """Store the Experimental addon license key. Restart app for addon to pick it up."""
    s = load()
    s["experimental_addon_license_key"] = (key or "").strip()
    _save(s)


# -- Instance server settings (RAM limits, startup args) ---------------------------------

def get_instance_server_settings() -> dict:
    """Return { instance_name: { ram_min_gb?, ram_max_gb?, startup_args? } }."""
    return dict(load().get("instance_server_settings", {}))


def get_instance_server_settings_for(instance_name: str) -> dict:
    """Return server settings for one instance."""
    all_settings = get_instance_server_settings()
    return dict(all_settings.get(instance_name, {}))


# -- Instance server settings (RAM limits, startup args) ---------------------------------

def set_instance_server_settings(instance_name: str, data: dict) -> None:
    """Update server settings for an instance. Merges with existing."""
    if not instance_name:
        return
    s = load()
    all_settings = dict(s.get("instance_server_settings", {}))
    current = dict(all_settings.get(instance_name, {}))

    def _parse_gb(v) -> Optional[int]:
        if v is None or v == "":
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

    if "ram_min_gb" in data:
        current["ram_min_gb"] = _parse_gb(data["ram_min_gb"])
    if "ram_max_gb" in data:
        current["ram_max_gb"] = _parse_gb(data["ram_max_gb"])
    if "startup_args" in data:
        args = data["startup_args"]
        current["startup_args"] = [str(a).strip() for a in (args or []) if str(a).strip()]

    all_settings[instance_name] = current
    s["instance_server_settings"] = all_settings
    _save(s)
