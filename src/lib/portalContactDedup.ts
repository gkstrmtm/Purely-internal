import { prisma } from "@/lib/db";
import { normalizeEmailKey } from "@/lib/portalContacts";

function isMissingRelationError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /does not exist|relation .* does not exist|no such table/i.test(msg);
}

export type DuplicateContactGroup = {
  phoneKey: string;
  phone: string | null;
  count: number;
  contacts: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    createdAtIso: string;
    updatedAtIso: string;
  }>;
  distinctEmails: string[];
  needsEmailChoice: boolean;
};

export async function listDuplicatePortalContactsByPhoneKey(opts: {
  ownerId: string;
  limitGroups?: number;
}): Promise<{ ok: true; groups: DuplicateContactGroup[] } | { ok: false; error: string }> {
  const ownerId = String(opts.ownerId || "").trim();
  if (!ownerId) return { ok: false, error: "Missing ownerId" };

  const limitGroups = Math.max(1, Math.min(200, Number(opts.limitGroups ?? 100) || 100));

  try {
    const rows = await prisma.$queryRaw<Array<{ phoneKey: string; cnt: bigint }>>`
      SELECT "phoneKey", COUNT(*)::bigint AS cnt
      FROM "PortalContact"
      WHERE "ownerId" = ${ownerId} AND "phoneKey" IS NOT NULL
      GROUP BY "phoneKey"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT ${limitGroups};
    `;

    const phoneKeys = (rows || [])
      .map((r) => (r?.phoneKey ? String(r.phoneKey) : ""))
      .filter(Boolean);

    if (!phoneKeys.length) return { ok: true, groups: [] };

    const contacts = await (prisma as any).portalContact.findMany({
      where: { ownerId, phoneKey: { in: phoneKeys } },
      orderBy: [{ phoneKey: "asc" }, { updatedAt: "desc" }],
      take: 5000,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        phoneKey: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const byKey = new Map<string, DuplicateContactGroup>();
    for (const c of contacts || []) {
      const key = c?.phoneKey ? String(c.phoneKey) : "";
      if (!key) continue;
      const g =
        byKey.get(key) ||
        ({
          phoneKey: key,
          phone: c?.phone ? String(c.phone) : null,
          count: 0,
          contacts: [],
          distinctEmails: [],
          needsEmailChoice: false,
        } satisfies DuplicateContactGroup);

      g.contacts.push({
        id: String(c.id),
        name: String(c.name || "").slice(0, 80) || "Contact",
        email: c.email ? String(c.email).slice(0, 120) : null,
        phone: c.phone ? String(c.phone).slice(0, 40) : null,
        createdAtIso: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
        updatedAtIso: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
      });
      g.count = g.contacts.length;
      if (!byKey.has(key)) byKey.set(key, g);
    }

    for (const g of byKey.values()) {
      const emailKeys = new Set<string>();
      for (const c of g.contacts) {
        const k = c.email ? normalizeEmailKey(c.email) : null;
        if (k) emailKeys.add(k);
      }
      g.distinctEmails = Array.from(emailKeys);
      g.needsEmailChoice = g.distinctEmails.length > 1;
    }

    const groups = Array.from(byKey.values())
      .filter((g) => g.contacts.length > 1)
      .sort((a, b) => b.contacts.length - a.contacts.length)
      .slice(0, limitGroups);

    return { ok: true, groups };
  } catch (e) {
    if (isMissingRelationError(e)) return { ok: true, groups: [] };
    return { ok: false, error: e instanceof Error ? e.message : String(e ?? "Unknown error") };
  }
}

export async function mergePortalContacts(opts: {
  ownerId: string;
  primaryContactId: string;
  mergeContactIds: string[];
  primaryEmail?: string | null;
}): Promise<
  | {
      ok: true;
      primaryContactId: string;
      mergedContactIds: string[];
      deletedContactIds: string[];
    }
  | { ok: false; error: string; code?: string; details?: any }
> {
  const ownerId = String(opts.ownerId || "").trim();
  const primaryContactId = String(opts.primaryContactId || "").trim();
  const mergeContactIds = Array.from(new Set((opts.mergeContactIds || []).map((x) => String(x || "").trim()).filter(Boolean)));

  if (!ownerId) return { ok: false, error: "Missing ownerId" };
  if (!primaryContactId) return { ok: false, error: "Missing primaryContactId" };

  const allIds = Array.from(new Set([primaryContactId, ...mergeContactIds]));
  if (allIds.length < 2) return { ok: false, error: "Nothing to merge" };

  const primaryEmailRaw = opts.primaryEmail == null ? null : String(opts.primaryEmail || "").trim();
  const primaryEmailKey = primaryEmailRaw ? normalizeEmailKey(primaryEmailRaw) : null;

  try {
    const contacts = await (prisma as any).portalContact.findMany({
      where: { ownerId, id: { in: allIds } },
      select: { id: true, name: true, email: true, emailKey: true, phone: true, phoneKey: true, updatedAt: true },
      take: 200,
    });

    const byId = new Map<string, any>();
    for (const c of contacts || []) byId.set(String(c.id), c);

    const primary = byId.get(primaryContactId);
    if (!primary) return { ok: false, error: "Primary contact not found" };

    const phoneKey = primary?.phoneKey ? String(primary.phoneKey) : "";
    if (!phoneKey) return { ok: false, error: "Primary contact has no phone number" };

    for (const id of allIds) {
      const c = byId.get(id);
      if (!c) return { ok: false, error: "One or more contacts not found" };
      if (String(c.phoneKey || "") !== phoneKey) {
        return { ok: false, error: "All contacts must share the same phone number", code: "PHONE_MISMATCH" };
      }
    }

    const distinctEmailKeys = Array.from(
      new Set(
        allIds
          .map((id) => {
            const k = byId.get(id)?.emailKey;
            return typeof k === "string" && k.trim() ? k.trim() : "";
          })
          .filter(Boolean),
      ),
    );

    const hasEmailConflict = distinctEmailKeys.length > 1;
    if (hasEmailConflict && !primaryEmailKey) {
      return {
        ok: false,
        error: "Multiple different emails exist for this phone number",
        code: "EMAIL_CONFLICT",
        details: {
          emails: allIds
            .map((id) => byId.get(id)?.email)
            .filter((x: any) => typeof x === "string" && x.includes("@"))
            .map((x: any) => String(x))
            .slice(0, 20),
        },
      };
    }

    if (primaryEmailKey && distinctEmailKeys.length && !distinctEmailKeys.includes(primaryEmailKey)) {
      return { ok: false, error: "primaryEmail must be one of the existing emails", code: "INVALID_PRIMARY_EMAIL" };
    }

    const secondaryIds = allIds.filter((id) => id !== primaryContactId);

    await prisma.$transaction(async (tx) => {
      if (primaryEmailKey) {
        await (tx as any).portalContact.update({
          where: { id: primaryContactId },
          data: { email: primaryEmailRaw, emailKey: primaryEmailKey },
          select: { id: true },
        });
      }

      // Rewire simple FK references.
      const updateManyTables: Array<() => Promise<any>> = [
        () => (tx as any).portalInboxThread.updateMany({ where: { ownerId, contactId: { in: secondaryIds } }, data: { contactId: primaryContactId } }),
        () => (tx as any).portalLead.updateMany({ where: { ownerId, contactId: { in: secondaryIds } }, data: { contactId: primaryContactId } }),
        () => (tx as any).portalBooking.updateMany({ where: { ownerId, contactId: { in: secondaryIds } }, data: { contactId: primaryContactId } }),
        () => (tx as any).portalReview.updateMany({ where: { ownerId, contactId: { in: secondaryIds } }, data: { contactId: primaryContactId } }),
        () => (tx as any).creditPull.updateMany({ where: { ownerId, contactId: { in: secondaryIds } }, data: { contactId: primaryContactId } }),
        () => (tx as any).creditDisputeLetter.updateMany({ where: { ownerId, contactId: { in: secondaryIds } }, data: { contactId: primaryContactId } }),
        () => (tx as any).creditReport.updateMany({ where: { ownerId, contactId: { in: secondaryIds } }, data: { contactId: primaryContactId } }),
      ];

      await Promise.all(updateManyTables.map((fn) => fn().catch(() => null)));

      // Nurture enrollments: unique(campaignId, contactId)
      {
        const existing = await (tx as any).portalNurtureEnrollment.findMany({
          where: { ownerId, contactId: primaryContactId },
          select: { campaignId: true },
          take: 5000,
        });
        const existingSet = new Set((existing || []).map((r: any) => String(r.campaignId)));

        const secondary = await (tx as any).portalNurtureEnrollment.findMany({
          where: { ownerId, contactId: { in: secondaryIds } },
          select: { id: true, campaignId: true },
          take: 5000,
        });

        for (const r of secondary || []) {
          const campaignId = String(r.campaignId);
          if (existingSet.has(campaignId)) {
            await (tx as any).portalNurtureEnrollment.delete({ where: { id: r.id } }).catch(() => null);
          } else {
            await (tx as any).portalNurtureEnrollment.update({ where: { id: r.id }, data: { contactId: primaryContactId } }).catch(() => null);
            existingSet.add(campaignId);
          }
        }
      }

      // Outbound call enrollments: unique(campaignId, contactId)
      {
        const existing = await (tx as any).portalAiOutboundCallEnrollment.findMany({
          where: { ownerId, contactId: primaryContactId },
          select: { campaignId: true },
          take: 5000,
        });
        const existingSet = new Set((existing || []).map((r: any) => String(r.campaignId)));

        const secondary = await (tx as any).portalAiOutboundCallEnrollment.findMany({
          where: { ownerId, contactId: { in: secondaryIds } },
          select: { id: true, campaignId: true },
          take: 5000,
        });

        for (const r of secondary || []) {
          const campaignId = String(r.campaignId);
          if (existingSet.has(campaignId)) {
            await (tx as any).portalAiOutboundCallEnrollment.delete({ where: { id: r.id } }).catch(() => null);
          } else {
            await (tx as any).portalAiOutboundCallEnrollment.update({ where: { id: r.id }, data: { contactId: primaryContactId } }).catch(() => null);
            existingSet.add(campaignId);
          }
        }
      }

      // Outbound message enrollments: unique(campaignId, contactId)
      {
        const existing = await (tx as any).portalAiOutboundMessageEnrollment.findMany({
          where: { ownerId, contactId: primaryContactId },
          select: { campaignId: true },
          take: 5000,
        });
        const existingSet = new Set((existing || []).map((r: any) => String(r.campaignId)));

        const secondary = await (tx as any).portalAiOutboundMessageEnrollment.findMany({
          where: { ownerId, contactId: { in: secondaryIds } },
          select: { id: true, campaignId: true },
          take: 5000,
        });

        for (const r of secondary || []) {
          const campaignId = String(r.campaignId);
          if (existingSet.has(campaignId)) {
            await (tx as any).portalAiOutboundMessageEnrollment.delete({ where: { id: r.id } }).catch(() => null);
          } else {
            await (tx as any).portalAiOutboundMessageEnrollment.update({ where: { id: r.id }, data: { contactId: primaryContactId } }).catch(() => null);
            existingSet.add(campaignId);
          }
        }
      }

      // Tags: move then delete.
      {
        const rows = await (tx as any).portalContactTagAssignment.findMany({
          where: { ownerId, contactId: { in: secondaryIds } },
          select: { tagId: true },
          take: 5000,
        });
        const tagIds = Array.from(new Set((rows || []).map((r: any) => String(r.tagId)).filter(Boolean)));
        if (tagIds.length) {
          await (tx as any).portalContactTagAssignment.createMany({
            data: tagIds.map((tagId) => ({ ownerId, contactId: primaryContactId, tagId })),
            skipDuplicates: true,
          });
        }
        await (tx as any).portalContactTagAssignment.deleteMany({ where: { ownerId, contactId: { in: secondaryIds } } });
      }

      // Service triggers: merge counts by serviceSlug.
      {
        const rows = await (tx as any).portalContactServiceTrigger.findMany({
          where: { ownerId, contactId: { in: secondaryIds } },
          select: { id: true, serviceSlug: true, triggerCount: true, contactId: true },
          take: 5000,
        });

        for (const r of rows || []) {
          const serviceSlug = String(r.serviceSlug || "").trim();
          if (!serviceSlug) continue;
          const count = Number(r.triggerCount || 0) || 0;
          await (tx as any).portalContactServiceTrigger
            .upsert({
              where: { ownerId_contactId_serviceSlug: { ownerId, contactId: primaryContactId, serviceSlug } },
              update: { triggerCount: { increment: Math.max(1, count) } },
              create: { ownerId, contactId: primaryContactId, serviceSlug, triggerCount: Math.max(1, count) },
              select: { id: true },
            })
            .catch(() => null);
        }

        await (tx as any).portalContactServiceTrigger.deleteMany({ where: { ownerId, contactId: { in: secondaryIds } } });
      }

      // Finally delete the duplicate contacts.
      await (tx as any).portalContact.deleteMany({ where: { ownerId, id: { in: secondaryIds } } });
    });

    return {
      ok: true,
      primaryContactId,
      mergedContactIds: allIds,
      deletedContactIds: allIds.filter((id) => id !== primaryContactId),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e ?? "Unknown error") };
  }
}
