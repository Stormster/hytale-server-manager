#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv-backend"

# Kill any running backend (avoids "Text file busy" when binary is locked)
pkill -f server-manager-backend || true

# Ensure venv exists and has dependencies (avoids externally-managed-environment on Ubuntu)
if [ ! -d "$VENV_DIR" ]; then
    echo "==> Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
fi
echo "==> Ensuring Python dependencies..."
"$VENV_DIR/bin/pip" install -q -r "$ROOT_DIR/backend/requirements.txt"

echo "==> Building backend with PyInstaller..."
cd "$ROOT_DIR/backend"
"$VENV_DIR/bin/python" -m PyInstaller build.spec --noconfirm
cd "$ROOT_DIR"

if [ ! -f "$ROOT_DIR/backend/dist/server-manager-backend" ]; then
    echo "ERROR: Build failed - backend/dist/server-manager-backend not found."
    exit 1
fi

mkdir -p "$ROOT_DIR/src-tauri/binaries"
SIDECAR="server-manager-backend-x86_64-unknown-linux-gnu"
cp -f "$ROOT_DIR/backend/dist/server-manager-backend" "$ROOT_DIR/src-tauri/binaries/${SIDECAR}"
cp -f "$ROOT_DIR/backend/dist/server-manager-backend" "$ROOT_DIR/src-tauri/${SIDECAR}"

if [ -d "$ROOT_DIR/src-tauri/target/debug" ]; then
    cp -f "$ROOT_DIR/backend/dist/server-manager-backend" "$ROOT_DIR/src-tauri/target/debug/${SIDECAR}"
fi

echo "==> Backend sidecar copied to src-tauri/binaries/"
echo "==> Done! Run npm run tauri build to create the package."
