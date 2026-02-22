import { Prisma } from "@prisma/client";

import { generateText } from "@/lib/ai";
import { stripDoubleAsterisks } from "@/lib/blog";
import { prisma } from "@/lib/db";
import { hasPublicColumn, hasPublicTable } from "@/lib/dbSchema";

export async function ensureBlogPostTableSafe() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BlogPost" (
        "id" TEXT PRIMARY KEY,
        "slug" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "excerpt" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "seoKeywords" JSONB,
        "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "archivedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Patch missing columns on older/partial schemas.
    await prisma.$executeRawUnsafe(`ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "slug" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "title" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "excerpt" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "content" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "seoKeywords" JSONB;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ;`);

    // Indexes/constraints.
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key" ON "BlogPost"("slug");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BlogPost_publishedAt_idx" ON "BlogPost"("publishedAt");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BlogPost_archivedAt_idx" ON "BlogPost"("archivedAt");`);
  } catch {
    // ignore
  }
}

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
  anchor?: "NOW" | "OLDEST_POST";
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function withSlugSuffix(baseSlug: string, suffix: string | null) {
  const cleanBase = baseSlug.replace(/^-+|-+$/g, "") || "automation";
  if (!suffix) return cleanBase.slice(0, 80);

  const cleanSuffix = suffix.replace(/^-+|-+$/g, "");
  const fullSuffix = `-${cleanSuffix}`;

  const maxBaseLen = Math.max(1, 80 - fullSuffix.length);
  const trimmedBase = cleanBase.slice(0, maxBaseLen).replace(/-+$/g, "");
  return `${trimmedBase}${fullSuffix}`.slice(0, 80);
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

  const key = isoDay(date);
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

function isMissingTableError(err: unknown, tableName: string) {
  const rec = (err && typeof err === "object" ? (err as Record<string, unknown>) : null) ?? null;
  const code = typeof rec?.code === "string" ? rec.code : undefined;
  const message = typeof rec?.message === "string" ? rec.message : "";
  return code === "P2021" || message.toLowerCase().includes(`table \`${tableName.toLowerCase()}\``);
}

export async function ensureBlogAutomationSettingsTableSafe() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BlogAutomationSettings" (
        "id" TEXT PRIMARY KEY DEFAULT 'singleton',
        "weeklyEnabled" BOOLEAN NOT NULL DEFAULT true,
        "topicQueue" JSONB,
        "topicQueueCursor" INTEGER NOT NULL DEFAULT 0,
        "lastWeeklyRunAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  } catch {
    // ignore
  }
}

export async function getBlogAutomationSettingsSafe() {
  try {
    const row = await prisma.blogAutomationSettings.upsert({
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

    const parsed = parseTopicQueuePayload(row.topicQueue);
    return {
      ...row,
      topicQueue: parsed.topics,
      frequencyDays: parsed.frequencyDays,
      publishHourUtc: parsed.publishHourUtc,
      publishMinuteUtc: parsed.publishMinuteUtc,
    };
  } catch (e) {
    if (isMissingTableError(e, "BlogAutomationSettings")) {
      await ensureBlogAutomationSettingsTableSafe();
      try {
        const row = await prisma.blogAutomationSettings.upsert({
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

        const parsed = parseTopicQueuePayload(row.topicQueue);
        return {
          ...row,
          topicQueue: parsed.topics,
          frequencyDays: parsed.frequencyDays,
          publishHourUtc: parsed.publishHourUtc,
          publishMinuteUtc: parsed.publishMinuteUtc,
        };
      } catch {
        // fall through to defaults
      }
    }

    return {
      id: "singleton",
      weeklyEnabled: true,
      topicQueue: [],
      topicQueueCursor: 0,
      lastWeeklyRunAt: null,
      updatedAt: new Date(0),
      frequencyDays: 7,
      publishHourUtc: 14,
      publishMinuteUtc: 0,
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

function normalizeFrequencyDays(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
  if (!n) return 7;
  return Math.min(30, Math.max(1, n));
}

function normalizePublishHourUtc(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
  if (n === null) return 14;
  return Math.min(23, Math.max(0, n));
}

function normalizePublishMinuteUtc(value: unknown) {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
  if (n === null) return 0;
  return Math.min(59, Math.max(0, n));
}

function parseTopicQueuePayload(
  value: unknown,
): { topics: string[]; frequencyDays: number; publishHourUtc: number; publishMinuteUtc: number } {
  // Backwards compatible:
  // - legacy: topicQueue = ["topic1", "topic2"]
  // - new: topicQueue = { topics: [...], frequencyDays: 7, publishHourUtc: 14, publishMinuteUtc: 0 }
  if (Array.isArray(value)) {
    return { topics: asStringArray(value), frequencyDays: 7, publishHourUtc: 14, publishMinuteUtc: 0 };
  }

  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const topics = asStringArray(rec.topics);
    const frequencyDays = normalizeFrequencyDays(rec.frequencyDays);
    const publishHourUtc = normalizePublishHourUtc(rec.publishHourUtc);
    const publishMinuteUtc = normalizePublishMinuteUtc(rec.publishMinuteUtc);
    return { topics, frequencyDays, publishHourUtc, publishMinuteUtc };
  }

  return { topics: [], frequencyDays: 7, publishHourUtc: 14, publishMinuteUtc: 0 };
}

function buildTopicQueuePayload(
  topics: string[],
  frequencyDays: number,
  publishHourUtc: number,
  publishMinuteUtc: number,
) {
  return {
    topics,
    frequencyDays: normalizeFrequencyDays(frequencyDays),
    publishHourUtc: normalizePublishHourUtc(publishHourUtc),
    publishMinuteUtc: normalizePublishMinuteUtc(publishMinuteUtc),
  };
}

export async function setTopicQueueSafe(topics: string[]) {
  const cleaned = topics.map((t) => stripDoubleAsterisks(t).trim()).filter(Boolean);
  try {
    const existing = await getBlogAutomationSettingsSafe();
    const frequencyDays = normalizeFrequencyDays(existing.frequencyDays);
    const publishHourUtc = normalizePublishHourUtc((existing as { publishHourUtc?: unknown }).publishHourUtc);
    const publishMinuteUtc = normalizePublishMinuteUtc((existing as { publishMinuteUtc?: unknown }).publishMinuteUtc);
    await prisma.blogAutomationSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        topicQueue: buildTopicQueuePayload(cleaned, frequencyDays, publishHourUtc, publishMinuteUtc),
        topicQueueCursor: 0,
      },
      update: {
        topicQueue: buildTopicQueuePayload(cleaned, frequencyDays, publishHourUtc, publishMinuteUtc),
        topicQueueCursor: 0,
      },
    });
  } catch {
    // ignore
  }
}

export async function setFrequencyDaysSafe(frequencyDays: number) {
  const days = normalizeFrequencyDays(frequencyDays);
  try {
    const existing = await getBlogAutomationSettingsSafe();
    const topics = asStringArray(existing.topicQueue);
    const publishHourUtc = normalizePublishHourUtc((existing as { publishHourUtc?: unknown }).publishHourUtc);
    const publishMinuteUtc = normalizePublishMinuteUtc((existing as { publishMinuteUtc?: unknown }).publishMinuteUtc);
    await prisma.blogAutomationSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", topicQueue: buildTopicQueuePayload(topics, days, publishHourUtc, publishMinuteUtc) },
      update: { topicQueue: buildTopicQueuePayload(topics, days, publishHourUtc, publishMinuteUtc) },
    });
  } catch {
    // ignore
  }
}

export async function setPublishTimeUtcSafe(publishHourUtc: number, publishMinuteUtc = 0) {
  const hour = normalizePublishHourUtc(publishHourUtc);
  const minute = normalizePublishMinuteUtc(publishMinuteUtc);
  try {
    const existing = await getBlogAutomationSettingsSafe();
    const topics = asStringArray(existing.topicQueue);
    const frequencyDays = normalizeFrequencyDays(existing.frequencyDays);
    await prisma.blogAutomationSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", topicQueue: buildTopicQueuePayload(topics, frequencyDays, hour, minute) },
      update: { topicQueue: buildTopicQueuePayload(topics, frequencyDays, hour, minute) },
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

function blogUserPromptForOne(
  topic: string,
  opts?: {
    avoidTitles?: string[];
    avoidSlugs?: string[];
  },
) {
  const avoidTitles = (opts?.avoidTitles ?? []).filter(Boolean).slice(0, 120);
  const avoidSlugs = (opts?.avoidSlugs ?? []).filter(Boolean).slice(0, 120);

  return [
    "Create one SEO-friendly blog post for Purely Automation.",
    "Company positioning: Purely builds systems that automate blogging so businesses do not spend hours writing, editing, and publishing every week.",
    `Topic: ${topic}`,
    "Audience: small to mid-size service businesses and operators.",
    avoidTitles.length
      ? `Do NOT reuse any of these titles (write a different title). Existing titles: ${JSON.stringify(avoidTitles)}`
      : null,
    avoidSlugs.length
      ? `Do NOT reuse any of these slugs (write a different slug). Existing slugs: ${JSON.stringify(avoidSlugs)}`
      : null,
    "Requirements:",
    "- Return ONLY valid JSON. No extra text.",
    "- JSON keys: title, slug, excerpt, content, seoKeywords.",
    "- slug must be URL-safe (lowercase, hyphens).",
    "- excerpt must be 1 to 2 sentences.",
    "- content must be plain text with headings using '## ' and optional bullet lists with '- '.",
    "- Do not use markdown emphasis like **bold** or *italics*. Do not include asterisks for styling.",
    "- End the post with a short call to action that tells readers to book a call on purelyautomation.com.",
    "- No em dashes, no emojis.",
  ]
    .filter(Boolean)
    .join("\n");
}

function blogUserPromptForMany(
  plan: Array<{ date: string; topic: string }>,
  opts?: {
    avoidTitles?: string[];
    avoidSlugs?: string[];
  },
) {
  const avoidTitles = (opts?.avoidTitles ?? []).filter(Boolean).slice(0, 80);
  const avoidSlugs = (opts?.avoidSlugs ?? []).filter(Boolean).slice(0, 80);

  return [
    "Create SEO-friendly blog posts for Purely Automation.",
    "Company positioning: Purely builds systems that automate blogging so businesses do not spend hours writing, editing, and publishing every week.",
    "Audience: small to mid-size service businesses and operators.",
    avoidTitles.length ? `Do NOT reuse any of these titles. Existing titles: ${JSON.stringify(avoidTitles)}` : null,
    avoidSlugs.length ? `Do NOT reuse any of these slugs. Existing slugs: ${JSON.stringify(avoidSlugs)}` : null,
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
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateOneDraft(
  topic: string,
  opts?: {
    avoidTitles?: string[];
    avoidSlugs?: string[];
  },
) {
  const raw = await generateText({
    system: blogSystemPrompt(),
    user: blogUserPromptForOne(topic, opts),
    model: process.env.AI_MODEL ?? "gpt-4o-mini",
  });

  return assertDraft(tryParseJson(raw));
}

export async function generateManyDrafts(
  plan: Array<{ date: string; topic: string }>,
  opts?: {
    avoidTitles?: string[];
    avoidSlugs?: string[];
  },
) {
  const raw = await generateText({
    system: blogSystemPrompt(),
    user: blogUserPromptForMany(plan, opts),
    model: process.env.AI_MODEL ?? "gpt-4o-mini",
  });

  const drafts = assertDraftList(tryParseJson(raw)).posts;
  return drafts;
}

async function blogPostNonArchivedWhere(): Promise<Prisma.BlogPostWhereInput> {
  const hasArchivedAt = await hasPublicColumn("BlogPost", "archivedAt").catch(() => false);
  if (!hasArchivedAt) return {};

  // Some environments can drift (column missing even if checks are noisy),
  // so only use the filter if Prisma can actually query it.
  try {
    await prisma.blogPost.findFirst({ where: { archivedAt: null }, select: { id: true } });
    return { archivedAt: null };
  } catch {
    return {};
  }
}

function normalizeTitleKey(title: string) {
  return String(title || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

async function getExistingAvoidLists(max: number) {
  const where = await blogPostNonArchivedWhere();
  const rows = await prisma.blogPost.findMany({
    where,
    orderBy: { publishedAt: "desc" },
    take: Math.min(2000, Math.max(0, max)),
    select: { title: true, slug: true },
  });

  return {
    titles: rows.map((r) => r.title).filter(Boolean),
    slugs: rows.map((r) => r.slug).filter(Boolean),
  };
}

async function titleExistsInsensitive(title: string) {
  const baseWhere = await blogPostNonArchivedWhere();
  const found = await prisma.blogPost.findFirst({
    where: {
      ...baseWhere,
      title: { equals: title, mode: "insensitive" },
    },
    select: { id: true },
  });
  return Boolean(found);
}

async function generateUniqueDraft(topic: string, opts?: { avoidTitles?: string[]; avoidSlugs?: string[] }) {
  const avoidTitles = new Set((opts?.avoidTitles ?? []).filter(Boolean));
  const avoidSlugs = new Set((opts?.avoidSlugs ?? []).filter(Boolean));

  let lastDraft: BlogDraft | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const draft = await generateOneDraft(topic, {
      avoidTitles: Array.from(avoidTitles),
      avoidSlugs: Array.from(avoidSlugs),
    });
    lastDraft = draft;

    const proposedSlug = slugify(draft.slug || draft.title);
    const titleKey = normalizeTitleKey(draft.title);

    const [dupTitle, dupSlug] = await Promise.all([
      titleKey ? titleExistsInsensitive(draft.title) : Promise.resolve(false),
      proposedSlug
        ? prisma.blogPost.findUnique({ where: { slug: proposedSlug }, select: { id: true } }).then(Boolean).catch(() => false)
        : Promise.resolve(false),
    ]);

    if (!dupTitle && !dupSlug && !avoidTitles.has(draft.title) && (!proposedSlug || !avoidSlugs.has(proposedSlug))) {
      return draft;
    }

    avoidTitles.add(draft.title);
    if (proposedSlug) avoidSlugs.add(proposedSlug);
  }

  return lastDraft ?? (await generateOneDraft(topic, opts));
}

async function createBlogPostFromDraft(draft: BlogDraft, publishedAt: Date) {
  if (await titleExistsInsensitive(draft.title)) {
    throw new Error(`Duplicate title detected: ${draft.title}`);
  }

  const baseSlug = slugify(draft.slug || draft.title) || `automation-${isoDay(publishedAt)}`;
  const dayKey = isoDay(publishedAt).replace(/-/g, "");

  for (let attempt = 0; attempt < 30; attempt++) {
    const suffix =
      attempt === 0
        ? null
        : attempt === 1
          ? dayKey
          : attempt < 10
            ? `${dayKey}-${attempt}`
            : `${dayKey}-${attempt}-${Math.random().toString(36).slice(2, 8)}`;
    const candidateSlug = withSlugSuffix(baseSlug, suffix);

    try {
      const record = await prisma.blogPost.create({
        data: {
          slug: candidateSlug,
          title: draft.title,
          excerpt: draft.excerpt,
          content: draft.content,
          seoKeywords: uniqueNonEmptyStrings(draft.seoKeywords) ?? Prisma.DbNull,
          publishedAt,
        },
        select: { slug: true, title: true, publishedAt: true },
      });

      return record;
    } catch (e) {
      const anyErr = e as unknown;
      const rec = (anyErr && typeof anyErr === "object" ? (anyErr as Record<string, unknown>) : null) ?? null;
      const code = typeof rec?.code === "string" ? rec.code : undefined;
      if (code === "P2002") {
        const meta = rec?.meta && typeof rec.meta === "object" ? (rec.meta as Record<string, unknown>) : null;
        const target = meta?.target;
        const targetText = Array.isArray(target) ? target.join(",") : typeof target === "string" ? target : "";
        if (targetText.includes("slug") || targetText === "") continue;
      }
      throw e;
    }
  }

  throw new Error("Failed to create blog post: could not generate a unique slug");
}

export async function runWeeklyGeneration(
  { force = false, ignoreSchedule = false }: { force?: boolean; ignoreSchedule?: boolean } = {},
) {
  const settings = await getBlogAutomationSettingsSafe();
  if (!settings.weeklyEnabled && !force) {
    return { ok: true as const, skipped: true as const, reason: "Automation disabled" };
  }

  const now = new Date();
  const publishHourUtc = normalizePublishHourUtc((settings as { publishHourUtc?: unknown }).publishHourUtc);
  const publishMinuteUtc = normalizePublishMinuteUtc((settings as { publishMinuteUtc?: unknown }).publishMinuteUtc);

  if (!force && !ignoreSchedule) {
    const nowHour = now.getUTCHours();
    const nowMinute = now.getUTCMinutes();
    if (nowHour !== publishHourUtc || nowMinute !== publishMinuteUtc) {
      return {
        ok: true as const,
        skipped: true as const,
        reason: "Not scheduled time",
        publishHourUtc,
        publishMinuteUtc,
      };
    }
  }

  const frequencyDays = normalizeFrequencyDays(
    settings && typeof settings === "object" && "frequencyDays" in settings ? (settings as { frequencyDays?: unknown }).frequencyDays : undefined,
  );
  const threshold = new Date(now.getTime() - frequencyDays * 24 * 60 * 60 * 1000);

  const nonArchivedWhere = await blogPostNonArchivedWhere();

  const existing = await prisma.blogPost.findFirst({
    where: { ...nonArchivedWhere, publishedAt: { gt: threshold } },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, publishedAt: true },
  });

  if (existing && !force) {
    return {
      ok: true as const,
      skipped: true as const,
      reason: `Already published within last ${frequencyDays} day(s)`,
      existing,
      frequencyDays,
    };
  }

  const queued = await takeNextQueuedTopic();
  const topic = queued.topic ?? pickTopic(now);

  const existingAvoid = await getExistingAvoidLists(600);
  let created: { slug: string; title: string; publishedAt: Date } | null = null;
  let lastDraft: BlogDraft | null = null;
  const extraAvoidTitles: string[] = [];
  const extraAvoidSlugs: string[] = [];

  for (let attempt = 0; attempt < 4; attempt++) {
    lastDraft = await generateUniqueDraft(topic, {
      avoidTitles: [...existingAvoid.titles, ...extraAvoidTitles],
      avoidSlugs: [...existingAvoid.slugs, ...extraAvoidSlugs],
    });

    try {
      created = await createBlogPostFromDraft(lastDraft, now);
      break;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("duplicate title")) {
        extraAvoidTitles.push(lastDraft.title);
        extraAvoidSlugs.push(slugify(lastDraft.slug || lastDraft.title));
        continue;
      }
      throw e;
    }
  }

  if (!created) {
    throw new Error(`Failed to create a unique blog post title after retries${lastDraft ? ` (last title: ${lastDraft.title})` : ""}`);
  }

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
  const count = Math.min(3650, Math.max(1, params.count));
  const daysBetween = Math.min(365, Math.max(1, params.daysBetween));
  const offset = Math.min(count, Math.max(0, params.offset));
  const maxPerRequest = Math.min(20, Math.max(1, params.maxPerRequest));
  const timeBudgetSeconds = Math.min(60, Math.max(5, params.timeBudgetSeconds));
  const anchor = params.anchor ?? "NOW";

  const hasBlogPostBefore = await hasPublicTable("BlogPost").catch(() => false);
  if (!hasBlogPostBefore) {
    await ensureBlogPostTableSafe();
  }

  const hasBlogPost = await hasPublicTable("BlogPost").catch(() => false);
  if (!hasBlogPost) {
    return {
      ok: false as const,
      error:
        "Blog posts table is missing in this database (public.BlogPost) and could not be created automatically. Check that your DB user has permission to create tables, or run migrations.",
      stoppedEarly: true as const,
      anchor,
      offset,
      nextOffset: offset,
      hasMore: false as const,
      createdCount: 0,
      skippedCount: 0,
      created: [] as Array<{ slug: string; title: string; publishedAt: string }>,
      skipped: [] as Array<{ date: string; reason: string }>,
      elapsedMs: 0,
    };
  }

  const now = new Date();
  const startedAt = Date.now();

  let targetDates: Date[] = [];

  if (anchor === "OLDEST_POST") {
    const nonArchivedWhere = await blogPostNonArchivedWhere().catch(() => ({} as Prisma.BlogPostWhereInput));
    const oldest = await prisma.blogPost
      .aggregate({
        where: nonArchivedWhere,
        _min: { publishedAt: true },
      })
      .catch(() => ({ _min: { publishedAt: null as Date | null } }));

    const anchorDateRaw = oldest._min.publishedAt ?? now;
    const anchorDate = new Date(
      Date.UTC(
        anchorDateRaw.getUTCFullYear(),
        anchorDateRaw.getUTCMonth(),
        anchorDateRaw.getUTCDate(),
        10,
        0,
        0,
        0,
      ),
    );

    const endExclusive = Math.min(count, offset + maxPerRequest);
    for (let idx = offset; idx < endExclusive; idx++) {
      const step = idx + 1; // 1 = one step earlier than anchor
      const d = new Date(anchorDate);
      d.setUTCDate(d.getUTCDate() - step * daysBetween);
      targetDates.push(d);
    }
  } else {
    const dates: Date[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i * daysBetween);
      dates.push(d);
    }

    targetDates = dates.slice(offset, Math.min(count, offset + maxPerRequest));
  }

  const created: Array<{ slug: string; title: string; publishedAt: string }> = [];
  const skipped: Array<{ date: string; reason: string }> = [];
  let stoppedEarly = false;
  let stopReason: string | null = null;

  const avoidTitles = new Set<string>();
  const avoidSlugs = new Set<string>();
  try {
    const existingAvoid = await getExistingAvoidLists(1200);
    for (const t of existingAvoid.titles) avoidTitles.add(t);
    for (const s of existingAvoid.slugs) avoidSlugs.add(s);
  } catch {
    // ignore
  }

  const targetDateStrings = targetDates.map((d) => isoDay(d));

  if (targetDates.length === 0) {
    return {
      ok: true as const,
      message: offset >= count ? "Nothing to do: offset is at the end of this range." : "Nothing to do: no target dates selected.",
      createdCount: 0,
      skippedCount: 0,
      created,
      skipped,
      anchor,
      offset,
      nextOffset: offset,
      hasMore: false,
      elapsedMs: Date.now() - startedAt,
    };
  }

  const pending: Date[] = [];
  const nonArchivedWhere = await blogPostNonArchivedWhere().catch(() => ({} as Prisma.BlogPostWhereInput));
  for (const publishDate of targetDates) {
    const { dayStart, dayEnd } = dayRangeUtc(publishDate);
    const already = await prisma.blogPost
      .findFirst({
        where: { ...nonArchivedWhere, publishedAt: { gte: dayStart, lt: dayEnd } },
        select: { id: true },
      })
      .catch(() => null);

    if (already) {
      skipped.push({ date: isoDay(publishDate), reason: "Already has a post for that day" });
      continue;
    }

    pending.push(publishDate);
  }

  if (pending.length) {
    for (const publishDate of pending) {
      if ((Date.now() - startedAt) / 1000 > timeBudgetSeconds) {
        stoppedEarly = true;
        stopReason = "Time budget exceeded. Lower Max per request or increase Time budget (s) and run again.";
        break;
      }

      const topic = pickTopic(publishDate);
      try {
        let draft: BlogDraft | null = null;
        let record: { slug: string; title: string; publishedAt: Date } | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          draft = await generateUniqueDraft(topic, {
            avoidTitles: Array.from(avoidTitles),
            avoidSlugs: Array.from(avoidSlugs),
          });

          const proposedSlug = slugify(draft.slug || draft.title) || `automation-${isoDay(publishDate)}`;
          avoidTitles.add(draft.title);
          avoidSlugs.add(proposedSlug);

          try {
            record = await createBlogPostFromDraft(draft, publishDate);
            break;
          } catch (e) {
            const msg = e instanceof Error ? e.message : "";
            if (msg.toLowerCase().includes("duplicate title")) {
              continue;
            }
            throw e;
          }
        }

        if (!record) {
          throw new Error("Failed to create unique post after retries");
        }

        if ((Date.now() - startedAt) / 1000 > timeBudgetSeconds) {
          stoppedEarly = true;
          stopReason = "Time budget exceeded before saving the generated post. Lower Max per request or increase Time budget (s) and run again.";
          break;
        }

        avoidTitles.add(record.title);
        avoidSlugs.add(record.slug);
        created.push({
          slug: record.slug,
          title: record.title,
          publishedAt: record.publishedAt.toISOString(),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        skipped.push({ date: isoDay(publishDate), reason: `Failed to generate/create: ${msg}` });
      }
    }
  }

  // Only advance offset past dates we actually handled.
  // If we stop early due to time budget, we want the next run to retry remaining pending dates.
  const handledInThisRun = created.length + skipped.length;
  const nextOffset = offset + handledInThisRun;
  const hasMore = nextOffset < count;

  return {
    ok: true as const,
    anchor,
    message: stopReason ?? undefined,
    stoppedEarly: stoppedEarly || undefined,
    targetDates: targetDateStrings,
    pendingCount: pending.length,
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
  const nonArchivedWhere = await blogPostNonArchivedWhere();
  for (const publishDate of dates) {
    const { dayStart, dayEnd } = dayRangeUtc(publishDate);
    const already = await prisma.blogPost.findFirst({
      where: { ...nonArchivedWhere, publishedAt: { gte: dayStart, lt: dayEnd } },
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
    const existingAvoid = await getExistingAvoidLists(1500).catch(() => ({ titles: [], slugs: [] }));
    const drafts = await generateManyDrafts(plan, {
      avoidTitles: existingAvoid.titles,
      avoidSlugs: existingAvoid.slugs,
    });
    const limitedDrafts = drafts.slice(0, pending.length);

    const seenTitles = new Set<string>(existingAvoid.titles);
    const seenTitleKeys = new Set<string>(existingAvoid.titles.map(normalizeTitleKey));
    const seenSlugs = new Set<string>(existingAvoid.slugs);

    for (let i = 0; i < pending.length; i++) {
      const publishDate = pending[i];
      const baseDraft = limitedDrafts[i];
      if (!baseDraft) {
        skipped.push({ date: isoDay(publishDate), reason: "AI did not return enough drafts" });
        continue;
      }

      try {
        let draft = baseDraft;
        for (let attempt = 0; attempt < 3; attempt++) {
          const titleKey = normalizeTitleKey(draft.title);
          const proposedSlug = slugify(draft.slug || draft.title);
          const dup = (titleKey && seenTitleKeys.has(titleKey)) || (proposedSlug && seenSlugs.has(proposedSlug));
          if (!dup) break;

          draft = await generateUniqueDraft(plan[i].topic, {
            avoidTitles: Array.from(seenTitles).slice(0, 800),
            avoidSlugs: Array.from(seenSlugs).slice(0, 800),
          });
        }

        const record = await createBlogPostFromDraft(draft, publishDate);
        seenTitles.add(record.title);
        seenTitleKeys.add(normalizeTitleKey(record.title));
        seenSlugs.add(record.slug);
        created.push({
          slug: record.slug,
          title: record.title,
          publishedAt: record.publishedAt.toISOString(),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        skipped.push({ date: isoDay(publishDate), reason: `Failed to generate/create: ${msg}` });
      }
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
