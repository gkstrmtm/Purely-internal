import fs from "fs";
import path from "path";

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

const actionsFile = "src/lib/portalAgentActions.ts";
const resolverFile = "src/lib/puraResolver.ts";

const actionsText = read(actionsFile);
const resolverText = read(resolverFile).toLowerCase();

const mapMatch = actionsText.match(/export const PortalAgentActionArgsSchemaByKey\s*=\s*\{([\s\S]*?)\n\};/);
if (!mapMatch) {
  console.error("Could not find PortalAgentActionArgsSchemaByKey map in", actionsFile);
  process.exit(1);
}

const mapBody = mapMatch[1];

// Best-effort extraction of arg names that look like IDs from zod object definitions.
// This is heuristic: we look for `fooId:` or `fooIds:` patterns inside the map body.
const idKeys = new Set();
for (const m of mapBody.matchAll(/\b([a-zA-Z0-9_]+Ids?)\s*:\s*/g)) {
  const k = m[1];
  if (!k) continue;
  if (!/(Id|Ids)$/.test(k)) continue;
  idKeys.add(k);
}

const idKeyList = [...idKeys].sort();

const allowMissing = new Set([
  // Internal-only or typically produced by prior tool results.
  "widgetId",
  "messageId",
  "voiceId",
  "subscriptionId",
  "sessionId",
  "setupIntentId",
  "deploymentId",

  // Stable keys/enums that look like IDs but don't need resolver support.
  "bundleId",
  "actionIds",
  "actionId",
  "planIds",
  "planId",

  // Typically produced by prior tool results (uploads/tool listings).
  "attachmentIds",
  "attachmentId",
  "toolIds",
  "toolId",

  // Internal campaign selection pagination/avoid repeats.
  "excludeCampaignIds",
  "excludeCampaignId",
]);

const singularKeys = idKeyList.filter((k) => k.endsWith("Id"));
const pluralKeys = idKeyList.filter((k) => k.endsWith("Ids"));

// Determine which keys appear to be explicitly handled by resolveIdArgByKey.
// Heuristic: if the lowercase key appears in the resolver file, it's probably supported.
const explicitlyHandled = (k) => resolverText.includes(String(k).toLowerCase());

// Some resolvers handle entire families of keys by suffix (e.g. *ContactId, *TagId).
const supportsContactIdSuffix = resolverText.includes('endswith("contactid")');
const supportsTagIdSuffix = resolverText.includes('endswith("tagid")');

const handledBySuffixFamily = (k) => {
  const kl = String(k).toLowerCase();
  if (supportsContactIdSuffix && kl.endsWith("contactid")) return true;
  if (supportsTagIdSuffix && kl.endsWith("tagid")) return true;
  return false;
};

const isHandled = (k) => explicitlyHandled(k) || handledBySuffixFamily(k);

const presentSingular = [];
const missingSingular = [];
for (const k of singularKeys) {
  if (allowMissing.has(k)) continue;
  if (isHandled(k)) presentSingular.push(k);
  else missingSingular.push(k);
}

// Plural *Ids fields are resolved generically by the resolver's walker, by stripping the trailing "s"
// and calling the singular resolver for each element.
const presentPlural = [];
const missingPlural = [];
for (const k of pluralKeys) {
  const singular = k.slice(0, -1); // userIds -> userId
  if (allowMissing.has(k)) continue;
  if (allowMissing.has(singular)) {
    presentPlural.push(k);
    continue;
  }
  if (isHandled(singular) || isHandled(k)) presentPlural.push(k);
  else missingPlural.push(k);
}

const missingActionable = [...missingSingular, ...missingPlural].sort();

const result = {
  actionsFile,
  resolverFile,
  extractedIdKeyCount: idKeyList.length,
  extractedIdKeysSample: idKeyList.slice(0, 60),
  singularIdKeyCount: singularKeys.length,
  pluralIdsKeyCount: pluralKeys.length,
  presentSingularCount: presentSingular.length,
  missingSingularCount: missingSingular.length,
  missingSingular,
  presentPluralCount: presentPlural.length,
  missingPluralCount: missingPlural.length,
  missingPlural,
  missingActionableCount: missingActionable.length,
  missingActionable,
  allowMissing: [...allowMissing].sort(),
};

console.log(JSON.stringify(result, null, 2));

if (missingActionable.length) process.exit(2);
