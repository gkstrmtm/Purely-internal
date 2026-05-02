import fs from "fs";
import path from "path";

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

const execFile = "src/lib/portalAgentActionExecutor.ts";
const text = read(execFile);

const switchMatches = [...text.matchAll(/switch \(action\)/g)];
if (!switchMatches.length) {
  console.error("Could not find switch (action) in", execFile);
  process.exit(1);
}

function extractSwitchBlock(sourceText, startIdx) {
  const openIdx = sourceText.indexOf("{", startIdx);
  if (openIdx < 0) throw new Error("Could not find switch block opener");

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = openIdx; i < sourceText.length; i += 1) {
    const ch = sourceText[i];
    const next = sourceText[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inSingle) {
      if (!escaped && ch === "'") inSingle = false;
      escaped = !escaped && ch === "\\";
      continue;
    }

    if (inDouble) {
      if (!escaped && ch === '"') inDouble = false;
      escaped = !escaped && ch === "\\";
      continue;
    }

    if (inTemplate) {
      if (!escaped && ch === "`") inTemplate = false;
      escaped = !escaped && ch === "\\";
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      escaped = false;
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      escaped = false;
      continue;
    }

    if (ch === "`") {
      inTemplate = true;
      escaped = false;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return sourceText.slice(startIdx, i + 1);
      }
    }
  }

  throw new Error("Could not find end of switch(action) block");
}

const switchBlocks = switchMatches.map((match) => extractSwitchBlock(text, match.index ?? 0));

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
  // Flag TODOs only after string literals are stripped so enum values like "TODO" do not trigger false positives.
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
const findings = [];

for (const tail of switchBlocks) {
  const blockCases = [];
  for (const m of tail.matchAll(caseRe)) {
    blockCases.push({ key: m[1], idx: m.index ?? 0 });
    cases.push({ key: m[1], idx: m.index ?? 0 });
  }

  for (let i = 0; i < blockCases.length; i++) {
    const start = blockCases[i].idx;
    const end = i + 1 < blockCases.length ? blockCases[i + 1].idx : tail.length;
    const block = tail.slice(start, end);

    const blockNoStrings = stripStringLiterals(block);

    for (const p of patterns) {
      const haystack = blockNoStrings;

      if (p.re.test(haystack)) {
        const lines = block.split("\n");
        const hitLineIdx = lines.findIndex((ln) => p.re.test(ln));
        const snippet = lines.slice(Math.max(0, hitLineIdx - 2), Math.min(lines.length, hitLineIdx + 5)).join("\n");
        findings.push({ key: blockCases[i].key, pattern: p.name, snippet: snippet.slice(0, 800) });
      }
    }
  }
}

const result = {
  executorFile: execFile,
  switchBlocksFound: switchBlocks.length,
  totalCasesFound: cases.length,
  findingsCount: findings.length,
  findings,
};

console.log(JSON.stringify(result, null, 2));

if (findings.length) {
  process.exit(2);
}
