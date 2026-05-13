import { NextResponse } from "next/server";
import { z } from "zod";

import { generateText } from "@/lib/ai";
import { requireClientSessionForService } from "@/lib/portalAccess";
import {
  BUSINESS_PROFILE_FIELD_LABELS,
  buildBusinessProfileGuidedIntakeFromBriefing,
  BUSINESS_PROFILE_PATH_STAGE_BY_KEY,
  BUSINESS_PROFILE_PATH_STAGES,
  type BusinessProfileBriefStageSuggestion,
  type BusinessProfileGuidedIntake,
  type BusinessProfilePathStage,
  type BusinessProfilePathStageKey,
  isBusinessProfilePathStageKey,
  isBusinessProfileSuggestedFieldKey,
} from "@/lib/businessProfilePath";
import { getBusinessProfileWorkspaceData, setBusinessProfileWorkspaceData } from "@/lib/portalBusinessProfile.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_FILE_BYTES = 4_000_000;
const MAX_TEXT_CHARS = 8_000;

const extractedBriefResponseSchema = z.object({
  summary: z.string().trim().min(1).max(800),
  stages: z.array(
    z.object({
      key: z.string().trim().min(1).max(80),
      summary: z.string().trim().max(500).optional().default(""),
      suggestions: z.array(
        z.object({
          field: z.string().trim().min(1).max(80),
          value: z.union([z.string().trim().min(1).max(1400), z.array(z.string().trim().min(1).max(140)).min(1).max(8)]),
          rationale: z.string().trim().max(280).optional().default(""),
          sourceSnippet: z.string().trim().max(600).optional().default(""),
        }),
      ).min(1).max(6),
    }),
  ).min(1).max(7),
});

const stageAnswerResponseSchema = z.object({
  summary: z.string().trim().max(320).optional().default(""),
  answers: z.array(z.string().trim().max(600).or(z.literal(""))).min(1).max(6),
  missingDetails: z.array(z.string().trim().min(1).max(180)).max(3).optional().default([]),
});

const BRIEF_EXTRACTION_MODEL =
  (process.env.BUSINESS_PROFILE_BRIEF_MODEL ?? process.env.AI_MODEL ?? "gpt-5.4").trim() || "gpt-5.4";
const GUIDED_ANSWER_MODEL =
  (process.env.BUSINESS_PROFILE_GUIDED_MODEL ?? process.env.BUSINESS_PROFILE_BRIEF_MODEL ?? process.env.AI_MODEL ?? "gpt-5.4").trim() || "gpt-5.4";

function cleanExtractedText(value: string, maxChars = MAX_TEXT_CHARS) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function cleanText(value: unknown, maxLen: number) {
  return String(typeof value === "string" ? value : "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function cleanParagraph(value: unknown, maxLen: number) {
  return String(typeof value === "string" ? value : "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function extractJsonObject(raw: string) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }
}

function formatDraftProfileForPrompt(
  draftProfile: Awaited<ReturnType<typeof getBusinessProfileWorkspaceData>>["draftProfile"],
) {
  if (!draftProfile) return "";

  const lines = [
    draftProfile.businessName ? `Business name: ${cleanText(draftProfile.businessName, 200)}` : "",
    draftProfile.websiteUrl ? `Website: ${cleanText(draftProfile.websiteUrl, 500)}` : "",
    draftProfile.industry ? `Industry: ${cleanText(draftProfile.industry, 160)}` : "",
    draftProfile.businessModel ? `Business model: ${cleanText(draftProfile.businessModel, 200)}` : "",
    Array.isArray(draftProfile.primaryGoals) && draftProfile.primaryGoals.length
      ? `Primary goals: ${draftProfile.primaryGoals.map((goal) => cleanText(goal, 120)).filter(Boolean).join("; ")}`
      : "",
    draftProfile.targetCustomer ? `Target customer: ${cleanText(draftProfile.targetCustomer, 240)}` : "",
    draftProfile.brandVoice ? `Brand voice: ${cleanText(draftProfile.brandVoice, 240)}` : "",
    draftProfile.businessContext ? `Business context: ${cleanParagraph(draftProfile.businessContext, 1800)}` : "",
  ].filter(Boolean);

  return lines.length ? `Saved profile facts:\n${lines.join("\n")}` : "";
}

function formatGuidedIntakeForPrompt(
  guidedIntake: Awaited<ReturnType<typeof getBusinessProfileWorkspaceData>>["guidedIntake"],
) {
  if (!guidedIntake) return "";

  const sections = BUSINESS_PROFILE_PATH_STAGES.flatMap((stage) => {
    const answers = (guidedIntake?.[stage.key] ?? [])
      .map((answer) => cleanParagraph(answer, 500))
      .filter(Boolean);
    if (!answers.length) return [] as string[];
    return [
      `${stage.label}: ${answers
        .map((answer, index) => `Q${index + 1}: ${answer}`)
        .join(" | ")}`,
    ];
  });

  return sections.length ? `Saved guided answers:\n${sections.join("\n")}` : "";
}

function formatBriefingForPrompt(
  briefing: Awaited<ReturnType<typeof getBusinessProfileWorkspaceData>>["briefing"],
) {
  if (!briefing) return "";

  const parts = [
    briefing.summary ? `Prior imported brief summary: ${cleanParagraph(briefing.summary, 800)}` : "",
    ...briefing.stages.flatMap((stage) => {
      const text = [
        stage.summary ? cleanParagraph(stage.summary, 320) : "",
        ...stage.suggestions.map((suggestion) => {
          const value = Array.isArray(suggestion.value)
            ? suggestion.value.map((item) => cleanText(item, 120)).filter(Boolean).join("; ")
            : cleanParagraph(suggestion.value, 320);
          return value ? `${suggestion.label}: ${value}` : "";
        }),
      ]
        .filter(Boolean)
        .join(" | ");
      return text ? [`${stage.label}: ${text}`] : [];
    }),
  ].filter(Boolean);

  return parts.length ? parts.join("\n") : "";
}

function buildWorkspacePromptContext(
  workspace: Awaited<ReturnType<typeof getBusinessProfileWorkspaceData>>,
) {
  return [
    formatDraftProfileForPrompt(workspace.draftProfile),
    formatGuidedIntakeForPrompt(workspace.guidedIntake),
    formatBriefingForPrompt(workspace.briefing),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4500);
}

function buildStageEvidenceContext(stage: BusinessProfileBriefStageSuggestion | null | undefined) {
  if (!stage) return "";
  const parts = [
    stage.summary ? `Stage summary: ${cleanParagraph(stage.summary, 320)}` : "",
    ...stage.suggestions.map((suggestion) => {
      const value = Array.isArray(suggestion.value)
        ? suggestion.value.map((item) => cleanText(item, 120)).filter(Boolean).join("; ")
        : cleanParagraph(suggestion.value, 320);
      const source = cleanParagraph(suggestion.sourceSnippet, 300);
      const rationale = cleanText(suggestion.rationale, 200);
      return [
        `${suggestion.label}: ${value}`,
        source ? `Evidence: ${source}` : "",
        rationale ? `Why it matters: ${rationale}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    }),
  ].filter(Boolean);

  return parts.join("\n");
}

function buildStageAnswerPromptRules(stage: BusinessProfilePathStage) {
  const shared = [
    "Quote or paraphrase the strongest business-specific facts instead of abstract marketing filler.",
    "Prefer the most concrete evidence already present in the brief, even if that makes the answer slightly more specific.",
    "Do not use vague phrases like immediate solutions, satisfied clients, seamless transition, or enhance the experience unless the brief itself says that.",
    "If the brief gives named metrics, regions, buyer roles, process steps, constraints, or claims, reuse them directly.",
  ];

  if (stage.key === "audience") {
    return [
      ...shared,
      "For urgency, explain the real buying trigger from the brief such as staffing gaps, ownership pressure, review issues, renewal pressure, or stalled growth; do not generalize.",
      "For pain points, prefer the operational bottleneck or business risk that shows up most clearly in the brief.",
    ];
  }

  if (stage.key === "proof") {
    return [
      ...shared,
      "For question 1, answer with the strongest proof category from the set testimonial, result, credential, or case study, then justify it with the specific proof in the brief.",
      "If the brief includes quantified scale, volume, regional coverage, measurable outcomes, or repeated execution evidence, prefer result over testimonial.",
      "Choose testimonial only when the strongest proof is mainly a quoted customer statement and there is no stronger concrete result in the brief.",
      "Prefer concrete proof over meta labels when the brief contains it. If quantified results, case volume, coverage, or a specific client quote exists, anchor the answer on that instead of generic proof language.",
      "When choosing between testimonial, result, credential, or case study, pick the strongest evidence actually present in the brief, not the safest generic category.",
      "Trust cues should stay close to the offer and should sound like facts, not praise adjectives.",
    ];
  }

  if (stage.key === "voicePositioning") {
    return [
      ...shared,
      "For how the business should sound, combine the explicit tone adjectives from the brief with the audience it needs to persuade.",
      "For distinct positioning, describe the business's actual category angle, operating advantage, or market contrast in plain language.",
      "Distinct positioning should describe the actual market angle or operating advantage, not a broad transformation claim repeated from the offer.",
      "Avoid generic distinctiveness claims like unique ability, stands out, or enhances the experience unless the brief gives a specific reason.",
      "Off-brand phrasing should name the kinds of wording to avoid in plain language.",
    ];
  }

  if (stage.key === "ctaSalesFlow") {
    return [
      ...shared,
      "For the primary CTA, use the exact booking or request action from the brief when one is given.",
      "For what happens after booking, describe the actual next steps in order using the brief's process nouns and verbs.",
      "For sales handoff, describe the operational transition plainly. Do not use phrases like seamless transition, ensure clarity, or alignment on expectations unless the brief itself says that.",
      "Describe the follow-up path as concrete steps from the brief, not generic sales-process language.",
    ];
  }

  if (stage.key === "guardrails") {
    return [
      ...shared,
      "Keep constraints factual and scoped. Name the actual audience, geography, compliance, or service limits from the brief.",
    ];
  }

  return shared;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

async function generateGuidedIntakeWithAi(input: {
  briefing: NonNullable<ReturnType<typeof normalizeExtractedBriefing>>;
  sourceText: string;
  workspace: Awaited<ReturnType<typeof getBusinessProfileWorkspaceData>>;
}) {
  const fallback = buildBusinessProfileGuidedIntakeFromBriefing(input.briefing, null) ?? {};
  const workspaceContext = buildWorkspacePromptContext(input.workspace);
  const briefText = cleanExtractedText(input.sourceText, 6000);

  type StageAnswerResult = {
    key: BusinessProfilePathStageKey;
    answers: string[];
    usedAi: boolean;
  };

  const stageResults = await mapWithConcurrency<BusinessProfilePathStage, StageAnswerResult>(
    BUSINESS_PROFILE_PATH_STAGES,
    3,
    async (stage) => {
      const extractedStage = input.briefing.stages.find((item) => item.key === stage.key) ?? null;
      const fallbackAnswers = stage.questions.map((_, index) =>
        cleanParagraph(fallback[stage.key]?.[index] || "", 600),
      );

      const system = [
        "You refine saved business profile answers for one stage of the same business.",
        "Use existing saved context and the new imported brief together.",
        "Answer each question with concrete operational detail when supported.",
        "Do not repeat the same sentence across answers.",
        "If a question is not supported by the available evidence, return an empty string for that answer.",
        "Prefer additive nuance over replacing established business facts unless the new brief clearly conflicts.",
        "Return strict JSON only.",
      ].join(" ");

      const user = [
        "Return JSON with this schema:",
        '{"summary":"string","answers":["string"],"missingDetails":["string"]}',
        "Stage:",
        `${stage.label} - ${stage.description}`,
        "Questions:",
        stage.questions.map((question, index) => `${index + 1}. ${question}`).join("\n"),
        workspaceContext ? `Existing workspace context:\n${workspaceContext}` : "",
        input.briefing.summary ? `Latest imported brief summary:\n${cleanParagraph(input.briefing.summary, 800)}` : "",
        extractedStage ? `Latest imported evidence for this stage:\n${buildStageEvidenceContext(extractedStage)}` : "",
        "Rules:",
        "- Keep answers direct, editable, and useful inside a business settings form.",
        "- Use one or two sentences when there is enough evidence.",
        "- Do not answer every question with the same generic business sentence.",
        "- Every non-empty answer should be grounded in facts from the existing workspace or the imported brief.",
        "- Prefer concrete nouns and facts from the brief over abstract benefit language.",
        "- missingDetails should name only the most important facts still absent for this stage.",
        ...buildStageAnswerPromptRules(stage).map((rule) => `- ${rule}`),
        "Imported brief text:",
        briefText,
      ]
        .filter(Boolean)
        .join("\n\n");

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const raw = await generateText({
            system,
            user,
            model: GUIDED_ANSWER_MODEL,
            temperature: 0.2,
            responseFormat: "json",
          });
          const decoded = extractJsonObject(raw);
          const parsed = stageAnswerResponseSchema.safeParse(decoded);
          if (!parsed.success) {
            console.warn(`/api/portal/business-profile/brief: invalid stage answer payload for ${stage.key} on attempt ${attempt + 1}`);
            continue;
          }

          return {
            key: stage.key,
            answers: stage.questions.map((_, index) =>
              cleanParagraph(parsed.data.answers[index] || fallbackAnswers[index] || "", 600),
            ),
            usedAi: true,
          };
        } catch (error) {
          console.error(`/api/portal/business-profile/brief: stage answer generation failed for ${stage.key} on attempt ${attempt + 1}`, error);
        }
      }

      return { key: stage.key, answers: fallbackAnswers, usedAi: false };
    });

  const next: BusinessProfileGuidedIntake = {};
  let aiStageCount = 0;
  for (const result of stageResults) {
    const answers = result.answers.filter((answer, index, arr) => index < arr.length)
      .map((answer) => cleanParagraph(answer, 600));
    if (result.usedAi && answers.some(Boolean)) aiStageCount += 1;
    if (answers.some(Boolean)) {
      next[result.key] = answers;
    }
  }

  return {
    guidedIntake: Object.keys(next).length ? next : buildBusinessProfileGuidedIntakeFromBriefing(input.briefing, null),
    aiStageCount,
  };
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const mod: any = await import("pdf-parse");
  const pdfParse: any = mod?.default ?? mod;
  const res = await pdfParse(bytes);
  return typeof res?.text === "string" ? String(res.text) : "";
}

async function extractDocxText(bytes: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const res = await (mammoth as any).extractRawText({ buffer: bytes });
  return typeof res?.value === "string" ? String(res.value) : "";
}

function normalizeBriefSectionLabel(label: string) {
  return label.toLowerCase().replace(/[^a-z]/g, "");
}

function parseStructuredBriefSections(text: string) {
  const sections = new Map<string, string>();
  const lines = String(text || "").replace(/\r/g, "\n").split(/\n+/);
  let currentKey = "";
  let buffer: string[] = [];

  const commit = () => {
    if (!currentKey || !buffer.length) return;
    const value = cleanParagraph(buffer.join(" "), 1400);
    if (value) sections.set(currentKey, value);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z][A-Za-z /&()\-]{1,40}):\s*(.*)$/);
    if (match) {
      commit();
      currentKey = normalizeBriefSectionLabel(match[1]);
      buffer = match[2] ? [match[2].trim()] : [];
      continue;
    }

    if (!currentKey) continue;
    buffer.push(line);
  }

  commit();
  return sections;
}

function splitBriefList(value: string) {
  return value
    .split(/\s*[;,|]\s*/)
    .map((item) => cleanText(item, 120))
    .filter(Boolean)
    .slice(0, 6);
}

function joinBriefContext(parts: Array<string | undefined>, maxLen = 1200) {
  return cleanParagraph(parts.filter(Boolean).join("\n\n"), maxLen);
}

function getBriefFieldValue(
  briefing: BusinessProfileBriefStageSuggestion[] | null | undefined,
  field: keyof typeof BUSINESS_PROFILE_FIELD_LABELS,
) {
  for (const stage of briefing || []) {
    for (const suggestion of stage.suggestions) {
      if (suggestion.field !== field) continue;
      if (Array.isArray(suggestion.value)) return cleanText(suggestion.value[0], 240);
      return cleanText(suggestion.value, 240);
    }
  }
  return "";
}

function normalizeIdentityToken(value: string) {
  return cleanText(value, 240).toLowerCase().replace(/https?:\/\//g, "").replace(/^www\./, "").replace(/[^a-z0-9]/g, "");
}

function shouldIsolateWorkspaceContext(
  workspace: Awaited<ReturnType<typeof getBusinessProfileWorkspaceData>>,
  fallback: ReturnType<typeof buildFallbackBriefing>,
) {
  const importedName = getBriefFieldValue(fallback.stages, "businessName");
  const importedWebsite = getBriefFieldValue(fallback.stages, "websiteUrl");
  const existingName = cleanText(
    workspace.draftProfile?.businessName || getBriefFieldValue(workspace.briefing?.stages, "businessName"),
    240,
  );
  const existingWebsite = cleanText(
    workspace.draftProfile?.websiteUrl || getBriefFieldValue(workspace.briefing?.stages, "websiteUrl"),
    240,
  );

  const nameConflict = Boolean(
    importedName && existingName && normalizeIdentityToken(importedName) !== normalizeIdentityToken(existingName),
  );
  const websiteConflict = Boolean(
    importedWebsite && existingWebsite && normalizeIdentityToken(importedWebsite) !== normalizeIdentityToken(existingWebsite),
  );

  return nameConflict || websiteConflict;
}

async function readBriefTextFromFile(file: File) {
  const fileName = cleanText(file.name, 240);
  const mimeType = cleanText(file.type, 120).toLowerCase();
  const ext = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() || "" : "";
  const bytes = Buffer.from(await file.arrayBuffer());

  if (!bytes.length) {
    throw new Error("The uploaded brief was empty.");
  }
  if (bytes.length > MAX_FILE_BYTES) {
    throw new Error("Brief uploads must stay under 4MB for now.");
  }

  let rawText = "";
  if (mimeType.includes("pdf") || ext === "pdf") {
    rawText = await extractPdfText(bytes);
  } else if (mimeType.includes("word") || mimeType.includes("officedocument") || ext === "docx") {
    rawText = await extractDocxText(bytes);
  } else if (mimeType.startsWith("text/") || ["txt", "md", "markdown", "rtf"].includes(ext)) {
    rawText = bytes.toString("utf8");
  } else {
    throw new Error("Supported brief files are PDF, DOCX, TXT, and Markdown.");
  }

  const text = cleanExtractedText(rawText);
  if (text.length < 40) {
    throw new Error("The uploaded brief did not contain enough readable text to extract from.");
  }

  return {
    text,
    fileName,
    mimeType: mimeType || "text/plain",
    sourceSignature: `${fileName}:${bytes.length}:${text.slice(0, 240)}`,
  };
}

function buildFallbackBriefing(input: { text: string; sourceName: string; sourceType: string; sourceSignature: string }) {
  const sections = parseStructuredBriefSections(input.text);
  const lines = input.text.split(/\n+/).map((line) => cleanText(line, 240)).filter(Boolean);
  const getSection = (...labels: string[]) => {
    for (const label of labels) {
      const value = cleanParagraph(sections.get(normalizeBriefSectionLabel(label)), 1200);
      if (value) return value;
    }
    return "";
  };

  const website = getSection("website") || input.text.match(/https?:\/\/[^\s)]+/i)?.[0] || "";
  const businessNameGuess = getSection("business name") || lines.find((line) => line.length >= 3 && line.length <= 80 && !line.includes("http")) || "";
  const industry = getSection("industry");
  const businessModel = getSection("business model");
  const primaryGoals = splitBriefList(getSection("primary goals"));
  const targetCustomer = getSection("target customer");
  const brandVoice = getSection("brand voice");
  const offerDetails = getSection("offer details", "offer");
  const pricing = getSection("pricing");
  const outcome = getSection("outcome");
  const painPoints = getSection("pain points", "painpoints");
  const proof = getSection("proof");
  const ctaPreference = getSection("cta preference", "cta");
  const salesProcess = getSection("sales process");
  const guardrails = getSection("guardrails");
  const operationalNotes = getSection("operational notes");
  const summary = cleanParagraph(
    [
      businessNameGuess,
      industry ? `is a ${industry} business.` : "",
      businessModel ? `It uses ${businessModel}.` : "",
      offerDetails,
    ]
      .filter(Boolean)
      .join(" "),
    400,
  ) || cleanParagraph(lines.slice(0, 3).join(" "), 400) || "We pulled a first-pass business brief summary into the workspace draft.";
  const stages: BusinessProfileBriefStageSuggestion[] = [];

  if (businessNameGuess || website || industry || businessModel) {
    stages.push({
      key: "businessBasics",
      label: BUSINESS_PROFILE_PATH_STAGE_BY_KEY.businessBasics.label,
      summary: "A few business basics were found in the uploaded brief.",
      suggestions: [
        ...(businessNameGuess
          ? [{ field: "businessName" as const, label: BUSINESS_PROFILE_FIELD_LABELS.businessName, value: businessNameGuess, rationale: "This looked like the business name in the uploaded brief." }]
          : []),
        ...(website
          ? [{ field: "websiteUrl" as const, label: BUSINESS_PROFILE_FIELD_LABELS.websiteUrl, value: website, rationale: "A website URL was found in the uploaded brief." }]
          : []),
        ...(industry
          ? [{ field: "industry" as const, label: BUSINESS_PROFILE_FIELD_LABELS.industry, value: industry, rationale: "Industry information was labeled directly in the uploaded brief." }]
          : []),
        ...(businessModel
          ? [{ field: "businessModel" as const, label: BUSINESS_PROFILE_FIELD_LABELS.businessModel, value: businessModel, rationale: "Business model information was labeled directly in the uploaded brief." }]
          : []),
      ],
    });
  }

  const offerContext = joinBriefContext([offerDetails, pricing ? `Pricing: ${pricing}` : "", outcome ? `Outcome: ${outcome}` : ""], 900);
  if (offerContext || primaryGoals.length) {
    stages.push({
      key: "offerPricing",
      label: BUSINESS_PROFILE_PATH_STAGE_BY_KEY.offerPricing.label,
      summary: "Offer, pricing, and outcome details were inferred from labeled brief sections.",
      suggestions: [
        ...(primaryGoals.length
          ? [{ field: "primaryGoals" as const, label: BUSINESS_PROFILE_FIELD_LABELS.primaryGoals, value: primaryGoals, rationale: "Primary goals were labeled directly in the uploaded brief." }]
          : []),
        ...(offerContext
          ? [{ field: "businessContext" as const, label: BUSINESS_PROFILE_FIELD_LABELS.businessContext, value: offerContext, rationale: "Offer and pricing notes were combined into a concise working context." }]
          : []),
      ],
    });
  }

  const audienceContext = joinBriefContext([painPoints, outcome ? `Desired outcome: ${outcome}` : ""], 900);
  if (targetCustomer || audienceContext) {
    stages.push({
      key: "audience",
      label: BUSINESS_PROFILE_PATH_STAGE_BY_KEY.audience.label,
      summary: "Buyer and pain-point details were inferred from labeled brief sections.",
      suggestions: [
        ...(targetCustomer
          ? [{ field: "targetCustomer" as const, label: BUSINESS_PROFILE_FIELD_LABELS.targetCustomer, value: targetCustomer, rationale: "Target customer details were labeled directly in the uploaded brief." }]
          : []),
        ...(audienceContext
          ? [{ field: "businessContext" as const, label: BUSINESS_PROFILE_FIELD_LABELS.businessContext, value: audienceContext, rationale: "Pain points and desired outcomes were combined into audience context." }]
          : []),
      ],
    });
  }

  if (proof) {
    stages.push({
      key: "proof",
      label: BUSINESS_PROFILE_PATH_STAGE_BY_KEY.proof.label,
      summary: "Proof details were inferred from labeled brief sections.",
      suggestions: [
        {
          field: "businessContext",
          label: BUSINESS_PROFILE_FIELD_LABELS.businessContext,
          value: proof,
          rationale: "Proof notes were labeled directly in the uploaded brief.",
        },
      ],
    });
  }

  const voiceContext = joinBriefContext([operationalNotes, offerDetails ? `Offer posture: ${offerDetails}` : ""], 900);
  if (brandVoice || voiceContext) {
    stages.push({
      key: "voicePositioning",
      label: BUSINESS_PROFILE_PATH_STAGE_BY_KEY.voicePositioning.label,
      summary: "Voice and positioning notes were inferred from labeled brief sections.",
      suggestions: [
        ...(brandVoice
          ? [{ field: "brandVoice" as const, label: BUSINESS_PROFILE_FIELD_LABELS.brandVoice, value: brandVoice, rationale: "Brand voice was labeled directly in the uploaded brief." }]
          : []),
        ...(voiceContext
          ? [{ field: "businessContext" as const, label: BUSINESS_PROFILE_FIELD_LABELS.businessContext, value: voiceContext, rationale: "Operational and offer notes were condensed into positioning context." }]
          : []),
      ],
    });
  }

  const conversionContext = joinBriefContext([ctaPreference ? `Primary CTA: ${ctaPreference}` : "", salesProcess ? `Sales process: ${salesProcess}` : ""], 900);
  if (conversionContext) {
    stages.push({
      key: "ctaSalesFlow",
      label: BUSINESS_PROFILE_PATH_STAGE_BY_KEY.ctaSalesFlow.label,
      summary: "CTA and sales-process notes were inferred from labeled brief sections.",
      suggestions: [
        {
          field: "businessContext",
          label: BUSINESS_PROFILE_FIELD_LABELS.businessContext,
          value: conversionContext,
          rationale: "CTA and sales-process notes were condensed into conversion context.",
        },
      ],
    });
  }

  const guardrailContext = joinBriefContext([guardrails, operationalNotes], 900);
  if (guardrailContext) {
    stages.push({
      key: "guardrails",
      label: BUSINESS_PROFILE_PATH_STAGE_BY_KEY.guardrails.label,
      summary: "Guardrails and operating constraints were inferred from labeled brief sections.",
      suggestions: [
        {
          field: "businessContext",
          label: BUSINESS_PROFILE_FIELD_LABELS.businessContext,
          value: guardrailContext,
          rationale: "Guardrails and operational notes were condensed into downstream constraints.",
        },
      ],
    });
  }

  if (!stages.length) {
    stages.push({
      key: "offerPricing",
      label: BUSINESS_PROFILE_PATH_STAGE_BY_KEY.offerPricing.label,
      summary: "We could not fully classify the brief, so a compact excerpt was saved as working context.",
      suggestions: [
        {
          field: "businessContext",
          label: BUSINESS_PROFILE_FIELD_LABELS.businessContext,
          value: cleanParagraph(input.text.slice(0, 800), 800),
          rationale: "This compact excerpt keeps the uploaded brief available as structured workspace context until you review it.",
        },
      ],
    });
  }

  return {
    sourceName: input.sourceName,
    sourceType: input.sourceType,
    sourceSignature: input.sourceSignature,
    uploadedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    summary,
    stages,
  };
}

function normalizeExtractedBriefing(raw: z.infer<typeof extractedBriefResponseSchema>, meta: {
  sourceName: string;
  sourceType: string;
  sourceSignature: string;
}) {
  const stages: BusinessProfileBriefStageSuggestion[] = [];

  for (const stage of raw.stages) {
    if (!isBusinessProfilePathStageKey(stage.key)) continue;
    const normalizedSuggestions = stage.suggestions.flatMap((suggestion) => {
      if (!isBusinessProfileSuggestedFieldKey(suggestion.field)) return [] as BusinessProfileBriefStageSuggestion["suggestions"];
      const value = Array.isArray(suggestion.value)
        ? suggestion.value.map((item) => cleanText(item, 140)).filter(Boolean).slice(0, 8)
        : cleanParagraph(suggestion.value, suggestion.field === "businessContext" ? 1200 : 320);
      if (!value || (Array.isArray(value) && !value.length)) return [] as BusinessProfileBriefStageSuggestion["suggestions"];
      return [{
        field: suggestion.field,
        label: BUSINESS_PROFILE_FIELD_LABELS[suggestion.field],
        value,
        ...(cleanText(suggestion.rationale, 280) ? { rationale: cleanText(suggestion.rationale, 280) } : {}),
        ...(cleanParagraph(suggestion.sourceSnippet, 600) ? { sourceSnippet: cleanParagraph(suggestion.sourceSnippet, 600) } : {}),
      }];
    });
    if (!normalizedSuggestions.length) continue;
    stages.push({
      key: stage.key,
      label: BUSINESS_PROFILE_PATH_STAGE_BY_KEY[stage.key].label,
      ...(cleanParagraph(stage.summary, 500) ? { summary: cleanParagraph(stage.summary, 500) } : {}),
      suggestions: normalizedSuggestions,
    });
  }

  if (!stages.length) return null;

  return {
    sourceName: meta.sourceName,
    sourceType: meta.sourceType,
    sourceSignature: meta.sourceSignature,
    uploadedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    summary: cleanParagraph(raw.summary, 800),
    stages,
  };
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("businessProfile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("briefFile");
  const briefText = cleanExtractedText(String(formData?.get("briefText") || ""));

  if (!(file instanceof File) && !briefText) {
    return NextResponse.json({ error: "Upload a brief file or paste a brief first." }, { status: 400 });
  }

  let sourceName = "Pasted brief";
  let sourceType = "text/plain";
  let sourceSignature = `pasted:${briefText.slice(0, 240)}`;
  let extractedText = briefText;
  const existingWorkspace = await getBusinessProfileWorkspaceData(auth.session.user.id);

  try {
    if (file instanceof File) {
      const parsed = await readBriefTextFromFile(file);
      sourceName = parsed.fileName;
      sourceType = parsed.mimeType;
      sourceSignature = parsed.sourceSignature;
      extractedText = parsed.text;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read the uploaded brief." }, { status: 400 });
  }

  const fallback = buildFallbackBriefing({
    text: extractedText,
    sourceName,
    sourceType,
    sourceSignature,
  });
  const isolateWorkspaceContext = shouldIsolateWorkspaceContext(existingWorkspace, fallback);
  const workspaceForImport = isolateWorkspaceContext
    ? { ...existingWorkspace, draftProfile: null, guidedIntake: null, briefing: null }
    : existingWorkspace;

  const system = [
    "You extract structured business-context suggestions from a single overall brief.",
    "Treat this as additional context for the same business, not a brand-new company.",
    "Map information into the exact business-profile stages provided.",
    "Return strict JSON only.",
    "Do not invent details that are not supported by the brief.",
    "Keep suggestions editable and concise.",
    "Avoid repeating the same sentence across multiple stages or suggestions.",
    "Prefer stage-specific leverage: audience insight in audience stages, proof insight in proof stages, conversion insight in conversion stages.",
    "When evidence is thin, produce useful partial guidance rather than duplicating generic text.",
  ].join(" ");

  const user = [
    "Return JSON with this schema:",
    '{"summary":"string","stages":[{"key":"businessBasics","summary":"string","suggestions":[{"field":"businessName","value":"string or string[]","rationale":"string","sourceSnippet":"string"}]}]}',
    "Allowed stage keys:",
    BUSINESS_PROFILE_PATH_STAGES.map((stage) => `- ${stage.key}: ${stage.label} - ${stage.description}`).join("\n"),
    "Allowed fields:",
    Object.entries(BUSINESS_PROFILE_FIELD_LABELS).map(([key, label]) => `- ${key}: ${label}`).join("\n"),
    "Rules:",
    "- Cover as many stages as the brief reasonably supports; do not collapse everything into one repeated note.",
    "- Keep each stage to at most 6 suggestions.",
    "- Within each stage, suggestions should be non-duplicative and materially different.",
    "- Use `primaryGoals` as an array of short strings when the brief clearly implies multiple goals.",
    "- Use `businessContext` for nuanced descriptive notes that do not fit a narrower field.",
    "- Use sourceSnippet to show the evidence that drove the suggestion.",
    "- Keep sourceSnippet short and directly pulled from the brief.",
    "- Do not output markdown fences.",
    workspaceForImport.briefing?.summary
      ? `Existing saved business summary: ${cleanParagraph(workspaceForImport.briefing.summary, 500)}`
      : "",
    buildWorkspacePromptContext(workspaceForImport)
      ? `Existing saved workspace context:\n${buildWorkspacePromptContext(workspaceForImport)}`
      : "",
    "",
    `Brief source: ${sourceName} (${sourceType})`,
    "Brief text:",
    extractedText,
  ].join("\n\n");

  try {
    let normalized: ReturnType<typeof normalizeExtractedBriefing> = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const raw = await generateText({ system, user, model: BRIEF_EXTRACTION_MODEL, temperature: 0.2, responseFormat: "json" });
        const decoded = extractJsonObject(raw);
        const parsed = extractedBriefResponseSchema.safeParse(decoded);
        if (!parsed.success) {
          console.warn(`/api/portal/business-profile/brief: invalid extraction payload on attempt ${attempt + 1}`);
          continue;
        }
        normalized = normalizeExtractedBriefing(parsed.data, { sourceName, sourceType, sourceSignature });
        if (normalized) break;
      } catch (error) {
        console.error(`/api/portal/business-profile/brief: extraction failed on attempt ${attempt + 1}`, error);
      }
    }

    if (!normalized) {
      return NextResponse.json(
        { ok: false, error: "Unable to extract the uploaded brief right now. No fallback draft was saved." },
        { status: 502 },
      );
    }

    const guidedResult = await generateGuidedIntakeWithAi({
      briefing: normalized,
      sourceText: extractedText,
      workspace: workspaceForImport,
    });

    if (guidedResult.aiStageCount <= 0) {
      console.error("/api/portal/business-profile/brief: guided stage generation did not fire");
      return NextResponse.json(
        { ok: false, error: "Brief extraction did not complete cleanly. No fallback draft was saved." },
        { status: 502 },
      );
    }

    await setBusinessProfileWorkspaceData(auth.session.user.id, {
      briefing: normalized,
      guidedIntake: guidedResult.guidedIntake,
    });
    return NextResponse.json({ ok: true, briefing: normalized, guidedIntake: guidedResult.guidedIntake });
  } catch (error) {
    console.error("/api/portal/business-profile/brief: extraction failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to extract the uploaded brief right now. No fallback draft was saved." },
      { status: 502 },
    );
  }
}