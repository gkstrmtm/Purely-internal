import crypto from "crypto";

import { prisma } from "@/lib/db";
import { hasPublicTable } from "@/lib/dbSchema";
import { dbHasPublicColumn } from "@/lib/dbSchemaCompat";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { getAppBaseUrl } from "@/lib/portalNotifications";

function sha256Hex(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function emailVerificationTtlMs(): number {
  const raw = String(process.env.PORTAL_EMAIL_VERIFICATION_TTL_MINUTES ?? "").trim();
  const mins = raw ? Number(raw) : 20;
  if (!Number.isFinite(mins) || mins <= 0) return 1000 * 60 * 20;
  return Math.max(1000 * 60, Math.min(1000 * 60 * 60 * 24 * 7, Math.trunc(mins) * 1000 * 60));
}

let emailVerificationSupportPromise:
  | Promise<{ tokensTable: boolean; hasEmailVerifiedAt: boolean; hasEmailSentAt: boolean }>
  | null = null;

async function getEmailVerificationSupport(): Promise<{
  tokensTable: boolean;
  hasEmailVerifiedAt: boolean;
  hasEmailSentAt: boolean;
}> {
  if (!emailVerificationSupportPromise) {
    emailVerificationSupportPromise = (async () => {
      const [tokensTable, hasEmailVerifiedAt, hasEmailSentAt] = await Promise.all([
        hasPublicTable("PortalEmailVerificationToken").catch(() => false),
        dbHasPublicColumn({ tableNames: ["User", "user"], columnName: "emailVerifiedAt" }).catch(() => false),
        dbHasPublicColumn({ tableNames: ["User", "user"], columnName: "emailVerificationEmailSentAt" }).catch(() => false),
      ]);
      return { tokensTable, hasEmailVerifiedAt, hasEmailSentAt };
    })();
  }

  return emailVerificationSupportPromise;
}

export async function createEmailVerificationToken(userId: string): Promise<{ token: string; tokenHash: string; expiresAt: Date }> {
  const support = await getEmailVerificationSupport();
  if (!support.tokensTable) throw new Error("Email verification token table is missing");

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + emailVerificationTtlMs());

  await prisma.portalEmailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
    select: { id: true },
  });

  return { token, tokenHash, expiresAt };
}

export async function findOrCreateLatestToken(userId: string): Promise<{ token: string; expiresAt: Date } | null> {
  const support = await getEmailVerificationSupport();
  if (!support.tokensTable) return null;

  const now = new Date();

  // Ensure only one active link works at a time: when we send a new email,
  // mark any existing unused/unexpired tokens as used.
  try {
    await prisma.portalEmailVerificationToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    const created = await createEmailVerificationToken(userId);
    return { token: created.token, expiresAt: created.expiresAt };
  } catch {
    return null;
  }
}

export async function sendVerifyEmail(opts: { userId: string; toEmail: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  const support = await getEmailVerificationSupport();

  const tokenRes = await findOrCreateLatestToken(opts.userId);
  if (!tokenRes) return { ok: false, reason: "Unable to create token" };

  const ttlMinutes = Math.max(1, Math.round(emailVerificationTtlMs() / (1000 * 60)));

  const base = getAppBaseUrl();
  const url = new URL("/portal/verify-email", base);
  url.searchParams.set("token", tokenRes.token);

  const subject = "Verify your email";
  const text = [
    "Welcome to Purely Automation.",
    "",
    "Please verify your email address to finish setting up your account:",
    String(url.toString()),
    "",
    `This link expires in about ${ttlMinutes} minute${ttlMinutes === 1 ? "" : "s"}, so please use it right away.`,
    "",
    "If you didn’t create this account, you can ignore this email.",
  ].join("\n");

  const res = await trySendTransactionalEmail({
    to: opts.toEmail,
    subject,
    text,
    html: null,
    fromName: "Purely Automation",
  });

  if (!res.ok) return { ok: false, reason: res.reason };

  if (support.hasEmailSentAt) {
    await prisma.user
      .update({
        where: { id: opts.userId },
        data: { emailVerificationEmailSentAt: new Date() },
        select: { id: true },
      })
      .catch(() => null);
  }

  return { ok: true };
}

export async function verifyEmailToken(
  token: string,
): Promise<{ ok: true; userId: string; alreadyVerified?: boolean } | { ok: false; reason: string }> {
  const support = await getEmailVerificationSupport();
  if (!support.tokensTable) return { ok: false, reason: "Email verification is not available" };

  const raw = String(token || "").trim();
  if (!raw || raw.length < 20 || raw.length > 200) return { ok: false, reason: "Invalid token" };

  const tokenHash = sha256Hex(raw);
  const now = new Date();

  const row = await prisma.portalEmailVerificationToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });

  if (!row) return { ok: false, reason: "Invalid or expired token" };
  if (row.usedAt) return { ok: true, userId: row.userId, alreadyVerified: true };
  if (row.expiresAt <= now) return { ok: false, reason: "This link expired" };

  await prisma
    .$transaction(async (tx) => {
      await tx.portalEmailVerificationToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
        select: { id: true },
      });

      if (support.hasEmailVerifiedAt) {
        await tx.user.update({
          where: { id: row.userId },
          data: { emailVerifiedAt: new Date() },
          select: { id: true },
        });
      }
    })
    .catch(() => null);

  return { ok: true, userId: row.userId };
}
