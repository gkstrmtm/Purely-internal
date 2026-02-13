import { NextResponse } from "next/server";

import { runWeeklyGeneration } from "@/lib/blogAutomation";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";

export async function GET(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.BLOG_CRON_SECRET ?? process.env.MARKETING_CRON_SECRET;
  if (isProd && !secret && !isVercelCron) {
    return NextResponse.json({ error: "Missing BLOG_CRON_SECRET" }, { status: 503 });
  }

  if (secret && !isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-blog-cron-secret", "x-marketing-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
