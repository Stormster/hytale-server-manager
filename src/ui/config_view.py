"""
Configuration view – inline JSON editor for server config files and log viewer.
"""

import os
import json
import customtkinter as ctk

from src.ui.base_view import BaseView
from src.ui.components import Card, SectionTitle
from src.config import SERVER_DIR
from src.utils.paths import resolve


_CONFIG_FILES = [
    ("config.json", "Server configuration"),
    ("whitelist.json", "Allowed players"),
    ("bans.json", "Banned players"),
]


class ConfigView(BaseView):
    def __init__(self, parent):
        super().__init__(parent)
        self._current_file: str | None = None
        self._build_ui()

    def _build_ui(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # Title
        SectionTitle(self, text="Configuration").grid(
            row=0, column=0, sticky="w", padx=24, pady=(24, 12)
        )

        # Tab bar
        tab_bar = ctk.CTkFrame(self, fg_color="transparent")
        tab_bar.grid(row=1, column=0, sticky="we", padx=24, pady=(0, 8))

        self._tab_buttons: dict[str, ctk.CTkButton] = {}
        for filename, desc in _CONFIG_FILES:
            btn = ctk.CTkButton(
                tab_bar,
                text=filename,
                font=ctk.CTkFont(size=13),
                height=34,
                corner_radius=8,
                fg_color="transparent",
                text_color=("gray10", "gray90"),
                hover_color=("gray78", "gray25"),
                command=lambda f=filename: self._load_file(f),
            )
            btn.pack(side="left", padx=(0, 6))
            self._tab_buttons[filename] = btn

        # View log button
        self._log_btn = ctk.CTkButton(
            tab_bar,
            text="View Latest Log",
            font=ctk.CTkFont(size=13),
            height=34,
            corner_radius=8,
            fg_color="transparent",
            border_width=1,
            text_color=("gray10", "gray90"),
            command=self._open_latest_log,
        )
        self._log_btn.pack(side="right")

        # Editor card
        editor_card = Card(self)
        editor_card.grid(row=2, column=0, sticky="nswe", padx=24, pady=(0, 12))
        editor_card.grid_columnconfigure(0, weight=1)
        editor_card.grid_rowconfigure(1, weight=1)

        self._file_label = ctk.CTkLabel(
            editor_card,
            text="Select a file above to edit",
            font=ctk.CTkFont(size=12),
            text_color=("gray50", "gray55"),
        )
        self._file_label.grid(row=0, column=0, sticky="w", padx=16, pady=(12, 4))

        self._editor = ctk.CTkTextbox(
            editor_card,
            font=ctk.CTkFont(family="Consolas", size=13),
            wrap="none",
        )
        self._editor.grid(row=1, column=0, sticky="nswe", padx=12, pady=(0, 12))

        # Save button
        self._save_btn = ctk.CTkButton(
            editor_card,
            text="Save",
            font=ctk.CTkFont(size=13, weight="bold"),
            height=36,
            corner_radius=8,
            command=self._save_file,
            state="disabled",
        )
        self._save_btn.grid(row=2, column=0, sticky="e", padx=16, pady=(0, 12))

        # Status
        self._status = ctk.CTkLabel(
            self,
            text="",
            font=ctk.CTkFont(size=12),
            text_color=("gray50", "gray55"),
        )
        self._status.grid(row=3, column=0, sticky="w", padx=24, pady=(0, 16))

    # ------------------------------------------------------------------

    def on_appear(self):
        if not self._current_file:
            # Auto-load config.json if it exists
            cfg = os.path.join(resolve(SERVER_DIR), "config.json")
            if os.path.isfile(cfg):
                self._load_file("config.json")

    # ------------------------------------------------------------------

    def _load_file(self, filename: str):
        self._current_file = filename
        path = os.path.join(resolve(SERVER_DIR), filename)

        # Update tab highlight
        for name, btn in self._tab_buttons.items():
            if name == filename:
                btn.configure(fg_color=("gray78", "gray25"))
            else:
                btn.configure(fg_color="transparent")

        if not os.path.isfile(path):
            self._file_label.configure(text=f"{filename} — file not found")
            self._editor.delete("1.0", "end")
            self._save_btn.configure(state="disabled")
            return

        self._file_label.configure(text=f"Editing: Server/{filename}")
        self._editor.delete("1.0", "end")

        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            # Pretty-print JSON for readability
            try:
                parsed = json.loads(content)
                content = json.dumps(parsed, indent=2, ensure_ascii=False)
            except json.JSONDecodeError:
                pass  # show raw content
            self._editor.insert("1.0", content)
            self._save_btn.configure(state="normal")
            self._status.configure(text="")
        except Exception as exc:
            self._status.configure(text=f"Error reading file: {exc}")

    def _save_file(self):
        if not self._current_file:
            return
        path = os.path.join(resolve(SERVER_DIR), self._current_file)
        content = self._editor.get("1.0", "end").strip()

        # Validate JSON
        try:
            parsed = json.loads(content)
            content = json.dumps(parsed, indent=2, ensure_ascii=False)
        except json.JSONDecodeError as exc:
            self._status.configure(text=f"Invalid JSON: {exc}")
            return

        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            self._status.configure(text=f"Saved {self._current_file}")
            # Reload to show clean formatting
            self._load_file(self._current_file)
        except Exception as exc:
            self._status.configure(text=f"Error saving: {exc}")

    def _open_latest_log(self):
        log_dir = os.path.join(resolve(SERVER_DIR), "logs")
        if not os.path.isdir(log_dir):
            self._status.configure(text="No logs directory found.")
            return

        logs = sorted(
            [f for f in os.listdir(log_dir) if f.endswith(".log")],
            key=lambda f: os.path.getmtime(os.path.join(log_dir, f)),
            reverse=True,
        )
        if not logs:
            self._status.configure(text="No log files found.")
            return

        log_path = os.path.join(log_dir, logs[0])
        # Open in system default viewer
        os.startfile(log_path)  # type: ignore[attr-defined]
