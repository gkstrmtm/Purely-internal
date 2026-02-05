import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const site = await prisma.portalBookingSite.findUnique({
    where: { slug },
    select: {
      enabled: true,
      slug: true,
      title: true,
      description: true,
      durationMinutes: true,
      timeZone: true,
      owner: { select: { name: true } },
    },
  });

  if (!site || !site.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    site: {
      slug: site.slug,
      title: site.title,
      description: site.description,
      durationMinutes: site.durationMinutes,
      timeZone: site.timeZone,
      hostName: site.owner?.name ?? null,
    },
  });
}
