import type { FunnelPageIntentType } from "@/lib/funnelPageIntent";

export const FUNNEL_STENCIL_IDS = ["lead_capture", "sales", "booking", "webinar", "multi_step", "tripwire"] as const;

export type FunnelStencilId = (typeof FUNNEL_STENCIL_IDS)[number];
export type FunnelInitializationMode = "stencil" | "custom";
export type FunnelInitializationConfidence = "high" | "medium" | "low";

export type FunnelInitializationSuggestion = {
  stencilId: FunnelStencilId;
  label: string;
  reason: string;
};

export type FunnelInitializationDecision = {
  mode: FunnelInitializationMode;
  confidence: FunnelInitializationConfidence;
  stencilId: FunnelStencilId | null;
  label: string | null;
  reason: string;
  summary: string;
  question: string | null;
  suggestions: FunnelInitializationSuggestion[];
  preserveStructure: boolean;
};

type PlannerInput = {
  pageType?: unknown;
  funnelGoal?: unknown;
  offer?: unknown;
  audience?: unknown;
  primaryCta?: unknown;
  name?: unknown;
  slug?: unknown;
  preferCustomMode?: unknown;
};

const STENCIL_META: Record<FunnelStencilId, { label: string; shortSummary: string }> = {
  lead_capture: {
    label: "Lead Capture",
    shortSummary: "entry page plus opt-in and thank-you flow",
  },
  sales: {
    label: "Sales",
    shortSummary: "offer, checkout, and post-purchase flow",
  },
  booking: {
    label: "Booking",
    shortSummary: "trust-led booking path with a dedicated scheduling step",
  },
  webinar: {
    label: "Webinar",
    shortSummary: "speaker, agenda, registration, and confirmation flow",
  },
  multi_step: {
    label: "Multi-Step",
    shortSummary: "staged qualification and routing flow",
  },
  tripwire: {
    label: "Tripwire",
    shortSummary: "low-friction offer plus fast checkout flow",
  },
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizePageType(value: unknown): FunnelPageIntentType | null {
  const text = cleanText(value).toLowerCase();
  if (
    text === "landing" ||
    text === "lead-capture" ||
    text === "booking" ||
    text === "sales" ||
    text === "checkout" ||
    text === "thank-you" ||
    text === "application" ||
    text === "webinar" ||
    text === "home" ||
    text === "custom"
  ) {
    return text as FunnelPageIntentType;
  }
  return null;
}

function buildSignalBlob(input: PlannerInput) {
  return [
    cleanText(input.pageType),
    cleanText(input.funnelGoal),
    cleanText(input.offer),
    cleanText(input.audience),
    cleanText(input.primaryCta),
    cleanText(input.name),
    cleanText(input.slug),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasPattern(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function buildStencilDecision(
  stencilId: FunnelStencilId,
  confidence: FunnelInitializationConfidence,
  reason: string,
  suggestions: FunnelInitializationSuggestion[] = [],
): FunnelInitializationDecision {
  const meta = STENCIL_META[stencilId];
  return {
    mode: "stencil",
    confidence,
    stencilId,
    label: meta.label,
    reason,
    summary: `Use the ${meta.label.toLowerCase()} stencil so the funnel starts with ${meta.shortSummary}.`,
    question: null,
    suggestions,
    preserveStructure: true,
  };
}

function buildCustomDecision(
  confidence: FunnelInitializationConfidence,
  reason: string,
  question: string | null,
  suggestions: FunnelInitializationSuggestion[] = [],
): FunnelInitializationDecision {
  return {
    mode: "custom",
    confidence,
    stencilId: null,
    label: null,
    reason,
    summary:
      confidence === "low"
        ? "Start in minimal custom mode until the funnel structure is clearer."
        : "Start in custom mode with a minimal entry page and preserve the structure once it is established.",
    question,
    suggestions,
    preserveStructure: true,
  };
}

export function getFunnelStencilMeta(stencilId: FunnelStencilId) {
  return STENCIL_META[stencilId];
}

export function decideFunnelInitialization(input: PlannerInput): FunnelInitializationDecision {
  const pageType = normalizePageType(input.pageType);
  const signalBlob = buildSignalBlob(input);
  const preferCustomMode = input.preferCustomMode === true || hasPattern(signalBlob, /\b(full flexibility|full-flexibility|flexible|from scratch|freeform|blank funnel|custom mode)\b/i);
  const multiStepSignal = hasPattern(signalBlob, /\b(multi[- ]step|qualification|qualify|application|screening|screen|quiz|survey|step[- ]by[- ]step)\b/i);
  const tripwireSignal = hasPattern(signalBlob, /\b(tripwire|low[- ]ticket|flash sale|countdown|one[- ]time offer|one time offer|quick buy|order bump)\b/i);
  const bookingSignal = hasPattern(signalBlob, /\b(book|booking|schedule|scheduled|appointment|consultation|strategy call|book a call|calendar)\b/i);
  const webinarSignal = hasPattern(signalBlob, /\b(webinar|register now|save my seat|reserve your seat|live training|masterclass)\b/i);
  const salesSignal = hasPattern(signalBlob, /\b(sales|checkout|purchase|buy now|pricing|offer|conversion)\b/i);
  const leadSignal = hasPattern(signalBlob, /\b(lead|opt[- ]in|capture|guide|audit|quote|download|free report)\b/i);

  if (preferCustomMode) {
    return buildCustomDecision("high", "The request explicitly asks for full flexibility instead of a guided stencil.", null);
  }

  if (pageType === "booking") {
    return buildStencilDecision("booking", "high", "The primary page type is booking, so the booking flow is already structurally clear.");
  }

  if (pageType === "webinar") {
    return buildStencilDecision("webinar", "high", "The primary page type is webinar, so the registration flow is already structurally clear.");
  }

  if (pageType === "application") {
    return buildStencilDecision("multi_step", "high", "The primary page type is application, which maps to a staged qualification flow.");
  }

  if (multiStepSignal) {
    return buildStencilDecision("multi_step", "high", "The request signals a staged or qualifying funnel rather than a single-screen page.");
  }

  if (tripwireSignal && (pageType === "sales" || pageType === "checkout" || pageType === "landing" || pageType === "lead-capture" || pageType === "custom" || !pageType)) {
    return buildStencilDecision("tripwire", pageType === "sales" || pageType === "checkout" ? "high" : "medium", "The offer reads like a low-friction tripwire rather than a full sales funnel.", [
      { stencilId: "sales", label: STENCIL_META.sales.label, reason: "Use this instead if the offer needs a fuller evaluation path before checkout." },
    ]);
  }

  if (pageType === "sales" || pageType === "checkout") {
    return buildStencilDecision("sales", "high", "The primary page type is sales or checkout, so the offer-to-purchase flow is clear.");
  }

  if (pageType === "lead-capture") {
    return buildStencilDecision("lead_capture", "high", "The primary page type is lead capture, so the value-exchange flow is clear.");
  }

  if ((pageType === "landing" || pageType === "home" || pageType === "custom" || !pageType) && bookingSignal) {
    return buildStencilDecision("booking", pageType === "custom" || !pageType ? "medium" : "high", "The language centers on calls, consultations, or scheduling, so a booking structure is the safest guided start.", [
      { stencilId: "lead_capture", label: STENCIL_META.lead_capture.label, reason: "Use this instead if the CTA should capture details before the booking step." },
    ]);
  }

  if ((pageType === "landing" || pageType === "home" || pageType === "custom" || !pageType) && webinarSignal) {
    return buildStencilDecision("webinar", pageType === "custom" || !pageType ? "medium" : "high", "The request reads like an event-registration funnel with agenda and signup structure.", [
      { stencilId: "lead_capture", label: STENCIL_META.lead_capture.label, reason: "Use this instead if the goal is only to capture interest for a later follow-up." },
    ]);
  }

  if ((pageType === "landing" || pageType === "home" || pageType === "custom" || !pageType) && salesSignal) {
    return buildStencilDecision("sales", pageType === "custom" || !pageType ? "medium" : "high", "The request reads like an offer and purchase path rather than a generic landing page.", [
      { stencilId: "tripwire", label: STENCIL_META.tripwire.label, reason: "Use this instead if the offer is intentionally low-ticket and urgency-led." },
    ]);
  }

  if ((pageType === "landing" || pageType === "home" || pageType === "custom" || !pageType) && leadSignal) {
    return buildStencilDecision("lead_capture", pageType === "custom" || !pageType ? "medium" : "high", "The request reads like a value-exchange funnel focused on lead capture.");
  }

  return buildCustomDecision(
    "low",
    "The request does not point cleanly to a booking, lead-capture, sales, webinar, multi-step, or tripwire flow.",
    "Should this funnel capture leads, sell an offer, book appointments, or register attendees?",
    [
      { stencilId: "lead_capture", label: STENCIL_META.lead_capture.label, reason: "Best when the next step is collecting contact details around a clear offer." },
      { stencilId: "sales", label: STENCIL_META.sales.label, reason: "Best when the funnel should move visitors through evaluation into purchase." },
    ],
  );
}