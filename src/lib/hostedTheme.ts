import { prisma } from "@/lib/db";

const SERVICE_SLUG = "hosted_theme";

export type HostedThemeOverrides = {
  version: 1;
  bgHex: string | null;
  surfaceHex: string | null;
  softHex: string | null;
  borderHex: string | null;
  textHex: string | null;
  mutedTextHex: string | null;
  primaryHex: string | null;
  accentHex: string | null;
  linkHex: string | null;
};

const DEFAULT_HOSTED_THEME: HostedThemeOverrides = {
  version: 1,
  bgHex: null,
  surfaceHex: null,
  softHex: null,
  borderHex: null,
  textHex: null,
  mutedTextHex: null,
  primaryHex: null,
  accentHex: null,
  linkHex: null,
};

function normalizeHex(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return null;
  const m3 = /^#([0-9a-fA-F]{3})$/.exec(v);
  if (m3) {
    const [a, b, c] = m3[1].split("");
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (m6) return `#${m6[1]}`.toLowerCase();
  return null;
}

function parseHostedTheme(raw: unknown): HostedThemeOverrides {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

  const get = (key: keyof HostedThemeOverrides) => normalizeHex(rec?.[key as string]);

  return {
    version: 1,
    bgHex: get("bgHex"),
    surfaceHex: get("surfaceHex"),
    softHex: get("softHex"),
    borderHex: get("borderHex"),
    textHex: get("textHex"),
    mutedTextHex: get("mutedTextHex"),
    primaryHex: get("primaryHex"),
    accentHex: get("accentHex"),
    linkHex: get("linkHex"),
  };
}

export async function getHostedTheme(ownerId: string): Promise<HostedThemeOverrides> {
  const cleanOwnerId = String(ownerId || "").trim();
  if (!cleanOwnerId) return DEFAULT_HOSTED_THEME;

  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId: cleanOwnerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  return parseHostedTheme(row?.dataJson);
}

export async function setHostedTheme(ownerId: string, next: Partial<HostedThemeOverrides>): Promise<HostedThemeOverrides> {
  const cleanOwnerId = String(ownerId || "").trim();
  if (!cleanOwnerId) return DEFAULT_HOSTED_THEME;

  const existing = await getHostedTheme(cleanOwnerId);

  const has = (k: keyof HostedThemeOverrides) => Object.prototype.hasOwnProperty.call(next, k);
  const mergeHex = (k: keyof HostedThemeOverrides): string | null => {
    if (!has(k)) return (existing as any)[k] as string | null;
    return normalizeHex((next as any)[k]);
  };

  const merged: HostedThemeOverrides = {
    version: 1,
    bgHex: mergeHex("bgHex"),
    surfaceHex: mergeHex("surfaceHex"),
    softHex: mergeHex("softHex"),
    borderHex: mergeHex("borderHex"),
    textHex: mergeHex("textHex"),
    mutedTextHex: mergeHex("mutedTextHex"),
    primaryHex: mergeHex("primaryHex"),
    accentHex: mergeHex("accentHex"),
    linkHex: mergeHex("linkHex"),
  };

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId: cleanOwnerId, serviceSlug: SERVICE_SLUG } },
    create: { ownerId: cleanOwnerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: merged },
    update: { status: "COMPLETE", dataJson: merged },
    select: { ownerId: true },
  });

  return merged;
}

export function defaultHostedTheme(): HostedThemeOverrides {
  return DEFAULT_HOSTED_THEME;
}
