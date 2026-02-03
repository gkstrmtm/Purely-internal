import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { generateText } from "@/lib/ai";
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
    title: v.title.trim(),
    slug: v.slug && typeof v.slug === "string" ? v.slug.trim() : undefined,
    excerpt: v.excerpt.trim(),
    content: v.content.trim(),
    seoKeywords: Array.isArray(v.seoKeywords) ? v.seoKeywords.filter((k) => typeof k === "string") : undefined,
  };
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

export async function GET(req: Request) {
  const secret = process.env.BLOG_CRON_SECRET ?? process.env.MARKETING_CRON_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const provided =
      req.headers.get("x-blog-cron-secret") ??
      req.headers.get("x-marketing-cron-secret") ??
      url.searchParams.get("secret");

    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const count = Math.min(20, Math.max(1, parseIntParam(url.searchParams.get("count"), 12)));
  const daysBetween = Math.min(31, Math.max(3, parseIntParam(url.searchParams.get("daysBetween"), 7)));

  // Backdate: newest is today, then every N days into the past.
  const now = new Date();
  const dates: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i * daysBetween);
    dates.push(d);
  }

  const created: Array<{ slug: string; title: string; publishedAt: string }> = [];
  const skipped: Array<{ date: string; reason: string }> = [];

  for (const publishDate of dates) {
    // Avoid duplicates: skip if a post already exists on the same day.
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

    const topic = pickTopic(publishDate);

    const system = [
      "You write helpful business blog posts for owners and operators.",
      "Write in a natural, human tone. Do not mention being an AI.",
      "Do not use emojis.",
      "Do not use em dashes. Avoid long, breathless sentences.",
      "Avoid corporate buzzwords and cliches (for example: leverage, unlock, synergy, game changer, in today's world).",
      "Use practical examples and simple language.",
    ].join(" ");

    const user = [
      "Create one SEO-friendly blog post for Purely Automation.",
      "Company positioning: Purely builds systems that automate blogging so businesses do not spend hours writing, editing, and publishing every week.",
      `Topic: ${topic}`,
      "Audience: small to mid-size service businesses and operators.",
      "Requirements:",
      "- Return ONLY valid JSON. No extra text.",
      "- JSON keys: title, slug, excerpt, content, seoKeywords.",
      "- slug must be URL-safe (lowercase, hyphens).",
      "- excerpt must be 1 to 2 sentences.",
      "- content must be plain text with headings using '## ' and optional bullet lists with '- '.",
      "- End the post with a short call to action that tells readers to book a call on purelyautomation.com.",
      "- No em dashes, no emojis.",
    ].join("\n");

    const raw = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-4o-mini" });

    let draft: BlogDraft;
    try {
      draft = assertDraft(tryParseJson(raw));
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
        seoKeywords: draft.seoKeywords ?? Prisma.DbNull,
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

  return NextResponse.json({ ok: true, createdCount: created.length, skippedCount: skipped.length, created, skipped });
}
