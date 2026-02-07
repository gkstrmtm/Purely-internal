import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet } from "@/lib/stripeFetch";

export type ModuleKey = "blog" | "booking" | "crm" | "leadOutbound";
export type Entitlements = Record<ModuleKey, boolean>;

const DEFAULT_DEMO_PORTAL_FULL_EMAIL = "demo-full@purelyautomation.dev";
const DEFAULT_DEMO_PORTAL_LIMITED_EMAIL = "demo-limited@purelyautomation.dev";

export function demoEntitlementsByEmail(email: string): Entitlements | null {
  const fullEmail = (process.env.DEMO_PORTAL_FULL_EMAIL ?? DEFAULT_DEMO_PORTAL_FULL_EMAIL)
    .toLowerCase()
    .trim();
  const limitedEmail = (process.env.DEMO_PORTAL_LIMITED_EMAIL ?? DEFAULT_DEMO_PORTAL_LIMITED_EMAIL)
    .toLowerCase()
    .trim();
  const normalized = email.toLowerCase().trim();

  if (fullEmail && normalized === fullEmail) {
    return { blog: true, booking: true, crm: true, leadOutbound: true };
  }

  if (limitedEmail && normalized === limitedEmail) {
    return { blog: true, booking: true, crm: false, leadOutbound: false };
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
    crm: false,
    leadOutbound: false,
  };

  if (!isStripeConfigured()) return entitlements;

  const customer = await getOrCreateStripeCustomerId(email);
  const subs = await stripeGet<{
    data: Array<{
      status: string;
      items?: { data?: Array<{ price?: { id?: string } }> };
    }>;
  }>("/v1/subscriptions", {
    customer,
    status: "all",
    limit: 100,
    "expand[]": "data.items.data.price",
  });

  const active = subs.data.filter((s) => ["active", "trialing", "past_due"].includes(String(s.status)));

  const priceIds = new Set<string>();
  for (const s of active) {
    for (const item of s.items?.data ?? []) {
      const id = item.price?.id;
      if (id) priceIds.add(id);
    }
  }

  if (blogPrice && priceIds.has(blogPrice)) entitlements.blog = true;
  if (bookingPrice && priceIds.has(bookingPrice)) entitlements.booking = true;
  if (crmPrice && priceIds.has(crmPrice)) entitlements.crm = true;
  if (leadOutboundPrice && priceIds.has(leadOutboundPrice)) entitlements.leadOutbound = true;

  return entitlements;
}

export async function resolveEntitlements(email: string | null | undefined): Promise<Entitlements> {
  const entitlements: Entitlements = {
    blog: false,
    booking: false,
    crm: false,
    leadOutbound: false,
  };

  const e = typeof email === "string" ? email.trim() : "";
  if (!e) return entitlements;

  const demo = demoEntitlementsByEmail(e);
  if (demo) return demo;

  if (!isStripeConfigured()) return entitlements;

  try {
    return await entitlementsFromStripe(e);
  } catch {
    return entitlements;
  }
}
