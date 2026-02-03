import { NextResponse } from "next/server";
import { z } from "zod";

import { requireManagerSession } from "@/lib/apiAuth";
import { runBackfillBatch } from "@/lib/blogAutomation";

const bodySchema = z.object({
  count: z.number().int().min(1).max(3650).default(12),
  daysBetween: z.number().int().min(1).max(365).default(7),
  offset: z.number().int().min(0).default(0),
  maxPerRequest: z.number().int().min(1).max(20).default(6),
  timeBudgetSeconds: z.number().min(5).max(60).default(18),
});

export async function POST(req: Request) {
  const auth = await requireManagerSession();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  try {
    const result = await runBackfillBatch(parsed.data);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Backfill failed",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
