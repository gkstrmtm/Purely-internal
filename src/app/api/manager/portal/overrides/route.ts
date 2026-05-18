import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPublicColumn, hasPublicTable } from "@/lib/dbSchema";
import { MODULE_KEYS, MODULE_LABELS, type ModuleKey } from "@/lib/entitlements.shared";
import { hasPlatformAdminCapability } from "@/lib/internalCapabilities";
import { isPlatformAdminGranted, platformAdminAuthError } from "@/lib/platformAdminGrants";
import { normalizePhoneStrict } from "@/lib/phone";
import { PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG } from "@/lib/portalBillingModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requirePlatformAdmin(session: any) {
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return { ok: false as const, status: 401 as const };
  if (!hasPlatformAdminCapability(role, await isPlatformAdminGranted(userId).catch(() => false))) {
    return { ok: false as const, status: 403 as const };
  }
  return { ok: true as const, userId };
}

const moduleSchema = z.enum(MODULE_KEYS);

const OVERRIDES_SETUP_SLUG = "__portal_entitlement_overrides";
const BILLING_MODEL_SETUP_SLUG = PORTAL_BILLING_MODEL_OVERRIDE_SETUP_SLUG;
const CREDITS_SETUP_SLUG = "credits";
const PROFILE_SETUP_SLUG = "profile";
const INTEGRATIONS_SETUP_SLUG = "integrations";
const AI_RECEPTIONIST_SETUP_SLUG = "ai-receptionist";
const DELETED_ACCOUNT_SETUP_SLUG = "__portal_deleted_account";

function parseDeletedAccountTombstone(dataJson: unknown): { originalEmail: string | null; originalName: string | null; deletedAtIso: string | null } {
  if (!dataJson || typeof dataJson !== "object" || Array.isArray(dataJson)) return { originalEmail: null, originalName: null, deletedAtIso: null };
  const rec = dataJson as Record<string, unknown>;
  const originalEmail = typeof rec.originalEmail === "string" ? rec.originalEmail.trim().slice(0, 320) : "";
  const originalName = typeof rec.originalName === "string" ? rec.originalName.trim().slice(0, 200) : "";
  const deletedAtIso = typeof rec.deletedAtIso === "string" ? rec.deletedAtIso.trim().slice(0, 64) : "";
  return {
    originalEmail: originalEmail || null,
    originalName: originalName || null,
    deletedAtIso: deletedAtIso || null,
  };
}

function parseCreditsOnlyOverride(dataJson: unknown): boolean {
  if (!dataJson || typeof dataJson !== "object" || Array.isArray(dataJson)) return false;
  const rec = dataJson as Record<string, unknown>;
  const rawModel = typeof rec.billingModel === "string" ? rec.billingModel.trim().toLowerCase() : "";
  if (rawModel === "credits" || rawModel === "credit" || rawModel === "credits_only" || rawModel === "credits-only") return true;
  if (typeof rec.creditsOnly === "boolean") return rec.creditsOnly;
  return false;
}

function parseOverrides(dataJson: unknown): Set<ModuleKey> {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const overridesRaw = rec?.overrides && typeof rec.overrides === "object" && !Array.isArray(rec.overrides)
    ? (rec.overrides as Record<string, unknown>)
    : null;

  const out = new Set<ModuleKey>();
  if (!overridesRaw) return out;
  for (const key of MODULE_KEYS) {
    if (overridesRaw[key] === true) out.add(key);
  }
  return out;
}

function encodeOverrides(enabled: Set<ModuleKey>, updatedByUserId: string) {
  return {
    version: 1,
    overrides: Object.fromEntries(MODULE_KEYS.map((k) => [k, enabled.has(k)])),
    updatedAtIso: new Date().toISOString(),
    updatedByUserId,
  };
}

function parseCreditsBalance(dataJson: unknown): number {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const raw = rec?.balance;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function parseProfilePhoneE164(dataJson: unknown): string | null {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const raw = rec?.phone;
  if (typeof raw !== "string") return null;
  const parsed = normalizePhoneStrict(raw);
  return parsed.ok && parsed.e164 ? parsed.e164 : null;
}

function parseProfileVoiceAgentId(dataJson: unknown): string | null {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const raw = rec?.voiceAgentId;
  const id = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  return id ? id : null;
}

function parseAiReceptionistVoiceAgentId(dataJson: unknown): string | null {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const raw = typeof rec?.voiceAgentId === "string" ? rec.voiceAgentId : (typeof rec?.elevenLabsAgentId === "string" ? rec.elevenLabsAgentId : "");
  const id = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  return id ? id : null;
}

function parseTwilioFromNumberE164(dataJson: unknown): string | null {
  const rec = dataJson && typeof dataJson === "object" && !Array.isArray(dataJson)
    ? (dataJson as Record<string, unknown>)
    : null;
  const twilio = rec?.twilio && typeof rec.twilio === "object" && !Array.isArray(rec.twilio)
    ? (rec.twilio as Record<string, unknown>)
    : null;
  if (!twilio) return null;

  const accountSid = typeof twilio.accountSid === "string" ? twilio.accountSid.trim() : "";
  const authToken = typeof twilio.authToken === "string" ? twilio.authToken.trim() : "";
  const fromRaw = typeof twilio.fromNumberE164 === "string" ? twilio.fromNumberE164.trim() : "";
  const parsedFrom = normalizePhoneStrict(fromRaw);
  const fromNumberE164 = parsedFrom.ok && parsedFrom.e164 ? parsedFrom.e164 : "";

  if (!accountSid || !authToken || !fromNumberE164) return null;
  return fromNumberE164;
}

function normalizeSearchToken(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function normalizeSearchDigits(value: string) {
  return value.replace(/\D/g, "");
}

function searchLooksEnabled(value: string) {
  return ["enabled", "enable", "on", "yes", "true", "active"].includes(value);
}

function searchLooksDisabled(value: string) {
  return ["disabled", "disable", "off", "no", "false", "inactive"].includes(value);
}

const upsertSchema = z.object({
  ownerId: z.string().trim().min(1).max(64),
  module: moduleSchema,
});

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const auth = await requirePlatformAdmin(session);
  if (!auth.ok) return NextResponse.json({ error: platformAdminAuthError(auth.status) }, { status: auth.status });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const qLower = q.toLowerCase();
  const qToken = normalizeSearchToken(q);
  const qDigits = normalizeSearchDigits(q);
  const takeRaw = url.searchParams.get("take");
  const takeParsed = takeRaw ? Number(takeRaw) : undefined;
  const take = Math.max(1, Math.min(500, Number.isFinite(takeParsed as number) ? (takeParsed as number) : 100));

  const safeFindMany = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  const safeHasTable = async (tableName: string) => {
    try {
      return await hasPublicTable(tableName);
    } catch {
      return false;
    }
  };

  // Schema drift tolerance: older/stale DBs might not have BusinessProfile/PortalMailboxAddress,
  // and relation filters/selects can throw and break the whole page.
  const canUseBusinessProfile = q ? await safeHasTable("BusinessProfile") : false;
  const matchedOwnerIdsFromBusinessName = q && canUseBusinessProfile
    ? await safeFindMany(
        async () =>
          prisma.businessProfile.findMany({
            where: { businessName: { contains: q, mode: "insensitive" } },
            select: { ownerId: true },
            take: 500,
          }),
        [],
      )
    : [];
  const matchedOwnerIds = new Set<string>(matchedOwnerIdsFromBusinessName.map((r) => r.ownerId));

  const canUseMailbox = q ? await safeHasTable("PortalMailboxAddress") : false;
  if (q && canUseMailbox) {
    const mailboxRows = await safeFindMany(
      async () =>
        prisma.portalMailboxAddress.findMany({
          where: { emailAddress: { contains: q, mode: "insensitive" } },
          select: { ownerId: true },
          take: 500,
        }),
      [],
    );
    for (const row of mailboxRows) matchedOwnerIds.add(row.ownerId);
  }

  if (q) {
    const profileRows = await safeFindMany(
      async () =>
        prisma.portalServiceSetup.findMany({
          where: { serviceSlug: PROFILE_SETUP_SLUG },
          select: { ownerId: true, dataJson: true },
          take: 5000,
        }),
      [],
    );

    for (const row of profileRows) {
      const phone = parseProfilePhoneE164(row.dataJson) ?? "";
      if (!phone) continue;
      if ((qDigits && normalizeSearchDigits(phone).includes(qDigits)) || phone.toLowerCase().includes(qLower)) {
        matchedOwnerIds.add(row.ownerId);
      }
    }

    const integrationRows = await safeFindMany(
      async () =>
        prisma.portalServiceSetup.findMany({
          where: { serviceSlug: INTEGRATIONS_SETUP_SLUG },
          select: { ownerId: true, dataJson: true },
          take: 5000,
        }),
      [],
    );

    for (const row of integrationRows) {
      const twilioNumber = parseTwilioFromNumberE164(row.dataJson) ?? "";
      const twilioConfigured = Boolean(twilioNumber);
      if ((qDigits && normalizeSearchDigits(twilioNumber).includes(qDigits)) || twilioNumber.toLowerCase().includes(qLower)) {
        matchedOwnerIds.add(row.ownerId);
        continue;
      }
      if ((qToken === "twilio" || qToken === "twilio-on") && twilioConfigured) matchedOwnerIds.add(row.ownerId);
      if ((qToken === "twilio-off" || qToken === "no-twilio") && !twilioConfigured) matchedOwnerIds.add(row.ownerId);
    }

    const billingRows = await safeFindMany(
      async () =>
        prisma.portalServiceSetup.findMany({
          where: { serviceSlug: BILLING_MODEL_SETUP_SLUG },
          select: { ownerId: true, dataJson: true },
          take: 5000,
        }),
      [],
    );

    for (const row of billingRows) {
      const creditsOnly = parseCreditsOnlyOverride(row.dataJson);
      if ((qToken === "credits-only" || qToken === "credit-only" || qToken === "credits" || qToken === "credit") && creditsOnly) {
        matchedOwnerIds.add(row.ownerId);
      }
      if ((qToken === "subscription" || qToken === "stripe" || qToken === "billing") && !creditsOnly) {
        matchedOwnerIds.add(row.ownerId);
      }
    }

    const overrideRows = await safeFindMany(
      async () =>
        prisma.portalServiceSetup.findMany({
          where: { serviceSlug: OVERRIDES_SETUP_SLUG },
          select: { ownerId: true, dataJson: true },
          take: 5000,
        }),
      [],
    );

    for (const row of overrideRows) {
      const overrides = parseOverrides(row.dataJson);
      if (!overrides.size) continue;
      if (qToken === "override" || qToken === "overrides" || qToken === "enabled-overrides") {
        matchedOwnerIds.add(row.ownerId);
        continue;
      }
      if (MODULE_KEYS.some((key) => key === qToken || MODULE_LABELS[key].toLowerCase().includes(qLower)) && Array.from(overrides).some((key) => key === qToken || MODULE_LABELS[key].toLowerCase().includes(qLower))) {
        matchedOwnerIds.add(row.ownerId);
      }
    }
  }

  // If searching, also try to match deleted accounts by their original email/name stored in a tombstone setup.
  if (q) {
    try {
      const rows = await prisma.portalServiceSetup.findMany({
        where: { serviceSlug: DELETED_ACCOUNT_SETUP_SLUG, status: "COMPLETE" },
        select: { ownerId: true, dataJson: true },
        take: 5000,
      });
      for (const r of rows) {
        const t = parseDeletedAccountTombstone(r.dataJson);
        const email = (t.originalEmail ?? "").toLowerCase();
        const name = (t.originalName ?? "").toLowerCase();
        if ((email && email.includes(qLower)) || (name && name.includes(qLower))) matchedOwnerIds.add(r.ownerId);
      }
    } catch {
      // ignore
    }
  }

  const users = await safeFindMany(
    async () =>
      prisma.user.findMany({
        where: {
          role: "CLIENT",
          ...(q
            ? {
                OR: [
                  { email: { contains: q, mode: "insensitive" as const } },
                  { name: { contains: q, mode: "insensitive" as const } },
                  ...(qToken === "active" || searchLooksEnabled(qToken) ? [{ active: true }] : []),
                  ...(qToken === "inactive" || searchLooksDisabled(qToken) ? [{ active: false }] : []),
                  ...(qToken === "test" || qToken === "demo"
                    ? [
                        { email: { contains: "test", mode: "insensitive" as const } },
                        { email: { contains: "demo", mode: "insensitive" as const } },
                        { name: { contains: "test", mode: "insensitive" as const } },
                        { name: { contains: "demo", mode: "insensitive" as const } },
                      ]
                    : []),
                  ...(matchedOwnerIds.size ? [{ id: { in: Array.from(matchedOwnerIds) } }] : []),
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          email: true,
          name: true,
          active: true,
          createdAt: true,
        },
      }),
    [],
  );

  const ownerIds = users.map((u) => u.id);
  const rows = ownerIds.length
    ? await safeFindMany(
        async () =>
          prisma.portalServiceSetup.findMany({
            where: { ownerId: { in: ownerIds }, serviceSlug: OVERRIDES_SETUP_SLUG },
            select: { ownerId: true, dataJson: true },
          }),
        [],
      )
    : [];

  const billingModelRows = ownerIds.length
    ? await safeFindMany(
        async () =>
          prisma.portalServiceSetup.findMany({
            where: { ownerId: { in: ownerIds }, serviceSlug: BILLING_MODEL_SETUP_SLUG },
            select: { ownerId: true, dataJson: true },
          }),
        [],
      )
    : [];

  const creditRows = ownerIds.length
    ? await safeFindMany(
        async () =>
          prisma.portalServiceSetup.findMany({
            where: { ownerId: { in: ownerIds }, serviceSlug: CREDITS_SETUP_SLUG },
            select: { ownerId: true, dataJson: true },
          }),
        [],
      )
    : [];

  const profileRows = ownerIds.length
    ? await safeFindMany(
        async () =>
          prisma.portalServiceSetup.findMany({
            where: { ownerId: { in: ownerIds }, serviceSlug: PROFILE_SETUP_SLUG },
            select: { ownerId: true, dataJson: true },
          }),
        [],
      )
    : [];

  const integrationsRows = ownerIds.length
    ? await safeFindMany(
        async () =>
          prisma.portalServiceSetup.findMany({
            where: { ownerId: { in: ownerIds }, serviceSlug: INTEGRATIONS_SETUP_SLUG },
            select: { ownerId: true, dataJson: true },
          }),
        [],
      )
    : [];

  const byOwner = new Map<string, Set<ModuleKey>>();
  for (const row of rows) {
    byOwner.set(row.ownerId, parseOverrides(row.dataJson));
  }

  const creditsOnlyByOwner = new Map<string, boolean>();
  for (const row of billingModelRows) {
    creditsOnlyByOwner.set(row.ownerId, parseCreditsOnlyOverride(row.dataJson));
  }

  const creditsByOwner = new Map<string, number>();
  for (const row of creditRows) {
    creditsByOwner.set(row.ownerId, parseCreditsBalance(row.dataJson));
  }

  const phoneByOwner = new Map<string, string | null>();
  for (const row of profileRows) {
    phoneByOwner.set(row.ownerId, parseProfilePhoneE164(row.dataJson));
  }

  const profileVoiceAgentByOwner = new Map<string, string | null>();
  for (const row of profileRows) {
    profileVoiceAgentByOwner.set(row.ownerId, parseProfileVoiceAgentId(row.dataJson));
  }

  const receptionistRows = ownerIds.length
    ? await safeFindMany(
        async () =>
          prisma.portalServiceSetup.findMany({
            where: { ownerId: { in: ownerIds }, serviceSlug: AI_RECEPTIONIST_SETUP_SLUG },
            select: { ownerId: true, dataJson: true },
          }),
        [],
      )
    : [];

  const receptionistVoiceAgentByOwner = new Map<string, string | null>();
  for (const row of receptionistRows) {
    receptionistVoiceAgentByOwner.set(row.ownerId, parseAiReceptionistVoiceAgentId(row.dataJson));
  }

  const twilioFromByOwner = new Map<string, string | null>();
  for (const row of integrationsRows) {
    twilioFromByOwner.set(row.ownerId, parseTwilioFromNumberE164(row.dataJson));
  }

  const deletedRows = ownerIds.length
    ? await safeFindMany(
        async () =>
          prisma.portalServiceSetup.findMany({
            where: { ownerId: { in: ownerIds }, serviceSlug: DELETED_ACCOUNT_SETUP_SLUG, status: "COMPLETE" },
            select: { ownerId: true, dataJson: true },
          }),
        [],
      )
    : [];
  const deletedByOwner = new Map<string, { originalEmail: string | null; originalName: string | null; deletedAtIso: string | null }>();
  for (const row of deletedRows) deletedByOwner.set(row.ownerId, parseDeletedAccountTombstone(row.dataJson));

  // Best-effort enrichment (never required for correctness)
  const businessNameByOwner = new Map<string, string | null>();
  const businessEmailByOwner = new Map<string, string | null>();

  if (ownerIds.length) {
    const canReadBusinessProfiles = await safeHasTable("BusinessProfile");
    if (canReadBusinessProfiles) {
      const profiles = await safeFindMany(
        async () =>
          prisma.businessProfile.findMany({
            where: { ownerId: { in: ownerIds } },
            select: { ownerId: true, businessName: true },
          }),
        [],
      );
      for (const p of profiles) businessNameByOwner.set(p.ownerId, p.businessName);
    }

    const canReadMailbox = await safeHasTable("PortalMailboxAddress");
    if (canReadMailbox) {
      const mailboxes = await safeFindMany(
        async () =>
          prisma.portalMailboxAddress.findMany({
            where: { ownerId: { in: ownerIds } },
            select: { ownerId: true, emailAddress: true },
          }),
        [],
      );
      for (const m of mailboxes) businessEmailByOwner.set(m.ownerId, m.emailAddress);
    }
  }

  // Schema drift tolerance: the PortalReferral table/columns may not exist in some envs.
  // The manager UI should still load (invite counters will just show 0).
  type ReferralCountRow = { inviterId: string; count: unknown };
  const toCount = (v: unknown) => {
    if (typeof v === "number") return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    }
    return 0;
  };

  let refTotalAgg: Array<{ inviterId: string; count: number }> = [];
  let refVerifiedAgg: Array<{ inviterId: string; count: number }> = [];
  let refAwardedAgg: Array<{ inviterId: string; count: number }> = [];
  if (ownerIds.length) {
    const canUseReferralsTable = await hasPublicTable("PortalReferral").catch(() => false);
    if (canUseReferralsTable) {
      const hasInvitedVerifiedAt = await hasPublicColumn("PortalReferral", "invitedVerifiedAt").catch(() => false);
      const hasCreditsAwardedAt = await hasPublicColumn("PortalReferral", "creditsAwardedAt").catch(() => false);

      try {
        const rows = await prisma.$queryRaw<ReferralCountRow[]>`
          select "inviterId", count(*) as "count"
          from "PortalReferral"
          where "inviterId" = any(${ownerIds})
          group by "inviterId";
        `;
        refTotalAgg = (rows ?? []).map((r) => ({ inviterId: r.inviterId, count: toCount(r.count) }));
      } catch {
        refTotalAgg = [];
      }

      if (hasInvitedVerifiedAt) {
        try {
          const rows = await prisma.$queryRaw<ReferralCountRow[]>`
            select "inviterId", count(*) as "count"
            from "PortalReferral"
            where "inviterId" = any(${ownerIds})
              and "invitedVerifiedAt" is not null
            group by "inviterId";
          `;
          refVerifiedAgg = (rows ?? []).map((r) => ({ inviterId: r.inviterId, count: toCount(r.count) }));
        } catch {
          refVerifiedAgg = [];
        }
      }

      if (hasCreditsAwardedAt) {
        try {
          const rows = await prisma.$queryRaw<ReferralCountRow[]>`
            select "inviterId", count(*) as "count"
            from "PortalReferral"
            where "inviterId" = any(${ownerIds})
              and "creditsAwardedAt" is not null
            group by "inviterId";
          `;
          refAwardedAgg = (rows ?? []).map((r) => ({ inviterId: r.inviterId, count: toCount(r.count) }));
        } catch {
          refAwardedAgg = [];
        }
      }
    }
  }

  const refTotalByOwner = new Map<string, number>(refTotalAgg.map((r) => [r.inviterId, r.count]));
  const refVerifiedByOwner = new Map<string, number>(refVerifiedAgg.map((r) => [r.inviterId, r.count]));
  const refAwardedByOwner = new Map<string, number>(refAwardedAgg.map((r) => [r.inviterId, r.count]));

  return NextResponse.json({
    users: users.map((u) => ({
      deletedAt: deletedByOwner.get(u.id)?.deletedAtIso ?? null,
      id: u.id,
      email: deletedByOwner.get(u.id)?.originalEmail ?? u.email,
      name: deletedByOwner.get(u.id)?.originalName ?? u.name,
      active: u.active,
      createdAt: u.createdAt,
      invitesSentCount: refTotalByOwner.get(u.id) ?? 0,
      invitesVerifiedCount: refVerifiedByOwner.get(u.id) ?? 0,
      inviteCreditsAwardedCount: refAwardedByOwner.get(u.id) ?? 0,
      overrides: Array.from(byOwner.get(u.id) ?? []),
      creditsOnlyOverride: creditsOnlyByOwner.get(u.id) ?? false,
      creditsBalance: creditsByOwner.get(u.id) ?? 0,
      phone: phoneByOwner.get(u.id) ?? null,
      businessName: businessNameByOwner.get(u.id) ?? null,
      businessEmail: businessEmailByOwner.get(u.id) ?? null,
      twilio: {
        configured: Boolean(twilioFromByOwner.get(u.id)),
        fromNumberE164: twilioFromByOwner.get(u.id) ?? null,
      },
      voiceAgentIds: {
        profile: profileVoiceAgentByOwner.get(u.id) ?? null,
        aiReceptionist: receptionistVoiceAgentByOwner.get(u.id) ?? null,
      },
    })),
    modules: MODULE_KEYS,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const auth = await requirePlatformAdmin(session);
  if (!auth.ok) return NextResponse.json({ error: platformAdminAuthError(auth.status) }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { ownerId, module } = parsed.data;

  const existing = await prisma.portalServiceSetup
    .findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: OVERRIDES_SETUP_SLUG } },
      select: { dataJson: true },
    })
    .catch(() => null);

  const set = parseOverrides(existing?.dataJson);
  set.add(module);

  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: OVERRIDES_SETUP_SLUG } },
    update: {
      status: "COMPLETE",
      dataJson: encodeOverrides(set, auth.userId) as any,
    },
    create: {
      ownerId,
      serviceSlug: OVERRIDES_SETUP_SLUG,
      status: "COMPLETE",
      dataJson: encodeOverrides(set, auth.userId) as any,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const auth = await requirePlatformAdmin(session);
  if (!auth.ok) return NextResponse.json({ error: platformAdminAuthError(auth.status) }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const { ownerId, module } = parsed.data;

  const existing = await prisma.portalServiceSetup
    .findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: OVERRIDES_SETUP_SLUG } },
      select: { id: true, dataJson: true },
    })
    .catch(() => null);

  const set = parseOverrides(existing?.dataJson);
  set.delete(module);

  if (!existing?.id) {
    // nothing to delete
  } else if (set.size === 0) {
    await prisma.portalServiceSetup.delete({ where: { id: existing.id } }).catch(() => null);
  } else {
    await prisma.portalServiceSetup.update({
      where: { id: existing.id },
      data: {
        status: "COMPLETE",
        dataJson: encodeOverrides(set, auth.userId) as any,
      },
      select: { id: true },
    });
  }

  return NextResponse.json({ ok: true });
}
