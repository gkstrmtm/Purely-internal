"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";

type ProfileResponse = {
  ok?: boolean;
  error?: string;
  user?: {
    voiceId?: string | null;
    defaultLoginPath?: string | null;
    themeMode?: "device" | "light" | "dark" | null;
    hideFloatingTools?: boolean;
    voiceAgentApiKeyConfigured?: boolean;
  } | null;
};

type VoiceLibraryVoice = {
  id: string;
  name: string;
  category?: string;
  description?: string;
};

type VoiceLibraryResponse = {
  ok?: boolean;
  error?: string;
  voices?: VoiceLibraryVoice[];
};

const DEFAULT_VOICE_PREVIEW_TEXT = "Hi there - this is the current Pura dictation voice preview.";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function dispatchPortalThemePreview(mode: "device" | "light" | "dark") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pa.portal.theme-preview", { detail: { mode } }));
}

function normalizeThemeMode(): "light" {
  return "light";
}

export function PortalAppearanceSettingsClient() {
  const pathname = usePathname() || "";
  const toast = useToast();
  const portalBase = pathname.startsWith("/credit") ? "/credit" : "/portal";
  const defaultLandingPath = `${portalBase}/app`;

  const pageOptions = useMemo(
    () => [
      { value: `${portalBase}/app`, label: "Dashboard" },
      { value: `${portalBase}/app/ai-chat`, label: "Pura" },
      { value: `${portalBase}/app/services`, label: "Services" },
    ],
    [portalBase],
  );
  const allowedDefaultLoginPaths = useMemo(() => new Set(pageOptions.map((option) => option.value)), [pageOptions]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [voiceLibraryLoading, setVoiceLibraryLoading] = useState(false);
  const [voicePreviewBusy, setVoicePreviewBusy] = useState(false);
  const [voicePreviewBusyVoiceId, setVoicePreviewBusyVoiceId] = useState<string | null>(null);
  const [voicePreviewShowControls, setVoicePreviewShowControls] = useState(false);
  const [voiceAgentApiKeyConfigured, setVoiceAgentApiKeyConfigured] = useState(false);
  const [voiceLibraryVoices, setVoiceLibraryVoices] = useState<VoiceLibraryVoice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [savedVoiceId, setSavedVoiceId] = useState("");
  const [defaultLoginPath, setDefaultLoginPath] = useState(defaultLandingPath);
  const [savedDefaultLoginPath, setSavedDefaultLoginPath] = useState(defaultLandingPath);
  const [themeMode, setThemeMode] = useState<"light" | null>(null);
  const [savedThemeMode, setSavedThemeMode] = useState<"light" | null>(null);
  const [hideFloatingTools, setHideFloatingTools] = useState(false);
  const [savedHideFloatingTools, setSavedHideFloatingTools] = useState(false);

  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewUrlRef = useRef<string | null>(null);
  const toastRef = useRef(toast);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const themeOptions = useMemo(
    () => [
      { value: "light", label: "Light" },
    ],
    [],
  );

  const widgetOptions = useMemo(
    () => [
      { value: "shown", label: "Show chat and report widget" },
      { value: "hidden", label: "Hide chat and report widget" },
    ],
    [],
  );

  const syncFloatingToolsPreference = useCallback((nextHidden: boolean) => {
    if (typeof document !== "undefined") {
      if (nextHidden) document.documentElement.setAttribute("data-pa-hide-floating-tools-pref", "1");
      else document.documentElement.removeAttribute("data-pa-hide-floating-tools-pref");
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pa.portal.floating-tools-pref", { detail: { hidden: nextHidden } }));
    }
  }, []);

  const normalizeDefaultLoginPathValue = useCallback(
    (input: unknown) => {
      const value = typeof input === "string" ? input.trim() : "";
      return allowedDefaultLoginPaths.has(value) ? value : defaultLandingPath;
    },
    [allowedDefaultLoginPaths, defaultLandingPath],
  );

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetch("/api/portal/profile", { cache: "no-store" }).catch(() => null as any);
    const json = (res ? ((await res.json().catch(() => null)) as ProfileResponse | null) : null) ?? null;
    if (!res?.ok || !json?.user) {
      const message = json?.error || "Appearance settings are still syncing. Retry here, open profile, or ask Pura to help.";
      setLoadError(message);
      toastRef.current.error(message);
      setLoading(false);
      return;
    }

    const nextVoiceId = String(json.user.voiceId || "").trim();
    const nextDefaultLoginPath = normalizeDefaultLoginPathValue(json.user.defaultLoginPath);
    setVoiceAgentApiKeyConfigured(Boolean(json.user.voiceAgentApiKeyConfigured));
    setSelectedVoiceId(nextVoiceId);
    setSavedVoiceId(nextVoiceId);
    setDefaultLoginPath(nextDefaultLoginPath);
    setSavedDefaultLoginPath(nextDefaultLoginPath);
    const nextThemeMode = normalizeThemeMode();
    const nextHideFloatingTools = Boolean(json.user.hideFloatingTools);
    setThemeMode(nextThemeMode);
    setSavedThemeMode(nextThemeMode);
    setHideFloatingTools(nextHideFloatingTools);
    setSavedHideFloatingTools(nextHideFloatingTools);
    syncFloatingToolsPreference(nextHideFloatingTools);
    setLoading(false);
  }, [normalizeDefaultLoginPathValue, syncFloatingToolsPreference]);

  const loadVoiceLibrary = useCallback(async () => {
    if (!voiceAgentApiKeyConfigured) return;
    setVoiceLibraryLoading(true);
    try {
      const res = await fetch("/api/portal/voice-agent/voices", { cache: "no-store" }).catch(() => null as any);
      const json = (res ? ((await res.json().catch(() => null)) as VoiceLibraryResponse | null) : null) ?? null;
      if (!res?.ok || json?.ok !== true || !Array.isArray(json?.voices)) {
        setVoiceLibraryVoices([]);
        return;
      }
      setVoiceLibraryVoices(
        json.voices
          .map((voice) => ({
            id: String(voice.id || "").trim(),
            name: String(voice.name || "").trim(),
            category: String(voice.category || "").trim() || undefined,
            description: String(voice.description || "").trim() || undefined,
          }))
          .filter((voice) => voice.id && voice.name)
          .slice(0, 200),
      );
    } finally {
      setVoiceLibraryLoading(false);
    }
  }, [voiceAgentApiKeyConfigured]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!voiceAgentApiKeyConfigured) {
      setVoiceLibraryVoices([]);
      return;
    }
    void loadVoiceLibrary();
  }, [loadVoiceLibrary, voiceAgentApiKeyConfigured]);

  useEffect(() => {
    return () => {
      const prev = voicePreviewUrlRef.current;
      if (prev) URL.revokeObjectURL(prev);
    };
  }, []);

  useEffect(() => {
    if (!themeMode) return;
    dispatchPortalThemePreview(themeMode);
  }, [themeMode]);

  const selectedVoiceMeta = useMemo(
    () => voiceLibraryVoices.find((voice) => voice.id === selectedVoiceId) || null,
    [selectedVoiceId, voiceLibraryVoices],
  );

  const dirty =
    selectedVoiceId !== savedVoiceId ||
    defaultLoginPath !== savedDefaultLoginPath ||
    hideFloatingTools !== savedHideFloatingTools;

  async function savePreferences() {
    if (saving || !dirty) return;
    setSaving(true);
    const res = await fetch("/api/portal/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        voiceId: selectedVoiceId || "",
        defaultLoginPath,
        hideFloatingTools,
      }),
    }).catch(() => null as any);

    const json = (res ? ((await res.json().catch(() => null)) as ProfileResponse | null) : null) ?? null;
    setSaving(false);
    if (!res?.ok || json?.ok !== true || !json.user) {
      toast.error(json?.error || "Appearance settings did not save. Retry here or ask Pura to help.");
      return;
    }

    const nextVoiceId = String(json.user.voiceId || "").trim();
    const nextDefaultLoginPath = normalizeDefaultLoginPathValue(json.user.defaultLoginPath || defaultLoginPath);
    const nextHideFloatingTools = Boolean(json.user.hideFloatingTools);
    setSelectedVoiceId(nextVoiceId);
    setSavedVoiceId(nextVoiceId);
    setDefaultLoginPath(nextDefaultLoginPath);
    setSavedDefaultLoginPath(nextDefaultLoginPath);
    setHideFloatingTools(nextHideFloatingTools);
    setSavedHideFloatingTools(nextHideFloatingTools);
    syncFloatingToolsPreference(nextHideFloatingTools);
    toast.success("Appearance settings saved");
  }

  async function playVoicePreview(voiceIdOverride?: string) {
    const voiceId = String(voiceIdOverride || selectedVoiceId || "").trim();
    if (!voiceId) {
      toast.error("Pick a voice first");
      return;
    }
    if (voicePreviewBusy) return;

    setVoicePreviewBusy(true);
    setVoicePreviewBusyVoiceId(voiceId);
    setVoicePreviewShowControls(false);
    try {
      const res = await fetch("/api/portal/voice-agent/voices/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId, text: DEFAULT_VOICE_PREVIEW_TEXT }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "Voice preview failed");
      }

      const blob = await res.blob().catch(() => null);
      if (!blob) throw new Error("Voice preview failed");

      const prev = voicePreviewUrlRef.current;
      if (prev) {
        URL.revokeObjectURL(prev);
        voicePreviewUrlRef.current = null;
      }

      const url = URL.createObjectURL(blob);
      voicePreviewUrlRef.current = url;
      const audio = voicePreviewAudioRef.current;
      if (audio) {
        audio.src = url;
        try {
          await audio.play();
        } catch {
          setVoicePreviewShowControls(true);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voice preview failed");
    } finally {
      setVoicePreviewBusy(false);
      setVoicePreviewBusyVoiceId(null);
    }
  }

  return (
    <div className="space-y-6">
      {loadError ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold text-red-900">Appearance settings need attention</div>
          <div className="mt-1">{loadError}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void loadProfile();
              }}
              className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Retry
            </button>
            <Link
              href={`${portalBase}/profile`}
              className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
            >
              Open profile
            </Link>
            <Link
              href={`${portalBase}/app/ai-chat?onboarding=1`}
              className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
            >
              Ask Pura
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-brand-ink">Theme</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Light mode is locked on for users so the portal always stays readable and consistent.
        </p>
        <div className="mt-4 w-full max-w-xs">
          <PortalListboxDropdown
            value={themeMode ?? savedThemeMode ?? "light"}
            options={themeOptions}
            onChange={() => undefined}
            disabled={true}
          />
        </div>
        <div className="mt-3 text-xs text-zinc-500">Dark mode has been turned off for users.</div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-brand-ink">Pura dictation voice</h2>
            <p className="mt-1 text-sm text-zinc-600">Choose the voice Pura uses when it reads dictated content back to you.</p>
          </div>
          {selectedVoiceId ? (
            <button
              type="button"
              onClick={() => void playVoicePreview()}
              disabled={voicePreviewBusy}
              className={classNames(
                "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                voicePreviewBusy ? "bg-zinc-400" : "bg-brand-blue transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95",
              )}
            >
              {voicePreviewBusy ? "Loading preview…" : "Preview voice"}
            </button>
          ) : null}
        </div>

        {!voiceAgentApiKeyConfigured ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Add your voice agent API key in Profile before picking a Pura dictation voice.
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Voice</label>
            <PortalListboxDropdown<string>
              value={selectedVoiceId}
              onChange={(voiceId) => setSelectedVoiceId(String(voiceId || "").trim())}
              disabled={loading}
              placeholder={voiceLibraryLoading ? "Loading voices…" : "Use service default"}
              options={[
                { value: "", label: "Use service default", hint: "" },
                ...voiceLibraryVoices.map((voice) => ({
                  value: voice.id,
                  label: voice.category ? `${voice.name} · ${voice.category}` : voice.name,
                  hint: voice.description || "",
                })),
              ]}
              renderOptionRight={(opt) => {
                if (!opt.value) return null;
                const isBusy = voicePreviewBusyVoiceId === opt.value;
                const canClick = !loading && !saving && !voicePreviewBusy && voiceAgentApiKeyConfigured;
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
              className="mt-2 z-50"
            />
            <div className="mt-2 text-xs text-zinc-500">
              {selectedVoiceMeta
                ? selectedVoiceMeta.description || `Selected voice: ${selectedVoiceMeta.name}`
                : "Use service default to keep the current fallback voice."}
            </div>
          </div>
        </div>

        <audio ref={voicePreviewAudioRef} className={voicePreviewShowControls ? "mt-4 w-full" : "sr-only"} controls={voicePreviewShowControls} />
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-brand-ink">Default page on login</h2>
        <p className="mt-1 text-sm text-zinc-600">Choose which main page opens first after sign-in when nothing else is redirecting you.</p>
        <div className="mt-4 max-w-md">
          <PortalListboxDropdown
            value={defaultLoginPath}
            options={pageOptions}
            onChange={(value) => setDefaultLoginPath(value)}
            disabled={loading}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-brand-ink">Chat and report widget</h2>
        <p className="mt-1 text-sm text-zinc-600">Keep the support widget available in the corner, or hide it completely.</p>
        <div className="mt-4 max-w-sm">
          <PortalListboxDropdown
            value={hideFloatingTools ? "hidden" : "shown"}
            options={widgetOptions}
            onChange={(value) => setHideFloatingTools(value === "hidden")}
            disabled={loading}
          />
        </div>
      </div>

      <div className="flex items-center justify-start">
        <button
          type="button"
          onClick={() => void savePreferences()}
          disabled={loading || saving || !dirty}
          className={classNames(
            "inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white",
            loading || saving || !dirty ? "bg-zinc-400" : "bg-brand-blue transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95",
          )}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>
    </div>
  );
}
