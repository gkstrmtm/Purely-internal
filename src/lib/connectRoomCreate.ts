import crypto from "crypto";
import { Prisma } from "@prisma/client";

import { ensureConnectSchema } from "@/lib/connectSchema";
import { prisma } from "@/lib/db";

function generateRoomId(len = 5) {
  // URL-safe, lowercase, avoids ambiguous chars (0/O/1/I/l).
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export async function createConnectRoom(opts?: {
  title?: string | null;
  createdByUserId?: string | null;
  idLength?: number;
  maxAttempts?: number;
}): Promise<{ roomId: string }> {
  await ensureConnectSchema();

  const title = opts?.title?.trim() ? opts?.title!.trim() : null;
  const createdByUserId = opts?.createdByUserId ?? null;
  const idLength = opts?.idLength ?? 5;
  const maxAttempts = opts?.maxAttempts ?? 12;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const id = generateRoomId(idLength);
    try {
      const room = await prisma.connectRoom.create({
        data: {
          id,
          title,
          createdByUserId,
        },
        select: { id: true },
      });
      return { roomId: room.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }

  throw new Error("Failed to allocate room id");
}
