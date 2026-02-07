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

function isMissingColumnError(e: unknown) {
  const anyErr = e as any;
  if (anyErr && typeof anyErr === "object" && typeof anyErr.code === "string") {
    // Prisma: column does not exist
    if (anyErr.code === "P2022") return true;
  }
  const msg = e instanceof Error ? e.message : "";
  return msg.includes("does not exist") && msg.includes("column");
}

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

  const leads = await (async () => {
    try {
      return await prisma.portalLead.findMany({
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
    } catch (e) {
      if (!isMissingColumnError(e)) throw e;

      // Backwards compatible read (when DB migrations haven't been applied yet).
      const legacy = await prisma.portalLead.findMany({
        where: { ownerId },
        orderBy: [{ createdAt: "desc" }],
        take,
        select: {
          id: true,
          kind: true,
          source: true,
          businessName: true,
          phone: true,
          website: true,
          address: true,
          niche: true,
          placeId: true,
          createdAt: true,
        },
      });

      return legacy.map((l) => ({ ...l, email: null as string | null, starred: false as boolean }));
    }
  })();

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
