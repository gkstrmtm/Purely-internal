import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { getCreditsState, setAutoTopUp } from "@/lib/credits";
import { isStripeConfigured } from "@/lib/stripeFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const putSchema = z.object({
  autoTopUp: z.boolean(),
});

function purchaseAvailable() {
  const price = (process.env.STRIPE_PRICE_CREDITS_TOPUP ?? "").trim();
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(isStripeConfigured() && price);
}

export async function GET() {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const state = await getCreditsState(ownerId);

  return NextResponse.json({
    ok: true,
    credits: state.balance,
    autoTopUp: state.autoTopUp,
    purchaseAvailable: purchaseAvailable(),
    billingPath: "/portal/app/billing",
  });
}

export async function PUT(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;
  const next = await setAutoTopUp(ownerId, parsed.data.autoTopUp);

  return NextResponse.json({
    ok: true,
    credits: next.balance,
    autoTopUp: next.autoTopUp,
    purchaseAvailable: purchaseAvailable(),
    billingPath: "/portal/app/billing",
  });
}
