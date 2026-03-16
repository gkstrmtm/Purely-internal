import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { generateText } from "@/lib/ai";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { consumeCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

const postSchema = z.object({
  kind: z.enum(["calls", "messages"]),
  context: z.string().trim().min(3).max(4000),
});

const configSchema = z
  .object({
    firstMessage: z.string().trim().min(1).max(800).optional(),
    goal: z.string().trim().min(1).max(6000).optional(),
    personality: z.string().trim().min(1).max(6000).optional(),
    tone: z.string().trim().min(1).max(6000).optional(),
    environment: z.string().trim().min(1).max(6000).optional(),
    guardRails: z.string().trim().min(1).max(6000).optional(),
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

export async function POST(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const campaignId = idSchema.safeParse(params.campaignId);
  if (!campaignId.success) return NextResponse.json({ ok: false, error: "Invalid campaign id" }, { status: 400 });

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });

  await ensurePortalAiOutboundCallsSchema();

  const campaign = await prisma.portalAiOutboundCallCampaign.findFirst({
    where: { ownerId, id: campaignId.data },
    select: { id: true, name: true },
  });

  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const kind = parsed.data.kind;
  const context = parsed.data.context;
  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");

  const system = [
    "You generate compact agent configuration JSON for an outbound automation product.",
    "Return ONLY valid JSON. No markdown, no commentary.",
    "JSON keys: firstMessage, goal, personality, tone, environment, guardRails.",
    "Keep it practical and safe. Avoid spammy language.",
    "Use plain text; do not include code fences.",
  ].join("\n");

  const user = [
    `Campaign: ${campaign.name}`,
    businessContext ? businessContext : "",
    `Agent kind: ${kind === "calls" ? "phone calls" : "SMS/email messaging"}`,
    "Context:",
    context,
    "", 
    "Write an agent config JSON that will work well immediately.",
    "- firstMessage: one short opener message.",
    "- goal: what the agent is trying to accomplish.",
    "- personality/tone: how it should sound.",
    "- environment: assumptions about business + workflow.",
    "- guardRails: hard rules (opt-out handling, compliance, no hallucinations, be concise).",
  ].join("\n");

  let raw = "";
  try {
    const charged = await consumeCredits(ownerId, PORTAL_CREDIT_COSTS.aiCallStepGenerate);
    if (!charged.ok) {
      return NextResponse.json({ ok: false, error: "Insufficient credits" }, { status: 402 });
    }
    raw = await generateText({ system, user, model: process.env.AI_MODEL ?? "gpt-4o-mini" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI request failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  const extracted = extractFirstJsonObject(raw);
  const validated = configSchema.safeParse(extracted);

  if (validated.success) {
    return NextResponse.json({ ok: true, config: validated.data });
  }

  // Fallback: treat raw as a goal so the UI isn't blank.
  const fallbackGoal = String(raw || "").trim().slice(0, 6000);
  return NextResponse.json({
    ok: true,
    config: {
      goal: fallbackGoal || `${kind === "calls" ? "Call" : "Message"} contacts and move them toward a booked appointment.`,
    },
    warning: "AI response was not valid JSON; returned a fallback goal.",
  });
}
