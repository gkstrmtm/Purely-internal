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

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as any).message);
  return "Unknown error";
}

function looksLikeMissingStripeColumns(e: unknown): boolean {
  const msg = errorMessage(e).toLowerCase();
  return (
    msg.includes("does not exist") &&
    (msg.includes("stripesecretkey") || msg.includes("stripeaccountid") || msg.includes("stripeconnectedat"))
  );
}

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
  const vercelEnv = (process.env.VERCEL_ENV ?? "").trim() || null;

  try {
    const status = await getStripeIntegrationStatus(ownerId);
    return NextResponse.json({ ok: true, stripe: status, vercelEnv, expectedEnvVar: "PORTAL_ENCRYPTION_MASTER_KEY" });
  } catch {
    const encryptionConfigured = isPortalEncryptionConfigured();

    return NextResponse.json({
      ok: true,
      stripe: {
        configured: false,
        prefix: null,
        accountId: null,
        connectedAtIso: null,
        encryptionConfigured,
      },
      vercelEnv,
      expectedEnvVar: "PORTAL_ENCRYPTION_MASTER_KEY",
    });
  }
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
    if (looksLikeMissingStripeColumns(e)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Stripe connection is temporarily unavailable. Please contact support.",
        },
        { status: 500 },
      );
    }

    const msg = errorMessage(e) || "Unable to connect Stripe";
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
  try {
    await clearStripeIntegration(ownerId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (looksLikeMissingStripeColumns(e)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Stripe disconnection is temporarily unavailable. Please contact support.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: false, error: errorMessage(e) || "Unable to disconnect Stripe" }, { status: 400 });
  }
}
