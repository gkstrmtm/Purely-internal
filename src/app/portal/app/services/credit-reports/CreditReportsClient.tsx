"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IconFunnel } from "@/app/portal/PortalIcons";
import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";
import { PortalSearchableCombobox, type PortalSearchableOption } from "@/components/PortalSearchableCombobox";
import { useToast } from "@/components/ToastProvider";
import { creditScopeLabel, extractCreditInquiryDate, extractCreditReportSourceSummary, type CreditReportSnapshot, type CreditScope } from "@/lib/creditReports";

type ContactLite = { id: string; name: string; email: string | null };

type ReportLite = {
  id: string;
  provider: string;
  importedAt: string;
  createdAt: string;
  creditScope: CreditScope;
  rawJson?: unknown;
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

type PortalMeResponse =
  | {
      ok: true;
      role: "OWNER" | "ADMIN" | "MEMBER";
    }
  | {
      ok: false;
      error?: string;
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

function reportItemTone(auditTag: ReportItemLite["auditTag"]) {
  switch (auditTag) {
    case "NEGATIVE":
      return { accent: "#fb7185", tint: "#fff1f2" };
    case "PENDING":
      return { accent: "#2563eb", tint: "#eff6ff" };
    case "POSITIVE":
    default:
      return { accent: "#a1a1aa", tint: "#f4f4f5" };
  }
}

function opportunityPlanTone(key: OpportunityPlan["key"]) {
  switch (key) {
    case "funding-lane":
      return {
        panel: "border-amber-200 bg-amber-50/80",
        badge: "border-amber-200 bg-amber-100 text-amber-900",
        offer: "border-amber-100 bg-white",
      };
    case "card-lane":
      return {
        panel: "border-sky-200 bg-sky-50/80",
        badge: "border-sky-200 bg-sky-100 text-sky-900",
        offer: "border-sky-100 bg-white",
      };
    default:
      return {
        panel: "border-zinc-200 bg-white",
        badge: "border-zinc-200 bg-zinc-100 text-zinc-700",
        offer: "border-zinc-200 bg-zinc-50",
      };
  }
}

function utilizationTone(utilization: number | null) {
  if (utilization === null) return { label: "No data", accent: "#a1a1aa" };
  if (utilization <= 10) return { label: "Healthy", accent: "#2563eb" };
  if (utilization <= 30) return { label: "Reduce", accent: "#f97316" };
  return { label: "Too high", accent: "#ef4444" };
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
  if (current.startsWith("/credit")) {
    return {
      listHref: "/credit/app/services/credit-reports",
      detailHref: (reportId: string) => `/credit/app/services/credit-reports/${encodeURIComponent(reportId)}`,
      disputeHref: "/credit/app/services/dispute-letters",
      contactsHref: "/credit/app/people/contacts",
      tasksHref: "/credit/app/services/tasks",
      reportingHref: "/credit/app/services/reporting",
    };
  }
  return {
    listHref: "/portal/app/services/credit-reports",
    detailHref: (reportId: string) => `/portal/app/services/credit-reports/${encodeURIComponent(reportId)}`,
    disputeHref: "/portal/app/services/dispute-letters",
    contactsHref: "/portal/app/people/contacts",
    tasksHref: "/portal/app/services/tasks",
    reportingHref: "/portal/app/services/reporting",
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
  const isCreditWorkspace = pathname.startsWith("/credit");
  const [portalRole, setPortalRole] = useState<"OWNER" | "ADMIN" | "MEMBER" | null>(null);
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
  const providerPullUnavailableMessage = "Live provider pull needs a configured provider API key and connection. Import report JSON for the selected contact until that is set up.";

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
    setSelectedContactId((prev) => (prev && next.some((contact) => contact.id === prev) ? prev : ""));
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!isCreditWorkspace) {
      setPortalRole(null);
      return;
    }

    void (async () => {
      const res = await fetch("/api/portal/me", {
        cache: "no-store",
        headers: { "x-pa-app": "portal", "x-portal-variant": "credit" },
      }).catch(() => null);
      if (cancelled || !res?.ok) return;
      const json = (await res.json().catch(() => null)) as PortalMeResponse | null;
      if (cancelled || !json || json.ok !== true) return;
      setPortalRole(json.role);
    })();

    return () => {
      cancelled = true;
    };
  }, [isCreditWorkspace]);

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
  const workflowNextStep = useMemo(() => {
    const clientScoped = isCreditWorkspace && portalRole !== "OWNER" && portalRole !== "ADMIN";
    if (!selectedReport) {
      return clientScoped
        ? "Start from the latest report, review each flagged item, and open dispute letters when something needs follow-up."
        : "Start from the client record, import the latest JSON report, then work item by item before opening any dispute draft.";
    }
    if (selectedReportSummary.negative > 0) {
      return clientScoped
        ? `${selectedReportSummary.negative} item${selectedReportSummary.negative === 1 ? " needs" : "s need"} dispute drafting or follow-up. Review the details here, then move into dispute letters for the next step.`
        : `${selectedReportSummary.negative} item${selectedReportSummary.negative === 1 ? " needs" : "s need"} dispute drafting or follow-up. Review the details here, then push the work into dispute letters and tasks.`;
    }
    if (selectedReportSummary.pending > 0) {
      return `${selectedReportSummary.pending} item${selectedReportSummary.pending === 1 ? " is" : "s are"} still waiting on review. Clear those before treating the file as ready for the next credit move.`;
    }
    if (selectedReportSummary.tracked > 0) {
      return clientScoped
        ? "The report is already tied to dispute activity. Use dispute letters to track what has already been drafted or mailed."
        : "The report is already tied to dispute activity. Use letters for mailed-state tracking and tasks for any response deadlines or document collection.";
    }
    return clientScoped
      ? "This report reads clean right now. Use it as your live view of what has been reviewed and what still needs attention."
      : "This report reads clean right now. Keep the contact record current, use tasks for any manual follow-up, and use reporting only for shared workspace counts.";
  }, [isCreditWorkspace, portalRole, selectedReport, selectedReportSummary]);
  const showInternalWorkflowLinks = !isCreditWorkspace || portalRole === "OWNER" || portalRole === "ADMIN";
  const isClientReadonlyView = isCreditWorkspace && !showInternalWorkflowLinks;
  const utilizationValue = selectedReport?.creditSnapshot?.utilizationPercent ?? null;
  const utilizationStatus = utilizationTone(utilizationValue);
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
      if (!selectedContactId) {
        setError("Select a contact before importing a report.");
        return;
      }
      const rawJson = JSON.parse(rawText);
      const json = await fetchJson<{ ok: true; report: ReportLite }>("/api/portal/credit/reports", {
        method: "POST",
        body: JSON.stringify({
          contactId: selectedContactId,
          provider,
          creditScope,
          rawJson,
        }),
      });
      await loadReports();
      toast.success("Manual report imported.");
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

  const selectedReportSource = useMemo(
    () => (selectedReport ? extractCreditReportSourceSummary(selectedReport.rawJson, selectedReport.provider) : null),
    [selectedReport],
  );
  const selectedReportImportedLabel = useMemo(
    () => (selectedReport ? new Date(selectedReport.importedAt).toLocaleString() : ""),
    [selectedReport],
  );
  const surfaceTitle = isClientReadonlyView ? "Your credit progress" : "Credit reports";
  const surfaceIntro = mode === "detail"
    ? isClientReadonlyView
      ? "This is your credit progress panel. Review what changed in your latest update, see what still needs attention, and track the next step from here."
      : "Review imported report items, update the internal tags, and draft dispute letters for the entries that need follow-up."
    : isClientReadonlyView
      ? "This is your credit progress panel. Open each update to see what changed in your file and what the team is already working through."
      : "Import report JSON, review items internally, and open dispute letters when something needs work. Live provider pull still needs a configured provider API key and connection.";

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">{surfaceTitle}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">{surfaceIntro}</p>
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
            <span>{isClientReadonlyView ? "Back to your progress" : "Back to reports"}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{reports.length} saved</div>
            {showInternalWorkflowLinks ? (
              <button
                type="button"
                onClick={() => setNewReportOpen(true)}
                className={PRIMARY_BUTTON_CLASS}
              >
                Import report
              </button>
            ) : null}
          </div>
        )}
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {mode === "list" ? (
        <>
          {isCreditWorkspace ? (
            <section className="mt-6 rounded-3xl border border-sky-200 bg-sky-50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <div className="text-sm font-semibold text-zinc-900">{isClientReadonlyView ? "How this panel works" : "Credit workflow lane"}</div>
                  <div className="mt-1 text-sm text-zinc-700">
                    {showInternalWorkflowLinks
                      ? "Use this order in the beta workspace: confirm the client record first, import the latest JSON report, review negative and pending items, then move live follow-up into dispute letters and tasks. Reporting stays honest about shared activity only."
                      : "Start with your latest update, review anything that still needs attention, and open dispute letters when you want to track work that is already underway."}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { window.location.href = routeSet.disputeHref; }} className={SECONDARY_BUTTON_CLASS}>Dispute letters</button>
                  {showInternalWorkflowLinks ? (
                    <>
                      <button type="button" onClick={() => { window.location.href = routeSet.contactsHref; }} className={SECONDARY_BUTTON_CLASS}>Contacts</button>
                      <button type="button" onClick={() => { window.location.href = routeSet.tasksHref; }} className={SECONDARY_BUTTON_CLASS}>Tasks</button>
                      <button type="button" onClick={() => { window.location.href = routeSet.reportingHref; }} className={SECONDARY_BUTTON_CLASS}>Reporting</button>
                    </>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{isClientReadonlyView ? "Recent report updates" : "Report queue"}</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {isClientReadonlyView
                    ? "Open an update to see what changed in your file, what still needs attention, and how it connects to dispute work already in progress."
                    : "Search by contact or provider, then open the report to review items and move dispute work into letters."}
                </div>
              </div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{loading ? "Loading" : `${filteredReports.length} ${isClientReadonlyView ? "updates" : "reports"}`}</div>
            </div>

            <div className="mt-3 flex w-full max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={reportSearch}
                onChange={(event) => setReportSearch(event.target.value)}
                className="h-11 w-full rounded-full border border-zinc-200 px-4 text-sm outline-none transition focus:border-zinc-300 focus-visible:ring-2 focus-visible:ring-brand-blue/20 sm:flex-1"
                placeholder={isClientReadonlyView ? "Search updates" : "Search reports"}
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
                    <th className="px-4 py-3">{isClientReadonlyView ? "Update" : "Report"}</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-zinc-600">{isClientReadonlyView ? "Loading updates..." : "Loading reports..."}</td>
                    </tr>
                  ) : filteredReports.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10">
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center">
                          <div className="text-base font-semibold text-zinc-900">{isClientReadonlyView ? "No updates in this view" : "No reports in this view"}</div>
                          <div className="mt-2 max-w-md text-sm text-zinc-600">
                            {reports.length === 0 ? "Start by selecting a contact and importing report JSON. Live provider pulls still need a configured provider API key and connection." : "Try a different provider filter or search term."}
                          </div>
                          <button
                            type="button"
                            onClick={() => setNewReportOpen(true)}
                            className={PRIMARY_BUTTON_CLASS + " mt-4"}
                          >
                            Import report JSON
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredReports.map((report) => {
                      const sourceSummary = extractCreditReportSourceSummary(report.rawJson, report.provider);
                      return (
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
                          <div className="mt-1 text-xs text-zinc-500">{sourceSummary.shortLabel}</div>
                          <div className="mt-1 text-xs text-zinc-500">{report._count.items} items</div>
                        </td>
                        <td className="px-4 py-3 text-zinc-600">
                          <div>{new Date(report.importedAt).toLocaleString()}</div>
                          <div className="mt-1 text-xs text-zinc-400">{isClientReadonlyView ? "Open update" : "Open report"}</div>
                        </td>
                      </tr>
                      );
                    })
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
                    <div className="text-lg font-semibold text-zinc-900">Import credit report</div>
                    <div className="mt-1 text-sm text-zinc-600">Select the contact first, then paste report JSON. Live provider pull still needs a configured provider API key and connection in this workspace.</div>
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
                    <div className="mt-2 text-xs text-zinc-500">Select a contact before importing a report so the queue and dispute workflow stay tied to the right person.</div>
                  </label>

                  <label className="block">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">JSON source</div>
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
                    <div className="mt-2 font-semibold text-zinc-900">{selectedContact?.name || "No contact selected yet"}</div>
                    <div className="mt-1 text-xs text-zinc-500">{selectedContact?.email || "Choose a contact before importing."}</div>
                  </div>

                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="text-sm font-semibold text-zinc-900">Supported now: import report JSON</div>
                    <div className="mt-1 text-sm text-zinc-700">Paste the provider export JSON below. The report will be stored as a manual import for this contact.</div>
                    <label className="mt-3 block">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Report JSON</div>
                      <textarea
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        className="min-h-45 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs"
                        placeholder="Paste report JSON here"
                      />
                    </label>
                  </div>

                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-sm font-semibold text-zinc-900">Not ready yet: live provider pull</div>
                    <div className="mt-1 text-sm text-zinc-700">{providerPullUnavailableMessage}</div>
                    <div className="mt-2 text-xs text-zinc-500">A provider API key and connection are required before live pulls can run.</div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" onClick={() => setNewReportOpen(false)} className={SECONDARY_BUTTON_CLASS}>Cancel</button>
                  <button type="button" disabled={busy || !selectedContactId || rawText.trim().length < 2} onClick={importReport} className={PRIMARY_BUTTON_CLASS}>{busy ? "Working..." : "Import report JSON"}</button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : !selectedReport ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">{isClientReadonlyView ? "This update could not be found." : "Report not found."}</div>
      ) : (
        <div className="mt-6 space-y-5">
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-2xl font-semibold text-zinc-900">{selectedReport.contact?.name || selectedReport.provider}</h2>
              <div className="mt-2 text-sm text-zinc-600">
                {isClientReadonlyView
                  ? `${creditScopeLabel(selectedReport.creditScope)} snapshot • Updated ${selectedReportImportedLabel} • ${selectedReport.items.length} ${selectedReport.items.length === 1 ? "item" : "items"} in this update`
                  : `${creditScopeLabel(selectedReport.creditScope)} • ${selectedReportSource?.label || selectedReport.provider} • Imported ${selectedReportImportedLabel} • ${selectedReport.items.length} items`}
              </div>
            </div>

            {selectedReportSource ? (
              <div className={classNames(
                "mt-4 rounded-3xl border px-4 py-3 text-sm",
                selectedReportSource.mode === "provider-placeholder"
                  ? "border-amber-200 bg-amber-50 text-zinc-800"
                  : "border-emerald-200 bg-emerald-50 text-zinc-800",
              )}>
                <div className="font-semibold text-zinc-900">{isClientReadonlyView ? "Latest file update" : selectedReportSource.label}</div>
                <div className="mt-1">
                  {isClientReadonlyView
                    ? `This snapshot was added to your file on ${selectedReportImportedLabel}. Use the sections below to see what changed and what the current plan looks like.`
                    : selectedReportSource.helperText}
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-3xl border border-sky-200 bg-sky-50 p-4 text-sm text-zinc-800">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <div className="font-semibold text-zinc-900">{isClientReadonlyView ? "What happens next" : "Workflow handoff"}</div>
                  <div className="mt-1">{workflowNextStep}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { window.location.href = routeSet.disputeHref; }} className={SECONDARY_BUTTON_CLASS}>{isClientReadonlyView ? "View dispute letters" : "Dispute letters"}</button>
                  {showInternalWorkflowLinks ? (
                    <>
                      <button type="button" onClick={() => { window.location.href = routeSet.contactsHref; }} className={SECONDARY_BUTTON_CLASS}>Contacts</button>
                      <button type="button" onClick={() => { window.location.href = routeSet.tasksHref; }} className={SECONDARY_BUTTON_CLASS}>Tasks</button>
                      <button type="button" onClick={() => { window.location.href = routeSet.reportingHref; }} className={SECONDARY_BUTTON_CLASS}>Reporting</button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {([
                ["items", isClientReadonlyView ? "What changed" : "Items"],
                ["plan", isClientReadonlyView ? "Plan ahead" : "Plan"],
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

            {selectedReportSource?.mode !== "provider-placeholder" ? (
            <>
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

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Current score</div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="text-3xl font-bold leading-none text-zinc-900">{selectedReport.creditSnapshot?.currentScore ?? "--"}</div>
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${scoreTone(selectedReport.creditSnapshot?.currentScore ?? null).accent}12`, color: scoreTone(selectedReport.creditSnapshot?.currentScore ?? null).accent }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M2 8.5L4.7 5.8L6.5 7.6L10 4.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M7.8 4.1H10V6.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">Snapshot from the latest imported report</div>
                </div>
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Target score</div>
                  <div className="mt-3 text-3xl font-bold text-zinc-900">{selectedReport.creditSnapshot?.targetScore ?? "--"}</div>
                  <div className="mt-2 text-xs text-zinc-500">Gap: {selectedReport.creditSnapshot?.scoreDelta ?? 0}</div>
                </div>
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Utilization</div>
                    <div className="shrink-0 whitespace-nowrap text-right text-xs font-semibold uppercase tracking-wide leading-none" style={{ color: utilizationStatus.accent }}>
                      {utilizationStatus.label}
                    </div>
                  </div>
                  <div className="mt-3 text-3xl font-bold text-zinc-900">{utilizationValue ?? 0}%</div>
                  <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">Target under 10%</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {utilizationValue === null
                      ? "Utilization will appear once a live report snapshot is available."
                      : utilizationValue <= 10
                        ? "This is sitting in the healthy range for the current file."
                        : `About ${Math.max(utilizationValue - 10, 0)}% above the target range right now.`}
                  </div>
                </div>
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Primary goal</div>
                  <div className="mt-3 text-sm font-semibold leading-6 text-zinc-900">{selectedReport.creditSnapshot?.goals?.[0] || "Set a score and funding goal"}</div>
                  <div className="mt-2 text-xs leading-5 text-zinc-500">{selectedReport.creditSnapshot?.nextMilestone || "Use this report to drive the next action."}</div>
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
                        <div className="flex h-18 w-18 shrink-0 items-center justify-center rounded-3xl bg-zinc-50">
                          <div className="relative aspect-square h-16 shrink-0 rounded-full" style={{ backgroundImage: ringTrack([{ value: ringPercent, color: "#2563eb" }, { value: 100 - ringPercent, color: "#e4e4e7" }]) }}>
                            <div className="absolute inset-2 flex items-center justify-center rounded-full bg-white text-sm font-semibold text-zinc-900">{entry.score}</div>
                          </div>
                        </div>
                        <div className="min-w-0 text-sm text-zinc-600">Auto-loaded bureau score for this report snapshot.</div>
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
            </>
            ) : (
              <div className="mt-5 rounded-3xl border border-dashed border-amber-300 bg-amber-50 p-5 text-sm text-zinc-700">
                This placeholder row does not contain a live bureau report. Import report JSON for this contact before using score, utilization, or funding guidance here.
              </div>
            )}
            {detailTab === "items" ? (
            <div id="credit-report-items" className="mt-5 border-t border-zinc-200 pt-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{isClientReadonlyView ? "What changed in this update" : "Report items"}</div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {isClientReadonlyView
                      ? "Each item shows what Purely found, what still needs review, and whether dispute work is already underway."
                      : "Item tags and dispute workflow are internal to Purely until you draft or send a dispute letter."}
                  </div>
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
                filteredItems.map((it) => {
                  const itemTone = reportItemTone(it.auditTag);
                  return (
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
                          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: itemTone.accent }}>
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: itemTone.accent }} />
                            <span>{REPORT_FILTER_LABELS[it.auditTag]}</span>
                          </div>
                        </div>
                        <div className="text-xs text-zinc-500">{it.auditReason || itemSummaryText(it)}</div>
                      </button>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-zinc-600">
                          {itemSummaryText(it)}
                        </div>
                        {!isClientReadonlyView && it.auditTag === "NEGATIVE" ? (
                          <button
                            type="button"
                            onClick={() => openDisputeComposer(it)}
                            className={PRIMARY_BUTTON_CLASS}
                          >
                            Draft dispute letter
                          </button>
                        ) : !isClientReadonlyView && it.auditTag === "PENDING" ? (
                          <button type="button" onClick={() => setPriorityItemOpen(it)} className={SECONDARY_BUTTON_CLASS}>Review item</button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{isClientReadonlyView ? "What Purely found" : "Automatic classification"}</div>
                        <div className="mt-2 text-sm font-semibold text-zinc-900">{REPORT_FILTER_LABELS[it.auditTag]}</div>
                        <div className="mt-1 text-sm text-zinc-600">
                          {it.auditTag === "PENDING"
                            ? isClientReadonlyView
                              ? "This item is still being reviewed by the team before any next dispute step is chosen."
                              : "Review the item details, then either move it to dispute or mark that no dispute is needed."
                            : it.auditReason || "Classification is derived from the account status and dispute signals in the report."}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{isClientReadonlyView ? "Dispute status" : "Internal dispute workflow"}</div>
                        <div className="mt-2 text-sm text-zinc-700">{it.disputeStatus || "No dispute letter drafted yet"}</div>
                      </div>
                    </div>
                  </div>
                );
                })
              )}
            </div>
            </div>
            ) : null}

            {detailTab === "plan" ? (
            <div className="mt-5 border-t border-zinc-200 pt-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{isClientReadonlyView ? "Recommended lane right now" : "Action plan"}</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {isClientReadonlyView
                    ? "This view turns the current report into a simple funding and card lane so you can see what the file supports right now."
                    : "Use the current score, utilization, and cleanup load to keep the next funding move honest."}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {opportunityPlans.map((plan) => {
                const planTone = opportunityPlanTone(plan.key);
                return (
                <div key={plan.key} className={classNames("rounded-[26px] border p-5 shadow-sm transition-shadow duration-150 hover:shadow-md", planTone.panel)}>
                  <div>
                    <div className="text-base font-semibold text-zinc-900">{plan.title}</div>
                    <div className="mt-1 text-sm leading-6 text-zinc-700">{plan.summary}</div>
                    <div className="mt-4 border-t border-zinc-200 pt-3">
                      <span className={classNames("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", planTone.badge)}>{plan.readinessLabel}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {plan.offers.map((offer) => (
                      <div key={offer.label} className={classNames("rounded-2xl border px-3 py-3", planTone.offer)}>
                        <div className="text-sm font-semibold text-zinc-900">{offer.label}</div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{offer.source}</div>
                      </div>
                    ))}
                  </div>
                </div>
                );
              })}
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
                    <div>
                      {isClientReadonlyView
                        ? "Review the details below to understand what the team is still checking before the next dispute decision is made."
                        : "Review the details below. If it belongs in the next letter, open a dispute draft from here."}
                    </div>
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
                      {isClientReadonlyView
                        ? "This item does not have extra imported detail fields on file yet. Use the summary above as the current status snapshot for this issue."
                        : "This item does not have extra imported detail fields on file yet. Use the details above to decide whether it needs a dispute draft."}
                    </div>
                  )}
                </div>

                {!isClientReadonlyView ? (
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  {priorityItemOpen.auditTag === "NEGATIVE" ? (
                    <button type="button" onClick={() => {
                      openDisputeComposer(priorityItemOpen);
                    }} className={PRIMARY_BUTTON_CLASS}>Draft dispute letter</button>
                  ) : priorityItemOpen.auditTag === "PENDING" ? (
                    <>
                      <button type="button" onClick={() => { void markItemNoDisputeNeeded(priorityItemOpen); }} className={SECONDARY_BUTTON_CLASS} disabled={itemDecisionBusyId === priorityItemOpen.id}>{itemDecisionBusyId === priorityItemOpen.id ? "Saving..." : "Mark as reviewed"}</button>
                      <button type="button" onClick={() => { void moveItemToDispute(priorityItemOpen); }} className={PRIMARY_BUTTON_CLASS} disabled={itemDecisionBusyId === priorityItemOpen.id}>{itemDecisionBusyId === priorityItemOpen.id ? "Saving..." : "Draft dispute letter"}</button>
                    </>
                  ) : null}
                </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
