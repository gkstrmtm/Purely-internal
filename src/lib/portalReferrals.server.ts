import crypto from "crypto";

import { prisma } from "@/lib/db";
import { hasPublicColumn, hasPublicTable } from "@/lib/dbSchema";
import { getRequestIp } from "@/lib/requestIp";

const SERVICE_SLUG = "portal_referrals";

type ReferralSetupConfig = {
  version: 1;
  code?: string;
  createdAtIso?: string;
  createdIp?: string | null;
};

function parseReferralSetupConfig(value: unknown): ReferralSetupConfig {
  const rec = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const code = safeCode(typeof rec?.code === "string" ? rec.code : "");
  const createdAtIso = typeof rec?.createdAtIso === "string" ? rec.createdAtIso : undefined;
  const createdIp = typeof rec?.createdIp === "string" || rec?.createdIp === null ? (rec?.createdIp as any) : undefined;
  return { version: 1, code: code || undefined, createdAtIso, createdIp };
}

let canUseUserReferralColumnsCache: boolean | null = null;
async function canUseUserReferralColumns(): Promise<boolean> {
  if (canUseUserReferralColumnsCache !== null) return canUseUserReferralColumnsCache;
  const ok = await hasPublicColumn("User", "portalReferralCode").catch(() => false);
  canUseUserReferralColumnsCache = ok;
  return ok;
}

let canUsePortalReferralTableCache: boolean | null = null;
async function canUsePortalReferralTable(): Promise<boolean> {
  if (canUsePortalReferralTableCache !== null) return canUsePortalReferralTableCache;
  const ok = await hasPublicTable("PortalReferral").catch(() => false);
  canUsePortalReferralTableCache = ok;
  return ok;
}

async function getOrCreateFallbackReferralCode(opts: { ownerId: string; req?: Request | null }) {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug: SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const parsed = parseReferralSetupConfig(row?.dataJson);
  const existing = safeCode(parsed.code ?? "");
  if (existing) return { code: existing, created: false };

  const ip = opts.req ? getRequestIp(opts.req) : null;
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const normalized = safeCode(code);
    if (!normalized) continue;

    const next: ReferralSetupConfig = {
      version: 1,
      code: normalized,
      createdAtIso: new Date().toISOString(),
      createdIp: ip,
    };

    const updated = await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId: opts.ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: next },
      update: { status: "COMPLETE", dataJson: next },
      select: { dataJson: true },
    });

    const final = safeCode(parseReferralSetupConfig(updated.dataJson).code ?? "");
    if (final) return { code: final, created: true };
  }

  throw new Error("Unable to generate referral code");
}

async function rotateFallbackReferralCode(opts: { ownerId: string; req?: Request | null }) {
  const ip = opts.req ? getRequestIp(opts.req) : null;

  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const normalized = safeCode(code);
    if (!normalized) continue;

    const next: ReferralSetupConfig = {
      version: 1,
      code: normalized,
      createdAtIso: new Date().toISOString(),
      createdIp: ip,
    };

    const updated = await prisma.portalServiceSetup.upsert({
      where: { ownerId_serviceSlug: { ownerId: opts.ownerId, serviceSlug: SERVICE_SLUG } },
      create: { ownerId: opts.ownerId, serviceSlug: SERVICE_SLUG, status: "COMPLETE", dataJson: next },
      update: { status: "COMPLETE", dataJson: next },
      select: { dataJson: true },
    });

    const final = safeCode(parseReferralSetupConfig(updated.dataJson).code ?? "");
    if (final) return { code: final };
  }

  throw new Error("Unable to rotate referral code");
}

function safeCode(raw: string): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  if (s.length > 32) return "";
  if (!/^[a-z0-9]+$/.test(s)) return "";
  return s;
}

function newCode(): string {
  // 12 chars base32-ish.
  return crypto.randomBytes(10).toString("hex").slice(0, 12);
}

export async function getOrCreatePortalReferralCode(opts: { ownerId: string; req?: Request | null }) {
  if (!(await canUseUserReferralColumns())) {
    return getOrCreateFallbackReferralCode(opts);
  }

  const row = await prisma.user
    .findUnique({
      where: { id: opts.ownerId },
      select: { portalReferralCode: true },
    })
    .catch(() => null);

  const existing = safeCode((row as any)?.portalReferralCode ?? "");
  if (existing) return { code: existing, created: false };

  const ip = opts.req ? getRequestIp(opts.req) : null;

  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try {
      const updated = await prisma.user.update({
        where: { id: opts.ownerId },
        data: {
          portalReferralCode: code,
          portalReferralCodeCreatedAt: new Date(),
          portalReferralCodeCreatedIp: ip,
        },
        select: { portalReferralCode: true },
      });
      const final = safeCode(updated.portalReferralCode ?? "");
      if (final) return { code: final, created: true };
    } catch (e) {
      const prismaCode = typeof (e as any)?.code === "string" ? String((e as any).code) : null;
      if (prismaCode === "P2002") continue;
      // Drift fallback (e.g. missing columns) or transient DB errors.
      break;
    }
  }

  return getOrCreateFallbackReferralCode(opts);
}

export async function rotatePortalReferralCode(opts: { ownerId: string; req?: Request | null }) {
  if (!(await canUseUserReferralColumns())) {
    return rotateFallbackReferralCode(opts);
  }

  const ip = opts.req ? getRequestIp(opts.req) : null;

  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try {
      const updated = await prisma.user.update({
        where: { id: opts.ownerId },
        data: {
          portalReferralCode: code,
          portalReferralCodeCreatedAt: new Date(),
          portalReferralCodeCreatedIp: ip,
        },
        select: { portalReferralCode: true },
      });
      const final = safeCode(updated.portalReferralCode ?? "");
      if (final) return { code: final };
    } catch (e) {
      const prismaCode = typeof (e as any)?.code === "string" ? String((e as any).code) : null;
      if (prismaCode === "P2002") continue;
      break;
    }
  }

  return rotateFallbackReferralCode(opts);
}

export async function getPortalReferralStats(inviterId: string): Promise<{
  total: number;
  verified: number;
  awarded: number;
}> {
  if (!(await canUsePortalReferralTable())) {
    return { total: 0, verified: 0, awarded: 0 };
  }

  const [total, verified, awarded] = await Promise.all([
    prisma.portalReferral.count({ where: { inviterId } }),
    prisma.portalReferral.count({ where: { inviterId, invitedVerifiedAt: { not: null } } }),
    prisma.portalReferral.count({ where: { inviterId, creditsAwardedAt: { not: null } } }),
  ]);

  return { total, verified, awarded };
}

export function readReferralCodeFromUnknown(value: unknown): string | null {
  const code = safeCode(typeof value === "string" ? value : "");
  return code ? code : null;
}
