import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import {
  createElevenLabsKnowledgeBaseText,
  createElevenLabsKnowledgeBaseUrl,
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
  const crawlDepth = typeof rec.crawlDepth === "number" && Number.isFinite(rec.crawlDepth) ? Math.max(0, Math.min(3, Math.floor(rec.crawlDepth))) : 0;
  const maxUrls = typeof rec.maxUrls === "number" && Number.isFinite(rec.maxUrls) ? Math.max(0, Math.min(100, Math.floor(rec.maxUrls))) : 0;
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

function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const re = /href\s*=\s*("([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = (m[2] || m[3] || m[4] || "").trim();
    if (!raw) continue;
    if (raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;

    try {
      const u = new URL(raw, baseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      u.hash = "";
      out.push(u.toString());
      if (out.length >= 400) break;
    } catch {
      // ignore
    }
  }

  return out;
}

async function fetchHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "PurelyAutomationKnowledgeBaseCrawler/1.0",
      },
      signal: ctrl.signal,
    });

    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok) return "";
    if (contentType && !contentType.includes("text/html")) return "";

    const text = await res.text().catch(() => "");
    return text.slice(0, 900_000);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

async function crawlSite(seedUrl: string, depth: number, maxUrls: number): Promise<string[]> {
  const seed = normalizeUrl(seedUrl);
  if (!seed) return [];

  const seedParsed = new URL(seed);
  const allowedHost = seedParsed.host;

  const q: Array<{ url: string; d: number }> = [{ url: seed, d: 0 }];
  const seen = new Set<string>();
  const result: string[] = [];

  while (q.length && result.length < maxUrls) {
    const item = q.shift()!;
    const u = normalizeUrl(item.url);
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);

    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      continue;
    }

    if (parsed.host !== allowedHost) continue;

    result.push(u);

    if (item.d >= depth) continue;

    const html = await fetchHtml(u);
    if (!html) continue;

    const links = extractLinksFromHtml(html, u)
      .map((x) => normalizeUrl(x))
      .filter(Boolean);

    for (const link of links) {
      if (result.length + q.length >= maxUrls * 3) break;
      if (seen.has(link)) continue;
      try {
        const p = new URL(link);
        if (p.host !== allowedHost) continue;
        q.push({ url: link, d: item.d + 1 });
      } catch {
        // ignore
      }
    }
  }

  return result.slice(0, maxUrls);
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

  // Body is optional; we currently sync using the persisted campaign config.
  await req.json().catch(() => null);

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

  const kb = parseKnowledgeBase((campaign as any).knowledgeBaseJson);

  const keep = kb.locators.filter((l) => l.type === "file");
  const nextDocs: KnowledgeBaseLocator[] = [];
  const errors: string[] = [];

  if (kb.text.trim()) {
    const create = await createElevenLabsKnowledgeBaseText({
      apiKey,
      text: kb.text,
      name: `Campaign: ${campaign.name} - Notes`.slice(0, 200),
    }).catch((e) => ({ ok: false as const, error: String(e || "Text document create failed") }));

    if ((create as any).ok === true) {
      nextDocs.push((create as any).doc);
    } else {
      errors.push(String((create as any).error || "Failed to create notes document").slice(0, 200));
    }
  }

  const maxUrls = Math.max(0, Math.min(100, Math.floor(kb.maxUrls || 0)));
  if (kb.seedUrl && maxUrls > 0) {
    const discovered = await crawlSite(kb.seedUrl, kb.crawlDepth, maxUrls).catch(() => []);

    for (const u of discovered) {
      const name = (() => {
        try {
          const parsed = new URL(u);
          const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
          return `${parsed.host}${path}`.slice(0, 200);
        } catch {
          return u.slice(0, 200);
        }
      })();

      const created = await createElevenLabsKnowledgeBaseUrl({
        apiKey,
        url: u,
        name,
        enableAutoSync: true,
      }).catch((e) => ({ ok: false as const, error: String(e || "URL document create failed") }));

      if ((created as any).ok === true) {
        nextDocs.push((created as any).doc);
      } else {
        errors.push(String((created as any).error || "Failed to create URL document").slice(0, 200));
      }

      if (nextDocs.length >= 120) break;
    }
  }

  const nextLocators = dedupeLocators([...keep, ...nextDocs]);

  const nextKb = {
    ...kb,
    locators: nextLocators,
    lastSyncedAtIso: new Date().toISOString(),
    ...(errors.length ? { lastSyncError: errors.slice(0, 5).join(" | ").slice(0, 800) } : { lastSyncError: "" }),
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

  return NextResponse.json({
    ok: true,
    locators: nextLocators,
    applied,
    errors: errors.slice(0, 10),
  });
}
