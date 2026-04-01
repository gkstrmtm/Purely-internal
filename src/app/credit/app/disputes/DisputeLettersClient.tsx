"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

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
  education: string;
  prompt: string;
  starter: string;
  cadenceDays: number;
  nextTemplateKey: string;
};

const ROUND_OPTIONS: PortalListboxOption<string>[] = Array.from({ length: 8 }, (_, index) => ({
  value: String(index + 1),
  label: `Round ${index + 1}`,
}));

const STRATEGY_OPTIONS: PortalListboxOption<string>[] = [
  { value: "initial", label: "Initial investigation" },
  { value: "followup", label: "Follow-up demand" },
  { value: "escalated", label: "Escalated reinvestigation" },
  { value: "custom", label: "Custom strategy" },
];

const CADENCE_OPTIONS: PortalListboxOption<string>[] = [
  { value: "15", label: "15 days" },
  { value: "21", label: "21 days" },
  { value: "30", label: "30 days" },
  { value: "45", label: "45 days" },
];

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
    education: "This prompt is built to generate a real mailed dispute with a clear opening, specific factual framing, and a direct reinvestigation request instead of a short generic note.",
    prompt: "Write a substantive bureau dispute letter under the FCRA. Make it specific, professional, and natural. Ask for a meaningful reinvestigation and deletion or correction of any item that cannot be verified accurately and completely.",
    starter: "Re: Formal dispute and request for reinvestigation of inaccurate credit reporting",
    cadenceDays: 21,
    nextTemplateKey: "bureau-followup",
  },
  {
    key: "bureau-followup",
    label: "Follow-up after weak bureau response",
    summary: "Use when a previous dispute did not fix the reporting or produced a vague response.",
    education: "This pushes for a more documented reinvestigation and asks what records were actually reviewed.",
    prompt: "Write a firm follow-up bureau dispute letter after prior notice failed to resolve the issue. Reference prior correspondence naturally, but do not use internal workflow labels like round numbers.",
    starter: "Re: Follow-up dispute regarding unresolved inaccurate credit reporting",
    cadenceDays: 21,
    nextTemplateKey: "furnisher-direct",
  },
  {
    key: "late-payment",
    label: "Late-payment accuracy challenge",
    summary: "Use for incorrect delinquency marks, overstated late history, or payment timing issues.",
    education: "A strong late-payment dispute should ask for review of posting history, account notes, and furnished payment data.",
    prompt: "Write a detailed dispute letter focused on inaccurate late-payment reporting. Ask for review of payment history, posting records, and furnished status details.",
    starter: "Re: Dispute of inaccurate late-payment reporting",
    cadenceDays: 15,
    nextTemplateKey: "bureau-followup",
  },
  {
    key: "identity-theft",
    label: "Identity theft / not-mine dispute",
    summary: "Use when the account, inquiry, or personal information does not belong to the consumer.",
    education: "This should clearly state the consumer disputes ownership and expects the item to be investigated, blocked, deleted, or corrected.",
    prompt: "Write a detailed identity theft or not-mine dispute letter. Make the ownership dispute clear and ask for investigation and removal of any information that does not belong to the consumer.",
    starter: "Re: Dispute of accounts or information not belonging to me",
    cadenceDays: 15,
    nextTemplateKey: "bureau-followup",
  },
  {
    key: "furnisher-direct",
    label: "Direct dispute to furnisher or creditor",
    summary: "Use when the next move should go to the furnisher instead of another bureau-only request.",
    education: "This asks the furnisher to investigate source records and correct downstream furnishing if the account data is wrong.",
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
  if (!value) return "—";
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
  const recipientDatalistId = useId();
  const contactDatalistId = useId();

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
  const [strategy, setStrategy] = useState("initial");
  const [round, setRound] = useState("1");
  const [templateKey, setTemplateKey] = useState(TEMPLATES[0].key);
  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientAddressManual, setRecipientAddressManual] = useState(false);
  const [cadenceDays, setCadenceDays] = useState(String(TEMPLATES[0].cadenceDays));
  const [items, setItems] = useState([""]);

  const template = useMemo(() => TEMPLATES.find((entry) => entry.key === templateKey) || TEMPLATES[0], [templateKey]);
  const roundNumber = useMemo(() => Math.max(1, Number.parseInt(round, 10) || 1), [round]);
  const cadenceNumber = useMemo(() => Math.max(1, Number.parseInt(cadenceDays, 10) || template.cadenceDays), [cadenceDays, template.cadenceDays]);
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
  const recipientSuggestionValues = useMemo(() => {
    const seen = new Set<string>();
    return recipientSuggestions
      .map((preset) => preset.label)
      .filter((label) => {
        const key = normalize(label);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [recipientSuggestions]);
  const contactSuggestionValues = useMemo(() => contacts.map((contact) => ({
    id: contact.id,
    label: `${contact.name}${contact.email ? ` - ${contact.email}` : ""}`,
  })), [contacts]);
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
    setCadenceDays(String(template.cadenceDays));
  }, [template]);

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
    const match = contactSuggestionValues.find((entry) => normalize(entry.label) === normalized) ||
      contactSuggestionValues.find((entry) => normalize(entry.label.split(" - ")[0]) === normalized) || null;
    if (match && match.id !== contactId) setContactId(match.id);
  }, [composerOpen, contactId, contactQuery, contactSuggestionValues]);

  useEffect(() => {
    if (!composerOpen) return;
    if (!selectedContact) return;
    const nextLabel = `${selectedContact.name}${selectedContact.email ? ` - ${selectedContact.email}` : ""}`;
    if (normalize(contactQuery) !== normalize(nextLabel)) setContactQuery(nextLabel);
  }, [composerOpen, contactId, contactQuery, selectedContact]);

  const openComposer = useCallback((preset?: { contactId?: string; recipientName?: string; items?: string[] }) => {
    setComposerOpen(true);
    const nextContactId = preset?.contactId ?? selectedLetter?.contactId ?? "";
    setContactId(nextContactId);
    const matchedContact = contacts.find((entry) => entry.id === nextContactId) || selectedLetter?.contact || null;
    setContactQuery(matchedContact ? `${matchedContact.name}${matchedContact.email ? ` - ${matchedContact.email}` : ""}` : "");
    setStrategy("initial");
    setRound("1");
    setTemplateKey(TEMPLATES[0].key);
    setRecipientName(preset?.recipientName || "");
    setRecipientAddress("");
    setRecipientAddressManual(false);
    setCadenceDays(String(TEMPLATES[0].cadenceDays));
    setItems(preset?.items?.length ? preset.items : [""]);
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
          letterStageLabel: `${STRATEGY_OPTIONS.find((entry) => entry.value === strategy)?.label || "Initial investigation"} • Round ${roundNumber}`,
          templateLabel: template.label,
          templatePrompt: toPrompt(template, roundNumber, cadenceNumber, nextTemplate.label, recipientName.trim()),
          templateBodyStarter: template.starter,
          subjectLine: `${selectedContact?.name || "Contact"} - ${recipientName.trim()} - Round ${roundNumber} - ${template.label}`,
          roundNumber,
          followUpDays: cadenceNumber,
          nextRoundNumber: Math.min(12, roundNumber + 1),
          recommendedNextTemplateLabel: nextTemplate.label,
          recipientPresetLabel: recipientPreset?.label,
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
  }, [cadenceNumber, cleanItems, contactId, contacts, loadLetters, nextTemplate.label, recipientAddress, recipientName, recipientPreset?.label, roundNumber, routeSet, strategy, template]);

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

  const composer = composerOpen ? (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onMouseDown={() => working !== "generate" && setComposerOpen(false)}>
      <div className="my-auto w-full max-w-4xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-zinc-900">New dispute letter</div>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contact</div>
            <input value={contactQuery} onChange={(event) => { setContactQuery(event.target.value); if (!event.target.value.trim()) setContactId(""); }} list={contactDatalistId} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-300" placeholder={contactsLoading ? "Searching contacts…" : "Search or select a contact"} />
            <datalist id={contactDatalistId}>{contactSuggestionValues.map((contact) => <option key={contact.id} value={contact.label} />)}</datalist>
          </label>
          <label className="block">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Round</div>
            <PortalListboxDropdown value={round} onChange={setRound} options={ROUND_OPTIONS} buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50" />
          </label>
          <label className="block">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Strategy</div>
            <PortalListboxDropdown value={strategy} onChange={setStrategy} options={STRATEGY_OPTIONS} buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50" />
          </label>
          <label className="block">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Template</div>
            <PortalListboxDropdown value={templateKey} onChange={setTemplateKey} options={templateOptions} buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50" />
          </label>
          <label className="block">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Follow-up timing</div>
            <PortalListboxDropdown value={cadenceDays} onChange={setCadenceDays} options={CADENCE_OPTIONS} buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50" />
          </label>
          <label className="block md:col-span-2">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recipient</div>
            <input value={recipientName} onChange={(event) => { setRecipientName(event.target.value); if (!event.target.value.trim()) { setRecipientAddress(""); setRecipientAddressManual(false); } }} list={recipientDatalistId} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-300" placeholder="Type or select a recipient" />
            <datalist id={recipientDatalistId}>{recipientSuggestionValues.map((value) => <option key={value} value={value} />)}</datalist>
          </label>
          <label className="block md:col-span-2">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recipient address</div>
            <textarea value={recipientAddress} onChange={(event) => { setRecipientAddress(event.target.value); setRecipientAddressManual(true); }} className="min-h-24 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-300" />
          </label>
        </div>
        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Dispute items</div>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex gap-2">
                <input value={item} onChange={(event) => setItems((current) => current.map((entry, entryIndex) => entryIndex === index ? event.target.value : entry))} className="flex-1 rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-300" placeholder={index === 0 ? "Account XXXX reported late but was paid on time" : "Add another dispute item"} />
                <button type="button" onClick={() => setItems((current) => { const next = current.filter((_, entryIndex) => entryIndex !== index); return next.length ? next : [""]; })} className="rounded-2xl border border-zinc-200 px-3 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">Remove</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setItems((current) => [...current, ""])} className="mt-3 rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Add dispute item</button>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => setComposerOpen(false)} className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Cancel</button>
          <button type="button" disabled={!canGenerate || working !== null} onClick={() => void generateLetter()} className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{working === "generate" ? "Generating…" : "Generate"}</button>
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
            <button type="button" onClick={handleOpenComposer} className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">New Letter</button>
            <button type="button" disabled={!selectedLetterId || working !== null} onClick={() => void refreshPdf()} className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60">{working === "pdf" ? "Working…" : pdfDownloadUrl ? "Refresh PDF" : "Generate PDF"}</button>
            {pdfDownloadUrl ? <a href={pdfDownloadUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Download PDF</a> : null}
            <button type="button" disabled={!selectedLetterId || working !== null} onClick={() => void saveLetter()} className="rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{working === "save" ? "Saving…" : "Save"}</button>
            <button type="button" disabled={!selectedLetterId || !selectedLetter?.contact.email || working !== null} onClick={() => void sendLetter()} className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{working === "send" ? "Sending…" : "Send"}</button>
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
          <p className="mt-1 text-sm text-zinc-600">Click any row to open it. New letters now use round planning, stronger templates, and recipient autofill.</p>
        </div>
        <button type="button" onClick={handleOpenComposer} className="rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white">New Letter</button>
      </div>
      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full max-w-xl rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-300" placeholder="Search letters" />
          <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600">{lettersLoading ? "Loading…" : `${filteredLetters.length} shown`}</div>
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
