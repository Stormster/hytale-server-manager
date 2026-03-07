#!/usr/bin/env node
/**
 * Before `tauri dev`, copy the backend sidecar from binaries/ to target/debug/
 * so the dev process always uses the latest built backend (e.g. correct MANAGER_VERSION).
 * build.rs only runs when Cargo recompiles; this runs every time you start tauri dev.
 * Fails if binaries/ has no backend so we never start dev without a backend (avoids "no backend" UI).
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcTauri = join(root, "src-tauri");
const sidecarName =
  process.platform === "win32"
    ? "server-manager-backend-x86_64-pc-windows-msvc.exe"
    : process.arch === "x64"
      ? "server-manager-backend-x86_64-unknown-linux-gnu"
      : `server-manager-backend-${process.arch}-unknown-linux-gnu`;

const src = join(srcTauri, "binaries", sidecarName);
const destDir = join(srcTauri, "target", "debug");
const dest = join(destDir, sidecarName);

if (!existsSync(src)) {
  // Dev mode runs backend from Python source; binary only needed for release build
  process.exit(0);
}

if (!existsSync(destDir)) {
  // target/debug not created yet; build.rs will copy on first compile
  process.exit(0);
}

try {
  copyFileSync(src, dest);
} catch (_) {
  // Ignore (e.g. exe in use); build.rs copy may have already run
}
process.exit(0);
