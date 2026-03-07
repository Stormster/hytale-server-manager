#!/usr/bin/env node
/**
 * VirusTotal scan for release installers (EXE and MSI only).
 * Runs after build; writes release/virustotal-links.md for downloaders.
 * Set VIRUSTOTAL_API_KEY to enable. Fails build on detection when VIRUSTOTAL_FAIL_ON_DETECTION=1 (default).
 */
import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { join, dirname, extname, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUNDLE_DIR = join(ROOT, "src-tauri", "target", "release", "bundle");
const VT_API = "https://www.virustotal.com/api/v3";
const RATE_LIMIT_MS = 15_000; // 4 req/min free tier
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per file
const LARGE_FILE_THRESHOLD = 32 * 1024 * 1024; // 32MB

const apiKey = process.env.VIRUSTOTAL_API_KEY;
const failOnDetection =
  process.env.VIRUSTOTAL_FAIL_ON_DETECTION !== "0" &&
  process.env.VIRUSTOTAL_FAIL_ON_DETECTION?.toLowerCase() !== "false";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function collectExeAndMsi(dir, baseDir, list = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await collectExeAndMsi(full, baseDir, list);
    } else if (e.isFile()) {
      const ext = extname(e.name).toLowerCase();
      if (ext === ".exe" || ext === ".msi") list.push(full);
    }
  }
  return list;
}

async function getUploadUrl(apiKey) {
  const r = await fetch(`${VT_API}/files/upload_url`, {
    method: "GET",
    headers: { "x-apikey": apiKey },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`VirusTotal upload_url failed: ${r.status} ${t}`);
  }
  const j = await r.json();
  return j.data;
}

async function uploadSmall(filePath, apiKey) {
  const body = new FormData();
  const blob = new Blob([await readFile(filePath)], { type: "application/octet-stream" });
  body.set("file", blob, basename(filePath));
  const r = await fetch(`${VT_API}/files`, {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`VirusTotal upload failed: ${r.status} ${t}`);
  }
  return r.json();
}

async function uploadLarge(filePath, apiKey) {
  const uploadUrl = await getUploadUrl(apiKey);
  const buffer = await readFile(filePath);
  const body = new FormData();
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  body.set("file", blob, basename(filePath));
  const r = await fetch(uploadUrl, {
    method: "POST",
    headers: { "x-apikey": apiKey },
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`VirusTotal large upload failed: ${r.status} ${t}`);
  }
  return r.json();
}

async function pollAnalysis(analysisId, apiKey) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const r = await fetch(`${VT_API}/analyses/${analysisId}`, {
      headers: { "x-apikey": apiKey },
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`VirusTotal analyses get failed: ${r.status} ${t}`);
    }
    const j = await r.json();
    const attrs = j.data?.attributes || {};
    const status = attrs.status;
    if (status === "completed") {
      const stats = attrs.stats || {};
      const malicious = stats.malicious ?? 0;
      const suspicious = stats.suspicious ?? 0;
      const undetected = stats.undetected ?? 0;
      const total = malicious + suspicious + undetected;
      const fileId =
        j.meta?.file_info?.sha256 ||
        j.data?.meta?.file_info?.sha256 ||
        j.data?.attributes?.sha256;
      return { malicious, suspicious, total, fileId };
    }
    if (status === "failed" || status === "cancelled") {
      throw new Error(`VirusTotal analysis ${status}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("VirusTotal analysis poll timeout");
}

function analysisIdFromUploadResponse(json) {
  const id = json.data?.id;
  if (id && json.data?.type === "analysis") return id;
  return null;
}

async function getFileIdFromAnalysis(analysisId, apiKey) {
  const r = await fetch(`${VT_API}/analyses/${analysisId}`, {
    headers: { "x-apikey": apiKey },
  });
  if (!r.ok) return null;
  const j = await r.json();
  return (
    j.meta?.file_info?.sha256 ||
    j.data?.meta?.file_info?.sha256 ||
    j.data?.attributes?.sha256 ||
    null
  );
}

async function main() {
  if (!apiKey || apiKey.trim() === "") {
    console.log("Skipping VirusTotal (no VIRUSTOTAL_API_KEY).");
    process.exit(0);
  }

  try {
    await stat(BUNDLE_DIR);
  } catch (e) {
    console.error("Bundle directory not found:", BUNDLE_DIR);
    console.error("Run 'npm run tauri build' first.");
    process.exit(1);
  }

  const files = await collectExeAndMsi(BUNDLE_DIR, BUNDLE_DIR);
  if (files.length === 0) {
    console.log("No .exe or .msi found in bundle (e.g. building on non-Windows). Skipping VirusTotal.");
    process.exit(0);
  }

  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  const version = pkg.version || "unknown";
  const buildDate = new Date().toISOString().slice(0, 10);

  const rows = [];
  let anyMalicious = false;

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    const name = relative(BUNDLE_DIR, filePath).replace(/\\/g, "/");
    const size = (await stat(filePath)).size;
    console.log(`[VirusTotal] Scanning ${name} (${(size / 1024 / 1024).toFixed(2)} MB)...`);

    let uploadJson;
    if (size > LARGE_FILE_THRESHOLD) {
      uploadJson = await uploadLarge(filePath, apiKey);
    } else {
      uploadJson = await uploadSmall(filePath, apiKey);
    }

    const analysisId = analysisIdFromUploadResponse(uploadJson);
    if (!analysisId) {
      console.error("[VirusTotal] Could not get analysis id from upload response.");
      process.exit(1);
    }

    if (i < files.length - 1) await sleep(RATE_LIMIT_MS);

    const result = await pollAnalysis(analysisId, apiKey);
    const fileId =
      result.fileId || (await getFileIdFromAnalysis(analysisId, apiKey));
    const reportUrl = fileId
      ? `https://www.virustotal.com/gui/file/${fileId}`
      : `https://www.virustotal.com/gui/analysis/${analysisId}`;

    if (result.malicious > 0) anyMalicious = true;
    console.log(
      `  ${name}: ${result.malicious}/${result.total} malicious, ${result.suspicious} suspicious → ${reportUrl}`
    );
    rows.push({ name, reportUrl, malicious: result.malicious, total: result.total });
  }

  const releaseDir = join(ROOT, "release");
  await mkdir(releaseDir, { recursive: true });
  const mdPath = join(releaseDir, "virustotal-links.md");
  const md = [
    `# VirusTotal scan results – ${pkg.name || "Hytale Server Manager"} v${version}`,
    `Build: ${buildDate}`,
    "",
    "| Artifact | Report |",
    "| -------- | ------ |",
    ...rows.map(
      (r) =>
        `| ${r.name} | [View on VirusTotal](${r.reportUrl}) ${r.malicious > 0 ? `(${r.malicious}/${r.total} engines flagged)` : ""} |`
    ),
    "",
  ].join("\n");
  await writeFile(mdPath, md, "utf8");
  console.log("[VirusTotal] Wrote", mdPath);

  if (failOnDetection && anyMalicious) {
    console.error("[VirusTotal] One or more files were flagged. Failing build (set VIRUSTOTAL_FAIL_ON_DETECTION=0 to allow).");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
