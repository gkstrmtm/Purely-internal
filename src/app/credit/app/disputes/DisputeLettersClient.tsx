"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";

type ContactLite = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type LetterLite = {
  id: string;
  status: "DRAFT" | "GENERATED" | "SENT";
  subject: string;
  createdAt: string;
  updatedAt: string;
  generatedAt: string | null;
  sentAt: string | null;
  lastSentTo: string | null;
  contactId: string;
  creditPullId: string | null;
  contact: ContactLite;
};

type LetterFull = LetterLite & {
  bodyText: string;
  pdfMediaItemId?: string | null;
  pdfGeneratedAt?: string | null;
  pdfMediaItem?: { id: string; publicToken: string } | null;
};

type PdfResponse =
  | {
      ok: true;
      pdf: {
        mediaItemId: string;
        openUrl: string;
        downloadUrl: string;
        shareUrl: string;
        generatedAt?: string | null;
      };
    }
  | { ok: false; error?: string };

const LETTER_STAGE_OPTIONS: PortalListboxOption<string>[] = [
  { value: "initial-review", label: "Initial review" },
  { value: "follow-up", label: "Follow-up review" },
  { value: "escalated", label: "Escalated review" },
  { value: "custom", label: "Custom strategy" },
];

const LETTER_LIBRARY = [
  {
    key: "bureau-general",
    label: "General bureau investigation request",
    summary: "Use when the report has inaccurate balances, dates, statuses, or other bureau-reporting errors.",
    education: "Best when you want a clean investigation request that lists the items and asks the bureau to verify each one carefully.",
    prompt: "Draft a professional bureau dispute letter that requests reinvestigation of inaccurate reporting under the FCRA without sounding aggressive or generic.",
    bodyStarter:
      "Date: {{today}}\n\n{{recipient_name}}\n{{recipient_address}}\n\nRe: Request for investigation of inaccurate credit reporting\n\nTo whom it may concern,\n\nI am writing to request an investigation of information appearing on my credit file that I believe is inaccurate or incomplete. Please review the items listed below, verify them against your records, and delete or correct any information that cannot be fully verified.\n\nItems I am disputing:\n{{dispute_items}}\n\nPlease send me the results of your investigation and an updated copy of my report after your review is complete. Thank you for your prompt attention to this matter.\n\nSincerely,\n{{consumer_name}}",
  },
  {
    key: "late-payment",
    label: "Late payment correction request",
    summary: "Use when a late mark was reported incorrectly, paid on time, or should be updated after supporting proof.",
    education: "Strong when you have payment proof, bank records, or account history showing the late status is wrong or overstated.",
    prompt: "Draft a dispute letter focused on inaccurate late-payment reporting and request correction or deletion after investigation.",
    bodyStarter:
      "Date: {{today}}\n\n{{recipient_name}}\n{{recipient_address}}\n\nRe: Inaccurate late-payment reporting\n\nTo whom it may concern,\n\nI am disputing late-payment information that appears to be inaccurate on my credit report. I am requesting that you review the payment history, account records, and reporting details for the items below and correct any late marks that cannot be verified as accurate.\n\nItems I am disputing:\n{{dispute_items}}\n\nIf your investigation confirms the reporting is incomplete or incorrect, please update the account history and send me written confirmation of the correction.\n\nSincerely,\n{{consumer_name}}",
  },
  {
    key: "identity-theft",
    label: "Identity theft or not-mine account dispute",
    summary: "Use when the consumer does not recognize the account, inquiry, or personal information showing on the report.",
    education: "Works best when paired with an identity theft report, FTC affidavit, police report, or a clear statement that the item is not theirs.",
    prompt: "Draft a dispute letter for accounts, inquiries, or personal information the consumer states are not theirs or may be identity theft related.",
    bodyStarter:
      "Date: {{today}}\n\n{{recipient_name}}\n{{recipient_address}}\n\nRe: Dispute of accounts or inquiries not belonging to me\n\nTo whom it may concern,\n\nI am writing to dispute information on my credit report that does not belong to me. The items below are unfamiliar to me and may be the result of identity theft, mixed file information, or reporting error. Please investigate these items, block or remove any information that is not mine, and send me written confirmation once your review is complete.\n\nItems I am disputing:\n{{dispute_items}}\n\nThank you for your prompt attention to this matter.\n\nSincerely,\n{{consumer_name}}",
  },
  {
    key: "collection-account",
    label: "Collection account verification request",
    summary: "Use when a collection account lacks clear ownership, amount accuracy, dates, or complete verification.",
    education: "Helpful when the collection agency data is inconsistent, incomplete, duplicated, or unsupported by the file details you have.",
    prompt: "Draft a dispute letter requesting investigation and verification of collection-account reporting that appears inaccurate, incomplete, or unsupported.",
    bodyStarter:
      "Date: {{today}}\n\n{{recipient_name}}\n{{recipient_address}}\n\nRe: Request to investigate collection-account reporting\n\nTo whom it may concern,\n\nI am requesting an investigation of collection-account information reported on my credit file that appears inaccurate, incomplete, or unsupported. Please review the ownership details, balance, dates, and reporting history for the items below and remove or correct any information that cannot be properly verified.\n\nItems I am disputing:\n{{dispute_items}}\n\nPlease provide the results of your investigation and an updated report once the review has been completed.\n\nSincerely,\n{{consumer_name}}",
  },
  {
    key: "mixed-file",
    label: "Mixed file / personal information mismatch",
    summary: "Use when addresses, employers, aliases, or accounts appear to belong to another person with a similar identity.",
    education: "Useful when the profile itself looks crossed with someone else and the reporting errors trace back to personal-information mismatches.",
    prompt: "Draft a dispute letter focused on mixed-file issues, incorrect personal information, and the need to separate another consumer's data from this file.",
    bodyStarter:
      "Date: {{today}}\n\n{{recipient_name}}\n{{recipient_address}}\n\nRe: Mixed file and inaccurate identifying information\n\nTo whom it may concern,\n\nI am disputing identifying information and related reporting on my credit file that appears to be mixed with another consumer. Please review the personal information and associated accounts listed below and remove, correct, or separate any information that does not belong on my file.\n\nItems I am disputing:\n{{dispute_items}}\n\nPlease confirm the corrections made after your investigation is complete.\n\nSincerely,\n{{consumer_name}}",
  },
  {
    key: "inquiry",
    label: "Unauthorized inquiry challenge",
    summary: "Use when a hard inquiry is unfamiliar, unauthorized, or should not have been reported to the file.",
    education: "Best for inquiry disputes where the consumer does not recognize the lender, did not authorize the pull, or believes it is attached to the wrong file.",
    prompt: "Draft a concise credit-bureau dispute letter challenging unauthorized or inaccurate hard inquiries.",
    bodyStarter:
      "Date: {{today}}\n\n{{recipient_name}}\n{{recipient_address}}\n\nRe: Dispute of unauthorized inquiry reporting\n\nTo whom it may concern,\n\nI am disputing one or more inquiries appearing on my credit report that I do not recognize or did not authorize. Please investigate the items below and remove any inquiry that cannot be verified as permissible and accurate.\n\nItems I am disputing:\n{{dispute_items}}\n\nPlease send me written confirmation after your investigation is complete.\n\nSincerely,\n{{consumer_name}}",
  },
] as const;

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function statusLabel(status: LetterLite["status"]) {
  if (status === "GENERATED") return "Generated";
  if (status === "SENT") return "Sent";
  return "Draft";
}

function statusClasses(status: LetterLite["status"]) {
  if (status === "GENERATED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "SENT") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-700";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function buildDisputesText(items: string[]) {
  return items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n");
}

function buildLetterRoutes(pathname: string | null) {
  const current = String(pathname || "");
  if (current.startsWith("/credit/app/disputes")) {
    return {
      listHref: "/credit/app/disputes",
      editorHref: (letterId: string) => `/credit/app/disputes/${encodeURIComponent(letterId)}`,
    };
  }
  if (current.startsWith("/credit")) {
    return {
      listHref: "/credit/app/services/dispute-letters",
      editorHref: (letterId: string) => `/credit/app/services/dispute-letters/${encodeURIComponent(letterId)}`,
    };
  }
  return {
    listHref: "/portal/app/services/dispute-letters",
    editorHref: (letterId: string) => `/portal/app/services/dispute-letters/${encodeURIComponent(letterId)}`,
  };
}

function toLetterLite(letter: LetterFull): LetterLite {
  return {
    id: letter.id,
    status: letter.status,
    subject: letter.subject,
    createdAt: letter.createdAt,
    updatedAt: letter.updatedAt,
    generatedAt: letter.generatedAt,
    sentAt: letter.sentAt,
    lastSentTo: letter.lastSentTo,
    contactId: letter.contactId,
    creditPullId: letter.creditPullId,
    contact: letter.contact,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !json) {
    const msg = (json as any)?.error ? String((json as any).error) : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export default function DisputeLettersClient({
  mode = "list",
  initialLetterId = "",
}: {
  mode?: "list" | "editor";
  initialLetterId?: string;
}) {
  const pathname = usePathname();
  const routes = useMemo(() => buildLetterRoutes(pathname), [pathname]);

  const [error, setError] = useState<string | null>(null);
  const [lettersLoading, setLettersLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [letterLoading, setLetterLoading] = useState(false);
  const [working, setWorking] = useState<null | "generate" | "save" | "send" | "pdf">(null);

  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [draftContactQuery, setDraftContactQuery] = useState("");
  const [draftContactId, setDraftContactId] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");

  const [selectedStage, setSelectedStage] = useState<string>("initial-review");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>(LETTER_LIBRARY[0]?.key || "bureau-general");
  const [recipientName, setRecipientName] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [disputeItems, setDisputeItems] = useState<string[]>([""]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  const [letters, setLetters] = useState<LetterLite[]>([]);
  const [letterQuery, setLetterQuery] = useState("");
  const [selectedLetterId, setSelectedLetterId] = useState<string>(initialLetterId);
  const [selectedLetterSnapshot, setSelectedLetterSnapshot] = useState<LetterFull | null>(null);
  const [letterDraftSubject, setLetterDraftSubject] = useState<string>("");
  const [letterDraftBody, setLetterDraftBody] = useState<string>("");
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string>("");

  const templateOptions = useMemo(
    () => LETTER_LIBRARY.map((template) => ({ value: template.key, label: template.label })) as PortalListboxOption<string>[],
    [],
  );
  const selectedTemplate = useMemo(
    () => LETTER_LIBRARY.find((entry) => entry.key === selectedTemplateKey) || LETTER_LIBRARY[0],
    [selectedTemplateKey],
  );

  const selectedLetter = useMemo(() => {
    const fromList = letters.find((letter) => letter.id === selectedLetterId);
    if (fromList) return fromList;
    if (selectedLetterSnapshot && selectedLetterSnapshot.id === selectedLetterId) return toLetterLite(selectedLetterSnapshot);
    return null;
  }, [letters, selectedLetterId, selectedLetterSnapshot]);

  const selectedContact = useMemo(() => {
    const fromContacts = contacts.find((contact) => contact.id === selectedContactId);
    if (fromContacts) return fromContacts;
    if (selectedLetterSnapshot?.contact && selectedLetterSnapshot.contact.id === selectedContactId) return selectedLetterSnapshot.contact;
    return null;
  }, [contacts, selectedContactId, selectedLetterSnapshot]);

  const draftContact = useMemo(() => {
    const fromContacts = contacts.find((contact) => contact.id === draftContactId);
    if (fromContacts) return fromContacts;
    if (selectedLetterSnapshot?.contact && selectedLetterSnapshot.contact.id === draftContactId) return selectedLetterSnapshot.contact;
    return null;
  }, [contacts, draftContactId, selectedLetterSnapshot]);

  const filteredLetters = useMemo(() => {
    const query = letterQuery.trim().toLowerCase();
    if (!query) return letters;
    return letters.filter((letter) => {
      const haystack = [letter.subject, letter.contact?.name, letter.contact?.email, letter.status]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [letterQuery, letters]);

  const cleanDisputeItems = useMemo(
    () => disputeItems.map((item) => String(item || "").trim()).filter(Boolean),
    [disputeItems],
  );

  const canGenerate = Boolean(draftContactId && cleanDisputeItems.length > 0);
  const editorReady = mode === "editor" && Boolean(selectedLetterId);

  const loadContacts = useCallback(async (query: string) => {
    setContactsLoading(true);
    const url = `/api/portal/credit/contacts${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`;
    try {
      const json = await fetchJson<{ ok: true; contacts: Array<any> }>(url, { cache: "no-store" as any });
      const next: ContactLite[] = (json.contacts || []).map((contact: any) => ({
        id: String(contact.id),
        name: String(contact.name || ""),
        email: contact.email ? String(contact.email) : null,
        phone: contact.phone ? String(contact.phone) : null,
      }));
      setContacts(next);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const loadLetters = useCallback(async () => {
    setLettersLoading(true);
    try {
      const json = await fetchJson<{ ok: true; letters: LetterLite[] }>("/api/portal/credit/disputes", { cache: "no-store" as any });
      setLetters(json.letters || []);
    } finally {
      setLettersLoading(false);
    }
  }, []);

  const loadLetter = useCallback(async (letterId: string) => {
    if (!letterId) return;
    setLetterLoading(true);
    setPdfDownloadUrl("");
    try {
      const json = await fetchJson<{ ok: true; letter: LetterFull }>(
        `/api/portal/credit/disputes/${encodeURIComponent(letterId)}`,
        { cache: "no-store" as any },
      );
      const letter = json.letter;
      setSelectedLetterSnapshot(letter);
      setSelectedLetterId(letter.id);
      setSelectedContactId(letter.contactId);
      setLetterDraftSubject(letter.subject || "");
      setLetterDraftBody(letter.bodyText || "");

      const media = letter.pdfMediaItem;
      if (media?.id && media?.publicToken) {
        const openUrl = `/api/public/media/item/${media.id}/${media.publicToken}`;
        setPdfDownloadUrl(`${openUrl}?download=1`);
      }
    } finally {
      setLetterLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        await Promise.all([loadContacts(""), loadLetters()]);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadContacts, loadLetters]);

  useEffect(() => {
    if (!selectedLetterId) {
      if (mode === "editor") {
        setSelectedLetterSnapshot(null);
        setLetterDraftSubject("");
        setLetterDraftBody("");
        setPdfDownloadUrl("");
      }
      return;
    }
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        await loadLetter(selectedLetterId);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load letter");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLetter, mode, selectedLetterId]);

  const openComposer = useCallback(() => {
    setDraftContactId(selectedContactId || "");
    setDraftContactQuery("");
    setSelectedStage("initial-review");
    setSelectedTemplateKey(LETTER_LIBRARY[0]?.key || "bureau-general");
    setRecipientName("");
    setRecipientAddress("");
    setDisputeItems([""]);
    setIsComposerOpen(true);
  }, [selectedContactId]);

  const closeComposer = useCallback(() => {
    if (working === "generate") return;
    setIsComposerOpen(false);
  }, [working]);

  const updateDisputeItem = useCallback((index: number, value: string) => {
    setDisputeItems((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const removeDisputeItem = useCallback((index: number) => {
    setDisputeItems((prev) => {
      const next = prev.filter((_, itemIndex) => itemIndex !== index);
      return next.length ? next : [""];
    });
  }, []);

  const generateLetter = useCallback(async () => {
    if (!canGenerate) return;
    setWorking("generate");
    setError(null);
    try {
      const disputesText = buildDisputesText(cleanDisputeItems);
      const json = await fetchJson<{ ok: true; letter: LetterFull; pdf?: { downloadUrl?: string | null } }>(
        "/api/portal/credit/disputes",
        {
          method: "POST",
          body: JSON.stringify({
            contactId: draftContactId,
            recipientName: recipientName.trim() || undefined,
            recipientAddress: recipientAddress.trim() || undefined,
            disputesText,
            letterStageLabel:
              LETTER_STAGE_OPTIONS.find((entry) => entry.value === selectedStage)?.label || "Initial review",
            templateLabel: selectedTemplate.label,
            templatePrompt: selectedTemplate.prompt,
            templateBodyStarter: selectedTemplate.bodyStarter,
          }),
        },
      );
      await loadLetters();
      setIsComposerOpen(false);
      setSelectedLetterSnapshot(json.letter);
      setSelectedLetterId(json.letter.id);
      setSelectedContactId(json.letter.contactId);
      setLetterDraftSubject(json.letter.subject || "");
      setLetterDraftBody(json.letter.bodyText || "");
      setPdfDownloadUrl(typeof json.pdf?.downloadUrl === "string" ? json.pdf.downloadUrl : "");
      window.location.href = routes.editorHref(json.letter.id);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to generate");
    } finally {
      setWorking(null);
    }
  }, [
    canGenerate,
    cleanDisputeItems,
    draftContactId,
    loadLetters,
    recipientAddress,
    recipientName,
    routes,
    selectedStage,
    selectedTemplate,
  ]);

  const ensurePdf = useCallback(async () => {
    if (!selectedLetterId) return;
    setWorking("pdf");
    setError(null);
    try {
      const json = await fetchJson<PdfResponse>(
        `/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}/pdf`,
        { method: "POST", body: JSON.stringify({}) },
      );
      if (json.ok) setPdfDownloadUrl(json.pdf.downloadUrl);
      await loadLetter(selectedLetterId);
      await loadLetters();
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to generate PDF");
    } finally {
      setWorking(null);
    }
  }, [loadLetter, loadLetters, selectedLetterId]);

  const saveLetter = useCallback(async () => {
    if (!selectedLetterId) return;
    setWorking("save");
    setError(null);
    try {
      const json = await fetchJson<{ ok: true; letter: Partial<LetterFull> & { contact?: ContactLite } }>(
        `/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            subject: letterDraftSubject.trim(),
            bodyText: letterDraftBody,
          }),
        },
      );
      setSelectedLetterSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...json.letter,
          contactId: prev.contactId,
          creditPullId: prev.creditPullId,
          contact: json.letter.contact || prev.contact,
          subject: typeof json.letter.subject === "string" ? json.letter.subject : prev.subject,
          bodyText: typeof json.letter.bodyText === "string" ? json.letter.bodyText : prev.bodyText,
          status: (json.letter.status as LetterLite["status"] | undefined) || prev.status,
          updatedAt: typeof json.letter.updatedAt === "string" ? json.letter.updatedAt : prev.updatedAt,
        };
      });
      await loadLetters();
      await loadLetter(selectedLetterId);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to save");
    } finally {
      setWorking(null);
    }
  }, [letterDraftBody, letterDraftSubject, loadLetter, loadLetters, selectedLetterId]);

  const sendLetter = useCallback(async () => {
    if (!selectedLetterId) return;
    setWorking("send");
    setError(null);
    try {
      await fetchJson<{ ok: true }>(`/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}/send`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadLetters();
      await loadLetter(selectedLetterId);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to send");
    } finally {
      setWorking(null);
    }
  }, [loadLetter, loadLetters, selectedLetterId]);

  if (mode === "editor") {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <button
              type="button"
              onClick={() => {
                window.location.href = routes.listHref;
              }}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              Back
            </button>
            <h1 className="mt-3 text-2xl font-bold text-brand-ink sm:text-3xl">
              {selectedLetter?.subject || "Dispute letter"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              {selectedLetter ? (
                <span className={classNames("rounded-full border px-2.5 py-1 text-xs font-semibold", statusClasses(selectedLetter.status))}>
                  {statusLabel(selectedLetter.status)}
                </span>
              ) : null}
              <span>{selectedLetter ? `Last saved ${formatDateTime(selectedLetter.updatedAt)}` : "Loading letter"}</span>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={openComposer}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
            >
              New Letter
            </button>
            <button
              type="button"
              disabled={!selectedLetterId || working !== null}
              onClick={ensurePdf}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
            >
              {working === "pdf" ? "Working…" : pdfDownloadUrl ? "Refresh PDF" : "Generate PDF"}
            </button>
            {pdfDownloadUrl ? (
              <a
                href={pdfDownloadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                Download PDF
              </a>
            ) : null}
            <button
              type="button"
              disabled={!selectedLetterId || working !== null}
              onClick={saveLetter}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
            >
              {working === "save" ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={!selectedLetterId || !selectedContact?.email || working !== null}
              onClick={sendLetter}
              className="inline-flex items-center justify-center rounded-2xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              title={selectedContact?.email ? "" : "Contact needs an email"}
            >
              {working === "send" ? "Sending…" : "Send"}
            </button>
          </div>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        {!editorReady ? (
          <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
            {letterLoading ? "Loading letter…" : "No letter selected."}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-3xl border border-zinc-200 bg-white p-6">
              <label className="block">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Subject</div>
                <input
                  value={letterDraftSubject}
                  onChange={(e) => setLetterDraftSubject(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                />
              </label>

              <label className="mt-4 block">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Letter</div>
                <textarea
                  value={letterDraftBody}
                  onChange={(e) => setLetterDraftBody(e.target.value)}
                  className="min-h-140 w-full rounded-3xl border border-zinc-200 bg-white px-4 py-4 font-mono text-sm text-zinc-800 outline-none focus:border-zinc-300"
                />
              </label>
            </section>

            <aside className="space-y-4">
              <section className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="text-sm font-semibold text-zinc-900">Contact</div>
                {selectedContact ? (
                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-sm font-semibold text-zinc-900">{selectedContact.name}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {selectedContact.email || "No email"}
                      {selectedContact.phone ? ` • ${selectedContact.phone}` : ""}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
                    No contact linked.
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-zinc-200 bg-white p-5">
                <div className="text-sm font-semibold text-zinc-900">Activity</div>
                <div className="mt-3 space-y-3 text-sm text-zinc-600">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Created</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">{formatDateTime(selectedLetter?.createdAt)}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Generated</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">{formatDateTime(selectedLetter?.generatedAt)}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sent</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">{formatDateTime(selectedLetter?.sentAt)}</div>
                    {selectedLetter?.lastSentTo ? <div className="mt-1 text-xs text-zinc-500">{selectedLetter.lastSentTo}</div> : null}
                  </div>
                </div>
              </section>
            </aside>
          </div>
        )}

        {isComposerOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]"
            role="dialog"
            aria-modal="true"
            onMouseDown={closeComposer}
          >
            <div
              className="w-full max-w-3xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">New Letter</div>
                  <div className="mt-1 text-sm text-zinc-600">Build the draft, then jump straight into the editor.</div>
                </div>
                <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                  {cleanDisputeItems.length} item{cleanDisputeItems.length === 1 ? "" : "s"}
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contact</div>
                  <div className="flex gap-2">
                    <input
                      value={draftContactQuery}
                      onChange={(e) => setDraftContactQuery(e.target.value)}
                      className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      placeholder="Search contacts"
                    />
                    <button
                      type="button"
                      disabled={contactsLoading}
                      onClick={() => {
                        setError(null);
                        void loadContacts(draftContactQuery).catch((e: any) => {
                          setError(e?.message ? String(e.message) : "Failed to load contacts");
                        });
                      }}
                      className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                    >
                      {contactsLoading ? "Searching…" : "Search"}
                    </button>
                  </div>
                  <div className="mt-2">
                    <PortalListboxDropdown
                      value={draftContactId}
                      onChange={(value) => setDraftContactId(String(value || ""))}
                      disabled={contactsLoading || contacts.length === 0}
                      placeholder="Select a contact"
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50"
                      options={
                        contacts.length
                          ? contacts.map(
                              (contact): PortalListboxOption<string> => ({
                                value: contact.id,
                                label: `${contact.name}${contact.email ? ` - ${contact.email}` : ""}`,
                              }),
                            )
                          : ([{ value: "", label: "No contacts found", disabled: true }] as PortalListboxOption<string>[])
                      }
                    />
                  </div>
                  {draftContact ? (
                    <div className="mt-2 text-xs text-zinc-500">
                      {draftContact.email || "No email"}
                      {draftContact.phone ? ` • ${draftContact.phone}` : ""}
                    </div>
                  ) : null}
                </label>

                <label className="block">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Strategy</div>
                  <PortalListboxDropdown
                    value={selectedStage}
                    onChange={(value) => setSelectedStage(String(value || "initial-review"))}
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50"
                    options={LETTER_STAGE_OPTIONS}
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Template</div>
                  <PortalListboxDropdown
                    value={selectedTemplateKey}
                    onChange={(value) => setSelectedTemplateKey(String(value || LETTER_LIBRARY[0]?.key || "bureau-general"))}
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50"
                    options={templateOptions}
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recipient</div>
                  <input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                    placeholder="Experian"
                  />
                </label>

                <label className="block">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Address</div>
                  <input
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                    placeholder="Mailing address"
                  />
                </label>
              </div>

              <div className="mt-5">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Dispute Items</div>
                <div className="space-y-2">
                  {disputeItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        value={item}
                        onChange={(e) => updateDisputeItem(index, e.target.value)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                        placeholder={index === 0 ? "Account XXXX reported late but was paid on time" : "Add another dispute item"}
                      />
                      <button
                        type="button"
                        onClick={() => removeDisputeItem(index)}
                        className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                        aria-label="Remove dispute item"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setDisputeItems((prev) => [...prev, ""])}
                  className="mt-3 inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  + Add dispute item
                </button>
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeComposer}
                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canGenerate || working !== null}
                  onClick={generateLetter}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                >
                  {working === "generate" ? "Generating…" : "Generate"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Dispute letters</h1>
          <p className="mt-1 text-sm text-zinc-600">Open a draft or start a new one.</p>
        </div>
        <button
          type="button"
          onClick={openComposer}
          className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95"
        >
          New Letter
        </button>
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:max-w-xl">
            <input
              value={letterQuery}
              onChange={(e) => setLetterQuery(e.target.value)}
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
              placeholder="Search letters"
            />
            <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">
              {lettersLoading ? "Loading…" : `${filteredLetters.length} shown`}
            </div>
          </div>
          <div className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600">
            {letters.length} total
          </div>
        </div>

        <div className="mt-5 overflow-x-auto rounded-3xl border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Letter</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLetters.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-zinc-600" colSpan={5}>
                    {lettersLoading ? "Loading letters…" : "No letters yet."}
                  </td>
                </tr>
              ) : (
                filteredLetters.map((letter) => (
                  <tr key={letter.id} className="border-t border-zinc-200">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-brand-ink">{letter.subject || "Untitled"}</div>
                      <div className="mt-1 text-xs text-zinc-500">Created {formatDateTime(letter.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      <div className="font-medium text-zinc-900">{letter.contact.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{letter.contact.email || "No email"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={classNames("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClasses(letter.status))}>
                        {statusLabel(letter.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{formatDateTime(letter.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = routes.editorHref(letter.id);
                        }}
                        className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isComposerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-4 pt-[calc(var(--pa-modal-safe-top,0px)+1rem)] pb-[calc(var(--pa-modal-safe-bottom,0px)+1rem)]"
          role="dialog"
          aria-modal="true"
          onMouseDown={closeComposer}
        >
          <div
            className="w-full max-w-3xl max-h-[calc(100dvh-var(--pa-modal-safe-top,0px)-var(--pa-modal-safe-bottom,0px)-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">New Letter</div>
                <div className="mt-1 text-sm text-zinc-600">Build the draft, then jump straight into the editor.</div>
              </div>
              <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">
                {cleanDisputeItems.length} item{cleanDisputeItems.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contact</div>
                <div className="flex gap-2">
                  <input
                    value={draftContactQuery}
                    onChange={(e) => setDraftContactQuery(e.target.value)}
                    className="flex-1 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                    placeholder="Search contacts"
                  />
                  <button
                    type="button"
                    disabled={contactsLoading}
                    onClick={() => {
                      setError(null);
                      void loadContacts(draftContactQuery).catch((e: any) => {
                        setError(e?.message ? String(e.message) : "Failed to load contacts");
                      });
                    }}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-brand-ink hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {contactsLoading ? "Searching…" : "Search"}
                  </button>
                </div>
                <div className="mt-2">
                  <PortalListboxDropdown
                    value={draftContactId}
                    onChange={(value) => setDraftContactId(String(value || ""))}
                    disabled={contactsLoading || contacts.length === 0}
                    placeholder="Select a contact"
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50"
                    options={
                      contacts.length
                        ? contacts.map(
                            (contact): PortalListboxOption<string> => ({
                              value: contact.id,
                              label: `${contact.name}${contact.email ? ` - ${contact.email}` : ""}`,
                            }),
                          )
                        : ([{ value: "", label: "No contacts found", disabled: true }] as PortalListboxOption<string>[])
                    }
                  />
                </div>
                {draftContact ? (
                  <div className="mt-2 text-xs text-zinc-500">
                    {draftContact.email || "No email"}
                    {draftContact.phone ? ` • ${draftContact.phone}` : ""}
                  </div>
                ) : null}
              </label>

              <label className="block">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Strategy</div>
                <PortalListboxDropdown
                  value={selectedStage}
                  onChange={(value) => setSelectedStage(String(value || "initial-review"))}
                  buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50"
                  options={LETTER_STAGE_OPTIONS}
                />
              </label>

              <label className="block">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Template</div>
                <PortalListboxDropdown
                  value={selectedTemplateKey}
                  onChange={(value) => setSelectedTemplateKey(String(value || LETTER_LIBRARY[0]?.key || "bureau-general"))}
                  buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50"
                  options={templateOptions}
                />
              </label>

              <label className="block">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recipient</div>
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="Experian"
                />
              </label>

              <label className="block">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Address</div>
                <input
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                  placeholder="Mailing address"
                />
              </label>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Dispute Items</div>
              <div className="space-y-2">
                {disputeItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      value={item}
                      onChange={(e) => updateDisputeItem(index, e.target.value)}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300"
                      placeholder={index === 0 ? "Account XXXX reported late but was paid on time" : "Add another dispute item"}
                    />
                    <button
                      type="button"
                      onClick={() => removeDisputeItem(index)}
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                      aria-label="Remove dispute item"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDisputeItems((prev) => [...prev, ""])}
                className="mt-3 inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                + Add dispute item
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeComposer}
                className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canGenerate || working !== null}
                onClick={generateLetter}
                className="inline-flex items-center justify-center rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {working === "generate" ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
