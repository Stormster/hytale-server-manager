"""
Server view – start / stop the server and stream live console output.
"""

import customtkinter as ctk

from src.ui.base_view import BaseView
from src.ui.components import SectionTitle, StatusBadge, LogConsole
from src.services import server as server_svc


class ServerView(BaseView):
    def __init__(self, parent):
        super().__init__(parent)
        self._build_ui()

    def _build_ui(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # Header row
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.grid(row=0, column=0, sticky="we", padx=24, pady=(24, 0))
        header.grid_columnconfigure(0, weight=1)

        SectionTitle(header, text="Server Console").grid(row=0, column=0, sticky="w")
        self._badge = StatusBadge(header, "Stopped", "neutral")
        self._badge.grid(row=0, column=1, sticky="e")

        # Controls
        controls = ctk.CTkFrame(self, fg_color="transparent")
        controls.grid(row=1, column=0, sticky="we", padx=24, pady=(12, 0))

        self._start_btn = ctk.CTkButton(
            controls,
            text="Start Server",
            font=ctk.CTkFont(size=14, weight="bold"),
            height=40,
            corner_radius=10,
            command=self.start_server,
        )
        self._start_btn.pack(side="left", padx=(0, 10))

        self._stop_btn = ctk.CTkButton(
            controls,
            text="Stop Server",
            font=ctk.CTkFont(size=14),
            height=40,
            corner_radius=10,
            fg_color=("#e74c3c", "#c0392b"),
            hover_color=("#c0392b", "#a93226"),
            command=self._on_stop,
            state="disabled",
        )
        self._stop_btn.pack(side="left", padx=(0, 10))

        self._clear_btn = ctk.CTkButton(
            controls,
            text="Clear Log",
            font=ctk.CTkFont(size=13),
            height=40,
            corner_radius=10,
            fg_color="transparent",
            border_width=1,
            text_color=("gray10", "gray90"),
            command=self._on_clear,
        )
        self._clear_btn.pack(side="left")

        # Console
        self._console = LogConsole(self, height=400)
        self._console.grid(row=2, column=0, sticky="nswe", padx=24, pady=(12, 24))

    # ------------------------------------------------------------------

    def on_appear(self):
        self._sync_buttons()

    def _sync_buttons(self):
        running = server_svc.is_running()
        if running:
            self._badge.set("Running", "ok")
            self._start_btn.configure(state="disabled")
            self._stop_btn.configure(state="normal")
        else:
            self._badge.set("Stopped", "neutral")
            self._start_btn.configure(state="normal" if server_svc.is_installed() else "disabled")
            self._stop_btn.configure(state="disabled")

    # ------------------------------------------------------------------

    def start_server(self):
        if server_svc.is_running():
            return
        self._console.clear()
        self._console.append("[Manager] Starting server...")
        self._badge.set("Starting...", "info")
        self._start_btn.configure(state="disabled")
        self._stop_btn.configure(state="normal")

        def on_output(line):
            self.after(0, lambda l=line: self._console.append(l))

        def on_done(rc):
            def _finish():
                self._console.append(f"\n[Manager] Server exited (code {rc}).")
                self._sync_buttons()
            self.after(0, _finish)

        server_svc.start(on_output=on_output, on_done=on_done)

    def _on_stop(self):
        self._console.append("[Manager] Stopping server...")
        server_svc.stop()
        self.after(1000, self._sync_buttons)

    def _on_clear(self):
        self._console.clear()
