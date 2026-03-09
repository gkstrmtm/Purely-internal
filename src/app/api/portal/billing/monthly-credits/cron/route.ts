import { NextResponse } from "next/server";

import { processDueMonthlyCreditsGifts } from "@/lib/portalMonthlyCreditsGift";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit");
  const maxCatchUpGiftsPerOwner = url.searchParams.get("maxCatchUpGiftsPerOwner");

  const result = await processDueMonthlyCreditsGifts({
    limit: limit ? Number(limit) : 400,
    maxCatchUpGiftsPerOwner: maxCatchUpGiftsPerOwner ? Number(maxCatchUpGiftsPerOwner) : 2,
  });

  return NextResponse.json({ ok: true, ...result });
}
