"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IconFunnel } from "@/app/portal/PortalIcons";
import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import { PortalSearchableCombobox, type PortalSearchableOption } from "@/components/PortalSearchableCombobox";
import { useToast } from "@/components/ToastProvider";
import { creditScopeLabel, extractCreditInquiryDate, type CreditReportSnapshot, type CreditScope } from "@/lib/creditReports";

type ContactLite = { id: string; name: string; email: string | null };

type ReportLite = {
  id: string;
  provider: string;
  importedAt: string;
  createdAt: string;
  creditScope: CreditScope;
  contactId: string | null;
  contact: { id: string; name: string; email: string | null } | null;
  creditSnapshot?: CreditReportSnapshot;
  _count: { items: number };
};

type ReportItemLite = {
  id: string;
  bureau: string | null;
  kind: string | null;
  label: string;
  detailsJson?: unknown;
  auditTag: "PENDING" | "NEGATIVE" | "POSITIVE";
  auditReason?: string;
  disputeStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReportFull = ReportLite & {
  rawJson: any;
  creditSnapshot?: CreditReportSnapshot;
  items: ReportItemLite[];
};

type FundingOffer = {
  label: string;
  href?: string;
  source: string;
};

type OpportunityPlan = {
  key: string;
  title: string;
  readinessLabel: string;
  offers: FundingOffer[];
  summary: string;
};

type FixedMenuStyle = { left: number; top: number; maxHeight: number };

const REPORT_FILTER_LABELS: Record<"ALL" | "PENDING" | "NEGATIVE" | "POSITIVE" | "TRACKED", string> = {
  ALL: "All items",
  PENDING: "Needs review",
  NEGATIVE: "Needs dispute",
  POSITIVE: "Clean items",
  TRACKED: "Follow-up",
};

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

function itemSummaryText(item: ReportItemLite) {
  if (item.disputeStatus) return `Latest follow-up: ${item.disputeStatus}`;
  if (item.auditReason) return item.auditReason;
  if (item.auditTag === "NEGATIVE") return "This item is automatically flagged as a dispute priority.";
  if (item.auditTag === "PENDING") return "This item needs review before it should move into dispute.";
  return "This item is reading as clean right now.";
}

function formatReviewValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value.trim() || "-";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => formatReviewValue(entry))
      .filter((entry) => entry !== "-")
      .join(", ");
    return joined || "-";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function readReviewDetails(details: unknown): Array<{ key: string; value: string }> {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  return Object.entries(details as Record<string, unknown>)
    .map(([key, value]) => ({
      key: key.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      value: formatReviewValue(value),
    }))
    .filter((entry) => entry.value !== "-")
    .slice(0, 8);
}

function scoreTone(score: number | null) {
  if (score === null) return { label: "No score yet", accent: "#a1a1aa" };
  if (score >= 720) return { label: "Strong", accent: "#2563eb" };
  if (score >= 660) return { label: "Building", accent: "#fb7185" };
  return { label: "Needs work", accent: "#f97316" };
}

function ringTrack(segments: Array<{ value: number; color: string }>) {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0) || 1;
  let running = 0;
  const parts = segments.map((segment) => {
    const start = (running / total) * 360;
    running += Math.max(segment.value, 0);
    const end = (running / total) * 360;
    return `${segment.color} ${start}deg ${end}deg`;
  });
  return `conic-gradient(${parts.join(", ")})`;
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

const BUTTON_MOTION_CLASS = "transition-colors duration-150 focus-visible:outline-none";
const PRIMARY_BUTTON_CLASS = `${BUTTON_MOTION_CLASS} rounded-2xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 focus-visible:ring-2 focus-visible:ring-brand-blue/30 disabled:opacity-60`;
const SECONDARY_BUTTON_CLASS = `${BUTTON_MOTION_CLASS} rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-brand-blue/20 disabled:opacity-60`;
const ICON_BUTTON_CLASS = "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-base font-semibold text-zinc-500 transition-colors duration-150 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20 disabled:opacity-60";

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

function buildOpportunityPlans(
  summary: { pending: number; negative: number; positive: number; tracked: number },
  creditScope: CreditScope,
  snapshot: CreditReportSnapshot | null,
): OpportunityPlan[] {
  const currentScore = snapshot?.currentScore ?? null;
  const scoreGap = snapshot?.scoreDelta ?? null;
  const utilization = snapshot?.utilizationPercent ?? null;
  const goalHint = snapshot?.goals?.[0] || "Protect score gains and stay selective.";
  const cleanupHeavy = summary.negative >= 2 || summary.pending >= 2;
  const fundingReady = currentScore !== null && currentScore >= 680 && summary.negative <= 1 && summary.pending <= 1;

  return [
    {
      key: "funding-lane",
      title: creditScope === "BUSINESS" ? "Business funding lane" : creditScope === "BOTH" ? "Funding lane" : "Personal funding lane",
      readinessLabel: fundingReady ? "Ready to shortlist options" : "Not ready for a broad application push",
      offers: fundingReady
        ? creditScope === "BUSINESS"
          ? [
              { label: "Amex Blue Business Cash", source: "American Express" },
              { label: "Capital on Tap", source: "Capital on Tap" },
            ]
          : [
              { label: "Upgrade Personal Loan", source: "Upgrade" },
              { label: "LendingClub Personal Loan", source: "LendingClub" },
            ]
        : [
            { label: `Score gap ${scoreGap ?? 0} points`, source: "Current" },
            { label: `${summary.negative} dispute priorities`, source: "Cleanup" },
          ],
      summary: fundingReady
        ? "Applications should stay selective and matched to the score band so the file keeps moving forward."
        : snapshot?.nextMilestone || "Do not widen applications yet. Clean the file and close the score gap first.",
    },
    {
      key: "card-lane",
      title: creditScope === "BUSINESS" ? "Business cards" : creditScope === "BOTH" ? "Card lane" : "Personal cards",
      readinessLabel: utilization !== null && utilization <= 10 && !cleanupHeavy ? "Cards can support the file" : "Keep cards tight right now",
      offers: creditScope === "BUSINESS"
        ? [
            { label: fundingReady ? "Amex Blue Business Cash" : "Nav Prime / vendor lines first", source: fundingReady ? "Business card" : "Build" },
            { label: fundingReady ? "Capital on Tap" : "Keep utilization under 10%", source: fundingReady ? "Business card" : "Score" },
          ]
        : [
            { label: fundingReady ? "One personal card only" : "Wait on new cards until cleanup lands", source: fundingReady ? "Discipline" : "Hold" },
            { label: utilization !== null ? `Utilization ${utilization}%` : "Utilization pending", source: "Revolving" },
          ],
      summary: cleanupHeavy
        ? "Review items and dispute priorities still come first. Add cards only when the file stops leaking points."
        : goalHint,
    },
  ];
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
  const [itemDecisionBusyId, setItemDecisionBusyId] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState("");
  const [reportFiltersMenu, setReportFiltersMenu] = useState<FixedMenuStyle | null>(null);
  const [reportView, setReportView] = useState<"ALL" | "PERSONAL" | "BUSINESS" | "BOTH">("ALL");
  const [providerFilter, setProviderFilter] = useState<string>("ALL");

  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  const [provider, setProvider] = useState<string>("IdentityIQ");
  const [creditScope] = useState<CreditScope>("PERSONAL");
  const [itemFilter, setItemFilter] = useState<"ALL" | "PENDING" | "NEGATIVE" | "POSITIVE" | "TRACKED">("ALL");
  const [itemFiltersMenu, setItemFiltersMenu] = useState<FixedMenuStyle | null>(null);
  const [itemQuery, setItemQuery] = useState("");
  const [rawText, setRawText] = useState<string>("{");
  const showAdvancedImport = false;

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
    () => buildOpportunityPlans(selectedReportSummary, selectedReport?.creditScope || creditScope, selectedReport?.creditSnapshot || null),
    [creditScope, selectedReport, selectedReportSummary],
  );
  const overviewRingStyle = useMemo(
    () => ({
      backgroundImage: ringTrack([
        { value: selectedReportSummary.negative, color: "#fb7185" },
        { value: selectedReportSummary.pending, color: "#2563eb" },
        { value: selectedReportSummary.positive, color: "#d4d4d8" },
      ]),
    }),
    [selectedReportSummary],
  );

  useEffect(() => {
    if (!initialReportId) return;
    setSelectedReportId(initialReportId);
  }, [initialReportId]);

  useEffect(() => {
    setDetailTab("items");
    setPriorityItemOpen(null);
  }, [selectedReportId]);

  useEffect(() => {
    if (!reportFiltersMenu) return;
    const close = () => setReportFiltersMenu(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [reportFiltersMenu]);

  useEffect(() => {
    if (!itemFiltersMenu) return;
    const close = () => setItemFiltersMenu(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [itemFiltersMenu]);

  useEffect(() => {
    const query = (searchParams.get("contact") || "").trim();
    if (!query) return;
    setContactQuery(query);
  }, [searchParams]);

  useEffect(() => {
    const normalized = contactQuery.trim().toLowerCase();
    if (!normalized) return;
    const match =
      contactSuggestions.find((entry) => entry.label.toLowerCase() === normalized) ||
      contactSuggestions.find((entry) => entry.label.toLowerCase().startsWith(normalized));
    if (match) setSelectedContactId(match.id);
  }, [contactQuery, contactSuggestions]);

  const importReport = async () => {
    setBusy(true);
    setError(null);
    try {
      const rawJson = JSON.parse(rawText);
      const json = await fetchJson<{ ok: true; report: ReportLite }>("/api/portal/credit/reports/import", {
        method: "POST",
        body: JSON.stringify({
          contactId: selectedContactId || undefined,
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

  const openDisputeComposer = useCallback((item: ReportItemLite) => {
    if (!selectedReport) return;
    const params = new URLSearchParams();
    if (selectedReport.contactId) params.set("contactId", selectedReport.contactId);
    params.set("reportId", selectedReport.id);
    params.set("itemId", item.id);
    params.set("compose", "1");
    const inquiryDate = extractCreditInquiryDate(item.detailsJson);
    params.set("issue", inquiryDate ? `${item.label} (Inquiry date: ${inquiryDate})` : item.label);
    if (item.bureau) params.set("bureau", item.bureau);
    window.location.href = `${routeSet.disputeHref}?${params.toString()}`;
  }, [routeSet.disputeHref, selectedReport]);

  const updateReportItemDecision = useCallback(async (
    item: ReportItemLite,
    next: { auditTag?: "PENDING" | "NEGATIVE" | "POSITIVE"; disputeStatus?: string | null },
  ) => {
    if (!selectedReportId) return;
    setItemDecisionBusyId(item.id);
    setError(null);
    try {
      await fetchJson<{ ok: true; item: ReportItemLite }>(`/api/portal/credit/reports/${encodeURIComponent(selectedReportId)}/items/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      await loadReport(selectedReportId);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Unable to update item");
      throw e;
    } finally {
      setItemDecisionBusyId(null);
    }
  }, [loadReport, selectedReportId]);

  const markItemNoDisputeNeeded = useCallback(async (item: ReportItemLite) => {
    await updateReportItemDecision(item, { auditTag: "POSITIVE", disputeStatus: null });
    setPriorityItemOpen(null);
    toast.success("Item marked as no dispute needed.");
  }, [toast, updateReportItemDecision]);

  const moveItemToDispute = useCallback(async (item: ReportItemLite) => {
    await updateReportItemDecision(item, { auditTag: "NEGATIVE", disputeStatus: null });
    openDisputeComposer({ ...item, auditTag: "NEGATIVE", disputeStatus: null });
  }, [openDisputeComposer, updateReportItemDecision]);

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
            className="group inline-flex items-center gap-2 text-sm font-semibold text-brand-ink transition-colors duration-150 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20"
          >
            <span className="inline-flex items-center justify-center text-zinc-700 transition-colors duration-150 group-hover:text-zinc-900">
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

            <div className="mt-3 flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={reportSearch}
                onChange={(event) => setReportSearch(event.target.value)}
                className="h-11 w-full rounded-full border border-zinc-200 px-4 text-sm outline-none transition focus:border-zinc-300 focus-visible:ring-2 focus-visible:ring-brand-blue/20 sm:flex-1"
                placeholder="Search reports"
              />
              {reportFiltersMenu ? (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onMouseDown={() => setReportFiltersMenu(null)}
                    onTouchStart={() => setReportFiltersMenu(null)}
                    aria-hidden
                  />
                  <div
                    className="fixed z-40 w-72 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-xl"
                    style={{ left: reportFiltersMenu.left, top: reportFiltersMenu.top, maxHeight: reportFiltersMenu.maxHeight }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onTouchStart={(event) => event.stopPropagation()}
                  >
                    <div className="border-b border-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-600">Filters</div>
                    <div className="px-4 py-3">
                      <div className="text-xs font-semibold text-zinc-700">Report type</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {([
                          ["ALL", `All ${reports.length}`],
                          ["PERSONAL", `Personal ${reportScopeCounts.personal}`],
                          ["BUSINESS", `Business ${reportScopeCounts.business}`],
                          ["BOTH", `Combined ${reportScopeCounts.both}`],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            className={classNames(
                              "rounded-xl border px-3 py-2 text-left text-xs font-semibold",
                              reportView === value
                                ? "border-brand-ink bg-brand-ink text-white"
                                : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                            )}
                            onClick={() => setReportView(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-4 text-xs font-semibold text-zinc-700">Provider</div>
                      <div className="mt-2">
                        <PortalListboxDropdown
                          value={providerFilter}
                          onChange={setProviderFilter}
                          options={providerFilterOptions}
                          buttonClassName="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-sm transition-all duration-150 hover:border-zinc-300 hover:bg-zinc-50"
                        />
                      </div>

                      {(reportView !== "ALL" || providerFilter !== "ALL") ? (
                        <button
                          type="button"
                          className="mt-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                          onClick={() => {
                            setReportView("ALL");
                            setProviderFilter("ALL");
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
                  "inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 transition-colors duration-150 hover:bg-zinc-50",
                  (reportView !== "ALL" || providerFilter !== "ALL") && "border-brand-ink",
                )}
                onClick={(event) => {
                  const open = Boolean(reportFiltersMenu);
                  if (open) {
                    setReportFiltersMenu(null);
                    return;
                  }
                  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                  setReportFiltersMenu(computeFixedMenuStyle(rect));
                }}
                aria-label="Report filters"
                aria-expanded={reportFiltersMenu ? true : undefined}
              >
                <IconFunnel size={18} />
              </button>
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
                      buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm transition-colors duration-150 hover:border-zinc-300 hover:bg-zinc-50"
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

            <div className="mt-5 grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
              <div className="rounded-[28px] border border-zinc-200 bg-zinc-50 p-5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Report health</div>
                <div className="mt-4 flex items-center gap-4">
                  <div className="relative h-28 w-28 rounded-full" style={overviewRingStyle}>
                    <div className="absolute inset-3 flex items-center justify-center rounded-full bg-white text-center">
                      <div>
                        <div className="text-2xl font-bold text-zinc-900">{selectedReport.items.length}</div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Items</div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-zinc-700">
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-brand-pink" />Needs dispute: {selectedReportSummary.negative}</div>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />Needs review: {selectedReportSummary.pending}</div>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />Clean items: {selectedReportSummary.positive}</div>
                    <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-zinc-800" />Open disputes: {selectedReport.creditSnapshot?.openDisputes ?? selectedReportSummary.tracked}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Current score</div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="text-3xl font-bold text-zinc-900">{selectedReport.creditSnapshot?.currentScore ?? "--"}</div>
                    <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: scoreTone(selectedReport.creditSnapshot?.currentScore ?? null).accent }}>{scoreTone(selectedReport.creditSnapshot?.currentScore ?? null).label}</div>
                  </div>
                </div>
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Target score</div>
                  <div className="mt-2 text-3xl font-bold text-zinc-900">{selectedReport.creditSnapshot?.targetScore ?? "--"}</div>
                  <div className="mt-1 text-xs text-zinc-500">Gap: {selectedReport.creditSnapshot?.scoreDelta ?? 0}</div>
                </div>
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Utilization</div>
                  <div className="mt-2 text-3xl font-bold text-zinc-900">{selectedReport.creditSnapshot?.utilizationPercent ?? 0}%</div>
                  <div className="mt-1 text-xs text-zinc-500">Keep this under 10% if possible</div>
                </div>
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Primary goal</div>
                  <div className="mt-2 text-sm font-semibold text-zinc-900">{selectedReport.creditSnapshot?.goals?.[0] || "Set a score and funding goal"}</div>
                  <div className="mt-1 text-xs text-zinc-500">{selectedReport.creditSnapshot?.nextMilestone || "Use this report to drive the next action."}</div>
                </div>
              </div>
            </div>
            {selectedReport.creditSnapshot?.bureauScores?.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {selectedReport.creditSnapshot.bureauScores.map((entry) => {
                  const ringPercent = Math.max(0, Math.min(100, Math.round(((entry.score - 300) / 550) * 100)));
                  return (
                    <div key={entry.bureau} className="rounded-3xl border border-zinc-200 bg-white p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{entry.bureau}</div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="relative h-16 w-16 rounded-full" style={{ backgroundImage: ringTrack([{ value: ringPercent, color: "#2563eb" }, { value: 100 - ringPercent, color: "#e4e4e7" }]) }}>
                          <div className="absolute inset-2 flex items-center justify-center rounded-full bg-white text-sm font-semibold text-zinc-900">{entry.score}</div>
                        </div>
                        <div className="text-sm text-zinc-600">Auto-loaded bureau score for this report snapshot.</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {selectedReport.creditSnapshot?.goals?.length ? (
              <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Goals</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedReport.creditSnapshot.goals.map((goal) => (
                    <div key={goal} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800">{goal}</div>
                  ))}
                </div>
              </div>
            ) : null}
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
                  className="h-11 w-full rounded-full border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-zinc-300 focus-visible:ring-2 focus-visible:ring-brand-blue/20 sm:w-56"
                  placeholder="Search items"
                />
                {itemFiltersMenu ? (
                  <>
                    <div className="fixed inset-0 z-30" onMouseDown={() => setItemFiltersMenu(null)} onTouchStart={() => setItemFiltersMenu(null)} aria-hidden />
                    <div
                      className="fixed z-40 w-72 overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-xl"
                      style={{ left: itemFiltersMenu.left, top: itemFiltersMenu.top, maxHeight: itemFiltersMenu.maxHeight }}
                      onMouseDown={(event) => event.stopPropagation()}
                      onTouchStart={(event) => event.stopPropagation()}
                    >
                      <div className="border-b border-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-600">Filters</div>
                      <div className="px-4 py-3">
                        <div className="text-xs font-semibold text-zinc-700">Report items</div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {([
                            ["ALL", `All ${selectedReport.items.length}`],
                            ["PENDING", `${REPORT_FILTER_LABELS.PENDING} ${selectedReportSummary.pending}`],
                            ["NEGATIVE", `${REPORT_FILTER_LABELS.NEGATIVE} ${selectedReportSummary.negative}`],
                            ["POSITIVE", `Positive ${selectedReportSummary.positive}`],
                            ["TRACKED", `${REPORT_FILTER_LABELS.TRACKED} ${selectedReportSummary.tracked}`],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              className={classNames(
                                "rounded-xl border px-3 py-2 text-left text-xs font-semibold",
                                itemFilter === value
                                  ? "border-brand-ink bg-brand-ink text-white"
                                  : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                              )}
                              onClick={() => setItemFilter(value)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {itemFilter !== "ALL" ? (
                          <button
                            type="button"
                            className="mt-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                            onClick={() => setItemFilter("ALL")}
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
                    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 transition-colors duration-150 hover:bg-zinc-50",
                    itemFilter !== "ALL" && "border-brand-ink",
                  )}
                  onClick={(event) => {
                    const open = Boolean(itemFiltersMenu);
                    if (open) {
                      setItemFiltersMenu(null);
                      return;
                    }
                    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                    setItemFiltersMenu(computeFixedMenuStyle(rect));
                  }}
                  aria-label="Item filters"
                  aria-expanded={itemFiltersMenu ? true : undefined}
                >
                  <IconFunnel size={18} />
                </button>
                <div className="text-xs text-zinc-500">{filteredItems.length} shown</div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {filteredItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">No matching items.</div>
              ) : (
                filteredItems.map((it) => (
                  <div key={it.id} className="rounded-[26px] border border-zinc-200 bg-white p-4 transition-colors duration-150 hover:border-zinc-300">
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
                          <div className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">{REPORT_FILTER_LABELS[it.auditTag]}</div>
                        </div>
                        <div className="text-xs text-zinc-500">{it.auditReason || itemSummaryText(it)}</div>
                      </button>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-zinc-600">
                          {itemSummaryText(it)}
                        </div>
                        {it.auditTag === "NEGATIVE" ? (
                          <button
                            type="button"
                            onClick={() => openDisputeComposer(it)}
                            className={PRIMARY_BUTTON_CLASS}
                          >
                            Create dispute
                          </button>
                        ) : it.auditTag === "PENDING" ? (
                          <button type="button" onClick={() => setPriorityItemOpen(it)} className={SECONDARY_BUTTON_CLASS}>Review item</button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Automatic classification</div>
                        <div className="mt-2 text-sm font-semibold text-zinc-900">{REPORT_FILTER_LABELS[it.auditTag]}</div>
                        <div className="mt-1 text-sm text-zinc-600">{it.auditTag === "PENDING" ? "Review the item details, then either move it to dispute or mark that no dispute is needed." : it.auditReason || "Classification is derived from the account status and dispute signals in the report."}</div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Dispute status</div>
                        <div className="mt-2 text-sm text-zinc-700">{it.disputeStatus || "No dispute started yet"}</div>
                      </div>
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
                <div className="text-sm font-semibold text-zinc-900">Action plan</div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {opportunityPlans.map((plan) => (
                <div key={plan.key} className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm transition-shadow duration-150 hover:shadow-md">
                  <div>
                    <div className="text-base font-semibold text-zinc-900">{plan.title}</div>
                    <div className="mt-1 text-sm leading-6 text-zinc-700">{plan.summary}</div>
                    <div className="mt-4 border-t border-zinc-200 pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{plan.readinessLabel}</div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {plan.offers.map((offer) => (
                      <div key={offer.label} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                        <div className="text-sm font-semibold text-zinc-900">{offer.label}</div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{offer.source}</div>
                      </div>
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

                <div className="mt-5 space-y-3 text-sm text-zinc-700">
                  <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <div>{REPORT_FILTER_LABELS[priorityItemOpen.auditTag]}</div>
                    <div>{priorityItemOpen.bureau || "No bureau"}</div>
                    <div>{priorityItemOpen.kind || "Uncategorized"}</div>
                    {priorityItemOpen.disputeStatus ? <div className="normal-case tracking-normal text-zinc-600">{priorityItemOpen.disputeStatus}</div> : null}
                  </div>
                  <div>{priorityItemOpen.auditReason || itemSummaryText(priorityItemOpen)}</div>
                  {priorityItemOpen.auditTag === "PENDING" ? (
                    <div>Review the details below. If it belongs in the next letter, move it to dispute.</div>
                  ) : null}
                </div>

                <div className="mt-5 rounded-3xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Item details</div>
                    <div className="text-xs text-zinc-500">Updated {new Date(priorityItemOpen.updatedAt).toLocaleString()}</div>
                  </div>

                  {readReviewDetails(priorityItemOpen.detailsJson).length ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {readReviewDetails(priorityItemOpen.detailsJson).map((entry) => (
                        <div key={entry.key} className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{entry.key}</div>
                          <div className="mt-2 text-sm text-zinc-800 wrap-break-word">{entry.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm text-zinc-600">
                      This item does not have extra imported detail fields on file yet. Use the details above to decide whether it should move into dispute.
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  {priorityItemOpen.auditTag === "NEGATIVE" ? (
                    <button type="button" onClick={() => {
                      openDisputeComposer(priorityItemOpen);
                    }} className={PRIMARY_BUTTON_CLASS}>Create dispute</button>
                  ) : priorityItemOpen.auditTag === "PENDING" ? (
                    <>
                      <button type="button" onClick={() => { void markItemNoDisputeNeeded(priorityItemOpen); }} className={SECONDARY_BUTTON_CLASS} disabled={itemDecisionBusyId === priorityItemOpen.id}>{itemDecisionBusyId === priorityItemOpen.id ? "Saving..." : "No dispute needed"}</button>
                      <button type="button" onClick={() => { void moveItemToDispute(priorityItemOpen); }} className={PRIMARY_BUTTON_CLASS} disabled={itemDecisionBusyId === priorityItemOpen.id}>{itemDecisionBusyId === priorityItemOpen.id ? "Saving..." : "Move to dispute"}</button>
                    </>
                  ) : null}
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
