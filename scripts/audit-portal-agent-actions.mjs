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

const declaredSet = new Set(declared);
const implementedSet = new Set(implemented);

const missingImpl = declared.filter((k) => !implementedSet.has(k));
const extraImpl = implemented.filter((k) => !declaredSet.has(k));

console.log("Portal agent actions audit\n");
console.log(`Declared (PortalAgentActionKeySchema): ${declared.length}`);
console.log(`Implemented (switch cases): ${implemented.length}`);
console.log(`Missing implementation: ${missingImpl.length}`);
console.log(`Extra cases not declared: ${extraImpl.length}`);

if (missingImpl.length) {
  console.log("\nMissing implementation (declared but no switch case):\n" + fmtList(missingImpl));
}

if (extraImpl.length) {
  console.log("\nExtra cases (switch case but not declared):\n" + fmtList(extraImpl));
}

process.exit(0);
