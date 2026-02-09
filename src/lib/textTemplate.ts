export type TemplateVars = Record<string, string | null | undefined>;

function escapeRegExp(raw: string) {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toStr(v: string | null | undefined) {
  if (v === null || v === undefined) return "";
  return String(v);
}

/**
 * Lightweight placeholder renderer.
 *
 * Supports both `{key}` (legacy in the portal) and `{{key}}`.
 * Also supports whitespace like `{{ key }}` / `{ key }`.
 */
export function renderTextTemplate(template: string, vars: TemplateVars): string {
  let out = String(template ?? "");

  const entries = Object.entries(vars)
    .filter(([k]) => Boolean(k && String(k).trim()))
    .map(([k, v]) => [String(k), toStr(v)] as const)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [key, value] of entries) {
    const k = escapeRegExp(key);
    out = out.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), value);
    out = out.replace(new RegExp(`\\{\\s*${k}\\s*\\}`, "g"), value);
  }

  return out;
}
