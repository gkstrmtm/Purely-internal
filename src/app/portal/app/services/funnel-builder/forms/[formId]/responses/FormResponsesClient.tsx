"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconEdit, IconExport } from "@/app/portal/PortalIcons";
import { SignatureDisplay } from "@/components/SignatureDisplay";
import {
  describeCreditFormSubmissionValue,
  parseCreditFormFields,
  shortSubmissionId,
  type CreditFormField,
} from "@/lib/creditFormSchema";

type CreditForm = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  schemaJson: any;
};

type Submission = {
  id: string;
  createdAt: string;
  dataJson: any;
};

type SubmissionDetails = {
  id: string;
  createdAt: string;
  dataJson: any;
  ip: string | null;
  userAgent: string | null;
};

type SubmissionDetailsResponse = {
  ok: true;
  form: { id: string; slug: string; name: string };
  submission: SubmissionDetails;
  device: {
    fingerprint: string | null;
    ip: string | null;
    userAgent: string | null;
    otherSubmissionCount: number | null;
    recentOtherSubmissions:
      | Array<{ id: string; createdAt: string; form: { id: string; slug: string; name: string } }>
      | null;
  };
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function firstString(v: any): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && typeof v[0] === "string") return String(v[0]).trim();
  return "";
}

function csvEscape(raw: unknown): string {
  const s = raw == null ? "" : String(raw);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsvFilename(formSlug: string) {
  const safeSlug = String(formSlug || "form").trim().toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${safeSlug || "form"}-responses-${stamp}.csv`;
}

function downloadCsv(filename: string, csvText: string) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderUploadedFiles(raw: unknown) {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const files = list
    .map((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as any) : null))
    .filter((entry) => entry && typeof entry.url === "string" && String(entry.url).trim());

  if (!files.length) return <span className="text-sm text-zinc-400">(blank)</span>;

  return (
    <div className="space-y-1 text-sm">
      {files.slice(0, 30).map((file, idx) => {
        const url = String(file.url || "").trim();
        const fileName = typeof file.fileName === "string" ? file.fileName.trim() : "";
        const label = fileName || `File ${idx + 1}`;
        return (
          <a
            key={`${url}-${idx}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block truncate font-semibold text-(--color-brand-blue) hover:underline"
            title={url}
          >
            {label}
          </a>
        );
      })}
    </div>
  );
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export function FormResponsesClient({ basePath, formId }: { basePath: string; formId: string }) {
  const backHref = useMemo(() => `${basePath}/app/services/funnel-builder`, [basePath]);
  const [form, setForm] = useState<CreditForm | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetailsResponse | null>(null);
  const [selectedBusy, setSelectedBusy] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);

  const questionFields: CreditFormField[] = useMemo(() => {
    return parseCreditFormFields(form?.schemaJson, { defaultIfEmpty: false, maxFields: 200 });
  }, [form?.schemaJson]);

  const fallbackKeys: string[] = useMemo(() => {
    if (questionFields.length) return [];
    const keys = new Set<string>();
    for (const s of submissions) {
      if (!s?.dataJson || typeof s.dataJson !== "object" || Array.isArray(s.dataJson)) continue;
      for (const k of Object.keys(s.dataJson)) {
        if (!k) continue;
        keys.add(k);
      }
    }
    return Array.from(keys).sort().slice(0, 80);
  }, [questionFields.length, submissions]);

  const tableColumns = useMemo(() => {
    if (questionFields.length) {
      return questionFields.map((f) => ({ key: f.name, label: f.label, field: f }));
    }
    return fallbackKeys.map((k) => ({ key: k, label: k, field: null as any }));
  }, [fallbackKeys, questionFields]);

  const loadForm = useCallback(async () => {
    const res = await fetch(`/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load form");
    setForm(json.form as CreditForm);
  }, [formId]);

  const loadSubmissions = useCallback(
    async (opts?: { cursor?: string | null }) => {
      const limit = 50;
      const url = new URL(`/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}/submissions`, window.location.origin);
      url.searchParams.set("limit", String(limit));
      if (opts?.cursor) url.searchParams.set("cursor", opts.cursor);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load submissions");

      const page = Array.isArray(json.submissions) ? (json.submissions as Submission[]) : [];
      setSubmissions(page);
      setNextCursor(typeof json.nextCursor === "string" ? json.nextCursor : null);
    },
    [formId],
  );

  const openSubmission = useCallback(
    async (submissionId: string) => {
      setDrawerOpen(true);
      setSelectedSubmissionId(submissionId);
      setSelectedSubmission(null);
      setSelectedError(null);
      setSelectedBusy(true);

      try {
        const res = await fetch(
          `/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}/submissions/${encodeURIComponent(submissionId)}`,
          { cache: "no-store" },
        );
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load submission");
        setSelectedSubmission(json as SubmissionDetailsResponse);
      } catch (e) {
        setSelectedError((e as any)?.message ? String((e as any).message) : "Failed to load submission");
      } finally {
        setSelectedBusy(false);
      }
    },
    [formId],
  );

  const exportCsv = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const all: Submission[] = [];
      let cursorLocal: string | null = null;

      for (let page = 0; page < 500; page++) {
        const limit = 100;
        const url = new URL(
          `/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}/submissions`,
          window.location.origin,
        );
        url.searchParams.set("limit", String(limit));
        if (cursorLocal) url.searchParams.set("cursor", cursorLocal);

        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to export CSV");

        const pageItems = Array.isArray(json.submissions) ? (json.submissions as Submission[]) : [];
        all.push(...pageItems);

        const next = typeof json.nextCursor === "string" ? json.nextCursor : null;
        if (!next || pageItems.length === 0) break;
        cursorLocal = next;
      }

      const header = [
        "Date",
        "Name",
        "ID",
        "Full submission id",
        ...tableColumns.map((c) => c.label),
      ];

      const rows = all.map((s) => {
        const data = s.dataJson && typeof s.dataJson === "object" && !Array.isArray(s.dataJson) ? (s.dataJson as any) : {};
        const name = firstString(data.fullName) || firstString(data.name) || firstString(data.email) || "";
        const cells: string[] = [];
        cells.push(new Date(s.createdAt).toISOString());
        cells.push(name);
        cells.push(`#${shortSubmissionId(s.id)}`);
        cells.push(s.id);
        for (const col of tableColumns) {
          const raw = data?.[col.key];
          const fieldType = col.field?.type ?? null;
          const display = describeCreditFormSubmissionValue(raw, fieldType);
          cells.push(display);
        }
        return cells;
      });

      const csv = [header.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
      downloadCsv(buildCsvFilename(form?.slug || "form"), csv);
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [exporting, form?.slug, formId, tableColumns]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        await loadForm();
        if (!mounted) return;
        setCursor(null);
        setCursorStack([]);
        await loadSubmissions({ cursor: null });
      } catch (e) {
        if (!mounted) return;
        setError((e as any)?.message ? String((e as any).message) : "Failed to load responses");
      } finally {
        if (mounted) setBusy(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadForm, loadSubmissions]);

  const goTo = async (next: { cursor: string | null; stack: string[] }) => {
    setBusy(true);
    setError(null);
    try {
      setCursor(next.cursor);
      setCursorStack(next.stack);
      await loadSubmissions({ cursor: next.cursor });
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to load page");
    } finally {
      setBusy(false);
    }
  };

  const goNext = async () => {
    if (!nextCursor) return;
    await goTo({ cursor: nextCursor, stack: [...cursorStack, cursor ?? ""] });
  };

  const goBack = async () => {
    if (cursorStack.length === 0) return;
    const stack = cursorStack.slice(0, -1);
    const prev = cursorStack[cursorStack.length - 1];
    await goTo({ cursor: prev === "" ? null : prev, stack });
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <Link href={backHref} className="text-sm font-semibold text-(--color-brand-blue) hover:underline">
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">Form responses</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {form ? (
              <>
                <span className="font-semibold text-zinc-900">{form.name}</span> · /{form.slug}
              </>
            ) : (
              "Loading…"
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || exporting || submissions.length === 0}
            onClick={() => void exportCsv()}
            className={classNames(
              "inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50",
              busy || exporting || submissions.length === 0 ? "opacity-60" : "",
            )}
            aria-label="Export CSV"
            title="Export CSV"
          >
            <IconExport size={16} />
            <span>{exporting ? "Exporting…" : "Export CSV"}</span>
          </button>
          <Link
            href={`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(formId)}/edit`}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            aria-label="Edit form"
            title="Edit form"
          >
            <IconEdit size={16} />
            <span className="sr-only">Edit form</span>
          </Link>
        </div>
      </div>

      {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <div className="rounded-3xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
          <div className="text-sm font-semibold text-brand-ink">Submissions</div>
          <div className="text-xs text-zinc-600">Loaded: {submissions.length}</div>
        </div>

        {submissions.length === 0 ? (
          <div className="p-6 text-sm text-zinc-600">{busy ? "Loading submissions…" : "No submissions yet."}</div>
        ) : (
          <div className="w-full overflow-auto">
            <table className="min-w-full border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-white">
                <tr>
                  <th className="whitespace-nowrap border-b border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Date
                  </th>
                  <th className="whitespace-nowrap border-b border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Name
                  </th>
                  <th className="whitespace-nowrap border-b border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    ID
                  </th>

                  {questionFields.length
                    ? questionFields.map((f) => (
                        <th
                          key={f.name}
                          className="min-w-[220px] border-b border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"
                          title={f.label}
                        >
                          {f.label}
                        </th>
                      ))
                    : fallbackKeys.map((k) => (
                        <th
                          key={k}
                          className="min-w-[220px] border-b border-zinc-200 bg-white px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500"
                          title={k}
                        >
                          {k}
                        </th>
                      ))}
                </tr>
              </thead>

              <tbody>
                {submissions.map((s) => {
                  const data = s.dataJson && typeof s.dataJson === "object" && !Array.isArray(s.dataJson) ? (s.dataJson as any) : {};
                  const name = firstString(data.fullName) || firstString(data.name) || firstString(data.email) || "";
                  return (
                    <tr
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      className={classNames(
                        "cursor-pointer hover:bg-zinc-50",
                        selectedSubmissionId === s.id ? "bg-blue-50/50" : "",
                      )}
                      onClick={() => void openSubmission(s.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void openSubmission(s.id);
                        }
                      }}
                    >
                      <td className="whitespace-nowrap border-b border-zinc-100 px-3 py-2 align-top text-sm font-semibold text-zinc-900">
                        {new Date(s.createdAt).toLocaleString()}
                      </td>
                      <td className="border-b border-zinc-100 px-3 py-2 align-top text-sm text-zinc-900">
                        {name || <span className="text-zinc-400">(blank)</span>}
                      </td>
                      <td className="whitespace-nowrap border-b border-zinc-100 px-3 py-2 align-top text-sm text-zinc-700">
                        <span className="font-mono text-[12px]">#{shortSubmissionId(s.id)}</span>
                      </td>

                      {questionFields.length
                        ? questionFields.map((f) => {
                            const raw = data?.[f.name];
                            if (f.type === "signature") {
                              return (
                                <td key={f.name} className="border-b border-zinc-100 px-3 py-2 align-top">
                                  <SignatureDisplay
                                    value={raw}
                                    emptyLabel="(blank)"
                                    imageClassName="max-h-14"
                                    textClassName="text-sm text-zinc-800"
                                  />
                                </td>
                              );
                            }

                            if (f.type === "file_upload") {
                              const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
                              const files = list
                                .map((entry) => (entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as any) : null))
                                .filter((entry) => entry && typeof entry.url === "string" && String(entry.url).trim());
                              return (
                                <td key={f.name} className="border-b border-zinc-100 px-3 py-2 align-top">
                                  {files.length ? (
                                    <div className="max-w-[360px] space-y-1 text-sm">
                                      {files.slice(0, 20).map((file, idx) => {
                                        const url = String(file.url || "").trim();
                                        const fileName = typeof file.fileName === "string" ? file.fileName.trim() : "";
                                        const label = fileName || `File ${idx + 1}`;
                                        return (
                                          <a
                                            key={`${url}-${idx}`}
                                            href={url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block truncate font-semibold text-(--color-brand-blue) hover:underline"
                                            title={url}
                                          >
                                            {label}
                                          </a>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <span className="text-sm text-zinc-400">(blank)</span>
                                  )}
                                </td>
                              );
                            }

                            const display = describeCreditFormSubmissionValue(raw, f.type);
                            return (
                              <td key={f.name} className="border-b border-zinc-100 px-3 py-2 align-top">
                                {display ? (
                                  <div className="max-w-[360px] whitespace-pre-wrap wrap-break-word text-sm text-zinc-800" title={display}>
                                    {display}
                                  </div>
                                ) : (
                                  <span className="text-sm text-zinc-400">(blank)</span>
                                )}
                              </td>
                            );
                          })
                        : fallbackKeys.map((k) => {
                            const raw = data?.[k];
                            const display = describeCreditFormSubmissionValue(raw, null);
                            return (
                              <td key={k} className="border-b border-zinc-100 px-3 py-2 align-top">
                                {display ? (
                                  <div className="max-w-[360px] whitespace-pre-wrap wrap-break-word text-sm text-zinc-800" title={display}>
                                    {display}
                                  </div>
                                ) : (
                                  <span className="text-sm text-zinc-400">(blank)</span>
                                )}
                              </td>
                            );
                          })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 p-4">
          <div className="text-xs text-zinc-600">
            Page {cursorStack.length + 1} · {nextCursor ? "More available" : "End"}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || cursorStack.length === 0}
              onClick={goBack}
              className={classNames(
                "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50",
                busy || cursorStack.length === 0 ? "opacity-60" : "",
              )}
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy || !nextCursor}
              onClick={goNext}
              className={classNames(
                "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                busy || !nextCursor ? "bg-zinc-400" : "bg-(--color-brand-blue) hover:bg-blue-700",
              )}
            >
              Next
            </button>
          </div>
        </div>

          </div>
        </div>

        {drawerOpen ? (
          <div className="fixed inset-0 z-50 lg:static lg:z-auto">
            <div
              className="absolute inset-0 bg-black/40 lg:hidden"
              onClick={() => {
                setDrawerOpen(false);
              }}
            />
            <aside className="absolute right-0 top-0 h-full w-[92vw] max-w-md overflow-auto bg-white shadow-2xl lg:static lg:h-auto lg:w-[420px] lg:max-w-none lg:rounded-3xl lg:border lg:border-zinc-200 lg:shadow-none">
              <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-4 lg:rounded-t-3xl">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Submission details</div>
                  <div className="mt-1 text-lg font-bold text-brand-ink">
                    {selectedSubmissionId ? `#${shortSubmissionId(selectedSubmissionId)}` : ""}
                  </div>
                  {selectedSubmission?.submission?.createdAt ? (
                    <div className="mt-1 text-sm text-zinc-600">
                      {new Date(selectedSubmission.submission.createdAt).toLocaleString()}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                  aria-label="Close details"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-5 p-4">
                {selectedError ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{selectedError}</div> : null}
                {selectedBusy ? <div className="text-sm text-zinc-600">Loading…</div> : null}

                {!selectedBusy && selectedSubmission ? (
                  <>
                    <div className="space-y-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Fields</div>
                      <div className="space-y-3">
                        {(() => {
                          const data =
                            selectedSubmission.submission.dataJson &&
                            typeof selectedSubmission.submission.dataJson === "object" &&
                            !Array.isArray(selectedSubmission.submission.dataJson)
                              ? (selectedSubmission.submission.dataJson as any)
                              : {};

                          if (questionFields.length) {
                            return questionFields.map((f) => {
                              const raw = data?.[f.name];
                              return (
                                <div key={f.name} className="rounded-2xl border border-zinc-200 bg-white p-3">
                                  <div className="text-xs font-semibold text-zinc-900">{f.label}</div>
                                  <div className="mt-2">
                                    {f.type === "signature" ? (
                                      <SignatureDisplay value={raw} emptyLabel="(blank)" imageClassName="max-h-28" />
                                    ) : f.type === "file_upload" ? (
                                      renderUploadedFiles(raw)
                                    ) : (
                                      (() => {
                                        const display = describeCreditFormSubmissionValue(raw, f.type);
                                        return display ? (
                                          <div className="whitespace-pre-wrap wrap-break-word text-sm text-zinc-800">{display}</div>
                                        ) : (
                                          <span className="text-sm text-zinc-400">(blank)</span>
                                        );
                                      })()
                                    )}
                                  </div>
                                </div>
                              );
                            });
                          }

                          return (fallbackKeys.length ? fallbackKeys : Object.keys(data).sort().slice(0, 80)).map((k) => {
                            const raw = data?.[k];
                            const display = describeCreditFormSubmissionValue(raw, null);
                            return (
                              <div key={k} className="rounded-2xl border border-zinc-200 bg-white p-3">
                                <div className="text-xs font-semibold text-zinc-900">{k}</div>
                                <div className="mt-2">
                                  {display ? (
                                    <div className="whitespace-pre-wrap wrap-break-word text-sm text-zinc-800">{display}</div>
                                  ) : (
                                    <span className="text-sm text-zinc-400">(blank)</span>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Advanced</div>
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">
                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Device fingerprint</div>
                            <div className="mt-1 font-mono text-[12px]">
                              {selectedSubmission.device.fingerprint || "(not available)"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">IP address</div>
                            <div className="mt-1 font-mono text-[12px]">{selectedSubmission.submission.ip || "(not stored)"}</div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">User agent</div>
                            <div className="mt-1 whitespace-pre-wrap wrap-break-word font-mono text-[12px]">
                              {selectedSubmission.submission.userAgent || "(not stored)"}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Other submissions from this device</div>
                            <div className="mt-1 text-sm">
                              {typeof selectedSubmission.device.otherSubmissionCount === "number"
                                ? `${selectedSubmission.device.otherSubmissionCount} total`
                                : "(not available)"}
                            </div>
                            {Array.isArray(selectedSubmission.device.recentOtherSubmissions) && selectedSubmission.device.recentOtherSubmissions.length ? (
                              <div className="mt-2 space-y-1">
                                {selectedSubmission.device.recentOtherSubmissions.slice(0, 15).map((entry) => (
                                  <Link
                                    key={entry.id}
                                    href={`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(entry.form.id)}/responses`}
                                    className="block truncate text-sm font-semibold text-(--color-brand-blue) hover:underline"
                                    title={entry.form.slug}
                                  >
                                    {entry.form.name || entry.form.slug} · {new Date(entry.createdAt).toLocaleString()} · #{shortSubmissionId(entry.id)}
                                  </Link>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <details className="rounded-2xl border border-zinc-200 bg-white p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Raw submission JSON</summary>
                      <pre className="mt-3 max-h-90 overflow-auto rounded-xl bg-zinc-50 p-3 text-[12px] text-zinc-800">
                        {prettyJson(selectedSubmission.submission.dataJson) || "(empty)"}
                      </pre>
                    </details>
                  </>
                ) : null}
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
