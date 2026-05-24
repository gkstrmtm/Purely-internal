"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import {
  IconCalls,
  IconMessages,
  IconMissedCallTextBack,
  IconReceptionistActivity,
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
import { PortalMissedCallTextBackClient } from "@/app/portal/app/services/missed-call-textback/PortalMissedCallTextBackClient";
import { CreateContactTagDialog, type CreateContactTagResult } from "@/components/CreateContactTagDialog";
import { InlineElevenLabsAgentTester } from "@/components/InlineElevenLabsAgentTester";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalContactDetailsModal } from "@/components/PortalContactDetailsModal";
import { PortalPageLoadingShell } from "@/components/PortalPageLoadingShell";
import { PortalSelectDropdown } from "@/components/PortalSelectDropdown";
import { SuggestedSetupModalLauncher } from "@/components/SuggestedSetupModalLauncher";
import { ContactTagsEditor, type ContactTag } from "@/components/ContactTagsEditor";
import { useOptionalToast } from "@/components/ToastProvider";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const EMPTY_TAG_OPTION_VALUE = "";
const NEW_TAG_OPTION_VALUE = "__new_tag__";

type Settings = {
  version: 1;
  enabled: boolean;
  mode: "AI" | "FORWARD";
  webhookToken: string;
  businessName: string;
  greeting: string;
  systemPrompt: string;

  voiceId: string;

  smsEnabled: boolean;
  smsSystemPrompt: string;
  voiceIncludeTagIds: string[];
  voiceExcludeTagIds: string[];
  smsIncludeTagIds: string[];
  smsExcludeTagIds: string[];

  aiCanTransferToHuman: boolean;
  forwardToPhoneE164: string | null;
  chatAgentId: string;
  manualChatAgentId: string;
  manualAgentId: string;

  voiceKnowledgeBase: ReceptionistKnowledgeBase | null;
  smsKnowledgeBase: ReceptionistKnowledgeBase | null;

  voiceAgentId: string;
  voiceAgentConfigured: boolean;
};

type KnowledgeBaseLocator = {
  id: string;
  name: string;
  type: "file" | "url" | "text" | "folder";
  usage_mode?: "auto" | "prompt";
};

type ReceptionistKnowledgeBase = {
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

type EventRow = {
  id: string;
  callSid: string;
  from: string;
  to: string | null;
  createdAtIso: string;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED" | "UNKNOWN";
  notes?: string;
  recordingSid?: string;
  recordingDurationSec?: number;
  demoRecordingId?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactId?: string | null;
  contactTags?: ContactTag[];
  transcript?: string;
};

type ApiPayload = {
  ok: boolean;
  settings: Settings;
  events: EventRow[];
  webhookUrl: string;
  webhookUrlLegacy?: string;
  twilioConfigured?: boolean;
  twilio?: {
    configured: boolean;
    accountSidMasked: string | null;
    fromNumberE164: string | null;
    hasAuthToken: boolean;
    updatedAtIso: string | null;
  };
  notes?: {
    startupChecklist?: string[];
  };
  error?: string;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function formatTimeOfDay(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function ensureKnowledgeBase(kb: ReceptionistKnowledgeBase | null): ReceptionistKnowledgeBase {
  const base: ReceptionistKnowledgeBase = {
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

function buildAddTagOptionsFromTags(tags: ContactTag[], excludeTagIds: string[], search: string, includeNewTagOption = false) {
  const excluded = new Set(excludeTagIds);
  const q = String(search || "").trim().toLowerCase();
  const usable = tags
    .filter((t) => !excluded.has(t.id))
    .filter((t) => (!q ? true : t.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [
    { value: EMPTY_TAG_OPTION_VALUE, label: "Add a tag…" },
    ...usable.map((t) => ({ value: t.id, label: t.name })),
    ...(includeNewTagOption ? [{ value: NEW_TAG_OPTION_VALUE, label: "New tag…" }] : []),
  ];
}

function sanitizeClientNotes(notes?: string | null) {
  const raw = String(notes || "").trim();
  if (!raw) return null;

  // Strip obvious JSON payloads/errors while keeping a human message.
  const brace = raw.indexOf("{");
  const bracket = raw.indexOf("[");
  const idx = [brace, bracket].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  const withoutJson = idx !== undefined ? raw.slice(0, idx).trim() : raw;

  const singleLine = withoutJson.replace(/\s+/g, " ").trim();
  if (!singleLine) return "Call update recorded.";
  if (singleLine.length > 240) return `${singleLine.slice(0, 239)}…`;
  return singleLine;
}

function isTechnicalNotes(raw: string): boolean {
  const text = raw.trim().toLowerCase();
  if (!text) return false;
  if (text.startsWith("media stream callback")) return true;
  if (text.includes("stream-started") || text.includes("stream-stopped") || text.includes("stream-error")) return true;
  if (text.startsWith("recording detected:") || text.startsWith("recording started:") || text.includes("recording start requested")) return true;
  if (text.startsWith("live agent connected")) return true;
  if (text.startsWith("ai mode unavailable")) return true;
  if (text.startsWith("insufficient credits")) return true;
  if (text.startsWith("call status:")) return true;
  return false;
}

function summarizeTranscriptForNotes(transcript?: string | null): string | null {
  const raw = String(transcript || "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  // Prefer a very short, first-sentence-style summary so Notes stay
  // glanceable instead of reading like a full transcript.
  const sentenceMatch = cleaned.match(/^(.+?[.!?])\s+/);
  const base = sentenceMatch && sentenceMatch[1] ? sentenceMatch[1].trim() : cleaned;

  if (base.length <= 200) return base;
  return `${base.slice(0, 199)}…`;
}

function deriveClientNotesFromEvent(ev: EventRow | null): string | null {
  if (!ev) return null;

  const transcript = (ev.transcript || "").trim();
  if (!transcript) return null;

  const rawNotes = (ev.notes || "").trim();

  // Prefer any non-technical server-side notes (LLM summary) and keep them short.
  if (rawNotes && !isTechnicalNotes(rawNotes)) {
    const cleaned = sanitizeClientNotes(rawNotes);
    if (cleaned) return cleaned;
  }

  // Otherwise, derive a compact summary from the transcript.
  const summary = summarizeTranscriptForNotes(transcript);
  return summary ? summary : null;
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
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);

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
  const scrubValue = canScrub ? Math.min(duration, currentTime) : 0;
  const scrubMax = canScrub ? duration : 1;
  const scrubPercent = scrubMax > 0 ? Math.max(0, Math.min(100, (scrubValue / scrubMax) * 100)) : 0;

  return (
    <div className="mt-2">
      <audio ref={audioRef} preload="metadata" src={props.src} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={classNames(
            "inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue/12 text-(--color-brand-blue) transition-colors duration-150 hover:bg-brand-blue/18 disabled:opacity-60",
          )}
          disabled={!props.src}
          aria-label={playing ? "Pause recording" : "Play recording"}
          title={playing ? "Pause recording" : "Play recording"}
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
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <rect x="3" y="2.25" width="3.5" height="11.5" rx="1" />
              <rect x="9.5" y="2.25" width="3.5" height="11.5" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M4.5 3.2c0-.7.76-1.13 1.36-.77l6.2 3.8c.57.35.57 1.18 0 1.53l-6.2 3.8c-.6.36-1.36-.07-1.36-.77V3.2Z" />
            </svg>
          )}
        </button>

        <div className="min-w-55 flex-1">
          <input
            type="range"
            min={0}
            max={scrubMax}
            step={0.01}
            value={scrubValue}
            disabled={!canScrub}
            onChange={(ev) => {
              const el = audioRef.current;
              if (!el) return;
              const next = Number(ev.target.value);
              if (!Number.isFinite(next)) return;
              el.currentTime = Math.max(0, Math.min(duration, next));
              setCurrentTime(el.currentTime);
            }}
            className="pa-audio-scrubber w-full"
            style={{
              background: `linear-gradient(90deg, #93c5fd 0%, #93c5fd ${scrubPercent}%, rgba(191,219,254,0.45) ${scrubPercent}%, rgba(191,219,254,0.45) 100%)`,
            }}
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

export function PortalAiReceptionistClient() {
  const pathname = usePathname() || "";
  const toast = useOptionalToast();
  const portalVariant = useMemo(() => (pathname.startsWith("/credit") ? "credit" : "portal"), [pathname]);
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: portalVariant }), [portalVariant]);
  const portalBase = useMemo(() => (pathname.startsWith("/credit") ? "/credit" : "/portal"), [pathname]);
  const aiReceptionistEnableHref = useMemo(
    () => (portalBase === "/credit" ? `${portalBase}/app/billing/upgrade` : `${portalBase}/app/billing#pa-billing-add-services`),
    [portalBase],
  );

  const isMobileApp = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      const p = String(url.searchParams.get("pa_mobileapp") || "").toLowerCase();
      if (p === "1" || p === "true" || p === "yes") return true;
      const host = String(window.location.hostname || "").toLowerCase();
      if (host.includes("purely-mobile")) return true;
    } catch {
      // ignore
    }
    return false;
  }, []);

  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [callSyncBusy, setCallSyncBusy] = useState(false);
  const autoSyncedCallSidsRef = useRef<Set<string>>(new Set());
  const [generateContext, setGenerateContext] = useState("");
  const [smsGenerateContext, setSmsGenerateContext] = useState("");
  const [generateBusy, setGenerateBusy] = useState(false);
  const [polishBusy, setPolishBusy] = useState<null | "voiceGreeting" | "voiceSystemPrompt" | "smsSystemPrompt">(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const entitlementBlocked = useMemo(() => Boolean(error && /enable ai receptionist|isn.?t enabled for this account/i.test(error)), [error]);

  const friendlyApiError = useCallback((opts: {
    status?: number;
    rawError?: string | null;
    action: "load" | "save" | "regenerate";
  }) => {
    const raw = (opts.rawError || "").trim();

    if (opts.status === 401) {
      return "Your session expired. Sign in again, then reopen AI Receptionist.";
    }

    if (opts.status === 403) {
      return "AI Receptionist isn’t enabled for this account yet. Enable it, then come back here.";
    }

    if (raw && raw !== "Forbidden" && raw !== "Unauthorized") return raw;

    if (opts.action === "save") return "These AI Receptionist settings did not save. Retry here or keep editing them.";
    if (opts.action === "regenerate") return "That webhook token did not regenerate. Retry here or keep editing the settings.";
    return "AI Receptionist is still syncing. Retry here, open services, or ask Pura to help.";
  }, []);

  const readJsonError = useCallback(async (res: Response) => {
    try {
      const json = (await res.json()) as any;
      return typeof json?.error === "string" ? json.error : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);


  const [tab, setTab] = useState<"settings" | "testing" | "activity" | "missed-call-textback">(() => {
    if (typeof window === "undefined") return "activity";
    try {
      const next = new URL(window.location.href).searchParams.get("tab");
      if (next === "settings" || next === "testing" || next === "activity" || next === "missed-call-textback") {
        return next;
      }
    } catch {
      // ignore
    }
    return "activity";
  });
  const [settingsSubTab, setSettingsSubTab] = useState<"voice" | "sms">("voice");

  const [settings, setSettings] = useState<Settings | null>(null);
  const lastSavedSettingsJsonRef = useRef<string>("null");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [twilioConfigured, setTwilioConfigured] = useState<boolean>(false);

  const isDirty = useMemo(() => {
    if (!settings) return false;
    return JSON.stringify(settings) !== lastSavedSettingsJsonRef.current;
  }, [settings]);

  const [contactTags, setContactTags] = useState<ContactTag[]>([]);
  const [voiceIncludeAddTagValue, setVoiceIncludeAddTagValue] = useState("");
  const [voiceExcludeAddTagValue, setVoiceExcludeAddTagValue] = useState("");
  const [smsIncludeAddTagValue, setSmsIncludeAddTagValue] = useState("");
  const [smsExcludeAddTagValue, setSmsExcludeAddTagValue] = useState("");
  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createTagTarget, setCreateTagTarget] = useState<null | "voiceInclude" | "voiceExclude" | "smsInclude" | "smsExclude">(null);

  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [contactDetailsOpen, setContactDetailsOpen] = useState(false);
  const [contactDetailsContactId, setContactDetailsContactId] = useState<string | null>(null);

  const [smsTestInbound, setSmsTestInbound] = useState<string>("");
  const [smsTestTagIds, setSmsTestTagIds] = useState<string[]>([]);
  const [smsTestAddTagValue, setSmsTestAddTagValue] = useState<string>("");
  const [smsTestBusy, setSmsTestBusy] = useState<boolean>(false);
  const [smsTestWouldReply, setSmsTestWouldReply] = useState<boolean | null>(null);
  const [smsTestReason, setSmsTestReason] = useState<string | null>(null);
  const [smsTestReply, setSmsTestReply] = useState<string>("");
  const smsTestAbortRef = useRef<AbortController | null>(null);
  const [testingCallActive, setTestingCallActive] = useState(false);

  const [smsPromptBusy, setSmsPromptBusy] = useState<boolean>(false);

  const [voiceKnowledgeBaseSyncBusy, setVoiceKnowledgeBaseSyncBusy] = useState(false);
  const [voiceKnowledgeBaseUploadBusy, setVoiceKnowledgeBaseUploadBusy] = useState(false);
  const [smsKnowledgeBaseSyncBusy, setSmsKnowledgeBaseSyncBusy] = useState(false);
  const [smsKnowledgeBaseUploadBusy, setSmsKnowledgeBaseUploadBusy] = useState(false);

  const [voiceLibraryVoices, setVoiceLibraryVoices] = useState<VoiceLibraryVoice[]>([]);
  const [voiceLibraryLoading, setVoiceLibraryLoading] = useState(false);
  const [voicePreviewBusyVoiceId, setVoicePreviewBusyVoiceId] = useState<string | null>(null);
  const [voicePreviewShowControls, setVoicePreviewShowControls] = useState(false);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewUrlRef = useRef<string | null>(null);

  const loadVoiceLibrary = useCallback(async () => {
    if (voiceLibraryLoading) return;
    setVoiceLibraryLoading(true);
    try {
      const res = await fetch("/api/portal/voice-agent/voices", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
      if (!res?.ok) {
        setVoiceLibraryVoices([]);
        return;
      }
      const json = (await res.json().catch(() => null)) as ApiGetVoiceLibraryVoicesResponse | null;
      if (!json || (json as any).ok !== true) {
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
  }, [variantHeaders, voiceLibraryLoading]);

  useEffect(() => {
    if (tab !== "settings") return;
    if (settingsSubTab !== "voice") return;
    void loadVoiceLibrary();
  }, [loadVoiceLibrary, settingsSubTab, tab]);

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

  async function generateReceptionistCopy() {
    if (!settings) return;
    if (generateBusy) return;
    setGenerateBusy(true);
    try {
      const res = await fetch("/api/portal/ai-receptionist/generate-settings", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({
          context: generateContext,
          mode: settings.mode,
          aiCanTransferToHuman: settings.aiCanTransferToHuman,
          forwardToPhoneE164: settings.forwardToPhoneE164,
        }),
      }).catch(() => null as any);
      if (!res?.ok) {
        const rawError = res ? await readJsonError(res) : null;
        throw new Error(rawError || "These AI Receptionist settings did not generate. Try again here or keep editing the settings.");
      }
      const json = (await res.json().catch(() => null)) as any;
      if (!json?.ok || !json?.settings) throw new Error(json?.error || "These AI Receptionist settings did not generate. Try again here or keep editing the settings.");
      setSettings({ ...settings, ...json.settings });
      toast.success(json?.warning ? "Generated (fallback)" : "Generated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "These AI Receptionist settings did not generate. Try again here or keep editing the settings.");
    } finally {
      setGenerateBusy(false);
    }
  }

  async function generateSmsSystemPrompt() {
    if (!settings) return;
    if (smsPromptBusy) return;
    setSmsPromptBusy(true);
    try {
      const res = await fetch("/api/portal/ai-receptionist/generate-sms-system-prompt", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ context: smsGenerateContext }),
      }).catch(() => null as any);

      if (!res?.ok) {
        const rawError = res ? await readJsonError(res) : null;
        throw new Error(rawError || "That SMS prompt did not generate. Try again here or keep editing the settings.");
      }

      const json = (await res.json().catch(() => null)) as any;
      if (!json?.ok || typeof json.smsSystemPrompt !== "string") throw new Error(json?.error || "That SMS prompt did not generate. Try again here or keep editing the settings.");

      setSettings({ ...settings, smsSystemPrompt: json.smsSystemPrompt });
      toast.success("Generated SMS prompt");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That SMS prompt did not generate. Try again here or keep editing the settings.");
    } finally {
      setSmsPromptBusy(false);
    }
  }

  async function polishReceptionistText(target: "voiceGreeting" | "voiceSystemPrompt" | "smsSystemPrompt") {
    if (!settings) return;
    if (polishBusy) return;

    const inputText =
      target === "voiceGreeting"
        ? settings.greeting
        : target === "voiceSystemPrompt"
          ? settings.systemPrompt
          : settings.smsSystemPrompt;

    if (!String(inputText || "").trim()) {
      toast.error("Add some text to polish first");
      return;
    }

    setPolishBusy(target);
    try {
      const kind = target === "voiceGreeting" ? "greeting" : "systemPrompt";
      const channel = target === "smsSystemPrompt" ? "sms" : "voice";

      const res = await fetch("/api/portal/ai-receptionist/polish", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ kind, channel, text: inputText }),
      }).catch(() => null as any);

      if (!res?.ok) {
        const rawError = res ? await readJsonError(res) : null;
        throw new Error(rawError || "That text did not polish. Try again here or keep editing the settings.");
      }

      const json = (await res.json().catch(() => null)) as any;
      if (!json?.ok || typeof json.polished !== "string") throw new Error(json?.error || "That text did not polish. Try again here or keep editing the settings.");
      const polished = String(json.polished || "").trim();
      if (!polished) throw new Error("Empty AI response");

      setSettings((prev) => {
        if (!prev) return prev;
        if (target === "voiceGreeting") return { ...prev, greeting: polished };
        if (target === "voiceSystemPrompt") return { ...prev, systemPrompt: polished };
        return { ...prev, smsSystemPrompt: polished };
      });

      toast.success("Polished");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That text did not polish. Try again here or keep editing the settings.");
    } finally {
      setPolishBusy(null);
    }
  }

  async function syncVoiceKnowledgeBase() {
    if (!settings) return;
    if (voiceKnowledgeBaseSyncBusy) return;
    setVoiceKnowledgeBaseSyncBusy(true);
    try {
      const res = await fetch("/api/portal/ai-receptionist/voice-knowledge-base/sync", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ knowledgeBase: ensureKnowledgeBase(settings.voiceKnowledgeBase) }),
      }).catch(() => null as any);

      const json = (await res?.json?.().catch(() => null)) as any;
      if (!res?.ok || !json || json.ok !== true) {
        throw new Error(String(json?.error || "Knowledge base sync failed"));
      }

      const count = Array.isArray(json.locators) ? json.locators.length : 0;
      toast.success(count ? `Knowledge base synced (${count} docs)` : "Knowledge base synced");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Knowledge base sync failed");
    } finally {
      setVoiceKnowledgeBaseSyncBusy(false);
    }
  }

  async function uploadVoiceKnowledgeBaseFile(file: File) {
    if (!settings) return;
    if (voiceKnowledgeBaseUploadBusy) return;
    setVoiceKnowledgeBaseUploadBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("knowledgeBase", JSON.stringify(ensureKnowledgeBase(settings.voiceKnowledgeBase)));

      const res = await fetch("/api/portal/ai-receptionist/voice-knowledge-base/upload", {
        method: "POST",
        headers: variantHeaders,
        body: fd,
      }).catch(() => null as any);

      const json = (await res?.json?.().catch(() => null)) as any;
      if (!res?.ok || !json || json.ok !== true) {
        throw new Error(String(json?.error || "That file did not upload. Try again here or review the knowledge base settings."));
      }

      toast.success("File added to knowledge base");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That file did not upload. Try again here or review the knowledge base settings.");
    } finally {
      setVoiceKnowledgeBaseUploadBusy(false);
    }
  }

  async function syncSmsKnowledgeBase() {
    if (!settings) return;
    if (smsKnowledgeBaseSyncBusy) return;
    setSmsKnowledgeBaseSyncBusy(true);
    try {
      const res = await fetch("/api/portal/ai-receptionist/sms-knowledge-base/sync", {
        method: "POST",
        headers: { "content-type": "application/json", ...variantHeaders },
        body: JSON.stringify({ knowledgeBase: ensureKnowledgeBase(settings.smsKnowledgeBase) }),
      }).catch(() => null as any);

      const json = (await res?.json?.().catch(() => null)) as any;
      if (!res?.ok || !json || json.ok !== true) {
        throw new Error(String(json?.error || "Knowledge base sync failed"));
      }

      const count = Array.isArray(json.locators) ? json.locators.length : 0;
      toast.success(count ? `Knowledge base synced (${count} docs)` : "Knowledge base synced");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Knowledge base sync failed");
    } finally {
      setSmsKnowledgeBaseSyncBusy(false);
    }
  }

  async function uploadSmsKnowledgeBaseFile(file: File) {
    if (!settings) return;
    if (smsKnowledgeBaseUploadBusy) return;
    setSmsKnowledgeBaseUploadBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("knowledgeBase", JSON.stringify(ensureKnowledgeBase(settings.smsKnowledgeBase)));

      const res = await fetch("/api/portal/ai-receptionist/sms-knowledge-base/upload", {
        method: "POST",
        headers: variantHeaders,
        body: fd,
      }).catch(() => null as any);

      const json = (await res?.json?.().catch(() => null)) as any;
      if (!res?.ok || !json || json.ok !== true) {
        throw new Error(String(json?.error || "That file did not upload. Try again here or review the knowledge base settings."));
      }

      toast.success("File added to knowledge base");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That file did not upload. Try again here or review the knowledge base settings.");
    } finally {
      setSmsKnowledgeBaseUploadBusy(false);
    }
  }

  function updateEventTags(eventId: string, next: ContactTag[]) {
    setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, contactTags: next } : e)));
  }

  const updateEventContact = useCallback(
    (
      contactId: string,
      next: { contact: { id: string; name: string; email: string | null; phone: string | null } | null; tags: ContactTag[] },
    ) => {
      setEvents((prev) =>
        prev.map((event) => {
          if (String(event.contactId || "") !== contactId) return event;
          return {
            ...event,
            contactName: next.contact?.name ?? event.contactName,
            contactEmail: next.contact?.email ?? event.contactEmail,
            contactPhone: next.contact?.phone ?? event.contactPhone,
            contactTags: next.tags,
          };
        }),
      );
    },
    [],
  );

  const openContactDetails = useCallback((contactId: string | null | undefined) => {
    const stableContactId = String(contactId || "").trim();
    if (!stableContactId) return;
    setContactDetailsContactId(stableContactId);
    setContactDetailsOpen(true);
  }, []);

  const setSelectedCallWithUrl = useCallback((nextId: string | null) => {
    setSelectedCallId(nextId);
    try {
      const url = new URL(window.location.href);
      if (!nextId) url.searchParams.delete("call");
      else url.searchParams.set("call", nextId);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }, []);

  const openCallDetails = useCallback(
    (nextId: string) => {
      setSelectedCallWithUrl(nextId);
    },
    [setSelectedCallWithUrl],
  );

  const loadContactTags = useCallback(async () => {
    const res = await fetch("/api/portal/contact-tags", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
    const json = (await res?.json?.().catch(() => null)) as any;
    if (res?.ok && json?.ok === true && Array.isArray(json.tags)) {
      setContactTags(json.tags as ContactTag[]);
    }
  }, [variantHeaders]);

  const handleCreatedContactTag = useCallback(
    (created: CreateContactTagResult) => {
      setContactTags((prev) => {
        const next = [...prev.filter((tag) => tag.id !== created.id), created as ContactTag];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });
      setSettings((prev) => {
        if (!prev || !createTagTarget) return prev;
        const addUnique = (ids: string[]) => (ids.includes(created.id) ? ids : [...ids, created.id]);
        if (createTagTarget === "voiceInclude") return { ...prev, voiceIncludeTagIds: addUnique(prev.voiceIncludeTagIds || []) };
        if (createTagTarget === "voiceExclude") return { ...prev, voiceExcludeTagIds: addUnique(prev.voiceExcludeTagIds || []) };
        if (createTagTarget === "smsInclude") return { ...prev, smsIncludeTagIds: addUnique(prev.smsIncludeTagIds || []) };
        if (createTagTarget === "smsExclude") return { ...prev, smsExcludeTagIds: addUnique(prev.smsExcludeTagIds || []) };
        return prev;
      });
      setVoiceIncludeAddTagValue(EMPTY_TAG_OPTION_VALUE);
      setVoiceExcludeAddTagValue(EMPTY_TAG_OPTION_VALUE);
      setSmsIncludeAddTagValue(EMPTY_TAG_OPTION_VALUE);
      setSmsExcludeAddTagValue(EMPTY_TAG_OPTION_VALUE);
      setCreateTagTarget(null);
    },
    [createTagTarget],
  );

  const load = useCallback(async (): Promise<ApiPayload | null> => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    setError(null);
    setNote(null);

    let didLoad = false;
    try {
      const res = await fetch("/api/portal/ai-receptionist/settings", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
      if (!res?.ok) {
        const rawError = res ? await readJsonError(res) : null;
        setError(friendlyApiError({ status: res?.status, rawError, action: "load" }));
        return null;
      }

      const data = (await res.json().catch(() => null)) as ApiPayload | null;
      if (!data?.ok || !data.settings) {
        setError(friendlyApiError({ status: res.status, rawError: data?.error ?? null, action: "load" }));
        return null;
      }

      // Auto-populate business name from Business Profile if not already set
      let settingsToUse = data.settings;
      if (!settingsToUse.businessName?.trim()) {
        try {
          const profileRes = await fetch("/api/portal/business-profile", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
          if (profileRes?.ok) {
            const profileJson = (await profileRes.json().catch(() => null)) as any;
            if (profileJson?.ok && profileJson?.profile?.businessName) {
              settingsToUse = {
                ...settingsToUse,
                businessName: String(profileJson.profile.businessName).trim(),
              };
            }
          }
        } catch {
          // Ignore errors; just use settings as-is
        }
      }

      setSettings(settingsToUse);
      lastSavedSettingsJsonRef.current = JSON.stringify(data.settings);
      setEvents(Array.isArray(data.events) ? data.events : []);
      setWebhookUrl(data.webhookUrl || "");
      setTwilioConfigured(Boolean(data.twilioConfigured ?? data.twilio?.configured));

      didLoad = true;
      return data;
    } finally {
      if (didLoad) hasLoadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [friendlyApiError, readJsonError, variantHeaders]);

  const loadEventsOnly = useCallback(async (): Promise<boolean> => {
    const res = await fetch("/api/portal/ai-receptionist/settings", { cache: "no-store", headers: variantHeaders }).catch(() => null as any);
    if (!res?.ok) return false;
    const data = (await res.json().catch(() => null)) as ApiPayload | null;
    if (!data?.ok || !Array.isArray(data.events)) return false;
    setEvents(data.events);
    return true;
  }, [variantHeaders]);

  const syncCallArtifacts = useCallback(
    async (callSid: string) => {
      const sid = String(callSid || "").trim();
      if (!sid) return;
      if (callSyncBusy) return;

      setCallSyncBusy(true);
      try {
        const res = await fetch(`/api/portal/ai-receptionist/events/${encodeURIComponent(sid)}`, {
          method: "POST",
          headers: { "content-type": "application/json", ...variantHeaders },
          body: "{}",
        }).catch(() => null as any);

        const json = (await res?.json?.().catch(() => null)) as any;
        if (!res || !res.ok || !json || json.ok !== true) {
          throw new Error(json?.error || "Those call artifacts did not refresh. Try again here or review this call again in a moment.");
        }

        toast.success("Refreshing… transcript may take a minute");
        if (!(await loadEventsOnly())) {
          await load();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Those call artifacts did not refresh. Try again here or review this call again in a moment.");
      } finally {
        setCallSyncBusy(false);
      }
    },
    [callSyncBusy, load, loadEventsOnly, toast, variantHeaders],
  );

  const [confirmDeleteCallSid, setConfirmDeleteCallSid] = useState<string | null>(null);

  const deleteCallEventNow = useCallback(
    async (callSid: string) => {
      const sid = String(callSid || "").trim();
      if (!sid) return;
      if (callSyncBusy) return;

      setCallSyncBusy(true);
      try {
        const res = await fetch(`/api/portal/ai-receptionist/events/${encodeURIComponent(sid)}`, {
          method: "DELETE",
          cache: "no-store",
          headers: variantHeaders,
        }).catch(() => null as any);

        const json = (await res?.json?.().catch(() => null)) as any;
        if (!res || !res.ok || !json || json.ok !== true) {
          throw new Error(json?.error || "That call did not delete. Try again here or close this prompt and try again.");
        }

        toast.success("Deleted call");
        if (!(await loadEventsOnly())) {
          await load();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "That call did not delete. Try again here or close this prompt and try again.");
      } finally {
        setCallSyncBusy(false);
      }
    },
    [callSyncBusy, load, loadEventsOnly, toast, variantHeaders],
  );

  const deleteCallEvent = useCallback(
    async (callSid: string) => {
      const sid = String(callSid || "").trim();
      if (!sid) return;
      if (callSyncBusy) return;
      setConfirmDeleteCallSid(sid);
    },
    [callSyncBusy],
  );

  useEffect(() => {
    void load();
    void loadContactTags();
  }, [load, loadContactTags]);

  useEffect(() => {
    // Auto-refresh activity while calls are in-progress or the selected call lacks a transcript,
    // so transcripts/notes show up without manual refresh.
    if (tab !== "activity") return;
    const hasPending = events.some((e) => {
      const inProgress = e.status === "IN_PROGRESS" || e.status === "UNKNOWN";
      const selectedWithoutTranscript = e.id === selectedCallId && !(e.transcript && e.transcript.trim());
      return inProgress || selectedWithoutTranscript;
    });

    // Also, if a call is completed and has a recording but no transcript yet,
    // automatically trigger the same sync flow as the "Refresh recording/transcript"
    // button so the user doesn't have to click it.
    try {
      const seen = autoSyncedCallSidsRef.current;
      for (const e of events) {
        const needsSync =
          e.status === "COMPLETED" &&
          Boolean((e.recordingSid && e.recordingSid.trim()) || (e.demoRecordingId && e.demoRecordingId.trim())) &&
          !(e.transcript && e.transcript.trim()) &&
          !seen.has(e.callSid);

        if (needsSync) {
          seen.add(e.callSid);
          void syncCallArtifacts(e.callSid);
        }
      }
    } catch {
      // best-effort only
    }

    if (!hasPending) return;

    const id = window.setInterval(() => {
      void loadEventsOnly();
    }, 10000);

    return () => window.clearInterval(id);
  }, [events, selectedCallId, loadEventsOnly, syncCallArtifacts, tab]);

  const setTabWithUrl = useCallback((nextTab: "settings" | "testing" | "activity" | "missed-call-textback") => {
    setTab(nextTab);
    try {
      const url = new URL(window.location.href);
      if (nextTab === "activity") url.searchParams.delete("tab");
      else url.searchParams.set("tab", nextTab);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const t = url.searchParams.get("tab");
      if (t === "testing" || t === "activity" || t === "missed-call-textback" || t === "settings") {
        setTab(t);
      }

      const call = url.searchParams.get("call");
      if (call && call.trim()) {
        setSelectedCallId(call.trim());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!events.length) {
      if (selectedCallId) setSelectedCallId(null);
      return;
    }

    if (selectedCallId && events.some((e) => e.id === selectedCallId)) return;
    setSelectedCallId(events[0]?.id ?? null);
  }, [events, selectedCallId]);

  const selectedCall = useMemo(() => {
    if (selectedCallId) return events.find((e) => e.id === selectedCallId) ?? null;
    return events[0] ?? null;
  }, [events, selectedCallId]);

  function CallDetailsContent({ call, variant }: { call: EventRow; variant: "desktop" | "mobile" }) {
    const notes = deriveClientNotesFromEvent(call);
    const nameLine = (call.contactName || "").trim() || "No caller name yet";
    const phoneLine = (call.contactPhone || "").trim() || call.from;
    const dt = `${formatDate(call.createdAtIso)} ${formatTimeOfDay(call.createdAtIso)}`.trim();
    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {variant === "desktop" ? <div className="text-sm font-semibold text-zinc-900">Call details</div> : null}
            {call.contactId ? (
              <button
                type="button"
                onClick={() => openContactDetails(call.contactId)}
                className="mt-2 block w-full rounded-2xl border border-[rgba(29,78,216,0.16)] bg-white/80 px-3 py-3 text-left transition hover:border-[rgba(29,78,216,0.35)] hover:bg-[rgba(29,78,216,0.06)]"
              >
                <div className={classNames("text-sm font-semibold text-zinc-900", variant === "desktop" ? "font-medium" : "")}>
                  {nameLine}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  {phoneLine}
                  {call.contactEmail ? ` · ${call.contactEmail}` : ""}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {dt} · {call.status.toLowerCase()}
                </div>
              </button>
            ) : (
              <div className="mt-2 rounded-2xl border border-zinc-200 bg-white/70 px-3 py-3">
                <div className={classNames("text-sm font-semibold text-zinc-900", variant === "desktop" ? "font-medium" : "")}>
                  {nameLine}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  {phoneLine}
                  {call.contactEmail ? ` · ${call.contactEmail}` : ""}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {dt} · {call.status.toLowerCase()}
                </div>
              </div>
            )}
          </div>

          <div className="text-right text-xs text-zinc-500">
            <button
              type="button"
              disabled={saving || callSyncBusy}
              onClick={() => void deleteCallEvent(call.callSid)}
              className={
                "mt-2 inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-sm font-semibold " +
                (saving || callSyncBusy
                  ? "bg-zinc-100 text-zinc-500"
                  : "bg-red-50 text-red-600 hover:bg-red-100")
              }
              title="Remove this call from the Activity list"
            >
              Delete
            </button>
          </div>
        </div>

        {call.contactId ? (
          <div className="mt-3">
            <div className="text-xs font-semibold text-zinc-600">Tags</div>
            <div className="mt-2">
              <ContactTagsEditor
                compact
                contactId={call.contactId}
                tags={Array.isArray(call.contactTags) ? call.contactTags : []}
                onChange={(next) => updateEventTags(call.id, next)}
              />
            </div>
          </div>
        ) : null}

        {notes ? (
          <div className="mt-4">
            <div className="text-xs font-semibold text-zinc-600">Notes</div>
            <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{notes}</div>
          </div>
        ) : null}

        <div className="mt-4">
          <div className="text-xs font-semibold text-zinc-600">Recording</div>
          {(() => {
            const src =
              (call.recordingSid && call.recordingSid.trim())
                ? `/api/portal/ai-receptionist/recordings/${encodeURIComponent(call.recordingSid)}`
                : (call.demoRecordingId && call.demoRecordingId.trim())
                    ? `/api/portal/ai-receptionist/recordings/demo/${encodeURIComponent(call.demoRecordingId)}`
                    : "";
            if (!src) {
              return (
                <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  <div className="font-semibold text-zinc-900">No recording ready yet</div>
                  <div className="mt-1">This call does not have a recording attached yet. If it just finished, refresh activity or review the phone setup before testing again.</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void loadEventsOnly()}
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                    >
                      Refresh calls
                    </button>
                    <button
                      type="button"
                      onClick={() => setTabWithUrl("settings")}
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                    >
                      Open settings
                    </button>
                    <Link
                      href={`${portalBase}/app/ai-chat?onboarding=1`}
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                    >
                      Ask Pura
                    </Link>
                  </div>
                </div>
              );
            }
            return <MiniAudioPlayer src={src} durationHintSec={call.recordingDurationSec ?? null} />;
          })()}
        </div>

        <div className="mt-5">
          <div className="text-xs font-semibold text-zinc-600">Transcript</div>
          {call.transcript && call.transcript.trim() ? (
            <div className="mt-2 max-h-130 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="whitespace-pre-wrap text-sm text-zinc-800">{call.transcript}</div>
            </div>
          ) : (
            <div className="mt-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              <div className="font-semibold text-zinc-900">Transcript still processing</div>
              <div className="mt-1">It can take a minute to appear after the call ends. If this was a fresh call, refresh the call list or review the voice settings if it never shows up.</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadEventsOnly()}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Refresh calls
                </button>
                <button
                  type="button"
                  onClick={() => setTabWithUrl("settings")}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Open settings
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  const confirmDeleteEvent = useMemo(() => {
    const sid = String(confirmDeleteCallSid || "").trim();
    if (!sid) return null;
    const match = events.find((e) => String(e.callSid || "").trim() === sid) || null;
    return {
      callSid: sid,
      label: match
        ? `${String(match.from || "Caller number syncing").trim()} → ${String(match.to || "").trim() || ""}`.trim()
        : "",
    };
  }, [confirmDeleteCallSid, events]);

  const setSidebarOverride = useSetPortalSidebarOverride();
  const receptionistSidebar = useMemo(() => {
    const sectionButton = (
      key: "activity" | "testing" | "missed-call-textback" | "settings",
      label: string,
      icon?: React.ReactNode,
    ) => (
      <PortalSidebarNavButton
        key={key}
        type="button"
        onClick={() => setTabWithUrl(key)}
        aria-current={tab === key ? "page" : undefined}
        label={label}
        icon={icon}
        iconToneClassName={key === "settings" ? portalSidebarIconToneNeutralClass : portalSidebarIconToneBlueClass}
        className={classNames(
          portalSidebarButtonBaseClass,
          tab === key ? portalSidebarButtonActiveClass : portalSidebarButtonInactiveClass,
        )}
      >
        {label}
      </PortalSidebarNavButton>
    );

    return (
      <div className="space-y-4">
        <div>
          <div className={portalSidebarSectionTitleClass}>AI Receptionist</div>
          <div className={portalSidebarSectionStackClass}>
            {sectionButton("activity", "Activity", <IconReceptionistActivity />)}
            {sectionButton("testing", "Testing", <IconReceptionistTesting />)}
            {sectionButton("missed-call-textback", "Missed call text back", <IconMissedCallTextBack />)}
            {sectionButton("settings", "Settings", <IconSidebarSettings />)}
          </div>
        </div>

        {tab === "settings" ? (
          <div>
            <div className={portalSidebarSectionTitleClass}>Settings</div>
            <div className={portalSidebarSectionStackClass}>
              <PortalSidebarNavButton
                type="button"
                onClick={() => setSettingsSubTab("voice")}
                label="Voice"
                icon={<IconCalls />}
                iconToneClassName={portalSidebarIconToneBlueClass}
                className={classNames(
                  portalSidebarButtonBaseClass,
                  settingsSubTab === "voice" ? portalSidebarButtonActiveClass : portalSidebarButtonInactiveClass,
                )}
              >
                Voice
              </PortalSidebarNavButton>
              <PortalSidebarNavButton
                type="button"
                onClick={() => setSettingsSubTab("sms")}
                label="SMS"
                icon={<IconMessages />}
                iconToneClassName={portalSidebarIconToneBlueClass}
                className={classNames(
                  portalSidebarButtonBaseClass,
                  settingsSubTab === "sms" ? portalSidebarButtonActiveClass : portalSidebarButtonInactiveClass,
                )}
              >
                SMS
              </PortalSidebarNavButton>
            </div>
          </div>
        ) : null}

        {tab === "activity" && events.length ? (
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className={portalSidebarSectionTitleClass}>Recent calls</div>
              <div className="pr-3 text-[11px] text-zinc-400">{events.length}</div>
            </div>
            <div className={portalSidebarSectionStackClass}>
              {events.slice(0, 8).map((event) => {
                const active = event.id === selectedCallId;
                return (
                  <PortalSidebarNavButton
                    key={event.id}
                    type="button"
                    onClick={() => openCallDetails(event.id)}
                    label={(event.contactName || "").trim() || event.from}
                    className={classNames(portalSidebarButtonBaseClass, active ? portalSidebarButtonActiveClass : portalSidebarButtonInactiveClass)}
                    aria-current={active ? "page" : undefined}
                  >
                    <div className="truncate text-sm font-semibold text-zinc-900">{(event.contactName || "").trim() || event.from}</div>
                    <div className={classNames(portalSidebarMetaTextClass, "flex items-center justify-between gap-2")}>
                      <span className="truncate">{formatDate(event.createdAtIso)}</span>
                      <span className="shrink-0">{formatTimeOfDay(event.createdAtIso)}</span>
                    </div>
                  </PortalSidebarNavButton>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  }, [events, openCallDetails, selectedCallId, setTabWithUrl, settingsSubTab, tab]);

  useEffect(() => {
    setSidebarOverride({
      desktopSidebarContent: receptionistSidebar,
      mobileSidebarContent: receptionistSidebar,
    });
  }, [receptionistSidebar, setSidebarOverride]);

  useEffect(() => {
    return () => setSidebarOverride(null);
  }, [setSidebarOverride]);

  const canSave = useMemo(() => {
    if (!settings) return false;
    if (!settings.greeting.trim()) return false;
    if (settings.mode === "FORWARD" && !String(settings.forwardToPhoneE164 || "").trim()) return false;
    if (settings.mode === "AI" && settings.aiCanTransferToHuman && !String(settings.forwardToPhoneE164 || "").trim()) return false;
    return true;
  }, [settings]);

  async function save(next: Settings) {
    setSaving(true);
    setError(null);
    setNote(null);

    const res = await fetch("/api/portal/ai-receptionist/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({ settings: next }),
    });

    const data = (await res.json().catch(() => null)) as ApiPayload | null;
    if (!res.ok || !data?.ok) {
      setSaving(false);
      setError(friendlyApiError({ status: res.status, rawError: data?.error ?? null, action: "save" }));
      return;
    }

    setSettings(data.settings);
    lastSavedSettingsJsonRef.current = JSON.stringify(data.settings);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setWebhookUrl(data.webhookUrl || webhookUrl);
    setSaving(false);
    setNote("Saved.");
    window.setTimeout(() => setNote(null), 1800);
  }

  async function saveSms(next: Settings) {
    setSaving(true);
    setError(null);
    setNote(null);

    const manualChatAgentId = String(next.manualChatAgentId || "").trim();

    const res = await fetch("/api/portal/ai-receptionist/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify(manualChatAgentId ? { settings: next } : { settings: next, syncChatAgent: true }),
    });

    const data = (await res.json().catch(() => null)) as ApiPayload | null;
    if (!res.ok || !data?.ok) {
      setSaving(false);
      setError(friendlyApiError({ status: res.status, rawError: data?.error ?? null, action: "save" }));
      return;
    }

    setSettings(data.settings);
    lastSavedSettingsJsonRef.current = JSON.stringify(data.settings);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setWebhookUrl(data.webhookUrl || webhookUrl);
    setSaving(false);
    setNote("Saved.");
    window.setTimeout(() => setNote(null), 1800);
  }

  async function saveEnabled(nextEnabled: boolean) {
    if (!settings) return;
    const prev = settings.enabled;

    setSavingEnabled(true);
    setError(null);

    const res = await fetch("/api/portal/ai-receptionist/settings", {
      method: "PUT",
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({ settings: { enabled: nextEnabled } }),
    }).catch(() => null as any);

    const data = (await res?.json?.().catch(() => null)) as ApiPayload | null;
    if (!res?.ok || !data?.ok) {
      setSavingEnabled(false);
      setSettings((cur) => (cur ? { ...cur, enabled: prev } : cur));
      setError(
        friendlyApiError({
          status: res?.status,
          rawError: (data as any)?.error ?? null,
          action: "save",
        }),
      );
      return;
    }

    setSettings((cur) => {
      if (!cur) return cur;
      const next = { ...cur, enabled: nextEnabled };
      lastSavedSettingsJsonRef.current = JSON.stringify(next);
      return next;
    });
    setSavingEnabled(false);
  }
  const showInitialShell = loading && !hasLoadedOnceRef.current;

  return (
    <div className={tab === "testing" ? "flex h-full flex-col" : ""}>
      <div className={classNames(tab === "testing" ? "flex h-full w-full flex-1 flex-col" : "mx-auto w-full max-w-6xl px-4 sm:px-6")}>
        {isMobileApp || (tab !== "activity" && tab !== "testing") ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div />
            <div className="ml-auto flex items-start gap-3">
              <div className="w-full sm:w-auto">
                <SuggestedSetupModalLauncher serviceSlugs={["ai-receptionist"]} buttonLabel="Suggested setup" />
              </div>
            </div>
          </div>
        ) : null}

        {!showInitialShell && note ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{note}</div> : null}

        {!showInitialShell && error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <div className="font-semibold">AI Receptionist needs attention</div>
            <div className="mt-1 text-red-800">{error}</div>
            <div className="mt-1 text-red-800/80">Retry here, then review AI Receptionist access if your phone workflow still looks incomplete.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Retry
              </button>
              {entitlementBlocked ? (
                <>
                  <Link
                    href={aiReceptionistEnableHref}
                    className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
                  >
                    Enable AI Receptionist
                  </Link>
                  <Link
                    href={`${portalBase}/app/ai-chat?onboarding=1`}
                    className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
                  >
                    Ask Pura
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href={`${portalBase}/app/services`}
                    className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
                  >
                    Open services
                  </Link>
                  <Link
                    href={`${portalBase}/app/ai-chat?onboarding=1`}
                    className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
                  >
                    Ask Pura
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : null}

        {!showInitialShell && !twilioConfigured ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">Connect Twilio to take calls</div>
            <div className="mt-1 text-amber-900/80">
              Add your Twilio details in your Profile to enable inbound calls.
              <span className="ml-2">
                <Link href={`${portalBase}/app/profile`} className="underline">
                  Open Profile
                </Link>
              </span>
            </div>
          </div>
        ) : null}

      {tab === "settings" ? (
        <div className="mt-4">
          <div className={isMobileApp ? "min-w-0 rounded-3xl border border-zinc-200 bg-white p-6" : "min-w-0 p-0"}>
            {isMobileApp ? (
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">Settings</div>
                <PortalSelectDropdown
                  value={tab}
                  onChange={(v) => setTabWithUrl(v as any)}
                  options={[
                    { value: "activity", label: "Activity" },
                    { value: "settings", label: "Settings" },
                    { value: "testing", label: "Testing" },
                    { value: "missed-call-textback", label: "Missed call text back" },
                  ]}
                  className="w-57.5 max-w-[60vw]"
                  buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                />
              </div>
            ) : null}

            <div className="mb-6 flex flex-wrap items-center gap-2 md:hidden">
              <button
                type="button"
                onClick={() => setSettingsSubTab("voice")}
                className={classNames(
                  "rounded-2xl px-4 py-2 text-xs font-semibold transition-colors duration-100",
                  settingsSubTab === "voice"
                    ? "border border-zinc-200 bg-zinc-100 text-zinc-900"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                )}
              >
                Voice
              </button>
              <button
                type="button"
                onClick={() => setSettingsSubTab("sms")}
                className={classNames(
                  "rounded-2xl px-4 py-2 text-xs font-semibold transition-colors duration-100",
                  settingsSubTab === "sms"
                    ? "border border-zinc-200 bg-zinc-100 text-zinc-900"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                )}
              >
                SMS
              </button>
            </div>

            {showInitialShell ? (
              <PortalPageLoadingShell embedded sections={2} minHeightClassName="min-h-[26rem]" />
            ) : settingsSubTab === "voice" ? (
              <>
                <div className="mb-4 space-y-4">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900">{settings?.enabled ? "Enabled" : "Disabled"}</div>
                        <div className="mt-0.5 text-xs text-zinc-600">Picks up inbound calls when enabled.</div>
                      </div>
                      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={Boolean(settings?.enabled)}
                          disabled={saving || savingEnabled || !settings}
                          onChange={(e) => {
                            if (!settings) return;
                            const nextEnabled = e.target.checked;
                            setSettings({ ...settings, enabled: nextEnabled });
                            void saveEnabled(nextEnabled);
                          }}
                        />
                        <span className="h-6 w-11 rounded-full bg-zinc-200 transition peer-checked:bg-(--color-brand-blue) peer-focus-visible:ring-2 peer-focus-visible:ring-brand-ink/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white peer-disabled:opacity-60" />
                        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                      </span>
                    </div>

                    <div className="mt-4 max-w-sm">
                      <div className="text-xs font-semibold text-zinc-600">Mode</div>
                      <PortalListboxDropdown
                        value={settings?.mode ?? "AI"}
                        disabled={saving || !settings}
                        onChange={(v) => settings && setSettings({ ...settings, mode: v })}
                        options={[
                          { value: "AI", label: "AI receptionist" },
                          { value: "FORWARD", label: "Forward calls" },
                        ]}
                        className="mt-2 w-full"
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                      />
                    </div>
                  </div>

                  {settings?.mode === "AI" ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">Generate with AI</div>
                          <div className="mt-0.5 text-xs text-zinc-600">
                            Uses your Business Profile, including the custom business context blurb.
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={saving || !settings || generateBusy}
                          onClick={() => void generateReceptionistCopy()}
                          className={classNames(
                            "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold",
                            saving || !settings || generateBusy
                              ? "bg-zinc-200 text-zinc-600"
                              : "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) text-white shadow-sm hover:opacity-90",
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

                      <div className="mt-3">
                        <div className="text-xs font-semibold text-zinc-600">Additional context (optional)</div>
                        <textarea
                          className="mt-2 min-h-22.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={generateContext}
                          onChange={(e) => setGenerateContext(e.target.value)}
                          placeholder="Example: We answer calls for a boutique dental practice. If it's a new patient, ask what they're looking for and offer to book a consultation. Office hours are Mon-Fri 9-5."
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-zinc-600">Greeting</div>
                  <button
                    type="button"
                    disabled={saving || !settings || polishBusy === "voiceGreeting"}
                    onClick={() => void polishReceptionistText("voiceGreeting")}
                    className={classNames(
                      "inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-[11px] font-semibold",
                      saving || !settings || polishBusy === "voiceGreeting"
                        ? "bg-zinc-200 text-zinc-600"
                        : "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) text-white shadow-sm hover:opacity-90",
                    )}
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
                      <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
                      <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14z" />
                    </svg>
                    <span>{polishBusy === "voiceGreeting" ? "Polishing…" : "AI Polish"}</span>
                  </button>
                </div>
                <textarea
                        className="mt-2 min-h-22.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings?.greeting ?? ""}
                  onChange={(e) => settings && setSettings({ ...settings, greeting: e.target.value })}
                />
              </label>

              <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-zinc-600">System prompt</div>
                  <button
                    type="button"
                    disabled={saving || !settings || polishBusy === "voiceSystemPrompt"}
                    onClick={() => void polishReceptionistText("voiceSystemPrompt")}
                    className={classNames(
                      "inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-[11px] font-semibold",
                      saving || !settings || polishBusy === "voiceSystemPrompt"
                        ? "bg-zinc-200 text-zinc-600"
                        : "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) text-white shadow-sm hover:opacity-90",
                    )}
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
                      <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
                      <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14z" />
                    </svg>
                    <span>{polishBusy === "voiceSystemPrompt" ? "Polishing…" : "AI Polish"}</span>
                  </button>
                </div>
                <textarea
                  className="mt-2 min-h-40 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings?.systemPrompt ?? ""}
                  onChange={(e) => settings && setSettings({ ...settings, systemPrompt: e.target.value })}
                />
                <div className="mt-2 text-xs text-zinc-600">This guides how your receptionist responds.</div>
              </label>

              <div className="grid grid-cols-1 gap-4 sm:col-span-2 xl:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                  <div className="text-xs font-semibold text-zinc-600">Always answer these tags (optional)</div>
                  <PortalListboxDropdown
                    value={voiceIncludeAddTagValue}
                    options={buildAddTagOptionsFromTags(contactTags, settings?.voiceIncludeTagIds ?? [], "", true) as any}
                    onChange={(v) => {
                      const id = String(v || "");
                      if (!id) {
                        setVoiceIncludeAddTagValue("");
                        return;
                      }
                      if (id === NEW_TAG_OPTION_VALUE) {
                        setCreateTagTarget("voiceInclude");
                        setCreateTagOpen(true);
                        setVoiceIncludeAddTagValue(EMPTY_TAG_OPTION_VALUE);
                        return;
                      }
                      if (!settings) return;
                      const next = new Set(settings.voiceIncludeTagIds || []);
                      next.add(id);
                      setVoiceIncludeAddTagValue("");
                      setSettings({ ...settings, voiceIncludeTagIds: Array.from(next).slice(0, 60) });
                    }}
                    disabled={!settings || saving}
                    placeholder="Add tag"
                    className="mt-3 w-full"
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {(settings?.voiceIncludeTagIds ?? []).length ? (
                      (settings?.voiceIncludeTagIds ?? []).map((id) => {
                        const t = contactTags.find((x) => x.id === id);
                        const label = t?.name ? t.name : id;
                        return (
                          <button
                            key={id}
                            type="button"
                            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-100"
                            onClick={() => {
                              if (!settings) return;
                              setSettings({ ...settings, voiceIncludeTagIds: (settings.voiceIncludeTagIds || []).filter((x) => x !== id) });
                            }}
                          >
                            {label} <span className="ml-1 text-zinc-500">×</span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="text-xs text-zinc-500">Leave empty to answer all callers by default.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                  <div className="text-xs font-semibold text-zinc-600">Never answer these tags (optional)</div>
                  <PortalListboxDropdown
                    value={voiceExcludeAddTagValue}
                    options={buildAddTagOptionsFromTags(contactTags, settings?.voiceExcludeTagIds ?? [], "", true) as any}
                    onChange={(v) => {
                      const id = String(v || "");
                      if (!id) {
                        setVoiceExcludeAddTagValue("");
                        return;
                      }
                      if (id === NEW_TAG_OPTION_VALUE) {
                        setCreateTagTarget("voiceExclude");
                        setCreateTagOpen(true);
                        setVoiceExcludeAddTagValue(EMPTY_TAG_OPTION_VALUE);
                        return;
                      }
                      if (!settings) return;
                      const next = new Set(settings.voiceExcludeTagIds || []);
                      next.add(id);
                      setVoiceExcludeAddTagValue("");
                      setSettings({ ...settings, voiceExcludeTagIds: Array.from(next).slice(0, 60) });
                    }}
                    disabled={!settings || saving}
                    placeholder="Add tag"
                    className="mt-3 w-full"
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {(settings?.voiceExcludeTagIds ?? []).length ? (
                      (settings?.voiceExcludeTagIds ?? []).map((id) => {
                        const t = contactTags.find((x) => x.id === id);
                        const label = t?.name ? t.name : id;
                        return (
                          <button
                            key={id}
                            type="button"
                            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-100"
                            onClick={() => {
                              if (!settings) return;
                              setSettings({ ...settings, voiceExcludeTagIds: (settings.voiceExcludeTagIds || []).filter((x) => x !== id) });
                            }}
                          >
                            {label} <span className="ml-1 text-zinc-500">×</span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="text-xs text-zinc-500">Exclude rules win over include rules.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm sm:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-semibold text-zinc-600">Voice</div>
                    <div className="mt-1 text-xs text-zinc-600">Pick a voice for inbound calls.</div>
                    {settings?.manualAgentId?.trim() ? (
                      <div className="mt-1 text-[11px] text-amber-700">
                        Manual agent ID is set. Saving will apply changes to that agent.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-zinc-600">Selected voice</div>
                    <PortalListboxDropdown<string>
                      value={settings?.voiceId ?? ""}
                      onChange={(voiceId) => settings && setSettings({ ...settings, voiceId: String(voiceId || "").trim() })}
                      disabled={saving || savingEnabled || !settings}
                      placeholder="Default voice"
                      options={[
                        { value: "", label: "Default voice", hint: "" },
                        ...voiceLibraryVoices.map((v) => ({
                          value: v.id,
                          label:
                            v.category && !/^pre[-\s]?made$/i.test(v.category)
                              ? `${v.name} (${v.category})`
                              : v.name,
                          hint: v.description || "",
                        })),
                      ]}
                      renderOptionRight={(opt) => {
                        if (!opt.value) return null;
                        const isBusy = voicePreviewBusyVoiceId === opt.value;
                        const canClick = !saving && !savingEnabled && !voicePreviewBusyVoiceId;
                        return (
                          <span
                            role="button"
                            tabIndex={canClick ? 0 : -1}
                            aria-label={isBusy ? "Generating preview" : "Play preview"}
                            title={isBusy ? "Generating…" : "Play preview"}
                            className={classNames(
                              "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white shadow-sm",
                              canClick ? "bg-(--color-brand-blue) hover:opacity-95" : "bg-zinc-300 opacity-60",
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
                            {isBusy ? (
                              "…"
                            ) : (
                              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </span>
                        );
                      }}
                      className="mt-2"
                      buttonClassName="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                    />
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {settings?.voiceId?.trim() ? "Click the play icon next to a voice to preview." : "Using the default voice."}
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

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Knowledge base</div>
                    <div className="mt-1 text-[11px] text-zinc-600">
                      Add a website, notes, or files for the voice agent. Use Sync to ingest/update documents.
                    </div>
                    {settings?.manualAgentId?.trim() ? (
                      <div className="mt-1 text-[11px] text-amber-700">
                        Manual agent ID is set. Sync will apply the knowledge base to that agent ID.
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={saving || savingEnabled || !settings || voiceKnowledgeBaseSyncBusy}
                    onClick={() => void syncVoiceKnowledgeBase()}
                    className={classNames(
                      "rounded-xl px-3 py-2 text-xs font-semibold",
                      saving || savingEnabled || !settings || voiceKnowledgeBaseSyncBusy
                        ? "bg-zinc-200 text-zinc-600"
                        : "bg-sky-50 text-(--color-brand-blue) hover:bg-sky-100",
                    )}
                  >
                    {voiceKnowledgeBaseSyncBusy ? "Syncing…" : "Sync knowledge base"}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Seed URL</div>
                    <input
                      value={ensureKnowledgeBase(settings?.voiceKnowledgeBase ?? null).seedUrl}
                      onChange={(e) => {
                        if (!settings) return;
                        const seedUrl = e.target.value;
                        setSettings({
                          ...settings,
                          voiceKnowledgeBase: { ...ensureKnowledgeBase(settings.voiceKnowledgeBase), seedUrl },
                        });
                      }}
                      disabled={saving || savingEnabled || !settings}
                      placeholder="https://example.com"
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs font-semibold text-zinc-700">Crawl depth</div>
                      <PortalListboxDropdown<string>
                        value={String(ensureKnowledgeBase(settings?.voiceKnowledgeBase ?? null).crawlDepth ?? 0)}
                        options={[
                          { value: "0", label: "0" },
                          { value: "1", label: "1" },
                          { value: "2", label: "2" },
                          { value: "3", label: "3" },
                          { value: "4", label: "4" },
                          { value: "5", label: "5" },
                        ]}
                        onChange={(v) => {
                          if (!settings) return;
                          const crawlDepth = Number(v || 0);
                          setSettings({
                            ...settings,
                            voiceKnowledgeBase: { ...ensureKnowledgeBase(settings.voiceKnowledgeBase), crawlDepth },
                          });
                        }}
                        disabled={saving || savingEnabled || !settings}
                        buttonClassName="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-700">Max URLs</div>
                      <PortalListboxDropdown<string>
                        value={String(ensureKnowledgeBase(settings?.voiceKnowledgeBase ?? null).maxUrls ?? 0)}
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
                          if (!settings) return;
                          const maxUrls = Number(v || 0);
                          setSettings({
                            ...settings,
                            voiceKnowledgeBase: { ...ensureKnowledgeBase(settings.voiceKnowledgeBase), maxUrls },
                          });
                        }}
                        disabled={saving || savingEnabled || !settings}
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
                        disabled={saving || savingEnabled || !settings || voiceKnowledgeBaseUploadBusy}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          e.currentTarget.value = "";
                          if (file) void uploadVoiceKnowledgeBaseFile(file);
                        }}
                      />
                      <span
                        className={classNames(
                          "inline-flex cursor-pointer items-center rounded-xl border px-3 py-2 text-xs font-semibold",
                          saving || savingEnabled || !settings || voiceKnowledgeBaseUploadBusy
                            ? "border-zinc-200 bg-zinc-200 text-zinc-600"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                        )}
                      >
                        {voiceKnowledgeBaseUploadBusy ? "Uploading…" : "Upload file"}
                      </span>
                    </label>
                  </div>
                  <textarea
                    value={ensureKnowledgeBase(settings?.voiceKnowledgeBase ?? null).text}
                    onChange={(e) => {
                      if (!settings) return;
                      const text = e.target.value;
                      setSettings({
                        ...settings,
                        voiceKnowledgeBase: { ...ensureKnowledgeBase(settings.voiceKnowledgeBase), text },
                      });
                    }}
                    disabled={saving || savingEnabled || !settings}
                    rows={4}
                    placeholder="Add any important context, FAQs, pricing notes…"
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="mt-3 text-[11px] text-zinc-600">
                  {(() => {
                    const kb = settings?.voiceKnowledgeBase;
                    const count = kb && Array.isArray(kb.locators) ? kb.locators.length : 0;
                    if (!kb) {
                      return (
                        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                          <div className="font-semibold text-zinc-900">No knowledge base ready yet</div>
                          <div className="mt-1">Add notes above, upload a document, or sync once the first business context is ready so the voice agent has something real to use.</div>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              disabled={saving || savingEnabled || !settings || voiceKnowledgeBaseSyncBusy}
                              onClick={() => void syncVoiceKnowledgeBase()}
                              className={classNames(
                                "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition-colors duration-150",
                                saving || savingEnabled || !settings || voiceKnowledgeBaseSyncBusy ? "bg-zinc-200 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800",
                              )}
                            >
                              {voiceKnowledgeBaseSyncBusy ? "Syncing…" : "Sync knowledge base"}
                            </button>
                            <Link
                              href={`${portalBase}/app/ai-chat?onboarding=1`}
                              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                            >
                              Ask Pura for help
                            </Link>
                          </div>
                        </div>
                      );
                    }
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

              {settings?.mode === "AI" ? (
                <label className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 sm:col-span-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900">Allow AI to transfer to a human</div>
                    <div className="mt-0.5 text-xs text-zinc-600">
                      If enabled, your AI receptionist can choose to forward the call when needed.
                    </div>
                  </div>
                  <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={Boolean(settings?.aiCanTransferToHuman)}
                      disabled={saving || savingEnabled || !settings}
                      onChange={(e) => settings && setSettings({ ...settings, aiCanTransferToHuman: e.target.checked })}
                    />
                    <span className="h-6 w-11 rounded-full bg-zinc-200 transition peer-checked:bg-(--color-brand-blue) peer-focus-visible:ring-2 peer-focus-visible:ring-brand-ink/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white peer-disabled:opacity-60" />
                    <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                  </span>
                </label>
              ) : null}

              {settings?.mode === "FORWARD" || (settings?.mode === "AI" && settings?.aiCanTransferToHuman) ? (
                <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm sm:col-span-2">
                  <div className="text-xs font-semibold text-zinc-600">
                    {settings?.mode === "AI" ? "Transfer/forward to (E.164)" : "Forward to (E.164)"}
                  </div>
                  <input
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    value={settings?.forwardToPhoneE164 ?? ""}
                    onChange={(e) => settings && setSettings({ ...settings, forwardToPhoneE164: e.target.value || null })}
                    placeholder="+15551234567"
                  />
                  <div className="mt-2 text-xs text-zinc-600">
                    {settings?.mode === "AI"
                      ? "Required for AI transfer. Use E.164 format like +15551234567."
                      : `If blank, we’ll try your ${pathname.startsWith("/credit") ? "credit profile" : "portal profile"} phone.`}
                  </div>
                </label>
              ) : null}
            </div>

                <div className="mt-8">
                  <div className="text-sm font-semibold text-zinc-900">Advanced</div>
                  <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm sm:col-span-2">
                      <div className="text-xs font-semibold text-zinc-600">Manual agent ID</div>
                      <input
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={settings?.manualAgentId ?? ""}
                        onChange={(e) => settings && setSettings({ ...settings, manualAgentId: e.target.value })}
                        placeholder="agent_…"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      <div className="mt-2 text-xs text-zinc-600">
                        Optional. Use this when support provides an agent ID you want to use as-is.
                      </div>
                    </label>
                  </div>
                </div>
                <div className="mt-8" />
              </>
            ) : (
              <>
                <div className="mb-6 grid grid-cols-1 gap-4">
                  <label className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-900">Enable inbound SMS replies</div>
                      <div className="mt-0.5 text-xs text-zinc-600">
                        When enabled, inbound texts to your Twilio number can get an AI reply.
                      </div>
                      <div className="mt-1 text-xs text-zinc-600">SMS activity will show up in your Inbox/Outbox.</div>
                    </div>
                    <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={Boolean(settings?.smsEnabled)}
                        disabled={saving || savingEnabled || !settings}
                        onChange={(e) => settings && setSettings({ ...settings, smsEnabled: e.target.checked })}
                      />
                      <span className="h-6 w-11 rounded-full bg-zinc-200 transition peer-checked:bg-(--color-brand-blue) peer-focus-visible:ring-2 peer-focus-visible:ring-brand-ink/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white peer-disabled:opacity-60" />
                      <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
                    </span>
                  </label>

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Generate SMS prompt with AI</div>
                      <div className="mt-0.5 text-xs text-zinc-600">
                        Generates a system prompt specifically for inbound SMS replies.
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={saving || !settings || smsPromptBusy}
                      onClick={() => void generateSmsSystemPrompt()}
                      className={classNames(
                        "inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-semibold",
                        saving || !settings || smsPromptBusy
                          ? "bg-zinc-200 text-zinc-600"
                          : "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) text-white shadow-sm hover:opacity-90",
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
                      <span>{smsPromptBusy ? "Generating…" : "Generate"}</span>
                    </button>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-semibold text-zinc-600">Additional context (optional)</div>
                    <textarea
                      className="mt-2 min-h-22.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={smsGenerateContext}
                      onChange={(e) => setSmsGenerateContext(e.target.value)}
                      placeholder="Example: Keep replies under 320 chars. Ask 1 question at a time. If it's pricing, offer a link + ask for a good time to call."
                    />
                  </div>
                </div>
                </div>

                <div className="text-sm font-semibold text-zinc-900">Inbound SMS auto-replies (optional)</div>
                <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm sm:col-span-2">
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-zinc-600">SMS system prompt</div>
                        <button
                          type="button"
                          disabled={saving || !settings || polishBusy === "smsSystemPrompt"}
                          onClick={() => void polishReceptionistText("smsSystemPrompt")}
                          className={classNames(
                            "inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-[11px] font-semibold",
                            saving || !settings || polishBusy === "smsSystemPrompt"
                              ? "bg-zinc-200 text-zinc-600"
                              : "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) text-white shadow-sm hover:opacity-90",
                          )}
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
                            <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
                            <path d="M19 14l.8 2.6L22 17l-2.2.4L19 20l-.8-2.6L16 17l2.2-.4L19 14z" />
                          </svg>
                          <span>{polishBusy === "smsSystemPrompt" ? "Polishing…" : "AI Polish"}</span>
                        </button>
                      </div>
                      <div className="mt-1 text-xs text-zinc-600">
                        Used only for inbound SMS auto-replies. If blank, we’ll fall back to the main System prompt.
                      </div>
                    </div>

                    <textarea
                      className="mt-3 min-h-37.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={settings?.smsSystemPrompt ?? ""}
                      onChange={(e) => settings && setSettings({ ...settings, smsSystemPrompt: e.target.value })}
                      placeholder="Write how the AI should respond via SMS…"
                    />
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:col-span-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-xs font-semibold text-zinc-700">Knowledge base</div>
                        <div className="mt-1 text-[11px] text-zinc-600">
                          Add a website, notes, or files for the SMS agent. Use Sync to ingest/update documents.
                        </div>
                        {settings?.manualChatAgentId?.trim() ? (
                          <div className="mt-1 text-[11px] text-amber-700">
                            Manual messaging agent ID is set. Sync will apply the knowledge base to that agent ID.
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={saving || savingEnabled || !settings || smsKnowledgeBaseSyncBusy}
                        onClick={() => void syncSmsKnowledgeBase()}
                        className={classNames(
                          "rounded-xl px-3 py-2 text-xs font-semibold",
                          saving || savingEnabled || !settings || smsKnowledgeBaseSyncBusy
                            ? "bg-zinc-200 text-zinc-600"
                            : "bg-sky-50 text-(--color-brand-blue) hover:bg-sky-100",
                        )}
                      >
                        {smsKnowledgeBaseSyncBusy ? "Syncing…" : "Sync knowledge base"}
                      </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold text-zinc-700">Seed URL</div>
                        <input
                          value={ensureKnowledgeBase(settings?.smsKnowledgeBase ?? null).seedUrl}
                          onChange={(e) => {
                            if (!settings) return;
                            const seedUrl = e.target.value;
                            setSettings({
                              ...settings,
                              smsKnowledgeBase: { ...ensureKnowledgeBase(settings.smsKnowledgeBase), seedUrl },
                            });
                          }}
                          disabled={saving || savingEnabled || !settings}
                          placeholder="https://example.com"
                          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs font-semibold text-zinc-700">Crawl depth</div>
                          <PortalListboxDropdown<string>
                            value={String(ensureKnowledgeBase(settings?.smsKnowledgeBase ?? null).crawlDepth ?? 0)}
                            options={[
                              { value: "0", label: "0" },
                              { value: "1", label: "1" },
                              { value: "2", label: "2" },
                              { value: "3", label: "3" },
                              { value: "4", label: "4" },
                              { value: "5", label: "5" },
                            ]}
                            onChange={(v) => {
                              if (!settings) return;
                              const crawlDepth = Number(v || 0);
                              setSettings({
                                ...settings,
                                smsKnowledgeBase: { ...ensureKnowledgeBase(settings.smsKnowledgeBase), crawlDepth },
                              });
                            }}
                            disabled={saving || savingEnabled || !settings}
                            buttonClassName="mt-1 flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                          />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-zinc-700">Max URLs</div>
                          <PortalListboxDropdown<string>
                            value={String(ensureKnowledgeBase(settings?.smsKnowledgeBase ?? null).maxUrls ?? 0)}
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
                              if (!settings) return;
                              const maxUrls = Number(v || 0);
                              setSettings({
                                ...settings,
                                smsKnowledgeBase: { ...ensureKnowledgeBase(settings.smsKnowledgeBase), maxUrls },
                              });
                            }}
                            disabled={saving || savingEnabled || !settings}
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
                            disabled={saving || savingEnabled || !settings || smsKnowledgeBaseUploadBusy}
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              e.currentTarget.value = "";
                              if (file) void uploadSmsKnowledgeBaseFile(file);
                            }}
                          />
                          <span
                            className={classNames(
                              "inline-flex cursor-pointer items-center rounded-xl border px-3 py-2 text-xs font-semibold",
                              saving || savingEnabled || !settings || smsKnowledgeBaseUploadBusy
                                ? "border-zinc-200 bg-zinc-200 text-zinc-600"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                            )}
                          >
                            {smsKnowledgeBaseUploadBusy ? "Uploading…" : "Upload file"}
                          </span>
                        </label>
                      </div>
                      <textarea
                        value={ensureKnowledgeBase(settings?.smsKnowledgeBase ?? null).text}
                        onChange={(e) => {
                          if (!settings) return;
                          const text = e.target.value;
                          setSettings({
                            ...settings,
                            smsKnowledgeBase: { ...ensureKnowledgeBase(settings.smsKnowledgeBase), text },
                          });
                        }}
                        disabled={saving || savingEnabled || !settings}
                        rows={4}
                        placeholder="Add any important context, FAQs, pricing notes…"
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="mt-3 text-[11px] text-zinc-600">
                      {(() => {
                        const kb = settings?.smsKnowledgeBase;
                        const count = kb && Array.isArray(kb.locators) ? kb.locators.length : 0;
                        if (!kb) {
                          return (
                            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                              <div className="font-semibold text-zinc-900">No knowledge base ready yet</div>
                              <div className="mt-1">Add notes above, upload a file, or sync once the SMS agent has enough business context to answer confidently.</div>
                              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <button
                                  type="button"
                                  disabled={saving || savingEnabled || !settings || smsKnowledgeBaseSyncBusy}
                                  onClick={() => void syncSmsKnowledgeBase()}
                                  className={classNames(
                                    "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition-colors duration-150",
                                    saving || savingEnabled || !settings || smsKnowledgeBaseSyncBusy ? "bg-zinc-200 text-zinc-600" : "bg-zinc-900 text-white hover:bg-zinc-800",
                                  )}
                                >
                                  {smsKnowledgeBaseSyncBusy ? "Syncing…" : "Sync knowledge base"}
                                </button>
                                <Link
                                  href={`${portalBase}/app/ai-chat?onboarding=1`}
                                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  Ask Pura for help
                                </Link>
                              </div>
                            </div>
                          );
                        }
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

                  <div className="grid grid-cols-1 gap-4 sm:col-span-2 xl:grid-cols-2">
                    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                      <div className="text-xs font-semibold text-zinc-600">Always reply to contacts with these tags (optional)</div>
                      <PortalListboxDropdown
                        value={smsIncludeAddTagValue}
                        options={buildAddTagOptionsFromTags(contactTags, settings?.smsIncludeTagIds ?? [], "", true) as any}
                        onChange={(v) => {
                          const id = String(v || "");
                          if (!id) {
                            setSmsIncludeAddTagValue("");
                            return;
                          }
                          if (id === NEW_TAG_OPTION_VALUE) {
                            setCreateTagTarget("smsInclude");
                            setCreateTagOpen(true);
                            setSmsIncludeAddTagValue(EMPTY_TAG_OPTION_VALUE);
                            return;
                          }
                          if (!settings) return;
                          const next = new Set(settings.smsIncludeTagIds || []);
                          next.add(id);
                          setSmsIncludeAddTagValue("");
                          setSettings({ ...settings, smsIncludeTagIds: Array.from(next).slice(0, 60) });
                        }}
                        disabled={!settings || saving}
                        placeholder="Select tags"
                        className="mt-3 w-full"
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {(settings?.smsIncludeTagIds ?? []).length ? (
                          (settings?.smsIncludeTagIds ?? []).map((id) => {
                            const t = contactTags.find((x) => x.id === id);
                            const label = t?.name ? t.name : id;
                            return (
                              <button
                                key={id}
                                type="button"
                                className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-100"
                                title="Remove"
                                onClick={() => {
                                  if (!settings) return;
                                  const next = (settings.smsIncludeTagIds || []).filter((x) => x !== id);
                                  setSettings({ ...settings, smsIncludeTagIds: next });
                                }}
                              >
                                {label} <span className="ml-1 text-zinc-500">×</span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                            <div className="font-semibold text-zinc-900">No reply tags selected</div>
                            <div className="mt-1">Replies currently go to everyone. Add include tags if SMS responses should stay limited to a narrower audience.</div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                      <div className="text-xs font-semibold text-zinc-600">Never reply to contacts with these tags (optional)</div>
                      <PortalListboxDropdown
                        value={smsExcludeAddTagValue}
                        options={buildAddTagOptionsFromTags(contactTags, settings?.smsExcludeTagIds ?? [], "", true) as any}
                        onChange={(v) => {
                          const id = String(v || "");
                          if (!id) {
                            setSmsExcludeAddTagValue("");
                            return;
                          }
                          if (id === NEW_TAG_OPTION_VALUE) {
                            setCreateTagTarget("smsExclude");
                            setCreateTagOpen(true);
                            setSmsExcludeAddTagValue(EMPTY_TAG_OPTION_VALUE);
                            return;
                          }
                          if (!settings) return;
                          const next = new Set(settings.smsExcludeTagIds || []);
                          next.add(id);
                          setSmsExcludeAddTagValue("");
                          setSettings({ ...settings, smsExcludeTagIds: Array.from(next).slice(0, 60) });
                        }}
                        disabled={!settings || saving}
                        placeholder="Select tags"
                        className="mt-3 w-full"
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {(settings?.smsExcludeTagIds ?? []).length ? (
                          (settings?.smsExcludeTagIds ?? []).map((id) => {
                            const t = contactTags.find((x) => x.id === id);
                            const label = t?.name ? t.name : id;
                            return (
                              <button
                                key={id}
                                type="button"
                                className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-100"
                                title="Remove"
                                onClick={() => {
                                  if (!settings) return;
                                  const next = (settings.smsExcludeTagIds || []).filter((x) => x !== id);
                                  setSettings({ ...settings, smsExcludeTagIds: next });
                                }}
                              >
                                {label} <span className="ml-1 text-zinc-500">×</span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="text-xs text-zinc-500">Exclude rules win over include rules.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <div className="text-sm font-semibold text-zinc-900">Advanced</div>
                  <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm sm:col-span-2">
                      <div className="text-xs font-semibold text-zinc-600">Manual messaging agent ID</div>
                      <div className="mt-1 text-xs text-zinc-600">Only used for inbound SMS auto-replies.</div>
                      <input
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={settings?.manualChatAgentId ?? ""}
                        onChange={(e) => settings && setSettings({ ...settings, manualChatAgentId: e.target.value })}
                        placeholder="agent_…"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      <div className="mt-2 text-xs text-zinc-600">Optional. If set, we use this messaging agent ID.</div>
                    </label>
                  </div>
                </div>

                <div className="mt-8" />
              </>
            )}

            {!showInitialShell ? (
              <div className="mt-6 flex items-center justify-start gap-2">
                <button
                  type="button"
                  className="rounded-2xl bg-sky-100 px-4 py-2 text-sm font-semibold text-(--color-brand-blue) transition-colors duration-100 hover:bg-sky-200 disabled:opacity-60"
                  disabled={saving || !settings || !canSave || !isDirty}
                  onClick={() => settings && void (settingsSubTab === "sms" ? saveSms(settings) : save(settings))}
                >
                  {saving ? "Saving…" : isDirty ? "Save" : "Saved"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "testing" ? (
        <div className={classNames("flex min-h-0 flex-1 flex-col", testingCallActive ? "bg-emerald-50" : "bg-white")}>
          <div className="flex items-center justify-end gap-3">
            {isMobileApp ? (
              <PortalSelectDropdown
                value={tab}
                onChange={(v) => setTabWithUrl(v as any)}
                options={[
                  { value: "activity", label: "Activity" },
                  { value: "settings", label: "Settings" },
                  { value: "testing", label: "Testing" },
                  { value: "missed-call-textback", label: "Missed call text back" },
                ]}
                className="w-57.5 max-w-[60vw]"
                buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
              />
            ) : null}
          </div>

          <div
            className={classNames(
              "grid min-h-0 flex-1 grid-cols-1",
              isMobileApp ? "mt-4 gap-4" : "mt-0 xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] xl:gap-0",
            )}
          >
            <div
              className={classNames(
                isMobileApp
                  ? "rounded-3xl border border-zinc-200 p-5 shadow-sm"
                  : "min-h-0 border-b border-zinc-200 px-6 py-6 xl:border-b-0 xl:border-r xl:px-8",
                testingCallActive ? "bg-emerald-50" : "bg-white",
              )}
            >
              <InlineElevenLabsAgentTester
                agentId={settings?.voiceAgentId}
                participantLabel="Receptionist"
                onCallActiveChange={setTestingCallActive}
                className="flex h-full min-h-168 flex-col"
              />
            </div>

            <div className={classNames(isMobileApp ? "rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm" : "min-h-0 bg-white px-6 py-6 xl:px-8")}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Messaging</div>
                  <div className="mt-0.5 text-xs text-zinc-600">Simulates what your AI Receptionist would reply to an inbound text.</div>
                </div>
                <button
                  type="button"
                  className={classNames(
                    "rounded-2xl bg-brand-blue/12 px-4 py-2 text-xs font-semibold text-(--color-brand-blue) transition-colors duration-150 hover:bg-brand-blue/18",
                    smsTestBusy ? "opacity-60" : "",
                  )}
                  disabled={!smsTestBusy && !smsTestInbound.trim()}
                  onClick={async () => {
                    if (smsTestBusy) {
                      try {
                        smsTestAbortRef.current?.abort();
                      } catch {
                        // ignore
                      }
                      return;
                    }
                    const inbound = smsTestInbound.trim();
                    if (!inbound) return;

                    const abortController = new AbortController();
                    smsTestAbortRef.current = abortController;

                    setSmsTestBusy(true);
                    setSmsTestWouldReply(null);
                    setSmsTestReason(null);
                    setSmsTestReply("");

                    try {
                      const res = await fetch("/api/portal/ai-receptionist/preview-sms-reply", {
                        method: "POST",
                        headers: { "content-type": "application/json", ...variantHeaders },
                        body: JSON.stringify({ inbound, contactTagIds: smsTestTagIds }),
                        signal: abortController.signal,
                      }).catch(() => null as any);

                      if (abortController.signal.aborted) {
                        return;
                      }

                      const json = (await res?.json?.().catch(() => null)) as any;
                      if (!res || !res.ok || !json || json.ok !== true) {
                        throw new Error(json?.error || "That reply preview is still syncing. Try again here or keep editing the test message.");
                      }

                      setSmsTestWouldReply(Boolean(json.wouldReply));
                      setSmsTestReason(typeof json.reason === "string" ? json.reason : null);
                      setSmsTestReply(typeof json.reply === "string" ? json.reply : "");
                    } catch (e) {
                      if (abortController.signal.aborted) {
                        return;
                      }
                      toast.error(e instanceof Error ? e.message : "That reply preview is still syncing. Try again here or keep editing the test message.");
                    } finally {
                      if (smsTestAbortRef.current === abortController) {
                        smsTestAbortRef.current = null;
                      }
                      setSmsTestBusy(false);
                    }
                  }}
                >
                  {smsTestBusy ? "Cancel preview" : "Preview reply"}
                </button>
              </div>

              <div className="mt-3">
                <div className="text-xs font-semibold text-zinc-600">Inbound message</div>
                <textarea
                  className="mt-2 min-h-22.5 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={smsTestInbound}
                  onChange={(e) => setSmsTestInbound(e.target.value)}
                  placeholder="Hey, are you open today?"
                />
              </div>

              <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="text-xs font-semibold text-zinc-700">Simulated contact tags (optional)</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {smsTestTagIds.length ? (
                    smsTestTagIds.map((id) => {
                      const t = contactTags.find((x) => x.id === id);
                      const label = t?.name ? t.name : id;
                      return (
                        <button
                          key={id}
                          type="button"
                          className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-900 transition-colors duration-150 hover:bg-zinc-100"
                          title="Remove"
                          onClick={() => setSmsTestTagIds((prev) => prev.filter((x) => x !== id))}
                        >
                          {label} <span className="ml-1 text-zinc-500">×</span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-xs text-zinc-500">No tags</div>
                  )}
                </div>

                <div className="mt-3">
                  <PortalListboxDropdown
                    value={smsTestAddTagValue}
                    options={buildAddTagOptionsFromTags(contactTags, smsTestTagIds, "") as any}
                    onChange={(v) => {
                      const id = String(v || "");
                      if (!id) {
                        setSmsTestAddTagValue("");
                        return;
                      }
                      setSmsTestAddTagValue("");
                      setSmsTestTagIds((prev) => Array.from(new Set([...prev, id])).slice(0, 60));
                    }}
                    disabled={!contactTags.length}
                    className="w-full"
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                  />
                </div>
              </div>

              {smsTestWouldReply !== null ? (
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold text-zinc-700">Result</div>
                  <div className="mt-1 text-sm text-zinc-800">
                    Would reply: <span className="font-semibold">{smsTestWouldReply ? "Yes" : "No"}</span>
                    {smsTestReason ? <span className="text-zinc-500"> · {smsTestReason}</span> : null}
                  </div>
                  {smsTestWouldReply ? (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-zinc-600">Reply</div>
                      <div className="mt-2 whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-900">
                        {smsTestReply || "(empty reply)"}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "missed-call-textback" ? (
        <div className={isMobileApp ? "mt-4 rounded-3xl border border-zinc-200 bg-white p-6" : "mt-4"}>
          {isMobileApp ? (
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">Missed call text back</div>
              <PortalSelectDropdown
                value={tab}
                onChange={(v) => setTabWithUrl(v as any)}
                options={[
                  { value: "activity", label: "Activity" },
                  { value: "settings", label: "Settings" },
                  { value: "testing", label: "Testing" },
                  { value: "missed-call-textback", label: "Missed call text back" },
                ]}
                className="w-57.5 max-w-[60vw]"
                buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
              />
            </div>
          ) : null}
          <PortalMissedCallTextBackClient embedded />
        </div>
      ) : null}

        {tab === "activity" ? (
          <div className={isMobileApp ? "mt-4 min-h-full bg-white p-6" : "mt-0 min-h-full bg-white px-6 pb-6 pt-1"}>
          <div className="flex items-center justify-end gap-3">
            {isMobileApp ? (
              <PortalSelectDropdown
                value={tab}
                onChange={(v) => setTabWithUrl(v as any)}
                options={[
                  { value: "activity", label: "Activity" },
                  { value: "settings", label: "Settings" },
                  { value: "testing", label: "Testing" },
                  { value: "missed-call-textback", label: "Missed call text back" },
                ]}
                className="w-57.5 max-w-[60vw]"
                buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
              />
            ) : null}
          </div>

          {!selectedCall ? (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
              <div className="font-semibold text-zinc-900">No receptionist calls yet</div>
              <div className="mt-1">Once the receptionist is connected and a caller reaches the number, call logs, recordings, and transcripts will show here.</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTabWithUrl("testing")}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open testing
                </button>
                <button
                  type="button"
                  onClick={() => setTabWithUrl("settings")}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Open settings
                </button>
                <Link
                  href={`${portalBase}/app/ai-chat?onboarding=1`}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Ask Pura
                </Link>
              </div>
            </div>
          ) : (
            <div className={isMobileApp ? "mt-4" : "mt-0"}>
              <CallDetailsContent call={selectedCall} variant={isMobileApp ? "mobile" : "desktop"} />
            </div>
          )}
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
            updateEventContact(stableContactId, next);
          }}
          zIndex={130160}
        />
        <CreateContactTagDialog
          open={createTagOpen}
          onClose={() => {
            setCreateTagOpen(false);
            setCreateTagTarget(null);
          }}
          onCreate={async (name, color) => {
            const res = await fetch("/api/portal/contact-tags", {
              method: "POST",
              headers: { "content-type": "application/json", ...variantHeaders },
              body: JSON.stringify({ name, color }),
            }).catch(() => null as any);

            const json = (await res?.json().catch(() => null)) as any;
            if (!res?.ok || !json?.ok || !json?.tag?.id) {
              throw new Error(String(json?.error || "That tag did not save. Try again here or keep using the current tag filters."));
            }
            return json.tag as CreateContactTagResult;
          }}
          onCreated={handleCreatedContactTag}
        />

      {confirmDeleteEvent ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setConfirmDeleteCallSid(null)}
        >
          <div
            className="w-full max-w-lg max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-zinc-900">Delete call from activity?</div>
            <div className="mt-2 text-sm text-zinc-600">Delete this call from activity. This can’t be undone.</div>
            {confirmDeleteEvent.label ? <div className="mt-2 text-xs text-zinc-500">{confirmDeleteEvent.label}</div> : null}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink transition-colors duration-150 hover:bg-zinc-50"
                onClick={() => setConfirmDeleteCallSid(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-red-700 disabled:opacity-60"
                disabled={callSyncBusy}
                onClick={async () => {
                  const sid = confirmDeleteEvent.callSid;
                  setConfirmDeleteCallSid(null);
                  await deleteCallEventNow(sid);
                }}
              >
                {callSyncBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      </div>
    </div>
  );
}
