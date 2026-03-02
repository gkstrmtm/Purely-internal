import { prisma } from "@/lib/db";
import { decryptStringV1, encryptStringV1, isPortalEncryptionConfigured } from "@/lib/portalEncryption.server";
import { stripeGetWithKey } from "@/lib/stripeFetchWithKey.server";

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
