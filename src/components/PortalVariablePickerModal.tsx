"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

import type { TemplateVariable } from "@/lib/portalTemplateVars";

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function groupOrder(group: TemplateVariable["group"]) {
  switch (group) {
    case "Contact":
      return 10;
    case "Lead":
      return 20;
    case "Booking":
      return 25;
    case "Business":
      return 30;
    case "Owner":
      return 40;
    case "User":
      return 50;
    case "Message":
      return 60;
    case "Custom":
      return 70;
    default:
      return 999;
  }
}

export function PortalVariablePickerModal(props: {
  open: boolean;
  title?: string;
  subtitle?: string;
  variables: TemplateVariable[];
  onPick: (variableKey: string) => void;
  onClose: () => void;
  createCustom?: {
    enabled?: boolean;
    existingKeys?: string[];
    contactId?: string | null;
    allowContactPick?: boolean;
    onCreate?: (key: string, value: string, contactId: string) => void | Promise<void>;
  };
}) {
  const { open, title, subtitle, variables, onPick, onClose, createCustom } = props;
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"pick" | "create">("pick");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  const [createContacts, setCreateContacts] = useState<Array<{ id: string; name: string; email?: string | null; phone?: string | null }> | null>(null);
  const [createContactsLoading, setCreateContactsLoading] = useState(false);
  const [createContactQuery, setCreateContactQuery] = useState("");
  const [createContactId, setCreateContactId] = useState<string>("");
  const [localCreatedKeys, setLocalCreatedKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setMode("pick");
    setCreateError(null);
    setCreateBusy(false);
    setNewKey("");
    setNewValue("");
    setCreateContacts(null);
    setCreateContactsLoading(false);
    setCreateContactQuery("");
    setCreateContactId("");
    setLocalCreatedKeys([]);
  }, [open]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    setCreateError(null);
    if (mode === "pick") {
      setNewKey("");
      setNewValue("");
    }
  }, [mode, open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = Array.isArray(variables) ? variables : [];
    const sorted = base
      .slice()
      .sort((a, b) => groupOrder(a.group) - groupOrder(b.group) || a.label.localeCompare(b.label));

    if (!q) return sorted;
    return sorted.filter((v) => {
      const hay = `${v.label} ${v.key} ${v.group} ${v.appliesTo}`.toLowerCase();
      return hay.includes(q);
    });
  }, [variables, query]);

  const canCreateCustom = Boolean(createCustom?.enabled);
  const existingKeys = new Set(
    [...(createCustom?.existingKeys ?? []), ...(localCreatedKeys ?? [])]
      .filter((k) => typeof k === "string")
      .map((k) => k.trim())
      .filter(Boolean),
  );

  const createUsesDefaultContactSave = createCustom ? !createCustom.onCreate : false;
  const createNeedsContactPick =
    createUsesDefaultContactSave && Boolean(createCustom?.allowContactPick) && !String(createCustom?.contactId || "").trim();

  useEffect(() => {
    if (!open) return;
    if (mode !== "create") return;
    if (!canCreateCustom) return;
    if (!createNeedsContactPick) return;
    if (createContacts || createContactsLoading) return;

    let canceled = false;
    setCreateContactsLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/portal/people/contacts?take=50", { cache: "no-store" }).catch(() => null as any);
        const json = (await res?.json?.().catch(() => null)) as any;
        if (!res?.ok || !json?.ok || !Array.isArray(json?.contacts)) {
          if (!canceled) setCreateContacts([]);
          return;
        }

        const list = (json.contacts as any[])
          .map((c) => ({
            id: String(c?.id || "").trim(),
            name: String(c?.name || "").trim().slice(0, 80),
            email: c?.email ? String(c.email) : null,
            phone: c?.phone ? String(c.phone) : null,
          }))
          .filter((c) => c.id && c.name);

        if (!canceled) setCreateContacts(list);
      } catch {
        if (!canceled) setCreateContacts([]);
      } finally {
        if (!canceled) setCreateContactsLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [canCreateCustom, createContacts, createContactsLoading, createNeedsContactPick, mode, open]);

  const filteredCreateContacts = useMemo(() => {
    const base = Array.isArray(createContacts) ? createContacts : [];
    const q = String(createContactQuery || "").trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) => {
      const hay = `${c.name} ${c.email || ""} ${c.phone || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [createContactQuery, createContacts]);

  async function defaultCreateCustomVariable(key: string, value: string, contactId: string) {
    const res = await fetch(`/api/portal/people/contacts/${encodeURIComponent(contactId)}/custom-variables`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      throw new Error(typeof json?.error === "string" ? json.error : "Failed to create variable.");
    }
    const normalizedKey = String(json?.key || key).trim();
    if (normalizedKey) {
      setLocalCreatedKeys((prev) => {
        const set = new Set((prev ?? []).map((x) => String(x || "").trim()).filter(Boolean));
        set.add(normalizedKey);
        return Array.from(set).slice(0, 100);
      });
    }
    return normalizedKey || key;
  }

  async function tryCreateCustom() {
    if (!createCustom) return;
    if (createBusy) return;
    setCreateError(null);

    const key = newKey.trim();
    const value = String(newValue ?? "");

    const keyOk = /^[a-zA-Z][a-zA-Z0-9_]*$/;
    if (!key || !keyOk.test(key)) {
      setCreateError("Variable name must start with a letter and contain only letters, numbers, and underscores.");
      return;
    }
    if (existingKeys.has(key)) {
      setCreateError("That variable already exists.");
      return;
    }

    const contactIdFromProps = String(createCustom?.contactId || "").trim();
    const contactIdFromPick = String(createContactId || "").trim();
    const contactId = contactIdFromProps || contactIdFromPick;

    if (createUsesDefaultContactSave) {
      if (!contactId) {
        setCreateError(createNeedsContactPick ? "Pick a contact to save this variable." : "A contact is required to save variables.");
        return;
      }

      if (!String(value).trim()) {
        setCreateError("Value is required.");
        return;
      }
    }

    setCreateBusy(true);
    try {
      const createdKey = createCustom.onCreate
        ? (await createCustom.onCreate(key, value, contactId), key)
        : await defaultCreateCustomVariable(key, String(value).trim(), contactId);

      const insertKey = createUsesDefaultContactSave
        ? (createdKey.includes(".") ? createdKey : `contact.custom.${createdKey}`)
        : createdKey;
      onPick(insertKey);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create variable.";
      setCreateError(msg || "Failed to create variable.");
    } finally {
      setCreateBusy(false);
    }
  }

  if (!open) return null;
  if (!mounted) return null;

  const body = (
    <div className="fixed inset-0 z-8100" aria-hidden>
      <button type="button" className="absolute inset-0 bg-black/30" onMouseDown={onClose} aria-label="Close" />
      <div
        className={classNames(
          "fixed inset-0 z-8110 flex items-start justify-center px-4",
          "pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]",
          "sm:items-center",
        )}
        aria-modal
        role="dialog"
      >
        <div
          className={classNames(
            "flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl",
            "max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)]",
          )}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-zinc-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-900">{title || "Insert variable"}</div>
                <div className="mt-1 text-xs text-zinc-500">{subtitle || "Click to insert into your message."}</div>
              </div>
              <div className="flex items-center gap-2">
                {canCreateCustom ? (
                  mode === "pick" ? (
                    <button
                      type="button"
                      className="rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
                      onClick={() => setMode("create")}
                    >
                      New
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                      onClick={() => setMode("pick")}
                    >
                      Back
                    </button>
                  )
                ) : null}
                <button
                  type="button"
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {mode === "create" && canCreateCustom ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">New variable</div>
                <div className="mt-1 text-xs text-zinc-600">Create a custom variable and insert it immediately.</div>

                {createNeedsContactPick ? (
                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
                    <div className="text-xs font-semibold text-zinc-600">Contact</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
                      <div className="sm:col-span-7">
                        <input
                          value={createContactQuery}
                          onChange={(e) => setCreateContactQuery(e.target.value)}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                          placeholder="Search contacts…"
                        />
                      </div>
                      <div className="sm:col-span-5">
                        <select
                          value={createContactId}
                          onChange={(e) => setCreateContactId(e.target.value)}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                          disabled={createContactsLoading}
                        >
                          <option value="">{createContactsLoading ? "Loading…" : "Select a contact…"}</option>
                          {filteredCreateContacts.slice(0, 50).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.email ? ` • ${c.email}` : c.phone ? ` • ${c.phone}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-zinc-500">We save the value onto the selected contact.</div>
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-end">
                  <div className="sm:col-span-5">
                    <label className="text-xs font-semibold text-zinc-600">Name</label>
                    <input
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      placeholder="e.g. referralName"
                      autoComplete="off"
                      autoFocus
                    />
                    <div className="mt-1 text-[11px] text-zinc-500">
                      Inserts as{" "}
                      <span className="font-mono">
                        {createUsesDefaultContactSave
                          ? `{contact.custom.${newKey.trim() || "variable"}}`
                          : `{${newKey.trim() || "variable"}}`}
                      </span>
                    </div>
                  </div>

                  <div className="sm:col-span-6">
                    <label className="text-xs font-semibold text-zinc-600">Value</label>
                    <input
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      placeholder="Value"
                    />
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {createUsesDefaultContactSave ? "Saved on the selected contact." : ""}
                    </div>
                  </div>

                  <div className="sm:col-span-1">
                    <button
                      type="button"
                      onClick={tryCreateCustom}
                      disabled={createBusy}
                      className="w-full rounded-2xl bg-brand-ink px-3 py-3 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                    >
                      +
                    </button>
                  </div>
                </div>

                {createError ? <div className="mt-2 text-xs font-semibold text-red-700">{createError}</div> : null}
              </div>
            ) : (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search variables…"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  autoFocus
                />

                <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-2xl border border-zinc-100">
                  {filtered.length ? (
                    filtered.map((v) => (
                      <button
                        key={`${v.group}:${v.key}`}
                        type="button"
                        onClick={() => {
                          onPick(v.key);
                          onClose();
                        }}
                        className={classNames(
                          "flex w-full items-start justify-between gap-3 px-4 py-3 text-left",
                          "hover:bg-zinc-50",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">{v.label}</div>
                          <div className="mt-0.5 truncate text-xs text-zinc-500">
                            <span className="font-mono">{`{${v.key}}`}</span>
                            <span className="mx-2">·</span>
                            <span>{v.appliesTo}</span>
                          </div>
                        </div>
                        <div className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-700">
                          {v.group}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-sm text-zinc-600">No variables found.</div>
                  )}
                </div>

                <div className="mt-3 text-xs text-zinc-500">
                  Works in SMS, email, and task text. Unknown variables stay unchanged.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
