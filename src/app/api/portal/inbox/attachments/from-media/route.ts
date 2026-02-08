import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const postSchema = z.object({
  mediaItemId: z.string().min(1),
});

export async function POST(req: Request) {
  const auth = await requireClientSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const mediaItemId = String(parsed.data.mediaItemId);

  const media = await (prisma as any).portalMediaItem.findFirst({
    where: { id: mediaItemId, ownerId },
    select: { fileName: true, mimeType: true, fileSize: true, bytes: true },
  });

  if (!media) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const publicToken = crypto.randomUUID().replace(/-/g, "");
  const row = await (prisma as any).portalInboxAttachment.create({
    data: {
      ownerId,
      messageId: null,
      fileName: String(media.fileName || "attachment").slice(0, 200),
      mimeType: String(media.mimeType || "application/octet-stream").slice(0, 120),
      fileSize: Number(media.fileSize || (media.bytes?.length ?? 0)),
      bytes: media.bytes as Buffer,
      publicToken,
    },
    select: { id: true, fileName: true, mimeType: true, fileSize: true, publicToken: true },
  });

  return NextResponse.json({
    ok: true,
    attachment: {
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      fileSize: row.fileSize,
      url: `/api/public/inbox/attachment/${row.id}/${row.publicToken}`,
    },
  });
}
