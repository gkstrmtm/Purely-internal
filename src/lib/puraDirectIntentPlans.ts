import type { PortalAgentActionKey } from "@/lib/portalAgentActions";
import { encodeScheduledActionEnvelope } from "@/lib/portalAiChatScheduledActionEnvelope";
import type { PuraDirectIntentContext, PuraDirectIntentSignals } from "@/lib/puraDirectIntentSignals";

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
  to: string;
  body: string;
};

type DirectEmailSendIntent = {
  to: string;
  subject: string;
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

function cleanQuotedText(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^["“'`]+/, "")
    .replace(/["”'`]+$/, "")
    .replace(/[.]+$/g, "")
    .trim();
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

function parseRelativeDueAtIso(prompt: string): string | null {
  const lower = String(prompt || "").toLowerCase();
  const timeMatch = lower.match(/\b(?:at|for)\s+(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i) || lower.match(/\b(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  const parsedTime = parseTimeTo24Hour(timeMatch?.[1] || "9am");
  if (!parsedTime) return null;

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

function extractTaskTitle(prompt: string): string {
  const taskVerbPattern = "(?:create|add|make|set\\s+up|setup|spin\\s+up)";
  const scheduleClause = "(?:\\s+(?:for|due)\\s+(?:tomorrow|next\\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))(?:\\s+at\\s+(?:noon|midnight|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)))?)?";
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

function extractDirectTaskCreateIntent(prompt: string): DirectTaskCreateIntent | null {
  if (!/\b(?:create|add|make|set\s+up|setup|spin\s+up)\s+(?:me\s+)?(?:an?\s+)?(?:open\s+|new\s+)?task\b/i.test(prompt)) return null;
  if (/\bevery\s+(?:weekday|day|daily|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(prompt)) return null;

  const title = extractTaskTitle(prompt);
  if (!title) return null;

  const noteMatch = prompt.match(/\b(?:include\s+)?(?:a\s+)?note\s+to\s+(.+?)(?:[.?!]|$)/i);
  const description = noteMatch?.[1] ? cleanQuotedText(String(noteMatch[1]).slice(0, 1000)) : "";
  const dueAtIso = parseRelativeDueAtIso(prompt) || undefined;
  const assignedToMe = /\bassign(?:\s+it)?\s+to\s+me\b/i.test(prompt) || /\bassigned\s+to\s+me\b/i.test(prompt);

  return {
    title,
    ...(description ? { description } : {}),
    ...(dueAtIso ? { dueAtIso } : {}),
    ...(assignedToMe ? { assignedToUserId: "me" } : {}),
  };
}

function extractDirectSmsSendIntent(prompt: string): DirectSmsSendIntent | null {
  const match = prompt.match(/\bsend\s+(?:an\s+)?(?:outbound\s+)?sms\s+to\s+([+()\d\-\s]{7,})\s+(?:that\s+says|saying|with\s+body)\s*:?\s+([\s\S]+?)\s*$/i);
  const to = match?.[1] ? String(match[1]).trim() : "";
  const body = match?.[2] ? cleanQuotedText(String(match[2]).slice(0, 900)) : "";
  if (!to || !body) return null;
  return { to, body };
}

function extractDirectEmailSendIntent(prompt: string): DirectEmailSendIntent | null {
  const match = prompt.match(/\bsend\s+(?:an\s+)?(?:outbound\s+)?email\s+to\s+(\S+@\S+)\s+with\s+subject\s+(.+?)\s+and\s+body\s+([\s\S]+?)\s*$/i);
  const to = match?.[1] ? cleanQuotedText(String(match[1]).slice(0, 200)) : "";
  const subject = match?.[2] ? cleanQuotedText(String(match[2]).slice(0, 140)) : "";
  const body = match?.[3] ? cleanQuotedText(String(match[3]).slice(0, 4000)) : "";
  if (!to || !subject || !body) return null;
  return { to, subject, body };
}

function extractDirectWeekdayScheduledSmsIntent(prompt: string): DirectWeekdayScheduledSmsIntent | null {
  const match = prompt.match(/\bevery\s+weekday\s+at\s+(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*,?\s*send\s+(.+?)\s+a\s+(.+?)\s*$/i);
  if (!match?.[1] || !match?.[2] || !match?.[3]) return null;
  const parsedTime = parseTimeTo24Hour(match[1]);
  if (!parsedTime) return null;
  const contactHint = cleanQuotedText(String(match[2]).slice(0, 120));
  const rawMessageGoal = cleanQuotedText(String(match[3]).slice(0, 240));
  if (!contactHint || !rawMessageGoal) return null;

  const body = /^good\s+morning\b/i.test(rawMessageGoal)
    ? `Good morning ${contactHint}, hope you're doing well. Just wanted to get the conversation started.`
    : `Hi ${contactHint}, ${rawMessageGoal}`;

  return { contactHint, timeLocal: parsedTime.hhmm, body };
}

function extractDirectAiChatScheduledReminderIntent(prompt: string): DirectAiChatScheduledReminderIntent | null {
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
    const sendAtIso = parseRelativeDueAtIso(scheduleText);
    if (!sendAtIso) continue;
    return { sendAtIso, text: bodyText };
  }

  const missingBodyScheduleMatch = prompt.match(/\bremind\s+me\s+in\s+this\s+chat\s+(.+?)(?:[.?!]|$)/i);
  if (missingBodyScheduleMatch?.[1]) {
    const sendAtIso = parseRelativeDueAtIso(String(missingBodyScheduleMatch[1]).trim());
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
  const threadContext = safeContext(opts.threadContext);
  const directTaskCreateIntent = extractDirectTaskCreateIntent(prompt);
  const directSmsSendIntent = extractDirectSmsSendIntent(prompt);
  const directEmailSendIntent = extractDirectEmailSendIntent(prompt);
  const directWeekdayScheduledSmsIntent = extractDirectWeekdayScheduledSmsIntent(prompt);
  const directAiChatScheduledReminderIntent = extractDirectAiChatScheduledReminderIntent(prompt);
  const directAiOutboundCampaignIntent = extractDirectAiOutboundCampaignIntent(prompt);
  const directAiOutboundManualCallIntent = extractDirectAiOutboundManualCallIntent(prompt);

  const bundledDirectSteps: PuraDirectActionStep[] = [];
  if (signals.reviewReplyIntent) bundledDirectSteps.push(buildReviewReplyPlan(signals.reviewReplyIntent));
  if (signals.blogCreateTitle) bundledDirectSteps.push(buildBlogCreatePlan(signals.blogCreateTitle));
  if (signals.newsletterCreateTitle) bundledDirectSteps.push(buildNewsletterCreatePlan(signals.newsletterCreateTitle));
  if (directTaskCreateIntent) {
    bundledDirectSteps.push({
      action: "tasks.create",
      traceTitle: "Create Task",
      args: directTaskCreateIntent,
    });
  }
  if (directAiChatScheduledReminderIntent) bundledDirectSteps.push(buildAiChatScheduledReminderPlan(directAiChatScheduledReminderIntent));

  const dedupedBundledDirectSteps = bundledDirectSteps.filter((step, index, arr) => {
    const signature = JSON.stringify({ action: step.action, args: step.args ?? {} });
    return arr.findIndex((candidate) => JSON.stringify({ action: candidate.action, args: candidate.args ?? {} }) === signature) === index;
  });

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
    return {
      action: "inbox.send_sms",
      traceTitle: "Send Outbound SMS",
      args: directSmsSendIntent,
    };
  }

  if (directEmailSendIntent) {
    return {
      action: "inbox.send_email",
      traceTitle: "Send Outbound Email",
      args: directEmailSendIntent,
    };
  }

  if (directWeekdayScheduledSmsIntent) {
    return buildWeekdayScheduledSmsPlan(directWeekdayScheduledSmsIntent);
  }

  if (directAiChatScheduledReminderIntent) {
    return buildAiChatScheduledReminderPlan(directAiChatScheduledReminderIntent);
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

  if (signals.shouldUpdateBookingThankYou) {
    return {
      action: "booking.form.update",
      traceTitle: "Update Booking Form",
      args: { thankYouMessage: "We will send a prep checklist before the call." },
    };
  }

  return null;
}
