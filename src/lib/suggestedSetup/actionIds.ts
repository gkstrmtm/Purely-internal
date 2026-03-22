// Stable action IDs are critical for approval-gated apply flows.
// The ID format is deterministic based on kind + a compact signature.

export function stableJson(value: unknown): string {
  return JSON.stringify(sortRec(value));
}

function sortRec(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortRec);
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(rec).sort()) out[k] = sortRec(rec[k]);
  return out;
}

export function actionIdFromParts(parts: {
  kind: string;
  serviceSlug: string;
  signature: unknown;
}): string {
  const sig = stableJson(parts.signature);
  const hash = fnv1a32(`${parts.kind}|${parts.serviceSlug}|${sig}`);
  return `ss:${parts.kind}:${hash}`;
}

// Lightweight deterministic hash (no Node crypto dependency).
function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    h >>>= 0;
  }
  return h.toString(16).padStart(8, "0");
}
