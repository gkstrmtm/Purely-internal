import { prisma } from "@/lib/db";
import { resolveEntitlements } from "@/lib/entitlements";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";
import { ensurePortalAiOutboundCallsSchema } from "@/lib/portalAiOutboundCallsSchema";
import { getOwnerTwilioSmsConfig } from "@/lib/portalTwilio";

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

export type PortalServiceStatusState = "active" | "needs_setup" | "locked" | "coming_soon" | "paused" | "canceled";

export type PortalServiceStatus = {
  state: PortalServiceStatusState;
  label: string;
};

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
  included?: boolean;
  entitlementKey?:
    | "blog"
    | "booking"
    | "automations"
    | "reviews"
    | "newsletter"
    | "nurture"
    | "aiReceptionist"
    | "crm"
    | "leadOutbound";
  ownedByLifecycle: boolean;
  entitlements: Record<string, boolean>;
}) {
  if (opts.isFullDemo) return true;
  if (opts.included) return true;
  if (opts.ownedByLifecycle) return true;
  if (!opts.entitlementKey) return false;
  return Boolean(opts.entitlements[opts.entitlementKey]);
}

export async function getPortalServiceStatusesForOwner(opts: {
  ownerId: string;
  fallbackEmail: string | null | undefined;
}) {
  const owner = await prisma.user
    .findUnique({ where: { id: opts.ownerId }, select: { email: true } })
    .catch(() => null);
  const entitlementsEmail = String(owner?.email || opts.fallbackEmail || "");

  const isFullDemo = entitlementsEmail.toLowerCase().trim() === DEFAULT_FULL_DEMO_EMAIL;
  const entitlements = await resolveEntitlements(entitlementsEmail);

  const serviceSlugs = PORTAL_SERVICES.map((s) => s.slug);

  const [setupRows, bookingSite, blogSite, taskCount, outboundCampaignCount, twilioConfig] = await Promise.all([
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
        statuses[s.slug] = { state: "active", label: "Active" };
      } else {
        statuses[s.slug] = { state: "coming_soon", label: "Coming soon" };
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
      included: s.included,
      entitlementKey: s.entitlementKey,
      ownedByLifecycle,
      entitlements,
    });

    if (!unlocked) {
      if (lifecycleState === "paused" && lifecycleReason === "pending_payment") {
        statuses[s.slug] = { state: "locked", label: "Activate" };
      } else {
        statuses[s.slug] = { state: "locked", label: "Locked" };
      }
      continue;
    }

    if (lifecycleState === "paused" || lifecycleState === "canceled") {
      if (lifecycleReason === "pending_payment" && s.included) {
        // fall through to normal status computation
      } else {
        statuses[s.slug] = {
          state: lifecycleState as any,
          label: lifecycleState === "canceled" ? "Canceled" : "Paused",
        };
        continue;
      }
    }

    if (s.slug === "booking") {
      const enabled = Boolean(bookingSite?.enabled);
      statuses[s.slug] = enabled ? { state: "active", label: "Active" } : { state: "needs_setup", label: "Off" };
      continue;
    }

    if (s.slug === "tasks") {
      statuses[s.slug] = taskCount > 0 ? { state: "active", label: "Active" } : { state: "active", label: "No tasks yet" };
      continue;
    }

    if (s.slug === "media-library" || s.slug === "inbox") {
      statuses[s.slug] = { state: "active", label: "Ready" };
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
        statuses[s.slug] = { state: "needs_setup", label: "Needs setup" };
        continue;
      }

      if (!enabled) {
        statuses[s.slug] = { state: "needs_setup", label: "Off" };
        continue;
      }

      if (topics.length === 0) {
        statuses[s.slug] = { state: "needs_setup", label: "Add topics" };
        continue;
      }

      statuses[s.slug] = { state: "active", label: "Active" };
      continue;
    }

    if (s.slug === "reviews") {
      const reviewsSetup = setupBySlug.get("reviews");
      const settings = readObj(reviewsSetup?.dataJson, "settings");
      const enabled = readBool(settings, "enabled") ?? false;
      statuses[s.slug] = enabled ? { state: "active", label: "Active" } : { state: "needs_setup", label: "Off" };
      continue;
    }

    if (s.slug === "ai-receptionist") {
      const aiSetup = setupBySlug.get("ai-receptionist");
      const settings = readObj(aiSetup?.dataJson, "settings");
      const enabled = readBool(settings, "enabled") ?? false;
      statuses[s.slug] = enabled ? { state: "active", label: "Active" } : { state: "needs_setup", label: "Off" };
      continue;
    }

    if (s.slug === "ai-outbound-calls") {
      const hasTwilio = Boolean(twilioConfig);
      if (!hasTwilio) {
        statuses[s.slug] = { state: "needs_setup", label: "Needs Twilio" };
        continue;
      }

      statuses[s.slug] = outboundCampaignCount > 0 ? { state: "active", label: "Ready" } : { state: "needs_setup", label: "No campaigns" };
      continue;
    }

    if (s.slug === "automations") {
      const autoSetup = setupBySlug.get("automations");
      const rec = autoSetup?.dataJson && typeof autoSetup.dataJson === "object" && !Array.isArray(autoSetup.dataJson)
        ? (autoSetup.dataJson as Record<string, unknown>)
        : null;
      const automations = Array.isArray(rec?.automations) ? rec?.automations : [];
      statuses[s.slug] = automations.length > 0 ? { state: "active", label: "Active" } : { state: "active", label: "No automations yet" };
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
        statuses[s.slug] = { state: "needs_setup", label: "Needs setup" };
        continue;
      }

      statuses[s.slug] = anyEnabled ? { state: "active", label: "Active" } : { state: "needs_setup", label: "Enable schedule" };
      continue;
    }

    statuses[s.slug] = { state: "active", label: "Ready" };
  }

  return { ok: true as const, ownerId: opts.ownerId, entitlements, statuses, entitlementsEmail, isFullDemo };
}
