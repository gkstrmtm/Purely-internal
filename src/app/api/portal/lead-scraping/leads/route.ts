import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  take: z.number().int().min(1).max(500).default(200),
});

export async function GET(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const url = new URL(req.url);
  const takeRaw = url.searchParams.get("take");
  const parsed = querySchema.safeParse({
    take: takeRaw ? Number(takeRaw) : undefined,
  });
  const take = parsed.success ? parsed.data.take : 200;

  const leads = await prisma.portalLead.findMany({
    where: { ownerId },
    orderBy: [{ starred: "desc" }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      kind: true,
      source: true,
      businessName: true,
      email: true,
      phone: true,
      website: true,
      address: true,
      niche: true,
      placeId: true,
      starred: true,
      createdAt: true,
    },
  });

  const normalized = leads.map((l) => ({
    id: l.id,
    kind: l.kind,
    source: l.source,
    businessName: l.businessName,
    email: l.email ?? null,
    phone: l.phone,
    website: l.website,
    address: l.address,
    niche: l.niche,
    placeId: l.placeId,
    starred: Boolean(l.starred),
    createdAtIso: l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
  }));

  return NextResponse.json({ ok: true, leads: normalized });
}
