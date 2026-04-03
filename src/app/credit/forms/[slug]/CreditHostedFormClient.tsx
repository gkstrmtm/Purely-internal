"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { SignaturePad } from "@/components/SignaturePad";
import type { CreditFormContent, CreditFormField as Field, CreditFormStyle, CreditFormSuccessContent } from "@/lib/creditFormSchema";
import { googleFontImportCss } from "@/lib/fontPresets";

export type { CreditFormContent, Field, CreditFormStyle, CreditFormSuccessContent };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function isTextareaField(t: Field["type"]) {
  return t === "textarea" || t === "paragraph" || t === "long_answer";
}

function normalizeInputType(t: Field["type"]): "text" | "email" | "tel" {
  if (t === "email") return "email";
  if (t === "tel" || t === "phone") return "tel";
  return "text";
}

function SignatureField({
  name,
  busy,
  radiusPx,
  inputBg,
  inputBorder,
  textColor,
  resetNonce,
}: {
  name: string;
  busy: boolean;
  radiusPx: number;
  inputBg: string;
  inputBorder: string;
  textColor: string;
  resetNonce: number;
}) {
  const [value, setValue] = useState("");
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);

  const commitValue = (nextValue: string) => {
    if (hiddenInputRef.current) hiddenInputRef.current.value = nextValue;
    setValue(nextValue);
  };

  useEffect(() => {
    commitValue("");
  }, [resetNonce]);

  return (
    <div>
      <SignaturePad
        value={value}
        onChange={commitValue}
        disabled={busy}
        radiusPx={radiusPx}
        borderColor={inputBorder}
        backgroundColor={inputBg}
        textColor={textColor}
      />
      <input ref={hiddenInputRef} type="hidden" name={name} value={value} readOnly />
    </div>
  );
}

export function CreditHostedFormClient({
  slug,
  formName,
  fields,
  embedded,
  style,
  successContent,
  content,
  submitBasePath,
}: {
  slug: string;
  formName: string;
  fields: Field[];
  embedded?: boolean;
  style?: CreditFormStyle;
  successContent?: CreditFormSuccessContent;
  content?: CreditFormContent;
  submitBasePath?: "/credit" | "/portal";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);

  const actionUrl = useMemo(() => {
    const base = submitBasePath === "/portal" ? "/portal" : "/credit";
    return `/api/public${base}/forms/${encodeURIComponent(slug)}/submit`;
  }, [slug, submitBasePath]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const previous = root.getAttribute("data-pa-hide-floating-tools");
    root.setAttribute("data-pa-hide-floating-tools", "1");
    return () => {
      if (previous === null) root.removeAttribute("data-pa-hide-floating-tools");
      else root.setAttribute("data-pa-hide-floating-tools", previous);
    };
  }, []);

  const radiusPx = typeof style?.radiusPx === "number" && Number.isFinite(style.radiusPx) ? style.radiusPx : 16;
  const cardBg = style?.cardBg || "#ffffff";
  const textColor = style?.textColor || "#18181b";
  const inputBg = style?.inputBg || "#ffffff";
  const inputBorder = style?.inputBorder || "#e4e4e7";
  const buttonBg = style?.buttonBg || "var(--color-brand-blue)";
  const buttonText = style?.buttonText || "#ffffff";
  const fontFamily = style?.fontFamily || undefined;
  const googleCss = googleFontImportCss(style?.fontGoogleFamily);
  const submitLabel = style?.submitLabel?.trim() || "Submit";
  const submitRadiusPx = typeof style?.submitRadiusPx === "number" && Number.isFinite(style.submitRadiusPx) ? style.submitRadiusPx : radiusPx;
  const successSurfaceColor = successContent?.surfaceColor || "#ecfdf5";
  const successBorderColor = successContent?.borderColor || "#a7f3d0";
  const successAccentColor = successContent?.accentColor || "#047857";
  const successTextColor = successContent?.textColor || textColor;
  const successTitle = successContent?.title?.trim() || "Submitted. Thank you!";
  const successMessage = successContent?.message?.trim() || "We received your submission and will review it shortly.";
  const successButtonLabel = successContent?.buttonLabel?.trim() || "Submit another response";
  const successButtonAction = successContent?.buttonAction === "redirect" ? "redirect" : "reset";
  const successButtonUrl = successContent?.buttonUrl?.trim() || "";
  const displayTitle = content?.displayTitle?.trim() || formName;
  const description = content?.description?.trim() || "";

  return (
    <>
      {googleCss ? <style>{googleCss}</style> : null}
      <div
        className={classNames(
          embedded ? "border-0 p-4 sm:p-6" : "border border-zinc-200 p-8",
        )}
        style={{
          backgroundColor: cardBg,
          borderRadius: embedded ? 0 : Math.min(40, radiusPx + 8),
          color: textColor,
          fontFamily,
        }}
      >
      {embedded ? null : (
        <>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl" style={{ color: textColor }}>
            {displayTitle}
          </h1>
          {description ? <div className="mt-3 whitespace-pre-wrap text-sm leading-6" style={{ color: textColor }}>{description}</div> : null}
        </>
      )}

      {success ? (
        <div className="mt-8 rounded-3xl border p-6 sm:p-8" style={{ borderColor: successBorderColor, backgroundColor: successSurfaceColor }}>
          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: successAccentColor }}>Submission received</div>
          <h2 className="mt-2 text-2xl font-bold" style={{ color: successTextColor }}>
            {successTitle}
          </h2>
          <div className="mt-3 whitespace-pre-wrap text-sm leading-6" style={{ color: successTextColor }}>
            {successMessage}
          </div>
          <button
            type="button"
            onClick={() => {
              if (successButtonAction === "redirect" && successButtonUrl) {
                window.location.assign(successButtonUrl);
                return;
              }
              setSuccess(false);
              setError(null);
            }}
            className="mt-5 inline-flex items-center justify-center px-4 py-2 text-sm font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:opacity-95"
            style={{ borderRadius: submitRadiusPx, backgroundColor: buttonBg, color: buttonText }}
          >
            {successButtonLabel}
          </button>
        </div>
      ) : (
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

          for (const f of fields) {
            if (f.type !== "checklist" || !f.required) continue;
            const selected = formData.getAll(f.name);
            if (!selected || selected.length === 0) {
              setError(`Please select at least one option for “${f.label}”.`);
              setBusy(false);
              return;
            }
          }

          for (const f of fields) {
            if (f.type !== "radio" || !f.required) continue;
            const selected = formData.get(f.name);
            if (typeof selected !== "string" || !selected.trim()) {
              setError(`Please select an option for “${f.label}”.`);
              setBusy(false);
              return;
            }
          }

          for (const f of fields) {
            if (f.type !== "signature" || !f.required) continue;
            const selected = formData.get(f.name);
            if (typeof selected !== "string" || !selected.trim()) {
              setError(`Please add your signature for “${f.label}”.`);
              setBusy(false);
              return;
            }
          }

          for (const [k, v] of formData.entries()) {
            if (Object.prototype.hasOwnProperty.call(data, k)) {
              const existing = data[k];
              data[k] = Array.isArray(existing) ? [...existing, v] : [existing, v];
            } else {
              data[k] = v;
            }
          }

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
              setResetNonce((current) => current + 1);
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

            {f.type === "checklist" ? (
              <div className="space-y-2">
                {(f.options || []).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm" style={{ color: textColor }}>
                    <input
                      type="checkbox"
                      name={f.name}
                      value={opt}
                      disabled={busy}
                      className="h-4 w-4 rounded border-zinc-300"
                      style={{ accentColor: buttonBg }}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
                {(f.options || []).length === 0 ? (
                  <div className="text-sm text-zinc-500">No options configured.</div>
                ) : null}
              </div>
            ) : f.type === "radio" ? (
              <div className="space-y-2">
                {(f.options || []).map((opt, idx) => (
                  <label key={opt} className="flex items-center gap-2 text-sm" style={{ color: textColor }}>
                    <input
                      type="radio"
                      name={f.name}
                      value={opt}
                      required={!!f.required && idx === 0}
                      disabled={busy}
                      className="h-4 w-4 border-zinc-300"
                      style={{ accentColor: buttonBg }}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
                {(f.options || []).length === 0 ? (
                  <div className="text-sm text-zinc-500">No options configured.</div>
                ) : null}
              </div>
            ) : f.type === "signature" ? (
              <SignatureField
                name={f.name}
                busy={busy}
                radiusPx={radiusPx}
                inputBg={inputBg}
                inputBorder={inputBorder}
                textColor={textColor}
                resetNonce={resetNonce}
              />
            ) : isTextareaField(f.type) ? (
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
                type={normalizeInputType(f.type)}
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
        <button
          type="submit"
          disabled={busy}
          className={classNames(
            "inline-flex w-full items-center justify-center px-4 py-2 text-sm font-bold transition-all duration-150 hover:-translate-y-0.5",
            busy ? "opacity-60" : "hover:opacity-95",
          )}
          style={{
            borderRadius: submitRadiusPx,
            backgroundColor: busy ? "#a1a1aa" : buttonBg,
            color: buttonText,
          }}
        >
          {busy ? "Submitting…" : submitLabel}
        </button>
      </form>
      )}
      </div>
    </>
  );
}
