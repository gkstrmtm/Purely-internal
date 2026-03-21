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

  const campaign = await prisma.portalAiOutboundCallCampaign.findFirst({
    where: { ownerId, id: campaignId.data },
    select: {
      id: true,
      name: true,
      voiceAgentId: true,
      manualVoiceAgentId: true,
      chatAgentId: true,
      manualChatAgentId: true,
      knowledgeBaseJson: true,
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

  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ ok: false, error: "Invalid form data" }, { status: 400 });

  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
  }

  const nameRaw = fd.get("name");
  const name = typeof nameRaw === "string" ? nameRaw.trim().slice(0, 200) : "";

  const created = await createElevenLabsKnowledgeBaseFile({
    apiKey,
    file,
    name: name || undefined,
  });

  if (!created.ok) {
    return NextResponse.json({ ok: false, error: created.error }, { status: created.status || 502 });
  }

  const kbRec = safeRecord((campaign as any).knowledgeBaseJson);
  const existingLocators = Array.isArray(kbRec.locators) ? (kbRec.locators as any[]) : [];
  const locators: KnowledgeBaseLocator[] = [];
  for (const x of existingLocators) {
    const xr = safeRecord(x);
    const id = typeof xr.id === "string" ? xr.id.trim().slice(0, 200) : "";
    const nm = typeof xr.name === "string" ? xr.name.trim().slice(0, 200) : "";
    const typeRaw = typeof xr.type === "string" ? xr.type.trim().toLowerCase() : "";
    const type = typeRaw === "file" || typeRaw === "url" || typeRaw === "text" || typeRaw === "folder" ? (typeRaw as any) : null;
    const usageRaw = typeof xr.usage_mode === "string" ? xr.usage_mode.trim().toLowerCase() : "";
    const usage_mode = usageRaw === "prompt" ? "prompt" : usageRaw === "auto" ? "auto" : undefined;
    if (!id || !nm || !type) continue;
    locators.push({ id, name: nm, type, ...(usage_mode ? { usage_mode } : {}) });
    if (locators.length >= 120) break;
  }

  const nextLocators = dedupeLocators([...locators, created.doc]);

  const nextKb = {
    version: 1,
    seedUrl: typeof kbRec.seedUrl === "string" ? String(kbRec.seedUrl).trim().slice(0, 500) : "",
    crawlDepth: typeof kbRec.crawlDepth === "number" && Number.isFinite(kbRec.crawlDepth) ? Math.max(0, Math.min(3, Math.floor(kbRec.crawlDepth))) : 0,
    maxUrls: typeof kbRec.maxUrls === "number" && Number.isFinite(kbRec.maxUrls) ? Math.max(0, Math.min(100, Math.floor(kbRec.maxUrls))) : 0,
    text: typeof kbRec.text === "string" ? String(kbRec.text).trim().slice(0, 20000) : "",
    locators: nextLocators,
    updatedAtIso: new Date().toISOString(),
  };

  await prisma.portalAiOutboundCallCampaign.updateMany({
    where: { ownerId, id: campaign.id },
    data: { knowledgeBaseJson: nextKb as any, updatedAt: new Date() },
  });

  const applied: { voice?: boolean; messages?: boolean } = {};

  const manualVoice = String((campaign as any).manualVoiceAgentId || "").trim();
  const manualMessages = String((campaign as any).manualChatAgentId || "").trim();

  const voiceAgentId = String((campaign as any).voiceAgentId || "").trim();
  const chatAgentId = String((campaign as any).chatAgentId || "").trim();

  if (voiceAgentId && !manualVoice) {
    const r = await patchElevenLabsAgent({ apiKey, agentId: voiceAgentId, knowledgeBase: nextLocators }).catch(() => null);
    applied.voice = Boolean(r && (r as any).ok === true);
  }

  if (chatAgentId && !manualMessages) {
    const r = await patchElevenLabsAgent({ apiKey, agentId: chatAgentId, knowledgeBase: nextLocators }).catch(() => null);
    applied.messages = Boolean(r && (r as any).ok === true);
  }

  return NextResponse.json({ ok: true, locator: created.doc, locators: nextLocators, applied });
}
