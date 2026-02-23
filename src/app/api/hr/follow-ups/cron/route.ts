import { NextResponse } from "next/server";

import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";
import { processDueHrCandidateFollowUps } from "@/lib/hrFollowUpsCron";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function checkAuth(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.HR_FOLLOWUPS_CRON_SECRET;

  if (isProd && !secret && !isVercelCron) {
    return { ok: false as const, status: 503 as const, error: "Missing HR_FOLLOWUPS_CRON_SECRET" };
  }
  if (!secret) return { ok: true as const, status: 200 as const };

  if (!isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-hr-followups-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }

  return { ok: true as const, status: 200 as const };
}

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const followUps = await processDueHrCandidateFollowUps({ limit: 200 });

  return NextResponse.json({ ok: true, followUps });
}
