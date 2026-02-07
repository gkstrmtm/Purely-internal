const DEFAULT_DEMO_PORTAL_FULL_EMAIL = "demo-full@purelyautomation.dev";

function normalizeEmail(email: string | null | undefined) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function parseEmailAllowList(raw: string | null | undefined): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 200);
}

export function isB2cLeadPullUnlocked({
  email,
  role,
}: {
  email: string | null | undefined;
  role: string | null | undefined;
}): boolean {
  if (role === "ADMIN") return true;

  const allow = parseEmailAllowList(process.env.B2C_PULL_ALLOW_EMAILS);

  const demoFull = normalizeEmail(process.env.DEMO_PORTAL_FULL_EMAIL ?? DEFAULT_DEMO_PORTAL_FULL_EMAIL);
  if (demoFull) allow.push(demoFull);

  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  return allow.includes(normalized);
}
