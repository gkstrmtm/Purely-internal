import { resolveFunnelShellFrame } from "@/lib/funnelShellFrames";

export const FUNNEL_PAGE_INTENT_MARKER = "[[PAGE_INTENT_V1]]";

export const FUNNEL_PAGE_INTENT_TYPES = [
  "landing",
  "lead-capture",
  "booking",
  "sales",
  "checkout",
  "thank-you",
  "application",
  "webinar",
  "home",
  "custom",
] as const;

export const FUNNEL_PAGE_FORM_STRATEGIES = [
  "none",
  "embed-form",
  "link-form",
  "auto-create-form",
  "booking",
  "checkout",
  "chatbot",
  "application",
] as const;

export const FUNNEL_PAGE_MEDIA_MODES = ["auto", "image", "video", "none"] as const;

export type FunnelPageIntentType = (typeof FUNNEL_PAGE_INTENT_TYPES)[number];
export type FunnelPageFormStrategy = (typeof FUNNEL_PAGE_FORM_STRATEGIES)[number];
export type FunnelPageMediaMode = (typeof FUNNEL_PAGE_MEDIA_MODES)[number];

export type FunnelPageMediaReference = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

export type FunnelPageMediaPlan = {
  heroAssetMode: FunnelPageMediaMode;
  heroAssetNote: string;
  heroImage?: FunnelPageMediaReference;
  heroVideo?: FunnelPageMediaReference;
};

export type FunnelBriefProfile = {
  companyContext: string;
  funnelGoal: string;
  offerSummary: string;
  audienceSummary: string;
  qualificationFields: string;
  routingDestination: string;
  conditionalLogic: string;
  taggingPlan: string;
  automationPlan: string;
  integrationPlan: string;
};

export type FunnelPageIntentProfile = {
  pageType: FunnelPageIntentType;
  pageGoal: string;
  audience: string;
  offer: string;
  primaryCta: string;
  companyContext: string;
  qualificationFields: string;
  routingDestination: string;
  conditionalLogic: string;
  taggingPlan: string;
  automationPlan: string;
  formStrategy: FunnelPageFormStrategy;
  mediaPlan: FunnelPageMediaPlan;
  shellFrameId: string;
  shellConcept: string;
  sectionPlan: string;
  askClarifyingQuestions: boolean;
};

export type FunnelFoundationContextSource = "profile" | "funnel" | "page" | "route";

export type FunnelFoundationBusinessContext = {
  businessName?: string | null;
  industry?: string | null;
  businessModel?: string | null;
  primaryGoals?: unknown;
  targetCustomer?: string | null;
  brandVoice?: string | null;
  businessContext?: string | null;
};

export type FunnelFoundationContextSignal = {
  source: FunnelFoundationContextSource;
  label: string;
  value: string;
};

export type FunnelFoundationOverview = {
  headline: string;
  summary: string;
  conversionPath: string;
  businessNarrative: string;
  assetPlanSummary: string;
  assetSignals: string[];
  recommendations: string[];
  askForClarification: boolean;
  readinessLabel: string;
  contextSummary: string;
  contextSignals: FunnelFoundationContextSignal[];
  missingContext: string[];
  shellFrameId: string;
  shellFrameLabel: string;
  frameSummary: string;
  designDirectives: string[];
  shellConcept: string;
  sectionPlanItems: string[];
};

export type FunnelFoundationCapabilityStatus = "ready" | "needs-setup" | "planned" | "not-needed";

export type FunnelFoundationCapability = {
  key: "primary-conversion" | "form" | "booking" | "checkout" | "chatbot" | "hero-media";
  label: string;
  status: FunnelFoundationCapabilityStatus;
  summary: string;
};

export type FunnelFoundationCapabilityInputs = {
  existingFormsCount?: number | null;
  bookingCalendarsCount?: number | null;
  stripeProductsCount?: number | null;
  aiAgentsCount?: number | null;
  heroImageAttached?: boolean | null;
  heroVideoAttached?: boolean | null;
};

export type ResolvedFunnelFoundation = FunnelFoundationOverview & {
  routeLabel: string;
  pageLabel: string;
  pageType: FunnelPageIntentType;
  pageGoal: string;
  audience: string;
  offer: string;
  primaryCta: string;
  routingDestination: string;
  formStrategy: FunnelPageFormStrategy;
  mediaPlan: FunnelPageMediaPlan;
  sectionPlan: string;
  capabilityGraph: FunnelFoundationCapability[];
  capabilitySummary: string;
  platformReadinessLabel: string;
};

export type FunnelFoundationArtifact = {
  version: 1;
  materialHash: string;
  generatedAt: string;
  source: "ai" | "fallback";
  strategicSummary: string;
  narrative: string;
  assumption: string;
  shellRationale: string[];
  conversionRisks: string[];
  nextMoves: string[];
  resolvedFoundation: ResolvedFunnelFoundation;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function cleanMediaReference(value: unknown): FunnelPageMediaReference | null {
  if (!isRecord(value)) return null;
  const url = cleanText(value.url, 1200);
  if (!url) return null;
  const fileName = cleanText(value.fileName, 160);
  const mimeType = cleanText(value.mimeType, 120);
  return {
    url,
    ...(fileName ? { fileName } : null),
    ...(mimeType ? { mimeType } : null),
  };
}

function cleanTextList(value: unknown, maxItems = 4, maxLen = 120) {
  if (!Array.isArray(value)) return [] as string[];
  const out: string[] = [];
  for (const item of value) {
    const next = cleanText(item, maxLen);
    if (!next || out.includes(next)) continue;
    out.push(next);
    if (out.length >= maxItems) break;
  }
  return out;
}

function formatListSummary(items: string[], maxItems = 2) {
  const cleanItems = items.filter(Boolean).slice(0, maxItems + 1);
  if (!cleanItems.length) return "";
  if (cleanItems.length === 1) return cleanItems[0];
  if (cleanItems.length === 2) return `${cleanItems[0]} and ${cleanItems[1]}`;
  return `${cleanItems.slice(0, maxItems).join(", ")} +${cleanItems.length - maxItems} more`;
}

function lowerFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function normalizeIntentSentence(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function startsWithVowelSound(value: string) {
  return /^[aeiou]/i.test(String(value || "").trim());
}

function withArticle(value: string) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return "";
  return `${startsWithVowelSound(cleanValue) ? "an" : "a"} ${cleanValue}`;
}

function buildBusinessNarrative(input: {
  businessName: string;
  industry: string;
  businessModel: string;
  targetCustomer: string;
  primaryGoals: string[];
  funnelGoal: string;
  offer: string;
  audience: string;
  pageGoal: string;
  hasBusinessContext: boolean;
}) {
  const subject = input.businessName || "This business";
  const descriptorParts: string[] = [];
  if (input.industry) descriptorParts.push(`${input.industry} business`);
  if (input.businessModel) descriptorParts.push(input.industry ? `with ${lowerFirst(input.businessModel)} operations` : `with a ${lowerFirst(input.businessModel)} model`);

  const identityLine = descriptorParts.length
    ? `${subject} currently reads like ${withArticle(descriptorParts[0])}${descriptorParts[1] ? ` ${descriptorParts[1]}` : ""}.`
    : `${subject} is being treated as a defined operating business rather than a blank project.`;

  const audienceLine = input.targetCustomer || input.audience ? "It appears to serve a fairly specific audience rather than speaking to everyone." : "The audience is still being inferred from route and funnel cues.";
  const operationalGoal = input.funnelGoal || input.pageGoal;
  const objectiveLine = operationalGoal
    ? `Operationally, AI is treating it as a business that needs a strong trust-to-action path around the current commercial goal.`
    : "Operationally, AI is inferring the commercial goal from the current page and funnel setup.";
  const goalsLine = input.primaryGoals.length ? "The profile also suggests clear growth or conversion pressure, so the funnel should stay deliberate and action-oriented." : "";
  const detailLine = input.hasBusinessContext
    ? "There is enough operating detail in the saved profile to make the draft more specific instead of relying on generic market language."
    : "";

  return [identityLine, audienceLine, objectiveLine, goalsLine, detailLine].filter(Boolean).join(" ");
}

function parseSectionPlanItems(raw: string) {
  return String(raw || "")
    .split(/->|\n|•|\u2022/g)
    .map((item) => item.replace(/^[-\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function pushContextSignal(signals: FunnelFoundationContextSignal[], signal: FunnelFoundationContextSignal | null) {
  if (!signal || !signal.value) return;
  if (signals.some((existing) => existing.label === signal.label && existing.value === signal.value)) return;
  signals.push(signal);
}

function isMediaMode(value: unknown): value is FunnelPageMediaMode {
  return typeof value === "string" && (FUNNEL_PAGE_MEDIA_MODES as readonly string[]).includes(value);
}

function isIntentType(value: unknown): value is FunnelPageIntentType {
  return typeof value === "string" && (FUNNEL_PAGE_INTENT_TYPES as readonly string[]).includes(value);
}

function isFormStrategy(value: unknown): value is FunnelPageFormStrategy {
  return typeof value === "string" && (FUNNEL_PAGE_FORM_STRATEGIES as readonly string[]).includes(value);
}

function asCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function summarizeCapabilityGraph(capabilityGraph: FunnelFoundationCapability[]) {
  const blockers = capabilityGraph.filter((capability) => capability.status === "needs-setup");
  if (blockers.length) {
    return `${blockers[0].label} still needs setup before the page handoff is fully real.`;
  }

  const planned = capabilityGraph.filter((capability) => capability.status === "planned");
  if (planned.length) {
    return `${planned[0].label} is directionally planned, but the page still needs a concrete live binding.`;
  }

  const ready = capabilityGraph.filter((capability) => capability.status === "ready");
  if (ready.length) {
    return "Core direction and the main handoff path are grounded enough to draft without pretending the wiring is done.";
  }

  return "This page can draft from a strong narrative direction, but the runtime handoff is still mostly conceptual.";
}

function deriveFoundationReadinessLabel(askForClarification: boolean, capabilityGraph: FunnelFoundationCapability[]) {
  if (askForClarification) return "Needs one decisive clarification";
  if (capabilityGraph.some((capability) => capability.status === "needs-setup")) return "Direction ready, setup pending";
  if (capabilityGraph.some((capability) => capability.status === "planned")) return "Direction ready, staging next";
  return "Ready to draft";
}

function buildFoundationCapabilityGraph(input: {
  pageType: FunnelPageIntentType;
  formStrategy: FunnelPageFormStrategy;
  primaryCta: string;
  mediaPlan: FunnelPageMediaPlan;
  capabilityInputs?: FunnelFoundationCapabilityInputs | null;
}) {
  const capabilityInputs = input.capabilityInputs ?? null;
  const existingFormsCount = asCount(capabilityInputs?.existingFormsCount);
  const bookingCalendarsCount = asCount(capabilityInputs?.bookingCalendarsCount);
  const stripeProductsCount = asCount(capabilityInputs?.stripeProductsCount);
  const aiAgentsCount = asCount(capabilityInputs?.aiAgentsCount);
  const heroImageAttached = Boolean(capabilityInputs?.heroImageAttached || input.mediaPlan.heroImage?.url);
  const heroVideoAttached = Boolean(capabilityInputs?.heroVideoAttached || input.mediaPlan.heroVideo?.url);

  const capabilityGraph: FunnelFoundationCapability[] = [
    {
      key: "primary-conversion",
      label: "Primary conversion",
      status: "ready",
      summary: input.primaryCta ? `The page is steering toward '${input.primaryCta}' as the main action.` : "The page has a defined conversion motion.",
    },
  ];

  if (input.formStrategy === "booking") {
    capabilityGraph.push({
      key: "booking",
      label: "Booking handoff",
      status: bookingCalendarsCount > 0 ? "ready" : "needs-setup",
      summary: bookingCalendarsCount > 0 ? "A booking calendar is available for a real scheduling handoff." : "No booking calendar is configured yet.",
    });
  } else if (input.formStrategy === "checkout") {
    capabilityGraph.push({
      key: "checkout",
      label: "Checkout handoff",
      status: stripeProductsCount > 0 ? "ready" : "needs-setup",
      summary: stripeProductsCount > 0 ? "Stripe products with live pricing are available for checkout." : "No priced Stripe products are available for a real checkout path yet.",
    });
  } else if (input.formStrategy === "chatbot") {
    capabilityGraph.push({
      key: "chatbot",
      label: "Chatbot handoff",
      status: aiAgentsCount > 0 ? "ready" : "needs-setup",
      summary: aiAgentsCount > 0 ? "At least one AI agent is available for a live chat handoff." : "No AI chat agent is configured yet.",
    });
  } else if (input.formStrategy === "embed-form" || input.formStrategy === "link-form") {
    capabilityGraph.push({
      key: "form",
      label: "Form handoff",
      status: existingFormsCount > 0 ? "ready" : "needs-setup",
      summary: existingFormsCount > 0 ? "Existing forms are available to bind into this page." : "No hosted forms are available to bind into this page yet.",
    });
  } else if (input.formStrategy === "auto-create-form" || input.formStrategy === "application") {
    capabilityGraph.push({
      key: "form",
      label: input.formStrategy === "application" ? "Application handoff" : "Form handoff",
      status: existingFormsCount > 0 ? "planned" : "needs-setup",
      summary:
        existingFormsCount > 0
          ? "A form path is planned, but this page still needs a concrete form binding to be truthful live."
          : "The page wants a form-led handoff, but no hosted form is available yet.",
    });
  }

  if (input.mediaPlan.heroAssetMode === "video") {
    capabilityGraph.push({
      key: "hero-media",
      label: "Hero media",
      status: heroVideoAttached ? "ready" : "planned",
      summary: heroVideoAttached ? "A hero video is already attached." : "A VSL-style opening is planned, but no video is attached yet.",
    });
  } else if (input.mediaPlan.heroAssetMode === "image") {
    capabilityGraph.push({
      key: "hero-media",
      label: "Hero media",
      status: heroImageAttached ? "ready" : "planned",
      summary: heroImageAttached ? "A hero image is already attached." : "A visual opening is planned, but no hero image is attached yet.",
    });
  } else if (input.mediaPlan.heroAssetMode === "none") {
    capabilityGraph.push({
      key: "hero-media",
      label: "Hero media",
      status: "not-needed",
      summary: "The opening is intentionally text-led with no hero media dependency.",
    });
  }

  return capabilityGraph;
}

function defaultCtaForPageType(pageType: FunnelPageIntentType) {
  if (pageType === "booking") return "Book a call";
  if (pageType === "sales") return "Buy now";
  if (pageType === "checkout") return "Complete purchase";
  if (pageType === "lead-capture") return "Get the offer";
  if (pageType === "application") return "Apply now";
  if (pageType === "webinar") return "Reserve your seat";
  if (pageType === "thank-you") return "See next steps";
  return "Get started";
}

function cleanSlugSeed(value: unknown, max = 64) {
  return String(typeof value === "string" ? value : "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max);
}

export function defaultSlugForPageType(pageType: FunnelPageIntentType) {
  if (pageType === "booking") return "book-call";
  if (pageType === "lead-capture") return "get-started";
  if (pageType === "sales") return "offer";
  if (pageType === "checkout") return "checkout";
  if (pageType === "thank-you") return "thank-you";
  if (pageType === "application") return "apply";
  if (pageType === "webinar") return "register";
  if (pageType === "home") return "home";
  if (pageType === "custom") return "page";
  return "landing";
}

export function defaultTitleForPageType(pageType: FunnelPageIntentType) {
  if (pageType === "booking") return "Book a Call";
  if (pageType === "lead-capture") return "Get Started";
  if (pageType === "sales") return "Offer Overview";
  if (pageType === "checkout") return "Checkout";
  if (pageType === "thank-you") return "Thank You";
  if (pageType === "application") return "Apply Now";
  if (pageType === "webinar") return "Reserve Your Seat";
  if (pageType === "home") return "Home";
  if (pageType === "custom") return "Custom Page";
  return "Landing Page";
}

export function defaultSlugForFunnelType(pageType: FunnelPageIntentType) {
  if (pageType === "booking") return "book-call";
  if (pageType === "lead-capture") return "get-started";
  if (pageType === "sales") return "offer";
  if (pageType === "checkout") return "checkout";
  if (pageType === "thank-you") return "thank-you";
  if (pageType === "application") return "apply";
  if (pageType === "webinar") return "register";
  if (pageType === "home") return "home";
  if (pageType === "custom") return "funnel";
  return "landing";
}

export function defaultNameForFunnelType(pageType: FunnelPageIntentType) {
  if (pageType === "booking") return "Booking Funnel";
  if (pageType === "lead-capture") return "Lead Capture Funnel";
  if (pageType === "sales") return "Sales Funnel";
  if (pageType === "checkout") return "Checkout Funnel";
  if (pageType === "thank-you") return "Thank You Funnel";
  if (pageType === "application") return "Application Funnel";
  if (pageType === "webinar") return "Webinar Funnel";
  if (pageType === "home") return "Home Funnel";
  if (pageType === "custom") return "Custom Funnel";
  return "Landing Funnel";
}

function titleCaseSeed(value: unknown, max = 120) {
  const cleanValue = cleanText(value, max);
  if (!cleanValue) return "";
  return cleanValue
    .split(/\s+/)
    .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part))
    .join(" ")
    .slice(0, max);
}

export function buildSuggestedFunnelNaming(input?: {
  pageType?: unknown;
  funnelGoal?: unknown;
  offer?: unknown;
  primaryCta?: unknown;
  fallbackSlug?: unknown;
  fallbackName?: unknown;
  templateLabel?: unknown;
}) {
  const pageType = isIntentType(input?.pageType) ? input.pageType : "landing";
  const fallbackSlug = cleanSlugSeed(input?.fallbackSlug, 60);
  const fallbackName = cleanText(input?.fallbackName, 120);
  const templateLabel = cleanText(input?.templateLabel, 120);
  const funnelGoal = cleanText(input?.funnelGoal, 180);
  const offer = cleanText(input?.offer, 160);
  const primaryCta = cleanText(input?.primaryCta, 120);
  const explicitGoal = funnelGoal && normalizeIntentSentence(funnelGoal) !== normalizeIntentSentence(defaultFunnelGoalForPageType(pageType));
  const explicitOffer = offer && normalizeIntentSentence(offer) !== normalizeIntentSentence(defaultOfferForPageType(pageType));
  const explicitCta = primaryCta && normalizeIntentSentence(primaryCta) !== normalizeIntentSentence(defaultCtaForPageType(pageType));
  const namingSeed = explicitOffer
    ? offer
    : explicitGoal
      ? funnelGoal
      : explicitCta
        ? primaryCta
        : templateLabel || defaultSlugForFunnelType(pageType);
  const suggestedSlug = fallbackSlug || cleanSlugSeed(namingSeed, 60) || defaultSlugForFunnelType(pageType);
  const suggestedName =
    fallbackName ||
    titleCaseSeed(explicitOffer ? `${offer} funnel` : explicitCta ? `${primaryCta} funnel` : templateLabel || defaultNameForFunnelType(pageType), 120) ||
    defaultNameForFunnelType(pageType);

  return {
    slug: suggestedSlug,
    name: suggestedName,
  };
}

export function buildSuggestedPageNaming(input?: {
  pageType?: unknown;
  primaryCta?: unknown;
  offer?: unknown;
  fallbackSlug?: unknown;
  fallbackTitle?: unknown;
}) {
  const pageType = isIntentType(input?.pageType) ? input.pageType : "landing";
  const fallbackSlug = cleanSlugSeed(input?.fallbackSlug, 64);
  const fallbackTitle = cleanText(input?.fallbackTitle, 160);
  const offer = cleanText(input?.offer, 160);
  const primaryCta = cleanText(input?.primaryCta, 120);
  const explicitOffer = offer && normalizeIntentSentence(offer) !== normalizeIntentSentence(defaultOfferForPageType(pageType));
  const explicitCta = primaryCta && normalizeIntentSentence(primaryCta) !== normalizeIntentSentence(defaultCtaForPageType(pageType));
  const suggestedSlug =
    fallbackSlug ||
    cleanSlugSeed(explicitOffer ? offer : explicitCta ? primaryCta : defaultSlugForPageType(pageType), 64) ||
    defaultSlugForPageType(pageType);
  const suggestedTitle = fallbackTitle || (explicitOffer ? offer : explicitCta ? primaryCta : defaultTitleForPageType(pageType));

  return {
    slug: suggestedSlug,
    title: suggestedTitle || defaultTitleForPageType(pageType),
  };
}

function formatIntentTypeLabel(pageType: FunnelPageIntentType) {
  return pageType
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatFormStrategyLabel(formStrategy: FunnelPageFormStrategy) {
  if (formStrategy === "embed-form") return "Embedded form";
  if (formStrategy === "link-form") return "Linked form";
  if (formStrategy === "auto-create-form") return "Auto-created form";
  if (formStrategy === "booking") return "Booking flow";
  if (formStrategy === "checkout") return "Checkout flow";
  if (formStrategy === "chatbot") return "Chat handoff";
  if (formStrategy === "application") return "Application flow";
  return "No special platform flow";
}

function defaultFunnelGoalForPageType(pageType: FunnelPageIntentType) {
  if (pageType === "booking") return "Turn qualified visitors into booked calls";
  if (pageType === "sales") return "Move qualified visitors from interest to purchase";
  if (pageType === "checkout") return "Finish the purchase with minimal drop-off";
  if (pageType === "lead-capture") return "Convert interest into a lead with a clear value exchange";
  if (pageType === "application") return "Filter for fit and collect strong applications";
  if (pageType === "webinar") return "Turn interest into webinar registrations";
  if (pageType === "thank-you") return "Confirm the action and move the visitor to the right next step";
  if (pageType === "home") return "Route visitors into the right funnel path";
  return "Frame the offer clearly and move the visitor to the primary CTA";
}

function defaultAudienceForPageType(pageType: FunnelPageIntentType) {
  if (pageType === "booking") return "high-intent visitors who are close to taking action";
  if (pageType === "sales") return "buyers already aware of the offer and weighing the purchase";
  if (pageType === "checkout") return "ready-to-buy visitors who need reassurance, not another pitch";
  if (pageType === "lead-capture") return "visitors who want a clear next step before committing";
  if (pageType === "application") return "visitors who may qualify for a more selective next step";
  if (pageType === "webinar") return "visitors interested in learning before they commit";
  if (pageType === "thank-you") return "people who just completed the main action";
  return "the best-fit audience for this page";
}

function defaultOfferForPageType(pageType: FunnelPageIntentType) {
  if (pageType === "booking") return "a consultation, demo, or strategic call";
  if (pageType === "sales") return "the paid offer being sold in this funnel";
  if (pageType === "checkout") return "the offer the visitor is about to purchase";
  if (pageType === "lead-capture") return "a clear lead magnet, audit, quote, or next-step offer";
  if (pageType === "application") return "an application into the main offer or program";
  if (pageType === "webinar") return "the webinar registration and the promise behind it";
  if (pageType === "thank-you") return "the completed action and what happens after it";
  return "the core offer or next conversion action";
}

function defaultQualificationForPageType(pageType: FunnelPageIntentType, formStrategy: FunnelPageFormStrategy) {
  if (pageType === "application") return "Ask only for the details needed to judge fit and commitment.";
  if (pageType === "booking") return "Capture only the details needed to route the call or prep the conversation.";
  if (formStrategy === "auto-create-form" || formStrategy === "embed-form" || formStrategy === "link-form") {
    return "Capture the minimum details needed to follow up intelligently.";
  }
  return "";
}

function defaultRoutingForPageType(pageType: FunnelPageIntentType, funnelSlug: string, primaryCta: string) {
  if (pageType === "thank-you") return "Confirm the action, set expectations, and direct them to the next logical step.";
  if (pageType === "checkout") return "Move the visitor straight into checkout completion with as little friction as possible.";
  if (pageType === "booking") return primaryCta ? `Route qualified visitors into '${primaryCta}' and confirm what happens next.` : "Route qualified visitors into a booking step and confirm what happens next.";
  if (pageType === "application") return "Send qualified visitors into the application flow and explain the review process.";
  if (pageType === "lead-capture" || pageType === "webinar") return "Capture the lead, then explain the immediate next step and follow-up.";
  if (funnelSlug) return `Continue the visitor through /${funnelSlug} after the primary action.`;
  return primaryCta ? `Move the visitor to '${primaryCta}' as the clear next step.` : "Move the visitor to the clearest next step.";
}

function defaultHeroAssetModeForPageType(pageType: FunnelPageIntentType): FunnelPageMediaMode {
  if (pageType === "sales" || pageType === "webinar") return "video";
  if (pageType === "checkout" || pageType === "thank-you") return "none";
  return "image";
}

function inferMediaPlan(existing: unknown, pageType: FunnelPageIntentType): FunnelPageMediaPlan {
  const raw = isRecord(existing) ? existing : null;
  const heroImage = cleanMediaReference(raw?.heroImage);
  const heroVideo = cleanMediaReference(raw?.heroVideo);
  const heroAssetNote = cleanText(raw?.heroAssetNote, 240);
  const heroAssetMode = isMediaMode(raw?.heroAssetMode)
    ? raw.heroAssetMode
    : heroVideo
      ? "video"
      : heroImage
        ? "image"
        : defaultHeroAssetModeForPageType(pageType);

  return {
    heroAssetMode,
    heroAssetNote,
    ...(heroImage ? { heroImage } : null),
    ...(heroVideo ? { heroVideo } : null),
  };
}

export function summarizeFunnelPageMediaPlan(plan: FunnelPageMediaPlan | null | undefined, pageType: FunnelPageIntentType) {
  const mediaPlan = plan ?? inferMediaPlan(null, pageType);

  if (mediaPlan.heroAssetMode === "none") {
    return "Open without hero media and let the page lead with copy, proof, and structure.";
  }

  if (mediaPlan.heroAssetMode === "video") {
    return "Open with a VSL-style hero so the first section is built around video-led momentum.";
  }

  if (mediaPlan.heroAssetMode === "image") {
    return "Open with a visual hero so the first section lands around a strong image-led direction.";
  }

  return "Let AI choose whether the page should open visually, with a VSL, or with a lighter text-led hero.";
}

export function collectFunnelPageIntentMediaReferences(intent: FunnelPageIntentProfile | null | undefined) {
  const refs = [intent?.mediaPlan?.heroImage, intent?.mediaPlan?.heroVideo].filter(Boolean) as FunnelPageMediaReference[];
  const seen = new Set<string>();
  const out: FunnelPageMediaReference[] = [];
  for (const ref of refs) {
    const url = cleanText(ref.url, 1200);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      ...(ref.fileName ? { fileName: cleanText(ref.fileName, 160) } : null),
      ...(ref.mimeType ? { mimeType: cleanText(ref.mimeType, 120) } : null),
    });
  }
  return out;
}

function shouldAskFoundationClarifyingQuestions(input: {
  prompt: string;
  pageType: FunnelPageIntentType;
  audience: string;
  offer: string;
  qualificationFields: string;
  routingDestination: string;
  shellConcept: string;
  sectionPlan: string;
  companyContext: string;
}) {
  if (input.prompt) return false;
  if (!input.shellConcept || !input.sectionPlan) return true;
  const needsOffer = !["thank-you", "home"].includes(input.pageType);
  const materiallyAmbiguous =
    (!input.audience && needsOffer) ||
    (!input.offer && needsOffer) ||
    (!input.routingDestination && input.pageType !== "checkout") ||
    (input.pageType === "application" && !input.qualificationFields) ||
    (input.pageType === "custom" && !input.companyContext);
  return materiallyAmbiguous;
}

function defaultPageGoalForPageType(pageType: FunnelPageIntentType) {
  if (pageType === "booking") return "Convert qualified visitors into booked consultations";
  if (pageType === "sales") return "Convert buying intent into a confident purchase";
  if (pageType === "checkout") return "Finish the purchase with minimal friction";
  if (pageType === "lead-capture") return "Convert interest into a captured lead with a clear value exchange";
  if (pageType === "application") return "Convert qualified interest into completed applications";
  if (pageType === "webinar") return "Convert interest into webinar registrations";
  if (pageType === "thank-you") return "Confirm success and route the visitor to the next step";
  if (pageType === "home") return "Route visitors into the highest-fit conversion path";
  return "Explain the offer clearly and convert the visitor into the primary CTA";
}

function defaultFormStrategyForPageType(pageType: FunnelPageIntentType): FunnelPageFormStrategy {
  if (pageType === "booking") return "booking";
  if (pageType === "checkout" || pageType === "sales") return "checkout";
  if (pageType === "application") return "application";
  if (pageType === "lead-capture" || pageType === "webinar") return "auto-create-form";
  return "none";
}

function defaultSectionPlanForPageType(pageType: FunnelPageIntentType, formStrategy: FunnelPageFormStrategy) {
  if (pageType === "booking") {
    return "Hero with category promise, fit qualifier, and above-the-fold CTA into the booking section -> proof strip with concrete trust signals -> stakes, symptoms, or missed-opportunity framing -> what happens on the call and who it is for -> authority or case studies -> booking section with real scheduling handoff, expectation setting, and detail capture context -> objection-handling FAQ -> final CTA";
  }
  if (pageType === "lead-capture") {
    return "Hero with concrete value exchange and CTA -> proof strip -> problem and missed-opportunity framing -> solution or framework overview -> form or CTA section -> proof or testimonials -> objection-handling FAQ -> final CTA";
  }
  if (pageType === "sales") {
    return "Hero with offer promise and CTA -> credibility strip -> buyer problem and stakes -> offer breakdown -> benefits and outcomes -> proof -> objection handling or guarantee -> checkout CTA -> FAQ";
  }
  if (pageType === "checkout") {
    return "Order summary hero -> offer recap -> trust and guarantees -> checkout focus section -> FAQ or reassurance -> support CTA";
  }
  if (pageType === "application") {
    return "Hero with fit statement -> credibility strip -> who this is for -> application expectations -> qualification section -> FAQ -> submit CTA";
  }
  if (pageType === "thank-you") {
    return "Confirmation hero -> next steps -> expectations -> supporting proof or trust -> secondary CTA";
  }
  if (pageType === "webinar") {
    return "Hero with event promise -> speaker or proof strip -> outcomes and agenda -> registration section -> FAQ -> urgency CTA";
  }
  if (formStrategy === "booking") {
    return "Hero -> proof strip -> offer context -> booking section -> FAQ -> final CTA";
  }
  return "Hero -> proof strip -> offer or explanation section -> benefits or outcomes -> objections or FAQ -> primary CTA close";
}

function defaultShellConcept(input: {
  pageType: FunnelPageIntentType;
  pageGoal: string;
  audience: string;
  offer: string;
  primaryCta: string;
  formStrategy: FunnelPageFormStrategy;
}) {
  const audience = input.audience || "the target visitor";
  const offer = input.offer || "the core offer";
  const pageGoal = input.pageGoal || defaultPageGoalForPageType(input.pageType);
  const cta = input.primaryCta || defaultCtaForPageType(input.pageType);

  if (input.pageType === "booking") {
    return `Build a booking page for ${audience} around ${offer} that feels like a real scheduling path from the first screen. Lead with a strong promise and fit signal, show proof early, guide the visitor toward '${cta}' through a clear top-to-bottom decision flow, and make the booking section feel native, specific, and trustworthy rather than like a generic CTA dump.`;
  }

  const interactionLine =
    input.formStrategy === "booking"
      ? "Open with a clear fit signal, make the booking action visible in the first viewport, explain what happens on the call, guide the visitor down into a real booking section, and repeat the booking handoff after proof and objection handling."
      : input.formStrategy === "embed-form" || input.formStrategy === "auto-create-form" || input.formStrategy === "application"
        ? "Lead with the value exchange, make the capture or application moment feel low-friction, and use proof plus specificity to earn the form completion."
        : input.formStrategy === "checkout"
          ? "Build toward a purchase decision with strong reassurance, concrete value framing, and a CTA that feels safe to click."
          : input.formStrategy === "chatbot"
            ? "Use the chatbot as the conversion handoff after explaining the offer and fit."
            : "Keep the primary CTA visible above the fold, after proof, and in the closing section so the page keeps one decisive conversion path.";

  return `Build a ${input.pageType} page shell for ${audience} around ${offer}. Lead with a strong promise, establish credibility early, clarify the decision path without filler, and make '${cta}' feel like the natural next step toward ${pageGoal}. ${interactionLine}`;
}

function detectIntentType(source: string): FunnelPageIntentType {
  const s = source.toLowerCase();
  const tests: Array<{ type: FunnelPageIntentType; score: number }> = [
    { type: "thank-you", score: /\b(thank you|thanks|success|confirmation|confirmed|complete)\b/.test(s) ? 6 : 0 },
    { type: "checkout", score: /\b(checkout|payment|complete purchase|order summary)\b/.test(s) ? 6 : 0 },
    { type: "booking", score: /\b(book|booking|schedule|appointment|consultation|calendar|call)\b/.test(s) ? 5 : 0 },
    { type: "application", score: /\b(apply|application|qualify|qualification)\b/.test(s) ? 5 : 0 },
    { type: "webinar", score: /\b(webinar|workshop|masterclass|register)\b/.test(s) ? 5 : 0 },
    { type: "sales", score: /\b(sales|offer|pricing|product|buy|purchase|shop|store)\b/.test(s) ? 4 : 0 },
    { type: "lead-capture", score: /\b(lead|capture|opt in|opt-in|guide|audit|assessment|quote|freebie)\b/.test(s) ? 4 : 0 },
    { type: "home", score: /\b(home|index|main)\b/.test(s) ? 3 : 0 },
    { type: "landing", score: /\b(landing|hero|headline|conversion)\b/.test(s) ? 2 : 0 },
  ];

  const best = tests.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score <= 0) return "landing";
  return best.type;
}

function hasAnyFunnelBriefValue(brief: FunnelBriefProfile | null | undefined) {
  return Boolean(
    brief &&
      (brief.companyContext ||
        brief.funnelGoal ||
        brief.offerSummary ||
        brief.audienceSummary ||
        brief.qualificationFields ||
        brief.routingDestination ||
        brief.conditionalLogic ||
        brief.taggingPlan ||
        brief.automationPlan ||
        brief.integrationPlan),
  );
}

function hasAnyPageIntentValue(intent: FunnelPageIntentProfile | null | undefined) {
  return Boolean(
    intent &&
      (intent.pageGoal ||
        intent.audience ||
        intent.offer ||
        intent.primaryCta ||
        intent.companyContext ||
        intent.qualificationFields ||
        intent.routingDestination ||
        intent.conditionalLogic ||
        intent.taggingPlan ||
        intent.automationPlan ||
        intent.formStrategy !== "none" ||
        intent.shellConcept ||
        intent.sectionPlan),
  );
}

export function inferFunnelBriefProfile(input?: {
  existing?: unknown;
  funnelName?: unknown;
  funnelSlug?: unknown;
}): FunnelBriefProfile {
  const existing = isRecord(input?.existing) ? input.existing : null;
  const funnelName = cleanText(input?.funnelName, 120);
  const funnelSlug = cleanText(input?.funnelSlug, 120);
  const inferredIntentType = detectIntentType([funnelName, funnelSlug].filter(Boolean).join(" "));

  return {
    companyContext: cleanText(existing?.companyContext ?? existing?.businessContext, 480),
    funnelGoal: cleanText(existing?.funnelGoal, 240) || defaultFunnelGoalForPageType(inferredIntentType),
    offerSummary: cleanText(existing?.offerSummary ?? existing?.offer, 240),
    audienceSummary: cleanText(existing?.audienceSummary ?? existing?.audience, 240),
    qualificationFields: cleanText(existing?.qualificationFields, 240),
    routingDestination: cleanText(existing?.routingDestination, 240) || (funnelSlug ? `Continue through /${funnelSlug}` : ""),
    conditionalLogic: cleanText(existing?.conditionalLogic ?? existing?.logicPlan, 280),
    taggingPlan: cleanText(existing?.taggingPlan, 240),
    automationPlan: cleanText(existing?.automationPlan, 280),
    integrationPlan: cleanText(existing?.integrationPlan, 240),
  };
}

export function inferFunnelPageIntentProfile(input?: {
  existing?: unknown;
  prompt?: unknown;
  funnelName?: unknown;
  funnelSlug?: unknown;
  pageTitle?: unknown;
  pageSlug?: unknown;
  funnelBrief?: FunnelBriefProfile | null;
  pageType?: unknown;
  pageGoal?: unknown;
  audience?: unknown;
  offer?: unknown;
  primaryCta?: unknown;
  companyContext?: unknown;
  qualificationFields?: unknown;
  routingDestination?: unknown;
  conditionalLogic?: unknown;
  taggingPlan?: unknown;
  automationPlan?: unknown;
  formStrategy?: unknown;
  mediaPlan?: unknown;
  heroAssetMode?: unknown;
  shellFrameId?: unknown;
  shellConcept?: unknown;
  sectionPlan?: unknown;
  askClarifyingQuestions?: unknown;
}): FunnelPageIntentProfile {
  const existing = isRecord(input?.existing) ? input.existing : null;
  const explicitMediaPlan = isRecord(input?.mediaPlan) ? input.mediaPlan : null;
  const mergedExisting: Record<string, unknown> = {
    ...(existing || {}),
    ...(isIntentType(input?.pageType) ? { pageType: input.pageType } : null),
    ...(cleanText(input?.pageGoal, 220) ? { pageGoal: cleanText(input?.pageGoal, 220) } : null),
    ...(cleanText(input?.audience, 180) ? { audience: cleanText(input?.audience, 180) } : null),
    ...(cleanText(input?.offer, 180) ? { offer: cleanText(input?.offer, 180) } : null),
    ...(cleanText(input?.primaryCta, 120) ? { primaryCta: cleanText(input?.primaryCta, 120) } : null),
    ...(cleanText(input?.companyContext, 360) ? { companyContext: cleanText(input?.companyContext, 360) } : null),
    ...(cleanText(input?.qualificationFields, 240) ? { qualificationFields: cleanText(input?.qualificationFields, 240) } : null),
    ...(cleanText(input?.routingDestination, 240) ? { routingDestination: cleanText(input?.routingDestination, 240) } : null),
    ...(cleanText(input?.conditionalLogic, 280) ? { conditionalLogic: cleanText(input?.conditionalLogic, 280) } : null),
    ...(cleanText(input?.taggingPlan, 240) ? { taggingPlan: cleanText(input?.taggingPlan, 240) } : null),
    ...(cleanText(input?.automationPlan, 280) ? { automationPlan: cleanText(input?.automationPlan, 280) } : null),
    ...(isFormStrategy(input?.formStrategy) ? { formStrategy: input.formStrategy } : null),
    ...(cleanText(input?.shellFrameId, 80) ? { shellFrameId: cleanText(input?.shellFrameId, 80) } : null),
    ...(cleanText(input?.shellConcept, 480) ? { shellConcept: cleanText(input?.shellConcept, 480) } : null),
    ...(cleanText(input?.sectionPlan, 480) ? { sectionPlan: cleanText(input?.sectionPlan, 480) } : null),
    ...(typeof input?.askClarifyingQuestions === "boolean" ? { askClarifyingQuestions: input.askClarifyingQuestions } : null),
    mediaPlan: {
      ...(isRecord(existing?.mediaPlan) ? existing?.mediaPlan : {}),
      ...(explicitMediaPlan || {}),
      ...(isMediaMode(input?.heroAssetMode) ? { heroAssetMode: input.heroAssetMode } : null),
    },
  };
  const effectiveExisting: Record<string, unknown> =
    isRecord(mergedExisting.mediaPlan) && Object.keys(mergedExisting.mediaPlan).length === 0
      ? (() => {
          const { mediaPlan: _mediaPlan, ...rest } = mergedExisting;
          return rest;
        })()
      : mergedExisting;
  const prompt = cleanText(input?.prompt, 400);
  const funnelName = cleanText(input?.funnelName, 120);
  const funnelSlug = cleanText(input?.funnelSlug, 120);
  const pageTitle = cleanText(input?.pageTitle, 120);
  const pageSlug = cleanText(input?.pageSlug, 120);
  const funnelBrief = input?.funnelBrief ?? null;
  const source = [prompt, pageTitle, pageSlug, funnelName, funnelSlug].filter(Boolean).join(" ");

  const pageType = isIntentType(effectiveExisting.pageType) ? effectiveExisting.pageType : detectIntentType(source);
  const pageGoal = cleanText(effectiveExisting.pageGoal, 220) || defaultPageGoalForPageType(pageType);
  const audience = cleanText(effectiveExisting.audience, 180) || cleanText(funnelBrief?.audienceSummary, 180) || defaultAudienceForPageType(pageType);
  const offer = cleanText(effectiveExisting.offer, 180) || cleanText(funnelBrief?.offerSummary, 180) || defaultOfferForPageType(pageType);
  const primaryCta = cleanText(effectiveExisting.primaryCta, 120) || defaultCtaForPageType(pageType);
  const companyContext = cleanText(effectiveExisting.companyContext ?? effectiveExisting.businessContext, 360) || cleanText(funnelBrief?.companyContext, 360);
  const formStrategy = isFormStrategy(effectiveExisting.formStrategy) ? effectiveExisting.formStrategy : defaultFormStrategyForPageType(pageType);
  const shellFrame = resolveFunnelShellFrame({
    frameId: cleanText(effectiveExisting.shellFrameId, 80),
    pageType,
    formStrategy,
  });
  const qualificationFields =
    cleanText(effectiveExisting.qualificationFields, 240) ||
    cleanText(funnelBrief?.qualificationFields, 240) ||
    defaultQualificationForPageType(pageType, formStrategy);
  const routingDestination =
    cleanText(effectiveExisting.routingDestination, 240) ||
    cleanText(funnelBrief?.routingDestination, 240) ||
    defaultRoutingForPageType(pageType, funnelSlug, primaryCta);
  const conditionalLogic =
    cleanText(effectiveExisting.conditionalLogic ?? effectiveExisting.logicPlan, 280) ||
    cleanText(funnelBrief?.conditionalLogic, 280);
  const taggingPlan =
    cleanText(effectiveExisting.taggingPlan, 240) ||
    cleanText(funnelBrief?.taggingPlan, 240);
  const automationPlan =
    cleanText(effectiveExisting.automationPlan, 280) ||
    cleanText(funnelBrief?.automationPlan, 280);
  const mediaPlan = inferMediaPlan(effectiveExisting.mediaPlan, pageType);
  const shellFrameId = shellFrame?.id || cleanText(effectiveExisting.shellFrameId, 80);
  const shellConcept =
    cleanText(effectiveExisting.shellConcept, 480) ||
    cleanText(shellFrame?.shellConcept, 480) ||
    defaultShellConcept({
      pageType,
      pageGoal,
      audience,
      offer,
      primaryCta,
      formStrategy,
    });
  const sectionPlan = cleanText(effectiveExisting.sectionPlan, 480) || cleanText(shellFrame?.sectionPlan, 480) || defaultSectionPlanForPageType(pageType, formStrategy);
  const askClarifyingQuestions =
    typeof effectiveExisting.askClarifyingQuestions === "boolean"
      ? effectiveExisting.askClarifyingQuestions
      : shouldAskFoundationClarifyingQuestions({
          prompt,
          pageType,
          audience,
          offer,
          qualificationFields,
          routingDestination,
          shellConcept,
          sectionPlan,
          companyContext,
        });

  return {
    pageType,
    pageGoal,
    audience,
    offer,
    primaryCta,
    companyContext,
    qualificationFields,
    routingDestination,
    conditionalLogic,
    taggingPlan,
    automationPlan,
    formStrategy,
    mediaPlan,
    shellFrameId,
    shellConcept,
    sectionPlan,
    askClarifyingQuestions,
  };
}

function cloneSettingsJson(settingsJson: unknown) {
  return isRecord(settingsJson) ? { ...(settingsJson as Record<string, unknown>) } : {};
}

export function readFunnelBrief(settingsJson: unknown, funnelId: string): FunnelBriefProfile | null {
  if (!funnelId || !isRecord(settingsJson)) return null;
  const raw = isRecord(settingsJson.funnelBriefs) ? settingsJson.funnelBriefs : null;
  const row = raw && isRecord(raw[funnelId]) ? raw[funnelId] : null;
  if (!row) return null;
  const brief = inferFunnelBriefProfile({ existing: row });
  return hasAnyFunnelBriefValue(brief) ? brief : null;
}

export function writeFunnelBrief(settingsJson: unknown, funnelId: string, brief: FunnelBriefProfile | null) {
  const base = cloneSettingsJson(settingsJson);
  const next = isRecord(base.funnelBriefs) ? { ...(base.funnelBriefs as Record<string, unknown>) } : {};
  if (!funnelId || !brief || !hasAnyFunnelBriefValue(brief)) delete next[funnelId];
  else next[funnelId] = brief;
  base.funnelBriefs = next;
  return base;
}

export function readFunnelPageBrief(settingsJson: unknown, pageId: string): FunnelPageIntentProfile | null {
  if (!pageId || !isRecord(settingsJson)) return null;
  const raw = isRecord(settingsJson.funnelPageBriefs) ? settingsJson.funnelPageBriefs : null;
  const row = raw && isRecord(raw[pageId]) ? raw[pageId] : null;
  if (!row) return null;
  const brief = inferFunnelPageIntentProfile({ existing: row });
  return hasAnyPageIntentValue(brief) ? brief : null;
}

export function writeFunnelPageBrief(settingsJson: unknown, pageId: string, brief: FunnelPageIntentProfile | null) {
  const base = cloneSettingsJson(settingsJson);
  const next = isRecord(base.funnelPageBriefs) ? { ...(base.funnelPageBriefs as Record<string, unknown>) } : {};
  if (!pageId || !brief || !hasAnyPageIntentValue(brief)) delete next[pageId];
  else next[pageId] = brief;
  base.funnelPageBriefs = next;
  return base;
}

export function buildFunnelPageRouteLabel(funnelSlug?: string | null, pageSlug?: string | null) {
  const cleanFunnelSlug = cleanText(funnelSlug, 120);
  const cleanPageSlug = cleanText(pageSlug, 120);
  if (cleanPageSlug && cleanPageSlug !== "home") {
    return `/${[cleanFunnelSlug, cleanPageSlug].filter(Boolean).join("/")}`;
  }
  if (cleanFunnelSlug) return `/${cleanFunnelSlug}`;
  return `/${cleanPageSlug || "page"}`;
}

export function buildFunnelBriefPromptBlock(brief: FunnelBriefProfile | null | undefined) {
  if (!brief || !hasAnyFunnelBriefValue(brief)) return "";
  const missing: string[] = [];
  if (!brief.funnelGoal) missing.push("funnel type or job");
  if (!brief.offerSummary) missing.push("offer or pricing");
  if (!brief.audienceSummary) missing.push("core audience");

  return [
    "FUNNEL_BRIEF:",
    brief.companyContext ? `- Additional funnel context: ${brief.companyContext}` : "",
    `- Funnel type or job: ${brief.funnelGoal || "(not provided)"}`,
    `- Offer or pricing: ${brief.offerSummary || "(not provided)"}`,
    `- Core audience: ${brief.audienceSummary || "(not provided)"}`,
    `- Intake or application details: ${brief.qualificationFields || "(not provided)"}`,
    `- Next-step or tagging plan: ${brief.routingDestination || "(not provided)"}`,
    `- Conditional logic or routing rules: ${brief.conditionalLogic || "(not provided)"}`,
    `- Tagging defaults: ${brief.taggingPlan || "(not provided)"}`,
    `- Automation handoff: ${brief.automationPlan || "(not provided)"}`,
    `- Platform or fulfillment notes: ${brief.integrationPlan || "(not provided)"}`,
    missing.length ? `- Missing funnel context to infer intelligently: ${missing.join(", ")}` : "- Funnel brief coverage: strong",
    "",
  ].filter(Boolean).join("\n");
}

export function buildFunnelFoundationOverview(input: {
  brief?: FunnelBriefProfile | null;
  intent?: FunnelPageIntentProfile | null;
  routeLabel?: string | null;
  funnelName?: string | null;
  pageTitle?: string | null;
  businessProfile?: FunnelFoundationBusinessContext | null;
  capabilityInputs?: FunnelFoundationCapabilityInputs | null;
}) {
  return buildResolvedFunnelFoundation(input);
}

export function buildResolvedFunnelFoundation(input: {
  brief?: FunnelBriefProfile | null;
  intent?: FunnelPageIntentProfile | null;
  routeLabel?: string | null;
  funnelName?: string | null;
  pageTitle?: string | null;
  businessProfile?: FunnelFoundationBusinessContext | null;
  capabilityInputs?: FunnelFoundationCapabilityInputs | null;
}) {
  const brief = input.brief ?? null;
  const intent = input.intent ?? null;
  const businessProfile = input.businessProfile ?? null;
  const pageType = intent?.pageType || detectIntentType([input.pageTitle, input.routeLabel, input.funnelName].filter(Boolean).join(" "));
  const routeLabel = cleanText(input.routeLabel, 160) || "this route";
  const routeSlug = routeLabel.replace(/^\//, "").toLowerCase();
  const pageLabel =
    cleanText(input.pageTitle, 120) ||
    (routeSlug === "home" || routeSlug === "page" || routeSlug === "landing" || routeSlug === "test" ? "this page" : routeLabel);
  const audience = cleanText(intent?.audience, 180) || cleanText(brief?.audienceSummary, 180) || defaultAudienceForPageType(pageType);
  const offer = cleanText(intent?.offer, 180) || cleanText(brief?.offerSummary, 180) || defaultOfferForPageType(pageType);
  const pageGoal = cleanText(intent?.pageGoal, 220) || defaultPageGoalForPageType(pageType);
  const primaryCta = cleanText(intent?.primaryCta, 120) || defaultCtaForPageType(pageType);
  const routingDestination = cleanText(intent?.routingDestination, 240) || cleanText(brief?.routingDestination, 240) || defaultRoutingForPageType(pageType, "", primaryCta);
  const conditionalLogic = cleanText(intent?.conditionalLogic, 280) || cleanText(brief?.conditionalLogic, 280);
  const taggingPlan = cleanText(intent?.taggingPlan, 240) || cleanText(brief?.taggingPlan, 240);
  const automationPlan = cleanText(intent?.automationPlan, 280) || cleanText(brief?.automationPlan, 280);
  const formStrategy = intent?.formStrategy || defaultFormStrategyForPageType(pageType);
  const businessName = cleanText(businessProfile?.businessName, 120);
  const industry = cleanText(businessProfile?.industry, 120);
  const businessModel = cleanText(businessProfile?.businessModel, 160);
  const targetCustomer = cleanText(businessProfile?.targetCustomer, 160);
  const brandVoice = cleanText(businessProfile?.brandVoice, 120);
  const businessContext = cleanText(businessProfile?.businessContext, 320);
  const primaryGoals = cleanTextList(businessProfile?.primaryGoals, 4, 80);
  const mediaPlan = intent?.mediaPlan || inferMediaPlan(null, pageType);
  const shellFrame = resolveFunnelShellFrame({
    frameId: cleanText(intent?.shellFrameId, 80),
    pageType,
    formStrategy,
  });
  const shellConcept = cleanText(intent?.shellConcept, 480) || cleanText(shellFrame?.shellConcept, 480) || defaultShellConcept({
    pageType,
    pageGoal,
    audience,
    offer,
    primaryCta,
    formStrategy,
  });
  const sectionPlan = cleanText(intent?.sectionPlan, 480) || cleanText(shellFrame?.sectionPlan, 480) || defaultSectionPlanForPageType(pageType, formStrategy);
  const sectionPlanItems = parseSectionPlanItems(sectionPlan);
  const assetPlanSummary = summarizeFunnelPageMediaPlan(mediaPlan, pageType);
  const assetSignals = [
    mediaPlan.heroAssetMode === "video" ? "VSL opening planned" : "",
    mediaPlan.heroAssetMode === "image" ? "Visual opening planned" : "",
    mediaPlan.heroAssetMode === "none" ? "Text-first opening planned" : "",
    mediaPlan.heroAssetMode === "auto" ? "Opening style still flexible" : "",
  ].filter(Boolean);
  const contextSignals: FunnelFoundationContextSignal[] = [];

  pushContextSignal(contextSignals, businessName ? { source: "profile", label: "Business", value: "Profile loaded" } : null);
  pushContextSignal(contextSignals, industry ? { source: "profile", label: "Industry", value: "Business type understood" } : null);
  pushContextSignal(contextSignals, businessModel ? { source: "profile", label: "Model", value: "Operating model understood" } : null);
  pushContextSignal(contextSignals, targetCustomer ? { source: "profile", label: "Audience", value: "Audience context present" } : null);
  pushContextSignal(
    contextSignals,
    primaryGoals.length ? { source: "profile", label: "Goals", value: "Commercial goals present" } : null,
  );
  pushContextSignal(contextSignals, brandVoice ? { source: "profile", label: "Voice", value: "Voice preference noted" } : null);
  pushContextSignal(
    contextSignals,
    businessContext ? { source: "profile", label: "Details", value: "Detailed operating context present" } : null,
  );
  pushContextSignal(
    contextSignals,
    cleanText(brief?.funnelGoal, 160) ? { source: "funnel", label: "Funnel job", value: "Funnel objective inherited" } : null,
  );
  pushContextSignal(
    contextSignals,
    cleanText(brief?.offerSummary, 140) ? { source: "funnel", label: "Offer", value: "Offer framing present" } : null,
  );
  pushContextSignal(
    contextSignals,
    conditionalLogic ? { source: "page", label: "Logic", value: "Logic rules are defined" } : null,
  );
  pushContextSignal(
    contextSignals,
    taggingPlan ? { source: "page", label: "Tags", value: "Tagging plan is defined" } : null,
  );
  pushContextSignal(
    contextSignals,
    automationPlan ? { source: "page", label: "Automation", value: "Automation handoff is defined" } : null,
  );
  pushContextSignal(contextSignals, routeLabel ? { source: "route", label: "Route", value: "Route cues applied" } : null);
  pushContextSignal(
    contextSignals,
    assetSignals.length ? { source: "page", label: "Media", value: assetSignals[0] || "Hero media planned" } : null,
  );
  const capabilityGraph = buildFoundationCapabilityGraph({
    pageType,
    formStrategy,
    primaryCta,
    mediaPlan,
    capabilityInputs: input.capabilityInputs,
  });
  const capabilitySummary = summarizeCapabilityGraph(capabilityGraph);

  const profileSignalCount = contextSignals.filter((signal) => signal.source === "profile").length;
  const funnelSignalCount = contextSignals.filter((signal) => signal.source === "funnel").length;
  const missingContext: string[] = [];
  if (!industry && !businessModel) missingContext.push("business type");
  if (!targetCustomer && !audience) missingContext.push("target audience");
  if (!brief?.offerSummary && !intent?.offer) missingContext.push("offer framing");
  if (!businessContext && !cleanText(brief?.companyContext, 240) && profileSignalCount < 4) missingContext.push("operational details");

  const headline = `${formatIntentTypeLabel(pageType)} foundation for ${pageLabel}`;
  const summary = `Recommended direction: make ${pageLabel} a decisive ${formatIntentTypeLabel(pageType).toLowerCase()} page for ${audience} that frames ${offer}, proves credibility early, and moves visitors into '${primaryCta}'.`;
  const conversionPath = `Best-fit conversion path: ${pageGoal}. Support that with ${formatFormStrategyLabel(formStrategy).toLowerCase()}, then move visitors into ${routingDestination || primaryCta}.`;
  const businessNarrative = buildBusinessNarrative({
    businessName,
    industry,
    businessModel,
    targetCustomer,
    primaryGoals,
    funnelGoal: cleanText(brief?.funnelGoal, 220),
    offer,
    audience,
    pageGoal,
    hasBusinessContext: Boolean(businessContext || cleanText(brief?.companyContext, 240)),
  });
  const contextSummary =
    profileSignalCount > 0
      ? `Grounded in your business profile${funnelSignalCount > 0 ? ", saved funnel context," : " and"} route cues${funnelSignalCount > 0 ? ", and page steering." : " plus page steering."}`
      : funnelSignalCount > 0
        ? "Grounded in saved funnel context, route cues, and page steering."
        : "Mostly inferring from the route and the page steering you set here.";
  const askForClarification = Boolean(intent?.askClarifyingQuestions);
  const readinessLabel = deriveFoundationReadinessLabel(askForClarification, capabilityGraph);

  return {
    headline,
    summary,
    conversionPath,
    businessNarrative,
    assetPlanSummary,
    assetSignals,
    recommendations: [
      `Narrative spine: ${shellConcept}`,
      `Section order: ${sectionPlan}`,
      `Hero media: ${assetPlanSummary}`,
      `Platform truth: ${capabilitySummary}`,
      cleanText(brief?.funnelGoal, 220) ? `Funnel job: ${cleanText(brief?.funnelGoal, 220)}` : "",
      cleanText(intent?.qualificationFields, 220) || cleanText(brief?.qualificationFields, 220)
        ? `Intake focus: ${cleanText(intent?.qualificationFields, 220) || cleanText(brief?.qualificationFields, 220)}`
        : "",
      conditionalLogic ? `Conditional logic: ${conditionalLogic}` : "",
      taggingPlan ? `Tagging plan: ${taggingPlan}` : "",
      automationPlan ? `Automation handoff: ${automationPlan}` : "",
      cleanText(brief?.integrationPlan, 220) ? `Platform handling: ${cleanText(brief?.integrationPlan, 220)}` : `Platform handling: ${formatFormStrategyLabel(formStrategy)}`,
    ].filter(Boolean),
    askForClarification,
    readinessLabel,
    contextSummary,
    contextSignals: contextSignals.slice(0, 6),
    missingContext: missingContext.slice(0, 2),
    shellFrameId: shellFrame?.id || cleanText(intent?.shellFrameId, 80),
    shellFrameLabel: shellFrame?.label || `${formatIntentTypeLabel(pageType)} frame`,
    frameSummary: shellFrame?.summary || "Default frame selected from page type and conversion pattern.",
    designDirectives: shellFrame?.designDirectives || [],
    shellConcept,
    sectionPlanItems,
    routeLabel,
    pageLabel,
    pageType,
    pageGoal,
    audience,
    offer,
    primaryCta,
    routingDestination,
    formStrategy,
    mediaPlan,
    sectionPlan,
    capabilityGraph,
    capabilitySummary,
    platformReadinessLabel: capabilitySummary,
  } satisfies ResolvedFunnelFoundation;
}

export function buildFunnelPageIntentPromptBlock(
  intent: FunnelPageIntentProfile | null | undefined,
  routeLabel?: string | null,
  businessProfile?: FunnelFoundationBusinessContext | null,
) {
  if (!intent) return "";
  const missing: string[] = [];
  if (!intent.audience) missing.push("audience");
  if (!intent.offer) missing.push("offer or conversion action");
  if (!intent.pageGoal) missing.push("page job");
  const foundation = buildFunnelFoundationOverview({ intent, routeLabel, businessProfile });
  return [
    "INTENT_PROFILE:",
    `- Page type: ${intent.pageType}`,
    routeLabel ? `- Route: ${routeLabel}` : "",
    `- Page job: ${intent.pageGoal || "(not provided)"}`,
    `- Audience: ${intent.audience || "(not provided)"}`,
    `- Offer or conversion action: ${intent.offer || "(not provided)"}`,
    `- Primary CTA: ${intent.primaryCta || "(not provided)"}`,
    intent.companyContext ? `- Additional page context override: ${intent.companyContext}` : "",
    `- Intake or application details: ${intent.qualificationFields || "(not provided)"}`,
    `- Next-step or tagging: ${intent.routingDestination || "(not provided)"}`,
    `- Conditional logic or branching: ${intent.conditionalLogic || "(not provided)"}`,
    `- Tagging plan: ${intent.taggingPlan || "(not provided)"}`,
    `- Automation handoff: ${intent.automationPlan || "(not provided)"}`,
    `- Form or platform plan: ${intent.formStrategy || "none"}`,
    `- Hero media plan: ${foundation.assetPlanSummary}`,
    `- Shell frame: ${foundation.shellFrameLabel}${foundation.shellFrameId ? ` (${foundation.shellFrameId})` : ""}`,
    `- Frame summary: ${foundation.frameSummary}`,
    `- Baseline shell concept: ${intent.shellConcept || "(not provided)"}`,
    `- Section plan: ${intent.sectionPlan || "(not provided)"}`,
    ...foundation.designDirectives.map((directive, index) => `- Frame design directive ${index + 1}: ${directive}`),
    `- Operational read of the business: ${foundation.businessNarrative}`,
    `- Recommended foundation: ${foundation.summary}`,
    `- Recommended conversion path: ${foundation.conversionPath}`,
    "- Inference rule: synthesize the strongest coherent baseline from the business profile, saved context, route, and page cues before asking follow-up questions.",
    "- Shell behavior: use this shell as the starting architecture for the first draft and later retakes unless the user explicitly asks to replace it.",
    `- Clarify only if the uncertainty would materially change the architecture or CTA path: ${intent.askClarifyingQuestions ? "yes" : "no"}`,
    missing.length ? `- Missing context to infer intelligently: ${missing.join(", ")}` : "- Intent coverage: strong",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function isFunnelPageIntentMessage(raw: unknown) {
  if (!raw || typeof raw !== "object") return false;
  const rec = raw as Record<string, unknown>;
  if (rec.kind === "intent-profile") return true;
  return typeof rec.content === "string" && rec.content.startsWith(`${FUNNEL_PAGE_INTENT_MARKER}\n`);
}

export function extractFunnelPageIntentProfile(raw: unknown): FunnelPageIntentProfile | null {
  if (!Array.isArray(raw)) return null;
  for (let index = raw.length - 1; index >= 0; index -= 1) {
    const item = raw[index];
    if (!isFunnelPageIntentMessage(item)) continue;
    const content = typeof (item as { content?: unknown }).content === "string" ? String((item as { content?: string }).content || "") : "";
    const json = content.startsWith(`${FUNNEL_PAGE_INTENT_MARKER}\n`) ? content.slice(FUNNEL_PAGE_INTENT_MARKER.length + 1) : "";
    if (!json.trim()) continue;
    try {
      return inferFunnelPageIntentProfile({ existing: JSON.parse(json) });
    } catch {
      continue;
    }
  }
  return null;
}

export function stripFunnelPageIntentMessages<T = unknown>(raw: unknown): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => !isFunnelPageIntentMessage(item)) as T[];
}

export function upsertFunnelPageIntentProfileInChat(raw: unknown, intent: FunnelPageIntentProfile, at?: string) {
  const next = stripFunnelPageIntentMessages<Record<string, unknown>>(raw);
  next.push({
    role: "user",
    kind: "intent-profile",
    hidden: true,
    at: at || new Date().toISOString(),
    content: `${FUNNEL_PAGE_INTENT_MARKER}\n${JSON.stringify(intent)}`,
  });
  return next;
}