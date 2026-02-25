#!/usr/bin/env node
/**
 * Platform-aware backend build. Runs build-backend.bat on Windows, build-backend.sh on Linux.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const isWin = process.platform === "win32";

const child = isWin
  ? spawn(join(__dirname, "build-backend.bat"), [], { stdio: "inherit", shell: true, cwd: rootDir })
  : spawn("bash", [join(__dirname, "build-backend.sh")], { stdio: "inherit", cwd: rootDir });

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
