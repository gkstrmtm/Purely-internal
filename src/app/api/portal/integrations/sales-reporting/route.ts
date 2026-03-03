import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import {
  connectStripeAndActivate,
  disconnectSalesProvider,
  getSalesReportingStatus,
  setActiveSalesProvider,
  setProviderCredentials,
} from "@/lib/salesReportingIntegration.server";
import type { SalesReportingProviderKey } from "@/lib/salesReportingProviders";
import { validateSalesCredentials, type ConnectCredentialsInput } from "@/lib/salesReportingReport.server";
import { isPortalEncryptionConfigured } from "@/lib/portalEncryption.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const providerEnum = z.enum([
  "stripe",
  "authorizenet",
  "braintree",
  "razorpay",
  "paystack",
  "flutterwave",
  "mollie",
  "mercadopago",
]);

type ProviderKey = z.infer<typeof providerEnum>;

const connectSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("stripe"), secretKey: z.string().trim().min(10).max(300) }),
  z.object({
    provider: z.literal("authorizenet"),
    apiLoginId: z.string().trim().min(6).max(80),
    transactionKey: z.string().trim().min(6).max(120),
    environment: z.enum(["production", "sandbox"]).optional(),
  }),
  z.object({
    provider: z.literal("braintree"),
    merchantId: z.string().trim().min(3).max(80),
    publicKey: z.string().trim().min(3).max(120),
    privateKey: z.string().trim().min(6).max(180),
    environment: z.enum(["production", "sandbox"]).optional(),
  }),
  z.object({ provider: z.literal("razorpay"), keyId: z.string().trim().min(6).max(80), keySecret: z.string().trim().min(6).max(120) }),
  z.object({ provider: z.literal("paystack"), secretKey: z.string().trim().min(6).max(180) }),
  z.object({ provider: z.literal("flutterwave"), secretKey: z.string().trim().min(6).max(180) }),
  z.object({ provider: z.literal("mollie"), apiKey: z.string().trim().min(6).max(180) }),
  z.object({ provider: z.literal("mercadopago"), accessToken: z.string().trim().min(6).max(220) }),
]);

const putSchema = z.union([
  z.object({ action: z.literal("connect"), data: connectSchema }),
  z.object({ action: z.literal("setActive"), provider: providerEnum.nullable() }),
]);

const deleteSchema = z.object({ provider: providerEnum });

export async function GET() {
  const auth = await requireClientSessionForService("profile", "view");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const ownerId = auth.session.user.id;
  try {
    const status = await getSalesReportingStatus(ownerId);
    return NextResponse.json({ ok: true, ...status });
  } catch {
    return NextResponse.json({
      ok: true,
      encryptionConfigured: isPortalEncryptionConfigured(),
      activeProvider: null,
      providers: {
        stripe: { configured: false },
        authorizenet: { configured: false },
        braintree: { configured: false },
        razorpay: { configured: false },
        paystack: { configured: false },
        flutterwave: { configured: false },
        mollie: { configured: false },
        mercadopago: { configured: false },
      },
      stripe: { configured: false, prefix: null, accountId: null, connectedAtIso: null },
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

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  if (parsed.data.action === "setActive") {
    const provider = parsed.data.provider as ProviderKey | null;
    await setActiveSalesProvider(ownerId, (provider as SalesReportingProviderKey | null) ?? null);
    const status = await getSalesReportingStatus(ownerId);
    return NextResponse.json({ ok: true, ...status });
  }

  const input = parsed.data.data as ConnectCredentialsInput;

  if (!isPortalEncryptionConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Sales reporting setup is temporarily unavailable. Please contact support." },
      { status: 500 },
    );
  }

  try {
    const validation = await validateSalesCredentials(input);

    if (input.provider === "stripe") {
      await connectStripeAndActivate(ownerId, input.secretKey);
      const status = await getSalesReportingStatus(ownerId);
      return NextResponse.json({ ok: true, note: "Connected.", ...status });
    }

    const displayHint = validation?.displayHint ?? null;

    await setProviderCredentials(ownerId, input.provider, input as any, displayHint);
    await setActiveSalesProvider(ownerId, input.provider);

    const status = await getSalesReportingStatus(ownerId);
    return NextResponse.json({ ok: true, note: "Connected.", ...status });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Unable to connect";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireClientSessionForService("profile", "edit");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: auth.status },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const ownerId = auth.session.user.id;

  try {
    await disconnectSalesProvider(ownerId, parsed.data.provider);
    const status = await getSalesReportingStatus(ownerId);
    return NextResponse.json({ ok: true, note: "Disconnected.", ...status });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Unable to disconnect";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
