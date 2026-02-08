import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z.object({
  fileName: z.string().min(1).max(200).optional(),
  folderId: z.string().min(1).optional().nullable(),
});

function sanitizeName(raw: string) {
  return String(raw || "")
    .replace(/[\r\n\t\0]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClientSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const existing = await (prisma as any).portalMediaItem.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const nextFolderId = parsed.data.folderId === undefined ? undefined : parsed.data.folderId ? String(parsed.data.folderId) : null;
  if (nextFolderId) {
    const folder = await (prisma as any).portalMediaFolder.findFirst({ where: { id: nextFolderId, ownerId }, select: { id: true } });
    if (!folder) return NextResponse.json({ ok: false, error: "Folder not found" }, { status: 404 });
  }

  const nextFileName = parsed.data.fileName === undefined ? undefined : sanitizeName(parsed.data.fileName);
  if (parsed.data.fileName !== undefined && !nextFileName) {
    return NextResponse.json({ ok: false, error: "Invalid file name" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (nextFileName !== undefined) data.fileName = nextFileName;
  if (nextFolderId !== undefined) data.folderId = nextFolderId;
  if (!Object.keys(data).length) return NextResponse.json({ ok: true });

  await (prisma as any).portalMediaItem.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireClientSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const { id } = await params;

  const existing = await (prisma as any).portalMediaItem.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  await (prisma as any).portalMediaItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
