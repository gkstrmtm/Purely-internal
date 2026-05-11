import { NextResponse } from "next/server";
import { z } from "zod";

import { generateText } from "@/lib/ai";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { BusinessProfileUpsertSchema } from "@/lib/portalBusinessProfile.server";
import {
  BUSINESS_PROFILE_PATH_STAGE_BY_KEY,
  BUSINESS_PROFILE_PATH_STAGES,
  isBusinessProfilePathStageKey,
  type BusinessProfileGuidedIntake,
  type BusinessProfilePathStageKey,
} from "@/lib/businessProfilePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const polishDraftSchema = BusinessProfileUpsertSchema.partial().extend({
  businessName: z.string().trim().max(200).optional().or(z.literal("")),
  stageKey: z.string().trim().min(1).max(80),
  questionIndex: z.number().int().min(0).max(8),
  text: z.string().trim().min(1).max(2000),
  guidedIntake: z
    .record(z.string(), z.array(z.string().trim().max(2000)).max(8))
    .optional()
    .nullable(),
});

type PolishDraft = z.infer<typeof polishDraftSchema>;

function compact(value: unknown, maxLen: number) {
  return String(typeof value === "string" ? value : "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function compactGoals(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const goals: string[] = [];
  for (const item of value) {
    const next = compact(item, 120);
    if (!next || goals.includes(next)) continue;
    goals.push(next);
    if (goals.length >= 10) break;
  }
  return goals;
}

function normalizeDraft(input: PolishDraft) {
  return {
    businessName: compact(input.businessName, 160),
    websiteUrl: compact(input.websiteUrl, 300),
    industry: compact(input.industry, 160),
    businessModel: compact(input.businessModel, 220),
    primaryGoals: compactGoals(input.primaryGoals),
    targetCustomer: compact(input.targetCustomer, 240),
    brandVoice: compact(input.brandVoice, 240),
    businessContext: compact(input.businessContext, 3200),
  };
}

function normalizeGuidedIntake(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const next: BusinessProfileGuidedIntake = {};
  for (const stage of BUSINESS_PROFILE_PATH_STAGES) {
    const rawAnswers = Array.isArray(record[stage.key]) ? (record[stage.key] as unknown[]) : [];
    const answers = stage.questions.map((_, index) => compact(rawAnswers[index], 1200));
    if (answers.some(Boolean)) {
      next[stage.key] = answers;
    }
  }
  return Object.keys(next).length ? next : null;
}

function buildDraftFacts(draft: ReturnType<typeof normalizeDraft>) {
  return [
    draft.businessName ? `Business name: ${draft.businessName}` : "",
    draft.websiteUrl ? `Website: ${draft.websiteUrl}` : "",
    draft.industry ? `Industry: ${draft.industry}` : "",
    draft.businessModel ? `Business model: ${draft.businessModel}` : "",
    draft.primaryGoals.length ? `Primary goals: ${draft.primaryGoals.join("; ")}` : "",
    draft.targetCustomer ? `Target customer: ${draft.targetCustomer}` : "",
    draft.brandVoice ? `Brand voice: ${draft.brandVoice}` : "",
    draft.businessContext ? `Business context: ${draft.businessContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildGuidedContext(guidedIntake: BusinessProfileGuidedIntake | null, activeStageKey: BusinessProfilePathStageKey, activeQuestionIndex: number) {
  if (!guidedIntake) return "";
  return BUSINESS_PROFILE_PATH_STAGES.flatMap((stage) => {
    const answers = (guidedIntake[stage.key] ?? [])
      .map((answer, index) => {
        const normalized = compact(answer, 1200);
        if (!normalized) return "";
        if (stage.key === activeStageKey && index === activeQuestionIndex) return "";
        return `${index + 1}. ${stage.questions[index]}\n${normalized}`;
      })
      .filter(Boolean)
      .join("\n\n");
    return answers ? [`${stage.label}\n${answers}`] : [];
  }).join("\n\n");
}

function stripCodeFences(text: string) {
  let normalized = String(text || "").trim();
  if (normalized.startsWith("```")) {
    normalized = normalized.replace(/^```[a-zA-Z0-9_-]*\n?/, "");
    normalized = normalized.replace(/\n?```$/, "");
  }
  return normalized.trim();
}

function normalizePolishedAnswer(raw: string) {
  return stripCodeFences(raw)
    .replace(/^polished\s*answer\s*:\s*/i, "")
    .replace(/^answer\s*:\s*/i, "")
    .trim()
    .slice(0, 1200);
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("businessProfile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const parsed = polishDraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (!isBusinessProfilePathStageKey(parsed.data.stageKey)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }

  const stage = BUSINESS_PROFILE_PATH_STAGE_BY_KEY[parsed.data.stageKey];
  if (parsed.data.questionIndex >= stage.questions.length) {
    return NextResponse.json({ error: "Invalid question" }, { status: 400 });
  }

  const draft = normalizeDraft(parsed.data);
  const guidedIntake = normalizeGuidedIntake(parsed.data.guidedIntake);
  const question = stage.questions[parsed.data.questionIndex];
  const surroundingContext = buildGuidedContext(guidedIntake, stage.key, parsed.data.questionIndex);

  const system = [
    "You polish one answer inside a shared business-profile intake form.",
    "Turn rough notes or dictated thoughts into a clear, intentional answer for the exact question.",
    "Use the surrounding business context to tighten wording, improve specificity, and preserve the strongest facts.",
    "Do not invent pricing, proof, geography, offers, guarantees, or operating details that are not supported by the provided draft.",
    "Do not answer a different question than the one requested.",
    "Return only the polished answer. No markdown. No bullets unless the original answer clearly requires a list.",
  ].join("\n");

  const user = [
    `Section: ${stage.label}`,
    `Question: ${question}`,
    "",
    "Current answer to polish:",
    parsed.data.text,
    "",
    buildDraftFacts(draft) ? `Current business draft:\n${buildDraftFacts(draft)}` : "",
    surroundingContext ? `Other saved section answers:\n${surroundingContext}` : "",
    "",
    "Rewrite the current answer so it reads like a deliberate source-of-truth note a business owner would want to save.",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 11000);

  let raw = "";
  try {
    raw = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-5.4", temperature: 0.2 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  const polished = normalizePolishedAnswer(raw);
  if (!polished) {
    return NextResponse.json({ ok: false, error: "Empty AI response" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, polished });
}