import { NextResponse } from "next/server";
import { processDueReviewRequests } from "@/lib/reviewRequests";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.REVIEWS_CRON_SECRET;
  if (isProd && !secret && !isVercelCron) {
    return NextResponse.json({ error: "Missing REVIEWS_CRON_SECRET" }, { status: 503 });
  }

  if (secret && !isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-reviews-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const ownersLimit = url.searchParams.get("ownersLimit");
  const perOwnerLimit = url.searchParams.get("perOwnerLimit");
  const windowMinutes = url.searchParams.get("windowMinutes");

  const result = await processDueReviewRequests({
    ownersLimit: ownersLimit ? Number(ownersLimit) : 2000,
    perOwnerLimit: perOwnerLimit ? Number(perOwnerLimit) : 25,
    windowMinutes: windowMinutes ? Number(windowMinutes) : 5,
  });
  return NextResponse.json(result);
}
