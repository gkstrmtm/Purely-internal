import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { getAiReceptionistServiceData, setAiReceptionistSettings } from "@/lib/aiReceptionist";
import {
  createElevenLabsKnowledgeBaseFile,
  patchElevenLabsAgent,
  type KnowledgeBaseLocator,
} from "@/lib/elevenLabsConvai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

function parseKnowledgeBase(raw: unknown): {
  version: 1;
  seedUrl: string;
  crawlDepth: number;
  maxUrls: number;
  text: string;
  locators: KnowledgeBaseLocator[];
} {
  const rec = safeRecord(raw);
  const seedUrl = typeof rec.seedUrl === "string" ? normalizeUrl(rec.seedUrl.trim().slice(0, 500)) : "";
  const crawlDepth =
    typeof rec.crawlDepth === "number" && Number.isFinite(rec.crawlDepth)
      ? Math.max(0, Math.min(5, Math.floor(rec.crawlDepth)))
      : 0;
  const maxUrls =
    typeof rec.maxUrls === "number" && Number.isFinite(rec.maxUrls) ? Math.max(0, Math.min(1000, Math.floor(rec.maxUrls))) : 0;
  const text = typeof rec.text === "string" ? rec.text.trim().slice(0, 20000) : "";

  const locatorsRaw = Array.isArray(rec.locators) ? rec.locators : [];
  const locators: KnowledgeBaseLocator[] = [];
  for (const x of locatorsRaw) {
    const xr = safeRecord(x);
    const id = typeof xr.id === "string" ? xr.id.trim().slice(0, 200) : "";
    const name = typeof xr.name === "string" ? xr.name.trim().slice(0, 200) : "";
    const typeRaw = typeof xr.type === "string" ? xr.type.trim().toLowerCase() : "";
    const type = typeRaw === "file" || typeRaw === "url" || typeRaw === "text" || typeRaw === "folder" ? (typeRaw as any) : null;
    const usageRaw = typeof xr.usage_mode === "string" ? xr.usage_mode.trim().toLowerCase() : "";
    const usage_mode = usageRaw === "prompt" ? "prompt" : usageRaw === "auto" ? "auto" : undefined;
    if (!id || !name || !type) continue;
    locators.push({ id, name, type, ...(usage_mode ? { usage_mode } : {}) });
    if (locators.length >= 120) break;
  }

  return { version: 1, seedUrl, crawlDepth, maxUrls, text, locators };
}

function parseKnowledgeBaseFromFormValue(value: FormDataEntryValue | null): unknown {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("aiReceptionist", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
  }

  const fileName = (file.name || "document").slice(0, 200);

  const current = await getAiReceptionistServiceData(ownerId);

  const apiKeyFromProfile = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";
  const apiKeyLegacy = current.settings.voiceAgentApiKey?.trim() || "";
  const apiKey = (apiKeyFromProfile.trim() || apiKeyLegacy.trim()).trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing voice agent API key. Set it in Profile first." },
      { status: 400 },
    );
  }

  const storedKb = parseKnowledgeBase((current.settings as any).smsKnowledgeBase);
  const inputKbRaw = parseKnowledgeBaseFromFormValue(form.get("knowledgeBase"));
  const inputKb = inputKbRaw ? parseKnowledgeBase(inputKbRaw) : storedKb;

  const created = await createElevenLabsKnowledgeBaseFile({
    apiKey,
    file,
    name: `AI Receptionist - SMS - ${fileName}`.slice(0, 200),
  }).catch((e) => ({ ok: false as const, error: String(e || "File upload failed") }));

  if ((created as any).ok !== true) {
    return NextResponse.json({ ok: false, error: String((created as any).error || "Upload failed") }, { status: 500 });
  }

  const nextLocators = dedupeLocators([...(storedKb.locators || []), (created as any).doc]);

  const nextKb = {
    ...storedKb,
    ...inputKb,
    locators: nextLocators,
    updatedAtIso: new Date().toISOString(),
  };

  const nextSettings = await setAiReceptionistSettings(ownerId, { ...current.settings, smsKnowledgeBase: nextKb as any });

  const applied: { sms?: boolean } = {};
  const manualChatAgentId = String(nextSettings.manualChatAgentId || "").trim();
  const agentId = String(nextSettings.chatAgentId || "").trim();

  if (agentId && !manualChatAgentId) {
    const r = await patchElevenLabsAgent({ apiKey, agentId, knowledgeBase: nextLocators }).catch(() => null);
    applied.sms = Boolean(r && (r as any).ok === true);
  }

  return NextResponse.json({ ok: true, locator: (created as any).doc, locators: nextLocators, applied });
}
