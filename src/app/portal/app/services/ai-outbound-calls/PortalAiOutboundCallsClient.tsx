"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import {
  IconCalls,
  IconMessages,
  IconReceptionistTesting,
  IconSidebarSettings,
  PortalSidebarNavButton,
  portalSidebarButtonActiveClass,
  portalSidebarButtonBaseClass,
  portalSidebarButtonInactiveClass,
  portalSidebarIconToneBlueClass,
  portalSidebarIconToneNeutralClass,
  portalSidebarMetaTextClass,
  portalSidebarSectionStackClass,
  portalSidebarSectionTitleClass,
} from "@/app/portal/PortalServiceSidebarIcons";
import { AiSparkIcon } from "@/components/AiSparkIcon";
import { ContactTagsEditor, type ContactTag as ContactEditorTag } from "@/components/ContactTagsEditor";
import { InlineElevenLabsAgentTester } from "@/components/InlineElevenLabsAgentTester";
import { InlineSpinner } from "@/components/InlineSpinner";
import LiquidGlassPopupSurface from "@/components/LiquidGlassPopupSurface";
import { PortalContactDetailsModal } from "@/components/PortalContactDetailsModal";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalSelectDropdown } from "@/components/PortalSelectDropdown";
import { SuggestedSetupModalLauncher } from "@/components/SuggestedSetupModalLauncher";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { useToast } from "@/components/ToastProvider";
import { portalGlassButtonClass } from "@/components/portalGlass";
import { DEFAULT_TAG_COLORS } from "@/lib/tagColors.shared";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";
import { PORTAL_MESSAGE_VARIABLES } from "@/lib/portalTemplateVars";
import { type OutboundContextReport } from "@/lib/portalAiOutboundIntelligence";
import { DEFAULT_VOICE_AGENT_CONFIG, type VoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

type OutcomeRuleMatchType = "any" | "contains";
type CallOutcomeKey = "any" | "completed" | "failed" | "skipped";
type MessageOutcomeKey = "any" | "sent" | "failed" | "skipped";

type CallOutcomeRule = {
  id: string;
  label: string;
  outcome: CallOutcomeKey;
  matchType: OutcomeRuleMatchType;
  matchText: string;
  tagIds: string[];
};

type MessageOutcomeRule = {
  id: string;
  label: string;
  outcome: MessageOutcomeKey;
  matchType: OutcomeRuleMatchType;
  matchText: string;
  tagIds: string[];
};

type CallOutcomeTagging = {
  enabled: boolean;
  onCompletedTagIds: string[];
  onFailedTagIds: string[];
  onSkippedTagIds: string[];
  rules: CallOutcomeRule[];
};

type MessageOutcomeTagging = {
  enabled: boolean;
  onSentTagIds: string[];
  onFailedTagIds: string[];
  onSkippedTagIds: string[];
  rules: MessageOutcomeRule[];
};

type ActivityMenuState = {
  id: string;
  top: number;
  left: number;
  openUpwards: boolean;
};

type KnowledgeBaseLocator = {
  id: string;
  name: string;
  type: "file" | "url" | "text" | "folder";
  usage_mode?: "auto" | "prompt";
};

type CampaignKnowledgeBase = {
  version: 1;
  seedUrl: string;
  crawlDepth: number;
  maxUrls: number;
  text: string;
  locators?: KnowledgeBaseLocator[];
  lastSyncedAtIso?: string;
  lastSyncError?: string;
  updatedAtIso?: string;
};

type CampaignBookingConfig = {
  enabled: boolean;
  calendarId: string | null;
};

type BookingCalendarOption = {
  id: string;
  title: string;
  meetingLocation?: string | null;
  meetingDetails?: string | null;
};

type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  audienceTagIds: string[];
  chatAudienceTagIds: string[];
  voiceAgentId: string;
  manualVoiceAgentId: string;
  voiceAgentConfig: VoiceAgentConfig;
  voiceId: string | null;
  knowledgeBase: CampaignKnowledgeBase | null;
  messagesKnowledgeBase: CampaignKnowledgeBase | null;
  chatAgentId: string;
  manualChatAgentId: string;
  chatAgentConfig: VoiceAgentConfig;
  messageChannelPolicy: "SMS" | "EMAIL" | "BOTH";
  callOutcomeTagging: CallOutcomeTagging;
  messageOutcomeTagging: MessageOutcomeTagging;
  bookingConfig: CampaignBookingConfig;
  createdAtIso: string;
  updatedAtIso: string;
  enrollQueued: number;
  enrollCompleted: number;
};

type ContactTag = { id: string; name: string; color: string | null };

type VoiceTool = {
  key: string;
  label: string;
  description: string;
  toolId: string | null;
};

type VoiceLibraryVoice = {
  id: string;
  name: string;
  category?: string;
  description?: string;
};

const DEFAULT_VOICE_PREVIEW_TEXT = "Hi! This is a voice preview.";

type ApiGetVoiceLibraryVoicesResponse =
  | { ok: true; voices: VoiceLibraryVoice[] }
  | { ok: false; error?: string };

type ApiGetVoiceToolsResponse =
  | { ok: true; tools: VoiceTool[]; apiKeyConfigured?: boolean }
  | { ok: false; error?: string };

type ApiGetCampaignsResponse =
  | { ok: true; campaigns: Campaign[] }
  | { ok: false; error: string };

type ApiCreateCampaignResponse =
  | { ok: true; id: string }
  | { ok: false; error: string };

type ApiCreateTagResponse =
  | { ok: true; tag: ContactTag }
  | { ok: false; error: string };

type ApiGetContactTagsResponse =
  | { ok: true; tags: ContactTag[] }
  | { ok: false; error?: string };

type ApiGenerateAgentConfigResponse =
  | {
      ok: true;
      config: Partial<
        Pick<VoiceAgentConfig, "firstMessage" | "goal" | "personality" | "tone" | "environment" | "guardRails">
      >;
      analysis?: OutboundContextReport;
      warning?: string;
    }
  | { ok: false; error: string; analysis?: OutboundContextReport };

type ApiEnrollMessageContactResponse =
  | { ok: true; enrolled: true; alreadySentFirstMessage: boolean; activatedCampaign?: boolean }
  | { ok: false; error?: string };

type ManualCall = {
  id: string;
  campaignId: string | null;
  toNumberE164: string;
  status: string;
  callSid: string | null;
  conversationId: string | null;
  recordingSid: string | null;
  recordingDurationSec?: number | null;
  transcriptText: string | null;
  bookingAnalysis?: {
    booked: boolean;
    needsBooking: boolean;
    requestedTimeText: string | null;
    summary: string;
    missingRequiredFields?: string[];
  } | null;
  lastError: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

type ApiGetManualCallsResponse =
  | { ok: true; manualCalls: ManualCall[] }
  | { ok: false; error?: string };

type ApiGetManualCallResponse =
  | { ok: true; manualCall: ManualCall }
  | { ok: false; error?: string };

type CampaignActivityCounts = {
  queued: number;
  calling: number;
  completed: number;
  failed: number;
  skipped: number;
};

type CampaignActivityRow = {
  id: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
  callSid: string | null;
  nextCallAtIso: string | null;
  completedAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  contact: { id: string; name: string | null; phone: string | null; email: string | null };
};

type ApiGetCampaignActivityResponse =
  | { ok: true; counts: CampaignActivityCounts; recent: CampaignActivityRow[] }
  | { ok: false; error?: string };

type CallActivityDetail = {
  kind?: "enrollment" | "manual" | "seeded";
  enrollmentId: string;
  status: string;
  attemptCount: number;
  lastError: string | null;
  callSid: string | null;
  conversationId?: string | null;
  recordingSid?: string | null;
  nextCallAtIso: string | null;
  completedAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  contact: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  contactTags: ContactEditorTag[];
  transcriptText: string | null;
  transcriptSource: "enrollment" | "manual_call" | "none";
  transcriptUpdatedAtIso: string | null;
  bookingAnalysis:
    | {
        booked: boolean;
        needsBooking: boolean;
        requestedTimeText: string | null;
        summary: string;
        missingRequiredFields?: string[];
      }
    | null;
};

type ApiGetCallActivityDetailResponse =
  | { ok: true; detail: CallActivityDetail }
  | { ok: false; error?: string };

type CallActivityListRow = {
  id: string;
  source: "AUDIENCE" | "MANUAL";
  kind: "enrollment" | "manual";
  isSeeded: boolean;
  status: string;
  attemptCount: number;
  lastError: string | null;
  callSid: string | null;
  conversationId: string | null;
  recordingSid: string | null;
  nextCallAtIso: string | null;
  completedAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  transcriptText: string | null;
  bookingAnalysis:
    | {
        booked: boolean;
        needsBooking: boolean;
        requestedTimeText: string | null;
        summary: string;
        missingRequiredFields?: string[];
      }
    | null;
  contact: { id: string; name: string | null; phone: string | null; email: string | null };
};

type ContactSearchResult = { id: string; name: string | null; email: string | null; phone: string | null };

type ApiSearchContactsResponse =
  | { ok: true; contacts: ContactSearchResult[] }
  | { ok: false; error?: string };

type MessageActivityRow = {
  id: string;
  status: string;
  source: "TAG" | "MANUAL" | "INBOUND" | string;
  nextSendAtIso: string | null;
  sentFirstMessageAtIso: string | null;
  threadId: string | null;
  attemptCount: number;
  lastError: string | null;
  nextReplyAtIso: string | null;
  replyAttemptCount: number;
  replyLastError: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  contact: { id: string; name: string | null; email: string | null; phone: string | null } | null;
};

type MessageThreadMessage = {
  id: string;
  direction: string | null;
  bodyText: string | null;
  subject: string | null;
  createdAt: string;
  fromAddress: string | null;
  toAddress: string | null;
};

type ApiInboxThreadMessagesResponse =
  | {
      ok: true;
      messages: MessageThreadMessage[];
      scheduledMessages?: Array<unknown>;
    }
  | { ok: false; error?: string };

type ApiGetMessagesActivityResponse =
  | {
      ok: true;
      countsByStatus: Record<string, number>;
      countsBySource: Record<string, number>;
      recent: MessageActivityRow[];
    }
  | { ok: false; error?: string };

type ChatTestMessage = {
  id: string;
  role: "agent" | "user";
  text: string;
  createdAtIso: string;
};

const ACTIVITY_PAGE_SIZE = 12;

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function makeClientId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function badgeClass(kind: string) {
  switch (String(kind || "").toUpperCase()) {
    case "QUEUED":
    case "QUEUED_FOR_SEND":
    case "ENQUEUED":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "CALLING":
    case "IN_PROGRESS":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "FAILED":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-zinc-50 text-zinc-700 border-zinc-200";
  }
}

function activityPillClass(kind: string) {
  switch (String(kind || "").toUpperCase()) {
    case "QUEUED":
    case "QUEUED_FOR_SEND":
    case "ENQUEUED":
      return "bg-amber-50 text-amber-800";
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700";
    case "CALLING":
    case "IN_PROGRESS":
      return "bg-blue-50 text-blue-700";
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700";
    case "FAILED":
      return "bg-red-50 text-red-700";
    default:
      return "bg-zinc-50 text-zinc-700";
  }
}

function manualSourcePillClass(kind: string) {
  switch (String(kind || "").toUpperCase()) {
    case "MANUAL":
      return "bg-sky-50 text-sky-700";
    case "TAG":
      return "bg-violet-50 text-violet-700";
    case "INBOUND":
      return "bg-zinc-100 text-zinc-700";
    default:
      return "bg-zinc-50 text-zinc-700";
  }
}

function isSeededMessageRowId(id: string) {
  return /-seed-message-/.test(String(id || ""));
}

function buildSeededMessageThread(row: MessageActivityRow): MessageThreadMessage[] {
  if (/seed-message-1$/.test(row.id)) {
    return [
      {
        id: `${row.id}-1`,
        direction: "OUTBOUND",
        bodyText: "Hey Avery, thanks for checking out Purely Automation. Want me to send pricing or book a quick walkthrough?",
        subject: null,
        createdAt: row.sentFirstMessageAtIso || row.createdAtIso,
        fromAddress: "Purely Automation",
        toAddress: row.contact?.phone || row.contact?.email || null,
      },
      {
        id: `${row.id}-2`,
        direction: "INBOUND",
        bodyText: "Send pricing first, then I can decide.",
        subject: null,
        createdAt: row.updatedAtIso,
        fromAddress: row.contact?.phone || row.contact?.email || null,
        toAddress: "Purely Automation",
      },
      {
        id: `${row.id}-3`,
        direction: "OUTBOUND",
        bodyText: "Absolutely. I just sent a short pricing breakdown and can answer any questions here.",
        subject: null,
        createdAt: row.updatedAtIso,
        fromAddress: "Purely Automation",
        toAddress: row.contact?.phone || row.contact?.email || null,
      },
    ];
  }

  if (/seed-message-4$/.test(row.id)) {
    return [
      {
        id: `${row.id}-1`,
        direction: "OUTBOUND",
        bodyText: "Hey Sam, circling back on your request. Do mornings or afternoons work better for a quick intro call?",
        subject: null,
        createdAt: row.sentFirstMessageAtIso || row.createdAtIso,
        fromAddress: "Purely Automation",
        toAddress: row.contact?.phone || row.contact?.email || null,
      },
      {
        id: `${row.id}-2`,
        direction: "INBOUND",
        bodyText: "Afternoons are better. What do you charge?",
        subject: null,
        createdAt: row.updatedAtIso,
        fromAddress: row.contact?.phone || row.contact?.email || null,
        toAddress: "Purely Automation",
      },
      {
        id: `${row.id}-3`,
        direction: "OUTBOUND",
        bodyText: "Most clients start with our standard setup. I can send the pricing sheet and help you compare options.",
        subject: null,
        createdAt: row.updatedAtIso,
        fromAddress: "Purely Automation",
        toAddress: row.contact?.phone || row.contact?.email || null,
      },
    ];
  }

  return [];
}

function tagChipStyle(color: string | null) {
  const raw = String(color || "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return { backgroundColor: "#eff6ff", color: "#1d4ed8" } as const;
  }
  const r = parseInt(raw.slice(1, 3), 16);
  const g = parseInt(raw.slice(3, 5), 16);
  const b = parseInt(raw.slice(5, 7), 16);
  return {
    backgroundColor: `${raw}20`,
    color: `rgb(${Math.round(r * 0.58)}, ${Math.round(g * 0.58)}, ${Math.round(b * 0.58)})`,
  } as const;
}

function campaignStatusPillClass(kind: CampaignStatus | string) {
  switch (String(kind || "").toUpperCase()) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700";
    case "PAUSED":
      return "bg-amber-50 text-amber-800";
    case "ARCHIVED":
      return "bg-violet-50 text-violet-700";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

function callOutcomeLabel(kind: CallOutcomeKey) {
  switch (kind) {
    case "any":
      return "Call event";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return "Skipped";
  }
}

function messageOutcomeLabel(kind: MessageOutcomeKey) {
  switch (kind) {
    case "any":
      return "Message event";
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    default:
      return "Skipped";
  }
}

function compactPreviewText(text: string | null | undefined, max = 120) {
  const singleLine = String(text || "").replace(/\s+/g, " ").trim();
  if (!singleLine) return null;
  if (singleLine.length <= max) return singleLine;
  return `${singleLine.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function buildMessagesTestStarterMessage(campaign: Campaign | null | undefined, channel: "sms" | "email") {
  const configured = String(campaign?.chatAgentConfig?.firstMessage || "").trim();
  if (configured) return configured;

  const campaignName = String(campaign?.name || "your outreach").trim();
  const goal = compactPreviewText(campaign?.chatAgentConfig?.goal || "", 120);

  if (channel === "email") {
    if (goal) {
      return `Hi, thanks for your interest. I'm reaching out from ${campaignName} to help with ${goal.toLowerCase()} and send the clearest next steps.`;
    }
    return `Hi, thanks for your interest. I'm reaching out from ${campaignName} to share pricing, answer questions, and help with next steps.`;
  }

  if (goal) {
    return `Hey, thanks for reaching out about ${campaignName}. I can help with ${goal.toLowerCase()} and text over the best next step.`;
  }
  return `Hey, thanks for reaching out about ${campaignName}. I can send pricing, answer questions, or help with the next step.`;
}

type TranscriptTurn = {
  speaker: "agent" | "contact" | "note";
  label: string;
  text: string;
};

function normalizeTranscriptSpeaker(labelRaw: string): TranscriptTurn["speaker"] {
  const label = String(labelRaw || "").trim().toLowerCase();
  if (!label) return "note";
  if (/(agent|assistant|ai|receptionist|bot|you|rep)/i.test(label)) return "agent";
  if (/(contact|customer|caller|client|lead|prospect|guest|user)/i.test(label)) return "contact";
  return "note";
}

function parseTranscriptTurns(text: string | null | undefined): TranscriptTurn[] {
  const raw = String(text || "").replace(/\r/g, "").trim();
  if (!raw) return [];

  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  const turns: TranscriptTurn[] = [];
  let active: TranscriptTurn | null = null;

  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9 _-]{0,30}):\s*(.*)$/);
    if (match) {
      if (active && active.text.trim()) turns.push(active);
      const label = match[1].trim();
      active = {
        speaker: normalizeTranscriptSpeaker(label),
        label: normalizeTranscriptSpeaker(label) === "agent" ? "Agent" : normalizeTranscriptSpeaker(label) === "contact" ? "Contact" : label,
        text: String(match[2] || "").trim(),
      };
      continue;
    }

    if (active) {
      active.text = active.text ? `${active.text}\n${line}` : line;
    } else {
      active = { speaker: "note", label: "Transcript", text: line };
    }
  }

  if (active && active.text.trim()) turns.push(active);
  if (!turns.length) return [{ speaker: "note", label: "Transcript", text: raw }];
  return turns;
}

function latestSeededMessagePreview(row: MessageActivityRow) {
  const thread = buildSeededMessageThread(row);
  const last = thread[thread.length - 1] ?? thread[0] ?? null;
  return compactPreviewText(last?.bodyText || last?.subject || "", 132);
}

function contextStrengthBadgeClass(status?: OutboundContextReport["status"] | null) {
  switch (status) {
    case "strong":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "weak":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-700";
  }
}

function OutboundContextInsightCard(props: { report: OutboundContextReport | null }) {
  const report = props.report;
  if (!report) return null;

  return (
    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className={classNames("rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]", contextStrengthBadgeClass(report.status))}>
          {report.status} context
        </div>
        <div className="text-[11px] font-semibold text-zinc-500">Score {report.score}/100</div>
      </div>
      <div className="mt-2 text-[12px] text-zinc-700">{report.summary}</div>
      {report.strengths.length ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-zinc-700">What already covers this</div>
          <div className="mt-1 space-y-1 text-[11px] text-zinc-600">
            {report.strengths.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
      ) : null}
      {report.gaps.length ? (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-zinc-700">What still limits specificity</div>
          <div className="mt-1 space-y-1 text-[11px] text-zinc-600">
            {report.gaps.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
      ) : null}
      {report.recommendedPromptAdditions.length ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-[11px] text-zinc-700">
          {report.userExperienceMode === "require" ? "Only add these two things:" : "If you want sharper output, add at most this:"}
          <div className="mt-1 space-y-1">
            {report.recommendedPromptAdditions.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function sanitizeClientErrorText(error?: string | null) {
  const raw = String(error || "").trim();
  if (!raw) return null;
  if (/demo\s+deliverability\s+failure/i.test(raw)) {
    return "Message delivery failed for this demo row.";
  }
  if (/^invalid\s+`/i.test(raw) || /__turbopack|prisma\./i.test(raw)) {
    return "We couldn't load AI Outbound right now.";
  }
  const brace = raw.indexOf("{");
  const bracket = raw.indexOf("[");
  const stackMarker = raw.search(/\s+at\s+/i);
  const tick = raw.indexOf("`");
  const idx = [brace, bracket, stackMarker, tick].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  const withoutJson = idx !== undefined ? raw.slice(0, idx).trim() : raw;
  const singleLine = withoutJson.replace(/\s+/g, " ").trim();
  if (!singleLine) return "We couldn't load AI Outbound right now.";
  if (singleLine.length > 240) return `${singleLine.slice(0, 239)}…`;
  return singleLine;
}

function minutesAgoIso(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function buildSeededCallsActivity(campaign: Campaign): CampaignActivityRow[] {
  return [
    {
      id: `${campaign.id}-seed-call-1`,
      status: "COMPLETED",
      attemptCount: 1,
      lastError: null,
      callSid: "CAseedcompleted",
      nextCallAtIso: null,
      completedAtIso: minutesAgoIso(34),
      createdAtIso: minutesAgoIso(48),
      updatedAtIso: minutesAgoIso(34),
      contact: { id: `${campaign.id}-contact-1`, name: "Maya Thompson", phone: "+1 (555) 184-2201", email: "maya@example.com" },
    },
    {
      id: `${campaign.id}-seed-call-2`,
      status: "CALLING",
      attemptCount: 2,
      lastError: null,
      callSid: "CAseedcalling",
      nextCallAtIso: null,
      completedAtIso: null,
      createdAtIso: minutesAgoIso(19),
      updatedAtIso: minutesAgoIso(4),
      contact: { id: `${campaign.id}-contact-2`, name: "Chris Romero", phone: "+1 (555) 184-2202", email: "chris@example.com" },
    },
    {
      id: `${campaign.id}-seed-call-3`,
      status: "QUEUED",
      attemptCount: 0,
      lastError: null,
      callSid: null,
      nextCallAtIso: minutesAgoIso(-12),
      completedAtIso: null,
      createdAtIso: minutesAgoIso(11),
      updatedAtIso: minutesAgoIso(11),
      contact: { id: `${campaign.id}-contact-3`, name: "Jordan Patel", phone: "+1 (555) 184-2203", email: "jordan@example.com" },
    },
    {
      id: `${campaign.id}-seed-call-4`,
      status: "FAILED",
      attemptCount: 2,
      lastError: "Line rang out after two attempts.",
      callSid: null,
      nextCallAtIso: null,
      completedAtIso: null,
      createdAtIso: minutesAgoIso(93),
      updatedAtIso: minutesAgoIso(66),
      contact: { id: `${campaign.id}-contact-4`, name: "Taylor Brooks", phone: "+1 (555) 184-2204", email: "taylor@example.com" },
    },
  ];
}

function buildSeededMessagesActivity(campaign: Campaign): MessageActivityRow[] {
  return [
    {
      id: `${campaign.id}-seed-message-1`,
      status: "ACTIVE",
      source: "MANUAL",
      nextSendAtIso: null,
      sentFirstMessageAtIso: minutesAgoIso(17),
      threadId: "thread-seed-manual",
      attemptCount: 1,
      lastError: null,
      nextReplyAtIso: null,
      replyAttemptCount: 1,
      replyLastError: null,
      createdAtIso: minutesAgoIso(21),
      updatedAtIso: minutesAgoIso(6),
      contact: { id: `${campaign.id}-message-contact-1`, name: "Avery Chen", email: "avery@example.com", phone: "+1 (555) 184-3301" },
    },
    {
      id: `${campaign.id}-seed-message-2`,
      status: "QUEUED",
      source: "TAG",
      nextSendAtIso: minutesAgoIso(-9),
      sentFirstMessageAtIso: null,
      threadId: null,
      attemptCount: 0,
      lastError: null,
      nextReplyAtIso: null,
      replyAttemptCount: 0,
      replyLastError: null,
      createdAtIso: minutesAgoIso(14),
      updatedAtIso: minutesAgoIso(14),
      contact: { id: `${campaign.id}-message-contact-2`, name: "Riley Morgan", email: "riley@example.com", phone: "+1 (555) 184-3302" },
    },
    {
      id: `${campaign.id}-seed-message-3`,
      status: "FAILED",
      source: "TAG",
      nextSendAtIso: null,
      sentFirstMessageAtIso: null,
      threadId: null,
      attemptCount: 2,
      lastError: "Delivery failed because the destination number was unreachable.",
      nextReplyAtIso: null,
      replyAttemptCount: 0,
      replyLastError: null,
      createdAtIso: minutesAgoIso(74),
      updatedAtIso: minutesAgoIso(58),
      contact: { id: `${campaign.id}-message-contact-3`, name: "Devon Price", email: "devon@example.com", phone: "+1 (555) 184-3303" },
    },
    {
      id: `${campaign.id}-seed-message-4`,
      status: "ACTIVE",
      source: "INBOUND",
      nextSendAtIso: null,
      sentFirstMessageAtIso: minutesAgoIso(142),
      threadId: "thread-seed-inbound",
      attemptCount: 1,
      lastError: null,
      nextReplyAtIso: null,
      replyAttemptCount: 1,
      replyLastError: null,
      createdAtIso: minutesAgoIso(151),
      updatedAtIso: minutesAgoIso(24),
      contact: { id: `${campaign.id}-message-contact-4`, name: "Sam Rivera", email: "sam@example.com", phone: "+1 (555) 184-3304" },
    },
  ];
}

function isSeededCallRowId(id: string) {
  return /-seed-call-/.test(String(id || ""));
}

function seededCallTranscriptText(id: string) {
  const rowId = String(id || "");
  if (/seed-call-1$/.test(rowId)) {
    return "Agent: Hi Maya, this is Purely Automation following up on your request.\nContact: Yes, I have a minute.\nAgent: Great. Would you like to book a walkthrough for tomorrow afternoon?\nContact: Yes, 3 PM works for me.\nAgent: Perfect, I have that noted.";
  }
  if (/seed-call-2$/.test(rowId)) {
    return "Agent: Hi Jordan, checking back in on your interest.\nContact: I can talk for a minute.\nAgent: Great, I wanted to answer a couple questions before we schedule.\nContact: Sure, tell me more.\nAgent: We can keep this quick and book a better time after this call.";
  }
  if (/seed-call-3$/.test(rowId)) {
    return "Agent: Hi Alex, this is Purely Automation following up on your inquiry.\nContact: I’m interested, but I need pricing first.\nAgent: Absolutely, I can send pricing and line up a follow-up call.\nContact: Send that over and call me tomorrow.\nAgent: Perfect, I’ll note that for the next outreach step.";
  }
  if (/seed-call-4$/.test(rowId)) {
    return "Agent: Hi Taylor, calling to follow up on your interest.\nContact: Sorry, not a good time.\nAgent: No problem, I can try again later.\nCall ended before a booking was discussed.";
  }
  return "Agent: Outbound follow-up call connected.\nContact: We spoke briefly about next steps.\nAgent: I captured the key details for the team to review.";
}

function makeCallDetailFromActivityRow(row: CampaignActivityRow, transcriptText?: string | null): CallActivityDetail {
  return {
    kind: isSeededCallRowId(row.id) ? "seeded" : "enrollment",
    enrollmentId: row.id,
    status: row.status,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    callSid: row.callSid,
    conversationId: null,
    recordingSid: null,
    nextCallAtIso: row.nextCallAtIso,
    completedAtIso: row.completedAtIso,
    createdAtIso: row.createdAtIso,
    updatedAtIso: row.updatedAtIso,
    contact: row.contact,
    contactTags: [],
    transcriptText: transcriptText ?? null,
    transcriptSource: transcriptText ? "enrollment" : "none",
    transcriptUpdatedAtIso: transcriptText ? row.updatedAtIso : null,
    bookingAnalysis: null,
  };
}

function makeSeededCallDetail(row: CampaignActivityRow): CallActivityDetail {
  const transcriptText: string | null = seededCallTranscriptText(row.id);
  let bookingAnalysis: CallActivityDetail["bookingAnalysis"] = null;

  if (/seed-call-1$/.test(row.id)) {
    bookingAnalysis = {
      booked: true,
      needsBooking: false,
      requestedTimeText: "Tomorrow at 3:00 PM",
      summary: "Contact agreed to a walkthrough and provided a preferred time.",
    };
  } else if (/seed-call-4$/.test(row.id)) {
    bookingAnalysis = {
      booked: false,
      needsBooking: true,
      requestedTimeText: null,
      summary: "Call ended before scheduling. A retry is appropriate.",
    };
  }

  return {
    ...makeCallDetailFromActivityRow(row, transcriptText),
    kind: "seeded",
    bookingAnalysis,
  };
}

function makeCallDetailFromManualCall(manualCall: ManualCall): CallActivityDetail {
  return {
    kind: "manual",
    enrollmentId: manualCall.id,
    status: manualCall.status,
    attemptCount: 1,
    lastError: manualCall.lastError,
    callSid: manualCall.callSid,
    conversationId: manualCall.conversationId,
    recordingSid: manualCall.recordingSid,
    nextCallAtIso: null,
    completedAtIso: String(manualCall.status || "").toUpperCase() === "COMPLETED" ? manualCall.updatedAtIso : null,
    createdAtIso: manualCall.createdAtIso,
    updatedAtIso: manualCall.updatedAtIso,
    contact: {
      id: manualCall.id,
      name: null,
      phone: manualCall.toNumberE164,
      email: null,
    },
    contactTags: [],
    transcriptText: manualCall.transcriptText,
    transcriptSource: manualCall.transcriptText ? "enrollment" : "none",
    transcriptUpdatedAtIso: manualCall.transcriptText ? manualCall.updatedAtIso : null,
    bookingAnalysis: manualCall.bookingAnalysis ?? null,
  };
}

function buildAddTagOptionsFromTags(tags: ContactTag[], excludeTagIds: string[], search: string) {
  const excluded = new Set(excludeTagIds);
  const q = String(search || "").trim().toLowerCase();
  const usable = tags
    .filter((t) => !excluded.has(t.id))
    .filter((t) => (!q ? true : t.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [
    { value: "", label: "Add a tag…" },
    ...usable.map((t) => ({ value: t.id, label: t.name })),
    { value: "__create__", label: "Create tag…" },
  ];
}

type OutboundTabKey = "calls" | "messages" | "settings" | "testing";

export function PortalAiOutboundCallsClient(props: { initialTab?: OutboundTabKey } = {}) {
  const toast = useToast();

  const pageRootRef = useRef<HTMLDivElement | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { initialTab } = props;
  const portalVariant = String(pathname || "").startsWith("/credit") ? "credit" : "portal";
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: portalVariant }), [portalVariant]);

  const basePath = useMemo(() => {
    const p = String(pathname || "/portal/app/services/ai-outbound-calls");
    if (p.endsWith("/calls")) return p.slice(0, -"/calls".length);
    if (p.endsWith("/messages")) return p.slice(0, -"/messages".length);
    if (p.endsWith("/settings")) return p.slice(0, -"/settings".length);
    if (p.endsWith("/testing")) return p.slice(0, -"/testing".length);
    return p;
  }, [pathname]);

  const isMobileApp = useMemo(() => {
    const q = String(searchParams?.get("pa_mobileapp") ?? "").trim();
    if (q === "1") return true;
    if (typeof window !== "undefined") {
      const host = String(window.location.hostname || "").toLowerCase();
      if (host.includes("purely-mobile")) return true;
    }
    return false;
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [callsSyncBusy, setCallsSyncBusy] = useState(false);
  const [messagesSyncBusy, setMessagesSyncBusy] = useState(false);
  const [callsSaving, setCallsSaving] = useState(false);
  const [messagesSaving, setMessagesSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [bookingCalendars, setBookingCalendars] = useState<BookingCalendarOption[]>([]);
  const [tags, setTags] = useState<ContactTag[]>([]);
  const [voiceTools, setVoiceTools] = useState<VoiceTool[]>([]);
  const [voiceToolsApiKeyConfigured, setVoiceToolsApiKeyConfigured] = useState(true);

  const [voiceLibraryVoices, setVoiceLibraryVoices] = useState<VoiceLibraryVoice[]>([]);
  const [voiceLibraryLoading, setVoiceLibraryLoading] = useState(false);
  const [voiceLibraryLoaded, setVoiceLibraryLoaded] = useState(false);
  const [voicePreviewBusyVoiceId, setVoicePreviewBusyVoiceId] = useState<string | null>(null);
  const [voicePreviewShowControls, setVoicePreviewShowControls] = useState(false);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewUrlRef = useRef<string | null>(null);

  const [knowledgeBaseSyncBusy, setKnowledgeBaseSyncBusy] = useState(false);
  const [knowledgeBaseUploadBusy, setKnowledgeBaseUploadBusy] = useState(false);

  const [messagesKnowledgeBaseSyncBusy, setMessagesKnowledgeBaseSyncBusy] = useState(false);
  const [messagesKnowledgeBaseUploadBusy, setMessagesKnowledgeBaseUploadBusy] = useState(false);

  const [callsAgentSyncRequired, setCallsAgentSyncRequired] = useState(false);
  const [callsAgentSyncedAtIso, setCallsAgentSyncedAtIso] = useState<string | null>(null);

  const [messagesAgentSyncRequired, setMessagesAgentSyncRequired] = useState(false);
  const [messagesAgentSyncedAtIso, setMessagesAgentSyncedAtIso] = useState<string | null>(null);

  const [activityLoading, setActivityLoading] = useState(false);
  const [, setActivityCounts] = useState<CampaignActivityCounts | null>(null);
  const [activityRecent, setActivityRecent] = useState<CampaignActivityRow[]>([]);
  const [dismissedSeededCallIds, setDismissedSeededCallIds] = useState<string[]>([]);
  const [dismissedSeededMessageIds, setDismissedSeededMessageIds] = useState<string[]>([]);

  const [manualCallTo, setManualCallTo] = useState("");
  const [manualCallBusy, setManualCallBusy] = useState(false);
  const [manualCallSyncBusy, setManualCallSyncBusy] = useState(false);
  const [manualCallId, setManualCallId] = useState<string | null>(null);
  const [manualCall, setManualCall] = useState<ManualCall | null>(null);
  const [manualCalls, setManualCalls] = useState<ManualCall[]>([]);
  const manualCallAutoSyncRef = useRef<Record<string, boolean>>({});

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => {
    const normalizedSelectedId = typeof selectedId === "string" ? selectedId.trim() : "";
    if (normalizedSelectedId) {
      const exactMatch = campaigns.find((c) => c.id === normalizedSelectedId) ?? null;
      if (exactMatch) return exactMatch;
    }
    return campaigns[0] ?? null;
  }, [campaigns, selectedId]);

  const displayCallsRecent = useMemo(() => {
    if (activityRecent.length || activityLoading || !selected) return activityRecent;
    return buildSeededCallsActivity(selected).filter((row) => !dismissedSeededCallIds.includes(row.id));
  }, [activityLoading, activityRecent, dismissedSeededCallIds, selected]);

  const displayCallActivityRows = useMemo<CallActivityListRow[]>(() => {
    const automatedRows = displayCallsRecent.map((row) => ({
      id: row.id,
      source: "AUDIENCE" as const,
      kind: "enrollment" as const,
      isSeeded: isSeededCallRowId(row.id),
      status: row.status,
      attemptCount: row.attemptCount,
      lastError: row.lastError,
      callSid: row.callSid,
      conversationId: null,
      recordingSid: null,
      nextCallAtIso: row.nextCallAtIso,
      completedAtIso: row.completedAtIso,
      createdAtIso: row.createdAtIso,
      updatedAtIso: row.updatedAtIso,
      transcriptText: isSeededCallRowId(row.id) ? seededCallTranscriptText(row.id) : null,
      bookingAnalysis: null,
      contact: row.contact,
    }));

    const manualRows = manualCalls.map((call) => ({
      id: call.id,
      source: "MANUAL" as const,
      kind: "manual" as const,
      isSeeded: false,
      status: call.status,
      attemptCount: 1,
      lastError: call.lastError,
      callSid: call.callSid,
      conversationId: call.conversationId,
      recordingSid: call.recordingSid,
      nextCallAtIso: null,
      completedAtIso: String(call.status || "").toUpperCase() === "COMPLETED" ? call.updatedAtIso : null,
      createdAtIso: call.createdAtIso,
      updatedAtIso: call.updatedAtIso,
      transcriptText: call.transcriptText,
      bookingAnalysis: call.bookingAnalysis ?? null,
      contact: { id: call.id, name: null, phone: call.toNumberE164, email: null },
    }));

    return [...automatedRows, ...manualRows].sort(
      (a, b) => new Date(b.completedAtIso || b.updatedAtIso || b.createdAtIso).getTime() - new Date(a.completedAtIso || a.updatedAtIso || a.createdAtIso).getTime(),
    );
  }, [displayCallsRecent, manualCalls]);

  const lastSavedAgentSigByCampaignIdRef = useRef<Record<string, { calls: string; messages: string }>>({});

  const callsAgentSig = useCallback((c: Campaign) => {
    return JSON.stringify({
      voiceAgentId: (c.voiceAgentId ?? "").trim(),
      voiceId: typeof c.voiceId === "string" ? c.voiceId.trim() : null,
      manualVoiceAgentId: (c.manualVoiceAgentId ?? "").trim(),
      voiceAgentConfig: c.voiceAgentConfig ?? {},
      knowledgeBase: c.knowledgeBase ?? null,
      bookingConfig: c.bookingConfig ?? { enabled: false, calendarId: null },
    });
  }, []);

  const messagesAgentSig = useCallback((c: Campaign) => {
    return JSON.stringify({
      messageChannelPolicy: c.messageChannelPolicy,
      chatAgentId: (c.chatAgentId ?? "").trim(),
      manualChatAgentId: (c.manualChatAgentId ?? "").trim(),
      chatAgentConfig: c.chatAgentConfig ?? {},
      messagesKnowledgeBase: c.messagesKnowledgeBase ?? null,
    });
  }, []);

  const callsAgentDirty = useMemo(() => {
    if (!selected) return false;
    const saved = lastSavedAgentSigByCampaignIdRef.current[selected.id]?.calls;
    return callsAgentSig(selected) !== (saved ?? "");
  }, [callsAgentSig, selected]);

  const messagesAgentDirty = useMemo(() => {
    if (!selected) return false;
    const saved = lastSavedAgentSigByCampaignIdRef.current[selected.id]?.messages;
    return messagesAgentSig(selected) !== (saved ?? "");
  }, [messagesAgentSig, selected]);

  const callsManualAgentId = String(selected?.manualVoiceAgentId || "").trim();
  const messagesManualAgentId = String(selected?.manualChatAgentId || "").trim();

  const callsManualActive = Boolean(callsManualAgentId);
  const messagesManualActive = Boolean(messagesManualAgentId);

  const callsEffectiveAgentId = callsManualAgentId || String(selected?.voiceAgentId || "").trim();
  const messagesEffectiveAgentId = messagesManualAgentId || String(selected?.chatAgentId || "").trim();
  const selectedBookingCalendar = useMemo(
    () => bookingCalendars.find((calendar) => calendar.id === (selected?.bookingConfig?.calendarId || "")) ?? null,
    [bookingCalendars, selected?.bookingConfig?.calendarId],
  );
  const callsSyncDisabled = callsManualActive || callsSyncBusy || (!callsAgentSyncRequired && Boolean(callsEffectiveAgentId));
  const messagesSyncDisabled = messagesManualActive || messagesSyncBusy || (!messagesAgentSyncRequired && Boolean(messagesEffectiveAgentId));
  const showCallsTestingSyncButton = callsSyncBusy || (!callsManualActive && (callsAgentSyncRequired || !callsEffectiveAgentId));

  const [callsToolsPreset, setCallsToolsPreset] = useState<"none" | "recommended" | "all" | "custom">("recommended");

  const [tab, setTab] = useState<OutboundTabKey>(initialTab ?? "calls");
  const [settingsTab, setSettingsTab] = useState<"calls" | "messages">("calls");
  const [campaignNameEditing, setCampaignNameEditing] = useState(false);
  const [campaignNameDraft, setCampaignNameDraft] = useState("");
  const [manualCallModalOpen, setManualCallModalOpen] = useState(false);
  const [manualEnrollModalOpen, setManualEnrollModalOpen] = useState(false);
  const [knowledgeBaseModalKind, setKnowledgeBaseModalKind] = useState<"calls" | "messages" | null>(null);

  const prevTabRef = useRef<OutboundTabKey | null>(null);

  const scrollNearestScrollerToTop = useCallback(() => {
    if (typeof window === "undefined") return;

    const start = pageRootRef.current;
    let el: HTMLElement | null = start;

    while (el) {
      try {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const canScrollY =
          (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
          el.scrollHeight > el.clientHeight + 1;
        if (canScrollY) {
          el.scrollTo({ top: 0, left: 0, behavior: "auto" });
          return;
        }
      } catch {
        // ignore
      }

      el = el.parentElement;
    }

    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prev = prevTabRef.current;
    prevTabRef.current = tab;
    if (prev && prev !== tab) {
      scrollNearestScrollerToTop();
    }
  }, [scrollNearestScrollerToTop, tab]);

  useEffect(() => {
    if (tab !== "settings") return;
    scrollNearestScrollerToTop();
  }, [scrollNearestScrollerToTop, settingsTab, tab]);

  useEffect(() => {
    if (tab !== "testing") return;
    scrollNearestScrollerToTop();
  }, [scrollNearestScrollerToTop, tab]);

  useEffect(() => {
    setCampaignNameEditing(false);
    setCampaignNameDraft(String(selected?.name || ""));
  }, [selected?.id, selected?.name]);

  const [variablePickerOpen, setVariablePickerOpen] = useState(false);
  const [variablePickerTarget, setVariablePickerTarget] = useState<null | "calls_first" | "messages_first">(null);
  const [knownContactCustomVarKeys, setKnownContactCustomVarKeys] = useState<string[]>([]);

  const callsFirstMessageRef = useRef<HTMLInputElement | null>(null);
  const messagesFirstMessageRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/people/contacts/custom-variable-keys", { cache: "no-store", headers: variantHeaders });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok || !Array.isArray(json.keys)) return;
        const keys = json.keys.map((k: any) => String(k || "").trim()).filter(Boolean).slice(0, 50);
        if (!canceled) setKnownContactCustomVarKeys(keys);
      } catch {
        // ignore
      }
    })();

    return () => {
      canceled = true;
    };
  }, [variantHeaders]);

  const variablePickerVariables = useMemo(() => {
    const base = PORTAL_MESSAGE_VARIABLES.slice();
    const keys = Array.isArray(knownContactCustomVarKeys) ? knownContactCustomVarKeys : [];
    for (const k of keys) {
      base.push({
        key: `contact.custom.${k}`,
        label: `Contact custom: ${k}`,
        group: "Custom",
        appliesTo: "Lead/contact",
      });
    }
    return base;
  }, [knownContactCustomVarKeys]);

  function openVariablePicker(target: NonNullable<typeof variablePickerTarget>) {
    setVariablePickerTarget(target);
    setVariablePickerOpen(true);
  }

  function insertAtCursor(
    current: string,
    insert: string,
    el: HTMLInputElement | null,
  ): { next: string; caret: number } {
    const base = String(current ?? "");
    if (!el) {
      const next = base + insert;
      return { next, caret: next.length };
    }
    const start = typeof el.selectionStart === "number" ? el.selectionStart : base.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
    const next = base.slice(0, start) + insert + base.slice(end);
    return { next, caret: start + insert.length };
  }

  function applyPickedVariable(variableKey: string) {
    if (!selected) return;
    const key = String(variableKey || "").trim();
    if (!key) return;
    const token = `{${key}}`;

    const setCaretSoon = (el: HTMLInputElement | null, caret: number) => {
      if (!el) return;
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(caret, caret);
        } catch {
          // ignore
        }
      });
    };

    if (variablePickerTarget === "calls_first") {
      const el = callsFirstMessageRef.current;
      const cur = selected.voiceAgentConfig?.firstMessage ?? "";
      const { next, caret } = insertAtCursor(cur, token, el);
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === selected.id
            ? {
                ...c,
                voiceAgentConfig: {
                  ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                  firstMessage: next,
                },
              }
            : c,
        ),
      );
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "messages_first") {
      const el = messagesFirstMessageRef.current;
      const cur = selected.chatAgentConfig?.firstMessage ?? "";
      const { next, caret } = insertAtCursor(cur, token, el);
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === selected.id
            ? {
                ...c,
                chatAgentConfig: {
                  ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                  firstMessage: next,
                },
              }
            : c,
        ),
      );
      setCaretSoon(el, caret);
    }
  }

  useEffect(() => {
    if (!initialTab) return;
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const p = String(pathname || "");
    if (p.endsWith("/messages")) {
      setTab((prev) => (prev === "messages" ? prev : "messages"));
      return;
    }
    if (p.endsWith("/settings")) {
      setTab((prev) => (prev === "settings" ? prev : "settings"));
      return;
    }
    if (p.endsWith("/testing")) {
      setTab((prev) => (prev === "testing" ? prev : "testing"));
      return;
    }
    if (p.endsWith("/calls")) {
      setTab((prev) => (prev === "calls" ? prev : "calls"));
    }
  }, [pathname]);

  const setTabAndRoute = useCallback(
    (next: OutboundTabKey) => {
      setTab(next);
      if (typeof window === "undefined") return;
      router.replace(`${basePath}/${next}${window.location.search || ""}`, { scroll: false });
      requestAnimationFrame(() => {
        scrollNearestScrollerToTop();
      });
    },
    [basePath, router, scrollNearestScrollerToTop],
  );

  const setSidebarOverride = useSetPortalSidebarOverride();
  const outboundSidebar = useMemo(() => {
    const sectionButton = (key: OutboundTabKey, label: string, icon: ReactNode, toneClassName?: string) => (
      <PortalSidebarNavButton
        key={key}
        type="button"
        disabled={!selected}
        onClick={() => setTabAndRoute(key)}
        aria-current={tab === key ? "page" : undefined}
        label={label}
        icon={icon}
        iconToneClassName={toneClassName || (key === "settings" ? portalSidebarIconToneNeutralClass : portalSidebarIconToneBlueClass)}
        className={classNames(
          portalSidebarButtonBaseClass,
          "px-3 py-2",
          !selected
            ? "bg-zinc-100 text-zinc-400"
            : tab === key
              ? portalSidebarButtonActiveClass
              : portalSidebarButtonInactiveClass,
        )}
      >
        <span className="text-xs font-semibold text-current">{label}</span>
      </PortalSidebarNavButton>
    );

    return (
      <div className="space-y-4">
        <div>
          <div className={portalSidebarSectionTitleClass}>AI Outbound</div>
          <div className={portalSidebarSectionStackClass}>
            <div className="space-y-1">
              {sectionButton("calls", "Calls", <IconCalls />)}
              {sectionButton("messages", "Messages", <IconMessages />)}
              {sectionButton("testing", "Testing", <IconReceptionistTesting />)}
              {sectionButton("settings", "Settings", <IconSidebarSettings />, portalSidebarIconToneNeutralClass)}
            </div>
          </div>
        </div>

        {tab === "settings" ? (
          <div>
            <div className={portalSidebarSectionTitleClass}>Settings</div>
            <div className={portalSidebarSectionStackClass}>
              <PortalSidebarNavButton
                type="button"
                onClick={() => setSettingsTab("calls")}
                label="Calls"
                icon={<IconCalls />}
                iconToneClassName={portalSidebarIconToneBlueClass}
                className={classNames(
                  portalSidebarButtonBaseClass,
                  settingsTab === "calls" ? portalSidebarButtonActiveClass : portalSidebarButtonInactiveClass,
                )}
              >
                Calls
              </PortalSidebarNavButton>
              <PortalSidebarNavButton
                type="button"
                onClick={() => setSettingsTab("messages")}
                label="Messages"
                icon={<IconMessages />}
                iconToneClassName={portalSidebarIconToneBlueClass}
                className={classNames(
                  portalSidebarButtonBaseClass,
                  settingsTab === "messages" ? portalSidebarButtonActiveClass : portalSidebarButtonInactiveClass,
                )}
              >
                Messages
              </PortalSidebarNavButton>
            </div>
          </div>
        ) : null}

        <div>
          <div className={portalSidebarSectionTitleClass}>Campaigns</div>
          <div className={portalSidebarSectionStackClass}>
            {loading ? (
              <div className="px-1 py-2 text-sm text-zinc-500">Loading…</div>
            ) : campaigns.length === 0 ? (
              <div className="px-1 py-2 text-sm text-zinc-500">No campaigns yet.</div>
            ) : (
              campaigns.map((campaign) => {
                const active = campaign.id === selectedId;
                return (
                  <PortalSidebarNavButton
                    key={campaign.id}
                    type="button"
                    onClick={() => setSelectedId(campaign.id)}
                    label={campaign.name}
                    className={classNames(portalSidebarButtonBaseClass, active ? portalSidebarButtonActiveClass : portalSidebarButtonInactiveClass)}
                    aria-current={active ? "page" : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-zinc-900">{campaign.name}</div>
                      <div className={classNames("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", campaignStatusPillClass(campaign.status))}>
                        {campaign.status}
                      </div>
                    </div>
                    <div className={portalSidebarMetaTextClass}>Queued: {campaign.enrollQueued} • Completed: {campaign.enrollCompleted}</div>
                  </PortalSidebarNavButton>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }, [campaigns, loading, selected, selectedId, setTabAndRoute, settingsTab, tab]);

  useEffect(() => {
    setSidebarOverride({
      desktopSidebarContent: outboundSidebar,
      mobileSidebarContent: outboundSidebar,
    });
  }, [outboundSidebar, setSidebarOverride]);

  useEffect(() => {
    return () => setSidebarOverride(null);
  }, [setSidebarOverride]);

  const [callsGenerateContext, setCallsGenerateContext] = useState("");
  const [messagesGenerateContext, setMessagesGenerateContext] = useState("");
  const [generateBusy, setGenerateBusy] = useState(false);
  const [callsContextReport, setCallsContextReport] = useState<OutboundContextReport | null>(null);
  const [messagesContextReport, setMessagesContextReport] = useState<OutboundContextReport | null>(null);

  const [manualEnrollQuery, setManualEnrollQuery] = useState("");
  const [manualEnrollResults, setManualEnrollResults] = useState<ContactSearchResult[]>([]);
  const [manualEnrollSelected, setManualEnrollSelected] = useState<ContactSearchResult | null>(null);
  const [manualEnrollSearchBusy, setManualEnrollSearchBusy] = useState(false);

  const [manualEnrollChannelPolicy, setManualEnrollChannelPolicy] = useState<"SMS" | "EMAIL" | "BOTH">("BOTH");

  const [manualEnrollBusy, setManualEnrollBusy] = useState(false);

  const [messagesActivityLoading, setMessagesActivityLoading] = useState(false);
  const [messagesCountsByStatus, setMessagesCountsByStatus] = useState<Record<string, number>>({});
  const [messagesCountsBySource, setMessagesCountsBySource] = useState<Record<string, number>>({});
  const [messagesRecent, setMessagesRecent] = useState<MessageActivityRow[]>([]);
  const [messagesActivityFilter, setMessagesActivityFilter] = useState<"all" | "manual" | "audience">("all");

  const displayMessagesRecent = useMemo(() => {
    if (messagesRecent.length || messagesActivityLoading || !selected) return messagesRecent;
    return buildSeededMessagesActivity(selected).filter((row) => !dismissedSeededMessageIds.includes(row.id));
  }, [dismissedSeededMessageIds, messagesActivityLoading, messagesRecent, selected]);

  const displayMessagesCountsByStatus = useMemo(() => {
    if (Object.keys(messagesCountsByStatus).length) return messagesCountsByStatus;
    if (!displayMessagesRecent.length) return {};
    return displayMessagesRecent.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.status || "UNKNOWN").toUpperCase();
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [displayMessagesRecent, messagesCountsByStatus]);

  const displayMessagesCountsBySource = useMemo(() => {
    if (Object.keys(messagesCountsBySource).length) return messagesCountsBySource;
    if (!displayMessagesRecent.length) return {};
    return displayMessagesRecent.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.source || "UNKNOWN").toUpperCase();
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [displayMessagesRecent, messagesCountsBySource]);

  const [callsActivityFilter, setCallsActivityFilter] = useState<"all" | "manual" | "audience">("audience");

  const filteredCallActivityRows = useMemo(() => {
    if (callsActivityFilter === "manual") return displayCallActivityRows.filter((row) => row.source === "MANUAL");
    if (callsActivityFilter === "audience") return displayCallActivityRows.filter((row) => row.source === "AUDIENCE");
    return displayCallActivityRows;
  }, [callsActivityFilter, displayCallActivityRows]);

  const visibleCallActivityCounts = useMemo(() => {
    return filteredCallActivityRows.reduce(
      (acc, row) => {
        const status = String(row.status || "").toUpperCase();
        if (status === "QUEUED" || status === "QUEUED_FOR_SEND" || status === "ENQUEUED") acc.queued += 1;
        else if (status === "CALLING" || status === "IN_PROGRESS" || status === "ACTIVE") acc.calling += 1;
        else if (status === "COMPLETED") acc.completed += 1;
        else if (status === "FAILED") acc.failed += 1;
        else acc.skipped += 1;
        if (row.source === "MANUAL") acc.manual += 1;
        else acc.automated += 1;
        return acc;
      },
      { queued: 0, calling: 0, completed: 0, failed: 0, skipped: 0, manual: 0, automated: 0 },
    );
  }, [filteredCallActivityRows]);

  const [messagesTestChannel, setMessagesTestChannel] = useState<"sms" | "email">("sms");
  const [messagesTestInput, setMessagesTestInput] = useState("");
  const [messagesTestBusy, setMessagesTestBusy] = useState(false);
  const [messagesTestThread, setMessagesTestThread] = useState<ChatTestMessage[]>([]);
  const [messagesActivityMenu, setMessagesActivityMenu] = useState<ActivityMenuState | null>(null);
  const [messagesActivityPage, setMessagesActivityPage] = useState(0);
  const [messageDetailOpenId, setMessageDetailOpenId] = useState<string | null>(null);
  const [messageDetail, setMessageDetail] = useState<MessageActivityRow | null>(null);
  const [messageDetailLoading, setMessageDetailLoading] = useState(false);
  const [messageDetailActionBusy, setMessageDetailActionBusy] = useState<null | "delete">(null);
  const [messageDetailMessages, setMessageDetailMessages] = useState<MessageThreadMessage[]>([]);
  const [messageDetailTags, setMessageDetailTags] = useState<ContactEditorTag[]>([]);
  const [callsActivityMenu, setCallsActivityMenu] = useState<ActivityMenuState | null>(null);
  const [callsActivityPage, setCallsActivityPage] = useState(0);
  const [callDetailOpenId, setCallDetailOpenId] = useState<string | null>(null);
  const [callDetailLoading, setCallDetailLoading] = useState(false);
  const [callDetailActionBusy, setCallDetailActionBusy] = useState<null | "retry" | "delete">(null);
  const [callDetail, setCallDetail] = useState<CallActivityDetail | null>(null);
  const [newCallOutcomeRuleDraft, setNewCallOutcomeRuleDraft] = useState<{ label: string; outcome: CallOutcomeKey; matchText: string; tagIds: string[] }>({
    label: "",
    outcome: "any",
    matchText: "",
    tagIds: [],
  });
  const [newMessageOutcomeRuleDraft, setNewMessageOutcomeRuleDraft] = useState<{ label: string; outcome: MessageOutcomeKey; matchText: string; tagIds: string[] }>({
    label: "",
    outcome: "any",
    matchText: "",
    tagIds: [],
  });
  const [contactDetailsOpen, setContactDetailsOpen] = useState(false);
  const [contactDetailsContactId, setContactDetailsContactId] = useState<string | null>(null);
  const [deleteCampaignConfirmOpen, setDeleteCampaignConfirmOpen] = useState(false);
  const [deleteCampaignBusy, setDeleteCampaignBusy] = useState(false);

  const filteredMessagesActivityRows = useMemo(() => {
    return displayMessagesRecent.filter((entry) => {
      const src = String(entry.source || "").toUpperCase();
      if (messagesActivityFilter === "manual") return src === "MANUAL";
      if (messagesActivityFilter === "audience") return src !== "MANUAL";
      return true;
    });
  }, [displayMessagesRecent, messagesActivityFilter]);

  const messagesActivityPageCount = useMemo(
    () => Math.max(1, Math.ceil(filteredMessagesActivityRows.length / ACTIVITY_PAGE_SIZE)),
    [filteredMessagesActivityRows],
  );

  const pagedMessagesActivityRows = useMemo(() => {
    const start = messagesActivityPage * ACTIVITY_PAGE_SIZE;
    return filteredMessagesActivityRows.slice(start, start + ACTIVITY_PAGE_SIZE);
  }, [filteredMessagesActivityRows, messagesActivityPage]);

  const callsActivityPageCount = useMemo(
    () => Math.max(1, Math.ceil(filteredCallActivityRows.length / ACTIVITY_PAGE_SIZE)),
    [filteredCallActivityRows],
  );

  const pagedCallActivityRows = useMemo(() => {
    const start = callsActivityPage * ACTIVITY_PAGE_SIZE;
    return filteredCallActivityRows.slice(start, start + ACTIVITY_PAGE_SIZE);
  }, [callsActivityPage, filteredCallActivityRows]);

  useEffect(() => {
    setCallsAgentSyncRequired(false);
    setCallsAgentSyncedAtIso(null);
    setMessagesAgentSyncRequired(false);
    setMessagesAgentSyncedAtIso(null);
    setManualCallId(null);
    setManualCall(null);
    // Keep the current tab when switching campaigns.
    setCallsToolsPreset("recommended");
    setActivityCounts(null);
    setActivityRecent([]);
    setCallsGenerateContext("");
    setMessagesGenerateContext("");
    setCallsContextReport(null);
    setMessagesContextReport(null);
    setManualEnrollQuery("");
    setManualEnrollResults([]);
    setManualEnrollSelected(null);
    setManualEnrollSearchBusy(false);
    setManualEnrollChannelPolicy("BOTH");
    setKnowledgeBaseModalKind(null);
    setMessagesCountsByStatus({});
    setMessagesCountsBySource({});
    setMessagesRecent([]);
    setDismissedSeededCallIds([]);
    setDismissedSeededMessageIds([]);
    setMessagesActivityFilter("all");
    setCallsActivityFilter("audience");
    setMessagesTestChannel("sms");
    setMessagesTestInput("");
    setMessagesTestBusy(false);
    setMessagesTestThread([]);
    setMessagesActivityMenu(null);
    setMessagesActivityPage(0);
    setMessageDetailOpenId(null);
    setMessageDetail(null);
    setMessageDetailLoading(false);
    setMessageDetailMessages([]);
    setMessageDetailTags([]);
    setCallsActivityMenu(null);
    setCallsActivityPage(0);
    setCallDetailOpenId(null);
    setCallDetail(null);
    setCallDetailLoading(false);
    setCallDetailActionBusy(null);
    setNewCallOutcomeRuleDraft({ label: "", outcome: "any", matchText: "", tagIds: [] });
    setNewMessageOutcomeRuleDraft({ label: "", outcome: "any", matchText: "", tagIds: [] });
    setContactDetailsOpen(false);
    setContactDetailsContactId(null);
    setDeleteCampaignConfirmOpen(false);
    setDeleteCampaignBusy(false);
  }, [selectedId]);

  useEffect(() => {
    setMessagesActivityPage(0);
  }, [messagesActivityFilter, selected?.id]);

  useEffect(() => {
    setCallsActivityPage(0);
  }, [callsActivityFilter, selected?.id]);

  useEffect(() => {
    setMessagesActivityPage((current) => Math.min(current, Math.max(0, messagesActivityPageCount - 1)));
  }, [messagesActivityPageCount]);

  useEffect(() => {
    setCallsActivityPage((current) => Math.min(current, Math.max(0, callsActivityPageCount - 1)));
  }, [callsActivityPageCount]);

  const loadMessagesActivity = useCallback(
    async (campaignId: string) => {
      const id = String(campaignId || "").trim();
      if (!id) return;
      if (messagesActivityLoading) return;

      setMessagesActivityLoading(true);
      try {
        const res = await fetch(
          `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(id)}/messages-activity`,
          { cache: "no-store", headers: variantHeaders },
        ).catch(() => null as any);

        if (!res || !res.ok) return;
        const json = (await res.json().catch(() => null)) as ApiGetMessagesActivityResponse | null;
        if (!json || (json as any).ok !== true) return;

        setMessagesCountsByStatus((json as any).countsByStatus || {});
        setMessagesCountsBySource((json as any).countsBySource || {});
        setMessagesRecent(Array.isArray((json as any).recent) ? ((json as any).recent as MessageActivityRow[]) : []);
      } finally {
        setMessagesActivityLoading(false);
      }
    },
    [messagesActivityLoading, variantHeaders],
  );

  useEffect(() => {
    if (tab !== "messages") return;
    if (!selected?.id) return;
    void loadMessagesActivity(selected.id);
  }, [loadMessagesActivity, selected?.id, tab]);

  useEffect(() => {
    if (!selected?.id) return;
    const policy = (selected as any).messageChannelPolicy;
    if (policy === "SMS" || policy === "EMAIL" || policy === "BOTH") {
      setManualEnrollChannelPolicy(policy);
      if (policy === "SMS" && messagesTestChannel !== "sms") setMessagesTestChannel("sms");
      if (policy === "EMAIL" && messagesTestChannel !== "email") setMessagesTestChannel("email");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    const q = manualEnrollQuery.trim();
    if (!q || q.length < 2) {
      setManualEnrollResults([]);
      setManualEnrollSearchBusy(false);
      return;
    }

    let alive = true;
    setManualEnrollSearchBusy(true);

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/portal/ai-outbound-calls/contacts/search?q=${encodeURIComponent(q)}`,
            { cache: "no-store", headers: variantHeaders },
          ).catch(() => null as any);

          const json = (await res?.json?.().catch(() => null)) as ApiSearchContactsResponse | null;
          if (!alive) return;
          if (!res || !res.ok || !json || (json as any).ok !== true) {
            setManualEnrollResults([]);
            return;
          }

          const rows = Array.isArray((json as any).contacts) ? ((json as any).contacts as ContactSearchResult[]) : [];
          setManualEnrollResults(rows);
        } finally {
          if (alive) setManualEnrollSearchBusy(false);
        }
      })();
    }, 250);

    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [manualEnrollQuery, variantHeaders]);

  const loadManualCalls = useCallback(async (campaignId?: string) => {
    const qs = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : "";
    const res = await fetch(`/api/portal/ai-outbound-calls/manual-calls${qs}`, { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
    if (!res || !res.ok) return;
    const json = (await res.json().catch(() => null)) as ApiGetManualCallsResponse | null;
    if (!json || (json as any).ok !== true || !Array.isArray((json as any).manualCalls)) return;
    setManualCalls((json as any).manualCalls);
  }, [variantHeaders]);

  const loadActivity = useCallback(async (campaignId: string) => {
    const id = String(campaignId || "").trim();
    if (!id) return;
    if (activityLoading) return;
    setActivityLoading(true);
    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(id)}/activity`,
        { cache: "no-store", headers: variantHeaders },
      ).catch(() => null as any);
      if (!res || !res.ok) return;
      const json = (await res.json().catch(() => null)) as ApiGetCampaignActivityResponse | null;
      if (!json || (json as any).ok !== true) return;
      setActivityCounts((json as any).counts as CampaignActivityCounts);
      setActivityRecent(Array.isArray((json as any).recent) ? ((json as any).recent as CampaignActivityRow[]) : []);
    } finally {
      setActivityLoading(false);
    }
  }, [activityLoading, variantHeaders]);

  const loadManualCall = useCallback(async (id: string) => {
    const res = await fetch(`/api/portal/ai-outbound-calls/manual-calls/${encodeURIComponent(id)}`, { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
    if (!res || !res.ok) return;
    const json = (await res.json().catch(() => null)) as ApiGetManualCallResponse | null;
    if (!json || (json as any).ok !== true || !(json as any).manualCall) return;
    setManualCall((json as any).manualCall as ManualCall);
  }, [variantHeaders]);

  const syncManualCallArtifacts = useCallback(
    async (id: string) => {
      if (manualCallSyncBusy) return;
      setManualCallSyncBusy(true);
      try {
        const res = await fetch(`/api/portal/ai-outbound-calls/manual-calls/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "content-type": "application/json", ...variantHeaders },
          body: "{}",
        }).catch(() => null as any);

        const json = (await res?.json?.().catch(() => null)) as any;
        if (!res || !res.ok || !json || json.ok !== true) {
          throw new Error(json?.error || "Unable to refresh call artifacts");
        }

        if (json.manualCall) setManualCall(json.manualCall as ManualCall);
        if (selected?.id) await loadManualCalls(selected.id);

        if (json.usedVoiceTranscript) toast.success("Updated transcript from voice platform");
        else toast.success(json.requestedTranscription ? "Requested transcript refresh (may take a minute)" : "Updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Unable to refresh call artifacts");
      } finally {
        setManualCallSyncBusy(false);
      }
    },
    [loadManualCalls, manualCallSyncBusy, selected?.id, toast, variantHeaders],
  );

  // bulkTranscribeMissing was testing-only; removed.

  useEffect(() => {
    const c = manualCall;
    if (!c?.id) return;

    const status = String(c.status || "").toUpperCase();
    const isDone = status === "COMPLETED" || status === "FAILED";
    const hasAnyArtifactKey = Boolean(String(c.conversationId || "").trim() || String(c.recordingSid || "").trim());
    const hasTranscript = Boolean(String(c.transcriptText || "").trim());

    if (!isDone || hasTranscript || !hasAnyArtifactKey) return;
    if (manualCallSyncBusy) return;
    if (manualCallAutoSyncRef.current[c.id]) return;

    manualCallAutoSyncRef.current[c.id] = true;
    const t = setTimeout(() => {
      void syncManualCallArtifacts(c.id);
    }, 600);

    return () => clearTimeout(t);
  }, [manualCall, manualCallSyncBusy, syncManualCallArtifacts]);

  useEffect(() => {
    loadManualCalls(selected?.id || undefined);
  }, [selected?.id, loadManualCalls]);

  useEffect(() => {
    if (tab !== "calls") return;
    if (!selected?.id) return;
    void loadActivity(selected.id);
  }, [loadActivity, selected?.id, tab]);

  useEffect(() => {
    if (!manualCallId && manualCalls.length) {
      setManualCallId(manualCalls[0].id);
      setManualCall(manualCalls[0]);
    }
  }, [manualCalls, manualCallId]);

  useEffect(() => {
    if (!manualCallId) return;
    let timer: any;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      await loadManualCall(manualCallId);
      timer = setTimeout(tick, 5000);
    };

    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [manualCallId, loadManualCall]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-calls-activity-menu-root='true']")) return;
      if (target?.closest?.("[data-messages-activity-menu-root='true']")) return;
      if (target?.closest?.("[data-activity-floating-menu='true']")) return;
      setCallsActivityMenu(null);
      setMessagesActivityMenu(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const openContactDetails = useCallback((contactId: string | null | undefined) => {
    const stableContactId = String(contactId || "").trim();
    if (!stableContactId) return;
    setContactDetailsContactId(stableContactId);
    setContactDetailsOpen(true);
  }, []);

  const applyUpdatedContact = useCallback(
    (contactId: string, next: { contact: { id: string; name: string; email: string | null; phone: string | null } | null; tags: ContactEditorTag[] }) => {
      setActivityRecent((prev) =>
        prev.map((row) =>
          row.contact.id === contactId
            ? {
                ...row,
                contact: {
                  ...row.contact,
                  name: next.contact?.name ?? row.contact.name,
                  email: next.contact?.email ?? row.contact.email,
                  phone: next.contact?.phone ?? row.contact.phone,
                },
              }
            : row,
        ),
      );
      setMessagesRecent((prev) =>
        prev.map((row) =>
          row.contact?.id === contactId && row.contact
            ? {
                ...row,
                contact: {
                  ...row.contact,
                  name: next.contact?.name ?? row.contact.name,
                  email: next.contact?.email ?? row.contact.email,
                  phone: next.contact?.phone ?? row.contact.phone,
                },
              }
            : row,
        ),
      );
      setCallDetail((prev) =>
        prev && prev.contact.id === contactId
          ? {
              ...prev,
              contact: {
                ...prev.contact,
                name: next.contact?.name ?? prev.contact.name,
                email: next.contact?.email ?? prev.contact.email,
                phone: next.contact?.phone ?? prev.contact.phone,
              },
              contactTags: next.tags,
            }
          : prev,
      );
      setMessageDetail((prev) =>
        prev && prev.contact?.id === contactId && prev.contact
          ? {
              ...prev,
              contact: {
                ...prev.contact,
                name: next.contact?.name ?? prev.contact.name,
                email: next.contact?.email ?? prev.contact.email,
                phone: next.contact?.phone ?? prev.contact.phone,
              },
            }
          : prev,
      );
    },
    [],
  );

  async function openMessageActivityDetail(row: MessageActivityRow) {
    setMessagesActivityMenu(null);
    setMessageDetailOpenId(row.id);
    setMessageDetail(row);
    setMessageDetailTags([]);

    if (isSeededMessageRowId(row.id)) {
      setMessageDetailMessages(buildSeededMessageThread(row));
      setMessageDetailLoading(false);
      return;
    }

    const contactId = String(row.contact?.id || "").trim();
    const threadId = String(row.threadId || "").trim();
    if (!contactId && !threadId) {
      setMessageDetailMessages([]);
      setMessageDetailLoading(false);
      return;
    }

    setMessageDetailLoading(true);
    try {
      const requests: Array<Promise<any>> = [];
      if (threadId) {
        requests.push(
          fetch(`/api/portal/inbox/threads/${encodeURIComponent(threadId)}/messages?take=250`, { cache: "no-store", headers: variantHeaders }).catch(() => null as any),
        );
      } else {
        requests.push(Promise.resolve(null));
      }
      if (contactId) {
        requests.push(
          fetch(`/api/portal/contacts/${encodeURIComponent(contactId)}/tags`, { cache: "no-store", headers: variantHeaders }).catch(() => null as any),
        );
      } else {
        requests.push(Promise.resolve(null));
      }

      const [messagesRes, tagsRes] = await Promise.all(requests);

      if (messagesRes?.ok) {
        const json = (await messagesRes.json().catch(() => null)) as ApiInboxThreadMessagesResponse | null;
        if (json && (json as any).ok === true && Array.isArray((json as any).messages)) {
          setMessageDetailMessages(
            ((json as any).messages as any[]).map((message) => ({
              id: String(message?.id || ""),
              direction: typeof message?.direction === "string" ? String(message.direction) : null,
              bodyText: typeof message?.bodyText === "string" ? String(message.bodyText) : null,
              subject: typeof message?.subject === "string" ? String(message.subject) : null,
              createdAt: typeof message?.createdAt === "string" ? String(message.createdAt) : row.updatedAtIso,
              fromAddress: typeof message?.fromAddress === "string" ? String(message.fromAddress) : null,
              toAddress: typeof message?.toAddress === "string" ? String(message.toAddress) : null,
            })),
          );
        }
      }

      if (tagsRes?.ok) {
        const json = (await tagsRes.json().catch(() => null)) as any;
        if (json?.ok === true && Array.isArray(json.tags)) {
          setMessageDetailTags(json.tags as ContactEditorTag[]);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load message details");
    } finally {
      setMessageDetailLoading(false);
    }
  }

  async function startManualCall() {
    if (!selected) return;
    if (manualCallBusy) return;

    setManualCallBusy(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/manual-call`,
        {
          method: "POST",
            headers: { "content-type": "application/json", ...variantHeaders },
          body: JSON.stringify({ toNumber: manualCallTo }),
        },
      );

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) {
        throw new Error(json?.error || "Failed to start call");
      }

      const id = String(json?.id || "").trim();
      if (id) {
        setManualCallId(id);
        await loadManualCall(id);
        await loadManualCalls(selected.id);
      }

      toast.success("Calling…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start call");
    } finally {
      setManualCallBusy(false);
    }
  }

  async function openCallActivityDetail(activityId: string) {
    const id = String(activityId || "").trim();
    if (!id || !selected?.id) return;
    const row = displayCallActivityRows.find((candidate) => candidate.id === id) || null;
    setCallsActivityMenu(null);
    setCallDetailOpenId(id);
    if (row) {
      if (row.kind === "manual") {
        setCallDetail(
          makeCallDetailFromManualCall({
            id: row.id,
            campaignId: selected.id,
            toNumberE164: row.contact.phone || "",
            status: row.status,
            callSid: row.callSid,
            conversationId: row.conversationId,
            recordingSid: row.recordingSid,
            recordingDurationSec: null,
            transcriptText: row.transcriptText,
            bookingAnalysis: row.bookingAnalysis,
            lastError: row.lastError,
            createdAtIso: row.createdAtIso,
            updatedAtIso: row.updatedAtIso,
          } as ManualCall),
        );
      } else if (row.isSeeded) {
        setCallDetail(
          makeSeededCallDetail({
            id: row.id,
            status: row.status,
            attemptCount: row.attemptCount,
            lastError: row.lastError,
            callSid: row.callSid,
            nextCallAtIso: row.nextCallAtIso,
            completedAtIso: row.completedAtIso,
            createdAtIso: row.createdAtIso,
            updatedAtIso: row.updatedAtIso,
            contact: row.contact,
          }),
        );
        setCallDetailLoading(false);
        return;
      } else {
        setCallDetail(
          makeCallDetailFromActivityRow({
            id: row.id,
            status: row.status,
            attemptCount: row.attemptCount,
            lastError: row.lastError,
            callSid: row.callSid,
            nextCallAtIso: row.nextCallAtIso,
            completedAtIso: row.completedAtIso,
            createdAtIso: row.createdAtIso,
            updatedAtIso: row.updatedAtIso,
            contact: row.contact,
          }),
        );
      }
    } else {
      setCallDetail(null);
    }
    setCallDetailLoading(true);
    try {
      if (row?.kind === "manual") {
        const res = await fetch(`/api/portal/ai-outbound-calls/manual-calls/${encodeURIComponent(id)}`, { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
        const json = (await res?.json?.().catch(() => null)) as ApiGetManualCallResponse | null;
        if (!res || !res.ok || !json || (json as any).ok !== true || !(json as any).manualCall) {
          throw new Error((json as any)?.error || "Unable to load call details");
        }
        setCallDetail(makeCallDetailFromManualCall((json as any).manualCall as ManualCall));
      } else {
        const res = await fetch(
          `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/activity/${encodeURIComponent(id)}`,
          { cache: "no-store", headers: variantHeaders },
        ).catch(() => null as any);
        const json = (await res?.json?.().catch(() => null)) as ApiGetCallActivityDetailResponse | null;
        if (!res || !res.ok || !json || (json as any).ok !== true || !(json as any).detail) {
          throw new Error((json as any)?.error || "Unable to load call details");
        }
        setCallDetail({ ...((json as any).detail as CallActivityDetail), kind: "enrollment" });
      }
    } catch (e) {
      if (!row) {
        toast.error(e instanceof Error ? e.message : "Unable to load call details");
      }
    } finally {
      setCallDetailLoading(false);
    }
  }

  async function deleteMessageActivity(row: MessageActivityRow) {
    if (!selected?.id) return;
    const id = String(row.id || "").trim();
    if (!id) return;
    setMessageDetailActionBusy("delete");
    try {
      if (isSeededMessageRowId(id)) {
        setDismissedSeededMessageIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      } else {
        const res = await fetch(
          `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/messages-activity/${encodeURIComponent(id)}`,
          { method: "DELETE", headers: variantHeaders },
        ).catch(() => null as any);
        const json = (await res?.json?.().catch(() => null)) as any;
        if (!res || !res.ok || !json || json.ok !== true) {
          throw new Error(json?.error || "Unable to delete message activity");
        }
        await loadMessagesActivity(selected.id);
      }
      setMessageDetailOpenId(null);
      setMessageDetail(null);
      toast.success("Deleted message activity");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to delete message activity");
    } finally {
      setMessageDetailActionBusy(null);
    }
  }

  async function deleteCallRow(row: Pick<CallActivityListRow, "id" | "kind" | "isSeeded"> | Pick<CallActivityDetail, "enrollmentId" | "kind">) {
    if (!selected?.id) return;
    const id = "enrollmentId" in row ? String(row.enrollmentId || "").trim() : String(row.id || "").trim();
    if (!id) return;
    setCallDetailActionBusy("delete");
    try {
      if (("isSeeded" in row && row.isSeeded) || row.kind === "seeded") {
        setDismissedSeededCallIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      } else if (row.kind === "manual") {
        const res = await fetch(`/api/portal/ai-outbound-calls/manual-calls/${encodeURIComponent(id)}`, { method: "DELETE", headers: variantHeaders }).catch(() => null as any);
        const json = (await res?.json?.().catch(() => null)) as any;
        if (!res || !res.ok || !json || json.ok !== true) {
          throw new Error(json?.error || "Unable to delete call activity");
        }
        await loadManualCalls(selected.id);
      } else {
        const res = await fetch(
          `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/activity/${encodeURIComponent(id)}`,
          { method: "DELETE", headers: variantHeaders },
        ).catch(() => null as any);
        const json = (await res?.json?.().catch(() => null)) as any;
        if (!res || !res.ok || !json || json.ok !== true) {
          throw new Error(json?.error || "Unable to delete call activity");
        }
        await loadActivity(selected.id);
      }
      setCallDetailOpenId(null);
      setCallDetail(null);
      toast.success("Deleted call activity");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to delete call activity");
    } finally {
      setCallDetailActionBusy(null);
    }
  }

  async function retryCallActivity(enrollmentId: string) {
    const id = String(enrollmentId || "").trim();
    if (!id || !selected?.id) return;
    setCallDetailActionBusy("retry");
    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/activity/${encodeURIComponent(id)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...variantHeaders },
          body: JSON.stringify({ action: "retry" }),
        },
      ).catch(() => null as any);
      const json = (await res?.json?.().catch(() => null)) as any;
      if (!res || !res.ok || !json || json.ok !== true) {
        throw new Error(json?.error || "Unable to queue another call");
      }
      toast.success("Queued another call");
      await loadActivity(selected.id);
      await openCallActivityDetail(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to queue another call");
    } finally {
      setCallDetailActionBusy(null);
    }
  }

  const [createName, setCreateName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [callsAddTagValue, setCallsAddTagValue] = useState<string>("");
  const [chatAddTagValue, setChatAddTagValue] = useState<string>("");

  const [newTagName, setNewTagName] = useState("");
  const [callsTagSearch] = useState("");
  const [chatTagSearch] = useState("");
  const [callsOutcomeTagSearch] = useState("");
  const [messagesOutcomeTagSearch] = useState("");

  const [createTagColor, setCreateTagColor] = useState<(typeof DEFAULT_TAG_COLORS)[number]>("#2563EB");
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [tagCreateContext, setTagCreateContext] = useState<
    | "calls_audience"
    | "chat_audience"
    | "calls_outcome_completed"
    | "calls_outcome_failed"
    | "calls_outcome_skipped"
    | "messages_outcome_sent"
    | "messages_outcome_failed"
    | "messages_outcome_skipped"
  >("calls_audience");

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function enrollContactForMessages() {
    if (!selected?.id) return;
    if (manualEnrollBusy) return;

    const contactId = manualEnrollSelected?.id ? String(manualEnrollSelected.id).trim() : "";
    if (!contactId) {
      toast.error("Pick a contact to enroll");
      return;
    }

    const phone = (manualEnrollSelected?.phone || "").trim();
    const email = (manualEnrollSelected?.email || "").trim();
    if (manualEnrollChannelPolicy === "SMS" && !phone) {
      toast.error("Selected contact has no phone number for SMS");
      return;
    }
    if (manualEnrollChannelPolicy === "EMAIL" && !email) {
      toast.error("Selected contact has no email address for email");
      return;
    }
    if (manualEnrollChannelPolicy === "BOTH" && !phone && !email) {
      toast.error("Selected contact has no phone or email");
      return;
    }

    // UX: manual enrollment should just start the campaign.
    if (selected.status !== "ACTIVE") {
      if (selected.status === "ARCHIVED") {
        toast.error("Campaign is archived");
        return;
      }
      await updateCampaign({ status: "ACTIVE" });
    }

    setManualEnrollBusy(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/enroll-message`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...variantHeaders },
          body: JSON.stringify({ contactId, channelPolicy: manualEnrollChannelPolicy }),
        },
      );

      const json = (await res.json().catch(() => null)) as ApiEnrollMessageContactResponse | null;
      if (!res.ok || !json || (json as any).ok !== true) {
        throw new Error((json as any)?.error || "Enroll failed");
      }

      toast.success(
        (json as any).alreadySentFirstMessage
          ? "Already enrolled (first message already sent)"
          : "Enrolled. First message will send shortly",
      );

      if ((json as any).activatedCampaign) {
        toast.success("Campaign activated");
      }

      setManualEnrollQuery("");
      setManualEnrollResults([]);
      setManualEnrollSelected(null);
      setManualEnrollModalOpen(false);
      void loadMessagesActivity(selected.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enroll failed");
    } finally {
      setManualEnrollBusy(false);
    }
  }
  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/portal/voice-agent/tools", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
      if (!mounted) return;
      if (!res || !res.ok) {
        setVoiceTools([]);
        setVoiceToolsApiKeyConfigured(true);
        return;
      }
      const json = (await res.json().catch(() => null)) as ApiGetVoiceToolsResponse | null;
      if (json && typeof json === "object" && (json as any).ok === true && Array.isArray((json as any).tools)) {
        setVoiceToolsApiKeyConfigured(Boolean((json as any).apiKeyConfigured ?? true));
        setVoiceTools(
          (json as any).tools
            .map((t: any) => ({
              key: String(t?.key || "").trim(),
              label: String(t?.label || "").trim(),
              description: String(t?.description || "").trim(),
              toolId: typeof t?.toolId === "string" && t.toolId.trim() ? String(t.toolId).trim() : null,
            }))
            .filter((t: VoiceTool) => Boolean(t.key && t.label)),
        );
      } else {
        setVoiceTools([]);
        setVoiceToolsApiKeyConfigured(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [variantHeaders]);

  const loadVoiceLibrary = useCallback(async () => {
    if (voiceLibraryLoading || voiceLibraryLoaded) return;
    setVoiceLibraryLoading(true);
    try {
      const res = await fetch("/api/portal/voice-agent/voices", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
      if (!res) {
        setVoiceLibraryVoices([]);
        return;
      }
      const json = (await res.json().catch(() => null)) as ApiGetVoiceLibraryVoicesResponse | null;
      if (!res.ok || !json || (json as any).ok !== true) {
        setVoiceLibraryVoices([]);
        return;
      }

      const voices = Array.isArray((json as any).voices) ? ((json as any).voices as VoiceLibraryVoice[]) : [];
      const cleaned = voices
        .map((v) => ({
          id: String((v as any)?.id || "").trim(),
          name: String((v as any)?.name || "").trim(),
          category: String((v as any)?.category || "").trim() || undefined,
          description: String((v as any)?.description || "").trim() || undefined,
        }))
        .filter((v) => Boolean(v.id && v.name))
        .slice(0, 200);
      setVoiceLibraryVoices(cleaned);
    } catch {
      setVoiceLibraryVoices([]);
    } finally {
      setVoiceLibraryLoaded(true);
      setVoiceLibraryLoading(false);
    }
  }, [variantHeaders, voiceLibraryLoaded, voiceLibraryLoading]);

  const playVoicePreview = useCallback(
    async (voiceId: string) => {
      const id = String(voiceId || "").trim();
      if (!id) {
        toast.error("Pick a voice first");
        return;
      }
      if (voicePreviewBusyVoiceId) return;
      setVoicePreviewBusyVoiceId(id);
      setVoicePreviewShowControls(false);
      try {
        const text = DEFAULT_VOICE_PREVIEW_TEXT;
        const res = await fetch("/api/portal/voice-agent/voices/preview", {
          method: "POST",
          headers: { "content-type": "application/json", ...variantHeaders },
          body: JSON.stringify({ voiceId: id, text }),
        });

        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as any;
          const msg = typeof json?.error === "string" ? json.error : "";
          if (msg && /missing voice agent api key/i.test(msg)) throw new Error(msg);
          throw new Error("Voice preview failed");
        }

        const blob = await res.blob().catch(() => null);
        if (!blob) throw new Error("Preview failed");

        const prev = voicePreviewUrlRef.current;
        if (prev) {
          URL.revokeObjectURL(prev);
          voicePreviewUrlRef.current = null;
        }

        const url = URL.createObjectURL(blob);
        voicePreviewUrlRef.current = url;
        const el = voicePreviewAudioRef.current;
        if (el) {
          el.src = url;
          try {
            await el.play();
          } catch {
            // Safari can block async-initiated playback. Fall back to showing controls.
            setVoicePreviewShowControls(true);
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Voice preview failed");
      } finally {
        setVoicePreviewBusyVoiceId(null);
      }
    },
    [toast, variantHeaders, voicePreviewBusyVoiceId],
  );

  useEffect(() => {
    return () => {
      const prev = voicePreviewUrlRef.current;
      if (prev) URL.revokeObjectURL(prev);
    };
  }, []);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    if (!campaigns.length) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    const normalizedSelectedId = typeof selectedId === "string" ? selectedId.trim() : "";
    if (normalizedSelectedId && campaigns.some((campaign) => campaign.id === normalizedSelectedId)) {
      return;
    }
    const fallbackId = campaigns[0]?.id ?? null;
    if (fallbackId && fallbackId !== selectedId) {
      setSelectedId(fallbackId);
    }
  }, [campaigns, selectedId]);

  const loadTags = useCallback(async () => {
    const tagsRes = await fetch("/api/portal/contact-tags", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
    const tagsJson = (await tagsRes?.json().catch(() => null)) as ApiGetContactTagsResponse | null;
    if (!tagsRes?.ok || !tagsJson || (tagsJson as any).ok !== true) {
      return;
    }
    setTags(Array.isArray((tagsJson as any).tags) ? ((tagsJson as any).tags as ContactTag[]) : []);
  }, [variantHeaders]);

  const loadAll = useCallback(async () => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);
    setError(null);

    let didLoad = false;
    try {
      const [campaignRes, bookingCalendarsRes] = await Promise.all([
        fetch("/api/portal/ai-outbound-calls/campaigns", { cache: "no-store", headers: variantHeaders }),
        fetch("/api/portal/booking/calendars", { cache: "no-store", headers: variantHeaders }).catch(() => null as any),
      ]);

      const campaignsJson = (await campaignRes.json().catch(() => null)) as ApiGetCampaignsResponse | null;
      if (!campaignRes.ok || !campaignsJson || (campaignsJson as any).ok !== true) {
        throw new Error((campaignsJson as any)?.error || "Failed to load campaigns");
      }

      if (bookingCalendarsRes?.ok) {
        const bookingCalendarsJson = (await bookingCalendarsRes.json().catch(() => null)) as any;
        const nextBookingCalendars = Array.isArray(bookingCalendarsJson?.config?.calendars)
          ? bookingCalendarsJson.config.calendars
              .map((calendar: any) => ({
                id: String(calendar?.id || "").trim(),
                title: String(calendar?.title || "").trim() || "Calendar",
                meetingLocation: typeof calendar?.meetingLocation === "string" ? calendar.meetingLocation : null,
                meetingDetails: typeof calendar?.meetingDetails === "string" ? calendar.meetingDetails : null,
              }))
              .filter((calendar: BookingCalendarOption) => Boolean(calendar.id))
          : [];
        setBookingCalendars(nextBookingCalendars);
      }

      const nextCampaignsRaw = Array.isArray((campaignsJson as any).campaigns)
        ? ((campaignsJson as any).campaigns as any[])
        : [];

      const nextCampaigns: Campaign[] = nextCampaignsRaw.map((c: any) => {
        const voiceId = typeof c?.voiceId === "string" ? c.voiceId.trim() : "";
        const kb = c?.knowledgeBase && typeof c.knowledgeBase === "object" ? (c.knowledgeBase as any) : null;
        const locators = kb && Array.isArray(kb.locators) ? kb.locators : undefined;

        const messagesKb =
          c?.messagesKnowledgeBase && typeof c.messagesKnowledgeBase === "object" ? (c.messagesKnowledgeBase as any) : null;
        const messagesLocators = messagesKb && Array.isArray(messagesKb.locators) ? messagesKb.locators : undefined;

        return {
          ...c,
          voiceAgentConfig: { ...DEFAULT_VOICE_AGENT_CONFIG, ...(c.voiceAgentConfig ?? {}) },
          chatAgentConfig: { ...DEFAULT_VOICE_AGENT_CONFIG, ...(c.chatAgentConfig ?? {}) },
          bookingConfig: {
            enabled: Boolean((c as any).bookingConfig?.enabled),
            calendarId: typeof (c as any).bookingConfig?.calendarId === "string" && (c as any).bookingConfig.calendarId.trim()
              ? String((c as any).bookingConfig.calendarId).trim()
              : null,
          },
          voiceId: voiceId || null,
          knowledgeBase:
            kb && typeof kb === "object"
              ? {
                  version: 1,
                  seedUrl: typeof kb.seedUrl === "string" ? kb.seedUrl : "",
                  crawlDepth: typeof kb.crawlDepth === "number" && Number.isFinite(kb.crawlDepth) ? kb.crawlDepth : 0,
                  maxUrls: typeof kb.maxUrls === "number" && Number.isFinite(kb.maxUrls) ? kb.maxUrls : 0,
                  text: typeof kb.text === "string" ? kb.text : "",
                  ...(Array.isArray(locators) ? { locators } : {}),
                  ...(typeof kb.lastSyncedAtIso === "string" ? { lastSyncedAtIso: kb.lastSyncedAtIso } : {}),
                  ...(typeof kb.lastSyncError === "string" ? { lastSyncError: kb.lastSyncError } : {}),
                  ...(typeof kb.updatedAtIso === "string" ? { updatedAtIso: kb.updatedAtIso } : {}),
                }
              : null,
          messagesKnowledgeBase:
            messagesKb && typeof messagesKb === "object"
              ? {
                  version: 1,
                  seedUrl: typeof messagesKb.seedUrl === "string" ? messagesKb.seedUrl : "",
                  crawlDepth:
                    typeof messagesKb.crawlDepth === "number" && Number.isFinite(messagesKb.crawlDepth)
                      ? messagesKb.crawlDepth
                      : 0,
                  maxUrls: typeof messagesKb.maxUrls === "number" && Number.isFinite(messagesKb.maxUrls) ? messagesKb.maxUrls : 0,
                  text: typeof messagesKb.text === "string" ? messagesKb.text : "",
                  ...(Array.isArray(messagesLocators) ? { locators: messagesLocators } : {}),
                  ...(typeof messagesKb.lastSyncedAtIso === "string" ? { lastSyncedAtIso: messagesKb.lastSyncedAtIso } : {}),
                  ...(typeof messagesKb.lastSyncError === "string" ? { lastSyncError: messagesKb.lastSyncError } : {}),
                  ...(typeof messagesKb.updatedAtIso === "string" ? { updatedAtIso: messagesKb.updatedAtIso } : {}),
                }
              : null,
        } as Campaign;
      });

      lastSavedAgentSigByCampaignIdRef.current = Object.fromEntries(
        nextCampaigns.map((c) => [c.id, { calls: callsAgentSig(c), messages: messagesAgentSig(c) }]),
      );

      setCampaigns(nextCampaigns);

      setSelectedId((prev) => {
        if (prev && nextCampaigns.some((c) => c.id === prev)) return prev;
        return nextCampaigns[0]?.id ?? null;
      });

      didLoad = true;
      void loadTags();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (didLoad) hasLoadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [callsAgentSig, loadTags, messagesAgentSig, variantHeaders]);

  useEffect(() => {
    if (tab !== "settings" || settingsTab !== "calls") return;
    if (voiceLibraryLoaded || voiceLibraryLoading) return;
    void loadVoiceLibrary();
  }, [loadVoiceLibrary, settingsTab, tab, voiceLibraryLoaded, voiceLibraryLoading]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function createCampaign() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/ai-outbound-calls/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ name: createName.trim() || undefined }),
      });

      const json = (await res.json().catch(() => null)) as ApiCreateCampaignResponse | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error((json as any)?.error || "Failed to create");
      }

      setCreateName("");
      setCreateOpen(false);
      await loadAll();
      setSelectedId(json.id);
      toast.success("Campaign created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  async function createTagAndMaybeAdd() {
    const name = newTagName.trim();
    if (!name) return;
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/portal/contact-tags", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({
          name,
          color: createTagColor,
        }),
      });

      const json = (await res.json().catch(() => null)) as ApiCreateTagResponse | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error((json as any)?.error || "Failed to create tag");
      }

      setNewTagName("");
      setShowCreateTag(false);

      // Refresh tags + campaigns to keep everything in sync.
      await loadAll();

      // Convenience: add to the selected campaign if present.
      if (selected?.id && json.tag?.id) {
        addTagToContext(tagCreateContext, json.tag.id);
      }

      toast.success("Tag created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create tag");
    } finally {
      setBusy(false);
    }
  }

  const updateCampaign = useCallback(async (
    patch: Partial<
      Pick<
        Campaign,
        | "name"
        | "status"
        | "audienceTagIds"
        | "chatAudienceTagIds"
        | "voiceAgentId"
        | "voiceId"
        | "manualVoiceAgentId"
        | "chatAgentId"
        | "manualChatAgentId"
        | "messageChannelPolicy"
        | "bookingConfig"
      >
    > & {
      voiceAgentConfig?: Partial<VoiceAgentConfig>;
      chatAgentConfig?: Partial<VoiceAgentConfig>;
      knowledgeBase?: CampaignKnowledgeBase | null;
      messagesKnowledgeBase?: CampaignKnowledgeBase | null;
      callOutcomeTagging?: Partial<CallOutcomeTagging>;
      messageOutcomeTagging?: Partial<MessageOutcomeTagging>;
    },
  ) => {
    if (!selected) return;
    const selectedIdSnapshot = selected.id;
    const patchKeys = Object.keys(patch);
    const isOutcomeTaggingOnlyPatch =
      patchKeys.length > 0 && patchKeys.every((key) => key === "callOutcomeTagging" || key === "messageOutcomeTagging");

    setCampaigns((prev) =>
      prev.map((campaign) => {
        if (campaign.id !== selectedIdSnapshot) return campaign;
        return {
          ...campaign,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.audienceTagIds !== undefined ? { audienceTagIds: patch.audienceTagIds } : {}),
          ...(patch.chatAudienceTagIds !== undefined ? { chatAudienceTagIds: patch.chatAudienceTagIds } : {}),
          ...(patch.voiceAgentId !== undefined ? { voiceAgentId: patch.voiceAgentId } : {}),
          ...(patch.voiceId !== undefined ? { voiceId: patch.voiceId } : {}),
          ...(patch.manualVoiceAgentId !== undefined ? { manualVoiceAgentId: patch.manualVoiceAgentId } : {}),
          ...(patch.chatAgentId !== undefined ? { chatAgentId: patch.chatAgentId } : {}),
          ...(patch.manualChatAgentId !== undefined ? { manualChatAgentId: patch.manualChatAgentId } : {}),
          ...(patch.messageChannelPolicy !== undefined ? { messageChannelPolicy: patch.messageChannelPolicy } : {}),
          ...(patch.bookingConfig !== undefined
            ? { bookingConfig: { ...(campaign.bookingConfig ?? { enabled: false, calendarId: null }), ...patch.bookingConfig } }
            : {}),
          ...(patch.voiceAgentConfig !== undefined
            ? { voiceAgentConfig: { ...(campaign.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), ...patch.voiceAgentConfig } }
            : {}),
          ...(patch.chatAgentConfig !== undefined
            ? { chatAgentConfig: { ...(campaign.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), ...patch.chatAgentConfig } }
            : {}),
          ...(patch.knowledgeBase !== undefined ? { knowledgeBase: patch.knowledgeBase } : {}),
          ...(patch.messagesKnowledgeBase !== undefined ? { messagesKnowledgeBase: patch.messagesKnowledgeBase } : {}),
          ...(patch.callOutcomeTagging !== undefined
            ? {
                callOutcomeTagging: {
                  ...(campaign.callOutcomeTagging ?? { enabled: false, onCompletedTagIds: [], onFailedTagIds: [], onSkippedTagIds: [], rules: [] }),
                  ...patch.callOutcomeTagging,
                },
              }
            : {}),
          ...(patch.messageOutcomeTagging !== undefined
            ? {
                messageOutcomeTagging: {
                  ...(campaign.messageOutcomeTagging ?? { enabled: false, onSentTagIds: [], onFailedTagIds: [], onSkippedTagIds: [], rules: [] }),
                  ...patch.messageOutcomeTagging,
                },
              }
            : {}),
        } as Campaign;
      }),
    );

    // Hint UX: when agent-related fields change, users must sync to apply changes to their live agent.
    if (patch.voiceAgentConfig !== undefined || patch.voiceId !== undefined || patch.manualVoiceAgentId !== undefined) {
      setCallsAgentSyncRequired(true);
      setCallsAgentSyncedAtIso(null);
    }

    if (
      patch.chatAgentConfig !== undefined ||
      patch.manualChatAgentId !== undefined ||
      patch.messageChannelPolicy !== undefined
    ) {
      setMessagesAgentSyncRequired(true);
      setMessagesAgentSyncedAtIso(null);
    }

    if (patch.bookingConfig !== undefined) {
      setCallsAgentSyncRequired(true);
      setCallsAgentSyncedAtIso(null);
    }
    try {
      const res = await fetch(`/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json", ...variantHeaders },
          body: JSON.stringify(patch),
        },
      );

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) {
        throw new Error(json?.error || "Failed to update");
      }

      if (!isOutcomeTaggingOnlyPatch) {
        await loadAll();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update";
      if (message && message !== "Failed to update") toast.error(message);
      await loadAll().catch(() => null);
    }
  }, [loadAll, selected, toast, variantHeaders]);

  async function deleteCampaign() {
    if (!selected?.id || deleteCampaignBusy) return;
    setDeleteCampaignBusy(true);
    try {
      const res = await fetch(`/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}`, {
        method: "DELETE",
        headers: variantHeaders,
      }).catch(() => null as any);
      const json = (await res?.json?.().catch(() => null)) as any;
      if (!res || !res.ok || !json || json.ok !== true) {
        throw new Error(json?.error || "Failed to delete campaign");
      }
      setDeleteCampaignConfirmOpen(false);
      toast.success("Campaign deleted");
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete campaign");
    } finally {
      setDeleteCampaignBusy(false);
    }
  }

  async function syncCallsAgent() {
    if (!selected) return;
    if (callsSyncBusy) return;
    setCallsSyncBusy(true);
    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/sync-agent`,
        { method: "POST", headers: variantHeaders },
      );

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) {
        throw new Error(json?.error || "Failed to sync agent");
      }

      if (json.pulled) toast.success("Loaded agent settings");
      else if (json.createdAgentId) toast.success("Created + synced agent");
      else if (json.noop) toast.success("Already synced");
      else toast.success("Synced agent");

      setCallsAgentSyncRequired(false);
      setCallsAgentSyncedAtIso(new Date().toISOString());
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to sync agent");
    } finally {
      setCallsSyncBusy(false);
    }
  }

  async function syncMessagesAgent() {
    if (!selected) return;
    if (messagesSyncBusy) return;
    setMessagesSyncBusy(true);
    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/sync-chat-agent`,
        { method: "POST", headers: variantHeaders },
      );

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) {
        throw new Error(json?.error || "Failed to sync agent");
      }

      if (json.pulled) toast.success("Loaded agent settings");
      else if (json.createdAgentId) toast.success("Created + synced agent");
      else if (json.noop) toast.success("Already synced");
      else toast.success("Synced agent");

      setMessagesAgentSyncRequired(false);
      setMessagesAgentSyncedAtIso(new Date().toISOString());
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to sync agent");
    } finally {
      setMessagesSyncBusy(false);
    }
  }

  const saveMessagesAgentSettings = useCallback(async (options?: { silent?: boolean }) => {
    if (!selected) return;
    if (messagesSaving) return;

    if (!messagesAgentDirty && !messagesAgentSyncRequired) return;

    setMessagesSaving(true);
    try {
      await updateCampaign({
        messageChannelPolicy: selected.messageChannelPolicy,
        chatAgentId: (selected.chatAgentId ?? "").trim(),
        manualChatAgentId: (selected.manualChatAgentId ?? "").trim(),
        chatAgentConfig: selected.chatAgentConfig ?? {},
        messagesKnowledgeBase: selected.messagesKnowledgeBase ?? null,
      });
      if (!options?.silent) toast.success("Saved");
    } finally {
      setMessagesSaving(false);
    }
  }, [messagesAgentDirty, messagesAgentSyncRequired, messagesSaving, selected, toast, updateCampaign]);

  const saveCallsAgentSettings = useCallback(async (options?: { silent?: boolean }) => {
    if (!selected) return;
    if (callsSaving) return;

    if (!callsAgentDirty && !callsAgentSyncRequired) return;

    setCallsSaving(true);
    try {
      await updateCampaign({
        voiceAgentId: (selected.voiceAgentId ?? "").trim(),
        voiceId: typeof selected.voiceId === "string" ? selected.voiceId.trim() : null,
        manualVoiceAgentId: (selected.manualVoiceAgentId ?? "").trim(),
        voiceAgentConfig: selected.voiceAgentConfig ?? {},
        knowledgeBase: selected.knowledgeBase ?? null,
        bookingConfig: selected.bookingConfig ?? { enabled: false, calendarId: null },
      });

      if (!options?.silent) toast.success("Saved");
    } finally {
      setCallsSaving(false);
    }
  }, [callsAgentDirty, callsAgentSyncRequired, callsSaving, selected, toast, updateCampaign]);

  useEffect(() => {
    if (!selected?.id) return;
    if (!callsAgentDirty) return;
    if (callsSaving) return;
    const timer = setTimeout(() => {
      void saveCallsAgentSettings({ silent: true });
    }, 450);
    return () => clearTimeout(timer);
  }, [callsAgentDirty, callsSaving, saveCallsAgentSettings, selected?.id]);

  useEffect(() => {
    if (!selected?.id) return;
    if (!messagesAgentDirty) return;
    if (messagesSaving) return;
    const timer = setTimeout(() => {
      void saveMessagesAgentSettings({ silent: true });
    }, 450);
    return () => clearTimeout(timer);
  }, [messagesAgentDirty, messagesSaving, saveMessagesAgentSettings, selected?.id]);

  function ensureKnowledgeBase(kb: CampaignKnowledgeBase | null): CampaignKnowledgeBase {
    const base: CampaignKnowledgeBase = {
      version: 1,
      seedUrl: "",
      crawlDepth: 0,
      maxUrls: 0,
      text: "",
      locators: [],
    };
    if (!kb) return base;
    return {
      ...base,
      ...kb,
      version: 1,
      seedUrl: String(kb.seedUrl || ""),
      crawlDepth: Number.isFinite(kb.crawlDepth) ? Math.max(0, Math.min(5, Math.floor(kb.crawlDepth))) : 0,
      maxUrls: Number.isFinite(kb.maxUrls) ? Math.max(0, Math.min(1000, Math.floor(kb.maxUrls))) : 0,
      text: String(kb.text || ""),
      locators: Array.isArray(kb.locators) ? kb.locators : [],
    };
  }

  async function syncKnowledgeBase() {
    if (!selected?.id) return;
    if (knowledgeBaseSyncBusy || busy) return;
    setKnowledgeBaseSyncBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/knowledge-base/sync`,
        { method: "POST", headers: { "content-type": "application/json", ...variantHeaders }, body: JSON.stringify({}) },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Sync failed");
      const count = Array.isArray(json.locators) ? json.locators.length : 0;
      toast.success(count ? `Knowledge base synced (${count} docs)` : "Knowledge base synced");
      if (Array.isArray(json.errors) && json.errors.length) toast.error(String(json.errors[0] || ""));
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setKnowledgeBaseSyncBusy(false);
    }
  }

  async function uploadKnowledgeBaseFile(file: File) {
    if (!selected?.id) return;
    if (knowledgeBaseUploadBusy || busy) return;
    if (!(file instanceof File)) return;
    setKnowledgeBaseUploadBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("name", file.name || "");
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/knowledge-base/upload`,
        { method: "POST", body: fd, headers: variantHeaders },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Upload failed");
      toast.success("File added to knowledge base");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setKnowledgeBaseUploadBusy(false);
    }
  }

  async function syncMessagesKnowledgeBase() {
    if (!selected?.id) return;
    if (messagesKnowledgeBaseSyncBusy || busy) return;
    setMessagesKnowledgeBaseSyncBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/messages-knowledge-base/sync`,
        { method: "POST", headers: { "content-type": "application/json", ...variantHeaders }, body: JSON.stringify({}) },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Sync failed");
      const count = Array.isArray(json.locators) ? json.locators.length : 0;
      toast.success(count ? `Knowledge base synced (${count} docs)` : "Knowledge base synced");
      if (Array.isArray(json.errors) && json.errors.length) toast.error(String(json.errors[0] || ""));
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setMessagesKnowledgeBaseSyncBusy(false);
    }
  }

  async function uploadMessagesKnowledgeBaseFile(file: File) {
    if (!selected?.id) return;
    if (messagesKnowledgeBaseUploadBusy || busy) return;
    if (!(file instanceof File)) return;
    setMessagesKnowledgeBaseUploadBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("name", file.name || "");
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/messages-knowledge-base/upload`,
        { method: "POST", body: fd, headers: variantHeaders },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Upload failed");
      toast.success("File added to knowledge base");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setMessagesKnowledgeBaseUploadBusy(false);
    }
  }

  function extractFirstJsonObjectFromText(text: string): any | null {
    const s = String(text || "");
    for (let start = 0; start < s.length; start++) {
      if (s[start] !== "{") continue;
      let depth = 0;
      for (let end = start; end < s.length; end++) {
        const ch = s[end];
        if (ch === "{") depth += 1;
        else if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            const candidate = s.slice(start, end + 1);
            try {
              return JSON.parse(candidate);
            } catch {
              break;
            }
          }
        }
      }
    }
    return null;
  }

  function normalizeGeneratedAgentConfig(cfg: any): Partial<
    Pick<VoiceAgentConfig, "firstMessage" | "goal" | "personality" | "tone" | "environment" | "guardRails">
  > {
    if (!cfg || typeof cfg !== "object") return {};

    const hasAnyStructuredField =
      Boolean(cfg.firstMessage) ||
      Boolean(cfg.personality) ||
      Boolean(cfg.tone) ||
      Boolean(cfg.environment) ||
      Boolean(cfg.guardRails) ||
      Boolean(cfg.guardrails) ||
      Boolean(cfg.guard_rails);

    const goalText = typeof cfg.goal === "string" ? cfg.goal : "";
    if (hasAnyStructuredField || !goalText) return cfg;

    // If the server fell back and stuffed raw JSON (or almost-JSON) into goal, recover it.
    const extracted = extractFirstJsonObjectFromText(goalText);
    if (!extracted || typeof extracted !== "object") return cfg;

    const obj: any = (extracted as any).config && typeof (extracted as any).config === "object" ? (extracted as any).config : extracted;
    const lower = new Map<string, unknown>();
    for (const [k, v] of Object.entries(obj)) lower.set(String(k).toLowerCase(), v);

    const pick = (keys: string[]) => {
      for (const key of keys) {
        const direct = (obj as any)?.[key];
        const lowered = lower.get(key.toLowerCase());
        const v = typeof direct === "string" ? direct.trim() : typeof lowered === "string" ? (lowered as string).trim() : "";
        if (v) return v;
      }
      return undefined;
    };

    const recovered = {
      firstMessage: pick(["firstMessage", "first_message", "firstmessage", "opener", "opening"]),
      goal: pick(["goal", "objective"]) ?? goalText.trim(),
      personality: pick(["personality", "persona"]),
      tone: pick(["tone", "style", "voice"]),
      environment: pick(["environment", "context", "setting"]),
      guardRails: pick(["guardRails", "guardrails", "guard_rails", "guardRail", "guardrail"]),
    } satisfies Partial<Pick<VoiceAgentConfig, "firstMessage" | "goal" | "personality" | "tone" | "environment" | "guardRails">>;

    return {
      ...cfg,
      ...Object.fromEntries(Object.entries(recovered).filter(([, v]) => typeof v === "string" && v.trim())),
    };
  }

  async function generateAgentConfig(kind: "calls" | "messages") {
    if (!selected) return;
    if (generateBusy) return;

    const context = (kind === "calls" ? callsGenerateContext : messagesGenerateContext).trim();
    if (!context) {
      toast.error("Add a little context first");
      return;
    }

    setGenerateBusy(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/generate-agent-config`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...variantHeaders },
          body: JSON.stringify({ kind, context }),
        },
      );

      const json = (await res.json().catch(() => null)) as ApiGenerateAgentConfigResponse | null;
      if (!res.ok || !json || (json as any).ok !== true) {
        if (kind === "calls") setCallsContextReport((json as any)?.analysis ?? null);
        else setMessagesContextReport((json as any)?.analysis ?? null);
        throw new Error((json as any)?.error || "Failed to generate");
      }

      if (kind === "calls") setCallsContextReport((json as any).analysis ?? null);
      else setMessagesContextReport((json as any).analysis ?? null);

      const cfg = normalizeGeneratedAgentConfig((json as any).config || {});
      if (kind === "calls") {
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === selected.id
              ? {
                  ...c,
                  voiceAgentConfig: {
                    ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                    ...cfg,
                  },
                }
              : c,
          ),
        );
        await updateCampaign({ voiceAgentConfig: cfg });
      } else {
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === selected.id
              ? {
                  ...c,
                  chatAgentConfig: {
                    ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                    ...cfg,
                  },
                }
              : c,
          ),
        );
        await updateCampaign({ chatAgentConfig: cfg });
      }

      toast.success((json as any).warning ? "Generated (fallback)" : "Generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setGenerateBusy(false);
    }
  }

  function makeChatTestId(): string {
    try {
      const anyCrypto = (globalThis as any).crypto;
      const fn = anyCrypto?.randomUUID;
      if (typeof fn === "function") return String(fn.call(anyCrypto));
    } catch {
      // ignore
    }
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function resetMessagesTestThread() {
    const first = buildMessagesTestStarterMessage(selected, messagesTestChannel).trim();
    if (!first) {
      setMessagesTestThread([]);
      return;
    }
    setMessagesTestThread([{ id: makeChatTestId(), role: "agent", text: first, createdAtIso: new Date().toISOString() }]);
  }

  async function sendMessagesTestUserText() {
    if (!selected?.id) return;
    if (messagesTestBusy || busy) return;

    const inbound = messagesTestInput.trim();
    if (!inbound) return;

    const nowIso = new Date().toISOString();
    const userMsg: ChatTestMessage = { id: makeChatTestId(), role: "user" as const, text: inbound, createdAtIso: nowIso };

    const baseThread: ChatTestMessage[] = messagesTestThread.length
      ? messagesTestThread
      : (() => {
          const first = buildMessagesTestStarterMessage(selected, messagesTestChannel).trim();
          if (!first) return [];
          const initial: ChatTestMessage = { id: makeChatTestId(), role: "agent" as const, text: first, createdAtIso: nowIso };
          return [initial];
        })();

    const nextThread: ChatTestMessage[] = [...baseThread, userMsg];
    setMessagesTestThread(nextThread);
    setMessagesTestInput("");
    setMessagesTestBusy(true);
    setError(null);

    try {
      const history = nextThread
        .slice(0, -1)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));

      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/preview-message-reply`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...variantHeaders },
          body: JSON.stringify({ channel: messagesTestChannel, inbound, history }),
        },
      );

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) {
        throw new Error(json?.error || "Test failed");
      }

      const reply = String(json.reply || "").trim();
      if (reply) {
        setMessagesTestThread((prev) => [
          ...prev,
          { id: makeChatTestId(), role: "agent", text: reply, createdAtIso: new Date().toISOString() },
        ]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setMessagesTestBusy(false);
    }
  }

  const statusOptions = useMemo(
    () =>
      ([
        { value: "DRAFT", label: "Draft" },
        { value: "ACTIVE", label: "Active" },
        { value: "PAUSED", label: "Paused" },
        { value: "ARCHIVED", label: "Archived" },
      ] as const),
    [],
  );

  const addCallsTagOptions = useMemo(() => {
    const selectedTagSet = new Set(selected?.audienceTagIds ?? []);
    const q = callsTagSearch.trim().toLowerCase();
    const usable = tags
      .filter((t) => !selectedTagSet.has(t.id))
      .filter((t) => (!q ? true : t.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [
      { value: "", label: "Add a tag…" },
      ...usable.map((t) => ({ value: t.id, label: t.name })),
      { value: "__create__", label: "Create tag…" },
    ];
  }, [callsTagSearch, tags, selected]);

  const addChatTagOptions = useMemo(() => {
    const selectedTagSet = new Set(selected?.chatAudienceTagIds ?? []);
    const q = chatTagSearch.trim().toLowerCase();
    const usable = tags
      .filter((t) => !selectedTagSet.has(t.id))
      .filter((t) => (!q ? true : t.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [
      { value: "", label: "Add a tag…" },
      ...usable.map((t) => ({ value: t.id, label: t.name })),
      { value: "__create__", label: "Create tag…" },
    ];
  }, [chatTagSearch, tags, selected]);

  function addAudienceTag(kind: "calls" | "chat", tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;

    if (kind === "chat") {
      if (selected.chatAudienceTagIds.includes(id)) return;
      const next = [...selected.chatAudienceTagIds, id].slice(0, 50);
      updateCampaign({ chatAudienceTagIds: next });
      return;
    }

    if (selected.audienceTagIds.includes(id)) return;
    const next = [...selected.audienceTagIds, id].slice(0, 50);
    updateCampaign({ audienceTagIds: next });
  }

  function removeAudienceTag(kind: "calls" | "chat", tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;

    if (kind === "chat") {
      const next = selected.chatAudienceTagIds.filter((x) => x !== id);
      updateCampaign({ chatAudienceTagIds: next });
      return;
    }

    const next = selected.audienceTagIds.filter((x) => x !== id);
    updateCampaign({ audienceTagIds: next });
  }

  function addCallOutcomeTag(kind: "completed" | "failed" | "skipped", tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;

    const base = selected.callOutcomeTagging;
    const key = kind === "completed" ? "onCompletedTagIds" : kind === "failed" ? "onFailedTagIds" : "onSkippedTagIds";
    const prev = Array.isArray((base as any)[key]) ? ((base as any)[key] as string[]) : [];
    if (prev.includes(id)) return;
    const next = [...prev, id].slice(0, 50);
    updateCampaign({ callOutcomeTagging: { [key]: next } as any });
  }

  function updateCallOutcomeRule(ruleId: string, patch: Partial<CallOutcomeRule>) {
    if (!selected) return;
    const rules: CallOutcomeRule[] = (selected.callOutcomeTagging?.rules ?? []).map((rule) =>
      rule.id === ruleId
        ? {
            ...rule,
            ...patch,
            outcome: "any" as CallOutcomeKey,
            matchType: "contains" as OutcomeRuleMatchType,
            label: patch.label !== undefined ? patch.label.slice(0, 80) : rule.label,
            matchText: patch.matchText !== undefined ? patch.matchText.slice(0, 240) : rule.matchText,
          }
        : rule,
    );
    updateCampaign({ callOutcomeTagging: { rules } });
  }

  function removeCallOutcomeRule(ruleId: string) {
    if (!selected) return;
    const rules: CallOutcomeRule[] = (selected.callOutcomeTagging?.rules ?? []).filter((rule) => rule.id !== ruleId);
    updateCampaign({ callOutcomeTagging: { rules } });
  }

  function addTagToCallOutcomeRule(ruleId: string, tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;
    const rules: CallOutcomeRule[] = (selected.callOutcomeTagging?.rules ?? []).map((rule) =>
      rule.id === ruleId && !rule.tagIds.includes(id)
        ? { ...rule, tagIds: [...rule.tagIds, id].slice(0, 50) }
        : rule,
    );
    updateCampaign({ callOutcomeTagging: { rules } });
  }

  function removeTagFromCallOutcomeRule(ruleId: string, tagId: string) {
    if (!selected) return;
    const rules: CallOutcomeRule[] = (selected.callOutcomeTagging?.rules ?? []).map((rule) =>
      rule.id === ruleId ? { ...rule, tagIds: rule.tagIds.filter((id) => id !== tagId) } : rule,
    );
    updateCampaign({ callOutcomeTagging: { rules } });
  }

  function addMessageOutcomeTag(kind: "sent" | "failed" | "skipped", tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;

    const base = selected.messageOutcomeTagging;
    const key = kind === "sent" ? "onSentTagIds" : kind === "failed" ? "onFailedTagIds" : "onSkippedTagIds";
    const prev = Array.isArray((base as any)[key]) ? ((base as any)[key] as string[]) : [];
    if (prev.includes(id)) return;
    const next = [...prev, id].slice(0, 50);
    updateCampaign({ messageOutcomeTagging: { [key]: next } as any });
  }

  function updateMessageOutcomeRule(ruleId: string, patch: Partial<MessageOutcomeRule>) {
    if (!selected) return;
    const rules: MessageOutcomeRule[] = (selected.messageOutcomeTagging?.rules ?? []).map((rule) =>
      rule.id === ruleId
        ? {
            ...rule,
            ...patch,
            outcome: "any" as MessageOutcomeKey,
            matchType: "contains" as OutcomeRuleMatchType,
            label: patch.label !== undefined ? patch.label.slice(0, 80) : rule.label,
            matchText: patch.matchText !== undefined ? patch.matchText.slice(0, 240) : rule.matchText,
          }
        : rule,
    );
    updateCampaign({ messageOutcomeTagging: { rules } });
  }

  function removeMessageOutcomeRule(ruleId: string) {
    if (!selected) return;
    const rules: MessageOutcomeRule[] = (selected.messageOutcomeTagging?.rules ?? []).filter((rule) => rule.id !== ruleId);
    updateCampaign({ messageOutcomeTagging: { rules } });
  }

  function addTagToMessageOutcomeRule(ruleId: string, tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;
    const rules: MessageOutcomeRule[] = (selected.messageOutcomeTagging?.rules ?? []).map((rule) =>
      rule.id === ruleId && !rule.tagIds.includes(id)
        ? { ...rule, tagIds: [...rule.tagIds, id].slice(0, 50) }
        : rule,
    );
    updateCampaign({ messageOutcomeTagging: { rules } });
  }

  function removeTagFromMessageOutcomeRule(ruleId: string, tagId: string) {
    if (!selected) return;
    const rules: MessageOutcomeRule[] = (selected.messageOutcomeTagging?.rules ?? []).map((rule) =>
      rule.id === ruleId ? { ...rule, tagIds: rule.tagIds.filter((id) => id !== tagId) } : rule,
    );
    updateCampaign({ messageOutcomeTagging: { rules } });
  }

  function buildFloatingMenuState(button: HTMLButtonElement | null, id: string): ActivityMenuState | null {
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const openUpwards = rect.top > 132;
    return {
      id,
      top: openUpwards ? rect.top - 8 : rect.bottom + 8,
      left: Math.min(window.innerWidth - 12, rect.right),
      openUpwards,
    };
  }

  function toggleMessagesActivityMenu(event: { currentTarget: HTMLButtonElement }, rowId: string) {
    const button = event.currentTarget;
    setCallsActivityMenu(null);
    setMessagesActivityMenu((current) =>
      current?.id === rowId ? null : buildFloatingMenuState(button, rowId),
    );
  }

  function toggleCallsActivityMenu(event: { currentTarget: HTMLButtonElement }, rowId: string) {
    const button = event.currentTarget;
    setMessagesActivityMenu(null);
    setCallsActivityMenu((current) =>
      current?.id === rowId ? null : buildFloatingMenuState(button, rowId),
    );
  }

  function deriveOutcomeRuleLabel(outcomeLabel: string, label: string, matchText: string) {
    const explicit = label.trim();
    if (explicit) return explicit.slice(0, 80);
    const fallback = String(matchText || "").trim().split(/[\n,]/)[0]?.trim();
    if (fallback) return fallback.slice(0, 80);
    return `${outcomeLabel} rule`;
  }

  function createCallOutcomeRuleFromDraft() {
    if (!selected) return;
    const matchText = newCallOutcomeRuleDraft.matchText.trim().slice(0, 240);
    const label = newCallOutcomeRuleDraft.label.trim();
    if (!label || !matchText || !newCallOutcomeRuleDraft.tagIds.length) return;
    const outcome: CallOutcomeKey = "any";
    const nextRule: CallOutcomeRule = {
      id: makeClientId("call-outcome-rule"),
      label: deriveOutcomeRuleLabel(callOutcomeLabel(outcome), label, matchText),
      outcome,
      matchType: "contains",
      matchText,
      tagIds: [...new Set(newCallOutcomeRuleDraft.tagIds)].slice(0, 50),
    };
    const rules: CallOutcomeRule[] = [...(selected.callOutcomeTagging?.rules ?? []), nextRule].slice(0, 25);
    updateCampaign({ callOutcomeTagging: { rules } });
    setNewCallOutcomeRuleDraft({ label: "", outcome: outcome, matchText: "", tagIds: [] });
  }

  function createMessageOutcomeRuleFromDraft() {
    if (!selected) return;
    const matchText = newMessageOutcomeRuleDraft.matchText.trim().slice(0, 240);
    const label = newMessageOutcomeRuleDraft.label.trim();
    if (!label || !matchText || !newMessageOutcomeRuleDraft.tagIds.length) return;
    const outcome: MessageOutcomeKey = "any";
    const nextRule: MessageOutcomeRule = {
      id: makeClientId("message-outcome-rule"),
      label: deriveOutcomeRuleLabel(messageOutcomeLabel(outcome), label, matchText),
      outcome,
      matchType: "contains",
      matchText,
      tagIds: [...new Set(newMessageOutcomeRuleDraft.tagIds)].slice(0, 50),
    };
    const rules: MessageOutcomeRule[] = [...(selected.messageOutcomeTagging?.rules ?? []), nextRule].slice(0, 25);
    updateCampaign({ messageOutcomeTagging: { rules } });
    setNewMessageOutcomeRuleDraft({ label: "", outcome: outcome, matchText: "", tagIds: [] });
  }

  function addTagToContext(ctx: typeof tagCreateContext, tagId: string) {
    if (ctx === "calls_audience") return addAudienceTag("calls", tagId);
    if (ctx === "chat_audience") return addAudienceTag("chat", tagId);
    if (ctx === "calls_outcome_completed") return addCallOutcomeTag("completed", tagId);
    if (ctx === "calls_outcome_failed") return addCallOutcomeTag("failed", tagId);
    if (ctx === "calls_outcome_skipped") return addCallOutcomeTag("skipped", tagId);
    if (ctx === "messages_outcome_sent") return addMessageOutcomeTag("sent", tagId);
    if (ctx === "messages_outcome_failed") return addMessageOutcomeTag("failed", tagId);
    if (ctx === "messages_outcome_skipped") return addMessageOutcomeTag("skipped", tagId);
  }

  const selectedCallTags = useMemo(() => {
    const map = new Map(tags.map((t) => [t.id, t] as const));
    return (selected?.audienceTagIds ?? []).map((id) => map.get(id)).filter(Boolean) as ContactTag[];
  }, [tags, selected]);

  const selectedChatTags = useMemo(() => {
    const map = new Map(tags.map((t) => [t.id, t] as const));
    return (selected?.chatAudienceTagIds ?? []).map((id) => map.get(id)).filter(Boolean) as ContactTag[];
  }, [tags, selected]);

  const callOutcomeRuleTagOptions = useMemo(() => buildAddTagOptionsFromTags(tags, [], callsOutcomeTagSearch), [callsOutcomeTagSearch, tags]);

  const messageOutcomeRuleTagOptions = useMemo(() => buildAddTagOptionsFromTags(tags, [], messagesOutcomeTagSearch), [messagesOutcomeTagSearch, tags]);

  const selectedToolKeys = useMemo(() => {
    const explicit = selected?.voiceAgentConfig?.toolKeys;
    if (Array.isArray(explicit) && explicit.length) {
      return explicit.map((k) => String(k || "").trim().toLowerCase()).filter(Boolean);
    }

    // Back-compat: derive selected keys from stored toolIds when possible.
    const ids = new Set((selected?.voiceAgentConfig?.toolIds ?? []).map((x) => String(x || "").trim()).filter(Boolean));
    if (!ids.size) return [];
    return voiceTools
      .filter((t) => Boolean(t.toolId && ids.has(t.toolId)))
      .map((t) => t.key)
      .filter(Boolean);
  }, [selected, voiceTools]);

  const toolKeysForPreset = useCallback((preset: "none" | "recommended" | "all"): string[] => {
    if (preset === "none") return [];
    const all = voiceTools.map((t) => t.key).filter(Boolean);
    if (preset === "all") return all;

    const recKeys = new Set<string>([
      "voicemail_detection",
      "language_detection",
      "end_call",
      "transfer_to_human",
      "call_transfer",
      "transfer_to_number",
      "transfer_to_agent",
      "dtmf_tones",
    ]);

    const rec = all.filter((k) => recKeys.has(k));
    return rec.length ? rec : all;
  }, [voiceTools]);

  useEffect(() => {
    const current = [...selectedToolKeys].sort().join("|");
    const none = "";
    const recommended = [...toolKeysForPreset("recommended")].sort().join("|");
    const all = [...toolKeysForPreset("all")].sort().join("|");

    if (current === none) {
      setCallsToolsPreset("none");
      return;
    }
    if (current === recommended) {
      setCallsToolsPreset("recommended");
      return;
    }
    if (current === all) {
      setCallsToolsPreset("all");
      return;
    }
    setCallsToolsPreset("custom");
  }, [selectedToolKeys, toolKeysForPreset, voiceTools]);

  function hasKnowledgeBaseContent(kb: CampaignKnowledgeBase | null): boolean {
    const safe = ensureKnowledgeBase(kb);
    return Boolean(
      safe.seedUrl.trim() || safe.text.trim() || (safe.locators?.length ?? 0) || safe.lastSyncedAtIso || safe.lastSyncError,
    );
  }

  function updateKnowledgeBaseDraft(kind: "calls" | "messages", patch: Partial<CampaignKnowledgeBase>) {
    if (!selected) return;
    setCampaigns((prev) =>
      prev.map((campaign) => {
        if (campaign.id !== selected.id) return campaign;
        if (kind === "calls") {
          return {
            ...campaign,
            knowledgeBase: {
              ...ensureKnowledgeBase(campaign.knowledgeBase),
              ...patch,
            },
          };
        }
        return {
          ...campaign,
          messagesKnowledgeBase: {
            ...ensureKnowledgeBase(campaign.messagesKnowledgeBase),
            ...patch,
          },
        };
      }),
    );
  }

  function saveKnowledgeBaseDraft(kind: "calls" | "messages") {
    if (!selected) return;
    return updateCampaign(
      kind === "calls"
        ? { knowledgeBase: ensureKnowledgeBase(selected.knowledgeBase) }
        : { messagesKnowledgeBase: ensureKnowledgeBase(selected.messagesKnowledgeBase) },
    );
  }

  function renderKnowledgeBaseMeta(kind: "calls" | "messages") {
    const kb = kind === "calls" ? selected?.knowledgeBase ?? null : selected?.messagesKnowledgeBase ?? null;
    const safe = ensureKnowledgeBase(kb);
    const count = Array.isArray(safe.locators) ? safe.locators.length : 0;

    if (!hasKnowledgeBaseContent(kb)) {
      return <div className="text-[11px] text-zinc-500">No knowledge base configured yet.</div>;
    }

    return (
      <div className="text-[11px] text-zinc-600">
        <div>Attached docs: {count || 0}</div>
        {safe.lastSyncedAtIso ? <div>Last synced: {formatWhen(safe.lastSyncedAtIso)}</div> : null}
        {safe.lastSyncError ? <div className="mt-1 text-amber-700">Sync warning: {safe.lastSyncError}</div> : null}
      </div>
    );
  }

  function renderCallsAudienceAndAutoTag() {
    if (!selected) return null;

    return (
      <>
        <div className="mt-5">
          <div className="text-xs font-semibold text-zinc-700">Calls audience tags</div>
          <p className="mt-1 text-[11px] text-zinc-500">When a contact gets one of these tags, they’ll be queued for a call.</p>

          <div className="mt-3 max-w-sm">
            <PortalListboxDropdown
              value={callsAddTagValue}
              options={addCallsTagOptions as any}
              onChange={(v) => {
                const id = String(v || "");
                if (!id) {
                  setCallsAddTagValue("");
                  return;
                }
                if (id === "__create__") {
                  setCallsAddTagValue("");
                  setTagCreateContext("calls_audience");
                  setShowCreateTag(true);
                  return;
                }
                setCallsAddTagValue("");
                addAudienceTag("calls", id);
              }}
            />
          </div>

          {showCreateTag && (tagCreateContext === "calls_audience" || tagCreateContext.startsWith("calls_outcome_")) ? (
            <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="text-xs font-semibold text-zinc-700">Create tag</div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Tag name"
                  className="sm:col-span-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />

                <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-2 py-2">
                  {DEFAULT_TAG_COLORS.slice(0, 10).map((c) => {
                    const sel = c === createTagColor;
                    return (
                      <button
                        key={c}
                        type="button"
                        className={classNames(
                          "h-7 w-7 rounded-full border",
                          sel ? "border-zinc-900 ring-2 ring-zinc-900/20" : "border-zinc-200",
                        )}
                        style={{ backgroundColor: c }}
                        onClick={() => setCreateTagColor(c)}
                        title={c}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateTag(false);
                    setNewTagName("");
                  }}
                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !newTagName.trim()}
                  onClick={createTagAndMaybeAdd}
                  className={classNames(
                    "rounded-2xl px-4 py-2 text-xs font-semibold",
                    busy || !newTagName.trim() ? "bg-zinc-200 text-zinc-600" : "bg-brand-ink text-white hover:opacity-95",
                  )}
                >
                  {busy ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          ) : null}

          {selectedCallTags.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedCallTags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => removeAudienceTag("calls", t.id)}
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
                  style={tagChipStyle(t.color || null)}
                  title="Remove"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                  <span className="max-w-45 truncate">{t.name}</span>
                  <span className="opacity-60">×</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-[11px] text-zinc-500">No tags selected.</div>
          )}
        </div>

        <div className="mt-5">
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-zinc-700">Auto-tag after call outcomes</div>
              <p className="mt-1 text-[11px] text-zinc-500">Apply tags automatically based on what happened during the call.</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
              <span>{selected.callOutcomeTagging?.enabled ? "On" : "Off"}</span>
              <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  disabled={busy}
                  checked={Boolean(selected.callOutcomeTagging?.enabled)}
                  onChange={(e) => void updateCampaign({ callOutcomeTagging: { enabled: e.target.checked } })}
                />
                <span className="absolute inset-0 rounded-full border border-white/70 bg-zinc-200/80 transition peer-checked:bg-brand-blue/75 peer-disabled:opacity-60" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_8px_20px_rgba(15,23,42,0.14)] transition peer-checked:translate-x-5 peer-disabled:opacity-80" />
              </span>
            </label>
          </div>

          {selected.callOutcomeTagging?.enabled ? (
            <div className="mt-4 opacity-100">
              <div>
                <div className="text-xs font-semibold text-zinc-700">Tag by what happened on the call</div>
                <div className="mt-1 text-[11px] text-zinc-500">Name the outcome you care about, then describe what the transcript or call notes should say before the tag is applied.</div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div>
                    <div className="text-[11px] font-semibold text-zinc-600">What happened</div>
                    <input
                      value={newCallOutcomeRuleDraft.label}
                      onChange={(e) => setNewCallOutcomeRuleDraft((current) => ({ ...current, label: e.target.value.slice(0, 80) }))}
                      placeholder="Booked call"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={createCallOutcomeRuleFromDraft}
                      disabled={!newCallOutcomeRuleDraft.label.trim() || !newCallOutcomeRuleDraft.matchText.trim() || !newCallOutcomeRuleDraft.tagIds.length}
                      className={classNames(
                        "rounded-2xl px-4 py-2 text-xs font-semibold",
                        !newCallOutcomeRuleDraft.label.trim() || !newCallOutcomeRuleDraft.matchText.trim() || !newCallOutcomeRuleDraft.tagIds.length
                          ? "bg-zinc-200 text-zinc-600"
                          : "bg-sky-100 text-(--color-brand-blue) hover:bg-sky-200",
                      )}
                    >
                      Add custom rule
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-zinc-600">What in the transcript should trigger it</div>
                  <textarea
                    value={newCallOutcomeRuleDraft.matchText}
                    onChange={(e) => setNewCallOutcomeRuleDraft((current) => ({ ...current, matchText: e.target.value.slice(0, 240) }))}
                    rows={3}
                    placeholder="They booked, picked a time, confirmed an appointment, asked to reschedule, said wrong number, or asked not to be called again."
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="mt-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="text-[11px] font-semibold text-zinc-600">Tags that will be added</div>
                    <div className="w-full sm:w-56">
                      <PortalListboxDropdown value="" options={callOutcomeRuleTagOptions as any} onChange={(value) => {
                        const id = String(value || "");
                        if (!id || id === "__create__") return;
                        setNewCallOutcomeRuleDraft((current) => ({
                          ...current,
                          tagIds: current.tagIds.includes(id) ? current.tagIds : [...current.tagIds, id].slice(0, 50),
                        }));
                      }} />
                    </div>
                  </div>
                  {newCallOutcomeRuleDraft.tagIds.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {newCallOutcomeRuleDraft.tagIds.map((id) => tags.find((tag) => tag.id === id) || null).filter(Boolean).map((tag) => (
                        <button key={tag!.id} type="button" onClick={() => setNewCallOutcomeRuleDraft((current) => ({ ...current, tagIds: current.tagIds.filter((tagId) => tagId !== tag!.id) }))} className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={tagChipStyle(tag!.color || null)}>
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag!.color || "#64748B" }} />
                          <span className="max-w-40 truncate">{tag!.name}</span>
                          <span className="opacity-60">×</span>
                        </button>
                      ))}
                    </div>
                  ) : <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-500">Pick at least one tag for this outcome.</div>}
                </div>
              </div>

              {selected.callOutcomeTagging?.rules?.length ? (
                <div className="mt-4 space-y-3">
                  {selected.callOutcomeTagging.rules.map((rule) => {
                    const ruleTags = rule.tagIds.map((id) => tags.find((tag) => tag.id === id) || null).filter(Boolean) as ContactTag[];
                    return (
                      <div key={rule.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                          <div>
                            <div className="text-[11px] font-semibold text-zinc-600">What happened</div>
                            <input value={rule.label} onChange={(e) => updateCallOutcomeRule(rule.id, { label: e.target.value })} placeholder="Booked consult" className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                          </div>
                          <div className="flex justify-end">
                            <button type="button" onClick={() => removeCallOutcomeRule(rule.id)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">Delete rule</button>
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="text-[11px] font-semibold text-zinc-600">What in the transcript should trigger it</div>
                          <textarea value={rule.matchText} onChange={(e) => updateCallOutcomeRule(rule.id, { matchText: e.target.value })} rows={3} placeholder="They booked, confirmed a time, left a voicemail, asked for pricing, said wrong number, or asked not to be called again." className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,14rem)_1fr] lg:items-start">
                          <div>
                            <div className="text-[11px] font-semibold text-zinc-600">Apply tags</div>
                            <PortalListboxDropdown value="" options={callOutcomeRuleTagOptions as any} onChange={(value) => {
                              const id = String(value || "");
                              if (!id || id === "__create__") return;
                              addTagToCallOutcomeRule(rule.id, id);
                            }} />
                          </div>
                          <div>
                            {ruleTags.length ? (
                              <div className="flex flex-wrap gap-2">
                                {ruleTags.map((tag) => (
                                  <button key={tag.id} type="button" onClick={() => removeTagFromCallOutcomeRule(rule.id, tag.id)} className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={tagChipStyle(tag.color || null)}>
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color || "#64748B" }} />
                                    <span className="max-w-40 truncate">{tag.name}</span>
                                    <span className="opacity-60">×</span>
                                  </button>
                                ))}
                              </div>
                            ) : <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-500">No tags selected for this rule.</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-600">No custom call outcome rules yet.</div>}
            </div>
          ) : null}
        </div>
      </>
    );
  }

  function renderMessagesAudienceAndAutoTag() {
    if (!selected) return null;

    return (
      <>
        <div className="mt-5 grid gap-4 xl:grid-cols-2 xl:items-start">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs font-semibold text-zinc-700">Channel policy</div>
            <div className="mt-1 text-[11px] text-zinc-600">Choose which channels this campaign can use for first messages.</div>
            <div className="mt-2 w-full max-w-full">
            <PortalListboxDropdown
              value={selected.messageChannelPolicy}
              options={[
                { value: "SMS", label: "SMS only" },
                { value: "EMAIL", label: "Email only" },
                { value: "BOTH", label: "Both" },
              ]}
              onChange={(v) => {
                const next = v as any;
                setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, messageChannelPolicy: next } : c)));
                setMessagesAgentSyncRequired(true);
                setMessagesAgentSyncedAtIso(null);
                if (next === "SMS" || next === "EMAIL" || next === "BOTH") {
                  setManualEnrollChannelPolicy(next);
                  if (next === "SMS") setMessagesTestChannel("sms");
                  if (next === "EMAIL") setMessagesTestChannel("email");
                }
              }}
              disabled={busy}
            />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="text-xs font-semibold text-zinc-700">Message audience tags</div>
            <p className="mt-1 text-[11px] text-zinc-500">When a contact gets one of these tags, they’ll be included in the messaging audience.</p>

          <div className="mt-3 max-w-sm">
            <PortalListboxDropdown
              value={chatAddTagValue}
              options={addChatTagOptions as any}
              onChange={(v) => {
                const id = String(v || "");
                if (!id) {
                  setChatAddTagValue("");
                  return;
                }
                if (id === "__create__") {
                  setChatAddTagValue("");
                  setTagCreateContext("chat_audience");
                  setShowCreateTag(true);
                  return;
                }
                setChatAddTagValue("");
                addAudienceTag("chat", id);
              }}
            />
          </div>

          {showCreateTag && (tagCreateContext === "chat_audience" || tagCreateContext.startsWith("messages_outcome_")) ? (
            <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="text-xs font-semibold text-zinc-700">Create tag</div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Tag name"
                  className="sm:col-span-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />

                <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-2 py-2">
                  {DEFAULT_TAG_COLORS.slice(0, 10).map((c) => {
                    const sel = c === createTagColor;
                    return (
                      <button
                        key={c}
                        type="button"
                        className={classNames(
                          "h-7 w-7 rounded-full border",
                          sel ? "border-zinc-900 ring-2 ring-zinc-900/20" : "border-zinc-200",
                        )}
                        style={{ backgroundColor: c }}
                        onClick={() => setCreateTagColor(c)}
                        title={c}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <button type="button" onClick={() => { setShowCreateTag(false); setNewTagName(""); }} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50" disabled={busy}>
                  Cancel
                </button>
                <button type="button" disabled={busy || !newTagName.trim()} onClick={createTagAndMaybeAdd} className={classNames("rounded-2xl px-4 py-2 text-xs font-semibold", busy || !newTagName.trim() ? "bg-zinc-200 text-zinc-600" : "bg-brand-ink text-white hover:opacity-95")}>
                  {busy ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          ) : null}

          {selectedChatTags.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedChatTags.map((t) => (
                <button key={t.id} type="button" onClick={() => removeAudienceTag("chat", t.id)} className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={tagChipStyle(t.color || null)} title="Remove">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                  <span className="max-w-45 truncate">{t.name}</span>
                  <span className="opacity-60">×</span>
                </button>
              ))}
            </div>
          ) : <div className="mt-3 text-[11px] text-zinc-500">No tags selected.</div>}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-zinc-700">Auto-tag after message outcomes</div>
              <p className="mt-1 text-[11px] text-zinc-500">Apply tags automatically based on what happened in the thread.</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
              <span>{selected.messageOutcomeTagging?.enabled ? "On" : "Off"}</span>
              <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  disabled={busy}
                  checked={Boolean(selected.messageOutcomeTagging?.enabled)}
                  onChange={(e) => void updateCampaign({ messageOutcomeTagging: { enabled: e.target.checked } })}
                />
                <span className="absolute inset-0 rounded-full border border-white/70 bg-zinc-200/80 transition peer-checked:bg-brand-blue/75 peer-disabled:opacity-60" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_8px_20px_rgba(15,23,42,0.14)] transition peer-checked:translate-x-5 peer-disabled:opacity-80" />
              </span>
            </label>
          </div>

          {selected.messageOutcomeTagging?.enabled ? (
            <div className="mt-4 opacity-100">
              <div>
                <div className="text-xs font-semibold text-zinc-700">Tag by what happened in the thread</div>
                <div className="mt-1 text-[11px] text-zinc-500">Name the outcome you care about, then describe the reply or thread language that should trigger the tag.</div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div>
                    <div className="text-[11px] font-semibold text-zinc-600">What happened</div>
                    <input
                      value={newMessageOutcomeRuleDraft.label}
                      onChange={(e) => setNewMessageOutcomeRuleDraft((current) => ({ ...current, label: e.target.value.slice(0, 80) }))}
                      placeholder="Asked for pricing"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={createMessageOutcomeRuleFromDraft}
                      disabled={!newMessageOutcomeRuleDraft.label.trim() || !newMessageOutcomeRuleDraft.matchText.trim() || !newMessageOutcomeRuleDraft.tagIds.length}
                      className={classNames(
                        "rounded-2xl px-4 py-2 text-xs font-semibold",
                        !newMessageOutcomeRuleDraft.label.trim() || !newMessageOutcomeRuleDraft.matchText.trim() || !newMessageOutcomeRuleDraft.tagIds.length
                          ? "bg-zinc-200 text-zinc-600"
                          : "bg-sky-100 text-(--color-brand-blue) hover:bg-sky-200",
                      )}
                    >
                      Add custom rule
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-zinc-600">What in the thread should trigger it</div>
                  <textarea
                    value={newMessageOutcomeRuleDraft.matchText}
                    onChange={(e) => setNewMessageOutcomeRuleDraft((current) => ({ ...current, matchText: e.target.value.slice(0, 240) }))}
                    rows={3}
                    placeholder="They asked for pricing, booked a demo, said stop texting, wanted a follow-up next week, or bought the offer."
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="mt-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="text-[11px] font-semibold text-zinc-600">Tags that will be added</div>
                    <div className="w-full sm:w-56">
                      <PortalListboxDropdown value="" options={messageOutcomeRuleTagOptions as any} onChange={(value) => {
                        const id = String(value || "");
                        if (!id || id === "__create__") return;
                        setNewMessageOutcomeRuleDraft((current) => ({
                          ...current,
                          tagIds: current.tagIds.includes(id) ? current.tagIds : [...current.tagIds, id].slice(0, 50),
                        }));
                      }} />
                    </div>
                  </div>
                  {newMessageOutcomeRuleDraft.tagIds.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {newMessageOutcomeRuleDraft.tagIds.map((id) => tags.find((tag) => tag.id === id) || null).filter(Boolean).map((tag) => (
                        <button key={tag!.id} type="button" onClick={() => setNewMessageOutcomeRuleDraft((current) => ({ ...current, tagIds: current.tagIds.filter((tagId) => tagId !== tag!.id) }))} className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={tagChipStyle(tag!.color || null)}>
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag!.color || "#64748B" }} />
                          <span className="max-w-40 truncate">{tag!.name}</span>
                          <span className="opacity-60">×</span>
                        </button>
                      ))}
                    </div>
                  ) : <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-500">Pick at least one tag for this outcome.</div>}
                </div>
              </div>

              {selected.messageOutcomeTagging?.rules?.length ? (
                <div className="mt-4 space-y-3">
                  {selected.messageOutcomeTagging.rules.map((rule) => {
                    const ruleTags = rule.tagIds.map((id) => tags.find((tag) => tag.id === id) || null).filter(Boolean) as ContactTag[];
                    return (
                      <div key={rule.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                          <div>
                            <div className="text-[11px] font-semibold text-zinc-600">What happened</div>
                            <input value={rule.label} onChange={(e) => updateMessageOutcomeRule(rule.id, { label: e.target.value })} placeholder="Asked for pricing" className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                          </div>
                          <div className="flex justify-end">
                            <button type="button" onClick={() => removeMessageOutcomeRule(rule.id)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">Delete rule</button>
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="text-[11px] font-semibold text-zinc-600">What in the thread should trigger it</div>
                          <textarea value={rule.matchText} onChange={(e) => updateMessageOutcomeRule(rule.id, { matchText: e.target.value })} rows={3} placeholder="They asked for pricing, booked a demo, said stop texting, wanted a follow-up next week, or bought the offer." className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,14rem)_1fr] lg:items-start">
                          <div>
                            <div className="text-[11px] font-semibold text-zinc-600">Apply tags</div>
                            <PortalListboxDropdown value="" options={messageOutcomeRuleTagOptions as any} onChange={(value) => {
                              const id = String(value || "");
                              if (!id || id === "__create__") return;
                              addTagToMessageOutcomeRule(rule.id, id);
                            }} />
                          </div>
                          <div>
                            {ruleTags.length ? (
                              <div className="flex flex-wrap gap-2">
                                {ruleTags.map((tag) => (
                                  <button key={tag.id} type="button" onClick={() => removeTagFromMessageOutcomeRule(rule.id, tag.id)} className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={tagChipStyle(tag.color || null)}>
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color || "#64748B" }} />
                                    <span className="max-w-40 truncate">{tag.name}</span>
                                    <span className="opacity-60">×</span>
                                  </button>
                                ))}
                              </div>
                            ) : <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-3 py-3 text-xs text-zinc-500">No tags selected for this rule.</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-600">No custom messaging outcome rules yet.</div>}
            </div>
          ) : null}
        </div>
      </>
    );
  }

  const openMessagesMenuRow = messagesActivityMenu
    ? displayMessagesRecent.find((entry) => entry.id === messagesActivityMenu.id) ?? null
    : null;
  const openCallsMenuRow = callsActivityMenu
    ? displayCallActivityRows.find((entry) => entry.id === callsActivityMenu.id) ?? null
    : null;

  return (
    <div
      ref={pageRootRef}
      className={classNames(
        "w-full",
        tab === "testing" && !isMobileApp
          ? "-mx-4 flex h-full min-h-0 max-h-full w-[calc(100%+2rem)] max-w-none flex-col overflow-hidden px-0 sm:-mx-6 sm:w-[calc(100%+3rem)] lg:-mx-8 lg:w-[calc(100%+4rem)]"
          : "mx-auto max-w-6xl px-4 sm:px-6",
      )}
    >
      <PortalVariablePickerModal
        open={variablePickerOpen}
        variables={variablePickerVariables}
        onPick={applyPickedVariable}
        createCustom={{ enabled: true, existingKeys: knownContactCustomVarKeys, allowContactPick: true }}
        onClose={() => {
          setVariablePickerOpen(false);
          setVariablePickerTarget(null);
        }}
      />
      {tab !== "testing" ? (
        <div className="flex justify-end">
          <div className="w-full sm:w-auto">
            <SuggestedSetupModalLauncher serviceSlugs={["ai-outbound-calls"]} buttonLabel="Suggested setup" />
          </div>
        </div>
      ) : null}

      <div className={classNames("mt-0", tab === "testing" && !isMobileApp ? "flex min-h-0 flex-1 flex-col" : null)}>
        {error ? (
          <div className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {sanitizeClientErrorText(error) || "We couldn't load AI Outbound right now."}
          </div>
        ) : null}
        <div className={classNames(tab === "testing" && !isMobileApp ? "flex min-h-0 flex-1 flex-col" : null)}>
          {isMobileApp ? (
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-zinc-800">Campaign</div>
                <div className="mt-1">
                  {loading ? (
                    <div className="text-sm text-zinc-500">Loading…</div>
                  ) : campaigns.length === 0 ? (
                    <div className="text-sm text-zinc-500">No campaigns yet.</div>
                  ) : (
                    <PortalSelectDropdown
                      value={selectedId ?? ""}
                      onChange={(v) => setSelectedId(String(v))}
                      options={campaigns.map((c) => ({ value: c.id, label: `${c.name} · ${c.status}` }))}
                      className="w-full"
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                    />
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setCreateName("");
                  setCreateOpen(true);
                }}
                className={classNames(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-semibold",
                  busy
                    ? "border border-white/60 bg-white/75 text-zinc-400"
                    : "border border-brand-blue/20 bg-brand-blue/12 text-(--color-brand-blue) shadow-[0_16px_40px_rgba(28,100,242,0.16)] hover:-translate-y-0.5 hover:bg-brand-blue/16",
                )}
                title="Create campaign"
                aria-label="Create campaign"
              >
                +
              </button>
            </div>
          ) : null}
          {!selected ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <div className="max-w-xl">
                <div className="text-lg font-semibold text-zinc-900">No campaign selected</div>
                <div className="mt-2 text-sm text-zinc-600">
                  Create a campaign to start configuring calls, messages, testing, and settings.
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCreateName("");
                    setCreateOpen(true);
                  }}
                  className={classNames(
                    "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors duration-150",
                    busy ? "bg-zinc-200 text-zinc-600" : "bg-sky-100 text-(--color-brand-blue) hover:bg-sky-200",
                  )}
                >
                  <span className="text-base leading-none">+</span>
                  <span>New campaign</span>
                </button>
                {loading ? <div className="text-sm text-zinc-500">Loading campaigns…</div> : null}
              </div>
            </div>
          ) : (
            <div className={classNames(tab === "testing" && !isMobileApp ? "flex min-h-0 flex-1 flex-col" : null)}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1">
                  {campaignNameEditing ? (
                    <input
                      value={campaignNameDraft}
                      onChange={(e) => setCampaignNameDraft(e.target.value)}
                      onBlur={() => {
                        const nextName = campaignNameDraft.trim() || selected.name;
                        setCampaignNameEditing(false);
                        setCampaignNameDraft(nextName);
                        setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, name: nextName } : c)));
                        void updateCampaign({ name: nextName });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setCampaignNameEditing(false);
                          setCampaignNameDraft(selected.name);
                          return;
                        }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const nextName = campaignNameDraft.trim() || selected.name;
                          setCampaignNameEditing(false);
                          setCampaignNameDraft(nextName);
                          setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, name: nextName } : c)));
                          void updateCampaign({ name: nextName });
                        }
                      }}
                      autoFocus
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-lg font-semibold text-brand-ink outline-none focus:border-zinc-300"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setCampaignNameDraft(selected.name);
                        setCampaignNameEditing(true);
                      }}
                      className="max-w-full truncate rounded-2xl px-1 py-1 text-left text-2xl font-semibold text-brand-ink transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30"
                      title="Click to edit campaign name"
                    >
                      {selected.name}
                    </button>
                  )}
                </div>

                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                  {tab === "calls" || tab === "messages" ? (
                    <Link
                      href={
                        tab === "calls"
                          ? pathname.startsWith("/credit")
                            ? "/credit/app/services/inbox?channel=sms"
                            : "/portal/app/services/inbox?channel=sms"
                          : pathname.startsWith("/credit")
                            ? "/credit/app/services/inbox/email"
                            : "/portal/app/services/inbox/email"
                      }
                      className="inline-flex items-center justify-center rounded-2xl bg-brand-blue/12 px-3 py-2 text-xs font-semibold text-(--color-brand-blue) hover:bg-brand-blue/18"
                    >
                      Open Inbox
                    </Link>
                  ) : null}
                  <div className="w-full sm:w-55">
                    <PortalListboxDropdown
                      value={selected.status}
                      options={statusOptions as any}
                      onChange={(v) => {
                        const status = v as CampaignStatus;
                        setCampaigns((prev) => prev.map((campaign) => (campaign.id === selected.id ? { ...campaign, status } : campaign)));
                        void updateCampaign({ status });
                      }}
                      buttonClassName="flex h-11 w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                    />
                  </div>

                  {!isMobileApp ? (
                    <div className="flex shrink-0 items-end">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setCreateName("");
                          setCreateOpen(true);
                        }}
                        className={classNames(
                          "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors duration-150",
                          busy ? "bg-zinc-200 text-zinc-600" : "bg-sky-100 text-(--color-brand-blue) hover:bg-sky-200",
                        )}
                      >
                        <span className="text-base leading-none">+</span>
                        <span>New campaign</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {isMobileApp ? (
                <div className="mt-4 grid w-full grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setTabAndRoute("calls")}
                  aria-current={tab === "calls" ? "page" : undefined}
                  className={classNames(
                    "flex-1 rounded-2xl border font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60",
                    isMobileApp
                      ? "min-w-0 whitespace-nowrap px-3 py-2 text-xs"
                      : "min-w-40 px-4 py-2.5 text-sm",
                    tab === "calls"
                      ? "border-zinc-200 bg-zinc-100 text-zinc-900"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  Calls
                </button>
                <button
                  type="button"
                  onClick={() => setTabAndRoute("messages")}
                  aria-current={tab === "messages" ? "page" : undefined}
                  className={classNames(
                    "flex-1 rounded-2xl border font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60",
                    isMobileApp
                      ? "min-w-0 whitespace-nowrap px-3 py-2 text-xs"
                      : "min-w-40 px-4 py-2.5 text-sm",
                    tab === "messages"
                      ? "border-zinc-200 bg-zinc-100 text-zinc-900"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  Messages
                </button>
                <button
                  type="button"
                  onClick={() => setTabAndRoute("testing")}
                  aria-current={tab === "testing" ? "page" : undefined}
                  className={classNames(
                    "flex-1 rounded-2xl border font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60",
                    isMobileApp
                      ? "min-w-0 whitespace-nowrap px-3 py-2 text-xs"
                      : "min-w-40 px-4 py-2.5 text-sm",
                    tab === "testing"
                      ? "border-zinc-200 bg-zinc-100 text-zinc-900"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  Testing
                </button>
                <button
                  type="button"
                  onClick={() => setTabAndRoute("settings")}
                  aria-current={tab === "settings" ? "page" : undefined}
                  className={classNames(
                    "flex-1 rounded-2xl border font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60",
                    isMobileApp
                      ? "min-w-0 whitespace-nowrap px-3 py-2 text-xs"
                      : "min-w-40 px-4 py-2.5 text-sm",
                    tab === "settings"
                      ? "border-zinc-200 bg-zinc-100 text-zinc-900"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  Settings
                </button>
                </div>
              ) : null}

              {tab === "messages" ? (
                <div className="mt-4">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Activity</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {messagesActivityFilter === "manual" ? (
                          <button
                            type="button"
                            onClick={() => setManualEnrollModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-2xl bg-sky-100 px-3 py-2 text-xs font-semibold text-(--color-brand-blue) hover:bg-sky-200"
                          >
                            <span className="h-3.5 w-3.5">
                              <IconMessages />
                            </span>
                            <span>Enroll manually</span>
                          </button>
                        ) : null}
                        <div className="flex flex-wrap gap-2 text-xs font-semibold">
                          {([
                            { k: "all", label: "All" },
                            { k: "manual", label: "Manual" },
                            { k: "audience", label: "Automated" },
                          ] as const).map((x) => (
                            <button
                              key={x.k}
                              type="button"
                              onClick={() => setMessagesActivityFilter(x.k)}
                              className={classNames(
                                "rounded-full px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30",
                                messagesActivityFilter === x.k
                                  ? "bg-sky-100 text-(--color-brand-blue)"
                                  : "bg-zinc-100/70 text-zinc-700 hover:bg-zinc-100",
                              )}
                            >
                              {x.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {([
                        { key: "QUEUED", label: "Queued" },
                        { key: "ACTIVE", label: "Active" },
                        { key: "FAILED", label: "Failed" },
                        { key: "SKIPPED", label: "Skipped" },
                      ] as const).map((s) => (
                        <span
                          key={s.key}
                          className={"rounded-full px-2 py-0.5 font-semibold " + activityPillClass(s.key)}
                        >
                          {s.label}: {Number(displayMessagesCountsByStatus[s.key] || 0)}
                        </span>
                      ))}

                      {([
                        { key: "MANUAL", label: "Manual" },
                        { key: "TAG", label: "Tag" },
                        { key: "INBOUND", label: "Inbound" },
                      ] as const).map((s) => (
                        <span
                          key={s.key}
                          className={"rounded-full px-2 py-0.5 font-semibold " + manualSourcePillClass(s.key)}
                        >
                          {s.label}: {Number(displayMessagesCountsBySource[s.key] || 0)}
                        </span>
                      ))}
                    </div>

                    {(() => {
                      if (!filteredMessagesActivityRows.length) {
                        return <div className="mt-4 text-xs text-zinc-500">No activity yet.</div>;
                      }

                      return (
                        <div className="relative isolate mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                          <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_auto_2.5rem] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-500">
                            <div>Name</div>
                            <div>Date</div>
                            <div>Status</div>
                            <div />
                          </div>
                          <div className="max-h-90 overflow-y-auto bg-white">
                            {pagedMessagesActivityRows.map((e) => {
                              const who =
                                (e.contact?.name && String(e.contact.name).trim()) ||
                                (e.contact?.phone && String(e.contact.phone).trim()) ||
                                (e.contact?.email && String(e.contact.email).trim()) ||
                                "Unknown contact";
                              const when = e.updatedAtIso || e.createdAtIso;
                              const err = sanitizeClientErrorText(e.lastError || e.replyLastError);
                              const src = String(e.source || "TAG").toUpperCase();
                              const transcriptPreview = isSeededMessageRowId(e.id)
                                ? latestSeededMessagePreview(e)
                                : e.threadId
                                  ? "Conversation transcript available in details."
                                  : null;
                              return (
                                <div key={e.id} className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_auto_2.5rem] gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0 md:items-center">
                                  <button type="button" onClick={() => openMessageActivityDetail(e)} className="min-w-0 text-left">
                                    <div className="truncate text-sm font-semibold text-zinc-900 hover:text-(--color-brand-blue)">{who}</div>
                                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                                      <span>{src === "MANUAL" ? "Manual" : "Automated"}</span>
                                      {e.threadId ? <span className="truncate">Thread: {e.threadId}</span> : null}
                                    </div>
                                    {transcriptPreview ? <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{transcriptPreview}</div> : null}
                                    {err ? <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{err}</div> : null}
                                  </button>
                                  <div className="text-sm text-zinc-600">{formatWhen(when)}</div>
                                  <div>
                                    <span className={"inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold " + badgeClass(e.status).replace(/border-[^\s]+/g, "").trim()}>
                                      {String(e.status || "UNKNOWN").toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="flex justify-end" data-messages-activity-menu-root="true">
                                    <button type="button" onClick={(event) => toggleMessagesActivityMenu(event, e.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200" aria-label="Open row actions">
                                      <span aria-hidden="true" className="text-lg leading-none">⋯</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
                            <div>Showing {pagedMessagesActivityRows.length} of {filteredMessagesActivityRows.length}</div>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setMessagesActivityPage((current) => Math.max(0, current - 1))} disabled={messagesActivityPage === 0} className={classNames("rounded-2xl px-3 py-1.5 font-semibold", messagesActivityPage === 0 ? "bg-zinc-200 text-zinc-500" : "bg-white text-zinc-700 hover:bg-zinc-100")}>Back</button>
                              <button type="button" onClick={() => setMessagesActivityPage((current) => Math.min(messagesActivityPageCount - 1, current + 1))} disabled={messagesActivityPage >= messagesActivityPageCount - 1} className={classNames("rounded-2xl px-3 py-1.5 font-semibold", messagesActivityPage >= messagesActivityPageCount - 1 ? "bg-zinc-200 text-zinc-500" : "bg-white text-zinc-700 hover:bg-zinc-100")}>Next</button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : null}

              {tab === "calls" ? (
                <div className="mt-4">
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Activity</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {callsActivityFilter === "manual" ? (
                          <button
                            type="button"
                            onClick={() => setManualCallModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-2xl bg-sky-100 px-3 py-2 text-xs font-semibold text-(--color-brand-blue) hover:bg-sky-200"
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.86.3 1.7.54 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.06a2 2 0 0 1 2.11-.45c.8.24 1.64.42 2.5.54A2 2 0 0 1 22 16.92z" />
                            </svg>
                            <span>Trigger manually</span>
                          </button>
                        ) : null}
                        <div className="flex flex-wrap gap-2 text-xs font-semibold">
                          {([
                            { k: "all", label: "All" },
                            { k: "manual", label: "Manual" },
                            { k: "audience", label: "Automated" },
                          ] as const).map((x) => (
                            <button
                              key={x.k}
                              type="button"
                              onClick={() => setCallsActivityFilter(x.k)}
                              className={classNames(
                                "rounded-full px-3 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30",
                                callsActivityFilter === x.k
                                  ? "bg-sky-100 text-(--color-brand-blue)"
                                  : "bg-zinc-100/70 text-zinc-700 hover:bg-zinc-100",
                              )}
                            >
                              {x.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {[
                        { label: "Queued", value: visibleCallActivityCounts.queued, cls: badgeClass("QUEUED") },
                        { label: "Calling", value: visibleCallActivityCounts.calling, cls: badgeClass("CALLING") },
                        { label: "Completed", value: visibleCallActivityCounts.completed, cls: "bg-emerald-50 text-emerald-700" },
                        { label: "Failed", value: visibleCallActivityCounts.failed, cls: "bg-red-50 text-red-700" },
                        { label: "Manual", value: visibleCallActivityCounts.manual, cls: "bg-zinc-100 text-zinc-700" },
                        { label: "Automated", value: visibleCallActivityCounts.automated, cls: "bg-violet-50 text-violet-700" },
                      ].map((x) => (
                        <span key={x.label} className={"rounded-full px-2 py-0.5 font-semibold " + x.cls.replace(/border-[^\s]+/g, "").trim()}>
                          {x.label}: {x.value}
                        </span>
                      ))}
                    </div>

                    {filteredCallActivityRows.length ? (
                      <div className="relative isolate mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                        <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_auto_2.5rem] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-500">
                          <div>Name</div>
                          <div>Date</div>
                          <div>Status</div>
                          <div />
                        </div>
                        <div className="max-h-90 overflow-y-auto bg-white">
                          {pagedCallActivityRows.map((row) => {
                            const who =
                              (row.contact?.name && String(row.contact.name).trim()) ||
                              (row.contact?.phone && String(row.contact.phone).trim()) ||
                              (row.contact?.email && String(row.contact.email).trim()) ||
                              "Unknown contact";
                            const when = row.completedAtIso || row.updatedAtIso || row.createdAtIso;
                            const err = sanitizeClientErrorText(row.lastError);
                            const transcriptPreview = compactPreviewText(row.transcriptText, 132);
                            return (
                              <div key={row.id} className="border-b border-zinc-100 px-4 py-3 last:border-b-0">
                                <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_auto_2.5rem] gap-3 md:items-center">
                                  <button type="button" onClick={() => void openCallActivityDetail(row.id)} className="min-w-0 text-left">
                                    <div className="truncate text-sm font-semibold text-zinc-900 hover:text-(--color-brand-blue)">{who}</div>
                                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                                      <span>{row.source === "MANUAL" ? "Manual" : "Automated"}</span>
                                      {row.transcriptText ? <span>Transcript</span> : null}
                                    </div>
                                    {transcriptPreview ? <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{transcriptPreview}</div> : null}
                                    {err ? <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{err}</div> : null}
                                  </button>
                                  <div className="text-sm text-zinc-600">{formatWhen(when)}</div>
                                  <div>
                                    <span className={"inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold " + badgeClass(row.status).replace(/border-[^\s]+/g, "").trim()}>
                                      {String(row.status || "UNKNOWN").toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="flex justify-end" data-calls-activity-menu-root="true">
                                    <button type="button" onClick={(event) => toggleCallsActivityMenu(event, row.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200" aria-label="Open row actions">
                                      <span aria-hidden="true" className="text-lg leading-none">⋯</span>
                                    </button>
                                  </div>
                                </div>
                                {row.nextCallAtIso ? <div className="mt-1 text-[11px] text-zinc-500">Next call: {formatWhen(row.nextCallAtIso)}</div> : null}
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
                          <div>Showing {pagedCallActivityRows.length} of {filteredCallActivityRows.length}</div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setCallsActivityPage((current) => Math.max(0, current - 1))} disabled={callsActivityPage === 0} className={classNames("rounded-2xl px-3 py-1.5 font-semibold", callsActivityPage === 0 ? "bg-zinc-200 text-zinc-500" : "bg-white text-zinc-700 hover:bg-zinc-100")}>Back</button>
                            <button type="button" onClick={() => setCallsActivityPage((current) => Math.min(callsActivityPageCount - 1, current + 1))} disabled={callsActivityPage >= callsActivityPageCount - 1} className={classNames("rounded-2xl px-3 py-1.5 font-semibold", callsActivityPage >= callsActivityPageCount - 1 ? "bg-zinc-200 text-zinc-500" : "bg-white text-zinc-700 hover:bg-zinc-100")}>Next</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-zinc-500">No activity yet.</div>
                    )}
                  </div>
                </div>
              ) : null}

              {tab === "testing" ? (
                <div className={classNames("mt-5 flex min-h-0 h-full flex-1 flex-col overflow-hidden", isMobileApp ? "" : "") }>
                  <div
                    className={classNames(
                      "grid min-h-0 h-full flex-1 grid-cols-1",
                      isMobileApp ? "gap-4" : "xl:max-w-none xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-stretch xl:gap-0",
                    )}
                  >
                    <div className={classNames(isMobileApp ? "rounded-none border border-zinc-200 bg-white p-5 shadow-sm" : "flex min-h-0 h-full flex-col overflow-hidden rounded-none border border-zinc-200 bg-white p-5 shadow-sm")}>
                      <div className={classNames(isMobileApp ? "" : "flex min-h-0 flex-1 flex-col px-0 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]")}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Calls testing</div>
                          <div className="mt-0.5 text-xs text-zinc-600">This connects to your live calls agent so you can test voice behavior before going live.</div>
                        </div>
                        {showCallsTestingSyncButton ? (
                          <button
                            type="button"
                            className={classNames(
                              "rounded-2xl px-4 py-2 text-xs font-semibold transition-colors duration-150",
                              callsSyncDisabled ? "bg-zinc-200 text-zinc-600" : "bg-brand-blue/12 text-(--color-brand-blue) hover:bg-brand-blue/18",
                            )}
                            onClick={() => void syncCallsAgent()}
                            disabled={callsSyncDisabled}
                            title={callsManualActive ? "Sync is disabled while a manual Calls agent ID is set" : !callsAgentSyncRequired && callsEffectiveAgentId ? "Calls agent is already synced" : "Ensure the agent is created or re-synced before testing"}
                          >
                            {callsSyncBusy ? "Syncing…" : "Sync first"}
                          </button>
                        ) : null}
                      </div>

                      {callsEffectiveAgentId ? (
                        <div className="mt-4 min-h-0 flex-1">
                          <InlineElevenLabsAgentTester agentId={callsEffectiveAgentId} className="flex h-full min-h-160 flex-col" />
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600">No calls agent yet. Sync the calls agent first, then test here.</div>
                      )}
                      </div>
                    </div>

                    <div className={classNames(isMobileApp ? "rounded-none border border-zinc-200 bg-white p-5 shadow-sm" : "flex min-h-0 h-full flex-col overflow-hidden rounded-none border border-zinc-200 bg-white p-5 shadow-sm xl:border-l-0")}>
                      <div className={classNames(isMobileApp ? "" : "flex min-h-0 flex-1 flex-col px-0 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]")}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Messaging</div>
                          <div className="mt-0.5 text-xs text-zinc-600">Simulates what your outbound messaging agent would reply to in a thread.</div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <div className="w-40">
                            <PortalListboxDropdown
                              value={messagesTestChannel}
                              options={[
                                { value: "sms", label: "SMS" },
                                { value: "email", label: "Email" },
                              ]}
                              onChange={(v) => setMessagesTestChannel(v as any)}
                            />
                          </div>

                          <button
                            type="button"
                            className="rounded-2xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                            onClick={resetMessagesTestThread}
                            disabled={messagesTestBusy}
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3">
                        {messagesTestThread.length ? (
                          <div className="space-y-2">
                            {messagesTestThread.map((m) => {
                              const isUser = m.role === "user";
                              return (
                                <div key={m.id} className={classNames("flex", isUser ? "justify-end" : "justify-start")}>
                                  <div className={classNames("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", isUser ? "bg-brand-ink text-white" : "bg-zinc-100 text-zinc-900")}>
                                    <div className="text-[11px] font-semibold opacity-70">{isUser ? "You" : "Agent"}</div>
                                    <div className="mt-1">{m.text}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex h-full min-h-32 items-center justify-center">
                            <div className="max-w-[18rem] text-center text-[13px] text-zinc-600">
                              <div className="font-semibold text-[13px] text-zinc-800">Start a test conversation</div>
                              <div className="mt-1 text-[11px] text-zinc-500">Click Reset to load the saved first message or a preview opener, then send a reply.</div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 grid shrink-0 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <textarea
                          value={messagesTestInput}
                          onChange={(e) => setMessagesTestInput(e.target.value)}
                          rows={3}
                          placeholder={messagesTestChannel === "sms" ? "Customer: Hey, do you have pricing?" : "Customer: Hi, I’m interested in your service…"}
                          className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={messagesTestBusy || !messagesTestInput.trim()}
                          onClick={() => void sendMessagesTestUserText()}
                          className={classNames(
                            "h-11 rounded-2xl px-4 py-2 text-sm font-semibold transition-colors duration-150 sm:self-end",
                            messagesTestBusy || !messagesTestInput.trim() ? "bg-zinc-200 text-zinc-600" : "bg-brand-blue/12 text-(--color-brand-blue) hover:bg-brand-blue/18",
                          )}
                        >
                          {messagesTestBusy ? "Replying…" : "Send"}
                        </button>
                      </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === "settings" ? (
                <div className="mt-5 grid grid-cols-1 gap-5">
                  {settingsTab === "calls" && !voiceToolsApiKeyConfigured ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                      Calls agent sync is not available for this account.
                    </div>
                  ) : null}

                  {settingsTab === "calls" ? (
                    <>
                      <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-zinc-900">Calls agent</div>
                            <div className="mt-1 text-xs text-zinc-600">Used for outbound calls in this campaign.</div>
                            <div className={classNames("mt-2 text-[11px] text-zinc-600", callsAgentSyncRequired ? "sticky top-2 z-20 inline-flex items-center gap-2 self-start rounded-full bg-white/95 px-2 py-1 backdrop-blur" : "") }>
                              {callsAgentSyncRequired ? (
                                <span className="inline-flex items-center rounded-full bg-brand-blue/12 px-2 py-0.5 text-[10px] font-semibold text-(--color-brand-blue)">Sync required</span>
                              ) : callsAgentSyncedAtIso ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200" title={`Synced ${formatWhen(callsAgentSyncedAtIso)}`}>Synced</span>
                              ) : null}
                              {callsAgentSyncedAtIso ? <span className="ml-2 text-[10px] text-zinc-500">{formatWhen(callsAgentSyncedAtIso)}</span> : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={callsSyncDisabled}
                              onClick={syncCallsAgent}
                              className={classNames("rounded-2xl px-4 py-2 text-xs font-semibold transition-colors duration-150", callsSyncDisabled ? "bg-zinc-200 text-zinc-600" : "bg-brand-blue/12 text-(--color-brand-blue) hover:bg-brand-blue/18")}
                            >
                              {callsSyncBusy ? "Syncing…" : !callsAgentSyncRequired && callsEffectiveAgentId ? "Calls agent synced" : "Sync calls agent"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                            <div className="text-xs font-semibold text-zinc-700">Voice</div>
                            <div className="mt-1 text-[11px] text-zinc-600">Pick a voice for the calls agent. Changes apply after you sync the calls agent.</div>

                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <div className="text-xs font-semibold text-zinc-700">Selected voice</div>
                                <PortalListboxDropdown<string>
                                  value={selected.voiceId ?? ""}
                                  onChange={(voiceId) => {
                                    const v = String(voiceId || "").trim();
                                    setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, voiceId: v || null } : c)));
                                    updateCampaign({ voiceId: v || null });
                                  }}
                                  disabled={busy}
                                  placeholder="Default voice"
                                  options={[{ value: "", label: "Default voice", hint: "" }, ...voiceLibraryVoices.map((v) => {
                                    const cat = String(v.category || "").trim();
                                    const showCat = Boolean(cat) && !/^pre[-\s]?made$/i.test(cat);
                                    return { value: v.id, label: showCat ? `${v.name} (${cat})` : v.name, hint: v.description || "" };
                                  })]}
                                  renderOptionRight={(opt) => {
                                    if (!opt.value) return null;
                                    const isBusy = voicePreviewBusyVoiceId === opt.value;
                                    const canClick = !busy && !voicePreviewBusyVoiceId;
                                    return (
                                      <span
                                        role="button"
                                        tabIndex={canClick ? 0 : -1}
                                        aria-label={isBusy ? "Generating preview" : "Play preview"}
                                        title={isBusy ? "Generating…" : "Play preview"}
                                        className={classNames("inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold", canClick ? "bg-white/15 hover:bg-white/25" : "opacity-60")}
                                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!canClick) return; void playVoicePreview(opt.value); }}
                                        onKeyDown={(e) => { if (!canClick) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); void playVoicePreview(opt.value); } }}
                                      >
                                        {isBusy ? "…" : "▶"}
                                      </span>
                                    );
                                  }}
                                />
                                <div className="mt-1 text-[11px] text-zinc-500">{selected.voiceId?.trim() ? "Click ▶ next to a voice to preview." : "Using the default voice."}</div>
                              </div>
                              <div>
                                <audio ref={voicePreviewAudioRef} controls={voicePreviewShowControls} className={voicePreviewShowControls ? "mt-7 w-full" : "hidden"} preload="none" />
                              </div>
                            </div>

                            {renderCallsAudienceAndAutoTag()}
                          </div>

                          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="text-xs font-semibold text-zinc-700">Tools</div>
                                <div className="mt-1 text-[11px] text-zinc-600">Recommended keeps the default call tools on.</div>
                              </div>
                              <PortalListboxDropdown
                                value={callsToolsPreset}
                                onChange={(preset) => {
                                  const nextPreset = preset as "none" | "recommended" | "all" | "custom";
                                  setCallsToolsPreset(nextPreset);
                                  if (nextPreset === "custom") return;
                                  const next = toolKeysForPreset(nextPreset);
                                  setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), toolKeys: next } } : c));
                                  setCallsAgentSyncRequired(true);
                                  setCallsAgentSyncedAtIso(null);
                                }}
                                disabled={callsSaving}
                                options={[
                                  { value: "recommended", label: "Recommended" },
                                  { value: "all", label: "All" },
                                  { value: "none", label: "None" },
                                  { value: "custom", label: "Custom" },
                                ]}
                                className="min-w-40"
                              />
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-2 pr-1">
                              {voiceTools.length === 0 ? (
                                <div className="text-[11px] text-zinc-500">No tools are available yet.</div>
                              ) : (
                                voiceTools.map((t) => {
                                  const enabled = selectedToolKeys.includes(t.key);
                                  const configured = Boolean(t.toolId);
                                  return (
                                    <label key={t.key} className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2" title={t.description || t.label}>
                                      <span className="min-w-0">
                                        <div className="truncate text-xs font-semibold text-zinc-800">{t.label}</div>
                                        <div className="mt-0.5 text-[11px] text-zinc-500">{t.description || ""}{!configured && voiceToolsApiKeyConfigured ? " (Will resolve on sync)" : ""}</div>
                                      </span>
                                      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center">
                                        <input
                                          type="checkbox"
                                          className="peer sr-only"
                                          disabled={callsSaving}
                                          checked={enabled}
                                          onChange={(e) => {
                                            const set = new Set(selectedToolKeys);
                                            if (e.target.checked) set.add(t.key); else set.delete(t.key);
                                            const next = Array.from(set);
                                            setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), toolKeys: next } } : c));
                                            setCallsAgentSyncRequired(true);
                                            setCallsAgentSyncedAtIso(null);
                                          }}
                                        />
                                        <span className="absolute inset-0 rounded-full border border-white/70 bg-zinc-200/80 transition peer-checked:bg-brand-blue/75 peer-disabled:opacity-60" />
                                        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_8px_20px_rgba(15,23,42,0.14)] transition peer-checked:translate-x-5 peer-disabled:opacity-80" />
                                      </span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-6">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Generate</div>
                              <div className="mt-1 text-[11px] text-zinc-600">Paste quick context and generate goal, personality, tone, environment, guard rails, and first message.</div>
                            </div>
                            <button type="button" disabled={generateBusy} onClick={() => void generateAgentConfig("calls")} className={classNames("inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold", generateBusy ? "bg-zinc-200 text-zinc-600" : "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) text-white shadow-sm hover:opacity-90")}>
                              <AiSparkIcon className="h-3.5 w-3.5" />
                              <span>{generateBusy ? "Generating…" : "Generate"}</span>
                            </button>
                          </div>
                          <textarea value={callsGenerateContext} onChange={(e) => { setCallsGenerateContext(e.target.value); setCallsContextReport(null); }} rows={3} placeholder="What do you sell, who are you targeting, what outcome do you want, any do/don'ts…" className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                          <OutboundContextInsightCard report={callsContextReport} />
                        </div>

                        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Booking handoff</div>
                              <div className="mt-1 text-[11px] text-zinc-600">Let the calls agent collect booking details and include required calendar intake questions in the prompt.</div>
                            </div>
                            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                              <span>{selected.bookingConfig?.enabled ? "On" : "Off"}</span>
                              <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                                <input
                                  type="checkbox"
                                  className="peer sr-only"
                                  checked={Boolean(selected.bookingConfig?.enabled)}
                                  onChange={(e) => {
                                    const enabled = e.target.checked;
                                  const fallbackCalendarId = selected.bookingConfig?.calendarId || bookingCalendars[0]?.id || null;
                                  setCampaigns((prev) =>
                                    prev.map((campaign) =>
                                      campaign.id === selected.id
                                        ? { ...campaign, bookingConfig: { enabled, calendarId: enabled ? fallbackCalendarId : campaign.bookingConfig?.calendarId || null } }
                                        : campaign,
                                    ),
                                  );
                                  void updateCampaign({ bookingConfig: { enabled, calendarId: enabled ? fallbackCalendarId : selected.bookingConfig?.calendarId || null } });
                                  }}
                                />
                                <span className="absolute inset-0 rounded-full border border-white/70 bg-zinc-200/80 transition peer-checked:bg-brand-blue/75" />
                                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_8px_20px_rgba(15,23,42,0.14)] transition peer-checked:translate-x-5" />
                              </span>
                            </label>
                          </div>

                          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Calendar</div>
                              <PortalListboxDropdown<string>
                                value={selected.bookingConfig?.calendarId ?? ""}
                                onChange={(calendarId) => {
                                  const nextCalendarId = String(calendarId || "").trim() || null;
                                  setCampaigns((prev) =>
                                    prev.map((campaign) =>
                                      campaign.id === selected.id
                                        ? { ...campaign, bookingConfig: { ...(campaign.bookingConfig ?? { enabled: false, calendarId: null }), calendarId: nextCalendarId } }
                                        : campaign,
                                    ),
                                  );
                                  void updateCampaign({ bookingConfig: { ...(selected.bookingConfig ?? { enabled: false, calendarId: null }), calendarId: nextCalendarId } });
                                }}
                                disabled={!selected.bookingConfig?.enabled || bookingCalendars.length === 0}
                                options={[
                                  { value: "", label: bookingCalendars.length ? "Pick a calendar" : "No booking calendars yet" },
                                  ...bookingCalendars.map((calendar) => ({ value: calendar.id, label: calendar.title, hint: calendar.meetingLocation || "" })),
                                ]}
                              />
                            </div>
                            <div className="rounded-2xl bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
                              {selectedBookingCalendar
                                ? `Prompt uses ${selectedBookingCalendar.title}${selectedBookingCalendar.meetingLocation ? ` • ${selectedBookingCalendar.meetingLocation}` : ""}`
                                : selected.bookingConfig?.enabled
                                  ? "Pick a calendar to add booking instructions to the agent prompt."
                                  : "Turn this on when this campaign should gather booking details."}
                            </div>
                          </div>
                        </div>

                        <div className="mt-6">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold text-zinc-700">First message</div>
                            <button type="button" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50" onClick={() => openVariablePicker("calls_first")}>Insert variable</button>
                          </div>
                          <input ref={callsFirstMessageRef} value={selected.voiceAgentConfig?.firstMessage ?? ""} onChange={(e) => { const firstMessage = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), firstMessage } } : c)); }} onBlur={() => updateCampaign({ voiceAgentConfig: { firstMessage: (selected.voiceAgentConfig?.firstMessage ?? "").trim() } })} placeholder="Hi, this is …" className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                        </div>

                        <div className="mt-6">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="text-xs font-semibold text-zinc-700">System prompt</div>
                            <button type="button" onClick={() => setKnowledgeBaseModalKind("calls")} className="rounded-2xl bg-brand-blue/12 px-4 py-2 text-xs font-semibold text-(--color-brand-blue) hover:bg-brand-blue/18">{hasKnowledgeBaseContent(selected.knowledgeBase) ? "Manage knowledge base" : "Create knowledge base"}</button>
                          </div>
                          <div className="mt-2">{renderKnowledgeBaseMeta("calls")}</div>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div><div className="text-xs font-semibold text-zinc-700">Goal</div><textarea value={selected.voiceAgentConfig?.goal ?? ""} onChange={(e) => { const goal = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), goal } } : c)); }} onBlur={() => updateCampaign({ voiceAgentConfig: { goal: (selected.voiceAgentConfig?.goal ?? "").trim() } })} rows={4} className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" /></div>
                            <div><div className="text-xs font-semibold text-zinc-700">Personality</div><textarea value={selected.voiceAgentConfig?.personality ?? ""} onChange={(e) => { const personality = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), personality } } : c)); }} onBlur={() => updateCampaign({ voiceAgentConfig: { personality: (selected.voiceAgentConfig?.personality ?? "").trim() } })} rows={4} className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" /></div>
                            <div><div className="text-xs font-semibold text-zinc-700">Tone</div><textarea value={selected.voiceAgentConfig?.tone ?? ""} onChange={(e) => { const tone = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), tone } } : c)); }} onBlur={() => updateCampaign({ voiceAgentConfig: { tone: (selected.voiceAgentConfig?.tone ?? "").trim() } })} rows={4} className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" /></div>
                            <div><div className="text-xs font-semibold text-zinc-700">Environment</div><textarea value={selected.voiceAgentConfig?.environment ?? ""} onChange={(e) => { const environment = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), environment } } : c)); }} onBlur={() => updateCampaign({ voiceAgentConfig: { environment: (selected.voiceAgentConfig?.environment ?? "").trim() } })} rows={4} className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" /></div>
                            <div className="sm:col-span-2"><div className="text-xs font-semibold text-zinc-700">Guard rails</div><textarea value={selected.voiceAgentConfig?.guardRails ?? ""} onChange={(e) => { const guardRails = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), guardRails } } : c)); }} onBlur={() => updateCampaign({ voiceAgentConfig: { guardRails: (selected.voiceAgentConfig?.guardRails ?? "").trim() } })} rows={4} className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" /></div>
                          </div>
                        </div>

                        <div className="mt-6">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Advanced</div>
                              <div className="mt-1 text-[11px] text-zinc-600">Optional manual override. When set, Sync applies changes to this agent ID.</div>
                            </div>
                            {callsManualActive ? <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">Manual override active</span> : null}
                          </div>
                          <div className="mt-3">
                            <div className="text-xs font-semibold text-zinc-700">Manual agent ID</div>
                            <input value={selected.manualVoiceAgentId ?? ""} onChange={(e) => { const manualVoiceAgentId = e.target.value; setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, manualVoiceAgentId } : c))); }} onBlur={() => updateCampaign({ manualVoiceAgentId: (selected.manualVoiceAgentId ?? "").trim() })} placeholder="Paste an agent ID (support-provided)" className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                            <div className="mt-1 text-[11px] text-zinc-500">Effective agent ID: {callsEffectiveAgentId || "(none)"}</div>
                          </div>
                        </div>

                        <div className="mt-6 flex flex-wrap items-center justify-start gap-3">
                          <button
                            type="button"
                              disabled={callsSaving || (!callsAgentDirty && !callsAgentSyncRequired)}
                            onClick={() => void saveCallsAgentSettings()}
                              className={classNames("rounded-2xl border px-4 py-2 text-xs font-semibold", callsSaving || (!callsAgentDirty && !callsAgentSyncRequired) ? "border-zinc-200 bg-zinc-200 text-zinc-600" : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200")}
                          >
                              {callsSaving ? "Saving…" : callsAgentDirty || callsAgentSyncRequired ? "Save" : "Saved"}
                          </button>
                          <button type="button" onClick={() => setDeleteCampaignConfirmOpen(true)} className="rounded-2xl bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">Delete campaign</button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-zinc-900">Messages agent</div>
                            <div className="mt-1 text-xs text-zinc-600">Used for SMS and email outreach in this campaign.</div>
                            <div className={classNames("mt-2 text-[11px] text-zinc-600", messagesAgentSyncRequired ? "sticky top-2 z-20 inline-flex items-center gap-2 self-start rounded-full bg-white/95 px-2 py-1 backdrop-blur" : "") }>
                              {messagesAgentSyncRequired ? <span className="inline-flex items-center rounded-full bg-brand-blue/12 px-2 py-0.5 text-[10px] font-semibold text-(--color-brand-blue)">Sync required</span> : messagesAgentSyncedAtIso ? <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200" title={`Synced ${formatWhen(messagesAgentSyncedAtIso)}`}>Synced</span> : null}
                              {messagesAgentSyncedAtIso ? <span className="ml-2 text-[10px] text-zinc-500">{formatWhen(messagesAgentSyncedAtIso)}</span> : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" disabled={messagesSyncDisabled} onClick={syncMessagesAgent} className={classNames("rounded-2xl px-4 py-2 text-xs font-semibold transition-colors duration-150", messagesSyncDisabled ? "bg-zinc-200 text-zinc-600" : "bg-brand-blue/12 text-(--color-brand-blue) hover:bg-brand-blue/18")}>{messagesSyncBusy ? "Syncing…" : !messagesAgentSyncRequired && messagesEffectiveAgentId ? "Messages agent synced" : "Sync messages agent"}</button>
                          </div>
                        </div>

                        <div className="mt-6">{renderMessagesAudienceAndAutoTag()}</div>

                        <div className="mt-6">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Generate</div>
                              <div className="mt-1 text-[11px] text-zinc-600">Paste quick context and generate goal, personality, tone, environment, guard rails, and first message.</div>
                            </div>
                            <button type="button" disabled={generateBusy} onClick={() => void generateAgentConfig("messages")} className={classNames("inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold", generateBusy ? "bg-zinc-200 text-zinc-600" : "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) text-white shadow-sm hover:opacity-90")}><AiSparkIcon className="h-3.5 w-3.5" /><span>{generateBusy ? "Generating…" : "Generate"}</span></button>
                          </div>
                          <textarea value={messagesGenerateContext} onChange={(e) => { setMessagesGenerateContext(e.target.value); setMessagesContextReport(null); }} rows={3} placeholder="What do you sell, who are you targeting, what outcome do you want, any do/don'ts…" className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                          <OutboundContextInsightCard report={messagesContextReport} />
                        </div>

                        <div className="mt-6">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold text-zinc-700">First message</div>
                            <button type="button" className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50" onClick={() => openVariablePicker("messages_first")}>Insert variable</button>
                          </div>
                          <input ref={messagesFirstMessageRef} value={selected.chatAgentConfig?.firstMessage ?? ""} onChange={(e) => { const firstMessage = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, chatAgentConfig: { ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), firstMessage } } : c)); }} onBlur={() => updateCampaign({ chatAgentConfig: { firstMessage: (selected.chatAgentConfig?.firstMessage ?? "").trim() } })} placeholder="Hey {contact.firstName} …" className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                        </div>

                        <div className="mt-6">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="text-xs font-semibold text-zinc-700">System prompt</div>
                            <button type="button" onClick={() => setKnowledgeBaseModalKind("messages")} className="rounded-2xl bg-brand-blue/12 px-4 py-2 text-xs font-semibold text-(--color-brand-blue) hover:bg-brand-blue/18">{hasKnowledgeBaseContent(selected.messagesKnowledgeBase) ? "Manage knowledge base" : "Create knowledge base"}</button>
                          </div>
                          <div className="mt-2">{renderKnowledgeBaseMeta("messages")}</div>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div><div className="text-xs font-semibold text-zinc-700">Goal</div><textarea value={selected.chatAgentConfig?.goal ?? ""} onChange={(e) => { const goal = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, chatAgentConfig: { ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), goal } } : c)); }} onBlur={() => updateCampaign({ chatAgentConfig: { goal: (selected.chatAgentConfig?.goal ?? "").trim() } })} rows={4} className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" /></div>
                            <div><div className="text-xs font-semibold text-zinc-700">Personality</div><textarea value={selected.chatAgentConfig?.personality ?? ""} onChange={(e) => { const personality = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, chatAgentConfig: { ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), personality } } : c)); }} onBlur={() => updateCampaign({ chatAgentConfig: { personality: (selected.chatAgentConfig?.personality ?? "").trim() } })} rows={4} className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" /></div>
                            <div><div className="text-xs font-semibold text-zinc-700">Tone</div><textarea value={selected.chatAgentConfig?.tone ?? ""} onChange={(e) => { const tone = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, chatAgentConfig: { ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), tone } } : c)); }} onBlur={() => updateCampaign({ chatAgentConfig: { tone: (selected.chatAgentConfig?.tone ?? "").trim() } })} rows={4} className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" /></div>
                            <div><div className="text-xs font-semibold text-zinc-700">Environment</div><textarea value={selected.chatAgentConfig?.environment ?? ""} onChange={(e) => { const environment = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, chatAgentConfig: { ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), environment } } : c)); }} onBlur={() => updateCampaign({ chatAgentConfig: { environment: (selected.chatAgentConfig?.environment ?? "").trim() } })} rows={4} className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" /></div>
                            <div className="sm:col-span-2"><div className="text-xs font-semibold text-zinc-700">Guard rails</div><textarea value={selected.chatAgentConfig?.guardRails ?? ""} onChange={(e) => { const guardRails = e.target.value; setCampaigns((prev) => prev.map((c) => c.id === selected.id ? { ...c, chatAgentConfig: { ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), guardRails } } : c)); }} onBlur={() => updateCampaign({ chatAgentConfig: { guardRails: (selected.chatAgentConfig?.guardRails ?? "").trim() } })} rows={4} className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" /></div>
                          </div>
                        </div>

                        <div className="mt-6">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Advanced</div>
                              <div className="mt-1 text-[11px] text-zinc-600">Optional manual override. When set, Sync applies changes to this agent ID.</div>
                            </div>
                            {messagesManualActive ? <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">Manual override active</span> : null}
                          </div>
                          <div className="mt-3">
                            <div className="text-xs font-semibold text-zinc-700">Manual agent ID</div>
                            <input value={selected.manualChatAgentId ?? ""} onChange={(e) => { const manualChatAgentId = e.target.value; setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, manualChatAgentId } : c))); }} onBlur={() => updateCampaign({ manualChatAgentId: (selected.manualChatAgentId ?? "").trim() })} placeholder="Paste an agent ID (support-provided)" className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
                            <div className="mt-1 text-[11px] text-zinc-500">Effective agent ID: {messagesEffectiveAgentId || "(none)"}</div>
                          </div>
                        </div>

                        <div className="mt-6 flex flex-wrap items-center justify-start gap-3">
                          <button type="button" disabled={messagesSaving || (!messagesAgentDirty && !messagesAgentSyncRequired)} onClick={() => void saveMessagesAgentSettings()} className={classNames("rounded-2xl border px-4 py-2 text-xs font-semibold", messagesSaving || (!messagesAgentDirty && !messagesAgentSyncRequired) ? "border-zinc-200 bg-zinc-200 text-zinc-600" : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200")}>{messagesSaving ? "Saving…" : messagesAgentDirty || messagesAgentSyncRequired ? "Save" : "Saved"}</button>
                          <button type="button" onClick={() => setDeleteCampaignConfirmOpen(true)} className="rounded-2xl bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">Delete campaign</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {knowledgeBaseModalKind ? (
        (() => {
          const isCalls = knowledgeBaseModalKind === "calls";
          const activeKnowledgeBase = ensureKnowledgeBase(isCalls ? selected?.knowledgeBase ?? null : selected?.messagesKnowledgeBase ?? null);
          const syncBusy = isCalls ? knowledgeBaseSyncBusy : messagesKnowledgeBaseSyncBusy;
          const uploadBusy = isCalls ? knowledgeBaseUploadBusy : messagesKnowledgeBaseUploadBusy;
          const modalBusy = busy || syncBusy || uploadBusy;

          return (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-label={isCalls ? "Manage knowledge base" : "Manage messages knowledge base"}
              onMouseDown={() => {
                if (modalBusy) return;
                setKnowledgeBaseModalKind(null);
              }}
            >
              <LiquidGlassPopupSurface
                className="relative w-full max-w-3xl overflow-hidden rounded-4xl p-5 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
                overlayClassName="border-transparent bg-[rgba(255,255,255,0.54)] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[28px]"
                showGlass={false}
                showTopGlow={false}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-zinc-900">{isCalls ? "Knowledge base" : "Messaging knowledge base"}</div>
                    <div className="mt-1 text-sm text-zinc-600">Add a website, notes, or files. Sync saves your changes automatically, then refreshes documents.</div>
                  </div>
                  <button
                    type="button"
                    className={classNames(
                      portalGlassButtonClass,
                      "inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30 disabled:opacity-60",
                    )}
                    onClick={() => setKnowledgeBaseModalKind(null)}
                    disabled={modalBusy}
                    aria-label="Close"
                    title="Close"
                  >
                    <span aria-hidden="true" className="text-xl leading-none">×</span>
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Seed URL</div>
                    <input
                      value={activeKnowledgeBase.seedUrl}
                      onChange={(e) => updateKnowledgeBaseDraft(knowledgeBaseModalKind, { seedUrl: e.target.value })}
                      disabled={modalBusy}
                      placeholder="https://example.com"
                      className="mt-2 w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-semibold text-zinc-700">Crawl depth</div>
                      <PortalListboxDropdown<string>
                        value={String(activeKnowledgeBase.crawlDepth ?? 0)}
                        options={[{ value: "0", label: "0" }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }, { value: "5", label: "5" }]}
                        onChange={(v) => updateKnowledgeBaseDraft(knowledgeBaseModalKind, { crawlDepth: Number(v || 0) })}
                        disabled={modalBusy}
                        buttonClassName="mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm hover:bg-white"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-700">Max URLs</div>
                      <PortalListboxDropdown<string>
                        value={String(activeKnowledgeBase.maxUrls ?? 0)}
                        options={[{ value: "0", label: "0" }, { value: "25", label: "25" }, { value: "50", label: "50" }, { value: "100", label: "100" }, { value: "250", label: "250" }, { value: "500", label: "500" }, { value: "1000", label: "1000" }]}
                        onChange={(v) => updateKnowledgeBaseDraft(knowledgeBaseModalKind, { maxUrls: Number(v || 0) })}
                        disabled={modalBusy}
                        buttonClassName="mt-2 flex w-full items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm hover:bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-zinc-700">Notes</div>
                    <label className="text-[11px] text-zinc-600">
                      <input
                        type="file"
                        className="hidden"
                        disabled={modalBusy}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          e.currentTarget.value = "";
                          if (!file) return;
                          if (isCalls) {
                            void uploadKnowledgeBaseFile(file);
                          } else {
                            void uploadMessagesKnowledgeBaseFile(file);
                          }
                        }}
                      />
                      <span className={classNames("inline-flex cursor-pointer items-center rounded-xl border px-3 py-2 text-xs font-semibold", modalBusy ? "border-zinc-200 bg-zinc-200 text-zinc-600" : "border-white/60 bg-white/70 text-zinc-700 hover:bg-white")}>{uploadBusy ? "Uploading…" : "Upload file"}</span>
                    </label>
                  </div>
                  <textarea
                    value={activeKnowledgeBase.text}
                    onChange={(e) => updateKnowledgeBaseDraft(knowledgeBaseModalKind, { text: e.target.value })}
                    disabled={modalBusy}
                    rows={6}
                    placeholder="Add any important context, FAQs, pricing notes…"
                    className="mt-2 w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                  />
                </div>

                <div className="mt-4 rounded-3xl border border-white/60 bg-white/45 p-4">
                  {renderKnowledgeBaseMeta(knowledgeBaseModalKind)}
                </div>

                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={modalBusy}
                    onClick={() => {
                      void (async () => {
                        await saveKnowledgeBaseDraft(knowledgeBaseModalKind);
                        if (isCalls) {
                          await syncKnowledgeBase();
                        } else {
                          await syncMessagesKnowledgeBase();
                        }
                      })();
                    }}
                    className={classNames("rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-150", modalBusy ? "bg-zinc-200 text-zinc-600" : "bg-brand-blue/12 text-(--color-brand-blue) hover:bg-brand-blue/18")}
                  >
                    {syncBusy ? "Syncing…" : "Sync knowledge base"}
                  </button>
                </div>
              </LiquidGlassPopupSurface>
            </div>
          );
        })()
      ) : null}

      {openMessagesMenuRow && messagesActivityMenu ? (
        <div
          data-activity-floating-menu="true"
          className="fixed z-130140"
          style={{ top: `${messagesActivityMenu.top}px`, left: `${messagesActivityMenu.left}px` }}
        >
          <div className={classNames("w-44 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_54px_rgba(15,23,42,0.22)]", messagesActivityMenu.openUpwards ? "-translate-x-full -translate-y-full" : "-translate-x-full")}>
            <button type="button" onClick={() => openMessageActivityDetail(openMessagesMenuRow)} className="block w-full px-3 py-2 text-left text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Open</button>
            <button type="button" onClick={() => void deleteMessageActivity(openMessagesMenuRow)} className="block w-full px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50">Delete</button>
          </div>
        </div>
      ) : null}

      {openCallsMenuRow && callsActivityMenu ? (
        <div
          data-activity-floating-menu="true"
          className="fixed z-130140"
          style={{ top: `${callsActivityMenu.top}px`, left: `${callsActivityMenu.left}px` }}
        >
          <div className={classNames("w-40 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_54px_rgba(15,23,42,0.22)]", callsActivityMenu.openUpwards ? "-translate-x-full -translate-y-full" : "-translate-x-full")}>
            <button type="button" onClick={() => void openCallActivityDetail(openCallsMenuRow.id)} className="block w-full px-3 py-2 text-left text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Open</button>
            <button type="button" onClick={() => void deleteCallRow(openCallsMenuRow)} className="block w-full px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50">Delete</button>
          </div>
        </div>
      ) : null}

      {manualCallModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Trigger manual call"
          onMouseDown={() => {
            if (manualCallBusy) return;
            setManualCallModalOpen(false);
          }}
        >
          <LiquidGlassPopupSurface
            className="relative w-full max-w-lg overflow-hidden rounded-4xl p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            overlayClassName="border-transparent bg-[rgba(255,255,255,0.54)] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[28px]"
            showGlass={false}
            showTopGlow={false}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Trigger manually</div>
                <div className="mt-1 text-sm text-zinc-600">Type a phone number and start a live manual test call.</div>
              </div>
              <button
                type="button"
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30 disabled:opacity-60",
                )}
                onClick={() => setManualCallModalOpen(false)}
                disabled={manualCallBusy}
                aria-label="Close"
                title="Close"
              >
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-zinc-600">Phone number (E.164)</div>
              <input
                value={manualCallTo}
                onChange={(e) => setManualCallTo(e.target.value)}
                placeholder="+15551234567"
                autoFocus
                className="mt-2 w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
              />
              <div className="mt-2 text-[11px] text-zinc-500">Recording and transcript usually appear 1-2 minutes after the call ends.</div>
            </div>

            {manualCall ? (
              <div className="mt-4 rounded-3xl border border-white/60 bg-white/45 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Live status</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">{manualCall.toNumberE164}</div>
                    <div className="mt-1 text-xs text-zinc-600">{formatWhen(manualCall.updatedAtIso || manualCall.createdAtIso)}</div>
                  </div>
                  <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + activityPillClass(manualCall.status)}>
                    {String(manualCall.status || "UNKNOWN").toUpperCase()}
                  </span>
                </div>
                {manualCall.lastError ? <div className="mt-2 text-xs text-red-700">{sanitizeClientErrorText(manualCall.lastError) || manualCall.lastError}</div> : null}
                {manualCallId ? (
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      type="button"
                      disabled={manualCallSyncBusy}
                      onClick={() => void syncManualCallArtifacts(manualCallId)}
                      className={classNames(
                        "rounded-2xl px-3 py-2 text-xs font-semibold",
                        manualCallSyncBusy ? "bg-zinc-200 text-zinc-600" : "bg-sky-100 text-(--color-brand-blue) hover:bg-sky-200",
                      )}
                    >
                      {manualCallSyncBusy ? "Refreshing…" : "Refresh status"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                disabled={manualCallBusy || !manualCallTo.trim()}
                onClick={() => void startManualCall()}
                className={classNames(
                  "rounded-full px-4 py-2 text-sm font-semibold",
                  manualCallBusy || !manualCallTo.trim()
                    ? "bg-zinc-200 text-zinc-600"
                    : "bg-sky-100 text-(--color-brand-blue) hover:bg-sky-200",
                )}
              >
                {manualCallBusy ? "Calling…" : "Call"}
              </button>
            </div>
          </LiquidGlassPopupSurface>
        </div>
      ) : null}

      {manualEnrollModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Enroll manually"
          onMouseDown={() => {
            if (manualEnrollBusy) return;
            setManualEnrollModalOpen(false);
          }}
        >
          <LiquidGlassPopupSurface
            className="relative w-full max-w-2xl overflow-hidden rounded-4xl p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            overlayClassName="border-transparent bg-[rgba(255,255,255,0.54)] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[28px]"
            showGlass={false}
            showTopGlow={false}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Enroll manually</div>
                <div className="mt-1 text-sm text-zinc-600">Pick one contact and enroll them into this messaging campaign.</div>
              </div>
              <button
                type="button"
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30 disabled:opacity-60",
                )}
                onClick={() => setManualEnrollModalOpen(false)}
                disabled={manualEnrollBusy}
                aria-label="Close"
                title="Close"
              >
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <div className="text-xs font-semibold text-zinc-600">Contact</div>
                <input
                  value={manualEnrollQuery}
                  onChange={(e) => {
                    setManualEnrollQuery(e.target.value);
                    setManualEnrollSelected(null);
                  }}
                  placeholder="Search contacts by name, email, or phone…"
                  autoFocus
                  className="mt-2 w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                />

                {manualEnrollSearchBusy ? (
                  <div className="mt-2 text-xs text-zinc-500">Searching…</div>
                ) : manualEnrollQuery.trim().length >= 2 && manualEnrollResults.length ? (
                  <div className="mt-2 max-h-56 overflow-auto rounded-2xl border border-white/60 bg-white/70">
                    {manualEnrollResults.slice(0, 20).map((c) => {
                      const name = (c.name || "").trim();
                      const email = (c.email || "").trim();
                      const phone = (c.phone || "").trim();
                      const primary = name || phone || email || "Unknown";
                      const secondary = [name ? null : phone || null, email || null].filter(Boolean).join(" • ");
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className="block w-full border-b border-white/50 px-3 py-2 text-left hover:bg-white/80 last:border-b-0"
                          onClick={() => {
                            setManualEnrollSelected(c);
                            setManualEnrollResults([]);
                          }}
                        >
                          <div className="truncate text-sm font-semibold text-zinc-900">{primary}</div>
                          <div className="mt-0.5 truncate text-xs text-zinc-500">{secondary || c.id}</div>
                        </button>
                      );
                    })}
                  </div>
                ) : manualEnrollQuery.trim().length >= 2 ? (
                  <div className="mt-2 text-xs text-zinc-500">No matches.</div>
                ) : (
                  <div className="mt-2 text-xs text-zinc-500">Type at least 2 characters.</div>
                )}

                {manualEnrollSelected ? (
                  <div className="mt-3 rounded-3xl border border-white/60 bg-white/45 px-3 py-3">
                    <div className="text-xs font-semibold text-zinc-700">Selected</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">
                      {(manualEnrollSelected.name || manualEnrollSelected.phone || manualEnrollSelected.email || "Unknown").trim()}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {[manualEnrollSelected.phone, manualEnrollSelected.email].filter(Boolean).join(" • ") || manualEnrollSelected.id}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="sm:self-end">
                <div className="text-xs font-semibold text-zinc-600">Channel</div>
                <div className="mt-2">
                  <PortalListboxDropdown
                    value={manualEnrollChannelPolicy}
                    options={[
                      { value: "SMS", label: "SMS" },
                      { value: "EMAIL", label: "Email" },
                      { value: "BOTH", label: "Both (SMS if possible, else email)" },
                    ]}
                    onChange={(v) => setManualEnrollChannelPolicy(v as any)}
                    disabled={manualEnrollBusy}
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/70 px-2 py-2 text-sm font-semibold text-zinc-900 hover:bg-white focus-visible:ring-2 focus-visible:ring-zinc-300"
                  />
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  {manualEnrollChannelPolicy === "SMS"
                    ? "Sends the first message automatically via SMS."
                    : manualEnrollChannelPolicy === "EMAIL"
                      ? "Sends the first message automatically via email."
                      : "Sends the first message automatically (SMS if possible, otherwise email)."}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                disabled={manualEnrollBusy || !manualEnrollSelected?.id}
                onClick={() => void enrollContactForMessages()}
                className={classNames(
                  "rounded-full px-4 py-2 text-sm font-semibold",
                  manualEnrollBusy || !manualEnrollSelected?.id
                    ? "bg-zinc-200 text-zinc-600"
                    : "bg-sky-100 text-(--color-brand-blue) hover:bg-sky-200",
                )}
              >
                {manualEnrollBusy ? "Enrolling…" : "Enroll"}
              </button>
            </div>
          </LiquidGlassPopupSurface>
        </div>
      ) : null}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Create campaign"
          onMouseDown={() => {
            if (busy) return;
            setCreateOpen(false);
          }}
        >
          <LiquidGlassPopupSurface
            className="relative w-full max-w-md overflow-hidden rounded-4xl p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
            overlayClassName="border-transparent bg-[rgba(255,255,255,0.54)] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[28px]"
            showGlass={false}
            showTopGlow={false}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">New campaign</div>
                <div className="mt-1 text-sm text-zinc-600">Name it now or leave it blank and rename it later.</div>
              </div>
              <button
                type="button"
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30 disabled:opacity-60",
                )}
                onClick={() => setCreateOpen(false)}
                disabled={busy}
                aria-label="Close"
                title="Close"
              >
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </div>

            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                void createCampaign();
              }}
            >
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Campaign name (optional)"
                autoFocus
                className="w-full rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
              />

              <div className="mt-5 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className={classNames(
                    "rounded-full px-4 py-2 text-sm font-semibold",
                    busy ? "bg-zinc-200 text-zinc-600" : "bg-sky-100 text-(--color-brand-blue) hover:bg-sky-200",
                  )}
                >
                  {busy ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </LiquidGlassPopupSurface>
        </div>
      ) : null}

      {callDetailOpenId ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center" role="dialog" aria-modal="true" aria-label="Call details" onMouseDown={() => { if (callDetailActionBusy) return; setCallDetailOpenId(null); setCallDetail(null); }}>
          <LiquidGlassPopupSurface className="relative w-full max-w-5xl overflow-hidden rounded-4xl p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()} overlayClassName="border-transparent bg-[rgba(255,255,255,0.54)] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[28px]" showGlass={false} showTopGlow={false}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Call details</div>
                <div className="mt-1 text-sm text-zinc-600">Review the outcome, inspect the transcript, and jump into the contact record without leaving this flow.</div>
              </div>
              <button type="button" className={classNames(portalGlassButtonClass, "inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30 disabled:opacity-60")} onClick={() => { setCallDetailOpenId(null); setCallDetail(null); }} disabled={Boolean(callDetailActionBusy)} aria-label="Close" title="Close">
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </div>

            {!callDetail && callDetailLoading ? (
              <div className="flex min-h-64 items-center justify-center"><InlineSpinner label="Loading call details…" /></div>
            ) : callDetail ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="space-y-4">
                  <div className="rounded-3xl border border-white/60 bg-white/55 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        {callDetail.kind !== "manual" ? (
                          <button type="button" onClick={() => openContactDetails(callDetail.contact.id)} className="text-left text-lg font-semibold text-zinc-900 hover:text-(--color-brand-blue)">{callDetail.contact.name || callDetail.contact.phone || callDetail.contact.email || "Unknown contact"}</button>
                        ) : (
                          <div className="text-lg font-semibold text-zinc-900">{callDetail.contact.name || callDetail.contact.phone || callDetail.contact.email || "Unknown contact"}</div>
                        )}
                        <div className="mt-1 text-sm text-zinc-600">{[callDetail.contact.phone, callDetail.contact.email].filter(Boolean).join(" • ") || "No phone or email on file"}</div>
                        {callDetail.kind !== "manual" ? <div className="mt-2"><ContactTagsEditor contactId={callDetail.contact.id} tags={callDetail.contactTags} compact onChange={(next) => setCallDetail((prev) => prev ? { ...prev, contactTags: next } : prev)} /></div> : null}
                      </div>
                      <span className={"inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold " + badgeClass(callDetail.status).replace(/border-[^\s]+/g, "").trim()}>{String(callDetail.status || "UNKNOWN").toUpperCase()}</span>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-zinc-600">
                      <div><div className="text-[11px] font-semibold text-zinc-500">Date</div><div className="mt-1">{formatWhen(callDetail.completedAtIso || callDetail.updatedAtIso || callDetail.createdAtIso)}</div></div>
                      <div><div className="text-[11px] font-semibold text-zinc-500">Attempts</div><div className="mt-1">{callDetail.attemptCount}</div></div>
                      {callDetail.callSid ? <div className="sm:col-span-2"><div className="text-[11px] font-semibold text-zinc-500">CallSid</div><div className="mt-1 break-all font-mono text-xs text-zinc-700">{callDetail.callSid}</div></div> : null}
                      {callDetail.conversationId ? <div className="sm:col-span-2"><div className="text-[11px] font-semibold text-zinc-500">Conversation</div><div className="mt-1 break-all font-mono text-xs text-zinc-700">{callDetail.conversationId}</div></div> : null}
                    </div>
                    {callDetail.lastError ? <div className="mt-3 rounded-2xl bg-red-50 px-3 py-3 text-sm text-red-700">{sanitizeClientErrorText(callDetail.lastError) || callDetail.lastError}</div> : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {callDetail.kind !== "seeded" ? <button type="button" disabled={callDetailActionBusy !== null || callDetail.kind === "manual"} onClick={() => void retryCallActivity(callDetail.enrollmentId)} className={classNames("rounded-2xl px-4 py-2 text-sm font-semibold", callDetailActionBusy || callDetail.kind === "manual" ? "bg-zinc-200 text-zinc-600" : "bg-sky-100 text-(--color-brand-blue) hover:bg-sky-200")}>{callDetailActionBusy === "retry" ? "Queueing…" : callDetail.kind === "manual" ? "Manual call" : "Trigger another call"}</button> : null}
                    </div>
                    {callDetail.bookingAnalysis ? <div className="mt-4 rounded-2xl bg-sky-50 p-4 text-sm text-sky-900"><div className="flex flex-wrap items-center gap-2"><div className="font-semibold">Outcome summary</div><span className="rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-sky-800">{callDetail.bookingAnalysis.booked ? "Booked" : callDetail.bookingAnalysis.needsBooking ? "Needs booking" : "No booking signal"}</span></div>{callDetail.bookingAnalysis.summary ? <div className="mt-2 text-sky-900/80">{callDetail.bookingAnalysis.summary}</div> : null}{callDetail.bookingAnalysis.requestedTimeText ? <div className="mt-2 text-xs text-sky-800">Requested time: {callDetail.bookingAnalysis.requestedTimeText}</div> : null}</div> : null}
                  </div>

                  {callDetail && callDetailLoading ? <div className="text-xs font-semibold text-zinc-500">Refreshing the latest call details…</div> : null}
                </div>

                <div className="rounded-3xl border border-white/60 bg-white/55 p-4">
                    <div className="text-sm font-semibold text-zinc-900">Call transcript</div>
                    <div className="mt-1 text-xs text-zinc-500">{callDetail.transcriptText ? (callDetail.transcriptUpdatedAtIso ? `Updated ${formatWhen(callDetail.transcriptUpdatedAtIso)}` : "Transcript available") : callDetail.kind === "seeded" ? "Seeded preview data for this demo row." : callDetail.kind === "manual" ? "Transcript is still syncing for this manual call if the call just ended." : "Transcript is not available for this campaign enrollment yet."}</div>
                    {callDetail.transcriptText ? (
                      <div className="mt-3 max-h-128 space-y-2 overflow-y-auto">
                        {parseTranscriptTurns(callDetail.transcriptText).map((turn, index) => (
                          <div key={`${turn.label}-${index}`} className={classNames("flex", turn.speaker === "contact" ? "justify-start" : turn.speaker === "agent" ? "justify-end" : "justify-center")}>
                            <div className={classNames(
                              "max-w-[88%] rounded-2xl px-3 py-2 text-sm",
                              turn.speaker === "contact"
                                ? "bg-zinc-100 text-zinc-900"
                                : turn.speaker === "agent"
                                  ? "bg-brand-ink text-white"
                                  : "border border-white/60 bg-white/70 text-zinc-700",
                            )}>
                              <div className={classNames("text-[11px] font-semibold", turn.speaker === "contact" ? "text-zinc-500" : turn.speaker === "agent" ? "text-white/70" : "text-zinc-500")}>{turn.label}</div>
                              <div className="mt-1 whitespace-pre-wrap">{turn.text}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <div className="mt-3 rounded-2xl border border-dashed border-zinc-200 bg-white/60 px-4 py-4 text-sm text-zinc-600">No transcript is available yet for this call row.</div>}
                </div>
                <div className="lg:col-span-2 flex items-center justify-start pt-1">
                  <button type="button" disabled={callDetailActionBusy !== null} onClick={() => void deleteCallRow(callDetail)} className={classNames("rounded-2xl px-4 py-2 text-sm font-semibold", callDetailActionBusy ? "bg-zinc-200 text-zinc-600" : "bg-red-50 text-red-700 hover:bg-red-100")}>{callDetailActionBusy === "delete" ? "Deleting…" : "Delete"}</button>
                </div>
              </div>
            ) : null}
          </LiquidGlassPopupSurface>
        </div>
      ) : null}

      {messageDetailOpenId && messageDetail ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center" role="dialog" aria-modal="true" aria-label="Message details" onMouseDown={() => { setMessageDetailOpenId(null); setMessageDetail(null); }}>
          <LiquidGlassPopupSurface className="relative w-full max-w-3xl overflow-hidden rounded-4xl p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()} overlayClassName="border-transparent bg-[rgba(255,255,255,0.54)] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[28px]" showGlass={false} showTopGlow={false}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Message details</div>
                <div className="mt-1 text-sm text-zinc-600">Review the source, status, and thread details for this outreach row.</div>
              </div>
              <button type="button" className={classNames(portalGlassButtonClass, "inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30")} onClick={() => { setMessageDetailOpenId(null); setMessageDetail(null); }} aria-label="Close" title="Close">
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="rounded-3xl border border-white/60 bg-white/55 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    {messageDetail.contact?.id ? (
                      <button type="button" onClick={() => openContactDetails(messageDetail.contact?.id)} className="text-left text-lg font-semibold text-zinc-900 hover:text-(--color-brand-blue)">{messageDetail.contact?.name || messageDetail.contact?.phone || messageDetail.contact?.email || "Unknown contact"}</button>
                    ) : (
                      <div className="text-lg font-semibold text-zinc-900">{messageDetail.contact?.name || messageDetail.contact?.phone || messageDetail.contact?.email || "Unknown contact"}</div>
                    )}
                    <div className="mt-1 text-sm text-zinc-600">{[messageDetail.contact?.phone, messageDetail.contact?.email].filter(Boolean).join(" • ") || "No phone or email on file"}</div>
                    {messageDetail.contact?.id ? <div className="mt-2"><ContactTagsEditor contactId={messageDetail.contact.id} tags={messageDetailTags} compact borderlessChips onChange={setMessageDetailTags} /></div> : null}
                  </div>
                  <span className={"inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold " + badgeClass(messageDetail.status).replace(/border-[^\s]+/g, "").trim()}>{String(messageDetail.status || "UNKNOWN").toUpperCase()}</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-zinc-600">
                  <div><div className="text-[11px] font-semibold text-zinc-500">Date</div><div className="mt-1">{formatWhen(messageDetail.updatedAtIso || messageDetail.createdAtIso)}</div></div>
                  <div><div className="text-[11px] font-semibold text-zinc-500">Source</div><div className="mt-1">{String(messageDetail.source || "UNKNOWN").toUpperCase()}</div></div>
                  <div><div className="text-[11px] font-semibold text-zinc-500">Attempts</div><div className="mt-1">{messageDetail.attemptCount}</div></div>
                  <div><div className="text-[11px] font-semibold text-zinc-500">Reply attempts</div><div className="mt-1">{messageDetail.replyAttemptCount}</div></div>
                  {messageDetail.threadId ? <div className="sm:col-span-2"><div className="text-[11px] font-semibold text-zinc-500">Thread</div><div className="mt-1 break-all font-mono text-xs text-zinc-700">{messageDetail.threadId}</div></div> : null}
                </div>
                {(messageDetail.lastError || messageDetail.replyLastError) ? <div className="mt-4 rounded-2xl bg-red-50 px-3 py-3 text-sm text-red-700">{sanitizeClientErrorText(messageDetail.lastError || messageDetail.replyLastError) || messageDetail.lastError || messageDetail.replyLastError}</div> : null}
              </div>
              <div className="rounded-3xl border border-white/60 bg-white/55 p-4">
                <div className="text-sm font-semibold text-zinc-900">Conversation transcript</div>
                <div className="mt-1 text-xs text-zinc-500">Review the actual message thread for this outreach row.</div>
                {messageDetailLoading ? <div className="mt-3 text-xs font-semibold text-zinc-500">Loading messages…</div> : null}
                {messageDetailMessages.length ? (
                  <div className="mt-3 max-h-128 space-y-2 overflow-y-auto">
                    {messageDetailMessages.map((message) => {
                      const direction = String(message.direction || "").toUpperCase();
                      const isInbound = direction === "INBOUND" || direction === "IN";
                      const content = String(message.bodyText || message.subject || "").trim();
                      return (
                        <div key={message.id} className={classNames("flex", isInbound ? "justify-start" : "justify-end")}>
                          <div className={classNames("max-w-[88%] rounded-2xl px-3 py-2 text-sm", isInbound ? "bg-zinc-100 text-zinc-900" : "bg-brand-ink text-white")}>
                            <div className={classNames("text-[11px] font-semibold", isInbound ? "text-zinc-500" : "text-white/70")}>{isInbound ? "Contact" : "Agent"}</div>
                            <div className="mt-1 whitespace-pre-wrap">{content || "No message body."}</div>
                            <div className={classNames("mt-1 text-[11px]", isInbound ? "text-zinc-500" : "text-white/70")}>{formatWhen(message.createdAt)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-dashed border-zinc-200 bg-white/70 px-3 py-3 text-sm text-zinc-600">No messages are available for this row yet.</div>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-start">
              <button type="button" disabled={messageDetailActionBusy !== null} onClick={() => void deleteMessageActivity(messageDetail)} className={classNames("rounded-2xl px-4 py-2 text-sm font-semibold", messageDetailActionBusy ? "bg-zinc-200 text-zinc-600" : "bg-red-50 text-red-700 hover:bg-red-100")}>{messageDetailActionBusy === "delete" ? "Deleting…" : "Delete"}</button>
            </div>
          </LiquidGlassPopupSurface>
        </div>
      ) : null}

      <PortalContactDetailsModal
        open={contactDetailsOpen}
        contactId={contactDetailsContactId}
        onClose={() => {
          setContactDetailsOpen(false);
          setContactDetailsContactId(null);
        }}
        onContactUpdated={(next) => {
          const stableContactId = String(contactDetailsContactId || "").trim();
          if (!stableContactId) return;
          applyUpdatedContact(stableContactId, next);
        }}
        zIndex={130160}
      />

      {deleteCampaignConfirmOpen && selected ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+2rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+0.75rem)]" role="dialog" aria-modal="true" onMouseDown={() => { if (deleteCampaignBusy) return; setDeleteCampaignConfirmOpen(false); }}>
          <div className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-zinc-900">Delete campaign permanently?</div>
            <div className="mt-2 text-sm text-zinc-600">This will permanently delete {selected.name} and remove its outbound enrollments. Manual call history stays detached for safety.</div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="inline-flex items-center justify-center rounded-2xl bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-(--color-brand-blue) hover:bg-brand-blue/15 disabled:opacity-60" onClick={() => setDeleteCampaignConfirmOpen(false)} disabled={deleteCampaignBusy}>Cancel</button>
              <button type="button" className="inline-flex items-center justify-center rounded-2xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60" onClick={() => void deleteCampaign()} disabled={deleteCampaignBusy}>{deleteCampaignBusy ? "Deleting…" : "Delete campaign"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
