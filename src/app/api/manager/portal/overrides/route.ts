import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MODULE_KEYS, type ModuleKey } from "@/lib/entitlements.shared";
import { normalizePhoneStrict } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireManager(session: any) {
  const userId = session?.user?.id;
  const role = session?.user?.role;
  if (!userId) return { ok: false as const, status: 401 as const };
  if (role !== "MANAGER" && role !== "ADMIN") return { ok: false as const, status: 403 as const };
  return { ok: true as const, userId };
}

const moduleSchema = z.enum(MODULE_KEYS);

const OVERRIDES_SETUP_SLUG = "__portal_entitlement_overrides";
const CREDITS_SETUP_SLUG = "credits";
const PROFILE_SETUP_SLUG = "profile";
const INTEGRATIONS_SETUP_SLUG = "integrations";
const AI_RECEPTIONIST_SETUP_SLUG = "ai-receptionist";

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

const upsertSchema = z.object({
  ownerId: z.string().trim().min(1).max(64),
  module: moduleSchema,
});

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const auth = requireManager(session);
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const takeRaw = url.searchParams.get("take");
  const takeParsed = takeRaw ? Number(takeRaw) : undefined;
  const take = Math.max(1, Math.min(200, Number.isFinite(takeParsed as number) ? (takeParsed as number) : 100));

  const users = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { businessProfile: { businessName: { contains: q, mode: "insensitive" } } },
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
      businessProfile: { select: { businessName: true } },
      portalMailboxAddress: { select: { emailAddress: true } },
    },
  });

  const ownerIds = users.map((u) => u.id);
  const rows = ownerIds.length
    ? await prisma.portalServiceSetup.findMany({
        where: { ownerId: { in: ownerIds }, serviceSlug: OVERRIDES_SETUP_SLUG },
        select: { ownerId: true, dataJson: true },
      })
    : [];

  const creditRows = ownerIds.length
    ? await prisma.portalServiceSetup.findMany({
        where: { ownerId: { in: ownerIds }, serviceSlug: CREDITS_SETUP_SLUG },
        select: { ownerId: true, dataJson: true },
      })
    : [];

  const profileRows = ownerIds.length
    ? await prisma.portalServiceSetup.findMany({
        where: { ownerId: { in: ownerIds }, serviceSlug: PROFILE_SETUP_SLUG },
        select: { ownerId: true, dataJson: true },
      })
    : [];

  const integrationsRows = ownerIds.length
    ? await prisma.portalServiceSetup.findMany({
        where: { ownerId: { in: ownerIds }, serviceSlug: INTEGRATIONS_SETUP_SLUG },
        select: { ownerId: true, dataJson: true },
      })
    : [];

  const byOwner = new Map<string, Set<ModuleKey>>();
  for (const row of rows) {
    byOwner.set(row.ownerId, parseOverrides(row.dataJson));
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
    ? await prisma.portalServiceSetup.findMany({
        where: { ownerId: { in: ownerIds }, serviceSlug: AI_RECEPTIONIST_SETUP_SLUG },
        select: { ownerId: true, dataJson: true },
      })
    : [];

  const receptionistVoiceAgentByOwner = new Map<string, string | null>();
  for (const row of receptionistRows) {
    receptionistVoiceAgentByOwner.set(row.ownerId, parseAiReceptionistVoiceAgentId(row.dataJson));
  }

  const twilioFromByOwner = new Map<string, string | null>();
  for (const row of integrationsRows) {
    twilioFromByOwner.set(row.ownerId, parseTwilioFromNumberE164(row.dataJson));
  }

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      active: u.active,
      createdAt: u.createdAt,
      overrides: Array.from(byOwner.get(u.id) ?? []),
      creditsBalance: creditsByOwner.get(u.id) ?? 0,
      phone: phoneByOwner.get(u.id) ?? null,
      businessName: u.businessProfile?.businessName ?? null,
      businessEmail: u.portalMailboxAddress?.emailAddress ?? null,
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
  const auth = requireManager(session);
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

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
  const auth = requireManager(session);
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

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
