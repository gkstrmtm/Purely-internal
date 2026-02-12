import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAiReceptionistServiceData } from "@/lib/aiReceptionist";
import { normalizePhoneStrict } from "@/lib/phone";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { renderCampaignScript } from "@/lib/portalAiOutboundCalls";
import { placeElevenLabsTwilioOutboundCall, resolveElevenLabsAgentPhoneNumberId } from "@/lib/elevenLabsConvai";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function checkAuth(req: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.AI_OUTBOUND_CALLS_CRON_SECRET;
  if (isProd && !secret) {
    return { ok: false as const, status: 503 as const, error: "Missing AI_OUTBOUND_CALLS_CRON_SECRET" };
  }
  if (!secret) return { ok: true as const, status: 200 as const };

  const url = new URL(req.url);
  const authz = req.headers.get("authorization") ?? "";
  const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : null;
  const provided = req.headers.get("x-ai-outbound-calls-cron-secret") ?? bearer ?? url.searchParams.get("secret");
  if (provided !== secret) return { ok: false as const, status: 401 as const, error: "Unauthorized" };

  return { ok: true as const, status: 200 as const };
}

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  await ensurePortalAiOutboundCallsSchema();

  const now = new Date();

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

      const agentId = String(e.campaign.voiceAgentId || "").trim() || rec.agentId;
      const apiKey = rec.apiKey;

      if (!apiKey) throw new Error("Missing ElevenLabs API key. Set it in AI Receptionist settings.");
      if (!agentId) throw new Error("Missing ElevenLabs agent id. Set it in AI Receptionist settings or on the campaign.");

      const cacheKey = `${apiKey}:${agentId}`;
      let phoneNumberId = phoneNumberIdCache.get(cacheKey);
      if (!phoneNumberId) {
        const resolved = await resolveElevenLabsAgentPhoneNumberId({ apiKey, agentId });
        if (!resolved.ok) throw new Error(resolved.error);
        phoneNumberId = resolved.phoneNumberId;
        phoneNumberIdCache.set(cacheKey, phoneNumberId);
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
          conversation_config_override: {
            agent: {
              first_message: script,
            },
          },
        },
      });
      if (!call.ok) throw new Error(call.error);

      await prisma.portalAiOutboundCallEnrollment.update({
        where: { id: e.id },
        data: {
          status: "COMPLETED",
          callSid: call.callSid ?? null,
          lastError: null,
          nextCallAt: null,
          updatedAt: now,
          completedAt: now,
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
