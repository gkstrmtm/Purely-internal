import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireManagerSession } from "@/lib/apiAuth";
import {
  getBlogAutomationSettingsSafe,
  setTopicQueueSafe,
  setWeeklyEnabledSafe,
} from "@/lib/blogAutomation";

export async function GET() {
  const auth = await requireManagerSession();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

  const [settings, totalPosts, latest] = await Promise.all([
    getBlogAutomationSettingsSafe(),
    prisma.blogPost.count(),
    prisma.blogPost.findFirst({ orderBy: { publishedAt: "desc" }, select: { slug: true, publishedAt: true } }),
  ]);

  return NextResponse.json({
    ok: true,
    settings,
    stats: {
      totalPosts,
      latest,
    },
  });
}

const patchSchema = z.object({
  weeklyEnabled: z.boolean().optional(),
  topicQueue: z.array(z.string()).nullable().optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireManagerSession();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (typeof parsed.data.weeklyEnabled === "boolean") {
    await setWeeklyEnabledSafe(parsed.data.weeklyEnabled);
  }

  if (parsed.data.topicQueue !== undefined) {
    if (parsed.data.topicQueue === null) {
      await setTopicQueueSafe([]);
    } else {
      await setTopicQueueSafe(parsed.data.topicQueue);
    }
  }

  const settings = await getBlogAutomationSettingsSafe();
  return NextResponse.json({ ok: true, settings });
}
