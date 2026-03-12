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
  const includeAllRaw = (url.searchParams.get("includeAll") || "").trim().toLowerCase();
  const includeAll = includeAllRaw === "1" || includeAllRaw === "true" || includeAllRaw === "yes";
  const daysRaw = Number(url.searchParams.get("days") || 30);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.floor(daysRaw))) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const engagementSlug = "portal_engagement";

  try {
    const rows = includeAll
      ? await prisma.$queryRaw<
          Array<{
            ownerId: string;
            email: string;
            businessName: string | null;
            lastSeenAt: Date | null;
            topServiceSlug: string | null;
            topServiceSec: number | null;
            impressions: number;
            impressionsMobile: number;
            impressionsDesktop: number;
            clicks: number;
            clicksMobile: number;
            clicksDesktop: number;
          }>
        >(Prisma.sql`
          WITH agg AS (
            SELECT
              e."ownerId" as "ownerId",
              MAX(e."createdAt") as "lastSeenAt",
              SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' THEN 0 ELSE 1 END)::int as "impressions",
              SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') <> 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'mobile' THEN 1 ELSE 0 END)::int as "impressionsMobile",
              SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') <> 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'desktop' THEN 1 ELSE 0 END)::int as "impressionsDesktop",
              SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' THEN 1 ELSE 0 END)::int as "clicks",
              SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'mobile' THEN 1 ELSE 0 END)::int as "clicksMobile",
              SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'desktop' THEN 1 ELSE 0 END)::int as "clicksDesktop"
            FROM "PortalAdCampaignEvent" e
            WHERE
              e."kind" = 'IMPRESSION'
              AND e."createdAt" >= ${since}
              AND (${campaignId}::text IS NULL OR e."campaignId" = ${campaignId})
            GROUP BY e."ownerId"
          )
          SELECT
            u."id" as "ownerId",
            u."email" as "email",
            bp."businessName" as "businessName",
            CASE
              WHEN a."lastSeenAt" IS NULL THEN portal."lastSeenAt"
              WHEN portal."lastSeenAt" IS NULL THEN a."lastSeenAt"
              ELSE GREATEST(a."lastSeenAt", portal."lastSeenAt")
            END as "lastSeenAt",
            portal."topServiceSlug" as "topServiceSlug",
            portal."topServiceSec"::int as "topServiceSec",
            COALESCE(a."impressions", 0)::int as "impressions",
            COALESCE(a."impressionsMobile", 0)::int as "impressionsMobile",
            COALESCE(a."impressionsDesktop", 0)::int as "impressionsDesktop",
            COALESCE(a."clicks", 0)::int as "clicks",
            COALESCE(a."clicksMobile", 0)::int as "clicksMobile",
            COALESCE(a."clicksDesktop", 0)::int as "clicksDesktop"
          FROM "User" u
          LEFT JOIN "BusinessProfile" bp ON bp."ownerId" = u."id"
          LEFT JOIN agg a ON a."ownerId" = u."id"
          LEFT JOIN LATERAL (
            SELECT
              CASE
                WHEN ps."dataJson" IS NULL THEN NULL
                ELSE to_timestamp(
                  NULLIF(regexp_replace(COALESCE(ps."dataJson"->>'lastSeenAtMs',''), '[^0-9]', '', 'g'), '')::bigint / 1000.0
                )
              END as "lastSeenAt"
              , top."topServiceSlug" as "topServiceSlug",
              top."topServiceSec" as "topServiceSec"
            FROM "PortalServiceSetup" ps
            LEFT JOIN LATERAL (
              SELECT
                kv.key::text as "topServiceSlug",
                NULLIF(regexp_replace(kv.value::text, '[^0-9]', '', 'g'), '')::bigint as "topServiceSec"
              FROM jsonb_each(COALESCE(ps."dataJson"->'serviceTimeSec', '{}'::jsonb)) as kv(key, value)
              ORDER BY NULLIF(regexp_replace(kv.value::text, '[^0-9]', '', 'g'), '')::bigint DESC NULLS LAST
              LIMIT 1
            ) top ON true
            WHERE ps."ownerId" = u."id" AND ps."serviceSlug" = ${engagementSlug}
            LIMIT 1
          ) portal ON true
          WHERE u."role" = 'CLIENT' AND u."active" = true
          ORDER BY "impressions" DESC, "clicks" DESC, "lastSeenAt" DESC NULLS LAST
          LIMIT 500;
        `)
      : await prisma.$queryRaw<
          Array<{
            ownerId: string;
            email: string;
            businessName: string | null;
            lastSeenAt: Date | null;
            topServiceSlug: string | null;
            topServiceSec: number | null;
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
            CASE
              WHEN MAX(e."createdAt") IS NULL THEN MAX(portal."lastSeenAt")
              WHEN MAX(portal."lastSeenAt") IS NULL THEN MAX(e."createdAt")
              ELSE GREATEST(MAX(e."createdAt"), MAX(portal."lastSeenAt"))
            END as "lastSeenAt",
              MAX(portal."topServiceSlug") as "topServiceSlug",
              MAX(portal."topServiceSec")::int as "topServiceSec",
            SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' THEN 0 ELSE 1 END)::int as "impressions",
            SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') <> 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'mobile' THEN 1 ELSE 0 END)::int as "impressionsMobile",
            SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') <> 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'desktop' THEN 1 ELSE 0 END)::int as "impressionsDesktop",
            SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' THEN 1 ELSE 0 END)::int as "clicks",
            SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'mobile' THEN 1 ELSE 0 END)::int as "clicksMobile",
            SUM(CASE WHEN COALESCE(e."metaJson"->>'action','IMPRESSION') = 'CLICK' AND COALESCE(e."metaJson"->>'device','desktop') = 'desktop' THEN 1 ELSE 0 END)::int as "clicksDesktop"
          FROM "PortalAdCampaignEvent" e
          JOIN "User" u ON u."id" = e."ownerId"
          LEFT JOIN "BusinessProfile" bp ON bp."ownerId" = e."ownerId"
          LEFT JOIN LATERAL (
            SELECT
              CASE
                WHEN ps."dataJson" IS NULL THEN NULL
                ELSE to_timestamp(
                  NULLIF(regexp_replace(COALESCE(ps."dataJson"->>'lastSeenAtMs',''), '[^0-9]', '', 'g'), '')::bigint / 1000.0
                )
              END as "lastSeenAt"
              , top."topServiceSlug" as "topServiceSlug",
              top."topServiceSec" as "topServiceSec"
            FROM "PortalServiceSetup" ps
            LEFT JOIN LATERAL (
              SELECT
                kv.key::text as "topServiceSlug",
                NULLIF(regexp_replace(kv.value::text, '[^0-9]', '', 'g'), '')::bigint as "topServiceSec"
              FROM jsonb_each(COALESCE(ps."dataJson"->'serviceTimeSec', '{}'::jsonb)) as kv(key, value)
              ORDER BY NULLIF(regexp_replace(kv.value::text, '[^0-9]', '', 'g'), '')::bigint DESC NULLS LAST
              LIMIT 1
            ) top ON true
            WHERE ps."ownerId" = e."ownerId" AND ps."serviceSlug" = ${engagementSlug}
            LIMIT 1
          ) portal ON true
          WHERE
            e."kind" = 'IMPRESSION'
            AND e."createdAt" >= ${since}
            AND (${campaignId}::text IS NULL OR e."campaignId" = ${campaignId})
          GROUP BY e."ownerId", u."email", bp."businessName"
          ORDER BY "impressions" DESC, "clicks" DESC
          LIMIT 500;
        `);

    return NextResponse.json({ ok: true, days, includeAll, rows });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to load user analytics." }, { status: 500 });
  }
}
