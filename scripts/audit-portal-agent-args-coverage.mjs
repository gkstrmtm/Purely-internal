import fs from "fs";
import path from "path";

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

const actionsFile = "src/lib/portalAgentActions.ts";

const text = read(actionsFile);

const enumMatch = text.match(/PortalAgentActionKeySchema\s*=\s*z\.enum\(\[([\s\S]*?)\]\)\s*;/);
if (!enumMatch) {
  console.error("Could not find PortalAgentActionKeySchema enum list in", actionsFile);
  process.exit(1);
}

const enumBody = enumMatch[1];
const enumKeys = new Set();
for (const m of enumBody.matchAll(/"([^"]+)"/g)) enumKeys.add(m[1]);

const mapMatch = text.match(/export const PortalAgentActionArgsSchemaByKey\s*=\s*\{([\s\S]*?)\n\};/);
if (!mapMatch) {
  console.error("Could not find PortalAgentActionArgsSchemaByKey map in", actionsFile);
  process.exit(1);
}

const mapBody = mapMatch[1];
const mapKeys = new Set();
// Matches keys like "foo.bar": z... or 'foo.bar': z...
for (const m of mapBody.matchAll(/^[ \t]*["']([^"']+)["']\s*:\s*/gm)) {
  mapKeys.add(m[1]);
}

const missingArgsSchema = [...enumKeys].filter((k) => !mapKeys.has(k)).sort();
const extraArgsSchema = [...mapKeys].filter((k) => !enumKeys.has(k)).sort();

const result = {
  declaredActionKeys: enumKeys.size,
  argsSchemaKeys: mapKeys.size,
  missingArgsSchemaCount: missingArgsSchema.length,
  extraArgsSchemaCount: extraArgsSchema.length,
  missingArgsSchema,
  extraArgsSchema,
};

console.log(JSON.stringify(result, null, 2));

if (missingArgsSchema.length || extraArgsSchema.length) {
  process.exit(2);
}
