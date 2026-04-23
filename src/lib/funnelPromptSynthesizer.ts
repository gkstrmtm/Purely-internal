import { generateText } from "@/lib/ai";
import { getExhibitDesignAdvisory } from "@/lib/exhibitDesignAdvisor.server";
import { buildFunnelFoundationOverview, type FunnelBriefProfile, type FunnelPageIntentProfile } from "@/lib/funnelPageIntent";

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
  contextKeys?: string[];
  contextMedia?: SynthesisMediaRef[];
  recentChatHistory?: SynthesisHistoryEntry[];
  recentIterationMemory?: string[];
};

export type FunnelPromptSynthesisResult = {
  prompt: string;
  usedAi: boolean;
  exhibitAdvisory: NonNullable<Awaited<ReturnType<typeof getExhibitDesignAdvisory>>> | null;
};

type FallbackPromptOptions = {
  exhibitAdvisory?: Awaited<ReturnType<typeof getExhibitDesignAdvisory>> | null;
};

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
    options.exhibitAdvisory?.source ? `Exhibit advisory source: ${options.exhibitAdvisory.source}.` : "",
    options.exhibitAdvisory?.designProfileId ? `Exhibit design profile: ${options.exhibitAdvisory.designProfileId}.` : "",
    options.exhibitAdvisory?.categories.length ? `Exhibit categories: ${options.exhibitAdvisory.categories.join(", ")}.` : "",
    options.exhibitAdvisory?.guidance ? `Exhibit guidance: ${options.exhibitAdvisory.guidance}` : "",
    continuity.recentIterationMemory.length ? `Recent iteration memory: ${continuity.recentIterationMemory.join(" ")}` : "",
    continuity.historySummary ? `Recent thread continuity: ${continuity.historySummary}` : "",
    continuity.lastUserDirection ? `Newest unresolved user direction: ${continuity.lastUserDirection}` : "",
    continuity.lastAssistantMove ? `Most recent assistant move: ${continuity.lastAssistantMove}` : "",
    `Recommended conversion path: ${foundation.conversionPath}`,
    regionLabel ? `Focus this on ${regionLabel}${regionSummary ? ` (${regionSummary})` : ""}.` : "",
    contextKeys.length ? `Prefer these context elements when relevant: ${contextKeys.join(", ")}.` : "",
    mediaNames.length ? `Use these available assets when helpful: ${mediaNames.join(", ")}.` : "",
    compactParagraph(input.businessContext, 1200) ? `Business context: ${compactParagraph(input.businessContext, 1200)}` : "",
    requestInterpretationBlock,
    bookingDirective,
    surfaceInstruction,
    "Continuity rule: if the latest turns imply something was still missing or insufficient last time, correct that gap directly instead of drifting into a parallel redesign.",
    "Turn the fragmented steering into one coherent, impactful direction. Do not wait for every missing detail; make strong reasonable assumptions the user can refine later.",
    "Aim for an elevated first draft with intentional hierarchy, proof placement, restrained brand use, and a shell strong enough to iterate from.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function synthesizeFunnelGenerationPrompt(input: FunnelPromptSynthesisInput): Promise<FunnelPromptSynthesisResult> {
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

  if (!requestPrompt && !intent && !brief) {
    return { prompt: fallbackPrompt(input), usedAi: false, exhibitAdvisory: null };
  }

  const exhibitAdvisory = await getExhibitDesignAdvisory({
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

  const fallback = fallbackPrompt(input, { exhibitAdvisory });

  if (!shouldUseAiPromptSynthesis(input)) {
    return { prompt: fallback, usedAi: false, exhibitAdvisory };
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
    "If pricing, packaging, proof, or offer specifics are still incomplete, do not stall. Frame the best workable assumption so generation can move forward and the user can refine later.",
    "Keep the prompt concise enough for another model to act on, but rich enough to shape tone, hierarchy, proof, and conversion logic.",
    "The output must feel design-led, not questionnaire-led. Favor strong shells, persuasive sequencing, and visual intention over generic page-builder filler.",
    "Use stored brand colors calmly and selectively. Treat them as accent inputs, not permission to flood the page with brand color.",
    "Never echo or quote the user's phrasing back verbatim in the final prompt.",
    "Abstract the request into clean directive language and do not reuse long phrases from the raw request unless they are exact content that must survive unchanged, such as a CTA label, product name, brand name, or legal wording.",
  ].join("\n");

  const user = [
    `SURFACE: ${input.surface === "page-html" ? "Whole-page hosted funnel generation" : "Custom code block generation"}`,
    `CURRENT_STATE: ${hasCurrent ? "Editing existing implementation" : "Creating first implementation"}`,
    regionLabel ? `FOCUS_REGION: ${regionLabel}${regionSummary ? ` — ${regionSummary}` : ""}` : "",
    `ROUTE: ${routeLabel}`,
    `FUNNEL: ${funnelName}`,
    `PAGE: ${pageTitle}`,
    requestPrompt ? `USER_REQUEST_TO_INTERPRET:\n${requestPrompt}` : "",
    compactParagraph(input.businessContext, 1600) ? `BUSINESS_CONTEXT:\n${compactParagraph(input.businessContext, 1600)}` : "",
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
    const raw = await generateText({ system, user, temperature: 0.35 });
    const parsedPrompt = parseJsonPrompt(raw);
    if (!parsedPrompt) return { prompt: fallback, usedAi: false, exhibitAdvisory };
    return { prompt: parsedPrompt, usedAi: true, exhibitAdvisory };
  } catch {
    return { prompt: fallback, usedAi: false, exhibitAdvisory };
  }
}