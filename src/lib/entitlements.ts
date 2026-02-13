import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet } from "@/lib/stripeFetch";
import { prisma } from "@/lib/db";

import { MODULE_KEYS } from "@/lib/entitlements.shared";
import type { Entitlements } from "@/lib/entitlements.shared";

export type { Entitlements, ModuleKey } from "@/lib/entitlements.shared";

const DEFAULT_DEMO_PORTAL_FULL_EMAIL = "demo-full@purelyautomation.dev";
const DEFAULT_DEMO_PORTAL_LIMITED_EMAIL = "demo-limited@purelyautomation.dev";

function blankEntitlements(): Entitlements {
  return {
    blog: false,
    booking: false,
    automations: false,
    reviews: false,
    newsletter: false,
    nurture: false,
    aiReceptionist: false,
    crm: false,
    leadOutbound: false,
  };
}

const OVERRIDES_SETUP_SLUG = "__portal_entitlement_overrides";

export function demoEntitlementsByEmail(email: string): Entitlements | null {
  const fullEmail = (process.env.DEMO_PORTAL_FULL_EMAIL ?? DEFAULT_DEMO_PORTAL_FULL_EMAIL)
    .toLowerCase()
    .trim();
  const limitedEmail = (process.env.DEMO_PORTAL_LIMITED_EMAIL ?? DEFAULT_DEMO_PORTAL_LIMITED_EMAIL)
    .toLowerCase()
    .trim();
  const normalized = email.toLowerCase().trim();

  if (fullEmail && normalized === fullEmail) {
    return {
      blog: true,
      booking: true,
      automations: true,
      reviews: true,
      newsletter: true,
      nurture: true,
      aiReceptionist: true,
      crm: true,
      leadOutbound: true,
    };
  }

  if (limitedEmail && normalized === limitedEmail) {
    return {
      blog: true,
      booking: true,
      automations: true,
      reviews: false,
      newsletter: false,
      nurture: false,
      aiReceptionist: false,
      crm: false,
      leadOutbound: false,
    };
  }

  return null;
}

function priceEnv(key: string) {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export async function entitlementsFromStripe(email: string): Promise<Entitlements> {
  const blogPrice = priceEnv("STRIPE_PRICE_BLOG_AUTOMATION");
  const bookingPrice = priceEnv("STRIPE_PRICE_BOOKING_AUTOMATION");
  const crmPrice = priceEnv("STRIPE_PRICE_CRM_AUTOMATION");
  const leadOutboundPrice = priceEnv("STRIPE_PRICE_LEAD_OUTBOUND");

  const entitlements: Entitlements = {
    blog: false,
    booking: false,
    automations: false,
    reviews: false,
    newsletter: false,
    nurture: false,
    aiReceptionist: false,
    crm: false,
    leadOutbound: false,
  };

  if (!isStripeConfigured()) return entitlements;

  const customer = await getOrCreateStripeCustomerId(email);
  const subs = await stripeGet<{
    data: Array<{
      status: string;
      metadata?: Record<string, string>;
      items?: {
        data?: Array<{
          price?: {
            id?: string;
            nickname?: string | null;
            product?: { name?: string | null } | null;
          };
        }>;
      };
    }>;
  }>("/v1/subscriptions", {
    customer,
    status: "all",
    limit: 100,
    "expand[]": ["data.items.data.price", "data.items.data.price.product"],
  });

  const active = subs.data.filter((s) => ["active", "trialing", "past_due"].includes(String(s.status)));

  const priceIds = new Set<string>();

  const normalizeText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const inferFromText = (textRaw: string) => {
    const text = normalizeText(textRaw);
    if (!text) return;

    // Keep these broad and user-friendly: Stripe product names vary.
    if (text.includes("automated blog") || text.includes("blog automation") || (text.includes("blog") && text.includes("automation"))) {
      entitlements.blog = true;
    }

    if (text.includes("booking") && (text.includes("automation") || text.includes("reminder") || text.includes("calendar") || text.includes("appointments"))) {
      entitlements.booking = true;
    }

    if (text.includes("automation builder") || (text.includes("automations") && text.includes("builder")) || text.includes("workflow") || text.includes("zap")) {
      entitlements.automations = true;
    }

    if (text.includes("review") || text.includes("reputation")) {
      entitlements.reviews = true;
    }

    if (text.includes("newsletter")) {
      entitlements.newsletter = true;
    }

    if (text.includes("nurture") || text.includes("campaign")) {
      // Nurture product names often contain “campaign”.
      entitlements.nurture = true;
    }

    if (text.includes("ai receptionist") || (text.includes("receptionist") && text.includes("ai")) || text.includes("voice agent")) {
      entitlements.aiReceptionist = true;
    }

    if (text.includes("follow up") || text.includes("followup") || text.includes("crm") || text.includes("lead scraping") || text.includes("lead-scraping")) {
      entitlements.crm = true;
    }

    if (text.includes("ai outbound") || (text.includes("outbound") && text.includes("ai")) || text.includes("outbound calls")) {
      entitlements.leadOutbound = true;
    }
  };
  for (const s of active) {
    for (const item of s.items?.data ?? []) {
      const id = item.price?.id;
      if (id) priceIds.add(id);

      const nickname = typeof item.price?.nickname === "string" ? item.price.nickname : "";
      const productName = typeof item.price?.product?.name === "string" ? item.price.product.name : "";
      if (nickname) inferFromText(nickname);
      if (productName) inferFromText(productName);
    }

    const moduleMeta = String(s.metadata?.module ?? "").trim();
    if (moduleMeta === "blog") entitlements.blog = true;
    if (moduleMeta === "booking") entitlements.booking = true;
    if (moduleMeta === "automations") entitlements.automations = true;
    if (moduleMeta === "reviews") entitlements.reviews = true;
    if (moduleMeta === "newsletter") entitlements.newsletter = true;
    if (moduleMeta === "nurture") entitlements.nurture = true;
    if (moduleMeta === "aiReceptionist") entitlements.aiReceptionist = true;
    if (moduleMeta === "crm") entitlements.crm = true;
    if (moduleMeta === "leadOutbound") entitlements.leadOutbound = true;

    const planIdsRaw = String(s.metadata?.planIds ?? "").trim();
    if (planIdsRaw) {
      const planIds = new Set(planIdsRaw.split(",").map((x) => x.trim()).filter(Boolean));
      if (planIds.has("blogs")) entitlements.blog = true;
      if (planIds.has("booking")) entitlements.booking = true;
      if (planIds.has("automations")) entitlements.automations = true;
      if (planIds.has("reviews")) entitlements.reviews = true;
      if (planIds.has("newsletter")) entitlements.newsletter = true;
      if (planIds.has("nurture")) entitlements.nurture = true;
      if (planIds.has("ai-receptionist")) entitlements.aiReceptionist = true;
      if (planIds.has("ai-outbound")) entitlements.leadOutbound = true;
      // Note: CRM isn't currently a get-started planId; handled via module metadata.
    }
  }

  // Legacy fallback: match fixed Stripe price IDs when present.
  if (blogPrice && priceIds.has(blogPrice)) entitlements.blog = true;
  if (bookingPrice && priceIds.has(bookingPrice)) entitlements.booking = true;
  if (crmPrice && priceIds.has(crmPrice)) entitlements.crm = true;
  if (leadOutboundPrice && priceIds.has(leadOutboundPrice)) entitlements.leadOutbound = true;

  return entitlements;
}

async function entitlementsFromOverrides(ownerId: string): Promise<Partial<Entitlements>> {
  const row = await prisma.portalServiceSetup
    .findUnique({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: OVERRIDES_SETUP_SLUG } },
      select: { dataJson: true },
    })
    .catch(() => null);

  const rec = row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
    ? (row.dataJson as Record<string, unknown>)
    : null;
  const overridesRaw = rec?.overrides && typeof rec.overrides === "object" && !Array.isArray(rec.overrides)
    ? (rec.overrides as Record<string, unknown>)
    : null;

  if (!overridesRaw) return {};

  const overrides: Partial<Entitlements> = {};
  for (const key of MODULE_KEYS) {
    if (overridesRaw[key] === true) overrides[key] = true;
  }
  return overrides;
}

async function baseEntitlementsFromEmail(email: string): Promise<Entitlements> {
  const demo = demoEntitlementsByEmail(email);
  if (demo) return demo;

  if (!isStripeConfigured()) return blankEntitlements();

  try {
    return await entitlementsFromStripe(email);
  } catch {
    return blankEntitlements();
  }
}

export async function resolveEntitlementsForOwnerId(ownerId: string, fallbackEmail?: string | null): Promise<Entitlements> {
  const owner = await prisma.user
    .findUnique({ where: { id: ownerId }, select: { email: true } })
    .catch(() => null);
  const entitlementsEmail = String(owner?.email || fallbackEmail || "");
  return resolveEntitlements(entitlementsEmail, { ownerId });
}

export async function resolveEntitlements(
  email: string | null | undefined,
  opts?: { ownerId?: string | null },
): Promise<Entitlements> {
  const e = typeof email === "string" ? email.trim() : "";
  if (!e) return blankEntitlements();

  const base = await baseEntitlementsFromEmail(e);

  const ownerId = (() => {
    const id = opts?.ownerId;
    return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
  })();

  const resolvedOwnerId =
    ownerId ??
    (await prisma.user
      .findUnique({ where: { email: e }, select: { id: true } })
      .then((u) => u?.id ?? null)
      .catch(() => null));

  if (!resolvedOwnerId) return base;

  const overrides = await entitlementsFromOverrides(resolvedOwnerId);
  return { ...base, ...overrides };
}
