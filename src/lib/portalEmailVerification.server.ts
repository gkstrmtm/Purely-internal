import crypto from "crypto";

import { prisma } from "@/lib/db";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { getAppBaseUrl } from "@/lib/portalNotifications";

function sha256Hex(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function createEmailVerificationToken(userId: string): Promise<{ token: string; tokenHash: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

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
  const now = new Date();
  const existing = await prisma.portalEmailVerificationToken.findFirst({
    where: { userId, usedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { tokenHash: true, expiresAt: true },
  });

  // We can’t recover the raw token from a hash; generate a new one if any exist.
  // This keeps the implementation simple and avoids sending an invalid link.
  if (existing) {
    // Generate a fresh token for each send.
  }

  const created = await createEmailVerificationToken(userId);
  return { token: created.token, expiresAt: created.expiresAt };
}

export async function sendVerifyEmail(opts: { userId: string; toEmail: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  const tokenRes = await findOrCreateLatestToken(opts.userId);
  if (!tokenRes) return { ok: false, reason: "Unable to create token" };

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

  await prisma.user.update({
    where: { id: opts.userId },
    data: { emailVerificationEmailSentAt: new Date() },
    select: { id: true },
  });

  return { ok: true };
}

export async function verifyEmailToken(token: string): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const raw = String(token || "").trim();
  if (!raw || raw.length < 20 || raw.length > 200) return { ok: false, reason: "Invalid token" };

  const tokenHash = sha256Hex(raw);
  const now = new Date();

  const row = await prisma.portalEmailVerificationToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });

  if (!row) return { ok: false, reason: "Invalid or expired token" };
  if (row.usedAt) return { ok: false, reason: "This link was already used" };
  if (row.expiresAt <= now) return { ok: false, reason: "This link expired" };

  await prisma.$transaction(async (tx) => {
    await tx.portalEmailVerificationToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
      select: { id: true },
    });

    await tx.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() },
      select: { id: true },
    });
  });

  return { ok: true, userId: row.userId };
}
