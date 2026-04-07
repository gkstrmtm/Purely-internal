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
    kind: z.enum(["systemPrompt", "greeting"]),
    channel: z.enum(["voice", "sms"]),
    text: z.string().trim().min(1).max(8000),
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

function normalizePolishedText(opts: { kind: "systemPrompt" | "greeting"; channel: "voice" | "sms"; raw: string; businessName: string }): string {
  let s = stripCodeFences(opts.raw);
  s = s.replace(/^polished\s*(system\s*prompt|prompt|greeting)\s*:\s*/i, "").trim();
  s = s.replace(/^system\s*prompt\s*:\s*/i, "").trim();
  s = s.replace(/^greeting\s*:\s*/i, "").trim();

  if (opts.kind === "systemPrompt") {
    const startsDirectToAi = /^you\s+are\b/i.test(s);
    const mentionsReceptionist = /\b(ai\s+receptionist|receptionist)\b/i.test(s);
    const mentionsSms = /\b(sms|text|inbound\s+sms)\b/i.test(s);

    if (!startsDirectToAi) {
      const business = opts.businessName.trim() ? opts.businessName.trim() : "the business";
      s = `You are an AI receptionist for ${business}.\n\n${s}`.trim();
    }
    if (!mentionsReceptionist) {
      s = `You are an AI receptionist.\n\n${s}`.trim();
    }
    if (opts.channel === "sms" && !mentionsSms) {
      s = `You handle inbound SMS auto-replies (text messages).\n\n${s}`.trim();
    }

    // Reframe any human-directed phrasing.
    s = s
      .replace(/\bmake\s+sure\s+(the\s+ai|your\s+ai)\b/gi, "Always")
      .replace(/\bmake\s+sure\s+it\b/gi, "Always")
      .trim();

    return s.slice(0, 6000).trim();
  }

  // greeting
  const maxLen = opts.channel === "sms" ? 320 : 360;
  return s.slice(0, maxLen).trim();
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

  const { kind, channel, text } = parsed.data;

  const system = [
    "You are an expert prompt-polisher for a small-business AI receptionist product.",
    "You are NOT writing advice to a human. You are rewriting text so it can be used by the AI receptionist.",
    "Return ONLY the polished text. No markdown. No quotes. No JSON.",
    "Preserve the user’s intent and facts. Do not invent business hours, pricing, addresses, policies, or offers.",
    "Avoid confusion: rewrite unclear instructions into clear, direct, executable instructions.",
    "Conversation behavior: do not ask multiple questions in a row; ask at most one question at a time.",
    "Do not require waiting for a response before giving a helpful next step; keep moving with concise options.",
    kind === "greeting"
      ? channel === "sms"
        ? "Greeting constraints (SMS): keep it short (1-3 sentences), ideally under 320 characters; no markdown."
        : "Greeting constraints (voice): keep it friendly and short (1-2 sentences)."
      : "System prompt constraints: write as direct instructions to the AI (start with 'You are...'). Keep it structured and detailed.",
  ].join("\n");

  const user = [
    businessNameFallback ? `Business name: ${businessNameFallback}` : "",
    businessContext ? businessContext : "",
    `Target: ${channel.toUpperCase()} ${kind === "systemPrompt" ? "SYSTEM PROMPT" : "GREETING"}`,
    "",
    "Original text to polish:",
    text,
    "",
    "Now return the polished text.",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 10000);

  let raw = "";
  try {
    raw = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-5.4" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI request failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  const polished = normalizePolishedText({
    kind,
    channel,
    raw,
    businessName: businessNameFallback,
  });

  if (!polished) {
    return NextResponse.json({ ok: false, error: "Empty AI response" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, polished });
}
