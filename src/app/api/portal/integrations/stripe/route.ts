import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import {
  clearStripeIntegration,
  getStripeIntegrationStatus,
  setStripeSecretKeyForOwner,
} from "@/lib/stripeIntegration.server";
import { isPortalEncryptionConfigured } from "@/lib/portalEncryption.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const putSchema = z.object({
  secretKey: z.string().trim().min(10).max(300),
});

export async function GET() {
  const auth = await requireClientSessionForService("profile", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  const status = await getStripeIntegrationStatus(ownerId);

  return NextResponse.json({ ok: true, stripe: status });
}

export async function PUT(req: Request) {
  const auth = await requireClientSessionForService("profile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  if (!isPortalEncryptionConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Server is missing PORTAL_ENCRYPTION_MASTER_KEY; cannot store Stripe keys safely.",
      },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  try {
    const res = await setStripeSecretKeyForOwner(ownerId, parsed.data.secretKey);
    return NextResponse.json({ ok: true, stripe: { configured: true, ...res } });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Unable to connect Stripe";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE() {
  const auth = await requireClientSessionForService("profile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  await clearStripeIntegration(ownerId);
  return NextResponse.json({ ok: true });
}
