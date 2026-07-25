# Development cheat sheet

**Repo:** `hytale-setup` (Hytale Server Manager). Sibling repos live next to this folder — open `hytale-setup.code-workspace` for all four.

## One-time setup

```bash
cd hytale-setup
npm ci
pip install -r backend/requirements.txt
copy .env.example .env    # Windows — add HSM_DEV_LICENSE_KEY for addon dev
```

Addon frontend (once):

```bash
cd ../hytale-server-manager-experimental/frontend
npm ci
```

## Commands to remember

| Goal | Command |
|------|---------|
| Run desktop app | `npm run dev` |
| Dev with Patreon addon | `npm run dev:addon` |
| Dev with Remote UI (frozen feature) | `npm run dev:remote` |
| Fast addon dev (skip rebuild if unchanged) | `npm run dev:addon -- --fast` |
| Backend tests | `npm run test` |
| Bump manager version | `npm run bump:patch` (or `bump:minor` / `bump:major`) |
| Build Windows installer | `npm run release` |
| Installer + VirusTotal | `npm run release:full` |
| Anything else (website, remote JAR, addon build) | `npm run hsm -- help` |

Same tasks via CLI: `.\scripts\hsm.ps1 dev` or `npm run hsm -- dev`

## Ship a manager release

1. `npm run bump:patch` — updates `package.json` and syncs version to `backend/config.py`, `tauri.conf.json`, `Cargo.toml`
2. `npm run release` — builds PyInstaller sidecar + Tauri bundle
3. Artifacts: `src-tauri/target/release/bundle/`
4. Create a GitHub release on [Stormster/hytale-server-manager](https://github.com/Stormster/hytale-server-manager/releases)

## Ship an experimental addon release

1. Bump `version` in `../hytale-server-manager-experimental/pyproject.toml`
2. Push to `main` — CI creates the GitHub release and publishes to hytalemanager.com

Manual wheel build: `npm run hsm -- addon build`

## You rarely run these directly

| Command | When |
|---------|------|
| `npm run build:backend` | Only as part of `release` |
| `npm run version:sync` | Auto-runs on bump and release |
| `npm run dev:vite` | Started automatically by Tauri during `dev` |
| `cd frontend && npm run build` in addon repo | Wrapped by `dev:addon` and `hsm addon build` |

## Legacy script names

Old names still work: `tauri:dev`, `tauri:dev:addons`, `build:release:no-vt`, `build:release`, `version:bump:patch`, etc.

## Related repos

| Repo | `hsm` shortcuts |
|------|-----------------|
| [hytale-server-manager-experimental](../hytale-server-manager-experimental) | `hsm addon build`, `hsm addon test` |
| [hytale-manager-website](../hytale-manager-website) | `hsm website dev`, `hsm website deploy` |
| [hytale-remote](../hytale-remote) | `hsm remote build` |
