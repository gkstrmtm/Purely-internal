"use client";

import { useMemo } from "react";

import type { CreditFormContent, CreditFormField, CreditFormSuccessContent } from "@/lib/creditFormSchema";
import type { CreditFormTemplate } from "@/lib/creditFormTemplates";
import type { CreditFormTheme } from "@/lib/creditFormThemes";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function previewTitle(content: CreditFormContent | undefined | null, fallback: string) {
  const t = (content?.displayTitle || "").trim();
  return t || fallback;
}

function previewDescription(content: CreditFormContent | undefined | null) {
  const d = (content?.description || "").trim();
  return d;
}

function pickPreviewFields(fields: CreditFormField[]): CreditFormField[] {
  const list = Array.isArray(fields) ? fields : [];
  const out = list.filter((f) => f && typeof f.label === "string" && f.label.trim());
  if (out.length <= 5) return out;
  return out.slice(0, 5);
}

function mergeSuccess(templateSuccess: CreditFormSuccessContent | undefined, theme: CreditFormTheme): CreditFormSuccessContent {
  return {
    title: templateSuccess?.title || "You're all set",
    message: templateSuccess?.message || "Thanks — we received your info and will follow up shortly.",
    buttonLabel: templateSuccess?.buttonLabel || "Submit another",
    buttonAction: templateSuccess?.buttonAction || "reset",
    ...theme.successColors,
  };
}

export function CreditFormTemplatePreview(props: {
  template: CreditFormTemplate;
  theme: CreditFormTheme;
  className?: string;
}) {
  const { template, theme, className } = props;

  const fields = useMemo(() => pickPreviewFields(template.fields || []), [template.fields]);
  const title = previewTitle(template.content, template.label);
  const desc = previewDescription(template.content);
  const success = mergeSuccess(template.success, theme);

  const style = theme.style;

  return (
    <div className={classNames("rounded-3xl border border-zinc-200 bg-white p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-zinc-900">Preview</div>
          <div className="text-xs text-zinc-600">This is how the hosted form will feel.</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-zinc-600">Theme</div>
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-800">
            <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: style.buttonBg || "#2563eb" }} />
            {props.theme.label}
          </div>
        </div>
      </div>

      <div
        className="mt-3 overflow-hidden rounded-3xl border border-black/10"
        style={{
          backgroundColor: style.pageBg || "#f8fafc",
        }}
      >
        <div className="p-4">
          <div
            className="mx-auto w-full max-w-md rounded-3xl border border-black/10 p-4 shadow-sm"
            style={{
              backgroundColor: style.cardBg || "#ffffff",
              color: style.textColor || "#0f172a",
              borderColor: style.inputBorder || "rgba(0,0,0,0.08)",
              borderRadius: Math.max(12, Math.min(28, style.radiusPx ?? 22)),
              fontFamily: style.fontFamily || undefined,
            }}
          >
            <div className="text-base font-extrabold" style={{ color: style.textColor || "#0f172a" }}>
              {title}
            </div>
            {desc ? <div className="mt-1 text-sm opacity-80">{desc}</div> : null}

            <div className="mt-4 space-y-2">
              {fields.map((f) => (
                <div key={f.name}>
                  <div className="text-xs font-semibold opacity-80">
                    {f.label}
                    {f.required ? <span className="ml-1 opacity-70">*</span> : null}
                  </div>
                  <div
                    className="mt-1 h-9 w-full rounded-2xl border"
                    style={{
                      backgroundColor: style.inputBg || "#ffffff",
                      borderColor: style.inputBorder || "#cbd5e1",
                    }}
                  />
                </div>
              ))}

              <button
                type="button"
                className="mt-2 w-full rounded-2xl px-4 py-2 text-sm font-bold"
                style={{
                  backgroundColor: style.buttonBg || "#2563eb",
                  color: style.buttonText || "#ffffff",
                  borderRadius: Math.max(12, Math.min(26, style.submitRadiusPx ?? 18)),
                }}
              >
                {style.submitLabel || "Submit"}
              </button>

              <div
                className="mt-3 rounded-2xl border p-3"
                style={{
                  backgroundColor: success.surfaceColor || "#ffffff",
                  borderColor: success.borderColor || "#e2e8f0",
                  color: success.textColor || "#0f172a",
                }}
              >
                <div className="text-sm font-extrabold" style={{ color: success.accentColor || success.textColor || "#0f172a" }}>
                  {success.title || "You're all set"}
                </div>
                <div className="mt-0.5 text-xs opacity-80">{success.message || "Thanks — we received your info."}</div>
              </div>

              <div className="mt-2 text-xs text-zinc-500">
                Fields: <span className="font-semibold text-zinc-700">{template.fields.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
