import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { getCreditsState, isFreeCreditsOwner, setAutoTopUp } from "@/lib/credits";
import { creditsPerTopUpPackage } from "@/lib/creditsTopup";
import { CREDIT_USD_VALUE } from "@/lib/pricing.shared";
import { isStripeConfigured } from "@/lib/stripeFetch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const putSchema = z.object({
  autoTopUp: z.boolean(),
});

function purchaseAvailable() {
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(isStripeConfigured());
}

export async function GET() {
  const auth = await requireClientSessionForService("billing");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  let state = await getCreditsState(ownerId);
  const free = await isFreeCreditsOwner(ownerId).catch(() => false);

  // Demo safety net: ensure the demo-full account always has credits to test with,
  // even if the seed route wasn't run in this environment.
  const demoFullFromEnv = (process.env.DEMO_PORTAL_FULL_EMAIL ?? "").trim().toLowerCase();
  const demoFullHardcoded = "demo-full@purelyautomation.dev";
  const sessionEmailRaw = (auth.session.user.email ?? "").trim().toLowerCase();
  const sessionEmail = sessionEmailRaw
    ? sessionEmailRaw
    : (
        await prisma.user
          .findUnique({ where: { id: ownerId }, select: { email: true } })
          .then((u) => (u?.email ?? "").trim().toLowerCase())
          .catch(() => "")
      );
  const demoMinBalance = 500;
  const isDemoFull =
    Boolean(sessionEmail) &&
    (sessionEmail === demoFullFromEnv || sessionEmail === demoFullHardcoded);

  if (isDemoFull && state.balance < demoMinBalance) {
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
    purchaseAvailable: free ? false : purchaseAvailable(),
    billingPath: "/portal/app/billing",
    creditUsdValue: CREDIT_USD_VALUE,
    creditsPerPackage: creditsPerTopUpPackage(),
    freeCredits: free,
  });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("billing");
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
