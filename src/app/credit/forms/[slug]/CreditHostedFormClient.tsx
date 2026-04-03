"use client";

import type { PutBlobResult } from "@vercel/blob";
import { upload as uploadToVercelBlob } from "@vercel/blob/client";
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

function normalizeAllowedContentTypesForAccept(allowed: unknown): string {
  if (!Array.isArray(allowed)) return "";
  const list = allowed
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 60);
  return list.join(",");
}

function isAllowedFileType(file: File, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return true;
  const t = (file.type || "").trim();
  if (!t) return false;
  for (const entry of allowed) {
    const rule = String(entry || "").trim();
    if (!rule) continue;
    if (rule.endsWith("/*")) {
      const prefix = rule.slice(0, -1);
      if (t.startsWith(prefix)) return true;
      continue;
    }
    if (t === rule) return true;
  }
  return false;
}

function SignatureField({
  value,
  onChange,
  busy,
  radiusPx,
  inputBg,
  inputBorder,
  textColor,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  busy: boolean;
  radiusPx: number;
  inputBg: string;
  inputBorder: string;
  textColor: string;
}) {
  return (
    <div>
      <SignaturePad
        value={value}
        onChange={onChange}
        disabled={busy}
        radiusPx={radiusPx}
        borderColor={inputBorder}
        backgroundColor={inputBg}
        textColor={textColor}
      />
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
  hostedKey,
}: {
  slug: string;
  formName: string;
  fields: Field[];
  embedded?: boolean;
  style?: CreditFormStyle;
  successContent?: CreditFormSuccessContent;
  content?: CreditFormContent;
  submitBasePath?: "/credit" | "/portal";
  hostedKey?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string | string[]>>({});
  const [signatureValues, setSignatureValues] = useState<Record<string, string>>({});
  const [fileValues, setFileValues] = useState<Record<string, File[]>>({});
  const fieldValuesRef = useRef<Record<string, string | string[]>>({});
  const signatureValuesRef = useRef<Record<string, string>>({});
  const fileValuesRef = useRef<Record<string, File[]>>({});

  const setFieldValue = (fieldName: string, nextValue: string | string[]) => {
    fieldValuesRef.current = { ...fieldValuesRef.current, [fieldName]: nextValue };
    setFieldValues((current) => {
      const prevValue = current[fieldName];
      if (Array.isArray(prevValue) && Array.isArray(nextValue) && prevValue.length === nextValue.length && prevValue.every((entry, index) => entry === nextValue[index])) {
        return current;
      }
      if (!Array.isArray(prevValue) && !Array.isArray(nextValue) && prevValue === nextValue) {
        return current;
      }
      return { ...current, [fieldName]: nextValue };
    });
  };

  const readFieldValue = (field: Field): string | string[] => {
    if (field.type === "signature") return signatureValuesRef.current[field.name] || "";
    const value = fieldValuesRef.current[field.name];
    if (field.type === "checklist") return Array.isArray(value) ? value : [];
    return typeof value === "string" ? value : "";
  };

  const readFileValue = (field: Field): File[] => {
    const value = fileValuesRef.current[field.name];
    return Array.isArray(value) ? value : [];
  };

  const actionUrl = useMemo(() => {
    const base = submitBasePath === "/portal" ? "/portal" : "/credit";
    return `/api/public${base}/forms/${encodeURIComponent(slug)}/submit`;
  }, [slug, submitBasePath]);

  const blobUploadUrlBase = useMemo(() => {
    const base = submitBasePath === "/portal" ? "/portal" : "/credit";
    const u = `/api/public${base}/forms/${encodeURIComponent(slug)}/blob-upload`;
    const qp = hostedKey ? `?key=${encodeURIComponent(hostedKey)}` : "";
    return `${u}${qp}`;
  }, [hostedKey, slug, submitBasePath]);

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

          // Never rely on the React event object across async boundaries.
          // Capture the form element immediately so we can safely reset it after submit.
          const formEl = e.currentTarget;
          setBusy(true);
          setError(null);
          setSuccess(false);

          const data: Record<string, any> = {};

          for (const f of fields) {
            if (f.type !== "checklist" || !f.required) continue;
            const selected = readFieldValue(f);
            if (!Array.isArray(selected) || selected.length === 0) {
              setError(`Please select at least one option for “${f.label}”.`);
              setBusy(false);
              return;
            }
          }

          for (const f of fields) {
            if (f.type !== "radio" || !f.required) continue;
            const selected = readFieldValue(f);
            if (typeof selected !== "string" || !selected.trim()) {
              setError(`Please select an option for “${f.label}”.`);
              setBusy(false);
              return;
            }
          }

          for (const f of fields) {
            if (f.type !== "signature" || !f.required) continue;
            const selected = signatureValuesRef.current[f.name] || "";
            if (!selected.trim()) {
              setError(`Please add your signature for “${f.label}”.`);
              setBusy(false);
              return;
            }
          }

          for (const f of fields) {
            if (f.type !== "file_upload" || !f.required) continue;
            const selected = readFileValue(f);
            if (!Array.isArray(selected) || selected.length === 0) {
              setError(`Please upload a file for “${f.label}”.`);
              setBusy(false);
              return;
            }
          }

          for (const f of fields) {
            if (f.type === "file_upload") continue;
            const value = readFieldValue(f);
            if (f.type === "checklist") {
              data[f.name] = Array.isArray(value) ? value : [];
              continue;
            }
            data[f.name] = typeof value === "string" ? value : "";
          }

          (async () => {
            for (const f of fields) {
              if (f.type !== "file_upload") continue;

              const maxFiles = typeof (f as any).maxFiles === "number" && Number.isFinite((f as any).maxFiles) ? (f as any).maxFiles : 1;
              const maxSizeMb = typeof (f as any).maxSizeMb === "number" && Number.isFinite((f as any).maxSizeMb) ? (f as any).maxSizeMb : 10;
              const allowedContentTypes = Array.isArray((f as any).allowedContentTypes)
                ? ((f as any).allowedContentTypes as string[]).map((v) => String(v || "").trim()).filter(Boolean)
                : undefined;

              const selected = readFileValue(f);
              const list = Array.isArray(selected) ? selected : [];
              if (list.length > maxFiles) {
                throw new Error(`“${f.label}” allows up to ${maxFiles} file${maxFiles === 1 ? "" : "s"}.`);
              }

              const refs: Array<{ url: string; fileName: string; mimeType: string; fileSize: number }> = [];
              for (const file of list) {
                const fileSize = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : 0;
                if (fileSize > maxSizeMb * 1024 * 1024) {
                  throw new Error(`“${f.label}”: ${file.name || "File"} exceeds ${maxSizeMb} MB.`);
                }
                if (!isAllowedFileType(file, allowedContentTypes)) {
                  throw new Error(`“${f.label}”: ${file.name || "File"} is not an allowed file type.`);
                }

                let blob: PutBlobResult;
                try {
                  const uploadUrl = new URL(blobUploadUrlBase, window.location.origin);
                  uploadUrl.searchParams.set("field", f.name);
                  blob = await uploadToVercelBlob(file.name || "upload.bin", file, {
                    access: "public",
                    handleUploadUrl: uploadUrl.toString(),
                  });
                } catch (err) {
                  const msg = (err as any)?.message ? String((err as any).message) : "Upload failed";
                  throw new Error(msg);
                }

                refs.push({
                  url: blob.url,
                  fileName: file.name || blob.pathname || "upload.bin",
                  mimeType: file.type || blob.contentType || "application/octet-stream",
                  fileSize,
                });
              }

              data[f.name] = refs;
            }

            const res = await fetch(actionUrl, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ data }),
            });
            const json = (await res.json().catch(() => null)) as any;
            if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Submission failed");
            return json;
          })()
            .then(async (r) => {
              return r;
            })
            .then(() => {
              try {
                formEl?.reset();
              } catch {
                // ignore
              }
              fieldValuesRef.current = {};
              setFieldValues({});
              signatureValuesRef.current = {};
              setSignatureValues({});
              fileValuesRef.current = {};
              setFileValues({});
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

            {f.type === "checklist" ? (
              <div className="space-y-2">
                {(f.options || []).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm" style={{ color: textColor }}>
                    <input
                      type="checkbox"
                      name={f.name}
                      value={opt}
                      disabled={busy}
                      onChange={(event) => {
                        const current = readFieldValue(f);
                        const existing = Array.isArray(current) ? current : [];
                        const next = event.target.checked
                          ? Array.from(new Set([...existing, opt]))
                          : existing.filter((value) => value !== opt);
                        setFieldValue(f.name, next);
                      }}
                      checked={Array.isArray(fieldValues[f.name]) ? (fieldValues[f.name] as string[]).includes(opt) : false}
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
                      onChange={(event) => setFieldValue(f.name, event.target.value)}
                      checked={fieldValues[f.name] === opt}
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
                value={signatureValues[f.name] || ""}
                onChange={(nextValue) => {
                  setFieldValue(f.name, nextValue);
                  signatureValuesRef.current = { ...signatureValuesRef.current, [f.name]: nextValue };
                  setSignatureValues((current) => {
                    if ((current[f.name] || "") === nextValue) return current;
                    return { ...current, [f.name]: nextValue };
                  });
                }}
                busy={busy}
                radiusPx={radiusPx}
                inputBg={inputBg}
                inputBorder={inputBorder}
                textColor={textColor}
              />
            ) : f.type === "file_upload" ? (
              <div className="space-y-2">
                <input
                  name={f.name}
                  type="file"
                  disabled={busy}
                  multiple={(typeof (f as any).maxFiles === "number" ? (f as any).maxFiles : 1) > 1}
                  accept={normalizeAllowedContentTypesForAccept((f as any).allowedContentTypes)}
                  onChange={(event) => {
                    const list = event.target.files ? Array.from(event.target.files) : [];
                    fileValuesRef.current = { ...fileValuesRef.current, [f.name]: list };
                    setFileValues((current) => ({ ...current, [f.name]: list }));
                  }}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                  style={{ borderRadius: radiusPx, borderColor: inputBorder, backgroundColor: inputBg, color: textColor }}
                />

                {Array.isArray(fileValues[f.name]) && (fileValues[f.name] as File[]).length ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
                    {(fileValues[f.name] as File[]).map((file) => (
                      <div key={`${file.name}-${file.size}`} className="truncate">
                        {file.name} ({Math.max(1, Math.round((file.size / 1024 / 1024) * 10) / 10)} MB)
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">
                    {(() => {
                      const maxFiles = typeof (f as any).maxFiles === "number" && Number.isFinite((f as any).maxFiles) ? (f as any).maxFiles : 1;
                      const maxSizeMb = typeof (f as any).maxSizeMb === "number" && Number.isFinite((f as any).maxSizeMb) ? (f as any).maxSizeMb : 10;
                      return `Up to ${maxFiles} file${maxFiles === 1 ? "" : "s"}. Max ${maxSizeMb} MB each.`;
                    })()}
                  </div>
                )}
              </div>
            ) : isTextareaField(f.type) ? (
              <textarea
                name={f.name}
                required={!!f.required}
                disabled={busy}
                value={typeof fieldValues[f.name] === "string" ? (fieldValues[f.name] as string) : ""}
                onChange={(event) => setFieldValue(f.name, event.target.value)}
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
                value={typeof fieldValues[f.name] === "string" ? (fieldValues[f.name] as string) : ""}
                onChange={(event) => setFieldValue(f.name, event.target.value)}
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
