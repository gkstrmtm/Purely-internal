import type { Metadata } from "next";

import { headers } from "next/headers";
import { notFound } from "next/navigation";

import DomainRouterBlogPostPage from "@/app/domain-router/[domain]/blogs/[postSlug]/page";
import DomainRouterBlogsPage from "@/app/domain-router/[domain]/blogs/page";
import { generateMetadata as generateDomainRouterBlogPostMetadata } from "@/app/domain-router/[domain]/blogs/[postSlug]/page";
import { generateMetadata as generateDomainRouterBlogsMetadata } from "@/app/domain-router/[domain]/blogs/page";
import DomainRouterBookingCalendarPage from "@/app/domain-router/[domain]/book/u/[ownerId]/[calendarId]/page";
import DomainRouterBookingPage from "@/app/domain-router/[domain]/book/[slug]/page";
import { generateMetadata as generateDomainRouterBookingCalendarMetadata } from "@/app/domain-router/[domain]/book/u/[ownerId]/[calendarId]/page";
import { generateMetadata as generateDomainRouterBookingMetadata } from "@/app/domain-router/[domain]/book/[slug]/page";
import DomainRouterChatbotEmbedPage from "@/app/domain-router/[domain]/embed/chatbot/page";
import DomainRouterInternalNewsletterPage from "@/app/domain-router/[domain]/internal-newsletters/[newsletterSlug]/page";
import DomainRouterInternalNewslettersPage from "@/app/domain-router/[domain]/internal-newsletters/page";
import { generateMetadata as generateDomainRouterInternalNewsletterMetadata } from "@/app/domain-router/[domain]/internal-newsletters/[newsletterSlug]/page";
import { generateMetadata as generateDomainRouterInternalNewslettersMetadata } from "@/app/domain-router/[domain]/internal-newsletters/page";
import DomainRouterNewsletterPage from "@/app/domain-router/[domain]/newsletters/[newsletterSlug]/page";
import DomainRouterNewslettersPage from "@/app/domain-router/[domain]/newsletters/page";
import { generateMetadata as generateDomainRouterNewsletterMetadata } from "@/app/domain-router/[domain]/newsletters/[newsletterSlug]/page";
import { generateMetadata as generateDomainRouterNewslettersMetadata } from "@/app/domain-router/[domain]/newsletters/page";
import DomainRouterNotFound from "@/app/domain-router/[domain]/not-found";
import DomainRouterReviewsPage from "@/app/domain-router/[domain]/reviews/page";
import DomainRouterCatchallPage, { generateMetadata as generateDomainRouterCatchallMetadata } from "@/app/domain-router/[domain]/[[...path]]/page";
import { generateMetadata as generateDomainRouterReviewsMetadata } from "@/app/domain-router/[domain]/reviews/page";
import { buildCustomDomainNotFoundMetadata, hostnameFromHeader, isPlatformHostname } from "@/lib/customDomainMetadata";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function domainParams(host: string) {
  return { domain: encodeURIComponent(host) };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ path: string[] }>;
}): Promise<Metadata> {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;
  if (!host || isPlatformHostname(host)) return {};

  const { path } = await params;

  if (path[0] === "reviews") {
    if (path.length === 1) return generateDomainRouterReviewsMetadata({ params: Promise.resolve(domainParams(host)) });
    return buildCustomDomainNotFoundMetadata(host);
  }

  if (path[0] === "blogs") {
    if (path.length === 1) return generateDomainRouterBlogsMetadata({ params: Promise.resolve(domainParams(host)) });
    if (path.length === 2) {
      return generateDomainRouterBlogPostMetadata({
        params: Promise.resolve({ ...domainParams(host), postSlug: path[1] }),
      });
    }
    return buildCustomDomainNotFoundMetadata(host);
  }

  if (path[0] === "newsletters") {
    if (path.length === 1) return generateDomainRouterNewslettersMetadata({ params: Promise.resolve(domainParams(host)) });
    if (path.length === 2) {
      return generateDomainRouterNewsletterMetadata({
        params: Promise.resolve({ ...domainParams(host), newsletterSlug: path[1] }),
      });
    }
    return buildCustomDomainNotFoundMetadata(host);
  }

  if (path[0] === "internal-newsletters") {
    if (path.length === 1) {
      return generateDomainRouterInternalNewslettersMetadata({ params: Promise.resolve(domainParams(host)) });
    }
    if (path.length === 2) {
      return generateDomainRouterInternalNewsletterMetadata({
        params: Promise.resolve({ ...domainParams(host), newsletterSlug: path[1] }),
      });
    }
    return buildCustomDomainNotFoundMetadata(host);
  }

  if (path[0] === "book") {
    if (path.length === 2) {
      return generateDomainRouterBookingMetadata({
        params: Promise.resolve({ ...domainParams(host), slug: path[1] }),
      });
    }
    if (path.length === 4 && path[1] === "u") {
      return generateDomainRouterBookingCalendarMetadata({
        params: Promise.resolve({ ...domainParams(host), ownerId: path[2], calendarId: path[3] }),
      });
    }
    return buildCustomDomainNotFoundMetadata(host);
  }

  if (path[0] === "embed") {
    return buildCustomDomainNotFoundMetadata(host);
  }

  return generateDomainRouterCatchallMetadata({
    params: Promise.resolve({ domain: encodeURIComponent(host), path }),
  });
}

export default async function CustomDomainFallbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string[] }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const h = await headers();
  const host = hostnameFromHeader(h.get("x-forwarded-host")) || hostnameFromHeader(h.get("host")) || null;
  if (isPlatformHostname(host)) notFound();

  const { path } = await params;

  if (host) {
    if (path[0] === "reviews") {
      if (path.length === 1) {
        return DomainRouterReviewsPage({
          params: Promise.resolve(domainParams(host)),
        });
      }
      return <DomainRouterNotFound />;
    }

    if (path[0] === "blogs") {
      if (path.length === 1) {
        return DomainRouterBlogsPage({
          params: Promise.resolve(domainParams(host)),
        });
      }
      if (path.length === 2) {
        return DomainRouterBlogPostPage({
          params: Promise.resolve({ ...domainParams(host), postSlug: path[1] }),
        });
      }
      return <DomainRouterNotFound />;
    }

    if (path[0] === "newsletters") {
      if (path.length === 1) {
        return DomainRouterNewslettersPage({
          params: Promise.resolve(domainParams(host)),
        });
      }
      if (path.length === 2) {
        return DomainRouterNewsletterPage({
          params: Promise.resolve({ ...domainParams(host), newsletterSlug: path[1] }),
        });
      }
      return <DomainRouterNotFound />;
    }

    if (path[0] === "internal-newsletters") {
      if (path.length === 1) {
        return DomainRouterInternalNewslettersPage({
          params: Promise.resolve(domainParams(host)),
        });
      }
      if (path.length === 2) {
        return DomainRouterInternalNewsletterPage({
          params: Promise.resolve({ ...domainParams(host), newsletterSlug: path[1] }),
        });
      }
      return <DomainRouterNotFound />;
    }

    if (path[0] === "book") {
      if (path.length === 2) {
        return DomainRouterBookingPage({
          params: Promise.resolve({ ...domainParams(host), slug: path[1] }),
        });
      }
      if (path.length === 4 && path[1] === "u") {
        return DomainRouterBookingCalendarPage({
          params: Promise.resolve({
            ...domainParams(host),
            ownerId: path[2],
            calendarId: path[3],
          }),
        });
      }
      return <DomainRouterNotFound />;
    }

    if (path[0] === "embed") {
      if (path.length === 2 && path[1] === "chatbot") {
        return DomainRouterChatbotEmbedPage({
          params: Promise.resolve(domainParams(host)),
          searchParams: Promise.resolve((await searchParams) || {}),
        });
      }
      return <DomainRouterNotFound />;
    }
  }

  return DomainRouterCatchallPage({
    params: Promise.resolve({ domain: encodeURIComponent(host || ""), path }),
    searchParams,
  });
}
