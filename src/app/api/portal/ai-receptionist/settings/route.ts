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
  upsertAiReceptionistCallEvent,
} from "@/lib/aiReceptionist";
import { patchElevenLabsAgent, resolveElevenLabsConvaiToolIdsByKeys } from "@/lib/elevenLabsConvai";
import { normalizeEmailKey, normalizeNameKey, normalizePhoneKey } from "@/lib/portalContacts";
import { ensurePortalContactTagsReady, listContactTagsForContact } from "@/lib/portalContactTags";
import { ensurePortalContactsSchema } from "@/lib/portalContactsSchema";
import { getOwnerTwilioSmsConfig, getOwnerTwilioSmsConfigMasked } from "@/lib/portalTwilio";
import { webhookUrlFromRequest } from "@/lib/webhookBase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

function twilioBasicAuthHeader(cfg: { accountSid: string; authToken: string }): string {
  const basic = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
  return `Basic ${basic}`;
}

async function fetchTwilioCallStatus(ownerId: string, callSid: string): Promise<string | null> {
  const sid = String(callSid || "").trim();
  if (!sid) return null;

  const cfg = await getOwnerTwilioSmsConfig(ownerId).catch(() => null);
  if (!cfg) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Calls/${encodeURIComponent(sid)}.json`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(cfg) },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;

  try {
    const json = JSON.parse(text) as any;
    const status = typeof json?.status === "string" ? json.status.trim().toLowerCase() : "";
    return status || null;
  } catch {
    return null;
  }
}

function terminalStatusFromTwilio(callStatusRaw: unknown): "COMPLETED" | "FAILED" | null {
  const s = typeof callStatusRaw === "string" ? callStatusRaw.trim().toLowerCase() : "";
  if (!s) return null;
  if (s === "completed") return "COMPLETED";
  if (s === "failed" || s === "busy" || s === "no-answer" || s === "canceled") return "FAILED";
  return null;
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
  return id ? id : null;
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
  return key ? key : null;
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

async function upsertContactFromEvent(ownerId: string, input: { name: string; email: string | null; phone: string | null }) {
  const owner = String(ownerId);
  const name = String(input.name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!name) return null;

  const emailKey = input.email ? normalizeEmailKey(String(input.email)) : null;
  const email = emailKey ? String(input.email).trim().slice(0, 120) : null;

  const phoneNorm = normalizePhoneKey(String(input.phone ?? ""));
  if (phoneNorm.error) return null;
  const phoneKey = phoneNorm.phoneKey;
  const phone = phoneKey ? phoneNorm.phone : null;

  const ors: any[] = [];
  if (phoneKey) ors.push({ phoneKey });
  if (emailKey) ors.push({ emailKey });
  if (!ors.length) return null;

  const existing = await (prisma as any).portalContact.findFirst({
    where: { ownerId: owner, OR: ors },
    select: { id: true, name: true, emailKey: true, phoneKey: true },
  });

  if (existing) {
    const data: any = {};

    // Prefer a real name over placeholder-ish values.
    const existingName = String(existing.name ?? "").trim();
    const existingLooksLikePhone = existingName.startsWith("+") && existingName.length <= 18;
    if (name && (!existingName || existingLooksLikePhone)) {
      data.name = name;
      data.nameKey = normalizeNameKey(name);
    }

    if (!existing.emailKey && emailKey) {
      data.email = email;
      data.emailKey = emailKey;
    }

    if (!existing.phoneKey && phoneKey) {
      data.phone = phone;
      data.phoneKey = phoneKey;
    }

    if (Object.keys(data).length) {
      await (prisma as any).portalContact.update({ where: { id: existing.id }, data, select: { id: true } });
    }

    return String(existing.id);
  }

  const created = await (prisma as any).portalContact.create({
    data: {
      ownerId: owner,
      name,
      nameKey: normalizeNameKey(name),
      email,
      emailKey,
      phone,
      phoneKey,
    },
    select: { id: true },
  });

  return created?.id ? String(created.id) : null;
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

  // Outbound-style reconciliation: if any events are stuck IN_PROGRESS for >90s, ask Twilio and flip terminal.
  const initialEvents = await listAiReceptionistEvents(ownerId, 120);
  const now = Date.now();
  const toCheck = (initialEvents || [])
    .filter((e: any) => String(e?.status || "").trim().toUpperCase() === "IN_PROGRESS")
    .filter((e: any) => {
      const createdAt = typeof e?.createdAtIso === "string" ? Date.parse(e.createdAtIso) : NaN;
      return Number.isFinite(createdAt) ? now - createdAt > 90_000 : true;
    })
    .slice(0, 3);

  await Promise.all(
    toCheck.map(async (e: any) => {
      const tw = await fetchTwilioCallStatus(ownerId, String(e?.callSid || ""));
      const mapped = terminalStatusFromTwilio(tw);
      if (!mapped) return;
      await upsertAiReceptionistCallEvent(ownerId, {
        id: String(e?.id || `call_${String(e?.callSid || "")}`),
        callSid: String(e?.callSid || ""),
        from: String(e?.from || "Unknown"),
        to: typeof e?.to === "string" ? e.to : null,
        createdAtIso: String(e?.createdAtIso || new Date().toISOString()),
        status: mapped,
      } as any);
    }),
  ).catch(() => null);

  const events = await listAiReceptionistEvents(ownerId, 80);

  await ensurePortalContactsSchema().catch(() => null);
  await ensurePortalContactTagsReady().catch(() => null);

  const enrichedEvents = await Promise.all(
    (events || []).map(async (e: any) => {
      const from = String(e?.from ?? "").trim();
      const name = String(e?.contactName ?? "").trim() || from || "Caller";
      const email = typeof e?.contactEmail === "string" && e.contactEmail.trim() ? String(e.contactEmail).trim() : null;
      const phone =
        typeof e?.contactPhone === "string" && e.contactPhone.trim() ? String(e.contactPhone).trim() : from || null;

      let contactId: string | null = null;
      try {
        contactId = await upsertContactFromEvent(ownerId, { name, email, phone });
      } catch {
        contactId = null;
      }

      const contactTags = contactId ? await listContactTagsForContact(ownerId, contactId).catch(() => []) : [];
      return { ...e, contactId, contactTags };
    }),
  );

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
  const next = await setAiReceptionistSettings(ownerId, normalized);

  // Sync agent config (first message + prompt) to ElevenLabs at save-time.
  // Do not attempt per-call overrides during the Twilio webhook.
  const profileAgentId = await getProfileVoiceAgentId(ownerId).catch(() => null);
  const agentId = String(next.voiceAgentId || "").trim() || String(profileAgentId || "").trim();
  const apiKeyFromProfile = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";
  const apiKeyLegacy = typeof (next as any)?.voiceAgentApiKey === "string" ? String((next as any).voiceAgentApiKey).trim() : "";
  const apiKey = apiKeyFromProfile.trim() || apiKeyLegacy.trim();

  if (apiKey && agentId) {
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

    const patched = await patchElevenLabsAgent({
      apiKey,
      agentId,
      firstMessage: firstMessage || undefined,
      prompt: prompt || undefined,
      toolIds: toolIds.length ? toolIds : undefined,
    });

    if (!patched.ok) {
      await setAiReceptionistSettings(ownerId, current.settings).catch(() => null);
      return NextResponse.json({ ok: false, error: patched.error }, { status: patched.status || 502 });
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
