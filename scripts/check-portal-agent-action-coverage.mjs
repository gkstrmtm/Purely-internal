import fs from "fs";
import path from "path";

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

const actionsFile = "src/lib/portalAgentActions.ts";
const execFile = "src/lib/portalAgentActionExecutor.ts";

const actionsText = read(actionsFile);
const execText = read(execFile);

const enumMatch = actionsText.match(/PortalAgentActionKeySchema\s*=\s*z\.enum\(\[([\s\S]*?)\]\)\s*;/);
if (!enumMatch) {
  console.error("Could not find PortalAgentActionKeySchema enum list in", actionsFile);
  process.exit(1);
}

const enumBody = enumMatch[1];
const keyRe = /\"([^\"]+)\"/g;
const keys = new Set();
for (let m = keyRe.exec(enumBody); m; m = keyRe.exec(enumBody)) keys.add(m[1]);

const switchIdx = execText.indexOf("switch (action)");
if (switchIdx < 0) {
  console.error("Could not find switch(action) block in", execFile);
  process.exit(1);
}

// Top-level action cases in this executor are consistently indented with 4 spaces.
// This avoids brittle brace-depth parsing (regex literals contain braces like `\\d{2}`).
const tail = execText.slice(switchIdx);
const cases = new Set();
for (const m of tail.matchAll(/^ {4}case\s+\"([^\"]+)\"\s*:/gm)) {
  cases.add(m[1]);
}

const missingInExec = [...keys].filter((k) => !cases.has(k)).sort();
const extraInExec = [...cases].filter((k) => !keys.has(k)).sort();

console.log(JSON.stringify({
  declaredKeys: keys.size,
  executorCases: cases.size,
  missingInExecCount: missingInExec.length,
  extraInExecCount: extraInExec.length,
  missingInExec: missingInExec,
  extraInExec: extraInExec,
}, null, 2));
