import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { ExternalBookingProviderKey } from "@/lib/externalBookingLink";
import {
  FIRST_EXTERNAL_BOOKING_PROVIDER_PATH,
  getExternalBookingProviderCapability,
  type ExternalBookingProviderCapability,
} from "@/lib/externalBookingProviderCapabilities";
import { decryptStringV1, encryptStringV1, isPortalEncryptionConfigured } from "@/lib/portalEncryption.server";
import { toPurelyHostedUrl } from "@/lib/publicHostedOrigin";

const SERVICE_SLUG = "booking-external-provider-confirmation";

type SupportedExternalBookingProviderKey = "square";

type StoredEncryptedEnvelope = {
  version: 1;
  ciphertextB64: string;
  ivB64: string;
  authTagB64: string;
};

type StoredProviderConnection = {
  providerKey: SupportedExternalBookingProviderKey;
  connectionMode: "manual_webhook";
  webhookToken: string;
  signingKeyLast4: string | null;
  signingKeyEnvelope: StoredEncryptedEnvelope | null;
  connectedAtIso: string | null;
  updatedAtIso: string | null;
};

type StoredProviderConnectionStore = {
  version: 1;
  providers: Partial<Record<SupportedExternalBookingProviderKey, StoredProviderConnection>>;
};

export type ExternalBookingProviderConnectionReadiness = {
  providerKey: ExternalBookingProviderKey;
  providerLabel: string;
  capability: ExternalBookingProviderCapability;
  implemented: boolean;
  implementedPath: string | null;
  recommendedFirstPath: boolean;
  selectionReason: string | null;
  connectionMode: "manual_webhook" | null;
  webhookUrl: string | null;
  webhookPath: string | null;
  signingKeyConfigured: boolean;
  encryptionConfigured: boolean;
  connected: boolean;
  connectedAtIso: string | null;
  expectedEnvVar: string | null;
  blocker: string | null;
  nextAction: string;
};

function newWebhookToken() {
  return crypto.randomBytes(18).toString("hex");
}

function normalizeString(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseEnvelope(raw: unknown): StoredEncryptedEnvelope | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    value.version !== 1 ||
    typeof value.ciphertextB64 !== "string" ||
    typeof value.ivB64 !== "string" ||
    typeof value.authTagB64 !== "string"
  ) {
    return null;
  }
  return {
    version: 1,
    ciphertextB64: value.ciphertextB64,
    ivB64: value.ivB64,
    authTagB64: value.authTagB64,
  };
}

function parseStoredConnection(raw: unknown, providerKey: SupportedExternalBookingProviderKey): StoredProviderConnection {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const webhookToken = normalizeString(rec?.webhookToken, 120) || newWebhookToken();
  return {
    providerKey,
    connectionMode: "manual_webhook",
    webhookToken,
    signingKeyLast4: normalizeString(rec?.signingKeyLast4, 12) || null,
    signingKeyEnvelope: parseEnvelope(rec?.signingKeyEnvelope),
    connectedAtIso: normalizeString(rec?.connectedAtIso, 80) || null,
    updatedAtIso: normalizeString(rec?.updatedAtIso, 80) || null,
  };
}

function parseStore(raw: unknown): StoredProviderConnectionStore {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const providersRec = rec?.providers && typeof rec.providers === "object" && !Array.isArray(rec.providers)
    ? (rec.providers as Record<string, unknown>)
    : {};
  return {
    version: 1,
    providers: {
      square: providersRec.square ? parseStoredConnection(providersRec.square, "square") : undefined,
    },
  };
}

async function readSetupRow(ownerId: string) {
  return prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });
}

async function writeStore(ownerId: string, store: StoredProviderConnectionStore) {
  await prisma.portalServiceSetup.upsert({
    where: { ownerId_serviceSlug: { ownerId, serviceSlug: SERVICE_SLUG } },
    create: {
      ownerId,
      serviceSlug: SERVICE_SLUG,
      status: "COMPLETE",
      dataJson: store as Prisma.InputJsonValue,
    },
    update: {
      status: "COMPLETE",
      dataJson: store as Prisma.InputJsonValue,
    },
  });
}

function webhookPathFor(providerKey: SupportedExternalBookingProviderKey, webhookToken: string) {
  return `/api/public/booking/providers/${providerKey}/${encodeURIComponent(webhookToken)}`;
}

function implementedProvider(providerKey: ExternalBookingProviderKey): providerKey is SupportedExternalBookingProviderKey {
  return providerKey === "square";
}

async function readProviderConnection(ownerId: string, providerKey: SupportedExternalBookingProviderKey): Promise<StoredProviderConnection> {
  const existing = await readSetupRow(ownerId).catch(() => null);
  const store = parseStore(existing?.dataJson);
  const current = store.providers[providerKey];
  if (current?.webhookToken) return current;

  const next = parseStoredConnection(null, providerKey);
  store.providers[providerKey] = next;
  await writeStore(ownerId, store).catch(() => null);
  return next;
}

export async function getExternalBookingProviderConnectionReadiness(
  ownerId: string,
  providerKey: ExternalBookingProviderKey,
): Promise<ExternalBookingProviderConnectionReadiness> {
  const capability = getExternalBookingProviderCapability(providerKey);
  const implemented = implementedProvider(providerKey);
  const encryptionConfigured = isPortalEncryptionConfigured();

  if (!implemented) {
    return {
      providerKey,
      providerLabel: capability.providerLabel,
      capability,
      implemented: false,
      implementedPath: null,
      recommendedFirstPath: capability.recommendedFirstPath,
      selectionReason: capability.selectionReason ?? null,
      connectionMode: null,
      webhookUrl: null,
      webhookPath: null,
      signingKeyConfigured: false,
      encryptionConfigured,
      connected: false,
      connectedAtIso: null,
      expectedEnvVar: encryptionConfigured ? null : "PORTAL_ENCRYPTION_MASTER_KEY",
      blocker: capability.supportsWebhook === "supported" || capability.supportsWebhook === "manual"
        ? `${capability.providerLabel} is mapped, but Purely only implements the first provider path for ${FIRST_EXTERNAL_BOOKING_PROVIDER_PATH.label} right now.`
        : `${capability.providerLabel} does not have a shipped provider-confirmed path in this repo yet.`,
      nextAction: capability.supportsRedirectReturn === "supported" || capability.supportsRedirectReturn === "possible"
        ? "Use redirect confirmation for now"
        : "Follow up unconfirmed handoffs",
    };
  }

  const stored = await readProviderConnection(ownerId, providerKey);
  const webhookPath = webhookPathFor(providerKey, stored.webhookToken);
  const webhookUrl = toPurelyHostedUrl(webhookPath);
  const signingKeyConfigured = Boolean(stored.signingKeyEnvelope && stored.signingKeyLast4);
  const connected = encryptionConfigured && signingKeyConfigured;
  const blocker = !encryptionConfigured
    ? "Server is missing PORTAL_ENCRYPTION_MASTER_KEY, so Purely cannot store the Square signing key safely yet."
    : !signingKeyConfigured
      ? "Paste the Square webhook signature key after creating the subscription in the Square Developer Console."
      : null;

  return {
    providerKey,
    providerLabel: capability.providerLabel,
    capability,
    implemented: true,
    implementedPath: webhookPath,
    recommendedFirstPath: capability.recommendedFirstPath,
    selectionReason: capability.selectionReason ?? null,
    connectionMode: "manual_webhook",
    webhookUrl,
    webhookPath,
    signingKeyConfigured,
    encryptionConfigured,
    connected,
    connectedAtIso: stored.connectedAtIso,
    expectedEnvVar: encryptionConfigured ? null : "PORTAL_ENCRYPTION_MASTER_KEY",
    blocker,
    nextAction: connected ? "Send a Square test event" : !encryptionConfigured ? "Enable secure secret storage" : "Connect provider confirmation",
  };
}

export async function updateExternalBookingProviderConnection(
  ownerId: string,
  providerKey: ExternalBookingProviderKey,
  input: { signingKey?: string | null; clearSigningKey?: boolean; regenerateWebhookToken?: boolean },
): Promise<ExternalBookingProviderConnectionReadiness> {
  if (!implementedProvider(providerKey)) {
    throw new Error("Unsupported external booking provider connection");
  }

  const existing = await readSetupRow(ownerId).catch(() => null);
  const store = parseStore(existing?.dataJson);
  const current = store.providers[providerKey] ?? parseStoredConnection(null, providerKey);
  const next: StoredProviderConnection = {
    ...current,
    webhookToken: input.regenerateWebhookToken ? newWebhookToken() : current.webhookToken || newWebhookToken(),
    updatedAtIso: new Date().toISOString(),
  };

  if (input.clearSigningKey) {
    next.signingKeyEnvelope = null;
    next.signingKeyLast4 = null;
    next.connectedAtIso = null;
  }

  const signingKey = normalizeString(input.signingKey, 240);
  if (signingKey) {
    if (!isPortalEncryptionConfigured()) {
      throw new Error("Missing PORTAL_ENCRYPTION_MASTER_KEY; cannot store provider signing keys safely.");
    }
    const encrypted = encryptStringV1(signingKey);
    next.signingKeyEnvelope = encrypted;
    next.signingKeyLast4 = signingKey.slice(-4);
    next.connectedAtIso = new Date().toISOString();
  }

  store.providers[providerKey] = next;
  await writeStore(ownerId, store);
  return getExternalBookingProviderConnectionReadiness(ownerId, providerKey);
}

export async function readExternalBookingProviderSigningKey(
  ownerId: string,
  providerKey: ExternalBookingProviderKey,
): Promise<string | null> {
  if (!implementedProvider(providerKey) || !isPortalEncryptionConfigured()) return null;
  const connection = await readProviderConnection(ownerId, providerKey).catch(() => null);
  if (!connection?.signingKeyEnvelope) return null;
  try {
    return decryptStringV1(connection.signingKeyEnvelope);
  } catch {
    return null;
  }
}

export async function findOwnerByExternalBookingProviderWebhookToken(
  providerKey: ExternalBookingProviderKey,
  webhookTokenRaw: string,
): Promise<{ ownerId: string; connection: ExternalBookingProviderConnectionReadiness } | null> {
  if (!implementedProvider(providerKey)) return null;
  const webhookToken = normalizeString(webhookTokenRaw, 120);
  if (!webhookToken) return null;

  const rows = await prisma.portalServiceSetup.findMany({
    where: { serviceSlug: SERVICE_SLUG },
    select: { ownerId: true, dataJson: true },
    take: 500,
  }).catch(() => []);

  for (const row of rows) {
    const store = parseStore(row.dataJson);
    const current = store.providers[providerKey];
    if (current?.webhookToken === webhookToken) {
      const connection = await getExternalBookingProviderConnectionReadiness(String(row.ownerId), providerKey).catch(() => null);
      if (!connection) return null;
      return { ownerId: String(row.ownerId), connection };
    }
  }

  return null;
}