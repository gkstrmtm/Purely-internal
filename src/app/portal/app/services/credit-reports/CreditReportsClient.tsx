"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import { PortalSearchableCombobox, type PortalSearchableOption } from "@/components/PortalSearchableCombobox";
import { useToast } from "@/components/ToastProvider";

type ContactLite = { id: string; name: string; email: string | null };

type CreditScope = "PERSONAL" | "BUSINESS" | "BOTH";

type ReportLite = {
  id: string;
  provider: string;
  importedAt: string;
  createdAt: string;
  creditScope: CreditScope;
  contactId: string | null;
  contact: { id: string; name: string; email: string | null } | null;
  _count: { items: number };
};

type ReportItemLite = {
  id: string;
  bureau: string | null;
  kind: string | null;
  label: string;
  auditTag: "PENDING" | "NEGATIVE" | "POSITIVE";
  disputeStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReportFull = ReportLite & {
  rawJson: any;
  items: ReportItemLite[];
};

type FundingOffer = {
  label: string;
  href: string;
  source: string;
};

type OpportunityPlan = {
  key: string;
  title: string;
  readinessLabel: string;
  readinessTone: "red" | "amber" | "green";
  offers: FundingOffer[];
  summary: string;
};

const CREDIT_SCOPE_SEGMENTS: Array<{ value: CreditScope; label: string; summary: string }> = [
  { value: "PERSONAL", label: "Personal", summary: "Consumer file and personal approvals" },
  { value: "BUSINESS", label: "Business", summary: "Business credit and vendor/funding lanes" },
  { value: "BOTH", label: "Both", summary: "Review both personal and business angles" },
];

const REPORT_FILTER_LABELS: Record<"ALL" | "PENDING" | "NEGATIVE" | "POSITIVE" | "TRACKED", string> = {
  ALL: "All items",
  PENDING: "Needs review",
  NEGATIVE: "Needs dispute",
  POSITIVE: "Positive",
  TRACKED: "Follow-up",
};

function creditScopeLabel(scope: CreditScope) {
  if (scope === "BUSINESS") return "Business credit";
  if (scope === "BOTH") return "Personal + business credit";
  return "Personal credit";
}

function scopeChipClasses(scope: CreditScope) {
  if (scope === "BUSINESS") return "border-violet-200 bg-violet-50 text-violet-700";
  if (scope === "BOTH") return "border-brand-200 bg-brand-50 text-brand-ink";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function readinessAccentClasses(tone: OpportunityPlan["readinessTone"]) {
  if (tone === "green") return "border-emerald-300 bg-emerald-50/70";
  if (tone === "amber") return "border-amber-300 bg-amber-50/70";
  return "border-rose-300 bg-rose-50/70";
}

function reportReadinessLabel(summary: { pending: number; negative: number; positive: number }) {
  if (summary.negative >= 3) return "Cleanup first";
  if (summary.pending >= 2) return "Needs review before sending";
  if (summary.negative >= 1) return "Dispute-ready";
  if (summary.positive >= 2) return "Stable enough to monitor";
  return "New file. Classify items first";
}

function reportRoutesFor(pathname: string | null) {
  const current = String(pathname || "");
  if (current.startsWith("/credit/app/services/credit-reports")) {
    return {
      listHref: "/credit/app/services/credit-reports",
      detailHref: (reportId: string) => `/credit/app/services/credit-reports/${encodeURIComponent(reportId)}`,
      disputeHref: "/credit/app/services/dispute-letters",
    };
  }
  return {
    listHref: "/portal/app/services/credit-reports",
    detailHref: (reportId: string) => `/portal/app/services/credit-reports/${encodeURIComponent(reportId)}`,
    disputeHref: "/portal/app/services/dispute-letters",
  };
}

function buildOpportunityPlans(report: ReportFull | null, summary: { pending: number; negative: number; positive: number; tracked: number }, creditScope: CreditScope) {
  const items = report?.items || [];
  const lowerText = items
    .map((item) => [item.label, item.kind, item.bureau, item.disputeStatus].map((value) => String(value || "").toLowerCase()).join(" "))
    .join(" ");

  const hasUtilizationSignals = lowerText.includes("revolving") || lowerText.includes("credit card") || lowerText.includes("utilization");
  const isCleanEnoughForOffers = summary.negative <= 2 && summary.pending <= 1;
  const isStillRepairHeavy = summary.negative >= 3 || summary.pending >= 3;

  const businessFunding: OpportunityPlan = {
    key: "business-funding",
    title: "Business funding",
    readinessLabel: isCleanEnoughForOffers ? "Shortlist business options" : "Build the file before applying",
    readinessTone: isCleanEnoughForOffers ? "amber" : "red",
    offers: isCleanEnoughForOffers
      ? [
          { label: "Amex Blue Business Cash", href: "https://www.americanexpress.com/us/credit-cards/business/business-credit-cards/american-express-blue-business-cash-card-amex/", source: "American Express" },
          { label: "Capital on Tap Business Card", href: "https://www.capitalontap.com/en/", source: "Capital on Tap" },
          { label: "Fundbox Line of Credit", href: "https://fundbox.com/line-of-credit/", source: "Fundbox" },
          { label: "Bluevine Business Line", href: "https://www.bluevine.com/line-of-credit/", source: "Bluevine" },
        ]
      : [
          { label: "Nav Prime", href: "https://www.nav.com/nav-prime/", source: "Nav" },
          { label: "Tillful", href: "https://www.tillful.com/", source: "Tillful" },
          { label: "Quill", href: "https://www.quill.com/", source: "Starter vendor" },
          { label: "Uline", href: "https://www.uline.com/", source: "Starter vendor" },
        ],
    summary: isCleanEnoughForOffers
      ? "The file looks clean enough to shortlist a few business options, but keep the application count tight and the business profile consistent."
      : "Keep business funding on deck, but stay in build mode until the report has fewer unresolved negatives and less review work.",
  };

  const personalFunding: OpportunityPlan = {
    key: "personal-funding",
    title: "Personal funding",
    readinessLabel: isCleanEnoughForOffers ? "Shortlist personal options" : "Hold off until cleanup lands",
    readinessTone: isCleanEnoughForOffers ? "amber" : "red",
    offers: isCleanEnoughForOffers
      ? [
          { label: "Upgrade Personal Loan", href: "https://www.upgrade.com/personal-loans/", source: "Upgrade" },
          { label: "LendingClub Personal Loan", href: "https://www.lendingclub.com/personal-loans", source: "LendingClub" },
          { label: "Prosper Personal Loan", href: "https://www.prosper.com/personal-loans/", source: "Prosper" },
          { label: "Upstart Personal Loan", href: "https://www.upstart.com/loans/personal-loans", source: "Upstart" },
        ]
      : [
          { label: "OneMain Financial", href: "https://www.onemainfinancial.com/personal-loans", source: "OneMain" },
          { label: "Avant", href: "https://www.avant.com/personal-loans", source: "Avant" },
          { label: "Best Egg", href: "https://www.bestegg.com/personal-loans/", source: "Best Egg" },
          { label: "Achieve", href: "https://www.achieve.com/personal-loans", source: "Achieve" },
        ],
    summary: isCleanEnoughForOffers
      ? "Personal funding is reasonable if utilization stays controlled and applications stay selective."
      : "Treat personal funding as phase two. Clean the report first so the file is not taking unnecessary new hits.",
  };

  const creditCards: OpportunityPlan = {
    key: "credit-cards",
    title: creditScope === "BUSINESS" ? "Business credit cards" : creditScope === "PERSONAL" ? "Personal credit cards" : "Credit cards",
    readinessLabel: hasUtilizationSignals || isCleanEnoughForOffers ? "Use cards carefully" : "Start with rebuild cards",
    readinessTone: hasUtilizationSignals || isCleanEnoughForOffers ? "green" : "amber",
    offers: creditScope === "BUSINESS"
      ? [
          { label: "Amex Blue Business Cash", href: "https://www.americanexpress.com/us/credit-cards/business/business-credit-cards/american-express-blue-business-cash-card-amex/", source: "American Express" },
          { label: "Capital on Tap Business Card", href: "https://www.capitalontap.com/en/", source: "Capital on Tap" },
          { label: "Brex Card", href: "https://www.brex.com/", source: "Brex" },
          { label: "Ramp Card", href: "https://ramp.com/", source: "Ramp" },
        ]
      : hasUtilizationSignals || isCleanEnoughForOffers
      ? [
          { label: "Capital One QuicksilverOne", href: "https://www.capitalone.com/credit-cards/quicksilverone/", source: "Capital One" },
          { label: "Mission Lane Visa", href: "https://www.missionlane.com/", source: "Mission Lane" },
          { label: "Merrick Bank Double Your Line", href: "https://www.merrickbank.com/Credit-Cards/", source: "Merrick Bank" },
          { label: "Amex Blue Business Cash", href: "https://www.americanexpress.com/us/credit-cards/business/business-credit-cards/american-express-blue-business-cash-card-amex/", source: "American Express" },
        ]
      : [
          { label: "Discover it Secured", href: "https://www.discover.com/credit-cards/secured-credit-card/", source: "Discover" },
          { label: "Capital One Platinum Secured", href: "https://www.capitalone.com/credit-cards/platinum-secured/", source: "Capital One" },
          { label: "OpenSky Secured", href: "https://www.openskycc.com/", source: "OpenSky" },
          { label: "Self Visa Secured", href: "https://www.self.inc/credit-builder-credit-card", source: "Self" },
        ],
    summary: hasUtilizationSignals
      ? "This is the fastest lane to influence the file, but only if balances stay low and new accounts stay deliberate."
      : "Use this lane to add clean revolving history without over-applying or chasing limits too early.",
  };

  const otherActions: OpportunityPlan = {
    key: "other-actions",
    title: "Other actions",
    readinessLabel: isStillRepairHeavy ? "Stay in repair mode" : "Keep monitoring live",
    readinessTone: isStillRepairHeavy ? "red" : "amber",
    offers: isStillRepairHeavy
      ? [
          { label: "Experian Dispute Center", href: "https://www.experian.com/disputes/main.html", source: "Experian" },
          { label: "Equifax Dispute Portal", href: "https://www.equifax.com/personal/credit-report-services/credit-dispute/", source: "Equifax" },
          { label: "TransUnion Dispute Center", href: "https://dispute.transunion.com/", source: "TransUnion" },
          { label: "AnnualCreditReport", href: "https://www.annualcreditreport.com/", source: "Bureau refresh" },
        ]
      : [
          { label: "CFPB Complaint Portal", href: "https://www.consumerfinance.gov/complaint/", source: "CFPB" },
          { label: "CFPB Credit Help", href: "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/", source: "CFPB" },
          { label: "AnnualCreditReport", href: "https://www.annualcreditreport.com/", source: "Monitoring" },
          { label: "IdentityTheft.gov", href: "https://www.identitytheft.gov/", source: "FTC" },
        ],
    summary: isStillRepairHeavy
      ? "The report still needs cleanup, follow-up, and bureau monitoring before bigger funding moves should take the lead."
      : "Even when the file improves, steady monitoring and follow-up keep it from sliding backward.",
  };

  if (creditScope === "BUSINESS") return [businessFunding, creditCards, otherActions];
  if (creditScope === "PERSONAL") return [personalFunding, creditCards, otherActions];
  return [businessFunding, personalFunding, creditCards, otherActions];
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

export default function CreditReportsClient({ mode = "list", initialReportId = "" }: { mode?: "list" | "detail"; initialReportId?: string }) {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const toast = useToast();
  const routeSet = useMemo(() => reportRoutesFor(pathname), [pathname]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedReportIdsRef = useRef<string[]>([]);

  const [reports, setReports] = useState<ReportLite[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>(initialReportId);
  const [selectedReport, setSelectedReport] = useState<ReportFull | null>(null);
  const [newReportOpen, setNewReportOpen] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("ALL");

  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  const [provider, setProvider] = useState<string>("IdentityIQ");
  const [creditScope, setCreditScope] = useState<CreditScope>("PERSONAL");
  const [itemFilter, setItemFilter] = useState<"ALL" | "PENDING" | "NEGATIVE" | "POSITIVE" | "TRACKED">("ALL");
  const [itemQuery, setItemQuery] = useState("");
  const [rawText, setRawText] = useState<string>("{");
  const showAdvancedImport = useMemo(() => {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
  }, []);

  const loadReports = useCallback(async () => {
    const json = await fetchJson<{ ok: true; reports: ReportLite[] }>("/api/portal/credit/reports", { cache: "no-store" as any });
    const nextReports = json.reports || [];
    const previousIds = loadedReportIdsRef.current;
    const nextIds = nextReports.map((report) => report.id);
    const newIds = previousIds.length ? nextIds.filter((id) => !previousIds.includes(id)) : [];
    if (newIds.length) {
      toast.success(newIds.length === 1 ? "New credit report received." : `${newIds.length} new credit reports received.`);
    }
    loadedReportIdsRef.current = nextIds;
    setReports(nextReports);
  }, [toast]);

  const loadReport = useCallback(async (reportId: string) => {
    if (!reportId) return;
    const json = await fetchJson<{ ok: true; report: ReportFull }>(`/api/portal/credit/reports/${encodeURIComponent(reportId)}`, { cache: "no-store" as any });
    setSelectedReport(json.report);
  }, []);

  const loadContacts = useCallback(async (q: string) => {
    const url = `/api/portal/credit/contacts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`;
    const json = await fetchJson<{ ok: true; contacts: Array<any> }>(url, { cache: "no-store" as any });
    const next: ContactLite[] = (json.contacts || []).map((c: any) => ({
      id: String(c.id),
      name: String(c.name || ""),
      email: c.email ? String(c.email) : null,
    }));
    setContacts(next);
    setSelectedContactId((prev) => prev || next[0]?.id || "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        await Promise.all([loadReports(), loadContacts("")]);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadContacts, loadReports]);

  useEffect(() => {
    if (!selectedReportId) {
      setSelectedReport(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        await loadReport(selectedReportId);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load report");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadReport, selectedReportId]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || null,
    [contacts, selectedContactId],
  );
  const contactSuggestions = useMemo(
    () => contacts.map((contact) => ({ id: contact.id, label: `${contact.name}${contact.email ? ` - ${contact.email}` : ""}` })),
    [contacts],
  );
  const contactOptions = useMemo<PortalSearchableOption[]>(() => contacts.map((contact) => ({
    value: contact.id,
    label: contact.name,
    hint: contact.email || undefined,
    keywords: [contact.name, contact.email || ""],
  })), [contacts]);
  const providerOptions = useMemo<PortalListboxOption<string>[]>(() => (
    [
      { value: "IdentityIQ", label: "IdentityIQ" },
      { value: "SmartCredit", label: "SmartCredit" },
      { value: "MyScoreIQ", label: "MyScoreIQ" },
      { value: "Experian", label: "Experian" },
      { value: "TransUnion", label: "TransUnion" },
      { value: "Equifax", label: "Equifax" },
      { value: "Other", label: "Other" },
    ] as PortalListboxOption<string>[]
  ), []);
  const providerFilterOptions = useMemo<PortalListboxOption<string>[]>(() => {
    const providerValues = Array.from(new Set(reports.map((report) => String(report.provider || "").trim()).filter(Boolean)));
    return [
      { value: "ALL", label: "All providers" },
      ...providerValues.map((value) => ({ value, label: value })),
    ];
  }, [reports]);
  const filteredReports = useMemo(() => {
    const query = reportSearch.trim().toLowerCase();
    return reports.filter((report) => {
      if (providerFilter !== "ALL" && report.provider !== providerFilter) return false;
      if (!query) return true;
      const haystack = [report.contact?.name, report.contact?.email, report.provider, report.creditScope]
        .map((part) => String(part || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [providerFilter, reportSearch, reports]);
  const selectedReportSummary = useMemo(() => {
    const items = selectedReport?.items || [];
    const pending = items.filter((item) => item.auditTag === "PENDING").length;
    const negative = items.filter((item) => item.auditTag === "NEGATIVE").length;
    const positive = items.filter((item) => item.auditTag === "POSITIVE").length;
    const tracked = items.filter((item) => String(item.disputeStatus || "").trim().length > 0).length;
    return { pending, negative, positive, tracked };
  }, [selectedReport]);
  const readinessLabel = useMemo(
    () => reportReadinessLabel(selectedReportSummary),
    [selectedReportSummary],
  );
  const filteredItems = useMemo(() => {
    const items = selectedReport?.items || [];
    const query = itemQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesFilter =
        itemFilter === "ALL"
          ? true
          : itemFilter === "TRACKED"
            ? Boolean(String(item.disputeStatus || "").trim())
            : item.auditTag === itemFilter;

      if (!matchesFilter) return false;
      if (!query) return true;

      const haystack = [item.label, item.bureau, item.kind, item.disputeStatus].map((part) => String(part || "").toLowerCase()).join(" ");
      return haystack.includes(query);
    });
  }, [itemFilter, itemQuery, selectedReport]);
  const opportunityPlans = useMemo(
    () => buildOpportunityPlans(selectedReport, selectedReportSummary, selectedReport?.creditScope || creditScope),
    [creditScope, selectedReport, selectedReportSummary],
  );
  const statCards = useMemo(() => {
    const total = selectedReport ? selectedReport.items.length : 0;
    const percentLabel = (value: number) => total > 0 ? `${Math.round((value / total) * 100)}% of file` : "0% of file";
    return [
      {
        label: "Needs dispute",
        value: String(selectedReportSummary.negative),
        helper: selectedReportSummary.negative > 0 ? "These are the items to push into disputes first." : "No dispute-ready items tagged right now.",
        share: percentLabel(selectedReportSummary.negative),
        toneClass: "border-rose-200 bg-rose-50/60 text-rose-700",
      },
      {
        label: "Needs review",
        value: String(selectedReportSummary.pending),
        helper: selectedReportSummary.pending > 0 ? "Still needs sorting before you decide whether to dispute, monitor, or leave it alone." : "Nothing is waiting on first-pass review.",
        share: percentLabel(selectedReportSummary.pending),
        toneClass: "border-amber-200 bg-amber-50/60 text-amber-700",
      },
      {
        label: "Follow-up active",
        value: String(selectedReportSummary.tracked),
        helper: selectedReportSummary.tracked > 0 ? "Items already tied to a note, letter, or bureau follow-up." : "No follow-up notes saved yet.",
        share: percentLabel(selectedReportSummary.tracked),
        toneClass: "border-sky-200 bg-sky-50/60 text-sky-700",
      },
      {
        label: "Positive anchors",
        value: String(selectedReportSummary.positive),
        helper: selectedReportSummary.positive > 0 ? "These accounts help steady the file while cleanup continues." : "No supportive items tagged yet.",
        share: percentLabel(selectedReportSummary.positive),
        toneClass: "border-emerald-200 bg-emerald-50/60 text-emerald-700",
      },
    ];
  }, [selectedReport, selectedReportSummary]);
  const bureauBreakdown = useMemo(() => {
    const items = selectedReport?.items || [];
    const total = Math.max(1, items.length);
    const counts = items.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.bureau || "Unassigned").trim() || "Unassigned";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([bureau, count]) => ({ bureau, count, percentage: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);
  }, [selectedReport]);
  const kindBreakdown = useMemo(() => {
    const items = selectedReport?.items || [];
    const counts = items.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.kind || "Other").trim() || "Other";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [selectedReport]);
  const nextSteps = useMemo(() => {
    const steps: Array<{ key: string; title: string; detail: string; toneClass: string }> = [];
    if (selectedReportSummary.negative > 0) {
      steps.push({
        key: "dispute",
        title: "Open disputes first",
        detail: `${selectedReportSummary.negative} item${selectedReportSummary.negative === 1 ? " is" : "s are"} already tagged as needing dispute work.`,
        toneClass: "border-rose-200 bg-rose-50/70 text-rose-700",
      });
    }
    if (selectedReportSummary.pending > 0) {
      steps.push({
        key: "review",
        title: "Finish the manual review",
        detail: `${selectedReportSummary.pending} item${selectedReportSummary.pending === 1 ? " still needs" : "s still need"} classification before you act.`,
        toneClass: "border-amber-200 bg-amber-50/70 text-amber-700",
      });
    }
    if (selectedReportSummary.tracked > 0) {
      steps.push({
        key: "follow-up",
        title: "Follow up on active work",
        detail: `${selectedReportSummary.tracked} item${selectedReportSummary.tracked === 1 ? " has" : "s have"} notes or dispute tracking that should stay moving.`,
        toneClass: "border-sky-200 bg-sky-50/70 text-sky-700",
      });
    }
    if (selectedReportSummary.positive > 0) {
      steps.push({
        key: "positive",
        title: "Protect the good accounts",
        detail: `${selectedReportSummary.positive} positive item${selectedReportSummary.positive === 1 ? " is" : "s are"} helping stabilize the file.`,
        toneClass: "border-emerald-200 bg-emerald-50/70 text-emerald-700",
      });
    }
    if (!steps.length) {
      steps.push({
        key: "start",
        title: "Start classifying the file",
        detail: "Sort each line into review, dispute, or positive support so the report becomes actionable.",
        toneClass: "border-zinc-200 bg-zinc-50 text-zinc-700",
      });
    }
    return steps.slice(0, 4);
  }, [selectedReportSummary]);
  const priorityItems = useMemo(() => {
    const items = selectedReport?.items || [];
    const score = (item: ReportItemLite) => {
      let total = 0;
      if (item.auditTag === "NEGATIVE") total += 30;
      if (item.auditTag === "PENDING") total += 20;
      if (String(item.disputeStatus || "").trim()) total += 10;
      if (item.bureau) total += 3;
      return total;
    };
    return [...items]
      .sort((a, b) => score(b) - score(a) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4);
  }, [selectedReport]);

  useEffect(() => {
    if (!initialReportId) return;
    setSelectedReportId(initialReportId);
  }, [initialReportId]);

  useEffect(() => {
    const query = (searchParams.get("contact") || "").trim();
    if (!query) return;
    setContactQuery(query);
  }, [searchParams]);

  useEffect(() => {
    const normalized = contactQuery.trim().toLowerCase();
    if (!normalized) return;
    const match = contactSuggestions.find((entry) => entry.label.toLowerCase() === normalized) || contactSuggestions.find((entry) => entry.label.toLowerCase().startsWith(normalized));
    if (match) setSelectedContactId(match.id);
  }, [contactQuery, contactSuggestions]);

  const importReport = async () => {
    setBusy(true);
    setError(null);
    try {
      const rawJson = JSON.parse(rawText);
      const json = await fetchJson<{ ok: true; report: ReportLite }>("/api/portal/credit/reports", {
        method: "POST",
        body: JSON.stringify({
          contactId: selectedContactId || undefined,
          provider: provider.trim() || undefined,
          creditScope,
          rawJson,
        }),
      });
      await loadReports();
      toast.success("Credit report imported.");
      setNewReportOpen(false);
      setSelectedReportId(json.report.id);
      setRawText("{");
      window.location.href = routeSet.detailHref(json.report.id);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to import");
    } finally {
      setBusy(false);
    }
  };

  const requestProviderPull = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!selectedContactId) {
        setError("Select a contact first.");
        return;
      }
      const json = await fetchJson<{ ok: true; report: ReportLite }>("/api/portal/credit/reports/pull", {
        method: "POST",
        body: JSON.stringify({
          contactId: selectedContactId,
          provider,
        }),
      });
      await loadReports();
      toast.success("Credit report pulled.");
      setNewReportOpen(false);
      setSelectedReportId(json.report.id);
      window.location.href = routeSet.detailHref(json.report.id);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Unable to pull report");
    } finally {
      setBusy(false);
    }
  };

  const updateItem = async (itemId: string, patch: { auditTag?: ReportItemLite["auditTag"]; disputeStatus?: string | null }) => {
    if (!selectedReportId) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson<{ ok: true }>(
        `/api/portal/credit/reports/${encodeURIComponent(selectedReportId)}/items/${encodeURIComponent(itemId)}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      await loadReport(selectedReportId);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to update item");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">Credit reports</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            {mode === "detail" ? "Review one report, act on the items, and jump straight into disputes." : "Pull a report, scan the queue, and open a cleaner detail workspace when you need it."}
          </p>
        </div>
        {mode === "detail" ? (
          <button
            type="button"
            onClick={() => {
              window.location.href = routeSet.listHref;
            }}
            className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-zinc-50"
          >
            Back to reports
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">{reports.length} saved</div>
            <button
              type="button"
              onClick={() => setNewReportOpen(true)}
              className="inline-flex items-center justify-center rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              + New
            </button>
          </div>
        )}
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {mode === "list" ? (
        <>
          <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  value={reportSearch}
                  onChange={(event) => setReportSearch(event.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-300 sm:flex-1"
                  placeholder="Search reports"
                />
                <div className="w-full sm:w-56">
                  <PortalListboxDropdown
                    value={providerFilter}
                    onChange={setProviderFilter}
                    options={providerFilterOptions}
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50"
                  />
                </div>
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{`${filteredReports.length} reports`}</div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-3xl border border-zinc-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Report</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-zinc-600">{busy ? "Loading reports..." : "No reports yet."}</td>
                    </tr>
                  ) : (
                    filteredReports.map((report) => (
                      <tr
                        key={report.id}
                        tabIndex={0}
                        role="button"
                        onClick={() => {
                          window.location.href = routeSet.detailHref(report.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            window.location.href = routeSet.detailHref(report.id);
                          }
                        }}
                        className="cursor-pointer border-t border-zinc-200 hover:bg-zinc-50 focus:bg-zinc-50"
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-zinc-900">{report.contact?.name || report.provider}</div>
                          <div className="mt-1 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                            {creditScopeLabel(report.creditScope)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-900">{report.contact?.name || "Unassigned"}</div>
                          <div className="mt-1 text-xs text-zinc-500">{report.contact?.email || "No email"}</div>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">
                          <div>{report.provider}</div>
                          <div className="mt-1 text-xs text-zinc-500">{report._count.items} items</div>
                        </td>
                        <td className="px-4 py-3 text-zinc-600">
                          <div>{new Date(report.importedAt).toLocaleString()}</div>
                          <div className="mt-1 text-xs text-zinc-400">Click to open</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {newReportOpen ? (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onMouseDown={() => !busy && setNewReportOpen(false)}>
              <div className="my-auto w-full max-w-3xl rounded-4xl border border-zinc-200 bg-white p-6 shadow-xl sm:p-7" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="New credit report" data-overlay-root="true">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-zinc-900">New report</div>
                  </div>
                  <button type="button" onClick={() => setNewReportOpen(false)} aria-label="Close new report" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 text-lg font-semibold text-zinc-700 hover:bg-zinc-50">×</button>
                </div>

                <div className="mt-5 grid gap-4">
                  <label className="block">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contact</div>
                    <PortalSearchableCombobox
                      query={contactQuery}
                      onQueryChange={(value) => {
                        setContactQuery(value);
                        if (!value.trim()) setSelectedContactId("");
                      }}
                      options={contactOptions}
                      selectedValue={selectedContactId}
                      onSelect={(option) => {
                        setSelectedContactId(option.value);
                        setContactQuery(option.label);
                      }}
                      placeholder="Search or select a contact"
                      emptyLabel="No contacts found"
                      inputClassName="pa-portal-listbox-button w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-10 text-sm text-zinc-900 outline-none focus:border-zinc-300"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Provider</div>
                    <PortalListboxDropdown
                      value={provider}
                      onChange={setProvider}
                      disabled={busy}
                      options={providerOptions}
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm hover:bg-zinc-50"
                    />
                  </label>

                  {showAdvancedImport ? (
                    <details className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-zinc-800">Advanced import</summary>
                      <label className="mt-3 block">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Report JSON</div>
                        <textarea
                          value={rawText}
                          onChange={(e) => setRawText(e.target.value)}
                          className="min-h-45 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                          placeholder="Paste JSON here"
                        />
                      </label>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={busy || rawText.trim().length < 2}
                          onClick={importReport}
                          className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                        >
                          {busy ? "Working..." : "Import report"}
                        </button>
                      </div>
                    </details>
                  ) : null}
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" onClick={() => setNewReportOpen(false)} className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">Cancel</button>
                  <button type="button" disabled={busy || !selectedContactId} onClick={requestProviderPull} className="rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Working..." : "Pull report"}</button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : !selectedReport ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Report not found.</div>
      ) : (
        <div className="mt-6 space-y-5">
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold text-zinc-900">{selectedReport.contact?.name || selectedReport.provider}</h2>
                  <div className={"rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide " + scopeChipClasses(selectedReport.creditScope)}>{creditScopeLabel(selectedReport.creditScope)}</div>
                </div>
                <div className="mt-2 text-sm text-zinc-600">{selectedReport.provider} • Imported {new Date(selectedReport.importedAt).toLocaleString()}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (selectedReport.contactId) params.set("contactId", selectedReport.contactId);
                    params.set("compose", "1");
                    window.location.href = `${routeSet.disputeHref}?${params.toString()}`;
                  }}
                  className="rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                  Open dispute
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById("credit-report-items")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  View items
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Negative</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{selectedReportSummary.negative}</div>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Pending review</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{selectedReportSummary.pending}</div>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Positive</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{selectedReportSummary.positive}</div>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Dispute notes</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{selectedReportSummary.tracked}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-3xl border border-zinc-200 p-5">
                <div className="text-sm font-semibold text-zinc-900">Priority queue</div>
                <div className="mt-4 space-y-3">
                  {priorityItems.length ? priorityItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-zinc-900">{item.label}</div>
                          <div className="mt-1 text-xs text-zinc-500">{[item.bureau, item.kind].filter(Boolean).join(" • ") || "Uncategorized"}</div>
                        </div>
                        <div className={item.auditTag === "NEGATIVE" ? "rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700" : item.auditTag === "PENDING" ? "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700" : "rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"}>
                          {REPORT_FILTER_LABELS[item.auditTag]}
                        </div>
                      </div>
                    </div>
                  )) : <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">No items on this report yet.</div>}
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-200 p-5">
                <div className="text-sm font-semibold text-zinc-900">Report info</div>
                <div className="mt-4 space-y-3 text-sm text-zinc-700">
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contact</div>
                    <div className="mt-1 font-semibold text-zinc-900">{selectedReport.contact?.name || "Unassigned"}</div>
                    <div className="mt-1 text-xs text-zinc-500">{selectedReport.contact?.email || "No email on file"}</div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Bureaus</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {bureauBreakdown.length ? bureauBreakdown.map((entry) => (
                        <div key={entry.bureau} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600">{entry.bureau} · {entry.count}</div>
                      )) : <div className="text-xs text-zinc-500">No bureau data</div>}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Account types</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {kindBreakdown.length ? kindBreakdown.map((entry) => (
                        <div key={entry.kind} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600">{entry.kind} · {entry.count}</div>
                      )) : <div className="text-xs text-zinc-500">No account types</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="credit-report-items" className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Report items</div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm sm:w-56"
                  placeholder="Search items"
                />
                <PortalListboxDropdown
                  value={itemFilter}
                  onChange={(value) => setItemFilter(value as typeof itemFilter)}
                  options={[
                    { value: "ALL", label: `All ${selectedReport.items.length}` },
                    { value: "PENDING", label: `${REPORT_FILTER_LABELS.PENDING} ${selectedReportSummary.pending}` },
                    { value: "NEGATIVE", label: `${REPORT_FILTER_LABELS.NEGATIVE} ${selectedReportSummary.negative}` },
                    { value: "POSITIVE", label: `Positive ${selectedReportSummary.positive}` },
                    { value: "TRACKED", label: `${REPORT_FILTER_LABELS.TRACKED} ${selectedReportSummary.tracked}` },
                  ]}
                  buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 sm:w-52"
                />
                <div className="text-xs text-zinc-500">{filteredItems.length} shown</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {priorityItems.map((it) => (
                <div key={it.id} className="rounded-3xl border border-zinc-200 bg-zinc-50/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{it.label}</div>
                      <div className="mt-1 text-xs text-zinc-500">{(it.bureau ? `${it.bureau} • ` : "") + (it.kind || "Uncategorized")}</div>
                    </div>
                    <div className={it.auditTag === "NEGATIVE" ? "rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700" : it.auditTag === "PENDING" ? "rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700" : "rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"}>
                      {REPORT_FILTER_LABELS[it.auditTag]}
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-zinc-600">
                    {it.disputeStatus ? `Latest follow-up: ${it.disputeStatus}` : it.auditTag === "NEGATIVE" ? "Ready to move into a dispute letter." : it.auditTag === "PENDING" ? "Review this item before deciding the next move." : "Keep this account steady while cleanup continues."}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {filteredItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">No matching items.</div>
              ) : (
                filteredItems.map((it) => (
                  <div key={it.id} className="rounded-[26px] border border-zinc-200 bg-zinc-50/80 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-zinc-900">{it.label}</div>
                        <div className="mt-1 text-xs text-zinc-500">{(it.bureau ? `${it.bureau} • ` : "") + (it.kind || "Uncategorized")}</div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row xl:w-auto">
                        <button
                          type="button"
                          onClick={() => {
                            const params = new URLSearchParams();
                            if (selectedReport.contactId) params.set("contactId", selectedReport.contactId);
                            params.set("compose", "1");
                            params.set("issue", it.label);
                            if (it.bureau) params.set("bureau", it.bureau);
                            window.location.href = `${routeSet.disputeHref}?${params.toString()}`;
                          }}
                          className="rounded-2xl bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                        >
                          Create dispute
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[180px_220px_minmax(0,1fr)]">
                      <label className="block">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Classification</div>
                        <PortalListboxDropdown
                          value={it.auditTag}
                          onChange={(v) => updateItem(it.id, { auditTag: v })}
                          disabled={busy}
                          buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                          options={(
                            [
                              { value: "PENDING", label: REPORT_FILTER_LABELS.PENDING },
                              { value: "NEGATIVE", label: REPORT_FILTER_LABELS.NEGATIVE },
                              { value: "POSITIVE", label: REPORT_FILTER_LABELS.POSITIVE },
                            ] as PortalListboxOption<ReportItemLite["auditTag"]>[]
                          )}
                        />
                      </label>
                      <label className="block">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Dispute note</div>
                        <input
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                          value={it.disputeStatus || ""}
                          disabled={busy}
                          placeholder="Mailed 4/1 • waiting on bureau"
                          onChange={(e) => updateItem(it.id, { disputeStatus: e.target.value })}
                        />
                      </label>
                      <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
                        {it.disputeStatus ? `Latest dispute note: ${it.disputeStatus}` : "No dispute note saved yet."}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Funding lanes</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                {selectedReport.contact ? `Planned for ${selectedReport.contact.name}` : "Planned from this report"}
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {opportunityPlans.map((plan) => (
                <div key={plan.key} className={"rounded-[26px] border bg-white p-5 shadow-sm " + readinessAccentClasses(plan.readinessTone)}>
                  <div>
                    <div className="text-base font-semibold text-zinc-900">{plan.title}</div>
                    <div className="mt-1 text-sm leading-6 text-zinc-700">{plan.summary}</div>
                    <div className="mt-4 border-t border-zinc-200 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{plan.readinessLabel}</div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {plan.offers.map((offer) => (
                      <a
                        key={offer.label}
                        href={offer.href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 hover:border-zinc-300 hover:bg-white"
                      >
                        <div className="text-sm font-semibold text-zinc-900">{offer.label}</div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{offer.source}</div>
                        <div className="mt-3 text-xs font-semibold text-brand-ink">View option →</div>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {showAdvancedImport ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-800">Raw JSON (dev)</summary>
              <pre className="scrollbar-none mt-2 max-h-105 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">{JSON.stringify(selectedReport.rawJson, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}
