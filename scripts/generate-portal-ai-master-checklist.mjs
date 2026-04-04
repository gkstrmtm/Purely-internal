import fs from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();

const UI_ROOT = path.join(REPO_ROOT, "src", "app", "portal", "app");
const API_ROOT = path.join(REPO_ROOT, "src", "app", "api");
const PORTAL_API_ROOT = path.join(API_ROOT, "portal");

const ACTIONS_PATH = path.join(REPO_ROOT, "src", "lib", "portalAgentActions.ts");
const API_COVERAGE_GENERATOR_PATH = path.join(REPO_ROOT, "scripts", "generate-portal-api-inventory.mjs");

const OUT_MD = path.join(REPO_ROOT, "docs", "plans", "portal-ai-master-checklist.md");

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(dir, predicate) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await listFiles(abs, predicate)));
      continue;
    }
    if (ent.isFile() && (!predicate || predicate(abs))) out.push(abs);
  }
  return out;
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function stripRouteGroupSegments(segments) {
  return segments.filter((s) => {
    if (!s) return false;
    // (group) folders are not part of URL.
    if (s.startsWith("(") && s.endsWith(")")) return false;
    // Parallel routes (@slot) are not part of URL.
    if (s.startsWith("@")) return false;
    return true;
  });
}

function pageFileToPortalRoute(filePath) {
  const rel = toPosix(path.relative(UI_ROOT, filePath));
  const withoutSuffix = rel.replace(/\/page\.tsx$/, "");

  const segments = stripRouteGroupSegments(withoutSuffix.split("/").filter(Boolean));

  const route = "/portal/app" + (segments.length ? "/" + segments.join("/") : "");
  return { route, segments, relFile: toPosix(path.relative(REPO_ROOT, filePath)) };
}

function apiRouteFileToEndpoint(filePath) {
  const rel = toPosix(path.relative(API_ROOT, filePath));
  const dir = rel.replace(/\/route\.ts$/, "");
  return { endpoint: `/api/${dir}`, relFile: toPosix(path.relative(REPO_ROOT, filePath)) };
}

function parseMethods(routeFileText) {
  const found = new Set();
  for (const method of HTTP_METHODS) {
    const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`);
    if (re.test(routeFileText)) found.add(method);
  }
  return Array.from(found).sort();
}

function groupKeyFromEndpoint(endpoint) {
  const parts = String(endpoint || "")
    .split("/")
    .filter(Boolean);
  // /api/portal/<group>/...
  if (parts.length >= 3 && parts[0] === "api" && parts[1] === "portal") return parts[2];
  return parts[0] || "(unknown)";
}

function pairKey(method, endpoint) {
  return `${String(method).toUpperCase()} ${String(endpoint)}`;
}

function mdEscape(s) {
  return String(s).replaceAll("|", "\\|");
}

async function loadPortalPages() {
  if (!(await exists(UI_ROOT))) throw new Error(`Portal UI root not found: ${UI_ROOT}`);
  const pageFiles = await listFiles(UI_ROOT, (p) => p.endsWith(`${path.sep}page.tsx`));
  const pages = pageFiles
    .map((f) => pageFileToPortalRoute(f))
    .sort((a, b) => a.route.localeCompare(b.route));
  return { pageFilesCount: pageFiles.length, pages };
}

async function loadPortalApiOperations() {
  if (!(await exists(PORTAL_API_ROOT))) throw new Error(`Portal API root not found: ${PORTAL_API_ROOT}`);
  const routeFiles = await listFiles(PORTAL_API_ROOT, (p) => p.endsWith(`${path.sep}route.ts`));

  const operations = [];
  for (const f of routeFiles) {
    const { endpoint, relFile } = apiRouteFileToEndpoint(f);
    const text = await fs.readFile(f, "utf8");
    const methods = parseMethods(text);
    if (!methods.length) {
      operations.push({ endpoint, method: "(unknown)", file: relFile });
      continue;
    }
    for (const m of methods) operations.push({ endpoint, method: m, file: relFile });
  }

  operations.sort((a, b) => (a.endpoint + a.method).localeCompare(b.endpoint + b.method));

  return { routeFilesCount: routeFiles.length, operations };
}

async function loadActionKeys() {
  const text = await fs.readFile(ACTIONS_PATH, "utf8");
  const enumStart = text.indexOf("PortalAgentActionKeySchema = z.enum([");
  if (enumStart < 0) throw new Error(`Could not find PortalAgentActionKeySchema enum in ${ACTIONS_PATH}`);

  const tail = text.slice(enumStart);
  const enumEnd = tail.indexOf("]);\n");
  const body = enumEnd >= 0 ? tail.slice(0, enumEnd) : tail;

  const keys = [];
  const re = /"([^"]+)"/g;
  let m;
  while ((m = re.exec(body))) keys.push(m[1]);

  // De-dupe, preserve sort stability.
  const uniq = Array.from(new Set(keys)).sort((a, b) => a.localeCompare(b));
  return uniq;
}

async function loadExplicitApiCoveragePairs() {
  const text = await fs.readFile(API_COVERAGE_GENERATOR_PATH, "utf8");
  const re = /\{\s*action\s*:\s*"([^"]+)"\s*,\s*method\s*:\s*"([^"]+)"\s*,\s*endpoint\s*:\s*"([^"]+)"\s*\}/g;
  const byPair = new Map();
  let m;
  while ((m = re.exec(text))) {
    const action = m[1];
    const method = m[2];
    const endpoint = m[3];
    const key = pairKey(method, endpoint);
    const list = byPair.get(key) || [];
    list.push(action);
    byPair.set(key, list);
  }

  for (const [k, list] of byPair.entries()) {
    list.sort((a, b) => a.localeCompare(b));
    byPair.set(k, list);
  }

  return byPair;
}

function normalizeTokenForActions(token) {
  return String(token || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

function bestTokensForPage(segments) {
  const segs = segments.filter(Boolean);
  if (!segs.length) return ["root"];

  // Prefer the most specific segment, but keep a couple for cross-matching.
  if (segs[0] === "services" && segs.length >= 2) return [segs[1], ...segs.slice(2)];
  return [segs[segs.length - 1], segs[0]];
}

function relatedActionsForPage(actionKeys, segments) {
  const tokens = bestTokensForPage(segments)
    .map(normalizeTokenForActions)
    .filter((t) => t && t.length >= 4);

  const matches = new Set();
  for (const action of actionKeys) {
    const s = action.toLowerCase();
    for (const t of tokens) {
      if (s.startsWith(t + ".") || s.includes("." + t + ".") || s.includes(t + "_")) matches.add(action);
    }
  }
  return Array.from(matches).sort((a, b) => a.localeCompare(b));
}

function relatedApiOpsForPage(operations, segments) {
  const rawTokens = bestTokensForPage(segments).filter(Boolean);
  const tokens = new Set();
  for (const t of rawTokens) {
    tokens.add(String(t));
    tokens.add(String(t).replaceAll("_", "-"));
    tokens.add(String(t).replaceAll("-", "_"));
  }

  const matches = new Set();
  for (const op of operations) {
    const endpoint = String(op.endpoint);
    const groupKey = groupKeyFromEndpoint(endpoint);
    for (const t of tokens) {
      if (groupKey === t || endpoint.includes(`/api/portal/${t}`)) {
        matches.add(pairKey(op.method, op.endpoint));
      }
    }
  }

  const byKey = new Map();
  for (const op of operations) byKey.set(pairKey(op.method, op.endpoint), op);

  const out = Array.from(matches)
    .map((k) => byKey.get(k))
    .filter(Boolean)
    .sort((a, b) => (a.endpoint + a.method).localeCompare(b.endpoint + b.method));

  return out;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const [pagesInfo, apiInfo, actionKeys, explicitCoverage] = await Promise.all([
    loadPortalPages(),
    loadPortalApiOperations(),
    loadActionKeys(),
    loadExplicitApiCoveragePairs(),
  ]);

  const { pages, pageFilesCount } = pagesInfo;
  const { operations, routeFilesCount } = apiInfo;

  const md = [];

  md.push("# Portal AI Master Checklist");
  md.push("");
  md.push("This file is auto-generated by `node scripts/generate-portal-ai-master-checklist.mjs`. Do not hand-edit.");
  md.push("");
  md.push(`- Generated: ${new Date().toISOString()}`);
  md.push(`- Portal UI pages (page.tsx): ${pageFilesCount}`);
  md.push(`- Portal API route files (route.ts): ${routeFilesCount}`);
  md.push(`- Portal API operations (route+method): ${operations.filter((o) => o.method !== "(unknown)").length}`);
  md.push(`- Agent action keys (enum): ${actionKeys.length}`);
  md.push("");

  md.push("## Definition of done (per surface)");
  md.push("");
  md.push("Check a page/surface as done only when:");
  md.push("");
  md.push("- The user can ask in plain English and the AI will (a) infer the correct target from context, (b) execute the right action(s), and (c) report back what changed.");
  md.push("- Confirm-required flows still return an assistant message every turn.");
  md.push("- Failures are explained with next-step options (retry, choose a different entity, or ask for missing input).");
  md.push("");

  md.push("## Portal UI Pages (work queue)");
  md.push("");

  const pagesByTop = new Map();
  for (const p of pages) {
    const top = p.segments[0] || "(root)";
    const list = pagesByTop.get(top) || [];
    list.push(p);
    pagesByTop.set(top, list);
  }

  for (const top of Array.from(pagesByTop.keys()).sort((a, b) => a.localeCompare(b))) {
    const list = pagesByTop.get(top) || [];
    list.sort((a, b) => a.route.localeCompare(b.route));

    md.push(`### ${mdEscape(top)} (${list.length})`);
    md.push("");

    for (const p of list) {
      const relActions = relatedActionsForPage(actionKeys, p.segments);
      const relOps = relatedApiOpsForPage(operations, p.segments);

      md.push(`#### [ ] ${mdEscape(p.route)}`);
      md.push("");
      md.push(`- Source: ${mdEscape(p.relFile)}`);
      md.push("");
      md.push("Coverage checklist:");
      md.push("");
      md.push("- [ ] Navigation: can open the right surface from context");
      md.push("- [ ] Read: can summarize current state (lists/filters/selected entity)");
      md.push("- [ ] Write: can create/update/delete all core entities on this surface");
      md.push("- [ ] Upload/import/export flows (if applicable)");
      md.push("- [ ] Confirm-required flows still produce an assistant message");
      md.push("- [ ] Error handling + recovery options (invalid input, missing IDs, permission)");
      md.push("");

      md.push("Related agent action keys (heuristic):");
      md.push("");
      if (relActions.length) {
        for (const group of chunk(relActions, 12)) md.push(`- ${group.map((a) => `\`${a}\``).join(" ")}`);
      } else {
        md.push("- (none matched by heuristic)");
      }
      md.push("");

      md.push("Related API operations (heuristic):");
      md.push("");
      if (relOps.length) {
        for (const op of relOps) {
          const k = pairKey(op.method, op.endpoint);
          const cov = explicitCoverage.get(k);
          const suffix = cov?.length ? ` (mapped: ${cov.join(", ")})` : " (unmapped)";
          md.push(`- ${mdEscape(op.method)} ${mdEscape(op.endpoint)}${mdEscape(suffix)} — ${mdEscape(op.file)}`);
        }
      } else {
        md.push("- (none matched by heuristic)");
      }
      md.push("");

      md.push("UI-only interactions to explicitly cover (manual fill):");
      md.push("");
      md.push("- [ ] Clicks that do not call an API (tabs, toggles, view options)");
      md.push("- [ ] Drag-and-drop / reordering / canvas editing");
      md.push("- [ ] Multi-select + bulk actions");
      md.push("- [ ] Copy/paste, keyboard shortcuts");
      md.push("- [ ] Modals/dialog flows");
      md.push("");
    }
  }

  md.push("## Portal API Operations Checklist (source-of-truth for server-side capability)");
  md.push("");
  md.push("Each checkbox represents a distinct server-side operation (endpoint + HTTP method).");
  md.push("");

  const opsByGroup = new Map();
  for (const op of operations) {
    const g = groupKeyFromEndpoint(op.endpoint);
    const list = opsByGroup.get(g) || [];
    list.push(op);
    opsByGroup.set(g, list);
  }

  for (const g of Array.from(opsByGroup.keys()).sort((a, b) => a.localeCompare(b))) {
    const list = opsByGroup.get(g) || [];
    list.sort((a, b) => (a.endpoint + a.method).localeCompare(b.endpoint + b.method));

    md.push(`### ${mdEscape(g)} (${list.length})`);
    md.push("");

    for (const op of list) {
      const k = pairKey(op.method, op.endpoint);
      const cov = explicitCoverage.get(k);
      const covLabel = cov?.length ? `mapped: ${cov.join(", ")}` : "unmapped";
      md.push(`- [ ] ${mdEscape(op.method)} ${mdEscape(op.endpoint)} (${mdEscape(covLabel)}) — ${mdEscape(op.file)}`);
    }

    md.push("");
  }

  md.push("## Agent Action Keys Checklist (source-of-truth for what the planner may call)");
  md.push("");
  md.push("These are the allowed action keys (the planner must choose from this set).");
  md.push("");

  const actionsByPrefix = new Map();
  for (const a of actionKeys) {
    const prefix = a.includes(".") ? a.split(".", 1)[0] : a;
    const list = actionsByPrefix.get(prefix) || [];
    list.push(a);
    actionsByPrefix.set(prefix, list);
  }

  for (const prefix of Array.from(actionsByPrefix.keys()).sort((a, b) => a.localeCompare(b))) {
    const list = actionsByPrefix.get(prefix) || [];
    list.sort((a, b) => a.localeCompare(b));

    md.push(`### ${mdEscape(prefix)} (${list.length})`);
    md.push("");

    for (const a of list) md.push(`- [ ] \`${a}\``);
    md.push("");
  }

  await fs.mkdir(path.dirname(OUT_MD), { recursive: true });
  await fs.writeFile(OUT_MD, md.join("\n"), "utf8");

  console.log(`Wrote ${toPosix(path.relative(REPO_ROOT, OUT_MD))}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
