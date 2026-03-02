import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireAdsUser } from "@/lib/adsAuth";
import { getOrCreateStripeCustomerId, isStripeConfigured, stripePost } from "@/lib/stripeFetch";

const bodySchema = z.object({
  amountCents: z.number().int().min(100).max(1_000_000_00),
});

export async function POST(req: Request) {
  const user = await requireAdsUser();

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const amountCents = parsed.data.amountCents;

  const stripeReady = isStripeConfigured() && Boolean(user.email);
  if (!stripeReady) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "Purchasing ad funds is unavailable right now." }, { status: 400 });
    }

    const out = await prisma.$transaction(async (tx) => {
      const account = await tx.adsAdvertiserAccount.upsert({
        where: { userId: user.id },
        update: { balanceCents: { increment: amountCents } },
        create: { userId: user.id, balanceCents: amountCents },
        select: { id: true, balanceCents: true, currency: true },
      });

      await tx.adsAdvertiserLedgerEntry.create({
        data: {
          accountId: account.id,
          kind: "TOPUP",
          amountCents,
          metaJson: { source: "test_mode" },
        },
        select: { id: true },
      });

      return account;
    });

    return NextResponse.json({ ok: true, mode: "test", account: out });
  }

  const origin =
    req.headers.get("origin") ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  const customer = await getOrCreateStripeCustomerId(String(user.email));

  const successUrl = new URL("/ads/app/settings?topup=success&session_id={CHECKOUT_SESSION_ID}", origin).toString();
  const cancelUrl = new URL("/ads/app/settings?topup=cancel", origin).toString();

  const params: Record<string, unknown> = {
    mode: "payment",
    customer,
    success_url: successUrl,
    cancel_url: cancelUrl,
    "payment_intent_data[setup_future_usage]": "off_session",
    "metadata[kind]": "ads_topup",
    "metadata[advertiserUserId]": user.id,
    "metadata[amountCents]": String(amountCents),
  };

  params["line_items[0][price_data][currency]"] = "usd";
  params["line_items[0][price_data][unit_amount]"] = amountCents;
  params["line_items[0][price_data][product_data][name]"] = `Ads funds top-up ($${(amountCents / 100).toFixed(2)})`;
  params["line_items[0][quantity]"] = 1;

  const checkout = await stripePost<{ url: string }>("/v1/checkout/sessions", params);

  return NextResponse.json({ ok: true, mode: "stripe", url: checkout.url });
}
