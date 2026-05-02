import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { buildAiReceptionistSmsConversationContext, buildAiReceptionistSmsSystemPrompt, buildAiReceptionistSmsUserPrompt, getAiReceptionistServiceData, normalizeAiReceptionistSmsReplyText, tryBuildAiReceptionistDeterministicSmsReply } from "@/lib/aiReceptionist";
import { generateText } from "@/lib/ai";
import { consumeCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { resolvePuraAiModel } from "@/lib/puraAi";

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

function isAbortLikeError(error: unknown): boolean {
  if (!error) return false;
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }
  const message = error instanceof Error ? error.message : String(error);
  return /abort|timed out|timeout/i.test(message);
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

  const conversation = buildAiReceptionistSmsConversationContext({
    inbound,
    historyTurns: history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "customer", content: m.content })),
  });

  const deterministicReply = await tryBuildAiReceptionistDeterministicSmsReply({ ownerId, inbound, historyText: transcript, settings: s });
  if (deterministicReply) {
    return NextResponse.json({ ok: true, wouldReply: true, reply: deterministicReply });
  }

  const system = await buildAiReceptionistSmsSystemPrompt({ ownerId, settings: s, conversationContext: conversation.context });

  const user = buildAiReceptionistSmsUserPrompt({
    inbound,
    conversationContext: conversation.context,
    transcript: conversation.transcript,
  });

  const hasPriorConversation = conversation.hasPriorConversation;
  let reply = "";
  try {
    const charged = await consumeCredits(ownerId, PORTAL_CREDIT_COSTS.aiCallStepGenerate);
    if (!charged.ok) {
      return NextResponse.json({ ok: false, error: "Insufficient credits" }, { status: 402 });
    }
    const timeoutSignal = AbortSignal.timeout(9000);
    reply = await generateText({
      system,
      user,
      model:
        String(process.env.AI_RECEPTIONIST_SMS_PREVIEW_MODEL || "").trim() ||
        resolvePuraAiModel("fast") ||
        process.env.AI_MODEL ||
        "gpt-5.4",
      temperature: 0.35,
      signal: timeoutSignal,
    });
  } catch (e) {
    if (isAbortLikeError(e)) {
      return NextResponse.json({ ok: false, error: "Preview timed out. Try again." }, { status: 504 });
    }
    const msg = e instanceof Error ? e.message : "AI request failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  return NextResponse.json({ ok: true, wouldReply: true, reply: normalizeAiReceptionistSmsReplyText({ raw: reply, hasPriorConversation, maxLen: 1200 }) });
}
