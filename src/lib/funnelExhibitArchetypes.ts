import { FUNNEL_PAGE_INTENT_TYPES, type FunnelPageIntentType } from "@/lib/funnelPageIntent";

export type FunnelExhibitArchetype = {
  id: string;
  label: string;
  pageTypes: FunnelPageIntentType[];
  triggers: string[];
  shellPosture: string;
  heroHierarchy: string[];
  sectionSequence: string[];
  proofStrategy: string;
  ctaCadence: string;
  designTone: string;
  antiPatterns: string[];
  resourceCategories: string[];
};

export type FunnelExhibitArchetypePack = {
  version: 1;
  generatedAt: string;
  source: "agent" | "local";
  summary: string;
  designProfileId: string;
  categories: string[];
  archetypes: FunnelExhibitArchetype[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, max = 240) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanList(value: unknown, maxItems = 8, maxLen = 120) {
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

function cleanPageTypes(value: unknown) {
  const allowed = new Set<string>(FUNNEL_PAGE_INTENT_TYPES as readonly string[]);
  return cleanList(value, 6, 40).filter((item): item is FunnelPageIntentType => allowed.has(item));
}

function coerceArchetype(raw: unknown): FunnelExhibitArchetype | null {
  if (!isRecord(raw)) return null;
  const id = cleanText(raw.id, 80);
  const label = cleanText(raw.label, 160);
  if (!id || !label) return null;
  return {
    id,
    label,
    pageTypes: cleanPageTypes(raw.pageTypes),
    triggers: cleanList(raw.triggers, 8, 80),
    shellPosture: cleanText(raw.shellPosture, 320),
    heroHierarchy: cleanList(raw.heroHierarchy, 6, 140),
    sectionSequence: cleanList(raw.sectionSequence, 10, 140),
    proofStrategy: cleanText(raw.proofStrategy, 240),
    ctaCadence: cleanText(raw.ctaCadence, 220),
    designTone: cleanText(raw.designTone, 220),
    antiPatterns: cleanList(raw.antiPatterns, 8, 140),
    resourceCategories: cleanList(raw.resourceCategories, 8, 80),
  };
}

function cloneSettingsJson(settingsJson: unknown) {
  return isRecord(settingsJson) ? { ...(settingsJson as Record<string, unknown>) } : {};
}

function tokenize(value: string) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function buildDefaultFunnelExhibitSeedPrompt() {
  return [
    "Create a reusable funnel archetype pack for VSL-first, booking-first consultation, booking confirmation, post-opt-in VSL continuation, proof-heavy sales, and application funnels.",
    "Return structured JSON with archetypes, triggers, page types, shell posture, hero hierarchy, section sequence, proof strategy, CTA cadence, design tone, anti-patterns, and resource categories.",
    "Ground the shell in conversion flow first so the pack can attach quickly across different businesses and then be refined on later passes.",
  ].join(" ");
}

export function buildDefaultFunnelExhibitArchetypePack(): FunnelExhibitArchetypePack {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "local",
    summary: "Reusable funnel-shell guidance for VSL, booking, confirmation, sales, and application pages so generation can attach a strong first-pass structure quickly.",
    designProfileId: "marketing-editorial",
    categories: ["Layout", "Cards", "Feedback", "Inputs", "Style Families", "Navigation"],
    archetypes: [
      {
        id: "vsl-first",
        label: "VSL-first landing page",
        pageTypes: ["sales", "lead-capture", "webinar"],
        triggers: ["vsl", "video sales letter", "hero video", "watch the video"],
        shellPosture: "Lead with a dominant video promise, then move into proof, mechanism, objections, and a decisive CTA path.",
        heroHierarchy: ["headline", "video frame", "outcome subhead", "primary CTA"],
        sectionSequence: ["hero video", "proof strip", "problem and mechanism", "offer or next step", "objections", "CTA close"],
        proofStrategy: "Use proof immediately after the VSL so the video promise is validated before asking for commitment.",
        ctaCadence: "Primary CTA above the fold, once after proof, once after objections, and a final close CTA.",
        designTone: "Editorial and high-contrast with a calm frame around the video rather than flashy launch-page noise.",
        antiPatterns: ["burying the video below the fold", "making the page read like a generic SaaS homepage", "overloading the hero with multiple competing actions"],
        resourceCategories: ["Layout", "Cards", "Feedback", "Style Families"],
      },
      {
        id: "booking-first-consultation",
        label: "Booking-first consultation page",
        pageTypes: ["booking"],
        triggers: ["book a call", "consultation", "strategy call", "demo", "schedule"],
        shellPosture: "A premium trust-to-booking sequence that makes the consult feel valuable before the calendar appears.",
        heroHierarchy: ["promise", "fit qualifier", "primary booking CTA", "trust note"],
        sectionSequence: ["hero", "credibility strip", "who this is for", "outcomes and process", "proof", "booking section", "reassurance close"],
        proofStrategy: "Proof should frame the caliber of the conversation, not just general testimonials.",
        ctaCadence: "One clear booking CTA in the hero, repeated into a dedicated booking section and near the close.",
        designTone: "Premium, calm, and restrained with strong spacing, contrast, and reassurance rather than hype.",
        antiPatterns: ["treating booking as a tiny footer CTA", "dropping a naked calendar with no expectation-setting", "using loud brand color washes that reduce trust"],
        resourceCategories: ["Layout", "Inputs", "Cards", "Feedback"],
      },
      {
        id: "booking-confirmation",
        label: "Booking confirmation page",
        pageTypes: ["thank-you"],
        triggers: ["booking confirmation", "confirmed", "thank you", "next steps", "after booking"],
        shellPosture: "Confirmation first, then expectation-setting, next-step assets, and reassurance about what happens before the meeting.",
        heroHierarchy: ["confirmation headline", "what happens next", "calendar or logistics note", "secondary CTA"],
        sectionSequence: ["confirmation hero", "next steps", "prep or checklist", "credibility reminder", "optional secondary asset"],
        proofStrategy: "Use lightweight credibility reminders only; the page should reduce uncertainty more than resell the offer.",
        ctaCadence: "Keep the main action informational. Only use secondary CTAs for prep, case studies, or related content.",
        designTone: "Clear, stable, and reassuring with low friction and no aggressive sales pressure.",
        antiPatterns: ["sending visitors into a dead-end thank-you page", "immediately hard-selling before expectations are clear", "hiding key logistics"],
        resourceCategories: ["Feedback", "Cards", "Layout"],
      },
      {
        id: "post-opt-in-vsl",
        label: "Post-opt-in VSL continuation page",
        pageTypes: ["thank-you", "sales", "webinar"],
        triggers: ["after opt-in", "continuation", "watch next", "thank-you vsl", "post registration"],
        shellPosture: "Bridge from the completed opt-in into deeper persuasion with a VSL-led continuation and a clearer commercial next move.",
        heroHierarchy: ["transition headline", "video", "why watch this now", "next CTA"],
        sectionSequence: ["transition hero", "video", "proof", "mechanism or breakdown", "CTA close"],
        proofStrategy: "Use proof to justify why the visitor should keep investing attention after the initial opt-in.",
        ctaCadence: "Keep the CTA soft before the video, then strengthen after proof and again near the close.",
        designTone: "Focused and deliberate, with a sense of progression from the previous step rather than a totally different page identity.",
        antiPatterns: ["feeling disconnected from the previous step", "repeating the opt-in page instead of progressing it", "burying the VSL"],
        resourceCategories: ["Layout", "Cards", "Style Families"],
      },
      {
        id: "proof-heavy-sales",
        label: "Proof-heavy sales page",
        pageTypes: ["sales", "checkout"],
        triggers: ["sales page", "offer", "buy now", "social proof", "case study"],
        shellPosture: "A proof-led sales page where evidence and outcome specificity carry most of the persuasion load.",
        heroHierarchy: ["offer promise", "proof headline", "CTA", "risk-reduction note"],
        sectionSequence: ["hero", "proof strip", "case studies", "offer breakdown", "objections", "CTA close"],
        proofStrategy: "Front-load concrete results, recognizable trust markers, and case studies before deep feature detail.",
        ctaCadence: "Hero CTA, proof CTA, offer CTA, and close CTA with consistent wording.",
        designTone: "Confident and conversion-focused with disciplined card systems and strong visual separation between proof blocks.",
        antiPatterns: ["long generic copy with weak evidence", "waiting too long to establish trust", "too many CTA variants"],
        resourceCategories: ["Cards", "Layout", "Feedback", "Pricing"],
      },
      {
        id: "application",
        label: "Application or qualification page",
        pageTypes: ["application", "lead-capture"],
        triggers: ["apply", "application", "qualify", "qualification", "screening"],
        shellPosture: "Frame selectivity and fit first, then guide the visitor through the application with low-friction seriousness.",
        heroHierarchy: ["fit statement", "who this is for", "apply CTA", "expectation note"],
        sectionSequence: ["hero", "fit and non-fit", "process", "proof", "application section", "expectation close"],
        proofStrategy: "Use proof to show the quality bar and likely outcomes for qualified applicants.",
        ctaCadence: "One primary apply CTA in the hero and one at the actual application section.",
        designTone: "Selective and credible, not intimidating; clear enough that qualified visitors self-select in.",
        antiPatterns: ["making the application feel like a generic contact form", "asking for too much too early", "hiding the process or review logic"],
        resourceCategories: ["Inputs", "Feedback", "Layout", "Cards"],
      },
    ],
  };
}

export function coerceFunnelExhibitArchetypePack(raw: unknown): FunnelExhibitArchetypePack | null {
  const sourceRaw = isRecord(raw) && isRecord(raw.pack) ? raw.pack : raw;
  if (!isRecord(sourceRaw)) return null;
  const archetypes = Array.isArray(sourceRaw.archetypes)
    ? sourceRaw.archetypes.map((item) => coerceArchetype(item)).filter((item): item is FunnelExhibitArchetype => Boolean(item)).slice(0, 12)
    : [];
  if (!archetypes.length) return null;
  const source = sourceRaw.source === "agent" ? "agent" : "local";
  return {
    version: 1,
    generatedAt: cleanText(sourceRaw.generatedAt, 80) || new Date().toISOString(),
    source,
    summary: cleanText(sourceRaw.summary, 800),
    designProfileId: cleanText(sourceRaw.designProfileId, 120),
    categories: cleanList(sourceRaw.categories, 8, 80),
    archetypes,
  };
}

export function readFunnelExhibitArchetypePack(settingsJson: unknown, funnelId: string) {
  if (!funnelId || !isRecord(settingsJson)) return null;
  const raw = isRecord(settingsJson.funnelExhibitArchetypePacks) ? settingsJson.funnelExhibitArchetypePacks : null;
  const row = raw ? raw[funnelId] : null;
  return coerceFunnelExhibitArchetypePack(row);
}

export function writeFunnelExhibitArchetypePack(settingsJson: unknown, funnelId: string, pack: FunnelExhibitArchetypePack | null) {
  const base = cloneSettingsJson(settingsJson);
  const next = isRecord(base.funnelExhibitArchetypePacks) ? { ...(base.funnelExhibitArchetypePacks as Record<string, unknown>) } : {};
  if (!funnelId || !pack) delete next[funnelId];
  else next[funnelId] = pack;
  base.funnelExhibitArchetypePacks = next;
  return base;
}

export function selectRelevantFunnelExhibitArchetypes(
  pack: FunnelExhibitArchetypePack | null | undefined,
  input: {
    pageType?: string | null;
    prompt?: string | null;
    routeLabel?: string | null;
    pageTitle?: string | null;
  },
) {
  if (!pack?.archetypes?.length) return [] as FunnelExhibitArchetype[];
  const pageType = cleanText(input.pageType, 40).toLowerCase();
  const tokens = new Set(tokenize([input.prompt, input.routeLabel, input.pageTitle].filter(Boolean).join(" ")));

  return [...pack.archetypes]
    .map((archetype) => {
      let score = 0;
      if (pageType && archetype.pageTypes.includes(pageType as FunnelPageIntentType)) score += 8;
      for (const trigger of archetype.triggers) {
        const triggerTokens = tokenize(trigger);
        if (triggerTokens.length && triggerTokens.every((token) => tokens.has(token))) {
          score += 5;
          break;
        }
      }
      const labelTokens = tokenize(archetype.label);
      if (labelTokens.some((token) => tokens.has(token))) score += 2;
      return { archetype, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.archetype);
}

export function buildFunnelExhibitArchetypeBlock(
  pack: FunnelExhibitArchetypePack | null | undefined,
  input: {
    pageType?: string | null;
    prompt?: string | null;
    routeLabel?: string | null;
    pageTitle?: string | null;
  },
) {
  if (!pack) return "";
  const relevant = selectRelevantFunnelExhibitArchetypes(pack, input);
  if (!relevant.length) return "";

  const lines = [
    "STORED_EXHIBIT_ARCHETYPE_PACK:",
    pack.summary ? `- Pack summary: ${pack.summary}` : "",
    pack.designProfileId ? `- Design profile: ${pack.designProfileId}` : "",
    pack.categories.length ? `- Shared categories: ${pack.categories.join(", ")}` : "",
  ];

  for (const archetype of relevant) {
    lines.push(`- Relevant archetype: ${archetype.label}`);
    if (archetype.shellPosture) lines.push(`- ${archetype.label} shell posture: ${archetype.shellPosture}`);
    if (archetype.heroHierarchy.length) lines.push(`- ${archetype.label} hero hierarchy: ${archetype.heroHierarchy.join(" -> ")}`);
    if (archetype.sectionSequence.length) lines.push(`- ${archetype.label} section sequence: ${archetype.sectionSequence.join(" -> ")}`);
    if (archetype.proofStrategy) lines.push(`- ${archetype.label} proof strategy: ${archetype.proofStrategy}`);
    if (archetype.ctaCadence) lines.push(`- ${archetype.label} CTA cadence: ${archetype.ctaCadence}`);
    if (archetype.designTone) lines.push(`- ${archetype.label} design tone: ${archetype.designTone}`);
    if (archetype.antiPatterns.length) lines.push(`- ${archetype.label} avoid: ${archetype.antiPatterns.join(", ")}`);
  }

  return lines.filter(Boolean).join("\n");
}