import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet } from "@/lib/stripeFetch";

type ModuleKey = "blog" | "booking" | "crm";

function priceEnv(key: string) {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

async function entitlementsFromStripe(email: string): Promise<Record<ModuleKey, boolean>> {
  const blogPrice = priceEnv("STRIPE_PRICE_BLOG_AUTOMATION");
  const bookingPrice = priceEnv("STRIPE_PRICE_BOOKING_AUTOMATION");
  const crmPrice = priceEnv("STRIPE_PRICE_CRM_AUTOMATION");

  const entitlements: Record<ModuleKey, boolean> = {
    blog: false,
    booking: false,
    crm: false,
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

  const active = subs.data.filter((s) =>
    ["active", "trialing", "past_due"].includes(String(s.status)),
  );

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

  return entitlements;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "CLIENT" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const entitlements: Record<ModuleKey, boolean> = {
    blog: false,
    booking: false,
    crm: false,
  };

  const email = session.user.email;
  if (email && isStripeConfigured()) {
    try {
      const resolved = await entitlementsFromStripe(email);
      entitlements.blog = resolved.blog;
      entitlements.booking = resolved.booking;
      entitlements.crm = resolved.crm;
    } catch {
      // If Stripe is down/misconfigured, keep safe defaults.
    }
  }

  return NextResponse.json({
    user: {
      email: session.user.email ?? "",
      name: session.user.name ?? "",
      role: session.user.role,
    },
    entitlements,
    metrics: {
      hoursSavedThisWeek: 0,
      hoursSavedAllTime: 0,
    },
    billing: {
      configured: isStripeConfigured(),
    },
  });
}
