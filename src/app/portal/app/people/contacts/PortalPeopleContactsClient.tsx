"use client";

import { useEffect, useMemo, useState } from "react";

import { PortalPeopleTabs } from "@/app/portal/app/people/PortalPeopleTabs";
import { useToast } from "@/components/ToastProvider";
import { DEFAULT_TAG_COLORS } from "@/lib/tagColors.shared";

type ContactTag = { id: string; name: string; color: string | null };

type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAtIso: string | null;
  updatedAtIso: string | null;
  tags: ContactTag[];
};

type LeadRow = {
  id: string;
  businessName: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  createdAtIso: string | null;
  assignedToUserId: string | null;
};

type ContactsPayload = {
  ok: true;
  contacts: ContactRow[];
  unlinkedLeads: LeadRow[];
  totalContacts?: number;
  totalUnlinkedLeads?: number;
  contactsNextCursor?: string | null;
  unlinkedLeadsNextCursor?: string | null;
};

type ContactDetailPayload = {
  ok: true;
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    createdAtIso: string;
    updatedAtIso: string;
    leads: Array<{
      id: string;
      businessName: string;
      phone: string;
      website: string | null;
      niche: string | null;
      location: string | null;
      source: string | null;
      kind: string | null;
      createdAtIso: string;
      assignedToUserId: string | null;
    }>;
    inboxThreads: Array<{
      id: string;
      channel: string;
      peerAddress: string;
      subject: string | null;
      lastMessageAtIso: string;
      lastMessagePreview: string;
    }>;
    bookings: Array<{
      id: string;
      siteTitle: string | null;
      startAtIso: string;
      endAtIso: string;
      status: string;
      createdAtIso: string;
    }>;
    reviews: Array<{
      id: string;
      rating: number;
      body: string | null;
      archivedAtIso: string | null;
      createdAtIso: string;
    }>;
  };
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export function PortalPeopleContactsClient() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ContactsPayload | null>(null);
  const [q, setQ] = useState("");

  const [contactsCursor, setContactsCursor] = useState<string | null>(null);
  const [leadsCursor, setLeadsCursor] = useState<string | null>(null);
  const [contactsNextCursor, setContactsNextCursor] = useState<string | null>(null);
  const [leadsNextCursor, setLeadsNextCursor] = useState<string | null>(null);

  const [contactsCursorStack, setContactsCursorStack] = useState<Array<string | null>>([null]);
  const [leadsCursorStack, setLeadsCursorStack] = useState<Array<string | null>>([null]);

  const [ownerTags, setOwnerTags] = useState<ContactTag[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ContactDetailPayload["contact"] | null>(null);
  const [detailTags, setDetailTags] = useState<ContactTag[]>([]);
  const [tagBusyId, setTagBusyId] = useState<string | null>(null);
  const [createTagName, setCreateTagName] = useState("");
  const [createTagColor, setCreateTagColor] = useState<(typeof DEFAULT_TAG_COLORS)[number]>("#2563EB");
  const [createTagBusy, setCreateTagBusy] = useState(false);

  const [editingContact, setEditingContact] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [leadBusinessName, setLeadBusinessName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadWebsite, setLeadWebsite] = useState("");
  const [leadLinkContactId, setLeadLinkContactId] = useState<string>("");
  const [savingLead, setSavingLead] = useState(false);

  useEffect(() => {
    function isTypingTarget(el: Element | null) {
      if (!el) return false;
      const tag = (el as HTMLElement).tagName?.toLowerCase?.() ?? "";
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if ((el as HTMLElement).isContentEditable) return true;
      return false;
    }

    async function contactsBack() {
      if (contactsCursorStack.length <= 1) return;
      const prev = contactsCursorStack[contactsCursorStack.length - 2] ?? null;
      const ok = await load({ contactsCursor: prev, leadsCursor });
      if (ok) setContactsCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    }

    async function contactsNext() {
      if (!contactsNextCursor) return;
      const ok = await load({ contactsCursor: contactsNextCursor, leadsCursor });
      if (ok) setContactsCursorStack((s) => [...s, contactsNextCursor]);
    }

    async function leadsBack() {
      if (leadsCursorStack.length <= 1) return;
      const prev = leadsCursorStack[leadsCursorStack.length - 2] ?? null;
      const ok = await load({ contactsCursor, leadsCursor: prev });
      if (ok) setLeadsCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    }

    async function leadsNext() {
      if (!leadsNextCursor) return;
      const ok = await load({ contactsCursor, leadsCursor: leadsNextCursor });
      if (ok) setLeadsCursorStack((s) => [...s, leadsNextCursor]);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (detailOpen || leadModalOpen) return;
      if (loading) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(document.activeElement)) return;

      // Contacts: [ back, ] next
      if (e.key === "[") {
        e.preventDefault();
        void contactsBack();
        return;
      }
      if (e.key === "]") {
        e.preventDefault();
        void contactsNext();
        return;
      }

      // Unlinked leads: { back, } next
      if (e.key === "{") {
        e.preventDefault();
        void leadsBack();
        return;
      }
      if (e.key === "}") {
        e.preventDefault();
        void leadsNext();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    contactsCursor,
    leadsCursor,
    contactsNextCursor,
    leadsNextCursor,
    contactsCursorStack,
    leadsCursorStack,
    detailOpen,
    leadModalOpen,
    loading,
  ]);

  async function load(opts?: { contactsCursor?: string | null; leadsCursor?: string | null }) {
    setLoading(true);
    try {
      const cCur = opts?.contactsCursor !== undefined ? opts.contactsCursor : contactsCursor;
      const lCur = opts?.leadsCursor !== undefined ? opts.leadsCursor : leadsCursor;

      const sp = new URLSearchParams();
      sp.set("take", "50");
      if (cCur) sp.set("contactsCursor", cCur);
      if (lCur) sp.set("leadsCursor", lCur);

      const res = await fetch(`/api/portal/people/contacts?${sp.toString()}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to load"));
      setData(json as ContactsPayload);
      setContactsNextCursor(typeof json?.contactsNextCursor === "string" ? json.contactsNextCursor : null);
      setLeadsNextCursor(typeof json?.unlinkedLeadsNextCursor === "string" ? json.unlinkedLeadsNextCursor : null);

      if (opts?.contactsCursor !== undefined) setContactsCursor(opts.contactsCursor);
      if (opts?.leadsCursor !== undefined) setLeadsCursor(opts.leadsCursor);

      return true;
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to load"));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function loadOwnerTags() {
    try {
      const res = await fetch("/api/portal/contact-tags", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok || !Array.isArray(json?.tags)) return;
      setOwnerTags(
        json.tags
          .map((t: any) => ({
            id: String(t?.id || ""),
            name: String(t?.name || "").slice(0, 60),
            color: typeof t?.color === "string" ? String(t.color) : null,
          }))
          .filter((t: ContactTag) => t.id && t.name),
      );
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void load();
    void loadOwnerTags();
  }, []);

  async function openContact(contactId: string) {
    setSelectedContactId(contactId);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);

    // Optimistic: show tags from list payload while full detail loads.
    const fromList = (data?.contacts || []).find((c) => c.id === contactId);
    setDetailTags(fromList?.tags ?? []);

    try {
      const res = await fetch(`/api/portal/contacts/${encodeURIComponent(contactId)}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error || "Failed to load contact"));
      }
      const payload = json as ContactDetailPayload;
      setDetail(payload.contact);
      setEditingContact(false);
      setEditName(payload.contact?.name ?? "");
      setEditEmail(payload.contact?.email ?? "");
      setEditPhone(payload.contact?.phone ?? "");
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to load contact"));
    } finally {
      setDetailLoading(false);
    }

    // Tags are separate so we can stay compatible with old data.
    try {
      const res = await fetch(`/api/portal/contacts/${encodeURIComponent(contactId)}/tags`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (res.ok && json?.ok && Array.isArray(json?.tags)) {
        setDetailTags(
          json.tags
            .map((t: any) => ({
              id: String(t?.id || ""),
              name: String(t?.name || "").slice(0, 60),
              color: typeof t?.color === "string" ? String(t.color) : null,
            }))
            .filter((t: ContactTag) => t.id && t.name),
        );
      }
    } catch {
      // ignore
    }
  }

  async function addTagToSelected(tagId: string) {
    if (!selectedContactId) return;
    setTagBusyId(tagId);
    try {
      const res = await fetch(`/api/portal/contacts/${encodeURIComponent(selectedContactId)}/tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok || !Array.isArray(json?.tags)) {
        throw new Error(String(json?.error || "Failed to add tag"));
      }
      setDetailTags(
        json.tags
          .map((t: any) => ({
            id: String(t?.id || ""),
            name: String(t?.name || "").slice(0, 60),
            color: typeof t?.color === "string" ? String(t.color) : null,
          }))
          .filter((t: ContactTag) => t.id && t.name),
      );
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to add tag"));
    } finally {
      setTagBusyId(null);
    }
  }

  async function removeTagFromSelected(tagId: string) {
    if (!selectedContactId) return;
    setTagBusyId(tagId);
    try {
      const res = await fetch(`/api/portal/contacts/${encodeURIComponent(selectedContactId)}/tags`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok || !Array.isArray(json?.tags)) {
        throw new Error(String(json?.error || "Failed to remove tag"));
      }
      setDetailTags(
        json.tags
          .map((t: any) => ({
            id: String(t?.id || ""),
            name: String(t?.name || "").slice(0, 60),
            color: typeof t?.color === "string" ? String(t.color) : null,
          }))
          .filter((t: ContactTag) => t.id && t.name),
      );
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to remove tag"));
    } finally {
      setTagBusyId(null);
    }
  }

  async function createOwnerTag() {
    const name = createTagName.trim().slice(0, 60);
    if (!name) {
      toast.error("Enter a tag name");
      return;
    }
    const safeColor = createTagColor;

    setCreateTagBusy(true);
    try {
      const res = await fetch("/api/portal/contact-tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color: safeColor }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok || !json?.tag?.id) {
        throw new Error(String(json?.error || "Failed to create tag"));
      }
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
      if (selectedContactId) {
        await addTagToSelected(created.id);
      }
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to create tag"));
    } finally {
      setCreateTagBusy(false);
    }
  }

  async function saveContactEdits() {
    if (!selectedContactId) return;
    setSavingContact(true);
    try {
      const res = await fetch(`/api/portal/contacts/${encodeURIComponent(selectedContactId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: editName, email: editEmail, phone: editPhone }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to save"));

      toast.success("Contact updated.");
      setEditingContact(false);
      await load();
      if (selectedContactId) await openContact(selectedContactId);
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to save"));
    } finally {
      setSavingContact(false);
    }
  }

  function openLeadModal(lead: LeadRow) {
    setActiveLeadId(lead.id);
    setLeadBusinessName(lead.businessName || "");
    setLeadEmail(lead.email || "");
    setLeadPhone(lead.phone || "");
    setLeadWebsite(lead.website || "");
    setLeadLinkContactId("");
    setLeadModalOpen(true);
  }

  async function saveLeadEdits() {
    if (!activeLeadId) return;
    setSavingLead(true);
    try {
      const payload: any = {
        businessName: leadBusinessName,
        email: leadEmail,
        phone: leadPhone,
        website: leadWebsite,
      };

      if (leadLinkContactId.trim()) payload.contactId = leadLinkContactId.trim();

      const res = await fetch(`/api/portal/people/leads/${encodeURIComponent(activeLeadId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to save lead"));
      toast.success("Lead updated.");
      setLeadModalOpen(false);
      await load();
      if (selectedContactId) await openContact(selectedContactId);
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to save lead"));
    } finally {
      setSavingLead(false);
    }
  }

  async function linkLeadToSelected(leadId: string) {
    if (!selectedContactId || !leadId) return;
    setSavingLead(true);
    try {
      const res = await fetch(`/api/portal/people/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: selectedContactId }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to link lead"));
      toast.success("Lead linked.");
      await load();
      await openContact(selectedContactId);
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to link lead"));
    } finally {
      setSavingLead(false);
    }
  }

  const filteredContacts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = data?.contacts || [];
    if (!needle) return rows;
    return rows.filter((c) => {
      const hay = `${c.name || ""} ${c.email || ""} ${c.phone || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [data?.contacts, q]);

  const filteredLeads = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = data?.unlinkedLeads || [];
    if (!needle) return rows;
    return rows.filter((l) => {
      const hay = `${l.businessName || ""} ${l.email || ""} ${l.phone || ""} ${l.website || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [data?.unlinkedLeads, q]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">People</h1>
          <p className="mt-2 text-sm text-zinc-600">Contacts and leads across your portal.</p>
          <PortalPeopleTabs />
        </div>
        <button
          type="button"
          onClick={() => {
            setContactsCursor(null);
            setLeadsCursor(null);
            setContactsCursorStack([null]);
            setLeadsCursorStack([null]);
            void load({ contactsCursor: null, leadsCursor: null });
          }}
          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4">
        <div className="text-xs font-semibold text-zinc-700">Search</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, email, phone, website…"
          className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
        />
      </div>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      ) : null}

      {data ? (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-zinc-900">
                Contacts ({data.contacts.length} of {typeof data.totalContacts === "number" ? data.totalContacts : "—"})
                {q.trim() ? <span className="ml-2 text-xs font-semibold text-zinc-500">Filtered: {filteredContacts.length}</span> : null}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-zinc-500">Page {contactsCursorStack.length}</div>
                <div className="text-xs text-zinc-500">•</div>
                <div className="text-xs text-zinc-500">50 per page</div>
                <button
                  type="button"
                  disabled={contactsCursorStack.length <= 1}
                  title="Back ([)"
                  onClick={() =>
                    void (async () => {
                      const prev = contactsCursorStack[contactsCursorStack.length - 2] ?? null;
                      const ok = await load({ contactsCursor: prev, leadsCursor });
                      if (ok) setContactsCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
                    })()
                  }
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!contactsNextCursor}
                  title="Next (])"
                  onClick={() =>
                    void (async () => {
                      if (!contactsNextCursor) return;
                      const ok = await load({ contactsCursor: contactsNextCursor, leadsCursor });
                      if (ok) setContactsCursorStack((s) => [...s, contactsNextCursor]);
                    })()
                  }
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.length ? (
                    filteredContacts.slice(0, 50).map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-t border-zinc-200 hover:bg-zinc-50"
                        onClick={() => openContact(c.id)}
                      >
                        <td className="px-4 py-3 min-w-0">
                          <div className="font-semibold text-zinc-900">{c.name || "—"}</div>
                          {c.tags?.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {c.tags.slice(0, 3).map((t) => (
                                <span
                                  key={t.id}
                                  className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700"
                                  title={t.name}
                                >
                                  {t.name}
                                </span>
                              ))}
                              {c.tags.length > 3 ? (
                                <span className="text-[11px] font-semibold text-zinc-500">+{c.tags.length - 3}</span>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 min-w-0">
                          <div className="truncate">{c.email || "—"}</div>
                        </td>
                        <td className="px-4 py-3 min-w-0">
                          <div className="truncate">{c.phone || "—"}</div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-zinc-200">
                      <td className="px-4 py-5 text-sm text-zinc-600" colSpan={3}>
                        No contacts yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-zinc-500">Showing {data.contacts.length} on this page.</div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-zinc-900">
                Unlinked leads ({data.unlinkedLeads.length} of {typeof data.totalUnlinkedLeads === "number" ? data.totalUnlinkedLeads : "—"})
                {q.trim() ? <span className="ml-2 text-xs font-semibold text-zinc-500">Filtered: {filteredLeads.length}</span> : null}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-zinc-500">Page {leadsCursorStack.length}</div>
                <div className="text-xs text-zinc-500">•</div>
                <div className="text-xs text-zinc-500">50 per page</div>
                <button
                  type="button"
                  disabled={leadsCursorStack.length <= 1}
                  title="Back ({)"
                  onClick={() =>
                    void (async () => {
                      const prev = leadsCursorStack[leadsCursorStack.length - 2] ?? null;
                      const ok = await load({ contactsCursor, leadsCursor: prev });
                      if (ok) setLeadsCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
                    })()
                  }
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!leadsNextCursor}
                  title="Next (})"
                  onClick={() =>
                    void (async () => {
                      if (!leadsNextCursor) return;
                      const ok = await load({ contactsCursor, leadsCursor: leadsNextCursor });
                      if (ok) setLeadsCursorStack((s) => [...s, leadsNextCursor]);
                    })()
                  }
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {filteredLeads.length ? (
                filteredLeads.slice(0, 50).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => openLeadModal(l)}
                    className="w-full rounded-2xl border border-zinc-200 p-4 text-left hover:bg-zinc-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-900 truncate">{l.businessName || "—"}</div>
                        <div className="mt-1 text-sm text-zinc-600 truncate">
                          {l.email || "—"} {l.phone ? `• ${l.phone}` : ""}
                        </div>
                        {l.website ? <div className="mt-1 text-xs text-zinc-500 truncate">{l.website}</div> : null}
                      </div>
                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
                          l.assignedToUserId ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600",
                        )}
                      >
                        {l.assignedToUserId ? "Assigned" : "Unassigned"}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="text-sm text-zinc-600">No unlinked leads.</div>
              )}
            </div>

            <div className="mt-3 text-xs text-zinc-500">Showing {data.unlinkedLeads.length} on this page.</div>
          </div>
        </div>
      ) : null}

      {detailOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-auto bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Contact details</div>
                <div className="mt-1 text-xs text-zinc-500">Click outside to close.</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
                onClick={() => {
                  setDetailOpen(false);
                  setSelectedContactId(null);
                  setDetail(null);
                  setDetailTags([]);
                }}
              >
                Close
              </button>
            </div>

            <div
              className="absolute inset-0"
              onClick={() => {
                setDetailOpen(false);
                setSelectedContactId(null);
                setDetail(null);
                setDetailTags([]);
              }}
              style={{ display: "none" }}
            />

            {detailLoading ? (
              <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
                Loading…
              </div>
            ) : null}

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 p-4">
                <div className="text-xs font-semibold text-zinc-600">Name</div>
                {editingContact ? (
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-[color:var(--color-brand-blue)]"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Full name"
                  />
                ) : (
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{detail?.name ?? "—"}</div>
                )}
                <div className="mt-3 text-xs font-semibold text-zinc-600">Email</div>
                {editingContact ? (
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-[color:var(--color-brand-blue)]"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="email@company.com"
                  />
                ) : (
                  <div className="mt-1 text-sm text-zinc-800">{detail?.email ?? "—"}</div>
                )}
                <div className="mt-3 text-xs font-semibold text-zinc-600">Phone</div>
                {editingContact ? (
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-[color:var(--color-brand-blue)]"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+15551234567"
                  />
                ) : (
                  <div className="mt-1 text-sm text-zinc-800">{detail?.phone ?? "—"}</div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <a
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                    href={(() => {
                      const to = (detail?.phone || "").trim();
                      return to
                        ? `/portal/app/services/inbox?channel=sms&compose=1&to=${encodeURIComponent(to)}`
                        : "/portal/app/services/inbox?channel=sms&compose=1";
                    })()}
                  >
                    New SMS
                  </a>
                  <a
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                    href={(() => {
                      const to = (detail?.email || "").trim();
                      return to
                        ? `/portal/app/services/inbox?channel=email&compose=1&to=${encodeURIComponent(to)}`
                        : "/portal/app/services/inbox?channel=email&compose=1";
                    })()}
                  >
                    New Email
                  </a>

                  <div className="ml-auto flex items-center gap-2">
                    {!editingContact ? (
                      <button
                        type="button"
                        className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                        onClick={() => setEditingContact(true)}
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
                            setEditingContact(false);
                            setEditName(detail?.name ?? "");
                            setEditEmail(detail?.email ?? "");
                            setEditPhone(detail?.phone ?? "");
                          }}
                          disabled={savingContact}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                          onClick={() => void saveContactEdits()}
                          disabled={savingContact}
                        >
                          {savingContact ? "Saving…" : "Save"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 text-xs text-zinc-500">
                  Created: {detail?.createdAtIso ? new Date(detail.createdAtIso).toLocaleString() : "—"}
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
                        onClick={() => removeTagFromSelected(t.id)}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: t.color || "#e4e4e7" }}
                        />
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
                    <select
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                      value={""}
                      onChange={(e) => {
                        const tagId = e.target.value;
                        if (!tagId) return;
                        void addTagToSelected(tagId);
                      }}
                      disabled={!selectedContactId}
                    >
                      <option value="">Select a tag…</option>
                      {ownerTags
                        .filter((t) => !detailTags.some((x) => x.id === t.id))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                    <div className="text-xs font-semibold text-zinc-600">Create new tag</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <input
                        className="sm:col-span-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                        placeholder="Tag name"
                        value={createTagName}
                        onChange={(e) => setCreateTagName(e.target.value)}
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
                      <div className="text-xs text-zinc-500">Pick a default color.</div>
                      <button
                        type="button"
                        className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                        disabled={createTagBusy}
                        onClick={() => void createOwnerTag()}
                      >
                        {createTagBusy ? "Creating…" : "Create"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-zinc-200 p-4">
                <div className="text-sm font-semibold text-zinc-900">Linked leads</div>
                {data?.unlinkedLeads?.length ? (
                  <div className="mt-2">
                    <label className="text-xs font-semibold text-zinc-600">Link a lead</label>
                    <select
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                      value={""}
                      onChange={(e) => {
                        const leadId = e.target.value;
                        if (!leadId) return;
                        void linkLeadToSelected(leadId);
                      }}
                      disabled={!selectedContactId || savingLead}
                    >
                      <option value="">Select an unlinked lead…</option>
                      {data.unlinkedLeads.slice(0, 250).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.businessName}{l.email ? ` • ${l.email}` : ""}{l.phone ? ` • ${l.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="mt-2 text-sm text-zinc-700">
                  {detail?.leads?.length ? (
                    <div className="space-y-2">
                      {detail.leads.slice(0, 10).map((l) => (
                        <div key={l.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                          <div className="font-semibold">{l.businessName}</div>
                          <div className="text-xs text-zinc-600">{l.phone}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    "No linked leads."
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 p-4">
                <div className="text-sm font-semibold text-zinc-900">Inbox threads</div>
                <div className="mt-2 text-sm text-zinc-700">
                  {detail?.inboxThreads?.length ? (
                    <div className="space-y-2">
                      {detail.inboxThreads.slice(0, 10).map((t) => (
                        <div key={t.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                          <div className="text-xs font-semibold text-zinc-600">{t.channel}</div>
                          <div className="font-semibold">{t.peerAddress}</div>
                          <div className="mt-1 text-xs text-zinc-500">{t.lastMessagePreview}</div>
                          <div className="mt-2">
                            <a
                              className="text-xs font-semibold text-brand-ink hover:underline"
                              href={`/portal/app/services/inbox?channel=${String(t.channel).toLowerCase() === "sms" ? "sms" : "email"}&threadId=${encodeURIComponent(t.id)}`}
                            >
                              Open thread
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    "No linked inbox threads."
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {leadModalOpen ? (
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-auto bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Lead</div>
                <div className="mt-1 text-xs text-zinc-500">Edit lead info and optionally link it to a contact.</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
                onClick={() => {
                  setLeadModalOpen(false);
                  setActiveLeadId(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs font-semibold text-zinc-700">Business name</div>
                <input
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                  value={leadBusinessName}
                  onChange={(e) => setLeadBusinessName(e.target.value)}
                  placeholder="Business name"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-zinc-700">Email</div>
                  <input
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="email@company.com"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-700">Phone</div>
                  <input
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    placeholder="+15551234567"
                  />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-700">Website</div>
                <input
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-brand-blue)]"
                  value={leadWebsite}
                  onChange={(e) => setLeadWebsite(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-700">Link to contact (optional)</div>
                <select
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={leadLinkContactId}
                  onChange={(e) => setLeadLinkContactId(e.target.value)}
                >
                  <option value="">Don’t link</option>
                  {(data?.contacts || []).slice(0, 400).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.email ? ` • ${c.email}` : ""}{c.phone ? ` • ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                onClick={() => {
                  setLeadModalOpen(false);
                  setActiveLeadId(null);
                }}
                disabled={savingLead}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                onClick={() => void saveLeadEdits()}
                disabled={savingLead || !leadBusinessName.trim()}
              >
                {savingLead ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
