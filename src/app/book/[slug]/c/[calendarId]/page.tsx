import { prisma } from "@/lib/db";
import { PublicBookingClient } from "@/app/book/[slug]/PublicBookingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicBookingCalendarPrettyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; calendarId: string }>;
  searchParams: Promise<{ funnelId?: string; pageId?: string; themeStage?: string }>;
}) {
  const { slug, calendarId } = await params;
  const resolvedSearchParams = await searchParams;
  const funnelId = typeof resolvedSearchParams?.funnelId === "string" ? resolvedSearchParams.funnelId.trim() : "";
  const pageId = typeof resolvedSearchParams?.pageId === "string" ? resolvedSearchParams.pageId.trim() : "";
  const themeStage = resolvedSearchParams?.themeStage === "published" ? "published" : "current";

  const site = await (prisma as any).portalBookingSite.findUnique({
    where: { slug },
    select: { ownerId: true },
  });

  if (!site?.ownerId) {
    // Let the client render the not-found state using its existing error handling.
    return <PublicBookingClient target={{ kind: "slug", slug, funnelId: funnelId || null, pageId: pageId || null, themeStage }} />;
  }

  return (
    <PublicBookingClient
      target={{ kind: "calendar", ownerId: String(site.ownerId), calendarId, funnelId: funnelId || null, pageId: pageId || null, themeStage }}
    />
  );
}
