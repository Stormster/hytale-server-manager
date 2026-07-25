# Development cheat sheet

**Repo:** `hytale-setup` (Hytale Server Manager).

## One-time setup

```bash
cd hytale-setup
npm ci
pip install -r backend/requirements.txt
copy .env.example .env    # Windows — optional local overrides
```

## Commands to remember

| Goal | Command |
|------|---------|
| Run desktop app | `npm run dev` |
| Dev with Remote UI (frozen feature) | `npm run dev:remote` |
| Backend tests | `npm run test` |
| Bump manager version | `npm run bump:patch` (or `bump:minor` / `bump:major`) |
| Build Windows installer | `npm run release` |
| Installer + VirusTotal | `npm run release:full` |

Same tasks via CLI: `.\scripts\hsm.ps1 dev` or `npm run hsm -- dev`

## Ship a manager release

1. `npm run bump:patch` — updates `package.json` and syncs version to `backend/config.py`, `tauri.conf.json`, `Cargo.toml`
2. `npm run release` — builds PyInstaller sidecar + Tauri bundle
3. Artifacts: `src-tauri/target/release/bundle/`
4. Create a GitHub release on [Stormster/hytale-server-manager](https://github.com/Stormster/hytale-server-manager/releases)

## You rarely run these directly

| Command | When |
|---------|------|
| `npm run build:backend` | Only as part of `release` |
| `npm run version:sync` | Auto-runs on bump and release |
| `npm run dev:vite` | Started automatically by Tauri during `dev` |

## Legacy script names

Old names still work: `tauri:dev`, `build:release:no-vt`, `build:release`, `version:bump:patch`, etc.

## Related repos

| Repo | `hsm` shortcuts |
|------|-----------------|
| [hytale-remote](../hytale-remote) | `hsm remote build` |
