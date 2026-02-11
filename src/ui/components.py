"""
Reusable UI widgets used across views.
"""

import customtkinter as ctk
from typing import Optional


class StatusBadge(ctk.CTkLabel):
    """A small coloured badge showing a status string."""

    COLORS = {
        "ok": ("#2ecc71", "#27ae60"),
        "warning": ("#f39c12", "#e67e22"),
        "error": ("#e74c3c", "#c0392b"),
        "info": ("#3498db", "#2980b9"),
        "neutral": ("#636e72", "#2d3436"),
    }

    def __init__(self, parent, text: str = "", variant: str = "neutral", **kwargs):
        colors = self.COLORS.get(variant, self.COLORS["neutral"])
        super().__init__(
            parent,
            text=f"  {text}  ",
            fg_color=colors[1],
            text_color="#ffffff",
            corner_radius=6,
            font=ctk.CTkFont(size=12, weight="bold"),
            **kwargs,
        )

    def set(self, text: str, variant: str = "neutral"):
        colors = self.COLORS.get(variant, self.COLORS["neutral"])
        self.configure(text=f"  {text}  ", fg_color=colors[1])


class LogConsole(ctk.CTkTextbox):
    """A read-only scrolling text area for log / console output."""

    def __init__(self, parent, **kwargs):
        super().__init__(
            parent,
            state="disabled",
            font=ctk.CTkFont(family="Consolas", size=13),
            wrap="word",
            **kwargs,
        )

    def append(self, text: str) -> None:
        self.configure(state="normal")
        self.insert("end", text + "\n")
        self.see("end")
        self.configure(state="disabled")

    def clear(self) -> None:
        self.configure(state="normal")
        self.delete("1.0", "end")
        self.configure(state="disabled")


class Card(ctk.CTkFrame):
    """A rounded card container with a subtle background."""

    def __init__(self, parent, **kwargs):
        super().__init__(
            parent,
            corner_radius=12,
            fg_color=("gray92", "gray17"),
            **kwargs,
        )


class SectionTitle(ctk.CTkLabel):
    """A styled section heading."""

    def __init__(self, parent, text: str, **kwargs):
        super().__init__(
            parent,
            text=text,
            font=ctk.CTkFont(size=20, weight="bold"),
            anchor="w",
            **kwargs,
        )


class InfoRow(ctk.CTkFrame):
    """A key-value row: label on the left, value on the right."""

    def __init__(self, parent, label: str, value: str = "", **kwargs):
        super().__init__(parent, fg_color="transparent", **kwargs)
        self._label = ctk.CTkLabel(
            self, text=label, font=ctk.CTkFont(size=13), text_color=("gray40", "gray60"), anchor="w"
        )
        self._label.pack(side="left")
        self._value = ctk.CTkLabel(
            self, text=value, font=ctk.CTkFont(size=13, weight="bold"), anchor="e"
        )
        self._value.pack(side="right")

    def set_value(self, value: str) -> None:
        self._value.configure(text=value)
