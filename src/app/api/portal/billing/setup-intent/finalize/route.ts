import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import {
  getOrCreateStripeCustomerId,
  isStripeConfigured,
  stripeGet,
  stripePost,
} from "@/lib/stripeFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type FinalizeBody = {
  setupIntentId?: string;
};

type SetupIntent = {
  id: string;
  status: string;
  customer: string | null;
  payment_method: string | null;
};

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

  let body: FinalizeBody = {};
  try {
    body = (await req.json()) as FinalizeBody;
  } catch {
    // ignore
  }

  const setupIntentId = String(body.setupIntentId || "").trim();
  if (!setupIntentId) {
    return NextResponse.json({ error: "Missing setupIntentId" }, { status: 400 });
  }

  try {
    const customerId = await getOrCreateStripeCustomerId(email, { ownerId });

    const si = await stripeGet<SetupIntent>(`/v1/setup_intents/${encodeURIComponent(setupIntentId)}`);

    if (si.customer !== customerId) {
      return NextResponse.json({ error: "SetupIntent customer mismatch" }, { status: 403 });
    }

    if (si.status !== "succeeded") {
      return NextResponse.json({ error: `SetupIntent not succeeded (status=${si.status})` }, { status: 400 });
    }

    if (!si.payment_method) {
      return NextResponse.json({ error: "SetupIntent missing payment_method" }, { status: 400 });
    }

    // Ensure it's the default for invoices/subscriptions.
    await stripePost(`/v1/customers/${encodeURIComponent(customerId)}`, {
      "invoice_settings[default_payment_method]": si.payment_method,
      ...(ownerId ? { "metadata[pa_owner_id]": ownerId } : null),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
