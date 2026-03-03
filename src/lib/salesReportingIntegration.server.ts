import { prisma } from "@/lib/db";
import { decryptStringV1, encryptStringV1, isPortalEncryptionConfigured } from "@/lib/portalEncryption.server";
import { clearStripeIntegration, getStripeIntegrationStatus, setStripeSecretKeyForOwner } from "@/lib/stripeIntegration.server";
import { SalesReportingProvider } from "@prisma/client";
import type { SalesReportingProviderKey } from "@/lib/salesReportingProviders";

export type SalesReportingIntegrationStatus = {
  encryptionConfigured: boolean;
  activeProvider: SalesReportingProviderKey | null;
  providers: Record<SalesReportingProviderKey, { configured: boolean; displayHint?: string | null; connectedAtIso?: string | null }>;
  stripe: {
    configured: boolean;
    prefix: string | null;
    accountId: string | null;
    connectedAtIso: string | null;
  };
};

export function toProviderEnum(key: SalesReportingProviderKey): SalesReportingProvider {
  switch (key) {
    case "stripe":
      return SalesReportingProvider.STRIPE;
    case "authorizenet":
      return SalesReportingProvider.AUTHORIZENET;
    case "braintree":
      return SalesReportingProvider.BRAINTREE;
    case "razorpay":
      return SalesReportingProvider.RAZORPAY;
    case "paystack":
      return SalesReportingProvider.PAYSTACK;
    case "flutterwave":
      return SalesReportingProvider.FLUTTERWAVE;
    case "mollie":
      return SalesReportingProvider.MOLLIE;
    case "mercadopago":
      return SalesReportingProvider.MERCADOPAGO;
    default:
      throw new Error("Unsupported provider");
  }
}

export function fromProviderEnum(p: SalesReportingProvider | null | undefined): SalesReportingProviderKey | null {
  switch (p) {
    case SalesReportingProvider.STRIPE:
      return "stripe";
    case SalesReportingProvider.AUTHORIZENET:
      return "authorizenet";
    case SalesReportingProvider.BRAINTREE:
      return "braintree";
    case SalesReportingProvider.RAZORPAY:
      return "razorpay";
    case SalesReportingProvider.PAYSTACK:
      return "paystack";
    case SalesReportingProvider.FLUTTERWAVE:
      return "flutterwave";
    case SalesReportingProvider.MOLLIE:
      return "mollie";
    case SalesReportingProvider.MERCADOPAGO:
      return "mercadopago";
    default:
      return null;
  }
}

export async function getSalesReportingStatus(userId: string): Promise<SalesReportingIntegrationStatus> {
  const encryptionConfigured = isPortalEncryptionConfigured();

  const [settings, creds, stripe] = await Promise.all([
    prisma.salesReportingSettings.findUnique({ where: { userId }, select: { activeProvider: true } }).catch(() => null),
    prisma.salesReportingCredential
      .findMany({ where: { userId }, select: { provider: true, displayHint: true, connectedAt: true } })
      .catch(() => [] as any[]),
    getStripeIntegrationStatus(userId).catch(() => ({
      configured: false,
      prefix: null,
      accountId: null,
      connectedAtIso: null,
      encryptionConfigured,
    })),
  ]);

  const activeProvider = fromProviderEnum(settings?.activeProvider ?? null);

  const empty = {
    configured: false,
    displayHint: null as string | null,
    connectedAtIso: null as string | null,
  };

  const providers: SalesReportingIntegrationStatus["providers"] = {
    stripe: { ...empty },
    authorizenet: { ...empty },
    braintree: { ...empty },
    razorpay: { ...empty },
    paystack: { ...empty },
    flutterwave: { ...empty },
    mollie: { ...empty },
    mercadopago: { ...empty },
  };

  for (const row of creds ?? []) {
    const key = fromProviderEnum(row.provider as any);
    if (!key || key === "stripe") continue;
    providers[key] = {
      configured: true,
      displayHint: row.displayHint ?? null,
      connectedAtIso: row.connectedAt ? row.connectedAt.toISOString() : null,
    };
  }

  // Stripe is stored on User today.
  providers.stripe = {
    configured: Boolean(stripe?.configured),
    displayHint: stripe?.prefix ?? null,
    connectedAtIso: stripe?.connectedAtIso ?? null,
  };

  return {
    encryptionConfigured,
    activeProvider,
    providers,
    stripe: {
      configured: Boolean(stripe?.configured),
      prefix: stripe?.prefix ?? null,
      accountId: stripe?.accountId ?? null,
      connectedAtIso: stripe?.connectedAtIso ?? null,
    },
  };
}

export async function setActiveSalesProvider(userId: string, provider: SalesReportingProviderKey | null): Promise<void> {
  await prisma.salesReportingSettings.upsert({
    where: { userId },
    create: { userId, activeProvider: provider ? toProviderEnum(provider) : null },
    update: { activeProvider: provider ? toProviderEnum(provider) : null },
  });
}

export async function setProviderCredentials(userId: string, provider: Exclude<SalesReportingProviderKey, "stripe">, credentials: any, displayHint?: string | null) {
  if (!isPortalEncryptionConfigured()) throw new Error("Integration storage is not enabled.");

  const plaintext = JSON.stringify(credentials ?? {});
  const enc = encryptStringV1(plaintext);
  await prisma.salesReportingCredential.upsert({
    where: { userId_provider: { userId, provider: toProviderEnum(provider) } },
    create: {
      userId,
      provider: toProviderEnum(provider),
      ciphertextB64: enc.ciphertextB64,
      ivB64: enc.ivB64,
      authTagB64: enc.authTagB64,
      displayHint: displayHint ?? null,
      connectedAt: new Date(),
    },
    update: {
      ciphertextB64: enc.ciphertextB64,
      ivB64: enc.ivB64,
      authTagB64: enc.authTagB64,
      displayHint: displayHint ?? null,
    },
  });
}

export async function getProviderCredentials<T = any>(userId: string, provider: Exclude<SalesReportingProviderKey, "stripe">): Promise<T | null> {
  const row = await prisma.salesReportingCredential.findUnique({
    where: { userId_provider: { userId, provider: toProviderEnum(provider) } },
    select: { ciphertextB64: true, ivB64: true, authTagB64: true },
  });
  if (!row) return null;

  const json = decryptStringV1({ version: 1, ciphertextB64: row.ciphertextB64, ivB64: row.ivB64, authTagB64: row.authTagB64 });
  if (!json) return null;
  return (JSON.parse(json) as T) ?? null;
}

export async function disconnectSalesProvider(userId: string, provider: SalesReportingProviderKey): Promise<void> {
  if (provider === "stripe") {
    await clearStripeIntegration(userId);
  } else {
    await prisma.salesReportingCredential.delete({ where: { userId_provider: { userId, provider: toProviderEnum(provider) } } }).catch(() => null);
  }

  const settings = await prisma.salesReportingSettings.findUnique({ where: { userId }, select: { activeProvider: true } }).catch(() => null);
  const active = fromProviderEnum(settings?.activeProvider ?? null);
  if (active === provider) {
    await setActiveSalesProvider(userId, null);
  }
}

export async function connectStripeAndActivate(userId: string, secretKey: string) {
  const res = await setStripeSecretKeyForOwner(userId, secretKey);
  await setActiveSalesProvider(userId, "stripe");
  return res;
}
