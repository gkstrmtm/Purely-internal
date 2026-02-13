import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { generateClientBlogDraft } from "@/lib/clientBlogAutomation";
import { consumeCredits } from "@/lib/credits";
import { slugify } from "@/lib/slugify";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";

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
    ? (rec?.topics as unknown[])
        .filter((x) => typeof x === "string")
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 50)
    : [];

  return {
    enabled: Boolean(rec?.enabled),
    frequencyDays:
      typeof rec?.frequencyDays === "number" && Number.isFinite(rec.frequencyDays)
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

function aiConfigured() {
  return Boolean((process.env.AI_BASE_URL ?? "").trim() && (process.env.AI_API_KEY ?? "").trim());
}

export async function POST() {
  const auth = await requireClientSessionForService("blogs");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "AI is not configured for this environment. Set AI_BASE_URL and AI_API_KEY." },
      { status: 503 },
    );
  }

  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } });
  if (!site?.id) {
    return NextResponse.json({ error: "Create your blog workspace first." }, { status: 409 });
  }

  const setup = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: "blogs" } },
    select: { id: true, dataJson: true },
  });

  const s = normalizeSettings(setup?.dataJson);
  const cursor = s.cursor;
  const topic = s.topics.length ? s.topics[cursor % s.topics.length] : undefined;

  const needCredits = 50;
  const consumed = await consumeCredits(ownerId, needCredits);
  if (!consumed.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "INSUFFICIENT_CREDITS",
        error: "Not enough credits to generate a blog post. Top off your credits in Billing.",
        credits: consumed.state.balance,
        billingPath: "/portal/app/billing",
      },
      { status: 402 },
    );
  }

  try {
    const profile = await prisma.businessProfile.findUnique({
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

    const post = await prisma.clientBlogPost.create({
      data: {
        siteId: site.id,
        status: s.autoPublish ? "PUBLISHED" : "DRAFT",
        slug,
        title: draft.title,
        excerpt: draft.excerpt,
        content: draft.content,
        seoKeywords: draft.seoKeywords?.length ? draft.seoKeywords : undefined,
        ...(s.autoPublish ? { publishedAt: new Date() } : {}),
      },
      select: { id: true },
    });

    if (s.autoPublish) {
      const baseUrl = getAppBaseUrl();
      void tryNotifyPortalAccountUsers({
        ownerId,
        kind: "blog_published",
        subject: `Blog published: ${draft.title}`,
        text: [
          "A blog post was published.",
          "",
          `Title: ${draft.title}`,
          `Slug: ${slug}`,
          `Open blogs: ${baseUrl}/portal/app/blogs`,
        ].join("\n"),
      }).catch(() => null);
    }

    try {
      await prisma.portalBlogGenerationEvent.create({
        data: {
          ownerId,
          siteId: site.id,
          postId: post.id,
          source: "GENERATE_NOW",
          chargedCredits: needCredits,
          topic: topic ?? undefined,
        },
        select: { id: true },
      });
    } catch {
      // Best-effort usage tracking.
    }

    if (setup?.id) {
      try {
        const nextJson: StoredSettings = {
          enabled: s.enabled,
          frequencyDays: s.frequencyDays,
          topics: s.topics,
          cursor: s.cursor + 1,
          autoPublish: s.autoPublish,
          lastRunAt: new Date().toISOString(),
        };
        await prisma.portalServiceSetup.update({ where: { id: setup.id }, data: { dataJson: nextJson } });
      } catch {
        // ignore
      }
    }

    return NextResponse.json({ ok: true, postId: post.id, creditsRemaining: consumed.state.balance });
  } catch (e) {
    // If generation fails after charging, we currently do not refund.
    // Keep response helpful and visible in UI.
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
