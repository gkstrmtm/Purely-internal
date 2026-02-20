"use client";

import { useMemo, useState } from "react";

export type Field = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea";
  required?: boolean;
};

export type CreditFormStyle = {
  pageBg?: string;
  cardBg?: string;
  textColor?: string;
  inputBg?: string;
  inputBorder?: string;
  buttonBg?: string;
  buttonText?: string;
  radiusPx?: number;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function CreditHostedFormClient({
  slug,
  formName,
  fields,
  embedded,
  style,
}: {
  slug: string;
  formName: string;
  fields: Field[];
  embedded?: boolean;
  style?: CreditFormStyle;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const actionUrl = useMemo(
    () => `/api/public/credit/forms/${encodeURIComponent(slug)}/submit`,
    [slug],
  );

  const radiusPx = typeof style?.radiusPx === "number" && Number.isFinite(style.radiusPx) ? style.radiusPx : 16;
  const cardBg = style?.cardBg || "#ffffff";
  const textColor = style?.textColor || "#18181b";
  const inputBg = style?.inputBg || "#ffffff";
  const inputBorder = style?.inputBorder || "#e4e4e7";
  const buttonBg = style?.buttonBg || "var(--color-brand-blue)";
  const buttonText = style?.buttonText || "#ffffff";

  return (
    <div
      className={classNames(
        embedded ? "border-0 p-4 sm:p-6" : "border border-zinc-200 p-8",
      )}
      style={{
        backgroundColor: cardBg,
        borderRadius: embedded ? 0 : Math.min(40, radiusPx + 8),
        color: textColor,
      }}
    >
      {embedded ? null : (
        <>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl" style={{ color: textColor }}>
            {formName}
          </h1>
        </>
      )}

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
            <div className="mb-1 text-sm font-semibold" style={{ color: textColor }}>
              {f.label}
              {f.required ? <span className="ml-1 text-red-600">*</span> : null}
            </div>
            {f.type === "textarea" ? (
              <textarea
                name={f.name}
                required={!!f.required}
                disabled={busy}
                className="min-h-28 w-full border px-4 py-2 text-sm placeholder:text-zinc-400"
                style={{
                  borderRadius: radiusPx,
                  borderColor: inputBorder,
                  backgroundColor: inputBg,
                  color: textColor,
                }}
              />
            ) : (
              <input
                name={f.name}
                type={f.type}
                required={!!f.required}
                disabled={busy}
                className="w-full border px-4 py-2 text-sm placeholder:text-zinc-400"
                style={{
                  borderRadius: radiusPx,
                  borderColor: inputBorder,
                  backgroundColor: inputBg,
                  color: textColor,
                }}
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
            "inline-flex w-full items-center justify-center px-4 py-2 text-sm font-bold",
            busy ? "opacity-60" : "hover:opacity-95",
          )}
          style={{
            borderRadius: radiusPx,
            backgroundColor: busy ? "#a1a1aa" : buttonBg,
            color: buttonText,
          }}
        >
          {busy ? "Submitting…" : "Submit"}
        </button>
      </form>
    </div>
  );
}
