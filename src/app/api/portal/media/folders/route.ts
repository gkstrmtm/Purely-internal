import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSessionForService } from "@/lib/portalAccess";
import { prisma } from "@/lib/db";
import { newPublicToken, newTag, normalizeNameKey } from "@/lib/portalMedia";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const rows = await (prisma as any).portalMediaFolder.findMany({
    where: { ownerId },
    orderBy: [{ nameKey: "asc" }],
    select: { id: true, parentId: true, name: true, tag: true, color: true, createdAt: true },
    take: 5000,
  });

  return NextResponse.json({
    ok: true,
    folders: rows.map((r: any) => ({
      id: r.id,
      parentId: r.parentId,
      name: r.name,
      tag: r.tag,
      color: r.color ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

const postSchema = z.object({
  parentId: z.string().min(1).optional().nullable(),
  name: z.string().min(1).max(120),
  color: z.string().min(1).max(32).optional().nullable(),
});

export async function POST(req: Request) {
  const auth = await requireClientSessionForService("media");
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parentId = parsed.data.parentId ? String(parsed.data.parentId) : null;
  const name = String(parsed.data.name).trim();
  const color = parsed.data.color ? String(parsed.data.color).trim().slice(0, 32) : null;

  if (parentId) {
    const parent = await (prisma as any).portalMediaFolder.findFirst({ where: { id: parentId, ownerId }, select: { id: true } });
    if (!parent) return NextResponse.json({ ok: false, error: "Parent folder not found" }, { status: 404 });
  }

  // Generate a tag that is unique per owner.
  let tag = newTag();
  for (let i = 0; i < 5; i++) {
    const exists = await (prisma as any).portalMediaFolder.findFirst({ where: { ownerId, tag }, select: { id: true } });
    if (!exists) break;
    tag = newTag();
  }

  const row = await (prisma as any).portalMediaFolder.create({
    data: {
      ownerId,
      parentId,
      name,
      nameKey: normalizeNameKey(name),
      tag,
      publicToken: newPublicToken(),
      color,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, folderId: row.id });
}
