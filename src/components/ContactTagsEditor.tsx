"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CreateContactTagDialog } from "@/components/CreateContactTagDialog";
import LiquidGlassPopupSurface from "@/components/LiquidGlassPopupSurface";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { useToast } from "@/components/ToastProvider";
import { portalGlassButtonClass } from "@/components/portalGlass";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";
import { getReadableTagPillStyle } from "@/lib/tagColors.shared";

export type ContactTag = { id: string; name: string; color: string | null };

type TagsRes = { ok: true; tags: ContactTag[] } | { ok: false; error?: string };

type Props = {
  contactId: string | null;
  tags: ContactTag[];
  onChange?: (next: ContactTag[]) => void;
  disabled?: boolean;
  compact?: boolean;
  borderlessChips?: boolean;
};

const EMPTY_TAG_OPTION_VALUE = "";
const NEW_TAG_OPTION_VALUE = "__new_tag__";

const cachedContactTagDefsByVariant: Record<string, ContactTag[]> = {};
const cachedContactTagDefsPromiseByVariant: Record<string, Promise<ContactTag[]> | null> = {};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function normalizeContactTags(value: unknown): ContactTag[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => ({
      id: String((tag as any)?.id || ""),
      name: String((tag as any)?.name || "").trim().slice(0, 60),
      color: typeof (tag as any)?.color === "string" ? String((tag as any).color) : null,
    }))
    .filter((tag) => tag.id && tag.name);
}

function mergeUniqueTags(...collections: Array<ContactTag[] | null | undefined>) {
  const nextById = new Map<string, ContactTag>();
  for (const collection of collections) {
    for (const tag of collection || []) {
      if (!tag?.id || !tag.name) continue;
      nextById.set(tag.id, tag);
    }
  }
  return Array.from(nextById.values());
}

async function loadContactTagDefs(variant: string, headers: HeadersInit) {
  if (cachedContactTagDefsPromiseByVariant[variant]) return cachedContactTagDefsPromiseByVariant[variant];
  cachedContactTagDefsPromiseByVariant[variant] = (async () => {
    const res = await fetch("/api/portal/contact-tags", { cache: "no-store", headers }).catch(() => null as any);
    const json = (await res?.json().catch(() => null)) as TagsRes | null;
    if (res?.ok && json && (json as any).ok === true) {
      cachedContactTagDefsByVariant[variant] = normalizeContactTags((json as any).tags);
    }
    return cachedContactTagDefsByVariant[variant] || [];
  })().finally(() => {
    cachedContactTagDefsPromiseByVariant[variant] = null;
  });
  return cachedContactTagDefsPromiseByVariant[variant];
}

function pillStyle(color: string | null) {
  return getReadableTagPillStyle(color, { fallbackTone: "neutral" });
}

function popupPillStyle(color: string | null) {
  return getReadableTagPillStyle(color, { fallbackTone: "neutral" });
}

export function ContactTagsEditor(props: Props) {
  const { contactId, tags, onChange, disabled, compact, borderlessChips } = props;
  const pathname = usePathname();
  const toast = useToast();
  const portalVariant = String(pathname || "").startsWith("/credit") ? "credit" : "portal";
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: portalVariant }), [portalVariant]);

  const [open, setOpen] = useState(false);
  const [defs, setDefs] = useState<ContactTag[]>(() => mergeUniqueTags(cachedContactTagDefsByVariant[portalVariant], tags));
  const [saving, setSaving] = useState(false);
  const [draftTagIds, setDraftTagIds] = useState<string[]>([]);
  const [addTagValue, setAddTagValue] = useState(EMPTY_TAG_OPTION_VALUE);

  const [createTagOpen, setCreateTagOpen] = useState(false);

  const selectedIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);
  const draftSelectedIds = useMemo(() => new Set(draftTagIds), [draftTagIds]);
  const knownTagsById = useMemo(() => new Map([...defs, ...tags].map((tag) => [tag.id, tag] as const)), [defs, tags]);
  const selectedDraftTags = useMemo(
    () => draftTagIds.map((id) => knownTagsById.get(id)).filter(Boolean) as ContactTag[],
    [draftTagIds, knownTagsById],
  );
  const addableTagOptions = useMemo(
    () => [
      { value: EMPTY_TAG_OPTION_VALUE, label: "Select a tag…", disabled: true },
      ...defs.filter((tag) => !draftSelectedIds.has(tag.id)).map((tag) => ({ value: tag.id, label: tag.name })),
      { value: NEW_TAG_OPTION_VALUE, label: "New tag…" },
    ],
    [defs, draftSelectedIds],
  );

  useEffect(() => {
    setDefs((prev) => mergeUniqueTags(prev, tags, cachedContactTagDefsByVariant[portalVariant]));
  }, [portalVariant, tags]);

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;
    void (async () => {
      try {
        const nextDefs = await loadContactTagDefs(portalVariant, variantHeaders);
        if (cancelled) return;
        setDefs((prev) => mergeUniqueTags(prev, nextDefs, tags));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, portalVariant, tags, variantHeaders]);

  useEffect(() => {
    if (!open) return;
    setDraftTagIds(tags.map((tag) => tag.id));
    setAddTagValue(EMPTY_TAG_OPTION_VALUE);
  }, [open, tags]);

  async function persistTagChecked(tagId: string, nextChecked: boolean) {
    if (!contactId) throw new Error("Missing contact id.");
    const method = nextChecked ? "POST" : "DELETE";
    const res = await fetch(`/api/portal/contacts/${encodeURIComponent(contactId)}/tags`, {
      method,
      headers: { "content-type": "application/json", ...variantHeaders },
      body: JSON.stringify({ tagId }),
    }).catch(() => null as any);

    const json = (await res?.json().catch(() => null)) as any;
    if (res?.ok && json?.ok === true && Array.isArray(json.tags)) {
      return json.tags as ContactTag[];
    }
    throw new Error(String(json?.error || "Contact tags did not update. Retry here or review the selected tags again."));
  }

  async function saveDraftTags() {
    if (!contactId) return;
    setSaving(true);
    try {
      const toRemove = tags.map((tag) => tag.id).filter((tagId) => !draftSelectedIds.has(tagId));
      const toAdd = draftTagIds.filter((tagId) => !selectedIds.has(tagId));

      let nextTags = selectedDraftTags;
      for (const tagId of toRemove) {
        nextTags = await persistTagChecked(tagId, false);
      }
      for (const tagId of toAdd) {
        nextTags = await persistTagChecked(tagId, true);
      }

      onChange?.(nextTags);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Contact tags did not save. Retry here or review the selected tags again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={classNames(compact ? "" : "")}> 
      <div className={classNames("flex flex-wrap items-center gap-2", compact ? "" : "")}> 
        {tags.length ? (
          tags.map((t) => (
            <span
              key={t.id}
              className={classNames(
                borderlessChips
                  ? "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                  : "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
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
        <div
          className={classNames(
            "fixed inset-0 z-130100 flex items-start justify-center bg-black/30 px-4",
            "pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]",
            "sm:items-center",
          )}
          onMouseDown={() => setOpen(false)}
        >
          <LiquidGlassPopupSurface
            className={classNames(
              "relative flex w-full max-w-lg flex-col overflow-hidden rounded-4xl p-5 shadow-xl",
              "max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)]",
            )}
            onMouseDown={(e) => e.stopPropagation()}
            overlayClassName="border-transparent bg-[rgba(255,255,255,0.54)] shadow-[0_24px_64px_rgba(15,23,42,0.16)] backdrop-blur-[28px]"
            showGlass={false}
            showTopGlow={false}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Edit tags</div>
              </div>
              <button
                type="button"
                className={classNames(
                  portalGlassButtonClass,
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full border border-white/70 bg-white/75 text-zinc-500 shadow-[0_10px_24px_rgba(15,23,42,0.1)] hover:bg-white hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/30",
                )}
                onClick={() => setOpen(false)}
                aria-label="Close"
                title="Close"
              >
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <div>
                <div className="text-xs font-semibold text-zinc-600">Selected tags</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedDraftTags.length ? (
                    selectedDraftTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
                        style={popupPillStyle(tag.color)}
                        onClick={() => setDraftTagIds((prev) => prev.filter((id) => id !== tag.id))}
                        title={`Remove ${tag.name}`}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color || "#e4e4e7" }} />
                        {tag.name}
                        <span className="text-current/60">×</span>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-3xl border border-dashed border-white/60 bg-white/30 px-3 py-3 text-sm text-zinc-600">No tags selected.</div>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-semibold text-zinc-600">Add tag</label>
                <PortalListboxDropdown
                  className="mt-1"
                  value={addTagValue}
                  options={addableTagOptions}
                  onChange={(next) => {
                    if (!next || next === EMPTY_TAG_OPTION_VALUE) {
                      setAddTagValue(EMPTY_TAG_OPTION_VALUE);
                      return;
                    }
                    if (next === NEW_TAG_OPTION_VALUE) {
                      setCreateTagOpen(true);
                      setAddTagValue(EMPTY_TAG_OPTION_VALUE);
                      return;
                    }
                    setDraftTagIds((prev) => (prev.includes(next) ? prev : [...prev, next]));
                    setAddTagValue(EMPTY_TAG_OPTION_VALUE);
                  }}
                  placeholder="Select a tag…"
                />
              </div>

              <CreateContactTagDialog
                open={createTagOpen}
                onClose={() => setCreateTagOpen(false)}
                onCreate={async (name, color) => {
                  const res = await fetch("/api/portal/contact-tags", {
                    method: "POST",
                    headers: { "content-type": "application/json", ...variantHeaders },
                    body: JSON.stringify({ name, color }),
                  }).catch(() => null as any);

                  const json = (await res?.json().catch(() => null)) as any;
                  if (!res?.ok || !json?.ok || !json.tag?.id) {
                    throw new Error(String(json?.error || "Tag creation did not finish. Retry here or choose a different tag name."));
                  }
                  return json.tag as ContactTag;
                }}
                onCreated={(nextTag) => {
                  cachedContactTagDefsByVariant[portalVariant] = mergeUniqueTags([nextTag], cachedContactTagDefsByVariant[portalVariant]);
                  setDefs((prev) => {
                    const existing = prev.some((tag) => tag.id === nextTag.id);
                    return existing ? prev : [nextTag, ...prev];
                  });
                  setDraftTagIds((prev) => (prev.includes(nextTag.id) ? prev : [...prev, nextTag.id]));
                  setAddTagValue(EMPTY_TAG_OPTION_VALUE);
                }}
              />

            </div>

            <div className="mt-5 flex items-center justify-end">
              <button
                type="button"
                className="rounded-full bg-brand-blue/10 px-4 py-2 text-sm font-semibold text-(--color-brand-blue) transition hover:bg-brand-blue/15 focus-visible:outline-none disabled:opacity-60"
                onClick={() => void saveDraftTags()}
                disabled={saving || !contactId}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </LiquidGlassPopupSurface>
        </div>
      ) : null}
    </div>
  );
}
