import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Kind = "EXTERNAL" | "INTERNAL";

function clampKind(raw: string | null): Kind {
  return (raw || "").toLowerCase().trim() === "internal" ? "INTERNAL" : "EXTERNAL";
}

function clampTake(raw: string | null) {
  const n = Math.floor(Number(raw || 50) || 50);
  return Math.max(1, Math.min(200, n));
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("newsletter");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = auth.session.user.id;
  const url = new URL(req.url);
  const kind = clampKind(url.searchParams.get("kind"));
  const take = clampTake(url.searchParams.get("take"));

  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true, slug: true } });
  if (!site?.id) {
    return NextResponse.json({ ok: true, site: null, newsletters: [] });
  }

  const newsletters = await prisma.clientNewsletter.findMany({
    where: { siteId: site.id, kind },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      status: true,
      slug: true,
      title: true,
      excerpt: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    site: { id: site.id, slug: (site as any).slug ?? null },
    newsletters: newsletters.map((n) => ({
      id: n.id,
      kind: n.kind,
      status: n.status,
      slug: n.slug,
      title: n.title,
      excerpt: n.excerpt,
      sentAtIso: n.sentAt ? n.sentAt.toISOString() : null,
      createdAtIso: n.createdAt.toISOString(),
      updatedAtIso: n.updatedAt.toISOString(),
    })),
  });
}
