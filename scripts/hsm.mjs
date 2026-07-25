#!/usr/bin/env node
/**
 * Hytale Server Manager — cross-repo dev CLI.
 * Usage: npm run hsm -- <command> [args]
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
config({ path: join(appRoot, ".env") });

const experimentalRepo =
  process.env.HSM_EXPERIMENTAL_ADDON_REPO ||
  join(appRoot, "..", "hytale-server-manager-experimental");
const websiteRepo = join(appRoot, "..", "hytale-manager-website");
const remoteRepo = join(appRoot, "..", "hytale-remote");

const args = process.argv.slice(2);
const cmd = args[0];
const rest = args.slice(1);

function run(cmd, cmdArgs, opts = {}) {
  const { cwd = appRoot, env = process.env, shell = process.platform === "win32" } = opts;
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd, env, shell });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 0;
}

function runOrExit(cmd, cmdArgs, opts = {}) {
  const code = run(cmd, cmdArgs, opts);
  if (code !== 0) process.exit(code);
}

function npmScript(script, extraArgs = [], cwd = appRoot) {
  const parts = script.split(" ");
  runOrExit("npm", ["run", ...parts, ...(extraArgs.length ? ["--", ...extraArgs] : [])], { cwd });
}

function pythonCmd(repoRoot) {
  const venv =
    process.platform === "win32"
      ? join(repoRoot, ".venv", "Scripts", "python.exe")
      : join(repoRoot, ".venv", "bin", "python");
  return existsSync(venv) ? venv : "python";
}

function printHelp() {
  console.log(`
Hytale Server Manager — dev CLI

Daily
  dev                 Desktop app (Tauri + Python backend)
  dev:addon [--fast]  Dev with experimental addon wheel
  dev:remote          Dev with Remote UI + API enabled

Release
  release             Build installer (no VirusTotal)
  release:full        Build installer + VirusTotal scan
  bump:patch|minor|major   Bump manager version + sync files

Tests
  test                All tests (setup + website + experimental)
  test --setup-only   hytale-setup backend pytest only

Addon (../hytale-server-manager-experimental)
  addon build         Build frontend + .whl
  addon test          pytest in experimental repo

Website (../hytale-manager-website)
  website dev         next dev
  website deploy      Cloudflare deploy

Remote (../hytale-remote)
  remote build        Maven package (build.ps1)

Examples
  npm run hsm -- dev
  npm run hsm -- dev:addon -- --fast
  .\\scripts\\hsm.ps1 release
`);
}

if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
  printHelp();
  process.exit(0);
}

switch (cmd) {
  case "dev":
    npmScript("dev");
    break;
  case "dev:addon":
    npmScript("dev:addon", rest);
    break;
  case "dev:remote":
    npmScript("dev:remote");
    break;
  case "release":
    npmScript("release");
    break;
  case "release:full":
    npmScript("release:full");
    break;
  case "bump:patch":
  case "bump:minor":
  case "bump:major":
    npmScript(cmd);
    break;
  case "bump":
    if (rest[0] === "patch" || rest[0] === "minor" || rest[0] === "major") {
      npmScript(`bump:${rest[0]}`);
    } else {
      console.error("Usage: hsm bump patch|minor|major");
      process.exit(1);
    }
    break;
  case "test":
    if (rest.includes("--setup-only")) {
      process.exit(run(pythonCmd(appRoot), ["-m", "pytest", "backend/tests", "-q"], { cwd: appRoot }));
    } else {
      let code = 0;
      if (run(pythonCmd(appRoot), ["-m", "pytest", "backend/tests", "-q"], { cwd: appRoot }) !== 0) {
        code = 1;
      }
      if (existsSync(join(websiteRepo, "package.json"))) {
        if (run("npm", ["test"], { cwd: websiteRepo }) !== 0) code = 1;
      }
      if (existsSync(join(experimentalRepo, "pyproject.toml"))) {
        if (
          run(pythonCmd(experimentalRepo), ["-m", "pytest", "tests", "-q"], {
            cwd: experimentalRepo,
          }) !== 0
        ) {
          code = 1;
        }
      }
      process.exit(code);
    }
    break;
  case "addon":
    if (rest[0] === "build") {
      if (!existsSync(experimentalRepo)) {
        console.error("Experimental repo not found:", experimentalRepo);
        process.exit(1);
      }
      const frontendDir = join(experimentalRepo, "frontend");
      runOrExit("npm", ["ci"], { cwd: frontendDir });
      runOrExit("npm", ["run", "build"], { cwd: frontendDir });
      process.exit(run(pythonCmd(experimentalRepo), ["-m", "build", "--wheel"], { cwd: experimentalRepo }));
    } else if (rest[0] === "test") {
      process.exit(run(pythonCmd(experimentalRepo), ["-m", "pytest", "tests", "-q"], { cwd: experimentalRepo }));
    } else {
      console.error("Usage: hsm addon build|test");
      process.exit(1);
    }
    break;
  case "website":
    if (rest[0] === "dev") {
      process.exit(run("npm", ["run", "dev"], { cwd: websiteRepo }));
    } else if (rest[0] === "deploy") {
      process.exit(run("npm", ["run", "deploy"], { cwd: websiteRepo }));
    } else {
      console.error("Usage: hsm website dev|deploy");
      process.exit(1);
    }
    break;
  case "remote":
    if (rest[0] === "build") {
      if (process.platform === "win32") {
        process.exit(
          run("powershell", ["-File", join(remoteRepo, "build.ps1"), "clean", "package"], {
            cwd: remoteRepo,
            shell: true,
          })
        );
      }
      process.exit(run(join(remoteRepo, "mvnw"), ["clean", "package"], { cwd: remoteRepo }));
    } else {
      console.error("Usage: hsm remote build");
      process.exit(1);
    }
    break;
  default:
    console.error(`Unknown command: ${cmd}\n`);
    printHelp();
    process.exit(1);
}
