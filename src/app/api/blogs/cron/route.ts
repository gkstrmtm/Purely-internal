import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { generateText } from "@/lib/ai";
import { prisma } from "@/lib/db";

function startOfWeekUtc(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (day + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

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

  // Strip markdown fences if the model adds them.
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

  const draft: BlogDraft = {
    title: v.title.trim(),
    slug: v.slug && typeof v.slug === "string" ? v.slug.trim() : undefined,
    excerpt: v.excerpt.trim(),
    content: v.content.trim(),
    seoKeywords: Array.isArray(v.seoKeywords) ? v.seoKeywords.filter((k) => typeof k === "string") : undefined,
  };

  return draft;
}

function weekKeyUtc(date: Date) {
  const start = startOfWeekUtc(date);
  const y = start.getUTCFullYear();
  const m = String(start.getUTCMonth() + 1).padStart(2, "0");
  const d = String(start.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
  ];

  const key = weekKeyUtc(date);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return topics[hash % topics.length];
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

  const now = new Date();
  const weekStart = startOfWeekUtc(now);

  const existing = await prisma.blogPost.findFirst({
    where: { publishedAt: { gte: weekStart } },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, publishedAt: true },
  });

  if (existing) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Already published this week", existing });
  }

  const topic = pickTopic(now);

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
  let finalSlug = proposedSlug || `weekly-automation-${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;

  // Avoid rare collisions.
  const collision = await prisma.blogPost.findUnique({ where: { slug: finalSlug }, select: { id: true } });
  if (collision) {
    finalSlug = `${finalSlug}-${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}`;
  }

  const created = await prisma.blogPost.create({
    data: {
      slug: finalSlug,
      title: draft.title,
      excerpt: draft.excerpt,
      content: draft.content,
      seoKeywords: draft.seoKeywords ?? Prisma.DbNull,
      publishedAt: now,
    },
    select: { slug: true, title: true, publishedAt: true },
  });

  return NextResponse.json({ ok: true, created });
}
