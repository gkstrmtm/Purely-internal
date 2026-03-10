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
    mode: z.enum(["AI", "FORWARD"]).optional(),
    aiCanTransferToHuman: z.boolean().optional(),
    forwardToPhoneE164: z.string().trim().max(60).nullable().optional(),
  })
  .strict();

const outSchema = z
  .object({
    businessName: z.string().trim().min(1).max(120).optional(),
    greeting: z.string().trim().min(1).max(360).optional(),
    systemPrompt: z.string().trim().min(1).max(6000).optional(),
  })
  .strict();

function extractFirstJsonObject(text: string): any | null {
  const s = String(text || "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;

  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
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

  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");
  const templateVars = await getBusinessProfileTemplateVars(ownerId).catch(() => ({} as Record<string, string>));
  const businessNameFallback = String(templateVars["businessName"] || templateVars["business.name"] || "")
    .trim()
    .slice(0, 120);

  const system = [
    "You generate AI receptionist settings JSON for a small-business phone answering product.",
    "Return ONLY valid JSON. No markdown, no commentary.",
    "JSON keys: businessName, greeting, systemPrompt.",
    "Do not invent facts. If something is unknown, omit it or keep it generic.",
    "Keep greeting friendly and short. Keep systemPrompt practical and safe.",
  ].join("\n");

  const user = [
    businessContext ? businessContext : "",
    "", 
    "Requested settings:",
    `- Mode: ${parsed.data.mode ?? "AI"}`,
    `- AI can transfer to human: ${parsed.data.aiCanTransferToHuman === true ? "yes" : "no"}`,
    parsed.data.forwardToPhoneE164 ? `- Transfer/forward number: ${parsed.data.forwardToPhoneE164}` : "",
    "", 
    parsed.data.context?.trim()
      ? [
          "Additional quick context from the user:",
          parsed.data.context.trim(),
        ].join("\n")
      : "",
    "", 
    "Write JSON with:",
    "- businessName: the business name (use Business Profile if present)",
    "- greeting: what the receptionist says first (1-2 sentences)",
    "- systemPrompt: concise instructions (include lead capture + booking help; avoid legal claims; never be creepy)",
  ]
    .filter(Boolean)
    .join("\n");

  let raw = "";
  try {
    raw = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-4o-mini" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI request failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  const extracted = extractFirstJsonObject(raw);
  const validated = outSchema.safeParse(extracted);

  if (validated.success) {
    const businessName = (validated.data.businessName || businessNameFallback || "").trim().slice(0, 120);
    const greeting = String(validated.data.greeting || "").trim().slice(0, 360);
    const systemPrompt = String(validated.data.systemPrompt || "").trim().slice(0, 6000);

    return NextResponse.json({
      ok: true,
      settings: {
        ...(businessName ? { businessName } : {}),
        ...(greeting ? { greeting } : {}),
        ...(systemPrompt ? { systemPrompt } : {}),
      },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      settings: {
        ...(businessNameFallback ? { businessName: businessNameFallback } : {}),
      },
      warning: "AI response was not valid JSON; returned a fallback business name only.",
    },
    { status: 200 },
  );
}
