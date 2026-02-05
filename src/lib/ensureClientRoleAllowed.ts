import type { PrismaClient } from "@prisma/client";

function toMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

export function isClientRoleMissingError(err: unknown) {
  const msg = toMessage(err).toLowerCase();
  return (
    msg.includes("invalid input value for enum") && msg.includes("client")
  );
}

/**
 * Best-effort DB fix for environments where the Role enum was created
 * before CLIENT existed. Safe to call repeatedly.
 */
export async function ensureClientRoleAllowed(prisma: PrismaClient) {
  // This only applies to Postgres when Role is a native enum.
  // If the DB uses TEXT or already includes CLIENT, this will no-op or throw and be ignored.
  try {
    await prisma.$executeRawUnsafe('ALTER TYPE "Role" ADD VALUE \'CLIENT\'');
  } catch (e) {
    const msg = toMessage(e).toLowerCase();
    // ignore "already exists" and "type does not exist" and transaction restrictions
    if (
      msg.includes("already exists") ||
      msg.includes("duplicate") ||
      msg.includes("does not exist") ||
      msg.includes("cannot run inside a transaction")
    ) {
      return;
    }
    // Re-throw unknown errors so callers can surface them.
    throw e;
  }
}
