import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { generateText } from "@/lib/ai";
import { consumeCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z.object({
  inbound: z.string().trim().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .max(20)
    .optional(),
  contactTagIds: z.array(z.string().trim().min(1).max(80)).max(60).optional(),
});

function isOptOutMessage(raw: string): boolean {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return false;
  if (s === "stop" || s === "unsubscribe" || s === "cancel" || s === "end" || s === "quit") return true;
  if (s.startsWith("stop ") || s.includes("\nstop") || s.includes("\rstop")) return true;
  return false;
}

function normalizeSmsReply(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 1200 ? `${oneLine.slice(0, 1199)}…` : oneLine;
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("aiReceptionist");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }

  const inbound = parsed.data.inbound;
  if (isOptOutMessage(inbound)) {
    return NextResponse.json({ ok: true, wouldReply: false, reason: "Opt-out keyword" });
  }

  const data = await getAiReceptionistServiceData(ownerId).catch(() => null);
  const s = data?.settings as any;
  if (!s || !s.smsEnabled) {
    return NextResponse.json({ ok: true, wouldReply: false, reason: "SMS auto-replies disabled" });
  }

  const includeIds = Array.isArray(s.smsIncludeTagIds) ? (s.smsIncludeTagIds as unknown[]).map((x) => String(x || "").trim()).filter(Boolean) : [];
  const excludeIds = Array.isArray(s.smsExcludeTagIds) ? (s.smsExcludeTagIds as unknown[]).map((x) => String(x || "").trim()).filter(Boolean) : [];

  const provided = Array.isArray(parsed.data.contactTagIds) ? parsed.data.contactTagIds : [];
  const tagIds = new Set(provided.map((x) => String(x || "").trim()).filter(Boolean));

  if (excludeIds.length && excludeIds.some((id) => tagIds.has(id))) {
    return NextResponse.json({ ok: true, wouldReply: false, reason: "Excluded by tag" });
  }
  if (includeIds.length && !includeIds.some((id) => tagIds.has(id))) {
    return NextResponse.json({ ok: true, wouldReply: false, reason: "Missing required include tag" });
  }

  const businessName = typeof s.businessName === "string" ? s.businessName.trim() : "";
  const smsPrompt = typeof s.smsSystemPrompt === "string" ? s.smsSystemPrompt.trim() : "";
  const basePrompt = smsPrompt || (typeof s.systemPrompt === "string" ? s.systemPrompt.trim() : "");

  const system = [
    basePrompt || "You are a helpful receptionist.",
    "You are replying via SMS.",
    "Keep replies concise: 1-3 short sentences, under 320 characters when possible.",
    "No markdown. No long lists. Ask at most one question.",
    businessName ? `Business name: ${businessName}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);

  const history = Array.isArray(parsed.data.history) ? parsed.data.history : [];
  const transcript = history
    .map((m) => {
      const role = m.role === "assistant" ? "Assistant" : "Customer";
      const content = String(m.content || "").trim();
      if (!content) return null;
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join("\n");

  const user = [
    transcript ? "Conversation:\n" + transcript : "",
    "Latest inbound SMS:",
    inbound,
    "\nWrite the SMS reply text only.",
  ]
    .filter(Boolean)
    .join("\n\n");

  let reply = "";
  try {
    const charged = await consumeCredits(ownerId, PORTAL_CREDIT_COSTS.aiCallStepGenerate);
    if (!charged.ok) {
      return NextResponse.json({ ok: false, error: "Insufficient credits" }, { status: 402 });
    }
    reply = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-5.4" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI request failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  return NextResponse.json({ ok: true, wouldReply: true, reply: normalizeSmsReply(reply) });
}
