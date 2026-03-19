"use client";

import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PortalPeopleTabs } from "@/app/portal/app/people/PortalPeopleTabs";
import { PortalListboxDropdown } from "@/components/PortalListboxDropdown";
import { PortalSelectDropdown } from "@/components/PortalSelectDropdown";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { useToast } from "@/components/ToastProvider";
import { parseCsv } from "@/lib/csv";
import { normalizePortalContactCustomVarKey, type TemplateVariable } from "@/lib/portalTemplateVars";
import { DEFAULT_TAG_COLORS } from "@/lib/tagColors.shared";

const DEFAULT_CONTACT_CUSTOM_VAR_KEYS = ["business_name", "city", "state", "website", "niche", "location"];

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

type CustomVarRow = { key: string; value: string };

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
    customVariables?: Record<string, string> | null;
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

type CsvMapping = {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  tags: string;
};

function normalizeHeaderKey(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function guessHeader(headers: string[], patterns: string[]): string {
  const scored = headers
    .map((h) => {
      const key = normalizeHeaderKey(h);
      let score = 0;
      for (const p of patterns) {
        if (key === p) score = Math.max(score, 100);
        else if (key.includes(p)) score = Math.max(score, 50);
      }
      return { header: h, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score ? scored[0].header : "";
}

function guessMapping(headers: string[]): CsvMapping {
  return {
    name: guessHeader(headers, ["fullname", "name", "contactname", "leadname"]),
    firstName: guessHeader(headers, ["firstname", "fname", "first"]),
    lastName: guessHeader(headers, ["lastname", "lname", "last", "surname"]),
    email: guessHeader(headers, ["email", "emailaddress"]),
    phone: guessHeader(headers, ["phone", "phonenumber", "mobile", "cell", "tel"]),
    tags: guessHeader(headers, ["tags", "tag", "labels", "label"]),
  };
}

function detectTagHeaders(headers: string[]): string[] {
  const out: string[] = [];
  for (const h of headers) {
    const key = normalizeHeaderKey(h);
    if (!key) continue;
    if (/^(tags?|labels?)(\d+)?$/.test(key)) out.push(h);
    else if (key.includes("tags") || key.includes("labels")) out.push(h);
  }
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const h of out) {
    const k = normalizeHeaderKey(h);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(h);
  }
  return uniq.slice(0, 8);
}

function splitTags(raw: string): string[] {
  const s = String(raw || "").trim();
  if (!s) return [];
  const parts = s
    .split(/[\n\r,;|]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const k = normalizeHeaderKey(p);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(p);
    if (uniq.length >= 10) break;
  }
  return uniq;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

async function readJsonBody(res: Response): Promise<any | null> {
  if (res.status === 204) return null;
  const text = await res.text().catch(() => "");
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function PortalPeopleContactsClient() {
  const toast = useToast();
  const router = useRouter();
  const lastLoadedAtRef = useRef<number>(0);
  const createdCustomVarRef = useRef<{ key: string; value: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ContactsPayload | null>(null);
  const [q, setQ] = useState("");
  const [mobilePeopleFilter, setMobilePeopleFilter] = useState<"contacts" | "unlinked">("contacts");

  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

  const [duplicateGroupsCount, setDuplicateGroupsCount] = useState(0);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [addMode, setAddMode] = useState<"csv" | "manual">("manual");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualTagValues, setManualTagValues] = useState<string[]>([]);
  const [manualCreateTagOpen, setManualCreateTagOpen] = useState(false);
  const [manualCreateTagName, setManualCreateTagName] = useState("");
  const [manualCreateTagColor, setManualCreateTagColor] = useState<(typeof DEFAULT_TAG_COLORS)[number]>("#2563EB");
  const [manualCreateTagBusy, setManualCreateTagBusy] = useState(false);
  const [manualCustomVarRows, setManualCustomVarRows] = useState<CustomVarRow[]>([]);
  const [knownCustomVarKeys, setKnownCustomVarKeys] = useState<string[]>([]);

  const [customVarPickerOpen, setCustomVarPickerOpen] = useState(false);
  const [customVarPickerMode, setCustomVarPickerMode] = useState<"manual" | "edit">("manual");
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<string[][]>([]);
  const [importDupesOpen, setImportDupesOpen] = useState(false);
  const [importDupesBusy, setImportDupesBusy] = useState(false);
  const [importDupesCount, setImportDupesCount] = useState(0);
  const [importDupesRowIndexes, setImportDupesRowIndexes] = useState<number[]>([]);
  const [importMapping, setImportMapping] = useState<CsvMapping>({
    name: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    tags: "",
  });

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
  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createTagName, setCreateTagName] = useState("");
  const [createTagColor, setCreateTagColor] = useState<(typeof DEFAULT_TAG_COLORS)[number]>("#2563EB");
  const [createTagBusy, setCreateTagBusy] = useState(false);

  const [editingContact, setEditingContact] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCustomVarRows, setEditCustomVarRows] = useState<CustomVarRow[]>([]);
  const [savingContact, setSavingContact] = useState(false);

  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [leadBusinessName, setLeadBusinessName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadWebsite, setLeadWebsite] = useState("");
  const [leadLinkContactId, setLeadLinkContactId] = useState<string>("");
  const [savingLead, setSavingLead] = useState(false);

  const contactsCursorRef = useRef<string | null>(null);
  const leadsCursorRef = useRef<string | null>(null);

  useEffect(() => {
    contactsCursorRef.current = contactsCursor;
  }, [contactsCursor]);

  useEffect(() => {
    leadsCursorRef.current = leadsCursor;
  }, [leadsCursor]);

  const load = useCallback(
    async (opts?: { contactsCursor?: string | null; leadsCursor?: string | null }) => {
      setLoading(true);
      try {
        const cCur = opts?.contactsCursor !== undefined ? opts.contactsCursor : contactsCursorRef.current;
        const lCur = opts?.leadsCursor !== undefined ? opts.leadsCursor : leadsCursorRef.current;

        const sp = new URLSearchParams();
        sp.set("take", "50");
        if (cCur) sp.set("contactsCursor", cCur);
        if (lCur) sp.set("leadsCursor", lCur);

        const res = await fetch(`/api/portal/people/contacts?${sp.toString()}`,
          { cache: "no-store" },
        );
        const json = (await readJsonBody(res)) as any;

        // Treat an empty/204 response as a valid "no contacts yet" state.
        // This prevents scary toasts when a brand-new account has no People data.
        if (res.ok && !json) {
          const empty: ContactsPayload = {
            ok: true,
            contacts: [],
            unlinkedLeads: [],
            totalContacts: 0,
            totalUnlinkedLeads: 0,
            contactsNextCursor: null,
            unlinkedLeadsNextCursor: null,
          };
          setData(empty);
          setContactsNextCursor(null);
          setLeadsNextCursor(null);
        } else {
          if (!res.ok || !json?.ok) {
            throw new Error(String(json?.error || `Request failed (HTTP ${res.status})`));
          }
          setData(json as ContactsPayload);
          setContactsNextCursor(typeof json?.contactsNextCursor === "string" ? json.contactsNextCursor : null);
          setLeadsNextCursor(typeof json?.unlinkedLeadsNextCursor === "string" ? json.unlinkedLeadsNextCursor : null);
        }

        if (opts?.contactsCursor !== undefined) {
          contactsCursorRef.current = opts.contactsCursor;
          setContactsCursor(opts.contactsCursor);
        }
        if (opts?.leadsCursor !== undefined) {
          leadsCursorRef.current = opts.leadsCursor;
          setLeadsCursor(opts.leadsCursor);
        }

        return true;
      } catch (e: any) {
        const msg = String(e?.message || "Failed to load");
        // Treat load failures as empty state for end-users.
        setData({
          ok: true,
          contacts: [],
          unlinkedLeads: [],
          totalContacts: 0,
          totalUnlinkedLeads: 0,
          contactsNextCursor: null,
          unlinkedLeadsNextCursor: null,
        });

        // Only show an error toast for auth issues; otherwise keep the UI calm.
        if (/unauthorized|forbidden|\b401\b|\b403\b/i.test(msg)) toast.error(msg);
        return false;
      } finally {
        lastLoadedAtRef.current = Date.now();
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    function maybeRefresh() {
      if (loading) return;
      if (detailOpen || importOpen || leadModalOpen) return;
      if (Date.now() - lastLoadedAtRef.current < 30_000) return;
      void load();
    }

    function onVisibility() {
      if (document.visibilityState === "visible") maybeRefresh();
    }

    window.addEventListener("focus", maybeRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", maybeRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [detailOpen, importOpen, leadModalOpen, load, loading]);

  const openImportModal = useCallback(() => {
    setImportOpen(true);
    setAddMode("manual");
    setImportError(null);
    setImportFile(null);
    setImportHeaders([]);
    setImportRows([]);
    setImportMapping({ name: "", firstName: "", lastName: "", email: "", phone: "", tags: "" });

    setManualError(null);
    setManualName("");
    setManualEmail("");
    setManualPhone("");
    setManualTagValues([]);
    setManualCreateTagOpen(false);
    setManualCreateTagName("");
    setManualCreateTagColor("#2563EB");
    setManualCustomVarRows(mergeRowsWithKnownKeys([{ key: "business_name", value: "" }], knownCustomVarKeys));
  }, [knownCustomVarKeys]);

  useEffect(() => {
    if (!importOpen) return;
    if (addMode !== "manual") return;
    setManualCustomVarRows((prev) => mergeRowsWithKnownKeys(prev, knownCustomVarKeys));
  }, [addMode, importOpen, knownCustomVarKeys]);

  const loadKnownCustomVarKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/people/contacts/custom-variable-keys", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json?.ok || !Array.isArray(json?.keys)) return [] as string[];
      return json.keys.map((k: any) => String(k || "").trim()).filter(Boolean).slice(0, 50) as string[];
    } catch {
      return [] as string[];
    }
  }, []);

  const loadOwnerTags = useCallback(async () => {
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
  }, []);

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
    load,
    loading,
  ]);

  const loadDuplicatesSummary = useCallback(async () => {
    setDuplicatesLoading(true);
    try {
      const res = await fetch("/api/portal/people/contacts/duplicates?summary=1", { cache: "no-store" });
      const body = await readJsonBody(res);
      if (!res.ok || !body?.ok) return;
      setDuplicateGroupsCount(Number(body.groupsCount || 0) || 0);
    } catch {
      // ignore
    } finally {
      setDuplicatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadOwnerTags();
    void loadDuplicatesSummary();
    void (async () => {
      const keys = await loadKnownCustomVarKeys();
      setKnownCustomVarKeys(keys);
    })();
  }, [load, loadOwnerTags, loadDuplicatesSummary, loadKnownCustomVarKeys]);

  async function openContact(contactId: string) {
    setSelectedContactId(contactId);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setCreateTagOpen(false);
    setCreateTagName("");

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
      setEditCustomVarRows(
        mergeRowsWithKnownKeys(rowsFromCustomVariables(payload.contact?.customVariables), knownCustomVarKeys),
      );
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

  useEffect(() => {
    if (!detailOpen) return;
    if (!editingContact) return;
    setEditCustomVarRows((prev) => mergeRowsWithKnownKeys(prev, knownCustomVarKeys));
  }, [detailOpen, editingContact, knownCustomVarKeys]);

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
      setCreateTagOpen(false);
      if (selectedContactId) {
        await addTagToSelected(created.id);
      }
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to create tag"));
    } finally {
      setCreateTagBusy(false);
    }
  }

  function addManualTagValue(name: string) {
    const t = String(name || "").trim().slice(0, 60);
    if (!t) return;
    setManualTagValues((prev) => {
      const seen = new Set((prev ?? []).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean));
      if (seen.has(t.toLowerCase())) return prev;
      return [...(prev ?? []), t];
    });
  }

  async function createOwnerTagForManual() {
    const name = manualCreateTagName.trim().slice(0, 60);
    if (!name) {
      toast.error("Enter a tag name");
      return;
    }

    const safeColor = manualCreateTagColor;
    setManualCreateTagBusy(true);
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

      addManualTagValue(created.name);
      setManualCreateTagName("");
      setManualCreateTagColor("#2563EB");
      setManualCreateTagOpen(false);
    } catch (e: any) {
      toast.error(String(e?.message || "Failed to create tag"));
    } finally {
      setManualCreateTagBusy(false);
    }
  }

  async function saveContactEdits() {
    if (!selectedContactId) return;
    setSavingContact(true);
    try {
      const customVariables = customVariablesFromRows(editCustomVarRows);
      const res = await fetch(`/api/portal/contacts/${encodeURIComponent(selectedContactId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: editName, email: editEmail, phone: editPhone, customVariables }),
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

  useEffect(() => {
    if (!expandedContactId) return;
    if (filteredContacts.some((c) => c.id === expandedContactId)) return;
    setExpandedContactId(null);
  }, [expandedContactId, filteredContacts]);

  useEffect(() => {
    if (!expandedLeadId) return;
    if (filteredLeads.some((l) => l.id === expandedLeadId)) return;
    setExpandedLeadId(null);
  }, [expandedLeadId, filteredLeads]);

  const mobileListTotal = useMemo(() => {
    if (!data) return 0;
    if (mobilePeopleFilter === "unlinked") {
      return typeof data.totalUnlinkedLeads === "number" ? data.totalUnlinkedLeads : data.unlinkedLeads.length;
    }
    return typeof data.totalContacts === "number" ? data.totalContacts : data.contacts.length;
  }, [data, mobilePeopleFilter]);

  const mobileListRows = useMemo(() => {
    return mobilePeopleFilter === "unlinked" ? (filteredLeads || []) : (filteredContacts || []);
  }, [filteredContacts, filteredLeads, mobilePeopleFilter]);

  const customVarPickerKeys = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];

    function add(raw: string) {
      const key = normalizePortalContactCustomVarKey(raw);
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(key);
    }

    for (const k of DEFAULT_CONTACT_CUSTOM_VAR_KEYS) add(k);
    for (const k of knownCustomVarKeys) add(k);

    const rows = customVarPickerMode === "manual" ? manualCustomVarRows : editCustomVarRows;
    for (const r of rows || []) add(r.key);

    out.sort((a, b) => a.localeCompare(b));
    return out.slice(0, 200);
  }, [customVarPickerMode, editCustomVarRows, knownCustomVarKeys, manualCustomVarRows]);

  const customVarPickerVariables: TemplateVariable[] = useMemo(() => {
    return customVarPickerKeys.map((k) => ({ key: k, label: k, group: "Custom", appliesTo: "Contact" }));
  }, [customVarPickerKeys]);

  const applyPickedCustomVarKey = useCallback(
    (rawKey: string) => {
      const stableKey = normalizePortalContactCustomVarKey(rawKey);
      if (!stableKey) return;

      const created = createdCustomVarRef.current;
      const createdKey = created ? normalizePortalContactCustomVarKey(created.key) : "";
      const createdValue = createdKey && createdKey === stableKey ? String(created?.value ?? "") : "";
      createdCustomVarRef.current = null;

      function upsert(prev: CustomVarRow[]) {
        const next = [...(prev || [])];
        const idx = next.findIndex((r) => normalizePortalContactCustomVarKey(r.key) === stableKey);
        if (idx >= 0) {
          if (createdValue && !String(next[idx].value || "").trim()) {
            next[idx] = { ...next[idx], value: createdValue };
          }
          return next;
        }
        if (next.length >= 25) return next;
        return [...next, { key: stableKey, value: createdValue }];
      }

      if (customVarPickerMode === "manual") {
        setManualCustomVarRows(upsert);
      } else {
        setEditCustomVarRows(upsert);
      }

      setKnownCustomVarKeys((prev) => {
        const set = new Set((prev || []).map((x) => normalizePortalContactCustomVarKey(String(x || ""))).filter(Boolean));
        set.add(stableKey);
        return Array.from(set).sort((a, b) => a.localeCompare(b)).slice(0, 50);
      });
    },
    [customVarPickerMode],
  );

  return (
    <div className="mx-auto w-full max-w-6xl pb-[calc(var(--pa-portal-embed-footer-offset,0px)+96px+var(--pa-portal-floating-tools-reserve,0px))]">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">People</h1>
          <p className="mt-2 text-sm text-zinc-600">Contacts and leads across your portal.</p>
          <PortalPeopleTabs />
        </div>
      </div>

      <PortalVariablePickerModal
        open={customVarPickerOpen}
        title="Add variable"
        subtitle="Pick an existing variable or create a new one."
        variables={customVarPickerVariables}
        createCustom={{
          enabled: true,
          existingKeys: customVarPickerKeys,
          onCreate: (key, value) => {
            const stableKey = normalizePortalContactCustomVarKey(key);
            if (!stableKey) throw new Error("Invalid variable name.");
            if (customVarPickerKeys.includes(stableKey)) throw new Error("That variable already exists.");
            createdCustomVarRef.current = { key: stableKey, value: String(value ?? "") };
          },
        }}
        onPick={(key) => applyPickedCustomVarKey(key)}
        onClose={() => {
          setCustomVarPickerOpen(false);
          createdCustomVarRef.current = null;
        }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16.5 16.5 21 21"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contacts"
            className="h-11 w-full rounded-full border border-zinc-200 bg-white pl-11 pr-4 text-sm text-zinc-900 outline-none focus:border-zinc-300"
          />
        </div>

        <button
          type="button"
          className="sm:hidden h-11 shrink-0 rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          onClick={() => setMobilePeopleFilter((prev) => (prev === "unlinked" ? "contacts" : "unlinked"))}
          aria-label={mobilePeopleFilter === "unlinked" ? "Show contacts" : "Show unlinked leads"}
          title={mobilePeopleFilter === "unlinked" ? "Show contacts" : "Show unlinked leads"}
        >
          <span className="inline-flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M4 6h16M7 12h10M10 18h4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            {mobilePeopleFilter === "unlinked" ? "Unlinked" : "Contacts"}
          </span>
        </button>
      </div>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Loading…</div>
      ) : null}

      {!loading && !data ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-zinc-900">Contacts</div>
              <div className="mt-1 text-sm text-zinc-600">No contacts yet.</div>
            </div>
            <button
              type="button"
              onClick={openImportModal}
              className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              + New
            </button>
          </div>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mt-6 sm:hidden">
            <div className="rounded-3xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-zinc-900">
                    {mobilePeopleFilter === "unlinked" ? "Unlinked leads" : "Contacts"}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {q.trim() ? `Filtered: ${mobileListRows.length}` : `${mobileListTotal} total`}
                  </div>
                </div>

                {mobilePeopleFilter !== "unlinked" ? (
                  duplicateGroupsCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => router.push("/portal/app/people/contacts/duplicates")}
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                      title="Duplicates are grouped by phone number"
                    >
                      Duplicates ({duplicateGroupsCount})
                    </button>
                  ) : duplicatesLoading ? (
                    <div className="text-xs font-semibold text-zinc-400">Checking duplicates…</div>
                  ) : null
                ) : null}
              </div>

              {(() => {
                const total = mobileListTotal;
                if (total < 20) return null;
                const page = mobilePeopleFilter === "unlinked" ? leadsCursorStack.length : contactsCursorStack.length;
                const canBack = mobilePeopleFilter === "unlinked" ? leadsCursorStack.length > 1 : contactsCursorStack.length > 1;
                const canNext = mobilePeopleFilter === "unlinked" ? Boolean(leadsNextCursor) : Boolean(contactsNextCursor);
                return (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <div className="text-xs text-zinc-500">
                      Page {page}
                      <span className="mx-1">•</span>
                      50 per page
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!canBack}
                        onClick={() =>
                          void (async () => {
                            if (mobilePeopleFilter === "unlinked") {
                              const prev = leadsCursorStack[leadsCursorStack.length - 2] ?? null;
                              const ok = await load({ contactsCursor, leadsCursor: prev });
                              if (ok) setLeadsCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
                              return;
                            }
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
                        disabled={!canNext}
                        onClick={() =>
                          void (async () => {
                            if (mobilePeopleFilter === "unlinked") {
                              if (!leadsNextCursor) return;
                              const ok = await load({ contactsCursor, leadsCursor: leadsNextCursor });
                              if (ok) setLeadsCursorStack((s) => [...s, leadsNextCursor]);
                              return;
                            }
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
                );
              })()}

              <div className="mt-4 rounded-2xl border border-zinc-200 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mobileListRows.length ? (
                      mobilePeopleFilter === "unlinked" ? (
                        (mobileListRows as LeadRow[]).slice(0, 100).map((l) => {
                          const expanded = expandedLeadId === l.id;
                          return (
                            <Fragment key={`l_${l.id}`}>
                              <tr
                                className={classNames(
                                  "border-t border-zinc-200",
                                  "cursor-pointer hover:bg-zinc-50",
                                  expanded ? "bg-zinc-50" : "",
                                )}
                                onClick={() => setExpandedLeadId((prev) => (prev === l.id ? null : l.id))}
                              >
                                <td className="px-3 py-3 min-w-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="font-semibold text-zinc-900 truncate">{l.businessName || "N/A"}</div>
                                    </div>
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      className={classNames(
                                        "mt-0.5 shrink-0 text-zinc-400 transition-transform",
                                        expanded ? "rotate-180" : "",
                                      )}
                                      aria-hidden
                                    >
                                      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  </div>
                                </td>
                                <td className="px-3 py-3 min-w-0">
                                  <div className="truncate">{l.email || "N/A"}</div>
                                </td>
                                <td className="px-3 py-3 min-w-0">
                                  <div className="truncate">{l.phone || "N/A"}</div>
                                </td>
                              </tr>

                              {expanded ? (
                                <tr className="border-t border-zinc-200 bg-white">
                                  <td className="px-3 py-3" colSpan={3}>
                                    <div className="flex flex-col gap-2">
                                      <div className="text-xs text-zinc-600">
                                        <span
                                          className={classNames(
                                            "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
                                            l.assignedToUserId ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600",
                                          )}
                                        >
                                          {l.assignedToUserId ? "Assigned" : "Unassigned"}
                                        </span>
                                        {l.website ? <span className="ml-2">• {l.website}</span> : null}
                                        {l.createdAtIso ? <span className="ml-2">• Created: {new Date(l.createdAtIso).toLocaleString()}</span> : null}
                                      </div>
                                      <div>
                                        <button
                                          type="button"
                                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openLeadModal(l);
                                          }}
                                        >
                                          Open lead
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })
                      ) : (
                        (mobileListRows as ContactRow[]).slice(0, 100).map((c) => {
                          const expanded = expandedContactId === c.id;
                          return (
                            <Fragment key={`c_${c.id}`}>
                              <tr
                                className={classNames(
                                  "border-t border-zinc-200",
                                  "cursor-pointer hover:bg-zinc-50",
                                  expanded ? "bg-zinc-50" : "",
                                )}
                                onClick={() => setExpandedContactId((prev) => (prev === c.id ? null : c.id))}
                              >
                                <td className="px-3 py-3 min-w-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="font-semibold text-zinc-900 truncate">{c.name || "N/A"}</div>
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
                                    </div>
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      className={classNames(
                                        "mt-0.5 shrink-0 text-zinc-400 transition-transform",
                                        expanded ? "rotate-180" : "",
                                      )}
                                      aria-hidden
                                    >
                                      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  </div>
                                </td>
                                <td className="px-3 py-3 min-w-0">
                                  <div className="truncate">{c.email || "N/A"}</div>
                                </td>
                                <td className="px-3 py-3 min-w-0">
                                  <div className="truncate">{c.phone || "N/A"}</div>
                                </td>
                              </tr>

                              {expanded ? (
                                <tr className="border-t border-zinc-200 bg-white">
                                  <td className="px-3 py-3" colSpan={3}>
                                    <div className="flex flex-col gap-2">
                                      <div className="text-xs text-zinc-600">
                                        Created: {c.createdAtIso ? new Date(c.createdAtIso).toLocaleString() : "N/A"}
                                        {c.updatedAtIso ? ` • Updated: ${new Date(c.updatedAtIso).toLocaleString()}` : ""}
                                      </div>
                                      <div>
                                        <button
                                          type="button"
                                          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void openContact(c.id);
                                          }}
                                        >
                                          Open full details
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })
                      )
                    ) : (
                      <tr className="border-t border-zinc-200">
                        <td className="px-3 py-4 text-sm text-zinc-600" colSpan={3}>
                          No matches.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-6 hidden grid-cols-1 gap-6 sm:grid lg:grid-cols-2">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-zinc-900">
                    Contacts ({data.contacts.length} of {typeof data.totalContacts === "number" ? data.totalContacts : "N/A"})
                    {q.trim() ? <span className="ml-2 text-xs font-semibold text-zinc-500">Filtered: {filteredContacts.length}</span> : null}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">Manage and open contact details.</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {duplicateGroupsCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => router.push("/portal/app/people/contacts/duplicates")}
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                      title="Duplicates are grouped by phone number"
                    >
                      Duplicates ({duplicateGroupsCount})
                    </button>
                  ) : duplicatesLoading ? (
                    <div className="text-xs font-semibold text-zinc-400">Checking duplicates…</div>
                  ) : null}
                  <button
                    type="button"
                    onClick={openImportModal}
                    className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    + New
                  </button>
                </div>
              </div>

              {(() => {
                const contactsTotal = typeof data.totalContacts === "number" ? data.totalContacts : data.contacts.length;
                if (contactsTotal < 20) return null;
                return (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <div className="text-xs text-zinc-500">
                      Page {contactsCursorStack.length}
                      <span className="mx-1">•</span>
                      50 per page
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={contactsCursorStack.length <= 1}
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
                );
              })()}

              <div className="mt-4 rounded-2xl border border-zinc-200 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 sm:px-4 sm:py-3">Name</th>
                      <th className="px-3 py-2 sm:px-4 sm:py-3">Email</th>
                      <th className="px-3 py-2 sm:px-4 sm:py-3">Phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.length ? (
                      filteredContacts.slice(0, 50).map((c) => {
                        const expanded = expandedContactId === c.id;
                        return (
                          <Fragment key={c.id}>
                            <tr
                              className={classNames(
                                "border-t border-zinc-200",
                                "cursor-pointer hover:bg-zinc-50",
                                expanded ? "bg-zinc-50" : "",
                              )}
                              onClick={() => setExpandedContactId((prev) => (prev === c.id ? null : c.id))}
                            >
                              <td className="px-3 py-2 sm:px-4 sm:py-3 min-w-0">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-semibold text-zinc-900 truncate">{c.name || "N/A"}</div>
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
                                  </div>
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    className={classNames("mt-1 shrink-0 text-zinc-400 transition-transform", expanded ? "rotate-180" : "")}
                                    aria-hidden
                                  >
                                    <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </div>
                              </td>
                              <td className="px-3 py-2 sm:px-4 sm:py-3 min-w-0">
                                <div className="truncate">{c.email || "N/A"}</div>
                              </td>
                              <td className="px-3 py-2 sm:px-4 sm:py-3 min-w-0">
                                <div className="truncate">{c.phone || "N/A"}</div>
                              </td>
                            </tr>

                            {expanded ? (
                              <tr className="border-t border-zinc-200 bg-white">
                                <td className="px-3 py-3 sm:px-4" colSpan={3}>
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-xs text-zinc-600">
                                      Created: {c.createdAtIso ? new Date(c.createdAtIso).toLocaleString() : "N/A"}
                                      {c.updatedAtIso ? ` • Updated: ${new Date(c.updatedAtIso).toLocaleString()}` : ""}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void openContact(c.id);
                                        }}
                                      >
                                        Open full details
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })
                    ) : (
                      <tr className="border-t border-zinc-200">
                        <td className="px-3 py-5 text-sm text-zinc-600 sm:px-4" colSpan={3}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>No contacts yet.</div>
                            <button
                              type="button"
                              onClick={openImportModal}
                              className="rounded-2xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              + New
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            {(() => {
              const contactsTotal = typeof data.totalContacts === "number" ? data.totalContacts : data.contacts.length;
              if (contactsTotal < 20) return null;
              return (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-zinc-500">
                    Page {contactsCursorStack.length}
                    <span className="mx-1">•</span>
                    50 per page
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={contactsCursorStack.length <= 1}
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
              );
            })()}

            <div className="mt-3 text-xs text-zinc-500">Showing {data.contacts.length} on this page.</div>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-zinc-900">
                Unlinked leads ({data.unlinkedLeads.length} of {typeof data.totalUnlinkedLeads === "number" ? data.totalUnlinkedLeads : "N/A"})
                {q.trim() ? <span className="ml-2 text-xs font-semibold text-zinc-500">Filtered: {filteredLeads.length}</span> : null}
              </div>
              <div className="text-sm text-zinc-600">Review inbound leads that aren’t linked yet.</div>
            </div>

            {(() => {
              const leadsTotal = typeof data.totalUnlinkedLeads === "number" ? data.totalUnlinkedLeads : data.unlinkedLeads.length;
              if (leadsTotal < 20) return null;
              return (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-xs text-zinc-500">
                    Page {leadsCursorStack.length}
                    <span className="mx-1">•</span>
                    50 per page
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={leadsCursorStack.length <= 1}
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
              );
            })()}

            <div className="mt-4 rounded-2xl border border-zinc-200 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 sm:px-4 sm:py-3">Name</th>
                    <th className="px-3 py-2 sm:px-4 sm:py-3">Email</th>
                    <th className="px-3 py-2 sm:px-4 sm:py-3">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.length ? (
                    filteredLeads.slice(0, 50).map((l) => {
                      const expanded = expandedLeadId === l.id;
                      return (
                        <Fragment key={l.id}>
                          <tr
                            className={classNames(
                              "border-t border-zinc-200",
                              "cursor-pointer hover:bg-zinc-50",
                              expanded ? "bg-zinc-50" : "",
                            )}
                            onClick={() => setExpandedLeadId((prev) => (prev === l.id ? null : l.id))}
                          >
                            <td className="px-3 py-2 sm:px-4 sm:py-3 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-semibold text-zinc-900 truncate">{l.businessName || "N/A"}</div>
                                </div>
                                <svg
                                  width="16"
                                  height="16"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  className={classNames("mt-1 shrink-0 text-zinc-400 transition-transform", expanded ? "rotate-180" : "")}
                                  aria-hidden
                                >
                                  <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </div>
                            </td>
                            <td className="px-3 py-2 sm:px-4 sm:py-3 min-w-0">
                              <div className="truncate">{l.email || "N/A"}</div>
                            </td>
                            <td className="px-3 py-2 sm:px-4 sm:py-3 min-w-0">
                              <div className="truncate">{l.phone || "N/A"}</div>
                            </td>
                          </tr>

                          {expanded ? (
                            <tr className="border-t border-zinc-200 bg-white">
                              <td className="px-3 py-3 sm:px-4" colSpan={3}>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="text-xs text-zinc-600">
                                    <span
                                      className={classNames(
                                        "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
                                        l.assignedToUserId ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600",
                                      )}
                                    >
                                      {l.assignedToUserId ? "Assigned" : "Unassigned"}
                                    </span>
                                    {l.website ? <span className="ml-2">• {l.website}</span> : null}
                                    {l.createdAtIso ? <span className="ml-2">• Created: {new Date(l.createdAtIso).toLocaleString()}</span> : null}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openLeadModal(l);
                                      }}
                                    >
                                      Open lead
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  ) : (
                    <tr className="border-t border-zinc-200">
                      <td className="px-3 py-5 text-sm text-zinc-600 sm:px-4" colSpan={3}>
                        No unlinked leads.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-zinc-500">Showing {data.unlinkedLeads.length} on this page.</div>
          </div>
          </div>
        </>
      ) : null}

      {!importOpen && !detailOpen && !leadModalOpen ? (
        <button
          type="button"
          onClick={openImportModal}
          className="sm:hidden fixed right-4 z-11001 rounded-full bg-(--color-brand-pink) px-5 py-3 text-sm font-semibold text-white shadow-xl hover:opacity-95"
          style={{
            bottom:
              "calc(var(--pa-portal-embed-footer-offset,0px) + 5.75rem + var(--pa-portal-floating-tools-reserve, 0px))",
          }}
        >
          + New
        </button>
      ) : null}

      {importOpen ? (
        <div
          className={classNames(
            "fixed inset-0 z-8000 flex items-start justify-center bg-black/40 px-4",
            "pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]",
            "sm:items-center",
          )}
        >
          <div
            className={classNames(
              "w-full max-w-3xl rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl",
              "max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-zinc-900">Add contacts</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {addMode === "csv"
                    ? "Upload a CSV and we’ll map common fields automatically."
                    : "Add one contact manually."
                  }
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAddMode("csv")}
                className={classNames(
                  "rounded-2xl border px-4 py-2 text-sm font-semibold",
                  addMode === "csv" ? "border-(--color-brand-pink) bg-(--color-brand-pink) text-white" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                )}
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => setAddMode("manual")}
                className={classNames(
                  "rounded-2xl border px-4 py-2 text-sm font-semibold",
                  addMode === "manual" ? "border-(--color-brand-blue) bg-(--color-brand-blue) text-white" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                )}
              >
                Manual
              </button>
            </div>

            {addMode === "manual" ? (
              <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="block">
                    <div className="text-xs font-semibold text-zinc-700">Name</div>
                    <input
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Full name"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                    <div className="mt-1 text-[11px] text-zinc-500">
                      Templates: <span className="font-mono">{`{contact.name}`}</span> · <span className="font-mono">{`{contact.firstName}`}</span>
                    </div>
                  </label>
                  <label className="block">
                    <div className="text-xs font-semibold text-zinc-700">Phone</div>
                    <input
                      value={manualPhone}
                      onChange={(e) => setManualPhone(e.target.value)}
                      placeholder="+1 (555) 555-5555"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                    <div className="mt-1 text-[11px] text-zinc-500">
                      Templates: <span className="font-mono">{`{contact.phone}`}</span>
                    </div>
                  </label>
                  <label className="block">
                    <div className="text-xs font-semibold text-zinc-700">Email</div>
                    <input
                      value={manualEmail}
                      onChange={(e) => setManualEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                    <div className="mt-1 text-[11px] text-zinc-500">
                      Templates: <span className="font-mono">{`{contact.email}`}</span>
                    </div>
                  </label>
                  <div className="block">
                    <div className="text-xs font-semibold text-zinc-700">Tags</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {manualTagValues.length ? (
                        manualTagValues.map((t) => (
                          <button
                            key={t}
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                            title="Remove tag"
                            onClick={() => setManualTagValues((prev) => (prev ?? []).filter((x) => String(x || "").trim().toLowerCase() !== String(t || "").trim().toLowerCase()))}
                          >
                            {t}
                            <span className="text-zinc-400">×</span>
                          </button>
                        ))
                      ) : (
                        <div className="text-sm text-zinc-600">No tags yet.</div>
                      )}
                    </div>

                    <div className="mt-2">
                      <PortalSelectDropdown<string>
                        value={""}
                        onChange={(v) => {
                          const val = String(v || "").trim();
                          if (!val) return;
                          if (val === "__new_tag__") {
                            setManualCreateTagOpen(true);
                            return;
                          }
                          addManualTagValue(val);
                        }}
                        options={[
                          { value: "", label: "Select a tag…", disabled: true },
                          ...ownerTags
                            .map((t) => String(t.name || "").trim())
                            .filter(Boolean)
                            .filter((name) => !manualTagValues.some((x) => String(x || "").trim().toLowerCase() === name.toLowerCase()))
                            .slice(0, 250)
                            .map((name) => ({ value: name, label: name })),
                          { value: "__new_tag__", label: "New tag…" },
                        ]}
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none hover:bg-zinc-50 focus:border-(--color-brand-blue)"
                      />
                    </div>

                    {manualCreateTagOpen ? (
                      <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs font-semibold text-zinc-600">Create new tag</div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <input
                            className="sm:col-span-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--color-brand-blue)"
                            placeholder="Tag name"
                            value={manualCreateTagName}
                            onChange={(e) => setManualCreateTagName(e.target.value)}
                            autoFocus
                          />
                          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2 py-2">
                            {DEFAULT_TAG_COLORS.slice(0, 10).map((c) => {
                              const selected = c === manualCreateTagColor;
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  className={classNames(
                                    "h-6 w-6 rounded-full border",
                                    selected ? "border-zinc-900 ring-2 ring-zinc-900/20" : "border-zinc-200",
                                  )}
                                  style={{ backgroundColor: c }}
                                  onClick={() => setManualCreateTagColor(c)}
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
                              setManualCreateTagOpen(false);
                              setManualCreateTagName("");
                              setManualCreateTagColor("#2563EB");
                            }}
                            disabled={manualCreateTagBusy}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                            disabled={manualCreateTagBusy}
                            onClick={() => void createOwnerTagForManual()}
                          >
                            {manualCreateTagBusy ? "Creating…" : "Create"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-1 text-[11px] text-zinc-500">
                      Templates: <span className="font-mono">{`{contact.tags}`}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold text-zinc-700">Custom variables</div>
                  <div className="mt-2 space-y-2">
                    {manualCustomVarRows.length ? (
                      manualCustomVarRows.map((row, idx) => (
                        <div key={`${idx}-${row.key}`} className="grid grid-cols-1 gap-2 md:grid-cols-5">
                          <input
                            value={row.key}
                            onChange={(e) =>
                              setManualCustomVarRows((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], key: e.target.value };
                                return next;
                              })
                            }
                            placeholder="key (e.g. city)"
                            className="md:col-span-2 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                          <input
                            value={row.value}
                            onChange={(e) =>
                              setManualCustomVarRows((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], value: e.target.value };
                                return next;
                              })
                            }
                            placeholder="value"
                            className="md:col-span-3 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          />
                          <div className="md:col-span-5 flex justify-end">
                            <button
                              type="button"
                              className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                              onClick={() => setManualCustomVarRows((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-zinc-600">No custom variables saved yet. Add one below.</div>
                    )}
                    <button
                      type="button"
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                      onClick={() => {
                        setCustomVarPickerMode("manual");
                        setCustomVarPickerOpen(true);
                      }}
                    >
                      Add variable
                    </button>
                    <div className="text-xs text-zinc-500">Available in templates as {"{contact.custom.<key>}"}.</div>
                  </div>
                </div>

                {manualError ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                    {manualError}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-zinc-500">Tip: Name is required.</div>
                  <button
                    type="button"
                    disabled={manualBusy}
                    onClick={() =>
                      void (async () => {
                        setManualBusy(true);
                        setManualError(null);
                        try {
                          const res = await fetch("/api/portal/people/contacts", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              name: manualName,
                              email: manualEmail,
                              phone: manualPhone,
                              tags: (manualTagValues || []).join(", "),
                              customVariables: customVariablesFromRows(manualCustomVarRows),
                            }),
                          });
                          const json = (await res.json().catch(() => ({}))) as any;
                          if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Failed to add contact"));
                          toast.success("Contact added");
                          setImportOpen(false);

                          setContactsCursor(null);
                          setLeadsCursor(null);
                          setContactsCursorStack([null]);
                          setLeadsCursorStack([null]);
                          void load({ contactsCursor: null, leadsCursor: null });
                        } catch (err: any) {
                          setManualError(String(err?.message || "Failed to add contact"));
                        } finally {
                          setManualBusy(false);
                        }
                      })()
                    }
                    className={classNames(
                      "rounded-2xl px-5 py-2.5 text-sm font-semibold",
                      manualBusy ? "bg-zinc-200 text-zinc-600" : "bg-(--color-brand-blue) text-white hover:opacity-95",
                    )}
                  >
                    {manualBusy ? "Adding…" : "Add contact"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold text-zinc-600">CSV file</div>
                <input
                  id="contacts-csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setImportError(null);
                    setImportFile(f);
                    if (!f) {
                      setImportHeaders([]);
                      setImportRows([]);
                      return;
                    }

                    void (async () => {
                      try {
                        const text = await f.text();
                        const parsed = parseCsv(text, { maxRows: 2000 });
                        const headers = parsed.headers.filter((h) => Boolean(String(h || "").trim()));
                        if (!headers.length) throw new Error("CSV must include a header row");
                        setImportHeaders(headers);
                        setImportRows(parsed.rows);
                        setImportMapping(guessMapping(headers));
                      } catch (err: any) {
                        setImportHeaders([]);
                        setImportRows([]);
                        setImportError(String(err?.message || "Failed to read CSV"));
                      }
                    })();
                  }}
                />

                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <label
                      htmlFor="contacts-csv-file"
                      className="inline-flex cursor-pointer items-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                    >
                      Choose file
                    </label>
                    <div className="text-sm text-zinc-700">{importFile ? importFile.name : "No file selected"}</div>
                  </div>
                </div>

                {importError ? (
                  <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
                    {importError}
                  </div>
                ) : null}
              </div>
            )}

            {addMode === "csv" && importHeaders.length ? (
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="text-sm font-semibold text-zinc-900">Field mapping</div>
                  <div className="mt-1 text-xs text-zinc-500">Adjust anything we guessed wrong. Leave Tags blank to auto-detect.</div>

                  {(
                    [
                      { key: "name", label: "Name" },
                      { key: "firstName", label: "First name" },
                      { key: "lastName", label: "Last name" },
                      { key: "email", label: "Email" },
                      { key: "phone", label: "Phone" },
                      { key: "tags", label: "Tags (optional)" },
                    ] as const
                  ).map((f) => (
                    <label key={f.key} className="mt-3 block">
                      <div className="text-xs font-semibold text-zinc-700">{f.label}</div>
                      <div className="mt-1">
                        <PortalListboxDropdown
                          value={String((importMapping as any)[f.key] || "")}
                          onChange={(v) => setImportMapping((m) => ({ ...m, [f.key]: v }))}
                          options={[
                            { value: "", label: "None" },
                            ...importHeaders.map((h) => ({ value: h, label: h })),
                          ]}
                          placeholder="None"
                        />
                      </div>
                    </label>
                  ))}
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">Preview</div>
                      <div className="mt-1 text-xs text-zinc-500">Showing up to 5 rows.</div>
                    </div>
                    <div className="text-xs text-zinc-500">Rows: {importRows.length}</div>
                  </div>

                  <div className="mt-3 overflow-auto rounded-2xl border border-zinc-200">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-zinc-50 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="px-3 py-2">Name</th>
                          <th className="px-3 py-2">Email</th>
                          <th className="px-3 py-2">Phone</th>
                          <th className="px-3 py-2">Tags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 5).map((r, idx) => {
                          const headerIndex = new Map(importHeaders.map((h, i) => [h, i] as const));
                          const cell = (h: string) => {
                            const i = headerIndex.get(h);
                            return i === undefined ? "" : String(r[i] ?? "");
                          };

                          const rawName = importMapping.name ? cell(importMapping.name) : "";
                          const rawFirst = importMapping.firstName ? cell(importMapping.firstName) : "";
                          const rawLast = importMapping.lastName ? cell(importMapping.lastName) : "";
                          const name = rawName || `${rawFirst} ${rawLast}`.trim();

                          const tagsText = (() => {
                            if (importMapping.tags) return cell(importMapping.tags);
                            const tagHeaders = detectTagHeaders(importHeaders);
                            if (!tagHeaders.length) return "";
                            const combined: string[] = [];
                            for (const h of tagHeaders) combined.push(...splitTags(cell(h)));
                            const uniq: string[] = [];
                            const seen = new Set<string>();
                            for (const t of combined) {
                              const k = normalizeHeaderKey(t);
                              if (!k || seen.has(k)) continue;
                              seen.add(k);
                              uniq.push(t);
                              if (uniq.length >= 10) break;
                            }
                            return uniq.join(", ");
                          })();

                          return (
                            <tr key={idx} className="border-t border-zinc-200">
                              <td className="px-3 py-2 max-w-45 truncate">{name || "n/a"}</td>
                              <td className="px-3 py-2 max-w-45 truncate">{importMapping.email ? cell(importMapping.email) : "n/a"}</td>
                              <td className="px-3 py-2 max-w-40 truncate">{importMapping.phone ? cell(importMapping.phone) : "n/a"}</td>
                              <td className="px-3 py-2 max-w-45 truncate">{tagsText || "n/a"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}

            {addMode === "csv" ? (
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-zinc-500">
                Tip: include columns like Name, Email, Phone, Tags.
              </div>
              <button
                type="button"
                disabled={!importFile || importBusy}
                onClick={() =>
                  void (async () => {
                    if (!importFile) return;
                    setImportBusy(true);
                    setImportError(null);

                    try {
                      const fd = new FormData();
                      fd.set("file", importFile);
                      fd.set(
                        "mapping",
                        JSON.stringify({
                          name: importMapping.name || null,
                          firstName: importMapping.firstName || null,
                          lastName: importMapping.lastName || null,
                          email: importMapping.email || null,
                          phone: importMapping.phone || null,
                          tags: importMapping.tags || null,
                        }),
                      );

                      const res = await fetch("/api/portal/people/contacts/import", {
                        method: "POST",
                        body: fd,
                      });
                      const json = (await res.json().catch(() => ({}))) as any;
                      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Import failed"));

                      const importedCount = Number(json.imported || 0) || 0;
                      const skippedDupes = Number(json.skippedDuplicates || 0) || 0;
                      const dupesIndexes = Array.isArray(json.duplicateRowIndexes)
                        ? (json.duplicateRowIndexes as any[])
                            .map((n) => Number(n))
                            .filter((n) => Number.isFinite(n) && n >= 0)
                            .map((n) => Math.floor(n))
                        : [];

                      if (skippedDupes > 0) {
                        toast.success(`Imported ${importedCount} contact(s). Skipped ${skippedDupes} duplicate(s).`);
                        setImportDupesCount(skippedDupes);
                        setImportDupesRowIndexes(dupesIndexes);
                        setImportDupesOpen(true);
                      } else {
                        toast.success(`Imported ${importedCount} contact(s)`);
                      }

                      setImportOpen(false);

                      setContactsCursor(null);
                      setLeadsCursor(null);
                      setContactsCursorStack([null]);
                      setLeadsCursorStack([null]);
                      void load({ contactsCursor: null, leadsCursor: null });
                    } catch (err: any) {
                      setImportError(String(err?.message || "Import failed"));
                    } finally {
                      setImportBusy(false);
                    }
                  })()
                }
                className={classNames(
                  "rounded-2xl px-5 py-2.5 text-sm font-semibold",
                  !importFile || importBusy ? "bg-zinc-200 text-zinc-600" : "bg-(--color-brand-blue) text-white hover:opacity-95",
                )}
              >
                {importBusy ? "Importing…" : "Import"}
              </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {importDupesOpen ? (
        <div
          className="fixed inset-0 z-8000 flex items-start justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Duplicates skipped"
          style={{
            paddingTop: "calc(var(--pa-modal-safe-top, 0px) + 16px)",
            paddingBottom: "calc(var(--pa-modal-safe-bottom, 0px) + 16px)",
          }}
          onClick={() => {
            if (importDupesBusy) return;
            setImportDupesOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-lg max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-32px)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold text-zinc-900">Duplicates skipped</div>
            <div className="mt-1 text-sm text-zinc-600">
              Skipped {importDupesCount} duplicate contact(s) (matched an existing contact on 3+ fields).
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              Would you like to add them anyway?
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={importDupesBusy}
                onClick={() => setImportDupesOpen(false)}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              >
                Not now
              </button>
              <button
                type="button"
                disabled={importDupesBusy || !importFile || importDupesRowIndexes.length === 0}
                onClick={() =>
                  void (async () => {
                    if (!importFile) return;
                    if (!importDupesRowIndexes.length) return;
                    setImportDupesBusy(true);
                    try {
                      const fd = new FormData();
                      fd.set("file", importFile);
                      fd.set(
                        "mapping",
                        JSON.stringify({
                          name: importMapping.name || null,
                          firstName: importMapping.firstName || null,
                          lastName: importMapping.lastName || null,
                          email: importMapping.email || null,
                          phone: importMapping.phone || null,
                          tags: importMapping.tags || null,
                        }),
                      );
                      fd.set("allowDuplicates", "1");
                      fd.set("onlyRowIndexes", JSON.stringify(importDupesRowIndexes));

                      const res = await fetch("/api/portal/people/contacts/import", {
                        method: "POST",
                        body: fd,
                      });
                      const json = (await res.json().catch(() => ({}))) as any;
                      if (!res.ok || !json?.ok) throw new Error(String(json?.error || "Import failed"));

                      toast.success(`Added ${Number(json.imported || 0)} duplicate contact(s)`);
                      setImportDupesOpen(false);

                      setContactsCursor(null);
                      setLeadsCursor(null);
                      setContactsCursorStack([null]);
                      setLeadsCursorStack([null]);
                      void load({ contactsCursor: null, leadsCursor: null });
                    } catch (err: any) {
                      toast.error(String(err?.message || "Failed to add duplicates"));
                    } finally {
                      setImportDupesBusy(false);
                    }
                  })()
                }
                className={classNames(
                  "rounded-2xl px-5 py-2 text-sm font-semibold",
                  importDupesBusy || !importFile || importDupesRowIndexes.length === 0
                    ? "bg-zinc-200 text-zinc-600"
                    : "bg-(--color-brand-blue) text-white hover:opacity-95",
                )}
              >
                {importDupesBusy ? "Adding…" : "Add duplicates anyway"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailOpen ? (
        <div
          className="fixed inset-0 z-8000 flex items-start justify-center bg-black/40 px-4"
          style={{
            paddingTop: "calc(var(--pa-modal-safe-top, 0px) + 16px)",
            paddingBottom: "calc(var(--pa-modal-safe-bottom, 0px) + 16px)",
          }}
        >
          <div className="w-full max-w-3xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-32px)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
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
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 outline-none focus:border-(--color-brand-blue)"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Full name"
                  />
                ) : (
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{detail?.name ?? "N/A"}</div>
                )}
                <div className="mt-3 text-xs font-semibold text-zinc-600">Email</div>
                {editingContact ? (
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-(--color-brand-blue)"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="email@company.com"
                  />
                ) : (
                  <div className="mt-1 text-sm text-zinc-800">{detail?.email ?? "N/A"}</div>
                )}
                <div className="mt-3 text-xs font-semibold text-zinc-600">Phone</div>
                {editingContact ? (
                  <input
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-(--color-brand-blue)"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+15551234567"
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
                      <span className="font-semibold text-zinc-600">First name</span>
                      <span className="rounded-lg border border-zinc-200 bg-white px-2 py-1 font-mono">{"{contact.firstName}"}</span>
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
                {editingContact ? (
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
                      onClick={() => {
                        setCustomVarPickerMode("edit");
                        setCustomVarPickerOpen(true);
                      }}
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
                              <div className="mt-0.5 text-xs text-zinc-500 break-all">
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
                        className="rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95"
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
                            setEditCustomVarRows(rowsFromCustomVariables(detail?.customVariables));
                          }}
                          disabled={savingContact}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
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
                    <div className="mt-1">
                      <PortalSelectDropdown<string>
                        value={""}
                        onChange={(tagId) => {
                          if (!tagId) return;
                          if (tagId === "__new_tag__") {
                            setCreateTagOpen(true);
                            return;
                          }
                          void addTagToSelected(tagId);
                        }}
                        disabled={!selectedContactId}
                        options={[
                          { value: "", label: "Select a tag…", disabled: true },
                          ...ownerTags
                            .filter((t) => !detailTags.some((x) => x.id === t.id))
                            .map((t) => ({ value: t.id, label: t.name })),
                          { value: "__new_tag__", label: "New tag…" },
                        ]}
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none hover:bg-zinc-50 focus:border-(--color-brand-blue)"
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

            <div className="mt-6 grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-zinc-200 p-4">
                <div className="text-sm font-semibold text-zinc-900">Linked leads</div>
                {data?.unlinkedLeads?.length ? (
                  <div className="mt-2">
                    <label className="text-xs font-semibold text-zinc-600">Link a lead</label>
                    <div className="mt-1">
                      <PortalSelectDropdown<string>
                        value={""}
                        onChange={(leadId) => {
                          if (!leadId) return;
                          void linkLeadToSelected(leadId);
                        }}
                        disabled={!selectedContactId || savingLead}
                        options={[
                          { value: "", label: "Select an unlinked lead…", disabled: true },
                          ...data.unlinkedLeads.slice(0, 250).map((l) => ({
                            value: l.id,
                            label: `${l.businessName}${l.email ? ` • ${l.email}` : ""}${l.phone ? ` • ${l.phone}` : ""}`,
                          })),
                        ]}
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                      />
                    </div>
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
        <div
          className="fixed inset-0 z-8000 flex items-start justify-center bg-black/40 px-4"
          style={{
            paddingTop: "calc(var(--pa-modal-safe-top, 0px) + 16px)",
            paddingBottom: "calc(var(--pa-modal-safe-bottom, 0px) + 16px)",
          }}
        >
          <div className="w-full max-w-xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-32px)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl">
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
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--color-brand-blue)"
                  value={leadBusinessName}
                  onChange={(e) => setLeadBusinessName(e.target.value)}
                  placeholder="Business name"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-zinc-700">Email</div>
                  <input
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--color-brand-blue)"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    placeholder="email@company.com"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-700">Phone</div>
                  <input
                    className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--color-brand-blue)"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    placeholder="+15551234567"
                  />
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-700">Website</div>
                <input
                  className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-(--color-brand-blue)"
                  value={leadWebsite}
                  onChange={(e) => setLeadWebsite(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-zinc-700">Link to contact (optional)</div>
                <div className="mt-1">
                  <PortalSelectDropdown<string>
                    value={leadLinkContactId}
                    onChange={setLeadLinkContactId}
                    options={[
                      { value: "", label: "Don’t link" },
                      ...(data?.contacts || []).slice(0, 400).map((c) => ({
                        value: c.id,
                        label: `${c.name}${c.email ? ` • ${c.email}` : ""}${c.phone ? ` • ${c.phone}` : ""}`,
                      })),
                    ]}
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                  />
                </div>
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
                className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
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
