"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

function stageSupportCopy(stage: string) {
  switch (stage) {
    case "follow-up":
      return "Use a follow-up tone when the first request did not lead to a clear correction or the bureau response was incomplete.";
    case "escalated":
      return "Use an escalated tone when the file still contains the same issue after prior review and you need a firmer reinvestigation request.";
    case "custom":
      return "Use custom strategy when you need to tailor the letter around a very specific fact pattern or supporting documentation set.";
    default:
      return "Use an initial review tone when you are opening the first clean investigation request for the disputed items.";
  }
}

function templatePreviewText(template: (typeof LETTER_LIBRARY)[number]) {
  return template.bodyStarter;
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

export default function DisputeLettersClient() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  const [selectedStage, setSelectedStage] = useState<string>("initial-review");
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>(LETTER_LIBRARY[0]?.key || "bureau-general");

  const [recipientName, setRecipientName] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [disputesText, setDisputesText] = useState<string>("");

  const [letters, setLetters] = useState<LetterLite[]>([]);
  const [selectedLetterId, setSelectedLetterId] = useState<string>("");
  const [letterDraftSubject, setLetterDraftSubject] = useState<string>("");
  const [letterDraftBody, setLetterDraftBody] = useState<string>("");
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string>("");

  const selectedLetter = useMemo(() => letters.find((l) => l.id === selectedLetterId) || null, [letters, selectedLetterId]);
  const selectedTemplate = useMemo(
    () => LETTER_LIBRARY.find((entry) => entry.key === selectedTemplateKey) || LETTER_LIBRARY[0],
    [selectedTemplateKey],
  );
  const selectedTemplatePreview = useMemo(() => templatePreviewText(selectedTemplate), [selectedTemplate]);
  const selectedStageLabel = useMemo(
    () => LETTER_STAGE_OPTIONS.find((entry) => entry.value === selectedStage)?.label || "Initial review",
    [selectedStage],
  );

  const loadContacts = useCallback(async (q: string) => {
    const url = `/api/portal/credit/contacts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`;
    const json = await fetchJson<{ ok: true; contacts: Array<any> }>(url);
    const next: ContactLite[] = (json.contacts || []).map((c: any) => ({
      id: String(c.id),
      name: String(c.name || ""),
      email: c.email ? String(c.email) : null,
      phone: c.phone ? String(c.phone) : null,
    }));
    setContacts(next);
    setSelectedContactId((prev) => prev || next[0]?.id || "");
  }, []);

  const loadLetters = useCallback(async (contactId: string) => {
    const url = `/api/portal/credit/disputes${contactId ? `?contactId=${encodeURIComponent(contactId)}` : ""}`;
    const json = await fetchJson<{ ok: true; letters: LetterLite[] }>(url);
    setLetters(json.letters || []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setError(null);
    void (async () => {
      try {
        await loadContacts("");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load contacts");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadContacts]);

  useEffect(() => {
    if (!selectedContactId) return;
    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        await loadLetters(selectedContactId);
        if (cancelled) return;
        setSelectedLetterId("");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load" );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadLetters, selectedContactId]);

  useEffect(() => {
    if (!selectedLetterId) return;
    let cancelled = false;
    setError(null);
    setPdfDownloadUrl("");

    void (async () => {
      try {
        const json = await fetchJson<{ ok: true; letter: LetterFull }>(`/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}`);
        if (cancelled) return;
        setLetterDraftSubject(json.letter.subject || "");
        setLetterDraftBody(json.letter.bodyText || "");

        const media = (json.letter as any)?.pdfMediaItem;
        if (media?.id && media?.publicToken) {
          const openUrl = `/api/public/media/item/${media.id}/${media.publicToken}`;
          setPdfDownloadUrl(`${openUrl}?download=1`);
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load letter" );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedLetterId]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || null,
    [contacts, selectedContactId],
  );

  const generateLetter = async () => {
    if (!selectedContactId) return;
    setBusy(true);
    setError(null);
    try {
      const json = await fetchJson<{ ok: true; letter: LetterFull; pdf?: any }>("/api/portal/credit/disputes", {
        method: "POST",
        body: JSON.stringify({
          contactId: selectedContactId,
          recipientName: recipientName.trim() || undefined,
          recipientAddress: recipientAddress.trim() || undefined,
          disputesText: disputesText.trim(),
          letterStageLabel: selectedStageLabel,
          templateLabel: selectedTemplate.label,
          templatePrompt: selectedTemplate.prompt,
          templateBodyStarter: selectedTemplate.bodyStarter,
        }),
      });
      await loadLetters(selectedContactId);
      setSelectedLetterId(json.letter.id);
      setLetterDraftSubject(json.letter.subject || "");
      setLetterDraftBody(json.letter.bodyText || "");

      const dl = (json as any)?.pdf?.downloadUrl;
      if (typeof dl === "string" && dl) setPdfDownloadUrl(dl);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to generate");
    } finally {
      setBusy(false);
    }
  };

  const ensurePdf = async () => {
    if (!selectedLetterId) return;
    setBusy(true);
    setError(null);
    try {
      const json = await fetchJson<PdfResponse>(
        `/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}/pdf`,
        { method: "POST", body: JSON.stringify({}) },
      );
      if (json.ok === true) setPdfDownloadUrl(json.pdf.downloadUrl);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to generate PDF");
    } finally {
      setBusy(false);
    }
  };

  const saveLetter = async () => {
    if (!selectedLetterId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson<{ ok: true; letter: LetterFull }>(`/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          subject: letterDraftSubject.trim(),
          bodyText: letterDraftBody,
        }),
      });
      await loadLetters(selectedContactId);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const sendLetter = async () => {
    if (!selectedLetterId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson<{ ok: true }>(`/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}/send`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadLetters(selectedContactId);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Credit</div>
            <h1 className="text-2xl font-bold">Dispute letters</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Draft, edit, and export dispute letters from one cleaner workspace.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="space-y-4">
          <section className="rounded-3xl border border-zinc-200 bg-white p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold">Contact</div>
                <div className="mt-1 text-xs text-zinc-500">Choose who this letter is for before drafting.</div>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Search contacts…"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => loadContacts(contactQuery)}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
              >
                Search
              </button>
            </div>

            <div className="mt-3">
              <PortalListboxDropdown
                value={selectedContactId}
                onChange={(v) => setSelectedContactId(v)}
                disabled={busy || contacts.length === 0}
                placeholder="Select a contact…"
                buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                options={
                  (contacts.length
                    ? contacts.map(
                        (c): PortalListboxOption<string> => ({
                          value: c.id,
                          label: `${c.name}${c.email ? ` - ${c.email}` : ""}`,
                        }),
                      )
                    : ([{ value: "", label: "No contacts yet", disabled: true }] as PortalListboxOption<string>[]))
                }
              />
            </div>

            {selectedContact ? (
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
                  <div className="font-semibold text-zinc-900">{selectedContact.name}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {selectedContact.email ? `Email: ${selectedContact.email}` : "No email"}
                    {selectedContact.phone ? ` • Phone: ${selectedContact.phone}` : ""}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                  {letters.length ? `${letters.length} saved letter${letters.length === 1 ? "" : "s"}` : "No saved letters yet"}
                </div>
              </div>
            ) : null}

            <div className="mt-5 border-t border-zinc-200 pt-4">
              <div className="text-sm font-semibold">Letters</div>
              {letters.length === 0 ? (
                <div className="mt-2 text-sm text-zinc-600">No letters yet.</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {letters.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setSelectedLetterId(l.id)}
                      className={classNames(
                        "w-full rounded-2xl border px-3 py-2 text-left",
                        selectedLetterId === l.id ? "border-blue-300 bg-blue-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-semibold">{l.subject}</div>
                        <div className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          {l.status}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">{new Date(l.createdAt).toLocaleString()}</div>
                      {l.lastSentTo ? <div className="mt-1 text-xs text-zinc-600">Sent to: {l.lastSentTo}</div> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <main className="rounded-3xl border border-zinc-200 bg-white p-5">
            <div>
              <div className="text-sm font-semibold">Compose</div>
              <div className="mt-1 text-xs text-zinc-600">Pick a strategy, choose a template, and draft the letter in one place.</div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="block">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Letter strategy</div>
                <PortalListboxDropdown
                  value={selectedStage}
                  onChange={(v) => setSelectedStage(String(v || "initial-review"))}
                  disabled={busy}
                  buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                  options={LETTER_STAGE_OPTIONS}
                />
                <div className="mt-1 text-xs text-zinc-500">{stageSupportCopy(selectedStage)}</div>
              </label>
              <label className="block md:col-span-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recipient name</div>
                <input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="e.g., Experian"
                />
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">Templates</div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {LETTER_LIBRARY.map((template) => {
                    const active = template.key === selectedTemplateKey;
                    return (
                      <button
                        key={template.key}
                        type="button"
                        onClick={() => setSelectedTemplateKey(template.key)}
                        className={classNames(
                          "w-full rounded-2xl border px-3 py-3 text-left transition-colors",
                          active ? "border-blue-300 bg-blue-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
                        )}
                      >
                        <div className="text-sm font-semibold text-zinc-900">{template.label}</div>
                        <div className="mt-1 text-xs leading-5 text-zinc-600">{template.summary}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{selectedTemplate.label}</div>
                    <div className="mt-1 text-xs leading-5 text-zinc-600">{selectedTemplate.summary}</div>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
                    onClick={() => setLetterDraftBody((prev) => (prev.trim() ? `${selectedTemplate.bodyStarter}\n\n${prev}` : selectedTemplate.bodyStarter))}
                    disabled={!selectedLetterId}
                    title={selectedLetterId ? "" : "Generate or select a letter first"}
                  >
                    Load starter into editor
                  </button>
                </div>
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4">
                  <pre className="scrollbar-none overflow-auto whitespace-pre-wrap text-sm leading-6 text-zinc-700">{selectedTemplatePreview}</pre>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recipient address</div>
                <input
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                  placeholder="Mailing address (optional)"
                />
              </label>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                Use the editor below to tighten wording before saving or sending.
              </div>
            </div>

            <label className="mt-3 block">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Items to include</div>
              <textarea
                value={disputesText}
                onChange={(e) => setDisputesText(e.target.value)}
                className="min-h-35 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                placeholder="Example:\n- Account XXXX reported 60 days late in Jan 2025, but payment was on time\n- Inquiry from ABC Bank on 02/10/2025 is not mine"
              />
              <div className="mt-1 text-xs text-zinc-500">Paste the tradelines, inquiries, dates, balances, or notes you want included in this letter.</div>
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !selectedContactId || disputesText.trim().length < 3}
                onClick={generateLetter}
                className="rounded-xl bg-(--color-brand-blue) px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy ? "Working…" : "Generate letter"}
              </button>
            </div>

            <div className="mt-6 border-t border-zinc-200 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">Editor</div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={busy || !selectedLetterId}
                    onClick={ensurePdf}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
                    title={selectedLetterId ? "" : "Select a letter first"}
                  >
                    {pdfDownloadUrl ? "Regenerate PDF" : "Generate PDF"}
                  </button>
                  {pdfDownloadUrl ? (
                    <a
                      href={pdfDownloadUrl}
                      className="rounded-xl bg-(--color-brand-blue) px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download PDF
                    </a>
                  ) : null}
                  <button
                    type="button"
                    disabled={busy || !selectedLetterId}
                    onClick={saveLetter}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={busy || !selectedLetterId || !selectedContact?.email}
                    onClick={sendLetter}
                    className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                    title={selectedContact?.email ? "" : "Contact needs an email"}
                  >
                    Send to contact
                  </button>
                </div>
              </div>

              {!selectedLetter ? (
                <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
                  Generate a letter, then select it from the left.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <label className="block">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Subject</div>
                    <input
                      value={letterDraftSubject}
                      onChange={(e) => setLetterDraftSubject(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Letter body</div>
                    <textarea
                      value={letterDraftBody}
                      onChange={(e) => setLetterDraftBody(e.target.value)}
                      className="min-h-105 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                    />
                    <div className="mt-1 text-xs text-zinc-500">
                      Status: {selectedLetter.status}
                      {selectedLetter.sentAt ? ` • Sent: ${new Date(selectedLetter.sentAt).toLocaleString()}` : ""}
                    </div>
                  </label>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
