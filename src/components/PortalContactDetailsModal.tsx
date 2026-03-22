"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { PortalSelectDropdown } from "@/components/PortalSelectDropdown";
import { useToast } from "@/components/ToastProvider";
import { normalizePortalContactCustomVarKey } from "@/lib/portalTemplateVars";
import { DEFAULT_TAG_COLORS } from "@/lib/tagColors.shared";

type ContactTag = { id: string; name: string; color: string | null };

type ContactDetail = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  customVariables?: Record<string, string> | null;
  createdAtIso?: string | null;
  updatedAtIso?: string | null;
};

type CustomVarRow = { key: string; value: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function rowsFromCustomVariables(input: unknown): CustomVarRow[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  return Object.entries(input as Record<string, unknown>)
    .map(([key, value]) => ({
      key: String(key || ""),
      value: typeof value === "string" ? value : String(value ?? ""),
    }))
    .filter((r) => r.key.trim())
    .slice(0, 25);
}

function customVariablesFromRows(rows: CustomVarRow[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = String(row.key || "").trim().slice(0, 60);
    if (!key) continue;
    const value = String(row.value ?? "").trim().slice(0, 300);
    if (!value) continue;
    const stableKey = key.toLowerCase();
    if (out[stableKey] !== undefined) continue;
    out[stableKey] = value;
  }
  return Object.keys(out).length ? out : null;
}

function mergeRowsWithKnownKeys(existing: CustomVarRow[], knownKeys: string[]): CustomVarRow[] {
  const out: CustomVarRow[] = [];
  const seen = new Set<string>();

  for (const r of existing || []) {
    const key = String(r?.key ?? "").trim();
    if (!key) continue;
    const stable = key.toLowerCase();
    if (seen.has(stable)) continue;
    seen.add(stable);
    out.push({ key, value: String(r?.value ?? "") });
    if (out.length >= 25) return out;
  }

  for (const k of knownKeys || []) {
    const key = String(k ?? "").trim();
    if (!key) continue;
    const stable = key.toLowerCase();
    if (seen.has(stable)) continue;
    seen.add(stable);
    out.push({ key, value: "" });
    if (out.length >= 25) return out;
  }

  return out;
}

function stableContactEditSignature(input: {
  name: string;
  email: string;
  phone: string;
  customVariables: Record<string, string> | null;
}) {
  const sortedCustomVariables = Object.fromEntries(
    Object.entries(input.customVariables || {})
      .map(([k, v]) => [String(k || "").toLowerCase(), String(v ?? "").trim()] as const)
      .filter(([k, v]) => k.trim() && v)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify({
    name: String(input.name || "").trim(),
    email: String(input.email || "").trim(),
    phone: String(input.phone || "").trim(),
    customVariables: sortedCustomVariables,
  });
}

async function readJson(res: Response) {
  return (await res.json().catch(() => ({}))) as any;
}

type Props = {
  open: boolean;
  contactId: string | null;
  onClose: () => void;
  onContactUpdated?: (next: {
    contact: { id: string; name: string; email: string | null; phone: string | null } | null;
    tags: ContactTag[];
  }) => void;
  zIndex?: number;
};

export function PortalContactDetailsModal(props: Props) {
  const { open, contactId, onClose, onContactUpdated, zIndex } = props;
  const toast = useToast();

  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ContactDetail | null>(null);

  const [knownCustomVarKeys, setKnownCustomVarKeys] = useState<string[]>([]);

  const [ownerTags, setOwnerTags] = useState<ContactTag[]>([]);
  const [detailTags, setDetailTags] = useState<ContactTag[]>([]);
  const [tagBusyId, setTagBusyId] = useState<string | null>(null);

  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createTagName, setCreateTagName] = useState("");
  const [createTagColor, setCreateTagColor] = useState<(typeof DEFAULT_TAG_COLORS)[number]>("#2563EB");
  const [createTagBusy, setCreateTagBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCustomVarRows, setEditCustomVarRows] = useState<CustomVarRow[]>([]);
  const [saving, setSaving] = useState(false);

  const lastSavedEditSigRef = useRef<string>("");
  const editSig = useMemo(
    () =>
      stableContactEditSignature({
        name: editName,
        email: editEmail,
        phone: editPhone,
        customVariables: customVariablesFromRows(editCustomVarRows),
      }),
    [editCustomVarRows, editEmail, editName, editPhone],
  );
  const editDirty = editing && editSig !== lastSavedEditSigRef.current;

  const addableOwnerTagOptions = useMemo(() => {
    const existing = new Set(detailTags.map((t) => t.id));
    return ownerTags.filter((t) => !existing.has(t.id));
  }, [detailTags, ownerTags]);

  useEffect(() => {
    if (!open) return;
    if (!contactId) return;

    const stableContactId = contactId;

    let cancelled = false;

    async function loadAll() {
      setDetailLoading(true);
      setDetail(null);
      setEditing(false);
      setCreateTagOpen(false);
      setCreateTagName("");

      let nextKnownCustomVarKeys: string[] = [];
      let nextDetailTags: ContactTag[] = [];

      try {
        const [keysRes, tagsRes, ownerTagsRes, detailRes] = await Promise.all([
          fetch("/api/portal/people/contacts/custom-variable-keys", { cache: "no-store" }).catch(() => null as any),
          fetch(`/api/portal/contacts/${encodeURIComponent(stableContactId)}/tags`, { cache: "no-store" }).catch(() => null as any),
          fetch("/api/portal/contact-tags", { cache: "no-store" }).catch(() => null as any),
          fetch(`/api/portal/contacts/${encodeURIComponent(stableContactId)}`, { cache: "no-store" }).catch(() => null as any),
        ]);

        if (cancelled) return;

        if (keysRes?.ok) {
          const json = (await keysRes.json().catch(() => ({}))) as any;
          if (json?.ok && Array.isArray(json.keys)) {
            nextKnownCustomVarKeys = json.keys
              .map((k: any) => String(k || "").trim())
              .filter(Boolean)
              .slice(0, 50);
            setKnownCustomVarKeys(nextKnownCustomVarKeys);
          }
        }

        if (ownerTagsRes?.ok) {
          const json = (await ownerTagsRes.json().catch(() => ({}))) as any;
          if (json?.ok && Array.isArray(json.tags)) {
            setOwnerTags(
              json.tags
                .map((t: any) => ({
                  id: String(t?.id || ""),
                  name: String(t?.name || "").slice(0, 60),
                  color: typeof t?.color === "string" ? String(t.color) : null,
                }))
                .filter((t: ContactTag) => t.id && t.name),
            );
          }
        }

        if (tagsRes?.ok) {
          const json = (await tagsRes.json().catch(() => ({}))) as any;
          if (json?.ok && Array.isArray(json.tags)) {
            nextDetailTags = json.tags
              .map((t: any) => ({
                id: String(t?.id || ""),
                name: String(t?.name || "").slice(0, 60),
                color: typeof t?.color === "string" ? String(t.color) : null,
              }))
              .filter((t: ContactTag) => t.id && t.name);
            setDetailTags(nextDetailTags);
          }
        }

        if (!detailRes?.ok) {
          const json = await readJson(detailRes as any);
          throw new Error(String(json?.error || "Failed to load contact"));
        }

        const json = (await detailRes.json().catch(() => ({}))) as any;
        if (!json?.ok || !json?.contact?.id) {
          throw new Error(String(json?.error || "Failed to load contact"));
        }

        const nextDetail: ContactDetail = {
          id: String(json.contact.id),
          name: String(json.contact.name || ""),
          email: json.contact.email ? String(json.contact.email) : null,
          phone: json.contact.phone ? String(json.contact.phone) : null,
          customVariables: json.contact.customVariables && typeof json.contact.customVariables === "object" ? json.contact.customVariables : null,
          createdAtIso: typeof json.contact.createdAtIso === "string" ? json.contact.createdAtIso : null,
          updatedAtIso: typeof json.contact.updatedAtIso === "string" ? json.contact.updatedAtIso : null,
        };

        setDetail(nextDetail);
        setEditName(nextDetail.name);
        setEditEmail(nextDetail.email || "");
        setEditPhone(nextDetail.phone || "");
        const nextRows = mergeRowsWithKnownKeys(rowsFromCustomVariables(nextDetail.customVariables), nextKnownCustomVarKeys);
        setEditCustomVarRows(nextRows);
        lastSavedEditSigRef.current = stableContactEditSignature({
          name: nextDetail.name,
          email: nextDetail.email || "",
          phone: nextDetail.phone || "",
          customVariables: customVariablesFromRows(nextRows),
        });

        onContactUpdated?.({
          contact: {
            id: nextDetail.id,
            name: nextDetail.name,
            email: nextDetail.email,
            phone: nextDetail.phone,
          },
          tags: nextDetailTags,
        });
      } catch (e: any) {
        toast.error(String(e?.message || "Failed to load contact"));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadAll();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contactId]);

  useEffect(() => {
    if (!open) return;
    if (!editing) return;
    setEditCustomVarRows((prev) => mergeRowsWithKnownKeys(prev, knownCustomVarKeys));
  }, [editing, knownCustomVarKeys, open]);

  async function saveEdits() {
    if (!contactId) return;

    const name = editName.trim().slice(0, 80);
    if (!name) {
      toast.error("Name is required");
      return;
    }

    const customVariables = customVariablesFromRows(editCustomVarRows);
    const nextSig = stableContactEditSignature({ name, email: editEmail, phone: editPhone, customVariables });

    setSaving(true);
    try {
      const res = await fetch(`/api/portal/contacts/${encodeURIComponent(contactId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email: editEmail, phone: editPhone, customVariables }),
      });
      const json = await readJson(res);
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to save"));

      toast.success("Contact updated.");
  lastSavedEditSigRef.current = nextSig;

      // Refresh detail so parent callers can update names in-place.
      const refreshed = await fetch(`/api/portal/contacts/${encodeURIComponent(contactId)}`, { cache: "no-store" });
      const rjson = await readJson(refreshed);
      if (refreshed.ok && rjson?.ok && rjson?.contact?.id) {
        const next: ContactDetail = {
          id: String(rjson.contact.id),
          name: String(rjson.contact.name || ""),
          email: rjson.contact.email ? String(rjson.contact.email) : null,
          phone: rjson.contact.phone ? String(rjson.contact.phone) : null,
          customVariables:
            rjson.contact.customVariables && typeof rjson.contact.customVariables === "object" ? rjson.contact.customVariables : null,
          createdAtIso: typeof rjson.contact.createdAtIso === "string" ? rjson.contact.createdAtIso : null,
          updatedAtIso: typeof rjson.contact.updatedAtIso === "string" ? rjson.contact.updatedAtIso : null,
        };
        setDetail(next);
        setEditName(next.name);
        setEditEmail(next.email || "");
        setEditPhone(next.phone || "");
        const nextRows = mergeRowsWithKnownKeys(rowsFromCustomVariables(next.customVariables), knownCustomVarKeys);
        setEditCustomVarRows(nextRows);
        lastSavedEditSigRef.current = stableContactEditSignature({
          name: next.name,
          email: next.email || "",
          phone: next.phone || "",
          customVariables: customVariablesFromRows(nextRows),
        });
        onContactUpdated?.({
          contact: { id: next.id, name: next.name, email: next.email, phone: next.phone },
          tags: detailTags,
        });
      }
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  async function setTagChecked(tagId: string, nextChecked: boolean) {
    if (!contactId) return;
    setTagBusyId(tagId);
    try {
      const method = nextChecked ? "POST" : "DELETE";
      const res = await fetch(`/api/portal/contacts/${encodeURIComponent(contactId)}/tags`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      const json = await readJson(res);
      if (!res.ok || !json?.ok || !Array.isArray(json?.tags)) throw new Error(String(json?.error || "Failed to update tags"));

      const nextTags: ContactTag[] = json.tags
        .map((t: any) => ({
          id: String(t?.id || ""),
          name: String(t?.name || "").slice(0, 60),
          color: typeof t?.color === "string" ? String(t.color) : null,
        }))
        .filter((t: ContactTag) => t.id && t.name);

      setDetailTags(nextTags);
      onContactUpdated?.({
        contact: detail ? { id: detail.id, name: detail.name, email: detail.email, phone: detail.phone } : null,
        tags: nextTags,
      });
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to update tags"));
    } finally {
      setTagBusyId(null);
    }
  }

  async function createOwnerTag() {
    if (!contactId) return;

    const name = createTagName.trim().slice(0, 60);
    if (!name) {
      toast.error("Enter a tag name");
      return;
    }

    setCreateTagBusy(true);
    try {
      const res = await fetch("/api/portal/contact-tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color: createTagColor }),
      });
      const json = await readJson(res);
      if (!res.ok || !json?.ok || !json?.tag?.id) throw new Error(String(json?.error || "Failed to create tag"));

      const created: ContactTag = {
        id: String(json.tag.id),
        name: String(json.tag.name || name).slice(0, 60),
        color: typeof json.tag.color === "string" ? String(json.tag.color) : null,
      };

      setOwnerTags((prev) => {
        const next = [...prev.filter((t) => t.id !== created.id), created];
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });

      setCreateTagName("");
      setCreateTagColor("#2563EB");
      setCreateTagOpen(false);

      await setTagChecked(created.id, true);
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to create tag"));
    } finally {
      setCreateTagBusy(false);
    }
  }

  if (!open || !contactId) return null;

  return (
    <div
      className={classNames(
        "fixed inset-0 z-8000 flex items-start justify-center bg-black/40 px-4",
        "pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]",
        "sm:items-center",
      )}
      style={{ zIndex: Number.isFinite(zIndex as number) ? (zIndex as number) : undefined }}
      onMouseDown={onClose}
    >
      <div
        className={classNames(
          "flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl",
          "max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)]",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-zinc-100 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-zinc-900">Contact details</div>
              <div className="mt-1 text-xs text-zinc-500">Click outside to close.</div>
            </div>
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {detailLoading ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">Loading…</div>
          ) : null}

          <div className={classNames("grid grid-cols-1 gap-4 sm:grid-cols-2", detailLoading ? "mt-6" : "")}>
          <div className="rounded-2xl border border-zinc-200 p-4">
            <div className="text-xs font-semibold text-zinc-600">Name</div>
            {editing ? (
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-(--color-brand-blue)"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Full name"
                maxLength={80}
              />
            ) : (
              <div className="mt-1 text-sm font-semibold text-zinc-900">{detail?.name ?? "N/A"}</div>
            )}

            <div className="mt-3 text-xs font-semibold text-zinc-600">Email</div>
            {editing ? (
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-(--color-brand-blue)"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="email@company.com"
                maxLength={120}
              />
            ) : (
              <div className="mt-1 text-sm text-zinc-800">{detail?.email ?? "N/A"}</div>
            )}

            <div className="mt-3 text-xs font-semibold text-zinc-600">Phone</div>
            {editing ? (
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-(--color-brand-blue)"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+15551234567"
                maxLength={40}
              />
            ) : (
              <div className="mt-1 text-sm text-zinc-800">{detail?.phone ?? "N/A"}</div>
            )}

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Template variables</div>
              <div className="mt-2 space-y-1 text-xs text-zinc-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-600">Name</span>
                  <span className="rounded-lg border border-zinc-200 bg-white px-2 py-1 font-mono">{"{contact.name}"}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-600">Email</span>
                  <span className="rounded-lg border border-zinc-200 bg-white px-2 py-1 font-mono">{"{contact.email}"}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-600">Phone</span>
                  <span className="rounded-lg border border-zinc-200 bg-white px-2 py-1 font-mono">{"{contact.phone}"}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs font-semibold text-zinc-600">Custom variables</div>
            {editing ? (
              <div className="mt-2 space-y-2">
                {editCustomVarRows.length ? (
                  editCustomVarRows.map((row, idx) => (
                    <div key={`${idx}-${row.key}`} className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                      <input
                        className="sm:col-span-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-(--color-brand-blue)"
                        value={row.key}
                        onChange={(e) =>
                          setEditCustomVarRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], key: e.target.value };
                            return next;
                          })
                        }
                        placeholder="key (e.g. city)"
                      />
                      <input
                        className="sm:col-span-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-(--color-brand-blue)"
                        value={row.value}
                        onChange={(e) =>
                          setEditCustomVarRows((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], value: e.target.value };
                            return next;
                          })
                        }
                        placeholder="value"
                      />
                      <div className="sm:col-span-5 flex justify-end">
                        <button
                          type="button"
                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                          onClick={() => setEditCustomVarRows((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-zinc-600">None yet.</div>
                )}

                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                  onClick={() => setEditCustomVarRows((prev) => [...prev, { key: "", value: "" }].slice(0, 25))}
                >
                  Add variable
                </button>
                <div className="text-xs text-zinc-500">Use in templates as `contact.custom.&lt;key&gt;`.</div>
              </div>
            ) : (
              <div className="mt-2">
                {detail?.customVariables && Object.keys(detail.customVariables).length ? (
                  <div className="space-y-1">
                    {Object.entries(detail.customVariables)
                      .slice(0, 8)
                      .map(([k, v]) => (
                        <div key={k} className="text-sm text-zinc-800">
                          <span className="font-semibold">{k}:</span> {String(v)}
                          <div className="mt-0.5 break-all text-xs text-zinc-500">
                            <span className="font-mono">{"{contact.custom."}{normalizePortalContactCustomVarKey(k)}{"}"}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-600">None.</div>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="ml-auto flex items-center gap-2">
                {!editing ? (
                  <button
                    type="button"
                    className="rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
                    onClick={() => {
                      if (!detail) return;
                      lastSavedEditSigRef.current = stableContactEditSignature({
                        name: detail.name,
                        email: detail.email || "",
                        phone: detail.phone || "",
                        customVariables: customVariablesFromRows(
                          mergeRowsWithKnownKeys(rowsFromCustomVariables(detail.customVariables), knownCustomVarKeys),
                        ),
                      });
                      setEditing(true);
                    }}
                    disabled={!detail}
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={() => {
                        setEditing(false);
                        setEditName(detail?.name ?? "");
                        setEditEmail(detail?.email ?? "");
                        setEditPhone(detail?.phone ?? "");
                        setEditCustomVarRows(mergeRowsWithKnownKeys(rowsFromCustomVariables(detail?.customVariables), knownCustomVarKeys));
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      onClick={() => void saveEdits()}
                      disabled={saving || !editDirty}
                    >
                      {saving ? "Saving…" : editDirty ? "Save" : "Saved"}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              Created: {detail?.createdAtIso ? new Date(detail.createdAtIso).toLocaleString() : "N/A"}
              {detail?.updatedAtIso ? ` • Updated: ${new Date(detail.updatedAtIso).toLocaleString()}` : ""}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Tags</div>
                <div className="mt-1 text-xs text-zinc-500">Apply tags for automations + segmentation.</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {detailTags.length ? (
                detailTags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={tagBusyId === t.id}
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                    title="Remove tag"
                    onClick={() => void setTagChecked(t.id, false)}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color || "#e4e4e7" }} />
                    {t.name}
                    <span className="text-zinc-400">×</span>
                  </button>
                ))
              ) : (
                <div className="text-sm text-zinc-600">No tags yet.</div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-600">Add existing tag</label>
                <div className="mt-1">
                  <PortalSelectDropdown<string>
                    value={""}
                    onChange={(tagId) => {
                      if (!tagId) return;
                      if (tagId === "__new_tag__") {
                        setCreateTagOpen(true);
                        return;
                      }
                      void setTagChecked(tagId, true);
                    }}
                    disabled={!contactId}
                    options={[
                      { value: "", label: "Select a tag…", disabled: true },
                      ...addableOwnerTagOptions.map((t) => ({ value: t.id, label: t.name })),
                      { value: "__new_tag__", label: "New tag…" },
                    ]}
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none hover:bg-zinc-50 focus:border-[color:var(--color-brand-blue)]"
                  />
                </div>
              </div>

              {createTagOpen ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs font-semibold text-zinc-600">Create new tag</div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      className="sm:col-span-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--color-brand-blue)"
                      placeholder="Tag name"
                      value={createTagName}
                      onChange={(e) => setCreateTagName(e.target.value)}
                      autoFocus
                    />
                    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2 py-2">
                      {DEFAULT_TAG_COLORS.slice(0, 10).map((c) => {
                        const selected = c === createTagColor;
                        return (
                          <button
                            key={c}
                            type="button"
                            className={classNames(
                              "h-6 w-6 rounded-full border",
                              selected ? "border-zinc-900 ring-2 ring-zinc-900/20" : "border-zinc-200",
                            )}
                            style={{ backgroundColor: c }}
                            onClick={() => setCreateTagColor(c)}
                            title={c}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => {
                        setCreateTagOpen(false);
                        setCreateTagName("");
                        setCreateTagColor("#2563EB");
                      }}
                      disabled={createTagBusy}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                      disabled={createTagBusy}
                      onClick={() => void createOwnerTag()}
                    >
                      {createTagBusy ? "Creating…" : "Create"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
