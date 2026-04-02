"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconEdit } from "@/app/portal/PortalIcons";
import { SignatureDisplay } from "@/components/SignatureDisplay";
import { buildCreditFormSubmissionRows } from "@/lib/creditFormSchema";

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
  ip: string | null;
  userAgent: string | null;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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

      <div className="mt-6 rounded-3xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
          <div className="text-sm font-semibold text-brand-ink">Submissions</div>
          <div className="text-xs text-zinc-600">Loaded: {submissions.length}</div>
        </div>

        <div className="divide-y divide-zinc-100">
          {submissions.length === 0 ? (
            <div className="p-6 text-sm text-zinc-600">{busy ? "Loading submissions…" : "No submissions yet."}</div>
          ) : (
            submissions.map((s) => (
              <details key={s.id} className="group p-4">
                <summary className="cursor-pointer list-none select-none">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">
                        {new Date(s.createdAt).toLocaleString()}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-600">ID: {s.id}</div>
                    </div>
                  </div>
                </summary>

                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="grid grid-cols-1 gap-3">
                      {buildCreditFormSubmissionRows(form?.schemaJson, s.dataJson).map((row) => {
                        return (
                          <div key={row.key} className="rounded-xl border border-zinc-200 bg-white p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{row.label}</div>
                            <div className="mt-2">
                              <SignatureDisplay
                                value={row.rawValue}
                                emptyLabel={row.displayValue || "No response"}
                                imageClassName="max-h-28"
                                textClassName="text-sm text-zinc-800"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">User agent</div>
                    <div className="mt-2 wrap-break-word text-xs text-zinc-700">{s.userAgent || "(none)"}</div>
                  </div>
                </div>
              </details>
            ))
          )}
        </div>

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
  );
}
