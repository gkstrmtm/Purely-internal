import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import { decryptStringV1, encryptStringV1, isPortalEncryptionConfigured } from "@/lib/portalEncryption.server";
import type { PortalServiceCapability } from "@/lib/portalPermissions";
import type { PortalServiceKey } from "@/lib/portalPermissions.shared";
import {
  normalizePortalApiKeyPermissions,
  type PortalApiKeyKind,
  type PortalApiKeyPermission,
  type PortalApiKeySummary,
} from "@/lib/portalApiKeys.shared";
import { normalizePortalVariant, PORTAL_VARIANT_HEADER, type PortalVariant } from "@/lib/portalVariant";

type PortalApiKeyAuthContext = {
  apiKeyId: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string | null;
  keyKind: PortalApiKeyKind;
  permissions: PortalApiKeyPermission[];
  creditLimit: number | null;
  creditsUsed: number;
  portalVariant: PortalVariant;
};

type PortalApiKeyLookupResult =
  | { present: false }
  | { present: true; ok: false; status: 401 | 403; error: string }
  | { present: true; ok: true; context: PortalApiKeyAuthContext };

const portalApiKeyContextStore = new AsyncLocalStorage<PortalApiKeyAuthContext | null>();

const SERVICE_PERMISSION_MAP: Partial<Record<PortalServiceKey, PortalApiKeyPermission>> = {
  booking: "booking",
  automations: "automations",
  leadScraping: "leadScraping",
  media: "media",
  tasks: "tasks",
  nurtureCampaigns: "nurtureCampaigns",
  reviews: "reviews",
  blogs: "blogs",
  newsletter: "newsletter",
  aiOutboundCalls: "aiOutboundCalls",
  aiReceptionist: "aiReceptionist",
  people: "people",
  reporting: "reporting",
  inbox: "inbox",
  outbox: "inbox",
  twilio: "twilio",
  webhooks: "webhooks",
};

function hashPortalApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function maskPortalApiKey(raw: string): string {
  const key = String(raw || "").trim();
  if (!key) return "";
  if (key.length <= 16) return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  return `${key.slice(0, 12)}••••••••${key.slice(-6)}`;
}

function generatePortalApiKey(kind: PortalApiKeyKind): string {
  const scope = kind === "FULL_ACCESS" ? "full" : "scoped";
  const publicPart = crypto.randomBytes(4).toString("hex");
  const secretPart = crypto.randomBytes(24).toString("base64url");
  return `pa_live_${scope}_${publicPart}_${secretPart}`;
}

function readInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const next = Math.max(0, Math.floor(parsed));
  return next;
}

function selectVariantFromHeader(raw: string | null | undefined, fallback: PortalVariant = "portal"): PortalVariant {
  return normalizePortalVariant(raw) ?? fallback;
}

async function requestHeaders(req?: Request): Promise<Headers> {
  if (req?.headers) return req.headers;
  return await headers();
}

async function readRawPortalApiKey(req?: Request): Promise<string | null> {
  const h = await requestHeaders(req);
  const direct = h.get("x-api-key")?.trim();
  if (direct) return direct;

  const authHeader = h.get("authorization") || h.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() || "";
  if (!token.startsWith("pa_live_")) return null;
  return token;
}

function serializePortalApiKey(row: {
  id: string;
  keyKind: PortalApiKeyKind;
  name: string;
  maskedKey: string;
  permissionsJson: unknown;
  creditLimit: number | null;
  creditsUsed: number;
  createdAt: Date;
  lastUsedAt: Date | null;
}): PortalApiKeySummary {
  return {
    id: row.id,
    kind: row.keyKind,
    name: row.name,
    maskedValue: row.maskedKey,
    permissions: normalizePortalApiKeyPermissions(row.permissionsJson),
    creditLimit: row.creditLimit,
    creditsUsed: Math.max(0, Math.floor(row.creditsUsed || 0)),
    createdAtIso: row.createdAt.toISOString(),
    lastUsedAtIso: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

async function createPortalApiKeyRecord(opts: {
  ownerId: string;
  kind: PortalApiKeyKind;
  name: string;
  permissions?: PortalApiKeyPermission[];
  creditLimit?: number | null;
}) {
  if (!isPortalEncryptionConfigured()) {
    throw new Error("API key storage is temporarily unavailable. Please contact support.");
  }

  const rawValue = generatePortalApiKey(opts.kind);
  const encrypted = encryptStringV1(rawValue);
  const created = await (prisma as any).portalApiKey.create({
    data: {
      ownerId: opts.ownerId,
      name: opts.name.trim(),
      keyKind: opts.kind,
      keyHash: hashPortalApiKey(rawValue),
      secretCiphertext: encrypted.ciphertextB64,
      secretIv: encrypted.ivB64,
      secretAuthTag: encrypted.authTagB64,
      maskedKey: maskPortalApiKey(rawValue),
      permissionsJson: opts.kind === "FULL_ACCESS" ? [] : normalizePortalApiKeyPermissions(opts.permissions ?? []),
      creditLimit: opts.kind === "FULL_ACCESS" ? null : readInt(opts.creditLimit),
    },
    select: {
      id: true,
      keyKind: true,
      name: true,
      maskedKey: true,
      permissionsJson: true,
      creditLimit: true,
      creditsUsed: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });

  return { key: serializePortalApiKey(created), rawValue };
}

export async function ensureFullAccessPortalApiKey(ownerId: string) {
  const existing = await (prisma as any).portalApiKey.findFirst({
    where: { ownerId, keyKind: "FULL_ACCESS", status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      keyKind: true,
      name: true,
      maskedKey: true,
      permissionsJson: true,
      creditLimit: true,
      creditsUsed: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });
  if (existing) return serializePortalApiKey(existing);
  if (!isPortalEncryptionConfigured()) return null;
  const created = await createPortalApiKeyRecord({ ownerId, kind: "FULL_ACCESS", name: "Full access" });
  return created.key;
}

export async function listPortalApiKeys(ownerId: string) {
  const fullAccessKey = await ensureFullAccessPortalApiKey(ownerId);
  const rows = await (prisma as any).portalApiKey.findMany({
    where: { ownerId, status: "ACTIVE" },
    orderBy: [{ keyKind: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      keyKind: true,
      name: true,
      maskedKey: true,
      permissionsJson: true,
      creditLimit: true,
      creditsUsed: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });

  const items: PortalApiKeySummary[] = rows.map(serializePortalApiKey);
  const full = items.find((item: PortalApiKeySummary) => item.kind === "FULL_ACCESS") ?? fullAccessKey;
  const scoped = items.filter((item: PortalApiKeySummary) => item.kind === "SCOPED");
  const totalCreditsUsed = items.reduce(
    (sum: number, item: PortalApiKeySummary) => sum + Math.max(0, item.creditsUsed || 0),
    0,
  );

  return {
    encryptionConfigured: isPortalEncryptionConfigured(),
    fullAccessKey: full ?? null,
    scopedKeys: scoped,
    totalKeyCount: items.length,
    totalCreditsUsed,
  };
}

export async function createScopedPortalApiKey(opts: {
  ownerId: string;
  name: string;
  permissions: PortalApiKeyPermission[];
  creditLimit: number | null;
}) {
  const name = String(opts.name || "").trim();
  if (name.length < 2) throw new Error("API key name must be at least 2 characters.");
  const permissions = normalizePortalApiKeyPermissions(opts.permissions);
  if (!permissions.length) throw new Error("Choose at least one permission.");
  const created = await createPortalApiKeyRecord({
    ownerId: opts.ownerId,
    kind: "SCOPED",
    name,
    permissions,
    creditLimit: opts.creditLimit,
  });
  return created;
}

export async function updateScopedPortalApiKey(opts: {
  ownerId: string;
  keyId: string;
  name?: string;
  permissions?: PortalApiKeyPermission[];
  creditLimit?: number | null;
}) {
  const existing = await (prisma as any).portalApiKey.findFirst({
    where: { id: opts.keyId, ownerId: opts.ownerId, status: "ACTIVE", keyKind: "SCOPED" },
    select: { id: true },
  });
  if (!existing) throw new Error("API key not found.");

  const data: Record<string, unknown> = {};
  if (typeof opts.name === "string") {
    const name = opts.name.trim();
    if (name.length < 2) throw new Error("API key name must be at least 2 characters.");
    data.name = name;
  }
  if (opts.permissions) {
    const permissions = normalizePortalApiKeyPermissions(opts.permissions);
    if (!permissions.length) throw new Error("Choose at least one permission.");
    data.permissionsJson = permissions;
  }
  if ("creditLimit" in opts) {
    data.creditLimit = readInt(opts.creditLimit);
  }

  const updated = await (prisma as any).portalApiKey.update({
    where: { id: opts.keyId },
    data,
    select: {
      id: true,
      keyKind: true,
      name: true,
      maskedKey: true,
      permissionsJson: true,
      creditLimit: true,
      creditsUsed: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });

  return serializePortalApiKey(updated);
}

export async function deletePortalApiKey(ownerId: string, keyId: string) {
  const existing = await (prisma as any).portalApiKey.findFirst({
    where: { id: keyId, ownerId, status: "ACTIVE", keyKind: "SCOPED" },
    select: { id: true },
  });
  if (!existing) throw new Error("API key not found.");
  await (prisma as any).portalApiKey.delete({ where: { id: keyId } });
}

export async function revealPortalApiKey(ownerId: string, keyId: string) {
  const row = await (prisma as any).portalApiKey.findFirst({
    where: { id: keyId, ownerId, status: "ACTIVE" },
    select: {
      id: true,
      secretCiphertext: true,
      secretIv: true,
      secretAuthTag: true,
    },
  });
  if (!row) throw new Error("API key not found.");
  const value = decryptStringV1({
    version: 1,
    ciphertextB64: row.secretCiphertext,
    ivB64: row.secretIv,
    authTagB64: row.secretAuthTag,
  });
  await (prisma as any).portalApiKey.update({ where: { id: row.id }, data: { revealedAt: new Date() } }).catch(() => null);
  return value;
}

export function enterPortalApiKeyRequestContext(context: PortalApiKeyAuthContext | null) {
  portalApiKeyContextStore.enterWith(context);
}

export function getPortalApiKeyRequestContext(): PortalApiKeyAuthContext | null {
  return portalApiKeyContextStore.getStore() ?? null;
}

async function lookupPortalApiKey(req?: Request): Promise<PortalApiKeyLookupResult> {
  const rawKey = await readRawPortalApiKey(req);
  if (!rawKey) return { present: false };

  const keyHash = hashPortalApiKey(rawKey);
  const h = await requestHeaders(req);
  const row = await (prisma as any).portalApiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      ownerId: true,
      keyKind: true,
      status: true,
      permissionsJson: true,
      creditLimit: true,
      creditsUsed: true,
      owner: { select: { email: true, name: true } },
    },
  });

  if (!row || row.status !== "ACTIVE") {
    return { present: true, ok: false, status: 401, error: "Invalid API key" };
  }

  const context: PortalApiKeyAuthContext = {
    apiKeyId: row.id,
    ownerId: row.ownerId,
    ownerEmail: String(row.owner?.email || ""),
    ownerName: row.owner?.name ?? null,
    keyKind: row.keyKind,
    permissions: normalizePortalApiKeyPermissions(row.permissionsJson),
    creditLimit: readInt(row.creditLimit),
    creditsUsed: Math.max(0, Math.floor(row.creditsUsed || 0)),
    portalVariant: selectVariantFromHeader(h.get(PORTAL_VARIANT_HEADER), "portal"),
  };

  return { present: true, ok: true, context };
}

export async function authenticatePortalApiKeyForPermission(opts: {
  req?: Request;
  permission: PortalApiKeyPermission;
  capability?: PortalServiceCapability;
}): Promise<PortalApiKeyLookupResult> {
  const lookup = await lookupPortalApiKey(opts.req);
  if (!lookup.present || !lookup.ok) return lookup;
  if (lookup.context.keyKind !== "FULL_ACCESS" && !lookup.context.permissions.includes(opts.permission)) {
    return { present: true, ok: false, status: 403, error: "API key does not have access to this feature" };
  }
  enterPortalApiKeyRequestContext(lookup.context);
  await (prisma as any).portalApiKey.update({ where: { id: lookup.context.apiKeyId }, data: { lastUsedAt: new Date() } }).catch(() => null);
  return lookup;
}

export async function authenticatePortalApiKeyForService(opts: {
  req?: Request;
  service: PortalServiceKey;
  capability?: PortalServiceCapability;
}): Promise<PortalApiKeyLookupResult> {
  const lookup = await lookupPortalApiKey(opts.req);
  if (!lookup.present || !lookup.ok) return lookup;
  if (!portalApiKeyAllowsService(lookup.context, opts.service, opts.capability ?? "view")) {
    return { present: true, ok: false, status: 403, error: "API key does not have access to this service" };
  }
  enterPortalApiKeyRequestContext(lookup.context);
  await (prisma as any).portalApiKey.update({ where: { id: lookup.context.apiKeyId }, data: { lastUsedAt: new Date() } }).catch(() => null);
  return lookup;
}

export async function authenticatePortalApiKeyForAnyService(opts: {
  req?: Request;
  services: PortalServiceKey[];
  capability?: PortalServiceCapability;
}): Promise<PortalApiKeyLookupResult> {
  const lookup = await lookupPortalApiKey(opts.req);
  if (!lookup.present || !lookup.ok) return lookup;
  if (!portalApiKeyAllowsAnyService(lookup.context, opts.services, opts.capability ?? "view")) {
    return { present: true, ok: false, status: 403, error: "API key does not have access to these services" };
  }
  enterPortalApiKeyRequestContext(lookup.context);
  await (prisma as any).portalApiKey.update({ where: { id: lookup.context.apiKeyId }, data: { lastUsedAt: new Date() } }).catch(() => null);
  return lookup;
}

export async function authenticatePortalApiKeyForFunnelBuilder(req?: Request): Promise<PortalApiKeyLookupResult> {
  return await authenticatePortalApiKeyForPermission({ req, permission: "funnelBuilder", capability: "view" });
}

export function portalApiKeyAllowsService(
  context: PortalApiKeyAuthContext,
  service: PortalServiceKey,
  capability: PortalServiceCapability = "view",
): boolean {
  void capability;
  if (context.keyKind === "FULL_ACCESS") return true;
  const requiredPermission = SERVICE_PERMISSION_MAP[service];
  if (!requiredPermission) return false;
  return context.permissions.includes(requiredPermission);
}

export function portalApiKeyAllowsAnyService(
  context: PortalApiKeyAuthContext,
  services: PortalServiceKey[],
  capability: PortalServiceCapability = "view",
): boolean {
  return services.some((service) => portalApiKeyAllowsService(context, service, capability));
}

export async function applyPortalApiKeyCreditUsageTx(
  tx: any,
  opts: { ownerId: string; amount: number; idempotencyKey?: string | null },
): Promise<{ ok: true; alreadyRecorded: boolean } | { ok: false; error: string }> {
  const context = getPortalApiKeyRequestContext();
  const amount = Math.max(0, Math.floor(opts.amount || 0));
  if (!context || amount <= 0) return { ok: true, alreadyRecorded: false };
  if (context.ownerId !== opts.ownerId) return { ok: false, error: "API key account mismatch" };

  const keyRow = await tx.portalApiKey.findUnique({
    where: { id: context.apiKeyId },
    select: { id: true, ownerId: true, status: true, creditLimit: true, creditsUsed: true },
  });
  if (!keyRow || keyRow.status !== "ACTIVE" || keyRow.ownerId !== opts.ownerId) {
    return { ok: false, error: "API key is no longer active" };
  }

  const ledgerKey = typeof opts.idempotencyKey === "string" ? opts.idempotencyKey.trim().slice(0, 160) : "";
  if (ledgerKey) {
    const existing = await tx.portalApiKeySpend.findUnique({
      where: { apiKeyId_idempotencyKey: { apiKeyId: keyRow.id, idempotencyKey: ledgerKey } },
      select: { id: true },
    });
    if (existing) return { ok: true, alreadyRecorded: true };
  }

  const creditLimit = readInt(keyRow.creditLimit);
  const creditsUsed = Math.max(0, Math.floor(keyRow.creditsUsed || 0));
  if (creditLimit !== null && creditsUsed + amount > creditLimit) {
    return { ok: false, error: "API key credit limit reached" };
  }

  await tx.portalApiKey.update({
    where: { id: keyRow.id },
    data: {
      creditsUsed: { increment: amount },
      lastUsedAt: new Date(),
    },
  });

  if (ledgerKey) {
    await tx.portalApiKeySpend.create({
      data: {
        apiKeyId: keyRow.id,
        ownerId: opts.ownerId,
        idempotencyKey: ledgerKey,
        credits: amount,
      },
    });
  }

  return { ok: true, alreadyRecorded: false };
}

export function sessionUserFromApiKeyContext(context: PortalApiKeyAuthContext) {
  return {
    id: context.ownerId,
    email: context.ownerEmail,
    role: "CLIENT" as const,
    name: context.ownerName ?? undefined,
    memberId: context.ownerId,
    portalVariant: context.portalVariant,
  };
}
