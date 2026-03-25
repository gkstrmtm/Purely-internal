import fs from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();
const INVENTORY_PATH = path.join(REPO_ROOT, "docs", "portal-api-inventory.json");
const GENERATOR_PATH = path.join(REPO_ROOT, "scripts", "generate-portal-api-inventory.mjs");

function parseArgs(argv) {
  const out = { limit: 500 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit" || a === "-n") {
      const v = Number(argv[i + 1]);
      if (Number.isFinite(v) && v > 0) out.limit = Math.floor(v);
      i += 1;
      continue;
    }
  }
  return out;
}

function pairKey(method, endpoint) {
  return `${String(method).toUpperCase()} ${String(endpoint)}`;
}

function groupKey(endpoint) {
  const s = String(endpoint || "");
  const parts = s.split("/").filter(Boolean);
  // /api/portal/<group>/...
  if (parts.length >= 3 && parts[0] === "api" && parts[1] === "portal") return parts[2];
  return parts[0] || "(unknown)";
}

async function loadCoveragePairs() {
  const text = await fs.readFile(GENERATOR_PATH, "utf8");
  const re = /\{\s*action\s*:\s*"([^"]+)"\s*,\s*method\s*:\s*"([^"]+)"\s*,\s*endpoint\s*:\s*"([^"]+)"\s*\}/g;
  const pairs = new Set();
  let m;
  while ((m = re.exec(text))) {
    const method = m[2];
    const endpoint = m[3];
    pairs.add(pairKey(method, endpoint));
  }
  return pairs;
}

async function main() {
  const { limit } = parseArgs(process.argv.slice(2));

  const [invRaw, coveredPairs] = await Promise.all([
    fs.readFile(INVENTORY_PATH, "utf8"),
    loadCoveragePairs(),
  ]);

  const inv = JSON.parse(invRaw);
  const routes = Array.isArray(inv?.routes) ? inv.routes : [];

  const allPairs = [];
  for (const r of routes) {
    const endpoint = r?.endpoint;
    const methods = Array.isArray(r?.methods) ? r.methods : [];
    for (const method of methods) {
      allPairs.push({ method: String(method), endpoint: String(endpoint), file: String(r?.file || "") });
    }
  }

  const uncovered = allPairs
    .filter((p) => !coveredPairs.has(pairKey(p.method, p.endpoint)))
    .sort((a, b) => (a.endpoint + a.method).localeCompare(b.endpoint + b.method));

  const coveredCount = allPairs.length - uncovered.length;

  const groupCounts = new Map();
  for (const p of uncovered) {
    const g = groupKey(p.endpoint);
    groupCounts.set(g, (groupCounts.get(g) || 0) + 1);
  }

  const topGroups = Array.from(groupCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  console.log(`Inventory routes: ${routes.length}`);
  console.log(`Endpoint+method pairs: ${allPairs.length}`);
  console.log(`Covered pairs (explicit map): ${coveredCount}`);
  console.log(`Uncovered pairs: ${uncovered.length}`);
  console.log("");

  if (topGroups.length) {
    console.log("Top uncovered groups:");
    for (const [g, c] of topGroups) console.log(`- ${g}: ${c}`);
    console.log("");
  }

  console.log(`Uncovered (first ${Math.min(limit, uncovered.length)}):`);
  for (const p of uncovered.slice(0, limit)) {
    console.log(`- ${pairKey(p.method, p.endpoint)}  (${p.file})`);
  }
}

await main();
