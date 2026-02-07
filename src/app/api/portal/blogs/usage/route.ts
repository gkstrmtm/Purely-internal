import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RangeKey = "7d" | "30d" | "90d" | "all";

function clampRangeKey(value: string | null): RangeKey {
  switch ((value ?? "").toLowerCase().trim()) {
    case "7d":
    case "7":
      return "7d";
    case "90d":
    case "90":
      return "90d";
    case "all":
      return "all";
    case "30d":
    case "30":
    default:
      return "30d";
  }
}

function startForRange(range: RangeKey, now: Date): Date {
  if (range === "all") return new Date(0);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const range = clampRangeKey(url.searchParams.get("range"));
  const now = new Date();
  const start = startForRange(range, now);

  const [site, aggRange, aggAll] = await Promise.all([
    prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } }),
    prisma.portalBlogGenerationEvent.aggregate({
      where: { ownerId, createdAt: { gte: start } },
      _count: { id: true },
      _sum: { chargedCredits: true },
    }),
    prisma.portalBlogGenerationEvent.aggregate({
      where: { ownerId },
      _count: { id: true },
      _sum: { chargedCredits: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    range,
    siteId: site?.id ?? null,
    creditsUsed: {
      range: typeof aggRange._sum.chargedCredits === "number" ? aggRange._sum.chargedCredits : 0,
      all: typeof aggAll._sum.chargedCredits === "number" ? aggAll._sum.chargedCredits : 0,
    },
    generations: {
      range: typeof aggRange._count.id === "number" ? aggRange._count.id : 0,
      all: typeof aggAll._count.id === "number" ? aggAll._count.id : 0,
    },
  });
}
