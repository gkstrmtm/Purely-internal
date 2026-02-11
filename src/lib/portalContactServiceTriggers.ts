import crypto from "crypto";

import { prisma } from "@/lib/db";
import { ensurePortalContactsSchema } from "@/lib/portalContactsSchema";
import { ensurePortalContactServiceTriggersSchema } from "@/lib/portalContactServiceTriggersSchema";

function cuidish(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function ensurePortalContactServiceTriggersReady(): Promise<void> {
  await ensurePortalContactsSchema();
  await ensurePortalContactServiceTriggersSchema();
}

export async function recordPortalContactServiceTrigger(opts: {
  ownerId: string;
  contactId: string;
  serviceSlug: string;
}): Promise<void> {
  const ownerId = String(opts.ownerId || "").trim();
  const contactId = String(opts.contactId || "").trim();
  const serviceSlug = String(opts.serviceSlug || "").trim().slice(0, 80);
  if (!ownerId || !contactId || !serviceSlug) return;

  await ensurePortalContactServiceTriggersReady();

  const now = new Date();

  try {
    await prisma.portalContactServiceTrigger.upsert({
      where: { ownerId_contactId_serviceSlug: { ownerId, contactId, serviceSlug } },
      create: {
        id: cuidish("pcst"),
        ownerId,
        contactId,
        serviceSlug,
        triggerCount: 1,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        triggerCount: { increment: 1 },
        updatedAt: now,
      },
      select: { id: true },
    });
  } catch {
    // best-effort
  }
}

export async function listPortalContactServiceTriggers(opts: {
  ownerId: string;
  contactId: string;
}): Promise<Array<{ serviceSlug: string; triggeredAtIso: string; triggerCount: number }>> {
  const ownerId = String(opts.ownerId || "").trim();
  const contactId = String(opts.contactId || "").trim();
  if (!ownerId || !contactId) return [];

  await ensurePortalContactServiceTriggersReady();

  try {
    const rows = await prisma.portalContactServiceTrigger.findMany({
      where: { ownerId, contactId },
      select: { serviceSlug: true, updatedAt: true, triggerCount: true },
      take: 200,
      orderBy: [{ updatedAt: "desc" }],
    });

    return (rows || []).map((r) => ({
      serviceSlug: String(r.serviceSlug || "").trim(),
      triggeredAtIso: new Date(r.updatedAt).toISOString(),
      triggerCount: typeof r.triggerCount === "number" ? r.triggerCount : 0,
    }));
  } catch {
    return [];
  }
}
