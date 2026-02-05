import { NextResponse } from "next/server";

import { processDueFollowUps } from "@/lib/followUpAutomation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const secret = process.env.FOLLOW_UP_CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("x-follow-up-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await processDueFollowUps({ limit: 50 });
  return NextResponse.json({ ok: true, ...result });
}
