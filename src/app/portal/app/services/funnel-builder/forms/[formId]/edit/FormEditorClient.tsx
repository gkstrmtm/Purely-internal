"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppConfirmModal, AppModal } from "@/components/AppModal";

type Form = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  schemaJson: any;
  createdAt: string;
  updatedAt: string;
};

type FieldType = "text" | "email" | "tel" | "textarea";

type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
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
};

type FormSubmission = {
  id: string;
  createdAt: string;
  dataJson: any;
  ip: string | null;
  userAgent: string | null;
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
    if (type !== "text" && type !== "email" && type !== "tel" && type !== "textarea") continue;
    out.push({ name, label, type, required });
  }
  return out;
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

  if (pageBg) next.pageBg = pageBg;
  if (cardBg) next.cardBg = cardBg;
  if (buttonBg) next.buttonBg = buttonBg;
  if (buttonText) next.buttonText = buttonText;
  if (inputBg) next.inputBg = inputBg;
  if (inputBorder) next.inputBorder = inputBorder;
  if (textColor) next.textColor = textColor;

  if (typeof raw.radiusPx === "number" && Number.isFinite(raw.radiusPx)) {
    next.radiusPx = Math.max(0, Math.min(40, Math.round(raw.radiusPx)));
  }

  return next;
}

type FormEditorDialog =
  | { type: "rename-form"; value: string }
  | { type: "slug-form"; value: string }
  | { type: "add-question"; label: string; name: string; keyTouched: boolean }
  | { type: "delete-question"; idx: number; label: string }
  | null;

export function FormEditorClient({ basePath, formId }: { basePath: string; formId: string }) {
  const [form, setForm] = useState<Form | null>(null);
  const [fields, setFields] = useState<Field[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [style, setStyle] = useState<FormStyle>({});

  const [pane, setPane] = useState<"builder" | "responses">("builder");

  const [submissions, setSubmissions] = useState<FormSubmission[] | null>(null);
  const [submissionsBusy, setSubmissionsBusy] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [submissionsCursor, setSubmissionsCursor] = useState<string | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

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

  const selectedSubmission = useMemo(
    () => (submissions || []).find((s) => s.id === selectedSubmissionId) || null,
    [submissions, selectedSubmissionId],
  );

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

  const loadSubmissions = async (opts?: { reset?: boolean }) => {
    setSubmissionsError(null);
    setSubmissionsBusy(true);
    try {
      const limit = 50;
      const cursor = opts?.reset ? null : submissionsCursor;
      const url = new URL(`/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}/submissions`, window.location.origin);
      url.searchParams.set("limit", String(limit));
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || json.ok !== true) throw new Error(json?.error || "Failed to load submissions");
      const nextItems: FormSubmission[] = Array.isArray(json.submissions) ? json.submissions : [];
      const nextCursor = typeof json.nextCursor === "string" ? json.nextCursor : null;

      setSubmissions((prev) => {
        if (opts?.reset) return nextItems;
        const existing = prev || [];
        const seen = new Set(existing.map((s) => s.id));
        const merged = [...existing];
        for (const item of nextItems) {
          if (!item || typeof item !== "object") continue;
          if (typeof (item as any).id !== "string") continue;
          if (seen.has(item.id)) continue;
          merged.push(item);
          seen.add(item.id);
        }
        return merged;
      });

      setSubmissionsCursor(nextCursor);
      if (opts?.reset) setSelectedSubmissionId(null);
    } catch (e) {
      setSubmissionsError((e as any)?.message ? String((e as any).message) : "Failed to load submissions");
    } finally {
      setSubmissionsBusy(false);
    }
  };

  useEffect(() => {
    if (pane !== "responses") return;
    if (submissions !== null) return;
    void loadSubmissions({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pane, submissions, formId]);

  const save = async (opts?: { name?: string; slug?: string; status?: Form["status"] }) => {
    if (!form || !fields) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/funnel-builder/forms/${encodeURIComponent(formId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(opts || {}),
          schemaJson: { fields, style },
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
    setDialog({ type: "add-question", label, name: slugifyName(label) || "field", keyTouched: false });
  };

  const performAddQuestion = ({ label, name }: { label: string; name: string }) => {
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

    setFields((prev) => {
      const next = [...(prev || [])];
      next.push({ name: cleanedName, label: trimmedLabel, type: "text", required: false });
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
    <div className="mx-auto w-full max-w-7xl">
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
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
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
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
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
                performAddQuestion({ label: dialog.label, name: dialog.name });
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
                  const nextName = prev.keyTouched ? prev.name : slugifyName(v) || "";
                  return { ...prev, label: v, name: nextName };
                });
              }}
              placeholder="Email"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Field key</div>
            <input
              value={dialog?.type === "add-question" ? dialog.name : ""}
              onChange={(e) => {
                const v = e.target.value;
                setDialogError(null);
                setDialog((prev) => (prev?.type === "add-question" ? { ...prev, name: v, keyTouched: true } : prev));
              }}
              placeholder="email"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
            />
            <div className="mt-1 text-xs text-zinc-500">This becomes the JSON key saved on submission.</div>
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
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Form editor</div>
          <h1 className="mt-2 text-2xl font-bold text-brand-ink sm:text-3xl">{form?.name || "…"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-600">
            <div>
              Hosted: <span className="font-semibold">{basePath}/forms/{form?.slug || "…"}</span>
            </div>
            <Link
              href={`${basePath}/forms/${encodeURIComponent(form?.slug || "")}`}
              target="_blank"
              className="font-semibold text-[color:var(--color-brand-blue)] hover:underline"
            >
              Preview
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
                    key: {q.name} · {q.type}{q.required ? " · required" : ""}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-2xl border border-zinc-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setPane("builder")}
                className={classNames(
                  "rounded-xl px-3 py-1.5 text-sm font-semibold",
                  pane === "builder" ? "bg-brand-ink text-white" : "text-brand-ink hover:bg-zinc-50",
                )}
              >
                Builder
              </button>
              <button
                type="button"
                onClick={() => setPane("responses")}
                className={classNames(
                  "rounded-xl px-3 py-1.5 text-sm font-semibold",
                  pane === "responses" ? "bg-brand-ink text-white" : "text-brand-ink hover:bg-zinc-50",
                )}
              >
                Responses
              </button>
            </div>

            {pane === "responses" ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={submissionsBusy}
                  onClick={() => {
                    setSubmissions(null);
                    setSubmissionsCursor(null);
                    setSelectedSubmissionId(null);
                    void loadSubmissions({ reset: true });
                  }}
                  className={classNames(
                    "rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50",
                    submissionsBusy ? "opacity-60" : "",
                  )}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  disabled={submissionsBusy || !submissionsCursor}
                  onClick={() => void loadSubmissions()}
                  className={classNames(
                    "rounded-2xl bg-[color:var(--color-brand-blue)] px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700",
                    submissionsBusy || !submissionsCursor ? "opacity-60" : "",
                  )}
                >
                  Load more
                </button>
              </div>
            ) : null}
          </div>

          {pane === "builder" ? (
            !selected ? (
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
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
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
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                      />
                    </label>

                    <label className="block">
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Type</div>
                      <select
                        value={selected.type}
                        onChange={(e) => {
                          const t = e.target.value as FieldType;
                          setFields((prev) => (prev || []).map((f, i) => (i === selectedIdx ? { ...f, type: t } : f)));
                        }}
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm"
                      >
                        <option value="text">Short answer</option>
                        <option value="textarea">Paragraph</option>
                        <option value="email">Email</option>
                        <option value="tel">Phone</option>
                      </select>
                    </label>

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
                    style={{ backgroundColor: style.pageBg || "#f4f4f5" }}
                  >
                    <div className="rounded-3xl border border-zinc-200 p-6" style={{ backgroundColor: style.cardBg || "#ffffff" }}>
                      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{form?.name || "Form"}</div>
                      <div className="mt-2 text-lg font-bold" style={{ color: style.textColor || "#18181b" }}>
                        {selected.label}
                      </div>
                    <div className="mt-3">
                      {selected.type === "textarea" ? (
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
                          type={selected.type === "text" ? "text" : selected.type}
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
                      <label className="block">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Page background</div>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="color"
                            value={style.pageBg && style.pageBg !== "transparent" ? style.pageBg : "#f4f4f5"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, pageBg: e.target.value }))}
                            className="h-10 w-14 rounded-xl border border-zinc-200 bg-white"
                          />
                          <input
                            value={style.pageBg || "#f4f4f5"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, pageBg: e.target.value }))}
                            className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
                            placeholder="#f4f4f5 or transparent"
                          />
                        </div>
                      </label>

                      <label className="block">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Card background</div>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="color"
                            value={style.cardBg && style.cardBg !== "transparent" ? style.cardBg : "#ffffff"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, cardBg: e.target.value }))}
                            className="h-10 w-14 rounded-xl border border-zinc-200 bg-white"
                          />
                          <input
                            value={style.cardBg || "#ffffff"}
                            onChange={(e) => setStyle((prev) => ({ ...prev, cardBg: e.target.value }))}
                            className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
                            placeholder="#ffffff"
                          />
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
                            className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
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
                            className="h-10 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
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

                      <div className="flex items-end justify-end">
                        <button
                          type="button"
                          onClick={() => setStyle({})}
                          className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-zinc-500">Tip: use “transparent” for embedded forms.</div>
                  </div>

                  <div className="mt-4 text-xs text-zinc-500">
                    Hosted submissions go to: <span className="font-mono">/api/public/credit/forms/{form?.slug || "…"}/submit</span>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="mt-6">
              {submissionsError ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submissionsError}</div>
              ) : null}

              {submissions === null ? (
                <div className="text-sm text-zinc-600">Loading responses…</div>
              ) : submissions.length === 0 ? (
                <div className="text-sm text-zinc-600">No responses yet.</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
                  <div className="overflow-hidden rounded-3xl border border-zinc-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-separate border-spacing-0">
                        <thead>
                          <tr className="bg-zinc-50">
                            <th className="whitespace-nowrap border-b border-zinc-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600">
                              Submitted
                            </th>
                            {(fields || []).slice(0, 6).map((f) => (
                              <th
                                key={f.name}
                                className="border-b border-zinc-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600"
                              >
                                {f.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {submissions.map((s) => {
                            const created = new Date(s.createdAt);
                            const createdLabel = Number.isNaN(created.getTime()) ? s.createdAt : created.toLocaleString();
                            return (
                              <tr
                                key={s.id}
                                className={classNames(
                                  "cursor-pointer",
                                  selectedSubmissionId === s.id ? "bg-blue-50" : "bg-white hover:bg-zinc-50",
                                )}
                                onClick={() => setSelectedSubmissionId(s.id)}
                              >
                                <td className="whitespace-nowrap border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-900">
                                  {createdLabel}
                                </td>
                                {(fields || []).slice(0, 6).map((f) => {
                                  const v = s?.dataJson && typeof s.dataJson === "object" ? (s.dataJson as any)[f.name] : undefined;
                                  const txt = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
                                  return (
                                    <td key={f.name} className="max-w-[260px] border-b border-zinc-100 px-4 py-3 text-sm text-zinc-700">
                                      <div className="truncate" title={txt}>
                                        {txt}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                    <div className="text-sm font-semibold text-brand-ink">Submission details</div>
                    {!selectedSubmission ? (
                      <div className="mt-2 text-sm text-zinc-600">Click a row to view.</div>
                    ) : (
                      <>
                        <div className="mt-2 text-xs text-zinc-600">ID: {selectedSubmission.id}</div>
                        <div className="mt-1 text-xs text-zinc-600">Created: {new Date(selectedSubmission.createdAt).toLocaleString()}</div>
                        {selectedSubmission.ip ? <div className="mt-1 text-xs text-zinc-600">IP: {selectedSubmission.ip}</div> : null}
                        {selectedSubmission.userAgent ? (
                          <div className="mt-1 text-xs text-zinc-600">User agent: {selectedSubmission.userAgent}</div>
                        ) : null}

                        <div className="mt-4 space-y-2">
                          {(fields || []).map((f) => {
                            const v = selectedSubmission?.dataJson && typeof selectedSubmission.dataJson === "object" ? (selectedSubmission.dataJson as any)[f.name] : undefined;
                            const txt = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
                            return (
                              <div key={f.name} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{f.label}</div>
                                <div className="mt-1 text-sm font-semibold text-zinc-900 break-words">{txt || "—"}</div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-4">
                          <button
                            type="button"
                            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                            onClick={() => {
                              void navigator.clipboard
                                .writeText(JSON.stringify(selectedSubmission.dataJson ?? {}, null, 2))
                                .catch(() => null);
                            }}
                          >
                            Copy JSON
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
