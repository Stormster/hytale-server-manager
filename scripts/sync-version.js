/**
 * Sync version from package.json to backend/config.py and tauri.conf.json.
 * Run before builds or use: npm run version:sync
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
const version = pkg.version;

if (!version) {
  console.error("No version in package.json");
  process.exit(1);
}

// Update backend/config.py
const configPath = join(root, "backend", "config.py");
let configContent = readFileSync(configPath, "utf-8");
configContent = configContent.replace(
  /MANAGER_VERSION\s*=\s*"[^"]+"/,
  `MANAGER_VERSION = "${version}"`
);
writeFileSync(configPath, configContent);

// Update tauri.conf.json
const tauriPath = join(root, "src-tauri", "tauri.conf.json");
const tauri = JSON.parse(readFileSync(tauriPath, "utf-8"));
tauri.version = version;
writeFileSync(tauriPath, JSON.stringify(tauri, null, 2));

console.log(`Synced version ${version} to backend/config.py and tauri.conf.json`);
