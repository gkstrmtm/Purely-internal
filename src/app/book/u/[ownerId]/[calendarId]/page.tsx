import { PublicBookingClient } from "@/app/book/[slug]/PublicBookingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicBookingCalendarPage({
  params,
}: {
  params: Promise<{ ownerId: string; calendarId: string }>;
}) {
  const { ownerId, calendarId } = await params;
  return <PublicBookingClient target={{ kind: "calendar", ownerId, calendarId }} />;
}
