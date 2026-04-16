import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { hasPublicColumn } from "@/lib/dbSchema";
import { coerceBlocksJson, type CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import { blocksToCustomHtmlDocument } from "@/lib/funnelBlocksToCustomHtmlDocument";
import { listHostedTemplateOptions } from "@/lib/hostedPageTemplateIntents";
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
const CARD_BG = "rgba(255,255,255,0.92)";
const STOCK_PHOTOS = {
  bookingHero: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=80",
  bookingShowcase: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80",
  bookingEvent: "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=80",
  bookingMinimal: "https://images.unsplash.com/photo-1497366412874-3415097a27e7?auto=format&fit=crop&w=1400&q=80",
  reviewsHero: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80",
  reviewsConcierge: "https://images.unsplash.com/photo-1515169067868-5387ec356754?auto=format&fit=crop&w=1400&q=80",
  reviewsStory: "https://images.unsplash.com/photo-1516534775068-ba3e7458af70?auto=format&fit=crop&w=1400&q=80",
  reviewsAftercare: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1400&q=80",
  reviewsBold: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1400&q=80",
  newsletterHero: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1400&q=80",
  newsletterEditorial: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1400&q=80",
  newsletterDigest: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1400&q=80",
  newsletterLaunch: "https://images.unsplash.com/photo-1516321165247-4aa89a48be28?auto=format&fit=crop&w=1400&q=80",
  newsletterCommunity: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1400&q=80",
  blogsHero: "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&w=1400&q=80",
  blogsMagazine: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1400&q=80",
  blogsMinimal: "https://images.unsplash.com/photo-1497366412874-3415097a27e7?auto=format&fit=crop&w=1400&q=80",
  blogsJournal: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80",
  blogsPost: "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=1400&q=80",
  blogsPostFeatured: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1400&q=80",
  blogsPostMinimal: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1400&q=80",
} as const;

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

function cardColumn(
  id: string,
  opts: {
    title: string;
    body: string;
    button?: { text: string; href: string };
    style?: Record<string, unknown>;
    titleStyle?: Record<string, unknown>;
    bodyStyle?: Record<string, unknown>;
  },
) {
  return {
    markdown: "",
    style: {
      paddingPx: 22,
      borderRadiusPx: 22,
      backgroundColor: CARD_BG,
      borderColor: SOFT_ACCENT,
      borderWidthPx: 1,
      ...(opts.style ?? {}),
    } as any,
    children: [
      {
        id: `${id}-title`,
        type: "heading" as const,
        props: {
          level: 3 as const,
          text: opts.title,
          style: { fontSizePx: 22, marginBottomPx: 10, ...(opts.titleStyle ?? {}) } as any,
        },
      },
      {
        id: `${id}-body`,
        type: "paragraph" as const,
        props: {
          text: opts.body,
          style: { fontSizePx: 16, marginBottomPx: opts.button ? 16 : 0, ...(opts.bodyStyle ?? {}) } as any,
        },
      },
      ...(opts.button
        ? [
            {
              id: `${id}-button`,
              type: "button" as const,
              props: { text: opts.button.text, href: opts.button.href },
            },
          ]
        : []),
    ],
  };
}

function cardsSection(
  id: string,
  opts: {
    anchorId?: string;
    heading: string;
    body: string;
    columns: Array<ReturnType<typeof cardColumn>>;
    sectionStyle?: Record<string, unknown>;
    headingStyle?: Record<string, unknown>;
    bodyStyle?: Record<string, unknown>;
  },
): CreditFunnelBlock {
  return {
    id,
    type: "section",
    props: {
      anchorId: opts.anchorId,
      layout: "one",
      children: [
        {
          id: `${id}-heading`,
          type: "heading",
          props: {
            level: 2 as const,
            text: opts.heading,
            style: { fontSizePx: 34, marginBottomPx: 10, ...(opts.headingStyle ?? {}) } as any,
          },
        },
        {
          id: `${id}-body`,
          type: "paragraph",
          props: {
            text: opts.body,
            style: { fontSizePx: 17, marginBottomPx: 22, maxWidthPx: 820, ...(opts.bodyStyle ?? {}) } as any,
          },
        },
        {
          id: `${id}-columns`,
          type: "columns",
          props: { gapPx: 18, stackOnMobile: true, columns: opts.columns },
        },
      ],
      style: {
        maxWidthPx: CONTAINER_WIDTH,
        paddingPx: 36,
        borderRadiusPx: 28,
        backgroundColor: SOFT_BG,
        borderColor: SOFT_ACCENT,
        borderWidthPx: 1,
        ...(opts.sectionStyle ?? {}),
      } as any,
    },
  };
}

function splitHeroSection(
  id: string,
  opts: {
    anchorId?: string;
    heading: string;
    body: string;
    imageSrc: string;
    imageAlt: string;
    primaryCta?: { text: string; href: string };
    secondaryCta?: { text: string; href: string };
    sectionStyle?: Record<string, unknown>;
    headingStyle?: Record<string, unknown>;
    bodyStyle?: Record<string, unknown>;
  },
): CreditFunnelBlock {
  const textChildren: CreditFunnelBlock[] = [
    {
      id: `${id}-heading`,
      type: "heading",
      props: {
        level: 1 as const,
        text: opts.heading,
        style: { fontSizePx: 48, marginBottomPx: 14, maxWidthPx: 640, ...(opts.headingStyle ?? {}) } as any,
      },
    },
    {
      id: `${id}-body`,
      type: "paragraph",
      props: {
        text: opts.body,
        style: { fontSizePx: 18, marginBottomPx: 20, maxWidthPx: 640, ...(opts.bodyStyle ?? {}) } as any,
      },
    },
  ];

  if (opts.primaryCta || opts.secondaryCta) {
    textChildren.push({
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
                ? [{ id: `${id}-primary`, type: "button" as const, props: { text: opts.primaryCta.text, href: opts.primaryCta.href } }]
                : []),
              ...(opts.secondaryCta
                ? [{ id: `${id}-secondary`, type: "button" as const, props: { text: opts.secondaryCta.text, href: opts.secondaryCta.href, variant: "secondary" as const } }]
                : []),
            ],
          },
        ],
      },
    });
  }

  return {
    id,
    type: "section",
    props: {
      anchorId: opts.anchorId,
      layout: "one",
      children: [
        {
          id: `${id}-columns`,
          type: "columns",
          props: {
            gapPx: 24,
            stackOnMobile: true,
            columns: [
              { markdown: "", children: textChildren },
              {
                markdown: "",
                children: [
                  {
                    id: `${id}-image`,
                    type: "image",
                    props: { src: opts.imageSrc, alt: opts.imageAlt, style: { borderRadiusPx: 24 } as any },
                  },
                ],
              },
            ],
          },
        },
      ],
      style: {
        maxWidthPx: CONTAINER_WIDTH,
        paddingPx: 36,
        borderRadiusPx: 32,
        backgroundColor: SOFT_BG,
        borderColor: SOFT_ACCENT,
        borderWidthPx: 1,
        ...(opts.sectionStyle ?? {}),
      } as any,
    },
  };
}

function centeredHeroSection(
  id: string,
  opts: {
    anchorId?: string;
    eyebrow?: string;
    heading: string;
    body: string;
    imageSrc?: string;
    imageAlt?: string;
    primaryCta?: { text: string; href: string };
    secondaryCta?: { text: string; href: string };
    sectionStyle?: Record<string, unknown>;
    eyebrowStyle?: Record<string, unknown>;
    headingStyle?: Record<string, unknown>;
    bodyStyle?: Record<string, unknown>;
    imageStyle?: Record<string, unknown>;
  },
): CreditFunnelBlock {
  const children: CreditFunnelBlock[] = [
    ...(opts.eyebrow
      ? [
          {
            id: `${id}-eyebrow`,
            type: "paragraph" as const,
            props: {
              text: opts.eyebrow,
              style: {
                fontSizePx: 13,
                marginBottomPx: 12,
                align: "center",
                ...(opts.eyebrowStyle ?? {}),
              } as any,
            },
          },
        ]
      : []),
    {
      id: `${id}-heading`,
      type: "heading",
      props: {
        level: 1 as const,
        text: opts.heading,
        style: {
          fontSizePx: 56,
          marginBottomPx: 14,
          maxWidthPx: 820,
          align: "center",
          ...(opts.headingStyle ?? {}),
        } as any,
      },
    },
    {
      id: `${id}-body`,
      type: "paragraph",
      props: {
        text: opts.body,
        style: {
          fontSizePx: 18,
          marginBottomPx: 22,
          maxWidthPx: 760,
          align: "center",
          ...(opts.bodyStyle ?? {}),
        } as any,
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
            style: { align: "center" } as any,
            children: [
              ...(opts.primaryCta
                ? [{ id: `${id}-primary`, type: "button" as const, props: { text: opts.primaryCta.text, href: opts.primaryCta.href } }]
                : []),
              ...(opts.secondaryCta
                ? [{ id: `${id}-secondary`, type: "button" as const, props: { text: opts.secondaryCta.text, href: opts.secondaryCta.href, variant: "secondary" as const } }]
                : []),
            ],
          },
        ],
      },
    });
  }

  if (opts.imageSrc) {
    children.push({
      id: `${id}-image`,
      type: "image",
      props: {
        src: opts.imageSrc,
        alt: opts.imageAlt,
        style: {
          marginTopPx: 26,
          borderRadiusPx: 28,
          maxWidthPx: 720,
          ...(opts.imageStyle ?? {}),
        } as any,
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
        paddingPx: 48,
        borderRadiusPx: 36,
        backgroundColor: SOFT_BG,
        borderColor: SOFT_ACCENT,
        borderWidthPx: 1,
        ...(opts.sectionStyle ?? {}),
      } as any,
    },
  };
}

function statStripSection(
  id: string,
  opts: {
    anchorId?: string;
    heading?: string;
    body?: string;
    items: Array<{ value: string; label: string; body?: string }>;
    sectionStyle?: Record<string, unknown>;
    cardStyle?: Record<string, unknown>;
    valueStyle?: Record<string, unknown>;
    labelStyle?: Record<string, unknown>;
  },
): CreditFunnelBlock {
  return {
    id,
    type: "section",
    props: {
      anchorId: opts.anchorId,
      layout: "one",
      children: [
        ...(opts.heading
          ? [
              {
                id: `${id}-heading`,
                type: "heading" as const,
                props: { level: 2 as const, text: opts.heading, style: { fontSizePx: 30, marginBottomPx: 10 } as any },
              },
            ]
          : []),
        ...(opts.body
          ? [
              {
                id: `${id}-body`,
                type: "paragraph" as const,
                props: { text: opts.body, style: { fontSizePx: 16, marginBottomPx: 18, maxWidthPx: 760 } as any },
              },
            ]
          : []),
        {
          id: `${id}-columns`,
          type: "columns",
          props: {
            gapPx: 18,
            stackOnMobile: true,
            columns: opts.items.map((item, index) => ({
              markdown: "",
              style: {
                paddingPx: 24,
                borderRadiusPx: 22,
                backgroundColor: CARD_BG,
                borderColor: SOFT_ACCENT,
                borderWidthPx: 1,
                ...(opts.cardStyle ?? {}),
              } as any,
              children: [
                {
                  id: `${id}-value-${index}`,
                  type: "heading",
                  props: {
                    level: 3 as const,
                    text: item.value,
                    style: { fontSizePx: 34, marginBottomPx: 8, ...(opts.valueStyle ?? {}) } as any,
                  },
                },
                {
                  id: `${id}-label-${index}`,
                  type: "paragraph",
                  props: {
                    text: item.label,
                    style: { fontSizePx: 16, marginBottomPx: item.body ? 8 : 0, ...(opts.labelStyle ?? {}) } as any,
                  },
                },
                ...(item.body
                  ? [
                      {
                        id: `${id}-body-${index}`,
                        type: "paragraph" as const,
                        props: { text: item.body, style: { fontSizePx: 14 } as any },
                      },
                    ]
                  : []),
              ],
            })),
          },
        },
      ],
      style: {
        maxWidthPx: CONTAINER_WIDTH,
        paddingPx: 32,
        borderRadiusPx: 28,
        backgroundColor: SOFT_BG,
        borderColor: SOFT_ACCENT,
        borderWidthPx: 1,
        ...(opts.sectionStyle ?? {}),
      } as any,
    },
  };
}

function twoPanelSection(
  id: string,
  opts: {
    anchorId?: string;
    leftChildren: CreditFunnelBlock[];
    rightChildren: CreditFunnelBlock[];
    sectionStyle?: Record<string, unknown>;
    leftStyle?: Record<string, unknown>;
    rightStyle?: Record<string, unknown>;
    gapPx?: number;
  },
): CreditFunnelBlock {
  return {
    id,
    type: "section",
    props: {
      anchorId: opts.anchorId,
      layout: "two",
      leftChildren: opts.leftChildren,
      rightChildren: opts.rightChildren,
      gapPx: opts.gapPx ?? 24,
      stackOnMobile: true,
      style: {
        maxWidthPx: CONTAINER_WIDTH,
        paddingPx: 22,
        borderRadiusPx: 32,
        backgroundColor: SOFT_BG,
        borderColor: SOFT_ACCENT,
        borderWidthPx: 1,
        ...(opts.sectionStyle ?? {}),
      } as any,
      leftStyle: {
        paddingPx: 18,
        borderRadiusPx: 24,
        backgroundColor: "rgba(255,255,255,0.3)",
        ...(opts.leftStyle ?? {}),
      } as any,
      rightStyle: {
        paddingPx: 18,
        borderRadiusPx: 24,
        backgroundColor: CARD_BG,
        ...(opts.rightStyle ?? {}),
      } as any,
    },
  };
}

function quoteBandSection(
  id: string,
  opts: {
    anchorId?: string;
    quote: string;
    attribution: string;
    button?: { text: string; href: string };
    sectionStyle?: Record<string, unknown>;
    quoteStyle?: Record<string, unknown>;
    attributionStyle?: Record<string, unknown>;
  },
): CreditFunnelBlock {
  return {
    id,
    type: "section",
    props: {
      anchorId: opts.anchorId,
      layout: "one",
      children: [
        {
          id: `${id}-quote`,
          type: "heading",
          props: {
            level: 2 as const,
            text: opts.quote,
            style: {
              fontSizePx: 34,
              marginBottomPx: 14,
              maxWidthPx: 860,
              align: "center",
              ...(opts.quoteStyle ?? {}),
            } as any,
          },
        },
        {
          id: `${id}-attribution`,
          type: "paragraph",
          props: {
            text: opts.attribution,
            style: { fontSizePx: 16, align: "center", marginBottomPx: opts.button ? 18 : 0, ...(opts.attributionStyle ?? {}) } as any,
          },
        },
        ...(opts.button
          ? [
              {
                id: `${id}-cta`,
                type: "columns" as const,
                props: {
                  columns: [
                    {
                      markdown: "",
                      style: { align: "center" } as any,
                      children: [{ id: `${id}-button`, type: "button" as const, props: { text: opts.button.text, href: opts.button.href } }],
                    },
                  ],
                },
              },
            ]
          : []),
      ],
      style: {
        maxWidthPx: CONTAINER_WIDTH,
        paddingPx: 42,
        borderRadiusPx: 32,
        backgroundColor: "#0f172a",
        textColor: "#f8fafc",
        ...(opts.sectionStyle ?? {}),
      } as any,
    },
  };
}

function hostedRuntimeSection(
  id: string,
  opts: {
    anchorId?: string;
    heading: string;
    body: string;
    blockType: "hostedBookingApp" | "hostedNewsletterArchive" | "hostedReviewsApp" | "hostedBlogsArchive" | "hostedBlogPostBody";
    sectionStyle?: Record<string, unknown>;
    headingStyle?: Record<string, unknown>;
    bodyStyle?: Record<string, unknown>;
  },
): CreditFunnelBlock {
  return {
    id,
    type: "section",
    props: {
      anchorId: opts.anchorId,
      layout: "one",
      children: [
        {
          id: `${id}-heading`,
          type: "heading",
          props: {
            level: 2 as const,
            text: opts.heading,
            style: { fontSizePx: 34, marginBottomPx: 10, ...(opts.headingStyle ?? {}) } as any,
          },
        },
        {
          id: `${id}-body`,
          type: "paragraph",
          props: {
            text: opts.body,
            style: { fontSizePx: 17, marginBottomPx: 22, maxWidthPx: 820, ...(opts.bodyStyle ?? {}) } as any,
          },
        },
        {
          id: `${id}-runtime`,
          type: opts.blockType,
          props: {
            style: { borderRadiusPx: 24 } as any,
          },
        },
      ],
      style: {
        maxWidthPx: CONTAINER_WIDTH,
        paddingPx: 36,
        borderRadiusPx: 28,
        backgroundColor: SOFT_BG,
        borderColor: SOFT_ACCENT,
        borderWidthPx: 1,
        ...(opts.sectionStyle ?? {}),
      } as any,
    },
  };
}

function withPageBlock(blocks: CreditFunnelBlock[], pageStyle?: Record<string, unknown>): CreditFunnelBlock[] {
  return [
    {
      id: "page",
      type: "page",
      props: {
        style: {
          backgroundColor: "#f7f9fc",
          textColor: "#0f172a",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          ...(pageStyle ?? {}),
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
        centeredHeroSection("booking-hero", {
          anchorId: "top",
          eyebrow: "APPOINTMENT BOOKING",
          heading: "Book your appointment in a few quick steps",
          body: "Choose a time that works for you, confirm the details, and we’ll take it from there.",
          primaryCta: { text: "Book now", href: "#calendar" },
          secondaryCta: { text: "See what happens next", href: "#details" },
          imageSrc: STOCK_PHOTOS.bookingHero,
          imageAlt: "Modern booking page preview",
          sectionStyle: { backgroundColor: "#eaf4ff", borderColor: "rgba(37,99,235,0.22)" },
          headingStyle: { fontFamily: "Avenir Next, Inter, ui-sans-serif, system-ui, sans-serif" },
          bodyStyle: { fontFamily: "Avenir Next, Inter, ui-sans-serif, system-ui, sans-serif" },
        }),
        { id: "booking-space-1", type: "spacer", props: { height: 28 } },
        statStripSection("booking-metrics", {
          anchorId: "details",
          heading: "Everything you need before you book",
          body: "Clear details, flexible scheduling, and a simple confirmation flow.",
          items: [
            { value: "24/7", label: "Self-serve scheduling", body: "Let visitors book any time without waiting on email." },
            { value: "2 min", label: "Simple booking flow", body: "Choose a time, confirm the details, and receive your confirmation." },
            { value: "1 page", label: "Everything in one place", body: "Availability, appointment details, and next steps stay together." },
          ],
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.2)" },
        }),
        { id: "booking-space-2", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("booking-runtime", {
          anchorId: "calendar",
          heading: "Available times",
          body: "Select your preferred date and time to continue.",
          blockType: "hostedBookingApp",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.18)" },
        }),
        { id: "booking-space-3", type: "spacer", props: { height: 28 } },
        twoPanelSection("booking-showcase", {
          anchorId: "details-copy",
          sectionStyle: { backgroundColor: "#dbeafe", borderColor: "rgba(37,99,235,0.18)" },
          leftStyle: { backgroundColor: "rgba(255,255,255,0.55)" },
          rightStyle: { backgroundColor: "rgba(255,255,255,0.92)" },
          leftChildren: [
            { id: "booking-showcase-heading", type: "heading", props: { level: 2 as const, text: "What visitors should feel", style: { fontSizePx: 34, marginBottomPx: 12 } as any } },
            { id: "booking-showcase-body", type: "paragraph", props: { text: "We keep the process clear from start to finish so booking feels simple, fast, and easy to trust.", style: { fontSizePx: 17, marginBottomPx: 16 } as any } },
            { id: "booking-showcase-image", type: "image", props: { src: STOCK_PHOTOS.bookingShowcase, alt: "Scheduling details", style: { borderRadiusPx: 24 } as any } },
          ],
          rightChildren: [
            { id: "booking-showcase-title", type: "heading", props: { level: 3 as const, text: "Before your visit", style: { fontSizePx: 24, marginBottomPx: 10 } as any } },
            { id: "booking-showcase-point-1", type: "paragraph", props: { text: "• Choose the service that fits your needs", style: { fontSizePx: 16, marginBottomPx: 8 } as any } },
            { id: "booking-showcase-point-2", type: "paragraph", props: { text: "• Review your appointment details before confirming", style: { fontSizePx: 16, marginBottomPx: 8 } as any } },
            { id: "booking-showcase-point-3", type: "paragraph", props: { text: "• Receive confirmation and any next steps automatically", style: { fontSizePx: 16, marginBottomPx: 0 } as any } },
          ],
        }),
      ], { backgroundColor: "#f7fbff", textColor: "#0f172a", fontFamily: "Avenir Next, Inter, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "booking_main_v1", sections: ["hero", "calendar", "form", "thank_you"] },
      seoTitle: "Book an appointment",
      seoDescription: "Schedule time with our team online.",
    },
    {
      pageKey: "booking_concierge",
      title: "Booking concierge",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        splitHeroSection("booking-concierge-hero", {
          anchorId: "top",
          heading: "Reserve a time that works best for you",
          body: "We’ll guide you through the details so you can book with confidence.",
          primaryCta: { text: "Reserve your time", href: "#calendar" },
          secondaryCta: { text: "How it works", href: "#experience" },
          imageSrc: STOCK_PHOTOS.bookingEvent,
          imageAlt: "Concierge booking page",
          sectionStyle: { backgroundColor: "#fff7ed", borderColor: "rgba(234,88,12,0.18)" },
          headingStyle: { fontFamily: "Georgia, Times New Roman, serif", fontSizePx: 56 },
          bodyStyle: { fontFamily: "Trebuchet MS, Verdana, sans-serif" },
        }),
        { id: "booking-concierge-space-1", type: "spacer", props: { height: 28 } },
        quoteBandSection("booking-concierge-quote", {
          anchorId: "experience",
          quote: "Reserve your appointment with confidence and we will handle the rest.",
          attribution: "Every appointment starts with a clear, comfortable, and well-prepared booking experience.",
          button: { text: "Continue to calendar", href: "#calendar" },
          sectionStyle: { backgroundColor: "#3b2416", textColor: "#fff7ed" },
          quoteStyle: { fontFamily: "Georgia, Times New Roman, serif" },
        }),
        { id: "booking-concierge-space-2", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("booking-concierge-runtime", {
          anchorId: "calendar",
          heading: "Reserve your appointment",
          body: "Choose your preferred date and time below.",
          blockType: "hostedBookingApp",
          sectionStyle: { backgroundColor: "#fffef9", borderColor: "rgba(180,83,9,0.16)" },
        }),
        { id: "booking-concierge-space-3", type: "spacer", props: { height: 28 } },
        cardsSection("booking-concierge-cards", {
          heading: "Before your visit",
          body: "Everything you need to know before you choose your appointment time.",
          sectionStyle: { backgroundColor: "#fffbf5", borderColor: "rgba(180,83,9,0.16)" },
          columns: [
            cardColumn("booking-concierge-card-1", { title: "Before your visit", body: "Explain how guests should prepare, what to bring, and what you already handle for them.", style: { backgroundColor: "#fff5e6" } }),
            cardColumn("booking-concierge-card-2", { title: "During the appointment", body: "Set the expectation for pace, comfort, and the level of guidance they can expect.", style: { backgroundColor: "#fffaf0" } }),
            cardColumn("booking-concierge-card-3", { title: "Aftercare and follow-up", body: "Clarify what happens next so the page feels complete instead of transactional.", style: { backgroundColor: "#fff5e6" } }),
          ],
        }),
      ], { backgroundColor: "#fffdf8", textColor: "#2c1b10", fontFamily: "Trebuchet MS, Verdana, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "booking_concierge_v1", sections: ["hero", "experience", "calendar", "follow_up"] },
      seoTitle: "Concierge booking page",
      seoDescription: "A warmer booking template with a more premium feel.",
    },
    {
      pageKey: "booking_event_night",
      title: "Booking event night",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        centeredHeroSection("booking-event-hero", {
          anchorId: "top",
          eyebrow: "LIMITED AVAILABILITY",
          heading: "Reserve your spot",
          body: "Choose a session, review the details, and secure your place before availability fills up.",
          primaryCta: { text: "Claim a slot", href: "#calendar" },
          secondaryCta: { text: "See event details", href: "#details" },
          imageSrc: STOCK_PHOTOS.bookingMinimal,
          imageAlt: "Dark event booking template",
          sectionStyle: { backgroundColor: "#111827", borderColor: "rgba(99,102,241,0.3)", textColor: "#f8fafc" },
          eyebrowStyle: { textColor: "#c7d2fe" },
          headingStyle: { textColor: "#f8fafc", fontFamily: "Arial Black, Arial, sans-serif", fontSizePx: 58 },
          bodyStyle: { textColor: "#e5e7eb", fontFamily: "Arial, Helvetica, sans-serif" },
        }),
        { id: "booking-event-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("booking-event-runtime", {
          anchorId: "calendar",
          heading: "Upcoming sessions",
          body: "Choose the date and time that works best for you.",
          blockType: "hostedBookingApp",
          sectionStyle: { backgroundColor: "#0f172a", borderColor: "rgba(129,140,248,0.24)", textColor: "#eef2ff" },
          headingStyle: { textColor: "#eef2ff" },
          bodyStyle: { textColor: "#cbd5e1" },
        }),
        { id: "booking-event-space-2", type: "spacer", props: { height: 28 } },
        statStripSection("booking-event-metrics", {
          anchorId: "details",
          items: [
            { value: "LIVE", label: "Upcoming sessions", body: "A clear schedule makes it easy to see what is available." },
            { value: "FAST", label: "Quick confirmation", body: "Select a time and complete your booking in just a few steps." },
            { value: "READY", label: "All details included", body: "Review the essentials before you confirm your visit." },
          ],
          sectionStyle: { backgroundColor: "#172554", borderColor: "rgba(129,140,248,0.3)", textColor: "#eef2ff" },
          cardStyle: { backgroundColor: "rgba(30,41,59,0.88)", borderColor: "rgba(129,140,248,0.28)" },
          valueStyle: { textColor: "#a5b4fc", fontFamily: "Arial Black, Arial, sans-serif" },
          labelStyle: { textColor: "#e2e8f0" },
        }),
      ], { backgroundColor: "#020617", textColor: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "booking_event_night_v1", sections: ["hero", "details", "calendar"] },
      seoTitle: "Event booking template",
      seoDescription: "A darker, campaign-style booking template for launches and events.",
    },
    {
      pageKey: "booking_minimal_clinic",
      title: "Booking minimal clinic",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        twoPanelSection("booking-minimal-hero", {
          anchorId: "top",
          sectionStyle: { backgroundColor: "#f8fafc", borderColor: "rgba(148,163,184,0.16)" },
          leftStyle: { backgroundColor: "#ffffff" },
          rightStyle: { backgroundColor: "#f1f5f9" },
          leftChildren: [
            { id: "booking-minimal-heading", type: "heading", props: { level: 1 as const, text: "Simple, clean, and easy to trust", style: { fontSizePx: 52, marginBottomPx: 14, fontFamily: "Helvetica Neue, Arial, sans-serif" } as any } },
            { id: "booking-minimal-body", type: "paragraph", props: { text: "Choose a time, confirm the details, and book in a clean, distraction-free flow.", style: { fontSizePx: 17, marginBottomPx: 18, fontFamily: "Helvetica Neue, Arial, sans-serif" } as any } },
            { id: "booking-minimal-primary", type: "button", props: { text: "Open calendar", href: "#calendar" } },
          ],
          rightChildren: [
            { id: "booking-minimal-image", type: "image", props: { src: STOCK_PHOTOS.bookingMinimal, alt: "Minimal booking page", style: { borderRadiusPx: 24 } as any } },
          ],
        }),
        { id: "booking-minimal-space-1", type: "spacer", props: { height: 24 } },
        hostedRuntimeSection("booking-minimal-runtime", {
          anchorId: "calendar",
          heading: "Book a time",
          body: "Select your preferred appointment and continue.",
          blockType: "hostedBookingApp",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.14)" },
        }),
        { id: "booking-minimal-space-2", type: "spacer", props: { height: 24 } },
        cardsSection("booking-minimal-cards", {
          heading: "Booking made simple",
          body: "Everything you need to book without the extra noise.",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.14)" },
          columns: [
            cardColumn("booking-minimal-card-1", { title: "Clear availability", body: "Lead quickly into times, durations, and any required intake steps.", style: { backgroundColor: "#ffffff" } }),
            cardColumn("booking-minimal-card-2", { title: "Quiet visual system", body: "Neutral color and straightforward type make this feel more clinical and precise.", style: { backgroundColor: "#f8fafc" } }),
            cardColumn("booking-minimal-card-3", { title: "Best for repeat clients", body: "Ideal when the audience already trusts the brand and wants speed over storytelling.", style: { backgroundColor: "#ffffff" } }),
          ],
        }),
      ], { backgroundColor: "#fcfdff", textColor: "#0f172a", fontFamily: "Helvetica Neue, Arial, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "booking_minimal_clinic_v1", sections: ["hero", "calendar", "details"] },
      seoTitle: "Minimal booking page",
      seoDescription: "A clean, minimal hosted booking template.",
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
        centeredHeroSection("reviews-hero", {
          anchorId: "top",
          eyebrow: "CLIENT REVIEWS",
          heading: "Reviews from our clients",
          body: "See what clients are saying and share your experience with us.",
          primaryCta: { text: "Leave a review", href: "#review-form" },
          secondaryCta: { text: "See recent reviews", href: "#recent-reviews" },
          imageSrc: STOCK_PHOTOS.reviewsHero,
          imageAlt: "Reviews showcase",
          sectionStyle: { backgroundColor: "#dbeafe", borderColor: "rgba(59,130,246,0.2)" },
          headingStyle: { fontFamily: "Avenir Next, Inter, ui-sans-serif, system-ui, sans-serif" },
          bodyStyle: { fontFamily: "Avenir Next, Inter, ui-sans-serif, system-ui, sans-serif" },
        }),
        { id: "reviews-space-1", type: "spacer", props: { height: 28 } },
        statStripSection("reviews-metrics", {
          anchorId: "recent-reviews",
          items: [
            { value: "4.9", label: "Average rating signal", body: "Show the quality cue before the visitor reads a single review." },
            { value: "Real", label: "Verified reviews", body: "Recent feedback from people who have worked with us." },
            { value: "Fast", label: "Quick to submit", body: "Share your feedback in just a few steps." },
          ],
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.18)" },
        }),
        { id: "reviews-space-2", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("reviews-runtime", {
          anchorId: "review-form",
          heading: "Recent reviews",
          body: "Browse recent feedback or leave a review of your own.",
          blockType: "hostedReviewsApp",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.18)" },
        }),
        { id: "reviews-space-3", type: "spacer", props: { height: 28 } },
        cardsSection("reviews-features", {
          heading: "Why clients keep coming back",
          body: "Reliable service, clear communication, and a consistently positive experience.",
          columns: [
            cardColumn("reviews-features-1", { title: "Thoughtful service", body: "Clients appreciate clear communication and a smooth experience from start to finish.", style: { backgroundColor: "#eff6ff" } }),
            cardColumn("reviews-features-2", { title: "Trusted results", body: "Recent feedback reflects the care, quality, and consistency behind every visit.", style: { backgroundColor: "#ffffff" } }),
            cardColumn("reviews-features-3", { title: "Easy to share", body: "Leaving a review is simple whether you are sharing a quick note or a detailed experience.", style: { backgroundColor: "#eff6ff" } }),
          ],
        }),
      ], { backgroundColor: "#f7fbff", textColor: "#0f172a", fontFamily: "Avenir Next, Inter, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "reviews_home_v1", sections: ["hero", "review_list", "review_form", "gallery"] },
      seoTitle: "Customer reviews",
      seoDescription: "Read and share customer reviews.",
    },
    {
      pageKey: "reviews_concierge",
      title: "Reviews concierge",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        splitHeroSection("reviews-concierge-hero", {
          anchorId: "top",
          heading: "Kind words from our clients",
          body: "We’re grateful for every review and every client who takes the time to share their experience.",
          primaryCta: { text: "Read the latest feedback", href: "#proof" },
          secondaryCta: { text: "Leave a review", href: "#review-form" },
          imageSrc: STOCK_PHOTOS.reviewsConcierge,
          imageAlt: "Premium reviews page",
          sectionStyle: { backgroundColor: "#fff8ef", borderColor: "rgba(180,83,9,0.16)" },
          headingStyle: { fontFamily: "Playfair Display, Georgia, serif", fontSizePx: 54 },
          bodyStyle: { fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif" },
        }),
        { id: "reviews-concierge-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("reviews-concierge-runtime", {
          anchorId: "review-form",
          heading: "Client feedback",
          body: "Read recent reviews or leave a review after your visit.",
          blockType: "hostedReviewsApp",
          sectionStyle: { backgroundColor: "#fffef9", borderColor: "rgba(180,83,9,0.16)" },
        }),
        { id: "reviews-concierge-space-2", type: "spacer", props: { height: 28 } },
        cardsSection("reviews-concierge-proof", {
          anchorId: "proof",
          heading: "What clients mention most",
          body: "Warm service, thoughtful care, and an experience that feels personal from start to finish.",
          sectionStyle: { backgroundColor: "#fffbf5", borderColor: "rgba(180,83,9,0.16)" },
          columns: [
            cardColumn("reviews-concierge-proof-1", { title: "Refined first impression", body: "Use softer color, more editorial typography, and a stronger image-led hero." }),
            cardColumn("reviews-concierge-proof-2", { title: "High-trust presentation", body: "Give recent feedback more breathing room so every review feels more intentional." }),
            cardColumn("reviews-concierge-proof-3", { title: "Easy next step", body: "Keep the leave-a-review action present without making the page feel overly transactional." }),
          ],
        }),
      ], { backgroundColor: "#fffdf8", textColor: "#241b12", fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "reviews_concierge_v1", sections: ["hero", "proof", "review_form"] },
      seoTitle: "Premium customer reviews",
      seoDescription: "A softer, more elevated hosted reviews template.",
    },
    {
      pageKey: "reviews_story_wall",
      title: "Reviews story wall",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        splitHeroSection("reviews-story-hero", {
          anchorId: "top",
          heading: "Stories from the people we serve",
          body: "Every review tells part of the story. Read recent experiences and share your own.",
          primaryCta: { text: "See the highlights", href: "#stories" },
          secondaryCta: { text: "Add your review", href: "#review-form" },
          imageSrc: STOCK_PHOTOS.reviewsStory,
          imageAlt: "Editorial reviews page",
          sectionStyle: { backgroundColor: "#f5f3ff", borderColor: "rgba(124,58,237,0.16)" },
          headingStyle: { fontFamily: "Libre Baskerville, Georgia, serif", fontSizePx: 50 },
          bodyStyle: { fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif" },
        }),
        { id: "reviews-story-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("reviews-story-runtime", {
          anchorId: "review-form",
          heading: "Recent stories and reviews",
          body: "Browse recent feedback and leave a review whenever you are ready.",
          blockType: "hostedReviewsApp",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(124,58,237,0.16)" },
        }),
        { id: "reviews-story-space-2", type: "spacer", props: { height: 28 } },
        cardsSection("reviews-story-cards", {
          anchorId: "stories",
          heading: "What people appreciate",
          body: "Consistent service, clear communication, and a personal experience that clients remember.",
          sectionStyle: { backgroundColor: "#f6f2ff", borderColor: "rgba(124,58,237,0.16)" },
          columns: [
            cardColumn("reviews-story-cards-1", { title: "Story-led social proof", body: "Frame customer feedback as memorable experiences, not just short snippets." }),
            cardColumn("reviews-story-cards-2", { title: "Thoughtful care", body: "Clients remember the details, the communication, and the way they were treated." }),
            cardColumn("reviews-story-cards-3", { title: "Still ready for runtime data", body: "Recent reviews can still populate dynamically while the presentation feels more thoughtful." }),
          ],
        }),
      ], { backgroundColor: "#fcfcff", textColor: "#1f1b2d", fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "reviews_story_wall_v1", sections: ["hero", "stories", "review_form"] },
      seoTitle: "Customer stories and reviews",
      seoDescription: "An editorial-style hosted reviews template focused on customer stories.",
    },
    {
      pageKey: "reviews_aftercare",
      title: "Reviews aftercare",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        quoteBandSection("reviews-aftercare-band", {
          anchorId: "top",
          quote: "Thank you for taking the time to share your experience.",
          attribution: "Thank you for trusting us. If you would like to share your experience, we would love to hear from you.",
          button: { text: "Write a review", href: "#review-form" },
          sectionStyle: { backgroundColor: "#0f172a", textColor: "#f8fafc" },
          quoteStyle: { fontFamily: "Georgia, Times New Roman, serif", fontSizePx: 38 },
        }),
        { id: "reviews-aftercare-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("reviews-aftercare-runtime", {
          anchorId: "review-form",
          heading: "Share your feedback",
          body: "Read recent reviews or leave a review after your appointment.",
          blockType: "hostedReviewsApp",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(51,65,85,0.18)" },
        }),
        { id: "reviews-aftercare-space-2", type: "spacer", props: { height: 28 } },
        twoPanelSection("reviews-aftercare-panel", {
          anchorId: "follow-up",
          sectionStyle: { backgroundColor: "#e2e8f0", borderColor: "rgba(51,65,85,0.18)" },
          leftStyle: { backgroundColor: "#ffffff" },
          rightStyle: { backgroundColor: "#cbd5e1" },
          leftChildren: [
            { id: "reviews-aftercare-heading", type: "heading", props: { level: 1 as const, text: "Make the review ask feel considerate", style: { fontSizePx: 48, marginBottomPx: 14, fontFamily: "Georgia, Times New Roman, serif" } as any } },
            { id: "reviews-aftercare-body", type: "paragraph", props: { text: "Your feedback helps future clients know what to expect and helps us continue improving the experience we provide.", style: { fontSizePx: 17, marginBottomPx: 16 } as any } },
            { id: "reviews-aftercare-button", type: "button", props: { text: "Leave your feedback", href: "#review-form" } },
          ],
          rightChildren: [
            { id: "reviews-aftercare-image", type: "image", props: { src: STOCK_PHOTOS.reviewsAftercare, alt: "Aftercare review theme", style: { borderRadiusPx: 24, marginBottomPx: 14 } as any } },
            { id: "reviews-aftercare-note", type: "paragraph", props: { text: "We appreciate every note, recommendation, and review shared after a visit.", style: { fontSizePx: 15 } as any } },
          ],
        }),
      ], { backgroundColor: "#f8fafc", textColor: "#0f172a", fontFamily: "Helvetica Neue, Arial, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "reviews_aftercare_v1", sections: ["hero", "review_list", "review_form"] },
      seoTitle: "Aftercare reviews page",
      seoDescription: "A calmer hosted reviews template for thoughtful feedback collection.",
    },
    {
      pageKey: "reviews_bold_wall",
      title: "Reviews bold wall",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        centeredHeroSection("reviews-bold-hero", {
          anchorId: "top",
          eyebrow: "REAL FEEDBACK",
          heading: "Real reviews. Real experiences. Real results.",
          body: "See what clients are saying and add your own review after your visit.",
          primaryCta: { text: "See top reviews", href: "#proof" },
          secondaryCta: { text: "Add yours", href: "#review-form" },
          imageSrc: STOCK_PHOTOS.reviewsBold,
          imageAlt: "Bold reviews page",
          sectionStyle: { backgroundColor: "#111827", borderColor: "rgba(168,85,247,0.28)", textColor: "#faf5ff" },
          eyebrowStyle: { textColor: "#d8b4fe" },
          headingStyle: { textColor: "#faf5ff", fontFamily: "Arial Black, Arial, sans-serif" },
          bodyStyle: { textColor: "#f5d0fe", fontFamily: "Arial, Helvetica, sans-serif" },
        }),
        { id: "reviews-bold-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("reviews-bold-runtime", {
          anchorId: "review-form",
          heading: "Top reviews",
          body: "Browse recent feedback and leave a review of your own.",
          blockType: "hostedReviewsApp",
          sectionStyle: { backgroundColor: "#2e1065", borderColor: "rgba(216,180,254,0.24)", textColor: "#faf5ff" },
          headingStyle: { textColor: "#faf5ff" },
          bodyStyle: { textColor: "#e9d5ff" },
        }),
        { id: "reviews-bold-space-2", type: "spacer", props: { height: 28 } },
        statStripSection("reviews-bold-metrics", {
          anchorId: "proof",
          items: [
            { value: "Top", label: "Recent praise", body: "See the latest feedback from clients we have served." },
            { value: "Fast", label: "Quick to read", body: "Scan the highlights before diving into the full reviews." },
            { value: "Easy", label: "Simple to share", body: "Leave a review in just a few steps after your visit." },
          ],
          sectionStyle: { backgroundColor: "#4c1d95", borderColor: "rgba(216,180,254,0.28)", textColor: "#faf5ff" },
          cardStyle: { backgroundColor: "rgba(91,33,182,0.72)", borderColor: "rgba(233,213,255,0.22)" },
          valueStyle: { textColor: "#f5d0fe", fontFamily: "Arial Black, Arial, sans-serif" },
          labelStyle: { textColor: "#faf5ff" },
        }),
      ], { backgroundColor: "#1f0937", textColor: "#faf5ff", fontFamily: "Arial, Helvetica, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "reviews_bold_wall_v1", sections: ["hero", "proof", "review_form"] },
      seoTitle: "Bold social proof reviews page",
      seoDescription: "A louder, high-contrast hosted reviews template.",
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
        splitHeroSection("newsletter-hero", {
          anchorId: "top",
          heading: "Stay in the loop",
          body: "Subscribe for updates, announcements, and new stories from our team.",
          primaryCta: { text: "Join the list", href: "#signup" },
          secondaryCta: { text: "Browse editions", href: "#archive" },
          imageSrc: STOCK_PHOTOS.newsletterHero,
          imageAlt: "Newsletter home",
          sectionStyle: { backgroundColor: "#eef6ff", borderColor: "rgba(37,99,235,0.18)" },
        }),
        { id: "newsletter-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("newsletter-runtime", {
          anchorId: "archive",
          heading: "Recent editions",
          body: "Browse the latest issues and catch up on recent updates.",
          blockType: "hostedNewsletterArchive",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.18)" },
        }),
        { id: "newsletter-space-2", type: "spacer", props: { height: 28 } },
        cardsSection("newsletter-features", {
          heading: "What you can expect",
          body: "Thoughtful updates, practical ideas, and the latest news delivered on a regular schedule.",
          columns: [
            cardColumn("newsletter-features-1", { title: "Clear value proposition", body: "Highlight your value proposition, archive, and signup form with editable sections." }),
            cardColumn("newsletter-features-2", { title: "Connected to your sends", body: "Keep newsletter issues and automation flows in the existing newsletter APIs." }),
            cardColumn("newsletter-features-3", { title: "Room for personality", body: "Support both brand-safe blocks and advanced custom HTML when a more editorial design is needed." }),
          ],
        }),
      ], { backgroundColor: "#f6fbff", textColor: "#0f172a", fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "newsletter_home_v1", sections: ["hero", "signup", "archive"] },
      seoTitle: "Newsletter",
      seoDescription: "Subscribe to our newsletter and browse recent updates.",
    },
    {
      pageKey: "newsletter_editorial",
      title: "Newsletter editorial",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        splitHeroSection("newsletter-editorial-hero", {
          anchorId: "top",
          heading: "A newsletter people look forward to opening",
          body: "Subscribe for thoughtful updates, stories, and announcements from our team.",
          primaryCta: { text: "Subscribe now", href: "#signup" },
          secondaryCta: { text: "Preview issues", href: "#archive" },
          imageSrc: STOCK_PHOTOS.newsletterEditorial,
          imageAlt: "Editorial newsletter",
          sectionStyle: { backgroundColor: "#fff8ef", borderColor: "rgba(180,83,9,0.16)" },
          headingStyle: { fontFamily: "Playfair Display, Georgia, serif", fontSizePx: 54 },
          bodyStyle: { fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif" },
        }),
        { id: "newsletter-editorial-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("newsletter-editorial-runtime", {
          anchorId: "archive",
          heading: "Latest issues",
          body: "Browse recent editions and catch up on past updates.",
          blockType: "hostedNewsletterArchive",
          sectionStyle: { backgroundColor: "#fffef9", borderColor: "rgba(180,83,9,0.16)" },
        }),
        { id: "newsletter-editorial-space-2", type: "spacer", props: { height: 28 } },
        cardsSection("newsletter-editorial-features", {
          anchorId: "signup",
          heading: "Inside each edition",
          body: "New stories, useful updates, and a closer look at what is happening across the business.",
          columns: [
            cardColumn("newsletter-editorial-features-1", { title: "Editorial typography", body: "A serif headline changes the tone of the whole page immediately." }),
            cardColumn("newsletter-editorial-features-2", { title: "Softer palette", body: "Warm neutrals make the page feel more like a publication and less like a utility screen." }),
            cardColumn("newsletter-editorial-features-3", { title: "Thoughtful perspective", body: "A closer look at the ideas, stories, and updates worth spending time with." }),
          ],
        }),
      ], { backgroundColor: "#fffdf8", textColor: "#241b12", fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "newsletter_editorial_v1", sections: ["hero", "signup", "archive"] },
      seoTitle: "Editorial newsletter signup",
      seoDescription: "A richer, more editorial hosted newsletter template.",
    },
    {
      pageKey: "newsletter_digest",
      title: "Newsletter digest",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        splitHeroSection("newsletter-digest-hero", {
          anchorId: "top",
          heading: "Get the weekly digest",
          body: "Get a quick roundup of updates, highlights, and new releases each week.",
          primaryCta: { text: "Join the digest", href: "#signup" },
          secondaryCta: { text: "Read recent issues", href: "#archive" },
          imageSrc: STOCK_PHOTOS.newsletterDigest,
          imageAlt: "Digest newsletter",
          sectionStyle: { backgroundColor: "#f0fdf4", borderColor: "rgba(34,197,94,0.16)" },
          headingStyle: { fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif" },
          bodyStyle: { fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif" },
        }),
        { id: "newsletter-digest-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("newsletter-digest-runtime", {
          anchorId: "archive",
          heading: "Weekly updates",
          body: "Read recent issues and stay up to date.",
          blockType: "hostedNewsletterArchive",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(34,197,94,0.16)" },
        }),
        { id: "newsletter-digest-space-2", type: "spacer", props: { height: 28 } },
        cardsSection("newsletter-digest-features", {
          anchorId: "signup",
          heading: "What subscribers get",
          body: "A clean roundup of recent updates, helpful insights, and new content.",
          columns: [
            cardColumn("newsletter-digest-features-1", { title: "Shorter promise", body: "Lead with clarity around the cadence, content, and why the emails are worth opening." }),
            cardColumn("newsletter-digest-features-2", { title: "Modern type system", body: "A cleaner sans-serif stack makes the page feel more current and product-like." }),
            cardColumn("newsletter-digest-features-3", { title: "Quick to read", body: "Catch up fast with a concise summary of what is new and what is next." }),
          ],
        }),
      ], { backgroundColor: "#fbfffc", textColor: "#0f172a", fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "newsletter_digest_v1", sections: ["hero", "signup", "archive"] },
      seoTitle: "Weekly newsletter digest",
      seoDescription: "A concise hosted newsletter template focused on weekly updates.",
    },
    {
      pageKey: "newsletter_launchpad",
      title: "Newsletter launchpad",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        centeredHeroSection("newsletter-launchpad-hero", {
          anchorId: "top",
          eyebrow: "LATEST ANNOUNCEMENTS",
          heading: "Make the signup page feel like a product launch",
          body: "Subscribe for launch updates, product news, and first-look announcements.",
          primaryCta: { text: "Join now", href: "#signup" },
          secondaryCta: { text: "Why subscribe", href: "#reasons" },
          imageSrc: STOCK_PHOTOS.newsletterLaunch,
          imageAlt: "Launch newsletter theme",
          sectionStyle: { backgroundColor: "#0f172a", borderColor: "rgba(56,189,248,0.26)", textColor: "#e0f2fe" },
          eyebrowStyle: { textColor: "#7dd3fc" },
          headingStyle: { textColor: "#f8fafc", fontFamily: "Arial Black, Arial, sans-serif", fontSizePx: 58 },
          bodyStyle: { textColor: "#cbd5e1", fontFamily: "Arial, Helvetica, sans-serif" },
        }),
        { id: "newsletter-launchpad-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("newsletter-launchpad-runtime", {
          anchorId: "archive",
          heading: "Launch updates",
          body: "Catch up on recent releases, announcements, and campaign updates.",
          blockType: "hostedNewsletterArchive",
          sectionStyle: { backgroundColor: "#082f49", borderColor: "rgba(125,211,252,0.22)", textColor: "#e0f2fe" },
          headingStyle: { textColor: "#f0f9ff" },
          bodyStyle: { textColor: "#bae6fd" },
        }),
        { id: "newsletter-launchpad-space-2", type: "spacer", props: { height: 28 } },
        cardsSection("newsletter-launchpad-cards", {
          anchorId: "reasons",
          heading: "What you will receive",
          body: "Early announcements, launch news, and timely updates whenever something new goes live.",
          sectionStyle: { backgroundColor: "#082f49", borderColor: "rgba(125,211,252,0.22)", textColor: "#e0f2fe" },
          headingStyle: { textColor: "#f0f9ff" },
          bodyStyle: { textColor: "#bae6fd" },
          columns: [
            cardColumn("newsletter-launchpad-card-1", { title: "Bolder headline rhythm", body: "Built to stop the scroll and convert colder traffic faster.", style: { backgroundColor: "rgba(12,74,110,0.88)", borderColor: "rgba(125,211,252,0.2)" }, titleStyle: { textColor: "#f0f9ff" }, bodyStyle: { textColor: "#e0f2fe" } }),
            cardColumn("newsletter-launchpad-card-2", { title: "Stronger campaign tone", body: "More suitable for launches, waitlists, and announcement sequences.", style: { backgroundColor: "rgba(14,116,144,0.88)", borderColor: "rgba(125,211,252,0.2)" }, titleStyle: { textColor: "#f0f9ff" }, bodyStyle: { textColor: "#e0f2fe" } }),
            cardColumn("newsletter-launchpad-card-3", { title: "First to know", body: "Be the first to hear about upcoming releases, special announcements, and major updates.", style: { backgroundColor: "rgba(8,47,73,0.92)", borderColor: "rgba(125,211,252,0.2)" }, titleStyle: { textColor: "#f0f9ff" }, bodyStyle: { textColor: "#e0f2fe" } }),
          ],
        }),
      ], { backgroundColor: "#020617", textColor: "#e0f2fe", fontFamily: "Arial, Helvetica, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "newsletter_launchpad_v1", sections: ["hero", "signup", "archive"] },
      seoTitle: "Newsletter launch signup",
      seoDescription: "A higher-energy hosted newsletter template for campaigns and launches.",
    },
    {
      pageKey: "newsletter_community",
      title: "Newsletter community",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        twoPanelSection("newsletter-community-hero", {
          anchorId: "top",
          sectionStyle: { backgroundColor: "#ecfdf5", borderColor: "rgba(22,163,74,0.16)" },
          leftStyle: { backgroundColor: "#ffffff" },
          rightStyle: { backgroundColor: "#d1fae5" },
          leftChildren: [
            { id: "newsletter-community-heading", type: "heading", props: { level: 1 as const, text: "A warmer, community-led signup page", style: { fontSizePx: 50, marginBottomPx: 14, fontFamily: "Georgia, Times New Roman, serif" } as any } },
            { id: "newsletter-community-body", type: "paragraph", props: { text: "Subscribe for updates, stories, and notes shared with our community.", style: { fontSizePx: 17, marginBottomPx: 16 } as any } },
            { id: "newsletter-community-primary", type: "button", props: { text: "Join the community", href: "#signup" } },
          ],
          rightChildren: [
            { id: "newsletter-community-image", type: "image", props: { src: STOCK_PHOTOS.newsletterCommunity, alt: "Community newsletter", style: { borderRadiusPx: 24, marginBottomPx: 14 } as any } },
            { id: "newsletter-community-note", type: "paragraph", props: { text: "Stories, updates, and thoughtful notes shared on a regular cadence.", style: { fontSizePx: 15 } as any } },
          ],
        }),
        { id: "newsletter-community-space-1", type: "spacer", props: { height: 24 } },
        hostedRuntimeSection("newsletter-community-runtime", {
          anchorId: "archive",
          heading: "Recent notes",
          body: "Browse the latest editions and read past updates from the archive.",
          blockType: "hostedNewsletterArchive",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(22,163,74,0.16)" },
        }),
        { id: "newsletter-community-space-2", type: "spacer", props: { height: 24 } },
        quoteBandSection("newsletter-community-band", {
          quote: "Write like a human, show up consistently, and make subscribing feel like joining something worth hearing from.",
          attribution: "Thoughtful updates, familiar voices, and stories worth coming back for.",
          sectionStyle: { backgroundColor: "#14532d", textColor: "#ecfdf5" },
          quoteStyle: { fontFamily: "Georgia, Times New Roman, serif" },
        }),
      ], { backgroundColor: "#f7fffb", textColor: "#052e16", fontFamily: "Helvetica Neue, Arial, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "newsletter_community_v1", sections: ["hero", "signup", "archive"] },
      seoTitle: "Community newsletter signup",
      seoDescription: "A warmer hosted newsletter template with a more community-led tone.",
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
        splitHeroSection("blogs-hero", {
          anchorId: "top",
          heading: "Stories, updates, and insights",
          body: "Browse the latest articles, announcements, and resources from our team.",
          primaryCta: { text: "Read the latest", href: "#posts" },
          secondaryCta: { text: "Subscribe", href: "#newsletter" },
          imageSrc: STOCK_PHOTOS.blogsHero,
          imageAlt: "Blog home",
          sectionStyle: { backgroundColor: "#eef6ff", borderColor: "rgba(37,99,235,0.18)" },
        }),
        { id: "blogs-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("blogs-runtime", {
          anchorId: "posts",
          heading: "Latest posts",
          body: "Explore the newest articles, updates, and featured stories.",
          blockType: "hostedBlogsArchive",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.18)" },
        }),
        { id: "blogs-space-2", type: "spacer", props: { height: 28 } },
        cardsSection("blogs-features", {
          heading: "What you will find here",
          body: "Helpful articles, recent updates, and featured stories worth reading.",
          columns: [
            cardColumn("blogs-features-1", { title: "Archive control", body: "Use the hosted layout to control the blog index while post content remains in blog post records." }),
            cardColumn("blogs-features-2", { title: "Built for live data", body: "Render featured posts, categories later, and newsletter signup sections from live blog data." }),
            cardColumn("blogs-features-3", { title: "No workflow disruption", body: "Keep blog automation and post publishing exactly where they are today." }),
          ],
        }),
      ], { backgroundColor: "#f7fbff", textColor: "#0f172a", fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "blogs_index_v1", sections: ["hero", "featured_post", "post_list", "newsletter_cta"] },
      seoTitle: "Blog",
      seoDescription: "Read our latest blog posts and updates.",
    },
    {
      pageKey: "blogs_magazine",
      title: "Blog magazine",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        splitHeroSection("blogs-magazine-hero", {
          anchorId: "top",
          heading: "Featured stories and fresh perspectives",
          body: "Read the latest articles, featured stories, and updates from our business.",
          primaryCta: { text: "Explore featured posts", href: "#posts" },
          secondaryCta: { text: "Join the newsletter", href: "#newsletter" },
          imageSrc: STOCK_PHOTOS.blogsMagazine,
          imageAlt: "Magazine blog",
          sectionStyle: { backgroundColor: "#fff8ef", borderColor: "rgba(180,83,9,0.16)" },
          headingStyle: { fontFamily: "Playfair Display, Georgia, serif", fontSizePx: 54 },
          bodyStyle: { fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif" },
        }),
        { id: "blogs-magazine-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("blogs-magazine-runtime", {
          anchorId: "posts",
          heading: "Featured articles",
          body: "Browse recent stories, updates, and featured reads from the archive.",
          blockType: "hostedBlogsArchive",
          sectionStyle: { backgroundColor: "#fffef9", borderColor: "rgba(180,83,9,0.16)" },
        }),
        { id: "blogs-magazine-space-2", type: "spacer", props: { height: 28 } },
        cardsSection("blogs-magazine-features", {
          heading: "Inside the archive",
          body: "Long-form stories, featured posts, and recent updates from across the business.",
          columns: [
            cardColumn("blogs-magazine-features-1", { title: "Publication-style typography", body: "A serif headline shifts the tone immediately and gives the archive more presence." }),
            cardColumn("blogs-magazine-features-2", { title: "Warmer visual system", body: "The softer palette differentiates this clearly from the default blue-forward blog home." }),
            cardColumn("blogs-magazine-features-3", { title: "Better feature framing", body: "Use stronger cards and imagery when certain posts deserve more emphasis." }),
          ],
        }),
      ], { backgroundColor: "#fffdf8", textColor: "#241b12", fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "blogs_magazine_v1", sections: ["hero", "featured_post", "post_list", "newsletter_cta"] },
      seoTitle: "Magazine-style blog home",
      seoDescription: "A more editorial hosted blog template.",
    },
    {
      pageKey: "blogs_minimal",
      title: "Blog minimal",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        splitHeroSection("blogs-minimal-hero", {
          anchorId: "top",
          heading: "Latest articles",
          body: "A clean, focused archive for recent posts, updates, and practical resources.",
          primaryCta: { text: "Browse posts", href: "#posts" },
          secondaryCta: { text: "About the blog", href: "#about" },
          imageSrc: STOCK_PHOTOS.blogsMinimal,
          imageAlt: "Minimal blog",
          sectionStyle: { backgroundColor: "#f5f7fb", borderColor: "rgba(100,116,139,0.18)" },
          headingStyle: { fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif" },
          bodyStyle: { fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif" },
        }),
        { id: "blogs-minimal-space-1", type: "spacer", props: { height: 28 } },
        hostedRuntimeSection("blogs-minimal-runtime", {
          anchorId: "posts",
          heading: "Recent writing",
          body: "Read the latest posts and browse the archive.",
          blockType: "hostedBlogsArchive",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.14)" },
        }),
        { id: "blogs-minimal-space-2", type: "spacer", props: { height: 28 } },
        cardsSection("blogs-minimal-features", {
          anchorId: "about",
          heading: "From the archive",
          body: "Useful reads, recent updates, and practical information in one place.",
          columns: [
            cardColumn("blogs-minimal-features-1", { title: "Tighter visual rhythm", body: "A more minimal type system reduces noise and keeps the content feeling calm." }),
            cardColumn("blogs-minimal-features-2", { title: "Lower contrast palette", body: "The soft neutral background makes the page visually different from the brighter base options." }),
            cardColumn("blogs-minimal-features-3", { title: "Useful for content-heavy archives", body: "Ideal when the page needs to feel more functional without looking generic." }),
          ],
        }),
      ], { backgroundColor: "#fbfcfe", textColor: "#0f172a", fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "blogs_minimal_v1", sections: ["hero", "featured_post", "post_list", "newsletter_cta"] },
      seoTitle: "Minimal blog home",
      seoDescription: "A cleaner, more minimal hosted blog template.",
    },
    {
      pageKey: "blogs_post_template",
      title: "Blog post template",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        splitHeroSection("blogs-post-hero", {
          anchorId: "top",
          heading: "Latest article",
          body: "Read the full article below and continue with more stories from the archive.",
          primaryCta: { text: "Back to blog", href: "#back" },
          imageSrc: STOCK_PHOTOS.blogsJournal,
          imageAlt: "Blog post template",
          sectionStyle: { backgroundColor: "#eff6ff", borderColor: "rgba(37,99,235,0.18)" },
        }),
        { id: "blogs-post-space-1", type: "spacer", props: { height: 24 } },
        hostedRuntimeSection("blogs-post-runtime", {
          anchorId: "post-body",
          heading: "Article",
          body: "The full article appears below.",
          blockType: "hostedBlogPostBody",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.18)" },
        }),
        { id: "blogs-post-space-2", type: "spacer", props: { height: 24 } },
        cardsSection("blogs-post-layout", {
          anchorId: "back",
          heading: "Continue reading",
          body: "Find related stories, browse recent posts, and explore more from the archive after the article.",
          columns: [
            cardColumn("blogs-post-layout-1", { title: "More from the blog", body: "Browse recent articles and continue exploring related topics." }),
            cardColumn("blogs-post-layout-2", { title: "Related reading", body: "Discover additional posts, updates, and resources from the archive." }),
            cardColumn("blogs-post-layout-3", { title: "Stay connected", body: "Return to the blog homepage and keep reading the latest stories." }),
          ],
        }),
      ], { backgroundColor: "#f7fbff", textColor: "#0f172a", fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "blogs_post_template_v1", sections: ["post_header", "post_body", "related_posts", "cta"] },
      seoTitle: "Blog post",
      seoDescription: "Hosted blog post layout template.",
    },
    {
      pageKey: "blogs_post_featured",
      title: "Blog post featured",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        splitHeroSection("blogs-post-featured-hero", {
          anchorId: "top",
          heading: "Featured story",
          body: "Read the full story, explore related articles, and keep up with the latest updates from our team.",
          primaryCta: { text: "Back to blog", href: "#back" },
          secondaryCta: { text: "Related reading", href: "#related" },
          imageSrc: STOCK_PHOTOS.blogsPost,
          imageAlt: "Featured blog post",
          sectionStyle: { backgroundColor: "#fff7ed", borderColor: "rgba(249,115,22,0.18)" },
          headingStyle: { fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif", fontSizePx: 50 },
          bodyStyle: { fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif" },
        }),
        { id: "blogs-post-featured-space-1", type: "spacer", props: { height: 24 } },
        hostedRuntimeSection("blogs-post-featured-runtime", {
          anchorId: "post-body",
          heading: "Featured article",
          body: "Read the full story below and continue with more from the archive.",
          blockType: "hostedBlogPostBody",
          sectionStyle: { backgroundColor: "#fffef9", borderColor: "rgba(249,115,22,0.18)" },
        }),
        { id: "blogs-post-featured-space-2", type: "spacer", props: { height: 24 } },
        cardsSection("blogs-post-featured-layout", {
          anchorId: "related",
          heading: "Related reading",
          body: "Continue with more stories, recent posts, and featured updates from the archive.",
          columns: [
            cardColumn("blogs-post-featured-layout-1", { title: "Featured updates", body: "Browse more standout stories and the latest posts from our team." }),
            cardColumn("blogs-post-featured-layout-2", { title: "Recent articles", body: "Catch up on new releases, announcements, and practical reads." }),
            cardColumn("blogs-post-featured-layout-3", { title: "Back to the archive", body: "Return to the blog homepage to explore more stories." }),
          ],
        }),
      ], { backgroundColor: "#fffaf5", textColor: "#2b1d0e", fontFamily: "Space Grotesk, ui-sans-serif, system-ui, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "blogs_post_featured_v1", sections: ["post_header", "post_body", "related_posts", "cta"] },
      seoTitle: "Featured blog post template",
      seoDescription: "A stronger, more visual hosted template for featured blog posts.",
    },
    {
      pageKey: "blogs_journal",
      title: "Blog journal",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        twoPanelSection("blogs-journal-hero", {
          anchorId: "top",
          sectionStyle: { backgroundColor: "#fefce8", borderColor: "rgba(161,98,7,0.16)" },
          leftStyle: { backgroundColor: "#fffef7" },
          rightStyle: { backgroundColor: "#fef3c7" },
          leftChildren: [
            { id: "blogs-journal-heading", type: "heading", props: { level: 1 as const, text: "A journal-like home for thoughtful writing", style: { fontSizePx: 52, marginBottomPx: 14, fontFamily: "Georgia, Times New Roman, serif" } as any } },
            { id: "blogs-journal-body", type: "paragraph", props: { text: "A place for stories, reflections, updates, and thoughtful writing from our team.", style: { fontSizePx: 17, marginBottomPx: 16 } as any } },
            { id: "blogs-journal-primary", type: "button", props: { text: "Read the latest entry", href: "#posts" } },
          ],
          rightChildren: [
            { id: "blogs-journal-image", type: "image", props: { src: STOCK_PHOTOS.blogsJournal, alt: "Journal blog style", style: { borderRadiusPx: 24 } as any } },
          ],
        }),
        { id: "blogs-journal-space-1", type: "spacer", props: { height: 24 } },
        hostedRuntimeSection("blogs-journal-runtime", {
          anchorId: "posts",
          heading: "Journal entries",
          body: "Read recent posts, stories, and updates from the archive.",
          blockType: "hostedBlogsArchive",
          sectionStyle: { backgroundColor: "#fffef7", borderColor: "rgba(202,138,4,0.16)" },
        }),
        { id: "blogs-journal-space-2", type: "spacer", props: { height: 24 } },
        cardsSection("blogs-journal-cards", {
          anchorId: "posts",
          heading: "What you will find here",
          body: "Personal stories, longer reflections, and recent entries from the archive.",
          sectionStyle: { backgroundColor: "#fffdf2", borderColor: "rgba(202,138,4,0.16)" },
          columns: [
            cardColumn("blogs-journal-card-1", { title: "Reflective tone", body: "Better for essays, notes, and story-led publishing.", style: { backgroundColor: "#fffef7" } }),
            cardColumn("blogs-journal-card-2", { title: "Fresh notes", body: "Browse recent reflections, updates, and stories from across the business.", style: { backgroundColor: "#fef3c7" } }),
            cardColumn("blogs-journal-card-3", { title: "Less magazine, more notebook", body: "Good for writing-first brands that want less media polish and more intimacy.", style: { backgroundColor: "#fffef7" } }),
          ],
        }),
      ], { backgroundColor: "#fffef8", textColor: "#422006", fontFamily: "Georgia, Times New Roman, serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "blogs_journal_v1", sections: ["hero", "featured_post", "post_list", "newsletter_cta"] },
      seoTitle: "Journal-style blog home",
      seoDescription: "A warmer, more reflective hosted blog home template.",
    },
    {
      pageKey: "blogs_post_minimal",
      title: "Blog post minimal",
      slug: null,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      blocksJson: withPageBlock([
        centeredHeroSection("blogs-post-minimal-hero", {
          anchorId: "top",
          eyebrow: "FEATURED ARTICLE",
          heading: "Read the latest post",
          body: "The article appears below with quick access to related posts and the full archive.",
          primaryCta: { text: "Back to blog", href: "#back" },
          imageSrc: STOCK_PHOTOS.blogsPostMinimal,
          imageAlt: "Minimal post template",
          sectionStyle: { backgroundColor: "#f8fafc", borderColor: "rgba(148,163,184,0.16)" },
          headingStyle: { fontFamily: "Courier New, ui-monospace, monospace", fontSizePx: 50 },
          bodyStyle: { fontFamily: "Helvetica Neue, Arial, sans-serif" },
        }),
        { id: "blogs-post-minimal-space-1", type: "spacer", props: { height: 24 } },
        hostedRuntimeSection("blogs-post-minimal-runtime", {
          anchorId: "post-body",
          heading: "Article body",
          body: "Read the full post below.",
          blockType: "hostedBlogPostBody",
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.14)" },
        }),
        { id: "blogs-post-minimal-space-2", type: "spacer", props: { height: 24 } },
        statStripSection("blogs-post-minimal-strip", {
          anchorId: "back",
          items: [
            { value: "READ", label: "Focused layout", body: "A clear reading experience built around the article itself." },
            { value: "MORE", label: "Related posts", body: "Continue into more stories and recent updates after you finish." },
            { value: "BACK", label: "Archive access", body: "Jump back to the blog homepage whenever you are ready." },
          ],
          sectionStyle: { backgroundColor: "#ffffff", borderColor: "rgba(148,163,184,0.14)" },
          cardStyle: { backgroundColor: "#f8fafc" },
          valueStyle: { fontFamily: "Courier New, ui-monospace, monospace" },
        }),
      ], { backgroundColor: "#fcfdff", textColor: "#111827", fontFamily: "Helvetica Neue, Arial, sans-serif" }),
      customHtml: "",
      dataBindingsJson: { runtime: "blogs_post_minimal_v1", sections: ["post_header", "post_body", "related_posts", "cta"] },
      seoTitle: "Minimal blog post template",
      seoDescription: "A quieter hosted template for individual blog posts.",
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
    const hasBookingCalendarId = await hasPublicColumn("PortalBooking", "calendarId");
    const [site, calendarCount] = await Promise.all([
      prisma.portalBookingSite.findUnique({
        where: { ownerId },
        select: { id: true, slug: true, title: true, description: true, enabled: true, durationMinutes: true, timeZone: true },
      }),
      hasBookingCalendarId
        ? (async () => {
            const rows = await (prisma as any).portalBooking
              .findMany({
                where: { ownerId },
                select: { calendarId: true },
                distinct: ["calendarId"],
              })
              .catch(() => []);
            return Array.isArray(rows)
              ? rows.filter((row) => typeof row?.calendarId === "string" && row.calendarId.trim()).length
              : 0;
          })()
        : Promise.resolve(0),
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
            select: { title: true, slug: true, excerpt: true, sentAt: true, updatedAt: true, kind: true },
          })
        : Promise.resolve([] as Array<{ title: string; slug: string; excerpt: string | null; sentAt: Date | null; updatedAt: Date; kind: string }>),
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
    const [data, bookingSite, blogSite, reviewCount, reviews, questions] = await Promise.all([
      getReviewRequestsServiceData(ownerId).catch(() => null),
      prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { slug: true, title: true } }).catch(() => null),
      prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { slug: true, name: true } }).catch(() => null),
      (prisma as any).portalReview.count({ where: { ownerId, archivedAt: null } }).catch(() => 0),
      (prisma as any).portalReview
        .findMany({
          where: { ownerId, archivedAt: null },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            rating: true,
            name: true,
            body: true,
            photoUrls: true,
            businessReply: true,
            businessReplyAt: true,
            createdAt: true,
          },
        })
        .catch(() => []),
      (prisma as any).portalReviewQuestion
        .findMany({
          where: { ownerId, answer: { not: null } },
          orderBy: { answeredAt: "desc" },
          take: 12,
          select: { id: true, name: true, question: true, answer: true, answeredAt: true },
        })
        .catch(() => []),
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
        destinations: Array.isArray(data?.settings?.destinations) ? data.settings.destinations : [],
        thankYouMessage: data?.settings?.publicPage?.thankYouMessage ?? null,
        galleryEnabled: Boolean(data?.settings?.publicPage?.galleryEnabled ?? true),
        formConfig: data?.settings?.publicPage?.form ?? null,
        latestReviews: Array.isArray(reviews) ? reviews : [],
        latestQuestions: Array.isArray(questions) ? questions : [],
      },
    };
  }

  const site = await prisma.clientBlogSite.findUnique({
    where: { ownerId },
    select: { id: true, slug: true, name: true, primaryDomain: true },
  });
  const [postCount, latestPosts, previewPost] = await Promise.all([
    prisma.clientBlogPost.count({ where: { siteId: site?.id ?? "", status: "PUBLISHED", archivedAt: null } as any }).catch(() => 0),
    site?.id
      ? prisma.clientBlogPost.findMany({
          where: { siteId: site.id, status: "PUBLISHED", archivedAt: null },
          orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
          take: 3,
          select: { title: true, slug: true, excerpt: true, publishedAt: true, updatedAt: true },
        })
      : Promise.resolve([] as Array<{ title: string; slug: string; excerpt: string | null; publishedAt: Date | null; updatedAt: Date }>),
    site?.id
      ? prisma.clientBlogPost.findFirst({
          where: { siteId: site.id, status: "PUBLISHED", archivedAt: null },
          orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
          select: { title: true, slug: true, excerpt: true, content: true, publishedAt: true, updatedAt: true },
        })
      : Promise.resolve(null),
  ]);
  const siteHandle = site?.slug ?? null;
  const runtimeTokens = document.pageKey.startsWith("blogs_post_") ? ["{{BLOG_POST_BODY}}"] : ["{{BLOGS_ARCHIVE}}"];
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
      previewPost,
    },
  };
}

export function getDefaultHostedPagePrompt(service: HostedPageService, currentDocument?: HostedPageDocumentDto | null) {
  const serviceLabel = hostedPageServiceLabel(service);
  const templateGuide = listHostedTemplateOptions(service)
    .map((option) => `${option.pageKey}: ${option.description}`)
    .join(" | ");
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
    if (service === "BLOGS" && currentDocument?.pageKey?.startsWith("blogs_post_")) {
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
    "All copy must be publish-ready and customer-facing. Do not write meta/template/designer language, implementation notes, placeholder instructions, or awkward speculative phrasing.",
    "If the user asks for a specific style such as minimal, journal, editorial, concierge, launch, magazine, featured, bold, aftercare, or community, match the corresponding hosted template variant for that service.",
    `Available template variants: ${templateGuide}.`,
    "When a request can be represented with supported blocks instead of raw HTML, prefer describing it as structured sections and layout intent before falling back to custom HTML.",
    "Assume live runtime bindings will supply dynamic business data such as reviews, calendars, blog posts, newsletter issues, and form state.",
    runtimeGuidance,
    currentDocument ? `Current page title: ${currentDocument.title}. Current page key: ${currentDocument.pageKey}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
