import { NextResponse } from "next/server";
import { z } from "zod";

import { generateText } from "@/lib/ai";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getBusinessProfileAiContext, getBusinessProfileTemplateVars } from "@/lib/businessProfileAiContext.server";
import { consumeCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    context: z.string().trim().max(4000).optional().or(z.literal("")),
  })
  .strict();

function stripCodeFences(text: string): string {
  let s = String(text || "").trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```[a-zA-Z0-9_-]*\n?/, "");
    s = s.replace(/\n?```$/, "");
  }
  return s.trim();
}

function normalizeSmsSystemPrompt(opts: { raw: string; businessName: string }): string {
  let s = stripCodeFences(opts.raw);
  s = s.replace(/^system\s*prompt\s*:\s*/i, "").trim();

  // Ensure it is clearly a system prompt for an AI receptionist.
  const mentionsSms = /\b(sms|text|inbound\s+sms)\b/i.test(s);
  const startsDirectToAi = /^you\s+are\b/i.test(s);
  const business = opts.businessName.trim() ? opts.businessName.trim() : "the business";

  if (!startsDirectToAi) {
    s = `You are an AI receptionist for ${business}.\n\n${s}`.trim();
  }
  if (!mentionsSms) {
    s = `You handle inbound SMS auto-replies (text messages).\n\n${s}`.trim();
  }

  // Avoid telling a human what to do.
  s = s
    .replace(/\bmake\s+sure\s+the\s+ai\b/gi, "Always")
    .replace(/\bmake\s+sure\s+it\b/gi, "Always")
    .trim();

  return s.slice(0, 6000).trim();
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("aiReceptionist", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  const charged = await consumeCredits(ownerId, PORTAL_CREDIT_COSTS.aiCallStepGenerate);
  if (!charged.ok) {
    return NextResponse.json({ ok: false, error: "Insufficient credits" }, { status: 402 });
  }

  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");
  const templateVars = await getBusinessProfileTemplateVars(ownerId).catch(() => ({} as Record<string, string>));
  const businessNameFallback = String(templateVars["businessName"] || templateVars["business.name"] || "")
    .trim()
    .slice(0, 120);

  const system = [
    "You write system prompts for an AI receptionist product.",
    "Return ONLY the system prompt text. No markdown. No JSON.",
    "The prompt is for INBOUND SMS auto-replies.",
    "No matter what the user asks, ALWAYS output an inbound-SMS AI receptionist system prompt.",
    "Constraints: keep replies short (1-3 sentences), under 320 characters when possible; no markdown; ask at most one question.",
    "Do not invent facts. If hours/pricing are unknown, ask or keep it generic.",
    "Keep it practical: answer basic questions, capture lead details when appropriate, and offer next steps.",
  ].join("\n");

  const user = [
    businessNameFallback ? `Business name: ${businessNameFallback}` : "",
    businessContext ? businessContext : "",
    parsed.data.context?.trim() ? ["Additional quick context from the user:", parsed.data.context.trim()].join("\n") : "",
    "",
    "Write the SMS system prompt now.",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8000);

  let raw = "";
  try {
    raw = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-5.4" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI request failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  const smsSystemPrompt = normalizeSmsSystemPrompt({
    raw: String(raw || ""),
    businessName: businessNameFallback,
  });
  if (!smsSystemPrompt) {
    return NextResponse.json({ ok: false, error: "Empty AI response" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, smsSystemPrompt });
}
