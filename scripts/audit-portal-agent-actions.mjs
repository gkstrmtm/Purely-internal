import fs from "node:fs";
import path from "node:path";

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

function extractEnumKeysFromPortalAgentActions(tsText) {
  const marker = "export const PortalAgentActionKeySchema";
  const start = tsText.indexOf(marker);
  if (start < 0) throw new Error("Could not find PortalAgentActionKeySchema");

  const enumStart = tsText.indexOf("z.enum([", start);
  if (enumStart < 0) throw new Error("Could not find z.enum([ after PortalAgentActionKeySchema");

  // Find the matching closing "])" for this z.enum([ ... ]) block (best-effort).
  const open = tsText.indexOf("[", enumStart);
  if (open < 0) throw new Error("Could not find opening [ for z.enum");

  let depth = 0;
  let close = -1;
  for (let i = open; i < tsText.length; i += 1) {
    const ch = tsText[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) throw new Error("Could not find closing ] for z.enum array");

  const body = tsText.slice(open + 1, close);
  const keys = [];
  const re = /"([^"]+)"/g;
  let m;
  while ((m = re.exec(body))) {
    const v = String(m[1] || "").trim();
    if (v && v.includes(".")) keys.push(v);
  }
  return Array.from(new Set(keys)).sort();
}

function extractActionCasesFromExecutor(tsText) {
  const keys = [];
  const re = /case\s+"([^"]+)"\s*:/g;
  let m;
  while ((m = re.exec(tsText))) {
    const v = String(m[1] || "").trim();
    if (v && v.includes(".")) keys.push(v);
  }
  return Array.from(new Set(keys)).sort();
}

function extractArgsSchemaKeysFromPortalAgentActions(tsText) {
  // Best-effort parse of PortalAgentActionArgsSchemaByKey = { "key": z... }
  const marker = "export const PortalAgentActionArgsSchemaByKey";
  const start = tsText.indexOf(marker);
  if (start < 0) throw new Error("Could not find PortalAgentActionArgsSchemaByKey");

  const objStart = tsText.indexOf("= {", start);
  if (objStart < 0) throw new Error("Could not find '= {' after PortalAgentActionArgsSchemaByKey");

  // Collect all "...": occurrences until the trailing '} as const;'
  const end = tsText.indexOf("} as const", objStart);
  if (end < 0) throw new Error("Could not find end of PortalAgentActionArgsSchemaByKey (} as const)");

  const body = tsText.slice(objStart, end);
  const keys = [];
  const re = /\n\s*"([^"]+)"\s*:/g;
  let m;
  while ((m = re.exec(body))) {
    const v = String(m[1] || "").trim();
    if (v && v.includes(".")) keys.push(v);
  }
  return Array.from(new Set(keys)).sort();
}

function extractIndexTextKeysFromPortalAgentActions(tsText) {
  // Best-effort parse of portalAgentActionsIndexText() lines array.
  const marker = "export function portalAgentActionsIndexText";
  const start = tsText.indexOf(marker);
  if (start < 0) throw new Error("Could not find portalAgentActionsIndexText");

  const arrStart = tsText.indexOf("const lines = [", start);
  if (arrStart < 0) throw new Error("Could not find 'const lines = [' in portalAgentActionsIndexText");
  const open = tsText.indexOf("[", arrStart);
  if (open < 0) throw new Error("Could not find opening [ for lines array");

  let depth = 0;
  let close = -1;
  for (let i = open; i < tsText.length; i += 1) {
    const ch = tsText[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) throw new Error("Could not find closing ] for lines array");

  const body = tsText.slice(open + 1, close);
  const keys = [];
  // Lines are formatted like: "- some.key: Description"
  const re = /"-\s+([a-z0-9_.]+)\s*:/gi;
  let m;
  while ((m = re.exec(body))) {
    const v = String(m[1] || "").trim();
    if (v && v.includes(".")) keys.push(v);
  }
  return Array.from(new Set(keys)).sort();
}

function fmtList(list, max = 200) {
  const clipped = list.slice(0, max);
  const extra = list.length > max ? `\n… (+${list.length - max} more)` : "";
  return clipped.map((x) => `- ${x}`).join("\n") + extra;
}

const repoRoot = process.cwd();
const actionsPath = path.join(repoRoot, "src/lib/portalAgentActions.ts");
const executorPath = path.join(repoRoot, "src/lib/portalAgentActionExecutor.ts");

const actionsText = readText(actionsPath);
const executorText = readText(executorPath);

const declared = extractEnumKeysFromPortalAgentActions(actionsText);
const implemented = extractActionCasesFromExecutor(executorText);
const argsSchemaKeys = extractArgsSchemaKeysFromPortalAgentActions(actionsText);
const indexTextKeys = extractIndexTextKeysFromPortalAgentActions(actionsText);

const declaredSet = new Set(declared);
const implementedSet = new Set(implemented);

const missingImpl = declared.filter((k) => !implementedSet.has(k));
const extraImpl = implemented.filter((k) => !declaredSet.has(k));

const argsSchemaSet = new Set(argsSchemaKeys);
const missingArgsSchema = declared.filter((k) => !argsSchemaSet.has(k));
const extraArgsSchema = argsSchemaKeys.filter((k) => !declaredSet.has(k));

const indexTextSet = new Set(indexTextKeys);
// Some action keys are intentionally excluded from the index text because they are internal/bridge actions.
const indexTextExcluded = (k) =>
  k.startsWith("ui.canvas.") ||
  k.startsWith("ads.") ||
  k.startsWith("engagement.") ||
  /(^|\.)cron\.run$/i.test(k) ||
  k === "push.register" ||
  k === "seed_demo.run" ||
  k === "auth.webview_session.get" ||
  k === "media.blob_upload.create";
const missingIndexText = declared.filter((k) => !indexTextSet.has(k) && !indexTextExcluded(k));

console.log("Portal agent actions audit\n");
console.log(`Declared (PortalAgentActionKeySchema): ${declared.length}`);
console.log(`Implemented (switch cases): ${implemented.length}`);
console.log(`Missing implementation: ${missingImpl.length}`);
console.log(`Extra cases not declared: ${extraImpl.length}`);
console.log(`Missing args schema: ${missingArgsSchema.length}`);
console.log(`Extra args schema entries not declared: ${extraArgsSchema.length}`);
console.log(`Missing index text listing: ${missingIndexText.length}`);

if (missingImpl.length) {
  console.log("\nMissing implementation (declared but no switch case):\n" + fmtList(missingImpl));
}

if (extraImpl.length) {
  console.log("\nExtra cases (switch case but not declared):\n" + fmtList(extraImpl));
}

if (missingArgsSchema.length) {
  console.log("\nMissing args schema (declared but no schema in PortalAgentActionArgsSchemaByKey):\n" + fmtList(missingArgsSchema));
}

if (extraArgsSchema.length) {
  console.log("\nExtra args schema entries (schema key but not declared):\n" + fmtList(extraArgsSchema));
}

if (missingIndexText.length) {
  console.log("\nMissing index text entries (declared but not listed in portalAgentActionsIndexText):\n" + fmtList(missingIndexText));
}

process.exit(0);
