import { generateText } from "@/lib/ai";
import { buildDesignTokenContractBlock } from "@/lib/funnelDesignTokenGuard";
import { buildFunnelDesignContextPromptBlock, type FunnelDesignContext } from "@/lib/funnelDesignContext";
import { getExhibitDesignAdvisory } from "@/lib/exhibitDesignAdvisor.server";
import {
  buildFunnelFoundationOverview,
  defaultAudienceForPageType,
  defaultOfferForPageType,
  type FunnelBriefProfile,
  type FunnelPageIntentProfile,
} from "@/lib/funnelPageIntent";

type SynthesisSurface = "page-html" | "custom-code";

type SynthesisMediaRef = {
  url: string;
  fileName?: string;
  mimeType?: string;
};

type SynthesisSelectedRegion = {
  label?: string;
  summary?: string;
};

type SynthesisHistoryEntry = {
  role: "user" | "assistant";
  content: string;
};

export type FunnelPromptSynthesisInput = {
  surface: SynthesisSurface;
  requestPrompt: string;
  routeLabel?: string | null;
  funnelName?: string | null;
  pageTitle?: string | null;
  businessContext?: string | null;
  funnelBrief?: FunnelBriefProfile | null;
  intentProfile?: FunnelPageIntentProfile | null;
  currentHtml?: string | null;
  currentCss?: string | null;
  selectedRegion?: SynthesisSelectedRegion | null;
  designContext?: FunnelDesignContext | null;
  contextKeys?: string[];
  contextMedia?: SynthesisMediaRef[];
  recentChatHistory?: SynthesisHistoryEntry[];
  recentIterationMemory?: string[];
};

export type FunnelPromptSynthesisResult = {
  prompt: string;
  usedAi: boolean;
  exhibitAdvisory: NonNullable<Awaited<ReturnType<typeof getExhibitDesignAdvisory>>> | null;
  clarifyingQuestion?: string | null;
  businessSpecificityScore?: number;
  contextGaps?: string[];
};

type BusinessContextCoverage = {
  businessSpecificityScore: number;
  contextGaps: string[];
  clarifyingQuestion: string | null;
};

type PromptSynthesisGenerateText = (opts: {
  system?: string;
  user: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  temperature?: number;
  baseUrlOverride?: string;
  apiKeyOverride?: string;
}) => Promise<string>;

type FunnelPromptSynthesisOptions = {
  generateTextImpl?: PromptSynthesisGenerateText;
};

type FallbackPromptOptions = {
  exhibitAdvisory?: Awaited<ReturnType<typeof getExhibitDesignAdvisory>> | null;
};

type SanitizedExhibitAdvisory = NonNullable<Awaited<ReturnType<typeof getExhibitDesignAdvisory>>>;

const EXHIBIT_RULE_LEVEL_PATTERNS = [
  /^exhibit library guidance:/i,
  /^exhibit foundation rules:/i,
  /^exhibit cta rules:/i,
  /^exhibit input rules:/i,
  /^exhibit anti-patterns:/i,
  /^exhibit form-flow rules:/i,
  /^exhibit commerce rules:/i,
  /^exhibit reference anchors:/i,
];

function cleanText(value: unknown, max = 1200) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function compactParagraph(value: unknown, max = 2400) {
  return typeof value === "string"
    ? value.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim().slice(0, max)
    : "";
}

function cleanList(value: unknown, maxItems = 8, maxLen = 160) {
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

function cleanHistory(value: unknown, maxItems = 6, maxLen = 240) {
  if (!Array.isArray(value)) return [] as SynthesisHistoryEntry[];
  const out: SynthesisHistoryEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const role = rec.role === "assistant" ? "assistant" : rec.role === "user" ? "user" : null;
    const content = cleanText(rec.content, maxLen);
    if (!role || !content) continue;
    out.push({ role, content });
    if (out.length >= maxItems) break;
  }
  return out;
}

function sanitizeExhibitAdvisory(
  advisory: Awaited<ReturnType<typeof getExhibitDesignAdvisory>> | null | undefined,
): SanitizedExhibitAdvisory | null {
  if (!advisory) return null;

  const cleanedLines = String(advisory.guidance || "")
    .split(/\r?\n+/)
    .map((line) => cleanText(line, 320))
    .filter(Boolean);

  const retainedLines = cleanedLines.filter((line) => EXHIBIT_RULE_LEVEL_PATTERNS.some((pattern) => pattern.test(line)));

  return {
    ...advisory,
    guidance: [
      "Exhibit usage rule: treat Exhibit as secondary design advisory only.",
      "Use Exhibit for spacing, typography, density, elevation, anti-pattern avoidance, and reference anchors.",
      "If Exhibit conflicts with business context, the current page state, runtime truth, or the newest user direction, ignore the conflicting Exhibit guidance.",
      ...Array.from(new Set(retainedLines)),
    ].join("\n"),
  };
}

function hasRequestSignal(value: string, pattern: RegExp) {
  return pattern.test(value);
}

function hasAnyRequestSignal(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => hasRequestSignal(value, pattern));
}

function buildRequestInterpretationBlock(requestPrompt: string) {
  const normalized = cleanText(requestPrompt, 2400).toLowerCase();
  if (!normalized) return "";

  const directives: string[] = [];

  const hasSpacingSignal = hasRequestSignal(normalized, /padding|spacing|gutter|margin|breathing room|breathe|air|cramped|tight|dense/);
  const hasButtonSignal = hasRequestSignal(normalized, /cta|button|call to action|book|booking|checkout|buy now|apply/);
  const hasLayoutSignal = hasRequestSignal(normalized, /layout|structure|section|flow|order|sequence/);
  const hasHeaderSignal = hasRequestSignal(normalized, /header area|header|nav area|navigation|hero area|hero|above the fold|top of page/);
  const hasTypographySignal = hasRequestSignal(normalized, /font|fonts|type|typography|headline|title treatment/);
  const hasLayoutDefectSignal = hasAnyRequestSignal(normalized, [
    /overlap|overlapping|collid|collision|covering|covered|stacking on|running into/,
    /header area|under the header|into the header|hero area|nav area/,
    /clipp|cut off|off[- ]screen|overflowing|misalign|misplaced|out of place/,
    /too big|too large|oversized|bloated|crowding|crowded|blocking/,
    /still wrong|still off|still broken|not working|doesn'?t fit|isn'?t aligned|aren'?t aligned/,
  ]);

  if (hasLayoutDefectSignal && (hasSpacingSignal || hasButtonSignal || hasLayoutSignal)) {
    directives.push("Fix overlap, containment, and placement issues before changing visual scale. Keep controls inside their section bounds and stop the header or hero from colliding with nearby content.");
  }

  if (hasSpacingSignal && !hasLayoutDefectSignal) {
    directives.push("Increase padding and spacing rhythm so sections, cards, and controls feel less cramped.");
  }
  if (hasRequestSignal(normalized, /hero|above the fold|headline|opening section/)) {
    directives.push("Strengthen the hero hierarchy so the first viewport lands more clearly.");
  }
  if (hasHeaderSignal) {
    directives.push("Treat the header and adjacent hero as one above-the-fold system. Upgrade structure, spacing, hierarchy, and atmosphere together instead of making a cosmetic local tweak.");
  }
  if (hasHeaderSignal && !hasLayoutDefectSignal) {
    directives.push("Make a stronger autonomous first-screen design decision: improve logo and navigation presence, headline staging, CTA visibility, and the transition from header into hero without asking for more style detail first.");
  }
  if (hasTypographySignal || hasHeaderSignal) {
    directives.push("Make decisive typography upgrades on your own. Improve display-vs-body contrast, weights, spacing, and headline presence without waiting for explicit font instructions unless brand constraints are already known.");
  }
  if (hasRequestSignal(normalized, /proof|credib|trust|testimonial|case stud/)) {
    directives.push("Make proof and credibility cues more explicit and better integrated into the flow.");
  }
  if (hasButtonSignal && hasLayoutDefectSignal) {
    directives.push("Correct CTA sizing, padding, and alignment so the primary button reads clearly without expanding into surrounding content.");
  } else if (hasButtonSignal) {
    directives.push("Clarify the primary CTA path and make the conversion handoff easier to notice.");
  }
  if (hasRequestSignal(normalized, /premium|calm|polish|polished|modern|elevated|intentional/)) {
    directives.push("Push the visual tone toward a more intentional, polished presentation.");
  }
  if (hasRequestSignal(normalized, /copy|messag|wording|filler|generic/)) {
    directives.push("Replace generic wording with tighter, more specific messaging.");
  }
  if (hasLayoutSignal && hasLayoutDefectSignal) {
    directives.push("Repair the broken layout relationship first, then refine spacing or polish only after the collision is resolved.");
  } else if (hasLayoutSignal) {
    directives.push("Improve section structure and pacing instead of patching isolated details.");
  }

  if (!directives.length) {
    directives.push("Translate the user request into cleaner design and implementation direction instead of echoing the phrasing back verbatim.");
  }

  return [
    "REQUEST_INTERPRETATION:",
    ...Array.from(new Set(directives)).map((directive) => `- ${directive}`),
  ].join("\n");
}

function buildAdaptiveDesignDisciplineBlock(input: FunnelPromptSynthesisInput) {
  const intent = input.intentProfile;
  const brief = input.funnelBrief;
  const pageType = cleanText(intent?.pageType, 40);
  const audience = cleanText(intent?.audience || brief?.audienceSummary, 220);
  const offer = cleanText(intent?.offer || brief?.offerSummary, 220);
  const businessContext = compactParagraph(input.businessContext, 320);
  const designBrief = compactParagraph(input.designContext?.designBrief, 320);
  const fontDirection = cleanText(input.designContext?.fontDirection, 180);
  const vibeKeywords = cleanList(input.designContext?.vibeKeywords, 6, 32);
  const designConcepts = compactParagraph(input.designContext?.designConcepts, 240);

  const businessFitLine = [
    "Adaptive sophistication rule: choose the visual posture from the business, audience, offer, page type, and latest user direction.",
    "Do not force one house aesthetic and do not collapse into generic page-builder output.",
  ].join(" ");

  const specificityLine = [
    "Default to a commercially mature, intentionally art-directed result even when the brief is incomplete.",
    audience ? `Let the audience shape the level of polish and seriousness: ${audience}.` : "",
    offer ? `Let the offer shape the commercial posture: ${offer}.` : "",
    businessContext ? `Use the business context to choose what kind of sophistication actually fits: ${businessContext}` : "",
    designBrief ? `Honor the explicit art direction brief: ${designBrief}` : "",
    fontDirection ? `Treat the requested typography direction as binding guidance: ${fontDirection}.` : "",
    vibeKeywords.length ? `Use these vibe cues as actual design choices, not filler adjectives: ${vibeKeywords.join(", ")}.` : "",
    designConcepts ? `Let these design concepts shape composition and styling: ${designConcepts}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const pageTypeLine =
    pageType === "booking"
      ? "Booking posture: make the booking motion feel like a real product surface with trust, proof, and scheduling treated as central, not secondary."
      : pageType === "lead-capture"
        ? "Lead-capture posture: make the value exchange immediate, credible, and visually intentional instead of template-like."
        : pageType === "sales" || pageType === "checkout"
          ? "Sales posture: make the offer feel expensive in structure, proof-led in sequencing, and commercially confident without gimmicks."
          : pageType === "application"
            ? "Application posture: make selectivity, fit, and value feel intentional and high-trust rather than bureaucratic or generic."
            : pageType === "webinar"
              ? "Webinar posture: make the event promise feel sharp, current, and credible without relying on stale webinar-template tropes."
              : "Design posture: the page should feel intentionally composed for this business, not like a safe default shell with minor styling."
;

  const performanceLine = [
    "Performance rule: push style as far as it can go without harming first-screen clarity, load discipline, or interaction speed.",
    "Use richer media, motion, or atmospheric backgrounds only when they materially improve the page and still keep non-critical assets defer-friendly.",
    "Treat above-the-fold media priority as a deliberate choice, not a default for every decorative asset.",
  ].join(" ");

  return ["DESIGN_DISCIPLINE:", `- ${businessFitLine}`, `- ${specificityLine}`, `- ${pageTypeLine}`, `- ${performanceLine}`].join("\n");
}

function buildStructuralDisciplineBlock() {
  return [
    "STRUCTURAL_DISCIPLINE:",
    "- Structural quality is non-negotiable. Never generate placeholder sections, default layouts, or empty structural elements.",
    "- Before adding or preserving any section, decide its purpose, the user state it addresses, and the action or movement it creates. If those are unclear, remove, merge, or rework the section instead of padding the page.",
    "- Every section must have a clear purpose, defined content, intentional hierarchy and spacing, and must move the visitor forward in the funnel.",
    "- Layout style may vary, but hierarchy, alignment, and structural intent cannot become generic or underdeveloped.",
    "- Header rule: if a header exists, it must intentionally serve navigation, conversion support, trust reinforcement, brand presence, or a deliberate combination. A logo-only header or a header that does not help the page goal is invalid.",
    "- Removal test: if removing a section would improve clarity, that section should not exist in the output.",
  ].join("\n");
}

function buildConversionBlueprintBlock(input: FunnelPromptSynthesisInput) {
  const intent = input.intentProfile;
  const brief = input.funnelBrief;
  const pageType = cleanText(intent?.pageType, 40).toLowerCase();
  const audience = cleanText(intent?.audience || brief?.audienceSummary, 220);
  const offer = cleanText(intent?.offer || brief?.offerSummary, 220);
  const primaryCta = cleanText(intent?.primaryCta, 160);
  const routingDestination = cleanText(intent?.routingDestination || brief?.routingDestination, 220);
  const formStrategy = cleanText(intent?.formStrategy, 80).toLowerCase();
  const hasBookingMotion = pageType === "booking" || formStrategy === "booking" || /\b(book|schedule|appointment|consultation|calendar)\b/i.test(`${primaryCta} ${offer} ${routingDestination}`);
  const stageLine = hasBookingMotion
    ? "Lock the core page flow to attention -> belief -> proof -> booking handoff -> reassurance -> action."
    : "Lock the core page flow to attention -> belief -> proof -> action, and only add an extra handoff section when the funnel logic truly needs it.";
  const headlineLine = audience || offer
    ? `Auto-write the headline direction from the offer and audience. Use ${offer || "the offer"} to make the promise specific${audience ? ` for ${audience}` : ""}; do not wait for the user to provide finished hero copy.`
    : "Auto-write the headline direction from the conversion goal and business context; do not wait for the user to provide finished hero copy.";
  const ctaLine = primaryCta
    ? `Treat '${primaryCta}' as the dominant CTA path, but improve the visible phrasing, dominance, and placement if the current wording is weak.`
    : "Generate the dominant CTA language yourself from the conversion action and keep it specific, high-intent, and easy to act on.";
  const proofLine = hasBookingMotion
    ? "Proof rule: attach proof beside the first CTA and repeat reassurance at the booking handoff so the scheduler feels earned, native, and safe."
    : "Proof rule: attach proof beside or immediately after the first CTA beat, then restage trust before the final action so belief does not collapse at the ask.";
  const schedulerLine = hasBookingMotion
    ? "Scheduler discipline: default to one dominant booking runtime on the page. Do not place a second full calendar or scheduler lower in the page unless the user explicitly asks for multiple booking slots, fallback scheduling, or side-by-side calendar paths."
    : "";
  const fallbackLine = hasBookingMotion
    ? "Fallback handoff rule: if the page needs a softer second chance to book, use objection handling plus a quieter return-to-booking CTA or jump link back to the main scheduler instead of duplicating the full scheduling UI."
    : "";
  const operatorLine = "Operator-first rule: default to 80% completion with minimal edits required. Infer layout, section ordering, CTA copy, proof placement, and conversion framing automatically instead of asking the user to design.";
  const designerLine = "Designer override rule: allow later section overrides or art-direction refinements, but do not weaken the default operator-first completeness of the initial output.";
  const layoutLine = "Visual discipline: avoid generic stacked-card SaaS shells, repetitive boxed sections, and border-heavy scaffolds. Prefer full-width composition, decisive hierarchy, clean spacing, restrained contrast shifts, and a curated visual rhythm.";
  const decisionLine = hasBookingMotion
    ? "Deliver a full conversion-ready booking layout with the booking flow embedded as part of the page, not as a detached widget or vague CTA promise."
    : "Deliver a full conversion-ready funnel layout with proof and CTA already staged in the right places, not a flexible page skeleton that still needs structural design work.";

  return [
    "CONVERSION_BLUEPRINT:",
    `- ${operatorLine}`,
    `- ${stageLine}`,
    `- ${headlineLine}`,
    `- ${ctaLine}`,
    `- ${proofLine}`,
    schedulerLine ? `- ${schedulerLine}` : "",
    fallbackLine ? `- ${fallbackLine}` : "",
    `- ${decisionLine}`,
    `- ${layoutLine}`,
    `- ${designerLine}`,
    "- User-input discipline: the user should only need to supply the offer, brand tone, and optional creative direction. Infer the rest from business context, page type, CTA path, and funnel intent.",
  ].join("\n");
}

function buildDesignTokenDisciplineBlock() {
  return buildDesignTokenContractBlock("DESIGN_TOKEN_DISCIPLINE:");
}

function buildFunctionalComponentDisciplineBlock() {
  return [
    "FUNCTIONAL_COMPONENT_DISCIPLINE:",
    "- Treat calendars, forms, dashboards, chat handoffs, checkout modules, and other functional UI as classified funnel surfaces, not raw embeds pasted into the page.",
    "- Decide the role first: booking handoff, qualification step, proof-backed application step, dashboard proof surface, product comparison, or support utility. Then wrap the component in a section that explains why it exists and what the visitor should do next.",
    "- Functional UI must live inside a deliberate frame: heading, expectation-setting copy, adjacent reassurance or proof, and container styling that makes the component feel native to the funnel rather than borrowed app chrome.",
    "- Booking calendars need booking-specific framing around what happens next, who the call is for, and why scheduling now is safe. Do not drop a bare calendar widget under generic copy.",
    "- Clamp layout intentionally: main content should generally read inside a 1100-1200px frame, tighter copy or form stacks should sit around 680-900px, and embedded components must never exceed their container width.",
    "- Keep spacing rhythmic: roughly 72-120px between major sections, 24-48px inside framed sections or cards, and 12-20px for tight copy-to-control spacing.",
    "- Pick one alignment system per functional section and hold it consistently. Avoid equal-weight panels, flat repeated cards, or dashboard-like density that fights the funnel hierarchy.",
  ].join("\n");
}

function buildContinuityContext(input: FunnelPromptSynthesisInput) {
  const recentChatHistory = cleanHistory(input.recentChatHistory, 6, 240);
  const recentIterationMemory = cleanList(input.recentIterationMemory, 6, 220);

  const historySummary = recentChatHistory
    .slice(-4)
    .map((entry) => `${entry.role === "assistant" ? "Assistant" : "User"}: ${entry.content}`)
    .join(" ");

  const lastUserDirection = [...recentChatHistory].reverse().find((entry) => entry.role === "user")?.content || "";
  const lastAssistantMove = [...recentChatHistory].reverse().find((entry) => entry.role === "assistant")?.content || "";

  return {
    recentChatHistory,
    recentIterationMemory,
    historySummary,
    lastUserDirection,
    lastAssistantMove,
  };
}

function parseJsonPrompt(raw: string) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { prompt?: unknown };
    const prompt = cleanText(parsed?.prompt, 2400);
    return prompt || null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as { prompt?: unknown };
      const prompt = cleanText(parsed?.prompt, 2400);
      return prompt || null;
    } catch {
      return null;
    }
  }
}

function countStructuredSignals(input: FunnelPromptSynthesisInput) {
  const intent = input.intentProfile;
  const brief = input.funnelBrief;
  return [
    intent?.pageType,
    intent?.pageGoal,
    intent?.audience,
    intent?.offer,
    intent?.primaryCta,
    intent?.shellConcept,
    intent?.sectionPlan,
    brief?.funnelGoal,
    brief?.offerSummary,
    brief?.audienceSummary,
  ].filter((value) => cleanText(value, 40)).length;
}

function normalizeIntentValue(value: string) {
  return cleanText(value, 240).toLowerCase().replace(/\s+/g, " ").trim();
}

function extractAnsweredBusinessContext(requestPrompt: string) {
  const prompt = cleanText(requestPrompt, 2400);
  if (!prompt) return { offer: "", outcome: "", audience: "" };

  const read = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      const value = cleanText(match?.[1], 220);
      if (value) return value;
    }
    return "";
  };

  return {
    offer: read([
      /\b(?:the\s+)?(?:actual\s+)?(?:offer|service)\s+is\s+(.+?)(?:[.?!]|$)/i,
      /\b(?:this|the)\s+page\s+should\s+frame\s+(.+?)(?:[.?!]|$)/i,
      /\bframe\s+the\s+page\s+around\s+(.+?)(?:[.?!]|$)/i,
    ]),
    outcome: read([
      /\b(?:the\s+)?(?:result|outcome)\s+is\s+(.+?)(?:[.?!]|$)/i,
      /\bhelp\s+the\s+buyer\s+get\s+(.+?)(?:[.?!]|$)/i,
      /\bmove\s+someone\s+toward\s+(.+?)(?:[.?!]|$)/i,
    ]),
    audience: read([
      /\b(?:the\s+)?audience\s+is\s+(.+?)(?:[.?!]|$)/i,
      /\bthis\s+is\s+for\s+(.+?)(?:[.?!]|$)/i,
      /\bfor\s+(.+?)\s+who\s+need\b/i,
    ]),
  };
}

function resolveBusinessContextCoverage(input: FunnelPromptSynthesisInput): BusinessContextCoverage {
  const requestPrompt = cleanText(input.requestPrompt, 2400);
  const promptAnsweredContext = extractAnsweredBusinessContext(requestPrompt);
  const intent = input.intentProfile;
  const brief = input.funnelBrief;
  const pageType = intent?.pageType;
  const offer = cleanText(intent?.offer, 180) || cleanText(brief?.offerSummary, 180) || promptAnsweredContext.offer;
  const audience = cleanText(intent?.audience, 180) || cleanText(brief?.audienceSummary, 180) || promptAnsweredContext.audience;
  const defaultOffer = pageType ? defaultOfferForPageType(pageType) : "";
  const defaultAudience = pageType ? defaultAudienceForPageType(pageType) : "";
  const hasDefaultOffer = Boolean(defaultOffer) && normalizeIntentValue(offer) === normalizeIntentValue(defaultOffer);
  const hasDefaultAudience = Boolean(defaultAudience) && normalizeIntentValue(audience) === normalizeIntentValue(defaultAudience);
  const businessContext = compactParagraph(input.businessContext, 2400);
  const isBusinessContextThin = businessContext.length < 180;
  const hasCurrent = Boolean(cleanText(input.currentHtml, 40) || cleanText(input.currentCss, 40));
  const needsOfferSpecificity = /(offer|offers|service|services|product|products|package|packages|plan|plans|pricing|price|prices|quote|quotes|consultation|demo|program|programs)/i.test(requestPrompt);
  const genericPricingRewriteRequest = /(clearer pricing|pricing packages|package tiers|pricing section|make the offer stronger|stronger offer)/i.test(requestPrompt);
  const needsBroadGeneration = !hasCurrent || /(rebuild|rewrite|regenerate|generate|create|build|from scratch|whole page|entire page|full page|consultation funnel|sales page|booking page)/i.test(requestPrompt);
  const contextGaps: string[] = [];

  if (!offer || hasDefaultOffer) contextGaps.push("offer");
  if (!audience || hasDefaultAudience) contextGaps.push("audience");
  if (isBusinessContextThin && !promptAnsweredContext.outcome) contextGaps.push("business context");

  const filledCount = 3 - contextGaps.length;
  const businessSpecificityScore = Math.max(0, Math.min(1, filledCount / 3));

  const missingOfferSignal = (!offer || hasDefaultOffer) && !promptAnsweredContext.offer;
  const missingAudienceSignal = !audience || hasDefaultAudience;

  let clarifyingQuestion: string | null = null;
  if (requestPrompt && needsOfferSpecificity && needsBroadGeneration) {
    if (missingOfferSignal || genericPricingRewriteRequest) {
      clarifyingQuestion = "What is the actual offer or service this page should frame, and what result should it help the buyer get?";
    } else if (missingAudienceSignal && isBusinessContextThin) {
      clarifyingQuestion = "Who is the exact audience this page should speak to, and what makes them a strong fit?";
    } else if (isBusinessContextThin && contextGaps.length >= 2) {
      clarifyingQuestion = "What does this business specifically do, and what outcome should this page move someone toward?";
    }
  }

  return {
    businessSpecificityScore,
    contextGaps,
    clarifyingQuestion,
  };
}

function shouldUseAiPromptSynthesis(input: FunnelPromptSynthesisInput) {
  const requestPrompt = cleanText(input.requestPrompt, 2400);
  const wordCount = requestPrompt ? requestPrompt.split(/\s+/).filter(Boolean).length : 0;
  const structuredSignals = countStructuredSignals(input);
  const hasSelectedRegion = Boolean(cleanText(input.selectedRegion?.label, 40) || cleanText(input.selectedRegion?.summary, 40));
  const hasMedia = Array.isArray(input.contextMedia) && input.contextMedia.length > 0;
  const hasContextKeys = Array.isArray(input.contextKeys) && input.contextKeys.length > 0;
  const hasCurrent = Boolean(cleanText(input.currentHtml, 40) || cleanText(input.currentCss, 40));
  const hasContinuity = cleanHistory(input.recentChatHistory, 3, 120).length > 0 || cleanList(input.recentIterationMemory, 3, 120).length > 0;

  if (!requestPrompt) return false;
  if (structuredSignals <= 2) return true;
  if (wordCount >= 45) return true;
  if (hasSelectedRegion || hasMedia || hasContextKeys) return true;
  if (hasContinuity) return true;
  if (!hasCurrent && structuredSignals >= 4) return false;
  if (hasCurrent && structuredSignals >= 5 && wordCount <= 30) return false;
  return true;
}

function fallbackPrompt(input: FunnelPromptSynthesisInput, options: FallbackPromptOptions = {}) {
  const exhibitAdvisory = sanitizeExhibitAdvisory(options.exhibitAdvisory);
  const requestPrompt = cleanText(input.requestPrompt, 2400);
  const requestInterpretationBlock = buildRequestInterpretationBlock(requestPrompt);
  const routeLabel = cleanText(input.routeLabel, 160) || "/page";
  const funnelName = cleanText(input.funnelName, 160) || "this funnel";
  const pageTitle = cleanText(input.pageTitle, 160) || "this page";
  const intent = input.intentProfile;
  const brief = input.funnelBrief;
  const foundation = buildFunnelFoundationOverview({
    brief: brief ?? null,
    intent: intent ?? null,
    routeLabel,
    funnelName,
    pageTitle,
  });
  const regionLabel = cleanText(input.selectedRegion?.label, 160);
  const regionSummary = cleanText(input.selectedRegion?.summary, 220);
  const contextKeys = cleanList(input.contextKeys, 8, 120);
  const mediaNames = (Array.isArray(input.contextMedia) ? input.contextMedia : [])
    .map((item) => cleanText(item?.fileName || item?.mimeType || item?.url, 120))
    .filter(Boolean)
    .slice(0, 6);
  const continuity = buildContinuityContext(input);
  const adaptiveDesignDisciplineBlock = buildAdaptiveDesignDisciplineBlock(input);
  const structuralDisciplineBlock = buildStructuralDisciplineBlock();
  const conversionBlueprintBlock = buildConversionBlueprintBlock(input);
  const designTokenDisciplineBlock = buildDesignTokenDisciplineBlock();
  const functionalComponentDisciplineBlock = buildFunctionalComponentDisciplineBlock();
  const designContextBlock = buildFunnelDesignContextPromptBlock(input.designContext);
  const surfaceInstruction =
    input.surface === "page-html"
      ? cleanText(input.currentHtml, 40)
        ? "Edit the existing hosted page and preserve what is already working unless the request clearly asks for a broader redesign. Treat saved shell, section-plan, and intent notes as draft guidance only; if the current page, latest user request, or live runtime context points to a better interpretation, update the direction instead of protecting stale assumptions."
        : "Generate the first real version of the page from the available context and make decisive assumptions where the brief is still soft."
      : cleanText(input.currentHtml, 40) || cleanText(input.currentCss, 40)
        ? "Update the existing custom-code fragment with a sharper, more intentional implementation instead of lightly rephrasing the current state. Treat stored intent and shell notes as advisory rather than frozen if the current implementation and latest request have clearly moved forward."
        : "Generate a sharp custom-code fragment that expresses the intent clearly and is strong enough to iterate from.";
  const bookingDirective =
    intent?.pageType === "booking" || intent?.formStrategy === "booking"
      ? [
          "Booking-first draft rule: treat booking as a real native product surface, not just a CTA label.",
          "Design a guided top-to-bottom flow: promise and fit -> proof -> what happens next -> anchored booking section -> reassurance.",
          "The first viewport should make the booking motion obvious, and the main CTA should drive into a real booking section rather than leaving scheduling implied.",
          "Default to one dominant scheduler on the page. Do not duplicate the full booking UI in a later section unless the user explicitly asked for multi-slot or fallback scheduling.",
          "If a later fallback beat is useful, make it a quieter objection-handling section with a return-to-booking CTA instead of a second full calendar.",
          "If the account has a native booking runtime or calendar configured, design around that concrete scheduling handoff instead of inventing a disconnected intake form.",
          "If exact pricing or package details are still soft, keep the booking path decisive anyway and let the consultation carry the next-step detail.",
        ].join(" ")
      : "";

  return [
    `Create the next ${input.surface === "page-html" ? "hosted page" : "custom-code block"} for ${pageTitle} in ${funnelName}. Route: ${routeLabel}.`,
    intent?.pageType ? `Page type: ${intent.pageType}.` : "",
    brief?.funnelGoal ? `Funnel job: ${brief.funnelGoal}.` : "",
    intent?.pageGoal ? `Primary page job: ${intent.pageGoal}.` : "",
    intent?.audience ? `Audience: ${intent.audience}.` : brief?.audienceSummary ? `Audience: ${brief.audienceSummary}.` : "",
    intent?.offer ? `Offer framing: ${intent.offer}.` : brief?.offerSummary ? `Offer framing: ${brief.offerSummary}.` : "",
    intent?.primaryCta ? `Primary CTA: ${intent.primaryCta}.` : "",
    intent?.routingDestination ? `Next-step handling: ${intent.routingDestination}.` : brief?.routingDestination ? `Next-step handling: ${brief.routingDestination}.` : "",
    intent?.conditionalLogic ? `Conditional logic: ${intent.conditionalLogic}.` : brief?.conditionalLogic ? `Conditional logic: ${brief.conditionalLogic}.` : "",
    intent?.taggingPlan ? `Tagging plan: ${intent.taggingPlan}.` : brief?.taggingPlan ? `Tagging plan: ${brief.taggingPlan}.` : "",
    intent?.automationPlan ? `Automation handoff: ${intent.automationPlan}.` : brief?.automationPlan ? `Automation handoff: ${brief.automationPlan}.` : "",
    foundation.shellFrameLabel ? `Recommended shell frame: ${foundation.shellFrameLabel}.` : "",
    foundation.frameSummary ? `Frame posture: ${foundation.frameSummary}` : "",
    intent?.shellConcept ? `Baseline shell: ${intent.shellConcept}.` : "",
    intent?.sectionPlan ? `Section plan: ${intent.sectionPlan}.` : "",
    foundation.designDirectives.length ? `Design directives: ${foundation.designDirectives.join(" ")}` : "",
    exhibitAdvisory?.source ? `Exhibit advisory source: ${exhibitAdvisory.source}.` : "",
    exhibitAdvisory?.designProfileId ? `Exhibit design profile: ${exhibitAdvisory.designProfileId}.` : "",
    exhibitAdvisory?.categories.length ? `Exhibit categories: ${exhibitAdvisory.categories.join(", ")}.` : "",
    exhibitAdvisory?.guidance ? `Exhibit guidance: ${exhibitAdvisory.guidance}` : "",
    continuity.recentIterationMemory.length ? `Recent iteration memory: ${continuity.recentIterationMemory.join(" ")}` : "",
    continuity.historySummary ? `Recent thread continuity: ${continuity.historySummary}` : "",
    continuity.lastUserDirection ? `Newest unresolved user direction: ${continuity.lastUserDirection}` : "",
    continuity.lastAssistantMove ? `Most recent assistant move: ${continuity.lastAssistantMove}` : "",
    `Recommended conversion path: ${foundation.conversionPath}`,
    regionLabel ? `Focus this on ${regionLabel}${regionSummary ? ` (${regionSummary})` : ""}.` : "",
    contextKeys.length ? `Prefer these context elements when relevant: ${contextKeys.join(", ")}.` : "",
    mediaNames.length ? `Use these available assets when helpful: ${mediaNames.join(", ")}.` : "",
    compactParagraph(input.businessContext, 1200) ? `Business context: ${compactParagraph(input.businessContext, 1200)}` : "",
    designContextBlock,
    requestInterpretationBlock,
    adaptiveDesignDisciplineBlock,
    structuralDisciplineBlock,
    conversionBlueprintBlock,
    designTokenDisciplineBlock,
    functionalComponentDisciplineBlock,
    bookingDirective,
    surfaceInstruction,
    "Continuity rule: if the latest turns imply something was still missing or insufficient last time, correct that gap directly instead of drifting into a parallel redesign.",
    "Turn the fragmented steering into one coherent, impactful direction. Do not wait for every missing detail; make strong reasonable assumptions the user can refine later.",
    "Aim for a near-complete operator-ready funnel draft with intentional hierarchy, embedded conversion flow, proof already placed, restrained brand use, adaptive sophistication, and minimal required user edits.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function synthesizeFunnelGenerationPrompt(
  input: FunnelPromptSynthesisInput,
  options: FunnelPromptSynthesisOptions = {},
): Promise<FunnelPromptSynthesisResult> {
  const contextCoverage = resolveBusinessContextCoverage(input);
  const requestPrompt = cleanText(input.requestPrompt, 2400);
  const routeLabel = cleanText(input.routeLabel, 160) || "/page";
  const funnelName = cleanText(input.funnelName, 160) || "this funnel";
  const pageTitle = cleanText(input.pageTitle, 160) || "this page";
  const intent = input.intentProfile;
  const brief = input.funnelBrief;
  const foundation = buildFunnelFoundationOverview({
    brief: brief ?? null,
    intent: intent ?? null,
    routeLabel,
    funnelName,
    pageTitle,
  });
  const regionLabel = cleanText(input.selectedRegion?.label, 160);
  const regionSummary = cleanText(input.selectedRegion?.summary, 220);
  const hasCurrent = Boolean(cleanText(input.currentHtml, 40) || cleanText(input.currentCss, 40));
  const contextKeys = cleanList(input.contextKeys, 8, 120);
  const contextMedia = (Array.isArray(input.contextMedia) ? input.contextMedia : [])
    .map((item) => ({
      url: cleanText(item?.url, 400),
      fileName: cleanText(item?.fileName, 120),
      mimeType: cleanText(item?.mimeType, 120),
    }))
    .filter((item) => item.url)
    .slice(0, 6);
  const continuity = buildContinuityContext(input);
  const designContextBlock = buildFunnelDesignContextPromptBlock(input.designContext);
  const structuralDisciplineBlock = buildStructuralDisciplineBlock();
  const conversionBlueprintBlock = buildConversionBlueprintBlock(input);
  const designTokenDisciplineBlock = buildDesignTokenDisciplineBlock();
  const functionalComponentDisciplineBlock = buildFunctionalComponentDisciplineBlock();

  if (!requestPrompt && !intent && !brief) {
    return {
      prompt: fallbackPrompt(input),
      usedAi: false,
      exhibitAdvisory: null,
      clarifyingQuestion: null,
      businessSpecificityScore: contextCoverage.businessSpecificityScore,
      contextGaps: contextCoverage.contextGaps,
    };
  }

  if (contextCoverage.clarifyingQuestion) {
    return {
      prompt: fallbackPrompt(input),
      usedAi: false,
      exhibitAdvisory: null,
      clarifyingQuestion: contextCoverage.clarifyingQuestion,
      businessSpecificityScore: contextCoverage.businessSpecificityScore,
      contextGaps: contextCoverage.contextGaps,
    };
  }

  let exhibitAdvisory: Awaited<ReturnType<typeof getExhibitDesignAdvisory>> | null = null;
  try {
    exhibitAdvisory = await getExhibitDesignAdvisory({
      requestPrompt,
      routeLabel,
      funnelName,
      pageTitle,
      pageType: intent?.pageType,
      pageGoal: intent?.pageGoal,
      primaryCta: intent?.primaryCta,
      audience: intent?.audience || brief?.audienceSummary,
      offer: intent?.offer || brief?.offerSummary,
      conditionalLogic: intent?.conditionalLogic || brief?.conditionalLogic,
      taggingPlan: intent?.taggingPlan || brief?.taggingPlan,
      automationPlan: intent?.automationPlan || brief?.automationPlan,
      shellFrameId: foundation.shellFrameId,
      shellFrameLabel: foundation.shellFrameLabel,
      shellFrameSummary: foundation.frameSummary,
      shellConcept: intent?.shellConcept || foundation.shellConcept,
      sectionPlan: intent?.sectionPlan || foundation.sectionPlanItems.join(" -> "),
      businessContext: input.businessContext,
      recentChatHistory: continuity.recentChatHistory,
      recentIterationMemory: continuity.recentIterationMemory,
    });
  } catch {
    exhibitAdvisory = null;
  }

  exhibitAdvisory = sanitizeExhibitAdvisory(exhibitAdvisory);

  const fallback = fallbackPrompt(input, { exhibitAdvisory });

  if (!shouldUseAiPromptSynthesis(input)) {
    return {
      prompt: fallback,
      usedAi: false,
      exhibitAdvisory,
      clarifyingQuestion: null,
      businessSpecificityScore: contextCoverage.businessSpecificityScore,
      contextGaps: contextCoverage.contextGaps,
    };
  }

  const system = [
    "You are a prompt strategist inside a funnel builder.",
    "Your job is to convert fragmented, rough, or machine-stitched user steering plus structured funnel context into one high-impact generation brief for another AI model.",
    "Return JSON only: { \"prompt\": \"...\" }.",
    "Do not return explanations, markdown, or code fences.",
    "The prompt must be decisive, conceptually strong, and directly usable for generation.",
    "Do not merely restate every field in sequence.",
    "If the raw request already sounds like a generic stitched paragraph, re-conceptualize it instead of paraphrasing it.",
    "Preserve explicit user intent, route constraints, CTA path, shell direction, and any preserve-vs-change constraints for edits.",
    "Stored funnel brief, page intent, shell concepts, and section plans are working guidance, not immutable truth.",
    "When editing an existing page, treat the current page implementation, the newest user instruction, and any concrete live runtime context as fresher signals than older saved foundation text.",
    "If older saved direction conflicts with the actual current page or the latest clearer context, reinterpret or replace the stale parts instead of repeating them blindly.",
    "Treat recent thread history and iteration-memory notes as continuity anchors, especially when the newest user turn says something was still missing, weak, or not fixed last time.",
    "If the prior assistant move did not satisfy the user, explicitly correct that miss in the next prompt instead of summarizing it neutrally.",
    "Treat Exhibit as optional secondary design advisory only.",
    "Use Exhibit for design rules, spacing, density, typography, elevation, anti-pattern avoidance, and reference anchors, not as the source of business posture or page reasoning.",
    "Never let Exhibit override stronger local signals such as business context, current page state, live runtime truth, or the newest user direction.",
    "If any Exhibit guidance is generic, off-posture, or conflicts with stronger context, ignore the conflicting part instead of blending it into the brief.",
    "If pricing, packaging, proof, or offer specifics are still incomplete, do not stall. Frame the best workable assumption so generation can move forward and the user can refine later.",
    "Keep the prompt concise enough for another model to act on, but rich enough to shape tone, hierarchy, proof, and conversion logic.",
    "Default to operator-first funnel generation. The downstream model should produce a near-complete, production-ready funnel layout rather than a customizable starter page.",
    "Lock section order around attention, belief, proof, and action. Add handoff-specific sections like booking or checkout only when the funnel logic requires them.",
    "Auto-fill headline direction, CTA language, proof placement, and layout structure from the business type, audience, offer, and conversion path. Do not make the user do design work the system can infer.",
    "The brief must bias toward 80% completion with minimal edits required while still leaving room for later designer overrides.",
    "Avoid generic layouts, stacked-card sameness, boxed-everywhere shells, and border-heavy SaaS scaffolds unless the business context truly calls for them.",
    "Structural quality is mandatory. Do not authorize placeholder sections, decorative empty shells, generic default layouts, or sections that exist without a defined role in the funnel.",
    "Any section you propose must earn its place through purpose, visitor-state relevance, and forward movement. If that case is weak, cut or merge the section.",
    "Any header in the brief must justify itself through navigation, conversion support, trust reinforcement, brand presence, or an intentional combination. A floating logo header is not acceptable.",
    "The output must feel design-led, not questionnaire-led. Favor strong shells, persuasive sequencing, and visual intention over generic page-builder filler.",
    "Choose the level and style of sophistication from the business, audience, offer, page type, and latest user direction. Do not force one house aesthetic.",
    "Default away from generic template output. The brief should push toward a commercially mature, intentionally art-directed result that still fits the business.",
    "Premium does not mean heavy by default. Stronger visual ambition must preserve first-screen clarity, load discipline, and defer-friendly handling for non-critical media.",
    "Use stored brand colors calmly and selectively. Treat them as accent inputs, not permission to flood the page with brand color.",
    "Never echo or quote the user's phrasing back verbatim in the final prompt.",
    "Abstract the request into clean directive language and do not reuse long phrases from the raw request unless they are exact content that must survive unchanged, such as a CTA label, product name, brand name, or legal wording.",
  ].join("\n");

  const user = [
    `SURFACE: ${input.surface === "page-html" ? "Whole-page hosted funnel generation" : "Custom code block generation"}`,
    `CURRENT_STATE: ${hasCurrent ? "Editing existing implementation" : "Creating first implementation"}`,
    regionLabel ? `FOCUS_REGION: ${regionLabel}${regionSummary ? ` - ${regionSummary}` : ""}` : "",
    `ROUTE: ${routeLabel}`,
    `FUNNEL: ${funnelName}`,
    `PAGE: ${pageTitle}`,
    requestPrompt ? `USER_REQUEST_TO_INTERPRET:\n${requestPrompt}` : "",
    compactParagraph(input.businessContext, 1600) ? `BUSINESS_CONTEXT:\n${compactParagraph(input.businessContext, 1600)}` : "",
    designContextBlock,
    structuralDisciplineBlock,
    conversionBlueprintBlock,
    designTokenDisciplineBlock,
    functionalComponentDisciplineBlock,
    brief
      ? [
          "FUNNEL_BRIEF:",
          brief.funnelGoal ? `- Funnel job: ${brief.funnelGoal}` : "",
          brief.offerSummary ? `- Offer or pricing: ${brief.offerSummary}` : "",
          brief.audienceSummary ? `- Shared audience: ${brief.audienceSummary}` : "",
          brief.qualificationFields ? `- Intake details: ${brief.qualificationFields}` : "",
          brief.routingDestination ? `- Routing destination: ${brief.routingDestination}` : "",
          brief.conditionalLogic ? `- Conditional logic: ${brief.conditionalLogic}` : "",
          brief.taggingPlan ? `- Tagging plan: ${brief.taggingPlan}` : "",
          brief.automationPlan ? `- Automation handoff: ${brief.automationPlan}` : "",
          brief.integrationPlan ? `- Platform notes: ${brief.integrationPlan}` : "",
        ].filter(Boolean).join("\n")
      : "",
    intent
      ? [
          "PAGE_INTENT:",
          intent.pageType ? `- Page type: ${intent.pageType}` : "",
          intent.pageGoal ? `- Page job: ${intent.pageGoal}` : "",
          intent.audience ? `- Audience: ${intent.audience}` : "",
          intent.offer ? `- Offer framing: ${intent.offer}` : "",
          intent.primaryCta ? `- Primary CTA: ${intent.primaryCta}` : "",
          intent.qualificationFields ? `- Qualification details: ${intent.qualificationFields}` : "",
          intent.routingDestination ? `- Next-step handling: ${intent.routingDestination}` : "",
          intent.conditionalLogic ? `- Conditional logic: ${intent.conditionalLogic}` : "",
          intent.taggingPlan ? `- Tagging plan: ${intent.taggingPlan}` : "",
          intent.automationPlan ? `- Automation handoff: ${intent.automationPlan}` : "",
          intent.formStrategy ? `- Platform path: ${intent.formStrategy}` : "",
          foundation.shellFrameLabel ? `- Selected shell frame: ${foundation.shellFrameLabel}` : "",
          foundation.frameSummary ? `- Frame posture: ${foundation.frameSummary}` : "",
          intent.shellConcept ? `- Shell concept: ${intent.shellConcept}` : "",
          intent.sectionPlan ? `- Section plan: ${intent.sectionPlan}` : "",
          ...foundation.designDirectives.map((directive) => `- Frame design directive: ${directive}`),
        ].filter(Boolean).join("\n")
      : "",
    [
      "FOUNDATION_DIRECTION:",
      `- Recommended foundation: ${foundation.summary}`,
      `- Conversion path: ${foundation.conversionPath}`,
      `- Business narrative: ${foundation.businessNarrative}`,
      `- Brand posture: use business colors and fonts selectively; favor calm neutrals, hierarchy, and contrast over full-brand treatments.`,
      ...(intent?.pageType === "booking" || intent?.formStrategy === "booking"
        ? [
            `- Booking-first rule: the first take should feel like a real scheduling page from the start, with a guided top-to-bottom flow and a concrete booking handoff rather than abstract CTA language.`,
            `- Booking UX rule: make the main CTA visible above the fold and carry it into a dedicated booking section with expectation-setting and trust cues.`,
          ]
        : []),
    ].join("\n"),
      [
        "EXHIBIT_PRECEDENCE_RULES:",
        "- Raw business context, the current page state, live runtime behavior, and the newest user direction outrank Exhibit advice.",
        "- Use Exhibit only to sharpen design discipline, spacing, density, typography, elevation, anti-pattern avoidance, and reference anchors.",
        "- Do not let Exhibit set offer logic, business posture, booking-vs-commerce behavior, or shell direction when stronger local context already answers those choices.",
        "- If Exhibit sounds generic or weak, down-rank it instead of mimicking it.",
      ].join("\n"),
    exhibitAdvisory
      ? [
          "EXHIBIT_ADVISORY:",
          `- Advisory source: ${exhibitAdvisory.source}`,
          exhibitAdvisory.designProfileId ? `- Exhibit design profile: ${exhibitAdvisory.designProfileId}` : "",
          exhibitAdvisory.categories.length ? `- Suggested Exhibit categories: ${exhibitAdvisory.categories.join(", ")}` : "",
          exhibitAdvisory.guidance,
        ].filter(Boolean).join("\n")
      : "",
    continuity.recentIterationMemory.length
      ? [
          "ITERATION_MEMORY:",
          ...continuity.recentIterationMemory.map((item) => `- ${item}`),
        ].join("\n")
      : "",
    continuity.recentChatHistory.length
      ? [
          "RECENT_THREAD:",
          ...continuity.recentChatHistory.slice(-4).map((entry) => `- ${entry.role === "assistant" ? "Assistant" : "User"}: ${entry.content}`),
        ].join("\n")
      : "",
    contextKeys.length ? `SELECTED_CONTEXT:\n- ${contextKeys.join("\n- ")}` : "",
    contextMedia.length
      ? [
          "SELECTED_MEDIA:",
          ...contextMedia.map((item) => `- ${item.fileName || item.mimeType || item.url}`),
        ].join("\n")
      : "",
    hasCurrent
      ? "EDITING_RULE: If this is an edit, the synthesized prompt should tell the generator exactly what to preserve, what to improve, and how aggressively to change the current implementation."
      : "GENERATION_RULE: If this is a first draft, the synthesized prompt should establish a strong conceptual direction instead of sounding like a questionnaire dump.",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const runGenerateText = options.generateTextImpl ?? generateText;
    const raw = await runGenerateText({ system, user, temperature: 0.35 });
    const parsedPrompt = parseJsonPrompt(raw);
    if (!parsedPrompt) {
      return {
        prompt: fallback,
        usedAi: false,
        exhibitAdvisory,
        clarifyingQuestion: null,
        businessSpecificityScore: contextCoverage.businessSpecificityScore,
        contextGaps: contextCoverage.contextGaps,
      };
    }
    return {
      prompt: parsedPrompt,
      usedAi: true,
      exhibitAdvisory,
      clarifyingQuestion: null,
      businessSpecificityScore: contextCoverage.businessSpecificityScore,
      contextGaps: contextCoverage.contextGaps,
    };
  } catch {
    return {
      prompt: fallback,
      usedAi: false,
      exhibitAdvisory,
      clarifyingQuestion: null,
      businessSpecificityScore: contextCoverage.businessSpecificityScore,
      contextGaps: contextCoverage.contextGaps,
    };
  }
}