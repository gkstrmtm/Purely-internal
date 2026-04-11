"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import {
  IconMessages,
  IconReceptionistActivity,
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
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { useToast } from "@/components/ToastProvider";
import { InlineSpinner } from "@/components/InlineSpinner";
import { PORTAL_MISSED_CALL_VARIABLES, PORTAL_MESSAGE_VARIABLES, type TemplateVariable } from "@/lib/portalTemplateVars";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type Settings = {
  version: 1;
  enabled: boolean;
  replyDelaySeconds: number;
  replyBody: string;
  mediaUrls?: string[];
  forwardToPhoneE164: string | null;
  webhookToken: string;
};

type EventRow = {
  id: string;
  callSid: string;
  from: string;
  to: string | null;
  createdAtIso: string;
  dialCallStatus?: string;
  finalStatus: "ANSWERED" | "MISSED" | "UNKNOWN";
  smsStatus: "NONE" | "SENT" | "SKIPPED" | "FAILED";
  smsTo?: string;
  smsFrom?: string;
  smsBody?: string;
  smsMessageSid?: string;
  smsError?: string;
};

type ApiPayload = {
  ok: boolean;
  settings: Settings;
  events: EventRow[];
  profilePhone: string | null;
  twilioConfigured: boolean;
  twilioReason?: string;
  webhookUrl: string;
  notes?: { variables?: string[] };
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function badgeClass(kind: string) {
  switch (kind) {
    case "SENT":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "FAILED":
      return "bg-red-50 text-red-700 border-red-200";
    case "SKIPPED":
      return "bg-zinc-50 text-zinc-700 border-zinc-200";
    case "MISSED":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "ANSWERED":
      return "bg-sky-50 text-sky-700 border-sky-200";
    default:
      return "bg-zinc-50 text-zinc-700 border-zinc-200";
  }
}

export function PortalMissedCallTextBackClient({ embedded }: { embedded?: boolean } = {}) {
  const pathname = usePathname() || "";
  const toast = useToast();
  const portalBase = useMemo(() => (pathname.startsWith("/credit") ? "/credit" : "/portal"), [pathname]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [knownContactCustomVarKeys, setKnownContactCustomVarKeys] = useState<string[]>([]);

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

  const varPickerVariables = useMemo(() => {
    const base: TemplateVariable[] = [...PORTAL_MESSAGE_VARIABLES, ...PORTAL_MISSED_CALL_VARIABLES];
    const keys = Array.isArray(knownContactCustomVarKeys) ? knownContactCustomVarKeys : [];
    for (const k of keys) {
      base.push({
        key: `contact.custom.${k}`,
        label: `Contact custom: ${k}`,
        group: "Custom",
        appliesTo: "Lead/contact",
      });
    }

    const seen = new Set<string>();
    return base.filter((v) => {
      const key = `${v.group}:${v.key}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [knownContactCustomVarKeys]);

  const friendlyApiError = useCallback((opts: {
    status?: number;
    rawError?: string | null;
    action: "load" | "save" | "regenerate";
  }) => {
    const raw = (opts.rawError || "").trim();

    if (opts.status === 401) {
      return "Your session expired. Please refresh and sign in again.";
    }

    if (opts.status === 403) {
      return embedded
        ? "Missed-Call Text Back isn’t enabled for this account yet. Enable AI Receptionist in Billing to turn this on."
        : "Missed-Call Text Back isn’t enabled for this account yet. Open Billing to enable AI Receptionist, then come back here.";
    }

    if (raw && raw !== "Forbidden" && raw !== "Unauthorized") return raw;

    if (opts.action === "save") return "We couldn’t save your changes. Please try again.";
    if (opts.action === "regenerate") return "We couldn’t regenerate the webhook token. Please try again.";
    return "We couldn’t load Missed-Call Text Back settings. Please refresh and try again.";
  }, [embedded]);

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

  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [settings, setSettings] = useState<Settings | null>(null);
  const lastSavedSettingsJsonRef = useRef<string>("{}");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tab, setTab] = useState<"activity" | "settings">("settings");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [profilePhone, setProfilePhone] = useState<string | null>(null);
  const [twilioConfigured, setTwilioConfigured] = useState<boolean>(false);
  const [twilioReason, setTwilioReason] = useState<string | undefined>(undefined);

  const isDirty = useMemo(() => {
    if (!settings) return false;
    return JSON.stringify(settings) !== lastSavedSettingsJsonRef.current;
  }, [settings]);

  const [replyDelayUnit, setReplyDelayUnit] = useState<"seconds" | "minutes">("seconds");
  const [replyDelayUnitTouched, setReplyDelayUnitTouched] = useState(false);

  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const replyBodyRef = useRef<HTMLTextAreaElement | null>(null);

  function insertAtCursor(current: string, insert: string, el: HTMLTextAreaElement | null) {
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
    return { next, cursor: start + insert.length };
  }

  const load = useCallback(async () => {
    const firstLoad = !hasLoadedOnceRef.current;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);
    setError(null);
    setNote(null);

    try {
      const res = await fetch("/api/portal/missed-call-textback/settings", { cache: "no-store" }).catch(() => null as any);

      if (!res?.ok) {
        const rawError = res ? await readJsonError(res) : null;
        setError(friendlyApiError({ status: res?.status, rawError, action: "load" }));
        if (firstLoad) setSettings(null);
        return;
      }

      const data = (await res.json().catch(() => null)) as ApiPayload | null;
      if (!data?.ok || !data.settings) {
        setError(friendlyApiError({ status: res.status, rawError: (data as any)?.error ?? null, action: "load" }));
        if (firstLoad) setSettings(null);
        return;
      }

      setSettings(data.settings);
      lastSavedSettingsJsonRef.current = JSON.stringify(data.settings);
      setEvents(Array.isArray(data.events) ? data.events : []);
      setProfilePhone(data.profilePhone ?? null);
      setTwilioConfigured(Boolean(data.twilioConfigured));
      setTwilioReason(data.twilioReason);
      setReplyDelayUnitTouched(false);
    } finally {
      if (!hasLoadedOnceRef.current) hasLoadedOnceRef.current = true;
      if (firstLoad) setLoading(false);
      else setRefreshing(false);
    }
  }, [friendlyApiError, readJsonError]);

  useEffect(() => {
    void load();
  }, [load]);

  const missedCalls = useMemo(
    () => events.filter((e) => e.finalStatus === "MISSED"),
    [events],
  );

  const selectedEvent = useMemo(() => {
    if (selectedEventId) return events.find((e) => e.id === selectedEventId) ?? null;
    return events[0] ?? null;
  }, [events, selectedEventId]);

  useEffect(() => {
    if (!events.length) {
      if (selectedEventId) setSelectedEventId(null);
      return;
    }
    if (selectedEventId && events.some((e) => e.id === selectedEventId)) return;
    setSelectedEventId(events[0]?.id ?? null);
  }, [events, selectedEventId]);

  useEffect(() => {
    if (embedded) return;
    try {
      const url = new URL(window.location.href);
      const nextTab = url.searchParams.get("tab");
      if (nextTab === "activity" || nextTab === "settings") setTab(nextTab);
      const eventId = url.searchParams.get("event");
      if (eventId && eventId.trim()) setSelectedEventId(eventId.trim());
    } catch {
      // ignore
    }
  }, [embedded]);

  const setTabWithUrl = useCallback((nextTab: "activity" | "settings") => {
    setTab(nextTab);
    if (embedded) return;
    try {
      const url = new URL(window.location.href);
      if (nextTab === "settings") url.searchParams.delete("tab");
      else url.searchParams.set("tab", nextTab);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }, [embedded]);

  const setSelectedEventWithUrl = useCallback((nextId: string) => {
    setSelectedEventId(nextId);
    if (embedded) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("event", nextId);
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }, [embedded]);

  const setSidebarOverride = useSetPortalSidebarOverride();
  const textBackSidebar = useMemo(() => {
    return (
      <div className="space-y-4">
        <div>
          <div className={portalSidebarSectionTitleClass}>Missed-Call Text Back</div>
          <div className={portalSidebarSectionStackClass}>
            <PortalSidebarNavButton
              type="button"
              onClick={() => setTabWithUrl("activity")}
              aria-current={tab === "activity" ? "page" : undefined}
              label="Activity"
              icon={<IconReceptionistActivity />}
              iconToneClassName={portalSidebarIconToneBlueClass}
              className={classNames(portalSidebarButtonBaseClass, tab === "activity" ? portalSidebarButtonActiveClass : portalSidebarButtonInactiveClass)}
            >
              Activity
            </PortalSidebarNavButton>
            <PortalSidebarNavButton
              type="button"
              onClick={() => setTabWithUrl("settings")}
              aria-current={tab === "settings" ? "page" : undefined}
              label="Settings"
              icon={<IconSidebarSettings />}
              iconToneClassName={portalSidebarIconToneNeutralClass}
              className={classNames(portalSidebarButtonBaseClass, tab === "settings" ? portalSidebarButtonActiveClass : portalSidebarButtonInactiveClass)}
            >
              Settings
            </PortalSidebarNavButton>
          </div>
        </div>

        {events.length ? (
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className={portalSidebarSectionTitleClass}>Activity</div>
              <div className="pr-3 text-[11px] text-zinc-400">{events.length}</div>
            </div>
            <div className={portalSidebarSectionStackClass}>
              {events.slice(0, 10).map((event) => {
                const active = event.id === selectedEventId;
                return (
                  <PortalSidebarNavButton
                    key={event.id}
                    type="button"
                    onClick={() => {
                      setTabWithUrl("activity");
                      setSelectedEventWithUrl(event.id);
                    }}
                    aria-current={active ? "page" : undefined}
                    label={event.from}
                    icon={<IconMessages />}
                    iconToneClassName={portalSidebarIconToneBlueClass}
                    className={classNames(portalSidebarButtonBaseClass, active ? portalSidebarButtonActiveClass : portalSidebarButtonInactiveClass)}
                  >
                    <div className="truncate text-sm font-semibold text-zinc-900">{event.from}</div>
                    <div className={classNames(portalSidebarMetaTextClass, "flex items-center justify-between gap-2")}>
                      <span className="truncate">{formatWhen(event.createdAtIso)}</span>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${badgeClass(event.smsStatus)}`}>
                        {event.smsStatus}
                      </span>
                    </div>
                  </PortalSidebarNavButton>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    );
  }, [events, selectedEventId, setSelectedEventWithUrl, setTabWithUrl, tab]);

  useEffect(() => {
    if (embedded) return;
    setSidebarOverride({
      desktopSidebarContent: textBackSidebar,
      mobileSidebarContent: textBackSidebar,
    });
  }, [embedded, setSidebarOverride, textBackSidebar]);

  useEffect(() => {
    if (embedded) return;
    return () => setSidebarOverride(null);
  }, [embedded, setSidebarOverride]);

  useEffect(() => {
    if (!settings) return;
    if (replyDelayUnitTouched) return;
    setReplyDelayUnit(settings.replyDelaySeconds >= 60 && settings.replyDelaySeconds % 60 === 0 ? "minutes" : "seconds");
  }, [replyDelayUnitTouched, settings]);

  const forwardPreview = settings?.forwardToPhoneE164 || profilePhone || "(not set)";

  const mediaUrls = useMemo(() => (Array.isArray(settings?.mediaUrls) ? settings.mediaUrls : []), [settings?.mediaUrls]);

  const replyDelayAmount = useMemo(() => {
    if (!settings) return 0;
    return replyDelayUnit === "minutes" ? Math.round(settings.replyDelaySeconds / 60) : settings.replyDelaySeconds;
  }, [replyDelayUnit, settings]);

  const replyDelayMaxAmount = replyDelayUnit === "minutes" ? 10 : 600;

  function toAbsoluteUrl(pathOrUrl: string) {
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;

    const hosted = toPurelyHostedUrl(pathOrUrl);
    if (typeof window === "undefined") return hosted;

    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (!isLocal) return hosted;

    const p = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return new URL(p, window.location.origin).toString();
  }

  function addMediaUrl(url: string) {
    if (!settings) return;
    const next = Array.from(new Set([...mediaUrls, url])).slice(0, 10);
    setSettings({ ...settings, mediaUrls: next });
  }

  function removeMediaUrl(url: string) {
    if (!settings) return;
    setSettings({ ...settings, mediaUrls: mediaUrls.filter((u) => u !== url) });
  }

  async function uploadAttachment(file: File) {
    setUploading(true);
    setError(null);
    setNote(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed.");
      const json = await res.json().catch(() => ({}));
      const url = typeof json?.url === "string" ? json.url : null;
      if (!url) throw new Error("Upload did not return a URL.");
      addMediaUrl(toAbsoluteUrl(url));
      setNote("Attached.");
      window.setTimeout(() => setNote(null), 1500);
    } catch (e: any) {
      setError(e?.message || "Failed to upload.");
    } finally {
      setUploading(false);
    }
  }

  async function save(next: Settings) {
    setSaving(true);
    setError(null);
    setNote(null);

    const res = await fetch("/api/portal/missed-call-textback/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: next }),
    });

    if (!res.ok) {
      const rawError = await readJsonError(res);
      setSaving(false);
      setError(friendlyApiError({ status: res.status, rawError, action: "save" }));
      return;
    }

    const data = (await res.json().catch(() => null)) as ApiPayload | null;
    if (!data?.ok || !data.settings) {
      setSaving(false);
      setError(friendlyApiError({ status: res.status, rawError: (data as any)?.error ?? null, action: "save" }));
      return;
    }
    setSettings(data.settings);
    lastSavedSettingsJsonRef.current = JSON.stringify(data.settings);
    setEvents(Array.isArray(data.events) ? data.events : []);
    setProfilePhone(data.profilePhone ?? null);
    setTwilioConfigured(Boolean(data.twilioConfigured));
    setTwilioReason(data.twilioReason);
    setReplyDelayUnitTouched(false);
    setSaving(false);
    setNote("Saved.");

    window.setTimeout(() => setNote(null), 1800);
  }


  if (loading && !hasLoadedOnceRef.current) {
    return (
      <div
        className={
          embedded
            ? "w-full rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600"
            : "mx-auto max-w-6xl rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600"
        }
      >
        Loading…
      </div>
    );
  }

  if (!settings) {
    return (
      <div
        className={
          embedded
            ? "w-full rounded-3xl border border-zinc-200 bg-white p-6"
            : "mx-auto max-w-6xl rounded-3xl border border-zinc-200 bg-white p-6"
        }
      >
        <div className="text-sm font-semibold text-zinc-900">Unable to load Missed-Call Text Back</div>
        <div className="mt-2 text-sm text-zinc-600">{error ?? "Please try again."}</div>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-6xl"}>
      {!embedded ? (
        <div className="flex items-start justify-between gap-4">
          <div className="min-h-9">
            {refreshing ? (
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500">
                <InlineSpinner className="h-3.5 w-3.5 animate-spin" label="Refreshing" />
                <span>Refreshing…</span>
              </div>
            ) : null}
          </div>
          <Link
            href={`${portalBase}/app/services`}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            All services
          </Link>
        </div>
      ) : null}

      {!twilioConfigured ? (
        <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">Twilio isn’t configured</div>
          <div className="mt-1 text-amber-900/80">
            Configure Twilio in your Profile to enable texting.
            {twilioReason ? ` (${twilioReason})` : ""}
            <span className="ml-2">
              <Link href={`${portalBase}/app/profile`} className="underline">
                Open Profile
              </Link>
            </span>
          </div>
        </div>
      ) : null}

      {note ? (
        <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {note}
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="mt-6 grid grid-cols-1 gap-4">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Automation</div>
              <div className="mt-1 text-xs text-zinc-500">
                Variables: {(settings ? ["{from}", "{to}"] : []).join(", ")}
              </div>
            </div>
            <label className="flex items-center gap-3">
              <span className="text-xs font-semibold text-zinc-600">Enabled</span>
              <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={settings.enabled}
                  disabled={saving}
                  onChange={(e) => void save({ ...settings, enabled: e.target.checked })}
                  aria-label="Enable Missed-Call Text Back"
                />
                <span className="h-6 w-11 rounded-full bg-zinc-200 transition peer-checked:bg-(--color-brand-blue) peer-focus-visible:ring-2 peer-focus-visible:ring-brand-ink/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white peer-disabled:opacity-60" />
                <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
              </span>
            </label>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-zinc-700">Reply delay</label>
              <div className="mt-2 flex gap-2">
                <input
                  value={replyDelayAmount}
                  onChange={(e) => {
                    const nextAmount = Math.max(0, Math.min(replyDelayMaxAmount, Math.round(Number(e.target.value || 0))));
                    const seconds = replyDelayUnit === "minutes" ? nextAmount * 60 : nextAmount;
                    setSettings({ ...settings, replyDelaySeconds: Math.max(0, Math.min(600, seconds)) });
                  }}
                  type="number"
                  min={0}
                  max={replyDelayMaxAmount}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
                <select
                  value={replyDelayUnit}
                  onChange={(e) => {
                    const nextUnit = e.target.value === "minutes" ? "minutes" : "seconds";
                    setReplyDelayUnitTouched(true);
                    setReplyDelayUnit(nextUnit);

                    const currentAmount = replyDelayUnit === "minutes" ? Math.round(settings.replyDelaySeconds / 60) : settings.replyDelaySeconds;
                    const seconds = nextUnit === "minutes" ? currentAmount * 60 : currentAmount;
                    setSettings({ ...settings, replyDelaySeconds: Math.max(0, Math.min(600, seconds)) });
                  }}
                  className="shrink-0 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="seconds">Seconds</option>
                  <option value="minutes">Minutes</option>
                </select>
              </div>
              <div className="mt-1 text-xs text-zinc-500">Max 10 minutes (600 seconds).</div>
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-700">Forward calls to</label>
              <input
                value={settings.forwardToPhoneE164 ?? ""}
                onChange={(e) => setSettings({ ...settings, forwardToPhoneE164: e.target.value || null })}
                placeholder={profilePhone ? `Default: ${profilePhone}` : "(Use your Profile phone)"}
                className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              />
              <div className="mt-1 text-xs text-zinc-500">
                Effective: <span className="font-mono">{forwardPreview}</span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold text-zinc-700">Text message</label>
              <button
                type="button"
                disabled={saving}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                onClick={() => setVarPickerOpen(true)}
              >
                Insert variable
              </button>
            </div>
            <textarea
              ref={replyBodyRef}
              value={settings.replyBody}
              onChange={(e) => setSettings({ ...settings, replyBody: e.target.value })}
              rows={5}
              className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-zinc-700">Attachments (MMS)</div>
                <div className="mt-1 text-xs text-zinc-500">Optional images, up to 10.</div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                  disabled={saving || uploading}
                  onClick={() => setPickerOpen(true)}
                >
                  Attach from media library
                </button>
                <label className="cursor-pointer rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60">
                  Upload photo
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={saving || uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.currentTarget.value = "";
                      if (f) void uploadAttachment(f);
                    }}
                  />
                </label>
              </div>
            </div>

            {mediaUrls.length ? (
              <div className="mt-3 space-y-2">
                {mediaUrls.map((u) => (
                  <div key={u} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                    <a className="truncate text-xs font-mono text-zinc-800 underline" href={u} target="_blank" rel="noreferrer">
                      {u}
                    </a>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                      onClick={() => removeMediaUrl(u)}
                      disabled={saving}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-zinc-500">No attachments.</div>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void save(settings)}
              disabled={saving || !isDirty}
              className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {saving ? "Saving…" : isDirty ? "Save" : "Saved"}
            </button>
          </div>
        </div>

        <PortalVariablePickerModal
          open={varPickerOpen}
          onClose={() => setVarPickerOpen(false)}
          variables={varPickerVariables}
          title="Insert variable"
          createCustom={{ enabled: true, existingKeys: knownContactCustomVarKeys, allowContactPick: true }}
          onPick={(key) => {
            if (!settings) return;
            const token = `{${key}}`;
            const { next, cursor } = insertAtCursor(settings.replyBody || "", token, replyBodyRef.current);
            setSettings({ ...settings, replyBody: next });
            queueMicrotask(() => {
              const el = replyBodyRef.current;
              if (!el) return;
              el.focus();
              el.setSelectionRange(cursor, cursor);
            });
          }}
        />
        </div>
      ) : null}

      <PortalMediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Attach from media library"
        confirmLabel="Attach"
        onPick={(item: PortalMediaPickItem) => {
          if (!(item.mimeType || "").startsWith("image/")) {
            setError("Only images can be attached for MMS.");
            return;
          }
          addMediaUrl(toAbsoluteUrl(item.shareUrl));
          setPickerOpen(false);
          setNote("Attached.");
          window.setTimeout(() => setNote(null), 1500);
        }}
      />

      {tab === "activity" ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Selected activity</div>
          <div className="mt-1 text-xs text-zinc-500">The sidebar controls which missed-call event is shown here.</div>

          {selectedEvent ? (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClass(selectedEvent.finalStatus)}`}>
                  {selectedEvent.finalStatus}
                </span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClass(selectedEvent.smsStatus)}`}>
                  SMS: {selectedEvent.smsStatus}
                </span>
                <span className="text-xs text-zinc-500">{formatWhen(selectedEvent.createdAtIso)}</span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-zinc-700 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">From</div>
                  <div className="mt-1 font-mono">{selectedEvent.from}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">To</div>
                  <div className="mt-1 font-mono">{selectedEvent.to ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Dial status</div>
                  <div className="mt-1 font-mono">{selectedEvent.dialCallStatus ?? "-"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">CallSid</div>
                  <div className="mt-1 font-mono break-all">{selectedEvent.callSid}</div>
                </div>
              </div>

              {selectedEvent.smsBody ? (
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Text message</div>
                  <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-800">
                    {selectedEvent.smsBody}
                  </div>
                </div>
              ) : null}

              {selectedEvent.smsError ? (
                <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {selectedEvent.smsError}
                </div>
              ) : null}

              {missedCalls.length ? (
                <div className="mt-5 border-t border-zinc-200 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent missed calls</div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                          <th className="py-2 pr-3">When</th>
                          <th className="py-2 pr-3">From</th>
                          <th className="py-2 pr-3">Text</th>
                        </tr>
                      </thead>
                      <tbody>
                        {missedCalls.slice(0, 12).map((e) => (
                          <tr key={e.id} className="border-b border-zinc-100">
                            <td className="py-2 pr-3 whitespace-nowrap">{formatWhen(e.createdAtIso)}</td>
                            <td className="py-2 pr-3 font-mono">{e.from}</td>
                            <td className="py-2 pr-3">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${badgeClass(e.smsStatus)}`}>
                                {e.smsStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">No activity yet.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
