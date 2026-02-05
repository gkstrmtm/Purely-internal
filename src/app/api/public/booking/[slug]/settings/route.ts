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
      photoUrl: true,
      meetingLocation: true,
      meetingDetails: true,
      owner: { select: { id: true, name: true } },
    },
  });

  if (!site || !site.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const profile = site.owner?.id
    ? await prisma.businessProfile.findUnique({
        where: { ownerId: site.owner.id },
        select: { logoUrl: true, brandPrimaryHex: true, brandAccentHex: true, brandTextHex: true, businessName: true },
      })
    : null;

  return NextResponse.json({
    ok: true,
    site: {
      slug: site.slug,
      title: site.title,
      description: site.description,
      durationMinutes: site.durationMinutes,
      timeZone: site.timeZone,
      hostName: site.owner?.name ?? null,
      businessName: profile?.businessName ?? null,
      logoUrl: profile?.logoUrl ?? null,
      brandPrimaryHex: profile?.brandPrimaryHex ?? null,
      brandAccentHex: profile?.brandAccentHex ?? null,
      brandTextHex: profile?.brandTextHex ?? null,
      photoUrl: site.photoUrl ?? null,
      meetingLocation: site.meetingLocation ?? null,
      meetingDetails: site.meetingDetails ?? null,
    },
  });
}
