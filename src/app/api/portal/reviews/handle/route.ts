import { NextResponse } from "next/server";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { ensureStoredBlogSiteSlug, getStoredBlogSiteSlug } from "@/lib/blogSiteSlug";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const canUse = await hasPublicColumn("ClientBlogSite", "slug");
  const site = (await prisma.clientBlogSite.findUnique({
    where: { ownerId },
    select: { id: true, name: true, ...(canUse ? { slug: true } : {}) },
  } as any)) as any;

  if (site) {
    if (canUse) {
      const handle = (site.slug as string | null | undefined) || (site.id as string);
      return NextResponse.json({ ok: true, handle });
    }

    let fallback = await getStoredBlogSiteSlug(ownerId);
    if (!fallback) fallback = await ensureStoredBlogSiteSlug(ownerId, String(site.name || ""));
    return NextResponse.json({ ok: true, handle: fallback || String(site.id) });
  }

  const bookingSite = await prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { slug: true } });
  if (bookingSite?.slug) return NextResponse.json({ ok: true, handle: String(bookingSite.slug) });

  return NextResponse.json({ ok: true, handle: null });
}
