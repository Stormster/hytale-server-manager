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

See **[DEVELOPMENT.md](DEVELOPMENT.md)** for the full cheat sheet (daily commands, releases).

```bash
npm run dev              # Desktop app
```

The backend listens on a dynamic localhost port; Tauri injects `HYTALE_BACKEND_TOKEN` for API auth in release builds.

Copy `.env.example` to `.env` if you need optional local overrides.

## Environment variables

See `.env.example` and [DEVELOPMENT.md](DEVELOPMENT.md). Key vars:

| Variable | Purpose |
|----------|---------|
| `HSM_ENABLE_REMOTE` | Set to `1` for Remote UI (or use `npm run dev:remote`) |
| `HYTALE_ROOT_DIR` | Default server data root (optional) |
| `HYTALE_BACKEND_TOKEN` | Backend auth token (set by Tauri in production) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Desktop app (Tauri + backend) |
| `npm run release` | Windows installer build |
| `npm run test` | Backend pytest |
| `npm run check:secrets` | Scan for accidental secrets |

## Project layout

- `src/` — React UI
- `src-tauri/` — Tauri/Rust shell
- `backend/` — FastAPI server and services
- `scripts/` — Build and dev helpers

## Pull requests

- Run `npm run check:secrets` before pushing.
- CI builds Windows and Linux on push/PR to `main`/`master`.

## Related repos

- [hytale-remote](https://github.com/Stormster/Hytale-Remote) — Hosted-server remote plugin
