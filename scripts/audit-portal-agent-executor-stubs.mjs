import fs from "fs";
import path from "path";

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

const execFile = "src/lib/portalAgentActionExecutor.ts";
const text = read(execFile);

const switchIdx = text.indexOf("switch (action)");
if (switchIdx < 0) {
  console.error("Could not find switch (action) in", execFile);
  process.exit(1);
}

const tail = text.slice(switchIdx);

function stripStringLiterals(tsLike) {
  // Best-effort removal of string/template literals to avoid false positives like
  // user-facing notes that contain words such as "not implemented".
  // This is intentionally heuristic (not a full parser).
  return String(tsLike || "")
    .replace(/`(?:\\.|[^`])*`/gs, "``")
    .replace(/"(?:\\.|[^"\\])*"/gs, '""')
    .replace(/'(?:\\.|[^'\\])*'/gs, "''");
}

const patterns = [
  // Only flag TODOs in comments/code, not inside strings.
  { name: "todo", re: /\bTODO\b/ },

  // Only flag "not implemented" / "unimplemented" outside of strings.
  { name: "not_implemented", re: /not\s+implemented/i },
  { name: "unimplemented", re: /\bunimplemented\b/i },
];

// Find each case block (best-effort) and scan its body for suspicious patterns.
// Find each case block (best-effort) and scan its body for suspicious patterns.
// Note: some cases include trailing code on the same line (e.g., `case "x": {`).
const caseRe = /^ {4}case\s+"([^"]+)"\s*:/gm;

const cases = [];
for (const m of tail.matchAll(caseRe)) {
  cases.push({ key: m[1], idx: m.index ?? 0 });
}

const findings = [];
for (let i = 0; i < cases.length; i++) {
  const start = cases[i].idx;
  const end = i + 1 < cases.length ? cases[i + 1].idx : tail.length;
  const block = tail.slice(start, end);

  const blockNoStrings = stripStringLiterals(block);

  for (const p of patterns) {
    // For TODOs, the raw block is fine (we want to catch TODO comments).
    // For the other patterns, scan the string-stripped version to reduce false positives.
    const haystack = p.name === "todo" ? block : blockNoStrings;

    if (p.re.test(haystack)) {
      // Try to grab a small snippet for debugging.
      const lines = block.split("\n");
      const hitLineIdx = lines.findIndex((ln) => p.re.test(ln));
      const snippet = lines.slice(Math.max(0, hitLineIdx - 2), Math.min(lines.length, hitLineIdx + 5)).join("\n");
      findings.push({ key: cases[i].key, pattern: p.name, snippet: snippet.slice(0, 800) });
    }
  }
}

const result = {
  executorFile: execFile,
  totalCasesFound: cases.length,
  findingsCount: findings.length,
  findings,
};

console.log(JSON.stringify(result, null, 2));

if (findings.length) {
  process.exit(2);
}
