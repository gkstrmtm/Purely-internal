import { NextResponse } from "next/server";
import { z } from "zod";

import { generateText } from "@/lib/ai";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getBusinessProfileAiContext, getBusinessProfileTemplateVars } from "@/lib/businessProfileAiContext.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z
  .object({
    context: z.string().trim().max(4000).optional().or(z.literal("")),
  })
  .strict();

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

  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");
  const templateVars = await getBusinessProfileTemplateVars(ownerId).catch(() => ({} as Record<string, string>));
  const businessNameFallback = String(templateVars["businessName"] || templateVars["business.name"] || "")
    .trim()
    .slice(0, 120);

  const system = [
    "You write system prompts for an AI receptionist product.",
    "Return ONLY the system prompt text. No markdown. No JSON.",
    "The prompt is for INBOUND SMS auto-replies.",
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
    raw = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-4o-mini" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI request failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  const smsSystemPrompt = String(raw || "").trim().slice(0, 6000);
  if (!smsSystemPrompt) {
    return NextResponse.json({ ok: false, error: "Empty AI response" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, smsSystemPrompt });
}
