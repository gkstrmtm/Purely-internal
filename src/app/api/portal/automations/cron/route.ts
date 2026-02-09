import { NextResponse } from "next/server";

import { processDueMissedAppointments, processDueScheduledAutomations } from "@/lib/portalAutomationsCron";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function checkAuth(req: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.AUTOMATIONS_CRON_SECRET;
  if (isProd && !secret) return { ok: false as const, status: 503 as const, error: "Missing AUTOMATIONS_CRON_SECRET" };
  if (!secret) return { ok: true as const, status: 200 as const };

  const url = new URL(req.url);
  const authz = req.headers.get("authorization") ?? "";
  const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : null;
  const provided = req.headers.get("x-automations-cron-secret") ?? bearer ?? url.searchParams.get("secret");
  if (provided !== secret) return { ok: false as const, status: 401 as const, error: "Unauthorized" };

  return { ok: true as const, status: 200 as const };
}

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const scheduled = await processDueScheduledAutomations({ ownersLimit: 2000, perOwnerMaxRuns: 12 });
  const missed = await processDueMissedAppointments({ lookbackHours: 72, graceMinutes: 20, limit: 400 });

  return NextResponse.json({ ok: true, scheduled, missed });
}
