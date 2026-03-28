import { NextResponse } from "next/server";

import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";
import { processDuePortalAiChatScheduledMessages } from "@/lib/portalAiChatScheduled";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.AI_CHAT_CRON_SECRET;

  if (isProd && !secret && !isVercelCron) {
    return NextResponse.json({ ok: false, error: "Missing AI_CHAT_CRON_SECRET" }, { status: 503 });
  }

  if (secret && !isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-ai-chat-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limitParsed = limitRaw ? Number(limitRaw) : NaN;
  const limit = Number.isFinite(limitParsed) ? Math.max(1, Math.min(200, Math.floor(limitParsed))) : 50;

  const res = await processDuePortalAiChatScheduledMessages({ limit });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 503 });
  }

  return NextResponse.json({ ok: true, processed: res.processed });
}
