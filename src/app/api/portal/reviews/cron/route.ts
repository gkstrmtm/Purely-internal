import { NextResponse } from "next/server";
import { processDueReviewRequests } from "@/lib/reviewRequests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.REVIEWS_CRON_SECRET;
  if (isProd && !secret) {
    return NextResponse.json({ error: "Missing REVIEWS_CRON_SECRET" }, { status: 503 });
  }

  if (secret) {
    const url = new URL(req.url);
    const authz = req.headers.get("authorization") ?? "";
    const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : null;
    const provided = req.headers.get("x-reviews-cron-secret") ?? bearer ?? url.searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
