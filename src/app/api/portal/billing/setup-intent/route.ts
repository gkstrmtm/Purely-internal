import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripePost } from "@/lib/stripeFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SetupIntentRes = {
  id: string;
  client_secret: string | null;
};

export async function POST() {
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

  try {
    const customerId = await getOrCreateStripeCustomerId(email, { ownerId });

    const intent = await stripePost<SetupIntentRes>("/v1/setup_intents", {
      customer: customerId,
      usage: "off_session",
      "payment_method_types[]": "card",
      ...(ownerId ? { "metadata[pa_owner_id]": ownerId } : null),
    });

    return NextResponse.json({ ok: true, id: intent.id, clientSecret: intent.client_secret });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
