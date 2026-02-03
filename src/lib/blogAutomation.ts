import { Prisma } from "@prisma/client";

import { generateText } from "@/lib/ai";
import { stripDoubleAsterisks } from "@/lib/blog";
import { prisma } from "@/lib/db";

export type BlogDraft = {
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  seoKeywords?: string[];
};

type BlogDraftList = { posts: BlogDraft[] };

type BackfillParams = {
  count: number;
  daysBetween: number;
  offset: number;
  maxPerRequest: number;
  timeBudgetSeconds: number;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function startOfWeekUtc(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (day + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function weekKeyUtc(date: Date) {
  const start = startOfWeekUtc(date);
  const y = start.getUTCFullYear();
  const m = String(start.getUTCMonth() + 1).padStart(2, "0");
  const d = String(start.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function pickTopic(date: Date) {
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

  const key = weekKeyUtc(date);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return topics[hash % topics.length];
}

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

export async function getBlogAutomationSettingsSafe() {
  try {
    return await prisma.blogAutomationSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
      select: {
        id: true,
        weeklyEnabled: true,
        topicQueue: true,
        topicQueueCursor: true,
        lastWeeklyRunAt: true,
        updatedAt: true,
      },
    });
  } catch {
    // Table may not exist yet (prod before SQL is run). Treat as defaults.
    return {
      id: "singleton",
      weeklyEnabled: true,
      topicQueue: null,
      topicQueueCursor: 0,
      lastWeeklyRunAt: null,
      updatedAt: new Date(0),
    };
  }
}

export async function setWeeklyEnabledSafe(enabled: boolean) {
  try {
    await prisma.blogAutomationSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", weeklyEnabled: enabled },
      update: { weeklyEnabled: enabled },
    });
  } catch {
    // ignore if table not ready
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function setTopicQueueSafe(topics: string[]) {
  const cleaned = topics.map((t) => stripDoubleAsterisks(t).trim()).filter(Boolean);
  try {
    await prisma.blogAutomationSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", topicQueue: cleaned, topicQueueCursor: 0 },
      update: { topicQueue: cleaned, topicQueueCursor: 0 },
    });
  } catch {
    // ignore
  }
}

async function takeNextQueuedTopic() {
  const settings = await getBlogAutomationSettingsSafe();
  const queue = asStringArray(settings.topicQueue);
  if (!queue.length) return { topic: null as string | null, settings };

  const idx = Math.min(Math.max(0, settings.topicQueueCursor ?? 0), queue.length);
  const topic = queue[idx] ?? null;

  if (topic) {
    try {
      await prisma.blogAutomationSettings.update({
        where: { id: "singleton" },
        data: { topicQueueCursor: idx + 1 },
      });
    } catch {
      // ignore
    }
  }

  return { topic, settings };
}

function blogSystemPrompt() {
  return [
    "You write helpful business blog posts for owners and operators.",
    "Write in a natural, human tone. Do not mention being an AI.",
    "Do not use emojis.",
    "Do not use em dashes. Avoid long, breathless sentences.",
    "Avoid corporate buzzwords and cliches (for example: leverage, unlock, synergy, game changer, in today's world).",
    "Use practical examples and simple language.",
  ].join(" ");
}

function blogUserPromptForOne(topic: string) {
  return [
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
    "- Do not use markdown emphasis like **bold** or *italics*. Do not include asterisks for styling.",
    "- End the post with a short call to action that tells readers to book a call on purelyautomation.com.",
    "- No em dashes, no emojis.",
  ].join("\n");
}

function blogUserPromptForMany(plan: Array<{ date: string; topic: string }>) {
  return [
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
}

export async function generateOneDraft(topic: string) {
  const raw = await generateText({
    system: blogSystemPrompt(),
    user: blogUserPromptForOne(topic),
    model: process.env.AI_MODEL ?? "gpt-4o-mini",
  });

  return assertDraft(tryParseJson(raw));
}

export async function generateManyDrafts(plan: Array<{ date: string; topic: string }>) {
  const raw = await generateText({
    system: blogSystemPrompt(),
    user: blogUserPromptForMany(plan),
    model: process.env.AI_MODEL ?? "gpt-4o-mini",
  });

  const drafts = assertDraftList(tryParseJson(raw)).posts;
  return drafts;
}

async function createBlogPostFromDraft(draft: BlogDraft, publishedAt: Date) {
  const proposedSlug = slugify(draft.slug || draft.title);
  let finalSlug = proposedSlug || `automation-${publishedAt.toISOString().slice(0, 10)}`;

  const collision = await prisma.blogPost.findUnique({ where: { slug: finalSlug }, select: { id: true } });
  if (collision) {
    finalSlug = `${finalSlug}-${String(publishedAt.getUTCHours()).padStart(2, "0")}${String(publishedAt.getUTCMinutes()).padStart(2, "0")}`;
  }

  const record = await prisma.blogPost.create({
    data: {
      slug: finalSlug,
      title: draft.title,
      excerpt: draft.excerpt,
      content: draft.content,
      seoKeywords: uniqueNonEmptyStrings(draft.seoKeywords) ?? Prisma.DbNull,
      publishedAt,
    },
    select: { slug: true, title: true, publishedAt: true },
  });

  return record;
}

export async function runWeeklyGeneration({ force = false }: { force?: boolean } = {}) {
  const settings = await getBlogAutomationSettingsSafe();
  if (!settings.weeklyEnabled && !force) {
    return { ok: true as const, skipped: true as const, reason: "Weekly generation disabled" };
  }

  const now = new Date();
  const weekStart = startOfWeekUtc(now);

  const existing = await prisma.blogPost.findFirst({
    where: { publishedAt: { gte: weekStart } },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, publishedAt: true },
  });

  if (existing && !force) {
    return { ok: true as const, skipped: true as const, reason: "Already published this week", existing };
  }

  const queued = await takeNextQueuedTopic();
  const topic = queued.topic ?? pickTopic(now);

  const draft = await generateOneDraft(topic);
  const created = await createBlogPostFromDraft(draft, now);

  try {
    await prisma.blogAutomationSettings.update({
      where: { id: "singleton" },
      data: { lastWeeklyRunAt: now },
    });
  } catch {
    // ignore
  }

  return { ok: true as const, created, topicUsed: topic };
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayRangeUtc(date: Date) {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  return { dayStart, dayEnd };
}

export async function runBackfillBatch(params: BackfillParams) {
  const count = Math.min(60, Math.max(1, params.count));
  const daysBetween = Math.min(120, Math.max(1, params.daysBetween));
  const offset = Math.min(count, Math.max(0, params.offset));
  const maxPerRequest = Math.min(20, Math.max(1, params.maxPerRequest));
  const timeBudgetSeconds = Math.min(60, Math.max(5, params.timeBudgetSeconds));

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

  const pending: Date[] = [];
  for (const publishDate of targetDates) {
    const { dayStart, dayEnd } = dayRangeUtc(publishDate);
    const already = await prisma.blogPost.findFirst({
      where: { publishedAt: { gte: dayStart, lt: dayEnd } },
      select: { id: true },
    });

    if (already) {
      skipped.push({ date: isoDay(publishDate), reason: "Already has a post for that day" });
      continue;
    }

    pending.push(publishDate);
  }

  if (pending.length) {
    const plan = pending.map((d) => ({ date: isoDay(d), topic: pickTopic(d) }));
    const drafts = await generateManyDrafts(plan);

    const limitedDrafts = drafts.slice(0, pending.length);

    for (let i = 0; i < pending.length; i++) {
      if ((Date.now() - startedAt) / 1000 > timeBudgetSeconds) break;
      const publishDate = pending[i];
      const draft = limitedDrafts[i];

      const record = await createBlogPostFromDraft(draft, publishDate);
      created.push({
        slug: record.slug,
        title: record.title,
        publishedAt: record.publishedAt.toISOString(),
      });
    }
  }

  const nextOffset = offset + targetDates.length;
  const hasMore = nextOffset < count;

  return {
    ok: true as const,
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
    skipped,
    offset,
    nextOffset,
    hasMore,
    elapsedMs: Date.now() - startedAt,
  };
}

function parseIsoDateToUtcMidday(iso: string) {
  // Expect YYYY-MM-DD
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = iso.split("-").map((n) => Number.parseInt(n, 10));
  if (!y || !mo || !d) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, 10, 0, 0, 0));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export async function runGenerateForDates(dateStrings: string[]) {
  const input = Array.from(new Set(dateStrings.map((s) => s.trim()).filter(Boolean)));
  const dates: Date[] = [];
  const invalid: string[] = [];

  for (const s of input) {
    const dt = parseIsoDateToUtcMidday(s);
    if (!dt) invalid.push(s);
    else dates.push(dt);
  }

  const created: Array<{ slug: string; title: string; publishedAt: string }> = [];
  const skipped: Array<{ date: string; reason: string }> = [];

  const pending: Date[] = [];
  for (const publishDate of dates) {
    const { dayStart, dayEnd } = dayRangeUtc(publishDate);
    const already = await prisma.blogPost.findFirst({
      where: { publishedAt: { gte: dayStart, lt: dayEnd } },
      select: { id: true },
    });

    if (already) {
      skipped.push({ date: isoDay(publishDate), reason: "Already has a post for that day" });
      continue;
    }

    pending.push(publishDate);
  }

  if (pending.length) {
    const plan = pending.map((d) => ({ date: isoDay(d), topic: pickTopic(d) }));
    const drafts = await generateManyDrafts(plan);
    const limitedDrafts = drafts.slice(0, pending.length);

    for (let i = 0; i < pending.length; i++) {
      const record = await createBlogPostFromDraft(limitedDrafts[i], pending[i]);
      created.push({
        slug: record.slug,
        title: record.title,
        publishedAt: record.publishedAt.toISOString(),
      });
    }
  }

  return {
    ok: true as const,
    invalid,
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
    skipped,
  };
}

export async function suggestTopics({ count = 20, seed }: { count?: number; seed?: string } = {}) {
  const n = Math.min(60, Math.max(5, count));

  const system = [
    "You create blog topic ideas for a business automation company.",
    "Write in a natural, human tone.",
    "Do not use emojis.",
    "Do not use em dashes.",
    "Avoid buzzwords and cliches.",
    "Return ONLY valid JSON.",
  ].join(" ");

  const user = [
    "Generate blog topic ideas for Purely Automation.",
    "Audience: small to mid-size service businesses and operators.",
    "Focus: blogging automation, publishing workflows, consistency, lead follow up systems, and operations.",
    seed ? `Seed/notes: ${seed}` : "",
    `Return JSON: { topics: string[] } with exactly ${n} items.`,
    "No markdown, no bullets, no numbering.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-4o-mini" });
  const parsed = tryParseJson(raw) as { topics?: unknown };
  const topics = uniqueNonEmptyStrings(parsed.topics) ?? [];
  return topics.map((t) => stripDoubleAsterisks(t)).slice(0, n);
}
