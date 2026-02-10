import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { consumeCredits } from "@/lib/credits";
import { generateClientNewsletterDraft } from "@/lib/clientNewsletterAutomation";
import { uniqueNewsletterSlug, sendNewsletterToAudience } from "@/lib/portalNewsletter";

export const runtime = "nodejs";
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
  audience?: { tagIds?: string[]; contactIds?: string[]; emails?: string[]; userIds?: string[] };
};

type StoredSettings = {
  external?: StoredKindSettings;
  internal?: StoredKindSettings;
};

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

function parseKindSettings(value: unknown) {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const channelsRec = rec?.channels && typeof rec.channels === "object" ? (rec.channels as Record<string, unknown>) : null;
  return {
    enabled: Boolean(rec?.enabled),
    frequencyDays:
      typeof rec?.frequencyDays === "number" && Number.isFinite(rec.frequencyDays)
        ? Math.min(30, Math.max(1, Math.floor(rec.frequencyDays)))
        : 7,
    cursor: typeof rec?.cursor === "number" && Number.isFinite(rec.cursor) ? Math.max(0, Math.floor(rec.cursor)) : 0,
    requireApproval: Boolean(rec?.requireApproval),
    channels: {
      email: channelsRec ? Boolean(channelsRec.email ?? true) : true,
      sms: channelsRec ? Boolean(channelsRec.sms ?? true) : true,
    },
    topics: normalizeStrings(rec?.topics, 50),
    promptAnswers: rec?.promptAnswers && typeof rec.promptAnswers === "object" ? (rec.promptAnswers as Record<string, string>) : {},
    audience: rec?.audience && typeof rec.audience === "object" ? (rec.audience as any) : {},
  };
}

function parseStored(value: unknown) {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  return {
    external: parseKindSettings(rec?.external),
    internal: parseKindSettings(rec?.internal),
  };
}

function clampKind(raw: string): NewsletterKind {
  return String(raw || "").toLowerCase().trim() === "internal" ? "INTERNAL" : "EXTERNAL";
}

const postSchema = z.object({
  kind: z.enum(["external", "internal"]),
});

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("newsletter", "edit");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsedBody = postSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: parsedBody.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const kind = clampKind(parsedBody.data.kind);

  const [site, setup, profile] = await Promise.all([
    prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true, slug: true, name: true } }),
    prisma.portalServiceSetup.findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: "newsletter" } },
      select: { id: true, dataJson: true },
    }),
    prisma.businessProfile.findUnique({
      where: { ownerId },
      select: {
        businessName: true,
        websiteUrl: true,
        industry: true,
        businessModel: true,
        primaryGoals: true,
        targetCustomer: true,
        brandVoice: true,
      },
    }),
  ]);

  if (!site?.id) {
    return NextResponse.json({ ok: false, error: "Newsletter site not configured yet" }, { status: 409 });
  }

  const stored = parseStored(setup?.dataJson);
  const s = kind === "INTERNAL" ? stored.internal : stored.external;

  const needCredits = 1;
  const consumed = await consumeCredits(ownerId, needCredits);
  if (!consumed.ok) {
    return NextResponse.json({ ok: false, error: "INSUFFICIENT_CREDITS" }, { status: 402 });
  }

  const primaryGoals = Array.isArray(profile?.primaryGoals)
    ? (profile?.primaryGoals as unknown[]).filter((x) => typeof x === "string").map((x) => String(x)).slice(0, 10)
    : undefined;

  const topicHint = s.topics.length ? s.topics[s.cursor % s.topics.length] : undefined;

  const draft = await generateClientNewsletterDraft({
    kind,
    businessName: profile?.businessName,
    websiteUrl: profile?.websiteUrl,
    industry: profile?.industry,
    businessModel: profile?.businessModel,
    primaryGoals,
    targetCustomer: profile?.targetCustomer,
    brandVoice: profile?.brandVoice,
    promptAnswers: s.promptAnswers,
    topicHint,
  });

  const slug = await uniqueNewsletterSlug(site.id, kind, draft.title);

  const fromName = profile?.businessName || site.name || "Purely Automation";
  const siteHandle = (site as any).slug ?? site.id;

  const newsletter = await prisma.clientNewsletter.create({
    data: {
      siteId: site.id,
      kind,
      status: s.requireApproval ? "READY" : "DRAFT",
      slug,
      title: draft.title,
      excerpt: draft.excerpt,
      content: draft.content,
      smsText: draft.smsText ?? undefined,
    },
    select: { id: true, slug: true },
  });

  try {
    await prisma.portalNewsletterGenerationEvent.create({
      data: {
        ownerId,
        siteId: site.id,
        newsletterId: newsletter.id,
        source: "GENERATE_NOW",
        chargedCredits: needCredits,
        kind,
      },
      select: { id: true },
    });
  } catch {
    // best-effort
  }

  const nextCursor = s.cursor + 1;
  const nextStored = {
    external: kind === "EXTERNAL" ? { ...(stored.external as any), cursor: nextCursor } : stored.external,
    internal: kind === "INTERNAL" ? { ...(stored.internal as any), cursor: nextCursor } : stored.internal,
  };

  if (setup?.id) {
    await prisma.portalServiceSetup.update({ where: { id: setup.id }, data: { dataJson: nextStored as any } });
  } else {
    await prisma.portalServiceSetup.create({
      data: { ownerId, serviceSlug: "newsletter", status: "IN_PROGRESS", dataJson: nextStored as any },
      select: { id: true },
    });
  }

  let sendResults: any = null;
  let sentAt: Date | null = null;

  if (!s.requireApproval) {
    sendResults = await sendNewsletterToAudience({
      req,
      ownerId,
      kind,
      siteHandle,
      newsletter: {
        title: draft.title,
        excerpt: draft.excerpt,
        slug,
        smsText: draft.smsText ?? null,
      },
      channels: s.channels,
      audience: s.audience,
      fromName,
    });

    sentAt = new Date();
    await prisma.clientNewsletter.update({
      where: { id: newsletter.id },
      data: { status: "SENT", sentAt },
      select: { id: true },
    });

    const errorsEmail = sendResults.email.results.filter((r: any) => !r.ok);
    const errorsSms = sendResults.sms.results.filter((r: any) => !r.ok);

    if (s.channels.email) {
      await prisma.portalNewsletterSendEvent.create({
        data: {
          ownerId,
          siteId: site.id,
          newsletterId: newsletter.id,
          channel: "EMAIL",
          kind,
          requestedCount: sendResults.email.requested,
          sentCount: sendResults.email.sent,
          failedCount: Math.max(0, sendResults.email.requested - sendResults.email.sent),
          ...(errorsEmail.length ? { errorsJson: errorsEmail.slice(0, 200) } : {}),
        },
        select: { id: true },
      });
    }

    if (s.channels.sms) {
      await prisma.portalNewsletterSendEvent.create({
        data: {
          ownerId,
          siteId: site.id,
          newsletterId: newsletter.id,
          channel: "SMS",
          kind,
          requestedCount: sendResults.sms.requested,
          sentCount: sendResults.sms.sent,
          failedCount: Math.max(0, sendResults.sms.requested - sendResults.sms.sent),
          ...(errorsSms.length ? { errorsJson: errorsSms.slice(0, 200) } : {}),
        },
        select: { id: true },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    newsletterId: newsletter.id,
    slug: newsletter.slug,
    status: s.requireApproval ? "READY" : "SENT",
    sentAtIso: sentAt ? sentAt.toISOString() : null,
    sendResults,
  });
}
