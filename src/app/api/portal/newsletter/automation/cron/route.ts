import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { consumeCredits } from "@/lib/credits";
import { generateClientNewsletterDraft } from "@/lib/clientNewsletterAutomation";
import { uniqueNewsletterSlug, sendNewsletterToAudience } from "@/lib/portalNewsletter";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type NewsletterKind = "EXTERNAL" | "INTERNAL";

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

function normalizeKindSettings(value: unknown) {
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
    deliveryEmailHint: typeof rec?.deliveryEmailHint === "string" ? rec.deliveryEmailHint.trim().slice(0, 1500) : "",
    deliverySmsHint: typeof rec?.deliverySmsHint === "string" ? rec.deliverySmsHint.trim().slice(0, 800) : "",
    includeImages: Boolean(rec?.includeImages),
    includeImagesWhereNeeded: Boolean(rec?.includeImagesWhereNeeded),
    audience: rec?.audience && typeof rec.audience === "object" ? (rec.audience as any) : {},
    lastRunAt: typeof rec?.lastRunAt === "string" ? rec.lastRunAt : undefined,
  };
}

type CommonsImage = { url: string; thumbUrl: string; mime: string; title: string; sourcePage: string };

async function pickCommonsImages(q: string, take: number): Promise<CommonsImage[]> {
  const query = String(q || "").trim();
  if (query.length < 2) return [];

  const api = new URL("https://commons.wikimedia.org/w/api.php");
  api.searchParams.set("action", "query");
  api.searchParams.set("format", "json");
  api.searchParams.set("generator", "search");
  api.searchParams.set("gsrsearch", `${query} filetype:bitmap`);
  api.searchParams.set("gsrlimit", String(Math.max(6, Math.min(18, take * 3))));
  api.searchParams.set("gsrnamespace", "6");
  api.searchParams.set("prop", "imageinfo");
  api.searchParams.set("iiprop", "url|mime");
  api.searchParams.set("iiurlwidth", "1400");

  const res = await fetch(api.toString(), {
    method: "GET",
    headers: { "user-agent": "purelyautomation/portal-newsletter" },
    cache: "no-store",
  }).catch(() => null as any);
  if (!res?.ok) return [];

  const json = (await res.json().catch(() => null)) as any;
  const pages = json?.query?.pages && typeof json.query.pages === "object" ? Object.values(json.query.pages) : [];
  const out: CommonsImage[] = [];
  for (const p of pages as any[]) {
    const title = String(p?.title || "");
    const info = Array.isArray(p?.imageinfo) ? p.imageinfo[0] : null;
    const url = typeof info?.url === "string" ? info.url : null;
    const thumbUrl = typeof info?.thumburl === "string" ? info.thumburl : url;
    const mime = typeof info?.mime === "string" ? info.mime : "";
    if (!url || !thumbUrl) continue;
    if (mime && !mime.startsWith("image/")) continue;
    const sourcePage = `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/\s/g, "_"))}`;
    out.push({ url, thumbUrl, mime: mime || "image/*", title, sourcePage });
    if (out.length >= take) break;
  }
  return out;
}

function insertImagesIntoMarkdown(markdown: string, images: CommonsImage[], opts: { whereNeeded: boolean }) {
  const md = String(markdown || "");
  if (!images.length) return md;
  if (opts.whereNeeded && /!\[[^\]]*\]\([^\)]+\)/.test(md)) return md;

  const imgLines = images
    .slice(0, 2)
    .map((i) => `![${i.title.replace(/^File:/, "").slice(0, 80)}](${i.thumbUrl})`);

  if (!imgLines.length) return md;

  const lines = md.split(/\r?\n/);
  let idx = 0;
  while (idx < lines.length && !String(lines[idx] || "").trim()) idx += 1;
  const insertAt = Math.min(lines.length, idx + 1);
  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  return [...before, "", imgLines[0], "", ...(imgLines[1] && !opts.whereNeeded ? [imgLines[1], ""] : []), ...after].join("\n");
}

function normalizeSettings(value: unknown) {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  return {
    external: normalizeKindSettings(rec?.external),
    internal: normalizeKindSettings(rec?.internal),
  };
}

function msDays(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

function isStaleLastRunAt(lastRunAt: string | undefined, now: Date) {
  if (!lastRunAt) return true;
  const d = new Date(lastRunAt);
  if (!Number.isFinite(d.getTime())) return true;
  return now.getTime() - d.getTime() > 6 * 60 * 60 * 1000;
}

async function shouldGenerate(siteId: string, kind: NewsletterKind, frequencyDays: number, now: Date) {
  const last = await prisma.clientNewsletter.findFirst({
    where: { siteId, kind },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (!last?.createdAt) return { due: true, lastAt: null as Date | null };
  const dueAt = new Date(last.createdAt.getTime() + msDays(frequencyDays));
  return { due: dueAt <= now, lastAt: last.createdAt };
}

async function runKind(opts: {
  req: Request;
  ownerId: string;
  site: { id: string; slug: string | null; name: string };
  kind: NewsletterKind;
  s: ReturnType<typeof normalizeKindSettings>;
  setupId: string;
  storedRaw: any;
  now: Date;
}) {
  if (!opts.s.enabled) return { created: 0 };

  const due = await shouldGenerate(opts.site.id, opts.kind, opts.s.frequencyDays, opts.now);
  if (!due.due) {
    if (isStaleLastRunAt(opts.s.lastRunAt, opts.now)) {
      const next = { ...opts.storedRaw };
      const key = opts.kind === "INTERNAL" ? "internal" : "external";
      next[key] = { ...(next[key] || {}), lastRunAt: opts.now.toISOString() };
      await prisma.portalServiceSetup.update({ where: { id: opts.setupId }, data: { dataJson: next } });
    }
    return { created: 0 };
  }

  const needCredits = 30;
  const consumed = await consumeCredits(opts.ownerId, needCredits);
  if (!consumed.ok) return { created: 0, error: "INSUFFICIENT_CREDITS" };

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId: opts.ownerId },
    select: {
      businessName: true,
      websiteUrl: true,
      industry: true,
      businessModel: true,
      primaryGoals: true,
      targetCustomer: true,
      brandVoice: true,
    },
  });

  const primaryGoals = Array.isArray(profile?.primaryGoals)
    ? (profile?.primaryGoals as unknown[]).filter((x) => typeof x === "string").map((x) => String(x)).slice(0, 10)
    : undefined;

  const topicHint = opts.s.topics.length ? opts.s.topics[opts.s.cursor % opts.s.topics.length] : undefined;

  const draft = await generateClientNewsletterDraft({
    kind: opts.kind,
    businessName: profile?.businessName,
    websiteUrl: profile?.websiteUrl,
    industry: profile?.industry,
    businessModel: profile?.businessModel,
    primaryGoals,
    targetCustomer: profile?.targetCustomer,
    brandVoice: profile?.brandVoice,
    promptAnswers: opts.s.promptAnswers,
    topicHint,
    deliveryEmailHint: (opts.s as any).deliveryEmailHint,
    deliverySmsHint: (opts.s as any).deliverySmsHint,
  });

  let contentWithImages = draft.content;
  if ((opts.s as any).includeImages) {
    const query = [topicHint, profile?.industry, profile?.businessName].filter(Boolean).join(" ").trim();
    const whereNeeded = Boolean((opts.s as any).includeImagesWhereNeeded);
    const images = await pickCommonsImages(query || "newsletter", whereNeeded ? 1 : 2);
    contentWithImages = insertImagesIntoMarkdown(draft.content, images, { whereNeeded });
  }

  const slug = await uniqueNewsletterSlug(opts.site.id, opts.kind, draft.title);

  const newsletter = await prisma.clientNewsletter.create({
    data: {
      siteId: opts.site.id,
      kind: opts.kind,
      status: opts.s.requireApproval ? "READY" : "DRAFT",
      slug,
      title: draft.title,
      excerpt: draft.excerpt,
      content: contentWithImages,
      smsText: draft.smsText ?? undefined,
    },
    select: { id: true },
  });

  if (opts.s.requireApproval) {
    // Best-effort: notify portal users.
    try {
      const baseUrl = getAppBaseUrl();
      void tryNotifyPortalAccountUsers({
        ownerId: opts.ownerId,
        kind: "newsletter_ready",
        subject: `Newsletter ready for approval: ${draft.title || slug}`,
        text: [
          "A newsletter draft was generated and is ready for approval.",
          "",
          draft.title ? `Title: ${draft.title}` : null,
          `Kind: ${opts.kind}`,
          "",
          `Open newsletter: ${baseUrl}/portal/app/newsletter`,
        ]
          .filter(Boolean)
          .join("\n"),
      }).catch(() => null);
    } catch {
      // ignore
    }
  }

  try {
    await prisma.portalNewsletterGenerationEvent.create({
      data: {
        ownerId: opts.ownerId,
        siteId: opts.site.id,
        newsletterId: newsletter.id,
        source: "CRON",
        chargedCredits: needCredits,
        kind: opts.kind,
      },
      select: { id: true },
    });
  } catch {
    // best-effort
  }

  const siteHandle = (opts.site as any).slug ?? opts.site.id;
  const fromName = profile?.businessName || opts.site.name || "Purely Automation";

  if (!opts.s.requireApproval) {
    const sendResults = await sendNewsletterToAudience({
      req: opts.req,
      ownerId: opts.ownerId,
      kind: opts.kind,
      siteHandle,
      newsletter: { title: draft.title, excerpt: draft.excerpt, slug, smsText: draft.smsText ?? null },
      channels: opts.s.channels,
      audience: opts.s.audience,
      fromName,
    });

    const sentAt = new Date();
    await prisma.clientNewsletter.update({ where: { id: newsletter.id }, data: { status: "SENT", sentAt } });

    const errorsEmail = sendResults.email.results.filter((r: any) => !r.ok);
    const errorsSms = sendResults.sms.results.filter((r: any) => !r.ok);

    if (opts.s.channels.email) {
      await prisma.portalNewsletterSendEvent.create({
        data: {
          ownerId: opts.ownerId,
          siteId: opts.site.id,
          newsletterId: newsletter.id,
          channel: "EMAIL",
          kind: opts.kind,
          requestedCount: sendResults.email.requested,
          sentCount: sendResults.email.sent,
          failedCount: Math.max(0, sendResults.email.requested - sendResults.email.sent),
          ...(errorsEmail.length ? { errorsJson: errorsEmail.slice(0, 200) } : {}),
        },
      });
    }

    if (opts.s.channels.sms) {
      await prisma.portalNewsletterSendEvent.create({
        data: {
          ownerId: opts.ownerId,
          siteId: opts.site.id,
          newsletterId: newsletter.id,
          channel: "SMS",
          kind: opts.kind,
          requestedCount: sendResults.sms.requested,
          sentCount: sendResults.sms.sent,
          failedCount: Math.max(0, sendResults.sms.requested - sendResults.sms.sent),
          ...(errorsSms.length ? { errorsJson: errorsSms.slice(0, 200) } : {}),
        },
      });
    }

    // Best-effort: notify portal users.
    try {
      const baseUrl = getAppBaseUrl();
      void tryNotifyPortalAccountUsers({
        ownerId: opts.ownerId,
        kind: "newsletter_sent",
        subject: `Newsletter sent: ${draft.title || slug}`,
        text: [
          "A newsletter was sent.",
          "",
          draft.title ? `Title: ${draft.title}` : null,
          `Kind: ${opts.kind}`,
          opts.s.channels.email ? `Email: ${sendResults.email.sent}/${sendResults.email.requested} sent` : null,
          opts.s.channels.sms ? `SMS: ${sendResults.sms.sent}/${sendResults.sms.requested} sent` : null,
          "",
          `Open newsletter: ${baseUrl}/portal/app/newsletter`,
        ]
          .filter(Boolean)
          .join("\n"),
      }).catch(() => null);
    } catch {
      // ignore
    }
  }

  const next = { ...opts.storedRaw };
  const key = opts.kind === "INTERNAL" ? "internal" : "external";
  next[key] = {
    ...(next[key] || {}),
    cursor: opts.s.cursor + 1,
    lastRunAt: opts.now.toISOString(),
  };

  await prisma.portalServiceSetup.update({ where: { id: opts.setupId }, data: { dataJson: next } });

  return { created: 1 };
}

export async function GET(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const aiBaseUrl = (process.env.AI_BASE_URL ?? "").trim();
  const aiApiKey = (process.env.AI_API_KEY ?? "").trim();
  if (!aiBaseUrl || !aiApiKey) {
    return NextResponse.json(
      { error: "AI is not configured for this environment. Set AI_BASE_URL and AI_API_KEY." },
      { status: 503 },
    );
  }

  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.NEWSLETTER_CRON_SECRET ?? process.env.MARKETING_CRON_SECRET;
  if (isProd && !secret && !isVercelCron) {
    return NextResponse.json({ error: "Missing NEWSLETTER_CRON_SECRET" }, { status: 503 });
  }

  if (secret && !isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-newsletter-cron-secret", "x-marketing-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setups = await prisma.portalServiceSetup.findMany({
    where: { serviceSlug: "newsletter" },
    select: { id: true, ownerId: true, dataJson: true },
  });

  const now = new Date();
  let scanned = 0;
  let eligible = 0;
  let created = 0;
  const errors: Array<{ ownerId: string; kind?: NewsletterKind; error: string }> = [];

  for (const setup of setups) {
    scanned += 1;
    const settings = normalizeSettings(setup.dataJson);

    const site = await prisma.clientBlogSite.findUnique({ where: { ownerId: setup.ownerId }, select: { id: true, slug: true, name: true } });
    if (!site?.id) continue;

    const storedRaw = (setup.dataJson && typeof setup.dataJson === "object" ? (setup.dataJson as any) : {}) as any;

    for (const kind of ["EXTERNAL", "INTERNAL"] as const) {
      const s = kind === "INTERNAL" ? settings.internal : settings.external;
      if (!s.enabled) continue;
      eligible += 1;

      try {
        const result = await runKind({
          req,
          ownerId: setup.ownerId,
          site: { id: site.id, slug: (site as any).slug ?? null, name: site.name },
          kind,
          s,
          setupId: setup.id,
          storedRaw,
          now,
        });

        if ((result as any).error) {
          errors.push({ ownerId: setup.ownerId, kind, error: String((result as any).error) });
          continue;
        }

        created += result.created;
        if (created >= 10) break;
      } catch (e) {
        errors.push({ ownerId: setup.ownerId, kind, error: e instanceof Error ? e.message : "Unknown error" });
      }
    }

    if (created >= 10) break;
  }

  return NextResponse.json({ ok: true, scanned, eligible, created, errors });
}
