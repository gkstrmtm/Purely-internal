import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NewsletterKind = "EXTERNAL" | "INTERNAL";

type StoredKindSettings = {
  enabled?: boolean;
  frequencyDays?: number;
  cursor?: number;
  requireApproval?: boolean;
  channels?: { email?: boolean; sms?: boolean };
  topics?: string[];
  promptAnswers?: Record<string, string>;
  audience?: {
    tagIds?: string[];
    contactIds?: string[];
    emails?: string[];
    userIds?: string[];
  };
};

type StoredSettings = {
  external?: StoredKindSettings;
  internal?: StoredKindSettings;
};

function clampKind(raw: string | null): NewsletterKind {
  return (raw || "").toLowerCase().trim() === "internal" ? "INTERNAL" : "EXTERNAL";
}

function normalizeStrings(items: unknown, max: number) {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function parseKindSettings(value: unknown): Required<
  Pick<StoredKindSettings, "enabled" | "frequencyDays" | "cursor" | "requireApproval" | "channels" | "topics" | "promptAnswers" | "audience">
> {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const enabled = Boolean(rec?.enabled);
  const frequencyDays =
    typeof rec?.frequencyDays === "number" && Number.isFinite(rec.frequencyDays)
      ? Math.min(30, Math.max(1, Math.floor(rec.frequencyDays)))
      : 7;
  const cursor = typeof rec?.cursor === "number" && Number.isFinite(rec.cursor) ? Math.max(0, Math.floor(rec.cursor)) : 0;
  const requireApproval = Boolean(rec?.requireApproval);

  const channelsRec = rec?.channels && typeof rec.channels === "object" ? (rec.channels as Record<string, unknown>) : null;
  const channels = {
    email: channelsRec ? Boolean(channelsRec.email ?? true) : true,
    sms: channelsRec ? Boolean(channelsRec.sms ?? true) : true,
  };

  const topics = normalizeStrings(rec?.topics, 50);

  const promptAnswersRaw = rec?.promptAnswers && typeof rec.promptAnswers === "object" ? (rec.promptAnswers as Record<string, unknown>) : null;
  const promptAnswers: Record<string, string> = {};
  if (promptAnswersRaw) {
    for (const [k, v] of Object.entries(promptAnswersRaw)) {
      if (typeof v !== "string") continue;
      const vv = v.trim();
      if (!vv) continue;
      promptAnswers[String(k).slice(0, 60)] = vv.slice(0, 2000);
    }
  }

  const audienceRaw = rec?.audience && typeof rec.audience === "object" ? (rec.audience as Record<string, unknown>) : null;
  const audience = {
    tagIds: normalizeStrings(audienceRaw?.tagIds, 200),
    contactIds: normalizeStrings(audienceRaw?.contactIds, 200),
    emails: normalizeStrings(audienceRaw?.emails, 200),
    userIds: normalizeStrings(audienceRaw?.userIds, 200),
  };

  return { enabled, frequencyDays, cursor, requireApproval, channels, topics, promptAnswers, audience };
}

function parseStored(value: unknown): { external: ReturnType<typeof parseKindSettings>; internal: ReturnType<typeof parseKindSettings> } {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  return {
    external: parseKindSettings(rec?.external),
    internal: parseKindSettings(rec?.internal),
  };
}

const putSchema = z.object({
  kind: z.enum(["external", "internal"]),
  enabled: z.boolean(),
  frequencyDays: z.number().int().min(1).max(30),
  requireApproval: z.boolean().optional(),
  channels: z.object({ email: z.boolean().optional(), sms: z.boolean().optional() }).optional(),
  topics: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  promptAnswers: z.record(z.string().trim().min(1).max(80), z.string().trim().min(1).max(2000)).optional(),
  audience: z
    .object({
      tagIds: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
      contactIds: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
      emails: z.array(z.string().trim().min(1).max(254)).max(200).optional(),
      userIds: z.array(z.string().trim().min(1).max(80)).max(200).optional(),
    })
    .optional(),
});

function msDays(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("newsletter");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const kind = clampKind(url.searchParams.get("kind"));

  const setup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } },
    select: { id: true, dataJson: true, updatedAt: true },
  });

  const parsed = parseStored(setup?.dataJson);
  const kindSettings = kind === "INTERNAL" ? parsed.internal : parsed.external;

  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
  let lastGeneratedAt: Date | null = null;
  if (site?.id) {
    const last = await prisma.clientNewsletter.findFirst({
      where: { siteId: site.id, kind },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    lastGeneratedAt = last?.createdAt ?? null;
  }

  const nextDueAt = lastGeneratedAt
    ? new Date(lastGeneratedAt.getTime() + msDays(kindSettings.frequencyDays))
    : new Date();

  return NextResponse.json({
    ok: true,
    kind,
    settings: {
      ...kindSettings,
      lastGeneratedAt: lastGeneratedAt ? lastGeneratedAt.toISOString() : null,
      nextDueAt: nextDueAt.toISOString(),
    },
  });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("newsletter", "edit");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsedBody = putSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const kind = clampKind(parsedBody.data.kind);

  const existing = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } },
    select: { dataJson: true },
  });

  const prev = parseStored(existing?.dataJson);
  const prevKind = kind === "INTERNAL" ? prev.internal : prev.external;

  const nextKind: StoredKindSettings = {
    enabled: parsedBody.data.enabled,
    frequencyDays: parsedBody.data.frequencyDays,
    cursor: prevKind.cursor,
    requireApproval: Boolean(parsedBody.data.requireApproval),
    channels: {
      email: parsedBody.data.channels ? Boolean(parsedBody.data.channels.email ?? true) : prevKind.channels.email,
      sms: parsedBody.data.channels ? Boolean(parsedBody.data.channels.sms ?? true) : prevKind.channels.sms,
    },
    topics: normalizeStrings(parsedBody.data.topics ?? prevKind.topics, 50),
    promptAnswers: parsedBody.data.promptAnswers ? parsedBody.data.promptAnswers : prevKind.promptAnswers,
    audience: {
      tagIds: normalizeStrings(parsedBody.data.audience?.tagIds ?? prevKind.audience.tagIds, 200),
      contactIds: normalizeStrings(parsedBody.data.audience?.contactIds ?? prevKind.audience.contactIds, 200),
      emails: normalizeStrings(parsedBody.data.audience?.emails ?? prevKind.audience.emails, 200),
      userIds: normalizeStrings(parsedBody.data.audience?.userIds ?? prevKind.audience.userIds, 200),
    },
  };

  const next: StoredSettings = {
    external: kind === "EXTERNAL" ? nextKind : prev.external,
    internal: kind === "INTERNAL" ? nextKind : prev.internal,
  };

  const row = await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } },
    create: { ownerId, serviceSlug: "newsletter", status: "IN_PROGRESS", dataJson: next },
    update: { dataJson: next },
    select: { id: true, dataJson: true, updatedAt: true },
  });

  const normalized = parseStored(row.dataJson);
  const normalizedKind = kind === "INTERNAL" ? normalized.internal : normalized.external;

  return NextResponse.json({ ok: true, kind, settings: normalizedKind, updatedAt: row.updatedAt.toISOString() });
}
