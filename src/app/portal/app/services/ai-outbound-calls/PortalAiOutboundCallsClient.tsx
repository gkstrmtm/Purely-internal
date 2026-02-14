"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";
import { DEFAULT_TAG_COLORS } from "@/lib/tagColors.shared";
import { DEFAULT_VOICE_AGENT_CONFIG, type VoiceAgentConfig } from "@/lib/voiceAgentConfig.shared";

type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  script: string;
  audienceTagIds: string[];
  voiceAgentId: string;
  voiceAgentConfig: VoiceAgentConfig;
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

type ManualCall = {
  id: string;
  campaignId: string | null;
  toNumberE164: string;
  status: string;
  callSid: string | null;
  conversationId: string | null;
  recordingSid: string | null;
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
    case "CALLING":
    case "IN_PROGRESS":
      return "bg-sky-50 text-sky-700 border-sky-200";
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

function MiniAudioPlayer(props: { src: string; durationHintSec?: number | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(props.durationHintSec && props.durationHintSec > 0 ? props.durationHintSec : 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
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
  }, [props.src]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = rate;
  }, [rate]);

  const remaining = Math.max(0, (duration || 0) - (currentTime || 0));
  const hasDuration = ready && duration > 0;
  const sliderMax = hasDuration ? duration : Math.max(1, currentTime + 1);
  const sliderValue = Math.max(0, Math.min(sliderMax, currentTime || 0));

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

        <div className="min-w-[220px] flex-1">
          <input
            type="range"
            min={0}
            max={sliderMax}
            step={0.01}
            value={sliderValue}
            disabled={!ready}
            onChange={(ev) => {
              const el = audioRef.current;
              if (!el) return;
              const next = Number(ev.target.value);
              if (!Number.isFinite(next)) return;
              const limit = hasDuration ? duration : Math.max(next, currentTime + 0.01);
              el.currentTime = Math.max(0, Math.min(limit, next));
              setCurrentTime(el.currentTime);
            }}
            className="w-full"
          />
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-600">
            <span>{formatTime(currentTime)}</span>
            <span>{hasDuration ? `-${formatTime(remaining)}` : ""}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-zinc-600">Speed</div>
          <select
            className="rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm font-semibold text-zinc-900"
            value={String(rate)}
            onChange={(e) => setRate(Number(e.target.value))}
          >
            {[0.75, 1, 1.25, 1.5, 2].map((v) => (
              <option key={v} value={String(v)}>
                {v}x
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export function PortalAiOutboundCallsClient() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tags, setTags] = useState<ContactTag[]>([]);
  const [voiceTools, setVoiceTools] = useState<VoiceTool[]>([]);
  const [voiceToolsApiKeyConfigured, setVoiceToolsApiKeyConfigured] = useState(true);

  const [agentSyncRequired, setAgentSyncRequired] = useState(false);

  const [manualCallTo, setManualCallTo] = useState("");
  const [manualCallBusy, setManualCallBusy] = useState(false);
  const [manualCallSyncBusy, setManualCallSyncBusy] = useState(false);
  const [manualCallId, setManualCallId] = useState<string | null>(null);
  const [manualCall, setManualCall] = useState<ManualCall | null>(null);
  const [manualCalls, setManualCalls] = useState<ManualCall[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => campaigns.find((c) => c.id === selectedId) ?? null, [campaigns, selectedId]);

  const [tab, setTab] = useState<"settings" | "activity">("activity");

  useEffect(() => {
    setAgentSyncRequired(false);
    setManualCallId(null);
    setManualCall(null);
    setTab("activity");
  }, [selectedId]);

  async function loadManualCalls(campaignId?: string) {
    const qs = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : "";
    const res = await fetch(`/api/portal/ai-outbound-calls/manual-calls${qs}`, { cache: "no-store" }).catch(() => null as any);
    if (!res || !res.ok) return;
    const json = (await res.json().catch(() => null)) as ApiGetManualCallsResponse | null;
    if (!json || (json as any).ok !== true || !Array.isArray((json as any).manualCalls)) return;
    setManualCalls((json as any).manualCalls);
  }

  async function loadManualCall(id: string) {
    const res = await fetch(`/api/portal/ai-outbound-calls/manual-calls/${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null as any);
    if (!res || !res.ok) return;
    const json = (await res.json().catch(() => null)) as ApiGetManualCallResponse | null;
    if (!json || (json as any).ok !== true || !(json as any).manualCall) return;
    setManualCall((json as any).manualCall as ManualCall);
  }

  async function syncManualCallArtifacts(id: string) {
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
      toast.success(json.requestedTranscription ? "Refreshing… transcript may take a minute" : "Updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to refresh call artifacts");
    } finally {
      setManualCallSyncBusy(false);
    }
  }

  useEffect(() => {
    loadManualCalls(selected?.id || undefined);
  }, [selected?.id]);

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
  }, [manualCallId]);

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
  const [addTagValue, setAddTagValue] = useState<string>("");

  const [newTagName, setNewTagName] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [createTagColor, setCreateTagColor] = useState<(typeof DEFAULT_TAG_COLORS)[number]>("#2563EB");
  const [showCreateTag, setShowCreateTag] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [cRes, tRes] = await Promise.all([
        fetch("/api/portal/ai-outbound-calls/campaigns", { cache: "no-store" }),
        fetch("/api/portal/contact-tags", { cache: "no-store" }),
      ]);

      const cJson = (await cRes.json().catch(() => null)) as ApiGetCampaignsResponse | null;
      if (!cRes.ok || !cJson || !cJson.ok) {
        throw new Error((cJson as any)?.error || "Failed to load campaigns");
      }

      const tJson = (await tRes.json().catch(() => null)) as any;
      const nextTags: ContactTag[] = Array.isArray(tJson?.tags)
        ? tJson.tags
            .map((x: any) => ({
              id: String(x?.id || ""),
              name: String(x?.name || ""),
              color: x?.color ? String(x.color) : null,
            }))
            .filter((x: ContactTag) => Boolean(x.id && x.name))
        : [];

      if (!mountedRef.current) return;
      setCampaigns(cJson.campaigns);
      setTags(nextTags);
      if (!selectedId && cJson.campaigns[0]?.id) setSelectedId(cJson.campaigns[0].id);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

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
        addAudienceTag(json.tag.id);
      }

      toast.success("Tag created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create tag");
    } finally {
      setBusy(false);
    }
  }

  async function updateCampaign(
    patch: Partial<Pick<Campaign, "name" | "status" | "script" | "audienceTagIds" | "voiceAgentId">> & {
      voiceAgentConfig?: Partial<VoiceAgentConfig>;
    },
  ) {
    if (!selected) return;

    // Hint UX: when agent-related fields change, users must sync to apply changes to their live agent.
    if (patch.voiceAgentId !== undefined || patch.voiceAgentConfig !== undefined) {
      setAgentSyncRequired(true);
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

  async function syncVoiceAgent() {
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

      toast.success("Synced agent settings");
      setAgentSyncRequired(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to sync agent");
    } finally {
      setBusy(false);
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

  const addTagOptions = useMemo(() => {
    const selectedTagSet = new Set(selected?.audienceTagIds ?? []);
    const q = tagSearch.trim().toLowerCase();
    const usable = tags
      .filter((t) => !selectedTagSet.has(t.id))
      .filter((t) => (!q ? true : t.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [
      { value: "", label: "Add a tag…" },
      ...usable.map((t) => ({ value: t.id, label: t.name })),
      { value: "__create__", label: "Create tag…" },
    ];
  }, [tags, selected, tagSearch]);

  function addAudienceTag(tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;
    if (selected.audienceTagIds.includes(id)) return;
    const next = [...selected.audienceTagIds, id].slice(0, 50);
    updateCampaign({ audienceTagIds: next });
  }

  function removeAudienceTag(tagId: string) {
    if (!selected) return;
    const id = String(tagId || "").trim();
    if (!id) return;
    const next = selected.audienceTagIds.filter((x) => x !== id);
    updateCampaign({ audienceTagIds: next });
  }

  const selectedTags = useMemo(() => {
    const map = new Map(tags.map((t) => [t.id, t] as const));
    return (selected?.audienceTagIds ?? []).map((id) => map.get(id)).filter(Boolean) as ContactTag[];
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
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">AI Outbound Calls</h1>
          <p className="mt-1 text-sm text-zinc-600">Call a contact when they get a tag.</p>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <div className="text-sm font-semibold text-zinc-800">New campaign</div>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Name (optional)"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={createCampaign}
            className={classNames(
              "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold",
              busy ? "bg-zinc-200 text-zinc-600" : "bg-brand-ink text-white hover:opacity-95",
            )}
          >
            Create
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[320px,1fr]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-800">Campaigns</div>
          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="text-sm text-zinc-500">Loading…</div>
            ) : campaigns.length === 0 ? (
              <div className="text-sm text-zinc-500">No campaigns yet.</div>
            ) : (
              campaigns.map((c) => {
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={classNames(
                      "w-full rounded-2xl border px-3 py-3 text-left",
                      active ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:bg-zinc-50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-zinc-900">{c.name}</div>
                      <div className="shrink-0 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                        {c.status}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Queued: {c.enrollQueued} • Completed: {c.enrollCompleted}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-4">
          {!selected ? (
            <div className="text-sm text-zinc-500">Select a campaign.</div>
          ) : (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

                <div className="w-full sm:w-[220px]">
                  <div className="text-sm font-semibold text-zinc-800">Status</div>
                  <div className="mt-1">
                    <PortalListboxDropdown
                      value={selected.status}
                      options={statusOptions as any}
                      onChange={(v) => updateCampaign({ status: v as CampaignStatus })}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex w-full flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTab("settings")}
                  aria-current={tab === "settings" ? "page" : undefined}
                  className={
                    "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
                    (tab === "settings"
                      ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                  }
                >
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => setTab("activity")}
                  aria-current={tab === "activity" ? "page" : undefined}
                  className={
                    "flex-1 min-w-[160px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
                    (tab === "activity"
                      ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
                  }
                >
                  Activity
                </button>
              </div>

              {tab === "activity" ? (
                <div className="mt-4">
                  <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">Manual calls</div>
                        <div className="mt-1 text-sm text-zinc-600">
                          Type a number, press Call, then review the recording + transcript here.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
                        disabled={busy || manualCallBusy}
                        onClick={() => {
                          void loadManualCalls(selected.id);
                          if (manualCallId) void loadManualCall(manualCallId);
                        }}
                      >
                        Refresh
                      </button>
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
                        <div className="mt-2 text-[11px] text-zinc-500">
                          Recording + transcript usually appear 1–2 minutes after the call ends.
                        </div>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          disabled={busy || manualCallBusy || !manualCallTo.trim()}
                          onClick={() => void startManualCall()}
                          className={classNames(
                            "rounded-2xl px-5 py-2.5 text-sm font-semibold",
                            busy || manualCallBusy
                              ? "bg-zinc-200 text-zinc-600"
                              : "bg-brand-ink text-white hover:opacity-95",
                          )}
                        >
                          {manualCallBusy ? "Calling…" : "Call"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {manualCalls.length === 0 ? (
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
                                    ? "border-zinc-900 bg-zinc-900 text-white"
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
                                <div className={"mt-2 flex flex-wrap items-center gap-2 text-xs " + (isSelected ? "text-zinc-200" : "text-zinc-600")}>
                                  {hasAudio ? (
                                    <>
                                      <span className={isSelected ? "text-emerald-200" : "text-emerald-700"}>Audio</span>
                                      <span>•</span>
                                    </>
                                  ) : null}
                                  {hasTranscript ? (
                                    <span className={isSelected ? "text-sky-200" : "text-sky-700"}>Transcript</span>
                                  ) : (
                                    <span className={isSelected ? "text-zinc-300" : "text-zinc-500"}>Transcript pending</span>
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
                                <button
                                  type="button"
                                  disabled={busy || manualCallBusy || manualCallSyncBusy}
                                  onClick={() => {
                                    if (manualCall.id) void syncManualCallArtifacts(manualCall.id);
                                  }}
                                  className={
                                    "mt-2 inline-flex items-center justify-center rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold " +
                                    (busy || manualCallBusy || manualCallSyncBusy
                                      ? "border-zinc-200 bg-zinc-100 text-zinc-500"
                                      : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50")
                                  }
                                >
                                  {manualCallSyncBusy ? "Refreshing…" : "Refresh recording/transcript"}
                                </button>
                              </div>
                            </div>

                            {manualCall.lastError ? (
                              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                                <div className="font-semibold">Call issue</div>
                                <div className="mt-1 text-amber-900/80">{manualCall.lastError}</div>
                              </div>
                            ) : null}

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
                                    <MiniAudioPlayer src={src} />
                                    <div className="mt-2 text-xs">
                                      <a
                                        className="font-semibold text-brand-ink hover:underline"
                                        href={src}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
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
                                <div className="mt-2 max-h-[520px] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                                  <div className="whitespace-pre-wrap text-sm text-zinc-800">{manualCall.transcriptText}</div>
                                </div>
                              ) : (
                                <div className="mt-2 text-sm text-zinc-600">
                                  No transcript yet. It can take 1–2 minutes to appear after the call ends.
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-3xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
                            Select a call to view details.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>

              <div className="mt-5">
                <div className="text-sm font-semibold text-zinc-800">Call script</div>
                <p className="mt-1 text-xs text-zinc-500">
                  If set, this overrides the agent’s opening line for each call. Leave blank to use the agent’s configured first message.
                </p>
                <textarea
                  value={selected.script}
                  onChange={(e) => {
                    const script = e.target.value;
                    setCampaigns((prev) => prev.map((c) => (c.id === selected.id ? { ...c, script } : c)));
                  }}
                  onBlur={() => updateCampaign({ script: selected.script })}
                  rows={7}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div className="mt-5">
                <div className="text-sm font-semibold text-zinc-800">Voice agent</div>
                <p className="mt-1 text-xs text-zinc-500">
                  Optional: configure an agent ID + behavior for this campaign.
                </p>

                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                  <div className="font-semibold text-zinc-900">How this works</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-600">
                    <li>
                      Manage voice settings in <span className="font-semibold">Profile</span>.
                      <Link
                        href="/portal/profile"
                        className="ml-2 inline-flex items-center rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50"
                      >
                        Open Profile
                      </Link>
                    </li>
                    <li>Default Agent ID lives in your <span className="font-semibold">Profile</span>; you can override it per campaign.</li>
                    <li>Leaving behavior fields blank means Purely won’t overwrite your agent’s existing behavior when syncing.</li>
                    <li>The campaign <span className="font-semibold">Call script</span> (if set) overrides the agent’s first message for that call.</li>
                  </ul>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[11px] text-zinc-600">
                    After changing Agent ID, Tools, or behavior fields, click Sync to apply updates to your live agent.
                    {agentSyncRequired ? (
                      <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800 ring-1 ring-blue-200">
                        Sync required
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={syncVoiceAgent}
                    className={classNames(
                      "rounded-2xl px-4 py-2 text-xs font-semibold",
                      busy ? "bg-zinc-200 text-zinc-600" : "bg-brand-ink text-white hover:opacity-95",
                    )}
                    title={
                      voiceToolsApiKeyConfigured
                        ? "Push these settings to your live agent"
                        : "Push these settings to your live agent (requires voice API key in Profile)"
                    }
                  >
                    {busy ? "Syncing…" : "Sync agent settings"}
                  </button>
                </div>

                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                  <div className="font-semibold text-zinc-900">Manual calls</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Manual test calls (with recording + transcript) live in the <span className="font-semibold">Activity</span> tab.
                    <button
                      type="button"
                      onClick={() => setTab("activity")}
                      className="ml-2 inline-flex items-center rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50"
                    >
                      Open Activity
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Agent ID (campaign override)</div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      Leave blank to use your Profile agent ID. If you just signed up and haven’t received an agent ID yet,
                      it’s typically issued by Purely support—give it a couple hours, then reach out if needed.
                    </div>
                    <input
                      value={selected.voiceAgentId ?? ""}
                      onChange={(e) => {
                        const voiceAgentId = e.target.value;
                        setCampaigns((prev) =>
                          prev.map((c) => (c.id === selected.id ? { ...c, voiceAgentId } : c)),
                        );
                      }}
                      onBlur={() => updateCampaign({ voiceAgentId: (selected.voiceAgentId ?? "").trim() })}
                      placeholder="agent_... (optional)"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Tools</div>
                    <div className="mt-1 rounded-2xl border border-zinc-200 bg-white p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-[11px] text-zinc-600">
                          Pick the tools you want the agent to have access to. Hover a tool to see what it does.
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            className="h-9 rounded-xl border border-zinc-200 bg-white px-2 text-xs"
                            defaultValue="recommended"
                            onChange={(e) => {
                              const preset = String(e.target.value || "recommended") as
                                | "none"
                                | "recommended"
                                | "all";
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
                            title="Quick presets"
                          >
                            <option value="recommended">Recommended</option>
                            <option value="none">None</option>
                            <option value="all">All</option>
                          </select>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2">
                        {!voiceToolsApiKeyConfigured ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                            Add your voice API key in Profile to load tools.
                            <Link href="/portal/profile" className="ml-2 font-semibold underline underline-offset-2">
                              Go to Profile
                            </Link>
                          </div>
                        ) : null}
                        {voiceTools.length === 0 ? (
                          <div className="text-[11px] text-zinc-500">
                            No tools are available yet.
                          </div>
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
                                    {!configured && voiceToolsApiKeyConfigured ? " (Unavailable for this account.)" : ""}
                                  </div>
                                </span>
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  disabled={busy || (!configured && voiceToolsApiKeyConfigured)}
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

                <div className="mt-3">
                  <div className="text-xs font-semibold text-zinc-700">First message</div>
                  <input
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
                    placeholder="Hi — this is ..."
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold text-zinc-700">Goal</div>
                    <textarea
                      value={selected.voiceAgentConfig?.goal ?? ""}
                      onChange={(e) => {
                        const goal = e.target.value;
                        setCampaigns((prev) =>
                          prev.map((c) =>
                            c.id === selected.id
                              ? {
                                  ...c,
                                  voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), goal },
                                }
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
                              ? {
                                  ...c,
                                  voiceAgentConfig: { ...(c.voiceAgentConfig ?? DEFAULT_VOICE_AGENT_CONFIG), tone },
                                }
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
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-800">Audience tags</div>
                    <p className="mt-1 text-xs text-zinc-500">When a contact gets one of these tags, they’ll be queued for a call.</p>
                  </div>
                </div>

                <div className="mt-2 max-w-sm">
                  <input
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search tags…"
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  />
                  <div className="mt-2">
                  <PortalListboxDropdown
                    value={addTagValue}
                    options={addTagOptions as any}
                    onChange={(v) => {
                      const id = String(v || "");
                      if (!id) {
                        setAddTagValue("");
                        return;
                      }
                      if (id === "__create__") {
                        setAddTagValue("");
                        setShowCreateTag(true);
                        return;
                      }
                      setAddTagValue("");
                      addAudienceTag(id);
                    }}
                  />
                  </div>
                </div>

                {showCreateTag ? (
                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
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
                    <div className="mt-2 text-[11px] text-zinc-500">Pick a color from the standard palette.</div>
                  </div>
                ) : null}

                {selectedTags.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedTags.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => removeAudienceTag(t.id)}
                        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        title="Remove"
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#64748B" }} />
                        <span className="max-w-[180px] truncate">{t.name}</span>
                        <span className="text-zinc-400">×</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-zinc-500">No tags selected.</div>
                )}

              </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
