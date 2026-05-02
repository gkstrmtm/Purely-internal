import { generateText } from "@/lib/ai";

export type AiOutboundBookingConfig = {
  enabled: boolean;
  calendarId?: string | null;
};

export type AiOutboundBookingQuestion = {
  id: string;
  label: string;
  required: boolean;
  kind: "short" | "long" | "single_choice" | "multiple_choice";
  options?: string[];
};

export type AiOutboundBookingFormConfig = {
  phone?: { enabled: boolean; required: boolean };
  notes?: { enabled: boolean; required: boolean };
  questions?: AiOutboundBookingQuestion[];
};

export type AiOutboundBookingTranscriptAnalysis = {
  version: 1;
  analyzedAtIso: string;
  booked: boolean;
  needsBooking: boolean;
  followUpRequested: boolean;
  followUpChannel: "call" | "text" | "email" | "unspecified" | null;
  requestedFollowUpDateTimeIso: string | null;
  requestedFollowUpTimeText: string | null;
  doNotCall: boolean;
  leftVoicemail: boolean;
  requestedDateTimeIso: string | null;
  requestedTimeText: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  answers: Array<{ question: string; answer: string; required: boolean }>;
  missingRequiredFields: string[];
  summary: string;
  confidence: "low" | "medium" | "high";
};

function safeRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function normalizeString(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

function normalizeStringOrNull(raw: unknown, max: number): string | null {
  const value = normalizeString(raw, max);
  return value || null;
}

function normalizeStringList(raw: unknown, maxItems: number, maxLen: number): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of list) {
    const value = normalizeString(item, maxLen);
    if (!value) continue;
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMinute(date: Date): Date {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
}

function parseTimeComponents(raw: string): { hours: number; minutes: number } | null {
  const text = String(raw || "").toLowerCase();
  const match = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const meridiem = String(match[3] || "").replace(/\./g, "");
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return { hours, minutes };
}

function maybeBuildRelativeDateTime(requestedTimeText: string | null, now: Date): string | null {
  const text = String(requestedTimeText || "").trim().toLowerCase();
  if (!text) return null;

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  let target = startOfMinute(now);
  let matched = false;

  if (/\btomorrow\b/.test(text)) {
    target = addDays(target, 1);
    matched = true;
  } else if (/\btoday\b/.test(text)) {
    matched = true;
  } else {
    const weekdayIndex = weekdays.findIndex((day) => new RegExp(`\\b${day}\\b`).test(text));
    if (weekdayIndex >= 0) {
      const currentDay = target.getDay();
      let delta = (weekdayIndex - currentDay + 7) % 7;
      if (delta === 0) delta = 7;
      if (/\bnext\b/.test(text) && delta < 7) delta += 7;
      target = addDays(target, delta);
      matched = true;
    }
  }

  if (!matched) return null;

  const time = parseTimeComponents(text);
  if (time) {
    target.setHours(time.hours, time.minutes, 0, 0);
  } else if (/\bmorning\b/.test(text)) {
    target.setHours(9, 0, 0, 0);
  } else if (/\bafternoon\b/.test(text)) {
    target.setHours(15, 0, 0, 0);
  } else if (/\bevening\b/.test(text)) {
    target.setHours(18, 0, 0, 0);
  }

  return target.toISOString();
}

function normalizeRequestedDateTimeIso(raw: unknown, requestedTimeText: string | null, now = new Date()): string | null {
  const value = normalizeString(raw, 80);
  if (value) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      const nowMs = now.getTime();
      const parsedMs = parsed.getTime();
      const looksRelativeFuture = /\btomorrow\b|\bnext\b|\btoday\b|\bmonday\b|\btuesday\b|\bwednesday\b|\bthursday\b|\bfriday\b|\bsaturday\b|\bsunday\b/i.test(
        String(requestedTimeText || ""),
      );
      const tooFarPast = parsedMs < nowMs - 7 * 24 * 60 * 60 * 1000;
      if (!(looksRelativeFuture && tooFarPast)) {
        return parsed.toISOString();
      }
    }
  }

  return maybeBuildRelativeDateTime(requestedTimeText, now);
}

export function parseAiOutboundBookingConfig(raw: unknown): AiOutboundBookingConfig {
  const rec = safeRecord(raw);
  const calendarId = normalizeString(rec.calendarId, 120);
  return {
    enabled: Boolean(rec.enabled),
    calendarId: calendarId || null,
  };
}

export function buildAiOutboundBookingPrompt({
  calendarTitle,
  meetingLocation,
  meetingDetails,
  form,
}: {
  calendarTitle: string;
  meetingLocation?: string | null;
  meetingDetails?: string | null;
  form?: AiOutboundBookingFormConfig | null;
}): string {
  const questions: string[] = [];

  if (form?.phone?.enabled) {
    questions.push(`- Ask for the best callback phone number${form.phone.required ? " and treat it as required" : " if it is missing or unclear"}.`);
  }

  if (form?.notes?.enabled) {
    questions.push(`- Ask for notes or anything they want the team to know${form.notes.required ? "; this is required before confirming the booking" : " when it would help the booking"}.`);
  }

  for (const question of Array.isArray(form?.questions) ? form?.questions : []) {
    const opts = Array.isArray(question.options) && question.options.length ? ` Options: ${question.options.join(", ")}.` : "";
    questions.push(`- ${question.required ? "Required" : "Optional"}: ${question.label}.${opts}`);
  }

  return [
    `Booking is enabled for the calendar \"${calendarTitle}\".`,
    "If the person wants a call, you may help them get booked.",
    "Never claim the booking is fully confirmed inside the live system. Gather details clearly so the system can finalize the booking.",
    "Capture the requested day/time, email, phone number, and any required intake answers.",
    "If they are not ready to book yet, note that a booking is still needed instead of forcing a yes.",
    meetingLocation ? `Preferred meeting location context: ${meetingLocation}` : null,
    meetingDetails ? `Meeting details context: ${meetingDetails}` : null,
    questions.length ? `Booking intake requirements:\n${questions.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractJsonObject(raw: string): string {
  const text = String(raw || "").trim();
  if (!text) return "{}";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function applyTranscriptHeuristics(
  analysis: AiOutboundBookingTranscriptAnalysis,
  transcriptText: string,
): AiOutboundBookingTranscriptAnalysis {
  const transcript = String(transcriptText || "").trim();
  if (!transcript) return analysis;

  const normalized = transcript.toLowerCase();
  const explicitDoNotCall = /\b(?:do not call|don't call|stop calling|stop contacting|remove me|take me off|leave me alone)\b/i.test(normalized);
  const hostileRecipientRejection = /^recipient:\s*(?:nah|nope?|not interested|leave me alone|go away)\b.*(?:fuck|idiot|moron|asshole|bitch|retard)/im.test(transcript);

  if (explicitDoNotCall || hostileRecipientRejection) {
    return {
      ...analysis,
      booked: false,
      needsBooking: false,
      followUpRequested: false,
      followUpChannel: null,
      requestedFollowUpDateTimeIso: null,
      requestedFollowUpTimeText: null,
      doNotCall: true,
      summary: explicitDoNotCall
        ? "The recipient explicitly asked not to be contacted again, so this should be treated as do not call."
        : "The recipient rejected the call in a hostile way, so this should be treated as do not call.",
      confidence: analysis.confidence === "low" ? "medium" : analysis.confidence,
    };
  }

  return analysis;
}

export function parseAiOutboundBookingTranscriptAnalysis(raw: unknown): AiOutboundBookingTranscriptAnalysis {
  const rec = safeRecord(raw);
  const answersRaw = Array.isArray(rec.answers) ? rec.answers : [];
  const answers = answersRaw
    .map((item) => {
      const row = safeRecord(item);
      const question = normalizeString(row.question, 200);
      const answer = normalizeString(row.answer, 2000);
      if (!question || !answer) return null;
      return { question, answer, required: Boolean(row.required) };
    })
    .filter(Boolean) as Array<{ question: string; answer: string; required: boolean }>;

  const requestedTimeText = normalizeStringOrNull(rec.requestedTimeText, 240);
  const requestedFollowUpTimeText = normalizeStringOrNull(rec.requestedFollowUpTimeText, 240);
  const now = new Date();
  const requestedDateTimeIso = normalizeRequestedDateTimeIso(rec.requestedDateTimeIso, requestedTimeText, now);
  const requestedFollowUpDateTimeIso = normalizeRequestedDateTimeIso(rec.requestedFollowUpDateTimeIso, requestedFollowUpTimeText, now);
  const confidenceRaw = normalizeString(rec.confidence, 20).toLowerCase();
  const confidence = confidenceRaw === "low" || confidenceRaw === "high" ? (confidenceRaw as "low" | "high") : "medium";
  const followUpChannelRaw = normalizeString(rec.followUpChannel, 20).toLowerCase();
  const followUpChannel =
    followUpChannelRaw === "call" ||
    followUpChannelRaw === "text" ||
    followUpChannelRaw === "email" ||
    followUpChannelRaw === "unspecified"
      ? (followUpChannelRaw as "call" | "text" | "email" | "unspecified")
      : null;

  return {
    version: 1,
    analyzedAtIso: new Date().toISOString(),
    booked: Boolean(rec.booked),
    needsBooking: Boolean(rec.needsBooking),
    followUpRequested: Boolean(rec.followUpRequested),
    followUpChannel,
    requestedFollowUpDateTimeIso,
    requestedFollowUpTimeText: normalizeStringOrNull(rec.requestedFollowUpTimeText, 240),
    doNotCall: Boolean(rec.doNotCall),
    leftVoicemail: Boolean(rec.leftVoicemail),
    requestedDateTimeIso,
    requestedTimeText,
    contactName: normalizeStringOrNull(rec.contactName, 160),
    email: normalizeStringOrNull(rec.email, 240),
    phone: normalizeStringOrNull(rec.phone, 80),
    answers,
    missingRequiredFields: normalizeStringList(rec.missingRequiredFields, 40, 200),
    summary: normalizeString(rec.summary, 1200),
    confidence,
  };
}

export async function analyzeAiOutboundBookingTranscript({
  transcript,
  calendarTitle,
  meetingLocation,
  meetingDetails,
  form,
}: {
  transcript: string;
  calendarTitle: string;
  meetingLocation?: string | null;
  meetingDetails?: string | null;
  form?: AiOutboundBookingFormConfig | null;
}): Promise<AiOutboundBookingTranscriptAnalysis | null> {
  const transcriptText = normalizeString(transcript, 25000);
  if (!transcriptText) return null;

  const raw = await generateText({
    system:
      "You analyze outbound call transcripts for booking intent. Return JSON only. Be conservative and never invent missing facts.",
    user: [
      `Calendar: ${calendarTitle}`,
      `Current date/time ISO: ${new Date().toISOString()}`,
      meetingLocation ? `Meeting location: ${meetingLocation}` : null,
      meetingDetails ? `Meeting details: ${meetingDetails}` : null,
      form ? `Form config: ${JSON.stringify(form)}` : null,
      "Return a JSON object with fields booked, needsBooking, followUpRequested, followUpChannel, requestedFollowUpDateTimeIso, requestedFollowUpTimeText, doNotCall, leftVoicemail, requestedDateTimeIso, requestedTimeText, contactName, email, phone, answers, missingRequiredFields, summary, confidence.",
      "Set booked=true only when the transcript clearly shows a meeting/appointment/demo was actually scheduled or firmly confirmed.",
      "Set followUpRequested=true when the prospect asks for a callback, a text later, an email follow-up, or a better time. Use followUpChannel when it is clear.",
      "Set doNotCall=true when they ask not to be contacted again or clearly revoke permission.",
      "Set leftVoicemail=true when the transcript is a voicemail drop or no-answer voicemail outcome.",
      transcriptText,
    ]
      .filter(Boolean)
      .join("\n\n"),
    model: process.env.AI_MODEL ?? "gpt-5.4",
    temperature: 0.1,
  });

  return applyTranscriptHeuristics(
    parseAiOutboundBookingTranscriptAnalysis(JSON.parse(extractJsonObject(raw))),
    transcriptText,
  );
}