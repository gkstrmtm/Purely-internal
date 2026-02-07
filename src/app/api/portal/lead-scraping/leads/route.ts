import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  take: z.number().int().min(1).max(500).default(200),
  q: z.string().trim().max(200).default(""),
  kind: z.enum(["B2B", "B2C"]).optional(),
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
  const qRaw = url.searchParams.get("q");
  const kindRaw = url.searchParams.get("kind");
  const parsed = querySchema.safeParse({
    take: takeRaw ? Number(takeRaw) : undefined,
    q: qRaw ?? undefined,
    kind: kindRaw ?? undefined,
  });
  const take = parsed.success ? parsed.data.take : 200;
  const q = parsed.success ? parsed.data.q : "";
  const kind = parsed.success ? parsed.data.kind : undefined;

  const search = q.trim();
  const baseWhere = kind ? ({ ownerId, kind } as const) : ({ ownerId } as const);
  const searchWhere = search
    ? {
        ...baseWhere,
        OR: [
          { businessName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search } },
          { website: { contains: search, mode: "insensitive" as const } },
          { address: { contains: search, mode: "insensitive" as const } },
          { niche: { contains: search, mode: "insensitive" as const } },
          { placeId: { contains: search, mode: "insensitive" as const } },
          { tag: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : baseWhere;

  const result = await (async () => {
    try {
      const [totalCount, matchedCount, leads] = await prisma.$transaction([
        prisma.portalLead.count({ where: baseWhere }),
        prisma.portalLead.count({ where: searchWhere as any }),
        prisma.portalLead.findMany({
          where: searchWhere as any,
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
            tag: true,
            tagColor: true,
            createdAt: true,
          } as any,
        }),
      ]);

      return { totalCount, matchedCount, leads };
    } catch (e) {
      if (!isMissingColumnError(e)) throw e;

      // Backwards compatible read (when DB migrations haven't been applied yet).
      const legacyWhere = search
        ? {
            ...baseWhere,
            OR: [
              { businessName: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search } },
              { website: { contains: search, mode: "insensitive" as const } },
              { address: { contains: search, mode: "insensitive" as const } },
              { niche: { contains: search, mode: "insensitive" as const } },
              { placeId: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : baseWhere;

      const [totalCount, matchedCount, legacy] = await prisma.$transaction([
        prisma.portalLead.count({ where: baseWhere }),
        prisma.portalLead.count({ where: legacyWhere as any }),
        prisma.portalLead.findMany({
          where: legacyWhere as any,
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
        }),
      ]);

      return {
        totalCount,
        matchedCount,
        leads: legacy.map((l) => ({
          ...l,
          email: null as string | null,
          starred: false as boolean,
          tag: null as string | null,
          tagColor: null as string | null,
        })),
      };
    }
  })();

  const normalized = result.leads.map((l) => ({
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
    tag: (l as any).tag ?? null,
    tagColor: (l as any).tagColor ?? null,
    createdAtIso: l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
  }));

  return NextResponse.json({ ok: true, totalCount: result.totalCount, matchedCount: result.matchedCount, leads: normalized });
}
