#!/usr/bin/env node
/**
 * Run `tauri dev` with HSM_DEV_ADDON set so the backend loads the addon from
 * backend/addons/experimental_addon.whl. Use when testing the Experimental addon locally.
 * Place the .whl in backend/addons/ then run: npm run tauri:dev:addons
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const addonPath = join(root, "backend", "addons", "experimental_addon.whl");

process.env.HSM_DEV_ADDON = addonPath;

// Run ensure-backend-dev then tauri dev (env is inherited)
const ensure = spawnSync("node", [join(__dirname, "ensure-backend-dev.js")], {
  stdio: "inherit",
  env: process.env,
  cwd: root,
});
if (ensure.status !== 0) process.exit(ensure.status ?? 1);

const tauri = spawnSync("npx", ["tauri", "dev"], {
  stdio: "inherit",
  env: process.env,
  cwd: root,
});
process.exit(tauri.status ?? 0);
