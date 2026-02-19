# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for the Hytale Server Manager backend sidecar.

Build with:
    cd backend
    pyinstaller build.spec

Output: dist/server-manager-backend.exe
"""

import glob
import importlib.util
import os
import sys

block_cipher = None

# ---------------------------------------------------------------------------
# Explicitly find and include psutil (collect_all silently misses it sometimes)
# ---------------------------------------------------------------------------
_psutil_spec = importlib.util.find_spec('psutil')
assert _psutil_spec, "psutil is not installed! Run: pip install psutil"
_psutil_dir = os.path.dirname(_psutil_spec.origin)
print(f"[build] psutil found at: {_psutil_dir}")
print(f"[build] psutil contents: {os.listdir(_psutil_dir)}")

# .pyd files are C extensions - must go in binaries so they can be imported
_psutil_pyd_binaries = [
    (f, 'psutil')
    for f in glob.glob(os.path.join(_psutil_dir, '*.pyd'))
]
# .py files and everything else go in datas
_psutil_py_datas = [
    (f, 'psutil')
    for f in glob.glob(os.path.join(_psutil_dir, '*.py'))
]
print(f"[build] psutil binaries (.pyd): {_psutil_pyd_binaries}")

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=_psutil_pyd_binaries,
    datas=_psutil_py_datas,
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'requests',
        'packaging',
        'packaging.version',
        'psutil',
        'psutil._psutil_windows',
        'psutil._pswindows',
        'psutil._common',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='server-manager-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # UPX can corrupt .pyd C extensions
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # no console window; Tauri still captures stdout
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
