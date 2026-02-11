"""
Main application window – sidebar navigation and view switching.
"""

import customtkinter as ctk
from typing import Type

from src.config import APP_NAME, MANAGER_VERSION, WINDOW_WIDTH, WINDOW_HEIGHT, SIDEBAR_WIDTH
from src.ui.base_view import BaseView


class App(ctk.CTk):
    """Root application window."""

    def __init__(self):
        super().__init__()

        # --- Window setup ---
        self.title(f"{APP_NAME} v{MANAGER_VERSION}")
        self.geometry(f"{WINDOW_WIDTH}x{WINDOW_HEIGHT}")
        self.minsize(800, 500)
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        # Try to set icon (fail silently if not present)
        try:
            import os, sys
            if getattr(sys, "frozen", False):
                icon_path = os.path.join(os.path.dirname(sys.executable), "assets", "icon.ico")
            else:
                icon_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "icon.ico")
            if os.path.isfile(icon_path):
                self.iconbitmap(icon_path)
        except Exception:
            pass

        # --- Layout: sidebar | content ---
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        self._sidebar = ctk.CTkFrame(self, width=SIDEBAR_WIDTH, corner_radius=0, fg_color=("gray88", "gray12"))
        self._sidebar.grid(row=0, column=0, sticky="nswe")
        self._sidebar.grid_propagate(False)

        self._content = ctk.CTkFrame(self, fg_color="transparent")
        self._content.grid(row=0, column=1, sticky="nswe", padx=0, pady=0)
        self._content.grid_columnconfigure(0, weight=1)
        self._content.grid_rowconfigure(0, weight=1)

        # --- Sidebar header ---
        logo_label = ctk.CTkLabel(
            self._sidebar,
            text="Hytale\nServer Manager",
            font=ctk.CTkFont(size=16, weight="bold"),
        )
        logo_label.pack(pady=(24, 4))

        version_label = ctk.CTkLabel(
            self._sidebar,
            text=f"v{MANAGER_VERSION}",
            font=ctk.CTkFont(size=11),
            text_color=("gray50", "gray55"),
        )
        version_label.pack(pady=(0, 20))

        separator = ctk.CTkFrame(self._sidebar, height=1, fg_color=("gray78", "gray25"))
        separator.pack(fill="x", padx=16, pady=(0, 12))

        # --- State ---
        self._views: dict[str, BaseView] = {}
        self._nav_buttons: dict[str, ctk.CTkButton] = {}
        self._active_view_name: str | None = None

    # ------------------------------------------------------------------
    # Public API – used by main.py to register views
    # ------------------------------------------------------------------

    def register_view(self, name: str, label: str, view_class: Type[BaseView]) -> None:
        """
        Register a view.  Creates a sidebar button and instantiates the view
        (lazily placed in the content area).
        """
        view = view_class(self._content)

        btn = ctk.CTkButton(
            self._sidebar,
            text=label,
            font=ctk.CTkFont(size=14),
            fg_color="transparent",
            text_color=("gray10", "gray90"),
            hover_color=("gray78", "gray25"),
            anchor="w",
            height=38,
            corner_radius=8,
            command=lambda n=name: self.show_view(n),
        )
        btn.pack(fill="x", padx=12, pady=2)

        self._views[name] = view
        self._nav_buttons[name] = btn

    def show_view(self, name: str) -> None:
        """Switch the content area to the named view."""
        if name == self._active_view_name:
            return
        # Hide current
        if self._active_view_name and self._active_view_name in self._views:
            self._views[self._active_view_name].grid_forget()
        # Deselect old button
        if self._active_view_name and self._active_view_name in self._nav_buttons:
            self._nav_buttons[self._active_view_name].configure(
                fg_color="transparent", text_color=("gray10", "gray90")
            )
        # Show new
        self._active_view_name = name
        view = self._views[name]
        view.grid(row=0, column=0, sticky="nswe")
        view.on_appear()
        # Highlight button
        self._nav_buttons[name].configure(
            fg_color=("gray78", "gray25"), text_color=("gray10", "gray90")
        )

    def add_sidebar_spacer(self) -> None:
        """Push subsequent sidebar items to the bottom."""
        spacer = ctk.CTkFrame(self._sidebar, fg_color="transparent")
        spacer.pack(fill="both", expand=True)

    def add_sidebar_label(self, text: str) -> ctk.CTkLabel:
        """Add a small label at the bottom of the sidebar (e.g. branding)."""
        lbl = ctk.CTkLabel(
            self._sidebar,
            text=text,
            font=ctk.CTkFont(size=11),
            text_color=("gray50", "gray55"),
        )
        lbl.pack(pady=(4, 12))
        return lbl
