# Hytale Server Manager

A Windows batch script for managing your Hytale dedicated server. Built by HytaleLife.com.

## Features
- **Start Server**: Launch your Hytale server with one command
- **Check for Updates**: Keep server files up to date via the official Hytale downloader
- **Backups Manager**: Create and restore backups of your world and server data
- **Configuration**: Edit config, whitelist, bans, and view logs from a single menu
- **Refresh Auth**: Re-authenticate when your Hytale downloader credentials expire

## Requirements
- Windows
- Java 25+ (Temurin recommended): https://adoptium.net/temurin/releases
- Hytale account (for authentication)

## Quick Start
1. Download or clone this repo.
2. Place `hytale-server-manager.bat` in your Hytale server folder.
3. Run `hytale-server-manager.bat`.
4. Use the menu to start the server, update, back up, and manage config.

## Folder Layout
This script is intended to run from the **server root folder** (the same folder where your server files and config live).

## Usage Notes
- Run in a normal Command Prompt window.
- Keep the script in the same folder as your server to avoid path issues.
- If authentication expires, use **Refresh Auth** from the menu.

## Support
- Report issues on GitHub Issues
- https://hytaleLife.com/issues
