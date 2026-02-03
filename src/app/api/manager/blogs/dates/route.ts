import { NextResponse } from "next/server";
import { z } from "zod";

import { requireManagerSession } from "@/lib/apiAuth";
import { runGenerateForDates } from "@/lib/blogAutomation";

const bodySchema = z.object({
  dates: z.array(z.string()).min(1).max(30),
});

export async function POST(req: Request) {
  const auth = await requireManagerSession();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  try {
    const result = await runGenerateForDates(parsed.data.dates);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Date generation failed",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
