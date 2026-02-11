"""
Backups view – list, create, restore, and delete backups.
"""

import threading
import customtkinter as ctk

from src.ui.base_view import BaseView
from src.ui.components import Card, SectionTitle
from src.services import backup as bk
from src.services.backup import BackupEntry


class BackupView(BaseView):
    def __init__(self, parent):
        super().__init__(parent)
        self._entries: list[BackupEntry] = []
        self._build_ui()

    def _build_ui(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)

        # Header
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.grid(row=0, column=0, sticky="we", padx=24, pady=(24, 0))
        header.grid_columnconfigure(0, weight=1)

        SectionTitle(header, text="Backups").grid(row=0, column=0, sticky="w")

        self._create_btn = ctk.CTkButton(
            header,
            text="Create Backup",
            font=ctk.CTkFont(size=14, weight="bold"),
            height=38,
            corner_radius=10,
            command=self._on_create,
        )
        self._create_btn.grid(row=0, column=1, sticky="e")

        # Status label
        self._status = ctk.CTkLabel(
            self, text="", font=ctk.CTkFont(size=12), text_color=("gray40", "gray60")
        )
        self._status.grid(row=1, column=0, sticky="w", padx=24, pady=(8, 4))

        # Scrollable list
        self._list_frame = ctk.CTkScrollableFrame(
            self, fg_color="transparent", corner_radius=0
        )
        self._list_frame.grid(row=2, column=0, sticky="nswe", padx=24, pady=(0, 24))
        self._list_frame.grid_columnconfigure(0, weight=1)

    # ------------------------------------------------------------------

    def on_appear(self):
        self._refresh_list()

    def _refresh_list(self):
        # Clear existing rows
        for widget in self._list_frame.winfo_children():
            widget.destroy()

        self._entries = bk.list_backups()

        if not self._entries:
            self._status.configure(text="No backups found. Create one to get started.")
            return

        self._status.configure(text=f"{len(self._entries)} backup(s)")

        for idx, entry in enumerate(self._entries):
            self._add_row(idx, entry)

    def _add_row(self, idx: int, entry: BackupEntry):
        row = Card(self._list_frame)
        row.grid(row=idx, column=0, sticky="we", pady=(0, 8))
        row.grid_columnconfigure(0, weight=1)

        inner = ctk.CTkFrame(row, fg_color="transparent")
        inner.pack(fill="x", padx=16, pady=12)
        inner.grid_columnconfigure(0, weight=1)

        # Title row: type badge + title
        title_row = ctk.CTkFrame(inner, fg_color="transparent")
        title_row.grid(row=0, column=0, sticky="w")

        # Type badge
        is_update = entry.backup_type == "pre-update"
        badge_text = "UPDATE" if is_update else "MANUAL"
        badge_color = ("#e67e22", "#d35400") if is_update else ("#3498db", "#2980b9")
        badge = ctk.CTkLabel(
            title_row,
            text=f" {badge_text} ",
            font=ctk.CTkFont(size=10, weight="bold"),
            fg_color=badge_color[1],
            text_color="#ffffff",
            corner_radius=4,
        )
        badge.pack(side="left", padx=(0, 8))

        title_label = ctk.CTkLabel(
            title_row,
            text=entry.display_title,
            font=ctk.CTkFont(size=13, weight="bold"),
            anchor="w",
        )
        title_label.pack(side="left")

        # Version detail (e.g. "2026.02.06 (pre-release) → 2026.02.06 (release)")
        detail = entry.display_detail
        if detail:
            detail_label = ctk.CTkLabel(
                inner,
                text=detail,
                font=ctk.CTkFont(size=12),
                text_color=("gray35", "gray65"),
                anchor="w",
            )
            detail_label.grid(row=1, column=0, sticky="w", pady=(2, 0))

        # Date
        date_str = entry.created.strftime("%b %d, %Y at %I:%M %p") if entry.created else "Unknown"
        date_label = ctk.CTkLabel(
            inner,
            text=date_str,
            font=ctk.CTkFont(size=11),
            text_color=("gray50", "gray55"),
            anchor="w",
        )
        date_label.grid(row=2, column=0, sticky="w", pady=(2, 0))

        # Buttons
        btn_frame = ctk.CTkFrame(inner, fg_color="transparent")
        btn_frame.grid(row=0, column=1, rowspan=3, sticky="e", padx=(12, 0))

        restore_btn = ctk.CTkButton(
            btn_frame,
            text="Restore",
            width=80,
            height=32,
            font=ctk.CTkFont(size=12),
            corner_radius=8,
            command=lambda e=entry: self._on_restore(e),
        )
        restore_btn.pack(side="left", padx=(0, 6))

        delete_btn = ctk.CTkButton(
            btn_frame,
            text="Delete",
            width=70,
            height=32,
            font=ctk.CTkFont(size=12),
            corner_radius=8,
            fg_color=("#e74c3c", "#c0392b"),
            hover_color=("#c0392b", "#a93226"),
            command=lambda e=entry: self._on_delete(e),
        )
        delete_btn.pack(side="left")

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def _on_create(self):
        self._create_btn.configure(state="disabled", text="Creating...")
        self._status.configure(text="Creating backup...")

        def _worker():
            try:
                bk.create_backup()
                self.after(0, lambda: self._finish_create(True, "Backup created."))
            except Exception as exc:
                self.after(0, lambda: self._finish_create(False, str(exc)))

        threading.Thread(target=_worker, daemon=True).start()

    def _finish_create(self, ok: bool, msg: str):
        self._create_btn.configure(state="normal", text="Create Backup")
        self._status.configure(text=msg)
        if ok:
            self._refresh_list()

    def _on_restore(self, entry: BackupEntry):
        dialog = ctk.CTkInputDialog(
            text=f"Type YES to restore:\n{entry.name}\n\nWARNING: This will replace your current server files.",
            title="Confirm Restore",
        )
        result = dialog.get_input()
        if result and result.strip().upper() == "YES":
            self._status.configure(text="Restoring...")
            try:
                bk.restore_backup(entry)
                self._status.configure(text="Restore complete.")
            except Exception as exc:
                self._status.configure(text=f"Restore failed: {exc}")

    def _on_delete(self, entry: BackupEntry):
        dialog = ctk.CTkInputDialog(
            text=f"Type YES to permanently delete:\n{entry.name}",
            title="Confirm Delete",
        )
        result = dialog.get_input()
        if result and result.strip().upper() == "YES":
            try:
                bk.delete_backup(entry)
                self._status.configure(text="Backup deleted.")
                self._refresh_list()
            except Exception as exc:
                self._status.configure(text=f"Delete failed: {exc}")
