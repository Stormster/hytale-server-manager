
@echo off
setlocal

rem Stop any running backend (avoids "Access is denied" when exe is locked)
taskkill /F /IM server-manager-backend-x86_64-pc-windows-msvc.exe 2>nul
taskkill /F /IM server-manager-backend.exe 2>nul

echo ==^> Building backend with PyInstaller...
cd backend
python -m PyInstaller build.spec --noconfirm
cd ..

if not exist "backend\dist\server-manager-backend.exe" (
    echo ERROR: Build failed - backend\dist\server-manager-backend.exe not found.
    exit /b 1
)

if not exist "src-tauri\binaries" mkdir "src-tauri\binaries"
copy /Y "backend\dist\server-manager-backend.exe" "src-tauri\binaries\server-manager-backend-x86_64-pc-windows-msvc.exe"

rem Copy to src-tauri root for externalBin "server-manager-backend" (no path)
copy /Y "backend\dist\server-manager-backend.exe" "src-tauri\server-manager-backend-x86_64-pc-windows-msvc.exe"

rem Also copy next to exe for tauri dev
if exist "src-tauri\target\debug" (
    copy /Y "backend\dist\server-manager-backend.exe" "src-tauri\target\debug\server-manager-backend-x86_64-pc-windows-msvc.exe"
)

echo ==^> Backend sidecar copied to src-tauri\binaries\
echo ==^> Done! Run npm run tauri build to create the installer.
exit /b 0
