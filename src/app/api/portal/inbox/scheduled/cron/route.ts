import { NextResponse } from "next/server";

import { baseUrlFromRequest } from "@/lib/leadOutbound";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";
import { processDuePortalInboxScheduledMessages } from "@/lib/portalInboxSend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.INBOX_SCHEDULED_CRON_SECRET;

  if (isProd && !secret && !isVercelCron) {
    return NextResponse.json({ error: "Missing INBOX_SCHEDULED_CRON_SECRET" }, { status: 503 });
  }

  if (secret && !isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-inbox-scheduled-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = baseUrlFromRequest(req);
  const result = await processDuePortalInboxScheduledMessages({ baseUrl, limit: 50 });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });

  return NextResponse.json(result);
}
