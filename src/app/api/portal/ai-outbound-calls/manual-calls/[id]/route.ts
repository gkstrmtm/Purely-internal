import { NextResponse } from "next/server";
import { z } from "zod";

import {
  analyzeAiOutboundBookingTranscript,
  parseAiOutboundBookingConfig,
  type AiOutboundBookingTranscriptAnalysis,
} from "@/lib/aiOutboundBooking";
import { getBookingCalendarsConfig } from "@/lib/bookingCalendars";
import { getBookingFormConfig } from "@/lib/bookingForm";
import { createTaskForAiOutboundFollowUp, createTaskForBookedCall } from "@/lib/bookingTasks";
import { prisma } from "@/lib/db";
import { requireClientSessionForService } from "@/lib/portalAccess";
import { addContactTagAssignment, createOwnerContactTag } from "@/lib/portalContactTags";
import { findOrCreatePortalContact } from "@/lib/portalContacts";
import { tryNotifyPortalAccountUsers } from "@/lib/portalNotifications";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { webhookUrlFromRequest } from "@/lib/webhookBase";
import { fetchElevenLabsConversationTranscript } from "@/lib/elevenLabsConvai";
import { transcribeAudio, transcribeAudioVerbose } from "@/lib/ai";
import { buildSpeakerTranscriptAlignedToFull } from "@/lib/dualChannelTranscript";
import { splitStereoPcmWavToMonoWavs } from "@/lib/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const idSchema = z.string().trim().min(1).max(120);

function safeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function normalizeIdList(raw: unknown, max = 50): string[] {
  const xs = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const x of xs) {
    const id = typeof x === "string" ? x.trim() : "";
    if (!id || id.length > 120 || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeOutcomeRules(
  raw: unknown,
): Array<{ id: string; label: string; outcome: "any" | "completed" | "failed" | "skipped"; matchType: "any" | "contains"; matchText: string; tagIds: string[] }> {
  const xs = Array.isArray(raw) ? raw : [];
  const out: Array<{ id: string; label: string; outcome: "any" | "completed" | "failed" | "skipped"; matchType: "any" | "contains"; matchText: string; tagIds: string[] }> = [];
  for (const item of xs) {
    const rec = safeRecord(item);
    const id = typeof rec.id === "string" ? rec.id.trim().slice(0, 120) : "";
    const label = typeof rec.label === "string" ? rec.label.trim().slice(0, 120) : "";
    const outcomeRaw = typeof rec.outcome === "string" ? rec.outcome.trim().toLowerCase() : "any";
    const outcome = outcomeRaw === "completed" || outcomeRaw === "failed" || outcomeRaw === "skipped" ? outcomeRaw : "any";
    const matchTypeRaw = typeof rec.matchType === "string" ? rec.matchType.trim().toLowerCase() : "contains";
    const matchType = matchTypeRaw === "any" ? "any" : "contains";
    const matchText = typeof rec.matchText === "string" ? rec.matchText.trim().slice(0, 500) : "";
    const tagIds = normalizeIdList(rec.tagIds, 50);
    if (!id || !tagIds.length) continue;
    out.push({ id, label, outcome, matchType, matchText, tagIds });
    if (out.length >= 25) break;
  }
  return out;
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
    rules: normalizeOutcomeRules(rec.rules),
  };
}

function outcomeRuleMatches(
  rule: { matchType: "any" | "contains"; matchText: string },
  haystack: string,
) {
  if (rule.matchType === "any") return true;
  const query = String(rule.matchText || "").trim().toLowerCase();
  if (!query) return false;
  const source = String(haystack || "").toLowerCase();
  return query
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => source.includes(part));
}

function ruleTargetsOutcome(
  ruleOutcome: "any" | "completed" | "failed" | "skipped",
  activeOutcome: "completed" | "failed" | "skipped",
) {
  return ruleOutcome === "any" || ruleOutcome === activeOutcome;
}

function parseIsoOrNull(raw: unknown): Date | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function ensureDefaultOutcomeTag(ownerId: string, name: string, color: string) {
  return createOwnerContactTag({ ownerId, name, color }).catch(() => null);
}

async function applyDefaultManualOutcomeTags(opts: {
  ownerId: string;
  contactId: string;
  analysis: AiOutboundBookingTranscriptAnalysis | null;
  transcript: string;
}) {
  const analysis = opts.analysis;
  const transcript = String(opts.transcript || "");
  const defaultTags: Array<{ name: string; color: string }> = [];

  if (analysis?.doNotCall) {
    defaultTags.push({ name: "Do Not Call", color: "#EF4444" });
  } else if (analysis?.booked) {
    defaultTags.push({ name: "Booked Call", color: "#10B981" });
  } else if (analysis?.followUpRequested && analysis.followUpChannel === "text") {
    defaultTags.push({ name: "Text Later", color: "#2563EB" });
  } else if (analysis?.followUpRequested) {
    defaultTags.push({ name: "Follow Up", color: "#F59E0B" });
  } else if (
    analysis?.leftVoicemail ||
    /\bvoicemail\b|\bleave (?:a )?message\b|\bno answer\b/i.test(transcript)
  ) {
    defaultTags.push({ name: "Voicemail / No Answer", color: "#64748B" });
  }

  for (const tag of defaultTags) {
    const ensured = await ensureDefaultOutcomeTag(opts.ownerId, tag.name, tag.color);
    if (ensured?.id) {
      await addContactTagAssignment({ ownerId: opts.ownerId, contactId: opts.contactId, tagId: ensured.id }).catch(() => null);
    }
  }
}

async function applyConfiguredOutcomeTags(opts: {
  ownerId: string;
  contactId: string;
  taggingRaw: unknown;
  outcome: "completed" | "failed" | "skipped";
  haystack: string;
}) {
  const cfg = parseCallOutcomeTagging(opts.taggingRaw);
  if (!cfg.enabled) return { hasConfiguredActions: false };

  const tagIds =
    opts.outcome === "completed"
      ? cfg.onCompletedTagIds
      : opts.outcome === "failed"
        ? cfg.onFailedTagIds
        : cfg.onSkippedTagIds;

  for (const tagId of tagIds) {
    await addContactTagAssignment({ ownerId: opts.ownerId, contactId: opts.contactId, tagId }).catch(() => null);
  }

  for (const rule of cfg.rules.filter((rule) => ruleTargetsOutcome(rule.outcome, opts.outcome) && rule.tagIds.length)) {
    if (!outcomeRuleMatches(rule, opts.haystack)) continue;
    for (const tagId of rule.tagIds) {
      await addContactTagAssignment({ ownerId: opts.ownerId, contactId: opts.contactId, tagId }).catch(() => null);
    }
  }

  return { hasConfiguredActions: Boolean(tagIds.length || cfg.rules.length) };
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function manualCallTimeLimitSeconds(): number {
  const raw = Number(process.env.TWILIO_MANUAL_OUTBOUND_MAX_SECONDS || 45);
  if (!Number.isFinite(raw)) return 45;
  return Math.max(30, Math.min(180, Math.floor(raw)));
}

async function fetchTwilioCallStatus(ownerId: string, callSid: string): Promise<string | null> {
  const sid = String(callSid || "").trim();
  if (!sid) return null;

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls/${encodeURIComponent(sid)}.json`;
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: `Basic ${basic}` },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");

  try {
    const json = JSON.parse(text) as any;
    const status = typeof json?.status === "string" ? json.status.trim().toLowerCase() : "";
    return status || null;
  } catch {
    return null;
  }
}

async function forceCompleteTwilioCall(ownerId: string, callSid: string): Promise<boolean> {
  const sid = String(callSid || "").trim();
  if (!sid) return false;

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return false;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls/${encodeURIComponent(sid)}.json`;
  const form = new URLSearchParams();
  form.set("Status", "completed");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: twilioBasicAuthHeader(config),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null as any);

  return Boolean(res?.ok);
}

function mapTwilioToManualStatus(twilioStatus: string): "CALLING" | "COMPLETED" | "FAILED" {
  const s = String(twilioStatus || "").trim().toLowerCase();
  if (s === "completed") return "COMPLETED";
  if (s === "failed" || s === "busy" || s === "no-answer" || s === "canceled") return "FAILED";
  return "CALLING";
}

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

function twilioBasicAuthHeader(config: { accountSid: string; authToken: string }) {
  const basic = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  return `Basic ${basic}`;
}

async function fetchLatestRecordingSidForCall(ownerId: string, callSid: string): Promise<string | null> {
  const sid = String(callSid || "").trim();
  if (!sid) return null;

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return null;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Calls/${encodeURIComponent(sid)}/Recordings.json`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(config) },
  }).catch(() => null as any);

  if (!res?.ok) return null;
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;

  try {
    const json = JSON.parse(text) as any;
    const recordings = Array.isArray(json?.recordings) ? json.recordings : [];
    for (const r of recordings) {
      const rid = typeof r?.sid === "string" ? r.sid.trim() : "";
      if (rid) return rid;
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchTranscriptTextForRecording(ownerId: string, recordingSid: string): Promise<string | null> {
  const rid = String(recordingSid || "").trim();
  if (!rid) return null;

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return null;

  const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}/Transcriptions.json`;
  const listRes = await fetch(listUrl, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(config) },
  }).catch(() => null as any);

  if (!listRes?.ok) return null;
  const listText = await listRes.text().catch(() => "");
  if (!listText.trim()) return null;

  try {
    const json = JSON.parse(listText) as any;
    const transcriptions = Array.isArray(json?.transcriptions) ? json.transcriptions : [];
    for (const t of transcriptions) {
      const status = typeof t?.status === "string" ? t.status.trim().toLowerCase() : "";
      const inlineText = typeof t?.transcription_text === "string" ? t.transcription_text : "";
      if (status === "completed" && inlineText.trim()) return inlineText.trim();

      const tsid = typeof t?.sid === "string" ? t.sid.trim() : "";
      if (status === "completed" && tsid) {
        const detailUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Transcriptions/${encodeURIComponent(tsid)}.json`;
        const detailRes = await fetch(detailUrl, {
          method: "GET",
          headers: { authorization: twilioBasicAuthHeader(config) },
        }).catch(() => null as any);

        if (!detailRes?.ok) continue;
        const detailText = await detailRes.text().catch(() => "");
        if (!detailText.trim()) continue;
        try {
          const detail = JSON.parse(detailText) as any;
          const tt = typeof detail?.transcription_text === "string" ? detail.transcription_text.trim() : "";
          if (tt) return tt;
        } catch {
          // ignore
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchTwilioRecordingAudio(
  ownerId: string,
  recordingSid: string,
  ext: "mp3" | "wav",
): Promise<{ ok: true; bytes: ArrayBuffer; mimeType: string } | { ok: false; error: string }> {
  const rid = String(recordingSid || "").trim();
  if (!rid) return { ok: false, error: "Missing recording sid" };

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return { ok: false, error: "Twilio is not configured for this account." };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}.${ext}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { authorization: twilioBasicAuthHeader(config) },
    cache: "no-store",
  }).catch(() => null as any);

  if (!res) return { ok: false, error: "Failed to fetch recording audio" };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Twilio recording fetch failed (${res.status}): ${text.slice(0, 200)}` };
  }

  const bytes = await res.arrayBuffer();
  const size = bytes?.byteLength ?? 0;
  // OpenAI-compatible transcription endpoints typically cap uploads around 25MB.
  if (size > 24 * 1024 * 1024) return { ok: false, error: "Recording too large to transcribe automatically." };

  const mimeType = res.headers.get("content-type") || "audio/mpeg";
  return { ok: true, bytes, mimeType };
}



async function requestTranscription(ownerId: string, recordingSid: string, req: Request, token: string): Promise<boolean> {
  const rid = String(recordingSid || "").trim();
  if (!rid) return false;

  const config = await getOwnerTwilioSmsConfig(ownerId);
  if (!config) return false;

  const callbackUrl = webhookUrlFromRequest(
    req,
    `/api/public/twilio/ai-outbound-calls/manual-call/${encodeURIComponent(token)}/transcription`,
  );

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Recordings/${encodeURIComponent(rid)}/Transcriptions.json`;
  const form = new URLSearchParams();
  form.set("TranscriptionCallback", callbackUrl);
  form.set("TranscriptionCallbackMethod", "POST");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: twilioBasicAuthHeader(config),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  }).catch(() => null as any);

  return Boolean(res?.ok);
}

async function getManualCallRow(ownerId: string, id: string) {
  try {
    return (await prisma.portalAiOutboundCallManualCall.findFirst({
      where: { ownerId, id },
      select: {
        id: true,
        campaignId: true,
        toNumberE164: true,
        status: true,
        callSid: true,
        conversationId: true,
        recordingSid: true,
        recordingDurationSec: true,
        transcriptText: true,
        bookingAnalysisJson: true,
        lastError: true,
        webhookToken: true,
        createdAt: true,
        updatedAt: true,
      } as any,
    })) as any;
  } catch {
    return (await prisma.portalAiOutboundCallManualCall.findFirst({
      where: { ownerId, id },
      select: {
        id: true,
        campaignId: true,
        toNumberE164: true,
        status: true,
        callSid: true,
        conversationId: true,
        recordingSid: true,
        recordingDurationSec: true,
        transcriptText: true,
        lastError: true,
        webhookToken: true,
        createdAt: true,
        updatedAt: true,
      } as any,
    })) as any;
  }
}

async function runManualCallPostCallActions(opts: {
  ownerId: string;
  row: any;
  campaign: { id?: string | null; name?: string | null; bookingConfigJson?: unknown; callOutcomeTaggingJson?: unknown } | null;
  transcript: string;
  analysis: AiOutboundBookingTranscriptAnalysis | null;
  calendar: { id: string; title: string; meetingLocation?: string | null; meetingDetails?: string | null } | null;
}) {
  const transcript = String(opts.transcript || "").trim();
  if (!transcript) return;

  const analysis = opts.analysis;
  const fallbackName = String(analysis?.contactName || "").trim() || String(opts.row.toNumberE164 || "").trim() || "Outbound contact";
  const fallbackEmail = String(analysis?.email || "").trim() || null;
  const fallbackPhone = String(analysis?.phone || "").trim() || String(opts.row.toNumberE164 || "").trim() || null;

  const contactId = await findOrCreatePortalContact({
    ownerId: opts.ownerId,
    name: fallbackName,
    email: fallbackEmail,
    phone: fallbackPhone,
  }).catch(() => null);

  if (!contactId) return;

  const effectiveStatus = String(opts.row.status || "").trim().toUpperCase();
  const outcome: "completed" | "failed" | "skipped" = effectiveStatus === "FAILED" ? "failed" : "completed";
  const haystack = [transcript, String(analysis?.summary || ""), String(opts.row.lastError || "")].filter(Boolean).join("\n");
  const configured = await applyConfiguredOutcomeTags({
    ownerId: opts.ownerId,
    contactId,
    taggingRaw: opts.campaign?.callOutcomeTaggingJson,
    outcome,
    haystack,
  });

  if (!configured.hasConfiguredActions) {
    await applyDefaultManualOutcomeTags({ ownerId: opts.ownerId, contactId, analysis, transcript });
  }

  const contactName = fallbackName;
  const campaignName = String(opts.campaign?.name || "").trim() || "AI outbound call";
  const bookingWhen = parseIsoOrNull(analysis?.requestedDateTimeIso);
  const followUpWhen = parseIsoOrNull(analysis?.requestedFollowUpDateTimeIso) ?? new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (analysis?.booked) {
    const created = await createTaskForBookedCall({
      ownerId: opts.ownerId,
      bookingId: `ai-outbound-manual-${String(opts.row.id || "").trim()}`,
      calendarId: opts.calendar?.id ?? null,
      title: `Booked outbound call: ${contactName}`,
      contactName,
      contactEmail: fallbackEmail || "",
      contactPhone: fallbackPhone,
      notes: String(analysis.summary || "").trim() || transcript.slice(0, 1500),
      meetingLocation: opts.calendar?.meetingLocation ?? null,
      meetingDetails: opts.calendar?.meetingDetails ?? null,
      startAt: bookingWhen ?? followUpWhen,
    }).catch(() => false);

    if (created) {
      void tryNotifyPortalAccountUsers({
        ownerId: opts.ownerId,
        kind: "task_created",
        subject: `Booked outbound call task created: ${contactName}`,
        text: [
          `${campaignName} produced a booked-call outcome.`,
          "",
          `Contact: ${contactName}`,
          fallbackPhone ? `Phone: ${fallbackPhone}` : null,
          fallbackEmail ? `Email: ${fallbackEmail}` : null,
          analysis.requestedTimeText ? `Requested time: ${analysis.requestedTimeText}` : null,
          analysis.summary ? `Summary: ${analysis.summary}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      }).catch(() => null);
    }
    return;
  }

  if (analysis?.followUpRequested) {
    const title = analysis.followUpChannel === "text" ? `Text follow-up: ${contactName}` : `Outbound follow-up: ${contactName}`;
    const notes = [
      analysis.summary ? `Summary: ${analysis.summary}` : null,
      analysis.requestedFollowUpTimeText ? `Requested follow-up: ${analysis.requestedFollowUpTimeText}` : null,
      analysis.followUpChannel ? `Preferred channel: ${analysis.followUpChannel}` : null,
      transcript.slice(0, 1500),
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 2500);

    const created = await createTaskForAiOutboundFollowUp({
      ownerId: opts.ownerId,
      taskKey: `ai-outbound-followup-${String(opts.row.id || "").trim()}`,
      title,
      contactName,
      contactEmail: fallbackEmail,
      contactPhone: fallbackPhone,
      dueAt: followUpWhen,
      notes,
    }).catch(() => false);

    if (created) {
      void tryNotifyPortalAccountUsers({
        ownerId: opts.ownerId,
        kind: "task_created",
        subject: `${analysis.followUpChannel === "text" ? "Text" : "Call"} follow-up task created: ${contactName}`,
        text: [
          `${campaignName} needs a follow-up.`,
          "",
          `Contact: ${contactName}`,
          fallbackPhone ? `Phone: ${fallbackPhone}` : null,
          fallbackEmail ? `Email: ${fallbackEmail}` : null,
          analysis.requestedFollowUpTimeText ? `Requested follow-up: ${analysis.requestedFollowUpTimeText}` : null,
          analysis.summary ? `Summary: ${analysis.summary}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      }).catch(() => null);
    }
  }
}

async function analyzeManualCallTranscriptOutcome(opts: {
  ownerId: string;
  campaignName: string | null;
  bookingConfigRaw: unknown;
  transcript: string;
}) {
  const transcript = String(opts.transcript || "").trim();
  if (!transcript) return { analysis: null as AiOutboundBookingTranscriptAnalysis | null, calendar: null as { id: string; title: string; meetingLocation?: string | null; meetingDetails?: string | null } | null };

  const bookingConfig = parseAiOutboundBookingConfig(opts.bookingConfigRaw);
  const shouldLoadBookingContext = bookingConfig.enabled && bookingConfig.calendarId;

  const [calendarsConfig, bookingForm] = await Promise.all([
    shouldLoadBookingContext ? getBookingCalendarsConfig(opts.ownerId).catch(() => null) : Promise.resolve(null),
    getBookingFormConfig(opts.ownerId).catch(() => null),
  ]);

  const calendar = shouldLoadBookingContext
    ? calendarsConfig?.calendars?.find((item) => String(item.id) === String(bookingConfig.calendarId)) ?? null
    : null;

  const effectiveCalendar = calendar
    ? {
        id: String(calendar.id),
        title: String(calendar.title),
        meetingLocation: calendar.meetingLocation ?? null,
        meetingDetails: calendar.meetingDetails ?? null,
      }
    : null;

  const fallbackTitle = String(opts.campaignName || "").trim() || "Follow-up consultation";

  const analysis = await analyzeAiOutboundBookingTranscript({
    transcript,
    calendarTitle: effectiveCalendar?.title || fallbackTitle,
    meetingLocation: effectiveCalendar?.meetingLocation ?? null,
    meetingDetails: effectiveCalendar?.meetingDetails ?? null,
    form: bookingForm
      ? {
          phone: bookingForm.phone,
          notes: bookingForm.notes,
          questions: bookingForm.questions,
        }
      : null,
  }).catch(() => null);

  return { analysis, calendar: effectiveCalendar };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const parsed = idSchema.safeParse(params.id);
  if (!parsed.success) return jsonError("Invalid id", 400);

  const row = await getManualCallRow(ownerId, parsed.data);

  if (!row) return jsonError("Not found", 404);

  // Best-effort: reconcile stuck CALLING state with Twilio.
  if (row.status === "CALLING" && typeof row.callSid === "string" && row.callSid.trim()) {
    const twStatus = await fetchTwilioCallStatus(ownerId, row.callSid);
    if (twStatus) {
      const mapped = mapTwilioToManualStatus(twStatus);
      if (mapped !== "CALLING") {
        await prisma.portalAiOutboundCallManualCall
          .update({
            where: { id: row.id },
            data: {
              status: mapped,
              ...(mapped === "FAILED" ? { lastError: `Call status: ${twStatus}`.slice(0, 500) } : {}),
            },
            select: { id: true },
          })
          .catch(() => null);

        row.status = mapped;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    manualCall: {
      ...row,
      bookingAnalysis: (row as any).bookingAnalysisJson ?? null,
      createdAtIso: row.createdAt.toISOString(),
      updatedAtIso: row.updatedAt.toISOString(),
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "view");
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const parsed = idSchema.safeParse(params.id);
  if (!parsed.success) return jsonError("Invalid id", 400);

  const row = await getManualCallRow(ownerId, parsed.data);
  if (!row) return jsonError("Not found", 404);

  if (row.status === "CALLING" && typeof row.callSid === "string" && row.callSid.trim()) {
    const ageMs = Date.now() - row.createdAt.getTime();
    if (ageMs >= manualCallTimeLimitSeconds() * 1000) {
      const stopped = await forceCompleteTwilioCall(ownerId, row.callSid);
      if (stopped) {
        await prisma.portalAiOutboundCallManualCall
          .update({
            where: { id: row.id },
            data: {
              status: "COMPLETED",
              lastError: `Force-stopped after exceeding ${manualCallTimeLimitSeconds()} seconds.`.slice(0, 500),
            },
            select: { id: true },
          })
          .catch(() => null);
        row.status = "COMPLETED";
        row.lastError = `Force-stopped after exceeding ${manualCallTimeLimitSeconds()} seconds.`;
      }
    }
  }

  const twilio = await getOwnerTwilioSmsConfig(ownerId);
  if (!twilio) return jsonError("Twilio is not configured for this account.", 400);

  const updates: Record<string, any> = {};
  let requestedTranscription = false;
  let usedVoiceTranscript = false;

  const conversationId = String(row.conversationId || "").trim();
  const voiceApiKey = (await getProfileVoiceAgentApiKey(ownerId).catch(() => null)) || "";

  if (conversationId && /twilio\s+transcription/i.test(String(row.lastError || ""))) {
    updates.lastError = null;
  }

  // Prefer voice-platform transcript when available (Twilio transcription may be disabled).
  if (!String(row.transcriptText || "").trim() && conversationId && voiceApiKey.trim()) {
    const conv = await fetchElevenLabsConversationTranscript({ apiKey: voiceApiKey, conversationId });
    if (conv.ok && conv.transcript.trim()) {
      updates.transcriptText = conv.transcript.trim();
      usedVoiceTranscript = true;
      updates.lastError = null;
    } else if (!conv.ok) {
      // Keep this neutral; the portal should not nag about Twilio transcription when we expect voice transcript.
      const msg = String(conv.error || "").trim();
      if (msg && msg.toLowerCase().includes("missing") === false) {
        updates.lastError = `Transcript pending. ${msg}`.slice(0, 500);
      }
    }
  }

  if (!String(row.recordingSid || "").trim() && String(row.callSid || "").trim()) {
    const rid = await fetchLatestRecordingSidForCall(ownerId, row.callSid || "");
    if (rid) updates.recordingSid = rid;
  }

  const effectiveRecordingSid = String(updates.recordingSid ?? row.recordingSid ?? "").trim();
  const hasTranscriptAlready = Boolean(String(updates.transcriptText ?? row.transcriptText ?? "").trim());
  if (effectiveRecordingSid && !hasTranscriptAlready) {
    const txt = await fetchTranscriptTextForRecording(ownerId, effectiveRecordingSid);
    if (txt) {
      updates.transcriptText = txt;
      updates.lastError = null;
    } else if (row.webhookToken) {
      // Kick off transcription if it hasn't completed yet.
      requestedTranscription = await requestTranscription(ownerId, effectiveRecordingSid, req, row.webhookToken);
      if (!requestedTranscription) {
        // Avoid misleading Twilio messaging if we expect voice transcript.
        if (!conversationId || !voiceApiKey.trim()) {
          updates.lastError = "Transcript request failed. Transcription may be disabled for this account.";
        }
      }
    }
  }

  // Final fallback: always produce *some* transcript by transcribing the recording audio ourselves.
  // This avoids depending on ElevenLabs transcript availability and Twilio transcription settings.
  const stillNoTranscript = !String(updates.transcriptText ?? row.transcriptText ?? "").trim();
  if (effectiveRecordingSid && stillNoTranscript) {
    try {
      // Prefer real channel-separated transcript when Twilio recording is dual-channel.
      // IMPORTANT: keep the *full* transcript order as source-of-truth, then label segments by matching
      // against left/right channel transcripts. This prevents speaker lines being out-of-order.
      const wav = await fetchTwilioRecordingAudio(ownerId, effectiveRecordingSid, "wav");
      const mp3ForOrder = await fetchTwilioRecordingAudio(ownerId, effectiveRecordingSid, "mp3");
      if (wav.ok) {
        const split = splitStereoPcmWavToMonoWavs(wav.bytes);

        const [left, right, full] = await Promise.all([
          transcribeAudioVerbose({ bytes: split.leftWav, filename: `${effectiveRecordingSid}-left.wav`, mimeType: "audio/wav" }),
          transcribeAudioVerbose({ bytes: split.rightWav, filename: `${effectiveRecordingSid}-right.wav`, mimeType: "audio/wav" }),
          mp3ForOrder.ok
            ? transcribeAudioVerbose({ bytes: mp3ForOrder.bytes, filename: `${effectiveRecordingSid}.mp3`, mimeType: mp3ForOrder.mimeType || "audio/mpeg" })
            : Promise.resolve({ text: "", segments: [] }),
        ]);

        const combined = buildSpeakerTranscriptAlignedToFull({
          full,
          left,
          right,
          leftLabel: "Recipient",
          rightLabel: "Agent",
          maxChars: 25000,
        });

        if (combined.trim()) {
          updates.transcriptText = combined.trim().slice(0, 25000);
          updates.lastError = null;
        }
      }

      if (!String(updates.transcriptText ?? row.transcriptText ?? "").trim()) {
        // Fallback: single-pass transcription of compressed audio.
        const audio = mp3ForOrder.ok ? mp3ForOrder : await fetchTwilioRecordingAudio(ownerId, effectiveRecordingSid, "mp3");
        if (audio.ok) {
          const text = await transcribeAudio({
            bytes: audio.bytes,
            filename: `${effectiveRecordingSid}.mp3`,
            mimeType: audio.mimeType,
          });
          const cleaned = String(text || "").trim();
          if (cleaned) {
            updates.transcriptText = cleaned.slice(0, 25000);
            updates.lastError = null;
          }
        } else if (!String(updates.lastError ?? row.lastError ?? "").trim()) {
          updates.lastError = `Transcript pending. ${audio.error}`.slice(0, 500);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unable to transcribe recording";
      updates.lastError = `Transcript pending. ${msg}`.slice(0, 500);
    }
  }

  // If we ended up with a transcript, clear any old “transcription failed” warnings.
  if (String(updates.transcriptText ?? row.transcriptText ?? "").trim()) {
    if (String(updates.lastError ?? row.lastError ?? "").toLowerCase().includes("transcript")) {
      updates.lastError = null;
    }
  }

  const effectiveTranscript = String(updates.transcriptText ?? row.transcriptText ?? "").trim();
  let campaignRow:
    | { id?: string | null; name?: string | null; bookingConfigJson?: unknown; callOutcomeTaggingJson?: unknown }
    | null = null;
  let calendarForActions: { id: string; title: string; meetingLocation?: string | null; meetingDetails?: string | null } | null = null;
  if (row.campaignId) {
    campaignRow = await prisma.portalAiOutboundCallCampaign
      .findFirst({
        where: { ownerId, id: String(row.campaignId) },
        select: { id: true, name: true, bookingConfigJson: true, callOutcomeTaggingJson: true } as any,
      })
      .catch(() => null);
  }

  if (effectiveTranscript) {
    const analyzed = await analyzeManualCallTranscriptOutcome({
      ownerId,
      campaignName: String(campaignRow?.name || "").trim() || null,
      bookingConfigRaw: (campaignRow as any)?.bookingConfigJson,
      transcript: effectiveTranscript,
    });
    if (analyzed.calendar) calendarForActions = analyzed.calendar;
    if (analyzed.analysis) updates.bookingAnalysisJson = analyzed.analysis as any;
  }

  const effectiveAnalysis = ((updates.bookingAnalysisJson ?? row.bookingAnalysisJson ?? null) || null) as AiOutboundBookingTranscriptAnalysis | null;
  if (effectiveTranscript) {
    await runManualCallPostCallActions({
      ownerId,
      row,
      campaign: campaignRow,
      transcript: effectiveTranscript,
      analysis: effectiveAnalysis,
      calendar: calendarForActions,
    }).catch(() => null);
  }

  if (Object.keys(updates).length) {
    await prisma.portalAiOutboundCallManualCall
      .update({
        where: { id: row.id },
        data: updates,
        select: { id: true },
      })
      .catch(() => null);
  }

  const latest = await getManualCallRow(ownerId, parsed.data);
  if (!latest) return jsonError("Not found", 404);

  return NextResponse.json({
    ok: true,
    requestedTranscription,
    usedVoiceTranscript,
    manualCall: {
      ...latest,
      bookingAnalysis: (latest as any).bookingAnalysisJson ?? null,
      createdAtIso: latest.createdAt.toISOString(),
      updatedAtIso: latest.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireClientSessionForService("aiOutboundCalls", "edit");
  if (!auth.ok) {
    return jsonError(auth.status === 401 ? "Unauthorized" : "Forbidden", auth.status);
  }

  const ownerId = auth.session.user.id;
  const params = await ctx.params;
  const parsed = idSchema.safeParse(params.id);
  if (!parsed.success) return jsonError("Invalid id", 400);

  const row = await getManualCallRow(ownerId, parsed.data);
  if (!row) return jsonError("Not found", 404);

  await prisma.portalAiOutboundCallManualCall.delete({
    where: { id: row.id },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
