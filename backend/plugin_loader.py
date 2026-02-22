"""
Load Experimental addon from the addons/ folder.

Scans for experimental_addon.whl or experimental_addon.pyz. If present, imports the addon
and calls register(app, license_key). Experimental addon code is never shipped with the
public build – Patreon users receive the addon file + license key separately.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import TYPE_CHECKING

from plugin_interface import ExperimentalAddon

if TYPE_CHECKING:
    from fastapi import FastAPI

# Addon candidates (checked in order)
_EXPERIMENTAL_ADDON_NAMES = ("experimental_addon.whl", "experimental_addon.pyz")

# Set by load_experimental_addon; read by /api/info for frontend
experimental_addon_loaded = False


def _get_addons_dir() -> Path:
    """
    Addons directory. Uses %APPDATA%/HytaleServerManager/addons/ so the addon
    persists across app updates (user data, not install dir).
    In dev mode: backend/addons/ for easier testing.
    """
    if getattr(sys, "frozen", False):
        app_data = Path(os.environ.get("APPDATA", os.path.expanduser("~"))) / "HytaleServerManager"
        return app_data / "addons"
    return Path(__file__).resolve().parent / "addons"


def _find_experimental_addon(addons_dir: Path) -> Path | None:
    """Return path to experimental_addon.whl or experimental_addon.pyz if present."""
    if not addons_dir.is_dir():
        return None
    for name in _EXPERIMENTAL_ADDON_NAMES:
        p = addons_dir / name
        if p.is_file():
            return p
    return None


def _load_addon_module(addon_path: Path) -> ExperimentalAddon | None:
    """
    Import addon and return ExperimentalAddon instance, or None on failure.

    For .whl and .pyz: both are zip archives. We add the file to sys.path
    and import the top-level package (assumed to be 'experimental_addon').
    """
    try:
        path_str = str(addon_path.resolve())
        if path_str not in sys.path:
            sys.path.insert(0, path_str)

        import experimental_addon as mod  # noqa: F811

        # Find ExperimentalAddon subclass in the module
        for attr in dir(mod):
            try:
                cls = getattr(mod, attr)
                if (
                    isinstance(cls, type)
                    and issubclass(cls, ExperimentalAddon)
                    and cls is not ExperimentalAddon
                ):
                    return cls()
            except TypeError:
                continue
        return None
    except Exception:
        return None


def load_experimental_addon(app: "FastAPI") -> bool:
    """
    Load and register the Experimental addon if present.

    Returns True if the addon was loaded and registered, False otherwise.
    """
    addons_dir = _get_addons_dir()
    addons_dir.mkdir(parents=True, exist_ok=True)
    addon_path = _find_experimental_addon(addons_dir)
    if addon_path is None:
        return False

    license_key = None
    try:
        from services import settings
        license_key = settings.get_experimental_addon_license_key().strip() or None
    except Exception:
        pass

    addon = _load_addon_module(addon_path)
    if addon is None:
        return False

    global experimental_addon_loaded
    addon.register(app, license_key=license_key)
    experimental_addon_loaded = True
    return True
