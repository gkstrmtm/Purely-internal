type ExhibitAdvisoryInput = {
  requestPrompt: string;
  routeLabel?: string | null;
  funnelName?: string | null;
  pageTitle?: string | null;
  pageType?: string | null;
  pageGoal?: string | null;
  primaryCta?: string | null;
  audience?: string | null;
  offer?: string | null;
  conditionalLogic?: string | null;
  taggingPlan?: string | null;
  automationPlan?: string | null;
  shellFrameId?: string | null;
  shellFrameLabel?: string | null;
  shellFrameSummary?: string | null;
  shellConcept?: string | null;
  sectionPlan?: string | null;
  businessContext?: string | null;
  recentChatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  recentIterationMemory?: string[];
};

export type ExhibitDesignAdvisory = {
  guidance: string;
  categories: string[];
  designProfileId: string;
  usedRemote: boolean;
  source: "agent" | "library" | "local";
};

const EXHIBIT_LIBRARY_CACHE_TTL_MS = 1000 * 60 * 30;

let exhibitLibraryIndexCache:
  | {
      url: string;
      fetchedAt: number;
      text: string;
    }
  | null = null;

function cleanText(value: unknown, max = 600) {
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

function buildLocalFallbackGuidance(input: ExhibitAdvisoryInput): ExhibitDesignAdvisory | null {
  const frameLabel = cleanText(input.shellFrameLabel, 120);
  const frameSummary = cleanText(input.shellFrameSummary, 220);
  const shellConcept = cleanText(input.shellConcept, 320);
  const sectionPlan = cleanText(input.sectionPlan, 360);
  const pageType = cleanText(input.pageType, 80);
  const pageGoal = cleanText(input.pageGoal, 180);
  const primaryCta = cleanText(input.primaryCta, 120);
  const continuitySummary = buildContinuitySummary(input);
  const archetypeHints = inferArchetypeHints(input);
  if (!frameLabel && !shellConcept && !sectionPlan) return null;

  return {
    guidance: [
      frameLabel ? `Selected shell frame: ${frameLabel}.` : "",
      frameSummary ? `Frame posture: ${frameSummary}` : "",
      pageType ? `Treat this as a ${pageType} conversion surface.` : "",
      pageGoal ? `Keep the page centered on ${pageGoal}.` : "",
      primaryCta ? `Make '${primaryCta}' feel like the natural next move.` : "",
      shellConcept ? `Narrative shell: ${shellConcept}` : "",
      sectionPlan ? `Composition order: ${sectionPlan}` : "",
      archetypeHints.length ? `Relevant funnel archetypes: ${archetypeHints.join(", ")}.` : "",
      continuitySummary ? `Iteration continuity: ${continuitySummary}` : "",
      ...buildExhibitFoundationRuleLines(input),
      ...buildExhibitReferenceLines(input),
      "Design posture: elevated and intentional, with typography, hierarchy, proof placement, and CTA rhythm doing more work than decorative effects.",
      "Brand posture: use company colors as selective accents only; do not turn the whole page into a brand wash.",
    ].filter(Boolean).join("\n"),
    categories: ["Layout", "Cards", "Feedback", "Style Families", "Inputs"],
    designProfileId: "marketing-editorial",
    usedRemote: false,
    source: "local",
  };
}

function dedupeList(items: string[], maxItems = 8) {
  return Array.from(new Set(items.map((item) => cleanText(item, 120)).filter(Boolean))).slice(0, maxItems);
}

function parseLibraryCategories(raw: string) {
  return dedupeList(
    Array.from(raw.matchAll(/-\s+([A-Za-z][A-Za-z ]+?)\s+\(\d+\s+components?\)/g)).map((match) => match[1] || ""),
    12,
  );
}

function pickLibraryCategories(allCategories: string[], input: ExhibitAdvisoryInput) {
  const preferred = ["Layout", "Cards", "Feedback", "Inputs", "Style Families", "Pricing", "Navigation"];
  const pageType = cleanText(input.pageType, 80).toLowerCase();
  const pageSpecific =
    pageType === "booking"
      ? ["Inputs", "Feedback", "Layout", "Cards", "Style Families"]
      : pageType === "sales" || pageType === "checkout"
        ? ["Pricing", "Cards", "Layout", "Style Families", "Feedback"]
        : pageType === "lead-capture" || pageType === "application"
          ? ["Inputs", "Layout", "Cards", "Feedback", "Style Families"]
          : ["Layout", "Cards", "Feedback", "Inputs", "Style Families"];
  return dedupeList([
    ...pageSpecific.filter((item) => allCategories.includes(item)),
    ...preferred.filter((item) => allCategories.includes(item)),
  ], 6);
}

function buildLibraryIndexGuidance(input: ExhibitAdvisoryInput, rawLibraryIndex: string): ExhibitDesignAdvisory | null {
  if (!cleanText(rawLibraryIndex, 40)) return null;

  const allCategories = parseLibraryCategories(rawLibraryIndex);
  const categories = pickLibraryCategories(allCategories, input);
  const frameLabel = cleanText(input.shellFrameLabel, 120);
  const frameSummary = cleanText(input.shellFrameSummary, 220);
  const shellConcept = cleanText(input.shellConcept, 280);
  const pageGoal = cleanText(input.pageGoal, 180);
  const primaryCta = cleanText(input.primaryCta, 120);
  const continuitySummary = buildContinuitySummary(input);
  const archetypeHints = inferArchetypeHints(input);

  return {
    guidance: [
      "Exhibit library guidance: treat Exhibit as a design rulebook first, not a component dump.",
      "Fetch design foundations first and follow its typography, spacing, layout, elevation, density, and anti-pattern rules before making shell-level choices.",
      frameLabel ? `Map the output to the selected frame: ${frameLabel}.` : "",
      frameSummary ? `Frame posture: ${frameSummary}` : "",
      shellConcept ? `Shell emphasis: ${shellConcept}` : "",
      pageGoal ? `Keep the composition centered on ${pageGoal}.` : "",
      primaryCta ? `Build trust and pacing so '${primaryCta}' feels inevitable rather than abrupt.` : "",
      archetypeHints.length ? `Relevant funnel archetypes: ${archetypeHints.join(", ")}.` : "",
      continuitySummary ? `Iteration continuity: ${continuitySummary}` : "",
      categories.length ? `Useful Exhibit categories for this surface: ${categories.join(", ")}.` : "",
      ...buildExhibitFoundationRuleLines(input),
      ...buildExhibitReferenceLines(input),
      "Favor neutral foundations, deliberate hierarchy, and proof-led composition over decorative flourishes or brand-saturated surfaces.",
    ].filter(Boolean).join("\n"),
    categories,
    designProfileId: "marketing-editorial",
    usedRemote: true,
    source: "library",
  };
}

function buildExhibitFoundationRuleLines(input: ExhibitAdvisoryInput) {
  const pageType = cleanText(input.pageType, 80).toLowerCase();
  const primaryCta = cleanText(input.primaryCta, 120);
  const density = "comfortable";
  const lines = [
    "Exhibit foundation rules: use Space Grotesk for display and hero headings, Inter for all body copy and UI labels, and avoid default browser or system-ui typography.",
    "Exhibit foundation rules: keep the page on a 4px spacing grid with 24px mobile padding, 32px tablet padding, and 48px desktop padding; use 24-32px card padding for primary conversion surfaces.",
    "Exhibit foundation rules: use neutral backgrounds as the base, keep accent color mostly for interactive moments, and avoid more than three distinct background colors in one page section cluster.",
    "Exhibit foundation rules: keep reading columns constrained instead of letting copy span the full page width; use about 768px reading width inside a broader 1200px page frame.",
    `Exhibit foundation rules: use a ${density} density mode consistently for this surface instead of mixing dense admin spacing with roomy marketing spacing.`,
    "Exhibit foundation rules: most surfaces should stay flat or shadow-sm; use heavier elevation only for overlays or a clearly dominant focal surface.",
    primaryCta
      ? `Exhibit CTA rules: make '${primaryCta}' a solid primary action, never an outline-first CTA, and keep interactive labels at font-medium or stronger.`
      : "Exhibit CTA rules: keep the primary action solid and visually dominant; do not make an outline or ghost button the main ask.",
    "Exhibit input rules: every field needs a visible label, consistent height, and one shared border and radius system; do not rely on placeholder-only labeling.",
    "Exhibit anti-patterns: no raw rgba color wash on white surfaces, no fixed-height content containers that should grow with content, no deep nested wrappers with redundant padding, and no low-contrast muted text on muted backgrounds.",
  ];

  if (pageType === "booking" || pageType === "application" || pageType === "lead-capture") {
    lines.push("Exhibit form-flow rules: use one primary reading path through the conversion section, keep fields or booking steps in a narrow readable column, and avoid splitting the decision path across equal-weight columns.");
  }

  if (pageType === "sales" || pageType === "checkout") {
    lines.push("Exhibit commerce rules: use proof, pricing, and CTA surfaces with clear containment and scan order; do not let decorative cards compete with the purchase path.");
  }

  return lines;
}

function buildExhibitReferenceLines(input: ExhibitAdvisoryInput) {
  const pageType = cleanText(input.pageType, 80).toLowerCase();
  const referenceSlugs =
    pageType === "booking"
      ? ["typographic-hero", "hero-cta-buttons", "testimonial-card", "swiss-inputs", "inline-validation-patterns"]
      : pageType === "lead-capture" || pageType === "application"
        ? ["typographic-hero", "hero-cta-buttons", "swiss-inputs", "testimonial-card", "stepper-onboarding-flow"]
        : pageType === "sales" || pageType === "checkout"
          ? ["typographic-hero", "hero-cta-buttons", "testimonial-card", "pricing-comparison-grid", "checkout-summary-card"]
          : ["typographic-hero", "hero-cta-buttons", "testimonial-card", "design-token-reference"];

  return [
    `Exhibit reference anchors: ${referenceSlugs.join(", ")}. Use them as visual and structural anchors, not as a license to copy app-shell UI into a funnel page.`,
  ];
}

function collectObjectStrings(value: unknown, maxItems = 10) {
  if (!value || typeof value !== "object") return [] as string[];
  const entries = Object.entries(value as Record<string, unknown>);
  const out: string[] = [];
  for (const [key, raw] of entries) {
    if (typeof raw === "string") {
      const next = `${key}: ${cleanText(raw, 220)}`;
      if (next && !out.includes(next)) out.push(next);
    }
    if (Array.isArray(raw)) {
      for (const item of cleanList(raw, 4, 120)) {
        const next = `${key}: ${item}`;
        if (!out.includes(next)) out.push(next);
      }
    }
    if (out.length >= maxItems) break;
  }
  return out.slice(0, maxItems);
}

function cleanHistory(value: unknown, maxItems = 5, maxLen = 180) {
  if (!Array.isArray(value)) return [] as Array<{ role: "user" | "assistant"; content: string }>;
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
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

function buildContinuitySummary(input: ExhibitAdvisoryInput) {
  const notes = cleanList(input.recentIterationMemory, 4, 180);
  const history = cleanHistory(input.recentChatHistory, 4, 180);
  const parts = [
    ...notes.map((note) => `note: ${note}`),
    ...history.slice(-2).map((entry) => `${entry.role}: ${entry.content}`),
  ];
  return parts.join(" | ");
}

function inferArchetypeHints(input: ExhibitAdvisoryInput) {
  const haystack = [
    cleanText(input.requestPrompt, 800),
    cleanText(input.pageType, 80),
    cleanText(input.pageGoal, 220),
    cleanText(input.routeLabel, 120),
    cleanText(input.pageTitle, 120),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hints: string[] = [];
  if (/\bvsl\b|video sales letter|sales video|hero video|video-led/.test(haystack)) hints.push("VSL-first shell");
  if (/booking confirmation|confirmation page|thank you|thank-you/.test(haystack)) hints.push("post-booking confirmation page");
  if (/\bbooking\b|schedule|consultation|book a call/.test(haystack)) hints.push("booking-first consult page");
  if (/\bwebinar\b/.test(haystack)) hints.push("webinar registration flow");
  if (/application|qualif/.test(haystack)) hints.push("application or qualification step");
  return dedupeList(hints, 4);
}

function parseExhibitResponse(raw: unknown): ExhibitDesignAdvisory | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const designProfile = rec.designProfile && typeof rec.designProfile === "object" ? (rec.designProfile as Record<string, unknown>) : null;
  const classification = rec.classification && typeof rec.classification === "object" ? (rec.classification as Record<string, unknown>) : null;
  const resourcePull = rec.resourcePull && typeof rec.resourcePull === "object" ? (rec.resourcePull as Record<string, unknown>) : null;
  const compositionPlan = Array.isArray(rec.compositionPlan) ? rec.compositionPlan : Array.isArray(resourcePull?.compositionPlan) ? (resourcePull?.compositionPlan as unknown[]) : [];
  const nextQuestions = cleanList(rec.nextQuestions, 3, 180);

  const categories = Array.from(
    new Set<string>([
      ...cleanList(resourcePull?.categories, 6, 80),
      ...cleanList((resourcePull as any)?.componentCategories, 6, 80),
    ]),
  ).slice(0, 6);

  const guidanceParts = [
    ...collectObjectStrings(classification, 4),
    ...collectObjectStrings(designProfile, 6),
    ...collectObjectStrings(resourcePull, 8),
    ...compositionPlan
      .map((item) => collectObjectStrings(item, 3).join("; "))
      .filter(Boolean)
      .slice(0, 4),
    ...nextQuestions.map((item) => `nextQuestion: ${item}`),
  ]
    .map((item) => cleanText(item, 260))
    .filter(Boolean);

  const guidance = Array.from(new Set(guidanceParts)).slice(0, 12).join("\n");
  if (!guidance) return null;

  return {
    guidance,
    categories,
    designProfileId: cleanText(designProfile?.id, 80) || cleanText((classification as any)?.designProfileId, 80) || "",
    usedRemote: true,
    source: "agent",
  };
}

async function fetchLibraryIndex(url: string, timeoutMs: number) {
  if (
    exhibitLibraryIndexCache &&
    exhibitLibraryIndexCache.url === url &&
    Date.now() - exhibitLibraryIndexCache.fetchedAt < EXHIBIT_LIBRARY_CACHE_TTL_MS
  ) {
    return exhibitLibraryIndexCache.text;
  }

  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const text = cleanText(await res.text().catch(() => ""), 12000);
  if (!text) return null;
  exhibitLibraryIndexCache = {
    url,
    fetchedAt: Date.now(),
    text,
  };
  return text;
}

export async function getExhibitDesignAdvisory(input: ExhibitAdvisoryInput): Promise<ExhibitDesignAdvisory | null> {
  const apiKey = cleanText(process.env.EXHIBIT_AGENT_API_KEY, 400);
  const enabled = process.env.EXHIBIT_AGENT_ENABLED === "1" || Boolean(apiKey);
  const agentUrl = cleanText(process.env.EXHIBIT_AGENT_URL, 400) || "https://exhibit-beta.vercel.app/api/agent";
  const libraryUrl = cleanText(process.env.EXHIBIT_LIBRARY_INDEX_URL, 400) || "https://exhibit-beta.vercel.app/llms.txt";
  const timeoutMsRaw = Number(process.env.EXHIBIT_AGENT_TIMEOUT_MS || 3500);
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(800, Math.min(5000, timeoutMsRaw)) : 2500;
  const libraryTimeoutMs = Math.max(600, Math.min(2200, Math.round(timeoutMs * 0.6)));
  const localFallback = buildLocalFallbackGuidance(input);
  const continuitySummary = buildContinuitySummary(input);
  const recentHistory = cleanHistory(input.recentChatHistory, 4, 180);
  const recentIterationMemory = cleanList(input.recentIterationMemory, 4, 180);
  const archetypeHints = inferArchetypeHints(input);

  if (!enabled) return localFallback;

  try {
    const body = {
      question: [
        `This is a conversion funnel page for ${cleanText(input.pageTitle, 120) || "a funnel page"}.`,
        input.pageType ? `It is a ${cleanText(input.pageType, 80)} surface.` : "",
        input.pageGoal ? `Its job is to ${cleanText(input.pageGoal, 180)}.` : "",
        input.primaryCta ? `The primary action is '${cleanText(input.primaryCta, 120)}'.` : "",
        input.conditionalLogic ? `Logic rules: ${cleanText(input.conditionalLogic, 220)}.` : "",
        input.taggingPlan ? `Tagging plan: ${cleanText(input.taggingPlan, 180)}.` : "",
        input.automationPlan ? `Automation handoff: ${cleanText(input.automationPlan, 220)}.` : "",
        continuitySummary ? `Recent iteration context: ${continuitySummary}.` : "",
        archetypeHints.length ? `Relevant funnel archetypes: ${archetypeHints.join(", ")}.` : "",
        "Recommend an elevated shell posture, composition priorities, and design emphasis for first-draft generation that stays aware of the iteration thread.",
      ].filter(Boolean).join(" "),
      goal:
        "Advisory guidance for funnel HTML generation. Prioritize elevated design, conversion clarity, calm brand usage, continuity across recent turns, and a first draft strong enough to iterate.",
      routeHint: "conversion-funnel",
      platform: "nextjs-tailwind-html",
      agentContextSummary: [
        input.shellFrameLabel ? `Frame: ${cleanText(input.shellFrameLabel, 120)}` : "",
        input.shellFrameSummary ? `Frame posture: ${cleanText(input.shellFrameSummary, 220)}` : "",
        input.shellConcept ? `Shell concept: ${cleanText(input.shellConcept, 260)}` : "",
        input.sectionPlan ? `Section plan: ${cleanText(input.sectionPlan, 320)}` : "",
        input.conditionalLogic ? `Logic: ${cleanText(input.conditionalLogic, 220)}` : "",
        input.automationPlan ? `Automation: ${cleanText(input.automationPlan, 220)}` : "",
        archetypeHints.length ? `Archetypes: ${archetypeHints.join(", ")}` : "",
        continuitySummary ? `Continuity: ${continuitySummary}` : "",
      ].filter(Boolean).join(" | "),
      context: {
        funnelName: cleanText(input.funnelName, 120),
        pageTitle: cleanText(input.pageTitle, 120),
        routeLabel: cleanText(input.routeLabel, 120),
        pageType: cleanText(input.pageType, 80),
        pageGoal: cleanText(input.pageGoal, 180),
        audience: cleanText(input.audience, 160),
        offer: cleanText(input.offer, 160),
        conditionalLogic: cleanText(input.conditionalLogic, 240),
        taggingPlan: cleanText(input.taggingPlan, 200),
        automationPlan: cleanText(input.automationPlan, 240),
        primaryCta: cleanText(input.primaryCta, 120),
        shellFrameId: cleanText(input.shellFrameId, 80),
        shellFrameLabel: cleanText(input.shellFrameLabel, 120),
        shellFrameSummary: cleanText(input.shellFrameSummary, 220),
        requestPrompt: cleanText(input.requestPrompt, 500),
        businessContext: cleanText(input.businessContext, 500),
        recentIterationMemory,
        recentHistory: recentHistory.map((entry) => `${entry.role}: ${entry.content}`),
        archetypeHints,
      },
    };

    const res = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey
          ? {
              authorization: `Bearer ${apiKey}`,
              "x-api-key": apiKey,
            }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const libraryIndex = await fetchLibraryIndex(libraryUrl, libraryTimeoutMs).catch(() => null);
      return buildLibraryIndexGuidance(input, libraryIndex || "") || localFallback;
    }
    const json = (await res.json().catch(() => null)) as unknown;
    return parseExhibitResponse(json) || localFallback;
  } catch {
    const libraryIndex = await fetchLibraryIndex(libraryUrl, libraryTimeoutMs).catch(() => null);
    return buildLibraryIndexGuidance(input, libraryIndex || "") || localFallback;
  }
}