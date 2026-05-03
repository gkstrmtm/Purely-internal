import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ReviewRow = {
  id: string;
  rating: number;
  name: string;
  body: string | null;
  photoUrls: unknown;
  createdAt: Date;
  businessReply?: string | null;
  businessReplyAt?: Date | null;
};

function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function readBool(value: string | null, fallback = false) {
  if (value === null) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => String(entry).trim())
    .filter(Boolean)
    .slice(0, 6);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pageId = String(url.searchParams.get("pageId") || "").trim();
  if (!pageId) return NextResponse.json({ ok: false, error: "Missing pageId" }, { status: 400 });

  const limit = clampInt(url.searchParams.get("limit"), 1, 12, 6);
  const minRating = clampInt(url.searchParams.get("minRating"), 1, 5, 4);
  const showBusinessReply = readBool(url.searchParams.get("showBusinessReply"), false);
  const includePhotos = readBool(url.searchParams.get("includePhotos"), false);

  const page = await prisma.creditFunnelPage
    .findUnique({
      where: { id: pageId },
      select: {
        id: true,
        funnel: {
          select: {
            ownerId: true,
          },
        },
      },
    })
    .catch(() => null);

  const ownerId = String(page?.funnel?.ownerId || "").trim();
  if (!ownerId) return NextResponse.json({ ok: true, reviews: [] });

  const [hasBusinessReply, hasBusinessReplyAt] = showBusinessReply
    ? await Promise.all([hasPublicColumn("PortalReview", "businessReply"), hasPublicColumn("PortalReview", "businessReplyAt")])
    : [false, false];

  const select: any = {
    id: true,
    rating: true,
    name: true,
    body: true,
    photoUrls: true,
    createdAt: true,
  };
  if (hasBusinessReply) select.businessReply = true;
  if (hasBusinessReplyAt) select.businessReplyAt = true;

  const rows: ReviewRow[] = await (prisma as any).portalReview
    .findMany({
      where: {
        ownerId,
        archivedAt: null,
        rating: { gte: minRating },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select,
    })
    .catch(() => []);

  return NextResponse.json({
    ok: true,
    reviews: rows.map((row) => ({
      id: row.id,
      rating: Number(row.rating) || 0,
      name: String(row.name || "Customer"),
      body: row.body ? String(row.body) : null,
      photoUrls: includePhotos ? readPhotoUrls(row.photoUrls) : [],
      ...(hasBusinessReply ? { businessReply: row.businessReply ? String(row.businessReply) : null } : {}),
      ...(hasBusinessReplyAt
        ? {
            businessReplyAt:
              row.businessReplyAt instanceof Date
                ? row.businessReplyAt.toISOString()
                : row.businessReplyAt
                  ? String(row.businessReplyAt)
                  : null,
          }
        : {}),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    })),
  });
}