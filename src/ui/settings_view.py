"""
Settings view – auth management, manager info, and about section.
"""

import customtkinter as ctk

from src.ui.base_view import BaseView
from src.ui.components import Card, SectionTitle, InfoRow, LogConsole
from src.services import auth as auth_svc
from src.services import downloader as dl
from src.services import github as gh
from src.config import MANAGER_VERSION, GITHUB_REPO, REPORT_URL
from src.utils.java import check_java


class SettingsView(BaseView):
    def __init__(self, parent):
        super().__init__(parent)
        self._build_ui()

    def _build_ui(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(4, weight=1)

        # Title
        SectionTitle(self, text="Settings").grid(
            row=0, column=0, sticky="w", padx=24, pady=(24, 12)
        )

        # --- Auth card ---
        auth_card = Card(self)
        auth_card.grid(row=1, column=0, sticky="we", padx=24, pady=(0, 12))

        auth_inner = ctk.CTkFrame(auth_card, fg_color="transparent")
        auth_inner.pack(fill="x", padx=20, pady=16)
        auth_inner.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            auth_inner,
            text="Authentication",
            font=ctk.CTkFont(size=16, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="w", pady=(0, 4))

        ctk.CTkLabel(
            auth_inner,
            text="Delete stored credentials and re-authenticate with your Hytale account.",
            font=ctk.CTkFont(size=12),
            text_color=("gray40", "gray60"),
            anchor="w",
            wraplength=600,
        ).grid(row=1, column=0, sticky="w", pady=(0, 10))

        self._auth_badge = ctk.CTkLabel(
            auth_inner,
            text="",
            font=ctk.CTkFont(size=12),
            text_color=("gray40", "gray60"),
        )
        self._auth_badge.grid(row=2, column=0, sticky="w", pady=(0, 8))

        self._auth_btn = ctk.CTkButton(
            auth_inner,
            text="Refresh Auth",
            font=ctk.CTkFont(size=13, weight="bold"),
            height=38,
            corner_radius=10,
            command=self._on_refresh_auth,
        )
        self._auth_btn.grid(row=3, column=0, sticky="w")

        self._auth_log = LogConsole(auth_inner, height=100)
        self._auth_log.grid(row=4, column=0, sticky="we", pady=(8, 0))

        # --- About card ---
        about_card = Card(self)
        about_card.grid(row=2, column=0, sticky="we", padx=24, pady=(0, 12))

        about_inner = ctk.CTkFrame(about_card, fg_color="transparent")
        about_inner.pack(fill="x", padx=20, pady=16)
        about_inner.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            about_inner,
            text="About",
            font=ctk.CTkFont(size=16, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="w", pady=(0, 8))

        self._row_manager = InfoRow(about_inner, "Manager version:")
        self._row_manager.grid(row=1, column=0, sticky="we", pady=2)

        self._row_latest = InfoRow(about_inner, "Latest version:")
        self._row_latest.grid(row=2, column=0, sticky="we", pady=2)

        self._row_java = InfoRow(about_inner, "Java:")
        self._row_java.grid(row=3, column=0, sticky="we", pady=2)

        self._row_downloader = InfoRow(about_inner, "Downloader:")
        self._row_downloader.grid(row=4, column=0, sticky="we", pady=2)

        # Links
        links = ctk.CTkFrame(about_inner, fg_color="transparent")
        links.grid(row=5, column=0, sticky="w", pady=(12, 0))

        ctk.CTkLabel(
            links,
            text=f"GitHub: github.com/{GITHUB_REPO}",
            font=ctk.CTkFont(size=12),
            text_color=("gray40", "gray60"),
        ).pack(anchor="w")

        ctk.CTkLabel(
            links,
            text=f"Issues: {REPORT_URL}",
            font=ctk.CTkFont(size=12),
            text_color=("gray40", "gray60"),
        ).pack(anchor="w")

    # ------------------------------------------------------------------

    def on_appear(self):
        # Auth status
        if auth_svc.has_credentials():
            self._auth_badge.configure(text="Credentials found", text_color=("#27ae60", "#2ecc71"))
        else:
            self._auth_badge.configure(text="No credentials – auth required", text_color=("#e74c3c", "#c0392b"))

        # About info
        self._row_manager.set_value(f"v{MANAGER_VERSION}")
        self._row_latest.set_value("checking...")
        self._row_downloader.set_value("found" if dl.has_downloader() else "not found")

        java_ok, java_info = check_java()
        self._row_java.set_value(java_info if java_ok else "Not found")

        gh.check_manager_update(on_done=self._on_update_check)

    def _on_update_check(self, available: bool, version: str):
        def _update():
            if available:
                self._row_latest.set_value(f"v{version} (update available!)")
            else:
                self._row_latest.set_value(f"v{version} (up to date)")
        self.after(0, _update)

    # ------------------------------------------------------------------

    def _on_refresh_auth(self):
        self._auth_btn.configure(state="disabled", text="Authenticating...")
        self._auth_log.clear()

        def on_output(line):
            self.after(0, lambda l=line: self._auth_log.append(l))

        def on_done(rc):
            def _finish():
                if rc == 0:
                    self._auth_log.append("Auth refreshed successfully.")
                    self._auth_badge.configure(
                        text="Credentials found", text_color=("#27ae60", "#2ecc71")
                    )
                else:
                    self._auth_log.append("Auth may have failed. Please try again.")
                self._auth_btn.configure(state="normal", text="Refresh Auth")
            self.after(0, _finish)

        auth_svc.refresh_auth(on_output=on_output, on_done=on_done)
