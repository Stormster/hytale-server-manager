"""
Dashboard view – home screen showing server status, quick actions,
update banner, and first-time setup wizard when no server is installed.
"""

import customtkinter as ctk

from src.ui.base_view import BaseView
from src.ui.components import Card, SectionTitle, InfoRow, StatusBadge
from src.services import server as server_svc
from src.services import updater
from src.services import github as gh
from src.services import downloader as dl
from src.utils.java import check_java
from src.config import MANAGER_VERSION, REPORT_URL


class DashboardView(BaseView):
    def __init__(self, parent):
        super().__init__(parent)
        self._setup_mode = False
        self._build_ui()

    # ------------------------------------------------------------------
    # UI construction
    # ------------------------------------------------------------------

    def _build_ui(self):
        self.grid_columnconfigure(0, weight=1)

        # --- Update banner (hidden by default) ---
        self._update_banner = ctk.CTkFrame(self, fg_color=("#dfe6e9", "#2d3436"), corner_radius=10)
        self._update_banner_label = ctk.CTkLabel(
            self._update_banner,
            text="",
            font=ctk.CTkFont(size=13),
        )
        self._update_banner_label.pack(side="left", padx=16, pady=10)
        self._update_banner_link = ctk.CTkLabel(
            self._update_banner,
            text="View release",
            font=ctk.CTkFont(size=12, underline=True),
            text_color=("#2980b9", "#3498db"),
            cursor="hand2",
        )
        self._update_banner_link.pack(side="right", padx=16, pady=10)
        # banner is packed in on_appear only if needed

        # --- Main content area ---
        self._main_frame = ctk.CTkFrame(self, fg_color="transparent")
        self._main_frame.grid(row=1, column=0, sticky="nswe", padx=24, pady=(12, 24))
        self._main_frame.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # Title
        SectionTitle(self._main_frame, text="Dashboard").grid(
            row=0, column=0, sticky="w", pady=(0, 12)
        )

        # --- Status card ---
        self._status_card = Card(self._main_frame)
        self._status_card.grid(row=1, column=0, sticky="we", pady=(0, 16))
        self._status_card.grid_columnconfigure(0, weight=1)

        inner = ctk.CTkFrame(self._status_card, fg_color="transparent")
        inner.pack(fill="x", padx=20, pady=16)
        inner.grid_columnconfigure(0, weight=1)

        self._server_badge = StatusBadge(inner, "Checking...", "neutral")
        self._server_badge.grid(row=0, column=0, sticky="w", pady=(0, 10))

        self._row_version = InfoRow(inner, "Installed version:")
        self._row_version.grid(row=1, column=0, sticky="we", pady=2)
        self._row_patchline = InfoRow(inner, "Patchline:")
        self._row_patchline.grid(row=2, column=0, sticky="we", pady=2)
        self._row_java = InfoRow(inner, "Java:")
        self._row_java.grid(row=3, column=0, sticky="we", pady=2)

        # --- Quick actions ---
        actions_frame = ctk.CTkFrame(self._main_frame, fg_color="transparent")
        actions_frame.grid(row=2, column=0, sticky="we", pady=(0, 16))

        self._start_btn = ctk.CTkButton(
            actions_frame,
            text="Start Server",
            font=ctk.CTkFont(size=14, weight="bold"),
            height=42,
            corner_radius=10,
            command=self._on_start_server,
        )
        self._start_btn.pack(side="left", padx=(0, 10))

        self._stop_btn = ctk.CTkButton(
            actions_frame,
            text="Stop Server",
            font=ctk.CTkFont(size=14),
            height=42,
            corner_radius=10,
            fg_color=("#e74c3c", "#c0392b"),
            hover_color=("#c0392b", "#a93226"),
            command=self._on_stop_server,
        )
        self._stop_btn.pack(side="left", padx=(0, 10))

        # --- First-time setup frame (hidden unless needed) ---
        self._setup_frame = Card(self._main_frame)
        self._setup_inner = ctk.CTkFrame(self._setup_frame, fg_color="transparent")
        self._setup_inner.pack(fill="both", expand=True, padx=20, pady=16)

        ctk.CTkLabel(
            self._setup_inner,
            text="First-Time Setup",
            font=ctk.CTkFont(size=18, weight="bold"),
        ).pack(anchor="w", pady=(0, 8))

        ctk.CTkLabel(
            self._setup_inner,
            text="No server installation found. Choose an update channel to get started.",
            font=ctk.CTkFont(size=13),
            text_color=("gray40", "gray60"),
        ).pack(anchor="w", pady=(0, 16))

        channel_frame = ctk.CTkFrame(self._setup_inner, fg_color="transparent")
        channel_frame.pack(anchor="w", pady=(0, 12))

        self._channel_var = ctk.StringVar(value="release")
        ctk.CTkRadioButton(
            channel_frame, text="Release (recommended, stable)",
            variable=self._channel_var, value="release",
            font=ctk.CTkFont(size=13),
        ).pack(anchor="w", pady=2)
        ctk.CTkRadioButton(
            channel_frame, text="Pre-Release (experimental)",
            variable=self._channel_var, value="pre-release",
            font=ctk.CTkFont(size=13),
        ).pack(anchor="w", pady=2)

        self._setup_btn = ctk.CTkButton(
            self._setup_inner,
            text="Install Server",
            font=ctk.CTkFont(size=14, weight="bold"),
            height=40,
            corner_radius=10,
            command=self._on_first_time_setup,
        )
        self._setup_btn.pack(anchor="w", pady=(8, 12))

        # Progress area inside setup card
        self._setup_progress_frame = ctk.CTkFrame(self._setup_inner, fg_color="transparent")
        # Not packed yet – shown during install

        self._setup_progress_status = ctk.CTkLabel(
            self._setup_progress_frame,
            text="Preparing...",
            font=ctk.CTkFont(size=13),
            anchor="w",
        )
        self._setup_progress_status.pack(anchor="w", pady=(0, 6))

        bar_row = ctk.CTkFrame(self._setup_progress_frame, fg_color="transparent")
        bar_row.pack(fill="x")
        bar_row.grid_columnconfigure(0, weight=1)

        self._setup_progress_bar = ctk.CTkProgressBar(
            bar_row,
            height=18,
            corner_radius=8,
            progress_color=("#3498db", "#2980b9"),
        )
        self._setup_progress_bar.grid(row=0, column=0, sticky="we", padx=(0, 12))
        self._setup_progress_bar.set(0)

        self._setup_progress_pct = ctk.CTkLabel(
            bar_row,
            text="0%",
            font=ctk.CTkFont(size=13, weight="bold"),
            width=50,
            anchor="e",
        )
        self._setup_progress_pct.grid(row=0, column=1, sticky="e")

        self._setup_progress_detail = ctk.CTkLabel(
            self._setup_progress_frame,
            text="",
            font=ctk.CTkFont(size=12),
            text_color=("gray40", "gray60"),
            anchor="w",
        )
        self._setup_progress_detail.pack(anchor="w", pady=(6, 0))

        # --- Footer ---
        footer = ctk.CTkLabel(
            self._main_frame,
            text=f"Report issues: {REPORT_URL}",
            font=ctk.CTkFont(size=11),
            text_color=("gray50", "gray55"),
        )
        footer.grid(row=10, column=0, sticky="w", pady=(8, 0))

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def on_appear(self):
        self._refresh_status()
        gh.check_manager_update(on_done=self._on_manager_update_check)

    # ------------------------------------------------------------------
    # Status refresh
    # ------------------------------------------------------------------

    def _refresh_status(self):
        installed = server_svc.is_installed()
        running = server_svc.is_running()

        if not installed:
            self._server_badge.set("Not Installed", "warning")
            self._row_version.set_value("—")
            self._row_patchline.set_value("—")
            self._start_btn.configure(state="disabled")
            self._stop_btn.configure(state="disabled")
            # Show setup wizard
            self._setup_frame.grid(row=3, column=0, sticky="we", pady=(0, 16))
            self._setup_mode = True
        else:
            self._setup_frame.grid_forget()
            self._setup_mode = False

            if running:
                self._server_badge.set("Running", "ok")
                self._start_btn.configure(state="disabled")
                self._stop_btn.configure(state="normal")
            else:
                self._server_badge.set("Stopped", "neutral")
                self._start_btn.configure(state="normal")
                self._stop_btn.configure(state="disabled")

            self._row_version.set_value(updater.read_installed_version())
            self._row_patchline.set_value(updater.read_installed_patchline())

        # Java check
        java_ok, java_info = check_java()
        self._row_java.set_value(java_info if java_ok else "Not found")

    # ------------------------------------------------------------------
    # Manager self-update banner
    # ------------------------------------------------------------------

    def _on_manager_update_check(self, available: bool, version: str):
        def _update():
            if available:
                self._update_banner_label.configure(
                    text=f"Manager v{version} is available (current: v{MANAGER_VERSION})"
                )
                self._update_banner.grid(row=0, column=0, sticky="we", padx=24, pady=(16, 0))
            else:
                self._update_banner.grid_forget()
        self.after(0, _update)

    # ------------------------------------------------------------------
    # Quick actions
    # ------------------------------------------------------------------

    def _on_start_server(self):
        # Delegate to the Server view (parent app can switch)
        app = self.winfo_toplevel()
        if hasattr(app, "show_view"):
            app.show_view("server")
            server_view = app._views.get("server")
            if server_view and hasattr(server_view, "start_server"):
                server_view.start_server()

    def _on_stop_server(self):
        server_svc.stop()
        self.after(500, self._refresh_status)

    # ------------------------------------------------------------------
    # First-time setup
    # ------------------------------------------------------------------

    def _on_first_time_setup(self):
        self._setup_btn.configure(state="disabled", text="Installing...")
        patchline = self._channel_var.get()

        # Show progress bar
        self._setup_progress_bar.set(0)
        self._setup_progress_bar.configure(progress_color=("#3498db", "#2980b9"))
        self._setup_progress_pct.configure(text="0%")
        self._setup_progress_detail.configure(text="")
        self._setup_progress_status.configure(text="Preparing...")
        self._setup_progress_frame.pack(fill="x", pady=(4, 0))

        def on_status(msg):
            self.after(0, lambda m=msg: self._setup_progress_status.configure(text=m))

        def on_progress(percent, detail):
            def _update():
                self._setup_progress_bar.set(percent / 100.0)
                self._setup_progress_pct.configure(text=f"{percent:.0f}%")
                self._setup_progress_detail.configure(text=detail)
            self.after(0, _update)

        def on_done(ok, msg):
            def _finish():
                if ok:
                    self._setup_progress_bar.set(1.0)
                    self._setup_progress_pct.configure(text="100%")
                    self._setup_progress_bar.configure(progress_color=("#2ecc71", "#27ae60"))
                    self._setup_progress_status.configure(text=msg)
                    self._setup_btn.configure(text="Done!", state="disabled")
                    self.after(1500, self._refresh_status)
                else:
                    self._setup_progress_status.configure(text=msg)
                    self._setup_progress_bar.configure(progress_color=("#e74c3c", "#c0392b"))
                    self._setup_btn.configure(text="Install Server", state="normal")
            self.after(0, _finish)

        updater.perform_first_time_setup(
            patchline, on_status=on_status, on_progress=on_progress, on_done=on_done
        )
