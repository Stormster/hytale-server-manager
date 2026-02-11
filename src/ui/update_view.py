"""
Updates view – check for server updates, switch channels, download + apply.
"""

import threading
import customtkinter as ctk

from src.ui.base_view import BaseView
from src.ui.components import Card, SectionTitle, InfoRow, StatusBadge, LogConsole
from src.services import updater


class UpdateView(BaseView):
    def __init__(self, parent):
        super().__init__(parent)
        self._build_ui()

    def _build_ui(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(3, weight=1)

        # Title
        SectionTitle(self, text="Server Updates").grid(
            row=0, column=0, sticky="w", padx=24, pady=(24, 12)
        )

        # --- Version info card ---
        self._info_card = Card(self)
        self._info_card.grid(row=1, column=0, sticky="we", padx=24, pady=(0, 12))
        self._info_card.grid_columnconfigure(0, weight=1)

        info_inner = ctk.CTkFrame(self._info_card, fg_color="transparent")
        info_inner.pack(fill="x", padx=20, pady=16)
        info_inner.grid_columnconfigure(0, weight=1)

        self._row_installed = InfoRow(info_inner, "Installed version:")
        self._row_installed.grid(row=0, column=0, sticky="we", pady=2)
        self._row_patchline = InfoRow(info_inner, "Patchline:")
        self._row_patchline.grid(row=1, column=0, sticky="we", pady=2)
        self._row_release = InfoRow(info_inner, "Latest release:")
        self._row_release.grid(row=2, column=0, sticky="we", pady=2)
        self._row_prerelease = InfoRow(info_inner, "Latest pre-release:")
        self._row_prerelease.grid(row=3, column=0, sticky="we", pady=2)

        self._status_badge = StatusBadge(info_inner, "—", "neutral")
        self._status_badge.grid(row=4, column=0, sticky="w", pady=(10, 0))

        # --- Action buttons ---
        actions = ctk.CTkFrame(self, fg_color="transparent")
        actions.grid(row=2, column=0, sticky="we", padx=24, pady=(0, 8))

        self._check_btn = ctk.CTkButton(
            actions,
            text="Check for Updates",
            font=ctk.CTkFont(size=14, weight="bold"),
            height=40,
            corner_radius=10,
            command=self._on_check,
        )
        self._check_btn.pack(side="left", padx=(0, 10))

        self._update_release_btn = ctk.CTkButton(
            actions,
            text="Update to Release",
            font=ctk.CTkFont(size=13),
            height=40,
            corner_radius=10,
            fg_color=("#27ae60", "#2ecc71"),
            hover_color=("#1e8449", "#27ae60"),
            command=lambda: self._on_update("release"),
            state="disabled",
        )
        self._update_release_btn.pack(side="left", padx=(0, 10))

        self._update_pre_btn = ctk.CTkButton(
            actions,
            text="Update to Pre-Release",
            font=ctk.CTkFont(size=13),
            height=40,
            corner_radius=10,
            fg_color=("#e67e22", "#f39c12"),
            hover_color=("#d35400", "#e67e22"),
            command=lambda: self._on_update("pre-release"),
            state="disabled",
        )
        self._update_pre_btn.pack(side="left")

        # --- Log output ---
        self._log = LogConsole(self, height=200)
        self._log.grid(row=3, column=0, sticky="nswe", padx=24, pady=(4, 24))

        # Cached status
        self._last_status: dict | None = None

    # ------------------------------------------------------------------

    def on_appear(self):
        self._populate_local()

    def _populate_local(self):
        """Fill in what we know locally (instant, no network)."""
        self._row_installed.set_value(updater.read_installed_version())
        self._row_patchline.set_value(updater.read_installed_patchline())
        self._row_release.set_value("—")
        self._row_prerelease.set_value("—")
        self._status_badge.set("Press Check for Updates", "neutral")

    # ------------------------------------------------------------------
    # Check
    # ------------------------------------------------------------------

    def _on_check(self):
        self._check_btn.configure(state="disabled", text="Checking...")
        self._log.clear()
        self._log.append("[Manager] Checking versions...")

        def _worker():
            status = updater.get_update_status()
            self.after(0, lambda: self._apply_status(status))

        threading.Thread(target=_worker, daemon=True).start()

    def _apply_status(self, status: dict):
        self._last_status = status
        self._row_installed.set_value(status["installed_version"])
        self._row_patchline.set_value(status["installed_patchline"])
        self._row_release.set_value(status["remote_release"] or "unavailable")
        self._row_prerelease.set_value(status["remote_prerelease"] or "unavailable")

        has_rel = status["update_available_release"]
        has_pre = status["update_available_prerelease"]

        if has_rel or has_pre:
            self._status_badge.set("Update available", "warning")
        else:
            self._status_badge.set("Up to date", "ok")

        self._update_release_btn.configure(state="normal" if has_rel else "disabled")
        self._update_pre_btn.configure(state="normal" if has_pre else "disabled")
        self._check_btn.configure(state="normal", text="Check for Updates")
        self._log.append("[Manager] Version check complete.")

    # ------------------------------------------------------------------
    # Update
    # ------------------------------------------------------------------

    def _on_update(self, patchline: str):
        self._check_btn.configure(state="disabled")
        self._update_release_btn.configure(state="disabled")
        self._update_pre_btn.configure(state="disabled")
        self._log.clear()

        def on_status(msg):
            self.after(0, lambda m=msg: self._log.append(m))

        def on_done(ok, msg):
            def _finish():
                self._log.append(msg)
                self._check_btn.configure(state="normal", text="Check for Updates")
                if ok:
                    self._status_badge.set("Updated!", "ok")
                    self._row_installed.set_value(updater.read_installed_version())
                    self._row_patchline.set_value(updater.read_installed_patchline())
                else:
                    self._status_badge.set("Update failed", "error")
            self.after(0, _finish)

        updater.perform_update(patchline, on_status=on_status, on_done=on_done)
