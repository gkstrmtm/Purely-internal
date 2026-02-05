import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { getBookingFormConfig } from "@/lib/bookingForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const [hasPhotoUrl, hasMeetingLocation, hasMeetingDetails] = await Promise.all([
    hasPublicColumn("PortalBookingSite", "photoUrl"),
    hasPublicColumn("PortalBookingSite", "meetingLocation"),
    hasPublicColumn("PortalBookingSite", "meetingDetails"),
  ]);

  const [hasLogoUrl, hasPrimaryHex, hasAccentHex, hasTextHex, hasBusinessName] = await Promise.all([
    hasPublicColumn("BusinessProfile", "logoUrl"),
    hasPublicColumn("BusinessProfile", "brandPrimaryHex"),
    hasPublicColumn("BusinessProfile", "brandAccentHex"),
    hasPublicColumn("BusinessProfile", "brandTextHex"),
    hasPublicColumn("BusinessProfile", "businessName"),
  ]);

  const site = await (prisma as any).portalBookingSite.findUnique({
    where: { slug },
    select: {
      enabled: true,
      slug: true,
      ownerId: true,
      title: true,
      description: true,
      durationMinutes: true,
      timeZone: true,
      ...(hasPhotoUrl ? { photoUrl: true } : {}),
      ...(hasMeetingLocation ? { meetingLocation: true } : {}),
      ...(hasMeetingDetails ? { meetingDetails: true } : {}),
      owner: { select: { id: true, name: true } },
    } as any,
  });

  if (!site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [profile, form] = await Promise.all([
    site.owner?.id
    ? await (prisma as any).businessProfile.findUnique({
        where: { ownerId: site.owner.id },
        select: {
          ...(hasBusinessName ? { businessName: true } : {}),
          ...(hasLogoUrl ? { logoUrl: true } : {}),
          ...(hasPrimaryHex ? { brandPrimaryHex: true } : {}),
          ...(hasAccentHex ? { brandAccentHex: true } : {}),
          ...(hasTextHex ? { brandTextHex: true } : {}),
        } as any,
      })
    : null,
    // Form config is stored in PortalServiceSetup JSON to avoid migrations.
    site.ownerId ? getBookingFormConfig(String(site.ownerId)) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    ok: true,
    site: {
      enabled: site.enabled,
      slug: site.slug,
      title: site.title,
      description: site.description,
      durationMinutes: site.durationMinutes,
      timeZone: site.timeZone,
      hostName: site.owner?.name ?? null,
      businessName: hasBusinessName ? ((profile as any)?.businessName ?? null) : null,
      logoUrl: hasLogoUrl ? ((profile as any)?.logoUrl ?? null) : null,
      brandPrimaryHex: hasPrimaryHex ? ((profile as any)?.brandPrimaryHex ?? null) : null,
      brandAccentHex: hasAccentHex ? ((profile as any)?.brandAccentHex ?? null) : null,
      brandTextHex: hasTextHex ? ((profile as any)?.brandTextHex ?? null) : null,
      photoUrl: hasPhotoUrl ? ((site as any).photoUrl ?? null) : null,
      meetingLocation: hasMeetingLocation ? ((site as any).meetingLocation ?? null) : null,
      meetingDetails: hasMeetingDetails ? ((site as any).meetingDetails ?? null) : null,
      form: form ?? undefined,
    },
  });
}
