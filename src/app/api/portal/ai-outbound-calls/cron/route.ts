import crypto from "crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { PORTAL_CREDIT_COSTS } from "@/lib/portalCreditCosts";
import { consumeCredits } from "@/lib/credits";
import { generateText } from "@/lib/ai";
import { getBusinessProfileAiContext } from "@/lib/businessProfileAiContext.server";
import { normalizePhoneStrict } from "@/lib/phone";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { ensureAiOutboundCallCampaignVoiceAgent } from "@/lib/portalAiOutboundCallVoiceAgent";
import { placeElevenLabsTwilioOutboundCall, resolveElevenLabsAgentPhoneNumberId } from "@/lib/elevenLabsConvai";
import { getOwnerTwilioSmsConfig, sendOwnerTwilioSms } from "@/lib/portalTwilio";
import { isVercelCronRequest, readCronAuthValue } from "@/lib/cronAuth";
import { ensurePortalInboxSchema } from "@/lib/portalInboxSchema";
import { ensurePortalContactTagsReady } from "@/lib/portalContactTags";
import { buildPortalTemplateVars } from "@/lib/portalTemplateVars";
import {
  buildOutboundMessagingSystemPrompt,
  tryBuildOutboundMessagingDeterministicReply,
} from "@/lib/portalAiOutboundIntelligence";
import { renderTextTemplate } from "@/lib/textTemplate";
import { makeEmailThreadKey, makeSmsThreadKey, normalizeSubjectKey, upsertPortalInboxMessage } from "@/lib/portalInbox";
import { getOrCreateOwnerMailboxAddress } from "@/lib/portalMailbox";
import { sendEmail } from "@/lib/leadOutbound";
import { getAppBaseUrl, tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { refreshAiOutboundEnrollmentArtifacts } from "@/lib/portalAiOutboundEnrollmentArtifacts";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

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

function safeRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function normalizeIdList(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const id = typeof v === "string" ? v.trim() : String(v ?? "").trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 50) break;
  }
  return out;
}

function normalizeOutcomeRules<T extends string>(raw: unknown, allowedOutcomes: readonly T[]) {
  const allowed = new Set<string>(allowedOutcomes);
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: Array<{ id: string; label: string; outcome: T; matchType: "any" | "contains"; matchText: string; tagIds: string[] }> = [];
  for (const item of arr) {
    const rec = safeRecord(item);
    const id = String(rec.id || "").trim().slice(0, 120);
    const outcome = String(rec.outcome || "").trim().toLowerCase();
    if (!id || !allowed.has(outcome)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: String(rec.label || "").trim().slice(0, 80) || `${outcome} rule`,
      outcome: outcome as T,
      matchType: String(rec.matchType || "contains").trim().toLowerCase() === "any" ? "any" : "contains",
      matchText: String(rec.matchText || "").trim().slice(0, 240),
      tagIds: normalizeIdList(rec.tagIds),
    });
    if (out.length >= 25) break;
  }
  return out;
}

function outcomeRuleMatches(rule: { matchType: "any" | "contains"; matchText: string }, haystack: string) {
  if (rule.matchType === "any") return true;
  const query = String(rule.matchText || "").trim().toLowerCase();
  if (!query) return false;
  const source = haystack.toLowerCase();
  return query
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => source.includes(part));
}

function ruleTargetsOutcome<T extends string>(ruleOutcome: T | "any", activeOutcome: T) {
  return ruleOutcome === "any" || ruleOutcome === activeOutcome;
}

function parseCallOutcomeTagging(raw: unknown): {
  enabled: boolean;
  onCompletedTagIds: string[];
  onFailedTagIds: string[];
  onSkippedTagIds: string[];
  rules: Array<{ id: string; label: string; outcome: "any" | "completed" | "failed" | "skipped"; matchType: "any" | "contains"; matchText: string; tagIds: string[] }>;
} {
  const rec = safeRecord(raw);
  return {
    enabled: Boolean(rec.enabled),
    onCompletedTagIds: normalizeIdList(rec.onCompletedTagIds),
    onFailedTagIds: normalizeIdList(rec.onFailedTagIds),
    onSkippedTagIds: normalizeIdList(rec.onSkippedTagIds),
    rules: normalizeOutcomeRules(rec.rules, ["any", "completed", "failed", "skipped"] as const),
  };
}

function parseMessageOutcomeTagging(raw: unknown): {
  enabled: boolean;
  onSentTagIds: string[];
  onFailedTagIds: string[];
  onSkippedTagIds: string[];
  rules: Array<{ id: string; label: string; outcome: "any" | "sent" | "failed" | "skipped"; matchType: "any" | "contains"; matchText: string; tagIds: string[] }>;
} {
  const rec = safeRecord(raw);
  return {
    enabled: Boolean(rec.enabled),
    onSentTagIds: normalizeIdList(rec.onSentTagIds),
    onFailedTagIds: normalizeIdList(rec.onFailedTagIds),
    onSkippedTagIds: normalizeIdList(rec.onSkippedTagIds),
    rules: normalizeOutcomeRules(rec.rules, ["any", "sent", "failed", "skipped"] as const),
  };
}

function cuidish(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function addContactTagAssignmentFast(opts: {
  ownerId: string;
  contactId: string;
  tagId: string;
}): Promise<void> {
  const ownerId = String(opts.ownerId);
  const contactId = String(opts.contactId);
  const tagId = String(opts.tagId);
  if (!ownerId || !contactId || !tagId) return;

  // Idempotent upsert prevents double-tagging.
  await (prisma as any).portalContactTagAssignment
    .upsert({
      where: { contactId_tagId: { contactId, tagId } },
      create: { id: cuidish("pcta"), ownerId, contactId, tagId },
      update: {},
      select: { id: true },
    })
    .catch(() => null);
}

async function applyContactTags(opts: {
  ownerId: string;
  contactId: string;
  tagIds: string[];
}): Promise<void> {
  const ownerId = String(opts.ownerId);
  const contactId = String(opts.contactId);
  const tagIds = Array.isArray(opts.tagIds) ? opts.tagIds : [];
  if (!ownerId || !contactId) return;
  for (const tagId of tagIds) {
    await addContactTagAssignmentFast({ ownerId, contactId, tagId });
  }
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
  await ensurePortalInboxSchema();
  await ensurePortalContactTagsReady();

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
      campaignId: true,
      contactId: true,
      callSid: true,
      campaign: { select: { callOutcomeTaggingJson: true } },
      contact: { select: { id: true, name: true, email: true, phone: true } },
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
      const durationCredits = minutes * PORTAL_CREDIT_COSTS.voicePerStartedMinute;
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

      const refreshed = await refreshAiOutboundEnrollmentArtifacts({ ownerId: c.ownerId, enrollmentId: c.id }).catch(() => null);

      try {
        const baseUrl = getAppBaseUrl();
        const contactName = (c as any)?.contact?.name ? String((c as any).contact.name).trim() : "";
        const contactPhone = (c as any)?.contact?.phone ? String((c as any).contact.phone).trim() : "";
        const contactEmail = (c as any)?.contact?.email ? String((c as any).contact.email).trim() : "";
        const minutes = startedMinutesFromSeconds(tw.call.durationSec);

        void tryNotifyPortalAccountUsers({
          ownerId: c.ownerId,
          kind: "ai_outbound_call_completed",
          subject: contactName ? `Outbound call completed: ${contactName}` : "Outbound call completed",
          text: [
            "An AI outbound call completed.",
            "",
            contactName ? `Contact: ${contactName}` : null,
            contactPhone ? `Phone: ${contactPhone}` : null,
            contactEmail ? `Email: ${contactEmail}` : null,
            minutes ? `Duration: ~${minutes} min` : null,
            "",
            `Open calls: ${baseUrl}/portal/app/services/ai-outbound-calls/calls`,
          ]
            .filter(Boolean)
            .join("\n"),
        }).catch(() => null);
      } catch {
        // ignore
      }

      const cfg = parseCallOutcomeTagging((c as any)?.campaign?.callOutcomeTaggingJson);
      if (cfg.enabled && cfg.onCompletedTagIds.length) {
        await applyContactTags({ ownerId: c.ownerId, contactId: c.contactId, tagIds: cfg.onCompletedTagIds });
      }
      const completedText = [
        String(status || ""),
        String((refreshed as any)?.enrollment?.transcriptText || ""),
        String((c as any)?.lastError || ""),
      ]
        .filter(Boolean)
        .join("\n");
      for (const rule of cfg.rules.filter((rule) => ruleTargetsOutcome(rule.outcome, "completed") && rule.tagIds.length)) {
        if (outcomeRuleMatches(rule, completedText)) {
          await applyContactTags({ ownerId: c.ownerId, contactId: c.contactId, tagIds: rule.tagIds });
        }
      }
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

    const refreshed = await refreshAiOutboundEnrollmentArtifacts({ ownerId: c.ownerId, enrollmentId: c.id }).catch(() => null);

    try {
      const baseUrl = getAppBaseUrl();
      const contactName = (c as any)?.contact?.name ? String((c as any).contact.name).trim() : "";
      const contactPhone = (c as any)?.contact?.phone ? String((c as any).contact.phone).trim() : "";
      const contactEmail = (c as any)?.contact?.email ? String((c as any).contact.email).trim() : "";

      void tryNotifyPortalAccountUsers({
        ownerId: c.ownerId,
        kind: "ai_outbound_call_failed",
        subject: contactName ? `Outbound call failed: ${contactName}` : "Outbound call failed",
        text: [
          "An AI outbound call failed.",
          "",
          contactName ? `Contact: ${contactName}` : null,
          contactPhone ? `Phone: ${contactPhone}` : null,
          contactEmail ? `Email: ${contactEmail}` : null,
          status ? `Twilio status: ${status}` : null,
          "",
          `Open calls: ${baseUrl}/portal/app/services/ai-outbound-calls/calls`,
        ]
          .filter(Boolean)
          .join("\n"),
      }).catch(() => null);
    } catch {
      // ignore
    }

    {
      const cfg = parseCallOutcomeTagging((c as any)?.campaign?.callOutcomeTaggingJson);
      if (cfg.enabled && cfg.onFailedTagIds.length) {
        await applyContactTags({ ownerId: c.ownerId, contactId: c.contactId, tagIds: cfg.onFailedTagIds });
      }
      const failedText = [
        String(status || ""),
        status ? `Twilio status: ${status}` : "Call failed.",
        String((refreshed as any)?.enrollment?.transcriptText || ""),
      ]
        .filter(Boolean)
        .join("\n");
      for (const rule of cfg.rules.filter((rule) => ruleTargetsOutcome(rule.outcome, "failed") && rule.tagIds.length)) {
        if (outcomeRuleMatches(rule, failedText)) {
          await applyContactTags({ ownerId: c.ownerId, contactId: c.contactId, tagIds: rule.tagIds });
        }
      }
    }
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
      campaign: { select: { id: true, status: true, voiceAgentId: true, manualVoiceAgentId: true, callOutcomeTaggingJson: true } },
      contact: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: [{ nextCallAt: "asc" }, { id: "asc" }],
    take: 60,
  });

  let processed = 0;
  const errors: Array<{ enrollmentId: string; error: string }> = [];

  let messagesProcessed = 0;
  const messageErrors: Array<{ enrollmentId: string; error: string }> = [];

  let repliesProcessed = 0;
  const replyErrors: Array<{ enrollmentId: string; error: string }> = [];

  const phoneNumberIdCache = new Map<string, string>();

  for (const e of due) {
    if (e.campaign.status !== "ACTIVE") {
      await prisma.portalAiOutboundCallEnrollment.update({
        where: { id: e.id },
        data: { status: "SKIPPED", lastError: "Campaign is not active.", nextCallAt: null, updatedAt: now },
        select: { id: true },
      });

      const cfg = parseCallOutcomeTagging((e.campaign as any)?.callOutcomeTaggingJson);
      if (cfg.enabled && cfg.onSkippedTagIds.length) {
        await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: cfg.onSkippedTagIds });
      }
      for (const rule of cfg.rules.filter((rule) => ruleTargetsOutcome(rule.outcome, "skipped") && rule.tagIds.length)) {
        if (outcomeRuleMatches(rule, "Campaign is not active.")) {
          await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: rule.tagIds });
        }
      }
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

      const cfg = parseCallOutcomeTagging((e.campaign as any)?.callOutcomeTaggingJson);
      if (cfg.enabled && cfg.onFailedTagIds.length) {
        await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: cfg.onFailedTagIds });
      }
      for (const rule of cfg.rules.filter((rule) => ruleTargetsOutcome(rule.outcome, "failed") && rule.tagIds.length)) {
        if (outcomeRuleMatches(rule, "Contact has no phone number.")) {
          await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: rule.tagIds });
        }
      }
      processed += 1;
      continue;
    }

    try {
      const parsedTo = normalizePhoneStrict(to);
      if (!parsedTo.ok) throw new Error("Contact phone number is invalid.");
      if (!parsedTo.e164) throw new Error("Contact has no phone number.");

      const ensured = await ensureAiOutboundCallCampaignVoiceAgent({ ownerId: e.ownerId, campaignId: e.campaignId });
      if (!ensured.ok) throw new Error(ensured.error);
      const agentId = ensured.agentId;
      const apiKey = ensured.apiKey;

      const cacheKey = `${apiKey}:${agentId}`;
      let phoneNumberId = phoneNumberIdCache.get(cacheKey);
      if (!phoneNumberId) {
        const resolved = await resolveElevenLabsAgentPhoneNumberId({ apiKey, agentId });
        if (!resolved.ok) throw new Error(resolved.error);
        phoneNumberId = resolved.phoneNumberId;
        phoneNumberIdCache.set(cacheKey, phoneNumberId);
      }

      const ATTEMPT_CREDITS = PORTAL_CREDIT_COSTS.aiOutboundCallAttempt;
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
        },
      });
      if (!call.ok) throw new Error(call.error);

      await prisma.portalAiOutboundCallEnrollment.update({
        where: { id: e.id },
        data: {
          status: "CALLING",
          callSid: call.callSid ?? null,
          conversationId: call.conversationId ?? null,
          lastError: null,
          nextCallAt: new Date(now.getTime() + 2 * 60 * 1000),
          updatedAt: now,
          completedAt: null,
          attemptCount: Math.max(0, Number(e.attemptCount) || 0) + 1,
        } as any,
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

      if (done) {
        const cfg = parseCallOutcomeTagging((e.campaign as any)?.callOutcomeTaggingJson);
        if (cfg.enabled && cfg.onFailedTagIds.length) {
          await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: cfg.onFailedTagIds });
        }
        for (const rule of cfg.rules.filter((rule) => ruleTargetsOutcome(rule.outcome, "failed") && rule.tagIds.length)) {
          if (outcomeRuleMatches(rule, msg)) {
            await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: rule.tagIds });
          }
        }
      }

      processed += 1;
    }
  }

  function parseAgentConfig(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
  }

  async function getOwnerContext(ownerId: string) {
    const profile = await prisma.businessProfile
      .findUnique({ where: { ownerId }, select: { businessName: true } })
      .catch(() => null);
    const ownerUser = await prisma.user
      .findUnique({ where: { id: ownerId }, select: { email: true, name: true } })
      .catch(() => null);

    const ownerPhone = await (async () => {
      try {
        const row = await prisma.portalServiceSetup.findUnique({
          where: { ownerId_serviceSlug: { ownerId, serviceSlug: "profile" } },
          select: { dataJson: true },
        });

        const rec =
          row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
            ? (row.dataJson as Record<string, unknown>)
            : null;
        const raw = rec?.phone;
        return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 32) : null;
      } catch {
        return null;
      }
    })();

    const mailbox = await getOrCreateOwnerMailboxAddress(ownerId).catch(() => null);

    return {
      businessName: profile?.businessName?.trim() || "Purely Automation",
      ownerEmail: ownerUser?.email?.trim() || null,
      ownerName: ownerUser?.name?.trim() || null,
      ownerPhone,
      mailboxEmail: mailbox?.emailAddress || null,
    };
  }

  const ownerContextCache = new Map<string, Awaited<ReturnType<typeof getOwnerContext>>>();
  const ownerTwilioCache = new Map<string, Awaited<ReturnType<typeof getOwnerTwilioSmsConfig>> | null>();
  const ownerBusinessContextCache = new Map<string, string>();

  async function sendReplyForEnrollment(opts: {
    enrollment: {
      id: string;
      ownerId: string;
    };
    thread: {
      threadKey: string | null;
      peerAddress: string | null;
      peerKey: string | null;
      subject: string | null;
      subjectKey: string | null;
    };
    inboundMessageId: string;
    bodyText: string;
    threadChannel: "SMS" | "EMAIL";
  }) {
    const bodyText = String(opts.bodyText || "").trim();
    if (!bodyText) throw new Error("AI generated an empty reply");

    const ownerCtx = ownerContextCache.has(opts.enrollment.ownerId)
      ? ownerContextCache.get(opts.enrollment.ownerId)!
      : await getOwnerContext(opts.enrollment.ownerId);
    if (!ownerContextCache.has(opts.enrollment.ownerId)) ownerContextCache.set(opts.enrollment.ownerId, ownerCtx);

    if (opts.threadChannel === "SMS") {
      const twilioCfg = ownerTwilioCache.has(opts.enrollment.ownerId)
        ? ownerTwilioCache.get(opts.enrollment.ownerId)!
        : await getOwnerTwilioSmsConfig(opts.enrollment.ownerId).catch(() => null);
      if (!ownerTwilioCache.has(opts.enrollment.ownerId)) ownerTwilioCache.set(opts.enrollment.ownerId, twilioCfg);
      if (!twilioCfg?.fromNumberE164) throw new Error("Twilio is not configured");

      const peerPhone = String(opts.thread.peerAddress || opts.thread.peerKey || "").trim();
      const parsedTo = normalizePhoneStrict(peerPhone);
      if (!parsedTo.ok || !parsedTo.e164) throw new Error("Peer phone is invalid");

      const send = await sendOwnerTwilioSms({ ownerId: opts.enrollment.ownerId, to: parsedTo.e164, body: bodyText });
      if (!send.ok) throw new Error(String(send.error || "SMS send failed"));

      await upsertPortalInboxMessage({
        ownerId: opts.enrollment.ownerId,
        channel: "SMS",
        direction: "OUT",
        threadKey: String(opts.thread.threadKey || ""),
        peerAddress: String(opts.thread.peerAddress || ""),
        peerKey: String(opts.thread.peerKey || ""),
        fromAddress: twilioCfg.fromNumberE164,
        toAddress: parsedTo.e164,
        bodyText,
        provider: "TWILIO",
        providerMessageId: send.messageSid ?? null,
      });
    } else {
      const toEmail = String(opts.thread.peerKey || opts.thread.peerAddress || "").trim();
      const subject = String(opts.thread.subject || "(no subject)").trim().slice(0, 200) || "(no subject)";

      await sendEmail({
        to: toEmail,
        subject,
        text: bodyText || " ",
        fromEmail: ownerCtx.mailboxEmail || undefined,
        fromName: ownerCtx.businessName,
      });

      await upsertPortalInboxMessage({
        ownerId: opts.enrollment.ownerId,
        channel: "EMAIL",
        direction: "OUT",
        threadKey: String(opts.thread.threadKey || ""),
        peerAddress: String(opts.thread.peerAddress || ""),
        peerKey: String(opts.thread.peerKey || ""),
        subject,
        subjectKey: String(opts.thread.subjectKey || normalizeSubjectKey(subject)),
        fromAddress: ownerCtx.mailboxEmail || ownerCtx.ownerEmail || "purelyautomation@purelyautomation.com",
        toAddress: toEmail,
        bodyText: bodyText || " ",
        provider: "POSTMARK",
        providerMessageId: null,
      });
    }

    await prisma.portalAiOutboundMessageEnrollment.update({
      where: { id: opts.enrollment.id },
      data: {
        pendingReplyToMessageId: null,
        nextReplyAt: null,
        replyLastError: null,
        lastAutoRepliedMessageId: opts.inboundMessageId,
        lastAutoReplyAt: now,
      },
      select: { id: true },
    });
  }

  function normalizeMessageChannelPolicy(raw: unknown): "SMS" | "EMAIL" | "BOTH" {
    const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    if (v === "SMS" || v === "EMAIL" || v === "BOTH") return v;
    return "BOTH";
  }

  function policyAllowsChannel(policy: "SMS" | "EMAIL" | "BOTH", channel: "SMS" | "EMAIL") {
    if (policy === "BOTH") return true;
    return policy === channel;
  }

  function pickChannelForFirstMessage(opts: {
    policy: "SMS" | "EMAIL" | "BOTH";
    smsAvailable: boolean;
    emailAvailable: boolean;
  }): "SMS" | "EMAIL" | null {
    const { policy, smsAvailable, emailAvailable } = opts;
    if (policy === "SMS") return smsAvailable ? "SMS" : null;
    if (policy === "EMAIL") return emailAvailable ? "EMAIL" : null;
    if (smsAvailable) return "SMS";
    if (emailAvailable) return "EMAIL";
    return null;
  }

  function describeMessageTarget(channel: "SMS" | "EMAIL", target: string): string {
    const clean = String(target || "").trim();
    if (!clean) return channel === "SMS" ? "SMS recipient" : "email recipient";
    return channel === "SMS" ? `SMS recipient ${clean}` : `email recipient ${clean}`;
  }

  function isTerminalOutboundDeliveryError(message: string): boolean {
    const normalized = String(message || "").toLowerCase();
    if (!normalized) return false;
    return (
      normalized.includes("errorcode\":406") ||
      normalized.includes("marked as inactive") ||
      normalized.includes("manual suppression") ||
      normalized.includes("hard bounce") ||
      normalized.includes("spam complaint") ||
      normalized.includes("destination could not be reached") ||
      normalized.includes("invalid 'to' phone number") ||
      normalized.includes("contact phone number is invalid") ||
      normalized.includes("peer phone is invalid") ||
      normalized.includes("contact email is invalid")
    );
  }

  function buildOutboundDeliveryError(opts: { channel: "SMS" | "EMAIL"; target: string; rawMessage: string }): {
    message: string;
    terminal: boolean;
  } {
    const rawMessage = String(opts.rawMessage || "Delivery failed").trim().slice(0, 500);
    const targetLabel = describeMessageTarget(opts.channel, opts.target);
    const terminal = isTerminalOutboundDeliveryError(rawMessage);
    const lower = rawMessage.toLowerCase();

    if (terminal && opts.channel === "EMAIL" && (lower.includes("errorcode\":406") || lower.includes("marked as inactive"))) {
      return {
        message: `${targetLabel} is suppressed or inactive in Postmark.`,
        terminal: true,
      };
    }

    if (terminal && opts.channel === "SMS" && (lower.includes("invalid 'to' phone number") || lower.includes("destination could not be reached"))) {
      return {
        message: `${targetLabel} cannot receive SMS delivery.`,
        terminal: true,
      };
    }

    return {
      message: `${targetLabel}: ${rawMessage}`.slice(0, 500),
      terminal,
    };
  }

  // 2) Process queued outbound messages (first message) for contacts in the Messages audience.
  const dueMessages = await prisma.portalAiOutboundMessageEnrollment.findMany({
    where: {
      status: "QUEUED",
      attemptCount: { lt: 3 },
      OR: [{ nextSendAt: null }, { nextSendAt: { lte: now } }],
    },
    select: {
      id: true,
      ownerId: true,
      campaignId: true,
      contactId: true,
      attemptCount: true,
      channelPolicy: true,
      campaign: {
        select: { id: true, status: true, name: true, chatAgentConfigJson: true, messageChannelPolicy: true, messageOutcomeTaggingJson: true },
      },
      contact: { select: { id: true, name: true, email: true, phone: true } },
    },
    orderBy: [{ nextSendAt: "asc" }, { id: "asc" }],
    take: 60,
  });

  for (const e of dueMessages) {
    if (e.campaign.status !== "ACTIVE") {
      await prisma.portalAiOutboundMessageEnrollment.update({
        where: { id: e.id },
        data: { status: "SKIPPED", lastError: "Campaign is not active.", nextSendAt: null },
        select: { id: true },
      });

      const tagCfg = parseMessageOutcomeTagging((e.campaign as any)?.messageOutcomeTaggingJson);
      if (tagCfg.enabled && tagCfg.onSkippedTagIds.length) {
        await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: tagCfg.onSkippedTagIds });
      }
      for (const rule of tagCfg.rules.filter((rule) => ruleTargetsOutcome(rule.outcome, "skipped") && rule.tagIds.length)) {
        if (outcomeRuleMatches(rule, "Campaign is not active.")) {
          await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: rule.tagIds });
        }
      }
      messagesProcessed += 1;
      continue;
    }

    const contactEmail = String(e.contact?.email ?? "").trim();
    const contactPhone = String(e.contact?.phone ?? "").trim();

    // Channel selection is controlled by campaign/enrollment policy.
    const twilioCfg = ownerTwilioCache.has(e.ownerId)
      ? ownerTwilioCache.get(e.ownerId)!
      : await getOwnerTwilioSmsConfig(e.ownerId).catch(() => null);
    if (!ownerTwilioCache.has(e.ownerId)) ownerTwilioCache.set(e.ownerId, twilioCfg);

    const smsAvailable = Boolean(contactPhone && twilioCfg?.fromNumberE164);
    const emailAvailable = Boolean(contactEmail);

    const policy = normalizeMessageChannelPolicy((e as any).channelPolicy || (e.campaign as any).messageChannelPolicy);
    const channel = pickChannelForFirstMessage({ policy, smsAvailable, emailAvailable });

    if (!channel) {
      const msg =
        policy === "SMS"
          ? "Campaign is set to SMS only, but SMS is not available for this contact."
          : policy === "EMAIL"
            ? "Campaign is set to Email only, but email is not available for this contact."
            : "No SMS/email available for this contact.";
      await prisma.portalAiOutboundMessageEnrollment.update({
        where: { id: e.id },
        data: { status: "FAILED", lastError: msg, nextSendAt: null },
        select: { id: true },
      });

      const tagCfg = parseMessageOutcomeTagging((e.campaign as any)?.messageOutcomeTaggingJson);
      if (tagCfg.enabled && tagCfg.onFailedTagIds.length) {
        await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: tagCfg.onFailedTagIds });
      }
      for (const rule of tagCfg.rules.filter((rule) => ruleTargetsOutcome(rule.outcome, "failed") && rule.tagIds.length)) {
        if (outcomeRuleMatches(rule, msg)) {
          await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: rule.tagIds });
        }
      }
      messagesProcessed += 1;
      continue;
    }

    try {
      const ownerCtx = ownerContextCache.has(e.ownerId)
        ? ownerContextCache.get(e.ownerId)!
        : await getOwnerContext(e.ownerId);
      if (!ownerContextCache.has(e.ownerId)) ownerContextCache.set(e.ownerId, ownerCtx);

      const cfg = parseAgentConfig(e.campaign.chatAgentConfigJson);
      const rawFirstMessage = typeof cfg.firstMessage === "string" ? cfg.firstMessage.trim() : "";
      const firstMessage = rawFirstMessage || "Hi {contact.firstName}, this is {business.name}. Wanted to follow up and see if you’d like more information.";

      const templateVars = buildPortalTemplateVars({
        contact: {
          id: e.contact?.id ? String(e.contact.id) : null,
          name: e.contact?.name ? String(e.contact.name) : null,
          email: e.contact?.email ? String(e.contact.email) : null,
          phone: e.contact?.phone ? String(e.contact.phone) : null,
        },
        business: { name: ownerCtx.businessName },
        owner: { name: ownerCtx.ownerName, email: ownerCtx.ownerEmail, phone: ownerCtx.ownerPhone },
        message: { body: firstMessage },
      });

      const body = renderTextTemplate(firstMessage, templateVars).trim();

      if (channel === "SMS") {
        const parsedTo = normalizePhoneStrict(contactPhone);
        if (!parsedTo.ok || !parsedTo.e164) throw new Error("Contact phone number is invalid.");
        if (!twilioCfg?.fromNumberE164) throw new Error("Twilio is not configured.");

        const send = await sendOwnerTwilioSms({ ownerId: e.ownerId, to: parsedTo.e164, body });
        if (!send.ok) throw new Error(String(send.error || "SMS send failed"));

        const { threadKey, peerAddress, peerKey } = makeSmsThreadKey(parsedTo.e164);
        const logged = await upsertPortalInboxMessage({
          ownerId: e.ownerId,
          channel: "SMS",
          direction: "OUT",
          threadKey,
          peerAddress,
          peerKey,
          fromAddress: twilioCfg.fromNumberE164,
          toAddress: parsedTo.e164,
          bodyText: body,
          provider: "TWILIO",
          providerMessageId: send.messageSid ?? null,
        });

        await prisma.portalAiOutboundMessageEnrollment.update({
          where: { id: e.id },
          data: {
            status: "ACTIVE",
            nextSendAt: null,
            sentFirstMessageAt: now,
            threadId: logged.threadId,
            lastError: null,
          },
          select: { id: true },
        });

        const tagCfg = parseMessageOutcomeTagging((e.campaign as any)?.messageOutcomeTaggingJson);
        if (tagCfg.enabled && tagCfg.onSentTagIds.length) {
          await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: tagCfg.onSentTagIds });
        }
        for (const rule of tagCfg.rules.filter((rule) => ruleTargetsOutcome(rule.outcome, "sent") && rule.tagIds.length)) {
          if (outcomeRuleMatches(rule, body)) {
            await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: rule.tagIds });
          }
        }

        messagesProcessed += 1;
        continue;
      }

      // EMAIL
      const subject = String(e.campaign.name || "").trim().slice(0, 120) || "Quick question";
      const subjectKey = normalizeSubjectKey(subject);
      const thread = makeEmailThreadKey(contactEmail, subjectKey);
      if (!thread) throw new Error("Contact email is invalid.");

      await sendEmail({
        to: thread.peerKey,
        subject,
        text: body || " ",
        fromEmail: ownerCtx.mailboxEmail || undefined,
        fromName: ownerCtx.businessName,
      });

      const logged = await upsertPortalInboxMessage({
        ownerId: e.ownerId,
        channel: "EMAIL",
        direction: "OUT",
        threadKey: thread.threadKey,
        peerAddress: thread.peerAddress,
        peerKey: thread.peerKey,
        subject,
        subjectKey,
        fromAddress: ownerCtx.mailboxEmail || ownerCtx.ownerEmail || "purelyautomation@purelyautomation.com",
        toAddress: thread.peerKey,
        bodyText: body || " ",
        provider: "POSTMARK",
        providerMessageId: null,
      });

      await prisma.portalAiOutboundMessageEnrollment.update({
        where: { id: e.id },
        data: {
          status: "ACTIVE",
          nextSendAt: null,
          sentFirstMessageAt: now,
          threadId: logged.threadId,
          lastError: null,
        },
        select: { id: true },
      });

      const tagCfg = parseMessageOutcomeTagging((e.campaign as any)?.messageOutcomeTaggingJson);
      if (tagCfg.enabled && tagCfg.onSentTagIds.length) {
        await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: tagCfg.onSentTagIds });
      }
      for (const rule of tagCfg.rules.filter((rule) => ruleTargetsOutcome(rule.outcome, "sent") && rule.tagIds.length)) {
        if (outcomeRuleMatches(rule, [subject, body].filter(Boolean).join("\n"))) {
          await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: rule.tagIds });
        }
      }

      messagesProcessed += 1;
    } catch (err: any) {
      const deliveryFailure = buildOutboundDeliveryError({
        channel,
        target: channel === "SMS" ? contactPhone : contactEmail,
        rawMessage: String(err?.message || err || "Message send failed"),
      });
      const msg = deliveryFailure.message;
      messageErrors.push({ enrollmentId: e.id, error: msg });

      const attempt = Math.max(0, Number(e.attemptCount) || 0) + 1;
      const done = deliveryFailure.terminal || attempt >= 3;
      const retryAt = new Date(now.getTime() + 15 * 60 * 1000);

      await prisma.portalAiOutboundMessageEnrollment.update({
        where: { id: e.id },
        data: {
          attemptCount: attempt,
          lastError: msg,
          status: done ? "FAILED" : "QUEUED",
          nextSendAt: done ? null : retryAt,
        },
        select: { id: true },
      });

      if (done) {
        const tagCfg = parseMessageOutcomeTagging((e.campaign as any)?.messageOutcomeTaggingJson);
        if (tagCfg.enabled && tagCfg.onFailedTagIds.length) {
          await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: tagCfg.onFailedTagIds });
        }
        for (const rule of tagCfg.rules.filter((rule) => ruleTargetsOutcome(rule.outcome, "failed") && rule.tagIds.length)) {
          if (outcomeRuleMatches(rule, msg)) {
            await applyContactTags({ ownerId: e.ownerId, contactId: e.contactId, tagIds: rule.tagIds });
          }
        }
      }

      messagesProcessed += 1;
    }
  }

  // 3) Process queued auto-replies (queued by inbound webhooks).
  const dueReplies = await prisma.portalAiOutboundMessageEnrollment.findMany({
    where: {
      status: "ACTIVE",
      pendingReplyToMessageId: { not: null },
      replyAttemptCount: { lt: 5 },
      OR: [{ nextReplyAt: null }, { nextReplyAt: { lte: now } }],
    },
    select: {
      id: true,
      ownerId: true,
      contactId: true,
      campaignId: true,
      threadId: true,
      pendingReplyToMessageId: true,
      replyAttemptCount: true,
      lastAutoRepliedMessageId: true,
      channelPolicy: true,
      campaign: { select: { id: true, status: true, chatAgentConfigJson: true, messageChannelPolicy: true } },
    },
    orderBy: [{ nextReplyAt: "asc" }, { id: "asc" }],
    take: 60,
  });

  for (const e of dueReplies) {
    const replyToMessageId = String(e.pendingReplyToMessageId || "");
    let replyChannel: "SMS" | "EMAIL" = "EMAIL";
    let replyTarget = "";
    if (!replyToMessageId) continue;
    if (e.lastAutoRepliedMessageId && String(e.lastAutoRepliedMessageId) === replyToMessageId) {
      await prisma.portalAiOutboundMessageEnrollment.update({
        where: { id: e.id },
        data: { pendingReplyToMessageId: null, nextReplyAt: null },
        select: { id: true },
      });
      repliesProcessed += 1;
      continue;
    }

    if (e.campaign.status !== "ACTIVE") {
      await prisma.portalAiOutboundMessageEnrollment.update({
        where: { id: e.id },
        data: { pendingReplyToMessageId: null, nextReplyAt: null, replyLastError: "Campaign is not active." },
        select: { id: true },
      });
      repliesProcessed += 1;
      continue;
    }

    const threadId = String(e.threadId || "");
    if (!threadId) {
      await prisma.portalAiOutboundMessageEnrollment.update({
        where: { id: e.id },
        data: { pendingReplyToMessageId: null, nextReplyAt: null, replyLastError: "Missing threadId." },
        select: { id: true },
      });
      repliesProcessed += 1;
      continue;
    }

    try {
      const thread = await (prisma as any).portalInboxThread.findFirst({
        where: { ownerId: e.ownerId, id: threadId },
        select: { id: true, channel: true, threadKey: true, peerAddress: true, peerKey: true, subject: true, subjectKey: true },
      });
      if (!thread?.id) throw new Error("Thread not found");

      const threadChannel = String(thread.channel) === "SMS" ? "SMS" : "EMAIL";
      replyChannel = threadChannel;
      replyTarget = String(thread.peerAddress || thread.peerKey || "");
      const policy = normalizeMessageChannelPolicy((e as any).channelPolicy || (e.campaign as any).messageChannelPolicy);
      if (!policyAllowsChannel(policy, threadChannel)) {
        await prisma.portalAiOutboundMessageEnrollment.update({
          where: { id: e.id },
          data: {
            pendingReplyToMessageId: null,
            nextReplyAt: null,
            replyLastError:
              policy === "SMS"
                ? "Campaign is set to SMS only; skipping email reply."
                : "Campaign is set to Email only; skipping SMS reply.",
          },
          select: { id: true },
        });
        repliesProcessed += 1;
        continue;
      }

      const inbound = await (prisma as any).portalInboxMessage.findFirst({
        where: { ownerId: e.ownerId, id: replyToMessageId, threadId, direction: "IN" },
        select: { id: true, bodyText: true },
      });
      if (!inbound?.id) throw new Error("Inbound message not found");

      const history = await (prisma as any).portalInboxMessage.findMany({
        where: { ownerId: e.ownerId, threadId },
        orderBy: { createdAt: "desc" },
        take: 16,
        select: { direction: true, bodyText: true, createdAt: true },
      });

      const chronological = Array.isArray(history) ? history.slice().reverse() : [];
      const previewHistory: Array<{ role: "user" | "assistant"; content: string }> = chronological.map((m: any) => ({
        role: String(m?.direction || "") === "IN" ? "user" : "assistant",
        content: String(m?.bodyText || "").trim(),
      }));
      const transcript = chronological
        .map((m: any) => {
          const dir = String(m?.direction || "");
          const who = dir === "IN" ? "Customer" : "You";
          const body = String(m?.bodyText || "").trim();
          return body ? `${who}: ${body}` : null;
        })
        .filter(Boolean)
        .join("\n");

      const cfg = parseAgentConfig(e.campaign.chatAgentConfigJson);
      const businessContext = ownerBusinessContextCache.has(e.ownerId)
        ? ownerBusinessContextCache.get(e.ownerId)!
        : await getBusinessProfileAiContext(e.ownerId).catch(() => "");
      if (!ownerBusinessContextCache.has(e.ownerId)) ownerBusinessContextCache.set(e.ownerId, businessContext);

      const deterministicReply = tryBuildOutboundMessagingDeterministicReply({
        channel: threadChannel,
        inbound: String(inbound.bodyText || "").trim(),
        history: previewHistory,
        goal: typeof (cfg as any)?.goal === "string" ? String((cfg as any).goal) : null,
        businessContext,
        campaignName: String((e.campaign as any)?.name || ""),
      });

      if (deterministicReply) {
        await sendReplyForEnrollment({
          enrollment: e,
          thread,
          inboundMessageId: inbound.id,
          bodyText: deterministicReply,
          threadChannel,
        });
        repliesProcessed += 1;
        continue;
      }

      const system = [
        buildOutboundMessagingSystemPrompt(cfg, {
          channel: threadChannel,
          campaignName: String((e.campaign as any)?.name || ""),
          businessContext,
        }),
        businessContext,
      ]
        .filter(Boolean)
        .join("\n\n");

      const userPrompt = [
        "Continue this conversation by replying to the most recent Customer message.",
        "Only output the reply text.",
        "Prioritize what the customer most recently said over any earlier script momentum.",
        "Do not repeat questions they already answered.",
        "If you still need something, ask one narrow follow-up only.",
        "",
        transcript ? `Conversation:\n${transcript}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const draft = await generateText({ system, user: userPrompt });
      const replyText = String(draft || "").trim();
      await sendReplyForEnrollment({
        enrollment: e,
        thread,
        inboundMessageId: replyToMessageId,
        bodyText: replyText,
        threadChannel,
      });

      repliesProcessed += 1;
    } catch (err: any) {
      const deliveryFailure = buildOutboundDeliveryError({
        channel: replyChannel,
        target: replyTarget,
        rawMessage: String(err?.message || err || "Auto-reply failed"),
      });
      const msg = deliveryFailure.message;
      replyErrors.push({ enrollmentId: e.id, error: msg });

      const attempt = Math.max(0, Number(e.replyAttemptCount) || 0) + 1;
      const done = deliveryFailure.terminal || attempt >= 5;
      const retryAt = new Date(now.getTime() + 10 * 60 * 1000);

      await prisma.portalAiOutboundMessageEnrollment.update({
        where: { id: e.id },
        data: {
          replyAttemptCount: attempt,
          replyLastError: msg,
          nextReplyAt: done ? null : retryAt,
          pendingReplyToMessageId: done ? null : e.pendingReplyToMessageId,
        },
        select: { id: true },
      });

      repliesProcessed += 1;
    }
  }

  return NextResponse.json({ ok: true, processed, errors, messagesProcessed, messageErrors, repliesProcessed, replyErrors });
}
