import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAdsUser } from "@/lib/adsAuth";

export async function GET() {
  await requireAdsUser();

  const rows = await prisma.portalTargetingBucket
    .findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
      take: 500,
    })
    .catch(() => []);

  return NextResponse.json({ ok: true, buckets: rows });
}
