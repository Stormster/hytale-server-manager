"""
Application-wide constants and configuration.
"""

import os
import sys


# ---------------------------------------------------------------------------
# Path resolution – works both in dev mode and when bundled with PyInstaller
# ---------------------------------------------------------------------------

def _get_base_dir() -> str:
    """Return the directory where the exe (or script) lives."""
    if getattr(sys, "frozen", False):
        # Running as a PyInstaller bundle
        return os.path.dirname(sys.executable)
    # Running as a normal Python script – go up one level from src/
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


BASE_DIR = _get_base_dir()

# ---------------------------------------------------------------------------
# Manager metadata
# ---------------------------------------------------------------------------

MANAGER_VERSION = "2.0.0"
APP_NAME = "Hytale Server Manager"
GITHUB_REPO = "Stormster/hytale-server-manager"
REPORT_URL = "https://HytaleLife.com/issues"

# ---------------------------------------------------------------------------
# Hytale downloader / server paths (relative to BASE_DIR)
# ---------------------------------------------------------------------------

DOWNLOADER_EXE = "hytale-downloader-windows-amd64.exe"
DOWNLOADER_ZIP_URL = "https://downloader.hytale.com/hytale-downloader.zip"
CREDENTIALS_FILE = ".hytale-downloader-credentials.json"
VERSION_FILE = "server_version.txt"
PATCHLINE_FILE = "server_patchline.txt"
BACKUP_DIR = "backups"
SERVER_DIR = "Server"
SERVER_JAR = os.path.join(SERVER_DIR, "HytaleServer.jar")
START_BAT = "start.bat"

# ---------------------------------------------------------------------------
# UI constants
# ---------------------------------------------------------------------------

WINDOW_WIDTH = 950
WINDOW_HEIGHT = 620
SIDEBAR_WIDTH = 180
