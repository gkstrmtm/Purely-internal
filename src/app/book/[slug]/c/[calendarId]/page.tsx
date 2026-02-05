import { prisma } from "@/lib/db";
import { PublicBookingClient } from "@/app/book/[slug]/PublicBookingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicBookingCalendarPrettyPage({
  params,
}: {
  params: Promise<{ slug: string; calendarId: string }>;
}) {
  const { slug, calendarId } = await params;

  const site = await (prisma as any).portalBookingSite.findUnique({
    where: { slug },
    select: { ownerId: true },
  });

  if (!site?.ownerId) {
    // Let the client render the not-found state using its existing error handling.
    return <PublicBookingClient target={{ kind: "slug", slug }} />;
  }

  return <PublicBookingClient target={{ kind: "calendar", ownerId: String(site.ownerId), calendarId }} />;
}
