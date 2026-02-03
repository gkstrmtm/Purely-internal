import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireManagerSession } from "@/lib/apiAuth";
import { getBlogAutomationSettingsSafe } from "@/lib/blogAutomation";
import { stripDoubleAsterisks } from "@/lib/blog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireManagerSession();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

  const buildSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;

  const [settings, totalPosts, latest] = await Promise.all([
    getBlogAutomationSettingsSafe(),
    prisma.blogPost.count(),
    prisma.blogPost.findFirst({ orderBy: { publishedAt: "desc" }, select: { slug: true, publishedAt: true } }),
  ]);

  return NextResponse.json(
    {
    ok: true,
    buildSha,
    settings,
    stats: {
      totalPosts,
      latest,
    },
    },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
      },
    },
  );
}

const patchSchema = z.object({
  weeklyEnabled: z.boolean().optional(),
  topicQueue: z.array(z.string()).nullable().optional(),
  frequencyDays: z.number().int().min(1).max(30).optional(),
  publishHourUtc: z.number().int().min(0).max(23).optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireManagerSession();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const current = await getBlogAutomationSettingsSafe();
    const nextWeeklyEnabled = typeof parsed.data.weeklyEnabled === "boolean" ? parsed.data.weeklyEnabled : current.weeklyEnabled;
    const nextFrequencyDays = typeof parsed.data.frequencyDays === "number" ? parsed.data.frequencyDays : current.frequencyDays;
    const nextPublishHourUtc =
      typeof parsed.data.publishHourUtc === "number" ? parsed.data.publishHourUtc : (current as { publishHourUtc?: number }).publishHourUtc ?? 14;

    const nextTopicsRaw =
      parsed.data.topicQueue === undefined
        ? (Array.isArray(current.topicQueue) ? current.topicQueue : [])
        : parsed.data.topicQueue === null
          ? []
          : parsed.data.topicQueue;

    const cleanedTopics = nextTopicsRaw
      .map((t) => stripDoubleAsterisks(String(t ?? "")).trim())
      .filter(Boolean);

    const topicQueuePayload = {
      topics: cleanedTopics,
      frequencyDays: nextFrequencyDays,
      publishHourUtc: nextPublishHourUtc,
      publishMinuteUtc: 0,
    };

    const resetCursor = parsed.data.topicQueue !== undefined;

    await prisma.blogAutomationSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        weeklyEnabled: nextWeeklyEnabled,
        topicQueue: topicQueuePayload,
        topicQueueCursor: 0,
      },
      update: {
        weeklyEnabled: nextWeeklyEnabled,
        topicQueue: topicQueuePayload,
        ...(resetCursor ? { topicQueueCursor: 0 } : {}),
      },
    });

    const settings = await getBlogAutomationSettingsSafe();
    return NextResponse.json({ ok: true, settings });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Failed to update settings",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
