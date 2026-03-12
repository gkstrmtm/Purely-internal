import crypto from "crypto";

import { prisma } from "@/lib/db";
import { getRequestIp } from "@/lib/requestIp";

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
  const row = await prisma.user.findUnique({
    where: { id: opts.ownerId },
    select: { portalReferralCode: true },
  });

  const existing = safeCode(row?.portalReferralCode ?? "");
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
      throw e;
    }
  }

  throw new Error("Unable to generate referral code");
}

export async function rotatePortalReferralCode(opts: { ownerId: string; req?: Request | null }) {
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
      throw e;
    }
  }

  throw new Error("Unable to rotate referral code");
}

export async function getPortalReferralStats(inviterId: string): Promise<{
  total: number;
  verified: number;
  awarded: number;
}> {
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
