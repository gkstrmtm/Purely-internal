"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { IconDownload, IconFunnel } from "@/app/portal/PortalIcons";
import { AiSparkIcon } from "@/components/AiSparkIcon";
import { AppModal } from "@/components/AppModal";
import LiquidGlassPopupSurface from "@/components/LiquidGlassPopupSurface";
import { RichTextMarkdownEditor, type RichTextMarkdownEditorHandle } from "@/components/RichTextMarkdownEditor";
import { SignatureDisplay } from "@/components/SignatureDisplay";
import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import { PortalSearchableCombobox, type PortalSearchableOption } from "@/components/PortalSearchableCombobox";
import { portalGlassBackdropClass, portalGlassButtonClass, portalGlassPanelClass, portalGlassSectionClass } from "@/components/portalGlass";
import { CONTACT_SIGNATURE_MARKDOWN, normalizeDisputeLetterText, readContactAddress, readContactCustomValue, readContactSignature, readContactSignatureImage } from "@/lib/creditDisputeLetters";
import { extractCreditInquiryDate } from "@/lib/creditReports";
import { PORTAL_VARIANT_HEADER } from "@/lib/portalVariant";

type ContactLite = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  customVariables?: Record<string, string> | null;
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
  lifecycleMeta?: {
    sourceReportId?: string | null;
    sourceReportItemId?: string | null;
    sourceItemLabel?: string | null;
    recipientName?: string | null;
    recipientAddress?: string | null;
    mailedAt?: string | null;
    expectedDeliveryDate?: string | null;
    latestOutcome?: string | null;
  } | null;
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
  detailsJson?: unknown;
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

type FixedMenuStyle = { left: number; top: number; maxHeight: number };

function formatDisputeLetterListTitle(subject: string) {
  const raw = String(subject || "").trim();
  if (!raw) return "";
  if (/^round\s+\d+\s*-/i.test(raw)) return raw;

  const match = raw.match(/^\s*(follow-?up\s+)?(.+?)\s+dispute\s+letter\s*-\s*(.+)\s*$/i);
  if (!match) return raw;

  const isFollowUp = Boolean(match[1]);
  const recipient = String(match[2] || "").trim();
  const contactName = String(match[3] || "").trim();
  const round = isFollowUp ? 2 : 1;

  const safeRecipient = recipient || "Recipient";
  const safeContact = contactName && !/^contact$/i.test(contactName) ? contactName : "No contact name yet";
  return `Round ${round} - ${safeContact} - ${safeRecipient}`.trim();
}

const ROUND_OPTIONS: PortalListboxOption<string>[] = Array.from({ length: 8 }, (_, index) => ({
  value: String(index + 1),
  label: `Round ${index + 1}`,
}));

const RECIPIENT_PRESETS: RecipientPreset[] = [
  { key: "experian", label: "Experian", aliases: ["experian"], address: "Experian\nP.O. Box 4500\nAllen, TX 75013" },
  { key: "equifax", label: "Equifax", aliases: ["equifax"], address: "Equifax Information Services LLC\nP.O. Box 740256\nAtlanta, GA 30374-0256" },
  { key: "transunion", label: "TransUnion", aliases: ["transunion", "trans union"], address: "TransUnion Consumer Solutions\nP.O. Box 2000\nChester, PA 19016-2000" },
  { key: "furnisher", label: "Original Creditor / Furnisher", aliases: ["furnisher", "creditor"], address: "Creditor or Furnisher Name\nMailing Address\nCity, State ZIP" },
  { key: "collector", label: "Collection Agency", aliases: ["collector", "collection agency"], address: "Collection Agency Name\nMailing Address\nCity, State ZIP" },
];

const TEMPLATES: TemplateConfig[] = [
  {
    key: "bureau-general",
    label: "General bureau reinvestigation letter",
    summary: "Best for inaccurate balances, dates, account status, ownership, or incomplete reporting that needs a clean bureau dispute.",
    prompt: "Write a bureau dispute letter that sounds like a real consumer mailed it. Keep the tone firm, clear, and professional. Ask for a reasonable reinvestigation and for any inaccurate, incomplete, or unverified information to be corrected or deleted.",
    starter: "Re: Request for reinvestigation of inaccurate credit reporting",
    cadenceDays: 21,
    nextTemplateKey: "bureau-followup",
  },
  {
    key: "bureau-followup",
    label: "Follow-up after incomplete bureau response",
    summary: "Use when the bureau replied vaguely, failed to fix the item, or left the reporting unchanged after an earlier dispute.",
    prompt: "Write a follow-up bureau dispute letter that references prior notice naturally and asks for a real reinvestigation instead of a form response. Keep it calm, firm, and specific without sounding theatrical or threatening.",
    starter: "Re: Follow-up dispute regarding unresolved inaccurate reporting",
    cadenceDays: 21,
    nextTemplateKey: "furnisher-direct",
  },
  {
    key: "late-payment",
    label: "Late-payment reporting dispute",
    summary: "Use for wrong delinquency marks, inflated late history, payment posting problems, or status dates that do not match the account record.",
    prompt: "Write a dispute letter focused on inaccurate late-payment reporting. Ask for review of payment history, posting records, delinquency dates, and furnished status details. Make the concern sound precise and believable, not generic.",
    starter: "Re: Dispute of inaccurate late-payment reporting",
    cadenceDays: 15,
    nextTemplateKey: "bureau-followup",
  },
  {
    key: "identity-theft",
    label: "Identity theft or not-mine dispute",
    summary: "Use when an account, inquiry, address, or other reported information does not belong to the consumer.",
    prompt: "Write a detailed ownership dispute letter for identity theft or not-mine reporting. Make the ownership issue unmistakably clear and request investigation and removal of information that does not belong to the consumer.",
    starter: "Re: Dispute of accounts or information that do not belong to me",
    cadenceDays: 15,
    nextTemplateKey: "bureau-followup",
  },
  {
    key: "furnisher-direct",
    label: "Direct dispute to furnisher",
    summary: "Use when the next move should go straight to the creditor, furnisher, or collector instead of sending another bureau-only letter.",
    prompt: "Write a direct dispute letter to a creditor, furnisher, or collector asking for review of source records, balances, dates, account ownership, and payment history. Keep it specific and businesslike.",
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

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const raw = String(value || "").trim();
  if (!raw) return "";
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}$/);
  if (direct) return direct[0];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function normalizeMailDestinationLine(value: string | null | undefined) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseMailDestinationFromLetter(letter: Pick<LetterFull, "bodyText" | "lifecycleMeta" | "lastSentTo"> | null | undefined) {
  const explicitRecipientName = normalizeMailDestinationLine(letter?.lifecycleMeta?.recipientName);
  const explicitRecipientAddress = String(letter?.lifecycleMeta?.recipientAddress || "")
    .split(/\r?\n/)
    .map((line) => normalizeMailDestinationLine(line))
    .filter(Boolean);
  const explicitParts = [explicitRecipientName, ...explicitRecipientAddress].filter(Boolean);
  if (explicitParts.length) return explicitParts.join(", ");

  const lastSentTo = normalizeMailDestinationLine(letter?.lastSentTo);
  if (lastSentTo) return lastSentTo;

  const lines = String(letter?.bodyText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index, source) => {
      if (line) return true;
      const prev = source[index - 1] || "";
      const next = source[index + 1] || "";
      return Boolean(prev && next);
    });
  if (!lines.length) return "";

  const dateLineIndex = lines.findIndex((line) => /^date\s*:/i.test(line));
  const reLineIndex = lines.findIndex((line) => /^re\s*:/i.test(line));
  const startIndex = dateLineIndex >= 0 ? dateLineIndex + 1 : 0;
  const endIndex = reLineIndex > startIndex ? reLineIndex : Math.min(lines.length, startIndex + 4);
  const recipientLines = lines
    .slice(startIndex, endIndex)
    .map((line) => normalizeMailDestinationLine(line))
    .filter(Boolean)
    .filter((line) => !/^to whom it may concern/i.test(line));

  return recipientLines.join(", ");
}

function statusLabel(status: LetterLite["status"]) {
  if (status === "GENERATED") return "Generated";
  if (status === "SENT") return "Mailed";
  return "Draft";
}

function statusClasses(status: LetterLite["status"]) {
  if (status === "GENERATED") return "pa-credit-status-pill pa-credit-status-pill--generated bg-emerald-100/80 text-emerald-800 supports-backdrop-filter:bg-emerald-100/60";
  if (status === "SENT") return "pa-credit-status-pill pa-credit-status-pill--sent bg-sky-100/80 text-sky-800 supports-backdrop-filter:bg-sky-100/60";
  return "pa-credit-status-pill pa-credit-status-pill--draft bg-zinc-100/85 text-zinc-700 supports-backdrop-filter:bg-white/55";
}

function computeFixedMenuStyle(rect: DOMRect, width = 288, estHeight = 320): FixedMenuStyle {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gutter = 12;
  const left = Math.min(Math.max(gutter, rect.right - width), viewportWidth - width - gutter);
  const spaceBelow = viewportHeight - rect.bottom - gutter;
  const spaceAbove = rect.top - gutter;
  const openUp = spaceBelow < Math.min(estHeight, 220) && spaceAbove > spaceBelow;
  const top = openUp
    ? Math.max(gutter, rect.top - Math.min(estHeight, spaceAbove))
    : Math.min(viewportHeight - gutter - Math.min(estHeight, Math.max(spaceBelow, 220)), rect.bottom + 8);
  return { left, top, maxHeight: Math.max(180, openUp ? spaceAbove : spaceBelow) };
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
    `If unresolved, the likely next step is ${nextTemplateLabel}.`,
    "Use natural business-style wording, not legalese overload.",
    "Avoid generic filler like 'I hope this letter finds you well' or empty threats.",
    "Use the reported item names as written when available and explain why the consumer wants verification, correction, or deletion.",
    "Make the output sound like a real mailed letter, not a stock template.",
  ].join("\n\n");
}

function suggestTemplateKey(items: string[], round: number, recipientName: string) {
  const haystack = [...items, recipientName].map((value) => normalize(value)).join(" ");
  if (haystack.includes("identity") || haystack.includes("not mine") || haystack.includes("fraud")) return "identity-theft";
  if (haystack.includes("late") || haystack.includes("paid on time") || haystack.includes("delinquency")) return "late-payment";
  if (normalize(recipientName).includes("creditor") || normalize(recipientName).includes("furnisher") || normalize(recipientName).includes("collector")) return "furnisher-direct";
  if (round > 1) return "bureau-followup";
  return "bureau-general";
}

function formatDisputeItemText(item: Pick<CreditReportItem, "label" | "detailsJson">) {
  const inquiryDate = extractCreditInquiryDate(item.detailsJson);
  if (!inquiryDate) return item.label.trim();
  if (item.label.toLowerCase().includes("inquiry date:")) return item.label.trim();
  return `${item.label.trim()} (Inquiry date: ${inquiryDate})`;
}

const BUTTON_MOTION_CLASS = "transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-none";
const PRIMARY_BUTTON_CLASS = `${BUTTON_MOTION_CLASS} rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:opacity-60`;
const SECONDARY_BUTTON_CLASS = classNames(
  `${BUTTON_MOTION_CLASS} rounded-2xl px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-brand-blue/20 disabled:opacity-60`,
  portalGlassButtonClass,
);
const AI_GRADIENT_BUTTON_CLASS = `${BUTTON_MOTION_CLASS} inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm focus-visible:ring-2 focus-visible:ring-brand-blue/30`;
const ICON_BUTTON_CLASS = classNames(
  `${BUTTON_MOTION_CLASS} inline-flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-800 hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-brand-blue/20 disabled:opacity-60`,
  portalGlassButtonClass,
);
const GLASS_INPUT_CLASS = classNames(
  "w-full rounded-2xl px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-brand-blue/20",
  portalGlassButtonClass,
);
const GLASS_INPUT_COMBOBOX_CLASS = `pa-portal-listbox-button ${GLASS_INPUT_CLASS} pr-10`;
const GLASS_PANEL_CLASS = classNames("rounded-3xl border border-white/65", portalGlassPanelClass);
const GLASS_SECTION_CLASS = classNames("rounded-3xl border border-white/65", portalGlassSectionClass);
const CONTACT_SIGNATURE_SNIPPET = `\n\n${CONTACT_SIGNATURE_MARKDOWN}\n`;

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeSet = useMemo(() => routesFor(pathname), [pathname]);
  const portalVariant = String(pathname || "").startsWith("/credit") ? "credit" : "portal";
  const variantHeaders = useMemo(() => ({ [PORTAL_VARIANT_HEADER]: portalVariant }), [portalVariant]);

  const [error, setError] = useState<string | null>(null);
  const [letters, setLetters] = useState<LetterLite[]>([]);
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [lettersLoading, setLettersLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [letterLoading, setLetterLoading] = useState(false);
  const [working, setWorking] = useState<"generate" | "save" | "mail" | "pdf" | null>(null);
  const [selectedLetterId, setSelectedLetterId] = useState(initialLetterId);
  const [selectedLetter, setSelectedLetter] = useState<LetterFull | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [savedDraft, setSavedDraft] = useState<{ subject: string; bodyText: string } | null>(null);
  const [editingSubject, setEditingSubject] = useState(false);
  const [subjectSnapshot, setSubjectSnapshot] = useState("");
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | LetterLite["status"]>("ALL");
  const [statusFiltersMenu, setStatusFiltersMenu] = useState<FixedMenuStyle | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [round, setRound] = useState("1");
  const [followUpDays, setFollowUpDays] = useState(TEMPLATES[0].cadenceDays);
  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientAddressManual, setRecipientAddressManual] = useState(false);
  const [items, setItems] = useState([""]);
  const [composerReportItems, setComposerReportItems] = useState<CreditReportItem[]>([]);
  const [composerReportLabel, setComposerReportLabel] = useState("");
  const [composerItemsLoading, setComposerItemsLoading] = useState(false);
  const [reportItemQuery, setReportItemQuery] = useState("");
  const [sourceReportId, setSourceReportId] = useState("");
  const [sourceReportItemId, setSourceReportItemId] = useState("");
  const [mailTo, setMailTo] = useState("");
  const [mailedDate, setMailedDate] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [mailModalOpen, setMailModalOpen] = useState(false);
  const editorRef = useRef<RichTextMarkdownEditorHandle | null>(null);
  const subjectRef = useRef("");
  const bodyTextRef = useRef("");

  const roundNumber = useMemo(() => Math.max(1, Number.parseInt(round, 10) || 1), [round]);
  const cleanItems = useMemo(() => items.map((item) => item.trim()).filter(Boolean), [items]);
  const templateKey = useMemo(() => suggestTemplateKey(cleanItems, roundNumber, recipientName), [cleanItems, recipientName, roundNumber]);
  const template = useMemo(() => TEMPLATES.find((entry) => entry.key === templateKey) || TEMPLATES[0], [templateKey]);
  const recipientPreset = useMemo(() => findRecipientPreset(recipientName), [recipientName]);
  const nextTemplate = useMemo(() => TEMPLATES.find((entry) => entry.key === template.nextTemplateKey) || template, [template]);
  const letterCounts = useMemo(() => ({
    draft: letters.filter((letter) => letter.status === "DRAFT").length,
    generated: letters.filter((letter) => letter.status === "GENERATED").length,
    sent: letters.filter((letter) => letter.status === "SENT").length,
  }), [letters]);
  const filteredLetters = useMemo(() => {
    const q = search.trim().toLowerCase();
    return letters.filter((letter) => {
      if (statusFilter !== "ALL" && letter.status !== statusFilter) return false;
      if (!q) return true;
      return [letter.subject, letter.contact.name, letter.contact.email, letter.status].map((value) => String(value || "").toLowerCase()).join(" ").includes(q);
    });
  }, [letters, search, statusFilter]);
  const selectedContact = useMemo(() => contacts.find((entry) => entry.id === contactId) || selectedLetter?.contact || null, [contactId, contacts, selectedLetter?.contact]);
  const selectedContactSignature = useMemo(() => readContactCustomValue(selectedContact?.customVariables, "signature"), [selectedContact?.customVariables]);
  const selectedContactSignatureImage = useMemo(() => readContactSignatureImage(selectedLetter?.contact?.customVariables), [selectedLetter?.contact?.customVariables]);
  const selectedContactSignatureText = useMemo(() => readContactSignature(selectedLetter?.contact?.customVariables), [selectedLetter?.contact?.customVariables]);
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
  const canGenerate = Boolean(contactId && recipientName.trim() && cleanItems.length);
  const hasInlineSignature = useMemo(() => bodyText.includes(CONTACT_SIGNATURE_MARKDOWN), [bodyText]);
  const hasDraftChanges = useMemo(() => {
    if (!savedDraft) return false;
    return subject.trim() !== savedDraft.subject.trim() || bodyText !== savedDraft.bodyText;
  }, [bodyText, savedDraft, subject]);

  const setSubjectValue = useCallback((value: string) => {
    subjectRef.current = value;
    setSubject(value);
  }, []);

  const setBodyTextValue = useCallback((value: string) => {
    bodyTextRef.current = value;
    setBodyText(value);
  }, []);

  const applyLoadedLetter = useCallback((letter: LetterFull) => {
    const normalizedBody = normalizeDisputeLetterText(letter.bodyText || "", {
      contactName: letter.contact?.name || "",
      signature: readContactSignature(letter.contact?.customVariables) || letter.contact?.name || "",
      email: letter.contact?.email || "",
      phone: letter.contact?.phone || "",
      address: readContactAddress(letter.contact?.customVariables),
    });

    setSelectedLetter(letter);
    setSubjectValue(letter.subject || "");
    setBodyTextValue(normalizedBody);
    setSavedDraft({ subject: letter.subject || "", bodyText: normalizedBody });
    setSourceReportId(letter.lifecycleMeta?.sourceReportId || "");
    setSourceReportItemId(letter.lifecycleMeta?.sourceReportItemId || "");
    setMailTo(parseMailDestinationFromLetter(letter));
    setMailedDate(toDateInputValue(letter.sentAt || letter.lifecycleMeta?.mailedAt) || new Date().toISOString().slice(0, 10));
    setExpectedDeliveryDate(toDateInputValue(letter.lifecycleMeta?.expectedDeliveryDate) || "");
    if (letter.pdfMediaItem?.id && letter.pdfMediaItem?.publicToken) {
      setPdfDownloadUrl(`/api/public/media/item/${letter.pdfMediaItem.id}/${letter.pdfMediaItem.publicToken}?download=1`);
    } else {
      setPdfDownloadUrl("");
    }
    setEditingSubject(false);
  }, [setBodyTextValue, setSubjectValue]);

  const loadContacts = useCallback(async (query = "") => {
    setContactsLoading(true);
    try {
      const data = await fetchJson<{ ok: true; contacts: ContactLite[] }>(`/api/portal/credit/contacts${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`, {
        cache: "no-store",
        headers: variantHeaders,
      });
      setContacts(data.contacts || []);
    } finally {
      setContactsLoading(false);
    }
  }, [variantHeaders]);

  const loadLetters = useCallback(async () => {
    setLettersLoading(true);
    try {
      const data = await fetchJson<{ ok: true; letters: LetterLite[] }>("/api/portal/credit/disputes", {
        cache: "no-store",
        headers: variantHeaders,
      });
      setLetters(data.letters || []);
    } finally {
      setLettersLoading(false);
    }
  }, [variantHeaders]);

  const loadLetter = useCallback(async (letterId: string) => {
    if (!letterId) return;
    setLetterLoading(true);
    try {
      const data = await fetchJson<{ ok: true; letter: LetterFull }>(`/api/portal/credit/disputes/${encodeURIComponent(letterId)}`, {
        cache: "no-store",
        headers: variantHeaders,
      });
      applyLoadedLetter(data.letter);
    } finally {
      setLetterLoading(false);
    }
  }, [applyLoadedLetter, variantHeaders]);

  const loadComposerReportItems = useCallback(async (nextContactId: string) => {
    if (!nextContactId) {
      setComposerReportItems([]);
      setComposerReportLabel("");
      return;
    }
    setComposerItemsLoading(true);
    try {
      const reportList = await fetchJson<{ ok: true; reports: CreditReportLite[] }>("/api/portal/credit/reports", {
        cache: "no-store",
        headers: variantHeaders,
      });
      const latestReport = (reportList.reports || []).find((report) => report.contactId === nextContactId) || null;
      if (!latestReport) {
        setComposerReportItems([]);
        setComposerReportLabel("");
        return;
      }
      const reportDetail = await fetchJson<{ ok: true; report: CreditReportFull }>(`/api/portal/credit/reports/${encodeURIComponent(latestReport.id)}`, {
        cache: "no-store",
        headers: variantHeaders,
      });
      setComposerReportItems(reportDetail.report.items || []);
      setComposerReportLabel(`${reportDetail.report.provider} • ${formatDateTime(reportDetail.report.importedAt)}`);
    } catch {
      setComposerReportItems([]);
      setComposerReportLabel("");
    } finally {
      setComposerItemsLoading(false);
    }
  }, [variantHeaders]);

  useEffect(() => {
    void Promise.all([loadContacts(), loadLetters()]).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Dispute letters did not load. Retry here or start a new letter.");
    });
  }, [loadContacts, loadLetters]);

  useEffect(() => {
    if (!selectedLetterId) return;
    void loadLetter(selectedLetterId).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "That letter did not load. Retry here or open letters.");
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
    if (!statusFiltersMenu) return;
    const close = () => setStatusFiltersMenu(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [statusFiltersMenu]);

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
    setFollowUpDays(TEMPLATES[0].cadenceDays);
    setRecipientName(preset?.recipientName || "");
    setRecipientAddress("");
    setRecipientAddressManual(false);
    setItems(preset?.items?.length ? preset.items : [""]);
    setReportItemQuery("");
  }, [contacts, selectedLetter?.contact, selectedLetter?.contactId]);

  const clearComposerQuery = useCallback(() => {
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("compose");
    params.delete("issue");
    params.delete("bureau");
    params.delete("contactId");
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : `${pathname || routeSet.listHref}`, { scroll: false });
  }, [pathname, routeSet.listHref, router, searchParams]);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    clearComposerQuery();
  }, [clearComposerQuery]);

  useEffect(() => {
    if (mode !== "list") return;
    if (searchParams.get("compose") !== "1") return;
    const issue = (searchParams.get("issue") || "").trim();
    const bureau = (searchParams.get("bureau") || "").trim();
    const targetContactId = (searchParams.get("contactId") || "").trim();
    const reportId = (searchParams.get("reportId") || "").trim();
    const itemId = (searchParams.get("itemId") || "").trim();
    setSourceReportId(reportId);
    setSourceReportItemId(itemId);
    openComposer({
      contactId: targetContactId || undefined,
      recipientName: bureau || undefined,
      items: issue ? [issue] : undefined,
    });
    clearComposerQuery();
  }, [clearComposerQuery, mode, openComposer, searchParams]);

  const handleOpenComposer = useCallback(() => {
    openComposer();
  }, [openComposer]);

  const addComposerReportItem = useCallback((option: PortalSearchableOption) => {
    const matchedItem = composerReportItems.find((item) => item.id === option.value) || null;
    const nextLabel = matchedItem ? formatDisputeItemText(matchedItem) : option.label.trim();
    if (!nextLabel) return;
    setItems((current) => {
      const alreadyIncluded = current.some((entry) => normalize(entry) === normalize(nextLabel));
      if (alreadyIncluded) return current;
      const normalizedItems = current.map((entry) => entry.trim()).filter(Boolean);
      return [...normalizedItems, nextLabel];
    });
    setReportItemQuery("");
  }, [composerReportItems]);

  const insertSignatureIntoLetter = useCallback(() => {
    if (hasInlineSignature) {
      editorRef.current?.moveContactSignatureToEnd();
      return;
    }
    editorRef.current?.insertMarkdown(CONTACT_SIGNATURE_SNIPPET, { atEnd: true });
  }, [hasInlineSignature]);

  const moveSignatureToBottom = useCallback(() => {
    editorRef.current?.moveContactSignatureToEnd();
  }, []);

  const readSignatureDropMarkdown = useCallback((dataTransfer: DataTransfer) => {
    const direct = dataTransfer.getData("application/x-pa-dispute-signature");
    if (direct) return direct;
    const plain = dataTransfer.getData("text/plain");
    return plain === CONTACT_SIGNATURE_SNIPPET ? plain : null;
  }, []);

  const generateLetter = useCallback(async () => {
    setWorking("generate");
    setError(null);
    try {
      const contactLabel = selectedContact?.name || contacts.find((entry) => entry.id === contactId)?.name || "No contact name yet";
      const baseRecipient = recipientName.trim() || "Recipient";
      const subjectLine = `Round ${roundNumber} - ${contactLabel} - ${baseRecipient}`.trim();
      const data = await fetchJson<{ ok: true; letter: LetterFull; pdf?: { downloadUrl?: string | null } }>("/api/portal/credit/disputes", {
        method: "POST",
        headers: variantHeaders,
        body: JSON.stringify({
          contactId,
          recipientName: recipientName.trim(),
          recipientAddress: recipientAddress.trim(),
          sourceReportId: sourceReportId || undefined,
          sourceReportItemId: sourceReportItemId || undefined,
          sourceItemLabel: cleanItems[0] || undefined,
          disputesText: cleanItems.map((item) => `- ${item}`).join("\n"),
          templateLabel: template.label,
          templatePrompt: toPrompt(template, roundNumber, followUpDays, nextTemplate.label, recipientName.trim()),
          templateBodyStarter: template.starter,
          subjectLine,
          roundNumber,
        }),
      });
      await loadLetters();
      setComposerOpen(false);
      setSelectedLetterId(data.letter.id);
      window.location.href = routeSet.editorHref(data.letter.id);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "That letter did not generate. Review it here and try again.");
    } finally {
      setWorking(null);
    }
  }, [cleanItems, contactId, contacts, followUpDays, loadLetters, nextTemplate.label, recipientAddress, recipientName, roundNumber, routeSet, selectedContact?.name, sourceReportId, sourceReportItemId, template, variantHeaders]);

  const saveLetter = useCallback(async (options?: { silent?: boolean }) => {
    if (!selectedLetterId) return;
    const nextSubject = subjectRef.current.trim();
    const nextBodyText = bodyTextRef.current;
    const draftChanged = !savedDraft
      ? false
      : nextSubject !== savedDraft.subject.trim() || nextBodyText !== savedDraft.bodyText;
    if (!draftChanged) return true;
    setWorking("save");
    setError(null);
    try {
      const data = await fetchJson<{ ok: true; letter: LetterFull }>(`/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}`, {
        method: "PATCH",
        headers: variantHeaders,
        body: JSON.stringify({ subject: nextSubject, bodyText: nextBodyText }),
      });
      applyLoadedLetter(data.letter);
      await loadLetters();
      if (!options?.silent) {
        setError(null);
      }
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "This letter did not save. Keep editing here, then use Save draft again.");
      return false;
    } finally {
      setWorking(null);
    }
  }, [applyLoadedLetter, loadLetters, savedDraft, selectedLetterId, variantHeaders]);

  const markLetterMailed = useCallback(async () => {
    if (!selectedLetterId) return;
    const saveOk = await saveLetter({ silent: true });
    if (!saveOk) return;
    setWorking("mail");
    setError(null);
    try {
      await fetchJson(`/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}/send`, {
        method: "POST",
        headers: variantHeaders,
        body: JSON.stringify({
          to: mailTo.trim() || null,
          mailedAt: mailedDate || null,
          expectedDeliveryDate: expectedDeliveryDate || null,
        }),
      });

      setMailModalOpen(false);
      await loadLetter(selectedLetterId);
      await loadLetters();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "This letter did not mail. Review the mailing details and try again.");
    } finally {
      setWorking(null);
    }
  }, [expectedDeliveryDate, loadLetter, loadLetters, mailTo, mailedDate, saveLetter, selectedLetterId, variantHeaders]);

  const refreshPdf = useCallback(async (options?: { force?: boolean; openDownload?: boolean }) => {
    if (!selectedLetterId) return;
    const saveOk = await saveLetter({ silent: true });
    if (!saveOk) return;
    setWorking("pdf");
    setError(null);
    try {
      const data = await fetchJson<{ ok: true; pdf: { downloadUrl: string } }>(`/api/portal/credit/disputes/${encodeURIComponent(selectedLetterId)}/pdf`, {
        method: "POST",
        headers: variantHeaders,
        body: JSON.stringify({ force: Boolean(options?.force) }),
      });
      setPdfDownloadUrl(data.pdf.downloadUrl);
      await loadLetter(selectedLetterId);
      await loadLetters();
      if (options?.openDownload) {
        window.open(data.pdf.downloadUrl, "_blank", "noopener,noreferrer");
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "This PDF did not refresh. Try again here or save the draft first.");
    } finally {
      setWorking(null);
    }
  }, [loadLetter, loadLetters, saveLetter, selectedLetterId, variantHeaders]);

  useEffect(() => {
    if (mode !== "editor") return;
    if (!selectedLetterId || !selectedLetter || letterLoading || working || pdfDownloadUrl) return;
    void refreshPdf().catch(() => undefined);
  }, [letterLoading, mode, pdfDownloadUrl, refreshPdf, selectedLetter, selectedLetterId, working]);

  const mailModal = (
    <AppModal
      open={mailModalOpen}
      title="Mail letter"
      description="Add the mailing details right before marking this letter as mailed."
      onClose={() => {
        if (!working) setMailModalOpen(false);
      }}
      widthClassName="w-[min(560px,calc(100vw-32px))]"
      bodyClassName="space-y-4"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setMailModalOpen(false)}
            className={classNames("rounded-2xl px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-white/80 disabled:opacity-60", portalGlassButtonClass)}
            disabled={working !== null}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void markLetterMailed()}
            className={PRIMARY_BUTTON_CLASS}
            disabled={working !== null}
          >
            {working === "mail" ? "Mailing..." : "Mail"}
          </button>
        </div>
      }
    >
      <label className="block">
        <div className="mb-2 text-xs font-medium text-zinc-500">Mailed to</div>
        <input value={mailTo} onChange={(event) => setMailTo(event.target.value)} className={GLASS_INPUT_CLASS} placeholder="Recipient or mailing note" />
      </label>
      <label className="block">
        <div className="mb-2 text-xs font-medium text-zinc-500">Mail date</div>
        <input type="date" value={mailedDate} onChange={(event) => setMailedDate(event.target.value)} className={GLASS_INPUT_CLASS} />
      </label>
      <label className="block">
        <div className="mb-2 text-xs font-medium text-zinc-500">Expected delivery</div>
        <input type="date" value={expectedDeliveryDate} onChange={(event) => setExpectedDeliveryDate(event.target.value)} className={GLASS_INPUT_CLASS} />
      </label>
      <div className={classNames("rounded-2xl p-4 text-xs text-zinc-600", portalGlassSectionClass)}>
        These details are saved with the letter when you confirm mailing so follow-up status stays accurate.
      </div>
    </AppModal>
  );

  const composer = composerOpen ? (
    <div className={classNames("fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4", portalGlassBackdropClass)} onMouseDown={() => working !== "generate" && closeComposer()}>
      <div className={classNames("my-auto w-full max-w-4xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-4xl border border-white/70 p-6 shadow-[0_28px_90px_rgba(15,23,42,0.2)] sm:p-7", portalGlassPanelClass)} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="New dispute letter" data-overlay-root="true">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-zinc-900">New dispute letter</div>
            <div className="mt-1 text-sm text-zinc-600">Pick the contact, choose the recipient, load the report items, and generate a mailed letter draft.</div>
          </div>
          <button type="button" onClick={closeComposer} aria-label="Close dispute letter composer" className={classNames("inline-flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold text-zinc-700 hover:bg-white/80", portalGlassButtonClass)}>×</button>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <span className={classNames("rounded-full border border-white/70 px-3 py-1.5", portalGlassButtonClass)}>1 Contact</span>
          <span className={classNames("rounded-full border border-white/70 px-3 py-1.5", portalGlassButtonClass)}>2 Letter</span>
          <span className={classNames("rounded-full border border-white/70 px-3 py-1.5", portalGlassButtonClass)}>3 Issues</span>
        </div>
        <div className="mt-5 space-y-4">
          <section className={classNames(GLASS_SECTION_CLASS, "p-5")}>
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
                  inputClassName={GLASS_INPUT_COMBOBOX_CLASS}
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
                  inputClassName={GLASS_INPUT_COMBOBOX_CLASS}
                />
              </label>
              <label className="block md:col-span-2">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Recipient address</div>
                <textarea value={recipientAddress} onChange={(event) => { setRecipientAddress(event.target.value); setRecipientAddressManual(true); }} className={classNames("min-h-24", GLASS_INPUT_CLASS)} />
              </label>
              <div className={classNames("rounded-2xl border border-white/70 px-4 py-3 text-sm text-zinc-700 md:col-span-2", portalGlassButtonClass)}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Signature on file</div>
                <div className="mt-2">
                  <SignatureDisplay value={selectedContactSignature} emptyLabel="No signature stored on this contact yet" textClassName="font-medium text-zinc-900" />
                </div>
              </div>
            </div>
          </section>

          <section className={classNames(GLASS_SECTION_CLASS, "p-5")}>
            <div className="text-sm font-semibold text-zinc-900">Letter details</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Round</div>
                <PortalListboxDropdown value={round} onChange={setRound} options={ROUND_OPTIONS} buttonClassName={classNames("flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm hover:bg-white/80", portalGlassButtonClass)} />
              </label>
              <label className="block">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Next follow-up (days)</div>
                <input
                  type="number"
                  min={7}
                  max={60}
                  value={followUpDays}
                  onChange={(event) => setFollowUpDays(Math.max(7, Math.min(60, Number.parseInt(event.target.value || "0", 10) || template.cadenceDays)))}
                  className={GLASS_INPUT_CLASS}
                />
              </label>
            </div>
            <div className={classNames("mt-4 rounded-2xl border border-white/70 px-4 py-3 text-sm text-zinc-700", portalGlassButtonClass)}>
              <div className="font-semibold text-zinc-900">Auto letter strategy: {template.label}</div>
              <div className="mt-1">{template.summary}</div>
              <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Next follow-up: {nextTemplate.label} in about {followUpDays} days</div>
            </div>
          </section>

          <section className={classNames(GLASS_SECTION_CLASS, "p-5")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Issues</div>
                <div className="mt-1 text-sm text-zinc-600">Add the exact items you want in the letter.</div>
              </div>
              <div className={classNames("rounded-full border border-white/70 px-3 py-1 text-xs font-semibold text-zinc-700", portalGlassButtonClass)}>{cleanItems.length} issue{cleanItems.length === 1 ? "" : "s"}</div>
            </div>

            <div className={classNames("mt-4 rounded-2xl border border-white/70 p-3", portalGlassButtonClass)}>
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
                inputClassName={GLASS_INPUT_COMBOBOX_CLASS}
                disabled={!contactId || composerItemsLoading}
              />
            </div>

            <div className="mt-4 space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    value={item}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setItems((current) => current.map((entry, entryIndex) => (entryIndex === index ? nextValue : entry)));
                    }}
                    className={classNames("flex-1", GLASS_INPUT_CLASS)}
                    placeholder={index === 0 ? "Account XXXX reported late but was paid on time" : "Add another issue"}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setItems((current) => {
                        const next = current.filter((_, entryIndex) => entryIndex !== index);
                        return next.length ? next : [""];
                      });
                    }}
                    className={classNames("rounded-2xl px-3 py-3 text-sm font-semibold text-zinc-700 hover:bg-white/80", portalGlassButtonClass)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setItems((current) => [...current, ""])} className={classNames("mt-3 rounded-2xl px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-white/80", portalGlassButtonClass)}>Add issue</button>
          </section>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={!canGenerate || working !== null}
            onClick={() => void generateLetter()}
            className={classNames(
              AI_GRADIENT_BUTTON_CLASS,
              !canGenerate || working !== null
                ? "bg-zinc-200 text-zinc-600"
                : "bg-linear-to-r from-(--color-brand-blue) via-violet-500 to-(--color-brand-pink) hover:opacity-90",
            )}
          >
            <AiSparkIcon className="h-4 w-4" />
            <span>{working === "generate" ? "Generating…" : "Generate with AI"}</span>
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (mode === "editor") {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => {
                window.location.href = routeSet.listHref;
              }}
              className="text-sm font-semibold text-zinc-700 hover:text-zinc-900"
            >
              ← Back
            </button>

            <div className="mt-3">
              {editingSubject ? (
                <input
                  value={subject}
                  onChange={(event) => setSubjectValue(event.target.value)}
                  onBlur={() => setEditingSubject(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setEditingSubject(false);
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setSubjectValue(subjectSnapshot);
                      setEditingSubject(false);
                    }
                  }}
                  autoFocus
                  className={classNames("w-full max-w-2xl px-4 py-2 text-xl font-bold text-zinc-900", GLASS_INPUT_CLASS)}
                  placeholder="Letter title"
                />
              ) : (
                <button
                  type="button"
                  className="text-left text-2xl font-bold text-zinc-900 hover:underline"
                  onClick={() => {
                    setSubjectSnapshot(subject);
                    setEditingSubject(true);
                  }}
                  title="Click to rename"
                >
                  {subject.trim() || "Dispute letter"}
                </button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              {selectedLetter ? <span className={classNames("rounded-full px-2.5 py-1 text-xs font-semibold", statusClasses(selectedLetter.status))}>{statusLabel(selectedLetter.status)}</span> : null}
              {selectedLetter ? <span className={classNames("rounded-full px-2.5 py-1 text-xs font-semibold", hasDraftChanges ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>{hasDraftChanges ? "Unsaved changes" : "Saved"}</span> : null}
              <span>{selectedLetter ? `Updated ${formatDateTime(selectedLetter.updatedAt)}` : letterLoading ? "Loading letter…" : "No letter selected"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!selectedLetterId || working !== null}
              onClick={() => void refreshPdf({ force: true, openDownload: true })}
              className={ICON_BUTTON_CLASS}
              aria-label="Download PDF"
              title="Download PDF"
            >
              <IconDownload size={18} />
            </button>
            <button
              type="button"
              disabled={!selectedLetterId || working !== null}
              onClick={() => void refreshPdf({ force: true })}
              className={SECONDARY_BUTTON_CLASS}
              title="Regenerate the PDF using the latest layout"
            >
              {working === "pdf" ? "Regenerating..." : "Regenerate PDF"}
            </button>
            <button type="button" disabled={!selectedLetterId || working !== null || !hasDraftChanges} onClick={() => void saveLetter()} className={SECONDARY_BUTTON_CLASS}>{working === "save" ? "Saving..." : "Save draft"}</button>
            <button type="button" disabled={!selectedLetterId || working !== null} onClick={() => setMailModalOpen(true)} className={PRIMARY_BUTTON_CLASS}>Mail</button>
          </div>
        </div>
        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="font-semibold text-red-900">Letter needs attention</div>
            <div className="mt-1">{error}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={working !== null}
                onClick={() => {
                  if (selectedLetterId) {
                    void loadLetter(selectedLetterId).catch((cause: unknown) => {
                      setError(cause instanceof Error ? cause.message : "That letter did not load. Retry here or open letters.");
                    });
                    return;
                  }
                  void Promise.all([loadContacts(), loadLetters()]).catch((cause: unknown) => {
                    setError(cause instanceof Error ? cause.message : "Dispute letters did not load. Retry here or start a new letter.");
                  });
                }}
                className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = routeSet.listHref;
                }}
                className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
              >
                Open letters
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_320px]">
          <section className={classNames(GLASS_PANEL_CLASS, "p-6")}>
            <label className="block">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Letter</div>
              <RichTextMarkdownEditor
                ref={editorRef}
                markdown={bodyText}
                onChange={setBodyTextValue}
                onDropMarkdown={readSignatureDropMarkdown}
                placeholder="Write the dispute letter..."
              />
            </label>
            <div className="mt-3 text-xs text-zinc-500">Save before mailing. Downloading the PDF now saves your latest draft automatically first.</div>
          </section>
          <aside className="space-y-4">
            <section className={classNames(GLASS_PANEL_CLASS, "p-5")}>
              <div className="text-sm font-semibold text-zinc-900">Letter status</div>
              <div className="mt-3 grid gap-3 text-sm text-zinc-700">
                <div className={classNames("rounded-2xl border border-white/70 p-4", portalGlassButtonClass)}>
                  <div className="text-xs font-medium text-zinc-500">Status</div>
                  <div className={classNames("mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", selectedLetter ? statusClasses(selectedLetter.status) : "bg-zinc-100 text-zinc-700")}>{selectedLetter ? statusLabel(selectedLetter.status) : "Not available"}</div>
                </div>
                <div className={classNames("rounded-2xl border border-white/70 p-4", portalGlassButtonClass)}>
                  <div className="text-xs font-medium text-zinc-500">Updated</div>
                  <div className="mt-2 font-medium text-zinc-900">{selectedLetter ? formatDateTime(selectedLetter.updatedAt) : "Not available"}</div>
                </div>
                <div className={classNames("rounded-2xl border border-white/70 p-4", portalGlassButtonClass)}>
                  <div className="text-xs font-medium text-zinc-500">Mailed</div>
                  <div className="mt-2 font-medium text-zinc-900">{selectedLetter?.sentAt ? formatDateTime(selectedLetter.sentAt) : "Not marked yet"}</div>
                </div>
              </div>
            </section>
            <section className={classNames(GLASS_PANEL_CLASS, "p-5")}>
              <div className="text-sm font-semibold text-zinc-900">Contact</div>
              {selectedLetter?.contact ? (
                <div className={classNames("mt-3 rounded-2xl border border-white/70 p-4", portalGlassButtonClass)}>
                  <div className="text-sm font-semibold text-zinc-900">{selectedLetter.contact.name}</div>
                  <div className="mt-1 text-xs text-zinc-600">{selectedLetter.contact.email || "No email"}{selectedLetter.contact.phone ? ` • ${selectedLetter.contact.phone}` : ""}</div>
                  <div className="mt-3 text-xs font-medium text-zinc-500">Signature on file</div>
                  <div className="mt-1">
                    <SignatureDisplay
                      value={readContactCustomValue(selectedLetter.contact.customVariables, "signature")}
                      emptyLabel="No signature stored yet"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={insertSignatureIntoLetter} disabled={hasInlineSignature || (!selectedContactSignatureImage && !selectedContactSignatureText)} className={classNames("rounded-2xl px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-white/80 disabled:opacity-60", portalGlassButtonClass)}>
                      {hasInlineSignature ? "Signature already added" : "Add signature to letter"}
                    </button>
                    {hasInlineSignature ? (
                      <button type="button" onClick={moveSignatureToBottom} className={classNames("rounded-2xl px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-white/80", portalGlassButtonClass)}>
                        Move signature to bottom
                      </button>
                    ) : null}
                  </div>
                  {selectedContactSignatureImage || selectedContactSignatureText ? (
                    <div className="mt-2 text-[11px] text-zinc-500">Use the button to place the saved signature where it should appear in the PDF.</div>
                  ) : null}
                </div>
              ) : (
                <div className={classNames("mt-3 rounded-2xl border border-dashed border-white/80 p-4 text-sm text-zinc-600", portalGlassButtonClass)}>No contact linked.</div>
              )}
            </section>
          </aside>
        </div>
        {mailModal}
        {composer}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dispute letters</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">Draft, review, download, and mark mailed dispute letters without leaving the credit workflow.</p>
        </div>
        <button type="button" onClick={handleOpenComposer} className={PRIMARY_BUTTON_CLASS}>+ New</button>
      </div>
      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold text-red-900">Dispute letters need attention</div>
          <div className="mt-1">{error}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={lettersLoading || contactsLoading}
              onClick={() => {
                void Promise.all([loadContacts(), loadLetters()]).catch((cause: unknown) => {
                  setError(cause instanceof Error ? cause.message : "Dispute letters did not load. Retry here or start a new letter.");
                });
              }}
              className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={handleOpenComposer}
              className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
            >
              New letter
            </button>
          </div>
        </div>
      ) : null}
      <section className={classNames("mt-6 p-6", GLASS_PANEL_CLASS)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
            <input value={search} onChange={(event) => setSearch(event.target.value)} className={classNames("h-11 rounded-full sm:flex-1", GLASS_INPUT_CLASS)} placeholder="Search letters" />
            {statusFiltersMenu ? (
              <>
                <div className="fixed inset-0 z-30" onMouseDown={() => setStatusFiltersMenu(null)} onTouchStart={() => setStatusFiltersMenu(null)} aria-hidden />
                <LiquidGlassPopupSurface
                  className="fixed z-40 w-72 overflow-auto rounded-2xl border border-white/70 shadow-[0_18px_50px_rgba(15,23,42,0.16)]"
                  style={{ left: statusFiltersMenu.left, top: statusFiltersMenu.top, maxHeight: statusFiltersMenu.maxHeight }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                >
                  <div className="border-b border-white/60 px-4 py-3 text-xs font-semibold text-zinc-600">Filters</div>
                  <div className="px-4 py-3">
                    <div className="text-xs font-semibold text-zinc-700">Letter status</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {([
                        ["ALL", `All ${letters.length}`],
                        ["DRAFT", `Draft ${letterCounts.draft}`],
                        ["GENERATED", `Generated ${letterCounts.generated}`],
                        ["SENT", `Mailed ${letterCounts.sent}`],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={classNames(
                            "rounded-xl border px-3 py-2 text-left text-xs font-semibold",
                            statusFilter === value
                              ? "border-brand-ink bg-brand-ink text-white"
                              : classNames("border-white/70 text-zinc-800 hover:bg-white/80", portalGlassButtonClass),
                          )}
                          onClick={() => setStatusFilter(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {statusFilter !== "ALL" ? (
                      <button
                        type="button"
                        className={classNames("mt-3 w-full rounded-xl px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-white/80", portalGlassButtonClass)}
                        onClick={() => setStatusFilter("ALL")}
                      >
                        Clear filters
                      </button>
                    ) : null}
                  </div>
                </LiquidGlassPopupSurface>
              </>
            ) : null}
            <button
              type="button"
              className={classNames(
                "inline-flex h-11 w-11 items-center justify-center rounded-full text-zinc-800 transition-transform duration-150 hover:-translate-y-0.5 hover:bg-white/80",
                portalGlassButtonClass,
                statusFilter !== "ALL" && "border-brand-ink",
              )}
              onClick={(event) => {
                const open = Boolean(statusFiltersMenu);
                if (open) {
                  setStatusFiltersMenu(null);
                  return;
                }
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                setStatusFiltersMenu(computeFixedMenuStyle(rect));
              }}
              aria-label="Letter filters"
              aria-expanded={statusFiltersMenu ? true : undefined}
            >
              <IconFunnel size={18} />
            </button>
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{lettersLoading ? "Loading..." : `${filteredLetters.length} letters`}</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className={classNames("rounded-2xl border border-white/70 px-4 py-3", portalGlassButtonClass)}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Draft</div>
            <div className="mt-2 text-xl font-bold text-zinc-900">{letterCounts.draft}</div>
          </div>
          <div className={classNames("rounded-2xl border border-white/70 px-4 py-3", portalGlassButtonClass)}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Generated</div>
            <div className="mt-2 text-xl font-bold text-zinc-900">{letterCounts.generated}</div>
          </div>
          <div className={classNames("rounded-2xl border border-white/70 px-4 py-3", portalGlassButtonClass)}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Mailed</div>
            <div className="mt-2 text-xl font-bold text-zinc-900">{letterCounts.sent}</div>
          </div>
        </div>
        <div className={classNames("mt-5 overflow-x-auto rounded-3xl border border-white/70", portalGlassSectionClass)}>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/45 text-xs font-semibold uppercase tracking-wide text-zinc-500 supports-backdrop-filter:bg-white/30">
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
                  <tr key={letter.id} tabIndex={0} role="button" onClick={() => { window.location.href = routeSet.editorHref(letter.id); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); window.location.href = routeSet.editorHref(letter.id); } }} className="cursor-pointer border-t border-white/60 transition hover:bg-white/40 focus:bg-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/20">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-zinc-900">{formatDisputeLetterListTitle(letter.subject) || `Round 1 - ${letter.contact.name} - Recipient`}</div>
                      <div className="mt-1 text-xs text-zinc-500">Created {formatDateTime(letter.createdAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{letter.contact.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">{letter.contact.email || "No email"}</div>
                    </td>
                    <td className="px-4 py-3"><span className={classNames("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", statusClasses(letter.status))}>{statusLabel(letter.status)}</span></td>
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
