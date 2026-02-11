"""
Abstract base class for all views.  Every view is a CTkFrame that can be
shown/hidden and optionally refreshed when it becomes visible.
"""

import customtkinter as ctk


class BaseView(ctk.CTkFrame):
    """
    Subclass this for every page in the app.

    Subclasses must call ``super().__init__(parent)`` and build their
    widgets inside ``__init__``.

    Override ``on_appear()`` to refresh data every time the view is shown.
    """

    def __init__(self, parent: ctk.CTkFrame):
        super().__init__(parent, fg_color="transparent")

    def on_appear(self) -> None:
        """Called each time this view becomes the visible content pane."""
        pass
