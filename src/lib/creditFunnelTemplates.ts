import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";

import type { CreditFunnelTheme, CreditFunnelThemeKey } from "@/lib/creditFunnelThemes";

export type CreditFunnelTemplateKey =
  | "credit-audit-leadgen"
  | "credit-repair-vsl"
  | "business-credit-leadgen"
  | "consultation-booking";

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
      customChatJson: null as any,
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
                { id: "n1", label: "How it works", kind: "anchor", anchorId: "how" },
                { id: "n2", label: "What you get", kind: "anchor", anchorId: "what" },
                { id: "n3", label: "Start", kind: "anchor", anchorId: "start" },
              ],
            },
          },
          {
            id: "hero",
            type: "section",
            props: {
              anchorId: "top",
              layout: "one",
              children: [
                { id: "h1", type: "heading", props: { level: 1, text: "Get a free credit audit in minutes" } },
                {
                  id: "p1",
                  type: "paragraph",
                  props: {
                    text: "Answer a few quick questions and we will tell you exactly what is holding your score back - and what to do next.",
                  },
                },
                { id: "cta1", type: "formLink", props: { formSlug: "intake", text: "Start the free audit" } },
                {
                  id: "cta2",
                  type: "button",
                  props: { text: "Prefer to talk? Book a call", href: "#start", variant: "secondary" },
                },
              ],
            },
          },
          { id: "a_how", type: "anchor", props: { anchorId: "how", label: "How it works" } },
          {
            id: "how",
            type: "columns",
            props: {
              gapPx: 18,
              stackOnMobile: true,
              columns: [
                { markdown: "### 1) Tell us your goals\n\nWe learn what you want and where you are today." },
                { markdown: "### 2) We review your situation\n\nWe spot the fastest wins and the biggest blockers." },
                { markdown: "### 3) Get a clear action plan\n\nA simple next-step plan you can execute." },
              ],
            },
          },
          { id: "a_what", type: "anchor", props: { anchorId: "what", label: "What you get" } },
          {
            id: "what",
            type: "section",
            props: {
              layout: "one",
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "What you get" } },
                {
                  id: "p2",
                  type: "paragraph",
                  props: {
                    text: "A personalized breakdown of what is impacting your score, what to dispute, and what to build next.",
                  },
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
              children: [
                { id: "h3", type: "heading", props: { level: 2, text: "Ready to start?" } },
                { id: "p3", type: "paragraph", props: { text: "It takes about 2 minutes." } },
                { id: "cta3", type: "formLink", props: { formSlug: "intake", text: "Start the free audit" } },
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
                { id: "n2", label: "Results", kind: "anchor", anchorId: "results" },
                { id: "n3", label: "Get started", kind: "anchor", anchorId: "get-started" },
              ],
            },
          },
          {
            id: "hero",
            type: "section",
            props: {
              anchorId: "overview",
              layout: "one",
              children: [
                { id: "h1", type: "heading", props: { level: 1, text: "Fix what is hurting your credit" } },
                {
                  id: "p1",
                  type: "paragraph",
                  props: { text: "Watch the quick overview, then start your intake to see next steps." },
                },
                {
                  id: "v1",
                  type: "video",
                  props: { src: "", name: "Video", controls: true, showControls: true, aspectRatio: "16:9" },
                },
                { id: "cta1", type: "formLink", props: { formSlug: "intake", text: "Start intake" } },
              ],
            },
          },
          { id: "a_results", type: "anchor", props: { anchorId: "results", label: "Results" } },
          {
            id: "results",
            type: "columns",
            props: {
              gapPx: 18,
              stackOnMobile: true,
              columns: [
                { markdown: "### Clear plan\n\nKnow what to do next." },
                { markdown: "### Faster disputes\n\nPrioritize the biggest impact." },
                { markdown: "### Better building\n\nAdd the right positive accounts." },
              ],
            },
          },
          { id: "a_get", type: "anchor", props: { anchorId: "get-started", label: "Get started" } },
          {
            id: "get",
            type: "section",
            props: {
              layout: "one",
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "Get started" } },
                { id: "p2", type: "paragraph", props: { text: "Start with the intake. We will guide you from there." } },
                { id: "cta2", type: "formLink", props: { formSlug: "intake", text: "Start intake" } },
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
                { id: "n1", label: "Benefits", kind: "anchor", anchorId: "benefits" },
                { id: "n2", label: "Steps", kind: "anchor", anchorId: "steps" },
                { id: "n3", label: "Apply", kind: "anchor", anchorId: "apply" },
              ],
            },
          },
          {
            id: "hero",
            type: "section",
            props: {
              layout: "one",
              children: [
                { id: "h1", type: "heading", props: { level: 1, text: "Build business credit the right way" } },
                {
                  id: "p1",
                  type: "paragraph",
                  props: { text: "We help you structure your business, build vendor lines, and unlock funding." },
                },
                { id: "cta1", type: "formLink", props: { formSlug: "business-intake", text: "Check eligibility" } },
              ],
            },
          },
          { id: "a_benefits", type: "anchor", props: { anchorId: "benefits", label: "Benefits" } },
          {
            id: "benefits",
            type: "columns",
            props: {
              gapPx: 18,
              stackOnMobile: true,
              columns: [
                { markdown: "### Separate your personal and business\n\nProtect your personal profile." },
                { markdown: "### Higher limits\n\nAccess stronger business approvals." },
                { markdown: "### Funding roadmap\n\nKnow which steps unlock what." },
              ],
            },
          },
          { id: "a_steps", type: "anchor", props: { anchorId: "steps", label: "Steps" } },
          {
            id: "steps",
            type: "section",
            props: {
              layout: "one",
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "How it works" } },
                { id: "p2", type: "paragraph", props: { text: "Answer a few questions, then we give you the fastest path forward." } },
              ],
            },
          },
          { id: "a_apply", type: "anchor", props: { anchorId: "apply", label: "Apply" } },
          {
            id: "apply",
            type: "section",
            props: {
              layout: "one",
              children: [
                { id: "h3", type: "heading", props: { level: 2, text: "Apply" } },
                { id: "p3", type: "paragraph", props: { text: "It takes about 2 minutes." } },
                { id: "cta2", type: "formLink", props: { formSlug: "business-intake", text: "Check eligibility" } },
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
              layout: "one",
              children: [
                { id: "h1", type: "heading", props: { level: 1, text: "Book a consultation" } },
                {
                  id: "p1",
                  type: "paragraph",
                  props: { text: "We will review your goals, answer questions, and map out next steps." },
                },
                { id: "cta1", type: "button", props: { text: "Jump to booking", href: "#book" } },
              ],
            },
          },
          { id: "a_details", type: "anchor", props: { anchorId: "details", label: "Details" } },
          {
            id: "details",
            type: "section",
            props: {
              layout: "one",
              children: [
                { id: "h2", type: "heading", props: { level: 2, text: "What we cover" } },
                { id: "p2", type: "paragraph", props: { text: "Credit situation, goals, timeline, and your best plan." } },
              ],
            },
          },
          { id: "a_book", type: "anchor", props: { anchorId: "book", label: "Book" } },
          {
            id: "book",
            type: "section",
            props: {
              layout: "one",
              children: [
                { id: "h3", type: "heading", props: { level: 2, text: "Book now" } },
                {
                  id: "p3",
                  type: "paragraph",
                  props: {
                    text: "Add a calendar embed block here (Settings - Booking) once your calendar is connected.",
                  },
                },
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
