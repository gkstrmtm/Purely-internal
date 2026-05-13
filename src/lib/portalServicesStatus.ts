import { prisma } from "@/lib/db";
import { resolveEntitlements } from "@/lib/entitlements";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";
import { isStripeConfigured } from "@/lib/stripeFetch";
import { isCreditsOnlyBilling, type PortalBillingModel } from "@/lib/portalBillingModel";
import { getPortalBillingModelForOwner } from "@/lib/portalBillingModel.server";
import type { PortalVariant } from "@/lib/portalVariant";

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

export type PortalServiceStatusState = "active" | "needs_setup" | "locked" | "coming_soon" | "paused" | "canceled";
export type PortalServiceAccessState = "included" | "enabled" | "locked" | "coming_soon" | "paused" | "canceled";
export type PortalServiceReadinessState = "ready" | "needs_setup" | "needs_connection" | "empty" | "blocked";

export type PortalServiceReadiness = {
  state: PortalServiceReadinessState;
  label: string;
  helper: string;
  ctaLabel: string;
  href: string | null;
};

export type PortalServiceStatus = {
  state: PortalServiceStatusState;
  label: string;
  access: {
    state: PortalServiceAccessState;
    label: string;
  };
  readiness: PortalServiceReadiness;
};

function portalBasePathFromVariant(variant?: PortalVariant | null) {
  return variant === "credit" ? "/credit" : "/portal";
}

function serviceHomeHref(basePath: "/portal" | "/credit", slug: string) {
  return `${basePath}/app/services/${encodeURIComponent(slug)}`;
}

function serviceSetupHref(basePath: "/portal" | "/credit", slug: string) {
  switch (slug) {
    case "booking":
      return `${basePath}/app/services/booking/settings`;
    case "tasks":
      return `${basePath}/app/services/tasks`;
    case "automations":
      return `${basePath}/app/services/automations`;
    case "blogs":
      return `${basePath}/app/services/blogs/settings`;
    case "reviews":
      return `${basePath}/app/services/reviews/setup`;
    case "ai-receptionist":
      return `${basePath}/app/services/ai-receptionist`;
    case "ai-outbound-calls":
      return `${basePath}/app/services/ai-outbound-calls`;
    case "newsletter":
      return `${basePath}/app/services/newsletter`;
    case "nurture-campaigns":
      return `${basePath}/app/services/nurture-campaigns`;
    case "lead-scraping":
      return `${basePath}/app/services/lead-scraping`;
    default:
      return serviceHomeHref(basePath, slug);
  }
}

function makeReadiness(
  state: PortalServiceReadinessState,
  label: string,
  helper: string,
  href: string | null,
  ctaLabel: string,
): PortalServiceReadiness {
  return { state, label, helper, href, ctaLabel };
}

function buildUnlockedStatus(opts: {
  service: { slug: string; included?: boolean };
  state: Extract<PortalServiceStatusState, "active" | "needs_setup">;
  readiness: PortalServiceReadiness;
}): PortalServiceStatus {
  const accessLabel = opts.service.included ? "Included" : "Enabled";
  return {
    state: opts.state,
    label: opts.readiness.label,
    access: {
      state: opts.service.included ? "included" : "enabled",
      label: accessLabel,
    },
    readiness: opts.readiness,
  };
}

function buildBlockedStatus(opts: {
  state: Extract<PortalServiceStatusState, "locked" | "coming_soon" | "paused" | "canceled">;
  accessLabel: string;
  readiness: PortalServiceReadiness;
}): PortalServiceStatus {
  return {
    state: opts.state,
    label: opts.accessLabel,
    access: {
      state: opts.state,
      label: opts.accessLabel,
    },
    readiness: opts.readiness,
  };
}

function readBool(rec: unknown, key: string): boolean | null {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return null;
  const v = (rec as any)[key];
  return typeof v === "boolean" ? v : null;
}

function readObj(rec: unknown, key: string): Record<string, unknown> | null {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return null;
  const v = (rec as any)[key];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as any;
}

function readString(rec: unknown, key: string): string | null {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return null;
  const v = (rec as any)[key];
  return typeof v === "string" ? v : null;
}

function isComingSoon(service: { title: string; description: string }) {
  const s = `${service.title} ${service.description}`.toLowerCase();
  return s.includes("coming soon");
}

function forceActiveForFullDemo(serviceSlug: string) {
  return serviceSlug === "nurture-campaigns" || serviceSlug === "newsletter";
}

function isUnlocked(opts: {
  isFullDemo: boolean;
  billingModel: PortalBillingModel;
  included?: boolean;
  entitlementKey?:
    | "blog"
    | "booking"
    | "automations"
    | "reviews"
    | "newsletter"
    | "nurture"
    | "aiReceptionist"
    | "leadScraping"
    | "crm"
    | "leadOutbound";
  ownedByLifecycle: boolean;
  entitlements: Record<string, boolean>;
  stripeConfigured: boolean;
}) {
  if (opts.isFullDemo) return true;
  if (opts.included) return true;

  if (isCreditsOnlyBilling(opts.billingModel)) {
    // Credits-only mode: services are available without module subscriptions.
    // Individual actions should still enforce credits at execution time.
    return true;
  }
  // When Stripe is configured, Stripe subscriptions (monthly breakdown) are the source of truth.
  // Lifecycle state is still used to show paused/canceled, but not to grant ownership.
  if (!opts.stripeConfigured && opts.ownedByLifecycle) return true;
  if (!opts.entitlementKey) return false;
  return Boolean(opts.entitlements[opts.entitlementKey]);
}

export async function getPortalServiceStatusesForOwner(opts: {
  ownerId: string;
  fallbackEmail: string | null | undefined;
  portalVariant?: PortalVariant | null | undefined;
}) {
  const owner = await prisma.user
    .findUnique({ where: { id: opts.ownerId }, select: { email: true } })
    .catch(() => null);
  const entitlementsEmail = String(owner?.email || opts.fallbackEmail || "");

  const isFullDemo = entitlementsEmail.toLowerCase().trim() === DEFAULT_FULL_DEMO_EMAIL;
  const billingModel = await getPortalBillingModelForOwner({
    ownerId: opts.ownerId,
    portalVariant: opts.portalVariant ?? "portal",
  });
  const basePath = portalBasePathFromVariant(opts.portalVariant ?? "portal");
  const isCredit = opts.portalVariant === "credit";
  const entitlements = await resolveEntitlements(entitlementsEmail, { ownerId: opts.ownerId });
  const stripeConfigured = isStripeConfigured();

  const serviceSlugs = PORTAL_SERVICES.map((s) => s.slug);

  const [
    setupRows,
    bookingSite,
    blogSite,
    taskCount,
    outboundCampaignCount,
    twilioConfig,
    funnelCount,
    nurtureCampaignCount,
    creditReportCount,
    disputeLetterCount,
    newsletterGenerationCount,
  ] = await Promise.all([
    prisma.portalServiceSetup.findMany({
      where: { ownerId: opts.ownerId, serviceSlug: { in: serviceSlugs } },
      select: { serviceSlug: true, status: true, dataJson: true },
    }),
    prisma.portalBookingSite.findUnique({ where: { ownerId: opts.ownerId }, select: { enabled: true } }),
    prisma.clientBlogSite.findUnique({ where: { ownerId: opts.ownerId }, select: { id: true } }),
    prisma.portalTask.count({ where: { ownerId: opts.ownerId } }),
    (async () => {
      try {
        await ensurePortalAiOutboundCallsSchema();
        return await prisma.portalAiOutboundCallCampaign.count({ where: { ownerId: opts.ownerId } });
      } catch {
        return 0;
      }
    })(),
    getOwnerTwilioSmsConfig(opts.ownerId).catch(() => null),
    prisma.creditFunnel.count({ where: { ownerId: opts.ownerId } }).catch(() => 0),
    prisma.portalNurtureCampaign.count({ where: { ownerId: opts.ownerId } }).catch(() => 0),
    prisma.creditReport.count({ where: { ownerId: opts.ownerId } }).catch(() => 0),
    prisma.creditDisputeLetter.count({ where: { ownerId: opts.ownerId } }).catch(() => 0),
    prisma.portalNewsletterGenerationEvent.count({ where: { ownerId: opts.ownerId } }).catch(() => 0),
  ]);

  const setupBySlug = new Map<string, { status: string; dataJson: unknown }>();
  for (const row of setupRows) {
    setupBySlug.set(row.serviceSlug, { status: row.status, dataJson: row.dataJson });
  }

  const statuses: Record<string, PortalServiceStatus> = {};

  for (const s of PORTAL_SERVICES) {
    const setup = setupBySlug.get(s.slug);
    const comingSoon = isComingSoon(s);
    if (comingSoon) {
      if (isFullDemo && forceActiveForFullDemo(s.slug)) {
        statuses[s.slug] = buildUnlockedStatus({
          service: s,
          state: "active",
          readiness: makeReadiness(
            "ready",
            "Ready",
            "This service is unlocked in the demo workspace and ready for you to open.",
            serviceHomeHref(basePath, s.slug),
            "Open service",
          ),
        });
      } else {
        statuses[s.slug] = buildBlockedStatus({
          state: "coming_soon",
          accessLabel: "Coming soon",
          readiness: makeReadiness(
            "blocked",
            "Wait for release",
            "This service is not available yet, so setup and activity will appear here after release.",
            serviceHomeHref(basePath, s.slug),
            "View service",
          ),
        });
      }
      continue;
    }

    const lifecycle = readObj(setup?.dataJson, "lifecycle");
    const lifecycleState = (readString(lifecycle, "state") || "").toLowerCase().trim();
    const lifecycleReason = (readString(lifecycle, "reason") || "").toLowerCase().trim();

    const ownedByLifecycle = (() => {
      if (!setup) return false;
      if (lifecycleState === "paused" && lifecycleReason === "pending_payment") return false;
      return lifecycleState === "active" || lifecycleState === "paused" || lifecycleState === "canceled";
    })();

    const unlocked = isUnlocked({
      isFullDemo,
      billingModel,
      included: s.included,
      entitlementKey: s.entitlementKey,
      ownedByLifecycle,
      entitlements,
      stripeConfigured,
    });

    if (!unlocked) {
      if (lifecycleState === "paused" && lifecycleReason === "pending_payment") {
        statuses[s.slug] = buildBlockedStatus({
          state: "locked",
          accessLabel: "Locked",
          readiness: makeReadiness(
            "blocked",
            "Unlock in Billing",
            "This service is not enabled for this workspace yet. Restore access first, then finish setup inside the service.",
            `${basePath}/app/billing`,
            "Open Billing",
          ),
        });
      } else {
        statuses[s.slug] = buildBlockedStatus({
          state: "locked",
          accessLabel: "Locked",
          readiness: makeReadiness(
            "blocked",
            "Unlock in Billing",
            "This service is not included in the current access. Unlock it before setup or activity can happen here.",
            `${basePath}/app/billing`,
            "Open Billing",
          ),
        });
      }
      continue;
    }

    if (lifecycleState === "paused" || lifecycleState === "canceled") {
      // If the service is entitled (Stripe paid or manager override), don't let a stale
      // pending_payment lifecycle state block usage.
      if (lifecycleReason === "pending_payment" && unlocked) {
        // fall through to normal status computation
      } else {
        const accessLabel = lifecycleState === "canceled" ? "Canceled" : "Paused";
        statuses[s.slug] = buildBlockedStatus({
          state: lifecycleState as Extract<PortalServiceStatusState, "paused" | "canceled">,
          accessLabel,
          readiness: makeReadiness(
            "blocked",
            "Resume in Billing",
            lifecycleState === "canceled"
              ? "This service was canceled. Turn it back on in Billing before you try to set it up or use it."
              : "This service is paused. Resume it in Billing to continue setup and usage.",
            `${basePath}/app/billing`,
            "Open Billing",
          ),
        });
        continue;
      }
    }

    if (s.slug === "funnel-builder") {
      statuses[s.slug] = funnelCount > 0
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              isCredit
                ? "A consultation or intake funnel already exists, so you can keep refining credit offer pages and forms here."
                : "At least one funnel exists, so you can keep editing pages, forms, and publishing flows here.",
              serviceHomeHref(basePath, s.slug),
              "Open funnels",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "needs_setup",
            readiness: makeReadiness(
              "empty",
              "Create first funnel",
              isCredit
                ? "The builder is unlocked, but there is no credit consultation or intake funnel in this workspace yet."
                : "The builder is unlocked, but there is no funnel in this workspace yet.",
              serviceHomeHref(basePath, s.slug),
              "Create funnel",
            ),
          });
      continue;
    }

    if (s.slug === "credit-reports") {
      statuses[s.slug] = creditReportCount > 0
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              "Imported reports are on file, so this workspace can review items and continue dispute work.",
              serviceHomeHref(basePath, s.slug),
              "Open reports",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "needs_setup",
            readiness: makeReadiness(
              "empty",
              "Import report JSON",
              "Live provider pull is not connected yet in beta, so the next real step is importing report JSON.",
              serviceHomeHref(basePath, s.slug),
              "Import report JSON",
            ),
          });
      continue;
    }

    if (s.slug === "dispute-letters") {
      statuses[s.slug] = disputeLetterCount > 0
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              "Drafts already exist here, so you can keep reviewing, exporting PDFs, and tracking mailed status.",
              serviceHomeHref(basePath, s.slug),
              "Open drafts",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "needs_setup",
            readiness: makeReadiness(
              "empty",
              "Generate first draft",
              "This service is unlocked, but there are no dispute letter drafts in the workspace yet.",
              serviceHomeHref(basePath, s.slug),
              "Generate first draft",
            ),
          });
      continue;
    }

    if (s.slug === "booking") {
      const enabled = Boolean(bookingSite?.enabled);
      statuses[s.slug] = enabled
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              isCredit
                ? "Consultation booking is turned on, so you can keep refining availability, intake questions, and reminders here."
                : "Booking is turned on, so you can keep refining forms, availability, and reminders here.",
              serviceHomeHref(basePath, s.slug),
              "Open booking",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "needs_setup",
            readiness: makeReadiness(
              "needs_setup",
              "Needs setup",
              isCredit
                ? "The module is enabled, but the consultation booking flow is still off. Finish setup before sharing a call link."
                : "The module is enabled, but the booking site is still off. Finish setup before sharing a booking link.",
              serviceSetupHref(basePath, s.slug),
              "Open booking settings",
            ),
          });
      continue;
    }

    if (s.slug === "tasks") {
      statuses[s.slug] = taskCount > 0
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              isCredit
                ? "Tasks already exist here, so the team can keep moving report reviews, document requests, and follow-up work forward."
                : "Tasks already exist here, so the team can keep tracking and completing work.",
              serviceSetupHref(basePath, s.slug),
              "Open tasks",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "empty",
              "No tasks yet",
              isCredit
                ? "The service is available, but no review, document, or follow-up work has been assigned yet."
                : "The service is available, but nothing has been assigned yet.",
              serviceSetupHref(basePath, s.slug),
              "Create first task",
            ),
          });
      continue;
    }

    if (s.slug === "media-library" || s.slug === "inbox") {
      const helper = s.slug === "media-library"
        ? isCredit
          ? "This workspace can store and reuse IDs, proof docs, PDFs, and other client files right away."
          : "This workspace can upload and reuse files right away."
        : isCredit
          ? "The conversation workspace is ready for client messages, document requests, and dispute follow-up."
          : "The conversation workspace is unlocked and ready for channels, threads, and replies.";
      statuses[s.slug] = buildUnlockedStatus({
        service: s,
        state: "active",
        readiness: makeReadiness("ready", "Ready", helper, serviceHomeHref(basePath, s.slug), "Open service"),
      });
      continue;
    }

    if (s.slug === "follow-up") {
      statuses[s.slug] = buildUnlockedStatus({
        service: s,
        state: "active",
        readiness: makeReadiness(
          "ready",
          "Ready",
          isCredit
            ? "Follow-up is available for document reminders, consultation follow-up, and client nudges."
            : "Follow-up is ready for ongoing sequences and next-step reminders.",
          serviceHomeHref(basePath, s.slug),
          "Open follow-up",
        ),
      });
      continue;
    }

    if (s.slug === "missed-call-textback") {
      statuses[s.slug] = buildUnlockedStatus({
        service: s,
        state: "active",
        readiness: makeReadiness(
          "ready",
          "Ready",
          isCredit
            ? "Missed-call text back is ready to re-engage credit inquiries and route them into the next step."
            : "Missed-call text back is ready to turn missed calls into active conversations.",
          serviceHomeHref(basePath, s.slug),
          "Open service",
        ),
      });
      continue;
    }

    if (s.slug === "blogs") {
      const blogsSetup = setupBySlug.get("blogs");
      const enabled = readBool(blogsSetup?.dataJson, "enabled") ?? false;
      const topics = (() => {
        const rec = blogsSetup?.dataJson && typeof blogsSetup.dataJson === "object" && !Array.isArray(blogsSetup.dataJson)
          ? (blogsSetup.dataJson as Record<string, unknown>)
          : null;
        return Array.isArray(rec?.topics) ? (rec?.topics as unknown[]) : [];
      })();

      if (!blogSite?.id) {
        statuses[s.slug] = buildUnlockedStatus({
          service: s,
          state: "needs_setup",
          readiness: makeReadiness(
            "needs_setup",
            "Needs setup",
              isCredit
                ? "The module is enabled, but the credit education site has not been initialized yet."
                : "The module is enabled, but the blog site has not been initialized yet.",
            serviceSetupHref(basePath, s.slug),
            "Open blog settings",
          ),
        });
        continue;
      }

      if (!enabled) {
        statuses[s.slug] = buildUnlockedStatus({
          service: s,
          state: "needs_setup",
          readiness: makeReadiness(
            "needs_setup",
            "Turn on automation",
              isCredit
                ? "The content site exists, but credit education publishing is still turned off."
                : "The blog site exists, but automated publishing is still turned off.",
            serviceSetupHref(basePath, s.slug),
            "Open blog settings",
          ),
        });
        continue;
      }

      if (topics.length === 0) {
        statuses[s.slug] = buildUnlockedStatus({
          service: s,
          state: "needs_setup",
          readiness: makeReadiness(
            "empty",
            "Add topics",
              isCredit
                ? "Automation is on, but there are no credit education topics queued for future posts yet."
                : "Automation is on, but there are no topics queued for future posts yet.",
            serviceSetupHref(basePath, s.slug),
            "Add topics",
          ),
        });
        continue;
      }

      statuses[s.slug] = buildUnlockedStatus({
        service: s,
        state: "active",
        readiness: makeReadiness(
          "ready",
          "Ready",
          isCredit
            ? "The education workflow has a site, publishing enabled, and credit topics loaded."
            : "The blog workflow has a site, publishing enabled, and topics loaded.",
          serviceHomeHref(basePath, s.slug),
          "Open blogs",
        ),
      });
      continue;
    }

    if (s.slug === "reviews") {
      const reviewsSetup = setupBySlug.get("reviews");
      const settings = readObj(reviewsSetup?.dataJson, "settings");
      const enabled = readBool(settings, "enabled") ?? false;
      statuses[s.slug] = enabled
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              isCredit
                ? "Review requests are turned on, so you can keep collecting client proof and monitoring responses."
                : "Review collection is turned on, so you can keep sending requests and monitoring responses.",
              serviceHomeHref(basePath, s.slug),
              "Open reviews",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "needs_setup",
            readiness: makeReadiness(
              "needs_setup",
              "Needs setup",
              isCredit
                ? "The service is unlocked, but client review automation is still off."
                : "The service is unlocked, but review automation is still off.",
              serviceSetupHref(basePath, s.slug),
              "Open review setup",
            ),
          });
      continue;
    }

    if (s.slug === "ai-receptionist") {
      const aiSetup = setupBySlug.get("ai-receptionist");
      const settings = readObj(aiSetup?.dataJson, "settings");
      const enabled = readBool(settings, "enabled") ?? false;
      if (!twilioConfig) {
        statuses[s.slug] = buildUnlockedStatus({
          service: s,
          state: "needs_setup",
          readiness: makeReadiness(
            "needs_connection",
            "Connect Twilio",
              isCredit
                ? "The service is enabled, but Twilio is still missing, so credit inquiry calls cannot run yet."
                : "The service is enabled, but Twilio is still missing, so calls cannot run yet.",
            `${basePath}/app/profile`,
            "Connect Twilio",
          ),
        });
        continue;
      }

      statuses[s.slug] = enabled
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              isCredit
                ? "Twilio is connected and the receptionist is ready to answer credit inquiries and route consultations."
                : "Twilio is connected and the receptionist is enabled for incoming call workflows.",
              serviceHomeHref(basePath, s.slug),
              "Open receptionist",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "needs_setup",
            readiness: makeReadiness(
              "needs_setup",
              "Needs setup",
              isCredit
                ? "Twilio is connected, but the credit inquiry workflow is still turned off."
                : "Twilio is connected, but the receptionist workflow is still turned off.",
              serviceSetupHref(basePath, s.slug),
              "Open receptionist settings",
            ),
          });
      continue;
    }

    if (s.slug === "ai-outbound-calls") {
      const hasTwilio = Boolean(twilioConfig);
      if (!hasTwilio) {
        statuses[s.slug] = buildUnlockedStatus({
          service: s,
          state: "needs_setup",
          readiness: makeReadiness(
            "needs_connection",
            "Connect Twilio",
              isCredit
                ? "Outbound follow-up is unlocked, but Twilio must be connected before consultation campaigns can run."
                : "Outbound calling is unlocked, but Twilio must be connected before campaigns can run.",
            `${basePath}/app/profile`,
            "Connect Twilio",
          ),
        });
        continue;
      }

      statuses[s.slug] = outboundCampaignCount > 0
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              isCredit
                ? "Twilio is connected and outreach campaigns already exist for credit consultations or follow-up."
                : "Twilio is connected and outbound campaigns already exist for this workspace.",
              serviceHomeHref(basePath, s.slug),
              "Open outbound",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "needs_setup",
            readiness: makeReadiness(
              "empty",
              "Create first campaign",
              isCredit
                ? "The service is connected, but there is no consultation outreach or follow-up campaign on file yet."
                : "The service is connected, but there is no outbound campaign on file yet.",
              serviceSetupHref(basePath, s.slug),
              "Create first campaign",
            ),
          });
      continue;
    }

    if (s.slug === "automations") {
      const autoSetup = setupBySlug.get("automations");
      const rec = autoSetup?.dataJson && typeof autoSetup.dataJson === "object" && !Array.isArray(autoSetup.dataJson)
        ? (autoSetup.dataJson as Record<string, unknown>)
        : null;
      const automations = Array.isArray(rec?.automations) ? rec?.automations : [];
      statuses[s.slug] = automations.length > 0
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              isCredit
                ? "Automation flows already exist here for intake, reminders, or follow-up work."
                : "Automation flows already exist here, so the builder is operational.",
              serviceHomeHref(basePath, s.slug),
              "Open automations",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "empty",
              "Create first automation",
              isCredit
                ? "The module is enabled, but there are no credit workflow automations created yet."
                : "The module is enabled, but there are no automation flows created yet.",
              serviceSetupHref(basePath, s.slug),
              "Create first automation",
            ),
          });
      continue;
    }

    if (s.slug === "newsletter") {
      statuses[s.slug] = newsletterGenerationCount > 0
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              isCredit
                ? "Newsletter activity already exists, so the workspace can keep sending credit education and nurture updates from here."
                : "Newsletter activity already exists, so the workspace can keep drafting and sending from here.",
              serviceHomeHref(basePath, s.slug),
              "Open newsletter",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "needs_setup",
            readiness: makeReadiness(
              "empty",
              "Create first newsletter",
              isCredit
                ? "The service is enabled, but no credit education update has been generated or sent yet."
                : "The service is enabled, but nothing has been generated or sent yet.",
              serviceSetupHref(basePath, s.slug),
              "Create first newsletter",
            ),
          });
      continue;
    }

    if (s.slug === "nurture-campaigns") {
      statuses[s.slug] = nurtureCampaignCount > 0
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              isCredit
                ? "Nurture campaigns already exist to keep prospects or clients engaged with ongoing credit education."
                : "Nurture campaigns already exist for this workspace.",
              serviceHomeHref(basePath, s.slug),
              "Open campaigns",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "needs_setup",
            readiness: makeReadiness(
              "empty",
              "Create first campaign",
              isCredit
                ? "The service is unlocked, but there is no long-term credit education or follow-up campaign on file yet."
                : "The service is unlocked, but there is no nurture campaign on file yet.",
              serviceSetupHref(basePath, s.slug),
              "Create first campaign",
            ),
          });
      continue;
    }

    if (s.slug === "reporting") {
      statuses[s.slug] = buildUnlockedStatus({
        service: s,
        state: "active",
        readiness: makeReadiness(
          "ready",
          "Ready",
          isCredit
            ? "Reporting is ready to track leads, consultations, imported reports, dispute work, and conversion signals."
            : "Reporting is ready to track service activity, outcomes, and usage across the workspace.",
          serviceHomeHref(basePath, s.slug),
          "Open reporting",
        ),
      });
      continue;
    }

    if (s.slug === "lead-scraping") {
      const scrapeSetup = setupBySlug.get("lead-scraping");
      const rec = scrapeSetup?.dataJson && typeof scrapeSetup.dataJson === "object" && !Array.isArray(scrapeSetup.dataJson)
        ? (scrapeSetup.dataJson as Record<string, unknown>)
        : null;
      const b2b = readObj(rec, "b2b");
      const b2c = readObj(rec, "b2c");
      const outbound = readObj(rec, "outbound");

      const anyEnabled = Boolean(
        (readBool(b2b, "scheduleEnabled") ?? false) ||
          (readBool(b2c, "scheduleEnabled") ?? false) ||
          (readBool(outbound, "enabled") ?? false),
      );

      if (!scrapeSetup) {
        statuses[s.slug] = buildUnlockedStatus({
          service: s,
          state: "needs_setup",
          readiness: makeReadiness(
            "needs_setup",
            "Needs setup",
              isCredit
                ? "The service is enabled, but credit lead sources and outreach schedules have not been configured yet."
                : "The service is enabled, but lead sources and schedules have not been configured yet.",
            serviceSetupHref(basePath, s.slug),
            "Open settings",
          ),
        });
        continue;
      }

      statuses[s.slug] = anyEnabled
        ? buildUnlockedStatus({
            service: s,
            state: "active",
            readiness: makeReadiness(
              "ready",
              "Ready",
              isCredit
                ? "Lead sources and outreach schedules are already enabled for credit-offer sourcing in this workspace."
                : "Lead scraping sources and schedules are already enabled for this workspace.",
              serviceHomeHref(basePath, s.slug),
              "Open lead scraping",
            ),
          })
        : buildUnlockedStatus({
            service: s,
            state: "needs_setup",
            readiness: makeReadiness(
              "needs_setup",
              "Enable schedule",
              isCredit
                ? "Configuration exists, but no credit lead sourcing or outreach schedule is turned on yet."
                : "Configuration exists, but nothing is scheduled to run yet.",
              serviceSetupHref(basePath, s.slug),
              "Enable schedule",
            ),
          });
      continue;
    }

    statuses[s.slug] = buildUnlockedStatus({
      service: s,
      state: "active",
      readiness: makeReadiness(
        "ready",
        "Ready",
        "This service is enabled and available to open in the current workspace.",
        serviceHomeHref(basePath, s.slug),
        "Open service",
      ),
    });
  }

  return { ok: true as const, ownerId: opts.ownerId, entitlements, statuses, entitlementsEmail, isFullDemo, billingModel };
}
