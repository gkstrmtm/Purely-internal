"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppConfirmModal, AppModal } from "@/components/AppModal";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { FONT_PRESETS, applyFontPresetToStyle, fontPresetKeyFromStyle, googleFontImportCss } from "@/lib/fontPresets";
import { hostedFormPath } from "@/lib/publicHostedKeys";

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
  fontFamily?: string;
  fontGoogleFamily?: string;
};

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

  if (pageBg) next.pageBg = pageBg;
  if (cardBg) next.cardBg = cardBg;
  if (buttonBg) next.buttonBg = buttonBg;
  if (buttonText) next.buttonText = buttonText;
  if (inputBg) next.inputBg = inputBg;
  if (inputBorder) next.inputBorder = inputBorder;
  if (textColor) next.textColor = textColor;

  if (fontFamily) next.fontFamily = fontFamily;
  if (fontGoogleFamily) next.fontGoogleFamily = fontGoogleFamily;

  if (typeof raw.radiusPx === "number" && Number.isFinite(raw.radiusPx)) {
    next.radiusPx = Math.max(0, Math.min(40, Math.round(raw.radiusPx)));
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
  | null;

export function FormEditorClient({ basePath, formId }: { basePath: string; formId: string }) {
  const backHref = useMemo(() => `${basePath}/app/services/funnel-builder`, [basePath]);

  const [form, setForm] = useState<Form | null>(null);
  const [fields, setFields] = useState<Field[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [style, setStyle] = useState<FormStyle>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [dialog, setDialog] = useState<FormEditorDialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const closeDialog = () => {
    setDialog(null);
    setDialogError(null);
  };

  const selected = useMemo(() => (fields || [])[selectedIdx] || null, [fields, selectedIdx]);
  const fontPresetKey = useMemo(() => fontPresetKeyFromStyle(style), [style]);
  const googleCss = useMemo(() => googleFontImportCss(style?.fontGoogleFamily), [style?.fontGoogleFamily]);

  const load = async () => {
    setError(null);
    const res = await fetch(`/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}`, { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load form");
    const f = json.form as Form;
    setForm(f);
    const nextFields = normalizeFields(f.schemaJson);
    setStyle(normalizeStyle(f.schemaJson));
    setFields(nextFields.length ? nextFields : []);
    setSelectedIdx((prev) => Math.min(prev, Math.max(0, nextFields.length - 1)));
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
          ...(opts || {}),
          schemaJson: { fields, style: normalizeStyle({ style }) },
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to save");
      setForm(json.form as Form);
      setSavedAt(Date.now());
    } catch (e) {
      setError((e as any)?.message ? String((e as any).message) : "Failed to save");
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
    setSelectedIdx((fields?.length || 0));
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
    setSelectedIdx((prev) => Math.max(0, Math.min(prev, next.length - 1)));
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
    <div className="mx-auto w-full max-w-7xl" style={{ fontFamily: style?.fontFamily || undefined }}>
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
                "rounded-2xl bg-[color:var(--color-brand-blue)] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700",
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

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <Link href={backHref} className="text-sm font-semibold text-[color:var(--color-brand-blue)] hover:underline">
            ← Back
          </Link>
          <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Form editor</div>
          <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">{form?.name || "…"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
            <Link
              href={hostedFormPath(form?.slug || "", form?.id || "") || `/forms/${encodeURIComponent(form?.slug || "")}`}
              target="_blank"
              className="font-semibold text-[color:var(--color-brand-blue)] hover:underline"
            >
              View live
            </Link>
            {savedAt ? <div className="text-xs text-zinc-500">Saved</div> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDialogError(null);
              setDialog({ type: "rename-form", value: form?.name || "" });
            }}
            className={classNames(
              "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50",
              busy ? "opacity-60" : "",
            )}
          >
            Rename
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDialogError(null);
              setDialog({ type: "slug-form", value: form?.slug || "" });
            }}
            className={classNames(
              "rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50",
              busy ? "opacity-60" : "",
            )}
          >
            Change slug
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={addQuestion}
            className={classNames(
              "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
              busy ? "bg-zinc-400" : "bg-[color:var(--color-brand-blue)] hover:bg-blue-700",
            )}
          >
            + Add question
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => save()}
            className={classNames(
              "rounded-2xl px-4 py-2 text-sm font-semibold text-white",
              busy ? "bg-zinc-400" : "bg-brand-ink hover:opacity-95",
            )}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <aside className="rounded-3xl border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-brand-ink">Questions</div>
            <div className="text-xs text-zinc-600">{(fields || []).length}</div>
          </div>

          <div className="mt-3 space-y-2">
            {(fields || []).map((q, idx) => (
              <div
                key={`${q.name}-${idx}`}
                className={classNames(
                  "rounded-2xl border p-3",
                  idx === selectedIdx
                    ? "border-[color:var(--color-brand-blue)] bg-blue-50"
                    : "border-zinc-200 bg-white hover:bg-zinc-50",
                )}
              >
                <button type="button" onClick={() => setSelectedIdx(idx)} className="w-full text-left">
                  <div className="text-sm font-semibold text-zinc-900">{q.label}</div>
                  <div className="mt-0.5 text-xs text-zinc-600">
                    key: {q.name} · {fieldTypeLabel(q.type)}{q.required ? " · required" : ""}
                  </div>
                </button>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, -1)}
                    className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, 1)}
                    className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(idx)}
                    className="rounded-xl border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6">
          {!selected ? (
            <div className="mt-6 text-sm text-zinc-600">Add a question to start.</div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div>
                  <div className="text-sm font-semibold text-brand-ink">Edit question</div>

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
                </div>

                <div>
                  <div className="text-sm font-semibold text-brand-ink">Preview</div>
                  <div
                    className="mt-4 rounded-3xl border border-zinc-200 p-6"
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
                      className="rounded-3xl border border-zinc-200 p-6"
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
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{form?.name || "Form"}</div>
                      <div className="mt-2 text-lg font-bold" style={{ color: style.textColor || "#18181b" }}>
                        {selected.label}
                      </div>
                      <div className="mt-3">
                        {selected.type === "checklist" ? (
                          <div className="space-y-2">
                            {(selected.options || ["Option 1", "Option 2"]).map((opt) => (
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
                        ) : selected.type === "radio" ? (
                          <div className="space-y-2">
                            {(selected.options || ["Option 1", "Option 2"]).map((opt) => (
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
                        ) : isTextareaField(selected.type) ? (
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
                            type={normalizeInputType(selected.type)}
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

                      <div className="mt-4 inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
                        {selected.required ? "Required" : "Optional"}
                      </div>

                      <button
                        type="button"
                        className="mt-4 inline-flex w-full items-center justify-center px-4 py-2 text-sm font-bold"
                        style={{
                          borderRadius: style.radiusPx ?? 16,
                          backgroundColor: style.buttonBg || "#2563eb",
                          color: style.buttonText || "#ffffff",
                        }}
                      >
                        Submit
                      </button>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="text-sm font-semibold text-brand-ink">Form style</div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Font</div>
                        <PortalListboxDropdown
                          value={fontPresetKey}
                          onChange={(k) => {
                            const next = applyFontPresetToStyle(String(k || "default"));
                            setStyle((prev) => ({
                              ...prev,
                              fontFamily: next.fontFamily,
                              fontGoogleFamily: next.fontGoogleFamily,
                            }));
                          }}
                          options={[
                            { value: "default", label: "Default (app font)" },
                            ...FONT_PRESETS.filter((p) => p.key !== "default").map((p) => ({ value: p.key, label: p.label })),
                            { value: "custom", label: "Custom…" },
                          ]}
                          className="mt-1 w-full"
                          buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300"
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
                            className="h-10 min-w-[180px] flex-1 rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                            placeholder="#f4f4f5 or transparent"
                          />
                          <button
                            type="button"
                            onClick={() => setStyle((prev) => ({ ...prev, pageBg: "transparent" }))}
                            className={classNames(
                              "h-10 rounded-2xl border px-3 text-sm font-semibold",
                              style.pageBg === "transparent"
                                ? "border-[color:var(--color-brand-blue)] bg-blue-50 text-[color:var(--color-brand-blue)]"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
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
                            className="h-10 shrink-0 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
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
                            className="h-10 min-w-[180px] flex-1 rounded-2xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400"
                            placeholder="#ffffff or transparent"
                          />
                          <button
                            type="button"
                            onClick={() => setStyle((prev) => ({ ...prev, cardBg: "transparent" }))}
                            className={classNames(
                              "h-10 rounded-2xl border px-3 text-sm font-semibold",
                              style.cardBg === "transparent"
                                ? "border-[color:var(--color-brand-blue)] bg-blue-50 text-[color:var(--color-brand-blue)]"
                                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
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
                            className="h-10 shrink-0 rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                          >
                            Clear
                          </button>
                        </div>
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
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Radius</div>
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

                      <div className="flex items-end justify-end sm:col-span-2">
                        <button
                          type="button"
                          onClick={() => setStyle({})}
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-zinc-500">Tip: set Page/Card backgrounds to “transparent” for embed-friendly styling.</div>
                  </div>

                </div>
              </div>
          )}
        </section>
      </div>
    </div>
  );
}
