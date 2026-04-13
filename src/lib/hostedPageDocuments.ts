import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { coerceBlocksJson, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { blocksToCustomHtmlDocument } from "@/lib/funnelBlocksToCustomHtmlDocument";
import type { PortalServiceKey } from "@/lib/portalPermissions.shared";
import { getReviewRequestsServiceData } from "@/lib/reviewRequests";

export type HostedPageService = "BOOKING" | "NEWSLETTER" | "REVIEWS" | "BLOGS";
export type HostedPageDocumentStatus = "DRAFT" | "PUBLISHED";
export type HostedPageEditorMode = "MARKDOWN" | "BLOCKS" | "CUSTOM_HTML";

export type HostedPageServiceKey = Lowercase<HostedPageService>;

export type HostedPageSeo = {
  title: string | null;
  description: string | null;
};

export type HostedPageDocumentDto = {
  id: string;
  ownerId: string;
  service: HostedPageService;
  pageKey: string;
  title: string;
  slug: string | null;
  status: HostedPageDocumentStatus;
  contentMarkdown: string;
  editorMode: HostedPageEditorMode;
  blocksJson: CreditFunnelBlock[];
  customHtml: string;
  customChatJson: unknown;
  themeJson: unknown;
  dataBindingsJson: unknown;
  seo: HostedPageSeo;
  createdAt: Date;
  updatedAt: Date;
};

export type HostedPagePreviewPayload = {
  service: HostedPageService;
  pageKey: string;
  businessName: string;
  siteHandle: string | null;
  primaryUrl: string | null;
  runtimeTokens: string[];
  summary: Record<string, unknown>;
};

type HostedPageDefaultSeed = {
  pageKey: string;
  title: string;
  slug: string | null;
  editorMode: HostedPageEditorMode;
  contentMarkdown: string;
  blocksJson: CreditFunnelBlock[];
  customHtml: string;
  customChatJson?: unknown;
  themeJson?: unknown;
  dataBindingsJson?: unknown;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

const CONTAINER_WIDTH = 1120;
const SOFT_BG = "rgba(255,255,255,0.74)";
const SOFT_ACCENT = "rgba(37,99,235,0.12)";

function normalizeTitle(value: unknown, fallback: string) {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.slice(0, 160) || fallback;
}

function normalizeSlug(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return null;
  const slug = raw
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return slug || null;
}

function normalizeSeoText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, maxLength);
  return text || null;
}

export function parseHostedPageService(value: unknown): HostedPageService | null {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  switch (raw) {
    case "BOOKING":
      return "BOOKING";
    case "NEWSLETTER":
      return "NEWSLETTER";
    case "REVIEWS":
      return "REVIEWS";
    case "BLOGS":
      return "BLOGS";
    default:
      return null;
  }
}

export function hostedPageServiceLabel(service: HostedPageService) {
  switch (service) {
    case "BOOKING":
      return "booking";
    case "NEWSLETTER":
      return "newsletter";
    case "REVIEWS":
      return "reviews";
    case "BLOGS":
      return "blogs";
  }
}

export function portalServiceKeyForHostedPageService(service: HostedPageService): PortalServiceKey {
  switch (service) {
    case "BOOKING":
      return "booking";
    case "NEWSLETTER":
      return "newsletter";
    case "REVIEWS":
      return "reviews";
    case "BLOGS":
      return "blogs";
    default:
      return "blogs";
  }
}

function sectionBlock(
  id: string,
  opts: {
    anchorId?: string;
    heading: string;
    body: string;
    primaryCta?: { text: string; href: string };
    secondaryCta?: { text: string; href: string };
  },
): CreditFunnelBlock {
  const children: CreditFunnelBlock[] = [
    {
      id: `${id}-heading`,
      type: "heading",
      props: {
        level: 1,
        text: opts.heading,
        style: { fontSizePx: 42, marginBottomPx: 12, maxWidthPx: 760 } as any,
      },
    },
    {
      id: `${id}-body`,
      type: "paragraph",
      props: {
        text: opts.body,
        style: { fontSizePx: 17, marginBottomPx: 18, maxWidthPx: 760 } as any,
      },
    },
  ];

  if (opts.primaryCta || opts.secondaryCta) {
    children.push({
      id: `${id}-ctas`,
      type: "columns",
      props: {
        gapPx: 14,
        stackOnMobile: true,
        columns: [
          {
            markdown: "",
            children: [
              ...(opts.primaryCta
                ? [
                    {
                      id: `${id}-primary`,
                      type: "button" as const,
                      props: {
                        text: opts.primaryCta.text,
                        href: opts.primaryCta.href,
                      },
                    },
                  ]
                : []),
              ...(opts.secondaryCta
                ? [
                    {
                      id: `${id}-secondary`,
                      type: "button" as const,
                      props: {
                        text: opts.secondaryCta.text,
                        href: opts.secondaryCta.href,
                        variant: "secondary" as const,
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
        style: { marginTopPx: 6 } as any,
      },
    });
  }

  return {
    id,
    type: "section",
    props: {
      anchorId: opts.anchorId,
      layout: "one",
      children,
      style: {
        maxWidthPx: CONTAINER_WIDTH,
        paddingPx: 36,
        borderRadiusPx: 28,
        backgroundColor: SOFT_BG,
        borderColor: SOFT_ACCENT,
        borderWidthPx: 1,
      } as any,
    },
  };
}

function featuresColumns(id: string, items: string[]): CreditFunnelBlock {
  return {
    id,
    type: "columns",
    props: {
      gapPx: 16,
      stackOnMobile: true,
      columns: items.map((item, index) => ({
        markdown: `### ${index + 1}\n${item}`,
        style: {
          paddingPx: 18,
          borderRadiusPx: 20,
          backgroundColor: "rgba(255,255,255,0.92)",
          borderColor: SOFT_ACCENT,
          borderWidthPx: 1,
        } as any,
      })),
    },
  };
}

function withPageBlock(blocks: CreditFunnelBlock[]): CreditFunnelBlock[] {
  return [
    {
      id: "page",
      type: "page",
      props: {
        style: {
          backgroundColor: "#f7f9fc",
          textColor: "#0f172a",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        },
      },
    },
    ...blocks,
  ];
}

function bookingDefaults(): HostedPageDefaultSeed[] {
  return [
    {
      pageKey: "booking_main",
      title: "Booking page",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        sectionBlock("booking-hero", {
          anchorId: "top",
          heading: "Book time with us in minutes",
          body:
            "Choose the best time, answer a few quick questions, and lock in your appointment without the back-and-forth.",
          primaryCta: { text: "Book now", href: "#calendar" },
          secondaryCta: { text: "What to expect", href: "#details" },
        }),
        { id: "booking-space-1", type: "spacer", props: { height: 28 } },
        featuresColumns("booking-features", [
          "Display your scheduling promise, meeting type, and what happens after someone books.",
          "Pair this layout with live booking settings, calendars, reminders, and question config.",
          "Use block mode for layout and let runtime data bindings power the live calendar and form.",
        ]),
      ]),
      customHtml: "",
      dataBindingsJson: { runtime: "booking_main_v1", sections: ["hero", "calendar", "form", "thank_you"] },
      seoTitle: "Book an appointment",
      seoDescription: "Schedule time with our team online.",
    },
  ];
}

function reviewsDefaults(): HostedPageDefaultSeed[] {
  return [
    {
      pageKey: "reviews_home",
      title: "Reviews page",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        sectionBlock("reviews-hero", {
          anchorId: "top",
          heading: "Share your experience",
          body:
            "Invite customers to leave a thoughtful review, highlight your best feedback, and keep the page aligned with your brand.",
          primaryCta: { text: "Leave a review", href: "#review-form" },
          secondaryCta: { text: "See recent reviews", href: "#recent-reviews" },
        }),
        { id: "reviews-space-1", type: "spacer", props: { height: 28 } },
        featuresColumns("reviews-features", [
          "Render recent reviews, average rating, and gallery content from live review data.",
          "Keep review request settings and destinations in the service APIs while layout stays editable here.",
          "Use custom HTML only when you need a bespoke visual layer on top of the same live review payload.",
        ]),
      ]),
      customHtml: "",
      dataBindingsJson: { runtime: "reviews_home_v1", sections: ["hero", "review_list", "review_form", "gallery"] },
      seoTitle: "Customer reviews",
      seoDescription: "Read and share customer reviews.",
    },
  ];
}

function newsletterDefaults(): HostedPageDefaultSeed[] {
  return [
    {
      pageKey: "newsletter_home",
      title: "Newsletter home",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        sectionBlock("newsletter-hero", {
          anchorId: "top",
          heading: "Stay in the loop",
          body:
            "Give visitors a clear reason to subscribe, preview your latest updates, and keep signups focused on one clean hosted page.",
          primaryCta: { text: "Join the list", href: "#signup" },
          secondaryCta: { text: "Browse editions", href: "#archive" },
        }),
        { id: "newsletter-space-1", type: "spacer", props: { height: 28 } },
        featuresColumns("newsletter-features", [
          "Highlight your value proposition, archive, and signup form with editable sections.",
          "Keep newsletter issues and automation flows in the existing newsletter APIs.",
          "Support both brand-safe blocks and advanced custom HTML when a more editorial design is needed.",
        ]),
      ]),
      customHtml: "",
      dataBindingsJson: { runtime: "newsletter_home_v1", sections: ["hero", "signup", "archive"] },
      seoTitle: "Newsletter",
      seoDescription: "Subscribe to our newsletter and browse recent updates.",
    },
  ];
}

function blogsDefaults(): HostedPageDefaultSeed[] {
  return [
    {
      pageKey: "blogs_index",
      title: "Blog home",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        sectionBlock("blogs-hero", {
          anchorId: "top",
          heading: "Insights worth reading",
          body:
            "Feature your latest posts, keep your archive clean, and shape the blog home around your brand instead of a one-size-fits-all settings screen.",
          primaryCta: { text: "Read the latest", href: "#posts" },
          secondaryCta: { text: "Subscribe", href: "#newsletter" },
        }),
        { id: "blogs-space-1", type: "spacer", props: { height: 28 } },
        featuresColumns("blogs-features", [
          "Use the hosted layout to control the blog index while post content remains in blog post records.",
          "Render featured posts, categories later, and newsletter signup sections from live blog data.",
          "Keep blog automation and post publishing exactly where they are today.",
        ]),
      ]),
      customHtml: "",
      dataBindingsJson: { runtime: "blogs_index_v1", sections: ["hero", "featured_post", "post_list", "newsletter_cta"] },
      seoTitle: "Blog",
      seoDescription: "Read our latest blog posts and updates.",
    },
    {
      pageKey: "blogs_post_template",
      title: "Blog post template",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        sectionBlock("blogs-post-hero", {
          anchorId: "top",
          heading: "Article title",
          body:
            "This template defines how individual hosted blog posts should look around the live article content and calls to action.",
          primaryCta: { text: "Back to blog", href: "#back" },
        }),
        { id: "blogs-post-space-1", type: "spacer", props: { height: 24 } },
        {
          id: "blogs-post-content-note",
          type: "paragraph",
          props: {
            text: "The live post body, metadata, and related links should be injected by runtime bindings when this template is rendered.",
            style: { maxWidthPx: 820, fontSizePx: 16 } as any,
          },
        },
      ]),
      customHtml: "",
      dataBindingsJson: { runtime: "blogs_post_template_v1", sections: ["post_header", "post_body", "related_posts", "cta"] },
      seoTitle: "Blog post",
      seoDescription: "Hosted blog post layout template.",
    },
  ];
}

function defaultSeedsForService(service: HostedPageService): HostedPageDefaultSeed[] {
  switch (service) {
    case "BOOKING":
      return bookingDefaults();
    case "NEWSLETTER":
      return newsletterDefaults();
    case "REVIEWS":
      return reviewsDefaults();
    case "BLOGS":
      return blogsDefaults();
    default:
      return reviewsDefaults();
  }
}

function defaultSeedForPage(service: HostedPageService, pageKey: string) {
  return defaultSeedsForService(service).find((seed) => seed.pageKey === pageKey) ?? null;
}

function toDto(row: {
  id: string;
  ownerId: string;
  service: HostedPageService;
  pageKey: string;
  title: string;
  slug: string | null;
  status: HostedPageDocumentStatus;
  contentMarkdown: string;
  editorMode: HostedPageEditorMode;
  blocksJson: unknown;
  customHtml: string;
  customChatJson: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  themeJson: unknown;
  dataBindingsJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}): HostedPageDocumentDto {
  return {
    id: row.id,
    ownerId: row.ownerId,
    service: row.service,
    pageKey: row.pageKey,
    title: row.title,
    slug: row.slug,
    status: row.status,
    contentMarkdown: row.contentMarkdown,
    editorMode: row.editorMode,
    blocksJson: coerceBlocksJson(row.blocksJson),
    customHtml: row.customHtml,
    customChatJson: row.customChatJson,
    themeJson: row.themeJson,
    dataBindingsJson: row.dataBindingsJson,
    seo: {
      title: row.seoTitle,
      description: row.seoDescription,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const documentSelect = {
  id: true,
  ownerId: true,
  service: true,
  pageKey: true,
  title: true,
  slug: true,
  status: true,
  contentMarkdown: true,
  editorMode: true,
  blocksJson: true,
  customHtml: true,
  customChatJson: true,
  seoTitle: true,
  seoDescription: true,
  themeJson: true,
  dataBindingsJson: true,
  createdAt: true,
  updatedAt: true,
} as const;

function createInputFromSeed(ownerId: string, service: HostedPageService, seed: HostedPageDefaultSeed) {
  return {
    owner: { connect: { id: ownerId } },
    service,
    pageKey: seed.pageKey,
    title: seed.title,
    slug: seed.slug,
    status: "DRAFT",
    contentMarkdown: seed.contentMarkdown,
    editorMode: seed.editorMode,
    blocksJson: seed.blocksJson as unknown as Prisma.InputJsonValue,
    customHtml: seed.customHtml,
    customChatJson: (seed.customChatJson ?? undefined) as Prisma.InputJsonValue | undefined,
    seoTitle: seed.seoTitle ?? null,
    seoDescription: seed.seoDescription ?? null,
    themeJson: (seed.themeJson ?? undefined) as Prisma.InputJsonValue | undefined,
    dataBindingsJson: (seed.dataBindingsJson ?? undefined) as Prisma.InputJsonValue | undefined,
  };
}

export async function bootstrapHostedPageDocuments(ownerId: string, service: HostedPageService) {
  const cleanOwnerId = String(ownerId || "").trim();
  if (!cleanOwnerId) return [] as HostedPageDocumentDto[];

  const seeds = defaultSeedsForService(service);
  for (const seed of seeds) {
    await (prisma as any).hostedPageDocument.upsert({
      where: {
        ownerId_service_pageKey: {
          ownerId: cleanOwnerId,
          service,
          pageKey: seed.pageKey,
        },
      },
      create: createInputFromSeed(cleanOwnerId, service, seed),
      update: {},
      select: { id: true },
    });
  }

  return listHostedPageDocuments(cleanOwnerId, service);
}

export async function listHostedPageDocuments(ownerId: string, service: HostedPageService) {
  const rows = await (prisma as any).hostedPageDocument.findMany({
    where: { ownerId, service },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: documentSelect,
  });
  return rows.map(toDto);
}

export async function listAllHostedPageDocuments(ownerId: string) {
  const rows = await (prisma as any).hostedPageDocument.findMany({
    where: { ownerId },
    orderBy: [{ service: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: documentSelect,
  });
  return rows.map(toDto);
}

export async function getHostedPageDocument(ownerId: string, documentId: string) {
  const row = await (prisma as any).hostedPageDocument.findFirst({
    where: { id: documentId, ownerId },
    select: documentSelect,
  });
  return row ? toDto(row) : null;
}

export async function getHostedPageDocumentByPageKey(ownerId: string, service: HostedPageService, pageKey: string) {
  const cleanPageKey = String(pageKey || "").trim();
  if (!cleanPageKey) return null;

  const row = await (prisma as any).hostedPageDocument.findFirst({
    where: { ownerId, service, pageKey: cleanPageKey },
    select: documentSelect,
  });
  return row ? toDto(row) : null;
}

export async function updateHostedPageDocument(
  ownerId: string,
  documentId: string,
  patch: {
    title?: unknown;
    slug?: unknown;
    status?: unknown;
    contentMarkdown?: unknown;
    editorMode?: unknown;
    blocksJson?: unknown;
    customHtml?: unknown;
    customChatJson?: unknown;
    themeJson?: unknown;
    dataBindingsJson?: unknown;
    seo?: { title?: unknown; description?: unknown } | null;
  },
) {
  const existing = await (prisma as any).hostedPageDocument.findFirst({
    where: { id: documentId, ownerId },
    select: documentSelect,
  });
  if (!existing) return null;

  const data: Record<string, unknown> = {};

  if (patch.title !== undefined) data.title = normalizeTitle(patch.title, existing.title);
  if (patch.slug !== undefined) data.slug = normalizeSlug(patch.slug);
  if (patch.contentMarkdown !== undefined && typeof patch.contentMarkdown === "string") data.contentMarkdown = patch.contentMarkdown;
  if (patch.customHtml !== undefined && typeof patch.customHtml === "string") data.customHtml = patch.customHtml;
  if (patch.blocksJson !== undefined) data.blocksJson = coerceBlocksJson(patch.blocksJson) as unknown as Prisma.InputJsonValue;
  if (patch.customChatJson !== undefined) data.customChatJson = patch.customChatJson as Prisma.InputJsonValue;
  if (patch.themeJson !== undefined) data.themeJson = patch.themeJson as Prisma.InputJsonValue;
  if (patch.dataBindingsJson !== undefined) data.dataBindingsJson = patch.dataBindingsJson as Prisma.InputJsonValue;

  if (patch.editorMode !== undefined && typeof patch.editorMode === "string") {
    const mode = patch.editorMode.trim().toUpperCase();
    if (mode === "MARKDOWN" || mode === "BLOCKS" || mode === "CUSTOM_HTML") {
      data.editorMode = mode as HostedPageEditorMode;
    }
  }

  if (patch.status !== undefined && typeof patch.status === "string") {
    const status = patch.status.trim().toUpperCase();
    if (status === "DRAFT" || status === "PUBLISHED") {
      data.status = status as HostedPageDocumentStatus;
    }
  }

  if (patch.seo !== undefined) {
    data.seoTitle = patch.seo ? normalizeSeoText(patch.seo.title, 160) : null;
    data.seoDescription = patch.seo ? normalizeSeoText(patch.seo.description, 320) : null;
  }

  const updated = await (prisma as any).hostedPageDocument.update({
    where: { id: documentId },
    data,
    select: documentSelect,
  });

  return toDto(updated);
}

export async function exportHostedPageDocumentCustomHtml(opts: {
  ownerId: string;
  documentId: string;
  title?: string;
  blocksJson?: unknown;
  setEditorMode?: "BLOCKS" | "CUSTOM_HTML";
  basePath?: string;
}) {
  const existing = await (prisma as any).hostedPageDocument.findFirst({
    where: { id: opts.documentId, ownerId: opts.ownerId },
    select: documentSelect,
  });
  if (!existing) return null;

  const blocksFromClient = coerceBlocksJson(opts.blocksJson);
  const blocks = blocksFromClient.length ? blocksFromClient : coerceBlocksJson(existing.blocksJson);

  const html = blocksToCustomHtmlDocument({
    blocks,
    pageId: existing.id,
    ownerId: opts.ownerId,
    basePath: opts.basePath || "",
    title: opts.title || existing.title || "Hosted page",
  });

  const updated = await (prisma as any).hostedPageDocument.update({
    where: { id: existing.id },
    data: {
      ...(blocksFromClient.length ? { blocksJson: blocksFromClient as unknown as Prisma.InputJsonValue } : null),
      customHtml: html,
      ...(opts.setEditorMode ? { editorMode: opts.setEditorMode } : null),
    },
    select: documentSelect,
  });

  return { html, document: toDto(updated) };
}

export async function setHostedPageDocumentStatus(ownerId: string, documentId: string, status: HostedPageDocumentStatus) {
  return updateHostedPageDocument(ownerId, documentId, { status });
}

export async function resetHostedPageDocumentToDefault(ownerId: string, documentId: string) {
  const existing = await (prisma as any).hostedPageDocument.findFirst({
    where: { id: documentId, ownerId },
    select: documentSelect,
  });
  if (!existing) return null;

  const seed = defaultSeedForPage(existing.service, existing.pageKey);
  if (!seed) return null;

  const updated = await (prisma as any).hostedPageDocument.update({
    where: { id: existing.id },
    data: {
      title: seed.title,
      slug: seed.slug,
      contentMarkdown: seed.contentMarkdown,
      editorMode: seed.editorMode,
      blocksJson: seed.blocksJson as unknown as Prisma.InputJsonValue,
      customHtml: seed.customHtml,
      customChatJson: (seed.customChatJson ?? []) as Prisma.InputJsonValue,
      themeJson: (seed.themeJson ?? null) as Prisma.InputJsonValue | null,
      dataBindingsJson: (seed.dataBindingsJson ?? null) as Prisma.InputJsonValue | null,
      seoTitle: seed.seoTitle ?? null,
      seoDescription: seed.seoDescription ?? null,
      status: "DRAFT",
    },
    select: documentSelect,
  });

  return toDto(updated);
}

export async function getHostedPagePreviewData(ownerId: string, documentId: string): Promise<HostedPagePreviewPayload | null> {
  const document = await getHostedPageDocument(ownerId, documentId);
  if (!document) return null;

  const profile = await prisma.businessProfile.findUnique({
    where: { ownerId },
    select: { businessName: true },
  });

  const businessName = String(profile?.businessName || document.title || hostedPageServiceLabel(document.service)).trim();

  if (document.service === "BOOKING") {
    const [site, calendarCount] = await Promise.all([
      prisma.portalBookingSite.findUnique({
        where: { ownerId },
        select: { slug: true, title: true, description: true, enabled: true, durationMinutes: true, timeZone: true },
      }),
      (prisma as any).portalBookingCalendar.count({ where: { ownerId } }).catch(() => 0),
    ]);

    const siteHandle = site?.slug ?? null;
    return {
      service: document.service,
      pageKey: document.pageKey,
      businessName,
      siteHandle,
      primaryUrl: siteHandle ? `/book/${siteHandle}` : null,
      runtimeTokens: ["{{BOOKING_APP}}"],
      summary: {
        title: site?.title ?? null,
        description: site?.description ?? null,
        enabled: Boolean(site?.enabled),
        durationMinutes: site?.durationMinutes ?? null,
        timeZone: site?.timeZone ?? null,
        calendarCount,
      },
    };
  }

  if (document.service === "NEWSLETTER") {
    const site = await prisma.clientBlogSite.findUnique({
      where: { ownerId },
      select: { id: true, slug: true, name: true, primaryDomain: true },
    });
    const [externalCount, internalCount, latest] = await Promise.all([
      prisma.clientNewsletter.count({ where: { siteId: site?.id ?? "", kind: "EXTERNAL" } as any }).catch(() => 0),
      prisma.clientNewsletter.count({ where: { siteId: site?.id ?? "", kind: "INTERNAL" } as any }).catch(() => 0),
      site?.id
        ? prisma.clientNewsletter.findMany({
            where: { siteId: site.id },
            orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
            take: 3,
            select: { title: true, slug: true, kind: true },
          })
        : Promise.resolve([] as Array<{ title: string; slug: string; kind: string }>),
    ]);
    const siteHandle = site?.slug ?? null;
    return {
      service: document.service,
      pageKey: document.pageKey,
      businessName,
      siteHandle,
      primaryUrl: siteHandle ? `/${siteHandle}/newsletters` : null,
      runtimeTokens: ["{{NEWSLETTER_ARCHIVE}}"],
      summary: {
        siteName: site?.name ?? null,
        primaryDomain: site?.primaryDomain ?? null,
        externalCount,
        internalCount,
        latest,
      },
    };
  }

  if (document.service === "REVIEWS") {
    const [data, bookingSite, blogSite, reviewCount] = await Promise.all([
      getReviewRequestsServiceData(ownerId).catch(() => null),
      prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { slug: true, title: true } }).catch(() => null),
      prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { slug: true, name: true } }).catch(() => null),
      (prisma as any).portalReview.count({ where: { ownerId, archivedAt: null } }).catch(() => 0),
    ]);
    const siteHandle = blogSite?.slug ?? bookingSite?.slug ?? null;
    return {
      service: document.service,
      pageKey: document.pageKey,
      businessName,
      siteHandle,
      primaryUrl: siteHandle ? `/${siteHandle}/reviews` : null,
      runtimeTokens: ["{{REVIEWS_APP}}"],
      summary: {
        publicPageEnabled: Boolean(data?.settings?.publicPage?.enabled),
        destinationCount: Array.isArray(data?.settings?.destinations) ? data.settings.destinations.length : 0,
        reviewCount,
        title: data?.settings?.publicPage?.title ?? null,
        description: data?.settings?.publicPage?.description ?? null,
      },
    };
  }

  const site = await prisma.clientBlogSite.findUnique({
    where: { ownerId },
    select: { id: true, slug: true, name: true, primaryDomain: true },
  });
  const [postCount, latestPosts] = await Promise.all([
    prisma.clientBlogPost.count({ where: { siteId: site?.id ?? "", status: "PUBLISHED", archivedAt: null } as any }).catch(() => 0),
    site?.id
      ? prisma.clientBlogPost.findMany({
          where: { siteId: site.id, status: "PUBLISHED", archivedAt: null },
          orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
          take: 3,
          select: { title: true, slug: true, publishedAt: true, updatedAt: true },
        })
      : Promise.resolve([] as Array<{ title: string; slug: string; publishedAt: Date | null; updatedAt: Date }>),
  ]);
  const siteHandle = site?.slug ?? null;
  const runtimeTokens = document.pageKey === "blogs_post_template" ? ["{{BLOG_POST_BODY}}"] : ["{{BLOGS_ARCHIVE}}"];
  return {
    service: document.service,
    pageKey: document.pageKey,
    businessName,
    siteHandle,
    primaryUrl: siteHandle ? `/${siteHandle}/blogs` : null,
    runtimeTokens,
    summary: {
      siteName: site?.name ?? null,
      primaryDomain: site?.primaryDomain ?? null,
      postCount,
      latestPosts,
    },
  };
}

export function getDefaultHostedPagePrompt(service: HostedPageService, currentDocument?: HostedPageDocumentDto | null) {
  const serviceLabel = hostedPageServiceLabel(service);
  const runtimeGuidance = (() => {
    if (service === "REVIEWS") {
      return "For reviews pages, you may embed the live interactive reviews app with {{REVIEWS_APP}}. You may also use {{BUSINESS_NAME}}, {{PAGE_TITLE}}, {{PAGE_DESCRIPTION}}, and {{SITE_HANDLE}} for copy placeholders.";
    }
    if (service === "BOOKING") {
      return "For booking pages, you may embed the live booking experience with {{BOOKING_APP}}. You may also use {{BUSINESS_NAME}}, {{PAGE_TITLE}}, {{PAGE_DESCRIPTION}}, and {{SITE_HANDLE}} for copy placeholders.";
    }
    if (service === "NEWSLETTER") {
      return "For newsletter pages, you may embed the live archive with {{NEWSLETTER_ARCHIVE}}. You may also use {{BUSINESS_NAME}}, {{PAGE_TITLE}}, {{PAGE_DESCRIPTION}}, and {{SITE_HANDLE}} for copy placeholders.";
    }
    if (service === "BLOGS" && currentDocument?.pageKey === "blogs_post_template") {
      return "For blog post templates, you may embed the live article with {{BLOG_POST_BODY}}. You may also use {{BUSINESS_NAME}}, {{PAGE_TITLE}}, {{PAGE_DESCRIPTION}}, and {{SITE_HANDLE}} for copy placeholders.";
    }
    if (service === "BLOGS") {
      return "For blog index pages, you may embed the live archive with {{BLOGS_ARCHIVE}}. You may also use {{BUSINESS_NAME}}, {{PAGE_TITLE}}, {{PAGE_DESCRIPTION}}, and {{SITE_HANDLE}} for copy placeholders.";
    }
    return null;
  })();
  return [
    `You are generating hosted ${serviceLabel} page content for the portal editor.`,
    "Return accurate, production-safe custom HTML that matches the requested design and preserves business intent.",
    "When a request can be represented with supported blocks instead of raw HTML, prefer describing it as structured sections and layout intent before falling back to custom HTML.",
    "Assume live runtime bindings will supply dynamic business data such as reviews, calendars, blog posts, newsletter issues, and form state.",
    runtimeGuidance,
    currentDocument ? `Current page title: ${currentDocument.title}. Current page key: ${currentDocument.pageKey}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
