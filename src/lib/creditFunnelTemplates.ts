import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";

import type { CreditFunnelTheme, CreditFunnelThemeKey } from "@/lib/creditFunnelThemes";

const SOFT_PANEL_BG = "color-mix(in srgb, currentColor 7%, transparent)";
const SOFT_PANEL_BG_STRONG = "color-mix(in srgb, currentColor 11%, transparent)";
const CONTAINER_MAX_WIDTH = 1120;

export type CreditFunnelTemplateKey =
  | "credit-audit-leadgen"
  | "credit-repair-vsl"
  | "business-credit-leadgen"
  | "consultation-booking"
  | "credit-audit-minimal"
  | "credit-audit-quiz"
  | "business-credit-snapshot"
  | "credit-repair-case-study";

export type CreditFunnelPageTemplate = {
  slug: string;
  title: string;
  sortOrder: number;
  editorMode: "BLOCKS";
  blocks: CreditFunnelBlock[];
};

export type CreditFunnelTemplate = {
  key: CreditFunnelTemplateKey;
  label: string;
  description: string;
  defaultThemeKey: CreditFunnelThemeKey;
  pages: CreditFunnelPageTemplate[];
};

function applyThemeToBlocks(blocks: CreditFunnelBlock[], theme: CreditFunnelTheme): CreditFunnelBlock[] {
  const merge = (a: any, b: any) => ({ ...(a || {}), ...(b || {}) });

  const walk = (arr: CreditFunnelBlock[]): CreditFunnelBlock[] => {
    return arr.map((b) => {
      if (!b || typeof b !== "object") return b;

      if (b.type === "section") {
        const children = Array.isArray((b.props as any).children) ? walk((b.props as any).children) : undefined;
        const leftChildren = Array.isArray((b.props as any).leftChildren) ? walk((b.props as any).leftChildren) : undefined;
        const rightChildren = Array.isArray((b.props as any).rightChildren) ? walk((b.props as any).rightChildren) : undefined;
        return {
          ...b,
          props: {
            ...(b.props as any),
            style: merge(theme.sectionStyle, (b.props as any).style),
            ...(children ? { children } : null),
            ...(leftChildren ? { leftChildren } : null),
            ...(rightChildren ? { rightChildren } : null),
          },
        } as CreditFunnelBlock;
      }

      if (b.type === "columns") {
        const cols = Array.isArray((b.props as any).columns) ? ((b.props as any).columns as any[]) : [];
        const nextCols = cols.map((c) => {
          const nextChildren = Array.isArray(c?.children) ? walk(c.children) : undefined;
          return {
            ...c,
            style: merge(theme.paragraphStyle, c?.style),
            ...(nextChildren ? { children: nextChildren } : null),
          };
        });

        return {
          ...b,
          props: {
            ...(b.props as any),
            columns: nextCols,
            style: merge(theme.paragraphStyle, (b.props as any).style),
          },
        } as CreditFunnelBlock;
      }

      if (b.type === "headerNav") {
        return {
          ...b,
          props: {
            ...(b.props as any),
            style: merge(theme.headerStyle, (b.props as any).style),
          },
        } as CreditFunnelBlock;
      }

      if (b.type === "heading") {
        return {
          ...b,
          props: {
            ...(b.props as any),
            style: merge(theme.headingStyle, (b.props as any).style),
          },
        } as CreditFunnelBlock;
      }

      if (b.type === "paragraph") {
        return {
          ...b,
          props: {
            ...(b.props as any),
            style: merge(theme.paragraphStyle, (b.props as any).style),
          },
        } as CreditFunnelBlock;
      }

      if (b.type === "button") {
        const variant = (b.props as any).variant === "secondary" ? "secondary" : "primary";
        const buttonThemeStyle = variant === "secondary" ? theme.secondaryButtonStyle : theme.primaryButtonStyle;
        return {
          ...b,
          props: {
            ...(b.props as any),
            style: merge(buttonThemeStyle, (b.props as any).style),
          },
        } as CreditFunnelBlock;
      }

      if (b.type === "formLink") {
        return {
          ...b,
          props: {
            ...(b.props as any),
            style: merge(theme.primaryButtonStyle, (b.props as any).style),
          },
        } as CreditFunnelBlock;
      }

      return {
        ...b,
        props: {
          ...(b.props as any),
          style: merge({ fontGoogleFamily: theme.pageStyle.fontGoogleFamily, fontFamily: theme.pageStyle.fontFamily }, (b.props as any).style),
        },
      } as CreditFunnelBlock;
    });
  };

  return walk(blocks);
}

export function buildCreditFunnelPagesFromTemplateAndTheme(template: CreditFunnelTemplate, theme: CreditFunnelTheme) {
  return template.pages.map((p) => {
    const themedBlocks = applyThemeToBlocks(p.blocks, theme);
    const blocksJson: CreditFunnelBlock[] = [
      { id: "page", type: "page", props: { style: theme.pageStyle } },
      ...themedBlocks,
    ];

    return {
      slug: p.slug,
      title: p.title,
      sortOrder: p.sortOrder,
      editorMode: "BLOCKS" as const,
      blocksJson,
      contentMarkdown: "",
      customHtml: "",
      customChatJson: undefined as unknown,
    };
  });
}

export const CREDIT_FUNNEL_TEMPLATES: CreditFunnelTemplate[] = [
  {
    key: "credit-audit-leadgen",
    label: "Free Credit Audit",
    description: "Lead gen landing page that drives to an intake form.",
    defaultThemeKey: "royal-indigo",
    pages: [
      {
        slug: "home",
        title: "Free Credit Audit",
        sortOrder: 0,
        editorMode: "BLOCKS",
        blocks: [
          {
            id: "nav",
            type: "headerNav",
            props: {
              sticky: true,
              transparent: false,
              size: "md",
              desktopMode: "inline",
              mobileMode: "dropdown",
              logoAlt: "Logo",
              items: [
                { id: "n1", label: "What you get", kind: "anchor", anchorId: "deliverables" },
                { id: "n2", label: "How it works", kind: "anchor", anchorId: "how" },
                { id: "n3", label: "Reviews", kind: "anchor", anchorId: "reviews" },
                { id: "n4", label: "Start", kind: "anchor", anchorId: "start" },
              ],
            },
          },
          {
            id: "hero",
            type: "section",
            props: {
              anchorId: "top",
              layout: "two",
              gapPx: 28,
              stackOnMobile: true,
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: SOFT_PANEL_BG,
              },
              leftChildren: [
                {
                  id: "badge",
                  type: "paragraph",
                  props: {
                    text: "Free 2 minute credit audit",
                    style: {
                      maxWidthPx: 260,
                      paddingPx: 10,
                      borderRadiusPx: 999,
                      backgroundColor: SOFT_PANEL_BG_STRONG,
                      align: "center",
                      fontSizePx: 13,
                      textColor: "color-mix(in srgb, currentColor 88%, transparent)",
                    },
                  },
                },
                {
                  id: "h1",
                  type: "heading",
                  props: {
                    level: 1,
                    text: "Know exactly what to fix to raise your score",
                    style: { fontSizePx: 44, marginTopPx: 12, marginBottomPx: 8, maxWidthPx: 720 } as any,
                  },
                },
                {
                  id: "p1",
                  type: "paragraph",
                  props: {
                    text:
                      "Answer a few questions and get a clear action plan: what is holding your score back, what to dispute, and what to build next.",
                    style: { fontSizePx: 17, maxWidthPx: 720, marginBottomPx: 10 } as any,
                  },
                },
                {
                  id: "bullets",
                  type: "columns",
                  props: {
                    gapPx: 14,
                    stackOnMobile: true,
                    columns: [
                      {
                        markdown:
                          "- No credit card required\n- Built for speed (2 to 3 minutes)\n- Simple next-step plan\n- Optional call if you want it",
                        style: { maxWidthPx: 560, fontSizePx: 15 } as any,
                      },
                    ],
                    style: { marginTopPx: 4 } as any,
                  },
                },
                {
                  id: "ctaRow",
                  type: "columns",
                  props: {
                    gapPx: 14,
                    stackOnMobile: true,
                    columns: [
                      {
                        markdown: "",
                        children: [
                          {
                            id: "cta1",
                            type: "formLink",
                            props: {
                              formSlug: "intake",
                              text: "Start the free audit",
                              style: { maxWidthPx: 380, marginTopPx: 10 } as any,
                            },
                          },
                        ],
                      },
                      {
                        markdown: "",
                        children: [
                          {
                            id: "cta2",
                            type: "button",
                            props: {
                              text: "Prefer to talk? Jump to booking",
                              href: "#start",
                              variant: "secondary",
                              style: { maxWidthPx: 380, marginTopPx: 10 } as any,
                            },
                          },
                        ],
                      },
                    ],
                    style: { maxWidthPx: 820 } as any,
                  },
                },
                {
                  id: "heroFinePrint",
                  type: "paragraph",
                  props: {
                    text:
                      "Not affiliated with any credit bureaus. This is educational guidance based on the information you provide.",
                    style: {
                      fontSizePx: 12,
                      maxWidthPx: 720,
                      marginTopPx: 10,
                      textColor: "color-mix(in srgb, currentColor 78%, transparent)",
                    },
                  },
                },
              ],
              rightStyle: {
                paddingPx: 22,
                borderRadiusPx: 28,
                backgroundColor: "color-mix(in srgb, currentColor 9%, transparent)",
              },
              rightChildren: [
                { id: "formH", type: "heading", props: { level: 3, text: "Start the audit" } },
                {
                  id: "formP",
                  type: "paragraph",
                  props: { text: "This form is embedded from your portal. You can swap it any time." },
                },
                {
                  id: "form",
                  type: "formEmbed",
                  props: {
                    formSlug: "intake",
                    height: 640,
                    style: { marginTopPx: 10 } as any,
                  },
                },
              ],
            },
          },
          {
            id: "trust",
            type: "columns",
            props: {
              gapPx: 14,
              stackOnMobile: true,
              style: { maxWidthPx: CONTAINER_MAX_WIDTH, marginTopPx: 18 } as any,
              columns: [
                {
                  markdown: "### 4.9/5 average rating\n\nBased on client reviews.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 18, borderRadiusPx: 22 } as any,
                },
                {
                  markdown: "### Personalized plan\n\nNo generic checklist. You get the priorities that matter for you.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 18, borderRadiusPx: 22 } as any,
                },
                {
                  markdown: "### Fast next steps\n\nKnow what to dispute, what to keep, and what to build next.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 18, borderRadiusPx: 22 } as any,
                },
              ],
            },
          },
          { id: "a_deliverables", type: "anchor", props: { anchorId: "deliverables", label: "What you get" } },
          {
            id: "deliver",
            type: "columns",
            props: {
              gapPx: 16,
              stackOnMobile: true,
              columns: [
                {
                  markdown:
                    "### What is holding your score back\n\nA clear breakdown of the biggest negative factors and what they mean.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 24 } as any,
                },
                {
                  markdown:
                    "### The disputes that matter\n\nA prioritized list of items to challenge and how to approach them.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 24 } as any,
                },
                {
                  markdown:
                    "### The builder plan\n\nWhich positive accounts to add next and why they help.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 24 } as any,
                },
              ],
              style: { maxWidthPx: CONTAINER_MAX_WIDTH, marginTopPx: 14 } as any,
            },
          },
          { id: "a_how", type: "anchor", props: { anchorId: "how", label: "How it works" } },
          {
            id: "how",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 34,
                borderRadiusPx: 30,
                backgroundColor: SOFT_PANEL_BG,
                marginTopPx: 16,
              },
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "How it works" } },
                {
                  id: "p2",
                  type: "paragraph",
                  props: {
                    text:
                      "We keep this simple. You answer a few questions, we produce a prioritized plan, and if you want help implementing it, you can book a call.",
                    style: { fontSizePx: 16, maxWidthPx: 820 } as any,
                  },
                },
                {
                  id: "steps",
                  type: "columns",
                  props: {
                    gapPx: 16,
                    stackOnMobile: true,
                    columns: [
                      {
                        markdown:
                          "### 1) Answer quick questions\n\nTell us your goal, timeline, and what you have tried so far.",
                        style: { backgroundColor: SOFT_PANEL_BG_STRONG, paddingPx: 18, borderRadiusPx: 24 } as any,
                      },
                      {
                        markdown:
                          "### 2) Get your priorities\n\nWe identify what is worth disputing now, later, or never.",
                        style: { backgroundColor: SOFT_PANEL_BG_STRONG, paddingPx: 18, borderRadiusPx: 24 } as any,
                      },
                      {
                        markdown:
                          "### 3) Build smarter\n\nAdd the right positive accounts to stabilize and grow your score.",
                        style: { backgroundColor: SOFT_PANEL_BG_STRONG, paddingPx: 18, borderRadiusPx: 24 } as any,
                      },
                    ],
                    style: { marginTopPx: 8 } as any,
                  },
                },
              ],
            },
          },
          { id: "a_reviews", type: "anchor", props: { anchorId: "reviews", label: "Reviews" } },
          {
            id: "reviews",
            type: "columns",
            props: {
              gapPx: 16,
              stackOnMobile: true,
              style: { maxWidthPx: CONTAINER_MAX_WIDTH, marginTopPx: 16 } as any,
              columns: [
                {
                  markdown:
                    "### \"Finally, a clear plan.\"\n\n\"I stopped guessing and got a checklist that actually made sense.\"\n\n**A. J.**",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 22, borderRadiusPx: 26 } as any,
                },
                {
                  markdown:
                    "### \"Quick and helpful.\"\n\n\"The priorities were spot on and saved me hours.\"\n\n**K. R.**",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 22, borderRadiusPx: 26 } as any,
                },
              ],
            },
          },
          { id: "a_faq", type: "anchor", props: { anchorId: "faq", label: "FAQ" } },
          {
            id: "faq",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 34,
                borderRadiusPx: 30,
                backgroundColor: SOFT_PANEL_BG,
                marginTopPx: 16,
              },
              markdown: [
                "## Frequently asked questions",
                "",
                "### How long does it take?",
                "Most people finish the audit in 2 to 3 minutes.",
                "",
                "### Is this a credit pull?",
                "No. We do not pull your credit report. You provide the info.",
                "",
                "### What happens after I submit?",
                "You get a prioritized plan and next steps. If you want help executing, you can book a call.",
              ].join("\n"),
            },
          },
          { id: "a_start", type: "anchor", props: { anchorId: "start", label: "Start" } },
          {
            id: "start",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: SOFT_PANEL_BG_STRONG,
                marginTopPx: 16,
              },
              children: [
                { id: "h3", type: "heading", props: { level: 2, text: "Start the free audit" } },
                {
                  id: "p3",
                  type: "paragraph",
                  props: { text: "If you prefer a call, scroll down to booking." },
                },
                { id: "cta3", type: "formLink", props: { formSlug: "intake", text: "Start now", style: { maxWidthPx: 420 } as any } },
                {
                  id: "bookingNote",
                  type: "paragraph",
                  props: {
                    text:
                      "To enable booking, add a Calendar Embed block below and connect your calendar in portal settings.",
                    style: { fontSizePx: 12, marginTopPx: 10, textColor: "color-mix(in srgb, currentColor 78%, transparent)" },
                  },
                },
                { id: "cal", type: "calendarEmbed", props: { calendarId: "", height: 760, style: { marginTopPx: 12 } as any } },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    key: "credit-repair-vsl",
    label: "Credit Repair VSL",
    description: "Video-first sales page with strong CTA sections.",
    defaultThemeKey: "platinum-blue",
    pages: [
      {
        slug: "home",
        title: "Credit Repair",
        sortOrder: 0,
        editorMode: "BLOCKS",
        blocks: [
          {
            id: "nav",
            type: "headerNav",
            props: {
              sticky: true,
              transparent: false,
              size: "md",
              desktopMode: "inline",
              mobileMode: "dropdown",
              logoAlt: "Logo",
              items: [
                { id: "n1", label: "Overview", kind: "anchor", anchorId: "overview" },
                { id: "n2", label: "What you get", kind: "anchor", anchorId: "deliverables" },
                { id: "n3", label: "Results", kind: "anchor", anchorId: "results" },
                { id: "n4", label: "Start", kind: "anchor", anchorId: "get-started" },
              ],
            },
          },
          {
            id: "hero",
            type: "section",
            props: {
              anchorId: "overview",
              layout: "two",
              gapPx: 26,
              stackOnMobile: true,
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: SOFT_PANEL_BG,
              },
              leftChildren: [
                {
                  id: "badge",
                  type: "paragraph",
                  props: {
                    text: "Watch the 3 minute overview",
                    style: {
                      maxWidthPx: 300,
                      paddingPx: 10,
                      borderRadiusPx: 999,
                      backgroundColor: SOFT_PANEL_BG_STRONG,
                      align: "center",
                      fontSizePx: 13,
                    } as any,
                  },
                },
                {
                  id: "h1",
                  type: "heading",
                  props: {
                    level: 1,
                    text: "Remove the negatives and rebuild credit faster",
                    style: { fontSizePx: 42, marginTopPx: 12, maxWidthPx: 720 } as any,
                  },
                },
                {
                  id: "p1",
                  type: "paragraph",
                  props: {
                    text:
                      "This is a simple, transparent process: identify what is hurting you most, dispute with priority, then add the right positive accounts so your score can stabilize and grow.",
                    style: { fontSizePx: 17, maxWidthPx: 720 } as any,
                  },
                },
                {
                  id: "ctaRow",
                  type: "columns",
                  props: {
                    gapPx: 14,
                    stackOnMobile: true,
                    columns: [
                      {
                        markdown: "",
                        children: [
                          {
                            id: "cta1",
                            type: "formLink",
                            props: { formSlug: "intake", text: "Start intake", style: { maxWidthPx: 340, marginTopPx: 10 } as any },
                          },
                        ],
                      },
                      {
                        markdown: "",
                        children: [
                          {
                            id: "cta2",
                            type: "button",
                            props: {
                              text: "See deliverables",
                              href: "#deliverables",
                              variant: "secondary",
                              style: { maxWidthPx: 340, marginTopPx: 10 } as any,
                            },
                          },
                        ],
                      },
                    ],
                    style: { maxWidthPx: 760 } as any,
                  },
                },
              ],
              rightStyle: {
                paddingPx: 18,
                borderRadiusPx: 28,
                backgroundColor: "color-mix(in srgb, currentColor 9%, transparent)",
              },
              rightChildren: [
                { id: "vTitle", type: "heading", props: { level: 3, text: "Quick overview" } },
                {
                  id: "v1",
                  type: "video",
                  props: {
                    src: "",
                    name: "VSL",
                    controls: true,
                    showControls: true,
                    aspectRatio: "16:9",
                    showFrame: true,
                    style: { marginTopPx: 10 } as any,
                  },
                },
                {
                  id: "vHint",
                  type: "paragraph",
                  props: {
                    text: "Tip: replace the video URL, poster, and copy to match your offer.",
                    style: { fontSizePx: 12, marginTopPx: 10, textColor: "color-mix(in srgb, currentColor 78%, transparent)" },
                  },
                },
              ],
            },
          },
          { id: "a_deliver", type: "anchor", props: { anchorId: "deliverables", label: "What you get" } },
          {
            id: "deliverables",
            type: "columns",
            props: {
              gapPx: 16,
              stackOnMobile: true,
              style: { maxWidthPx: CONTAINER_MAX_WIDTH, marginTopPx: 16 } as any,
              columns: [
                {
                  markdown: "### Prioritized dispute plan\n\nKnow which items are worth challenging first and why.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 24 } as any,
                },
                {
                  markdown: "### Builder strategy\n\nAdd the right positive accounts to lift and protect the score.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 24 } as any,
                },
                {
                  markdown: "### Simple timeline\n\nA realistic, step-by-step roadmap so you know what happens next.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 24 } as any,
                },
              ],
            },
          },
          { id: "a_results", type: "anchor", props: { anchorId: "results", label: "Results" } },
          {
            id: "results",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 34,
                borderRadiusPx: 30,
                backgroundColor: SOFT_PANEL_BG,
                marginTopPx: 16,
              },
              markdown: [
                "## What clients typically notice",
                "",
                "- Less confusion: a plan you can actually follow",
                "- Better prioritization: you focus on what moves the needle",
                "- Cleaner next steps: dispute, rebuild, then optimize",
                "",
                "### Note",
                "Results vary based on file quality, accuracy, and follow-through.",
              ].join("\n"),
            },
          },
          { id: "a_get", type: "anchor", props: { anchorId: "get-started", label: "Get started" } },
          {
            id: "get",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: SOFT_PANEL_BG_STRONG,
                marginTopPx: 16,
              },
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "Start intake" } },
                {
                  id: "p2",
                  type: "paragraph",
                  props: {
                    text:
                      "Answer a few questions so we can tailor the plan. You can always book a call after you submit.",
                  },
                },
                { id: "cta2", type: "formLink", props: { formSlug: "intake", text: "Start now", style: { maxWidthPx: 420 } as any } },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    key: "business-credit-leadgen",
    label: "Business Credit Lead Gen",
    description: "Business credit landing page with clear CTA.",
    defaultThemeKey: "graphite",
    pages: [
      {
        slug: "home",
        title: "Business Credit",
        sortOrder: 0,
        editorMode: "BLOCKS",
        blocks: [
          {
            id: "nav",
            type: "headerNav",
            props: {
              sticky: true,
              transparent: false,
              size: "md",
              desktopMode: "inline",
              mobileMode: "dropdown",
              logoAlt: "Logo",
              items: [
                { id: "n1", label: "Who it is for", kind: "anchor", anchorId: "who" },
                { id: "n2", label: "Roadmap", kind: "anchor", anchorId: "roadmap" },
                { id: "n3", label: "FAQ", kind: "anchor", anchorId: "faq" },
                { id: "n4", label: "Apply", kind: "anchor", anchorId: "apply" },
              ],
            },
          },
          {
            id: "hero",
            type: "section",
            props: {
              anchorId: "top",
              layout: "two",
              gapPx: 26,
              stackOnMobile: true,
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: SOFT_PANEL_BG,
              },
              leftChildren: [
                {
                  id: "badge",
                  type: "paragraph",
                  props: {
                    text: "Business credit and funding roadmap",
                    style: {
                      maxWidthPx: 360,
                      paddingPx: 10,
                      borderRadiusPx: 999,
                      backgroundColor: SOFT_PANEL_BG_STRONG,
                      align: "center",
                      fontSizePx: 13,
                    } as any,
                  },
                },
                {
                  id: "h1",
                  type: "heading",
                  props: {
                    level: 1,
                    text: "Build business credit without wrecking your personal profile",
                    style: { fontSizePx: 42, marginTopPx: 12, maxWidthPx: 760 } as any,
                  },
                },
                {
                  id: "p1",
                  type: "paragraph",
                  props: {
                    text:
                      "We help you structure the business correctly, build vendor lines, and follow the right sequence so approvals get easier over time.",
                    style: { fontSizePx: 17, maxWidthPx: 760 } as any,
                  },
                },
                {
                  id: "heroBullets",
                  type: "columns",
                  props: {
                    gapPx: 14,
                    stackOnMobile: true,
                    columns: [
                      {
                        markdown:
                          "- Clear steps, no guessing\n- Better approvals through sequencing\n- Designed for new and established businesses\n- Optional call after you submit",
                        style: { maxWidthPx: 600, fontSizePx: 15 } as any,
                      },
                    ],
                  },
                },
                {
                  id: "ctaRow",
                  type: "columns",
                  props: {
                    gapPx: 14,
                    stackOnMobile: true,
                    columns: [
                      {
                        markdown: "",
                        children: [
                          {
                            id: "cta1",
                            type: "formLink",
                            props: {
                              formSlug: "business-intake",
                              text: "Check eligibility",
                              style: { maxWidthPx: 360, marginTopPx: 10 } as any,
                            },
                          },
                        ],
                      },
                      {
                        markdown: "",
                        children: [
                          {
                            id: "cta2",
                            type: "button",
                            props: {
                              text: "See the roadmap",
                              href: "#roadmap",
                              variant: "secondary",
                              style: { maxWidthPx: 360, marginTopPx: 10 } as any,
                            },
                          },
                        ],
                      },
                    ],
                    style: { maxWidthPx: 760 } as any,
                  },
                },
              ],
              rightStyle: {
                paddingPx: 22,
                borderRadiusPx: 28,
                backgroundColor: "color-mix(in srgb, currentColor 9%, transparent)",
              },
              rightChildren: [
                { id: "formH", type: "heading", props: { level: 3, text: "Eligibility check" } },
                {
                  id: "formP",
                  type: "paragraph",
                  props: { text: "Embed your intake form here. You can change the form slug at any time." },
                },
                {
                  id: "form",
                  type: "formEmbed",
                  props: { formSlug: "business-intake", height: 640, style: { marginTopPx: 10 } as any },
                },
              ],
            },
          },
          { id: "a_who", type: "anchor", props: { anchorId: "who", label: "Who it is for" } },
          {
            id: "who",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 34,
                borderRadiusPx: 30,
                backgroundColor: SOFT_PANEL_BG,
                marginTopPx: 16,
              },
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "Who this is for" } },
                {
                  id: "p2",
                  type: "paragraph",
                  props: {
                    text:
                      "This works best for business owners who want to separate personal and business credit, improve approvals, and follow a clear sequence instead of random applications.",
                    style: { fontSizePx: 16, maxWidthPx: 860 } as any,
                  },
                },
                {
                  id: "whoCols",
                  type: "columns",
                  props: {
                    gapPx: 16,
                    stackOnMobile: true,
                    style: { marginTopPx: 8 } as any,
                    columns: [
                      {
                        markdown:
                          "### New businesses\n\nYou want the right setup and early vendors so you do not waste time.",
                        style: { backgroundColor: SOFT_PANEL_BG_STRONG, paddingPx: 18, borderRadiusPx: 24 } as any,
                      },
                      {
                        markdown:
                          "### Established businesses\n\nYou want higher limits and more consistent approvals.",
                        style: { backgroundColor: SOFT_PANEL_BG_STRONG, paddingPx: 18, borderRadiusPx: 24 } as any,
                      },
                      {
                        markdown:
                          "### Fast movers\n\nYou have a goal and timeline and want the shortest clean path.",
                        style: { backgroundColor: SOFT_PANEL_BG_STRONG, paddingPx: 18, borderRadiusPx: 24 } as any,
                      },
                    ],
                  },
                },
              ],
            },
          },
          { id: "a_roadmap", type: "anchor", props: { anchorId: "roadmap", label: "Roadmap" } },
          {
            id: "roadmap",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 34,
                borderRadiusPx: 30,
                backgroundColor: SOFT_PANEL_BG,
                marginTopPx: 16,
              },
              markdown: [
                "## The business credit roadmap",
                "",
                "### Step 1: Foundation",
                "Entity setup, business info consistency, and compliance basics.",
                "",
                "### Step 2: Vendor trade lines",
                "Start with accounts that report and build the profile correctly.",
                "",
                "### Step 3: Store and fleet",
                "Move up to stronger approvals as the file matures.",
                "",
                "### Step 4: Cash credit and funding",
                "Apply when the signals are right so you avoid unnecessary declines.",
              ].join("\n"),
            },
          },
          { id: "a_faq", type: "anchor", props: { anchorId: "faq", label: "FAQ" } },
          {
            id: "faq",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 34,
                borderRadiusPx: 30,
                backgroundColor: SOFT_PANEL_BG,
                marginTopPx: 16,
              },
              markdown: [
                "## FAQ",
                "",
                "### Will this require a personal guarantee?",
                "Sometimes, especially early. The goal is to improve approvals and terms over time.",
                "",
                "### How long does it take?",
                "Most businesses see meaningful progress in a few months with consistent follow-through.",
                "",
                "### Do I need existing revenue?",
                "Not always. It depends on the products and the stage. The intake helps us tailor the plan.",
              ].join("\n"),
            },
          },
          { id: "a_apply", type: "anchor", props: { anchorId: "apply", label: "Apply" } },
          {
            id: "apply",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: SOFT_PANEL_BG_STRONG,
                marginTopPx: 16,
              },
              children: [
                { id: "h3", type: "heading", props: { level: 2, text: "Check eligibility" } },
                {
                  id: "p3",
                  type: "paragraph",
                  props: {
                    text: "Answer a few questions and we will show the best next step for your stage.",
                  },
                },
                { id: "cta2", type: "formLink", props: { formSlug: "business-intake", text: "Start", style: { maxWidthPx: 420 } as any } },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    key: "consultation-booking",
    label: "Consultation Booking",
    description: "Simple funnel that drives to booking.",
    defaultThemeKey: "emerald-clean",
    pages: [
      {
        slug: "home",
        title: "Book a Consultation",
        sortOrder: 0,
        editorMode: "BLOCKS",
        blocks: [
          {
            id: "nav",
            type: "headerNav",
            props: {
              sticky: true,
              transparent: false,
              size: "md",
              desktopMode: "inline",
              mobileMode: "dropdown",
              logoAlt: "Logo",
              items: [
                { id: "n1", label: "Details", kind: "anchor", anchorId: "details" },
                { id: "n2", label: "Book", kind: "anchor", anchorId: "book" },
              ],
            },
          },
          {
            id: "hero",
            type: "section",
            props: {
              anchorId: "top",
              layout: "two",
              gapPx: 26,
              stackOnMobile: true,
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: SOFT_PANEL_BG,
              },
              leftChildren: [
                {
                  id: "badge",
                  type: "paragraph",
                  props: {
                    text: "30 minute strategy call",
                    style: {
                      maxWidthPx: 240,
                      paddingPx: 10,
                      borderRadiusPx: 999,
                      backgroundColor: SOFT_PANEL_BG_STRONG,
                      align: "center",
                      fontSizePx: 13,
                    } as any,
                  },
                },
                {
                  id: "h1",
                  type: "heading",
                  props: { level: 1, text: "Book a consultation and leave with a clear next step", style: { fontSizePx: 42, marginTopPx: 12 } as any },
                },
                {
                  id: "p1",
                  type: "paragraph",
                  props: {
                    text:
                      "We review your current situation, answer questions, and map out the fastest, cleanest plan based on your goals and timeline.",
                    style: { fontSizePx: 17, maxWidthPx: 760 } as any,
                  },
                },
                {
                  id: "cta1",
                  type: "button",
                  props: { text: "Choose a time", href: "#book", style: { maxWidthPx: 340, marginTopPx: 10 } as any },
                },
                {
                  id: "fine",
                  type: "paragraph",
                  props: {
                    text: "If you do not see a time that works, add your contact form below and we will follow up.",
                    style: {
                      fontSizePx: 12,
                      maxWidthPx: 760,
                      marginTopPx: 10,
                      textColor: "color-mix(in srgb, currentColor 78%, transparent)",
                    },
                  },
                },
              ],
              rightStyle: {
                paddingPx: 22,
                borderRadiusPx: 28,
                backgroundColor: "color-mix(in srgb, currentColor 9%, transparent)",
              },
              rightChildren: [
                { id: "rH", type: "heading", props: { level: 3, text: "You will leave with" } },
                {
                  id: "rList",
                  type: "section",
                  props: {
                    layout: "one",
                    style: { paddingPx: 0 } as any,
                    markdown: [
                      "- A prioritized action plan",
                      "- A realistic timeline",
                      "- A list of next steps you can execute",
                      "- Optional help implementing",
                    ].join("\n"),
                  },
                },
                {
                  id: "rNote",
                  type: "paragraph",
                  props: {
                    text: "Tip: add a testimonial, results screenshot, or short video here.",
                    style: { fontSizePx: 12, marginTopPx: 10, textColor: "color-mix(in srgb, currentColor 78%, transparent)" },
                  },
                },
              ],
            },
          },
          { id: "a_details", type: "anchor", props: { anchorId: "details", label: "Details" } },
          {
            id: "details",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 34,
                borderRadiusPx: 30,
                backgroundColor: SOFT_PANEL_BG,
                marginTopPx: 16,
              },
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "What we cover" } },
                {
                  id: "p2",
                  type: "paragraph",
                  props: {
                    text:
                      "Your current situation, your goal and timeline, what to do first, and what to avoid so you do not waste time or applications.",
                  },
                },
                {
                  id: "detailsCols",
                  type: "columns",
                  props: {
                    gapPx: 16,
                    stackOnMobile: true,
                    style: { marginTopPx: 8 } as any,
                    columns: [
                      {
                        markdown: "### Prep (optional)\n\nBring your goal, timeline, and any key details you want reviewed.",
                        style: { backgroundColor: SOFT_PANEL_BG_STRONG, paddingPx: 18, borderRadiusPx: 24 } as any,
                      },
                      {
                        markdown: "### Call format\n\n30 minutes. Clear plan. No fluff.",
                        style: { backgroundColor: SOFT_PANEL_BG_STRONG, paddingPx: 18, borderRadiusPx: 24 } as any,
                      },
                      {
                        markdown: "### Next step\n\nIf we are a fit, we outline options and pricing clearly.",
                        style: { backgroundColor: SOFT_PANEL_BG_STRONG, paddingPx: 18, borderRadiusPx: 24 } as any,
                      },
                    ],
                  },
                },
              ],
            },
          },
          { id: "a_book", type: "anchor", props: { anchorId: "book", label: "Book" } },
          {
            id: "book",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: SOFT_PANEL_BG_STRONG,
                marginTopPx: 16,
              },
              children: [
                { id: "h3", type: "heading", props: { level: 2, text: "Book now" } },
                {
                  id: "p3",
                  type: "paragraph",
                  props: {
                    text:
                      "Pick a time below. In the editor, select the calendar embed block and choose your connected calendar.",
                  },
                },
                { id: "cal", type: "calendarEmbed", props: { calendarId: "", height: 760, style: { marginTopPx: 12 } as any } },
                {
                  id: "fallback",
                  type: "section",
                  props: {
                    layout: "one",
                    style: { paddingPx: 0, marginTopPx: 16 } as any,
                    markdown: [
                      "### No times available?",
                      "Add a form embed below and collect name, email, phone, and the best times to reach them.",
                    ].join("\n"),
                  },
                },
                { id: "form", type: "formEmbed", props: { formSlug: "intake", height: 600, style: { marginTopPx: 10 } as any } },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    key: "credit-audit-minimal",
    label: "Credit Audit Minimal",
    description: "Minimal layout with a checklist and a single embedded intake form.",
    defaultThemeKey: "ivory-gold",
    pages: [
      {
        slug: "home",
        title: "Free Credit Audit",
        sortOrder: 0,
        editorMode: "BLOCKS",
        blocks: [
          {
            id: "hero",
            type: "section",
            props: {
              anchorId: "top",
              layout: "one",
              style: {
                maxWidthPx: 980,
                align: "left",
                paddingPx: 10,
                marginTopPx: 12,
              },
              children: [
                {
                  id: "badge",
                  type: "paragraph",
                  props: {
                    text: "Free 2 minute audit",
                    style: {
                      maxWidthPx: 220,
                      paddingPx: 10,
                      borderRadiusPx: 999,
                      backgroundColor: "color-mix(in srgb, currentColor 6%, transparent)",
                      align: "center",
                      fontSizePx: 13,
                      textColor: "color-mix(in srgb, currentColor 86%, transparent)",
                    },
                  },
                },
                {
                  id: "h1",
                  type: "heading",
                  props: {
                    level: 1,
                    text: "Stop guessing. Get the exact next steps to raise your score.",
                    style: { fontSizePx: 46, marginTopPx: 14, marginBottomPx: 8, maxWidthPx: 900 } as any,
                  },
                },
                {
                  id: "p1",
                  type: "paragraph",
                  props: {
                    text:
                      "Answer a few quick questions. We return a prioritized plan: what is worth disputing, what to leave alone, and what to build next.",
                    style: { fontSizePx: 17, maxWidthPx: 900, marginBottomPx: 10 } as any,
                  },
                },
                {
                  id: "check",
                  type: "section",
                  props: {
                    layout: "one",
                    style: {
                      paddingPx: 20,
                      borderRadiusPx: 22,
                      backgroundColor: "color-mix(in srgb, currentColor 5%, transparent)",
                      maxWidthPx: 900,
                      marginTopPx: 8,
                    },
                    markdown: [
                      "### You will get",
                      "",
                      "- The 3 highest-impact fixes for your file",
                      "- A clean dispute priority list (now vs later)",
                      "- The best builder move for your stage",
                      "- Optional booking link if you want help implementing",
                    ].join("\n"),
                  },
                },
                {
                  id: "cta1",
                  type: "button",
                  props: { text: "Start the free audit", href: "#start", style: { maxWidthPx: 320, marginTopPx: 14 } as any },
                },
                {
                  id: "fine",
                  type: "paragraph",
                  props: {
                    text: "No credit pull. You provide the info.",
                    style: { fontSizePx: 12, marginTopPx: 8, textColor: "color-mix(in srgb, currentColor 74%, transparent)" },
                  },
                },
              ],
            },
          },
          {
            id: "metrics",
            type: "columns",
            props: {
              gapPx: 14,
              stackOnMobile: true,
              style: { maxWidthPx: 980, marginTopPx: 18 } as any,
              columns: [
                {
                  markdown: "### 2 to 3 minutes\n\nAverage completion time.",
                  style: { paddingPx: 18, borderRadiusPx: 18, backgroundColor: "color-mix(in srgb, currentColor 4%, transparent)" } as any,
                },
                {
                  markdown: "### Prioritized\n\nFix what moves the needle first.",
                  style: { paddingPx: 18, borderRadiusPx: 18, backgroundColor: "color-mix(in srgb, currentColor 4%, transparent)" } as any,
                },
                {
                  markdown: "### Simple plan\n\nDispute, build, then optimize.",
                  style: { paddingPx: 18, borderRadiusPx: 18, backgroundColor: "color-mix(in srgb, currentColor 4%, transparent)" } as any,
                },
              ],
            },
          },
          { id: "a_start", type: "anchor", props: { anchorId: "start", label: "Start" } },
          {
            id: "start",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: 980,
                align: "left",
                paddingPx: 28,
                borderRadiusPx: 24,
                backgroundColor: "color-mix(in srgb, currentColor 7%, transparent)",
                marginTopPx: 16,
              },
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "Start the audit" } },
                { id: "p2", type: "paragraph", props: { text: "Embed your intake form here. You can swap the form slug anytime." } },
                { id: "form", type: "formEmbed", props: { formSlug: "intake", height: 660, style: { marginTopPx: 10 } as any } },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    key: "credit-audit-quiz",
    label: "Credit Audit Quiz Style",
    description: "Quiz-style landing page that segments leads and drives to intake.",
    defaultThemeKey: "platinum-blue",
    pages: [
      {
        slug: "home",
        title: "Credit Audit Quiz",
        sortOrder: 0,
        editorMode: "BLOCKS",
        blocks: [
          {
            id: "nav",
            type: "headerNav",
            props: {
              sticky: true,
              transparent: false,
              size: "sm",
              desktopMode: "dropdown",
              mobileMode: "slideover",
              mobileTrigger: "directory",
              mobileTriggerLabel: "Menu",
              logoAlt: "Logo",
              items: [
                { id: "n1", label: "Questions", kind: "anchor", anchorId: "questions" },
                { id: "n2", label: "Outcomes", kind: "anchor", anchorId: "outcomes" },
                { id: "n3", label: "Start", kind: "anchor", anchorId: "start" },
              ],
            },
          },
          {
            id: "hero",
            type: "section",
            props: {
              anchorId: "top",
              layout: "two",
              gapPx: 24,
              stackOnMobile: true,
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 28,
                backgroundColor: "color-mix(in srgb, currentColor 6%, transparent)",
              },
              leftChildren: [
                { id: "h1", type: "heading", props: { level: 1, text: "Take the 90 second credit audit quiz", style: { fontSizePx: 44 } as any } },
                {
                  id: "p1",
                  type: "paragraph",
                  props: {
                    text:
                      "We use a few quick questions to identify your most likely bottleneck and the cleanest next step.",
                    style: { fontSizePx: 17, maxWidthPx: 720 } as any,
                  },
                },
                {
                  id: "qPreview",
                  type: "columns",
                  props: {
                    gapPx: 14,
                    stackOnMobile: true,
                    style: { marginTopPx: 10, maxWidthPx: 720 } as any,
                    columns: [
                      {
                        markdown: "### 1) Your goal\n\nMortgage, auto, apartment, or rebuild?",
                        style: { paddingPx: 16, borderRadiusPx: 18, backgroundColor: "color-mix(in srgb, currentColor 7%, transparent)" } as any,
                      },
                      {
                        markdown: "### 2) Your timeline\n\nHow fast do you need results?",
                        style: { paddingPx: 16, borderRadiusPx: 18, backgroundColor: "color-mix(in srgb, currentColor 7%, transparent)" } as any,
                      },
                      {
                        markdown: "### 3) The obstacles\n\nLate payments, collections, utilization, thin file.",
                        style: { paddingPx: 16, borderRadiusPx: 18, backgroundColor: "color-mix(in srgb, currentColor 7%, transparent)" } as any,
                      },
                    ],
                  },
                },
                { id: "cta", type: "button", props: { text: "Start the quiz", href: "#start", style: { maxWidthPx: 280, marginTopPx: 14 } as any } },
              ],
              rightStyle: {
                paddingPx: 22,
                borderRadiusPx: 22,
                backgroundColor: "color-mix(in srgb, currentColor 9%, transparent)",
              },
              rightChildren: [
                { id: "rH", type: "heading", props: { level: 3, text: "What happens next" } },
                {
                  id: "rCopy",
                  type: "section",
                  props: {
                    layout: "one",
                    style: { paddingPx: 0 } as any,
                    markdown: [
                      "- We identify your top priority",
                      "- We give you a simple dispute/build order",
                      "- You can book a call if you want help executing",
                    ].join("\n"),
                  },
                },
                {
                  id: "rNote",
                  type: "paragraph",
                  props: {
                    text: "Tip: rename this to match your offer. This is just a template starter.",
                    style: { fontSizePx: 12, marginTopPx: 10, textColor: "color-mix(in srgb, currentColor 74%, transparent)" },
                  },
                },
              ],
            },
          },
          { id: "a_questions", type: "anchor", props: { anchorId: "questions", label: "Questions" } },
          {
            id: "questions",
            type: "section",
            props: {
              layout: "one",
              style: { maxWidthPx: CONTAINER_MAX_WIDTH, align: "left", marginTopPx: 18 } as any,
              markdown: [
                "## The questions we use (examples)",
                "",
                "### What is your goal?",
                "Mortgage, auto, apartment, approvals, or rebuild.",
                "",
                "### How fast do you need results?",
                "Right now, 30 days, 90 days, or longer.",
                "",
                "### What is most true right now?",
                "Late payments, collections, high utilization, thin file, or unsure.",
              ].join("\n"),
            },
          },
          { id: "a_outcomes", type: "anchor", props: { anchorId: "outcomes", label: "Outcomes" } },
          {
            id: "outcomes",
            type: "columns",
            props: {
              gapPx: 16,
              stackOnMobile: true,
              style: { maxWidthPx: CONTAINER_MAX_WIDTH, marginTopPx: 14 } as any,
              columns: [
                {
                  markdown: "### Dispute priority\n\nIf accuracy issues are holding you back, we prioritize disputes and clean-up.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 22 } as any,
                },
                {
                  markdown: "### Utilization plan\n\nIf balances are the bottleneck, we map paydown order and timing.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 22 } as any,
                },
                {
                  markdown: "### Builder next step\n\nIf the file is thin, we recommend the best builder move for your stage.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 22 } as any,
                },
              ],
            },
          },
          { id: "a_start", type: "anchor", props: { anchorId: "start", label: "Start" } },
          {
            id: "start",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 28,
                backgroundColor: SOFT_PANEL_BG_STRONG,
                marginTopPx: 16,
              },
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "Start the audit" } },
                { id: "p2", type: "paragraph", props: { text: "Embed your intake form below or replace with a form link." } },
                { id: "form", type: "formEmbed", props: { formSlug: "intake", height: 640, style: { marginTopPx: 10 } as any } },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    key: "business-credit-snapshot",
    label: "Business Credit Snapshot",
    description: "Business credit pre-qual with a roadmap snapshot and embedded application.",
    defaultThemeKey: "graphite",
    pages: [
      {
        slug: "home",
        title: "Business Credit",
        sortOrder: 0,
        editorMode: "BLOCKS",
        blocks: [
          {
            id: "nav",
            type: "headerNav",
            props: {
              sticky: true,
              transparent: false,
              size: "md",
              desktopMode: "slideover",
              mobileMode: "slideover",
              mobileTrigger: "directory",
              mobileTriggerLabel: "Sections",
              logoAlt: "Logo",
              items: [
                { id: "n1", label: "Snapshot", kind: "anchor", anchorId: "snapshot" },
                { id: "n2", label: "Roadmap", kind: "anchor", anchorId: "roadmap" },
                { id: "n3", label: "Apply", kind: "anchor", anchorId: "apply" },
              ],
            },
          },
          {
            id: "hero",
            type: "section",
            props: {
              anchorId: "top",
              layout: "two",
              gapPx: 26,
              stackOnMobile: true,
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: "color-mix(in srgb, currentColor 7%, transparent)",
              },
              leftChildren: [
                {
                  id: "badge",
                  type: "paragraph",
                  props: {
                    text: "Business credit and funding",
                    style: {
                      maxWidthPx: 320,
                      paddingPx: 10,
                      borderRadiusPx: 999,
                      backgroundColor: "color-mix(in srgb, currentColor 10%, transparent)",
                      align: "center",
                      fontSizePx: 13,
                    } as any,
                  },
                },
                { id: "h1", type: "heading", props: { level: 1, text: "Build business credit without guessing", style: { fontSizePx: 42, marginTopPx: 12 } as any } },
                {
                  id: "p1",
                  type: "paragraph",
                  props: {
                    text:
                      "We help you confirm eligibility, set up the foundations correctly, and follow a clean vendor to revolving roadmap.",
                    style: { fontSizePx: 17, maxWidthPx: 720 } as any,
                  },
                },
                {
                  id: "bullets",
                  type: "section",
                  props: {
                    layout: "one",
                    style: { paddingPx: 0, marginTopPx: 10 } as any,
                    markdown: [
                      "- Clear next step based on your stage",
                      "- Foundation checklist (entity, compliance, banking)",
                      "- Roadmap snapshot and timing",
                      "- Optional funding strategy call",
                    ].join("\n"),
                  },
                },
                { id: "cta", type: "button", props: { text: "See the snapshot", href: "#snapshot", variant: "secondary", style: { maxWidthPx: 280, marginTopPx: 12 } as any } },
              ],
              rightStyle: { paddingPx: 22, borderRadiusPx: 28, backgroundColor: "color-mix(in srgb, currentColor 11%, transparent)" },
              rightChildren: [
                { id: "rH", type: "heading", props: { level: 3, text: "Start your application" } },
                { id: "rP", type: "paragraph", props: { text: "Embed your business intake form here." } },
                { id: "form", type: "formEmbed", props: { formSlug: "business-intake", height: 680, style: { marginTopPx: 10 } as any } },
              ],
            },
          },
          { id: "a_snapshot", type: "anchor", props: { anchorId: "snapshot", label: "Snapshot" } },
          {
            id: "snapshot",
            type: "columns",
            props: {
              gapPx: 16,
              stackOnMobile: true,
              style: { maxWidthPx: CONTAINER_MAX_WIDTH, marginTopPx: 18 } as any,
              columns: [
                {
                  markdown: "### Stage 1\n\nFoundation and compliance.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 24 } as any,
                },
                {
                  markdown: "### Stage 2\n\nVendor and store cards.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 24 } as any,
                },
                {
                  markdown: "### Stage 3\n\nRevolving and higher limits.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 24 } as any,
                },
                {
                  markdown: "### Stage 4\n\nFunding strategy and expansion.",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 20, borderRadiusPx: 24 } as any,
                },
              ],
            },
          },
          { id: "a_roadmap", type: "anchor", props: { anchorId: "roadmap", label: "Roadmap" } },
          {
            id: "roadmap",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 34,
                borderRadiusPx: 30,
                backgroundColor: "color-mix(in srgb, currentColor 7%, transparent)",
                marginTopPx: 16,
              },
              markdown: [
                "## The clean roadmap",
                "",
                "### Foundation",
                "Entity, compliance, bank account, and the simple checklist most people miss.",
                "",
                "### Build",
                "Vendor and store accounts to generate early history.",
                "",
                "### Expand",
                "Revolving approvals and higher limits once the file is ready.",
                "",
                "### Optimize",
                "Funding strategy and application timing so you avoid unnecessary denials.",
              ].join("\n"),
            },
          },
          { id: "a_apply", type: "anchor", props: { anchorId: "apply", label: "Apply" } },
          {
            id: "apply",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: CONTAINER_MAX_WIDTH,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: SOFT_PANEL_BG_STRONG,
                marginTopPx: 16,
              },
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "Apply now" } },
                { id: "p2", type: "paragraph", props: { text: "If you already started above, you are set. Otherwise use the button below." } },
                { id: "cta2", type: "formLink", props: { formSlug: "business-intake", text: "Start application", style: { maxWidthPx: 420 } as any } },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    key: "credit-repair-case-study",
    label: "Credit Repair Case Study",
    description: "Story-first page with before/after, timeline, and a strong CTA.",
    defaultThemeKey: "rose-slate",
    pages: [
      {
        slug: "home",
        title: "Credit Repair",
        sortOrder: 0,
        editorMode: "BLOCKS",
        blocks: [
          {
            id: "hero",
            type: "section",
            props: {
              anchorId: "top",
              layout: "one",
              style: {
                maxWidthPx: 980,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: "color-mix(in srgb, currentColor 7%, transparent)",
              },
              children: [
                { id: "h1", type: "heading", props: { level: 1, text: "A simple, clean process to rebuild credit", style: { fontSizePx: 44 } as any } },
                {
                  id: "p1",
                  type: "paragraph",
                  props: {
                    text:
                      "This template is built as a story: what changed, what we did in what order, and what the client did to keep results stable.",
                    style: { fontSizePx: 17, maxWidthPx: 860 } as any,
                  },
                },
                {
                  id: "ctaRow",
                  type: "columns",
                  props: {
                    gapPx: 14,
                    stackOnMobile: true,
                    style: { maxWidthPx: 860, marginTopPx: 10 } as any,
                    columns: [
                      { markdown: "", children: [{ id: "cta1", type: "formLink", props: { formSlug: "intake", text: "Start intake", style: { maxWidthPx: 340 } as any } }] },
                      {
                        markdown: "",
                        children: [
                          {
                            id: "cta2",
                            type: "button",
                            props: { text: "Read the case study", href: "#case", variant: "secondary", style: { maxWidthPx: 340 } as any },
                          },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
          { id: "a_case", type: "anchor", props: { anchorId: "case", label: "Case study" } },
          {
            id: "case",
            type: "section",
            props: {
              layout: "one",
              style: { maxWidthPx: 980, align: "left", marginTopPx: 16 } as any,
              markdown: [
                "## Case study (example)",
                "",
                "### Starting point",
                "A thin file plus a few negatives created instability and low approvals.",
                "",
                "### Goal",
                "Increase approvals and stabilize score movement with a clean dispute and build plan.",
              ].join("\n"),
            },
          },
          {
            id: "beforeAfter",
            type: "columns",
            props: {
              gapPx: 16,
              stackOnMobile: true,
              style: { maxWidthPx: 980, marginTopPx: 14 } as any,
              columns: [
                {
                  markdown: "### Before\n\n- Confusing priorities\n- Denials or low limits\n- Score swings\n\n**Replace with your numbers**",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 22, borderRadiusPx: 26 } as any,
                },
                {
                  markdown: "### After\n\n- Clean dispute order\n- Better utilization control\n- Stronger positive history\n\n**Replace with your numbers**",
                  style: { backgroundColor: SOFT_PANEL_BG, paddingPx: 22, borderRadiusPx: 26 } as any,
                },
              ],
            },
          },
          {
            id: "timeline",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: 980,
                align: "left",
                paddingPx: 34,
                borderRadiusPx: 30,
                backgroundColor: "color-mix(in srgb, currentColor 6%, transparent)",
                marginTopPx: 16,
              },
              markdown: [
                "## The timeline (example)",
                "",
                "### Week 1: Prioritize",
                "We isolate the highest-impact items and set a simple order.",
                "",
                "### Weeks 2 to 4: Dispute and stabilize",
                "Execute disputes and reduce score volatility.",
                "",
                "### Month 2+: Build",
                "Add the right positive accounts and optimize utilization.",
              ].join("\n"),
            },
          },
          { id: "a_start", type: "anchor", props: { anchorId: "start", label: "Start" } },
          {
            id: "start",
            type: "section",
            props: {
              layout: "one",
              style: {
                maxWidthPx: 980,
                align: "left",
                paddingPx: 44,
                borderRadiusPx: 32,
                backgroundColor: SOFT_PANEL_BG_STRONG,
                marginTopPx: 16,
              },
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "Start intake" } },
                { id: "p2", type: "paragraph", props: { text: "Answer a few questions so we can tailor the plan." } },
                { id: "cta3", type: "formLink", props: { formSlug: "intake", text: "Start now", style: { maxWidthPx: 420 } as any } },
              ],
            },
          },
        ],
      },
    ],
  },
];

export function getCreditFunnelTemplate(key: CreditFunnelTemplateKey | string | null | undefined): CreditFunnelTemplate | null {
  const k = typeof key === "string" ? (key as CreditFunnelTemplateKey) : null;
  if (!k) return null;
  return CREDIT_FUNNEL_TEMPLATES.find((t) => t.key === k) || null;
}

export function coerceCreditFunnelTemplateKey(raw: unknown): CreditFunnelTemplateKey | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim() as CreditFunnelTemplateKey;
  if (!s) return null;
  return CREDIT_FUNNEL_TEMPLATES.some((t) => t.key === s) ? s : null;
}
