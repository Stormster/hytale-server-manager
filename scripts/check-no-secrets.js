#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const forbiddenLiteralPatterns = [
  {
    name: "Hardcoded VirusTotal API key assignment",
    // Non-empty assignment; placeholders are allowlisted below.
    regex: /VIRUSTOTAL_API_KEY\s*=\s*["']?([A-Za-z0-9_-]{20,})["']?/g,
  },
];

const allowedPlaceholderValues = new Set([
  "",
  "YOUR_API_KEY",
  "REPLACE_ME",
  "CHANGEME",
  "EXAMPLE",
]);

function getTrackedFiles() {
  const out = execSync("git ls-files", { encoding: "utf8" });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLikelyText(content) {
  // Quick binary guard.
  return !content.includes("\u0000");
}

function scan() {
  const failures = [];
  const files = getTrackedFiles();

  for (const relPath of files) {
    let data;
    try {
      data = readFileSync(join(process.cwd(), relPath), "utf8");
    } catch {
      continue;
    }
    if (!isLikelyText(data)) continue;

    for (const rule of forbiddenLiteralPatterns) {
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(data)) !== null) {
        const rawValue = (match[1] ?? "").trim();
        if (allowedPlaceholderValues.has(rawValue)) continue;
        failures.push({
          file: relPath,
          rule: rule.name,
          valuePreview:
            rawValue.length <= 10
              ? "*".repeat(rawValue.length)
              : `${rawValue.slice(0, 4)}...${rawValue.slice(-4)}`,
        });
      }
    }
  }

  if (failures.length > 0) {
    console.error("Secret policy check failed:");
    for (const f of failures) {
      console.error(`- ${f.rule} in ${f.file} (${f.valuePreview})`);
    }
    console.error(
      "\nUse local .env for real keys and keep tracked files on placeholders only."
    );
    process.exit(1);
  }

  console.log("Secret policy check passed.");
}

scan();
