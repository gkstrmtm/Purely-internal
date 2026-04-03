"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { IconEyeGlyph } from "@/app/portal/PortalIcons";
import { AppConfirmModal, AppModal } from "@/components/AppModal";
import { PortalFontDropdown } from "@/components/PortalFontDropdown";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { normalizeCreditFormContent, normalizeCreditFormSuccessContent, parseCreditFormContent, parseCreditFormSuccessContent, type CreditFormContent, type CreditFormSuccessContent } from "@/lib/creditFormSchema";
import { applyFontPresetToStyle, fontPresetKeyFromStyle, googleFontImportCss } from "@/lib/fontPresets";
import { hostedFormPath } from "@/lib/publicHostedKeys";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

type Form = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  schemaJson: any;
  createdAt: string;
  updatedAt: string;
};

type FieldType =
  | "short_answer"
  | "long_answer"
  | "paragraph"
  | "email"
  | "phone"
  | "name"
  | "signature"
  | "checklist"
  | "radio"
  // legacy
  | "text"
  | "tel"
  | "textarea";

type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
};

type FormStyle = {
  pageBg?: string;
  cardBg?: string;
  textColor?: string;
  inputBg?: string;
  inputBorder?: string;
  buttonBg?: string;
  buttonText?: string;
  radiusPx?: number;
  submitRadiusPx?: number;
  submitLabel?: string;
  fontFamily?: string;
  fontGoogleFamily?: string;
};

type FormSuccessContent = CreditFormSuccessContent;
type FormContent = CreditFormContent;

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function slugifyName(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "")
    .slice(0, 32);
}

function normalizeFields(rawSchema: any): Field[] {
  const fields = rawSchema && typeof rawSchema === "object" && Array.isArray(rawSchema.fields) ? rawSchema.fields : [];
  const out: Field[] = [];
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    const name = typeof f.name === "string" ? f.name.trim() : "";
    const label = typeof f.label === "string" ? f.label.trim() : "";
    const type = f.type as FieldType;
    const required = f.required === true;
    if (!name || !label) continue;

    const isKnown =
      type === "short_answer" ||
      type === "long_answer" ||
      type === "paragraph" ||
      type === "email" ||
      type === "phone" ||
      type === "name" ||
      type === "signature" ||
      type === "checklist" ||
      type === "radio" ||
      type === "text" ||
      type === "tel" ||
      type === "textarea";
    if (!isKnown) continue;

    const optionsRaw = (f as any).options;
    const options = Array.isArray(optionsRaw)
      ? optionsRaw
          .map((o) => (typeof o === "string" ? o.trim() : ""))
          .filter(Boolean)
          .slice(0, 50)
      : undefined;

    out.push({ name, label, type, required, options });
  }
  return out;
}

function makeUniqueFieldKey(desired: string, existing: string[]) {
  const base = slugifyName(desired) || "field";
  const used = new Set(existing.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (!used.has(base)) return base;

  const m = base.match(/^(.*?)-(\d+)$/);
  const stem = m ? m[1] : base;
  const start = m ? Number(m[2]) : 2;
  for (let i = Math.max(2, start); i < 500; i++) {
    const candidate = `${stem}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}`;
}

function fieldTypeLabel(t: FieldType) {
  switch (t) {
    case "short_answer":
    case "text":
      return "Short answer";
    case "long_answer":
      return "Long answer";
    case "paragraph":
    case "textarea":
      return "Paragraph";
    case "email":
      return "Email";
    case "phone":
    case "tel":
      return "Phone number";
    case "name":
      return "Name";
    case "signature":
      return "Signature";
    case "checklist":
      return "Checklist";
    case "radio":
      return "Multiple choice";
    default:
      return String(t);
  }
}

function isTextareaField(t: FieldType) {
  return t === "textarea" || t === "paragraph" || t === "long_answer";
}

function normalizeInputType(t: FieldType): "text" | "email" | "tel" {
  if (t === "email") return "email";
  if (t === "tel" || t === "phone") return "tel";
  return "text";
}

function normalizeHexColor(raw: unknown) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (s === "transparent") return "transparent";
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return null;
  return s;
}

function normalizeStyle(rawSchema: any): FormStyle {
  const raw = rawSchema && typeof rawSchema === "object" && rawSchema.style && typeof rawSchema.style === "object" && !Array.isArray(rawSchema.style)
    ? rawSchema.style
    : null;
  if (!raw) return {};

  const next: FormStyle = {};
  const pageBg = normalizeHexColor(raw.pageBg);
  const cardBg = normalizeHexColor(raw.cardBg);
  const buttonBg = normalizeHexColor(raw.buttonBg);
  const buttonText = normalizeHexColor(raw.buttonText);
  const inputBg = normalizeHexColor(raw.inputBg);
  const inputBorder = normalizeHexColor(raw.inputBorder);
  const textColor = normalizeHexColor(raw.textColor);
  const fontFamily = typeof raw.fontFamily === "string" ? raw.fontFamily.replace(/[\r\n\t]/g, " ").trim().slice(0, 200) : "";
  const fontGoogleFamily = typeof raw.fontGoogleFamily === "string" ? raw.fontGoogleFamily.trim().slice(0, 80) : "";
  const submitLabel = typeof raw.submitLabel === "string" ? raw.submitLabel.trim().slice(0, 80) : "";

  if (pageBg) next.pageBg = pageBg;
  if (cardBg) next.cardBg = cardBg;
  if (buttonBg) next.buttonBg = buttonBg;
  if (buttonText) next.buttonText = buttonText;
  if (inputBg) next.inputBg = inputBg;
  if (inputBorder) next.inputBorder = inputBorder;
  if (textColor) next.textColor = textColor;

  if (fontFamily) next.fontFamily = fontFamily;
  if (fontGoogleFamily) next.fontGoogleFamily = fontGoogleFamily;
  if (submitLabel) next.submitLabel = submitLabel;

  if (typeof raw.radiusPx === "number" && Number.isFinite(raw.radiusPx)) {
    next.radiusPx = Math.max(0, Math.min(40, Math.round(raw.radiusPx)));
  }

  if (typeof raw.submitRadiusPx === "number" && Number.isFinite(raw.submitRadiusPx)) {
    next.submitRadiusPx = Math.max(0, Math.min(40, Math.round(raw.submitRadiusPx)));
  }

  return next;
}

const TRANSPARENCY_CHECKERBOARD =
  "linear-gradient(45deg, rgba(24,24,27,0.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(24,24,27,0.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(24,24,27,0.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(24,24,27,0.08) 75%)";

type FormEditorDialog =
  | { type: "rename-form"; value: string }
  | { type: "slug-form"; value: string }
  | { type: "add-question"; label: string; name: string; fieldType: FieldType; required: boolean; optionsText: string; keyTouched: boolean }
  | { type: "delete-question"; idx: number; label: string }
  | { type: "delete-form" }
  | null;

const BUTTON_MOTION_CLASS = "transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20 disabled:opacity-60";
const SECONDARY_BUTTON_CLASS = `rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink ${BUTTON_MOTION_CLASS} hover:border-zinc-300 hover:bg-zinc-50`;
const PRIMARY_BUTTON_CLASS = `rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white ${BUTTON_MOTION_CLASS} hover:bg-blue-700`;
const ICON_BUTTON_CLASS = `inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 ${BUTTON_MOTION_CLASS} hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900`;

export function FormEditorClient({ basePath, formId }: { basePath: string; formId: string }) {
  const backHref = useMemo(() => `${basePath}/app/services/funnel-builder`, [basePath]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("pa.portal.topbar.intent", { detail: { hidden: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent("pa.portal.topbar.intent", { detail: { hidden: false } }));
    };
  }, []);

  const [form, setForm] = useState<Form | null>(null);
  const [fields, setFields] = useState<Field[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [style, setStyle] = useState<FormStyle>({});
  const [content, setContent] = useState<FormContent>({});
  const [successContent, setSuccessContent] = useState<FormSuccessContent>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedSigRef = useRef<string>("{}");

  const [dialog, setDialog] = useState<FormEditorDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const closeDialog = () => {
    setDialog(null);
    setDialogError(null);
  };

  const selected = useMemo(() => {
    if (selectedIdx === null) return null;
    return (fields || [])[selectedIdx] || null;
  }, [fields, selectedIdx]);
  const fontPresetKey = useMemo(() => fontPresetKeyFromStyle(style), [style]);
  const googleCss = useMemo(() => googleFontImportCss(style?.fontGoogleFamily), [style?.fontGoogleFamily]);

  const currentSig = useMemo(() => {
    if (!form || !fields) return "{}";
    return JSON.stringify({
      name: String(form.name || "").trim(),
      slug: String(form.slug || "").trim(),
      status: form.status,
      schemaJson: { fields, style: normalizeStyle({ style }), content: normalizeCreditFormContent(content), success: normalizeCreditFormSuccessContent(successContent) },
    });
  }, [form, fields, style, content, successContent]);

  const dirty = Boolean(form && fields && currentSig !== lastSavedSigRef.current);

  const load = async () => {
    setError(null);
    const res = await fetch(`/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load form");
    const f = json.form as Form;
    const nextFields = normalizeFields(f.schemaJson);
    const nextStyle = normalizeStyle(f.schemaJson);
    const nextContent = parseCreditFormContent(f.schemaJson);
    const nextSuccessContent = parseCreditFormSuccessContent(f.schemaJson);
    lastSavedSigRef.current = JSON.stringify({
      name: String(f.name || "").trim(),
      slug: String(f.slug || "").trim(),
      status: f.status,
      schemaJson: { fields: nextFields.length ? nextFields : [], style: nextStyle, content: normalizeCreditFormContent(nextContent), success: normalizeCreditFormSuccessContent(nextSuccessContent) },
    });
    setForm(f);
    setStyle(nextStyle);
    setContent(nextContent);
    setSuccessContent(nextSuccessContent);
    setFields(nextFields.length ? nextFields : []);
    setSelectedIdx((prev) => {
      if (!nextFields.length) return null;
      if (prev === null) return null;
      return Math.min(prev, Math.max(0, nextFields.length - 1));
    });
  };

  useEffect(() => {
    let cancelled = false;

    if (form !== null && fields !== null) return;

    void load().catch((e) => {
      if (cancelled) return;
      setError(e?.message ? String(e.message) : "Failed to load");
    });

    return () => {
      cancelled = true;
    };
    // Intentionally omit `load` from deps to avoid re-creating it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, form, fields]);

  const save = async (opts?: { name?: string; slug?: string; status?: Form["status"] }) => {
    if (!form || !fields) return;
    const trimmedName = String((opts?.name ?? form.name) || "").trim();
    if (!trimmedName || trimmedName.length > 120) {
      setError("Invalid name");
      return;
    }
    const dupe = (() => {
      const seen = new Set<string>();
      for (const f of fields) {
        const k = String(f.name || "").trim().toLowerCase();
        if (!k) continue;
        if (seen.has(k)) return f.name;
        seen.add(k);
      }
      return null;
    })();
    if (dupe) {
      setError(`Each question must have a unique field key. Duplicate: ${dupe}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          ...(opts || {}),
          schemaJson: { fields, style: normalizeStyle({ style }), content: normalizeCreditFormContent(content), success: normalizeCreditFormSuccessContent(successContent) },
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save");
      setForm(json.form as Form);
      lastSavedSigRef.current = JSON.stringify({
        name: String(json.form?.name || "").trim(),
        slug: String(json.form?.slug || "").trim(),
        status: json.form?.status,
        schemaJson: { fields, style: normalizeStyle({ style }), content: normalizeCreditFormContent(content), success: normalizeCreditFormSuccessContent(successContent) },
      });
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const deleteForm = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to delete");
      window.location.href = backHref;
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  const addQuestion = () => {
    const label = "New question";
    setDialogError(null);
    const desiredKey = slugifyName(label) || "field";
    const nextKey = makeUniqueFieldKey(desiredKey, (fields || []).map((f) => f.name));
    setDialog({ type: "add-question", label, name: nextKey, fieldType: "short_answer", required: false, optionsText: "", keyTouched: false });
  };

  const performAddQuestion = ({ label, name, fieldType, required, optionsText }: { label: string; name: string; fieldType: FieldType; required: boolean; optionsText: string }) => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setDialogError("Label is required.");
      return;
    }
    const cleanedName = slugifyName(name);
    if (!cleanedName) {
      setDialogError("Field key is required.");
      return;
    }

    const nextName = makeUniqueFieldKey(cleanedName, (fields || []).map((f) => f.name));

    const isOptionsField = fieldType === "checklist" || fieldType === "radio";
    const nextOptions = isOptionsField
      ? optionsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 50)
      : undefined;
    if (isOptionsField && (!nextOptions || nextOptions.length === 0)) {
      setDialogError("Options are required (one per line). ");
      return;
    }

    setFields((prev) => {
      const next = [...(prev || [])];
      next.push({ name: nextName, label: trimmedLabel, type: fieldType, required, options: nextOptions });
      return next;
    });
    setSelectedIdx(fields?.length || 0);
    closeDialog();
  };

  const removeQuestion = (idx: number) => {
    if (!fields) return;
    const f = fields[idx];
    if (!f) return;
    setDialogError(null);
    setDialog({ type: "delete-question", idx, label: f.label });
  };

  const performRemoveQuestion = (idx: number) => {
    if (!fields) return;
    const next = fields.filter((_, i) => i !== idx);
    setFields(next);
    setSelectedIdx((prev) => {
      if (!next.length) return null;
      if (prev === null) return 0;
      return Math.max(0, Math.min(prev, next.length - 1));
    });
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    if (!fields) return;
    const j = idx + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    const tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;
    setFields(next);
    setSelectedIdx(j);
  };

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      {googleCss ? <style>{googleCss}</style> : null}
      <AppModal
        open={dialog?.type === "rename-form"}
        title="Rename form"
        description="Set a new display name for this form."
        onClose={closeDialog}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={closeDialog}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={classNames(
                "rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95",
                busy ? "opacity-60" : "",
              )}
              disabled={busy}
              onClick={() => {
                if (dialog?.type !== "rename-form") return;
                const name = dialog.value.trim();
                if (!name) {
                  setDialogError("Name is required.");
                  return;
                }
                void save({ name });
                closeDialog();
              }}
            >
              Save
            </button>
          </div>
        }
      >
        <label className="block">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Name</div>
          <input
            autoFocus
            value={dialog?.type === "rename-form" ? dialog.value : ""}
            onChange={(e) => {
              const v = e.target.value;
              setDialogError(null);
              setDialog((prev) => (prev?.type === "rename-form" ? { type: "rename-form", value: v } : prev));
            }}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
          />
        </label>
        {dialogError ? <div className="mt-3 text-sm font-semibold text-red-700">{dialogError}</div> : null}
      </AppModal>

      <AppModal
        open={dialog?.type === "slug-form"}
        title="Change form slug"
        description="This controls the hosted URL path segment."
        onClose={closeDialog}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={closeDialog}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={classNames(
                "rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95",
                busy ? "opacity-60" : "",
              )}
              disabled={busy}
              onClick={() => {
                if (dialog?.type !== "slug-form") return;
                const slug = slugifyName(dialog.value);
                if (!slug) {
                  setDialogError("Slug is required.");
                  return;
                }
                void save({ slug });
                closeDialog();
              }}
            >
              Save
            </button>
          </div>
        }
      >
        <label className="block">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Slug</div>
          <input
            autoFocus
            value={dialog?.type === "slug-form" ? dialog.value : ""}
            onChange={(e) => {
              const v = e.target.value;
              setDialogError(null);
              setDialog((prev) => (prev?.type === "slug-form" ? { type: "slug-form", value: v } : prev));
            }}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
          />
          <div className="mt-1 text-xs text-zinc-500">Allowed: letters, numbers, and dashes.</div>
        </label>
        {dialogError ? <div className="mt-3 text-sm font-semibold text-red-700">{dialogError}</div> : null}
      </AppModal>

      <AppModal
        open={dialog?.type === "add-question"}
        title="Add question"
        description="Create a new form field."
        onClose={closeDialog}
        widthClassName="w-[min(640px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={closeDialog}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className={classNames(
                "rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
                busy ? "opacity-60" : "",
              )}
              disabled={busy}
              onClick={() => {
                if (dialog?.type !== "add-question") return;
                performAddQuestion({
                  label: dialog.label,
                  name: dialog.name,
                  fieldType: dialog.fieldType,
                  required: dialog.required,
                  optionsText: dialog.optionsText,
                });
              }}
            >
              Add
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Label</div>
            <input
              autoFocus
              value={dialog?.type === "add-question" ? dialog.label : ""}
              onChange={(e) => {
                const v = e.target.value;
                setDialogError(null);
                setDialog((prev) => {
                  if (!prev || prev.type !== "add-question") return prev;
                  if (prev.keyTouched) return { ...prev, label: v };
                  const desired = slugifyName(v) || "field";
                  const nextName = makeUniqueFieldKey(desired, (fields || []).map((f) => f.name));
                  return { ...prev, label: v, name: nextName };
                });
              }}
              placeholder="Email"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Field key</div>
            <input
              value={dialog?.type === "add-question" ? dialog.name : ""}
              onChange={(e) => {
                const v = slugifyName(e.target.value);
                setDialogError(null);
                setDialog((prev) => (prev?.type === "add-question" ? { ...prev, name: v, keyTouched: true } : prev));
              }}
              placeholder="email"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Type</div>
            <PortalListboxDropdown
              value={dialog?.type === "add-question" ? dialog.fieldType : "short_answer"}
              onChange={(t) => {
                setDialogError(null);
                setDialog((prev) => (prev?.type === "add-question" ? { ...prev, fieldType: t as FieldType } : prev));
              }}
              options={[
                { value: "short_answer", label: "Short answer" },
                { value: "long_answer", label: "Long answer" },
                { value: "paragraph", label: "Paragraph" },
                { value: "name", label: "Name" },
                { value: "email", label: "Email" },
                { value: "phone", label: "Phone number" },
                { value: "signature", label: "Signature" },
                { value: "checklist", label: "Checklist" },
                { value: "radio", label: "Multiple choice" },
              ]}
              className="mt-1 w-full"
              buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
            />
          </label>

          {dialog?.type === "add-question" && (dialog.fieldType === "checklist" || dialog.fieldType === "radio") ? (
            <label className="block">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Options</div>
              <textarea
                value={dialog.optionsText}
                onChange={(e) => {
                  const v = e.target.value;
                  setDialogError(null);
                  setDialog((prev) => (prev?.type === "add-question" ? { ...prev, optionsText: v } : prev));
                }}
                placeholder={"Option 1\nOption 2\nOption 3"}
                className="mt-1 min-h-24 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
              <div className="mt-1 text-xs text-zinc-500">One option per line.</div>
            </label>
          ) : null}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={dialog?.type === "add-question" ? dialog.required : false}
              onChange={(e) => {
                const required = e.target.checked;
                setDialog((prev) => (prev?.type === "add-question" ? { ...prev, required } : prev));
              }}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <span className="text-sm font-semibold text-zinc-900">Required</span>
          </label>

          {dialogError ? <div className="text-sm font-semibold text-red-700">{dialogError}</div> : null}
        </div>
      </AppModal>

      <AppConfirmModal
        open={dialog?.type === "delete-question"}
        title="Delete question"
        message={dialog?.type === "delete-question" ? `Delete question “${dialog.label}”? This cannot be undone.` : "Delete this question?"}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onClose={closeDialog}
        onConfirm={() => {
          if (dialog?.type !== "delete-question") return;
          const idx = dialog.idx;
          closeDialog();
          performRemoveQuestion(idx);
        }}
      />

      <AppConfirmModal
        open={dialog?.type === "delete-form"}
        title="Delete form"
        message={form ? `Delete form “${form.name}”? This will remove all submissions and cannot be undone.` : "Delete this form?"}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onClose={closeDialog}
        onConfirm={() => {
          closeDialog();
          void deleteForm();
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={backHref} className="text-sm font-semibold text-(--color-brand-blue) transition-all duration-150 hover:-translate-y-0.5 hover:underline">
            ← Back
          </Link>
          {!dirty ? <div className="text-xs font-semibold text-zinc-500">Saved</div> : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            value={form?.name || ""}
            onChange={(e) => setForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
            placeholder="Internal form name"
            className="h-10 min-w-55 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none transition-all duration-150 hover:border-zinc-300 focus:border-zinc-300"
          />
          <Link
            href={toPurelyHostedUrl(hostedFormPath(form?.slug || "", form?.id || "") || `/forms/${encodeURIComponent(form?.slug || "")}`)}
            target="_blank"
            className={classNames(SECONDARY_BUTTON_CLASS, "inline-flex items-center gap-2")}
          >
            <IconEyeGlyph size={16} />
            Preview
          </Link>
          <Link
            href={`${basePath}/app/services/funnel-builder/forms/${encodeURIComponent(formId)}/responses`}
            target="_blank"
            className={SECONDARY_BUTTON_CLASS}
          >
            Responses
          </Link>
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => save()}
            className={classNames(PRIMARY_BUTTON_CLASS, busy || !dirty ? "bg-zinc-400 hover:bg-zinc-400" : "")}
          >
            {busy ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      {error ? <div className="mx-4 mb-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mx-6 lg:mx-8">{error}</div> : null}

      <div className="grid min-h-[calc(100dvh-132px)] min-w-0 grid-cols-1 gap-0 bg-white xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        <aside className="min-w-0 border-b border-zinc-200 bg-white p-4 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-brand-ink">Questions</div>
            <button
              type="button"
              disabled={busy}
              onClick={addQuestion}
              className={classNames(
                "inline-flex items-center gap-2 rounded-2xl bg-(--color-brand-blue) px-3 py-2 text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-blue-700",
                busy ? "opacity-60" : "",
              )}
            >
              <span className="text-base leading-none">+</span>
              Add question
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSelectedIdx(null)}
            className={classNames(
              `mt-3 flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left ${BUTTON_MOTION_CLASS}`,
              selectedIdx === null
                ? "border-(--color-brand-blue) bg-blue-600 text-white"
                : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
            )}
          >
            <span>
              <span className={classNames("block text-sm font-semibold", selectedIdx === null ? "text-white" : "text-zinc-900")}>Form settings</span>
              <span className={classNames("mt-0.5 block text-xs", selectedIdx === null ? "text-blue-100" : "text-zinc-600")}>Styles and post-submit page</span>
            </span>
          </button>

          <div className="mt-3 space-y-2">
            {(fields || []).map((q, idx) => (
              <div
                key={`${q.name}-${idx}`}
                className={classNames(
                  "rounded-2xl border p-3",
                  idx === selectedIdx
                    ? "border-(--color-brand-blue) bg-blue-600 text-white"
                    : "border-zinc-200 bg-white",
                )}
              >
                <button type="button" onClick={() => setSelectedIdx(idx)} className={classNames(`w-full rounded-xl text-left ${BUTTON_MOTION_CLASS}`, idx === selectedIdx ? "hover:translate-y-0" : "hover:bg-zinc-50") }>
                  <div className={classNames("text-sm font-semibold", idx === selectedIdx ? "text-white" : "text-zinc-900")}>{q.label}</div>
                  <div className={classNames("mt-0.5 text-xs", idx === selectedIdx ? "text-blue-100" : "text-zinc-600")}>
                    key: {q.name} · {fieldTypeLabel(q.type)}{q.required ? " · required" : ""}
                  </div>
                </button>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, -1)}
                    className={classNames(`rounded-xl px-2 py-1 text-xs font-semibold ${BUTTON_MOTION_CLASS}`, idx === selectedIdx ? "bg-white/15 text-white hover:bg-white/20" : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50")}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, 1)}
                    className={classNames(`rounded-xl px-2 py-1 text-xs font-semibold ${BUTTON_MOTION_CLASS}`, idx === selectedIdx ? "bg-white/15 text-white hover:bg-white/20" : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50")}
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0 border-b border-zinc-200 bg-zinc-50 p-4 sm:p-6 xl:border-b-0 xl:border-r">
          <div
            className="h-full overflow-hidden rounded-3xl border border-zinc-200 p-4 sm:p-6"
            style={
              style.pageBg === "transparent"
                ? {
                    backgroundColor: "transparent",
                    backgroundImage: TRANSPARENCY_CHECKERBOARD,
                    backgroundSize: "18px 18px",
                    backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
                  }
                : { backgroundColor: style.pageBg || "#f4f4f5" }
            }
          >
            <div
              className="h-full rounded-[28px] border border-zinc-200 p-6"
              style={
                style.cardBg === "transparent"
                  ? {
                      backgroundColor: "transparent",
                      backgroundImage: TRANSPARENCY_CHECKERBOARD,
                      backgroundSize: "18px 18px",
                      backgroundPosition: "0 0, 0 9px, 9px -9px, -9px 0px",
                      fontFamily: style.fontFamily || undefined,
                    }
                  : { backgroundColor: style.cardBg || "#ffffff", fontFamily: style.fontFamily || undefined }
              }
            >
              <input
                value={content.displayTitle || ""}
                onChange={(e) => setContent((prev) => ({ ...prev, displayTitle: e.target.value }))}
                onFocus={() => setSelectedIdx(null)}
                placeholder={form?.name || "Untitled form"}
                className="w-full border-none bg-transparent p-0 text-3xl font-bold text-zinc-900 outline-none placeholder:text-zinc-400"
                style={{ color: style.textColor || "#18181b" }}
              />
              <textarea
                value={content.description || ""}
                onChange={(e) => setContent((prev) => ({ ...prev, description: e.target.value }))}
                onFocus={() => setSelectedIdx(null)}
                placeholder="Add the supporting text customers should see under the form title."
                className="mt-3 min-h-20 w-full resize-none border-none bg-transparent p-0 text-sm leading-6 outline-none placeholder:text-zinc-400"
                style={{ color: style.textColor || "#18181b" }}
              />

              <div className="mt-6 space-y-4">
                {(fields || []).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-6 text-sm text-zinc-600">
                    No questions yet. Use the button below to add your first one.
                  </div>
                ) : (
                  (fields || []).map((field, idx) => (
                    <button
                      key={`${field.name}-${idx}`}
                      type="button"
                      onClick={() => setSelectedIdx(idx)}
                      className={classNames(
                        `block w-full rounded-2xl border p-4 text-left ${BUTTON_MOTION_CLASS}`,
                        idx === selectedIdx
                          ? "border-(--color-brand-blue) bg-blue-50"
                          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold" style={{ color: style.textColor || "#18181b" }}>
                          {field.label}
                        </div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          {fieldTypeLabel(field.type)}{field.required ? " · required" : ""}
                        </div>
                      </div>
                      <div className="mt-3">
                        {field.type === "checklist" ? (
                          <div className="space-y-2">
                            {(field.options || ["Option 1", "Option 2"]).map((opt) => (
                              <label key={opt} className="flex items-center gap-2 text-sm" style={{ color: style.textColor || "#18181b" }}>
                                <input
                                  disabled
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-zinc-300"
                                  style={{ accentColor: style.buttonBg || "#2563eb" }}
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        ) : field.type === "radio" ? (
                          <div className="space-y-2">
                            {(field.options || ["Option 1", "Option 2"]).map((opt) => (
                              <label key={opt} className="flex items-center gap-2 text-sm" style={{ color: style.textColor || "#18181b" }}>
                                <input
                                  disabled
                                  type="radio"
                                  className="h-4 w-4 border-zinc-300"
                                  style={{ accentColor: style.buttonBg || "#2563eb" }}
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        ) : field.type === "signature" ? (
                          <div
                            className="rounded-2xl border border-dashed px-4 py-4"
                            style={{
                              borderRadius: style.radiusPx ?? 16,
                              backgroundColor: style.inputBg || "#ffffff",
                              borderColor: style.inputBorder || "#e4e4e7",
                              color: style.textColor || "#18181b",
                            }}
                          >
                            <div className="h-24 w-full rounded-xl border border-zinc-200 bg-white" />
                            <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Draw signature here</div>
                          </div>
                        ) : isTextareaField(field.type) ? (
                          <textarea
                            disabled
                            className="min-h-24 w-full border border-zinc-200 px-4 py-2 text-sm"
                            style={{
                              borderRadius: style.radiusPx ?? 16,
                              backgroundColor: style.inputBg || "#ffffff",
                              borderColor: style.inputBorder || "#e4e4e7",
                              color: style.textColor || "#18181b",
                            }}
                            placeholder="Answer"
                          />
                        ) : (
                          <input
                            disabled
                            type={normalizeInputType(field.type)}
                            className="w-full border border-zinc-200 px-4 py-2 text-sm"
                            style={{
                              borderRadius: style.radiusPx ?? 16,
                              backgroundColor: style.inputBg || "#ffffff",
                              borderColor: style.inputBorder || "#e4e4e7",
                              color: style.textColor || "#18181b",
                            }}
                            placeholder="Answer"
                          />
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedIdx(null)}
                className={`mt-4 inline-flex w-full items-center justify-center px-4 py-2 text-sm font-bold ${BUTTON_MOTION_CLASS}`}
                style={{
                  borderRadius: style.submitRadiusPx ?? style.radiusPx ?? 16,
                  backgroundColor: style.buttonBg || "#2563eb",
                  color: style.buttonText || "#ffffff",
                }}
              >
                {style.submitLabel?.trim() || "Submit"}
              </button>
            </div>
          </div>
        </section>

        <section className="min-w-0 bg-white p-6">
          {selected && selectedIdx !== null ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-brand-ink">Edit question</div>
                  <div className="mt-1 text-xs text-zinc-500">Update the selected field’s label, key, type, and options.</div>
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{fieldTypeLabel(selected.type)}</div>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Label</div>
                  <input
                    value={selected.label}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFields((prev) => (prev || []).map((f, i) => (i === selectedIdx ? { ...f, label: v } : f)));
                    }}
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </label>

                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Field key</div>
                  <input
                    value={selected.name}
                    onChange={(e) => {
                      const v = slugifyName(e.target.value);
                      setFields((prev) => (prev || []).map((f, i) => (i === selectedIdx ? { ...f, name: v } : f)));
                    }}
                    onBlur={() => {
                      const desired = slugifyName(selected.name);
                      const existing = (fields || []).filter((_, i) => i !== selectedIdx).map((f) => f.name);
                      const unique = makeUniqueFieldKey(desired, existing);
                      if (unique !== desired) {
                        setFields((prev) => (prev || []).map((f, i) => (i === selectedIdx ? { ...f, name: unique } : f)));
                      }
                    }}
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                </label>

                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Type</div>
                  <PortalListboxDropdown
                    value={selected.type}
                    onChange={(t) => {
                      setFields((prev) =>
                        (prev || []).map((f, i) => {
                          if (i !== selectedIdx) return f;
                          const nextType = t as FieldType;
                          const nextOptions = nextType === "checklist" || nextType === "radio" ? f.options || ["Option 1", "Option 2"] : undefined;
                          return { ...f, type: nextType, options: nextOptions };
                        }),
                      );
                    }}
                    options={[
                      { value: "short_answer", label: "Short answer" },
                      { value: "long_answer", label: "Long answer" },
                      { value: "paragraph", label: "Paragraph" },
                      { value: "name", label: "Name" },
                      { value: "email", label: "Email" },
                      { value: "phone", label: "Phone number" },
                      { value: "signature", label: "Signature" },
                      { value: "checklist", label: "Checklist" },
                      { value: "radio", label: "Multiple choice" },
                    ]}
                    className="mt-1 w-full"
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
                  />
                </label>

                {selected.type === "checklist" || selected.type === "radio" ? (
                  <label className="block">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Options</div>
                    <textarea
                      value={(selected.options || []).join("\n")}
                      onChange={(e) => {
                        const nextOptions = e.target.value
                          .split("\n")
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .slice(0, 50);
                        setFields((prev) => (prev || []).map((f, i) => (i === selectedIdx ? { ...f, options: nextOptions } : f)));
                      }}
                      placeholder={"Option 1\nOption 2"}
                      className="mt-1 min-h-24 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                    />
                    <div className="mt-1 text-xs text-zinc-500">One option per line.</div>
                  </label>
                ) : null}

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!selected.required}
                    onChange={(e) => {
                      const required = e.target.checked;
                      setFields((prev) => (prev || []).map((f, i) => (i === selectedIdx ? { ...f, required } : f)));
                    }}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <span className="text-sm font-semibold text-zinc-900">Required</span>
                </label>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="text-sm font-semibold text-brand-ink">Form style</div>
                <div className="mt-1 text-xs text-zinc-500">When no question is selected, this panel controls the full form experience.</div>
              </div>
              <div className="mt-4 space-y-3 border-b border-zinc-200 pb-6">
                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Customer-facing title</div>
                  <input
                    value={content.displayTitle || ""}
                    onChange={(e) => setContent((prev) => ({ ...prev, displayTitle: e.target.value }))}
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                    placeholder={form?.name || "Untitled form"}
                  />
                </label>

                <label className="block">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Customer-facing intro text</div>
                  <textarea
                    value={content.description || ""}
                    onChange={(e) => setContent((prev) => ({ ...prev, description: e.target.value }))}
                    className="mt-1 min-h-24 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                    placeholder="Add the copy customers should see under the title."
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Font</div>
                        <PortalFontDropdown
                          value={fontPresetKey}
                          onChange={(k) => {
                            const next = applyFontPresetToStyle(String(k || "default"));
                            setStyle((prev) => ({
                              ...prev,
                              fontFamily: next.fontFamily,
                              fontGoogleFamily: next.fontGoogleFamily,
                            }));
                          }}
                          includeCustom
                          customFontFamily={style.fontFamily || ""}
                          extraOptions={[{ value: "default", label: "Default (app font)" }]}
                          className="mt-1 w-full"
                          buttonClassName={`flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 ${BUTTON_MOTION_CLASS} hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-zinc-300`}
                        />
                        <div className="mt-1 text-xs text-zinc-500">Pick a preset to auto-load Google Fonts. Custom uses whatever the browser has.</div>
                      </label>

                      {fontPresetKey === "custom" ? (
                        <label className="block sm:col-span-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Custom font-family</div>
                          <input
                            value={style.fontFamily || ""}
                            onChange={(e) =>
                              setStyle((prev) => ({
                                ...prev,
                                fontFamily: e.target.value.replace(/[\r\n\t]/g, " ").slice(0, 200),
                                fontGoogleFamily: undefined,
                              }))
                            }
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                            placeholder='e.g. ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
                          />
                        </label>
                      ) : null}

                      <label className="block">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Page background</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <input
                            type="color"
                            value={style.pageBg && style.pageBg !== "transparent" ? style.pageBg : "#f4f4f5"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, pageBg: e.target.value.trim() }))}
                            disabled={style.pageBg === "transparent"}
                            className={classNames(
                              "h-10 w-14 rounded-xl border border-zinc-200 bg-white",
                              style.pageBg === "transparent" ? "cursor-not-allowed opacity-60" : "",
                            )}
                          />
                          <input
                            value={style.pageBg || "#f4f4f5"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, pageBg: e.target.value }))}
                            className="h-10 min-w-45 flex-1 rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                            placeholder="#f4f4f5 or transparent"
                          />
                          <button
                            type="button"
                            onClick={() => setStyle((prev) => ({ ...prev, pageBg: "transparent" }))}
                            className={classNames(
                              `h-10 rounded-2xl border px-3 text-sm font-semibold ${BUTTON_MOTION_CLASS}`,
                              style.pageBg === "transparent"
                                ? "border-(--color-brand-blue) bg-blue-600 text-white"
                                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                            )}
                          >
                            Transparent
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setStyle((prev) => {
                                const next = { ...prev };
                                delete next.pageBg;
                                return next;
                              })
                            }
                            className={`h-10 shrink-0 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 ${BUTTON_MOTION_CLASS} hover:border-zinc-300 hover:bg-zinc-50`}
                          >
                            Clear
                          </button>
                        </div>
                      </label>

                      <label className="block">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Card background</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <input
                            type="color"
                            value={style.cardBg && style.cardBg !== "transparent" ? style.cardBg : "#ffffff"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, cardBg: e.target.value.trim() }))}
                            disabled={style.cardBg === "transparent"}
                            className={classNames(
                              "h-10 w-14 rounded-xl border border-zinc-200 bg-white",
                              style.cardBg === "transparent" ? "cursor-not-allowed opacity-60" : "",
                            )}
                          />
                          <input
                            value={style.cardBg || "#ffffff"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, cardBg: e.target.value }))}
                            className="h-10 min-w-45 flex-1 rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                            placeholder="#ffffff or transparent"
                          />
                          <button
                            type="button"
                            onClick={() => setStyle((prev) => ({ ...prev, cardBg: "transparent" }))}
                            className={classNames(
                              `h-10 rounded-2xl border px-3 text-sm font-semibold ${BUTTON_MOTION_CLASS}`,
                              style.cardBg === "transparent"
                                ? "border-(--color-brand-blue) bg-blue-600 text-white"
                                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                            )}
                          >
                            Transparent
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setStyle((prev) => {
                                const next = { ...prev };
                                delete next.cardBg;
                                return next;
                              })
                            }
                            className={`h-10 shrink-0 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 ${BUTTON_MOTION_CLASS} hover:border-zinc-300 hover:bg-zinc-50`}
                          >
                            Clear
                          </button>
                        </div>
                      </label>

                      <label className="block sm:col-span-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Submit button label</div>
                        <input
                          value={style.submitLabel || ""}
                          onChange={(e) => setStyle((prev) => ({ ...prev, submitLabel: e.target.value }))}
                          className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                          placeholder="Submit"
                        />
                      </label>

                      <label className="block">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Button background</div>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="color"
                            value={style.buttonBg && style.buttonBg !== "transparent" ? style.buttonBg : "#2563eb"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, buttonBg: e.target.value }))}
                            className="h-10 w-14 rounded-xl border border-zinc-200 bg-white"
                          />
                          <input
                            value={style.buttonBg || "#2563eb"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, buttonBg: e.target.value }))}
                            className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                            placeholder="#2563eb"
                          />
                        </div>
                      </label>

                      <label className="block">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Button text</div>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="color"
                            value={style.buttonText && style.buttonText !== "transparent" ? style.buttonText : "#ffffff"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, buttonText: e.target.value }))}
                            className="h-10 w-14 rounded-xl border border-zinc-200 bg-white"
                          />
                          <input
                            value={style.buttonText || "#ffffff"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, buttonText: e.target.value }))}
                            className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                            placeholder="#ffffff"
                          />
                        </div>
                      </label>

                      <label className="block">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Field corner radius</div>
                        <div className="mt-2 flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={40}
                            value={style.radiusPx ?? 16}
                            onChange={(e) => setStyle((prev) => ({ ...prev, radiusPx: Number(e.target.value) }))}
                            className="w-full"
                          />
                          <div className="w-16 text-right text-sm font-semibold text-zinc-700">{style.radiusPx ?? 16}px</div>
                        </div>
                      </label>

                      <label className="block">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Submit button radius</div>
                        <div className="mt-2 flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={40}
                            value={style.submitRadiusPx ?? style.radiusPx ?? 16}
                            onChange={(e) => setStyle((prev) => ({ ...prev, submitRadiusPx: Number(e.target.value) }))}
                            className="w-full"
                          />
                          <div className="w-16 text-right text-sm font-semibold text-zinc-700">{style.submitRadiusPx ?? style.radiusPx ?? 16}px</div>
                        </div>
                      </label>

                      <div className="flex items-end justify-end sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => setStyle({})}
                          className={SECONDARY_BUTTON_CLASS}
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-zinc-500">Tip: set Page/Card backgrounds to “transparent” for embed-friendly styling.</div>

                    <div className="mt-6 border-t border-zinc-200 pt-6">
                      <div className="text-sm font-semibold text-brand-ink">Post-submit page</div>
                      <div className="mt-1 text-xs text-zinc-500">Customize the thank-you state visitors see after a successful submission.</div>
                      <div className="mt-3 space-y-3">
                        <label className="block">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Title</div>
                          <input
                            value={successContent.title || ""}
                            onChange={(e) => setSuccessContent((prev) => ({ ...prev, title: e.target.value }))}
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                            placeholder="Thanks for submitting"
                          />
                        </label>

                        <label className="block">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Message</div>
                          <textarea
                            value={successContent.message || ""}
                            onChange={(e) => setSuccessContent((prev) => ({ ...prev, message: e.target.value }))}
                            className="mt-1 min-h-28 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                            placeholder="We received your submission and will follow up soon."
                          />
                          <div className="mt-1 text-xs text-zinc-500">This replaces the default thank-you message after a successful submission.</div>
                        </label>

                        <label className="block">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Success button label</div>
                          <input
                            value={successContent.buttonLabel || ""}
                            onChange={(e) => setSuccessContent((prev) => ({ ...prev, buttonLabel: e.target.value }))}
                            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                            placeholder="Submit another response"
                          />
                        </label>

                        <label className="block">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Success button action</div>
                          <PortalListboxDropdown
                            value={successContent.buttonAction || "reset"}
                            onChange={(value) =>
                              setSuccessContent((prev) => ({
                                ...prev,
                                buttonAction: value === "redirect" ? "redirect" : "reset",
                              }))
                            }
                            options={[
                              { value: "reset", label: "Show the form again" },
                              { value: "redirect", label: "Go to a URL" },
                            ]}
                            className="mt-1 w-full"
                            buttonClassName={`flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 ${BUTTON_MOTION_CLASS} hover:border-zinc-300 hover:bg-zinc-50`}
                          />
                        </label>

                        {successContent.buttonAction === "redirect" ? (
                          <label className="block">
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Redirect URL</div>
                            <input
                              value={successContent.buttonUrl || ""}
                              onChange={(e) => setSuccessContent((prev) => ({ ...prev, buttonUrl: e.target.value }))}
                              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                              placeholder="https://example.com/thanks"
                            />
                          </label>
                        ) : null}

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block">
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Success background</div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="color"
                                value={successContent.surfaceColor || "#ecfdf5"}
                                onChange={(e) => setSuccessContent((prev) => ({ ...prev, surfaceColor: e.target.value }))}
                                className="h-10 w-14 rounded-xl border border-zinc-200 bg-white"
                              />
                              <input
                                value={successContent.surfaceColor || "#ecfdf5"}
                                onChange={(e) => setSuccessContent((prev) => ({ ...prev, surfaceColor: e.target.value }))}
                                className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                              />
                            </div>
                          </label>

                          <label className="block">
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Success border</div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="color"
                                value={successContent.borderColor || "#a7f3d0"}
                                onChange={(e) => setSuccessContent((prev) => ({ ...prev, borderColor: e.target.value }))}
                                className="h-10 w-14 rounded-xl border border-zinc-200 bg-white"
                              />
                              <input
                                value={successContent.borderColor || "#a7f3d0"}
                                onChange={(e) => setSuccessContent((prev) => ({ ...prev, borderColor: e.target.value }))}
                                className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                              />
                            </div>
                          </label>

                          <label className="block">
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Accent color</div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="color"
                                value={successContent.accentColor || "#047857"}
                                onChange={(e) => setSuccessContent((prev) => ({ ...prev, accentColor: e.target.value }))}
                                className="h-10 w-14 rounded-xl border border-zinc-200 bg-white"
                              />
                              <input
                                value={successContent.accentColor || "#047857"}
                                onChange={(e) => setSuccessContent((prev) => ({ ...prev, accentColor: e.target.value }))}
                                className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                              />
                            </div>
                          </label>

                          <label className="block">
                            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Text color</div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="color"
                                value={successContent.textColor || style.textColor || "#18181b"}
                                onChange={(e) => setSuccessContent((prev) => ({ ...prev, textColor: e.target.value }))}
                                className="h-10 w-14 rounded-xl border border-zinc-200 bg-white"
                              />
                              <input
                                value={successContent.textColor || style.textColor || "#18181b"}
                                onChange={(e) => setSuccessContent((prev) => ({ ...prev, textColor: e.target.value }))}
                                className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                              />
                            </div>
                          </label>
                        </div>

                        <div
                          className="rounded-3xl border p-5"
                          style={{
                            borderColor: successContent.borderColor || "#a7f3d0",
                            backgroundColor: successContent.surfaceColor || "#ecfdf5",
                          }}
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: successContent.accentColor || "#047857" }}>
                            Submission received
                          </div>
                          <div className="mt-2 text-xl font-bold" style={{ color: successContent.textColor || style.textColor || "#18181b" }}>
                            {successContent.title?.trim() || "Submitted. Thank you!"}
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm leading-6" style={{ color: successContent.textColor || style.textColor || "#18181b" }}>
                            {successContent.message?.trim() || "We received your submission and will review it shortly."}
                          </div>
                          <button
                            type="button"
                            className={`mt-4 inline-flex items-center justify-center px-4 py-2 text-sm font-semibold ${BUTTON_MOTION_CLASS}`}
                            style={{
                              borderRadius: style.submitRadiusPx ?? style.radiusPx ?? 16,
                              backgroundColor: style.buttonBg || "#2563eb",
                              color: style.buttonText || "#ffffff",
                            }}
                          >
                            {successContent.buttonLabel?.trim() || "Submit another response"}
                          </button>
                        </div>
                      </div>
                    </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
