import { PublicBookingClient } from "@/app/book/[slug]/PublicBookingClient";
import { coerceBlocksJson, renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";
import { prisma } from "@/lib/db";
import { getHostedBookingCalendarPageKey, HOSTED_BOOKING_MAIN_PAGE_KEY } from "@/lib/hostedPageKeys";
import { renderHostedCustomHtmlTemplate } from "@/lib/hostedPageRuntime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BOOKING_APP_TOKEN = "{{BOOKING_APP}}";

export default async function PublicBookingCalendarPrettyPage({
  params,
}: {
  params: Promise<{ slug: string; calendarId: string }>;
}) {
  const { slug, calendarId } = await params;

  const site = await (prisma as any).portalBookingSite.findUnique({
    where: { slug },
    select: { ownerId: true, title: true, description: true, slug: true },
  });

  if (!site?.ownerId) {
    // Let the client render the not-found state using its existing error handling.
    return <PublicBookingClient target={{ kind: "slug", slug }} />;
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId: String(site.ownerId) },
    select: { businessName: true },
  }).catch(() => null);

  const hostedBookingPage =
    (await (prisma as any).hostedPageDocument.findFirst({
      where: {
        ownerId: String(site.ownerId),
        service: "BOOKING",
        pageKey: getHostedBookingCalendarPageKey(calendarId),
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, editorMode: true, blocksJson: true, customHtml: true },
    })) ||
    (await (prisma as any).hostedPageDocument.findFirst({
      where: {
        ownerId: String(site.ownerId),
        service: "BOOKING",
        pageKey: HOSTED_BOOKING_MAIN_PAGE_KEY,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, editorMode: true, blocksJson: true, customHtml: true },
    }));

  const bookingApp = <PublicBookingClient target={{ kind: "calendar", ownerId: String(site.ownerId), calendarId }} showBranding={false} embedded />;
  const hostedBlocks = coerceBlocksJson(hostedBookingPage?.blocksJson);
  const hasHostedBlocks = Boolean(hostedBookingPage?.editorMode === "BLOCKS" && hostedBlocks.length);
  const hasHostedCustomHtml = Boolean(
    hostedBookingPage?.editorMode === "CUSTOM_HTML" && typeof hostedBookingPage?.customHtml === "string" && hostedBookingPage.customHtml.trim(),
  );

  const businessName = (profile?.businessName || site.title || "Booking").trim();
  const pageTitle = site.title || "Book an appointment";
  const pageDescription = site.description || "";

  if (hasHostedCustomHtml) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        {renderHostedCustomHtmlTemplate({
          html: hostedBookingPage.customHtml,
          textTokens: {
            BUSINESS_NAME: businessName,
            PAGE_TITLE: pageTitle,
            PAGE_DESCRIPTION: pageDescription,
            SITE_HANDLE: site.slug,
          },
          runtimeTokens: { [BOOKING_APP_TOKEN]: bookingApp },
          fallback: bookingApp,
        })}
      </div>
    );
  }

  if (hasHostedBlocks) {
    return (
      <div className="min-h-screen bg-[#f8fafc]">
        <div className="mx-auto max-w-6xl px-6 py-10">
          {renderCreditFunnelBlocks({ blocks: hostedBlocks, basePath: "", context: { hostedRuntimeBlocks: { bookingApp } } })}
        </div>
      </div>
    );
  }

  return <PublicBookingClient target={{ kind: "calendar", ownerId: String(site.ownerId), calendarId }} />;
}
