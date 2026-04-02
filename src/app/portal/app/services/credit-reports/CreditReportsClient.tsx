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
  offers: FundingOffer[];
  summary: string;
};

const REPORT_FILTER_LABELS: Record<"ALL" | "PENDING" | "NEGATIVE" | "POSITIVE" | "TRACKED", string> = {
  ALL: "All items",
  PENDING: "Review now",
  NEGATIVE: "Needs dispute",
  POSITIVE: "Looks good",
  TRACKED: "Follow-up",
};

function creditScopeLabel(scope: CreditScope) {
  if (scope === "BUSINESS") return "Business credit";
  if (scope === "BOTH") return "Personal + business credit";
  return "Personal credit";
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function scoreReportItem(item: ReportItemLite) {
  let total = 0;
  if (item.auditTag === "NEGATIVE") total += 30;
  if (item.auditTag === "PENDING") total += 20;
  if (String(item.disputeStatus || "").trim()) total += 10;
  if (item.bureau) total += 3;
  return total;
}

function itemActionHint(item: ReportItemLite) {
  if (item.auditTag === "NEGATIVE") return "Click to create dispute →";
  if (item.auditTag === "PENDING") return "Click to review item →";
  return "Click to open item →";
}

function itemSummaryText(item: ReportItemLite) {
  if (item.disputeStatus) return `Latest follow-up: ${item.disputeStatus}`;
  if (item.auditTag === "NEGATIVE") return "This item is ready to move into a dispute.";
  if (item.auditTag === "PENDING") return "Open the item, confirm the details, and decide the next move.";
  return "Keep this item clean while the rest of the report gets worked.";
}

const BUTTON_MOTION_CLASS = "transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-none";
const PRIMARY_BUTTON_CLASS = `${BUTTON_MOTION_CLASS} rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:opacity-60`;
const SECONDARY_BUTTON_CLASS = `${BUTTON_MOTION_CLASS} rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-brand-blue/20 disabled:opacity-60`;
const ICON_BUTTON_CLASS = "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-500 transition-all duration-150 hover:-translate-y-0.5 hover:scale-105 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20 disabled:opacity-60";

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
    title: "Business options",
    readinessLabel: isCleanEnoughForOffers ? "Shortlist business options" : "Build the file before applying",
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
      : "Stay in build mode until the report has fewer unresolved negatives and less review work, then reopen business options.",
  };

  const personalFunding: OpportunityPlan = {
    key: "personal-funding",
    title: "Personal options",
    readinessLabel: isCleanEnoughForOffers ? "Shortlist personal options" : "Hold off until cleanup lands",
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
      ? "Personal options are reasonable if utilization stays controlled and applications stay selective."
      : "Treat personal applications as phase two. Clean the report first so the file is not taking unnecessary new hits.",
  };

  const creditCards: OpportunityPlan = {
    key: "credit-cards",
    title: creditScope === "BUSINESS" ? "Business credit cards" : creditScope === "PERSONAL" ? "Personal credit cards" : "Credit cards",
    readinessLabel: hasUtilizationSignals || isCleanEnoughForOffers ? "Use cards carefully" : "Start with rebuild cards",
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
    key: "monitoring",
    title: "Monitoring",
    readinessLabel: isStillRepairHeavy ? "Stay in repair mode" : "Keep monitoring live",
    offers: isStillRepairHeavy
      ? [
          { label: "Experian Dispute Center", href: "https://www.experian.com/disputes/main.html", source: "Experian" },
          { label: "Equifax Dispute Portal", href: "https://www.equifax.com/personal/credit-report-services/credit-dispute/", source: "Equifax" },
          { label: "TransUnion Dispute Center", href: "https://dispute.transunion.com/", source: "TransUnion" },
          { label: "AnnualCreditReport", href: "https://www.annualcreditreport.com/", source: "Bureau refresh" },
        ]
      : [
          { label: "AnnualCreditReport", href: "https://www.annualcreditreport.com/", source: "Monitoring" },
          { label: "Experian Account", href: "https://www.experian.com/", source: "Experian" },
          { label: "Equifax Account", href: "https://www.equifax.com/", source: "Equifax" },
          { label: "TransUnion Account", href: "https://www.transunion.com/", source: "TransUnion" },
        ],
    summary: isStillRepairHeavy
      ? "The report still needs cleanup, follow-up, and bureau monitoring before bigger applications should take the lead."
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedReportIdsRef = useRef<string[]>([]);

  const [reports, setReports] = useState<ReportLite[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>(initialReportId);
  const [selectedReport, setSelectedReport] = useState<ReportFull | null>(null);
  const [newReportOpen, setNewReportOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"items" | "plan">("items");
  const [priorityItemOpen, setPriorityItemOpen] = useState<ReportItemLite | null>(null);
  const [reportSearch, setReportSearch] = useState("");
  const [reportView, setReportView] = useState<"ALL" | "PERSONAL" | "BUSINESS" | "BOTH">("ALL");
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
    setLoading(true);
    void (async () => {
      try {
        await Promise.all([loadReports(), loadContacts("")]);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ? String(e.message) : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
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
      if (reportView !== "ALL" && report.creditScope !== reportView) return false;
      if (providerFilter !== "ALL" && report.provider !== providerFilter) return false;
      if (!query) return true;
      const haystack = [report.contact?.name, report.contact?.email, report.provider, report.creditScope]
        .map((part) => String(part || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [providerFilter, reportSearch, reportView, reports]);
  const reportScopeCounts = useMemo(() => ({
    personal: reports.filter((report) => report.creditScope === "PERSONAL").length,
    business: reports.filter((report) => report.creditScope === "BUSINESS").length,
    both: reports.filter((report) => report.creditScope === "BOTH").length,
  }), [reports]);
  const selectedReportSummary = useMemo(() => {
    const items = selectedReport?.items || [];
    const pending = items.filter((item) => item.auditTag === "PENDING").length;
    const negative = items.filter((item) => item.auditTag === "NEGATIVE").length;
    const positive = items.filter((item) => item.auditTag === "POSITIVE").length;
    const tracked = items.filter((item) => String(item.disputeStatus || "").trim().length > 0).length;
    return { pending, negative, positive, tracked };
  }, [selectedReport]);
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
    }).sort((a, b) => scoreReportItem(b) - scoreReportItem(a) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [itemFilter, itemQuery, selectedReport]);
  const opportunityPlans = useMemo(
    () => buildOpportunityPlans(selectedReport, selectedReportSummary, selectedReport?.creditScope || creditScope),
    [creditScope, selectedReport, selectedReportSummary],
  );
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
  useEffect(() => {
    if (!initialReportId) return;
    setSelectedReportId(initialReportId);
  }, [initialReportId]);

  useEffect(() => {
    setDetailTab("items");
    setPriorityItemOpen(null);
  }, [selectedReportId]);

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
            {mode === "detail" ? "Review the report, update item tags, and move straight into disputes." : "Pull reports, keep the file queue organized, and open the detail view when you need to work items."}
          </p>
        </div>
        {mode === "detail" ? (
          <button
            type="button"
            onClick={() => {
              window.location.href = routeSet.listHref;
            }}
            className="group inline-flex items-center gap-2 text-sm font-semibold text-brand-ink transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20"
          >
            <span className="inline-flex items-center justify-center text-zinc-700 transition-all duration-150 group-hover:-translate-x-0.5 group-hover:text-zinc-900">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.5 4.5 7 10l5.5 5.5" />
              </svg>
            </span>
            <span>Back to reports</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{reports.length} saved</div>
            <button
              type="button"
              onClick={() => setNewReportOpen(true)}
              className={PRIMARY_BUTTON_CLASS}
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
              <div>
                <div className="text-sm font-semibold text-zinc-900">Report queue</div>
                <div className="mt-1 text-sm text-zinc-600">Search by contact or provider, then open the report to work its items.</div>
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{loading ? "Loading" : `${filteredReports.length} reports`}</div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {([
                ["ALL", `All ${reports.length}`],
                ["PERSONAL", `Personal ${reportScopeCounts.personal}`],
                ["BUSINESS", `Business ${reportScopeCounts.business}`],
                ["BOTH", `Combined ${reportScopeCounts.both}`],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReportView(value)}
                  aria-current={reportView === value ? "page" : undefined}
                  className={classNames(
                    "h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/60",
                    reportView === value
                      ? "border-brand-ink bg-brand-ink text-white shadow-sm focus-visible:ring-brand-ink/40"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={reportSearch}
                onChange={(event) => setReportSearch(event.target.value)}
                className="h-11 w-full rounded-full border border-zinc-200 px-4 text-sm outline-none transition focus:border-zinc-300 focus-visible:ring-2 focus-visible:ring-brand-blue/20 sm:flex-1"
                placeholder="Search reports"
              />
              <div className="w-full sm:w-60">
                <PortalListboxDropdown
                  value={providerFilter}
                  onChange={setProviderFilter}
                  options={providerFilterOptions}
                  buttonClassName="flex h-11 w-full items-center justify-between gap-2 rounded-full border border-zinc-200 bg-white px-4 text-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                />
              </div>
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
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-zinc-600">Loading reports...</td>
                    </tr>
                  ) : filteredReports.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10">
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center">
                          <div className="text-base font-semibold text-zinc-900">No reports in this view</div>
                          <div className="mt-2 max-w-md text-sm text-zinc-600">
                            {reports.length === 0 ? "Start by pulling the first report for a contact." : "Try a different provider filter or search term."}
                          </div>
                          <button
                            type="button"
                            onClick={() => setNewReportOpen(true)}
                            className={PRIMARY_BUTTON_CLASS + " mt-4"}
                          >
                            + New report
                          </button>
                        </div>
                      </td>
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
                        className="cursor-pointer border-t border-zinc-200 transition hover:bg-zinc-50 focus:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/20"
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-zinc-900">{report.contact?.name || report.provider}</div>
                          <div className="mt-1 text-xs font-medium text-zinc-500">{creditScopeLabel(report.creditScope)}</div>
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
                          <div className="mt-1 text-xs text-zinc-400">Open report</div>
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
                    <div className="mt-1 text-sm text-zinc-600">Choose the contact and provider, then pull the latest report into the queue.</div>
                  </div>
                  <button type="button" onClick={() => setNewReportOpen(false)} aria-label="Close new report" className={ICON_BUTTON_CLASS}>×</button>
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
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                    />
                  </label>

                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Selection</div>
                    <div className="mt-2 font-semibold text-zinc-900">{selectedContact?.name || "No contact selected"}</div>
                    <div className="mt-1 text-xs text-zinc-500">{selectedContact?.email || provider}</div>
                  </div>

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
                          className={SECONDARY_BUTTON_CLASS + " text-zinc-900"}
                        >
                          {busy ? "Working..." : "Import report"}
                        </button>
                      </div>
                    </details>
                  ) : null}
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" onClick={() => setNewReportOpen(false)} className={SECONDARY_BUTTON_CLASS}>Cancel</button>
                  <button type="button" disabled={busy || !selectedContactId} onClick={requestProviderPull} className={PRIMARY_BUTTON_CLASS}>{busy ? "Working..." : "Pull report"}</button>
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
            <div>
              <h2 className="text-2xl font-semibold text-zinc-900">{selectedReport.contact?.name || selectedReport.provider}</h2>
              <div className="mt-2 text-sm text-zinc-600">{creditScopeLabel(selectedReport.creditScope)} • {selectedReport.provider} • Imported {new Date(selectedReport.importedAt).toLocaleString()} • {selectedReport.items.length} items</div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {([
                ["items", "Items"],
                ["plan", "Plan"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDetailTab(value)}
                  className={classNames(
                    "rounded-2xl px-4 py-2 text-sm font-semibold",
                    BUTTON_MOTION_CLASS,
                    detailTab === value
                      ? "bg-brand-blue text-white shadow-sm focus-visible:ring-2 focus-visible:ring-brand-blue/30"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-brand-blue/20",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Needs dispute</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{selectedReportSummary.negative}</div>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Review now</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{selectedReportSummary.pending}</div>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Looks good</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{selectedReportSummary.positive}</div>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">All items</div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{selectedReport.items.length}</div>
              </div>
            </div>
            {detailTab === "items" ? (
            <div id="credit-report-items" className="mt-5 border-t border-zinc-200 pt-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Report items</div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-300 focus-visible:ring-2 focus-visible:ring-brand-blue/20 sm:w-56"
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
                  buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 sm:w-52"
                />
                <div className="text-xs text-zinc-500">{filteredItems.length} shown</div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {filteredItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">No matching items.</div>
              ) : (
                filteredItems.map((it) => (
                  <div key={it.id} className="rounded-[26px] border border-zinc-200 bg-white p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300">
                    <div className="flex flex-col gap-4">
                      <button
                        type="button"
                        onClick={() => setPriorityItemOpen(it)}
                        className="flex w-full flex-col gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-zinc-900">{it.label}</div>
                            <div className="mt-1 text-xs text-zinc-500">{(it.bureau ? `${it.bureau} • ` : "") + (it.kind || "Uncategorized")}</div>
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{REPORT_FILTER_LABELS[it.auditTag]}</div>
                        </div>
                        <div className="text-xs font-semibold text-brand-ink">{itemActionHint(it)}</div>
                      </button>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-zinc-600">
                          {itemSummaryText(it)}
                        </div>
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
                          className={PRIMARY_BUTTON_CLASS}
                        >
                          Create dispute
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
                      <label className="block">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Classification</div>
                        <PortalListboxDropdown
                          value={it.auditTag}
                          onChange={(v) => updateItem(it.id, { auditTag: v })}
                          disabled={busy}
                          buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50"
                          options={(
                            [
                              { value: "PENDING", label: REPORT_FILTER_LABELS.PENDING },
                              { value: "NEGATIVE", label: REPORT_FILTER_LABELS.NEGATIVE },
                              { value: "POSITIVE", label: REPORT_FILTER_LABELS.POSITIVE },
                            ] as PortalListboxOption<ReportItemLite["auditTag"]>[]
                          )}
                        />
                      </label>
                      {it.disputeStatus ? (
                        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                          {it.disputeStatus}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
            </div>
            ) : null}

            {detailTab === "plan" ? (
            <div className="mt-5 border-t border-zinc-200 pt-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Application plan</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {opportunityPlans.map((plan) => (
                <div key={plan.key} className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
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
                        className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-white"
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
            </div>
            ) : null}
          </section>

          {priorityItemOpen ? (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4" onMouseDown={() => setPriorityItemOpen(null)}>
              <div className="my-auto w-full max-w-2xl rounded-4xl border border-zinc-200 bg-white p-6 shadow-xl sm:p-7" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Report item actions" data-overlay-root="true">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-zinc-900">{priorityItemOpen.label}</div>
                    <div className="mt-1 text-sm text-zinc-600">{[priorityItemOpen.bureau, priorityItemOpen.kind].filter(Boolean).join(" • ") || "Uncategorized"}</div>
                  </div>
                  <button type="button" onClick={() => setPriorityItemOpen(null)} aria-label="Close priority item" className={ICON_BUTTON_CLASS}>×</button>
                </div>

                <div className="mt-5 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <div>{REPORT_FILTER_LABELS[priorityItemOpen.auditTag]}</div>
                    {priorityItemOpen.disputeStatus ? <div className="normal-case tracking-normal text-zinc-600">{priorityItemOpen.disputeStatus}</div> : null}
                  </div>
                  <div className="mt-3 text-sm text-zinc-700">
                    {itemSummaryText(priorityItemOpen)}
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setPriorityItemOpen(null)} className={SECONDARY_BUTTON_CLASS}>Done</button>
                  <button type="button" onClick={() => {
                    const params = new URLSearchParams();
                    if (selectedReport?.contactId) params.set("contactId", selectedReport.contactId);
                    params.set("compose", "1");
                    params.set("issue", priorityItemOpen.label);
                    if (priorityItemOpen.bureau) params.set("bureau", priorityItemOpen.bureau);
                    window.location.href = `${routeSet.disputeHref}?${params.toString()}`;
                  }} className={PRIMARY_BUTTON_CLASS}>Create dispute</button>
                </div>
              </div>
            </div>
          ) : null}

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
