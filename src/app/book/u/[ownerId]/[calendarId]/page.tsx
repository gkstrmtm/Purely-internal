import { PublicBookingClient } from "@/app/book/[slug]/PublicBookingClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicBookingCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ ownerId: string; calendarId: string }>;
  searchParams: Promise<{ funnelId?: string; pageId?: string; themeStage?: string }>;
}) {
  const { ownerId, calendarId } = await params;
  const resolvedSearchParams = await searchParams;
  const funnelId = typeof resolvedSearchParams?.funnelId === "string" ? resolvedSearchParams.funnelId.trim() : "";
  const pageId = typeof resolvedSearchParams?.pageId === "string" ? resolvedSearchParams.pageId.trim() : "";
  const themeStage = resolvedSearchParams?.themeStage === "published" ? "published" : "current";
  return (
    <PublicBookingClient
      target={{ kind: "calendar", ownerId, calendarId, funnelId: funnelId || null, pageId: pageId || null, themeStage }}
    />
  );
}
