import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { generateText } from "@/lib/ai";
import { stripDoubleAsterisks } from "@/lib/blog";
import { prisma } from "@/lib/db";

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type BlogDraft = {
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  seoKeywords?: string[];
};

type BlogDraftList = { posts: BlogDraft[] };

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

function assertDraft(value: unknown): BlogDraft {
  if (!value || typeof value !== "object") throw new Error("AI returned invalid JSON");
  const v = value as Partial<BlogDraft>;
  if (!v.title || typeof v.title !== "string") throw new Error("AI draft missing title");
  if (!v.excerpt || typeof v.excerpt !== "string") throw new Error("AI draft missing excerpt");
  if (!v.content || typeof v.content !== "string") throw new Error("AI draft missing content");

  return {
    title: stripDoubleAsterisks(v.title.trim()),
    slug: v.slug && typeof v.slug === "string" ? v.slug.trim() : undefined,
    excerpt: stripDoubleAsterisks(v.excerpt.trim()),
    content: stripDoubleAsterisks(v.content.trim()),
    seoKeywords: Array.isArray(v.seoKeywords) ? v.seoKeywords.filter((k) => typeof k === "string") : undefined,
  };
}

function assertDraftList(value: unknown): BlogDraftList {
  if (!value || typeof value !== "object") throw new Error("AI returned invalid JSON");
  const v = value as Partial<BlogDraftList>;
  if (!Array.isArray(v.posts)) throw new Error("AI draft missing posts[]");
  const posts = v.posts.map((p) => assertDraft(p));
  return { posts };
}

function pickTopic(date: Date) {
  const topics = [
    "How to automate blogging without losing your voice",
    "A simple weekly SEO workflow you can automate",
    "From notes to published post: automating a content pipeline",
    "Automating content repurposing for service businesses",
    "How automation prevents missed follow ups and stale websites",
    "The business case for scheduled, consistent publishing",
    "Automation that reduces marketing admin for small teams",
    "Automating customer follow ups after content goes live",
    "What to automate first when marketing is inconsistent",
    "How to turn daily ops into helpful content",
  ];

  const key = date.toISOString().slice(0, 10);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return topics[hash % topics.length];
}

function parseIntParam(value: string | null, fallback: number) {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseFloatParam(value: string | null, fallback: number) {
  const n = value ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

function uniqueNonEmptyStrings(items: unknown): string[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const set = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    set.add(trimmed);
  }
  return set.size ? Array.from(set) : undefined;
}

export async function GET(req: Request) {
  const secret = process.env.BLOG_CRON_SECRET ?? process.env.MARKETING_CRON_SECRET;
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-blog-cron-secret") ??
    req.headers.get("x-marketing-cron-secret") ??
    url.searchParams.get("secret");

  if (secret && provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = Math.min(20, Math.max(1, parseIntParam(url.searchParams.get("count"), 12)));
  const daysBetween = Math.min(31, Math.max(3, parseIntParam(url.searchParams.get("daysBetween"), 7)));
  const offset = Math.min(count, Math.max(0, parseIntParam(url.searchParams.get("offset"), 0)));
  const maxPerRequest = Math.min(10, Math.max(1, parseIntParam(url.searchParams.get("maxPerRequest"), 6)));
  const timeBudgetSeconds = Math.min(25, Math.max(6, parseFloatParam(url.searchParams.get("timeBudgetSeconds"), 18)));

  // Backdate: newest is today, then every N days into the past.
  const now = new Date();
  const dates: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i * daysBetween);
    dates.push(d);
  }

  const targetDates = dates.slice(offset, Math.min(count, offset + maxPerRequest));

  const created: Array<{ slug: string; title: string; publishedAt: string }> = [];
  const skipped: Array<{ date: string; reason: string }> = [];

  const startedAt = Date.now();

  // Pre-filter out days that already have a post.
  const pending: Date[] = [];
  for (const publishDate of targetDates) {
    const dayStart = new Date(Date.UTC(publishDate.getUTCFullYear(), publishDate.getUTCMonth(), publishDate.getUTCDate()));
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const already = await prisma.blogPost.findFirst({
      where: { publishedAt: { gte: dayStart, lt: dayEnd } },
      select: { id: true },
    });

    if (already) {
      skipped.push({ date: publishDate.toISOString().slice(0, 10), reason: "Already has a post for that day" });
      continue;
    }

    pending.push(publishDate);
  }

  if (pending.length === 0) {
    const nextOffset = offset + targetDates.length;
    const hasMore = nextOffset < count;
    const nextUrl = hasMore
      ? `${url.origin}${url.pathname}?count=${count}&daysBetween=${daysBetween}&offset=${nextOffset}&maxPerRequest=${maxPerRequest}` +
        (provided ? `&secret=${encodeURIComponent(provided)}` : "")
      : null;

    return NextResponse.json({ ok: true, createdCount: 0, skippedCount: skipped.length, created, skipped, nextOffset, hasMore, nextUrl });
  }

  // Generate multiple posts in one AI call to reduce latency.
  const plan = pending.map((d) => ({ date: d.toISOString().slice(0, 10), topic: pickTopic(d) }));

  const system = [
    "You write helpful business blog posts for owners and operators.",
    "Write in a natural, human tone. Do not mention being an AI.",
    "Do not use emojis.",
    "Do not use em dashes. Avoid long, breathless sentences.",
    "Avoid corporate buzzwords and cliches (for example: leverage, unlock, synergy, game changer, in today's world).",
    "Use practical examples and simple language.",
  ].join(" ");

  const user = [
    "Create SEO-friendly blog posts for Purely Automation.",
    "Company positioning: Purely builds systems that automate blogging so businesses do not spend hours writing, editing, and publishing every week.",
    "Audience: small to mid-size service businesses and operators.",
    "Return ONLY valid JSON. No extra text.",
    "JSON shape: { posts: [ { title, slug, excerpt, content, seoKeywords } ] }",
    "Rules for each post:",
    "- slug must be URL-safe (lowercase, hyphens).",
    "- excerpt must be 1 to 2 sentences.",
    "- content must be plain text with headings using '## ' and optional bullet lists with '- '.",
    "- Do not use markdown emphasis like **bold** or *italics*. Do not include asterisks for styling.",
    "- End the post with a short call to action that tells readers to book a call on purelyautomation.com.",
    "- No em dashes, no emojis.",
    "Create one post for each item below, in the same order:",
    JSON.stringify(plan),
  ].join("\n");

  let raw = "";
  try {
    raw = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-4o-mini" });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "AI request failed",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }

  let drafts: BlogDraft[];
  try {
    drafts = assertDraftList(tryParseJson(raw)).posts;
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to parse AI blog output",
        details: e instanceof Error ? e.message : "Unknown error",
        raw: raw.slice(0, 2000),
      },
      { status: 500 },
    );
  }

  if (drafts.length < pending.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "AI returned fewer posts than requested",
        requested: pending.length,
        received: drafts.length,
      },
      { status: 500 },
    );
  }

  const limitedDrafts = drafts.slice(0, pending.length);

  for (let i = 0; i < pending.length; i++) {
    if ((Date.now() - startedAt) / 1000 > timeBudgetSeconds) {
      break;
    }

    const publishDate = pending[i];
    const draft = limitedDrafts[i];

    const proposedSlug = slugify(draft.slug || draft.title);
    let finalSlug = proposedSlug || `automation-${publishDate.toISOString().slice(0, 10)}`;

    const collision = await prisma.blogPost.findUnique({ where: { slug: finalSlug }, select: { id: true } });
    if (collision) {
      finalSlug = `${finalSlug}-${String(publishDate.getUTCHours()).padStart(2, "0")}${String(publishDate.getUTCMinutes()).padStart(2, "0")}`;
    }

    const record = await prisma.blogPost.create({
      data: {
        slug: finalSlug,
        title: draft.title,
        excerpt: draft.excerpt,
        content: draft.content,
        seoKeywords: uniqueNonEmptyStrings(draft.seoKeywords) ?? Prisma.DbNull,
        publishedAt: publishDate,
      },
      select: { slug: true, title: true, publishedAt: true },
    });

    created.push({
      slug: record.slug,
      title: record.title,
      publishedAt: record.publishedAt.toISOString(),
    });
  }

  const nextOffset = offset + targetDates.length;
  const hasMore = nextOffset < count;
  const nextUrl = hasMore
    ? `${url.origin}${url.pathname}?count=${count}&daysBetween=${daysBetween}&offset=${nextOffset}&maxPerRequest=${maxPerRequest}` +
      (provided ? `&secret=${encodeURIComponent(provided)}` : "")
    : null;

  return NextResponse.json({
    ok: true,
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
    skipped,
    offset,
    nextOffset,
    hasMore,
    nextUrl,
    elapsedMs: Date.now() - startedAt,
  });
}
