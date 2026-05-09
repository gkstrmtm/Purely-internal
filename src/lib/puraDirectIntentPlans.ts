import type { PortalAgentActionKey } from "@/lib/portalAgentActions";
import { encodeScheduledActionEnvelope } from "@/lib/portalAiChatScheduledActionEnvelope";
import { detectPuraDirectIntentSignals, type PuraDirectIntentContext, type PuraDirectIntentSignals } from "@/lib/puraDirectIntentSignals";
import { getPuraIntentSignals } from "@/lib/puraIntent";

export type PuraDirectActionStep = {
  action: PortalAgentActionKey;
  traceTitle: string;
  args: Record<string, unknown>;
};

export type PuraDirectActionPlan = PuraDirectActionStep & {
  steps?: PuraDirectActionStep[];
};

type DirectTaskCreateIntent = {
  title: string;
  description?: string;
  dueAtIso?: string;
  assignedToUserId?: string;
};

type DirectSmsSendIntent = {
  to?: string;
  contactHint?: string;
  body: string;
};

type DirectEmailSendIntent = {
  to: string;
  subject?: string;
  body: string;
};

type DirectWeekdayScheduledSmsIntent = {
  contactHint: string;
  timeLocal: string;
  body: string;
};

type DirectAiChatScheduledReminderIntent = {
  sendAtIso: string;
  text: string;
};

type DirectRecurringAiChatIntent = {
  cleanedPrompt: string;
  runNow: boolean;
  repeatEveryMinutes: number;
  sendAtIso: string;
};

type DirectBookingReminderSettingsIntent = {
  enabled: boolean;
  settings: {
    version: 4;
    enabled: boolean;
    customVariables: Record<string, string>;
    steps: Array<{
      id: string;
      enabled: boolean;
      kind: "SMS" | "EMAIL";
      leadTime: { value: number; unit: "minutes" | "hours" | "days" | "weeks" };
      subjectTemplate?: string;
      messageBody: string;
    }>;
  };
};

type DirectBookingSettingsUpdateIntent = {
  title?: string;
  description?: string;
  durationMinutes?: number;
  wantsSettingsView?: boolean;
  wantsLiveBookingLink?: boolean;
};

type DirectAiReceptionistGreetingIntent = {
  greeting: string;
};

type DirectReviewSettingsIntent = {
  settings: {
    enabled: boolean;
    automation: {
      autoSend: boolean;
      manualSend: boolean;
    };
    sendAfter: {
      value: number;
      unit: "minutes" | "hours" | "days" | "weeks";
    };
    messageTemplate?: string;
  };
};

type DirectFollowUpSettingsIntent = {
  settings: {
    version: 4;
    enabled: boolean;
    assignments: {
      defaultSteps: Array<{
        id: string;
        name: string;
        enabled: boolean;
        delayMinutes: number;
        kind: "SMS" | "EMAIL";
        audience: "CONTACT";
        sms?: {
          bodyTemplate: string;
        };
        email?: {
          subjectTemplate: string;
          bodyTemplate: string;
        };
      }>;
    };
  };
};

type DirectBlogAutomationSettingsIntent = {
  enabled: boolean;
  frequencyDays: number;
  topics: string[];
  autoPublish: boolean;
};

type DirectNewsletterAutomationSettingsIntent = {
  kind: "external" | "internal";
  enabled: boolean;
  frequencyDays: number;
  requireApproval: boolean;
  topics: string[];
};

type DirectMissedCallTextBackSettingsIntent = {
  settings: {
    enabled: boolean;
    replyDelaySeconds: number;
    replyBody: string;
  };
};

type DirectLeadScrapingSettingsIntent = {
  settings: {
    b2b: {
      niche: string;
      location: string;
      requireEmail: boolean;
      requirePhone: boolean;
      scheduleEnabled: boolean;
      frequencyDays: number;
    };
  };
};

type DirectAiOutboundCampaignIntent = {
  name: string;
  goal?: string;
  firstMessage?: string;
  activate?: boolean;
};

type DirectAiOutboundManualCallIntent = {
  toNumber: string;
  goal?: string;
  campaignHint?: string;
  firstMessage?: string;
};

const MAX_DIRECT_TASK_BATCH_STEPS = 18;

function cleanQuotedText(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^["“'`]+/, "")
    .replace(/["”'`]+$/, "")
    .replace(/[.]+$/g, "")
    .trim();
}

function preserveTrailingSentencePunctuation(source: string, normalized: string): string {
  const cleanSource = String(source || "").trim();
  const cleanNormalized = String(normalized || "").trim();
  if (!cleanNormalized) return "";
  if (/[.!?]$/.test(cleanNormalized)) return cleanNormalized;
  const punctuationMatch = cleanSource.match(/([.!?])["”'`\]]*\s*$/);
  return punctuationMatch?.[1] ? `${cleanNormalized}${punctuationMatch[1]}` : cleanNormalized;
}

function normalizeRecipientHint(value: string): string {
  return cleanQuotedText(
    String(value || "")
      .replace(/^in\s+the\s+(?:sms\s+)?(?:thread|conversation)\s+with\s+/i, "")
      .replace(/^(?:the\s+)?(?:sms\s+)?(?:thread|conversation)\s+with\s+/i, "")
      .replace(/^with\s+/i, "")
      .replace(/^contact\s+/i, "")
      .trim(),
  );
}

function lastInboxThreadIdFromContext(threadContext: PuraDirectIntentContext | null | undefined): string {
  const directId =
    threadContext && typeof threadContext === "object" && typeof threadContext.lastInboxThread?.id === "string"
      ? String(threadContext.lastInboxThread.id).trim()
      : "";
  if (directId) return directId;
  const rawCanvasUrl =
    threadContext && typeof threadContext === "object" && typeof threadContext.lastCanvasUrl === "string"
      ? String(threadContext.lastCanvasUrl).trim()
      : "";
  if (!rawCanvasUrl) return "";
  try {
    const url = new URL(rawCanvasUrl, "https://purelyautomation.local");
    return String(url.searchParams.get("threadId") || "").trim();
  } catch {
    const match = rawCanvasUrl.match(/[?&]threadId=([^&]+)/i);
    return match?.[1] ? decodeURIComponent(String(match[1])) : "";
  }
}

function isImplicitRecipientHint(value: string): boolean {
  const hintLower = String(value || "").toLowerCase().trim();
  if (!hintLower) return true;
  return ["him", "her", "them", "that", "that one", "this", "this one", "same", "same one", "same person", "that contact", "this contact", "again"].some(
    (w) => hintLower === w || hintLower.endsWith(` ${w}`) || hintLower.startsWith(`${w} `) || hintLower.includes(` ${w} `),
  );
}

function trimOutboundConfigTail(value: string): string {
  const normalized = cleanQuotedText(String(value || ""));
  return cleanQuotedText(
    normalized
      .replace(/(?:\s*,|\s+and)\s*(?:say|saying|open\s+with|start\s+with|first\s+message(?:\s+is)?\s*:?)\b[\s\S]*$/i, "")
      .replace(/(?:\s*,|\s+and)\s*(?:activate(?:\s+it)?|launch(?:\s+it)?|start(?:\s+it)?|turn\s+(?:it\s+)?on|make\s+(?:it\s+)?active)\s*$/i, "")
      .trim(),
  );
}

function trimOutboundAudienceTail(value: string): string {
  return cleanQuotedText(
    String(value || "")
      .replace(/\s+for\s+(?:leads?|customers?|prospects?|contacts?|people)\b[\s\S]*$/i, "")
      .trim(),
  );
}

function extractPromptSegment(prompt: string, markers: string[], stopMarkers: string[]): string {
  const raw = String(prompt || "");
  const lower = raw.toLowerCase();
  let start = -1;
  let markerLength = 0;

  for (const marker of markers) {
    const index = lower.indexOf(marker);
    if (index >= 0 && (start < 0 || index < start)) {
      start = index;
      markerLength = marker.length;
    }
  }

  if (start < 0) return "";

  let end = raw.length;
  for (const stopMarker of stopMarkers) {
    const index = lower.indexOf(stopMarker, start + markerLength);
    if (index >= 0 && index < end) {
      end = index;
    }
  }

  return raw.slice(start + markerLength, end);
}

function stripTrailingFollowOnInstruction(value: string): string {
  return String(value || "")
    .replace(/(?:\s|,|;)+(?:then|next|after that)\b[\s\S]*$/i, "")
    .replace(/([.!?])\s+(?:tell|show|summarize|list|get|check|review)\b[\s\S]*$/i, "$1")
    .trim();
}

function parseTimeTo24Hour(value: string): { hour: number; minute: number; hhmm: string } | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "noon") return { hour: 12, minute: 0, hhmm: "12:00" };
  if (raw === "midnight") return { hour: 0, minute: 0, hhmm: "00:00" };
  const match = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!match) return null;
  let hour = Number(match[1] || 0);
  const minute = Number(match[2] || 0);
  const meridiem = String(match[3] || "").toLowerCase();
  if (!(hour >= 1 && hour <= 12) || !(minute >= 0 && minute <= 59)) return null;
  if (meridiem === "am") hour = hour === 12 ? 0 : hour;
  if (meridiem === "pm") hour = hour === 12 ? 12 : hour + 12;
  return { hour, minute, hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

function nextWeekdayDate(base: Date, weekday: number): Date {
  const result = new Date(base);
  const current = result.getDay();
  let diff = (weekday - current + 7) % 7;
  if (diff === 0) diff = 7;
  result.setDate(result.getDate() + diff);
  return result;
}

function getDirectIntentTimeZoneHint(threadContext: PuraDirectIntentContext | null | undefined): string {
  const candidates = [
    typeof threadContext?.ownerTimeZone === "string" ? threadContext.ownerTimeZone : "",
    typeof (threadContext as any)?.viewerTimeZone === "string" ? String((threadContext as any).viewerTimeZone) : "",
    typeof (threadContext as any)?.clientTimeZone === "string" ? String((threadContext as any).clientTimeZone) : "",
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim().slice(0, 80);
    if (!value) continue;
    try {
      Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
      return value;
    } catch {
      // ignore invalid timezone
    }
  }
  return "";
}

function getZonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; weekday: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const weekdayName = pick("weekday").toLowerCase();
  const weekdayMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return {
    year: Number(pick("year") || 0),
    month: Number(pick("month") || 0),
    day: Number(pick("day") || 0),
    weekday: weekdayMap[weekdayName] ?? 0,
    hour: Number(pick("hour") || 0),
    minute: Number(pick("minute") || 0),
    second: Number(pick("second") || 0),
  };
}

function shiftCalendarDate(parts: { year: number; month: number; day: number }, deltaDays: number) {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function zonedLocalDateTimeToIso(opts: { year: number; month: number; day: number; hour: number; minute: number; timeZone: string }): string {
  const desiredUtc = Date.UTC(opts.year, opts.month - 1, opts.day, opts.hour, opts.minute, 0);
  let candidate = new Date(desiredUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getZonedParts(candidate, opts.timeZone);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0);
    const diffMs = desiredUtc - actualUtc;
    if (diffMs === 0) break;
    candidate = new Date(candidate.getTime() + diffMs);
  }
  return candidate.toISOString();
}

function parseRelativeDueAtIso(prompt: string, timeZoneHint?: string | null): string | null {
  const lower = String(prompt || "").toLowerCase();
  const timeMatch = lower.match(/\b(?:at|for)\s+(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i) || lower.match(/\b(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  const parsedTime = parseTimeTo24Hour(timeMatch?.[1] || "9am");
  if (!parsedTime) return null;

  const timeZone = String(timeZoneHint || "").trim();
  if (timeZone) {
    const baseParts = getZonedParts(new Date(), timeZone);
    const weekdayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    let targetDate = { year: baseParts.year, month: baseParts.month, day: baseParts.day };
    if (/\btomorrow\b/i.test(lower)) {
      targetDate = shiftCalendarDate(targetDate, 1);
    } else {
      const weekdayMatch = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
      if (weekdayMatch?.[1]) {
        const desiredWeekday = weekdayMap[String(weekdayMatch[1]).toLowerCase()] ?? 1;
        let diff = (desiredWeekday - baseParts.weekday + 7) % 7;
        if (diff === 0) diff = 7;
        targetDate = shiftCalendarDate(targetDate, diff);
      } else {
        return null;
      }
    }

    return zonedLocalDateTimeToIso({
      ...targetDate,
      hour: parsedTime.hour,
      minute: parsedTime.minute,
      timeZone,
    });
  }

  const base = new Date();
  let target = new Date(base);

  if (/\btomorrow\b/i.test(lower)) {
    target.setDate(target.getDate() + 1);
  } else {
    const weekdayMatch = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (weekdayMatch?.[1]) {
      const weekdayMap: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
      };
      target = nextWeekdayDate(base, weekdayMap[String(weekdayMatch[1]).toLowerCase()] ?? 1);
    } else {
      return null;
    }
  }

  target.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
  return target.toISOString();
}

function normalizeReminderLeadUnit(raw: string): "minutes" | "hours" | "days" | "weeks" {
  const unit = String(raw || "").trim().toLowerCase();
  if (unit.startsWith("week")) return "weeks";
  if (unit.startsWith("day")) return "days";
  if (unit.startsWith("hour")) return "hours";
  return "minutes";
}

function delayUnitToMinutes(value: number, unit: "minutes" | "hours" | "days" | "weeks"): number {
  if (unit === "weeks") return value * 7 * 24 * 60;
  if (unit === "days") return value * 24 * 60;
  if (unit === "hours") return value * 60;
  return value;
}

function extractTopicsFromPromptSegment(raw: string): string[] {
  const cleaned = String(raw || "")
    .replace(/^about\s+/i, "")
    .replace(/\s+topics?\s*:?\s*/i, " ")
    .replace(/[.]+$/g, "")
    .trim();
  if (!cleaned) return [];
  const items = cleaned
    .split(/,|\band\b/gi)
    .map((item) => cleanQuotedText(item).slice(0, 200))
    .filter(Boolean);
  return items.filter((item, index) => items.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index).slice(0, 20);
}

function extractDirectBookingReminderSettingsIntent(prompt: string): DirectBookingReminderSettingsIntent | null {
  const raw = String(prompt || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const mentionsBookingOrAppointment = /\b(booking|appointment|appointments)\b/.test(lower);
  const mentionsReminder = /\breminders?\b/.test(lower);
  if (!(mentionsReminder && mentionsBookingOrAppointment) && !/booking reminders?|appointment reminders?/.test(lower)) return null;

  const wantsDisable = /\b(turn off|disable|stop|pause)\b/.test(lower);
  const wantsEnable = /\b(turn on|enable|set up|setup|configure|update)\b/.test(lower);
  if (!wantsDisable && !wantsEnable) return null;

  const matches = Array.from(raw.matchAll(/\b(email|text|sms)(?:\s+reminder)?\s+(\d+)\s+(minutes?|hours?|days?|weeks?)\s+before\b/gi));
  if (!matches.length && !wantsDisable) return null;

  const steps = wantsDisable
    ? []
    : matches.map((match, index) => {
        const channel = String(match[1] || "").trim().toLowerCase();
        const value = Math.max(1, Number(match[2] || 0));
        const unit = normalizeReminderLeadUnit(String(match[3] || ""));
        const kind: "EMAIL" | "SMS" = channel === "email" ? "EMAIL" : "SMS";
        const messageBody =
          kind === "EMAIL"
            ? "Hi {contactName}, this is a reminder that your appointment is scheduled for {when}. Please reply if you need to reschedule."
            : "Reminder: your appointment is scheduled for {when}. Reply if you need to reschedule.";
        return {
          id: `step_${index + 1}`,
          enabled: true,
          kind,
          leadTime: { value, unit },
          ...(kind === "EMAIL" ? { subjectTemplate: "Appointment reminder: {when}" } : {}),
          messageBody,
        };
      });

  return {
    enabled: !wantsDisable,
    settings: {
      version: 4,
      enabled: !wantsDisable,
      customVariables: {},
      steps,
    },
  };
}

function extractDirectBookingSettingsUpdateIntent(prompt: string): DirectBookingSettingsUpdateIntent | null {
  const raw = String(prompt || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const mentionsBookingSettingsSurface =
    /booking settings|booking settings page|leave me on booking settings|booking page settings/.test(lower) ||
    (/live booking link|booking link|public booking link/.test(lower) && /booking/.test(lower));
  if (!mentionsBookingSettingsSurface) return null;

  const wantsUpdate = /\b(rename|update|change|set|edit|tweak|work|put|add)\b/.test(lower);
  if (!wantsUpdate) return null;

  const title = cleanQuotedText(
    raw.match(/\b(?:rename|change|update)\s+(?:this|it|the booking|the booking title|title)?\s*to\s+["“]?([^"”,\n.?!]{1,80})/i)?.[1] ||
      raw.match(/\btitle\s+(?:is|should be|needs to be)\s+["“]?([^"”,\n.?!]{1,80})/i)?.[1] ||
      raw.match(/\bbooking title\s+to\s+["“]?([^"”,\n.?!]{1,80})/i)?.[1] ||
      "",
  ).slice(0, 80);

  const description = cleanQuotedText(
    raw.match(/\bdescription\s+to\s+["“]?([^"”\n]{1,400})/i)?.[1] ||
      raw.match(/\bdescription\s+(?:is|should be|needs to be|says)\s+["“]?(.+?)(?=(?:,?\s+(?:and\s+)?the\s+(?:meeting\s+)?duration\s+(?:is|should be|needs to be|to)\b|,?\s+(?:set|make|change)\s+(?:it|this|the duration)?\s*to\b|,?\s+and\s+(?:turn\s+(?:on|off)|enable|disable|update|configure)\s+booking\s+reminders?\b|,?\s+and\s+update\s+the\s+ai\s+receptionist\b|,?\s+(?:then|and then)\b|,?\s+and\s+(?:tell|show|get|check|review|summarize)\b|[.?!]|$))/i)?.[1] ||
      raw.match(/\b(?:work|put|add|mention)\s+(.+?)\s+(?:into|in)\s+the\s+description\b/i)?.[1] ||
      "",
  ).slice(0, 400);

  const durationMatch = raw.match(/\b(?:set (?:it|this|the duration)?\s*to|make (?:it|this)?|change (?:it|this|the duration)?\s*to|duration\s+to|(?:meeting\s+)?duration\s+(?:is|should be|needs to be))\s*(\d{1,3})\s*minutes?\b/i);
  const durationMinutes = Number(durationMatch?.[1] || 0);

  const intent: DirectBookingSettingsUpdateIntent = {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(Number.isFinite(durationMinutes) && durationMinutes >= 10 && durationMinutes <= 180 ? { durationMinutes } : {}),
    ...(mentionsBookingSettingsSurface ? { wantsSettingsView: true } : {}),
    ...(/live booking link|booking link|public booking link/.test(lower) ? { wantsLiveBookingLink: true } : {}),
  };

  return intent.title || intent.description || intent.durationMinutes ? intent : null;
}

function extractDirectAiReceptionistGreetingIntent(prompt: string): DirectAiReceptionistGreetingIntent | null {
  const raw = String(prompt || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/(ai receptionist|receptionist)/.test(lower)) return null;
  const receptionistMatch = raw.match(/\b(?:ai receptionist|receptionist)\b/i);
  const receptionistTail = receptionistMatch?.index != null ? raw.slice(receptionistMatch.index) : raw;
  const receptionistLower = receptionistTail.toLowerCase();
  if (!/(greet|greeting|greets callers with|answer calls with|it says|say|says)/.test(receptionistLower)) return null;

  const quoted = receptionistTail.match(/["“]([^"”]+)["”]([.!?])?/);
  if (quoted?.[1]) {
    const quotedSource = `${quoted[1]}${quoted[2] || ""}`;
    const greeting = preserveTrailingSentencePunctuation(quotedSource, cleanQuotedText(stripTrailingFollowOnInstruction(quotedSource))).slice(0, 360);
    return greeting ? { greeting } : null;
  }

  const segment = extractPromptSegment(receptionistTail, ["greets callers with", "greet callers with", "greeting to", "greeting as", "answer calls with", "it says", "says", "say"], [" then ", ", then ", "; then ", ". then ", " and then "]);
  const sourceSegment = segment || receptionistTail.split(/\b(?:greets callers with|greet callers with|greeting to|greeting as|answer calls with|it says|says|say)\b/i)[1] || "";
  const normalized = preserveTrailingSentencePunctuation(sourceSegment, cleanQuotedText(stripTrailingFollowOnInstruction(sourceSegment)))
    .replace(/,?\s*and\s+let\s+(?:them|callers)\s+know\s+/i, ". ")
    .replace(/([.!?]\s+)([a-z])/g, (_match, prefix, char) => `${prefix}${String(char || "").toUpperCase()}`)
    .replace(/\s+/g, " ")
    .trim();
  const rawTerminalPunctuation = receptionistTail.match(/([.!?])\s*$/)?.[1] || "";
  const greeting = `${normalized}${rawTerminalPunctuation && !/[.!?]$/.test(normalized) ? rawTerminalPunctuation : ""}`.slice(0, 360);
  return greeting ? { greeting } : null;
}

function extractDirectReviewSettingsIntent(prompt: string): DirectReviewSettingsIntent | null {
  const raw = String(prompt || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/(review requests?|review request settings?)/.test(lower)) return null;
  if (!/\b(turn on|enable|set|update|configure)\b/.test(lower)) return null;

  const delayMatch = raw.match(/\b(\d+)\s+(minutes?|hours?|days?|weeks?)\s+after\s+(?:an\s+)?appointment\b/i);
  const delayValue = Math.max(0, Number(delayMatch?.[1] || 30));
  const delayUnit = normalizeReminderLeadUnit(String(delayMatch?.[2] || "minutes"));
  const quoted = raw.match(/["“]([^"”]+)["”]/);
  const unquotedMessage = extractPromptSegment(raw, ["using the message ", "with the message ", "message ", "that says ", "saying "], []);
  const messageTemplate = cleanQuotedText(quoted?.[1] || unquotedMessage || "").slice(0, 1200);

  return {
    settings: {
      enabled: true,
      automation: {
        autoSend: true,
        manualSend: true,
      },
      sendAfter: {
        value: delayValue,
        unit: delayUnit,
      },
      ...(messageTemplate ? { messageTemplate } : {}),
    },
  };
}

function extractDirectFollowUpSettingsIntent(prompt: string): DirectFollowUpSettingsIntent | null {
  const raw = String(prompt || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/follow-up automation|follow up automation|follow-up settings|follow up settings/.test(lower)) return null;
  if (!/\b(turn on|enable|set|update|configure)\b/.test(lower)) return null;

  const delayMatch = raw.match(/\b(\d+)\s+(minutes?|hours?|days?|weeks?)\s+after\s+(?:an\s+)?appointment\b/i);
  const delayValue = Math.max(0, Number(delayMatch?.[1] || 1));
  const delayUnit = normalizeReminderLeadUnit(String(delayMatch?.[2] || "days"));
  const delayMinutes = delayUnitToMinutes(delayValue, delayUnit);
  const wantsSms = /\b(?:sms|text)\b/.test(lower);
  const wantsEmail = /\bemail\b/.test(lower) && !wantsSms;
  const quoted = raw.match(/["“]([^"”]+)["”]/);
  const messageSegment = extractPromptSegment(raw, ["that says ", "saying ", "with the message ", "message ", "that reads "], []);
  const messageBody = cleanQuotedText(quoted?.[1] || messageSegment || "").slice(0, wantsSms ? 900 : 4000);
  if (!messageBody) return null;

  return {
    settings: {
      version: 4,
      enabled: true,
      assignments: {
        defaultSteps: [
          {
            id: wantsEmail ? "step_follow_up_email_1" : "step_follow_up_sms_1",
            name: wantsEmail ? "Email follow-up" : "SMS follow-up",
            enabled: true,
            delayMinutes,
            kind: wantsEmail ? "EMAIL" : "SMS",
            audience: "CONTACT",
            ...(wantsEmail
              ? {
                  email: {
                    subjectTemplate: "Thanks again for meeting with us",
                    bodyTemplate: messageBody,
                  },
                }
              : {
                  sms: {
                    bodyTemplate: messageBody,
                  },
                }),
          },
        ],
      },
    },
  };
}

function extractDirectBlogAutomationSettingsIntent(prompt: string): DirectBlogAutomationSettingsIntent | null {
  const raw = String(prompt || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/blog automation/.test(lower)) return null;
  if (!/\b(turn on|enable|set|update|configure)\b/.test(lower)) return null;

  const frequencyMatch = raw.match(/\bevery\s+(\d+)\s+days?\b/i);
  const topicsSegment = extractPromptSegment(raw, ["about "], [", and", " and keep", " and leave", ".", "?", "!"]);
  const topics = extractTopicsFromPromptSegment(topicsSegment);

  return {
    enabled: true,
    frequencyDays: Math.max(1, Math.min(30, Number(frequencyMatch?.[1] || 7))),
    topics,
    autoPublish: /\b(auto[- ]publish on|turn on auto[- ]publish|enable auto[- ]publish)\b/i.test(lower)
      ? true
      : /\b(auto[- ]publish off|keep auto[- ]publish off|turn off auto[- ]publish|disable auto[- ]publish)\b/i.test(lower)
        ? false
        : false,
  };
}

function extractDirectNewsletterAutomationSettingsIntent(prompt: string): DirectNewsletterAutomationSettingsIntent | null {
  const raw = String(prompt || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/newsletter automation/.test(lower)) return null;
  if (!/\b(turn on|enable|set|update|configure)\b/.test(lower)) return null;

  const frequencyMatch = raw.match(/\bevery\s+(\d+)\s+days?\b/i);
  const topicsSegment = extractPromptSegment(raw, ["about "], [", and", " and require", " and keep", ".", "?", "!"]);
  const topics = extractTopicsFromPromptSegment(topicsSegment);

  return {
    kind: /\binternal\b/.test(lower) ? "internal" : "external",
    enabled: true,
    frequencyDays: Math.max(1, Math.min(365, Number(frequencyMatch?.[1] || 7))),
    requireApproval: /\brequire approval\b|\bapproval before sending\b/i.test(lower),
    topics,
  };
}

function extractDirectMissedCallTextBackSettingsIntent(prompt: string): DirectMissedCallTextBackSettingsIntent | null {
  const raw = String(prompt || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/missed call text back|missed-call text back|missed call textback|missed-call textback/.test(lower)) return null;
  if (!/\b(turn on|enable|set|update|configure)\b/.test(lower)) return null;

  const delayMatch = raw.match(/\b(\d+)\s+seconds?\b/i);
  const quoted = raw.match(/["“]([^"”]+)["”]/);
  const replySegment = extractPromptSegment(raw, ["send this reply:", "reply: ", "reply with ", "send this text: ", "text back with "], []);
  const replyBody = cleanQuotedText(quoted?.[1] || replySegment || "").slice(0, 900);
  if (!replyBody) return null;

  return {
    settings: {
      enabled: true,
      replyDelaySeconds: Math.max(0, Math.min(600, Number(delayMatch?.[1] || 5))),
      replyBody,
    },
  };
}

function extractDirectLeadScrapingSettingsIntent(prompt: string): DirectLeadScrapingSettingsIntent | null {
  const raw = String(prompt || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (!/lead scraping/.test(lower)) return null;
  if (!/\b(turn on|enable|set|update|configure)\b/.test(lower)) return null;
  if (!/\bb2b\b/.test(lower)) return null;

  const frequencyMatch = raw.match(/\bevery\s+(\d+)\s+days?\b/i);
  const nicheMatch = raw.match(/\bfor\s+(.+?)\s+in\s+([a-z][a-z\s-]{1,120})(?:,|\s+and|[.?!]|$)/i);
  const niche = cleanQuotedText(nicheMatch?.[1] || "").slice(0, 200);
  const location = cleanQuotedText(nicheMatch?.[2] || "").slice(0, 200);
  if (!niche || !location) return null;

  return {
    settings: {
      b2b: {
        niche,
        location,
        requireEmail: /\b(require|with).*(email)\b/i.test(lower),
        requirePhone: /\b(require|with).*(phone)\b/i.test(lower),
        scheduleEnabled: true,
        frequencyDays: Math.max(1, Math.min(60, Number(frequencyMatch?.[1] || 7))),
      },
    },
  };
}

function isDirectReviewSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/review requests?|review request settings?/.test(lower)) return false;
  return /\b(what are|show|get|current|right now|now)\b/.test(lower);
}

function isDirectFollowUpSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/follow-up settings|follow up settings|follow-up automation|follow up automation/.test(lower)) return false;
  return /\b(what are|show|get|current|right now|now)\b/.test(lower);
}

function isDirectInboxSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/inbox settings/.test(lower)) return false;
  return /\b(what are|show|get|current|right now|now)\b/.test(lower);
}

function isDirectInboxWebhookTokenRegenerateIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/inbox/.test(lower)) return false;
  if (!/webhook token/.test(lower)) return false;
  return /\b(regenerate|rotate|reset|refresh|new)\b/.test(lower);
}

function isDirectBlogAutomationSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/blog automation/.test(lower)) return false;
  return /\b(what are|show|get|current|right now|now)\b/.test(lower);
}

function isDirectNewsletterAutomationSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/newsletter automation/.test(lower)) return false;
  return /\b(what are|show|get|current|right now|now)\b/.test(lower);
}

function isDirectMissedCallTextBackSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/missed call text back|missed-call text back|missed call textback|missed-call textback/.test(lower)) return false;
  return /\b(what are|show|get|current|right now|now)\b/.test(lower);
}

function isDirectMissedCallTextBackTokenRegenerateIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/missed call text back|missed-call text back|missed call textback|missed-call textback/.test(lower)) return false;
  if (!/webhook token/.test(lower)) return false;
  return /\b(regenerate|rotate|reset|refresh|new)\b/.test(lower);
}

function isDirectLeadScrapingSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/lead scraping settings|lead scraping/.test(lower)) return false;
  return /\b(what are|show|get|current|right now|now)\b/.test(lower);
}

function isDirectAutomationsSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/automations settings|automation settings/.test(lower)) return false;
  return /\b(what are|show|get|current|right now|now)\b/.test(lower);
}

function isDirectBillingSummaryGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/billing summary/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectBillingInfoGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/billing info|billing information/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectPricingGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(pricing|module pricing|credit pricing|service pricing|what does .* cost|how much do .* cost)/.test(lower)) return false;
  return /\b(what is|what's|what are|show|get|current|right now|now|how much)\b/.test(lower);
}

function isDirectCreditsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(credits balance|my credits|credits left|how many credits do i have|credit balance|auto top up|auto-top-up)/.test(lower)) return false;
  return /\b(what is|what's|what are|show|get|current|right now|now|how many|do i have)\b/.test(lower);
}

function isDirectOnboardingStatusGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(onboarding status|my onboarding|am i done with onboarding|do i still need onboarding|onboarding complete)/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now|am i|do i)\b/.test(lower);
}

function isDirectSuggestedSetupPreviewGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(suggested setup|recommended setup|setup suggestions|recommended next setup|what setup do you suggest)/.test(lower)) return false;
  return /\b(what is|what's|what are|show|get|current|right now|now|suggest|recommend)\b/.test(lower);
}

function isDirectContactTagsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(contact tags|tags for contacts|my contact tags|saved tags)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectContactCustomVariableKeysGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(custom variable keys|contact custom variables|custom fields for contacts|contact custom field keys)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectContactDuplicatesGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(duplicate contacts|contact duplicates|duplicated contacts|duplicate people)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have|are there)\b/.test(lower);
}

function isDirectAiAgentsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(ai agents|voice agents|what agents do i have|agent ids|saved agents)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectPeopleUsersListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(team members|my team|who has access|portal users|team access|team invites|who is invited)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|who)\b/.test(lower);
}

function isDirectNotificationsRecipientsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(notification recipients|who gets notifications|alert recipients|who receives alerts|who gets alerts)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|who)\b/.test(lower);
}

function isDirectBillingSubscriptionsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(active subscriptions|my subscriptions|what am i subscribed to|billing subscriptions|subscription list)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|am i)\b/.test(lower);
}

function isDirectBookingCalendarsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(booking calendars|my calendars|appointment calendars|calendar settings)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now)\b/.test(lower);
}

function isDirectVoiceAgentToolsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(voice agent tools|what tools does my voice agent have|voice tools|elevenlabs tools)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|does)\b/.test(lower);
}

function isDirectVoiceAgentVoicesListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(voice agent voices|available voices|elevenlabs voices|what voices do i have)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectMediaStatsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(media stats|media library stats|how many media items|media library size|media library count)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|current|right now|now|how many)\b/.test(lower);
}

function isDirectBlogsAppearanceGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(blog appearance|blog design|blog theme|how does my blog look|blog styling)/.test(lower)) return false;
  return /\b(what is|what's|what does|show|get|current|right now|now|look)\b/.test(lower);
}

function isDirectBlogsSiteGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(blog site|blog domain|blog url|blog slug|blog website)/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now|what does)\b/.test(lower);
}

function isDirectNewsletterSiteGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(newsletter site|newsletter domain|newsletter url|newsletter slug|newsletter website)/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now|what does)\b/.test(lower);
}

function isDirectReviewsSiteGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(reviews site|review site|reviews domain|review domain|reviews url|review url|reviews slug|review slug)/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now|what does)\b/.test(lower);
}

function isDirectBookingFormGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(booking form|appointment form|booking questions|booking intake form|appointment intake form)/.test(lower)) return false;
  return /\b(what is|what's|what does|show|get|current|right now|now)\b/.test(lower);
}

function isDirectBookingSiteGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(booking site|booking page|appointment site|appointment page|booking domain|booking url|booking slug)/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now|what does)\b/.test(lower);
}

function isDirectBlogsUsageGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(blog usage|blog stats|blog generation usage|blog credits used|blog generations)/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now|how many)\b/.test(lower);
}

function isDirectNewsletterUsageGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(newsletter usage|newsletter stats|newsletter generation usage|newsletter credits used|newsletter generations)/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now|how many)\b/.test(lower);
}

function isDirectFollowUpCustomVariablesGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(follow up custom variables|follow-up custom variables|follow up variables|follow-up variables|follow up merge fields|follow-up merge fields)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectReviewsHandleGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(reviews handle|review handle|review slug|reviews slug|review link handle|reviews link handle)/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectReviewsQuestionsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(review questions|reviews questions|customer questions|review q&a|review qa)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectMediaFoldersListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(media folders|media library folders|folders in my media library|media categories)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectBlogsPostsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(blog posts|posts on my blog|my blog posts|blog articles|articles on my blog)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectNewsletterNewslettersListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(newsletters|my newsletters|newsletter drafts|newsletter issues|newsletter sends)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectReviewsBookingsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(review bookings|bookings for reviews|review requests from bookings|bookings ready for reviews)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectReviewsEventsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(review events|review request events|review activity|reviews activity)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectFunnelBuilderSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(funnel builder settings|funnel settings|funnel webhook settings|funnel notify emails)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|current|right now|now)\b/.test(lower);
}

function isDirectFunnelBuilderDomainsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(funnel domains|custom domains for funnels|my funnel domains|domains in funnel builder)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectFunnelBuilderFormsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(funnel forms|forms in funnel builder|my funnel forms|lead capture forms)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectFunnelBuilderFormFieldKeysGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(funnel field keys|form field keys|funnel form fields|form field names in funnel builder)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectFunnelBuilderFunnelsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(funnels|my funnels|funnel builder funnels|sales funnels)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectFunnelBuilderSalesProductsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(funnel products|sales products|products in funnel builder|products for funnels|stripe products)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectTasksListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(tasks|open tasks|my tasks|task list|to do list|todo list)/.test(lower)) return false;
  if (/(assign tasks|task assignees|assign tasks to|who can i assign tasks to|who can tasks be assigned to)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectTaskAssigneesListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(task assignees|who can tasks be assigned to|who can i assign tasks to|task team members)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|who)\b/.test(lower);
}

function isDirectNurtureCampaignsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(nurture campaigns|my nurture campaigns|follow up campaigns|drip campaigns)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectAiOutboundCampaignsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(ai outbound campaigns|outbound campaigns|calling campaigns|ai call campaigns)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectAiOutboundManualCallsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(manual outbound calls|manual calls|recent outbound calls|ai outbound call history|outbound call log)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have|recent)\b/.test(lower);
}

function isDirectAiChatThreadsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(ai chat threads|chat threads|saved chats|saved ai chats|pura chats|pura chat threads)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have|saved)\b/.test(lower);
}

function isDirectAiChatThreadStatusesListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(ai chat statuses|chat thread statuses|thread statuses|status of my chat threads|chat statuses)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have|status)\b/.test(lower);
}

function isDirectAiChatScheduledListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(scheduled ai chats|scheduled chats|scheduled chat reminders|scheduled pura reminders|pending chat reminders)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have|scheduled)\b/.test(lower);
}

function isDirectCreditContactsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(credit contacts|contacts in credit|credit portal contacts)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectCreditPullsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(credit pulls|credit pull history|credit pull requests|credit checks)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have|recent)\b/.test(lower);
}

function isDirectCreditReportsListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(credit reports|bureau reports|imported credit reports)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have|recent)\b/.test(lower);
}

function isDirectCreditDisputeLettersListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(credit dispute letters|dispute letters|letters for disputes|credit letters)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have|recent)\b/.test(lower);
}

function isDirectMediaListGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(media files|media items|files in (?:my )?media library|items in (?:my )?media library|media library items|media assets)/.test(lower)) return false;
  if (/(media folders|folders in (?:my )?media library|media library folders)/.test(lower)) return false;
  return /\b(what are|what's|what is|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectTwilioIntegrationGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/twilio integration|twilio settings/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectStripeIntegrationGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/stripe integration|stripe settings/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectSalesReportingIntegrationGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/sales reporting integration|sales reporting settings/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectApiKeysListIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/\bapi keys?\b|\bportal api keys?\b/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|list|current|right now|now|do i have)\b/.test(lower);
}

function isDirectBookingReminderSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  const mentionsBookingOrAppointment = /\b(booking|appointment|appointments)\b/.test(lower);
  const mentionsReminder = /\breminders?\b/.test(lower);
  if (!(mentionsReminder && mentionsBookingOrAppointment) && !/booking reminders?|appointment reminders?/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectAiReceptionistHighlightsIntent(prompt: string): boolean {
  const lower = String(prompt || "")
    .toLowerCase()
    .replace(/[“”"'?!,;:()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!/(ai receptionist|receptionist)/.test(lower)) return false;
  return /\b(anything important|what happened|recent calls|recent call issues|important status|important in)\b/.test(lower);
}

function isDirectBookingSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/booking settings/.test(lower)) return false;
  return /\b(what are|show|get|current|right now|now)\b/.test(lower);
}

function isDirectBusinessProfileGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(business profile|company profile|business information|company information|business details|company details)/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectServicesStatusGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  const mentionsServices = /(services status|service status|active services|enabled services|my services)/.test(lower);
  if (!mentionsServices) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now|which)\b/.test(lower);
}

function isDirectWebhooksGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(webhook urls?|webhooks?|inbound urls?|callback urls?)/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now|which)\b/.test(lower);
}

function isDirectMailboxGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(mailbox|mailbox address|email alias|portal mailbox)/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectServicesCatalogGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(available services|portal services|services available|what services.*portal|service catalog)/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now|which|available)\b/.test(lower);
}

function extractDirectReportingSummaryGetIntent(prompt: string): { range?: "today" | "7d" | "30d" | "90d" | "all" } | null {
  const lower = String(prompt || "").toLowerCase();
  const mentionsSummary = /(reporting summary|performance summary|business performance|how is my business doing|business doing|report summary|portal reporting)/.test(lower);
  if (!mentionsSummary) return null;
  if (!/\b(what is|what's|show|get|current|right now|now|how)\b/.test(lower)) return null;

  if (/\b(today|1d|day)\b/.test(lower)) return { range: "today" };
  if (/\b(7d|7 days|week|weekly|last 7 days|past 7 days)\b/.test(lower)) return { range: "7d" };
  if (/\b(30d|30 days|month|monthly|last 30 days|past 30 days|this month)\b/.test(lower)) return { range: "30d" };
  if (/\b(90d|90 days|quarter|quarterly|last 90 days|past 90 days|this quarter)\b/.test(lower)) return { range: "90d" };
  if (/\b(all|all time|all-time|lifetime|everything)\b/.test(lower)) return { range: "all" };
  return { range: "30d" };
}

function isDirectDashboardGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(dashboard|portal dashboard|home dashboard|dashboard overview)/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now|on)\b/.test(lower);
}

function isDirectDashboardQuickAccessGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(dashboard quick access|dashboard shortcuts|quick access shortcuts|dashboard shortcut|quick access on my dashboard)/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectDashboardAnalysisGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(dashboard analysis|analysis on my dashboard|dashboard insights|dashboard summary)/.test(lower)) return false;
  return /\b(what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectProfileGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (/(business profile|company profile|business information|company information|business details|company details)/.test(lower)) return false;
  if (!/(my profile|account profile|profile information|profile details|my account details|my account information)/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectReferralLinkGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(referral link|referrals link|invite link|my referral code|my referral link)/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now)\b/.test(lower);
}

function isDirectMeGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(my role|what role do i have|my permissions|what permissions do i have|who am i in this portal|my portal access)/.test(lower)) return false;
  return /\b(what are|what is|what's|show|get|current|right now|now|who)\b/.test(lower);
}

function extractDirectSalesReportGetIntent(prompt: string): { range?: "7d" | "30d" } | null {
  const lower = String(prompt || "").toLowerCase();
  if (!/(sales report|sales performance|sales summary|my sales this month|sales this month|sales this week)/.test(lower)) return null;
  if (/\b(integration|integrations|settings?)\b/.test(lower)) return null;
  if (!/\b(what are|what is|what's|show|get|current|right now|now)\b/.test(lower)) return null;
  if (/\b(week|weekly|last 7 days|past 7 days|7d|7 days)\b/.test(lower)) return { range: "7d" };
  return { range: "30d" };
}

function extractDirectStripeReportGetIntent(prompt: string): { range?: "7d" | "30d" } | null {
  const lower = String(prompt || "").toLowerCase();
  if (!/(stripe report|stripe charges|stripe charge report|stripe payments|stripe sales report)/.test(lower)) return null;
  if (!/\b(what are|what is|what's|show|get|current|right now|now)\b/.test(lower)) return null;
  if (/\b(week|weekly|last 7 days|past 7 days|7d|7 days)\b/.test(lower)) return { range: "7d" };
  return { range: "30d" };
}

function isDirectAiReceptionistSettingsGetIntent(prompt: string): boolean {
  const lower = String(prompt || "").toLowerCase();
  if (!/(ai receptionist|receptionist)/.test(lower) || !/settings/.test(lower)) return false;
  return /\b(what are|show|get|current|right now|now)\b/.test(lower);
}

function extractTaskTitle(prompt: string): string {
  const taskVerbPattern = "(?:create|add|make|set\\s+up|setup|spin\\s+up)";
  const scheduleClause = "(?:\\s+(?:for|due)\\s+(?:tomorrow|next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))(?:\\s+at\\s+(?:noon|midnight|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)))?)?";
  const explicitTitleMatch =
    prompt.match(/\btitle\s+it\s+["“']?([^,.!?]{1,160})/i) ||
    prompt.match(/\bcall\s+it\s+["“']?([^,.!?]{1,160})/i) ||
    prompt.match(/\bname\s+it\s+["“']?([^,.!?]{1,160})/i);
  if (explicitTitleMatch?.[1]) return cleanQuotedText(String(explicitTitleMatch[1]).slice(0, 160));

  const titledMatch = prompt.match(new RegExp(`\\b${taskVerbPattern}\\s+(?:me\\s+)?(?:an?\\s+)?(?:open\\s+)?task\\s+titled\\s+(.+?)(?:,\\s*assign\\b|,\\s*and\\b|,\\s*include\\b|\\s+assign\\b|\\s+and\\b|\\s+include\\b|\\s+due\\b|\\s+tomorrow\\b|\\s+next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b|\\s+at\\s+\\d|[.?!]?$)`, "i"));
  if (titledMatch?.[1]) return cleanQuotedText(String(titledMatch[1]).slice(0, 160));

  const scheduledTitledMatch = prompt.match(new RegExp(`\\b${taskVerbPattern}\\s+(?:me\\s+)?(?:an?\\s+)?(?:open\\s+|new\\s+)?task${scheduleClause}\\s+titled\\s+(.+?)(?:,\\s*assign\\b|,\\s*and\\b|,\\s*include\\b|\\s+assign\\b|\\s+and\\b|\\s+include\\b|[.?!]?$)`, "i"));
  if (scheduledTitledMatch?.[1]) return cleanQuotedText(String(scheduledTitledMatch[1]).slice(0, 160));

  const calledMatch = prompt.match(new RegExp(`\\b${taskVerbPattern}\\s+(?:me\\s+)?(?:an?\\s+)?(?:open\\s+|new\\s+)?task\\s+(?:called|named)\\s+(.+?)(?:,\\s*assign\\b|,\\s*and\\b|,\\s*include\\b|\\s+assign\\b|\\s+and\\b|\\s+include\\b|\\s+for\\b|\\s+due\\b|\\s+tomorrow\\b|\\s+next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b|\\s+at\\s+\\d|[.?!]?$)`, "i"));
  if (calledMatch?.[1]) return cleanQuotedText(String(calledMatch[1]).slice(0, 160));

  const scheduledCalledMatch = prompt.match(new RegExp(`\\b${taskVerbPattern}\\s+(?:me\\s+)?(?:an?\\s+)?(?:open\\s+|new\\s+)?task${scheduleClause}\\s+(?:called|named)\\s+(.+?)(?:,\\s*assign\\b|,\\s*and\\b|,\\s*include\\b|\\s+assign\\b|\\s+and\\b|\\s+include\\b|[.?!]?$)`, "i"));
  if (scheduledCalledMatch?.[1]) return cleanQuotedText(String(scheduledCalledMatch[1]).slice(0, 160));

  const quotedMatch = prompt.match(new RegExp(`\\b${taskVerbPattern}\\s+(?:me\\s+)?(?:an?\\s+)?(?:open\\s+|new\\s+)?task\\s+["“]([^"”]{1,160})["”](?:,\\s*assign\\b|,\\s*and\\b|,\\s*include\\b|\\s+assign\\b|\\s+and\\b|\\s+include\\b|\\s+for\\b|\\s+due\\b|\\s+tomorrow\\b|\\s+next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b|\\s+at\\s+\\d|[.?!]?$)`, "i"));
  if (quotedMatch?.[1]) return cleanQuotedText(String(quotedMatch[1]).slice(0, 160));

  const toMatch = prompt.match(new RegExp(`\\b${taskVerbPattern}\\s+(?:me\\s+)?(?:a\\s+)?task\\s+to\\s+(.+?)(?:,\\s*assign\\b|,\\s*and\\b|,\\s*include\\b|\\s+tomorrow\\b|\\s+next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b|\\s+at\\s+\\d|[.?!]?$)`, "i"));
  if (toMatch?.[1]) return cleanQuotedText(String(toMatch[1]).slice(0, 160));

  return "Follow up task";
}

function extractDirectTaskCreateIntent(prompt: string, timeZoneHint?: string | null): DirectTaskCreateIntent | null {
  if (!looksLikeExplicitInternalTaskRequest(prompt)) return null;
  if (!/\b(?:create|add|make|set\s+up|setup|spin\s+up)\s+(?:me\s+)?(?:an?\s+)?(?:open\s+|new\s+)?task\b/i.test(prompt)) return null;
  if (/\bevery\s+(?:weekday|day|daily|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(prompt)) return null;

  const title = extractTaskTitle(prompt);
  if (!title) return null;

  const noteMatch = prompt.match(/\b(?:include\s+)?(?:a\s+)?note\s+to\s+(.+?)(?:[.?!]|$)/i);
  const description = noteMatch?.[1] ? cleanQuotedText(String(noteMatch[1]).slice(0, 1000)) : "";
  const dueAtIso = parseRelativeDueAtIso(prompt, timeZoneHint) || undefined;
  const assignedToMe = /\bassign(?:\s+it)?\s+to\s+me\b/i.test(prompt) || /\bassigned\s+to\s+me\b/i.test(prompt);

  return {
    title,
    ...(description ? { description } : {}),
    ...(dueAtIso ? { dueAtIso } : {}),
    ...(assignedToMe ? { assignedToUserId: "me" } : {}),
  };
}

function looksLikeExplicitInternalTaskRequest(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;

  if (/\b(?:task|tasks|todo|to-do|to do|task list|tasks service|internal task|internal tasks|human to-do|human todo|as tasks)\b/i.test(text)) {
    return true;
  }

  return false;
}

function extractNumberedTaskCreateIntents(prompt: string, timeZoneHint?: string | null): DirectTaskCreateIntent[] {
  const raw = String(prompt || "");
  if (!looksLikeExplicitInternalTaskRequest(raw)) return [];
  const matches = Array.from(raw.matchAll(/(?:^|\s)(\d{1,2})\.\s+/g));
  if (matches.length < 2) return [];

  const intents: DirectTaskCreateIntent[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const segmentStart = (current.index ?? 0) + current[0].length;
    const segmentEnd = next?.index ?? raw.length;
    const segment = raw.slice(segmentStart, segmentEnd).trim();
    if (!segment) continue;

    const intent = extractDirectTaskCreateIntent(segment, timeZoneHint);
    if (!intent) continue;
    intents.push(intent);
    if (intents.length >= MAX_DIRECT_TASK_BATCH_STEPS) break;
  }

  return intents;
}

function extractNumberedPromptSegments(prompt: string): string[] {
  const raw = String(prompt || "");
  const matches = Array.from(raw.matchAll(/(?:^|\s)(\d{1,2})\.\s+/g));
  if (matches.length < 2) return [];

  const segments: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const segmentStart = (current.index ?? 0) + current[0].length;
    const segmentEnd = next?.index ?? raw.length;
    const segment = raw.slice(segmentStart, segmentEnd).trim();
    if (!segment) continue;
    segments.push(segment);
    if (segments.length >= MAX_DIRECT_TASK_BATCH_STEPS) break;
  }

  return segments;
}

function extractNumberedDirectActionSteps(prompt: string, threadContext: PuraDirectIntentContext): PuraDirectActionStep[] {
  const segments = extractNumberedPromptSegments(prompt);
  if (segments.length < 2) return [];

  const steps: PuraDirectActionStep[] = [];

  for (const segment of segments) {
    const segmentSignals = detectPuraDirectIntentSignals(segment, threadContext);
    const segmentPlan = getPuraDirectActionPlan({ prompt: segment, signals: segmentSignals, threadContext });
    if (!segmentPlan) continue;

    const segmentSteps = Array.isArray((segmentPlan as any).steps) && (segmentPlan as any).steps.length
      ? ((segmentPlan as any).steps as PuraDirectActionStep[])
      : [segmentPlan];

    for (const step of segmentSteps) {
      if (!step || !step.action) continue;
      steps.push({
        action: step.action,
        traceTitle: String(step.traceTitle || step.action).trim() || String(step.action),
        args: step.args && typeof step.args === "object" && !Array.isArray(step.args) ? step.args : {},
      });
      if (steps.length >= MAX_DIRECT_TASK_BATCH_STEPS) break;
    }

    if (steps.length >= MAX_DIRECT_TASK_BATCH_STEPS) break;
  }

  return steps;
}

function getBundledStepPromptOrder(prompt: string, step: PuraDirectActionStep): number {
  const text = String(prompt || "").toLowerCase();
  const findIndex = (needles: string[]): number => {
    let best = Number.POSITIVE_INFINITY;
    for (const needle of needles) {
      const index = text.indexOf(String(needle || "").toLowerCase());
      if (index >= 0 && index < best) best = index;
    }
    return best;
  };

  switch (step.action) {
    case "newsletter.newsletters.create":
      return findIndex(["newsletter"]);
    case "blogs.posts.create":
      return findIndex(["blog draft", "blog"]);
    case "media.folder.ensure":
      return findIndex(["media folder", "folder"]);
    case "funnel.create":
      return findIndex(["funnel"]);
    case "inbox.send_email":
      return findIndex(["send an email", "send email", "email"]);
    case "inbox.send_sms":
      return findIndex(["send a text", "send text", "send an sms", "send sms", "text ", "sms "]);
    case "tasks.create":
      return findIndex(["task", "todo", "to-do", "to do"]);
    case "ai_chat.scheduled.create":
      return findIndex(["scheduled reminder", "reminder", "schedule"]);
    case "booking.settings.update":
    case "booking.settings.get":
      return findIndex(["booking settings", "booking title", "meeting duration", "booking link"]);
    case "booking.reminders.settings.update":
    case "booking.reminders.settings.get":
      return findIndex(["booking reminders", "appointment reminders", "reminders"]);
    case "ai_receptionist.settings.update":
    case "ai_receptionist.settings.get":
    case "ai_receptionist.highlights.get":
      return findIndex(["ai receptionist", "receptionist", "callers", "greeting", "highlights"]);
    default:
      return Number.POSITIVE_INFINITY;
  }
}

function extractDirectSmsSendIntent(prompt: string): DirectSmsSendIntent | null {
  const numericMatch = prompt.match(/\bsend\s+(?:an\s+)?(?:outbound\s+)?sms\s+to\s+([+()\d\-\s]{7,})\s+(?:that\s+says|that\s+say|saying|say|with\s+body|to\s+say)\s*:?\s+([\s\S]+?)\s*$/i);
  const numericTo = numericMatch?.[1] ? String(numericMatch[1]).trim() : "";
  const numericBody = numericMatch?.[2] ? cleanQuotedText(String(numericMatch[2]).slice(0, 900)) : "";
  if (numericTo && numericBody) return { to: numericTo, body: numericBody };

  const contactPatterns = [
    /\b(?:text|sms)\s+(.+?)\s+(?:and\s+)?(?:that\s+says|that\s+say|saying|say|to\s+say|with\s+body)\s*:?\s+([\s\S]+?)\s*$/i,
    /\bsend\s+(.+?)\s+(?:an?\s+)?text(?:\s+message)?\s+(?:that\s+says|that\s+say|saying|say|to\s+say|with\s+body)\s*:?\s+([\s\S]+?)\s*$/i,
    /\bsend\s+(?:an?\s+)?text(?:\s+message)?\s+to\s+(.+?)\s+(?:that\s+says|that\s+say|saying|say|to\s+say|with\s+body)\s*:?\s+([\s\S]+?)\s*$/i,
  ];

  for (const pattern of contactPatterns) {
    const match = prompt.match(pattern);
    const contactHint = match?.[1] ? normalizeRecipientHint(String(match[1]).slice(0, 120)) : "";
    const body = match?.[2] ? cleanQuotedText(String(match[2]).slice(0, 900)) : "";
    if (!contactHint || !body) continue;
    return { contactHint, body };
  }

  return null;
}

function extractDirectEmailSendIntent(prompt: string): DirectEmailSendIntent | null {
  const strictMatch = prompt.match(/\b(?:send\s+(?:an\s+)?(?:outbound\s+)?)?email\s+to\s+(\S+@\S+)\s+with\s+subject\s+(.+?)\s+and\s+body\s+([\s\S]+?)\s*$/i);
  const strictTo = strictMatch?.[1] ? cleanQuotedText(String(strictMatch[1]).slice(0, 200)) : "";
  const strictSubject = strictMatch?.[2] ? cleanQuotedText(String(strictMatch[2]).slice(0, 140)) : "";
  const strictBody = strictMatch?.[3] ? cleanQuotedText(String(strictMatch[3]).slice(0, 4000)) : "";
  if (strictTo && strictSubject && strictBody) return { to: strictTo, subject: strictSubject, body: strictBody };

  const naturalPatterns = [
    /\bemail\s+(.+?)\s+(?:and\s+)?(?:that\s+says|that\s+say|saying|say|to\s+say|with\s+body)\s*:?\s+([\s\S]+?)\s*$/i,
    /\bsend\s+(.+?)\s+(?:an?\s+)?email\s+(?:that\s+says|that\s+say|saying|say|to\s+say|with\s+body)\s*:?\s+([\s\S]+?)\s*$/i,
    /\bsend\s+(?:an?\s+)?email\s+to\s+(.+?)\s+(?:that\s+says|that\s+say|saying|say|to\s+say|with\s+body)\s*:?\s+([\s\S]+?)\s*$/i,
  ];

  for (const pattern of naturalPatterns) {
    const match = prompt.match(pattern);
    const to = match?.[1] ? normalizeRecipientHint(String(match[1]).slice(0, 200)) : "";
    const body = match?.[2] ? cleanQuotedText(String(match[2]).slice(0, 4000)) : "";
    if (!to || !body) continue;
    return { to, subject: "Quick note", body };
  }

  return null;
}

function buildDirectSmsSendPlan(intent: DirectSmsSendIntent, threadContext: PuraDirectIntentContext): PuraDirectActionStep {
  const lastThreadId = lastInboxThreadIdFromContext(threadContext);
  return {
    action: "inbox.send_sms",
    traceTitle: "Send Outbound SMS",
    args: intent.to
      ? {
          to: intent.to,
          body: intent.body,
        }
      : intent.contactHint && isImplicitRecipientHint(intent.contactHint) && lastThreadId
        ? {
            threadId: lastThreadId,
            body: intent.body,
          }
        : {
            ...(intent.contactHint ? { threadId: { $ref: "inbox_thread", hint: intent.contactHint, channel: "sms" } } : {}),
            contactId: { $ref: "contact", hint: intent.contactHint || "" },
            ...(intent.contactHint ? { threadHint: intent.contactHint } : {}),
            body: intent.body,
          },
  };
}

function buildDirectEmailSendPlan(intent: DirectEmailSendIntent): PuraDirectActionStep {
  return {
    action: "inbox.send_email",
    traceTitle: "Send Outbound Email",
    args: intent,
  };
}

function extractDirectWeekdayScheduledSmsIntent(prompt: string): DirectWeekdayScheduledSmsIntent | null {
  const match = prompt.match(/\bevery\s+weekday\s+at\s+(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*,?\s*send\s+(.+?)\s+a\s+(.+?)\s*$/i);
  if (!match?.[1] || !match?.[2] || !match?.[3]) return null;
  const parsedTime = parseTimeTo24Hour(match[1]);
  if (!parsedTime) return null;
  const contactHint = normalizeRecipientHint(String(match[2]).slice(0, 120));
  const rawMessageGoal = cleanQuotedText(String(match[3]).slice(0, 240));
  if (!contactHint || !rawMessageGoal) return null;

  const body = /^good\s+morning\b/i.test(rawMessageGoal)
    ? `Good morning ${contactHint}, hope you're doing well. Just wanted to get the conversation started.`
    : `Hi ${contactHint}, ${rawMessageGoal}`;

  return { contactHint, timeLocal: parsedTime.hhmm, body };
}

function extractDirectAiChatScheduledReminderIntent(prompt: string, timeZoneHint?: string | null): DirectAiChatScheduledReminderIntent | null {
  const patterns = [
    /\b(?:create|add|make|schedule)\s+(?:a\s+)?scheduled\s+(?:pura\s+)?reminder(?:\s+in\s+this\s+chat)?\s+for\s+(.+?)\s+that\s+(?:says|saying|reads)\s+["“]([^"”]+)["”]/i,
    /\b(?:create|add|make|schedule)\s+(?:a\s+)?scheduled\s+(?:pura\s+)?reminder(?:\s+in\s+this\s+chat)?\s+for\s+(.+?)\s+to\s+(?:say|read)\s+["“]([^"”]+)["”]/i,
    /\bremind\s+me\s+in\s+this\s+chat\s+(.+?)\s+to\s+(.+?)(?:[.?!]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const scheduleText = typeof match?.[1] === "string" ? String(match[1]).trim() : "";
    const bodyText = typeof match?.[2] === "string" ? cleanQuotedText(String(match[2]).slice(0, 1000)) : "";
    if (!scheduleText || !bodyText) continue;
    const sendAtIso = parseRelativeDueAtIso(scheduleText, timeZoneHint);
    if (!sendAtIso) continue;
    return { sendAtIso, text: bodyText };
  }

  const missingBodyScheduleMatch = prompt.match(/\bremind\s+me\s+in\s+this\s+chat\s+(.+?)(?:[.?!]|$)/i);
  if (missingBodyScheduleMatch?.[1]) {
    const sendAtIso = parseRelativeDueAtIso(String(missingBodyScheduleMatch[1]).trim(), timeZoneHint);
    if (sendAtIso) return { sendAtIso, text: "" };
  }

  return null;
}

function buildNewsletterCreatePlan(title: string): PuraDirectActionStep {
  return {
    action: "newsletter.newsletters.create",
    traceTitle: "Create Newsletter",
    args: {
      kind: "external",
      status: "DRAFT",
      title,
      excerpt: `A compelling update for ${title}.`,
      content: `# ${title}\n\nThis draft is set up for a webinar-focused audience and is ready for refinement and sending.`,
    },
  };
}

function buildBlogCreatePlan(title: string): PuraDirectActionStep {
  return {
    action: "blogs.posts.create",
    traceTitle: "Create Blog Draft",
    args: { title },
  };
}

function buildReviewReplyPlan(intent: NonNullable<PuraDirectIntentSignals["reviewReplyIntent"]>): PuraDirectActionStep {
  return {
    action: "reviews.reply",
    traceTitle: "Reply to Review",
    args: {
      reviewName: intent.reviewName,
      reply: intent.replyText,
    },
  };
}

function buildAiChatScheduledReminderPlan(intent: DirectAiChatScheduledReminderIntent): PuraDirectActionStep {
  return {
    action: "ai_chat.scheduled.create",
    traceTitle: "Create Scheduled Chat Reminder",
    args: {
      text: intent.text,
      sendAtIso: intent.sendAtIso,
    },
  };
}

function directPlanSteps(plan: PuraDirectActionPlan | null | undefined): PuraDirectActionStep[] {
  if (!plan) return [];
  return Array.isArray(plan.steps) && plan.steps.length ? plan.steps : [plan];
}

function extractDirectRecurringAiChatIntent(prompt: string): DirectRecurringAiChatIntent | null {
  const raw = String(prompt || "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const hasWeeklyCadence = /\b(?:once a week|every week)\b/.test(lower) || (/\bweekly\b/.test(lower) && /\b(?:schedule|scheduled|repeat|recurring|remind)\b/.test(lower));
  if (!hasWeeklyCadence) return null;

  const runNow = /\b(?:also\s+)?(?:start|run|trigger|do)(?:\s+(?:it|one))?\s+now\b/i.test(raw);
  const cleanedPrompt = cleanQuotedText(
    raw
      .replace(/\b(?:once\s+a\s+week|every\s+week)\b/gi, " ")
      .replace(/\bweekly\b/gi, " ")
      .replace(/(?:\s|,|;)+(?:and\s+)?(?:also\s+)?(?:start|run|trigger|do)(?:\s+(?:it|one))?\s+now\b/gi, " ")
      .replace(/\b(?:please\s+)?(?:can you|could you|would you)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  if (!cleanedPrompt || cleanedPrompt.toLowerCase() === raw.toLowerCase()) return null;

  return {
    cleanedPrompt,
    runNow,
    repeatEveryMinutes: 7 * 24 * 60,
    sendAtIso: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function buildRecurringAiChatPlan(intent: DirectRecurringAiChatIntent, immediatePlan: PuraDirectActionPlan | null): PuraDirectActionPlan | null {
  const immediateSteps = directPlanSteps(immediatePlan).filter((step) => step.action !== "ai_chat.scheduled.create");
  if (intent.runNow && !immediateSteps.length) return null;

  const scheduledText = immediateSteps.length
    ? encodeScheduledActionEnvelope({
        workTitle: immediateSteps[0]?.traceTitle || "Scheduled chat run",
        steps: immediateSteps.map((step) => ({ key: step.action, title: step.traceTitle, args: step.args })),
      })
    : intent.cleanedPrompt;

  const steps: PuraDirectActionStep[] = [
    {
      action: "ai_chat.scheduled.create",
      traceTitle: "Create Weekly Scheduled Chat",
      args: {
        text: scheduledText,
        sendAtIso: intent.sendAtIso,
        repeatEveryMinutes: intent.repeatEveryMinutes,
      },
    },
    ...(intent.runNow ? immediateSteps : []),
  ];

  return { ...steps[0], steps };
}

function extractOutboundGoal(prompt: string): string {
  const match =
    prompt.match(/\bwith\s+(?:the\s+)?goal\s+(?:of|to)?\s+([\s\S]+?)\s*$/i) ||
    prompt.match(/\bgoal\s+is\s+to\s+([\s\S]+?)\s*$/i) ||
    prompt.match(/\b(?:and\s+)?follow\s+up\s+about\s+([\s\S]+?)\s*$/i) ||
    prompt.match(/\b(?:and\s+)?follow\s+up\s+with\s+.+?\s+about\s+([\s\S]+?)\s*$/i) ||
    prompt.match(/\b(?:and\s+)?see\s+if\s+([\s\S]+?)\s*$/i) ||
    prompt.match(/\b(?:and\s+)?check\s+in\s+about\s+([\s\S]+?)\s*$/i) ||
    prompt.match(/\b(?:call|dial|ring|have\s+the\s+ai\s+ring|place\s+(?:an\s+)?(?:outbound\s+)?call\s+to|make\s+(?:an\s+)?(?:outbound\s+)?call\s+to)\s+[+()\d\-\s]{7,}\s+to\s+(?:try\s+to\s+)?([\s\S]+?)\s*$/i);
  const value = match?.[1] ? trimOutboundConfigTail(String(match[1]).slice(0, 1000)) : "";
  return value
    .replace(/^call\s+/i, "")
    .replace(/^about\s+/i, "")
    .trim();
}

function extractFirstMessage(prompt: string): string {
  const explicit = extractPromptSegment(
    prompt,
    [" start with ", " open with ", " say ", " saying ", " that says ", " first message is ", " first message: "],
    [", and activate", " and activate", ", activate", ", and launch", " and launch", ", and start", " and start", ", and turn it on", " and turn it on", ", and turn on", " and turn on", ", and make it active", " and make it active", ".", "?", "!"],
  );
  return explicit ? trimOutboundConfigTail(String(explicit).slice(0, 320)) : "";
}

function extractOutboundCampaignName(prompt: string): string {
  const explicit = extractPromptSegment(
    prompt,
    ["campaign called ", "campaign named "],
    [" with the goal ", " goal is ", ", start with ", " and start with ", ", open with ", " and open with ", ", say ", " and say ", ", saying ", " and saying ", " and activate", " and launch", " and start", " and turn it on", " and turn on", " and make it active", ".", "?", "!"],
  );
  const fallbackMatch =
    prompt.match(/\b(?:create|set up|setup|start|launch|make|build|spin up)\s+(?:an\s+|a\s+)?(?:ai\s+)?outbound\s+calls?\s+campaign\s+(.+?)(?:\s+with\s+(?:the\s+)?goal\b|\s+goal\s+is\b|\s+for\s+(?:leads?|customers?|prospects?|contacts?|people)\b|\s+(?:and\s+)?(?:activate|launch|start|turn\s+(?:it\s+)?on|make\s+(?:it\s+)?active)\b|\s+(?:and\s+)?(?:say|saying|open\s+with|start\s+with)\b|[.?!]|$)/i);
  const value = explicit
    ? trimOutboundAudienceTail(trimOutboundConfigTail(String(explicit).slice(0, 80)))
    : fallbackMatch?.[1]
      ? trimOutboundAudienceTail(trimOutboundConfigTail(String(fallbackMatch[1]).slice(0, 80)))
      : "";
  return value || "AI Outbound Campaign";
}

function extractDirectAiOutboundCampaignIntent(prompt: string): DirectAiOutboundCampaignIntent | null {
  if (!/\b(?:ai\s+)?outbound\s+calls?\s+campaign\b/i.test(prompt)) return null;
  if (!/\b(?:create|set\s+up|setup|start|launch|make|build|activate|spin\s+up)\b/i.test(prompt)) return null;

  const name = extractOutboundCampaignName(prompt);
  const goal = extractOutboundGoal(prompt);
  const firstMessage = extractFirstMessage(prompt);
  const activate = /\b(?:activate|launch|start|turn\s+on|make\s+active)\b/i.test(prompt);

  return {
    name,
    ...(goal ? { goal } : {}),
    ...(firstMessage ? { firstMessage } : {}),
    ...(activate ? { activate: true } : {}),
  };
}

function extractDirectAiOutboundManualCallIntent(prompt: string): DirectAiOutboundManualCallIntent | null {
  const match = prompt.match(/\b(?:call|dial|ring|have\s+the\s+ai\s+ring|place\s+(?:an\s+)?(?:outbound\s+)?call\s+to|make\s+(?:an\s+)?(?:outbound\s+)?call\s+to)\s+([+()\d\-\s]{7,})(?:\b|$)/i);
  const toNumber = match?.[1] ? String(match[1]).trim() : "";
  if (!toNumber) return null;

  const campaignMatch = prompt.match(/\b(?:using|from)\s+(?:the\s+)?campaign\s+(.+?)(?:\s+with\s+(?:the\s+)?goal\b|\s+goal\s+is\b|\s+(?:and\s+)?(?:activate|launch|start|turn\s+(?:it\s+)?on|make\s+(?:it\s+)?active)\b|\s+(?:and\s+)?(?:say|saying|open\s+with|start\s+with|first\s+message)\b|[.?!]|$)/i);
  const campaignHint = campaignMatch?.[1] ? trimOutboundConfigTail(String(campaignMatch[1]).slice(0, 80)) : "";
  const goal = extractOutboundGoal(prompt);
  const firstMessage = extractFirstMessage(prompt);

  return {
    toNumber,
    ...(goal ? { goal } : {}),
    ...(campaignHint ? { campaignHint } : {}),
    ...(firstMessage ? { firstMessage } : {}),
  };
}

function buildAiOutboundCampaignPlan(intent: DirectAiOutboundCampaignIntent): PuraDirectActionPlan {
  const campaignRef = { $ref: "ai_outbound_calls_campaign", hint: "last" } as const;
  const hasConfig = Boolean(intent.goal || intent.firstMessage || intent.activate);
  const steps: PuraDirectActionStep[] = [
    {
      action: "ai_outbound_calls.campaigns.create",
      traceTitle: "Create AI Outbound Call Campaign",
      args: { name: intent.name },
    },
  ];

  if (hasConfig) {
    steps.push({
      action: "ai_outbound_calls.campaigns.update",
      traceTitle: intent.activate ? "Configure and Activate AI Outbound Call Campaign" : "Configure AI Outbound Call Campaign",
      args: {
        campaignId: campaignRef as unknown as string,
        ...(intent.activate ? { status: "ACTIVE" } : {}),
        ...((intent.goal || intent.firstMessage)
          ? {
              voiceAgentConfig: {
                ...(intent.goal ? { goal: intent.goal } : {}),
                ...(intent.firstMessage ? { firstMessage: intent.firstMessage } : {}),
              },
            }
          : {}),
      },
    });
  }

  return { ...steps[0], steps };
}

function buildAiOutboundManualCallPlan(intent: DirectAiOutboundManualCallIntent, threadContext: PuraDirectIntentContext): PuraDirectActionPlan {
  const existingCampaignId = typeof threadContext.lastAiOutboundCallsCampaign?.id === "string" ? String(threadContext.lastAiOutboundCallsCampaign.id).trim() : "";
  const existingCampaignLabel = typeof threadContext.lastAiOutboundCallsCampaign?.label === "string" ? String(threadContext.lastAiOutboundCallsCampaign.label).trim() : "";
  const campaignName = intent.campaignHint || existingCampaignLabel || `Quick Call ${intent.toNumber.replace(/\D+/g, "").slice(-4) || "Campaign"}`;
  const campaignRef = existingCampaignId
    ? existingCampaignId
    : ({ $ref: "ai_outbound_calls_campaign", hint: "last" } as const);

  const steps: PuraDirectActionStep[] = [];

  if (!existingCampaignId) {
    steps.push({
      action: "ai_outbound_calls.campaigns.create",
      traceTitle: "Create AI Outbound Call Campaign",
      args: { name: campaignName },
    });
  }

  if (intent.goal || intent.firstMessage) {
    steps.push({
      action: "ai_outbound_calls.campaigns.update",
      traceTitle: existingCampaignId ? "Update AI Outbound Call Campaign" : "Configure AI Outbound Call Campaign",
      args: {
        campaignId: campaignRef as unknown as string,
        voiceAgentConfig: {
          ...(intent.goal ? { goal: intent.goal } : {}),
          ...(intent.firstMessage ? { firstMessage: intent.firstMessage } : {}),
        },
      },
    });
    steps.push({
      action: "ai_outbound_calls.campaigns.sync_agent",
      traceTitle: "Sync AI Outbound Call Agent",
      args: {
        campaignId: campaignRef as unknown as string,
      },
    });
  }

  steps.push({
    action: "ai_outbound_calls.campaigns.manual_call",
    traceTitle: "Place Manual AI Outbound Call",
    args: {
      campaignId: campaignRef as unknown as string,
      toNumber: intent.toNumber,
    },
  });

  steps.push({
    action: "ai_outbound_calls.manual_calls.list",
    traceTitle: "Inspect Manual Outbound Calls",
    args: {
      campaignId: campaignRef as unknown as string,
      reconcileTwilio: true,
    },
  });

  return { ...steps[0], steps };
}

function buildWeekdayScheduledSmsPlan(intent: DirectWeekdayScheduledSmsIntent): PuraDirectActionPlan {
  const weekdays = [1, 2, 3, 4, 5];
  const steps: PuraDirectActionStep[] = weekdays.map((isoWeekday) => ({
    action: "ai_chat.scheduled.create",
    traceTitle: `Schedule Weekday SMS (${isoWeekday})`,
    args: {
      text: encodeScheduledActionEnvelope({
        workTitle: `Weekday SMS to ${intent.contactHint}`,
        steps: [
          {
            key: "inbox.send_sms",
            title: `Send SMS to ${intent.contactHint}`,
            args: {
              contactId: { $ref: "contact", hint: intent.contactHint },
              body: intent.body,
            },
          },
        ],
      }),
      sendAtLocal: { isoWeekday, timeLocal: intent.timeLocal },
      repeatEveryMinutes: 7 * 24 * 60,
    },
  }));

  return { ...steps[0], steps };
}

export function getPuraDirectPrerequisiteMessage(opts: {
  signals: PuraDirectIntentSignals;
  threadContext?: unknown;
}): string | null {
  const { signals } = opts;
  const threadContext = safeContext(opts.threadContext);

  if (signals.shouldCreateLandingPage && !threadContext.lastFunnel?.id) {
    return "I cannot create that landing page yet because there is not a successfully created funnel in this thread to attach it to.";
  }

  if (signals.shouldGenerateLandingLayout && (!threadContext.lastFunnel?.id || !threadContext.lastFunnelPage?.id)) {
    return "I cannot generate that page layout yet because there is not a saved funnel page in this thread to design.";
  }

  if (signals.shouldSendLatestNewsletter && !threadContext.lastNewsletter?.id) {
    return "I cannot send that newsletter yet because there is not a successfully created newsletter in this thread.";
  }

  if (signals.shouldPublishLatestBlog && !signals.blogCreateTitle && !threadContext.lastBlogPost?.id) {
    return "I cannot publish that blog post yet because there is not a successfully created blog draft in this thread.";
  }

  if (signals.nurtureStepIntent && !threadContext.lastNurtureCampaign?.id) {
    return "I cannot add that nurture step yet because there is not a successfully created nurture campaign in this thread.";
  }

  if (signals.shouldListLatestMediaFolder && !threadContext.lastMediaFolder?.id) {
    return "I cannot list that folder yet because there is not a media folder from this thread to inspect.";
  }

  if (signals.shouldListLatestLeads && !threadContext.lastLeadScrape?.runId) {
    return "I cannot list those scraped leads yet because there is not a completed lead scrape in this thread.";
  }

  return null;
}

function safeContext(raw: unknown): PuraDirectIntentContext {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as PuraDirectIntentContext) : {};
}

function makeSlug(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function getPuraDirectActionPlan(opts: {
  prompt: string;
  signals: PuraDirectIntentSignals;
  threadContext?: unknown;
}): PuraDirectActionPlan | null {
  const { prompt, signals } = opts;
  const intentSignals = getPuraIntentSignals(prompt);
  if (intentSignals.asksHow && !intentSignals.explicitDoIt) return null;
  const threadContext = safeContext(opts.threadContext);
  const timeZoneHint = getDirectIntentTimeZoneHint(threadContext);
  const numberedDirectActionSteps = extractNumberedDirectActionSteps(prompt, threadContext);
  if (numberedDirectActionSteps.length >= 2) {
    const dedupedNumberedDirectSteps = numberedDirectActionSteps.filter((step, index, arr) => {
      const signature = JSON.stringify({ action: step.action, args: step.args ?? {} });
      return arr.findIndex((candidate) => JSON.stringify({ action: candidate.action, args: candidate.args ?? {} }) === signature) === index;
    });
    dedupedNumberedDirectSteps.sort((left, right) => getBundledStepPromptOrder(prompt, left) - getBundledStepPromptOrder(prompt, right));
    if (dedupedNumberedDirectSteps.length >= 2) {
      return { ...dedupedNumberedDirectSteps[0], steps: dedupedNumberedDirectSteps };
    }
  }
  const numberedTaskCreateIntents = extractNumberedTaskCreateIntents(prompt, timeZoneHint);
  const directTaskCreateIntent = numberedTaskCreateIntents.length ? null : extractDirectTaskCreateIntent(prompt, timeZoneHint);
  const directBlogAutomationSettingsIntent = extractDirectBlogAutomationSettingsIntent(prompt);
  const directNewsletterAutomationSettingsIntent = extractDirectNewsletterAutomationSettingsIntent(prompt);
  const directMissedCallTextBackSettingsIntent = extractDirectMissedCallTextBackSettingsIntent(prompt);
  const directLeadScrapingSettingsIntent = extractDirectLeadScrapingSettingsIntent(prompt);
  const directReviewSettingsIntent = extractDirectReviewSettingsIntent(prompt);
  const directFollowUpSettingsIntent = extractDirectFollowUpSettingsIntent(prompt);
  const directSmsSendIntent = directFollowUpSettingsIntent ? null : extractDirectSmsSendIntent(prompt);
  const directEmailSendIntent = extractDirectEmailSendIntent(prompt);
  const directWeekdayScheduledSmsIntent = extractDirectWeekdayScheduledSmsIntent(prompt);
  const directAiChatScheduledReminderIntent = extractDirectAiChatScheduledReminderIntent(prompt, timeZoneHint);
  const directRecurringAiChatIntent = extractDirectRecurringAiChatIntent(prompt);
  const directBookingReminderSettingsIntent = extractDirectBookingReminderSettingsIntent(prompt);
  const directBookingSettingsUpdateIntent = extractDirectBookingSettingsUpdateIntent(prompt);
  const directAiReceptionistGreetingIntent = extractDirectAiReceptionistGreetingIntent(prompt);
  const directReviewSettingsGetIntent = isDirectReviewSettingsGetIntent(prompt);
  const directFollowUpSettingsGetIntent = isDirectFollowUpSettingsGetIntent(prompt);
  const directInboxSettingsGetIntent = isDirectInboxSettingsGetIntent(prompt);
  const directInboxWebhookTokenRegenerateIntent = isDirectInboxWebhookTokenRegenerateIntent(prompt);
  const directBlogAutomationSettingsGetIntent = isDirectBlogAutomationSettingsGetIntent(prompt);
  const directNewsletterAutomationSettingsGetIntent = isDirectNewsletterAutomationSettingsGetIntent(prompt);
  const directMissedCallTextBackSettingsGetIntent = isDirectMissedCallTextBackSettingsGetIntent(prompt);
  const directMissedCallTextBackTokenRegenerateIntent = isDirectMissedCallTextBackTokenRegenerateIntent(prompt);
  const directLeadScrapingSettingsGetIntent = isDirectLeadScrapingSettingsGetIntent(prompt);
  const directAutomationsSettingsGetIntent = isDirectAutomationsSettingsGetIntent(prompt);
  const directBillingSummaryGetIntent = isDirectBillingSummaryGetIntent(prompt);
  const directBillingInfoGetIntent = isDirectBillingInfoGetIntent(prompt);
  const directPricingGetIntent = isDirectPricingGetIntent(prompt);
  const directCreditsGetIntent = isDirectCreditsGetIntent(prompt);
  const directOnboardingStatusGetIntent = isDirectOnboardingStatusGetIntent(prompt);
  const directSuggestedSetupPreviewGetIntent = isDirectSuggestedSetupPreviewGetIntent(prompt);
  const directContactTagsListIntent = isDirectContactTagsListIntent(prompt);
  const directContactCustomVariableKeysGetIntent = isDirectContactCustomVariableKeysGetIntent(prompt);
  const directContactDuplicatesGetIntent = isDirectContactDuplicatesGetIntent(prompt);
  const directAiAgentsListIntent = isDirectAiAgentsListIntent(prompt);
  const directPeopleUsersListIntent = isDirectPeopleUsersListIntent(prompt);
  const directNotificationsRecipientsListIntent = isDirectNotificationsRecipientsListIntent(prompt);
  const directBillingSubscriptionsListIntent = isDirectBillingSubscriptionsListIntent(prompt);
  const directBookingCalendarsGetIntent = isDirectBookingCalendarsGetIntent(prompt);
  const directVoiceAgentToolsGetIntent = isDirectVoiceAgentToolsGetIntent(prompt);
  const directVoiceAgentVoicesListIntent = isDirectVoiceAgentVoicesListIntent(prompt);
  const directMediaStatsGetIntent = isDirectMediaStatsGetIntent(prompt);
  const directBlogsAppearanceGetIntent = isDirectBlogsAppearanceGetIntent(prompt);
  const directBlogsSiteGetIntent = isDirectBlogsSiteGetIntent(prompt);
  const directNewsletterSiteGetIntent = isDirectNewsletterSiteGetIntent(prompt);
  const directReviewsSiteGetIntent = isDirectReviewsSiteGetIntent(prompt);
  const directBookingFormGetIntent = isDirectBookingFormGetIntent(prompt);
  const directBookingSiteGetIntent = isDirectBookingSiteGetIntent(prompt);
  const directBlogsUsageGetIntent = isDirectBlogsUsageGetIntent(prompt);
  const directNewsletterUsageGetIntent = isDirectNewsletterUsageGetIntent(prompt);
  const directFollowUpCustomVariablesGetIntent = isDirectFollowUpCustomVariablesGetIntent(prompt);
  const directReviewsHandleGetIntent = isDirectReviewsHandleGetIntent(prompt);
  const directReviewsQuestionsListIntent = isDirectReviewsQuestionsListIntent(prompt);
  const directMediaFoldersListIntent = isDirectMediaFoldersListIntent(prompt);
  const directBlogsPostsListIntent = isDirectBlogsPostsListIntent(prompt);
  const directNewsletterNewslettersListIntent = isDirectNewsletterNewslettersListIntent(prompt);
  const directReviewsBookingsListIntent = isDirectReviewsBookingsListIntent(prompt);
  const directReviewsEventsListIntent = isDirectReviewsEventsListIntent(prompt);
  const directFunnelBuilderSettingsGetIntent = isDirectFunnelBuilderSettingsGetIntent(prompt);
  const directFunnelBuilderDomainsListIntent = isDirectFunnelBuilderDomainsListIntent(prompt);
  const directFunnelBuilderFormsListIntent = isDirectFunnelBuilderFormsListIntent(prompt);
  const directFunnelBuilderFormFieldKeysGetIntent = isDirectFunnelBuilderFormFieldKeysGetIntent(prompt);
  const directFunnelBuilderFunnelsListIntent = isDirectFunnelBuilderFunnelsListIntent(prompt);
  const directFunnelBuilderSalesProductsListIntent = isDirectFunnelBuilderSalesProductsListIntent(prompt);
  const directTasksListIntent = isDirectTasksListIntent(prompt);
  const directTaskAssigneesListIntent = isDirectTaskAssigneesListIntent(prompt);
  const directNurtureCampaignsListIntent = isDirectNurtureCampaignsListIntent(prompt);
  const directAiOutboundCampaignsListIntent = isDirectAiOutboundCampaignsListIntent(prompt);
  const directAiOutboundManualCallsListIntent = isDirectAiOutboundManualCallsListIntent(prompt);
  const directAiChatThreadsListIntent = isDirectAiChatThreadsListIntent(prompt);
  const directAiChatThreadStatusesListIntent = isDirectAiChatThreadStatusesListIntent(prompt);
  const directAiChatScheduledListIntent = isDirectAiChatScheduledListIntent(prompt);
  const directCreditContactsListIntent = isDirectCreditContactsListIntent(prompt);
  const directCreditPullsListIntent = isDirectCreditPullsListIntent(prompt);
  const directCreditReportsListIntent = isDirectCreditReportsListIntent(prompt);
  const directCreditDisputeLettersListIntent = isDirectCreditDisputeLettersListIntent(prompt);
  const directMediaListGetIntent = isDirectMediaListGetIntent(prompt);
  const directTwilioIntegrationGetIntent = isDirectTwilioIntegrationGetIntent(prompt);
  const directStripeIntegrationGetIntent = isDirectStripeIntegrationGetIntent(prompt);
  const directSalesReportingIntegrationGetIntent = isDirectSalesReportingIntegrationGetIntent(prompt);
  const directApiKeysListIntent = isDirectApiKeysListIntent(prompt);
  const directBookingReminderSettingsGetIntent = isDirectBookingReminderSettingsGetIntent(prompt);
  const directAiReceptionistHighlightsIntent = isDirectAiReceptionistHighlightsIntent(prompt);
  const directBookingSettingsGetIntent = isDirectBookingSettingsGetIntent(prompt);
  const directBusinessProfileGetIntent = isDirectBusinessProfileGetIntent(prompt);
  const directServicesStatusGetIntent = isDirectServicesStatusGetIntent(prompt);
  const directWebhooksGetIntent = isDirectWebhooksGetIntent(prompt);
  const directMailboxGetIntent = isDirectMailboxGetIntent(prompt);
  const directServicesCatalogGetIntent = isDirectServicesCatalogGetIntent(prompt);
  const directReportingSummaryGetIntent = extractDirectReportingSummaryGetIntent(prompt);
  const directDashboardGetIntent = isDirectDashboardGetIntent(prompt);
  const directDashboardQuickAccessGetIntent = isDirectDashboardQuickAccessGetIntent(prompt);
  const directDashboardAnalysisGetIntent = isDirectDashboardAnalysisGetIntent(prompt);
  const directProfileGetIntent = isDirectProfileGetIntent(prompt);
  const directReferralLinkGetIntent = isDirectReferralLinkGetIntent(prompt);
  const directMeGetIntent = isDirectMeGetIntent(prompt);
  const directSalesReportGetIntent = extractDirectSalesReportGetIntent(prompt);
  const directStripeReportGetIntent = extractDirectStripeReportGetIntent(prompt);
  const directAiReceptionistSettingsGetIntent = isDirectAiReceptionistSettingsGetIntent(prompt);
  const directAiOutboundCampaignIntent = extractDirectAiOutboundCampaignIntent(prompt);
  const directAiOutboundManualCallIntent = extractDirectAiOutboundManualCallIntent(prompt);

  if (directRecurringAiChatIntent) {
    const recurringSignals = detectPuraDirectIntentSignals(directRecurringAiChatIntent.cleanedPrompt, threadContext);
    const immediateRecurringPlan = getPuraDirectActionPlan({
      prompt: directRecurringAiChatIntent.cleanedPrompt,
      signals: recurringSignals,
      threadContext,
    });
    const recurringPlan = buildRecurringAiChatPlan(directRecurringAiChatIntent, immediateRecurringPlan);
    if (recurringPlan) return recurringPlan;
  }

  const bundledDirectSteps: PuraDirectActionStep[] = [];
  if (signals.reviewReplyIntent) bundledDirectSteps.push(buildReviewReplyPlan(signals.reviewReplyIntent));
  if (signals.blogCreateTitle) bundledDirectSteps.push(buildBlogCreatePlan(signals.blogCreateTitle));
  if (signals.newsletterCreateTitle) bundledDirectSteps.push(buildNewsletterCreatePlan(signals.newsletterCreateTitle));
  if (signals.funnelCreateTitle) {
    const name = signals.funnelCreateTitle.slice(0, 120);
    bundledDirectSteps.push({
      action: "funnel.create",
      traceTitle: "Create Funnel",
      args: { name, slug: makeSlug(name) || "webinar-growth-funnel" },
    });
  }
  if (signals.mediaFolderCreateTitle) {
    bundledDirectSteps.push({
      action: "media.folder.ensure",
      traceTitle: "Ensure Media Folder Exists",
      args: { name: signals.mediaFolderCreateTitle.slice(0, 120) },
    });
  }
  if (directSmsSendIntent) bundledDirectSteps.push(buildDirectSmsSendPlan(directSmsSendIntent, threadContext));
  if (directEmailSendIntent) bundledDirectSteps.push(buildDirectEmailSendPlan(directEmailSendIntent));
  if (numberedTaskCreateIntents.length) {
    for (const directTaskIntent of numberedTaskCreateIntents) {
      bundledDirectSteps.push({
        action: "tasks.create",
        traceTitle: "Create Task",
        args: directTaskIntent,
      });
    }
  } else if (directTaskCreateIntent) {
    bundledDirectSteps.push({
      action: "tasks.create",
      traceTitle: "Create Task",
      args: directTaskCreateIntent,
    });
  }
  if (directAiChatScheduledReminderIntent) bundledDirectSteps.push(buildAiChatScheduledReminderPlan(directAiChatScheduledReminderIntent));
  if (directBookingSettingsUpdateIntent) {
    bundledDirectSteps.push({
      action: "booking.settings.update",
      traceTitle: "Update Booking Settings",
      args: {
        ...(directBookingSettingsUpdateIntent.title ? { title: directBookingSettingsUpdateIntent.title } : {}),
        ...(directBookingSettingsUpdateIntent.description ? { description: directBookingSettingsUpdateIntent.description } : {}),
        ...(directBookingSettingsUpdateIntent.durationMinutes ? { durationMinutes: directBookingSettingsUpdateIntent.durationMinutes } : {}),
      },
    });
    if (directBookingSettingsUpdateIntent.wantsSettingsView || directBookingSettingsUpdateIntent.wantsLiveBookingLink) {
      bundledDirectSteps.push({
        action: "booking.settings.get",
        traceTitle: "Get Booking Settings",
        args: {},
      });
    }
    if (directBookingSettingsUpdateIntent.wantsLiveBookingLink) {
      bundledDirectSteps.push({
        action: "booking.site.get",
        traceTitle: "Get Booking Site",
        args: {},
      });
    }
  }
  if (directBookingReminderSettingsIntent) {
    bundledDirectSteps.push({
      action: "booking.reminders.settings.update",
      traceTitle: "Update Booking Reminders Settings",
      args: { settings: directBookingReminderSettingsIntent.settings },
    });
  }
  if (directBookingReminderSettingsGetIntent) {
    bundledDirectSteps.push({
      action: "booking.reminders.settings.get",
      traceTitle: "Get Booking Reminder Settings",
      args: {},
    });
  }
  if (directAiReceptionistGreetingIntent) {
    bundledDirectSteps.push({
      action: "ai_receptionist.settings.update",
      traceTitle: "Update AI Receptionist Greeting",
      args: { settings: { greeting: directAiReceptionistGreetingIntent.greeting } },
    });
  }
  if (directAiReceptionistHighlightsIntent) {
    bundledDirectSteps.push({
      action: "ai_receptionist.highlights.get",
      traceTitle: "Summarize AI Receptionist Highlights",
      args: { lookbackHours: 72, limit: 10 },
    });
  }
  if (directAiReceptionistSettingsGetIntent) {
    bundledDirectSteps.push({
      action: "ai_receptionist.settings.get",
      traceTitle: "Get AI Receptionist Settings",
      args: {},
    });
  }

  const dedupedBundledDirectSteps = bundledDirectSteps.filter((step, index, arr) => {
    const signature = JSON.stringify({ action: step.action, args: step.args ?? {} });
    return arr.findIndex((candidate) => JSON.stringify({ action: candidate.action, args: candidate.args ?? {} }) === signature) === index;
  });
  dedupedBundledDirectSteps.sort((left, right) => getBundledStepPromptOrder(prompt, left) - getBundledStepPromptOrder(prompt, right));

  if (dedupedBundledDirectSteps.length >= 2) {
    return { ...dedupedBundledDirectSteps[0], steps: dedupedBundledDirectSteps };
  }

  if (directTaskCreateIntent) {
    return {
      action: "tasks.create",
      traceTitle: "Create Task",
      args: directTaskCreateIntent,
    };
  }

  if (directSmsSendIntent) {
    return buildDirectSmsSendPlan(directSmsSendIntent, threadContext);
  }

  if (directEmailSendIntent) {
    return buildDirectEmailSendPlan(directEmailSendIntent);
  }

  if (directWeekdayScheduledSmsIntent) {
    return buildWeekdayScheduledSmsPlan(directWeekdayScheduledSmsIntent);
  }

  if (directAiChatScheduledReminderIntent) {
    return buildAiChatScheduledReminderPlan(directAiChatScheduledReminderIntent);
  }

  if (directBookingReminderSettingsIntent) {
    return {
      action: "booking.reminders.settings.update",
      traceTitle: "Update Booking Reminders Settings",
      args: { settings: directBookingReminderSettingsIntent.settings },
    };
  }

  if (directBookingSettingsUpdateIntent) {
    return {
      action: "booking.settings.update",
      traceTitle: "Update Booking Settings",
      args: {
        ...(directBookingSettingsUpdateIntent.title ? { title: directBookingSettingsUpdateIntent.title } : {}),
        ...(directBookingSettingsUpdateIntent.description ? { description: directBookingSettingsUpdateIntent.description } : {}),
        ...(directBookingSettingsUpdateIntent.durationMinutes ? { durationMinutes: directBookingSettingsUpdateIntent.durationMinutes } : {}),
      },
    };
  }

  if (directBookingSettingsGetIntent) {
    return {
      action: "booking.settings.get",
      traceTitle: "Get Booking Settings",
      args: {},
    };
  }

  if (directBusinessProfileGetIntent) {
    return {
      action: "business_profile.get",
      traceTitle: "Get Business Profile",
      args: {},
    };
  }

  if (directServicesStatusGetIntent) {
    return {
      action: "services.status.get",
      traceTitle: "Get Service Status",
      args: {},
    };
  }

  if (directWebhooksGetIntent) {
    return {
      action: "webhooks.get",
      traceTitle: "Get Webhook URLs",
      args: {},
    };
  }

  if (directMailboxGetIntent) {
    return {
      action: "mailbox.get",
      traceTitle: "Get Mailbox Address",
      args: {},
    };
  }

  if (directServicesCatalogGetIntent) {
    return {
      action: "services.catalog.get",
      traceTitle: "Get Services Catalog",
      args: {},
    };
  }

  if (directReportingSummaryGetIntent) {
    return {
      action: "reporting.summary.get",
      traceTitle: "Get Reporting Summary",
      args: directReportingSummaryGetIntent,
    };
  }

  if (directDashboardGetIntent) {
    if (directDashboardAnalysisGetIntent) {
      return {
        action: "dashboard.analysis.get",
        traceTitle: "Get Dashboard Analysis",
        args: {},
      };
    }

    if (directDashboardQuickAccessGetIntent) {
      return {
        action: "dashboard.quick_access.get",
        traceTitle: "Get Dashboard Quick Access",
        args: {},
      };
    }

    return {
      action: "dashboard.get",
      traceTitle: "Get Dashboard",
      args: {},
    };
  }

  if (directDashboardQuickAccessGetIntent) {
    return {
      action: "dashboard.quick_access.get",
      traceTitle: "Get Dashboard Quick Access",
      args: {},
    };
  }

  if (directDashboardAnalysisGetIntent) {
    return {
      action: "dashboard.analysis.get",
      traceTitle: "Get Dashboard Analysis",
      args: {},
    };
  }

  if (directProfileGetIntent) {
    return {
      action: "profile.get",
      traceTitle: "Get Profile",
      args: {},
    };
  }

  if (directReferralLinkGetIntent) {
    return {
      action: "referrals.link.get",
      traceTitle: "Get Referral Link",
      args: {},
    };
  }

  if (directMeGetIntent) {
    return {
      action: "me.get",
      traceTitle: "Get My Role And Permissions",
      args: {},
    };
  }

  if (directSalesReportGetIntent) {
    return {
      action: "reporting.sales.get",
      traceTitle: "Get Sales Report",
      args: directSalesReportGetIntent,
    };
  }

  if (directStripeReportGetIntent) {
    return {
      action: "reporting.stripe.get",
      traceTitle: "Get Stripe Report",
      args: directStripeReportGetIntent,
    };
  }

  if (directBlogAutomationSettingsIntent) {
    return {
      action: "blogs.automation.settings.update",
      traceTitle: "Update Blog Automation Settings",
      args: directBlogAutomationSettingsIntent,
    };
  }

  if (directBlogAutomationSettingsGetIntent) {
    return {
      action: "blogs.automation.settings.get",
      traceTitle: "Get Blog Automation Settings",
      args: {},
    };
  }

  if (directNewsletterAutomationSettingsIntent) {
    return {
      action: "newsletter.automation.settings.update",
      traceTitle: "Update Newsletter Automation Settings",
      args: directNewsletterAutomationSettingsIntent,
    };
  }

  if (directNewsletterAutomationSettingsGetIntent) {
    return {
      action: "newsletter.automation.settings.get",
      traceTitle: "Get Newsletter Automation Settings",
      args: { kind: /\binternal\b/i.test(prompt) ? "internal" : "external" },
    };
  }

  if (directReviewSettingsIntent) {
    return {
      action: "reviews.settings.update",
      traceTitle: "Update Review Request Settings",
      args: { settings: directReviewSettingsIntent.settings },
    };
  }

  if (directReviewSettingsGetIntent) {
    return {
      action: "reviews.settings.get",
      traceTitle: "Get Review Request Settings",
      args: {},
    };
  }

  if (directFollowUpSettingsIntent) {
    return {
      action: "follow_up.settings.update",
      traceTitle: "Update Follow-up Settings",
      args: { settings: directFollowUpSettingsIntent.settings },
    };
  }

  if (directFollowUpSettingsGetIntent) {
    return {
      action: "follow_up.settings.get",
      traceTitle: "Get Follow-up Settings",
      args: {},
    };
  }

  if (directInboxSettingsGetIntent) {
    return {
      action: "inbox.settings.get",
      traceTitle: "Get Inbox Settings",
      args: {},
    };
  }

  if (directInboxWebhookTokenRegenerateIntent) {
    return {
      action: "inbox.settings.update",
      traceTitle: "Regenerate Inbox Webhook Token",
      args: { regenerateToken: true },
    };
  }

  if (directMissedCallTextBackSettingsIntent) {
    return {
      action: "missed_call_textback.settings.update",
      traceTitle: "Update Missed Call Textback Settings",
      args: { settings: directMissedCallTextBackSettingsIntent.settings },
    };
  }

  if (directMissedCallTextBackSettingsGetIntent) {
    return {
      action: "missed_call_textback.settings.get",
      traceTitle: "Get Missed Call Textback Settings",
      args: {},
    };
  }

  if (directMissedCallTextBackTokenRegenerateIntent) {
    return {
      action: "missed_call_textback.settings.update",
      traceTitle: "Regenerate Missed Call Textback Webhook Token",
      args: { regenerateToken: true },
    };
  }

  if (directLeadScrapingSettingsIntent) {
    return {
      action: "lead_scraping.settings.update",
      traceTitle: "Update Lead Scraping Settings",
      args: { settings: directLeadScrapingSettingsIntent.settings },
    };
  }

  if (directLeadScrapingSettingsGetIntent) {
    return {
      action: "lead_scraping.settings.get",
      traceTitle: "Get Lead Scraping Settings",
      args: {},
    };
  }

  if (directAutomationsSettingsGetIntent) {
    return {
      action: "automations.settings.get",
      traceTitle: "Get Automation Settings",
      args: {},
    };
  }

  if (directBillingSummaryGetIntent) {
    return {
      action: "billing.summary.get",
      traceTitle: "Get Billing Summary",
      args: {},
    };
  }

  if (directBillingInfoGetIntent) {
    return {
      action: "billing.info.get",
      traceTitle: "Get Billing Info",
      args: {},
    };
  }

  if (directPricingGetIntent) {
    return {
      action: "pricing.get",
      traceTitle: "Get Pricing",
      args: {},
    };
  }

  if (directCreditsGetIntent) {
    return {
      action: "credits.get",
      traceTitle: "Get Credits",
      args: {},
    };
  }

  if (directOnboardingStatusGetIntent) {
    return {
      action: "onboarding.status.get",
      traceTitle: "Get Onboarding Status",
      args: {},
    };
  }

  if (directSuggestedSetupPreviewGetIntent) {
    return {
      action: "suggested_setup.preview.get",
      traceTitle: "Get Suggested Setup Preview",
      args: {},
    };
  }

  if (directContactTagsListIntent) {
    return {
      action: "contact_tags.list",
      traceTitle: "List Contact Tags",
      args: {},
    };
  }

  if (directContactCustomVariableKeysGetIntent) {
    return {
      action: "people.contacts.custom_variable_keys.get",
      traceTitle: "Get Contact Custom Variable Keys",
      args: {},
    };
  }

  if (directContactDuplicatesGetIntent) {
    return {
      action: "people.contacts.duplicates.get",
      traceTitle: "Get Duplicate Contacts",
      args: { summaryOnly: true },
    };
  }

  if (directAiAgentsListIntent) {
    return {
      action: "ai_agents.list",
      traceTitle: "List AI Agents",
      args: {},
    };
  }

  if (directPeopleUsersListIntent) {
    return {
      action: "people.users.list",
      traceTitle: "List Team Members",
      args: {},
    };
  }

  if (directNotificationsRecipientsListIntent) {
    return {
      action: "notifications.recipients.list",
      traceTitle: "List Notification Recipients",
      args: {},
    };
  }

  if (directBillingSubscriptionsListIntent) {
    return {
      action: "billing.subscriptions.list",
      traceTitle: "List Billing Subscriptions",
      args: {},
    };
  }

  if (directBookingCalendarsGetIntent) {
    return {
      action: "booking.calendars.get",
      traceTitle: "Get Booking Calendars",
      args: {},
    };
  }

  if (directVoiceAgentToolsGetIntent) {
    return {
      action: "voice_agent.tools.get",
      traceTitle: "Get Voice Agent Tools",
      args: {},
    };
  }

  if (directVoiceAgentVoicesListIntent) {
    return {
      action: "voice_agent.voices.list",
      traceTitle: "List Voice Agent Voices",
      args: {},
    };
  }

  if (directMediaStatsGetIntent) {
    return {
      action: "media.stats.get",
      traceTitle: "Get Media Stats",
      args: {},
    };
  }

  if (directBlogsAppearanceGetIntent) {
    return {
      action: "blogs.appearance.get",
      traceTitle: "Get Blog Appearance",
      args: {},
    };
  }

  if (directBlogsSiteGetIntent) {
    return {
      action: "blogs.site.get",
      traceTitle: "Get Blog Site",
      args: {},
    };
  }

  if (directNewsletterSiteGetIntent) {
    return {
      action: "newsletter.site.get",
      traceTitle: "Get Newsletter Site",
      args: {},
    };
  }

  if (directReviewsSiteGetIntent) {
    return {
      action: "reviews.site.get",
      traceTitle: "Get Reviews Site",
      args: {},
    };
  }

  if (directBookingFormGetIntent) {
    return {
      action: "booking.form.get",
      traceTitle: "Get Booking Form",
      args: {},
    };
  }

  if (directBookingSiteGetIntent) {
    return {
      action: "booking.site.get",
      traceTitle: "Get Booking Site",
      args: {},
    };
  }

  if (directBlogsUsageGetIntent) {
    return {
      action: "blogs.usage.get",
      traceTitle: "Get Blog Usage",
      args: {},
    };
  }

  if (directNewsletterUsageGetIntent) {
    return {
      action: "newsletter.usage.get",
      traceTitle: "Get Newsletter Usage",
      args: {},
    };
  }

  if (directFollowUpCustomVariablesGetIntent) {
    return {
      action: "follow_up.custom_variables.get",
      traceTitle: "Get Follow Up Custom Variables",
      args: {},
    };
  }

  if (directReviewsHandleGetIntent) {
    return {
      action: "reviews.handle.get",
      traceTitle: "Get Reviews Handle",
      args: {},
    };
  }

  if (directReviewsQuestionsListIntent) {
    return {
      action: "reviews.questions.list",
      traceTitle: "List Review Questions",
      args: {},
    };
  }

  if (directMediaFoldersListIntent) {
    return {
      action: "media.folders.list",
      traceTitle: "List Media Folders",
      args: {},
    };
  }

  if (directBlogsPostsListIntent) {
    return {
      action: "blogs.posts.list",
      traceTitle: "List Blog Posts",
      args: {},
    };
  }

  if (directNewsletterNewslettersListIntent) {
    return {
      action: "newsletter.newsletters.list",
      traceTitle: "List Newsletters",
      args: {},
    };
  }

  if (directReviewsBookingsListIntent) {
    return {
      action: "reviews.bookings.list",
      traceTitle: "List Review Bookings",
      args: {},
    };
  }

  if (directReviewsEventsListIntent) {
    return {
      action: "reviews.events.list",
      traceTitle: "List Review Events",
      args: {},
    };
  }

  if (directFunnelBuilderSettingsGetIntent) {
    return {
      action: "funnel_builder.settings.get",
      traceTitle: "Get Funnel Builder Settings",
      args: {},
    };
  }

  if (directFunnelBuilderDomainsListIntent) {
    return {
      action: "funnel_builder.domains.list",
      traceTitle: "List Funnel Domains",
      args: {},
    };
  }

  if (directFunnelBuilderFormsListIntent) {
    return {
      action: "funnel_builder.forms.list",
      traceTitle: "List Funnel Forms",
      args: {},
    };
  }

  if (directFunnelBuilderFormFieldKeysGetIntent) {
    return {
      action: "funnel_builder.form_field_keys.get",
      traceTitle: "Get Funnel Form Field Keys",
      args: {},
    };
  }

  if (directFunnelBuilderFunnelsListIntent) {
    return {
      action: "funnel_builder.funnels.list",
      traceTitle: "List Funnels",
      args: {},
    };
  }

  if (directFunnelBuilderSalesProductsListIntent) {
    return {
      action: "funnel_builder.sales.products.list",
      traceTitle: "List Funnel Sales Products",
      args: {},
    };
  }

  if (directTasksListIntent) {
    return {
      action: "tasks.list",
      traceTitle: "List Tasks",
      args: {},
    };
  }

  if (directTaskAssigneesListIntent) {
    return {
      action: "tasks.assignees.list",
      traceTitle: "List Task Assignees",
      args: {},
    };
  }

  if (directNurtureCampaignsListIntent) {
    return {
      action: "nurture.campaigns.list",
      traceTitle: "List Nurture Campaigns",
      args: {},
    };
  }

  if (directAiOutboundCampaignsListIntent) {
    return {
      action: "ai_outbound_calls.campaigns.list",
      traceTitle: "List AI Outbound Campaigns",
      args: {},
    };
  }

  if (directAiOutboundManualCallsListIntent) {
    return {
      action: "ai_outbound_calls.manual_calls.list",
      traceTitle: "List Manual AI Outbound Calls",
      args: {},
    };
  }

  if (directAiChatThreadsListIntent) {
    return {
      action: "ai_chat.threads.list",
      traceTitle: "List AI Chat Threads",
      args: {},
    };
  }

  if (directAiChatThreadStatusesListIntent) {
    return {
      action: "ai_chat.threads.status.list",
      traceTitle: "List AI Chat Thread Statuses",
      args: {},
    };
  }

  if (directAiChatScheduledListIntent) {
    return {
      action: "ai_chat.scheduled.list",
      traceTitle: "List Scheduled AI Chat Reminders",
      args: {},
    };
  }

  if (directCreditContactsListIntent) {
    return {
      action: "credit.contacts.list",
      traceTitle: "List Credit Contacts",
      args: {},
    };
  }

  if (directCreditPullsListIntent) {
    return {
      action: "credit.pulls.list",
      traceTitle: "List Credit Pulls",
      args: {},
    };
  }

  if (directCreditReportsListIntent) {
    return {
      action: "credit.reports.list",
      traceTitle: "List Credit Reports",
      args: {},
    };
  }

  if (directCreditDisputeLettersListIntent) {
    return {
      action: "credit.disputes.letters.list",
      traceTitle: "List Credit Dispute Letters",
      args: {},
    };
  }

  if (directMediaListGetIntent) {
    return {
      action: "media.list.get",
      traceTitle: "Get Media Library Items",
      args: {},
    };
  }

  if (directTwilioIntegrationGetIntent) {
    return {
      action: "integrations.twilio.get",
      traceTitle: "Get Twilio Integration Settings",
      args: {},
    };
  }

  if (directStripeIntegrationGetIntent) {
    return {
      action: "integrations.stripe.get",
      traceTitle: "Get Stripe Integration Settings",
      args: {},
    };
  }

  if (directSalesReportingIntegrationGetIntent) {
    return {
      action: "integrations.sales_reporting.get",
      traceTitle: "Get Sales Reporting Integration Settings",
      args: {},
    };
  }

  if (directApiKeysListIntent) {
    return {
      action: "integrations.api_keys.list",
      traceTitle: "List API Keys",
      args: {},
    };
  }

  if (directBookingReminderSettingsGetIntent) {
    return {
      action: "booking.reminders.settings.get",
      traceTitle: "Get Booking Reminder Settings",
      args: {},
    };
  }

  if (directAiReceptionistGreetingIntent) {
    return {
      action: "ai_receptionist.settings.update",
      traceTitle: "Update AI Receptionist Greeting",
      args: { settings: { greeting: directAiReceptionistGreetingIntent.greeting } },
    };
  }

  if (directAiReceptionistHighlightsIntent) {
    return {
      action: "ai_receptionist.highlights.get",
      traceTitle: "Summarize AI Receptionist Highlights",
      args: { lookbackHours: 72, limit: 10 },
    };
  }

  if (directAiReceptionistSettingsGetIntent) {
    return {
      action: "ai_receptionist.settings.get",
      traceTitle: "Get AI Receptionist Settings",
      args: {},
    };
  }

  if (directAiOutboundManualCallIntent) {
    return buildAiOutboundManualCallPlan(directAiOutboundManualCallIntent, threadContext);
  }

  if (directAiOutboundCampaignIntent) {
    return buildAiOutboundCampaignPlan(directAiOutboundCampaignIntent);
  }

  if (signals.hostedPageGenerateTarget) {
    return {
      action: "hosted_pages.documents.generate_html",
      traceTitle: "Generate Hosted Page HTML",
      args: {
        service: signals.hostedPageGenerateTarget.service,
        ...(signals.hostedPageGenerateTarget.pageKey ? { pageKey: signals.hostedPageGenerateTarget.pageKey } : null),
        prompt,
      },
    };
  }

  if (signals.hostedPageUpdateTarget) {
    return {
      action: "hosted_pages.documents.update",
      traceTitle: "Update Hosted Page Document",
      args: {
        service: signals.hostedPageUpdateTarget.service,
        ...(signals.hostedPageUpdateTarget.pageKey ? { pageKey: signals.hostedPageUpdateTarget.pageKey } : null),
        ...(signals.hostedPageUpdateTarget.title ? { title: signals.hostedPageUpdateTarget.title } : null),
        ...(signals.hostedPageUpdateTarget.status ? { status: signals.hostedPageUpdateTarget.status } : null),
      },
    };
  }

  if (signals.hostedPagePublishTarget) {
    return {
      action: "hosted_pages.documents.publish",
      traceTitle: "Publish Hosted Page Document",
      args: {
        service: signals.hostedPagePublishTarget.service,
        ...(signals.hostedPagePublishTarget.pageKey ? { pageKey: signals.hostedPagePublishTarget.pageKey } : null),
      },
    };
  }

  if (signals.hostedPageResetTarget) {
    return {
      action: "hosted_pages.documents.reset_to_default",
      traceTitle: "Reset Hosted Page Document",
      args: {
        service: signals.hostedPageResetTarget.service,
        ...(signals.hostedPageResetTarget.pageKey ? { pageKey: signals.hostedPageResetTarget.pageKey } : null),
      },
    };
  }

  if (signals.hostedPagePreviewTarget) {
    return {
      action: "hosted_pages.documents.preview_data",
      traceTitle: "Inspect Hosted Page Preview Data",
      args: {
        service: signals.hostedPagePreviewTarget.service,
        ...(signals.hostedPagePreviewTarget.pageKey ? { pageKey: signals.hostedPagePreviewTarget.pageKey } : null),
      },
    };
  }

  if (signals.hostedPageGetTarget) {
    return {
      action: signals.hostedPageGetTarget.pageKey ? "hosted_pages.documents.get" : "hosted_pages.documents.list",
      traceTitle: signals.hostedPageGetTarget.pageKey ? "Get Hosted Page Document" : "List Hosted Page Documents",
      args: signals.hostedPageGetTarget.pageKey
        ? {
            service: signals.hostedPageGetTarget.service,
            pageKey: signals.hostedPageGetTarget.pageKey,
          }
        : { service: signals.hostedPageGetTarget.service },
    };
  }

  if (signals.hostedPageListService) {
    return {
      action: "hosted_pages.documents.list",
      traceTitle: "List Hosted Page Documents",
      args: { service: signals.hostedPageListService },
    };
  }

  if (signals.nurtureCampaignCreateTitle && signals.compactPrompt.includes("nurture")) {
    return {
      action: "nurture.campaigns.create",
      traceTitle: "Create Nurture Campaign",
      args: { name: signals.nurtureCampaignCreateTitle.slice(0, 120) },
    };
  }

  if (signals.newsletterCreateTitle) {
    return buildNewsletterCreatePlan(signals.newsletterCreateTitle);
  }

  if (signals.shouldSendLatestNewsletter && threadContext.lastNewsletter?.id) {
    return {
      action: "newsletter.newsletters.send",
      traceTitle: "Send Newsletter",
      args: { newsletterId: String(threadContext.lastNewsletter.id).trim() },
    };
  }

  if (signals.blogCreateTitle) {
    return buildBlogCreatePlan(signals.blogCreateTitle);
  }

  if (signals.shouldPublishLatestBlog && threadContext.lastBlogPost?.id) {
    return {
      action: "blogs.posts.publish",
      traceTitle: "Publish Blog Post",
      args: { postId: String(threadContext.lastBlogPost.id).trim() },
    };
  }

  if (signals.funnelCreateTitle) {
    const name = signals.funnelCreateTitle.slice(0, 120);
    return {
      action: "funnel.create",
      traceTitle: "Create Funnel",
      args: { name, slug: makeSlug(name) || "webinar-growth-funnel" },
    };
  }

  if (signals.shouldCreateLandingPage && threadContext.lastFunnel?.id) {
    return {
      action: "funnel_builder.pages.create",
      traceTitle: "Create Funnel Landing Page",
      args: {
        funnelId: String(threadContext.lastFunnel.id).trim(),
        slug: "webinar-signup",
        title: "Free Webinar Signup",
        contentMarkdown: "# Free Webinar Signup\n\nReserve your spot for the webinar.",
      },
    };
  }

  if (signals.shouldGenerateLandingLayout && threadContext.lastFunnel?.id && threadContext.lastFunnelPage?.id) {
    return {
      action: "funnel_builder.pages.generate_html",
      traceTitle: "Generate Funnel Page Layout",
      args: {
        funnelId: String(threadContext.lastFunnel.id).trim(),
        pageId: String(threadContext.lastFunnelPage.id).trim(),
        prompt,
      },
    };
  }

  if (signals.shouldUpdateCurrentFunnelPage && threadContext.lastFunnel?.id && threadContext.lastFunnelPage?.id) {
    return {
      action: "funnel_builder.pages.generate_html",
      traceTitle: "Update Funnel Page",
      args: {
        funnelId: String(threadContext.lastFunnel.id).trim(),
        pageId: String(threadContext.lastFunnelPage.id).trim(),
        prompt,
      },
    };
  }

  if (signals.mediaFolderCreateTitle) {
    return {
      action: "media.folder.ensure",
      traceTitle: "Ensure Media Folder Exists",
      args: { name: signals.mediaFolderCreateTitle.slice(0, 120) },
    };
  }

  if (signals.shouldImportToNamedMediaFolder && signals.mediaImportUrl) {
    return {
      action: "media.import_remote_image",
      traceTitle: "Import Remote Image",
      args: {
        url: signals.mediaImportUrl,
        ...(signals.mediaImportFolderNameHint
          ? { folderName: signals.mediaImportFolderNameHint }
          : threadContext.lastMediaFolder?.id
            ? { folderId: String(threadContext.lastMediaFolder.id).trim() }
            : {}),
      },
    };
  }

  if (signals.shouldListLatestMediaFolder && threadContext.lastMediaFolder?.id) {
    return {
      action: "media.items.list",
      traceTitle: "List Media Items",
      args: { folderId: String(threadContext.lastMediaFolder.id).trim(), limit: 50 },
    };
  }

  if (signals.shouldListReviewsWithoutReply) {
    return {
      action: "reviews.inbox.list",
      traceTitle: "List Reviews Without Business Reply",
      args: { hasBusinessReply: false },
    };
  }

  if (signals.reviewReplyIntent) {
    return buildReviewReplyPlan(signals.reviewReplyIntent);
  }

  if (signals.shouldRunPreflightReviewSummary) {
    return {
      action: "reviews.inbox.list",
      traceTitle: "Summarize Reviews",
      args: {},
    };
  }

  if (signals.nurtureStepIntent) {
    return {
      action: "nurture.campaigns.steps.add",
      traceTitle: signals.nurtureStepIntent.kind === "SMS" ? "Add SMS Step to Nurture Campaign" : "Add Email Step to Nurture Campaign",
      args: signals.nurtureStepIntent,
    };
  }

  if (signals.leadRunIntent && (signals.leadRunIntent.count || signals.leadRunIntent.niche || signals.leadRunIntent.location)) {
    return {
      action: "lead_scraping.run",
      traceTitle: "Run Lead Scraping",
      args: signals.leadRunIntent,
    };
  }

  if (signals.shouldListLatestLeads) {
    const latestLeadIds = Array.isArray(threadContext.lastLeadScrape?.leadIds)
      ? threadContext.lastLeadScrape?.leadIds
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .slice(0, 50)
      : [];
    return {
      action: "lead_scraping.leads.list",
      traceTitle: "List Scraped Leads",
      args: {
        take: Math.max(1, Math.min(50, latestLeadIds.length || 10)),
        leadIds: latestLeadIds,
      },
    };
  }

  if (signals.shouldDraftLeadEmail) {
    return {
      action: "lead_scraping.outbound.ai.draft_template",
      traceTitle: "Draft Outbound Email Template",
      args: { kind: "EMAIL", prompt },
    };
  }

  if (signals.shouldSuggestBookingSlots) {
    return {
      action: "booking.suggestions.slots",
      traceTitle: "Get Booking Slot Suggestions",
      args: { days: 7, limit: 10 },
    };
  }

  if (signals.shouldSetWeekdayAvailability) {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const toDateOnly = (value: Date) => {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, "0");
      const day = String(value.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    return {
      action: "booking.availability.set_daily",
      traceTitle: "Set Weekday Booking Availability",
      args: {
        startDateLocal: toDateOnly(start),
        endDateLocal: toDateOnly(end),
        startTimeLocal: "09:00",
        endTimeLocal: "17:00",
        isoWeekdays: [1, 2, 3, 4, 5],
        replaceExisting: true,
      },
    };
  }

  if (signals.shouldUpdateBookingThankYou) {
    return {
      action: "booking.form.update",
      traceTitle: "Update Booking Form",
      args: { thankYouMessage: "We will send a prep checklist before the call." },
    };
  }

  return null;
}
