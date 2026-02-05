import { NextResponse } from "next/server";

import { runWeeklyGeneration } from "@/lib/blogAutomation";

export async function GET(req: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.BLOG_CRON_SECRET ?? process.env.MARKETING_CRON_SECRET;
  if (isProd && !secret) {
    return NextResponse.json({ error: "Missing BLOG_CRON_SECRET" }, { status: 503 });
  }

  if (secret) {
    const url = new URL(req.url);
    const authz = req.headers.get("authorization") ?? "";
    const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : null;
    const provided =
      req.headers.get("x-blog-cron-secret") ??
      req.headers.get("x-marketing-cron-secret") ??
      bearer ??
      url.searchParams.get("secret");

    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runWeeklyGeneration();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "Blog generation failed",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
