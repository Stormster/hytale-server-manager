# Hytale Server Manager

A modern desktop application for managing your Hytale dedicated server. Built by HytaleLife.com.

## Architecture

- **Frontend**: Tauri v2 + React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Python FastAPI sidecar (bundled as exe via PyInstaller)
- **Data fetching**: TanStack Query + Server-Sent Events for streaming ops

The Tauri shell spawns the Python backend as a sidecar on launch. The React UI communicates with it over `http://127.0.0.1:{port}`. No Python install required on user machines.

## Features

- **Dashboard**: Server status, quick start/stop, first-time setup wizard
- **Server Console**: Live-streaming console output, start/stop controls
- **Updates**: Check for server updates, switch between release/pre-release channels
- **Backups**: Create, restore, and delete backups with metadata tracking
- **Configuration**: Inline JSON editor for config.json, whitelist.json, bans.json
- **Settings**: Auth management, manager version info, Java/downloader status

## Requirements

- Windows OS
- Java 25+ (Temurin recommended): https://adoptium.net/temurin/releases
- Hytale account (for authentication)

## Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- Rust (for Tauri): https://www.rust-lang.org/tools/install

### Setup

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
pip install -r requirements.txt
cd ..
```

### Dev mode

Run the backend and frontend separately:

```bash
# Terminal 1: Start the Python backend
cd backend
python main.py --base-dir ..

# Terminal 2: Start the Vite dev server
npm run dev
```

Or run everything through Tauri (requires sidecar binary):

```bash
npm run tauri dev
```

### Build

```powershell
# 1. Build the backend sidecar
scripts\build-backend.bat

# 2. Build the Tauri app (produces .msi installer)
npm run tauri build
```

## Project Structure

```
├── backend/           Python FastAPI backend (sidecar)
│   ├── main.py        Entry point with port negotiation
│   ├── config.py      App-wide constants
│   ├── api/           REST + SSE route modules
│   ├── services/      Business logic (server, updater, backups, auth)
│   └── utils/         Path + subprocess helpers
├── src/               React frontend
│   ├── api/           API client, types, TanStack Query hooks
│   ├── components/    Shared components + shadcn/ui primitives
│   └── views/         Page views (Dashboard, Server, Updates, etc.)
├── src-tauri/         Tauri v2 shell (Rust)
│   └── src/           Sidecar spawn + port handshake
└── scripts/           Build scripts
```

## Support

- Report issues on GitHub Issues
- https://HytaleLife.com/issues
