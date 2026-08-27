<div align="center">

# Hytale Server Manager

[![Download Latest Release](https://img.shields.io/badge/Download-Latest_Release-0066cc?style=for-the-badge)](https://github.com/Stormster/hytale-server-manager/releases/latest)
[![Installs](https://img.shields.io/github/downloads/Stormster/hytale-server-manager/total?style=for-the-badge&label=INSTALLS&color=2ea44f)](https://github.com/Stormster/hytale-server-manager/releases)
[![Support on Patreon](https://img.shields.io/badge/Support-Patreon-FF424D?style=for-the-badge&logo=patreon)](https://www.patreon.com/c/stormster)

**Run and manage Hytale dedicated servers from your desktop.**<br>
Multiple instances, a live console, backups, mods, and port forwarding in one window.

</div>

<img src="assets/dashboard-screenshot.png?v=3" alt="Dashboard screenshot">

## Features

- **Dashboard** – Every server at a glance: status, uptime, memory use, player count, and when it was last backed up. Start, stop, back up, and drag to reorder.
- **Console** – Live output as the server runs, start and stop controls, and a command picker with sub-commands and favorites.
- **Updates** – Check for server updates, update every instance at once, warn players and shut down gracefully first, and switch between the release and pre-release channels.
- **Backups** – Create, restore, rename, and delete. Covers both full instance snapshots and Hytale's own world snapshots (`--backup` / `/backup`). Restores stage first and roll back if anything fails, so a bad archive can't take out a working server.
- **Mods** – Drag in `.jar` files, enable or disable mods, check for Nitrado plugin updates, and install the Nitrado mods that other features depend on.
- **Configuration** – Edit `config.json`, `whitelist.json`, `bans.json`, and world configs through form editors or raw JSON, with a warning before you walk away from unsaved changes.
- **Port forwarding** – Per-port firewall status (automatic rules on Windows, ufw commands on Linux), UPnP discovery, local and public IP with a show/hide toggle for streaming, and one-click copy of connection info to hand to players.
- **Multiple instances** – Create, add, or import as many servers as you like and switch between them without leaving the app.
- **Settings** – Hytale sign-in, servers root folder, instance renaming, Nitrado plugin management, and Java status checks.

Servers left running by a crash are found and shut down cleanly the next time you open the app, and config and settings files are written so that a crash mid-save can't corrupt them.

## Experimental addon

Patreon supporters get an optional addon that layers extra features on top of the base app, each one toggleable. Link your Patreon at [hytalemanager.com/license](https://hytalemanager.com/license) to get your key, then paste it into the Experimental tab.

The app works fully without it. Nothing here is behind a paywall.

## Requirements

- **Windows** or **Linux** (Ubuntu 22.04+, Debian, Fedora, Arch, and similar)
- **Java 25+**, [Temurin](https://adoptium.net/temurin/releases) recommended
- A **Hytale account**, used to authenticate and download server files

## Getting started

1. Grab the installer from the [latest release](https://github.com/Stormster/hytale-server-manager/releases/latest). The `.exe` is the usual choice; the `.msi` is there if you prefer it.
2. Launch the app and pick a folder to keep your servers in.
3. Sign in with your Hytale account when prompted. This is what lets the app download server files.
4. Create your first instance and hit start.

## Support

Found a bug or want to ask for something? Open a [GitHub issue](https://github.com/Stormster/hytale-server-manager/issues).

If you want to help with development, see [CONTRIBUTING.md](CONTRIBUTING.md) and [DEVELOPMENT.md](DEVELOPMENT.md).
