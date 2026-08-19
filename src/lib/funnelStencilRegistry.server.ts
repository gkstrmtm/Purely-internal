import path from "node:path";
import { promises as fs } from "node:fs";

import type { CreditFunnelBlock } from "@/lib/creditFunnelBlocks";
import type { FunnelPageIntentType } from "@/lib/funnelPageIntent";
import { buildSuggestedPageNaming } from "@/lib/funnelPageIntent";
import { decideFunnelInitialization, getFunnelStencilMeta, type FunnelInitializationDecision, type FunnelStencilId } from "@/lib/funnelStencilPlanner";

type StencilSection = {
  id: string;
  name: string;
  purpose: string;
  archetype?: string;
};

type StencilPage = {
  id: string;
  name: string;
  goal: string;
  sections: string[];
  entry?: boolean;
  terminal?: boolean;
};

type StencilManifest = {
  schemaVersion: number;
  stencilId: FunnelStencilId;
  title: string;
  conversionGoal: string;
  notes?: string[];
  sections: StencilSection[];
  pages: StencilPage[];
};

export type FunnelInitializationSummary = {
  mode: "stencil" | "custom" | "template";
  confidence: "high" | "medium" | "low";
  stencilId?: FunnelStencilId | null;
  label: string;
  summary: string;
  reason?: string;
  pageTitles: string[];
  pageCount: number;
};

export type FunnelInitializationSeed = {
  slug: string;
  title: string;
  sortOrder: number;
  editorMode: "BLOCKS";
  contentMarkdown: string;
  customHtml: string;
  blocksJson: CreditFunnelBlock[];
  briefSeed: {
    pageType: FunnelPageIntentType;
    pageGoal: string;
    shellConcept: string;
    sectionPlan: string;
    askClarifyingQuestions: boolean;
  };
};

export type FunnelInitializationScaffold = {
  decision: FunnelInitializationDecision;
  seeds: FunnelInitializationSeed[];
  summary: FunnelInitializationSummary;
};

const manifestCache = new Map<FunnelStencilId, Promise<StencilManifest>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function humanizePascal(value: string) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleForStencilPage(page: StencilPage, funnelName: string) {
  const pageId = String(page.id || "").toLowerCase();
  if (pageId === "landing" || pageId === "entry" || pageId === "home") return funnelName || "Home";
  if (pageId === "booking") return "Book";
  if (pageId === "registration") return "Register";
  if (pageId === "qualification") return "Qualification";
  if (pageId === "offer") return "Offer";
  if (pageId === "checkout") return "Checkout";
  if (pageId === "confirmation") return "Confirmation";
  if (pageId === "thank-you") return "Thank You";
  if (pageId === "completion") return "Completion";
  const fromName = humanizePascal(String(page.name || "").replace(/Page$/i, ""));
  return fromName || "Page";
}

function slugForStencilPage(page: StencilPage, fallback: string) {
  const pageId = String(page.id || "").toLowerCase();
  if (pageId === "landing" || pageId === "entry" || pageId === "home") return "home";
  if (pageId === "booking") return "book";
  if (pageId === "registration") return "register";
  if (pageId === "qualification") return "qualify";
  if (pageId === "offer") return "offer";
  if (pageId === "checkout") return "checkout";
  if (pageId === "confirmation") return "confirmation";
  if (pageId === "thank-you") return "thank-you";
  if (pageId === "completion") return "thank-you";
  return fallback;
}

function inferPageTypeFromStencilPage(stencilId: FunnelStencilId, page: StencilPage): FunnelPageIntentType {
  const pageId = String(page.id || "").toLowerCase();
  if (pageId === "checkout") return "checkout";
  if (pageId === "thank-you" || pageId === "confirmation" || pageId === "completion") return "thank-you";
  if (pageId === "qualification") return "application";
  if (pageId === "booking") return "booking";
  if (pageId === "registration" || stencilId === "webinar") return "webinar";
  if (stencilId === "booking") return "booking";
  if (stencilId === "sales" || stencilId === "tripwire") return "sales";
  if (stencilId === "lead_capture") return "lead-capture";
  if (stencilId === "multi_step") return pageId === "entry" ? "landing" : "application";
  return "custom";
}

function buildSectionPlan(page: StencilPage, sectionsById: Map<string, StencilSection>) {
  const orderedNames = page.sections
    .map((sectionId) => sectionsById.get(sectionId)?.name || humanizePascal(sectionId))
    .filter(Boolean);
  return orderedNames.join(" -> ");
}

function buildPageShellConcept(manifest: StencilManifest, page: StencilPage, sectionPlan: string) {
  const opening = page.entry ? "Entry page" : page.terminal ? "Terminal page" : "Guided flow page";
  return `${opening} for the ${manifest.title.toLowerCase()}, anchored on ${sectionPlan || "the required conversion sequence"}.`;
}

function inferPlaceholderCta(sectionId: string, label: string, primaryCta: string) {
  const normalized = `${sectionId} ${label}`.toLowerCase();
  if (!/(hero|cta|book|schedule|register|checkout|offer|form)/.test(normalized)) return null;
  if (primaryCta.trim()) {
    return {
      text: primaryCta.trim(),
      href: /hero/.test(normalized) ? "#cta" : `#${sectionId}`,
    };
  }
  if (/book|schedule/.test(normalized)) return { text: "Book a call", href: `#${sectionId}` };
  if (/register/.test(normalized)) return { text: "Register now", href: `#${sectionId}` };
  if (/checkout/.test(normalized)) return { text: "Continue to checkout", href: `#${sectionId}` };
  if (/offer/.test(normalized)) return { text: "See the offer", href: `#${sectionId}` };
  if (/form/.test(normalized)) return { text: "Continue", href: `#${sectionId}` };
  return { text: "Get started", href: "#cta" };
}

function buildSectionFrame(sectionId: string, children: CreditFunnelBlock[], extraStyle?: Record<string, unknown>): CreditFunnelBlock {
  return {
    id: `section_${sectionId}`,
    type: "section",
    props: {
      anchorId: sectionId,
      layout: "one",
      children,
      style: {
        paddingPx: 32,
        borderRadiusPx: 24,
        marginBottomPx: 16,
        backgroundColor: "#ffffff",
        ...(extraStyle || {}),
      },
    },
  };
}

function buildColumnsBlock(id: string, columns: Array<{ title: string; body: string }>): CreditFunnelBlock {
  return {
    id,
    type: "columns",
    props: {
      gapPx: 16,
      stackOnMobile: true,
      columns: columns.map((column, index) => ({
        markdown: "",
        children: [
          {
            id: `${id}_heading_${index}`,
            type: "heading",
            props: { level: 3, text: column.title },
          },
          {
            id: `${id}_paragraph_${index}`,
            type: "paragraph",
            props: { text: column.body },
          },
        ],
      })),
    },
  };
}

type FunnelInitializationInteractiveDefaults = {
  starterFormSlug?: string | null;
};

function buildStencilSectionBlock(
  page: StencilPage,
  section: StencilSection | undefined,
  index: number,
  primaryCta: string,
  interactiveDefaults?: FunnelInitializationInteractiveDefaults,
): CreditFunnelBlock {
  const sectionId = section?.id || `section-${index + 1}`;
  const label = section?.name || humanizePascal(sectionId) || `Section ${index + 1}`;
  const purpose = section?.purpose || "Placeholder section ready for focused editing.";
  const archetype = String(section?.archetype || "").trim().toLowerCase();
  const placeholderCta = inferPlaceholderCta(sectionId, label, primaryCta);
  const starterFormSlug = String(interactiveDefaults?.starterFormSlug || "").trim();
  const headingText = archetype === "confirmation" ? "Booking confirmed" : archetype === "checkout" ? "Choose the best option" : label;
  const introText = purpose;

  if (archetype === "testimonials") {
    return {
      id: `testimonials_${page.id}_${sectionId}`,
      type: "testimonialGrid",
      props: {
        eyebrow: label,
        heading: label,
        intro: purpose,
        columns: 3,
        items: [
          { quote: "Add a short client win or result here.", name: "Customer one", role: "Best fit client" },
          { quote: "Use this space for a second proof point that reduces hesitation.", name: "Customer two", role: "Recent customer" },
          { quote: "Keep the testimonials concrete so the booking or sale feels safer.", name: "Customer three", role: "Ideal customer" },
        ],
      },
    };
  }

  if (archetype === "pricing" || archetype === "checkout" || archetype === "countdown_offer") {
    return {
      id: `pricing_${page.id}_${sectionId}`,
      type: "pricingGrid",
      props: {
        eyebrow: label,
        heading: label,
        intro: purpose,
        columns: archetype === "checkout" ? 1 : 3,
        items: [
          { name: "Starter option", price: "$99", description: "Use this card to explain the simplest next step.", ctaText: placeholderCta?.text || "Get started", ctaHref: placeholderCta?.href || `#${sectionId}` },
          { name: "Main offer", price: "$199", description: "Put the primary option here with the clearest outcome.", badge: "Recommended", ctaText: placeholderCta?.text || "Choose this", ctaHref: placeholderCta?.href || `#${sectionId}`, featured: true },
          { name: "Premium option", price: "$299", description: "Use this if the funnel needs a stronger value ladder.", ctaText: placeholderCta?.text || "See details", ctaHref: placeholderCta?.href || `#${sectionId}` },
        ].slice(0, archetype === "checkout" ? 1 : 3),
      },
    };
  }

  if (archetype === "hero") {
    return buildSectionFrame(sectionId, [
      {
        id: `heading_${page.id}_${sectionId}`,
        type: "heading",
        props: { level: 1, text: headingText },
      },
      {
        id: `paragraph_${page.id}_${sectionId}`,
        type: "paragraph",
        props: { text: introText },
      },
      ...(placeholderCta
        ? [
            {
              id: `button_${page.id}_${sectionId}`,
              type: "button",
              props: { text: placeholderCta.text, href: placeholderCta.href, variant: "primary" },
            } as CreditFunnelBlock,
          ]
        : []),
    ], { backgroundColor: "#f8fafc" });
  }

  if (archetype === "proof") {
    return buildSectionFrame(sectionId, [
      { id: `heading_${page.id}_${sectionId}`, type: "heading", props: { level: 2, text: label } },
      { id: `paragraph_${page.id}_${sectionId}`, type: "paragraph", props: { text: introText } },
      buildColumnsBlock(`columns_${page.id}_${sectionId}`, [
        { title: "Proof point one", body: "Add one short trust marker, result, or credential." },
        { title: "Proof point two", body: "Use this to show credibility before the main ask." },
        { title: "Proof point three", body: "Keep this concrete so the page feels believable fast." },
      ]),
    ], { backgroundColor: "#f8fafc" });
  }

  if (archetype === "features" || archetype === "webinar_agenda") {
    return buildSectionFrame(sectionId, [
      { id: `heading_${page.id}_${sectionId}`, type: "heading", props: { level: 2, text: label } },
      { id: `paragraph_${page.id}_${sectionId}`, type: "paragraph", props: { text: introText } },
      buildColumnsBlock(`columns_${page.id}_${sectionId}`, archetype === "webinar_agenda"
        ? [
            { title: "Opening segment", body: "Clarify what the visitor will learn first." },
            { title: "Main teaching", body: "Describe the biggest mechanism, lesson, or walkthrough." },
            { title: "Q&A or close", body: "Explain how the session ends and what happens next." },
          ]
        : [
            { title: "Benefit one", body: "Use this to explain one clear outcome or deliverable." },
            { title: "Benefit two", body: "Show what changes for the visitor after this step." },
          ]),
    ], { backgroundColor: "#f8fafc" });
  }

  if (archetype === "faq") {
    return buildSectionFrame(sectionId, [
      { id: `heading_${page.id}_${sectionId}`, type: "heading", props: { level: 2, text: label } },
      { id: `paragraph_${page.id}_${sectionId}`, type: "paragraph", props: { text: introText } },
      buildColumnsBlock(`columns_${page.id}_${sectionId}`, [
        { title: "Question one", body: "Add a short answer that removes friction or uncertainty." },
        { title: "Question two", body: "Use this to explain timing, fit, or how the process works." },
      ]),
    ]);
  }

  if (archetype === "form") {
    return buildSectionFrame(sectionId, [
      { id: `heading_${page.id}_${sectionId}`, type: "heading", props: { level: 2, text: label } },
      { id: `paragraph_${page.id}_${sectionId}`, type: "paragraph", props: { text: introText } },
      {
        id: `form_${page.id}_${sectionId}`,
        type: "formEmbed",
        props: {
          formSlug: starterFormSlug,
          height: 640,
          style: { marginTopPx: 12 },
        },
      },
      {
        id: `paragraph_${page.id}_${sectionId}_detail`,
        type: "paragraph",
        props: {
          text: starterFormSlug
            ? "This starter form is live now. Tighten the fields, confirmation state, and follow-up copy as you refine the funnel."
            : "Select this form block and connect a form to make this step live.",
          style: { marginTopPx: 12, maxWidthPx: 760 },
        },
      },
    ], { backgroundColor: "#ffffff", paddingPx: 36, borderRadiusPx: 28 });
  }

  if (archetype === "booking") {
    return buildSectionFrame(sectionId, [
      { id: `heading_${page.id}_${sectionId}`, type: "heading", props: { level: 2, text: label } },
      { id: `paragraph_${page.id}_${sectionId}`, type: "paragraph", props: { text: introText } },
      {
        id: `calendar_${page.id}_${sectionId}`,
        type: "calendarEmbed",
        props: {
          calendarId: "",
          height: 760,
          style: { marginTopPx: 12 },
        },
      },
      {
        id: `paragraph_${page.id}_${sectionId}_detail`,
        type: "paragraph",
        props: {
          text: "This booking step uses the funnel's linked calendar route. You can refine the calendar details and routing after the funnel boots.",
          style: { marginTopPx: 12, maxWidthPx: 760 },
        },
      },
    ], { backgroundColor: "#ffffff", paddingPx: 36, borderRadiusPx: 28 });
  }

  if (archetype === "booking" || archetype === "form" || archetype === "cta" || archetype === "next_step" || archetype === "guarantee" || archetype === "confirmation") {
    return buildSectionFrame(sectionId, [
      { id: `heading_${page.id}_${sectionId}`, type: "heading", props: { level: archetype === "confirmation" ? 1 : 2, text: headingText } },
      { id: `paragraph_${page.id}_${sectionId}`, type: "paragraph", props: { text: introText } },
      ...(placeholderCta
        ? [
            {
              id: `button_${page.id}_${sectionId}`,
              type: "button",
              props: { text: placeholderCta.text, href: placeholderCta.href, variant: archetype === "guarantee" ? "secondary" : "primary" },
            } as CreditFunnelBlock,
          ]
        : []),
    ], archetype === "confirmation" ? { backgroundColor: "#f8fafc" } : undefined);
  }

  return buildSectionFrame(sectionId, [
    {
      id: `heading_${page.id}_${sectionId}`,
      type: "heading",
      props: { level: index === 0 ? 1 : 2, text: label },
    },
    {
      id: `paragraph_${page.id}_${sectionId}`,
      type: "paragraph",
      props: { text: purpose },
    },
    ...(placeholderCta
      ? [
          {
            id: `button_${page.id}_${sectionId}`,
            type: "button",
            props: {
              text: placeholderCta.text,
              href: placeholderCta.href,
              variant: "primary",
            },
          } as CreditFunnelBlock,
        ]
      : []),
  ]);
}

function buildSectionPlaceholderBlocks(
  page: StencilPage,
  sectionsById: Map<string, StencilSection>,
  primaryCta: string,
  interactiveDefaults?: FunnelInitializationInteractiveDefaults,
): CreditFunnelBlock[] {
  return page.sections.map((sectionId, index) => buildStencilSectionBlock(page, sectionsById.get(sectionId), index, primaryCta, interactiveDefaults));
}

async function readStencilManifest(stencilId: FunnelStencilId): Promise<StencilManifest> {
  const cached = manifestCache.get(stencilId);
  if (cached) return cached;

  const promise = (async () => {
    const manifestPath = path.join(process.cwd(), "funnel-stencils", stencilId, "stencil.json");
    const raw = await fs.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      throw new Error(`Invalid stencil manifest for ${stencilId}`);
    }

    const sections = Array.isArray(parsed.sections)
      ? parsed.sections
          .map((entry) => {
            if (!isRecord(entry)) return null;
            const id = cleanText(entry.id, 80);
            const name = cleanText(entry.name, 160);
            const purpose = cleanText(entry.purpose, 320);
            const archetype = cleanText(entry.archetype, 80);
            if (!id || !name) return null;
            return { id, name, purpose, ...(archetype ? { archetype } : {}) } satisfies StencilSection;
          })
          .filter(Boolean) as StencilSection[]
      : [];
    const pages = Array.isArray(parsed.pages)
      ? parsed.pages
          .map((entry) => {
            if (!isRecord(entry)) return null;
            const id = cleanText(entry.id, 80);
            const name = cleanText(entry.name, 160);
            const goal = cleanText(entry.goal, 240);
            const sectionIds = Array.isArray(entry.sections)
              ? entry.sections.map((value) => cleanText(value, 80)).filter(Boolean)
              : [];
            if (!id || !name) return null;
            return {
              id,
              name,
              goal,
              sections: sectionIds,
              entry: entry.entry === true,
              terminal: entry.terminal === true,
            } satisfies StencilPage;
          })
          .filter(Boolean) as StencilPage[]
      : [];

    return {
      schemaVersion: Number(parsed.schemaVersion || 0),
      stencilId,
      title: cleanText(parsed.title, 180) || getFunnelStencilMeta(stencilId).label,
      conversionGoal: cleanText(parsed.conversionGoal, 320),
      notes: Array.isArray(parsed.notes) ? parsed.notes.map((note) => cleanText(note, 240)).filter(Boolean) : [],
      sections,
      pages,
    } satisfies StencilManifest;
  })();

  manifestCache.set(stencilId, promise);
  return promise;
}

function buildCustomSeed(input: {
  funnelName: string;
  pageType: FunnelPageIntentType;
  pageGoal: string;
  primaryCta: string;
  offer: string;
  shellConcept: string;
  sectionPlan: string;
  interactiveDefaults?: FunnelInitializationInteractiveDefaults;
}): FunnelInitializationSeed {
  const firstPageNaming = buildSuggestedPageNaming({
    pageType: input.pageType,
    primaryCta: input.primaryCta,
    offer: input.offer,
    fallbackSlug: "home",
    fallbackTitle: input.funnelName || "Home",
  });
  const title = firstPageNaming.title || input.funnelName || "Home";
  const primaryCta = input.primaryCta.trim() || "Start the next step";
  const starterFormSlug = String(input.interactiveDefaults?.starterFormSlug || "").trim();
  const starterGoal = input.pageGoal.trim()
    ? `${input.pageGoal.trim()} Use this opening pass to tighten the promise, stage proof close to the ask, and make the next step feel obvious.`
    : "Use this opening pass to name the audience, clarify the offer, stage concrete proof, and make the next step feel obvious.";

  return {
    slug: "home",
    title,
    sortOrder: 0,
    editorMode: "BLOCKS",
    contentMarkdown: "",
    customHtml: "",
    blocksJson: [
      buildSectionFrame(
        "start",
        [
          {
            id: "heading_home_start",
            type: "heading",
            props: { level: 1, text: title, style: { align: "left" } },
          },
          {
            id: "paragraph_home_start",
            type: "paragraph",
            props: { text: starterGoal, style: { align: "left", maxWidthPx: 760 } },
          },
          buildColumnsBlock("columns_home_start", [
            {
              title: "Lead with the offer",
              body: "Name the audience, the offer, and the core outcome before the visitor scrolls past the hero.",
            },
            {
              title: "Stage trust fast",
              body: "Put reviews, results, or a case study proof module beside the main ask so the page feels earned instead of generic.",
            },
            {
              title: "Define the next step",
              body: "Use one primary CTA and one short line on confirmation, response time, or what happens next after they click.",
            },
          ]),
          {
            id: "button_home_start_primary",
            type: "button",
            props: { text: primaryCta, href: "#next-step", variant: "primary", style: { maxWidthPx: 320 } },
          },
          {
            id: "button_home_start_secondary",
            type: "button",
            props: { text: "Review the starter flow", href: "#proof", variant: "secondary", style: { maxWidthPx: 320 } },
          },
        ],
        { backgroundColor: "#f8fafc", paddingPx: 40, borderRadiusPx: 28 },
      ),
      buildSectionFrame(
        "proof",
        [
          {
            id: "heading_home_proof",
            type: "heading",
            props: { level: 2, text: "Put proof next to the decision" },
          },
          {
            id: "paragraph_home_proof",
            type: "paragraph",
            props: {
              text: "Strong first pages reduce blank-canvas fear by giving you a believable proof rhythm: reviews, operator outcomes, and one concrete result before the main ask.",
              style: { maxWidthPx: 760 },
            },
          },
          {
            id: "testimonial_grid_home_proof",
            type: "testimonialGrid",
            props: {
              eyebrow: "Proof starter",
              heading: "Replace these with real reviews or case-study outcomes",
              intro: "Keep the proof concrete so the page earns trust quickly.",
              columns: 3,
              items: [
                {
                  quote: "Add a client review, case study result, or founder outcome here so the page earns trust with something concrete.",
                  name: "Best-fit client",
                  role: "Proof placeholder",
                  outcome: "Results snapshot",
                },
                {
                  quote: "Use this card for a second proof point tied to time saved, revenue increased, reduced friction, or another believable outcome.",
                  name: "Recent customer",
                  role: "Review placeholder",
                  outcome: "Operational outcome",
                },
                {
                  quote: "Show the third proof signal that makes the next step feel safe: reviews, outcomes, or a short case study moment.",
                  name: "Qualified operator",
                  role: "Case study placeholder",
                  outcome: "Trust signal",
                },
              ],
            },
          },
        ],
        { backgroundColor: "#ffffff", paddingPx: 36, borderRadiusPx: 28 },
      ),
      buildSectionFrame(
        "offer",
        [
          {
            id: "heading_home_offer",
            type: "heading",
            props: { level: 2, text: "Map the conversion path before you decorate it" },
          },
          {
            id: "paragraph_home_offer",
            type: "paragraph",
            props: {
              text: "Market-leading builders start with a guided structure: what the visitor gets, why they can trust it, and what happens next. Fill those three beats before you widen the page.",
              style: { maxWidthPx: 760 },
            },
          },
          buildColumnsBlock("columns_home_offer", [
            {
              title: "What they get",
              body: "State the offer, the mechanism, and the promised outcome in plain language.",
            },
            {
              title: "Why they believe it",
              body: "Connect the offer to proof, reviews, results, or a case study that supports the claim.",
            },
            {
              title: "What happens next",
              body: "Explain the CTA handoff, the confirmation, and the next step after a call, form, application, or checkout.",
            },
          ]),
        ],
        { backgroundColor: "#f8fafc", paddingPx: 36, borderRadiusPx: 28 },
      ),
      buildSectionFrame(
        "next-step",
        [
          {
            id: "heading_home_next_step",
            type: "heading",
            props: { level: 2, text: "Make the handoff feel safe and specific" },
          },
          {
            id: "paragraph_home_next_step",
            type: "paragraph",
            props: {
              text: "Use this last section to point at one next step only. That can be a booking call, a form, an application, or checkout, but the visitor should understand the confirmation and follow-up before they click.",
              style: { maxWidthPx: 760 },
            },
          },
          ...(
            input.pageType === "lead-capture" || input.pageType === "application" || input.pageType === "webinar"
              ? [
                  {
                    id: "form_home_next_step",
                    type: "formEmbed",
                    props: { formSlug: starterFormSlug, height: 640, style: { marginTopPx: 12 } },
                  } as CreditFunnelBlock,
                  {
                    id: "paragraph_home_next_step_form_detail",
                    type: "paragraph",
                    props: {
                      text: starterFormSlug
                        ? "This starter form is already live. Adjust the fields and response experience instead of rebuilding the handoff from scratch."
                        : "Connect a form here to make this starter handoff live.",
                      style: { marginTopPx: 12, maxWidthPx: 760 },
                    },
                  } as CreditFunnelBlock,
                ]
              : input.pageType === "booking"
                ? [
                    {
                      id: "calendar_home_next_step",
                      type: "calendarEmbed",
                      props: { calendarId: "", height: 760, style: { marginTopPx: 12 } },
                    } as CreditFunnelBlock,
                    {
                      id: "paragraph_home_next_step_booking_detail",
                      type: "paragraph",
                      props: {
                        text: "This starter booking step will use the funnel's linked calendar route once the funnel is created.",
                        style: { marginTopPx: 12, maxWidthPx: 760 },
                      },
                    } as CreditFunnelBlock,
                  ]
                : []
          ),
          {
            id: "button_home_next_step",
            type: "button",
            props: { text: primaryCta, href: "#next-step", variant: "primary", style: { maxWidthPx: 320 } },
          },
        ],
        { backgroundColor: "#ffffff", paddingPx: 36, borderRadiusPx: 28 },
      ),
    ],
    briefSeed: {
      pageType: input.pageType,
      pageGoal: input.pageGoal,
      shellConcept: input.shellConcept,
      sectionPlan: input.sectionPlan,
      askClarifyingQuestions: false,
    },
  };
}

export async function buildFunnelInitializationScaffold(input: {
  funnelName: string;
  pageType: FunnelPageIntentType;
  pageGoal: string;
  primaryCta: string;
  offer: string;
  preferCustomMode?: boolean;
  shellConcept: string;
  sectionPlan: string;
  interactiveDefaults?: FunnelInitializationInteractiveDefaults;
  decisionInput: {
    pageType?: unknown;
    funnelGoal?: unknown;
    offer?: unknown;
    audience?: unknown;
    primaryCta?: unknown;
    name?: unknown;
    slug?: unknown;
    preferCustomMode?: unknown;
  };
}): Promise<FunnelInitializationScaffold> {
  const decision = decideFunnelInitialization(input.decisionInput);
  if (decision.mode !== "stencil" || !decision.stencilId) {
    const seed = buildCustomSeed({
      funnelName: input.funnelName,
      pageType: input.pageType,
      pageGoal: input.pageGoal,
      primaryCta: input.primaryCta,
      offer: input.offer,
      shellConcept: input.shellConcept,
      sectionPlan: input.sectionPlan,
      interactiveDefaults: input.interactiveDefaults,
    });
    return {
      decision,
      seeds: [seed],
      summary: {
        mode: "custom",
        confidence: decision.confidence,
        label: "Custom",
        summary: decision.summary,
        reason: decision.reason,
        pageTitles: [seed.title],
        pageCount: 1,
      },
    };
  }

  const stencilId = decision.stencilId;
  const manifest = await readStencilManifest(stencilId);
  const sectionsById = new Map(manifest.sections.map((section) => [section.id, section]));
  const seeds = manifest.pages.map((page, index) => {
    const fallbackName = humanizePascal(String(page.name || "").replace(/Page$/i, "")) || `Page ${index + 1}`;
    const slug = slugForStencilPage(page, fallbackName.toLowerCase().replace(/\s+/g, "-"));
    const title = titleForStencilPage(page, index === 0 ? input.funnelName : "");
    const sectionPlan = buildSectionPlan(page, sectionsById);
    return {
      slug,
      title,
      sortOrder: index,
      editorMode: "BLOCKS",
      contentMarkdown: "",
      customHtml: "",
      blocksJson: buildSectionPlaceholderBlocks(page, sectionsById, input.primaryCta, input.interactiveDefaults),
      briefSeed: {
        pageType: inferPageTypeFromStencilPage(stencilId, page),
        pageGoal: page.goal || input.pageGoal,
        shellConcept: buildPageShellConcept(manifest, page, sectionPlan),
        sectionPlan,
        askClarifyingQuestions: false,
      },
    } satisfies FunnelInitializationSeed;
  });

  return {
    decision,
    seeds,
    summary: {
      mode: "stencil",
      confidence: decision.confidence,
      stencilId,
      label: manifest.title || getFunnelStencilMeta(stencilId).label,
      summary: `Initialized the ${getFunnelStencilMeta(stencilId).label.toLowerCase()} stencil with ${seeds.length} page${seeds.length === 1 ? "" : "s"} and stable section scaffolding.`,
      reason: decision.reason,
      pageTitles: seeds.map((seed) => seed.title),
      pageCount: seeds.length,
    },
  };
}