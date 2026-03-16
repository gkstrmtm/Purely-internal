import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { getCreditsLifecycleForOwner, getCreditsState, setAutoTopUp } from "@/lib/credits";
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
  const state = await getCreditsState(ownerId);
  const lifecycle = await getCreditsLifecycleForOwner(ownerId);

  return NextResponse.json({
    ok: true,
    credits: state.balance,
    autoTopUp: state.autoTopUp,
    lifecycle,
    purchaseAvailable: purchaseAvailable(),
    billingPath: "/portal/app/billing",
    creditUsdValue: await getUsdPerCreditForOwner({ ownerId, portalVariant }),
    creditsPerPackage: creditsPerTopUpPackage(),
    freeCredits: false,
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
