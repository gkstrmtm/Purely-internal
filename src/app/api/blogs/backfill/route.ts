import { NextResponse } from "next/server";

import { runBackfillBatch } from "@/lib/blogAutomation";

function parseIntParam(value: string | null, fallback: number) {
  const n = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseFloatParam(value: string | null, fallback: number) {
  const n = value ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.BLOG_CRON_SECRET ?? process.env.MARKETING_CRON_SECRET;
  if (isProd && !secret) {
    return NextResponse.json({ error: "Missing BLOG_CRON_SECRET" }, { status: 503 });
  }

  const url = new URL(req.url);
  const provided =
    req.headers.get("x-blog-cron-secret") ??
    req.headers.get("x-marketing-cron-secret") ??
    url.searchParams.get("secret");

  if (secret && provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = Math.min(60, Math.max(1, parseIntParam(url.searchParams.get("count"), 12)));
  const daysBetween = Math.min(120, Math.max(1, parseIntParam(url.searchParams.get("daysBetween"), 7)));
  const offset = Math.min(count, Math.max(0, parseIntParam(url.searchParams.get("offset"), 0)));
  const maxPerRequest = Math.min(20, Math.max(1, parseIntParam(url.searchParams.get("maxPerRequest"), 6)));
  const timeBudgetSeconds = Math.min(60, Math.max(5, parseFloatParam(url.searchParams.get("timeBudgetSeconds"), 18)));

  try {
    const result = await runBackfillBatch({ count, daysBetween, offset, maxPerRequest, timeBudgetSeconds });

    const nextUrl = result.hasMore
      ? `${url.origin}${url.pathname}?count=${count}&daysBetween=${daysBetween}&offset=${result.nextOffset}&maxPerRequest=${maxPerRequest}` +
        (provided ? `&secret=${encodeURIComponent(provided)}` : "")
      : null;

    return NextResponse.json({ ...result, nextUrl });
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
