import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { generateText } from "@/lib/ai";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { consumeCredits } from "@/lib/credits";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { buildOutboundMessagingSystemPrompt } from "@/lib/portalAiOutboundIntelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

const postSchema = z.object({
  channel: z.enum(["sms", "email"]),
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
});

function parseAgentConfig(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export async function POST(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls");
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
    select: { id: true, name: true, chatAgentConfigJson: true },
  });

  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const cfg = parseAgentConfig(campaign.chatAgentConfigJson);
  const businessContext = await getBusinessProfileAiContext(ownerId).catch(() => "");
  const system = [
    buildOutboundMessagingSystemPrompt(cfg, {
      channel: parsed.data.channel,
      campaignName: campaign.name,
      businessContext,
    }),
    businessContext,
  ]
    .filter(Boolean)
    .join("\n\n");

  const history = Array.isArray((parsed.data as any).history) ? ((parsed.data as any).history as any[]) : [];
  const transcript = history
    .map((m) => {
      const role = m?.role === "assistant" ? "Agent" : "Customer";
      const content = typeof m?.content === "string" ? m.content.trim() : "";
      if (!content) return null;
      return `${role}: ${content}`;
    })
    .filter(Boolean)
    .join("\n");

  const user = [
    `Campaign: ${campaign.name}`,
    "You are continuing a conversation with a customer.",
    transcript ? "Conversation so far:" : null,
    transcript || null,
    "",
    "Reply to the latest customer message below.",
    "Only output the reply text.",
    "",
    `Customer: ${parsed.data.inbound}`,
  ]
    .filter(Boolean)
    .join("\n");

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

  return NextResponse.json({ ok: true, reply: String(reply || "").trim().slice(0, 2000) });
}
