import { NextResponse } from "next/server";
import { z } from "zod";

import { requireManagerSession } from "@/lib/apiAuth";
import { setTopicQueueSafe, suggestTopics } from "@/lib/blogAutomation";

const bodySchema = z.object({
  count: z.number().int().min(5).max(60).optional(),
  seed: z.string().max(500).optional(),
  storeAsQueue: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const auth = await requireManagerSession();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  try {
    const topics = await suggestTopics({ count: parsed.data.count, seed: parsed.data.seed });
    if (parsed.data.storeAsQueue) {
      await setTopicQueueSafe(topics);
    }
    return NextResponse.json({ ok: true, topics, stored: parsed.data.storeAsQueue });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Topic suggestion failed",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
