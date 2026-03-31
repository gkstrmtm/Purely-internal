"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { AppModal } from "@/components/AppModal";
import { InlineSpinner } from "@/components/InlineSpinner";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";
import { PortalTypeaheadInput } from "@/components/PortalTypeaheadInput";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { useToast } from "@/components/ToastProvider";
import { FOLLOW_UP_TEMPLATES, type FollowUpTemplate } from "@/lib/portalFollowUpTemplates";
import {
  PORTAL_BOOKING_VARIABLES,
  PORTAL_MESSAGE_VARIABLES,
  type TemplateVariable,
} from "@/lib/portalTemplateVars";

type Me = {
  user: { email: string; name: string; role: string };
  entitlements: { blog: boolean; booking: boolean; crm: boolean };
};

type Settings = {
  version: 4;
  enabled: boolean;
  templates: {
    id: string;
    name: string;
    enabled: boolean;
    delayMinutes: number;
    audience?: "CONTACT" | "INTERNAL";
    internalRecipients?:
      | {
          mode: "BOOKING_NOTIFICATION_EMAILS" | "CUSTOM";
          emails?: string[];
          phones?: string[];
        }
      | undefined;
    channels: { email: boolean; sms: boolean };
    email: { subjectTemplate: string; bodyTemplate: string };
    sms: { bodyTemplate: string };
  }[];
  chainTemplates: {
    id: string;
    name: string;
    steps: FollowUpStep[];
  }[];
  assignments: {
    defaultSteps: FollowUpStep[];
    calendarSteps: Record<string, FollowUpStep[]>;
  };
  customVariables: Record<string, string>;
};

type FollowUpStep = {
  id: string;
  name: string;
  enabled: boolean;
  delayMinutes: number;
  kind: "EMAIL" | "SMS" | "TAG";
  audience?: "CONTACT" | "INTERNAL";
  internalRecipients?:
    | {
        mode: "BOOKING_NOTIFICATION_EMAILS" | "CUSTOM";
        emails?: string[];
        phones?: string[];
      }
    | undefined;
  email?: {
    subjectTemplate: string;
    bodyTemplate: string;
    attachments?: EmailAttachmentRef[];
  };
  sms?: { bodyTemplate: string };
  tagId?: string;
  presetId?: string;
};

type EmailAttachmentRef = {
  mediaItemId: string;
  fileName: string;
  mimeType: string;
};

type Calendar = { id: string; title: string; enabled: boolean; notificationEmails?: string[] };

type ContactTag = { id: string; name: string; color: string | null };

type QueueItem = {
  id: string;
  bookingId: string;
  stepId: string;
  stepName: string;
  calendarId?: string;
  channel: "EMAIL" | "SMS" | "TAG";
  to?: string;
  contactId?: string;
  tagId?: string;
  subject?: string;
  body?: string;
  attachments?: EmailAttachmentRef[];
  sendAtIso: string;
  status: "PENDING" | "SENT" | "FAILED" | "CANCELED";
  attempts: number;
  lastError?: string;
};

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

const MAX_DELAY_MINUTES = 60 * 24 * 365 * 10; // 10 years

type DelayUnit = "minutes" | "hours" | "days" | "weeks" | "months" | "years";

const DELAY_UNITS: Array<{ id: DelayUnit; label: string; minutes: number }> = [
  { id: "minutes", label: "min", minutes: 1 },
  { id: "hours", label: "hr", minutes: 60 },
  { id: "days", label: "days", minutes: 60 * 24 },
  { id: "weeks", label: "weeks", minutes: 60 * 24 * 7 },
  { id: "months", label: "months", minutes: 60 * 24 * 30 },
  { id: "years", label: "years", minutes: 60 * 24 * 365 },
];

function clampDelayMinutes(n: number) {
  if (!Number.isFinite(n)) return 60;
  return Math.max(0, Math.min(MAX_DELAY_MINUTES, Math.round(n)));
}

function delayToBestUnit(minutes: number): { value: number; unit: DelayUnit } {
  const m = clampDelayMinutes(minutes);
  if (m === 0) return { value: 0, unit: "minutes" };
  const candidates: DelayUnit[] = ["years", "months", "weeks", "days", "hours"];
  for (const unit of candidates) {
    const mult = DELAY_UNITS.find((u) => u.id === unit)!.minutes;
    if (m % mult === 0) return { value: m / mult, unit };
  }
  return { value: m, unit: "minutes" };
}

function valueUnitToMinutes(value: number, unit: DelayUnit): number {
  const mult = DELAY_UNITS.find((u) => u.id === unit)?.minutes ?? 1;
  return clampDelayMinutes(value * mult);
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  accent = "blue",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  accent?: "blue" | "pink" | "ink";
}) {
  const checkedBgClass =
    accent === "pink"
      ? "peer-checked:bg-(--color-brand-pink)"
      : accent === "ink"
        ? "peer-checked:bg-brand-ink"
        : "peer-checked:bg-(--color-brand-blue)";

  return (
    <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
      <input
        type="checkbox"
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-0 rounded-full bg-zinc-200 transition " +
          checkedBgClass +
          " peer-disabled:opacity-60"
        }
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 peer-disabled:opacity-60"
      />
    </span>
  );
}

export function PortalFollowUpClient({ embedded }: { embedded?: boolean } = {}) {
  const toast = useToast();
  const [knownContactCustomVarKeys, setKnownContactCustomVarKeys] = useState<string[]>([]);

  const isMobileApp = useMemo(() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("pa_mobileapp") === "1") return true;
    return (window.location.host || "").includes("purely-mobile");
  }, []);

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
  const isEmbedded = Boolean(embedded);
  const service = useMemo(() => PORTAL_SERVICES.find((s) => s.slug === "follow-up") ?? null, []);

  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const [tab, setTab] = useState<"settings" | "activity">("activity");

  const [settings, setSettings] = useState<Settings | null>(null);
  const lastSavedSettingsJsonRef = useRef<string>("{}");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [siteNotificationEmails, setSiteNotificationEmails] = useState<string[]>([]);
  const [recipientEmailSuggestions, setRecipientEmailSuggestions] = useState<string[]>([]);
  const [builtinVariables, setBuiltinVariables] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = useMemo(() => {
    if (!settings) return false;
    return JSON.stringify(settings) !== lastSavedSettingsJsonRef.current;
  }, [settings]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/portal/notifications/recipients").catch(() => null);
      if (!res || !res.ok) return;
      const json = (await res.json().catch(() => null)) as any;
      const list = Array.isArray(json?.recipients) ? json.recipients : [];
      const emails = list
        .map((r: any) => (typeof r?.email === "string" ? r.email.trim() : ""))
        .filter((e: string) => Boolean(e) && e.includes("@"))
        .slice(0, 5000);
      if (cancelled) return;
      setRecipientEmailSuggestions(emails);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [stepEmailDrafts, setStepEmailDrafts] = useState<Record<string, string>>({});
  const [stepPhoneDrafts, setStepPhoneDrafts] = useState<Record<string, string>>({});

  const [testEmail, setTestEmail] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Just testing follow-up automation.");
  const [testBusy, setTestBusy] = useState(false);

  type AiDraftModalState =
    | null
    | {
        stepId: string;
        kind: "EMAIL" | "SMS";
        stepName: string;
        existingSubject?: string;
        existingBody: string;
        apply: (patch: Partial<FollowUpStep>) => void;
      };

  const [aiDraftModal, setAiDraftModal] = useState<AiDraftModalState>(null);
  const [aiDraftInstruction, setAiDraftInstruction] = useState("");
  const [aiDraftBusy, setAiDraftBusy] = useState(false);
  const [aiDraftError, setAiDraftError] = useState<string | null>(null);

  const [ownerTags, setOwnerTags] = useState<ContactTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createTagName, setCreateTagName] = useState("");
  const [createTagBusy, setCreateTagBusy] = useState(false);
  const [createTagStepId, setCreateTagStepId] = useState<string | null>(null);

  const [uploadBusyStepId, setUploadBusyStepId] = useState<string | null>(null);
  const [mediaPicker, setMediaPicker] = useState<null | { title: string; onPick: (item: PortalMediaPickItem) => void }>(null);

  const [varPickerOpen, setVarPickerOpen] = useState(false);
  const [varPickerTarget, setVarPickerTarget] = useState<
    | null
    | { kind: "step"; stepId: string; field: "emailSubject" | "emailBody" | "smsBody" }
    | { kind: "aiDraft"; field: "instruction" }
  >(null);
  const activeFieldElRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const [chainTemplatePicker, setChainTemplatePicker] = useState<
    null | {
      title: string;
      stepsSnapshot: FollowUpStep[];
      setSteps: (next: FollowUpStep[]) => void;
    }
  >(null);
  const [chainTemplateDraftName, setChainTemplateDraftName] = useState("");

  async function uploadFileAndGetEmailAttachment(file: File): Promise<EmailAttachmentRef> {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: fd });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error((typeof body?.error === "string" ? body.error : null) ?? "Upload failed");

    const mediaItem = body?.mediaItem;
    const mediaItemId = typeof mediaItem?.id === "string" ? mediaItem.id : "";
    if (!mediaItemId) {
      throw new Error("Upload succeeded, but this file couldn't be added to the media library for attachments.");
    }

    return {
      mediaItemId,
      fileName:
        (typeof mediaItem?.fileName === "string" && mediaItem.fileName.trim())
          ? mediaItem.fileName
          : (typeof body?.fileName === "string" && body.fileName.trim())
            ? body.fileName
            : file.name || "attachment",
      mimeType:
        (typeof mediaItem?.mimeType === "string" && mediaItem.mimeType.trim())
          ? mediaItem.mimeType
          : (typeof body?.mimeType === "string" && body.mimeType.trim())
            ? body.mimeType
            : file.type || "application/octet-stream",
    };
  }

  async function generateDraft(opts: {
    kind: "EMAIL" | "SMS";
    stepName?: string;
    prompt?: string;
    existingSubject?: string;
    existingBody?: string;
  }): Promise<{ subject?: string; body: string } | null> {
    const res = await fetch("/api/portal/follow-up/ai/generate-step", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: opts.kind,
        stepName: opts.stepName,
        prompt: opts.prompt,
        existingSubject: opts.existingSubject,
        existingBody: opts.existingBody,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = (json as any)?.code;
      if (res.status === 402 && code === "INSUFFICIENT_CREDITS") {
        toast.error("Insufficient credits to generate.");
        return null;
      }
      toast.error((json as any)?.error || "Failed to generate step");
      return null;
    }

    const rawSubject = String((json as any)?.subject ?? "");
    const rawBody = String((json as any)?.body ?? "");

    const stripCodeFence = (s: string) => {
      const t = s.trim();
      if (!t.startsWith("```")) return s;
      const lines = t.split("\n");
      if (lines.length < 3) return s;
      if (!lines[0].startsWith("```")) return s;
      let endIdx = -1;
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (lines[i]?.trim().startsWith("```")) {
          endIdx = i;
          break;
        }
      }
      if (endIdx <= 0) return s;
      return lines.slice(1, endIdx).join("\n").trim();
    };

    const tryParseDraftJson = (s: string): { subject?: unknown; body?: unknown } | null => {
      const t = stripCodeFence(String(s ?? "")).trim();
      if (!t.startsWith("{") || !t.endsWith("}")) return null;
      try {
        const parsed = JSON.parse(t);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        return parsed as any;
      } catch {
        return null;
      }
    };

    const parsedFromBody = tryParseDraftJson(rawBody);
    const parsedFromSubject = tryParseDraftJson(rawSubject);
    const parsed = parsedFromBody ?? parsedFromSubject;

    const subjectCoerced = parsed && "subject" in parsed ? String((parsed as any).subject ?? "") : rawSubject;
    const bodyCoerced = parsed && "body" in parsed ? String((parsed as any).body ?? "") : rawBody;

    if (opts.kind === "EMAIL") {
      return {
        subject: subjectCoerced.slice(0, 200),
        body: bodyCoerced.slice(0, 8000),
      };
    }

    return { body: bodyCoerced.slice(0, 8000) };
  }

  function insertAtCursor(current: string, insert: string, el: HTMLInputElement | HTMLTextAreaElement | null) {
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
    return { next, cursor: start + insert.length };
  }

  const followUpTemplateVariables = useMemo(() => {
    const custom = settings?.customVariables && typeof settings.customVariables === "object" ? settings.customVariables : {};
    const customVars: TemplateVariable[] = Object.keys(custom)
      .filter((k) => typeof k === "string" && k.trim())
      .slice(0, 100)
      .map((k) => ({ key: k, label: `Custom: ${k}`, group: "Custom" as const, appliesTo: "Custom variable" }));

    const builtinVars: TemplateVariable[] = (Array.isArray(builtinVariables) ? builtinVariables : [])
      .filter((k) => typeof k === "string" && k.trim())
      .slice(0, 100)
      .map((k) => ({ key: k, label: k, group: "Custom" as const, appliesTo: "Built-in" }));

    const contactCustomVars: TemplateVariable[] = (Array.isArray(knownContactCustomVarKeys) ? knownContactCustomVarKeys : [])
      .filter((k) => typeof k === "string" && k.trim())
      .slice(0, 50)
      .map((k) => ({
        key: `contact.custom.${k}`,
        label: `Contact custom: ${k}`,
        group: "Custom" as const,
        appliesTo: "Lead/contact",
      }));

    const merged = [...PORTAL_MESSAGE_VARIABLES, ...PORTAL_BOOKING_VARIABLES, ...contactCustomVars, ...builtinVars, ...customVars];
    const seen = new Set<string>();
    return merged.filter((v) => {
      const key = `${v.group}:${v.key}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [builtinVariables, knownContactCustomVarKeys, settings?.customVariables]);

  const load = useCallback(async () => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    setError(null);
    let didLoad = false;

    try {
      const [meRes, settingsRes] = await Promise.all([
        fetch("/api/customer/me", {
          cache: "no-store",
          headers: {
            "x-pa-app": "portal",
            "x-portal-variant": typeof window !== "undefined" && window.location.pathname.startsWith("/credit") ? "credit" : "portal",
          },
        }),
        fetch("/api/portal/follow-up/settings", { cache: "no-store" }),
      ]);

      if (!mountedRef.current) return;

      if (meRes.ok) setMe((await meRes.json()) as Me);
      if (settingsRes.ok) {
        const json = (await settingsRes.json().catch(() => ({}))) as {
          ok?: boolean;
          settings?: Settings;
          queue?: QueueItem[];
          calendars?: Calendar[];
          siteNotificationEmails?: string[];
          builtinVariables?: string[];
          error?: string;
        };
        if (json.ok && json.settings) {
          setSettings(json.settings);
          lastSavedSettingsJsonRef.current = JSON.stringify(json.settings);
          setQueue(Array.isArray(json.queue) ? json.queue : []);
          setCalendars(Array.isArray(json.calendars) ? json.calendars : []);
          setSiteNotificationEmails(Array.isArray(json.siteNotificationEmails) ? json.siteNotificationEmails : []);
          setBuiltinVariables(Array.isArray(json.builtinVariables) ? json.builtinVariables : []);
        } else {
          setError(json.error ?? "Unable to load follow-up settings");
        }
      }

      didLoad = true;
    } catch {
      setError("Unable to load follow-up settings");
    } finally {
      if (mountedRef.current) {
        if (didLoad) hasLoadedOnceRef.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unlocked = useMemo(() => {
    const email = (me?.user.email ?? "").toLowerCase().trim();
    if (email === DEFAULT_FULL_DEMO_EMAIL) return true;
    return Boolean(me?.entitlements?.booking);
  }, [me]);

  const refreshTags = useCallback(async () => {
    setTagsLoading(true);
    try {
      const res = await fetch("/api/portal/contact-tags", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json.ok || !Array.isArray(json.tags)) {
        throw new Error(typeof json?.error === "string" ? json.error : "Failed to load tags");
      }
      const next = (json.tags as any[])
        .map((t: any) => ({
          id: String(t?.id || ""),
          name: String(t?.name || "").slice(0, 60),
          color: typeof t?.color === "string" ? String(t.color) : null,
        }))
        .filter((t: ContactTag) => t.id && t.name);
      next.sort((a: ContactTag, b: ContactTag) => a.name.localeCompare(b.name));
      setOwnerTags(next);
    } catch {
      setOwnerTags([]);
    } finally {
      setTagsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    void refreshTags();
  }, [refreshTags, unlocked]);

  async function createTag() {
    const name = createTagName.trim();
    if (!name) {
      toast.error("Enter a tag name");
      return;
    }

    setCreateTagBusy(true);
    try {
      const res = await fetch("/api/portal/contact-tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json.ok || !json.tag?.id) {
        throw new Error(typeof json?.error === "string" ? json.error : "Failed to create tag");
      }

      const createdId = String(json.tag.id);
      await refreshTags();

      const stepId = createTagStepId;
      if (stepId) patchStepById(stepId, { tagId: createdId });
      setCreateTagOpen(false);
      setCreateTagName("");
      setCreateTagStepId(null);
      toast.success("Created tag");
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to create tag"));
    } finally {
      setCreateTagBusy(false);
    }
  }

  const canSave = useMemo(() => {
    if (!settings) return false;

    const validateStep = (s: FollowUpStep) => {
      if (!s.enabled) return true;
      if (s.delayMinutes < 0 || s.delayMinutes > MAX_DELAY_MINUTES) return false;

      const audience = s.audience ?? "CONTACT";
      if (s.kind === "TAG" && audience === "INTERNAL") return false;

      if (audience === "INTERNAL") {
        const mode = s.internalRecipients?.mode ?? "BOOKING_NOTIFICATION_EMAILS";
        if (mode === "CUSTOM") {
          const emails = Array.isArray(s.internalRecipients?.emails) ? s.internalRecipients.emails : [];
          const phones = Array.isArray(s.internalRecipients?.phones) ? s.internalRecipients.phones : [];
          if (s.kind === "EMAIL" && emails.filter(Boolean).length < 1) return false;
          if (s.kind === "SMS" && phones.filter(Boolean).length < 1) return false;
        }
      }

      if (s.kind === "EMAIL") {
        if ((s.email?.subjectTemplate ?? "").trim().length < 2) return false;
        if ((s.email?.bodyTemplate ?? "").trim().length < 5) return false;
        return true;
      }

      if (s.kind === "SMS") {
        if ((s.sms?.bodyTemplate ?? "").trim().length < 2) return false;
        return true;
      }

      return Boolean((s.tagId ?? "").trim());
    };

    const chains: FollowUpStep[][] = [settings.assignments.defaultSteps ?? []];
    for (const steps of Object.values(settings.assignments.calendarSteps ?? {})) chains.push(steps ?? []);
    for (const steps of chains) {
      for (const s of steps) {
        if (!s.id.trim() || !s.name.trim()) return false;
        if (!validateStep(s)) return false;
      }
    }

    return true;
  }, [settings]);

  function patchStepById(stepId: string, patch: Partial<FollowUpStep>) {
    if (!settings) return;

    const patchSteps = (steps: FollowUpStep[]) => steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s));

    const nextDefault = patchSteps(settings.assignments.defaultSteps ?? []);
    const nextCalendarSteps: Record<string, FollowUpStep[]> = {};
    for (const [calendarId, steps] of Object.entries(settings.assignments.calendarSteps ?? {})) {
      nextCalendarSteps[calendarId] = patchSteps(steps ?? []);
    }

    setSettings({
      ...settings,
      assignments: {
        ...settings.assignments,
        defaultSteps: nextDefault,
        calendarSteps: nextCalendarSteps,
      },
    });
  }

  function randomStepId() {
    return `step_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
  }

  function stepsFromBuiltInTemplate(t: FollowUpTemplate): FollowUpStep[] {
    const usable = t.steps.filter((s) => s.kind === "SMS" || s.kind === "EMAIL").slice(0, 30);
    return usable.map((s, idx) => {
      const kind = s.kind;
      const emailSubject = String(s.subject || "Follow up");
      const body = String(s.body || "");
      return {
        id: randomStepId(),
        name: `${kind === "EMAIL" ? "Email" : "SMS"} step ${idx + 1}`,
        enabled: true,
        delayMinutes: clampDelayMinutes(s.delayMinutes),
        kind,
        audience: "CONTACT",
        email: kind === "EMAIL" ? { subjectTemplate: emailSubject, bodyTemplate: body } : undefined,
        sms: kind === "SMS" ? { bodyTemplate: body } : undefined,
      };
    });
  }

  function cloneStepsForLoad(rawSteps: FollowUpStep[]): FollowUpStep[] {
    const steps = Array.isArray(rawSteps) ? rawSteps.slice(0, 30) : [];
    return steps.map((s) => ({
      ...s,
      id: randomStepId(),
      email: s.email ? { ...s.email } : undefined,
      sms: s.sms ? { ...s.sms } : undefined,
      tagId: typeof s.tagId === "string" ? s.tagId : undefined,
      internalRecipients:
        (s.audience ?? "CONTACT") === "INTERNAL"
          ? s.internalRecipients?.mode === "CUSTOM"
            ? {
                mode: "CUSTOM",
                emails: Array.isArray(s.internalRecipients.emails) ? [...s.internalRecipients.emails] : [],
                phones: Array.isArray(s.internalRecipients.phones) ? [...s.internalRecipients.phones] : [],
              }
            : { mode: "BOOKING_NOTIFICATION_EMAILS" }
          : undefined,
    }));
  }

  function serializeStepsForChainTemplate(rawSteps: FollowUpStep[]): FollowUpStep[] {
    const steps = Array.isArray(rawSteps) ? rawSteps.slice(0, 30) : [];
    return steps.map((s, idx) => ({
      ...s,
      id: `step${idx + 1}`,
      email: s.email ? { ...s.email } : undefined,
      sms: s.sms ? { ...s.sms } : undefined,
      tagId: typeof s.tagId === "string" ? s.tagId : undefined,
      internalRecipients:
        (s.audience ?? "CONTACT") === "INTERNAL"
          ? s.internalRecipients?.mode === "CUSTOM"
            ? {
                mode: "CUSTOM",
                emails: Array.isArray(s.internalRecipients.emails) ? [...s.internalRecipients.emails] : [],
                phones: Array.isArray(s.internalRecipients.phones) ? [...s.internalRecipients.phones] : [],
              }
            : { mode: "BOOKING_NOTIFICATION_EMAILS" }
          : undefined,
    }));
  }

  const allVariableKeys = useMemo(() => {
    const customKeys = settings ? Object.keys(settings.customVariables || {}) : [];
    const keys = [...builtinVariables, ...customKeys];
    return Array.from(new Set(keys)).filter(Boolean);
  }, [builtinVariables, settings]);

  async function save() {
    if (!settings || !canSave) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/portal/follow-up/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      settings?: Settings;
      queue?: QueueItem[];
      calendars?: Calendar[];
      siteNotificationEmails?: string[];
      builtinVariables?: string[];
      error?: string;
    };
    setBusy(false);
    if (!res.ok || !json.ok || !json.settings) {
      setError(json.error ?? "Unable to save");
      return;
    }
    setSettings(json.settings);
    lastSavedSettingsJsonRef.current = JSON.stringify(json.settings);
    setQueue(Array.isArray(json.queue) ? json.queue : []);
    setCalendars(Array.isArray(json.calendars) ? json.calendars : []);
    setSiteNotificationEmails(Array.isArray(json.siteNotificationEmails) ? json.siteNotificationEmails : []);
    setBuiltinVariables(Array.isArray(json.builtinVariables) ? json.builtinVariables : []);
    toast.success("Saved");
  }

  function fmtDelay(minutes: number) {
    const m = Math.max(0, Math.round(minutes || 0));
    if (m === 0) return "Immediately";
    if (m < 60) return `${m} min`;
    if (m < 60 * 24) {
      const h = Math.round((m / 60) * 10) / 10;
      return `${h} hr`;
    }
    if (m < 60 * 24 * 7) {
      const d = Math.round((m / 60 / 24) * 10) / 10;
      return `${d} days`;
    }
    if (m < 60 * 24 * 365) {
      const w = Math.round((m / (60 * 24 * 7)) * 10) / 10;
      return `${w} weeks`;
    }
    const y = Math.round((m / (60 * 24 * 365)) * 10) / 10;
    return `${y} years`;
  }

  function moveStep(steps: FollowUpStep[], stepId: string, dir: -1 | 1) {
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx < 0) return steps;
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= steps.length) return steps;
    const next = [...steps];
    const [item] = next.splice(idx, 1);
    next.splice(nextIdx, 0, item!);
    return next;
  }

  async function sendTest(channel: "EMAIL" | "SMS") {
    setTestBusy(true);
    setError(null);
    const res = await fetch("/api/portal/follow-up/test-send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel,
        to: channel === "EMAIL" ? testEmail.trim() : testPhone.trim(),
        subject: channel === "EMAIL" ? "Test follow-up" : undefined,
        body: testMessage,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; note?: string };
    setTestBusy(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Test send failed");
      return;
    }
    toast.success(json.note ?? "Sent");
  }

  if (!service) {
    return (
      <div className="mx-auto max-w-5xl rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="text-base font-semibold text-brand-ink">Service not found</div>
      </div>
    );
  }

  if (loading && !hasLoadedOnceRef.current) {
    return (
      <div className="mx-auto max-w-5xl rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
        Loading…
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(251,113,133,0.14)] px-3 py-1 text-xs font-semibold text-(--color-brand-pink)">
            Locked
          </div>
          <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">Unlock {service.title}</h1>

          <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
            <div className="text-sm font-semibold text-zinc-900">What you get</div>
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>Automated follow-ups so leads don’t go cold</span></li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>Consistent messaging across your team</span></li>
              <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" /><span>More booked appointments with less manual work</span></li>
            </ul>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/portal/app/billing?buy=booking"
              className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
            >
              Enable booking to unlock
            </Link>
            <Link
              href={isEmbedded ? "/portal/app/services/booking?tab=follow-up" : "/portal/app/services"}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              {isEmbedded ? "Back to booking" : "Back to services"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={isEmbedded ? "w-full" : "mx-auto w-full max-w-6xl px-4 sm:px-6"}>
      {!isEmbedded ? (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">{service.title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">{service.description}</p>
            {refreshing ? (
              <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-zinc-500">
                <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
                Refreshing…
              </div>
            ) : null}
          </div>
          <Link
            href="/portal/app/services"
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            All services
          </Link>
        </div>
      ) : (
        <div className="rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-sm font-semibold text-zinc-900">Follow-up Automation</div>
          <div className="mt-2 text-sm text-zinc-600">Send follow-ups automatically after a booked appointment ends.</div>
        </div>
      )}

      <div className="mt-6 flex w-full flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("activity")}
          aria-current={tab === "activity" ? "page" : undefined}
          className={
            "flex-1 min-w-40 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "activity"
              ? "border-brand-ink bg-brand-ink text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Activity
        </button>
        <button
          type="button"
          onClick={() => setTab("settings")}
          aria-current={tab === "settings" ? "page" : undefined}
          className={
            "flex-1 min-w-40 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "settings"
              ? "border-brand-ink bg-brand-ink text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Settings
        </button>
      </div>

      {tab === "settings" ? (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <PortalSettingsSection
              title="Automation"
              description="Send follow-ups automatically after a booked appointment ends."
              accent="slate"
              status={settings ? (settings.enabled ? "on" : "off") : undefined}
              collapsible={false}
              dotClassName="hidden"
            >

            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-zinc-800">Enabled</div>
                <div className="mt-0.5 text-xs text-zinc-500">Turn follow-up automation on/off.</div>
              </div>
              <ToggleSwitch
                checked={Boolean(settings?.enabled)}
                disabled={!settings}
                accent="ink"
                onChange={(checked) => settings && setSettings({ ...settings, enabled: checked })}
              />
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold text-zinc-900">Follow-up chain</div>
              <div className="mt-2 text-xs text-zinc-600">Add as many steps as you want. Each step has its own delay, audience, and message.</div>

              {chainTemplatePicker ? (
                <div className="fixed inset-0 z-9998 flex items-end justify-center bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
                  <div className="flex w-full max-w-2xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] flex-col overflow-hidden overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-zinc-900">Load a template</div>
                        <div className="mt-1 text-sm text-zinc-600">Replaces the steps in “{chainTemplatePicker.title}”.</div>
                      </div>
                      <button
                        type="button"
                        aria-label="Close template picker"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-500 transition-all duration-150 hover:-translate-y-0.5 hover:scale-105 hover:bg-zinc-50 hover:text-zinc-800"
                        onClick={() => setChainTemplatePicker(null)}
                        disabled={busy}
                      >
                        ×
                      </button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-semibold text-zinc-700">Save current chain as a template</div>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          value={chainTemplateDraftName}
                          onChange={(e) => setChainTemplateDraftName(e.target.value)}
                          placeholder="Template name"
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                        />
                        <button
                          type="button"
                          disabled={busy || !settings || chainTemplateDraftName.trim().length < 2 || chainTemplatePicker.stepsSnapshot.length < 1}
                          className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                          onClick={() => {
                            if (!settings) return;
                            const name = chainTemplateDraftName.trim().slice(0, 80);
                            if (name.length < 2) return;
                            const id = `chain_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
                            const next = {
                              id,
                              name,
                              steps: serializeStepsForChainTemplate(chainTemplatePicker.stepsSnapshot),
                            };
                            setSettings({
                              ...settings,
                              chainTemplates: [...(settings.chainTemplates ?? []), next].slice(0, 50),
                            });
                            setChainTemplateDraftName("");
                            toast.success("Saved template (remember to Save settings)");
                          }}
                        >
                          Save template
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">Templates are saved when you click “Save settings”.</div>
                    </div>

                    <div className="mt-4 flex-1 overflow-auto pr-1">
                      <div className="text-xs font-semibold text-zinc-600">Built-in templates</div>
                      <div className="mt-2 space-y-2">
                        {FOLLOW_UP_TEMPLATES.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            disabled={busy}
                            className="w-full rounded-3xl border border-zinc-200 bg-white p-4 text-left hover:bg-zinc-50 disabled:opacity-60"
                            onClick={() => {
                              chainTemplatePicker.setSteps(stepsFromBuiltInTemplate(t));
                              toast.success("Loaded template (remember to Save settings)");
                              setChainTemplatePicker(null);
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-zinc-900">{t.title}</div>
                                <div className="mt-1 text-sm text-zinc-600">{t.description}</div>
                              </div>
                              <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-700">
                                {(() => {
                                  const n = t.steps.filter((s) => s.kind === "SMS" || s.kind === "EMAIL").length;
                                  return `${n} step${n === 1 ? "" : "s"}`;
                                })()}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>

                      <div className="mt-5 text-xs font-semibold text-zinc-600">Your templates</div>
                      <div className="mt-2 space-y-2">
                        {(settings?.chainTemplates ?? []).length ? (
                          (settings?.chainTemplates ?? []).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              disabled={busy}
                              className="w-full rounded-3xl border border-zinc-200 bg-white p-4 text-left hover:bg-zinc-50 disabled:opacity-60"
                              onClick={() => {
                                chainTemplatePicker.setSteps(cloneStepsForLoad(t.steps));
                                toast.success("Loaded template (remember to Save settings)");
                                setChainTemplatePicker(null);
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-zinc-900">{t.name}</div>
                                  <div className="mt-1 text-sm text-zinc-600">{t.steps.length} step{t.steps.length === 1 ? "" : "s"}</div>
                                </div>
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="shrink-0 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!settings) return;
                                    if (!window.confirm(`Delete template “${t.name}”?`)) return;
                                    setSettings({
                                      ...settings,
                                      chainTemplates: (settings.chainTemplates ?? []).filter((x) => x.id !== t.id),
                                    });
                                    toast.success("Deleted template (remember to Save settings)");
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                            No saved templates yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {(() => {
                if (!settings) return null;

                const makeBlankStep = (kind: "EMAIL" | "SMS" | "TAG"): FollowUpStep => {
                  if (kind === "TAG") {
                    return {
                      id: randomStepId(),
                      name: "Tag step",
                      enabled: true,
                      delayMinutes: 60,
                      kind: "TAG",
                      audience: "CONTACT",
                      tagId: undefined,
                    };
                  }

                  if (kind === "SMS") {
                    return {
                      id: randomStepId(),
                      name: "SMS step",
                      enabled: true,
                      delayMinutes: 60,
                      kind: "SMS",
                      audience: "CONTACT",
                      sms: { bodyTemplate: "Thanks again, {businessName}" },
                    };
                  }

                  return {
                    id: randomStepId(),
                    name: "Email step",
                    enabled: true,
                    delayMinutes: 60,
                    kind: "EMAIL",
                    audience: "CONTACT",
                    email: {
                      subjectTemplate: "Thanks, {contactName}",
                      bodyTemplate: "Hi {contactName},\n\nThanks again, {businessName}",
                    },
                  };
                };

                const renderChain = (opts: {
                  title: string;
                  steps: FollowUpStep[];
                  setSteps: (next: FollowUpStep[] | ((prev: FollowUpStep[]) => FollowUpStep[])) => void;
                }) => {
                  const steps = Array.isArray(opts.steps) ? opts.steps : [];

                  const updateStep = (stepId: string, patch: Partial<FollowUpStep>) => {
                    opts.setSteps((prev) => (Array.isArray(prev) ? prev : []).map((s) => (s.id === stepId ? { ...s, ...patch } : s)));
                  };

                  const addStep = (step: FollowUpStep) => {
                    opts.setSteps((prev) => [...(Array.isArray(prev) ? prev : []), step].slice(0, 30));
                  };

                  const removeStep = (stepId: string) => {
                    opts.setSteps((prev) => (Array.isArray(prev) ? prev : []).filter((s) => s.id !== stepId));
                  };

                  const addInternalEmailToStep = (stepId: string) => {
                    const email = (stepEmailDrafts[stepId] ?? "").trim().toLowerCase();
                    if (!email) return;
                    const emailLike = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
                    if (!emailLike.test(email)) {
                      toast.error("Invalid email");
                      return;
                    }
                    const s = steps.find((x) => x.id === stepId);
                    if (!s) return;
                    const current = s.internalRecipients?.mode === "CUSTOM" && Array.isArray(s.internalRecipients.emails) ? s.internalRecipients.emails : [];
                    if (current.includes(email)) return;
                    updateStep(stepId, {
                      internalRecipients: {
                        mode: "CUSTOM",
                        emails: [...current, email].slice(0, 20),
                        phones:
                          s.internalRecipients?.mode === "CUSTOM" && Array.isArray(s.internalRecipients.phones)
                            ? s.internalRecipients.phones
                            : [],
                      },
                    });
                    setStepEmailDrafts((prev) => ({ ...prev, [stepId]: "" }));
                  };

                  const addInternalPhoneToStep = (stepId: string) => {
                    const phone = (stepPhoneDrafts[stepId] ?? "").trim();
                    if (!phone) return;
                    if (!/^[0-9+()\- .]*$/.test(phone) || phone.replace(/\D/g, "").length < 10) {
                      toast.error("Invalid phone");
                      return;
                    }
                    const s = steps.find((x) => x.id === stepId);
                    if (!s) return;
                    const current = s.internalRecipients?.mode === "CUSTOM" && Array.isArray(s.internalRecipients.phones) ? s.internalRecipients.phones : [];
                    if (current.includes(phone)) return;
                    updateStep(stepId, {
                      internalRecipients: {
                        mode: "CUSTOM",
                        emails:
                          s.internalRecipients?.mode === "CUSTOM" && Array.isArray(s.internalRecipients.emails)
                            ? s.internalRecipients.emails
                            : [],
                        phones: [...current, phone].slice(0, 20),
                      },
                    });
                    setStepPhoneDrafts((prev) => ({ ...prev, [stepId]: "" }));
                  };

                  const removeInternalRecipientFromStep = (stepId: string, kind: "email" | "phone", value: string) => {
                    const s = steps.find((x) => x.id === stepId);
                    if (!s) return;
                    const emails = s.internalRecipients?.mode === "CUSTOM" && Array.isArray(s.internalRecipients.emails) ? s.internalRecipients.emails : [];
                    const phones = s.internalRecipients?.mode === "CUSTOM" && Array.isArray(s.internalRecipients.phones) ? s.internalRecipients.phones : [];
                    const nextEmails = kind === "email" ? emails.filter((x) => x !== value) : emails;
                    const nextPhones = kind === "phone" ? phones.filter((x) => x !== value) : phones;
                    updateStep(stepId, { internalRecipients: { mode: "CUSTOM", emails: nextEmails, phones: nextPhones } });
                  };

                  return (
                    <div className="mt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-zinc-600">{opts.title}</div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            className="rounded-xl bg-brand-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                            onClick={() => {
                              setChainTemplateDraftName("");
                              setChainTemplatePicker({
                                title: opts.title,
                                stepsSnapshot: steps,
                                setSteps: opts.setSteps,
                              });
                            }}
                          >
                            Load template
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => addStep(makeBlankStep("EMAIL"))}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                          >
                            + Email step
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => addStep(makeBlankStep("SMS"))}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                          >
                            + SMS step
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => addStep(makeBlankStep("TAG"))}
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                          >
                            + Tag step
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 space-y-3">
                        {steps.length ? (
                          steps.map((s, idx) => {
                            const best = delayToBestUnit(s.delayMinutes);
                            const quickPicks = Array.from(
                              new Set([...(siteNotificationEmails || []), ...calendars.flatMap((c) => c.notificationEmails ?? [])]),
                            ).slice(0, 12);
                            const kindLabel = s.kind === "EMAIL" ? "Email" : s.kind === "SMS" ? "SMS" : "Tag";
                            return (
                              <div key={s.id} className="rounded-2xl border border-zinc-200 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0 flex-1">
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-semibold text-zinc-600">
                                        {kindLabel} step {idx + 1}
                                      </div>
                                      <input
                                        value={s.name}
                                        onChange={(e) => updateStep(s.id, { name: e.target.value })}
                                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-300"
                                      />
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                                      <span>{fmtDelay(s.delayMinutes)}</span>
                                      <span>•</span>
                                      <span>{kindLabel}</span>
                                      {(s.audience ?? "CONTACT") === "INTERNAL" ? (
                                        <>
                                          <span>•</span>
                                          <span>Internal</span>
                                        </>
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800">
                                      <span className="text-xs text-zinc-600">On</span>
                                      <ToggleSwitch
                                        checked={Boolean(s.enabled)}
                                        disabled={busy}
                                        accent="ink"
                                        onChange={(checked) => updateStep(s.id, { enabled: checked })}
                                      />
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => opts.setSteps(moveStep(steps, s.id, -1))}
                                      className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => opts.setSteps(moveStep(steps, s.id, 1))}
                                      className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                                    >
                                      ↓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeStep(s.id)}
                                      className="rounded-xl border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-4 space-y-4">
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                      <div>
                                        <label className="text-xs font-semibold text-zinc-600">Delay</label>
                                        <div className="mt-1 grid grid-cols-12 gap-2">
                                          <input
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={best.value}
                                            onChange={(e) => {
                                              const v = Number(e.target.value);
                                              updateStep(s.id, { delayMinutes: valueUnitToMinutes(Number.isFinite(v) ? v : 0, best.unit) });
                                            }}
                                            className="col-span-7 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                                          />
                                          <PortalListboxDropdown
                                            value={best.unit}
                                            onChange={(unit) => updateStep(s.id, { delayMinutes: valueUnitToMinutes(best.value, unit) })}
                                            options={DELAY_UNITS.map((u) => ({ value: u.id, label: u.label }))}
                                            className="col-span-5"
                                            buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                          />
                                        </div>
                                      </div>

                                      <div>
                                        <label className="text-xs font-semibold text-zinc-600">Audience</label>
                                        <PortalListboxDropdown
                                          value={s.audience ?? "CONTACT"}
                                          onChange={(nextAudience) =>
                                            updateStep(s.id, {
                                              audience: nextAudience,
                                              internalRecipients:
                                                nextAudience === "INTERNAL"
                                                  ? (s.internalRecipients ?? { mode: "BOOKING_NOTIFICATION_EMAILS" })
                                                  : undefined,
                                            })
                                          }
                                          options={[
                                            { value: "CONTACT", label: "Client (booking contact)" },
                                            { value: "INTERNAL", label: "Internal (your team)" },
                                          ]}
                                          className="mt-1 w-full"
                                          buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                        />
                                      </div>
                                    </div>

                                    {(s.audience ?? "CONTACT") === "INTERNAL" ? (
                                      <div>
                                        <label className="text-xs font-semibold text-zinc-600">Internal recipients</label>
                                        <PortalListboxDropdown
                                          value={s.internalRecipients?.mode ?? "BOOKING_NOTIFICATION_EMAILS"}
                                          onChange={(mode) => {
                                            updateStep(s.id, {
                                              internalRecipients:
                                                mode === "CUSTOM"
                                                  ? {
                                                      mode: "CUSTOM",
                                                      emails: s.internalRecipients?.mode === "CUSTOM" ? s.internalRecipients.emails ?? [] : [],
                                                      phones: s.internalRecipients?.mode === "CUSTOM" ? s.internalRecipients.phones ?? [] : [],
                                                    }
                                                  : { mode: "BOOKING_NOTIFICATION_EMAILS" },
                                            });
                                          }}
                                          options={[
                                            { value: "BOOKING_NOTIFICATION_EMAILS", label: "Use booking notification emails" },
                                            { value: "CUSTOM", label: "Use custom recipients" },
                                          ]}
                                          className="mt-1 w-full"
                                          buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                        />

                                        {s.internalRecipients?.mode === "CUSTOM" ? (
                                          <div className="mt-3 space-y-4">
                                            <div>
                                              <div className="text-xs font-semibold text-zinc-600">Emails</div>
                                              <div className="mt-2 space-y-2">
                                                {(s.internalRecipients?.emails ?? []).map((email) => (
                                                  <div key={email} className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                                                    <div className="truncate text-sm text-zinc-800">{email}</div>
                                                    <button
                                                      type="button"
                                                      onClick={() => removeInternalRecipientFromStep(s.id, "email", email)}
                                                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-100"
                                                    >
                                                      Remove
                                                    </button>
                                                  </div>
                                                ))}

                                                <div className="flex flex-col gap-2 sm:flex-row">
                                                  <PortalTypeaheadInput
                                                    value={stepEmailDrafts[s.id] ?? ""}
                                                    onChange={(next) => setStepEmailDrafts((prev) => ({ ...prev, [s.id]: next }))}
                                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                                                    placeholder="team@example.com"
                                                    suggestions={recipientEmailSuggestions}
                                                    maxSuggestions={8}
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() => addInternalEmailToStep(s.id)}
                                                    className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                                                  >
                                                    Add
                                                  </button>
                                                </div>

                                                {quickPicks.length ? (
                                                  <div className="pt-1">
                                                    <div className="text-xs text-zinc-500">Quick add:</div>
                                                    <div className="mt-1 flex flex-wrap gap-2">
                                                      {quickPicks.map((email) => (
                                                        <button
                                                          key={email}
                                                          type="button"
                                                          onClick={() => {
                                                            setStepEmailDrafts((prev) => ({ ...prev, [s.id]: email }));
                                                            setTimeout(() => addInternalEmailToStep(s.id), 0);
                                                          }}
                                                          className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-100"
                                                        >
                                                          {email}
                                                        </button>
                                                      ))}
                                                    </div>
                                                  </div>
                                                ) : null}
                                              </div>
                                            </div>

                                            <div>
                                              <div className="text-xs font-semibold text-zinc-600">Phones (SMS)</div>
                                              <div className="mt-2 space-y-2">
                                                {(s.internalRecipients?.phones ?? []).map((phone) => (
                                                  <div key={phone} className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                                                    <div className="truncate text-sm text-zinc-800">{phone}</div>
                                                    <button
                                                      type="button"
                                                      onClick={() => removeInternalRecipientFromStep(s.id, "phone", phone)}
                                                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-zinc-100"
                                                    >
                                                      Remove
                                                    </button>
                                                  </div>
                                                ))}

                                                <div className="flex flex-col gap-2 sm:flex-row">
                                                  <input
                                                    value={stepPhoneDrafts[s.id] ?? ""}
                                                    onChange={(e) => setStepPhoneDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                                                    placeholder="+15551234567"
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() => addInternalPhoneToStep(s.id)}
                                                    className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                                                  >
                                                    Add
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="mt-2 text-xs text-zinc-500 wrap-break-word">
                                            Uses booking notification emails (calendar overrides site). Configure emails in Booking settings.
                                          </div>
                                        )}
                                      </div>
                                    ) : null}

                                    {s.kind === "EMAIL" ? (
                                      <div className="space-y-3">
                                        <div>
                                          <div className="flex items-center justify-between gap-3">
                                            <label className="text-xs font-semibold text-zinc-600">Email subject</label>
                                            <button
                                              type="button"
                                              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                                              onClick={() => {
                                                setVarPickerTarget({ kind: "step", stepId: s.id, field: "emailSubject" });
                                                setVarPickerOpen(true);
                                              }}
                                            >
                                              Insert variable
                                            </button>
                                          </div>
                                          <input
                                            value={s.email?.subjectTemplate ?? ""}
                                            onChange={(e) => updateStep(s.id, { email: { ...(s.email ?? { subjectTemplate: "", bodyTemplate: "" }), subjectTemplate: e.target.value } })}
                                            onFocus={(e) => {
                                              activeFieldElRef.current = e.currentTarget;
                                            }}
                                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                                          />
                                        </div>
                                        <div>
                                          <div className={isMobileApp ? "flex flex-col items-start gap-2" : "flex items-center justify-between gap-3"}>
                                            <label className="text-xs font-semibold text-zinc-600">Email body</label>
                                            <div className={isMobileApp ? "flex w-full flex-wrap items-center gap-2" : "flex items-center gap-2"}>
                                              <button
                                                type="button"
                                                disabled={busy}
                                                className={
                                                  "inline-flex items-center gap-2 rounded-xl px-2 py-1 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 " +
                                                  "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink)"
                                                }
                                                onClick={() => {
                                                  setAiDraftError(null);
                                                  setAiDraftInstruction("");
                                                  setAiDraftModal({
                                                    stepId: s.id,
                                                    kind: "EMAIL",
                                                    stepName: s.name,
                                                    existingSubject: s.email?.subjectTemplate ?? "",
                                                    existingBody: s.email?.bodyTemplate ?? "",
                                                    apply: (patch) => updateStep(s.id, patch),
                                                  });
                                                }}
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
                                                <span>AI draft</span>
                                              </button>
                                              <button
                                                type="button"
                                                className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                                                onClick={() => {
                                                  setVarPickerTarget({ kind: "step", stepId: s.id, field: "emailBody" });
                                                  setVarPickerOpen(true);
                                                }}
                                              >
                                                Insert variable
                                              </button>
                                              <label className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60">
                                                {uploadBusyStepId === s.id ? "Uploading…" : "Upload file"}
                                                <input
                                                  type="file"
                                                  className="hidden"
                                                  disabled={busy || uploadBusyStepId === s.id}
                                                  onChange={async (e) => {
                                                    const f = e.target.files?.[0];
                                                    e.currentTarget.value = "";
                                                    if (!f) return;
                                                    try {
                                                      setUploadBusyStepId(s.id);
                                                      const attachment = await uploadFileAndGetEmailAttachment(f);
                                                      updateStep(s.id, {
                                                        email: {
                                                          ...(s.email ?? { subjectTemplate: "", bodyTemplate: "" }),
                                                          attachments: (() => {
                                                            const prev = Array.isArray(s.email?.attachments) ? s.email!.attachments! : [];
                                                            const next = [...prev.filter((a) => a.mediaItemId !== attachment.mediaItemId), attachment];
                                                            return next.slice(0, 10);
                                                          })(),
                                                        },
                                                      });
                                                    } catch (err: any) {
                                                      toast.error(String(err?.message || "Upload failed"));
                                                    } finally {
                                                      setUploadBusyStepId((prev) => (prev === s.id ? null : prev));
                                                    }
                                                  }}
                                                />
                                              </label>
                                              <button
                                                type="button"
                                                disabled={busy}
                                                className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                                                onClick={() => {
                                                  setMediaPicker({
                                                    title: "Attach from media library",
                                                    onPick: (item) => {
                                                      updateStep(s.id, {
                                                        email: {
                                                          ...(s.email ?? { subjectTemplate: "", bodyTemplate: "" }),
                                                          attachments: (() => {
                                                            const prev = Array.isArray(s.email?.attachments) ? s.email!.attachments! : [];
                                                            const nextAttachment: EmailAttachmentRef = {
                                                              mediaItemId: item.id,
                                                              fileName: item.fileName,
                                                              mimeType: item.mimeType,
                                                            };
                                                            const next = [
                                                              ...prev.filter((a) => a.mediaItemId !== nextAttachment.mediaItemId),
                                                              nextAttachment,
                                                            ];
                                                            return next.slice(0, 10);
                                                          })(),
                                                        },
                                                      });
                                                    },
                                                  });
                                                }}
                                              >
                                                Attach files
                                              </button>
                                            </div>
                                          </div>

                                          {Array.isArray(s.email?.attachments) && s.email!.attachments!.length ? (
                                            <div className="mt-3 space-y-2">
                                              {s.email!.attachments!.map((a, idx) => (
                                                <div
                                                  key={`${a.mediaItemId}-${idx}`}
                                                  className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2"
                                                >
                                                  <div className="min-w-0">
                                                    <div className="truncate text-xs font-semibold text-zinc-800">{a.fileName}</div>
                                                    <div className="mt-0.5 truncate text-[11px] text-zinc-500">{a.mimeType}</div>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => {
                                                      updateStep(s.id, {
                                                        email: {
                                                          ...(s.email ?? { subjectTemplate: "", bodyTemplate: "" }),
                                                          attachments: (s.email?.attachments ?? []).filter((_, i) => i !== idx),
                                                        },
                                                      });
                                                    }}
                                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                                                  >
                                                    Remove
                                                  </button>
                                                </div>
                                              ))}
                                            </div>
                                          ) : null}
                                          <textarea
                                            value={s.email?.bodyTemplate ?? ""}
                                            onChange={(e) => updateStep(s.id, { email: { ...(s.email ?? { subjectTemplate: "", bodyTemplate: "" }), bodyTemplate: e.target.value } })}
                                            onFocus={(e) => {
                                              activeFieldElRef.current = e.currentTarget;
                                            }}
                                            rows={6}
                                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                                          />
                                        </div>
                                      </div>
                                    ) : null}

                                    {s.kind === "SMS" ? (
                                      <div>
                                        <div className={isMobileApp ? "flex flex-col items-start gap-2" : "flex items-center justify-between gap-3"}>
                                          <label className="text-xs font-semibold text-zinc-600">SMS body</label>
                                          <div className={isMobileApp ? "flex w-full flex-wrap items-center gap-2" : "flex items-center gap-2"}>
                                            <button
                                              type="button"
                                              disabled={busy}
                                              className={
                                                "inline-flex items-center gap-2 rounded-xl px-2 py-1 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 " +
                                                "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink)"
                                              }
                                              onClick={() => {
                                                setAiDraftError(null);
                                                setAiDraftInstruction("");
                                                setAiDraftModal({
                                                  stepId: s.id,
                                                  kind: "SMS",
                                                  stepName: s.name,
                                                  existingBody: s.sms?.bodyTemplate ?? "",
                                                  apply: (patch) => updateStep(s.id, patch),
                                                });
                                              }}
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
                                              <span>AI draft</span>
                                            </button>
                                            <button
                                              type="button"
                                              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                                              onClick={() => {
                                                setVarPickerTarget({ kind: "step", stepId: s.id, field: "smsBody" });
                                                setVarPickerOpen(true);
                                              }}
                                            >
                                              Insert variable
                                            </button>
                                          </div>
                                        </div>
                                        <textarea
                                          value={s.sms?.bodyTemplate ?? ""}
                                          onChange={(e) => updateStep(s.id, { sms: { ...(s.sms ?? { bodyTemplate: "" }), bodyTemplate: e.target.value } })}
                                          onFocus={(e) => {
                                            activeFieldElRef.current = e.currentTarget;
                                          }}
                                          rows={3}
                                          className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                                        />
                                      </div>
                                    ) : null}

                                    {s.kind === "TAG" ? (
                                      <div>
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="text-xs font-semibold text-zinc-600">Tag to apply</div>
                                          <button
                                            type="button"
                                            disabled={busy}
                                            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                                            onClick={() => {
                                              setCreateTagStepId(s.id);
                                              setCreateTagName("");
                                              setCreateTagOpen(true);
                                            }}
                                          >
                                            New tag
                                          </button>
                                        </div>
                                        <PortalListboxDropdown
                                          value={String(s.tagId || "")}
                                          disabled={busy || tagsLoading}
                                          onChange={(v) => updateStep(s.id, { tagId: String(v || "") || undefined })}
                                          options={[
                                            { value: "", label: tagsLoading ? "Loading tags…" : "Select a tag…" },
                                            ...ownerTags.map((t) => ({ value: t.id, label: t.name })),
                                          ]}
                                          className="mt-2 w-full max-w-md"
                                          buttonClassName="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                                        />
                                        <div className="mt-2 text-xs text-zinc-500">
                                          This step applies a tag to the contact (no message is sent).
                                        </div>
                                      </div>
                                    ) : null}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-sm text-zinc-600">No steps yet.</div>
                        )}
                      </div>
                    </div>
                  );
                };

                const setDefaultSteps = (next: FollowUpStep[] | ((prev: FollowUpStep[]) => FollowUpStep[])) =>
                  setSettings((prev) => {
                    if (!prev) return prev;
                    const prevSteps = prev.assignments.defaultSteps ?? [];
                    const resolved = typeof next === "function" ? next(prevSteps) : next;
                    return { ...prev, assignments: { ...prev.assignments, defaultSteps: resolved } };
                  });
                const setCalendarSteps = (
                  calendarId: string,
                  next: FollowUpStep[] | ((prev: FollowUpStep[]) => FollowUpStep[]),
                ) =>
                  setSettings((prev) => {
                    if (!prev) return prev;
                    const prevSteps = prev.assignments.calendarSteps?.[calendarId] ?? [];
                    const resolved = typeof next === "function" ? next(prevSteps) : next;
                    return {
                      ...prev,
                      assignments: {
                        ...prev.assignments,
                        calendarSteps: { ...(prev.assignments.calendarSteps ?? {}), [calendarId]: resolved },
                      },
                    };
                  });

                return (
                  <>
                    {renderChain({
                      title: "Default (main booking link)",
                      steps: settings.assignments.defaultSteps ?? [],
                      setSteps: setDefaultSteps,
                    })}

                    {calendars.length ? (
                      <div className="mt-6 space-y-6">
                        {calendars.map((cal) => (
                          <div key={cal.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                            <div className="text-sm font-semibold text-zinc-900">{cal.title}</div>
                            {renderChain({
                              title: "Calendar chain",
                              steps: settings.assignments.calendarSteps?.[cal.id] ?? [],
                              setSteps: (next) => setCalendarSteps(cal.id, next),
                            })}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 text-sm text-zinc-600">No calendars configured yet.</div>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={save}
                disabled={!canSave || busy || !isDirty}
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {busy ? "Saving…" : isDirty ? "Save" : "Saved"}
              </button>
            </div>
            </PortalSettingsSection>
          </div>

          <div className="min-w-0">
            <PortalSettingsSection
              title="Send a test"
              description="Sends immediately. Emails send from Purely Automation with your business name as the sender name."
              accent="slate"
              collapsible={false}
              dotClassName="hidden"
            >

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-600">Test email</label>
                <input
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-600">Test phone</label>
                <input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="+15551234567"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-600">Message</label>
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void sendTest("EMAIL")}
                  disabled={testBusy || testEmail.trim().length < 3}
                  className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {testBusy ? "Sending…" : "Send test email"}
                </button>
                <button
                  type="button"
                  onClick={() => void sendTest("SMS")}
                  disabled={testBusy || testPhone.trim().length < 7}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                >
                  {testBusy ? "Sending…" : "Send test SMS"}
                </button>
              </div>
            </div>
            </PortalSettingsSection>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
            <div className="text-sm font-semibold text-zinc-900">Queue</div>
            <div className="mt-2 text-sm text-zinc-600">Upcoming and recent follow-ups.</div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
              <div className="grid grid-cols-12 gap-2 bg-zinc-50 px-4 py-2 text-xs font-semibold text-zinc-600">
                <div className="col-span-2">When</div>
                <div className="col-span-3">Step</div>
                <div className="col-span-2">Channel</div>
                <div className="col-span-3">To</div>
                <div className="col-span-2">Status</div>
              </div>
              <div className="divide-y divide-zinc-200">
                {queue.length > 0 ? (
                  queue.map((q) => {
                    const recipient = q.channel === "TAG" ? q.contactId || "" : q.to || "";
                    const canLink = q.channel !== "TAG" && Boolean(q.to);

                    const Row = ({ children }: { children: ReactNode }) =>
                      canLink ? (
                        <a
                          href={`/portal/app/services/inbox/${q.channel === "SMS" ? "sms" : "email"}?to=${encodeURIComponent(q.to || "")}`}
                          className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-zinc-50"
                          title="Open thread in Inbox"
                        >
                          {children}
                        </a>
                      ) : (
                        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
                          {children}
                        </div>
                      );

                    return (
                      <Row key={q.id}>
                        <div className="col-span-2 text-zinc-700">{fmtWhen(q.sendAtIso)}</div>
                        <div className="col-span-3 truncate text-zinc-700">{q.stepName}</div>
                        <div className="col-span-2 text-zinc-700">{q.channel}</div>
                        <div className="col-span-3 truncate font-medium text-brand-ink">
                          {recipient || (q.channel === "TAG" ? "(missing contact)" : "")}
                        </div>
                        <div className="col-span-2 text-zinc-600">
                          {q.status === "FAILED" ? (
                            <span className="text-red-700">FAILED</span>
                          ) : q.status === "SENT" ? (
                            <span className="text-emerald-700">SENT</span>
                          ) : q.status === "CANCELED" ? (
                            <span className="text-zinc-500">CANCELED</span>
                          ) : (
                            <span className="text-zinc-700">PENDING</span>
                          )}
                          {q.lastError ? <div className="mt-1 text-xs text-red-700">{q.lastError}</div> : null}
                        </div>
                      </Row>
                    );
                  })
                ) : (
                  <div className="px-4 py-6 text-sm text-zinc-600">No follow-ups queued yet.</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="text-sm font-semibold text-zinc-900">How it works</div>
            <div className="mt-2 space-y-2 text-sm text-zinc-600">
              <div>• When a booking is created, we schedule follow-up messages.</div>
              <div>• Each step has its own delay after the appointment ends.</div>
              <div>• Email sender name uses your business name.</div>
            </div>
            <div className="mt-5">
              <Link
                href="/portal/app/services/booking/appointments"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                View bookings
              </Link>
            </div>
          </div>
        </div>
      )}
      <PortalVariablePickerModal
        open={varPickerOpen}
        onClose={() => {
          setVarPickerOpen(false);
          setVarPickerTarget(null);
        }}
        variables={followUpTemplateVariables}
        createCustom={{
          enabled: true,
          existingKeys: allVariableKeys,
          onCreate: (key, value) => {
            if (!settings) return;
            setSettings({
              ...settings,
              customVariables: { ...settings.customVariables, [key]: value },
            });
          },
        }}
        onPick={(variableKey) => {
          if (!varPickerTarget) return;

          const insert = `{${variableKey}}`;

          if (varPickerTarget.kind === "aiDraft") {
            const { next, cursor } = insertAtCursor(aiDraftInstruction, insert, activeFieldElRef.current);
            setAiDraftInstruction(next);
            requestAnimationFrame(() => {
              const el = activeFieldElRef.current;
              if (!el) return;
              el.focus();
              el.setSelectionRange(cursor, cursor);
            });
            return;
          }

          if (!settings) return;

          const findStep = (): FollowUpStep | null => {
            const inDefault = (settings.assignments.defaultSteps ?? []).find((s) => s.id === varPickerTarget.stepId);
            if (inDefault) return inDefault;
            for (const steps of Object.values(settings.assignments.calendarSteps ?? {})) {
              const hit = (steps ?? []).find((s) => s.id === varPickerTarget.stepId);
              if (hit) return hit;
            }
            return null;
          };

          const step = findStep();
          if (!step) return;

          if (varPickerTarget.field === "emailSubject") {
            if (step.kind !== "EMAIL") return;
            const current = step.email?.subjectTemplate ?? "";
            const { next, cursor } = insertAtCursor(current, insert, activeFieldElRef.current);
            patchStepById(step.id, {
              email: { ...(step.email ?? { subjectTemplate: "", bodyTemplate: "" }), subjectTemplate: next },
            });
            requestAnimationFrame(() => {
              const el = activeFieldElRef.current;
              if (!el) return;
              el.focus();
              el.setSelectionRange(cursor, cursor);
            });
            return;
          }

          if (varPickerTarget.field === "emailBody") {
            if (step.kind !== "EMAIL") return;
            const current = step.email?.bodyTemplate ?? "";
            const { next, cursor } = insertAtCursor(current, insert, activeFieldElRef.current);
            patchStepById(step.id, {
              email: { ...(step.email ?? { subjectTemplate: "", bodyTemplate: "" }), bodyTemplate: next },
            });
            requestAnimationFrame(() => {
              const el = activeFieldElRef.current;
              if (!el) return;
              el.focus();
              el.setSelectionRange(cursor, cursor);
            });
            return;
          }

          if (step.kind !== "SMS") return;
          const current = step.sms?.bodyTemplate ?? "";
          const { next, cursor } = insertAtCursor(current, insert, activeFieldElRef.current);
          patchStepById(step.id, { sms: { ...(step.sms ?? { bodyTemplate: "" }), bodyTemplate: next } });
          requestAnimationFrame(() => {
            const el = activeFieldElRef.current;
            if (!el) return;
            el.focus();
            el.setSelectionRange(cursor, cursor);
          });
        }}
      />

      <PortalMediaPickerModal
        open={Boolean(mediaPicker)}
        onClose={() => setMediaPicker(null)}
        onPick={(item) => {
          const pick = mediaPicker;
          setMediaPicker(null);
          if (!pick) return;
          pick.onPick(item);
        }}
        confirmLabel="Attach"
        title={mediaPicker?.title ?? "Attach"}
      />

      <AppModal
        open={createTagOpen}
        title="Create tag"
        description="Create a new contact tag to use in this follow-up step."
        onClose={() => {
          if (createTagBusy) return;
          setCreateTagOpen(false);
        }}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              disabled={createTagBusy}
              onClick={() => setCreateTagOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={createTagBusy || !createTagName.trim()}
              onClick={() => void createTag()}
            >
              {createTagBusy ? "Creating…" : "Create"}
            </button>
          </div>
        }
      >
        <label className="block">
          <div className="text-xs font-semibold text-zinc-600">Tag name</div>
          <input
            className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
            value={createTagName}
            onChange={(e) => setCreateTagName(e.target.value)}
            disabled={createTagBusy}
            placeholder="e.g. Confirmed"
          />
        </label>
      </AppModal>

      <AppModal
        open={Boolean(aiDraftModal)}
        title="AI draft"
        description="Describe what you want this step to say."
        onClose={() => {
          if (aiDraftBusy) return;
          setAiDraftModal(null);
          setAiDraftError(null);
        }}
        widthClassName="w-[min(640px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              disabled={aiDraftBusy}
              onClick={() => {
                setAiDraftModal(null);
                setAiDraftError(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={aiDraftBusy || !aiDraftModal}
              onClick={async () => {
                if (!aiDraftModal) return;
                setAiDraftBusy(true);
                setAiDraftError(null);
                try {
                  const draft = await generateDraft({
                    kind: aiDraftModal.kind,
                    stepName: aiDraftModal.stepName,
                    prompt: aiDraftInstruction.trim() || undefined,
                    existingSubject: aiDraftModal.kind === "EMAIL" ? aiDraftModal.existingSubject : undefined,
                    existingBody: aiDraftModal.existingBody,
                  });

                  if (!draft) return;

                  if (aiDraftModal.kind === "EMAIL") {
                    const subject = (draft.subject ?? aiDraftModal.existingSubject ?? "").trim();
                    aiDraftModal.apply({
                      email: {
                        subjectTemplate: subject || "Follow-up",
                        bodyTemplate: String(draft.body || ""),
                      },
                    });
                  } else {
                    aiDraftModal.apply({ sms: { bodyTemplate: String(draft.body || "") } });
                  }

                  setAiDraftModal(null);
                  setAiDraftInstruction("");
                } catch (e: any) {
                  setAiDraftError(String(e?.message || "Failed to generate"));
                } finally {
                  setAiDraftBusy(false);
                }
              }}
            >
              {aiDraftBusy ? "Drafting…" : "Generate"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-zinc-600">Instructions</div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                disabled={aiDraftBusy}
                onClick={() => {
                  setVarPickerTarget({ kind: "aiDraft", field: "instruction" });
                  setVarPickerOpen(true);
                }}
              >
                Insert variable
              </button>
            </div>
            <textarea
              className="mt-2 min-h-24 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              value={aiDraftInstruction}
              onChange={(e) => setAiDraftInstruction(e.target.value)}
              onFocus={(e) => {
                activeFieldElRef.current = e.currentTarget;
              }}
              disabled={aiDraftBusy}
              placeholder="e.g. Friendly, short, and ask them to reply with any questions."
            />
          </label>

          {aiDraftError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{aiDraftError}</div>
          ) : null}

          <div className="text-xs text-zinc-500">
            Tip: you can reference variables like {"{contactName}"} and {"{businessName}"}.
          </div>
        </div>
      </AppModal>
    </div>
  );
}
