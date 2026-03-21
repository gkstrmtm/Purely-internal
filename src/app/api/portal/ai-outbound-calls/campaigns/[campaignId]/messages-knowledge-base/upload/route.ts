import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import {
  createElevenLabsKnowledgeBaseFile,
  patchElevenLabsAgent,
  type KnowledgeBaseLocator,
} from "@/lib/elevenLabsConvai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);
const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

function envFirst(keys: string[]): string {
  for (const key of keys) {
    const v = (process.env[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}

function envVoiceAgentApiKey(): string {
  return envFirst(["VOICE_AGENT_API_KEY", "ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"]).slice(0, 400);
}

async function getProfileVoiceAgentApiKey(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const raw = rec?.voiceAgentApiKey;
  const key = typeof raw === "string" ? raw.trim().slice(0, 400) : "";
  return key || envVoiceAgentApiKey() || null;
}

function safeRecord(raw: unknown): Record<string, any> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
}

function dedupeLocators(locators: KnowledgeBaseLocator[]): KnowledgeBaseLocator[] {
  const out: KnowledgeBaseLocator[] = [];
  const seen = new Set<string>();
  for (const l of locators) {
    const id = String(l.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(l);
    if (out.length >= 120) break;
  }
  return out;
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

  await ensurePortalAiOutboundCallsSchema();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
  }

  const fileName = (file.name || "document").slice(0, 200);

  const campaign = await prisma.portalAiOutboundCallCampaign.findFirst({
    where: { ownerId, id: campaignId.data },
    select: {
      id: true,
      name: true,
      chatAgentId: true,
      manualChatAgentId: true,
      chatKnowledgeBaseJson: true,
    },
  });

  if (!campaign) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const apiKeyFromProfile = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";
  const receptionist = await getAiReceptionistServiceData(ownerId).catch(() => null);
  const apiKeyLegacy = receptionist?.settings?.voiceAgentApiKey?.trim() || "";
  const apiKey = (apiKeyFromProfile.trim() || apiKeyLegacy.trim()).trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing voice agent API key. Set it in Profile first." },
      { status: 400 },
    );
  }

  const kbRec = safeRecord((campaign as any).chatKnowledgeBaseJson);
  const prevLocators = Array.isArray(kbRec.locators) ? (kbRec.locators as KnowledgeBaseLocator[]) : [];

  const created = await createElevenLabsKnowledgeBaseFile({
    apiKey,
    file,
    name: `Campaign: ${campaign.name} - ${fileName}`.slice(0, 200),
  }).catch((e) => ({ ok: false as const, error: String(e || "File upload failed") }));

  if ((created as any).ok !== true) {
    return NextResponse.json({ ok: false, error: String((created as any).error || "Upload failed") }, { status: 500 });
  }

  const nextLocators = dedupeLocators([...prevLocators, (created as any).doc]);

  const nextKb = {
    ...kbRec,
    version: 1,
    locators: nextLocators,
    updatedAtIso: new Date().toISOString(),
  };

  await prisma.portalAiOutboundCallCampaign.updateMany({
    where: { ownerId, id: campaign.id },
    data: { chatKnowledgeBaseJson: nextKb as any, updatedAt: new Date() },
  });

  const applied: { messages?: boolean } = {};

  const manualMessages = String((campaign as any).manualChatAgentId || "").trim();
  const chatAgentId = String((campaign as any).chatAgentId || "").trim();

  const agentIdToPatch = manualMessages || chatAgentId;
  if (agentIdToPatch) {
    const r = await patchElevenLabsAgent({ apiKey, agentId: agentIdToPatch, knowledgeBase: nextLocators }).catch(() => null);
    applied.messages = Boolean(r && (r as any).ok === true);
  }

  return NextResponse.json({ ok: true, locator: (created as any).doc, locators: nextLocators, applied });
}
