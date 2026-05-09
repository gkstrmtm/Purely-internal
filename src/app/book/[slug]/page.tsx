import { PublicBookingClient } from "@/app/book/[slug]/PublicBookingClient";
import { coerceBlocksJson, renderCreditFunnelBlocks } from "@/lib/creditFunnelBlocks";
import { buildPlatformHostedMetadata } from "@/lib/customDomainMetadata";
import { prisma } from "@/lib/db";
import { renderHostedCustomHtmlTemplate } from "@/lib/hostedPageRuntime";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BOOKING_APP_TOKEN = "{{BOOKING_APP}}";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;

  try {
    const site = await prisma.portalBookingSite.findUnique({
      where: { slug },
      select: { ownerId: true, title: true, description: true, slug: true },
    }).catch(() => null);
    if (!site?.ownerId) return {};

    const [profile, hostedBookingPage] = await Promise.all([
      prisma.businessProfile.findUnique({ where: { ownerId: site.ownerId }, select: { businessName: true, logoUrl: true } as any }).catch(() => null),
      (prisma as any).hostedPageDocument.findFirst({
        where: { ownerId: site.ownerId, service: "BOOKING", pageKey: "booking_main" },
        orderBy: { updatedAt: "desc" },
        select: { seoTitle: true, seoDescription: true },
      }).catch(() => null),
    ]);

    const businessName = (profile?.businessName || site.title || "Booking").trim();
    return buildPlatformHostedMetadata({
      siteName: businessName,
      title: String((hostedBookingPage as any)?.seoTitle || `${businessName} | Booking`).trim(),
      description: String((hostedBookingPage as any)?.seoDescription || site.description || `Book time with ${businessName}.`).trim(),
      path: `/book/${slug}`,
      imageUrl: (profile as any)?.logoUrl || null,
      keywords: [`${businessName} booking`, `${businessName} appointment`, `${businessName} schedule`],
    });
  } catch {
    return {};
  }
}

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const site = await prisma.portalBookingSite.findUnique({
    where: { slug },
    select: { ownerId: true, title: true, description: true, slug: true },
  }).catch(() => null);

  if (!site?.ownerId) {
    return <PublicBookingClient target={{ kind: "slug", slug }} />;
  }

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId: site.ownerId },
    select: { businessName: true },
  }).catch(() => null);

  const hostedBookingPage = await (prisma as any).hostedPageDocument.findFirst({
    where: { ownerId: site.ownerId, service: "BOOKING", pageKey: "booking_main" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, editorMode: true, blocksJson: true, customHtml: true },
  });

  const bookingApp = <PublicBookingClient target={{ kind: "slug", slug }} showBranding={false} embedded />;
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

  return <PublicBookingClient target={{ kind: "slug", slug }} />;
}
