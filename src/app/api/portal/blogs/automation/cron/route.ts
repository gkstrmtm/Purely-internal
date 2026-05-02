import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { generateClientBlogDraft } from "@/lib/clientBlogAutomation";
import { extractBlogAutomationContextFiles } from "@/lib/blogAutomationContext";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { consumeCredits } from "@/lib/credits";
import { slugify } from "@/lib/slugify";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoredSettings = {
  enabled?: boolean;
  frequencyDays?: number;
  topics?: string[];
  contextFiles?: Array<{
    id?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    tag?: string;
    shareUrl?: string;
    previewUrl?: string;
    createdAt?: string;
  }>;
  cursor?: number;
  autoPublish?: boolean;
  lastRunAt?: string;
};

function normalizeSettings(value: unknown) {
  const rec = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const topics = Array.isArray(rec?.topics)
    ? (rec?.topics as unknown[]).filter((x) => typeof x === "string").map((s) => String(s).trim()).filter(Boolean).slice(0, 50)
    : [];

  return {
    enabled: Boolean(rec?.enabled),
    frequencyDays: typeof rec?.frequencyDays === "number" && Number.isFinite(rec.frequencyDays)
      ? Math.min(30, Math.max(1, Math.floor(rec.frequencyDays)))
      : 7,
    topics,
    contextFiles: Array.isArray(rec?.contextFiles)
      ? (rec?.contextFiles as unknown[])
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            fileName: typeof (item as any).fileName === "string" ? String((item as any).fileName).trim().slice(0, 180) : undefined,
            mimeType: typeof (item as any).mimeType === "string" ? String((item as any).mimeType).trim().slice(0, 120) : undefined,
            tag: typeof (item as any).tag === "string" ? String((item as any).tag).trim().slice(0, 120) : undefined,
            url: typeof (item as any).shareUrl === "string" ? String((item as any).shareUrl).trim().slice(0, 1000) : undefined,
          }))
          .filter((item) => item.fileName || item.tag || item.url)
          .slice(0, 12)
      : [],
    cursor: typeof rec?.cursor === "number" && Number.isFinite(rec.cursor) ? Math.max(0, Math.floor(rec.cursor)) : 0,
    autoPublish: Boolean(rec?.autoPublish),
    lastRunAt: typeof rec?.lastRunAt === "string" ? rec.lastRunAt : undefined,
  };
}

async function uniqueSlug(siteId: string, desired: string) {
  const base = slugify(desired) || "post";
  let attempt = base;
  for (let i = 0; i < 50; i += 1) {
    const exists = await prisma.clientBlogPost.findUnique({
      where: { siteId_slug: { siteId, slug: attempt } },
      select: { id: true },
    });
    if (!exists) return attempt;
    attempt = `${base}-${i + 2}`;
  }
  return `${base}-${Date.now()}`;
}

function msDays(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

function isStaleLastRunAt(lastRunAt: string | undefined, now: Date) {
  if (!lastRunAt) return true;
  const d = new Date(lastRunAt);
  if (!Number.isFinite(d.getTime())) return true;
  // Avoid hammering the DB: only bump this every ~6 hours.
  return now.getTime() - d.getTime() > 6 * 60 * 60 * 1000;
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
  const secret = process.env.BLOG_CRON_SECRET ?? process.env.MARKETING_CRON_SECRET;
  if (isProd && !secret && !isVercelCron) {
    return NextResponse.json({ error: "Missing BLOG_CRON_SECRET" }, { status: 503 });
  }

  if (secret && !isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-blog-cron-secret", "x-marketing-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setups = await prisma.portalServiceSetup.findMany({
    where: { serviceSlug: "blogs" },
    select: { id: true, ownerId: true, dataJson: true },
  });

  const now = new Date();

  let scanned = 0;
  let eligible = 0;
  let created = 0;
  const errors: Array<{ ownerId: string; error: string }> = [];

  for (const setup of setups) {
    scanned += 1;
    const s = normalizeSettings(setup.dataJson);
    if (!s.enabled) continue;

    const site = await prisma.clientBlogSite.findUnique({ where: { ownerId: setup.ownerId }, select: { id: true } });
    if (!site?.id) continue;

    const last = await prisma.clientBlogPost.findFirst({
      where: { siteId: site.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (last?.createdAt) {
      const dueAt = new Date(last.createdAt.getTime() + msDays(s.frequencyDays));
      if (dueAt > now) {
        if (isStaleLastRunAt(s.lastRunAt, now)) {
          const nextJson: StoredSettings = {
            enabled: s.enabled,
            frequencyDays: s.frequencyDays,
            topics: s.topics,
            contextFiles: (setup.dataJson as any)?.contextFiles,
            cursor: s.cursor,
            autoPublish: s.autoPublish,
            lastRunAt: now.toISOString(),
          };
          await prisma.portalServiceSetup.update({ where: { id: setup.id }, data: { dataJson: nextJson } });
        }
        continue;
      }
    }

    eligible += 1;

    const cursor = s.cursor;
    const topic = s.topics.length ? s.topics[cursor % s.topics.length] : undefined;

    try {
      const needCredits = s.frequencyDays < 7 ? PORTAL_CREDIT_COSTS.blogGenerateDraft : 0;
      const consumed = await consumeCredits(setup.ownerId, needCredits);
      if (!consumed.ok) {
        errors.push({ ownerId: setup.ownerId, error: "INSUFFICIENT_CREDITS" });

        if (isStaleLastRunAt(s.lastRunAt, now) && setup.id) {
          const nextJson: StoredSettings = {
            enabled: s.enabled,
            frequencyDays: s.frequencyDays,
            topics: s.topics,
            contextFiles: (setup.dataJson as any)?.contextFiles,
            cursor: s.cursor,
            autoPublish: s.autoPublish,
            lastRunAt: now.toISOString(),
          };
          await prisma.portalServiceSetup.update({ where: { id: setup.id }, data: { dataJson: nextJson } });
        }

        continue;
      }

      const profile = await prisma.businessProfile.findUnique({
        where: { ownerId: setup.ownerId },
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

      const extractedContextFiles = await extractBlogAutomationContextFiles({ ownerId: setup.ownerId, contextFiles: (setup.dataJson as any)?.contextFiles });
      const strictTopicOnly = Boolean(String(topic || "").trim()) || extractedContextFiles.length > 0;

      const draft = await generateClientBlogDraft({
        businessName: profile?.businessName,
        websiteUrl: profile?.websiteUrl,
        industry: profile?.industry,
        businessModel: profile?.businessModel,
        primaryGoals,
        targetCustomer: profile?.targetCustomer,
        brandVoice: profile?.brandVoice,
        topic,
        strictTopicOnly,
        referenceAssets: extractedContextFiles.map((file) => ({
          fileName: file.fileName,
          mimeType: file.mimeType,
          tag: file.tag,
          url: file.sourceUrl,
          extractionKind: file.extractionKind,
          extractedText: file.extractedText,
        })),
      });

      const slug = await uniqueSlug(site.id, draft.title);

      const scheduledPublishedAt = last?.createdAt
        ? new Date(Math.min(now.getTime(), last.createdAt.getTime() + msDays(s.frequencyDays)))
        : now;

      const post = await prisma.clientBlogPost.create({
        data: {
          siteId: site.id,
          status: s.autoPublish ? "PUBLISHED" : "DRAFT",
          slug,
          title: draft.title,
          excerpt: draft.excerpt,
          content: draft.content,
          seoKeywords: draft.seoKeywords?.length ? draft.seoKeywords : undefined,
          ...(s.autoPublish ? { publishedAt: scheduledPublishedAt } : {}),
        },
        select: { id: true },
      });

      if (s.autoPublish) {
        const baseUrl = getAppBaseUrl();
        void tryNotifyPortalAccountUsers({
          ownerId: setup.ownerId,
          kind: "blog_published",
          subject: `Blog published: ${draft.title}`,
          text: [
            "A blog post was auto-published.",
            "",
            `Title: ${draft.title}`,
            slug ? `Slug: ${slug}` : null,
            `Open blogs: ${baseUrl}/portal/app/blogs`,
          ]
            .filter(Boolean)
            .join("\n"),
        }).catch(() => null);
      }

      try {
        await prisma.portalBlogGenerationEvent.create({
          data: {
            ownerId: setup.ownerId,
            siteId: site.id,
            postId: post.id,
            source: "CRON",
            chargedCredits: needCredits,
            topic: topic ?? undefined,
          },
          select: { id: true },
        });
      } catch {
        // Best-effort usage tracking.
      }

      created += 1;

      const nextJson: StoredSettings = {
        enabled: s.enabled,
        frequencyDays: s.frequencyDays,
        topics: s.topics,
        contextFiles: (setup.dataJson as any)?.contextFiles,
        cursor: s.cursor + 1,
        autoPublish: s.autoPublish,
        lastRunAt: now.toISOString(),
      };

      await prisma.portalServiceSetup.update({ where: { id: setup.id }, data: { dataJson: nextJson } });

      // Keep the cron bounded.
      if (created >= 10) break;
    } catch (e) {
      errors.push({ ownerId: setup.ownerId, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return NextResponse.json({ ok: true, scanned, eligible, created, errors });
}
