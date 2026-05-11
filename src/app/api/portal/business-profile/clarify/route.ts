import { NextResponse } from "next/server";
import { z } from "zod";

import { generateText } from "@/lib/ai";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { BusinessProfileUpsertSchema } from "@/lib/portalBusinessProfile.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const clarifyDraftSchema = BusinessProfileUpsertSchema.partial();

const clarifyResponseSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(280),
        reason: z.string().trim().min(1).max(280),
        suggestedAnswerStarter: z.string().trim().max(400).optional(),
      }),
    )
    .min(3)
    .max(3),
  recommendedContext: z.string().trim().max(1800).optional().default(""),
});

type ClarifyDraft = z.infer<typeof clarifyDraftSchema>;

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
    const next = compact(item, 100);
    if (!next || goals.includes(next)) continue;
    goals.push(next);
    if (goals.length >= 10) break;
  }
  return goals;
}

function normalizeDraft(input: ClarifyDraft) {
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

function buildFallbackQuestions(draft: ReturnType<typeof normalizeDraft>) {
  const questions: Array<{ question: string; reason: string; suggestedAnswerStarter?: string }> = [];

  if (!draft.industry || !draft.businessModel) {
    questions.push({
      question: "What exactly do you sell, and how is it delivered from first contact through fulfillment?",
      reason: "AI needs the real operating model to stop filling gaps with generic industry assumptions.",
      suggestedAnswerStarter: "We sell ... The process starts when ... and delivery finishes when ...",
    });
  }

  if (!draft.targetCustomer) {
    questions.push({
      question: "Who is the highest-intent customer, and what usually triggers them to reach out right now?",
      reason: "This sharpens audience framing across funnels, outbound, and newsletter copy.",
      suggestedAnswerStarter: "Our best-fit customer is ... They usually contact us when ...",
    });
  }

  if (!draft.primaryGoals.length) {
    questions.push({
      question: "What single action matters most after someone reads your content or lands on a page?",
      reason: "Without a primary outcome, AI tends to generate polite but low-conviction calls to action.",
      suggestedAnswerStarter: "The main conversion we want is ... because ...",
    });
  }

  if (!draft.businessContext) {
    questions.push({
      question: "What objections, proof points, and differentiators should always show up when AI writes for this business?",
      reason: "This is the missing detail that keeps generated work from sounding interchangeable.",
      suggestedAnswerStarter: "Customers usually worry about ... We win because ... Proof we can reference includes ...",
    });
  }

  if (!draft.brandVoice) {
    questions.push({
      question: "How should the business sound when AI writes: calm, premium, direct, warm, technical, urgent, or something else?",
      reason: "Voice guidance keeps every surface aligned instead of each tool inventing a new tone.",
      suggestedAnswerStarter: "The voice should feel ... Avoid sounding ...",
    });
  }

  if (questions.length < 3) {
    questions.push({
      question: "What details make a prospect trust you fast instead of shopping around?",
      reason: "Trust cues are reusable across landing pages, outbound, and follow-up systems.",
      suggestedAnswerStarter: "People trust us fastest when they learn ...",
    });
  }

  if (questions.length < 3) {
    questions.push({
      question: "What should AI avoid saying because it would be inaccurate, off-brand, or operationally impossible?",
      reason: "Guardrails matter as much as messaging when the same context feeds multiple product surfaces.",
      suggestedAnswerStarter: "AI should never imply ... It should avoid promising ...",
    });
  }

  return questions.slice(0, 3);
}

function buildFallbackSummary(draft: ReturnType<typeof normalizeDraft>, questions: ReturnType<typeof buildFallbackQuestions>) {
  const profileSignals = [
    draft.businessName ? "business name" : "",
    draft.industry ? "industry" : "",
    draft.businessModel ? "business model" : "",
    draft.targetCustomer ? "audience" : "",
    draft.brandVoice ? "voice" : "",
    draft.businessContext ? "operating detail" : "",
    draft.primaryGoals.length ? "goals" : "",
  ].filter(Boolean);

  if (!profileSignals.length) {
    return "The profile is still too thin for strong downstream AI work, so the next pass should capture the business model, audience, and concrete selling context.";
  }

  return `The draft already gives AI ${profileSignals.join(", ")}, but the next leverage point is answering ${questions
    .map((item) => item.question)
    .slice(0, 2)
    .join(" and ")} more explicitly.`;
}

function buildFallbackRecommendedContext(draft: ReturnType<typeof normalizeDraft>) {
  const lines = [
    draft.businessName ? `Business: ${draft.businessName}` : "",
    draft.industry || draft.businessModel ? `Offer and model: ${[draft.industry, draft.businessModel].filter(Boolean).join(" - ")}` : "",
    draft.targetCustomer ? `Best-fit customer: ${draft.targetCustomer}` : "",
    draft.primaryGoals.length ? `Primary goals: ${draft.primaryGoals.join("; ")}` : "",
    draft.brandVoice ? `Voice: ${draft.brandVoice}` : "",
    draft.businessContext ? `Existing notes: ${draft.businessContext}` : "",
    "Add: common objections, strongest proof, what makes people buy now, what promises are safe to make, and what next step matters most.",
  ].filter(Boolean);

  return lines.join("\n").slice(0, 1800);
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

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("businessProfile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = clarifyDraftSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const draft = normalizeDraft(parsed.data);
  const fallbackQuestions = buildFallbackQuestions(draft);
  const fallback = {
    ok: true as const,
    summary: buildFallbackSummary(draft, fallbackQuestions),
    questions: fallbackQuestions,
    recommendedContext: buildFallbackRecommendedContext(draft),
  };

  const signalStrength = [
    draft.businessName,
    draft.websiteUrl,
    draft.industry,
    draft.businessModel,
    draft.targetCustomer,
    draft.brandVoice,
    draft.businessContext,
    draft.primaryGoals.join(" "),
  ]
    .join(" ")
    .trim().length;

  if (signalStrength < 20) {
    return NextResponse.json(fallback);
  }

  const system =
    "You improve a shared business profile used across many AI product surfaces. " +
    "Review the draft business profile and identify the 3 highest-leverage clarification questions. " +
    "Be specific, non-generic, and oriented toward better downstream generation quality. " +
    "Return strict JSON only.";

  const user = [
    "Return JSON with exactly this schema:",
    '{"summary":"string","questions":[{"question":"string","reason":"string","suggestedAnswerStarter":"string"}],"recommendedContext":"string"}',
    "Requirements:",
    "- Exactly 3 questions.",
    "- Questions must be non-overlapping and focused on missing context that would materially improve generated work.",
    "- Keep each reason short and practical.",
    "- recommendedContext should be a concise notes block the user could append into the profile as a starter, not a finished marketing paragraph.",
    "- Do not mention forms, schemas, JSON, or implementation details.",
    "- Use plain language a business owner can answer quickly.",
    "",
    `Draft profile JSON:\n${JSON.stringify(draft, null, 2)}`,
  ].join("\n");

  try {
    const raw = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-5.4", temperature: 0.3 });
    const decoded = extractJsonObject(raw);
    const clarified = clarifyResponseSchema.safeParse(decoded);
    if (!clarified.success) return NextResponse.json(fallback);

    return NextResponse.json({
      ok: true,
      summary: clarified.data.summary,
      questions: clarified.data.questions,
      recommendedContext: clarified.data.recommendedContext,
    });
  } catch (error) {
    console.error("/api/portal/business-profile/clarify: generation failed", error);
    return NextResponse.json(fallback);
  }
}