import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
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
  let state = await getCreditsState(ownerId);

  // Demo safety net: ensure the demo-full account always has credits to test with,
  // even if the seed route wasn't run in this environment.
  const demoFull = (process.env.DEMO_PORTAL_FULL_EMAIL ?? "").trim().toLowerCase();
  const sessionEmail = (auth.session.user.email ?? "").trim().toLowerCase();
  const demoMinBalance = 500;
  if (demoFull && sessionEmail && sessionEmail === demoFull && state.balance < demoMinBalance) {
    const next = { balance: demoMinBalance, autoTopUp: state.autoTopUp };
    const row = await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId, serviceSlug: "credits" } },
      create: { ownerId, serviceSlug: "credits", status: "COMPLETE", dataJson: next },
      update: { dataJson: next, status: "COMPLETE" },
      select: { dataJson: true },
    });
    const rec = row.dataJson && typeof row.dataJson === "object" ? (row.dataJson as Record<string, unknown>) : {};
    const balance = typeof rec.balance === "number" ? rec.balance : demoMinBalance;
    const autoTopUp = Boolean(rec.autoTopUp);
    state = { balance: Math.max(0, Math.floor(balance)), autoTopUp };
  }

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
