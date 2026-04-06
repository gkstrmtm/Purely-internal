export type PlaceholderIdFinding = {
  path: string;
  key: string;
  valuePreview: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function toCamelCaseIdKeyFromSnake(key: string): string | null {
  const s = String(key || "").trim();
  if (!s) return null;
  if (!/_id$/i.test(s)) return null;

  const base = s.replace(/_id$/i, "");
  if (!base) return null;

  const parts = base.split(/_+/g).filter(Boolean);
  if (!parts.length) return null;

  const head = parts[0]!.toLowerCase();
  const tail = parts
    .slice(1)
    .map((p) => p.slice(0, 1).toUpperCase() + p.slice(1).toLowerCase())
    .join("");
  return `${head}${tail}Id`;
}

function isIdLikeKey(key: string): boolean {
  const k = String(key || "").trim();
  if (!k) return false;
  return /(^id$|Id$|_id$|Ids$|_ids$)/.test(k);
}

export function looksLikePlaceholderId(raw: unknown): boolean {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return false;
  const lower = s.toLowerCase();

  if (lower.includes("{{") || lower.includes("}}")) return true;
  if (lower.includes("<") || lower.includes(">")) return true;
  if (/(^|[^a-z])placeholder([^a-z]|$)/i.test(lower)) return true;

  if (["id", "_id", "-id", "null", "undefined", "none", "n/a", "na"].includes(lower)) return true;
  if (/^(your|my|some|this|that)[-_]?id([_-]?here)?$/i.test(lower)) return true;
  if (/^id[_-]?here$/i.test(lower)) return true;

  // Common planner placeholders like new_funnel_id, booking_page_id, funnel_id, page_id.
  if (/^(new|temp|test|sample|example|fake|dummy|placeholder|unknown|tbd|todo)(?:[-_][a-z0-9]+){0,6}[-_]?id(s)?$/i.test(lower)) {
    return true;
  }

  // Strong signal: English-ish snake/hyphen id without digits, ending in _id/_ids.
  if (!/[0-9]/.test(lower) && /^[a-z]+(?:[-_][a-z]+){0,8}[-_]?id(s)?$/i.test(lower)) {
    return true;
  }

  // Repeated-x style placeholders.
  if (/^(x{3,}|0{3,}|-{3,}|_{3,})$/i.test(lower)) return true;

  return false;
}

export function sanitizeIdLikeObjectDeep<T>(value: T, opts?: { maxDepth?: number }): T {
  const maxDepth = typeof opts?.maxDepth === "number" ? opts.maxDepth : 7;

  const walk = (v: unknown, depth: number): unknown => {
    if (depth <= 0) return v;
    if (v == null) return v;

    if (Array.isArray(v)) {
      return v.map((x) => walk(x, depth - 1));
    }

    if (!isPlainObject(v)) return v;

    const out: Record<string, unknown> = {};
    for (const [kRaw, child] of Object.entries(v)) {
      const k = String(kRaw);

      // Normalize snake_case *_id keys to camelCase *Id.
      const camelIdKey = toCamelCaseIdKeyFromSnake(k);
      const targetKey = camelIdKey && !(camelIdKey in out) ? camelIdKey : k;

      // If the field looks like an ID field and the value is a placeholder, drop it.
      if (isIdLikeKey(targetKey) && looksLikePlaceholderId(child)) {
        continue;
      }

      if (Array.isArray(child) && /ids$/i.test(targetKey)) {
        out[targetKey] = child
          .map((x) => (typeof x === "string" ? x.trim() : x))
          .filter((x) => !(typeof x === "string" && looksLikePlaceholderId(x)))
          .map((x) => walk(x, depth - 1));
        continue;
      }

      out[targetKey] = walk(child, depth - 1);
    }

    return out;
  };

  return walk(value, maxDepth) as T;
}

export function findPlaceholderIdPaths(value: unknown, opts?: { maxDepth?: number; maxFindings?: number }): PlaceholderIdFinding[] {
  const maxDepth = typeof opts?.maxDepth === "number" ? opts.maxDepth : 7;
  const maxFindings = typeof opts?.maxFindings === "number" ? opts.maxFindings : 8;

  const findings: PlaceholderIdFinding[] = [];

  const walk = (v: unknown, path: string, depth: number) => {
    if (findings.length >= maxFindings) return;
    if (depth <= 0) return;
    if (v == null) return;

    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        walk(v[i], `${path}[${i}]`, depth - 1);
        if (findings.length >= maxFindings) return;
      }
      return;
    }

    if (!isPlainObject(v)) return;

    for (const [kRaw, child] of Object.entries(v)) {
      if (findings.length >= maxFindings) return;
      const k = String(kRaw);
      const nextPath = path ? `${path}.${k}` : k;

      if (isIdLikeKey(k)) {
        if (typeof child === "string" && looksLikePlaceholderId(child)) {
          findings.push({
            path: nextPath,
            key: k,
            valuePreview: child.trim().slice(0, 80),
          });
          continue;
        }
        if (Array.isArray(child) && /ids$/i.test(k)) {
          const bad = child.find((x) => typeof x === "string" && looksLikePlaceholderId(x));
          if (typeof bad === "string") {
            findings.push({
              path: `${nextPath}[]`,
              key: k,
              valuePreview: bad.trim().slice(0, 80),
            });
            continue;
          }
        }
      }

      walk(child, nextPath, depth - 1);
    }
  };

  walk(value, "", maxDepth);
  return findings;
}
