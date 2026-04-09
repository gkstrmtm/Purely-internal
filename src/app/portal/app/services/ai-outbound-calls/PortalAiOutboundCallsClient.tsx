"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import {
  IconCalls,
  IconMessages,
  IconSidebarSettings,
  PortalSidebarNavButton,
  portalSidebarButtonActiveClass,
  portalSidebarButtonBaseClass,
  portalSidebarButtonInactiveClass,
  portalSidebarIconActionButtonClass,
  portalSidebarIconToneBlueClass,
  portalSidebarIconToneNeutralClass,
  portalSidebarMetaTextClass,
  portalSidebarSectionStackClass,
  portalSidebarSectionTitleClass,
} from "@/app/portal/PortalServiceSidebarIcons";
import { InlineElevenLabsAgentTester } from "@/components/InlineElevenLabsAgentTester";
import { InlineSpinner } from "@/components/InlineSpinner";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalSelectDropdown } from "@/components/PortalSelectDropdown";
import { SuggestedSetupModalLauncher } from "@/components/SuggestedSetupModalLauncher";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { useToast } from "@/components/ToastProvider";
import { DEFAULT_TAG_COLORS } from "@/lib/tagColors.shared";
import { PORTAL_MESSAGE_VARIABLES } from "@/lib/portalTemplateVars";
import { DEFAULT_VOICE_AGENT_CONFIG, type VoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

type CallOutcomeTagging = {
  enabled: boolean;
  onCompletedTagIds: string[];
  onFailedTagIds: string[];
  onSkippedTagIds: string[];
};

type MessageOutcomeTagging = {
  enabled: boolean;
  onSentTagIds: string[];
  onFailedTagIds: string[];
  onSkippedTagIds: string[];
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
      warning?: string;
    }
  | { ok: false; error: string };

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

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function sanitizeClientErrorText(error?: string | null) {
  const raw = String(error || "").trim();
  if (!raw) return null;
  const brace = raw.indexOf("{");
  const bracket = raw.indexOf("[");
  const idx = [brace, bracket].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  const withoutJson = idx !== undefined ? raw.slice(0, idx).trim() : raw;
  const singleLine = withoutJson.replace(/\s+/g, " ").trim();
  if (!singleLine) return "We hit an error generating call artifacts.";
  if (singleLine.length > 240) return `${singleLine.slice(0, 239)}…`;
  return singleLine;
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

function MiniAudioPlayer(props: { src: string; durationHintSec?: number | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(props.durationHintSec && props.durationHintSec > 0 ? props.durationHintSec : 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    // Reset when switching recordings so the scrubber/time display never drift.
    setReady(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(props.durationHintSec && props.durationHintSec > 0 ? props.durationHintSec : 0);

    const el = audioRef.current;
    if (!el) return;

    const onLoaded = () => {
      setReady(true);
      if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
    };
    const onTime = () => setCurrentTime(el.currentTime || 0);
    const onPlay = () => {
      setPlaying(true);
    };
    const onPause = () => {
      setPlaying(false);
    };
    const onEnded = () => {
      setPlaying(false);
    };

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [props.src, props.durationHintSec]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = rate;
  }, [rate]);

  const remaining = Math.max(0, (duration || 0) - (currentTime || 0));
  const canScrub = ready && duration > 0;

  return (
    <div className="mt-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
      <audio ref={audioRef} preload="metadata" src={props.src} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
          disabled={!props.src}
          onClick={async () => {
            const el = audioRef.current;
            if (!el) return;
            if (el.paused) {
              try {
                await el.play();
              } catch {
                // ignore
              }
            } else {
              el.pause();
            }
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>

        <div className="min-w-55 flex-1">
          <input
            type="range"
            min={0}
            max={canScrub ? duration : 1}
            step={0.01}
            value={canScrub ? Math.min(duration, currentTime) : 0}
            disabled={!canScrub}
            onChange={(ev) => {
              const el = audioRef.current;
              if (!el) return;
              const next = Number(ev.target.value);
              if (!Number.isFinite(next)) return;
              el.currentTime = Math.max(0, Math.min(duration, next));
              setCurrentTime(el.currentTime);
            }}
            className="w-full"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-600">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(remaining)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-zinc-600">Speed</div>
          <PortalSelectDropdown
            value={rate}
            onChange={(v) => setRate(v)}
            options={[0.75, 1, 1.25, 1.5, 2].map((v) => ({ value: v, label: `${v}x` }))}
            className="min-w-21"
            buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
          />
        </div>
      </div>
    </div>
  );
}

type OutboundTabKey = "calls" | "messages" | "settings";

export function PortalAiOutboundCallsClient(props: { initialTab?: OutboundTabKey } = {}) {
  const toast = useToast();

  const pageRootRef = useRef<HTMLDivElement | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { initialTab } = props;

  const basePath = useMemo(() => {
    const p = String(pathname || "/portal/app/services/ai-outbound-calls");
    if (p.endsWith("/calls")) return p.slice(0, -"/calls".length);
    if (p.endsWith("/messages")) return p.slice(0, -"/messages".length);
    if (p.endsWith("/settings")) return p.slice(0, -"/settings".length);
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
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [callsSaving, setCallsSaving] = useState(false);
  const [messagesSaving, setMessagesSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tags, setTags] = useState<ContactTag[]>([]);
  const [voiceTools, setVoiceTools] = useState<VoiceTool[]>([]);
  const [voiceToolsApiKeyConfigured, setVoiceToolsApiKeyConfigured] = useState(true);

  const [voiceLibraryVoices, setVoiceLibraryVoices] = useState<VoiceLibraryVoice[]>([]);
  const [voiceLibraryLoading, setVoiceLibraryLoading] = useState(false);
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
  const [activityCounts, setActivityCounts] = useState<CampaignActivityCounts | null>(null);
  const [activityRecent, setActivityRecent] = useState<CampaignActivityRow[]>([]);

  const [manualCallTo, setManualCallTo] = useState("");
  const [manualCallBusy, setManualCallBusy] = useState(false);
  const [manualCallSyncBusy, setManualCallSyncBusy] = useState(false);
  const [manualCallId, setManualCallId] = useState<string | null>(null);
  const [manualCall, setManualCall] = useState<ManualCall | null>(null);
  const [manualCalls, setManualCalls] = useState<ManualCall[]>([]);
  const manualCallAutoSyncRef = useRef<Record<string, boolean>>({});

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) ?? null, [campaigns, selectedId]);

  const lastSavedAgentSigByCampaignIdRef = useRef<Record<string, { calls: string; messages: string }>>({});

  const callsAgentSig = useCallback((c: Campaign) => {
    return JSON.stringify({
      voiceAgentId: (c.voiceAgentId ?? "").trim(),
      voiceId: typeof c.voiceId === "string" ? c.voiceId.trim() : null,
      manualVoiceAgentId: (c.manualVoiceAgentId ?? "").trim(),
      voiceAgentConfig: c.voiceAgentConfig ?? {},
      knowledgeBase: c.knowledgeBase ?? null,
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

  const [callsToolsPreset, setCallsToolsPreset] = useState<"none" | "recommended" | "all">("recommended");

  const [tab, setTab] = useState<OutboundTabKey>(initialTab ?? "calls");
  const [settingsTab, setSettingsTab] = useState<"calls" | "messages">("calls");

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

  const [variablePickerOpen, setVariablePickerOpen] = useState(false);
  const [variablePickerTarget, setVariablePickerTarget] = useState<null | "calls_first" | "messages_first">(null);
  const [knownContactCustomVarKeys, setKnownContactCustomVarKeys] = useState<string[]>([]);

  const callsFirstMessageRef = useRef<HTMLInputElement | null>(null);
  const messagesFirstMessageRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/people/contacts/custom-variable-keys", { cache: "no-store" });
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
  }, []);

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
    return (
      <div className="space-y-4">
        <div>
          <div className={portalSidebarSectionTitleClass}>View</div>
          <div className={portalSidebarSectionStackClass}>
            {(["calls", "messages", "settings"] as OutboundTabKey[]).map((tabKey) => (
              <PortalSidebarNavButton
                key={tabKey}
                type="button"
                disabled={!selected}
                onClick={() => setTabAndRoute(tabKey)}
                aria-current={tab === tabKey ? "page" : undefined}
                label={tabKey === "calls" ? "Calls" : tabKey === "messages" ? "Messages" : "Settings"}
                icon={tabKey === "calls" ? <IconCalls /> : tabKey === "messages" ? <IconMessages /> : tabKey === "settings" ? <IconSidebarSettings /> : undefined}
                iconToneClassName={tabKey === "settings" ? portalSidebarIconToneNeutralClass : portalSidebarIconToneBlueClass}
                className={classNames(
                  portalSidebarButtonBaseClass,
                  !selected
                    ? "bg-zinc-100 text-zinc-400"
                    : tab === tabKey
                      ? portalSidebarButtonActiveClass
                      : portalSidebarButtonInactiveClass,
                )}
              >
                {tabKey === "calls" ? "Calls" : tabKey === "messages" ? "Messages" : "Settings"}
              </PortalSidebarNavButton>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <div className={portalSidebarSectionTitleClass}>Campaigns</div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setCreateName("");
                setCreateOpen(true);
              }}
              className={portalSidebarIconActionButtonClass}
              title="Create campaign"
              aria-label="Create campaign"
            >
              +
            </button>
          </div>
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
                      <div className="shrink-0 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
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
  }, [busy, campaigns, loading, selected, selectedId, setTabAndRoute, tab]);

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

  const [callsActivityFilter, setCallsActivityFilter] = useState<"all" | "manual" | "audience">("all");

  const [messagesTestChannel, setMessagesTestChannel] = useState<"sms" | "email">("sms");
  const [messagesTestInput, setMessagesTestInput] = useState("");
  const [messagesTestBusy, setMessagesTestBusy] = useState(false);
  const [messagesTestThread, setMessagesTestThread] = useState<ChatTestMessage[]>([]);

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
    setManualEnrollQuery("");
    setManualEnrollResults([]);
    setManualEnrollSelected(null);
    setManualEnrollSearchBusy(false);
    setManualEnrollChannelPolicy("BOTH");
    setMessagesCountsByStatus({});
    setMessagesCountsBySource({});
    setMessagesRecent([]);
    setMessagesActivityFilter("all");
    setCallsActivityFilter("all");
    setMessagesTestChannel("sms");
    setMessagesTestInput("");
    setMessagesTestBusy(false);
    setMessagesTestThread([]);
  }, [selectedId]);

  const loadMessagesActivity = useCallback(
    async (campaignId: string) => {
      const id = String(campaignId || "").trim();
      if (!id) return;
      if (messagesActivityLoading) return;

      setMessagesActivityLoading(true);
      try {
        const res = await fetch(
          `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(id)}/messages-activity`,
          { cache: "no-store" },
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
    [messagesActivityLoading],
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
            { cache: "no-store" },
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
  }, [manualEnrollQuery]);

  const loadManualCalls = useCallback(async (campaignId?: string) => {
    const qs = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : "";
    const res = await fetch(`/api/portal/ai-outbound-calls/manual-calls${qs}`, { cache: "no-store" }).catch(() => null as any);
    if (!res || !res.ok) return;
    const json = (await res.json().catch(() => null)) as ApiGetManualCallsResponse | null;
    if (!json || (json as any).ok !== true || !Array.isArray((json as any).manualCalls)) return;
    setManualCalls((json as any).manualCalls);
  }, []);

  const loadActivity = useCallback(async (campaignId: string) => {
    const id = String(campaignId || "").trim();
    if (!id) return;
    if (activityLoading) return;
    setActivityLoading(true);
    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(id)}/activity`,
        { cache: "no-store" },
      ).catch(() => null as any);
      if (!res || !res.ok) return;
      const json = (await res.json().catch(() => null)) as ApiGetCampaignActivityResponse | null;
      if (!json || (json as any).ok !== true) return;
      setActivityCounts((json as any).counts as CampaignActivityCounts);
      setActivityRecent(Array.isArray((json as any).recent) ? ((json as any).recent as CampaignActivityRow[]) : []);
    } finally {
      setActivityLoading(false);
    }
  }, [activityLoading]);

  const loadManualCall = useCallback(async (id: string) => {
    const res = await fetch(`/api/portal/ai-outbound-calls/manual-calls/${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null as any);
    if (!res || !res.ok) return;
    const json = (await res.json().catch(() => null)) as ApiGetManualCallResponse | null;
    if (!json || (json as any).ok !== true || !(json as any).manualCall) return;
    setManualCall((json as any).manualCall as ManualCall);
  }, []);

  const syncManualCallArtifacts = useCallback(
    async (id: string) => {
      if (manualCallSyncBusy) return;
      setManualCallSyncBusy(true);
      try {
        const res = await fetch(`/api/portal/ai-outbound-calls/manual-calls/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
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
    [loadManualCalls, manualCallSyncBusy, selected?.id, toast],
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

  async function startManualCall() {
    if (!selected) return;
    if (manualCallBusy || busy) return;

    setManualCallBusy(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/manual-call`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
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
      setError(e instanceof Error ? e.message : "Failed to start call");
    } finally {
      setManualCallBusy(false);
    }
  }

  const [createName, setCreateName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [callsAddTagValue, setCallsAddTagValue] = useState<string>("");
  const [chatAddTagValue, setChatAddTagValue] = useState<string>("");

  const [newTagName, setNewTagName] = useState("");
  const [callsTagSearch, setCallsTagSearch] = useState("");
  const [chatTagSearch, setChatTagSearch] = useState("");
  const [callsOutcomeTagSearch, setCallsOutcomeTagSearch] = useState("");
  const [messagesOutcomeTagSearch, setMessagesOutcomeTagSearch] = useState("");

  const [callsOutcomeAddCompletedValue, setCallsOutcomeAddCompletedValue] = useState<string>("");
  const [callsOutcomeAddFailedValue, setCallsOutcomeAddFailedValue] = useState<string>("");
  const [callsOutcomeAddSkippedValue, setCallsOutcomeAddSkippedValue] = useState<string>("");

  const [messagesOutcomeAddSentValue, setMessagesOutcomeAddSentValue] = useState<string>("");
  const [messagesOutcomeAddFailedValue, setMessagesOutcomeAddFailedValue] = useState<string>("");
  const [messagesOutcomeAddSkippedValue, setMessagesOutcomeAddSkippedValue] = useState<string>("");

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
    if (busy || manualEnrollBusy) return;

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
          headers: { "content-type": "application/json" },
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
      const res = await fetch("/api/portal/voice-agent/tools", { cache: "no-store" }).catch(() => null as any);
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
  }, []);

  const loadVoiceLibrary = useCallback(async () => {
    if (voiceLibraryLoading) return;
    setVoiceLibraryLoading(true);
    try {
      const res = await fetch("/api/portal/voice-agent/voices", { cache: "no-store" });
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
    } finally {
      setVoiceLibraryLoading(false);
    }
  }, [voiceLibraryLoading]);

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
          headers: { "content-type": "application/json" },
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
    [toast, voicePreviewBusyVoiceId],
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

  const loadAll = useCallback(async () => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);
    setError(null);

    let didLoad = false;
    try {
      const [campaignRes, tagsRes] = await Promise.all([
        fetch("/api/portal/ai-outbound-calls/campaigns", { cache: "no-store" }),
        fetch("/api/portal/contact-tags", { cache: "no-store" }),
      ]);

      const campaignsJson = (await campaignRes.json().catch(() => null)) as ApiGetCampaignsResponse | null;
      if (!campaignRes.ok || !campaignsJson || (campaignsJson as any).ok !== true) {
        throw new Error((campaignsJson as any)?.error || "Failed to load campaigns");
      }

      const tagsJson = (await tagsRes.json().catch(() => null)) as ApiGetContactTagsResponse | null;
      if (!tagsRes.ok || !tagsJson || (tagsJson as any).ok !== true) {
        throw new Error((tagsJson as any)?.error || "Failed to load tags");
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
      setTags(Array.isArray((tagsJson as any).tags) ? ((tagsJson as any).tags as ContactTag[]) : []);

      setSelectedId((prev) => {
        if (prev && nextCampaigns.some((c) => c.id === prev)) return prev;
        return nextCampaigns[0]?.id ?? null;
      });

      didLoad = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (didLoad) hasLoadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [callsAgentSig, messagesAgentSig]);

  useEffect(() => {
    void loadVoiceLibrary();
  }, [loadVoiceLibrary]);

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
        headers: { "content-type": "application/json" },
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
      setError(e instanceof Error ? e.message : "Failed to create");
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
        headers: { "content-type": "application/json" },
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
      setError(e instanceof Error ? e.message : "Failed to create tag");
    } finally {
      setBusy(false);
    }
  }

  async function updateCampaign(
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
      >
    > & {
      voiceAgentConfig?: Partial<VoiceAgentConfig>;
      chatAgentConfig?: Partial<VoiceAgentConfig>;
      knowledgeBase?: CampaignKnowledgeBase | null;
      messagesKnowledgeBase?: CampaignKnowledgeBase | null;
      callOutcomeTagging?: Partial<CallOutcomeTagging>;
      messageOutcomeTagging?: Partial<MessageOutcomeTagging>;
    },
  ) {
    if (!selected) return;

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

    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        },
      );

      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) {
        throw new Error(json?.error || "Failed to update");
      }

      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  async function syncCallsAgent() {
    if (!selected) return;
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/sync-agent`,
        { method: "POST" },
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
      setError(e instanceof Error ? e.message : "Failed to sync agent");
    } finally {
      setBusy(false);
    }
  }

  async function syncMessagesAgent() {
    if (!selected) return;
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/portal/ai-outbound-calls/campaigns/${encodeURIComponent(selected.id)}/sync-chat-agent`,
        { method: "POST" },
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
      setError(e instanceof Error ? e.message : "Failed to sync agent");
    } finally {
      setBusy(false);
    }
  }

  async function saveMessagesAgentSettings() {
    if (!selected) return;
    if (busy || messagesSaving) return;

    if (!messagesAgentDirty) return;

    setMessagesSaving(true);
    try {
      await updateCampaign({
        messageChannelPolicy: selected.messageChannelPolicy,
        chatAgentId: (selected.chatAgentId ?? "").trim(),
        manualChatAgentId: (selected.manualChatAgentId ?? "").trim(),
        chatAgentConfig: selected.chatAgentConfig ?? {},
        messagesKnowledgeBase: selected.messagesKnowledgeBase ?? null,
      });
      toast.success("Saved");
    } finally {
      setMessagesSaving(false);
    }
  }

  async function saveCallsAgentSettings() {
    if (!selected) return;
    if (busy || callsSaving) return;

    if (!callsAgentDirty) return;

    setCallsSaving(true);
    try {
      await updateCampaign({
        voiceAgentId: (selected.voiceAgentId ?? "").trim(),
        voiceId: typeof selected.voiceId === "string" ? selected.voiceId.trim() : null,
        manualVoiceAgentId: (selected.manualVoiceAgentId ?? "").trim(),
        voiceAgentConfig: selected.voiceAgentConfig ?? {},
        knowledgeBase: selected.knowledgeBase ?? null,
      });

      toast.success("Saved");
    } finally {
      setCallsSaving(false);
    }
  }

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
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) },
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
        { method: "POST", body: fd },
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
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) },
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
        { method: "POST", body: fd },
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
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, context }),
        },
      );

      const json = (await res.json().catch(() => null)) as ApiGenerateAgentConfigResponse | null;
      if (!res.ok || !json || (json as any).ok !== true) {
        throw new Error((json as any)?.error || "Failed to generate");
      }

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
      setError(e instanceof Error ? e.message : "Failed to generate");
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
    const first = (selected?.chatAgentConfig?.firstMessage || "").trim();
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
          const first = (selected.chatAgentConfig?.firstMessage || "").trim();
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
          headers: { "content-type": "application/json" },
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

  function removeCallOutcomeTag(kind: "completed" | "failed" | "skipped", tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;

    const base = selected.callOutcomeTagging;
    const key = kind === "completed" ? "onCompletedTagIds" : kind === "failed" ? "onFailedTagIds" : "onSkippedTagIds";
    const prev = Array.isArray((base as any)[key]) ? ((base as any)[key] as string[]) : [];
    const next = prev.filter((x) => x !== id);
    updateCampaign({ callOutcomeTagging: { [key]: next } as any });
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

  function removeMessageOutcomeTag(kind: "sent" | "failed" | "skipped", tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;

    const base = selected.messageOutcomeTagging;
    const key = kind === "sent" ? "onSentTagIds" : kind === "failed" ? "onFailedTagIds" : "onSkippedTagIds";
    const prev = Array.isArray((base as any)[key]) ? ((base as any)[key] as string[]) : [];
    const next = prev.filter((x) => x !== id);
    updateCampaign({ messageOutcomeTagging: { [key]: next } as any });
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

  const addCallsOutcomeCompletedTagOptions = useMemo(() => {
    const excluded = selected?.callOutcomeTagging?.onCompletedTagIds ?? [];
    return buildAddTagOptionsFromTags(tags, excluded, callsOutcomeTagSearch);
  }, [callsOutcomeTagSearch, tags, selected]);

  const addCallsOutcomeFailedTagOptions = useMemo(() => {
    const excluded = selected?.callOutcomeTagging?.onFailedTagIds ?? [];
    return buildAddTagOptionsFromTags(tags, excluded, callsOutcomeTagSearch);
  }, [callsOutcomeTagSearch, tags, selected]);

  const addCallsOutcomeSkippedTagOptions = useMemo(() => {
    const excluded = selected?.callOutcomeTagging?.onSkippedTagIds ?? [];
    return buildAddTagOptionsFromTags(tags, excluded, callsOutcomeTagSearch);
  }, [callsOutcomeTagSearch, tags, selected]);

  const addMessagesOutcomeSentTagOptions = useMemo(() => {
    const excluded = selected?.messageOutcomeTagging?.onSentTagIds ?? [];
    return buildAddTagOptionsFromTags(tags, excluded, messagesOutcomeTagSearch);
  }, [messagesOutcomeTagSearch, tags, selected]);

  const addMessagesOutcomeFailedTagOptions = useMemo(() => {
    const excluded = selected?.messageOutcomeTagging?.onFailedTagIds ?? [];
    return buildAddTagOptionsFromTags(tags, excluded, messagesOutcomeTagSearch);
  }, [messagesOutcomeTagSearch, tags, selected]);

  const addMessagesOutcomeSkippedTagOptions = useMemo(() => {
    const excluded = selected?.messageOutcomeTagging?.onSkippedTagIds ?? [];
    return buildAddTagOptionsFromTags(tags, excluded, messagesOutcomeTagSearch);
  }, [messagesOutcomeTagSearch, tags, selected]);

  const selectedCallsOutcomeCompletedTags = useMemo(() => {
    const map = new Map(tags.map((t) => [t.id, t] as const));
    return (selected?.callOutcomeTagging?.onCompletedTagIds ?? []).map((id) => map.get(id)).filter(Boolean) as ContactTag[];
  }, [tags, selected]);

  const selectedCallsOutcomeFailedTags = useMemo(() => {
    const map = new Map(tags.map((t) => [t.id, t] as const));
    return (selected?.callOutcomeTagging?.onFailedTagIds ?? []).map((id) => map.get(id)).filter(Boolean) as ContactTag[];
  }, [tags, selected]);

  const selectedCallsOutcomeSkippedTags = useMemo(() => {
    const map = new Map(tags.map((t) => [t.id, t] as const));
    return (selected?.callOutcomeTagging?.onSkippedTagIds ?? []).map((id) => map.get(id)).filter(Boolean) as ContactTag[];
  }, [tags, selected]);

  const selectedMessagesOutcomeSentTags = useMemo(() => {
    const map = new Map(tags.map((t) => [t.id, t] as const));
    return (selected?.messageOutcomeTagging?.onSentTagIds ?? []).map((id) => map.get(id)).filter(Boolean) as ContactTag[];
  }, [tags, selected]);

  const selectedMessagesOutcomeFailedTags = useMemo(() => {
    const map = new Map(tags.map((t) => [t.id, t] as const));
    return (selected?.messageOutcomeTagging?.onFailedTagIds ?? []).map((id) => map.get(id)).filter(Boolean) as ContactTag[];
  }, [tags, selected]);

  const selectedMessagesOutcomeSkippedTags = useMemo(() => {
    const map = new Map(tags.map((t) => [t.id, t] as const));
    return (selected?.messageOutcomeTagging?.onSkippedTagIds ?? []).map((id) => map.get(id)).filter(Boolean) as ContactTag[];
  }, [tags, selected]);

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

  function toolKeysForPreset(preset: "none" | "recommended" | "all"): string[] {
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
  }

  return (
    <div ref={pageRootRef} className="mx-auto w-full max-w-6xl px-4 sm:px-6">
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
      <div className="flex justify-end">
        <div className="w-full sm:w-auto">
          <SuggestedSetupModalLauncher serviceSlugs={["ai-outbound-calls"]} buttonLabel="Suggested setup" />
        </div>
      </div>

      {refreshing ? (
        <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-zinc-500">
          <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
          Refreshing…
        </div>
      ) : null}

      <div className="mt-6">
        <div>
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
                    ? "border border-zinc-200 bg-zinc-100 text-zinc-500"
                    : "bg-(--color-brand-blue) text-white shadow-sm hover:opacity-90",
                )}
                title="Create campaign"
                aria-label="Create campaign"
              >
                +
              </button>
            </div>
          ) : null}
          {!selected ? (
            <div className="text-sm text-zinc-500">Select a campaign.</div>
          ) : (
            <div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1">
                  <div className="text-sm font-semibold text-zinc-800">Campaign name</div>
                  <input
                    value={selected.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, name } : c)));
                    }}
                    onBlur={() => updateCampaign({ name: selected.name })}
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="w-full sm:w-55">
                  <div className="text-sm font-semibold text-zinc-800">Status</div>
                  <div className="mt-1">
                    <PortalListboxDropdown
                      value={selected.status}
                      options={statusOptions as any}
                      onChange={(v) => updateCampaign({ status: v as CampaignStatus })}
                    />
                  </div>
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
                        "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold",
                        busy ? "border border-zinc-200 bg-zinc-100 text-zinc-500" : "bg-(--color-brand-blue) text-white shadow-sm hover:opacity-90",
                      )}
                    >
                      New campaign
                    </button>
                  </div>
                ) : null}
              </div>

              {isMobileApp ? (
                <div className="mt-4 flex w-full flex-nowrap gap-2">
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
                  <div className="text-sm font-semibold text-zinc-900">Messages</div>
                  <div className="mt-1 text-sm text-zinc-600">Send SMS/email and continue the thread in Inbox.</div>

                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Manual enrollment</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Enroll a single contact into this campaign’s messaging automation.
                        </div>
                      </div>
                      <Link
                        href={pathname.startsWith("/credit") ? "/credit/app/services/inbox/email" : "/portal/app/services/inbox/email"}
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                      >
                        Open Inbox
                      </Link>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <div className="text-sm font-semibold text-zinc-800">Contact</div>
                        <input
                          value={manualEnrollQuery}
                          onChange={(e) => {
                            setManualEnrollQuery(e.target.value);
                            setManualEnrollSelected(null);
                          }}
                          placeholder="Search contacts by name, email, or phone…"
                          className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        />

                        {manualEnrollSearchBusy ? (
                          <div className="mt-2 text-xs text-zinc-500">Searching…</div>
                        ) : manualEnrollQuery.trim().length >= 2 && manualEnrollResults.length ? (
                          <div className="mt-2 max-h-56 overflow-auto rounded-2xl border border-zinc-200 bg-white">
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
                                  className="block w-full border-b border-zinc-100 px-3 py-2 text-left hover:bg-zinc-50 last:border-b-0"
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
                          <div className="mt-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                            <div className="text-xs font-semibold text-zinc-700">Selected</div>
                            <div className="mt-1 text-sm font-semibold text-zinc-900">
                              {(manualEnrollSelected.name || manualEnrollSelected.phone || manualEnrollSelected.email || "Unknown").trim()}
                            </div>
                            <div className="mt-1 text-xs text-zinc-600">
                              {[manualEnrollSelected.phone, manualEnrollSelected.email].filter(Boolean).join(" • ") || manualEnrollSelected.id}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-2 text-xs text-zinc-500">
                          {manualEnrollChannelPolicy === "SMS"
                            ? "Sends the first message automatically via SMS."
                            : manualEnrollChannelPolicy === "EMAIL"
                              ? "Sends the first message automatically via email."
                              : "Sends the first message automatically (SMS if possible, otherwise email)."}
                        </div>
                      </div>

                      <div className="sm:self-end">
                        <div>
                          <div className="text-sm font-semibold text-zinc-800">Channel</div>
                          <div className="mt-1">
                            <PortalListboxDropdown
                              value={manualEnrollChannelPolicy}
                              options={[
                                { value: "SMS", label: "SMS" },
                                { value: "EMAIL", label: "Email" },
                                { value: "BOTH", label: "Both (SMS if possible, else email)" },
                              ]}
                              onChange={(v) => setManualEnrollChannelPolicy(v as any)}
                              disabled={busy || manualEnrollBusy}
                              buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy || manualEnrollBusy || !manualEnrollSelected?.id}
                          onClick={() => void enrollContactForMessages()}
                          className={classNames(
                            "mt-3 w-full rounded-2xl px-4 py-2 text-sm font-semibold",
                            busy || manualEnrollBusy || !manualEnrollSelected?.id
                              ? "bg-zinc-200 text-zinc-600"
                              : "bg-brand-ink text-white hover:opacity-95",
                          )}
                        >
                          {manualEnrollBusy ? "Enrolling…" : "Enroll"}
                        </button>
                        <button
                          type="button"
                          className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                          onClick={() => {
                            setManualEnrollQuery("");
                            setManualEnrollResults([]);
                            setManualEnrollSelected(null);
                          }}
                          disabled={busy || manualEnrollBusy}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Activity</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Manual vs automation enrollments, status counts, and recent updates.
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-2xl border border-zinc-200 bg-white p-1 text-xs font-semibold">
                          {([
                            { k: "all", label: "All" },
                            { k: "manual", label: "Manual" },
                            { k: "audience", label: "Automation" },
                          ] as const).map((x) => (
                            <button
                              key={x.k}
                              type="button"
                              onClick={() => setMessagesActivityFilter(x.k)}
                              className={classNames(
                                "rounded-xl px-3 py-1",
                                messagesActivityFilter === x.k
                                  ? "bg-brand-ink text-white"
                                  : "bg-white text-zinc-700 hover:bg-zinc-50",
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
                          className={
                            "rounded-full border px-2 py-0.5 font-semibold " +
                            badgeClass(s.key) +
                            ""
                          }
                        >
                          {s.label}: {Number(messagesCountsByStatus[s.key] || 0)}
                        </span>
                      ))}

                      {([
                        { key: "MANUAL", label: "Manual" },
                        { key: "TAG", label: "Tag" },
                        { key: "INBOUND", label: "Inbound" },
                      ] as const).map((s) => (
                        <span
                          key={s.key}
                          className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-semibold text-zinc-700"
                        >
                          {s.label}: {Number(messagesCountsBySource[s.key] || 0)}
                        </span>
                      ))}
                    </div>

                    {(() => {
                      const filtered = messagesRecent
                        .filter((e) => {
                          const src = String(e.source || "").toUpperCase();
                          if (messagesActivityFilter === "manual") return src === "MANUAL";
                          if (messagesActivityFilter === "audience") return src !== "MANUAL";
                          return true;
                        })
                        .slice(0, 60);

                      if (!filtered.length) {
                        return <div className="mt-4 text-xs text-zinc-500">No activity loaded yet.</div>;
                      }

                      return (
                        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
                          <div className="max-h-90 overflow-auto bg-white">
                            {filtered.map((e) => {
                              const who =
                                (e.contact?.name && String(e.contact.name).trim()) ||
                                (e.contact?.phone && String(e.contact.phone).trim()) ||
                                (e.contact?.email && String(e.contact.email).trim()) ||
                                "Unknown contact";
                              const when = e.updatedAtIso || e.createdAtIso;
                              const err = sanitizeClientErrorText(e.lastError || e.replyLastError);
                              const src = String(e.source || "TAG").toUpperCase();
                              return (
                                <div key={e.id} className="border-b border-zinc-100 px-4 py-3 last:border-b-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold text-zinc-900">{who}</div>
                                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                                        <span>{formatWhen(when)}</span>
                                        {e.threadId ? <span className="truncate">Thread: {e.threadId}</span> : null}
                                      </div>
                                      {err ? <div className="mt-1 text-xs text-red-700">{err}</div> : null}
                                    </div>

                                    <div className="shrink-0 text-right">
                                      <span
                                        className={
                                          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
                                          badgeClass(e.status)
                                        }
                                      >
                                        {String(e.status || "UNKNOWN").toUpperCase()}
                                      </span>
                                      <div className="mt-1 text-[11px] font-semibold text-zinc-600">{src}</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : null}

              {tab === "calls" ? (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-zinc-900">Calls</div>
                  <div className="mt-1 text-sm text-zinc-600">Queue automated calls via tags, or place manual calls for testing.</div>

                  <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-800">Enabled</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {selected.status === "ARCHIVED"
                          ? "Archived campaigns can’t be enabled."
                          : "Queues tagged contacts for calls when enabled."}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="hidden text-xs font-semibold text-zinc-600 sm:inline">{selected.status}</span>
                      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={selected.status === "ACTIVE"}
                          disabled={busy || selected.status === "ARCHIVED"}
                          onChange={(e) => {
                            const nextStatus = e.target.checked ? "ACTIVE" : "PAUSED";
                            updateCampaign({ status: nextStatus });
                          }}
                        />
                        <span className="absolute inset-0 rounded-full bg-zinc-200 transition peer-checked:bg-(--color-brand-blue) peer-disabled:opacity-60" />
                        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 peer-disabled:opacity-80" />
                      </span>
                    </div>
                  </label>

                  {selected.status !== "ACTIVE" && selected.status !== "ARCHIVED" ? (
                    <div className="mt-2 text-[11px] text-zinc-500">Manual enroll will activate automatically.</div>
                  ) : null}

                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Manual</div>
                        <div className="mt-1 text-xs text-zinc-500">Type a number, press Call, then review recording + transcript in Activity.</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr,auto]">
                      <div>
                        <div className="text-xs font-semibold text-zinc-600">Phone number (E.164)</div>
                        <input
                          value={manualCallTo}
                          onChange={(e) => setManualCallTo(e.target.value)}
                          placeholder="+15551234567"
                          className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        />
                        <div className="mt-2 text-[11px] text-zinc-500">Recording + transcript usually appear 1-2 minutes after the call ends.</div>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          disabled={busy || manualCallBusy || !manualCallTo.trim()}
                          onClick={() => void startManualCall()}
                          className={classNames(
                            "rounded-2xl px-5 py-2.5 text-sm font-semibold",
                            busy || manualCallBusy ? "bg-zinc-200 text-zinc-600" : "bg-emerald-600 text-white hover:bg-emerald-700",
                          )}
                        >
                          <span className="inline-flex items-center gap-2">
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.86.3 1.7.54 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.06a2 2 0 0 1 2.11-.45c.8.24 1.64.42 2.5.54A2 2 0 0 1 22 16.92z" />
                            </svg>
                            <span>{manualCallBusy ? "Calling…" : "Call"}</span>
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Activity</div>
                        <div className="mt-1 text-xs text-zinc-500">Manual calls and automated queued calls in one place.</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex rounded-2xl border border-zinc-200 bg-white p-1 text-xs font-semibold">
                          {([
                            { k: "all", label: "All" },
                            { k: "manual", label: "Manual" },
                            { k: "audience", label: "Automation" },
                          ] as const).map((x) => (
                            <button
                              key={x.k}
                              type="button"
                              onClick={() => setCallsActivityFilter(x.k)}
                              className={classNames(
                                "rounded-xl px-3 py-1",
                                callsActivityFilter === x.k ? "bg-brand-ink text-white" : "bg-white text-zinc-700 hover:bg-zinc-50",
                              )}
                            >
                              {x.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {callsActivityFilter !== "manual" ? (
                        (() => {
                          const c = activityCounts;
                          const items = c
                            ? [
                                { label: "Queued", value: c.queued, cls: badgeClass("QUEUED") },
                                { label: "Calling", value: c.calling, cls: badgeClass("CALLING") },
                                { label: "Completed", value: c.completed, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                                { label: "Failed", value: c.failed, cls: "bg-red-50 text-red-700 border-red-200" },
                                { label: "Skipped", value: c.skipped, cls: "bg-zinc-50 text-zinc-700 border-zinc-200" },
                              ]
                            : [];

                          if (!items.length) return null;

                          return items.map((x) => (
                            <span key={x.label} className={"rounded-full border px-2 py-0.5 font-semibold " + x.cls}>
                              {x.label}: {x.value}
                            </span>
                          ));
                        })()
                      ) : null}

                      {callsActivityFilter !== "audience" ? (
                        (() => {
                          const counts = manualCalls.reduce(
                            (acc, c) => {
                              const st = String(c.status || "").toUpperCase();
                              acc.total += 1;
                              if (st === "CALLING" || st === "IN_PROGRESS" || st === "ACTIVE") acc.calling += 1;
                              else if (st === "COMPLETED") acc.completed += 1;
                              else if (st === "FAILED") acc.failed += 1;
                              else acc.other += 1;
                              return acc;
                            },
                            { total: 0, calling: 0, completed: 0, failed: 0, other: 0 },
                          );

                          if (counts.total === 0) return null;

                          const items = [
                            { label: "Manual", value: counts.total, cls: "bg-zinc-50 text-zinc-700 border-zinc-200" },
                            { label: "Calling", value: counts.calling, cls: badgeClass("CALLING") },
                            { label: "Completed", value: counts.completed, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                            { label: "Failed", value: counts.failed, cls: "bg-red-50 text-red-700 border-red-200" },
                          ];

                          return items.map((x) => (
                            <span key={x.label} className={"rounded-full border px-2 py-0.5 font-semibold " + x.cls}>
                              {x.label}: {x.value}
                            </span>
                          ));
                        })()
                      ) : null}
                    </div>

                    {callsActivityFilter !== "audience" ? (
                      manualCalls.length === 0 ? (
                        <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                          No manual calls yet.
                        </div>
                      ) : (
                        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
                          <div className="lg:col-span-2">
                            <div className="space-y-2">
                              {manualCalls.slice(0, 80).map((c) => {
                                const isSelected = c.id === manualCallId;
                                const hasAudio = Boolean(c.recordingSid && c.recordingSid.trim());
                                const hasTranscript = Boolean(c.transcriptText && c.transcriptText.trim());
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      setManualCallId(c.id);
                                      setManualCall(c);
                                    }}
                                    className={
                                      "w-full rounded-2xl border px-4 py-3 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
                                      (isSelected
                                        ? "border-brand-ink bg-brand-ink text-white"
                                        : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100")
                                    }
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold">{c.toNumberE164}</div>
                                        <div className={"mt-1 text-xs " + (isSelected ? "text-zinc-200" : "text-zinc-600")}>
                                          {formatWhen(c.createdAtIso)}
                                        </div>
                                      </div>
                                      <span
                                        className={
                                          "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold " +
                                          (isSelected ? "border-white/20 bg-white/10 text-white" : badgeClass(c.status))
                                        }
                                      >
                                        {String(c.status || "UNKNOWN").toUpperCase()}
                                      </span>
                                    </div>
                                    <div
                                      className={
                                        "mt-2 flex flex-wrap items-center gap-2 text-xs " +
                                        (isSelected ? "text-zinc-200" : "text-zinc-600")
                                      }
                                    >
                                      {hasAudio ? (
                                        <>
                                          <span className={isSelected ? "text-emerald-200" : "text-emerald-700"}>Audio</span>
                                          <span>•</span>
                                        </>
                                      ) : null}
                                      {hasTranscript ? (
                                        <span className={isSelected ? "text-sky-200" : "text-sky-700"}>Transcript</span>
                                      ) : (
                                        <span className={isSelected ? "text-zinc-300" : "text-zinc-500"}>
                                          Transcript pending
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="lg:col-span-3">
                            {manualCall ? (
                              <div className="rounded-3xl border border-zinc-200 bg-white p-5">
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <div className="text-lg font-bold text-brand-ink">{manualCall.toNumberE164}</div>
                                    <div className="mt-1 text-xs text-zinc-500">
                                      {formatWhen(manualCall.createdAtIso)} · Status: {String(manualCall.status || "").toLowerCase()}
                                    </div>
                                  </div>
                                  <div className="text-right text-xs text-zinc-500">
                                    {manualCall.callSid ? <div className="font-mono">CallSid: {manualCall.callSid}</div> : null}
                                    {manualCall.conversationId ? <div className="font-mono">Conversation: {manualCall.conversationId}</div> : null}
                                  </div>
                                </div>

                                {(() => {
                                  const err = String(manualCall.lastError || "").trim();
                                  const hideTwilioTranscriptNoise =
                                    Boolean(manualCall.conversationId) &&
                                    /twilio\s+transcription|twilio\s+transcript|transcript request failed\.\s*transcription may be disabled/i.test(err);

                                  if (!err || hideTwilioTranscriptNoise) return null;

                                  return (
                                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                      <div className="font-semibold">Call issue</div>
                                      <div className="mt-1 text-amber-900/80">
                                        {sanitizeClientErrorText(manualCall.lastError) ?? "We hit an error generating call artifacts."}
                                      </div>
                                    </div>
                                  );
                                })()}

                                <div className="mt-4">
                                  <div className="text-xs font-semibold text-zinc-600">Recording</div>
                                  {(() => {
                                    const src =
                                      manualCall.recordingSid && manualCall.recordingSid.trim()
                                        ? `/api/portal/ai-outbound-calls/recordings/${encodeURIComponent(manualCall.recordingSid)}`
                                        : "";
                                    if (!src) {
                                      return <div className="mt-2 text-sm text-zinc-600">No recording available for this call yet.</div>;
                                    }
                                    return (
                                      <>
                                        <MiniAudioPlayer src={src} durationHintSec={manualCall.recordingDurationSec ?? null} />
                                        <div className="mt-2 text-xs">
                                          <a className="font-semibold text-brand-ink hover:underline" href={src} target="_blank" rel="noreferrer">
                                            Download recording
                                          </a>
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>

                                <div className="mt-5">
                                  <div className="text-xs font-semibold text-zinc-600">Transcript</div>
                                  {manualCall.transcriptText && manualCall.transcriptText.trim() ? (
                                    <div className="mt-2 max-h-130 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                                      <div className="whitespace-pre-wrap text-sm text-zinc-800">{manualCall.transcriptText}</div>
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-sm text-zinc-600">No transcript yet. It can take 1-2 minutes to appear after the call ends.</div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-3xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">Select a call to view details.</div>
                            )}
                          </div>
                        </div>
                      )
                    ) : null}

                    {callsActivityFilter !== "manual" ? (
                      activityRecent.length ? (
                        <div className={classNames("mt-4 overflow-hidden rounded-2xl border border-zinc-200", callsActivityFilter === "all" ? "" : "") }>
                          <div className="max-h-90 overflow-auto bg-white">
                            {activityRecent.slice(0, 60).map((e) => {
                              const who =
                                (e.contact?.name && String(e.contact.name).trim()) ||
                                (e.contact?.phone && String(e.contact.phone).trim()) ||
                                (e.contact?.email && String(e.contact.email).trim()) ||
                                "Unknown contact";
                              const when = e.updatedAtIso || e.createdAtIso;
                              const err = sanitizeClientErrorText(e.lastError);
                              return (
                                <div key={e.id} className="border-b border-zinc-100 px-4 py-3 last:border-b-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold text-zinc-900">{who}</div>
                                      <div className="mt-1 text-xs text-zinc-500">{formatWhen(when)}</div>
                                    </div>
                                    <span
                                      className={
                                        "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold " + badgeClass(e.status)
                                      }
                                    >
                                      {String(e.status || "UNKNOWN").toUpperCase()}
                                    </span>
                                  </div>
                                  {err ? <div className="mt-2 text-xs text-zinc-600">{err}</div> : null}
                                  {e.nextCallAtIso ? (
                                    <div className="mt-1 text-[11px] text-zinc-500">Next call: {formatWhen(e.nextCallAtIso)}</div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-zinc-500">No recent activity yet.</div>
                      )
                    ) : null}
                  </div>
                </div>
              ) : null}

              {tab === "settings" ? (
                <>
                  <div className="mt-5">
                    <div className="text-sm font-semibold text-zinc-900">Agents</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      Configure the script/behavior for voice calls vs SMS/email messaging.
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSettingsTab("calls")}
                        className={
                          "rounded-2xl border px-4 py-2 text-xs font-semibold transition " +
                          (settingsTab === "calls"
                            ? "border-[color:var(--color-brand-blue)] bg-[color:var(--color-brand-blue)] text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                        }
                      >
                        Calls agent
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettingsTab("messages")}
                        className={
                          "rounded-2xl border px-4 py-2 text-xs font-semibold transition " +
                          (settingsTab === "messages"
                            ? "border-[color:var(--color-brand-blue)] bg-[color:var(--color-brand-blue)] text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                        }
                      >
                        Messages agent
                      </button>
                    </div>

                    {settingsTab === "calls" && !voiceToolsApiKeyConfigured ? (
                      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                        Calls agent sync is not available for this account.
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-5">
                    {settingsTab === "calls" ? (
                      <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-zinc-900">Calls agent</div>
                            <div className="mt-1 text-xs text-zinc-600">Used for outbound calls in this campaign.</div>
                            <div className="mt-2 text-[11px] text-zinc-600">
                              {callsAgentSyncRequired ? (
                                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800 ring-1 ring-blue-200">
                                  Sync required
                                </span>
                              ) : callsAgentSyncedAtIso ? (
                                <span
                                  className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200"
                                  title={`Synced ${formatWhen(callsAgentSyncedAtIso)}`}
                                >
                                  Synced
                                </span>
                              ) : null}
                              {callsAgentSyncedAtIso ? (
                                <span className="ml-2 text-[10px] text-zinc-500">{formatWhen(callsAgentSyncedAtIso)}</span>
                              ) : null}
                            </div>
                          </div>


                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={busy || callsSaving || !callsAgentDirty}
                              onClick={() => void saveCallsAgentSettings()}
                              className={classNames(
                                "rounded-2xl border px-4 py-2 text-xs font-semibold",
                                busy || callsSaving || !callsAgentDirty
                                  ? "border-zinc-200 bg-zinc-200 text-zinc-600"
                                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                              )}
                              title="Save calls agent settings"
                            >
                              {callsSaving ? "Saving…" : callsAgentDirty ? "Save" : "Saved"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={syncCallsAgent}
                              className={classNames(
                                "rounded-2xl px-4 py-2 text-xs font-semibold",
                                busy
                                  ? "bg-zinc-200 text-zinc-600"
                                  : "bg-[color:var(--color-brand-blue)] text-white hover:opacity-95",
                              )}
                              title="Sync calls agent"
                            >
                              {busy ? "Syncing…" : "Sync calls agent"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Voice</div>
                              <div className="mt-1 text-[11px] text-zinc-600">
                                Pick a voice for the calls agent. Changes apply after you sync the calls agent.
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Selected voice</div>
                              <PortalListboxDropdown<string>
                                value={selected.voiceId ?? ""}
                                onChange={(voiceId) => {
                                  const v = String(voiceId || "").trim();
                                  setCampaigns((prev) =>
                                    prev.map((c) => (c.id === selected.id ? { ...c, voiceId: v || null } : c)),
                                  );
                                  updateCampaign({ voiceId: v || null });
                                }}
                                disabled={busy}
                                placeholder="Default voice"
                                options={[
                                  { value: "", label: "Default voice", hint: "" },
                                  ...voiceLibraryVoices.map((v) => {
                                    const cat = String(v.category || "").trim();
                                    const showCat = Boolean(cat) && !/^pre[-\s]?made$/i.test(cat);
                                    return {
                                      value: v.id,
                                      label: showCat ? `${v.name} (${cat})` : v.name,
                                      hint: v.description || "",
                                    };
                                  }),
                                ]}
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
                                      className={classNames(
                                        "inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold",
                                        canClick ? "bg-white/15 hover:bg-white/25" : "opacity-60",
                                      )}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                      }}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!canClick) return;
                                        void playVoicePreview(opt.value);
                                      }}
                                      onKeyDown={(e) => {
                                        if (!canClick) return;
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          void playVoicePreview(opt.value);
                                        }
                                      }}
                                    >
                                      {isBusy ? "…" : "▶"}
                                    </span>
                                  );
                                }}
                                buttonClassName="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-2 text-xs hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                              />
                              <div className="mt-1 text-[11px] text-zinc-500">
                                {selected.voiceId?.trim() ? "Click ▶ next to a voice to preview." : "Using the default voice."}
                              </div>
                            </div>

                            <div>
                              <audio
                                ref={voicePreviewAudioRef}
                                controls={voicePreviewShowControls}
                                className={voicePreviewShowControls ? "mt-7 w-full" : "hidden"}
                                preload="none"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Knowledge base</div>
                              <div className="mt-1 text-[11px] text-zinc-600">
                                Add a website, notes, or files. Use Sync to ingest/update documents.
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={busy || knowledgeBaseSyncBusy}
                              onClick={() => void syncKnowledgeBase()}
                              className={classNames(
                                "rounded-xl px-3 py-2 text-xs font-semibold",
                                busy || knowledgeBaseSyncBusy
                                  ? "bg-zinc-200 text-zinc-600"
                                  : "bg-[color:var(--color-brand-blue)] text-white hover:opacity-95",
                              )}
                            >
                              {knowledgeBaseSyncBusy ? "Syncing…" : "Sync knowledge base"}
                            </button>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Seed URL</div>
                              <input
                                value={ensureKnowledgeBase(selected.knowledgeBase).seedUrl}
                                onChange={(e) => {
                                  const seedUrl = e.target.value;
                                  setCampaigns((prev) =>
                                    prev.map((c) =>
                                      c.id === selected.id
                                        ? { ...c, knowledgeBase: { ...ensureKnowledgeBase(c.knowledgeBase), seedUrl } }
                                        : c,
                                    ),
                                  );
                                }}
                                onBlur={() => updateCampaign({ knowledgeBase: ensureKnowledgeBase(selected.knowledgeBase) })}
                                disabled={busy}
                                placeholder="https://example.com"
                                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <div className="text-xs font-semibold text-zinc-700">Crawl depth</div>
                                  <PortalListboxDropdown<string>
                                    value={String(ensureKnowledgeBase(selected.knowledgeBase).crawlDepth ?? 0)}
                                    options={[
                                      { value: "0", label: "0" },
                                      { value: "1", label: "1" },
                                      { value: "2", label: "2" },
                                      { value: "3", label: "3" },
                                      { value: "4", label: "4" },
                                      { value: "5", label: "5" },
                                    ]}
                                    onChange={(v) => {
                                      const crawlDepth = Number(v || 0);
                                      const knowledgeBase = {
                                        ...ensureKnowledgeBase(selected.knowledgeBase),
                                        crawlDepth,
                                      };
                                      setCampaigns((prev) =>
                                        prev.map((c) =>
                                          c.id === selected.id ? { ...c, knowledgeBase: { ...knowledgeBase } } : c,
                                        ),
                                      );
                                      void updateCampaign({ knowledgeBase });
                                    }}
                                    disabled={busy}
                                    buttonClassName="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                                  />
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-zinc-700">Max URLs</div>
                                  <PortalListboxDropdown<string>
                                    value={String(ensureKnowledgeBase(selected.knowledgeBase).maxUrls ?? 0)}
                                    options={[
                                      { value: "0", label: "0" },
                                      { value: "25", label: "25" },
                                      { value: "50", label: "50" },
                                      { value: "100", label: "100" },
                                      { value: "250", label: "250" },
                                      { value: "500", label: "500" },
                                      { value: "1000", label: "1000" },
                                    ]}
                                    onChange={(v) => {
                                      const maxUrls = Number(v || 0);
                                      const knowledgeBase = {
                                        ...ensureKnowledgeBase(selected.knowledgeBase),
                                        maxUrls,
                                      };
                                      setCampaigns((prev) =>
                                        prev.map((c) =>
                                          c.id === selected.id ? { ...c, knowledgeBase: { ...knowledgeBase } } : c,
                                        ),
                                      );
                                      void updateCampaign({ knowledgeBase });
                                    }}
                                    disabled={busy}
                                    buttonClassName="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                                  />
                                <div className="mt-1 text-[11px] text-zinc-600">Max 1000</div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold text-zinc-700">Notes</div>
                              <label className="text-[11px] text-zinc-600">
                                <input
                                  type="file"
                                  className="hidden"
                                  disabled={busy || knowledgeBaseUploadBusy}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    e.currentTarget.value = "";
                                    if (file) void uploadKnowledgeBaseFile(file);
                                  }}
                                />
                                <span
                                  className={classNames(
                                    "inline-flex cursor-pointer items-center rounded-xl border px-3 py-2 text-xs font-semibold",
                                    busy || knowledgeBaseUploadBusy
                                      ? "border-zinc-200 bg-zinc-200 text-zinc-600"
                                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                                  )}
                                >
                                  {knowledgeBaseUploadBusy ? "Uploading…" : "Upload file"}
                                </span>
                              </label>
                            </div>
                            <textarea
                              value={ensureKnowledgeBase(selected.knowledgeBase).text}
                              onChange={(e) => {
                                const text = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? { ...c, knowledgeBase: { ...ensureKnowledgeBase(c.knowledgeBase), text } }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() => updateCampaign({ knowledgeBase: ensureKnowledgeBase(selected.knowledgeBase) })}
                              disabled={busy}
                              rows={4}
                              placeholder="Add any important context, FAQs, pricing notes…"
                              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>

                          <div className="mt-3 text-[11px] text-zinc-600">
                            {(() => {
                              const kb = selected.knowledgeBase;
                              const count = kb && Array.isArray(kb.locators) ? kb.locators.length : 0;
                              if (!kb) return "No knowledge base configured yet.";
                              return (
                                <div>
                                  <div>Attached docs: {count || 0}</div>
                                  {kb.lastSyncedAtIso ? <div>Last synced: {formatWhen(kb.lastSyncedAtIso)}</div> : null}
                                  {kb.lastSyncError ? <div className="mt-1 text-amber-700">Sync warning: {kb.lastSyncError}</div> : null}
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Advanced</div>
                              <div className="mt-1 text-[11px] text-zinc-600">
                                Optional manual override. When set, Sync applies changes to this agent ID (we won’t create a new agent).
                              </div>
                            </div>
                            {callsManualActive ? (
                              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                                Manual override active
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3">
                            <div className="text-xs font-semibold text-zinc-700">Manual agent ID</div>
                            <input
                              value={selected.manualVoiceAgentId ?? ""}
                              onChange={(e) => {
                                const manualVoiceAgentId = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) => (c.id === selected.id ? { ...c, manualVoiceAgentId } : c)),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({ manualVoiceAgentId: (selected.manualVoiceAgentId ?? "").trim() })
                              }
                              disabled={busy}
                              placeholder="Paste an agent ID (support-provided)"
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                            <div className="mt-1 text-[11px] text-zinc-500">
                              Effective agent ID: {callsEffectiveAgentId || "(none)"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Generate</div>
                              <div className="mt-1 text-[11px] text-zinc-600">
                                Paste quick context and generate goal/personality/tone/environment/guard rails + first message.
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={busy || generateBusy}
                              onClick={() => void generateAgentConfig("calls")}
                              className={classNames(
                                "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold",
                                busy || generateBusy
                                  ? "bg-zinc-200 text-zinc-600"
                                  : "bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] text-white shadow-sm hover:opacity-90",
                              )}
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
                                <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14z" />
                              </svg>
                              <span>{generateBusy ? "Generating…" : "Generate"}</span>
                            </button>
                          </div>
                          <textarea
                            value={callsGenerateContext}
                            onChange={(e) => setCallsGenerateContext(e.target.value)}
                            rows={3}
                            placeholder="What do you sell, who are you targeting, what outcome do you want, any do/don'ts…"
                            className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-xs font-semibold text-zinc-700">Tools</div>
                            <div className="mt-1 rounded-2xl border border-zinc-200 bg-white p-3">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-[11px] text-zinc-600">Pick which tools the calls agent can use.</div>
                                <PortalListboxDropdown
                                  value={callsToolsPreset}
                                  onChange={(preset) => {
                                    setCallsToolsPreset(preset);
                                    const next = toolKeysForPreset(preset);
                                    setCampaigns((prev) =>
                                      prev.map((c) =>
                                        c.id === selected.id
                                          ? {
                                              ...c,
                                              voiceAgentConfig: {
                                                ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                                                toolKeys: next,
                                              },
                                            }
                                          : c,
                                      ),
                                    );
                                    updateCampaign({ voiceAgentConfig: { toolKeys: next } });
                                  }}
                                  disabled={busy}
                                  options={[
                                    { value: "recommended", label: "Recommended" },
                                    { value: "none", label: "None" },
                                    { value: "all", label: "All" },
                                  ]}
                                  className="min-w-40"
                                  buttonClassName="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-2 text-xs hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                />
                              </div>

                              <div className="mt-3 grid grid-cols-1 gap-2">
                                {voiceTools.length === 0 ? (
                                  <div className="text-[11px] text-zinc-500">No tools are available yet.</div>
                                ) : (
                                  voiceTools.map((t) => {
                                    const enabled = selectedToolKeys.includes(t.key);
                                    const configured = Boolean(t.toolId);
                                    return (
                                      <label
                                        key={t.key}
                                        className={classNames(
                                          "flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-3 py-2",
                                          "border-zinc-200 bg-zinc-50",
                                        )}
                                        title={t.description || t.label}
                                      >
                                        <span className="min-w-0">
                                          <div className="truncate text-xs font-semibold text-zinc-800">{t.label}</div>
                                          <div className="mt-0.5 text-[11px] text-zinc-500">
                                            {t.description || ""}
                                            {!configured && voiceToolsApiKeyConfigured ? " (Will resolve on sync)" : ""}
                                          </div>
                                        </span>
                                        <input
                                          type="checkbox"
                                          className="mt-1"
                                          disabled={busy}
                                          checked={enabled}
                                          onChange={(e) => {
                                            const cur = selectedToolKeys;
                                            const set = new Set(cur);
                                            if (e.target.checked) set.add(t.key);
                                            else set.delete(t.key);
                                            const next = Array.from(set);
                                            setCampaigns((prev) =>
                                              prev.map((c) =>
                                                c.id === selected.id
                                                  ? {
                                                      ...c,
                                                      voiceAgentConfig: {
                                                        ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                                                        toolKeys: next,
                                                      },
                                                    }
                                                  : c,
                                              ),
                                            );
                                            updateCampaign({ voiceAgentConfig: { toolKeys: next } });
                                          }}
                                        />
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold text-zinc-700">First message</div>
                            <button
                              type="button"
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                              onClick={() => openVariablePicker("calls_first")}
                            >
                              Insert variable
                            </button>
                          </div>
                          <input
                            ref={callsFirstMessageRef}
                            value={selected.voiceAgentConfig?.firstMessage ?? ""}
                            onChange={(e) => {
                              const firstMessage = e.target.value;
                              setCampaigns((prev) =>
                                prev.map((c) =>
                                  c.id === selected.id
                                    ? {
                                        ...c,
                                        voiceAgentConfig: {
                                          ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                                          firstMessage,
                                        },
                                      }
                                    : c,
                                ),
                              );
                            }}
                            onBlur={() =>
                              updateCampaign({
                                voiceAgentConfig: { firstMessage: (selected.voiceAgentConfig?.firstMessage ?? "").trim() },
                              })
                            }
                            placeholder="Hi, this is …"
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-xs font-semibold text-zinc-700">Goal</div>
                            <textarea
                              value={selected.voiceAgentConfig?.goal ?? ""}
                              onChange={(e) => {
                                const goal = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? { ...c, voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), goal } }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({ voiceAgentConfig: { goal: (selected.voiceAgentConfig?.goal ?? "").trim() } })
                              }
                              rows={4}
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-zinc-700">Personality</div>
                            <textarea
                              value={selected.voiceAgentConfig?.personality ?? ""}
                              onChange={(e) => {
                                const personality = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? {
                                          ...c,
                                          voiceAgentConfig: {
                                            ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                                            personality,
                                          },
                                        }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({
                                  voiceAgentConfig: { personality: (selected.voiceAgentConfig?.personality ?? "").trim() },
                                })
                              }
                              rows={4}
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-zinc-700">Tone</div>
                            <textarea
                              value={selected.voiceAgentConfig?.tone ?? ""}
                              onChange={(e) => {
                                const tone = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? { ...c, voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), tone } }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({ voiceAgentConfig: { tone: (selected.voiceAgentConfig?.tone ?? "").trim() } })
                              }
                              rows={4}
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-zinc-700">Environment</div>
                            <textarea
                              value={selected.voiceAgentConfig?.environment ?? ""}
                              onChange={(e) => {
                                const environment = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? {
                                          ...c,
                                          voiceAgentConfig: {
                                            ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                                            environment,
                                          },
                                        }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({
                                  voiceAgentConfig: { environment: (selected.voiceAgentConfig?.environment ?? "").trim() },
                                })
                              }
                              rows={4}
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <div className="text-xs font-semibold text-zinc-700">Guard rails</div>
                            <textarea
                              value={selected.voiceAgentConfig?.guardRails ?? ""}
                              onChange={(e) => {
                                const guardRails = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? {
                                          ...c,
                                          voiceAgentConfig: {
                                            ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                                            guardRails,
                                          },
                                        }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({
                                  voiceAgentConfig: { guardRails: (selected.voiceAgentConfig?.guardRails ?? "").trim() },
                                })
                              }
                              rows={4}
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Testing</div>
                              <div className="mt-1 text-[11px] text-zinc-600">
                                This connects to your live calls agent so you can test voice behavior.
                              </div>
                            </div>
                            <button
                              type="button"
                              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                              onClick={() => void syncCallsAgent()}
                              disabled={busy || callsManualActive}
                              title={
                                callsManualActive
                                  ? "Sync is disabled while a manual Calls agent ID is set"
                                  : "Ensure the agent is created/synced before testing"
                              }
                            >
                              {busy ? "Syncing…" : "Sync first"}
                            </button>
                          </div>

                          {callsEffectiveAgentId ? (
                            <div className="mt-3">
                              <InlineElevenLabsAgentTester agentId={callsEffectiveAgentId} />
                            </div>
                          ) : (
                            <div className="mt-3 text-xs text-zinc-600">
                              No calls agent yet. Click “Sync calls agent” to create it, then test here.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-zinc-900">Messages agent</div>
                            <div className="mt-1 text-xs text-zinc-600">Used for SMS/email outreach and replies in this campaign.</div>
                            <div className="mt-2 text-[11px] text-zinc-600">
                              {messagesAgentSyncRequired ? (
                                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800 ring-1 ring-blue-200">
                                  Sync required
                                </span>
                              ) : messagesAgentSyncedAtIso ? (
                                <span
                                  className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200"
                                  title={`Synced ${formatWhen(messagesAgentSyncedAtIso)}`}
                                >
                                  Synced
                                </span>
                              ) : null}
                              {messagesAgentSyncedAtIso ? (
                                <span className="ml-2 text-[10px] text-zinc-500">{formatWhen(messagesAgentSyncedAtIso)}</span>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={busy || messagesSaving || !messagesAgentDirty}
                              onClick={() => void saveMessagesAgentSettings()}
                              className={classNames(
                                "rounded-2xl px-4 py-2 text-xs font-semibold",
                                busy || messagesSaving || !messagesAgentDirty
                                  ? "bg-zinc-200 text-zinc-600"
                                  : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                              )}
                              title="Save messages settings"
                            >
                              {messagesSaving ? "Saving…" : messagesAgentDirty ? "Save" : "Saved"}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={syncMessagesAgent}
                              className={classNames(
                                "rounded-2xl px-4 py-2 text-xs font-semibold",
                                busy
                                  ? "bg-zinc-200 text-zinc-600"
                                  : "bg-[color:var(--color-brand-blue)] text-white hover:opacity-95",
                              )}
                              title="Sync messages agent"
                            >
                              {busy ? "Syncing…" : "Sync messages agent"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Advanced</div>
                              <div className="mt-1 text-[11px] text-zinc-600">
                                Optional manual override. When set, Sync applies changes to this agent ID (we won’t create a new agent).
                              </div>
                            </div>
                            {messagesManualActive ? (
                              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                                Manual override active
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3">
                            <div className="text-xs font-semibold text-zinc-700">Manual agent ID</div>
                            <input
                              value={selected.manualChatAgentId ?? ""}
                              onChange={(e) => {
                                const manualChatAgentId = e.target.value;
                                setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, manualChatAgentId } : c)));
                              }}
                              onBlur={() => updateCampaign({ manualChatAgentId: (selected.manualChatAgentId ?? "").trim() })}
                              disabled={busy}
                              placeholder="Paste an agent ID (support-provided)"
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                            <div className="mt-1 text-[11px] text-zinc-500">
                              Effective agent ID: {messagesEffectiveAgentId || "(none)"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="text-xs font-semibold text-zinc-700">Channel policy</div>
                          <div className="mt-1 text-[11px] text-zinc-600">
                            Choose which channels this campaign can use for first messages. Click Save to apply.
                          </div>
                          <div className="mt-2 w-72 max-w-full">
                            <PortalListboxDropdown
                              value={selected.messageChannelPolicy}
                              options={[
                                { value: "SMS", label: "SMS only" },
                                { value: "EMAIL", label: "Email only" },
                                { value: "BOTH", label: "Both" },
                              ]}
                              onChange={(v) => {
                                const next = v as any;
                                setCampaigns((prev) =>
                                  prev.map((c) => (c.id === selected.id ? { ...c, messageChannelPolicy: next } : c)),
                                );
                                setMessagesAgentSyncRequired(true);
                                setMessagesAgentSyncedAtIso(null);
                                if (next === "SMS" || next === "EMAIL" || next === "BOTH") {
                                  setManualEnrollChannelPolicy(next);
                                  if (next === "SMS") setMessagesTestChannel("sms");
                                  if (next === "EMAIL") setMessagesTestChannel("email");
                                }
                              }}
                              disabled={busy}
                              buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                            />
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Knowledge base</div>
                              <div className="mt-1 text-[11px] text-zinc-600">
                                Add a website, notes, or files for the messages agent. Use Sync to ingest/update documents.
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={busy || messagesKnowledgeBaseSyncBusy}
                              onClick={() => void syncMessagesKnowledgeBase()}
                              className={classNames(
                                "rounded-xl px-3 py-2 text-xs font-semibold",
                                busy || messagesKnowledgeBaseSyncBusy
                                  ? "bg-zinc-200 text-zinc-600"
                                  : "bg-[color:var(--color-brand-blue)] text-white hover:opacity-95",
                              )}
                            >
                              {messagesKnowledgeBaseSyncBusy ? "Syncing…" : "Sync knowledge base"}
                            </button>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Seed URL</div>
                              <input
                                value={ensureKnowledgeBase(selected.messagesKnowledgeBase).seedUrl}
                                onChange={(e) => {
                                  const seedUrl = e.target.value;
                                  setCampaigns((prev) =>
                                    prev.map((c) =>
                                      c.id === selected.id
                                        ? {
                                            ...c,
                                            messagesKnowledgeBase: {
                                              ...ensureKnowledgeBase(c.messagesKnowledgeBase),
                                              seedUrl,
                                            },
                                          }
                                        : c,
                                    ),
                                  );
                                }}
                                onBlur={() =>
                                  updateCampaign({ messagesKnowledgeBase: ensureKnowledgeBase(selected.messagesKnowledgeBase) })
                                }
                                disabled={busy}
                                placeholder="https://example.com"
                                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <div className="text-xs font-semibold text-zinc-700">Crawl depth</div>
                                  <PortalListboxDropdown<string>
                                    value={String(ensureKnowledgeBase(selected.messagesKnowledgeBase).crawlDepth ?? 0)}
                                    options={[
                                      { value: "0", label: "0" },
                                      { value: "1", label: "1" },
                                      { value: "2", label: "2" },
                                      { value: "3", label: "3" },
                                      { value: "4", label: "4" },
                                      { value: "5", label: "5" },
                                    ]}
                                    onChange={(v) => {
                                      const crawlDepth = Number(v || 0);
                                      const messagesKnowledgeBase = {
                                        ...ensureKnowledgeBase(selected.messagesKnowledgeBase),
                                        crawlDepth,
                                      };
                                      setCampaigns((prev) =>
                                        prev.map((c) =>
                                          c.id === selected.id
                                            ? {
                                                ...c,
                                                messagesKnowledgeBase: { ...messagesKnowledgeBase },
                                              }
                                            : c,
                                        ),
                                      );
                                      void updateCampaign({ messagesKnowledgeBase });
                                    }}
                                    disabled={busy}
                                    buttonClassName="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                                  />
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-zinc-700">Max URLs</div>
                                  <PortalListboxDropdown<string>
                                    value={String(ensureKnowledgeBase(selected.messagesKnowledgeBase).maxUrls ?? 0)}
                                    options={[
                                      { value: "0", label: "0" },
                                      { value: "25", label: "25" },
                                      { value: "50", label: "50" },
                                      { value: "100", label: "100" },
                                      { value: "250", label: "250" },
                                      { value: "500", label: "500" },
                                      { value: "1000", label: "1000" },
                                    ]}
                                    onChange={(v) => {
                                      const maxUrls = Number(v || 0);
                                      const messagesKnowledgeBase = {
                                        ...ensureKnowledgeBase(selected.messagesKnowledgeBase),
                                        maxUrls,
                                      };
                                      setCampaigns((prev) =>
                                        prev.map((c) =>
                                          c.id === selected.id
                                            ? {
                                                ...c,
                                                messagesKnowledgeBase: { ...messagesKnowledgeBase },
                                              }
                                            : c,
                                        ),
                                      );
                                      void updateCampaign({ messagesKnowledgeBase });
                                    }}
                                    disabled={busy}
                                    buttonClassName="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                                  />
                                <div className="mt-1 text-[11px] text-zinc-600">Max 1000</div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold text-zinc-700">Notes</div>
                              <label className="text-[11px] text-zinc-600">
                                <input
                                  type="file"
                                  className="hidden"
                                  disabled={busy || messagesKnowledgeBaseUploadBusy}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0] || null;
                                    e.currentTarget.value = "";
                                    if (file) void uploadMessagesKnowledgeBaseFile(file);
                                  }}
                                />
                                <span
                                  className={classNames(
                                    "inline-flex cursor-pointer items-center rounded-xl border px-3 py-2 text-xs font-semibold",
                                    busy || messagesKnowledgeBaseUploadBusy
                                      ? "border-zinc-200 bg-zinc-200 text-zinc-600"
                                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                                  )}
                                >
                                  {messagesKnowledgeBaseUploadBusy ? "Uploading…" : "Upload file"}
                                </span>
                              </label>
                            </div>
                            <textarea
                              value={ensureKnowledgeBase(selected.messagesKnowledgeBase).text}
                              onChange={(e) => {
                                const text = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? {
                                          ...c,
                                          messagesKnowledgeBase: { ...ensureKnowledgeBase(c.messagesKnowledgeBase), text },
                                        }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({ messagesKnowledgeBase: ensureKnowledgeBase(selected.messagesKnowledgeBase) })
                              }
                              disabled={busy}
                              rows={4}
                              placeholder="Add any important context, FAQs, pricing notes…"
                              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>

                          <div className="mt-3 text-[11px] text-zinc-600">
                            {(() => {
                              const kb = selected.messagesKnowledgeBase;
                              const count = kb && Array.isArray(kb.locators) ? kb.locators.length : 0;
                              if (!kb) return "No knowledge base configured yet.";
                              return (
                                <div>
                                  <div>Attached docs: {count || 0}</div>
                                  {kb.lastSyncedAtIso ? <div>Last synced: {formatWhen(kb.lastSyncedAtIso)}</div> : null}
                                  {kb.lastSyncError ? (
                                    <div className="mt-1 text-amber-700">Sync warning: {kb.lastSyncError}</div>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Generate</div>
                              <div className="mt-1 text-[11px] text-zinc-600">
                                Paste quick context and generate goal/personality/tone/environment/guard rails + first message.
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={busy || generateBusy}
                              onClick={() => void generateAgentConfig("messages")}
                              className={classNames(
                                "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold",
                                busy || generateBusy
                                  ? "bg-zinc-200 text-zinc-600"
                                  : "bg-linear-to-r from-[color:var(--color-brand-blue)] via-violet-500 to-[color:var(--color-brand-pink)] text-white shadow-sm hover:opacity-90",
                              )}
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
                                <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14z" />
                              </svg>
                              <span>{generateBusy ? "Generating…" : "Generate"}</span>
                            </button>
                          </div>
                          <textarea
                            value={messagesGenerateContext}
                            onChange={(e) => setMessagesGenerateContext(e.target.value)}
                            rows={3}
                            placeholder="What do you sell, who are you targeting, what outcome do you want, any do/don'ts…"
                            className="mt-3 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                        </div>

                        <div className="mt-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-semibold text-zinc-700">First message</div>
                            <button
                              type="button"
                              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                              onClick={() => openVariablePicker("messages_first")}
                            >
                              Insert variable
                            </button>
                          </div>
                          <input
                            ref={messagesFirstMessageRef}
                            value={selected.chatAgentConfig?.firstMessage ?? ""}
                            onChange={(e) => {
                              const firstMessage = e.target.value;
                              setCampaigns((prev) =>
                                prev.map((c) =>
                                  c.id === selected.id
                                    ? {
                                        ...c,
                                        chatAgentConfig: {
                                          ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                                          firstMessage,
                                        },
                                      }
                                    : c,
                                ),
                              );
                            }}
                            onBlur={() =>
                              updateCampaign({
                                chatAgentConfig: { firstMessage: (selected.chatAgentConfig?.firstMessage ?? "").trim() },
                              })
                            }
                            placeholder="Hey {contact.firstName} …"
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-xs font-semibold text-zinc-700">Goal</div>
                            <textarea
                              value={selected.chatAgentConfig?.goal ?? ""}
                              onChange={(e) => {
                                const goal = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? { ...c, chatAgentConfig: { ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), goal } }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({ chatAgentConfig: { goal: (selected.chatAgentConfig?.goal ?? "").trim() } })
                              }
                              rows={4}
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-zinc-700">Personality</div>
                            <textarea
                              value={selected.chatAgentConfig?.personality ?? ""}
                              onChange={(e) => {
                                const personality = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? {
                                          ...c,
                                          chatAgentConfig: {
                                            ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                                            personality,
                                          },
                                        }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({
                                  chatAgentConfig: { personality: (selected.chatAgentConfig?.personality ?? "").trim() },
                                })
                              }
                              rows={4}
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-zinc-700">Tone</div>
                            <textarea
                              value={selected.chatAgentConfig?.tone ?? ""}
                              onChange={(e) => {
                                const tone = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? { ...c, chatAgentConfig: { ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), tone } }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({ chatAgentConfig: { tone: (selected.chatAgentConfig?.tone ?? "").trim() } })
                              }
                              rows={4}
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-zinc-700">Environment</div>
                            <textarea
                              value={selected.chatAgentConfig?.environment ?? ""}
                              onChange={(e) => {
                                const environment = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? {
                                          ...c,
                                          chatAgentConfig: {
                                            ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                                            environment,
                                          },
                                        }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({
                                  chatAgentConfig: { environment: (selected.chatAgentConfig?.environment ?? "").trim() },
                                })
                              }
                              rows={4}
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <div className="text-xs font-semibold text-zinc-700">Guard rails</div>
                            <textarea
                              value={selected.chatAgentConfig?.guardRails ?? ""}
                              onChange={(e) => {
                                const guardRails = e.target.value;
                                setCampaigns((prev) =>
                                  prev.map((c) =>
                                    c.id === selected.id
                                      ? {
                                          ...c,
                                          chatAgentConfig: {
                                            ...(c.chatAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG),
                                            guardRails,
                                          },
                                        }
                                      : c,
                                  ),
                                );
                              }}
                              onBlur={() =>
                                updateCampaign({
                                  chatAgentConfig: { guardRails: (selected.chatAgentConfig?.guardRails ?? "").trim() },
                                })
                              }
                              rows={4}
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="text-xs font-semibold text-zinc-700">Testing</div>
                              <div className="mt-1 text-[11px] text-zinc-600">
                                Simulate an inbox conversation with your messages agent config. This does not text/email real contacts.
                              </div>
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
                                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                                onClick={resetMessagesTestThread}
                                disabled={busy || messagesTestBusy}
                              >
                                Reset
                              </button>
                            </div>
                          </div>

                          <div className="mt-3 max-h-80 overflow-auto rounded-2xl border border-zinc-200 bg-white p-3">
                            {messagesTestThread.length ? (
                              <div className="space-y-2">
                                {messagesTestThread.map((m) => {
                                  const isUser = m.role === "user";
                                  return (
                                    <div key={m.id} className={classNames("flex", isUser ? "justify-end" : "justify-start")}>
                                      <div
                                        className={classNames(
                                          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                                          isUser ? "bg-brand-ink text-white" : "bg-zinc-100 text-zinc-900",
                                        )}
                                      >
                                        <div className="text-[11px] font-semibold opacity-70">
                                          {isUser ? "You" : "Agent"}
                                        </div>
                                        <div className="mt-1">{m.text}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-sm text-zinc-600">
                                <div className="font-semibold text-zinc-800">Start a test conversation</div>
                                <div className="mt-1 text-xs text-zinc-500">
                                  Click Reset to load the configured first message, then send a reply.
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr,auto]">
                            <textarea
                              value={messagesTestInput}
                              onChange={(e) => setMessagesTestInput(e.target.value)}
                              rows={2}
                              placeholder={
                                messagesTestChannel === "sms"
                                  ? "Customer: Hey, do you have pricing?"
                                  : "Customer: Hi, I’m interested in your service…"
                              }
                              className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              disabled={busy || messagesTestBusy || !messagesTestInput.trim()}
                              onClick={() => void sendMessagesTestUserText()}
                              className={classNames(
                                "rounded-2xl px-4 py-2 text-sm font-semibold",
                                busy || messagesTestBusy || !messagesTestInput.trim()
                                  ? "bg-zinc-200 text-zinc-600"
                                  : "bg-brand-ink text-white hover:opacity-95",
                              )}
                            >
                              {messagesTestBusy ? "Replying…" : "Send"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {settingsTab === "calls" ? (
                      <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                        <div className="text-sm font-semibold text-zinc-900">Calls audience tags</div>
                        <p className="mt-1 text-xs text-zinc-500">When a contact gets one of these tags, they’ll be queued for a call.</p>

                        <div className="mt-3 max-w-sm">
                          <input
                            value={callsTagSearch}
                            onChange={(e) => setCallsTagSearch(e.target.value)}
                            placeholder="Search tags…"
                            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                          <div className="mt-2">
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
                                  busy || !newTagName.trim()
                                    ? "bg-zinc-200 text-zinc-600"
                                    : "bg-brand-ink text-white hover:opacity-95",
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
                                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                title="Remove"
                              >
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                                <span className="max-w-45 truncate">{t.name}</span>
                                <span className="text-zinc-400">×</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-zinc-500">No tags selected.</div>
                        )}

                        <div className="mt-5 border-t border-zinc-200 pt-4">
                          <div className="text-sm font-semibold text-zinc-900">Auto-tag after call outcomes</div>
                          <p className="mt-1 text-xs text-zinc-500">
                            Optionally apply tags automatically after a call completes, fails, or is skipped.
                          </p>

                          <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                            <div>
                              <div className="text-sm font-semibold text-zinc-800">Enabled</div>
                              <div className="mt-1 text-xs text-zinc-500">Applies tags right after the outcome is recorded.</div>
                            </div>
                            <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={Boolean(selected.callOutcomeTagging?.enabled)}
                                disabled={busy}
                                onChange={(e) => updateCampaign({ callOutcomeTagging: { enabled: e.target.checked } })}
                              />
                              <span className="absolute inset-0 rounded-full bg-zinc-200 transition peer-checked:bg-[color:var(--color-brand-blue)] peer-disabled:opacity-60" />
                              <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 peer-disabled:opacity-80" />
                            </span>
                          </label>

                          {selected.callOutcomeTagging?.enabled ? (
                            <div className="mt-3">
                              <input
                                value={callsOutcomeTagSearch}
                                onChange={(e) => setCallsOutcomeTagSearch(e.target.value)}
                                placeholder="Search tags…"
                                className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              />

                              <div className="mt-3 grid gap-3 md:grid-cols-3">
                                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-zinc-700">On completed</div>
                                  <div className="mt-2">
                                    <PortalListboxDropdown
                                      value={callsOutcomeAddCompletedValue}
                                      options={addCallsOutcomeCompletedTagOptions as any}
                                      onChange={(v) => {
                                        const id = String(v || "");
                                        if (!id) {
                                          setCallsOutcomeAddCompletedValue("");
                                          return;
                                        }
                                        if (id === "__create__") {
                                          setCallsOutcomeAddCompletedValue("");
                                          setTagCreateContext("calls_outcome_completed");
                                          setShowCreateTag(true);
                                          return;
                                        }
                                        setCallsOutcomeAddCompletedValue("");
                                        addCallOutcomeTag("completed", id);
                                      }}
                                    />
                                  </div>

                                  {selectedCallsOutcomeCompletedTags.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedCallsOutcomeCompletedTags.map((t) => (
                                        <button
                                          key={t.id}
                                          type="button"
                                          onClick={() => removeCallOutcomeTag("completed", t.id)}
                                          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                          title="Remove"
                                        >
                                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                                          <span className="max-w-36 truncate">{t.name}</span>
                                          <span className="text-zinc-400">×</span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-[11px] text-zinc-500">No tags selected.</div>
                                  )}
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-zinc-700">On failed</div>
                                  <div className="mt-2">
                                    <PortalListboxDropdown
                                      value={callsOutcomeAddFailedValue}
                                      options={addCallsOutcomeFailedTagOptions as any}
                                      onChange={(v) => {
                                        const id = String(v || "");
                                        if (!id) {
                                          setCallsOutcomeAddFailedValue("");
                                          return;
                                        }
                                        if (id === "__create__") {
                                          setCallsOutcomeAddFailedValue("");
                                          setTagCreateContext("calls_outcome_failed");
                                          setShowCreateTag(true);
                                          return;
                                        }
                                        setCallsOutcomeAddFailedValue("");
                                        addCallOutcomeTag("failed", id);
                                      }}
                                    />
                                  </div>

                                  {selectedCallsOutcomeFailedTags.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedCallsOutcomeFailedTags.map((t) => (
                                        <button
                                          key={t.id}
                                          type="button"
                                          onClick={() => removeCallOutcomeTag("failed", t.id)}
                                          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                          title="Remove"
                                        >
                                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                                          <span className="max-w-36 truncate">{t.name}</span>
                                          <span className="text-zinc-400">×</span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-[11px] text-zinc-500">No tags selected.</div>
                                  )}
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-zinc-700">On skipped</div>
                                  <div className="mt-2">
                                    <PortalListboxDropdown
                                      value={callsOutcomeAddSkippedValue}
                                      options={addCallsOutcomeSkippedTagOptions as any}
                                      onChange={(v) => {
                                        const id = String(v || "");
                                        if (!id) {
                                          setCallsOutcomeAddSkippedValue("");
                                          return;
                                        }
                                        if (id === "__create__") {
                                          setCallsOutcomeAddSkippedValue("");
                                          setTagCreateContext("calls_outcome_skipped");
                                          setShowCreateTag(true);
                                          return;
                                        }
                                        setCallsOutcomeAddSkippedValue("");
                                        addCallOutcomeTag("skipped", id);
                                      }}
                                    />
                                  </div>

                                  {selectedCallsOutcomeSkippedTags.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedCallsOutcomeSkippedTags.map((t) => (
                                        <button
                                          key={t.id}
                                          type="button"
                                          onClick={() => removeCallOutcomeTag("skipped", t.id)}
                                          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                          title="Remove"
                                        >
                                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                                          <span className="max-w-36 truncate">{t.name}</span>
                                          <span className="text-zinc-400">×</span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-[11px] text-zinc-500">No tags selected.</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                        <div className="text-sm font-semibold text-zinc-900">Message audience tags</div>
                        <p className="mt-1 text-xs text-zinc-500">
                          When a contact gets one of these tags, they’ll be included in the messaging audience.
                        </p>

                        <div className="mt-3 max-w-sm">
                          <input
                            value={chatTagSearch}
                            onChange={(e) => setChatTagSearch(e.target.value)}
                            placeholder="Search tags…"
                            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                          <div className="mt-2">
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
                                  busy || !newTagName.trim()
                                    ? "bg-zinc-200 text-zinc-600"
                                    : "bg-brand-ink text-white hover:opacity-95",
                                )}
                              >
                                {busy ? "Creating…" : "Create"}
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {selectedChatTags.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedChatTags.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => removeAudienceTag("chat", t.id)}
                                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                title="Remove"
                              >
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                                <span className="max-w-45 truncate">{t.name}</span>
                                <span className="text-zinc-400">×</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-zinc-500">No tags selected.</div>
                        )}

                        <div className="mt-5 border-t border-zinc-200 pt-4">
                          <div className="text-sm font-semibold text-zinc-900">Auto-tag after message outcomes</div>
                          <p className="mt-1 text-xs text-zinc-500">
                            Optionally apply tags after the first outbound message is sent, fails, or is skipped.
                          </p>

                          <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                            <div>
                              <div className="text-sm font-semibold text-zinc-800">Enabled</div>
                              <div className="mt-1 text-xs text-zinc-500">Applies tags right after the first message attempt resolves.</div>
                            </div>
                            <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={Boolean(selected.messageOutcomeTagging?.enabled)}
                                disabled={busy}
                                onChange={(e) => updateCampaign({ messageOutcomeTagging: { enabled: e.target.checked } })}
                              />
                              <span className="absolute inset-0 rounded-full bg-zinc-200 transition peer-checked:bg-[color:var(--color-brand-blue)] peer-disabled:opacity-60" />
                              <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 peer-disabled:opacity-80" />
                            </span>
                          </label>

                          {selected.messageOutcomeTagging?.enabled ? (
                            <div className="mt-3">
                              <input
                                value={messagesOutcomeTagSearch}
                                onChange={(e) => setMessagesOutcomeTagSearch(e.target.value)}
                                placeholder="Search tags…"
                                className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                              />

                              <div className="mt-3 grid gap-3 md:grid-cols-3">
                                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-zinc-700">On sent</div>
                                  <div className="mt-2">
                                    <PortalListboxDropdown
                                      value={messagesOutcomeAddSentValue}
                                      options={addMessagesOutcomeSentTagOptions as any}
                                      onChange={(v) => {
                                        const id = String(v || "");
                                        if (!id) {
                                          setMessagesOutcomeAddSentValue("");
                                          return;
                                        }
                                        if (id === "__create__") {
                                          setMessagesOutcomeAddSentValue("");
                                          setTagCreateContext("messages_outcome_sent");
                                          setShowCreateTag(true);
                                          return;
                                        }
                                        setMessagesOutcomeAddSentValue("");
                                        addMessageOutcomeTag("sent", id);
                                      }}
                                    />
                                  </div>

                                  {selectedMessagesOutcomeSentTags.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedMessagesOutcomeSentTags.map((t) => (
                                        <button
                                          key={t.id}
                                          type="button"
                                          onClick={() => removeMessageOutcomeTag("sent", t.id)}
                                          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                          title="Remove"
                                        >
                                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                                          <span className="max-w-36 truncate">{t.name}</span>
                                          <span className="text-zinc-400">×</span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-[11px] text-zinc-500">No tags selected.</div>
                                  )}
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-zinc-700">On failed</div>
                                  <div className="mt-2">
                                    <PortalListboxDropdown
                                      value={messagesOutcomeAddFailedValue}
                                      options={addMessagesOutcomeFailedTagOptions as any}
                                      onChange={(v) => {
                                        const id = String(v || "");
                                        if (!id) {
                                          setMessagesOutcomeAddFailedValue("");
                                          return;
                                        }
                                        if (id === "__create__") {
                                          setMessagesOutcomeAddFailedValue("");
                                          setTagCreateContext("messages_outcome_failed");
                                          setShowCreateTag(true);
                                          return;
                                        }
                                        setMessagesOutcomeAddFailedValue("");
                                        addMessageOutcomeTag("failed", id);
                                      }}
                                    />
                                  </div>

                                  {selectedMessagesOutcomeFailedTags.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedMessagesOutcomeFailedTags.map((t) => (
                                        <button
                                          key={t.id}
                                          type="button"
                                          onClick={() => removeMessageOutcomeTag("failed", t.id)}
                                          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                          title="Remove"
                                        >
                                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                                          <span className="max-w-36 truncate">{t.name}</span>
                                          <span className="text-zinc-400">×</span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-[11px] text-zinc-500">No tags selected.</div>
                                  )}
                                </div>

                                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-zinc-700">On skipped</div>
                                  <div className="mt-2">
                                    <PortalListboxDropdown
                                      value={messagesOutcomeAddSkippedValue}
                                      options={addMessagesOutcomeSkippedTagOptions as any}
                                      onChange={(v) => {
                                        const id = String(v || "");
                                        if (!id) {
                                          setMessagesOutcomeAddSkippedValue("");
                                          return;
                                        }
                                        if (id === "__create__") {
                                          setMessagesOutcomeAddSkippedValue("");
                                          setTagCreateContext("messages_outcome_skipped");
                                          setShowCreateTag(true);
                                          return;
                                        }
                                        setMessagesOutcomeAddSkippedValue("");
                                        addMessageOutcomeTag("skipped", id);
                                      }}
                                    />
                                  </div>

                                  {selectedMessagesOutcomeSkippedTags.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedMessagesOutcomeSkippedTags.map((t) => (
                                        <button
                                          key={t.id}
                                          type="button"
                                          onClick={() => removeMessageOutcomeTag("skipped", t.id)}
                                          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                          title="Remove"
                                        >
                                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                                          <span className="max-w-36 truncate">{t.name}</span>
                                          <span className="text-zinc-400">×</span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-[11px] text-zinc-500">No tags selected.</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]"
          role="dialog"
          aria-modal="true"
          aria-label="Create campaign"
          onClick={() => {
            if (busy) return;
            setCreateOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-bold text-zinc-900">New campaign</div>
            <div className="mt-1 text-sm text-zinc-600">Name it now (or leave blank and rename later).</div>

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
                className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              />

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCreateOpen(false)}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className={classNames(
                    "rounded-2xl px-4 py-2 text-sm font-semibold",
                    busy ? "bg-zinc-200 text-zinc-600" : "bg-brand-ink text-white hover:opacity-95",
                  )}
                >
                  {busy ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
