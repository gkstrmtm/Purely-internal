import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();

const FORBIDDEN = [
  { needle: "—", label: "em dash" },
  { needle: "–", label: "en dash" },
  { needle: "&mdash;", label: "&mdash;" },
  { needle: "&#8212;", label: "&#8212;" },
  { needle: "&ndash;", label: "&ndash;" },
  { needle: "&#8211;", label: "&#8211;" },
];

const ALLOWED_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".md", ".mdx"]);

const EXCLUDE_EXACT = new Set([
  // Transcript artifacts should never block CI.
  "src/lib/planningnotes.md",
]);

const EXCLUDE_PREFIXES = [
  // Transcript artifacts should never block CI.
  "src/lib/notes/",
];

function isAllowedFile(rel) {
  if (EXCLUDE_EXACT.has(rel)) return false;
  if (EXCLUDE_PREFIXES.some((prefix) => rel.startsWith(prefix))) return false;

  if (!(rel.startsWith("src/") || rel.startsWith("mobile-app/src/"))) return false;

  const ext = path.extname(rel).toLowerCase();
  return ALLOWED_EXTS.has(ext);
}

function listTrackedFiles() {
  const out = execSync("git ls-files", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function findForbiddenInFile(rel) {
  const abs = path.join(ROOT, rel);
  const text = fs.readFileSync(abs, "utf8");

  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const f of FORBIDDEN) {
      if (line.includes(f.needle)) {
        hits.push({ lineNo: i + 1, label: f.label, needle: f.needle, line });
      }
    }
  }

  return hits;
}

function main() {
  const files = listTrackedFiles().filter(isAllowedFile);

  const all = [];
  for (const rel of files) {
    const hits = findForbiddenInFile(rel);
    if (hits.length) {
      all.push({ rel, hits });
    }
  }

  if (!all.length) return;

  console.error("Forbidden dash characters found. Replace with hyphen '-' or punctuation.");
  for (const { rel, hits } of all) {
    for (const h of hits) {
      console.error(`${rel}:${h.lineNo} [${h.label}] ${h.line.trim()}`);
    }
  }

  process.exit(1);
}

main();
