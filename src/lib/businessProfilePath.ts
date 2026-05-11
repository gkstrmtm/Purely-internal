export const BUSINESS_PROFILE_PATH_STAGES = [
  {
    key: "businessBasics",
    label: "Identity",
    description: "Company identity and operating setup.",
    questions: [
      "What should the business be called everywhere in the platform?",
      "What site or domain should downstream work reference?",
      "Which industry and operating model best describe how this business sells?",
    ],
  },
  {
    key: "offerPricing",
    label: "Offer",
    description: "What the business sells, how it is priced, and why it matters.",
    questions: [
      "What is the main offer or service you want pages and AI to lead with?",
      "What does it usually cost or how should pricing be framed?",
      "What outcome or transformation should the offer be tied to?",
    ],
  },
  {
    key: "audience",
    label: "Audience",
    description: "Who buys, what triggers them, and what they care about.",
    questions: [
      "Who is the best-fit buyer or client for this business?",
      "What usually pushes them to act now instead of later?",
      "What pain point or desired outcome matters most to them?",
    ],
  },
  {
    key: "proof",
    label: "Proof",
    description: "Results, testimonials, credibility, and trust cues.",
    questions: [
      "What proof should be reused most often: testimonial, result, credential, or case study?",
      "What claim or result is strong enough to anchor trust?",
      "What supporting trust cue belongs near the offer?",
    ],
  },
  {
    key: "voicePositioning",
    label: "Voice",
    description: "Tone, positioning, and how the business should sound.",
    questions: [
      "How should the business sound in copy and follow-up?",
      "What positioning angle should make this business feel distinct?",
      "What kind of phrasing would feel off-brand or too generic?",
    ],
  },
  {
    key: "ctaSalesFlow",
    label: "Conversion",
    description: "The next step, booking path, and conversion handoff.",
    questions: [
      "What primary CTA should pages push most often?",
      "What happens after someone opts in or books?",
      "How should sales handoff or follow-up be described?",
    ],
  },
  {
    key: "guardrails",
    label: "Guardrails",
    description: "What to avoid saying, service area, and limits.",
    questions: [
      "What should Pura avoid promising or implying?",
      "What service area, audience, or compliance limits apply?",
      "What operational notes should keep downstream AI honest?",
    ],
  },
] as const;

export type BusinessProfilePathStageKey = (typeof BUSINESS_PROFILE_PATH_STAGES)[number]["key"];

export type BusinessProfilePathStage = {
  key: BusinessProfilePathStageKey;
  label: string;
  description: string;
  questions: readonly string[];
};

export const BUSINESS_PROFILE_STAGE_KEYS = BUSINESS_PROFILE_PATH_STAGES.map((stage) => stage.key);

export const BUSINESS_PROFILE_PATH_STAGE_BY_KEY = Object.fromEntries(
  BUSINESS_PROFILE_PATH_STAGES.map((stage) => [stage.key, stage]),
) as Record<BusinessProfilePathStageKey, (typeof BUSINESS_PROFILE_PATH_STAGES)[number]>;

export const BUSINESS_PROFILE_SUGGESTED_FIELDS = [
  "businessName",
  "websiteUrl",
  "industry",
  "businessModel",
  "primaryGoals",
  "targetCustomer",
  "brandVoice",
  "businessContext",
] as const;

export type BusinessProfileSuggestedFieldKey = (typeof BUSINESS_PROFILE_SUGGESTED_FIELDS)[number];

export const BUSINESS_PROFILE_FIELD_LABELS: Record<BusinessProfileSuggestedFieldKey, string> = {
  businessName: "Business name",
  websiteUrl: "Website",
  industry: "Industry",
  businessModel: "Business model",
  primaryGoals: "Primary goals",
  targetCustomer: "Target customer",
  brandVoice: "Brand voice",
  businessContext: "Business context",
};

export type BusinessProfileBriefFieldSuggestion = {
  field: BusinessProfileSuggestedFieldKey;
  label: string;
  value: string | string[];
  rationale?: string;
  sourceSnippet?: string;
};

export type BusinessProfileBriefStageSuggestion = {
  key: BusinessProfilePathStageKey;
  label: string;
  summary?: string;
  suggestions: BusinessProfileBriefFieldSuggestion[];
};

export type BusinessProfileBriefing = {
  sourceName?: string;
  sourceType?: string;
  sourceSignature?: string;
  uploadedAt: string;
  generatedAt: string;
  summary: string;
  stages: BusinessProfileBriefStageSuggestion[];
};

export type BusinessProfileGuidedIntake = Partial<Record<BusinessProfilePathStageKey, string[]>>;

export type BusinessProfilePathStageProgress = {
  key: BusinessProfilePathStageKey;
  label: string;
  description: string;
  complete: boolean;
  signalCount: number;
  signalTotal: number;
};

export function isBusinessProfilePathStageKey(value: unknown): value is BusinessProfilePathStageKey {
  return typeof value === "string" && (BUSINESS_PROFILE_STAGE_KEYS as readonly string[]).includes(value);
}

export function isBusinessProfileSuggestedFieldKey(value: unknown): value is BusinessProfileSuggestedFieldKey {
  return typeof value === "string" && (BUSINESS_PROFILE_SUGGESTED_FIELDS as readonly string[]).includes(value);
}

export function buildBusinessProfilePathProgress(input: {
  hasBusinessName?: boolean;
  hasWebsiteUrl?: boolean;
  hasIndustry?: boolean;
  hasBusinessModel?: boolean;
  signals?: Partial<{
    offer: boolean;
    audience: boolean;
    painPoints: boolean;
    pricing: boolean;
    serviceArea: boolean;
    proof: boolean;
    tone: boolean;
    brandAssets: boolean;
    ctaPreference: boolean;
    salesProcess: boolean;
    avoidClaims: boolean;
  }>;
}): BusinessProfilePathStageProgress[] {
  const checks: Array<{ key: BusinessProfilePathStageKey; values: boolean[] }> = [
    {
      key: "businessBasics",
      values: [Boolean(input.hasBusinessName), Boolean(input.hasWebsiteUrl), Boolean(input.hasIndustry), Boolean(input.hasBusinessModel)],
    },
    {
      key: "offerPricing",
      values: [Boolean(input.signals?.offer), Boolean(input.signals?.pricing)],
    },
    {
      key: "audience",
      values: [Boolean(input.signals?.audience), Boolean(input.signals?.painPoints)],
    },
    {
      key: "proof",
      values: [Boolean(input.signals?.proof)],
    },
    {
      key: "voicePositioning",
      values: [Boolean(input.signals?.tone)],
    },
    {
      key: "ctaSalesFlow",
      values: [Boolean(input.signals?.ctaPreference), Boolean(input.signals?.salesProcess)],
    },
    {
      key: "guardrails",
      values: [Boolean(input.signals?.avoidClaims), Boolean(input.signals?.serviceArea), Boolean(input.signals?.brandAssets)],
    },
  ];

  return checks.map((check) => {
    const stage = BUSINESS_PROFILE_PATH_STAGE_BY_KEY[check.key];
    const signalCount = check.values.filter(Boolean).length;
    return {
      key: check.key,
      label: stage.label,
      description: stage.description,
      complete: signalCount >= check.values.length,
      signalCount,
      signalTotal: check.values.length,
    };
  });
}

function cleanGuidedAnswer(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, 1200);
}

function formatSuggestionValue(value: string | string[]) {
  return Array.isArray(value) ? value.join("; ") : value;
}

function splitContextParagraphs(value: string | undefined) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((part) => cleanGuidedAnswer(part))
    .filter(Boolean);
}

function stripLeadingContextLabel(value: string | undefined) {
  return cleanGuidedAnswer(String(value || "").replace(/^[A-Za-z][A-Za-z /-]{1,40}:\s*/, ""));
}

function buildSalesHandoffFromProcess(value: string | undefined) {
  const process = stripLeadingContextLabel(value);
  if (!process) return "";
  const steps = process.split(/\s*,\s*/).map((step) => cleanGuidedAnswer(step)).filter(Boolean);
  if (steps.length >= 2) {
    return cleanGuidedAnswer(`After qualification, move into ${steps.slice(-2).join(", ")}.`);
  }
  return cleanGuidedAnswer(`After qualification, move into ${process}.`);
}

type BriefingSuggestionPool = {
  byField: Map<BusinessProfileSuggestedFieldKey, string[]>;
  stageFallbackByKey: Map<BusinessProfilePathStageKey, string>;
  globalSummary: string;
};

function firstPoolValue(
  pool: BriefingSuggestionPool,
  field: BusinessProfileSuggestedFieldKey,
  index = 0,
) {
  const values = pool.byField.get(field) ?? [];
  return cleanGuidedAnswer(values[index] || values[0] || "");
}

function buildStageFallbackText(stage: BusinessProfileBriefStageSuggestion) {
  return [
    stage.summary || "",
    ...stage.suggestions.map((suggestion) => {
      const value = cleanGuidedAnswer(formatSuggestionValue(suggestion.value));
      return value ? `${suggestion.label}: ${value}` : "";
    }),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function collectBriefingSuggestionPool(
  briefing: BusinessProfileBriefing | null | undefined,
): BriefingSuggestionPool {
  const byField = new Map<BusinessProfileSuggestedFieldKey, string[]>();
  const stageFallbackByKey = new Map<BusinessProfilePathStageKey, string>();
  const globalSummary = cleanGuidedAnswer(briefing?.summary || "");

  for (const stage of briefing?.stages || []) {
    if (!isBusinessProfilePathStageKey(stage.key)) continue;
    const stageFallback = cleanGuidedAnswer(buildStageFallbackText(stage));
    if (stageFallback) {
      stageFallbackByKey.set(stage.key, stageFallback);
    }

    for (const suggestion of stage.suggestions) {
      const value = cleanGuidedAnswer(formatSuggestionValue(suggestion.value));
      if (!value) continue;
      const current = byField.get(suggestion.field) ?? [];
      if (!current.includes(value)) current.push(value);
      byField.set(suggestion.field, current.slice(0, 6));
    }
  }

  return { byField, stageFallbackByKey, globalSummary };
}

function pickFirst(values: Array<string | undefined | null>) {
  for (const value of values) {
    const next = cleanGuidedAnswer(String(value || ""));
    if (next) return next;
  }
  return "";
}

function pickFieldValue(
  pool: BriefingSuggestionPool,
  fields: BusinessProfileSuggestedFieldKey[],
  index = 0,
) {
  for (const field of fields) {
    const values = pool.byField.get(field) ?? [];
    const next = cleanGuidedAnswer(values[index] || values[0] || "");
    if (next) return next;
  }
  return "";
}

function buildStageSynthesisByQuestion(
  stageKey: BusinessProfilePathStageKey,
  pool: BriefingSuggestionPool,
) {
  const offer = firstPoolValue(pool, "businessContext", 0);
  const audience = firstPoolValue(pool, "targetCustomer", 0);
  const voice = firstPoolValue(pool, "brandVoice", 0);
  const goals = firstPoolValue(pool, "primaryGoals", 0);
  const model = [firstPoolValue(pool, "industry"), firstPoolValue(pool, "businessModel")]
    .filter(Boolean)
    .join("; ");

  if (stageKey === "offerPricing") {
    return [
      cleanGuidedAnswer(offer ? `Primary offer focus: ${offer}` : ""),
      cleanGuidedAnswer(goals ? `Price framing should support these goals: ${goals}` : ""),
      cleanGuidedAnswer(audience ? `Tie outcomes to this buyer profile: ${audience}` : ""),
    ];
  }

  if (stageKey === "audience") {
    return [
      cleanGuidedAnswer(audience ? `Best-fit audience: ${audience}` : ""),
      cleanGuidedAnswer(goals ? `Primary action triggers should align with: ${goals}` : ""),
      cleanGuidedAnswer(offer ? `Pain points should connect directly to this offer context: ${offer}` : ""),
    ];
  }

  if (stageKey === "proof") {
    return [
      cleanGuidedAnswer(offer ? `Proof should reinforce this core promise: ${offer}` : ""),
      cleanGuidedAnswer(goals ? `Anchor evidence around these promised outcomes: ${goals}` : ""),
      cleanGuidedAnswer(audience ? `Trust cues should match what this audience already values: ${audience}` : ""),
    ];
  }

  if (stageKey === "voicePositioning") {
    return [
      cleanGuidedAnswer(voice ? `Core tone direction: ${voice}` : ""),
      cleanGuidedAnswer(offer ? `Positioning angle should stay tied to this value proposition: ${offer}` : ""),
      cleanGuidedAnswer(audience ? `Avoid generic language and keep phrasing specific to this audience: ${audience}` : ""),
    ];
  }

  if (stageKey === "ctaSalesFlow") {
    return [
      cleanGuidedAnswer(goals ? `Primary CTA should push toward this business goal: ${goals}` : ""),
      cleanGuidedAnswer(offer ? `Post-opt-in handoff should continue this offer narrative: ${offer}` : ""),
      cleanGuidedAnswer(audience ? `Follow-up messaging should match the urgency profile of this audience: ${audience}` : ""),
    ];
  }

  if (stageKey === "guardrails") {
    return [
      cleanGuidedAnswer(voice ? `Language guardrails should preserve this voice: ${voice}` : ""),
      cleanGuidedAnswer(model ? `Compliance and market limits should reflect this operating model: ${model}` : ""),
      cleanGuidedAnswer(audience ? `Avoid claims that are too broad for this audience context: ${audience}` : ""),
    ];
  }

  return [
    cleanGuidedAnswer(model ? `Identity setup should stay consistent with: ${model}` : ""),
    cleanGuidedAnswer(firstPoolValue(pool, "websiteUrl") ? `Reference domain context: ${firstPoolValue(pool, "websiteUrl")}` : ""),
    cleanGuidedAnswer(firstPoolValue(pool, "businessName") ? `Canonical business naming: ${firstPoolValue(pool, "businessName")}` : ""),
  ];
}

function dedupeAnswers(answers: string[], fallback: string) {
  const used = new Set<string>();
  const finalAnswers: string[] = [];
  for (const answer of answers) {
    const clean = cleanGuidedAnswer(answer);
    if (!clean || used.has(clean)) {
      const nextFallback = cleanGuidedAnswer(fallback);
      if (nextFallback && !used.has(nextFallback)) {
        used.add(nextFallback);
        finalAnswers.push(nextFallback);
        continue;
      }
      finalAnswers.push(clean || nextFallback || "");
      continue;
    }
    used.add(clean);
    finalAnswers.push(clean);
  }
  return finalAnswers;
}

function looksLikeRawBriefDump(value: string) {
  const clean = cleanGuidedAnswer(value);
  if (!clean) return false;
  const labeledFieldMatches = clean.match(
    /(Business name:|Website:|Industry:|Business model:|Primary goals:|Target customer:|Brand voice:|Offer details:|Pricing:|Outcome:|Pain points:|Proof:|CTA preference:|Sales process:|Guardrails:|Operational notes:)/gi,
  );
  return Boolean((labeledFieldMatches?.length || 0) >= 2 || (clean.length > 420 && clean.includes(":")));
}

function ensureUniqueQuestionAnswers(
  questions: readonly string[],
  answers: string[],
  fallback: string,
  synthesizedByQuestion: readonly string[],
) {
  const used = new Set<string>();
  const out: string[] = [];

  for (let index = 0; index < questions.length; index += 1) {
    const base = cleanGuidedAnswer(answers[index] || "");
    const synth = cleanGuidedAnswer(synthesizedByQuestion[index] || "");
    const stageFallback = cleanGuidedAnswer(fallback || "");
    const safeBase = looksLikeRawBriefDump(base) ? "" : base;
    const safeFallback = looksLikeRawBriefDump(stageFallback) ? "" : stageFallback;

    const candidates = [
      safeBase,
      synth,
      safeFallback,
    ];

    let chosen = "";
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (!used.has(candidate)) {
        chosen = candidate;
        break;
      }
    }

    if (!chosen) {
      chosen = cleanGuidedAnswer(safeBase || synth || safeFallback);
    }

    if (chosen) used.add(chosen);
    out.push(chosen);
  }

  return out;
}

function buildGuidedAnswersForStage(
  stage: BusinessProfilePathStage,
  extractedStage: BusinessProfileBriefStageSuggestion | null,
  pool: BriefingSuggestionPool,
) {
  const suggestionText = new Map<BusinessProfileSuggestedFieldKey, string>();
  for (const suggestion of extractedStage?.suggestions || []) {
    if (suggestionText.has(suggestion.field)) continue;
    const value = cleanGuidedAnswer(formatSuggestionValue(suggestion.value));
    if (value) suggestionText.set(suggestion.field, value);
  }

  const fallback = pickFirst([
    extractedStage ? buildStageFallbackText(extractedStage) : "",
    pool.stageFallbackByKey.get(stage.key),
    pool.globalSummary,
  ]);
  const synthesizedByQuestion = buildStageSynthesisByQuestion(stage.key, pool);
  const industryAndModel = [suggestionText.get("industry"), suggestionText.get("businessModel")].filter(Boolean).join("; ");
  const directStageSummary = cleanGuidedAnswer(extractedStage?.summary || "");
  const stageContext = splitContextParagraphs(suggestionText.get("businessContext"));

  if (stage.key === "businessBasics") {
    return ensureUniqueQuestionAnswers(stage.questions, dedupeAnswers([
      pickFirst([
        suggestionText.get("businessName"),
        directStageSummary,
        fallback,
      ]),
      pickFirst([
        suggestionText.get("websiteUrl"),
        pickFieldValue(pool, ["websiteUrl"]),
        directStageSummary,
      ]),
      pickFirst([
        industryAndModel,
        pickFieldValue(pool, ["industry", "businessModel"]),
        fallback,
      ]),
    ], fallback), fallback, synthesizedByQuestion);
  }

  if (stage.key === "offerPricing") {
    return ensureUniqueQuestionAnswers(stage.questions, dedupeAnswers([
      pickFirst([
        stageContext[0],
        suggestionText.get("businessContext"),
        pickFieldValue(pool, ["businessContext"]),
        directStageSummary,
        fallback,
      ]),
      pickFirst([
        stageContext.find((part) => /^pricing:/i.test(part)) || "",
        suggestionText.get("primaryGoals"),
        pickFieldValue(pool, ["primaryGoals", "businessContext"], 1),
        directStageSummary,
        fallback,
      ]),
      pickFirst([
        stageContext.find((part) => /^outcome:/i.test(part)) || "",
        suggestionText.get("primaryGoals"),
        directStageSummary,
        fallback,
      ]),
    ], fallback), fallback, synthesizedByQuestion);
  }

  if (stage.key === "audience") {
    return ensureUniqueQuestionAnswers(stage.questions, dedupeAnswers([
      pickFirst([
        suggestionText.get("targetCustomer"),
        pickFieldValue(pool, ["targetCustomer"]),
        directStageSummary,
      ]),
      pickFirst([
        pickFieldValue(pool, ["businessContext", "targetCustomer"], 1),
        directStageSummary,
        fallback,
      ]),
      pickFirst([
        pickFieldValue(pool, ["businessContext", "primaryGoals"], 2),
        fallback,
      ]),
    ], fallback), fallback, synthesizedByQuestion);
  }

  if (stage.key === "proof") {
    return ensureUniqueQuestionAnswers(stage.questions, dedupeAnswers([
      pickFirst([
        stageContext[0],
        suggestionText.get("businessContext"),
        directStageSummary,
      ]),
      pickFirst([
        stageContext[0],
        pickFieldValue(pool, ["businessContext", "primaryGoals"], 2),
        directStageSummary,
        fallback,
      ]),
      pickFirst([
        stageContext[0],
        pickFieldValue(pool, ["businessContext"], 3),
        fallback,
      ]),
    ], fallback), fallback, synthesizedByQuestion);
  }

  if (stage.key === "voicePositioning") {
    return ensureUniqueQuestionAnswers(stage.questions, dedupeAnswers([
      pickFirst([
        suggestionText.get("brandVoice"),
        pickFieldValue(pool, ["brandVoice"]),
        directStageSummary,
      ]),
      pickFirst([
        stageContext[1] || stageContext[0],
        directStageSummary,
        fallback,
      ]),
      pickFirst([
        stageContext[0],
        pickFieldValue(pool, ["brandVoice", "businessContext"], 2),
        fallback,
      ]),
    ], fallback), fallback, synthesizedByQuestion);
  }

  if (stage.key === "ctaSalesFlow") {
    const salesProcessContext = stageContext.find((part) => /^sales process:/i.test(part)) || stageContext[1] || "";
    return ensureUniqueQuestionAnswers(stage.questions, dedupeAnswers([
      pickFirst([
        stripLeadingContextLabel(stageContext.find((part) => /^primary cta:/i.test(part)) || ""),
        suggestionText.get("businessContext"),
        pickFieldValue(pool, ["primaryGoals"]),
        directStageSummary,
      ]),
      pickFirst([
        stripLeadingContextLabel(salesProcessContext),
        directStageSummary,
        fallback,
      ]),
      pickFirst([
        buildSalesHandoffFromProcess(salesProcessContext),
        stripLeadingContextLabel(salesProcessContext),
        stageContext[0] || "",
        fallback,
      ]),
    ], fallback), fallback, synthesizedByQuestion);
  }

  if (stage.key === "guardrails") {
    return ensureUniqueQuestionAnswers(stage.questions, dedupeAnswers([
      pickFirst([
        directStageSummary,
        suggestionText.get("businessContext"),
        synthesizedByQuestion[0],
      ]),
      pickFirst([
        pickFieldValue(pool, ["industry", "businessModel"]),
        suggestionText.get("targetCustomer"),
        synthesizedByQuestion[1],
      ]),
      pickFirst([
        suggestionText.get("brandVoice"),
        pickFieldValue(pool, ["brandVoice", "businessContext"]),
        synthesizedByQuestion[2],
      ]),
    ], fallback), fallback, synthesizedByQuestion);
  }

  return ensureUniqueQuestionAnswers(stage.questions, dedupeAnswers([
    pickFirst([
      suggestionText.get("businessContext"),
      pickFieldValue(pool, ["businessContext"], 2),
      directStageSummary,
    ]),
    pickFirst([
      pickFieldValue(pool, ["targetCustomer", "businessContext"], 3),
      directStageSummary,
      fallback,
    ]),
    pickFirst([
      pickFieldValue(pool, ["businessContext", "brandVoice"], 4),
      fallback,
    ]),
  ], fallback), fallback, synthesizedByQuestion);
}

export function buildBusinessProfileGuidedIntakeFromBriefing(
  briefing: BusinessProfileBriefing | null | undefined,
  existing?: BusinessProfileGuidedIntake | null,
): BusinessProfileGuidedIntake | null {
  const next: BusinessProfileGuidedIntake = {};
  const pool = collectBriefingSuggestionPool(briefing);

  for (const stage of BUSINESS_PROFILE_PATH_STAGES) {
    const currentAnswers = Array.isArray(existing?.[stage.key]) ? existing?.[stage.key] ?? [] : [];
    const extractedStage = briefing?.stages.find((item) => item.key === stage.key);
    const extractedAnswers = buildGuidedAnswersForStage(stage, extractedStage ?? null, pool);
    const answers = stage.questions
      .map((_, index) => cleanGuidedAnswer(currentAnswers[index] || extractedAnswers[index] || ""));

    if (answers.some(Boolean)) {
      next[stage.key] = answers;
    }
  }

  return Object.keys(next).length ? next : null;
}