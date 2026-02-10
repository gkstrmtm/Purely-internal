"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./PortalInboxClient.module.css";
import { PortalSettingsSection } from "@/components/PortalSettingsSection";
import { PortalMediaPickerModal, type PortalMediaPickItem } from "@/components/PortalMediaPickerModal";
import { ContactTagsEditor, type ContactTag } from "@/components/ContactTagsEditor";
import { PortalVariablePickerModal } from "@/components/PortalVariablePickerModal";
import { useToast } from "@/components/ToastProvider";
import { normalizePhoneForStorage } from "@/lib/phone";
import { PORTAL_MESSAGE_VARIABLES } from "@/lib/portalTemplateVars";

type Channel = "email" | "sms";
type EmailBox = "inbox" | "sent" | "all";

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

type SettingsRes = {
  ok: true;
  settings: { webhookToken: string };
  twilio: { configured: boolean; fromNumberE164: string | null };
  webhooks: { twilioInboundSmsUrl: string; twilioInboundSmsUrlLegacy?: string; sendgridInboundEmailUrl: string };
};

type ApiErrorRes = { ok: false; code?: string; error?: string };
type ThreadsRes = { ok: true; threads: Thread[] } | ApiErrorRes;
type MessagesRes = { ok: true; messages: Message[] } | ApiErrorRes;

type UploadedAttachment = NonNullable<Message["attachments"]>[number];

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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

export function PortalInboxClient() {
  const toast = useToast();
  const [tab, setTab] = useState<Channel>(() => {
    if (typeof window === "undefined") return "email";
    const p = new URLSearchParams(window.location.search);
    const ch = String(p.get("channel") || "").toLowerCase();
    return ch === "sms" ? "sms" : "email";
  });
  const [emailBox, setEmailBox] = useState<EmailBox>("inbox");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function pickThreadIdFromTo(nextTab: Channel, nextThreads: Thread[], toRaw: string) {
    const to = String(toRaw || "").trim();
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

  const [composeTo, setComposeTo] = useState<string>("");
  const [composeSubject, setComposeSubject] = useState<string>("");
  const [composeBody, setComposeBody] = useState<string>("");
  const [composeAttachments, setComposeAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const [smsMoreOpen, setSmsMoreOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  const [variablePickerOpen, setVariablePickerOpen] = useState(false);
  const [variablePickerTarget, setVariablePickerTarget] = useState<null | "sms_body" | "email_subject" | "email_body">(null);

  const smsComposeRef = useRef<HTMLInputElement | null>(null);
  const emailSubjectRef = useRef<HTMLInputElement | null>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement | null>(null);

  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [savingContact, setSavingContact] = useState(false);

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

  async function loadThreads(nextTab: Channel) {
    setLoadingThreads(true);
    setError(null);
    setThreads([]);
    setMessages([]);
    setActiveThreadId(null);

    const res = await fetch(`/api/portal/inbox/threads?channel=${nextTab}`, {
      cache: "no-store",
    });

    const json = (await res.json().catch(() => null)) as ThreadsRes | null;
    if (!res.ok || !json || json.ok !== true) {
      setLoadingThreads(false);
      if (res.status === 401 || (json && json.ok === false && json.code === "SESSION_EXPIRED")) {
        setError("Your session expired. Please sign in again.");
        return;
      }
      const apiError = json && json.ok === false ? json.error : null;
      setError(apiError || (nextTab === "sms" ? "We couldn’t load your text message threads." : "We couldn’t load your email threads."));
      return;
    }

    setThreads(json.threads);
    setLoadingThreads(false);

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
      setActiveThreadId(json.threads[0].id);
    } else if (preferredTo) {
      setComposeTo(preferredTo);
      preferredToRef.current = null;
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
    setLoadingMessages(false);
  }

  useEffect(() => {
    loadThreads(tab);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setError(typeof json?.error === "string" ? json.error : "Could not attach file");
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

  async function onSend() {
    if (sending) return;
    setError(null);

    const to = composeTo.trim();
    const body = composeBody.trim();
    const subject = composeSubject.trim();

    if (!to || (!body && composeAttachments.length === 0)) {
      setError("To and message or attachment are required");
      return;
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
      }),
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) {
      setSending(false);
      setError(typeof json?.error === "string" ? json.error : "Send failed");
      return;
    }

    const threadId = typeof json.threadId === "string" ? json.threadId : activeThreadId;

    setComposeBody("");
    setComposeAttachments([]);
    setSending(false);

    // Refresh threads + messages.
    await loadThreads(tab);
    if (threadId) setActiveThreadId(threadId);
  }

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

  function applyPickedVariable(variableKey: string) {
    const token = `{${variableKey}}`;
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

  async function regenToken() {
    const res = await fetch("/api/portal/inbox/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regenerateToken: true }),
    });
    if (!res.ok) return;
    setSettings((await res.json()) as SettingsRes);
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PortalVariablePickerModal
        open={variablePickerOpen}
        variables={PORTAL_MESSAGE_VARIABLES}
        onPick={applyPickedVariable}
        onClose={() => {
          setVariablePickerOpen(false);
          setVariablePickerTarget(null);
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Inbox / Outbox</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Email and SMS threads in one place.
          </p>
        </div>

        <div className="w-full sm:max-w-[440px]">
          <PortalSettingsSection
            title="Inbound setup"
            description="Webhook URL for inbound SMS (token-based)."
            accent="blue"
            dotClassName={
              settings?.twilio?.configured
                ? "bg-[color:var(--color-brand-blue)]"
                : "bg-zinc-400"
            }
          >
            <div className="space-y-3">
              <div
                className="rounded-2xl border border-zinc-200 bg-white p-4"
              >
                <div className="text-xs font-semibold text-zinc-600">Twilio SMS webhook (token-based)</div>
                <div className="mt-2 break-all font-mono text-xs text-zinc-800">
                  {settings?.webhooks.twilioInboundSmsUrlLegacy || "Loading…"}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-zinc-500">Twilio configured: {settings?.twilio?.configured ? "Yes" : "No"}</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                      disabled={!settings?.webhooks.twilioInboundSmsUrlLegacy}
                      onClick={async () => {
                        const v = settings?.webhooks.twilioInboundSmsUrlLegacy;
                        if (v) await navigator.clipboard.writeText(v);
                      }}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={regenToken}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-brand-ink hover:bg-zinc-50"
                      title="Regenerates the token in this URL"
                    >
                      Regenerate token
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </PortalSettingsSection>
        </div>
      </div>

      <div className="mt-6 flex w-full flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("email")}
          aria-current={tab === "email" ? "page" : undefined}
          className={
            "flex-1 min-w-[140px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "email"
              ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          Email
        </button>
        <button
          type="button"
          onClick={() => setTab("sms")}
          aria-current={tab === "sms" ? "page" : undefined}
          className={
            "flex-1 min-w-[140px] rounded-2xl border px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60 " +
            (tab === "sms"
              ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50")
          }
        >
          SMS
        </button>
      </div>

      {contactModalOpen && activeThread ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => setContactModalOpen(false)}>
          <div
            className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Contact details</div>
                <div className="mt-1 text-sm text-zinc-600">Used for tagging and automations.</div>
              </div>
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => setContactModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
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

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                onClick={() => setContactModalOpen(false)}
                disabled={savingContact}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-60"
                onClick={() => void saveActiveThreadContact()}
                disabled={!String(contactName || "").trim() || savingContact}
              >
                {savingContact ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
        <div className={classNames(
          "overflow-hidden rounded-3xl border border-zinc-200 bg-white lg:col-span-4",
        )}>
          {tab === "email" ? (
            <div className="border-b border-zinc-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">Mailboxes</div>
                <button
                  type="button"
                  className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                  onClick={() => {
                    setActiveThreadId(null);
                    setComposeTo("");
                    setComposeSubject("");
                    setComposeBody("");
                    setComposeAttachments([]);
                  }}
                >
                  New Email
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEmailBox("inbox")}
                  className={classNames(
                    "flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold",
                    emailBox === "inbox" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  Inbox
                </button>
                <button
                  type="button"
                  onClick={() => setEmailBox("sent")}
                  className={classNames(
                    "flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold",
                    emailBox === "sent" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  Sent
                </button>
              </div>
            </div>
          ) : (
            <div className="border-b border-zinc-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Messages</div>
                  <div className="mt-1 text-xs text-zinc-500">Your text conversations</div>
                </div>
                <button
                  type="button"
                  className="rounded-xl bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                  onClick={() => {
                    setActiveThreadId(null);
                    setComposeTo("");
                    setComposeBody("");
                    setComposeAttachments([]);
                  }}
                >
                  New SMS
                </button>
              </div>
            </div>
          )}

          {loadingThreads ? (
            <div className="px-3 py-4 text-sm text-zinc-600">Loading…</div>
          ) : visibleThreads.length ? (
            <div className="max-h-[76vh] overflow-y-auto p-2">
              {visibleThreads.map((t) => {
                const active = t.id === activeThreadId;

                if (tab === "sms") {
                  const title = displayNameFromAddress(t.peerAddress);
                  const subtitle = firstLinePreview(t.lastMessagePreview);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveThreadId(t.id)}
                      className={classNames(
                        "w-full rounded-2xl px-3 py-2 text-left transition",
                        active ? "bg-zinc-100" : "hover:bg-zinc-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-semibold text-zinc-900">{title}</div>
                          <div className="mt-0.5 truncate text-xs text-zinc-600">{subtitle || " "}</div>
                          {Array.isArray(t.contactTags) && t.contactTags.length ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {t.contactTags.slice(0, 3).map((tag) => (
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
                              {t.contactTags.length > 3 ? (
                                <span className="text-[10px] font-semibold text-zinc-500">+{t.contactTags.length - 3}</span>
                              ) : null}
                            </div>
                          ) : null}
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
                      "w-full rounded-2xl px-3 py-2 text-left transition",
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

        {/* Right panel: conversation view */}
        <div className={classNames(
          "overflow-hidden rounded-3xl border border-zinc-200 bg-white lg:col-span-8",
          tab === "sms" ? "" : "",
        )}>
          {tab === "sms" ? (
            <div className="flex h-full min-h-[68vh] flex-col">
              <div className="border-b border-zinc-100 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-zinc-900">
                      {activeThread ? activeThread.contact?.name || displayNameFromAddress(activeThread.peerAddress) : "New Message"}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {activeThread ? activeThread.peerAddress : "Enter a phone number to start a text"}
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
                <div className="border-b border-zinc-100 p-3">
                  <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2">
                    <div className="text-xs font-semibold text-zinc-600">To:</div>
                    <input
                      value={composeTo}
                      onChange={(e) => setComposeTo(e.target.value)}
                      placeholder="+15551234567"
                      className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                    />
                  </div>
                </div>
              ) : null}

              <div ref={smsScrollRef} className={classNames("flex-1 overflow-y-auto px-4 py-4", styles.smsPane)}>
                {loadingMessages ? (
                  <div className="text-sm text-zinc-600">Loading…</div>
                ) : messages.length ? (
                  <div className="space-y-2">
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
                        <div key={m.id} className={classNames("flex", mine ? "justify-end" : "justify-start", startsGroup ? "mt-2" : "mt-0")}
                        >
                          <div className={bubbleCls}>
                            {m.attachments?.length ? (
                              <div className="mb-2 space-y-2">
                                {m.attachments.map((a) => {
                                  const isImg = String(a.mimeType || "").startsWith("image/");
                                  if (isImg) {
                                    return (
                                      <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
                                        <img src={a.url} alt={a.fileName} className="max-h-56 w-full max-w-[240px] rounded-2xl object-cover" />
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
                            <div className="whitespace-pre-wrap break-words">{m.bodyText}</div>
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

              <div className={classNames("border-t border-zinc-100 p-3", styles.inputBar)}>
                {composeAttachments.length ? (
                  <div className="mb-2 flex flex-wrap gap-2 px-1">
                    {composeAttachments.map((a) => {
                      const isImg = String(a.mimeType || "").startsWith("image/");
                      return (
                        <div key={a.id} className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-2 py-1">
                          {isImg ? (
                            <img src={a.url} alt={a.fileName} className="h-8 w-8 rounded-xl object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 text-xs font-semibold text-zinc-700">
                              FILE
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="max-w-[180px] truncate text-xs font-semibold text-zinc-900">{a.fileName}</div>
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
                    {smsMoreOpen ? (
                      <>
                        <div
                          className="fixed inset-0 z-[70]"
                          onMouseDown={() => setSmsMoreOpen(false)}
                          onTouchStart={() => setSmsMoreOpen(false)}
                          aria-hidden
                        />
                        <div className="absolute bottom-full left-0 z-[75] mb-2 w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => {
                              setSmsMoreOpen(false);
                              openVariablePicker("sms_body");
                            }}
                          >
                            Insert variable
                          </button>
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => {
                              setSmsMoreOpen(false);
                              smsFileRef.current?.click();
                            }}
                          >
                            Upload from device
                          </button>
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
                            onClick={() => {
                              setSmsMoreOpen(false);
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
                      onClick={() => setSmsMoreOpen((v) => !v)}
                      aria-label="More"
                      aria-expanded={smsMoreOpen ? true : undefined}
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
                    placeholder="SMS"
                    className="w-full bg-transparent px-1 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
                  />


                  <button
                    type="button"
                    onClick={onSend}
                    disabled={sending}
                    className={classNames(styles.iconButton, styles.iconButtonPrimary, sending && "opacity-60")}
                    aria-label="Send"
                  >
                    <span className="text-[13px] font-semibold">↑</span>
                  </button>
                </div>
                <div className="mt-1 px-2 text-[11px] text-zinc-500">
                  {uploading ? "Uploading…" : "Press Enter to send"}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[68vh] flex-col">
              <div className="border-b border-zinc-100 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-zinc-900">
                      {activeThread ? activeThread.contact?.name || mailSubjectOrNo(activeThread.subject) : "New Email"}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {activeThread ? activeThread.peerAddress : "Compose a new message"}
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
                <div className="border-b border-zinc-100 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold text-zinc-700">To</div>
                      <input
                        value={composeTo}
                        onChange={(e) => setComposeTo(e.target.value)}
                        placeholder="name@company.com"
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold text-zinc-700">Subject</div>
                        <button
                          type="button"
                          className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                          onClick={() => openVariablePicker("email_subject")}
                        >
                          Insert variable
                        </button>
                      </div>
                      <input
                        ref={emailSubjectRef}
                        value={composeSubject}
                        onChange={(e) => setComposeSubject(e.target.value)}
                        placeholder="Subject"
                        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="flex-1 overflow-y-auto bg-zinc-50 p-4">
                {loadingMessages ? (
                  <div className="text-sm text-zinc-600">Loading…</div>
                ) : messages.length ? (
                  <div className="space-y-3">
                    {messages.map((m) => (
                      <div key={m.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-zinc-800">
                            {m.direction === "OUT" ? "You" : m.fromAddress}
                          </div>
                          <div className="text-[11px] text-zinc-500">{formatWhen(m.createdAt)}</div>
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">To: {m.toAddress}</div>
                        <div className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-800">{m.bodyText}</div>
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

              <div className="border-t border-zinc-100 bg-white p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-zinc-700">{activeThread ? "Reply" : "Message"}</div>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                    onClick={() => openVariablePicker("email_body")}
                  >
                    Insert variable
                  </button>
                </div>
                <textarea
                  ref={emailBodyRef}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  rows={4}
                  placeholder={activeThread ? "Type your reply…" : "Type your email…"}
                  className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
                {composeAttachments.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {composeAttachments.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-2 py-1">
                        <div className="max-w-[220px] truncate text-xs font-semibold text-zinc-900">{a.fileName}</div>
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
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-zinc-500">
                    {activeThread ? `Replying to ${activeThread.peerAddress}` : ""}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openVariablePicker("email_body")}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Insert variable
                    </button>
                    <button
                      type="button"
                      onClick={() => emailFileRef.current?.click()}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Attach
                    </button>
                    <button
                      type="button"
                      onClick={() => setMediaPickerOpen(true)}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
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
                      onClick={onSend}
                      disabled={sending}
                      className={classNames(
                        "rounded-2xl bg-brand-ink px-5 py-2 text-sm font-semibold text-white hover:opacity-95",
                        sending && "opacity-60",
                      )}
                    >
                      {sending ? "Sending…" : uploading ? "Uploading…" : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <PortalMediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onPick={attachFromMediaLibrary}
        confirmLabel="Add"
        title="Add from media library"
      />
    </div>
  );
}
