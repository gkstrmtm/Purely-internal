import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireManagerSession } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireManagerSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const rows = await prisma.portalAdCampaign
    .findMany({
      where: { reviewStatus: "PENDING" },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        enabled: true,
        reviewStatus: true,
        reviewedAt: true,
        reviewNotes: true,
        placement: true,
        startAt: true,
        endAt: true,
        targetJson: true,
        creativeJson: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, email: true, name: true } },
      },
    })
    .catch(() => []);

  return NextResponse.json({ ok: true, campaigns: rows });
}
