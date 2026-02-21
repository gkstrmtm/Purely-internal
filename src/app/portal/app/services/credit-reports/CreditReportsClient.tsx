"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportLite[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [selectedReport, setSelectedReport] = useState<ReportFull | null>(null);

  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  const [provider, setProvider] = useState<string>("UPLOAD");
  const [rawText, setRawText] = useState<string>("{");

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
    <div className="mx-auto w-full max-w-7xl">
      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <aside className="rounded-3xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold">Import</div>

          <label className="mt-3 block">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contact (optional)</div>
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
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              disabled={busy || contacts.length === 0}
            >
              <option value="">No contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.email ? ` — ${c.email}` : ""}
                </option>
              ))}
            </select>
            {selectedContact ? <div className="mt-1 text-xs text-zinc-500">Selected: {selectedContact.name}</div> : null}
          </label>

          <label className="mt-3 block">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Provider</div>
            <input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              placeholder="UPLOAD"
            />
          </label>

          <label className="mt-3 block">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Report JSON</div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="min-h-[180px] w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
              placeholder="Paste JSON here"
            />
            <div className="mt-1 text-xs text-zinc-500">
              Import currently supports JSON only; we’ll add PDF upload + parsing next.
            </div>
          </label>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || rawText.trim().length < 2}
              onClick={importReport}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {busy ? "Working…" : "Import report"}
            </button>
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-4">
            <div className="text-sm font-semibold">Reports</div>
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
                      "w-full rounded-2xl border px-3 py-2 text-left " +
                      (selectedReportId === r.id ? "border-blue-300 bg-blue-50" : "border-zinc-200 bg-white hover:bg-zinc-50")
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

        <main className="rounded-3xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Audit</div>
              <div className="mt-1 text-xs text-zinc-600">Tag items pending / negative / positive and track dispute status.</div>
            </div>
          </div>

          {!selectedReport ? (
            <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
              Import a report and select it from the left.
            </div>
          ) : (
            <div className="mt-4">
              <div className="text-xs text-zinc-600">
                Provider: <span className="font-semibold text-zinc-900">{selectedReport.provider}</span> • Imported:{" "}
                {new Date(selectedReport.importedAt).toLocaleString()}
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
                <div className="grid grid-cols-[1fr_140px_160px] gap-0 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  <div>Item</div>
                  <div>Audit tag</div>
                  <div>Dispute status</div>
                </div>

                {selectedReport.items.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-zinc-600">No items detected in JSON yet.</div>
                ) : (
                  <div className="divide-y divide-zinc-200">
                    {selectedReport.items.map((it) => (
                      <div key={it.id} className="grid grid-cols-[1fr_140px_160px] items-center gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900">{it.label}</div>
                          <div className="mt-0.5 text-xs text-zinc-500">
                            {(it.bureau ? `${it.bureau} • ` : "") + (it.kind ? it.kind : "")}
                          </div>
                        </div>
                        <select
                          className="w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-sm"
                          value={it.auditTag}
                          disabled={busy}
                          onChange={(e) => updateItem(it.id, { auditTag: e.target.value as any })}
                        >
                          <option value="PENDING">Pending</option>
                          <option value="NEGATIVE">Negative</option>
                          <option value="POSITIVE">Positive</option>
                        </select>
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

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-800">Raw JSON</summary>
                <pre className="mt-2 max-h-[420px] overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
                  {JSON.stringify(selectedReport.rawJson, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
