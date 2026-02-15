"""
Plugin interface for Pro/premium features.

Open core: this file is public. Pro plugin code lives in a separate
private module (pro_plugin.whl or pro_plugin.pyz) that Patreon users
receive via download link + license key.
"""

from abc import ABC, abstractmethod
from typing import Any

# Type for the FastAPI app (avoid circular imports)
AppLike = Any


class ProPlugin(ABC):
    """
    Interface for premium plugins.

    Pro plugins are loaded from the plugins/ folder if pro_plugin.whl
    or pro_plugin.pyz is present. They receive the FastAPI app and
    optionally a license key for validation.
    """

    @abstractmethod
    def register(self, app: AppLike, license_key: str | None = None) -> None:
        """
        Register Pro routes, middleware, and features with the app.

        Args:
            app: The FastAPI application instance.
            license_key: License key from settings (None if not configured).
                       The plugin should validate this before enabling features.
        """
        pass
