import crypto from "node:crypto";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function normalizeFingerprintText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getPublicIntakeIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  const realIp = req.headers.get("x-real-ip");
  return realIp?.trim() || null;
}

export function buildPublicIntakeFingerprint(value: unknown): string {
  const normalized = normalizeFingerprintText(stableJson(value));
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}
