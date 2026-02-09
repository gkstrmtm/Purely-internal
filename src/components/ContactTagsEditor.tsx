"use client";

import { useEffect, useMemo, useState } from "react";

export type ContactTag = { id: string; name: string; color: string | null };

type TagsRes = { ok: true; tags: ContactTag[] } | { ok: false; error?: string };

type Props = {
  contactId: string | null;
  tags: ContactTag[];
  onChange?: (next: ContactTag[]) => void;
  disabled?: boolean;
  compact?: boolean;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function pillStyle(color: string | null) {
  const bg = color ? `${color}20` : "#0f172a12";
  const border = color ? `${color}40` : "#0f172a22";
  const text = color || "#0f172a";
  return { backgroundColor: bg, borderColor: border, color: text } as const;
}

export function ContactTagsEditor(props: Props) {
  const { contactId, tags, onChange, disabled, compact } = props;

  const [open, setOpen] = useState(false);
  const [defs, setDefs] = useState<ContactTag[]>([]);
  const [loadingDefs, setLoadingDefs] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#2563EB");

  const selectedIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);

  async function refreshDefs() {
    setLoadingDefs(true);
    const res = await fetch("/api/portal/contact-tags", { cache: "no-store" }).catch(() => null as any);
    const json = (await res?.json().catch(() => null)) as TagsRes | null;
    if (res?.ok && json && (json as any).ok === true) {
      setDefs((json as any).tags || []);
    }
    setLoadingDefs(false);
  }

  useEffect(() => {
    if (!open) return;
    void refreshDefs();
  }, [open]);

  async function setChecked(tagId: string, nextChecked: boolean) {
    if (!contactId) return;

    const method = nextChecked ? "POST" : "DELETE";
    const res = await fetch(`/api/portal/contacts/${encodeURIComponent(contactId)}/tags`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tagId }),
    }).catch(() => null as any);

    const json = (await res?.json().catch(() => null)) as any;
    if (res?.ok && json?.ok === true && Array.isArray(json.tags)) {
      onChange?.(json.tags);
    }
  }

  async function createAndAssign() {
    if (!contactId) return;
    const name = newName.trim().slice(0, 60);
    if (!name) return;

    setCreating(true);

    const res = await fetch("/api/portal/contact-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, color: newColor }),
    }).catch(() => null as any);

    const json = (await res?.json().catch(() => null)) as any;
    if (res?.ok && json?.ok === true && json.tag?.id) {
      await setChecked(String(json.tag.id), true);
      await refreshDefs();
      setNewName("");
    }

    setCreating(false);
  }

  return (
    <div className={classNames(compact ? "" : "")}> 
      <div className={classNames("flex flex-wrap items-center gap-2", compact ? "" : "")}> 
        {tags.length ? (
          tags.map((t) => (
            <span
              key={t.id}
              className={classNames(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
                disabled ? "opacity-70" : "",
              )}
              style={pillStyle(t.color)}
              title={t.name}
            >
              {t.name}
            </span>
          ))
        ) : (
          <span className="text-xs text-zinc-500">No tags</span>
        )}

        <button
          type="button"
          className={classNames(
            "rounded-xl border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-zinc-50",
            disabled || !contactId ? "opacity-50" : "",
          )}
          onClick={() => setOpen(true)}
          disabled={disabled || !contactId}
        >
          Edit tags
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => setOpen(false)}>
          <div
            className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Contact tags</div>
                <div className="mt-1 text-sm text-zinc-600">Apply color tags to this contact (idempotent).</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-zinc-700">Available tags</div>
              <div className="mt-2 max-h-[260px] space-y-2 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                {loadingDefs ? (
                  <div className="text-sm text-zinc-600">Loading…</div>
                ) : defs.length ? (
                  defs.map((t) => {
                    const checked = selectedIds.has(t.id);
                    return (
                      <label key={t.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={checked}
                          onChange={(e) => void setChecked(t.id, e.target.checked)}
                        />
                        <span className="inline-flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: t.color || "#0f172a", borderColor: t.color || "#0f172a" }} />
                          <span className="font-medium text-zinc-900">{t.name}</span>
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <div className="text-sm text-zinc-600">No tags created yet.</div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="text-xs font-semibold text-zinc-700">Create a new tag</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Tag name (e.g., Hot lead)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <input
                  className="h-10 w-12 rounded-xl border border-zinc-200 bg-white"
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  title="Pick color"
                />
                <button
                  type="button"
                  className={classNames(
                    "rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800",
                    creating ? "opacity-60" : "",
                  )}
                  onClick={() => void createAndAssign()}
                  disabled={creating}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
