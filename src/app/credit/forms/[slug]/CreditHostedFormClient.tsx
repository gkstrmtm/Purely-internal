"use client";

import { useMemo, useState } from "react";

export type Field = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea";
  required?: boolean;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function CreditHostedFormClient({
  slug,
  formName,
  status,
  fields,
}: {
  slug: string;
  formName: string;
  status: string;
  fields: Field[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const actionUrl = useMemo(
    () => `/api/public/credit/forms/${encodeURIComponent(slug)}/submit`,
    [slug],
  );

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-8">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credit Form</div>
      <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">{formName}</h1>
      <p className="mt-2 text-sm text-zinc-600">Slug: /credit/forms/{slug}</p>

      <div className="mt-6 inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
        Status: {status}
      </div>

      <form
        className="mt-8 space-y-4"
        action={actionUrl}
        method="post"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setSuccess(false);

          const el = e.currentTarget;
          const formData = new FormData(el);
          const data: Record<string, any> = {};
          for (const [k, v] of formData.entries()) data[k] = v;

          fetch(actionUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ data }),
          })
            .then(async (r) => {
              const json = (await r.json().catch(() => null)) as any;
              if (!r.ok || !json || json.ok !== true) throw new Error(json?.error || "Submission failed");
              return json;
            })
            .then(() => {
              el.reset();
              setSuccess(true);
            })
            .catch((err) => {
              setError(err?.message ? String(err.message) : "Submission failed");
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        {fields.map((f) => (
          <label key={f.name} className="block">
            <div className="mb-1 text-sm font-semibold text-zinc-900">
              {f.label}
              {f.required ? <span className="ml-1 text-red-600">*</span> : null}
            </div>
            {f.type === "textarea" ? (
              <textarea
                name={f.name}
                required={!!f.required}
                disabled={busy}
                className="min-h-28 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            ) : (
              <input
                name={f.name}
                type={f.type}
                required={!!f.required}
                disabled={busy}
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            )}
          </label>
        ))}

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        {success ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            Submitted. Thank you!
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className={classNames(
            "inline-flex w-full items-center justify-center rounded-2xl px-4 py-2 text-sm font-bold text-white",
            busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
          )}
        >
          {busy ? "Submitting…" : "Submit"}
        </button>
      </form>
    </div>
  );
}
