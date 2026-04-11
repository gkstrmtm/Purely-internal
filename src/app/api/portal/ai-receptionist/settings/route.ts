import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import {
  getAiReceptionistServiceData,
  getOwnerProfilePhoneE164,
  listAiReceptionistEvents,
  parseAiReceptionistSettings,
  regenerateAiReceptionistWebhookToken,
  setAiReceptionistSettings,
  toPublicSettings,
} from "@/lib/aiReceptionist";
import {
  createElevenLabsAgent,
  patchElevenLabsAgent,
  resolveElevenLabsConvaiToolIdsByKeys,
  type KnowledgeBaseLocator,
} from "@/lib/elevenLabsConvai";
import { getOwnerTwilioSmsConfig, getOwnerTwilioSmsConfigMasked } from "@/lib/portalTwilio";
import { webhookUrlFromRequest } from "@/lib/webhookBase";

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

function envVoiceAgentId(): string {
  return envFirst(["VOICE_AGENT_ID", "ELEVENLABS_AGENT_ID", "ELEVEN_LABS_AGENT_ID"]).slice(0, 120);
}

function envVoiceAgentApiKey(): string {
  return envFirst(["VOICE_AGENT_API_KEY", "ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"]).slice(0, 400);
}

function twilioBasicAuthHeader(cfg: { accountSid: string; authToken: string }): string {
  const basic = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
  return `Basic ${basic}`;
}

async function fetchIncomingPhoneNumberSid(cfg: { accountSid: string; authToken: string }, phoneE164: string): Promise<string | null> {
  const phone = String(phoneE164 || "").trim();
  if (!phone) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phone)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(cfg) },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;

  try {
    const json = JSON.parse(text) as any;
    const xs = Array.isArray(json?.incoming_phone_numbers) ? json.incoming_phone_numbers : [];
    for (const x of xs) {
      const sid = typeof x?.sid === "string" ? x.sid.trim() : "";
      if (sid) return sid;
    }
    return null;
  } catch {
    return null;
  }
}

async function ensureTwilioVoiceAndStatusCallbacks(opts: { ownerId: string; req: Request }): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const cfg = await getOwnerTwilioSmsConfig(opts.ownerId).catch(() => null);
  if (!cfg) return { ok: false, error: "Twilio is not configured for this account.", status: 400 };

  const phoneSid = await fetchIncomingPhoneNumberSid(cfg, cfg.fromNumberE164);
  if (!phoneSid) {
    return {
      ok: false,
      error: `Unable to find Twilio Incoming Phone Number for ${cfg.fromNumberE164}.`,
      status: 502,
    };
  }

  const voiceUrl = webhookUrlFromRequest(opts.req, "/api/public/twilio/voice");
  const statusCallbackUrl = webhookUrlFromRequest(opts.req, "/api/public/twilio/call-status");

  const updateUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/IncomingPhoneNumbers/${encodeURIComponent(phoneSid)}.json`;
  const form = new URLSearchParams();
  form.set("VoiceUrl", voiceUrl);
  form.set("VoiceMethod", "POST");
  form.set("StatusCallback", statusCallbackUrl);
  form.set("StatusCallbackMethod", "POST");

  const res = await fetch(updateUrl, {
    method: "POST",
    headers: {
      authorization: twilioBasicAuthHeader(cfg),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null as any);

  if (!res?.ok) {
    const text = res ? await res.text().catch(() => "") : "";
    return { ok: false, error: `Twilio update failed (${res?.status || "no response"}): ${String(text || "").slice(0, 240)}`, status: res?.status || 502 };
  }

  return { ok: true };
}

async function getProfileVoiceAgentId(ownerId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const raw = rec?.voiceAgentId;
  const id = typeof raw === "string" ? raw.trim().slice(0, 120) : "";
  return id || envVoiceAgentId() || null;
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

async function getProfileVoiceAgentToolIds(ownerId: string, toolKeys: string[]): Promise<string[]> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const toolIds = rec?.voiceAgentToolIds;
  if (!toolIds || typeof toolIds !== "object" || Array.isArray(toolIds)) return [];

  const raw = toolKeys
    .map((k) => String(k || "").trim().toLowerCase())
    .filter(Boolean)
    .flatMap((k) => {
      const xs = Array.isArray((toolIds as any)[k]) ? (toolIds as any)[k] : [];
      return xs;
    });

  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 50);
}

function buildReceptionistAgentPrompt(opts: {
  systemPrompt: string;
  aiCanTransferToHuman: boolean;
  transferTo: string | null;
}): string {
  let prompt = String(opts.systemPrompt || "").trim();
  if (opts.aiCanTransferToHuman) {
    if (opts.transferTo) {
      const extra = `\n\nIf the caller asks for a human or the situation requires it, transfer the call to ${opts.transferTo}. Use the call transfer tool when appropriate.`;
      prompt = `${prompt}${extra}`.trim();
    } else {
      const extra = "\n\nIf the caller asks for a human, explain that call transfer isn’t configured and offer to take a message.";
      prompt = `${prompt}${extra}`.trim();
    }
  }

  return prompt.slice(0, 6000);
}

function normalizeKnowledgeBaseLocators(raw: unknown): KnowledgeBaseLocator[] {
  const xs = Array.isArray(raw) ? raw : [];
  const out: KnowledgeBaseLocator[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const r = x as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim().slice(0, 200) : "";
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 200) : "";
    const typeRaw = typeof r.type === "string" ? r.type.trim().toLowerCase() : "";
    const type =
      typeRaw === "file" || typeRaw === "url" || typeRaw === "text" || typeRaw === "folder" ? (typeRaw as any) : null;
    const usageRaw = typeof (r as any).usage_mode === "string" ? String((r as any).usage_mode).trim().toLowerCase() : "";
    const usage_mode = usageRaw === "prompt" ? "prompt" : usageRaw === "auto" ? "auto" : undefined;
    if (!id || !name || !type) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, type, ...(usage_mode ? { usage_mode } : {}) });
    if (out.length >= 120) break;
  }
  return out;
}

function knowledgeBaseLocatorsFromSettings(settings: any, field: "voiceKnowledgeBase" | "smsKnowledgeBase"): KnowledgeBaseLocator[] {
  const kb = settings && typeof settings === "object" ? (settings as any)[field] : null;
  const loc = kb && typeof kb === "object" && !Array.isArray(kb) ? (kb as any).locators : null;
  return normalizeKnowledgeBaseLocators(loc);
}

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("aiReceptionist");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  let data = await getAiReceptionistServiceData(ownerId);

  // Best-effort: if the receptionist business name is blank, initialize it from the Business Profile.
  // This keeps onboarding/profile flows from requiring a second manual entry.
  if (!String(data.settings.businessName || "").trim()) {
    const profile = await prisma.businessProfile
      .findUnique({ where: { ownerId }, select: { businessName: true } })
      .catch(() => null);
    const profileName = typeof profile?.businessName === "string" ? profile.businessName.trim() : "";
    if (profileName) {
      try {
        const next = await setAiReceptionistSettings(ownerId, { ...data.settings, businessName: profileName });
        data = { ...data, settings: next };
      } catch {
        // ignore
      }
    }
  }

  const events = await listAiReceptionistEvents(ownerId, 80);
  const enrichedEvents = (events || []).map((event: any) => ({
    ...event,
    contactId: typeof event?.contactId === "string" ? event.contactId : null,
    contactTags: Array.isArray(event?.contactTags) ? event.contactTags : [],
  }));

  const webhookUrl = webhookUrlFromRequest(req, "/api/public/twilio/voice");
  const webhookUrlLegacy = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-receptionist/${data.settings.webhookToken}/voice`,
  );

  const twilio = await getOwnerTwilioSmsConfigMasked(ownerId).catch(() => null);

  return NextResponse.json({
    ok: true,
    settings: toPublicSettings(data.settings),
    events: enrichedEvents,
    webhookUrl,
    webhookUrlLegacy,
    twilioConfigured: Boolean(twilio?.configured),
    twilio: twilio ?? undefined,
    notes: {
      startupChecklist: [
        "No manual Twilio paste required when Twilio is configured.",
        "On save, this portal attempts to auto-configure your Twilio number Voice URL + Status Callback.",
      ],
    },
  });
}

const putSchema = z.object({
  settings: z.unknown().optional(),
  regenerateToken: z.boolean().optional(),
  clearVoiceAgentKey: z.boolean().optional(),
  clearElevenLabsKey: z.boolean().optional(),
  syncChatAgent: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("aiReceptionist");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (parsed.data.regenerateToken) {
    const next = await regenerateAiReceptionistWebhookToken(ownerId);
    const events = await listAiReceptionistEvents(ownerId, 80);
    const webhookUrl = webhookUrlFromRequest(req, "/api/public/twilio/voice");
    const webhookUrlLegacy = webhookUrlFromRequest(req, `/api/public/twilio/ai-receptionist/${next.webhookToken}/voice`);
    return NextResponse.json({ ok: true, settings: toPublicSettings(next), events, webhookUrl, webhookUrlLegacy });
  }

  const current = await getAiReceptionistServiceData(ownerId);
  const rawSettings = parsed.data.settings ?? {};

  // Preserve secrets unless explicitly cleared or replaced.
  const rawRec = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
    ? (rawSettings as Record<string, unknown>)
    : {};

  if (parsed.data.clearVoiceAgentKey || parsed.data.clearElevenLabsKey) {
    rawRec.voiceAgentApiKey = "";
    // Legacy key name kept for older stored payloads.
    rawRec.elevenLabsApiKey = "";
  }

  const normalized = parseAiReceptionistSettings(rawRec, current.settings);
  let next = await setAiReceptionistSettings(ownerId, normalized);

  // Manual override: if the user supplied an agent id (typically from support),
  // use it as-is as the target agent ID. (We still allow syncing prompt/tools/voice to that agent.)
  const manualAgentId = String((next as any).manualAgentId || "").trim().slice(0, 120);
  if (manualAgentId && String(next.voiceAgentId || "").trim() !== manualAgentId) {
    try {
      next = await setAiReceptionistSettings(ownerId, { ...next, voiceAgentId: manualAgentId });
    } catch {
      await setAiReceptionistSettings(ownerId, current.settings).catch(() => null);
      return NextResponse.json({ ok: false, error: "Failed to persist agent ID" }, { status: 500 });
    }
  }

  // Manual override for messaging/SMS agent: use as-is as the target messaging agent ID.
  const manualChatAgentId = String((next as any).manualChatAgentId || "").trim().slice(0, 120);
  if (manualChatAgentId && String(next.chatAgentId || "").trim() !== manualChatAgentId) {
    try {
      next = await setAiReceptionistSettings(ownerId, { ...next, chatAgentId: manualChatAgentId });
    } catch {
      await setAiReceptionistSettings(ownerId, current.settings).catch(() => null);
      return NextResponse.json({ ok: false, error: "Failed to persist messaging agent ID" }, { status: 500 });
    }
  }

  // Sync agent config (first message + prompt) to ElevenLabs at save-time.
  // Do not attempt per-call overrides during the Twilio webhook.
  const profileAgentId = await getProfileVoiceAgentId(ownerId).catch(() => null);
  let agentId = String(next.voiceAgentId || "").trim() || String(profileAgentId || "").trim();
  const apiKeyFromProfile = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";
  const apiKeyLegacy = typeof (next as any)?.voiceAgentApiKey === "string" ? String((next as any).voiceAgentApiKey).trim() : "";
  const apiKey = apiKeyFromProfile.trim() || apiKeyLegacy.trim();

  if (apiKey) {
    const profilePhone = await getOwnerProfilePhoneE164(ownerId).catch(() => null);
    const transferTo = (next.aiCanTransferToHuman ? (next.forwardToPhoneE164 || profilePhone) : null) || null;

    const prompt = buildReceptionistAgentPrompt({
      systemPrompt: next.systemPrompt,
      aiCanTransferToHuman: next.aiCanTransferToHuman,
      transferTo,
    });

    const firstMessage = String(next.greeting || "").trim().slice(0, 360);

    const transferToolKeys = ["transfer_to_human", "transfer_to_number", "call_transfer", "end_call"];
    let toolIds: string[] = next.aiCanTransferToHuman
      ? await getProfileVoiceAgentToolIds(ownerId, transferToolKeys).catch(() => [])
      : [];

    if (next.aiCanTransferToHuman && !toolIds.length) {
      const resolved = await resolveElevenLabsConvaiToolIdsByKeys({ apiKey, toolKeys: transferToolKeys }).catch(() => null);
      if (resolved && (resolved as any).ok === true) {
        const map = (resolved as any).toolIds as Record<string, string[]>;
        toolIds = transferToolKeys
          .flatMap((k) => (Array.isArray((map as any)[k]) ? (map as any)[k] : []))
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 50);
      }
    }

    if (!agentId) {
      const businessName = String(next.businessName || "").trim();
      const name = (businessName ? `${businessName}: AI Receptionist (Calls)` : "AI Receptionist (Calls)").slice(0, 160);
      const created = await createElevenLabsAgent({
        apiKey,
        name,
        firstMessage: firstMessage || undefined,
        prompt: prompt || undefined,
        toolIds: toolIds.length ? toolIds : undefined,
        voiceId: String((next as any).voiceId || "").trim() || undefined,
        knowledgeBase: (() => {
          const loc = knowledgeBaseLocatorsFromSettings(next as any, "voiceKnowledgeBase");
          return loc.length ? loc : undefined;
        })(),
      });

      if (!created.ok) {
        await setAiReceptionistSettings(ownerId, current.settings).catch(() => null);
        return NextResponse.json({ ok: false, error: created.error }, { status: created.status || 502 });
      }

      agentId = created.agentId;
      try {
        next = await setAiReceptionistSettings(ownerId, { ...next, voiceAgentId: agentId });
      } catch {
        await setAiReceptionistSettings(ownerId, current.settings).catch(() => null);
        return NextResponse.json({ ok: false, error: "Failed to persist voice agent ID" }, { status: 500 });
      }
    }

    if (agentId) {
      const patched = await patchElevenLabsAgent({
        apiKey,
        agentId,
        firstMessage: firstMessage || undefined,
        prompt: prompt || undefined,
        toolIds: toolIds.length ? toolIds : undefined,
        voiceId: String((next as any).voiceId || "").trim() || undefined,
        knowledgeBase: (() => {
          const loc = knowledgeBaseLocatorsFromSettings(next as any, "voiceKnowledgeBase");
          return loc.length ? loc : undefined;
        })(),
      });

      if (!patched.ok) {
        await setAiReceptionistSettings(ownerId, current.settings).catch(() => null);
        return NextResponse.json({ ok: false, error: patched.error }, { status: patched.status || 502 });
      }
    }
  }

  // Optional: sync (create/patch) messaging agent for SMS / chat experiences.
  // This must be explicitly requested because API keys may be shared.
  if (parsed.data.syncChatAgent) {
    if (!apiKey) {
      await setAiReceptionistSettings(ownerId, current.settings).catch(() => null);
      return NextResponse.json(
        { ok: false, error: "Missing API key." },
        { status: 400 },
      );
    }

    const smsPrompt = String(next.smsSystemPrompt || "").trim() || String(next.systemPrompt || "").trim();
    let chatAgentId = String(next.chatAgentId || "").trim();

    if (!chatAgentId) {
      const businessName = String(next.businessName || "").trim();
      const name = (businessName ? `${businessName}: AI Receptionist (SMS)` : "AI Receptionist (SMS)").slice(0, 160);
      const created = await createElevenLabsAgent({
        apiKey,
        name,
        prompt: smsPrompt || undefined,
        knowledgeBase: (() => {
          const loc = knowledgeBaseLocatorsFromSettings(next as any, "smsKnowledgeBase");
          return loc.length ? loc : undefined;
        })(),
      });

      if (!created.ok) {
        await setAiReceptionistSettings(ownerId, current.settings).catch(() => null);
        return NextResponse.json({ ok: false, error: created.error }, { status: created.status || 502 });
      }

      chatAgentId = created.agentId;
      try {
        next = await setAiReceptionistSettings(ownerId, { ...next, chatAgentId });
      } catch {
        await setAiReceptionistSettings(ownerId, current.settings).catch(() => null);
        return NextResponse.json({ ok: false, error: "Failed to persist messaging agent ID" }, { status: 500 });
      }
    } else {
      const patched = await patchElevenLabsAgent({
        apiKey,
        agentId: chatAgentId,
        prompt: smsPrompt || undefined,
        knowledgeBase: (() => {
          const loc = knowledgeBaseLocatorsFromSettings(next as any, "smsKnowledgeBase");
          return loc.length ? loc : undefined;
        })(),
      });

      if (!patched.ok) {
        await setAiReceptionistSettings(ownerId, current.settings).catch(() => null);
        return NextResponse.json({ ok: false, error: patched.error }, { status: patched.status || 502 });
      }
    }
  }

  // Mirror outbound: automatically configure Twilio callbacks so call completion is delivered to us.
  // This eliminates any manual console pasting for the receptionist.
  if (next.enabled) {
    const configured = await ensureTwilioVoiceAndStatusCallbacks({ ownerId, req });
    if (!configured.ok) {
      await setAiReceptionistSettings(ownerId, current.settings).catch(() => null);
      return NextResponse.json({ ok: false, error: configured.error }, { status: configured.status || 502 });
    }
  }

  const events = await listAiReceptionistEvents(ownerId, 80);
  const webhookUrl = webhookUrlFromRequest(req, "/api/public/twilio/voice");
  const webhookUrlLegacy = webhookUrlFromRequest(req, `/api/public/twilio/ai-receptionist/${next.webhookToken}/voice`);
  return NextResponse.json({ ok: true, settings: toPublicSettings(next), events, webhookUrl, webhookUrlLegacy });
}
