import { NextResponse } from "next/server";

import { processDueMissedAppointments, processDueScheduledAutomations } from "@/lib/portalAutomationsCron";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function checkAuth(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.AUTOMATIONS_CRON_SECRET;
  if (isProd && !secret && !isVercelCron) {
    return { ok: false as const, status: 503 as const, error: "Missing AUTOMATIONS_CRON_SECRET" };
  }
  if (!secret) return { ok: true as const, status: 200 as const };

  if (!isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-automations-cron-secret"],
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

  const scheduled = await processDueScheduledAutomations({ ownersLimit: 2000, perOwnerMaxRuns: 12 });
  const missed = await processDueMissedAppointments({ lookbackHours: 72, graceMinutes: 20, limit: 400 });

  return NextResponse.json({ ok: true, scheduled, missed });
}
