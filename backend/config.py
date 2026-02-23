"""
Application-wide constants and configuration.

Path resolution has moved to utils/paths.py (resolve_root / resolve_instance).
This module only holds static constants.
"""

import os

# ---------------------------------------------------------------------------
# Manager metadata
# ---------------------------------------------------------------------------

MANAGER_VERSION = "2.5.0"
APP_NAME = "Hytale Server Manager"
GITHUB_REPO = "Stormster/hytale-server-manager"
REPORT_URL = "https://github.com/Stormster/hytale-server-manager/issues"

# ---------------------------------------------------------------------------
# Hytale downloader / server paths (relative names only)
# ---------------------------------------------------------------------------

DOWNLOADER_EXE = "hytale-downloader-windows-amd64.exe"
DOWNLOADER_ZIP_URL = "https://downloader.hytale.com/hytale-downloader.zip"
CREDENTIALS_FILE = ".hytale-downloader-credentials.json"
VERSION_FILE = "server_version.txt"
PATCHLINE_FILE = "server_patchline.txt"
BACKUP_DIR = "backups"
SERVER_DIR = "Server"
SERVER_JAR = os.path.join(SERVER_DIR, "HytaleServer.jar")
