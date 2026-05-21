export type GrowthReadinessLevel = "missing" | "needs_setup" | "partially_ready" | "ready" | "active";

export type GrowthWorkspaceVariant = "portal" | "credit";

export type GrowthReadinessCategoryKey =
  | "traffic_audience"
  | "lead_capture"
  | "booking_conversion"
  | "follow_up"
  | "trust_reviews"
  | "content_nurture"
  | "provider_setup"
  | "reporting_visibility";

export type GrowthPlaybookKey =
  | "booked_calls"
  | "capture_follow_up"
  | "reactivate_pipeline"
  | "collect_reviews"
  | "publish_content"
  | "understand_performance"
  | "advance_credit_workflow";

export type GrowthAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  ctaLabel: string;
  reason: string;
  priority: number;
  categoryKey?: GrowthReadinessCategoryKey;
  playbookKey?: GrowthPlaybookKey;
  blocker?: string | null;
};

export type GrowthReadinessCategory = {
  key: GrowthReadinessCategoryKey;
  title: string;
  level: GrowthReadinessLevel;
  summary: string;
  whyItMatters: string;
  evidence: string[];
  blockers: string[];
  nextAction: GrowthAction;
};

import { buildProviderSetupWizardHref } from "@/lib/providerSetupWizard";

export type GrowthPlaybook = {
  key: GrowthPlaybookKey;
  title: string;
  level: GrowthReadinessLevel;
  summary: string;
  whyItMatters: string;
  missingSetup: string[];
  blocker: string | null;
  nextAction: GrowthAction;
};

export type GrowthReadinessPayload = {
  workspaceVariant: GrowthWorkspaceVariant;
  portalBase: "/portal" | "/credit";
  generatedAtIso: string;
  isEmptyWorkspace: boolean;
  isLowActivityWorkspace: boolean;
  summary: {
    readyOrActiveCategories: number;
    setupGaps: number;
    providerBlockers: number;
  };
  categories: GrowthReadinessCategory[];
  playbooks: GrowthPlaybook[];
  topActions: GrowthAction[];
  starterPath: GrowthAction[];
  providerBlockers: GrowthAction[];
};

export type GrowthReadinessServiceEntry = {
  state: "active" | "needs_setup" | "locked" | "coming_soon" | "paused" | "canceled";
  readiness: {
    state: "ready" | "needs_setup" | "needs_connection" | "empty" | "blocked";
    label: string;
    helper: string;
    ctaLabel: string;
    href: string | null;
  };
};

export type GrowthReadinessSnapshot = {
  workspaceVariant: GrowthWorkspaceVariant;
  portalBase: "/portal" | "/credit";
  billingConfigured: boolean;
  statuses: Record<string, GrowthReadinessServiceEntry>;
  reporting: {
    kpis: {
      bookingsCreated: number;
      reviewsCollected: number;
      leadsCreated: number;
      contactsCreated: number;
      aiCalls: number;
      textsSent: number;
      missedCalls: number;
      nurtureEnrollmentsCreated: number;
      nurtureEnrollmentsActiveNow: number;
      nurtureEnrollmentsCompleted: number;
      newsletterSentCount: number;
      blogGenerations: number;
      tasksOpenNow: number;
      tasksCompleted: number;
      inboxMessagesIn: number;
      inboxMessagesOut: number;
      aiOutboundCompleted: number;
      aiOutboundQueuedNow: number;
      aiOutboundFailed: number;
    };
    attention: {
      tasksOverdueNow: number;
      inboxNeedsReplyNow: number;
      creditReportsImported: number;
      creditReportItemsPendingNow: number;
      creditReportItemsNegativeNow: number;
      creditDisputeDraftsNow: number;
      creditDisputePdfsReadyNow: number;
      creditDisputeMarkedMailedNow: number;
    };
    externalBookingHandoff: {
      enabled: boolean;
      providerConfirmationAvailable: boolean;
      providerConfirmationConnected: boolean;
      totalHandoffs: number;
      directHandoffs: number;
      leadFirstCaptures: number;
      confirmedViaRedirect: number;
      providerConfirmedBookings: number;
      providerCanceledBookings: number;
      providerRescheduledBookings: number;
      guidance: {
        state: "disabled" | "provider_not_connected" | "no_handoffs" | "handoffs_only" | "captured_leads" | "redirect_confirmed" | "provider_confirmed";
        title: string;
        detail: string;
      };
    };
  };
  media: {
    itemsCount: number;
    foldersCount: number;
    distributionContinuity: {
      plannedPosts: number;
      approvedPosts: number;
      manuallyPostedAssets: number;
      providerReadyAssets: number;
      providerBlockedAssets: number;
      providerFailedAssets: number;
    };
  };
  sales: {
    encryptionConfigured: boolean;
    activeProvider: string | null;
    anyProviderConfigured: boolean;
    stripeConfigured: boolean;
  };
};

const LEVEL_ORDER: Record<GrowthReadinessLevel, number> = {
  missing: 0,
  needs_setup: 1,
  partially_ready: 2,
  ready: 3,
  active: 4,
};

function service(snapshot: GrowthReadinessSnapshot, slug: string): GrowthReadinessServiceEntry | null {
  return snapshot.statuses[slug] ?? null;
}

function serviceHref(snapshot: GrowthReadinessSnapshot, slug: string, fallback?: string): string {
  return service(snapshot, slug)?.readiness.href ?? fallback ?? `${snapshot.portalBase}/app/services/${slug}`;
}

function serviceReady(snapshot: GrowthReadinessSnapshot, slug: string): boolean {
  return service(snapshot, slug)?.readiness.state === "ready";
}

function serviceMissing(snapshot: GrowthReadinessSnapshot, slug: string): boolean {
  const state = service(snapshot, slug)?.readiness.state;
  return state === "needs_setup" || state === "empty" || state === "needs_connection" || state === "blocked";
}

function makeAction(input: Omit<GrowthAction, "id"> & { id?: string }): GrowthAction {
  return {
    id: input.id ?? `${input.categoryKey || input.playbookKey || "action"}-${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: input.title,
    detail: input.detail,
    href: input.href,
    ctaLabel: input.ctaLabel,
    reason: input.reason,
    priority: input.priority,
    ...(input.categoryKey ? { categoryKey: input.categoryKey } : {}),
    ...(input.playbookKey ? { playbookKey: input.playbookKey } : {}),
    ...(typeof input.blocker === "string" ? { blocker: input.blocker } : {}),
  };
}

function dedupeActions(actions: GrowthAction[], limit?: number): GrowthAction[] {
  const seen = new Set<string>();
  const out: GrowthAction[] = [];
  for (const action of actions) {
    const key = `${action.href}|${action.ctaLabel}|${action.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
    if (typeof limit === "number" && out.length >= limit) break;
  }
  return out;
}

function sortByUrgency<T extends { level: GrowthReadinessLevel; nextAction: GrowthAction }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const levelDiff = LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level];
    if (levelDiff !== 0) return levelDiff;
    return left.nextAction.priority - right.nextAction.priority;
  });
}

export function growthReadinessLevelLabel(level: GrowthReadinessLevel): string {
  switch (level) {
    case "missing":
      return "Missing";
    case "needs_setup":
      return "Needs setup";
    case "partially_ready":
      return "Partially ready";
    case "ready":
      return "Ready";
    case "active":
      return "Active";
  }
}

export function buildPortalGrowthReadiness(snapshot: GrowthReadinessSnapshot): GrowthReadinessPayload {
  const isCredit = snapshot.workspaceVariant === "credit";
  const kpis = snapshot.reporting.kpis;
  const attention = snapshot.reporting.attention;
  const handoff = snapshot.reporting.externalBookingHandoff;
  const media = snapshot.media;

  const leadVolume = kpis.leadsCreated + kpis.contactsCreated;
  const followUpVolume =
    kpis.inboxMessagesOut +
    kpis.nurtureEnrollmentsCreated +
    kpis.nurtureEnrollmentsActiveNow +
    kpis.aiOutboundCompleted +
    kpis.aiCalls +
    kpis.textsSent;
  const trustVolume = kpis.reviewsCollected + attention.creditDisputePdfsReadyNow + attention.creditDisputeMarkedMailedNow;
  const contentVolume =
    kpis.blogGenerations +
    kpis.newsletterSentCount +
    media.distributionContinuity.manuallyPostedAssets +
    media.distributionContinuity.plannedPosts +
    media.distributionContinuity.approvedPosts;
  const reportingSignals =
    leadVolume +
    kpis.bookingsCreated +
    kpis.reviewsCollected +
    kpis.tasksCompleted +
    kpis.inboxMessagesIn +
    kpis.inboxMessagesOut +
    kpis.aiCalls +
    kpis.blogGenerations +
    kpis.newsletterSentCount +
    attention.creditReportsImported +
    attention.creditDisputeDraftsNow +
    media.distributionContinuity.manuallyPostedAssets;

  const isEmptyWorkspace =
    leadVolume === 0 &&
    kpis.bookingsCreated === 0 &&
    followUpVolume === 0 &&
    trustVolume === 0 &&
    contentVolume === 0 &&
    attention.creditReportsImported === 0 &&
    attention.creditDisputeDraftsNow === 0 &&
    attention.creditDisputePdfsReadyNow === 0 &&
    media.itemsCount === 0;
  const isLowActivityWorkspace = isEmptyWorkspace || reportingSignals <= (isCredit ? 3 : 4);

  const providerBlockers: GrowthAction[] = [];

  if (!snapshot.billingConfigured) {
    providerBlockers.push(
      makeAction({
        id: "provider-billing",
        title: isCredit ? "Billing is not connected for credit workflow upgrades" : "Billing is not connected for paid workflow access",
        detail: isCredit
          ? "Without billing, paid credit services and related usage cannot activate for this workspace."
          : "Without billing, paid services and usage-based credits stay unavailable for this workspace.",
        href: `${snapshot.portalBase}/app/billing`,
        ctaLabel: "Open billing",
        reason: "Billing controls access to paid workflow surfaces and credits.",
        priority: 1,
        categoryKey: "provider_setup",
        blocker: "Billing is not connected.",
      }),
    );
  }

  const twilioMissing = ["ai-receptionist", "ai-outbound-calls"].some(
    (slug) => service(snapshot, slug)?.readiness.state === "needs_connection",
  );
  if (twilioMissing) {
    providerBlockers.push(
      makeAction({
        id: "provider-twilio",
        title: "Twilio is still missing",
        detail: isCredit
          ? "Consultation calls, missed-call recovery, and outbound follow-up stay blocked until Twilio is connected."
          : "Call, SMS, and AI follow-up flows stay blocked until Twilio is connected.",
        href: buildProviderSetupWizardHref(snapshot.portalBase, "twilio_sms"),
        ctaLabel: "Open provider setup",
        reason: "Purely should not recommend live call or SMS steps without a real provider connection.",
        priority: 2,
        categoryKey: "provider_setup",
        blocker: "Twilio is not connected.",
      }),
    );
  }

  if (handoff.guidance.state === "provider_not_connected") {
    providerBlockers.push(
      makeAction({
        id: "provider-booking-confirmation",
        title: isCredit ? "Booking provider confirmation is not connected" : "Booking confirmation provider is not connected",
        detail: isCredit
          ? "Purely can capture booking handoffs, but confirmed consultation proof stays incomplete until the provider connection is finished."
          : "Purely can track handoffs into booking, but confirmed appointment proof stays incomplete until the provider connection is finished.",
        href: buildProviderSetupWizardHref(snapshot.portalBase, "booking"),
        ctaLabel: "Open provider setup",
        reason: "Redirects and handoffs are not the same as a verified provider-confirmed booking.",
        priority: 3,
        categoryKey: "provider_setup",
        blocker: "Booking provider confirmation is not connected.",
      }),
    );
  }

  if (!snapshot.sales.anyProviderConfigured) {
    providerBlockers.push(
      makeAction({
        id: "provider-payment-reporting",
        title: "Payment reporting provider is not connected",
        detail: "Purely cannot prove processor-backed revenue totals until a supported payment provider is connected.",
        href: buildProviderSetupWizardHref(snapshot.portalBase, "payment"),
        ctaLabel: "Open provider setup",
        reason: "Revenue readiness should stay honest about what Purely can and cannot prove today.",
        priority: 4,
        categoryKey: "provider_setup",
        blocker: !snapshot.sales.encryptionConfigured
          ? "Secure integration storage is not configured, so provider credentials cannot be saved yet."
          : "No payment reporting provider is connected.",
      }),
    );
  }

  const socialSoftGate =
    media.itemsCount > 0 &&
    (media.distributionContinuity.providerBlockedAssets > 0 ||
      media.distributionContinuity.plannedPosts > 0 ||
      media.distributionContinuity.approvedPosts > 0 ||
      media.distributionContinuity.manuallyPostedAssets > 0);
  if (socialSoftGate) {
    providerBlockers.push(
      makeAction({
        id: "provider-social-soft-gate",
        title: "Social provider publishing is still manual-only",
        detail:
          "Manual posting is available now. Direct Meta and Instagram publishing is postponed here and should not be treated as connected provider publishing.",
        href: buildProviderSetupWizardHref(snapshot.portalBase, "meta"),
        ctaLabel: "Open provider setup",
        reason: "The guidance must stay truthful about manual posting versus a real provider connection.",
        priority: 5,
        categoryKey: "provider_setup",
        blocker: "Direct Meta and Instagram publishing is not connected in this workspace.",
      }),
    );
  }

  const categories: GrowthReadinessCategory[] = [];

  const trafficAction = makeAction({
    title: isCredit ? "Create an intake path" : "Create an audience source",
    detail: isCredit
      ? "Start with a consultation funnel, intake flow, or first contact source so cases can enter the workspace."
      : "Start with a funnel, form, or lead source so new people can enter the workspace.",
    href: service(snapshot, "funnel-builder")?.readiness.state === "empty"
      ? serviceHref(snapshot, "funnel-builder")
      : serviceHref(snapshot, "lead-scraping"),
    ctaLabel: service(snapshot, "funnel-builder")?.readiness.state === "empty" ? "Create funnel" : "Open lead scraping",
    reason: isCredit
      ? "Without intake, there is no steady path into consultations, reports, or dispute work."
      : "Without traffic or a lead source, the rest of the growth stack stays idle.",
    priority: 10,
    categoryKey: "traffic_audience",
  });
  const trafficLevel: GrowthReadinessLevel = leadVolume === 0
    ? serviceReady(snapshot, "funnel-builder") || !serviceMissing(snapshot, "lead-scraping")
      ? "needs_setup"
      : "missing"
    : kpis.leadsCreated > 0 && (serviceReady(snapshot, "funnel-builder") || kpis.aiCalls > 0 || kpis.missedCalls > 0)
      ? "active"
      : "ready";
  categories.push({
    key: "traffic_audience",
    title: isCredit ? "Intake / audience source" : "Traffic / audience source",
    level: trafficLevel,
    summary:
      trafficLevel === "missing"
        ? isCredit
          ? "No client intake source is producing contacts or consultations yet."
          : "No audience source is producing leads or contacts yet."
        : trafficLevel === "needs_setup"
          ? isCredit
            ? "The intake path exists, but it is not producing tracked client activity yet."
            : "The acquisition path exists, but it is not producing tracked lead activity yet."
          : trafficLevel === "active"
            ? isCredit
              ? "Tracked intake is already feeding this workspace."
              : "Tracked lead activity is already entering the workspace."
            : isCredit
              ? "The workspace has at least one intake source on file."
              : "The workspace has at least one audience source on file.",
    whyItMatters: isCredit
      ? "Cases do not progress without a reliable intake path into consultations, reports, and follow-up."
      : "Every downstream workflow depends on a real source of leads entering the system.",
    evidence: [
      `${leadVolume.toLocaleString()} tracked lead or contact record${leadVolume === 1 ? "" : "s"}`,
      service(snapshot, "funnel-builder")?.readiness.label || "Funnel status unavailable",
    ],
    blockers: trafficLevel === "missing" ? [trafficAction.reason] : [],
    nextAction: trafficAction,
  });

  const captureAction = makeAction({
    title: isCredit ? "Capture the first real client record" : "Capture the first real lead",
    detail: isCredit
      ? "Import a report, add a contact, or route a consultation inquiry into the workspace."
      : "Publish a funnel or intake path so the first lead lands in Purely.",
    href: isCredit
      ? serviceHref(snapshot, "credit-reports", `${snapshot.portalBase}/app/services/credit-reports`)
      : serviceHref(snapshot, "funnel-builder"),
    ctaLabel: isCredit ? "Open credit reports" : "Open funnels",
    reason: isCredit
      ? "Without stored client records, there is nothing to review, schedule, or move through dispute workflow."
      : "Without stored leads, follow-up, booking, and reporting cannot prove anything useful.",
    priority: 20,
    categoryKey: "lead_capture",
  });
  const captureLevel: GrowthReadinessLevel = leadVolume === 0
    ? serviceReady(snapshot, isCredit ? "credit-reports" : "funnel-builder")
      ? "needs_setup"
      : "missing"
    : leadVolume >= 3 || attention.creditReportsImported > 0
      ? "active"
      : "ready";
  categories.push({
    key: "lead_capture",
    title: isCredit ? "Lead capture / client records" : "Lead capture",
    level: captureLevel,
    summary:
      captureLevel === "missing"
        ? isCredit
          ? "No contacts or imported reports are stored yet."
          : "No tracked leads or contacts are stored yet."
        : captureLevel === "needs_setup"
          ? isCredit
            ? "The workspace can capture clients, but no stored records have landed yet."
            : "Lead capture routes exist, but nothing has landed yet."
          : captureLevel === "active"
            ? isCredit
              ? "Client records are already entering the workspace."
              : "Tracked leads are already entering the workspace."
            : isCredit
              ? "The workspace has at least one stored client record."
              : "The workspace has at least one tracked lead or contact.",
    whyItMatters: isCredit
      ? "Stored client records turn scattered intake into something the team can work from."
      : "Lead capture is the handoff point from marketing into follow-up and booking.",
    evidence: [
      `${kpis.leadsCreated.toLocaleString()} leads`,
      `${kpis.contactsCreated.toLocaleString()} contacts`,
      `${attention.creditReportsImported.toLocaleString()} imported report${attention.creditReportsImported === 1 ? "" : "s"}`,
    ],
    blockers: captureLevel === "missing" ? [captureAction.reason] : [],
    nextAction: captureAction,
  });

  const bookingAction = makeAction({
    title: isCredit ? "Finish consultation booking setup" : "Finish booking setup",
    detail: isCredit
      ? "Turn on the consultation flow and connect confirmation if you want confirmed appointment proof later."
      : "Turn on the booking path and connect provider confirmation if you want stronger appointment proof later.",
    href: serviceHref(snapshot, "booking", `${snapshot.portalBase}/app/services/booking?tab=settings`),
    ctaLabel: service(snapshot, "booking")?.readiness.ctaLabel || "Open booking settings",
    reason: isCredit
      ? "A working consultation path shortens the jump from inquiry to scheduled call."
      : "A working booking path is the fastest route from lead interest to a scheduled conversation.",
    priority: 30,
    categoryKey: "booking_conversion",
    blocker: handoff.guidance.state === "provider_not_connected" ? "Provider confirmation is not connected." : null,
  });
  const bookingLevel: GrowthReadinessLevel = service(snapshot, "booking")?.readiness.state === "needs_setup"
    ? "needs_setup"
    : kpis.bookingsCreated > 0 || handoff.providerConfirmedBookings > 0
      ? "active"
      : handoff.totalHandoffs > 0 || handoff.leadFirstCaptures > 0 || serviceReady(snapshot, "booking")
        ? "ready"
        : "missing";
  categories.push({
    key: "booking_conversion",
    title: isCredit ? "Booking / consultation path" : "Booking / conversion path",
    level: bookingLevel,
    summary:
      bookingLevel === "needs_setup"
        ? isCredit
          ? "Consultation booking is enabled as a service but not configured live yet."
          : "Booking exists as a service but is not configured live yet."
        : bookingLevel === "active"
          ? isCredit
            ? "Tracked consultation activity already exists in this workspace."
            : "Tracked booking activity already exists in this workspace."
          : bookingLevel === "ready"
            ? isCredit
              ? "The consultation path is live, but stronger confirmation or more usage is still the next gap."
              : "The booking path is live, but stronger confirmation or more usage is still the next gap."
            : isCredit
              ? "No live consultation path is producing tracked activity yet."
              : "No live booking path is producing tracked activity yet.",
    whyItMatters: isCredit
      ? "Consultation booking is the clearest next step from inquiry to revenue-bearing work."
      : "A clear booking path converts interest into scheduled calls without manual chasing.",
    evidence: [
      `${kpis.bookingsCreated.toLocaleString()} booking${kpis.bookingsCreated === 1 ? "" : "s"} created`,
      `${handoff.totalHandoffs.toLocaleString()} tracked booking handoff${handoff.totalHandoffs === 1 ? "" : "s"}`,
      handoff.guidance.title,
    ],
    blockers: handoff.guidance.state === "provider_not_connected" ? ["Provider confirmation is still missing, so Purely cannot prove confirmed bookings from the provider yet."] : [],
    nextAction: bookingAction,
  });

  const followUpAction = makeAction({
    title: isCredit ? "Create the next follow-up step" : "Create the next follow-up path",
    detail: isCredit
      ? "Use tasks, inbox, nurture, or consultation outreach so imported reports and inquiries do not stall."
      : "Use nurture, inbox, tasks, or outbound follow-up so new leads do not go cold.",
    href: service(snapshot, "tasks")?.readiness.state === "empty"
      ? serviceHref(snapshot, "tasks")
      : serviceHref(snapshot, isCredit ? "tasks" : "nurture-campaigns"),
    ctaLabel: service(snapshot, "tasks")?.readiness.state === "empty" ? "Open tasks" : isCredit ? "Open tasks" : "Open nurture campaigns",
    reason: isCredit
      ? "Credit files slip when there is no explicit next owner, task, or client follow-up step."
      : "Leads rarely convert without an explicit follow-up channel or task."
    ,
    priority: 40,
    categoryKey: "follow_up",
  });
  const followUpLevel: GrowthReadinessLevel = followUpVolume === 0 && kpis.tasksOpenNow === 0 && attention.creditDisputeDraftsNow === 0
    ? leadVolume > 0 || attention.creditReportsImported > 0
      ? "needs_setup"
      : "missing"
    : kpis.tasksCompleted > 0 || kpis.inboxMessagesOut > 0 || kpis.nurtureEnrollmentsCompleted > 0 || attention.creditDisputeMarkedMailedNow > 0
      ? "active"
      : "ready";
  categories.push({
    key: "follow_up",
    title: "Follow-up",
    level: followUpLevel,
    summary:
      followUpLevel === "missing"
        ? isCredit
          ? "No tracked follow-up or case-motion workflow is running yet."
          : "No tracked follow-up workflow is running yet."
        : followUpLevel === "needs_setup"
          ? isCredit
            ? "Client records exist, but there is still no active follow-up or case-motion step."
            : "Leads exist, but there is still no active follow-up path."
          : followUpLevel === "active"
            ? isCredit
              ? "Tasks, outreach, or dispute workflow are already moving client work forward."
              : "Tracked follow-up activity is already moving leads forward."
            : isCredit
              ? "At least one follow-up mechanism is active in the workspace."
              : "At least one follow-up mechanism is active in the workspace.",
    whyItMatters: isCredit
      ? "Consultations, document collection, and disputes all depend on explicit follow-up steps."
      : "Follow-up is what turns stored leads into replies, bookings, and revenue.",
    evidence: [
      `${kpis.tasksOpenNow.toLocaleString()} open task${kpis.tasksOpenNow === 1 ? "" : "s"}`,
      `${kpis.inboxMessagesOut.toLocaleString()} outbound message${kpis.inboxMessagesOut === 1 ? "" : "s"}`,
      `${kpis.nurtureEnrollmentsActiveNow.toLocaleString()} active nurture enrollment${kpis.nurtureEnrollmentsActiveNow === 1 ? "" : "s"}`,
    ],
    blockers: followUpLevel === "needs_setup" ? [followUpAction.reason] : [],
    nextAction: followUpAction,
  });

  const trustAction = makeAction({
    title: isCredit ? "Turn on client proof collection" : "Turn on review collection",
    detail: isCredit
      ? "Use reviews or client-proof collection so new prospects can trust the next step."
      : "Use review collection so new prospects can trust the business before they book.",
    href: serviceHref(snapshot, "reviews"),
    ctaLabel: service(snapshot, "reviews")?.readiness.ctaLabel || "Open reviews",
    reason: isCredit
      ? "Proof reduces hesitation for consultations and longer case engagements."
      : "Reviews reduce friction and help more leads convert.",
    priority: 50,
    categoryKey: "trust_reviews",
  });
  const trustLevel: GrowthReadinessLevel = trustVolume === 0
    ? serviceReady(snapshot, "reviews")
      ? "needs_setup"
      : "missing"
    : kpis.reviewsCollected > 0
      ? "active"
      : "ready";
  categories.push({
    key: "trust_reviews",
    title: isCredit ? "Trust / client proof" : "Trust / reviews",
    level: trustLevel,
    summary:
      trustLevel === "missing"
        ? isCredit
          ? "No client-proof signal is stored yet."
          : "No review or trust signal is stored yet."
        : trustLevel === "needs_setup"
          ? isCredit
            ? "The proof-collection path exists, but nothing has been captured yet."
            : "Review collection exists, but nothing has been captured yet."
          : trustLevel === "active"
            ? isCredit
              ? "Stored client proof already exists in the workspace."
              : "Stored review proof already exists in the workspace."
            : isCredit
              ? "The workspace has at least one usable trust signal."
              : "The workspace has at least one usable trust signal.",
    whyItMatters: isCredit
      ? "Consultation and case-conversion rates improve when prospects can see real client proof."
      : "Trust signals make cold leads more willing to book.",
    evidence: [
      `${kpis.reviewsCollected.toLocaleString()} review${kpis.reviewsCollected === 1 ? "" : "s"} collected`,
      `${attention.creditDisputePdfsReadyNow.toLocaleString()} dispute PDF${attention.creditDisputePdfsReadyNow === 1 ? "" : "s"} ready`,
    ],
    blockers: trustLevel === "missing" ? [trustAction.reason] : [],
    nextAction: trustAction,
  });

  const contentAction = makeAction({
    title: isCredit ? "Use content as proof and nurture" : "Publish trust-building content",
    detail: isCredit
      ? "Upload proof assets, draft education content, and use manual posting or newsletters without pretending provider publishing is connected."
      : "Use media, blogs, or newsletters to keep the business visible without pretending direct social publishing is connected.",
    href: media.itemsCount === 0 ? serviceHref(snapshot, "media-library") : serviceHref(snapshot, "blogs"),
    ctaLabel: media.itemsCount === 0 ? "Open media library" : isCredit ? "Open blogs" : "Open blogs",
    reason: isCredit
      ? "Education and proof keep credit leads warm between intake and consultation."
      : "Content gives leads proof, repeat exposure, and reasons to return.",
    priority: 60,
    categoryKey: "content_nurture",
    blocker: socialSoftGate ? "Manual posting is available now. Direct Meta publishing is postponed." : null,
  });
  const contentLevel: GrowthReadinessLevel = contentVolume === 0 && media.itemsCount === 0
    ? "missing"
    : contentVolume === 0
      ? "needs_setup"
      : kpis.blogGenerations > 0 || kpis.newsletterSentCount > 0 || media.distributionContinuity.manuallyPostedAssets > 0
        ? "active"
        : "ready";
  categories.push({
    key: "content_nurture",
    title: isCredit ? "Content / nurture" : "Content / nurture",
    level: contentLevel,
    summary:
      contentLevel === "missing"
        ? isCredit
          ? "No proof assets, education content, or nurture content exist yet."
          : "No reusable media or nurture content exists yet."
        : contentLevel === "needs_setup"
          ? isCredit
            ? "Assets exist, but no tracked education or nurture output has been used yet."
            : "Assets exist, but no tracked content output has been used yet."
          : contentLevel === "active"
            ? isCredit
              ? "Tracked education or manual content use already exists."
              : "Tracked content activity already exists."
            : isCredit
              ? "The workspace has at least one content asset or draft in motion."
              : "The workspace has at least one content asset or draft in motion.",
    whyItMatters: isCredit
      ? "Education content turns credit complexity into trust and next steps."
      : "Consistent content keeps the brand visible and improves trust over time.",
    evidence: [
      `${media.itemsCount.toLocaleString()} media asset${media.itemsCount === 1 ? "" : "s"}`,
      `${kpis.blogGenerations.toLocaleString()} blog generation${kpis.blogGenerations === 1 ? "" : "s"}`,
      `${media.distributionContinuity.manuallyPostedAssets.toLocaleString()} manually tracked post${media.distributionContinuity.manuallyPostedAssets === 1 ? "" : "s"}`,
    ],
    blockers: socialSoftGate ? ["Manual social posting is available now. Direct Meta and Instagram publishing is postponed and not connected here."] : [],
    nextAction: contentAction,
  });

  const providerAction = providerBlockers[0] ?? makeAction({
    id: "provider-open-settings",
    title: "Review provider setup",
    detail: "Check Twilio, email, booking, payment reporting, and manual social posture from one setup surface.",
    href: buildProviderSetupWizardHref(snapshot.portalBase),
    ctaLabel: "Open provider setup",
    reason: "Provider readiness determines which actions Purely can recommend truthfully.",
    priority: 70,
    categoryKey: "provider_setup",
  });
  const providerLevel: GrowthReadinessLevel = providerBlockers.length >= 3
    ? "missing"
    : providerBlockers.length >= 1
      ? "needs_setup"
      : snapshot.sales.anyProviderConfigured || handoff.providerConfirmationConnected || !twilioMissing
        ? "ready"
        : "partially_ready";
  categories.push({
    key: "provider_setup",
    title: "Provider setup",
    level: providerLevel,
    summary:
      providerBlockers.length > 0
        ? `${providerBlockers.length} provider blocker${providerBlockers.length === 1 ? "" : "s"} are still limiting what Purely can do honestly.`
        : "Core provider requirements are in a usable state for the currently active workflows.",
    whyItMatters: "Guidance should only recommend actions that real providers can actually support in this workspace.",
    evidence: [
      snapshot.sales.anyProviderConfigured ? "Payment reporting provider connected" : "No payment reporting provider connected",
      twilioMissing ? "Twilio missing" : "Twilio available or not required for current steps",
      socialSoftGate ? "Manual-only social continuity in use" : "No active social provider blocker currently surfaced",
    ],
    blockers: providerBlockers.map((item) => item.blocker || item.detail),
    nextAction: providerAction,
  });

  const reportingAction = makeAction({
    title: isEmptyWorkspace
      ? isCredit
        ? "Create activity before relying on reporting"
        : "Create activity before relying on reporting"
      : handoff.guidance.state === "provider_not_connected"
        ? "Close the strongest proof gap"
        : "Review what Purely can prove now",
    detail: isEmptyWorkspace
      ? isCredit
        ? "Import a report, create a consultation path, or add the first task so reporting has something real to measure."
        : "Create a lead, booking path, or media asset before expecting reporting to say anything useful."
      : handoff.guidance.state === "provider_not_connected"
        ? "Provider-backed booking confirmation is the next major visibility gap after basic activity exists."
        : "Open reporting to review the current signal, then close the next weakest category from there.",
    href: isEmptyWorkspace
      ? isCredit
        ? serviceHref(snapshot, "credit-reports", `${snapshot.portalBase}/app/services/credit-reports`)
        : serviceHref(snapshot, "funnel-builder")
      : handoff.guidance.state === "provider_not_connected"
        ? serviceHref(snapshot, "booking", `${snapshot.portalBase}/app/services/booking?tab=settings`)
        : `${snapshot.portalBase}/app/services/reporting`,
    ctaLabel: isEmptyWorkspace
      ? isCredit
        ? "Open credit reports"
        : "Open funnels"
      : handoff.guidance.state === "provider_not_connected"
        ? "Open booking settings"
        : "Open reporting",
    reason: isEmptyWorkspace
      ? "Reporting can only summarize stored activity."
      : "The next reporting gap should point to a concrete setup or workflow step, not generic advice.",
    priority: 80,
    categoryKey: "reporting_visibility",
    blocker: handoff.guidance.state === "provider_not_connected" ? "Provider confirmation is not connected." : null,
  });
  const reportingLevel: GrowthReadinessLevel = isEmptyWorkspace
    ? "missing"
    : reportingSignals <= (isCredit ? 2 : 3)
      ? "needs_setup"
      : handoff.providerConfirmedBookings > 0 || snapshot.sales.anyProviderConfigured || media.distributionContinuity.manuallyPostedAssets > 0
        ? "active"
        : "ready";
  categories.push({
    key: "reporting_visibility",
    title: "Reporting visibility",
    level: reportingLevel,
    summary:
      reportingLevel === "missing"
        ? "Purely does not have enough stored activity yet to produce meaningful reporting guidance."
        : reportingLevel === "needs_setup"
          ? "Purely can show basic activity, but key proof gaps still limit how strong the reporting story is."
          : reportingLevel === "active"
            ? "Purely already has enough stored activity to show operational guidance and some stronger proof signals."
            : "Purely can report on current activity, but more proof is still available if the next setup gap closes.",
    whyItMatters: "Reporting should explain what Purely can currently prove and what real step closes the next gap.",
    evidence: [
      `${reportingSignals.toLocaleString()} tracked reporting signal${reportingSignals === 1 ? "" : "s"}`,
      handoff.guidance.title,
      snapshot.sales.anyProviderConfigured ? "Sales provider connected" : "Sales provider not connected",
    ],
    blockers: reportingLevel === "needs_setup" && handoff.guidance.state === "provider_not_connected"
      ? ["Booking confirmation provider is not connected, so confirmed bookings cannot be proven here yet."]
      : [],
    nextAction: reportingAction,
  });

  const categoryMap = new Map(categories.map((item) => [item.key, item] as const));

  const playbooks: GrowthPlaybook[] = [];

  const bookedCallsLevel = categoryMap.get("booking_conversion")?.level ?? "missing";
  playbooks.push({
    key: "booked_calls",
    title: isCredit ? "Book more consultations" : "Get more booked calls",
    level: bookedCallsLevel,
    summary: categoryMap.get("booking_conversion")?.summary || "The booking path needs work.",
    whyItMatters: isCredit
      ? "Consultations are the clearest step from interest to client work."
      : "Booked calls are the clearest step from lead interest to revenue conversations.",
    missingSetup: [
      ...(service(snapshot, "booking")?.readiness.state === "needs_setup" ? [service(snapshot, "booking")?.readiness.helper || "Finish booking setup."] : []),
      ...(handoff.guidance.state === "provider_not_connected" ? ["Connect booking provider confirmation for stronger proof."] : []),
    ],
    blocker: handoff.guidance.state === "provider_not_connected" ? "Provider confirmation is not connected yet." : null,
    nextAction: makeAction({ ...bookingAction, playbookKey: "booked_calls" }),
  });

  const capturePlaybookAction = makeAction({
    ...(leadVolume === 0 ? captureAction : followUpAction),
    playbookKey: "capture_follow_up",
  });
  playbooks.push({
    key: "capture_follow_up",
    title: isCredit ? "Capture and follow up with new clients" : "Capture and follow up with new leads",
    level: LEVEL_ORDER[captureLevel] < LEVEL_ORDER[followUpLevel] ? captureLevel : followUpLevel,
    summary: leadVolume === 0
      ? captureAction.detail
      : followUpLevel === "needs_setup"
        ? followUpAction.detail
        : isCredit
          ? "New client records exist, and the next step is keeping them moving with visible follow-up."
          : "New leads exist, and the next step is keeping them moving with visible follow-up.",
    whyItMatters: isCredit
      ? "New inquiries only turn into cases when intake and follow-up stay connected."
      : "Capture and follow-up are the foundation of repeatable conversion.",
    missingSetup: [
      ...(leadVolume === 0 ? [captureAction.reason] : []),
      ...(followUpLevel === "needs_setup" ? [followUpAction.reason] : []),
    ],
    blocker: twilioMissing && !isCredit ? "Twilio is missing for call and SMS follow-up." : null,
    nextAction: capturePlaybookAction,
  });

  const reactivateLevel: GrowthReadinessLevel = kpis.tasksOpenNow > 0 || attention.inboxNeedsReplyNow > 0 || attention.creditReportItemsPendingNow > 0
    ? "needs_setup"
    : followUpLevel === "active"
      ? "ready"
      : "partially_ready";
  const reactivateAction = makeAction({
    title: isCredit ? "Work the stalled queue" : "Work the stalled lead queue",
    detail: isCredit
      ? "Open tasks, reply-needed conversations, or pending report items and move them to the next step."
      : "Open tasks or reply-needed conversations and move older leads to the next step.",
    href: kpis.tasksOpenNow > 0
      ? serviceHref(snapshot, "tasks")
      : `${snapshot.portalBase}/app/services/inbox/email`,
    ctaLabel: kpis.tasksOpenNow > 0 ? "Open tasks" : "Open inbox",
    reason: isCredit
      ? "Stalled files create revenue drag when consultations, documents, or disputes stop moving."
      : "Old leads do not reactivate themselves.",
    priority: 45,
    playbookKey: "reactivate_pipeline",
    categoryKey: "follow_up",
  });
  playbooks.push({
    key: isCredit ? "advance_credit_workflow" : "reactivate_pipeline",
    title: isCredit ? "Move imported reports into dispute work" : "Reactivate old leads",
    level: isCredit
      ? attention.creditReportsImported > 0 && attention.creditDisputeDraftsNow === 0
        ? "needs_setup"
        : attention.creditDisputeDraftsNow > 0 || attention.creditDisputeMarkedMailedNow > 0
          ? "ready"
          : reactivateLevel
      : reactivateLevel,
    summary: isCredit
      ? attention.creditReportsImported > 0 && attention.creditDisputeDraftsNow === 0
        ? "Reports are imported, but the dispute workflow has not started moving yet."
        : attention.creditDisputeDraftsNow > 0
          ? "Dispute work exists; the next step is keeping tasks and mailed status moving honestly."
          : "No imported reports are in motion yet, so dispute workflow cannot do useful work."
      : reactivateAction.detail,
    whyItMatters: isCredit
      ? "Imported reports only create value when they move into tasks, drafts, PDFs, and mailed follow-up."
      : "Reactivation closes the gap between captured interest and real follow-up.",
    missingSetup: isCredit
      ? [
          ...(attention.creditReportsImported === 0 ? ["Import the first credit report or case record."] : []),
          ...(attention.creditReportsImported > 0 && attention.creditDisputeDraftsNow === 0 ? ["Generate the first dispute draft."] : []),
        ]
      : [
          ...(kpis.tasksOpenNow === 0 && attention.inboxNeedsReplyNow === 0 ? ["No explicit stalled queue is being worked from tasks or inbox yet."] : []),
        ],
    blocker: null,
    nextAction: makeAction({
      ...(isCredit
        ? {
            title: attention.creditReportsImported === 0 ? "Import the first report" : "Open dispute letters",
            detail: attention.creditReportsImported === 0
              ? "Bring the first client report into the workspace before expecting dispute workflow guidance."
              : "Open dispute letters to turn imported reports into actual draft work.",
            href: attention.creditReportsImported === 0
              ? serviceHref(snapshot, "credit-reports", `${snapshot.portalBase}/app/services/credit-reports`)
              : serviceHref(snapshot, "dispute-letters", `${snapshot.portalBase}/app/services/dispute-letters`),
            ctaLabel: attention.creditReportsImported === 0 ? "Open credit reports" : "Open dispute letters",
            reason: "Credit workflow should stay grounded in stored reports and draft states.",
            priority: 46,
            playbookKey: "advance_credit_workflow" as GrowthPlaybookKey,
            categoryKey: "follow_up" as GrowthReadinessCategoryKey,
          }
        : reactivateAction),
    }),
  });

  playbooks.push({
    key: "collect_reviews",
    title: isCredit ? "Collect more client proof" : "Collect more reviews",
    level: trustLevel,
    summary: categoryMap.get("trust_reviews")?.summary || trustAction.detail,
    whyItMatters: trustAction.reason,
    missingSetup: trustLevel === "missing" || trustLevel === "needs_setup" ? [trustAction.reason] : [],
    blocker: null,
    nextAction: makeAction({ ...trustAction, playbookKey: "collect_reviews" }),
  });

  playbooks.push({
    key: "publish_content",
    title: isCredit ? "Publish trust-building education" : "Publish trust-building content",
    level: contentLevel,
    summary: categoryMap.get("content_nurture")?.summary || contentAction.detail,
    whyItMatters: contentAction.reason,
    missingSetup: [
      ...(contentLevel === "missing" ? ["There are no reusable media or nurture assets yet."] : []),
      ...(socialSoftGate ? ["Manual posting is available now. Direct Meta publishing is still postponed."] : []),
    ],
    blocker: socialSoftGate ? "Manual posting only. Direct Meta publishing is postponed." : null,
    nextAction: makeAction({ ...contentAction, playbookKey: "publish_content" }),
  });

  playbooks.push({
    key: "understand_performance",
    title: "Understand performance",
    level: reportingLevel,
    summary: categoryMap.get("reporting_visibility")?.summary || reportingAction.detail,
    whyItMatters: "Purely should only make performance claims from stored signals it can actually prove.",
    missingSetup: [
      ...(isEmptyWorkspace ? ["Create real activity before expecting useful reporting."] : []),
      ...(handoff.guidance.state === "provider_not_connected" ? ["Connect booking provider confirmation for stronger conversion proof."] : []),
      ...(!snapshot.sales.anyProviderConfigured ? ["Connect a payment reporting provider before relying on revenue totals."] : []),
    ],
    blocker: !snapshot.sales.anyProviderConfigured
      ? "Revenue totals are not processor-backed yet."
      : handoff.guidance.state === "provider_not_connected"
        ? "Booking confirmation provider is not connected yet."
        : null,
    nextAction: makeAction({ ...reportingAction, playbookKey: "understand_performance" }),
  });

  const sortedPlaybooks = sortByUrgency(playbooks);
  const topActions = dedupeActions(
    sortedPlaybooks
      .filter((item) => item.level !== "active")
      .map((item) => item.nextAction)
      .concat(providerBlockers)
      .sort((left, right) => left.priority - right.priority),
    3,
  );

  const starterPath = dedupeActions(
    isCredit
      ? [
          makeAction({
            id: "starter-report",
            title: "Import the first report or intake record",
            detail: "Start with a real client record so the credit workspace has something concrete to work from.",
            href: serviceHref(snapshot, "credit-reports", `${snapshot.portalBase}/app/services/credit-reports`),
            ctaLabel: "Open credit reports",
            reason: "Reporting and dispute workflow need stored client data first.",
            priority: 1,
          }),
          makeAction({
            id: "starter-booking",
            title: "Turn on consultation booking",
            detail: "Make it easy to schedule the first consult once inquiry or intake is live.",
            href: serviceHref(snapshot, "booking", `${snapshot.portalBase}/app/services/booking?tab=settings`),
            ctaLabel: "Open booking settings",
            reason: "Consultations turn intake into a concrete next step.",
            priority: 2,
          }),
          makeAction({
            id: "starter-media",
            title: "Upload proof or content assets",
            detail: "Store PDFs, proof assets, or social content so the team has reusable material right away.",
            href: serviceHref(snapshot, "media-library"),
            ctaLabel: "Open media library",
            reason: "Reusable assets support trust, education, and follow-up.",
            priority: 3,
          }),
          makeAction({
            id: "starter-task",
            title: "Create the first task",
            detail: "Assign the next follow-up step so the first file does not stall.",
            href: serviceHref(snapshot, "tasks"),
            ctaLabel: "Open tasks",
            reason: "A visible next owner keeps work moving.",
            priority: 4,
          }),
          makeAction({
            id: "starter-reporting",
            title: "Open reporting after activity exists",
            detail: "Come back to reporting once intake, booking, or task activity has been stored.",
            href: `${snapshot.portalBase}/app/services/reporting`,
            ctaLabel: "Open reporting",
            reason: "Reporting only becomes useful after real activity exists.",
            priority: 5,
          }),
        ]
      : [
          makeAction({
            id: "starter-capture",
            title: "Create or capture the first lead",
            detail: "Start with a funnel, form, or lead source so the rest of the growth stack has someone to work on.",
            href: serviceHref(snapshot, "funnel-builder"),
            ctaLabel: "Open funnels",
            reason: "No lead source means no downstream growth workflow.",
            priority: 1,
          }),
          makeAction({
            id: "starter-booking",
            title: "Add a booking link",
            detail: "Turn on booking before you start sending traffic to the business.",
            href: serviceHref(snapshot, "booking", `${snapshot.portalBase}/app/services/booking?tab=settings`),
            ctaLabel: "Open booking settings",
            reason: "A booking path converts attention into scheduled calls.",
            priority: 2,
          }),
          makeAction({
            id: "starter-media",
            title: "Upload the first media asset",
            detail: "Store at least one proof asset so the business has reusable content for manual posting and trust-building.",
            href: serviceHref(snapshot, "media-library"),
            ctaLabel: "Open media library",
            reason: "Assets support content and trust workflows.",
            priority: 3,
          }),
          makeAction({
            id: "starter-follow-up",
            title: "Create the first follow-up step",
            detail: "Use tasks, inbox, or nurture once the first lead exists so nothing sits idle.",
            href: serviceHref(snapshot, "tasks"),
            ctaLabel: "Open tasks",
            reason: "Leads convert when the next step is explicit.",
            priority: 4,
          }),
          makeAction({
            id: "starter-reporting",
            title: "Open reporting after activity exists",
            detail: "Come back to reporting once leads, booking, or content activity has been stored.",
            href: `${snapshot.portalBase}/app/services/reporting`,
            ctaLabel: "Open reporting",
            reason: "Reporting only becomes useful after real activity exists.",
            priority: 5,
          }),
        ],
    5,
  );

  return {
    workspaceVariant: snapshot.workspaceVariant,
    portalBase: snapshot.portalBase,
    generatedAtIso: new Date().toISOString(),
    isEmptyWorkspace,
    isLowActivityWorkspace,
    summary: {
      readyOrActiveCategories: categories.filter((item) => item.level === "ready" || item.level === "active").length,
      setupGaps: categories.filter((item) => item.level === "missing" || item.level === "needs_setup").length,
      providerBlockers: providerBlockers.length,
    },
    categories,
    playbooks: sortedPlaybooks,
    topActions,
    starterPath,
    providerBlockers,
  };
}