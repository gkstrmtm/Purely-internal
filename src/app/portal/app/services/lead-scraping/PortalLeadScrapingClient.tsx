"use client";

import { useEffect, useMemo, useState } from "react";

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
  createdAtIso: string;
};

type LeadScrapingSettings = {
  version: 3;
  b2b: {
    niche: string;
    location: string;
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
    notes: string;
    scheduleEnabled: boolean;
    frequencyDays: number;
    lastRunAtIso: string | null;
  };
  outbound: {
    enabled: boolean;
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
  error?: string;
};

type LeadsResponse = {
  ok?: boolean;
  totalCount?: number;
  matchedCount?: number;
  leads?: LeadRow[];
  error?: string;
};

type RunResponse = {
  ok?: boolean;
  createdCount?: number;
  chargedCredits?: number;
  refundedCredits?: number;
  plannedBatches?: number;
  batchesRan?: number;
  error?: string;
  code?: string;
};

type OutboundSendResponse = {
  ok?: boolean;
  sent?: { email?: boolean; sms?: boolean };
  skipped?: string[];
  sentAtIso?: string | null;
  error?: string;
};

type OutboundApproveResponse = {
  ok?: boolean;
  approved?: boolean;
  approvedAtIso?: string | null;
  sent?: { email?: boolean; sms?: boolean } | null;
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

function safeFormatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Just now";
  return d.toLocaleString();
}

function toTelHref(phone: string) {
  const digits = phone.replace(/\D+/g, "");
  return digits ? `tel:${digits}` : `tel:${phone}`;
}

export function PortalLeadScrapingClient() {
  const [tab, setTab] = useState<"b2b" | "b2c">("b2b");

  const [leadOutboundEntitled, setLeadOutboundEntitled] = useState(false);

  const [settings, setSettings] = useState<LeadScrapingSettings | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [placesConfigured, setPlacesConfigured] = useState<boolean>(false);

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

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeSendEmail, setComposeSendEmail] = useState(true);
  const [composeSendSms, setComposeSendSms] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);

  const [leadMutating, setLeadMutating] = useState(false);
  const [leadEmailDraft, setLeadEmailDraft] = useState("");
  const [leadTagDraft, setLeadTagDraft] = useState("");
  const [leadTagColorDraft, setLeadTagColorDraft] = useState("#111827");

  const [outboundBusy, setOutboundBusy] = useState(false);
  const [outboundUploadBusy, setOutboundUploadBusy] = useState(false);
  const [outboundNewResourceLabel, setOutboundNewResourceLabel] = useState("");
  const [outboundNewResourceUrl, setOutboundNewResourceUrl] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const sortedLeads = (rows: LeadRow[]) =>
    [...rows].sort((a, b) => (Number(b.starred) - Number(a.starred) || b.createdAtIso.localeCompare(a.createdAtIso)));

  useEffect(() => {
    const t = window.setTimeout(() => setLeadQueryDebounced(leadQuery.trim()), 250);
    return () => window.clearTimeout(t);
  }, [leadQuery]);

  async function loadLeads(q: string) {
    const qs = new URLSearchParams();
    qs.set("take", String(leadsTake));
    if (q) qs.set("q", q);

    const leadsRes = await fetch(`/api/portal/lead-scraping/leads?${qs.toString()}`, { cache: "no-store" });
    const leadsBody = (await leadsRes.json().catch(() => ({}))) as LeadsResponse;

    if (leadsRes.ok) {
      setLeads(sortedLeads(Array.isArray(leadsBody.leads) ? leadsBody.leads : []));
      setLeadTotalCount(typeof leadsBody.totalCount === "number" ? leadsBody.totalCount : null);
      setLeadMatchedCount(typeof leadsBody.matchedCount === "number" ? leadsBody.matchedCount : null);
    } else {
      setLeads([]);
      setLeadTotalCount(null);
      setLeadMatchedCount(null);
    }
  }

  const isHexColor = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);
  const pickTagTextColor = (hex: string) => {
    if (!isHexColor(hex)) return "text-white";
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 160 ? "text-zinc-900" : "text-white";
  };

  async function load() {
    setLoading(true);
    setError(null);
    setStatus(null);

    const [meRes, settingsRes] = await Promise.all([
      fetch("/api/customer/me", { cache: "no-store" }),
      fetch("/api/portal/lead-scraping/settings", { cache: "no-store" }),
    ]);

    const meBody = (await meRes.json().catch(() => ({}))) as MeResponse;
    setLeadOutboundEntitled(Boolean(meBody.entitlements && (meBody.entitlements as any).leadOutbound));

    const settingsBody = (await settingsRes.json().catch(() => ({}))) as SettingsResponse;

    if (!settingsRes.ok) {
      setLoading(false);
      setError(getApiError(settingsBody) ?? "Failed to load lead scraping settings");
      return;
    }

    setSettings(settingsBody.settings ?? null);
    setCredits(typeof settingsBody.credits === "number" ? settingsBody.credits : null);
    setPlacesConfigured(Boolean(settingsBody.placesConfigured));

    await loadLeads(leadQueryDebounced);

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (loading) return;
    void loadLeads(leadQueryDebounced);
  }, [leadQueryDebounced]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setStatus(null);

    const res = await fetch("/api/portal/lead-scraping/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings }),
    });

    const body = (await res.json().catch(() => ({}))) as SettingsResponse;
    setSaving(false);

    if (!res.ok) {
      setError(getApiError(body) ?? "Failed to save settings");
      return;
    }

    setSettings(body.settings ?? settings);
    setCredits(typeof body.credits === "number" ? body.credits : credits);
    setStatus("Saved");
    window.setTimeout(() => setStatus(null), 1500);
  }

  async function runB2bNow() {
    if (!settings) return;
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

    setStatus(
      created > 0
        ? `Added ${created} lead${created === 1 ? "" : "s"} • Charged ${charged} credit${charged === 1 ? "" : "s"}${refunded ? ` • Refunded ${refunded}` : ""}`
        : `No new leads matched (refunded ${refunded} credits)`,
    );

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

  function addOutboundResource() {
    if (!settings) return;
    const label = outboundNewResourceLabel.trim().slice(0, 120) || "Resource";
    const url = outboundNewResourceUrl.trim().slice(0, 500);
    if (!url) return;

    setSettings({
      ...settings,
      outbound: {
        ...settings.outbound,
        resources: [{ label, url }, ...settings.outbound.resources].slice(0, 30),
      },
    });
    setOutboundNewResourceLabel("");
    setOutboundNewResourceUrl("");
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
    setComposeSubject(`Quick question — ${activeLead.businessName}`.slice(0, 120));
    setComposeMessage(
      [
        `Hi ${activeLead.businessName},`,
        "",
        "Quick question — are you taking on new work right now?",
        "",
        "—",
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
      setError("Choose Email and/or Text.");
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
    setLeadTagColorDraft(isHexColor(activeLead.tagColor || "") ? (activeLead.tagColor as string) : "#111827");
  }, [activeLead?.id]);

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

  function renderOutboundEditor() {
    if (!settings) return null;

    if (!leadOutboundEntitled) {
      return (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-brand-ink">Auto-outbound (add-on)</div>
          <div className="mt-2 text-sm text-zinc-600">
            This feature is gated separately from Lead Scraping. Contact support to enable it on your account.
          </div>
        </div>
      );
    }

    return (
      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-base font-semibold text-brand-ink">Auto-outbound</div>
            <div className="mt-1 text-sm text-zinc-600">
              Templates support {"{businessName}"}, {"{phone}"}, {"{website}"}, {"{address}"}, {"{niche}"}.
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <input
              type="checkbox"
              checked={settings.outbound.enabled}
              onChange={(e) =>
                setSettings((prev) =>
                  prev ? { ...prev, outbound: { ...prev.outbound, enabled: e.target.checked } } : prev,
                )
              }
              className="h-4 w-4 rounded border-zinc-300"
            />
            Enabled
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">Email</div>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={settings.outbound.email.enabled}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              email: { ...prev.outbound.email, enabled: e.target.checked },
                            },
                          }
                        : prev,
                    )
                  }
                  disabled={!settings.outbound.enabled}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Enabled
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <label className="block">
                <div className="text-xs font-semibold text-zinc-600">Trigger</div>
                <select
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.outbound.email.trigger}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              email: { ...prev.outbound.email, trigger: e.target.value as any },
                            },
                          }
                        : prev,
                    )
                  }
                  disabled={!settings.outbound.enabled || !settings.outbound.email.enabled}
                >
                  <option value="MANUAL">Manual only</option>
                  <option value="ON_SCRAPE">Send on scrape</option>
                  <option value="ON_APPROVE">Send on approve</option>
                </select>
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-600">Subject</div>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.outbound.email.subject}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              email: { ...prev.outbound.email, subject: e.target.value },
                            },
                          }
                        : prev,
                    )
                  }
                  disabled={!settings.outbound.enabled || !settings.outbound.email.enabled}
                  autoComplete="off"
                />
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-600">Message (plain text)</div>
                <textarea
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  rows={5}
                  value={settings.outbound.email.text}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              email: { ...prev.outbound.email, text: e.target.value },
                            },
                          }
                        : prev,
                    )
                  }
                  disabled={!settings.outbound.enabled || !settings.outbound.email.enabled}
                />
              </label>

              <div className="text-xs text-zinc-500">
                Email only sends to leads that have an email address. A copy is sent to your profile email.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">Text message</div>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={settings.outbound.sms.enabled}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              sms: { ...prev.outbound.sms, enabled: e.target.checked },
                            },
                          }
                        : prev,
                    )
                  }
                  disabled={!settings.outbound.enabled}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Enabled
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <label className="block">
                <div className="text-xs font-semibold text-zinc-600">Trigger</div>
                <select
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.outbound.sms.trigger}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              sms: { ...prev.outbound.sms, trigger: e.target.value as any },
                            },
                          }
                        : prev,
                    )
                  }
                  disabled={!settings.outbound.enabled || !settings.outbound.sms.enabled}
                >
                  <option value="MANUAL">Manual only</option>
                  <option value="ON_SCRAPE">Send on scrape</option>
                  <option value="ON_APPROVE">Send on approve</option>
                </select>
              </label>

              <label className="block">
                <div className="text-xs font-semibold text-zinc-600">Message</div>
                <textarea
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  rows={5}
                  value={settings.outbound.sms.text}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            outbound: {
                              ...prev.outbound,
                              sms: { ...prev.outbound.sms, text: e.target.value },
                            },
                          }
                        : prev,
                    )
                  }
                  disabled={!settings.outbound.enabled || !settings.outbound.sms.enabled}
                />
              </label>

              <div className="text-xs text-zinc-500">Texts only send when the lead has a phone number.</div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="text-sm font-semibold text-zinc-800">Resources / attachments</div>
          <div className="mt-1 text-xs text-zinc-500">Uploaded files become links in your outbound message.</div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={outboundNewResourceLabel}
              onChange={(e) => setOutboundNewResourceLabel(e.target.value)}
              placeholder="Label"
            />
            <input
              className="flex-[2] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={outboundNewResourceUrl}
              onChange={(e) => setOutboundNewResourceUrl(e.target.value)}
              placeholder="https://… or /uploads/…"
            />
            <button
              type="button"
              onClick={addOutboundResource}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Add
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadOutboundFile(f);
                e.currentTarget.value = "";
              }}
              disabled={outboundUploadBusy}
              className="text-sm"
            />
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
                    className="min-w-0 flex-1 truncate text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline"
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
      </div>
    );
  }

  if (loading) {
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
            Pull business listings by niche + location. Optionally auto-send a plain-text email and/or text message.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
            <div className="text-xs text-zinc-500">Credits</div>
            <div className="mt-0.5 font-semibold text-brand-ink">{credits ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("b2b")}
          className={
            tab === "b2b"
              ? "rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white"
              : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          }
        >
          B2B (Business listings)
        </button>
        <button
          type="button"
          onClick={() => setTab("b2c")}
          className={
            tab === "b2c"
              ? "rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white"
              : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          }
        >
          B2C (Consumer)
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {status ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{status}</div>
      ) : null}

      {tab === "b2b" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-brand-ink">B2B pulls</div>
                <div className="mt-1 text-sm text-zinc-600">Search businesses by niche/keywords + location.</div>
              </div>
              <div className="text-right text-xs text-zinc-500">
                Est. max cost per run: <span className="font-semibold text-zinc-900">{estimatedRunCost}</span> credits
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
                <div className="mt-1 text-xs text-zinc-500">
                  Recommended: 60 or less per scrape.
                </div>
              </label>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-medium text-zinc-800">Filters</div>
                <label className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-700">Require email</span>
                  <input
                    type="checkbox"
                    checked={settings.b2b.requireEmail}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, b2b: { ...prev.b2b, requireEmail: e.target.checked } } : prev,
                      )
                    }
                  />
                </label>
                <label className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-700">Require phone</span>
                  <input
                    type="checkbox"
                    checked={settings.b2b.requirePhone}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? { ...prev, b2b: { ...prev.b2b, requirePhone: e.target.checked } }
                          : prev,
                      )
                    }
                  />
                </label>
                <label className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-700">Require website</span>
                  <input
                    type="checkbox"
                    checked={settings.b2b.requireWebsite}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? { ...prev, b2b: { ...prev.b2b, requireWebsite: e.target.checked } }
                          : prev,
                      )
                    }
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block">
                <div className="text-sm font-medium text-zinc-800">Exclude business names (one per line)</div>
                <textarea
                  className="mt-2 min-h-[110px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.b2b.excludeNameContains.join("\n")}
                  onChange={(e) =>
                    setSettings((prev) => {
                      if (!prev) return prev;
                      const next = e.target.value
                        .split("\n")
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .slice(0, 200);
                      return { ...prev, b2b: { ...prev.b2b, excludeNameContains: next } };
                    })
                  }
                  placeholder="e.g. walmart\nverizon"
                />
              </label>

              <label className="block">
                <div className="text-sm font-medium text-zinc-800">Exclude domains (one per line)</div>
                <textarea
                  className="mt-2 min-h-[110px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.b2b.excludeDomains.join("\n")}
                  onChange={(e) =>
                    setSettings((prev) => {
                      if (!prev) return prev;
                      const next = e.target.value
                        .split("\n")
                        .map((x) => x.trim().toLowerCase())
                        .filter(Boolean)
                        .slice(0, 200);
                      return { ...prev, b2b: { ...prev.b2b, excludeDomains: next } };
                    })
                  }
                  placeholder="e.g. yelp.com\nfacebook.com"
                />
              </label>

              <label className="block">
                <div className="text-sm font-medium text-zinc-800">Exclude phones (one per line)</div>
                <textarea
                  className="mt-2 min-h-[110px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={settings.b2b.excludePhones.join("\n")}
                  onChange={(e) =>
                    setSettings((prev) => {
                      if (!prev) return prev;
                      const next = e.target.value
                        .split("\n")
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .slice(0, 200);
                      return { ...prev, b2b: { ...prev.b2b, excludePhones: next } };
                    })
                  }
                  placeholder="e.g. +15551234567"
                />
              </label>
            </div>

            <div className="mt-6 rounded-3xl border border-zinc-200 bg-zinc-50 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Scheduling</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    Runs via a secure cron endpoint (server-side). You can still run manually any time.
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                  <span className="text-zinc-800">Enabled</span>
                  <input
                    type="checkbox"
                    checked={settings.b2b.scheduleEnabled}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? { ...prev, b2b: { ...prev.b2b, scheduleEnabled: e.target.checked } }
                          : prev,
                      )
                    }
                  />
                </label>

                <label className="block sm:col-span-2">
                  <div className="text-sm font-medium text-zinc-800">Frequency (days)</div>
                  <input
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    type="number"
                    min={1}
                    max={60}
                    value={settings.b2b.frequencyDays}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              b2b: {
                                ...prev.b2b,
                                frequencyDays: clampInt(Number(e.target.value), 1, 60),
                              },
                            }
                          : prev,
                      )
                    }
                  />
                  <div className="mt-1 text-xs text-zinc-500">
                    Last run: {settings.b2b.lastRunAtIso ? new Date(settings.b2b.lastRunAtIso).toLocaleString() : "Never"}
                  </div>
                </label>
              </div>
            </div>

            {renderOutboundEditor()}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>

              <button
                type="button"
                onClick={runB2bNow}
                disabled={running || !placesConfigured}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
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

          <div className="flex h-full flex-col rounded-3xl border border-zinc-200 bg-white p-6">
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

            <div className="mt-3 max-h-[70vh] space-y-3 overflow-y-auto pr-2 lg:max-h-none lg:min-h-0 lg:flex-1">
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
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="text-base font-semibold text-brand-ink">B2C (Consumer leads)</div>
          <p className="mt-2 max-w-3xl text-sm text-zinc-600">
            Consumer lead pulling depends on the data source (data broker, CSV import, partner API, etc.).
            Tell us what list you want and we’ll connect the right source.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <div className="text-sm font-medium text-zinc-800">Notes / requirements</div>
              <textarea
                className="mt-2 min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                value={settings.b2c.notes}
                onChange={(e) =>
                  setSettings((prev) => (prev ? { ...prev, b2c: { ...prev.b2c, notes: e.target.value } } : prev))
                }
                placeholder="Describe what type of consumer list you want (geo, age, income, intent, etc.)"
              />
            </label>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-2">
              B2C runs are disabled until a consumer data source is connected.
            </div>

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
              <span className="text-zinc-800">Scheduling (disabled)</span>
              <input type="checkbox" checked={false} disabled />
            </label>

            <label className="block">
              <div className="text-sm font-medium text-zinc-800">Frequency (days)</div>
              <input
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                type="number"
                min={1}
                max={60}
                value={settings.b2c.frequencyDays}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev
                      ? { ...prev, b2c: { ...prev.b2c, frequencyDays: clampInt(Number(e.target.value), 1, 60) } }
                      : prev,
                  )
                }
              />
              <div className="mt-1 text-xs text-zinc-500">
                Last run: {settings.b2c.lastRunAtIso ? new Date(settings.b2c.lastRunAtIso).toLocaleString() : "Never"}
              </div>
            </label>
          </div>

          {renderOutboundEditor()}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {leadOpen && activeLead ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:items-center">
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
              className="absolute -left-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-40 sm:flex"
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

            <div className="relative max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl sm:max-h-[calc(100vh-3rem)]">
              <button
                type="button"
                onClick={closeLead}
                className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                aria-label="Close"
              >
                ✕
              </button>

              <div className="pr-10">
                <div className="text-lg font-semibold text-brand-ink">{activeLead.businessName}</div>
                <div className="mt-1 text-xs text-zinc-500">Pulled: {safeFormatDateTime(activeLead.createdAtIso)}</div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-600">Phone</div>
                  <div className="mt-1 text-sm text-zinc-900">{activeLead.phone ?? "—"}</div>
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
                  <div className="mt-1 break-words text-sm text-zinc-900">
                    {activeLead.website ? (
                      <a
                        href={activeLead.website}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[color:var(--color-brand-blue)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {activeLead.website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-xs font-semibold text-zinc-600">Tag</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-6 sm:items-end">
                  <label className="block sm:col-span-4">
                    <div className="text-xs font-medium text-zinc-700">Category</div>
                    <input
                      value={leadTagDraft}
                      onChange={(e) => setLeadTagDraft(e.target.value)}
                      placeholder="e.g. New, Outreach sent, Follow up"
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-300"
                      autoComplete="off"
                    />
                  </label>

                  <label className="block sm:col-span-1">
                    <div className="text-xs font-medium text-zinc-700">Color</div>
                    <input
                      type="color"
                      value={leadTagColorDraft}
                      onChange={(e) => setLeadTagColorDraft(e.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-white px-2"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => patchLead(activeLead.id, { tag: leadTagDraft.trim() || null, tagColor: leadTagDraft.trim() ? leadTagColorDraft : null })}
                    disabled={leadMutating}
                    className="sm:col-span-1 shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
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
                    className="inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
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
                    if (window.confirm("Delete this lead forever? This cannot be undone.")) void deleteLeadForever(activeLead.id);
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
                  <div className="text-sm font-semibold text-zinc-900">Compose</div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <div className="text-xs font-semibold text-zinc-600">Lead email</div>
                      <input
                        value={activeLead.email ?? ""}
                        disabled
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                        placeholder="—"
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
                      <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={composeSendEmail}
                          onChange={(e) => setComposeSendEmail(e.target.checked)}
                          disabled={!activeLead.email}
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        Email
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={composeSendSms}
                          onChange={(e) => setComposeSendSms(e.target.checked)}
                          disabled={!activeLead.phone}
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        Text
                      </label>
                      {!activeLead.phone ? (
                        <span className="text-xs text-zinc-500">No phone on this lead</span>
                      ) : null}
                      {!activeLead.email ? (
                        <span className="text-xs text-zinc-500">No email on this lead</span>
                      ) : null}
                    </div>

                    <label className="block sm:col-span-2">
                      <div className="text-xs font-semibold text-zinc-600">Subject (email)</div>
                      <input
                        value={composeSubject}
                        onChange={(e) => setComposeSubject(e.target.value)}
                        disabled={!composeSendEmail}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-300"
                        autoComplete="off"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <div className="text-xs font-semibold text-zinc-600">Message</div>
                      <textarea
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
                          ? "inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white opacity-70"
                          : "inline-flex items-center justify-center rounded-2xl bg-[color:var(--color-brand-blue)] px-5 py-3 text-sm font-semibold text-white hover:opacity-95"
                      }
                    >
                      {composeBusy ? "Sending…" : "Send"}
                    </button>

                    <button
                      type="button"
                      onClick={() => setComposeOpen(false)}
                      className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                    >
                      Close
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
