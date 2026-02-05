import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { generateClientBlogDraft } from "@/lib/clientBlogAutomation";
import { slugify } from "@/lib/slugify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoredSettings = {
  enabled?: boolean;
  frequencyDays?: number;
  topics?: string[];
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
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.BLOG_CRON_SECRET ?? process.env.MARKETING_CRON_SECRET;
  if (isProd && !secret) {
    return NextResponse.json({ error: "Missing BLOG_CRON_SECRET" }, { status: 503 });
  }

  if (secret) {
    const url = new URL(req.url);
    const authz = req.headers.get("authorization") ?? "";
    const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : null;
    const provided =
      req.headers.get("x-blog-cron-secret") ??
      req.headers.get("x-marketing-cron-secret") ??
      bearer ??
      url.searchParams.get("secret");

    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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

      const draft = await generateClientBlogDraft({
        businessName: profile?.businessName,
        websiteUrl: profile?.websiteUrl,
        industry: profile?.industry,
        businessModel: profile?.businessModel,
        primaryGoals,
        targetCustomer: profile?.targetCustomer,
        brandVoice: profile?.brandVoice,
        topic,
      });

      const slug = await uniqueSlug(site.id, draft.title);

      const scheduledPublishedAt = last?.createdAt
        ? new Date(Math.min(now.getTime(), last.createdAt.getTime() + msDays(s.frequencyDays)))
        : now;

      await prisma.clientBlogPost.create({
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

      created += 1;

      const nextJson: StoredSettings = {
        enabled: s.enabled,
        frequencyDays: s.frequencyDays,
        topics: s.topics,
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
