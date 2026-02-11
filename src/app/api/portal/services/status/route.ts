import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireClientSession } from "@/lib/apiAuth";
import { resolveEntitlements } from "@/lib/entitlements";
import { PORTAL_SERVICES } from "@/app/portal/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_FULL_DEMO_EMAIL = "demo-full@purelyautomation.dev";

export type PortalServiceStatusState = "active" | "needs_setup" | "locked" | "coming_soon";

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

function isComingSoon(service: { title: string; description: string }) {
  const s = `${service.title} ${service.description}`.toLowerCase();
  return s.includes("coming soon");
}

function isUnlocked(opts: {
  isFullDemo: boolean;
  included?: boolean;
  entitlementKey?: "blog" | "booking" | "crm";
  entitlements: Record<string, boolean>;
}) {
  if (opts.isFullDemo) return true;
  if (opts.included) return true;
  if (!opts.entitlementKey) return false;
  return Boolean(opts.entitlements[opts.entitlementKey]);
}

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;

  // IMPORTANT: portal sessions can represent an acting member/admin. Entitlements and feature
  // unlocks must always be computed from the portal account owner identity.
  const fallbackEmail = auth.session.user.email;
  const owner = await prisma.user
    .findUnique({ where: { id: ownerId }, select: { email: true } })
    .catch(() => null);
  const entitlementsEmail = String(owner?.email || fallbackEmail || "");

  const isFullDemo = entitlementsEmail.toLowerCase().trim() === DEFAULT_FULL_DEMO_EMAIL;
  const entitlements = await resolveEntitlements(entitlementsEmail);

  const serviceSlugs = [
    "inbox",
    "blogs",
    "automations",
    "ai-receptionist",
    "reviews",
    "lead-scraping",
    "missed-call-textback",
    "follow-up",
  ];

  const [setupRows, bookingSite, blogSite, taskCount] = await Promise.all([
    prisma.portalServiceSetup.findMany({
      where: { ownerId, serviceSlug: { in: serviceSlugs } },
      select: { serviceSlug: true, status: true, dataJson: true },
    }),
    prisma.portalBookingSite.findUnique({ where: { ownerId }, select: { enabled: true } }),
    prisma.clientBlogSite.findUnique({ where: { ownerId }, select: { id: true } }),
    prisma.portalTask.count({ where: { ownerId } }),
  ]);

  const setupBySlug = new Map<string, { status: string; dataJson: unknown }>();
  for (const row of setupRows) {
    setupBySlug.set(row.serviceSlug, { status: row.status, dataJson: row.dataJson });
  }

  const statuses: Record<string, PortalServiceStatus> = {};

  for (const s of PORTAL_SERVICES) {
    const comingSoon = isComingSoon(s);
    if (comingSoon) {
      statuses[s.slug] = { state: "coming_soon", label: "Coming soon" };
      continue;
    }

    const unlocked = isUnlocked({
      isFullDemo,
      included: s.included,
      entitlementKey: s.entitlementKey,
      entitlements,
    });

    if (!unlocked) {
      statuses[s.slug] = { state: "locked", label: "Locked" };
      continue;
    }

    if (s.slug === "booking") {
      const enabled = Boolean(bookingSite?.enabled);
      statuses[s.slug] = enabled ? { state: "active", label: "Active" } : { state: "needs_setup", label: "Off" };
      continue;
    }

    if (s.slug === "tasks") {
      statuses[s.slug] = taskCount > 0 ? { state: "active", label: "Active" } : { state: "needs_setup", label: "No tasks" };
      continue;
    }

    if (s.slug === "media-library" || s.slug === "inbox") {
      statuses[s.slug] = { state: "active", label: "Ready" };
      continue;
    }

    if (s.slug === "blogs") {
      const setup = setupBySlug.get("blogs");
      const enabled = readBool(setup?.dataJson, "enabled") ?? false;
      const topics = (() => {
        const rec = setup?.dataJson && typeof setup.dataJson === "object" && !Array.isArray(setup.dataJson)
          ? (setup.dataJson as Record<string, unknown>)
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
      const setup = setupBySlug.get("reviews");
      const settings = readObj(setup?.dataJson, "settings");
      const enabled = readBool(settings, "enabled") ?? false;
      statuses[s.slug] = enabled ? { state: "active", label: "Active" } : { state: "needs_setup", label: "Off" };
      continue;
    }

    if (s.slug === "ai-receptionist") {
      const setup = setupBySlug.get("ai-receptionist");
      const settings = readObj(setup?.dataJson, "settings");
      const enabled = readBool(settings, "enabled") ?? false;
      statuses[s.slug] = enabled ? { state: "active", label: "Active" } : { state: "needs_setup", label: "Off" };
      continue;
    }

    if (s.slug === "automations") {
      const setup = setupBySlug.get("automations");
      const rec = setup?.dataJson && typeof setup.dataJson === "object" && !Array.isArray(setup.dataJson)
        ? (setup.dataJson as Record<string, unknown>)
        : null;
      const automations = Array.isArray(rec?.automations) ? rec?.automations : [];
      statuses[s.slug] = automations.length > 0 ? { state: "active", label: "Active" } : { state: "needs_setup", label: "No automations" };
      continue;
    }

    if (s.slug === "lead-scraping") {
      const setup = setupBySlug.get("lead-scraping");
      const rec = setup?.dataJson && typeof setup.dataJson === "object" && !Array.isArray(setup.dataJson)
        ? (setup.dataJson as Record<string, unknown>)
        : null;
      const b2b = readObj(rec, "b2b");
      const b2c = readObj(rec, "b2c");
      const outbound = readObj(rec, "outbound");

      const anyEnabled = Boolean(
        (readBool(b2b, "scheduleEnabled") ?? false) ||
          (readBool(b2c, "scheduleEnabled") ?? false) ||
          (readBool(outbound, "enabled") ?? false),
      );

      if (!setup) {
        statuses[s.slug] = { state: "needs_setup", label: "Needs setup" };
        continue;
      }

      statuses[s.slug] = anyEnabled ? { state: "active", label: "Active" } : { state: "needs_setup", label: "Configured" };
      continue;
    }

    // Default: unlocked and available.
    statuses[s.slug] = { state: "active", label: "Ready" };
  }

  return NextResponse.json({ ok: true, ownerId, entitlements, statuses });
}
