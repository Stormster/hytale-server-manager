"""
Load Pro plugins from the plugins/ folder.

Scans for pro_plugin.whl or pro_plugin.pyz. If present, imports the plugin
and calls register(app, license_key). Pro code is never shipped with the
public build – Patreon users receive the plugin file + license key separately.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import TYPE_CHECKING

from plugin_interface import ProPlugin

if TYPE_CHECKING:
    from fastapi import FastAPI

# Plugin candidates (checked in order)
_PRO_PLUGIN_NAMES = ("pro_plugin.whl", "pro_plugin.pyz")

# Set by load_pro_plugin; read by /api/info for frontend
pro_loaded = False


def _get_plugins_dir() -> Path:
    """Resolve plugins/ directory: next to backend exe when frozen, else backend/ when in dev."""
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).parent
    else:
        # Running from source: backend/plugin_loader.py -> backend/
        base = Path(__file__).resolve().parent
    return base / "plugins"


def _find_pro_plugin(plugins_dir: Path) -> Path | None:
    """Return path to pro_plugin.whl or pro_plugin.pyz if present."""
    if not plugins_dir.is_dir():
        return None
    for name in _PRO_PLUGIN_NAMES:
        p = plugins_dir / name
        if p.is_file():
            return p
    return None


def _load_plugin_module(plugin_path: Path) -> ProPlugin | None:
    """
    Import plugin and return ProPlugin instance, or None on failure.

    For .whl and .pyz: both are zip archives. We add the file to sys.path
    and import the top-level package (assumed to be 'pro_plugin').
    """
    try:
        path_str = str(plugin_path.resolve())
        if path_str not in sys.path:
            sys.path.insert(0, path_str)

        import pro_plugin as mod  # noqa: F811

        # Find ProPlugin subclass in the module
        for attr in dir(mod):
            try:
                cls = getattr(mod, attr)
                if (
                    isinstance(cls, type)
                    and issubclass(cls, ProPlugin)
                    and cls is not ProPlugin
                ):
                    return cls()
            except TypeError:
                continue
        return None
    except Exception:
        return None


def load_pro_plugin(app: "FastAPI") -> bool:
    """
    Load and register the Pro plugin if present.

    Returns True if a plugin was loaded and registered, False otherwise.
    """
    plugins_dir = _get_plugins_dir()
    plugin_path = _find_pro_plugin(plugins_dir)
    if plugin_path is None:
        return False

    license_key = None
    try:
        from services import settings
        license_key = settings.get_pro_license_key().strip() or None
    except Exception:
        pass

    plugin = _load_plugin_module(plugin_path)
    if plugin is None:
        return False

    global pro_loaded
    plugin.register(app, license_key=license_key)
    pro_loaded = True
    return True
