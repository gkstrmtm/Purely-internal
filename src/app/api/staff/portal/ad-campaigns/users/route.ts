import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireStaffSession } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await requireStaffSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const url = new URL(req.url);
  const campaignId = (url.searchParams.get("campaignId") || "").trim() || null;
  const daysRaw = Number(url.searchParams.get("days") || 30);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.floor(daysRaw))) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        ownerId: string;
        email: string;
        businessName: string | null;
        lastSeenAt: Date | null;
        impressions: number;
        impressionsMobile: number;
        impressionsDesktop: number;
        clicks: number;
        clicksMobile: number;
        clicksDesktop: number;
      }>
    >(Prisma.sql`
      SELECT
        e."ownerId" as "ownerId",
        u."email" as "email",
        bp."businessName" as "businessName",
        MAX(e."createdAt") as "lastSeenAt",
        SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' THEN 0 ELSE 1 END)::int as "impressions",
        SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') <> 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'mobile' THEN 1 ELSE 0 END)::int as "impressionsMobile",
        SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') <> 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'desktop' THEN 1 ELSE 0 END)::int as "impressionsDesktop",
        SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' THEN 1 ELSE 0 END)::int as "clicks",
        SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'mobile' THEN 1 ELSE 0 END)::int as "clicksMobile",
        SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'desktop' THEN 1 ELSE 0 END)::int as "clicksDesktop"
      FROM "PortalAdCampaignEvent" e
      JOIN "User" u ON u."id" = e."ownerId"
      LEFT JOIN "BusinessProfile" bp ON bp."ownerId" = e."ownerId"
      WHERE
        e."kind" = 'IMPRESSION'
        AND e."createdAt" >= ${since}
        AND (${campaignId}::text IS NULL OR e."campaignId" = ${campaignId})
      GROUP BY e."ownerId", u."email", bp."businessName"
      ORDER BY "impressions" DESC, "clicks" DESC
      LIMIT 500;
    `);

    return NextResponse.json({ ok: true, days, rows });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load user analytics." }, { status: 500 });
  }
}
