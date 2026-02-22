"""
Plugin interface for Experimental addon features.

Open core: this file is public. Experimental addon code lives in a separate
private module (experimental_addon.whl or experimental_addon.pyz) that Patreon users
receive via download link + license key.
"""

from abc import ABC, abstractmethod
from typing import Any

# Type for the FastAPI app (avoid circular imports)
AppLike = Any


class ExperimentalAddon(ABC):
    """
    Interface for Experimental addon.

    Experimental addon is loaded from the addons/ folder if experimental_addon.whl
    or experimental_addon.pyz is present. It receives the FastAPI app and
    optionally a license key for validation.
    """

    @abstractmethod
    def register(self, app: AppLike, license_key: str | None = None) -> None:
        """
        Register Experimental addon routes, middleware, and features with the app.

        Args:
            app: The FastAPI application instance.
            license_key: License key from settings (None if not configured).
                       The addon should validate this before enabling features.
        """
        pass
