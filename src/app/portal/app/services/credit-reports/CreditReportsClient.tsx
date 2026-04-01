"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { PortalListboxDropdown, type PortalListboxOption } from "@/components/PortalListboxDropdown";

type ContactLite = { id: string; name: string; email: string | null };

type ReportLite = {
  id: string;
  provider: string;
  importedAt: string;
  createdAt: string;
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

function readinessAccentClasses(tone: OpportunityPlan["readinessTone"]) {
  if (tone === "green") return "border-emerald-300 bg-emerald-50/70";
  if (tone === "amber") return "border-amber-300 bg-amber-50/70";
  return "border-rose-300 bg-rose-50/70";
}

function reportReadinessLabel(summary: { pending: number; negative: number; positive: number }) {
  if (summary.negative >= 3) return "Needs active dispute work";
  if (summary.pending >= 2) return "Needs review and tagging";
  if (summary.negative >= 1) return "Close to ready for follow-up";
  if (summary.positive >= 2) return "Mostly stable";
  return "Just getting started";
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

function buildOpportunityPlans(report: ReportFull | null, summary: { pending: number; negative: number; positive: number; tracked: number }) {
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
    readinessLabel: isCleanEnoughForOffers ? "Moderate approval shot" : "Prep first before broad applications",
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
      ? "Good lane for starter business funding once the file stays stable and the business profile is documented cleanly."
      : "Keep business funding in the plan, but treat this as a preparation lane until the report has fewer unresolved negatives.",
  };

  const personalFunding: OpportunityPlan = {
    key: "personal-funding",
    title: "Personal funding",
    readinessLabel: isCleanEnoughForOffers ? "Near-term if the file stays calm" : "Wait for cleanup before bigger asks",
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
      ? "Personal funding can be pursued in a controlled way if the client keeps utilization down and avoids stacking applications."
      : "Treat personal funding as a later-phase move until the report is cleaner and the client’s file is less volatile.",
  };

  const creditCards: OpportunityPlan = {
    key: "credit-cards",
    title: "Credit cards",
    readinessLabel: hasUtilizationSignals || isCleanEnoughForOffers ? "Useful leverage if utilization is controlled" : "Use rebuild cards first",
    readinessTone: hasUtilizationSignals || isCleanEnoughForOffers ? "green" : "amber",
    offers: hasUtilizationSignals || isCleanEnoughForOffers
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
      ? "Credit-card strategy is one of the fastest levers here because balance management and the right product mix can change the file quickly."
      : "Card strategy still matters here, especially if the goal is to add positive revolving history without over-applying.",
  };

  const otherActions: OpportunityPlan = {
    key: "other-actions",
    title: "Other actions",
    readinessLabel: isStillRepairHeavy ? "Handle cleanup before pushing apps" : "Keep these live while the file stabilizes",
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
      ? "The file still needs operational cleanup, follow-up, and monitoring before bigger funding moves should take priority."
      : "Even when the file improves, disciplined follow-up and monitoring keep the client from backsliding.",
  };

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
  const routeSet = useMemo(() => reportRoutesFor(pathname), [pathname]);
  const contactDatalistId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reports, setReports] = useState<ReportLite[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>(initialReportId);
  const [selectedReport, setSelectedReport] = useState<ReportFull | null>(null);

  const [contactQuery, setContactQuery] = useState("");
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  const [provider, setProvider] = useState<string>("IdentityIQ");
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
    setReports(json.reports || []);
  }, []);

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
    () => buildOpportunityPlans(selectedReport, selectedReportSummary),
    [selectedReport, selectedReportSummary],
  );
  const reportMix = useMemo(() => {
    const total = Math.max(1, selectedReportSummary.pending + selectedReportSummary.negative + selectedReportSummary.positive);
    return [
      { key: "negative", label: "Negative", value: selectedReportSummary.negative, width: `${Math.max(8, (selectedReportSummary.negative / total) * 100)}%`, barClass: "bg-rose-500" },
      { key: "pending", label: "Pending", value: selectedReportSummary.pending, width: `${Math.max(8, (selectedReportSummary.pending / total) * 100)}%`, barClass: "bg-amber-500" },
      { key: "positive", label: "Positive", value: selectedReportSummary.positive, width: `${Math.max(8, (selectedReportSummary.positive / total) * 100)}%`, barClass: "bg-emerald-500" },
    ];
  }, [selectedReportSummary]);

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
          rawJson,
        }),
      });
      await loadReports();
      setSelectedReportId(json.report.id);
      setRawText("{");
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
      setSelectedReportId(json.report.id);
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
          <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">{reports.length} saved</div>
        )}
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {mode === "list" ? (
        <div className="mt-6 space-y-5">
          <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Report intake</div>
                <div className="mt-1 text-sm text-zinc-600">Pick a contact, choose the provider, and pull a fresh report without the extra clutter.</div>

                <label className="mt-4 block">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contact</div>
                  <input
                    value={contactQuery}
                    onChange={(e) => setContactQuery(e.target.value)}
                    list={contactDatalistId}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
                    placeholder="Search or select a contact"
                  />
                  <datalist id={contactDatalistId}>
                    {contactSuggestions.map((entry) => (
                      <option key={entry.id} value={entry.label} />
                    ))}
                  </datalist>
                  {selectedContact ? <div className="mt-1 text-xs text-zinc-500">Selected: {selectedContact.name}</div> : null}
                </label>

                <label className="mt-3 block">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Provider</div>
                  <PortalListboxDropdown
                    value={provider}
                    onChange={(v) => setProvider(v)}
                    disabled={busy}
                    buttonClassName="flex w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm hover:bg-zinc-50"
                    options={(
                      [
                        { value: "IdentityIQ", label: "IdentityIQ" },
                        { value: "SmartCredit", label: "SmartCredit" },
                        { value: "MyScoreIQ", label: "MyScoreIQ" },
                        { value: "Experian", label: "Experian" },
                        { value: "TransUnion", label: "TransUnion" },
                        { value: "Equifax", label: "Equifax" },
                        { value: "Other", label: "Other" },
                      ] as PortalListboxOption<string>[]
                    )}
                  />
                </label>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={requestProviderPull}
                    className="rounded-2xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
                  >
                    {busy ? "Working…" : reports.some((report) => report.contactId === selectedContactId) ? "Re-import latest" : "Pull latest report"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Saved reports</div>
                  <div className="mt-1 text-2xl font-bold text-brand-ink">{reports.length}</div>
                </div>
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Contacts loaded</div>
                  <div className="mt-1 text-2xl font-bold text-brand-ink">{contacts.length}</div>
                </div>
                <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Current focus</div>
                  <div className="mt-1 truncate text-sm font-semibold text-zinc-900">{selectedContact ? selectedContact.name : "No contact selected"}</div>
                  <div className="mt-1 text-xs text-zinc-500">{selectedContact?.email || "Pick a contact before pulling a report."}</div>
                </div>
              </div>
            </div>

            {showAdvancedImport ? (
              <details className="mt-4 rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
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
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {busy ? "Working…" : "Import report"}
                  </button>
                </div>
              </details>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Saved reports</div>
                <div className="mt-1 text-sm text-zinc-600">Click a report to open its own detail page instead of cramming everything into one screen.</div>
              </div>
              <div className="text-xs text-zinc-500">Newest first</div>
            </div>

            {reports.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">No reports yet.</div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {reports.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    onClick={() => {
                      window.location.href = routeSet.detailHref(report.id);
                    }}
                    className={["rounded-3xl", "border", "border-zinc-200", "bg-white", "p-4", "text-left", "transition", "hover:-translate-y-0.5", "hover:border-zinc-300", "hover:shadow-sm"].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-zinc-900">{report.contact?.name || "Unassigned contact"}</div>
                        <div className="mt-1 text-sm text-zinc-600">{report.provider}</div>
                      </div>
                      <div className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                        {report._count.items} items
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-zinc-500">Imported {new Date(report.importedAt).toLocaleString()}</div>
                    <div className="mt-4 flex items-center justify-between text-xs font-semibold text-zinc-600">
                      <span>{report.contact?.email || "No email on file"}</span>
                      <span>Open →</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : !selectedReport ? (
        <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">Report not found.</div>
      ) : (
        <div className="mt-6 space-y-4">
          <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Selected report</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="text-xl font-semibold text-zinc-900">{selectedReport.contact?.name || selectedReport.provider}</div>
                  <div className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">{readinessLabel}</div>
                </div>
                <div className="mt-1 text-sm text-zinc-600">
                  {selectedReport.provider} • Imported {new Date(selectedReport.importedAt).toLocaleString()}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Tracked items</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">{selectedReportSummary.tracked} in motion</div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Dispute lane</div>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">Open from any report item</div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Pending</div><div className="mt-1 text-xl font-bold text-brand-ink">{selectedReportSummary.pending}</div></div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Negative</div><div className="mt-1 text-xl font-bold text-brand-ink">{selectedReportSummary.negative}</div></div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Positive</div><div className="mt-1 text-xl font-bold text-brand-ink">{selectedReportSummary.positive}</div></div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Tracked</div><div className="mt-1 text-xl font-bold text-brand-ink">{selectedReportSummary.tracked}</div></div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">Profile mix</div>
                <div className="mt-3 space-y-3">
                  {reportMix.map((entry) => (
                    <div key={entry.key}>
                      <div className="flex items-center justify-between text-xs font-semibold text-zinc-600">
                        <span>{entry.label}</span>
                        <span>{entry.value}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-zinc-200">
                        <div className={`h-2 rounded-full ${entry.barClass}`} style={{ width: entry.width }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900">Report notes</div>
                <div className="mt-2 text-sm text-zinc-700">
                  {selectedReport.contact ? `${selectedReport.contact.name} is the active contact on this file.` : "This report is not attached to a contact yet."}
                </div>
                <div className="mt-3 grid gap-2 text-xs font-semibold text-zinc-600 sm:grid-cols-3">
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">{selectedReport.provider}</div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">{filteredItems.length} visible items</div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2">{readinessLabel}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Funding lanes</div>
                <div className="mt-1 text-sm text-zinc-600">Named products and sources instead of generic filler.</div>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                {selectedReport.contact ? `Built for ${selectedReport.contact.name}` : "Built from the selected report"}
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {opportunityPlans.map((plan) => (
                <div key={plan.key} className={"rounded-3xl border bg-white p-4 shadow-sm " + readinessAccentClasses(plan.readinessTone)}>
                  <div>
                    <div className="text-base font-semibold text-zinc-900">{plan.title}</div>
                    <div className="mt-1 text-sm text-zinc-700">{plan.summary}</div>
                    <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{plan.readinessLabel}</div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {plan.offers.map((offer) => (
                      <a
                        key={offer.label}
                        href={offer.href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 transition-transform duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-white"
                      >
                        <div className="text-sm font-semibold text-zinc-900">{offer.label}</div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{offer.source}</div>
                        <div className="mt-3 text-xs font-semibold text-brand-ink">Open site →</div>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Report items</div>
                <div className="mt-1 text-sm text-zinc-600">Filter the report, tag the item, or jump straight into a dispute letter.</div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm sm:w-56"
                  placeholder="Search items…"
                />
                <div className="text-xs text-zinc-500">{filteredItems.length} shown</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ["ALL", `All ${selectedReport.items.length}`],
                ["PENDING", `Pending ${selectedReportSummary.pending}`],
                ["NEGATIVE", `Negative ${selectedReportSummary.negative}`],
                ["POSITIVE", `Positive ${selectedReportSummary.positive}`],
                ["TRACKED", `Tracked ${selectedReportSummary.tracked}`],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setItemFilter(value)}
                  className={itemFilter === value ? "rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white" : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {filteredItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600">No matching items.</div>
              ) : (
                filteredItems.map((it) => (
                  <div key={it.id} className="rounded-3xl border border-zinc-200 bg-zinc-50 p-4">
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
                      <PortalListboxDropdown
                        value={it.auditTag}
                        onChange={(v) => updateItem(it.id, { auditTag: v })}
                        disabled={busy}
                        buttonClassName="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
                        options={(
                          [
                            { value: "PENDING", label: "Pending" },
                            { value: "NEGATIVE", label: "Negative" },
                            { value: "POSITIVE", label: "Positive" },
                          ] as PortalListboxOption<ReportItemLite["auditTag"]>[]
                        )}
                      />
                      <input
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
                        value={it.disputeStatus || ""}
                        disabled={busy}
                        placeholder="Dispute status"
                        onChange={(e) => updateItem(it.id, { disputeStatus: e.target.value })}
                      />
                      <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">
                        {it.disputeStatus ? `Current dispute status: ${it.disputeStatus}` : "No dispute status recorded yet."}
                      </div>
                    </div>
                  </div>
                ))
              )}
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
