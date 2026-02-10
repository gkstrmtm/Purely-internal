import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, ctx: { params: Promise<{ newsletterId: string }> }) {
  const auth = await requireClientSessionForService("newsletter");
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  const ownerId = auth.session.user.id;
  const { newsletterId } = await ctx.params;

  const site = await prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true, slug: true, name: true } });
  if (!site?.id) {
    return NextResponse.json({ ok: false, error: "Newsletter site not configured" }, { status: 404 });
  }

  const newsletter = await prisma.clientNewsletter.findFirst({
    where: { id: newsletterId, siteId: site.id },
    select: {
      id: true,
      siteId: true,
      kind: true,
      status: true,
      slug: true,
      title: true,
      excerpt: true,
      content: true,
      smsText: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!newsletter) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    site: { id: site.id, slug: (site as any).slug ?? null, name: site.name },
    newsletter: {
      ...newsletter,
      sentAtIso: newsletter.sentAt ? newsletter.sentAt.toISOString() : null,
      createdAtIso: newsletter.createdAt.toISOString(),
      updatedAtIso: newsletter.updatedAt.toISOString(),
    },
  });
}
