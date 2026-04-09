"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSetPortalSidebarOverride } from "@/app/portal/PortalSidebarOverride";
import {
  PortalSidebarNavButton,
  portalSidebarBorderButtonActiveClass,
  portalSidebarBorderButtonBaseClass,
  portalSidebarBorderButtonInactiveClass,
  portalSidebarSectionStackClass,
  portalSidebarSectionTitleClass,
} from "@/app/portal/PortalServiceSidebarIcons";
import { PortalMediaPickerModal } from "@/components/PortalMediaPickerModal";
import { ContactTagsEditor, type ContactTag } from "@/components/ContactTagsEditor";
import { InlineSpinner } from "@/components/InlineSpinner";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import { AppModal } from "@/components/AppModal";
import { SuggestedSetupModalLauncher } from "@/components/SuggestedSetupModalLauncher";
import { useToast } from "@/components/ToastProvider";
import { LEAD_OUTBOUND_VARIABLES, type TemplateVariable } from "@/lib/portalTemplateVars";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

const TAG_COLORS = [
  "#0EA5E9", // sky
  "#2563EB", // blue
  "#7C3AED", // violet
  "#EC4899", // pink
  "#F97316", // orange
  "#F59E0B", // amber
  "#10B981", // emerald
  "#22C55E", // green
  "#64748B", // slate
  "#111827", // gray-900
] as const;

type LeadRow = {
  id: string;
  businessName: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  niche: string | null;
  starred: boolean;
  tag?: string | null;
  tagColor?: string | null;
  contactId?: string | null;
  contactTags?: ContactTag[];
  createdAtIso: string;
};

type LeadScrapingSettings = {
  version: 3;
  tagPresets?: Array<{ label: string; color: string }>;
  b2b: {
    tagPresets?: Array<{ label: string; color: string }>;
    niche: string;
    location: string;
    fallbackEnabled?: boolean;
    fallbackLocations?: string[];
    fallbackNiches?: string[];
    count: number;
    requireEmail: boolean;
    requirePhone: boolean;
    requireWebsite: boolean;
    excludeNameContains: string[];
    excludeDomains: string[];
    excludePhones: string[];
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
  b2c: {
    source?: "OSM_ADDRESS" | "OSM_POI_PHONE";
    location?: string;
    country?: string;
    count?: number;
    tagPresets?: Array<{ label: string; color: string }>;
    notes: string;
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
  outbound: {
    enabled: boolean;
    aiDraftAndSend?: boolean;
    aiCampaignId?: string | null;
    aiPrompt?: string;
    email: {
      enabled: boolean;
      trigger: "MANUAL" | "ON_SCRAPE" | "ON_APPROVE";
      subject: string;
      text: string;
    };
    sms: {
      enabled: boolean;
      trigger: "MANUAL" | "ON_SCRAPE" | "ON_APPROVE";
      text: string;
    };
    calls?: {
      enabled: boolean;
      trigger: "MANUAL" | "ON_SCRAPE" | "ON_APPROVE";
    };
    resources: Array<{ label: string; url: string }>;
  };
  outboundState: {
    approvedAtByLeadId: Record<string, string>;
    sentAtByLeadId: Record<string, string>;
  };
};

type MeResponse = {
  entitlements?: Record<string, boolean>;
};

type SettingsResponse = {
  ok?: boolean;
  settings?: LeadScrapingSettings;
  credits?: number;
  placesConfigured?: boolean;
  b2cUnlocked?: boolean;
  aiCallsUnlocked?: boolean;
  error?: string;
};

type LeadsResponse = {
  ok?: boolean;
  totalCount?: number;
  matchedCount?: number;
  leads?: LeadRow[];
  error?: string;
};

type ContactTagsResponse = { ok: true; tags: ContactTag[] } | { ok: false; error?: string };

type RunResponse = {
  ok?: boolean;
  requestedCount?: number;
  createdCount?: number;
  chargedCredits?: number;
  refundedCredits?: number;
  plannedBatches?: number;
  batchesRan?: number;
  usedFallbackLocations?: string[];
  usedFallbackNiches?: string[];
  error?: string;
  code?: string;
};

type OutboundSendResponse = {
  ok?: boolean;
  sent?: { email?: boolean; sms?: boolean; calls?: boolean };
  skipped?: string[];
  sentAtIso?: string | null;
  error?: string;
};

type OutboundApproveResponse = {
  ok?: boolean;
  approved?: boolean;
  approvedAtIso?: string | null;
  sent?: { email?: boolean; sms?: boolean; calls?: boolean } | null;
  sentAtIso?: string | null;
  skipped?: string[];
  error?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getApiError(body: unknown): string | undefined {
  const obj = asRecord(body);
  return typeof obj.error === "string" ? obj.error : undefined;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function csvEscape(v: string) {
  if (v.includes("\"")) v = v.replaceAll("\"", "\"\"");
  if (/[\n\r,\"]/g.test(v)) return `"${v}"`;
  return v;
}

function toCsv(rows: LeadRow[]) {
  const header = ["businessName", "email", "phone", "website", "address", "niche", "tag", "tagColor", "createdAt"].join(",");
  const lines = rows.map((r) =>
    [
      r.businessName,
      r.email ?? "",
      r.phone ?? "",
      r.website ?? "",
      r.address ?? "",
      r.niche ?? "",
      r.tag ?? "",
      r.tagColor ?? "",
      r.createdAtIso,
    ]
      .map((x) => csvEscape(String(x ?? "")))
      .join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseCsvFirstColumn(text: string, { maxRows = 2000 }: { maxRows?: number } = {}) {
  const raw = String(text || "");
  if (!raw.trim()) return [];
  const rows = raw.split(/\r?\n/).slice(0, maxRows);
  const out: string[] = [];

  for (const r of rows) {
    const line = r.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    const first = line.split(",")[0] ?? "";
    const v = first.trim().replace(/^"([\s\S]*)"$/, "$1").trim();
    if (!v) continue;
    out.push(v);
  }

  // Common header values.
  const head = out[0]?.toLowerCase();
  if (head === "value" || head === "domain" || head === "phone" || head === "name") out.shift();

  return out;
}

function normalizeDomainForExclusion(raw: string) {
  let s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0] ?? s;
  s = s.split("?")[0] ?? s;
  s = s.split("#")[0] ?? s;
  return s.trim();
}

function safeFormatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Just now";
  return d.toLocaleString();
}

function toTelHref(phone: string) {
  const digits = phone.replace(/\D+/g, "");
  return digits ? `tel:${digits}` : `tel:${phone}`;
}

function isHexColor(s: string) {
  return /^#[0-9a-fA-F]{6}$/.test(s);
}

const OUTBOUND_TRIGGER_OPTIONS: Array<PortalListboxOption<"MANUAL" | "ON_SCRAPE" | "ON_APPROVE">> = [
  { value: "MANUAL", label: "Manual only" },
  { value: "ON_SCRAPE", label: "On scrape" },
  { value: "ON_APPROVE", label: "On approve" },
];

const B2B_FREQUENCY_UNIT_OPTIONS: Array<PortalListboxOption<"days" | "weeks" | "months">> = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

function ColorSwatches({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}) {
  const colors = (TAG_COLORS as readonly string[]).includes(value)
    ? (TAG_COLORS as readonly string[])
    : ([value, ...TAG_COLORS] as const);

  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      {colors.map((c) => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(c);
            }}
            className={
              selected
                ? "h-7 w-7 rounded-full ring-2 ring-zinc-900 ring-offset-2"
                : "h-7 w-7 rounded-full ring-1 ring-zinc-300 hover:ring-zinc-400"
            }
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
          />
        );
      })}
    </div>
  );
}

function SettingsSection({
  title,
  description,
  accent,
  children,
}: {
  title: string;
  description?: string;
  accent: "blue" | "pink" | "amber" | "emerald" | "slate";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-5" data-accent={accent}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-zinc-900">{title}</div>
          </div>
          {description ? <div className="mt-1 text-sm text-zinc-600">{description}</div> : null}
        </div>
      </div>

      <div className="mt-4">{children}</div>
    </div>
  );
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

export function PortalLeadScrapingClient() {
  const toast = useToast();
  const isMobileApp = useMemo(() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("pa_mobileapp") === "1") return true;
    return (window.location.host || "").includes("purely-mobile");
  }, []);
  const [tab, setTab] = useState<"b2b" | "b2c">("b2b");
  const [b2bSubTab, setB2bSubTab] = useState<"pull" | "leads" | "settings">(() => {
    return "leads";
  });

  const [leadOutboundEntitled, setLeadOutboundEntitled] = useState(false);

  const [settings, setSettings] = useState<LeadScrapingSettings | null>(null);
  const lastSavedSettingsJsonRef = useRef<string | null>(null);
  const currentSettingsJson = useMemo(() => (settings ? JSON.stringify(settings) : null), [settings]);
  const isDirty = Boolean(currentSettingsJson && lastSavedSettingsJsonRef.current && currentSettingsJson !== lastSavedSettingsJsonRef.current);

  const [credits, setCredits] = useState<number | null>(null);
  const [placesConfigured, setPlacesConfigured] = useState<boolean>(false);
  const [aiCallsUnlocked, setAiCallsUnlocked] = useState<boolean>(false);
  const [contactTagDefs, setContactTagDefs] = useState<ContactTag[]>([]);

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

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadTotalCount, setLeadTotalCount] = useState<number | null>(null);
  const [leadMatchedCount, setLeadMatchedCount] = useState<number | null>(null);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadQueryDebounced, setLeadQueryDebounced] = useState("");
  const leadsTake = 500;

  const [leadOpen, setLeadOpen] = useState(false);
  const [leadIndex, setLeadIndex] = useState<number>(0);

  const activeLead = leadOpen ? leads[leadIndex] ?? null : null;
  const activeLeadApprovedAt =
    activeLead && settings ? settings.outboundState.approvedAtByLeadId[activeLead.id] ?? null : null;
  const activeLeadSentAt =
    activeLead && settings ? settings.outboundState.sentAtByLeadId[activeLead.id] ?? null : null;

  function updateLeadContactTags(leadId: string, next: ContactTag[]) {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, contactTags: next } : l)));
  }

  const tagOptions = useMemo(() => {
    const opts: Array<{ label: string; color: string }> = [];
    const seen = new Set<string>();

    for (const t of contactTagDefs) {
      const label = (t.name ?? "").trim();
      const key = label.toLowerCase();
      if (!key || seen.has(key)) continue;
      const color = isHexColor(t.color || "") ? (t.color as string) : "#111827";
      seen.add(key);
      opts.push({ label, color });
      if (opts.length >= 60) break;
    }

    for (const l of leads) {
      const label = (l.tag ?? "").trim();
      const key = label.toLowerCase();
      if (!key || seen.has(key)) continue;
      const color = isHexColor(l.tagColor || "") ? (l.tagColor as string) : "#111827";
      seen.add(key);
      opts.push({ label, color });
      if (opts.length >= 80) break;
    }

    return opts;
  }, [contactTagDefs, leads]);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeSendEmail, setComposeSendEmail] = useState(true);
  const [composeSendSms, setComposeSendSms] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);

  const [composeVarPickerOpen, setComposeVarPickerOpen] = useState(false);
  const [composeVarTarget, setComposeVarTarget] = useState<null | "subject" | "message">(null);
  const composeSubjectRef = useRef<HTMLInputElement | null>(null);
  const composeMessageRef = useRef<HTMLTextAreaElement | null>(null);

  function insertAtCursor(
    current: string,
    insert: string,
    el: HTMLInputElement | HTMLTextAreaElement | null,
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

  function openComposeVarPicker(target: NonNullable<typeof composeVarTarget>) {
    setComposeVarTarget(target);
    setComposeVarPickerOpen(true);
  }

  function applyComposeVariable(variableKey: string) {
    const token = `{${variableKey}}`;
    const setCaretSoon = (el: HTMLInputElement | HTMLTextAreaElement | null, caret: number) => {
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

    if (composeVarTarget === "subject") {
      const el = composeSubjectRef.current;
      const { next, caret } = insertAtCursor(composeSubject, token, el);
      setComposeSubject(next);
      setCaretSoon(el, caret);
      return;
    }

    if (composeVarTarget === "message") {
      const el = composeMessageRef.current;
      const { next, caret } = insertAtCursor(composeMessage, token, el);
      setComposeMessage(next);
      setCaretSoon(el, caret);
    }
  }

  const [leadMutating, setLeadMutating] = useState(false);
  const [deleteForeverLeadId, setDeleteForeverLeadId] = useState<string | null>(null);
  const [leadEmailDraft, setLeadEmailDraft] = useState("");
  const [leadTagDraft, setLeadTagDraft] = useState("");
  const [leadTagColorDraft, setLeadTagColorDraft] = useState("#111827");

  const selectedTagPickValue = useMemo(() => {
    const key = leadTagDraft.trim().toLowerCase();
    if (!key) return "__custom";
    const found = tagOptions.find((o) => o.label.trim().toLowerCase() === key);
    return found ? found.label : "__custom";
  }, [leadTagDraft, tagOptions]);

  const [outboundBusy, setOutboundBusy] = useState(false);
  const [outboundUploadBusy, setOutboundUploadBusy] = useState(false);
  const [outboundResourcesPickerOpen, setOutboundResourcesPickerOpen] = useState(false);

  const [excludeNameDraft, setExcludeNameDraft] = useState("");
  const [excludeDomainDraft, setExcludeDomainDraft] = useState("");
  const [excludePhoneDraft, setExcludePhoneDraft] = useState("");

  const [excludeCsvBusy, setExcludeCsvBusy] = useState<{ name: boolean; domain: boolean; phone: boolean }>({
    name: false,
    domain: false,
    phone: false,
  });

  async function importExclusionsCsv(kind: "name" | "domain" | "phone", file: File) {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error("CSV is too large (max 2MB)");
      return;
    }

    setExcludeCsvBusy((prev) => ({ ...prev, [kind]: true }));
    try {
      const text = await file.text();
      const values = parseCsvFirstColumn(text).slice(0, 2000);

      const normalized =
        kind === "domain"
          ? values.map((v) => normalizeDomainForExclusion(v)).filter(Boolean)
          : values.map((v) => v.trim()).filter(Boolean);

      if (!normalized.length) {
        toast.error("No values found in CSV");
        return;
      }

      let added = 0;
      setSettings((prev) => {
        if (!prev) return prev;
        const b2b = prev.b2b;

        if (kind === "name") {
          const existing = b2b.excludeNameContains;
          const next = Array.from(new Set([...normalized, ...existing])).slice(0, 200);
          added = Math.max(0, next.length - existing.length);
          return { ...prev, b2b: { ...b2b, excludeNameContains: next } };
        }

        if (kind === "domain") {
          const existing = b2b.excludeDomains.map((x) => String(x || "").toLowerCase());
          const next = Array.from(new Set([...normalized.map((x) => x.toLowerCase()), ...existing])).slice(0, 200);
          added = Math.max(0, next.length - existing.length);
          return { ...prev, b2b: { ...b2b, excludeDomains: next } };
        }

        const existing = b2b.excludePhones;
        const next = Array.from(new Set([...normalized, ...existing])).slice(0, 200);
        added = Math.max(0, next.length - existing.length);
        return { ...prev, b2b: { ...b2b, excludePhones: next } };
      });

      toast.success(added > 0 ? `Imported ${added} exclusion${added === 1 ? "" : "s"}` : "Imported (no new exclusions)");
    } catch {
      toast.error("Failed to import CSV");
    } finally {
      setExcludeCsvBusy((prev) => ({ ...prev, [kind]: false }));
    }
  }

  const [fallbackNicheDraft, setFallbackNicheDraft] = useState("");
  const [fallbackLocationDraft, setFallbackLocationDraft] = useState("");

  const [b2bFrequencyCount, setB2bFrequencyCount] = useState<number>(1);
  const [b2bFrequencyUnit, setB2bFrequencyUnit] = useState<"days" | "weeks" | "months">("weeks");

  const [outboundVarPickerOpen, setOutboundVarPickerOpen] = useState(false);
  const [outboundVarTarget, setOutboundVarTarget] = useState<
    null | "emailSubject" | "emailMessage" | "smsMessage" | "aiDraftInstruction"
  >(null);
  const outboundActiveFieldElRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const outboundEmailSubjectRef = useRef<HTMLInputElement | null>(null);
  const outboundEmailMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const outboundSmsMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const outboundAiDraftInstructionRef = useRef<HTMLTextAreaElement | null>(null);

  const [outboundAiDraftBusy, setOutboundAiDraftBusy] = useState(false);
  const [outboundAiDraftError, setOutboundAiDraftError] = useState<string | null>(null);
  const [outboundAiDraftInstruction, setOutboundAiDraftInstruction] = useState("");
  const [outboundAiDraftModal, setOutboundAiDraftModal] = useState<
    | null
    | {
        kind: "EMAIL" | "SMS";
        existingSubject?: string;
        existingBody?: string;
        apply: (draft: { subject?: string; body: string }) => void;
      }
  >(null);

  const [aiCampaigns, setAiCampaigns] = useState<Array<{ id: string; name: string; status: string }> | null>(null);
  const [aiCampaignsBusy, setAiCampaignsBusy] = useState(false);

  const [templateCustomVariables, setTemplateCustomVariables] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const estimatedRunCost = useMemo(() => {
    const c = settings?.b2b?.count ?? 0;
    return clampInt(c, 0, 500);
  }, [settings?.b2b?.count]);

  const plannedBatchesUi = useMemo(() => {
    const c = settings?.b2b?.count ?? 0;
    const base = Math.max(1, Math.ceil(Math.max(0, c) / 60));
    const extra = c >= 50 ? 1 : 0;
    return Math.min(10, base + extra);
  }, [settings?.b2b?.count]);

  const sortedLeads = useCallback(
    (rows: LeadRow[]) =>
      [...rows].sort((a, b) => (Number(b.starred) - Number(a.starred) || b.createdAtIso.localeCompare(a.createdAtIso))),
    [],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setLeadQueryDebounced(leadQuery.trim()), 250);
    return () => window.clearTimeout(t);
  }, [leadQuery]);

  const loadLeads = useCallback(
    async (q: string, opts?: { preserveOnError?: boolean }) => {
      const qs = new URLSearchParams();
      qs.set("take", String(leadsTake));
      if (q) qs.set("q", q);
      qs.set("kind", "B2B");

      const leadsRes = await fetch(`/api/portal/lead-scraping/leads?${qs.toString()}`, { cache: "no-store" });
      const leadsBody = (await leadsRes.json().catch(() => ({}))) as LeadsResponse;

      if (leadsRes.ok) {
        setLeads(sortedLeads(Array.isArray(leadsBody.leads) ? leadsBody.leads : []));
        setLeadTotalCount(typeof leadsBody.totalCount === "number" ? leadsBody.totalCount : null);
        setLeadMatchedCount(typeof leadsBody.matchedCount === "number" ? leadsBody.matchedCount : null);
      } else {
        if (!opts?.preserveOnError) {
          setLeads([]);
          setLeadTotalCount(null);
          setLeadMatchedCount(null);
        }
      }
    },
    [leadsTake, sortedLeads],
  );
  const pickTagTextColor = (hex: string) => {
    if (!isHexColor(hex)) return "text-white";
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 160 ? "text-zinc-900" : "text-white";
  };

  const load = useCallback(async () => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);
    setError(null);
    setStatus(null);

    let didLoad = false;

    try {
      const [meRes, settingsRes, tagsRes, customVarsRes] = await Promise.all([
        fetch("/api/customer/me", {
          cache: "no-store",
          headers: {
            "x-pa-app": "portal",
            "x-portal-variant": typeof window !== "undefined" && window.location.pathname.startsWith("/credit") ? "credit" : "portal",
          },
        }),
        fetch("/api/portal/lead-scraping/settings", { cache: "no-store" }),
        fetch("/api/portal/contact-tags", { cache: "no-store" }).catch(() => null as any),
        fetch("/api/portal/follow-up/custom-variables", { cache: "no-store" }).catch(() => null as any),
      ]);

      const meBody = (await meRes.json().catch(() => ({}))) as MeResponse;
      setLeadOutboundEntitled(Boolean(meBody.entitlements && (meBody.entitlements as any).leadOutbound));

      const settingsBody = (await settingsRes.json().catch(() => ({}))) as SettingsResponse;

      const tagsBody = (await tagsRes?.json().catch(() => ({}))) as ContactTagsResponse | any;
      if (tagsRes?.ok && tagsBody && tagsBody.ok === true && Array.isArray(tagsBody.tags)) {
        setContactTagDefs(tagsBody.tags as ContactTag[]);
      } else {
        setContactTagDefs([]);
      }

      const customVarsBody = (await customVarsRes?.json().catch(() => ({}))) as any;
      if (customVarsRes?.ok && customVarsBody && customVarsBody.ok === true) {
        const raw =
          customVarsBody.customVariables && typeof customVarsBody.customVariables === "object" && !Array.isArray(customVarsBody.customVariables)
            ? (customVarsBody.customVariables as Record<string, unknown>)
            : {};
        const normalized = Object.fromEntries(
          Object.entries(raw)
            .filter(([k, v]) => typeof k === "string" && typeof v === "string")
            .map(([k, v]) => [k.trim(), String(v)])
            .filter(([k]) => Boolean(k))
            .slice(0, 60),
        ) as Record<string, string>;
        setTemplateCustomVariables(normalized);
      } else {
        setTemplateCustomVariables({});
      }

      if (!settingsRes.ok) {
        setError(getApiError(settingsBody) ?? "Failed to load lead scraping settings");
        return;
      }

      const nextSettings = settingsBody.settings ?? null;
      setSettings(nextSettings);
      lastSavedSettingsJsonRef.current = nextSettings ? JSON.stringify(nextSettings) : null;
      setCredits(typeof settingsBody.credits === "number" ? settingsBody.credits : null);
      setPlacesConfigured(Boolean(settingsBody.placesConfigured));
      setAiCallsUnlocked(Boolean(settingsBody.aiCallsUnlocked));

      await loadLeads(leadQueryDebounced, { preserveOnError: !isFirstLoad });

      didLoad = true;
    } finally {
      if (didLoad) hasLoadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [leadQueryDebounced, loadLeads]);

  const leadOutboundTemplateVariables = useMemo(() => {
    const serviceCustom: TemplateVariable[] = Object.keys(templateCustomVariables)
      .map((key) => key.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 60)
      .map((key) => ({
        key,
        label: key,
        group: "Custom" as const,
        appliesTo: "Custom",
      }));

    const contactCustom: TemplateVariable[] = (Array.isArray(knownContactCustomVarKeys) ? knownContactCustomVarKeys : [])
      .filter((k) => typeof k === "string" && k.trim())
      .slice(0, 50)
      .map((k) => ({
        key: `contact.custom.${k}`,
        label: `Contact custom: ${k}`,
        group: "Custom",
        appliesTo: "Lead/contact",
      }));

    const base: TemplateVariable[] = [...LEAD_OUTBOUND_VARIABLES, ...contactCustom, ...serviceCustom];
    const seen = new Set<string>();
    return base.filter((v) => {
      const key = `${v.group}:${v.key}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [knownContactCustomVarKeys, templateCustomVariables]);

  const leadOutboundExistingKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const v of LEAD_OUTBOUND_VARIABLES) keys.add(v.key);
    for (const k of Object.keys(templateCustomVariables ?? {})) keys.add(String(k || "").trim());
    return [...keys].filter(Boolean);
  }, [templateCustomVariables]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const days = Math.max(1, Math.floor(Number(settings?.b2b?.frequencyDays) || 7));
    if (days % 30 === 0) {
      setB2bFrequencyUnit("months");
      setB2bFrequencyCount(Math.max(1, Math.floor(days / 30)));
      return;
    }
    if (days % 7 === 0) {
      setB2bFrequencyUnit("weeks");
      setB2bFrequencyCount(Math.max(1, Math.floor(days / 7)));
      return;
    }
    setB2bFrequencyUnit("days");
    setB2bFrequencyCount(days);
  }, [settings?.b2b?.frequencyDays]);

  useEffect(() => {
    if (!aiCallsUnlocked) return;
    if (aiCampaigns) return;
    if (aiCampaignsBusy) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);

    (async () => {
      setAiCampaignsBusy(true);
      try {
        const variant =
          typeof window !== "undefined" && window.location.pathname.startsWith("/credit") ? "credit" : "portal";

        const res = await fetch("/api/portal/ai-outbound-calls/campaigns?lite=1", {
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "x-pa-app": "portal",
            "x-portal-variant": variant,
          },
        });

        const json = (await res.json().catch(() => ({}))) as any;
        if (cancelled) return;
        if (!res.ok || json?.ok !== true || !Array.isArray(json?.campaigns)) {
          setAiCampaigns([]);
          return;
        }
        setAiCampaigns(
          (json.campaigns as any[])
            .map((c) => ({ id: String(c?.id || ""), name: String(c?.name || ""), status: String(c?.status || "") }))
            .filter((c) => c.id && c.name)
            .slice(0, 200),
        );
      } catch {
        if (cancelled) return;
        setAiCampaigns([]);
      } finally {
        window.clearTimeout(timeout);
        if (cancelled) return;
        setAiCampaignsBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [aiCallsUnlocked, aiCampaigns, aiCampaignsBusy]);

  useEffect(() => {
    if (loading) return;
    if (tab !== "b2b") return;
    void loadLeads(leadQueryDebounced);
  }, [leadQueryDebounced, loadLeads, loading, tab]);

  async function save(): Promise<boolean> {
    if (!settings) return false;
    setSaving(true);
    setError(null);
    setStatus(null);

    const outboundEnabled = Boolean(
      settings.outbound?.email?.enabled ||
        settings.outbound?.sms?.enabled ||
        Boolean((settings.outbound as any)?.aiDraftAndSend),
    );
    const normalizedSettings: LeadScrapingSettings = {
      ...settings,
      outbound: {
        ...settings.outbound,
        enabled: outboundEnabled,
      },
    };

    const res = await fetch("/api/portal/lead-scraping/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: normalizedSettings }),
    });

    const body = (await res.json().catch(() => ({}))) as SettingsResponse;
    setSaving(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to save settings");
      return false;
    }

    const nextSettings = body.settings ?? settings;
    setSettings(nextSettings);
    lastSavedSettingsJsonRef.current = nextSettings ? JSON.stringify(nextSettings) : null;
    setCredits(typeof body.credits === "number" ? body.credits : credits);
    setStatus("Saved");
    window.setTimeout(() => setStatus(null), 1500);
    return true;
  }

  async function runB2bNow() {
    if (!settings) return;

    const saved = await save();
    if (!saved) return;

    setRunning(true);
    setError(null);
    setStatus(null);

    if (plannedBatchesUi > 1) setStatus(`Pulling ${plannedBatchesUi} batches…`);

    const res = await fetch("/api/portal/lead-scraping/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "B2B" }),
    });

    const body = (await res.json().catch(() => ({}))) as RunResponse;
    setRunning(false);

    if (!res.ok) {
      if (res.status === 402 && body?.code === "INSUFFICIENT_CREDITS") {
        setError(body.error ?? "Not enough credits.");
      } else {
        setError(getApiError(body) ?? "Failed to run");
      }
      return;
    }

    const created = typeof body.createdCount === "number" ? body.createdCount : 0;
    const charged = typeof body.chargedCredits === "number" ? body.chargedCredits : 0;
    const refunded = typeof body.refundedCredits === "number" ? body.refundedCredits : 0;
    const requested =
      typeof body.requestedCount === "number" ? body.requestedCount : (settings?.b2b?.count ?? 0);
    const usedFallbacks = Array.isArray(body.usedFallbackLocations)
      ? body.usedFallbackLocations.filter((s) => typeof s === "string" && s.trim())
      : [];

    const usedFallbackNiches = Array.isArray(body.usedFallbackNiches)
      ? body.usedFallbackNiches.filter((s) => typeof s === "string" && s.trim())
      : [];

    const fallbackNotes = [
      usedFallbacks.length ? `Locations: ${usedFallbacks.join(", ")}` : null,
      usedFallbackNiches.length ? `Niches: ${usedFallbackNiches.join(", ")}` : null,
    ].filter(Boolean);
    const fallbackNote = fallbackNotes.length ? ` • Used fallback: ${fallbackNotes.join(" • ")}` : "";

    if (requested > 0 && created < requested) {
      setStatus(
        `Found ${created} lead${created === 1 ? "" : "s"} within these constraints • Requested ${requested} • Charged ${charged} credit${charged === 1 ? "" : "s"}${refunded ? ` • Refunded ${refunded}` : ""}${fallbackNote}`,
      );
    } else {
      setStatus(
        created > 0
          ? `Added ${created} lead${created === 1 ? "" : "s"} • Charged ${charged} credit${charged === 1 ? "" : "s"}${refunded ? ` • Refunded ${refunded}` : ""}${fallbackNote}`
          : `No new leads matched${refunded ? ` (refunded ${refunded} credits)` : ""}${fallbackNote}`,
      );
    }

    await load();
  }

  async function uploadOutboundFile(file: File) {
    setOutboundUploadBusy(true);
    setError(null);
    setStatus(null);

    const form = new FormData();
    form.append("file", file);

    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as any;
    setOutboundUploadBusy(false);

    if (!res.ok) {
      setError((typeof body?.error === "string" ? body.error : null) ?? "Upload failed");
      return;
    }

    const url = typeof body?.url === "string" ? body.url : "";
    if (!url) {
      setError("Upload did not return a URL");
      return;
    }

    setSettings((prev) =>
      prev
        ? {
            ...prev,
            outbound: {
              ...prev.outbound,
              resources: [{ label: file.name.slice(0, 120), url }, ...prev.outbound.resources].slice(0, 30),
            },
          }
        : prev,
    );
    setStatus("Uploaded");
    window.setTimeout(() => setStatus(null), 1200);
  }

  function openOutboundVarPicker(target: NonNullable<typeof outboundVarTarget>) {
    setOutboundVarTarget(target);
    setOutboundVarPickerOpen(true);
  }

  function applyOutboundVariable(variableKey: string) {
    const token = `{${variableKey}}`;

    const setCaretSoon = (el: HTMLInputElement | HTMLTextAreaElement | null, caret: number) => {
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

    if (outboundVarTarget === "emailSubject") {
      const el = outboundEmailSubjectRef.current;
      let nextCaret = 0;
      setSettings((prev) => {
        if (!prev) return prev;
        const current = prev.outbound.email.subject;
        const { next, caret } = insertAtCursor(current, token, el);
        nextCaret = caret;
        return {
          ...prev,
          outbound: { ...prev.outbound, email: { ...prev.outbound.email, subject: next } },
        };
      });
      setCaretSoon(el, nextCaret);
      return;
    }

    if (outboundVarTarget === "emailMessage") {
      const el = outboundEmailMessageRef.current;
      let nextCaret = 0;
      setSettings((prev) => {
        if (!prev) return prev;
        const current = prev.outbound.email.text;
        const { next, caret } = insertAtCursor(current, token, el);
        nextCaret = caret;
        return {
          ...prev,
          outbound: { ...prev.outbound, email: { ...prev.outbound.email, text: next } },
        };
      });
      setCaretSoon(el, nextCaret);
      return;
    }

    if (outboundVarTarget === "smsMessage") {
      const el = outboundSmsMessageRef.current;
      let nextCaret = 0;
      setSettings((prev) => {
        if (!prev) return prev;
        const current = prev.outbound.sms.text;
        const { next, caret } = insertAtCursor(current, token, el);
        nextCaret = caret;
        return {
          ...prev,
          outbound: { ...prev.outbound, sms: { ...prev.outbound.sms, text: next } },
        };
      });
      setCaretSoon(el, nextCaret);
      return;
    }

    if (outboundVarTarget === "aiDraftInstruction") {
      const el = outboundAiDraftInstructionRef.current;
      const { next, caret } = insertAtCursor(outboundAiDraftInstruction, token, el);
      setOutboundAiDraftInstruction(next);
      setCaretSoon(el, caret);
    }
  }

  async function generateOutboundTemplateDraft(opts: {
    kind: "EMAIL" | "SMS";
    prompt?: string;
    existingSubject?: string;
    existingBody?: string;
  }): Promise<{ subject?: string; body: string } | null> {
    const res = await fetch("/api/portal/lead-scraping/outbound/ai/draft-template", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: opts.kind,
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
      toast.error((json as any)?.error || "Failed to generate");
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

  async function sendDefaultOutbound(leadId: string) {
    setOutboundBusy(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/lead-scraping/outbound/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId }),
    });

    const body = (await res.json().catch(() => ({}))) as OutboundSendResponse;
    setOutboundBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to send outbound");
      return;
    }

    const sentAtIso = typeof body.sentAtIso === "string" ? body.sentAtIso : null;
    if (sentAtIso) {
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              outboundState: {
                ...prev.outboundState,
                sentAtByLeadId: { ...prev.outboundState.sentAtByLeadId, [leadId]: sentAtIso },
              },
            }
          : prev,
      );
    }

    const skipped = Array.isArray(body.skipped) ? body.skipped : [];
    setStatus(skipped.length ? `Sent (with skips): ${skipped[0]}` : "Sent");
    window.setTimeout(() => setStatus(null), 2500);
  }

  async function setLeadApproved(leadId: string, approved: boolean) {
    setOutboundBusy(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/lead-scraping/outbound/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId, approved }),
    });

    const body = (await res.json().catch(() => ({}))) as OutboundApproveResponse;
    setOutboundBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to update approval");
      return;
    }

    const approvedAtIso = typeof body.approvedAtIso === "string" ? body.approvedAtIso : null;
    const sentAtIso = typeof body.sentAtIso === "string" ? body.sentAtIso : null;

    setSettings((prev) => {
      if (!prev) return prev;
      const nextApproved = { ...prev.outboundState.approvedAtByLeadId };
      if (approved && approvedAtIso) nextApproved[leadId] = approvedAtIso;
      else delete nextApproved[leadId];

      const nextSent = { ...prev.outboundState.sentAtByLeadId };
      if (sentAtIso) nextSent[leadId] = sentAtIso;

      return {
        ...prev,
        outboundState: {
          ...prev.outboundState,
          approvedAtByLeadId: nextApproved,
          sentAtByLeadId: nextSent,
        },
      };
    });

    const skipped = Array.isArray(body.skipped) ? body.skipped : [];
    setStatus(skipped.length ? `Updated (with skips): ${skipped[0]}` : "Updated");
    window.setTimeout(() => setStatus(null), 2000);
  }

  function openLeadAtIndex(nextIndex: number) {
    if (!leads.length) return;
    const idx = Math.max(0, Math.min(leads.length - 1, Math.floor(nextIndex)));
    setLeadIndex(idx);
    setLeadOpen(true);
  }

  function closeLead() {
    setLeadOpen(false);
    setComposeOpen(false);
  }

  function openCompose() {
    if (!activeLead) return;
    setComposeOpen(true);
    setComposeSubject(`Quick question: ${activeLead.businessName}`.slice(0, 120));
    setComposeMessage(
      [
        `Hi ${activeLead.businessName},`,
        "",
        "Quick question: are you taking on new work right now?",
        "",
        "-",
      ].join("\n"),
    );
    setComposeSendEmail(Boolean(activeLead.email));
    setComposeSendSms(Boolean(activeLead.phone));
  }

  async function sendLeadMessage() {
    if (!activeLead) return;

    const msg = composeMessage.trim();
    if (!msg) {
      setError("Please enter a message.");
      return;
    }
    if (!composeSendEmail && !composeSendSms) {
      setError("Choose Email and/or SMS.");
      return;
    }

    const subject = composeSubject.trim();
    if (composeSendEmail && subject.length > 120) {
      setError("Subject is too long (max 120 characters).");
      return;
    }

    if (composeSendEmail && !activeLead.email) {
      setError("Add an email address to this lead to send email.");
      return;
    }
    if (composeSendSms && !activeLead.phone) {
      setError("This lead has no phone number.");
      return;
    }

    setComposeBusy(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/lead-scraping/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: activeLead.id,
        subject,
        message: msg,
        sendEmail: composeSendEmail,
        sendSms: composeSendSms,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setComposeBusy(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to send message");
      return;
    }

    setComposeOpen(false);
    setComposeSubject("");
    setComposeMessage("");
    setComposeSendEmail(Boolean(activeLead.email));
    setComposeSendSms(Boolean(activeLead.phone));
    setStatus("Sent message");
    window.setTimeout(() => setStatus(null), 1500);
  }

  useEffect(() => {
    if (!activeLead) return;
    setLeadEmailDraft(activeLead.email ?? "");
    setLeadTagDraft(activeLead.tag ?? "");
    const defaultColor = "#111827";
    setLeadTagColorDraft(isHexColor(activeLead.tagColor || "") ? (activeLead.tagColor as string) : defaultColor);
  }, [activeLead]);

  async function patchLead(
    leadId: string,
    patch: { starred?: boolean; email?: string | null; tag?: string | null; tagColor?: string | null },
  ) {
    setLeadMutating(true);
    setError(null);
    setStatus(null);

    const res = await fetch(`/api/portal/lead-scraping/leads/${leadId}` as any, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });

    const body = await res.json().catch(() => ({}));
    setLeadMutating(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to update lead");
      return;
    }

    setLeads((prev) =>
      sortedLeads(
        prev.map((l) =>
          l.id === leadId
            ? {
                ...l,
                ...(patch.starred !== undefined ? { starred: patch.starred } : {}),
                ...(patch.email !== undefined ? { email: patch.email } : {}),
                ...(patch.tag !== undefined ? { tag: patch.tag } : {}),
                ...(patch.tagColor !== undefined ? { tagColor: patch.tagColor } : {}),
              }
            : l,
        ),
      ),
    );
  }

  async function deleteLeadForever(leadId: string) {
    setLeadMutating(true);
    setError(null);
    setStatus(null);

    const res = await fetch(`/api/portal/lead-scraping/leads/${leadId}` as any, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setLeadMutating(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to delete lead");
      return;
    }

    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    setSettings((prev) => {
      if (!prev) return prev;
      const nextApproved = { ...prev.outboundState.approvedAtByLeadId };
      const nextSent = { ...prev.outboundState.sentAtByLeadId };
      delete nextApproved[leadId];
      delete nextSent[leadId];
      return {
        ...prev,
        outboundState: { ...prev.outboundState, approvedAtByLeadId: nextApproved, sentAtByLeadId: nextSent },
      };
    });

    setLeadOpen(false);
    setComposeOpen(false);
    setStatus("Deleted");
    window.setTimeout(() => setStatus(null), 1500);
  }

  function renderOutboundEditor(opts?: { outerClassName?: string; accent?: "blue" | "pink" | "ink" }) {
    if (!settings) return null;

    const toggleAccent = opts?.accent ?? "blue";

    if (!leadOutboundEntitled) {
      return (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          Auto-outbound is gated separately from Lead Scraping. Contact support to enable it on your account.
        </div>
      );
    }

    const aiEnabled = Boolean(settings.outbound.aiDraftAndSend);
    const selectedCampaignId = String(settings.outbound.aiCampaignId ?? "").trim();

    const campaignOptions: Array<PortalListboxOption<string>> = [
      {
        value: "",
        label: aiCampaignsBusy ? "Loading campaigns…" : "Select a campaign…",
        disabled: aiCampaignsBusy,
      },
      ...(aiCampaigns ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        hint: c.status && c.status !== "ACTIVE" ? c.status.toLowerCase() : undefined,
      })),
    ];

    const attachmentsEditor = (disabled: boolean) => (
      <div
        className={
          "mt-4 rounded-2xl border border-zinc-200 bg-white p-4 " +
          (disabled ? "pointer-events-none opacity-60" : "")
        }
      >
        <div className="text-xs font-semibold text-zinc-800">Resources / attachments</div>
        <div className="mt-1 text-[11px] text-zinc-500">Uploaded files become links in your outbound message.</div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50">
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadOutboundFile(f);
                e.currentTarget.value = "";
              }}
              disabled={outboundUploadBusy}
              className="hidden"
            />
            Upload
          </label>
          <button
            type="button"
            disabled={outboundUploadBusy}
            onClick={() => setOutboundResourcesPickerOpen(true)}
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
          >
            Attach from media library
          </button>
          {outboundUploadBusy ? <span className="text-xs text-zinc-500">Uploading…</span> : null}
        </div>

        {settings.outbound.resources.length ? (
          <div className="mt-4 space-y-2">
            {settings.outbound.resources.map((r, idx) => (
              <div
                key={`${r.url}-${idx}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2"
              >
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm font-semibold text-(--color-brand-blue) hover:underline"
                >
                  {r.label}
                </a>
                <button
                  type="button"
                  onClick={() =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              resources: prev.outbound.resources.filter((_, i) => i !== idx),
                            },
                          }
                        : prev,
                    )
                  }
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-xs text-zinc-500">No resources yet.</div>
        )}
      </div>
    );

    const sparkleIcon = (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 2l1.2 4.2L17 7.4l-3.8 1.2L12 13l-1.2-4.4L7 7.4l3.8-1.2L12 2zm7 7l.8 2.8 2.2.7-2.2.7L19 16l-.8-2.8-2.2-.7 2.2-.7L19 9zm-14 3l.8 2.8 2.2.7-2.2.7L5 19l-.8-2.8-2.2-.7 2.2-.7L5 12z" />
      </svg>
    );

    return (
      <div>
        <PortalVariablePickerModal
          open={outboundVarPickerOpen}
          variables={leadOutboundTemplateVariables}
          title="Insert variable"
          createCustom={{
            enabled: true,
            existingKeys: leadOutboundExistingKeys,
            onCreate: async (key, value) => {
              const res = await fetch("/api/portal/follow-up/custom-variables", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ key, value }),
              });
              const body = (await res.json().catch(() => ({}))) as any;
              if (!res.ok || body?.ok !== true) {
                throw new Error(getApiError(body) ?? "Failed to create variable");
              }
              const raw =
                body.customVariables && typeof body.customVariables === "object" && !Array.isArray(body.customVariables)
                  ? (body.customVariables as Record<string, unknown>)
                  : {};
              const normalized = Object.fromEntries(
                Object.entries(raw)
                  .filter(([k, v]) => typeof k === "string" && typeof v === "string")
                  .map(([k, v]) => [k.trim(), String(v)])
                  .filter(([k]) => Boolean(k))
                  .slice(0, 60),
              ) as Record<string, string>;
              setTemplateCustomVariables(normalized);
            },
          }}
          onPick={applyOutboundVariable}
          onClose={() => {
            setOutboundVarPickerOpen(false);
            setOutboundVarTarget(null);
          }}
        />

        <AppModal
          open={Boolean(outboundAiDraftModal)}
          title="AI draft"
          description="Describe what you want this template to say."
          onClose={() => {
            if (outboundAiDraftBusy) return;
            setOutboundAiDraftModal(null);
            setOutboundAiDraftError(null);
          }}
          widthClassName="w-[min(640px,calc(100vw-32px))]"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                disabled={outboundAiDraftBusy}
                onClick={() => {
                  setOutboundAiDraftModal(null);
                  setOutboundAiDraftError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                disabled={outboundAiDraftBusy || !outboundAiDraftModal}
                onClick={async () => {
                  if (!outboundAiDraftModal) return;
                  setOutboundAiDraftBusy(true);
                  setOutboundAiDraftError(null);
                  try {
                    const draft = await generateOutboundTemplateDraft({
                      kind: outboundAiDraftModal.kind,
                      prompt: outboundAiDraftInstruction.trim() || undefined,
                      existingSubject: outboundAiDraftModal.kind === "EMAIL" ? outboundAiDraftModal.existingSubject : undefined,
                      existingBody: outboundAiDraftModal.existingBody,
                    });
                    if (!draft) return;
                    outboundAiDraftModal.apply(draft);
                    setOutboundAiDraftModal(null);
                    setOutboundAiDraftInstruction("");
                  } catch (e: any) {
                    setOutboundAiDraftError(String(e?.message || "Failed to generate"));
                  } finally {
                    setOutboundAiDraftBusy(false);
                  }
                }}
              >
                {outboundAiDraftBusy ? "Drafting…" : "Generate"}
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
                  disabled={outboundAiDraftBusy}
                  onClick={() => openOutboundVarPicker("aiDraftInstruction")}
                >
                  Insert variable
                </button>
              </div>
              <textarea
                ref={outboundAiDraftInstructionRef}
                className="mt-2 min-h-24 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                value={outboundAiDraftInstruction}
                onChange={(e) => setOutboundAiDraftInstruction(e.target.value)}
                onFocus={(e) => {
                  outboundActiveFieldElRef.current = e.currentTarget;
                }}
                disabled={outboundAiDraftBusy}
                placeholder="e.g. Friendly, short, and ask them to reply with any questions."
              />
            </label>

            {outboundAiDraftError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {outboundAiDraftError}
              </div>
            ) : null}

            <div className="text-xs text-zinc-500">Tip: you can reference variables like {"{businessName}"} and {"{website}"}.</div>
          </div>
        </AppModal>

        <AppModal
          open={Boolean(deleteForeverLeadId)}
          title="Delete lead forever?"
          description="This cannot be undone."
          onClose={() => {
            if (leadMutating) return;
            setDeleteForeverLeadId(null);
          }}
          widthClassName="w-[min(560px,calc(100vw-32px))]"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                disabled={leadMutating}
                onClick={() => setDeleteForeverLeadId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                disabled={leadMutating || !deleteForeverLeadId}
                onClick={async () => {
                  const id = deleteForeverLeadId;
                  if (!id) return;
                  setDeleteForeverLeadId(null);
                  await deleteLeadForever(id);
                }}
              >
                Delete forever
              </button>
            </div>
          }
        >
          <div className="text-sm text-zinc-700">
            This will permanently remove the lead from your account.
          </div>
        </AppModal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {aiCallsUnlocked ? (
            <div className="rounded-2xl border border-zinc-200 bg-[linear-gradient(90deg,rgba(29,78,216,0.12),rgba(236,72,153,0.12),rgba(255,255,255,0.92))] p-4 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                    <span className="text-(--color-brand-pink)">{sparkleIcon}</span>
                    AI outbound agent
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    When enabled, your AI outbound agent will automatically reach out to these leads.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-zinc-700">On</div>
                  <ToggleSwitch
                    checked={aiEnabled}
                    accent={toggleAccent}
                    onChange={(checked) =>
                      setSettings((prev) => {
                        if (!prev) return prev;
                        const existingCalls = prev.outbound.calls ?? { enabled: false, trigger: "MANUAL" as const };
                        const defaultCampaignId =
                          checked && !String(prev.outbound.aiCampaignId ?? "").trim() && aiCampaigns?.length
                            ? String(aiCampaigns[0]?.id || "")
                            : String(prev.outbound.aiCampaignId ?? "");

                        return {
                          ...prev,
                          outbound: {
                            ...prev.outbound,
                            enabled: checked ? true : prev.outbound.enabled,
                            aiDraftAndSend: checked,
                            aiCampaignId: defaultCampaignId || null,
                            calls: { ...existingCalls, enabled: checked },
                          },
                        };
                      })
                    }
                  />
                </div>
              </div>

              {aiEnabled ? (
                <div className="mt-4">
                  <label className="block">
                    <div className="text-xs font-semibold text-zinc-700">Campaign</div>
                    <div className="mt-2">
                      <PortalListboxDropdown
                        value={selectedCampaignId}
                        options={campaignOptions}
                        disabled={aiCampaignsBusy}
                        placeholder="Select a campaign…"
                        buttonClassName="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50"
                        onChange={(v) =>
                          setSettings((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  outbound: {
                                    ...prev.outbound,
                                    aiCampaignId: v ? v : null,
                                  },
                                }
                              : prev,
                          )
                        }
                      />
                    </div>

                    {!aiCampaignsBusy && aiCampaigns && aiCampaigns.length === 0 ? (
                      <div className="mt-2 text-xs text-zinc-500">No campaigns found.</div>
                    ) : null}
                  </label>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2">
              <div className="text-sm font-semibold text-zinc-900">AI outbound agent</div>
              <div className="mt-1 text-xs text-zinc-600">
                This requires the AI outbound calls service to be enabled on your account.
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">Email</div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-zinc-700">On</div>
                <ToggleSwitch
                  checked={settings.outbound.email.enabled}
                  accent={toggleAccent}
                  onChange={(checked) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              enabled: checked ? true : prev.outbound.enabled,
                              email: { ...prev.outbound.email, enabled: checked },
                            },
                          }
                        : prev,
                    )
                  }
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <div className={!settings.outbound.email.enabled ? "pointer-events-none opacity-60" : ""}>
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-600">Trigger</div>
                  <div className="mt-1">
                    <PortalListboxDropdown
                      value={settings.outbound.email.trigger}
                      options={OUTBOUND_TRIGGER_OPTIONS}
                      onChange={(v) =>
                        setSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                outbound: {
                                  ...prev.outbound,
                                  email: { ...prev.outbound.email, trigger: v },
                                },
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                </label>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(90deg,rgba(29,78,216,0.95),rgba(236,72,153,0.95))] px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
                    onClick={() => {
                      if (!settings) return;
                      setOutboundAiDraftError(null);
                      setOutboundAiDraftModal({
                        kind: "EMAIL",
                        existingSubject: settings.outbound.email.subject,
                        existingBody: settings.outbound.email.text,
                        apply: (draft) => {
                          setSettings((prev) => {
                            if (!prev) return prev;
                            const subject = (draft.subject ?? prev.outbound.email.subject ?? "").trim().slice(0, 120);
                            const body = String(draft.body || "");
                            return {
                              ...prev,
                              outbound: {
                                ...prev.outbound,
                                email: {
                                  ...prev.outbound.email,
                                  subject: subject || "Quick question",
                                  text: body,
                                },
                              },
                            };
                          });
                        },
                      });
                    }}
                  >
                    <span className="text-white">{sparkleIcon}</span>
                    <span>AI draft</span>
                  </button>
                </div>

                <label className="block">
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-zinc-600">Subject</div>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                      onClick={() => openOutboundVarPicker("emailSubject")}
                    >
                      Insert variable
                    </button>
                  </div>
                  <input
                    ref={outboundEmailSubjectRef}
                    className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                    value={settings.outbound.email.subject}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              outbound: { ...prev.outbound, email: { ...prev.outbound.email, subject: e.target.value } },
                            }
                          : prev,
                      )
                    }
                    onFocus={(e) => {
                      outboundActiveFieldElRef.current = e.currentTarget;
                    }}
                    autoComplete="off"
                  />
                </label>

                <label className="block">
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-zinc-600">Message</div>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                      onClick={() => openOutboundVarPicker("emailMessage")}
                    >
                      Insert variable
                    </button>
                  </div>
                  <textarea
                    ref={outboundEmailMessageRef}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    rows={6}
                    value={settings.outbound.email.text}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              outbound: { ...prev.outbound, email: { ...prev.outbound.email, text: e.target.value } },
                            }
                          : prev,
                      )
                    }
                    onFocus={(e) => {
                      outboundActiveFieldElRef.current = e.currentTarget;
                    }}
                  />
                </label>

                {attachmentsEditor(false)}

                <div className="text-xs text-zinc-500">
                  Email only sends to leads that have an email address. A copy is sent to your profile email.
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">SMS</div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-zinc-700">On</div>
                <ToggleSwitch
                  checked={settings.outbound.sms.enabled}
                  accent={toggleAccent}
                  onChange={(checked) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              enabled: checked ? true : prev.outbound.enabled,
                              sms: { ...prev.outbound.sms, enabled: checked },
                            },
                          }
                        : prev,
                    )
                  }
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <div className={!settings.outbound.sms.enabled ? "pointer-events-none opacity-60" : ""}>
                <label className="block">
                  <div className="text-xs font-semibold text-zinc-600">Trigger</div>
                  <div className="mt-1">
                    <PortalListboxDropdown
                      value={settings.outbound.sms.trigger}
                      options={OUTBOUND_TRIGGER_OPTIONS}
                      onChange={(v) =>
                        setSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                outbound: {
                                  ...prev.outbound,
                                  sms: { ...prev.outbound.sms, trigger: v },
                                },
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                </label>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(90deg,rgba(29,78,216,0.95),rgba(236,72,153,0.95))] px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                    onClick={() => {
                      if (!settings) return;
                      setOutboundAiDraftError(null);
                      setOutboundAiDraftModal({
                        kind: "SMS",
                        existingBody: settings.outbound.sms.text,
                        apply: (draft) => {
                          setSettings((prev) => {
                            if (!prev) return prev;
                            return {
                              ...prev,
                              outbound: {
                                ...prev.outbound,
                                sms: {
                                  ...prev.outbound.sms,
                                  text: String(draft.body || "").slice(0, 900),
                                },
                              },
                            };
                          });
                        },
                      });
                    }}
                  >
                    <span className="text-white">{sparkleIcon}</span>
                    <span>AI draft</span>
                  </button>
                </div>

                <label className="block">
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-zinc-600">Message</div>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                      onClick={() => openOutboundVarPicker("smsMessage")}
                    >
                      Insert variable
                    </button>
                  </div>
                  <textarea
                    ref={outboundSmsMessageRef}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    rows={6}
                    value={settings.outbound.sms.text}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              outbound: { ...prev.outbound, sms: { ...prev.outbound.sms, text: e.target.value } },
                            }
                          : prev,
                      )
                    }
                    onFocus={(e) => {
                      outboundActiveFieldElRef.current = e.currentTarget;
                    }}
                  />
                </label>

                {attachmentsEditor(false)}

                <div className="text-xs text-zinc-500">Texts only send when the lead has a phone number.</div>
              </div>
            </div>
          </div>
        </div>

        <PortalMediaPickerModal
          open={outboundResourcesPickerOpen}
          title="Attach a resource"
          confirmLabel="Attach"
          onClose={() => setOutboundResourcesPickerOpen(false)}
          onPick={(item) => {
            setSettings((prev) =>
              prev
                ? {
                    ...prev,
                    outbound: {
                      ...prev.outbound,
                      resources: [{ label: item.fileName.slice(0, 120), url: item.shareUrl }, ...prev.outbound.resources].slice(0, 30),
                    },
                  }
                : prev,
            );
            setOutboundResourcesPickerOpen(false);
          }}
        />
      </div>
    );
  }

  const setSidebarOverride = useSetPortalSidebarOverride();
  const leadScrapingSidebar = useMemo(() => {
    return (
      <div className="space-y-4">
        <div>
          <div className={portalSidebarSectionTitleClass}>Lead Scraping</div>
          <div className={portalSidebarSectionStackClass}>
            <PortalSidebarNavButton
              type="button"
              onClick={() => setTab("b2b")}
              aria-current={tab === "b2b" ? "page" : undefined}
              label="B2B"
              className={
                `${portalSidebarBorderButtonBaseClass} ` +
                (tab === "b2b" ? portalSidebarBorderButtonActiveClass : portalSidebarBorderButtonInactiveClass)
              }
            >
              B2B
            </PortalSidebarNavButton>
            <PortalSidebarNavButton
              type="button"
              onClick={() => setTab("b2c")}
              aria-current={tab === "b2c" ? "page" : undefined}
              label="B2C"
              className={
                `${portalSidebarBorderButtonBaseClass} ` +
                (tab === "b2c" ? portalSidebarBorderButtonActiveClass : portalSidebarBorderButtonInactiveClass)
              }
            >
              B2C
            </PortalSidebarNavButton>
          </div>
        </div>

        {tab === "b2b" ? (
          <div>
            <div className={portalSidebarSectionTitleClass}>B2B View</div>
            <div className={portalSidebarSectionStackClass}>
              {([
                { key: "leads", label: "Leads" },
                { key: "pull", label: "Leads Pull" },
                { key: "settings", label: "Settings" },
              ] as const).map((item) => (
                <PortalSidebarNavButton
                  key={item.key}
                  type="button"
                  onClick={() => setB2bSubTab(item.key)}
                  aria-current={b2bSubTab === item.key ? "page" : undefined}
                  label={item.label}
                  className={
                    `${portalSidebarBorderButtonBaseClass} ` +
                    (b2bSubTab === item.key ? portalSidebarBorderButtonActiveClass : portalSidebarBorderButtonInactiveClass)
                  }
                >
                  {item.label}
                </PortalSidebarNavButton>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }, [b2bSubTab, tab]);

  useEffect(() => {
    setSidebarOverride({
      desktopSidebarContent: leadScrapingSidebar,
      mobileSidebarContent: leadScrapingSidebar,
    });
  }, [leadScrapingSidebar, setSidebarOverride]);

  useEffect(() => {
    return () => setSidebarOverride(null);
  }, [setSidebarOverride]);

  if (loading && !hasLoadedOnceRef.current) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Loading…
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          Unable to load settings.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Lead Scraping</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Pull hundreds of leads in any niche or area and reach out instantly.
          </p>
          {refreshing ? (
            <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-zinc-500">
              <InlineSpinner className="h-4 w-4 animate-spin text-zinc-400" />
              Refreshing…
            </div>
          ) : null}
        </div>
        <div className="w-full sm:w-auto">
          <SuggestedSetupModalLauncher serviceSlugs={["lead-scraping"]} buttonLabel="Suggested setup" />
        </div>
      </div>

      {status ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{status}</div>
      ) : null}

      {tab === "b2b" ? (
        <>
          {b2bSubTab === "pull" ? (
            <div className="mt-0 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">

                <div className="rounded-3xl border border-zinc-200 bg-white p-6">
                  <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-brand-ink">B2B pulls</div>
                    <div className="mt-1 text-sm text-zinc-600">Search businesses by niche/keywords + location.</div>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    Est. max cost per run:{" "}
                    <span className="font-semibold text-zinc-900">{estimatedRunCost}</span> credits
                  </div>
                </div>

                {!placesConfigured ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Google Places is not configured in this environment (missing GOOGLE_PLACES_API_KEY / GOOGLE_MAPS_API_KEY).
                  </div>
                ) : null}

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <div className="text-sm font-medium text-zinc-800">Niche / keywords</div>
                    <input
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={settings.b2b.niche}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                b2b: {
                                  ...prev.b2b,
                                  niche: e.target.value,
                                },
                              }
                            : prev,
                        )
                      }
                      placeholder="e.g. Roofing, Med Spa, Dentist"
                    />

                    <div className="mt-4 flex h-70 flex-col rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-semibold text-zinc-700">Fallback niches / keywords</div>

                      <div className="mt-3 min-h-0 flex-1 overflow-auto">
                        {(settings.b2b.fallbackNiches ?? []).length ? (
                          <div className="flex flex-wrap gap-2">
                            {(settings.b2b.fallbackNiches ?? []).slice(0, 20).map((v) => (
                              <span
                                key={v}
                                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800"
                              >
                                <span className="max-w-45 truncate">{v}</span>
                                <button
                                  type="button"
                                  className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                                  onClick={() =>
                                    setSettings((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            b2b: {
                                              ...prev.b2b,
                                              fallbackNiches: (prev.b2b.fallbackNiches ?? []).filter((x) => x !== v),
                                            },
                                          }
                                        : prev,
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-zinc-500">None</div>
                        )}
                      </div>

                      <div className="mt-3">
                        <div className="flex gap-2">
                          <input
                            className="h-10 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                            placeholder="e.g. Roofing contractor"
                            value={fallbackNicheDraft}
                            onChange={(e) => setFallbackNicheDraft(e.target.value)}
                            disabled={!Boolean((settings.b2b as any).fallbackEnabled)}
                          />
                          <button
                            type="button"
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                            disabled={!Boolean((settings.b2b as any).fallbackEnabled)}
                            onClick={() => {
                              const nextValue = fallbackNicheDraft.trim();
                              if (!nextValue) return;
                              setSettings((prev) => {
                                if (!prev) return prev;
                                const existing = prev.b2b.fallbackNiches ?? [];
                                const next = Array.from(new Set([nextValue, ...existing])).slice(0, 20);
                                return { ...prev, b2b: { ...prev.b2b, fallbackNiches: next } };
                              });
                              setFallbackNicheDraft("");
                            }}
                          >
                            <span className="text-base leading-none">+</span>
                            <span>Add</span>
                          </button>
                        </div>

                        <div className="mt-2 min-h-8 overflow-hidden text-xs leading-4 text-zinc-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                          If the main niche is too tight, we’ll keep trying these keywords (in your location + fallbacks) until we hit your requested count.
                        </div>
                      </div>
                    </div>
                  </label>

                  <label className="block">
                    <div className="text-sm font-medium text-zinc-800">Location</div>
                    <input
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={settings.b2b.location}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                b2b: {
                                  ...prev.b2b,
                                  location: e.target.value,
                                },
                              }
                            : prev,
                        )
                      }
                      placeholder="e.g. Austin TX"
                    />

                    <div className="mt-4 flex h-70 flex-col rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-semibold text-zinc-700">Fallback locations</div>

                      <div className="mt-3 min-h-0 flex-1 overflow-auto">
                        {(((settings.b2b as any).fallbackLocations ?? []) as string[]).length ? (
                          <div className="flex flex-wrap gap-2">
                            {(((settings.b2b as any).fallbackLocations ?? []) as string[]).slice(0, 20).map((v) => (
                              <span
                                key={v}
                                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800"
                              >
                                <span className="max-w-45 truncate">{v}</span>
                                <button
                                  type="button"
                                  className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                                  onClick={() =>
                                    setSettings((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            b2b: {
                                              ...prev.b2b,
                                              fallbackLocations: (((prev.b2b as any).fallbackLocations ?? []) as string[]).filter(
                                                (x) => x !== v,
                                              ),
                                            } as any,
                                          }
                                        : prev,
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-zinc-500">None</div>
                        )}
                      </div>

                      <div className="mt-3">
                        <div className="flex gap-2">
                          <input
                            className="h-10 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                            placeholder="e.g. Dallas TX"
                            value={fallbackLocationDraft}
                            onChange={(e) => setFallbackLocationDraft(e.target.value)}
                            disabled={!Boolean((settings.b2b as any).fallbackEnabled)}
                          />
                          <button
                            type="button"
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                            disabled={!Boolean((settings.b2b as any).fallbackEnabled)}
                            onClick={() => {
                              const nextValue = fallbackLocationDraft.trim();
                              if (!nextValue) return;
                              setSettings((prev) => {
                                if (!prev) return prev;
                                const existing = (((prev.b2b as any).fallbackLocations ?? []) as string[]).filter(Boolean);
                                const next = Array.from(new Set([nextValue, ...existing])).slice(0, 20);
                                return { ...prev, b2b: { ...prev.b2b, fallbackLocations: next } as any };
                              });
                              setFallbackLocationDraft("");
                            }}
                          >
                            <span className="text-base leading-none">+</span>
                            <span>Add</span>
                          </button>
                        </div>

                        <div className="mt-2 min-h-8 overflow-hidden text-xs leading-4 text-zinc-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                          Add nearby cities/areas to keep pulling until we hit your requested count.
                        </div>
                      </div>
                    </div>
                  </label>

                  <label className="block">
                    <div className="text-sm font-medium text-zinc-800">Count</div>
                    <input
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      type="number"
                      min={1}
                      max={500}
                      value={settings.b2b.count}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev
                            ? {
                                ...prev,
                                b2b: {
                                  ...prev.b2b,
                                  count: clampInt(Number(e.target.value), 1, 500),
                                },
                              }
                            : prev,
                        )
                      }
                    />
                    <div className="mt-1 text-xs text-zinc-500">Recommended: 60 or less per scrape.</div>
                  </label>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-sm font-medium text-zinc-800">Filters</div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="text-zinc-700">Require email</span>
                      <ToggleSwitch
                        checked={settings.b2b.requireEmail}
                        accent="blue"
                        onChange={(checked) =>
                          setSettings((prev) => (prev ? { ...prev, b2b: { ...prev.b2b, requireEmail: checked } } : prev))
                        }
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="text-zinc-700">Require phone</span>
                      <ToggleSwitch
                        checked={settings.b2b.requirePhone}
                        accent="blue"
                        onChange={(checked) =>
                          setSettings((prev) => (prev ? { ...prev, b2b: { ...prev.b2b, requirePhone: checked } } : prev))
                        }
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-zinc-700">Require website</span>
                      <ToggleSwitch
                        checked={settings.b2b.requireWebsite}
                        accent="blue"
                        onChange={(checked) =>
                          setSettings((prev) => (prev ? { ...prev, b2b: { ...prev.b2b, requireWebsite: checked } } : prev))
                        }
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="text-zinc-700">Use fallbacks to reach count</span>
                      <ToggleSwitch
                        checked={Boolean((settings.b2b as any).fallbackEnabled)}
                        accent="blue"
                        onChange={(checked) =>
                          setSettings((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  b2b: {
                                    ...prev.b2b,
                                    fallbackEnabled: checked,
                                  } as any,
                                }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      When enabled, we’ll try fallback niches + locations until we reach your requested count.
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || !isDirty}
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    {saving ? "Saving…" : isDirty ? "Save" : "Saved"}
                  </button>

                  <button
                    type="button"
                    onClick={runB2bNow}
                    disabled={running || !placesConfigured}
                    className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    {running
                      ? plannedBatchesUi > 1
                        ? `Pulling ${plannedBatchesUi} batches…`
                        : "Pulling…"
                      : "Run now"}
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadText(`leads_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(leads))}
                    disabled={!leads.length}
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  >
                    Export CSV
                  </button>

                  <div className="text-xs text-zinc-500 sm:ml-auto">
                    {leads.length} lead{leads.length === 1 ? "" : "s"} shown
                  </div>
                </div>
              </div>
              </div>

              {!isMobileApp ? (
              <div className="flex flex-col rounded-3xl border border-zinc-200 bg-white p-6 lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Leads</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {typeof leadTotalCount === "number" ? (
                        leadQueryDebounced
                          ? `Showing ${leads.length} of ${leadMatchedCount ?? leads.length} matched • ${leadTotalCount} total`
                          : `${leadTotalCount} total`
                      ) : (
                        `${leads.length} loaded`
                      )}
                      {typeof leadTotalCount === "number" && leadTotalCount > leadsTake ? ` • Loaded first ${leadsTake}` : ""}
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="Search leads (name, email, phone, website, address, niche…)"
                  />
                </div>

                <div className="mt-3 max-h-[70vh] min-h-60 space-y-3 overflow-y-auto pr-2 lg:max-h-none lg:min-h-0 lg:flex-1">
                  {leads.length ? (
                    leads.map((l, idx) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => openLeadAtIndex(idx)}
                        className="w-full rounded-2xl border border-zinc-200 p-3 text-left hover:bg-zinc-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-brand-ink">
                              {l.starred ? <span className="mr-1 text-amber-500">★</span> : null}
                              {l.businessName}
                            </div>
                          </div>
                          {l.tag ? (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pickTagTextColor(
                                isHexColor(l.tagColor || "") ? (l.tagColor as string) : "#111827",
                              )}`}
                              style={{
                                backgroundColor: isHexColor(l.tagColor || "") ? (l.tagColor as string) : "#111827",
                              }}
                            >
                              {l.tag}
                            </span>
                          ) : null}
                        </div>
                        {Array.isArray(l.contactTags) && l.contactTags.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {l.contactTags.slice(0, 2).map((tag) => (
                              <span
                                key={tag.id}
                                className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                                style={{
                                  backgroundColor: (tag.color || "#0f172a") + "20",
                                  borderColor: (tag.color || "#0f172a") + "40",
                                  color: tag.color || "#0f172a",
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                            {l.contactTags.length > 2 ? (
                              <span className="text-[10px] font-semibold text-zinc-500">+{l.contactTags.length - 2}</span>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
                          {l.phone ? <span className="whitespace-nowrap">{l.phone}</span> : null}
                          {l.phone && l.website ? <span>•</span> : null}
                          {l.website ? <span className="min-w-0 max-w-full truncate">{l.website}</span> : null}
                        </div>
                        <div className="mt-1 text-xs text-zinc-600">{[l.niche, l.address].filter(Boolean).join(" • ")}</div>
                        <div className="mt-1 text-[11px] text-zinc-500">{safeFormatDateTime(l.createdAtIso)}</div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-600">
                      No leads yet. Run your first pull.
                    </div>
                  )}
                </div>
              </div>
              ) : null}
            </div>
          ) : b2bSubTab === "leads" ? (
            <div className="mt-0">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-base font-semibold text-brand-ink">Leads</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {typeof leadTotalCount === "number" ? (
                        leadQueryDebounced
                          ? `Showing ${leads.length} of ${leadMatchedCount ?? leads.length} matched • ${leadTotalCount} total`
                          : `${leadTotalCount} total`
                      ) : (
                        `${leads.length} loaded`
                      )}
                      {typeof leadTotalCount === "number" && leadTotalCount > leadsTake ? ` • Loaded first ${leadsTake}` : ""}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => downloadText(`leads_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(leads))}
                    disabled={!leads.length}
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  >
                    Export CSV
                  </button>
                </div>

                <div className="mt-4">
                  <input
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="Search leads (name, email, phone, website, address, niche…)"
                  />
                </div>

                <div className="mt-4 space-y-3">
                  {leads.length ? (
                    leads.map((l, idx) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => openLeadAtIndex(idx)}
                        className="w-full rounded-2xl border border-zinc-200 p-3 text-left hover:bg-zinc-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-brand-ink">
                              {l.starred ? <span className="mr-1 text-amber-500">★</span> : null}
                              {l.businessName}
                            </div>
                          </div>
                          {l.tag ? (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pickTagTextColor(
                                isHexColor(l.tagColor || "") ? (l.tagColor as string) : "#111827",
                              )}`}
                              style={{
                                backgroundColor: isHexColor(l.tagColor || "") ? (l.tagColor as string) : "#111827",
                              }}
                            >
                              {l.tag}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
                          {l.phone ? <span className="whitespace-nowrap">{l.phone}</span> : null}
                          {l.phone && l.website ? <span>•</span> : null}
                          {l.website ? <span className="min-w-0 max-w-full truncate">{l.website}</span> : null}
                        </div>
                        <div className="mt-1 text-xs text-zinc-600">{[l.niche, l.address].filter(Boolean).join(" • ")}</div>
                        <div className="mt-1 text-[11px] text-zinc-500">{safeFormatDateTime(l.createdAtIso)}</div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-zinc-200 p-4 text-sm text-zinc-600">
                      No leads yet. Run your first pull.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-0">
              <div className="rounded-3xl border border-zinc-200 bg-white p-6">
                <div className="text-base font-semibold text-brand-ink">B2B settings</div>
                <div className="mt-1 text-sm text-zinc-600">Manage exclusions, scheduling, and auto-outbound.</div>

                <div className="mt-6 space-y-4">
                  <SettingsSection
                    title="Exclusions"
                    description="Keep junk out of your pulls (names, domains, phones)."
                    accent="slate"
                  >
                    <div className="text-xs text-zinc-500">
                      Previously pulled leads will never be repeated. Exclude business names, domains, and phones.
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="text-sm font-semibold text-zinc-900">Exclude business names</div>

                        {settings.b2b.excludeNameContains.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {settings.b2b.excludeNameContains.slice(0, 200).map((v) => (
                              <span
                                key={v}
                                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800"
                              >
                                <span className="max-w-45 truncate">{v}</span>
                                <button
                                  type="button"
                                  className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                                  onClick={() =>
                                    setSettings((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            b2b: {
                                              ...prev.b2b,
                                              excludeNameContains: prev.b2b.excludeNameContains.filter((x) => x !== v),
                                            },
                                          }
                                        : prev,
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-zinc-500">None</div>
                        )}

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input
                            className="h-10 w-full flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                            placeholder="e.g. walmart"
                            value={excludeNameDraft}
                            onChange={(e) => setExcludeNameDraft(e.target.value)}
                          />
                          <button
                            type="button"
                            className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white hover:opacity-95 sm:w-auto"
                            onClick={() => {
                              const nextValue = excludeNameDraft.trim();
                              if (!nextValue) return;
                              setSettings((prev) => {
                                if (!prev) return prev;
                                const existing = prev.b2b.excludeNameContains;
                                const next = Array.from(new Set([nextValue, ...existing])).slice(0, 200);
                                return { ...prev, b2b: { ...prev.b2b, excludeNameContains: next } };
                              });
                              setExcludeNameDraft("");
                            }}
                          >
                            <span className="text-base leading-none">+</span>
                            <span>Add</span>
                          </button>
                        </div>

                        <div className="mt-2">
                          <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              className="hidden"
                              disabled={excludeCsvBusy.name}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (f) void importExclusionsCsv("name", f);
                              }}
                            />
                            {excludeCsvBusy.name ? "Importing…" : "Upload CSV"}
                          </label>
                          <div className="mt-1 text-[11px] text-zinc-500">One value per row; first column is used.</div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="text-sm font-semibold text-zinc-900">Exclude domains</div>

                        {settings.b2b.excludeDomains.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {settings.b2b.excludeDomains.slice(0, 200).map((v) => (
                              <span
                                key={v}
                                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800"
                              >
                                <span className="max-w-45 truncate">{v}</span>
                                <button
                                  type="button"
                                  className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                                  onClick={() =>
                                    setSettings((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            b2b: {
                                              ...prev.b2b,
                                              excludeDomains: prev.b2b.excludeDomains.filter((x) => x !== v),
                                            },
                                          }
                                        : prev,
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-zinc-500">None</div>
                        )}

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input
                            className="h-10 w-full flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                            placeholder="e.g. facebook.com"
                            value={excludeDomainDraft}
                            onChange={(e) => setExcludeDomainDraft(e.target.value)}
                          />
                          <button
                            type="button"
                            className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white hover:opacity-95 sm:w-auto"
                            onClick={() => {
                              const nextValue = excludeDomainDraft.trim().toLowerCase();
                              if (!nextValue) return;
                              setSettings((prev) => {
                                if (!prev) return prev;
                                const existing = prev.b2b.excludeDomains;
                                const next = Array.from(new Set([nextValue, ...existing.map((x) => x.toLowerCase())])).slice(0, 200);
                                return { ...prev, b2b: { ...prev.b2b, excludeDomains: next } };
                              });
                              setExcludeDomainDraft("");
                            }}
                          >
                            <span className="text-base leading-none">+</span>
                            <span>Add</span>
                          </button>
                        </div>

                        <div className="mt-2">
                          <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              className="hidden"
                              disabled={excludeCsvBusy.domain}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (f) void importExclusionsCsv("domain", f);
                              }}
                            />
                            {excludeCsvBusy.domain ? "Importing…" : "Upload CSV"}
                          </label>
                          <div className="mt-1 text-[11px] text-zinc-500">One value per row; first column is used.</div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                        <div className="text-sm font-semibold text-zinc-900">Exclude phones</div>

                        {settings.b2b.excludePhones.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {settings.b2b.excludePhones.slice(0, 200).map((v) => (
                              <span
                                key={v}
                                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-800"
                              >
                                <span className="max-w-45 truncate">{v}</span>
                                <button
                                  type="button"
                                  className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                                  onClick={() =>
                                    setSettings((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            b2b: {
                                              ...prev.b2b,
                                              excludePhones: prev.b2b.excludePhones.filter((x) => x !== v),
                                            },
                                          }
                                        : prev,
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-zinc-500">None</div>
                        )}

                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input
                            className="h-10 w-full flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                            placeholder="e.g. +15551234567"
                            value={excludePhoneDraft}
                            onChange={(e) => setExcludePhoneDraft(e.target.value)}
                          />
                          <button
                            type="button"
                            className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-(--color-brand-blue) px-4 text-sm font-semibold text-white hover:opacity-95 sm:w-auto"
                            onClick={() => {
                              const nextValue = excludePhoneDraft.trim();
                              if (!nextValue) return;
                              setSettings((prev) => {
                                if (!prev) return prev;
                                const existing = prev.b2b.excludePhones;
                                const next = Array.from(new Set([nextValue, ...existing])).slice(0, 200);
                                return { ...prev, b2b: { ...prev.b2b, excludePhones: next } };
                              });
                              setExcludePhoneDraft("");
                            }}
                          >
                            <span className="text-base leading-none">+</span>
                            <span>Add</span>
                          </button>
                        </div>

                        <div className="mt-2">
                          <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50">
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              className="hidden"
                              disabled={excludeCsvBusy.phone}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (f) void importExclusionsCsv("phone", f);
                              }}
                            />
                            {excludeCsvBusy.phone ? "Importing…" : "Upload CSV"}
                          </label>
                          <div className="mt-1 text-[11px] text-zinc-500">One value per row; first column is used.</div>
                        </div>
                      </div>
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    title="Scheduling"
                    description="Scrape leads automatically on a schedule. You can still run manually anytime."
                    accent="amber"
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                        <span className="text-zinc-800">On</span>
                        <ToggleSwitch
                          checked={settings.b2b.scheduleEnabled}
                          accent="blue"
                          onChange={(checked) =>
                            setSettings((prev) =>
                              prev ? { ...prev, b2b: { ...prev.b2b, scheduleEnabled: checked } } : prev,
                            )
                          }
                        />
                      </div>

                      <label className="block sm:col-span-2">
                          <div className="text-sm font-medium text-zinc-800">Frequency</div>

                          <div className="mt-2 flex gap-2">
                            <input
                              className="h-10 w-32 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                              type="number"
                              min={1}
                              max={b2bFrequencyUnit === "days" ? 60 : b2bFrequencyUnit === "weeks" ? 8 : 2}
                              value={b2bFrequencyCount}
                              onChange={(e) => {
                                const nextCount = clampInt(
                                  Number(e.target.value),
                                  1,
                                  b2bFrequencyUnit === "days" ? 60 : b2bFrequencyUnit === "weeks" ? 8 : 2,
                                );
                                setB2bFrequencyCount(nextCount);

                                const nextDays =
                                  b2bFrequencyUnit === "days"
                                    ? nextCount
                                    : b2bFrequencyUnit === "weeks"
                                      ? nextCount * 7
                                      : nextCount * 30;

                                setSettings((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        b2b: { ...prev.b2b, frequencyDays: clampInt(nextDays, 1, 60) },
                                      }
                                    : prev,
                                );
                              }}
                            />

                            <PortalListboxDropdown
                              value={b2bFrequencyUnit}
                              options={B2B_FREQUENCY_UNIT_OPTIONS}
                              buttonClassName="flex h-10 w-full flex-1 items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50"
                              onChange={(nextUnit) => {
                                setB2bFrequencyUnit(nextUnit);

                                const normalizedCount = clampInt(
                                  b2bFrequencyCount,
                                  1,
                                  nextUnit === "days" ? 60 : nextUnit === "weeks" ? 8 : 2,
                                );
                                setB2bFrequencyCount(normalizedCount);

                                const nextDays =
                                  nextUnit === "days"
                                    ? normalizedCount
                                    : nextUnit === "weeks"
                                      ? normalizedCount * 7
                                      : normalizedCount * 30;

                                setSettings((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        b2b: { ...prev.b2b, frequencyDays: clampInt(nextDays, 1, 60) },
                                      }
                                    : prev,
                                );
                              }}
                            />
                          </div>

                        <div className="mt-1 text-xs text-zinc-500">
                          Last run: {settings.b2b.lastRunAtIso ? new Date(settings.b2b.lastRunAtIso).toLocaleString() : "Never"}
                        </div>
                      </label>
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    title="Outbound"
                    description="Enable channels individually and configure your templates (or use an AI outbound campaign)."
                    accent="emerald"
                  >
                    {renderOutboundEditor({ outerClassName: "", accent: "blue" })}
                  </SettingsSection>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !isDirty}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95 disabled:opacity-60"
                >
                  {saving ? "Saving…" : isDirty ? "Save" : "Saved"}
                </button>
              </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mt-4">
          <div className="rounded-3xl border border-[rgba(236,72,153,0.25)] bg-[linear-gradient(90deg,rgba(236,72,153,0.18),rgba(29,78,216,0.10),rgba(255,255,255,0.94))] p-8">
            <div className="text-base font-semibold text-zinc-900">Want B2C leads?</div>
            <div className="mt-2 max-w-2xl text-sm text-zinc-700">
              Book a call and we’ll tailor sources, filters, and follow-up for your market.
            </div>
            <a
              href={toPurelyHostedUrl("/book-a-call")}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center justify-center rounded-2xl bg-(--color-brand-pink) px-5 py-3 text-sm font-semibold text-white shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:opacity-95"
            >
              Book a call
            </a>
          </div>
        </div>
      )}

      {leadOpen && activeLead ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)] sm:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={closeLead}
          />

          <div className="relative w-full max-w-2xl">
            <button
              type="button"
              onClick={() => setLeadIndex((i) => Math.max(0, i - 1))}
              disabled={leadIndex <= 0}
              className="absolute -left-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition-transform duration-150 hover:-translate-y-[55%] hover:bg-zinc-50 disabled:opacity-40 sm:flex"
              aria-label="Previous lead"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setLeadIndex((i) => Math.min(leads.length - 1, i + 1))}
              disabled={leadIndex >= leads.length - 1}
              className="absolute -right-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40 sm:flex"
              aria-label="Next lead"
            >
              →
            </button>

            <div className="relative max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
              <button
                type="button"
                onClick={closeLead}
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent bg-white text-zinc-500 hover:border-zinc-200 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(29,78,216,0.25)]"
                aria-label="Close"
              >
                ✕
              </button>

              <div className="pr-10">
                <div className="text-lg font-semibold text-brand-ink">{activeLead.businessName}</div>
                <div className="mt-1 text-xs text-zinc-500">Pulled: {safeFormatDateTime(activeLead.createdAtIso)}</div>
              </div>

              {activeLead.contactId ? (
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4">
                  <div className="text-xs font-semibold text-zinc-600">Contact tags</div>
                  <div className="mt-2">
                    <ContactTagsEditor
                      compact
                      contactId={activeLead.contactId}
                      tags={activeLead.contactTags ?? []}
                      onChange={(next) => updateLeadContactTags(activeLead.id, next)}
                    />
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-600">Phone</div>
                  <div className="mt-1 text-sm text-zinc-900">{activeLead.phone ?? "N/A"}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-600">Email</div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={leadEmailDraft}
                      onChange={(e) => setLeadEmailDraft(e.target.value)}
                      placeholder="Add email to enable email sends"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => patchLead(activeLead.id, { email: leadEmailDraft.trim() || null })}
                      disabled={leadMutating}
                      className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-600">Website</div>
                  <div className="mt-1 wrap-break-word text-sm text-zinc-900">
                    {activeLead.website ? (
                      <a
                        href={activeLead.website}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-(--color-brand-blue) hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {activeLead.website}
                      </a>
                    ) : (
                      "N/A"
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-semibold text-zinc-600">Tag</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-6 sm:items-end">
                  <label className="block sm:col-span-3">
                    <div className="text-xs font-medium text-zinc-700">Pick a tag</div>
                    <PortalListboxDropdown
                      value={selectedTagPickValue}
                      onChange={(v) => {
                        if (v === "__custom") return;
                        const found = tagOptions.find((o) => o.label === v);
                        if (!found) return;
                        setLeadTagDraft(found.label);
                        setLeadTagColorDraft(found.color);
                      }}
                      options={[
                        { value: "__custom", label: "Custom / type below" },
                        ...tagOptions.map((o) => ({ value: o.label, label: o.label })),
                      ]}
                      className="mt-1 w-full"
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                    />
                  </label>

                  <label className="block sm:col-span-3">
                    <div className="text-xs font-medium text-zinc-700">Label</div>
                    <input
                      value={leadTagDraft}
                      onChange={(e) => setLeadTagDraft(e.target.value)}
                      placeholder="e.g. New"
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      autoComplete="off"
                    />
                  </label>

                  <div className="sm:col-span-6">
                    <div className="text-xs font-medium text-zinc-700">Color</div>
                    <div className="mt-2">
                      <ColorSwatches value={leadTagColorDraft} onChange={setLeadTagColorDraft} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      patchLead(activeLead.id, {
                        tag: leadTagDraft.trim() || null,
                        tagColor: leadTagDraft.trim() ? leadTagColorDraft : null,
                      })
                    }
                    disabled={leadMutating}
                    className="sm:col-span-6 shrink-0 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  >
                    Save
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLeadTagDraft("");
                      setLeadTagColorDraft("#111827");
                      void patchLead(activeLead.id, { tag: null, tagColor: null });
                    }}
                    disabled={leadMutating}
                    className="sm:col-span-6 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  >
                    Clear tag
                  </button>
                </div>
              </div>

              {activeLead.address || activeLead.niche ? (
                <div className="mt-4 text-sm text-zinc-700">
                  {[activeLead.niche, activeLead.address].filter(Boolean).join(" • ")}
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => patchLead(activeLead.id, { starred: !activeLead.starred })}
                  disabled={leadMutating}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                >
                  {activeLead.starred ? "★ Starred" : "☆ Star"}
                </button>

                {leadOutboundEntitled && settings.outbound.enabled ? (
                  <button
                    type="button"
                    onClick={() => setLeadApproved(activeLead.id, !Boolean(activeLeadApprovedAt))}
                    disabled={outboundBusy}
                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {activeLeadApprovedAt ? "Unapprove" : "Approve"}
                  </button>
                ) : null}

                {leadOutboundEntitled && settings.outbound.enabled ? (
                  <button
                    type="button"
                    onClick={() => sendDefaultOutbound(activeLead.id)}
                    disabled={outboundBusy}
                    className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    {outboundBusy ? "Working…" : "Send default"}
                  </button>
                ) : null}

                {activeLead.phone ? (
                  <a
                    href={toTelHref(activeLead.phone)}
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Call
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white opacity-60"
                  >
                    Call
                  </button>
                )}

                <button
                  type="button"
                  onClick={openCompose}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Email / SMS
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDeleteForeverLeadId(activeLead.id);
                  }}
                  disabled={leadMutating}
                  className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  Delete forever
                </button>

                <div className="text-xs text-zinc-500 sm:ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
                  {activeLeadApprovedAt ? (
                    <span className="whitespace-nowrap">Approved: {safeFormatDateTime(activeLeadApprovedAt)}</span>
                  ) : null}
                  {activeLeadSentAt ? (
                    <span className="whitespace-nowrap">Sent: {safeFormatDateTime(activeLeadSentAt)}</span>
                  ) : null}
                  <span className="whitespace-nowrap">
                    {leadIndex + 1} / {leads.length}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 sm:hidden">
                <button
                  type="button"
                  onClick={() => setLeadIndex((i) => Math.max(0, i - 1))}
                  disabled={leadIndex <= 0}
                  className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setLeadIndex((i) => Math.min(leads.length - 1, i + 1))}
                  disabled={leadIndex >= leads.length - 1}
                  className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>

              {composeOpen ? (
                <div className="mt-5 rounded-3xl border border-zinc-200 bg-white p-5">
                  <PortalVariablePickerModal
                    open={composeVarPickerOpen}
                    variables={leadOutboundTemplateVariables}
                    createCustom={{
                      enabled: true,
                      existingKeys: leadOutboundExistingKeys,
                      onCreate: async (key, value) => {
                        const res = await fetch("/api/portal/follow-up/custom-variables", {
                          method: "PUT",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ key, value }),
                        });
                        const body = (await res.json().catch(() => ({}))) as any;
                        if (!res.ok || body?.ok !== true) {
                          throw new Error(getApiError(body) ?? "Failed to create variable");
                        }
                        const raw =
                          body.customVariables && typeof body.customVariables === "object" && !Array.isArray(body.customVariables)
                            ? (body.customVariables as Record<string, unknown>)
                            : {};
                        const normalized = Object.fromEntries(
                          Object.entries(raw)
                            .filter(([k, v]) => typeof k === "string" && typeof v === "string")
                            .map(([k, v]) => [k.trim(), String(v)])
                            .filter(([k]) => Boolean(k))
                            .slice(0, 60),
                        ) as Record<string, string>;
                        setTemplateCustomVariables(normalized);
                      },
                    }}
                    onPick={applyComposeVariable}
                    onClose={() => {
                      setComposeVarPickerOpen(false);
                      setComposeVarTarget(null);
                    }}
                  />

                  <div className="text-sm font-semibold text-zinc-900">Compose</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <div className="text-xs font-semibold text-zinc-600">Lead email</div>
                      <input
                        value={activeLead.email ?? ""}
                        disabled
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                        placeholder="N/A"
                      />
                    </label>
                    <label className="block">
                      <div className="text-xs font-semibold text-zinc-600">To (phone)</div>
                      <input
                        value={activeLead.phone ?? ""}
                        disabled
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-700"
                      />
                    </label>

                    <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-1">
                      <div className="inline-flex items-center gap-2 text-sm text-zinc-700">
                        <span className="font-semibold">Email</span>
                        <ToggleSwitch
                          checked={composeSendEmail}
                          onChange={setComposeSendEmail}
                          disabled={!activeLead.email}
                          accent="blue"
                        />
                      </div>
                      <div className="inline-flex items-center gap-2 text-sm text-zinc-700">
                        <span className="font-semibold">SMS</span>
                        <ToggleSwitch
                          checked={composeSendSms}
                          onChange={setComposeSendSms}
                          disabled={!activeLead.phone}
                          accent="blue"
                        />
                      </div>
                      {!activeLead.phone ? (
                        <span className="text-xs text-zinc-500">No phone on this lead</span>
                      ) : null}
                      {!activeLead.email ? (
                        <span className="text-xs text-zinc-500">No email on this lead</span>
                      ) : null}
                    </div>

                    <label className="block sm:col-span-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-zinc-600">Subject (email)</div>
                        <button
                          type="button"
                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                          onClick={() => openComposeVarPicker("subject")}
                        >
                          Insert variable
                        </button>
                      </div>
                      <input
                        ref={composeSubjectRef}
                        value={composeSubject}
                        onChange={(e) => setComposeSubject(e.target.value)}
                        disabled={!composeSendEmail}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                        autoComplete="off"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-zinc-600">Message</div>
                        <button
                          type="button"
                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                          onClick={() => openComposeVarPicker("message")}
                        >
                          Insert variable
                        </button>
                      </div>
                      <textarea
                        ref={composeMessageRef}
                        value={composeMessage}
                        onChange={(e) => setComposeMessage(e.target.value)}
                        rows={5}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={sendLeadMessage}
                      disabled={composeBusy}
                      className={
                        composeBusy
                          ? "inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white opacity-70"
                          : "inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                      }
                    >
                      {composeBusy ? "Sending…" : "Send"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setComposeOpen(false)}
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
