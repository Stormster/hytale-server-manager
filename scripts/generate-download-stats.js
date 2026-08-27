#!/usr/bin/env node
/**
 * Fetches total release-asset download counts from the GitHub API and renders
 * them as a self-contained SVG card for the README. No API key is required:
 * the releases endpoint is public, though GITHUB_TOKEN is used when present to
 * get the higher authenticated rate limit.
 *
 * Run with: node scripts/generate-download-stats.js
 * Regenerated daily by .github/workflows/download-stats.yml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REPO = process.env.STATS_REPO || "Stormster/hytale-server-manager";
const OUT_PATH = path.join(__dirname, "..", "assets", "download-stats.svg");

async function fetchTotalDownloads(repo) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "hytale-server-manager-stats",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  let total = 0;
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(
        `GitHub API request failed: ${res.status} ${res.statusText}`
      );
    }
    const releases = await res.json();
    if (!Array.isArray(releases) || releases.length === 0) break;
    for (const release of releases) {
      for (const asset of release.assets ?? []) {
        total += Number(asset.download_count ?? 0);
      }
    }
    if (releases.length < 100) break;
  }
  return total;
}

function fmt(n) {
  return n.toLocaleString("en-US");
}

const DOWNLOAD_ICON =
  '<path d="M12 3v10.2m0 0-3.8-3.8M12 13.2l3.8-3.8"/>' +
  '<path d="M5 16.5v2A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5v-2"/>';

function renderCard(total, updatedAt) {
  const width = 400;
  const height = 148;
  const cx = width / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Total downloads">
  <title>Hytale Server Manager — total downloads</title>
  <style>
    .card { fill: #f6f8fa; stroke: #d0d7de; }
    .heading { fill: #57606a; }
    .value { fill: #1b1f24; }
    .label { fill: #6e7781; }
    .updated { fill: #6e7781; }
    .icon { stroke: #0066cc; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #0d1420; stroke: #30485f; }
      .heading { fill: #58a6ff; }
      .value { fill: #e8f1f8; }
      .label { fill: #8f98a0; }
      .updated { fill: #8f98a0; }
      .icon { stroke: #58a6ff; }
    }
    text { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .heading { font-size: 13px; font-weight: 700; letter-spacing: 1px; }
    .value { font-size: 30px; font-weight: 800; }
    .label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.6px; }
    .updated { font-size: 10px; }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" class="card" stroke-width="1"/>
  <text x="20" y="26" class="heading">DOWNLOAD STATS</text>
  <text x="${width - 20}" y="26" text-anchor="end" class="updated">updated ${updatedAt}</text>
  <g transform="translate(${cx - 12},50) scale(1)" fill="none" class="icon" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${DOWNLOAD_ICON}</g>
  <text x="${cx}" y="103" text-anchor="middle" class="value">${fmt(total)}</text>
  <text x="${cx}" y="126" text-anchor="middle" class="label">TOTAL INSTALLS</text>
</svg>
`;
}

async function main() {
  const total = await fetchTotalDownloads(REPO);
  const updatedAt = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, renderCard(total, updatedAt), "utf8");
  console.log(`Wrote ${OUT_PATH}`);
  console.log({ totalDownloads: total });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
