"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";

type ContactLite = { id: string; name: string; email: string | null };

type ReportLite = {
  id: string;
  provider: string;
  importedAt: string;
  createdAt: string;
  contactId: string | null;
  contact: { id: string; name: string; email: string | null } | null;
  _count: { items: number };
};

type ReportItemLite = {
  id: string;
  bureau: string | null;
  kind: string | null;
  label: string;
  auditTag: "PENDING" | "NEGATIVE" | "POSITIVE";
  disputeStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReportFull = ReportLite & {
  rawJson: any;
  items: ReportItemLite[];
};

function reportReadinessLabel(summary: { pending: number; negative: number; positive: number }) {
  if (summary.negative >= 3) return "Needs active dispute work";
  if (summary.pending >= 2) return "Needs review and tagging";
  if (summary.negative >= 1) return "Close to ready for follow-up";
  if (summary.positive >= 2) return "Mostly stable";
  return "Just getting started";
}


async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !json) {
    const msg = (json as any)?.error ? String((json as any).error) : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export default function CreditReportsClient() {
  const pathname = usePathname() || "";
  const portalBase = pathname.startsWith("/credit") ? "/credit" : "/portal";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportLite[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [selectedReport, setSelectedReport] = useState<ReportFull | null>(null);

  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  const [provider, setProvider] = useState<string>("IdentityIQ");
  const [itemFilter, setItemFilter] = useState<"ALL" | "PENDING" | "NEGATIVE" | "POSITIVE" | "TRACKED">("ALL");
  const [itemQuery, setItemQuery] = useState("");
  const [rawText, setRawText] = useState<string>("{");
  const showAdvancedImport = useMemo(() => {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
  }, []);

  const loadReports = useCallback(async () => {
    const json = await fetchJson<{ ok: true; reports: ReportLite[] }>("/api/portal/credit/reports", { cache: "no-store" as any });
    setReports(json.reports || []);
  }, []);

  const loadReport = useCallback(async (reportId: string) => {
    if (!reportId) return;
    const json = await fetchJson<{ ok: true; report: ReportFull }>(`/api/portal/credit/reports/${encodeURIComponent(reportId)}`, { cache: "no-store" as any });
    setSelectedReport(json.report);
  }, []);

  const loadContacts = useCallback(async (q: string) => {
    const url = `/api/portal/credit/contacts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`;
    const json = await fetchJson<{ ok: true; contacts: Array<any> }>(url, { cache: "no-store" as any });
    const next: ContactLite[] = (json.contacts || []).map((c: any) => ({
      id: String(c.id),
      name: String(c.name || ""),
      email: c.email ? String(c.email) : null,
    }));
    setContacts(next);
    setSelectedContactId((prev) => prev || next[0]?.id || "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        await Promise.all([loadReports(), loadContacts("")]);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadContacts, loadReports]);

  useEffect(() => {
    if (!selectedReportId) {
      setSelectedReport(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        await loadReport(selectedReportId);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load report");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadReport, selectedReportId]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || null,
    [contacts, selectedContactId],
  );
  const selectedReportSummary = useMemo(() => {
    const items = selectedReport?.items || [];
    const pending = items.filter((item) => item.auditTag === "PENDING").length;
    const negative = items.filter((item) => item.auditTag === "NEGATIVE").length;
    const positive = items.filter((item) => item.auditTag === "POSITIVE").length;
    const tracked = items.filter((item) => String(item.disputeStatus || "").trim().length > 0).length;
    return { pending, negative, positive, tracked };
  }, [selectedReport]);
  const readinessLabel = useMemo(
    () => reportReadinessLabel(selectedReportSummary),
    [selectedReportSummary],
  );
  const filteredItems = useMemo(() => {
    const items = selectedReport?.items || [];
    const query = itemQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesFilter =
        itemFilter === "ALL"
          ? true
          : itemFilter === "TRACKED"
            ? Boolean(String(item.disputeStatus || "").trim())
            : item.auditTag === itemFilter;

      if (!matchesFilter) return false;
      if (!query) return true;

      const haystack = [item.label, item.bureau, item.kind, item.disputeStatus].map((part) => String(part || "").toLowerCase()).join(" ");
      return haystack.includes(query);
    });
  }, [itemFilter, itemQuery, selectedReport]);

  const importReport = async () => {
    setBusy(true);
    setError(null);
    try {
      const rawJson = JSON.parse(rawText);
      const json = await fetchJson<{ ok: true; report: ReportLite }>("/api/portal/credit/reports", {
        method: "POST",
        body: JSON.stringify({
          contactId: selectedContactId || undefined,
          provider: provider.trim() || undefined,
          rawJson,
        }),
      });
      await loadReports();
      setSelectedReportId(json.report.id);
      setRawText("{");
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to import");
    } finally {
      setBusy(false);
    }
  };

  const requestProviderPull = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!selectedContactId) {
        setError("Select a contact first.");
        return;
      }
      const json = await fetchJson<{ ok: true; report: ReportLite }>("/api/portal/credit/reports/pull", {
        method: "POST",
        body: JSON.stringify({
          contactId: selectedContactId,
          provider,
        }),
      });
      await loadReports();
      setSelectedReportId(json.report.id);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Unable to pull report");
    } finally {
      setBusy(false);
    }
  };

  const updateItem = async (itemId: string, patch: { auditTag?: ReportItemLite["auditTag"]; disputeStatus?: string | null }) => {
    if (!selectedReportId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson<{ ok: true }>(
        `/api/portal/credit/reports/${encodeURIComponent(selectedReportId)}/items/${encodeURIComponent(itemId)}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      await loadReport(selectedReportId);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to update item");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Credit reports</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">Pull a report, review the items, then move into disputes.</p>
        </div>
        {selectedReport ? (
          <Link
            href={`${portalBase}/app/services/dispute-letters`}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Open dispute letters
          </Link>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Report intake</div>
            </div>
            <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">{reports.length} saved</div>
          </div>

          <label className="mt-3 block">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contact</div>
            <div className="flex gap-2">
              <input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Search contacts…"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => loadContacts(contactQuery)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
              >
                Search
              </button>
            </div>
            <div className="mt-2">
              <PortalListboxDropdown
                value={selectedContactId}
                onChange={(v) => setSelectedContactId(v)}
                disabled={busy}
                buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                options={([
                  { value: "", label: "No contact" },
                  ...contacts.map(
                    (c): PortalListboxOption<string> => ({
                      value: c.id,
                      label: `${c.name}${c.email ? ` - ${c.email}` : ""}`,
                    }),
                  ),
                ] as PortalListboxOption<string>[])}
              />
            </div>
            {selectedContact ? <div className="mt-1 text-xs text-zinc-500">Selected: {selectedContact.name}</div> : null}
          </label>

          <label className="mt-3 block">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Provider</div>
            <PortalListboxDropdown
              value={provider}
              onChange={(v) => setProvider(v)}
              disabled={busy}
              buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
              options={(
                [
                  { value: "IdentityIQ", label: "IdentityIQ" },
                  { value: "SmartCredit", label: "SmartCredit" },
                  { value: "MyScoreIQ", label: "MyScoreIQ" },
                  { value: "Experian", label: "Experian" },
                  { value: "TransUnion", label: "TransUnion" },
                  { value: "Equifax", label: "Equifax" },
                  { value: "Other", label: "Other" },
                ] as PortalListboxOption<string>[]
              )}
            />
          </label>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={requestProviderPull}
              className="rounded-2xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {busy ? "Working…" : reports.some((report) => report.contactId === selectedContactId) ? "Re-import latest" : "Pull latest report"}
            </button>
          </div>

          {selectedContact ? (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Current focus</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">{selectedContact.name}</div>
              <div className="mt-1 text-xs text-zinc-600">
                {selectedContact.email ? selectedContact.email : "No email on file"}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
              No contact selected.
            </div>
          )}

          {showAdvancedImport ? (
            <details className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-800">Advanced (dev only)</summary>
              <div className="mt-2 text-xs text-zinc-600">
                For local development only. Production uses provider integrations.
              </div>
              <label className="mt-3 block">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Report JSON</div>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className="min-h-45 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                  placeholder="Paste JSON here"
                />
              </label>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy || rawText.trim().length < 2}
                  onClick={importReport}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {busy ? "Working…" : "Import report"}
                </button>
              </div>
            </details>
          ) : null}

          <div className="mt-6 border-t border-zinc-200 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-zinc-900">Saved reports</div>
              <div className="text-xs text-zinc-500">Newest first</div>
            </div>
            {reports.length === 0 ? (
              <div className="mt-2 text-sm text-zinc-600">No reports yet.</div>
            ) : (
              <div className="mt-2 space-y-2">
                {reports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReportId(r.id)}
                    className={
                      "w-full rounded-2xl border px-3 py-3 text-left transition-colors " +
                      (selectedReportId === r.id
                        ? "border-zinc-900 bg-zinc-50"
                        : "border-zinc-200 bg-white hover:bg-zinc-50")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold">{r.provider}</div>
                      <div className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        {r._count.items} items
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">{new Date(r.importedAt).toLocaleString()}</div>
                    {r.contact ? <div className="mt-1 text-xs text-zinc-600">Contact: {r.contact.name}</div> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="space-y-4">
          {!selectedReport ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
              Select a report from the left to open the audit workspace.
            </div>
          ) : (
            <>
              <section className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Selected report</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="text-xl font-semibold text-zinc-900">{selectedReport.provider}</div>
                      <div className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
                        {readinessLabel}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-zinc-600">
                      Imported {new Date(selectedReport.importedAt).toLocaleString()}
                      {selectedReport.contact ? ` • ${selectedReport.contact.name}` : ""}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Tracked items</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">{selectedReportSummary.tracked} in motion</div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Pending</div>
                    <div className="mt-1 text-xl font-bold text-brand-ink">{selectedReportSummary.pending}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Negative</div>
                    <div className="mt-1 text-xl font-bold text-brand-ink">{selectedReportSummary.negative}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Positive</div>
                    <div className="mt-1 text-xl font-bold text-brand-ink">{selectedReportSummary.positive}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Tracked disputes</div>
                    <div className="mt-1 text-xl font-bold text-brand-ink">{selectedReportSummary.tracked}</div>
                  </div>
                </div>

              </section>

              <section className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Items</div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={itemQuery}
                      onChange={(e) => setItemQuery(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm sm:w-56"
                      placeholder="Search items…"
                    />
                    <div className="text-xs text-zinc-500">{filteredItems.length} shown</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {([
                    ["ALL", `All ${selectedReport.items.length}`],
                    ["PENDING", `Pending ${selectedReportSummary.pending}`],
                    ["NEGATIVE", `Negative ${selectedReportSummary.negative}`],
                    ["POSITIVE", `Positive ${selectedReportSummary.positive}`],
                    ["TRACKED", `Tracked ${selectedReportSummary.tracked}`],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setItemFilter(value)}
                      className={
                        itemFilter === value
                          ? "rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white"
                          : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="scrollbar-none mt-3 overflow-x-auto rounded-3xl border border-zinc-200">
                  <div className="min-w-160">
                    <div className="grid grid-cols-[1fr_140px_160px] gap-0 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      <div>Item</div>
                      <div>Audit tag</div>
                      <div>Dispute status</div>
                    </div>

                    {filteredItems.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-zinc-600">No matching items.</div>
                    ) : (
                      <div className="divide-y divide-zinc-200">
                        {filteredItems.map((it) => (
                          <div key={it.id} className="grid grid-cols-[1fr_140px_160px] items-center gap-3 px-3 py-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-zinc-900">{it.label}</div>
                              <div className="mt-0.5 text-xs text-zinc-500">
                                {(it.bureau ? `${it.bureau} • ` : "") + (it.kind ? it.kind : "")}
                              </div>
                            </div>
                            <PortalListboxDropdown
                              value={it.auditTag}
                              onChange={(v) => updateItem(it.id, { auditTag: v })}
                              disabled={busy}
                              buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm hover:bg-zinc-50"
                              options={(
                                [
                                  { value: "PENDING", label: "Pending" },
                                  { value: "NEGATIVE", label: "Negative" },
                                  { value: "POSITIVE", label: "Positive" },
                                ] as PortalListboxOption<ReportItemLite["auditTag"]>[]
                              )}
                            />
                            <input
                              className="w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm"
                              value={it.disputeStatus || ""}
                              disabled={busy}
                              placeholder="e.g., OPEN"
                              onChange={(e) => updateItem(it.id, { disputeStatus: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {showAdvancedImport ? (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-800">Raw JSON (dev)</summary>
                  <pre className="scrollbar-none mt-2 max-h-105 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
                    {JSON.stringify(selectedReport.rawJson, null, 2)}
                  </pre>
                </details>
              ) : null}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
