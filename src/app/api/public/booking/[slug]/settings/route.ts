import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { getBookingFormConfig } from "@/lib/bookingForm";
import { buildPublicExternalBookingHandoff } from "@/lib/externalBookingHandoff";
import { getExternalBookingLinkConfig } from "@/lib/externalBookingLink";
import { deriveFunnelBookingHostedThemeFromSource } from "@/lib/funnelBookingTheme";
import { getNeutralFunnelBookingRuntimeTheme } from "@/lib/funnelBookingRuntimeTheme";
import { mergeFunnelBookingHostedTheme, readFunnelBookingRouting } from "@/lib/funnelBookingRouting";
import { getHostedTheme } from "@/lib/hostedTheme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const requestUrl = new URL(req.url);
  const requestedFunnelId = requestUrl.searchParams.get("funnelId")?.trim() || "";
  const requestedPageId = requestUrl.searchParams.get("pageId")?.trim() || "";
  const requestedThemeStage = requestUrl.searchParams.get("themeStage") === "published" ? "published" : "current";

  const [hasPhotoUrl, hasMeetingLocation, hasMeetingDetails] = await Promise.all([
    hasPublicColumn("PortalBookingSite", "photoUrl"),
    hasPublicColumn("PortalBookingSite", "meetingLocation"),
    hasPublicColumn("PortalBookingSite", "meetingDetails"),
  ]);

  const [hasLogoUrl, hasPrimaryHex, hasSecondaryHex, hasAccentHex, hasTextHex, hasBusinessName] = await Promise.all([
    hasPublicColumn("BusinessProfile", "logoUrl"),
    hasPublicColumn("BusinessProfile", "brandPrimaryHex"),
    hasPublicColumn("BusinessProfile", "brandSecondaryHex"),
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
      owner: { select: { id: true, name: true, clientPortalVariant: true } },
    } as any,
  });

  if (!site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [profile, form, ownerHostedTheme, settingsRow, derivedFunnelHostedTheme, externalLink] = await Promise.all([
    site.owner?.id
      ? await (prisma as any).businessProfile.findUnique({
          where: { ownerId: site.owner.id },
          select: {
            ...(hasBusinessName ? { businessName: true } : {}),
            ...(hasLogoUrl ? { logoUrl: true } : {}),
            ...(hasPrimaryHex ? { brandPrimaryHex: true } : {}),
            ...(hasSecondaryHex ? { brandSecondaryHex: true } : {}),
            ...(hasAccentHex ? { brandAccentHex: true } : {}),
            ...(hasTextHex ? { brandTextHex: true } : {}),
          } as any,
        })
      : null,
    // Form config is stored in PortalServiceSetup JSON to avoid migrations.
    site.ownerId ? getBookingFormConfig(String(site.ownerId)) : Promise.resolve(null),
    site.ownerId ? getHostedTheme(String(site.ownerId)) : Promise.resolve(null),
    requestedFunnelId
      ? prisma.creditFunnelBuilderSettings.findUnique({ where: { ownerId: String(site.ownerId) }, select: { dataJson: true } }).catch(() => null)
      : Promise.resolve(null),
    requestedFunnelId
      ? deriveFunnelBookingHostedThemeFromSource({
          ownerId: String(site.ownerId),
          funnelId: requestedFunnelId,
          pageId: requestedPageId || null,
          stage: requestedThemeStage,
        }).catch(() => null)
      : Promise.resolve(null),
    site.ownerId ? getExternalBookingLinkConfig(String(site.ownerId)) : Promise.resolve(null),
  ]);

  const funnelHostedTheme = requestedFunnelId
    ? readFunnelBookingRouting(settingsRow?.dataJson ?? null, requestedFunnelId)?.hostedTheme ?? null
    : null;
  const hasFunnelNativeTheme = Boolean(
    requestedFunnelId &&
      ((derivedFunnelHostedTheme && Object.values(derivedFunnelHostedTheme).some((value) => value != null && value !== 1)) ||
        (funnelHostedTheme && Object.values(funnelHostedTheme).some((value) => value != null && value !== 1))),
  );
  const embeddedFunnelTheme = requestedFunnelId ? getNeutralFunnelBookingRuntimeTheme() : null;
  const hostedTheme =
    embeddedFunnelTheme ??
    mergeFunnelBookingHostedTheme(
      mergeFunnelBookingHostedTheme(ownerHostedTheme ?? null, derivedFunnelHostedTheme ?? null),
      funnelHostedTheme,
    );
  const useFunnelTheme = Boolean(embeddedFunnelTheme || hasFunnelNativeTheme);
  const externalHandoff = externalLink
    ? buildPublicExternalBookingHandoff(
        String(site.slug),
        externalLink,
        site.owner?.clientPortalVariant === "CREDIT" ? "credit" : site.owner?.clientPortalVariant === "PORTAL" ? "portal" : null,
      )
    : null;

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
      brandPrimaryHex: useFunnelTheme ? null : hasPrimaryHex ? ((profile as any)?.brandPrimaryHex ?? null) : null,
      brandSecondaryHex: useFunnelTheme ? null : hasSecondaryHex ? ((profile as any)?.brandSecondaryHex ?? null) : null,
      brandAccentHex: useFunnelTheme ? null : hasAccentHex ? ((profile as any)?.brandAccentHex ?? null) : null,
      brandTextHex: useFunnelTheme ? null : hasTextHex ? ((profile as any)?.brandTextHex ?? null) : null,
      hostedThemeSource: useFunnelTheme ? "funnel" : "account",
      hostedTheme,
      photoUrl: hasPhotoUrl ? ((site as any).photoUrl ?? null) : null,
      meetingLocation: hasMeetingLocation ? ((site as any).meetingLocation ?? null) : null,
      meetingDetails: hasMeetingDetails ? ((site as any).meetingDetails ?? null) : null,
      externalHandoff: externalHandoff ?? undefined,
      form: form ?? undefined,
    },
  });
}
