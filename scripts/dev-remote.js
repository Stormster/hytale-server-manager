#!/usr/bin/env node
/**
 * Start desktop dev with HSM_ENABLE_REMOTE=1 (Remote sidebar + API routes).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
config({ path: join(appRoot, ".env") });

process.env.HSM_ENABLE_REMOTE = "1";

const result = spawnSync("npm", ["run", "tauri:dev"], {
  stdio: "inherit",
  cwd: appRoot,
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 0);
