import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { getCreditsLifecycleForOwner, getCreditsState, isFreeCreditsOwner, setAutoTopUp } from "@/lib/credits";
import { creditsPerTopUpPackage } from "@/lib/creditsTopup";
import { isStripeConfigured } from "@/lib/stripeFetch";
import { getUsdPerCreditForOwner } from "@/lib/creditsPricing.server";
import type { PortalVariant } from "@/lib/portalVariant";

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
  const portalVariant = ((auth.session.user as any).portalVariant as PortalVariant | undefined) ?? "portal";
  let state = await getCreditsState(ownerId);
  let lifecycle = await getCreditsLifecycleForOwner(ownerId);
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
    const existing = await prisma.portalServiceSetup
      .findUnique({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "credits" } },
        select: { dataJson: true, status: true },
      })
      .catch(() => null);

    const prevJson =
      existing?.dataJson && typeof existing.dataJson === "object" && !Array.isArray(existing.dataJson)
        ? (existing.dataJson as Record<string, unknown>)
        : {};

    const nextJson = { ...prevJson, balance: demoMinBalance, autoTopUp: Boolean(prevJson.autoTopUp ?? state.autoTopUp) };

    if (existing) {
      await prisma.portalServiceSetup.update({
        where: { ownerId_serviceSlug: { ownerId, serviceSlug: "credits" } },
        data: { dataJson: nextJson, status: existing.status ?? "COMPLETE" },
        select: { id: true },
      });
    } else {
      await prisma.portalServiceSetup.create({
        data: { ownerId, serviceSlug: "credits", status: "COMPLETE", dataJson: nextJson },
        select: { id: true },
      });
    }

    state = await getCreditsState(ownerId);
    lifecycle = await getCreditsLifecycleForOwner(ownerId);
  }

  return NextResponse.json({
    ok: true,
    credits: state.balance,
    autoTopUp: state.autoTopUp,
    lifecycle,
    purchaseAvailable: purchaseAvailable(),
    billingPath: "/portal/app/billing",
    creditUsdValue: await getUsdPerCreditForOwner({ ownerId, portalVariant }),
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
