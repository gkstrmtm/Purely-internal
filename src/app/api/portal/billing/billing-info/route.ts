import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripeGet, stripePost } from "@/lib/stripeFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StripeCustomer = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;
  invoice_settings?: {
    default_payment_method?:
      | string
      | null
      | {
          id: string;
          card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } | null;
          billing_details?: {
            name?: string | null;
            email?: string | null;
            phone?: string | null;
            address?: {
              line1?: string | null;
              line2?: string | null;
              city?: string | null;
              state?: string | null;
              postal_code?: string | null;
              country?: string | null;
            } | null;
          } | null;
        };
  };
};

const updateSchema = z.object({
  billingEmail: z.string().email().optional(),
  billingName: z.string().min(1).max(120).optional(),
  billingPhone: z.string().min(1).max(40).optional(),
  billingAddress: z.string().min(1).max(220).optional(),
  billingCity: z.string().max(120).optional(),
  billingState: z.string().max(120).optional(),
  billingPostalCode: z.string().max(40).optional(),
});

export async function GET() {
  const auth = await requireClientSessionForService("billing", "view");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: true, stripeConfigured: false }, { status: 200 });
  }

  const email = String(auth.session.user.email || "").trim();
  if (!email) {
    return NextResponse.json({ error: "Missing user email" }, { status: 400 });
  }

  const ownerId = String((auth as any).access?.ownerId || auth.session.user.id || "").trim();

  try {
    const customerId = await getOrCreateStripeCustomerId(email, { ownerId });

    const customer = await stripeGet<StripeCustomer>(`/v1/customers/${encodeURIComponent(customerId)}`, {
      "expand[]": "invoice_settings.default_payment_method",
    });

    const pm = customer?.invoice_settings?.default_payment_method;
    const pmObj = pm && typeof pm === "object" ? pm : null;

    return NextResponse.json({
      ok: true,
      stripeConfigured: true,
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        address: customer.address
          ? {
              line1: customer.address.line1,
              line2: customer.address.line2,
              city: customer.address.city,
              state: customer.address.state,
              postalCode: customer.address.postal_code,
              country: customer.address.country,
            }
          : null,
      },
      defaultPaymentMethod: pmObj
        ? {
            id: pmObj.id,
            brand: pmObj.card?.brand ?? null,
            last4: pmObj.card?.last4 ?? null,
            expMonth: pmObj.card?.exp_month ?? null,
            expYear: pmObj.card?.exp_year ?? null,
          }
        : pm && typeof pm === "string"
          ? { id: pm, brand: null, last4: null, expMonth: null, expYear: null }
          : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("billing", "view");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, { status: auth.status });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 400 });
  }

  const email = String(auth.session.user.email || "").trim();
  if (!email) {
    return NextResponse.json({ error: "Missing user email" }, { status: 400 });
  }

  const ownerId = String((auth as any).access?.ownerId || auth.session.user.id || "").trim();

  const json = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const customerId = await getOrCreateStripeCustomerId(email, { ownerId });

    const data = parsed.data;
    const params: Record<string, unknown> = {};

    if (typeof data.billingEmail === "string") params.email = data.billingEmail.trim();
    if (typeof data.billingName === "string") params.name = data.billingName.trim();
    if (typeof data.billingPhone === "string") params.phone = data.billingPhone.trim();

    if (typeof data.billingAddress === "string") params["address[line1]"] = data.billingAddress.trim();
    if (typeof data.billingCity === "string") params["address[city]"] = data.billingCity.trim();
    if (typeof data.billingState === "string") params["address[state]"] = data.billingState.trim();
    if (typeof data.billingPostalCode === "string") params["address[postal_code]"] = data.billingPostalCode.trim();

    if (!Object.keys(params).length) {
      return NextResponse.json({ ok: true });
    }

    await stripePost(`/v1/customers/${encodeURIComponent(customerId)}`, {
      ...params,
      ...(ownerId ? { "metadata[pa_owner_id]": ownerId } : null),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
