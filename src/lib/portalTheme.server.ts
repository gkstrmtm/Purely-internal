import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/db";

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

export type PortalThemeMode = "device" | "light" | "dark";

function normalizeThemeMode(input: unknown): PortalThemeMode {
  const mode = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (mode === "light" || mode === "dark") return mode;
  return "device";
}

function asThemeRec(dataJson: unknown): Record<string, unknown> {
  return dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : {};
}

export async function getPortalThemeMode(userId?: string | null): Promise<PortalThemeMode> {
  noStore();

  const cleanUserId = typeof userId === "string" ? userId.trim() : "";
  if (!cleanUserId) return "device";

  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId: cleanUserId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec = asThemeRec(row?.dataJson);
  return normalizeThemeMode(rec.themeMode);
}