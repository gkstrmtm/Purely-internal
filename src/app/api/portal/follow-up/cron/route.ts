import { NextResponse } from "next/server";

import { processDueFollowUps } from "@/lib/followUpAutomation";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const secret = process.env.FOLLOW_UP_CRON_SECRET;
  if (secret && !isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-follow-up-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processDueFollowUps({ limit: 50 });
  return NextResponse.json({ ok: true, ...result });
}
