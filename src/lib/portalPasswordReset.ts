import crypto from "crypto";

import { prisma } from "@/lib/db";
import { normalizePhoneStrict } from "@/lib/phone";
import { hashPassword } from "@/lib/password";
import { trySendTransactionalEmail } from "@/lib/emailSender";
import { sendTwilioEnvSms } from "@/lib/twilioEnvSms";
import { ensurePortalPasswordResetSchema } from "@/lib/portalPasswordResetSchema";
import type { PortalVariant } from "@/lib/portalVariant";

const PROFILE_EXTRAS_SERVICE_SLUG = "profile";

function mustSecret() {
  const secret = (process.env.NEXTAUTH_SECRET || "").trim();
  if (!secret) throw new Error("Server misconfigured");
  return secret;
}

function safeOneLine(s: string) {
  return String(s || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateNumericCode(len = 6) {
  const digits = "0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += digits[Math.floor(Math.random() * digits.length)];
  }
  return out;
}

export function hashResetCode(code: string) {
  const secret = mustSecret();
  return crypto.createHash("sha256").update(`${secret}:portal_reset:${code}`).digest("hex");
}

export async function getPortalUserPhoneE164(userId: string): Promise<string | null> {
  const row = await prisma.portalServiceSetup.findUnique({
    where: { ownerId_serviceSlug: { ownerId: userId, serviceSlug: PROFILE_EXTRAS_SERVICE_SLUG } },
    select: { dataJson: true },
  });

  const rec =
    row?.dataJson && typeof row.dataJson === "object" && !Array.isArray(row.dataJson)
      ? (row.dataJson as Record<string, unknown>)
      : null;

  const raw = rec?.phone;
  if (typeof raw !== "string") return null;
  const parsed = normalizePhoneStrict(raw);
  return parsed.ok ? parsed.e164 : null;
}

export async function createAndSendPortalPasswordResetCode(opts: {
  email: string;
  variant?: PortalVariant;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const email = safeOneLine(opts.email).toLowerCase();
  if (!email || !email.includes("@")) return { ok: true };

  const expectedVariant = opts.variant || "portal";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return { ok: true };

  const uv = (user as any).clientPortalVariant ? String((user as any).clientPortalVariant) : "PORTAL";
  if (uv !== (expectedVariant === "credit" ? "CREDIT" : "PORTAL")) return { ok: true };

  // Only portal-capable accounts
  if (user.role !== "CLIENT" && user.role !== "ADMIN") return { ok: true };

  await ensurePortalPasswordResetSchema();

  // Rate limit: at most one code per 60 seconds per user.
  try {
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "createdAt" FROM "PortalPasswordResetCode" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      user.id,
    );
    const lastCreatedAt = existing?.[0]?.createdAt ? new Date(existing[0].createdAt) : null;
    if (lastCreatedAt && Date.now() - lastCreatedAt.getTime() < 60_000) {
      return { ok: true };
    }
  } catch {
    // ignore rate-limit failures
  }

  // Invalidate any previously-unused codes.
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "PortalPasswordResetCode" SET "usedAt" = CURRENT_TIMESTAMP WHERE "userId" = $1 AND "usedAt" IS NULL`,
      user.id,
    );
  } catch {
    // ignore
  }

  const code = generateNumericCode(6);
  const codeHash = hashResetCode(code);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const id = crypto.randomUUID();

  await prisma.$executeRawUnsafe(
    `INSERT INTO "PortalPasswordResetCode" ("id", "userId", "codeHash", "expiresAt") VALUES ($1, $2, $3, $4)`,
    id,
    user.id,
    codeHash,
    expiresAt,
  );

  const subject = "Your Purely Automation password reset code";
  const body = [
    `Hi ${user.name || "there"},`,
    "",
    "Use this one-time code to reset your password:",
    "",
    code,
    "",
    "This code expires in 15 minutes.",
    "",
    "If you didn’t request this, you can ignore this message.",
  ].join("\n");

  // Best-effort email
  await trySendTransactionalEmail({
    to: user.email,
    subject,
    text: body,
    fromName: "Purely Automation",
  }).catch(() => null);

  // Best-effort SMS (only if phone configured)
  const phone = await getPortalUserPhoneE164(user.id).catch(() => null);
  if (phone) {
    const smsBody = `Purely Automation code: ${code} (expires in 15 min)`;
    await sendTwilioEnvSms({ to: phone, body: smsBody, fromNumberEnvKeys: ["TWILIO_FROM_NUMBER"] }).catch(() => null);
  }

  return { ok: true };
}

export async function resetPortalPasswordWithCode(opts: {
  email: string;
  code: string;
  newPassword: string;
  variant?: PortalVariant;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const email = safeOneLine(opts.email).toLowerCase();
  const code = safeOneLine(opts.code);
  const newPassword = String(opts.newPassword || "");

  const expectedVariant = opts.variant || "portal";

  if (!email || !email.includes("@")) return { ok: false, reason: "Invalid request" };
  if (!code || code.length < 4 || code.length > 12) return { ok: false, reason: "Invalid code" };
  if (newPassword.length < 8) return { ok: false, reason: "Password must be at least 8 characters" };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return { ok: false, reason: "Invalid code" };

  const uv = (user as any).clientPortalVariant ? String((user as any).clientPortalVariant) : "PORTAL";
  if (uv !== (expectedVariant === "credit" ? "CREDIT" : "PORTAL")) return { ok: false, reason: "Invalid code" };
  if (user.role !== "CLIENT" && user.role !== "ADMIN") return { ok: false, reason: "Invalid code" };

  await ensurePortalPasswordResetSchema();

  const now = new Date();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
SELECT "id", "codeHash", "expiresAt", "attemptCount"
FROM "PortalPasswordResetCode"
WHERE "userId" = $1 AND "usedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT 1
    `.trim(),
    user.id,
  );

  const row = rows?.[0];
  if (!row?.id || !row.codeHash || !row.expiresAt) return { ok: false, reason: "Invalid code" };

  const expiresAt = new Date(row.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: "Code expired" };
  }

  const expected = String(row.codeHash);
  const got = hashResetCode(code);
  const attemptCount = Number(row.attemptCount || 0);

  if (got !== expected) {
    const nextAttempts = attemptCount + 1;
    await prisma.$executeRawUnsafe(
      `UPDATE "PortalPasswordResetCode" SET "attemptCount" = $2 WHERE "id" = $1`,
      String(row.id),
      nextAttempts,
    ).catch(() => null);

    if (nextAttempts >= 8) {
      await prisma.$executeRawUnsafe(`UPDATE "PortalPasswordResetCode" SET "usedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, String(row.id)).catch(() => null);
    }

    return { ok: false, reason: "Invalid code" };
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.$executeRawUnsafe(`UPDATE "PortalPasswordResetCode" SET "usedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, String(row.id)) as any,
  ]);

  return { ok: true };
}
