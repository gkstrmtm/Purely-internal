import { NextResponse } from "next/server";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { stripeGetWithKey } from "@/lib/stripeFetchWithKey.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RangeKey = "7d" | "30d";

function clampRangeKey(value: string | null): RangeKey {
  switch ((value ?? "").toLowerCase().trim()) {
    case "7d":
    case "7":
      return "7d";
    case "30d":
    case "30":
    default:
      return "30d";
  }
}

function startForRange(range: RangeKey, now: Date): Date {
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function dayKeyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type StripeCharge = {
  id: string;
  amount: number;
  amount_refunded: number;
  created: number;
  currency: string;
  paid: boolean;
  status: string;
  refunded?: boolean;
  billing_details?: { email?: string | null; name?: string | null };
  receipt_url?: string | null;
};

type StripeList<T> = { data: T[] };

export async function GET(req: Request) {
  const auth = await requireClientSessionForService("reporting", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const secretKey = await getStripeSecretKeyForOwner(ownerId);
  if (!secretKey) {
    return NextResponse.json({ ok: false, error: "Stripe is not connected" }, { status: 400 });
  }

  const url = new URL(req.url);
  const range = clampRangeKey(url.searchParams.get("range"));
  const now = new Date();
  const start = startForRange(range, now);

  const createdGte = Math.floor(start.getTime() / 1000);

  let charges: StripeCharge[] = [];

  try {
    const list = await stripeGetWithKey<StripeList<StripeCharge>>(secretKey, "/v1/charges", {
      limit: 100,
      "created[gte]": createdGte,
    });
    charges = Array.isArray(list?.data) ? list.data : [];
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Stripe request failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  // Only count paid/succeeded charges.
  const paidCharges = charges.filter((c) => Boolean(c?.paid) && String(c?.status || "").toLowerCase() === "succeeded");

  let grossCents = 0;
  let refundedCents = 0;
  const currency = paidCharges.find((c) => typeof c.currency === "string")?.currency ?? "usd";

  const daily: Record<string, { grossCents: number; refundedCents: number; count: number }> = {};

  for (const c of paidCharges) {
    const amount = typeof c.amount === "number" ? c.amount : 0;
    const refunded = typeof c.amount_refunded === "number" ? c.amount_refunded : 0;
    grossCents += amount;
    refundedCents += refunded;

    const createdMs = (typeof c.created === "number" ? c.created : 0) * 1000;
    const day = dayKeyUtc(new Date(createdMs || now.getTime()));
    daily[day] = daily[day] ?? { grossCents: 0, refundedCents: 0, count: 0 };
    daily[day].grossCents += amount;
    daily[day].refundedCents += refunded;
    daily[day].count += 1;
  }

  const dailyRows = Object.entries(daily)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({
      day,
      count: v.count,
      grossCents: v.grossCents,
      refundedCents: v.refundedCents,
      netCents: v.grossCents - v.refundedCents,
    }));

  const recent = paidCharges
    .slice()
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, 20)
    .map((c) => ({
      id: c.id,
      createdIso: new Date((c.created ?? 0) * 1000).toISOString(),
      amountCents: c.amount ?? 0,
      refundedCents: c.amount_refunded ?? 0,
      currency: c.currency ?? "usd",
      email: c.billing_details?.email ?? null,
      name: c.billing_details?.name ?? null,
      receiptUrl: c.receipt_url ?? null,
    }));

  return NextResponse.json({
    ok: true,
    range,
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    currency,
    totals: {
      chargeCount: paidCharges.length,
      grossCents,
      refundedCents,
      netCents: grossCents - refundedCents,
    },
    daily: dailyRows,
    recent,
    note: charges.length >= 100 ? "Limited to the most recent 100 charges in the selected range." : undefined,
  });
}
