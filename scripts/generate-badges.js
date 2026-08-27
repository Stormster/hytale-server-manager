#!/usr/bin/env node
/**
 * Renders the README header badges as self-contained SVGs.
 *
 * shields.io locks its badges to DejaVu Sans / Verdana, so these are generated
 * locally to use a modern system font stack instead. Geometry matches the
 * shields "for-the-badge" style (28px tall, two segments) so the row still
 * reads as a normal badge bar.
 *
 * Run with: node scripts/generate-badges.js
 * Regenerated daily by .github/workflows/badges.yml
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.STATS_REPO || "Stormster/hytale-server-manager";
const INSTALL_BASELINE = Number(process.env.INSTALL_BASELINE ?? 600);
const OUT_DIR = path.join(__dirname, "..", "assets", "badges");

const HEIGHT = 28;
const FONT_SIZE = 11;
const LETTER_SPACING = 0.8;
const PAD = 13;
const LABEL_BG = "#4a4a52";
const FONT_STACK =
  "'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',Arial,sans-serif";

// Approximate advance widths for uppercase Segoe UI Bold at 11px. Only the
// characters used by these badges need to be accurate.
const WIDTHS = {
  A: 7.9, B: 7.6, C: 7.7, D: 8.3, E: 7.0, F: 6.7, G: 8.4, H: 8.4, I: 3.6,
  J: 5.6, K: 7.6, L: 6.3, M: 10.4, N: 8.7, O: 8.9, P: 7.3, Q: 8.9, R: 7.7,
  S: 7.1, T: 7.0, U: 8.4, V: 7.9, W: 12.0, X: 7.7, Y: 7.4, Z: 7.1,
  0: 7.2, 1: 7.2, 2: 7.2, 3: 7.2, 4: 7.2, 5: 7.2, 6: 7.2, 7: 7.2, 8: 7.2,
  9: 7.2, " ": 3.4, ",": 3.4, ".": 3.4, "-": 4.4, "+": 7.2, ":": 3.4,
};

function textWidth(text) {
  let w = 0;
  for (const ch of text.toUpperCase()) w += (WIDTHS[ch] ?? 7.2) + LETTER_SPACING;
  return Math.ceil(w);
}

// Patreon wordmark glyph: a bar and a circle.
const PATREON_LOGO = '<rect x="0" y="0" width="3.2" height="14" rx="0.4"/><circle cx="10.1" cy="5.6" r="5.6"/>';
const LOGO_W = 16;

function badge({ label, value, color, logo = false }) {
  const labelW = PAD + (logo ? LOGO_W + 6 : 0) + textWidth(label) + PAD;
  const valueW = PAD + textWidth(value) + PAD;
  const total = labelW + valueW;
  const mid = HEIGHT / 2;
  // Nudged below centre so uppercase text sits optically centred.
  const baseline = mid + FONT_SIZE * 0.35;

  const logoSvg = logo
    ? `<g transform="translate(${PAD},${mid - 7}) scale(1)" fill="#ffffff" opacity="0.95">${PATREON_LOGO}</g>`
    : "";
  const labelX = PAD + (logo ? LOGO_W + 6 : 0);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${HEIGHT}" viewBox="0 0 ${total} ${HEIGHT}" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <style>
    text { font-family: ${FONT_STACK}; font-size: ${FONT_SIZE}px; font-weight: 700; letter-spacing: ${LETTER_SPACING}px; }
  </style>
  <rect width="${labelW}" height="${HEIGHT}" fill="${LABEL_BG}"/>
  <rect x="${labelW}" width="${valueW}" height="${HEIGHT}" fill="${color}"/>
  ${logoSvg}
  <text x="${labelX}" y="${baseline}" fill="#ffffff" opacity="0.92">${label.toUpperCase()}</text>
  <text x="${labelW + PAD}" y="${baseline}" fill="#ffffff">${value.toUpperCase()}</text>
</svg>
`;
}

async function fetchTotalDownloads(repo) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "hytale-server-manager-badges",
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
      throw new Error(`GitHub API request failed: ${res.status} ${res.statusText}`);
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
  return total + INSTALL_BASELINE;
}

async function main() {
  const total = await fetchTotalDownloads(REPO);
  const badges = {
    "download.svg": badge({ label: "Download", value: "Latest Release", color: "#0066cc" }),
    "installs.svg": badge({ label: "Installs", value: total.toLocaleString("en-US"), color: "#2ea44f" }),
    "patreon.svg": badge({ label: "Support", value: "Patreon", color: "#ff424d", logo: true }),
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, svg] of Object.entries(badges)) {
    fs.writeFileSync(path.join(OUT_DIR, name), svg, "utf8");
  }
  console.log(`Wrote ${Object.keys(badges).length} badges to ${OUT_DIR}`);
  console.log({ totalDownloads: total });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
