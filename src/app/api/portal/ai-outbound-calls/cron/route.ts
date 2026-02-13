import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { consumeCredits } from "@/lib/credits";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { normalizePhoneStrict } from "@/lib/phone";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { renderCampaignScript } from "@/lib/portalAiOutboundCalls";
import { placeElevenLabsTwilioOutboundCall, resolveElevenLabsAgentPhoneNumberId } from "@/lib/elevenLabsConvai";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

type TwilioCall = {
  status: string;
  durationSec: number | null;
};

async function fetchTwilioCall(ownerId: string, callSid: string): Promise<{ ok: true; call: TwilioCall } | { ok: false; error: string }> {
  const sid = String(callSid || "").trim();
  if (!sid) return { ok: false, error: "Missing callSid" };

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return { ok: false, error: "Twilio is not configured" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls/${encodeURIComponent(sid)}.json`;
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: `Basic ${basic}` },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return { ok: false, error: `Twilio failed (${res.status}): ${text.slice(0, 200)}` };
  }

  try {
    const json = JSON.parse(text) as any;
    const status = typeof json?.status === "string" ? json.status : "";
    const durationRaw = json?.duration;
    const durationNum = typeof durationRaw === "number" ? durationRaw : typeof durationRaw === "string" ? Number(durationRaw) : NaN;
    const durationSec = Number.isFinite(durationNum) ? Math.max(0, Math.floor(durationNum)) : null;
    return { ok: true, call: { status, durationSec } };
  } catch {
    return { ok: true, call: { status: "", durationSec: null } };
  }
}

function startedMinutesFromSeconds(durationSec: number | null) {
  const s = typeof durationSec === "number" && Number.isFinite(durationSec) ? Math.max(0, Math.floor(durationSec)) : 0;
  if (s <= 0) return 0;
  return Math.ceil(s / 60);
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

function checkAuth(req: Request) {
  const isVercelCron = isVercelCronRequest(req);
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.AI_OUTBOUND_CALLS_CRON_SECRET;
  if (isProd && !secret && !isVercelCron) {
    return { ok: false as const, status: 503 as const, error: "Missing AI_OUTBOUND_CALLS_CRON_SECRET" };
  }
  if (!secret) return { ok: true as const, status: 200 as const };

  if (!isVercelCron) {
    const provided = readCronAuthValue(req, {
      headerNames: ["x-ai-outbound-calls-cron-secret"],
      queryParamNames: ["secret"],
      allowBearer: true,
    });
    if (provided !== secret) return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }

  return { ok: true as const, status: 200 as const };
}

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  await ensurePortalAiOutboundCallsSchema();

  const now = new Date();

  // 1) Settle any in-flight calls by checking Twilio for completion + duration.
  const calling = await prisma.portalAiOutboundCallEnrollment.findMany({
    where: {
      status: "CALLING",
      callSid: { not: null },
      OR: [{ nextCallAt: null }, { nextCallAt: { lte: now } }],
    },
    select: {
      id: true,
      ownerId: true,
      callSid: true,
    },
    orderBy: [{ nextCallAt: "asc" }, { id: "asc" }],
    take: 60,
  });

  for (const c of calling) {
    const callSid = String(c.callSid || "").trim();
    if (!callSid) continue;

    const tw = await fetchTwilioCall(c.ownerId, callSid);
    if (!tw.ok) {
      await prisma.portalAiOutboundCallEnrollment.update({
        where: { id: c.id },
        data: {
          lastError: tw.error.slice(0, 500),
          nextCallAt: new Date(now.getTime() + 10 * 60 * 1000),
          updatedAt: now,
        },
        select: { id: true },
      });
      continue;
    }

    const status = (tw.call.status || "").toLowerCase();

    if (status === "queued" || status === "ringing" || status === "in-progress") {
      await prisma.portalAiOutboundCallEnrollment.update({
        where: { id: c.id },
        data: { nextCallAt: new Date(now.getTime() + 2 * 60 * 1000), updatedAt: now },
        select: { id: true },
      });
      continue;
    }

    if (status === "completed") {
      const minutes = startedMinutesFromSeconds(tw.call.durationSec);
      const durationCredits = minutes * 5;
      if (durationCredits > 0) {
        const consumed = await consumeCredits(c.ownerId, durationCredits);
        if (!consumed.ok) {
          await prisma.portalAiOutboundCallEnrollment.update({
            where: { id: c.id },
            data: {
              lastError: "Completed, but insufficient credits to bill call minutes.",
              nextCallAt: new Date(now.getTime() + 30 * 60 * 1000),
              updatedAt: now,
            },
            select: { id: true },
          });
          continue;
        }
      }

      await prisma.portalAiOutboundCallEnrollment.update({
        where: { id: c.id },
        data: {
          status: "COMPLETED",
          lastError: null,
          nextCallAt: null,
          updatedAt: now,
          completedAt: now,
        },
        select: { id: true },
      });
      continue;
    }

    // Anything else is treated as a terminal failure.
    await prisma.portalAiOutboundCallEnrollment.update({
      where: { id: c.id },
      data: {
        status: "FAILED",
        lastError: status ? `Twilio status: ${status}` : "Call failed.",
        nextCallAt: null,
        updatedAt: now,
        completedAt: now,
      },
      select: { id: true },
    });
  }

  const due = await prisma.portalAiOutboundCallEnrollment.findMany({
    where: {
      status: "QUEUED",
      attemptCount: { lt: 3 },
      OR: [{ nextCallAt: null }, { nextCallAt: { lte: now } }],
    },
    select: {
      id: true,
      ownerId: true,
      campaignId: true,
      contactId: true,
      attemptCount: true,
      campaign: { select: { id: true, status: true, script: true, voiceAgentId: true } },
      contact: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: [{ nextCallAt: "asc" }, { id: "asc" }],
    take: 60,
  });

  let processed = 0;
  const errors: Array<{ enrollmentId: string; error: string }> = [];

  const receptionistCache = new Map<string, { agentId: string; apiKey: string }>();
  const phoneNumberIdCache = new Map<string, string>();
  const profileAgentIdCache = new Map<string, string>();
  const profileApiKeyCache = new Map<string, string>();

  for (const e of due) {
    if (e.campaign.status !== "ACTIVE") {
      await prisma.portalAiOutboundCallEnrollment.update({
        where: { id: e.id },
        data: { status: "SKIPPED", lastError: "Campaign is not active.", nextCallAt: null, updatedAt: now },
        select: { id: true },
      });
      processed += 1;
      continue;
    }

    const to = String(e.contact?.phone ?? "").trim();
    if (!to) {
      await prisma.portalAiOutboundCallEnrollment.update({
        where: { id: e.id },
        data: { status: "FAILED", lastError: "Contact has no phone number.", nextCallAt: null, updatedAt: now, completedAt: now },
        select: { id: true },
      });
      processed += 1;
      continue;
    }

    try {
      const script = await renderCampaignScript({
        ownerId: e.ownerId,
        contact: {
          id: e.contact.id,
          name: e.contact.name ? String(e.contact.name) : null,
          email: e.contact.email ? String(e.contact.email) : null,
          phone: e.contact.phone ? String(e.contact.phone) : null,
        },
        campaign: { script: e.campaign.script },
      });

      const scriptTrimmed = String(script || "").trim();

      const parsedTo = normalizePhoneStrict(to);
      if (!parsedTo.ok) throw new Error("Contact phone number is invalid.");
      if (!parsedTo.e164) throw new Error("Contact has no phone number.");

      let rec = receptionistCache.get(e.ownerId);
      if (!rec) {
        const data = await getAiReceptionistServiceData(e.ownerId);
        const agentIdFromSettings = String(data.settings.voiceAgentId || "").trim();
        const apiKeyFromSettings = String(data.settings.voiceAgentApiKey || "").trim();
        rec = { agentId: agentIdFromSettings, apiKey: apiKeyFromSettings };
        receptionistCache.set(e.ownerId, rec);
      }

      let profileAgentId = profileAgentIdCache.get(e.ownerId);
      if (!profileAgentId) {
        profileAgentId = (await getProfileVoiceAgentId(e.ownerId)) || "";
        profileAgentIdCache.set(e.ownerId, profileAgentId);
      }

      let profileApiKey = profileApiKeyCache.get(e.ownerId);
      if (!profileApiKey) {
        profileApiKey = (await getProfileVoiceAgentApiKey(e.ownerId)) || "";
        profileApiKeyCache.set(e.ownerId, profileApiKey);
      }

      const agentId =
        String(e.campaign.voiceAgentId || "").trim() ||
        String(profileAgentId || "").trim() ||
        rec.agentId; // legacy fallback
      const apiKey = String(profileApiKey || "").trim() || rec.apiKey; // legacy fallback

      if (!apiKey) throw new Error("Missing voice agent API key. Set it in Profile.");
      if (!agentId) throw new Error("Missing voice agent ID. Set it in Profile or on the campaign.");

      const cacheKey = `${apiKey}:${agentId}`;
      let phoneNumberId = phoneNumberIdCache.get(cacheKey);
      if (!phoneNumberId) {
        const resolved = await resolveElevenLabsAgentPhoneNumberId({ apiKey, agentId });
        if (!resolved.ok) throw new Error(resolved.error);
        phoneNumberId = resolved.phoneNumberId;
        phoneNumberIdCache.set(cacheKey, phoneNumberId);
      }

      const ATTEMPT_CREDITS = 10;
      const consumed = await consumeCredits(e.ownerId, ATTEMPT_CREDITS);
      if (!consumed.ok) {
        await prisma.portalAiOutboundCallEnrollment.update({
          where: { id: e.id },
          data: {
            status: "QUEUED",
            lastError: "Insufficient credits.",
            nextCallAt: new Date(now.getTime() + 30 * 60 * 1000),
            updatedAt: now,
          },
          select: { id: true },
        });

        processed += 1;
        continue;
      }

      const call = await placeElevenLabsTwilioOutboundCall({
        apiKey,
        agentId,
        agentPhoneNumberId: phoneNumberId,
        toNumberE164: parsedTo.e164,
        conversationInitiationClientData: {
          user_id: e.contactId,
          dynamic_variables: {
            owner_id: e.ownerId,
            campaign_id: e.campaignId,
            enrollment_id: e.id,
            contact_id: e.contactId,
            contact_name: e.contact?.name ? String(e.contact.name).slice(0, 120) : null,
            contact_email: e.contact?.email ? String(e.contact.email).slice(0, 160) : null,
            contact_phone: parsedTo.e164,
          },
          ...(scriptTrimmed
            ? {
                conversation_config_override: {
                  agent: {
                    first_message: scriptTrimmed,
                  },
                },
              }
            : {}),
        },
      });
      if (!call.ok) throw new Error(call.error);

      await prisma.portalAiOutboundCallEnrollment.update({
        where: { id: e.id },
        data: {
          status: "CALLING",
          callSid: call.callSid ?? null,
          lastError: null,
          nextCallAt: new Date(now.getTime() + 2 * 60 * 1000),
          updatedAt: now,
          completedAt: null,
          attemptCount: Math.max(0, Number(e.attemptCount) || 0) + 1,
        },
        select: { id: true },
      });

      processed += 1;
    } catch (err: any) {
      const msg = String(err?.message || err || "Call failed").slice(0, 500);
      errors.push({ enrollmentId: e.id, error: msg });

      const attempt = Math.max(0, Number(e.attemptCount) || 0) + 1;
      const done = attempt >= 3;
      const retryAt = new Date(now.getTime() + 15 * 60 * 1000);

      await prisma.portalAiOutboundCallEnrollment.update({
        where: { id: e.id },
        data: {
          attemptCount: attempt,
          lastError: msg,
          status: done ? "FAILED" : "QUEUED",
          nextCallAt: done ? null : retryAt,
          updatedAt: now,
          completedAt: done ? now : null,
        },
        select: { id: true },
      });

      processed += 1;
    }
  }

  return NextResponse.json({ ok: true, processed, errors });
}
