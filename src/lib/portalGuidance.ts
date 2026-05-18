/**
 * P-029 — Soft Business Guidance Engine
 *
 * Deterministic, read-only. Takes real platform state and returns ranked
 * guidance items that explain what the operator has done, what is missing,
 * and what the next best step is for their business.
 *
 * No API calls, no mutations, no side effects.
 */

export type GuidanceStatus =
  | "start-here"
  | "setup-needed"
  | "ready"
  | "needs-attention"
  | "opportunity"
  | "follow-up"
  | "blocked";

export type GuidanceCategory =
  | "setup"
  | "growth"
  | "follow-up"
  | "trust"
  | "automation"
  | "reporting"
  | "credit";

export type GuidanceItem = {
  id: string;
  priority: number;
  category: GuidanceCategory;
  status: GuidanceStatus;
  title: string;
  reason: string;
  nextActionLabel: string;
  href: string;
};

type ServiceReadinessState = "ready" | "needs_setup" | "needs_connection" | "empty" | "blocked";
type ServiceStatusState = "active" | "needs_setup" | "locked" | "coming_soon" | "paused" | "canceled";

type ServiceEntry = {
  state: ServiceStatusState;
  readiness: {
    state: ServiceReadinessState;
    href: string | null;
  };
};

export type GuidanceInput = {
  isCreditWorkspace: boolean;
  portalBase: string; // "/portal" or "/credit"
  billingConfigured: boolean;
  statuses: Record<string, ServiceEntry>;
  kpis: {
    leadsCreated: number;
    contactsCreated: number;
    bookingsCreated: number;
    aiCalls: number;
    textsSent: number;
    missedCalls: number;
    nurtureEnrollmentsCreated: number;
    newsletterSentCount: number;
    reviewsCollected: number;
    blogGenerations: number;
    tasksOpenNow: number;
    inboxMessagesIn: number;
    inboxMessagesOut: number;
  } | null;
};

function serviceIs(statuses: Record<string, ServiceEntry>, slug: string, ...states: ServiceReadinessState[]): boolean {
  const s = statuses[slug];
  if (!s) return false;
  return states.includes(s.readiness.state);
}

function serviceState(statuses: Record<string, ServiceEntry>, slug: string): ServiceStatusState | null {
  return statuses[slug]?.state ?? null;
}

function serviceLocked(statuses: Record<string, ServiceEntry>, slug: string): boolean {
  const state = serviceState(statuses, slug);
  return state === "locked" || state === "paused" || state === "canceled" || state === "coming_soon";
}

function serviceHref(statuses: Record<string, ServiceEntry>, slug: string, portalBase: string): string {
  return statuses[slug]?.readiness.href ?? `${portalBase}/app/services/${slug}`;
}

export function buildGuidanceItems(input: GuidanceInput): GuidanceItem[] {
  const { isCreditWorkspace, portalBase, billingConfigured, statuses, kpis } = input;
  const items: GuidanceItem[] = [];

  const k = kpis ?? {
    leadsCreated: 0,
    contactsCreated: 0,
    bookingsCreated: 0,
    aiCalls: 0,
    textsSent: 0,
    missedCalls: 0,
    nurtureEnrollmentsCreated: 0,
    newsletterSentCount: 0,
    reviewsCollected: 0,
    blogGenerations: 0,
    tasksOpenNow: 0,
    inboxMessagesIn: 0,
    inboxMessagesOut: 0,
  };

  const hasLeads = k.leadsCreated > 0 || k.contactsCreated > 0;
  const hasBookings = k.bookingsCreated > 0;
  const hasRecentActivity =
    k.aiCalls > 0 || k.textsSent > 0 || k.missedCalls > 0 || k.bookingsCreated > 0;

  // ── 1. Billing not connected ──────────────────────────────────────────────
  if (!billingConfigured) {
    items.push({
      id: "billing-not-configured",
      priority: 1,
      category: "setup",
      status: "setup-needed",
      title: isCreditWorkspace ? "Billing isn't connected for this workspace" : "Billing isn't connected",
      reason: isCreditWorkspace
        ? "Without billing, paid credit services and credit top-ups for AI and reports can't activate."
        : "Without billing, paid services and usage-based credits can't activate for this workspace.",
      nextActionLabel: "Connect billing",
      href: `${portalBase}/app/billing`,
    });
  }

  // ── 2. Twilio not connected (AI Receptionist needs_connection) ────────────
  if (!isCreditWorkspace && !serviceLocked(statuses, "ai-receptionist") && serviceIs(statuses, "ai-receptionist", "needs_connection")) {
    items.push({
      id: "twilio-not-connected",
      priority: 2,
      category: "setup",
      status: "blocked",
      title: "Twilio isn't connected",
      reason:
        "SMS, missed-call text-back, and AI call campaigns can't run until a Twilio account is linked. This blocks the AI Receptionist and automated follow-up.",
      nextActionLabel: "Set up Twilio",
      href: serviceHref(statuses, "ai-receptionist", portalBase),
    });
  }

  // ── 3a. Credit: no reports yet ────────────────────────────────────────────
  if (isCreditWorkspace && serviceIs(statuses, "credit-reports", "empty")) {
    items.push({
      id: "credit-no-reports",
      priority: 3,
      category: "credit",
      status: "start-here",
      title: "No credit reports in the system yet",
      reason:
        "Import a client's credit report JSON to begin identifying negative items, tracking disputes, and running the full credit workflow.",
      nextActionLabel: "Import first report",
      href: serviceHref(statuses, "credit-reports", portalBase),
    });
  }

  // ── 3b. Credit: reports exist but no dispute letters ──────────────────────
  if (isCreditWorkspace && serviceIs(statuses, "credit-reports", "ready") && serviceIs(statuses, "dispute-letters", "empty")) {
    items.push({
      id: "credit-no-letters",
      priority: 3,
      category: "credit",
      status: "follow-up",
      title: "Reports are in — dispute letters haven't been generated yet",
      reason:
        "Dispute letters are the next step after importing a report. Drafting and mailing them starts the removal process with bureaus.",
      nextActionLabel: "Generate first letter",
      href: serviceHref(statuses, "dispute-letters", portalBase),
    });
  }

  // ── 3c. Portal: no leads/contacts yet ────────────────────────────────────
  if (!isCreditWorkspace && !hasLeads) {
    const funnelEmpty = serviceIs(statuses, "funnel-builder", "empty");
    const funnelLocked = serviceLocked(statuses, "funnel-builder");
    const scrapeAvail = !serviceLocked(statuses, "lead-scraping");
    items.push({
      id: "no-leads",
      priority: 3,
      category: "growth",
      status: "start-here",
      title: "No leads or contacts are in the system yet",
      reason:
        "Every service performs better with contacts. A funnel, lead scraping, or intake form brings the first batch in so follow-up, booking, and nurture can run.",
      nextActionLabel: funnelEmpty
        ? "Create first funnel"
        : scrapeAvail
          ? "Try lead scraping"
          : "View services",
      href: funnelEmpty
        ? serviceHref(statuses, "funnel-builder", portalBase)
        : scrapeAvail
          ? serviceHref(statuses, "lead-scraping", portalBase)
          : `${portalBase}/app/services`,
    });
    // Don't also suggest booking when there are no leads — lead gen is the clearer first step.
  }

  // ── 4. Booking not set up ─────────────────────────────────────────────────
  if (!serviceLocked(statuses, "booking") && serviceIs(statuses, "booking", "needs_setup")) {
    items.push({
      id: "booking-needs-setup",
      priority: 4,
      category: "setup",
      status: "setup-needed",
      title: isCreditWorkspace
        ? "Consultation booking isn't set up"
        : "Booking automation isn't active",
      reason: isCreditWorkspace
        ? "Without a booking link, credit clients can't schedule consultations and the intake-to-appointment flow can't run."
        : "Without a live booking link, prospects can't self-schedule and appointment automation can't fire.",
      nextActionLabel: "Finish booking setup",
      href: serviceHref(statuses, "booking", portalBase),
    });
  }

  // ── 5. Leads exist but no follow-up running ───────────────────────────────
  if (
    !isCreditWorkspace &&
    hasLeads &&
    !hasBookings &&
    k.nurtureEnrollmentsCreated === 0 &&
    k.inboxMessagesOut === 0
  ) {
    items.push({
      id: "no-follow-up",
      priority: 5,
      category: "follow-up",
      status: "follow-up",
      title: "Leads exist but no follow-up has run",
      reason:
        "Contacts without a nurture sequence, inbox outreach, or booking prompt won't convert on their own. Activate at least one follow-up channel.",
      nextActionLabel: !serviceLocked(statuses, "nurture-campaigns")
        ? "Set up nurture"
        : "Open inbox",
      href: !serviceLocked(statuses, "nurture-campaigns")
        ? serviceHref(statuses, "nurture-campaigns", portalBase)
        : `${portalBase}/app/services/inbox`,
    });
  }

  // ── 6. No public funnel ───────────────────────────────────────────────────
  if (!isCreditWorkspace && !serviceLocked(statuses, "funnel-builder") && serviceIs(statuses, "funnel-builder", "empty")) {
    items.push({
      id: "no-funnel",
      priority: 6,
      category: "growth",
      status: "opportunity",
      title: "No public funnel or intake form exists yet",
      reason:
        "Without a published funnel, there's no self-service path for leads to find, learn about, and contact the business on their own.",
      nextActionLabel: "Create first funnel",
      href: serviceHref(statuses, "funnel-builder", portalBase),
    });
  }

  // ── 7. No trust content (blogs / newsletter) ──────────────────────────────
  if (
    !isCreditWorkspace &&
    k.blogGenerations === 0 &&
    k.newsletterSentCount === 0 &&
    !serviceLocked(statuses, "blogs")
  ) {
    items.push({
      id: "no-trust-content",
      priority: 7,
      category: "trust",
      status: "opportunity",
      title: "No blog or newsletter content yet",
      reason:
        "Blogs and newsletters build search visibility and give leads a reason to come back. Even one post establishes presence.",
      nextActionLabel: "Start with blogs",
      href: serviceHref(statuses, "blogs", portalBase),
    });
  }

  // ── 8. No reviews ─────────────────────────────────────────────────────────
  if (!isCreditWorkspace && k.reviewsCollected === 0 && !serviceLocked(statuses, "reviews")) {
    items.push({
      id: "no-reviews",
      priority: 8,
      category: "trust",
      status: "opportunity",
      title: "Review collection isn't producing results yet",
      reason:
        "Reviews help new leads decide to contact the business. Set up the review request flow so it triggers automatically after appointments.",
      nextActionLabel: "Set up reviews",
      href: serviceHref(statuses, "reviews", portalBase),
    });
  }

  // ── 9. Open tasks need attention ──────────────────────────────────────────
  if (k.tasksOpenNow > 0) {
    items.push({
      id: "open-tasks",
      priority: 9,
      category: "follow-up",
      status: "needs-attention",
      title: `${k.tasksOpenNow} open task${k.tasksOpenNow === 1 ? "" : "s"} need attention`,
      reason:
        isCreditWorkspace
          ? "Open tasks often represent pending review items, document requests, or dispute follow-up that's waiting on someone."
          : "Open tasks often represent follow-up items, client work, or internal actions that haven't been closed yet.",
      nextActionLabel: "View tasks",
      href: `${portalBase}/app/services/tasks`,
    });
  }

  // ── 10. AI Outbound has no campaigns ─────────────────────────────────────
  if (!isCreditWorkspace && !serviceLocked(statuses, "ai-outbound-calls") && serviceIs(statuses, "ai-outbound-calls", "empty")) {
    items.push({
      id: "no-outbound-campaigns",
      priority: 10,
      category: "automation",
      status: "opportunity",
      title: "AI Outbound has no campaigns set up",
      reason:
        "Once contacts and Twilio are ready, AI outbound campaigns can work through a lead list automatically — but only after a campaign is created and activated.",
      nextActionLabel: "Set up first campaign",
      href: serviceHref(statuses, "ai-outbound-calls", portalBase),
    });
  }

  // Sort by priority, return top items.
  items.sort((a, b) => a.priority - b.priority);
  return items;
}

export function guidanceStatusLabel(status: GuidanceStatus): string {
  switch (status) {
    case "start-here":
      return "Start here";
    case "setup-needed":
      return "Setup needed";
    case "ready":
      return "Ready";
    case "needs-attention":
      return "Needs attention";
    case "opportunity":
      return "Growth opportunity";
    case "follow-up":
      return "Follow-up needed";
    case "blocked":
      return "Not available yet";
  }
}

export function guidanceStatusColors(status: GuidanceStatus): { badge: string; border: string; bg: string } {
  switch (status) {
    case "start-here":
      return { badge: "bg-blue-100 text-blue-700", border: "border-blue-200", bg: "bg-blue-50/60" };
    case "setup-needed":
      return { badge: "bg-amber-100 text-amber-700", border: "border-amber-200", bg: "bg-amber-50/60" };
    case "needs-attention":
      return { badge: "bg-rose-100 text-rose-700", border: "border-rose-200", bg: "bg-rose-50/60" };
    case "follow-up":
      return { badge: "bg-violet-100 text-violet-700", border: "border-violet-200", bg: "bg-violet-50/60" };
    case "blocked":
      return { badge: "bg-zinc-100 text-zinc-600", border: "border-zinc-200", bg: "bg-zinc-50" };
    case "opportunity":
      return { badge: "bg-emerald-100 text-emerald-700", border: "border-emerald-200", bg: "bg-emerald-50/40" };
    case "ready":
      return { badge: "bg-emerald-100 text-emerald-700", border: "border-emerald-200", bg: "bg-emerald-50/40" };
  }
}
