# Contributing to Hytale Server Manager

## Prerequisites

- **Node.js** 20+
- **Rust** (stable) — for Tauri
- **Python** 3.12+ — for the FastAPI backend
- On Linux: WebKit/GTK dev packages (see `.github/workflows/build.yml`)

## Setup

```bash
npm ci
pip install -r backend/requirements.txt
```

## Development

```bash
# Desktop app (Tauri + Vite + Python backend)
npm run tauri:dev

# With experimental addon wheel (builds addon repo first)
npm run tauri:dev:addons
```

The backend listens on a dynamic localhost port; Tauri injects `HYTALE_BACKEND_TOKEN` for API auth in release builds.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `HSM_DEV_ADDON` | Path to `experimental_addon.whl` for local addon dev |
| `HYTALE_ROOT_DIR` | Default server data root (optional) |
| `HYTALE_BACKEND_TOKEN` | Backend auth token (set by Tauri in production) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Frontend production build |
| `npm run build:backend` | PyInstaller backend sidecar |
| `npm run tauri build` | Full desktop release build |
| `npm run check:secrets` | Scan for accidental secrets |
| `npm run version:sync` | Sync version across package files |

## Project layout

- `src/` — React UI
- `src-tauri/` — Tauri/Rust shell
- `backend/` — FastAPI server, services, addon loader
- `scripts/` — Build and dev helpers

## Pull requests

- Run `npm run check:secrets` before pushing.
- CI builds Windows and Linux on push/PR to `main`/`master`.

## Related repos

- [hytale-server-manager-experimental](https://github.com/Stormster/hytale-server-manager-experimental) — Patreon addon
- [hytale-manager-website](https://github.com/Stormster/hytale-manager-website) — License and addon updates API
- [hytale-remote](https://github.com/Stormster/Hytale-Remote) — Hosted-server remote plugin
