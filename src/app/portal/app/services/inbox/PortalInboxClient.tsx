"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./PortalInboxClient.module.css";
import { AppModal } from "@/components/AppModal";
import { InlineSpinner } from "@/components/InlineSpinner";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { ContactTagsEditor, type ContactTag } from "@/components/ContactTagsEditor";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { PortalContactDetailsModal } from "@/components/PortalContactDetailsModal";
import { useToast } from "@/components/ToastProvider";
import { PortalBackToOnboardingLink } from "@/components/PortalBackToOnboardingLink";
import { DateTimePicker } from "@/components/DateTimePicker";
import { IconFunnel, IconSchedule, IconSearch, IconSend, IconSendHover, IconServiceGlyph } from "@/app/portal/PortalIcons";
import { normalizePhoneForStorage } from "@/lib/phone";
import { normalizePortalContactCustomVarKey, PORTAL_MESSAGE_VARIABLES } from "@/lib/portalTemplateVars";

type Channel = "email" | "sms";
type EmailBox = "inbox" | "sent" | "all";
type DateFilter = "any" | "7d" | "30d" | "90d";

type Thread = {
  id: string;
  channel: "EMAIL" | "SMS";
  peerAddress: string;
  contactId: string | null;
  contact?: { id: string; name: string; email: string | null; phone: string | null } | null;
  contactTags?: ContactTag[];
  subject: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageDirection: "IN" | "OUT";
  lastMessageFrom: string;
  lastMessageTo: string;
  lastMessageSubject: string | null;
};

type Message = {
  id: string;
  channel: "EMAIL" | "SMS";
  direction: "IN" | "OUT";
  fromAddress: string;
  toAddress: string;
  subject: string | null;
  bodyText: string;
  createdAt: string;
  attachments?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    url: string;
  }>;
};

type ScheduledMessage = {
  id: string;
  channel: "EMAIL" | "SMS";
  toAddress: string;
  subject: string | null;
  bodyText: string;
  scheduledFor: string;
  status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "CANCELED" | string;
  createdAt: string;
  updatedAt: string;
  attachments?: UploadedAttachment[];
};

type SettingsRes = {
  ok: true;
  settings: { webhookToken: string };
  twilio: { configured: boolean; fromNumberE164: string | null };
  webhooks: {
    twilioInboundSmsUrl: string;
  };
};

type ApiErrorRes = { ok: false; code?: string; error?: string };
type ThreadsRes = { ok: true; threads: Thread[] } | ApiErrorRes;
type MessagesRes = { ok: true; messages: Message[]; scheduledMessages?: ScheduledMessage[] } | ApiErrorRes;

type ContactLite = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type UploadedAttachment = NonNullable<Message["attachments"]>[number];

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type FixedMenuStyle = { left: number; top: number; width: number; maxHeight: number };

function computeFixedMenuStyle(opts: {
  rect: DOMRect;
  width: number;
  estHeight: number;
  alignX: "left" | "right";
  minHeight?: number;
}) {
  const VIEWPORT_PAD = 12;
  const GAP = 8;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  const width = Math.max(160, Math.min(opts.width, viewportW - VIEWPORT_PAD * 2));
  const estHeight = Math.max(120, opts.estHeight);

  let left = opts.alignX === "right" ? opts.rect.right - width : opts.rect.left;
  left = Math.max(VIEWPORT_PAD, Math.min(viewportW - VIEWPORT_PAD - width, left));

  const spaceBelow = viewportH - opts.rect.bottom - GAP - VIEWPORT_PAD;
  const spaceAbove = opts.rect.top - GAP - VIEWPORT_PAD;
  const placeDown = spaceBelow >= Math.min(estHeight, 240) || spaceBelow >= spaceAbove;

  const available = placeDown ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(opts.minHeight ?? 140, Math.min(estHeight, available));
  const usedHeight = Math.min(estHeight, maxHeight);

  const rawTop = placeDown ? opts.rect.bottom + GAP : opts.rect.top - GAP - usedHeight;
  const top = Math.max(VIEWPORT_PAD, Math.min(viewportH - VIEWPORT_PAD - usedHeight, rawTop));

  return { left, top, width, maxHeight } satisfies FixedMenuStyle;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatTimeOnly(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDayOrTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatBytes(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function firstLinePreview(text: string) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.slice(0, 90);
}

function mailSubjectOrNo(subject: string | null) {
  const s = String(subject ?? "").trim();
  return s || "(no subject)";
}

function displayNameFromAddress(addrRaw: string) {
  const addr = String(addrRaw ?? "").trim();
  if (!addr) return "Unknown";
  const at = addr.indexOf("@");
  if (at > 0) return addr.slice(0, at);
  return addr;
}

function safeEmailFromPeer(raw: string) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

export function PortalInboxClient(props: { initialChannel?: Channel } = {}) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const { initialChannel } = props;

  const basePath = useMemo(() => {
    const p = String(pathname || "/portal/app/services/inbox");
    if (p.endsWith("/email")) return p.slice(0, -"/email".length);
    if (p.endsWith("/sms")) return p.slice(0, -"/sms".length);
    return p;
  }, [pathname]);

  const [tab, setTab] = useState<Channel>(() => {
    if (initialChannel) return initialChannel;
    const p = String(pathname || "");
    if (p.endsWith("/sms")) return "sms";
    if (p.endsWith("/email")) return "email";

    if (typeof window === "undefined") return "email";
    const sp = new URLSearchParams(window.location.search);
    const ch = String(sp.get("channel") || "").toLowerCase();
    return ch === "sms" ? "sms" : "email";
  });

  useEffect(() => {
    if (!initialChannel) return;
    setTab(initialChannel);
  }, [initialChannel]);
  const [emailBox, setEmailBox] = useState<EmailBox>("inbox");
  const [threadSearch, setThreadSearch] = useState<string>("");
  const [emailFiltersMenu, setEmailFiltersMenu] = useState<FixedMenuStyle | null>(null);
  const [emailDateFilter, setEmailDateFilter] = useState<DateFilter>("any");
  const [emailHasAttachmentsOnly, setEmailHasAttachmentsOnly] = useState(false);
  const [smsFiltersMenu, setSmsFiltersMenu] = useState<FixedMenuStyle | null>(null);
  const [smsDateFilter, setSmsDateFilter] = useState<DateFilter>("any");
  const [smsIncomingOnly, setSmsIncomingOnly] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const hasLoadedThreadsOnceRef = useRef<{ email: boolean; sms: boolean }>({ email: false, sms: false });
  const [refreshingThreads, setRefreshingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [emailAttachMenu, setEmailAttachMenu] = useState<FixedMenuStyle | null>(null);
  const [smsSheetOpen, setSmsSheetOpen] = useState(false);

  const initialDeepLink = useMemo(() => {
    if (typeof window === "undefined") {
      return { threadId: null as string | null, to: null as string | null, compose: false };
    }
    const p = new URLSearchParams(window.location.search);
    const threadId = String(p.get("threadId") || "").trim() || null;
    const to = String(p.get("to") || "").trim() || null;
    const composeRaw = String(p.get("compose") || "").trim().toLowerCase();
    const compose = composeRaw === "1" || composeRaw === "true" || composeRaw === "yes";
    return { threadId, to, compose };
  }, []);

  const preferredThreadIdRef = useRef<string | null>(initialDeepLink.threadId);
  const preferredToRef = useRef<string | null>(initialDeepLink.to);
  const preferredComposeRef = useRef<boolean>(Boolean(initialDeepLink.compose));

  function splitComposeRecipients(raw: string): string[] {
    const s = String(raw || "").trim();
    if (!s) return [];
    const parts = s
      .split(/[\n\r,;]+/g)
      .map((p) => p.trim())
      .filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const p of parts) {
      const k = p.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
      if (out.length >= 50) break;
    }
    return out;
  }

  function pickThreadIdFromTo(nextTab: Channel, nextThreads: Thread[], toRaw: string) {
    const recipients = splitComposeRecipients(toRaw);
    if (recipients.length !== 1) return null;
    const to = recipients[0] || "";
    if (!to) return null;

    if (nextTab === "email") {
      const needle = to.toLowerCase();
      return nextThreads.find((t) => String(t.peerAddress || "").trim().toLowerCase() === needle)?.id ?? null;
    }

    const normalized = normalizePhoneForStorage(to);
    if (!normalized) return null;
    return nextThreads.find((t) => String(t.peerAddress || "").trim() === normalized)?.id ?? null;
  }

  useEffect(() => {
    if (error) toast.error(error);
  }, [error, toast]);

  const [settings, setSettings] = useState<SettingsRes | null>(null);

  function setChannel(next: Channel) {
    setTab(next);
    if (typeof window === "undefined") return;
    const search = window.location.search || "";
    router.replace(`${basePath}/${next}${search}`);
  }

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  function updateThreadTags(threadId: string, next: ContactTag[]) {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, contactTags: next } : t)));
  }

  const visibleThreads = useMemo(() => {
    if (tab !== "email") return threads;
    if (emailBox === "all") return threads;
    const dir = emailBox === "inbox" ? "IN" : "OUT";
    return threads.filter((t) => t.lastMessageDirection === dir);
  }, [threads, tab, emailBox]);

  const visibleThreadsWithFilters = useMemo(() => {
    const now = Date.now();

    const activeDateFilter = tab === "email" ? emailDateFilter : tab === "sms" ? smsDateFilter : "any";
    const days =
      activeDateFilter === "7d" ? 7 : activeDateFilter === "30d" ? 30 : activeDateFilter === "90d" ? 90 : 0;

    return visibleThreads.filter((t) => {
      if (days > 0) {
        const ts = new Date(t.lastMessageAt).getTime();
        if (!Number.isFinite(ts)) return false;
        if (now - ts > days * 24 * 60 * 60 * 1000) return false;
      }

      if (tab === "email" && emailHasAttachmentsOnly) {
        // Threads API doesn't currently expose attachments, so do best-effort:
        // treat subjects/previews that mention common attachment hints as a match.
        const hay = `${t.subject ?? ""} ${t.lastMessageSubject ?? ""} ${t.lastMessagePreview ?? ""}`.toLowerCase();
        const looksLikeAttachment =
          hay.includes("attachment") ||
          hay.includes("attached") ||
          hay.includes(".pdf") ||
          hay.includes(".doc") ||
          hay.includes(".docx") ||
          hay.includes(".xls") ||
          hay.includes(".xlsx") ||
          hay.includes(".png") ||
          hay.includes(".jpg") ||
          hay.includes(".jpeg") ||
          hay.includes(".gif");
        if (!looksLikeAttachment) return false;
      }

      if (tab === "sms" && smsIncomingOnly) {
        if (t.lastMessageDirection !== "IN") return false;
      }

      return true;
    });
  }, [emailDateFilter, emailHasAttachmentsOnly, smsDateFilter, smsIncomingOnly, tab, visibleThreads]);

  const filteredThreads = useMemo(() => {
    const q = threadSearch.trim().toLowerCase();
    if (!q) return visibleThreadsWithFilters;
    return visibleThreadsWithFilters.filter((t) => {
      const hay = [
        t.contact?.name,
        t.peerAddress,
        t.subject,
        t.lastMessageSubject,
        t.lastMessagePreview,
        t.lastMessageFrom,
        t.lastMessageTo,
      ]
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .join(" \n")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [threadSearch, visibleThreadsWithFilters]);

  const [composeTo, setComposeTo] = useState<string>("");
  const [composeSubject, setComposeSubject] = useState<string>("");
  const [composeBody, setComposeBody] = useState<string>("");
  const [composeAttachments, setComposeAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleEditingId, setScheduleEditingId] = useState<string | null>(null);

  const [contacts, setContacts] = useState<ContactLite[] | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [toSuggestionsMenu, setToSuggestionsMenu] = useState<FixedMenuStyle | null>(null);

  const smsToRef = useRef<HTMLInputElement | null>(null);
  const emailToRef = useRef<HTMLInputElement | null>(null);
  const emailComposerFileRef = useRef<HTMLInputElement | null>(null);

  const [smsMoreMenu, setSmsMoreMenu] = useState<FixedMenuStyle | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  const [variablePickerOpen, setVariablePickerOpen] = useState(false);
  const [variablePickerTarget, setVariablePickerTarget] = useState<null | "sms_body" | "email_subject" | "email_body">(null);

  const [knownContactCustomVarKeys, setKnownContactCustomVarKeys] = useState<string[]>([]);

  const anyInlineMenuOpen = Boolean(emailFiltersMenu || smsFiltersMenu || toSuggestionsMenu || smsMoreMenu || emailAttachMenu);
  useEffect(() => {
    if (!anyInlineMenuOpen) return;

    const closeAll = () => {
      setEmailFiltersMenu(null);
      setSmsFiltersMenu(null);
      setToSuggestionsMenu(null);
      setSmsMoreMenu(null);
      setEmailAttachMenu(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };

    const onScrollOrResize = () => closeAll();

    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [anyInlineMenuOpen, emailAttachMenu, emailFiltersMenu, smsFiltersMenu, smsMoreMenu, toSuggestionsMenu]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/people/contacts/custom-variable-keys", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok || !json?.ok || !Array.isArray(json.keys)) return;
        const keys = json.keys.map((k: any) => String(k || "").trim()).filter(Boolean).slice(0, 50);
        if (!canceled) setKnownContactCustomVarKeys(keys);
      } catch {
        // ignore
      }
    })();

    return () => {
      canceled = true;
    };
  }, []);

  const variablePickerVariables = useMemo(() => {
    const base = PORTAL_MESSAGE_VARIABLES.slice();
    const keys = Array.isArray(knownContactCustomVarKeys) ? knownContactCustomVarKeys : [];
    for (const k of keys) {
      base.push({
        key: `contact.custom.${k}`,
        label: `Contact custom: ${k}`,
        group: "Custom",
        appliesTo: "Lead/contact",
      });
    }
    return base;
  }, [knownContactCustomVarKeys]);

  const smsComposeRef = useRef<HTMLInputElement | null>(null);
  const emailSubjectRef = useRef<HTMLInputElement | null>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement | null>(null);

  const clearConversationForCompose = useCallback(() => {
    setActiveThreadId(null);
    setMessages([]);
    setScheduledMessages([]);
    setLoadingMessages(false);
  }, []);

  const openEmailComposer = useCallback(() => {
    setEmailComposerOpen(true);
    setEmailAttachMenu(null);
    setThreadSearch("");
    clearConversationForCompose();
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setComposeAttachments([]);
  }, [clearConversationForCompose]);

  async function ensureContactsLoaded() {
    if (contacts || contactsLoading) return;
    setContactsLoading(true);
    try {
      const res = await fetch("/api/portal/people/contacts", { cache: "no-store" }).catch(() => null as any);
      const data = (await res?.json?.().catch(() => null)) as any;
      if (!res?.ok || !data?.ok || !Array.isArray(data.contacts)) {
        setContactsLoading(false);
        setContacts([]);
        return;
      }

      const next: ContactLite[] = data.contacts
        .map((c: any) => ({
          id: String(c.id || ""),
          name: String(c.name || "").slice(0, 80),
          email: c.email ? String(c.email) : null,
          phone: c.phone ? String(c.phone) : null,
        }))
        .filter((c: ContactLite) => c.id && c.name);

      setContactsLoading(false);
      setContacts(next);
    } catch {
      setContactsLoading(false);
      setContacts([]);
    }
  }

  function normalizeForMatch(raw: string) {
    return String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function findContactSuggestions(queryRaw: string) {
    const q = normalizeForMatch(queryRaw);
    if (!q || !contacts?.length) return [] as ContactLite[];

    const phoneNeedle = q.replace(/[^0-9+]/g, "");

    const scored = contacts
      .map((c) => {
        const name = normalizeForMatch(c.name);
        const email = normalizeForMatch(c.email || "");
        const phone = normalizeForMatch(c.phone || "");
        const phoneDigits = phone.replace(/[^0-9+]/g, "");

        let score = 0;
        if (name === q) score += 100;
        else if (name.startsWith(q)) score += 80;
        else if (name.includes(q)) score += 60;

        if (email && (email === q || email.startsWith(q) || email.includes(q))) score += 50;
        if (phoneNeedle && phoneDigits && (phoneDigits.startsWith(phoneNeedle) || phoneDigits.includes(phoneNeedle))) score += 40;

        return { c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.c);

    return scored;
  }

  function findThreadIdForContact(nextTab: Channel, contact: ContactLite) {
    if (nextTab === "email") {
      const email = String(contact.email || "").trim().toLowerCase();
      if (!email) return null;
      return (
        threads.find((t) => safeEmailFromPeer(t.peerAddress).toLowerCase() === email)?.id ??
        threads.find((t) => String(t.peerAddress || "").trim().toLowerCase() === email)?.id ??
        null
      );
    }

    const normalized = normalizePhoneForStorage(String(contact.phone || "").trim());
    if (!normalized) return null;
    return threads.find((t) => String(t.peerAddress || "").trim() === normalized)?.id ?? null;
  }

  function applyContactToCompose(contact: ContactLite) {
    const to = tab === "email" ? String(contact.email || "").trim() : String(contact.phone || "").trim();
    if (!to) {
      setError(tab === "email" ? "This contact doesn’t have an email address." : "This contact doesn’t have a phone number.");
      return;
    }

    setError(null);
    setToSuggestionsMenu(null);
    setComposeTo(to);
    setComposeAttachments([]);
    if (tab === "email") setComposeSubject("");
    setComposeBody("");
    clearConversationForCompose();

    const threadId = findThreadIdForContact(tab, contact);
    if (threadId) {
      setActiveThreadId(threadId);
    }
  }

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  const [peopleContactModalOpen, setPeopleContactModalOpen] = useState(false);
  const [peopleContactId, setPeopleContactId] = useState<string | null>(null);
  const [peopleContactThreadId, setPeopleContactThreadId] = useState<string | null>(null);

  const contactModalZ = 12110;
  const mediaPickerZ = 12130;

  const smsScrollRef = useRef<HTMLDivElement | null>(null);
  const smsFileRef = useRef<HTMLInputElement | null>(null);
  const emailFileRef = useRef<HTMLInputElement | null>(null);

  function updateThreadContact(
    threadId: string,
    next: { contactId: string | null; contact: Thread["contact"]; contactTags?: ContactTag[] },
  ) {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? {
              ...t,
              contactId: next.contactId,
              contact: next.contact,
              ...(next.contactTags ? { contactTags: next.contactTags } : {}),
            }
          : t,
      ),
    );
  }

  function openContactModalForActiveThread() {
    if (!activeThread) return;

    if (activeThread.contactId) {
      setPeopleContactId(activeThread.contactId);
      setPeopleContactThreadId(activeThread.id);
      setPeopleContactModalOpen(true);
      return;
    }

    const existing = activeThread.contact || null;
    const defaultName = existing?.name || displayNameFromAddress(activeThread.peerAddress);
    const defaultEmail =
      existing?.email || (activeThread.channel === "EMAIL" ? safeEmailFromPeer(activeThread.peerAddress) : "");
    const defaultPhone = existing?.phone || (activeThread.channel === "SMS" ? String(activeThread.peerAddress || "") : "");

    setContactName(defaultName);
    setContactEmail(defaultEmail);
    setContactPhone(defaultPhone);
    setContactModalOpen(true);
  }

  async function saveActiveThreadContact() {
    if (!activeThread) return;
    const name = String(contactName || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!name) return;

    setSavingContact(true);
    setError(null);

    try {
      const res = await fetch(`/api/portal/inbox/threads/${activeThread.id}/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email: String(contactEmail || "").trim(),
          phone: String(contactPhone || "").trim(),
        }),
      }).catch(() => null as any);

      const data = (await res?.json?.().catch(() => null)) as any;
      if (!res?.ok || !data?.ok) {
        setSavingContact(false);
        setError(data?.error || "Failed to save contact.");
        return;
      }

      updateThreadContact(activeThread.id, {
        contactId: data.contactId ? String(data.contactId) : null,
        contact: data.contact && data.contact.id ? data.contact : null,
        contactTags: Array.isArray(data.contactTags) ? data.contactTags : undefined,
      });

      setSavingContact(false);
      setContactModalOpen(false);
    } catch {
      setSavingContact(false);
      setError("Failed to save contact.");
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch("/api/portal/inbox/settings", { cache: "no-store" });
      if (!mounted) return;
      if (!res.ok) return;
      setSettings((await res.json()) as SettingsRes);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function loadThreads(nextTab: Channel, opts?: { preserveSelection?: boolean; clearUI?: boolean }) {
    const preserveSelection = Boolean(opts?.preserveSelection);
    const clearUI = Boolean(opts?.clearUI);
    const isFirstLoad = !hasLoadedThreadsOnceRef.current[nextTab];
    const useFullLoading = isFirstLoad || clearUI;
    if (useFullLoading) setLoadingThreads(true);
    else setRefreshingThreads(true);

    setError(null);

    const prevActiveThreadId = activeThreadId;

    if (clearUI) {
      setThreads([]);
      setMessages([]);
      setActiveThreadId(null);
    }

    try {
      const res = await fetch(`/api/portal/inbox/threads?channel=${nextTab}`, {
        cache: "no-store",
      });

      const json = (await res.json().catch(() => null)) as ThreadsRes | null;
      if (!res.ok || !json || json.ok !== true) {
        if (res.status === 401 || (json && json.ok === false && json.code === "SESSION_EXPIRED")) {
          setError("Your session expired. Please sign in again.");
          return;
        }
        const apiError = json && json.ok === false ? json.error : null;
        setError(
          apiError || (nextTab === "sms" ? "We couldn’t load your text message threads." : "We couldn’t load your email threads."),
        );
        return;
      }

      setThreads(json.threads);
      hasLoadedThreadsOnceRef.current[nextTab] = true;

      if (preserveSelection) {
        if (prevActiveThreadId && json.threads.some((t) => t.id === prevActiveThreadId)) {
          return;
        }
        if (json.threads.length) {
          if (nextTab === "email") setActiveThreadId(json.threads[0].id);
          else setActiveThreadId(null);
        }
        return;
      }

    const preferredThreadId = (preferredThreadIdRef.current || "").trim();
    const preferredTo = (preferredToRef.current || "").trim();
    const preferredCompose = Boolean(preferredComposeRef.current);

    if (preferredCompose) {
      setActiveThreadId(null);
      setComposeTo(preferredTo);
      if (nextTab === "email") setComposeSubject("");
      setComposeBody("");
      setComposeAttachments([]);
      preferredThreadIdRef.current = null;
      preferredToRef.current = null;
      preferredComposeRef.current = false;
      return;
    }

    let nextActiveId: string | null = null;
    if (preferredThreadId && json.threads.some((t) => t.id === preferredThreadId)) {
      nextActiveId = preferredThreadId;
    } else if (preferredTo) {
      nextActiveId = pickThreadIdFromTo(nextTab, json.threads, preferredTo);
    }

    if (nextActiveId) {
      setActiveThreadId(nextActiveId);
      preferredThreadIdRef.current = null;
      preferredToRef.current = null;
    } else if (json.threads.length) {
      if (nextTab === "email") setActiveThreadId(json.threads[0].id);
      else setActiveThreadId(null);
    } else if (preferredTo) {
      setComposeTo(preferredTo);
      preferredToRef.current = null;
    }
    } catch {
      setError(nextTab === "sms" ? "We couldn’t load your text message threads." : "We couldn’t load your email threads.");
    } finally {
      setLoadingThreads(false);
      setRefreshingThreads(false);
    }
  }

  async function loadMessages(threadId: string) {
    setLoadingMessages(true);
    setError(null);

    const res = await fetch(`/api/portal/inbox/threads/${threadId}/messages?take=250`, {
      cache: "no-store",
    });

    const json = (await res.json().catch(() => null)) as MessagesRes | null;
    if (!res.ok || !json || json.ok !== true) {
      setLoadingMessages(false);
      if (res.status === 401 || (json && json.ok === false && json.code === "SESSION_EXPIRED")) {
        setError("Your session expired. Please sign in again.");
        return;
      }
      const apiError = json && json.ok === false ? json.error : null;
      setError(apiError || "We couldn’t load this conversation.");
      return;
    }

    setMessages(json.messages);
    setScheduledMessages(Array.isArray(json.scheduledMessages) ? json.scheduledMessages : []);
    setLoadingMessages(false);
  }

  useEffect(() => {
    loadThreads(tab, { clearUI: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    // If the active thread is filtered out by the email box, pick the first visible thread.
    if (tab !== "email") return;
    if (!activeThreadId) return;
    if (visibleThreads.some((t) => t.id === activeThreadId)) return;
    setActiveThreadId(visibleThreads[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, emailBox, threads]);

  useEffect(() => {
    if (!activeThreadId) return;
    loadMessages(activeThreadId);
  }, [activeThreadId]);

  useEffect(() => {
    if (activeThreadId) return;
    setMessages([]);
    setScheduledMessages([]);
    setLoadingMessages(false);
  }, [activeThreadId]);

  useEffect(() => {
    // When switching threads, prefill compose-to/subject.
    if (!activeThread) return;
    setComposeTo(activeThread.peerAddress);
    if (tab === "email") setComposeSubject(activeThread.subject ?? "");
    setComposeAttachments([]);
  }, [activeThread, tab]);

  useEffect(() => {
    if (tab !== "sms") return;
    // Scroll to bottom for SMS like Messages.
    const el = smsScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [tab, activeThreadId, messages.length]);

  useEffect(() => {
    if (tab !== "sms") {
      if (smsSheetOpen) setSmsSheetOpen(false);
      return;
    }

    if (activeThreadId && !smsSheetOpen) {
      setSmsSheetOpen(true);
    }
  }, [activeThreadId, smsSheetOpen, tab]);

  async function uploadAttachments(files: FileList | null) {
    if (!files || !files.length) return;
    if (uploading) return;
    setError(null);
    setUploading(true);

    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));

      const res = await fetch("/api/portal/inbox/attachments", {
        method: "POST",
        body: form,
      });

      const json = (await res.json().catch(() => null)) as any;

      if (!res.ok || !json || json.ok !== true) {
        setUploading(false);
        setError(typeof json?.error === "string" ? json.error : "Upload failed");
        return;
      }

      const uploaded = (Array.isArray(json.attachments) ? json.attachments : []) as UploadedAttachment[];

      setComposeAttachments((prev) => {
        const next = [...prev];
        for (const a of uploaded) {
          if (!next.some((x) => x.id === a.id)) next.push(a);
        }
        return next.slice(0, 10);
      });
      setUploading(false);
    } catch {
      setUploading(false);
      setError("Upload failed. Please try again.");
    }
  }

  async function attachFromMediaLibrary(item: PortalMediaPickItem) {
    setError(null);
    const res = await fetch("/api/portal/inbox/attachments/from-media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaItemId: item.id }),
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok || !json?.attachment) {
      setError(typeof json?.error === "string" ? json.error : "Could not upload file");
      return;
    }

    const a = json.attachment as UploadedAttachment;
    setComposeAttachments((prev) => {
      const next = [...prev];
      if (!next.some((x) => x.id === a.id)) next.push(a);
      return next.slice(0, 10);
    });

    setMediaPickerOpen(false);
  }

  async function removeAttachment(id: string) {
    setComposeAttachments((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/portal/inbox/attachments/${id}`, { method: "DELETE" }).catch(() => null);
  }

  async function onSend(opts?: { sendAt?: string }): Promise<{ ok: true; threadId: string | null } | { ok: false }> {
    if (sending) return { ok: false };
    setError(null);

    const to = composeTo.trim();
    const body = composeBody.trim();
    const subject = composeSubject.trim();

    const recipients = splitComposeRecipients(to);
    if (activeThreadId && recipients.length > 1) {
      setError("Bulk send can’t be done inside a thread. Clear the active thread and try again.");
      return { ok: false };
    }

    if (!to || (!body && composeAttachments.length === 0)) {
      setError("To and message or attachment are required");
      return { ok: false };
    }

    setSending(true);
    const res = await fetch("/api/portal/inbox/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: tab,
        to,
        subject: tab === "email" ? subject : undefined,
        body,
        attachmentIds: composeAttachments.map((a) => a.id),
        ...(activeThreadId ? { threadId: activeThreadId } : {}),
        ...(opts?.sendAt ? { sendAt: opts.sendAt } : {}),
      }),
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      setSending(false);
      setError(typeof json?.error === "string" ? json.error : "Send failed");
      return { ok: false };
    }

    if (json?.scheduled) {
      const whenIso = typeof opts?.sendAt === "string" ? opts.sendAt : null;
      const scheduledCount = typeof json?.scheduledCount === "number" ? json.scheduledCount : null;
      const base = whenIso ? `Scheduled for ${formatWhen(whenIso)}` : "Scheduled";
      toast.success(scheduledCount && scheduledCount > 1 ? `${base} (${scheduledCount} recipients)` : base);
    }

    const sentCount = typeof json?.sent === "number" ? json.sent : null;
    const failedCount = typeof json?.failed === "number" ? json.failed : null;
    if (sentCount && sentCount > 1) {
      const suffix = failedCount ? ` (${failedCount} failed)` : "";
      toast.success(`Sent to ${sentCount} recipients${suffix}`);
    }

    const threadId = typeof json.threadId === "string" ? json.threadId : activeThreadId;

    setComposeBody("");
    setComposeAttachments([]);
    setSending(false);

    // Refresh threads + messages.
    await loadThreads(tab, { preserveSelection: true });
    if (threadId) setActiveThreadId(threadId);
    if (threadId) await loadMessages(threadId);

    return { ok: true, threadId: threadId ?? null };
  }

  function openSchedule() {
    setScheduleError(null);
    setScheduleEditingId(null);
    setScheduleAt(new Date(Date.now() + 15 * 60 * 1000));
    setScheduleOpen(true);
  }

  function openReschedule(msg: ScheduledMessage) {
    setScheduleError(null);
    setScheduleEditingId(msg.id);
    const d = new Date(msg.scheduledFor);
    setScheduleAt(Number.isNaN(d.getTime()) ? new Date(Date.now() + 15 * 60 * 1000) : d);
    setScheduleOpen(true);
  }

  async function rescheduleScheduledMessage(id: string, scheduledForIso: string): Promise<{ ok: true } | { ok: false }> {
    if (sending) return { ok: false };
    setError(null);
    setSending(true);
    const res = await fetch(`/api/portal/inbox/scheduled/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduledFor: scheduledForIso }),
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      setSending(false);
      setError(typeof json?.error === "string" ? json.error : "Could not reschedule");
      return { ok: false };
    }

    setSending(false);
    return { ok: true };
  }

  useEffect(() => {
    const needsElevated = emailComposerOpen || smsSheetOpen;
    if (!needsElevated) {
      try {
        document.documentElement.style.removeProperty("--pa-variable-picker-backdrop-z");
        document.documentElement.style.removeProperty("--pa-variable-picker-z");
      } catch {
        // ignore
      }
      return;
    }

    try {
      document.documentElement.style.setProperty("--pa-variable-picker-backdrop-z", "12050");
      document.documentElement.style.setProperty("--pa-variable-picker-z", "12060");
    } catch {
      // ignore
    }

    return () => {
      try {
        document.documentElement.style.removeProperty("--pa-variable-picker-backdrop-z");
        document.documentElement.style.removeProperty("--pa-variable-picker-z");
      } catch {
        // ignore
      }
    };
  }, [emailComposerOpen, smsSheetOpen]);

  function insertAtCursor(
    current: string,
    insert: string,
    el: HTMLInputElement | HTMLTextAreaElement | null,
  ): { next: string; caret: number } {
    const base = String(current ?? "");
    if (!el) {
      const next = base + insert;
      return { next, caret: next.length };
    }
    const start = typeof el.selectionStart === "number" ? el.selectionStart : base.length;
    const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
    const next = base.slice(0, start) + insert + base.slice(end);
    return { next, caret: start + insert.length };
  }

  function openVariablePicker(target: NonNullable<typeof variablePickerTarget>) {
    setVariablePickerTarget(target);
    setVariablePickerOpen(true);
  }

  function findContactIdForComposeTo(): string | null {
    const to = String(composeTo || "").trim();
    if (!to) return null;

    const list = Array.isArray(contacts) ? contacts : [];
    if (tab === "email") {
      const email = to.toLowerCase();
      const found = list.find((c) => String(c.email || "").trim().toLowerCase() === email);
      return found?.id ? String(found.id) : null;
    }

    const normalizedTo = normalizePhoneForStorage(to);
    if (!normalizedTo) return null;
    const found = list.find((c) => normalizePhoneForStorage(String(c.phone || "").trim()) === normalizedTo);
    return found?.id ? String(found.id) : null;
  }

  async function ensureContactIdForVariableCreate(): Promise<string> {
    const fromThread = String(activeThread?.contactId || "").trim();
    if (fromThread) return fromThread;

    const fromCompose = findContactIdForComposeTo();
    if (fromCompose) return fromCompose;

    const to = String(composeTo || "").trim();
    if (!to) throw new Error("Add a recipient to create variables.");

    // Best-effort: create a contact so custom variables have somewhere to live.
    const email = tab === "email" ? (safeEmailFromPeer(to) || to) : "";
    const phone = tab === "sms" ? to : "";
    const name = tab === "email" ? (email || to) : (phone || to);

    const res = await fetch("/api/portal/people/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, phone }),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok || !json?.contactId) {
      throw new Error(typeof json?.error === "string" ? json.error : "Could not create a contact for this recipient.");
    }

    const contactId = String(json.contactId).trim();
    if (contactId) {
      const nextContact: ContactLite = {
        id: contactId,
        name: String(name || "Contact").slice(0, 80),
        email: email ? String(email).slice(0, 120) : null,
        phone: phone ? String(phone).slice(0, 40) : null,
      };

      setContacts((prev) => {
        const base = Array.isArray(prev) ? prev : [];
        if (base.some((c) => c.id === contactId)) return base;
        return [nextContact, ...base].slice(0, 200);
      });

      // Best-effort refresh if contacts haven't been loaded yet.
      try {
        await ensureContactsLoaded();
      } catch {
        // ignore
      }
    }

    return contactId;
  }

  function applyPickedVariable(variableKey: string) {
    const key = String(variableKey || "").trim();
    const normalizedCustomKey = !key.includes(".") ? normalizePortalContactCustomVarKey(key) : "";
    const token = `{${key.includes(".") ? key : `contact.custom.${normalizedCustomKey || key}`}}`;
    const setCaretSoon = (el: HTMLInputElement | HTMLTextAreaElement | null, caret: number) => {
      if (!el) return;
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(caret, caret);
        } catch {
          // ignore
        }
      });
    };

    if (variablePickerTarget === "sms_body") {
      const el = smsComposeRef.current;
      const { next, caret } = insertAtCursor(composeBody, token, el);
      setComposeBody(next);
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "email_subject") {
      const el = emailSubjectRef.current;
      const { next, caret } = insertAtCursor(composeSubject, token, el);
      setComposeSubject(next);
      setCaretSoon(el, caret);
      return;
    }

    if (variablePickerTarget === "email_body") {
      const el = emailBodyRef.current;
      const { next, caret } = insertAtCursor(composeBody, token, el);
      setComposeBody(next);
      setCaretSoon(el, caret);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PortalBackToOnboardingLink />
      <PortalVariablePickerModal
        open={variablePickerOpen}
        variables={variablePickerVariables}
        onPick={applyPickedVariable}
        onClose={() => {
          setVariablePickerOpen(false);
          setVariablePickerTarget(null);
        }}
        createCustom={{
          enabled: true,
          existingKeys: knownContactCustomVarKeys,
          onCreate: async (key, value) => {
            const contactId = await ensureContactIdForVariableCreate();

            const v = String(value ?? "").trim();
            if (!v) throw new Error("Value is required.");

            const res = await fetch(`/api/portal/people/contacts/${contactId}/custom-variables`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ key, value: v }),
            });

            const json = (await res.json().catch(() => null)) as any;
            if (!res.ok || !json?.ok) {
              throw new Error(typeof json?.error === "string" ? json.error : "Failed to create variable.");
            }

            const normalizedKey = String(json?.key || key).trim();
            if (normalizedKey) {
              setKnownContactCustomVarKeys((prev) => {
                const set = new Set((prev ?? []).map((x) => String(x || "").trim()).filter(Boolean));
                set.add(normalizedKey);
                return Array.from(set).sort((a, b) => a.localeCompare(b)).slice(0, 50);
              });
            }
            toast.success("Custom variable saved to this contact.");
          },
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Inbox / Outbox</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Email and SMS threads in one place.
          </p>
        </div>

        <div className="w-full sm:max-w-110">
          {settings?.twilio?.configured ? null : (
            <PortalSettingsSection
              title="Inbound setup"
              description="Connect Twilio to enable SMS. Webhooks are configured automatically."
              accent="blue"
              dotClassName={
                settings?.twilio?.configured
                  ? "bg-[color:var(--color-brand-blue)]"
                  : "bg-zinc-400"
              }
            >
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                Add your Twilio Account SID, Auth Token, and From number in Profile → Twilio.
                After you connect, we configure inbound SMS automatically.
              </div>
            </PortalSettingsSection>
          )}
        </div>
      </div>

      <div className="mt-6 flex w-full flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setChannel("email")}
          aria-current={tab === "email" ? "page" : undefined}
          className={
            "flex-1 min-w-35 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "email"
              ? "border-brand-ink bg-brand-ink text-white shadow-sm focus-visible:ring-brand-ink/40"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => setChannel("sms")}
          aria-current={tab === "sms" ? "page" : undefined}
          className={
            "flex-1 min-w-35 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "sms"
              ? "border-brand-blue bg-brand-blue text-white shadow-sm focus-visible:ring-brand-blue/40"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          SMS
        </button>
      </div>

      {tab === "email" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="h-11 shrink-0 rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 transition-transform duration-150 hover:-translate-y-0.5 hover:bg-zinc-50"
            onClick={() => setEmailBox((prev) => (prev === "sent" ? "inbox" : "sent"))}
            aria-label={emailBox === "sent" ? "Show inbox" : "Show sent"}
          >
            {emailBox === "sent" ? "Sent" : "Inbox"}
          </button>

          <div className="relative min-w-56 flex-1">
            <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>
              <IconSearch size={18} />
            </div>
            <input
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search mail"
              className="h-11 w-full rounded-full border border-zinc-200 bg-white pl-11 pr-4 text-sm text-zinc-900 outline-none focus:border-zinc-300"
            />
          </div>

          <div className="relative shrink-0">
            {emailFiltersMenu ? (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onMouseDown={() => setEmailFiltersMenu(null)}
                  onTouchStart={() => setEmailFiltersMenu(null)}
                  aria-hidden
                />
                <div
                  className="fixed z-40 w-72 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-xl"
                  style={{ left: emailFiltersMenu.left, top: emailFiltersMenu.top, maxHeight: emailFiltersMenu.maxHeight }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <div className="border-b border-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-600">Filters</div>
                  <div className="px-4 py-3">
                    <div className="text-xs font-semibold text-zinc-700">Date</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(
                        [
                          { key: "any" as const, label: "Any time" },
                          { key: "7d" as const, label: "Last 7 days" },
                          { key: "30d" as const, label: "Last 30 days" },
                          { key: "90d" as const, label: "Last 90 days" },
                        ] satisfies Array<{ key: DateFilter; label: string }>
                      ).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={classNames(
                            "rounded-xl border px-3 py-2 text-left text-xs font-semibold",
                            emailDateFilter === opt.key
                              ? "border-brand-ink bg-brand-ink text-white"
                              : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                          )}
                          onClick={() => setEmailDateFilter(opt.key)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900">Has attachments</div>
                        <div className="text-[11px] text-zinc-500">Best-effort based on subject/preview</div>
                      </div>
                      <button
                        type="button"
                        className={classNames(
                          "h-7 w-12 rounded-full border transition",
                          emailHasAttachmentsOnly
                            ? "border-brand-ink bg-brand-ink"
                            : "border-zinc-200 bg-zinc-100",
                        )}
                        onClick={() => setEmailHasAttachmentsOnly((v) => !v)}
                        aria-pressed={emailHasAttachmentsOnly}
                        aria-label="Toggle attachments filter"
                      >
                        <span
                          className={classNames(
                            "block h-6 w-6 translate-x-0.5 rounded-full bg-white shadow transition",
                            emailHasAttachmentsOnly && "translate-x-[1.4rem]",
                          )}
                        />
                      </button>
                    </div>

                    {(emailDateFilter !== "any" || emailHasAttachmentsOnly) ? (
                      <button
                        type="button"
                        className="mt-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        onClick={() => {
                          setEmailDateFilter("any");
                          setEmailHasAttachmentsOnly(false);
                        }}
                      >
                        Clear filters
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            <button
              type="button"
              className={classNames(
                "inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 transition-transform duration-150 hover:-translate-y-0.5 hover:bg-zinc-50",
                (emailDateFilter !== "any" || emailHasAttachmentsOnly) && "border-brand-ink",
              )}
              onClick={(e) => {
                const open = Boolean(emailFiltersMenu);
                if (open) {
                  setEmailFiltersMenu(null);
                  return;
                }
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setEmailFiltersMenu(
                  computeFixedMenuStyle({ rect, width: 288, estHeight: 420, alignX: "right", minHeight: 220 }),
                );
              }}
              aria-label="Mail filters"
              aria-expanded={emailFiltersMenu ? true : undefined}
            >
              <IconFunnel size={18} />
            </button>
          </div>
        </div>
      ) : null}

      {tab === "sms" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#007aff] text-white shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:bg-[#006ae6]"
            onClick={() => {
              setSmsSheetOpen(true);
              setActiveThreadId(null);
              clearConversationForCompose();
              setComposeTo("");
              setComposeBody("");
              setComposeAttachments([]);
              setSmsMoreMenu(null);
              setToSuggestionsMenu(null);
            }}
            aria-label="New message"
          >
            <span className="text-xl leading-none">+</span>
          </button>

          <div className="relative min-w-56 flex-1">
            <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>
              <IconSearch size={18} />
            </div>
            <input
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search messages"
              className="h-11 w-full rounded-full border border-zinc-200 bg-white pl-11 pr-4 text-sm text-zinc-900 outline-none focus:border-zinc-300"
            />
          </div>

          <div className="relative shrink-0">
            {smsFiltersMenu ? (
              <>
                <div
                  className="fixed inset-0 z-12041"
                  onMouseDown={() => setSmsFiltersMenu(null)}
                  onTouchStart={() => setSmsFiltersMenu(null)}
                  aria-hidden
                />
                <div
                  className="fixed z-12045 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-xl"
                  style={{ left: smsFiltersMenu.left, top: smsFiltersMenu.top, width: smsFiltersMenu.width, maxHeight: smsFiltersMenu.maxHeight }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <div className="border-b border-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-600">Filters</div>
                  <div className="px-4 py-3">
                    <div className="text-xs font-semibold text-zinc-700">Date</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {(
                        [
                          { key: "any" as const, label: "Any time" },
                          { key: "7d" as const, label: "Last 7 days" },
                          { key: "30d" as const, label: "Last 30 days" },
                          { key: "90d" as const, label: "Last 90 days" },
                        ] satisfies Array<{ key: DateFilter; label: string }>
                      ).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          className={classNames(
                            "rounded-xl border px-3 py-2 text-left text-xs font-semibold",
                            smsDateFilter === opt.key
                              ? "border-brand-ink bg-brand-ink text-white"
                              : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                          )}
                          onClick={() => setSmsDateFilter(opt.key)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2">
                      <div>
                        <div className="text-xs font-semibold text-zinc-900">Incoming only</div>
                        <div className="text-[11px] text-zinc-500">Last message from them</div>
                      </div>
                      <button
                        type="button"
                        className={classNames(
                          "h-7 w-12 rounded-full border transition",
                          smsIncomingOnly ? "border-brand-ink bg-brand-ink" : "border-zinc-200 bg-zinc-100",
                        )}
                        onClick={() => setSmsIncomingOnly((v) => !v)}
                        aria-pressed={smsIncomingOnly}
                        aria-label="Toggle incoming-only filter"
                      >
                        <span
                          className={classNames(
                            "block h-6 w-6 translate-x-0.5 rounded-full bg-white shadow transition",
                            smsIncomingOnly && "translate-x-[1.4rem]",
                          )}
                        />
                      </button>
                    </div>
                    {(smsDateFilter !== "any" || smsIncomingOnly) ? (
                      <button
                        type="button"
                        className="mt-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        onClick={() => {
                          setSmsDateFilter("any");
                          setSmsIncomingOnly(false);
                        }}
                      >
                        Clear filters
                      </button>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}

            <button
              type="button"
              className={classNames(
                "inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                (smsDateFilter !== "any" || smsIncomingOnly) && "border-brand-ink",
              )}
              onClick={(e) => {
                const open = Boolean(smsFiltersMenu);
                if (open) {
                  setSmsFiltersMenu(null);
                  return;
                }
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setSmsFiltersMenu(
                  computeFixedMenuStyle({ rect, width: 288, estHeight: 420, alignX: "right", minHeight: 220 }),
                );
              }}
              aria-label="Message filters"
              aria-expanded={smsFiltersMenu ? true : undefined}
            >
              <IconFunnel size={18} />
            </button>
          </div>
        </div>
      ) : null}

      <AppModal
        open={Boolean(contactModalOpen && activeThread)}
        title="Contact details"
        description="Used for tagging and automations."
        onClose={() => setContactModalOpen(false)}
        zIndex={contactModalZ}
        widthClassName="w-[min(560px,calc(100vw-32px))]"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              onClick={() => setContactModalOpen(false)}
              disabled={savingContact}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              onClick={() => void saveActiveThreadContact()}
              disabled={!String(contactName || "").trim() || savingContact}
            >
              {savingContact ? "Creating…" : "Create contact"}
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs font-semibold text-zinc-600">Name</label>
            <input
              value={contactName}
              autoFocus
              onChange={(e) => setContactName(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300"
              placeholder="Jane Doe"
              maxLength={80}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600">Email (optional)</label>
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300"
              placeholder="name@company.com"
              maxLength={120}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600">Phone (optional)</label>
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-300"
              placeholder="+15551234567"
              maxLength={40}
            />
          </div>
        </div>
      </AppModal>

      <PortalContactDetailsModal
        open={peopleContactModalOpen}
        contactId={peopleContactId}
        zIndex={contactModalZ}
        onClose={() => {
          setPeopleContactModalOpen(false);
          setPeopleContactId(null);
          setPeopleContactThreadId(null);
        }}
        onContactUpdated={(next) => {
          const threadId = peopleContactThreadId;
          if (!threadId) return;
          if (!next.contact?.id) return;

          updateThreadContact(threadId, {
            contactId: next.contact.id,
            contact: next.contact,
            contactTags: Array.isArray(next.tags) ? next.tags : undefined,
          });
        }}
      />

      {tab === "sms" && settings && !settings.twilio.configured ? (
        <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="font-semibold">SMS isn’t connected yet</div>
          <div className="mt-1 text-amber-800/90">
            To send and receive texts here, connect your Twilio number in Integrations.
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left panel: thread list */}
        {!emailComposerOpen ? (
          <div
            className={classNames(
              "flex min-h-0 flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white lg:col-span-4",
              tab === "email" && activeThreadId ? "hidden lg:flex" : "",
            )}
          >
            <div className="border-b border-zinc-100 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">
                  {tab === "email" ? (emailBox === "sent" ? "Sent" : "Inbox") : "Texts"}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {tab === "email" ? (
                    <button
                      type="button"
                      className="rounded-xl bg-[#007aff] px-3 py-2 text-xs font-semibold text-white hover:bg-[#006ae6]"
                      onClick={openEmailComposer}
                    >
                      + New email
                    </button>
                  ) : null}
                  {refreshingThreads ? (
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600">
                      <InlineSpinner /> Refreshing…
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {loadingThreads ? (
              <div className="px-3 py-4 text-sm text-zinc-600">Loading…</div>
            ) : filteredThreads.length ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                {filteredThreads.map((t) => {
                const active = t.id === activeThreadId;

                if (tab === "sms") {
                  const title = t.contact?.name?.trim() ? t.contact.name.trim() : displayNameFromAddress(t.peerAddress);
                  const subtitle = firstLinePreview(t.lastMessagePreview);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setActiveThreadId(t.id);
                        setSmsSheetOpen(true);
                        setSmsMoreMenu(null);
                        setToSuggestionsMenu(null);
                      }}
                      className={classNames(
                        "w-full border-b border-zinc-100 px-4 py-3 text-left transition",
                        active ? "bg-zinc-100" : "hover:bg-zinc-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-semibold text-zinc-900">{title}</div>
                          <div className="mt-0.5 truncate text-xs text-zinc-600">{subtitle || " "}</div>
                        </div>
                        <div className="shrink-0 text-[11px] text-zinc-500">{formatDayOrTime(t.lastMessageAt)}</div>
                      </div>
                    </button>
                  );
                }

                // EMAIL list item (Gmail-ish)
                const sender = t.lastMessageDirection === "IN" ? t.peerAddress : "You";
                const subject = mailSubjectOrNo(t.subject);
                const snippet = firstLinePreview(t.lastMessagePreview);

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveThreadId(t.id)}
                    className={classNames(
                      "w-full border-b border-zinc-100 px-4 py-3 text-left transition",
                      active ? "bg-zinc-100" : "hover:bg-zinc-50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className={classNames("truncate text-sm text-zinc-900", t.lastMessageDirection === "IN" ? "font-semibold" : "font-medium")}>
                            {sender}
                          </div>
                          {t.lastMessageDirection === "IN" ? (
                            <span className="shrink-0 text-[10px] font-semibold text-zinc-900">•</span>
                          ) : null}
                        </div>
                        <div className={classNames("mt-0.5 truncate text-sm", t.lastMessageDirection === "IN" ? "font-semibold text-zinc-900" : "font-medium text-zinc-800")}>
                          {subject}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-zinc-600">{snippet || " "}</div>
                        {Array.isArray(t.contactTags) && t.contactTags.length ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {t.contactTags.slice(0, 2).map((tag) => (
                              <span
                                key={tag.id}
                                className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                                style={{
                                  backgroundColor: (tag.color || "#0f172a") + "20",
                                  borderColor: (tag.color || "#0f172a") + "40",
                                  color: tag.color || "#0f172a",
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                            {t.contactTags.length > 2 ? (
                              <span className="text-[10px] font-semibold text-zinc-500">+{t.contactTags.length - 2}</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-[11px] text-zinc-500">{formatDayOrTime(t.lastMessageAt)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-4 text-sm text-zinc-600">
              No conversations yet.
              <div className="mt-2 text-xs text-zinc-500">Send something, or enable inbound webhooks.</div>
            </div>
          )}
          </div>
        ) : null}

        {/* Right panel: conversation view */}
        {!emailComposerOpen && tab === "email" ? (
          <div
            className={classNames(
              "overflow-hidden rounded-3xl border border-zinc-200 bg-white lg:col-span-8",
              !activeThreadId ? "hidden lg:block" : "",
            )}
          >
            <div className="flex h-full min-h-[68vh] flex-col">
              <div className="border-b border-zinc-100 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    {activeThread ? (
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 lg:hidden"
                        onClick={() => setActiveThreadId(null)}
                        aria-label="Back to threads"
                      >
                        Back
                      </button>
                    ) : null}
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-zinc-900">
                        {activeThread ? activeThread.contact?.name || mailSubjectOrNo(activeThread.subject) : "New Email"}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {activeThread ? activeThread.peerAddress : "Compose a new message"}
                      </div>
                    </div>
                  </div>
                  {activeThread ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                      onClick={openContactModalForActiveThread}
                    >
                      {activeThread.contactId ? "Edit contact" : "Add contact"}
                    </button>
                  ) : null}
                </div>

                {activeThread?.contactId ? (
                  <div className="mt-2">
                    <ContactTagsEditor
                      compact
                      contactId={activeThread.contactId}
                      tags={Array.isArray(activeThread.contactTags) ? activeThread.contactTags : []}
                      onChange={(next) => updateThreadTags(activeThread.id, next)}
                    />
                  </div>
                ) : null}
              </div>

              {!activeThread ? (
                <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                  Select a thread to view messages.
                </div>
              ) : null}

              <div className="flex-1 overflow-y-auto bg-zinc-50 p-4">
                {!activeThread ? (
                  <div className="text-sm text-zinc-600">Choose a contact or type an email address to start a new conversation.</div>
                ) : loadingMessages ? (
                  <div className="text-sm text-zinc-600">Loading…</div>
                ) : scheduledMessages.length || messages.length ? (
                  <div className="space-y-3">
                    {scheduledMessages.map((m) => (
                      <div key={m.id} className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-2">
                            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">Scheduled</span>
                            <div className="text-[11px] text-zinc-600">{formatWhen(m.scheduledFor)}</div>
                          </div>
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                            onClick={() => openReschedule(m)}
                          >
                            <IconSchedule size={16} />
                            Reschedule
                          </button>
                        </div>
                        <div className="mt-2 text-xs text-zinc-600">To: {m.toAddress}</div>
                        {m.subject ? <div className="mt-1 text-xs text-zinc-600">Subject: {m.subject}</div> : null}
                        <div className="mt-3 whitespace-pre-wrap wrap-break-word text-sm text-zinc-800">{m.bodyText}</div>
                        {m.attachments?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {m.attachments.map((a) => (
                              <a
                                key={a.id}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                              >
                                {a.fileName} · {formatBytes(a.fileSize)}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {messages.map((m) => (
                      <div key={m.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-zinc-800">
                            {m.direction === "OUT" ? "You" : m.fromAddress}
                          </div>
                          <div className="text-[11px] text-zinc-500">{formatWhen(m.createdAt)}</div>
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">To: {m.toAddress}</div>
                        <div className="mt-3 whitespace-pre-wrap wrap-break-word text-sm text-zinc-800">{m.bodyText}</div>
                        {m.attachments?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {m.attachments.map((a) => (
                              <a
                                key={a.id}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100"
                              >
                                {a.fileName} · {formatBytes(a.fileSize)}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-600">No emails yet.</div>
                )}
              </div>

              {activeThread ? (
                <div className="border-t border-zinc-100 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-zinc-700">Reply</div>
                  </div>
                  <textarea
                    ref={emailBodyRef}
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    rows={4}
                    placeholder="Type your reply…"
                    className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                  {composeAttachments.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {composeAttachments.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-2 py-1">
                          <div className="max-w-55 truncate text-xs font-semibold text-zinc-900">{a.fileName}</div>
                          <div className="text-[11px] text-zinc-500">{formatBytes(a.fileSize)}</div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(a.id)}
                            className="ml-1 rounded-xl px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                            aria-label="Remove attachment"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-zinc-500">Replying to {activeThread.peerAddress}</div>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      <button
                        type="button"
                        onClick={() => openVariablePicker("email_body")}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:w-auto"
                      >
                        Insert variable
                      </button>
                      <button
                        type="button"
                        onClick={() => emailFileRef.current?.click()}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:w-auto"
                      >
                        Upload
                      </button>
                      <button
                        type="button"
                        onClick={() => setMediaPickerOpen(true)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:w-auto"
                      >
                        Add from media library
                      </button>
                      <input
                        ref={emailFileRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          void uploadAttachments(e.currentTarget.files);
                          e.currentTarget.value = "";
                        }}
                        accept="image/*,video/*,audio/*,application/pdf,text/plain,.csv,.doc,.docx,.xls,.xlsx"
                      />
                      <button
                        type="button"
                        onClick={openSchedule}
                        disabled={sending || uploading}
                        className={classNames(
                          "inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 sm:w-auto",
                          (sending || uploading) && "opacity-60",
                        )}
                        aria-label="Schedule send"
                        title="Schedule"
                      >
                        <IconSchedule size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onSend()}
                        disabled={sending}
                        className={classNames(
                          "w-full rounded-2xl bg-[#007aff] px-5 py-2 text-sm font-semibold text-white hover:bg-[#006ae6] sm:w-auto",
                          sending && "opacity-60",
                        )}
                      >
                        {sending ? "Sending…" : uploading ? "Uploading…" : "Send"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <PortalMediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onPick={attachFromMediaLibrary}
        confirmLabel="Add"
        title="Add from media library"
        zIndex={mediaPickerZ}
      />

      <AppModal
        open={scheduleOpen}
        title={scheduleEditingId ? "Reschedule send" : "Schedule send"}
        description={scheduleEditingId ? "Choose the new time for this message." : "Choose when this message should send."}
        zIndex={12100}
        onClose={() => {
          if (sending) return;
          setScheduleOpen(false);
          setScheduleEditingId(null);
        }}
        widthClassName="w-[min(520px,calc(100vw-32px))]"
        closeVariant="x"
        hideHeaderDivider
        hideFooterDivider
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-2xl bg-transparent px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => {
                setScheduleOpen(false);
                setScheduleEditingId(null);
              }}
              disabled={sending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              disabled={sending}
              onClick={async () => {
                setScheduleError(null);
                const when = scheduleAt;
                if (!when || !Number.isFinite(when.getTime())) {
                  setScheduleError("Pick a valid time.");
                  return;
                }
                if (when.getTime() < Date.now() + 60_000) {
                  setScheduleError("Pick a time at least 1 minute from now.");
                  return;
                }

                if (scheduleEditingId) {
                  const result = await rescheduleScheduledMessage(scheduleEditingId, when.toISOString());
                  if (!result.ok) return;

                  toast.success(`Rescheduled for ${formatWhen(when.toISOString())}`);
                  setScheduleOpen(false);
                  setScheduleEditingId(null);
                  if (activeThreadId) await loadMessages(activeThreadId);
                  return;
                }

                const result = await onSend({ sendAt: when.toISOString() });
                if (result.ok) {
                  setScheduleOpen(false);
                  setScheduleEditingId(null);
                }
              }}
            >
              {scheduleEditingId ? "Reschedule" : "Schedule"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold text-zinc-600">Send at</div>
            <div className="mt-1 rounded-2xl border border-zinc-200 bg-white p-3">
              <DateTimePicker
                value={scheduleAt}
                onChange={(next) => setScheduleAt(next)}
                min={new Date(Date.now() + 60_000)}
                disabled={sending}
              />
            </div>
          </div>

          {scheduleError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{scheduleError}</div>
          ) : null}
        </div>
      </AppModal>

      {tab === "sms" && smsSheetOpen && !emailComposerOpen ? (
        <>
          <div
            className="fixed inset-0 z-12030 bg-black/20"
            onMouseDown={() => {
              setSmsSheetOpen(false);
              setActiveThreadId(null);
              setSmsMoreMenu(null);
              setToSuggestionsMenu(null);
            }}
            onTouchStart={() => {
              setSmsSheetOpen(false);
              setActiveThreadId(null);
              setSmsMoreMenu(null);
              setToSuggestionsMenu(null);
            }}
            aria-hidden
          />
          <div
            className="fixed left-0 right-0 z-12040 bg-white shadow-2xl"
            style={{
              top: "max(var(--pa-portal-topbar-height, 0px), var(--pa-modal-safe-top, 0px))",
              bottom: "var(--pa-portal-embed-footer-offset, 0px)",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Messages"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3">
                <button
                  type="button"
                  className="rounded-full p-2 text-zinc-700 hover:bg-zinc-100"
                  onClick={() => {
                    setSmsSheetOpen(false);
                    setActiveThreadId(null);
                    setSmsMoreMenu(null);
                    setToSuggestionsMenu(null);
                  }}
                  aria-label="Back to threads"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M15 18l-6-6 6-6"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-zinc-900">
                    {activeThread
                      ? activeThread.contact?.name || displayNameFromAddress(activeThread.peerAddress)
                      : "New message"}
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {activeThread ? activeThread.peerAddress : "Enter a phone number or pick a contact"}
                  </div>
                </div>

                {activeThread ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
                    onClick={openContactModalForActiveThread}
                  >
                    {activeThread.contactId ? "Edit contact" : "Add contact"}
                  </button>
                ) : null}
              </div>

              {!activeThread ? (
                <div className="border-b border-zinc-200 px-4">
                  {toSuggestionsMenu ? (
                    <div
                      className="fixed inset-0 z-12041"
                      onMouseDown={() => setToSuggestionsMenu(null)}
                      onTouchStart={() => setToSuggestionsMenu(null)}
                      aria-hidden
                    />
                  ) : null}

                  <div className="relative py-3">
                    <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                      <div className="text-xs font-semibold text-zinc-600">To:</div>
                      <input
                        ref={smsToRef}
                        value={composeTo}
                        onFocus={() => {
                          void ensureContactsLoaded();
                          try {
                            const rect = smsToRef.current?.getBoundingClientRect();
                            if (rect) {
                              setToSuggestionsMenu(
                                computeFixedMenuStyle({ rect, width: rect.width, estHeight: 320, alignX: "left", minHeight: 160 }),
                              );
                            }
                          } catch {
                            // ignore
                          }
                        }}
                        onChange={(e) => {
                          void ensureContactsLoaded();
                          setComposeTo(e.target.value);
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setToSuggestionsMenu(
                            computeFixedMenuStyle({ rect, width: rect.width, estHeight: 320, alignX: "left", minHeight: 160 }),
                          );
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setToSuggestionsMenu(null);
                        }}
                        placeholder="Phone number or contact name"
                        className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                      />
                    </div>

                    {toSuggestionsMenu ? (
                      <div
                        className="fixed z-12045 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-lg"
                        style={{ left: toSuggestionsMenu.left, top: toSuggestionsMenu.top, width: toSuggestionsMenu.width, maxHeight: toSuggestionsMenu.maxHeight }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        {contactsLoading ? (
                          <div className="px-3 py-3 text-sm text-zinc-600">Loading contacts…</div>
                        ) : (
                          (() => {
                            const suggestions = findContactSuggestions(composeTo);
                            if (!suggestions.length) {
                              return <div className="px-3 py-3 text-sm text-zinc-600">No matching contacts.</div>;
                            }

                            return (
                              <div className="py-1">
                                {suggestions.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className="w-full px-3 py-2 text-left hover:bg-zinc-50"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      applyContactToCompose(c);
                                    }}
                                  >
                                    <div className="truncate text-sm font-semibold text-zinc-900">{c.name}</div>
                                    <div className="mt-0.5 truncate text-xs text-zinc-600">{c.phone || "No phone"}</div>
                                  </button>
                                ))}
                              </div>
                            );
                          })()
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div ref={smsScrollRef} className={classNames("min-h-0 flex-1 overflow-y-auto px-4 py-4", styles.smsPane)}>
                {!activeThread ? (
                  <div className="text-sm text-zinc-600">Start a new text by choosing a contact or entering a phone number.</div>
                ) : loadingMessages ? (
                  <div className="text-sm text-zinc-600">Loading…</div>
                ) : scheduledMessages.length || messages.length ? (
                  <div className="space-y-2">
                    {scheduledMessages.map((m) => (
                      <div key={m.id} className="flex justify-center">
                        <div className="w-full max-w-140 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 truncate text-xs font-semibold text-blue-700">Scheduled · {formatWhen(m.scheduledFor)}</div>
                            <button
                              type="button"
                              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                              onClick={() => openReschedule(m)}
                            >
                              <IconSchedule size={16} />
                              Reschedule
                            </button>
                          </div>
                          <div className="mt-1 whitespace-pre-wrap wrap-break-word text-sm text-zinc-800">{m.bodyText}</div>
                          {m.attachments?.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {m.attachments.map((a) => (
                                <a
                                  key={a.id}
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                                >
                                  {a.fileName} · {formatBytes(a.fileSize)}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {messages.map((m, idx) => {
                      const mine = m.direction === "OUT";
                      const prev = idx > 0 ? messages[idx - 1] : null;
                      const next = idx + 1 < messages.length ? messages[idx + 1] : null;
                      const startsGroup = !prev || prev.direction !== m.direction;
                      const endsGroup = !next || next.direction !== m.direction;

                      const bubbleCls = classNames(
                        styles.bubble,
                        mine ? styles.bubbleOut : styles.bubbleIn,
                        endsGroup ? (mine ? styles.tailOut : styles.tailIn) : "",
                      );

                      return (
                        <div
                          key={m.id}
                          className={classNames(
                            "flex",
                            mine ? "justify-end" : "justify-start",
                            startsGroup ? "mt-2" : "mt-0",
                          )}
                        >
                          <div className={bubbleCls}>
                            {m.attachments?.length ? (
                              <div className="mb-2 space-y-2">
                                {m.attachments.map((a) => {
                                  const isImg = String(a.mimeType || "").startsWith("image/");
                                  if (isImg) {
                                    return (
                                      <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={a.url}
                                          alt={a.fileName}
                                          className="max-h-56 w-full max-w-60 rounded-2xl object-cover"
                                        />
                                      </a>
                                    );
                                  }

                                  return (
                                    <a
                                      key={a.id}
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={classNames(
                                        "block rounded-2xl px-3 py-2 text-xs font-semibold",
                                        mine ? "bg-white/15 text-white" : "bg-zinc-100 text-zinc-800",
                                      )}
                                    >
                                      {a.fileName} · {formatBytes(a.fileSize)}
                                    </a>
                                  );
                                })}
                              </div>
                            ) : null}
                            <div className="whitespace-pre-wrap wrap-break-word">{m.bodyText}</div>
                            {endsGroup ? (
                              <div className={classNames("mt-1 text-[11px]", mine ? "text-white/80" : "text-zinc-600")}>
                                {formatTimeOnly(m.createdAt)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-600">No messages yet.</div>
                )}
              </div>

              <div className={classNames("shrink-0 border-t border-zinc-200 p-3", styles.inputBar)}>
                {composeAttachments.length ? (
                  <div className="mb-2 flex flex-wrap gap-2 px-1">
                    {composeAttachments.map((a) => {
                      const isImg = String(a.mimeType || "").startsWith("image/");
                      return (
                        <div key={a.id} className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-2 py-1">
                          {isImg ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={a.url} alt={a.fileName} className="h-8 w-8 rounded-xl object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 text-xs font-semibold text-zinc-700">
                              FILE
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="max-w-45 truncate text-xs font-semibold text-zinc-900">{a.fileName}</div>
                            <div className="text-[11px] text-zinc-500">{formatBytes(a.fileSize)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(a.id)}
                            className="ml-1 rounded-xl px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                            aria-label="Remove attachment"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className={classNames("flex items-center gap-2 px-2 py-2", styles.inputPill)}>
                  <div className="relative">
                    {smsMoreMenu ? (
                      <>
                        <div
                          className="fixed inset-0 z-12041"
                          onMouseDown={() => setSmsMoreMenu(null)}
                          onTouchStart={() => setSmsMoreMenu(null)}
                          aria-hidden
                        />
                        <div
                          className="fixed z-12045 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-lg"
                          style={{ left: smsMoreMenu.left, top: smsMoreMenu.top, width: smsMoreMenu.width, maxHeight: smsMoreMenu.maxHeight }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => {
                              setSmsMoreMenu(null);
                              openVariablePicker("sms_body");
                            }}
                          >
                            Insert variable
                          </button>
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => {
                              setSmsMoreMenu(null);
                              smsFileRef.current?.click();
                            }}
                          >
                            Upload from device
                          </button>
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => {
                              setSmsMoreMenu(null);
                              setMediaPickerOpen(true);
                            }}
                          >
                            Add from media library
                          </button>
                        </div>
                      </>
                    ) : null}

                    <button
                      type="button"
                      className={classNames(styles.iconButton, styles.iconButtonMuted)}
                      onClick={(e) => {
                        if (smsMoreMenu) {
                          setSmsMoreMenu(null);
                          return;
                        }
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setSmsMoreMenu(
                          computeFixedMenuStyle({ rect, width: 256, estHeight: 200, alignX: "left", minHeight: 160 }),
                        );
                      }}
                      aria-label="More"
                      aria-expanded={smsMoreMenu ? true : undefined}
                    >
                      <span className="text-lg leading-none">+</span>
                    </button>
                  </div>

                  <input
                    ref={smsFileRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void uploadAttachments(e.currentTarget.files);
                      e.currentTarget.value = "";
                    }}
                    accept="image/*,video/*,audio/*,application/pdf,text/plain"
                  />

                  <input
                    ref={smsComposeRef}
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onSend();
                      }
                    }}
                    placeholder="Text message"
                    className="w-full bg-transparent px-1 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                  />

                  <button
                    type="button"
                    className={classNames(styles.iconButton, styles.iconButtonMuted, (sending || uploading) && "opacity-60")}
                    onClick={openSchedule}
                    disabled={sending || uploading}
                    aria-label="Schedule send"
                    title="Schedule"
                  >
                    <IconSchedule size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={() => void onSend()}
                    disabled={sending}
                    className={classNames("group", styles.iconButton, styles.iconButtonPrimary, sending && "opacity-60")}
                    aria-label="Send"
                  >
                    <span className="relative h-4.5 w-4.5">
                      <span className="absolute inset-0 opacity-100 transition-opacity group-hover:opacity-0" aria-hidden>
                        <IconSend size={18} />
                      </span>
                      <span className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
                        <IconSendHover size={18} />
                      </span>
                    </span>
                  </button>
                </div>

                <div className="mt-1 px-2 text-[11px] text-zinc-500">{uploading ? "Uploading…" : "Press Enter to send"}</div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* New email button lives in the left thread header now. */}

      {tab === "email" && emailComposerOpen ? (
        <>
          <div className="fixed inset-0 z-12040 bg-black/20" aria-hidden />
          <div
            className="fixed left-0 right-0 z-12040 bg-white shadow-2xl"
            style={{
              top: "max(var(--pa-portal-topbar-height, 0px), var(--pa-modal-safe-top, 0px))",
              bottom: "var(--pa-portal-embed-footer-offset, 0px)",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Compose email"
          >
            <div className="flex h-full flex-col">
              <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3">
                <button
                  type="button"
                  className="rounded-full p-2 text-zinc-700 hover:bg-zinc-100"
                  onClick={() => {
                    setEmailComposerOpen(false);
                    setEmailAttachMenu(null);
                  }}
                  aria-label="Close composer"
                >
                  <span className="text-lg leading-none">×</span>
                </button>
                <div className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">New email</div>
              </div>

              {toSuggestionsMenu ? (
                <div
                  className="fixed inset-0 z-12041"
                  onMouseDown={() => setToSuggestionsMenu(null)}
                  onTouchStart={() => setToSuggestionsMenu(null)}
                  aria-hidden
                />
              ) : null}

              <div className="border-b border-zinc-200 px-4">
                <div className="flex items-center gap-3 py-3">
                  <div className="shrink-0 text-xs font-semibold text-zinc-600">To</div>
                  <div className="relative flex-1">
                    <input
                      ref={emailToRef}
                      value={composeTo}
                      onFocus={() => {
                        void ensureContactsLoaded();
                        try {
                          const rect = emailToRef.current?.getBoundingClientRect();
                          if (rect) {
                            setToSuggestionsMenu(
                              computeFixedMenuStyle({ rect, width: rect.width, estHeight: 320, alignX: "left", minHeight: 160 }),
                            );
                          }
                        } catch {
                          // ignore
                        }
                      }}
                      onChange={(e) => {
                        void ensureContactsLoaded();
                        setComposeTo(e.target.value);
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setToSuggestionsMenu(
                          computeFixedMenuStyle({ rect, width: rect.width, estHeight: 320, alignX: "left", minHeight: 160 }),
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setToSuggestionsMenu(null);
                      }}
                      placeholder="Email address or contact name"
                      className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 outline-none"
                    />

                    {toSuggestionsMenu ? (
                      <div
                        className="fixed z-12045 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-lg"
                        style={{ left: toSuggestionsMenu.left, top: toSuggestionsMenu.top, width: toSuggestionsMenu.width, maxHeight: toSuggestionsMenu.maxHeight }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        {contactsLoading ? (
                          <div className="px-3 py-3 text-sm text-zinc-600">Loading contacts…</div>
                        ) : (
                          (() => {
                            const suggestions = findContactSuggestions(composeTo);
                            if (!suggestions.length) {
                              return <div className="px-3 py-3 text-sm text-zinc-600">No matching contacts.</div>;
                            }

                            return (
                              <div className="py-1">
                                {suggestions.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className="w-full px-3 py-2 text-left hover:bg-zinc-50"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      applyContactToCompose(c);
                                    }}
                                  >
                                    <div className="truncate text-sm font-semibold text-zinc-900">{c.name}</div>
                                    <div className="mt-0.5 truncate text-xs text-zinc-600">{c.email || "No email"}</div>
                                  </button>
                                ))}
                              </div>
                            );
                          })()
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="border-b border-zinc-200 px-4">
                <div className="flex items-center gap-3 py-3">
                  <div className="shrink-0 text-xs font-semibold text-zinc-600">Subject</div>
                  <input
                    ref={emailSubjectRef}
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="Subject"
                    className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 outline-none"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => openVariablePicker("email_subject")}
                  >
                    Insert variable
                  </button>
                </div>
              </div>

              <div className="border-b border-zinc-200 px-4 py-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                    onClick={() => openVariablePicker("email_body")}
                  >
                    Insert variable
                  </button>

                  <div className="relative">
                    {emailAttachMenu ? (
                      <>
                        <div
                          className="fixed inset-0 z-12041"
                          onMouseDown={() => setEmailAttachMenu(null)}
                          onTouchStart={() => setEmailAttachMenu(null)}
                          aria-hidden
                        />
                        <div
                          className="fixed z-12045 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-lg"
                          style={{ left: emailAttachMenu.left, top: emailAttachMenu.top, width: emailAttachMenu.width, maxHeight: emailAttachMenu.maxHeight }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => {
                              setEmailAttachMenu(null);
                              emailComposerFileRef.current?.click();
                            }}
                          >
                            Upload
                          </button>
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => {
                              setEmailAttachMenu(null);
                              setMediaPickerOpen(true);
                            }}
                          >
                            Add from media library
                          </button>
                        </div>
                      </>
                    ) : null}

                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-brand-ink hover:bg-zinc-50"
                      onClick={(e) => {
                        if (emailAttachMenu) {
                          setEmailAttachMenu(null);
                          return;
                        }
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setEmailAttachMenu(
                          computeFixedMenuStyle({ rect, width: 256, estHeight: 160, alignX: "left", minHeight: 120 }),
                        );
                      }}
                      aria-label="Attach"
                      aria-expanded={emailAttachMenu ? true : undefined}
                    >
                      <IconServiceGlyph slug="media-library" />
                    </button>
                  </div>

                  <div className="flex-1" />

                  <button
                    type="button"
                    className={classNames(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                      (sending || uploading) && "opacity-60",
                    )}
                    onClick={openSchedule}
                    disabled={sending || uploading}
                    aria-label="Schedule send"
                    title="Schedule"
                  >
                    <IconSchedule size={18} />
                  </button>

                  <button
                    type="button"
                    className={classNames(
                      "group inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#007aff] text-white hover:bg-[#006ae6]",
                      sending && "opacity-60",
                    )}
                    onClick={async () => {
                      const result = await onSend();
                      if (result && (result as any).ok) {
                        setEmailComposerOpen(false);
                        setEmailAttachMenu(null);
                      }
                    }}
                    disabled={sending}
                    aria-label="Send"
                  >
                    <span className="relative h-4.5 w-4.5">
                      <span className="absolute inset-0 opacity-100 transition-opacity group-hover:opacity-0" aria-hidden>
                        <IconSend size={18} />
                      </span>
                      <span className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
                        <IconSendHover size={18} />
                      </span>
                    </span>
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <textarea
                  ref={emailBodyRef}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Compose email"
                  className="h-full min-h-[40vh] w-full resize-none bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
                />

                {composeAttachments.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {composeAttachments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5">
                        <div className="max-w-60 truncate text-xs font-semibold text-zinc-900">{a.fileName}</div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(a.id)}
                          className="rounded-full px-2 py-0.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
                          aria-label="Remove attachment"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <input
                ref={emailComposerFileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void uploadAttachments(e.currentTarget.files);
                  e.currentTarget.value = "";
                }}
                accept="image/*,video/*,audio/*,application/pdf,text/plain,.csv,.doc,.docx,.xls,.xlsx"
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
