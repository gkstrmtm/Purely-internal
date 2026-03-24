import { NextResponse } from "next/server";

import { isVercelCronRequest } from "@/lib/cronAuth";
import { processDuePortalAiChatScheduledMessages } from "@/lib/portalAiChatScheduled";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const isVercelCron = isVercelCronRequest(req);

  // No secret required: in production, only accept requests from Vercel Cron.
  if (isProd && !isVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processDuePortalAiChatScheduledMessages({ limit: 50 });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });

  return NextResponse.json(result);
}
