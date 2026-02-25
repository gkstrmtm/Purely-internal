import { prisma } from "@/lib/db";
import { getPortalBillingModelForOwner } from "@/lib/portalBillingModel.server";
import { isCreditsOnlyBilling } from "@/lib/portalBillingModel";
import { getPortalServiceStatusesForOwner } from "@/lib/portalServicesStatus";
import type { PortalVariant } from "@/lib/portalVariant";

export type PortalAdPlacement = "SIDEBAR_BANNER" | "BILLING_SPONSORED" | "FULLSCREEN_REWARD";

export type PortalAdCampaignCreative = {
  headline?: string;
  body?: string;
  ctaText?: string;
  linkUrl?: string;
  mediaUrl?: string;
  mediaKind?: "image" | "video";
};

export type PortalAdCampaignReward = {
  credits?: number;
  cooldownHours?: number;
  minWatchSeconds?: number;
};

export type PortalAdCampaignTarget = {
  portalVariant?: "portal" | "credit" | "any";
  billingModel?: "subscription" | "credits" | "any";

  industries?: string[];
  businessModels?: string[];

  serviceSlugsAny?: string[];
  serviceSlugsAll?: string[];

  paths?: string[];

  includeOwnerIds?: string[];
  excludeOwnerIds?: string[];
};

function normalizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 200);
}

function readTargetJson(data: unknown): PortalAdCampaignTarget {
  const rec = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const portalVariantRaw = typeof rec.portalVariant === "string" ? rec.portalVariant.trim().toLowerCase() : "";
  const billingModelRaw = typeof rec.billingModel === "string" ? rec.billingModel.trim().toLowerCase() : "";

  return {
    portalVariant:
      portalVariantRaw === "portal" || portalVariantRaw === "credit" ? (portalVariantRaw as any) : portalVariantRaw === "any" ? "any" : undefined,
    billingModel:
      billingModelRaw === "subscription" || billingModelRaw === "credits" ? (billingModelRaw as any) : billingModelRaw === "any" ? "any" : undefined,
    industries: normalizeStringArray(rec.industries),
    businessModels: normalizeStringArray(rec.businessModels),
    serviceSlugsAny: normalizeStringArray(rec.serviceSlugsAny),
    serviceSlugsAll: normalizeStringArray(rec.serviceSlugsAll),
    paths: normalizeStringArray(rec.paths),
    includeOwnerIds: normalizeStringArray(rec.includeOwnerIds),
    excludeOwnerIds: normalizeStringArray(rec.excludeOwnerIds),
  };
}

function readCreativeJson(data: unknown): PortalAdCampaignCreative {
  const rec = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const mediaKindRaw = typeof rec.mediaKind === "string" ? rec.mediaKind.trim().toLowerCase() : "";
  const mediaKind = mediaKindRaw === "video" ? "video" : mediaKindRaw === "image" ? "image" : undefined;

  const headline = typeof rec.headline === "string" ? rec.headline.trim().slice(0, 160) : "";
  const body = typeof rec.body === "string" ? rec.body.trim().slice(0, 800) : "";
  const ctaText = typeof rec.ctaText === "string" ? rec.ctaText.trim().slice(0, 80) : "";
  const linkUrl = typeof rec.linkUrl === "string" ? rec.linkUrl.trim().slice(0, 500) : "";
  const mediaUrl = typeof rec.mediaUrl === "string" ? rec.mediaUrl.trim().slice(0, 500) : "";

  return {
    headline: headline || undefined,
    body: body || undefined,
    ctaText: ctaText || undefined,
    linkUrl: linkUrl || undefined,
    mediaUrl: mediaUrl || undefined,
    mediaKind,
  };
}

function readRewardJson(data: unknown): PortalAdCampaignReward | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const rec = data as Record<string, unknown>;

  const creditsRaw = typeof rec.credits === "number" ? rec.credits : typeof rec.credits === "string" ? Number(rec.credits) : NaN;
  const credits = Number.isFinite(creditsRaw) ? Math.max(0, Math.floor(creditsRaw)) : 0;

  const cooldownRaw = typeof rec.cooldownHours === "number" ? rec.cooldownHours : typeof rec.cooldownHours === "string" ? Number(rec.cooldownHours) : NaN;
  const cooldownHours = Number.isFinite(cooldownRaw) ? Math.max(0, Math.floor(cooldownRaw)) : 0;

  const minWatchRaw =
    typeof rec.minWatchSeconds === "number" ? rec.minWatchSeconds : typeof rec.minWatchSeconds === "string" ? Number(rec.minWatchSeconds) : NaN;
  const minWatchSeconds = Number.isFinite(minWatchRaw) ? Math.max(0, Math.floor(minWatchRaw)) : 0;

  if (!credits && !cooldownHours && !minWatchSeconds) return null;
  return {
    credits: credits || undefined,
    cooldownHours: cooldownHours || undefined,
    minWatchSeconds: minWatchSeconds || undefined,
  };
}

function withinWindow(now: Date, startAt: Date | null, endAt: Date | null) {
  if (startAt && now.getTime() < startAt.getTime()) return false;
  if (endAt && now.getTime() > endAt.getTime()) return false;
  return true;
}

function matchAnyCaseInsensitive(haystack: string | null | undefined, needles: string[]) {
  if (!needles.length) return true;
  const h = String(haystack || "").trim().toLowerCase();
  if (!h) return false;
  return needles.some((n) => n.trim().toLowerCase() === h);
}

function matchPath(path: string | null | undefined, allowed: string[]) {
  if (!allowed.length) return true;
  const p = typeof path === "string" ? path.trim() : "";
  if (!p) return false;
  return allowed.some((a) => {
    const s = a.trim();
    if (!s) return false;
    if (s === p) return true;
    if (s.endsWith("*")) {
      const prefix = s.slice(0, -1);
      return prefix ? p.startsWith(prefix) : false;
    }
    return p.startsWith(s);
  });
}

export async function getNextPortalAdCampaignForOwner(opts: {
  ownerId: string;
  portalVariant: PortalVariant;
  placement: PortalAdPlacement;
  path?: string | null | undefined;
}) {
  const now = new Date();

  const billingModel = await getPortalBillingModelForOwner({ ownerId: opts.ownerId, portalVariant: opts.portalVariant });
  const billingModelKey = isCreditsOnlyBilling(billingModel) ? "credits" : "subscription";

  const profile = await prisma.businessProfile
    .findUnique({
      where: { ownerId: opts.ownerId },
      select: { industry: true, businessModel: true },
    })
    .catch(() => null);

  const statuses = await getPortalServiceStatusesForOwner({
    ownerId: opts.ownerId,
    fallbackEmail: null,
    portalVariant: opts.portalVariant,
  }).catch(() => null);

  const unlockedServiceSlugs = new Set<string>();
  const statusesMap =
    statuses &&
    typeof statuses === "object" &&
    (statuses as any).statuses &&
    typeof (statuses as any).statuses === "object"
      ? ((statuses as any).statuses as Record<string, { state?: string }>)
      : null;
  if (statusesMap) {
    for (const [slug, st] of Object.entries(statusesMap)) {
      const state = String(st?.state || "").toLowerCase();
      if (state && state !== "locked" && state !== "coming_soon") unlockedServiceSlugs.add(slug);
    }
  }

  const campaigns = await prisma.portalAdCampaign
    .findMany({
      where: {
        enabled: true,
        placement: opts.placement as any,
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 50,
      include: {
        assignments: { where: { ownerId: opts.ownerId }, select: { id: true } },
        _count: { select: { assignments: true } },
      },
    })
    .catch(() => null);

  if (!campaigns) return null;

  for (const c of campaigns) {
    if (!withinWindow(now, c.startAt, c.endAt)) continue;

    const target = readTargetJson(c.targetJson);

    if (target.excludeOwnerIds?.includes(opts.ownerId)) continue;

    const isAssignedToOwner = Array.isArray((c as any).assignments) && (c as any).assignments.length > 0;
    const assignmentsCount = typeof (c as any)?._count?.assignments === "number" ? Number((c as any)._count.assignments) : 0;

    // If there are explicit assignments, treat this campaign as a whitelist.
    if (assignmentsCount > 0 && !isAssignedToOwner) continue;

    // If includeOwnerIds is present, treat it as a whitelist.
    if ((target.includeOwnerIds ?? []).length > 0 && !target.includeOwnerIds?.includes(opts.ownerId)) continue;

    const matchesVariant =
      !target.portalVariant ||
      target.portalVariant === "any" ||
      (target.portalVariant === "portal" && opts.portalVariant === "portal") ||
      (target.portalVariant === "credit" && opts.portalVariant === "credit");
    if (!matchesVariant) continue;

    const matchesBilling = !target.billingModel || target.billingModel === "any" || target.billingModel === billingModelKey;
    if (!matchesBilling) continue;

    if (!matchPath(opts.path, target.paths ?? [])) continue;

    const matchesIndustry = matchAnyCaseInsensitive(profile?.industry, target.industries ?? []);
    if (!matchesIndustry && (target.industries ?? []).length) continue;

    const matchesBusinessModel = matchAnyCaseInsensitive(profile?.businessModel, target.businessModels ?? []);
    if (!matchesBusinessModel && (target.businessModels ?? []).length) continue;

    if ((target.serviceSlugsAny ?? []).length) {
      const any = (target.serviceSlugsAny ?? []).some((s) => unlockedServiceSlugs.has(s));
      if (!any) continue;
    }

    if ((target.serviceSlugsAll ?? []).length) {
      const all = (target.serviceSlugsAll ?? []).every((s) => unlockedServiceSlugs.has(s));
      if (!all) continue;
    }

    // If it’s explicitly assigned, bypass remaining “needs profile” edge cases.
    if (!isAssignedToOwner) {
      // If campaign targets industry/businessModel but profile is missing, skip.
      if ((target.industries ?? []).length && !String(profile?.industry || "").trim()) continue;
      if ((target.businessModels ?? []).length && !String(profile?.businessModel || "").trim()) continue;
    }

    return {
      id: c.id,
      name: c.name,
      placement: c.placement as PortalAdPlacement,
      creative: readCreativeJson(c.creativeJson),
      reward: readRewardJson(c.rewardJson),
    };
  }

  return null;
}

export async function getPortalAdCampaignForOwnerById(opts: {
  ownerId: string;
  portalVariant: PortalVariant;
  campaignId: string;
  path?: string | null | undefined;
}) {
  const now = new Date();

  const billingModel = await getPortalBillingModelForOwner({ ownerId: opts.ownerId, portalVariant: opts.portalVariant });
  const billingModelKey = isCreditsOnlyBilling(billingModel) ? "credits" : "subscription";

  const profile = await prisma.businessProfile
    .findUnique({ where: { ownerId: opts.ownerId }, select: { industry: true, businessModel: true } })
    .catch(() => null);

  const statuses = await getPortalServiceStatusesForOwner({
    ownerId: opts.ownerId,
    fallbackEmail: null,
    portalVariant: opts.portalVariant,
  }).catch(() => null);

  const unlockedServiceSlugs = new Set<string>();
  const statusesMap =
    statuses &&
    typeof statuses === "object" &&
    (statuses as any).statuses &&
    typeof (statuses as any).statuses === "object"
      ? ((statuses as any).statuses as Record<string, { state?: string }>)
      : null;
  if (statusesMap) {
    for (const [slug, st] of Object.entries(statusesMap)) {
      const state = String(st?.state || "").toLowerCase();
      if (state && state !== "locked" && state !== "coming_soon") unlockedServiceSlugs.add(slug);
    }
  }

  const c = await prisma.portalAdCampaign
    .findUnique({
      where: { id: opts.campaignId },
      include: {
        assignments: { where: { ownerId: opts.ownerId }, select: { id: true } },
        _count: { select: { assignments: true } },
      },
    })
    .catch(() => null);

  if (!c?.enabled) return null;
  if (!withinWindow(now, c.startAt, c.endAt)) return null;

  const target = readTargetJson(c.targetJson);
  if (target.excludeOwnerIds?.includes(opts.ownerId)) return null;

  const isAssignedToOwner = Array.isArray((c as any).assignments) && (c as any).assignments.length > 0;
  const assignmentsCount = typeof (c as any)?._count?.assignments === "number" ? Number((c as any)._count.assignments) : 0;

  // If there are explicit assignments, treat this campaign as a whitelist.
  if (assignmentsCount > 0 && !isAssignedToOwner) return null;

  // If includeOwnerIds is present, treat it as a whitelist.
  if ((target.includeOwnerIds ?? []).length > 0 && !target.includeOwnerIds?.includes(opts.ownerId)) return null;

  const matchesVariant =
    !target.portalVariant ||
    target.portalVariant === "any" ||
    (target.portalVariant === "portal" && opts.portalVariant === "portal") ||
    (target.portalVariant === "credit" && opts.portalVariant === "credit");
  if (!matchesVariant) return null;

  const matchesBilling = !target.billingModel || target.billingModel === "any" || target.billingModel === billingModelKey;
  if (!matchesBilling) return null;

  if (!matchPath(opts.path, target.paths ?? [])) return null;

  const matchesIndustry = matchAnyCaseInsensitive(profile?.industry, target.industries ?? []);
  if (!matchesIndustry && (target.industries ?? []).length) return null;

  const matchesBusinessModel = matchAnyCaseInsensitive(profile?.businessModel, target.businessModels ?? []);
  if (!matchesBusinessModel && (target.businessModels ?? []).length) return null;

  if ((target.serviceSlugsAny ?? []).length) {
    const any = (target.serviceSlugsAny ?? []).some((s) => unlockedServiceSlugs.has(s));
    if (!any) return null;
  }

  if ((target.serviceSlugsAll ?? []).length) {
    const all = (target.serviceSlugsAll ?? []).every((s) => unlockedServiceSlugs.has(s));
    if (!all) return null;
  }

  if (!isAssignedToOwner) {
    if ((target.industries ?? []).length && !String(profile?.industry || "").trim()) return null;
    if ((target.businessModels ?? []).length && !String(profile?.businessModel || "").trim()) return null;
  }

  return {
    id: c.id,
    name: c.name,
    placement: c.placement as PortalAdPlacement,
    creative: readCreativeJson(c.creativeJson),
    reward: readRewardJson(c.rewardJson),
  };
}
