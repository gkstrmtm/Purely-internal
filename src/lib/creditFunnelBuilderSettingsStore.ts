import crypto from "crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export type CreditFunnelBuilderSettingsJson = Record<string, unknown>;
export type CreditFunnelBuilderSettingsTx = Prisma.TransactionClient;

type CreditFunnelBuilderSettingsReader = Pick<Prisma.TransactionClient, "creditFunnelBuilderSettings">;
type CreditFunnelBuilderSettingsMutator = Pick<Prisma.TransactionClient, "$executeRaw" | "creditFunnelBuilderSettings">;

function coerceSettingsJson(value: unknown): CreditFunnelBuilderSettingsJson {
  return value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...(value as Record<string, unknown>) } as CreditFunnelBuilderSettingsJson)
    : {};
}

function settingsLockKey(ownerId: string): bigint {
  const hash = crypto.createHash("sha256").update(`credit-funnel-builder-settings:${ownerId}`).digest();
  hash[0] &= 0x7f;
  return BigInt(`0x${hash.subarray(0, 8).toString("hex")}`);
}

async function readCreditFunnelBuilderSettings(
  client: CreditFunnelBuilderSettingsReader,
  ownerId: string,
): Promise<CreditFunnelBuilderSettingsJson> {
  const row = await client.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId }, select: { dataJson: true } })
    .catch(() => null);
  return coerceSettingsJson(row?.dataJson);
}

export async function getCreditFunnelBuilderSettings(ownerId: string): Promise<CreditFunnelBuilderSettingsJson> {
  return readCreditFunnelBuilderSettings(prisma as unknown as CreditFunnelBuilderSettingsReader, ownerId);
}

export async function getCreditFunnelBuilderSettingsTx(
  tx: CreditFunnelBuilderSettingsTx,
  ownerId: string,
): Promise<CreditFunnelBuilderSettingsJson> {
  return readCreditFunnelBuilderSettings(tx, ownerId);
}

export async function mutateCreditFunnelBuilderSettingsTx<T>(
  tx: CreditFunnelBuilderSettingsMutator,
  ownerId: string,
  mutator: (current: CreditFunnelBuilderSettingsJson) => { next: CreditFunnelBuilderSettingsJson; value: T },
): Promise<{ dataJson: CreditFunnelBuilderSettingsJson; value: T }> {
  const lockId = settingsLockKey(ownerId);

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;

  const existing = await tx.creditFunnelBuilderSettings
    .findUnique({ where: { ownerId }, select: { dataJson: true } })
    .catch(() => null);

  const current = coerceSettingsJson(existing?.dataJson);
  const { next, value } = mutator(current);
  const nextJson = coerceSettingsJson(next);

  await tx.creditFunnelBuilderSettings.upsert({
    where: { ownerId },
    update: { dataJson: nextJson as any },
    create: { ownerId, dataJson: nextJson as any },
    select: { ownerId: true },
  });

  return { dataJson: nextJson, value };
}

export async function mutateCreditFunnelBuilderSettings<T>(
  ownerId: string,
  mutator: (current: CreditFunnelBuilderSettingsJson) => { next: CreditFunnelBuilderSettingsJson; value: T },
): Promise<{ dataJson: CreditFunnelBuilderSettingsJson; value: T }> {
  return prisma.$transaction((tx) => mutateCreditFunnelBuilderSettingsTx(tx, ownerId, mutator));
}