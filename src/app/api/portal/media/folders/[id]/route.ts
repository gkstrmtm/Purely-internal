import { NextResponse } from "next/server";
import { z } from "zod";

import { requireClientSession } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { normalizeNameKey } from "@/lib/portalMedia";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  parentId: z.string().min(1).optional().nullable(),
  color: z.string().min(1).max(32).optional().nullable(),
});

function sanitizeName(raw: string) {
  return String(raw || "")
    .replace(/[\r\n\t\0]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

async function wouldCreateCycle(ownerId: string, folderId: string, nextParentId: string) {
  // Walk up parents to ensure we don't point at our own descendant.
  let curId: string | null = nextParentId;
  for (let i = 0; i < 64; i++) {
    if (!curId) return false;
    if (curId === folderId) return true;

    // eslint-disable-next-line no-await-in-loop
    const row: { parentId: string | null } | null = await (prisma as any).portalMediaFolder.findFirst({
      where: { id: curId, ownerId },
      select: { parentId: true },
    });
    if (!row) return false;
    curId = row.parentId;
  }
  return true;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireClientSession();
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  const ownerId = auth.session.user.id;
  const { id } = await params;

  const existing = await (prisma as any).portalMediaFolder.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });

  const data: Record<string, unknown> = {};

  if (parsed.data.name !== undefined) {
    const nextName = sanitizeName(parsed.data.name);
    if (!nextName) return NextResponse.json({ ok: false, error: "Invalid folder name" }, { status: 400 });
    data.name = nextName;
    data.nameKey = normalizeNameKey(nextName);
  }

  if (parsed.data.parentId !== undefined) {
    const nextParentId = parsed.data.parentId ? String(parsed.data.parentId) : null;

    if (nextParentId === id) {
      return NextResponse.json({ ok: false, error: "Folder cannot be its own parent" }, { status: 400 });
    }

    if (nextParentId) {
      const parent = await (prisma as any).portalMediaFolder.findFirst({ where: { id: nextParentId, ownerId }, select: { id: true } });
      if (!parent) return NextResponse.json({ ok: false, error: "Parent folder not found" }, { status: 404 });

      const cycle = await wouldCreateCycle(ownerId, id, nextParentId);
      if (cycle) return NextResponse.json({ ok: false, error: "Invalid parent (cycle)" }, { status: 400 });
    }

    data.parentId = nextParentId;
  }

  if (parsed.data.color !== undefined) {
    const c = parsed.data.color ? String(parsed.data.color).trim().slice(0, 32) : null;
    data.color = c;
  }

  if (!Object.keys(data).length) return NextResponse.json({ ok: true });

  await (prisma as any).portalMediaFolder.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
