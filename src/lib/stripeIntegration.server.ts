import { prisma } from "@/lib/db";
import { getCreditFunnelBuilderSettings, mutateCreditFunnelBuilderSettings } from "@/lib/creditFunnelBuilderSettingsStore";
import { decryptStringV1, encryptStringV1, isPortalEncryptionConfigured } from "@/lib/portalEncryption.server";
import { stripeGetWithKey } from "@/lib/stripeFetchWithKey.server";

const STRIPE_WEBHOOK_SIGNING_SECRET_KEY = "stripeWebhookSigningSecretEnvelope";

function normalizeStripeSecretKey(raw: string): string {
  const k = String(raw || "").trim();
  if (!k) throw new Error("Stripe secret key is required");

  // Secret keys typically start with sk_ (standard) or rk_ (restricted).
  const lower = k.toLowerCase();
  if (!(lower.startsWith("sk_") || lower.startsWith("rk_"))) {
    throw new Error("That doesn’t look like a Stripe *secret* key (expected sk_... or rk_...)");
  }

  if (k.length < 20 || k.length > 300) throw new Error("Stripe key length looks invalid");
  return k;
}

function stripeKeyPrefix(secretKey: string): string {
  const k = String(secretKey || "").trim();
  if (k.startsWith("sk_test_")) return "sk_test";
  if (k.startsWith("rk_test_")) return "rk_test";
  if (k.startsWith("sk_live_")) return "sk_live";
  if (k.startsWith("rk_live_")) return "rk_live";
  return k.slice(0, 6);
}

function normalizeStripeWebhookSigningSecret(raw: string): string {
  const secret = String(raw || "").trim();
  if (!secret) throw new Error("Stripe webhook signing secret is required");
  if (!secret.startsWith("whsec_")) {
    throw new Error("That doesn’t look like a Stripe webhook signing secret (expected whsec_...)");
  }
  if (secret.length < 20 || secret.length > 300) {
    throw new Error("Stripe webhook signing secret length looks invalid");
  }
  return secret;
}

function parseEncryptedSecretEnvelope(raw: unknown): { version: 1; ciphertextB64: string; ivB64: string; authTagB64: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  return rec.version === 1 && typeof rec.ciphertextB64 === "string" && typeof rec.ivB64 === "string" && typeof rec.authTagB64 === "string"
    ? {
        version: 1,
        ciphertextB64: rec.ciphertextB64,
        ivB64: rec.ivB64,
        authTagB64: rec.authTagB64,
      }
    : null;
}

export type StripeIntegrationStatus = {
  configured: boolean;
  prefix: string | null;
  accountId: string | null;
  connectedAtIso: string | null;
  encryptionConfigured: boolean;
};

export async function getStripeIntegrationStatus(ownerId: string): Promise<StripeIntegrationStatus> {
  const row = await prisma.user.findUnique({
    where: { id: ownerId },
    select: {
      stripeSecretKeyCiphertext: true,
      stripeSecretKeyIv: true,
      stripeSecretKeyAuthTag: true,
      stripeSecretKeyPrefix: true,
      stripeAccountId: true,
      stripeConnectedAt: true,
    },
  });

  const configured = Boolean(row?.stripeSecretKeyCiphertext && row?.stripeSecretKeyIv && row?.stripeSecretKeyAuthTag);

  return {
    configured,
    prefix: row?.stripeSecretKeyPrefix ?? null,
    accountId: row?.stripeAccountId ?? null,
    connectedAtIso: row?.stripeConnectedAt ? row.stripeConnectedAt.toISOString() : null,
    encryptionConfigured: isPortalEncryptionConfigured(),
  };
}

export async function clearStripeIntegration(ownerId: string): Promise<void> {
  await prisma.user.update({
    where: { id: ownerId },
    data: {
      stripeSecretKeyCiphertext: null,
      stripeSecretKeyIv: null,
      stripeSecretKeyAuthTag: null,
      stripeSecretKeyPrefix: null,
      stripeAccountId: null,
      stripeConnectedAt: null,
    },
  });
  await clearStripeWebhookSigningSecretForOwner(ownerId).catch(() => null);
}

export async function setStripeSecretKeyForOwner(ownerId: string, rawSecretKey: string) {
  const secretKey = normalizeStripeSecretKey(rawSecretKey);

  // Validate with Stripe first so we don't store junk.
  const acct = await stripeGetWithKey<{ id: string }>(secretKey, "/v1/account");
  const prefix = stripeKeyPrefix(secretKey);

  const enc = encryptStringV1(secretKey);

  await prisma.user.update({
    where: { id: ownerId },
    data: {
      stripeSecretKeyCiphertext: enc.ciphertextB64,
      stripeSecretKeyIv: enc.ivB64,
      stripeSecretKeyAuthTag: enc.authTagB64,
      stripeSecretKeyPrefix: prefix,
      stripeAccountId: acct?.id ? String(acct.id) : null,
      stripeConnectedAt: new Date(),
    },
  });

  return { accountId: acct?.id ? String(acct.id) : null, prefix };
}

export async function getStripeSecretKeyForOwner(ownerId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: ownerId },
    select: {
      stripeSecretKeyCiphertext: true,
      stripeSecretKeyIv: true,
      stripeSecretKeyAuthTag: true,
    },
  });

  const ciphertextB64 = row?.stripeSecretKeyCiphertext ?? "";
  const ivB64 = row?.stripeSecretKeyIv ?? "";
  const authTagB64 = row?.stripeSecretKeyAuthTag ?? "";
  if (!ciphertextB64 || !ivB64 || !authTagB64) return null;

  const secretKey = decryptStringV1({ version: 1, ciphertextB64, ivB64, authTagB64 });
  return secretKey || null;
}

export async function hasStripeWebhookSigningSecretForOwner(ownerId: string): Promise<boolean> {
  if (!ownerId || !isPortalEncryptionConfigured()) return false;
  const settings = await getCreditFunnelBuilderSettings(ownerId).catch(() => null);
  const envelope = parseEncryptedSecretEnvelope(settings?.[STRIPE_WEBHOOK_SIGNING_SECRET_KEY]);
  return Boolean(envelope);
}

export async function getStripeWebhookSigningSecretForOwner(ownerId: string): Promise<string | null> {
  if (!ownerId || !isPortalEncryptionConfigured()) return null;
  const settings = await getCreditFunnelBuilderSettings(ownerId).catch(() => null);
  const envelope = parseEncryptedSecretEnvelope(settings?.[STRIPE_WEBHOOK_SIGNING_SECRET_KEY]);
  if (!envelope) return null;
  try {
    return decryptStringV1(envelope);
  } catch {
    return null;
  }
}

export async function setStripeWebhookSigningSecretForOwner(ownerId: string, rawSigningSecret: string): Promise<void> {
  if (!isPortalEncryptionConfigured()) {
    throw new Error("Server is missing PORTAL_ENCRYPTION_MASTER_KEY; cannot store Stripe webhook secrets safely.");
  }

  const signingSecret = normalizeStripeWebhookSigningSecret(rawSigningSecret);
  const envelope = encryptStringV1(signingSecret);

  await mutateCreditFunnelBuilderSettings(ownerId, (existing) => ({
    next: {
      ...existing,
      [STRIPE_WEBHOOK_SIGNING_SECRET_KEY]: envelope,
    },
    value: null,
  }));
}

export async function clearStripeWebhookSigningSecretForOwner(ownerId: string): Promise<void> {
  await mutateCreditFunnelBuilderSettings(ownerId, (existing) => {
    const next = { ...existing };
    delete next[STRIPE_WEBHOOK_SIGNING_SECRET_KEY];
    return { next, value: null };
  }).catch(() => null);
}
