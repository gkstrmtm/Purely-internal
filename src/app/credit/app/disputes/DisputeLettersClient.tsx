"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import { PortalSearchableCombobox, type PortalSearchableOption } from "@/components/PortalSearchableCombobox";

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

type CreditReportLite = {
  id: string;
  contactId: string | null;
  provider: string;
  importedAt: string;
};

type CreditReportItem = {
  id: string;
  bureau: string | null;
  kind: string | null;
  label: string;
};

type CreditReportFull = {
  id: string;
  provider: string;
  importedAt: string;
  items: CreditReportItem[];
};

type RecipientPreset = {
  key: string;
  label: string;
  aliases: string[];
  address: string;
};

type TemplateConfig = {
  key: string;
  label: string;
  summary: string;
  prompt: string;
  starter: string;
  cadenceDays: number;
  nextTemplateKey: string;
};

const ROUND_OPTIONS: PortalListboxOption<string>[] = Array.from({ length: 8 }, (_, index) => ({
  value: String(index + 1),
  label: `Round ${index + 1}`,
}));

const RECIPIENT_PRESETS: RecipientPreset[] = [
  { key: "experian", label: "Experian", aliases: ["experian"], address: "Experian\nP.O. Box 4500\nAllen, TX 75013" },
  { key: "equifax", label: "Equifax", aliases: ["equifax"], address: "Equifax Information Services LLC\nP.O. Box 740256\nAtlanta, GA 30374-0256" },
  { key: "transunion", label: "TransUnion", aliases: ["transunion", "trans union"], address: "TransUnion Consumer Solutions\nP.O. Box 2000\nChester, PA 19016-2000" },
  { key: "furnisher", label: "Original Creditor / Furnisher", aliases: ["furnisher", "creditor"], address: "{{furnisher_name}}\n{{furnisher_address}}" },
  { key: "collector", label: "Collection Agency", aliases: ["collector", "collection agency"], address: "{{collection_agency_name}}\n{{collection_agency_address}}" },
];

const TEMPLATES: TemplateConfig[] = [
  {
    key: "bureau-general",
    label: "General bureau investigation demand",
    summary: "Use for inaccurate balances, dates, statuses, ownership details, or incomplete reporting.",
    prompt: "Write a substantive bureau dispute letter under the FCRA. Make it specific, professional, and natural. Ask for a meaningful reinvestigation and deletion or correction of any item that cannot be verified accurately and completely.",
    starter: "Re: Formal dispute and request for reinvestigation of inaccurate credit reporting",
    cadenceDays: 21,
    nextTemplateKey: "bureau-followup",
  },
  {
    key: "bureau-followup",
    label: "Follow-up after weak bureau response",
    summary: "Use when a previous dispute did not fix the reporting or produced a vague response.",
    prompt: "Write a firm follow-up bureau dispute letter after prior notice failed to resolve the issue. Reference prior correspondence naturally, but do not use internal workflow labels like round numbers.",
    starter: "Re: Follow-up dispute regarding unresolved inaccurate credit reporting",
    cadenceDays: 21,
    nextTemplateKey: "furnisher-direct",
  },
  {
    key: "late-payment",
    label: "Late-payment accuracy challenge",
    summary: "Use for incorrect delinquency marks, overstated late history, or payment timing issues.",
    prompt: "Write a detailed dispute letter focused on inaccurate late-payment reporting. Ask for review of payment history, posting records, and furnished status details.",
    starter: "Re: Dispute of inaccurate late-payment reporting",
    cadenceDays: 15,
    nextTemplateKey: "bureau-followup",
  },
  {
    key: "identity-theft",
    label: "Identity theft / not-mine dispute",
    summary: "Use when the account, inquiry, or personal information does not belong to the consumer.",
    prompt: "Write a detailed identity theft or not-mine dispute letter. Make the ownership dispute clear and ask for investigation and removal of any information that does not belong to the consumer.",
    starter: "Re: Dispute of accounts or information not belonging to me",
    cadenceDays: 15,
    nextTemplateKey: "bureau-followup",
  },
  {
    key: "furnisher-direct",
    label: "Direct dispute to furnisher or creditor",
    summary: "Use when the next move should go to the furnisher instead of another bureau-only request.",
    prompt: "Write a direct dispute letter to a creditor or furnisher asking for review of source account records, balances, dates, account ownership, and payment history.",
    starter: "Re: Direct dispute of inaccurate furnished account information",
    cadenceDays: 30,
    nextTemplateKey: "bureau-followup",
  },
];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function statusLabel(status: LetterLite["status"]) {
  if (status === "GENERATED") return "Generated";
  if (status === "SENT") return "Sent";
  return "Draft";
}

function statusClasses(status: LetterLite["status"]) {
  if (status === "GENERATED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "SENT") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-700";
}

function routesFor(pathname: string | null) {
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

function findRecipientPreset(recipientName: string) {
  const q = normalize(recipientName);
  if (!q) return null;
  return RECIPIENT_PRESETS.find((preset) => normalize(preset.label) === q || preset.aliases.some((alias) => normalize(alias) === q)) || null;
}

function toPrompt(template: TemplateConfig, round: number, cadenceDays: number, nextTemplateLabel: string, recipientName: string) {
  const roundLine = round <= 1
    ? "This is the first dispute attempt for these issues."
    : `Treat this as follow-up correspondence after prior notice. This is the ${round}th internal round, but do not mention round numbers in the final letter.`;
  return [
    template.prompt,
    roundLine,
    `Recipient context: ${recipientName || "custom recipient"}.`,
    `If the problem is not corrected, the next follow-up target is about ${cadenceDays} days away.`,
    `If unresolved, the likely next template is ${nextTemplateLabel}.`,
    "Make the output longer and more specific than a stock template.",
  ].join("\n\n");
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !json) {
    throw new Error((json as { error?: string } | null)?.error || `Request failed (${response.status})`);
  }
  return json;
}

export default function DisputeLettersClient({ mode = "list", initialLetterId = "" }: { mode?: "list" | "editor"; initialLetterId?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeSet = useMemo(() => routesFor(pathname), [pathname]);

  const [error, setError] = useState<string | null>(null);
  const [letters, setLetters] = useState<LetterLite[]>([]);
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [lettersLoading, setLettersLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [letterLoading, setLetterLoading] = useState(false);
  const [working, setWorking] = useState<"generate" | "save" | "send" | "pdf" | null>(null);
  const [selectedLetterId, setSelectedLetterId] = useState(initialLetterId);
  const [selectedLetter, setSelectedLetter] = useState<LetterFull | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState("");
  const [search, setSearch] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [round, setRound] = useState("1");
  const [templateKey, setTemplateKey] = useState(TEMPLATES[0].key);
  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientAddressManual, setRecipientAddressManual] = useState(false);
  const [items, setItems] = useState([""]);
  const [composerReportItems, setComposerReportItems] = useState<CreditReportItem[]>([]);
  const [composerReportLabel, setComposerReportLabel] = useState("");
  const [composerItemsLoading, setComposerItemsLoading] = useState(false);
  const [reportItemQuery, setReportItemQuery] = useState("");

  const template = useMemo(() => TEMPLATES.find((entry) => entry.key === templateKey) || TEMPLATES[0], [templateKey]);
  const roundNumber = useMemo(() => Math.max(1, Number.parseInt(round, 10) || 1), [round]);
  const recipientPreset = useMemo(() => findRecipientPreset(recipientName), [recipientName]);
  const nextTemplate = useMemo(() => TEMPLATES.find((entry) => entry.key === template.nextTemplateKey) || template, [template]);
  const filteredLetters = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return letters;
    return letters.filter((letter) => [letter.subject, letter.contact.name, letter.contact.email, letter.status].map((value) => String(value || "").toLowerCase()).join(" ").includes(q));
  }, [letters, search]);
  const cleanItems = useMemo(() => items.map((item) => item.trim()).filter(Boolean), [items]);
  const selectedContact = useMemo(() => contacts.find((entry) => entry.id === contactId) || selectedLetter?.contact || null, [contactId, contacts, selectedLetter?.contact]);
  const recipientSuggestions = useMemo(() => {
    const q = normalize(recipientName);
    if (!q) return RECIPIENT_PRESETS;
    return RECIPIENT_PRESETS.filter((preset) => [preset.label, ...preset.aliases].map(normalize).join(" ").includes(q));
  }, [recipientName]);
  const recipientOptions = useMemo<PortalSearchableOption[]>(() => {
    const seen = new Set<string>();
    return recipientSuggestions
      .map((preset) => ({ value: preset.key, label: preset.label, hint: preset.aliases.join(" • "), keywords: [preset.label, ...preset.aliases] }))
      .filter((option) => {
        const key = normalize(option.label);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [recipientSuggestions]);
  const contactOptions = useMemo<PortalSearchableOption[]>(() => contacts.map((contact) => ({
    value: contact.id,
    label: contact.name,
    hint: [contact.email, contact.phone].filter(Boolean).join(" • "),
    keywords: [contact.name, contact.email || "", contact.phone || ""],
  })), [contacts]);
  const reportItemOptions = useMemo<PortalSearchableOption[]>(() => composerReportItems.map((item) => ({
    value: item.id,
    label: item.label,
    hint: [item.bureau, item.kind].filter(Boolean).join(" • "),
    keywords: [item.label, item.bureau || "", item.kind || ""],
  })), [composerReportItems]);
  const templateOptions = useMemo(() => TEMPLATES.map((entry) => ({ value: entry.key, label: entry.label })), []);
  const canGenerate = Boolean(contactId && recipientName.trim() && cleanItems.length);

  const loadContacts = useCallback(async (query = "") => {
    setContactsLoading(true);
    try {
      const data = await fetchJson<{ ok: true; contacts: ContactLite[] }>(`/api/portal/credit/contacts${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`, { cache: "no-store" });
      setContacts(data.contacts || []);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const loadLetters = useCallback(async () => {
    setLettersLoading(true);
    try {
      const data = await fetchJson<{ ok: true; letters: LetterLite[] }>("/api/portal/credit/disputes", { cache: "no-store" });
      setLetters(data.letters || []);
    } finally {
      setLettersLoading(false);
    }
  }, []);

  const loadLetter = useCallback(async (letterId: string) => {
    if (!letterId) return;
    setLetterLoading(true);
    try {
      const data = await fetchJson<{ ok: true; letter: LetterFull }>(`/api/portal/credit/disputes/${encodeURIComponent(letterId)}`, { cache: "no-store" });
      setSelectedLetter(data.letter);
      setSubject(data.letter.subject || "");
      setBodyText(data.letter.bodyText || "");
      if (data.letter.pdfMediaItem?.id && data.letter.pdfMediaItem?.publicToken) {
        setPdfDownloadUrl(`/api/public/media/item/${data.letter.pdfMediaItem.id}/${data.letter.pdfMediaItem.publicToken}?download=1`);
      } else {
        setPdfDownloadUrl("");
      }
    } finally {
      setLetterLoading(false);
    }
  }, []);

  const loadComposerReportItems = useCallback(async (nextContactId: string) => {
    if (!nextContactId) {
      setComposerReportItems([]);
      setComposerReportLabel("");
      return;
    }
    setComposerItemsLoading(true);
    try {
      const reportList = await fetchJson<{ ok: true; reports: CreditReportLite[] }>("/api/portal/credit/reports", { cache: "no-store" });
      const latestReport = (reportList.reports || []).find((report) => report.contactId === nextContactId) || null;
      if (!latestReport) {
        setComposerReportItems([]);
        setComposerReportLabel("");
        return;
      }
      const reportDetail = await fetchJson<{ ok: true; report: CreditReportFull }>(`/api/portal/credit/reports/${encodeURIComponent(latestReport.id)}`, { cache: "no-store" });
      setComposerReportItems(reportDetail.report.items || []);
      setComposerReportLabel(`${reportDetail.report.provider} • ${formatDateTime(reportDetail.report.importedAt)}`);
    } catch {
      setComposerReportItems([]);
      setComposerReportLabel("");
    } finally {
      setComposerItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadContacts(), loadLetters()]).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Failed to load dispute letters");
    });
  }, [loadContacts, loadLetters]);

  useEffect(() => {
    if (!selectedLetterId) return;
    void loadLetter(selectedLetterId).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Failed to load letter");
    });
  }, [loadLetter, selectedLetterId]);

  useEffect(() => {
    if (!recipientPreset || recipientAddressManual) return;
    setRecipientAddress(recipientPreset.address);
  }, [recipientAddressManual, recipientPreset]);

  useEffect(() => {
    if (!composerOpen) return;
    const handle = window.setTimeout(() => {
      void loadContacts(contactQuery).catch(() => undefined);
    }, contactQuery.trim() ? 180 : 0);
    return () => window.clearTimeout(handle);
  }, [composerOpen, contactQuery, loadContacts]);

  useEffect(() => {
    if (!composerOpen || !contactQuery.trim()) return;
    const normalized = normalize(contactQuery);
    const match = contactOptions.find((entry) => normalize(entry.label) === normalized) ||
      contactOptions.find((entry) => normalize(entry.label).startsWith(normalized)) || null;
    if (match && match.value !== contactId) setContactId(match.value);
  }, [composerOpen, contactId, contactOptions, contactQuery]);

  useEffect(() => {
    if (!composerOpen) return;
    if (!selectedContact) return;
    const nextLabel = selectedContact.name;
    if (normalize(contactQuery) !== normalize(nextLabel)) setContactQuery(nextLabel);
  }, [composerOpen, contactId, contactQuery, selectedContact]);

  useEffect(() => {
    if (!composerOpen) return;
    void loadComposerReportItems(contactId);
  }, [composerOpen, contactId, loadComposerReportItems]);

  const openComposer = useCallback((preset?: { contactId?: string; recipientName?: string; items?: string[] }) => {
    setComposerOpen(true);
    const nextContactId = preset?.contactId ?? selectedLetter?.contactId ?? "";
    setContactId(nextContactId);
    const matchedContact = contacts.find((entry) => entry.id === nextContactId) || selectedLetter?.contact || null;
    setContactQuery(matchedContact ? `${matchedContact.name}${matchedContact.email ? ` - ${matchedContact.email}` : ""}` : "");
    setRound("1");
    setTemplateKey(TEMPLATES[0].key);
    setRecipientName(preset?.recipientName || "");
    setRecipientAddress("");
    setRecipientAddressManual(false);
    setItems(preset?.items?.length ? preset.items : [""]);
    setReportItemQuery("");
  }, [contacts, selectedLetter?.contact, selectedLetter?.contactId]);

  useEffect(() => {
    if (mode !== "list") return;
    if (searchParams.get("compose") !== "1") return;
    const issue = (searchParams.get("issue") || "").trim();
    const bureau = (searchParams.get("bureau") || "").trim();
    const targetContactId = (searchParams.get("contactId") || "").trim();
    openComposer({
      contactId: targetContactId || undefined,
      recipientName: bureau || undefined,
      items: issue ? [issue] : undefined,
    });
  }, [mode, openComposer, searchParams]);

  const handleOpenComposer = useCallback(() => {
    openComposer();
  }, [openComposer]);

  const addComposerReportItem = useCallback((option: PortalSearchableOption) => {
    const nextLabel = option.label.trim();
    if (!nextLabel) return;
    setItems((current) => {
      const alreadyIncluded = current.some((entry) => normalize(entry) === normalize(nextLabel));
      if (alreadyIncluded) return current;
      const normalizedItems = current.map((entry) => entry.trim()).filter(Boolean);
      return [...normalizedItems, nextLabel];
    });
    setReportItemQuery("");
  }, []);

  const generateLetter = useCallback(async () => {
    setWorking("generate");
    setError(null);
    try {
      const selectedContact = contacts.find((entry) => entry.id === contactId);
      const data = await fetchJson<{ ok: true; letter: LetterFull; pdf?: { downloadUrl?: string | null } }>("/api/portal/credit/disputes", {
        method: "POST",
        body: JSON.stringify({
          contactId,
          recipientName: recipientName.trim(),
          recipientAddress: recipientAddress.trim(),
          disputesText: cleanItems.map((item) => `- ${item}`).join("\n"),
          templateLabel: template.label,
          templatePrompt: toPrompt(template, roundNumber, template.cadenceDays, nextTemplate.label, recipientName.trim()),
          templateBodyStarter: template.starter,
          subjectLine: `${selectedContact?.name || "Contact"} - ${recipientName.trim()} - ${template.label}`,
          roundNumber,
        }),
      });
      await loadLetters();
      setComposerOpen(false);
      setSelectedLetterId(data.letter.id);
      window.location.href = routeSet.editorHref(data.letter.id);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Failed to generate letter");
    } finally {
      setWorking(null);
    }
  }, [cleanItems, contactId, contacts, loadLetters, nextTemplate.label, recipientAddress, recipientName, roundNumber, routeSet, template]);

  const saveLetter = useCallback(async () => {
    if (!selectedLetterId) return;
    setWorking("save");
    try {
      await fetchJson(`/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}`, {
        method: "PATCH",
        body: JSON.stringify({ subject: subject.trim(), bodyText }),
      });
      await loadLetter(selectedLetterId);
      await loadLetters();
    } finally {
      setWorking(null);
    }
  }, [bodyText, loadLetter, loadLetters, selectedLetterId, subject]);

  const sendLetter = useCallback(async () => {
    if (!selectedLetterId) return;
    setWorking("send");
    try {
      await fetchJson(`/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}/send`, { method: "POST", body: JSON.stringify({}) });
      await loadLetter(selectedLetterId);
      await loadLetters();
    } finally {
      setWorking(null);
    }
  }, [loadLetter, loadLetters, selectedLetterId]);

  const refreshPdf = useCallback(async () => {
    if (!selectedLetterId) return;
    setWorking("pdf");
    try {
      const data = await fetchJson<{ ok: true; pdf: { downloadUrl: string } }>(`/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}/pdf`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setPdfDownloadUrl(data.pdf.downloadUrl);
      await loadLetter(selectedLetterId);
      await loadLetters();
    } finally {
      setWorking(null);
    }
  }, [loadLetter, loadLetters, selectedLetterId]);

  useEffect(() => {
    if (mode !== "editor") return;
    if (!selectedLetterId || !selectedLetter || letterLoading || working || pdfDownloadUrl) return;
    void refreshPdf().catch(() => undefined);
  }, [letterLoading, mode, pdfDownloadUrl, refreshPdf, selectedLetter, selectedLetterId, working]);

  const composer = composerOpen ? (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onMouseDown={() => working !== "generate" && setComposerOpen(false)}>
      <div className="my-auto w-full max-w-4xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-4xl border border-zinc-200 bg-white p-6 shadow-xl sm:p-7" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="New dispute letter" data-overlay-root="true">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-zinc-900">New dispute letter</div>
            <div className="mt-1 text-sm text-zinc-600">Pick the contact, choose the recipient, load the report items, and generate the draft.</div>
          </div>
          <button type="button" onClick={() => setComposerOpen(false)} aria-label="Close dispute letter composer" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 text-lg font-semibold text-zinc-700 hover:bg-zinc-50">×</button>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5">1 Contact</span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5">2 Letter</span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5">3 Issues</span>
        </div>
        <div className="mt-5 space-y-4">
          <section className="rounded-3xl border border-zinc-200 bg-zinc-50/70 p-5">
            <div className="text-sm font-semibold text-zinc-900">Contact and recipient</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contact</div>
                <PortalSearchableCombobox
                  query={contactQuery}
                  onQueryChange={(value) => {
                    setContactQuery(value);
                    if (!value.trim()) setContactId("");
                  }}
                  options={contactOptions}
                  selectedValue={contactId}
                  onSelect={(option) => {
                    setContactId(option.value);
                    setContactQuery(option.label);
                  }}
                  placeholder={contactsLoading ? "Searching contacts..." : "Search or select a contact"}
                  emptyLabel={contactsLoading ? "Searching contacts..." : "No contacts found"}
                  inputClassName="pa-portal-listbox-button w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                />
              </label>
              <label className="block md:col-span-2">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recipient</div>
                <PortalSearchableCombobox
                  query={recipientName}
                  onQueryChange={(value) => {
                    setRecipientName(value);
                    if (!value.trim()) {
                      setRecipientAddress("");
                      setRecipientAddressManual(false);
                    }
                  }}
                  options={recipientOptions}
                  selectedValue={recipientPreset?.key}
                  onSelect={(option) => {
                    setRecipientName(option.label);
                    setRecipientAddressManual(false);
                  }}
                  placeholder="Type or select a recipient"
                  emptyLabel="Keep typing to use a custom recipient"
                  inputClassName="pa-portal-listbox-button w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                />
              </label>
              <label className="block md:col-span-2">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recipient address</div>
                <textarea value={recipientAddress} onChange={(event) => { setRecipientAddress(event.target.value); setRecipientAddressManual(true); }} className="min-h-24 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:border-zinc-300" />
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-5">
            <div className="text-sm font-semibold text-zinc-900">Letter details</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Template</div>
                <PortalListboxDropdown value={templateKey} onChange={setTemplateKey} options={templateOptions} buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50" />
              </label>
              <label className="block">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Round</div>
                <PortalListboxDropdown value={round} onChange={setRound} options={ROUND_OPTIONS} buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50" />
              </label>
            </div>
            <div className="mt-4 rounded-2xl border border-brand-blue/20 bg-brand-blue/5 px-4 py-3 text-sm text-zinc-700">
              <div className="font-semibold text-zinc-900">{template.label}</div>
              <div className="mt-1">{template.summary}</div>
              <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recommended follow-up: {nextTemplate.label} in about {template.cadenceDays} days</div>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Issues</div>
                <div className="mt-1 text-sm text-zinc-600">Add the exact items you want in the letter.</div>
              </div>
              <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-600">{cleanItems.length} issue{cleanItems.length === 1 ? "" : "s"}</div>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add from latest credit report</div>
                <div className="text-[11px] text-zinc-500">{composerReportLabel || (contactId ? "No report found yet" : "Select a contact first")}</div>
              </div>
              <PortalSearchableCombobox
                query={reportItemQuery}
                onQueryChange={setReportItemQuery}
                options={reportItemOptions}
                onSelect={addComposerReportItem}
                placeholder={composerItemsLoading ? "Loading report items..." : "Search report items to add"}
                emptyLabel={composerItemsLoading ? "Loading report items..." : "No report items available"}
                inputClassName="pa-portal-listbox-button w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                disabled={!contactId || composerItemsLoading}
              />
            </div>

            <div className="mt-4 space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <input value={item} onChange={(event) => setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry))} className="flex-1 rounded-2xl border border-zinc-200 bg-zinc-50/40 px-4 py-3 text-sm outline-none focus:border-zinc-300" placeholder={index === 0 ? "Account XXXX reported late but was paid on time" : "Add another issue"} />
                  <button type="button" onClick={() => setItems((current) => { const next = current.filter((_, entryIndex) => entryIndex !== index); return next.length ? next : [""]; })} className="rounded-2xl border border-zinc-200 px-3 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">Remove</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setItems((current) => [...current, ""])} className="mt-3 rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Add issue</button>
          </section>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => setComposerOpen(false)} className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Cancel</button>
          <button type="button" disabled={!canGenerate || working !== null} onClick={() => void generateLetter()} className="rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{working === "generate" ? "Generating..." : "Generate"}</button>
        </div>
      </div>
    </div>
  ) : null;

  if (mode === "editor") {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <button type="button" onClick={() => { window.location.href = routeSet.listHref; }} className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Back</button>
            <h1 className="mt-3 text-2xl font-bold text-zinc-900">{selectedLetter?.subject || "Dispute letter"}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              {selectedLetter ? <span className={classNames("rounded-full border px-2.5 py-1 text-xs font-semibold", statusClasses(selectedLetter.status))}>{statusLabel(selectedLetter.status)}</span> : null}
              <span>{selectedLetter ? `Updated ${formatDateTime(selectedLetter.updatedAt)}` : letterLoading ? "Loading letter…" : "No letter selected"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pdfDownloadUrl ? <a href={pdfDownloadUrl} target="_blank" rel="noreferrer" aria-label="Download PDF" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-lg font-semibold text-zinc-700 hover:bg-zinc-50">↓</a> : null}
            <button type="button" disabled={!selectedLetterId || working !== null} onClick={() => void saveLetter()} className="rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{working === "save" ? "Saving..." : "Save"}</button>
            <button type="button" disabled={!selectedLetterId || !selectedLetter?.contact.email || working !== null} onClick={() => void sendLetter()} className="rounded-2xl bg-linear-to-r from-(--color-brand-blue) to-(--color-brand-pink) px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60">{working === "send" ? "Sending..." : "Send"}</button>
          </div>
        </div>
        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_320px]">
          <section className="rounded-3xl border border-zinc-200 bg-white p-6">
            <label className="block">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Subject</div>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-300" />
            </label>
            <label className="mt-4 block">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Letter</div>
              <textarea value={bodyText} onChange={(event) => setBodyText(event.target.value)} className="min-h-175 w-full rounded-3xl border border-zinc-200 px-4 py-4 font-mono text-sm text-zinc-800 outline-none focus:border-zinc-300" />
            </label>
          </section>
          <aside className="space-y-4">
            <section className="rounded-3xl border border-zinc-200 bg-white p-5">
              <div className="text-sm font-semibold text-zinc-900">Contact</div>
              {selectedLetter?.contact ? (
                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-900">{selectedLetter.contact.name}</div>
                  <div className="mt-1 text-xs text-zinc-600">{selectedLetter.contact.email || "No email"}{selectedLetter.contact.phone ? ` • ${selectedLetter.contact.phone}` : ""}</div>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">No contact linked.</div>
              )}
            </section>
          </aside>
        </div>
        {composer}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dispute letters</h1>
        </div>
        <button type="button" onClick={handleOpenComposer} className="rounded-2xl bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white">+ New</button>
      </div>
      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full max-w-xl rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-300" placeholder="Search letters" />
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{lettersLoading ? "Loading..." : `${filteredLetters.length} letters`}</div>
        </div>
        <div className="mt-5 overflow-x-auto rounded-3xl border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Letter</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredLetters.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-zinc-600">{lettersLoading ? "Loading letters…" : "No letters yet."}</td>
                </tr>
              ) : (
                filteredLetters.map((letter) => (
                  <tr key={letter.id} tabIndex={0} role="button" onClick={() => { window.location.href = routeSet.editorHref(letter.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); window.location.href = routeSet.editorHref(letter.id); } }} className="cursor-pointer border-t border-zinc-200 hover:bg-zinc-50 focus:bg-zinc-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-900">{letter.subject || "Untitled"}</div>
                      <div className="mt-1 text-xs text-zinc-500">Created {formatDateTime(letter.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{letter.contact.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{letter.contact.email || "No email"}</div>
                    </td>
                    <td className="px-4 py-3"><span className={classNames("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClasses(letter.status))}>{statusLabel(letter.status)}</span></td>
                    <td className="px-4 py-3 text-zinc-600">
                      <div>{formatDateTime(letter.updatedAt)}</div>
                      <div className="mt-1 text-xs text-zinc-400">Click to open</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {composer}
    </div>
  );
}
