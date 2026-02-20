"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

function safeJson(obj: any) {
  try {
    return JSON.stringify(obj ?? null, null, 2);
  } catch {
    return "<unserializable>";
  }
}

export function FormResponsesClient({ basePath, formId }: { basePath: string; formId: string }) {
  const backHref = useMemo(() => `${basePath}/app/services/funnel-builder`, [basePath]);

  const [form, setForm] = useState<CreditForm | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadForm = useCallback(async () => {
    const res = await fetch(`/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load form");
    setForm(json.form as CreditForm);
  }, [formId]);

  const loadSubmissions = useCallback(
    async (opts?: { cursor?: string | null; reset?: boolean }) => {
      const limit = 50;
      const url = new URL(`/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}/submissions`, window.location.origin);
      url.searchParams.set("limit", String(limit));
      if (opts?.cursor) url.searchParams.set("cursor", opts.cursor);

      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load submissions");

      const page = Array.isArray(json.submissions) ? (json.submissions as Submission[]) : [];
      setSubmissions((prev) => (opts?.reset ? page : [...prev, ...page]));
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
        await loadSubmissions({ reset: true });
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

  const loadMore = async () => {
    if (!nextCursor) return;
    setBusy(true);
    setError(null);
    try {
      await loadSubmissions({ cursor: nextCursor });
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to load more");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      await loadForm();
      await loadSubmissions({ reset: true });
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Refresh failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <Link href={backHref} className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline">
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
            className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Edit form
          </Link>
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className={classNames(
              "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
              busy ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
            )}
          >
            {busy ? "Refreshing…" : "Refresh"}
          </button>
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
                    <div className="text-xs text-zinc-600">{s.ip ? `IP: ${s.ip}` : ""}</div>
                  </div>
                </summary>

                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
                  <pre className="overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-900">
                    {safeJson(s.dataJson)}
                  </pre>
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">User agent</div>
                    <div className="mt-2 break-words text-xs text-zinc-700">{s.userAgent || "(none)"}</div>
                  </div>
                </div>
              </details>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 p-4">
          <div className="text-xs text-zinc-600">{nextCursor ? "More available" : "End"}</div>
          <button
            type="button"
            disabled={busy || !nextCursor}
            onClick={loadMore}
            className={classNames(
              "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
              busy || !nextCursor ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
            )}
          >
            {busy ? "Loading…" : "Load more"}
          </button>
        </div>
      </div>
    </div>
  );
}
