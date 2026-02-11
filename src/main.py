"""
Entry point for the Hytale Server Manager GUI.
"""

import sys
import os

# Ensure project root is on the path so `src.*` imports work in dev mode.
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from src.app import App
from src.ui.dashboard_view import DashboardView
from src.ui.server_view import ServerView
from src.ui.update_view import UpdateView
from src.ui.backup_view import BackupView
from src.ui.config_view import ConfigView
from src.ui.settings_view import SettingsView


def main():
    app = App()

    # Register views – order here = order in sidebar
    app.register_view("dashboard", "Dashboard", DashboardView)
    app.register_view("server", "Server", ServerView)
    app.register_view("updates", "Updates", UpdateView)
    app.register_view("backups", "Backups", BackupView)
    app.register_view("config", "Configuration", ConfigView)

    # Push settings to the bottom
    app.add_sidebar_spacer()
    app.register_view("settings", "Settings", SettingsView)
    app.add_sidebar_label("HytaleLife.com")

    # Show dashboard by default
    app.show_view("dashboard")

    app.mainloop()


if __name__ == "__main__":
    main()
