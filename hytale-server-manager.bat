@echo off
setlocal EnableDelayedExpansion
title Hytale Server Manager - HytaleLife.com

rem ============================================================================
rem  Hytale Server Manager - Made by HytaleLife.com
rem  Report issues: https://HytaleLife.com/issues
rem
rem  IMPORTANT: Make your own backups to be safe. Downgrading/restoring backups
rem  may break servers and worlds. Use at your own risk.
rem ============================================================================
rem MANAGER_VERSION=1.1.0

set "MANAGER_DIR=%~dp0"
set "MANAGER_DIR=%MANAGER_DIR:~0,-1%"
set "SERVER_ROOT=%MANAGER_DIR%"
set "SCRIPT_DIR=%MANAGER_DIR%"
cd /d "%SERVER_ROOT%"

set "DOWNLOADER=hytale-downloader-windows-amd64.exe"
set "CREDS=.hytale-downloader-credentials.json"
set "VERSION_FILE=server_version.txt"
set "PATCHLINE_FILE=server_patchline.txt"
set "BACKUP_DIR=backups"
set "DOWNLOADER_ZIP_URL=https://downloader.hytale.com/hytale-downloader.zip"
set "MANAGER_REPO=Stormster/hytale-server-manager"
set "MANAGER_RELEASE_API=https://api.github.com/repos/%MANAGER_REPO%/releases/latest"

rem -------- Check Java (needed for server, checked early) --------
java -version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Java 25+ not found. Install from https://adoptium.net
    pause
    exit /b 1
)

rem -------- First-time setup if Server folder missing --------
if not exist "Server\HytaleServer.jar" goto first_time_setup

rem -------- Validate prerequisites --------
if not exist "%DOWNLOADER%" (
    echo [ERROR] %DOWNLOADER% not found. Place it in: %SERVER_ROOT%
    pause
    exit /b 1
)

if not exist "%CREDS%" (
    echo.
    echo [AUTH REQUIRED] No credentials found. You must authenticate first.
    echo Run %DOWNLOADER% manually - it will open a URL to log in with your Hytale account.
    echo After logging in, run this manager again.
    echo.
    start "" "%DOWNLOADER%"
    pause
    exit /b 1
)

rem ============================================================================
rem  MAIN MENU
rem ============================================================================
:menu
if not defined MANAGER_UPDATE_CHECKED (
    call :check_manager_update
    set "MANAGER_UPDATE_CHECKED=1"
)
set "choice="
cls
echo.
echo  ========================================
echo   HYTALE SERVER MANAGER - HytaleLife.com
echo  ========================================
echo.
if defined MANAGER_UPDATE_AVAILABLE (
    echo   [!] Manager update available: v!MANAGER_NEW_VERSION! - use Update Manager below
    echo.
)
echo   [1] Start Server
echo   [2] Check for Updates
echo   [3] Backups Manager
echo   [4] Configuration ^(edit config, whitelist, bans, view log^)
echo   [5] Refresh Auth ^(re-login if expired^)
echo   [6] Update Manager
echo   [7] Exit
echo.
echo   ---
echo   Back up your server often. Lost data cannot be recovered.
echo   Report issues: https://HytaleLife.com/issues
echo   ---
echo.
set /p "choice=Select option [1-7]: "

if "%choice%"=="1" goto start_server
if "%choice%"=="2" goto check_updates
if "%choice%"=="3" goto backups_manager
if "%choice%"=="4" goto configuration
if "%choice%"=="5" goto refresh_auth
if "%choice%"=="6" goto update_manager
if "%choice%"=="7" exit /b 0

echo Invalid option.
timeout /t 2 >nul
goto menu

rem ============================================================================
rem  BACKUPS MANAGER
rem ============================================================================
:backups_manager
set "bm_choice="
cls
echo.
echo  ========================================
echo   BACKUPS MANAGER - HytaleLife.com
echo  ========================================
echo.
echo   [1] Create Backup
echo   [2] Restore Backup
echo   [3] Back to menu
echo.
set /p "bm_choice=Select option [1-3]: "
if "!bm_choice!"=="1" goto create_backup
if "!bm_choice!"=="2" goto restore_backup
if "!bm_choice!"=="3" goto menu
echo Invalid option.
timeout /t 2 >nul
goto backups_manager

rem ============================================================================
rem  CONFIGURATION - Edit server files
rem ============================================================================
:configuration
set "cfg_choice="
cls
echo.
echo  ========================================
echo   CONFIGURATION - HytaleLife.com
echo  ========================================
echo.
echo   [1] Edit config.json
echo   [2] Edit whitelist.json
echo   [3] Edit bans.json
echo   [4] View latest log
echo   [5] Back to menu
echo.
set /p "cfg_choice=Select option [1-5]: "
if "!cfg_choice!"=="1" (
    if exist "Server\config.json" (start "" "Server\config.json") else (echo [INFO] config.json not found.)
    timeout /t 2 >nul
    goto configuration
)
if "!cfg_choice!"=="2" (
    if exist "Server\whitelist.json" (start "" "Server\whitelist.json") else (echo [INFO] whitelist.json not found.)
    timeout /t 2 >nul
    goto configuration
)
if "!cfg_choice!"=="3" (
    if exist "Server\bans.json" (start "" "Server\bans.json") else (echo [INFO] bans.json not found.)
    timeout /t 2 >nul
    goto configuration
)
if "!cfg_choice!"=="4" (
    set "LOG_OPENED=0"
    for /f "delims=" %%f in ('dir /b /o-d "Server\logs\*.log" 2^>nul') do (
        if "!LOG_OPENED!"=="0" (
            start "" "Server\logs\%%f"
            set "LOG_OPENED=1"
        )
    )
    if "!LOG_OPENED!"=="0" echo [INFO] No log files found.
    timeout /t 2 >nul
    goto configuration
)
if "!cfg_choice!"=="5" goto menu
echo Invalid option.
timeout /t 2 >nul
goto configuration

rem ============================================================================
rem  UPDATE MANAGER - Check for and install manager script updates
rem ============================================================================
:update_manager
set "MANAGER_UPDATE_AVAILABLE="
set "MANAGER_NEW_VERSION="
call :check_manager_update
echo.
if defined MANAGER_UPDATE_AVAILABLE (
    echo [Manager] Update available: v!MANAGER_NEW_VERSION!
    echo.
    echo   [1] Update now
    echo   [2] Skip
    echo.
    set /p "um_choice=Choice [1-2]: "
    if "!um_choice!"=="1" goto do_manager_update
) else (
    echo [Manager] No update available. You have the latest manager version.
)
echo.
pause
goto menu

:do_manager_update
set "REMOTE_BAT=%TEMP%\hytale-manager-remote.bat"
set "SCRIPT_PATH=%~f0"
echo.
echo [Manager] Downloading update...
set "MANAGER_DOWNLOAD_URL=https://raw.githubusercontent.com/%MANAGER_REPO%/!MANAGER_UPDATE_TAG!/hytale-server-manager.bat"
curl -s -L -o "%REMOTE_BAT%" "!MANAGER_DOWNLOAD_URL!" 2>nul
if not exist "%REMOTE_BAT%" (
    echo [ERROR] Failed to download. Check your connection or try again later.
    pause
    goto menu
)
findstr /c:"rem MANAGER_VERSION=" "%REMOTE_BAT%" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Downloaded file appears invalid. Aborting.
    del "%REMOTE_BAT%" 2>nul
    pause
    goto menu
)
echo [Manager] Backing up current manager...
copy /y "!SCRIPT_PATH!" "!SCRIPT_PATH!.bak" >nul 2>&1
echo [Manager] Applying update...
copy /y "%REMOTE_BAT%" "!SCRIPT_PATH!" >nul
del "%REMOTE_BAT%" 2>nul
if not exist "!SCRIPT_PATH!" (
    echo [ERROR] Update failed. Restoring backup...
    copy /y "!SCRIPT_PATH!.bak" "!SCRIPT_PATH!" >nul
    pause
    goto menu
)
echo.
echo [Manager] Update complete! Restart the manager to use the new version.
echo.
pause
goto menu

rem ============================================================================
rem  SUBROUTINE: check_manager_update - checks GitHub releases/latest only
rem ============================================================================
:check_manager_update
setlocal EnableDelayedExpansion
set "LOCAL_VER="
set "REMOTE_VER="
set "REMOTE_TAG="
for /f "tokens=2 delims==" %%a in ('findstr /c:"rem MANAGER_VERSION=" "%~f0" 2^>nul') do set "LOCAL_VER=%%a"
if not defined LOCAL_VER set "LOCAL_VER=0.0.0"
set "API_JSON=%TEMP%\hytale-manager-release.json"
curl -s -L -o "!API_JSON!" "%MANAGER_RELEASE_API%" 2>nul
if exist "!API_JSON!" (
    for /f "delims=" %%t in ('powershell -NoProfile -Command "try { (Get-Content (Join-Path $env:TEMP 'hytale-manager-release.json') -Raw | ConvertFrom-Json).tag_name } catch { }" 2^>nul') do set "REMOTE_TAG=%%t"
    del "!API_JSON!" 2>nul
)
if defined REMOTE_TAG (
    set "REMOTE_VER=!REMOTE_TAG!"
    if "!REMOTE_VER:~0,1!"=="v" set "REMOTE_VER=!REMOTE_VER:~1!"
    call :version_greater "!REMOTE_VER!" "!LOCAL_VER!"
    if not errorlevel 1 (
        for /f "delims=" %%a in ("!REMOTE_VER!") do for /f "delims=" %%b in ("!REMOTE_TAG!") do (
            endlocal
            set "MANAGER_UPDATE_AVAILABLE=1"
            set "MANAGER_NEW_VERSION=%%a"
            set "MANAGER_UPDATE_TAG=%%b"
        )
        goto :eof
    )
)
endlocal & set "MANAGER_UPDATE_AVAILABLE=" & set "MANAGER_NEW_VERSION=" & set "MANAGER_UPDATE_TAG="
goto :eof

rem ============================================================================
rem  SUBROUTINE: init_version_from_zip (must be before callers)
rem ============================================================================
:init_version_from_zip
if not "!CURRENT_VERSION!"=="unknown" goto :eof
for /f "delims=" %%z in ('dir /b *.zip 2^>nul') do (
    set "fn=%%~nz"
    echo !fn!| findstr /r "^[0-9][0-9][0-9][0-9]\.[0-9][0-9]\.[0-9][0-9]-" >nul && if "!CURRENT_VERSION!"=="unknown" set "CURRENT_VERSION=!fn!"
)
goto :eof

:update_release
set "PATCHLINE=release"
goto do_update

:update_prerelease
set "PATCHLINE=pre-release"
goto do_update

rem ============================================================================
rem  CHECK FOR UPDATES (must be before goto callers)
rem ============================================================================
:check_updates
call :check_version
if not defined NEW_RELEASE if not defined NEW_PRERELEASE (
    echo.
    pause
    goto menu
)
echo.
if defined NEW_RELEASE (
    set "opt1=[1] Update to Release ^(!NEW_RELEASE!^)"
    if "!INSTALLED_PATCHLINE!"=="pre-release" set "opt1=[1] Switch to Release ^(!NEW_RELEASE!^)"
    echo   !opt1!
) else (
    echo   [1] Release ^(up to date^)
)
if defined NEW_PRERELEASE (
    set "opt2=[2] Update to Pre-Release ^(!NEW_PRERELEASE!^)"
    if "!INSTALLED_PATCHLINE!"=="release" set "opt2=[2] Switch to Pre-Release ^(!NEW_PRERELEASE!^)"
    echo   !opt2!
) else (
    echo   [2] Pre-Release ^(up to date^)
)
echo   [3] Skip
echo.
set /p "upd=Choice [1-3]: "
if "!upd!"=="1" if defined NEW_RELEASE goto update_release
if "!upd!"=="1" if not defined NEW_RELEASE goto menu
if "!upd!"=="2" if defined NEW_PRERELEASE goto update_prerelease
if "!upd!"=="2" if not defined NEW_PRERELEASE goto menu
goto menu

rem ============================================================================
rem  SUBROUTINE: Check version (silent) - must be before callers
rem ============================================================================
:check_version_silent
set "CURRENT_VERSION=unknown"
if exist "%VERSION_FILE%" for /f "usebackq delims=" %%v in ("%VERSION_FILE%") do set "CURRENT_VERSION=%%v"
call :init_version_from_zip
if "!CURRENT_VERSION!"=="unknown" goto :eof

set "REL_VER="
set "PRE_VER="
"%DOWNLOADER%" -print-version -skip-update-check 2>nul > "%TEMP%\hytale_rel.txt"
"%DOWNLOADER%" -print-version -patchline pre-release -skip-update-check 2>nul > "%TEMP%\hytale_pre.txt"
for /f "usebackq delims=" %%a in ("%TEMP%\hytale_rel.txt") do set "REL_VER=%%a"
for /f "usebackq delims=" %%a in ("%TEMP%\hytale_pre.txt") do set "PRE_VER=%%a"

set "INSTALLED_PATCHLINE="
if exist "%PATCHLINE_FILE%" for /f "usebackq delims=" %%p in ("%PATCHLINE_FILE%") do set "INSTALLED_PATCHLINE=%%p"
if not defined INSTALLED_PATCHLINE (
    if "!CURRENT_VERSION!"=="!PRE_VER!" (set "INSTALLED_PATCHLINE=pre-release") else (set "INSTALLED_PATCHLINE=release")
)
if not defined INSTALLED_PATCHLINE set "INSTALLED_PATCHLINE=release"

set "NEW_RELEASE="
set "NEW_PRERELEASE="
if "!INSTALLED_PATCHLINE!"=="release" call :version_greater "!REL_VER!" "!CURRENT_VERSION!" && set "NEW_RELEASE=!REL_VER!"
if "!INSTALLED_PATCHLINE!"=="pre-release" call :version_greater "!PRE_VER!" "!CURRENT_VERSION!" && set "NEW_PRERELEASE=!PRE_VER!"
goto :eof

rem ============================================================================
rem  START SERVER
rem ============================================================================
:start_server
if not exist "Server\HytaleServer.jar" (
    echo [ERROR] Server files not found. Run Update first.
    pause
    goto menu
)

call :check_version_silent
if "!INSTALLED_PATCHLINE!"=="release" if defined NEW_RELEASE goto start_prompt_update
if "!INSTALLED_PATCHLINE!"=="pre-release" if defined NEW_PRERELEASE goto start_prompt_update
goto do_start_server

:start_prompt_update
echo.
if "!INSTALLED_PATCHLINE!"=="release" if defined NEW_RELEASE echo  Update available: Release !NEW_RELEASE!
if "!INSTALLED_PATCHLINE!"=="pre-release" if defined NEW_PRERELEASE echo  Update available: Pre-Release !NEW_PRERELEASE!
echo  Current: !CURRENT_VERSION!
echo.
echo   [1] Start anyway ^(skip update^)
echo   [2] Check for Updates ^(then update^)
echo   [3] Back to menu
echo.
set /p "upd=Choice [1-3]: "
if "!upd!"=="1" goto do_start_server
if "!upd!"=="2" goto check_updates
if "!upd!"=="3" goto menu
goto start_prompt_update

:do_start_server
echo.
echo [Manager] Starting Hytale server...
call start.bat
goto menu

rem ============================================================================
rem  DO UPDATE - Backup, download, extract, preserve user data
rem ============================================================================
:do_update
if not exist "Server\HytaleServer.jar" if not exist "Server" (
    echo [INFO] Fresh install - no backup needed.
)
:do_update_download
echo.
echo [Manager] Downloading %PATCHLINE%...
set "ZIP_NAME=temp_update.zip"
"%DOWNLOADER%" -download-path "%ZIP_NAME%" -patchline %PATCHLINE% -skip-update-check
if errorlevel 1 (
    echo [ERROR] Download failed. Auth may have expired - try "Refresh Auth".
    del "%ZIP_NAME%" 2>nul
    pause
    goto menu
)

rem Get new version
"%DOWNLOADER%" -print-version -patchline %PATCHLINE% -skip-update-check > "%VERSION_FILE%.tmp" 2>&1
set "NEW_VER="
for /f "usebackq delims=" %%v in ("%VERSION_FILE%.tmp") do set "NEW_VER=%%v"
del "%VERSION_FILE%.tmp" 2>nul

rem Create backup only if we have existing Server (not fresh install)
if exist "Server" (
    set "OLD_VER=unknown"
    set "OLD_PATCHLINE=release"
    if exist "%VERSION_FILE%" for /f "usebackq delims=" %%v in ("%VERSION_FILE%") do set "OLD_VER=%%v"
    if exist "%PATCHLINE_FILE%" for /f "usebackq delims=" %%p in ("%PATCHLINE_FILE%") do set "OLD_PATCHLINE=%%p"
    echo.
    echo [Manager] Creating backup before update...
    call :create_backup_internal "update" "!OLD_VER!" "!OLD_PATCHLINE!" "!NEW_VER!" "%PATCHLINE%"
    if errorlevel 1 (
        echo [ERROR] Backup failed. Aborting update.
        pause
        goto menu
    )
)

echo [Manager] Extracting update...
if not exist "Server" mkdir Server

rem Extract to temp folder
if exist "temp_extract" rmdir /s /q "temp_extract"
mkdir "temp_extract"
powershell -NoProfile -Command "Expand-Archive -Path '%ZIP_NAME%' -DestinationPath 'temp_extract' -Force"

if not exist "temp_extract\Server" (
    echo [ERROR] Unexpected zip structure. Manual extraction needed.
    rmdir /s /q "temp_extract" 2>nul
    del "%ZIP_NAME%" 2>nul
    pause
    goto menu
)

rem Update server binaries (preserve config, mods, universe)
copy /y "temp_extract\Server\HytaleServer.jar" "Server\" >nul
if exist "temp_extract\Server\HytaleServer.aot" copy /y "temp_extract\Server\HytaleServer.aot" "Server\" >nul
if exist "temp_extract\Server\Licenses" (
    rmdir /s /q "Server\Licenses" 2>nul
    xcopy /s /e /i /y "temp_extract\Server\Licenses" "Server\Licenses" >nul
)
if exist "temp_extract\Assets.zip" copy /y "temp_extract\Assets.zip" "." >nul
if exist "temp_extract\start.bat" copy /y "temp_extract\start.bat" "." >nul
if exist "temp_extract\start.sh" copy /y "temp_extract\start.sh" "." >nul

rem Save version (NEW_VER already set before backup)
echo %NEW_VER%> "%VERSION_FILE%"
echo %PATCHLINE%> "%PATCHLINE_FILE%"

rem Cleanup
rmdir /s /q "temp_extract" 2>nul
del "%ZIP_NAME%" 2>nul

echo.
echo [Manager] Update complete! Version: %NEW_VER%
echo.
pause
goto menu

rem ============================================================================
rem  CREATE BACKUP
rem ============================================================================
:create_backup
call :create_backup_internal
pause
goto backups_manager

:create_backup_internal
setlocal EnableDelayedExpansion
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

rem Get date/time in format: 02-06-2026 at 4:10PM (colon replaced with . for path safety)
for /f "delims=" %%t in ('powershell -NoProfile -Command "Get-Date -Format \"MM-dd-yyyy 'at' h.mmtt\""') do set "DATETIME=%%t"

if "%~1"=="update" (
    set "BNAME=update from %~2 ^(%~3^) to %~4 ^(%~5^) - %DATETIME%"
) else (
    set "BNAME=User generated backup - %DATETIME%"
)
set "DEST=%BACKUP_DIR%\!BNAME!"

if not exist "Server" (
    echo [ERROR] No Server folder to backup.
    exit /b 1
)

mkdir "%DEST%" 2>nul
echo [Manager] Backing up to %DEST%...

xcopy /s /e /i /y /q "Server" "%DEST%\Server" >nul
if exist "Assets.zip" copy /y "Assets.zip" "%DEST%\" >nul
if exist "start.bat" copy /y "start.bat" "%DEST%\" >nul
if exist "start.sh" copy /y "start.sh" "%DEST%\" >nul
if exist "%VERSION_FILE%" copy /y "%VERSION_FILE%" "%DEST%\" >nul
if exist "%PATCHLINE_FILE%" copy /y "%PATCHLINE_FILE%" "%DEST%\" >nul

echo [Manager] Backup saved: %DEST%
endlocal
exit /b 0

rem ============================================================================
rem  RESTORE BACKUP
rem ============================================================================
:restore_backup
if not exist "%BACKUP_DIR%" (
    echo [ERROR] No backups folder or backups exist.
    pause
    goto backups_manager
)

echo.
echo Available backups:
echo.
set "n=0"
for /d %%D in ("%BACKUP_DIR%\*") do (
    set /a n+=1
    set "bak!n!=%%~sD"
    echo   [!n!] %%~nxD
)
if %n%==0 (
    echo   No backups found.
    pause
    goto backups_manager
)
echo.
set /p "pick=Select backup number (or 0 to cancel): "
if "!pick!"=="0" goto backups_manager
if "!pick!"=="" goto backups_manager

set "RESTORE_SRC=!bak%pick%!"
if not defined RESTORE_SRC (
    echo Invalid selection.
    pause
    goto backups_manager
)

if not exist "!RESTORE_SRC!\Server" (
    echo [ERROR] Invalid backup - missing Server folder.
    pause
    goto backups_manager
)

echo.
echo [WARNING] Restoring may break your server or world. Downgrading is unsupported.
echo Restore from !RESTORE_SRC! ?
echo.
set /p "confirm=Type YES to confirm: "
if /i not "!confirm!"=="YES" (
    echo Cancelled.
    pause
    goto backups_manager
)

echo [Manager] Restoring...
if exist "Server" rmdir /s /q "Server"
xcopy /s /e /i /y "!RESTORE_SRC!\Server" "Server" >nul
if exist "!RESTORE_SRC!\Assets.zip" copy /y "!RESTORE_SRC!\Assets.zip" "." >nul
if exist "!RESTORE_SRC!\start.bat" copy /y "!RESTORE_SRC!\start.bat" "." >nul
if exist "!RESTORE_SRC!\start.sh" copy /y "!RESTORE_SRC!\start.sh" "." >nul
if exist "!RESTORE_SRC!\%VERSION_FILE%" copy /y "!RESTORE_SRC!\%VERSION_FILE%" "." >nul
if exist "!RESTORE_SRC!\%PATCHLINE_FILE%" copy /y "!RESTORE_SRC!\%PATCHLINE_FILE%" "." >nul

echo [Manager] Restore complete.
pause
goto backups_manager

rem ============================================================================
rem  FIRST-TIME SETUP (Server folder missing)
rem ============================================================================
:first_time_setup
cls
echo.
echo  ========================================
echo   HYTALE FIRST-TIME SETUP - HytaleLife.com
echo  ========================================
echo.
echo  Server folder not found. Setting up...
echo.

rem -------- Download downloader if missing --------
if not exist "%DOWNLOADER%" (
    echo [Manager] Downloading Hytale downloader...
    curl -L -o "hytale-downloader-temp.zip" "https://downloader.hytale.com/hytale-downloader.zip"
    if not exist "hytale-downloader-temp.zip" (
        echo [ERROR] Failed to download from https://downloader.hytale.com/hytale-downloader.zip
        pause
        exit /b 1
    )
    echo [Manager] Extracting downloader...
    if exist "temp_dl_extract" rmdir /s /q "temp_dl_extract"
    mkdir "temp_dl_extract"
    powershell -NoProfile -Command "Expand-Archive -Path 'hytale-downloader-temp.zip' -DestinationPath 'temp_dl_extract' -Force"
    del "hytale-downloader-temp.zip" 2>nul
    if exist "temp_dl_extract\%DOWNLOADER%" (
        copy /y "temp_dl_extract\%DOWNLOADER%" "." >nul
    ) else if exist "temp_dl_extract\hytale-downloader\%DOWNLOADER%" (
        copy /y "temp_dl_extract\hytale-downloader\%DOWNLOADER%" "." >nul
    ) else (
        for /f "delims=" %%F in ('dir /s /b "temp_dl_extract\*windows*amd64*.exe" 2^>nul') do (
            copy /y "%%F" "%DOWNLOADER%" >nul
            goto :first_time_dl_ready
        )
        echo [ERROR] Could not find Windows downloader exe in zip.
        rmdir /s /q "temp_dl_extract" 2>nul
        pause
        exit /b 1
    )
    :first_time_dl_ready
    rmdir /s /q "temp_dl_extract" 2>nul
    echo [Manager] Downloader ready.
    echo.
)

rem -------- Choose release or pre-release --------
rem Run downloader once without redirect - if auth needed, user sees the prompt
echo [Manager] Checking available versions ^(log in in browser if prompted^)...
"%DOWNLOADER%" -print-version -skip-update-check
echo.
"%DOWNLOADER%" -print-version -skip-update-check > "%TEMP%\hytale_rel.txt" 2>&1
"%DOWNLOADER%" -print-version -patchline pre-release -skip-update-check > "%TEMP%\hytale_pre.txt" 2>&1
set "REL_VER="
set "PRE_VER="
for /f "delims=" %%a in ('type "%TEMP%\hytale_rel.txt"') do set "REL_VER=%%a"
for /f "delims=" %%a in ('type "%TEMP%\hytale_pre.txt"') do set "PRE_VER=%%a"

echo.
echo  Choose update channel ^(you cannot easily switch later^):
echo.
echo   [1] Release ^(%REL_VER%^) - RECOMMENDED, stable
echo   [2] Pre-Release ^(%PRE_VER%^) - experimental, may have bugs
echo.
echo  NOTE: Once you choose, switching channels can break your server.
echo.
set /p "ft_patch=Select [1-2]: "
set "FIRST_TIME_PATCHLINE=release"
if "!ft_patch!"=="2" set "FIRST_TIME_PATCHLINE=pre-release"
echo.

rem -------- Run downloader - user auths and downloads server zip --------
echo [Manager] Launching downloader. Log in with your Hytale account in the browser.
echo When the download finishes, return here and press Enter.
echo.
set "FIRST_TIME_ZIP=first_time_setup.zip"
"%DOWNLOADER%" -download-path "%FIRST_TIME_ZIP%" -patchline %FIRST_TIME_PATCHLINE% -skip-update-check
if errorlevel 1 (
    echo.
    echo [ERROR] Download failed. Try again or check your credentials.
    pause
    goto menu
)
echo.
echo Press Enter to extract the server files and continue...
pause >nul

rem -------- Extract server zip --------
if not exist "%FIRST_TIME_ZIP%" (
    echo [ERROR] Server zip not found. Run setup again.
    pause
    goto menu
)
echo [Manager] Extracting server files...
if exist "temp_extract" rmdir /s /q "temp_extract"
mkdir "temp_extract"
powershell -NoProfile -Command "Expand-Archive -Path '%FIRST_TIME_ZIP%' -DestinationPath 'temp_extract' -Force"

if not exist "temp_extract\Server" (
    echo [ERROR] Unexpected zip structure. Manual extraction needed.
    rmdir /s /q "temp_extract" 2>nul
    del "%FIRST_TIME_ZIP%" 2>nul
    pause
    goto menu
)

if not exist "Server" mkdir Server
copy /y "temp_extract\Server\HytaleServer.jar" "Server\" >nul
if exist "temp_extract\Server\HytaleServer.aot" copy /y "temp_extract\Server\HytaleServer.aot" "Server\" >nul
if exist "temp_extract\Server\Licenses" (
    rmdir /s /q "Server\Licenses" 2>nul
    xcopy /s /e /i /y "temp_extract\Server\Licenses" "Server\Licenses" >nul
)
if exist "temp_extract\Assets.zip" copy /y "temp_extract\Assets.zip" "." >nul
if exist "temp_extract\start.bat" copy /y "temp_extract\start.bat" "." >nul
if exist "temp_extract\start.sh" copy /y "temp_extract\start.sh" "." >nul

"%DOWNLOADER%" -print-version -patchline %FIRST_TIME_PATCHLINE% -skip-update-check > "%VERSION_FILE%.tmp" 2>&1
set "NEW_VER="
for /f "usebackq delims=" %%v in ("%VERSION_FILE%.tmp") do set "NEW_VER=%%v"
del "%VERSION_FILE%.tmp" 2>nul
echo %NEW_VER%> "%VERSION_FILE%"
echo %FIRST_TIME_PATCHLINE%> "%PATCHLINE_FILE%"

rmdir /s /q "temp_extract" 2>nul
del "%FIRST_TIME_ZIP%" 2>nul

echo.
echo [Manager] First-time setup complete! Version: %NEW_VER%
echo You can now Start Server.
echo.
pause
goto menu

rem ============================================================================
rem  REFRESH AUTH
rem ============================================================================
:refresh_auth
echo.
echo [Manager] Deleting credentials. You will need to log in again.
del "%CREDS%" 2>nul
echo.
echo Launching downloader for auth only ^(no download^) - complete the login in your browser.
echo.
"%DOWNLOADER%" -print-version -skip-update-check
echo.
echo Auth refreshed. Credentials are saved.
pause
goto menu

rem ============================================================================
rem  SUBROUTINE: Check version (interactive)
rem ============================================================================
:check_version
set "CURRENT_VERSION=unknown"
if exist "%VERSION_FILE%" for /f "usebackq delims=" %%v in ("%VERSION_FILE%") do set "CURRENT_VERSION=%%v"
call :init_version_from_zip
if "!CURRENT_VERSION!"=="unknown" if exist "Server\HytaleServer.jar" set "CURRENT_VERSION=(installed, version unknown)"

echo.
echo [Manager] Checking versions...
"%DOWNLOADER%" -print-version -skip-update-check > "%TEMP%\hytale_rel.txt" 2>&1
"%DOWNLOADER%" -print-version -patchline pre-release -skip-update-check > "%TEMP%\hytale_pre.txt" 2>&1

set "REL_VER="
set "PRE_VER="
for /f "delims=" %%a in ('type "%TEMP%\hytale_rel.txt"') do set "REL_VER=%%a"
for /f "delims=" %%a in ('type "%TEMP%\hytale_pre.txt"') do set "PRE_VER=%%a"

echo   Current:  %CURRENT_VERSION%
echo   Release:  %REL_VER%
echo   Pre-Rel:  %PRE_VER%

set "INSTALLED_PATCHLINE="
if exist "%PATCHLINE_FILE%" for /f "usebackq delims=" %%p in ("%PATCHLINE_FILE%") do set "INSTALLED_PATCHLINE=%%p"
if not defined INSTALLED_PATCHLINE (
    if "!CURRENT_VERSION!"=="!PRE_VER!" (set "INSTALLED_PATCHLINE=pre-release") else (set "INSTALLED_PATCHLINE=release")
)
if not defined INSTALLED_PATCHLINE set "INSTALLED_PATCHLINE=release"

set "NEW_RELEASE="
set "NEW_PRERELEASE="
rem Same-channel updates (version_greater)
if "!INSTALLED_PATCHLINE!"=="release" call :version_greater "!REL_VER!" "!CURRENT_VERSION!" && set "NEW_RELEASE=!REL_VER!"
if "!INSTALLED_PATCHLINE!"=="pre-release" call :version_greater "!PRE_VER!" "!CURRENT_VERSION!" && set "NEW_PRERELEASE=!PRE_VER!"

rem Cross-channel switch: offer when other channel has same date or newer (can break server)
set "CURR_DATE=0000.00.00"
set "REL_DATE=0000.00.00"
set "PRE_DATE=0000.00.00"
set "cv=!CURRENT_VERSION!"
set "rv=!REL_VER!"
set "pv=!PRE_VER!"
if "!cv:~10,1!"=="-" for /f "tokens=1 delims=-" %%a in ("!cv!") do set "CURR_DATE=%%a"
if "!rv:~10,1!"=="-" for /f "tokens=1 delims=-" %%a in ("!rv!") do set "REL_DATE=%%a"
if "!pv:~10,1!"=="-" for /f "tokens=1 delims=-" %%a in ("!pv!") do set "PRE_DATE=%%a"
if "!INSTALLED_PATCHLINE!"=="release" if not defined NEW_PRERELEASE if "!pv!" neq "" if "!pv!" neq "!cv!" if "!PRE_DATE!" geq "!CURR_DATE!" set "NEW_PRERELEASE=!PRE_VER!"
if "!INSTALLED_PATCHLINE!"=="pre-release" if not defined NEW_RELEASE if "!rv!" neq "" if "!rv!" neq "!cv!" if "!REL_DATE!" geq "!CURR_DATE!" set "NEW_RELEASE=!REL_VER!"

if defined NEW_RELEASE echo.
if defined NEW_RELEASE if "!INSTALLED_PATCHLINE!"=="release" echo [UPDATE] New release available: %NEW_RELEASE%
if defined NEW_RELEASE if "!INSTALLED_PATCHLINE!"=="pre-release" echo Release channel has %NEW_RELEASE% ^(switch available^)
if defined NEW_PRERELEASE if "!INSTALLED_PATCHLINE!"=="pre-release" echo [UPDATE] New pre-release available: %NEW_PRERELEASE%
if defined NEW_PRERELEASE if "!INSTALLED_PATCHLINE!"=="release" echo Pre-release channel has %NEW_PRERELEASE% ^(switch available^)
if not defined NEW_RELEASE if not defined NEW_PRERELEASE echo.
if not defined NEW_RELEASE if not defined NEW_PRERELEASE echo [OK] You are on the latest version.
if defined NEW_PRERELEASE if "!INSTALLED_PATCHLINE!"=="release" (
    echo.
    echo   *** WARNING: Switching to pre-release can BREAK your server ***
    echo   *** Restore from backup if it breaks. Pre-release is experimental. ***
    echo.
)
if defined NEW_RELEASE if "!INSTALLED_PATCHLINE!"=="pre-release" (
    echo.
    echo   *** WARNING: Switching to release can BREAK your server***
    echo   *** Restore from backup if it breaks. ***
    echo.
)
goto :eof

rem ============================================================================
rem  SUBROUTINE: version_greater A B - returns 0 if A > B (or B unknown)
rem ============================================================================
:version_greater
set "VA=%~1"
set "VB=%~2"
if "%VA%"=="" exit /b 1
if "%VB%"=="" exit /b 0
if "%VB%"=="(installed, version unknown)" exit /b 0
rem Lexicographic compare works for YYYY.MM.DD-hash format
if "%VA%" gtr "%VB%" exit /b 0
exit /b 1
